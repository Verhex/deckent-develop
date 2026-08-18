/**
 * N3 drain integration — verifies the full drain→kill→re-spawn single-flow
 * exercised by `drainNervousRespawns` inside `waitForResults`.
 *
 * The nervous WORKER_RESPAWN action writes a durable request to
 * `.deckent/nervous-respawn-requests.jsonl`; the sprint-controller drains it
 * on each tick. This test proves that with
 * `config.nervous_system.worker_respawn = true`:
 *   1. `killWorker` is called for the stale EXECUTING task
 *   2. The task transitions to PENDING and `spawnWorker` is called
 *   3. The loop eventually collects the re-spawned task's result
 *
 * Hermetic: all I/O uses a tmpdir; no real tmux, no real fs.watch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Task, Sprint, TaskResult } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type {
  SpawnBackend,
  SpawnBackendOptions,
} from '../../src/orchestra/spawn-backend.js';

// ─── Hoisted spies so mockImplementation can close over tmpDir ───────────────
const { killWorkerSpy, spawnWorkerSpy } = vi.hoisted(() => ({
  killWorkerSpy: vi.fn<[string], void>(),
  spawnWorkerSpy: vi.fn<[string, string, string, string, Record<string, unknown>], void>(),
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  killWorker: killWorkerSpy,
  spawnWorker: spawnWorkerSpy,
}));

// Controlled watcher: resolves waitForChange() immediately so each loop tick
// runs without a real fs.watch delay.
vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  })),
}));

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

// ─── Import after mocks are registered ───────────────────────────────────────
import { waitForResults } from '../../src/orchestra/result-collector.js';
import { requestWorkerRespawn } from '../../src/nervous/respawn-request.js';
import { settleTestRuntimeBudget } from '../helpers/budgeted-docker-execution-fixture.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `deckent-respawn-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

function makeTask(id: string, status: TaskStatus = TaskStatus.EXECUTING): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'test drain',
    model: 'claude-sonnet-5',
    provider: 'claude',
    authMode: 'subscription',
    type: 'code-development',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'no' },
    status,
    sprintId: 'sprint-test',
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
      profileRef: 'tests.orchestra.result-collector-respawn',
      policyDigest: '9'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test',
    number: 1,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: new Date().toISOString(),
  } as Sprint;
}

function writeDoneResult(dir: string, taskId: string): void {
  const result: TaskResult = {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 100,
    selfAssessment: 'DONE',
    notes: 'Respawned and done',
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      provider: 'claude',
      model: 'claude-sonnet-5',
    },
  };
  writeFileSync(
    join(dir, '.tasks', `task-${taskId}.result`),
    JSON.stringify(result),
    'utf-8',
  );
  settleTestRuntimeBudget(dir, taskId);
}

function makeSpawnBackend(projectRoot: string): SpawnBackend {
  return {
    name: 'respawn-test-backend',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'cooperative-landing',
    spawn(taskId, model, prompt, opts?: SpawnBackendOptions) {
      spawnWorkerSpy(
        taskId,
        String(model),
        prompt,
        projectRoot,
        opts as unknown as Record<string, unknown>,
      );
    },
    kill: killWorkerSpy,
    list: () => [],
    isAvailable: () => Promise.resolve(true),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('drainNervousRespawns — N3 drain integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    killWorkerSpy.mockClear();
    spawnWorkerSpy.mockClear();
    // When spawnWorker is called (re-spawn), immediately write the .result so
    // the next collectResults tick can terminate the loop.
    spawnWorkerSpy.mockImplementation((taskId: string) => {
      writeDoneResult(tmpDir, taskId);
    });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
    vi.clearAllMocks();
  });

  it('kills a stale EXECUTING task, resets to PENDING, and re-spawns it', async () => {
    const taskId = 'drain-001';
    const task = makeTask(taskId, TaskStatus.EXECUTING);
    const sprint = makeSprint([task]);

    // Write durable respawn request (the nervous WORKER_RESPAWN action does this).
    requestWorkerRespawn(tmpDir, taskId);
    const spawnBackend = makeSpawnBackend(tmpDir);

    const results = await waitForResults(
      tmpDir,
      sprint,
      10_000, // 10s timeout — test must finish well within this
      [],     // no queue
      { spawnBackend },
      undefined,
      // Opt-in via config.nervous_system.worker_respawn.
      // Omit dependency_pipeline_enabled → false → maybeRespawn is a no-op.
      { nervous_system: { worker_respawn: true } } as never,
    );

    // killWorker should have been called exactly once for this task.
    expect(killWorkerSpy).toHaveBeenCalledOnce();
    expect(killWorkerSpy).toHaveBeenCalledWith(taskId);

    // spawnWorker should have been called once (re-spawn via spawnIfNotAssigned).
    expect(spawnWorkerSpy).toHaveBeenCalledOnce();
    const spawnCall = spawnWorkerSpy.mock.calls[0]!;
    expect(spawnCall[0]).toBe(taskId);

    // The loop should have collected the result written by the spawnWorker mock.
    expect(results).toHaveLength(1);
    expect(results[0]!.taskId).toBe(taskId);
    expect(results[0]!.selfAssessment).toBe('DONE');
  });

  it('skips a DONE task in the respawn request (only stale active workers are respawned)', async () => {
    const taskId = 'drain-done-002';
    const task = makeTask(taskId, TaskStatus.DONE);
    const sprint = makeSprint([task]);

    // Write a .result so the loop can terminate immediately.
    writeDoneResult(tmpDir, taskId);
    // Also write a respawn request for a DONE task — drain must skip it.
    requestWorkerRespawn(tmpDir, taskId);
    const spawnBackend = makeSpawnBackend(tmpDir);

    const results = await waitForResults(
      tmpDir,
      sprint,
      10_000,
      [],
      { spawnBackend },
      undefined,
      { nervous_system: { worker_respawn: true } } as never,
    );

    // DONE task is not a live worker — drain must NOT kill or re-spawn it.
    expect(killWorkerSpy).not.toHaveBeenCalled();
    expect(spawnWorkerSpy).not.toHaveBeenCalled();

    // The pre-existing .result is still collected normally.
    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('DONE');
  });

  it('is a no-op when worker_respawn is disabled (config opt-out)', async () => {
    const taskId = 'drain-disabled-003';
    const task = makeTask(taskId, TaskStatus.EXECUTING);
    const sprint = makeSprint([task]);

    requestWorkerRespawn(tmpDir, taskId);

    // Write result directly so the loop terminates even without respawn.
    writeDoneResult(tmpDir, taskId);
    const spawnBackend = makeSpawnBackend(tmpDir);

    const results = await waitForResults(
      tmpDir,
      sprint,
      10_000,
      [],
      { spawnBackend },
      undefined,
      // worker_respawn explicitly false → drain is no-op.
      { nervous_system: { worker_respawn: false } } as never,
    );

    // Drain was a no-op — neither kill nor re-spawn.
    expect(killWorkerSpy).not.toHaveBeenCalled();
    expect(spawnWorkerSpy).not.toHaveBeenCalled();

    expect(results).toHaveLength(1);
  });
});
