import { createHash } from 'node:crypto';

import { canonicalJson } from './audit-writer.js';
import type { ExecutionLandingPolicyConfig } from './config-types.js';
import type { ExecutionAdmissionMode } from './execution-admission.js';
import {
  assertExecutionLandingPolicyConfig,
} from './execution-budget-policy.js';
import type {
  InvocationAuthMode,
  InvocationExecutionBackend,
  InvocationTransport,
} from './invocation-receipt.js';
import {
  createExecutionAdmissionError,
  createExecutionAuthorityError,
} from './errors.js';
import {
  assertCanonicalModelApiId,
  assertCanonicalProviderId,
  assertOpaqueEvidenceRef,
  assertOpaqueSha256,
} from './provider-truth.js';
import type { TaskResultSettlementRefV1 } from './task-result-settlement.js';
import type { ExecutionBudget } from './work-model.js';
import type { CrossVerifyOperationClass } from './cross-verify-prompt.js';
import { CROSS_VERIFY_ADJUDICATION_PROTOCOL } from './cross-verify-adjudication.js';

export const CROSS_VERIFY_EXECUTION_CONTRACT_SCHEMA_VERSION = 1 as const;
export const CROSS_VERIFY_EXECUTION_CONTRACT_V2_SCHEMA_VERSION = 2 as const;

export interface CrossVerifyEnforcedAttemptContractInputV1 {
  readonly tenantId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly verifierTaskId: string;
  readonly callId: string;
  readonly attemptId: string;
  readonly fenceTokenHash: string;
  readonly operationClass: CrossVerifyOperationClass;
  readonly basePromptSha256: string;
  readonly dispatchedPromptSha256: string;
  readonly taskSnapshotSha256: string;
  readonly budget: Readonly<ExecutionBudget>;
  readonly budgetFingerprint: string;
  readonly budgetProfileRef: string;
  readonly budgetPolicyDigest: string;
  readonly landingPolicy: Readonly<ExecutionLandingPolicyConfig>;
  readonly attendanceMode: ExecutionAdmissionMode;
  readonly provider: string;
  readonly model: string;
  readonly authMode: InvocationAuthMode;
  readonly accountRefHash: string | null;
  readonly transport: InvocationTransport;
  readonly executionBackend: InvocationExecutionBackend;
  readonly endpointRefHash: string | null;
  readonly executionProfileRef: string;
  readonly providerLimitEstimates: readonly {
    readonly windowId: string;
    readonly unit: 'percent' | 'requests' | 'tokens' | 'credits' | 'usd';
    readonly amount: number;
  }[];
  readonly timeoutMs: number;
  readonly modelEffort: string;
  readonly toolProfileDigest: string;
  readonly isolatedContext: boolean;
  readonly settlementAttemptRef: Readonly<TaskResultSettlementRefV1>;
}

export interface CrossVerifyEnforcedAttemptContractV1
  extends CrossVerifyEnforcedAttemptContractInputV1 {
  readonly schemaVersion: typeof CROSS_VERIFY_EXECUTION_CONTRACT_SCHEMA_VERSION;
  readonly contractSha256: string;
  readonly evidenceRef: string;
}

/**
 * Immutable semantic-evidence binding for XVerify v2.
 *
 * Runtime identity and resource authority stay in the v1 base contract. This
 * extension binds that exact attempt to one typed claim, one host-captured
 * evidence snapshot, one finite prompt, and an attempt-private output channel.
 */
export interface CrossVerifyAdjudicationExecutionBindingV2 {
  readonly protocol: typeof CROSS_VERIFY_ADJUDICATION_PROTOCOL;
  readonly claimDigest: string;
  readonly evidenceManifestDigest: string;
  readonly adjudicationContractDigest: string;
  readonly evidenceBrokerRef: string;
  readonly evidenceBrokerManifestSha256: string;
  readonly evidenceMountPath: '/deckent/xverify-evidence';
  readonly evidenceManifestRelativePath: 'manifest.json';
  /** Immutable Docker image ID (`sha256:<64hex>`) used for the actual run. */
  readonly runtimeImageRef: string;
  readonly finalPromptDigest: string;
  readonly finalPromptChars: number;
  readonly maxPromptChars: number;
  readonly maxEvidenceOutputChars: number;
  readonly maxRationaleChars: number;
  readonly evidenceAccess: 'snapshot-read-only';
  readonly artifactMutationPolicy: 'attempt-private-output-only';
}

