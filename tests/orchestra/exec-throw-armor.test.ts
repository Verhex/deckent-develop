/**
 * Sprint 352 Task 352-002 — EXEC-THROW-HUNT (born-452/453, ADR-G-025)
 *
 * sprint-351: the waitForResults main loop died mid-EXECUTE from an unguarded
 * throw (12/18 tasks collected, queue abandoned — resource-log showed tasks
 * 014-018 never dispatched at all). born-453 already fixed the SURFACING
 * (sprint-controller.ts's EXECUTE catch now reports instead of silently
 * swallowing) — this suite proves the SURVIVAL + root-cause fixes:
 *
 *   (a) tick-armor — a single tick-step throwing no longer kills the main
 *       while loop; the SAME error repeating on >5 consecutive ticks escalates
 *       (rethrows) instead of looping silently forever.
 *   (b) throw-candidate closure — the two most likely unguarded-throw paths
 *       across the 6 tick functions (both inside spawnIfNotAssigned, shared by
 *       dispatchTick/forceRescanIfIdle/dispatchReadyTasks/drainNervousRespawns):
 *         #1 resolveAgentPrompt/resolveSkillPrompts/buildWorkerPrompt used to
 *            run OUTSIDE spawnIfNotAssigned's try/catch, with
 *            assignedTaskIds.add(id) already applied — a throw there leaked
 *            the task id forever (permanent "assigned but never spawned"
 *            deadlock, exactly row-452's symptom).
 *         #2 `...task.scope.directories` / `...task.scope.filesWrite` spread
 *            of a possibly-undefined array ("is not iterable") on a malformed
 *            task.
 *   (c) planContinuous dep-drop — a dep-blocked head-of-queue entry used to be
 *       shift()'d off remainingQueue before its dependency was checked,
 *       dropping it from the queue permanently; now it's skipped IN PLACE.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Hoisted mutable mock state (shared with vi.mock factories below) ────

const watcherState = vi.hoisted(() => ({ delayMs: 0 }));
const respawnDrainState = vi.hoisted(() => ({
  callCount: 0,
  throwUntilCall: 0,
  alwaysThrow: false,
}));
const buildPromptState = vi.hoisted(() => ({ callCount: 0 }));

// Fast/controllable replacement for the real fs.watch-based watcher — mirrors
// tests/orchestra/dispatch-evaluate-race.test.ts's pattern, extended with a
// per-test configurable delay so tick pacing can be controlled deterministically.
vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: () => ({
    waitForChange: () => new Promise<void>(resolve => setTimeout(resolve, watcherState.delayMs)),
    close: () => {},
  }),
}));

// drainNervousRespawns' sole external call — injectable throw for the
// tick-armor tests (part a).
vi.mock('../../src/nervous/respawn-request.js', () => ({
  RESPAWN_REQUESTS_FILE: '.deckent/nervous-respawn-requests.jsonl',
  drainRespawnRequests: vi.fn(() => {
    respawnDrainState.callCount++;
    if (respawnDrainState.alwaysThrow || respawnDrainState.callCount <= respawnDrainState.throwUntilCall) {
      throw new Error('injected-respawn-drain-error');
    }
    return [];
  }),
  requestWorkerRespawn: vi.fn(),
}));

// spawnIfNotAssigned's prompt-template call — injectable throw for the
// candidate-#1 closure test (part b). Full replacement is safe: result-collector.ts
// imports only `buildWorkerPrompt` from this module.
vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn(() => {
    buildPromptState.callCount++;
    if (buildPromptState.callCount === 1) {
      throw new Error('injected-prompt-build-error');
    }
    return 'stub-prompt';
  }),
}));

// Spy on debugLog (delegating to the real implementation) so the tick-armor
// logging can be asserted on without disturbing readJsonSafe and the rest of
// this heavily-used module.
vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, debugLog: vi.fn(actual.debugLog) };
});

import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, TaskResult } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import { debugLog } from '../../src/core/utils.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
} from '../helpers/budgeted-docker-execution-fixture.js';
import {
  planDispatch,
  buildSpawnWriteTargets,
  waitForResults,
} from '../../src/orchestra/result-collector.js';

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
    sprintId: 'sprint-352',
    createdAt: '2026-07-01T00:00:00.000Z',
    assignedAgent: 'generic',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-352',
    number: 352,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: '2026-07-01T00:00:00.000Z',
  } as Sprint;
}

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
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
    dependency_pipeline_enabled: false,
    ...overrides,
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
  };
}

// ═════════════════════════════════════════════════════════════════════
// (b) candidate #2 — buildSpawnWriteTargets: undefined-scope spread throw
// ═════════════════════════════════════════════════════════════════════

describe('buildSpawnWriteTargets — born-452 THROW-ADAYLARI candidate #2', () => {
  it('does not throw when scope.directories/filesWrite are undefined (malformed/legacy task)', () => {
    const malformed = { scope: {} } as unknown as Pick<Task, 'scope'>;
    expect(() => buildSpawnWriteTargets(malformed)).not.toThrow();
    expect(buildSpawnWriteTargets(malformed)).toEqual(['.tasks/']);
  });

  it('preserves existing behavior for a well-formed scope', () => {
    const task = {
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/result-collector.ts'] },
    };
    expect(buildSpawnWriteTargets(task)).toEqual([
      '.tasks/', 'src/orchestra/', 'src/orchestra/result-collector.ts',
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// (c) planContinuous dep-drop fix — regression test
// ═════════════════════════════════════════════════════════════════════

describe('planContinuous — dep-drop fix (born-452 part c)', () => {
  it('skips a dep-blocked head-of-queue task IN PLACE — it stays in remainingQueue', () => {
    const t1 = makeTask('t1', { status: TaskStatus.PENDING }); // dep target, not yet done
    const t2 = makeTask('t2', { status: TaskStatus.PENDING, dependencies: ['t1'] }); // blocked
    const t3 = makeTask('t3', { status: TaskStatus.PENDING }); // no deps — eligible

    const sprint = makeSprint([t1, t2, t3]);
    const config = makeConfig({ dependency_pipeline_enabled: true });
    const queue: Task[] = [t2, t3]; // t2 (blocked) sits at the head, t3 behind it

    const plan = planDispatch({
      sprint,
      config,
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      remainingQueue: queue,
      completedTaskIds: [],
    });

    // t3 spawns this tick (no deps); t2 does NOT (t1 not DONE yet).
    expect(plan.toSpawn.map(t => t.id)).toContain('t3');
    expect(plan.toSpawn.map(t => t.id)).not.toContain('t2');
    // Critical: t2 was NOT dropped from the queue — it's still there for a later tick.
    expect(queue.map(t => t.id)).toEqual(['t2']);
  });

  it('lets the previously-blocked queued task enter the spawn plan once its dependency completes', () => {
    const t1 = makeTask('t1', { status: TaskStatus.DONE }); // now done
    const t2 = makeTask('t2', { status: TaskStatus.PENDING, dependencies: ['t1'] });

    const sprint = makeSprint([t1, t2]);
    const config = makeConfig({ dependency_pipeline_enabled: true });
    // Same queue reference that would remain after the previous tick's splice.
    const queue: Task[] = [t2];

    const plan = planDispatch({
      sprint,
      config,
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(['t1']),
      remainingQueue: queue,
      completedTaskIds: ['t1'],
    });

    expect(plan.toSpawn.map(t => t.id)).toEqual(['t2']);
    expect(queue).toHaveLength(0); // consumed now that it was actually selected
  });

  it('does not disturb an already-assigned queue entry\'s drop semantics (no requeue needed)', () => {
    const t1 = makeTask('t1', { status: TaskStatus.PENDING });
    const sprint = makeSprint([t1]);
    const config = makeConfig({ dependency_pipeline_enabled: false });
    const queue: Task[] = [t1];

    const plan = planDispatch({
      sprint,
      config,
      maxWorkers: 2,
      assignedTaskIds: new Set(['t1']), // already spawned elsewhere
      collectedIds: new Set(),
      remainingQueue: queue,
      completedTaskIds: [],
    });

    expect(plan.toSpawn).toHaveLength(0);
    expect(queue).toHaveLength(0); // correctly dropped — already running, no requeue
  });
});

// ═════════════════════════════════════════════════════════════════════
// (b) candidate #1 — spawnIfNotAssigned prompt-build throw → retry
// ═════════════════════════════════════════════════════════════════════

describe('spawnIfNotAssigned — prompt-build throw retry (born-452 THROW-ADAYLARI candidate #1)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    buildPromptState.callCount = 0;
    watcherState.delayMs = 0;
    root = mkdtempSync(join(tmpdir(), 'deckent-throw-armor-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('retries a dependency-ready task after buildWorkerPrompt throws once, instead of leaking it into assignedTaskIds forever', async () => {
    // a is already active with a real result on disk; b is PENDING dep=[a].
    // buildWorkerPrompt (mocked above) throws on its very first invocation —
    // the FIRST attempt to spawn b via dispatchReadyTasks. Pre-fix, that throw
    // happened OUTSIDE spawnIfNotAssigned's try/catch with assignedTaskIds
    // already containing 'b' — permanently orphaning it (never retried, never
    // collected). Post-fix, the widened try/catch rolls assignedTaskIds back,
    // so the NEXT tick's dispatchReadyTasks retries b, buildWorkerPrompt
    // succeeds the second time, and b is actually spawned.
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    writeFileSync(join(root, '.tasks', 'task-a.result'), JSON.stringify(doneResult('a')), 'utf-8');

    const spawned: string[] = [];
    const backend: SpawnBackend = {
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      name: 'mock',
      spawn: (taskId: string) => {
        spawned.push(taskId);
        writeFileSync(join(root, '.tasks', `task-${taskId}.result`), JSON.stringify(doneResult(taskId)), 'utf-8');
      },
      kill: () => {},
      list: () => [],
      isAvailable: async () => true,
    };

    const results = await waitForResults(
      root, sprint, 3000, undefined,
      { spawnBackend: backend, autoApprove: true }, undefined, makeConfig(),
    );

    // The mock threw exactly once (b's first attempt) and was called again (retry).
    expect(buildPromptState.callCount).toBeGreaterThanOrEqual(2);
    expect(spawned).toContain('b');
    const rb = results.find(r => r.taskId === 'b');
    expect(rb).toBeDefined();
    expect(rb!.selfAssessment).toBe('DONE');
  });
});

// ═════════════════════════════════════════════════════════════════════
// (a) tick-armor — main while loop survives + escalates
// ═════════════════════════════════════════════════════════════════════

describe('waitForResults — tick-armor (born-452 part a)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    respawnDrainState.callCount = 0;
    respawnDrainState.throwUntilCall = 0;
    respawnDrainState.alwaysThrow = false;
    watcherState.delayMs = 0;
    root = mkdtempSync(join(tmpdir(), 'deckent-tick-armor-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('survives transient identical tick errors and still completes once they stop', async () => {
    // drainNervousRespawns (via drainRespawnRequests) throws the SAME error on
    // its first 3 calls, then recovers. Task a's result is written after a
    // short real delay so several ticks elapse (with the transient error
    // firing) before completion — proving the loop survives repeats UNDER
    // the escalation ceiling, not just a single one-off throw.
    respawnDrainState.throwUntilCall = 3;
    watcherState.delayMs = 5;

    const a = makeTask('a', { status: TaskStatus.PENDING });
    const sprint = makeSprint([a]);
    const config = makeConfig({ nervous_system: { enabled: true, mode: 'balanced', worker_respawn: true, actionOverrides: {} } as ResolvedConfig['nervous_system'] });

    setTimeout(() => {
      writeFileSync(join(root, '.tasks', 'task-a.result'), JSON.stringify(doneResult('a')), 'utf-8');
    }, 30);

    const results = await waitForResults(root, sprint, 5000, undefined, undefined, undefined, config);

    expect(results.map(r => r.taskId)).toEqual(['a']);
    // The transient error actually fired more than once before recovering.
    expect(respawnDrainState.callCount).toBeGreaterThan(3);
  });

  it('escalates (rethrows) once the SAME error repeats on more than 5 consecutive ticks', async () => {
    // drainNervousRespawns' error never recovers, and task a never completes
    // (no .result ever written) — the loop keeps ticking, hits the identical
    // error every time, and must escalate rather than spin silently forever.
    respawnDrainState.alwaysThrow = true;
    watcherState.delayMs = 0;

    const a = makeTask('a', { status: TaskStatus.PENDING });
    const sprint = makeSprint([a]);
    const config = makeConfig({ nervous_system: { enabled: true, mode: 'balanced', worker_respawn: true, actionOverrides: {} } as ResolvedConfig['nervous_system'] });

    await expect(
      waitForResults(root, sprint, 5000, undefined, undefined, undefined, config),
    ).rejects.toThrow('injected-respawn-drain-error');

    // Escalates on the 6th consecutive identical failure (N>5), not immediately.
    expect(respawnDrainState.callCount).toBeGreaterThanOrEqual(6);
  });

  it('logs a tick-armor debug entry when a tick step throws', async () => {
    // task a's result must NOT be collectible at entry — the pre-loop initial
    // collectResults()+dispatchTick() call (before the armored main loop even
    // starts) would otherwise complete the sprint early and never reach the
    // main loop at all. Delay the write so at least one real main-loop tick —
    // and therefore the injected drainRespawnRequests throw — occurs first.
    const debugLogSpy = vi.mocked(debugLog);
    respawnDrainState.throwUntilCall = 2;
    watcherState.delayMs = 5;

    const a = makeTask('a', { status: TaskStatus.PENDING });
    const sprint = makeSprint([a]);
    const config = makeConfig({ nervous_system: { enabled: true, mode: 'balanced', worker_respawn: true, actionOverrides: {} } as ResolvedConfig['nervous_system'] });
    setTimeout(() => {
      writeFileSync(join(root, '.tasks', 'task-a.result'), JSON.stringify(doneResult('a')), 'utf-8');
    }, 20);

    await waitForResults(root, sprint, 3000, undefined, undefined, undefined, config);

    expect(debugLogSpy.mock.calls.some(([tag]) => tag === 'waitForResults:tickArmor')).toBe(true);
  });
});
