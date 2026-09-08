import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const recoveryControlProbe = vi.hoisted(() => ({
  registry: null as unknown,
  terminalError: null as Error | null,
  planError: null as Error | null,
  spawnError: null as Error | null,
  runPlanPhase: vi.fn(),
  runSpawnPhase: vi.fn(),
  terminalize: vi.fn(),
  terminalizeImplementation: null as null | ((...args: unknown[]) => unknown),
}));

vi.mock('../../src/orchestra/scheduler-effects.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/scheduler-effects.js')>();
  return {
    ...actual,
    createExactNormalDockerExecutionRegistry: (...args: unknown[]) =>
      recoveryControlProbe.registry
        ?? actual.createExactNormalDockerExecutionRegistry(args[0] as string),
  };
});

vi.mock('../../src/orchestra/completed-checkpoint-terminalizer.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/orchestra/completed-checkpoint-terminalizer.js')
  >();
  return {
    ...actual,
    terminalizeCompletedCheckpointRun: (...args: unknown[]) => {
      recoveryControlProbe.terminalize(...args);
      if (recoveryControlProbe.terminalizeImplementation) {
        return recoveryControlProbe.terminalizeImplementation(...args);
      }
      return recoveryControlProbe.terminalError
        ? Promise.reject(recoveryControlProbe.terminalError)
        : actual.terminalizeCompletedCheckpointRun(...args as Parameters<
            typeof actual.terminalizeCompletedCheckpointRun
          >);
    },
  };
});

vi.mock('../../src/orchestra/sprint-phases.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-phases.js')>();
  return {
    ...actual,
    runPlanPhase: (...args: unknown[]) => {
      recoveryControlProbe.runPlanPhase(...args);
      if (recoveryControlProbe.planError) throw recoveryControlProbe.planError;
      return actual.runPlanPhase(...args as Parameters<typeof actual.runPlanPhase>);
    },
    runSpawnPhase: (...args: unknown[]) => {
      recoveryControlProbe.runSpawnPhase(...args);
      if (recoveryControlProbe.spawnError) throw recoveryControlProbe.spawnError;
      return actual.runSpawnPhase(...args as Parameters<typeof actual.runSpawnPhase>);
    },
  };
});

vi.mock('../../src/orchestra/pre-start-guards.js', () => ({
  runPreStartGuards: vi.fn(async () => ({ safetyPoint: null })),
}));

vi.mock('../../src/orchestra/sprint-spawner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-spawner.js')>();
  return {
    ...actual,
    routeSprintTasksForExecution: vi.fn(),
  };
});

import type { ExactNormalDockerExecutionRegistryV2 } from '../../src/orchestra/scheduler-effects.js';
import {
  resolveCircuitBreakerTaskEvidence,
  runSprint,
  settleRecoveredExactTerminalAuthorities,
  terminalizeRecoveredCompleteCheckpoint,
  wireHandoffsForCompletedTasks,
} from '../../src/orchestra/sprint-controller.js';
import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import { TaskEvaluation } from '../../src/core/types.js';
import { readCheckpoint, writeCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import {
  buildFinalizerSkillAttributionReceipts,
  buildFinalizerTerminalTruth,
  FinalizerTerminalEvidenceError,
  publishFencedSprintTerminalReceipt,
  publishFinalizerTerminalSkillAttribution,
} from '../../src/orchestra/sprint-finalizer.js';
import type { ExactAcceptedResultTerminalAuthorityV2 } from '../../src/orchestra/exact-accepted-result-terminal-authority.js';
import { SkillAttributionTerminalPublicationError } from '../../src/core/routing/skill-attribution.js';
import { releaseSprintLock } from '../../src/core/multi-ide.js';
import { DeckentError } from '../../src/core/errors.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  recoveryControlProbe.registry = null;
  recoveryControlProbe.terminalError = null;
  recoveryControlProbe.planError = null;
  recoveryControlProbe.spawnError = null;
  recoveryControlProbe.terminalizeImplementation = null;
  recoveryControlProbe.runPlanPhase.mockClear();
  recoveryControlProbe.runSpawnPhase.mockClear();
  recoveryControlProbe.terminalize.mockClear();
});

