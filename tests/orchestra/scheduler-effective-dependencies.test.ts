/**
 * born-634/635 SCHED1 (docs/analysis/scheduler-unify-design-2026-07-11.md,
 * Sprint-1 dilimi) — `computeEffectiveDependencyState` (scheduler-state.ts) is
 * the ONE place fix-aggregation-aware dependency scheduling state now lives.
 *
 * Coverage:
 *   1. Exhaustive table: upstream status x fix-state x pipeline-flag -> the
 *      resulting logical-tip satisfyingIds/terminalFailureIds membership, AND the actual
 *      selectEligibleForSpawn eligibility outcome for a PENDING dependent.
 *   2. retryEligibleIds unit cases (undefined / future / exactly-now / past).
 *   3. Pinning tests for the ONE named, intentional behavior change: a DONE
 *      `<id>-fix` now also satisfies `<id>` in selectEligibleForSpawn (idle
 *      rescan) AND respawnEligibleTasks — previously the two call sites
 *      WITHOUT fix-aggregation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { computeEffectiveDependencyState } from '../../src/orchestra/scheduler-state.js';
import { selectEligibleForSpawn, respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
} from '../helpers/budgeted-docker-execution-fixture.js';

// ─── Fixtures ──────────────────────────────────────────────────────────

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `sched-state ${id}`,
    model: 'claude-sonnet-5' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'sched1-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/sched-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'x', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched1',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
    ...overrides,
  } as unknown as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return { id: 'sprint-sched1', tasks, status: 'EXECUTING', phase: 'EXECUTE', createdAt: 'T' } as unknown as Sprint;
}

function makeSpawnConfig(dependencyPipelineEnabled: boolean): Pick<ResolvedConfig, 'dependency_pipeline_enabled'> {
  return { dependency_pipeline_enabled: dependencyPipelineEnabled };
}

function makeFullConfig(): ResolvedConfig {
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

function makeBackend(): SpawnBackend & { spawned: string[] } {
  const spawned: string[] = [];
  return {
    name: 'mock-sched1',
    ...TEST_MEASURED_LANDING_CAPABILITIES,
    spawn(taskId: string, _m: ModelType, _p: string, _o?: SpawnBackendOptions) { spawned.push(taskId); },
    kill() { /* no-op */ },
    list() { return spawned; },
    isAvailable() { return Promise.resolve(true); },
    spawned,
  };
}

const NOW_MS = 1_752_000_000_000; // fixed instant — purity means any value works identically

// ─── 1. Exhaustive status x fix-state x pipeline table ─────────────────

type FixState = 'none' | 'pending-fix' | 'done-fix' | 'no_go-fix';

const UPSTREAM_STATUSES = [
  TaskStatus.DONE,
  TaskStatus.NO_GO,
  TaskStatus.MANUAL_REVIEW_REQUIRED,
  TaskStatus.PENDING,
  TaskStatus.EXECUTING,
] as const;

const FIX_STATES: FixState[] = ['none', 'pending-fix', 'done-fix', 'no_go-fix'];

function fixTaskStatus(fixState: FixState): TaskStatus | undefined {
  if (fixState === 'none') return undefined;
  if (fixState === 'pending-fix') return TaskStatus.PENDING;
  if (fixState === 'done-fix') return TaskStatus.DONE;
  return TaskStatus.NO_GO; // 'no_go-fix'
}

