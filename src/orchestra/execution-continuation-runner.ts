import { createHash, randomUUID } from 'node:crypto';

import { canonicalJson } from '../core/audit-writer.js';
import { buildExecutionContinuationPrompt } from '../core/execution-continuation-prompt.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import {
  claimExecutionContinuationAtomic,
  claimExecutionContinuationAtomicV2,
  createExecutionContinuationDispatchRefV2,
  readExecutionAttemptRetirement,
  readExecutionAttemptRetirementV2,
  readExecutionContinuationClaim,
  readExecutionLandingCheckpoint,
  readExecutionLandingCheckpointV2,
  type ExecutionContinuationClaimV1,
  type ExecutionContinuationClaimV2,
  type ExecutionLandingCheckpointV1,
  type ExecutionLandingCheckpointRefV1,
  type ExecutionLandingCheckpointRefV2,
  type ExecutionLandingDigestV2,
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
import type { CreateExecutionLandingPreparationPayloadV2Input } from '../core/execution-landing-context.js';
import {
  readRuntimeBudgetObservations,
  type RuntimeBudgetObservationEvidence,
} from './runtime-budget-monitor.js';
import type {
  ExactDockerCustodyCompletionV2,
  ExactDockerCustodyDispatchOutcomeV2,
  PrepareExactDockerCustodyInputV2,
  SpawnBackend,
  SpawnBackendOptions,
} from './spawn-backend.js';
import { prepareExactDockerExecutionLandingContextV2 } from './execution-landing-coordinator.js';

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
  /**
   * The V1 public-task continuation is retained only for bounded historical
   * recovery. Normal Docker execution must use the async exact-custody port.
   */
  historicalV1Recovery?: true;
}

export interface ExecutionContinuationDispatchResult {
  state: 'dispatched' | 'adopted';
  claim: ExecutionContinuationClaimV1;
  settlementRef: TaskResultSettlementRefV1;
  promptSha256: string;
}

export interface DispatchExactExecutionContinuationInput {
  readonly backend: SpawnBackend;
  readonly projectRoot: string;
  readonly predecessorRef: ExecutionLandingCheckpointRefV2;
  readonly checkpointDigest: ExecutionLandingDigestV2;
  readonly retirementReceiptDigest: ExecutionLandingDigestV2;
  /** T6-owned canonical continuation material; T5 never re-derives its authority. */
  readonly preparation: PrepareExactDockerCustodyInputV2;
  readonly landingPreparationInput: CreateExecutionLandingPreparationPayloadV2Input;
  readonly awaitTerminal: boolean;
}

export type ExactExecutionContinuationDispatchResult =
  | Readonly<{
      state: 'released';
      dispatch: Extract<ExactDockerCustodyDispatchOutcomeV2, { kind: 'released' }>;
      claim: ExecutionContinuationClaimV2;
      terminal: ExactDockerCustodyCompletionV2 | null;
    }>
  | Readonly<{
      state: 'not-dispatched';
      dispatch: Extract<ExactDockerCustodyDispatchOutcomeV2, { kind: 'not-dispatched' }>;
    }>
  | Readonly<{
      state: 'ambiguous';
      dispatch: Extract<ExactDockerCustodyDispatchOutcomeV2, { kind: 'ambiguous' }>;
    }>;

/**
 * Provider-neutral exact continuation transport. The caller owns canonical
 * continuation material; this runner owns only the Docker custody sequence.
 * It never publishes a public claim/attempt and never falls back to `spawn()`.
 */
