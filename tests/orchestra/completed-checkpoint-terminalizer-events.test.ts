import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHANNELS, readEvents, reconstructState } from '../../src/core/event-stream.js';
import { SprintPhase, SprintStatus, TaskEvaluation } from '../../src/core/types.js';

const mockBuildPreplannedResumeSprint = vi.fn();
const mockFinalizeSprint = vi.fn();
const mockPublishFinalSprintAuthority = vi.fn();
const mockPublishTestModeSprintTerminalReceipt = vi.fn();
const mockLoadFinalizerAttemptTasks = vi.fn();
const mockResolveSprintTerminalHandoff = vi.fn();
const mockCommitSprintTerminalHandoff = vi.fn();
const mockRunCleanupPhase = vi.fn();
const mockReadAuthoritativeTaskResult = vi.fn();

vi.mock('../../src/orchestra/sprint-checkpoint.js', () => ({
  buildPreplannedResumeSprint: (...args: unknown[]) => mockBuildPreplannedResumeSprint(...args),
}));

vi.mock('../../src/orchestra/sprint-finalizer.js', () => ({
  finalizeSprint: (...args: unknown[]) => mockFinalizeSprint(...args),
  loadFinalizerAttemptTasks: (...args: unknown[]) => mockLoadFinalizerAttemptTasks(...args),
  publishFinalSprintAuthority: (...args: unknown[]) => mockPublishFinalSprintAuthority(...args),
  publishTestModeSprintTerminalReceipt: (...args: unknown[]) => mockPublishTestModeSprintTerminalReceipt(...args),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  resolveSprintTerminalHandoff: (...args: unknown[]) => mockResolveSprintTerminalHandoff(...args),
  commitSprintTerminalHandoff: (...args: unknown[]) => mockCommitSprintTerminalHandoff(...args),
}));

vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  runCleanupPhase: (...args: unknown[]) => mockRunCleanupPhase(...args),
}));

vi.mock('../../src/orchestra/task-result-authority.js', () => ({
  readAuthoritativeTaskResult: (...args: unknown[]) => mockReadAuthoritativeTaskResult(...args),
}));

import { terminalizeCompletedCheckpointRun } from '../../src/orchestra/completed-checkpoint-terminalizer.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-terminalization-events-'));
  roots.push(root);
  return root;
}

const checkpoint = {
  sprintId: 'sprint-901',
  checkpointNumber: 7,
  timestamp: '2026-08-01T00:00:00.000Z',
  completedTasks: ['901-001'],
  pendingTasks: [],
  activeWorkers: [],
  brainPhase: SprintPhase.EVALUATE,
  eventStreamOffset: 12,
  executionMode: 'standard' as const,
  skipCleanup: true,
};

const metrics = {
  totalTasks: 1,
  completedTasks: 1,
  techDebtTasks: 0,
  noGoTasks: 0,
  unevaluatedTasks: 0,
  durationMs: 1,
  coveragePercent: 100,
  noGoRate: 0,
  newDebtCount: 0,
  resolvedDebtCount: 0,
  totalOpenDebt: 0,
  boundaryViolations: 0,
  crossAssignments: 0,
  contextLinesUsed: 0,
};

const authorizedHandoff = {
  state: 'AUTHORIZED' as const,
  sprintId: 'sprint-901',
  artifactPath: '/evidence/sprint-901-terminal-receipt.json',
  receipt: {
    version: 1,
    sprintId: 'sprint-901',
    runId: 'run-901',
    coordinatorGeneration: 3,
    authorityVersion: 1,
    logicalSettlementDigest: 'd'.repeat(64),
    terminalOutcome: 'COMPLETE' as const,
    publishedAt: '2026-08-01T00:01:00.000Z',
  },
  metrics,
  handoffKey: 'sprint-901:run-901:3:1:COMPLETE:digest',
};

