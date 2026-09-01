import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, win32 } from 'node:path';
import { types as nodeUtilTypes } from 'node:util';

import { canonicalJson } from './audit-writer.js';
import type { ExecutionBudgetRole, ExecutionLandingPolicyConfig } from './config-types.js';
import type { ExecutionAdmissionMode } from './execution-admission.js';
import { assertExecutionLandingPolicyConfig } from './execution-budget-policy.js';
import { createExecutionAuthorityError } from './errors.js';
import {
  assertExecutionLandingCheckpointRef,
  assertExecutionLandingCheckpointRefV2,
  createExecutionLandingCheckpointRefV2,
  executionLandingCheckpointPath,
  executionLandingCheckpointPathV2,
  executionLandingPreparationContextPathV2,
  snapshotExecutionLandingCustodyRefV2,
  snapshotExecutionLandingPreparationRefV2,
  type ExecutionLandingCheckpointRefV1,
  type ExecutionLandingCheckpointRefV2,
  type ExecutionLandingCustodyRefV2,
  type ExecutionLandingDigestV2,
  type ExecutionLandingIdentityV1,
  type ExecutionLandingPreparationRefV2,
  type ExecutionLandingScopeV1,
} from './execution-landing-checkpoint.js';
import { TASK_KINDS, type ExecutionBudget, type TaskKind } from './work-model.js';

export const EXECUTION_LANDING_CONTEXT_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LANDING_DISK_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LANDING_CONTEXT_SCHEMA_VERSION_V2 = 2 as const;

const SHA256 = /^[a-f0-9]{64}$/;
const TASK_KIND_SET = new Set<TaskKind>(TASK_KINDS);
const ROLE_SET = new Set<ExecutionBudgetRole>(['brain', 'worker', 'auditor']);

export interface ExecutionLandingDiskEntryV1 {
  path: string;
  kind: 'absent' | 'file' | 'directory' | 'symlink' | 'other';
  sha256: string | null;
  size: number | null;
}

export interface ExecutionLandingDiskSnapshotV1 {
  entries: ExecutionLandingDiskEntryV1[];
  snapshotSha256: string;
}

export interface ExecutionLandingContextV1 extends ExecutionLandingCheckpointRefV1 {
  contextVersion: typeof EXECUTION_LANDING_CONTEXT_SCHEMA_VERSION;
  state: 'prepared';
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
  hardBudget: ExecutionBudget;
  parentAttemptId: string | null;
  parentFence: string | null;
  parentCheckpointSha256: string | null;
  scope: ExecutionLandingScopeV1;
  acceptanceCriteria: string;
  baseline: ExecutionLandingDiskSnapshotV1;
  preparedAt: string;
}

export interface ExecutionLandingContextEnvelopeV1 {
  contextSha256: string;
  context: ExecutionLandingContextV1;
}

export interface ExecutionLandingDiskEvidenceV1 extends ExecutionLandingCheckpointRefV1 {
  evidenceVersion: typeof EXECUTION_LANDING_DISK_EVIDENCE_SCHEMA_VERSION;
  state: 'captured';
  contextSha256: string;
  baseline: ExecutionLandingDiskSnapshotV1;
  current: ExecutionLandingDiskSnapshotV1;
  changedPaths: string[];
  diffSha256: string;
  capturedAt: string;
}

export interface ExecutionLandingContextV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-context';
  readonly contextVersion: 2;
  readonly state: 'PREPARED';
  readonly ref: ExecutionLandingContextRefV2;
  readonly preparationRef: ExecutionLandingPreparationRefV2;
  readonly preparationPayload: ExecutionLandingPreparationPayloadV2;
  readonly baseline: ExecutionLandingDiskSnapshotV1;
  readonly preparedAt: string;
}

export interface ExecutionLandingContextEnvelopeV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-context-envelope';
  readonly contextDigest: ExecutionLandingDigestV2;
  readonly context: ExecutionLandingContextV2;
}

export interface ExecutionLandingContextRefV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-context-ref';
  readonly projectRootSha256: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly privateAttemptId: string;
  readonly generation: number;
  readonly preparationRefDigest: ExecutionLandingDigestV2;
}

export interface ExecutionLandingPreparationPayloadV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-preparation-payload';
  readonly taskId: string;
  readonly tenantId: string;
  readonly originalRequestDigest: string;
  readonly taskDigest: string;
  readonly taskSnapshotDigest: ExecutionLandingDigestV2;
  readonly providerInvocationDigest: ExecutionLandingDigestV2;
  readonly role: ExecutionBudgetRole;
  readonly taskKind: TaskKind;
  readonly admissionMode: ExecutionAdmissionMode;
  readonly approvalEvidenceRef: string | null;
  readonly identity: ExecutionLandingIdentityV1;
  readonly policyDigest: string;
  readonly landingPolicy: ExecutionLandingPolicyConfig;
  readonly hardBudget: ExecutionBudget;
  readonly parentAttemptId: string | null;
  readonly parentFence: string | null;
  readonly parentCheckpointSha256: string | null;
  readonly attemptFence: string;
  readonly scope: ExecutionLandingScopeV1;
  readonly acceptanceCriteria: string;
  readonly preparationPayloadDigest: ExecutionLandingDigestV2;
}

export type CreateExecutionLandingPreparationPayloadV2Input = Pick<
  ExecutionLandingPreparationPayloadV2,
  'taskId' | 'tenantId' | 'originalRequestDigest' | 'taskDigest' | 'taskSnapshotDigest'
  | 'providerInvocationDigest' | 'role' | 'taskKind' | 'admissionMode'
  | 'approvalEvidenceRef' | 'identity' | 'policyDigest' | 'landingPolicy' | 'hardBudget'
  | 'parentAttemptId' | 'parentFence' | 'parentCheckpointSha256' | 'attemptFence'
  | 'scope' | 'acceptanceCriteria'
>;

