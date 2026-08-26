import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

import {
  executionAttemptRetirementDigest,
  readExecutionAttemptRetirementByRef,
  readExecutionLandingCheckpointByRef,
  type ExecutionLandingCheckpointRefV1,
} from './execution-landing-checkpoint.js';
import {
  assertCrossVerifyEnforcedAttemptContract,
  sameCrossVerifyExecutionContract,
  type CrossVerifyEnforcedAttemptContract,
} from './cross-verify-execution-contract.js';
import type { ExecutionAdmissionMode } from './execution-admission.js';
import { assertExecutionLandingPolicyConfig } from './execution-budget-policy.js';
import { createDockerLifecycleError, createExecutionAuthorityError } from './errors.js';
import {
  assertExecutionBudgetShape,
  type LiveUsageCounters,
} from './live-execution-budget.js';
import type { ExecutionLandingPolicyConfig } from './config-types.js';
import type { ProviderBillingEvidence } from './provider-billing-evidence.js';
import { deckentPath } from './state-paths.js';
import {
  createProductionWiringPlanEvidence,
  createRunPolicyPlanAuthority,
  type ProductionWiringPlanEvidence,
  type ProductionWiringResultEvidence,
  type RunPolicyPlanAuthority,
  type RunPolicyResultEvidence,
} from './task-types.js';
import type { ExecutionBudget } from './work-model.js';

export const TASK_RESULT_SETTLEMENT_SCHEMA_VERSION = 1 as const;
export const TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION = 1 as const;
export const TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION_V2 = 2 as const;

export interface TaskResultSettlementRefV1 {
  schemaVersion: typeof TASK_RESULT_SETTLEMENT_SCHEMA_VERSION;
  taskId: string;
  backend: 'docker';
  projectRootSha256: string;
  attemptId: string;
}

export interface TaskResultSettlementAttemptV1 extends TaskResultSettlementRefV1 {
  state: 'pending';
  createdAt: string;
}

export interface TaskResultSettlementExecutionBudgetAuthorityV1
  extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'execution-budget-authority';
  writtenAt: string;
  model: string;
  budget: ExecutionBudget;
  landingPolicy?: ExecutionLandingPolicyConfig;
  admissionMode: ExecutionAdmissionMode;
  approvalEvidenceRef?: string;
  evidenceRef: string;
}

export interface TaskResultSettlementActiveClaimV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'claimed';
  claimedAt: string;
  previousClosureSha256: string | null;
}

export interface TaskResultSettlementActiveClaimV2 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION_V2;
  state: 'claimed';
  claimedAt: string;
  previousAuthoritySha256: string;
}

export type TaskResultSettlementActiveClaim =
  | TaskResultSettlementActiveClaimV1
  | TaskResultSettlementActiveClaimV2;

export interface TaskResultSettlementPreparedV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'prepared';
  preparedAt: string;
  containerName: string;
  model: string;
  labels: Readonly<Record<string, string>>;
}

export interface TaskResultSettlementPromptArtifactV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'prompt-prepared';
  preparedAt: string;
  promptSha256: string;
  byteLength: number;
}

export interface TaskResultSettlementDispatchV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'dispatched';
  dispatchedAt: string;
  containerName: string;
  containerId: string;
  model: string;
  labels: Readonly<Record<string, string>>;
  preparedSha256: string;
}

export interface TaskProviderTerminalBillingReceiptV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'provider-terminal-billing';
  observedAt: string;
  provider: string;
  sourceEventSha256: string;
  billingSha256: string;
  billing: ProviderBillingEvidence;
}

export interface TaskProviderActualCallReceiptV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'provider-actual-call';
  observedAt: string;
  provider: string;
  model: string;
  authMode: CrossVerifyEnforcedAttemptContract['authMode'];
  accountRefHash: string | null;
  transport: CrossVerifyEnforcedAttemptContract['transport'];
  executionBackend: CrossVerifyEnforcedAttemptContract['executionBackend'];
  endpointRefHash: string | null;
  executionProfileRef: string;
  executionContractEvidenceRef: string;
  providerBillingEvidenceRef: string;
  sourceEventSha256: string;
}

/**
 * Second, discriminated actual-call proof arm for a SUBSCRIPTION provider that
 * never emits a per-call usd billing envelope. The proof of "the provider call
 * happened" is derived ONLY from the provider's genuinely-reported token usage
 * (never an estimate, owner budget, or synthetic value), bound to the exact
 * execution-contract identity AND the terminal transport settlement. The
 * `metered_billing` arm (V1) is untouched and stays byte-identical.
 */
export interface TaskProviderActualCallReceiptV2 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'provider-actual-call';
  proofKind: 'subscription_transport_usage';
  observedAt: string;
  provider: string;
  model: string;
  authMode: CrossVerifyEnforcedAttemptContract['authMode'];
  accountRefHash: string | null;
  transport: CrossVerifyEnforcedAttemptContract['transport'];
  executionBackend: CrossVerifyEnforcedAttemptContract['executionBackend'];
  endpointRefHash: string | null;
  executionProfileRef: string;
  executionContractEvidenceRef: string;
  /** The provider-reported terminal-usage evidence this proof is derived from. */
  providerTerminalUsageEvidenceRef: string;
  /** Provider-reported token counters — must be positive; never synthetic. */
  usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  /** Binds the proof to THIS attempt's terminal transport settlement (anti-replay). */
  terminalTransportSettlementDigest: string;
  sourceEventSha256: string;
}

export type TaskProviderActualCallReceipt =
  | TaskProviderActualCallReceiptV1
  | TaskProviderActualCallReceiptV2;

export interface TaskProviderTerminalUsageSourceV1 {
  version: 2;
  projectId: string;
  taskId: string;
  attemptId: string;
  budgetFingerprint: string;
  backend: string;
  terminal: true;
  decision: {
    state: 'within-budget' | 'landing-requested' | 'exceeded' | 'unmeasurable';
    counters: LiveUsageCounters;
  };
  updatedAt: string;
}

export interface TaskProviderTerminalUsageReceiptV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'provider-terminal-usage';
  observedAt: string;
  budgetFingerprint: string;
  executionContractEvidenceRef: string;
  sourceUsageSha256: string;
  decisionState: TaskProviderTerminalUsageSourceV1['decision']['state'];
  counters: LiveUsageCounters;
}

export interface TaskResultSettlementClosureV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'closed';
  closedAt: string;
  settlementSha256: string;
  containerDisposition: 'not-dispatched' | 'stopped-removed' | 'absent-after-exit';
  locksReleased: true;
  evidenceRef?: string;
}

export interface TaskResultSettlementLandedRetirementV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION_V2;
  state: 'retired-landed';
  retiredAt: string;
  landingCheckpointSha256: string;
  executionRetirementSha256: string;
}

export interface TaskResultSettlementV1 extends TaskResultSettlementRefV1 {
  state: 'settled';
  settledAt: string;
  exitCode: number | null;
  resultSha256: string;
  result: Record<string, unknown>;
}

/** Host-attested execution of the plan's exact canonical consumer. */
export interface ProductionWiringHostConsumerExecutionEvidenceV1 {
  readonly version: 1;
  readonly contractDigest: string;
  readonly observedBy: 'host';
  readonly consumerId: string;
  readonly evidenceRefs: readonly string[];
}

export type ProductionWiringResultSettlementDecision =
  | {
      readonly state: 'PRODUCTION_WIRED';
      readonly contractDigest: string;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly state: 'HOLD';
      readonly reason:
        | 'invalid-plan-contract'
        | 'missing-worker-evidence'
        | 'invalid-worker-evidence'
        | 'worker-contract-mismatch'
        | 'worker-contradiction'
        | 'missing-host-consumer-execution'
        | 'invalid-host-consumer-execution'
        | 'host-contract-mismatch'
        | 'host-consumer-identity-mismatch';
    };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hasNonBlankEvidenceRefs(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every(ref => typeof ref === 'string' && ref.trim().length > 0);
}

function hasValidWorkerWiringEvidence(
  value: ProductionWiringResultEvidence,
): boolean {
  const evidence = value as unknown as Record<string, unknown>;
  const observation = evidence.evidence as Record<string, unknown> | undefined;
  return evidence.version === 1
    && typeof evidence.contractDigest === 'string'
    && /^[a-f0-9]{64}$/.test(evidence.contractDigest)
    && evidence.observedBy === 'worker'
    && observation !== undefined
    && typeof observation === 'object'
    && !Array.isArray(observation)
    && ['presence-only', 'incomplete', 'unsupported', 'contradictory'].includes(String(observation.state))
    && hasNonBlankEvidenceRefs(observation.evidenceRefs);
}

function hasValidHostConsumerExecutionEvidence(
  value: ProductionWiringHostConsumerExecutionEvidenceV1,
): boolean {
  const evidence = value as unknown as Record<string, unknown>;
  return evidence.version === 1
    && typeof evidence.contractDigest === 'string'
    && /^[a-f0-9]{64}$/.test(evidence.contractDigest)
    && evidence.observedBy === 'host'
    && typeof evidence.consumerId === 'string'
    && evidence.consumerId.trim().length > 0
    && hasNonBlankEvidenceRefs(evidence.evidenceRefs);
}

/**
 * Settle worker wiring observations only against the exact plan bytes and an
 * independent host observation that the declared canonical consumer executed.
 * Worker evidence alone is intentionally never a production-wired verdict.
 */
export function settleProductionWiringResultEvidence(input: {
  readonly plan: ProductionWiringPlanEvidence;
  readonly workerEvidence?: ProductionWiringResultEvidence;
  readonly hostConsumerExecution?: ProductionWiringHostConsumerExecutionEvidenceV1;
}): ProductionWiringResultSettlementDecision {
  const expectedPlan = createProductionWiringPlanEvidence(input.plan.contract);
  if (
    input.plan.version !== expectedPlan.version
    || input.plan.contractDigest !== expectedPlan.contractDigest
  ) return { state: 'HOLD', reason: 'invalid-plan-contract' };

  const workerEvidence = input.workerEvidence;
  if (!workerEvidence) return { state: 'HOLD', reason: 'missing-worker-evidence' };
  if (!hasValidWorkerWiringEvidence(workerEvidence)) {
    return { state: 'HOLD', reason: 'invalid-worker-evidence' };
  }
  if (workerEvidence.contractDigest !== expectedPlan.contractDigest) {
    return { state: 'HOLD', reason: 'worker-contract-mismatch' };
  }
  if (workerEvidence.evidence.state === 'contradictory') {
    return { state: 'HOLD', reason: 'worker-contradiction' };
  }

  const hostConsumerExecution = input.hostConsumerExecution;
  if (!hostConsumerExecution) {
    return { state: 'HOLD', reason: 'missing-host-consumer-execution' };
  }
  if (!hasValidHostConsumerExecutionEvidence(hostConsumerExecution)) {
    return { state: 'HOLD', reason: 'invalid-host-consumer-execution' };
  }
  if (hostConsumerExecution.contractDigest !== expectedPlan.contractDigest) {
    return { state: 'HOLD', reason: 'host-contract-mismatch' };
  }
  if (hostConsumerExecution.consumerId !== input.plan.contract.canonicalConsumer.consumerId) {
    return { state: 'HOLD', reason: 'host-consumer-identity-mismatch' };
  }
  return {
    state: 'PRODUCTION_WIRED',
    contractDigest: expectedPlan.contractDigest,
    evidenceRefs: [...hostConsumerExecution.evidenceRefs],
  };
}