// Literal per-cell expectation table (upstream status x fix state) —
// [expectedSatisfying, expectedTerminal]. Written out explicitly rather than
// re-deriving the production formula, so the test documents the spec per
// cell instead of mirroring the implementation's exact code shape.
const EXPECTATION_TABLE: Record<string, Record<FixState, [boolean, boolean]>> = {
  [TaskStatus.DONE]: {
    'none': [true, false],
    'pending-fix': [true, false],
    'done-fix': [true, false],
    'no_go-fix': [true, false],
  },
  [TaskStatus.NO_GO]: {
    'none': [false, true],
    'pending-fix': [false, false],
    'done-fix': [true, false],
    'no_go-fix': [false, true],
  },
  [TaskStatus.MANUAL_REVIEW_REQUIRED]: {
    'none': [false, true],
    'pending-fix': [false, true],
    'done-fix': [false, true],
    'no_go-fix': [false, true],
  },
  [TaskStatus.PENDING]: {
    'none': [false, false],
    'pending-fix': [false, false],
    'done-fix': [false, false],
    'no_go-fix': [false, false],
  },
  [TaskStatus.EXECUTING]: {
    'none': [false, false],
    'pending-fix': [false, false],
    'done-fix': [false, false],
    'no_go-fix': [false, false],
  },
};

describe('computeEffectiveDependencyState — exhaustive status x fix x pipeline table (SCHED1)', () => {
  for (const upstreamStatus of UPSTREAM_STATUSES) {
    for (const fixState of FIX_STATES) {
      const [expectedSatisfying, expectedTerminal] = EXPECTATION_TABLE[upstreamStatus][fixState];
      // Caller-facing classification: satisfying takes precedence (this is
      // what selectEligibleForSpawn/respawnEligibleTasks/findReadyUndispatchedTasks
      // actually consult — none of them look at terminalFailureIds).
      const classification: 'eligible' | 'skip' | 'blocked' =
        expectedSatisfying ? 'eligible' : expectedTerminal ? 'skip' : 'blocked';

      for (const pipelineOn of [true, false]) {
        const label = `upstream=${upstreamStatus} fix=${fixState} pipeline=${pipelineOn ? 'on' : 'off'}`;

        it(`${label} -> satisfying=${expectedSatisfying} terminal=${expectedTerminal} classification=${classification}`, () => {
          const upstream = makeTask('sched-up', { status: upstreamStatus });
          const tasks: Task[] = [upstream];
          const fixStatus = fixTaskStatus(fixState);
          if (fixStatus !== undefined) {
            tasks.push(makeTask('sched-up-fix', { status: fixStatus, fixForTaskId: 'sched-up' }));
          }
          const dependent = makeTask('sched-dep', { status: TaskStatus.PENDING, dependencies: ['sched-up'] });
          tasks.push(dependent);

          const state = computeEffectiveDependencyState(tasks, NOW_MS);
          expect(state.satisfyingIds.has('sched-up')).toBe(expectedSatisfying);
          expect(state.terminalFailureIds.has('sched-up')).toBe(expectedTerminal);

          const config = makeSpawnConfig(pipelineOn);
          const eligible = selectEligibleForSpawn(
            makeSprint(tasks), config, 10, new Set(), new Set(), NOW_MS,
          );
          const dependentEligible = eligible.some(t => t.id === 'sched-dep');

          if (!pipelineOn) {
            // Legacy FIFO mode bypasses the dependency check entirely.
            expect(dependentEligible).toBe(true);
          } else {
            expect(dependentEligible).toBe(classification === 'eligible');
          }
        });
      }
    }
  }
});

// ─── 2. retryEligibleIds unit cases ─────────────────────────────────────

describe('computeEffectiveDependencyState — retryEligibleIds', () => {
  it('a task with no retryAfter is always retry-eligible', () => {
    const t = makeTask('r-none');
    const state = computeEffectiveDependencyState([t], NOW_MS);
    expect(state.retryEligibleIds.has('r-none')).toBe(true);
  });

  it('retryAfter in the future is NOT retry-eligible', () => {
    const t = { ...makeTask('r-future'), retryAfter: NOW_MS + 60_000 } as Task;
    const state = computeEffectiveDependencyState([t], NOW_MS);
    expect(state.retryEligibleIds.has('r-future')).toBe(false);
  });

  it('retryAfter exactly equal to nowMs IS retry-eligible (<=, not <)', () => {
    const t = { ...makeTask('r-exact'), retryAfter: NOW_MS } as Task;
    const state = computeEffectiveDependencyState([t], NOW_MS);
    expect(state.retryEligibleIds.has('r-exact')).toBe(true);
  });

  it('retryAfter in the past IS retry-eligible', () => {
    const t = { ...makeTask('r-past'), retryAfter: NOW_MS - 60_000 } as Task;
    const state = computeEffectiveDependencyState([t], NOW_MS);
    expect(state.retryEligibleIds.has('r-past')).toBe(true);
  });
});