describe('completed-checkpoint recovery event path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildPreplannedResumeSprint.mockReturnValue({
      id: 'sprint-901',
      number: 901,
      tasks: [{ id: '901-001' }],
      workers: [],
      startedAt: '2026-08-01T00:00:00.000Z',
      phase: SprintPhase.EVALUATE,
      status: SprintStatus.EVALUATING,
    });
    mockReadAuthoritativeTaskResult.mockReturnValue({
      state: 'AUTHORITATIVE',
      result: {
        taskId: '901-001',
        workerId: 'w-901-001',
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
        coverage: 100,
        selfAssessment: TaskEvaluation.DONE,
        brainEvaluation: TaskEvaluation.DONE,
        notes: 'persisted evaluation',
      },
    });
    mockLoadFinalizerAttemptTasks.mockImplementation((_root: string, sprint: { tasks: unknown[] }) => sprint.tasks);
    mockFinalizeSprint.mockResolvedValue(metrics);
    mockResolveSprintTerminalHandoff.mockReturnValue(authorizedHandoff);
    mockRunCleanupPhase.mockResolvedValue(null);
    mockCommitSprintTerminalHandoff.mockReturnValue(authorizedHandoff);
  });

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('persists an ordered terminalization-only timeline without replaying evaluator or workers', async () => {
    const root = makeRoot();

    const sprint = await terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
    );

    expect(sprint).toMatchObject({ status: SprintStatus.COMPLETE, phase: SprintPhase.COMPLETE });
    expect(mockFinalizeSprint).toHaveBeenCalledWith(
      root,
      expect.any(Object),
      new Map([['901-001', TaskEvaluation.DONE]]),
      expect.arrayContaining([expect.objectContaining({ taskId: '901-001' })]),
      expect.objectContaining({
        deferTerminalAuthority: true,
        lifecycleContext: 'completed-checkpoint-recovery',
      }),
    );

    const events = readEvents(root, checkpoint.sprintId);
    expect(events.map(event => event.channel)).toEqual([
      CHANNELS.RECOVERY_TERMINALIZATION_STARTED,
      CHANNELS.RECOVERY_EVIDENCE_REUSED,
      CHANNELS.RECOVERY_RECEIPT_AUTHORIZED,
      CHANNELS.RECOVERY_CLEANUP_SETTLED,
      CHANNELS.SPRINT_PHASE_CHANGE,
      CHANNELS.RECOVERY_TERMINALIZATION_COMPLETED,
    ]);
    expect(events[1]?.payload).toMatchObject({
      evaluatorRerun: false,
      workerRedispatchCount: 0,
      resultCount: 1,
      evaluationCount: 1,
    });
    expect(events[3]?.payload).toMatchObject({
      cleanupRequested: false,
      outcome: 'RETAINED_BY_POLICY',
      reason: 'persisted-skip-cleanup-policy',
    });
    expect(events[4]?.payload).toMatchObject({
      fromPhase: SprintPhase.EVALUATE,
      toPhase: SprintPhase.COMPLETE,
      transitionKind: 'completed-checkpoint-terminalization',
      replayedPhases: [],
    });
    expect(events.map(event => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(reconstructState(root, checkpoint.sprintId).phaseChanges.at(-1)?.phase)
      .toBe(SprintPhase.COMPLETE);
  });

  it('reuses dynamic fix-task evidence discovered by the canonical finalizer loader', async () => {
    const root = makeRoot();
    const fixTask = { id: '901-001-fix', sprintId: 'sprint-901' };
    mockLoadFinalizerAttemptTasks.mockReturnValue([
      { id: '901-001', sprintId: 'sprint-901' },
      fixTask,
    ]);
    mockReadAuthoritativeTaskResult.mockImplementation((_root: string, taskId: string) => ({
      state: 'AUTHORITATIVE',
      result: {
        taskId,
        workerId: `w-${taskId}`,
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: taskId.endsWith('-fix'),
        coverage: 100,
        selfAssessment: taskId.endsWith('-fix') ? TaskEvaluation.DONE : TaskEvaluation.NO_GO,
        brainEvaluation: taskId.endsWith('-fix') ? TaskEvaluation.DONE : TaskEvaluation.NO_GO,
        notes: 'persisted lineage evaluation',
      },
    }));

    await terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
    );

    expect(mockFinalizeSprint).toHaveBeenCalledWith(
      root,
      expect.any(Object),
      new Map([
        ['901-001', TaskEvaluation.NO_GO],
        ['901-001-fix', TaskEvaluation.DONE],
      ]),
      expect.arrayContaining([
        expect.objectContaining({ taskId: '901-001' }),
        expect.objectContaining({ taskId: '901-001-fix' }),
      ]),
      expect.objectContaining({ lifecycleContext: 'completed-checkpoint-recovery' }),
    );
    expect(readEvents(root, checkpoint.sprintId)[1]?.payload).toMatchObject({
      taskCount: 2,
      resultCount: 2,
      evaluationCount: 2,
    });
  });

  it('records the legacy safe-retention decision explicitly', async () => {
    const root = makeRoot();
    await terminalizeCompletedCheckpointRun(
      root,
      { ...checkpoint, skipCleanup: undefined },
      { auth_mode: 'subscription', language: 'en' } as never,
    );

    const cleanupEvent = readEvents(root, checkpoint.sprintId, {
      channel: CHANNELS.RECOVERY_CLEANUP_SETTLED,
    })[0];
    expect(cleanupEvent?.payload).toMatchObject({
      cleanupRequested: false,
      outcome: 'RETAINED_BY_POLICY',
      reason: 'legacy-checkpoint-safe-retention-default',
    });
  });

  it('emits a typed resumable HOLD at the exact failed stage', async () => {
    const root = makeRoot();
    mockResolveSprintTerminalHandoff.mockReturnValue({
      state: 'HOLD',
      sprintId: checkpoint.sprintId,
      artifactPath: '/evidence/missing.json',
      reasonCode: 'RECEIPT_MISSING',
      detail: 'no terminal receipt published',
    });

    await expect(terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
    )).rejects.toThrow('TERMINALIZATION_HANDOFF_HOLD:RECEIPT_MISSING');

    const events = readEvents(root, checkpoint.sprintId);
    expect(events.at(-1)).toMatchObject({
      channel: CHANNELS.RECOVERY_TERMINALIZATION_HELD,
      payload: {
        stage: 'handoff',
        resumable: true,
        recoveryCommand: 'deckent recover sprint-901 --resume',
      },
    });
    expect(mockRunCleanupPhase).not.toHaveBeenCalled();
    expect(mockPublishFinalSprintAuthority).not.toHaveBeenCalled();
  });

  it('never terminalizes a checkpoint task whose result authority is absent', async () => {
    const root = makeRoot();
    mockReadAuthoritativeTaskResult.mockReturnValue({
      state: 'ABSENT',
      result: null,
    });

    await expect(terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
    )).rejects.toThrow('TERMINALIZATION_RESULT_AUTHORITY_MISSING:901-001:ABSENT');

    expect(mockFinalizeSprint).not.toHaveBeenCalled();
    expect(mockPublishTestModeSprintTerminalReceipt).not.toHaveBeenCalled();
    expect(readEvents(root, checkpoint.sprintId).at(-1)).toMatchObject({
      channel: CHANNELS.RECOVERY_TERMINALIZATION_HELD,
      payload: { stage: 'evidence' },
    });
  });
});