/** Typed outcome of expected-vs-observed run-policy digest settlement. */
export type RunPolicyResultSettlementDecision =
  | { readonly state: 'POLICY_PARITY'; readonly policyDigest: string }
  | {
      readonly state: 'HOLD';
      readonly reason:
        | 'invalid-plan-authority'
        | 'missing-worker-policy-evidence'
        | 'invalid-worker-policy-evidence'
        | 'policy-digest-mismatch';
    };

/**
 * Settle a worker's run-policy digest echo against the exact task-carried plan
 * authority (RUN-POLICY-DELIVERY-001). The plan digest is recomputed from the
 * carried constraint bytes — a tampered snapshot can never settle — and a
 * missing or different observed digest is a typed HOLD, never a silent pass.
 */
export function settleRunPolicyResultEvidence(input: {
  readonly plan: RunPolicyPlanAuthority;
  readonly workerEvidence?: RunPolicyResultEvidence;
}): RunPolicyResultSettlementDecision {
  let expected: RunPolicyPlanAuthority;
  try {
    expected = createRunPolicyPlanAuthority({
      constraints: input.plan.constraints,
      ...(input.plan.sourceRef !== undefined ? { sourceRef: input.plan.sourceRef } : {}),
    });
  } catch {
    return { state: 'HOLD', reason: 'invalid-plan-authority' };
  }
  if (input.plan.version !== expected.version || input.plan.policyDigest !== expected.policyDigest) {
    return { state: 'HOLD', reason: 'invalid-plan-authority' };
  }
  const workerEvidence = input.workerEvidence;
  if (!workerEvidence) return { state: 'HOLD', reason: 'missing-worker-policy-evidence' };
  if (
    workerEvidence.version !== expected.version
    || workerEvidence.observedBy !== 'worker'
    || typeof workerEvidence.observedPolicyDigest !== 'string'
    || !/^[a-f0-9]{64}$/.test(workerEvidence.observedPolicyDigest)
  ) {
    return { state: 'HOLD', reason: 'invalid-worker-policy-evidence' };
  }
  if (workerEvidence.observedPolicyDigest !== expected.policyDigest) {
    return { state: 'HOLD', reason: 'policy-digest-mismatch' };
  }
  return { state: 'POLICY_PARITY', policyDigest: expected.policyDigest };
}

const DOCKER_CONTAINER_PREFIX = 'deckent-w-';
export const DOCKER_ATTEMPT_LABELS = Object.freeze({
  managed: 'io.deckent.managed',
  project: 'io.deckent.project',
  task: 'io.deckent.task',
  attempt: 'io.deckent.attempt',
} as const);

export function canonicalProjectRoot(projectRoot: string): string {
  try { return realpathSync.native(projectRoot); } catch { return resolve(projectRoot); }
}

function dockerContainerNameFromAuthority(projectRootSha256: string, taskId: string): string {
  return `${DOCKER_CONTAINER_PREFIX}${projectRootSha256.slice(0, 12)}-${sha256(taskId).slice(0, 16)}`;
}

/** Docker names are daemon-global, so project and task authority both participate. */
export function dockerContainerNameForTask(projectRoot: string, taskId: string): string {
  return dockerContainerNameFromAuthority(
    sha256(canonicalProjectRoot(projectRoot)),
    taskId,
  );
}

export function dockerAttemptLabels(
  ref: TaskResultSettlementRefV1,
): Readonly<Record<string, string>> {
  if (!hasValidRefShape(ref as unknown as Record<string, unknown>)) {
    throw createExecutionAuthorityError('Invalid Docker result settlement reference');
  }
  return Object.freeze({
    [DOCKER_ATTEMPT_LABELS.managed]: 'true',
    [DOCKER_ATTEMPT_LABELS.project]: ref.projectRootSha256,
    [DOCKER_ATTEMPT_LABELS.task]: sha256(ref.taskId),
    [DOCKER_ATTEMPT_LABELS.attempt]: ref.attemptId,
  });
}

function settlementProjectDir(projectRootSha256: string): string {
  return deckentPath(undefined, 'runtime', 'task-result-settlements', projectRootSha256);
}

function settlementTaskDir(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementProjectDir(ref.projectRootSha256), sha256(ref.taskId));
}

function settlementAttemptDir(ref: TaskResultSettlementRefV1): string {
  if (!hasValidRefShape(ref as unknown as Record<string, unknown>)) {
    throw createExecutionAuthorityError('Invalid Docker result settlement reference');
  }
  return resolve(settlementTaskDir(ref), ref.attemptId);
}

function canonicalPathWithMissingLeaf(path: string): string {
  let existing = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    suffix.unshift(basename(existing));
    existing = parent;
  }
  let canonicalExisting: string;
  try { canonicalExisting = realpathSync.native(existing); } catch { canonicalExisting = existing; }
  return resolve(canonicalExisting, ...suffix);
}

function assertHostAuthorityOutsideProject(projectRoot: string, ref: TaskResultSettlementRefV1): void {
  const root = canonicalProjectRoot(projectRoot);
  const attemptDir = canonicalPathWithMissingLeaf(settlementAttemptDir(ref));
  const rel = relative(root, attemptDir);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw createExecutionAuthorityError(
      `Docker result settlement authority must be outside the worker-mounted project root: ${attemptDir}`,
    );
  }
}

export function createTaskResultSettlementRef(
  projectRoot: string,
  taskId: string,
): TaskResultSettlementRefV1 {
  return createTaskResultSettlementRefForAttempt(projectRoot, taskId, randomUUID());
}

export function createTaskResultSettlementRefForAttempt(
  projectRoot: string,
  taskId: string,
  attemptId: string,
): TaskResultSettlementRefV1 {
  const ref = Object.freeze({
    schemaVersion: TASK_RESULT_SETTLEMENT_SCHEMA_VERSION,
    taskId,
    backend: 'docker' as const,
    projectRootSha256: sha256(canonicalProjectRoot(projectRoot)),
    attemptId,
  });
  if (!hasValidRefShape(ref as unknown as Record<string, unknown>)) {
    throw createExecutionAuthorityError('Invalid Docker result settlement reference');
  }
  assertHostAuthorityOutsideProject(projectRoot, ref);
  return ref;
}

export function assertTaskResultSettlementRef(
  projectRoot: string,
  taskId: string,
  ref: TaskResultSettlementRefV1,
): void {
  if (
    !hasValidRefShape(ref as unknown as Record<string, unknown>)
    || ref.taskId !== taskId
    || ref.projectRootSha256 !== sha256(canonicalProjectRoot(projectRoot))
  ) {
    throw createExecutionAuthorityError('Docker result settlement reference does not match project/task authority');
  }
  assertHostAuthorityOutsideProject(projectRoot, ref);
}

export function taskResultSettlementAttemptPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'attempt.json');
}

export function taskResultSettlementPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'settled.json');
}

export function taskResultSettlementPreparedPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'prepared.json');
}

export function taskResultSettlementPromptPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'prompt.txt');
}

/** Host-only immutable bytes used to attribute shared-worktree changes to this attempt. */
export function taskResultSettlementWorkAttributionBaselinePath(
  ref: TaskResultSettlementRefV1,
): string {
  return resolve(settlementAttemptDir(ref), 'work-attribution-baseline.txt');
}

/**
 * Publish claim-time work-attribution bytes under exact-attempt authority.
 * The settlement store owns the host-only path, first-writer rule, fsync and
 * private-mode guarantees. Identical replay is idempotent; conflicts fail.
 */
export function writeTaskResultSettlementWorkAttributionBaselineAtomic(
  ref: TaskResultSettlementRefV1,
  manifest: string,
): string {
  const attempt = parseTaskResultSettlementAttempt(readJson(taskResultSettlementAttemptPath(ref)));
  if (!attempt || !sameRef(attempt, ref)) {
    throw createExecutionAuthorityError(
      'Docker work-attribution baseline has no matching durable pending attempt',
    );
  }
  const path = taskResultSettlementWorkAttributionBaselinePath(ref);
  const bytes = Buffer.from(manifest, 'utf-8');
  publishBytesFirstWriter(path, bytes);
  const persisted = readFileSync(path);
  if (!persisted.equals(bytes)) {
    throw createExecutionAuthorityError(
      'Docker work-attribution baseline could not be verified after publication',
    );
  }
  return path;
}

export function taskResultSettlementPromptMetadataPath(
  ref: TaskResultSettlementRefV1,
): string {
  return resolve(settlementAttemptDir(ref), 'prompt.json');
}

export function taskResultSettlementExecutionContractPath(
  ref: TaskResultSettlementRefV1,
): string {
  return resolve(settlementAttemptDir(ref), 'execution-contract.json');
}

export function taskResultSettlementExecutionBudgetAuthorityPath(
  ref: TaskResultSettlementRefV1,
): string {
  return resolve(settlementAttemptDir(ref), 'execution-budget-authority.json');
}

export function taskResultSettlementDispatchPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'dispatch.json');
}

export function taskProviderTerminalBillingReceiptPath(
  ref: TaskResultSettlementRefV1,
): string {
  return resolve(settlementAttemptDir(ref), 'provider-terminal.json');
}

export function taskProviderActualCallReceiptPath(
  ref: TaskResultSettlementRefV1,
): string {
  return resolve(settlementAttemptDir(ref), 'provider-actual-call.json');
}

export function taskProviderTerminalUsageReceiptPath(
  ref: TaskResultSettlementRefV1,
): string {
  return resolve(settlementAttemptDir(ref), 'provider-terminal-usage.json');
}

export function taskResultSettlementClosurePath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'closure.json');
}

export function taskResultSettlementLandedRetirementPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'landed-retirement.json');
}

function taskResultSettlementClaimsDir(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementTaskDir(ref), 'claims');
}

export function taskResultSettlementClaimPath(
  ref: TaskResultSettlementRefV1,
  previousAuthoritySha256: string | null = null,
): string {
  if (previousAuthoritySha256 !== null && !/^[a-f0-9]{64}$/.test(previousAuthoritySha256)) {
    throw createExecutionAuthorityError('Invalid Docker result settlement predecessor digest');
  }
  return resolve(
    taskResultSettlementClaimsDir(ref),
    previousAuthoritySha256 === null ? 'root.json' : `${previousAuthoritySha256}.json`,
  );
}

function resultDigest(result: Record<string, unknown>): string {
  return sha256(JSON.stringify(result));
}

function providerBillingDigest(billing: ProviderBillingEvidence): string {
  return sha256(JSON.stringify({
    source: billing.source,
    provider: billing.provider,
    currency: billing.currency,
    providerReportedUsd: billing.providerReportedUsd,
    modelUsage: billing.modelUsage,
  }));
}

function sameRef(record: TaskResultSettlementRefV1, ref: TaskResultSettlementRefV1): boolean {
  return record.schemaVersion === ref.schemaVersion
    && record.taskId === ref.taskId
    && record.backend === ref.backend
    && record.projectRootSha256 === ref.projectRootSha256
    && record.attemptId === ref.attemptId;
}

