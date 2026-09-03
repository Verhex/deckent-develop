import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHANNELS, readEvents, reconstructState, writeEvent } from '../../src/core/event-stream.js';
import { SprintPhase, SprintStatus, TaskEvaluation } from '../../src/core/types.js';

const mockBuildPreplannedResumeSprint = vi.fn();
const mockReadResumeTaskResultAuthority = vi.fn();
const mockFinalizeSprint = vi.fn();
const mockPublishFinalSprintAuthority = vi.fn();
const mockPublishOutermostSprintTerminalArchive = vi.fn();
const mockPublishTestModeSprintTerminalReceipt = vi.fn();
const mockLoadFinalizerAttemptTasks = vi.fn();
const mockResolveSprintTerminalHandoff = vi.fn();
const mockCommitSprintTerminalHandoff = vi.fn();
const mockRunCleanupPhase = vi.fn();

vi.mock('../../src/orchestra/sprint-checkpoint.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/orchestra/sprint-checkpoint.js')>(),
  buildPreplannedResumeSprint: (...args: unknown[]) => mockBuildPreplannedResumeSprint(...args),
  readResumeTaskResultAuthority: (...args: unknown[]) => mockReadResumeTaskResultAuthority(...args),
}));

vi.mock('../../src/orchestra/sprint-finalizer.js', () => ({
  finalizeSprint: (...args: unknown[]) => mockFinalizeSprint(...args),
  loadFinalizerAttemptTasks: (...args: unknown[]) => mockLoadFinalizerAttemptTasks(...args),
  publishFinalSprintAuthority: (...args: unknown[]) => mockPublishFinalSprintAuthority(...args),
  publishOutermostSprintTerminalArchive: (...args: unknown[]) => mockPublishOutermostSprintTerminalArchive(...args),
  publishTestModeSprintTerminalReceipt: (...args: unknown[]) => mockPublishTestModeSprintTerminalReceipt(...args),
  SprintTerminalArchivePublicationError: class SprintTerminalArchivePublicationError extends Error {
    constructor(message: string, readonly archiveSealed: boolean) {
      super(message);
    }
  },
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  resolveSprintTerminalHandoff: (...args: unknown[]) => mockResolveSprintTerminalHandoff(...args),
  commitSprintTerminalHandoff: (...args: unknown[]) => mockCommitSprintTerminalHandoff(...args),
}));

vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  runCleanupPhase: (...args: unknown[]) => mockRunCleanupPhase(...args),
}));

import { terminalizeCompletedCheckpointRun } from '../../src/orchestra/completed-checkpoint-terminalizer.js';
import { SprintTerminalArchivePublicationError } from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