export async function dispatchExactExecutionContinuation(
  input: DispatchExactExecutionContinuationInput,
): Promise<ExactExecutionContinuationDispatchResult> {
  if (input.backend.name !== 'docker'
    || !input.backend.prepareExactDockerCustody
    || !input.backend.dispatchExactDockerCustody
    || (input.awaitTerminal && !input.backend.awaitExactDockerCustodyTerminal)) {
    throw createExecutionAuthorityError(
      'Exact execution continuation requires the complete Docker custody port',
    );
  }
  if (input.preparation.predecessor === null) {
    throw createExecutionAuthorityError(
      'Exact execution continuation requires a verified predecessor custody reference',
    );
  }
  const checkpoint = readExecutionLandingCheckpointV2(
    input.projectRoot,
    input.predecessorRef,
  );
  const retirement = readExecutionAttemptRetirementV2(
    input.projectRoot,
    input.predecessorRef,
  );
  if (!checkpoint
    || checkpoint.checkpointDigest !== input.checkpointDigest
    || !retirement
    || retirement.receiptDigest !== input.retirementReceiptDigest
    || retirement.resourcesReleased !== true) {
    throw createExecutionAuthorityError(
      'Exact execution continuation requires its exact durable retired predecessor',
    );
  }
  const predecessorCustody = checkpoint.checkpoint.custodyRef;
  const predecessorPreparation = predecessorCustody.preparationRef;
  const predecessor = input.preparation.predecessor;
  if (
    input.preparation.projectId !== predecessorPreparation.privateIdentity.projectId
    || input.preparation.taskId !== predecessorPreparation.privateIdentity.taskId
    || predecessor.dispatchRequestId !== predecessorPreparation.dispatchRequestId
    || canonicalJson(predecessor.identity)
      !== canonicalJson(predecessorPreparation.privateIdentity)
    || predecessor.admissionReceiptDigest !== predecessorPreparation.admissionReceiptDigest
    || predecessor.admissionRefDigest !== predecessorPreparation.admissionRefDigest
    || predecessor.providerStartReceipt.ref
      !== predecessorCustody.providerStartReceiptRefDigest
    || predecessor.providerStartReceipt.digest
      !== predecessorCustody.providerStartEvidenceDigest
  ) {
    throw createExecutionAuthorityError(
      'Exact execution continuation predecessor custody does not match its checkpoint',
    );
  }
  const prepared = await input.backend.prepareExactDockerCustody(input.preparation);
  prepareExactDockerExecutionLandingContextV2({
    projectRoot: input.projectRoot,
    prepared,
    preparationInput: input.landingPreparationInput,
  });
  const dispatch = await input.backend.dispatchExactDockerCustody(
    prepared.dispatchEnvelope,
  );
  if (dispatch.kind === 'not-dispatched') {
    return Object.freeze({ state: 'not-dispatched', dispatch });
  }
  if (dispatch.kind === 'ambiguous') {
    return Object.freeze({ state: 'ambiguous', dispatch });
  }
  if (
    dispatch.preparationRef.dispatchRequestId !== dispatch.admissionRef.dispatchRequestId
    || dispatch.preparationRef.dispatchRequestMaterialDigest
      !== dispatch.admissionRef.dispatchRequestMaterialDigest
    || dispatch.preparationRef.admissionRefDigest !== dispatch.admissionRef.admissionRefDigest
    || canonicalJson(dispatch.preparationRef.privateIdentity)
      !== canonicalJson(dispatch.custodyRef.identity)
    || dispatch.preparationRef.admissionReceiptDigest
      !== dispatch.custodyRef.admissionReceiptDigest
    || dispatch.preparationRef.admissionRefDigest !== dispatch.custodyRef.admissionRefDigest
    || canonicalJson(dispatch.providerExecutionAttempt.custodyIdentity)
      !== canonicalJson(dispatch.custodyRef.identity)
    || dispatch.providerExecutionAttempt.admissionReceiptDigest
      !== dispatch.custodyRef.admissionReceiptDigest
    || canonicalJson(dispatch.providerStartReceipt)
      !== canonicalJson(dispatch.custodyRef.providerStartReceipt)
    || dispatch.settlementRef.taskId !== dispatch.custodyRef.identity.taskId
    || dispatch.settlementRef.attemptId
      !== dispatch.providerExecutionAttempt.providerExecutionAttemptId
    || Date.parse(dispatch.releasedAt) < Date.parse(retirement.retiredAt)
    || Date.parse(dispatch.providerStartAcceptedAt) < Date.parse(retirement.retiredAt)
  ) {
    throw createExecutionAuthorityError(
      'Exact execution continuation released custody bindings are inconsistent',
    );
  }
  const continuationDispatchRef = createExecutionContinuationDispatchRefV2({
    dispatchState: 'RELEASED',
    preparationRef: dispatch.preparationRef,
    providerExecutionAttemptId:
      dispatch.providerExecutionAttempt.providerExecutionAttemptId,
    providerExecutionAttemptIdentityDigest:
      dispatch.providerExecutionAttempt.identityDigest,
    dispatchAuthorityReceiptDigest: dispatch.dispatchReceipt.digest,
    releaseReceiptRefDigest: dispatch.releaseReceipt.ref,
    releaseEvidenceDigest: dispatch.releaseReceipt.digest,
    releasedAt: dispatch.releasedAt,
    providerStartReceiptRefDigest: dispatch.providerStartReceipt.ref,
    providerStartEvidenceDigest: dispatch.providerStartReceipt.digest,
    providerStartAcceptedAt: dispatch.providerStartAcceptedAt,
    projectionFence: dispatch.projectionFence,
  });
  const claim = claimExecutionContinuationAtomicV2(
    input.projectRoot,
    input.predecessorRef,
    {
      checkpointDigest: input.checkpointDigest,
      retirementReceiptDigest: input.retirementReceiptDigest,
      continuationDispatchRef,
      claimedAt: dispatch.providerStartAcceptedAt,
    },
  );
  const terminal = input.awaitTerminal
    ? await input.backend.awaitExactDockerCustodyTerminal!({
        custodyRef: dispatch.custodyRef,
        releaseReceipt: dispatch.releaseReceipt,
        providerStartReceipt: dispatch.providerStartReceipt,
        projectionFence: dispatch.projectionFence,
      })
    : null;
  return Object.freeze({ state: 'released', dispatch, claim, terminal });
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

const STARTUP_DELTA_FIELDS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
] as const;

