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
import { writeFileSync, mkdirSync, rmSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import { isTaskDispatched } from '../../src/orchestra/sprint-phases.js';
import { forceKillLiveWorkers } from '../../src/cli/commands/finalize.js';
import { handleEvaluation, handleCrossDependencies } from '../../src/orchestra/debt-manager.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { TaskResult } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
} from '../helpers/budgeted-docker-execution-fixture.js';

function makeBackend(): SpawnBackend & { spawned: string[] } {
  const spawned: string[] = [];
  return {
    name: 'mock-610',
    ...TEST_MEASURED_LANDING_CAPABILITIES,
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
    model: 'claude-sonnet-5' as ModelType, effort: 'normal', priority: 'NORMAL', reason: '610-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/st-${id}.ts`] },
    dependencies,
    goNogo: { goCriteria: 'x', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    status, sprintId: 'sprint-610', assignedAgent: 'generic', assignedSkills: [], provider: 'claude',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
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
    // 556-003 termination truth: killSingle is typed now — 'killed' |
    // 'not-found' (already dead = goal state reached) | 'failed' (real error).
    const sweep = forceKillLiveWorkers(
      [task('610-a', TaskStatus.EXECUTING), task('610-b', TaskStatus.CLAIMED), task('610-c', TaskStatus.EXECUTING)],
      (id) => {
        if (id === '610-b') return 'failed'; // backend-aware killSingle: gerçek kill hatası
        killedIds.push(id);
        return 'killed';
      },
    );
    expect(killedIds).toEqual(['610-a', '610-c']);
    expect(sweep.killed).toEqual(['610-a', '610-c']);
    expect(sweep.failed).toEqual(['610-b']); // real failure = sweep continues, not aborts
  });

  it('composition pin: the --force branch sweeps workers BEFORE finalizeSprint can stamp COMPLETE', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'cli', 'commands', 'finalize.ts'), 'utf-8');
    const forceBranch = src.indexOf('forceKillLiveWorkers(incomplete,');
    const completeStamp = src.indexOf('await finalizeSprint(');
    expect(forceBranch).toBeGreaterThan(-1);
    expect(completeStamp).toBeGreaterThan(-1);
    expect(forceBranch).toBeLessThan(completeStamp); // sweep precedes the COMPLETE stamp
  });
});

describe('born-610 FIX-kapisi muafiyeti (advisor P0: skip ustune fix insa edilemez)', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'st610fix-')); mkdirSync(join(root, '.tasks'), { recursive: true }); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function skipResult(taskId: string): TaskResult {
    return {
      taskId, filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: false,
      coverage: 0, selfAssessment: 'NO_GO', cascadeSkipped: true,
      notes: 'Cascade-skipped: dependency ended NO_GO/MANUAL_REVIEW',
    } as unknown as TaskResult;
  }

  function persistTask(t: Task): void {
    writeFileSync(join(root, '.tasks', `task-${t.id}.json`), JSON.stringify(t));
  }

  it('handleEvaluation: cascade-skipped NO_GO icin fix-task ACILMAZ', () => {
    const t = task('610-skip', TaskStatus.NO_GO);
    persistTask(t);
    handleEvaluation(root, t, TaskEvaluation.NO_GO, skipResult('610-skip'));
    expect(existsSync(join(root, '.tasks', 'task-610-skip-fix.json'))).toBe(false);
  });

  it('handleEvaluation: NORMAL NO_GO fix-task acar (muafiyet asiri-genis degil)', () => {
    const t = task('610-real', TaskStatus.NO_GO);
    persistTask(t);
    const r = { ...skipResult('610-real'), cascadeSkipped: undefined, notes: 'gercek worker hatasi' } as unknown as TaskResult;
    handleEvaluation(root, t, TaskEvaluation.NO_GO, r);
    expect(existsSync(join(root, '.tasks', 'task-610-real-fix.json'))).toBe(true);
  });

  it('handleCrossDependencies: cascade-skipped NO_GO, DONE-bagimliligina xfix ATMAZ', () => {
    const dep = task('610-dep', TaskStatus.DONE);
    const skipped = task('610-victim', TaskStatus.NO_GO, ['610-dep']);
    writeFileSync(join(root, '.tasks', 'task-610-victim.result'), JSON.stringify(skipResult('610-victim')));
    const evals = new Map([['610-dep', TaskEvaluation.DONE], ['610-victim', TaskEvaluation.NO_GO]]);
    const fixes = handleCrossDependencies(root, makeSprint([dep, skipped]), evals);
    expect(fixes).toEqual([]);
    expect(existsSync(join(root, '.tasks', 'task-610-dep-xfix.json'))).toBe(false);
  });
});
