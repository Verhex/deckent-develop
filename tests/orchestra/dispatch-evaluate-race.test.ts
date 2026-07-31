/**
 * Sprint 272 Task 272-002 — dispatch-queue / EVALUATE race
 *
 * Live bug (Sprint 271-013): in TOPP continuous-dispatch, a PENDING task whose
 * final blocking dependency landed just before the collection-done check was
 * never dispatched — it sat PENDING until the sprint timeout and EVALUATE wrote
 * a synthetic NO_GO for work that never ran. The fix dispatches such
 * dependency-just-satisfied tasks immediately (result-collector.waitForResults),
 * bounded by the existing timeout, and surfaces the residual undispatchable case
 * at the EVALUATE boundary (sprint-phases diagnostic).
 *
 * Coverage:
 *   1-5  findReadyUndispatchedTasks (result-collector) — pure detection
 *   6-7  findReadyUndispatchedTaskIds (sprint-phases) — pure diagnostic
 *   8    waitForResults dispatches a dep-just-satisfied PENDING task BEFORE
 *        returning (no synthetic NO_GO) — the core race fix
 *   9    spawn-impossible (spawn error) → waitForResults closes honestly via
 *        timeout, never hangs, ready task left uncollected
 *   10   no-config legacy caller → new path is an inert no-op (behavior preserved)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock the result watcher so waitForResults' main loop iterates promptly
// (the real watcher falls back to a 5s poll, which would dominate the
// timeout-bound assertions below). Mirrors tests/orchestra/result-collector.test.ts.
vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: () => ({
    waitForChange: () => Promise.resolve(),
    close: () => {},
  }),
}));

import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, TaskResult } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
  settleTestRuntimeBudget,
} from '../helpers/budgeted-docker-execution-fixture.js';

import { findReadyUndispatchedTasks, waitForResults } from '../../src/orchestra/result-collector.js';
import { findReadyUndispatchedTaskIds } from '../../src/orchestra/sprint-phases.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'claude-sonnet-5',
    provider: 'claude',
    type: 'code-development',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-272',
    createdAt: '2026-06-10T00:00:00.000Z',
    assignedAgent: 'generic',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-272',
    number: 272,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: '2026-06-10T00:00:00.000Z',
  } as Sprint;
}

function makeConfig(depPipeline: boolean): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 2,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    auth_mode: 'api',
    dependency_pipeline_enabled: depPipeline,
  } as ResolvedConfig;
}

function doneResult(id: string): TaskResult {
  return {
    taskId: id,
    workerId: `w-${id}`,
    filesChanged: [`src/${id}.ts`],
    linesAdded: 5,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'ran',
    tokenUsage: {
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: 0,
      source: 'provider-adapter',
      provider: 'claude',
      model: 'claude-sonnet-5',
    },
    cost: {
      usd: 0.01,
      currency: 'USD',
      pricingSource: 'provider-envelope',
      isLocal: false,
    },
  };
}

function writeDoneResult(root: string, taskId: string): void {
  writeFileSync(
    join(root, '.tasks', `task-${taskId}.result`),
    JSON.stringify(doneResult(taskId)),
    'utf-8',
  );
}

// ═════════════════════════════════════════════════════════════════════
// 1-5: findReadyUndispatchedTasks (result-collector) — pure detection
// ═════════════════════════════════════════════════════════════════════

describe('findReadyUndispatchedTasks (result-collector)', () => {
  it('returns a PENDING task whose dependency is now DONE (the 271-013 victim)', () => {
    const tasks = [
      makeTask('a', { status: TaskStatus.DONE }),
      makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] }),
    ];
    const ready = findReadyUndispatchedTasks(makeSprint(tasks), new Set(['a']), new Set());
    expect(ready.map(t => t.id)).toEqual(['b']);
  });

  it('excludes a task whose dependency is not yet DONE', () => {
    const tasks = [
      makeTask('a', { status: TaskStatus.EXECUTING }),
      makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] }),
    ];
    const ready = findReadyUndispatchedTasks(makeSprint(tasks), new Set(), new Set(['a']));
    expect(ready).toHaveLength(0);
  });

  it('excludes a ready task that is already assigned (idempotency / Bug F)', () => {
    const tasks = [
      makeTask('a', { status: TaskStatus.DONE }),
      makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] }),
    ];
    const ready = findReadyUndispatchedTasks(makeSprint(tasks), new Set(['a']), new Set(['b']));
    expect(ready).toHaveLength(0);
  });

  it('excludes a PENDING task that has NO dependencies (overflow keeps its cadence)', () => {
    const tasks = [
      makeTask('a', { status: TaskStatus.DONE }),
      makeTask('b', { status: TaskStatus.PENDING, dependencies: [] }),
    ];
    const ready = findReadyUndispatchedTasks(makeSprint(tasks), new Set(['a']), new Set());
    expect(ready).toHaveLength(0);
  });

  it('is aggregate-aware: a fix-task DONE satisfying the original dep id unblocks the dependent', () => {
    const tasks = [
      // A fix task whose DONE supersedes the original "a" via fixForTaskId.
      makeTask('a-fix', { status: TaskStatus.DONE, fixForTaskId: 'a' }),
      makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] }),
    ];
    const ready = findReadyUndispatchedTasks(makeSprint(tasks), new Set(['a-fix']), new Set());
    expect(ready.map(t => t.id)).toEqual(['b']);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 6-7: findReadyUndispatchedTaskIds (sprint-phases) — pure diagnostic
// ═════════════════════════════════════════════════════════════════════

describe('findReadyUndispatchedTaskIds (sprint-phases)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-dispatch-race-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flags a deps-satisfied PENDING task with no heartbeat (about to take a false NO_GO)', () => {
    const tasks = [
      makeTask('a', { status: TaskStatus.DONE }),
      makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] }),
    ];
    const ids = findReadyUndispatchedTaskIds(root, makeSprint(tasks), [doneResult('a')]);
    expect(ids).toEqual(['b']);
  });

  it('does NOT flag the task once it shows a dispatch signal (heartbeat on disk)', () => {
    const tasks = [
      makeTask('a', { status: TaskStatus.DONE }),
      makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] }),
    ];
    // A heartbeat file is a dispatch signal — isTaskDispatched returns true.
    writeFileSync(join(root, '.tasks', 'task-b.hb'), '{"seq":1}', 'utf-8');
    const ids = findReadyUndispatchedTaskIds(root, makeSprint(tasks), [doneResult('a')]);
    expect(ids).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 8-10: waitForResults integration — the live race + safety bounds
// ═════════════════════════════════════════════════════════════════════

describe('waitForResults — dispatch/EVALUATE race fix', () => {
  let root: string;
  let hostStateRoot: string;
  let originalDeckentHome: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-wfr-race-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    hostStateRoot = `${root}-host-state`;
    originalDeckentHome = process.env.DECKENT_HOME;
    process.env.DECKENT_HOME = hostStateRoot;
  });

  afterEach(() => {
    if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
    else process.env.DECKENT_HOME = originalDeckentHome;
    rmSync(root, { recursive: true, force: true });
    rmSync(hostStateRoot, { recursive: true, force: true });
  });

  it('dispatches a dependency-just-satisfied PENDING task before returning (no synthetic NO_GO)', async () => {
    // a is EXECUTING with its .result already on disk; b is PENDING dep=[a].
    // Without the fix, b (deps just satisfied) would never be dispatched in
    // dep-pipeline-OFF mode and would slip to a synthetic NO_GO. With the fix,
    // dispatchReadyTasks spawns b, whose mock backend writes a real DONE result.
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    settleTestRuntimeBudget(root, 'a');
    writeDoneResult(root, 'a');

    const spawned: string[] = [];
    const backend: SpawnBackend = {
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      name: 'mock',
      spawn: (taskId: string) => {
        spawned.push(taskId);
        settleTestRuntimeBudget(root, taskId);
        writeDoneResult(root, taskId);
      },
      kill: () => {},
      list: () => [],
      isAvailable: async () => true,
    };

    const results = await waitForResults(
      root, sprint, 3000, undefined,
      { spawnBackend: backend, autoApprove: true }, undefined, makeConfig(false),
    );

    expect({ spawned, a: a.status, b: b.status }).toEqual({
      spawned: ['b'],
      a: TaskStatus.DONE,
      b: TaskStatus.DONE,
    }); // b was dispatched, not deferred
    expect(results).toHaveLength(2);
    const rb = results.find(r => r.taskId === 'b');
    expect(rb).toBeDefined();
    expect(rb!.selfAssessment).toBe('DONE'); // ran for real — never a synthetic NO_GO
  });

  it('does not release a dependent from a raw worker DONE when host aggregate evaluation is NO_GO', async () => {
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    settleTestRuntimeBudget(root, 'a');
    writeDoneResult(root, 'a');

    const spawned: string[] = [];
    const backend: SpawnBackend = {
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      name: 'mock',
      spawn: (taskId: string) => { spawned.push(taskId); },
      kill: () => {},
      list: () => [],
      isAvailable: async () => true,
    };

    const results = await waitForResults(
      root,
      sprint,
      3_000,
      undefined,
      {
        spawnBackend: backend,
        autoApprove: true,
        evaluateCollectedResult: async () => TaskEvaluation.NO_GO,
      },
      undefined,
      makeConfig(true),
    );

    expect(results.map(result => result.taskId)).toEqual(['a']);
    expect(spawned).toEqual([]);
    expect(a.status).toBe(TaskStatus.NO_GO);
    expect(b.status).toBe(TaskStatus.PAUSED);
  });

  it('releases a dependent only after host aggregate evaluation accepts DONE', async () => {
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    settleTestRuntimeBudget(root, 'a');
    writeDoneResult(root, 'a');

    const evaluated: string[] = [];
    const spawned: string[] = [];
    const backend: SpawnBackend = {
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      name: 'mock',
      spawn: (taskId: string) => {
        spawned.push(taskId);
        settleTestRuntimeBudget(root, taskId);
        writeDoneResult(root, taskId);
      },
      kill: () => {},
      list: () => [],
      isAvailable: async () => true,
    };

    const results = await waitForResults(
      root,
      sprint,
      3_000,
      undefined,
      {
        spawnBackend: backend,
        autoApprove: true,
        evaluateCollectedResult: async (task) => {
          evaluated.push(task.id);
          return TaskEvaluation.DONE;
        },
      },
      undefined,
      makeConfig(true),
    );

    expect(evaluated).toEqual(['a', 'b']);
    expect(spawned).toEqual(['b']);
    expect(results.map(result => result.taskId)).toEqual(['a', 'b']);
  });

  it('closes honestly via timeout when a ready task cannot be spawned (spawn error) — no infinite wait', async () => {
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    settleTestRuntimeBudget(root, 'a');
    writeDoneResult(root, 'a');

    const attempts: string[] = [];
    const backend: SpawnBackend = {
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      name: 'mock-err',
      spawn: (taskId: string) => {
        attempts.push(taskId);
        throw new Error('simulated spawn failure');
      },
      kill: () => {},
      list: () => [],
      isAvailable: async () => true,
    };

    const start = Date.now();
    const results = await waitForResults(
      root, sprint, 400, undefined,
      { spawnBackend: backend, autoApprove: true }, undefined, makeConfig(false),
    );
    const elapsed = Date.now() - start;

    // It RETURNED (did not hang) and bounded by the timeout window.
    expect(elapsed).toBeLessThan(3000);
    // b was attempted at least once but never collected — left for the honest
    // synthetic NO_GO at EVALUATE (out of scope here).
    expect(attempts).toContain('b');
    expect(results.map(r => r.taskId)).toEqual(['a']);
  });

  it('keeps a remote dispatch fail-closed when the backend omits landing capability', async () => {
    const a = makeTask('a', { status: TaskStatus.EXECUTING, budget: undefined });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    writeDoneResult(root, 'a');

    const spawned: string[] = [];
    const backendWithoutLanding: SpawnBackend = {
      name: 'mock-without-landing',
      spawn: (taskId: string) => { spawned.push(taskId); },
      kill: () => {},
      list: () => [],
      isAvailable: async () => true,
    };

    const results = await waitForResults(
      root, sprint, 100, undefined,
      { spawnBackend: backendWithoutLanding, autoApprove: true }, undefined, makeConfig(false),
    );

    expect(spawned).toEqual([]);
    expect(results.map(result => result.taskId)).toEqual(['a']);
  });

  it('is an inert no-op for legacy callers without config (behavior preserved)', async () => {
    // Single already-complete task — early all-collected return; the new
    // dispatchReadyTasks closure short-circuits on the missing config and must
    // not interfere.
    const a = makeTask('a', { status: TaskStatus.EXECUTING, budget: undefined });
    const sprint = makeSprint([a]);
    writeFileSync(join(root, '.tasks', 'task-a.result'), JSON.stringify(doneResult('a')), 'utf-8');

    const results = await waitForResults(root, sprint, 3000);

    expect(results).toHaveLength(1);
    expect(results[0]!.taskId).toBe('a');
    expect(results[0]!.selfAssessment).toBe('DONE');
  });
});
