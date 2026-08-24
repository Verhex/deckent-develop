/**
 * 427-008 SCHED6-EFF — CascadeSkip/WriteCheckpoint executor tests.
 *
 * docs/analysis/scheduler-unify-design-2026-07-11.md (Sprint-6 dilim, "Cascade ve
 * restore live") + Riskler: "Cascade persist-before-commit yapılmazsa crash sonrası
 * cross-fix muafiyet kanıtı kaybolur." (result-collector.ts:1433 — the legacy
 * `cascadeSkipDeadBlocked` closure commits in-memory state even when its `writeFile`
 * throws and is merely logged.)
 *
 * This suite pins `executeSchedulerDecision`'s (scheduler-effects.ts) new CascadeSkip
 * + WriteCheckpoint branches:
 *   1. CascadeSkip persists a `cascadeSkipped:true` NO_GO `.result`, flips the task to
 *      NO_GO, persists task-<id>.json, and reports the id.
 *   2. Persist-before-commit ORDER: the `.result.tmp` write always precedes the
 *      task-<id>.json write.
 *   3. A failed `.result` persist leaves the task PENDING and un-persisted — the
 *      actual fix for the legacy bug above.
 *   4. Replay-idempotent: an identical effect applied twice never rewrites the
 *      `.result` file and never double-counts the id.
 *   5. Crash-before-commit recovery: a `.result` already on disk with the task still
 *      PENDING gets its commit finished without the result being rewritten.
 *   6. WriteCheckpoint invokes the injected `deps.writeCheckpoint`, is a no-op when
 *      omitted, and a throwing dep never aborts the rest of the tick's effects.
 *   7. SpawnTask/KillWorker remain byte-identical (regression check).
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// ─── node:fs partial mock — records writeFileSync call order (for the
// persist-before-commit ordering assertion) and allows forcing a specific
// write to fail (for the persist-failure assertion), while every other call
// passes through to the real implementation so the rest of the suite behaves
// exactly like a real-tmpdir test (same idiom as ai-planner-honest-fallback.test.ts
// / brain-coverage.test.ts's `importOriginal` partial mocks). ───────────────
const writeFileCalls: string[] = [];
let forcedWriteFailurePath: string | null = null;

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: (path: unknown, data: unknown, enc?: unknown) => {
      writeFileCalls.push(String(path));
      if (forcedWriteFailurePath && String(path) === forcedWriteFailurePath) {
        throw new Error('simulated disk-full persist failure');
      }
      return (actual.writeFileSync as (...a: unknown[]) => void)(path, data, enc);
    },
  };
});

vi.mock('../../src/orchestra/task-builder.js', () => ({
  // Plain functions (not vi.fn) so beforeEach resetAllMocks cannot strip the
  // implementation the spawner depends on (skillDelivery.deliveredSkillIds).
  writeSkillDeliveryEvidence: () => {},
  applySkillDirectiveAuthority: (task: { assignedSkills?: string[] }) => task?.assignedSkills ?? [],
  buildSkillDeliveryEvidence: (task: { id?: string; assignedSkills?: string[]; forceSkills?: string[] }, delivered?: readonly string[]) => ({
    version: 1, taskId: task?.id ?? '', source: 'worker-prompt',
    deliveredSkillIds: [...(delivered ?? [])],
    assignedSkillIds: [...(task?.assignedSkills ?? [])],
    forcedSkillIds: [...(task?.forceSkills ?? [])],
    undeliveredForcedSkillIds: (task?.forceSkills ?? []).filter((id) => !(delivered ?? []).includes(id)),
  }),
  buildWorkerPrompt: vi.fn(() => 'mock-prompt'),
}));

import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import {
  executeSchedulerDecision,
} from '../../src/orchestra/scheduler-effects.js';
import type { SchedulerDecisionExecutionDeps } from '../../src/orchestra/scheduler-effects.js';
import type { SchedulerDecision, SchedulerEffect } from '../../src/orchestra/scheduler-reducer.js';
import { DeckentError } from '../../src/core/errors.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${randomBytes(4).toString('hex')}`);
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `desc ${id}`,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'no' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-427',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
    budget: { maxTurns: 1 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'tests.orchestra.scheduler-effects-cascade',
      policyDigest: '9'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
    ...overrides,
  } as Task;
}

function makeDecision(effects: SchedulerEffect[]): SchedulerDecision {
  return { nextQueue: [], dispositions: new Map(), orderedEffects: effects };
}

function baseDeps(
  root: string,
  taskMap: Map<string, Task>,
  overrides?: Partial<SchedulerDecisionExecutionDeps>,
): SchedulerDecisionExecutionDeps {
  return {
    projectRoot: root,
    sprintFallbackId: 'sprint-427',
    config: undefined,
    resolveAgentPrompt: async () => undefined,
    resolveSkillPrompts: async () => [],
    buildWriteTargets: () => ['.tasks/'],
    taskMap,
    assignedTaskIds: new Set(),
    killWorker: vi.fn(),
    ...overrides,
  };
}

function makeMockBackend(): SpawnBackend & { calls: Array<{ taskId: string }> } {
  const calls: Array<{ taskId: string }> = [];
  return {
    name: 'mock-backend',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'cooperative-landing',
    spawn(taskId: string, _model, _prompt, _opts?: SpawnBackendOptions) {
      calls.push({ taskId });
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

// ─── CascadeSkip — happy path ────────────────────────────────────────────────

describe('executeSchedulerDecision — CascadeSkip effect', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('cascade-happy'); writeFileCalls.length = 0; forcedWriteFailurePath = null; });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('persists a cascadeSkipped NO_GO result, flips task status, persists task json, and reports the id', async () => {
    const task = makeTask('800-002', { dependencies: ['800-001'] });
    const taskMap = new Map([[task.id, task]]);
    const decision = makeDecision([
      { kind: 'CascadeSkip', taskId: '800-002', failedDependencyId: '800-001', idempotencyKey: 'cascade-skip:800-002:800-001' },
    ]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, taskMap));

    expect(result.cascadeSkippedTaskIds).toEqual(['800-002']);
    expect(task.status).toBe(TaskStatus.NO_GO);

    const resultPath = join(root, '.tasks', 'task-800-002.result');
    expect(existsSync(resultPath)).toBe(true);
    const persistedResult = JSON.parse(readFileSync(resultPath, 'utf-8'));
    expect(persistedResult.cascadeSkipped).toBe(true);
    expect(persistedResult.selfAssessment).toBe('NO_GO');
    expect(persistedResult.notes).toContain('800-001');
    expect(existsSync(`${resultPath}.tmp`)).toBe(false); // tmp cleaned up by rename

    const persistedTask = JSON.parse(readFileSync(join(root, '.tasks', 'task-800-002.json'), 'utf-8'));
    expect(persistedTask.status).toBe(TaskStatus.NO_GO);
  });

  it('is a no-op (logged, no throw) when the CascadeSkip taskId is not in taskMap', async () => {
    const decision = makeDecision([
      { kind: 'CascadeSkip', taskId: 'does-not-exist', failedDependencyId: '800-001', idempotencyKey: 'cascade-skip:does-not-exist:800-001' },
    ]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, new Map()));

    expect(result.cascadeSkippedTaskIds).toEqual([]);
    expect(existsSync(join(root, '.tasks', 'task-does-not-exist.result'))).toBe(false);
  });

  it('writes the .result.tmp file strictly before persisting task-<id>.json (persist-before-commit order)', async () => {
    const task = makeTask('800-010', { dependencies: ['800-009'] });
    const taskMap = new Map([[task.id, task]]);
    const decision = makeDecision([
      { kind: 'CascadeSkip', taskId: '800-010', failedDependencyId: '800-009', idempotencyKey: 'cascade-skip:800-010:800-009' },
    ]);

    await executeSchedulerDecision(decision, baseDeps(root, taskMap));

    const resultTmpIndex = writeFileCalls.findIndex(p => p.endsWith(join('.tasks', 'task-800-010.result.tmp')));
    const taskJsonIndex = writeFileCalls.findIndex(p => p.endsWith(join('.tasks', 'task-800-010.json')));
    expect(resultTmpIndex).toBeGreaterThanOrEqual(0);
    expect(taskJsonIndex).toBeGreaterThanOrEqual(0);
    expect(resultTmpIndex).toBeLessThan(taskJsonIndex);
  });

  it('does NOT flip task status or persist task json when the .result write fails (legacy-bug fix)', async () => {
    const task = makeTask('800-020', { dependencies: ['800-019'] });
    const taskMap = new Map([[task.id, task]]);
    const decision = makeDecision([
      { kind: 'CascadeSkip', taskId: '800-020', failedDependencyId: '800-019', idempotencyKey: 'cascade-skip:800-020:800-019' },
    ]);

    forcedWriteFailurePath = join(root, '.tasks', 'task-800-020.result.tmp');
    const result = await executeSchedulerDecision(decision, baseDeps(root, taskMap));
    forcedWriteFailurePath = null;

    expect(result.cascadeSkippedTaskIds).toEqual([]);
    expect(task.status).toBe(TaskStatus.PENDING);
    expect(existsSync(join(root, '.tasks', 'task-800-020.json'))).toBe(false);
    expect(existsSync(join(root, '.tasks', 'task-800-020.result'))).toBe(false);
  });

  it('is idempotent on replay — a second identical effect does not rewrite the result or re-count the id', async () => {
    const task = makeTask('800-030', { dependencies: ['800-029'] });
    const taskMap = new Map([[task.id, task]]);
    const decision = makeDecision([
      { kind: 'CascadeSkip', taskId: '800-030', failedDependencyId: '800-029', idempotencyKey: 'cascade-skip:800-030:800-029' },
    ]);
    const resultPath = join(root, '.tasks', 'task-800-030.result');

    const first = await executeSchedulerDecision(decision, baseDeps(root, taskMap));
    const firstContent = readFileSync(resultPath, 'utf-8');

    const second = await executeSchedulerDecision(decision, baseDeps(root, taskMap));
    const secondContent = readFileSync(resultPath, 'utf-8');

    expect(first.cascadeSkippedTaskIds).toEqual(['800-030']);
    expect(second.cascadeSkippedTaskIds).toEqual([]);
    expect(secondContent).toBe(firstContent);
  });

  it('finishes an interrupted commit (result already on disk, task still PENDING) without rewriting the result', async () => {
    const task = makeTask('800-040', { dependencies: ['800-039'] }); // stays PENDING — never committed pre-"crash"
    const taskMap = new Map([[task.id, task]]);

    const preCrashResult = {
      taskId: '800-040',
      workerId: 'w-800-040',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      cascadeSkipped: true,
      notes: 'pre-crash synthetic result',
      tokenUsage: {
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'claude-sonnet-5',
      },
    };
    const resultPath = join(root, '.tasks', 'task-800-040.result');
    const preCrashContent = JSON.stringify(preCrashResult, null, 2);
    writeFileSync(resultPath, preCrashContent, 'utf-8');

    const decision = makeDecision([
      { kind: 'CascadeSkip', taskId: '800-040', failedDependencyId: '800-039', idempotencyKey: 'cascade-skip:800-040:800-039' },
    ]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, taskMap));

    expect(result.cascadeSkippedTaskIds).toEqual(['800-040']);
    expect(task.status).toBe(TaskStatus.NO_GO);
    expect(readFileSync(resultPath, 'utf-8')).toBe(preCrashContent); // untouched — not rewritten
    expect(existsSync(join(root, '.tasks', 'task-800-040.json'))).toBe(true);
  });
});

// ─── WriteCheckpoint ─────────────────────────────────────────────────────────

describe('executeSchedulerDecision — WriteCheckpoint effect', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('checkpoint'); writeFileCalls.length = 0; forcedWriteFailurePath = null; });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('invokes the injected writeCheckpoint dep with the effect reason', async () => {
    const writeCheckpoint = vi.fn();
    const decision = makeDecision([{ kind: 'WriteCheckpoint', reason: 'tick-progressed' }]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, new Map(), { writeCheckpoint }));

    expect(writeCheckpoint).toHaveBeenCalledWith('tick-progressed');
    expect(result.checkpointsWritten).toBe(1);
  });

  it('is a no-op when writeCheckpoint is omitted (documented default for un-wired callers)', async () => {
    const decision = makeDecision([{ kind: 'WriteCheckpoint', reason: 'cascade-skip-under-cost-stop' }]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, new Map()));

    expect(result.checkpointsWritten).toBe(0);
  });

  it('swallows a throwing writeCheckpoint dep and still processes the rest of the tick', async () => {
    const writeCheckpoint = vi.fn(() => { throw new Error('disk full'); });
    const killWorker = vi.fn();
    const decision = makeDecision([
      { kind: 'WriteCheckpoint', reason: 'tick-progressed' },
      { kind: 'KillWorker', taskId: '800-050', reason: 'legacy-fifo-replace' },
    ]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, new Map(), { writeCheckpoint, killWorker }));

    expect(result.checkpointsWritten).toBe(0);
    expect(killWorker).toHaveBeenCalledWith('800-050');
    expect(result.killedWorkerIds).toEqual(['800-050']);
  });
});

// ─── Regression — SpawnTask/KillWorker remain byte-identical ────────────────

describe('executeSchedulerDecision — SpawnTask/KillWorker regression (must stay unchanged)', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('regression'); writeFileCalls.length = 0; forcedWriteFailurePath = null; });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('spawns a SpawnTask effect through the mock backend and persists task-<id>.json as EXECUTING', async () => {
    const task = makeTask('800-060');
    const taskMap = new Map([[task.id, task]]);
    const backend = makeMockBackend();
    const decision = makeDecision([{ kind: 'SpawnTask', taskId: '800-060', reason: 'queue-drain' }]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, taskMap, { backend }));

    expect(result.spawnedTaskIds).toEqual(['800-060']);
    expect(backend.calls).toHaveLength(1);
    expect(task.status).toBe(TaskStatus.EXECUTING);
    const persisted = JSON.parse(readFileSync(join(root, '.tasks', 'task-800-060.json'), 'utf-8'));
    expect(persisted.status).toBe(TaskStatus.EXECUTING);
  });

  it('settles a deterministic attribution admission failure once instead of retrying forever', async () => {
    const task = makeTask('800-061');
    const taskMap = new Map([[task.id, task]]);
    const backend = makeMockBackend();
    backend.spawn = vi.fn(() => {
      throw new DeckentError(
        'E_ATTRIBUTION_BASELINE_CAPTURE_FAILED',
        'attribution-baseline-capture-failed:docs/evidence',
      );
    });
    const decision = makeDecision([{ kind: 'SpawnTask', taskId: task.id, reason: 'queue-drain' }]);

    const first = await executeSchedulerDecision(decision, baseDeps(root, taskMap, { backend }));
    const resultPath = join(root, '.tasks', `task-${task.id}.result`);
    const firstBytes = readFileSync(resultPath, 'utf-8');
    const result = JSON.parse(firstBytes);

    expect(task.status).toBe(TaskStatus.NO_GO);
    expect(first.spawnSkips).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: task.id, reasonCode: 'spawn-admission-settled' }),
    ]));
    expect(result.preDispatchSettlement).toMatchObject({
      state: 'NOT_DISPATCHED',
      reasonCode: 'ATTRIBUTION_BASELINE_CAPTURE_FAILED',
    });
    expect(result.tokenUsage).toMatchObject({ inputTokens: 0, outputTokens: 0 });

    await executeSchedulerDecision(decision, baseDeps(root, taskMap, { backend }));
    expect(readFileSync(resultPath, 'utf-8')).toBe(firstBytes);
    expect(backend.spawn).toHaveBeenCalledTimes(1);
  });

  it('keeps an unclassified spawn exception retryable and does not forge a settlement', async () => {
    const task = makeTask('800-062');
    const taskMap = new Map([[task.id, task]]);
    const backend = makeMockBackend();
    backend.spawn = vi.fn(() => { throw new Error('transient transport reset'); });
    const decision = makeDecision([{ kind: 'SpawnTask', taskId: task.id, reason: 'queue-drain' }]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, taskMap, { backend }));

    expect(task.status).toBe(TaskStatus.PENDING);
    expect(existsSync(join(root, '.tasks', `task-${task.id}.result`))).toBe(false);
    expect(result.spawnSkips).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: task.id, reasonCode: 'spawn-threw' }),
    ]));
    const persisted = JSON.parse(readFileSync(join(root, '.tasks', `task-${task.id}.json`), 'utf-8'));
    expect(persisted.schedulerSpawnAttempts).toBe(1);
    expect(persisted.retryAfter).toBeGreaterThan(Date.now());
  });

  it('bounds unknown host retries with durable backoff and terminal HOLD', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const task = makeTask('800-063');
    const taskMap = new Map([[task.id, task]]);
    const backend = makeMockBackend();
    backend.spawn = vi.fn(() => { throw new Error('transient transport reset'); });
    const decision = makeDecision([{ kind: 'SpawnTask', taskId: task.id, reason: 'queue-drain' }]);

    await executeSchedulerDecision(decision, baseDeps(root, taskMap, { backend }));
    const duringBackoff = await executeSchedulerDecision(decision, baseDeps(root, taskMap, { backend }));
    expect(backend.spawn).toHaveBeenCalledTimes(1);
    expect(duringBackoff.spawnSkips).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: 'spawn-retry-backoff' }),
    ]));

    await vi.advanceTimersByTimeAsync(1_000);
    await executeSchedulerDecision(decision, baseDeps(root, taskMap, { backend }));
    await vi.advanceTimersByTimeAsync(2_000);
    const terminal = await executeSchedulerDecision(decision, baseDeps(root, taskMap, { backend }));

    expect(backend.spawn).toHaveBeenCalledTimes(3);
    expect(task.status).toBe(TaskStatus.PAUSED);
    expect(terminal.spawnSkips).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: 'spawn-retry-held' }),
    ]));
    const persisted = JSON.parse(readFileSync(join(root, '.tasks', `task-${task.id}.json`), 'utf-8'));
    expect(persisted).toMatchObject({ status: TaskStatus.PAUSED, schedulerSpawnAttempts: 3 });
    expect(persisted.retryAfter).toBeUndefined();
    vi.useRealTimers();
  });

  it('kills a worker via the injected killWorker dep for a KillWorker effect', async () => {
    const killWorker = vi.fn();
    const decision = makeDecision([{ kind: 'KillWorker', taskId: '800-070', reason: 'legacy-fifo-replace' }]);

    const result = await executeSchedulerDecision(decision, baseDeps(root, new Map(), { killWorker }));

    expect(killWorker).toHaveBeenCalledWith('800-070');
    expect(result.killedWorkerIds).toEqual(['800-070']);
  });

  it('runs SpawnTask, KillWorker, CascadeSkip, and WriteCheckpoint in the same tick without cross-interference', async () => {
    const spawnTask = makeTask('800-080');
    const cascadeTask = makeTask('800-081', { dependencies: ['800-079'] });
    const taskMap = new Map([[spawnTask.id, spawnTask], [cascadeTask.id, cascadeTask]]);
    const backend = makeMockBackend();
    const killWorker = vi.fn();
    const writeCheckpoint = vi.fn();

    const decision = makeDecision([
      { kind: 'CascadeSkip', taskId: '800-081', failedDependencyId: '800-079', idempotencyKey: 'cascade-skip:800-081:800-079' },
      { kind: 'SpawnTask', taskId: '800-080', reason: 'pending-slot-fill' },
      { kind: 'KillWorker', taskId: '800-082', reason: 'legacy-fifo-replace' },
      { kind: 'WriteCheckpoint', reason: 'tick-progressed' },
    ]);

    const result = await executeSchedulerDecision(
      decision,
      baseDeps(root, taskMap, { backend, killWorker, writeCheckpoint }),
    );

    expect(result.spawnedTaskIds).toEqual(['800-080']);
    expect(result.killedWorkerIds).toEqual(['800-082']);
    expect(result.cascadeSkippedTaskIds).toEqual(['800-081']);
    expect(result.checkpointsWritten).toBe(1);
    expect(spawnTask.status).toBe(TaskStatus.EXECUTING);
    expect(cascadeTask.status).toBe(TaskStatus.NO_GO);
  });
});
