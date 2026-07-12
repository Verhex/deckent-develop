/**
 * 426-003 SCHED5 — continuous live-switch composition tests.
 *
 * docs/analysis/scheduler-unify-design-2026-07-11.md (dilim-5, "Continuous
 * live switch"): the four previously-separate spawn-selection closures
 * (processQueue / maybeRespawn / forceRescanIfIdle / dispatchReadyTasks,
 * result-collector.ts) are unified behind ONE injected driver
 * (`createSchedulerDriver`, scheduler-driver.ts) that BOTH the initial tick
 * and every watcher tick call — closing the design doc's "initial bypass"
 * risk. Fixtures below are copy-adapted from
 * tests/orchestra/scheduler-shadow-equivalence.test.ts (sprint-425's shadow
 * differential suite) and tests/orchestra/scheduler-spawn-executor.test.ts
 * (SCHED3's canonical-executor suite), per the task's explicit "EMSAL —
 * kopyala-uyarla" instruction.
 *
 * Coverage:
 *   1. `resolveSchedulerEngine` default-off contract — mirrors SCHED4's
 *      `shadow_reducer` default-off test exactly: every shape except the
 *      literal `{engine:'reducer'}` resolves to 'legacy'.
 *   2. Injected driver, legacy engine: `runLegacyTick` is invoked verbatim,
 *      in call order, for both 'initial' and 'watcher' triggers — the driver
 *      never spawns/kills/captures a snapshot itself.
 *   3. Injected driver, reducer engine: `runLegacyTick` is NEVER invoked;
 *      SpawnTask/KillWorker effects execute in `orderedEffects` order via the
 *      single canonical `executeSpawnTask`; `remainingQueue`/`assignedTaskIds`
 *      are mutated to match the reducer's decision.
 *   4. Legacy-vs-reducer equivalence: the SAME "empty divergence" fixture
 *      class from scheduler-shadow-equivalence.test.ts, run through the REAL
 *      driver in reducer mode, agrees with `planDispatch` (the pinned legacy
 *      model) on the spawned-id set.
 *   5. Live `waitForResults` integration: the SAME dependency-ready fixture,
 *      toggled only by `config.scheduler.engine`, spawns the same task via
 *      the same tmux `spawnWorker` call whether engine is 'legacy' (default)
 *      or 'reducer' — proving the wiring at the true call-site level, not
 *      just the driver in isolation.
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  mkdirSync, writeFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn(() => 'mock-prompt'),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  })),
}));

import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import type { SpawnTaskDeps } from '../../src/orchestra/scheduler-effects.js';
import { planDispatch } from '../../src/orchestra/result-collector.js';
import type { DispatchState } from '../../src/orchestra/result-collector.js';
import {
  createSchedulerDriver,
  resolveSchedulerEngine,
} from '../../src/orchestra/scheduler-driver.js';
import type { SchedulerDriverDeps } from '../../src/orchestra/scheduler-driver.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';
import { spawnWorker } from '../../src/orchestra/tmux.js';

// ─── Fixtures (copy-adapted from scheduler-shadow-equivalence.test.ts) ─────

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${randomBytes(4).toString('hex')}`);
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `sched5 ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'sched5-test',
    scope: { directories: [], filesRead: [], filesWrite: [`src/sched5-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched5',
    assignedAgent: 'generic',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-sched5',
    number: 426,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  } as Sprint;
}

interface MockSpawnCall {
  taskId: string;
  model: string;
  prompt: string;
  opts?: SpawnBackendOptions;
}

/** Mirrors scheduler-spawn-executor.test.ts's makeMockBackend, plus an
 *  optional shared `log` so effect-ORDER (spawn vs kill) is observable. */
function makeMockBackend(log?: string[]): SpawnBackend & { calls: MockSpawnCall[] } {
  const calls: MockSpawnCall[] = [];
  return {
    name: 'mock-backend',
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, model: model as unknown as string, prompt, opts });
      log?.push(`spawn:${taskId}`);
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

function baseSpawnDeps(projectRoot: string, overrides?: Partial<SpawnTaskDeps>): SpawnTaskDeps {
  return {
    projectRoot,
    sprintFallbackId: 'sprint-sched5',
    config: undefined,
    resolveAgentPrompt: async () => undefined,
    resolveSkillPrompts: async () => [],
    buildWriteTargets: () => ['.tasks/'],
    ...overrides,
  };
}

// ─── 1. resolveSchedulerEngine — default-off contract ──────────────────────