describe('computeEffectiveDependencyState — canonical multi-hop FIX lineage', () => {
  it('projects a DONE FIX-of-FIX onto the logical root without a contradictory terminal failure', () => {
    const original = makeTask('lineage-root', { status: TaskStatus.NO_GO });
    const firstFix = makeTask('lineage-root-fix', {
      status: TaskStatus.NO_GO,
      isPriorityFix: true,
      fixForTaskId: original.id,
    });
    const resolvingFix = makeTask('lineage-root-fix-fix', {
      status: TaskStatus.DONE,
      isPriorityFix: true,
      fixForTaskId: firstFix.id,
    });

    const state = computeEffectiveDependencyState(
      [original, firstFix, resolvingFix],
      NOW_MS,
    );

    expect(state.satisfyingIds.has(original.id)).toBe(true);
    expect(state.terminalFailureIds.has(original.id)).toBe(false);
    expect(state.satisfyingIds.has(firstFix.id)).toBe(true);
  });
});

// ─── 3. Pinning: the ONE intentional behavior change ────────────────────
// Previously selectEligibleForSpawn (idle-rescan) and respawnEligibleTasks
// (dependency-unblock respawn) built a hardcoded/direct-only DONE set with NO
// fix-aggregation — unlike findReadyUndispatchedTasks/planContinuous, which
// already rolled a DONE `<id>-fix` onto its `fixForTaskId` original. SCHED1
// makes this uniform across all three call sites; these tests pin the change.

describe('SCHED1 pinning: DONE <id>-fix now satisfies <id> in idle-rescan + respawn-eligibility', () => {
  it('selectEligibleForSpawn: NO_GO original + DONE <id>-fix -> dependent now eligible', () => {
    const upstream = makeTask('sp-up', { status: TaskStatus.NO_GO });
    const fix = makeTask('sp-up-fix', { status: TaskStatus.DONE, fixForTaskId: 'sp-up' });
    const dependent = makeTask('sp-dep', { status: TaskStatus.PENDING, dependencies: ['sp-up'] });
    const sprint = makeSprint([upstream, fix, dependent]);

    const eligible = selectEligibleForSpawn(
      sprint, makeSpawnConfig(true), 10, new Set(), new Set(), NOW_MS,
    );

    expect(eligible.map(t => t.id)).toContain('sp-dep');
  });

  describe('respawnEligibleTasks (mkdtemp root)', () => {
    let root: string;
    beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'sched1-')); mkdirSync(join(root, '.tasks'), { recursive: true }); });
    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    function persist(tasks: Task[]): void {
      for (const t of tasks) writeFileSync(join(root, '.tasks', `task-${t.id}.json`), JSON.stringify(t));
    }

    it('NO_GO original + DONE <id>-fix -> dependent is now spawned end-to-end', async () => {
      const upstream = makeTask('resp-up', { status: TaskStatus.NO_GO });
      const fix = makeTask('resp-up-fix', { status: TaskStatus.DONE, fixForTaskId: 'resp-up' });
      const dependent = makeTask('resp-dep', { status: TaskStatus.PENDING, dependencies: ['resp-up'] });
      persist([upstream, fix, dependent]);
      const backend = makeBackend();

      const orig = process.cwd();
      process.chdir(root);
      try {
        await respawnEligibleTasks(root, makeSprint([upstream, fix, dependent]), makeFullConfig(), { spawnBackend: backend });
      } finally {
        process.chdir(orig);
      }

      expect(backend.spawned).toContain('resp-dep');
    });
  });
});