function hasValidRefShape(record: Record<string, unknown>): boolean {
  return record.schemaVersion === TASK_RESULT_SETTLEMENT_SCHEMA_VERSION
    && typeof record.taskId === 'string'
    && record.taskId.length > 0
    && record.backend === 'docker'
    && typeof record.projectRootSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(record.projectRootSha256)
    && typeof record.attemptId === 'string'
    && /^[0-9a-f-]{36}$/i.test(record.attemptId);
}

function hasExactAttemptLabels(
  value: unknown,
  ref: TaskResultSettlementRefV1,
): value is Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const labels = value as Record<string, unknown>;
  const expected = dockerAttemptLabels(ref);
  return Object.keys(labels).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, expectedValue]) => labels[key] === expectedValue);
}

function hasValidContainerIdentity(
  record: Record<string, unknown>,
  ref: TaskResultSettlementRefV1,
): boolean {
  return record.containerName === dockerContainerNameFromAuthority(ref.projectRootSha256, ref.taskId)
    && typeof record.model === 'string'
    && record.model.length > 0
    && hasExactAttemptLabels(record.labels, ref);
}

export function createTaskResultSettlement(input: {
  ref: TaskResultSettlementRefV1;
  exitCode: number | null;
  result: Record<string, unknown>;
  settledAt?: string;
}): TaskResultSettlementV1 {
  if (input.result.taskId !== input.ref.taskId) {
    throw createExecutionAuthorityError('Docker result settlement TaskResult does not match its attempt taskId');
  }
  return {
    ...input.ref,
    state: 'settled',
    settledAt: input.settledAt ?? new Date().toISOString(),
    exitCode: input.exitCode,
    resultSha256: resultDigest(input.result),
    result: input.result,
  };
}

export function parseTaskResultSettlementAttempt(
  value: unknown,
): TaskResultSettlementAttemptV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.state !== 'pending'
    || typeof record.createdAt !== 'string'
  ) return null;
  return record as unknown as TaskResultSettlementAttemptV1;
}

export function parseTaskResultSettlementActiveClaim(
  value: unknown,
): TaskResultSettlementActiveClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const predecessorValid = typeof record.previousAuthoritySha256 === 'string'
    && /^[a-f0-9]{64}$/.test(record.previousAuthoritySha256);
  if (
    hasValidRefShape(record)
    && record.lifecycleVersion === TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION_V2
    && record.state === 'claimed'
    && typeof record.claimedAt === 'string'
    && predecessorValid
  ) {
    return record as unknown as TaskResultSettlementActiveClaimV2;
  }
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'claimed'
    || typeof record.claimedAt !== 'string'
    || (record.previousClosureSha256 !== null
      && (typeof record.previousClosureSha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(record.previousClosureSha256)))
  ) return null;
  return record as unknown as TaskResultSettlementActiveClaimV1;
}

export function parseTaskResultSettlementLandedRetirement(
  value: unknown,
): TaskResultSettlementLandedRetirementV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION_V2
    || record.state !== 'retired-landed'
    || typeof record.retiredAt !== 'string'
    || !Number.isFinite(Date.parse(record.retiredAt))
    || typeof record.landingCheckpointSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.landingCheckpointSha256)
    || typeof record.executionRetirementSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.executionRetirementSha256)
  ) return null;
  return record as unknown as TaskResultSettlementLandedRetirementV1;
}

export function parseTaskResultSettlementPrepared(
  value: unknown,
): TaskResultSettlementPreparedV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const ref = record as unknown as TaskResultSettlementRefV1;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'prepared'
    || typeof record.preparedAt !== 'string'
    || !hasValidContainerIdentity(record, ref)
  ) return null;
  return record as unknown as TaskResultSettlementPreparedV1;
}

export function parseTaskResultSettlementDispatch(
  value: unknown,
): TaskResultSettlementDispatchV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const ref = record as unknown as TaskResultSettlementRefV1;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'dispatched'
    || typeof record.dispatchedAt !== 'string'
    || typeof record.containerId !== 'string'
    || !/^[a-f0-9]{64}$/i.test(record.containerId)
    || typeof record.preparedSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.preparedSha256)
    || !hasValidContainerIdentity(record, ref)
  ) return null;
  return record as unknown as TaskResultSettlementDispatchV1;
}

export function parseTaskProviderTerminalBillingReceipt(
  value: unknown,
): TaskProviderTerminalBillingReceiptV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const billing = record.billing;
  if (!billing || typeof billing !== 'object' || Array.isArray(billing)) return null;
  const evidence = billing as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'provider-terminal-billing'
    || typeof record.observedAt !== 'string'
    || !Number.isFinite(Date.parse(record.observedAt))
    || typeof record.provider !== 'string'
    || record.provider.length === 0
    || typeof record.sourceEventSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.sourceEventSha256)
    || typeof record.billingSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.billingSha256)
    || evidence.source !== 'provider-envelope'
    || evidence.provider !== record.provider
    || evidence.currency !== 'USD'
    || typeof evidence.providerReportedUsd !== 'number'
    || !Number.isFinite(evidence.providerReportedUsd)
    || evidence.providerReportedUsd < 0
    || !evidence.modelUsage
    || typeof evidence.modelUsage !== 'object'
    || Array.isArray(evidence.modelUsage)
    || typeof evidence.capturedAt !== 'string'
    || !Number.isFinite(Date.parse(evidence.capturedAt))
    || evidence.lineage !== undefined
    || record.billingSha256
      !== providerBillingDigest(evidence as unknown as ProviderBillingEvidence)
  ) return null;
  return record as unknown as TaskProviderTerminalBillingReceiptV1;
}

function hasFiniteUsageCounters(value: unknown): value is LiveUsageCounters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const counters = value as Record<string, unknown>;
  const keys = [
    'turns',
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheCreationTokens',
    'totalTokens',
    'maxContextTokens',
  ];
  return Object.keys(counters).length === keys.length
    && keys.every(key => typeof counters[key] === 'number'
      && Number.isSafeInteger(counters[key])
      && (counters[key] as number) >= 0);
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isPositiveSafeInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function actualCallCommonShapeInvalid(record: Record<string, unknown>): boolean {
  return !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'provider-actual-call'
    || typeof record.observedAt !== 'string'
    || !Number.isFinite(Date.parse(record.observedAt))
    || typeof record.provider !== 'string'
    || typeof record.model !== 'string'
    || typeof record.authMode !== 'string'
    || (record.accountRefHash !== null
      && (typeof record.accountRefHash !== 'string'
        || !/^[a-f0-9]{64}$/u.test(record.accountRefHash)))
    || typeof record.transport !== 'string'
    || typeof record.executionBackend !== 'string'
    || (record.endpointRefHash !== null
      && (typeof record.endpointRefHash !== 'string'
        || !/^[a-f0-9]{64}$/u.test(record.endpointRefHash)))
    || typeof record.executionProfileRef !== 'string'
    || typeof record.executionContractEvidenceRef !== 'string'
    || typeof record.sourceEventSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record.sourceEventSha256);
}

export function parseTaskProviderActualCallReceipt(
  value: unknown,
): TaskProviderActualCallReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (actualCallCommonShapeInvalid(record)) return null;
  if (record.proofKind === 'subscription_transport_usage') {
    const usage = asRecordOrNull(record.usage);
    if (
      typeof record.providerTerminalUsageEvidenceRef !== 'string'
      || typeof record.terminalTransportSettlementDigest !== 'string'
      || !/^[a-f0-9]{64}$/u.test(record.terminalTransportSettlementDigest)
      || !usage
      || !isPositiveSafeInt(usage.totalTokens)
      || !isNonNegativeSafeInt(usage.inputTokens)
      || !isNonNegativeSafeInt(usage.outputTokens)
      || 'providerBillingEvidenceRef' in record
    ) return null;
    return record as unknown as TaskProviderActualCallReceiptV2;
  }
  if (typeof record.providerBillingEvidenceRef !== 'string' || 'proofKind' in record) return null;
  return record as unknown as TaskProviderActualCallReceiptV1;
}

export function parseTaskProviderTerminalUsageReceipt(
  value: unknown,
): TaskProviderTerminalUsageReceiptV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'provider-terminal-usage'
    || typeof record.observedAt !== 'string'
    || !Number.isFinite(Date.parse(record.observedAt))
    || typeof record.budgetFingerprint !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record.budgetFingerprint)
    || typeof record.executionContractEvidenceRef !== 'string'
    || typeof record.sourceUsageSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record.sourceUsageSha256)
    || !['within-budget', 'landing-requested', 'exceeded', 'unmeasurable']
      .includes(String(record.decisionState))
    || !hasFiniteUsageCounters(record.counters)
  ) return null;
  return record as unknown as TaskProviderTerminalUsageReceiptV1;
}

export function parseTaskResultSettlementClosure(
  value: unknown,
): TaskResultSettlementClosureV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'closed'
    || typeof record.closedAt !== 'string'
    || typeof record.settlementSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.settlementSha256)
    || !['not-dispatched', 'stopped-removed', 'absent-after-exit'].includes(String(record.containerDisposition))
    || record.locksReleased !== true
    || (record.evidenceRef !== undefined && typeof record.evidenceRef !== 'string')
  ) return null;
  return record as unknown as TaskResultSettlementClosureV1;
}

export function parseTaskResultSettlement(value: unknown): TaskResultSettlementV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.state !== 'settled'
    || typeof record.settledAt !== 'string'
    || (record.exitCode !== null && (typeof record.exitCode !== 'number' || !Number.isInteger(record.exitCode)))
    || typeof record.resultSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.resultSha256)
    || !record.result
    || typeof record.result !== 'object'
    || Array.isArray(record.result)
    || (record.result as Record<string, unknown>).taskId !== record.taskId
    || record.resultSha256 !== resultDigest(record.result as Record<string, unknown>)
  ) return null;
  return record as unknown as TaskResultSettlementV1;
}

function publishJsonFirstWriter(
  path: string,
  value: unknown,
  acceptsExisting: (existing: unknown) => boolean,
): boolean {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  let published = false;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    const fileFd = openSync(tmp, 'r');
    try { fsyncSync(fileFd); } finally { closeSync(fileFd); }
    try {
      linkSync(tmp, path);
      published = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      let existing: unknown;
      try { existing = JSON.parse(readFileSync(path, 'utf-8')); } catch { existing = null; }
      if (!acceptsExisting(existing)) {
        throw createExecutionAuthorityError(`Conflicting immutable Docker result settlement already exists: ${path}`);
      }
    }
    if (published) {
      try {
        const dirFd = openSync(parent, 'r');
        try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
      } catch { /* directory fsync is unsupported on some platforms */ }
    }
  } finally {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
  }
  return published;
}

function publishBytesFirstWriter(path: string, value: Buffer): boolean {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  let published = false;
  try {
    writeFileSync(tmp, value, { mode: 0o600 });
    const fileFd = openSync(tmp, 'r');
    try { fsyncSync(fileFd); } finally { closeSync(fileFd); }
    try {
      linkSync(tmp, path);
      published = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      const existing = readFileSync(path);
      if (!existing.equals(value)) {
        throw createDockerLifecycleError(
          `Conflicting immutable Docker result settlement already exists: ${path}`,
        );
      }
    }
    chmodSync(path, 0o600);
    if (published) {
      try {
        const dirFd = openSync(parent, 'r');
        try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
      } catch { /* directory fsync is unsupported on some platforms */ }
    }
  } finally {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
  }
  return published;
}

