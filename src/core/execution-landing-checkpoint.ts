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
    const fd = openSync(tmp, 'r');
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
