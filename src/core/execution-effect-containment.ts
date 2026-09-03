import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import {
  compileExecutionEffectWritePolicy,
  executionEffectPolicyAllowsPath,
  isExecutionEffectProtectedPath,
  parseExecutionEffectPortablePath,
  parseExecutionEffectWritePolicy,
  type ExecutionEffectWritePolicy,
} from './execution-write-scope-policy.js';

export const EXECUTION_EFFECT_MANIFEST_VERSION = 1 as const;
export const EXECUTION_EFFECT_DECISION_VERSION = 1 as const;

export const EXECUTION_EFFECT_CAPTURE_HARD_LIMITS = Object.freeze({
  maxEntries: 1_000_000,
  maxFileBytes: 16 * 1024 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024 * 1024,
  maxDepth: 256,
  maxPathBytes: 16 * 1024,
  maxNameBytes: 255,
  maxManifestBytes: 16 * 1024 * 1024,
});

const EXECUTION_EFFECT_CAPTURE_HARD_TOTAL_PATH_BYTES = 16 * 1024 * 1024;

const DEFAULT_LIMITS = EXECUTION_EFFECT_CAPTURE_HARD_LIMITS;

export interface ExecutionEffectAttemptIdentity {
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
}

export type ExecutionEffectManifestEntry =
  | Readonly<{
    readonly path: string;
    readonly kind: 'directory';
    /** Exact safe permission bits captured descriptor-relatively; special bits are rejected. */
    readonly mode: number;
  }>
  | Readonly<{
    readonly path: string;
    readonly kind: 'regular-file';
    readonly mode: number;
    readonly size: number;
    readonly contentDigest: string;
  }>;

export type ExecutionEffectFilesystemObjectKind =
  | 'directory'
  | 'regular-file'
  | 'symlink'
  | 'special-file';

export function classifyExecutionEffectFilesystemObject(input: Readonly<{
  readonly directory: boolean;
  readonly regularFile: boolean;
  readonly symlink: boolean;
}>): ExecutionEffectFilesystemObjectKind {
  if (input.directory) return 'directory';
  if (input.regularFile) return 'regular-file';
  if (input.symlink) return 'symlink';
  return 'special-file';
}

export type ExecutionEffectHoldCode =
  | 'INVALID_ATTEMPT_IDENTITY'
  | 'INVALID_WRITE_POLICY'
  | 'WORKSPACE_ROOT_UNAVAILABLE'
  | 'NATIVE_DESCRIPTOR_CAPTURE_REQUIRED'
  | 'UNSUPPORTED_PLATFORM'
  | 'MANIFEST_INVALID'
  | 'MANIFEST_DIGEST_MISMATCH'
  | 'MANIFEST_PHASE_MISMATCH'
  | 'MANIFEST_ENTRY_LIMIT'
  | 'MANIFEST_FILE_SIZE_LIMIT'
  | 'MANIFEST_TOTAL_BYTES_LIMIT'
  | 'MANIFEST_DEPTH_LIMIT'
  | 'MANIFEST_PATH_BYTES_LIMIT'
  | 'MANIFEST_NAME_BYTES_LIMIT'
  | 'CAPTURE_DEADLINE_EXCEEDED'
  | 'CAPTURE_CANCELLED'
  | 'PATH_NORMALIZATION_AMBIGUITY'
  | 'PORTABLE_PATH_COLLISION'
  | 'SYMLINK_AMBIGUITY'
  | 'HARDLINK_AMBIGUITY'
  | 'SPECIAL_FILE'
  | 'CROSS_FILESYSTEM_ENTRY'
  | 'MOUNT_BOUNDARY'
  | 'ATTEMPT_IDENTITY_MISMATCH'
  | 'WRITE_POLICY_MISMATCH'
  | 'WORKSPACE_IDENTITY_MISMATCH'
  | 'TYPE_CHANGE'
  | 'SYMLINK_EFFECT'
  | 'RENAME_UNPROVEN'
  | 'PROTECTED_PATH_CHANGED'
  | 'READ_ONLY_ATTEMPT_MUTATED'
  | 'UNEXPECTED_PATH';

export interface ExecutionEffectHold {
  readonly code: ExecutionEffectHoldCode;
  readonly path?: string;
  readonly paths?: readonly string[];
}

export interface ExecutionEffectCaptureLimits {
  readonly maxEntries: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly maxDepth: number;
  readonly maxPathBytes: number;
  readonly maxNameBytes: number;
  readonly maxManifestBytes: number;
}

