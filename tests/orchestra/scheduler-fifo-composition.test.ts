/**
 * sprint-428 S7C (task 428-013) — "Task 10-11'in birleşik kanıtı": the combined
 * proof for task 428-010 (scheduler-fifo-dependency-safety.test.ts — blocked-head
 * +next-eligible+cascade at the pure-reducer level, both strategies) and task
 * 428-011 (dependency_pipeline_enabled promoted to typed config). This file
 * closes SCHED-7 by proving the SAME blocked-head+next-eligible+cascade property
 * holds through the FULL driver→reducer→executor chain (real tmpdir fs, no
 * mocks beyond the spawn backend/tmux boundary — copy-adapted from
 * scheduler-cascade-composition.test.ts's 427-010 real-fs pattern), and by
 * re-pinning the legacy-vs-reducer FIFO-dep-hole divergence
 * (scheduler-shadow-equivalence.test.ts's "expected divergence" fixture) as an
 * explicit, marked assertion so a future change cannot silently "fix" (or
 * silently regress) that intentional, documented gap without this test noticing.
 *
 * Coverage:
 *   1. Full chain, legacy-fifo strategy: one tick, one fixture — a dependency-
 *      blocked FIFO head stays queued and unspawned, the next eligible entry is
 *      spawned via a real Kill+Spawn pair (in order), and a cascade-dependent of
 *      a NO_GO root is persisted NO_GO+cascadeSkipped:true on real disk — all in
 *      the SAME createSchedulerDriver('reducer', …) tick.
 *   2. Full chain, continuous strategy: the same three properties, no kill
 *      involved (continuous never emits KillWorker).
 *   3. Legacy-vs-reducer two-engine comparison:
 *      a. legacy-fifo: planDispatch (the pinned legacy model) vs the real
 *         driver→reducer→executor chain on the historical FIFO-dep-hole
 *         fixture — MARKED, non-regressing divergence: legacy still spawns the
 *         blocked head, the reducer's real executor never does.
 *      b. continuous: same two engines on a cascade+eligible fixture — NO
 *         divergence, both agree on the spawn set.
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  mkdirSync, writeFileSync, existsSync, rmSync, readFileSync,
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

import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, TaskResult } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import type { SpawnTaskDeps } from '../../src/orchestra/scheduler-effects.js';
import { planDispatch } from '../../src/orchestra/result-collector.js';
import type { DispatchState } from '../../src/orchestra/result-collector.js';
import {
  createSchedulerDriver,
} from '../../src/orchestra/scheduler-driver.js';
import type { SchedulerDriverDeps } from '../../src/orchestra/scheduler-driver.js';

// ─── Fixtures (copy-adapted from scheduler-driver-composition.test.ts +
//      scheduler-cascade-composition.test.ts) ──────────────────────────────

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
    description: `sched7-s7c ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'sched7-s7c-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/sched7-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched7-s7c',
    assignedAgent: 'generic',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-sched7-s7c',
    number: 428,
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

/** Mirrors scheduler-driver-composition.test.ts's makeMockBackend, plus an
 *  optional shared `log` so effect-ORDER (kill vs spawn) is observable. */
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
    sprintFallbackId: 'sprint-sched7-s7c',
    config: undefined,
    resolveAgentPrompt: async () => undefined,
    resolveSkillPrompts: async () => [],
    buildWriteTargets: () => ['.tasks/'],
    ...overrides,
  };
}

function writeTaskFile(root: string, task: Task): void {
  writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
}

function readTaskFile(root: string, id: string): Task {
  return JSON.parse(readFileSync(join(root, '.tasks', `task-${id}.json`), 'utf-8')) as Task;
}

function readResultFile(root: string, id: string): TaskResult {
  return JSON.parse(readFileSync(join(root, '.tasks', `task-${id}.result`), 'utf-8')) as TaskResult;
}

function withLegacyFifoEnv<T>(enabled: boolean, fn: () => T): T {
  const original = process.env.DECKENT_LEGACY_FIFO;
  if (enabled) process.env.DECKENT_LEGACY_FIFO = '1';
  else delete process.env.DECKENT_LEGACY_FIFO;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.DECKENT_LEGACY_FIFO;
    else process.env.DECKENT_LEGACY_FIFO = original;
  }
}

