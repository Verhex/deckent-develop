// tests/orchestra/autonomous/post-item-lifecycle.test.ts
//
// CORE-UNIFORMITY (slice 2): mode-independent post-item lifecycle hook.
// Verifies that an autonomous backlog item, once terminal, runs the per-item
// analogue of sprint-finalizer's end-of-sprint hygiene:
//   (a) artifact cleanup (task-run-* / _*.pid)
//   (b) backlog purge (trim completed, keep recent)
//   (c) decay is invoked (mode-independent), fail-safe, idempotent
// plus the dispatcher integration: two consecutive items leave no .tasks leakage.
//
// Hermetic: all I/O under os.tmpdir(); the decay step is injected as a stub so no
// memory.db / heavy finalizer load is required.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  postItemLifecycle,
  makeExecuteDispatcher,
} from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import { createDefaultRegistry } from '../../../src/core/capability-broker.js';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry, BacklogFile, BacklogStatus } from '../../../src/orchestra/autonomous/backlog-types.js';

// ─── Tmpdir management ───────────────────────────────────────────────

let tmpDir: string;
let tasksDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `post-item-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tasksDir = join(tmpDir, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
});
afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Helpers ─────────────────────────────────────────────────────────

/** Seed a leaked autonomous artifact set + a legitimate task file that must survive. */
function seedArtifacts(): void {
  writeFileSync(join(tasksDir, 'task-run-001.json'), '{}', 'utf-8');
  writeFileSync(join(tasksDir, 'task-run-002.result'), '{}', 'utf-8');
  writeFileSync(join(tasksDir, '_worker.pid'), '12345', 'utf-8');
  // Legitimate, non-artifact file — must NOT be removed.
  writeFileSync(join(tasksDir, 'task-100.json'), '{}', 'utf-8');
}

function backlogEntry(id: string, status: BacklogStatus, lastRun: string | null): BacklogEntry {
  return {
    id, title: id, kind: 'task', spec: { description: 'x' },
    policy: 'auto', trigger: { type: 'one-off' },
    status, lastRun, lastResult: status === 'done' ? { ok: true, reason: 'ok' } : null,
  };
}

function writeBacklog(entries: BacklogEntry[]): string {
  const bl: BacklogFile = { _version: '1.0', entries };
  const path = join(tmpDir, 'backlog.json');
  writeFileSync(path, JSON.stringify(bl, null, 2), 'utf-8');
  return path;
}

const capabilityEntry: BacklogEntry = {
  id: 'cap', title: 'cap', kind: 'capability',
  spec: { capabilityTarget: { capability: 'echo', args: { ping: 'pong' } } },
  policy: 'auto', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
};

// ─── (a) artifact cleanup ────────────────────────────────────────────

describe('postItemLifecycle — (a) artifact cleanup', () => {
  it('removes task-run-* and _*.pid artifacts but keeps legitimate task files', async () => {
    seedArtifacts();
    const backlogPath = writeBacklog([backlogEntry('e', 'done', '2026-06-18T00:00:00.000Z')]);
    const decay = vi.fn();

    await postItemLifecycle({ projectRoot: tmpDir, backlogPath, config: {} as never, runBudgetedDecay: decay });

    const remaining = readdirSync(tasksDir);
    expect(remaining).not.toContain('task-run-001.json');
    expect(remaining).not.toContain('task-run-002.result');
    expect(remaining).not.toContain('_worker.pid');
    expect(remaining).toContain('task-100.json'); // legitimate file survives
    expect(decay).toHaveBeenCalledTimes(1);
  });

  it('preserves the just-completed run via keepTaskId, sweeping only prior-run artifacts', async () => {
    // Current run (run-2) — its .result carries the Brain-assessment writeback, must survive.
    writeFileSync(join(tasksDir, 'task-run-2.result'), '{}', 'utf-8');
    writeFileSync(join(tasksDir, 'task-run-2.json'), '{}', 'utf-8');
    // Prior, stale run (run-1) + a stale pid — must be swept.
    writeFileSync(join(tasksDir, 'task-run-1.result'), '{}', 'utf-8');
    writeFileSync(join(tasksDir, '_run-1.pid'), '1', 'utf-8');
    const backlogPath = writeBacklog([backlogEntry('e', 'done', '2026-06-18T00:00:00.000Z')]);

    await postItemLifecycle({
      projectRoot: tmpDir, backlogPath, config: {} as never,
      keepTaskId: 'run-2', runBudgetedDecay: vi.fn(),
    });

    const remaining = readdirSync(tasksDir).sort();
    expect(remaining).toContain('task-run-2.result'); // current run kept
    expect(remaining).toContain('task-run-2.json');
    expect(remaining).not.toContain('task-run-1.result'); // stale prior run swept
    expect(remaining).not.toContain('_run-1.pid');
  });

  it('is idempotent — a second run against the cleaned state is a no-op (no throw)', async () => {
    seedArtifacts();
    const backlogPath = writeBacklog([backlogEntry('e', 'done', '2026-06-18T00:00:00.000Z')]);
    const decay = vi.fn();
    const deps = { projectRoot: tmpDir, backlogPath, config: {} as never, runBudgetedDecay: decay };

    await postItemLifecycle(deps);
    await expect(postItemLifecycle(deps)).resolves.toBeUndefined();
    expect(readdirSync(tasksDir)).toEqual(['task-100.json']);
  });
});

// ─── (b) backlog purge ───────────────────────────────────────────────

describe('postItemLifecycle — (b) backlog purge', () => {
  it('trims completed entries to the most recent 5, keeping active entries', async () => {
    const completed = Array.from({ length: 7 }, (_, i) =>
      backlogEntry(`done-${i}`, 'done', `2026-06-18T00:0${i}:00.000Z`));
    const pending = backlogEntry('pending-1', 'pending', null);
    const backlogPath = writeBacklog([...completed, pending]);

    await postItemLifecycle({
      projectRoot: tmpDir, backlogPath, config: {} as never, runBudgetedDecay: vi.fn(),
    });

    const after = loadBacklog(backlogPath);
    const completedAfter = after.entries.filter((e) => e.status === 'done');
    const pendingAfter = after.entries.filter((e) => e.status === 'pending');
    expect(completedAfter).toHaveLength(5);            // keepRuns default
    expect(pendingAfter).toHaveLength(1);              // active never purged
    // The 5 kept are the most-recent by lastRun (done-2 … done-6).
    expect(completedAfter.map((e) => e.id).sort()).toEqual(['done-2', 'done-3', 'done-4', 'done-5', 'done-6']);
  });
});

// ─── fail-safe ───────────────────────────────────────────────────────

describe('postItemLifecycle — fail-safe', () => {
  it('a failing step (corrupt backlog) does not throw and does not block decay', async () => {
    seedArtifacts();
    // Corrupt backlog → loadBacklog throws inside the purge step.
    const backlogPath = join(tmpDir, 'backlog.json');
    writeFileSync(backlogPath, '{ not valid json', 'utf-8');
    const decay = vi.fn();

    await expect(
      postItemLifecycle({ projectRoot: tmpDir, backlogPath, config: {} as never, runBudgetedDecay: decay }),
    ).resolves.toBeUndefined();

    // cleanup still ran despite the purge failure...
    expect(readdirSync(tasksDir)).toEqual(['task-100.json']);
    // ...and decay still ran (steps are independent).
    expect(decay).toHaveBeenCalledTimes(1);
  });

  it('a throwing decay hook is swallowed (item outcome never corrupted)', async () => {
    const backlogPath = writeBacklog([backlogEntry('e', 'done', '2026-06-18T00:00:00.000Z')]);
    const decay = vi.fn(() => { throw new Error('decay boom'); });

    await expect(
      postItemLifecycle({ projectRoot: tmpDir, backlogPath, config: {} as never, runBudgetedDecay: decay }),
    ).resolves.toBeUndefined();
    expect(decay).toHaveBeenCalledTimes(1);
  });
});

// ─── dispatcher integration: two consecutive items, no leakage ───────

describe('execute-dispatcher — post-item lifecycle wired (no artifact leakage)', () => {
  it('two consecutive autonomous items leave no task-run-* / _*.pid leakage', async () => {
    const decay = vi.fn();
    const backlogPath = writeBacklog([capabilityEntry]);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), executeSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
      capabilityRegistry: createDefaultRegistry(),
      runBudgetedDecay: decay,
    });

    // Item 1: leak artifacts during the "run", then dispatch → hook must sweep them.
    seedArtifacts();
    const r1 = await handler('autonomous.execute', { entry: capabilityEntry });
    expect(r1.outcome).toBe('success');
    expect(readdirSync(tasksDir).filter((f) => f.startsWith('task-run-') || /^_.*\.pid$/.test(f))).toEqual([]);

    // Item 2: leak again, dispatch again → still no accumulation.
    seedArtifacts();
    const r2 = await handler('autonomous.execute', { entry: capabilityEntry });
    expect(r2.outcome).toBe('success');
    expect(readdirSync(tasksDir).filter((f) => f.startsWith('task-run-') || /^_.*\.pid$/.test(f))).toEqual([]);

    // Hook fired once per item.
    expect(decay).toHaveBeenCalledTimes(2);
  });
});
