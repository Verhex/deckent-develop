import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, win32 } from 'node:path';
import { types as nodeUtilTypes } from 'node:util';

import { canonicalJson } from './audit-writer.js';
import type { ExecutionBudgetRole, ExecutionLandingPolicyConfig } from './config-types.js';
import type { ExecutionAdmissionMode } from './execution-admission.js';
import { assertExecutionLandingPolicyConfig } from './execution-budget-policy.js';
import { createExecutionAuthorityError } from './errors.js';
import type { LiveUsageCounters } from './live-execution-budget.js';
import { deckentPath } from './state-paths.js';
import { TASK_KINDS, type ExecutionBudget, type TaskKind } from './work-model.js';

export const EXECUTION_LANDING_CHECKPOINT_SCHEMA_VERSION = 1 as const;
export const EXECUTION_ATTEMPT_RETIREMENT_SCHEMA_VERSION = 1 as const;
export const EXECUTION_CONTINUATION_CLAIM_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LANDING_CHECKPOINT_SCHEMA_VERSION_V2 = 2 as const;

const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set<ExecutionBudgetRole>(['brain', 'worker', 'auditor']);
const MODES = new Set<ExecutionAdmissionMode>(['attended', 'unattended']);
const VALID_TASK_KINDS = new Set<TaskKind>(TASK_KINDS);
const BUDGET_FIELDS = new Set<keyof ExecutionBudget>([
  'maxUsd',
  'maxTokens',
  'maxTurns',
  'maxInputTokens',
  'maxOutputTokens',
  'maxCacheReadTokens',
  'maxCacheCreationTokens',
  'maxContextTokens',
]);
const COUNTER_FIELDS = new Set<keyof LiveUsageCounters>([
  'turns',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
  'totalTokens',
  'maxContextTokens',
]);

export interface ExecutionLandingCheckpointRefV1 {
  schemaVersion: typeof EXECUTION_LANDING_CHECKPOINT_SCHEMA_VERSION;
  projectId: string;
  taskId: string;
  attemptId: string;
}

export interface ExecutionLandingIdentityV1 {
  configuredProvider: string | null;
  configuredModel: string | null;
  requestedProvider: string;
  requestedModel: string;
  resolvedProvider: string;
  resolvedModel: string;
  calledProvider: string;
  calledModel: string;
  backend: string;
  auth: string;
  fallbackReason: string | null;
}

export interface ExecutionLandingProviderSequenceV1 {
  firstSequence: number;
  lastSequence: number;
  eventCount: number;
  eventDigest: string;
}

export interface ExecutionLandingSemanticStateV1 {
  summary: string;
  completedWork: string[];
  remainingWork: string[];
  nextAction: string;
  unresolvedRisks: string[];
}

export interface ExecutionLandingScopeV1 {
  filesRead: string[];
  filesWrite: string[];
}

export interface ExecutionLandingCheckpointV1 extends ExecutionLandingCheckpointRefV1 {
  state: 'landed';
  tenantId: string;
  originalRequestDigest: string;
  taskDigest: string;
  role: ExecutionBudgetRole;
  kind: TaskKind;
  admissionMode: ExecutionAdmissionMode;
  approvalEvidenceRef: string | null;
  identity: ExecutionLandingIdentityV1;
  policyDigest: string;
  landingPolicy: ExecutionLandingPolicyConfig;
  hardBudgetDigest: string;
  hardBudget: ExecutionBudget;
  cumulativeUsage: LiveUsageCounters;
  cumulativeUsd?: number;
  remainingBudget: ExecutionBudget;
  parentAttemptId: string | null;
  parentFence: string | null;
  parentCheckpointSha256: string | null;
  attemptFence: string;
  providerSequence: ExecutionLandingProviderSequenceV1;
  semanticState: ExecutionLandingSemanticStateV1;
  scope: ExecutionLandingScopeV1;
  diskDiffRefs: string[];
  evidenceRefs: string[];
  acceptanceCriteria: string;
  acceptanceDigest: string;
  landingRequestedAt: string;
  landedAt: string;
}

export interface ExecutionLandingCheckpointEnvelopeV1 {
  schemaVersion: typeof EXECUTION_LANDING_CHECKPOINT_SCHEMA_VERSION;
  checkpointSha256: string;
  checkpoint: ExecutionLandingCheckpointV1;
}

export type ExecutionAttemptRuntimeDisposition =
  | 'cooperatively-exited'
  | 'checkpointed-process-exited'
  | 'stopped-removed';

export interface ExecutionAttemptRetirementV1 extends ExecutionLandingCheckpointRefV1 {
  retirementVersion: typeof EXECUTION_ATTEMPT_RETIREMENT_SCHEMA_VERSION;
  state: 'retired';
  disposition: 'landed';
  checkpointSha256: string;
  runtimeDisposition: ExecutionAttemptRuntimeDisposition;
  resourcesReleased: true;
  evidenceRefs: string[];
  retiredAt: string;
}

export interface ExecutionContinuationClaimV1 extends ExecutionLandingCheckpointRefV1 {
  claimVersion: typeof EXECUTION_CONTINUATION_CLAIM_SCHEMA_VERSION;
  state: 'continuation-claimed';
  checkpointSha256: string;
  parentAttemptId: string;
  continuationAttemptId: string;
  continuationFence: string;
  claimedAt: string;
}

export interface RetiredExecutionLandingV1 {
  checkpoint: ExecutionLandingCheckpointEnvelopeV1;
  retirement: ExecutionAttemptRetirementV1;
  continuationClaim: ExecutionContinuationClaimV1 | null;
}

export interface CreateExecutionLandingCheckpointInput {
  taskId: string;
  attemptId: string;
  tenantId: string;
  originalRequestDigest: string;
  taskDigest: string;
  role: ExecutionBudgetRole;
  kind: TaskKind;
  admissionMode: ExecutionAdmissionMode;
  approvalEvidenceRef?: string | null;
  identity: ExecutionLandingIdentityV1;
  policyDigest: string;
  landingPolicy: ExecutionLandingPolicyConfig;
  hardBudget: ExecutionBudget;
  cumulativeUsage: LiveUsageCounters;
  cumulativeUsd?: number;
  parentAttemptId?: string | null;
  parentFence?: string | null;
  parentCheckpointSha256?: string | null;
  attemptFence: string;
  providerSequence: ExecutionLandingProviderSequenceV1;
  semanticState: ExecutionLandingSemanticStateV1;
  scope: ExecutionLandingScopeV1;
  diskDiffRefs: string[];
  evidenceRefs: string[];
  acceptanceCriteria: string;
  landingRequestedAt: string;
  landedAt?: string;
}

export type ExecutionLandingDigestV2 = `sha256:${string}`;
export type ExecutionLandingEvidenceRefV2 = `${string}:sha256:${string}`;

export interface ExecutionLandingPrivateAttemptIdentityV2 {
  readonly schemaVersion: 2;
  readonly backend: 'docker';
  readonly projectRootSha256: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
}

export interface ExecutionLandingResultSourceBindingV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-result-source-binding';
  readonly artifactClass: 'worker-result';
  readonly artifactKey: string;
  readonly identity: ExecutionLandingPrivateAttemptIdentityV2;
  readonly admissionReceiptDigest: ExecutionLandingDigestV2;
  readonly policyDigest: ExecutionLandingDigestV2;
  readonly artifactReceiptDigest: ExecutionLandingDigestV2;
  readonly contentDigest: ExecutionLandingDigestV2;
  readonly byteLength: number;
  readonly capturedAt: string;
  readonly bindingDigest: ExecutionLandingDigestV2;
}

export interface ExecutionLandingVerifiedArtifactBindingV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-verified-artifact-binding';
  readonly artifactClass: 'worker-landing-proposal';
  readonly artifactKey: string;
  readonly identity: ExecutionLandingPrivateAttemptIdentityV2;
  readonly admissionReceiptDigest: ExecutionLandingDigestV2;
  readonly policyDigest: ExecutionLandingDigestV2;
  readonly artifactReceiptDigest: ExecutionLandingDigestV2;
  readonly contentDigest: ExecutionLandingDigestV2;
  readonly byteLength: number;
  readonly capturedAt: string;
  readonly verifiedAt: string;
  readonly verificationBindingDigest: ExecutionLandingDigestV2;
}

export interface ExecutionLandingPreparationRefV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-preparation-ref';
  readonly dispatchRequestId: string;
  readonly dispatchRequestMaterialDigest: ExecutionLandingDigestV2;
  readonly privateIdentity: ExecutionLandingPrivateAttemptIdentityV2;
  readonly admissionReceiptDigest: ExecutionLandingDigestV2;
  readonly admissionRefDigest: ExecutionLandingDigestV2;
  readonly admittedAt: string;
  readonly policyDigest: ExecutionLandingDigestV2;
  readonly taskSnapshotDigest: ExecutionLandingDigestV2;
  readonly providerInvocationDigest: ExecutionLandingDigestV2;
  readonly preparationRefDigest: ExecutionLandingDigestV2;
}

export interface ExecutionLandingCustodyRefV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-custody-ref';
  readonly dispatchState: 'RELEASED';
  readonly preparationRef: ExecutionLandingPreparationRefV2;
  readonly providerExecutionAttemptId: string;
  readonly providerExecutionAttemptIdentityDigest: ExecutionLandingDigestV2;
  readonly dispatchAuthorityReceiptDigest: ExecutionLandingDigestV2;
  readonly releaseReceiptRefDigest: ExecutionLandingDigestV2;
  readonly releaseEvidenceDigest: ExecutionLandingDigestV2;
  readonly releasedAt: string;
  readonly providerStartReceiptRefDigest: ExecutionLandingDigestV2;
  readonly providerStartEvidenceDigest: ExecutionLandingDigestV2;
  readonly providerStartAcceptedAt: string;
  readonly projectionFence: ExecutionLandingDigestV2;
  readonly resultSource: ExecutionLandingResultSourceBindingV2;
  readonly landingArtifact: ExecutionLandingVerifiedArtifactBindingV2;
  readonly custodyRefDigest: ExecutionLandingDigestV2;
}

export interface ExecutionContinuationDispatchRefV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-continuation-dispatch-ref';
  readonly dispatchState: 'RELEASED';
  readonly preparationRef: ExecutionLandingPreparationRefV2;
  readonly providerExecutionAttemptId: string;
  readonly providerExecutionAttemptIdentityDigest: ExecutionLandingDigestV2;
  readonly dispatchAuthorityReceiptDigest: ExecutionLandingDigestV2;
  readonly releaseReceiptRefDigest: ExecutionLandingDigestV2;
  readonly releaseEvidenceDigest: ExecutionLandingDigestV2;
  readonly releasedAt: string;
  readonly providerStartReceiptRefDigest: ExecutionLandingDigestV2;
  readonly providerStartEvidenceDigest: ExecutionLandingDigestV2;
  readonly providerStartAcceptedAt: string;
  readonly projectionFence: ExecutionLandingDigestV2;
  readonly dispatchRefDigest: ExecutionLandingDigestV2;
}

export interface ExecutionLandingCheckpointRefV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-checkpoint-ref';
  readonly projectRootSha256: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly privateAttemptId: string;
  readonly generation: number;
  readonly providerExecutionAttemptId: string;
  readonly custodyRefDigest: ExecutionLandingDigestV2;
}

export interface ExecutionLandingOperationalPayloadV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-operational-payload';
  readonly taskId: string;
  readonly providerExecutionAttemptId: string;
  readonly tenantId: string;
  readonly originalRequestDigest: string;
  readonly taskDigest: string;
  readonly role: ExecutionBudgetRole;
  readonly taskKind: TaskKind;
  readonly admissionMode: ExecutionAdmissionMode;
  readonly approvalEvidenceRef: string | null;
  readonly identity: ExecutionLandingIdentityV1;
  readonly policyDigest: string;
  readonly landingPolicy: ExecutionLandingPolicyConfig;
  readonly hardBudgetDigest: string;
  readonly hardBudget: ExecutionBudget;
  readonly cumulativeUsage: LiveUsageCounters;
  readonly cumulativeUsd: number | null;
  readonly remainingBudget: ExecutionBudget;
  readonly parentAttemptId: string | null;
  readonly parentFence: string | null;
  readonly parentCheckpointSha256: string | null;
  readonly attemptFence: string;
  readonly providerSequence: ExecutionLandingProviderSequenceV1;
  readonly semanticState: ExecutionLandingSemanticStateV1;
  readonly scope: ExecutionLandingScopeV1;
  readonly diskEvidenceDigest: ExecutionLandingDigestV2;
  readonly evidenceRefs: readonly ExecutionLandingEvidenceRefV2[];
  readonly acceptanceCriteria: string;
  readonly acceptanceDigest: string;
  readonly landingRequestedAt: string;
  readonly landedAt: string;
  readonly operationalDigest: ExecutionLandingDigestV2;
}

export interface ExecutionLandingCheckpointV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-checkpoint';
  readonly state: 'LANDED';
  readonly ref: ExecutionLandingCheckpointRefV2;
  readonly custodyRef: ExecutionLandingCustodyRefV2;
  readonly operationalPayload: ExecutionLandingOperationalPayloadV2;
  readonly contextDigest: ExecutionLandingDigestV2;
  readonly diskEvidenceDigest: ExecutionLandingDigestV2;
  readonly landedAt: string;
}

export interface ExecutionLandingCheckpointEnvelopeV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-checkpoint-envelope';
  readonly checkpointDigest: ExecutionLandingDigestV2;
  readonly checkpoint: ExecutionLandingCheckpointV2;
}

export interface ExecutionAttemptRetirementV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-attempt-retirement';
  readonly state: 'RETIRED';
  readonly ref: ExecutionLandingCheckpointRefV2;
  readonly checkpointDigest: ExecutionLandingDigestV2;
  readonly runtimeDisposition: ExecutionAttemptRuntimeDisposition;
  readonly resourcesReleased: true;
  readonly evidenceDigests: readonly ExecutionLandingDigestV2[];
  readonly retiredAt: string;
  readonly receiptDigest: ExecutionLandingDigestV2;
}

export interface ExecutionContinuationClaimV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-continuation-claim';
  readonly state: 'CONTINUATION_CLAIMED';
  readonly predecessorRef: ExecutionLandingCheckpointRefV2;
  readonly checkpointDigest: ExecutionLandingDigestV2;
  readonly retirementReceiptDigest: ExecutionLandingDigestV2;
  readonly continuationDispatchRef: ExecutionContinuationDispatchRefV2;
  readonly claimedAt: string;
  readonly receiptDigest: ExecutionLandingDigestV2;
}

export type CreateExecutionLandingCustodyRefV2Input = Omit<
  ExecutionLandingCustodyRefV2,
  'schemaVersion' | 'kind' | 'custodyRefDigest'
>;

export type CreateExecutionLandingPreparationRefV2Input = Omit<
  ExecutionLandingPreparationRefV2,
  'schemaVersion' | 'kind' | 'preparationRefDigest'
>;

export type CreateExecutionLandingResultSourceBindingV2Input = Omit<
  ExecutionLandingResultSourceBindingV2,
  'schemaVersion' | 'kind' | 'bindingDigest'
>;

export type CreateExecutionLandingVerifiedArtifactBindingV2Input = Omit<
  ExecutionLandingVerifiedArtifactBindingV2,
  'schemaVersion' | 'kind' | 'verificationBindingDigest'
>;

export type CreateExecutionContinuationDispatchRefV2Input = Omit<
  ExecutionContinuationDispatchRefV2,
  'schemaVersion' | 'kind' | 'dispatchRefDigest'