export interface ExecutionLandingDiskEvidenceV2 {
  readonly schemaVersion: 2;
  readonly kind: 'execution-landing-disk-evidence';
  readonly state: 'CAPTURED';
  readonly ref: ExecutionLandingCheckpointRefV2;
  readonly contextRef: ExecutionLandingContextRefV2;
  readonly preparationRef: ExecutionLandingPreparationRefV2;
  readonly contextDigest: ExecutionLandingDigestV2;
  readonly baseline: ExecutionLandingDiskSnapshotV1;
  readonly current: ExecutionLandingDiskSnapshotV1;
  readonly changedPaths: readonly string[];
  readonly diffDigest: ExecutionLandingDigestV2;
  readonly capturedAt: string;
  readonly evidenceDigest: ExecutionLandingDigestV2;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalProjectRoot(projectRoot: string): string {
  try { return realpathSync.native(projectRoot); } catch { return resolve(projectRoot); }
}

function assertDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw createExecutionAuthorityError(`Execution landing context ${field} must be a lowercase SHA-256 digest`);
  }
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createExecutionAuthorityError(`Execution landing context ${field} must be non-empty`);
  }
}

function normalizeScopePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (
    normalized.length === 0
    || normalized.length > 500
    || isAbsolute(normalized)
    || win32.isAbsolute(normalized)
    || normalized.split('/').includes('..')
  ) {
    throw createExecutionAuthorityError(`Execution landing scope path is not bounded: ${path}`);
  }
  return normalized;
}

function normalizeScope(scope: ExecutionLandingScopeV1): ExecutionLandingScopeV1 {
  const normalize = (paths: readonly string[]): string[] => {
    const normalized = paths.map(normalizeScopePath);
    if (new Set(normalized).size !== normalized.length) {
      throw createExecutionAuthorityError('Execution landing scope contains duplicate paths');
    }
    return normalized;
  };
  const filesRead = normalize(scope.filesRead);
  const filesWrite = normalize(scope.filesWrite);
  if (filesRead.length === 0 && filesWrite.length === 0) {
    throw createExecutionAuthorityError('Execution landing scope must contain at least one path');
  }
  return { filesRead, filesWrite };
}

function assertInsideProject(projectRoot: string, candidate: string): void {
  const rel = relative(canonicalProjectRoot(projectRoot), resolve(candidate));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return;
  throw createExecutionAuthorityError(`Execution landing disk path escapes project scope: ${candidate}`);
}

function captureEntry(projectRoot: string, path: string): ExecutionLandingDiskEntryV1 {
  const normalized = normalizeScopePath(path);
  const absolute = resolve(projectRoot, normalized);
  assertInsideProject(projectRoot, absolute);
  if (!existsSync(absolute)) {
    return { path: normalized, kind: 'absent', sha256: null, size: null };
  }
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(absolute);
    return {
      path: normalized,
      kind: 'symlink',
      sha256: sha256(Buffer.from(target, 'utf-8')),
      size: Buffer.byteLength(target),
    };
  }
  if (stat.isFile()) {
    const content = readFileSync(absolute);
    return { path: normalized, kind: 'file', sha256: sha256(content), size: content.byteLength };
  }
  if (stat.isDirectory()) {
    return { path: normalized, kind: 'directory', sha256: null, size: null };
  }
  return { path: normalized, kind: 'other', sha256: null, size: stat.size };
}

export function captureExecutionLandingDiskSnapshot(
  projectRoot: string,
  filesWrite: readonly string[],
): ExecutionLandingDiskSnapshotV1 {
  const entries = [...new Set(filesWrite.map(normalizeScopePath))]
    .sort((left, right) => left.localeCompare(right))
    .map(path => captureEntry(projectRoot, path));
  return {
    entries,
    snapshotSha256: sha256(canonicalJson(entries)),
  };
}

function contextPath(ref: ExecutionLandingCheckpointRefV1): string {
  return resolve(dirname(executionLandingCheckpointPath(ref)), 'context.json');
}

function diskEvidencePath(ref: ExecutionLandingCheckpointRefV1): string {
  return resolve(dirname(executionLandingCheckpointPath(ref)), 'disk-evidence.json');
}

function publishJsonFirstWriter(
  path: string,
  value: unknown,
  acceptsExisting: (existing: unknown) => boolean,
): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    // 'r+' (not 'r'): Windows FlushFileBuffers rejects read-only handles with EPERM.
    const fd = openSync(tmp, 'r+');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    try {
      linkSync(tmp, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let existing: unknown = null;
      try { existing = JSON.parse(readFileSync(path, 'utf-8')); } catch { /* conflict below */ }
      if (!acceptsExisting(existing)) {
        throw createExecutionAuthorityError(`Conflicting immutable execution landing context already exists: ${path}`);
      }
    }
  } finally {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
  }
}

function contextDigest(context: ExecutionLandingContextV1): string {
  return sha256(canonicalJson(context));
}

function parseContext(value: unknown): ExecutionLandingContextV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const context = value as ExecutionLandingContextV1;
  try {
    if (
      context.contextVersion !== EXECUTION_LANDING_CONTEXT_SCHEMA_VERSION
      || context.schemaVersion !== 1
      || context.state !== 'prepared'
      || !ROLE_SET.has(context.role)
      || !TASK_KIND_SET.has(context.kind)
      || !['attended', 'unattended'].includes(context.admissionMode)
      || !Number.isFinite(Date.parse(context.preparedAt))
    ) return null;
    assertNonEmpty(context.tenantId, 'tenantId');
    assertNonEmpty(context.taskId, 'taskId');
    assertNonEmpty(context.attemptId, 'attemptId');
    assertDigest(context.projectId, 'projectId');
    assertDigest(context.originalRequestDigest, 'originalRequestDigest');
    assertDigest(context.taskDigest, 'taskDigest');
    assertDigest(context.policyDigest, 'policyDigest');
    assertExecutionLandingPolicyConfig(context.landingPolicy, 'execution landing context policy');
    if (!context.hardBudget || Object.keys(context.hardBudget).length === 0) return null;
    normalizeScope(context.scope);
    assertNonEmpty(context.acceptanceCriteria, 'acceptanceCriteria');
    assertDigest(context.baseline.snapshotSha256, 'baseline.snapshotSha256');
    if (
      context.baseline.snapshotSha256 !== sha256(canonicalJson(context.baseline.entries))
      || context.approvalEvidenceRef !== null && typeof context.approvalEvidenceRef !== 'string'
    ) return null;
    return context;
  } catch {
    return null;
  }
}