export interface CrossVerifyEnforcedAttemptContractInputV2
  extends CrossVerifyEnforcedAttemptContractInputV1 {
  readonly adjudication: Readonly<CrossVerifyAdjudicationExecutionBindingV2>;
}

export interface CrossVerifyEnforcedAttemptContractV2
  extends CrossVerifyEnforcedAttemptContractInputV2 {
  readonly schemaVersion: typeof CROSS_VERIFY_EXECUTION_CONTRACT_V2_SCHEMA_VERSION;
  readonly contractSha256: string;
  readonly evidenceRef: string;
}

export type CrossVerifyEnforcedAttemptContract =
  | CrossVerifyEnforcedAttemptContractV1
  | CrossVerifyEnforcedAttemptContractV2;

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
const AUTH_MODES = new Set<InvocationAuthMode>([
  'subscription',
  'api',
  'hybrid',
  'local',
  'unknown',
]);
const TRANSPORTS = new Set<InvocationTransport>(['cli', 'api', 'http', 'local-runtime']);
const BACKENDS = new Set<InvocationExecutionBackend>([
  'host-subprocess',
  'docker',
  'tmux',
  'api',
  'in-process',
  'unknown',
]);
const OPERATIONS = new Set<CrossVerifyOperationClass>([
  'verify-implementation',
  'adjudicate-claim',
]);
const LIMIT_UNITS = new Set(['percent', 'requests', 'tokens', 'credits', 'usd']);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u;
const INPUT_FIELDS = new Set<keyof CrossVerifyEnforcedAttemptContractInputV1>([
  'tenantId',
  'projectId',
  'runId',
  'taskId',
  'verifierTaskId',
  'callId',
  'attemptId',
  'fenceTokenHash',
  'operationClass',
  'basePromptSha256',
  'dispatchedPromptSha256',
  'taskSnapshotSha256',
  'budget',
  'budgetFingerprint',
  'budgetProfileRef',
  'budgetPolicyDigest',
  'landingPolicy',
  'attendanceMode',
  'provider',
  'model',
  'authMode',
  'accountRefHash',
  'transport',
  'executionBackend',
  'endpointRefHash',
  'executionProfileRef',
  'providerLimitEstimates',
  'timeoutMs',
  'modelEffort',
  'toolProfileDigest',
  'isolatedContext',
  'settlementAttemptRef',
]);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertIdentity(name: string, value: string): void {
  if (!ID_PATTERN.test(value)) {
    throw createExecutionAdmissionError(`${name} is not a canonical identifier`);
  }
}

function assertBudget(value: Readonly<ExecutionBudget>): void {
  const entries = Object.entries(value) as Array<[keyof ExecutionBudget, number]>;
  if (entries.length === 0) {
    throw createExecutionAdmissionError(
      'xverify execution contract requires an explicit auditor budget',
    );
  }
  for (const [field, ceiling] of entries) {
    if (!BUDGET_FIELDS.has(field)
      || !Number.isFinite(ceiling)
      || ceiling < 0
      || (field === 'maxTurns' && !Number.isSafeInteger(ceiling))) {
      throw createExecutionAdmissionError(
        `xverify execution contract budget.${field} is invalid`,
      );
    }
  }
}

function assertSettlementRef(
  ref: Readonly<TaskResultSettlementRefV1>,
  input: CrossVerifyEnforcedAttemptContractInputV1,
): void {
  if (ref.schemaVersion !== 1
    || ref.backend !== 'docker'
    || ref.taskId !== input.verifierTaskId
    || ref.attemptId !== input.attemptId) {
    throw createExecutionAuthorityError(
      'xverify settlement attempt does not match the exact verifier identity',
    );
  }
  assertOpaqueSha256('xverify settlement projectRootSha256', ref.projectRootSha256, true);
}