>;

export type CreateExecutionLandingOperationalPayloadV2Input = Omit<
  CreateExecutionLandingCheckpointInput,
  'diskDiffRefs'
> & {
  readonly diskEvidenceDigest: ExecutionLandingDigestV2;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalProjectRoot(projectRoot: string): string {
  try { return realpathSync.native(projectRoot); } catch { return resolve(projectRoot); }
}

function projectId(projectRoot: string): string {
  return sha256(canonicalProjectRoot(projectRoot));
}

function taskDir(ref: ExecutionLandingCheckpointRefV1): string {
  return deckentPath(
    undefined,
    'runtime',
    'execution-landings',
    ref.projectId,
    sha256(ref.taskId),
  );
}

function attemptDir(ref: ExecutionLandingCheckpointRefV1): string {
  assertRefShape(ref as unknown as Record<string, unknown>);
  return resolve(taskDir(ref), 'attempts', ref.attemptId);
}

export function executionLandingCheckpointPath(ref: ExecutionLandingCheckpointRefV1): string {
  return resolve(attemptDir(ref), 'checkpoint.json');
}

export function executionAttemptRetirementPath(ref: ExecutionLandingCheckpointRefV1): string {
  return resolve(attemptDir(ref), 'retirement.json');
}

export function executionContinuationClaimPath(
  ref: ExecutionLandingCheckpointRefV1,
  checkpointSha256: string,
): string {
  assertDigest(checkpointSha256, 'checkpointSha256');
  return resolve(taskDir(ref), 'continuations', `${checkpointSha256}.json`);
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

function assertHostAuthorityOutsideProject(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV1,
): void {
  const root = canonicalProjectRoot(projectRoot);
  const authority = canonicalPathWithMissingLeaf(attemptDir(ref));
  const rel = relative(root, authority);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw createExecutionAuthorityError(`Execution landing authority must be outside the worker-mounted project root: ${authority}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every(key => Object.hasOwn(record, key))
    && Object.keys(record).every(key => allowed.has(key));
}

function assertDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw createExecutionAuthorityError(`Execution landing ${field} must be a lowercase SHA-256 digest`);
  }
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createExecutionAuthorityError(`Execution landing ${field} must be a non-empty string`);
  }
}

function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw createExecutionAuthorityError(`Execution landing ${field} must be a UUID`);
  }
}

function assertIsoTime(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw createExecutionAuthorityError(`Execution landing ${field} must be an ISO timestamp`);
  }
}

function assertRefShape(record: Record<string, unknown>): void {
  if (
    record.schemaVersion !== EXECUTION_LANDING_CHECKPOINT_SCHEMA_VERSION
    || typeof record.projectId !== 'string'
    || !SHA256.test(record.projectId)
    || typeof record.taskId !== 'string'
    || record.taskId.length === 0
    || typeof record.attemptId !== 'string'
    || !UUID.test(record.attemptId)
  ) {
    throw createExecutionAuthorityError('Invalid execution landing checkpoint reference');
  }
}

function sameRef(
  left: ExecutionLandingCheckpointRefV1,
  right: ExecutionLandingCheckpointRefV1,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId;
}

function copyRef(ref: ExecutionLandingCheckpointRefV1): ExecutionLandingCheckpointRefV1 {
  return {
    schemaVersion: ref.schemaVersion,
    projectId: ref.projectId,
    taskId: ref.taskId,
    attemptId: ref.attemptId,
  };
}

function assertStringRefs(value: unknown, field: string): asserts value is string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some(item => typeof item !== 'string' || item.trim().length === 0)
    || new Set(value).size !== value.length
  ) {
    throw createExecutionAuthorityError(`Execution landing ${field} must contain distinct non-empty references`);
  }
}

function validateBudget(value: unknown, field: string): ExecutionBudget {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw createExecutionAuthorityError(`Execution landing ${field} must contain at least one hard ceiling`);
  }
  const normalized: ExecutionBudget = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!BUDGET_FIELDS.has(key as keyof ExecutionBudget)) {
      throw createExecutionAuthorityError(`Unknown execution landing ${field} field "${key}"`);
    }
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) {
      throw createExecutionAuthorityError(`Execution landing ${field}.${key} must be a non-negative finite number`);
    }
    normalized[key as keyof ExecutionBudget] = candidate;
  }
  return normalized;
}

function validateCounters(value: unknown): LiveUsageCounters {
  if (!isRecord(value) || !hasExactKeys(value, [...COUNTER_FIELDS])) {
    throw createExecutionAuthorityError('Execution landing cumulativeUsage has invalid or unknown fields');
  }
  const counters = value as unknown as LiveUsageCounters;
  for (const field of COUNTER_FIELDS) {
    const candidate = counters[field];
    if (!Number.isInteger(candidate) || candidate < 0) {
      throw createExecutionAuthorityError(`Execution landing cumulativeUsage.${field} must be a non-negative integer`);
    }
  }
  if (
    counters.totalTokens
    !== counters.inputTokens + counters.outputTokens + counters.cacheReadTokens + counters.cacheCreationTokens
  ) {
    throw createExecutionAuthorityError('Execution landing cumulativeUsage.totalTokens does not match its token counters');
  }
  return { ...counters };
}

function validateIdentity(value: unknown): ExecutionLandingIdentityV1 {
  const keys = [
    'configuredProvider',
    'configuredModel',
    'requestedProvider',
    'requestedModel',
    'resolvedProvider',
    'resolvedModel',
    'calledProvider',
    'calledModel',
    'backend',
    'auth',
    'fallbackReason',
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw createExecutionAuthorityError('Execution landing identity has invalid or unknown fields');
  }
  for (const field of ['requestedProvider', 'requestedModel', 'resolvedProvider', 'resolvedModel', 'calledProvider', 'calledModel', 'backend', 'auth'] as const) {
    assertNonEmpty(value[field], `identity.${field}`);
  }
  for (const field of ['configuredProvider', 'configuredModel', 'fallbackReason'] as const) {
    if (value[field] !== null) assertNonEmpty(value[field], `identity.${field}`);
  }
  return value as unknown as ExecutionLandingIdentityV1;
}

function validateProviderSequence(value: unknown): ExecutionLandingProviderSequenceV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['firstSequence', 'lastSequence', 'eventCount', 'eventDigest'])
  ) {
    throw createExecutionAuthorityError('Execution landing providerSequence has invalid or unknown fields');
  }
  const first = value.firstSequence;
  const last = value.lastSequence;
  const count = value.eventCount;
  if (
    !Number.isInteger(first)
    || !Number.isInteger(last)
    || !Number.isInteger(count)
    || (first as number) < 1
    || (last as number) < (first as number)
    || (count as number) < 1
    || (count as number) > (last as number) - (first as number) + 1
  ) {
    throw createExecutionAuthorityError('Execution landing providerSequence is not a valid bounded sequence');
  }
  assertDigest(value.eventDigest, 'providerSequence.eventDigest');
  return value as unknown as ExecutionLandingProviderSequenceV1;
}

function validateSemanticState(value: unknown): ExecutionLandingSemanticStateV1 {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'summary',
      'completedWork',
      'remainingWork',
      'nextAction',
      'unresolvedRisks',
    ])
  ) {
    throw createExecutionAuthorityError('Execution landing semanticState has invalid or unknown fields');
  }
  const boundedText = (candidate: unknown, field: string, maxLength: number): string => {
    assertNonEmpty(candidate, `semanticState.${field}`);
    if (candidate.length > maxLength) {
      throw createExecutionAuthorityError(`Execution landing semanticState.${field} exceeds ${maxLength} characters`);
    }
    return candidate;
  };
  const boundedList = (candidate: unknown, field: string): string[] => {
    if (!Array.isArray(candidate) || candidate.length > 50) {
      throw createExecutionAuthorityError(`Execution landing semanticState.${field} must contain at most 50 items`);
    }
    return candidate.map((item, index) => boundedText(item, `${field}[${index}]`, 1_000));
  };
  return {
    summary: boundedText(value.summary, 'summary', 4_000),
    completedWork: boundedList(value.completedWork, 'completedWork'),
    remainingWork: boundedList(value.remainingWork, 'remainingWork'),
    nextAction: boundedText(value.nextAction, 'nextAction', 1_000),
    unresolvedRisks: boundedList(value.unresolvedRisks, 'unresolvedRisks'),
  };
}

function validateScope(value: unknown): ExecutionLandingScopeV1 {
  if (!isRecord(value) || !hasExactKeys(value, ['filesRead', 'filesWrite'])) {
    throw createExecutionAuthorityError('Execution landing scope has invalid or unknown fields');
  }
  const paths = (candidate: unknown, field: string): string[] => {
    if (!Array.isArray(candidate) || candidate.length > 100) {
      throw createExecutionAuthorityError(`Execution landing scope.${field} must contain at most 100 paths`);
    }
    const normalized = candidate.map((item, index) => {
      assertNonEmpty(item, `scope.${field}[${index}]`);
      if (
        item.length > 500
        || isAbsolute(item)
        || win32.isAbsolute(item)
        || item.split(/[\\/]+/u).includes('..')
      ) {
        throw createExecutionAuthorityError(`Execution landing scope.${field}[${index}] must be a bounded project-relative path`);
      }
      return item;
    });
    if (new Set(normalized).size !== normalized.length) {
      throw createExecutionAuthorityError(`Execution landing scope.${field} contains duplicate paths`);
    }
    return normalized;
  };
  const filesRead = paths(value.filesRead, 'filesRead');
  const filesWrite = paths(value.filesWrite, 'filesWrite');
  if (filesRead.length === 0 && filesWrite.length === 0) {
    throw createExecutionAuthorityError('Execution landing scope must contain at least one authorized path');
  }
  return { filesRead, filesWrite };
}

export function executionAcceptanceDigest(criteria: string): string {
  assertNonEmpty(criteria, 'acceptanceCriteria');
  const normalized = criteria.trim();
  if (normalized.length > 8_000) {
    throw createExecutionAuthorityError('Execution landing acceptanceCriteria exceeds 8000 characters');
  }
  return sha256(canonicalJson(normalized));
}

function executionBudgetDigest(budget: ExecutionBudget): string {
  return sha256(canonicalJson(budget));
}

export function deriveRemainingExecutionBudget(
  hardBudgetInput: ExecutionBudget,
  cumulativeUsageInput: LiveUsageCounters,
  cumulativeUsd?: number,
): ExecutionBudget {
  const hardBudget = validateBudget(hardBudgetInput, 'hardBudget');
  const usage = validateCounters(cumulativeUsageInput);
  if (
    cumulativeUsd !== undefined
    && (typeof cumulativeUsd !== 'number' || !Number.isFinite(cumulativeUsd) || cumulativeUsd < 0)
  ) {
    throw createExecutionAuthorityError('Execution landing cumulativeUsd must be a non-negative finite number');
  }
  if (hardBudget.maxUsd !== undefined && cumulativeUsd === undefined) {
    throw createExecutionAuthorityError('Execution landing maxUsd requires measured cumulativeUsd evidence');
  }
  const remaining: ExecutionBudget = {};
  const subtractive: Array<[keyof ExecutionBudget, number]> = [
    ['maxTokens', usage.totalTokens],
    ['maxTurns', usage.turns],
    ['maxInputTokens', usage.inputTokens],
    ['maxOutputTokens', usage.outputTokens],
    ['maxCacheReadTokens', usage.cacheReadTokens],
    ['maxCacheCreationTokens', usage.cacheCreationTokens],
  ];
  for (const [field, consumed] of subtractive) {
    const ceiling = hardBudget[field];
    if (ceiling !== undefined) remaining[field] = Math.max(0, ceiling - consumed);
  }
  if (hardBudget.maxContextTokens !== undefined) {
    remaining.maxContextTokens = hardBudget.maxContextTokens;
  }
  if (hardBudget.maxUsd !== undefined) {
    remaining.maxUsd = Math.max(0, hardBudget.maxUsd - cumulativeUsd!);
  }
  return remaining;
}

function checkpointDigest(checkpoint: ExecutionLandingCheckpointV1): string {
  return sha256(canonicalJson(checkpoint));
}

export function createExecutionLandingCheckpoint(
  projectRoot: string,
  input: CreateExecutionLandingCheckpointInput,
): ExecutionLandingCheckpointEnvelopeV1 {
  const allowedInput = [
    'taskId',
    'attemptId',
    'tenantId',
    'originalRequestDigest',
    'taskDigest',
    'role',
    'kind',
    'admissionMode',
    'approvalEvidenceRef',
    'identity',
    'policyDigest',
    'landingPolicy',
    'hardBudget',
    'cumulativeUsage',
    'cumulativeUsd',
    'parentAttemptId',
    'parentFence',
    'parentCheckpointSha256',
    'attemptFence',
    'providerSequence',
    'semanticState',
    'scope',
    'diskDiffRefs',
    'evidenceRefs',
    'acceptanceCriteria',
    'landingRequestedAt',
    'landedAt',
  ];
  if (!hasExactKeys(input as unknown as Record<string, unknown>, allowedInput.filter(key => ![
    'cumulativeUsd',
    'parentAttemptId',
    'parentFence',
    'parentCheckpointSha256',
    'approvalEvidenceRef',
    'landedAt',
  ].includes(key)), [
    'cumulativeUsd',
    'parentAttemptId',
    'parentFence',
    'parentCheckpointSha256',
    'approvalEvidenceRef',
    'landedAt',
  ])) {
    throw createExecutionAuthorityError('Execution landing checkpoint input has invalid or unknown fields');
  }
  assertNonEmpty(input.taskId, 'taskId');
  assertUuid(input.attemptId, 'attemptId');
  assertNonEmpty(input.tenantId, 'tenantId');
  assertDigest(input.originalRequestDigest, 'originalRequestDigest');
  assertDigest(input.taskDigest, 'taskDigest');
  if (!ROLES.has(input.role)) throw createExecutionAuthorityError('Execution landing role is invalid');
  if (!VALID_TASK_KINDS.has(input.kind)) throw createExecutionAuthorityError('Execution landing task kind is invalid');
  if (!MODES.has(input.admissionMode)) throw createExecutionAuthorityError('Execution landing admission mode is invalid');
  if (input.approvalEvidenceRef !== undefined && input.approvalEvidenceRef !== null) {
    assertNonEmpty(input.approvalEvidenceRef, 'approvalEvidenceRef');
  }
  if (input.admissionMode === 'attended' && !input.approvalEvidenceRef) {
    throw createExecutionAuthorityError('Attended execution landing checkpoint requires approval evidence');
  }
  const identity = validateIdentity(input.identity);
  assertDigest(input.policyDigest, 'policyDigest');
  assertExecutionLandingPolicyConfig(input.landingPolicy, 'execution landing checkpoint policy');
  const landingPolicy = { ...input.landingPolicy };
  const hardBudget = validateBudget(input.hardBudget, 'hardBudget');
  const cumulativeUsage = validateCounters(input.cumulativeUsage);
  const remainingBudget = deriveRemainingExecutionBudget(hardBudget, cumulativeUsage, input.cumulativeUsd);
  if (input.parentAttemptId !== undefined && input.parentAttemptId !== null) {
    assertUuid(input.parentAttemptId, 'parentAttemptId');
  }
  if (input.parentFence !== undefined && input.parentFence !== null) {
    assertNonEmpty(input.parentFence, 'parentFence');
  }
  if (input.parentCheckpointSha256 !== undefined && input.parentCheckpointSha256 !== null) {
    assertDigest(input.parentCheckpointSha256, 'parentCheckpointSha256');
  }
  const parentParts = [
    input.parentAttemptId ?? null,
    input.parentFence ?? null,
    input.parentCheckpointSha256 ?? null,
  ];
  if (parentParts.some(value => value !== null) && parentParts.some(value => value === null)) {
    throw createExecutionAuthorityError('Execution landing parent lineage must be all-null or fully specified');
  }
  assertNonEmpty(input.attemptFence, 'attemptFence');
  const providerSequence = validateProviderSequence(input.providerSequence);
  const semanticState = validateSemanticState(input.semanticState);
  const scope = validateScope(input.scope);
  assertStringRefs(input.diskDiffRefs, 'diskDiffRefs');
  assertStringRefs(input.evidenceRefs, 'evidenceRefs');
  const acceptanceCriteria = input.acceptanceCriteria.trim();
  const acceptanceDigest = executionAcceptanceDigest(acceptanceCriteria);
  assertIsoTime(input.landingRequestedAt, 'landingRequestedAt');
  const landedAt = input.landedAt ?? new Date().toISOString();
  assertIsoTime(landedAt, 'landedAt');
  if (Date.parse(landedAt) < Date.parse(input.landingRequestedAt)) {
    throw createExecutionAuthorityError('Execution landing landedAt precedes landingRequestedAt');
  }

  const ref: ExecutionLandingCheckpointRefV1 = {
    schemaVersion: EXECUTION_LANDING_CHECKPOINT_SCHEMA_VERSION,
    projectId: projectId(projectRoot),
    taskId: input.taskId,
    attemptId: input.attemptId,
  };
  assertHostAuthorityOutsideProject(projectRoot, ref);
  const checkpoint: ExecutionLandingCheckpointV1 = {
    ...ref,
    state: 'landed',
    tenantId: input.tenantId,
    originalRequestDigest: input.originalRequestDigest,
    taskDigest: input.taskDigest,
    role: input.role,
    kind: input.kind,
    admissionMode: input.admissionMode,
    approvalEvidenceRef: input.approvalEvidenceRef ?? null,
    identity,
    policyDigest: input.policyDigest,
    landingPolicy,
    hardBudget,
    hardBudgetDigest: executionBudgetDigest(hardBudget),
    cumulativeUsage,
    ...(input.cumulativeUsd !== undefined ? { cumulativeUsd: input.cumulativeUsd } : {}),
    remainingBudget,
    parentAttemptId: input.parentAttemptId ?? null,
    parentFence: input.parentFence ?? null,
    parentCheckpointSha256: input.parentCheckpointSha256 ?? null,
    attemptFence: input.attemptFence,
    providerSequence,
    semanticState,
    scope,
    diskDiffRefs: [...input.diskDiffRefs],
    evidenceRefs: [...input.evidenceRefs],
    acceptanceCriteria,
    acceptanceDigest,
    landingRequestedAt: input.landingRequestedAt,
    landedAt,
  };
  return {
    schemaVersion: EXECUTION_LANDING_CHECKPOINT_SCHEMA_VERSION,
    checkpointSha256: checkpointDigest(checkpoint),
    checkpoint,
  };
}

function parseCheckpoint(value: unknown): ExecutionLandingCheckpointEnvelopeV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['schemaVersion', 'checkpointSha256', 'checkpoint'])
    || value.schemaVersion !== EXECUTION_LANDING_CHECKPOINT_SCHEMA_VERSION
    || typeof value.checkpointSha256 !== 'string'
    || !SHA256.test(value.checkpointSha256)
    || !isRecord(value.checkpoint)
  ) return null;
  const checkpoint = value.checkpoint;
  const required = [
    'schemaVersion',
    'projectId',
    'taskId',
    'attemptId',
    'state',
    'tenantId',
    'originalRequestDigest',
    'taskDigest',
    'role',
    'kind',
    'admissionMode',
    'approvalEvidenceRef',
    'identity',
    'policyDigest',
    'landingPolicy',
    'hardBudgetDigest',
    'hardBudget',
    'cumulativeUsage',
    'remainingBudget',
    'parentAttemptId',
    'parentFence',
    'parentCheckpointSha256',
    'attemptFence',
    'providerSequence',
    'semanticState',
    'scope',
    'diskDiffRefs',
    'evidenceRefs',
    'acceptanceCriteria',
    'acceptanceDigest',
    'landingRequestedAt',
    'landedAt',
  ];
  if (!hasExactKeys(checkpoint, required, ['cumulativeUsd'])) return null;
  try {
    assertRefShape(checkpoint);
    if (checkpoint.state !== 'landed') return null;
    assertNonEmpty(checkpoint.tenantId, 'tenantId');
    assertDigest(checkpoint.originalRequestDigest, 'originalRequestDigest');
    assertDigest(checkpoint.taskDigest, 'taskDigest');
    if (!ROLES.has(checkpoint.role as ExecutionBudgetRole)) return null;
    if (!VALID_TASK_KINDS.has(checkpoint.kind as TaskKind)) return null;
    if (!MODES.has(checkpoint.admissionMode as ExecutionAdmissionMode)) return null;
    if (checkpoint.approvalEvidenceRef !== null) {
      assertNonEmpty(checkpoint.approvalEvidenceRef, 'approvalEvidenceRef');
    }
    if (checkpoint.admissionMode === 'attended' && checkpoint.approvalEvidenceRef === null) return null;
    validateIdentity(checkpoint.identity);
    assertDigest(checkpoint.policyDigest, 'policyDigest');
    assertExecutionLandingPolicyConfig(
      checkpoint.landingPolicy as ExecutionLandingPolicyConfig,
      'execution landing checkpoint policy',
    );
    const hardBudget = validateBudget(checkpoint.hardBudget, 'hardBudget');
    if (checkpoint.hardBudgetDigest !== executionBudgetDigest(hardBudget)) return null;
    const counters = validateCounters(checkpoint.cumulativeUsage);
    const remaining = deriveRemainingExecutionBudget(
      hardBudget,
      counters,
      checkpoint.cumulativeUsd as number | undefined,
    );
    if (canonicalJson(remaining) !== canonicalJson(checkpoint.remainingBudget)) return null;
    if (checkpoint.parentAttemptId !== null) assertUuid(checkpoint.parentAttemptId, 'parentAttemptId');
    if (checkpoint.parentFence !== null) assertNonEmpty(checkpoint.parentFence, 'parentFence');
    if (checkpoint.parentCheckpointSha256 !== null) {
      assertDigest(checkpoint.parentCheckpointSha256, 'parentCheckpointSha256');
    }
    const parentParts = [
      checkpoint.parentAttemptId,
      checkpoint.parentFence,
      checkpoint.parentCheckpointSha256,
    ];
    if (parentParts.some(part => part !== null) && parentParts.some(part => part === null)) return null;
    assertNonEmpty(checkpoint.attemptFence, 'attemptFence');
    validateProviderSequence(checkpoint.providerSequence);
    validateSemanticState(checkpoint.semanticState);
    validateScope(checkpoint.scope);
    assertStringRefs(checkpoint.diskDiffRefs, 'diskDiffRefs');
    assertStringRefs(checkpoint.evidenceRefs, 'evidenceRefs');
    if (
      typeof checkpoint.acceptanceCriteria !== 'string'
      || checkpoint.acceptanceDigest !== executionAcceptanceDigest(checkpoint.acceptanceCriteria)
    ) return null;
    assertIsoTime(checkpoint.landingRequestedAt, 'landingRequestedAt');
    assertIsoTime(checkpoint.landedAt, 'landedAt');
    if (Date.parse(checkpoint.landedAt as string) < Date.parse(checkpoint.landingRequestedAt as string)) return null;
    if (value.checkpointSha256 !== checkpointDigest(checkpoint as unknown as ExecutionLandingCheckpointV1)) return null;
    return value as unknown as ExecutionLandingCheckpointEnvelopeV1;
  } catch {
    return null;
  }
}

export function assertExecutionLandingCheckpointEnvelope(
  value: unknown,
): asserts value is ExecutionLandingCheckpointEnvelopeV1 {
  if (!parseCheckpoint(value)) {
    throw createExecutionAuthorityError('Invalid execution landing checkpoint envelope');
  }
}

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function publishJsonFirstWriter(
  path: string,
  value: unknown,
  acceptsExisting: (existing: unknown) => boolean,
): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  let published = false;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    // 'r+' (not 'r'): Windows FlushFileBuffers rejects read-only handles with EPERM.
    const fd = openSync(tmp, 'r+');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    try {
      linkSync(tmp, path);
      published = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (!acceptsExisting(readJson(path))) {
        throw createExecutionAuthorityError(`Conflicting immutable execution landing authority already exists: ${path}`);
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
}

export function writeExecutionLandingCheckpointAtomic(
  projectRoot: string,
  envelope: ExecutionLandingCheckpointEnvelopeV1,
): void {
  const parsed = parseCheckpoint(envelope);
  if (!parsed) throw createExecutionAuthorityError('Invalid execution landing checkpoint envelope');
  assertExecutionLandingCheckpointRef(projectRoot, parsed.checkpoint);
  publishJsonFirstWriter(
    executionLandingCheckpointPath(parsed.checkpoint),
    parsed,
    existing => {
      const persisted = parseCheckpoint(existing);
      return persisted !== null
        && sameRef(persisted.checkpoint, parsed.checkpoint)
        && persisted.checkpointSha256 === parsed.checkpointSha256;
    },
  );
}

export function readExecutionLandingCheckpoint(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV1,
): ExecutionLandingCheckpointEnvelopeV1 | null {
  assertExecutionLandingCheckpointRef(projectRoot, ref);
  return readExecutionLandingCheckpointByRef(ref);
}

export function readExecutionLandingCheckpointByRef(
  ref: ExecutionLandingCheckpointRefV1,
): ExecutionLandingCheckpointEnvelopeV1 | null {
  assertRefShape(ref as unknown as Record<string, unknown>);
  const path = executionLandingCheckpointPath(ref);
  if (!existsSync(path)) return null;
  const parsed = parseCheckpoint(readJson(path));
  if (!parsed || !sameRef(parsed.checkpoint, ref)) {
    throw createExecutionAuthorityError(`Corrupt execution landing checkpoint: ${path}`);
  }
  return parsed;
}

export function assertExecutionLandingCheckpointRef(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV1,
): void {
  assertRefShape(ref as unknown as Record<string, unknown>);
  if (ref.projectId !== projectId(projectRoot)) {
    throw createExecutionAuthorityError('Execution landing checkpoint reference does not match project authority');
  }
  assertHostAuthorityOutsideProject(projectRoot, ref);
}

function parseRetirement(value: unknown): ExecutionAttemptRetirementV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'schemaVersion',
      'projectId',
      'taskId',
      'attemptId',
      'retirementVersion',
      'state',
      'disposition',
      'checkpointSha256',
      'runtimeDisposition',
      'resourcesReleased',
      'evidenceRefs',
      'retiredAt',
    ])
  ) return null;
  try {
    assertRefShape(value);
    if (
      value.retirementVersion !== EXECUTION_ATTEMPT_RETIREMENT_SCHEMA_VERSION
      || value.state !== 'retired'
      || value.disposition !== 'landed'
      || !['cooperatively-exited', 'checkpointed-process-exited', 'stopped-removed']
        .includes(String(value.runtimeDisposition))
      || value.resourcesReleased !== true
    ) return null;
    assertDigest(value.checkpointSha256, 'checkpointSha256');
    assertStringRefs(value.evidenceRefs, 'retirement.evidenceRefs');
    assertIsoTime(value.retiredAt, 'retiredAt');
    return value as unknown as ExecutionAttemptRetirementV1;
  } catch {
    return null;
  }
}

export function executionAttemptRetirementDigest(retirement: ExecutionAttemptRetirementV1): string {
  const parsed = parseRetirement(retirement);
  if (!parsed) throw createExecutionAuthorityError('Invalid execution attempt retirement');
  return sha256(canonicalJson(parsed));
}

export function writeExecutionAttemptRetirementAtomic(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV1,
  input: {
    checkpointSha256: string;
    runtimeDisposition: ExecutionAttemptRuntimeDisposition;
    resourcesReleased: true;
    evidenceRefs: string[];
    retiredAt?: string;
  },
): ExecutionAttemptRetirementV1 {
  assertExecutionLandingCheckpointRef(projectRoot, ref);
  const checkpoint = readExecutionLandingCheckpoint(projectRoot, ref);
  if (!checkpoint || checkpoint.checkpointSha256 !== input.checkpointSha256) {
    throw createExecutionAuthorityError('Cannot retire execution attempt without its matching landing checkpoint');
  }
  if (!['cooperatively-exited', 'checkpointed-process-exited', 'stopped-removed'].includes(input.runtimeDisposition)) {
    throw createExecutionAuthorityError('Execution attempt retirement runtime disposition is invalid');
  }
  if (input.resourcesReleased !== true) {
    throw createExecutionAuthorityError('Execution attempt retirement requires explicit resource release evidence');
  }
  assertStringRefs(input.evidenceRefs, 'retirement.evidenceRefs');
  const retiredAt = input.retiredAt ?? new Date().toISOString();
  assertIsoTime(retiredAt, 'retiredAt');
  const retirement: ExecutionAttemptRetirementV1 = {
    ...copyRef(ref),
    retirementVersion: EXECUTION_ATTEMPT_RETIREMENT_SCHEMA_VERSION,
    state: 'retired',
    disposition: 'landed',
    checkpointSha256: input.checkpointSha256,
    runtimeDisposition: input.runtimeDisposition,
    resourcesReleased: true,
    evidenceRefs: [...input.evidenceRefs],
    retiredAt,
  };
  publishJsonFirstWriter(
    executionAttemptRetirementPath(ref),
    retirement,
    existing => {
      const parsed = parseRetirement(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.checkpointSha256 === retirement.checkpointSha256
        && parsed.runtimeDisposition === retirement.runtimeDisposition
        && canonicalJson(parsed.evidenceRefs) === canonicalJson(retirement.evidenceRefs);
    },
  );
  return readExecutionAttemptRetirement(projectRoot, ref) ?? retirement;
}

export function readExecutionAttemptRetirement(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV1,
): ExecutionAttemptRetirementV1 | null {
  assertExecutionLandingCheckpointRef(projectRoot, ref);
  return readExecutionAttemptRetirementByRef(ref);
}

export function readExecutionAttemptRetirementByRef(
  ref: ExecutionLandingCheckpointRefV1,
): ExecutionAttemptRetirementV1 | null {
  assertRefShape(ref as unknown as Record<string, unknown>);
  const path = executionAttemptRetirementPath(ref);
  if (!existsSync(path)) return null;
  const parsed = parseRetirement(readJson(path));
  const checkpoint = readExecutionLandingCheckpointByRef(ref);
  if (
    !parsed
    || !sameRef(parsed, ref)
    || !checkpoint
    || parsed.checkpointSha256 !== checkpoint.checkpointSha256
  ) {
    throw createExecutionAuthorityError(`Corrupt execution attempt retirement: ${path}`);
  }
  return parsed;
}

/**
 * Enumerate restart-relevant continuation intents for exactly one canonical
 * project. Directory names are hints only; every checkpoint is parsed and
 * matched back to its embedded project/task/attempt authority.
 */
export function listRetiredExecutionLandings(
  projectRoot: string,
): RetiredExecutionLandingV1[] {
  const expectedProjectId = projectId(projectRoot);
  const projectPath = deckentPath(
    undefined,
    'runtime',
    'execution-landings',
    expectedProjectId,
  );
  if (!existsSync(projectPath)) return [];

  const landed: RetiredExecutionLandingV1[] = [];
  for (const taskHash of readdirSync(projectPath)) {
    const attemptsPath = resolve(projectPath, taskHash, 'attempts');
    let attemptIds: string[];
    try { attemptIds = readdirSync(attemptsPath); } catch { continue; }
    for (const attemptId of attemptIds) {
      const checkpointPath = resolve(attemptsPath, attemptId, 'checkpoint.json');
      if (!existsSync(checkpointPath)) continue;
      const checkpoint = parseCheckpoint(readJson(checkpointPath));
      if (
        !checkpoint
        || checkpoint.checkpoint.projectId !== expectedProjectId
        || sha256(checkpoint.checkpoint.taskId) !== taskHash
        || checkpoint.checkpoint.attemptId !== attemptId
      ) {
        throw createExecutionAuthorityError(`Corrupt execution landing checkpoint authority: ${checkpointPath}`);
      }
      assertExecutionLandingCheckpointRef(projectRoot, checkpoint.checkpoint);
      const retirement = readExecutionAttemptRetirement(projectRoot, checkpoint.checkpoint);
      if (!retirement) continue;
      landed.push({
        checkpoint,
        retirement,
        continuationClaim: readExecutionContinuationClaim(
          projectRoot,
          checkpoint.checkpoint,
          checkpoint.checkpointSha256,
        ),
      });
    }
  }
  return landed.sort((a, b) => (
    a.checkpoint.checkpoint.landedAt.localeCompare(b.checkpoint.checkpoint.landedAt)
      || a.checkpoint.checkpoint.attemptId.localeCompare(b.checkpoint.checkpoint.attemptId)
  ));
}

function parseContinuationClaim(value: unknown): ExecutionContinuationClaimV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'schemaVersion',
      'projectId',
      'taskId',
      'attemptId',
      'claimVersion',
      'state',
      'checkpointSha256',
      'parentAttemptId',
      'continuationAttemptId',
      'continuationFence',
      'claimedAt',
    ])
  ) return null;
  try {
    assertRefShape(value);
    if (
      value.claimVersion !== EXECUTION_CONTINUATION_CLAIM_SCHEMA_VERSION
      || value.state !== 'continuation-claimed'
      || value.parentAttemptId !== value.attemptId
    ) return null;
    assertDigest(value.checkpointSha256, 'checkpointSha256');
    assertUuid(value.continuationAttemptId, 'continuationAttemptId');
    if (value.continuationAttemptId === value.parentAttemptId) return null;
    assertNonEmpty(value.continuationFence, 'continuationFence');
    assertIsoTime(value.claimedAt, 'claimedAt');
    return value as unknown as ExecutionContinuationClaimV1;
  } catch {
    return null;
  }
}

export function assertExecutionContinuationClaim(
  value: unknown,
): asserts value is ExecutionContinuationClaimV1 {
  if (!parseContinuationClaim(value)) {
    throw createExecutionAuthorityError('Invalid execution continuation claim');
  }
}

export function claimExecutionContinuationAtomic(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV1,
  input: {
    checkpointSha256: string;
    continuationAttemptId: string;
    continuationFence: string;
    claimedAt?: string;
  },
): ExecutionContinuationClaimV1 {
  assertExecutionLandingCheckpointRef(projectRoot, ref);
  assertUuid(input.continuationAttemptId, 'continuationAttemptId');
  if (input.continuationAttemptId === ref.attemptId) {
    throw createExecutionAuthorityError('Execution continuation attempt must differ from its parent attempt');
  }
  assertNonEmpty(input.continuationFence, 'continuationFence');
  const checkpoint = readExecutionLandingCheckpoint(projectRoot, ref);
  const retirement = readExecutionAttemptRetirement(projectRoot, ref);
  if (
    !checkpoint
    || checkpoint.checkpointSha256 !== input.checkpointSha256
    || !retirement
    || retirement.checkpointSha256 !== input.checkpointSha256
  ) {
    throw createExecutionAuthorityError('Execution continuation requires a matching landed and retired predecessor');
  }
  const claimedAt = input.claimedAt ?? new Date().toISOString();
  assertIsoTime(claimedAt, 'claimedAt');
  const claim: ExecutionContinuationClaimV1 = {
    ...copyRef(ref),
    claimVersion: EXECUTION_CONTINUATION_CLAIM_SCHEMA_VERSION,
    state: 'continuation-claimed',
    checkpointSha256: input.checkpointSha256,
    parentAttemptId: ref.attemptId,
    continuationAttemptId: input.continuationAttemptId,
    continuationFence: input.continuationFence,
    claimedAt,
  };
  publishJsonFirstWriter(
    executionContinuationClaimPath(ref, input.checkpointSha256),
    claim,
    existing => {
      const parsed = parseContinuationClaim(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.checkpointSha256 === claim.checkpointSha256
        && parsed.continuationAttemptId === claim.continuationAttemptId
        && parsed.continuationFence === claim.continuationFence;
    },
  );
  return readExecutionContinuationClaim(projectRoot, ref, input.checkpointSha256) ?? claim;
}

export function readExecutionContinuationClaim(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV1,
  checkpointSha256: string,
): ExecutionContinuationClaimV1 | null {
  assertExecutionLandingCheckpointRef(projectRoot, ref);
  const checkpoint = readExecutionLandingCheckpoint(projectRoot, ref);
  if (!checkpoint || checkpoint.checkpointSha256 !== checkpointSha256) {
    throw createExecutionAuthorityError('Execution continuation checkpoint authority does not match');
  }
  const path = executionContinuationClaimPath(ref, checkpointSha256);
  if (!existsSync(path)) return null;
  const parsed = parseContinuationClaim(readJson(path));
  if (
    !parsed
    || !sameRef(parsed, ref)
    || parsed.checkpointSha256 !== checkpointSha256
  ) {
    throw createExecutionAuthorityError(`Corrupt execution continuation claim: ${path}`);
  }
  return parsed;
}

const V2_DIGEST = /^sha256:[a-f0-9]{64}$/;
const V2_DISPATCH_REQUEST_ID = /^dreq-[a-f0-9]{64}$/;
const V2_SAFE_AUTHORITY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function v2Digest(domain: string, value: unknown): ExecutionLandingDigestV2 {
  return `sha256:${sha256(`${domain}\0${canonicalJson(value)}`)}`;
}

function v2ExactRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || nodeUtilTypes.isProxy(value)
    ) throw new Error();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error();
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length
      || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))
      || keys.some(key => !Object.hasOwn(value, key))
    ) throw new Error();
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error();
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    throw createExecutionAuthorityError(`Execution landing V2 ${field} has invalid or unknown fields`);
  }
}

function v2PlainDataSnapshot(
  value: unknown,
  field: string,
  state: { nodes: number } = { nodes: 0 },
  depth = 0,
): unknown {
  state.nodes += 1;
  if (state.nodes > 4_096 || depth > 16) {
    throw createExecutionAuthorityError(`Execution landing V2 ${field} exceeds plain-data bounds`);
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf-8') > 64 * 1_024) {
      throw createExecutionAuthorityError(`Execution landing V2 ${field} string exceeds bounds`);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw createExecutionAuthorityError(`Execution landing V2 ${field} number is invalid`);
    }
    return value;
  }
  if (typeof value !== 'object' || nodeUtilTypes.isProxy(value)) {
    throw createExecutionAuthorityError(`Execution landing V2 ${field} must be exact plain data`);
  }
  if (Array.isArray(value)) {
    if (value.length > 1_024 || Reflect.ownKeys(value).length !== value.length + 1) {
      throw createExecutionAuthorityError(`Execution landing V2 ${field} array is invalid`);
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw createExecutionAuthorityError(`Execution landing V2 ${field} array is invalid`);
      }
      snapshot.push(v2PlainDataSnapshot(descriptor.value, `${field}[${index}]`, state, depth + 1));
    }
    return snapshot;
  }
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if (
    (prototype !== Object.prototype && prototype !== null)
    || keys.length > 128
    || keys.some(key => typeof key !== 'string')
  ) throw createExecutionAuthorityError(`Execution landing V2 ${field} object is invalid`);
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw createExecutionAuthorityError(`Execution landing V2 ${field} object is invalid`);
    }
    snapshot[key] = v2PlainDataSnapshot(descriptor.value, `${field}.${key}`, state, depth + 1);
  }
  return snapshot;
}

function v2AssertDigest(value: unknown, field: string): asserts value is ExecutionLandingDigestV2 {
  if (typeof value !== 'string' || !V2_DIGEST.test(value)) {
    throw createExecutionAuthorityError(`Execution landing V2 ${field} must be a prefixed lowercase SHA-256 digest`);
  }
}

function v2AssertRawDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw createExecutionAuthorityError(`Execution landing V2 ${field} must be a lowercase SHA-256 digest`);
  }
}

function v2AuthorityKey(value: unknown, field: string): string {
  if (
    typeof value !== 'string'
    || !V2_SAFE_AUTHORITY_KEY.test(value)
    || value.includes('.tasks')
    || value.includes('/')
    || value.includes('\\')
  ) throw createExecutionAuthorityError(`Execution landing V2 ${field} must be a path-free authority key`);
  return value;
}

function v2DigestList(value: unknown, field: string): readonly ExecutionLandingDigestV2[] {
  if (
    !Array.isArray(value)
    || nodeUtilTypes.isProxy(value)
    || value.length < 1
    || value.length > 64
    || Reflect.ownKeys(value).length !== value.length + 1
  ) throw createExecutionAuthorityError(`Execution landing V2 ${field} is invalid`);
  const values: ExecutionLandingDigestV2[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw createExecutionAuthorityError(`Execution landing V2 ${field} is invalid`);
    }
    v2AssertDigest(descriptor.value, `${field}[${index}]`);
    values.push(descriptor.value);
  }
  if (new Set(values).size !== values.length) {
    throw createExecutionAuthorityError(`Execution landing V2 ${field} is duplicated`);
  }
  return Object.freeze(values);
}

function v2Identity(value: unknown): ExecutionLandingPrivateAttemptIdentityV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion',
    'backend',
    'projectRootSha256',
    'projectId',
    'taskId',
    'attemptId',
    'generation',
  ], 'privateIdentity');
  if (record.schemaVersion !== 2 || record.backend !== 'docker') {
    throw createExecutionAuthorityError('Execution landing V2 privateIdentity schema/backend is invalid');
  }
  v2AssertRawDigest(record.projectRootSha256, 'privateIdentity.projectRootSha256');
  const projectIdValue = v2AuthorityKey(record.projectId, 'privateIdentity.projectId');
  const taskIdValue = v2AuthorityKey(record.taskId, 'privateIdentity.taskId');
  assertUuid(record.attemptId, 'V2 privateIdentity.attemptId');
  if (!Number.isSafeInteger(record.generation) || (record.generation as number) < 1) {
    throw createExecutionAuthorityError('Execution landing V2 privateIdentity.generation must be positive');
  }
  return Object.freeze({
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256: record.projectRootSha256,
    projectId: projectIdValue,
    taskId: taskIdValue,
    attemptId: record.attemptId,
    generation: record.generation as number,
  });
}

function v2OperationalBody(
  checkpoint: ExecutionLandingCheckpointV1,
  diskEvidenceDigest: ExecutionLandingDigestV2,
  evidenceRefs: readonly ExecutionLandingEvidenceRefV2[],
): Omit<ExecutionLandingOperationalPayloadV2, 'operationalDigest'> {
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-operational-payload',
    taskId: checkpoint.taskId,
    providerExecutionAttemptId: checkpoint.attemptId,
    tenantId: checkpoint.tenantId,
    originalRequestDigest: checkpoint.originalRequestDigest,
    taskDigest: checkpoint.taskDigest,
    role: checkpoint.role,
    taskKind: checkpoint.kind,
    admissionMode: checkpoint.admissionMode,
    approvalEvidenceRef: checkpoint.approvalEvidenceRef,
    identity: Object.freeze({ ...checkpoint.identity }),
    policyDigest: checkpoint.policyDigest,
    landingPolicy: Object.freeze({ ...checkpoint.landingPolicy }),
    hardBudgetDigest: checkpoint.hardBudgetDigest,
    hardBudget: Object.freeze({ ...checkpoint.hardBudget }),
    cumulativeUsage: Object.freeze({ ...checkpoint.cumulativeUsage }),
    cumulativeUsd: checkpoint.cumulativeUsd ?? null,
    remainingBudget: Object.freeze({ ...checkpoint.remainingBudget }),
    parentAttemptId: checkpoint.parentAttemptId,
    parentFence: checkpoint.parentFence,
    parentCheckpointSha256: checkpoint.parentCheckpointSha256,
    attemptFence: checkpoint.attemptFence,
    providerSequence: Object.freeze({ ...checkpoint.providerSequence }),
    semanticState: Object.freeze({
      ...checkpoint.semanticState,
      completedWork: [...checkpoint.semanticState.completedWork],
      remainingWork: [...checkpoint.semanticState.remainingWork],
      unresolvedRisks: [...checkpoint.semanticState.unresolvedRisks],
    }),
    scope: Object.freeze({
      filesRead: [...checkpoint.scope.filesRead],
      filesWrite: [...checkpoint.scope.filesWrite],
    }),
    diskEvidenceDigest,
    evidenceRefs: Object.freeze([...evidenceRefs]),
    acceptanceCriteria: checkpoint.acceptanceCriteria,
    acceptanceDigest: checkpoint.acceptanceDigest,
    landingRequestedAt: checkpoint.landingRequestedAt,
    landedAt: checkpoint.landedAt,
  });
}

export function createExecutionLandingOperationalPayloadV2(
  projectRoot: string,
  input: CreateExecutionLandingOperationalPayloadV2Input,
): ExecutionLandingOperationalPayloadV2 {
  const safeInput = v2PlainDataSnapshot(
    input,
    'operational input',
  ) as CreateExecutionLandingOperationalPayloadV2Input;
  const inputKeys = Object.keys(safeInput as unknown as Record<string, unknown>);
  const allowedInputKeys = new Set([
    'taskId', 'attemptId', 'tenantId', 'originalRequestDigest', 'taskDigest', 'role',
    'kind', 'admissionMode', 'approvalEvidenceRef', 'identity', 'policyDigest',
    'landingPolicy', 'hardBudget', 'cumulativeUsage', 'cumulativeUsd', 'parentAttemptId',
    'parentFence', 'parentCheckpointSha256', 'attemptFence', 'providerSequence',
    'semanticState', 'scope', 'diskEvidenceDigest', 'evidenceRefs', 'acceptanceCriteria',
    'landingRequestedAt', 'landedAt',
  ]);
  const requiredInputKeys = [
    'taskId', 'attemptId', 'tenantId', 'originalRequestDigest', 'taskDigest', 'role',
    'kind', 'admissionMode', 'identity', 'policyDigest', 'landingPolicy', 'hardBudget',
    'cumulativeUsage', 'attemptFence', 'providerSequence', 'semanticState', 'scope',
    'diskEvidenceDigest', 'evidenceRefs', 'acceptanceCriteria', 'landingRequestedAt', 'landedAt',
  ];
  if (
    inputKeys.some(key => !allowedInputKeys.has(key))
    || requiredInputKeys.some(key => !Object.hasOwn(safeInput, key))
  ) throw createExecutionAuthorityError('Execution landing V2 operational input has invalid or unknown fields');
  if (safeInput.landedAt === undefined) {
    throw createExecutionAuthorityError('Execution landing V2 operational input requires exact landedAt');
  }
  v2AssertDigest(safeInput.diskEvidenceDigest, 'operational input.diskEvidenceDigest');
  if (
    !Array.isArray(safeInput.evidenceRefs)
    || safeInput.evidenceRefs.length < 1
    || safeInput.evidenceRefs.length > 64
    || safeInput.evidenceRefs.some(ref => typeof ref !== 'string'
      || !/^[a-z][a-z0-9-]{1,63}:sha256:[a-f0-9]{64}$/.test(ref)
      || ref.includes('.tasks')
      || ref.includes('/')
      || ref.includes('\\'))
    || new Set(safeInput.evidenceRefs).size !== safeInput.evidenceRefs.length
  ) throw createExecutionAuthorityError('Execution landing V2 evidenceRefs must be bounded typed digest refs');
  const legacyInput = {
    ...safeInput,
    diskDiffRefs: [`execution-landing-disk:${safeInput.diskEvidenceDigest}`],
  } as Record<string, unknown>;
  delete legacyInput.diskEvidenceDigest;
  const legacyValidated = createExecutionLandingCheckpoint(
    projectRoot,
    legacyInput as unknown as CreateExecutionLandingCheckpointInput,
  ).checkpoint;
  const body = v2OperationalBody(
    legacyValidated,
    safeInput.diskEvidenceDigest,
    safeInput.evidenceRefs as ExecutionLandingEvidenceRefV2[],
  );
  return Object.freeze({
    ...body,
    operationalDigest: v2Digest('execution-landing-operational-payload-v2', body),
  });
}

export function snapshotExecutionLandingOperationalPayloadV2(
  projectRoot: string,
  value: unknown,
): ExecutionLandingOperationalPayloadV2 {
  const safeValue = v2PlainDataSnapshot(value, 'operationalPayload');
  const record = v2ExactRecord(safeValue, [
    'schemaVersion', 'kind', 'taskId', 'providerExecutionAttemptId', 'tenantId',
    'originalRequestDigest', 'taskDigest', 'role', 'taskKind', 'admissionMode',
    'approvalEvidenceRef', 'identity', 'policyDigest', 'landingPolicy',
    'hardBudgetDigest', 'hardBudget', 'cumulativeUsage', 'cumulativeUsd',
    'remainingBudget', 'parentAttemptId', 'parentFence', 'parentCheckpointSha256',
    'attemptFence', 'providerSequence', 'semanticState', 'scope', 'diskEvidenceDigest',
    'evidenceRefs', 'acceptanceCriteria', 'acceptanceDigest', 'landingRequestedAt',
    'landedAt', 'operationalDigest',
  ], 'operationalPayload');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-operational-payload'
    || (record.cumulativeUsd !== null && typeof record.cumulativeUsd !== 'number')
  ) throw createExecutionAuthorityError('Execution landing V2 operational payload is invalid');
  v2AssertDigest(record.operationalDigest, 'operationalPayload.operationalDigest');
  v2AssertDigest(record.diskEvidenceDigest, 'operationalPayload.diskEvidenceDigest');
  const payload = createExecutionLandingOperationalPayloadV2(projectRoot, {
    taskId: record.taskId as string,
    attemptId: record.providerExecutionAttemptId as string,
    tenantId: record.tenantId as string,
    originalRequestDigest: record.originalRequestDigest as string,
    taskDigest: record.taskDigest as string,
    role: record.role as ExecutionBudgetRole,
    kind: record.taskKind as TaskKind,
    admissionMode: record.admissionMode as ExecutionAdmissionMode,
    approvalEvidenceRef: record.approvalEvidenceRef as string | null,
    identity: record.identity as ExecutionLandingIdentityV1,
    policyDigest: record.policyDigest as string,
    landingPolicy: record.landingPolicy as ExecutionLandingPolicyConfig,
    hardBudget: record.hardBudget as ExecutionBudget,
    cumulativeUsage: record.cumulativeUsage as LiveUsageCounters,
    ...(record.cumulativeUsd === null ? {} : { cumulativeUsd: record.cumulativeUsd }),
    parentAttemptId: record.parentAttemptId as string | null,
    parentFence: record.parentFence as string | null,
    parentCheckpointSha256: record.parentCheckpointSha256 as string | null,
    attemptFence: record.attemptFence as string,
    providerSequence: record.providerSequence as ExecutionLandingProviderSequenceV1,
    semanticState: record.semanticState as ExecutionLandingSemanticStateV1,
    scope: record.scope as ExecutionLandingScopeV1,
    diskEvidenceDigest: record.diskEvidenceDigest as ExecutionLandingDigestV2,
    evidenceRefs: record.evidenceRefs as ExecutionLandingEvidenceRefV2[],
    acceptanceCriteria: record.acceptanceCriteria as string,
    landingRequestedAt: record.landingRequestedAt as string,
    landedAt: record.landedAt as string,
  });
  if (
    payload.operationalDigest !== record.operationalDigest
    || payload.hardBudgetDigest !== record.hardBudgetDigest
    || canonicalJson(payload.remainingBudget) !== canonicalJson(record.remainingBudget)
    || payload.acceptanceDigest !== record.acceptanceDigest
  ) throw createExecutionAuthorityError('Execution landing V2 operational payload digest/derivation mismatch');
  return payload;
}

function v2ResultSourceBody(
  value: unknown,
): Omit<ExecutionLandingResultSourceBindingV2, 'bindingDigest'> {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'artifactClass', 'artifactKey', 'identity',
    'admissionReceiptDigest', 'policyDigest', 'artifactReceiptDigest', 'contentDigest',
    'byteLength', 'capturedAt',
  ], 'resultSource');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-result-source-binding'
    || record.artifactClass !== 'worker-result'
    || !Number.isSafeInteger(record.byteLength)
    || (record.byteLength as number) < 1
  ) throw createExecutionAuthorityError('Execution landing V2 resultSource is invalid');
  const artifactKey = v2AuthorityKey(record.artifactKey, 'resultSource.artifactKey');
  const identity = v2Identity(record.identity);
  v2AssertDigest(record.admissionReceiptDigest, 'resultSource.admissionReceiptDigest');
  v2AssertDigest(record.policyDigest, 'resultSource.policyDigest');
  v2AssertDigest(record.artifactReceiptDigest, 'resultSource.artifactReceiptDigest');
  v2AssertDigest(record.contentDigest, 'resultSource.contentDigest');
  assertIsoTime(record.capturedAt, 'V2 resultSource.capturedAt');
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-result-source-binding',
    artifactClass: 'worker-result',
    artifactKey,
    identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
    policyDigest: record.policyDigest,
    artifactReceiptDigest: record.artifactReceiptDigest,
    contentDigest: record.contentDigest,
    byteLength: record.byteLength as number,
    capturedAt: record.capturedAt,
  });
}

export function createExecutionLandingResultSourceBindingV2(
  input: CreateExecutionLandingResultSourceBindingV2Input,
): ExecutionLandingResultSourceBindingV2 {
  const inputRecord = v2ExactRecord(input, [
    'artifactClass', 'artifactKey', 'identity', 'admissionReceiptDigest', 'policyDigest',
    'artifactReceiptDigest', 'contentDigest', 'byteLength', 'capturedAt',
  ], 'resultSource input');
  const body = v2ResultSourceBody({
    schemaVersion: 2,
    kind: 'execution-landing-result-source-binding',
    ...inputRecord,
  });
  return Object.freeze({
    ...body,
    bindingDigest: v2Digest('execution-landing-result-source-binding-v2', body),
  });
}

function v2ResultSource(value: unknown): ExecutionLandingResultSourceBindingV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'artifactClass', 'artifactKey', 'identity',
    'admissionReceiptDigest', 'policyDigest', 'artifactReceiptDigest', 'contentDigest',
    'byteLength', 'capturedAt', 'bindingDigest',
  ], 'resultSource');
  v2AssertDigest(record.bindingDigest, 'resultSource.bindingDigest');
  const body = v2ResultSourceBody(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'bindingDigest'),
  ));
  const bindingDigest = v2Digest('execution-landing-result-source-binding-v2', body);
  if (record.bindingDigest !== bindingDigest) {
    throw createExecutionAuthorityError('Execution landing V2 resultSource binding mismatch');
  }
  return Object.freeze({ ...body, bindingDigest });
}

function v2LandingArtifactBody(
  value: unknown,
): Omit<ExecutionLandingVerifiedArtifactBindingV2, 'verificationBindingDigest'> {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'artifactClass', 'artifactKey', 'identity',
    'admissionReceiptDigest', 'policyDigest', 'artifactReceiptDigest', 'contentDigest',
    'byteLength', 'capturedAt', 'verifiedAt',
  ], 'landingArtifact');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-verified-artifact-binding'
    || record.artifactClass !== 'worker-landing-proposal'
    || !Number.isSafeInteger(record.byteLength)
    || (record.byteLength as number) < 1
  ) throw createExecutionAuthorityError('Execution landing V2 landingArtifact is invalid');
  const artifactKey = v2AuthorityKey(record.artifactKey, 'landingArtifact.artifactKey');
  const identity = v2Identity(record.identity);
  v2AssertDigest(record.admissionReceiptDigest, 'landingArtifact.admissionReceiptDigest');
  v2AssertDigest(record.policyDigest, 'landingArtifact.policyDigest');
  v2AssertDigest(record.artifactReceiptDigest, 'landingArtifact.artifactReceiptDigest');
  v2AssertDigest(record.contentDigest, 'landingArtifact.contentDigest');
  assertIsoTime(record.capturedAt, 'V2 landingArtifact.capturedAt');
  assertIsoTime(record.verifiedAt, 'V2 landingArtifact.verifiedAt');
  if (Date.parse(record.verifiedAt) < Date.parse(record.capturedAt)) {
    throw createExecutionAuthorityError('Execution landing V2 artifact verification precedes capture');
  }
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-verified-artifact-binding',
    artifactClass: 'worker-landing-proposal',
    artifactKey,
    identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
    policyDigest: record.policyDigest,
    artifactReceiptDigest: record.artifactReceiptDigest,
    contentDigest: record.contentDigest,
    byteLength: record.byteLength as number,
    capturedAt: record.capturedAt,
    verifiedAt: record.verifiedAt,
  });
}

export function createExecutionLandingVerifiedArtifactBindingV2(
  input: CreateExecutionLandingVerifiedArtifactBindingV2Input,
): ExecutionLandingVerifiedArtifactBindingV2 {
  const inputRecord = v2ExactRecord(input, [
    'artifactClass', 'artifactKey', 'identity', 'admissionReceiptDigest', 'policyDigest',
    'artifactReceiptDigest', 'contentDigest', 'byteLength', 'capturedAt', 'verifiedAt',
  ], 'landingArtifact input');
  const body = v2LandingArtifactBody({
    schemaVersion: 2,
    kind: 'execution-landing-verified-artifact-binding',
    ...inputRecord,
  });
  return Object.freeze({
    ...body,
    verificationBindingDigest: v2Digest(
      'execution-landing-verified-artifact-binding-v2',
      body,
    ),
  });
}

function v2LandingArtifact(value: unknown): ExecutionLandingVerifiedArtifactBindingV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'artifactClass', 'artifactKey', 'identity',
    'admissionReceiptDigest', 'policyDigest', 'artifactReceiptDigest', 'contentDigest',
    'byteLength', 'capturedAt', 'verifiedAt', 'verificationBindingDigest',
  ], 'landingArtifact');
  v2AssertDigest(record.verificationBindingDigest, 'landingArtifact.verificationBindingDigest');
  const body = v2LandingArtifactBody(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'verificationBindingDigest'),
  ));
  const verificationBindingDigest = v2Digest(
    'execution-landing-verified-artifact-binding-v2',
    body,
  );
  if (record.verificationBindingDigest !== verificationBindingDigest) {
    throw createExecutionAuthorityError('Execution landing V2 artifact verification mismatch');
  }
  return Object.freeze({ ...body, verificationBindingDigest });
}

function v2PreparationBody(
  value: unknown,
): Omit<ExecutionLandingPreparationRefV2, 'preparationRefDigest'> {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'dispatchRequestId', 'dispatchRequestMaterialDigest',
    'privateIdentity', 'admissionReceiptDigest', 'admissionRefDigest', 'policyDigest',
    'admittedAt', 'taskSnapshotDigest', 'providerInvocationDigest',
  ], 'preparationRef');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-preparation-ref'
    || typeof record.dispatchRequestId !== 'string'
    || !V2_DISPATCH_REQUEST_ID.test(record.dispatchRequestId)
  ) throw createExecutionAuthorityError('Execution landing V2 preparation request is invalid');
  const privateIdentity = v2Identity(record.privateIdentity);
  assertIsoTime(record.admittedAt, 'V2 preparationRef.admittedAt');
  for (const field of [
    'dispatchRequestMaterialDigest', 'admissionReceiptDigest', 'admissionRefDigest',
    'policyDigest', 'taskSnapshotDigest', 'providerInvocationDigest',
  ] as const) v2AssertDigest(record[field], `preparationRef.${field}`);
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-preparation-ref',
    dispatchRequestId: record.dispatchRequestId,
    dispatchRequestMaterialDigest: record.dispatchRequestMaterialDigest as ExecutionLandingDigestV2,
    privateIdentity,
    admissionReceiptDigest: record.admissionReceiptDigest as ExecutionLandingDigestV2,
    admissionRefDigest: record.admissionRefDigest as ExecutionLandingDigestV2,
    admittedAt: record.admittedAt,
    policyDigest: record.policyDigest as ExecutionLandingDigestV2,
    taskSnapshotDigest: record.taskSnapshotDigest as ExecutionLandingDigestV2,
    providerInvocationDigest: record.providerInvocationDigest as ExecutionLandingDigestV2,
  });
}

export function createExecutionLandingPreparationRefV2(
  input: CreateExecutionLandingPreparationRefV2Input,
): ExecutionLandingPreparationRefV2 {
  const inputRecord = v2ExactRecord(input, [
    'dispatchRequestId', 'dispatchRequestMaterialDigest', 'privateIdentity',
    'admissionReceiptDigest', 'admissionRefDigest', 'admittedAt', 'policyDigest',
    'taskSnapshotDigest', 'providerInvocationDigest',
  ], 'preparationRef input');
  const body = v2PreparationBody({
    schemaVersion: 2,
    kind: 'execution-landing-preparation-ref',
    ...inputRecord,
  });
  return Object.freeze({
    ...body,
    preparationRefDigest: v2Digest('execution-landing-preparation-ref-v2', body),
  });
}

export function snapshotExecutionLandingPreparationRefV2(
  value: unknown,
): ExecutionLandingPreparationRefV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'dispatchRequestId', 'dispatchRequestMaterialDigest',
    'privateIdentity', 'admissionReceiptDigest', 'admissionRefDigest', 'policyDigest',
    'admittedAt', 'taskSnapshotDigest', 'providerInvocationDigest', 'preparationRefDigest',
  ], 'preparationRef');
  v2AssertDigest(record.preparationRefDigest, 'preparationRef.preparationRefDigest');
  const body = v2PreparationBody(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'preparationRefDigest'),
  ));
  const preparationRefDigest = v2Digest('execution-landing-preparation-ref-v2', body);
  if (record.preparationRefDigest !== preparationRefDigest) {
    throw createExecutionAuthorityError('Execution landing V2 preparation ref digest mismatch');
  }
  return Object.freeze({ ...body, preparationRefDigest });
}

function v2CustodyBody(value: unknown): Omit<ExecutionLandingCustodyRefV2, 'custodyRefDigest'> {
  const record = v2ExactRecord(value, [
    'schemaVersion',
    'kind',
    'dispatchState',
    'preparationRef',
    'providerExecutionAttemptId',
    'providerExecutionAttemptIdentityDigest',
    'dispatchAuthorityReceiptDigest',
    'releaseReceiptRefDigest',
    'releaseEvidenceDigest',
    'releasedAt',
    'providerStartReceiptRefDigest',
    'providerStartEvidenceDigest',
    'providerStartAcceptedAt',
    'projectionFence',
    'resultSource',
    'landingArtifact',
  ], 'custodyRef');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-custody-ref'
    || record.dispatchState !== 'RELEASED'
  ) throw createExecutionAuthorityError('Execution landing V2 dispatch request identity is invalid');
  const preparationRef = snapshotExecutionLandingPreparationRefV2(record.preparationRef);
  const privateIdentity = preparationRef.privateIdentity;
  assertUuid(record.providerExecutionAttemptId, 'V2 providerExecutionAttemptId');
  if (record.providerExecutionAttemptId === privateIdentity.attemptId) {
    throw createExecutionAuthorityError('Execution landing V2 provider/public attempt identity must be separate');
  }
  for (const field of [
    'providerExecutionAttemptIdentityDigest',
    'dispatchAuthorityReceiptDigest',
    'releaseReceiptRefDigest',
    'releaseEvidenceDigest',
    'providerStartReceiptRefDigest',
    'providerStartEvidenceDigest',
    'projectionFence',
  ] as const) v2AssertDigest(record[field], `custodyRef.${field}`);
  assertIsoTime(record.releasedAt, 'V2 custodyRef.releasedAt');
  assertIsoTime(record.providerStartAcceptedAt, 'V2 custodyRef.providerStartAcceptedAt');
  if (
    Date.parse(record.releasedAt) < Date.parse(preparationRef.admittedAt)
    || Date.parse(record.providerStartAcceptedAt) < Date.parse(record.releasedAt)
  ) {
    throw createExecutionAuthorityError('Execution landing V2 admission/release/start order is invalid');
  }
  const resultSource = v2ResultSource(record.resultSource);
  const landingArtifact = v2LandingArtifact(record.landingArtifact);
  if (
    canonicalJson(resultSource.identity) !== canonicalJson(privateIdentity)
    || canonicalJson(landingArtifact.identity) !== canonicalJson(privateIdentity)
    || resultSource.admissionReceiptDigest !== preparationRef.admissionReceiptDigest
    || landingArtifact.admissionReceiptDigest !== preparationRef.admissionReceiptDigest
    || resultSource.policyDigest !== preparationRef.policyDigest
    || landingArtifact.policyDigest !== preparationRef.policyDigest
  ) throw createExecutionAuthorityError('Execution landing V2 artifact custody binding mismatch');
  if (
    Date.parse(resultSource.capturedAt) < Date.parse(record.providerStartAcceptedAt)
    ||
    Date.parse(landingArtifact.capturedAt) < Date.parse(resultSource.capturedAt)
    || Date.parse(landingArtifact.verifiedAt) < Date.parse(resultSource.capturedAt)
  ) {
    throw createExecutionAuthorityError('Execution landing V2 landing artifact precedes result capture');
  }
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-custody-ref',
    dispatchState: 'RELEASED',
    preparationRef,
    providerExecutionAttemptId: record.providerExecutionAttemptId,
    providerExecutionAttemptIdentityDigest: record.providerExecutionAttemptIdentityDigest as ExecutionLandingDigestV2,
    dispatchAuthorityReceiptDigest: record.dispatchAuthorityReceiptDigest as ExecutionLandingDigestV2,
    releaseReceiptRefDigest: record.releaseReceiptRefDigest as ExecutionLandingDigestV2,
    releaseEvidenceDigest: record.releaseEvidenceDigest as ExecutionLandingDigestV2,
    releasedAt: record.releasedAt,
    providerStartReceiptRefDigest: record.providerStartReceiptRefDigest as ExecutionLandingDigestV2,
    providerStartEvidenceDigest: record.providerStartEvidenceDigest as ExecutionLandingDigestV2,
    providerStartAcceptedAt: record.providerStartAcceptedAt,
    projectionFence: record.projectionFence as ExecutionLandingDigestV2,
    resultSource,
    landingArtifact,
  });
}

export function createExecutionLandingCustodyRefV2(
  input: CreateExecutionLandingCustodyRefV2Input,
): ExecutionLandingCustodyRefV2 {
  const inputRecord = v2ExactRecord(input, [
    'dispatchState', 'preparationRef', 'providerExecutionAttemptId',
    'providerExecutionAttemptIdentityDigest', 'dispatchAuthorityReceiptDigest',
    'releaseReceiptRefDigest', 'releaseEvidenceDigest', 'releasedAt',
    'providerStartReceiptRefDigest', 'providerStartEvidenceDigest', 'providerStartAcceptedAt',
    'projectionFence', 'resultSource',
    'landingArtifact',
  ], 'custodyRef input');
  const body = v2CustodyBody({
    schemaVersion: 2,
    kind: 'execution-landing-custody-ref',
    ...inputRecord,
  });
  return Object.freeze({
    ...body,
    custodyRefDigest: v2Digest('execution-landing-custody-ref-v2', body),
  });
}

function v2CustodyRef(value: unknown): ExecutionLandingCustodyRefV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion',
    'kind',
    'dispatchState',
    'preparationRef',
    'providerExecutionAttemptId',
    'providerExecutionAttemptIdentityDigest',
    'dispatchAuthorityReceiptDigest',
    'releaseReceiptRefDigest',
    'releaseEvidenceDigest',
    'releasedAt',
    'providerStartReceiptRefDigest',
    'providerStartEvidenceDigest',
    'providerStartAcceptedAt',
    'projectionFence',
    'resultSource',
    'landingArtifact',
    'custodyRefDigest',
  ], 'custodyRef');
  v2AssertDigest(record.custodyRefDigest, 'custodyRef.custodyRefDigest');
  const body = v2CustodyBody(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'custodyRefDigest'),
  ));
  const custodyRefDigest = v2Digest('execution-landing-custody-ref-v2', body);
  if (record.custodyRefDigest !== custodyRefDigest) {
    throw createExecutionAuthorityError('Execution landing V2 custody ref digest mismatch');
  }
  return Object.freeze({ ...body, custodyRefDigest });
}

export function assertExecutionLandingCustodyRefV2(
  value: unknown,
): asserts value is ExecutionLandingCustodyRefV2 {
  v2CustodyRef(value);
}

export function snapshotExecutionLandingCustodyRefV2(
  value: unknown,
): ExecutionLandingCustodyRefV2 {
  return v2CustodyRef(value);
}

function v2ContinuationDispatchBody(
  value: unknown,
): Omit<ExecutionContinuationDispatchRefV2, 'dispatchRefDigest'> {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'dispatchState', 'preparationRef', 'providerExecutionAttemptId',
    'providerExecutionAttemptIdentityDigest', 'dispatchAuthorityReceiptDigest',
    'releaseReceiptRefDigest', 'releaseEvidenceDigest', 'releasedAt',
    'providerStartReceiptRefDigest', 'providerStartEvidenceDigest', 'providerStartAcceptedAt',
    'projectionFence',
  ], 'continuationDispatchRef');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-continuation-dispatch-ref'
    || record.dispatchState !== 'RELEASED'
  ) throw createExecutionAuthorityError('Execution landing V2 continuation dispatch state/request is invalid');
  const preparationRef = snapshotExecutionLandingPreparationRefV2(record.preparationRef);
  const privateIdentity = preparationRef.privateIdentity;
  assertUuid(record.providerExecutionAttemptId, 'V2 continuation providerExecutionAttemptId');
  if (record.providerExecutionAttemptId === privateIdentity.attemptId) {
    throw createExecutionAuthorityError('Execution landing V2 continuation provider/public identity must be separate');
  }
  for (const field of [
    'providerExecutionAttemptIdentityDigest', 'dispatchAuthorityReceiptDigest',
    'releaseReceiptRefDigest', 'releaseEvidenceDigest', 'providerStartReceiptRefDigest',
    'providerStartEvidenceDigest', 'projectionFence',
  ] as const) v2AssertDigest(record[field], `continuationDispatchRef.${field}`);
  assertIsoTime(record.releasedAt, 'V2 continuationDispatchRef.releasedAt');
  assertIsoTime(record.providerStartAcceptedAt, 'V2 continuationDispatchRef.providerStartAcceptedAt');
  if (
    Date.parse(record.releasedAt) < Date.parse(preparationRef.admittedAt)
    || Date.parse(record.providerStartAcceptedAt) < Date.parse(record.releasedAt)
  ) {
    throw createExecutionAuthorityError('Execution landing V2 continuation admission/release/start order is invalid');
  }
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-continuation-dispatch-ref',
    dispatchState: 'RELEASED',
    preparationRef,
    providerExecutionAttemptId: record.providerExecutionAttemptId,
    providerExecutionAttemptIdentityDigest: record.providerExecutionAttemptIdentityDigest as ExecutionLandingDigestV2,
    dispatchAuthorityReceiptDigest: record.dispatchAuthorityReceiptDigest as ExecutionLandingDigestV2,
    releaseReceiptRefDigest: record.releaseReceiptRefDigest as ExecutionLandingDigestV2,
    releaseEvidenceDigest: record.releaseEvidenceDigest as ExecutionLandingDigestV2,
    releasedAt: record.releasedAt,
    providerStartReceiptRefDigest: record.providerStartReceiptRefDigest as ExecutionLandingDigestV2,
    providerStartEvidenceDigest: record.providerStartEvidenceDigest as ExecutionLandingDigestV2,
    providerStartAcceptedAt: record.providerStartAcceptedAt,
    projectionFence: record.projectionFence as ExecutionLandingDigestV2,
  });
}

export function createExecutionContinuationDispatchRefV2(
  input: CreateExecutionContinuationDispatchRefV2Input,
): ExecutionContinuationDispatchRefV2 {
  const inputRecord = v2ExactRecord(input, [
    'dispatchState', 'preparationRef', 'providerExecutionAttemptId',
    'providerExecutionAttemptIdentityDigest',
    'dispatchAuthorityReceiptDigest', 'releaseReceiptRefDigest', 'releaseEvidenceDigest',
    'releasedAt', 'providerStartReceiptRefDigest', 'providerStartEvidenceDigest',
    'providerStartAcceptedAt', 'projectionFence',
  ], 'continuationDispatchRef input');
  const body = v2ContinuationDispatchBody({
    schemaVersion: 2,
    kind: 'execution-continuation-dispatch-ref',
    ...inputRecord,
  });
  return Object.freeze({
    ...body,
    dispatchRefDigest: v2Digest('execution-continuation-dispatch-ref-v2', body),
  });
}

function v2ContinuationDispatchRef(value: unknown): ExecutionContinuationDispatchRefV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'dispatchState', 'preparationRef', 'providerExecutionAttemptId',
    'providerExecutionAttemptIdentityDigest', 'dispatchAuthorityReceiptDigest',
    'releaseReceiptRefDigest', 'releaseEvidenceDigest', 'releasedAt',
    'providerStartReceiptRefDigest', 'providerStartEvidenceDigest', 'providerStartAcceptedAt',
    'projectionFence', 'dispatchRefDigest',
  ], 'continuationDispatchRef');
  v2AssertDigest(record.dispatchRefDigest, 'continuationDispatchRef.dispatchRefDigest');
  const body = v2ContinuationDispatchBody(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'dispatchRefDigest'),
  ));
  const dispatchRefDigest = v2Digest('execution-continuation-dispatch-ref-v2', body);
  if (record.dispatchRefDigest !== dispatchRefDigest) {
    throw createExecutionAuthorityError('Execution landing V2 continuation dispatch ref mismatch');
  }
  return Object.freeze({ ...body, dispatchRefDigest });
}

function v2RefFromCustody(custodyRef: ExecutionLandingCustodyRefV2): ExecutionLandingCheckpointRefV2 {
  const privateIdentity = custodyRef.preparationRef.privateIdentity;
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-checkpoint-ref',
    projectRootSha256: privateIdentity.projectRootSha256,
    projectId: privateIdentity.projectId,
    taskId: privateIdentity.taskId,
    privateAttemptId: privateIdentity.attemptId,
    generation: privateIdentity.generation,
    providerExecutionAttemptId: custodyRef.providerExecutionAttemptId,
    custodyRefDigest: custodyRef.custodyRefDigest,
  });
}

export function createExecutionLandingCheckpointRefV2(
  projectRoot: string,
  custodyValue: ExecutionLandingCustodyRefV2,
): ExecutionLandingCheckpointRefV2 {
  const custodyRef = v2CustodyRef(custodyValue);
  const ref = v2RefFromCustody(custodyRef);
  assertExecutionLandingCheckpointRefV2(projectRoot, ref);
  return ref;
}

function v2Ref(value: unknown): ExecutionLandingCheckpointRefV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion',
    'kind',
    'projectRootSha256',
    'projectId',
    'taskId',
    'privateAttemptId',
    'generation',
    'providerExecutionAttemptId',
    'custodyRefDigest',
  ], 'checkpointRef');
  if (record.schemaVersion !== 2 || record.kind !== 'execution-landing-checkpoint-ref') {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint ref schema is invalid');
  }
  v2AssertRawDigest(record.projectRootSha256, 'checkpointRef.projectRootSha256');
  const projectIdValue = v2AuthorityKey(record.projectId, 'checkpointRef.projectId');
  const taskIdValue = v2AuthorityKey(record.taskId, 'checkpointRef.taskId');
  assertUuid(record.privateAttemptId, 'V2 checkpointRef.privateAttemptId');
  assertUuid(record.providerExecutionAttemptId, 'V2 checkpointRef.providerExecutionAttemptId');
  if (!Number.isSafeInteger(record.generation) || (record.generation as number) < 1) {
    throw createExecutionAuthorityError('Execution landing V2 checkpointRef.generation is invalid');
  }
  v2AssertDigest(record.custodyRefDigest, 'checkpointRef.custodyRefDigest');
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-checkpoint-ref',
    projectRootSha256: record.projectRootSha256,
    projectId: projectIdValue,
    taskId: taskIdValue,
    privateAttemptId: record.privateAttemptId,
    generation: record.generation as number,
    providerExecutionAttemptId: record.providerExecutionAttemptId,
    custodyRefDigest: record.custodyRefDigest,
  });
}

function sameRefV2(left: ExecutionLandingCheckpointRefV2, right: ExecutionLandingCheckpointRefV2): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function v2TaskDir(ref: ExecutionLandingCheckpointRefV2): string {
  return deckentPath(undefined, 'runtime', 'execution-landings-v2', ref.projectRootSha256,
    sha256(`${ref.projectId}\0${ref.taskId}`));
}

function v2AttemptDir(ref: ExecutionLandingCheckpointRefV2): string {
  return resolve(v2TaskDir(ref), 'attempts', ref.privateAttemptId, String(ref.generation));
}

export function executionLandingCheckpointPathV2(refValue: ExecutionLandingCheckpointRefV2): string {
  const ref = v2Ref(refValue);
  return resolve(v2AttemptDir(ref), 'checkpoint-v2.json');
}

export function executionAttemptRetirementPathV2(refValue: ExecutionLandingCheckpointRefV2): string {
  const ref = v2Ref(refValue);
  return resolve(v2AttemptDir(ref), 'retirement-v2.json');
}

export function executionContinuationClaimPathV2(refValue: ExecutionLandingCheckpointRefV2): string {
  const ref = v2Ref(refValue);
  return resolve(v2AttemptDir(ref), 'continuation-claim-v2.json');
}

export function executionLandingPreparationContextPathV2(
  preparationValue: ExecutionLandingPreparationRefV2,
): string {
  const preparationRef = snapshotExecutionLandingPreparationRefV2(preparationValue);
  const identity = preparationRef.privateIdentity;
  const taskAuthority = deckentPath(
    undefined,
    'runtime',
    'execution-landings-v2',
    identity.projectRootSha256,
    sha256(`${identity.projectId}\0${identity.taskId}`),
  );
  return resolve(
    taskAuthority,
    'attempts',
    identity.attemptId,
    String(identity.generation),
    'context-v2.json',
  );
}

function v2ContextPath(ref: ExecutionLandingCheckpointRefV2): string {
  return resolve(v2AttemptDir(ref), 'context-v2.json');
}

function v2DiskEvidencePath(ref: ExecutionLandingCheckpointRefV2): string {
  return resolve(v2AttemptDir(ref), 'disk-evidence-v2.json');
}

function requireDurableContextV2(
  projectRoot: string,
  checkpoint: ExecutionLandingCheckpointV2,
): void {
  const path = v2ContextPath(checkpoint.ref);
  if (!existsSync(path)) {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint requires durable context');
  }
  const envelope = v2ExactRecord(readJson(path), [
    'schemaVersion', 'kind', 'contextDigest', 'context',
  ], 'durable context envelope');
  if (
    envelope.schemaVersion !== 2
    || envelope.kind !== 'execution-landing-context-envelope'
  ) throw createExecutionAuthorityError(`Corrupt execution landing V2 context: ${path}`);
  v2AssertDigest(envelope.contextDigest, 'durable context.contextDigest');
  const contextRecord = v2ExactRecord(envelope.context, [
    'schemaVersion', 'kind', 'contextVersion', 'state', 'ref', 'preparationRef',
    'preparationPayload', 'baseline', 'preparedAt',
  ], 'durable context');
  if (
    contextRecord.schemaVersion !== 2
    || contextRecord.kind !== 'execution-landing-context'
    || contextRecord.contextVersion !== 2
    || contextRecord.state !== 'PREPARED'
  ) throw createExecutionAuthorityError(`Corrupt execution landing V2 context: ${path}`);
  assertIsoTime(contextRecord.preparedAt, 'V2 durable context.preparedAt');
  const contextRef = v2ExactRecord(contextRecord.ref, [
    'schemaVersion', 'kind', 'projectRootSha256', 'projectId', 'taskId',
    'privateAttemptId', 'generation', 'preparationRefDigest',
  ], 'durable context ref');
  const preparationRef = snapshotExecutionLandingPreparationRefV2(contextRecord.preparationRef);
  const preparationPayload = v2ExactRecord(contextRecord.preparationPayload, [
    'schemaVersion', 'kind', 'taskId', 'tenantId', 'originalRequestDigest',
    'taskDigest', 'taskSnapshotDigest', 'providerInvocationDigest', 'role', 'taskKind',
    'admissionMode', 'approvalEvidenceRef', 'identity', 'policyDigest', 'landingPolicy',
    'hardBudget', 'parentAttemptId', 'parentFence', 'parentCheckpointSha256',
    'attemptFence', 'scope', 'acceptanceCriteria', 'preparationPayloadDigest',
  ], 'durable preparation payload');
  const context = {
    schemaVersion: 2 as const,
    kind: 'execution-landing-context' as const,
    contextVersion: 2 as const,
    state: 'PREPARED' as const,
    ref: contextRef,
    preparationRef,
    preparationPayload,
    baseline: contextRecord.baseline,
    preparedAt: contextRecord.preparedAt,
  };
  if (
    contextRef.schemaVersion !== 2
    || contextRef.kind !== 'execution-landing-context-ref'
    || contextRef.projectRootSha256 !== checkpoint.ref.projectRootSha256
    || contextRef.projectId !== checkpoint.ref.projectId
    || contextRef.taskId !== checkpoint.ref.taskId
    || contextRef.privateAttemptId !== checkpoint.ref.privateAttemptId
    || contextRef.generation !== checkpoint.ref.generation
    || contextRef.preparationRefDigest !== preparationRef.preparationRefDigest
    || preparationRef.preparationRefDigest
      !== checkpoint.custodyRef.preparationRef.preparationRefDigest
    || preparationPayload.schemaVersion !== 2
    || preparationPayload.kind !== 'execution-landing-preparation-payload'
    || preparationPayload.taskId !== checkpoint.operationalPayload.taskId
    || preparationPayload.tenantId !== checkpoint.operationalPayload.tenantId
    || preparationPayload.originalRequestDigest !== checkpoint.operationalPayload.originalRequestDigest
    || preparationPayload.taskDigest !== checkpoint.operationalPayload.taskDigest
    || preparationPayload.taskSnapshotDigest !== preparationRef.taskSnapshotDigest
    || preparationPayload.providerInvocationDigest !== preparationRef.providerInvocationDigest
    || preparationPayload.role !== checkpoint.operationalPayload.role
    || preparationPayload.taskKind !== checkpoint.operationalPayload.taskKind
    || preparationPayload.admissionMode !== checkpoint.operationalPayload.admissionMode
    || preparationPayload.approvalEvidenceRef !== checkpoint.operationalPayload.approvalEvidenceRef
    || canonicalJson(preparationPayload.identity) !== canonicalJson(checkpoint.operationalPayload.identity)
    || preparationPayload.policyDigest !== checkpoint.operationalPayload.policyDigest
    || canonicalJson(preparationPayload.landingPolicy)
      !== canonicalJson(checkpoint.operationalPayload.landingPolicy)
    || canonicalJson(preparationPayload.hardBudget)
      !== canonicalJson(checkpoint.operationalPayload.hardBudget)
    || preparationPayload.parentAttemptId !== checkpoint.operationalPayload.parentAttemptId
    || preparationPayload.parentFence !== checkpoint.operationalPayload.parentFence
    || preparationPayload.parentCheckpointSha256
      !== checkpoint.operationalPayload.parentCheckpointSha256
    || preparationPayload.attemptFence !== checkpoint.operationalPayload.attemptFence
    || canonicalJson(preparationPayload.scope) !== canonicalJson(checkpoint.operationalPayload.scope)
    || preparationPayload.acceptanceCriteria !== checkpoint.operationalPayload.acceptanceCriteria
    || Date.parse(contextRecord.preparedAt)
      > Date.parse(checkpoint.custodyRef.releasedAt)
    || envelope.contextDigest !== checkpoint.contextDigest
    || envelope.contextDigest !== v2Digest('execution-landing-context-v2', context)
  ) throw createExecutionAuthorityError(`Corrupt execution landing V2 context: ${path}`);
  assertExecutionLandingCheckpointRefV2(projectRoot, checkpoint.ref);
}

function requireDurableDiskEvidenceV2(checkpoint: ExecutionLandingCheckpointV2): void {
  const path = v2DiskEvidencePath(checkpoint.ref);
  if (!existsSync(path)) {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint requires durable disk evidence');
  }
  const record = v2ExactRecord(readJson(path), [
    'schemaVersion', 'kind', 'state', 'ref', 'contextRef', 'preparationRef',
    'contextDigest', 'baseline', 'current', 'changedPaths', 'diffDigest',
    'capturedAt', 'evidenceDigest',
  ], 'durable disk evidence');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-disk-evidence'
    || record.state !== 'CAPTURED'
  ) throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
  const ref = v2Ref(record.ref);
  const contextRef = v2ExactRecord(record.contextRef, [
    'schemaVersion', 'kind', 'projectRootSha256', 'projectId', 'taskId',
    'privateAttemptId', 'generation', 'preparationRefDigest',
  ], 'durable disk evidence context ref');
  const preparationRef = snapshotExecutionLandingPreparationRefV2(record.preparationRef);
  v2AssertDigest(record.contextDigest, 'durable disk evidence.contextDigest');
  v2AssertDigest(record.diffDigest, 'durable disk evidence.diffDigest');
  v2AssertDigest(record.evidenceDigest, 'durable disk evidence.evidenceDigest');
  assertIsoTime(record.capturedAt, 'V2 durable disk evidence.capturedAt');
  if (
    !Array.isArray(record.changedPaths)
    || nodeUtilTypes.isProxy(record.changedPaths)
    || record.changedPaths.length > 100
    || Reflect.ownKeys(record.changedPaths).length !== record.changedPaths.length + 1
  ) throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
  const snapshot = (value: unknown, field: string) => {
    const candidate = v2ExactRecord(value, ['entries', 'snapshotSha256'], field);
    v2AssertRawDigest(candidate.snapshotSha256, `${field}.snapshotSha256`);
    if (
      !Array.isArray(candidate.entries)
      || nodeUtilTypes.isProxy(candidate.entries)
      || candidate.entries.length > 100
      || Reflect.ownKeys(candidate.entries).length !== candidate.entries.length + 1
    ) throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
    const entries: Array<Record<string, unknown>> = [];
    for (let index = 0; index < candidate.entries.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate.entries, String(index));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
      }
      const entry = v2ExactRecord(
        descriptor.value,
        ['path', 'kind', 'sha256', 'size'],
        `${field}.entries[${index}]`,
      );
      if (
        typeof entry.path !== 'string'
        || entry.path.length < 1
        || entry.path.length > 500
        || isAbsolute(entry.path)
        || win32.isAbsolute(entry.path)
        || entry.path.split(/[\\/]+/u).includes('..')
        || !['absent', 'file', 'directory', 'symlink', 'other'].includes(entry.kind as string)
        || (entry.sha256 !== null && (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)))
        || (entry.size !== null && (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0))
      ) throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
      if (
        entry.kind === 'absent'
          ? entry.sha256 !== null || entry.size !== null
          : entry.kind === 'file' || entry.kind === 'symlink'
            ? entry.sha256 === null || entry.size === null
            : entry.sha256 !== null
      ) throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
      entries.push(entry);
    }
    if (
      new Set(entries.map(entry => entry.path)).size !== entries.length
      || candidate.snapshotSha256 !== sha256(canonicalJson(entries))
    ) throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
    return { entries, snapshotSha256: candidate.snapshotSha256 };
  };
  const baseline = snapshot(record.baseline, 'durable disk evidence baseline');
  const current = snapshot(record.current, 'durable disk evidence current');
  const changedPaths: string[] = [];
  for (let index = 0; index < record.changedPaths.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(record.changedPaths, String(index));
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') {
      throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
    }
    changedPaths.push(descriptor.value);
  }
  const baselineByPath = new Map(baseline.entries.map(entry => [entry.path, entry]));
  const currentByPath = new Map(current.entries.map(entry => [entry.path, entry]));
  const derivedChangedPaths = [...new Set([...baselineByPath.keys(), ...currentByPath.keys()])]
    .filter(candidate => canonicalJson(baselineByPath.get(candidate) ?? null)
      !== canonicalJson(currentByPath.get(candidate) ?? null))
    .sort((left, right) => String(left).localeCompare(String(right)));
  const derivedDiffDigest = `sha256:${sha256(canonicalJson({
    baselineSha256: baseline.snapshotSha256,
    currentSha256: current.snapshotSha256,
    changedPaths: derivedChangedPaths,
  }))}`;
  const body = {
    schemaVersion: 2 as const,
    kind: 'execution-landing-disk-evidence' as const,
    state: 'CAPTURED' as const,
    ref,
    contextRef,
    preparationRef,
    contextDigest: record.contextDigest,
    baseline,
    current,
    changedPaths,
    diffDigest: record.diffDigest,
    capturedAt: record.capturedAt,
  };
  if (
    !sameRefV2(ref, checkpoint.ref)
    || contextRef.schemaVersion !== 2
    || contextRef.kind !== 'execution-landing-context-ref'
    || contextRef.projectRootSha256 !== ref.projectRootSha256
    || contextRef.projectId !== ref.projectId
    || contextRef.taskId !== ref.taskId
    || contextRef.privateAttemptId !== ref.privateAttemptId
    || contextRef.generation !== ref.generation
    || contextRef.preparationRefDigest !== preparationRef.preparationRefDigest
    || preparationRef.preparationRefDigest
      !== checkpoint.custodyRef.preparationRef.preparationRefDigest
    || record.contextDigest !== checkpoint.contextDigest
    || record.evidenceDigest !== checkpoint.diskEvidenceDigest
    || canonicalJson(changedPaths) !== canonicalJson(derivedChangedPaths)
    || record.diffDigest !== derivedDiffDigest
    || record.evidenceDigest !== v2Digest('execution-landing-disk-evidence-v2', body)
    || Date.parse(record.capturedAt)
      < Date.parse(checkpoint.custodyRef.landingArtifact.verifiedAt)
    || Date.parse(record.capturedAt) > Date.parse(checkpoint.landedAt)
  ) throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
}

export function assertExecutionLandingCheckpointRefV2(
  projectRoot: string,
  refValue: ExecutionLandingCheckpointRefV2,
): void {
  const ref = v2Ref(refValue);
  if (ref.projectRootSha256 !== projectId(projectRoot)) {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint ref project authority mismatch');
  }
  const root = canonicalProjectRoot(projectRoot);
  const authority = canonicalPathWithMissingLeaf(v2AttemptDir(ref));
  const rel = relative(root, authority);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw createExecutionAuthorityError('Execution landing V2 authority must be outside the worker project');
  }
}

function v2CheckpointEnvelope(
  projectRoot: string,
  value: unknown,
): ExecutionLandingCheckpointEnvelopeV2 {
  const envelope = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'checkpointDigest', 'checkpoint',
  ], 'checkpointEnvelope');
  if (envelope.schemaVersion !== 2 || envelope.kind !== 'execution-landing-checkpoint-envelope') {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint envelope schema is invalid');
  }
  v2AssertDigest(envelope.checkpointDigest, 'checkpointDigest');
  const checkpointRecord = v2ExactRecord(envelope.checkpoint, [
    'schemaVersion', 'kind', 'state', 'ref', 'custodyRef', 'operationalPayload',
    'contextDigest', 'diskEvidenceDigest', 'landedAt',
  ], 'checkpoint');
  if (
    checkpointRecord.schemaVersion !== 2
    || checkpointRecord.kind !== 'execution-landing-checkpoint'
    || checkpointRecord.state !== 'LANDED'
  ) throw createExecutionAuthorityError('Execution landing V2 checkpoint schema/state is invalid');
  const ref = v2Ref(checkpointRecord.ref);
  const custodyRef = v2CustodyRef(checkpointRecord.custodyRef);
  const operationalPayload = snapshotExecutionLandingOperationalPayloadV2(
    projectRoot,
    checkpointRecord.operationalPayload,
  );
  if (!sameRefV2(ref, v2RefFromCustody(custodyRef))) {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint/custody identity mismatch');
  }
  v2AssertDigest(checkpointRecord.contextDigest, 'checkpoint.contextDigest');
  v2AssertDigest(checkpointRecord.diskEvidenceDigest, 'checkpoint.diskEvidenceDigest');
  assertIsoTime(checkpointRecord.landedAt, 'V2 checkpoint.landedAt');
  if (Date.parse(checkpointRecord.landedAt) < Date.parse(custodyRef.landingArtifact.verifiedAt)) {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint precedes landing verification');
  }
  if (
    operationalPayload.taskId !== custodyRef.preparationRef.privateIdentity.taskId
    || operationalPayload.providerExecutionAttemptId !== custodyRef.providerExecutionAttemptId
    || `sha256:${operationalPayload.policyDigest}` !== custodyRef.preparationRef.policyDigest
    || operationalPayload.diskEvidenceDigest !== checkpointRecord.diskEvidenceDigest
    || operationalPayload.landedAt !== checkpointRecord.landedAt
  ) {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint authority binding mismatch');
  }
  const checkpoint: ExecutionLandingCheckpointV2 = Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-checkpoint',
    state: 'LANDED',
    ref,
    custodyRef,
    operationalPayload,
    contextDigest: checkpointRecord.contextDigest,
    diskEvidenceDigest: checkpointRecord.diskEvidenceDigest,
    landedAt: checkpointRecord.landedAt,
  });
  const checkpointDigest = v2Digest('execution-landing-checkpoint-v2', checkpoint);
  if (envelope.checkpointDigest !== checkpointDigest) {
    throw createExecutionAuthorityError('Execution landing V2 checkpoint digest mismatch');
  }
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-checkpoint-envelope',
    checkpointDigest,
    checkpoint,
  });
}

export function createExecutionLandingCheckpointV2(
  projectRoot: string,
  inputValue: {
    readonly custodyRef: ExecutionLandingCustodyRefV2;
    readonly operationalPayload: ExecutionLandingOperationalPayloadV2;
    readonly contextDigest: ExecutionLandingDigestV2;
    readonly diskEvidenceDigest: ExecutionLandingDigestV2;
    readonly landedAt: string;
  },
): ExecutionLandingCheckpointEnvelopeV2 {
  const input = v2ExactRecord(inputValue, [
    'custodyRef', 'operationalPayload', 'contextDigest', 'diskEvidenceDigest', 'landedAt',
  ], 'checkpoint input');
  const custodyRef = v2CustodyRef(input.custodyRef);
  const ref = v2RefFromCustody(custodyRef);
  assertExecutionLandingCheckpointRefV2(projectRoot, ref);
  const operationalPayload = snapshotExecutionLandingOperationalPayloadV2(
    projectRoot,
    input.operationalPayload,
  );
  v2AssertDigest(input.contextDigest, 'checkpoint.contextDigest');
  v2AssertDigest(input.diskEvidenceDigest, 'checkpoint.diskEvidenceDigest');
  assertIsoTime(input.landedAt, 'V2 checkpoint.landedAt');
  const checkpoint: ExecutionLandingCheckpointV2 = Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-checkpoint',
    state: 'LANDED',
    ref,
    custodyRef,
    operationalPayload,
    contextDigest: input.contextDigest,
    diskEvidenceDigest: input.diskEvidenceDigest,
    landedAt: input.landedAt,
  });
  return v2CheckpointEnvelope(projectRoot, {
    schemaVersion: 2,
    kind: 'execution-landing-checkpoint-envelope',
    checkpointDigest: v2Digest('execution-landing-checkpoint-v2', checkpoint),
    checkpoint,
  });
}

export function writeExecutionLandingCheckpointAtomicV2(
  projectRoot: string,
  envelopeValue: ExecutionLandingCheckpointEnvelopeV2,
): void {
  const envelope = v2CheckpointEnvelope(projectRoot, envelopeValue);
  assertExecutionLandingCheckpointRefV2(projectRoot, envelope.checkpoint.ref);
  requireDurableContextV2(projectRoot, envelope.checkpoint);
  requireDurableDiskEvidenceV2(envelope.checkpoint);
  publishJsonFirstWriter(
    executionLandingCheckpointPathV2(envelope.checkpoint.ref),
    envelope,
    existing => {
      try {
        return v2CheckpointEnvelope(projectRoot, existing).checkpointDigest === envelope.checkpointDigest;
      } catch { return false; }
    },
  );
}

export function readExecutionLandingCheckpointV2(
  projectRoot: string,
  refValue: ExecutionLandingCheckpointRefV2,
): ExecutionLandingCheckpointEnvelopeV2 | null {
  const ref = v2Ref(refValue);
  assertExecutionLandingCheckpointRefV2(projectRoot, ref);
  const path = executionLandingCheckpointPathV2(ref);
  if (!existsSync(path)) return null;
  const envelope = v2CheckpointEnvelope(projectRoot, readJson(path));
  if (!sameRefV2(envelope.checkpoint.ref, ref)) {
    throw createExecutionAuthorityError(`Corrupt execution landing V2 checkpoint: ${path}`);
  }
  requireDurableContextV2(projectRoot, envelope.checkpoint);
  requireDurableDiskEvidenceV2(envelope.checkpoint);
  return envelope;
}

function v2Retirement(value: unknown): ExecutionAttemptRetirementV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'state', 'ref', 'checkpointDigest', 'runtimeDisposition',
    'resourcesReleased', 'evidenceDigests', 'retiredAt', 'receiptDigest',
  ], 'retirement');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-attempt-retirement'
    || record.state !== 'RETIRED'
    || !['cooperatively-exited', 'checkpointed-process-exited', 'stopped-removed']
      .includes(record.runtimeDisposition as string)
    || record.resourcesReleased !== true
  ) throw createExecutionAuthorityError('Execution landing V2 retirement is invalid');
  const ref = v2Ref(record.ref);
  const evidenceDigests = v2DigestList(record.evidenceDigests, 'retirement.evidenceDigests');
  v2AssertDigest(record.checkpointDigest, 'retirement.checkpointDigest');
  v2AssertDigest(record.receiptDigest, 'retirement.receiptDigest');
  assertIsoTime(record.retiredAt, 'V2 retirement.retiredAt');
  const body = {
    schemaVersion: 2 as const,
    kind: 'execution-attempt-retirement' as const,
    state: 'RETIRED' as const,
    ref,
    checkpointDigest: record.checkpointDigest,
    runtimeDisposition: record.runtimeDisposition as ExecutionAttemptRuntimeDisposition,
    resourcesReleased: true as const,
    evidenceDigests,
    retiredAt: record.retiredAt,
  };
  const receiptDigest = v2Digest('execution-attempt-retirement-v2', body);
  if (record.receiptDigest !== receiptDigest) {
    throw createExecutionAuthorityError('Execution landing V2 retirement receipt mismatch');
  }
  return Object.freeze({ ...body, receiptDigest });
}

export function writeExecutionAttemptRetirementAtomicV2(
  projectRoot: string,
  refValue: ExecutionLandingCheckpointRefV2,
  inputValue: {
    readonly checkpointDigest: ExecutionLandingDigestV2;
    readonly runtimeDisposition: ExecutionAttemptRuntimeDisposition;
    readonly resourcesReleased: true;
    readonly evidenceDigests: readonly ExecutionLandingDigestV2[];
    readonly retiredAt: string;
  },
): ExecutionAttemptRetirementV2 {
  const ref = v2Ref(refValue);
  const input = v2ExactRecord(inputValue, [
    'checkpointDigest', 'runtimeDisposition', 'resourcesReleased', 'evidenceDigests', 'retiredAt',
  ], 'retirement input');
  const checkpoint = readExecutionLandingCheckpointV2(projectRoot, ref);
  if (!checkpoint || checkpoint.checkpointDigest !== input.checkpointDigest) {
    throw createExecutionAuthorityError('Execution landing V2 retirement requires its exact checkpoint');
  }
  const body = {
    schemaVersion: 2,
    kind: 'execution-attempt-retirement',
    state: 'RETIRED',
    ref,
    checkpointDigest: input.checkpointDigest,
    runtimeDisposition: input.runtimeDisposition,
    resourcesReleased: input.resourcesReleased,
    evidenceDigests: input.evidenceDigests,
    retiredAt: input.retiredAt,
  };
  const retirement = v2Retirement({
    ...body,
    receiptDigest: v2Digest('execution-attempt-retirement-v2', body),
  });
  if (Date.parse(retirement.retiredAt) < Date.parse(checkpoint.checkpoint.landedAt)) {
    throw createExecutionAuthorityError('Execution landing V2 retirement precedes checkpoint');
  }
  publishJsonFirstWriter(
    executionAttemptRetirementPathV2(ref),
    retirement,
    existing => {
      try { return v2Retirement(existing).receiptDigest === retirement.receiptDigest; }
      catch { return false; }
    },
  );
  return readExecutionAttemptRetirementV2(projectRoot, ref) ?? retirement;
}

export function readExecutionAttemptRetirementV2(
  projectRoot: string,
  refValue: ExecutionLandingCheckpointRefV2,
): ExecutionAttemptRetirementV2 | null {
  const ref = v2Ref(refValue);
  const checkpoint = readExecutionLandingCheckpointV2(projectRoot, ref);
  if (!checkpoint) throw createExecutionAuthorityError('Execution landing V2 checkpoint is absent');
  const path = executionAttemptRetirementPathV2(ref);
  if (!existsSync(path)) return null;
  const retirement = v2Retirement(readJson(path));
  if (!sameRefV2(retirement.ref, ref) || retirement.checkpointDigest !== checkpoint.checkpointDigest) {
    throw createExecutionAuthorityError(`Corrupt execution landing V2 retirement: ${path}`);
  }
  return retirement;
}

function v2ContinuationClaim(value: unknown): ExecutionContinuationClaimV2 {
  const record = v2ExactRecord(value, [
    'schemaVersion', 'kind', 'state', 'predecessorRef', 'checkpointDigest',
    'retirementReceiptDigest', 'continuationDispatchRef',
    'claimedAt', 'receiptDigest',
  ], 'continuation claim');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-continuation-claim'
    || record.state !== 'CONTINUATION_CLAIMED'
  ) throw createExecutionAuthorityError('Execution landing V2 continuation claim schema is invalid');
  const predecessorRef = v2Ref(record.predecessorRef);
  v2AssertDigest(record.checkpointDigest, 'continuation.checkpointDigest');
  v2AssertDigest(record.retirementReceiptDigest, 'continuation.retirementReceiptDigest');
  const continuationDispatchRef = v2ContinuationDispatchRef(record.continuationDispatchRef);
  const continuationIdentity = continuationDispatchRef.preparationRef.privateIdentity;
  if (
    continuationIdentity.projectRootSha256 !== predecessorRef.projectRootSha256
    || continuationIdentity.projectId !== predecessorRef.projectId
    || continuationIdentity.taskId !== predecessorRef.taskId
    || continuationIdentity.attemptId !== predecessorRef.privateAttemptId
    || continuationIdentity.generation !== predecessorRef.generation + 1
    || continuationDispatchRef.providerExecutionAttemptId
      === predecessorRef.providerExecutionAttemptId
  ) throw createExecutionAuthorityError('Execution landing V2 continuation identity/generation is invalid');
  v2AssertDigest(record.receiptDigest, 'continuation.receiptDigest');
  assertIsoTime(record.claimedAt, 'V2 continuation.claimedAt');
  if (Date.parse(record.claimedAt) < Date.parse(continuationDispatchRef.providerStartAcceptedAt)) {
    throw createExecutionAuthorityError('Execution landing V2 continuation claim precedes provider start');
  }
  const body = {
    schemaVersion: 2 as const,
    kind: 'execution-continuation-claim' as const,
    state: 'CONTINUATION_CLAIMED' as const,
    predecessorRef,
    checkpointDigest: record.checkpointDigest,
    retirementReceiptDigest: record.retirementReceiptDigest,
    continuationDispatchRef,
    claimedAt: record.claimedAt,
  };
  const receiptDigest = v2Digest('execution-continuation-claim-v2', body);
  if (record.receiptDigest !== receiptDigest) {
    throw createExecutionAuthorityError('Execution landing V2 continuation receipt mismatch');
  }
  return Object.freeze({ ...body, receiptDigest });
}

export function claimExecutionContinuationAtomicV2(
  projectRoot: string,
  refValue: ExecutionLandingCheckpointRefV2,
  inputValue: {
    readonly checkpointDigest: ExecutionLandingDigestV2;
    readonly retirementReceiptDigest: ExecutionLandingDigestV2;
    readonly continuationDispatchRef: ExecutionContinuationDispatchRefV2;
    readonly claimedAt: string;
  },
): ExecutionContinuationClaimV2 {
  const ref = v2Ref(refValue);
  const input = v2ExactRecord(inputValue, [
    'checkpointDigest', 'retirementReceiptDigest', 'continuationDispatchRef', 'claimedAt',
  ], 'continuation input');
  const checkpoint = readExecutionLandingCheckpointV2(projectRoot, ref);
  const retirement = readExecutionAttemptRetirementV2(projectRoot, ref);
  if (
    !checkpoint
    || checkpoint.checkpointDigest !== input.checkpointDigest
    || !retirement
    || retirement.receiptDigest !== input.retirementReceiptDigest
  ) throw createExecutionAuthorityError('Execution landing V2 continuation requires exact retired authority');
  const continuationDispatchRef = v2ContinuationDispatchRef(input.continuationDispatchRef);
  if (
    Date.parse(continuationDispatchRef.releasedAt) < Date.parse(retirement.retiredAt)
    || Date.parse(continuationDispatchRef.providerStartAcceptedAt) < Date.parse(retirement.retiredAt)
  ) throw createExecutionAuthorityError('Execution landing V2 continuation dispatch precedes predecessor retirement');
  if (
    continuationDispatchRef.preparationRef.dispatchRequestId
      === checkpoint.checkpoint.custodyRef.preparationRef.dispatchRequestId
  ) throw createExecutionAuthorityError('Execution landing V2 continuation requires a new dispatch request');
  const body = {
    schemaVersion: 2,
    kind: 'execution-continuation-claim',
    state: 'CONTINUATION_CLAIMED',
    predecessorRef: ref,
    checkpointDigest: input.checkpointDigest,
    retirementReceiptDigest: input.retirementReceiptDigest,
    continuationDispatchRef,
    claimedAt: input.claimedAt,
  };
  const claim = v2ContinuationClaim({
    ...body,
    receiptDigest: v2Digest('execution-continuation-claim-v2', body),
  });
  if (Date.parse(claim.claimedAt) < Date.parse(retirement.retiredAt)) {
    throw createExecutionAuthorityError('Execution landing V2 continuation precedes retirement');
  }
  publishJsonFirstWriter(
    executionContinuationClaimPathV2(ref),
    claim,
    existing => {
      try { return v2ContinuationClaim(existing).receiptDigest === claim.receiptDigest; }
      catch { return false; }
    },
  );
  return readExecutionContinuationClaimV2(projectRoot, ref) ?? claim;
}

export function readExecutionContinuationClaimV2(
  projectRoot: string,
  refValue: ExecutionLandingCheckpointRefV2,
): ExecutionContinuationClaimV2 | null {
  const ref = v2Ref(refValue);
  const checkpoint = readExecutionLandingCheckpointV2(projectRoot, ref);
  const retirement = readExecutionAttemptRetirementV2(projectRoot, ref);
  if (!checkpoint || !retirement) {
    throw createExecutionAuthorityError('Execution landing V2 continuation predecessor is incomplete');
  }
  const path = executionContinuationClaimPathV2(ref);
  if (!existsSync(path)) return null;
  const claim = v2ContinuationClaim(readJson(path));
  if (
    !sameRefV2(claim.predecessorRef, ref)
    || claim.checkpointDigest !== checkpoint.checkpointDigest
    || claim.retirementReceiptDigest !== retirement.receiptDigest
    || Date.parse(claim.continuationDispatchRef.releasedAt) < Date.parse(retirement.retiredAt)
    || Date.parse(claim.continuationDispatchRef.providerStartAcceptedAt)
      < Date.parse(retirement.retiredAt)
    || claim.continuationDispatchRef.preparationRef.dispatchRequestId
      === checkpoint.checkpoint.custodyRef.preparationRef.dispatchRequestId
  ) throw createExecutionAuthorityError(`Corrupt execution landing V2 continuation claim: ${path}`);
  return claim;
}