export function createExecutionLandingContext(
  projectRoot: string,
  input: Omit<ExecutionLandingContextV1, 'contextVersion' | 'state' | 'baseline' | 'preparedAt'> & {
    preparedAt?: string;
  },
): ExecutionLandingContextEnvelopeV1 {
  assertExecutionLandingCheckpointRef(projectRoot, input);
  const scope = normalizeScope(input.scope);
  const preparedAt = input.preparedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(preparedAt))) {
    throw createExecutionAuthorityError('Execution landing context preparedAt must be an ISO timestamp');
  }
  const context: ExecutionLandingContextV1 = {
    ...input,
    contextVersion: EXECUTION_LANDING_CONTEXT_SCHEMA_VERSION,
    state: 'prepared',
    scope,
    baseline: captureExecutionLandingDiskSnapshot(projectRoot, scope.filesWrite),
    preparedAt,
  };
  const parsed = parseContext(context);
  if (!parsed) throw createExecutionAuthorityError('Invalid execution landing context');
  return { contextSha256: contextDigest(parsed), context: parsed };
}

export function writeExecutionLandingContextAtomic(
  projectRoot: string,
  envelope: ExecutionLandingContextEnvelopeV1,
): void {
  assertExecutionLandingCheckpointRef(projectRoot, envelope.context);
  if (
    !parseContext(envelope.context)
    || envelope.contextSha256 !== contextDigest(envelope.context)
  ) {
    throw createExecutionAuthorityError('Invalid execution landing context envelope');
  }
  publishJsonFirstWriter(
    contextPath(envelope.context),
    envelope,
    existing => {
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return false;
      const record = existing as ExecutionLandingContextEnvelopeV1;
      return record.contextSha256 === envelope.contextSha256
        && parseContext(record.context) !== null
        && contextDigest(record.context) === record.contextSha256;
    },
  );
}

export function readExecutionLandingContext(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV1,
): ExecutionLandingContextEnvelopeV1 {
  assertExecutionLandingCheckpointRef(projectRoot, ref);
  const parsed = JSON.parse(readFileSync(contextPath(ref), 'utf-8')) as ExecutionLandingContextEnvelopeV1;
  if (
    !parseContext(parsed.context)
    || parsed.context.projectId !== ref.projectId
    || parsed.context.taskId !== ref.taskId
    || parsed.context.attemptId !== ref.attemptId
    || parsed.contextSha256 !== contextDigest(parsed.context)
  ) {
    throw createExecutionAuthorityError(`Corrupt execution landing context: ${contextPath(ref)}`);
  }
  return parsed;
}

function diskEvidenceDigest(
  baseline: ExecutionLandingDiskSnapshotV1,
  current: ExecutionLandingDiskSnapshotV1,
): { changedPaths: string[]; diffSha256: string } {
  const baselineByPath = new Map(baseline.entries.map(entry => [entry.path, entry]));
  const currentByPath = new Map(current.entries.map(entry => [entry.path, entry]));
  const changedPaths = [...new Set([...baselineByPath.keys(), ...currentByPath.keys()])]
    .filter(path => canonicalJson(baselineByPath.get(path) ?? null) !== canonicalJson(currentByPath.get(path) ?? null))
    .sort((left, right) => left.localeCompare(right));
  return {
    changedPaths,
    diffSha256: sha256(canonicalJson({
      baselineSha256: baseline.snapshotSha256,
      currentSha256: current.snapshotSha256,
      changedPaths,
    })),
  };
}

export function writeExecutionLandingDiskEvidenceAtomic(
  projectRoot: string,
  contextEnvelope: ExecutionLandingContextEnvelopeV1,
  capturedAt: string = new Date().toISOString(),
): ExecutionLandingDiskEvidenceV1 {
  const { contextSha256, context } = contextEnvelope;
  const current = captureExecutionLandingDiskSnapshot(projectRoot, context.scope.filesWrite);
  const diff = diskEvidenceDigest(context.baseline, current);
  const evidence: ExecutionLandingDiskEvidenceV1 = {
    schemaVersion: context.schemaVersion,
    projectId: context.projectId,
    taskId: context.taskId,
    attemptId: context.attemptId,
    evidenceVersion: EXECUTION_LANDING_DISK_EVIDENCE_SCHEMA_VERSION,
    state: 'captured',
    contextSha256,
    baseline: context.baseline,
    current,
    changedPaths: diff.changedPaths,
    diffSha256: diff.diffSha256,
    capturedAt,
  };
  publishJsonFirstWriter(
    diskEvidencePath(context),
    evidence,
    existing => canonicalJson(existing) === canonicalJson(evidence),
  );
  return evidence;
}

export function executionLandingContextRef(envelope: ExecutionLandingContextEnvelopeV1): string {
  return `execution-landing-context:sha256:${envelope.contextSha256}`;
}

export function executionLandingDiskEvidenceRef(evidence: ExecutionLandingDiskEvidenceV1): string {
  return `execution-landing-disk:sha256:${sha256(canonicalJson(evidence))}`;
}

function contextV2Digest(value: ExecutionLandingContextV2): ExecutionLandingDigestV2 {
  return `sha256:${sha256(`execution-landing-context-v2\0${canonicalJson(value)}`)}`;
}