function assertInput(input: CrossVerifyEnforcedAttemptContractInputV1): void {
  for (const field of Object.keys(input) as Array<keyof CrossVerifyEnforcedAttemptContractInputV1>) {
    if (!INPUT_FIELDS.has(field)) {
      throw createExecutionAdmissionError(
        `Unknown xverify execution contract field: ${String(field)}`,
      );
    }
  }
  for (const [name, value] of [
    ['tenantId', input.tenantId],
    ['projectId', input.projectId],
    ['runId', input.runId],
    ['taskId', input.taskId],
    ['verifierTaskId', input.verifierTaskId],
    ['callId', input.callId],
    ['attemptId', input.attemptId],
    ['modelEffort', input.modelEffort],
  ] as const) {
    assertIdentity(name, value);
  }
  assertCanonicalProviderId(input.provider);
  assertCanonicalModelApiId(input.model);
  assertOpaqueSha256('xverify fenceTokenHash', input.fenceTokenHash, true);
  assertOpaqueSha256('xverify basePromptSha256', input.basePromptSha256, true);
  assertOpaqueSha256('xverify dispatchedPromptSha256', input.dispatchedPromptSha256, true);
  assertOpaqueSha256('xverify taskSnapshotSha256', input.taskSnapshotSha256, true);
  assertOpaqueSha256('xverify budgetFingerprint', input.budgetFingerprint, true);
  assertOpaqueSha256('xverify budgetPolicyDigest', input.budgetPolicyDigest, true);
  assertOpaqueSha256('xverify toolProfileDigest', input.toolProfileDigest, true);
  assertOpaqueSha256(
    'xverify accountRefHash',
    input.accountRefHash,
    input.authMode !== 'local',
  );
  assertOpaqueSha256('xverify endpointRefHash', input.endpointRefHash, false);
  assertOpaqueEvidenceRef('xverify budgetProfileRef', input.budgetProfileRef, true);
  assertOpaqueEvidenceRef('xverify executionProfileRef', input.executionProfileRef, true);
  if (!OPERATIONS.has(input.operationClass)) {
    throw createExecutionAdmissionError('Unsupported xverify operation class');
  }
  if (!AUTH_MODES.has(input.authMode)) {
    throw createExecutionAdmissionError('Unsupported xverify auth mode');
  }
  if (!TRANSPORTS.has(input.transport)) {
    throw createExecutionAdmissionError('Unsupported xverify transport');
  }
  if (!BACKENDS.has(input.executionBackend)
    || input.executionBackend === 'unknown') {
    throw createExecutionAdmissionError('Unsupported xverify execution backend');
  }
  if (input.attendanceMode !== 'attended' && input.attendanceMode !== 'unattended') {
    throw createExecutionAdmissionError('Unsupported xverify attendance mode');
  }
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw createExecutionAdmissionError('xverify timeoutMs must be a positive integer');
  }
  assertBudget(input.budget);
  assertExecutionLandingPolicyConfig(input.landingPolicy, 'xverify execution contract landing');
  if (input.providerLimitEstimates.length === 0) {
    throw createExecutionAdmissionError(
      'xverify execution contract requires provider-limit estimates',
    );
  }
  const windows = new Set<string>();
  for (const estimate of input.providerLimitEstimates) {
    assertIdentity('provider-limit windowId', estimate.windowId);
    if (!LIMIT_UNITS.has(estimate.unit)
      || !Number.isFinite(estimate.amount)
      || estimate.amount <= 0
      || windows.has(estimate.windowId)) {
      throw createExecutionAdmissionError('xverify provider-limit estimate is invalid');
    }
    windows.add(estimate.windowId);
  }
  assertSettlementRef(input.settlementAttemptRef, input);
}

function contractInput(
  contract: CrossVerifyEnforcedAttemptContractInputV1 | CrossVerifyEnforcedAttemptContractV1,
): CrossVerifyEnforcedAttemptContractInputV1 {
  const {
    schemaVersion: _schemaVersion,
    contractSha256: _contractSha256,
    evidenceRef: _evidenceRef,
    ...input
  } = contract as CrossVerifyEnforcedAttemptContractV1;
  return input;
}