export interface ExecutionEffectManifest {
  readonly version: typeof EXECUTION_EFFECT_MANIFEST_VERSION;
  readonly phase: 'baseline' | 'final';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly attemptDigest: string;
  readonly workspaceIdentity: Readonly<{
    readonly filesystemId: string;
    readonly directoryId: string;
    readonly rootHandleEvidenceDigest: string;
  }>;
  readonly captureAuthority: Readonly<{
    readonly adapter: 'native-descriptor-relative';
    readonly platform: 'linux' | 'wsl2-linux';
    readonly traversal: 'iterative-openat-no-follow';
    readonly sameFilesystem: true;
    readonly mountBoundaryPolicy: 'reject';
    readonly hardlinkPolicy: 'reject-before-content-read';
    readonly cancellationState: 'not-cancelled';
    readonly nativeManifestDigest: string;
    readonly nativeEntryIdentitySetDigest: string;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly deadlineAt: string;
    readonly limits: ExecutionEffectCaptureLimits;
  }>;
  readonly landingSemantics: Readonly<{
    readonly regularFile: 'reconstruct-bytes-and-safe-mode';
    readonly directory: 'exact-directory-add-and-derived-parent-create';
    readonly unsupportedMetadata: 'strip-xattr-acl-capability-sparse-ads-owner-times';
    readonly linksAndSpecialFiles: 'reject';
  }>;
  readonly policy: ExecutionEffectWritePolicy;
  readonly entries: readonly ExecutionEffectManifestEntry[];
  readonly digest: string;
}

export type ExecutionEffectManifestCaptureResult =
  | Readonly<{ readonly ok: true; readonly manifest: ExecutionEffectManifest }>
  | Readonly<{ readonly ok: false; readonly holds: readonly ExecutionEffectHold[] }>;

export interface CaptureExecutionEffectManifestInput {
  readonly workspaceRoot: string;
  readonly phase: 'baseline' | 'final';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly filesWrite: readonly string[];
  readonly environment?: 'linux' | 'wsl2-linux' | 'macos' | 'windows-native' | 'other';
  readonly limits?: Partial<ExecutionEffectCaptureLimits>;
}

export interface ExecutionEffectNativeCaptureEntryV1 {
  readonly schemaVersion: 1;
  readonly path: string;
  readonly kind: 'DIRECTORY' | 'REGULAR_FILE';
  readonly mode: string;
  readonly size: string | null;
  readonly objectIdentityDigest: string;
  readonly contentDigest: string | null;
}

export interface ExecutionEffectNativeCaptureTreeV1 {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-manifest';
  readonly state: 'CAPTURED';
  readonly entries: readonly ExecutionEffectNativeCaptureEntryV1[];
  readonly entryCount: number;
  readonly totalBytes: number;
  readonly manifestDigest: string;
}

export interface CreateExecutionEffectManifestFromNativeCaptureInputV1 {
  readonly phase: 'baseline' | 'final';
  readonly attempt: ExecutionEffectAttemptIdentity;
  readonly filesWrite: readonly string[];
  readonly platform: 'linux' | 'wsl2-linux';
  readonly workspaceIdentity: ExecutionEffectManifest['workspaceIdentity'];
  /** Exact descriptor-relative root inspection; captureTree intentionally enumerates children. */
  readonly rootEntry: ExecutionEffectNativeCaptureEntryV1;
  readonly nativeCapture: ExecutionEffectNativeCaptureTreeV1;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly deadlineAt: string;
  readonly limits: ExecutionEffectCaptureLimits;
}

export type ExecutionEffectKind = 'add' | 'modify' | 'delete' | 'mode';

export interface ExecutionEffect {
  readonly kind: ExecutionEffectKind;
  readonly path: string;
  readonly before?: ExecutionEffectManifestEntry;
  readonly after?: ExecutionEffectManifestEntry;
  readonly digest: string;
}

export type ExecutionEffectContainmentDecision =
  | Readonly<{
    readonly version: typeof EXECUTION_EFFECT_DECISION_VERSION;
    readonly state: 'VERIFIED';
    readonly attempt: ExecutionEffectAttemptIdentity;
    readonly policyDigest: string;
    readonly baselineDigest: string;
    readonly finalDigest: string;
    readonly effects: readonly ExecutionEffect[];
    readonly effectDigest: string;
    readonly decisionDigest: string;
  }>
  | Readonly<{
    readonly version: typeof EXECUTION_EFFECT_DECISION_VERSION;
    readonly state: 'HOLD';
    readonly effects: readonly ExecutionEffect[];
    readonly holds: readonly ExecutionEffectHold[];
    readonly decisionDigest: string;
  }>;

function compareCodePoint(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCodePoint(left, right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(domain: string, value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || nodeTypes.isProxy(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Object.getOwnPropertySymbols(value).length !== 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort(compareCodePoint);
  const expected = [...keys].sort(compareCodePoint);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    return null;
  }
  for (const key of actual) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) return null;
  }
  return value as Record<string, unknown>;
}

function validAttempt(value: ExecutionEffectAttemptIdentity): boolean {
  return [value.projectId, value.taskId, value.attemptId].every(
    field => typeof field === 'string' && field.length > 0 && field.length <= 256,
  ) && Number.isSafeInteger(value.generation) && value.generation > 0;
}

function parseAttempt(value: unknown): ExecutionEffectAttemptIdentity | null {
  const record = exactRecord(value, ['projectId', 'taskId', 'attemptId', 'generation']);
  if (record === null) return null;
  const attempt = {
    projectId: record.projectId as string,
    taskId: record.taskId as string,
    attemptId: record.attemptId as string,
    generation: record.generation as number,
  };
  return validAttempt(attempt) ? Object.freeze(attempt) : null;
}