function acceptedAuthority(taskId: string) {
  return { identity: { taskId } };
}

const exactDigest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function terminalAuthority(taskId: string): ExactAcceptedResultTerminalAuthorityV2 {
  const identity = {
    schemaVersion: 2 as const,
    backend: 'docker' as const,
    projectRootSha256: 'a'.repeat(64),
    projectId: 'recovery-control-project',
    taskId,
    attemptId: `exact-attempt:${taskId}`,
    generation: 1,
  };
  const accepted = {
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
  const terminal = {
    executionMode: 'normal-docker' as const,
    identity,
    admissionReceiptDigest: accepted.admissionReceiptDigest,
    settlementRef: {
      schemaVersion: 2 as const,
      kind: 'task-result-settlement-v2-ref' as const,
      identity,
      artifactKey: 'settlement',
      artifactReceiptDigest: exactDigest('5'),
    },
    settlementDigest: exactDigest('6'),
    resultDigest: accepted.resultDigest,
    acceptedResultChainDigest: accepted.acceptedResultChainDigest,
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
    schemaVersion: 2,
    kind: 'exact-accepted-result-terminal-authority-v2',
    acceptedAuthority: accepted,
    terminalResultAuthority: terminal,
    terminalDecisionAuthority: {
      schemaVersion: 2,
      kind: 'exact-task-terminal-decision-authority-v2',
      identity,
      evaluationReceipt: {
        verdict: 'DONE',
        artifactReceiptDigest: terminal.evaluationArtifact.artifactReceiptDigest,
        artifactSha256: terminal.evaluationArtifact.artifactSha256,
        byteLength: terminal.evaluationArtifact.byteLength,
        chainDigest: terminal.evaluationChainDigest,
      },
      finalizerReceipt: {
        state: 'terminal-ready',
        artifactReceiptDigest: terminal.finalizerArtifact.artifactReceiptDigest,
        artifactSha256: terminal.finalizerArtifact.artifactSha256,
        byteLength: terminal.finalizerArtifact.byteLength,
        chainDigest: terminal.finalizerChainDigest,
      },
    },
  };
}

describe('exact controller terminal fan-in behavior', () => {
  it('writes a fresh PLAN checkpoint without a recovered historical terminal authority', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-checkpoint-sprint-scope-'));
    roots.push(projectRoot);
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    const task = {
      id: '725-001',
      sprintId: 'sprint-725',
      title: 'Fresh pending task',
      description: 'Historical exact terminal custody must not enter this checkpoint',
      model: 'test-model',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.PENDING,
      createdAt: '2026-09-06T03:26:00.000Z',
    };
    const freshSprint = {
      id: 'sprint-725',
      number: 725,
      status: SprintStatus.PLANNING,
      phase: SprintPhase.PLAN,
      tasks: [task],
      workers: [],
      startedAt: '2026-09-06T03:26:00.000Z',
    };
    writeFileSync(
      join(projectRoot, '.tasks', `task-${task.id}.json`),
      JSON.stringify(task),
      'utf-8',
    );

    const historicalTaskId = '724-001';
    const historicalAuthority = terminalAuthority(historicalTaskId);
    const historicalProjectedResult = {
      taskId: historicalTaskId,
      workerId: `w-${historicalTaskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'Recovered historical result',
    };
    const historicalCurrent = {
      state: 'current' as const,
      terminalAuthority: historicalAuthority,
      projectedResult: historicalProjectedResult,
      evaluationReceipt: { verdict: 'DONE' as const },
      finalizerReceipt: { verdict: 'DONE' as const },
    };
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[historicalTaskId, historicalCurrent]]),
      isExactTask: (taskId: string) => taskId === historicalTaskId,
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'exact-accepted' as const,
        result: historicalProjectedResult,
        settlementRef: null,
        rawResultPath: `.tasks/task-${historicalTaskId}.result`,
        exactAcceptedAuthority: historicalAuthority.acceptedAuthority,
      })),
      settleExactAcceptedResult: vi.fn(async () => ({
        state: 'settled' as const,
        authority: historicalAuthority,
      })),
      readExactTerminalAuthority: () => historicalCurrent,
      rehydrateRecovery: vi.fn(),
    } as unknown as ExactNormalDockerExecutionRegistryV2;
    recoveryControlProbe.registry = registry;
    const afterPlanCheckpoint = new DeckentError(
      'DECKENT_E091',
      'TEST_AFTER_FRESH_PLAN_CHECKPOINT',
    );
    recoveryControlProbe.spawnError = afterPlanCheckpoint;
    const spawn = vi.fn();
    const backend = {
      name: 'docker',
      reconcilePendingAttempts: vi.fn(async () => ({
        adopted: [],
        closedNotDispatched: [],
        closedAbsentAfterExit: [],
        retiredLanded: [],
        resumedContinuations: [],
        held: [],
      })),
      spawn,
      kill: vi.fn(),
      list: vi.fn(() => []),
      workerInventoryState: vi.fn(() => 'absent'),
    };

    await expect(runSprint(projectRoot, {
      deckent_style: 'sprint',
      routing_engine: 'v3',
      plugins: {},
      nervous_system: { enabled: false },
    } as never, {
      preplannedSprint: freshSprint as never,
      spawnBackend: backend as never,
      rollback: false,
      enableHeartbeatDaemon: false,
    })).rejects.toBe(afterPlanCheckpoint);

    const persisted = readCheckpoint(projectRoot, freshSprint.id);
    expect(persisted?.brainPhase).toBe(SprintPhase.PLAN);
    expect(persisted?.taskStates?.map(state => state.id)).toEqual([task.id]);
    expect(persisted?.taskStates?.[0]?.exactTerminalAuthority).toBeUndefined();
    expect(JSON.parse(readFileSync(
      join(projectRoot, '.tasks', `task-${task.id}.json`),
      'utf-8',
    ))).toMatchObject({ id: task.id, sprintId: freshSprint.id, status: TaskStatus.PENDING });
    expect(recoveryControlProbe.runPlanPhase).not.toHaveBeenCalled();
    expect(recoveryControlProbe.runSpawnPhase).toHaveBeenCalledTimes(1);
    expect(recoveryControlProbe.terminalize).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('still rejects a missing terminal authority for an exact task in the current sprint', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-checkpoint-current-missing-'));
    roots.push(projectRoot);
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    const task = {
      id: '725-missing',
      sprintId: 'sprint-725',
      status: TaskStatus.DONE,
    };
    const recoveredSprint = {
      id: 'sprint-725',
      number: 725,
      status: SprintStatus.EVALUATING,
      phase: SprintPhase.EVALUATE,
      tasks: [task],
      workers: [],
    };
    const staleCheckpoint = writeCheckpoint(projectRoot, recoveredSprint as never, 0);
    expect(staleCheckpoint).not.toBeNull();
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map(),
      isExactTask: (taskId: string) => taskId === task.id,
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await expect(terminalizeRecoveredCompleteCheckpoint(
      projectRoot,
      recoveredSprint as never,
      staleCheckpoint!,
      {} as never,
      registry,
    )).rejects.toThrow(`EXACT_CHECKPOINT_TERMINAL_AUTHORITY_MISSING:${task.id}`);
    expect(recoveryControlProbe.terminalize).not.toHaveBeenCalled();
  });

  it('still rejects a held terminal authority for an exact task in the current sprint', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-checkpoint-current-hold-'));
    roots.push(projectRoot);
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    const task = {
      id: '725-held',
      sprintId: 'sprint-725',
      status: TaskStatus.DONE,
    };
    const recoveredSprint = {
      id: 'sprint-725',
      number: 725,
      status: SprintStatus.EVALUATING,
      phase: SprintPhase.EVALUATE,
      tasks: [task],
      workers: [],
    };
    const staleCheckpoint = writeCheckpoint(projectRoot, recoveredSprint as never, 0);
    expect(staleCheckpoint).not.toBeNull();
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[task.id, {
        state: 'hold' as const,
        reasonCode: 'terminal-store-reread-failed',
      }]]),
      readTaskResultAuthority: () => ({ state: 'authority-hold' as const }),
      isExactTask: (taskId: string) => taskId === task.id,
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await expect(terminalizeRecoveredCompleteCheckpoint(
      projectRoot,
      recoveredSprint as never,
      staleCheckpoint!,
      {} as never,
      registry,
    )).rejects.toThrow(
      `EXACT_TERMINAL_AUTHORITY_HOLD:${task.id}:terminal-store-reread-failed`,
    );
    expect(recoveryControlProbe.terminalize).not.toHaveBeenCalled();
  });

  it('replays a production receipt and completes terminal skill publication after a post-receipt recovery crash', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-recovery-receipt-replay-'));
    roots.push(projectRoot);
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    const sprintId = 'sprint-724';
    const taskId = '724-001';
    const task = {
      id: taskId,
      sprintId,
      title: 'Recovered terminal publication replay',
      description: 'Receipt replay must precede the remaining projection publications',
      model: 'test-model',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      provider: 'codex',
      authMode: 'subscription',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.DONE,
      assignedWorker: `w-${taskId}`,
      createdAt: '2026-09-05T16:00:00.000Z',
    };
    writeFileSync(
      join(projectRoot, '.tasks', `task-${taskId}.json`),
      JSON.stringify(task),
      'utf-8',
    );
    writeCheckpoint(projectRoot, {
      id: sprintId,
      number: 724,
      status: SprintStatus.ACTIVE,
      phase: SprintPhase.EVALUATE,
      tasks: [task],
      workers: [],
      startedAt: '2026-09-05T16:00:00.000Z',
      executionMode: 'standard',
      skipCleanup: true,
    } as never, 11);
    writeFileSync(join(projectRoot, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId,
      phase: SprintPhase.EVALUATE,
      status: SprintStatus.EVALUATING,
      startedAt: '2026-09-05T16:00:00.000Z',
      updatedAt: '2026-09-05T17:00:00.000Z',
      taskIds: [taskId],
    }), 'utf-8');

    const result = {
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: ['src/core/example.ts'],
      linesAdded: 1,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'Production receipt reducer fixture',
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 2,
        cacheReadTokens: 3,
        provider: 'codex',
        model: 'test-model',
      },
      workAttribution: {
        state: 'VERIFIED' as const,
        attemptId: `attempt-${taskId}`,
        baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
        baselineSha256: 'a'.repeat(64),
        scopeDigest: 'b'.repeat(64),
      },
    };
    const truth = buildFinalizerTerminalTruth({
      tasks: [task as never],
      evaluations: new Map([[taskId, TaskEvaluation.DONE]]),
      results: [result as never],
      coordinatorEvidence: [{
        evidenceId: 'recovery-receipt-replay-coordinator',
        kind: 'recovery-coordinator-retirement',
        state: 'VERIFIED',
        evidenceRef: 'test:coordinator-retired',
        requiredForCleanup: true,
      }],
    });
    const receipts = buildFinalizerSkillAttributionReceipts({
      sprintId,
      terminalTruth: truth,
      attemptTasks: [task as never],
      deliveryByAttempt: new Map([[taskId, {
        state: 'LEGACY_FALLBACK' as const,
        agentId: null,
        skillIds: [],
      }]]),
    });

    const exactAuthority = terminalAuthority(taskId);
    const projectedResult = { ...result, attemptCustody: undefined };
    const current = {
      state: 'current' as const,
      terminalAuthority: exactAuthority,
      terminalResultAuthority: exactAuthority.terminalResultAuthority,
      evaluationReceipt: { verdict: 'DONE' as const },
      finalizerReceipt: { verdict: 'DONE' as const },
      result: { taskId, attemptCustody: { identity: exactAuthority.acceptedAuthority.identity } },
      projectedResult,
    };
    const snapshotExactTerminalAuthorities = vi.fn()
      .mockReturnValueOnce(new Map())
      .mockReturnValue(new Map([[taskId, current]]));
    const awaitTaskResultAuthority = vi.fn(async (candidate: string) => candidate === taskId
      ? {
          state: 'exact-accepted' as const,
          result: projectedResult,
          settlementRef: null,
          rawResultPath: `.tasks/task-${taskId}.result`,
          exactAcceptedAuthority: exactAuthority.acceptedAuthority,
        }
      : {
          state: 'not-dispatched' as const,
          result: null,
          settlementRef: null,
          rawResultPath: `.tasks/task-${candidate}.result`,
          attemptCount: 0,
        });
    const settleExactAcceptedResult = vi.fn(async () => ({
      state: 'settled' as const,
      authority: exactAuthority,
    }));
    recoveryControlProbe.registry = {
      snapshotExactTerminalAuthorities,
      isExactTask: (candidate: string) => candidate === taskId,
      awaitTaskResultAuthority,
      settleExactAcceptedResult,
      readExactTerminalAuthority: (candidate: string) => candidate === taskId
        ? current
        : { state: 'hold', reasonCode: 'foreign-task' },
      rehydrateRecovery: vi.fn(),
    };
    const spawn = vi.fn();
    const backend = {
      name: 'docker',
      reconcilePendingAttempts: vi.fn(async () => ({
        adopted: [],
        closedNotDispatched: [],
        closedAbsentAfterExit: [],
        retiredLanded: [],
        resumedContinuations: [],
        held: [],
      })),
      spawn,
      kill: vi.fn(),
      list: vi.fn(() => []),
      workerInventoryState: vi.fn(() => 'absent'),
    };
    const config = {
      deckent_style: 'sprint',
      routing_engine: 'v3',
      plugins: {},
      nervous_system: { enabled: false },
    } as never;
    const postReceiptFailure = new SkillAttributionTerminalPublicationError(
      sprintId,
      'DURABILITY_UNCONFIRMED',
    );
    let firstPublication: ReturnType<typeof publishFencedSprintTerminalReceipt> | null = null;
    let secondPublication: ReturnType<typeof publishFencedSprintTerminalReceipt> | null = null;
    let terminalSkillPublication: ReturnType<typeof publishFinalizerTerminalSkillAttribution> | null = null;
    let terminalizationAttempt = 0;
    recoveryControlProbe.terminalizeImplementation = () => {
      terminalizationAttempt += 1;
      const publication = publishFencedSprintTerminalReceipt({
        projectRoot,
        sprint: { id: sprintId, number: 724, tasks: [task] } as never,
        truth,
        runId: 'recovery-run-724',
        coordinatorGeneration: 4,
        now: () => '2026-09-05T19:50:45.000Z',
      });
      if (terminalizationAttempt === 1) {
        firstPublication = publication;
        throw postReceiptFailure;
      }
      secondPublication = publication;
      terminalSkillPublication = publishFinalizerTerminalSkillAttribution({
        projectRoot,
        sprintId,
        truth,
        receiptPublication: publication,
        receipts,
      });
      return Promise.resolve({
        id: sprintId,
        number: 724,
        status: SprintStatus.COMPLETE,
        phase: SprintPhase.COMPLETE,
        tasks: [task],
        workers: [],
      });
    };

    await expect(runSprint(projectRoot, config, {
      spawnBackend: backend as never,
      rollback: false,
      enableHeartbeatDaemon: false,
    })).rejects.toBe(postReceiptFailure);
    expect(firstPublication).not.toBeNull();
    const persistedAfterFailure = JSON.parse(readFileSync(firstPublication!.artifactPath, 'utf8'));
    expect(persistedAfterFailure.receipt).toEqual(firstPublication!.receipt);
    const checkpointAfterFailure = readCheckpoint(projectRoot, sprintId);
    expect(checkpointAfterFailure?.taskStates?.[0]?.exactTerminalAuthority).toEqual(exactAuthority);

    // Simulate the failed coordinator process boundary before the recovery retry.
    releaseSprintLock(projectRoot);
    const completed = await runSprint(projectRoot, config, {
      spawnBackend: backend as never,
      rollback: false,
      enableHeartbeatDaemon: false,
    });

    expect(completed.status).toBe(SprintStatus.COMPLETE);
    expect(secondPublication?.receipt).toEqual(firstPublication!.receipt);
    expect(terminalSkillPublication?.state).toBe('written');
    const replay = publishFinalizerTerminalSkillAttribution({
      projectRoot,
      sprintId,
      truth,
      receiptPublication: secondPublication!,
      receipts,
    });
    expect(replay.state).toBe('replayed');
    expect(replay.path).toBe(terminalSkillPublication!.path);
    expect(awaitTaskResultAuthority).toHaveBeenCalledWith(taskId);
    expect(settleExactAcceptedResult).toHaveBeenCalledWith({
      acceptedAuthority: exactAuthority.acceptedAuthority,
    });
    expect(recoveryControlProbe.terminalize).toHaveBeenCalledTimes(2);
    expect(recoveryControlProbe.runPlanPhase).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('propagates completed-recovery terminalization failure without entering fresh PLAN', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-recovery-control-'));
    roots.push(projectRoot);
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    const taskId = '724-001';
    const task = {
      id: taskId,
      sprintId: 'sprint-724',
      title: 'Recovered exact terminal',
      description: 'Terminalization failure must not fall through to PLAN',
      model: 'test-model',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.DONE,
    };
    writeFileSync(
      join(projectRoot, '.tasks', `task-${taskId}.json`),
      JSON.stringify(task),
      'utf-8',
    );
    const staleCheckpoint = writeCheckpoint(projectRoot, {
      id: 'sprint-724',
      number: 724,
      status: SprintStatus.ACTIVE,
      phase: SprintPhase.EVALUATE,
      tasks: [task],
      workers: [],
      startedAt: '2026-09-05T16:00:00.000Z',
      executionMode: 'standard',
      skipCleanup: true,
    } as never, 11);
    writeFileSync(join(projectRoot, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-724',
      phase: SprintPhase.EVALUATE,
      status: SprintStatus.EVALUATING,
      startedAt: '2026-09-05T16:00:00.000Z',
      updatedAt: '2026-09-05T17:00:00.000Z',
      taskIds: [taskId],
    }), 'utf-8');

    const exactAuthority = terminalAuthority(taskId);
    const projectedResult = {
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'Store-projected exact result',
    };
    const current = {
      state: 'current' as const,
      terminalAuthority: exactAuthority,
      terminalResultAuthority: exactAuthority.terminalResultAuthority,
      evaluationReceipt: { verdict: 'DONE' as const },
      finalizerReceipt: { verdict: 'DONE' as const },
      result: {
        taskId,
        attemptCustody: { identity: exactAuthority.acceptedAuthority.identity },
      },
      projectedResult,
    };
    const snapshotExactTerminalAuthorities = vi.fn()
      .mockReturnValueOnce(new Map())
      .mockReturnValue(new Map([[taskId, current]]));
    recoveryControlProbe.registry = {
      snapshotExactTerminalAuthorities,
      isExactTask: (candidate: string) => candidate === taskId,
      readExactTerminalAuthority: (candidate: string) => candidate === taskId
        ? current
        : { state: 'hold', reasonCode: 'foreign-task' },
      rehydrateRecovery: vi.fn(),
    };
    const terminalError = new FinalizerTerminalEvidenceError(
      'TERMINAL_PUBLICATION_NOT_CLEANUP_CANDIDATE_BLOCKED',
    );
    const planError = new Error('fresh-plan-entered');
    recoveryControlProbe.terminalError = terminalError;
    recoveryControlProbe.planError = planError;
    const spawn = vi.fn();
    const backend = {
      name: 'docker',
      reconcilePendingAttempts: vi.fn(async () => ({
        adopted: [],
        closedNotDispatched: [],
        closedAbsentAfterExit: [],
        retiredLanded: [],
        resumedContinuations: [],
        held: [],
      })),
      spawn,
      kill: vi.fn(),
      list: vi.fn(() => []),
      workerInventoryState: vi.fn(() => 'absent'),
    };

    await expect(runSprint(projectRoot, {
      deckent_style: 'sprint',
      routing_engine: 'v3',
      plugins: {},
      nervous_system: { enabled: false },
    } as never, {
      spawnBackend: backend as never,
      rollback: false,
      enableHeartbeatDaemon: false,
    })).rejects.toBe(terminalError);

    expect(recoveryControlProbe.terminalize).toHaveBeenCalledTimes(1);
    expect(recoveryControlProbe.runPlanPhase).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    const persisted = readCheckpoint(projectRoot, 'sprint-724');
    expect(persisted?.checkpointNumber).toBeGreaterThan(staleCheckpoint!.checkpointNumber);
    expect(persisted?.taskStates?.[0]?.exactTerminalAuthority).toEqual(exactAuthority);
  });

  it('settles a cold recovered accepted result and fresh-reads T11 before restore', async () => {
    const taskId = 'cold-accepted-001';
    const accepted = acceptedAuthority(taskId);
    const terminal = {
      state: 'current',
      terminalAuthority: { acceptedAuthority: accepted },
      evaluationReceipt: { verdict: 'DONE' },
      finalizerReceipt: { verdict: 'DONE' },
    };
    const settleExactAcceptedResult = vi.fn(async () => ({
      state: 'settled',
      authority: terminal.terminalAuthority,
    }));
    const readExactTerminalAuthority = vi.fn(() => terminal);
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'exact-accepted',
        result: { taskId },
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        exactAcceptedAuthority: accepted,
      })),
      settleExactAcceptedResult,
      readExactTerminalAuthority,
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await settleRecoveredExactTerminalAuthorities(registry);

    expect(settleExactAcceptedResult).toHaveBeenCalledWith({ acceptedAuthority: accepted });
    expect(readExactTerminalAuthority).toHaveBeenCalledWith(taskId);
  });

  it('keeps a durable exact NOT_DISPATCHED admission out of settlement', async () => {
    const taskId = 'cold-not-dispatched-001';
    const settleExactAcceptedResult = vi.fn();
    const readExactTerminalAuthority = vi.fn();
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-not-dispatched',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'not-dispatched',
        result: null,
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        attemptCount: 0,
      })),
      settleExactAcceptedResult,
      readExactTerminalAuthority,
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await settleRecoveredExactTerminalAuthorities(registry);

    expect(settleExactAcceptedResult).not.toHaveBeenCalled();
    expect(readExactTerminalAuthority).not.toHaveBeenCalled();
  });

  it('preserves a safe recovered authority HOLD reason without exposing raw diagnostics', async () => {
    const taskId = 'cold-authority-hold-001';
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'authority-hold',
        result: null,
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        holdReason: 'LIVE_MONITOR_UNAVAILABLE',
      })),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await expect(settleRecoveredExactTerminalAuthorities(registry)).rejects.toThrow(
      `EXACT_RECOVERY_ATTEMPT_HOLD:${taskId}:authority-hold:LIVE_MONITOR_UNAVAILABLE`,
    );
  });

  it('replaces unsafe recovered authority diagnostics with the typed fallback', async () => {
    const taskId = 'cold-authority-hold-unsafe-001';
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'authority-hold',
        result: null,
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        holdReason: 'provider said /private/path\\nsecret',
      })),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await expect(settleRecoveredExactTerminalAuthorities(registry)).rejects.toThrow(
      `EXACT_RECOVERY_ATTEMPT_HOLD:${taskId}:authority-hold:reason-unavailable`,
    );
  });

  it('preserves a safe exact settlement HOLD reason', async () => {
    const taskId = 'cold-settlement-hold-001';
    const accepted = acceptedAuthority(taskId);
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'exact-accepted',
        result: { taskId },
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        exactAcceptedAuthority: accepted,
      })),
      settleExactAcceptedResult: vi.fn(async () => ({
        state: 'hold', reasonCode: 'LIVE_MONITOR_UNAVAILABLE',
      })),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await expect(settleRecoveredExactTerminalAuthorities(registry)).rejects.toThrow(
      `EXACT_RECOVERY_TERMINAL_SETTLEMENT_HOLD:${taskId}:hold:LIVE_MONITOR_UNAVAILABLE`,
    );
  });

  it('fails closed when recovered acceptance cannot become a current terminal receipt', async () => {
    const taskId = 'cold-held-001';
    const accepted = acceptedAuthority(taskId);
    const registry = {
      snapshotExactTerminalAuthorities: () => new Map([[taskId, {
        state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
      }]]),
      awaitTaskResultAuthority: vi.fn(async () => ({
        state: 'exact-accepted',
        result: { taskId },
        settlementRef: null,
        rawResultPath: `.tasks/task-${taskId}.result`,
        exactAcceptedAuthority: accepted,
      })),
      settleExactAcceptedResult: vi.fn(async () => ({
        state: 'settled', authority: { acceptedAuthority: accepted },
      })),
      readExactTerminalAuthority: vi.fn(() => ({
        state: 'hold', reasonCode: 'terminal-store-reread-failed',
      })),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await expect(settleRecoveredExactTerminalAuthorities(registry))
      .rejects.toMatchObject({ code: 'DECKENT_E077' });
  });

  it('ignores a forged public cascade/pre-dispatch result for an exact task', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-circuit-tamper-'));
    roots.push(projectRoot);
    mkdirSync(join(projectRoot, '.tasks'));
    const taskId = 'exact-tamper-001';
    writeFileSync(join(projectRoot, '.tasks', `task-${taskId}.result`), JSON.stringify({
      taskId,
      cascadeSkipped: true,
      preDispatchSettlement: { state: 'NOT_DISPATCHED' },
    }));
    const trustedProjectedResult = {
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Store-revalidated terminal result',
    };
    const registry = {
      isExactTask: (candidate: string) => candidate === taskId,
      readTaskResultAuthority: () => ({
        state: 'exact-accepted',
        result: trustedProjectedResult,
        settlementRef: null,
        rawResultPath: join(projectRoot, '.tasks', `task-${taskId}.result`),
        exactAcceptedAuthority: acceptedAuthority(taskId),
      }),
      readExactTerminalAuthority: () => ({
        state: 'current',
        projectedResult: trustedProjectedResult,
      }),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    expect(resolveCircuitBreakerTaskEvidence(projectRoot, taskId, registry)).toEqual({
      result: trustedProjectedResult,
      policyTerminal: false,
    });
  });

  it('does not publish a ready handoff from worker DONE when T11 says NO_GO', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'exact-handoff-tamper-'));
    roots.push(projectRoot);
    const taskId = 'exact-source-001';
    const projectedResult = {
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: ['src/trusted.ts'],
      linesAdded: 1,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'worker claim is not the terminal verdict',
    };
    const createHandoff = vi.spyOn(HandoffProtocol.prototype, 'createHandoff');
    const registry = {
      isExactTask: (candidate: string) => candidate === taskId,
      readExactTerminalAuthority: () => ({
        state: 'current',
        projectedResult,
        evaluationReceipt: { verdict: 'NO_GO' },
      }),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    try {
      wireHandoffsForCompletedTasks(projectRoot, {
        id: 'sprint-exact-handoff',
        tasks: [
          { id: taskId, dependencies: [] },
          { id: 'exact-dependent-001', dependencies: [taskId] },
        ],
      } as never, [{ ...projectedResult, selfAssessment: 'DONE' }] as never, registry);
      expect(createHandoff).not.toHaveBeenCalled();
    } finally {
      createHandoff.mockRestore();
    }
  });
});
