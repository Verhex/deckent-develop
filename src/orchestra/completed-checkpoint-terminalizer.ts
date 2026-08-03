import type { ResolvedConfig } from '../core/config-types.js';
import { normalizeTaskResultShape } from '../core/task-result-schema.js';
import {
  SprintPhase,
  SprintStatus,
  TaskEvaluation,
  type Sprint,
  type SprintMetrics,
  type TaskResult,
} from '../core/types.js';
import {
  buildPreplannedResumeSprint,
  type SprintCheckpoint,
} from './sprint-checkpoint.js';
import {
  finalizeSprint,
  publishFinalSprintAuthority,
  publishTestModeSprintTerminalReceipt,
} from './sprint-finalizer.js';
import {
  commitSprintTerminalHandoff,
  resolveSprintTerminalHandoff,
} from './sprint-controller.js';
import { runCleanupPhase } from './sprint-phases.js';
import { readAuthoritativeTaskResult } from './task-result-authority.js';
import { CHANNELS, writeEvent } from '../core/event-stream.js';
import { DeckentError } from '../core/errors.js';

type RecoveryTerminalizationStage =
  | 'initialize'
  | 'evidence'
  | 'receipt'
  | 'handoff'
  | 'cleanup'
  | 'publication';

function emitRecoveryEvent(
  projectRoot: string,
  sprintId: string,
  channel: string,
  payload: Record<string, unknown>,
): void {
  writeEvent(projectRoot, sprintId, 'brain', '*', channel, {
    recoveryKind: 'completed-checkpoint-terminalization',
    sprintId,
    ...payload,
  });
}

function completedCheckpointEvidence(
  projectRoot: string,
  sprint: Sprint,
): { results: TaskResult[]; evaluations: Map<string, TaskEvaluation> } {
  const results: TaskResult[] = [];
  const evaluations = new Map<string, TaskEvaluation>();
  for (const task of sprint.tasks) {
    const authority = readAuthoritativeTaskResult<TaskResult>(projectRoot, task.id);
    const result = normalizeTaskResultShape(authority.result);
    if (!result) throw new DeckentError('E_TERMINALIZATION_RESULT_AUTHORITY_MISSING', `TERMINALIZATION_RESULT_AUTHORITY_MISSING:${task.id}:${authority.state}`);
    const recorded = (result as TaskResult & { brainEvaluation?: TaskEvaluation }).brainEvaluation
      ?? result.evaluationDecision
      ?? result.selfAssessment;
    if (
      recorded !== TaskEvaluation.DONE
      && recorded !== TaskEvaluation.GO_WITH_TECH_DEBT
      && recorded !== TaskEvaluation.NO_GO
      && recorded !== TaskEvaluation.NOT_DISPATCHED
    ) {
      throw new DeckentError('E_TERMINALIZATION_EVALUATION_AUTHORITY_MISSING', `TERMINALIZATION_EVALUATION_AUTHORITY_MISSING:${task.id}:${String(recorded)}`);
    }
    results.push(result);
    evaluations.set(task.id, recorded as TaskEvaluation);
  }
  return { results, evaluations };
}

function testTerminalMetrics(
  sprint: Sprint,
  settlement: ReturnType<typeof publishTestModeSprintTerminalReceipt>,
): SprintMetrics {
  const logical = settlement.terminalTruth.logicalMetrics;
  const usage = settlement.terminalTruth.usageTotals;
  const startedAt = Date.parse(sprint.startedAt ?? '');
  return {
    totalTasks: logical.totalTasks,
    completedTasks: logical.completedTasks,
    techDebtTasks: logical.techDebtTasks,
    noGoTasks: logical.noGoTasks,
    unevaluatedTasks: logical.unevaluatedTasks,
    durationMs: Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0,
    coveragePercent: logical.coveragePercent,
    noGoRate: logical.totalTasks > 0 ? logical.noGoTasks / logical.totalTasks : 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    totalInputTokens: usage.inputTokens,
    totalOutputTokens: usage.outputTokens,
    totalCacheReadTokens: usage.cacheRead,
  };
}

/**
 * Resume seam for a checkpoint whose work is fully terminal but whose fenced
 * receipt was never published. No task is reset or dispatched. Receipt,
 * cleanup policy and COMPLETE projection follow the persisted execution mode.
 */