// ─── 1. Full chain (driver → reducer → executor) — legacy-fifo strategy ────

describe('S7C full-chain composition — legacy-fifo: blocked-head + next-eligible + cascade, one tick', () => {
  let root: string;
  beforeEach(() => { root = makeTmpDir('s7c-fifo-legacy'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('blocked head stays queued+unspawned, the next eligible entry is Kill+Spawn-paired, and a cascade-dependent of a NO_GO root is persisted NO_GO on real disk', async () => {
    const cascadeRoot = makeTask('1000-cascade-root', { status: TaskStatus.NO_GO });
    const cascadeDep = makeTask('1000-cascade-dep', { dependencies: ['1000-cascade-root'] });
    const upstream = makeTask('1000-upstream'); // still PENDING — never satisfies the blocked head's dependency
    const blockedHead = makeTask('1000-qb', { dependencies: ['1000-upstream'] });
    const freeSecond = makeTask('1000-qfree');
    const allTasks = [cascadeRoot, cascadeDep, upstream, blockedHead, freeSecond];
    allTasks.forEach(t => writeTaskFile(root, t));

    const sprint = makeSprint(allTasks);
    const log: string[] = [];
    const backend = makeMockBackend(log);
    const remainingQueue: Task[] = [blockedHead, freeSecond];

    const deps: SchedulerDriverDeps = {
      sprint,
      config: { dependency_pipeline_enabled: true } as ResolvedConfig,
      remainingQueue,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      getSlotBudget: () => 5,
      getCostStop: () => false,
      spawnDeps: baseSpawnDeps(root, { backend }),
      killWorker: (taskId: string) => log.push(`kill:${taskId}`),
    };

    const result = await withLegacyFifoEnv(true, () => {
      const driver = createSchedulerDriver('reducer', deps);
      return driver({
        trigger: 'watcher',
        completedTaskIds: ['done-worker-1'],
        runLegacyTick: async () => { throw new Error('must not be called in reducer engine'); },
      });
    });

    // Blocked head: never spawned, still queued at the head afterward.
    expect(result.spawnedTaskIds).not.toContain('1000-qb');
    expect(backend.calls.map(c => c.taskId)).not.toContain('1000-qb');
    expect(remainingQueue.map(t => t.id)).toEqual(['1000-qb']);
    expect(readTaskFile(root, '1000-qb').status).toBe(TaskStatus.PENDING);

    // Next eligible entry: spawned via a real Kill+Spawn pair, in order.
    expect(log).toEqual(['kill:done-worker-1', 'spawn:1000-qfree']);
    expect(result.spawnedTaskIds).toEqual(['1000-qfree']);
    expect(result.killedWorkerIds).toEqual(['done-worker-1']);
    expect(readTaskFile(root, '1000-qfree').status).toBe(TaskStatus.EXECUTING);

    // Cascade-dependent of the NO_GO root: persisted NO_GO + cascadeSkipped:true
    // on real disk, in the SAME tick — never spawned.
    expect(result.spawnedTaskIds).not.toContain('1000-cascade-dep');
    expect(readTaskFile(root, '1000-cascade-dep').status).toBe(TaskStatus.NO_GO);
    expect(readResultFile(root, '1000-cascade-dep').cascadeSkipped).toBe(true);
  });
});

// ─── 2. Full chain (driver → reducer → executor) — continuous strategy ────

describe('S7C full-chain composition — continuous: blocked-head + next-eligible + cascade, one tick', () => {
  let root: string;
  beforeEach(() => { root = makeTmpDir('s7c-fifo-continuous'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('blocked head stays queued+unspawned, the next eligible queue entry is spawned (no kill), and a cascade-dependent is persisted NO_GO on real disk', async () => {
    const cascadeRoot = makeTask('1001-cascade-root', { status: TaskStatus.NO_GO });
    const cascadeDep = makeTask('1001-cascade-dep', { dependencies: ['1001-cascade-root'] });
    // In-flight (not DONE, not PENDING) — cleanly blocks qb while excluding
    // itself from Step-2's PENDING scan, mirroring the 428-010 continuous fixture.
    const upstream = makeTask('1001-upstream', { status: TaskStatus.EXECUTING });
    const blockedHead = makeTask('1001-qb', { dependencies: ['1001-upstream'] });
    const freeSecond = makeTask('1001-qfree');
    const allTasks = [cascadeRoot, cascadeDep, upstream, blockedHead, freeSecond];
    allTasks.forEach(t => writeTaskFile(root, t));

    const sprint = makeSprint(allTasks);
    const log: string[] = [];
    const backend = makeMockBackend(log);
    const remainingQueue: Task[] = [blockedHead, freeSecond];

    const deps: SchedulerDriverDeps = {
      sprint,
      config: { dependency_pipeline_enabled: true } as ResolvedConfig,
      remainingQueue,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      getSlotBudget: () => 5,
      getCostStop: () => false,
      spawnDeps: baseSpawnDeps(root, { backend }),
      killWorker: (taskId: string) => log.push(`kill:${taskId}`),
    };

    const result = await withLegacyFifoEnv(false, () => {
      const driver = createSchedulerDriver('reducer', deps);
      return driver({
        trigger: 'initial',
        completedTaskIds: [],
        runLegacyTick: async () => { throw new Error('must not be called in reducer engine'); },
      });
    });

    // Blocked head: never spawned, still queued afterward.
    expect(result.spawnedTaskIds).not.toContain('1001-qb');
    expect(backend.calls.map(c => c.taskId)).not.toContain('1001-qb');
    expect(remainingQueue.map(t => t.id)).toEqual(['1001-qb']);
    expect(readTaskFile(root, '1001-qb').status).toBe(TaskStatus.PENDING);

    // Next eligible entry: spawned via Step-1 queue-drain, no kill (continuous
    // never emits KillWorker).
    expect(result.spawnedTaskIds).toEqual(['1001-qfree']);
    expect(log).toEqual(['spawn:1001-qfree']);
    expect(result.killedWorkerIds).toEqual([]);
    expect(readTaskFile(root, '1001-qfree').status).toBe(TaskStatus.EXECUTING);

    // Cascade-dependent: persisted NO_GO + cascadeSkipped:true, same tick.
    expect(result.spawnedTaskIds).not.toContain('1001-cascade-dep');
    expect(readTaskFile(root, '1001-cascade-dep').status).toBe(TaskStatus.NO_GO);
    expect(readResultFile(root, '1001-cascade-dep').cascadeSkipped).toBe(true);
  });
});

// ─── 3. Legacy-vs-reducer two-engine comparison ────────────────────────────

describe('S7C two-engine comparison — legacy (planDispatch) vs reducer (real driver→reducer→executor chain)', () => {
  let root: string;
  beforeEach(() => { root = makeTmpDir('s7c-two-engine'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('legacy-fifo: FIFO-dep-hole stays a MARKED, pinned divergence — legacy still spawns the blocked head; the reducer\'s real executor never does, and spawns the next eligible entry instead', async () => {
    // Two independent fixture copies — planDispatch mutates its own queue by
    // shift(), the driver's real executor persists/mutates its own live Task
    // objects; sharing objects between the two engines would cross-contaminate.
    const buildFixture = () => {
      const upstream = makeTask('2000-upstream'); // PENDING — never satisfies qb's dependency
      const blockedHead = makeTask('2000-qb', { dependencies: ['2000-upstream'] });
      const freeSecond = makeTask('2000-qfree');
      return { upstream, blockedHead, freeSecond, tasks: [upstream, blockedHead, freeSecond] };
    };

    const legacyFixture = buildFixture();
    const dispatchState: DispatchState = {
      sprint: makeSprint(legacyFixture.tasks),
      config: { dependency_pipeline_enabled: true },
      maxWorkers: 5,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      remainingQueue: [legacyFixture.blockedHead, legacyFixture.freeSecond],
      completedTaskIds: ['done-worker-1'],
    };
    const legacyPlan = planDispatch(dispatchState, { DECKENT_LEGACY_FIFO: '1' });
    const legacySpawned = legacyPlan.toSpawn.map(t => t.id);

    // Pinned bug, unchanged: legacy's popEligibleFromQueue has no dependency
    // check at all — it spawns the dependency-blocked head unconditionally.
    expect(legacySpawned).toEqual(['2000-qb']);

    const reducerFixture = buildFixture();
    reducerFixture.tasks.forEach(t => writeTaskFile(root, t));
    const backend = makeMockBackend();
    const remainingQueue: Task[] = [reducerFixture.blockedHead, reducerFixture.freeSecond];
    const deps: SchedulerDriverDeps = {
      sprint: makeSprint(reducerFixture.tasks),
      config: { dependency_pipeline_enabled: true } as ResolvedConfig,
      remainingQueue,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      getSlotBudget: () => 5,
      getCostStop: () => false,
      spawnDeps: baseSpawnDeps(root, { backend }),
      killWorker: vi.fn(),
    };
    const result = await withLegacyFifoEnv(true, () => {
      const driver = createSchedulerDriver('reducer', deps);
      return driver({
        trigger: 'watcher',
        completedTaskIds: ['done-worker-1'],
        runLegacyTick: async () => { throw new Error('must not be called in reducer engine'); },
      });
    });

    // The divergence itself, pinned exactly: legacy spawns 'qb', the real
    // reducer-driven executor never does — it protects the blocked head and
    // spawns the next eligible entry ('qfree') in its place instead.
    const divergingIds = legacySpawned.filter(id => !result.spawnedTaskIds.includes(id));
    expect(divergingIds).toEqual(['2000-qb']);
    expect(result.spawnedTaskIds).not.toContain('2000-qb');
    expect(result.spawnedTaskIds).toEqual(['2000-qfree']);
    expect(readTaskFile(root, '2000-qb').status).toBe(TaskStatus.PENDING);
    expect(readTaskFile(root, '2000-qfree').status).toBe(TaskStatus.EXECUTING);
  });

  it('continuous: no divergence — both engines agree on the spawn set; the reducer\'s real executor additionally persists the cascade-dependent as NO_GO on disk', async () => {
    const buildFixture = () => {
      const cascadeRoot = makeTask('2001-cascade-root', { status: TaskStatus.NO_GO });
      const cascadeDep = makeTask('2001-cascade-dep', { dependencies: ['2001-cascade-root'] });
      const done = makeTask('2001-done', { status: TaskStatus.DONE });
      const satisfied = makeTask('2001-satisfied', { dependencies: ['2001-done'] });
      const free = makeTask('2001-free');
      return { tasks: [cascadeRoot, cascadeDep, done, satisfied, free] };
    };

    const legacyFixture = buildFixture();
    const dispatchState: DispatchState = {
      sprint: makeSprint(legacyFixture.tasks),
      config: { dependency_pipeline_enabled: true },
      maxWorkers: 10,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      remainingQueue: [],
      completedTaskIds: [],
    };
    const legacyPlan = planDispatch(dispatchState, {});
    const legacySpawned = legacyPlan.toSpawn.map(t => t.id).sort();
    expect(legacySpawned).toEqual(['2001-free', '2001-satisfied']);
    expect(legacySpawned).not.toContain('2001-cascade-dep');

    const reducerFixture = buildFixture();
    reducerFixture.tasks.forEach(t => writeTaskFile(root, t));
    const backend = makeMockBackend();
    const remainingQueue: Task[] = [];
    const deps: SchedulerDriverDeps = {
      sprint: makeSprint(reducerFixture.tasks),
      config: { dependency_pipeline_enabled: true } as ResolvedConfig,
      remainingQueue,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      getSlotBudget: () => 10,
      getCostStop: () => false,
      spawnDeps: baseSpawnDeps(root, { backend }),
      killWorker: vi.fn(),
    };
    const result = await withLegacyFifoEnv(false, () => {
      const driver = createSchedulerDriver('reducer', deps);
      return driver({ trigger: 'initial', completedTaskIds: [], runLegacyTick: async () => {} });
    });

    // No divergence: identical spawn-id sets.
    expect([...result.spawnedTaskIds].sort()).toEqual(legacySpawned);

    // The reducer's real executor additionally proves the cascade-dependent
    // landed NO_GO on disk — a claim planDispatch's model has no notion of at
    // all (it simply never spawns the dependent, for an unrelated reason: its
    // dependency's status isn't DONE).
    expect(readTaskFile(root, '2001-cascade-dep').status).toBe(TaskStatus.NO_GO);
    expect(readResultFile(root, '2001-cascade-dep').cascadeSkipped).toBe(true);
  });
});
