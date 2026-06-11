/**
 * Sprint 280 FIX-deadlock fix — a MANUAL_REVIEW_REQUIRED upstream must not
 * deadlock its dependents in the wave scheduler.
 *
 * Observed knot (Sprint 280): worker 280-007 timed out WITH disk-evidence and
 * was reclassified MANUAL_REVIEW_REQUIRED (not DONE). `respawnEligibleTasks`
 * computed its dependency-satisfied set as `status === DONE` only, so the doc
 * tasks 280-009/010 (which depend on 007) were never dispatched and the EXECUTE
 * wave loop idled until the sprint timeout — the FIX phase never even started.
 *
 * Fix: MRR (timed-out-but-disk-complete, queued for review/FIX) satisfies
 * dependents so the wave progresses. A still-running upstream (EXECUTING) must
 * STILL block — that is the regression guard.
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

  it('dependent of a MANUAL_REVIEW_REQUIRED upstream becomes eligible (no deadlock)', async () => {
    const upstream = task('280-007', TaskStatus.MANUAL_REVIEW_REQUIRED);
    const dependent = task('280-010', TaskStatus.PENDING, ['280-007']);
    persist([upstream, dependent]);
    const backend = makeBackend();

    const spawnedIds = await run(makeSprint([upstream, dependent]), backend);

    expect(backend.spawned).toContain('280-010');
    expect(spawnedIds).toContain('280-010');
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

  it('multi-dependent: both docs unblock when their shared MRR upstream is reviewed-pending', async () => {
    const upstream = task('280-007', TaskStatus.MANUAL_REVIEW_REQUIRED);
    const docA = task('280-009', TaskStatus.PENDING, ['280-007']);
    const docB = task('280-010', TaskStatus.PENDING, ['280-007']);
    persist([upstream, docA, docB]);
    const backend = makeBackend();

    await run(makeSprint([upstream, docA, docB]), backend);

    expect(backend.spawned).toEqual(expect.arrayContaining(['280-009', '280-010']));
  });
});