function holdSort(left: ExecutionEffectHold, right: ExecutionEffectHold): number {
  return compareCodePoint(canonicalJson(left), canonicalJson(right));
}

function freezeHolds(holds: readonly ExecutionEffectHold[]): readonly ExecutionEffectHold[] {
  const unique = new Map<string, ExecutionEffectHold>();
  for (const hold of holds) {
    const frozen = Object.freeze({
      ...hold,
      ...(hold.paths ? { paths: Object.freeze([...hold.paths].sort(compareCodePoint)) } : {}),
    });
    unique.set(canonicalJson(frozen), frozen);
  }
  return Object.freeze([...unique.values()].sort(holdSort));
}

function validPositiveLimit(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function parseLimits(value: unknown): ExecutionEffectCaptureLimits | null {
  const record = exactRecord(value, [
    'maxEntries', 'maxFileBytes', 'maxTotalBytes', 'maxDepth', 'maxPathBytes', 'maxNameBytes',
    'maxManifestBytes',
  ]);
  if (record === null || !Object.values(record).every(validPositiveLimit)) return null;
  const limits = {
    maxEntries: record.maxEntries as number,
    maxFileBytes: record.maxFileBytes as number,
    maxTotalBytes: record.maxTotalBytes as number,
    maxDepth: record.maxDepth as number,
    maxPathBytes: record.maxPathBytes as number,
    maxNameBytes: record.maxNameBytes as number,
    maxManifestBytes: record.maxManifestBytes as number,
  };
  if (
    limits.maxEntries > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxEntries
    || limits.maxFileBytes > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxFileBytes
    || limits.maxTotalBytes > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxTotalBytes
    || limits.maxDepth > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxDepth
    || limits.maxPathBytes > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxPathBytes
    || limits.maxNameBytes > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxNameBytes
    || limits.maxManifestBytes > EXECUTION_EFFECT_CAPTURE_HARD_LIMITS.maxManifestBytes
    || limits.maxFileBytes > limits.maxTotalBytes
    || limits.maxNameBytes > limits.maxPathBytes
  ) return null;
  return Object.freeze(limits);
}

function normalizedManifestPath(
  value: unknown,
  limits: ExecutionEffectCaptureLimits,
): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.normalize('NFC') !== value) return null;
  if (value === '.') return value;
  const portable = parseExecutionEffectPortablePath(value);
  if (portable === undefined) return null;
  const segments = portable.path.split('/');
  if (segments.some(segment => Buffer.byteLength(segment, 'utf8') > limits.maxNameBytes)) return null;
  if (segments.length > limits.maxDepth || Buffer.byteLength(value, 'utf8') > limits.maxPathBytes) {
    return null;
  }
  return portable.path;
}

function parseEntry(
  value: unknown,
  limits: ExecutionEffectCaptureLimits,
): ExecutionEffectManifestEntry | null {
  if (value === null || typeof value !== 'object') return null;
  const kind = Reflect.get(value, 'kind');
  if (kind === 'directory') {
    const record = exactRecord(value, ['path', 'kind', 'mode']);
    const path = normalizedManifestPath(record?.path, limits);
    return record !== null && path !== null
      && Number.isSafeInteger(record.mode) && (record.mode as number) >= 0
      && (record.mode as number) <= 0o777
      ? Object.freeze({ path, kind: 'directory' as const, mode: record.mode as number })
      : null;
  }
  if (kind === 'regular-file') {
    const record = exactRecord(value, ['path', 'kind', 'mode', 'size', 'contentDigest']);
    const path = normalizedManifestPath(record?.path, limits);
    if (
      record === null || path === null
      || !Number.isSafeInteger(record.mode) || (record.mode as number) < 0
      || (record.mode as number) > 0o777
      || !Number.isSafeInteger(record.size) || (record.size as number) < 0
      || (record.size as number) > limits.maxFileBytes || !isDigest(record.contentDigest)
    ) return null;
    return Object.freeze({
      path,
      kind: 'regular-file' as const,
      mode: record.mode as number,
      size: record.size as number,
      contentDigest: record.contentDigest,
    });
  }
  return null;
}

type ManifestValidation =
  | Readonly<{ readonly ok: true; readonly manifest: ExecutionEffectManifest }>
  | Readonly<{ readonly ok: false; readonly hold: ExecutionEffectHold }>;

