/**
 * tests/sdk/deckent-client-sprint.test.ts
 *
 * Sprint 363 Task 363-006 — F2-008 dilim-2: sprint-yüzeyi round-trip for
 * `startSprintDetached()` / `getSprintResults()` / `getRetro()`.
 *
 * Hermetic tmpdir-project fixtures per test (ADR-D-002 C1/C2): no real
 * `.deckent`/`.brain` developer state is read, and `startSprintDetached()`'s
 * spawn is always injected — the real `deckent`/node binary is never invoked.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDeckentClient } from '../../src/sdk/deckent-client.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { DetachedChildHandle, DetachedSpawnFn } from '../../src/cli/helpers/detached-start.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeTmpProject(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function fixtureTask(id: string, title: string): Record<string, unknown> {
  return {
    id,
    title,
    description: 'fixture task for SDK sprint-surface round-trip',
    model: 'sonnet',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test fixture',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'x', noGoCriteria: 'y', techDebtAcceptable: 'z' },
    status: 'DONE',
  };
}

function fixtureResult(taskId: string): Record<string, unknown> {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/fixture.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'fixture result',
  };
}

function fakeSpawnFn(pid: number | undefined): { spawnFn: DetachedSpawnFn; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const handle: DetachedChildHandle = { pid, unref: () => {} };
  const spawnFn: DetachedSpawnFn = (command, args, options) => {
    calls.push([command, args, options]);
    return handle;
  };
  return { spawnFn, calls };
}

// ─── startSprintDetached() ─────────────────────────────────────────────

describe('createDeckentClient().startSprintDetached()', () => {
  it('spawns `deckent start` via the injected spawnFn and returns pid + logPath — never a real subprocess', async () => {
    const root = makeTmpProject('deckent-sdk-start-');
    try {
      const { spawnFn, calls } = fakeSpawnFn(4321);
      const client = createDeckentClient({ projectRoot: root });

      const result = await client.startSprintDetached({ spawnFn });

      expect(result.pid).toBe(4321);
      expect(existsSync(result.logPath)).toBe(true);
      expect(calls).toHaveLength(1);
      const [, args, options] = calls[0] as [string, string[], { cwd: string; detached: boolean }];
      expect(args.slice(1)).toEqual(['start']);
      expect(options.cwd).toBe(root);
      expect(options.detached).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('builds argv from options: autoApprove/sandbox/force/dryRun/timeoutMs', async () => {
    const root = makeTmpProject('deckent-sdk-start-opts-');
    try {
      const { spawnFn, calls } = fakeSpawnFn(1);
      const client = createDeckentClient({ projectRoot: root });

      await client.startSprintDetached({
        autoApprove: true,
        sandbox: true,
        force: true,
        dryRun: true,
        timeoutMs: 60000,
        spawnFn,
      });

      const [, args] = calls[0] as [string, string[]];
      expect(args.slice(1)).toEqual([
        'start',
        '--auto-approve',
        '--sandbox',
        '--force',
        '--dry-run',
        '--timeout',
        '60000',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns pid: null when the child handle reports no pid', async () => {
    const root = makeTmpProject('deckent-sdk-start-nopid-');
    try {
      const { spawnFn } = fakeSpawnFn(undefined);
      const client = createDeckentClient({ projectRoot: root });

      const result = await client.startSprintDetached({ spawnFn });

      expect(result.pid).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── getSprintResults() ──────────────────────────────────────────────────

describe('createDeckentClient().getSprintResults()', () => {
  it('reads tasks + results from the live .tasks/ dir (source: live)', async () => {
    const root = makeTmpProject('deckent-sdk-results-live-');
    try {
      mkdirSync(join(root, '.tasks'), { recursive: true });
      writeFileSync(
        join(root, '.tasks', 'task-363-001.json'),
        JSON.stringify(fixtureTask('363-001', 'Fixture task one')),
      );
      writeFileSync(
        join(root, '.tasks', 'task-363-001.result'),
        JSON.stringify(fixtureResult('363-001')),
      );
      // A different sprint's task file must NOT be picked up.
      writeFileSync(
        join(root, '.tasks', 'task-364-001.json'),
        JSON.stringify(fixtureTask('364-001', 'Other sprint task')),
      );

      const client = createDeckentClient({ projectRoot: root });
      const results = await client.getSprintResults('sprint-363');

      expect(results.sprintId).toBe('sprint-363');
      expect(results.source).toBe('live');
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0]?.id).toBe('363-001');
      expect(results.results).toHaveLength(1);
      expect(results.results[0]?.taskId).toBe('363-001');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to .brain/archive/<sprintId>-tasks/ when .tasks/ has nothing for that sprint (source: archive)', async () => {
    const root = makeTmpProject('deckent-sdk-results-archive-');
    try {
      const archiveDir = join(root, '.brain', 'archive', 'sprint-363-tasks');
      mkdirSync(archiveDir, { recursive: true });
      writeFileSync(
        join(archiveDir, 'task-363-002.json'),
        JSON.stringify(fixtureTask('363-002', 'Archived fixture task')),
      );
      writeFileSync(
        join(archiveDir, 'task-363-002.result'),
        JSON.stringify(fixtureResult('363-002')),
      );

      const client = createDeckentClient({ projectRoot: root });
      const results = await client.getSprintResults('sprint-363');

      expect(results.source).toBe('archive');
      expect(results.tasks).toHaveLength(1);
      expect(results.tasks[0]?.id).toBe('363-002');
      expect(results.results).toHaveLength(1);
      expect(results.results[0]?.taskId).toBe('363-002');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns empty arrays and source: none when neither location has files (no throw)', async () => {
    const root = makeTmpProject('deckent-sdk-results-none-');
    try {
      const client = createDeckentClient({ projectRoot: root });
      const results = await client.getSprintResults('sprint-999');

      expect(results.source).toBe('none');
      expect(results.tasks).toEqual([]);
      expect(results.results).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── getRetro() ────────────────────────────────────────────────────────

describe('createDeckentClient().getRetro()', () => {
  it('returns the retro-<sprintId> entry from .brain/memory.db', async () => {
    const root = makeTmpProject('deckent-sdk-retro-');
    try {
      mkdirSync(join(root, '.brain'), { recursive: true });
      const store = new MemoryStore(join(root, '.brain', 'memory.db'));
      store.insert({
        id: 'retro-sprint-363',
        type: 'retro',
        title: 'Sprint sprint-363 Retrospective',
        content: '# Sprint sprint-363 Retrospective\n\nCompleted 14/14 tasks.',
        source: 'brain',
        sprint_id: 'sprint-363',
      });
      store.close();

      const client = createDeckentClient({ projectRoot: root });
      const retro = await client.getRetro('sprint-363');

      expect(retro).not.toBeNull();
      expect(retro?.id).toBe('retro-sprint-363');
      expect(retro?.content).toContain('Completed 14/14 tasks');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null without throwing when no memory DB exists', async () => {
    const root = makeTmpProject('deckent-sdk-retro-empty-');
    try {
      const client = createDeckentClient({ projectRoot: root });
      await expect(client.getRetro('sprint-1')).resolves.toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null when the DB exists but has no matching retro entry', async () => {
    const root = makeTmpProject('deckent-sdk-retro-missing-');
    try {
      mkdirSync(join(root, '.brain'), { recursive: true });
      const store = new MemoryStore(join(root, '.brain', 'memory.db'));
      store.insert({
        id: 'retro-sprint-1',
        type: 'retro',
        title: 'Sprint sprint-1 Retrospective',
        content: 'unrelated sprint',
        source: 'brain',
        sprint_id: 'sprint-1',
      });
      store.close();

      const client = createDeckentClient({ projectRoot: root });
      const retro = await client.getRetro('sprint-2');

      expect(retro).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