function contextV2ExactRecord(
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

function contextV2PlainDataSnapshot(
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
      snapshot.push(contextV2PlainDataSnapshot(
        descriptor.value,
        `${field}[${index}]`,
        state,
        depth + 1,
      ));
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
    snapshot[key] = contextV2PlainDataSnapshot(
      descriptor.value,
      `${field}.${key}`,
      state,
      depth + 1,
    );
  }
  return snapshot;
}

function contextRefV2(
  projectRoot: string,
  value: unknown,
): ExecutionLandingContextRefV2 {
  const record = contextV2ExactRecord(value, [
    'schemaVersion', 'kind', 'projectRootSha256', 'projectId', 'taskId',
    'privateAttemptId', 'generation', 'preparationRefDigest',
  ], 'context ref');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-context-ref'
    || typeof record.projectRootSha256 !== 'string'
    || !SHA256.test(record.projectRootSha256)
    || typeof record.projectId !== 'string'
    || typeof record.taskId !== 'string'
    || typeof record.privateAttemptId !== 'string'
    || typeof record.generation !== 'number'
    || !Number.isSafeInteger(record.generation)
    || record.generation < 1
    || typeof record.preparationRefDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(record.preparationRefDigest)
  ) throw createExecutionAuthorityError('Execution landing V2 context ref is invalid');
  const expectedRoot = sha256(canonicalProjectRoot(projectRoot));
  if (record.projectRootSha256 !== expectedRoot) {
    throw createExecutionAuthorityError('Execution landing V2 context project authority mismatch');
  }
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-context-ref',
    projectRootSha256: record.projectRootSha256,
    projectId: record.projectId,
    taskId: record.taskId,
    privateAttemptId: record.privateAttemptId,
    generation: record.generation,
    preparationRefDigest: record.preparationRefDigest as ExecutionLandingDigestV2,
  });
}

export function createExecutionLandingContextRefV2(
  projectRoot: string,
  preparationValue: ExecutionLandingPreparationRefV2,
): ExecutionLandingContextRefV2 {
  const preparationRef = snapshotExecutionLandingPreparationRefV2(preparationValue);
  const identity = preparationRef.privateIdentity;
  return contextRefV2(projectRoot, {
    schemaVersion: 2,
    kind: 'execution-landing-context-ref',
    projectRootSha256: identity.projectRootSha256,
    projectId: identity.projectId,
    taskId: identity.taskId,
    privateAttemptId: identity.attemptId,
    generation: identity.generation,
    preparationRefDigest: preparationRef.preparationRefDigest,
  });
}

function executionLandingContextPathV2(
  preparationRef: ExecutionLandingPreparationRefV2,
): string {
  return executionLandingPreparationContextPathV2(preparationRef);
}

function executionLandingDiskEvidencePathV2(ref: ExecutionLandingCheckpointRefV2): string {
  return resolve(dirname(executionLandingCheckpointPathV2(ref)), 'disk-evidence-v2.json');
}

function snapshotDiskSnapshotV2(value: unknown): ExecutionLandingDiskSnapshotV1 {
  const record = contextV2ExactRecord(value, ['entries', 'snapshotSha256'], 'disk snapshot');
  if (
    !Array.isArray(record.entries)
    || nodeUtilTypes.isProxy(record.entries)
    || record.entries.length > 100
    || typeof record.snapshotSha256 !== 'string'
    || !SHA256.test(record.snapshotSha256)
  ) throw createExecutionAuthorityError('Execution landing V2 disk snapshot is invalid');
  const entries: ExecutionLandingDiskEntryV1[] = [];
  for (let index = 0; index < record.entries.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(record.entries, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw createExecutionAuthorityError(`Execution landing V2 disk entry[${index}] is invalid`);
    }
    const entry = descriptor.value;
    const item = contextV2ExactRecord(entry, ['path', 'kind', 'sha256', 'size'], `disk entry[${index}]`);
    if (
      typeof item.path !== 'string'
      || !['absent', 'file', 'directory', 'symlink', 'other'].includes(item.kind as string)
      || (item.sha256 !== null && (typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)))
      || (item.size !== null && (!Number.isSafeInteger(item.size) || (item.size as number) < 0))
    ) throw createExecutionAuthorityError(`Execution landing V2 disk entry[${index}] is invalid`);
    const path = normalizeScopePath(item.path);
    if (
      item.kind === 'absent'
        ? item.sha256 !== null || item.size !== null
        : item.kind === 'file' || item.kind === 'symlink'
          ? item.sha256 === null || item.size === null
          : item.sha256 !== null
    ) throw createExecutionAuthorityError(`Execution landing V2 disk entry[${index}] proof is inconsistent`);
    entries.push(Object.freeze({
      path,
      kind: item.kind as ExecutionLandingDiskEntryV1['kind'],
      sha256: item.sha256 as string | null,
      size: item.size as number | null,
    }));
  }
  if (
    new Set(entries.map(entry => entry.path)).size !== entries.length
    || record.snapshotSha256 !== sha256(canonicalJson(entries))
  ) throw createExecutionAuthorityError('Execution landing V2 disk snapshot digest mismatch');
  return Object.freeze({ entries: Object.freeze(entries) as ExecutionLandingDiskEntryV1[], snapshotSha256: record.snapshotSha256 });
}

