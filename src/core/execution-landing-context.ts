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

import { canonicalJson } from './audit-writer.js';
import type { ExecutionBudgetRole, ExecutionLandingPolicyConfig } from './config-types.js';
import type { ExecutionAdmissionMode } from './execution-admission.js';
import { assertExecutionLandingPolicyConfig } from './execution-budget-policy.js';
import { createExecutionAuthorityError } from './errors.js';
import {
  assertExecutionLandingCheckpointRef,
  executionLandingCheckpointPath,
  type ExecutionLandingCheckpointRefV1,
  type ExecutionLandingIdentityV1,
  type ExecutionLandingScopeV1,
} from './execution-landing-checkpoint.js';
import { TASK_KINDS, type ExecutionBudget, type TaskKind } from './work-model.js';

export const EXECUTION_LANDING_CONTEXT_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LANDING_DISK_EVIDENCE_SCHEMA_VERSION = 1 as const;

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
