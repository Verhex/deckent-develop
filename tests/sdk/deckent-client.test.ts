/**
 * tests/sdk/deckent-client.test.ts
 *
 * Sprint 360 Task 360-012 (fix pass) — F2-008-SDK-1 embeddable SDK round-trip.
 *
 * Hermetic tmpdir-project fixtures per test (ADR-D-002 C1/C2): no real
 * `.deckent`/`.brain` developer state is read, and the `limits()` spawn is
 * always injected — the real `claude` binary is never invoked.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createDeckentClient } from '../../src/sdk/index.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { SpawnImpl, SpawnedProcessLike } from '../../src/core/limit-preflight.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeTmpProject(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function fixtureTask(id: string, status: string): Record<string, unknown> {
  return {
    id,
    title: `Fixture ${id}`,
    description: 'fixture task for SDK status() round-trip',
    model: 'sonnet',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test fixture',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'x', noGoCriteria: 'y', techDebtAcceptable: 'z' },
    status,
  };
}

// Mirrors tests/core/limit-preflight.test.ts's hermetic spawn mock — an
// EventEmitter-based fake child process, no real `claude` binary is invoked.
function makeUsageSpawn(stdout: string): ReturnType<typeof vi.fn<SpawnImpl>> {
  return vi.fn<SpawnImpl>((_command, _args) => {
    const child = new EventEmitter() as EventEmitter & SpawnedProcessLike;
    child.stdout = Readable.from([stdout]);
    child.stderr = Readable.from(['']);
    child.kill = vi.fn(() => true);
    process.nextTick(() => child.emit('close', 0, null));
    return child;
  });
}

// ─── status() ────────────────────────────────────────────────────────────

describe('createDeckentClient().status()', () => {
  it('reads sprintId, dashboard, and tasks from a populated project', async () => {
    const root = makeTmpProject('deckent-sdk-status-');
    try {
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(
        join(root, '.deckent', 'sprint-state.json'),
        JSON.stringify({ sprintId: 'sprint-999' }),
      );
      writeFileSync(
        join(root, '.dashboard'),
        JSON.stringify({
          sprint: { id: 'sprint-999', number: 999, phase: 'EXECUTE', status: 'ACTIVE' },
          agents: [],
          progress: { done: 1, active: 1, blocked: 0, total: 2 },
          alerts: [],
          updatedAt: '2026-07-02T00:00:00.000Z',
        }),
      );
      mkdirSync(join(root, '.tasks'), { recursive: true });
      writeFileSync(join(root, '.tasks', 'task-fixture-1.json'), JSON.stringify(fixtureTask('fixture-1', 'DONE')));
      writeFileSync(join(root, '.tasks', 'task-fixture-2.json'), JSON.stringify(fixtureTask('fixture-2', 'EXECUTING')));
      // non-task sidecar file — must NOT be parsed as a task
      writeFileSync(join(root, '.tasks', 'task-fixture-1.hb'), '{"not":"a task"}');

      const client = createDeckentClient({ projectRoot: root });
      const status = await client.status();

      expect(status.projectRoot).toBe(root);
      expect(status.sprintId).toBe('sprint-999');
      expect(status.dashboard?.sprint.id).toBe('sprint-999');
      expect(status.tasks).toHaveLength(2);
      expect(status.taskCounts).toEqual({ DONE: 1, EXECUTING: 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns sprintId null / dashboard null / tasks [] for an empty project (no throw)', async () => {
    const root = makeTmpProject('deckent-sdk-status-empty-');
    try {
      const client = createDeckentClient({ projectRoot: root });
      const status = await client.status();

      expect(status.sprintId).toBeNull();
      expect(status.dashboard).toBeNull();
      expect(status.tasks).toEqual([]);
      expect(status.taskCounts).toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── memoryQuery() ───────────────────────────────────────────────────────

describe('createDeckentClient().memoryQuery()', () => {
  it('returns matching entries from .brain/memory.db', async () => {
    const root = makeTmpProject('deckent-sdk-memory-');
    try {
      mkdirSync(join(root, '.brain'), { recursive: true });
      const store = new MemoryStore(join(root, '.brain', 'memory.db'));
      store.insert({
        id: 'adr-sdk-1',
        type: 'adr',
        title: 'SDK embeddable client',
        content: 'The embeddable SDK exposes status/memoryQuery/planStructured/limits.',
        status: 'accepted',
      });
      store.close();

      const client = createDeckentClient({ projectRoot: root });
      const results = await client.memoryQuery('embeddable');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.entry.id).toBe('adr-sdk-1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns [] without throwing when no memory DB exists', async () => {
    const root = makeTmpProject('deckent-sdk-memory-empty-');
    try {
      const client = createDeckentClient({ projectRoot: root });
      await expect(client.memoryQuery('anything')).resolves.toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── planStructured() ────────────────────────────────────────────────────

describe('createDeckentClient().planStructured()', () => {
  it('parses directives text into structured tasks without writing to disk', async () => {
    const root = makeTmpProject('deckent-sdk-plan-');
    try {
      const client = createDeckentClient({ projectRoot: root });
      const directivesText = `## Görev 1: First Task
- Dosya: src/core/utils.ts
- Kapsam: src/core/

## Görev 2: Second Task
- Dosya: src/orchestra/brain.ts
- Kapsam: src/orchestra/
`;
      const tasks = await client.planStructured(directivesText);

      expect(tasks).toHaveLength(2);
      expect(tasks[0]?.title).toBe('First Task');
      expect(tasks[0]?.scope.filesWrite).toContain('src/core/utils.ts');
      expect(tasks[1]?.title).toBe('Second Task');
      // dry-plan: nothing was written under the (otherwise empty) project root
      expect(existsSync(join(root, '.tasks'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── limits() ────────────────────────────────────────────────────────────

describe('createDeckentClient().limits()', () => {
  it('probes + gates usage via an injected spawnImpl — never spawns the real claude binary', async () => {
    const root = makeTmpProject('deckent-sdk-limits-');
    try {
      const fixture =
        'Current session: 91% used · resets Jul 2, 8:30pm (Europe/Istanbul)\n' +
        'Current week (all models): 31% used · resets Jul 6, 12:00am (Europe/Istanbul)\n';
      const spawnImpl = makeUsageSpawn(fixture);

      const client = createDeckentClient({ projectRoot: root });
      const result = await client.limits({ probeOptions: { spawnImpl } });

      expect(result.probe.unavailable).toBe(false);
      if (!result.probe.unavailable) {
        expect(result.probe.sessionPct).toBe(91);
      }
      expect(result.gate.verdict).toBe('block');
      expect(spawnImpl).toHaveBeenCalledTimes(1);
      expect(spawnImpl.mock.calls[0]?.[0]).toBe('claude');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('respects custom thresholds', async () => {
    const root = makeTmpProject('deckent-sdk-limits-thresholds-');
    try {
      const fixture =
        'Current session: 50% used · resets Jul 2, 8:30pm (Europe/Istanbul)\n' +
        'Current week (all models): 20% used · resets Jul 6, 12:00am (Europe/Istanbul)\n';
      const spawnImpl = makeUsageSpawn(fixture);

      const client = createDeckentClient({ projectRoot: root });
      const result = await client.limits({
        probeOptions: { spawnImpl },
        thresholds: { warnPct: 40, blockPct: 80 },
      });

      expect(result.gate.verdict).toBe('warn');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