function validateManifest(value: unknown, expectedPhase?: 'baseline' | 'final'): ManifestValidation {
  const record = exactRecord(value, [
    'version', 'phase', 'attempt', 'attemptDigest', 'workspaceIdentity', 'captureAuthority',
    'landingSemantics', 'policy', 'entries', 'digest',
  ]);
  if (record === null) return { ok: false, hold: { code: 'MANIFEST_INVALID' } };
  if (expectedPhase !== undefined && record.phase !== expectedPhase) {
    return { ok: false, hold: { code: 'MANIFEST_PHASE_MISMATCH' } };
  }
  const attempt = parseAttempt(record.attempt);
  const workspace = exactRecord(record.workspaceIdentity, [
    'filesystemId', 'directoryId', 'rootHandleEvidenceDigest',
  ]);
  const authority = exactRecord(record.captureAuthority, [
    'adapter', 'platform', 'traversal', 'sameFilesystem', 'mountBoundaryPolicy',
    'hardlinkPolicy', 'cancellationState', 'nativeManifestDigest',
    'nativeEntryIdentitySetDigest', 'startedAt', 'completedAt', 'deadlineAt', 'limits',
  ]);
  const landing = exactRecord(record.landingSemantics, [
    'regularFile', 'directory', 'unsupportedMetadata', 'linksAndSpecialFiles',
  ]);
  const limits = parseLimits(authority?.limits);
  const parsedPolicy = parseExecutionEffectWritePolicy(record.policy);
  if (
    record.version !== EXECUTION_EFFECT_MANIFEST_VERSION
    || (record.phase !== 'baseline' && record.phase !== 'final') || attempt === null
    || record.attemptDigest !== sha256('execution-effect-attempt-v1', attempt)
    || workspace === null || typeof workspace.filesystemId !== 'string'
    || workspace.filesystemId.length === 0 || typeof workspace.directoryId !== 'string'
    || workspace.directoryId.length === 0 || !isDigest(workspace.rootHandleEvidenceDigest)
    || authority === null || authority.adapter !== 'native-descriptor-relative'
    || (authority.platform !== 'linux' && authority.platform !== 'wsl2-linux')
    || authority.traversal !== 'iterative-openat-no-follow' || authority.sameFilesystem !== true
    || authority.mountBoundaryPolicy !== 'reject'
    || authority.hardlinkPolicy !== 'reject-before-content-read'
    || authority.cancellationState !== 'not-cancelled'
    || !isDigest(authority.nativeManifestDigest)
    || !isDigest(authority.nativeEntryIdentitySetDigest)
    || !isTimestamp(authority.startedAt) || !isTimestamp(authority.completedAt)
    || !isTimestamp(authority.deadlineAt)
    || Date.parse(authority.completedAt as string) < Date.parse(authority.startedAt as string)
    || Date.parse(authority.completedAt as string) > Date.parse(authority.deadlineAt as string)
    || limits === null || landing === null
    || landing.regularFile !== 'reconstruct-bytes-and-safe-mode'
    || landing.directory !== 'exact-directory-add-and-derived-parent-create'
    || landing.unsupportedMetadata !== 'strip-xattr-acl-capability-sparse-ads-owner-times'
    || landing.linksAndSpecialFiles !== 'reject' || parsedPolicy === null
    || !Array.isArray(record.entries) || record.entries.length > limits.maxEntries
    || !isDigest(record.digest)
  ) return { ok: false, hold: { code: 'MANIFEST_INVALID' } };

  const entries: ExecutionEffectManifestEntry[] = [];
  const paths = new Set<string>();
  const portablePaths = new Map<string, string>();
  let previousPath: string | undefined;
  let totalBytes = 0;
  let totalPathBytes = 0;
  for (const raw of record.entries) {
    const entry = parseEntry(raw, limits);
    if (entry === null || paths.has(entry.path)) {
      return { ok: false, hold: { code: 'MANIFEST_INVALID' } };
    }
    if (previousPath !== undefined && compareCodePoint(previousPath, entry.path) >= 0) {
      return { ok: false, hold: { code: 'MANIFEST_INVALID' } };
    }
    totalPathBytes += Buffer.byteLength(entry.path, 'utf8');
    if (
      !Number.isSafeInteger(totalPathBytes)
      || totalPathBytes > EXECUTION_EFFECT_CAPTURE_HARD_TOTAL_PATH_BYTES
      || totalPathBytes > limits.maxManifestBytes
    ) {
      return { ok: false, hold: { code: 'MANIFEST_PATH_BYTES_LIMIT', path: entry.path } };
    }
    const portableKey = entry.path === '.'
      ? '.'
      : parseExecutionEffectPortablePath(entry.path)?.key;
    if (portableKey === undefined) {
      return { ok: false, hold: { code: 'MANIFEST_INVALID', path: entry.path } };
    }
    const collision = portablePaths.get(portableKey);
    if (collision !== undefined && collision !== entry.path) {
      return { ok: false, hold: { code: 'PORTABLE_PATH_COLLISION', paths: [collision, entry.path] } };
    }
    if (entry.kind === 'regular-file') {
      totalBytes += entry.size;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalBytes) {
        return { ok: false, hold: { code: 'MANIFEST_TOTAL_BYTES_LIMIT', path: entry.path } };
      }
    }
    paths.add(entry.path);
    portablePaths.set(portableKey, entry.path);
    previousPath = entry.path;
    entries.push(entry);
  }
  if (entries[0]?.path !== '.' || entries[0].kind !== 'directory') {
    return { ok: false, hold: { code: 'MANIFEST_INVALID', path: '.' } };
  }
  const entriesByPath = new Map(entries.map(entry => [entry.path, entry]));
  for (const entry of entries.slice(1)) {
    const separator = entry.path.lastIndexOf('/');
    const parent = separator === -1 ? '.' : entry.path.slice(0, separator);
    if (entriesByPath.get(parent)?.kind !== 'directory') {
      return { ok: false, hold: { code: 'MANIFEST_INVALID', path: entry.path } };
    }
  }

  const workspaceIdentity = Object.freeze({
    filesystemId: workspace.filesystemId,
    directoryId: workspace.directoryId,
    rootHandleEvidenceDigest: workspace.rootHandleEvidenceDigest,
  }) as ExecutionEffectManifest['workspaceIdentity'];
  const captureAuthority = Object.freeze({
    adapter: 'native-descriptor-relative' as const,
    platform: authority.platform as 'linux' | 'wsl2-linux',
    traversal: 'iterative-openat-no-follow' as const,
    sameFilesystem: true as const,
    mountBoundaryPolicy: 'reject' as const,
    hardlinkPolicy: 'reject-before-content-read' as const,
    cancellationState: 'not-cancelled' as const,
    nativeManifestDigest: authority.nativeManifestDigest as string,
    nativeEntryIdentitySetDigest: authority.nativeEntryIdentitySetDigest as string,
    startedAt: authority.startedAt as string,
    completedAt: authority.completedAt as string,
    deadlineAt: authority.deadlineAt as string,
    limits,
  });
  const landingSemantics = Object.freeze({
    regularFile: 'reconstruct-bytes-and-safe-mode' as const,
    directory: 'exact-directory-add-and-derived-parent-create' as const,
    unsupportedMetadata: 'strip-xattr-acl-capability-sparse-ads-owner-times' as const,
    linksAndSpecialFiles: 'reject' as const,
  });
  const body = Object.freeze({
    version: EXECUTION_EFFECT_MANIFEST_VERSION,
    phase: record.phase as 'baseline' | 'final',
    attempt,
    attemptDigest: record.attemptDigest as string,
    workspaceIdentity,
    captureAuthority,
    landingSemantics,
    policy: parsedPolicy,
    entries: Object.freeze(entries),
  });
  if (sha256('execution-effect-manifest-v1', body) !== record.digest) {
    return { ok: false, hold: { code: 'MANIFEST_DIGEST_MISMATCH' } };
  }
  return { ok: true, manifest: Object.freeze({ ...body, digest: record.digest as string }) };
}

