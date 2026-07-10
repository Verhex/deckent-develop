/**
 * Sprint-280 deadlock history + born-610 SINGLE-TRUTH re-pin.
 *
 * Sprint-280: an MRR upstream deadlocked its dependents (satisfy-set was
 * DONE-only and nothing else resolved MRR) — the then-fix counted MRR as
 * dependency-SATISFYING. born-610 (Alperen, 2026-07-10) reversed that: MRR is
 * UNVERIFIED partial work, never a foundation — dependents are cascade-skipped
 * by cascadeSkipDeadBlocked (scheduler-truth.ts is the single vocabulary).
 * The deadlock stays solved from the other direction: nothing waits forever.
 * These tests now pin the NEW contract; the EXECUTING/DONE regression guards
 * are unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';

function makeBackend(): SpawnBackend & { spawned: string[] } {
  const spawned: string[] = [];
  return {
    name: 'mock-mrr',
    spawn(taskId: string, _m: ModelType, _p: string, _o?: SpawnBackendOptions) { spawned.push(taskId); },
    kill() { /* no-op */ },
    list() { return spawned; },
    isAvailable() { return Promise.resolve(true); },
    spawned,
  };
}

function task(id: string, status: TaskStatus, dependencies: string[] = []): Task {
  return {
    id, title: `Task ${id}`, description: `mrr-unblock ${id}`,
    model: 'sonnet' as ModelType, effort: 'normal', priority: 'NORMAL', reason: 'mrr-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/mrr-${id}.ts`] },
    dependencies,
    goNogo: { goCriteria: 'x', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    status, sprintId: 'sprint-280', assignedAgent: 'generic', assignedSkills: [], provider: 'claude',
  } as unknown as Task;
}

function makeConfig(): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    dependency_pipeline_enabled: true,
    activeModeConfig: { max_workers: 8 },
    token_throttle_ms: 0,
    docker_timeout: 1200,
    timeout: {
      docker_min_timeout: 300, docker_max_timeout: 86400,
      tmux_min_timeout: 300, tmux_max_timeout: 86400,
      subprocess_min_timeout: 300, subprocess_max_timeout: 86400,
      effort_base: { low: 600, normal: 1200, high: 2400 },
      loc_scaling_enabled: false, history_scaling_enabled: false,
      runtime_extension_enabled: false, adaptive_multiplier: 1.0, runtime_extension_max: 0,
    },
  } as unknown as ResolvedConfig;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-280', number: 280, phase: 'EXECUTE' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'], tasks, startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

describe('respawnEligibleTasks — MANUAL_REVIEW_REQUIRED unblocks dependents (Sprint 280 FIX-deadlock)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mrr-unblock-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });
  afterEach(() => { if (existsSync(root)) rmSync(root, { recursive: true, force: true }); });

  function persist(tasks: Task[]): void {
    for (const t of tasks) {
      writeFileSync(join(root, '.tasks', `task-${t.id}.json`), JSON.stringify(t, null, 2), 'utf-8');
    }
  }

  async function run(sprint: Sprint, backend: SpawnBackend): Promise<string[]> {
    const orig = process.cwd();
    process.chdir(root);
    try { return await respawnEligibleTasks(root, sprint, makeConfig(), { spawnBackend: backend }); }
    finally { process.chdir(orig); }
  }

  it('born-610: dependent of a MANUAL_REVIEW_REQUIRED upstream is NOT spawned (single truth)', async () => {
    const upstream = task('280-007', TaskStatus.MANUAL_REVIEW_REQUIRED);
    const dependent = task('280-010', TaskStatus.PENDING, ['280-007']);
    persist([upstream, dependent]);
    const backend = makeBackend();

    const spawnedIds = await run(makeSprint([upstream, dependent]), backend);

    expect(backend.spawned).not.toContain('280-010');
    expect(spawnedIds).not.toContain('280-010');
  });

  it('dependent of a DONE upstream still dispatches (regression — DONE path preserved)', async () => {
    const upstream = task('280-001', TaskStatus.DONE);
    const dependent = task('280-005', TaskStatus.PENDING, ['280-001']);
    persist([upstream, dependent]);
    const backend = makeBackend();

    await run(makeSprint([upstream, dependent]), backend);

    expect(backend.spawned).toContain('280-005');
  });

  it('dependent of a STILL-RUNNING (EXECUTING) upstream stays blocked (regression guard)', async () => {
    const upstream = task('280-003', TaskStatus.EXECUTING);
    const dependent = task('280-008', TaskStatus.PENDING, ['280-003']);
    persist([upstream, dependent]);
    const backend = makeBackend();

    await run(makeSprint([upstream, dependent]), backend);

    expect(backend.spawned).not.toContain('280-008');
  });

  it('born-610 multi-dependent: NEITHER doc spawns on a shared MRR upstream (skip-path owns them)', async () => {
    const upstream = task('280-007', TaskStatus.MANUAL_REVIEW_REQUIRED);
    const docA = task('280-009', TaskStatus.PENDING, ['280-007']);
    const docB = task('280-010', TaskStatus.PENDING, ['280-007']);
    persist([upstream, docA, docB]);
    const backend = makeBackend();

    await run(makeSprint([upstream, docA, docB]), backend);

    expect(backend.spawned).not.toContain('280-009');
    expect(backend.spawned).not.toContain('280-010');
  });
});