function contractPayload(
  contract: CrossVerifyEnforcedAttemptContractInputV1,
): CrossVerifyEnforcedAttemptContractInputV1 & {
  readonly schemaVersion: typeof CROSS_VERIFY_EXECUTION_CONTRACT_SCHEMA_VERSION;
} {
  return {
    schemaVersion: CROSS_VERIFY_EXECUTION_CONTRACT_SCHEMA_VERSION,
    ...contract,
  };
}

const ADJUDICATION_BINDING_FIELDS = new Set<keyof CrossVerifyAdjudicationExecutionBindingV2>([
  'protocol',
  'claimDigest',
  'evidenceManifestDigest',
  'adjudicationContractDigest',
  'evidenceBrokerRef',
  'evidenceBrokerManifestSha256',
  'evidenceMountPath',
  'evidenceManifestRelativePath',
  'runtimeImageRef',
  'finalPromptDigest',
  'finalPromptChars',
  'maxPromptChars',
  'maxEvidenceOutputChars',
  'maxRationaleChars',
  'evidenceAccess',
  'artifactMutationPolicy',
]);

function assertPositiveSafeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw createExecutionAdmissionError(`${label} must be a positive integer`);
  }
}

function assertSha256Digest(label: string, value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw createExecutionAdmissionError(`${label} must be a canonical SHA-256 digest`);
  }
}

function assertAdjudicationBinding(
  value: Readonly<CrossVerifyAdjudicationExecutionBindingV2>,
): void {
  for (const field of Object.keys(value) as Array<keyof CrossVerifyAdjudicationExecutionBindingV2>) {
    if (!ADJUDICATION_BINDING_FIELDS.has(field)) {
      throw createExecutionAdmissionError(
        `Unknown xverify adjudication binding field: ${String(field)}`,
      );
    }
  }
  if (value.protocol !== CROSS_VERIFY_ADJUDICATION_PROTOCOL
    || value.evidenceAccess !== 'snapshot-read-only'
    || value.artifactMutationPolicy !== 'attempt-private-output-only'
    || value.evidenceMountPath !== '/deckent/xverify-evidence'
    || value.evidenceManifestRelativePath !== 'manifest.json') {
    throw createExecutionAdmissionError('Unsupported xverify adjudication execution policy');
  }
  assertSha256Digest('xverify claimDigest', value.claimDigest);
  assertSha256Digest(
    'xverify evidenceManifestDigest',
    value.evidenceManifestDigest,
  );
  assertSha256Digest(
    'xverify adjudicationContractDigest',
    value.adjudicationContractDigest,
  );
  if (!/^cross-verify-evidence-manifest:sha256:[a-f0-9]{64}$/u.test(
    value.evidenceBrokerRef,
  )) {
    throw createExecutionAdmissionError(
      'xverify evidenceBrokerRef must identify one immutable broker manifest',
    );
  }
  assertOpaqueSha256(
    'xverify evidenceBrokerManifestSha256',
    value.evidenceBrokerManifestSha256,
    true,
  );
  assertSha256Digest('xverify finalPromptDigest', value.finalPromptDigest);
  assertSha256Digest('xverify runtimeImageRef', value.runtimeImageRef);
  assertPositiveSafeInteger('xverify finalPromptChars', value.finalPromptChars);
  assertPositiveSafeInteger('xverify maxPromptChars', value.maxPromptChars);
  assertPositiveSafeInteger(
    'xverify maxEvidenceOutputChars',
    value.maxEvidenceOutputChars,
  );
  assertPositiveSafeInteger('xverify maxRationaleChars', value.maxRationaleChars);
  if (value.finalPromptChars > value.maxPromptChars) {
    throw createExecutionAdmissionError(
      'xverify final prompt exceeds its immutable character ceiling',
    );
  }
}

function contractV2Payload(
  input: CrossVerifyEnforcedAttemptContractInputV2,
): CrossVerifyEnforcedAttemptContractInputV2 & {
  readonly schemaVersion: typeof CROSS_VERIFY_EXECUTION_CONTRACT_V2_SCHEMA_VERSION;
} {
  return {
    schemaVersion: CROSS_VERIFY_EXECUTION_CONTRACT_V2_SCHEMA_VERSION,
    ...input,
  };
}