export function parseExecutionEffectManifest(value: unknown): ExecutionEffectManifest | null {
  const result = validateManifest(value);
  return result.ok ? result.manifest : null;
}

function parseNativeCaptureEntry(
  value: unknown,
  limits: ExecutionEffectCaptureLimits,
): Readonly<{
  readonly native: ExecutionEffectNativeCaptureEntryV1;
  readonly manifest: ExecutionEffectManifestEntry;
}> | null {
  const record = exactRecord(value, [
    'schemaVersion', 'path', 'kind', 'mode', 'size', 'objectIdentityDigest', 'contentDigest',
  ]);
  const path = normalizedManifestPath(record?.path, limits);
  if (record === null || record.schemaVersion !== 1 || path === null
    || (record.kind !== 'DIRECTORY' && record.kind !== 'REGULAR_FILE')
    || typeof record.mode !== 'string' || !/^0[0-7]{3}$/u.test(record.mode)
    || !isDigest(record.objectIdentityDigest)) return null;
  const mode = Number.parseInt(record.mode, 8);
  if (record.kind === 'DIRECTORY') {
    if (record.size !== null || record.contentDigest !== null) return null;
    return Object.freeze({
      native: Object.freeze({
        schemaVersion: 1 as const,
        path,
        kind: 'DIRECTORY' as const,
        mode: record.mode,
        size: null,
        objectIdentityDigest: record.objectIdentityDigest,
        contentDigest: null,
      }),
      manifest: Object.freeze({ path, kind: 'directory' as const, mode }),
    });
  }
  if (typeof record.size !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(record.size)
    || !isDigest(record.contentDigest)) return null;
  const size = Number(record.size);
  if (!Number.isSafeInteger(size) || size < 0 || size > limits.maxFileBytes) return null;
  return Object.freeze({
    native: Object.freeze({
      schemaVersion: 1 as const,
      path,
      kind: 'REGULAR_FILE' as const,
      mode: record.mode,
      size: record.size,
      objectIdentityDigest: record.objectIdentityDigest,
      contentDigest: record.contentDigest,
    }),
    manifest: Object.freeze({
      path,
      kind: 'regular-file' as const,
      mode,
      size,
      contentDigest: record.contentDigest,
    }),
  });
}

export function executionEffectNativeCaptureManifestDigestV1(input: Readonly<{
  readonly entries: readonly ExecutionEffectNativeCaptureEntryV1[];
  readonly entryCount: number;
  readonly totalBytes: number;
}>): string {
  return sha256('execution-effect-native-capture-manifest-v1', input);
}