function createExecutionLandingPreparationPayloadV2(
  projectRoot: string,
  preparationValue: ExecutionLandingPreparationRefV2,
  inputValue: CreateExecutionLandingPreparationPayloadV2Input,
  preparedAt: string,
): ExecutionLandingPreparationPayloadV2 {
  const preparationRef = snapshotExecutionLandingPreparationRefV2(preparationValue);
  const safeInput = contextV2PlainDataSnapshot(inputValue, 'preparation payload input');
  const input = contextV2ExactRecord(safeInput, [
    'taskId', 'tenantId', 'originalRequestDigest', 'taskDigest', 'taskSnapshotDigest',
    'providerInvocationDigest', 'role', 'taskKind', 'admissionMode',
    'approvalEvidenceRef', 'identity', 'policyDigest', 'landingPolicy', 'hardBudget',
    'parentAttemptId', 'parentFence', 'parentCheckpointSha256', 'attemptFence',
    'scope', 'acceptanceCriteria',
  ], 'preparation payload input');
  const validated = createExecutionLandingContext(projectRoot, {
    schemaVersion: 1,
    projectId: preparationRef.privateIdentity.projectRootSha256,
    taskId: input.taskId as string,
    attemptId: preparationRef.privateIdentity.attemptId,
    tenantId: input.tenantId as string,
    originalRequestDigest: input.originalRequestDigest as string,
    taskDigest: input.taskDigest as string,
    role: input.role as ExecutionBudgetRole,
    kind: input.taskKind as TaskKind,
    admissionMode: input.admissionMode as ExecutionAdmissionMode,
    approvalEvidenceRef: input.approvalEvidenceRef as string | null,
    identity: input.identity as ExecutionLandingIdentityV1,
    policyDigest: input.policyDigest as string,
    landingPolicy: input.landingPolicy as ExecutionLandingPolicyConfig,
    hardBudget: input.hardBudget as ExecutionBudget,
    parentAttemptId: input.parentAttemptId as string | null,
    parentFence: input.parentFence as string | null,
    parentCheckpointSha256: input.parentCheckpointSha256 as string | null,
    scope: input.scope as ExecutionLandingScopeV1,
    acceptanceCriteria: input.acceptanceCriteria as string,
    preparedAt,
  }).context;
  if (
    typeof input.taskSnapshotDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(input.taskSnapshotDigest)
    || typeof input.providerInvocationDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(input.providerInvocationDigest)
    || validated.taskId !== preparationRef.privateIdentity.taskId
    || input.taskSnapshotDigest !== preparationRef.taskSnapshotDigest
    || input.providerInvocationDigest !== preparationRef.providerInvocationDigest
    || `sha256:${validated.policyDigest}` !== preparationRef.policyDigest
  ) throw createExecutionAuthorityError('Execution landing V2 preparation payload/ref mismatch');
  const body = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'execution-landing-preparation-payload' as const,
    taskId: validated.taskId,
    tenantId: validated.tenantId,
    originalRequestDigest: validated.originalRequestDigest,
    taskDigest: validated.taskDigest,
    taskSnapshotDigest: input.taskSnapshotDigest as ExecutionLandingDigestV2,
    providerInvocationDigest: input.providerInvocationDigest as ExecutionLandingDigestV2,
    role: validated.role,
    taskKind: validated.kind,
    admissionMode: validated.admissionMode,
    approvalEvidenceRef: validated.approvalEvidenceRef,
    identity: Object.freeze({ ...validated.identity }),
    policyDigest: validated.policyDigest,
    landingPolicy: Object.freeze({ ...validated.landingPolicy }),
    hardBudget: Object.freeze({ ...validated.hardBudget }),
    parentAttemptId: validated.parentAttemptId,
    parentFence: validated.parentFence,
    parentCheckpointSha256: validated.parentCheckpointSha256,
    attemptFence: input.attemptFence as string,
    scope: Object.freeze({
      filesRead: [...validated.scope.filesRead],
      filesWrite: [...validated.scope.filesWrite],
    }),
    acceptanceCriteria: validated.acceptanceCriteria,
  });
  assertNonEmpty(body.attemptFence, 'V2 preparation attemptFence');
  return Object.freeze({
    ...body,
    preparationPayloadDigest: `sha256:${sha256(
      `execution-landing-preparation-payload-v2\0${canonicalJson(body)}`,
    )}`,
  });
}

function snapshotExecutionLandingPreparationPayloadV2(
  projectRoot: string,
  preparationRef: ExecutionLandingPreparationRefV2,
  value: unknown,
  preparedAt: string,
): ExecutionLandingPreparationPayloadV2 {
  const record = contextV2ExactRecord(value, [
    'schemaVersion', 'kind', 'taskId', 'tenantId', 'originalRequestDigest',
    'taskDigest', 'taskSnapshotDigest', 'providerInvocationDigest', 'role', 'taskKind',
    'admissionMode', 'approvalEvidenceRef', 'identity', 'policyDigest', 'landingPolicy',
    'hardBudget', 'parentAttemptId', 'parentFence', 'parentCheckpointSha256',
    'attemptFence', 'scope', 'acceptanceCriteria', 'preparationPayloadDigest',
  ], 'preparation payload');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-preparation-payload'
    || typeof record.preparationPayloadDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(record.preparationPayloadDigest)
  ) throw createExecutionAuthorityError('Execution landing V2 preparation payload is invalid');
  const payload = createExecutionLandingPreparationPayloadV2(
    projectRoot,
    preparationRef,
    {
      taskId: record.taskId as string,
      tenantId: record.tenantId as string,
      originalRequestDigest: record.originalRequestDigest as string,
      taskDigest: record.taskDigest as string,
      taskSnapshotDigest: record.taskSnapshotDigest as ExecutionLandingDigestV2,
      providerInvocationDigest: record.providerInvocationDigest as ExecutionLandingDigestV2,
      role: record.role as ExecutionBudgetRole,
      taskKind: record.taskKind as TaskKind,
      admissionMode: record.admissionMode as ExecutionAdmissionMode,
      approvalEvidenceRef: record.approvalEvidenceRef as string | null,
      identity: record.identity as ExecutionLandingIdentityV1,
      policyDigest: record.policyDigest as string,
      landingPolicy: record.landingPolicy as ExecutionLandingPolicyConfig,
      hardBudget: record.hardBudget as ExecutionBudget,
      parentAttemptId: record.parentAttemptId as string | null,
      parentFence: record.parentFence as string | null,
      parentCheckpointSha256: record.parentCheckpointSha256 as string | null,
      attemptFence: record.attemptFence as string,
      scope: record.scope as ExecutionLandingScopeV1,
      acceptanceCriteria: record.acceptanceCriteria as string,
    },
    preparedAt,
  );
  if (payload.preparationPayloadDigest !== record.preparationPayloadDigest) {
    throw createExecutionAuthorityError('Execution landing V2 preparation payload digest mismatch');
  }
  return payload;
}