function hasPrivateFileMode(path: string): boolean {
  return process.platform === 'win32' || (statSync(path).mode & 0o077) === 0;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/** Persist the exact attempt before any provider/backend side effect. */
export function writeTaskResultSettlementAttemptAtomic(
  ref: TaskResultSettlementRefV1,
  createdAt: string = new Date().toISOString(),
): void {
  const attempt: TaskResultSettlementAttemptV1 = { ...ref, state: 'pending', createdAt };
  publishJsonFirstWriter(
    taskResultSettlementAttemptPath(ref),
    attempt,
    (existing) => {
      const parsed = parseTaskResultSettlementAttempt(existing);
      return parsed !== null && sameRef(parsed, ref);
    },
  );
}

function executionBudgetAuthorityEvidenceRef(
  record: Omit<TaskResultSettlementExecutionBudgetAuthorityV1, 'evidenceRef'>,
): string {
  return `docker-execution-budget:sha256:${sha256(JSON.stringify(record))}`;
}

function parseTaskResultSettlementExecutionBudgetAuthority(
  value: unknown,
): TaskResultSettlementExecutionBudgetAuthorityV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as TaskResultSettlementExecutionBudgetAuthorityV1;
  try {
    if (
      !hasValidRefShape(record as unknown as Record<string, unknown>)
      || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
      || record.state !== 'execution-budget-authority'
      || typeof record.writtenAt !== 'string'
      || !Number.isFinite(Date.parse(record.writtenAt))
      || typeof record.model !== 'string'
      || record.model.trim().length === 0
      || !['attended', 'unattended'].includes(record.admissionMode)
      || (record.approvalEvidenceRef !== undefined
        && (typeof record.approvalEvidenceRef !== 'string'
          || record.approvalEvidenceRef.length === 0))
    ) return null;
    assertExecutionBudgetShape(record.budget, 'docker-recovery-authority');
    if (record.landingPolicy !== undefined) {
      assertExecutionLandingPolicyConfig(
        record.landingPolicy,
        'docker recovery execution landing policy',
      );
    }
    const { evidenceRef: _evidenceRef, ...content } = record;
    if (record.evidenceRef !== executionBudgetAuthorityEvidenceRef(content)) return null;
    return record;
  } catch {
    return null;
  }
}

export function writeTaskResultSettlementExecutionBudgetAuthorityAtomic(
  ref: TaskResultSettlementRefV1,
  input: {
    model: string;
    budget: ExecutionBudget;
    landingPolicy?: ExecutionLandingPolicyConfig;
    admissionMode?: ExecutionAdmissionMode;
    approvalEvidenceRef?: string;
    writtenAt?: string;
  },
): Readonly<TaskResultSettlementExecutionBudgetAuthorityV1> {
  const attempt = parseTaskResultSettlementAttempt(readJson(taskResultSettlementAttemptPath(ref)));
  if (!attempt || !sameRef(attempt, ref)) {
    throw createExecutionAuthorityError(
      'Docker execution budget authority has no matching durable pending attempt',
    );
  }
  assertExecutionBudgetShape(input.budget, 'docker');
  if (input.landingPolicy !== undefined) {
    assertExecutionLandingPolicyConfig(
      input.landingPolicy,
      'docker execution landing policy',
    );
  }
  const content = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'execution-budget-authority' as const,
    writtenAt: input.writtenAt ?? new Date().toISOString(),
    model: input.model,
    budget: input.budget,
    ...(input.landingPolicy ? { landingPolicy: input.landingPolicy } : {}),
    admissionMode: input.admissionMode ?? 'unattended',
    ...(input.approvalEvidenceRef
      ? { approvalEvidenceRef: input.approvalEvidenceRef }
      : {}),
  };
  const authority: TaskResultSettlementExecutionBudgetAuthorityV1 = {
    ...content,
    evidenceRef: executionBudgetAuthorityEvidenceRef(content),
  };
  const path = taskResultSettlementExecutionBudgetAuthorityPath(ref);
  publishJsonFirstWriter(
    path,
    authority,
    existing => JSON.stringify(
      parseTaskResultSettlementExecutionBudgetAuthority(existing),
    ) === JSON.stringify(authority),
  );
  chmodSync(path, 0o600);
  const persisted = readTaskResultSettlementExecutionBudgetAuthority(ref);
  if (!persisted || persisted.evidenceRef !== authority.evidenceRef) {
    throw createExecutionAuthorityError(
      'Docker execution budget authority could not be verified after publication',
    );
  }
  return persisted;
}

export function readTaskResultSettlementExecutionBudgetAuthority(
  ref: TaskResultSettlementRefV1,
): Readonly<TaskResultSettlementExecutionBudgetAuthorityV1> | null {
  const path = taskResultSettlementExecutionBudgetAuthorityPath(ref);
  const authority = parseTaskResultSettlementExecutionBudgetAuthority(readJson(path));
  if (!authority || !sameRef(authority, ref)) return null;
  try {
    if (!hasPrivateFileMode(path)) return null;
    return deepFreeze(authority);
  } catch {
    return null;
  }
}

export function writeTaskResultSettlementExecutionContractAtomic(
  ref: TaskResultSettlementRefV1,
  contract: Readonly<CrossVerifyEnforcedAttemptContract>,
): Readonly<CrossVerifyEnforcedAttemptContract> {
  const attempt = parseTaskResultSettlementAttempt(readJson(taskResultSettlementAttemptPath(ref)));
  if (!attempt || !sameRef(attempt, ref)) {
    throw createExecutionAuthorityError(
      'Docker execution contract authority has no matching durable pending attempt',
    );
  }
  assertCrossVerifyEnforcedAttemptContract(contract);
  if (!sameRef(contract.settlementAttemptRef, ref)) {
    throw createExecutionAuthorityError(
      'Docker execution contract does not match its settlement attempt',
    );
  }
  const path = taskResultSettlementExecutionContractPath(ref);
  publishJsonFirstWriter(
    path,
    contract,
    (existing) => {
      try {
        const parsed = existing as CrossVerifyEnforcedAttemptContract;
        return sameRef(parsed.settlementAttemptRef, ref)
          && sameCrossVerifyExecutionContract(parsed, contract);
      } catch {
        return false;
      }
    },
  );
  chmodSync(path, 0o600);
  const persisted = readTaskResultSettlementExecutionContract(ref);
  if (!persisted || !sameCrossVerifyExecutionContract(persisted, contract)) {
    throw createExecutionAuthorityError(
      'Docker execution contract authority could not be verified after publication',
    );
  }
  return persisted;
}

export function readTaskResultSettlementExecutionContract(
  ref: TaskResultSettlementRefV1,
): Readonly<CrossVerifyEnforcedAttemptContract> | null {
  const path = taskResultSettlementExecutionContractPath(ref);
  try {
    const contract = JSON.parse(
      readFileSync(path, 'utf-8'),
    ) as CrossVerifyEnforcedAttemptContract;
    assertCrossVerifyEnforcedAttemptContract(contract);
    if (!sameRef(contract.settlementAttemptRef, ref) || !hasPrivateFileMode(path)) {
      return null;
    }
    return deepFreeze(contract);
  } catch {
    return null;
  }
}

function parseTaskResultSettlementPromptArtifact(
  value: unknown,
): TaskResultSettlementPromptArtifactV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'prompt-prepared'
    || typeof record.preparedAt !== 'string'
    || !Number.isFinite(Date.parse(record.preparedAt))
    || typeof record.promptSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record.promptSha256)
    || typeof record.byteLength !== 'number'
    || !Number.isSafeInteger(record.byteLength)
    || record.byteLength < 0
  ) return null;
  return record as unknown as TaskResultSettlementPromptArtifactV1;
}

export function writeTaskResultSettlementPromptAtomic(
  ref: TaskResultSettlementRefV1,
  prompt: string,
  preparedAt: string = new Date().toISOString(),
): TaskResultSettlementPromptArtifactV1 {
  const attempt = parseTaskResultSettlementAttempt(readJson(taskResultSettlementAttemptPath(ref)));
  if (!attempt || !sameRef(attempt, ref)) {
    throw createExecutionAuthorityError(
      'Docker prompt authority has no matching durable pending attempt',
    );
  }
  if (!Number.isFinite(Date.parse(preparedAt))) {
    throw createExecutionAuthorityError('Docker prompt preparedAt is not a timestamp');
  }
  const bytes = Buffer.from(prompt, 'utf-8');
  const artifact: TaskResultSettlementPromptArtifactV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'prompt-prepared',
    preparedAt,
    promptSha256: sha256(prompt),
    byteLength: bytes.byteLength,
  };
  publishBytesFirstWriter(taskResultSettlementPromptPath(ref), bytes);
  publishJsonFirstWriter(
    taskResultSettlementPromptMetadataPath(ref),
    artifact,
    (existing) => {
      const parsed = parseTaskResultSettlementPromptArtifact(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.promptSha256 === artifact.promptSha256
        && parsed.byteLength === artifact.byteLength;
    },
  );
  chmodSync(taskResultSettlementPromptMetadataPath(ref), 0o600);
  const persisted = readTaskResultSettlementPrompt(ref);
  if (!persisted) {
    throw createExecutionAuthorityError(
      'Docker prompt authority could not be verified after publication',
    );
  }
  return persisted;
}

