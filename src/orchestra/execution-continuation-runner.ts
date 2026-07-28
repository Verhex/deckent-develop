import { createHash, randomUUID } from 'node:crypto';

import { buildExecutionContinuationPrompt } from '../core/execution-continuation-prompt.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import {
  claimExecutionContinuationAtomic,
  readExecutionAttemptRetirement,
  readExecutionContinuationClaim,
  readExecutionLandingCheckpoint,
  type ExecutionContinuationClaimV1,
  type ExecutionLandingCheckpointV1,
  type ExecutionLandingCheckpointRefV1,
} from '../core/execution-landing-checkpoint.js';
import {
  assertExecutionLandingSupport,
  assertLiveUsageBudgetSupport,
} from '../core/live-execution-budget.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  readTaskResultSettlementExecutionContract,
  writeTaskResultSettlementAttemptAtomic,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import type { ModelType } from '../core/types.js';
import { readRuntimeBudgetObservations } from './runtime-budget-monitor.js';
import type { SpawnBackend, SpawnBackendOptions } from './spawn-backend.js';

export interface DispatchExecutionContinuationInput {
  projectRoot: string;
  checkpointRef: ExecutionLandingCheckpointRefV1;
  backend: SpawnBackend;
  spawnOptions?: Pick<
    SpawnBackendOptions,
    | 'allowedTools'
    | 'autoApprove'
    | 'taskTimeoutSeconds'
    | 'liveTraceEnabled'
    | 'sprintId'
    | 'reasoningEffort'
    | 'excludeDynamicPromptSections'
  >;
}

