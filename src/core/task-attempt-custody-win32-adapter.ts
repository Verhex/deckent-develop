import { createHash, type Hash } from 'node:crypto';
import { isAbsolute, win32 as win32Path } from 'node:path';
import process from 'node:process';

import {
  loadExecAuthorityNative,
  type ExecAuthorityNativeCleanup,
  type ExecAuthorityNativeCustodyFacade,
  type ExecAuthorityNativeCustodyHandle,
  type ExecAuthorityNativeErrorCode,
  type ExecAuthorityNativeIdentity,
  type ExecAuthorityNativeOpen,
  type ExecAuthorityNativePublication,
  type ExecAuthorityNativeSealReconciliation,
} from './exec-authority-native.js';
import {
  TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  TaskAttemptCustodyHold,
  createTaskAttemptCustodyAdapterAbortResult,
  createTaskAttemptCustodyAdapterAppendResult,
  createTaskAttemptCustodyBackendMountTransferReceipt,
  createTaskAttemptCustodyDirectoryScanReceiptV2,
  taskAttemptCustodyRelativePath,
  type Sha256Digest,
  type TaskAttemptCustodyAdapter,
  type TaskAttemptCustodyAdapterAbortResult,
  type TaskAttemptCustodyAdapterAppendResult,
  type TaskAttemptCustodyAdapterBeginPublicationResult,
  type TaskAttemptCustodyAdapterPublicationToken,
  type TaskAttemptCustodyAdapterSealResult,
  type TaskAttemptCustodyArtifactLimit,
  type TaskAttemptCustodyBackendMountCapability,
  type TaskAttemptCustodyBackendMountTransferReceipt,
  type TaskAttemptCustodyDirectoryProof,
  type TaskAttemptCustodyDirectoryScanReceiptV2,
  type TaskAttemptCustodyDurableEffectMarker,
  type TaskAttemptCustodyDurableEffectPublication,
  type TaskAttemptCustodyFileProof,
  type TaskAttemptCustodyOperation,
  type TaskAttemptCustodyPathCapability,
  type TaskAttemptCustodyPathCapabilityAccess,
  type TaskAttemptCustodyPublication,
  type TaskAttemptCustodyRead,
  type TaskAttemptCustodyRelativePath,
  type TaskAttemptCustodyRootProof,
} from './task-attempt-custody-store.js';

const WIN32_CUSTODY_CONTRACT_VERSION = 'deckent-win32-attempt-custody-v1';
const WIN32_NATIVE_FEATURE = 'custody-win32-v1';
const EFFECT_MARKER_DIRECTORY = taskAttemptCustodyRelativePath('effects');
const EFFECT_MARKER_MAX_BYTES = 64 * 1024;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const WIN32_ZERO_REPARSE_TAG = '0x00000000';
const WIN32_OWNER_ALLOW_MASK = '0x001f01ff';
const WIN32_OWNER_DACL_ENTRY_COUNT = '1';

interface Win32RootBinding {
  readonly proof: TaskAttemptCustodyRootProof;
  readonly handle: ExecAuthorityNativeCustodyHandle;
  readonly identity: ExecAuthorityNativeIdentity;
}

interface Win32CapabilityScope {
  readonly rootId: Sha256Digest;
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly access: TaskAttemptCustodyPathCapabilityAccess;
  readonly scopeDigest: Sha256Digest;
  readonly capabilityEvidenceDigest: Sha256Digest;
}

type Win32MountCapabilityState = 'ISSUED' | 'CONSUMING' | 'CONSUMED' | 'CLEANUP_UNCONFIRMED';

interface Win32MountCapabilityScope {
  readonly root: Win32RootBinding;
  readonly taskSnapshotScope: Win32CapabilityScope;
  readonly workerOutputScope: Win32CapabilityScope;
  readonly taskSnapshotHandle: ExecAuthorityNativeCustodyHandle;
  readonly taskSnapshotIdentity: ExecAuthorityNativeIdentity;
  readonly workerOutputHandle: ExecAuthorityNativeCustodyHandle;
  readonly workerOutputIdentity: ExecAuthorityNativeIdentity;
  readonly openedHandles: readonly ExecAuthorityNativeCustodyHandle[];
  state: Win32MountCapabilityState;
}

type Win32PublicationState =
  | 'OPEN'
  | 'APPEND_FAILED'
  | 'SEALING'
  | 'PUBLISHED_UNCONFIRMED'
  | 'SEALED'
  | 'ABORTING'
  | 'ABORTED'
  | 'CLEANUP_UNCONFIRMED';

interface Win32PublicationScope {
  readonly root: Win32RootBinding;
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly policy: TaskAttemptCustodyArtifactLimit;
  readonly nativePublication: ExecAuthorityNativeCustodyHandle;
  readonly parentHandles: readonly ExecAuthorityNativeCustodyHandle[];
  readonly effectOpDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly generation: number;
  readonly hash: Hash;
  byteLength: number;
  appendSequence: number;
  state: Win32PublicationState;
}

interface OpenedDirectory {
  readonly handle: ExecAuthorityNativeCustodyHandle;
  readonly identity: ExecAuthorityNativeIdentity;
  readonly openedHandles: readonly ExecAuthorityNativeCustodyHandle[];
}

interface OpenedFile {
  readonly handle: ExecAuthorityNativeCustodyHandle;
  readonly identity: ExecAuthorityNativeIdentity;
  readonly openedHandles: readonly ExecAuthorityNativeCustodyHandle[];
}

/**
 * Exact in-process authority handed only to the constructor-injected Docker backend seam.
 * Opaque handles are never converted to strings/numbers and this record must never be serialized.
 */
export interface TaskAttemptCustodyWin32BackendMountInput {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-win32-backend-mount';
  readonly rootId: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly effectOpDigest: Sha256Digest;
  readonly attemptId: string;
  readonly generation: number;
  readonly taskSnapshot: Readonly<{
    readonly role: 'task-snapshot';
    readonly readOnly: true;
    readonly handle: ExecAuthorityNativeCustodyHandle;
    readonly identity: ExecAuthorityNativeIdentity;
  }>;
  readonly workerOutput: Readonly<{
    readonly role: 'worker-output';
    readonly readOnly: false;
    readonly handle: ExecAuthorityNativeCustodyHandle;
    readonly identity: ExecAuthorityNativeIdentity;
  }>;
}

export interface TaskAttemptCustodyWin32BackendMountResult {
  readonly state: 'CONSUMED';
  readonly evidenceDigest: Sha256Digest;
}

export type TaskAttemptCustodyWin32BackendMountConsumer = (
  input: TaskAttemptCustodyWin32BackendMountInput,
) => Promise<TaskAttemptCustodyWin32BackendMountResult>;

export interface TaskAttemptCustodyWin32AdapterOptions {
  readonly consumeBackendMount?: TaskAttemptCustodyWin32BackendMountConsumer;
}

function hold(
  code: TaskAttemptCustodyHold['code'],
  operation: TaskAttemptCustodyOperation,
): never {
  throw new TaskAttemptCustodyHold(code, operation);
}

function sha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digest(domain: string, values: readonly string[]): Sha256Digest {
  const hash = createHash('sha256');
  hash.update(WIN32_CUSTODY_CONTRACT_VERSION, 'utf8');
  hash.update('\0', 'utf8');
  hash.update(domain, 'utf8');
  for (const value of values) {
    hash.update('\0', 'utf8');
    hash.update(String(Buffer.byteLength(value, 'utf8')), 'utf8');
    hash.update(':', 'utf8');
    hash.update(value, 'utf8');
  }
  return `sha256:${hash.digest('hex')}`;
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function assertPolicy(policy: TaskAttemptCustodyArtifactLimit): void {
  if (
    !Number.isSafeInteger(policy.minBytes)
    || !Number.isSafeInteger(policy.maxBytes)
    || policy.minBytes < 0
    || policy.maxBytes <= 0
    || policy.minBytes > policy.maxBytes
    || policy.maxBytes > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
    || policy.requireSingleLink !== true
  ) hold('CAPABILITY_UNVERIFIED', 'probe');
}

function nativeErrorCode(error: unknown): ExecAuthorityNativeErrorCode | null {
  if (error === null || typeof error !== 'object') return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor !== undefined && 'value' in descriptor && typeof descriptor.value === 'string'
      ? descriptor.value as ExecAuthorityNativeErrorCode
      : null;
  } catch {
    return null;
  }
}