const exactDigest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function exactTerminalAuthority(taskId: string, verdict: 'DONE' | 'NO_GO') {
  const identity = {
    schemaVersion: 2 as const,
    backend: 'docker' as const,
    projectRootSha256: 'a'.repeat(64),
    projectId: 'terminalizer-project',
    taskId,
    attemptId: `exact-attempt:${taskId}`,
    generation: 1,
  };
  const acceptedAuthority = {
    executionMode: 'normal-docker' as const,
    identity,
    admissionReceiptDigest: exactDigest('1'),
    acceptedResultRef: {
      schemaVersion: 2 as const,
      kind: 'task-accepted-result-v2-ref' as const,
      identity,
      artifactKey: 'accepted-result',
      artifactReceiptDigest: exactDigest('2'),
    },
    acceptedResultChainDigest: exactDigest('3'),
    resultDigest: exactDigest('4'),
  };
  const terminalResultAuthority = {
    executionMode: 'normal-docker' as const,
    identity,
    admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
    settlementRef: {
      schemaVersion: 2 as const,
      kind: 'task-result-settlement-v2-ref' as const,
      identity,
      artifactKey: 'settlement',
      artifactReceiptDigest: exactDigest('5'),
    },
    settlementDigest: exactDigest('6'),
    resultDigest: acceptedAuthority.resultDigest,
    acceptedResultChainDigest: acceptedAuthority.acceptedResultChainDigest,
    evaluationChainDigest: exactDigest('7'),
    finalizerChainDigest: exactDigest('8'),
    evaluationArtifact: {
      artifactReceiptDigest: exactDigest('9'),
      chainDigest: exactDigest('7'),
      artifactSha256: exactDigest('a'),
      byteLength: 128,
    },
    finalizerArtifact: {
      artifactReceiptDigest: exactDigest('b'),
      chainDigest: exactDigest('8'),
      artifactSha256: exactDigest('c'),
      byteLength: 96,
    },
  };
  return {
    schemaVersion: 2 as const,
    kind: 'exact-accepted-result-terminal-authority-v2' as const,
    acceptedAuthority,
    terminalResultAuthority,
    terminalDecisionAuthority: {
      schemaVersion: 2 as const,
      kind: 'exact-task-terminal-decision-authority-v2' as const,
      identity,
      evaluationReceipt: {
        verdict,
        artifactReceiptDigest: terminalResultAuthority.evaluationArtifact.artifactReceiptDigest,
        artifactSha256: terminalResultAuthority.evaluationArtifact.artifactSha256,
        byteLength: terminalResultAuthority.evaluationArtifact.byteLength,
        chainDigest: terminalResultAuthority.evaluationChainDigest,
      },
      finalizerReceipt: {
        state: 'terminal-ready' as const,
        artifactReceiptDigest: terminalResultAuthority.finalizerArtifact.artifactReceiptDigest,
        artifactSha256: terminalResultAuthority.finalizerArtifact.artifactSha256,
        byteLength: terminalResultAuthority.finalizerArtifact.byteLength,
        chainDigest: terminalResultAuthority.finalizerChainDigest,
      },
    },
  };
}

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
    mockReadResumeTaskResultAuthority.mockReturnValue({
      state: 'terminal',
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
    mockPublishOutermostSprintTerminalArchive.mockImplementation((input: {
      projectRoot: string;
      sprintId: string;
      terminalEvents: Array<{ channel: string; payload: Record<string, unknown>; target?: string }>;
    }) => {
      for (const event of input.terminalEvents) {
        writeEvent(
          input.projectRoot,
          input.sprintId,
          'brain',
          event.target ?? '*',
          event.channel,
          event.payload,
        );
      }
    });
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
    expect(mockPublishOutermostSprintTerminalArchive).toHaveBeenCalledWith(expect.objectContaining({
      sprintId: checkpoint.sprintId,
      receipt: authorizedHandoff.receipt,
      terminalEvents: [
        expect.objectContaining({ channel: CHANNELS.SPRINT_PHASE_CHANGE }),
        expect.objectContaining({ channel: CHANNELS.RECOVERY_TERMINALIZATION_COMPLETED }),
      ],
    }));
  });

  it('reuses dynamic fix-task evidence discovered by the canonical finalizer loader', async () => {
    const root = makeRoot();
    const fixTask = { id: '901-001-fix', sprintId: 'sprint-901' };
    mockLoadFinalizerAttemptTasks.mockReturnValue([
      { id: '901-001', sprintId: 'sprint-901' },
      fixTask,
    ]);
    mockReadResumeTaskResultAuthority.mockImplementation((_root: string, taskId: string) => ({
      state: 'terminal',
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

  it('reuses only a Store-revalidated T11 receipt for an exact checkpoint task', async () => {
    const root = makeRoot();
    const terminalAuthority = exactTerminalAuthority('901-001', 'NO_GO');
    const exactCheckpoint = {
      ...checkpoint,
      schemaVersion: 2 as const,
      taskStates: [{
        id: '901-001',
        status: 'DONE' as const,
        exactTerminalAuthority: terminalAuthority,
      }],
    };
    const projectedResult = {
      taskId: '901-001',
      workerId: 'w-901-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 100,
      selfAssessment: TaskEvaluation.DONE,
      notes: 'Store-projected exact result',
    };
    const current = {
      state: 'current' as const,
      terminalAuthority,
      terminalResultAuthority: terminalAuthority.terminalResultAuthority,
      evaluationReceipt: { verdict: TaskEvaluation.NO_GO },
      finalizerReceipt: { verdict: TaskEvaluation.NO_GO },
      result: {
        taskId: '901-001',
        attemptCustody: { identity: terminalAuthority.acceptedAuthority.identity },
      },
      projectedResult,
    } as never;
    const revalidate = vi.fn(() => current);

    await terminalizeCompletedCheckpointRun(
      root,
      exactCheckpoint as never,
      { auth_mode: 'subscription', language: 'en' } as never,
      undefined,
      revalidate,
    );

    expect(mockReadResumeTaskResultAuthority).not.toHaveBeenCalled();
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(mockFinalizeSprint).toHaveBeenCalledWith(
      root,
      expect.any(Object),
      new Map([['901-001', TaskEvaluation.NO_GO]]),
      [projectedResult],
      expect.objectContaining({
        exactTerminalAuthorities: new Map([['901-001', current]]),
      }),
    );
    expect(readEvents(root, checkpoint.sprintId)[1]?.payload).toMatchObject({
      source: 'store-revalidated-exact-terminal-authority',
    });
  });

  it('holds a completed checkpoint when exact custody exists without its Store reference', async () => {
    const root = makeRoot();
    mockReadResumeTaskResultAuthority.mockReturnValue({
      state: 'pending-settlement',
      result: null,
    });

    await expect(terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
    )).rejects.toThrow(/TERMINALIZATION_RESULT_AUTHORITY_MISSING:901-001:pending-settlement/u);

    expect(mockFinalizeSprint).not.toHaveBeenCalled();
  });

  it('rejects a forged public terminal verdict when Store marks the task exact but the checkpoint ref is missing', async () => {
    const root = makeRoot();
    const isExactTask = vi.fn((taskId: string) => taskId === '901-001');

    await expect(terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
      undefined,
      undefined,
      isExactTask,
    )).rejects.toThrow(/TERMINALIZATION_EXACT_AUTHORITY_REFERENCE_MISSING:901-001/u);

    expect(isExactTask).toHaveBeenCalledWith('901-001');
    expect(mockReadResumeTaskResultAuthority).not.toHaveBeenCalled();
    expect(mockFinalizeSprint).not.toHaveBeenCalled();
  });

  it('fails closed when the Store discriminator cannot prove exact or legacy custody', async () => {
    const root = makeRoot();

    await expect(terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
      undefined,
      undefined,
      () => ({ state: 'hold', reasonCode: 'custody-store-unreadable' }),
    )).rejects.toThrow(/exact execution discriminator is unavailable: custody-store-unreadable/u);

    expect(mockReadResumeTaskResultAuthority).not.toHaveBeenCalled();
    expect(mockFinalizeSprint).not.toHaveBeenCalled();
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
    expect(mockPublishOutermostSprintTerminalArchive).not.toHaveBeenCalled();
  });

  it('never terminalizes a checkpoint task whose result authority is absent', async () => {
    const root = makeRoot();
    mockReadResumeTaskResultAuthority.mockReturnValue({
      state: 'resumable',
      result: null,
    });

    await expect(terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
    )).rejects.toThrow('TERMINALIZATION_RESULT_AUTHORITY_MISSING:901-001:resumable');

    expect(mockFinalizeSprint).not.toHaveBeenCalled();
    expect(mockPublishTestModeSprintTerminalReceipt).not.toHaveBeenCalled();
    expect(readEvents(root, checkpoint.sprintId).at(-1)).toMatchObject({
      channel: CHANNELS.RECOVERY_TERMINALIZATION_HELD,
      payload: { stage: 'evidence' },
    });
  });

  it('does not append recovery HOLD evidence after an immutable staged seal exists', async () => {
    const root = makeRoot();
    mockPublishOutermostSprintTerminalArchive.mockImplementation(() => {
      throw new SprintTerminalArchivePublicationError('APPLICATION_NOT_APPLIED', true);
    });

    await expect(terminalizeCompletedCheckpointRun(
      root,
      checkpoint,
      { auth_mode: 'subscription', language: 'en' } as never,
    )).rejects.toThrow('APPLICATION_NOT_APPLIED');

    expect(readEvents(root, checkpoint.sprintId).map(event => event.channel)).toEqual([
      CHANNELS.RECOVERY_TERMINALIZATION_STARTED,
      CHANNELS.RECOVERY_EVIDENCE_REUSED,
      CHANNELS.RECOVERY_RECEIPT_AUTHORIZED,
      CHANNELS.RECOVERY_CLEANUP_SETTLED,
    ]);
  });
});