export interface ExecutionContinuationDispatchResult {
  state: 'dispatched' | 'adopted';
  claim: ExecutionContinuationClaimV1;
  settlementRef: TaskResultSettlementRefV1;
  promptSha256: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Smallest turn budget in which a continuation can do anything useful AND land:
 * one bounded work turn plus one turn to write its terminal result. Anything
 * below this is a dispatch that could only burn budget without settling.
 *
 * MASTER-PLAN 664: this deliberately replaces the previous
 * `remaining >= reservedTurns` rule, which was unsatisfiable by construction.
 * `reservedTurns` is a fixed fraction of the HARD budget and the reserve exists
 * precisely to finance the landing, so every landing that actually consumed its
 * reserve left `remaining < reservedTurns` and made continuation impossible.
 * Measured on 2026-07-25 (task 457-002): hard=32, used=31, remaining=1,
 * reservedTurns=8 → permanent hold, sprint hung waiting for a result that no
 * attempt could ever write. The hard ceiling is still never widened: `remaining`
 * is derived from hard minus cumulative usage.
 */
export const EXECUTION_CONTINUATION_MINIMUM_TURNS = 2;

function assertContinuationTurnReserve(
  checkpoint: ExecutionLandingCheckpointV1,
): void {
  const hardMaxTurns = checkpoint.hardBudget.maxTurns;
  if (hardMaxTurns === undefined) return;
  const remainingMaxTurns = checkpoint.remainingBudget.maxTurns;
  if (
    remainingMaxTurns === undefined
    || remainingMaxTurns < EXECUTION_CONTINUATION_MINIMUM_TURNS
  ) {
    throw createExecutionAuthorityError(
      `Execution continuation turn reserve is insufficient: remaining=${remainingMaxTurns ?? 'missing'}, required=${EXECUTION_CONTINUATION_MINIMUM_TURNS}`,
    );
  }
}

function assertContinuationStartupReserve(
  projectRoot: string,
  checkpoint: ExecutionLandingCheckpointV1,
): void {
  const firstObservation = readRuntimeBudgetObservations(
    projectRoot,
    checkpoint.taskId,
    checkpoint.attemptId,
  )[0];
  if (
    !firstObservation
    || firstObservation.observation.mode !== 'incremental'
    || !firstObservation.observation.countsAsTurn
  ) {
    throw createExecutionAuthorityError(
      'Execution continuation requires an immutable incremental parent startup observation before new provider work',
    );
  }
  const applied = firstObservation.appliedDelta;
  const aggregateTokens =
    applied.inputTokens
    + applied.outputTokens
    + applied.cacheReadTokens
    + applied.cacheCreationTokens;
  const checks = [
    ['input token', checkpoint.remainingBudget.maxInputTokens, applied.inputTokens],
    ['output token', checkpoint.remainingBudget.maxOutputTokens, applied.outputTokens],
    ['cache-read token', checkpoint.remainingBudget.maxCacheReadTokens, applied.cacheReadTokens],
    ['cache-creation token', checkpoint.remainingBudget.maxCacheCreationTokens, applied.cacheCreationTokens],
    ['aggregate token', checkpoint.remainingBudget.maxTokens, aggregateTokens],
    ['per-call context token', checkpoint.remainingBudget.maxContextTokens, firstObservation.observation.contextTokens],
  ] as const;
  for (const [label, remaining, required] of checks) {
    if (remaining !== undefined && remaining < required) {
      throw createExecutionAuthorityError(
        `Execution continuation observed startup reserve is insufficient for ${label}: remaining=${remaining}, required=${required}`,
      );
    }
  }
}

/**
 * Admit and dispatch one no-full-replay continuation. Capability checks happen
 * before claim publication; after publication, an execution-claim retry adopts
 * without a second backend spawn.
 */
export function dispatchExecutionContinuation(
  input: DispatchExecutionContinuationInput,
): ExecutionContinuationDispatchResult {
  const checkpointEnvelope = readExecutionLandingCheckpoint(
    input.projectRoot,
    input.checkpointRef,
  );
  const retirement = readExecutionAttemptRetirement(input.projectRoot, input.checkpointRef);
  if (
    !checkpointEnvelope
    || !retirement
    || retirement.checkpointSha256 !== checkpointEnvelope.checkpointSha256
  ) {
    throw createExecutionAuthorityError(
      'Execution continuation requires a valid landed and retired checkpoint',
    );
  }
  const checkpoint = checkpointEnvelope.checkpoint;
  const predecessorSettlementRef = createTaskResultSettlementRefForAttempt(
    input.projectRoot,
    checkpoint.taskId,
    checkpoint.attemptId,
  );
  if (readTaskResultSettlementExecutionContract(predecessorSettlementRef)) {
    throw createExecutionAuthorityError(
      'Exact cross-verify continuation requires a fresh invocation, reservation and attempt contract',
    );
  }
  if (checkpoint.identity.backend !== input.backend.name) {
    throw createExecutionAuthorityError(
      `Execution continuation backend mismatch: checkpoint=${checkpoint.identity.backend}, requested=${input.backend.name}`,
    );
  }
  assertLiveUsageBudgetSupport(
    checkpoint.remainingBudget,
    input.backend.liveUsageBudgetSupport,
    input.backend.name,
  );
  assertExecutionLandingSupport({
    budget: checkpoint.remainingBudget,
    policy: checkpoint.landingPolicy,
    mode: checkpoint.admissionMode,
    capability: input.backend.executionLandingCapability,
    executor: input.backend.name,
    approvalEvidenceRef: checkpoint.approvalEvidenceRef ?? undefined,
  });

  let claim = readExecutionContinuationClaim(
    input.projectRoot,
    input.checkpointRef,
    checkpointEnvelope.checkpointSha256,
  );
  if (claim) {
    const prompt = buildExecutionContinuationPrompt(input.projectRoot, checkpointEnvelope);
    const settlementRef = createTaskResultSettlementRefForAttempt(
      input.projectRoot,
      checkpoint.taskId,
      claim.continuationAttemptId,
    );
    if (
      readTaskResultSettlementDispatch(settlementRef)
      || readTaskResultSettlementClosure(settlementRef)
    ) {
      return {
        state: 'adopted',
        claim,
        settlementRef,
        promptSha256: sha256(prompt),
      };
    }
  }
  assertContinuationTurnReserve(checkpoint);
  assertContinuationStartupReserve(input.projectRoot, checkpoint);
  if (!claim) {
    claim = claimExecutionContinuationAtomic(input.projectRoot, input.checkpointRef, {
      checkpointSha256: checkpointEnvelope.checkpointSha256,
      continuationAttemptId: randomUUID(),
      continuationFence: `continuation-${randomUUID()}`,
    });
  }
  const prompt = buildExecutionContinuationPrompt(input.projectRoot, checkpointEnvelope);
  const settlementRef = createTaskResultSettlementRefForAttempt(
    input.projectRoot,
    checkpoint.taskId,
    claim.continuationAttemptId,
  );
  writeTaskResultSettlementAttemptAtomic(settlementRef);
  claimTaskResultSettlementAttemptAtomic(settlementRef);
  const result: ExecutionContinuationDispatchResult = {
    state: 'adopted',
    claim,
    settlementRef,
    promptSha256: sha256(prompt),
  };
  input.backend.spawn(
    checkpoint.taskId,
    checkpoint.identity.calledModel as ModelType,
    prompt,
    {
      ...input.spawnOptions,
      projectDir: input.projectRoot,
      executionBudget: checkpoint.remainingBudget,
      executionLandingPolicy: checkpoint.landingPolicy,
      executionAdmissionMode: checkpoint.admissionMode,
      ...(checkpoint.approvalEvidenceRef
        ? { executionApprovalEvidenceRef: checkpoint.approvalEvidenceRef }
        : {}),
      executionContinuation: {
        version: 1,
        checkpointSha256: checkpointEnvelope.checkpointSha256,
        parentAttemptId: checkpoint.attemptId,
        continuationAttemptId: claim.continuationAttemptId,
        continuationFence: claim.continuationFence,
      },
      settlementRef,
    },
  );
  return { ...result, state: 'dispatched' };
}