function isNativeNotFound(error: unknown): boolean {
  const code = nativeErrorCode(error);
  return code === 'E_EXEC_AUTH_NATIVE_NOT_FOUND' || code === 'ENOENT';
}

function mappedNativeHold(
  error: unknown,
  operation: TaskAttemptCustodyOperation,
  ioCode: TaskAttemptCustodyHold['code'] = 'ARTIFACT_CHANGED',
): never {
  if (error instanceof TaskAttemptCustodyHold) throw error;
  const code = nativeErrorCode(error);
  switch (code) {
    case 'E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE':
    case 'E_EXEC_AUTH_NATIVE_BACKEND_ABI':
    case 'E_EXEC_AUTH_NATIVE_INIT':
    case 'E_EXEC_AUTH_NATIVE_OPERATION':
      return hold('NATIVE_CAPABILITY_UNAVAILABLE', operation);
    case 'E_EXEC_AUTH_NATIVE_INVALID_COMPONENT':
    case 'EINVAL':
      return hold('UNSAFE_PATH_COMPONENT', operation);
    case 'E_EXEC_AUTH_NATIVE_REPARSE_REJECTED':
    case 'ELOOP':
      return hold('REPARSE_POINT', operation);
    case 'E_EXEC_AUTH_NATIVE_PRIVACY_UNCONFIRMED':
    case 'EACCES':
    case 'EPERM':
      return hold('PRIVACY_UNVERIFIED', operation);
    case 'E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH':
    case 'ENOTDIR':
    case 'EISDIR':
      return hold('NOT_REGULAR_FILE', operation);
    case 'E_EXEC_AUTH_NATIVE_LINK_COUNT_UNSAFE':
      return hold('LINK_COUNT_INVALID', operation);
    case 'E_EXEC_AUTH_NATIVE_SIZE_LIMIT':
      return hold('ARTIFACT_OVERSIZE', operation);
    case 'E_EXEC_AUTH_NATIVE_IDENTITY_CHANGED':
    case 'E_EXEC_AUTH_NATIVE_HANDLE_STALE':
      return hold('ARTIFACT_CHANGED', operation);
    case 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_BOUNDS':
      return hold('DISPATCH_DISCOVERY_BOUNDS_EXCEEDED', operation);
    case 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_DEADLINE':
      return hold('DISPATCH_DISCOVERY_DEADLINE_EXCEEDED', operation);
    case 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_MUTATED':
      return hold('DISPATCH_DISCOVERY_MUTATED', operation);
    case 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_ENTRY_INVALID':
      return hold('DISPATCH_DISCOVERY_MALFORMED_CANDIDATE', operation);
    case 'E_EXEC_AUTH_NATIVE_VOLUME_UNSUPPORTED':
    case 'E_EXEC_AUTH_NATIVE_REMOTE_VOLUME_UNSUPPORTED':
    case 'EXDEV':
      return hold('UNSUPPORTED_FILESYSTEM', operation);
    case 'E_EXEC_AUTH_NATIVE_ALREADY_EXISTS':
    case 'E_EXEC_AUTH_NATIVE_NAMESPACE_CONFLICT':
    case 'EEXIST':
    case 'ENOTEMPTY':
      return hold('FIRST_WRITER_COLLISION', operation);
    case 'E_EXEC_AUTH_NATIVE_DURABILITY_UNCONFIRMED':
      return hold('DURABILITY_UNCONFIRMED', operation);
    case 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED':
      return hold('PUBLISHED_UNCONFIRMED', operation);
    case 'E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED':
      return hold('CREATE_UNCONFIRMED', operation);
    case 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED':
    case 'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED':
      return hold('CLEANUP_UNCONFIRMED', operation);
    case 'E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED':
      return hold(ioCode, operation);
    case 'E_EXEC_AUTH_NATIVE_NOT_FOUND':
    case 'ENOENT':
      return hold('INCOMPLETE_PUBLICATION', operation);
    case 'E_EXEC_AUTH_NATIVE_HANDLE_LIMIT':
    case 'E_EXEC_AUTH_NATIVE_ALLOCATION':
      return hold('NATIVE_CAPABILITY_UNAVAILABLE', operation);
    default:
      return hold('CAPABILITY_UNVERIFIED', operation);
  }
}

function sameIdentity(
  left: ExecAuthorityNativeIdentity,
  right: ExecAuthorityNativeIdentity,
): boolean {
  return left.platform === right.platform
    && left.objectType === right.objectType
    && left.size === right.size
    && left.linkCount === right.linkCount
    && left.volumeId === right.volumeId
    && left.fileId === right.fileId
    && left.reparseTag === right.reparseTag
    && left.ownerSid === right.ownerSid
    && left.daclPresent === right.daclPresent
    && left.daclProtected === right.daclProtected
    && left.daclEntryCount === right.daclEntryCount
    && left.daclOwnerAllowMask === right.daclOwnerAllowMask
    && left.daclCanonicalHash === right.daclCanonicalHash
    && left.volumeRemote === right.volumeRemote;
}

function win32IdentityDigest(identity: ExecAuthorityNativeIdentity): Sha256Digest {
  return digest('directory-scan-native-identity', [
    identity.platform,
    identity.objectType,
    identity.size,
    identity.linkCount,
    identity.volumeId ?? '',
    identity.fileId ?? '',
    identity.reparseTag ?? '',
    identity.ownerSid ?? '',
    identity.daclCanonicalHash ?? '',
    identity.volumeCapabilities.join(','),
    String(identity.featureEvidenceBits),
  ]);
}

function assertWin32Identity(
  identity: ExecAuthorityNativeIdentity,
  objectType: 'DIRECTORY' | 'REGULAR_FILE',
  operation: TaskAttemptCustodyOperation,
): void {
  if (
    identity.platform !== 'win32'
    || identity.objectType !== objectType
    || identity.volumeId === null
    || identity.fileId === null
    || identity.reparseTag !== WIN32_ZERO_REPARSE_TAG
    || identity.ownerSid === null
    || identity.daclPresent !== true
    || identity.daclProtected !== true
    || identity.daclEntryCount !== WIN32_OWNER_DACL_ENTRY_COUNT
    || identity.daclOwnerAllowMask !== WIN32_OWNER_ALLOW_MASK
    || identity.daclCanonicalHash === null
    || identity.volumeRemote !== false
    || identity.volumeCapabilities.includes('REMOTE')
    || !identity.volumeCapabilities.includes('PERSISTENT_ACL')
    || !identity.volumeCapabilities.includes('STABLE_OBJECT_ID')
    || (objectType === 'REGULAR_FILE' && identity.linkCount !== '1')
  ) hold('CAPABILITY_UNVERIFIED', operation);
}

function assertSameVolume(
  root: Win32RootBinding,
  identity: ExecAuthorityNativeIdentity,
  operation: TaskAttemptCustodyOperation,
): void {
  if (identity.volumeId !== root.identity.volumeId) {
    hold('UNSUPPORTED_FILESYSTEM', operation);
  }
}

function assertSameProof(
  actual: TaskAttemptCustodyFileProof,
  expected: TaskAttemptCustodyFileProof,
  operation: TaskAttemptCustodyOperation,
): void {
  if (
    actual.relativePath !== expected.relativePath
    || actual.sha256 !== expected.sha256
    || actual.byteLength !== expected.byteLength
    || actual.volumeId !== expected.volumeId
    || actual.fileId !== expected.fileId
    || actual.linkCount !== expected.linkCount
    || actual.privacyEvidenceDigest !== expected.privacyEvidenceDigest
    || actual.durabilityEvidenceDigest !== expected.durabilityEvidenceDigest
  ) hold('ARTIFACT_CHANGED', operation);
}

function windowsPathsOverlap(left: string, right: string): boolean {
  const normalizedLeft = win32Path.resolve(left).replace(/[\\/]+$/u, '').toLowerCase();
  const normalizedRight = win32Path.resolve(right).replace(/[\\/]+$/u, '').toLowerCase();
  if (normalizedLeft === normalizedRight) return true;
  const leftToRight = win32Path.relative(normalizedLeft, normalizedRight);
  const rightToLeft = win32Path.relative(normalizedRight, normalizedLeft);
  return (!leftToRight.startsWith('..') && !win32Path.isAbsolute(leftToRight))
    || (!rightToLeft.startsWith('..') && !win32Path.isAbsolute(rightToLeft));
}