export function createCrossVerifyEnforcedAttemptContract(
  input: CrossVerifyEnforcedAttemptContractInputV1,
): Readonly<CrossVerifyEnforcedAttemptContractV1> {
  const copied = clone(input);
  assertInput(copied);
  const payload = contractPayload(copied);
  const contractSha256 = sha256(canonicalJson(payload));
  return deepFreeze({
    ...payload,
    contractSha256,
    evidenceRef: `xverify-contract:${contractSha256}`,
  }) as Readonly<CrossVerifyEnforcedAttemptContractV1>;
}

export function assertCrossVerifyEnforcedAttemptContract(
  contract: CrossVerifyEnforcedAttemptContract,
): void {
  if (contract.schemaVersion === CROSS_VERIFY_EXECUTION_CONTRACT_V2_SCHEMA_VERSION) {
    assertCrossVerifyEnforcedAttemptContractV2(contract);
    return;
  }
  if (contract.schemaVersion !== CROSS_VERIFY_EXECUTION_CONTRACT_SCHEMA_VERSION) {
    throw createExecutionAdmissionError(
      'Unsupported xverify execution contract schema version',
    );
  }
  const input = contractInput(contract);
  assertInput(input);
  const payload = contractPayload(input);
  assertOpaqueSha256('xverify contractSha256', contract.contractSha256, true);
  assertOpaqueEvidenceRef('xverify execution contract evidenceRef', contract.evidenceRef, true);
  const expected = sha256(canonicalJson(payload));
  if (contract.contractSha256 !== expected
    || contract.evidenceRef !== `xverify-contract:${expected}`) {
    throw createExecutionAuthorityError('xverify execution contract integrity mismatch');
  }
}

export function createCrossVerifyEnforcedAttemptContractV2(
  input: CrossVerifyEnforcedAttemptContractInputV2,
): Readonly<CrossVerifyEnforcedAttemptContractV2> {
  const copied = clone(input);
  const { adjudication, ...base } = copied;
  assertInput(base);
  assertAdjudicationBinding(adjudication);
  const payload = contractV2Payload({ ...base, adjudication });
  const contractSha256 = sha256(canonicalJson(payload));
  return deepFreeze({
    ...payload,
    contractSha256,
    evidenceRef: `xverify-contract-v2:${contractSha256}`,
  }) as Readonly<CrossVerifyEnforcedAttemptContractV2>;
}

export function assertCrossVerifyEnforcedAttemptContractV2(
  contract: CrossVerifyEnforcedAttemptContractV2,
): void {
  if (contract.schemaVersion !== CROSS_VERIFY_EXECUTION_CONTRACT_V2_SCHEMA_VERSION) {
    throw createExecutionAdmissionError(
      'Unsupported xverify v2 execution contract schema version',
    );
  }
  const {
    schemaVersion: _schemaVersion,
    contractSha256: _contractSha256,
    evidenceRef: _evidenceRef,
    adjudication,
    ...base
  } = contract;
  assertInput(base);
  assertAdjudicationBinding(adjudication);
  const expected = sha256(canonicalJson(contractV2Payload({ ...base, adjudication })));
  assertOpaqueSha256('xverify v2 contractSha256', contract.contractSha256, true);
  assertOpaqueEvidenceRef(
    'xverify v2 execution contract evidenceRef',
    contract.evidenceRef,
    true,
  );
  if (contract.contractSha256 !== expected
    || contract.evidenceRef !== `xverify-contract-v2:${expected}`) {
    throw createExecutionAuthorityError('xverify v2 execution contract integrity mismatch');
  }
}

export function sameCrossVerifyExecutionContract(
  left: CrossVerifyEnforcedAttemptContract,
  right: CrossVerifyEnforcedAttemptContract,
): boolean {
  assertCrossVerifyEnforcedAttemptContract(left);
  assertCrossVerifyEnforcedAttemptContract(right);
  return left.contractSha256 === right.contractSha256
    && canonicalJson(left) === canonicalJson(right);
}