export function parseExecutionEffectNativeCaptureTreeV1(
  value: unknown,
  limitsValue: ExecutionEffectCaptureLimits,
): ExecutionEffectNativeCaptureTreeV1 | null {
  const limits = parseLimits(limitsValue);
  const record = exactRecord(value, [
    'schemaVersion', 'kind', 'state', 'entries', 'entryCount', 'totalBytes', 'manifestDigest',
  ]);
  if (limits === null || record === null || record.schemaVersion !== 1
    || record.kind !== 'execution-effect-manifest' || record.state !== 'CAPTURED'
    || !Array.isArray(record.entries) || nodeTypes.isProxy(record.entries)
    || !Number.isSafeInteger(record.entryCount) || (record.entryCount as number) < 0
    || record.entryCount !== record.entries.length
    || record.entries.length + 1 > limits.maxEntries
    || !Number.isSafeInteger(record.totalBytes) || (record.totalBytes as number) < 0
    || !isDigest(record.manifestDigest)) return null;
  const entries: ExecutionEffectNativeCaptureEntryV1[] = [];
  let totalBytes = 0;
  let previousPath: string | null = null;
  for (const raw of record.entries) {
    const parsed = parseNativeCaptureEntry(raw, limits);
    if (!parsed || parsed.native.path === '.'
      || (previousPath !== null && compareCodePoint(previousPath, parsed.native.path) >= 0)) {
      return null;
    }
    if (parsed.native.kind === 'REGULAR_FILE') {
      totalBytes += Number(parsed.native.size);
      if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalBytes) return null;
    }
    previousPath = parsed.native.path;
    entries.push(parsed.native);
  }
  const digestBody = Object.freeze({
    entries: Object.freeze(entries),
    entryCount: record.entryCount as number,
    totalBytes,
  });
  if (totalBytes !== record.totalBytes
    || Buffer.byteLength(canonicalJson(digestBody), 'utf8') > limits.maxManifestBytes
    || executionEffectNativeCaptureManifestDigestV1(digestBody) !== record.manifestDigest) return null;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'execution-effect-manifest',
    state: 'CAPTURED',
    entries: Object.freeze(entries),
    entryCount: record.entryCount as number,
    totalBytes,
    manifestDigest: record.manifestDigest,
  });
}

/** Convert one trusted native descriptor-relative capture into the canonical persistence manifest. */
export function createExecutionEffectManifestFromNativeCaptureV1(
  input: CreateExecutionEffectManifestFromNativeCaptureInputV1,
): ExecutionEffectManifestCaptureResult {
  const record = exactRecord(input, [
    'phase', 'attempt', 'filesWrite', 'platform', 'workspaceIdentity', 'rootEntry',
    'nativeCapture', 'startedAt', 'completedAt', 'deadlineAt', 'limits',
  ]);
  const limits = parseLimits(record?.limits);
  const attempt = parseAttempt(record?.attempt);
  const workspace = exactRecord(record?.workspaceIdentity, [
    'filesystemId', 'directoryId', 'rootHandleEvidenceDigest',
  ]);
  if (record === null || limits === null || attempt === null
    || (record.phase !== 'baseline' && record.phase !== 'final')
    || (record.platform !== 'linux' && record.platform !== 'wsl2-linux')
    || !Array.isArray(record.filesWrite) || nodeTypes.isProxy(record.filesWrite)
    || workspace === null || typeof workspace.filesystemId !== 'string'
    || workspace.filesystemId.length === 0 || typeof workspace.directoryId !== 'string'
    || workspace.directoryId.length === 0 || !isDigest(workspace.rootHandleEvidenceDigest)) {
    return Object.freeze({ ok: false, holds: freezeHolds([{ code: 'MANIFEST_INVALID' }]) });
  }
  const policy = compileExecutionEffectWritePolicy(record.filesWrite as readonly string[]);
  const root = parseNativeCaptureEntry(record.rootEntry, limits);
  const nativeCapture = parseExecutionEffectNativeCaptureTreeV1(record.nativeCapture, limits);
  if (!policy.ok || !root || root.native.path !== '.' || root.native.kind !== 'DIRECTORY'
    || root.native.objectIdentityDigest !== workspace.rootHandleEvidenceDigest
    || nativeCapture === null) {
    return Object.freeze({
      ok: false,
      holds: freezeHolds([{ code: policy.ok ? 'MANIFEST_INVALID' : 'INVALID_WRITE_POLICY' }]),
    });
  }
  const convertedEntries: ExecutionEffectManifestEntry[] = [root.manifest];
  for (const nativeEntry of nativeCapture.entries) {
    const converted = parseNativeCaptureEntry(nativeEntry, limits);
    if (!converted) {
      return Object.freeze({ ok: false, holds: freezeHolds([{ code: 'MANIFEST_INVALID' }]) });
    }
    convertedEntries.push(converted.manifest);
  }
  const workspaceIdentity = Object.freeze({
    filesystemId: workspace.filesystemId,
    directoryId: workspace.directoryId,
    rootHandleEvidenceDigest: workspace.rootHandleEvidenceDigest,
  }) as ExecutionEffectManifest['workspaceIdentity'];
  const captureAuthority = Object.freeze({
    adapter: 'native-descriptor-relative' as const,
    platform: record.platform as 'linux' | 'wsl2-linux',
    traversal: 'iterative-openat-no-follow' as const,
    sameFilesystem: true as const,
    mountBoundaryPolicy: 'reject' as const,
    hardlinkPolicy: 'reject-before-content-read' as const,
    cancellationState: 'not-cancelled' as const,
    nativeManifestDigest: nativeCapture.manifestDigest,
    nativeEntryIdentitySetDigest: sha256(
      'execution-effect-native-entry-identity-set-v1',
      [root.native, ...nativeCapture.entries].map(entry => ({
        path: entry.path,
        objectIdentityDigest: entry.objectIdentityDigest,
      })),
    ),
    startedAt: record.startedAt as string,
    completedAt: record.completedAt as string,
    deadlineAt: record.deadlineAt as string,
    limits,
  });
  const landingSemantics = Object.freeze({
    regularFile: 'reconstruct-bytes-and-safe-mode' as const,
    directory: 'exact-directory-add-and-derived-parent-create' as const,
    unsupportedMetadata: 'strip-xattr-acl-capability-sparse-ads-owner-times' as const,
    linksAndSpecialFiles: 'reject' as const,
  });
  const body = Object.freeze({
    version: EXECUTION_EFFECT_MANIFEST_VERSION,
    phase: record.phase as 'baseline' | 'final',
    attempt,
    attemptDigest: sha256('execution-effect-attempt-v1', attempt),
    workspaceIdentity,
    captureAuthority,
    landingSemantics,
    policy: policy.policy,
    entries: Object.freeze(convertedEntries),
  });
  const validated = validateManifest(Object.freeze({
    ...body,
    digest: sha256('execution-effect-manifest-v1', body),
  }), body.phase);
  return validated.ok
    ? Object.freeze({ ok: true, manifest: validated.manifest })
    : Object.freeze({ ok: false, holds: freezeHolds([validated.hold]) });
}