function parseExecutionLandingContextV2(
  projectRoot: string,
  value: unknown,
): ExecutionLandingContextEnvelopeV2 {
  const envelopeRecord = contextV2ExactRecord(value, [
    'schemaVersion', 'kind', 'contextDigest', 'context',
  ], 'context envelope');
  if (
    envelopeRecord.schemaVersion !== 2
    || envelopeRecord.kind !== 'execution-landing-context-envelope'
    || typeof envelopeRecord.contextDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(envelopeRecord.contextDigest)
  ) throw createExecutionAuthorityError('Execution landing V2 context envelope is invalid');
  const contextRecord = contextV2ExactRecord(envelopeRecord.context, [
    'schemaVersion', 'kind', 'contextVersion', 'state', 'ref', 'preparationRef',
    'preparationPayload', 'baseline', 'preparedAt',
  ], 'context');
  if (
    contextRecord.schemaVersion !== 2
    || contextRecord.kind !== 'execution-landing-context'
    || contextRecord.contextVersion !== 2
    || contextRecord.state !== 'PREPARED'
    || typeof contextRecord.preparedAt !== 'string'
    || !Number.isFinite(Date.parse(contextRecord.preparedAt))
  ) throw createExecutionAuthorityError('Execution landing V2 context schema/state is invalid');
  const preparationRef = snapshotExecutionLandingPreparationRefV2(contextRecord.preparationRef);
  if (Date.parse(contextRecord.preparedAt) < Date.parse(preparationRef.admittedAt)) {
    throw createExecutionAuthorityError('Execution landing V2 context precedes admission');
  }
  const preparationPayload = snapshotExecutionLandingPreparationPayloadV2(
    projectRoot,
    preparationRef,
    contextRecord.preparationPayload,
    contextRecord.preparedAt,
  );
  const baseline = snapshotDiskSnapshotV2(contextRecord.baseline);
  if (
    canonicalJson(baseline.entries.map(entry => entry.path))
      !== canonicalJson([...preparationPayload.scope.filesWrite].sort((a, b) => a.localeCompare(b)))
  ) throw createExecutionAuthorityError('Execution landing V2 context operational/custody binding mismatch');
  const expectedRef = createExecutionLandingContextRefV2(projectRoot, preparationRef);
  const suppliedRef = contextRefV2(projectRoot, contextRecord.ref);
  if (canonicalJson(suppliedRef) !== canonicalJson(expectedRef)) {
    throw createExecutionAuthorityError('Execution landing V2 context identity/custody mismatch');
  }
  const context: ExecutionLandingContextV2 = Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-context',
    contextVersion: 2,
    state: 'PREPARED',
    ref: expectedRef,
    preparationRef,
    preparationPayload,
    baseline,
    preparedAt: contextRecord.preparedAt,
  });
  const contextDigest = contextV2Digest(context);
  if (envelopeRecord.contextDigest !== contextDigest) {
    throw createExecutionAuthorityError('Execution landing V2 context digest mismatch');
  }
  return Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-context-envelope',
    contextDigest,
    context,
  });
}

export function createExecutionLandingContextV2(
  projectRoot: string,
  inputValue: {
    readonly preparationRef: ExecutionLandingPreparationRefV2;
    readonly preparationInput: CreateExecutionLandingPreparationPayloadV2Input;
    readonly preparedAt: string;
  },
): ExecutionLandingContextEnvelopeV2 {
  const input = contextV2ExactRecord(
    inputValue,
    ['preparationRef', 'preparationInput', 'preparedAt'],
    'context input',
  );
  const preparationRef = snapshotExecutionLandingPreparationRefV2(input.preparationRef);
  if (
    typeof input.preparedAt !== 'string'
    || !Number.isFinite(Date.parse(input.preparedAt))
    || Date.parse(input.preparedAt) < Date.parse(preparationRef.admittedAt)
  ) throw createExecutionAuthorityError('Execution landing V2 preparedAt must follow admission');
  const ref = createExecutionLandingContextRefV2(projectRoot, preparationRef);
  const preparationPayload = createExecutionLandingPreparationPayloadV2(
    projectRoot,
    preparationRef,
    input.preparationInput as CreateExecutionLandingPreparationPayloadV2Input,
    input.preparedAt,
  );
  const baseline = captureExecutionLandingDiskSnapshot(
    projectRoot,
    preparationPayload.scope.filesWrite,
  );
  const context: ExecutionLandingContextV2 = Object.freeze({
    schemaVersion: 2,
    kind: 'execution-landing-context',
    contextVersion: 2,
    state: 'PREPARED',
    ref,
    preparationRef,
    preparationPayload,
    baseline,
    preparedAt: input.preparedAt,
  });
  return parseExecutionLandingContextV2(projectRoot, {
    schemaVersion: 2,
    kind: 'execution-landing-context-envelope',
    contextDigest: contextV2Digest(context),
    context,
  });
}

export function writeExecutionLandingContextAtomicV2(
  projectRoot: string,
  envelopeValue: ExecutionLandingContextEnvelopeV2,
): void {
  const envelope = parseExecutionLandingContextV2(projectRoot, envelopeValue);
  publishJsonFirstWriter(
    executionLandingContextPathV2(envelope.context.preparationRef),
    envelope,
    existing => {
      try {
        return parseExecutionLandingContextV2(projectRoot, existing).contextDigest
          === envelope.contextDigest;
      } catch { return false; }
    },
  );
}