/**
 * Replay the host's own applied-delta arithmetic from the immutable record.
 *
 * Usage semantics — never a provider name — decide which arithmetic is correct:
 * an incremental sample IS its own applied delta, while a cumulative sample
 * reports running attempt totals and may only apply what it adds on top of the
 * counters that preceded it. Both are honest provider contracts; a startup
 * observation is admissible evidence in either one exactly when its recorded
 * delta reproduces here, so an inflated, invented or double-counted delta
 * (including cache tokens) still fails closed.
 */
function hasExactStartupDelta(evidence: RuntimeBudgetObservationEvidence): boolean {
  const { observation, appliedDelta, countersAfter } = evidence;
  return STARTUP_DELTA_FIELDS.every(field => {
    const before = countersAfter[field] - appliedDelta[field];
    if (before < 0) return false;
    const expected = observation.mode === 'cumulative'
      ? Math.max(0, observation.counts[field] - before)
      : observation.counts[field];
    return appliedDelta[field] === expected;
  });
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
  if (!firstObservation || !firstObservation.observation.countsAsTurn) {
    throw createExecutionAuthorityError(
      'Execution continuation requires an immutable incremental parent startup observation, or the cumulative-semantics equivalent, before new provider work',
    );
  }
  if (!hasExactStartupDelta(firstObservation)) {
    throw createExecutionAuthorityError(
      'Execution continuation parent startup observation applied delta is not exact for its usage semantics',
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
  if (
    input.backend.name === 'docker'
    && input.backend.prepareExactDockerCustody
    && input.backend.dispatchExactDockerCustody
    && input.historicalV1Recovery !== true
  ) {
    throw createExecutionAuthorityError(
      'Normal Docker continuation requires the async exact-custody continuation port',
    );
  }
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
