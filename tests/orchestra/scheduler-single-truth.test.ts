/**
 * born-610 SCHEDULER-SINGLE-TRUTH — the ONE answer to "does an MRR upstream
 * satisfy its dependents?" (Alperen decision, 2026-07-10: NO — terminal).
 *
 * Pre-610 the SAME MANUAL_REVIEW_REQUIRED status had 3 contradictory meanings:
 *   A respawnEligibleTasks: dependency-SATISFYING (spawn the dependent)
 *   B dispatch-ready scans:  not-done (keep waiting)
 *   C cascadeSkipDeadBlocked: TERMINAL failure (skip the dependent)
 * and a task's fate was decided by `dependency_pipeline_enabled` + a slot race.
 * New single truth: MRR is unverified partial work → NOT satisfying, terminal
 * for scheduling; dependents are cascade-skipped (Sprint-280's deadlock stays
 * solved — from the other direction). REPRODUCE-first: this file was written
 * RED against the pre-610 code.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import { isTaskDispatched } from '../../src/orchestra/sprint-phases.js';
import { forceKillLiveWorkers } from '../../src/cli/commands/finalize.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';

function makeBackend(): SpawnBackend & { spawned: string[] } {
  const spawned: string[] = [];
  return {
    name: 'mock-610',
    spawn(taskId: string, _m: ModelType, _p: string, _o?: SpawnBackendOptions) { spawned.push(taskId); },
    kill() { /* no-op */ },
    list() { return spawned; },
    isAvailable() { return Promise.resolve(true); },
    spawned,
  };
}

function task(id: string, status: TaskStatus, dependencies: string[] = []): Task {
  return {
    id, title: `Task ${id}`, description: `single-truth ${id}`,
    model: 'sonnet' as ModelType, effort: 'normal', priority: 'NORMAL', reason: '610-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/st-${id}.ts`] },
    dependencies,
    goNogo: { goCriteria: 'x', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    status, sprintId: 'sprint-610', assignedAgent: 'generic', assignedSkills: [], provider: 'claude',
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
  return { id: 'sprint-610', tasks, status: 'EXECUTING', phase: 'EXECUTE', createdAt: 'T' } as unknown as Sprint;
}

describe('born-610: MRR is NOT dependency-satisfying (single truth)', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'st610-')); mkdirSync(join(root, '.tasks'), { recursive: true }); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function persist(tasks: Task[]): void {
    for (const t of tasks) writeFileSync(join(root, '.tasks', `task-${t.id}.json`), JSON.stringify(t));
  }
  async function run(sprint: Sprint, backend: SpawnBackend): Promise<string[]> {
    const orig = process.cwd();
    process.chdir(root);
    try { return await respawnEligibleTasks(root, sprint, makeConfig(), { spawnBackend: backend }); }
    finally { process.chdir(orig); }
  }

  it('dependent of an MRR upstream is NOT spawned (unverified partial work is not a foundation)', async () => {
    const upstream = task('610-001', TaskStatus.MANUAL_REVIEW_REQUIRED);
    const dependent = task('610-002', TaskStatus.PENDING, ['610-001']);
    persist([upstream, dependent]);
    const backend = makeBackend();

    await run(makeSprint([upstream, dependent]), backend);

    expect(backend.spawned).not.toContain('610-002');
  });

  it('DONE upstream still satisfies (regression — the only satisfying status)', async () => {
    const upstream = task('610-003', TaskStatus.DONE);
    const dependent = task('610-004', TaskStatus.PENDING, ['610-003']);
    persist([upstream, dependent]);
    const backend = makeBackend();

    await run(makeSprint([upstream, dependent]), backend);

    expect(backend.spawned).toContain('610-004');
  });

  it('isTaskDispatched treats MRR as settled (the 4th divergence — EVALUATE boundary)', () => {
    expect(isTaskDispatched(root, task('610-005', TaskStatus.MANUAL_REVIEW_REQUIRED), new Set(), new Set())).toBe(true);
  });
});

describe('born-610 STATUS-TRUTH: finalize --force kills live workers (COMPLETE&active)', () => {
  it('forceKillLiveWorkers sweeps every in-progress task through the kill seam (best-effort)', () => {
    const killedIds: string[] = [];
    const sweep = forceKillLiveWorkers(
      [task('610-a', TaskStatus.EXECUTING), task('610-b', TaskStatus.CLAIMED), task('610-c', TaskStatus.EXECUTING)],
      { kill: (id) => {
        if (id === '610-b') throw new Error('window already gone');
        killedIds.push(id);
      } },
    );
    expect(killedIds).toEqual(['610-a', '610-c']);
    expect(sweep.killed).toEqual(['610-a', '610-c']);
    expect(sweep.failed).toEqual(['610-b']); // already-gone = sweep continues, not aborts
  });

  it('composition pin: the --force branch sweeps workers BEFORE finalizeSprint can stamp COMPLETE', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'cli', 'commands', 'finalize.ts'), 'utf-8');
    const forceBranch = src.indexOf('forceKillLiveWorkers(incomplete)');
    const completeStamp = src.indexOf('await finalizeSprint(');
    expect(forceBranch).toBeGreaterThan(-1);
    expect(completeStamp).toBeGreaterThan(-1);
    expect(forceBranch).toBeLessThan(completeStamp); // sweep precedes the COMPLETE stamp
  });
});