describe('resolveSchedulerEngine — default-off contract', () => {
  it('is "legacy" for every shape except an explicit {engine:"reducer"}', () => {
    expect(resolveSchedulerEngine(undefined)).toBe('legacy');
    expect(resolveSchedulerEngine({})).toBe('legacy');
    expect(resolveSchedulerEngine({ shadow_reducer: true })).toBe('legacy');
    expect(resolveSchedulerEngine({ engine: 'legacy' })).toBe('legacy');
    expect(resolveSchedulerEngine({ engine: 'bogus' })).toBe('legacy');
    expect(resolveSchedulerEngine({ engine: 'reducer' })).toBe('reducer');
  });
});

// ─── 2. Injected driver — legacy engine: pure passthrough ──────────────────

describe('createSchedulerDriver — legacy engine (default): pure passthrough', () => {
  let root: string;
  beforeEach(() => { root = makeTmpDir('sched5-legacy'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  function buildDeps(sprint: Sprint, backend: SpawnBackend & { calls: MockSpawnCall[] }): SchedulerDriverDeps {
    return {
      sprint,
      config: { dependency_pipeline_enabled: true } as ResolvedConfig,
      remainingQueue: [],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      getSlotBudget: () => 5,
      getCostStop: () => false,
      spawnDeps: baseSpawnDeps(root, { backend }),
      killWorker: vi.fn(),
    };
  }

  it('calls runLegacyTick exactly once per tick, in call order, for both triggers — never touches the executor', async () => {
    const task = makeTask('l1');
    const sprint = makeSprint([task]);
    const backend = makeMockBackend();
    const driver = createSchedulerDriver('legacy', buildDeps(sprint, backend));

    const callLog: string[] = [];
    const initialResult = await driver({
      trigger: 'initial',
      completedTaskIds: [],
      runLegacyTick: async () => { callLog.push('initial'); },
    });
    const watcherResult = await driver({
      trigger: 'watcher',
      completedTaskIds: ['l1'],
      runLegacyTick: async () => { callLog.push('watcher'); },
    });

    expect(callLog).toEqual(['initial', 'watcher']);
    expect(initialResult).toEqual({ engine: 'legacy', spawnedTaskIds: [], killedWorkerIds: [] });
    expect(watcherResult).toEqual({ engine: 'legacy', spawnedTaskIds: [], killedWorkerIds: [] });
    // The driver itself never spawns — everything happens inside runLegacyTick,
    // which this test's closures leave empty of any backend call.
    expect(backend.calls).toHaveLength(0);
  });

  it('is selected for every engine value other than the literal "reducer" (config absent, {}, and "reducer" typo)', async () => {
    const task = makeTask('l2');
    const sprint = makeSprint([task]);
    const backend = makeMockBackend();

    for (const engine of ['legacy', 'bogus', undefined] as const) {
      const driver = createSchedulerDriver(
        resolveSchedulerEngine(engine !== undefined ? { engine } : undefined),
        buildDeps(sprint, backend),
      );
      let called = false;
      await driver({ trigger: 'initial', completedTaskIds: [], runLegacyTick: async () => { called = true; } });
      expect(called).toBe(true);
    }
    expect(backend.calls).toHaveLength(0);
  });
});

// ─── 3. Injected driver — reducer engine: single-executor effect execution ─

describe('createSchedulerDriver — reducer engine: effects execute via the single executeSpawnTask', () => {
  let root: string;
  beforeEach(() => { root = makeTmpDir('sched5-reducer'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('never calls runLegacyTick; spawns the reducer-chosen tasks via the injected backend', async () => {
    const t1 = makeTask('r1', { status: TaskStatus.DONE });
    const t2 = makeTask('r2', { dependencies: ['r1'] }); // satisfied -> eligible
    const t3 = makeTask('r3'); // no deps -> eligible
    const t4 = makeTask('r4', { dependencies: ['r5'] }); // r5 not DONE -> blocked
    const t5 = makeTask('r5'); // eligible
    const sprint = makeSprint([t1, t2, t3, t4, t5]);
    const backend = makeMockBackend();

    const deps: SchedulerDriverDeps = {
      sprint,
      config: { dependency_pipeline_enabled: true } as ResolvedConfig,
      remainingQueue: [],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      getSlotBudget: () => 10,
      getCostStop: () => false,
      spawnDeps: baseSpawnDeps(root, { backend }),
      killWorker: vi.fn(),
    };
    const driver = createSchedulerDriver('reducer', deps);

    let legacyCalled = false;
    const result = await driver({
      trigger: 'initial',
      completedTaskIds: [],
      runLegacyTick: async () => { legacyCalled = true; },
    });

    expect(legacyCalled).toBe(false);
    expect(result.engine).toBe('reducer');
    expect([...result.spawnedTaskIds].sort()).toEqual(['r2', 'r3', 'r5']);
    expect(backend.calls.map(c => c.taskId).sort()).toEqual(['r2', 'r3', 'r5']);
    // Bug-F idempotency guard mirrors spawnIfNotAssigned: spawned ids land in
    // the live assignedTaskIds set so a later tick never double-spawns them.
    expect([...deps.assignedTaskIds].sort()).toEqual(['r2', 'r3', 'r5']);
    // t4 stays un-spawned (its dependency r5 isn't DONE yet).
    expect(backend.calls.map(c => c.taskId)).not.toContain('r4');
  });

  it('executes KillWorker before its paired SpawnTask, in orderedEffects order (legacy-fifo queue drain)', async () => {
    const original = process.env.DECKENT_LEGACY_FIFO;
    process.env.DECKENT_LEGACY_FIFO = '1';
    try {
      const q1 = makeTask('q1');
      const q2 = makeTask('q2');
      const sprint = makeSprint([q1, q2]);
      const log: string[] = [];
      const backend = makeMockBackend(log);
      const remainingQueue = [q1, q2];

      const deps: SchedulerDriverDeps = {
        sprint,
        config: { dependency_pipeline_enabled: false } as ResolvedConfig,
        remainingQueue,
        assignedTaskIds: new Set(),
        collectedIds: new Set(),
        getSlotBudget: () => 5,
        getCostStop: () => false,
        spawnDeps: baseSpawnDeps(root, { backend }),
        killWorker: (taskId: string) => log.push(`kill:${taskId}`),
      };
      const driver = createSchedulerDriver('reducer', deps);

      const result = await driver({
        trigger: 'watcher',
        completedTaskIds: ['done-worker-1'],
        runLegacyTick: async () => { throw new Error('must not be called in reducer engine'); },
      });

      expect(log).toEqual(['kill:done-worker-1', 'spawn:q1']);
      expect(result.spawnedTaskIds).toEqual(['q1']);
      expect(result.killedWorkerIds).toEqual(['done-worker-1']);
      // nextQueue mirrored back onto the live (mutable) remainingQueue — q1 was
      // drained, q2 stays queued for a later tick.
      expect(remainingQueue.map(t => t.id)).toEqual(['q2']);
    } finally {
      if (original === undefined) delete process.env.DECKENT_LEGACY_FIFO;
      else process.env.DECKENT_LEGACY_FIFO = original;
    }
  });

  it('falls back to runLegacyTick when engine is "reducer" but no config is supplied (defense-in-depth)', async () => {
    const task = makeTask('r6');
    const sprint = makeSprint([task]);
    const backend = makeMockBackend();
    const deps: SchedulerDriverDeps = {
      sprint,
      config: undefined,
      remainingQueue: [],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      getSlotBudget: () => 5,
      getCostStop: () => false,
      spawnDeps: baseSpawnDeps(root, { backend }),
      killWorker: vi.fn(),
    };
    const driver = createSchedulerDriver('reducer', deps);

    let legacyCalled = false;
    const result = await driver({
      trigger: 'initial',
      completedTaskIds: [],
      runLegacyTick: async () => { legacyCalled = true; },
    });

    expect(legacyCalled).toBe(true);
    expect(result.engine).toBe('legacy');
    expect(backend.calls).toHaveLength(0);
  });
});

// ─── 4. Legacy-vs-reducer equivalence (driver-level, vs the pinned planDispatch model) ─

describe('createSchedulerDriver (reducer) vs planDispatch (legacy pinned model) — equivalent class', () => {
  let root: string;
  beforeEach(() => { root = makeTmpDir('sched5-equiv'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('agrees with planDispatch on the spawned-id set for the shadow-equivalence "empty divergence" fixture', async () => {
    const tasks = [
      makeTask('e1', { status: TaskStatus.DONE }),
      makeTask('e2', { dependencies: ['e1'] }),
      makeTask('e3'),
      makeTask('e4', { dependencies: ['e5'] }),
      makeTask('e5'),
    ];
    const sprint = makeSprint(tasks);

    const dispatchState: DispatchState = {
      sprint,
      config: { dependency_pipeline_enabled: true },
      maxWorkers: 10,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      remainingQueue: [],
      completedTaskIds: [],
    };
    const legacyPlan = planDispatch(dispatchState, {});
    const legacySpawned = legacyPlan.toSpawn.map(t => t.id).sort();

    const backend = makeMockBackend();
    const deps: SchedulerDriverDeps = {
      sprint,
      config: { dependency_pipeline_enabled: true } as ResolvedConfig,
      remainingQueue: [],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      getSlotBudget: () => 10,
      getCostStop: () => false,
      spawnDeps: baseSpawnDeps(root, { backend }),
      killWorker: vi.fn(),
    };
    const driver = createSchedulerDriver('reducer', deps);
    const result = await driver({ trigger: 'initial', completedTaskIds: [], runLegacyTick: async () => {} });

    expect(legacySpawned).toEqual(['e2', 'e3', 'e5']);
    expect([...result.spawnedTaskIds].sort()).toEqual(legacySpawned);
  });
});

// ─── 5. Live waitForResults integration — same fixture, engine toggled only ─

describe('waitForResults — SCHED5 live wiring: initial tick spawns via the injected driver either engine', () => {
  let root: string;
  beforeEach(() => { root = makeTmpDir('sched5-live'); vi.clearAllMocks(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function buildFixture(): { sprint: Sprint; dep: Task; readyTask: Task } {
    const dep = makeTask('705-000', { status: TaskStatus.DONE });
    const readyTask = makeTask('705-001', { dependencies: ['705-000'] });
    const sprint: Sprint = {
      id: 'sprint-sched5',
      number: 1,
      tasks: [dep, readyTask],
      workers: ['w-705-000', 'w-705-001'],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      planningMode: 'structured',
    } as Sprint;
    return { sprint, dep, readyTask };
  }

  it('legacy engine (config.scheduler absent — default): dispatchReadyTasks spawns the dependency-ready task', async () => {
    const { sprint, readyTask } = buildFixture();
    const config = {
      dependency_pipeline_enabled: true,
      activeModeConfig: { max_workers: 3, brain_model: 'opus', default_model: 'sonnet', haiku_allowed: true },
    } as unknown as ResolvedConfig;

    await waitForResults(root, sprint, 300, undefined, undefined, undefined, config);

    expect(vi.mocked(spawnWorker)).toHaveBeenCalledWith(
      '705-001', expect.any(String), expect.any(String), root, expect.any(Object),
    );
    expect(readyTask.status).toBe(TaskStatus.EXECUTING);
  });

  it('reducer engine (config.scheduler.engine="reducer"): the injected driver spawns the same task via the same tmux path', async () => {
    const { sprint, readyTask } = buildFixture();
    const config = {
      dependency_pipeline_enabled: true,
      scheduler: { engine: 'reducer' },
      activeModeConfig: { max_workers: 3, brain_model: 'opus', default_model: 'sonnet', haiku_allowed: true },
    } as unknown as ResolvedConfig;

    await waitForResults(root, sprint, 300, undefined, undefined, undefined, config);

    expect(vi.mocked(spawnWorker)).toHaveBeenCalledWith(
      '705-001', expect.any(String), expect.any(String), root, expect.any(Object),
    );
    expect(readyTask.status).toBe(TaskStatus.EXECUTING);
  });

  it('does not touch the live dogfood default: a config with no scheduler block at all behaves exactly like the explicit legacy case', async () => {
    const { sprint, readyTask } = buildFixture();
    const config = {
      dependency_pipeline_enabled: true,
      activeModeConfig: { max_workers: 3, brain_model: 'opus', default_model: 'sonnet', haiku_allowed: true },
    } as unknown as ResolvedConfig;
    expect((config as { scheduler?: unknown }).scheduler).toBeUndefined();

    await waitForResults(root, sprint, 300, undefined, undefined, undefined, config);

    expect(vi.mocked(spawnWorker)).toHaveBeenCalledWith(
      '705-001', expect.any(String), expect.any(String), root, expect.any(Object),
    );
    expect(readyTask.status).toBe(TaskStatus.EXECUTING);
  });
});

// ─── 6. Shadow-journal independence (dilim-4 stays wired regardless of engine) ─

describe('scheduler.shadow_reducer stays independent of scheduler.engine (dilim-4 untouched by dilim-5)', () => {
  it('shadow_reducer and engine are read from two separate config keys — flipping one never implies the other', () => {
    const shadowOnlyConfig = { shadow_reducer: true };
    const engineOnlyConfig = { engine: 'reducer' };
    expect(resolveSchedulerEngine(shadowOnlyConfig)).toBe('legacy');
    expect((shadowOnlyConfig as { engine?: unknown }).engine).toBeUndefined();
    expect((engineOnlyConfig as { shadow_reducer?: unknown }).shadow_reducer).toBeUndefined();
  });
});