export function readTaskResultSettlementPrompt(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementPromptArtifactV1 | null {
  const artifact = parseTaskResultSettlementPromptArtifact(
    readJson(taskResultSettlementPromptMetadataPath(ref)),
  );
  if (!artifact || !sameRef(artifact, ref)) return null;
  const path = taskResultSettlementPromptPath(ref);
  const metadataPath = taskResultSettlementPromptMetadataPath(ref);
  try {
    const bytes = readFileSync(path);
    return hasPrivateFileMode(path)
      && hasPrivateFileMode(metadataPath)
      && bytes.byteLength === artifact.byteLength
      && sha256(bytes.toString('utf-8')) === artifact.promptSha256
      ? artifact
      : null;
  } catch {
    return null;
  }
}

export function taskResultSettlementPromptEvidenceRef(
  artifact: TaskResultSettlementPromptArtifactV1,
): string {
  const parsed = parseTaskResultSettlementPromptArtifact(artifact);
  if (!parsed) throw createExecutionAuthorityError('Invalid Docker prompt evidence');
  return `task-result-prompt:${sha256(JSON.stringify(parsed))}`;
}

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function closureDigest(closure: TaskResultSettlementClosureV1): string {
  return sha256(JSON.stringify(closure));
}

function landedRetirementDigest(retirement: TaskResultSettlementLandedRetirementV1): string {
  return sha256(JSON.stringify(retirement));
}

function preparedDigest(prepared: TaskResultSettlementPreparedV1): string {
  return sha256(JSON.stringify(prepared));
}

function claimPredecessorSha256(claim: TaskResultSettlementActiveClaim): string | null {
  return claim.lifecycleVersion === TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION_V2
    ? claim.previousAuthoritySha256
    : claim.previousClosureSha256;
}

function executionLandingRef(
  ref: TaskResultSettlementRefV1,
): ExecutionLandingCheckpointRefV1 {
  return {
    schemaVersion: 1,
    projectId: ref.projectRootSha256,
    taskId: ref.taskId,
    attemptId: ref.attemptId,
  };
}

export function readTaskResultSettlementClosure(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementClosureV1 | null {
  const closure = parseTaskResultSettlementClosure(readJson(taskResultSettlementClosurePath(ref)));
  if (!closure || !sameRef(closure, ref)) return null;
  const settlement = readTaskResultSettlement(ref);
  return settlement && closure.settlementSha256 === sha256(JSON.stringify(settlement))
    ? closure
    : null;
}

export function readTaskResultSettlementLandedRetirement(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementLandedRetirementV1 | null {
  const path = taskResultSettlementLandedRetirementPath(ref);
  if (!existsSync(path)) return null;
  const retirement = parseTaskResultSettlementLandedRetirement(readJson(path));
  if (!retirement || !sameRef(retirement, ref)) return null;
  const landingRef = executionLandingRef(ref);
  const checkpoint = readExecutionLandingCheckpointByRef(landingRef);
  const executionRetirement = readExecutionAttemptRetirementByRef(landingRef);
  if (
    !checkpoint
    || !executionRetirement
    || retirement.landingCheckpointSha256 !== checkpoint.checkpointSha256
    || retirement.executionRetirementSha256
      !== executionAttemptRetirementDigest(executionRetirement)
  ) return null;
  return retirement;
}

function resolveTaskResultSettlementClaimChain(
  ref: TaskResultSettlementRefV1,
): {
  active: TaskResultSettlementActiveClaim | null;
  latest: TaskResultSettlementActiveClaim | null;
  nextPreviousAuthoritySha256: string | null;
  closedAttemptIds: ReadonlySet<string>;
} {
  let previousAuthoritySha256: string | null = null;
  let latest: TaskResultSettlementActiveClaim | null = null;
  const closedAttemptIds = new Set<string>();
  const seenClaimPaths = new Set<string>();
  for (let depth = 0; depth < 1024; depth++) {
    const claimPath = taskResultSettlementClaimPath(ref, previousAuthoritySha256);
    if (seenClaimPaths.has(claimPath)) {
      throw createExecutionAuthorityError(`Cyclic Docker result settlement claim chain: ${claimPath}`);
    }
    seenClaimPaths.add(claimPath);
    if (!existsSync(claimPath)) {
      return { active: null, latest, nextPreviousAuthoritySha256: previousAuthoritySha256, closedAttemptIds };
    }
    const claim = parseTaskResultSettlementActiveClaim(readJson(claimPath));
    if (
      !claim
      || claim.projectRootSha256 !== ref.projectRootSha256
      || claim.taskId !== ref.taskId
      || claimPredecessorSha256(claim) !== previousAuthoritySha256
    ) {
      throw createExecutionAuthorityError(`Corrupt Docker result settlement claim chain: ${claimPath}`);
    }
    latest = claim;
    const closurePath = taskResultSettlementClosurePath(claim);
    const landedRetirementPath = taskResultSettlementLandedRetirementPath(claim);
    const hasClosure = existsSync(closurePath);
    const hasLandedRetirement = existsSync(landedRetirementPath);
    if (hasClosure && hasLandedRetirement) {
      throw createExecutionAuthorityError(
        `Conflicting terminal and LANDED Docker result settlement authorities: ${claim.taskId}/${claim.attemptId}`,
      );
    }
    if (!hasClosure && !hasLandedRetirement) {
      return { active: claim, latest, nextPreviousAuthoritySha256: previousAuthoritySha256, closedAttemptIds };
    }
    let nextAuthoritySha256: string;
    if (hasClosure) {
      const closure = readTaskResultSettlementClosure(claim);
      if (!closure) {
        throw createExecutionAuthorityError(`Corrupt Docker result settlement closure: ${closurePath}`);
      }
      nextAuthoritySha256 = closureDigest(closure);
    } else {
      const retirement = readTaskResultSettlementLandedRetirement(claim);
      if (!retirement) {
        throw createExecutionAuthorityError(`Corrupt Docker result settlement LANDED retirement: ${landedRetirementPath}`);
      }
      nextAuthoritySha256 = landedRetirementDigest(retirement);
    }
    closedAttemptIds.add(claim.attemptId);
    previousAuthoritySha256 = nextAuthoritySha256;
  }
  throw createExecutionAuthorityError('Docker result settlement claim chain exceeds the bounded recovery depth');
}

export function readTaskResultSettlementActiveClaim(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementActiveClaim | null {
  return resolveTaskResultSettlementClaimChain(ref).active;
}

/** Immutable fence identity consumed by host-owned landing checkpoints. */
export function taskResultSettlementActiveClaimDigest(
  ref: TaskResultSettlementRefV1,
): string {
  const claim = readTaskResultSettlementActiveClaim(ref);
  if (!claim || !sameRef(claim, ref)) {
    throw createExecutionAuthorityError('Docker result settlement has no matching active claim fence');
  }
  return sha256(JSON.stringify(claim));
}

/**
 * The settlement's DURABLE claim fence — the active claim while the attempt is
 * live, and the immutable closed/LANDED tail afterwards. The claim record itself
 * is never rewritten on closure (closure is a sibling file), so its fence digest
 * `sha256(JSON.stringify(claim))` is identical before and after closure. The host
 * verdict receipt is the FINAL artifact, persisted after the coordinator closes
 * the settlement, so it must bind to this durable claim identity rather than an
 * active claim that closure has already retired. Returns null (fail-closed) when
 * no claim matches the exact ref.
 */
export function taskResultSettlementDurableClaimFence(
  ref: TaskResultSettlementRefV1,
): { readonly fenceTokenHash: string; readonly claimedAt: string } | null {
  const chain = resolveTaskResultSettlementClaimChain(ref);
  const claim = chain.active ?? chain.latest;
  if (!claim || !sameRef(claim, ref)) return null;
  return { fenceTokenHash: sha256(JSON.stringify(claim)), claimedAt: claim.claimedAt };
}

/**
 * Resolve the exact host-owned lifecycle authority for one canonical project/task.
 * Active execution wins; after closure the immutable tail remains discoverable so
 * restart-time consumers do not need an in-memory settlementRef or raw `.result`.
 */
export function readLatestTaskResultSettlementRef(
  projectRoot: string,
  taskId: string,
): TaskResultSettlementRefV1 | null {
  const probe = createTaskResultSettlementRef(projectRoot, taskId);
  const chain = resolveTaskResultSettlementClaimChain(probe);
  const latest = chain.active ?? chain.latest;
  if (!latest) return null;
  assertTaskResultSettlementRef(projectRoot, taskId, latest);
  const attempt = parseTaskResultSettlementAttempt(
    readJson(taskResultSettlementAttemptPath(latest)),
  );
  if (!attempt || !sameRef(attempt, latest)) {
    throw createExecutionAuthorityError(
      `Corrupt Docker result settlement authority: ${taskResultSettlementAttemptPath(latest)}`,
    );
  }
  return Object.freeze({
    schemaVersion: latest.schemaVersion,
    taskId: latest.taskId,
    backend: latest.backend,
    projectRootSha256: latest.projectRootSha256,
    attemptId: latest.attemptId,
  });
}

/**
 * Claim the daemon-global project/task execution slot before any Docker side effect.
 * The claim chain is append-only. A closed claim's immutable digest selects the
 * next first-writer-wins slot, so no actor ever unlinks a newer owner's claim.
 */
export function claimTaskResultSettlementAttemptAtomic(
  ref: TaskResultSettlementRefV1,
  claimedAt: string = new Date().toISOString(),
): 'claimed' | 'adopted' {
  if (!hasValidRefShape(ref as unknown as Record<string, unknown>)) {
    throw createExecutionAuthorityError('Invalid Docker result settlement reference');
  }
  const attempt = parseTaskResultSettlementAttempt(readJson(taskResultSettlementAttemptPath(ref)));
  if (!attempt || !sameRef(attempt, ref)) {
    throw createExecutionAuthorityError('Docker result settlement claim has no matching durable pending attempt');
  }
  const chain = resolveTaskResultSettlementClaimChain(ref);
  if (chain.closedAttemptIds.has(ref.attemptId)) return 'adopted';
  if (chain.active) {
    if (sameRef(chain.active, ref)) return 'adopted';
    throw createExecutionAuthorityError(
      `Conflicting active Docker result settlement attempt: ${chain.active.taskId}/${chain.active.attemptId}`,
    );
  }

  const claim: TaskResultSettlementActiveClaim = chain.nextPreviousAuthoritySha256 === null
    ? {
        ...ref,
        lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
        state: 'claimed',
        claimedAt,
        previousClosureSha256: null,
      }
    : {
        ...ref,
        lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION_V2,
        state: 'claimed',
        claimedAt,
        previousAuthoritySha256: chain.nextPreviousAuthoritySha256,
      };
  const published = publishJsonFirstWriter(
    taskResultSettlementClaimPath(ref, chain.nextPreviousAuthoritySha256),
    claim,
    (existing) => {
      const parsed = parseTaskResultSettlementActiveClaim(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && claimPredecessorSha256(parsed) === chain.nextPreviousAuthoritySha256;
    },
  );
  return published ? 'claimed' : 'adopted';
}

function assertPendingAttemptAndClaim(ref: TaskResultSettlementRefV1): void {
  const attempt = parseTaskResultSettlementAttempt(readJson(taskResultSettlementAttemptPath(ref)));
  const claim = readTaskResultSettlementActiveClaim(ref);
  if (!attempt || !sameRef(attempt, ref) || !claim || !sameRef(claim, ref)) {
    throw createExecutionAuthorityError('Docker dispatch metadata has no matching durable pending attempt claim');
  }
}

export function writeTaskResultSettlementPreparedAtomic(
  ref: TaskResultSettlementRefV1,
  model: string,
  preparedAt: string = new Date().toISOString(),
): TaskResultSettlementPreparedV1 {
  assertPendingAttemptAndClaim(ref);
  if (!model.trim()) throw createExecutionAuthorityError('Docker dispatch model identity must be non-empty');
  const prepared: TaskResultSettlementPreparedV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'prepared',
    preparedAt,
    containerName: dockerContainerNameFromAuthority(ref.projectRootSha256, ref.taskId),
    model,
    labels: dockerAttemptLabels(ref),
  };
  publishJsonFirstWriter(
    taskResultSettlementPreparedPath(ref),
    prepared,
    (existing) => {
      const parsed = parseTaskResultSettlementPrepared(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.model === prepared.model
        && parsed.containerName === prepared.containerName;
    },
  );
  return prepared;
}

export function readTaskResultSettlementPrepared(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementPreparedV1 | null {
  const prepared = parseTaskResultSettlementPrepared(readJson(taskResultSettlementPreparedPath(ref)));
  return prepared && sameRef(prepared, ref) ? prepared : null;
}

export function writeTaskResultSettlementDispatchAtomic(
  ref: TaskResultSettlementRefV1,
  containerId: string,
  dispatchedAt: string = new Date().toISOString(),
): TaskResultSettlementDispatchV1 {
  assertPendingAttemptAndClaim(ref);
  const prepared = readTaskResultSettlementPrepared(ref);
  if (!prepared) throw createExecutionAuthorityError('Docker dispatch has no matching immutable prepared metadata');
  const dispatch: TaskResultSettlementDispatchV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'dispatched',
    dispatchedAt,
    containerName: prepared.containerName,
    containerId,
    model: prepared.model,
    labels: prepared.labels,
    preparedSha256: preparedDigest(prepared),
  };
  if (!parseTaskResultSettlementDispatch(dispatch)) {
    throw createExecutionAuthorityError('Invalid Docker dispatch container identity');
  }
  publishJsonFirstWriter(
    taskResultSettlementDispatchPath(ref),
    dispatch,
    (existing) => {
      const parsed = parseTaskResultSettlementDispatch(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.containerId === dispatch.containerId
        && parsed.containerName === dispatch.containerName;
    },
  );
  return dispatch;
}

export function readTaskResultSettlementDispatch(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementDispatchV1 | null {
  const dispatch = parseTaskResultSettlementDispatch(readJson(taskResultSettlementDispatchPath(ref)));
  if (!dispatch || !sameRef(dispatch, ref)) return null;
  const prepared = readTaskResultSettlementPrepared(ref);
  return prepared && dispatch.preparedSha256 === preparedDigest(prepared) ? dispatch : null;
}

export function writeTaskProviderTerminalBillingReceiptAtomic(
  ref: TaskResultSettlementRefV1,
  billing: ProviderBillingEvidence,
  sourceEventSha256: string,
  observedAt: string = billing.capturedAt,
): TaskProviderTerminalBillingReceiptV1 {
  assertPendingAttemptAndClaim(ref);
  const receipt: TaskProviderTerminalBillingReceiptV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'provider-terminal-billing',
    observedAt,
    provider: billing.provider,
    sourceEventSha256,
    billingSha256: providerBillingDigest(billing),
    billing,
  };
  if (!parseTaskProviderTerminalBillingReceipt(receipt)) {
    throw createDockerLifecycleError('Invalid Docker provider terminal billing receipt');
  }
  const path = taskProviderTerminalBillingReceiptPath(ref);
  publishJsonFirstWriter(
    path,
    receipt,
    (existing) => {
      const parsed = parseTaskProviderTerminalBillingReceipt(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.provider === receipt.provider
        && parsed.sourceEventSha256 === receipt.sourceEventSha256
        && parsed.billingSha256 === receipt.billingSha256;
    },
  );
  chmodSync(path, 0o600);
  return receipt;
}

export function readTaskProviderTerminalBillingReceipt(
  ref: TaskResultSettlementRefV1,
): TaskProviderTerminalBillingReceiptV1 | null {
  const path = taskProviderTerminalBillingReceiptPath(ref);
  const receipt = parseTaskProviderTerminalBillingReceipt(
    readJson(path),
  );
  if (!receipt || !sameRef(receipt, ref) || !hasPrivateFileMode(path)) return null;
  const attempt = parseTaskResultSettlementAttempt(
    readJson(taskResultSettlementAttemptPath(ref)),
  );
  return attempt && sameRef(attempt, ref) ? receipt : null;
}

export function taskProviderTerminalBillingEvidenceRef(
  receipt: TaskProviderTerminalBillingReceiptV1,
): string {
  if (!parseTaskProviderTerminalBillingReceipt(receipt)) {
    throw createDockerLifecycleError('Invalid Docker provider terminal billing evidence');
  }
  return `provider-terminal-receipt:sha256:${sha256(JSON.stringify(receipt))}`;
}

function exactModelUsageIsPositive(
  billing: ProviderBillingEvidence,
  model: string,
): boolean {
  const usage = billing.modelUsage[model];
  if (!usage) return false;
  return [
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens,
    usage.cacheCreationTokens,
    usage.costUsd,
  ].some(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
}

export function writeTaskProviderActualCallReceiptAtomic(
  ref: TaskResultSettlementRefV1,
): TaskProviderActualCallReceiptV1 {
  const attempt = parseTaskResultSettlementAttempt(
    readJson(taskResultSettlementAttemptPath(ref)),
  );
  if (!attempt || !sameRef(attempt, ref)) {
    throw createDockerLifecycleError(
      'Docker provider actual-call has no matching durable attempt',
    );
  }
  const contract = readTaskResultSettlementExecutionContract(ref);
  const billing = readTaskProviderTerminalBillingReceipt(ref);
  if (!contract || !billing
    || contract.provider !== billing.provider
    || !exactModelUsageIsPositive(billing.billing, contract.model)) {
    throw createDockerLifecycleError(
      'Docker provider actual-call requires an exact contract and positive exact-model provider envelope',
    );
  }
  const receipt: TaskProviderActualCallReceiptV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'provider-actual-call',
    observedAt: billing.observedAt,
    provider: contract.provider,
    model: contract.model,
    authMode: contract.authMode,
    accountRefHash: contract.accountRefHash,
    transport: contract.transport,
    executionBackend: contract.executionBackend,
    endpointRefHash: contract.endpointRefHash,
    executionProfileRef: contract.executionProfileRef,
    executionContractEvidenceRef: contract.evidenceRef,
    providerBillingEvidenceRef: taskProviderTerminalBillingEvidenceRef(billing),
    sourceEventSha256: billing.sourceEventSha256,
  };
  if (!parseTaskProviderActualCallReceipt(receipt)) {
    throw createDockerLifecycleError('Invalid Docker provider actual-call receipt');
  }
  const path = taskProviderActualCallReceiptPath(ref);
  publishJsonFirstWriter(
    path,
    receipt,
    existing => JSON.stringify(parseTaskProviderActualCallReceipt(existing))
      === JSON.stringify(receipt),
  );
  chmodSync(path, 0o600);
  const persisted = readTaskProviderActualCallReceipt(ref);
  if (!persisted || 'proofKind' in persisted
    || JSON.stringify(persisted) !== JSON.stringify(receipt)) {
    throw createDockerLifecycleError('Docker provider actual-call receipt could not be verified');
  }
  return persisted;
}

/**
 * Subscription-arm actual-call proof: the provider call is proven ONLY from the
 * provider's genuinely-reported terminal token usage (`sourceUsageSha256` +
 * positive counters), bound to the exact execution-contract identity and THIS
 * attempt's terminal transport settlement. No usd, no estimate, no synthetic
 * value. Absent/zero usage or a missing terminal settlement throws (→ the caller
 * surfaces `actual_call_unproven`).
 */
export function writeTaskProviderActualCallReceiptFromTransportUsageAtomic(
  ref: TaskResultSettlementRefV1,
): TaskProviderActualCallReceiptV2 {
  const attempt = parseTaskResultSettlementAttempt(
    readJson(taskResultSettlementAttemptPath(ref)),
  );
  if (!attempt || !sameRef(attempt, ref)) {
    throw createDockerLifecycleError(
      'Docker provider actual-call has no matching durable attempt',
    );
  }
  const contract = readTaskResultSettlementExecutionContract(ref);
  const terminalUsage = readTaskProviderTerminalUsageReceipt(ref);
  const settlementDigest = terminalTransportSettlementDigest(ref);
  if (!contract || !terminalUsage || settlementDigest === null
    || contract.authMode !== 'subscription'
    // Post-hoc budget containment: a final-only provider's ceilings settle after
    // the call. An exceeded or unmeasurable terminal usage is NOT a successful
    // call — the proof is refused (→ actual_call_unproven / budget-violation HOLD),
    // never fabricated into success.
    || terminalUsage.decisionState === 'exceeded'
    || terminalUsage.decisionState === 'unmeasurable'
    || !(terminalUsage.counters.totalTokens > 0)) {
    throw createDockerLifecycleError(
      'Docker non-reservable actual-call requires an exact subscription contract, positive within-budget provider-reported terminal usage, and a terminal transport settlement',
    );
  }
  const receipt: TaskProviderActualCallReceiptV2 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'provider-actual-call',
    proofKind: 'subscription_transport_usage',
    observedAt: terminalUsage.observedAt,
    provider: contract.provider,
    model: contract.model,
    authMode: contract.authMode,
    accountRefHash: contract.accountRefHash,
    transport: contract.transport,
    executionBackend: contract.executionBackend,
    endpointRefHash: contract.endpointRefHash,
    executionProfileRef: contract.executionProfileRef,
    executionContractEvidenceRef: contract.evidenceRef,
    providerTerminalUsageEvidenceRef: taskProviderTerminalUsageEvidenceRef(terminalUsage),
    usage: {
      inputTokens: terminalUsage.counters.inputTokens,
      outputTokens: terminalUsage.counters.outputTokens,
      totalTokens: terminalUsage.counters.totalTokens,
    },
    terminalTransportSettlementDigest: settlementDigest,
    sourceEventSha256: terminalUsage.sourceUsageSha256,
  };
  if (!parseTaskProviderActualCallReceipt(receipt)) {
    throw createDockerLifecycleError('Invalid Docker provider actual-call receipt');
  }
  const path = taskProviderActualCallReceiptPath(ref);
  publishJsonFirstWriter(
    path,
    receipt,
    existing => JSON.stringify(parseTaskProviderActualCallReceipt(existing))
      === JSON.stringify(receipt),
  );
  chmodSync(path, 0o600);
  const persisted = readTaskProviderActualCallReceipt(ref);
  if (!persisted || !('proofKind' in persisted)
    || JSON.stringify(persisted) !== JSON.stringify(receipt)) {
    throw createDockerLifecycleError('Docker provider actual-call receipt could not be verified');
  }
  return persisted;
}

/**
 * Bind an actual-call proof to THIS attempt's terminal transport settlement:
 * the durable dispatch record (the container that carried the provider call) plus
 * the settlement's exit outcome. A proof lifted from another attempt cannot forge
 * this digest, so replay/stale evidence is rejected on read.
 */
function terminalTransportSettlementDigest(ref: TaskResultSettlementRefV1): string | null {
  const dispatch = readTaskResultSettlementDispatch(ref);
  const settlement = readTaskResultSettlement(ref);
  if (!dispatch || !settlement) return null;
  // Both the writer and every reader digest the SAME durable dispatch + settlement
  // objects, so a plain stable stringify is deterministic here.
  return sha256(JSON.stringify({
    dispatch,
    exitCode: settlement.exitCode,
    settledAt: settlement.settledAt,
  }));
}

export function readTaskProviderActualCallReceipt(
  ref: TaskResultSettlementRefV1,
): TaskProviderActualCallReceipt | null {
  const path = taskProviderActualCallReceiptPath(ref);
  const receipt = parseTaskProviderActualCallReceipt(readJson(path));
  if (!receipt || !sameRef(receipt, ref) || !hasPrivateFileMode(path)) return null;
  const contract = readTaskResultSettlementExecutionContract(ref);
  if (!contract
    || receipt.provider !== contract.provider
    || receipt.model !== contract.model
    || receipt.authMode !== contract.authMode
    || receipt.accountRefHash !== contract.accountRefHash
    || receipt.transport !== contract.transport
    || receipt.executionBackend !== contract.executionBackend
    || receipt.endpointRefHash !== contract.endpointRefHash
    || receipt.executionProfileRef !== contract.executionProfileRef
    || receipt.executionContractEvidenceRef !== contract.evidenceRef) return null;
  if ('proofKind' in receipt) {
    const terminalUsage = readTaskProviderTerminalUsageReceipt(ref);
    const settlementDigest = terminalTransportSettlementDigest(ref);
    if (!terminalUsage
      || settlementDigest === null
      || receipt.terminalTransportSettlementDigest !== settlementDigest
      || receipt.providerTerminalUsageEvidenceRef !== taskProviderTerminalUsageEvidenceRef(terminalUsage)
      || receipt.usage.totalTokens <= 0
      || receipt.usage.totalTokens !== terminalUsage.counters.totalTokens
      || receipt.usage.inputTokens !== terminalUsage.counters.inputTokens
      || receipt.usage.outputTokens !== terminalUsage.counters.outputTokens) return null;
    return receipt;
  }
  const billing = readTaskProviderTerminalBillingReceipt(ref);
  if (!billing
    || receipt.providerBillingEvidenceRef !== taskProviderTerminalBillingEvidenceRef(billing)
    || receipt.sourceEventSha256 !== billing.sourceEventSha256
    || !exactModelUsageIsPositive(billing.billing, contract.model)) return null;
  return receipt;
}

export function taskProviderActualCallEvidenceRef(
  receipt: TaskProviderActualCallReceipt,
): string {
  if (!parseTaskProviderActualCallReceipt(receipt)) {
    throw createDockerLifecycleError('Invalid Docker provider actual-call evidence');
  }
  return `provider-actual-call:sha256:${sha256(JSON.stringify(receipt))}`;
}

export function writeTaskProviderTerminalUsageReceiptAtomic(
  ref: TaskResultSettlementRefV1,
  source: TaskProviderTerminalUsageSourceV1,
): TaskProviderTerminalUsageReceiptV1 {
  assertPendingAttemptAndClaim(ref);
  const contract = readTaskResultSettlementExecutionContract(ref);
  if (!contract
    || source.version !== 2
    || source.projectId !== ref.projectRootSha256
    || source.taskId !== ref.taskId
    || source.attemptId !== ref.attemptId
    || source.budgetFingerprint !== contract.budgetFingerprint
    || source.backend !== contract.executionBackend
    || source.terminal !== true
    || !hasFiniteUsageCounters(source.decision.counters)
    || !Number.isFinite(Date.parse(source.updatedAt))) {
    throw createDockerLifecycleError('Docker terminal usage source differs from the exact execution contract');
  }
  const receipt: TaskProviderTerminalUsageReceiptV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'provider-terminal-usage',
    observedAt: source.updatedAt,
    budgetFingerprint: source.budgetFingerprint,
    executionContractEvidenceRef: contract.evidenceRef,
    sourceUsageSha256: sha256(JSON.stringify(source)),
    decisionState: source.decision.state,
    counters: { ...source.decision.counters },
  };
  if (!parseTaskProviderTerminalUsageReceipt(receipt)) {
    throw createDockerLifecycleError('Invalid Docker provider terminal usage receipt');
  }
  const path = taskProviderTerminalUsageReceiptPath(ref);
  publishJsonFirstWriter(
    path,
    receipt,
    existing => JSON.stringify(parseTaskProviderTerminalUsageReceipt(existing))
      === JSON.stringify(receipt),
  );
  chmodSync(path, 0o600);
  const persisted = readTaskProviderTerminalUsageReceipt(ref);
  if (!persisted || JSON.stringify(persisted) !== JSON.stringify(receipt)) {
    throw createDockerLifecycleError('Docker provider terminal usage receipt could not be verified');
  }
  return persisted;
}

export function readTaskProviderTerminalUsageReceipt(
  ref: TaskResultSettlementRefV1,
): TaskProviderTerminalUsageReceiptV1 | null {
  const path = taskProviderTerminalUsageReceiptPath(ref);
  const receipt = parseTaskProviderTerminalUsageReceipt(readJson(path));
  if (!receipt || !sameRef(receipt, ref) || !hasPrivateFileMode(path)) return null;
  const contract = readTaskResultSettlementExecutionContract(ref);
  return contract
    && receipt.budgetFingerprint === contract.budgetFingerprint
    && receipt.executionContractEvidenceRef === contract.evidenceRef
    ? receipt
    : null;
}

export function taskProviderTerminalUsageEvidenceRef(
  receipt: TaskProviderTerminalUsageReceiptV1,
): string {
  if (!parseTaskProviderTerminalUsageReceipt(receipt)) {
    throw createDockerLifecycleError('Invalid Docker provider terminal usage evidence');
  }
  return `provider-terminal-usage:sha256:${sha256(JSON.stringify(receipt))}`;
}

// ─── Verification Isolation HOLD Receipt (488-011) ───────────────────
// Host-observed evidence that 488-010's verification isolation gate
// (core/verification-isolation-authority.ts's `decideVerificationIsolation`,
// core/verification-typescript-adapter.ts's `TypeScriptScopedVerificationAdapter`)
// held for this exact attempt — an admission/environment gap, never worker
// prose. Consumed by fix-repair-authority.ts's `decideFixRepairAuthority` as
// the strongest signal that a NO_GO must be parked rather than spending a
// FIX/retry budget slot. Mirrors the `TaskProviderTerminalBillingReceiptV1`
// shape exactly: immutable, first-writer, content-addressed, host-owned path
// outside the worker-mounted project.

export interface TaskVerificationIsolationHoldReceiptV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'verification-isolation-hold';
  observedAt: string;
  /** Reason codes from the isolation authority grant hold or the adapter-level hold/foreign-observation partition — never worker-authored. */
  reasonCodes: readonly string[];
  /** Host-observed authority evidence refs backing the hold. */
  authorityEvidenceRefs: readonly string[];
}

export function taskVerificationIsolationHoldReceiptPath(
  ref: TaskResultSettlementRefV1,
): string {
  return resolve(settlementAttemptDir(ref), 'verification-isolation-hold.json');
}

function parseTaskVerificationIsolationHoldReceipt(
  value: unknown,
): TaskVerificationIsolationHoldReceiptV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'verification-isolation-hold'
    || typeof record.observedAt !== 'string'
    || !Number.isFinite(Date.parse(record.observedAt))
    || !hasNonBlankEvidenceRefs(record.reasonCodes)
    || !hasNonBlankEvidenceRefs(record.authorityEvidenceRefs)
  ) return null;
  return record as unknown as TaskVerificationIsolationHoldReceiptV1;
}

export function writeTaskVerificationIsolationHoldReceiptAtomic(
  ref: TaskResultSettlementRefV1,
  input: {
    reasonCodes: readonly string[];
    authorityEvidenceRefs: readonly string[];
    observedAt?: string;
  },
): TaskVerificationIsolationHoldReceiptV1 {
  assertPendingAttemptAndClaim(ref);
  const receipt: TaskVerificationIsolationHoldReceiptV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'verification-isolation-hold',
    observedAt: input.observedAt ?? new Date().toISOString(),
    reasonCodes: [...input.reasonCodes],
    authorityEvidenceRefs: [...input.authorityEvidenceRefs],
  };
  if (!parseTaskVerificationIsolationHoldReceipt(receipt)) {
    throw createExecutionAuthorityError('Invalid Docker verification isolation hold receipt');
  }
  const path = taskVerificationIsolationHoldReceiptPath(ref);
  publishJsonFirstWriter(
    path,
    receipt,
    (existing) => {
      const parsed = parseTaskVerificationIsolationHoldReceipt(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && JSON.stringify(parsed.reasonCodes) === JSON.stringify(receipt.reasonCodes)
        && JSON.stringify(parsed.authorityEvidenceRefs) === JSON.stringify(receipt.authorityEvidenceRefs);
    },
  );
  chmodSync(path, 0o600);
  const persisted = readTaskVerificationIsolationHoldReceipt(ref);
  if (!persisted || JSON.stringify(persisted) !== JSON.stringify(receipt)) {
    throw createExecutionAuthorityError(
      'Docker verification isolation hold receipt could not be verified after publication',
    );
  }
  return persisted;
}

export function readTaskVerificationIsolationHoldReceipt(
  ref: TaskResultSettlementRefV1,
): TaskVerificationIsolationHoldReceiptV1 | null {
  const path = taskVerificationIsolationHoldReceiptPath(ref);
  const receipt = parseTaskVerificationIsolationHoldReceipt(readJson(path));
  if (!receipt || !sameRef(receipt, ref) || !hasPrivateFileMode(path)) return null;
  const attempt = parseTaskResultSettlementAttempt(
    readJson(taskResultSettlementAttemptPath(ref)),
  );
  return attempt && sameRef(attempt, ref) ? receipt : null;
}

export function taskVerificationIsolationHoldEvidenceRef(
  receipt: TaskVerificationIsolationHoldReceiptV1,
): string {
  if (!parseTaskVerificationIsolationHoldReceipt(receipt)) {
    throw createExecutionAuthorityError('Invalid Docker verification isolation hold evidence');
  }
  return `verification-isolation-hold:sha256:${sha256(JSON.stringify(receipt))}`;
}

/** Host-global, attempt-bound receipt; Docker workers never mount this state root. */
export function writeTaskResultSettlementAtomic(settlement: TaskResultSettlementV1): void {
  if (existsSync(taskResultSettlementLandedRetirementPath(settlement))) {
    throw createExecutionAuthorityError('Cannot write a terminal Docker result after LANDED attempt retirement');
  }
  const existingSettlement = readTaskResultSettlement(settlement);
  if (
    existingSettlement
    && existingSettlement.exitCode === settlement.exitCode
    && existingSettlement.resultSha256 === settlement.resultSha256
  ) return;
  let attempt: TaskResultSettlementAttemptV1 | null = null;
  try {
    attempt = parseTaskResultSettlementAttempt(
      JSON.parse(readFileSync(taskResultSettlementAttemptPath(settlement), 'utf-8')),
    );
  } catch { /* handled by the fail-closed branch below */ }
  if (!attempt || !sameRef(attempt, settlement)) {
    throw createExecutionAuthorityError('Docker result settlement has no matching durable pending attempt');
  }
  if (existsSync(taskResultSettlementClaimsDir(settlement))) {
    const active = readTaskResultSettlementActiveClaim(settlement);
    if (!active || !sameRef(active, settlement)) {
      throw createExecutionAuthorityError('Docker result settlement attempt does not own the active lifecycle claim');
    }
  }
  publishJsonFirstWriter(
    taskResultSettlementPath(settlement),
    settlement,
    (existing) => {
      const parsed = parseTaskResultSettlement(existing);
      return parsed !== null
        && sameRef(parsed, settlement)
        && parsed.exitCode === settlement.exitCode
        && parsed.resultSha256 === settlement.resultSha256;
    },
  );
}

export function readTaskResultSettlement(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementV1 | null {
  const path = taskResultSettlementPath(ref);
  if (!existsSync(path)) return null;
  try {
    const settlement = parseTaskResultSettlement(JSON.parse(readFileSync(path, 'utf-8')));
    return settlement && sameRef(settlement, ref) ? settlement : null;
  } catch {
    return null;
  }
}

/** Exact immutable settlement receipt digest for consumers that bind a preimage. */
export function taskResultSettlementDigest(settlement: TaskResultSettlementV1): string {
  const parsed = parseTaskResultSettlement(settlement);
  if (!parsed) throw createExecutionAuthorityError('Invalid Docker result settlement receipt digest input');
  return sha256(JSON.stringify(parsed));
}

/** Exact immutable closure receipt digest for consumers that bind a preimage. */
export function taskResultSettlementClosureDigest(closure: TaskResultSettlementClosureV1): string {
  const parsed = parseTaskResultSettlementClosure(closure);
  if (!parsed) throw createExecutionAuthorityError('Invalid Docker result settlement closure digest input');
  return sha256(JSON.stringify(parsed));
}

/**
 * Read a terminal product result only after the host-owned lifecycle closure
 * proves that container disposition and lock release completed for the exact
 * immutable receipt. Recovery code intentionally uses the raw receipt reader;
 * user-facing/result consumers must use this closed authority.
 */
export function readClosedTaskResultSettlement(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementV1 | null {
  const settlementPath = taskResultSettlementPath(ref);
  const closurePath = taskResultSettlementClosurePath(ref);
  const settlementExists = existsSync(settlementPath);
  const closureExists = existsSync(closurePath);

  if (!settlementExists) {
    if (closureExists) {
      throw createExecutionAuthorityError(`Corrupt Docker result settlement closure without receipt: ${closurePath}`);
    }
    return null;
  }
  const settlement = readTaskResultSettlement(ref);
  if (!settlement) {
    throw createExecutionAuthorityError(`Corrupt host-owned Docker result settlement: ${settlementPath}`);
  }
  if (!closureExists) return null;
  if (!readTaskResultSettlementClosure(ref)) {
    throw createExecutionAuthorityError(`Corrupt Docker result settlement closure: ${closurePath}`);
  }
  return settlement;
}

export function writeTaskResultSettlementClosureAtomic(
  ref: TaskResultSettlementRefV1,
  input: {
    containerDisposition: TaskResultSettlementClosureV1['containerDisposition'];
    locksReleased: true;
    evidenceRef?: string;
    closedAt?: string;
  },
): TaskResultSettlementClosureV1 {
  if (existsSync(taskResultSettlementLandedRetirementPath(ref))) {
    throw createExecutionAuthorityError('Cannot terminally close a LANDED-retired Docker result settlement claim');
  }
  const existingClosure = readTaskResultSettlementClosure(ref);
  if (existingClosure) {
    if (
      existingClosure.containerDisposition === input.containerDisposition
      && existingClosure.locksReleased === input.locksReleased
      && existingClosure.evidenceRef === input.evidenceRef
    ) return existingClosure;
    throw createExecutionAuthorityError(`Conflicting immutable Docker result settlement already exists: ${taskResultSettlementClosurePath(ref)}`);
  }
  const active = readTaskResultSettlementActiveClaim(ref);
  if (!active || !sameRef(active, ref)) {
    throw createExecutionAuthorityError('Cannot close a foreign or inactive Docker result settlement claim');
  }
  const settlement = readTaskResultSettlement(ref);
  if (!settlement) {
    throw createExecutionAuthorityError('Cannot close an unsettled Docker result settlement claim');
  }
  const closure: TaskResultSettlementClosureV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'closed',
    closedAt: input.closedAt ?? new Date().toISOString(),
    settlementSha256: sha256(JSON.stringify(settlement)),
    containerDisposition: input.containerDisposition,
    locksReleased: input.locksReleased,
    ...(input.evidenceRef ? { evidenceRef: input.evidenceRef } : {}),
  };
  publishJsonFirstWriter(
    taskResultSettlementClosurePath(ref),
    closure,
    (existing) => {
      const parsed = parseTaskResultSettlementClosure(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.settlementSha256 === closure.settlementSha256
        && parsed.containerDisposition === closure.containerDisposition
        && parsed.locksReleased === true;
    },
  );
  return closure;
}

export function writeTaskResultSettlementLandedRetirementAtomic(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementLandedRetirementV1 {
  if (existsSync(taskResultSettlementPath(ref)) || existsSync(taskResultSettlementClosurePath(ref))) {
    throw createExecutionAuthorityError('Cannot retire a terminal Docker result settlement as LANDED');
  }
  const active = readTaskResultSettlementActiveClaim(ref);
  if (!active || !sameRef(active, ref)) {
    throw createExecutionAuthorityError('Cannot retire a foreign or inactive Docker result settlement claim');
  }
  const landingRef = executionLandingRef(ref);
  const checkpoint = readExecutionLandingCheckpointByRef(landingRef);
  const executionRetirement = readExecutionAttemptRetirementByRef(landingRef);
  if (
    !checkpoint
    || !executionRetirement
    || executionRetirement.checkpointSha256 !== checkpoint.checkpointSha256
  ) {
    throw createExecutionAuthorityError('Docker LANDED retirement requires matching checkpoint and resource-retirement authority');
  }
  const retirement: TaskResultSettlementLandedRetirementV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION_V2,
    state: 'retired-landed',
    retiredAt: executionRetirement.retiredAt,
    landingCheckpointSha256: checkpoint.checkpointSha256,
    executionRetirementSha256: executionAttemptRetirementDigest(executionRetirement),
  };
  publishJsonFirstWriter(
    taskResultSettlementLandedRetirementPath(ref),
    retirement,
    existing => {
      const parsed = parseTaskResultSettlementLandedRetirement(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.landingCheckpointSha256 === retirement.landingCheckpointSha256
        && parsed.executionRetirementSha256 === retirement.executionRetirementSha256;
    },
  );
  return readTaskResultSettlementLandedRetirement(ref) ?? retirement;
}

export interface PendingTaskResultSettlementAttemptV1 {
  attempt: TaskResultSettlementAttemptV1;
  claim: TaskResultSettlementActiveClaim | null;
  prepared: TaskResultSettlementPreparedV1 | null;
  dispatch: TaskResultSettlementDispatchV1 | null;
  settlement: TaskResultSettlementV1 | null;
}

export interface TaskResultSettlementAuthorityInspection {
  readonly state:
    | 'absent'
    | 'pending'
    | 'prepared'
    | 'dispatched'
    | 'settled'
    | 'closed'
    | 'retired-landed'
    | 'corrupt';
  readonly evidenceRef: string;
  readonly ref?: TaskResultSettlementRefV1;
}

/**
 * Read-only, bounded backend authority probe for task reconciliation.
 *
 * `absent` means no host-owned Docker attempt was ever minted for the exact
 * canonical project/task identity. Every other state is conservatively
 * execution evidence; callers must not infer process absence from it.
 */
export function inspectTaskResultSettlementAuthority(
  projectRoot: string,
  taskId: string,
): TaskResultSettlementAuthorityInspection {
  const projectRootSha256 = sha256(canonicalProjectRoot(projectRoot));
  const evidence = (
    state: TaskResultSettlementAuthorityInspection['state'],
    ref?: TaskResultSettlementRefV1,
  ): TaskResultSettlementAuthorityInspection => {
    const content = {
      state,
      projectRootSha256,
      taskIdSha256: sha256(taskId),
      attemptId: ref?.attemptId ?? null,
    };
    return Object.freeze({
      state,
      evidenceRef: `task-result-settlement:${state}:sha256:${sha256(JSON.stringify(content))}`,
      ...(ref ? { ref: Object.freeze({ ...ref }) } : {}),
    });
  };

  try {
    const probeRef = createTaskResultSettlementRef(projectRoot, taskId);
    const taskDir = settlementTaskDir(probeRef);
    let attemptNames: string[] = [];
    if (existsSync(taskDir)) {
      attemptNames = readdirSync(taskDir).filter(name => name !== 'claims');
      if (attemptNames.length > 1_024) return evidence('corrupt');
    }
    const pending = attemptNames.flatMap(attemptName => {
      const attemptPath = resolve(taskDir, attemptName, 'attempt.json');
      const looksLikeAttempt = /^[0-9a-f-]{36}$/iu.test(attemptName);
      const attempt = parseTaskResultSettlementAttempt(readJson(attemptPath));
      if (looksLikeAttempt && !attempt) throw createExecutionAuthorityError('Corrupt task settlement attempt');
      if (
        !attempt
        || attempt.projectRootSha256 !== projectRootSha256
        || attempt.taskId !== taskId
        || attempt.attemptId !== attemptName
      ) return [];
      if (
        existsSync(taskResultSettlementClosurePath(attempt))
        || existsSync(taskResultSettlementLandedRetirementPath(attempt))
      ) return [];
      return [attempt];
    });
    if (pending.length > 1) return evidence('corrupt');
    const ref = pending[0]
      ?? readLatestTaskResultSettlementRef(projectRoot, taskId);
    if (!ref) return evidence('absent');
    if (readTaskResultSettlementClosure(ref)) return evidence('closed', ref);
    if (readTaskResultSettlementLandedRetirement(ref)) {
      return evidence('retired-landed', ref);
    }
    if (readTaskResultSettlement(ref)) return evidence('settled', ref);
    if (readTaskResultSettlementDispatch(ref)) return evidence('dispatched', ref);
    if (readTaskResultSettlementPrepared(ref)) return evidence('prepared', ref);
    const attempt = parseTaskResultSettlementAttempt(
      readJson(taskResultSettlementAttemptPath(ref)),
    );
    return attempt && sameRef(attempt, ref)
      ? evidence('pending', ref)
      : evidence('corrupt', ref);
  } catch {
    return evidence('corrupt');
  }
}

/**
 * Enumerate unsettled attempts for exactly one canonical project. Directory names
 * are never trusted; every record is parsed and matched back to its embedded ref.
 */
export function listPendingTaskResultSettlementAttempts(
  projectRoot: string,
): PendingTaskResultSettlementAttemptV1[] {
  const projectRootSha256 = sha256(canonicalProjectRoot(projectRoot));
  const projectDir = settlementProjectDir(projectRootSha256);
  if (!existsSync(projectDir)) return [];

  const pending: PendingTaskResultSettlementAttemptV1[] = [];
  for (const taskDirName of readdirSync(projectDir)) {
    const taskDir = resolve(projectDir, taskDirName);
    let attemptNames: string[];
    try { attemptNames = readdirSync(taskDir); } catch { continue; }
    for (const attemptName of attemptNames) {
      if (attemptName === 'claims') continue;
      const attemptPath = resolve(taskDir, attemptName, 'attempt.json');
      const attempt = parseTaskResultSettlementAttempt(readJson(attemptPath));
      const looksLikeAttempt = /^[0-9a-f-]{36}$/i.test(attemptName);
      if (looksLikeAttempt && !attempt) {
        throw createExecutionAuthorityError(`Corrupt Docker result settlement attempt: ${attemptPath}`);
      }
      if (
        !attempt
        || attempt.projectRootSha256 !== projectRootSha256
        || sha256(attempt.taskId) !== taskDirName
        || attempt.attemptId !== attemptName
      ) continue;
      if (existsSync(taskResultSettlementClosurePath(attempt))) {
        const closure = readTaskResultSettlementClosure(attempt);
        if (!closure) throw createExecutionAuthorityError(`Corrupt Docker result settlement closure: ${taskResultSettlementClosurePath(attempt)}`);
        continue;
      }
      if (existsSync(taskResultSettlementLandedRetirementPath(attempt))) {
        const retirement = readTaskResultSettlementLandedRetirement(attempt);
        if (!retirement) {
          throw createExecutionAuthorityError(
            `Corrupt Docker result settlement LANDED retirement: ${taskResultSettlementLandedRetirementPath(attempt)}`,
          );
        }
        continue;
      }
      const claim = readTaskResultSettlementActiveClaim(attempt);
      pending.push({
        attempt,
        claim: claim && sameRef(claim, attempt) ? claim : null,
        prepared: readTaskResultSettlementPrepared(attempt),
        dispatch: readTaskResultSettlementDispatch(attempt),
        settlement: readTaskResultSettlement(attempt),
      });
    }
  }
  return pending.sort((a, b) => (
    a.attempt.createdAt.localeCompare(b.attempt.createdAt)
      || a.attempt.attemptId.localeCompare(b.attempt.attemptId)
  ));
}