/** Path-based Node traversal cannot prove root/ancestor stability; native openat proof is required. */
export function captureExecutionEffectManifest(
  input: CaptureExecutionEffectManifestInput,
): ExecutionEffectManifestCaptureResult {
  if (!validAttempt(input.attempt)) {
    return Object.freeze({ ok: false, holds: freezeHolds([{ code: 'INVALID_ATTEMPT_IDENTITY' }]) });
  }
  const policy = compileExecutionEffectWritePolicy(input.filesWrite);
  if (!policy.ok) {
    return Object.freeze({
      ok: false,
      holds: freezeHolds(policy.holds.map(hold => ({
        code: 'INVALID_WRITE_POLICY' as const,
        path: hold.path,
      }))),
    });
  }
  if (typeof input.workspaceRoot !== 'string' || input.workspaceRoot.length === 0) {
    return Object.freeze({ ok: false, holds: freezeHolds([{ code: 'WORKSPACE_ROOT_UNAVAILABLE' }]) });
  }
  if (parseLimits({ ...DEFAULT_LIMITS, ...input.limits }) === null) {
    return Object.freeze({ ok: false, holds: freezeHolds([{ code: 'MANIFEST_INVALID' }]) });
  }
  const environment = input.environment ?? (process.platform === 'linux' ? 'linux' : 'other');
  return Object.freeze({
    ok: false,
    holds: freezeHolds([{
      code: environment === 'linux' || environment === 'wsl2-linux'
        ? 'NATIVE_DESCRIPTOR_CAPTURE_REQUIRED'
        : 'UNSUPPORTED_PLATFORM',
    }]),
  });
}

function sameAttempt(left: ExecutionEffectAttemptIdentity, right: ExecutionEffectAttemptIdentity): boolean {
  return left.projectId === right.projectId && left.taskId === right.taskId
    && left.attemptId === right.attemptId && left.generation === right.generation;
}

function effect(
  kind: ExecutionEffectKind,
  path: string,
  before?: ExecutionEffectManifestEntry,
  after?: ExecutionEffectManifestEntry,
): ExecutionEffect {
  const body = Object.freeze({
    kind,
    path,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  });
  return Object.freeze({ ...body, digest: sha256('execution-effect-v1', body) });
}

function holdDecision(
  holds: readonly ExecutionEffectHold[],
  effects: readonly ExecutionEffect[] = [],
): ExecutionEffectContainmentDecision {
  const frozenEffects = Object.freeze([...effects]
    .sort((left, right) => compareCodePoint(canonicalJson(left), canonicalJson(right))));
  const frozenHolds = freezeHolds(holds);
  const body = Object.freeze({
    version: EXECUTION_EFFECT_DECISION_VERSION,
    state: 'HOLD' as const,
    effects: frozenEffects,
    holds: frozenHolds,
  });
  return Object.freeze({ ...body, decisionDigest: sha256('execution-effect-decision-v1', body) });
}

