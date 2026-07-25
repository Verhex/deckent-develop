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

export const CROSS_VERIFY_EXECUTION_CONTRACT_SCHEMA_VERSION = 1 as const;

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
  contract: CrossVerifyEnforcedAttemptContractV1,
): void {
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

export function sameCrossVerifyExecutionContract(
  left: CrossVerifyEnforcedAttemptContractV1,
  right: CrossVerifyEnforcedAttemptContractV1,
): boolean {
  assertCrossVerifyEnforcedAttemptContract(left);
  assertCrossVerifyEnforcedAttemptContract(right);
  return left.contractSha256 === right.contractSha256
    && canonicalJson(left) === canonicalJson(right);
}