export async function terminalizeCompletedCheckpointRun(
  projectRoot: string,
  checkpoint: SprintCheckpoint,
  config: ResolvedConfig,
  legacyMode?: 'standard' | 'test',
): Promise<Sprint> {
  let stage: RecoveryTerminalizationStage = 'initialize';
  emitRecoveryEvent(
    projectRoot,
    checkpoint.sprintId,
    CHANNELS.RECOVERY_TERMINALIZATION_STARTED,
    {
      checkpointNumber: checkpoint.checkpointNumber,
      checkpointPhase: checkpoint.brainPhase,
      executionMode: checkpoint.executionMode ?? legacyMode ?? 'unavailable',
      dispatchCount: 0,
    },
  );

  try {
    const sprint = buildPreplannedResumeSprint(projectRoot, checkpoint, []);
    const executionMode = checkpoint.executionMode ?? legacyMode;
    if (!executionMode) throw new DeckentError('E_TERMINALIZATION_EXECUTION_MODE_UNAVAILABLE', 'TERMINALIZATION_EXECUTION_MODE_UNAVAILABLE');
    sprint.executionMode = executionMode;
    // An old checkpoint did not persist cleanup intent. Retention is the only
    // safe default: evidence can be cleaned later, but cannot be reconstructed.
    sprint.skipCleanup = checkpoint.skipCleanup ?? true;

    stage = 'evidence';
    const { results, evaluations } = completedCheckpointEvidence(projectRoot, sprint);
    emitRecoveryEvent(
      projectRoot,
      sprint.id,
      CHANNELS.RECOVERY_EVIDENCE_REUSED,
      {
        source: 'persisted-task-result-and-brain-evaluation',
        taskCount: sprint.tasks.length,
        resultCount: results.length,
        evaluationCount: evaluations.size,
        evaluatorRerun: false,
        workerRedispatchCount: 0,
      },
    );

    stage = 'receipt';
    let metrics: SprintMetrics;
    if (executionMode === 'test') {
      const settlement = publishTestModeSprintTerminalReceipt(
        projectRoot,
        sprint,
        evaluations,
        results,
        { defaultAuthMode: config.auth_mode },
      );
      metrics = testTerminalMetrics(sprint, settlement);
    } else {
      metrics = await finalizeSprint(projectRoot, sprint, evaluations, results, {
        config,
        deferTerminalAuthority: true,
        lifecycleContext: 'completed-checkpoint-recovery',
      });
    }

    stage = 'handoff';
    const handoff = resolveSprintTerminalHandoff({
      projectRoot,
      sprintId: sprint.id,
      retroOutcome: metrics,
    });
    if (handoff.state === 'HOLD') {
      throw new DeckentError('E_TERMINALIZATION_HANDOFF_HOLD', `TERMINALIZATION_HANDOFF_HOLD:${handoff.reasonCode}:${handoff.detail}`);
    }
    emitRecoveryEvent(
      projectRoot,
      sprint.id,
      CHANNELS.RECOVERY_RECEIPT_AUTHORIZED,
      {
        artifactPath: handoff.artifactPath,
        runId: handoff.receipt.runId,
        coordinatorGeneration: handoff.receipt.coordinatorGeneration,
        authorityVersion: handoff.receipt.authorityVersion,
        logicalSettlementDigest: handoff.receipt.logicalSettlementDigest,
        cleanupCandidate: true,
      },
    );

    stage = 'cleanup';
    await runCleanupPhase(
      projectRoot,
      sprint,
      config,
      { testMode: executionMode === 'test', skipCleanup: sprint.skipCleanup },
      null,
      undefined,
    );
    emitRecoveryEvent(
      projectRoot,
      sprint.id,
      CHANNELS.RECOVERY_CLEANUP_SETTLED,
      sprint.skipCleanup
        ? {
            cleanupRequested: false,
            outcome: 'RETAINED_BY_POLICY',
            reason: checkpoint.skipCleanup === undefined
              ? 'legacy-checkpoint-safe-retention-default'
              : 'persisted-skip-cleanup-policy',
          }
        : {
            cleanupRequested: true,
            outcome: 'CLEANUP_PHASE_RETURNED',
            reason: 'terminal-receipt-authorized',
          },
    );

    stage = 'publication';
    const publication = commitSprintTerminalHandoff(handoff);
    if (publication.state === 'HOLD') {
      throw new DeckentError('E_TERMINALIZATION_PUBLICATION_HOLD', `TERMINALIZATION_PUBLICATION_HOLD:${publication.reasonCode}:${publication.detail}`);
    }
    publishFinalSprintAuthority(projectRoot, sprint, metrics, config.language ?? 'en');
    sprint.status = SprintStatus.COMPLETE;
    sprint.phase = SprintPhase.COMPLETE;
    emitRecoveryEvent(
      projectRoot,
      sprint.id,
      CHANNELS.SPRINT_PHASE_CHANGE,
      {
        fromPhase: checkpoint.brainPhase,
        toPhase: SprintPhase.COMPLETE,
        transitionKind: 'completed-checkpoint-terminalization',
        replayedPhases: [],
      },
    );
    emitRecoveryEvent(
      projectRoot,
      sprint.id,
      CHANNELS.RECOVERY_TERMINALIZATION_COMPLETED,
      {
        status: SprintStatus.COMPLETE,
        phase: SprintPhase.COMPLETE,
        handoffKey: publication.handoffKey,
        dispatchCount: 0,
      },
    );
    return sprint;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    emitRecoveryEvent(
      projectRoot,
      checkpoint.sprintId,
      CHANNELS.RECOVERY_TERMINALIZATION_HELD,
      {
        stage,
        reason,
        resumable: true,
        recoveryCommand: `deckent recover ${checkpoint.sprintId} --resume`,
      },
    );
    throw error;
  }
}