function markerRelativePath(
  opDigest: Sha256Digest,
  phase: TaskAttemptCustodyDurableEffectMarker['phase'],
): TaskAttemptCustodyRelativePath {
  if (!isDigest(opDigest)) hold('CAPABILITY_UNVERIFIED', 'read');
  return taskAttemptCustodyRelativePath(
    `${EFFECT_MARKER_DIRECTORY}/${opDigest.slice('sha256:'.length)}-${phase.toLowerCase()}.json`,
  );
}

function markerBytes(marker: TaskAttemptCustodyDurableEffectMarker): Uint8Array {
  return Buffer.from(JSON.stringify({
    schemaVersion: marker.schemaVersion,
    kind: marker.kind,
    phase: marker.phase,
    opDigest: marker.opDigest,
    outcomeDigest: marker.outcomeDigest,
    effectReceiptDigest: marker.effectReceiptDigest,
    effectEvidenceDigest: marker.effectEvidenceDigest,
    markerDigest: marker.markerDigest,
  }), 'utf8');
}

function parseMarker(bytes: Uint8Array): TaskAttemptCustodyDurableEffectMarker {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    return hold('CORRUPT_CUSTODY_RECORD', 'read');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return hold('CORRUPT_CUSTODY_RECORD', 'read');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = [
    'effectEvidenceDigest',
    'effectReceiptDigest',
    'kind',
    'markerDigest',
    'opDigest',
    'outcomeDigest',
    'phase',
    'schemaVersion',
  ];
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-effect-marker'
    || (record.phase !== 'INTENT' && record.phase !== 'OUTCOME')
    || !isDigest(record.opDigest)
    || (record.outcomeDigest !== null && !isDigest(record.outcomeDigest))
    || (record.effectReceiptDigest !== null && !isDigest(record.effectReceiptDigest))
    || (record.effectEvidenceDigest !== null && !isDigest(record.effectEvidenceDigest))
    || !isDigest(record.markerDigest)
  ) return hold('CORRUPT_CUSTODY_RECORD', 'read');
  return Object.freeze({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-effect-marker' as const,
    phase: record.phase,
    opDigest: record.opDigest,
    outcomeDigest: record.outcomeDigest,
    effectReceiptDigest: record.effectReceiptDigest,
    effectEvidenceDigest: record.effectEvidenceDigest,
    markerDigest: record.markerDigest,
  }) as TaskAttemptCustodyDurableEffectMarker;
}

class Win32TaskAttemptCustodyAdapter implements TaskAttemptCustodyAdapter {
  readonly platform = 'win32' as const;
  private readonly roots = new Map<Sha256Digest, Win32RootBinding>();
  private readonly capabilityScopes = new WeakMap<object, Win32CapabilityScope>();
  private readonly mountCapabilities = new WeakMap<object, Win32MountCapabilityScope>();
  private readonly publications = new WeakMap<object, Win32PublicationScope>();
  private readonly consumeBackendMount: TaskAttemptCustodyWin32BackendMountConsumer | null;

  constructor(options: TaskAttemptCustodyWin32AdapterOptions = {}) {
    this.consumeBackendMount = options.consumeBackendMount ?? null;
  }

  openRoot(input: {
    readonly absoluteRoot: string;
    readonly canonicalProjectRoot: string;
    readonly projectId: string;
    readonly create: boolean;
  }): TaskAttemptCustodyRootProof {
    const custody = this.requireNative('open-root');
    if (
      typeof input.absoluteRoot !== 'string'
      || typeof input.canonicalProjectRoot !== 'string'
      || typeof input.projectId !== 'string'
      || input.projectId.length === 0
      || Buffer.byteLength(input.projectId, 'utf8') > 512
      || typeof input.create !== 'boolean'
      || !isAbsolute(input.absoluteRoot)
      || !isAbsolute(input.canonicalProjectRoot)
      || input.absoluteRoot.includes('\0')
      || input.canonicalProjectRoot.includes('\0')
      || windowsPathsOverlap(input.absoluteRoot, input.canonicalProjectRoot)
    ) hold('UNSAFE_ROOT', 'open-root');

    let opened: ExecAuthorityNativeOpen | null = null;
    try {
      opened = custody.invoke('open-root', {
        path: input.absoluteRoot,
        disposition: input.create ? 'OPEN_OR_CREATE' : 'OPEN_EXISTING',
        privacyPolicy: 'OWNER_PRIVATE',
      });
      if (opened.state === 'CREATED') {
        custody.invoke('apply-private', { handle: opened.handle });
      }
      custody.invoke('sync', { handle: opened.handle });
    } catch (error) {
      if (opened !== null && !this.closeHandles(custody, [opened.handle])) {
        return hold('CLEANUP_UNCONFIRMED', 'open-root');
      }
      return mappedNativeHold(error, 'open-root');
    }
    let identity: ExecAuthorityNativeIdentity;
    let probeEvidence: number;
    try {
      identity = custody.invoke('identity', { handle: opened.handle });
      assertWin32Identity(identity, 'DIRECTORY', 'open-root');
      const probe = custody.invoke('probe', { handle: opened.handle });
      if (!probe.available || probe.identity === null) {
        if (!this.closeHandles(custody, [opened.handle])) {
          return hold('CLEANUP_UNCONFIRMED', 'probe');
        }
        return hold('UNSUPPORTED_FILESYSTEM', 'probe');
      }
      if (!sameIdentity(identity, probe.identity)) {
        if (!this.closeHandles(custody, [opened.handle])) {
          return hold('CLEANUP_UNCONFIRMED', 'probe');
        }
        return hold('ARTIFACT_CHANGED', 'probe');
      }
      probeEvidence = probe.featureEvidenceBits;
    } catch (error) {
      if (!this.closeHandles(custody, [opened.handle])) {
        return hold('CLEANUP_UNCONFIRMED', 'probe');
      }
      return mappedNativeHold(error, 'probe');
    }

    const volumeId = identity.volumeId as string;
    const directoryId = identity.fileId as string;
    const canonicalProjectRootSha256 = createHash('sha256')
      .update(input.canonicalProjectRoot, 'utf8')
      .digest('hex');
    const capabilityEvidenceDigest = digest('root-capability', [
      input.projectId,
      canonicalProjectRootSha256,
      volumeId,
      directoryId,
      identity.ownerSid as string,
      identity.daclCanonicalHash as string,
      String(probeEvidence),
      'protected-owner-only-dacl-readback',
      'reparse-rejected',
      'local-volume',
      'stable-object-id',
      'no-replace-publication',
      'file-and-directory-flush',
    ]);
    const proof = Object.freeze({
      platform: 'win32' as const,
      projectId: input.projectId,
      canonicalProjectRootSha256,
      rootId: digest('root', [
        input.projectId,
        canonicalProjectRootSha256,
        volumeId,
        directoryId,
        capabilityEvidenceDigest,
      ]),
      volumeId,
      directoryId,
      capabilityEvidenceDigest,
    });
    const existing = this.roots.get(proof.rootId);
    if (existing !== undefined) {
      const cleanupConfirmed = this.closeHandles(custody, [opened.handle]);
      if (!cleanupConfirmed) hold('CLEANUP_UNCONFIRMED', 'open-root');
      if (!sameIdentity(existing.identity, identity)) hold('ARTIFACT_CHANGED', 'open-root');
      return existing.proof;
    }
    const binding = Object.freeze({ proof, handle: opened.handle, identity });
    this.roots.set(proof.rootId, binding);
    return proof;
  }