export function readExecutionLandingContextV2(
  projectRoot: string,
  preparationValue: ExecutionLandingPreparationRefV2,
): ExecutionLandingContextEnvelopeV2 {
  const preparationRef = snapshotExecutionLandingPreparationRefV2(preparationValue);
  const ref = createExecutionLandingContextRefV2(projectRoot, preparationRef);
  const path = executionLandingContextPathV2(preparationRef);
  const envelope = parseExecutionLandingContextV2(projectRoot, JSON.parse(readFileSync(path, 'utf-8')));
  if (canonicalJson(envelope.context.ref) !== canonicalJson(ref)) {
    throw createExecutionAuthorityError(`Corrupt execution landing V2 context: ${path}`);
  }
  return envelope;
}

export function openOrCreateExecutionLandingContextV2(
  projectRoot: string,
  inputValue: {
    readonly preparationRef: ExecutionLandingPreparationRefV2;
    readonly preparationInput: CreateExecutionLandingPreparationPayloadV2Input;
    readonly preparedAt: string;
  },
): ExecutionLandingContextEnvelopeV2 {
  const input = contextV2ExactRecord(
    inputValue,
    ['preparationRef', 'preparationInput', 'preparedAt'],
    'open-or-create context input',
  );
  const preparationRef = snapshotExecutionLandingPreparationRefV2(input.preparationRef);
  if (
    typeof input.preparedAt !== 'string'
    || !Number.isFinite(Date.parse(input.preparedAt))
    || Date.parse(input.preparedAt) < Date.parse(preparationRef.admittedAt)
  ) throw createExecutionAuthorityError('Execution landing V2 preparedAt must follow admission');
  const path = executionLandingContextPathV2(preparationRef);
  const expectedPayload = (preparedAt: string) => createExecutionLandingPreparationPayloadV2(
    projectRoot,
    preparationRef,
    input.preparationInput as CreateExecutionLandingPreparationPayloadV2Input,
    preparedAt,
  );
  if (existsSync(path)) {
    const existing = readExecutionLandingContextV2(projectRoot, preparationRef);
    if (
      existing.context.preparationPayload.preparationPayloadDigest
        !== expectedPayload(existing.context.preparedAt).preparationPayloadDigest
    ) throw createExecutionAuthorityError('Conflicting immutable execution landing V2 context input');
    return existing;
  }
  const candidate = createExecutionLandingContextV2(projectRoot, {
    preparationRef,
    preparationInput: input.preparationInput as CreateExecutionLandingPreparationPayloadV2Input,
    preparedAt: input.preparedAt,
  });
  return writeOrAdoptExecutionLandingContextAtomicV2(
    projectRoot,
    candidate,
    input.preparationInput as CreateExecutionLandingPreparationPayloadV2Input,
  );
}

export function writeOrAdoptExecutionLandingContextAtomicV2(
  projectRoot: string,
  candidateValue: ExecutionLandingContextEnvelopeV2,
  preparationInput: CreateExecutionLandingPreparationPayloadV2Input,
): ExecutionLandingContextEnvelopeV2 {
  const candidate = parseExecutionLandingContextV2(projectRoot, candidateValue);
  const preparationRef = candidate.context.preparationRef;
  const path = executionLandingContextPathV2(preparationRef);
  try {
    writeExecutionLandingContextAtomicV2(projectRoot, candidate);
    return readExecutionLandingContextV2(projectRoot, preparationRef);
  } catch (error) {
    if (!existsSync(path)) throw error;
    const winner = readExecutionLandingContextV2(projectRoot, preparationRef);
    const expectedWinnerPayload = createExecutionLandingPreparationPayloadV2(
      projectRoot,
      preparationRef,
      preparationInput,
      winner.context.preparedAt,
    );
    if (
      winner.context.preparationPayload.preparationPayloadDigest
        !== expectedWinnerPayload.preparationPayloadDigest
    ) throw error;
    return winner;
  }
}