/** Compare strict, host-custodied native manifests; worker claims never enter this decision. */
export function evaluateExecutionEffectContainment(input: Readonly<{
  readonly baseline: ExecutionEffectManifestCaptureResult;
  readonly final: ExecutionEffectManifestCaptureResult;
}>): ExecutionEffectContainmentDecision {
  const preconditionHolds: ExecutionEffectHold[] = [];
  if (!input.baseline.ok) preconditionHolds.push(...input.baseline.holds);
  if (!input.final.ok) preconditionHolds.push(...input.final.holds);
  if (!input.baseline.ok || !input.final.ok) return holdDecision(preconditionHolds);

  const baselineValidation = validateManifest(input.baseline.manifest, 'baseline');
  const finalValidation = validateManifest(input.final.manifest, 'final');
  if (!baselineValidation.ok) preconditionHolds.push(baselineValidation.hold);
  if (!finalValidation.ok) preconditionHolds.push(finalValidation.hold);
  if (!baselineValidation.ok || !finalValidation.ok) return holdDecision(preconditionHolds);

  const baseline = baselineValidation.manifest;
  const final = finalValidation.manifest;
  const holds: ExecutionEffectHold[] = [];
  if (!sameAttempt(baseline.attempt, final.attempt)) holds.push({ code: 'ATTEMPT_IDENTITY_MISMATCH' });
  if (baseline.policy.digest !== final.policy.digest) holds.push({ code: 'WRITE_POLICY_MISMATCH' });
  // filesystemId + directoryId identify the durable workspace. The native root-handle digest
  // proves each capture's descriptor-relative root, but is intentionally capture-local: Linux
  // mount ids change when the same Docker volume is reopened in a fresh helper namespace.
  if (baseline.workspaceIdentity.filesystemId !== final.workspaceIdentity.filesystemId
    || baseline.workspaceIdentity.directoryId !== final.workspaceIdentity.directoryId) {
    holds.push({ code: 'WORKSPACE_IDENTITY_MISMATCH' });
  }

  const beforeByPath = new Map(baseline.entries.map(entry => [entry.path, entry]));
  const afterByPath = new Map(final.entries.map(entry => [entry.path, entry]));
  const removed = new Map<string, ExecutionEffectManifestEntry>();
  const added = new Map<string, ExecutionEffectManifestEntry>();
  const effects: ExecutionEffect[] = [];
  for (const [path, before] of beforeByPath) {
    const after = afterByPath.get(path);
    if (after === undefined) {
      removed.set(path, before);
    } else if (before.kind !== after.kind) {
      holds.push({ code: 'TYPE_CHANGE', path });
    } else if (before.kind === 'regular-file' && after.kind === 'regular-file') {
      if (before.contentDigest !== after.contentDigest || before.size !== after.size) {
        effects.push(effect('modify', path, before, after));
      }
      if (before.mode !== after.mode) effects.push(effect('mode', path, before, after));
    } else if (before.kind === 'directory' && after.kind === 'directory'
      && before.mode !== after.mode) {
      effects.push(effect('mode', path, before, after));
    }
  }
  for (const [path, after] of afterByPath) {
    if (!beforeByPath.has(path)) added.set(path, after);
  }
  const derivedParentCreates = new Set<string>();
  for (const [path, entry] of added) {
    if (entry.kind !== 'regular-file') continue;
    let separator = path.lastIndexOf('/');
    while (separator !== -1) {
      const parent = path.slice(0, separator);
      derivedParentCreates.add(parent);
      separator = parent.lastIndexOf('/');
    }
  }
  for (const [path, before] of removed) {
    if (path !== '.') effects.push(effect('delete', path, before));
  }
  for (const [path, after] of added) {
    if (after.kind === 'directory' && derivedParentCreates.has(path)) continue;
    effects.push(effect('add', path, undefined, after));
  }

  const canonicalEffects = Object.freeze(
    effects.sort((left, right) => compareCodePoint(canonicalJson(left), canonicalJson(right))),
  );
  const policy = baseline.policy;
  if (policy.readOnly && canonicalEffects.length > 0) {
    holds.push({ code: 'READ_ONLY_ATTEMPT_MUTATED', paths: canonicalEffects.map(value => value.path) });
  }
  for (const observedEffect of canonicalEffects) {
    const path = observedEffect.path;
    if (path !== '.' && isExecutionEffectProtectedPath(path)) {
      holds.push({ code: 'PROTECTED_PATH_CHANGED', path });
    }
    if (!executionEffectPolicyAllowsPath(policy, path)) holds.push({ code: 'UNEXPECTED_PATH', path });
  }
  for (const hold of [...holds]) {
    for (const path of hold.paths ?? (hold.path ? [hold.path] : [])) {
      if (path !== '.' && isExecutionEffectProtectedPath(path)) {
        holds.push({ code: 'PROTECTED_PATH_CHANGED', path });
      }
    }
  }
  if (holds.length > 0) return holdDecision(holds, canonicalEffects);

  const effectDigest = sha256('execution-effect-set-v1', canonicalEffects.map(value => value.digest));
  const body = Object.freeze({
    version: EXECUTION_EFFECT_DECISION_VERSION,
    state: 'VERIFIED' as const,
    attempt: baseline.attempt,
    policyDigest: policy.digest,
    baselineDigest: baseline.digest,
    finalDigest: final.digest,
    effects: canonicalEffects,
    effectDigest,
  });
  return Object.freeze({ ...body, decisionDigest: sha256('execution-effect-decision-v1', body) });
}