  ensurePrivateDirectory(
    root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof {
    const custody = this.requireNative('create-directory');
    const binding = this.requireRoot(root, 'create-directory');
    const opened = this.openDirectory(binding, relativeDirectory, true, 'create-directory');
    let proof: TaskAttemptCustodyDirectoryProof;
    try {
      custody.invoke('sync', { handle: opened.handle });
      proof = this.directoryProof(relativeDirectory, opened.identity, binding);
    } catch (error) {
      if (!this.closeHandles(custody, opened.openedHandles)) {
        return hold('CLEANUP_UNCONFIRMED', 'create-directory');
      }
      return mappedNativeHold(error, 'create-directory');
    }
    if (!this.closeHandles(custody, opened.openedHandles)) {
      hold('CLEANUP_UNCONFIRMED', 'create-directory');
    }
    return proof;
  }

  readPrivateDirectory(
    root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof | null {
    const custody = this.requireNative('read');
    const binding = this.requireRoot(root, 'read');
    let opened: OpenedDirectory;
    try {
      opened = this.openDirectory(binding, relativeDirectory, false, 'read');
    } catch (error) {
      if (isNativeNotFound(error)) return null;
      return mappedNativeHold(error, 'read');
    }
    const proof = this.directoryProof(relativeDirectory, opened.identity, binding);
    if (!this.closeHandles(custody, opened.openedHandles)) {
      hold('CLEANUP_UNCONFIRMED', 'read');
    }
    return proof;
  }

  scanPrivateDirectoryBounded(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativeDirectory: TaskAttemptCustodyRelativePath;
    readonly maxEntries: number;
    readonly maxNameBytes: number;
    readonly deadlineUnixMs: number;
  }): TaskAttemptCustodyDirectoryScanReceiptV2 {
    const custody = this.requireNative('list-dispatch');
    const binding = this.requireRoot(input.root, 'list-dispatch');
    if (
      !Number.isSafeInteger(input.maxEntries)
      || input.maxEntries <= 0
      || input.maxEntries > 100_000
      || !Number.isSafeInteger(input.maxNameBytes)
      || input.maxNameBytes <= 0
      || input.maxNameBytes > 128
      || !Number.isSafeInteger(input.deadlineUnixMs)
      || input.deadlineUnixMs <= 0
    ) hold('DISPATCH_DISCOVERY_BOUNDS_EXCEEDED', 'list-dispatch');
    let opened: OpenedDirectory;
    try {
      opened = this.openDirectory(binding, input.relativeDirectory, false, 'list-dispatch');
    } catch (error) {
      return mappedNativeHold(error, 'list-dispatch', 'DISPATCH_DISCOVERY_MUTATED');
    }
    let receipt: TaskAttemptCustodyDirectoryScanReceiptV2;
    try {
      const scan = custody.invoke('scan-directory-bounded', {
        directory: opened.handle,
        maxEntries: input.maxEntries,
        maxNameBytes: input.maxNameBytes,
        deadlineUnixMs: input.deadlineUnixMs,
      });
      if (!sameIdentity(opened.identity, scan.before)
        || !sameIdentity(scan.before, scan.after)) {
        hold('DISPATCH_DISCOVERY_MUTATED', 'list-dispatch');
      }
      receipt = createTaskAttemptCustodyDirectoryScanReceiptV2({
        rootId: binding.proof.rootId,
        relativeDirectory: taskAttemptCustodyRelativePath(input.relativeDirectory),
        names: scan.names,
        entryCount: scan.entryCount,
        maxEntries: scan.requestedMaxEntries,
        maxNameBytes: scan.requestedMaxNameBytes,
        deadlineUnixMs: scan.deadlineUnixMs,
        nativeMutationEvidence: scan.mutationEvidence,
        nativeDirectoryIdentityBeforeDigest: win32IdentityDigest(scan.before),
        nativeDirectoryIdentityAfterDigest: win32IdentityDigest(scan.after),
      });
    } catch (error) {
      if (!this.closeHandles(custody, opened.openedHandles)) {
        return hold('CLEANUP_UNCONFIRMED', 'list-dispatch');
      }
      return mappedNativeHold(error, 'list-dispatch', 'DISPATCH_DISCOVERY_MUTATED');
    }
    if (!this.closeHandles(custody, opened.openedHandles)) {
      hold('CLEANUP_UNCONFIRMED', 'list-dispatch');
    }
    return receipt;
  }

  issuePathCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly access: TaskAttemptCustodyPathCapabilityAccess;
    readonly scopeDigest: Sha256Digest;
  }): TaskAttemptCustodyPathCapability {
    const binding = this.requireRoot(input.root, 'probe');
    const relativePath = taskAttemptCustodyRelativePath(input.relativePath);
    if (
      !isDigest(input.scopeDigest)
      || !['read-only-file', 'read-write-directory', 'capture-read-file'].includes(input.access)
    ) hold('CAPABILITY_UNVERIFIED', 'probe');
    const capabilityEvidenceDigest = digest('path-capability', [
      binding.proof.rootId,
      input.access,
      input.scopeDigest,
      sha256(Buffer.from(relativePath, 'utf8')),
    ]);
    const capability = Object.freeze({
      kind: 'task-attempt-custody-path-capability' as const,
      access: input.access,
      rootId: binding.proof.rootId,
      scopeDigest: input.scopeDigest,
      capabilityEvidenceDigest,
    }) as TaskAttemptCustodyPathCapability;
    this.capabilityScopes.set(capability, Object.freeze({
      rootId: binding.proof.rootId,
      relativePath,
      access: input.access,
      scopeDigest: input.scopeDigest,
      capabilityEvidenceDigest,
    }));
    return capability;
  }

  issueBackendMountCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly taskSnapshot: TaskAttemptCustodyPathCapability;
    readonly workerOutput: TaskAttemptCustodyPathCapability;
  }): TaskAttemptCustodyBackendMountCapability {
    const custody = this.requireNative('resolve-mount');
    const binding = this.requireRoot(input.root, 'resolve-mount');
    const taskScope = this.requireCapability(input.taskSnapshot, 'read-only-file', binding);
    const outputScope = this.requireCapability(input.workerOutput, 'read-write-directory', binding);
    if (taskScope.scopeDigest !== outputScope.scopeDigest) {
      hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    }
    const task = this.openFile(binding, taskScope.relativePath, 'resolve-mount');
    let output: OpenedDirectory;
    try {
      output = this.openDirectory(binding, outputScope.relativePath, false, 'resolve-mount');
    } catch (error) {
      if (!this.closeHandles(custody, task.openedHandles)) {
        return hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
      }
      return mappedNativeHold(error, 'resolve-mount');
    }
    const capability = Object.freeze(Object.create(null)) as TaskAttemptCustodyBackendMountCapability;
    this.mountCapabilities.set(capability, {
      root: binding,
      taskSnapshotScope: taskScope,
      workerOutputScope: outputScope,
      taskSnapshotHandle: task.handle,
      taskSnapshotIdentity: task.identity,
      workerOutputHandle: output.handle,
      workerOutputIdentity: output.identity,
      openedHandles: Object.freeze([...task.openedHandles, ...output.openedHandles]),
      state: 'ISSUED',
    });
    return capability;
  }

  async consumeBackendMountCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly capability: TaskAttemptCustodyBackendMountCapability;
    readonly scopeDigest: Sha256Digest;
    readonly effectOpDigest: Sha256Digest;
    readonly attemptId: string;
    readonly generation: number;
  }): Promise<TaskAttemptCustodyBackendMountTransferReceipt> {
    const custody = this.requireNative('resolve-mount');
    const binding = this.requireRoot(input.root, 'resolve-mount');
    const scope = this.mountCapabilities.get(input.capability);
    if (
      scope === undefined
      || scope.root !== binding
      || scope.state !== 'ISSUED'
      || input.scopeDigest !== scope.taskSnapshotScope.scopeDigest
      || input.scopeDigest !== scope.workerOutputScope.scopeDigest
      || !isDigest(input.scopeDigest)
      || !isDigest(input.effectOpDigest)
      || !UUID_PATTERN.test(input.attemptId)
      || !Number.isSafeInteger(input.generation)
      || input.generation <= 0
    ) hold('LEASE_CONSUMED', 'resolve-mount');
    scope.state = 'CONSUMING';

    if (this.consumeBackendMount === null) {
      const cleanupConfirmed = this.closeHandles(custody, scope.openedHandles);
      scope.state = cleanupConfirmed ? 'CONSUMED' : 'CLEANUP_UNCONFIRMED';
      return cleanupConfirmed
        ? hold('NATIVE_CAPABILITY_UNAVAILABLE', 'resolve-mount')
        : hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
    }

    let consumerEvidence: Sha256Digest;
    try {
      this.assertHandleIdentity(
        custody,
        scope.taskSnapshotHandle,
        scope.taskSnapshotIdentity,
        'resolve-mount',
      );
      this.assertHandleIdentity(
        custody,
        scope.workerOutputHandle,
        scope.workerOutputIdentity,
        'resolve-mount',
      );
      const result = await this.consumeBackendMount(Object.freeze({
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-win32-backend-mount' as const,
        rootId: binding.proof.rootId,
        scopeDigest: input.scopeDigest,
        effectOpDigest: input.effectOpDigest,
        attemptId: input.attemptId,
        generation: input.generation,
        taskSnapshot: Object.freeze({
          role: 'task-snapshot' as const,
          readOnly: true as const,
          handle: scope.taskSnapshotHandle,
          identity: scope.taskSnapshotIdentity,
        }),
        workerOutput: Object.freeze({
          role: 'worker-output' as const,
          readOnly: false as const,
          handle: scope.workerOutputHandle,
          identity: scope.workerOutputIdentity,
        }),
      }));
      if (result?.state !== 'CONSUMED' || !isDigest(result.evidenceDigest)) {
        hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
      }
      consumerEvidence = result.evidenceDigest;
      this.assertHandleIdentity(
        custody,
        scope.taskSnapshotHandle,
        scope.taskSnapshotIdentity,
        'resolve-mount',
      );
      this.assertHandleIdentity(
        custody,
        scope.workerOutputHandle,
        scope.workerOutputIdentity,
        'resolve-mount',
      );
    } catch {
      const cleanupConfirmed = this.closeHandles(custody, scope.openedHandles);
      scope.state = cleanupConfirmed ? 'CONSUMED' : 'CLEANUP_UNCONFIRMED';
      return createTaskAttemptCustodyBackendMountTransferReceipt({
        state: 'CLEANUP_UNCONFIRMED',
        rootId: binding.proof.rootId,
        scopeDigest: input.scopeDigest,
        effectOpDigest: input.effectOpDigest,
        attemptId: input.attemptId,
        generation: input.generation,
        backend: 'docker',
        backendExecutionId: null,
        backendImageDigest: null,
        backendAuthorityLabelDigest: null,
        taskSnapshotMountEvidenceDigest: null,
        workerOutputMountEvidenceDigest: null,
        backendBootstrapProbeEvidenceDigest: null,
        daemonMountReceiptDigest: null,
        cleanupEvidenceDigest: digest('mount-cleanup-unconfirmed', [
          binding.proof.rootId,
          input.effectOpDigest,
          String(cleanupConfirmed),
        ]),
      });
    }
    const cleanupConfirmed = this.closeHandles(custody, scope.openedHandles);
    scope.state = 'CLEANUP_UNCONFIRMED';
    return createTaskAttemptCustodyBackendMountTransferReceipt({
      // Windows-native Docker mount attestation is deferred to MASTER 8032.
      // A legacy consumer digest cannot mint the new exact daemon receipt.
      state: 'CLEANUP_UNCONFIRMED',
      rootId: binding.proof.rootId,
      scopeDigest: input.scopeDigest,
      effectOpDigest: input.effectOpDigest,
      attemptId: input.attemptId,
      generation: input.generation,
      backend: 'docker',
      backendExecutionId: null,
      backendImageDigest: null,
      backendAuthorityLabelDigest: null,
      taskSnapshotMountEvidenceDigest: null,
      workerOutputMountEvidenceDigest: null,
      backendBootstrapProbeEvidenceDigest: null,
      daemonMountReceiptDigest: null,
      cleanupEvidenceDigest: digest('mount-cleanup-unconfirmed', [
        binding.proof.rootId,
        input.effectOpDigest,
        String(cleanupConfirmed),
        consumerEvidence,
        'windows-native-structured-docker-receipt-deferred',
      ]),
    });
  }

  readDurableEffectMarker(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly opDigest: Sha256Digest;
    readonly phase: TaskAttemptCustodyDurableEffectMarker['phase'];
  }): TaskAttemptCustodyDurableEffectMarker | null {
    if (input.phase !== 'INTENT' && input.phase !== 'OUTCOME') {
      hold('CAPABILITY_UNVERIFIED', 'read');
    }
    const read = this.readFirstWriter({
      root: input.root,
      relativePath: markerRelativePath(input.opDigest, input.phase),
      policy: Object.freeze({
        minBytes: 1,
        maxBytes: EFFECT_MARKER_MAX_BYTES,
        requireSingleLink: true as const,
      }),
    });
    if (read === null) return null;
    const marker = parseMarker(read.bytes);
    if (marker.opDigest !== input.opDigest || marker.phase !== input.phase) {
      hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    return marker;
  }

  publishDurableEffectMarkerFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly marker: TaskAttemptCustodyDurableEffectMarker;
  }): TaskAttemptCustodyDurableEffectPublication {
    this.ensurePrivateDirectory(input.root, EFFECT_MARKER_DIRECTORY);
    const bytes = markerBytes(input.marker);
    if (bytes.byteLength > EFFECT_MARKER_MAX_BYTES) {
      hold('ARTIFACT_OVERSIZE', 'publish');
    }
    const publication = this.publishBytesFirstWriter({
      root: input.root,
      relativePath: markerRelativePath(input.marker.opDigest, input.marker.phase),
      bytes,
      policy: Object.freeze({
        minBytes: 1,
        maxBytes: EFFECT_MARKER_MAX_BYTES,
        requireSingleLink: true as const,
      }),
    });
    return Object.freeze({ state: publication.state, marker: input.marker });
  }

  publishBytesFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly bytes: Uint8Array;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication {
    const bytes = Uint8Array.from(input.bytes);
    assertPolicy(input.policy);
    if (bytes.byteLength < input.policy.minBytes || bytes.byteLength > input.policy.maxBytes) {
      hold('ARTIFACT_OVERSIZE', 'publish');
    }
    const binding = this.requireRoot(input.root, 'publish');
    const scopeDigest = digest('direct-publication-scope', [
      binding.proof.rootId,
      input.relativePath,
      String(input.policy.minBytes),
      String(input.policy.maxBytes),
    ]);
    const effectOpDigest = digest('direct-publication-effect', [
      scopeDigest,
      sha256(bytes),
    ]);
    const begin = this.beginFirstWriterPublication({
      root: input.root,
      relativePath: input.relativePath,
      policy: input.policy,
      effectOpDigest,
      scopeDigest,
      generation: 1,
    });
    if (begin.state !== 'CREATED' || begin.publication === null) {
      return this.holdForBeginState(begin.state);
    }
    if (bytes.byteLength > 0) {
      this.appendFirstWriterPublication({
        publication: begin.publication,
        bytes,
        effectOpDigest,
        scopeDigest,
        generation: 1,
      });
    }
    const seal = this.sealFirstWriterPublication({
      publication: begin.publication,
      effectOpDigest,
      scopeDigest,
      generation: 1,
    });
    if (seal.state !== 'PUBLISHED' || seal.publication === null) {
      return this.holdForSealState(seal.state);
    }
    return seal.publication;
  }

  readFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null {
    assertPolicy(input.policy);
    const custody = this.requireNative('read');
    const binding = this.requireRoot(input.root, 'read');
    let opened: OpenedFile;
    try {
      opened = this.openFile(binding, input.relativePath, 'read');
    } catch (error) {
      if (isNativeNotFound(error)) return null;
      return mappedNativeHold(error, 'read');
    }
    let result: TaskAttemptCustodyRead;
    try {
      const maxBytes = input.policy.maxBytes + 1;
      const read = custody.invoke('read-bounded', { file: opened.handle, maxBytes });
      if (
        !read.eof
        || read.observedBytes < input.policy.minBytes
        || read.observedBytes > input.policy.maxBytes
        || read.before.size !== String(read.observedBytes)
        || !sameIdentity(read.before, read.after)
      ) hold('ARTIFACT_OVERSIZE', 'read');
      result = Object.freeze({
        bytes: Uint8Array.from(read.bytes),
        proof: this.fileProof(
          input.relativePath,
          read.after,
          sha256(read.bytes),
          read.observedBytes,
          binding,
        ),
      });
    } catch (error) {
      if (!this.closeHandles(custody, opened.openedHandles)) {
        return hold('CLEANUP_UNCONFIRMED', 'read');
      }
      return mappedNativeHold(error, 'read');
    }
    if (!this.closeHandles(custody, opened.openedHandles)) {
      hold('CLEANUP_UNCONFIRMED', 'read');
    }
    return result;
  }

  readVerified(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly proof: TaskAttemptCustodyFileProof;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null {
    const read = this.readFirstWriter({
      root: input.root,
      relativePath: input.proof.relativePath,
      policy: input.policy,
    });
    if (read === null) return null;
    assertSameProof(read.proof, input.proof, 'read');
    return read;
  }

  captureStableFile(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly source: TaskAttemptCustodyPathCapability;
    readonly frozenRelativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication {
    const binding = this.requireRoot(input.root, 'capture');
    const source = this.requireCapability(input.source, 'capture-read-file', binding);
    const read = this.readFirstWriter({
      root: input.root,
      relativePath: source.relativePath,
      policy: input.policy,
    });
    if (read === null) hold('INCOMPLETE_PUBLICATION', 'capture');
    return this.publishBytesFirstWriter({
      root: input.root,
      relativePath: input.frozenRelativePath,
      bytes: read.bytes,
      policy: input.policy,
    });
  }

  beginFirstWriterPublication(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterBeginPublicationResult {
    assertPolicy(input.policy);
    if (
      !isDigest(input.effectOpDigest)
      || !isDigest(input.scopeDigest)
      || !Number.isSafeInteger(input.generation)
      || input.generation <= 0
    ) hold('CREATE_UNCONFIRMED', 'seal-stream');
    const custody = this.requireNative('seal-stream');
    const binding = this.requireRoot(input.root, 'seal-stream');
    const relativePath = taskAttemptCustodyRelativePath(input.relativePath);
    let parent: OpenedDirectory;
    try {
      parent = this.openParent(binding, relativePath, 'seal-stream');
    } catch (error) {
      return mappedNativeHold(error, 'seal-stream');
    }
    let nativePublication: ExecAuthorityNativeCustodyHandle | null = null;
    try {
      nativePublication = custody.invoke('begin-publication', {
        parent: parent.handle,
        name: relativePath.split('/').at(-1) as string,
        maxBytes: input.policy.maxBytes,
      });
      custody.invoke('apply-private', { handle: nativePublication });
      const identity = custody.invoke('identity', { handle: nativePublication });
      assertWin32Identity(identity, 'REGULAR_FILE', 'seal-stream');
      assertSameVolume(binding, identity, 'seal-stream');
    } catch (error) {
      let publicationCleanupConfirmed = true;
      if (nativePublication !== null) {
        try {
          const cleanup = custody.invoke('abort-publication', {
            publication: nativePublication,
          });
          publicationCleanupConfirmed = cleanup.state === 'CLEANUP_CONFIRMED';
        } catch {
          publicationCleanupConfirmed = false;
        }
      }
      const cleanupConfirmed = publicationCleanupConfirmed
        && this.closeHandles(custody, parent.openedHandles);
      const code = nativeErrorCode(error);
      const state: TaskAttemptCustodyAdapterBeginPublicationResult['state'] =
        !cleanupConfirmed || code === 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED'
          ? 'CLEANUP_UNCONFIRMED'
          : code === 'E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED'
            ? 'CREATE_UNCONFIRMED'
            : 'NO_EFFECT_ABORTED';
      return Object.freeze({
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-publication-begin' as const,
        state,
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: digest('publication-begin-failure', [
          binding.proof.rootId,
          relativePath,
          input.effectOpDigest,
          state,
        ]),
        publication: null,
      });
    }
    if (nativePublication === null) {
      if (!this.closeHandles(custody, parent.openedHandles)) {
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      hold('CREATE_UNCONFIRMED', 'seal-stream');
    }
    const token = Object.freeze(Object.create(null)) as TaskAttemptCustodyAdapterPublicationToken;
    this.publications.set(token, {
      root: binding,
      relativePath,
      policy: input.policy,
      nativePublication,
      parentHandles: parent.openedHandles,
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      hash: createHash('sha256'),
      byteLength: 0,
      appendSequence: 0,
      state: 'OPEN',
    });
    return Object.freeze({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-publication-begin' as const,
      state: 'CREATED' as const,
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      evidenceDigest: digest('publication-begin', [
        binding.proof.rootId,
        relativePath,
        input.effectOpDigest,
        input.scopeDigest,
        String(input.generation),
      ]),
      publication: token,
    });
  }

  appendFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly bytes: Uint8Array;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAppendResult {
    const custody = this.requireNative('seal-stream');
    const scope = this.requirePublication(
      input.publication,
      input.effectOpDigest,
      input.scopeDigest,
      input.generation,
      ['OPEN'],
      'APPEND_FAILED',
    );
    const bytes = Uint8Array.from(input.bytes);
    const nextLength = scope.byteLength + bytes.byteLength;
    if (!Number.isSafeInteger(nextLength) || nextLength > scope.policy.maxBytes) {
      scope.state = 'APPEND_FAILED';
      hold('ARTIFACT_OVERSIZE', 'seal-stream');
    }
    try {
      custody.invoke('append-publication', {
        publication: scope.nativePublication,
        bytes,
      });
    } catch (error) {
      scope.state = nativeErrorCode(error) === 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED'
        ? 'CLEANUP_UNCONFIRMED'
        : 'APPEND_FAILED';
      return mappedNativeHold(error, 'seal-stream', 'APPEND_FAILED');
    }
    scope.hash.update(bytes);
    scope.byteLength = nextLength;
    scope.appendSequence += 1;
    return createTaskAttemptCustodyAdapterAppendResult({
      state: 'APPENDED',
      byteLength: bytes.byteLength,
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      evidenceDigest: digest('publication-append', [
        scope.root.proof.rootId,
        scope.relativePath,
        input.effectOpDigest,
        String(scope.appendSequence),
        String(bytes.byteLength),
        sha256(bytes),
      ]),
    });
  }

  sealFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterSealResult {
    const custody = this.requireNative('seal-stream');
    const scope = this.requirePublication(
      input.publication,
      input.effectOpDigest,
      input.scopeDigest,
      input.generation,
      ['OPEN'],
      'PUBLISHED_UNCONFIRMED',
    );
    if (scope.byteLength < scope.policy.minBytes) {
      this.abortFirstWriterPublication(input);
      return this.sealState(scope, 'NO_EFFECT_ABORTED', null);
    }
    scope.state = 'SEALING';
    const expectedSha256 = `sha256:${scope.hash.copy().digest('hex')}` as Sha256Digest;
    let publication: ExecAuthorityNativePublication;
    try {
      custody.invoke('sync', { handle: scope.nativePublication });
      publication = custody.invoke('seal-publication', {
        publication: scope.nativePublication,
      });
    } catch (error) {
      return this.reconcileSealException(custody, scope, error);
    }
    if (publication.state === 'PUBLISHED_UNCONFIRMED') {
      return this.reconcileSealResult(custody, scope);
    }
    if (publication.readHandle === null || publication.identity === null) {
      scope.state = 'PUBLISHED_UNCONFIRMED';
      return this.sealState(scope, 'PUBLISHED_UNCONFIRMED', null);
    }
    let proof: TaskAttemptCustodyFileProof;
    try {
      const read = custody.invoke('read-bounded', {
        file: publication.readHandle,
        maxBytes: scope.policy.maxBytes + 1,
      });
      if (
        !read.eof
        || read.observedBytes !== scope.byteLength
        || sha256(read.bytes) !== expectedSha256
        || !sameIdentity(read.before, publication.identity)
      ) hold('ARTIFACT_CHANGED', 'seal-stream');
      custody.invoke('sync', { handle: scope.parentHandles.at(-1) ?? scope.root.handle });
      proof = this.fileProof(
        scope.relativePath,
        publication.identity,
        expectedSha256,
        scope.byteLength,
        scope.root,
      );
    } catch (error) {
      const cleanupConfirmed = this.closeHandles(custody, [
        publication.readHandle,
        ...scope.parentHandles,
      ]);
      scope.state = 'PUBLISHED_UNCONFIRMED';
      return this.sealState(
        scope,
        !cleanupConfirmed || nativeErrorCode(error) === 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED'
          ? 'CLEANUP_UNCONFIRMED'
          : 'PUBLISHED_UNCONFIRMED',
        null,
      );
    }
    const cleanupConfirmed = this.closeHandles(custody, [
      publication.readHandle,
      ...scope.parentHandles,
    ]);
    if (!cleanupConfirmed) {
      scope.state = 'CLEANUP_UNCONFIRMED';
      return this.sealState(scope, 'CLEANUP_UNCONFIRMED', null);
    }
    scope.state = 'SEALED';
    return this.sealState(scope, 'PUBLISHED', Object.freeze({
      state: publication.state,
      proof,
    }));
  }

  abortFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAbortResult {
    const custody = this.requireNative('seal-stream');
    const scope = this.requirePublication(
      input.publication,
      input.effectOpDigest,
      input.scopeDigest,
      input.generation,
      ['OPEN', 'APPEND_FAILED'],
      'CLEANUP_UNCONFIRMED',
    );
    scope.state = 'ABORTING';
    let cleanup: ExecAuthorityNativeCleanup;
    try {
      cleanup = custody.invoke('abort-publication', {
        publication: scope.nativePublication,
      });
    } catch {
      this.closeHandles(custody, scope.parentHandles);
      scope.state = 'CLEANUP_UNCONFIRMED';
      return createTaskAttemptCustodyAdapterAbortResult({
        state: 'CLEANUP_UNCONFIRMED',
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: digest('publication-abort-unconfirmed', [
          scope.root.proof.rootId,
          scope.relativePath,
          input.effectOpDigest,
        ]),
      });
    }
    const parentCleanupConfirmed = this.closeHandles(custody, scope.parentHandles);
    const confirmed = cleanup.state === 'CLEANUP_CONFIRMED' && parentCleanupConfirmed;
    scope.state = confirmed ? 'ABORTED' : 'CLEANUP_UNCONFIRMED';
    return createTaskAttemptCustodyAdapterAbortResult({
      state: confirmed ? 'ABORTED' : 'CLEANUP_UNCONFIRMED',
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      evidenceDigest: digest('publication-abort', [
        scope.root.proof.rootId,
        scope.relativePath,
        input.effectOpDigest,
        confirmed ? 'confirmed' : 'cleanup-unconfirmed',
      ]),
    });
  }

  private requireNative(operation: TaskAttemptCustodyOperation): ExecAuthorityNativeCustodyFacade {
    if (process.platform !== 'win32') {
      hold('NATIVE_CAPABILITY_UNAVAILABLE', operation);
    }
    const state = loadExecAuthorityNative();
    if (
      !state.available
      || state.manifest.platform !== 'win32'
      || !state.manifest.features.includes(WIN32_NATIVE_FEATURE)
    ) hold('NATIVE_CAPABILITY_UNAVAILABLE', operation);
    return state.custody;
  }

  private requireRoot(
    root: TaskAttemptCustodyRootProof,
    operation: TaskAttemptCustodyOperation,
  ): Win32RootBinding {
    if (
      root.platform !== 'win32'
      || !isDigest(root.rootId)
      || !isDigest(root.capabilityEvidenceDigest)
    ) hold('CAPABILITY_UNVERIFIED', operation);
    const binding = this.roots.get(root.rootId);
    if (
      binding === undefined
      || binding.proof.platform !== root.platform
      || binding.proof.projectId !== root.projectId
      || binding.proof.canonicalProjectRootSha256 !== root.canonicalProjectRootSha256
      || binding.proof.volumeId !== root.volumeId
      || binding.proof.directoryId !== root.directoryId
      || binding.proof.capabilityEvidenceDigest !== root.capabilityEvidenceDigest
    ) hold('CAPABILITY_UNVERIFIED', operation);
    return binding;
  }

  private requireCapability(
    capability: TaskAttemptCustodyPathCapability,
    access: TaskAttemptCustodyPathCapabilityAccess,
    root: Win32RootBinding,
  ): Win32CapabilityScope {
    const scope = this.capabilityScopes.get(capability);
    if (
      scope === undefined
      || scope.rootId !== root.proof.rootId
      || scope.access !== access
      || capability.kind !== 'task-attempt-custody-path-capability'
      || capability.access !== scope.access
      || capability.rootId !== scope.rootId
      || capability.scopeDigest !== scope.scopeDigest
      || capability.capabilityEvidenceDigest !== scope.capabilityEvidenceDigest
    ) hold('CAPABILITY_UNVERIFIED', 'probe');
    return scope;
  }

  private requirePublication(
    token: TaskAttemptCustodyAdapterPublicationToken,
    effectOpDigest: Sha256Digest,
    scopeDigest: Sha256Digest,
    generation: number,
    states: readonly Win32PublicationState[],
    failure: TaskAttemptCustodyHold['code'],
  ): Win32PublicationScope {
    const scope = this.publications.get(token);
    if (
      scope === undefined
      || !states.includes(scope.state)
      || scope.effectOpDigest !== effectOpDigest
      || scope.scopeDigest !== scopeDigest
      || scope.generation !== generation
    ) hold(failure, 'seal-stream');
    return scope;
  }

  private openDirectory(
    root: Win32RootBinding,
    relativePath: TaskAttemptCustodyRelativePath,
    create: boolean,
    operation: TaskAttemptCustodyOperation,
  ): OpenedDirectory {
    const custody = this.requireNative(operation);
    const components = taskAttemptCustodyRelativePath(relativePath).split('/');
    const openedHandles: ExecAuthorityNativeCustodyHandle[] = [];
    let parent = root.handle;
    let identity = root.identity;
    try {
      for (const component of components) {
        const opened = custody.invoke('open-directory-at', {
          parent,
          name: component,
          disposition: create ? 'OPEN_OR_CREATE' : 'OPEN_EXISTING',
          privacyPolicy: 'OWNER_PRIVATE',
        });
        openedHandles.push(opened.handle);
        if (opened.state === 'CREATED') {
          custody.invoke('apply-private', { handle: opened.handle });
        }
        const confirmed = custody.invoke('identity', { handle: opened.handle });
        assertWin32Identity(confirmed, 'DIRECTORY', operation);
        assertSameVolume(root, confirmed, operation);
        if (!sameIdentity(opened.identity, confirmed)) hold('ARTIFACT_CHANGED', operation);
        custody.invoke('sync', { handle: opened.handle });
        if (opened.state === 'CREATED') custody.invoke('sync', { handle: parent });
        parent = opened.handle;
        identity = confirmed;
      }
      return Object.freeze({
        handle: parent,
        identity,
        openedHandles: Object.freeze(openedHandles),
      });
    } catch (error) {
      const cleanupConfirmed = this.closeHandles(custody, openedHandles);
      if (!cleanupConfirmed) hold('CLEANUP_UNCONFIRMED', operation);
      throw error;
    }
  }

  private openParent(
    root: Win32RootBinding,
    relativePath: TaskAttemptCustodyRelativePath,
    operation: TaskAttemptCustodyOperation,
  ): OpenedDirectory {
    const components = taskAttemptCustodyRelativePath(relativePath).split('/');
    if (components.length === 1) {
      return Object.freeze({
        handle: root.handle,
        identity: root.identity,
        openedHandles: Object.freeze([]),
      });
    }
    return this.openDirectory(
      root,
      taskAttemptCustodyRelativePath(components.slice(0, -1).join('/')),
      false,
      operation,
    );
  }

  private openFile(
    root: Win32RootBinding,
    relativePath: TaskAttemptCustodyRelativePath,
    operation: TaskAttemptCustodyOperation,
  ): OpenedFile {
    const custody = this.requireNative(operation);
    const canonical = taskAttemptCustodyRelativePath(relativePath);
    const parent = this.openParent(root, canonical, operation);
    let opened: ExecAuthorityNativeOpen | null = null;
    try {
      opened = custody.invoke('open-file-at', {
        parent: parent.handle,
        name: canonical.split('/').at(-1) as string,
        disposition: 'OPEN_EXISTING',
        privacyPolicy: 'OWNER_PRIVATE',
      });
      const identity = custody.invoke('identity', { handle: opened.handle });
      assertWin32Identity(identity, 'REGULAR_FILE', operation);
      assertSameVolume(root, identity, operation);
      if (!sameIdentity(opened.identity, identity)) hold('ARTIFACT_CHANGED', operation);
      return Object.freeze({
        handle: opened.handle,
        identity,
        openedHandles: Object.freeze([...parent.openedHandles, opened.handle]),
      });
    } catch (error) {
      const cleanupConfirmed = this.closeHandles(custody, [
        ...(opened === null ? [] : [opened.handle]),
        ...parent.openedHandles,
      ]);
      if (!cleanupConfirmed) hold('CLEANUP_UNCONFIRMED', operation);
      throw error;
    }
  }

  private assertHandleIdentity(
    custody: ExecAuthorityNativeCustodyFacade,
    handle: ExecAuthorityNativeCustodyHandle,
    expected: ExecAuthorityNativeIdentity,
    operation: TaskAttemptCustodyOperation,
  ): void {
    let actual: ExecAuthorityNativeIdentity;
    try {
      actual = custody.invoke('identity', { handle });
    } catch (error) {
      return mappedNativeHold(error, operation);
    }
    if (!sameIdentity(actual, expected)) hold('ARTIFACT_CHANGED', operation);
  }

  private closeHandles(
    custody: ExecAuthorityNativeCustodyFacade,
    handles: readonly ExecAuthorityNativeCustodyHandle[],
  ): boolean {
    let confirmed = true;
    const closed = new Set<ExecAuthorityNativeCustodyHandle>();
    for (const handle of [...handles].reverse()) {
      if (closed.has(handle)) continue;
      closed.add(handle);
      try {
        custody.closeHandle(handle);
      } catch {
        confirmed = false;
      }
    }
    return confirmed;
  }

  private directoryProof(
    relativePath: TaskAttemptCustodyRelativePath,
    identity: ExecAuthorityNativeIdentity,
    root: Win32RootBinding,
  ): TaskAttemptCustodyDirectoryProof {
    assertWin32Identity(identity, 'DIRECTORY', 'read');
    assertSameVolume(root, identity, 'read');
    return Object.freeze({
      relativePath,
      volumeId: identity.volumeId as string,
      directoryId: identity.fileId as string,
      privacyEvidenceDigest: digest('directory-privacy', [
        root.proof.rootId,
        relativePath,
        identity.volumeId as string,
        identity.fileId as string,
        identity.ownerSid as string,
        identity.daclCanonicalHash as string,
        'protected-owner-only-dacl-readback',
        'reparse-rejected',
        'local-volume',
      ]),
      durabilityEvidenceDigest: digest('directory-durability', [
        root.proof.rootId,
        relativePath,
        identity.volumeId as string,
        identity.fileId as string,
        'native-directory-handle-flush',
      ]),
    });
  }

  private fileProof(
    relativePath: TaskAttemptCustodyRelativePath,
    identity: ExecAuthorityNativeIdentity,
    contentSha256: Sha256Digest,
    byteLength: number,
    root: Win32RootBinding,
  ): TaskAttemptCustodyFileProof {
    assertWin32Identity(identity, 'REGULAR_FILE', 'read');
    assertSameVolume(root, identity, 'read');
    if (identity.size !== String(byteLength) || identity.linkCount !== '1') {
      hold('ARTIFACT_CHANGED', 'read');
    }
    return Object.freeze({
      relativePath,
      sha256: contentSha256,
      byteLength,
      volumeId: identity.volumeId as string,
      fileId: identity.fileId as string,
      linkCount: 1 as const,
      privacyEvidenceDigest: digest('file-privacy', [
        root.proof.rootId,
        relativePath,
        identity.volumeId as string,
        identity.fileId as string,
        identity.ownerSid as string,
        identity.daclCanonicalHash as string,
        'protected-owner-only-dacl-readback',
        'reparse-rejected',
        'single-link',
        'local-volume',
      ]),
      durabilityEvidenceDigest: digest('file-durability', [
        root.proof.rootId,
        relativePath,
        identity.volumeId as string,
        identity.fileId as string,
        contentSha256,
        String(byteLength),
        'native-file-and-parent-directory-flush',
        'no-replace-publication',
      ]),
    });
  }

  private sealState(
    scope: Win32PublicationScope,
    state: TaskAttemptCustodyAdapterSealResult['state'],
    publication: TaskAttemptCustodyPublication | null,
  ): TaskAttemptCustodyAdapterSealResult {
    return Object.freeze({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-publication-seal' as const,
      state,
      effectOpDigest: scope.effectOpDigest,
      scopeDigest: scope.scopeDigest,
      generation: scope.generation,
      evidenceDigest: digest('publication-seal', [
        scope.root.proof.rootId,
        scope.relativePath,
        scope.effectOpDigest,
        scope.scopeDigest,
        String(scope.generation),
        state,
      ]),
      publication,
    });
  }

  private reconcileSealException(
    custody: ExecAuthorityNativeCustodyFacade,
    scope: Win32PublicationScope,
    error: unknown,
  ): TaskAttemptCustodyAdapterSealResult {
    const code = nativeErrorCode(error);
    if (
      code !== 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED'
      && code !== 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED'
    ) {
      const noEffectCode = code === 'E_EXEC_AUTH_NATIVE_ALREADY_EXISTS'
        || code === 'E_EXEC_AUTH_NATIVE_NAMESPACE_CONFLICT'
        || code === 'EEXIST'
        || code === 'ENOTEMPTY'
        || code === 'E_EXEC_AUTH_NATIVE_SIZE_LIMIT'
        || code === 'E_EXEC_AUTH_NATIVE_REPARSE_REJECTED'
        || code === 'E_EXEC_AUTH_NATIVE_PRIVACY_UNCONFIRMED'
        || code === 'E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH'
        || code === 'E_EXEC_AUTH_NATIVE_LINK_COUNT_UNSAFE'
        || code === 'E_EXEC_AUTH_NATIVE_VOLUME_UNSUPPORTED'
        || code === 'E_EXEC_AUTH_NATIVE_REMOTE_VOLUME_UNSUPPORTED';
      if (noEffectCode) {
        let publicationCleanupConfirmed = false;
        try {
          publicationCleanupConfirmed = custody.invoke('abort-publication', {
            publication: scope.nativePublication,
          }).state === 'CLEANUP_CONFIRMED';
        } catch (abortError) {
          const abortCode = nativeErrorCode(abortError);
          publicationCleanupConfirmed = abortCode === 'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED'
            || abortCode === 'E_EXEC_AUTH_NATIVE_HANDLE_STALE';
        }
        const parentCleanupConfirmed = this.closeHandles(custody, scope.parentHandles);
        if (publicationCleanupConfirmed && parentCleanupConfirmed) {
          scope.state = 'ABORTED';
          return this.sealState(scope, 'NO_EFFECT_ABORTED', null);
        }
        scope.state = 'CLEANUP_UNCONFIRMED';
        return this.sealState(scope, 'CLEANUP_UNCONFIRMED', null);
      }
    }
    return this.reconcileSealResult(custody, scope);
  }

  private reconcileSealResult(
    custody: ExecAuthorityNativeCustodyFacade,
    scope: Win32PublicationScope,
  ): TaskAttemptCustodyAdapterSealResult {
    let reconciliation: ExecAuthorityNativeSealReconciliation;
    try {
      reconciliation = custody.consumeSealReconciliation(scope.nativePublication);
    } catch {
      const publicationCleanup = this.closeHandles(custody, [scope.nativePublication]);
      const parentCleanup = this.closeHandles(custody, scope.parentHandles);
      const state = publicationCleanup && parentCleanup
        ? 'PUBLISHED_UNCONFIRMED'
        : 'CLEANUP_UNCONFIRMED';
      scope.state = state;
      return this.sealState(scope, state, null);
    }
    const authorityCleanup = this.closeHandles(custody, [reconciliation.authorityHandle]);
    const parentCleanup = this.closeHandles(custody, scope.parentHandles);
    const cleanupConfirmed = authorityCleanup && parentCleanup;
    const state: TaskAttemptCustodyAdapterSealResult['state'] =
      !cleanupConfirmed || reconciliation.outcome === 'CLEANUP_UNCONFIRMED'
        ? 'CLEANUP_UNCONFIRMED'
        : 'PUBLISHED_UNCONFIRMED';
    scope.state = state;
    return this.sealState(scope, state, null);
  }

  private holdForBeginState(
    state: TaskAttemptCustodyAdapterBeginPublicationResult['state'],
  ): never {
    if (state === 'CLEANUP_UNCONFIRMED') hold('CLEANUP_UNCONFIRMED', 'publish');
    if (state === 'CREATE_UNCONFIRMED') hold('CREATE_UNCONFIRMED', 'publish');
    if (state === 'NO_EFFECT_ABORTED') hold('NO_EFFECT_ABORTED', 'publish');
    hold('CREATE_UNCONFIRMED', 'publish');
  }

  private holdForSealState(state: TaskAttemptCustodyAdapterSealResult['state']): never {
    if (state === 'CLEANUP_UNCONFIRMED') hold('CLEANUP_UNCONFIRMED', 'publish');
    if (state === 'NO_EFFECT_ABORTED') hold('NO_EFFECT_ABORTED', 'publish');
    hold('PUBLISHED_UNCONFIRMED', 'publish');
  }
}

/**
 * Windows-native adapter. It never simulates Win32 proof on POSIX/WSL and never accepts a
 * binding that the canonical typed loader did not attest as `custody-win32-v1`.
 */
export function createTaskAttemptCustodyWin32Adapter(
  options: TaskAttemptCustodyWin32AdapterOptions = {},
): TaskAttemptCustodyAdapter {
  return new Win32TaskAttemptCustodyAdapter(options);
}