function parseExecutionLandingDiskEvidenceV2(
  projectRoot: string,
  value: unknown,
): ExecutionLandingDiskEvidenceV2 {
  const record = contextV2ExactRecord(value, [
    'schemaVersion', 'kind', 'state', 'ref', 'contextRef', 'preparationRef',
    'contextDigest', 'baseline', 'current', 'changedPaths', 'diffDigest',
    'capturedAt', 'evidenceDigest',
  ], 'disk evidence');
  if (
    record.schemaVersion !== 2
    || record.kind !== 'execution-landing-disk-evidence'
    || record.state !== 'CAPTURED'
    || typeof record.contextDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(record.contextDigest)
    || typeof record.diffDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(record.diffDigest)
    || typeof record.evidenceDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(record.evidenceDigest)
    || typeof record.capturedAt !== 'string'
    || !Number.isFinite(Date.parse(record.capturedAt))
    || !Array.isArray(record.changedPaths)
    || nodeUtilTypes.isProxy(record.changedPaths)
    || record.changedPaths.length > 100
    || Reflect.ownKeys(record.changedPaths).length !== record.changedPaths.length + 1
  ) throw createExecutionAuthorityError('Execution landing V2 disk evidence schema is invalid');
  const preparationRef = snapshotExecutionLandingPreparationRefV2(record.preparationRef);
  const context = readExecutionLandingContextV2(projectRoot, preparationRef);
  const contextRef = contextRefV2(projectRoot, record.contextRef);
  assertExecutionLandingCheckpointRefV2(projectRoot, record.ref as ExecutionLandingCheckpointRefV2);
  const ref = record.ref as ExecutionLandingCheckpointRefV2;
  const baseline = snapshotDiskSnapshotV2(record.baseline);
  const current = snapshotDiskSnapshotV2(record.current);
  const changedPaths: string[] = [];
  for (let index = 0; index < record.changedPaths.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(record.changedPaths, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw createExecutionAuthorityError('Execution landing V2 changedPaths is invalid');
    }
    if (typeof descriptor.value !== 'string') {
      throw createExecutionAuthorityError('Execution landing V2 changedPaths is invalid');
    }
    changedPaths.push(normalizeScopePath(descriptor.value));
  }
  const derivedDiff = diskEvidenceDigest(baseline, current);
  const expectedDiffDigest = `sha256:${derivedDiff.diffSha256}` as ExecutionLandingDigestV2;
  if (
    context.contextDigest !== record.contextDigest
    || canonicalJson(context.context.ref) !== canonicalJson(contextRef)
    || context.context.preparationRef.preparationRefDigest !== preparationRef.preparationRefDigest
    || ref.projectRootSha256 !== preparationRef.privateIdentity.projectRootSha256
    || ref.projectId !== preparationRef.privateIdentity.projectId
    || ref.taskId !== preparationRef.privateIdentity.taskId
    || ref.privateAttemptId !== preparationRef.privateIdentity.attemptId
    || ref.generation !== preparationRef.privateIdentity.generation
    || canonicalJson(context.context.baseline) !== canonicalJson(baseline)
    || canonicalJson(derivedDiff.changedPaths) !== canonicalJson(changedPaths)
    || new Set(changedPaths).size !== changedPaths.length
    || record.diffDigest !== expectedDiffDigest
    || Date.parse(record.capturedAt) < Date.parse(context.context.preparedAt)
  ) throw createExecutionAuthorityError('Execution landing V2 disk evidence binding mismatch');
  const body = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'execution-landing-disk-evidence' as const,
    state: 'CAPTURED' as const,
    ref,
    contextRef,
    preparationRef,
    contextDigest: context.contextDigest,
    baseline,
    current,
    changedPaths: Object.freeze(changedPaths),
    diffDigest: expectedDiffDigest,
    capturedAt: record.capturedAt,
  });
  const evidenceDigest = `sha256:${sha256(
    `execution-landing-disk-evidence-v2\0${canonicalJson(body)}`,
  )}` as ExecutionLandingDigestV2;
  if (record.evidenceDigest !== evidenceDigest) {
    throw createExecutionAuthorityError('Execution landing V2 disk evidence digest mismatch');
  }
  return Object.freeze({ ...body, evidenceDigest });
}

export function writeExecutionLandingDiskEvidenceAtomicV2(
  projectRoot: string,
  contextEnvelopeValue: ExecutionLandingContextEnvelopeV2,
  custodyValue: ExecutionLandingCustodyRefV2,
  capturedAt: string,
): ExecutionLandingDiskEvidenceV2 {
  const contextEnvelope = parseExecutionLandingContextV2(projectRoot, contextEnvelopeValue);
  const custodyRef = snapshotExecutionLandingCustodyRefV2(custodyValue);
  const durableContext = readExecutionLandingContextV2(
    projectRoot,
    contextEnvelope.context.preparationRef,
  );
  if (durableContext.contextDigest !== contextEnvelope.contextDigest) {
    throw createExecutionAuthorityError('Execution landing V2 disk evidence requires exact durable context');
  }
  if (!Number.isFinite(Date.parse(capturedAt))) {
    throw createExecutionAuthorityError('Execution landing V2 disk capturedAt must be an ISO timestamp');
  }
  const current = captureExecutionLandingDiskSnapshot(
    projectRoot,
    contextEnvelope.context.preparationPayload.scope.filesWrite,
  );
  const diff = diskEvidenceDigest(contextEnvelope.context.baseline, current);
  const body = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'execution-landing-disk-evidence' as const,
    state: 'CAPTURED' as const,
    ref: createExecutionLandingCheckpointRefV2(projectRoot, custodyRef),
    contextRef: contextEnvelope.context.ref,
    preparationRef: contextEnvelope.context.preparationRef,
    contextDigest: contextEnvelope.contextDigest,
    baseline: contextEnvelope.context.baseline,
    current,
    changedPaths: Object.freeze(diff.changedPaths),
    diffDigest: `sha256:${diff.diffSha256}` as ExecutionLandingDigestV2,
    capturedAt,
  });
  if (
    custodyRef.preparationRef.preparationRefDigest
      !== contextEnvelope.context.preparationRef.preparationRefDigest
  ) throw createExecutionAuthorityError('Execution landing V2 disk custody/preparation mismatch');
  const evidence = parseExecutionLandingDiskEvidenceV2(projectRoot, {
    ...body,
    evidenceDigest: `sha256:${sha256(
      `execution-landing-disk-evidence-v2\0${canonicalJson(body)}`,
    )}`,
  });
  publishJsonFirstWriter(
    executionLandingDiskEvidencePathV2(evidence.ref),
    evidence,
    existing => {
      try {
        return parseExecutionLandingDiskEvidenceV2(projectRoot, existing).evidenceDigest
          === evidence.evidenceDigest;
      } catch { return false; }
    },
  );
  return readExecutionLandingDiskEvidenceV2(projectRoot, evidence.ref, evidence.evidenceDigest);
}

export function readExecutionLandingDiskEvidenceV2(
  projectRoot: string,
  ref: ExecutionLandingCheckpointRefV2,
  evidenceDigest: ExecutionLandingDigestV2,
): ExecutionLandingDiskEvidenceV2 {
  assertExecutionLandingCheckpointRefV2(projectRoot, ref);
  if (!/^sha256:[a-f0-9]{64}$/.test(evidenceDigest)) {
    throw createExecutionAuthorityError('Execution landing V2 disk evidence digest is invalid');
  }
  const path = executionLandingDiskEvidencePathV2(ref);
  const evidence = parseExecutionLandingDiskEvidenceV2(
    projectRoot,
    JSON.parse(readFileSync(path, 'utf-8')),
  );
  if (
    canonicalJson(evidence.ref) !== canonicalJson(ref)
    || evidence.evidenceDigest !== evidenceDigest
  ) throw createExecutionAuthorityError(`Corrupt execution landing V2 disk evidence: ${path}`);
  return evidence;
}
