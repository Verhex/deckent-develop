import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import {
  extractTaskAttemptEffectLandingBindingV2,
  parseExecutionEffectLandingTerminalSealV1,
  parseExecutionEffectWorkspaceReleaseV1,
  parseExecutionEffectWorkspaceSnapshotSealV1,
  verifyExecutionEffectPersistenceBundleV1,
  type ExecutionEffectLandingJournalArtifactV1,
  type ExecutionEffectPersistenceArtifactV1,
  type ExecutionEffectWorkspaceReleaseV1,
  type TaskAttemptEffectLandingBindingV2,
  type VerifiedExecutionEffectPersistenceBundleV1,
} from './execution-effect-persistence-contract.js';

const IntrinsicUint8Array = Uint8Array;
const intrinsicUint8ArrayPrototype = Uint8Array.prototype;
const intrinsicBufferPrototype = Buffer.prototype;
const intrinsicObjectPrototype = Object.prototype;
const intrinsicObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const intrinsicObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
const intrinsicObjectGetPrototypeOf = Object.getPrototypeOf;
const intrinsicObjectIsFrozen = Object.isFrozen;
const intrinsicObjectCreate = Object.create;
const intrinsicObjectKeys = Object.keys;
const intrinsicObjectFreeze = Object.freeze;
const intrinsicObjectDefineProperties = Object.defineProperties;
const intrinsicObjectHasOwnProperty = Object.prototype.hasOwnProperty;
const intrinsicReflectApply = Reflect.apply;
const intrinsicReflectOwnKeys = Reflect.ownKeys;
const intrinsicArrayIsArray = Array.isArray;
const intrinsicArrayPrototypeMap = Array.prototype.map;
const intrinsicArrayPrototypeSome = Array.prototype.some;
const intrinsicArrayPrototypeSort = Array.prototype.sort;
const intrinsicArrayPrototypeEvery = Array.prototype.every;
const intrinsicRegExpTest = RegExp.prototype.test;
const intrinsicDateNow = Date.now;
const intrinsicDateParse = Date.parse;
const intrinsicIsProxy = nodeTypes.isProxy;
const intrinsicIsSharedArrayBuffer = nodeTypes.isSharedArrayBuffer;
const intrinsicTypedArrayPrototype = intrinsicObjectGetPrototypeOf(intrinsicUint8ArrayPrototype) as object;
const intrinsicTypedArrayBufferGetter = intrinsicObjectGetOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  'buffer',
)?.get;
const intrinsicTypedArrayByteLengthGetter = intrinsicObjectGetOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  'byteLength',
)?.get;
const intrinsicTypedArraySet = intrinsicUint8ArrayPrototype.set;

if (
  typeof intrinsicTypedArrayBufferGetter !== 'function'
  || typeof intrinsicTypedArrayByteLengthGetter !== 'function'
) {
  throw new Error('TASK_ATTEMPT_CUSTODY_INTRINSIC_UNAVAILABLE');
}

function intrinsicArrayMap<T, U>(
  values: readonly T[],
  mapper: (value: T, index: number) => U,
): U[] {
  return intrinsicReflectApply(intrinsicArrayPrototypeMap, values, [mapper]) as U[];
}

function intrinsicArraySome<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => boolean,
): boolean {
  return intrinsicReflectApply(intrinsicArrayPrototypeSome, values, [predicate]);
}

function intrinsicArraySort<T>(values: T[]): T[] {
  return intrinsicReflectApply(intrinsicArrayPrototypeSort, values, []) as T[];
}

function intrinsicArrayEvery<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => boolean,
): boolean {
  return intrinsicReflectApply(intrinsicArrayPrototypeEvery, values, [predicate]);
}

function freezeObject<T extends object>(value: T): Readonly<T> {
  return intrinsicReflectApply(intrinsicObjectFreeze, Object, [value]) as Readonly<T>;
}

function matchesPattern(pattern: RegExp, value: string): boolean {
  return intrinsicReflectApply(intrinsicRegExpTest, pattern, [value]);
}

/**
 * Platform-neutral authority for immutable Docker task-attempt custody.
 *
 * The kernel deliberately knows nothing about `node:fs`, host platform names,
 * POSIX modes or Windows ACLs. Physical capabilities are supplied by a
 * platform adapter and are verified again at this boundary. Semantic dispatch
 * reservations, including their timestamps and identities, are Store-owned.
 */

export const TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION = 2 as const;
export const TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES = 1024 * 1024 * 1024;
export const TASK_ATTEMPT_CUSTODY_MAX_LINEAGE_DEPTH = 10_000;

const TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS: Readonly<CanonicalJsonBounds> = freezeObject({
  maxDepth: 128,
  maxNodes: 1_000_000,
  maxStringBytes: TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
  maxArrayLength: 1_000_000,
  maxObjectKeys: 1_000_000,
  maxCanonicalBytes: TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
});

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
const DOCKER_CONTAINER_ID_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_COMPONENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const WINDOWS_RESERVED_COMPONENT_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export type Sha256Digest = `sha256:${string}`;

declare const custodyRelativePathBrand: unique symbol;
export type TaskAttemptCustodyRelativePath = string & {
  readonly [custodyRelativePathBrand]: true;
};

export type TaskAttemptCustodyPlatform = 'posix' | 'win32';

export type TaskAttemptCustodyHoldCode =
  | 'INVALID_IDENTITY'
  | 'INVALID_POLICY'
  | 'INVALID_CANONICAL_JSON'
  | 'JSON_BOUNDS_EXCEEDED'
  | 'UNSAFE_RELATIVE_PATH'
  | 'UNSUPPORTED_PLATFORM'
  | 'UNSUPPORTED_FILESYSTEM'
  | 'CAPABILITY_UNVERIFIED'
  | 'HOST_ROOT_INSIDE_PROJECT'
  | 'UNSAFE_ROOT'
  | 'UNSAFE_PATH_COMPONENT'
  | 'UNSAFE_LINK'
  | 'REPARSE_POINT'
  | 'PRIVACY_UNVERIFIED'
  | 'NOT_REGULAR_FILE'
  | 'LINK_COUNT_INVALID'
  | 'ARTIFACT_OVERSIZE'
  | 'ARTIFACT_CHANGED'
  | 'FIRST_WRITER_COLLISION'
  | 'DURABILITY_UNCONFIRMED'
  | 'NATIVE_CAPABILITY_UNAVAILABLE'
  | 'ADMISSION_REQUIRED'
  | 'ADMISSION_MISMATCH'
  | 'INCOMPLETE_PUBLICATION'
  | 'CORRUPT_CUSTODY_RECORD'
  | 'ARTIFACT_REPLAY_MISMATCH'
  | 'CHAIN_PREDECESSOR_MISMATCH'
  | 'CREATE_UNCONFIRMED'
  | 'PUBLISHED_UNCONFIRMED'
  | 'APPEND_FAILED'
  | 'CLEANUP_UNCONFIRMED'
  | 'LEASE_CONSUMED'
  | 'NO_EFFECT_ABORTED'
  | 'DISPATCH_REQUEST_INVALID'
  | 'DISPATCH_REQUEST_CONFLICT'
  | 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED'
  | 'DISPATCH_RESERVATION_RETIRED'
  | 'DISPATCH_AUTHORITY_INVALID'
  | 'DISPATCH_AUTHORITY_CONFLICT'
  | 'DISPATCH_TRANSITION_INVALID'
  | 'DISPATCH_DISCOVERY_BOUNDS_EXCEEDED'
  | 'DISPATCH_DISCOVERY_DEADLINE_EXCEEDED'
  | 'DISPATCH_DISCOVERY_MUTATED'
  | 'DISPATCH_DISCOVERY_MALFORMED_CANDIDATE'
  | 'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE'
  | 'RECONCILIATION_REQUIRED';

export type TaskAttemptCustodyOperation =
  | 'canonicalize'
  | 'probe'
  | 'open-root'
  | 'create-directory'
  | 'publish'
  | 'capture'
  | 'resolve-mount'
  | 'read'
  | 'seal-stream'
  | 'admit'
  | 'append-chain'
  | 'reserve-dispatch'
  | 'read-dispatch'
  | 'list-dispatch'
  | 'settle-dispatch';

/** A typed fail-closed outcome. True absence is represented by `null`, never by this error. */
export class TaskAttemptCustodyHold extends Error {
  readonly state = 'HOLD' as const;
  declare readonly code: TaskAttemptCustodyHoldCode;
  declare readonly operation: TaskAttemptCustodyOperation;

  constructor(
    code: TaskAttemptCustodyHoldCode,
    operation: TaskAttemptCustodyOperation,
  ) {
    super(`TASK_ATTEMPT_CUSTODY_HOLD:${code}`);
    intrinsicObjectDefineProperties(this, {
      message: {
        value: `TASK_ATTEMPT_CUSTODY_HOLD:${code}`,
        enumerable: false,
        configurable: false,
        writable: false,
      },
      name: {
        value: 'TaskAttemptCustodyHold',
        enumerable: false,
        configurable: false,
        writable: false,
      },
      stack: {
        value: `TaskAttemptCustodyHold: TASK_ATTEMPT_CUSTODY_HOLD:${code}`,
        enumerable: false,
        configurable: false,
        writable: false,
      },
      code: {
        value: code,
        enumerable: true,
        configurable: false,
        writable: false,
      },
      operation: {
        value: operation,
        enumerable: true,
        configurable: false,
        writable: false,
      },
    });
    intrinsicObjectFreeze(this);
  }
}

export interface CanonicalJsonBounds {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxStringBytes: number;
  readonly maxArrayLength: number;
  readonly maxObjectKeys: number;
  readonly maxCanonicalBytes: number;
}

const TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASS_AUTHORITY = intrinsicObjectFreeze([
  'task-admission-snapshot',
  'worker-result',
  'worker-partial-result',
  'worker-landing-proposal',
  'worker-provider-observation',
  'worker-timeout',
  'worker-log',
  'worker-ipc-question',
  'worker-ipc-answer',
  'pristine-provider-stream',
  'host-work-attribution',
  'execution-workspace-snapshot',
  'execution-workspace-release',
  'execution-effect-lifecycle-authority',
  'execution-effect-manifest',
  'execution-effect-staged-content',
  'execution-effect-landing-journal',
  'execution-effect-landing-receipt-evidence',
  'execution-effect-landing-receipt',
  'canonical-accepted-result',
  'production-wiring-host-settlement',
  'evaluation-receipt',
  'finalizer-receipt',
  'settlement-receipt',
  'archive-receipt',
] as const);

export type TaskAttemptCustodyArtifactClass =
  (typeof TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASS_AUTHORITY)[number];

const TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASS_AUTHORITY = intrinsicObjectFreeze([
  'worker-result',
  'worker-partial-result',
  'worker-landing-proposal',
  'worker-provider-observation',
  'worker-timeout',
  'worker-log',
  'worker-ipc-question',
] as const);

export type TaskAttemptCustodyAttemptOutputArtifactClass =
  (typeof TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASS_AUTHORITY)[number];

const TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASS_AUTHORITY = intrinsicObjectFreeze([
  'worker-ipc-answer',
  'host-work-attribution',
  'execution-workspace-snapshot',
  'execution-workspace-release',
  'execution-effect-lifecycle-authority',
  'execution-effect-manifest',
  'execution-effect-staged-content',
  'execution-effect-landing-journal',
  'execution-effect-landing-receipt-evidence',
  'execution-effect-landing-receipt',
  'canonical-accepted-result',
  'production-wiring-host-settlement',
  'evaluation-receipt',
  'finalizer-receipt',
  'settlement-receipt',
  'archive-receipt',
] as const);

export type TaskAttemptCustodyHostAuthorityArtifactClass =
  (typeof TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASS_AUTHORITY)[number];

export const TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES: readonly TaskAttemptCustodyArtifactClass[] =
  intrinsicObjectFreeze(intrinsicArrayMap(
    TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASS_AUTHORITY,
    artifactClass => artifactClass,
  ));

export const TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASSES:
  readonly TaskAttemptCustodyAttemptOutputArtifactClass[] = intrinsicObjectFreeze(intrinsicArrayMap(
  TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASS_AUTHORITY,
  artifactClass => artifactClass,
));

export const TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASSES:
  readonly TaskAttemptCustodyHostAuthorityArtifactClass[] = intrinsicObjectFreeze(intrinsicArrayMap(
  TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASS_AUTHORITY,
  artifactClass => artifactClass,
));

export type TaskAttemptCustodyArtifactCaptureMode =
  | 'attempt-output-capture'
  | 'provider-stream-capture'
  | 'host-authority-publication';

export interface TaskAttemptCustodyArtifactLimit {
  readonly minBytes: number;
  readonly maxBytes: number;
  readonly requireSingleLink: true;
}

export interface TaskAttemptCustodyPolicyInputV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly metadataMaxBytes: number;
  readonly jsonBounds: CanonicalJsonBounds;
  readonly artifactLimits: Readonly<
    Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>
  >;
}

export interface TaskAttemptCustodyPolicyV2 extends TaskAttemptCustodyPolicyInputV2 {
  readonly policyDigest: Sha256Digest;
}

export interface TaskAttemptCustodyIdentityV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly backend: 'docker';
  readonly projectRootSha256: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
}

export interface TaskAttemptCustodyRootProof {
  readonly platform: TaskAttemptCustodyPlatform;
  readonly projectId: string;
  readonly canonicalProjectRootSha256: string;
  readonly rootId: Sha256Digest;
  readonly volumeId: string;
  readonly directoryId: string;
  readonly capabilityEvidenceDigest: Sha256Digest;
}

export interface TaskAttemptCustodyFileProof {
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly sha256: Sha256Digest;
  readonly byteLength: number;
  readonly volumeId: string;
  readonly fileId: string;
  readonly linkCount: 1;
  readonly privacyEvidenceDigest: Sha256Digest;
  readonly durabilityEvidenceDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDirectoryProof {
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly volumeId: string;
  readonly directoryId: string;
  readonly privacyEvidenceDigest: Sha256Digest;
  readonly durabilityEvidenceDigest: Sha256Digest;
}

declare const custodyPathCapabilityBrand: unique symbol;
export type TaskAttemptCustodyPathCapabilityAccess =
  | 'read-only-file'
  | 'read-write-directory'
  | 'capture-read-file';

/**
 * Adapter-issued and process-local. It intentionally contains no host absolute path and is never
 * serialized into a receipt. Store methods accept only capabilities issued for their exact
 * admission scope.
 */
export interface TaskAttemptCustodyPathCapability {
  readonly kind: 'task-attempt-custody-path-capability';
  readonly access: TaskAttemptCustodyPathCapabilityAccess;
  readonly rootId: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly capabilityEvidenceDigest: Sha256Digest;
  readonly [custodyPathCapabilityBrand]: true;
}

export interface TaskAttemptCustodyAttemptAccess {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly taskSnapshotRead: TaskAttemptCustodyPathCapability;
  readonly workerOutputWrite: TaskAttemptCustodyPathCapability;
}

declare const custodyMountLeaseBrand: unique symbol;
/** Process-local Store authority. Clones and serialized projections are never leases. */
export interface TaskAttemptCustodyMountLease {
  readonly [custodyMountLeaseBrand]: true;
}

declare const custodyBackendMountCapabilityBrand: unique symbol;
/** Adapter-owned backend authority. Store never inspects or serializes its platform resource. */
export interface TaskAttemptCustodyBackendMountCapability {
  readonly [custodyBackendMountCapabilityBrand]: true;
}

export interface TaskAttemptCustodyBackendMountTransferReceipt {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-mount-transfer';
  readonly state: 'CONSUMED' | 'CLEANUP_UNCONFIRMED';
  readonly rootId: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly effectOpDigest: Sha256Digest;
  readonly attemptId: string;
  readonly generation: number;
  readonly backend: 'docker';
  readonly backendExecutionId: string | null;
  readonly backendImageDigest: Sha256Digest | null;
  readonly backendAuthorityLabelDigest: Sha256Digest | null;
  readonly taskSnapshotMountEvidenceDigest: Sha256Digest | null;
  readonly workerOutputMountEvidenceDigest: Sha256Digest | null;
  readonly backendBootstrapProbeEvidenceDigest: Sha256Digest | null;
  readonly daemonMountReceiptDigest: Sha256Digest | null;
  readonly transferEvidenceDigest: Sha256Digest;
  readonly cleanupEvidenceDigest: Sha256Digest | null;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyVerifiedSnapshot {
  readonly admission: TaskAttemptCustodyAdmissionV2;
  readonly bytes: Uint8Array;
  readonly proof: TaskAttemptCustodyFileProof;
}

export interface TaskAttemptCustodyVerifiedArtifact {
  readonly receipt: TaskAttemptCustodyArtifactReceiptV2;
  readonly bytes: Uint8Array;
  readonly proof: TaskAttemptCustodyFileProof;
}

export interface TaskAttemptCustodyArtifactWriteSession {
  readonly state:
    | 'OPEN'
    | 'APPENDING'
    | 'APPEND_FAILED'
    | 'SEALING'
    | 'PUBLISHING'
    | 'PUBLISHED_UNCONFIRMED'
    | 'SEALED'
    | 'ABORTING'
    | 'ABORTED'
    | 'CLEANUP_UNCONFIRMED';
  readonly byteLength: number;
  append(chunk: Uint8Array): void;
  seal(input: { readonly capturedAt: string }): TaskAttemptCustodyArtifactReceiptV2;
  abort(): void;
}

export interface TaskAttemptCustodyPublication {
  readonly state: 'CREATED' | 'EXISTING_IDENTICAL';
  readonly proof: TaskAttemptCustodyFileProof;
}

export interface TaskAttemptCustodyRead {
  readonly bytes: Uint8Array;
  readonly proof: TaskAttemptCustodyFileProof;
}

declare const custodyAdapterPublicationBrand: unique symbol;
/** Adapter-owned token; it is retained only in the Store wrapper's private closure. */
export interface TaskAttemptCustodyAdapterPublicationToken {
  readonly [custodyAdapterPublicationBrand]: true;
}

export interface TaskAttemptCustodyAdapterAppendResult {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-publication-append';
  readonly state: 'APPENDED';
  readonly byteLength: number;
  readonly effectOpDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly generation: number;
  readonly evidenceDigest: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyAdapterAbortResult {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-publication-abort';
  readonly state: 'ABORTED' | 'CLEANUP_UNCONFIRMED';
  readonly effectOpDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly generation: number;
  readonly evidenceDigest: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyAdapterBeginPublicationResult {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-publication-begin';
  readonly state: 'CREATED' | 'NO_EFFECT_ABORTED' | 'CREATE_UNCONFIRMED' | 'CLEANUP_UNCONFIRMED';
  readonly effectOpDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly generation: number;
  readonly evidenceDigest: Sha256Digest;
  readonly publication: TaskAttemptCustodyAdapterPublicationToken | null;
}

export interface TaskAttemptCustodyAdapterSealResult {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-publication-seal';
  readonly state:
    | 'PUBLISHED'
    | 'NO_EFFECT_ABORTED'
    | 'PUBLISHED_UNCONFIRMED'
    | 'CLEANUP_UNCONFIRMED';
  readonly effectOpDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly generation: number;
  readonly evidenceDigest: Sha256Digest;
  readonly publication: TaskAttemptCustodyPublication | null;
}

export interface TaskAttemptCustodyDurableEffectMarker {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-effect-marker';
  readonly phase: 'INTENT' | 'OUTCOME';
  readonly opDigest: Sha256Digest;
  readonly outcomeDigest: Sha256Digest | null;
  readonly effectReceiptDigest: Sha256Digest | null;
  readonly effectEvidenceDigest: Sha256Digest | null;
  readonly markerDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDurableEffectPublication {
  readonly state: 'CREATED' | 'EXISTING_IDENTICAL';
  readonly marker: TaskAttemptCustodyDurableEffectMarker;
}

export interface TaskAttemptCustodyDirectoryScanReceiptV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-directory-scan';
  readonly state: 'SCANNED';
  readonly rootId: Sha256Digest;
  readonly relativeDirectory: TaskAttemptCustodyRelativePath;
  readonly names: readonly string[];
  readonly entryCount: number;
  readonly maxEntries: number;
  readonly maxNameBytes: number;
  readonly deadlineUnixMs: number;
  readonly nativeMutationEvidence: 'DIRECTORY_IDENTITY_STABLE';
  readonly nativeDirectoryIdentityBeforeDigest: Sha256Digest;
  readonly nativeDirectoryIdentityAfterDigest: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

export function createTaskAttemptCustodyDirectoryScanReceiptV2(input: Omit<
  TaskAttemptCustodyDirectoryScanReceiptV2,
  'schemaVersion' | 'kind' | 'state' | 'receiptDigest'
>): TaskAttemptCustodyDirectoryScanReceiptV2 {
  const record = requireExactDataRecord(input, [
    'rootId',
    'relativeDirectory',
    'names',
    'entryCount',
    'maxEntries',
    'maxNameBytes',
    'deadlineUnixMs',
    'nativeMutationEvidence',
    'nativeDirectoryIdentityBeforeDigest',
    'nativeDirectoryIdentityAfterDigest',
  ], 'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
  if (
    !isDigest(record.rootId)
    || typeof record.relativeDirectory !== 'string'
    || taskAttemptCustodyRelativePath(record.relativeDirectory) !== record.relativeDirectory
    || !assertPositiveSafeInteger(record.maxEntries)
    || record.maxEntries > 100_000
    || !assertPositiveSafeInteger(record.maxNameBytes)
    || record.maxNameBytes > 128
    || !assertPositiveSafeInteger(record.deadlineUnixMs)
    || !assertNonnegativeSafeInteger(record.entryCount)
    || record.entryCount > record.maxEntries
    || record.nativeMutationEvidence !== 'DIRECTORY_IDENTITY_STABLE'
    || !isDigest(record.nativeDirectoryIdentityBeforeDigest)
    || !isDigest(record.nativeDirectoryIdentityAfterDigest)
  ) hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
  const names = snapshotSortedSafeChildNames(
    record.names,
    record.maxEntries,
    record.maxNameBytes,
  );
  if (names === null || names.length !== record.entryCount) {
    hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
  }
  const body = freezeObject({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-directory-scan' as const,
    state: 'SCANNED' as const,
    rootId: record.rootId as Sha256Digest,
    relativeDirectory: record.relativeDirectory as TaskAttemptCustodyRelativePath,
    names,
    entryCount: record.entryCount as number,
    maxEntries: record.maxEntries as number,
    maxNameBytes: record.maxNameBytes as number,
    deadlineUnixMs: record.deadlineUnixMs as number,
    nativeMutationEvidence: 'DIRECTORY_IDENTITY_STABLE' as const,
    nativeDirectoryIdentityBeforeDigest: record.nativeDirectoryIdentityBeforeDigest as Sha256Digest,
    nativeDirectoryIdentityAfterDigest: record.nativeDirectoryIdentityAfterDigest as Sha256Digest,
  });
  return freezeObject({
    ...body,
    receiptDigest: taskAttemptCustodyDigest(
      'directory-scan-receipt',
      body,
      TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS,
    ),
  });
}

export interface TaskAttemptCustodyAdapter {
  readonly platform: TaskAttemptCustodyPlatform;

  openRoot(input: {
    readonly absoluteRoot: string;
    readonly canonicalProjectRoot: string;
    readonly projectId: string;
    readonly create: boolean;
  }): TaskAttemptCustodyRootProof;

  ensurePrivateDirectory(
    root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof;

  readPrivateDirectory(
    root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof | null;

  /**
   * Optional only for retained/test adapters. Production platform adapters implement this
   * fd/HANDLE-bound operation; Store discovery fails closed when it is absent.
   */
  scanPrivateDirectoryBounded?(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativeDirectory: TaskAttemptCustodyRelativePath;
    readonly maxEntries: number;
    readonly maxNameBytes: number;
    readonly deadlineUnixMs: number;
  }): TaskAttemptCustodyDirectoryScanReceiptV2;

  issuePathCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly access: TaskAttemptCustodyPathCapabilityAccess;
    readonly scopeDigest: Sha256Digest;
  }): TaskAttemptCustodyPathCapability;

  issueBackendMountCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly taskSnapshot: TaskAttemptCustodyPathCapability;
    readonly workerOutput: TaskAttemptCustodyPathCapability;
  }): TaskAttemptCustodyBackendMountCapability;

  consumeBackendMountCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly capability: TaskAttemptCustodyBackendMountCapability;
    readonly scopeDigest: Sha256Digest;
    readonly effectOpDigest: Sha256Digest;
    readonly attemptId: string;
    readonly generation: number;
  }): Promise<TaskAttemptCustodyBackendMountTransferReceipt>;

  readDurableEffectMarker(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly opDigest: Sha256Digest;
    readonly phase: TaskAttemptCustodyDurableEffectMarker['phase'];
  }): TaskAttemptCustodyDurableEffectMarker | null;

  publishDurableEffectMarkerFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly marker: TaskAttemptCustodyDurableEffectMarker;
  }): TaskAttemptCustodyDurableEffectPublication;

  publishBytesFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly bytes: Uint8Array;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication;

  readFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null;

  readVerified(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly proof: TaskAttemptCustodyFileProof;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null;

  captureStableFile(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly source: TaskAttemptCustodyPathCapability;
    readonly frozenRelativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication;

  beginFirstWriterPublication(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterBeginPublicationResult;

  appendFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly bytes: Uint8Array;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAppendResult;

  sealFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterSealResult;

  abortFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAbortResult;
}

const TASK_ATTEMPT_CUSTODY_ADAPTER_METHODS = [
  'openRoot',
  'ensurePrivateDirectory',
  'readPrivateDirectory',
  'issuePathCapability',
  'issueBackendMountCapability',
  'consumeBackendMountCapability',
  'readDurableEffectMarker',
  'publishDurableEffectMarkerFirstWriter',
  'publishBytesFirstWriter',
  'readFirstWriter',
  'readVerified',
  'captureStableFile',
  'beginFirstWriterPublication',
  'appendFirstWriterPublication',
  'sealFirstWriterPublication',
  'abortFirstWriterPublication',
] as const satisfies readonly (Exclude<
  keyof TaskAttemptCustodyAdapter,
  'platform' | 'scanPrivateDirectoryBounded'
>)[];

function adapterDataValue(adapter: object, key: PropertyKey): unknown {
  let cursor: object | null = adapter;
  try {
    while (cursor !== null && cursor !== intrinsicObjectPrototype) {
      if (isUntrustedProxy(cursor)) hold('CAPABILITY_UNVERIFIED', 'open-root');
      const descriptor = intrinsicObjectGetOwnPropertyDescriptor(cursor, key);
      if (descriptor !== undefined) {
        if (!('value' in descriptor)) hold('CAPABILITY_UNVERIFIED', 'open-root');
        return descriptor.value;
      }
      cursor = intrinsicObjectGetPrototypeOf(cursor) as object | null;
    }
  } catch {
    hold('CAPABILITY_UNVERIFIED', 'open-root');
  }
  hold('CAPABILITY_UNVERIFIED', 'open-root');
}

function optionalAdapterDataValue(adapter: object, key: PropertyKey): unknown {
  let cursor: object | null = adapter;
  try {
    while (cursor !== null && cursor !== intrinsicObjectPrototype) {
      if (isUntrustedProxy(cursor)) hold('CAPABILITY_UNVERIFIED', 'open-root');
      const descriptor = intrinsicObjectGetOwnPropertyDescriptor(cursor, key);
      if (descriptor !== undefined) {
        if (!('value' in descriptor)) hold('CAPABILITY_UNVERIFIED', 'open-root');
        return descriptor.value;
      }
      cursor = intrinsicObjectGetPrototypeOf(cursor) as object | null;
    }
  } catch (error) {
    if (error instanceof TaskAttemptCustodyHold) throw error;
    hold('CAPABILITY_UNVERIFIED', 'open-root');
  }
  return undefined;
}

function captureAdapterFacade(value: unknown): TaskAttemptCustodyAdapter {
  if (
    value === null
    || (typeof value !== 'object' && typeof value !== 'function')
    || isUntrustedProxy(value)
  ) hold('CAPABILITY_UNVERIFIED', 'open-root');
  const adapter = value as object;
  const platform = adapterDataValue(adapter, 'platform');
  if (platform !== 'posix' && platform !== 'win32') {
    hold('CAPABILITY_UNVERIFIED', 'open-root');
  }
  const facade = Object.create(null) as Record<PropertyKey, unknown>;
  Object.defineProperty(facade, 'platform', {
    value: platform,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  for (const methodName of TASK_ATTEMPT_CUSTODY_ADAPTER_METHODS) {
    const method = adapterDataValue(adapter, methodName);
    if (typeof method !== 'function' || isUntrustedProxy(method)) {
      hold('CAPABILITY_UNVERIFIED', 'open-root');
    }
    Object.defineProperty(facade, methodName, {
      value: method.bind(value),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  const scanMethod = optionalAdapterDataValue(adapter, 'scanPrivateDirectoryBounded');
  if (scanMethod !== undefined) {
    if (typeof scanMethod !== 'function' || isUntrustedProxy(scanMethod)) {
      hold('CAPABILITY_UNVERIFIED', 'open-root');
    }
    Object.defineProperty(facade, 'scanPrivateDirectoryBounded', {
      value: scanMethod.bind(value),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(facade) as unknown as TaskAttemptCustodyAdapter;
}

export interface TaskAttemptCustodyAdmissionV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-admission';
  readonly state: 'admitted';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admittedAt: string;
  readonly policyDigest: Sha256Digest;
  readonly predecessorDigest: Sha256Digest | null;
  readonly predecessorIdentity: TaskAttemptCustodyIdentityV2 | null;
  readonly custodyPlatform: TaskAttemptCustodyPlatform;
  readonly custodyRootId: Sha256Digest;
  readonly custodyVolumeId: string;
  readonly custodyDirectoryId: string;
  readonly custodyCapabilityEvidenceDigest: Sha256Digest;
  readonly taskSnapshot: TaskAttemptCustodyFileProof;
  readonly workerOutputDirectory: TaskAttemptCustodyDirectoryProof;
  readonly receiptDigest: Sha256Digest;
}

/** A verified predecessor supplied by the producer for one later generation. */
export interface TaskAttemptCustodyDispatchPredecessorRefV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-predecessor-ref';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
}

/**
 * Store-owned mapping from one semantic request id to one private custody
 * identity. Request material remains opaque: the Store binds only its canonical
 * bytes and digest and never interprets domain fields.
 */
export interface TaskAttemptCustodyDispatchReservationV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-reservation';
  readonly state: 'reserved';
  readonly dispatchRequestId: string;
  readonly dispatchRequestMaterialDigest: Sha256Digest;
  readonly dispatchRequestMaterial: TaskAttemptCustodyFileProof;
  readonly taskSnapshotDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly predecessor: TaskAttemptCustodyDispatchPredecessorRefV2 | null;
  readonly reservedAt: string;
  readonly bindingDigest: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

/** Host-authored recovery authority already verified by the canonical Sprint
 * recovery boundary. The Store binds it to one reservation but never derives
 * approval or coordinator-death truth itself. */
export interface TaskAttemptCustodyDispatchRecoveryAuthorityV2 {
  readonly executionId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly fenceToken: string;
  readonly approvalRef: string;
  readonly idempotencyKey: string;
}

export interface TaskAttemptCustodyDispatchReservationTransitionV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-reservation-transition';
  readonly state: 'ADMISSION_CLAIMED' | 'RETIRED_BEFORE_ADMISSION';
  readonly reservationReceiptDigest: Sha256Digest;
  readonly taskSnapshotDigest: Sha256Digest;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2 | null;
  readonly recoveryAuthorityDigest: Sha256Digest | null;
  readonly recordedAt: string;
  readonly receiptDigest: Sha256Digest;
}

/** Durable ref handed to physical custody. It contains no source/absolute path. */
export interface TaskAttemptCustodyDispatchAdmissionRefV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-admission-ref';
  readonly state: 'admitted';
  readonly dispatchRequestId: string;
  readonly dispatchRequestMaterialDigest: Sha256Digest;
  readonly reservationReceiptDigest: Sha256Digest;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly refDigest: Sha256Digest;
}

export type TaskAttemptCustodyDispatchAdmissionReadV2 =
  | Readonly<{ readonly state: 'absent'; readonly dispatchRequestId: string }>
  | Readonly<{
      readonly state: 'reserved-pending-admission';
      readonly reservation: TaskAttemptCustodyDispatchReservationV2;
      readonly reconciliationRef: Sha256Digest;
    }>
  | Readonly<{
      readonly state: 'retired-before-admission';
      readonly reservation: TaskAttemptCustodyDispatchReservationV2;
      readonly transition: TaskAttemptCustodyDispatchReservationTransitionV2;
    }>
  | Readonly<{
      readonly state: 'admitted';
      readonly reservation: TaskAttemptCustodyDispatchReservationV2;
      readonly admission: TaskAttemptCustodyAdmissionV2;
      readonly ref: TaskAttemptCustodyDispatchAdmissionRefV2;
    }>;

export type TaskAttemptCustodyDispatchDiscoveryEntryV2 =
  | Readonly<{
      readonly state: 'reserved-pending-admission';
      readonly reservation: TaskAttemptCustodyDispatchReservationV2;
      readonly reconciliationRef: Sha256Digest;
    }>
  | Readonly<{
      readonly state: 'retired-before-admission';
      readonly reservation: TaskAttemptCustodyDispatchReservationV2;
      readonly transition: TaskAttemptCustodyDispatchReservationTransitionV2;
    }>
  | Readonly<{
      readonly state: 'admitted';
      readonly reservation: TaskAttemptCustodyDispatchReservationV2;
      readonly admission: TaskAttemptCustodyAdmissionV2;
      readonly ref: TaskAttemptCustodyDispatchAdmissionRefV2;
    }>
  | TaskAttemptCustodyDispatchQuarantinedHistoryV2;

export interface TaskAttemptCustodyHistoricalAdmissionQuarantineV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-historical-admission-quarantine';
  readonly state: 'QUARANTINED_NO_EFFECT_CUSTODY_EPOCH';
  readonly dispatchRequestId: string;
  readonly reservationReceiptDigest: Sha256Digest;
  readonly historicalAdmissionReceiptDigest: Sha256Digest;
  readonly historicalTerminalReceiptDigest: Sha256Digest;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly observedCustodyHoldCode: TaskAttemptCustodyHoldCode;
  readonly previousCustodyRootId: Sha256Digest;
  readonly previousCustodyCapabilityEvidenceDigest: Sha256Digest;
  readonly currentCustodyRootId: Sha256Digest;
  readonly currentCustodyCapabilityEvidenceDigest: Sha256Digest;
  readonly recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2;
  readonly recoveryAuthorityDigest: Sha256Digest;
  readonly recordedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDispatchQuarantinedHistoryV2 {
  readonly state: 'quarantined-historical-admission';
  readonly reservation: TaskAttemptCustodyDispatchReservationV2;
  readonly historicalAdmission: TaskAttemptCustodyAdmissionV2;
  readonly historicalTerminal: TaskAttemptCustodyDispatchNotDispatchedAuthorityV2;
  readonly quarantine: TaskAttemptCustodyHistoricalAdmissionQuarantineV2;
}

/**
 * An identity-bound admission that recovery discovered but could not reread.
 * The reservation has already passed the canonical path/hash/project checks;
 * no admission or terminal authority is inferred from this diagnostic.
 */
export interface TaskAttemptCustodyDispatchRecoveryHoldV2 {
  readonly state: 'admission-graph-hold';
  readonly reservation: TaskAttemptCustodyDispatchReservationV2;
  readonly candidateLocatorDigest: Sha256Digest;
  readonly custodyHoldCode: TaskAttemptCustodyHoldCode;
}

export interface TaskAttemptCustodyDispatchAdmissionListV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-admission-list';
  readonly state: 'scanned';
  readonly projectId: string;
  readonly projectRootSha256: string;
  readonly policyDigest: Sha256Digest;
  readonly entries: readonly TaskAttemptCustodyDispatchDiscoveryEntryV2[];
  readonly candidateCount: number;
  readonly admittedCount: number;
  readonly pendingAdmissionCount: number;
  readonly retiredBeforeAdmissionCount: number;
  readonly quarantinedHistoricalAdmissionCount: number;
  readonly maxEntries: number;
  readonly maxNameBytes: number;
  readonly deadlineAt: string;
  readonly directoryScanReceiptDigest: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDispatchRecoveryListV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-recovery-list';
  readonly state: 'scanned-with-isolated-holds';
  readonly projectId: string;
  readonly projectRootSha256: string;
  readonly policyDigest: Sha256Digest;
  readonly entries: readonly TaskAttemptCustodyDispatchDiscoveryEntryV2[];
  readonly heldAdmissions: readonly TaskAttemptCustodyDispatchRecoveryHoldV2[];
  readonly candidateCount: number;
  readonly admittedCount: number;
  readonly pendingAdmissionCount: number;
  readonly retiredBeforeAdmissionCount: number;
  readonly quarantinedHistoricalAdmissionCount: number;
  readonly heldAdmissionCount: number;
  readonly maxEntries: number;
  readonly maxNameBytes: number;
  readonly deadlineAt: string;
  readonly directoryScanReceiptDigest: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

export const TASK_ATTEMPT_CUSTODY_NOT_DISPATCHED_REASON_CODES = intrinsicObjectFreeze([
  'PLATFORM_UNSUPPORTED',
  'PROVIDER_UNAVAILABLE',
  'DEPENDENCY_AUTHORITY_UNAVAILABLE',
  'PROVIDER_AUTH_UNAVAILABLE',
  'EXECUTION_POLICY_REJECTED',
  'DAEMON_ABSENT',
  'PRE_MOUNT_ABORTED',
  'PORTABLE_PATH_COLLISION',
] as const);

export type TaskAttemptCustodyNotDispatchedReasonCode =
  (typeof TASK_ATTEMPT_CUSTODY_NOT_DISPATCHED_REASON_CODES)[number];

export const TASK_ATTEMPT_CUSTODY_AMBIGUOUS_REASON_CODES = intrinsicObjectFreeze([
  'PRE_MOUNT_RECONCILIATION_REQUIRED',
  'MOUNT_RECONCILIATION_REQUIRED',
  'DAEMON_EFFECT_UNCONFIRMED',
  'PROVIDER_RELEASE_UNCONFIRMED',
  'CONTAINMENT_UNCONFIRMED',
] as const);

export type TaskAttemptCustodyAmbiguousReasonCode =
  (typeof TASK_ATTEMPT_CUSTODY_AMBIGUOUS_REASON_CODES)[number];

export interface TaskAttemptCustodyProviderExecutionAttemptV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-provider-execution-attempt';
  readonly providerExecutionAttemptId: string;
  readonly custodyIdentity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly backendExecutionId: string;
  readonly identityDigest: Sha256Digest;
}

export const TASK_ATTEMPT_CUSTODY_RELEASE_ACK_METHODS = intrinsicObjectFreeze([
  'HOST_RELEASE_GATE',
] as const);

export type TaskAttemptCustodyReleaseAckMethod =
  (typeof TASK_ATTEMPT_CUSTODY_RELEASE_ACK_METHODS)[number];

/** Path-free evidence that the gated provider process was released exactly once. */
export interface TaskAttemptCustodyDispatchReleaseEvidenceV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-release-evidence';
  readonly containerId: string;
  readonly imageDigest: Sha256Digest;
  readonly mountReceiptDigest: Sha256Digest;
  readonly mountTransferEvidenceDigest: Sha256Digest;
  readonly daemonAuthorityLabelDigest: Sha256Digest;
  readonly releaseNonceDigest: Sha256Digest;
  readonly providerInvocationDigest: Sha256Digest;
  readonly gateAckReceiptDigest: Sha256Digest;
  readonly gateAckEvidenceDigest: Sha256Digest;
  readonly releasedAt: string;
  readonly ackMethod: TaskAttemptCustodyReleaseAckMethod;
  readonly ackStatus: 'ACKNOWLEDGED';
  readonly evidenceDigest: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDispatchNoEffectObservationV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-no-effect-observation';
  readonly daemonContainerState: 'ABSENT';
  readonly providerReleaseState: 'ABSENT';
  readonly daemonInspectionReceiptDigest: Sha256Digest;
  readonly providerReleaseProbeEvidenceDigest: Sha256Digest;
  readonly backendProbeEvidenceDigest: Sha256Digest;
  readonly containmentEvidenceDigest: Sha256Digest;
  readonly observationReceiptDigest: Sha256Digest;
  readonly observationEvidenceDigest: Sha256Digest;
  readonly observedAt: string;
}

export interface TaskAttemptCustodyNoEffectEvidenceV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-no-effect-evidence';
  readonly mountEffect: 'ABSENT';
  readonly daemonEffect: 'ABSENT';
  readonly providerEffect: 'ABSENT';
  readonly observation: TaskAttemptCustodyDispatchNoEffectObservationV2;
  readonly observationBindingDigest: Sha256Digest;
  readonly verifiedAt: string;
  readonly evidenceDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDispatchReleasedAuthorityV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-authority';
  readonly state: 'RELEASED';
  readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
  readonly attemptCount: 1;
  readonly providerExecutionAttempt: TaskAttemptCustodyProviderExecutionAttemptV2;
  readonly backendExecutionId: string;
  readonly mountReceiptDigest: Sha256Digest;
  readonly mountTransferEvidenceDigest: Sha256Digest;
  readonly releaseEvidence: TaskAttemptCustodyDispatchReleaseEvidenceV2;
  readonly releaseReceiptDigest: Sha256Digest;
  readonly releaseEvidenceDigest: Sha256Digest;
  readonly noEffectEvidence: null;
  readonly reasonCode: null;
  readonly projectionFence: Sha256Digest;
  readonly recordedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDispatchNotDispatchedAuthorityV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-authority';
  readonly state: 'NOT_DISPATCHED';
  readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
  readonly attemptCount: 0;
  readonly providerExecutionAttempt: null;
  readonly backendExecutionId: null;
  readonly mountReceiptDigest: null;
  readonly mountTransferEvidenceDigest: null;
  readonly releaseEvidence: null;
  readonly releaseReceiptDigest: null;
  readonly releaseEvidenceDigest: null;
  readonly noEffectEvidence: TaskAttemptCustodyNoEffectEvidenceV2;
  readonly reasonCode: TaskAttemptCustodyNotDispatchedReasonCode;
  readonly projectionFence: Sha256Digest;
  readonly recordedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export type TaskAttemptCustodyDispatchTerminalAuthorityV2 =
  | TaskAttemptCustodyDispatchReleasedAuthorityV2
  | TaskAttemptCustodyDispatchNotDispatchedAuthorityV2;

/** Single immutable arbitration head for physical mount vs proven no-dispatch. */
export interface TaskAttemptCustodyPhysicalTransitionV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-physical-transition';
  readonly state: 'MOUNT_CLAIMED' | 'NOT_DISPATCHED_CLAIMED';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly reasonCode: TaskAttemptCustodyNotDispatchedReasonCode | null;
  readonly noEffectObservationBindingDigest: Sha256Digest | null;
  readonly claimDigest: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

export const TASK_ATTEMPT_CUSTODY_DISPATCH_OBSERVATION_CLASSES = intrinsicObjectFreeze([
  'GATE_ACK',
  'NO_EFFECT',
  'RECONCILIATION',
  'PROVIDER_START',
  'PROVIDER_EXECUTION',
  'PROVIDER_EXIT',
  'EFFECT_DIAGNOSTIC',
] as const);

export type TaskAttemptCustodyDispatchObservationClass =
  (typeof TASK_ATTEMPT_CUSTODY_DISPATCH_OBSERVATION_CLASSES)[number];

const TASK_ATTEMPT_CUSTODY_DISPATCH_OBSERVATION_PATH_SEGMENTS: Readonly<Record<
  TaskAttemptCustodyDispatchObservationClass,
  string
>> = intrinsicObjectFreeze({
  GATE_ACK: 'gate-ack',
  NO_EFFECT: 'no-effect',
  RECONCILIATION: 'reconciliation',
  PROVIDER_START: 'provider-start',
  PROVIDER_EXECUTION: 'provider-execution',
  PROVIDER_EXIT: 'provider-exit',
  EFFECT_DIAGNOSTIC: 'effect-diagnostic',
});

/** Path-free durable ref for one exact physical dispatch observation. */
export interface TaskAttemptCustodyDispatchObservationReceiptV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-observation';
  readonly observationClass: TaskAttemptCustodyDispatchObservationClass;
  readonly admissionRefDigest: Sha256Digest;
  readonly observedAt: string;
  readonly evidenceDigest: Sha256Digest;
  readonly byteLength: number;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyVerifiedDispatchObservationV2 {
  readonly receipt: TaskAttemptCustodyDispatchObservationReceiptV2;
  readonly bytes: Uint8Array;
}

export interface TaskAttemptCustodyStartedFailedCandidateV2 {
  readonly state: 'STARTED_FAILED_CANDIDATE';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionRefDigest: Sha256Digest;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly releasedDispatchReceiptDigest: Sha256Digest;
  readonly providerStartObservationReceiptDigest: Sha256Digest;
  readonly providerExecutionObservationReceiptDigest: Sha256Digest;
  readonly providerExitObservationReceiptDigest: Sha256Digest;
  readonly providerExitObservedAt: string;
  readonly preservationManifestDigest: Sha256Digest;
  readonly preservedArtifacts: readonly Readonly<{
    artifactClass: TaskAttemptCustodyArtifactClass;
    artifactKey: string;
    receiptDigest: Sha256Digest;
    contentDigest: Sha256Digest;
    byteLength: number;
  }>[];
  readonly evidenceDigest: Sha256Digest;
}

/** Retained failed execution, never NOT_DISPATCHED or successful settlement.
 * The caller proves fresh coordinator fencing, exact stopped container identity,
 * and exclusive mutation ownership before passing its stopped-evidence digest.
 * Store validates durable custody only; it never infers process death from a hash. */
export interface TaskAttemptCustodyStartedFailedDispatchV2 extends Omit<
  TaskAttemptCustodyStartedFailedCandidateV2, 'state'
> {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-started-failed-dispatch';
  readonly state: 'STARTED_FAILED_RETAINED';
  readonly custodyRootId: Sha256Digest;
  readonly custodyCapabilityEvidenceDigest: Sha256Digest;
  readonly recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2;
  readonly recoveryAuthorityDigest: Sha256Digest;
  readonly stoppedExecutionEvidenceDigest: Sha256Digest;
  readonly recordedAt: string;
  readonly receiptDigest: Sha256Digest;
}

/**
 * Core-owned structural projection of evidence whose journal semantics are
 * verified by the orchestra adapter. Core never imports that adapter: it
 * rereads every referenced immutable artifact and records the binding.
 */
export interface TaskAttemptCustodyEffectCommittedReleasePendingEvidenceV2 {
  readonly phase: 'COMMITTED_JOURNAL_RELEASE_PENDING';
  readonly landingRecoveryAnchor: TaskAttemptCustodyPreservedArtifactRefV2;
  readonly readyLifecycle: TaskAttemptCustodyPreservedArtifactRefV2;
  readonly committedJournal: TaskAttemptCustodyPreservedArtifactRefV2;
  readonly leaseEvidence: TaskAttemptCustodyPreservedArtifactRefV2;
  readonly finalEvidence: TaskAttemptCustodyPreservedArtifactRefV2;
  readonly finalManifest: TaskAttemptCustodyPreservedArtifactRefV2;
  readonly semanticVerifier: 'orchestra-required-v1';
  readonly semanticEvidenceDigest: Sha256Digest;
}

export interface TaskAttemptCustodyPreservedArtifactRefV2 {
  readonly artifactClass: TaskAttemptCustodyArtifactClass;
  readonly artifactKey: string;
  readonly receiptDigest: Sha256Digest;
  readonly contentDigest: Sha256Digest;
  readonly byteLength: number;
}

export interface TaskAttemptCustodyEffectCommittedReleasePendingCandidateV2 {
  readonly state: 'EFFECT_COMMITTED_RELEASE_PENDING_CANDIDATE';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionRefDigest: Sha256Digest;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly releasedDispatchReceiptDigest: Sha256Digest;
  readonly providerExitObservationReceiptDigest: Sha256Digest;
  readonly providerExitObservedAt: string;
  readonly evidence: TaskAttemptCustodyEffectCommittedReleasePendingEvidenceV2;
  readonly preservedArtifacts: readonly TaskAttemptCustodyPreservedArtifactRefV2[];
  readonly preservationManifestDigest: Sha256Digest;
  readonly evidenceDigest: Sha256Digest;
}

export interface TaskAttemptCustodyEffectCommittedReleasePendingDispatchV2 extends Omit<
  TaskAttemptCustodyEffectCommittedReleasePendingCandidateV2, 'state'
> {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-effect-committed-release-pending-dispatch';
  readonly state: 'COMMITTED_JOURNAL_RELEASE_PENDING';
  readonly custodyRootId: Sha256Digest;
  readonly custodyCapabilityEvidenceDigest: Sha256Digest;
  readonly recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2;
  readonly recoveryAuthorityDigest: Sha256Digest;
  readonly stoppedResourceEvidenceDigest: Sha256Digest;
  readonly hostObservationDigest: Sha256Digest;
  readonly recordedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDispatchReconciliationV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-reconciliation';
  readonly state: 'AMBIGUOUS';
  readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
  readonly mountEffectState: 'ABSENT' | 'INTENT_ONLY' | 'OUTCOME_CONFIRMED';
  readonly reasonCode: TaskAttemptCustodyAmbiguousReasonCode;
  readonly reconciliationEvidence: TaskAttemptCustodyDispatchReconciliationEvidenceV2;
  readonly evidenceDigest: Sha256Digest;
  readonly recordedAt: string;
  readonly reconciliationRef: Sha256Digest;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyDispatchReconciliationEvidenceV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-reconciliation-evidence';
  readonly mountEffectState: 'ABSENT' | 'INTENT_ONLY' | 'OUTCOME_CONFIRMED';
  readonly containerState: 'ABSENT' | 'PRESENT' | 'UNKNOWN';
  readonly containerId: string | null;
  readonly imageDigest: Sha256Digest | null;
  readonly mountReceiptDigest: Sha256Digest | null;
  readonly releaseState: 'NOT_ATTEMPTED' | 'UNCONFIRMED' | 'ACKNOWLEDGED' | 'UNKNOWN';
  readonly releaseNonceDigest: Sha256Digest | null;
  readonly providerInvocationDigest: Sha256Digest | null;
  readonly containmentEvidenceDigest: Sha256Digest;
  readonly backendProbeEvidenceDigest: Sha256Digest;
  readonly observationReceiptDigest: Sha256Digest;
  readonly observationEvidenceDigest: Sha256Digest;
  readonly observedAt: string;
  readonly evidenceDigest: Sha256Digest;
}

export type TaskAttemptCustodyDispatchAuthorityReadV2 =
  | Readonly<{ readonly state: 'absent'; readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2 }>
  | Readonly<{
      readonly state: 'ambiguous';
      readonly reconciliation: TaskAttemptCustodyDispatchReconciliationV2;
    }>
  | Readonly<{
      readonly state: 'terminal';
      readonly authority: TaskAttemptCustodyDispatchTerminalAuthorityV2;
      readonly reconciliation: TaskAttemptCustodyDispatchReconciliationV2 | null;
    }>
  | Readonly<{
      readonly state: 'transition-pending';
      readonly transition: TaskAttemptCustodyPhysicalTransitionV2;
      readonly mountEffectState: 'ABSENT' | 'INTENT_ONLY' | 'OUTCOME_CONFIRMED';
      readonly reconciliationRef: Sha256Digest;
    }>;

export interface TaskAttemptCustodyArtifactReceiptV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-artifact';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly artifactClass: TaskAttemptCustodyArtifactClass;
  readonly captureMode: TaskAttemptCustodyArtifactCaptureMode;
  readonly artifactKey: string;
  readonly capturedAt: string;
  readonly policyDigest: Sha256Digest;
  readonly artifact: TaskAttemptCustodyFileProof;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyEffectArtifactRefV2 {
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyEffectLandingReceiptV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-effect-landing';
  readonly state: 'committed';
  readonly disposition: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly workspaceSnapshot: TaskAttemptCustodyEffectArtifactRefV2;
  readonly baselineManifest: TaskAttemptCustodyEffectArtifactRefV2;
  readonly finalManifest: TaskAttemptCustodyEffectArtifactRefV2;
  readonly stagedContents: readonly TaskAttemptCustodyEffectArtifactRefV2[];
  readonly landingJournal: TaskAttemptCustodyEffectArtifactRefV2;
  readonly workspaceRelease: TaskAttemptCustodyEffectArtifactRefV2;
  readonly effectDecisionDigest: Sha256Digest;
  readonly transactionDigest: Sha256Digest;
  readonly committedAt: string;
  readonly releasedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyVerifiedEffectLandingV2 {
  readonly landing: TaskAttemptCustodyEffectLandingReceiptV2;
  readonly verifiedBundle: VerifiedExecutionEffectPersistenceBundleV1;
  readonly workspaceRelease: ExecutionEffectWorkspaceReleaseV1;
}

export type CreateTaskAttemptCustodyEffectLandingReceiptInputV2 = Omit<
  TaskAttemptCustodyEffectLandingReceiptV2,
  'schemaVersion' | 'kind' | 'state' | 'receiptDigest'
>;

/**
 * Durable proof that one host-authoritative IPC answer was published into the exact mounted
 * worker-output channel. The immutable authority artifact and the worker-facing bytes are
 * deliberately separate: workers consume only `deliverySha256`, while host reconciliation
 * remains bound to `authorityArtifactReceiptDigest`.
 */
export interface TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-worker-ipc-answer-delivery';
  readonly state: 'delivered';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly sequence: number;
  readonly artifactKey: string;
  readonly authorityArtifactReceiptDigest: Sha256Digest;
  readonly authorityArtifactSha256: Sha256Digest;
  readonly deliverySha256: Sha256Digest;
  readonly destinationChildRelativePath: string;
  readonly destination: TaskAttemptCustodyFileProof;
  readonly destinationProofDigest: Sha256Digest;
  readonly deliveredAt: string;
  readonly receiptDigest: Sha256Digest;
}

/** Hard protocol bound: a single attempt cannot grow an unbounded IPC journal. */
export const TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS = 256 as const;

/**
 * Backend observation of a byte-identical private question seal. This record is not question
 * authority by itself: `captureNextWorkerIpcQuestion` additionally requires a Store-issued path
 * capability and binds the captured immutable artifact proof to these bytes.
 */
export interface TaskAttemptCustodyWorkerIpcSealedQuestionSourceV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-worker-ipc-sealed-question-source';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly dispatchRequestId: string;
  readonly sequence: number;
  readonly sourceFileIdentityDigest: Sha256Digest;
  readonly sourceEpoch: number;
  readonly sealedChildRelativePath: string;
  readonly contentSha256: Sha256Digest;
  readonly byteLength: number;
  readonly capturedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export type TaskAttemptCustodyWorkerIpcConversationCursorV2 =
  | Readonly<{
      readonly state: 'empty';
      readonly identity: TaskAttemptCustodyIdentityV2;
      readonly admissionReceiptDigest: Sha256Digest;
      readonly dispatchRequestId: string;
      readonly nextSequence: 1;
      readonly cursorReceiptDigest: null;
    }>
  | Readonly<{
      readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
      readonly kind: 'task-attempt-custody-worker-ipc-conversation-cursor';
      readonly state: 'question-open';
      readonly identity: TaskAttemptCustodyIdentityV2;
      readonly admissionReceiptDigest: Sha256Digest;
      readonly policyDigest: Sha256Digest;
      readonly dispatchRequestId: string;
      readonly sequence: number;
      readonly nextSequence: null;
      readonly predecessorCursorReceiptDigest: Sha256Digest | null;
      readonly sealedSourceReceiptDigest: Sha256Digest;
      readonly sourceFileIdentityDigest: Sha256Digest;
      readonly sourceEpoch: number;
      readonly questionArtifactKey: string;
      readonly questionReceiptDigest: Sha256Digest;
      readonly questionArtifactSha256: Sha256Digest;
      readonly recordedAt: string;
      readonly cursorReceiptDigest: Sha256Digest;
    }>
  | Readonly<{
      readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
      readonly kind: 'task-attempt-custody-worker-ipc-conversation-cursor';
      readonly state: 'answered';
      readonly identity: TaskAttemptCustodyIdentityV2;
      readonly admissionReceiptDigest: Sha256Digest;
      readonly policyDigest: Sha256Digest;
      readonly dispatchRequestId: string;
      readonly sequence: number;
      readonly nextSequence: number | null;
      readonly predecessorCursorReceiptDigest: Sha256Digest | null;
      readonly questionCursorReceiptDigest: Sha256Digest;
      readonly sealedSourceReceiptDigest: Sha256Digest;
      readonly sourceFileIdentityDigest: Sha256Digest;
      readonly sourceEpoch: number;
      readonly questionReceiptDigest: Sha256Digest;
      readonly answerDeliveryReceiptDigest: Sha256Digest;
      readonly answeredAt: string;
      readonly cursorReceiptDigest: Sha256Digest;
    }>;

export interface TaskAttemptCustodyWorkerIpcQuestionCaptureV2 {
  readonly question: TaskAttemptCustodyArtifactReceiptV2;
  readonly cursor: Extract<
    TaskAttemptCustodyWorkerIpcConversationCursorV2,
    { readonly state: 'question-open' }
  >;
}

export interface TaskAttemptCustodyWorkerIpcAnswerPublicationV2 {
  readonly delivery: TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2;
  readonly cursor: Extract<
    TaskAttemptCustodyWorkerIpcConversationCursorV2,
    { readonly state: 'answered' }
  >;
}

export const TASK_ATTEMPT_CUSTODY_CHAIN_STAGES = [
  'effect-landing',
  'accepted-result',
  'evaluation',
  'finalizer',
  'settlement',
  'archive',
] as const;

export type TaskAttemptCustodyChainStage =
  (typeof TASK_ATTEMPT_CUSTODY_CHAIN_STAGES)[number];

export interface TaskAttemptCustodyChainReceiptV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-chain';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly stage: TaskAttemptCustodyChainStage;
  readonly occurredAt: string;
  readonly predecessorDigest: Sha256Digest;
  readonly artifactReceiptDigest: Sha256Digest;
  readonly artifactKey: string;
  readonly receiptDigest: Sha256Digest;
}

/** Explicit marker for pre-cutover records. It cannot be mistaken for a V2 normal-write record. */
export interface TaskAttemptCustodyHistoricalV1Sentinel {
  readonly schemaVersion: 1;
  readonly kind: 'task-attempt-custody-historical-v1';
  readonly state: 'historical-read-only';
  readonly backend: 'docker';
  readonly projectRootSha256: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly cutoverReceiptDigest: Sha256Digest;
}

export interface TaskAttemptCustodyHistoricalV1TrustAnchor {
  readonly projectRootSha256: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly cutoverReceiptDigest: Sha256Digest;
}

declare const verifiedHistoricalV1SentinelBrand: unique symbol;
export type TaskAttemptCustodyVerifiedHistoricalV1Sentinel =
  TaskAttemptCustodyHistoricalV1Sentinel & {
    readonly [verifiedHistoricalV1SentinelBrand]: true;
  };

type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

interface CanonicalJsonCounter {
  nodes: number;
}

function hold(
  code: TaskAttemptCustodyHoldCode,
  operation: TaskAttemptCustodyOperation,
): never {
  throw new TaskAttemptCustodyHold(code, operation);
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function isUntrustedProxy(value: unknown): boolean {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? intrinsicIsProxy(value)
    : false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || isUntrustedProxy(value)
    || intrinsicReflectApply(intrinsicArrayIsArray, Array, [value])
  ) return false;
  try {
    const prototype = intrinsicObjectGetPrototypeOf(value);
    return prototype === intrinsicObjectPrototype || prototype === null;
  } catch {
    return false;
  }
}

function assertPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function assertNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return snapshotExactDataRecord(record, keys) !== null;
}

function snapshotExactDataRecord(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  try {
    if (!isPlainRecord(value)) return null;
    const ownKeys = intrinsicReflectOwnKeys(value);
    if (intrinsicArraySome(ownKeys, key => typeof key !== 'string')) return null;
    const actual = intrinsicArraySort(ownKeys as string[]);
    const expected: string[] = [];
    for (let index = 0; index < keys.length; index += 1) {
      expected[index] = keys[index]!;
    }
    intrinsicArraySort(expected);
    if (
      actual.length !== expected.length
      || !intrinsicArrayEvery(actual, (key, index) => key === expected[index])
    ) return null;
    const snapshot = intrinsicReflectApply(
      intrinsicObjectCreate,
      Object,
      [null],
    ) as Record<string, unknown>;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!;
      const descriptor = intrinsicObjectGetOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return freezeObject(snapshot);
  } catch {
    return null;
  }
}

function requireExactDataRecord(
  value: unknown,
  keys: readonly string[],
  code: TaskAttemptCustodyHoldCode,
  operation: TaskAttemptCustodyOperation,
): Readonly<Record<string, unknown>> {
  const record = snapshotExactDataRecord(value, keys);
  if (record === null) hold(code, operation);
  return record;
}

function snapshotSortedSafeChildNames(
  value: unknown,
  maxEntries: number,
  maxNameBytes: number,
): readonly string[] | null {
  try {
    if (
      !intrinsicReflectApply(intrinsicArrayIsArray, Array, [value])
      || isUntrustedProxy(value)
      || !intrinsicObjectIsFrozen(value)
    ) return null;
    const names = value as readonly unknown[];
    if (names.length > maxEntries) return null;
    const ownKeys = intrinsicReflectOwnKeys(names);
    if (
      ownKeys.length !== names.length + 1
      || intrinsicArraySome(ownKeys, key => (
        typeof key !== 'string'
        || (key !== 'length' && !matchesPattern(/^(?:0|[1-9][0-9]*)$/u, key))
      ))
    ) return null;
    const snapshot: string[] = [];
    let previous: string | null = null;
    for (let index = 0; index < names.length; index += 1) {
      const descriptor = intrinsicObjectGetOwnPropertyDescriptor(names, String(index));
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || descriptor.configurable !== false
        || descriptor.writable !== false
        || !('value' in descriptor)
        || typeof descriptor.value !== 'string'
        || !matchesPattern(SAFE_COMPONENT_PATTERN, descriptor.value)
        || utf8Length(descriptor.value) > maxNameBytes
        || (previous !== null && descriptor.value <= previous)
      ) return null;
      snapshot[index] = descriptor.value;
      previous = descriptor.value;
    }
    return freezeObject(snapshot);
  } catch {
    return null;
  }
}

function normalizeJson(
  value: unknown,
  bounds: CanonicalJsonBounds,
  depth: number,
  counter: CanonicalJsonCounter,
): CanonicalJsonValue {
  if (isUntrustedProxy(value)) return hold('INVALID_CANONICAL_JSON', 'canonicalize');
  counter.nodes += 1;
  if (counter.nodes > bounds.maxNodes || depth > bounds.maxDepth) {
    return hold('JSON_BOUNDS_EXCEEDED', 'canonicalize');
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      return hold('INVALID_CANONICAL_JSON', 'canonicalize');
    }
    return value;
  }
  if (typeof value === 'string') {
    if (utf8Length(value) > bounds.maxStringBytes) {
      return hold('JSON_BOUNDS_EXCEEDED', 'canonicalize');
    }
    return value;
  }
  if (intrinsicReflectApply(intrinsicArrayIsArray, Array, [value])) {
    const arrayValue = value as unknown[];
    if (arrayValue.length > bounds.maxArrayLength) {
      return hold('JSON_BOUNDS_EXCEEDED', 'canonicalize');
    }
    let ownKeys: readonly PropertyKey[];
    try { ownKeys = intrinsicReflectApply(intrinsicReflectOwnKeys, Reflect, [arrayValue]); } catch {
      return hold('INVALID_CANONICAL_JSON', 'canonicalize');
    }
    if (
      intrinsicArraySome(ownKeys, key => (
        key !== 'length'
        && (typeof key !== 'string' || !matchesPattern(/^(?:0|[1-9][0-9]*)$/u, key))
      ))
    ) return hold('INVALID_CANONICAL_JSON', 'canonicalize');
    const normalized: CanonicalJsonValue[] = [];
    for (let index = 0; index < arrayValue.length; index += 1) {
      if (!intrinsicReflectApply(intrinsicObjectHasOwnProperty, arrayValue, [index])) {
        return hold('INVALID_CANONICAL_JSON', 'canonicalize');
      }
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = intrinsicReflectApply(
          intrinsicObjectGetOwnPropertyDescriptor,
          Object,
          [arrayValue, String(index)],
        );
      } catch {
        return hold('INVALID_CANONICAL_JSON', 'canonicalize');
      }
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return hold('INVALID_CANONICAL_JSON', 'canonicalize');
      }
      normalized[index] = normalizeJson(descriptor.value, bounds, depth + 1, counter);
    }
    return normalized;
  }
  if (!isPlainRecord(value)) return hold('INVALID_CANONICAL_JSON', 'canonicalize');
  let ownKeys: readonly PropertyKey[];
  let keys: string[];
  try {
    ownKeys = intrinsicReflectApply(intrinsicReflectOwnKeys, Reflect, [value]);
    keys = intrinsicArraySort(
      intrinsicReflectApply(intrinsicObjectKeys, Object, [value]) as string[],
    );
  } catch {
    return hold('INVALID_CANONICAL_JSON', 'canonicalize');
  }
  if (
    ownKeys.length !== keys.length
    || intrinsicArraySome(ownKeys, key => typeof key !== 'string')
    || intrinsicArraySome(keys, key => {
      try {
        const descriptor = intrinsicReflectApply(
          intrinsicObjectGetOwnPropertyDescriptor,
          Object,
          [value, key],
        );
        return !descriptor || !descriptor.enumerable || !('value' in descriptor);
      } catch {
        return true;
      }
    })
  ) return hold('INVALID_CANONICAL_JSON', 'canonicalize');
  if (keys.length > bounds.maxObjectKeys) {
    return hold('JSON_BOUNDS_EXCEEDED', 'canonicalize');
  }
  const normalized = intrinsicReflectApply(
    intrinsicObjectCreate,
    Object,
    [null],
  ) as Record<string, CanonicalJsonValue>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    if (utf8Length(key) > bounds.maxStringBytes) {
      return hold('JSON_BOUNDS_EXCEEDED', 'canonicalize');
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = intrinsicReflectApply(
        intrinsicObjectGetOwnPropertyDescriptor,
        Object,
        [value, key],
      );
    } catch {
      return hold('INVALID_CANONICAL_JSON', 'canonicalize');
    }
    if (!descriptor || !('value' in descriptor)) {
      return hold('INVALID_CANONICAL_JSON', 'canonicalize');
    }
    normalized[key] = normalizeJson(descriptor.value, bounds, depth + 1, counter);
  }
  return normalized;
}

function validatedJsonBounds(bounds: unknown): Readonly<CanonicalJsonBounds> {
  const record = snapshotExactDataRecord(bounds, [
    'maxDepth',
    'maxNodes',
    'maxStringBytes',
    'maxArrayLength',
    'maxObjectKeys',
    'maxCanonicalBytes',
  ]);
  if (
    record === null
    || !assertPositiveSafeInteger(record.maxDepth)
    || !assertPositiveSafeInteger(record.maxNodes)
    || !assertPositiveSafeInteger(record.maxStringBytes)
    || !assertPositiveSafeInteger(record.maxArrayLength)
    || !assertPositiveSafeInteger(record.maxObjectKeys)
    || !assertPositiveSafeInteger(record.maxCanonicalBytes)
    || record.maxDepth > TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS.maxDepth
    || record.maxNodes > TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS.maxNodes
    || record.maxStringBytes > TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS.maxStringBytes
    || record.maxArrayLength > TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS.maxArrayLength
    || record.maxObjectKeys > TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS.maxObjectKeys
    || record.maxCanonicalBytes > TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS.maxCanonicalBytes
  ) hold('INVALID_POLICY', 'canonicalize');
  return freezeObject({
    maxDepth: record.maxDepth,
    maxNodes: record.maxNodes,
    maxStringBytes: record.maxStringBytes,
    maxArrayLength: record.maxArrayLength,
    maxObjectKeys: record.maxObjectKeys,
    maxCanonicalBytes: record.maxCanonicalBytes,
  });
}

function serializeCanonicalJson(value: CanonicalJsonValue): string {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) return JSON.stringify(value);
  if (intrinsicReflectApply(intrinsicArrayIsArray, Array, [value])) {
    return `[${intrinsicArrayMap(
      value as readonly CanonicalJsonValue[],
      item => serializeCanonicalJson(item),
    ).join(',')}]`;
  }
  const record = value as Readonly<Record<string, CanonicalJsonValue>>;
  return `{${intrinsicArrayMap(
    intrinsicArraySort(
      intrinsicReflectApply(intrinsicObjectKeys, Object, [record]) as string[],
    ),
    key => `${JSON.stringify(key)}:${serializeCanonicalJson(record[key]!)}`,
  ).join(',')}}`;
}

/** Stable recursively key-sorted JSON bytes, with no defaulting or unknown-value coercion. */
export function canonicalTaskAttemptCustodyJson(
  value: unknown,
  bounds: CanonicalJsonBounds,
): Uint8Array {
  const safeBounds = validatedJsonBounds(bounds);
  const normalized = normalizeJson(value, safeBounds, 0, { nodes: 0 });
  const bytes = Buffer.from(serializeCanonicalJson(normalized), 'utf8');
  if (bytes.byteLength > safeBounds.maxCanonicalBytes) {
    return hold('JSON_BOUNDS_EXCEEDED', 'canonicalize');
  }
  return bytes;
}

function digestBytes(domain: string, bytes: Uint8Array): Sha256Digest {
  const hash = createHash('sha256');
  hash.update(domain, 'utf8');
  hash.update(Buffer.from([0]));
  hash.update(bytes);
  return `sha256:${hash.digest('hex')}`;
}

function rawSha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digestCanonical(
  domain: string,
  value: unknown,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return digestBytes(domain, canonicalTaskAttemptCustodyJson(value, bounds));
}

/** Shared canonical digest primitive for V2 schema/settlement modules. */
export function taskAttemptCustodyDigest(
  domain: string,
  value: unknown,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  if (!matchesPattern(/^[a-z0-9][a-z0-9.-]{0,127}$/u, domain)) {
    return hold('INVALID_CANONICAL_JSON', 'canonicalize');
  }
  return digestCanonical(
    `deckent.task-attempt-custody.${domain}.v2`,
    value,
    bounds,
  );
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && matchesPattern(SHA256_PATTERN, value);
}

function isTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || !matchesPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u, value)
  ) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const normalized = new Date(timestamp).toISOString();
  return normalized === value || normalized === value.replace(/Z$/u, '.000Z');
}

function isDispatchRequestId(value: unknown): value is string {
  return typeof value === 'string'
    && matchesPattern(/^dreq-[a-f0-9]{64}$/u, value);
}

function deterministicDispatchUuid(bindingDigest: Sha256Digest): string {
  if (!isDigest(bindingDigest)) hold('DISPATCH_REQUEST_INVALID', 'reserve-dispatch');
  const hex = bindingDigest.slice('sha256:'.length, 'sha256:'.length + 32).split('');
  hex[12] = '8';
  hex[16] = '8';
  return [
    hex.slice(0, 8).join(''),
    hex.slice(8, 12).join(''),
    hex.slice(12, 16).join(''),
    hex.slice(16, 20).join(''),
    hex.slice(20, 32).join(''),
  ].join('-');
}

function snapshotDispatchPredecessorRef(
  value: unknown,
): TaskAttemptCustodyDispatchPredecessorRefV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'identity',
    'admissionReceiptDigest',
  ]);
  const identity = record === null ? null : snapshotIdentity(record.identity);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-predecessor-ref'
    || identity === null
    || !isDigest(record.admissionReceiptDigest)
  ) return null;
  return freezeObject({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-predecessor-ref',
    identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
  });
}

function dispatchReservationBindingDigest(input: {
  readonly dispatchRequestId: string;
  readonly dispatchRequestMaterialDigest: Sha256Digest;
  readonly taskSnapshotDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly predecessor: TaskAttemptCustodyDispatchPredecessorRefV2 | null;
}, bounds: CanonicalJsonBounds): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-reservation-binding', input, bounds);
}

function dispatchReservationReceiptDigest(
  value: Omit<TaskAttemptCustodyDispatchReservationV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-reservation-receipt', value, bounds);
}

function snapshotDispatchRecoveryAuthority(
  value: unknown,
): TaskAttemptCustodyDispatchRecoveryAuthorityV2 | null {
  const record = snapshotExactDataRecord(value, [
    'executionId',
    'taskId',
    'attemptId',
    'fenceToken',
    'approvalRef',
    'idempotencyKey',
  ]);
  if (
    record === null
    || typeof record.executionId !== 'string'
    || !matchesPattern(/^sprint-[0-9]+$/u, record.executionId)
    || record.taskId !== record.executionId
    || typeof record.attemptId !== 'string'
    || typeof record.fenceToken !== 'string'
    || typeof record.approvalRef !== 'string'
    || typeof record.idempotencyKey !== 'string'
    || intrinsicArraySome([
      record.attemptId,
      record.fenceToken,
      record.approvalRef,
      record.idempotencyKey,
    ], entry => typeof entry !== 'string'
      || entry.length === 0
      || entry !== entry.trim()
      || utf8Length(entry) > 1024
      || matchesPattern(/[\r\n\0]/u, entry))
  ) return null;
  return freezeObject({
    executionId: record.executionId,
    taskId: record.taskId as string,
    attemptId: record.attemptId,
    fenceToken: record.fenceToken,
    approvalRef: record.approvalRef,
    idempotencyKey: record.idempotencyKey,
  });
}

function dispatchRecoveryAuthorityDigest(
  authority: TaskAttemptCustodyDispatchRecoveryAuthorityV2,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-recovery-authority', authority, bounds);
}

function isHistoricalAdmissionQuarantineHoldCode(
  value: TaskAttemptCustodyHoldCode,
): value is 'ARTIFACT_CHANGED' | 'CORRUPT_CUSTODY_RECORD' {
  return value === 'ARTIFACT_CHANGED' || value === 'CORRUPT_CUSTODY_RECORD';
}

function historicalAdmissionQuarantineReceiptDigest(
  value: Omit<TaskAttemptCustodyHistoricalAdmissionQuarantineV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('historical-admission-quarantine', value, bounds);
}

function parseHistoricalAdmissionQuarantine(
  value: unknown,
  reservation: TaskAttemptCustodyDispatchReservationV2,
  historicalAdmission: TaskAttemptCustodyAdmissionV2,
  historicalTerminal: TaskAttemptCustodyDispatchNotDispatchedAuthorityV2,
  observedCustodyHoldCode: TaskAttemptCustodyHoldCode,
  currentRoot: TaskAttemptCustodyRootProof,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyHistoricalAdmissionQuarantineV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'dispatchRequestId',
    'reservationReceiptDigest',
    'historicalAdmissionReceiptDigest',
    'historicalTerminalReceiptDigest',
    'identity',
    'observedCustodyHoldCode',
    'previousCustodyRootId',
    'previousCustodyCapabilityEvidenceDigest',
    'currentCustodyRootId',
    'currentCustodyCapabilityEvidenceDigest',
    'recoveryAuthority',
    'recoveryAuthorityDigest',
    'recordedAt',
    'receiptDigest',
  ]);
  const identity = record === null ? null : snapshotIdentity(record.identity);
  const recoveryAuthority = record === null
    ? null
    : snapshotDispatchRecoveryAuthority(record.recoveryAuthority);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-historical-admission-quarantine'
    || record.state !== 'QUARANTINED_NO_EFFECT_CUSTODY_EPOCH'
    || record.dispatchRequestId !== reservation.dispatchRequestId
    || record.reservationReceiptDigest !== reservation.receiptDigest
    || record.historicalAdmissionReceiptDigest !== historicalAdmission.receiptDigest
    || record.historicalTerminalReceiptDigest !== historicalTerminal.receiptDigest
    || identity === null
    || !sameIdentity(identity, reservation.identity)
    || record.observedCustodyHoldCode !== observedCustodyHoldCode
    || !isHistoricalAdmissionQuarantineHoldCode(
      record.observedCustodyHoldCode as TaskAttemptCustodyHoldCode,
    )
    || record.previousCustodyRootId !== historicalAdmission.custodyRootId
    || record.previousCustodyCapabilityEvidenceDigest
      !== historicalAdmission.custodyCapabilityEvidenceDigest
    || record.currentCustodyRootId !== currentRoot.rootId
    || record.currentCustodyCapabilityEvidenceDigest !== currentRoot.capabilityEvidenceDigest
    || recoveryAuthority === null
    || !isDigest(record.recoveryAuthorityDigest)
    || record.recoveryAuthorityDigest
      !== dispatchRecoveryAuthorityDigest(recoveryAuthority, policy.jsonBounds)
    || !isTimestamp(record.recordedAt)
    || Date.parse(record.recordedAt) < Date.parse(historicalTerminal.recordedAt)
    || !isDigest(record.receiptDigest)
  ) return null;
  const body: Omit<TaskAttemptCustodyHistoricalAdmissionQuarantineV2, 'receiptDigest'> = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-historical-admission-quarantine',
    state: 'QUARANTINED_NO_EFFECT_CUSTODY_EPOCH',
    dispatchRequestId: reservation.dispatchRequestId,
    reservationReceiptDigest: reservation.receiptDigest,
    historicalAdmissionReceiptDigest: historicalAdmission.receiptDigest,
    historicalTerminalReceiptDigest: historicalTerminal.receiptDigest,
    identity,
    observedCustodyHoldCode,
    previousCustodyRootId: historicalAdmission.custodyRootId,
    previousCustodyCapabilityEvidenceDigest:
      historicalAdmission.custodyCapabilityEvidenceDigest,
    currentCustodyRootId: currentRoot.rootId,
    currentCustodyCapabilityEvidenceDigest: currentRoot.capabilityEvidenceDigest,
    recoveryAuthority,
    recoveryAuthorityDigest: record.recoveryAuthorityDigest as Sha256Digest,
    recordedAt: record.recordedAt,
  };
  if (record.receiptDigest !== historicalAdmissionQuarantineReceiptDigest(
    body,
    policy.jsonBounds,
  )) return null;
  return freezeObject({ ...body, receiptDigest: record.receiptDigest });
}

function dispatchReservationTransitionReceiptDigest(
  value: Omit<TaskAttemptCustodyDispatchReservationTransitionV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-reservation-transition', value, bounds);
}

function parseDispatchReservationTransition(
  value: unknown,
  reservation: TaskAttemptCustodyDispatchReservationV2,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyDispatchReservationTransitionV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'reservationReceiptDigest',
    'taskSnapshotDigest',
    'identity',
    'recoveryAuthority',
    'recoveryAuthorityDigest',
    'recordedAt',
    'receiptDigest',
  ]);
  const identity = record === null ? null : snapshotIdentity(record.identity);
  const recoveryAuthority = record?.recoveryAuthority === null
    ? null
    : snapshotDispatchRecoveryAuthority(record?.recoveryAuthority);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-reservation-transition'
    || (record.state !== 'ADMISSION_CLAIMED'
      && record.state !== 'RETIRED_BEFORE_ADMISSION')
    || record.reservationReceiptDigest !== reservation.receiptDigest
    || record.taskSnapshotDigest !== reservation.taskSnapshotDigest
    || identity === null
    || !sameIdentity(identity, reservation.identity)
    || !isTimestamp(record.recordedAt)
    || !isDigest(record.receiptDigest)
    || (
      record.state === 'ADMISSION_CLAIMED'
        ? recoveryAuthority !== null || record.recoveryAuthorityDigest !== null
        : recoveryAuthority === null
          || !isDigest(record.recoveryAuthorityDigest)
          || record.recoveryAuthorityDigest
            !== dispatchRecoveryAuthorityDigest(recoveryAuthority, policy.jsonBounds)
    )
  ) return null;
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-reservation-transition' as const,
    state: record.state as TaskAttemptCustodyDispatchReservationTransitionV2['state'],
    reservationReceiptDigest: reservation.receiptDigest,
    taskSnapshotDigest: reservation.taskSnapshotDigest,
    identity,
    recoveryAuthority,
    recoveryAuthorityDigest: record.recoveryAuthorityDigest as Sha256Digest | null,
    recordedAt: record.recordedAt,
  };
  if (record.receiptDigest !== dispatchReservationTransitionReceiptDigest(body, policy.jsonBounds)) {
    return null;
  }
  return freezeObject({ ...body, receiptDigest: record.receiptDigest });
}

function dispatchAdmissionRefDigest(
  value: Omit<TaskAttemptCustodyDispatchAdmissionRefV2, 'refDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-admission-ref', value, bounds);
}

function parseDispatchReservation(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyDispatchReservationV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'dispatchRequestId',
    'dispatchRequestMaterialDigest',
    'dispatchRequestMaterial',
    'taskSnapshotDigest',
    'policyDigest',
    'identity',
    'predecessor',
    'reservedAt',
    'bindingDigest',
    'receiptDigest',
  ]);
  if (record === null) return null;
  const identity = snapshotIdentity(record.identity);
  const materialProof = parseFileProof(record.dispatchRequestMaterial);
  const predecessor = record.predecessor === null
    ? null
    : snapshotDispatchPredecessorRef(record.predecessor);
  if (
    record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-reservation'
    || record.state !== 'reserved'
    || !isDispatchRequestId(record.dispatchRequestId)
    || !isDigest(record.dispatchRequestMaterialDigest)
    || materialProof === null
    || !isDigest(record.taskSnapshotDigest)
    || record.policyDigest !== policy.policyDigest
    || identity === null
    || (record.predecessor !== null && predecessor === null)
    || !isTimestamp(record.reservedAt)
    || !isDigest(record.bindingDigest)
    || !isDigest(record.receiptDigest)
  ) return null;
  const bindingBody = {
    dispatchRequestId: record.dispatchRequestId,
    dispatchRequestMaterialDigest: record.dispatchRequestMaterialDigest,
    taskSnapshotDigest: record.taskSnapshotDigest,
    policyDigest: record.policyDigest,
    identity,
    predecessor,
  };
  if (record.bindingDigest !== dispatchReservationBindingDigest(bindingBody, policy.jsonBounds)) {
    return null;
  }
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-reservation' as const,
    state: 'reserved' as const,
    ...bindingBody,
    dispatchRequestMaterial: materialProof,
    reservedAt: record.reservedAt,
    bindingDigest: record.bindingDigest,
  };
  if (record.receiptDigest !== dispatchReservationReceiptDigest(body, policy.jsonBounds)) {
    return null;
  }
  return freezeObject({ ...body, receiptDigest: record.receiptDigest });
}

function createDispatchAdmissionRef(
  reservation: TaskAttemptCustodyDispatchReservationV2,
  admission: TaskAttemptCustodyAdmissionV2,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDispatchAdmissionRefV2 {
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-admission-ref' as const,
    state: 'admitted' as const,
    dispatchRequestId: reservation.dispatchRequestId,
    dispatchRequestMaterialDigest: reservation.dispatchRequestMaterialDigest,
    reservationReceiptDigest: reservation.receiptDigest,
    identity: cloneIdentity(reservation.identity),
    admissionReceiptDigest: admission.receiptDigest,
  };
  return freezeObject({ ...body, refDigest: dispatchAdmissionRefDigest(body, bounds) });
}

function snapshotDispatchAdmissionRef(
  value: unknown,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDispatchAdmissionRefV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'dispatchRequestId',
    'dispatchRequestMaterialDigest',
    'reservationReceiptDigest',
    'identity',
    'admissionReceiptDigest',
    'refDigest',
  ]);
  const identity = record === null ? null : snapshotIdentity(record.identity);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-admission-ref'
    || record.state !== 'admitted'
    || !isDispatchRequestId(record.dispatchRequestId)
    || !isDigest(record.dispatchRequestMaterialDigest)
    || !isDigest(record.reservationReceiptDigest)
    || identity === null
    || !isDigest(record.admissionReceiptDigest)
    || !isDigest(record.refDigest)
  ) return null;
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-admission-ref' as const,
    state: 'admitted' as const,
    dispatchRequestId: record.dispatchRequestId,
    dispatchRequestMaterialDigest: record.dispatchRequestMaterialDigest,
    reservationReceiptDigest: record.reservationReceiptDigest,
    identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
  };
  if (record.refDigest !== dispatchAdmissionRefDigest(body, bounds)) return null;
  return freezeObject({ ...body, refDigest: record.refDigest });
}

function physicalTransitionClaimDigest(input: {
  readonly state: TaskAttemptCustodyPhysicalTransitionV2['state'];
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly reasonCode: TaskAttemptCustodyNotDispatchedReasonCode | null;
  readonly noEffectObservationBindingDigest: Sha256Digest | null;
}, bounds: CanonicalJsonBounds): Sha256Digest {
  return taskAttemptCustodyDigest('physical-transition-claim', input, bounds);
}

function physicalTransitionReceiptDigest(
  value: Omit<TaskAttemptCustodyPhysicalTransitionV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('physical-transition-receipt', value, bounds);
}

function parsePhysicalTransition(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyPhysicalTransitionV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'identity',
    'admissionReceiptDigest',
    'policyDigest',
    'reasonCode',
    'noEffectObservationBindingDigest',
    'claimDigest',
    'receiptDigest',
  ]);
  const identity = record === null ? null : snapshotIdentity(record.identity);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-physical-transition'
    || (record.state !== 'MOUNT_CLAIMED' && record.state !== 'NOT_DISPATCHED_CLAIMED')
    || identity === null
    || !isDigest(record.admissionReceiptDigest)
    || record.policyDigest !== policy.policyDigest
    || !isDigest(record.claimDigest)
    || !isDigest(record.receiptDigest)
    || (
      record.state === 'MOUNT_CLAIMED'
        ? record.reasonCode !== null || record.noEffectObservationBindingDigest !== null
        : !TASK_ATTEMPT_CUSTODY_NOT_DISPATCHED_REASON_CODES.includes(
          record.reasonCode as TaskAttemptCustodyNotDispatchedReasonCode,
        ) || !isDigest(record.noEffectObservationBindingDigest)
    )
  ) return null;
  const claimBody = {
    state: record.state as TaskAttemptCustodyPhysicalTransitionV2['state'],
    identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
    policyDigest: record.policyDigest,
    reasonCode: record.reasonCode as TaskAttemptCustodyNotDispatchedReasonCode | null,
    noEffectObservationBindingDigest:
      record.noEffectObservationBindingDigest as Sha256Digest | null,
  };
  if (record.claimDigest !== physicalTransitionClaimDigest(claimBody, policy.jsonBounds)) {
    return null;
  }
  const withoutReceipt = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-physical-transition' as const,
    ...claimBody,
    claimDigest: record.claimDigest,
  };
  if (
    record.receiptDigest !== physicalTransitionReceiptDigest(
      withoutReceipt,
      policy.jsonBounds,
    )
  ) return null;
  return freezeObject({ ...withoutReceipt, receiptDigest: record.receiptDigest });
}

function isDispatchObservationClass(
  value: unknown,
): value is TaskAttemptCustodyDispatchObservationClass {
  return typeof value === 'string'
    && TASK_ATTEMPT_CUSTODY_DISPATCH_OBSERVATION_CLASSES.includes(
      value as TaskAttemptCustodyDispatchObservationClass,
    );
}

interface DispatchObservationClaim {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-dispatch-observation-claim';
  readonly observationClass: TaskAttemptCustodyDispatchObservationClass;
  readonly admissionRefDigest: Sha256Digest;
  readonly observedAt: string;
  readonly rawBytesDigest: Sha256Digest;
  readonly byteLength: number;
  readonly claimDigest: Sha256Digest;
}

function dispatchObservationClaimDigest(
  value: Omit<DispatchObservationClaim, 'claimDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-observation-claim', value, bounds);
}

function createDispatchObservationClaim(input: {
  readonly observationClass: TaskAttemptCustodyDispatchObservationClass;
  readonly admissionRefDigest: Sha256Digest;
  readonly observedAt: string;
  readonly bytes: Uint8Array;
}, bounds: CanonicalJsonBounds): DispatchObservationClaim {
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-observation-claim' as const,
    observationClass: input.observationClass,
    admissionRefDigest: input.admissionRefDigest,
    observedAt: input.observedAt,
    rawBytesDigest: rawSha256(input.bytes),
    byteLength: input.bytes.byteLength,
  };
  return freezeObject({
    ...body,
    claimDigest: dispatchObservationClaimDigest(body, bounds),
  });
}

function parseDispatchObservationClaim(
  value: unknown,
  bounds: CanonicalJsonBounds,
): DispatchObservationClaim | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'observationClass',
    'admissionRefDigest',
    'observedAt',
    'rawBytesDigest',
    'byteLength',
    'claimDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-observation-claim'
    || !isDispatchObservationClass(record.observationClass)
    || !isDigest(record.admissionRefDigest)
    || !isTimestamp(record.observedAt)
    || !isDigest(record.rawBytesDigest)
    || !assertNonnegativeSafeInteger(record.byteLength)
    || record.byteLength > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
    || !isDigest(record.claimDigest)
  ) return null;
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-observation-claim' as const,
    observationClass: record.observationClass,
    admissionRefDigest: record.admissionRefDigest,
    observedAt: record.observedAt,
    rawBytesDigest: record.rawBytesDigest,
    byteLength: record.byteLength,
  };
  if (record.claimDigest !== dispatchObservationClaimDigest(body, bounds)) return null;
  return freezeObject({ ...body, claimDigest: record.claimDigest });
}

function dispatchObservationEvidenceDigest(input: {
  readonly observationClass: TaskAttemptCustodyDispatchObservationClass;
  readonly admissionRefDigest: Sha256Digest;
  readonly observedAt: string;
  readonly rawBytesDigest: Sha256Digest;
  readonly byteLength: number;
}, bounds: CanonicalJsonBounds): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-observation-evidence', input, bounds);
}

function dispatchObservationReceiptDigest(
  value: Omit<TaskAttemptCustodyDispatchObservationReceiptV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-observation-receipt', value, bounds);
}

function createDispatchObservationReceipt(input: {
  readonly observationClass: TaskAttemptCustodyDispatchObservationClass;
  readonly admissionRefDigest: Sha256Digest;
  readonly observedAt: string;
  readonly bytes: Uint8Array;
}, bounds: CanonicalJsonBounds): TaskAttemptCustodyDispatchObservationReceiptV2 {
  const rawBytesDigest = rawSha256(input.bytes);
  const evidenceDigest = dispatchObservationEvidenceDigest({
    observationClass: input.observationClass,
    admissionRefDigest: input.admissionRefDigest,
    observedAt: input.observedAt,
    rawBytesDigest,
    byteLength: input.bytes.byteLength,
  }, bounds);
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-observation' as const,
    observationClass: input.observationClass,
    admissionRefDigest: input.admissionRefDigest,
    observedAt: input.observedAt,
    evidenceDigest,
    byteLength: input.bytes.byteLength,
  };
  return freezeObject({
    ...body,
    receiptDigest: dispatchObservationReceiptDigest(body, bounds),
  });
}

function parseDispatchObservationReceipt(
  value: unknown,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDispatchObservationReceiptV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'observationClass',
    'admissionRefDigest',
    'observedAt',
    'evidenceDigest',
    'byteLength',
    'receiptDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-observation'
    || !isDispatchObservationClass(record.observationClass)
    || !isDigest(record.admissionRefDigest)
    || !isTimestamp(record.observedAt)
    || !isDigest(record.evidenceDigest)
    || !assertNonnegativeSafeInteger(record.byteLength)
    || record.byteLength > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
    || !isDigest(record.receiptDigest)
  ) return null;
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-observation' as const,
    observationClass: record.observationClass,
    admissionRefDigest: record.admissionRefDigest,
    observedAt: record.observedAt,
    evidenceDigest: record.evidenceDigest,
    byteLength: record.byteLength,
  };
  if (record.receiptDigest !== dispatchObservationReceiptDigest(body, bounds)) return null;
  return freezeObject({ ...body, receiptDigest: record.receiptDigest });
}

function createDispatchReleaseEvidence(
  value: unknown,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDispatchReleaseEvidenceV2 {
  const record = requireExactDataRecord(value, [
    'containerId',
    'imageDigest',
    'mountReceiptDigest',
    'mountTransferEvidenceDigest',
    'daemonAuthorityLabelDigest',
    'releaseNonceDigest',
    'providerInvocationDigest',
    'gateAckReceiptDigest',
    'gateAckEvidenceDigest',
    'releasedAt',
    'ackMethod',
    'ackStatus',
  ], 'DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
  if (
    typeof record.containerId !== 'string'
    || !matchesPattern(DOCKER_CONTAINER_ID_PATTERN, record.containerId)
    || !isDigest(record.imageDigest)
    || !isDigest(record.mountReceiptDigest)
    || !isDigest(record.mountTransferEvidenceDigest)
    || !isDigest(record.daemonAuthorityLabelDigest)
    || !isDigest(record.releaseNonceDigest)
    || !isDigest(record.providerInvocationDigest)
    || !isDigest(record.gateAckReceiptDigest)
    || !isDigest(record.gateAckEvidenceDigest)
    || !isTimestamp(record.releasedAt)
    || !TASK_ATTEMPT_CUSTODY_RELEASE_ACK_METHODS.includes(
      record.ackMethod as TaskAttemptCustodyReleaseAckMethod,
    )
    || record.ackStatus !== 'ACKNOWLEDGED'
  ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-release-evidence' as const,
    containerId: record.containerId,
    imageDigest: record.imageDigest,
    mountReceiptDigest: record.mountReceiptDigest,
    mountTransferEvidenceDigest: record.mountTransferEvidenceDigest,
    daemonAuthorityLabelDigest: record.daemonAuthorityLabelDigest,
    releaseNonceDigest: record.releaseNonceDigest,
    providerInvocationDigest: record.providerInvocationDigest,
    gateAckReceiptDigest: record.gateAckReceiptDigest,
    gateAckEvidenceDigest: record.gateAckEvidenceDigest,
    releasedAt: record.releasedAt,
    ackMethod: record.ackMethod as TaskAttemptCustodyReleaseAckMethod,
    ackStatus: 'ACKNOWLEDGED' as const,
  };
  const evidenceDigest = taskAttemptCustodyDigest(
    'dispatch-release-evidence',
    body,
    bounds,
  );
  return freezeObject({
    ...body,
    evidenceDigest,
    receiptDigest: taskAttemptCustodyDigest(
      'dispatch-release-receipt',
      { ...body, evidenceDigest },
      bounds,
    ),
  });
}

function snapshotDispatchReleaseEvidence(
  value: unknown,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDispatchReleaseEvidenceV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'containerId',
    'imageDigest',
    'mountReceiptDigest',
    'mountTransferEvidenceDigest',
    'daemonAuthorityLabelDigest',
    'releaseNonceDigest',
    'providerInvocationDigest',
    'gateAckReceiptDigest',
    'gateAckEvidenceDigest',
    'releasedAt',
    'ackMethod',
    'ackStatus',
    'evidenceDigest',
    'receiptDigest',
  ]);
  if (record === null) return null;
  let expected: TaskAttemptCustodyDispatchReleaseEvidenceV2;
  try {
    expected = createDispatchReleaseEvidence({
      containerId: record.containerId,
      imageDigest: record.imageDigest,
      mountReceiptDigest: record.mountReceiptDigest,
      mountTransferEvidenceDigest: record.mountTransferEvidenceDigest,
      daemonAuthorityLabelDigest: record.daemonAuthorityLabelDigest,
      releaseNonceDigest: record.releaseNonceDigest,
      providerInvocationDigest: record.providerInvocationDigest,
      gateAckReceiptDigest: record.gateAckReceiptDigest,
      gateAckEvidenceDigest: record.gateAckEvidenceDigest,
      releasedAt: record.releasedAt,
      ackMethod: record.ackMethod,
      ackStatus: record.ackStatus,
    }, bounds);
  } catch {
    return null;
  }
  if (
    record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-release-evidence'
    || record.evidenceDigest !== expected.evidenceDigest
    || record.receiptDigest !== expected.receiptDigest
  ) return null;
  return expected;
}

function dispatchProviderExecutionAttempt(
  admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2,
  backendExecutionId: string,
  releaseEvidence: TaskAttemptCustodyDispatchReleaseEvidenceV2,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyProviderExecutionAttemptV2 {
  const seed = taskAttemptCustodyDigest('provider-execution-attempt-seed', {
    admissionRefDigest: admissionRef.refDigest,
    backendExecutionId,
    releaseReceiptDigest: releaseEvidence.receiptDigest,
    providerInvocationDigest: releaseEvidence.providerInvocationDigest,
  }, bounds);
  const providerExecutionAttemptId = deterministicDispatchUuid(seed);
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-provider-execution-attempt' as const,
    providerExecutionAttemptId,
    custodyIdentity: cloneIdentity(admissionRef.identity),
    admissionReceiptDigest: admissionRef.admissionReceiptDigest,
    backendExecutionId,
  };
  return freezeObject({
    ...body,
    identityDigest: taskAttemptCustodyDigest(
      'provider-execution-attempt-identity',
      body,
      bounds,
    ),
  });
}

function snapshotProviderExecutionAttempt(
  value: unknown,
  admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2,
  releaseEvidence: TaskAttemptCustodyDispatchReleaseEvidenceV2,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyProviderExecutionAttemptV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'providerExecutionAttemptId',
    'custodyIdentity',
    'admissionReceiptDigest',
    'backendExecutionId',
    'identityDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-provider-execution-attempt'
    || typeof record.backendExecutionId !== 'string'
    || !matchesPattern(DOCKER_CONTAINER_ID_PATTERN, record.backendExecutionId)
  ) return null;
  const expected = dispatchProviderExecutionAttempt(
    admissionRef,
    record.backendExecutionId,
    releaseEvidence,
    bounds,
  );
  if (
    record.providerExecutionAttemptId !== expected.providerExecutionAttemptId
    || record.providerExecutionAttemptId === admissionRef.identity.attemptId
    || snapshotIdentity(record.custodyIdentity) === null
    || !sameIdentity(
      record.custodyIdentity as TaskAttemptCustodyIdentityV2,
      admissionRef.identity,
    )
    || record.admissionReceiptDigest !== admissionRef.admissionReceiptDigest
    || record.identityDigest !== expected.identityDigest
  ) return null;
  return expected;
}

function dispatchProjectionFence(input: {
  readonly admissionRefDigest: Sha256Digest;
  readonly state: 'RELEASED' | 'NOT_DISPATCHED';
  readonly mountReceiptDigest: Sha256Digest | null;
  readonly releaseReceiptDigest: Sha256Digest | null;
  readonly providerExecutionAttemptDigest: Sha256Digest | null;
  readonly noEffectEvidenceDigest: Sha256Digest | null;
}, bounds: CanonicalJsonBounds): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-projection-fence', input, bounds);
}

function dispatchTerminalReceiptDigest(
  value: Omit<TaskAttemptCustodyDispatchTerminalAuthorityV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-terminal-authority', value, bounds);
}

function dispatchReconciliationReceiptDigest(
  value: Omit<TaskAttemptCustodyDispatchReconciliationV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('dispatch-reconciliation-authority', value, bounds);
}

function createNoEffectEvidence(
  admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2,
  value: unknown,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyNoEffectEvidenceV2 {
  const record = requireExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'daemonContainerState',
    'providerReleaseState',
    'daemonInspectionReceiptDigest',
    'providerReleaseProbeEvidenceDigest',
    'backendProbeEvidenceDigest',
    'containmentEvidenceDigest',
    'observationReceiptDigest',
    'observationEvidenceDigest',
    'observedAt',
  ], 'DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
  if (
    record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-no-effect-observation'
    || record.daemonContainerState !== 'ABSENT'
    || record.providerReleaseState !== 'ABSENT'
    || !isDigest(record.daemonInspectionReceiptDigest)
    || !isDigest(record.providerReleaseProbeEvidenceDigest)
    || !isDigest(record.backendProbeEvidenceDigest)
    || !isDigest(record.containmentEvidenceDigest)
    || !isDigest(record.observationReceiptDigest)
    || !isDigest(record.observationEvidenceDigest)
    || !isTimestamp(record.observedAt)
  ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
  const observation: TaskAttemptCustodyDispatchNoEffectObservationV2 = freezeObject({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-no-effect-observation',
    daemonContainerState: 'ABSENT',
    providerReleaseState: 'ABSENT',
    daemonInspectionReceiptDigest: record.daemonInspectionReceiptDigest,
    providerReleaseProbeEvidenceDigest: record.providerReleaseProbeEvidenceDigest,
    backendProbeEvidenceDigest: record.backendProbeEvidenceDigest,
    containmentEvidenceDigest: record.containmentEvidenceDigest,
    observationReceiptDigest: record.observationReceiptDigest,
    observationEvidenceDigest: record.observationEvidenceDigest,
    observedAt: record.observedAt,
  });
  const observationBindingDigest = taskAttemptCustodyDigest(
    'dispatch-no-effect-observation-binding',
    {
      admissionRefDigest: admissionRef.refDigest,
      daemonContainerState: observation.daemonContainerState,
      providerReleaseState: observation.providerReleaseState,
      daemonInspectionReceiptDigest: observation.daemonInspectionReceiptDigest,
      providerReleaseProbeEvidenceDigest: observation.providerReleaseProbeEvidenceDigest,
      backendProbeEvidenceDigest: observation.backendProbeEvidenceDigest,
      containmentEvidenceDigest: observation.containmentEvidenceDigest,
      observationReceiptDigest: observation.observationReceiptDigest,
      observationEvidenceDigest: observation.observationEvidenceDigest,
    },
    bounds,
  );
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-no-effect-evidence' as const,
    mountEffect: 'ABSENT' as const,
    daemonEffect: 'ABSENT' as const,
    providerEffect: 'ABSENT' as const,
    observation,
    observationBindingDigest,
    verifiedAt: observation.observedAt,
  };
  return freezeObject({
    ...body,
    evidenceDigest: taskAttemptCustodyDigest('dispatch-no-effect-evidence', {
      admissionRefDigest: admissionRef.refDigest,
      ...body,
    }, bounds),
  });
}

function snapshotNoEffectEvidence(
  value: unknown,
  admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyNoEffectEvidenceV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'mountEffect',
    'daemonEffect',
    'providerEffect',
    'observation',
    'observationBindingDigest',
    'verifiedAt',
    'evidenceDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-no-effect-evidence'
    || record.mountEffect !== 'ABSENT'
    || record.daemonEffect !== 'ABSENT'
    || record.providerEffect !== 'ABSENT'
    || !isDigest(record.observationBindingDigest)
    || !isTimestamp(record.verifiedAt)
    || !isDigest(record.evidenceDigest)
  ) return null;
  const expected = createNoEffectEvidence(
    admissionRef,
    record.observation,
    bounds,
  );
  return expected.evidenceDigest === record.evidenceDigest
    && expected.observationBindingDigest === record.observationBindingDigest
    && expected.verifiedAt === record.verifiedAt
    ? expected
    : null;
}

function parseDispatchTerminalAuthority(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyDispatchTerminalAuthorityV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'admissionRef',
    'attemptCount',
    'providerExecutionAttempt',
    'backendExecutionId',
    'mountReceiptDigest',
    'mountTransferEvidenceDigest',
    'releaseEvidence',
    'releaseReceiptDigest',
    'releaseEvidenceDigest',
    'noEffectEvidence',
    'reasonCode',
    'projectionFence',
    'recordedAt',
    'receiptDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-authority'
    || (record.state !== 'RELEASED' && record.state !== 'NOT_DISPATCHED')
    || !isTimestamp(record.recordedAt)
    || !isDigest(record.projectionFence)
    || !isDigest(record.receiptDigest)
  ) return null;
  const admissionRef = snapshotDispatchAdmissionRef(record.admissionRef, policy.jsonBounds);
  if (admissionRef === null) return null;
  if (record.state === 'RELEASED') {
    const releaseEvidence = snapshotDispatchReleaseEvidence(
      record.releaseEvidence,
      policy.jsonBounds,
    );
    if (releaseEvidence === null) return null;
    const providerExecutionAttempt = snapshotProviderExecutionAttempt(
      record.providerExecutionAttempt,
      admissionRef,
      releaseEvidence,
      policy.jsonBounds,
    );
    if (
      providerExecutionAttempt === null
      || record.attemptCount !== 1
      || record.backendExecutionId !== releaseEvidence.containerId
      || record.backendExecutionId !== providerExecutionAttempt.backendExecutionId
      || record.mountReceiptDigest !== releaseEvidence.mountReceiptDigest
      || record.mountTransferEvidenceDigest !== releaseEvidence.mountTransferEvidenceDigest
      || record.releaseReceiptDigest !== releaseEvidence.receiptDigest
      || record.releaseEvidenceDigest !== releaseEvidence.evidenceDigest
      || record.noEffectEvidence !== null
      || record.reasonCode !== null
      || Date.parse(record.recordedAt) < Date.parse(releaseEvidence.releasedAt)
    ) return null;
    const projectionFence = dispatchProjectionFence({
      admissionRefDigest: admissionRef.refDigest,
      state: 'RELEASED',
      mountReceiptDigest: releaseEvidence.mountReceiptDigest,
      releaseReceiptDigest: releaseEvidence.receiptDigest,
      providerExecutionAttemptDigest: providerExecutionAttempt.identityDigest,
      noEffectEvidenceDigest: null,
    }, policy.jsonBounds);
    if (record.projectionFence !== projectionFence) return null;
    const body: Omit<TaskAttemptCustodyDispatchReleasedAuthorityV2, 'receiptDigest'> = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-dispatch-authority',
      state: 'RELEASED',
      admissionRef,
      attemptCount: 1,
      providerExecutionAttempt,
      backendExecutionId: releaseEvidence.containerId,
      mountReceiptDigest: releaseEvidence.mountReceiptDigest,
      mountTransferEvidenceDigest: releaseEvidence.mountTransferEvidenceDigest,
      releaseEvidence,
      releaseReceiptDigest: releaseEvidence.receiptDigest,
      releaseEvidenceDigest: releaseEvidence.evidenceDigest,
      noEffectEvidence: null,
      reasonCode: null,
      projectionFence,
      recordedAt: record.recordedAt,
    };
    if (record.receiptDigest !== dispatchTerminalReceiptDigest(body, policy.jsonBounds)) {
      return null;
    }
    return freezeObject({ ...body, receiptDigest: record.receiptDigest });
  }
  if (
    record.attemptCount !== 0
    || record.providerExecutionAttempt !== null
    || record.backendExecutionId !== null
    || record.mountReceiptDigest !== null
    || record.mountTransferEvidenceDigest !== null
    || record.releaseEvidence !== null
    || record.releaseReceiptDigest !== null
    || record.releaseEvidenceDigest !== null
    || !TASK_ATTEMPT_CUSTODY_NOT_DISPATCHED_REASON_CODES.includes(
      record.reasonCode as TaskAttemptCustodyNotDispatchedReasonCode,
    )
  ) return null;
  const noEffectEvidence = snapshotNoEffectEvidence(
    record.noEffectEvidence,
    admissionRef,
    policy.jsonBounds,
  );
  if (noEffectEvidence === null || record.recordedAt !== noEffectEvidence.verifiedAt) return null;
  const projectionFence = dispatchProjectionFence({
    admissionRefDigest: admissionRef.refDigest,
    state: 'NOT_DISPATCHED',
    mountReceiptDigest: null,
    releaseReceiptDigest: null,
    providerExecutionAttemptDigest: null,
    noEffectEvidenceDigest: noEffectEvidence.evidenceDigest,
  }, policy.jsonBounds);
  if (record.projectionFence !== projectionFence) return null;
  const body: Omit<TaskAttemptCustodyDispatchNotDispatchedAuthorityV2, 'receiptDigest'> = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-authority',
    state: 'NOT_DISPATCHED',
    admissionRef,
    attemptCount: 0,
    providerExecutionAttempt: null,
    backendExecutionId: null,
    mountReceiptDigest: null,
    mountTransferEvidenceDigest: null,
    releaseEvidence: null,
    releaseReceiptDigest: null,
    releaseEvidenceDigest: null,
    noEffectEvidence,
    reasonCode: record.reasonCode as TaskAttemptCustodyNotDispatchedReasonCode,
    projectionFence,
    recordedAt: record.recordedAt,
  };
  if (record.receiptDigest !== dispatchTerminalReceiptDigest(body, policy.jsonBounds)) {
    return null;
  }
  return freezeObject({ ...body, receiptDigest: record.receiptDigest });
}

function createDispatchReconciliationEvidence(
  admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2,
  mountEffectState: TaskAttemptCustodyDispatchReconciliationV2['mountEffectState'],
  value: unknown,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDispatchReconciliationEvidenceV2 {
  const record = requireExactDataRecord(value, [
    'containerState',
    'containerId',
    'imageDigest',
    'mountReceiptDigest',
    'releaseState',
    'releaseNonceDigest',
    'providerInvocationDigest',
    'containmentEvidenceDigest',
    'backendProbeEvidenceDigest',
    'observationReceiptDigest',
    'observationEvidenceDigest',
    'observedAt',
  ], 'DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
  const containerPairValid = record.containerState === 'ABSENT'
    ? record.containerId === null && record.imageDigest === null
    : record.containerState === 'PRESENT'
      ? typeof record.containerId === 'string'
        && matchesPattern(DOCKER_CONTAINER_ID_PATTERN, record.containerId)
        && isDigest(record.imageDigest)
      : record.containerState === 'UNKNOWN'
        && record.containerId === null
        && record.imageDigest === null;
  const releasePairValid = record.releaseState === 'NOT_ATTEMPTED'
    ? record.releaseNonceDigest === null && record.providerInvocationDigest === null
    : ['UNCONFIRMED', 'ACKNOWLEDGED'].includes(record.releaseState as string)
      ? isDigest(record.releaseNonceDigest) && isDigest(record.providerInvocationDigest)
      : record.releaseState === 'UNKNOWN'
        && record.releaseNonceDigest === null
        && record.providerInvocationDigest === null;
  if (
    !containerPairValid
    || !releasePairValid
    || (
      mountEffectState === 'OUTCOME_CONFIRMED'
        ? !isDigest(record.mountReceiptDigest)
        : record.mountReceiptDigest !== null
    )
    || !isDigest(record.containmentEvidenceDigest)
    || !isDigest(record.backendProbeEvidenceDigest)
    || !isDigest(record.observationReceiptDigest)
    || !isDigest(record.observationEvidenceDigest)
    || !isTimestamp(record.observedAt)
  ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-reconciliation-evidence' as const,
    mountEffectState,
    containerState: record.containerState as TaskAttemptCustodyDispatchReconciliationEvidenceV2['containerState'],
    containerId: record.containerId as string | null,
    imageDigest: record.imageDigest as Sha256Digest | null,
    mountReceiptDigest: record.mountReceiptDigest as Sha256Digest | null,
    releaseState: record.releaseState as TaskAttemptCustodyDispatchReconciliationEvidenceV2['releaseState'],
    releaseNonceDigest: record.releaseNonceDigest as Sha256Digest | null,
    providerInvocationDigest: record.providerInvocationDigest as Sha256Digest | null,
    containmentEvidenceDigest: record.containmentEvidenceDigest as Sha256Digest,
    backendProbeEvidenceDigest: record.backendProbeEvidenceDigest as Sha256Digest,
    observationReceiptDigest: record.observationReceiptDigest as Sha256Digest,
    observationEvidenceDigest: record.observationEvidenceDigest as Sha256Digest,
    observedAt: record.observedAt as string,
  };
  return freezeObject({
    ...body,
    evidenceDigest: taskAttemptCustodyDigest(
      'dispatch-reconciliation-evidence',
      { admissionRefDigest: admissionRef.refDigest, ...body },
      bounds,
    ),
  });
}

function snapshotDispatchReconciliationEvidence(
  value: unknown,
  admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2,
  mountEffectState: TaskAttemptCustodyDispatchReconciliationV2['mountEffectState'],
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDispatchReconciliationEvidenceV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'mountEffectState',
    'containerState',
    'containerId',
    'imageDigest',
    'mountReceiptDigest',
    'releaseState',
    'releaseNonceDigest',
    'providerInvocationDigest',
    'containmentEvidenceDigest',
    'backendProbeEvidenceDigest',
    'observationReceiptDigest',
    'observationEvidenceDigest',
    'observedAt',
    'evidenceDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-reconciliation-evidence'
    || record.mountEffectState !== mountEffectState
    || !isDigest(record.evidenceDigest)
  ) return null;
  let expected: TaskAttemptCustodyDispatchReconciliationEvidenceV2;
  try {
    expected = createDispatchReconciliationEvidence(
      admissionRef,
      mountEffectState,
      {
        containerState: record.containerState,
        containerId: record.containerId,
        imageDigest: record.imageDigest,
        mountReceiptDigest: record.mountReceiptDigest,
        releaseState: record.releaseState,
        releaseNonceDigest: record.releaseNonceDigest,
        providerInvocationDigest: record.providerInvocationDigest,
        containmentEvidenceDigest: record.containmentEvidenceDigest,
        backendProbeEvidenceDigest: record.backendProbeEvidenceDigest,
        observationReceiptDigest: record.observationReceiptDigest,
        observationEvidenceDigest: record.observationEvidenceDigest,
        observedAt: record.observedAt,
      },
      bounds,
    );
  } catch {
    return null;
  }
  return expected.evidenceDigest === record.evidenceDigest ? expected : null;
}

function parseDispatchReconciliation(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyDispatchReconciliationV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'admissionRef',
    'mountEffectState',
    'reasonCode',
    'reconciliationEvidence',
    'evidenceDigest',
    'recordedAt',
    'reconciliationRef',
    'receiptDigest',
  ]);
  const admissionRef = record === null
    ? null
    : snapshotDispatchAdmissionRef(record.admissionRef, policy.jsonBounds);
  const mountEffectState = record?.mountEffectState as
    | TaskAttemptCustodyDispatchReconciliationV2['mountEffectState']
    | undefined;
  const reconciliationEvidence = record === null || mountEffectState === undefined
    ? null
    : snapshotDispatchReconciliationEvidence(
      record.reconciliationEvidence,
      admissionRef as TaskAttemptCustodyDispatchAdmissionRefV2,
      mountEffectState,
      policy.jsonBounds,
    );
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-dispatch-reconciliation'
    || record.state !== 'AMBIGUOUS'
    || admissionRef === null
    || !['ABSENT', 'INTENT_ONLY', 'OUTCOME_CONFIRMED'].includes(
      record.mountEffectState as string,
    )
    || !TASK_ATTEMPT_CUSTODY_AMBIGUOUS_REASON_CODES.includes(
      record.reasonCode as TaskAttemptCustodyAmbiguousReasonCode,
    )
    || reconciliationEvidence === null
    || record.evidenceDigest !== reconciliationEvidence.evidenceDigest
    || !isTimestamp(record.recordedAt)
    || !isDigest(record.reconciliationRef)
    || !isDigest(record.receiptDigest)
  ) return null;
  const withoutReceipt = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-dispatch-reconciliation' as const,
    state: 'AMBIGUOUS' as const,
    admissionRef,
    mountEffectState: record.mountEffectState as TaskAttemptCustodyDispatchReconciliationV2['mountEffectState'],
    reasonCode: record.reasonCode as TaskAttemptCustodyAmbiguousReasonCode,
    reconciliationEvidence,
    evidenceDigest: reconciliationEvidence.evidenceDigest,
    recordedAt: record.recordedAt,
    reconciliationRef: record.reconciliationRef,
  };
  if (
    record.reconciliationRef !== taskAttemptCustodyDigest(
      'dispatch-reconciliation-ref',
      {
        admissionRefDigest: admissionRef.refDigest,
        mountEffectState: withoutReceipt.mountEffectState,
        reasonCode: withoutReceipt.reasonCode,
        evidenceDigest: withoutReceipt.evidenceDigest,
      },
      policy.jsonBounds,
    )
    || record.receiptDigest !== dispatchReconciliationReceiptDigest(
      withoutReceipt,
      policy.jsonBounds,
    )
  ) return null;
  return freezeObject({ ...withoutReceipt, receiptDigest: record.receiptDigest });
}

export function createTaskAttemptCustodyBackendMountTransferReceipt(
  input: Omit<
    TaskAttemptCustodyBackendMountTransferReceipt,
    'schemaVersion' | 'kind' | 'transferEvidenceDigest' | 'receiptDigest'
  >,
): TaskAttemptCustodyBackendMountTransferReceipt {
  const record = requireExactDataRecord(input, [
    'state',
    'rootId',
    'scopeDigest',
    'effectOpDigest',
    'attemptId',
    'generation',
    'backend',
    'backendExecutionId',
    'backendImageDigest',
    'backendAuthorityLabelDigest',
    'taskSnapshotMountEvidenceDigest',
    'workerOutputMountEvidenceDigest',
    'backendBootstrapProbeEvidenceDigest',
    'daemonMountReceiptDigest',
    'cleanupEvidenceDigest',
  ], 'CAPABILITY_UNVERIFIED', 'resolve-mount');
  const consumedEvidenceComplete = (
    typeof record.backendExecutionId === 'string'
    && matchesPattern(DOCKER_CONTAINER_ID_PATTERN, record.backendExecutionId)
    && isDigest(record.backendImageDigest)
    && isDigest(record.backendAuthorityLabelDigest)
    && isDigest(record.taskSnapshotMountEvidenceDigest)
    && isDigest(record.workerOutputMountEvidenceDigest)
    && isDigest(record.backendBootstrapProbeEvidenceDigest)
    && isDigest(record.daemonMountReceiptDigest)
  );
  const cleanupEvidenceFieldsValid = (
    (record.backendExecutionId === null || (
      typeof record.backendExecutionId === 'string'
      && matchesPattern(DOCKER_CONTAINER_ID_PATTERN, record.backendExecutionId)
    ))
    && (record.backendImageDigest === null || isDigest(record.backendImageDigest))
    && (
      record.backendAuthorityLabelDigest === null
      || isDigest(record.backendAuthorityLabelDigest)
    )
    && (
      record.taskSnapshotMountEvidenceDigest === null
      || isDigest(record.taskSnapshotMountEvidenceDigest)
    )
    && (
      record.workerOutputMountEvidenceDigest === null
      || isDigest(record.workerOutputMountEvidenceDigest)
    )
    && (
      record.backendBootstrapProbeEvidenceDigest === null
      || isDigest(record.backendBootstrapProbeEvidenceDigest)
    )
    && (
      record.daemonMountReceiptDigest === null
      || isDigest(record.daemonMountReceiptDigest)
    )
  );
  if (
    (record.state !== 'CONSUMED' && record.state !== 'CLEANUP_UNCONFIRMED')
    || !isDigest(record.rootId)
    || !isDigest(record.scopeDigest)
    || !isDigest(record.effectOpDigest)
    || typeof record.attemptId !== 'string'
    || !matchesPattern(UUID_PATTERN, record.attemptId)
    || !assertPositiveSafeInteger(record.generation)
    || record.backend !== 'docker'
    || (
      record.state === 'CONSUMED'
        ? !consumedEvidenceComplete || record.cleanupEvidenceDigest !== null
        : !cleanupEvidenceFieldsValid || !isDigest(record.cleanupEvidenceDigest)
    )
  ) hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
  const state = record.state as TaskAttemptCustodyBackendMountTransferReceipt['state'];
  const backendExecutionId = record.backendExecutionId as string | null;
  const backendImageDigest = record.backendImageDigest as Sha256Digest | null;
  const backendAuthorityLabelDigest = record.backendAuthorityLabelDigest as Sha256Digest | null;
  const taskSnapshotMountEvidenceDigest = record.taskSnapshotMountEvidenceDigest as Sha256Digest | null;
  const workerOutputMountEvidenceDigest = record.workerOutputMountEvidenceDigest as Sha256Digest | null;
  const backendBootstrapProbeEvidenceDigest = record.backendBootstrapProbeEvidenceDigest as Sha256Digest | null;
  const daemonMountReceiptDigest = record.daemonMountReceiptDigest as Sha256Digest | null;
  const cleanupEvidenceDigest = record.cleanupEvidenceDigest as Sha256Digest | null;
  const evidenceBody = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-mount-transfer' as const,
    state,
    rootId: record.rootId,
    scopeDigest: record.scopeDigest,
    effectOpDigest: record.effectOpDigest,
    attemptId: record.attemptId,
    generation: record.generation,
    backend: 'docker' as const,
    backendExecutionId,
    backendImageDigest,
    backendAuthorityLabelDigest,
    taskSnapshotMountEvidenceDigest,
    workerOutputMountEvidenceDigest,
    backendBootstrapProbeEvidenceDigest,
    daemonMountReceiptDigest,
    cleanupEvidenceDigest,
  };
  const transferEvidenceDigest = taskAttemptCustodyDigest(
    'mount-transfer-evidence',
    evidenceBody,
    TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS,
  );
  const body = {
    ...evidenceBody,
    transferEvidenceDigest,
  };
  return freezeObject({
    ...body,
    receiptDigest: taskAttemptCustodyDigest(
      'mount-transfer-receipt',
      body,
      TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS,
    ),
  });
}

export function createTaskAttemptCustodyAdapterAppendResult(
  input: Omit<
    TaskAttemptCustodyAdapterAppendResult,
    'schemaVersion' | 'kind' | 'receiptDigest'
  >,
): TaskAttemptCustodyAdapterAppendResult {
  const record = requireExactDataRecord(input, [
    'state',
    'byteLength',
    'effectOpDigest',
    'scopeDigest',
    'generation',
    'evidenceDigest',
  ], 'APPEND_FAILED', 'seal-stream');
  if (
    record.state !== 'APPENDED'
    || !assertNonnegativeSafeInteger(record.byteLength)
    || !isDigest(record.effectOpDigest)
    || !isDigest(record.scopeDigest)
    || !assertPositiveSafeInteger(record.generation)
    || !isDigest(record.evidenceDigest)
  ) hold('APPEND_FAILED', 'seal-stream');
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-publication-append' as const,
    state: 'APPENDED' as const,
    byteLength: record.byteLength,
    effectOpDigest: record.effectOpDigest,
    scopeDigest: record.scopeDigest,
    generation: record.generation,
    evidenceDigest: record.evidenceDigest,
  };
  return freezeObject({
    ...body,
    receiptDigest: taskAttemptCustodyDigest(
      'publication-append-receipt',
      body,
      TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS,
    ),
  });
}

export function createTaskAttemptCustodyAdapterAbortResult(
  input: Omit<
    TaskAttemptCustodyAdapterAbortResult,
    'schemaVersion' | 'kind' | 'receiptDigest'
  >,
): TaskAttemptCustodyAdapterAbortResult {
  const record = requireExactDataRecord(input, [
    'state',
    'effectOpDigest',
    'scopeDigest',
    'generation',
    'evidenceDigest',
  ], 'CLEANUP_UNCONFIRMED', 'seal-stream');
  if (
    (record.state !== 'ABORTED' && record.state !== 'CLEANUP_UNCONFIRMED')
    || !isDigest(record.effectOpDigest)
    || !isDigest(record.scopeDigest)
    || !assertPositiveSafeInteger(record.generation)
    || !isDigest(record.evidenceDigest)
  ) hold('CLEANUP_UNCONFIRMED', 'seal-stream');
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-publication-abort' as const,
    state: record.state as TaskAttemptCustodyAdapterAbortResult['state'],
    effectOpDigest: record.effectOpDigest,
    scopeDigest: record.scopeDigest,
    generation: record.generation,
    evidenceDigest: record.evidenceDigest,
  };
  return freezeObject({
    ...body,
    receiptDigest: taskAttemptCustodyDigest(
      'publication-abort-receipt',
      body,
      TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS,
    ),
  });
}

function isProjectId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && utf8Length(value) <= 512;
}

function canonicalProjectRootSha256(canonicalProjectRoot: string): string {
  if (
    canonicalProjectRoot.length === 0
    || utf8Length(canonicalProjectRoot) > 32 * 1024
    || canonicalProjectRoot.includes('\0')
  ) hold('INVALID_IDENTITY', 'open-root');
  return createHash('sha256').update(canonicalProjectRoot, 'utf8').digest('hex');
}

function snapshotIdentity(value: unknown): TaskAttemptCustodyIdentityV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'backend',
    'projectRootSha256',
    'projectId',
    'taskId',
    'attemptId',
    'generation',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.backend !== 'docker'
    || typeof record.projectRootSha256 !== 'string'
    || !matchesPattern(SHA256_HEX_PATTERN, record.projectRootSha256)
    || !isProjectId(record.projectId)
    || typeof record.taskId !== 'string'
    || record.taskId.length === 0
    || utf8Length(record.taskId) > 512
    || typeof record.attemptId !== 'string'
    || !matchesPattern(UUID_PATTERN, record.attemptId)
    || !assertPositiveSafeInteger(record.generation)
    || record.generation > TASK_ATTEMPT_CUSTODY_MAX_LINEAGE_DEPTH
  ) return null;
  return freezeObject({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    backend: 'docker',
    projectRootSha256: record.projectRootSha256,
    projectId: record.projectId,
    taskId: record.taskId,
    attemptId: record.attemptId,
    generation: record.generation,
  });
}

function assertIdentity(identity: TaskAttemptCustodyIdentityV2): void {
  if (snapshotIdentity(identity) === null) hold('INVALID_IDENTITY', 'admit');
}

function isExactPredecessorIdentity(
  current: TaskAttemptCustodyIdentityV2,
  predecessor: TaskAttemptCustodyIdentityV2,
): boolean {
  return predecessor.schemaVersion === current.schemaVersion
    && predecessor.backend === current.backend
    && predecessor.projectRootSha256 === current.projectRootSha256
    && predecessor.projectId === current.projectId
    && predecessor.taskId === current.taskId
    && predecessor.attemptId === current.attemptId
    && predecessor.generation === current.generation - 1;
}

function sameIdentity(
  left: TaskAttemptCustodyIdentityV2,
  right: TaskAttemptCustodyIdentityV2,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.generation === right.generation;
}

function sameExecutionEffectIdentity(
  left: Readonly<{ projectId: string; taskId: string; attemptId: string; generation: number }>,
  right: TaskAttemptCustodyIdentityV2,
): boolean {
  return left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.generation === right.generation;
}

function pathHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Validate a cross-platform custody-relative path. Absolute paths and platform aliases fail. */
export function taskAttemptCustodyRelativePath(
  value: string,
): TaskAttemptCustodyRelativePath {
  if (
    value.length === 0
    || value.length > 1024
    || value.startsWith('/')
    || value.startsWith('\\')
    || matchesPattern(/^[A-Za-z]:/u, value)
    || value.includes('\\')
    || value.includes('\0')
  ) return hold('UNSAFE_RELATIVE_PATH', 'canonicalize');
  const components = value.split('/');
  if (intrinsicArraySome(components, component => (
    !matchesPattern(SAFE_COMPONENT_PATTERN, component)
    || component === '.'
    || component === '..'
    || component.endsWith('.')
    || component.endsWith(' ')
    || component.includes(':')
    || matchesPattern(WINDOWS_RESERVED_COMPONENT_PATTERN, component)
  ))) return hold('UNSAFE_RELATIVE_PATH', 'canonicalize');
  return value as TaskAttemptCustodyRelativePath;
}

function identityPrefix(identity: TaskAttemptCustodyIdentityV2): TaskAttemptCustodyRelativePath {
  assertIdentity(identity);
  return taskAttemptCustodyRelativePath([
    'v2',
    'projects',
    pathHash(identity.projectId),
    identity.projectRootSha256,
    'tasks',
    pathHash(identity.taskId),
    'attempts',
    identity.attemptId,
    'generations',
    String(identity.generation),
  ].join('/'));
}

function dispatchProjectPrefix(
  projectId: string,
  projectRootSha256: string,
): TaskAttemptCustodyRelativePath {
  if (
    !isProjectId(projectId)
    || !matchesPattern(SHA256_HEX_PATTERN, projectRootSha256)
  ) hold('DISPATCH_REQUEST_INVALID', 'reserve-dispatch');
  return taskAttemptCustodyRelativePath([
    'v2',
    'projects',
    pathHash(projectId),
    projectRootSha256,
    'dispatch-requests',
  ].join('/'));
}

function dispatchRequestPrefix(
  projectId: string,
  projectRootSha256: string,
  dispatchRequestId: string,
): TaskAttemptCustodyRelativePath {
  return childPath(
    dispatchProjectPrefix(projectId, projectRootSha256),
    pathHash(dispatchRequestId),
  );
}

function dispatchMaterialPath(
  projectId: string,
  projectRootSha256: string,
  dispatchRequestId: string,
): TaskAttemptCustodyRelativePath {
  return childPath(
    dispatchRequestPrefix(projectId, projectRootSha256, dispatchRequestId),
    'request-material.json',
  );
}

function dispatchReservationPath(
  projectId: string,
  projectRootSha256: string,
  dispatchRequestId: string,
): TaskAttemptCustodyRelativePath {
  return childPath(
    dispatchRequestPrefix(projectId, projectRootSha256, dispatchRequestId),
    'reservation.json',
  );
}

function dispatchPendingTaskSnapshotPath(
  projectId: string,
  projectRootSha256: string,
  dispatchRequestId: string,
): TaskAttemptCustodyRelativePath {
  return childPath(
    dispatchRequestPrefix(projectId, projectRootSha256, dispatchRequestId),
    'task-snapshot-pending.json',
  );
}

function dispatchReservationTransitionPath(
  projectId: string,
  projectRootSha256: string,
  dispatchRequestId: string,
): TaskAttemptCustodyRelativePath {
  return childPath(
    dispatchRequestPrefix(projectId, projectRootSha256, dispatchRequestId),
    'reservation-transition.json',
  );
}

function dispatchHistoricalAdmissionQuarantinePath(
  projectId: string,
  projectRootSha256: string,
  dispatchRequestId: string,
): TaskAttemptCustodyRelativePath {
  return childPath(
    dispatchRequestPrefix(projectId, projectRootSha256, dispatchRequestId),
    'historical-admission-quarantine.json',
  );
}

function dispatchGenerationSlotPath(
  predecessor: TaskAttemptCustodyIdentityV2,
): TaskAttemptCustodyRelativePath {
  return childPath(
    identityPrefix(predecessor),
    'dispatch',
    `generation-${predecessor.generation + 1}.json`,
  );
}

function dispatchAuthorityDirectory(
  identity: TaskAttemptCustodyIdentityV2,
): TaskAttemptCustodyRelativePath {
  return childPath(identityPrefix(identity), 'dispatch');
}

function dispatchTerminalPath(
  identity: TaskAttemptCustodyIdentityV2,
): TaskAttemptCustodyRelativePath {
  return childPath(dispatchAuthorityDirectory(identity), 'terminal.json');
}

function dispatchReconciliationPath(
  identity: TaskAttemptCustodyIdentityV2,
): TaskAttemptCustodyRelativePath {
  return childPath(dispatchAuthorityDirectory(identity), 'reconciliation.json');
}

function physicalTransitionPath(
  identity: TaskAttemptCustodyIdentityV2,
): TaskAttemptCustodyRelativePath {
  return childPath(dispatchAuthorityDirectory(identity), 'physical-transition.json');
}

function dispatchObservationDirectory(
  identity: TaskAttemptCustodyIdentityV2,
  observationClass: TaskAttemptCustodyDispatchObservationClass,
): TaskAttemptCustodyRelativePath {
  const child = TASK_ATTEMPT_CUSTODY_DISPATCH_OBSERVATION_PATH_SEGMENTS[observationClass];
  return childPath(dispatchAuthorityDirectory(identity), 'observations', child);
}

function dispatchObservationBytesPath(
  identity: TaskAttemptCustodyIdentityV2,
  observationClass: TaskAttemptCustodyDispatchObservationClass,
): TaskAttemptCustodyRelativePath {
  return childPath(dispatchObservationDirectory(identity, observationClass), 'observation.bin');
}

function dispatchObservationClaimPath(
  identity: TaskAttemptCustodyIdentityV2,
  observationClass: TaskAttemptCustodyDispatchObservationClass,
): TaskAttemptCustodyRelativePath {
  return childPath(dispatchObservationDirectory(identity, observationClass), 'claim.json');
}

function dispatchObservationReceiptPath(
  identity: TaskAttemptCustodyIdentityV2,
  observationClass: TaskAttemptCustodyDispatchObservationClass,
): TaskAttemptCustodyRelativePath {
  return childPath(dispatchObservationDirectory(identity, observationClass), 'receipt.json');
}

function childPath(
  parent: TaskAttemptCustodyRelativePath,
  ...children: readonly string[]
): TaskAttemptCustodyRelativePath {
  return taskAttemptCustodyRelativePath([parent, ...children].join('/'));
}

function cloneIdentity(identity: TaskAttemptCustodyIdentityV2): TaskAttemptCustodyIdentityV2 {
  const snapshot = snapshotIdentity(identity);
  if (snapshot === null) hold('INVALID_IDENTITY', 'admit');
  return snapshot;
}

function cloneProof(proof: TaskAttemptCustodyFileProof): TaskAttemptCustodyFileProof {
  return Object.freeze({ ...proof });
}

function sameProof(
  left: TaskAttemptCustodyFileProof,
  right: TaskAttemptCustodyFileProof,
): boolean {
  return left.relativePath === right.relativePath
    && left.sha256 === right.sha256
    && left.byteLength === right.byteLength
    && left.volumeId === right.volumeId
    && left.fileId === right.fileId
    && left.linkCount === right.linkCount
    && left.privacyEvidenceDigest === right.privacyEvidenceDigest
    && left.durabilityEvidenceDigest === right.durabilityEvidenceDigest;
}

function sameDirectoryProof(
  left: TaskAttemptCustodyDirectoryProof,
  right: TaskAttemptCustodyDirectoryProof,
): boolean {
  return left.relativePath === right.relativePath
    && left.volumeId === right.volumeId
    && left.directoryId === right.directoryId
    && left.privacyEvidenceDigest === right.privacyEvidenceDigest
    && left.durabilityEvidenceDigest === right.durabilityEvidenceDigest;
}

function snapshotRootProof(
  proof: unknown,
  adapter: TaskAttemptCustodyAdapter,
  expectedProjectId: string,
  expectedCanonicalProjectRootSha256: string,
): TaskAttemptCustodyRootProof {
  const record = snapshotExactDataRecord(proof, [
    'platform',
    'projectId',
    'canonicalProjectRootSha256',
    'rootId',
    'volumeId',
    'directoryId',
    'capabilityEvidenceDigest',
  ]);
  if (
    record === null
    || (record.platform !== 'posix' && record.platform !== 'win32')
    || record.platform !== adapter.platform
    || record.projectId !== expectedProjectId
    || record.canonicalProjectRootSha256 !== expectedCanonicalProjectRootSha256
    || !isDigest(record.rootId)
    || !isDigest(record.capabilityEvidenceDigest)
    || typeof record.volumeId !== 'string'
    || record.volumeId.length === 0
    || typeof record.directoryId !== 'string'
    || record.directoryId.length === 0
  ) hold('CAPABILITY_UNVERIFIED', 'open-root');
  return Object.freeze({
    platform: record.platform,
    projectId: record.projectId,
    canonicalProjectRootSha256: record.canonicalProjectRootSha256,
    rootId: record.rootId,
    volumeId: record.volumeId,
    directoryId: record.directoryId,
    capabilityEvidenceDigest: record.capabilityEvidenceDigest,
  });
}

function assertFileProof(
  proof: unknown,
  expectedPath: TaskAttemptCustodyRelativePath,
  expectedBytes: Uint8Array,
  root: TaskAttemptCustodyRootProof,
  policy: TaskAttemptCustodyArtifactLimit,
): TaskAttemptCustodyFileProof {
  const parsed = parseFileProof(proof);
  if (
    parsed === null
    || parsed.relativePath !== expectedPath
    || parsed.sha256 !== rawSha256(expectedBytes)
    || parsed.byteLength !== expectedBytes.byteLength
    || parsed.volumeId !== root.volumeId
    || parsed.byteLength < policy.minBytes
    || parsed.byteLength > policy.maxBytes
  ) hold('CAPABILITY_UNVERIFIED', 'publish');
  return parsed;
}

function assertDirectoryProof(
  proof: unknown,
  expectedPath: TaskAttemptCustodyRelativePath,
  root: TaskAttemptCustodyRootProof,
): TaskAttemptCustodyDirectoryProof {
  const parsed = parseDirectoryProof(proof);
  if (
    parsed === null
    || parsed.relativePath !== expectedPath
    || parsed.volumeId !== root.volumeId
  ) hold('CAPABILITY_UNVERIFIED', 'create-directory');
  return parsed;
}

function parseDirectoryProof(value: unknown): TaskAttemptCustodyDirectoryProof | null {
  const record = snapshotExactDataRecord(value, [
    'relativePath',
    'volumeId',
    'directoryId',
    'privacyEvidenceDigest',
    'durabilityEvidenceDigest',
  ]);
  if (record === null) return null;
  if (
    typeof record.relativePath !== 'string'
    || typeof record.volumeId !== 'string'
    || record.volumeId.length === 0
    || typeof record.directoryId !== 'string'
    || record.directoryId.length === 0
    || !isDigest(record.privacyEvidenceDigest)
    || !isDigest(record.durabilityEvidenceDigest)
  ) return null;
  let relativePath: TaskAttemptCustodyRelativePath;
  try { relativePath = taskAttemptCustodyRelativePath(record.relativePath); } catch { return null; }
  return Object.freeze({
    relativePath,
    volumeId: record.volumeId,
    directoryId: record.directoryId,
    privacyEvidenceDigest: record.privacyEvidenceDigest,
    durabilityEvidenceDigest: record.durabilityEvidenceDigest,
  });
}

function assertPathCapability(
  capability: TaskAttemptCustodyPathCapability,
  root: TaskAttemptCustodyRootProof,
  access: TaskAttemptCustodyPathCapabilityAccess,
  scopeDigest: Sha256Digest,
): void {
  const record = snapshotExactDataRecord(capability, [
    'kind',
    'access',
    'rootId',
    'scopeDigest',
    'capabilityEvidenceDigest',
  ]);
  if (
    record === null
    || record.kind !== 'task-attempt-custody-path-capability'
    || record.access !== access
    || record.rootId !== root.rootId
    || record.scopeDigest !== scopeDigest
    || !isDigest(record.capabilityEvidenceDigest)
    || !Object.isFrozen(capability)
  ) hold('CAPABILITY_UNVERIFIED', 'probe');
}

function validatedLimit(limit: unknown): Readonly<TaskAttemptCustodyArtifactLimit> {
  const record = snapshotExactDataRecord(
    limit,
    ['minBytes', 'maxBytes', 'requireSingleLink'],
  );
  if (
    record === null
    || !assertNonnegativeSafeInteger(record.minBytes)
    || !assertPositiveSafeInteger(record.maxBytes)
    || record.minBytes > record.maxBytes
    || record.maxBytes > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
    || record.requireSingleLink !== true
  ) hold('INVALID_POLICY', 'canonicalize');
  return Object.freeze({
    minBytes: record.minBytes,
    maxBytes: record.maxBytes,
    requireSingleLink: true,
  });
}

function policyBody(input: unknown): TaskAttemptCustodyPolicyInputV2 {
  const record = snapshotExactDataRecord(input, [
    'schemaVersion',
    'metadataMaxBytes',
    'jsonBounds',
    'artifactLimits',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || !assertPositiveSafeInteger(record.metadataMaxBytes)
    || record.metadataMaxBytes < 2
    || record.metadataMaxBytes > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
  ) hold('INVALID_POLICY', 'canonicalize');
  const jsonBounds = validatedJsonBounds(record.jsonBounds);
  const limitContainer = snapshotExactDataRecord(
    record.artifactLimits,
    TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASS_AUTHORITY,
  );
  if (limitContainer === null) hold('INVALID_POLICY', 'canonicalize');
  const artifactLimits = Object.fromEntries(
    intrinsicArrayMap(TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASS_AUTHORITY, artifactClass => [
      artifactClass,
      validatedLimit(limitContainer[artifactClass]),
    ]),
  ) as Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>;
  return Object.freeze({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    metadataMaxBytes: record.metadataMaxBytes,
    jsonBounds,
    artifactLimits: Object.freeze(artifactLimits),
  });
}

export function createTaskAttemptCustodyPolicy(
  input: TaskAttemptCustodyPolicyInputV2,
): TaskAttemptCustodyPolicyV2 {
  const body = policyBody(input);
  const policyDigest = digestCanonical(
    'deckent.task-attempt-custody.policy.v2',
    body,
    body.jsonBounds,
  );
  return Object.freeze({
    ...body,
    jsonBounds: Object.freeze({ ...body.jsonBounds }),
    artifactLimits: Object.freeze(Object.fromEntries(
      intrinsicArrayMap(TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASS_AUTHORITY, artifactClass => [
        artifactClass,
        Object.freeze({ ...body.artifactLimits[artifactClass] }),
      ]),
    )) as Readonly<Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>>,
    policyDigest,
  });
}

function snapshotPolicy(policy: unknown): TaskAttemptCustodyPolicyV2 {
  const record = snapshotExactDataRecord(policy, [
    'schemaVersion',
    'metadataMaxBytes',
    'jsonBounds',
    'artifactLimits',
    'policyDigest',
  ]);
  if (
    record === null
    || !isDigest(record.policyDigest)
  ) hold('INVALID_POLICY', 'canonicalize');
  const expected = createTaskAttemptCustodyPolicy({
    schemaVersion: record.schemaVersion as typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    metadataMaxBytes: record.metadataMaxBytes as number,
    jsonBounds: record.jsonBounds as CanonicalJsonBounds,
    artifactLimits: record.artifactLimits as Readonly<
      Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>
    >,
  });
  if (expected.policyDigest !== record.policyDigest) {
    hold('INVALID_POLICY', 'canonicalize');
  }
  return expected;
}

function assertPolicy(policy: TaskAttemptCustodyPolicyV2): void {
  snapshotPolicy(policy);
}

function metadataLimit(policy: TaskAttemptCustodyPolicyV2): TaskAttemptCustodyArtifactLimit {
  return Object.freeze({ minBytes: 2, maxBytes: policy.metadataMaxBytes, requireSingleLink: true });
}

function assertBytesWithinLimit(bytes: Uint8Array, limit: TaskAttemptCustodyArtifactLimit): void {
  if (bytes.byteLength < limit.minBytes || bytes.byteLength > limit.maxBytes) {
    hold('ARTIFACT_OVERSIZE', 'publish');
  }
}

function snapshotAuthorityBytes(
  value: unknown,
  code: TaskAttemptCustodyHoldCode,
  operation: TaskAttemptCustodyOperation,
): Uint8Array {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || isUntrustedProxy(value)
    ) hold(code, operation);
    const prototype = intrinsicObjectGetPrototypeOf(value);
    if (prototype !== intrinsicUint8ArrayPrototype && prototype !== intrinsicBufferPrototype) {
      hold(code, operation);
    }
    if (intrinsicObjectGetOwnPropertySymbols(value).length !== 0) {
      hold(code, operation);
    }
    for (const property of ['buffer', 'byteLength', 'byteOffset', 'length', 'constructor']) {
      if (intrinsicObjectGetOwnPropertyDescriptor(value, property) !== undefined) {
        hold(code, operation);
      }
    }
    const backingBuffer = intrinsicReflectApply(
      intrinsicTypedArrayBufferGetter as () => unknown,
      value,
      [],
    );
    const byteLength = intrinsicReflectApply(
      intrinsicTypedArrayByteLengthGetter as () => unknown,
      value,
      [],
    );
    if (
      intrinsicIsSharedArrayBuffer(backingBuffer)
      || typeof byteLength !== 'number'
      || !Number.isSafeInteger(byteLength)
      || byteLength < 0
      || byteLength > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
    ) hold(code, operation);
    const snapshot = new IntrinsicUint8Array(byteLength);
    intrinsicReflectApply(intrinsicTypedArraySet, snapshot, [value]);
    return snapshot;
  } catch {
    hold(code, operation);
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function parseFileProof(value: unknown): TaskAttemptCustodyFileProof | null {
  const record = snapshotExactDataRecord(value, [
    'relativePath',
    'sha256',
    'byteLength',
    'volumeId',
    'fileId',
    'linkCount',
    'privacyEvidenceDigest',
    'durabilityEvidenceDigest',
  ]);
  if (record === null) return null;
  if (
    typeof record.relativePath !== 'string'
    || !isDigest(record.sha256)
    || !assertNonnegativeSafeInteger(record.byteLength)
    || typeof record.volumeId !== 'string'
    || record.volumeId.length === 0
    || typeof record.fileId !== 'string'
    || record.fileId.length === 0
    || record.linkCount !== 1
    || !isDigest(record.privacyEvidenceDigest)
    || !isDigest(record.durabilityEvidenceDigest)
  ) return null;
  let relativePath: TaskAttemptCustodyRelativePath;
  try { relativePath = taskAttemptCustodyRelativePath(record.relativePath); } catch { return null; }
  return Object.freeze({
    relativePath,
    sha256: record.sha256,
    byteLength: record.byteLength,
    volumeId: record.volumeId,
    fileId: record.fileId,
    linkCount: 1,
    privacyEvidenceDigest: record.privacyEvidenceDigest,
    durabilityEvidenceDigest: record.durabilityEvidenceDigest,
  });
}

function snapshotAdapterPublication(
  value: unknown,
  operation: TaskAttemptCustodyOperation,
): TaskAttemptCustodyPublication {
  const record = snapshotExactDataRecord(value, ['state', 'proof']);
  const proof = record === null ? null : parseFileProof(record.proof);
  if (
    record === null
    || proof === null
    || (record.state !== 'CREATED' && record.state !== 'EXISTING_IDENTICAL')
  ) hold('CAPABILITY_UNVERIFIED', operation);
  return Object.freeze({ state: record.state, proof });
}

function snapshotAdapterRead(
  value: unknown,
  expectedPath: TaskAttemptCustodyRelativePath,
  root: TaskAttemptCustodyRootProof,
  policy: TaskAttemptCustodyArtifactLimit,
  operation: TaskAttemptCustodyOperation,
): TaskAttemptCustodyRead {
  const record = snapshotExactDataRecord(value, ['bytes', 'proof']);
  if (record === null) hold('CAPABILITY_UNVERIFIED', operation);
  const bytes = snapshotAuthorityBytes(record.bytes, 'CAPABILITY_UNVERIFIED', operation);
  const proof = assertFileProof(record.proof, expectedPath, bytes, root, policy);
  return Object.freeze({ bytes, proof });
}

function parseIdentity(value: unknown): TaskAttemptCustodyIdentityV2 | null {
  if (!isPlainRecord(value)) return null;
  try {
    const identity = value as unknown as TaskAttemptCustodyIdentityV2;
    assertIdentity(identity);
    return cloneIdentity(identity);
  } catch {
    return null;
  }
}

/** Canonical identity parser shared by every V2 surface; no surface may restate weaker bounds. */
export function parseTaskAttemptCustodyIdentityV2(
  value: unknown,
): TaskAttemptCustodyIdentityV2 | null {
  return parseIdentity(value);
}

function admissionDigest(
  admission: Omit<TaskAttemptCustodyAdmissionV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return digestCanonical('deckent.task-attempt-custody.admission.v2', admission, bounds);
}

function artifactReceiptDigest(
  receipt: Omit<TaskAttemptCustodyArtifactReceiptV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return digestCanonical('deckent.task-attempt-custody.artifact-receipt.v2', receipt, bounds);
}

function workerIpcAnswerArtifactKey(sequence: number): string {
  if (!assertPositiveSafeInteger(sequence)) hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
  return `ipc-answer-${sequence}`;
}

function workerIpcAnswerDestinationChild(
  identity: TaskAttemptCustodyIdentityV2,
): TaskAttemptCustodyRelativePath {
  return taskAttemptCustodyRelativePath(`task-${identity.taskId}.answer`);
}

function workerIpcAnswerDestinationProofDigest(
  receipt: Pick<
    TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2,
    | 'identity'
    | 'admissionReceiptDigest'
    | 'policyDigest'
    | 'sequence'
    | 'artifactKey'
    | 'authorityArtifactReceiptDigest'
    | 'authorityArtifactSha256'
    | 'deliverySha256'
    | 'destinationChildRelativePath'
    | 'destination'
  >,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return digestCanonical(
    'deckent.task-attempt-custody.worker-ipc-answer-destination-proof.v2',
    receipt,
    bounds,
  );
}

function workerIpcAnswerDeliveryReceiptDigest(
  receipt: Omit<TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return digestCanonical(
    'deckent.task-attempt-custody.worker-ipc-answer-delivery-receipt.v2',
    receipt,
    bounds,
  );
}

function workerIpcQuestionArtifactKey(sequence: number): string {
  if (!assertPositiveSafeInteger(sequence)) hold('ARTIFACT_REPLAY_MISMATCH', 'capture');
  return `ipc-question-${sequence}`;
}

function workerIpcQuestionSealedChild(
  dispatchRequestId: string,
  sequence: number,
): TaskAttemptCustodyRelativePath {
  if (!isDispatchRequestId(dispatchRequestId)
    || !assertPositiveSafeInteger(sequence)
    || sequence > TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS) {
    hold('DISPATCH_REQUEST_INVALID', 'capture');
  }
  return taskAttemptCustodyRelativePath(
    `sealed-output-v1/${dispatchRequestId}/ipc/question-${String(sequence).padStart(6, '0')}.bin`,
  );
}

function workerIpcSealedQuestionSourceReceiptDigest(
  value: Omit<TaskAttemptCustodyWorkerIpcSealedQuestionSourceV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('worker-ipc-sealed-question-source', value, bounds);
}

function workerIpcCursorPath(
  identity: TaskAttemptCustodyIdentityV2,
  sequence: number,
  state: 'question-open' | 'answered',
): TaskAttemptCustodyRelativePath {
  if (!assertPositiveSafeInteger(sequence)
    || sequence > TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS) {
    hold('ARTIFACT_REPLAY_MISMATCH', 'read');
  }
  return childPath(
    identityPrefix(identity),
    'ipc-conversation',
    `${String(sequence).padStart(6, '0')}.${state}.json`,
  );
}

function workerIpcCursorDirectory(
  identity: TaskAttemptCustodyIdentityV2,
): TaskAttemptCustodyRelativePath {
  return childPath(identityPrefix(identity), 'ipc-conversation');
}

type PersistedWorkerIpcCursor = Exclude<
  TaskAttemptCustodyWorkerIpcConversationCursorV2,
  { readonly state: 'empty' }
>;

function workerIpcCursorReceiptDigest(
  value: Omit<PersistedWorkerIpcCursor, 'cursorReceiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('worker-ipc-conversation-cursor', value, bounds);
}

function chainReceiptDigest(
  receipt: Omit<TaskAttemptCustodyChainReceiptV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return digestCanonical('deckent.task-attempt-custody.chain-receipt.v2', receipt, bounds);
}

function effectLandingArtifactRef(
  value: unknown,
): TaskAttemptCustodyEffectArtifactRefV2 | null {
  const record = snapshotExactDataRecord(value, [
    'artifactKey',
    'artifactReceiptDigest',
  ]);
  if (
    record === null
    || typeof record.artifactKey !== 'string'
    || !isSafeArtifactKey(record.artifactKey)
    || !isDigest(record.artifactReceiptDigest)
  ) return null;
  return Object.freeze({
    artifactKey: record.artifactKey,
    artifactReceiptDigest: record.artifactReceiptDigest,
  });
}

function effectLandingReceiptBody(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): Omit<TaskAttemptCustodyEffectLandingReceiptV2, 'receiptDigest'> | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'disposition',
    'identity',
    'admissionReceiptDigest',
    'policyDigest',
    'workspaceSnapshot',
    'baselineManifest',
    'finalManifest',
    'stagedContents',
    'landingJournal',
    'workspaceRelease',
    'effectDecisionDigest',
    'transactionDigest',
    'committedAt',
    'releasedAt',
  ]);
  if (record === null) return null;
  const identity = parseIdentity(record.identity);
  const workspaceSnapshot = effectLandingArtifactRef(record.workspaceSnapshot);
  const baselineManifest = effectLandingArtifactRef(record.baselineManifest);
  const finalManifest = effectLandingArtifactRef(record.finalManifest);
  const landingJournal = effectLandingArtifactRef(record.landingJournal);
  const workspaceRelease = effectLandingArtifactRef(record.workspaceRelease);
  if (
    !identity
    || !workspaceSnapshot
    || !baselineManifest
    || !finalManifest
    || !landingJournal
    || !workspaceRelease
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-effect-landing'
    || record.state !== 'committed'
    || (record.disposition !== 'COMMITTED' && record.disposition !== 'COMMITTED_NO_CHANGE')
    || !isDigest(record.admissionReceiptDigest)
    || record.policyDigest !== policy.policyDigest
    || !isDigest(record.effectDecisionDigest)
    || !isDigest(record.transactionDigest)
    || !isTimestamp(record.committedAt)
    || !isTimestamp(record.releasedAt)
    || Date.parse(record.releasedAt as string) < Date.parse(record.committedAt as string)
    || !intrinsicReflectApply(intrinsicArrayIsArray, Array, [record.stagedContents])
    || isUntrustedProxy(record.stagedContents)
  ) return null;
  const stagedValues = record.stagedContents as unknown[];
  if (stagedValues.length > policy.jsonBounds.maxArrayLength) return null;
  const stagedContents = intrinsicArrayMap(stagedValues, effectLandingArtifactRef);
  if (intrinsicArraySome(stagedContents, reference => reference === null)) return null;
  const exactStagedContents = stagedContents as TaskAttemptCustodyEffectArtifactRefV2[];
  const references = [
    workspaceSnapshot,
    baselineManifest,
    finalManifest,
    ...exactStagedContents,
    landingJournal,
    workspaceRelease,
  ];
  const referenceKeys = new Set<string>();
  for (const reference of references) {
    const key = `${reference.artifactKey}:${reference.artifactReceiptDigest}`;
    if (referenceKeys.has(key)) return null;
    referenceKeys.add(key);
  }
  if (baselineManifest.artifactKey === finalManifest.artifactKey) return null;
  return Object.freeze({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-effect-landing',
    state: 'committed',
    disposition: record.disposition,
    identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
    policyDigest: policy.policyDigest,
    workspaceSnapshot,
    baselineManifest,
    finalManifest,
    stagedContents: Object.freeze(exactStagedContents),
    landingJournal,
    workspaceRelease,
    effectDecisionDigest: record.effectDecisionDigest,
    transactionDigest: record.transactionDigest,
    committedAt: record.committedAt,
    releasedAt: record.releasedAt,
  });
}

function effectLandingReceiptDigest(
  receipt: Omit<TaskAttemptCustodyEffectLandingReceiptV2, 'receiptDigest'>,
  bounds: CanonicalJsonBounds,
): Sha256Digest {
  return digestCanonical(
    'deckent.task-attempt-custody.effect-landing-receipt.v2',
    receipt,
    bounds,
  );
}

export function createTaskAttemptCustodyEffectLandingReceiptV2(
  input: CreateTaskAttemptCustodyEffectLandingReceiptInputV2,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyEffectLandingReceiptV2 {
  assertPolicy(policy);
  const body = effectLandingReceiptBody({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-effect-landing',
    state: 'committed',
    ...input,
  }, policy);
  if (body === null) hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
  return Object.freeze({
    ...body,
    receiptDigest: effectLandingReceiptDigest(body, policy.jsonBounds),
  });
}

export function parseTaskAttemptCustodyEffectLandingReceiptV2(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyEffectLandingReceiptV2 | null {
  assertPolicy(policy);
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'disposition',
    'identity',
    'admissionReceiptDigest',
    'policyDigest',
    'workspaceSnapshot',
    'baselineManifest',
    'finalManifest',
    'stagedContents',
    'landingJournal',
    'workspaceRelease',
    'effectDecisionDigest',
    'transactionDigest',
    'committedAt',
    'releasedAt',
    'receiptDigest',
  ]);
  if (record === null || !isDigest(record.receiptDigest)) return null;
  const body = effectLandingReceiptBody({
    schemaVersion: record.schemaVersion,
    kind: record.kind,
    state: record.state,
    disposition: record.disposition,
    identity: record.identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
    policyDigest: record.policyDigest,
    workspaceSnapshot: record.workspaceSnapshot,
    baselineManifest: record.baselineManifest,
    finalManifest: record.finalManifest,
    stagedContents: record.stagedContents,
    landingJournal: record.landingJournal,
    workspaceRelease: record.workspaceRelease,
    effectDecisionDigest: record.effectDecisionDigest,
    transactionDigest: record.transactionDigest,
    committedAt: record.committedAt,
    releasedAt: record.releasedAt,
  }, policy);
  if (
    body === null
    || effectLandingReceiptDigest(body, policy.jsonBounds) !== record.receiptDigest
  ) return null;
  return Object.freeze({ ...body, receiptDigest: record.receiptDigest });
}

export function parseTaskAttemptCustodyAdmissionV2(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyAdmissionV2 | null {
  assertPolicy(policy);
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    'schemaVersion',
    'kind',
    'state',
    'identity',
    'admittedAt',
    'policyDigest',
    'predecessorDigest',
    'predecessorIdentity',
    'custodyPlatform',
    'custodyRootId',
    'custodyVolumeId',
    'custodyDirectoryId',
    'custodyCapabilityEvidenceDigest',
    'taskSnapshot',
    'workerOutputDirectory',
    'receiptDigest',
  ])) return null;
  const identity = parseIdentity(value.identity);
  const predecessorIdentity = value.predecessorIdentity === null
    ? null
    : parseIdentity(value.predecessorIdentity);
  const taskSnapshot = parseFileProof(value.taskSnapshot);
  const workerOutputDirectory = parseDirectoryProof(value.workerOutputDirectory);
  if (
    !identity
    || !taskSnapshot
    || !workerOutputDirectory
    || value.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || value.kind !== 'task-attempt-custody-admission'
    || value.state !== 'admitted'
    || !isTimestamp(value.admittedAt)
    || value.policyDigest !== policy.policyDigest
    || (value.predecessorDigest !== null && !isDigest(value.predecessorDigest))
    || (value.predecessorIdentity !== null && !predecessorIdentity)
    || (identity.generation === 1
      && (value.predecessorDigest !== null || predecessorIdentity !== null))
    || (identity.generation > 1
      && (
        value.predecessorDigest === null
        || predecessorIdentity === null
        || !isExactPredecessorIdentity(identity, predecessorIdentity)
      ))
    || (value.custodyPlatform !== 'posix' && value.custodyPlatform !== 'win32')
    || !isDigest(value.custodyRootId)
    || typeof value.custodyVolumeId !== 'string'
    || value.custodyVolumeId.length === 0
    || typeof value.custodyDirectoryId !== 'string'
    || value.custodyDirectoryId.length === 0
    || !isDigest(value.custodyCapabilityEvidenceDigest)
    || !isDigest(value.receiptDigest)
  ) return null;
  const withoutDigest: Omit<TaskAttemptCustodyAdmissionV2, 'receiptDigest'> = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-admission' as const,
    state: 'admitted' as const,
    identity,
    admittedAt: value.admittedAt,
    policyDigest: value.policyDigest,
    predecessorDigest: value.predecessorDigest,
    predecessorIdentity,
    custodyPlatform: value.custodyPlatform,
    custodyRootId: value.custodyRootId,
    custodyVolumeId: value.custodyVolumeId,
    custodyDirectoryId: value.custodyDirectoryId,
    custodyCapabilityEvidenceDigest: value.custodyCapabilityEvidenceDigest,
    taskSnapshot,
    workerOutputDirectory,
  };
  if (admissionDigest(withoutDigest, policy.jsonBounds) !== value.receiptDigest) return null;
  return Object.freeze({ ...withoutDigest, receiptDigest: value.receiptDigest });
}

export function parseTaskAttemptCustodyArtifactReceiptV2(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyArtifactReceiptV2 | null {
  assertPolicy(policy);
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    'schemaVersion',
    'kind',
    'identity',
    'admissionReceiptDigest',
    'artifactClass',
    'captureMode',
    'artifactKey',
    'capturedAt',
    'policyDigest',
    'artifact',
    'receiptDigest',
  ])) return null;
  const identity = parseIdentity(value.identity);
  const artifact = parseFileProof(value.artifact);
  const artifactClass = value.artifactClass;
  const captureMode = artifactCaptureModeForClass(artifactClass);
  if (
    !identity
    || !artifact
    || value.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || value.kind !== 'task-attempt-custody-artifact'
    || !isDigest(value.admissionReceiptDigest)
    || !isTaskAttemptCustodyArtifactClass(artifactClass)
    || captureMode === null
    || value.captureMode !== captureMode
    || typeof value.artifactKey !== 'string'
    || !isSafeArtifactKey(value.artifactKey)
    || !isTimestamp(value.capturedAt)
    || value.policyDigest !== policy.policyDigest
    || !isDigest(value.receiptDigest)
  ) return null;
  const withoutDigest = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-artifact' as const,
    identity,
    admissionReceiptDigest: value.admissionReceiptDigest,
    artifactClass,
    captureMode,
    artifactKey: value.artifactKey,
    capturedAt: value.capturedAt,
    policyDigest: value.policyDigest,
    artifact,
  };
  if (artifactReceiptDigest(withoutDigest, policy.jsonBounds) !== value.receiptDigest) return null;
  return Object.freeze({ ...withoutDigest, receiptDigest: value.receiptDigest });
}

export function parseTaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2 | null {
  assertPolicy(policy);
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'identity',
    'admissionReceiptDigest',
    'policyDigest',
    'sequence',
    'artifactKey',
    'authorityArtifactReceiptDigest',
    'authorityArtifactSha256',
    'deliverySha256',
    'destinationChildRelativePath',
    'destination',
    'destinationProofDigest',
    'deliveredAt',
    'receiptDigest',
  ]);
  if (record === null) return null;
  const identity = parseIdentity(record.identity);
  const destination = parseFileProof(record.destination);
  if (
    identity === null
    || destination === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-worker-ipc-answer-delivery'
    || record.state !== 'delivered'
    || !isDigest(record.admissionReceiptDigest)
    || record.policyDigest !== policy.policyDigest
    || !assertPositiveSafeInteger(record.sequence)
    || typeof record.artifactKey !== 'string'
    || record.artifactKey !== workerIpcAnswerArtifactKey(record.sequence)
    || !isDigest(record.authorityArtifactReceiptDigest)
    || !isDigest(record.authorityArtifactSha256)
    || !isDigest(record.deliverySha256)
    || typeof record.destinationChildRelativePath !== 'string'
    || !isDigest(record.destinationProofDigest)
    || !isTimestamp(record.deliveredAt)
    || !isDigest(record.receiptDigest)
  ) return null;
  let expectedChild: TaskAttemptCustodyRelativePath;
  let expectedDestination: TaskAttemptCustodyRelativePath;
  try {
    expectedChild = workerIpcAnswerDestinationChild(identity);
    expectedDestination = childPath(
      identityPrefix(identity),
      'worker-output',
      expectedChild,
    );
  } catch {
    return null;
  }
  const limit = policy.artifactLimits['worker-ipc-answer'];
  if (
    record.destinationChildRelativePath !== expectedChild
    || destination.relativePath !== expectedDestination
    || destination.sha256 !== record.deliverySha256
    || destination.byteLength < limit.minBytes
    || destination.byteLength > limit.maxBytes
  ) return null;
  const proofBody = {
    identity,
    admissionReceiptDigest: record.admissionReceiptDigest,
    policyDigest: record.policyDigest,
    sequence: record.sequence,
    artifactKey: record.artifactKey,
    authorityArtifactReceiptDigest: record.authorityArtifactReceiptDigest,
    authorityArtifactSha256: record.authorityArtifactSha256,
    deliverySha256: record.deliverySha256,
    destinationChildRelativePath: record.destinationChildRelativePath,
    destination,
  };
  if (
    workerIpcAnswerDestinationProofDigest(proofBody, policy.jsonBounds)
      !== record.destinationProofDigest
  ) return null;
  const withoutDigest: Omit<
    TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2,
    'receiptDigest'
  > = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-worker-ipc-answer-delivery',
    state: 'delivered',
    ...proofBody,
    destinationProofDigest: record.destinationProofDigest,
    deliveredAt: record.deliveredAt,
  };
  if (
    workerIpcAnswerDeliveryReceiptDigest(withoutDigest, policy.jsonBounds)
      !== record.receiptDigest
  ) return null;
  return Object.freeze({ ...withoutDigest, receiptDigest: record.receiptDigest });
}

export function createTaskAttemptCustodyWorkerIpcSealedQuestionSourceV2(
  input: Omit<TaskAttemptCustodyWorkerIpcSealedQuestionSourceV2, 'schemaVersion' | 'kind' | 'receiptDigest'>,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyWorkerIpcSealedQuestionSourceV2 {
  assertPolicy(policy);
  const identity = cloneIdentity(input.identity);
  const expectedPath = workerIpcQuestionSealedChild(input.dispatchRequestId, input.sequence);
  if (
    !isDigest(input.admissionReceiptDigest)
    || !isDigest(input.sourceFileIdentityDigest)
    || !assertPositiveSafeInteger(input.sourceEpoch)
    || input.sealedChildRelativePath !== expectedPath
    || !isDigest(input.contentSha256)
    || !Number.isSafeInteger(input.byteLength)
    || input.byteLength < policy.artifactLimits['worker-ipc-question'].minBytes
    || input.byteLength > policy.artifactLimits['worker-ipc-question'].maxBytes
    || !isTimestamp(input.capturedAt)
  ) hold('ARTIFACT_REPLAY_MISMATCH', 'capture');
  const withoutDigest = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-worker-ipc-sealed-question-source' as const,
    identity,
    admissionReceiptDigest: input.admissionReceiptDigest,
    dispatchRequestId: input.dispatchRequestId,
    sequence: input.sequence,
    sourceFileIdentityDigest: input.sourceFileIdentityDigest,
    sourceEpoch: input.sourceEpoch,
    sealedChildRelativePath: input.sealedChildRelativePath,
    contentSha256: input.contentSha256,
    byteLength: input.byteLength,
    capturedAt: input.capturedAt,
  };
  return freezeObject({
    ...withoutDigest,
    receiptDigest: workerIpcSealedQuestionSourceReceiptDigest(withoutDigest, policy.jsonBounds),
  });
}

export function parseTaskAttemptCustodyWorkerIpcSealedQuestionSourceV2(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyWorkerIpcSealedQuestionSourceV2 | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion', 'kind', 'identity', 'admissionReceiptDigest', 'dispatchRequestId',
    'sequence', 'sourceFileIdentityDigest', 'sourceEpoch', 'sealedChildRelativePath',
    'contentSha256', 'byteLength', 'capturedAt', 'receiptDigest',
  ]);
  if (record === null || !isDigest(record.receiptDigest)) return null;
  try {
    const created = createTaskAttemptCustodyWorkerIpcSealedQuestionSourceV2({
      identity: record.identity as TaskAttemptCustodyIdentityV2,
      admissionReceiptDigest: record.admissionReceiptDigest as Sha256Digest,
      dispatchRequestId: record.dispatchRequestId as string,
      sequence: record.sequence as number,
      sourceFileIdentityDigest: record.sourceFileIdentityDigest as Sha256Digest,
      sourceEpoch: record.sourceEpoch as number,
      sealedChildRelativePath: record.sealedChildRelativePath as string,
      contentSha256: record.contentSha256 as Sha256Digest,
      byteLength: record.byteLength as number,
      capturedAt: record.capturedAt as string,
    }, policy);
    return created.receiptDigest === record.receiptDigest ? created : null;
  } catch {
    return null;
  }
}

function parseWorkerIpcCursor(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): PersistedWorkerIpcCursor | null {
  if (!isPlainRecord(value) || value.state === 'empty') return null;
  const state = value.state;
  const keys = state === 'question-open'
    ? [
        'schemaVersion', 'kind', 'state', 'identity', 'admissionReceiptDigest', 'policyDigest',
        'dispatchRequestId', 'sequence', 'nextSequence', 'predecessorCursorReceiptDigest',
        'sealedSourceReceiptDigest', 'sourceFileIdentityDigest', 'sourceEpoch',
        'questionArtifactKey', 'questionReceiptDigest', 'questionArtifactSha256', 'recordedAt',
        'cursorReceiptDigest',
      ]
    : state === 'answered'
      ? [
          'schemaVersion', 'kind', 'state', 'identity', 'admissionReceiptDigest', 'policyDigest',
          'dispatchRequestId', 'sequence', 'nextSequence', 'predecessorCursorReceiptDigest',
          'questionCursorReceiptDigest', 'sealedSourceReceiptDigest', 'sourceFileIdentityDigest',
          'sourceEpoch', 'questionReceiptDigest', 'answerDeliveryReceiptDigest', 'answeredAt',
          'cursorReceiptDigest',
        ]
      : null;
  const record = keys === null ? null : snapshotExactDataRecord(value, keys);
  const identity = record === null ? null : parseIdentity(record.identity);
  if (
    record === null
    || identity === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-worker-ipc-conversation-cursor'
    || !isDigest(record.admissionReceiptDigest)
    || record.policyDigest !== policy.policyDigest
    || !isDispatchRequestId(record.dispatchRequestId)
    || !assertPositiveSafeInteger(record.sequence)
    || record.sequence > TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS
    || !isDigest(record.cursorReceiptDigest)
    || (record.predecessorCursorReceiptDigest !== null
      && !isDigest(record.predecessorCursorReceiptDigest))
  ) return null;
  if (state === 'question-open') {
    if (
      record.nextSequence !== null
      || !isDigest(record.sealedSourceReceiptDigest)
      || !isDigest(record.sourceFileIdentityDigest)
      || !assertPositiveSafeInteger(record.sourceEpoch)
      || record.questionArtifactKey !== workerIpcQuestionArtifactKey(record.sequence)
      || !isDigest(record.questionReceiptDigest)
      || !isDigest(record.questionArtifactSha256)
      || !isTimestamp(record.recordedAt)
    ) return null;
  } else if (
    record.nextSequence !== (
      record.sequence === TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS
        ? null
        : record.sequence + 1
    )
    || !isDigest(record.questionCursorReceiptDigest)
    || !isDigest(record.sealedSourceReceiptDigest)
    || !isDigest(record.sourceFileIdentityDigest)
    || !assertPositiveSafeInteger(record.sourceEpoch)
    || !isDigest(record.questionReceiptDigest)
    || !isDigest(record.answerDeliveryReceiptDigest)
    || !isTimestamp(record.answeredAt)
  ) return null;
  const withoutDigest = { ...record } as Record<string, unknown>;
  delete withoutDigest.cursorReceiptDigest;
  if (workerIpcCursorReceiptDigest(
    withoutDigest as Omit<PersistedWorkerIpcCursor, 'cursorReceiptDigest'>,
    policy.jsonBounds,
  ) !== record.cursorReceiptDigest) return null;
  return freezeObject(record as unknown as PersistedWorkerIpcCursor);
}

export function parseTaskAttemptCustodyChainReceiptV2(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): TaskAttemptCustodyChainReceiptV2 | null {
  assertPolicy(policy);
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    'schemaVersion',
    'kind',
    'identity',
    'admissionReceiptDigest',
    'stage',
    'occurredAt',
    'predecessorDigest',
    'artifactReceiptDigest',
    'artifactKey',
    'receiptDigest',
  ])) return null;
  const identity = parseIdentity(value.identity);
  if (
    !identity
    || value.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || value.kind !== 'task-attempt-custody-chain'
    || !isDigest(value.admissionReceiptDigest)
    || !TASK_ATTEMPT_CUSTODY_CHAIN_STAGES.includes(value.stage as TaskAttemptCustodyChainStage)
    || !isTimestamp(value.occurredAt)
    || !isDigest(value.predecessorDigest)
    || !isDigest(value.artifactReceiptDigest)
    || typeof value.artifactKey !== 'string'
    || !isSafeArtifactKey(value.artifactKey)
    || !isDigest(value.receiptDigest)
  ) return null;
  const withoutDigest = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-chain' as const,
    identity,
    admissionReceiptDigest: value.admissionReceiptDigest,
    stage: value.stage as TaskAttemptCustodyChainStage,
    occurredAt: value.occurredAt,
    predecessorDigest: value.predecessorDigest,
    artifactReceiptDigest: value.artifactReceiptDigest,
    artifactKey: value.artifactKey,
  };
  if (chainReceiptDigest(withoutDigest, policy.jsonBounds) !== value.receiptDigest) return null;
  return Object.freeze({ ...withoutDigest, receiptDigest: value.receiptDigest });
}

export function parseTaskAttemptCustodyHistoricalV1Sentinel(
  value: unknown,
): TaskAttemptCustodyHistoricalV1Sentinel | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'backend',
    'projectRootSha256',
    'taskId',
    'attemptId',
    'cutoverReceiptDigest',
  ]);
  if (record === null) return null;
  if (
    record.schemaVersion !== 1
    || record.kind !== 'task-attempt-custody-historical-v1'
    || record.state !== 'historical-read-only'
    || record.backend !== 'docker'
    || typeof record.projectRootSha256 !== 'string'
    || !matchesPattern(SHA256_HEX_PATTERN, record.projectRootSha256)
    || typeof record.taskId !== 'string'
    || record.taskId.length === 0
    || utf8Length(record.taskId) > 512
    || typeof record.attemptId !== 'string'
    || !matchesPattern(UUID_PATTERN, record.attemptId)
    || !isDigest(record.cutoverReceiptDigest)
  ) return null;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'task-attempt-custody-historical-v1',
    state: 'historical-read-only',
    backend: 'docker',
    projectRootSha256: record.projectRootSha256,
    taskId: record.taskId,
    attemptId: record.attemptId,
    cutoverReceiptDigest: record.cutoverReceiptDigest,
  });
}

export function verifyTaskAttemptCustodyHistoricalV1Sentinel(
  value: unknown,
  expected: Readonly<TaskAttemptCustodyHistoricalV1TrustAnchor>,
): TaskAttemptCustodyVerifiedHistoricalV1Sentinel {
  const parsed = parseTaskAttemptCustodyHistoricalV1Sentinel(value);
  const expectedRecord = snapshotExactDataRecord(expected, [
    'projectRootSha256',
    'taskId',
    'attemptId',
    'cutoverReceiptDigest',
  ]);
  if (
    parsed === null
    || expectedRecord === null
    || parsed.projectRootSha256 !== expectedRecord.projectRootSha256
    || parsed.taskId !== expectedRecord.taskId
    || parsed.attemptId !== expectedRecord.attemptId
    || parsed.cutoverReceiptDigest !== expectedRecord.cutoverReceiptDigest
  ) hold('CORRUPT_CUSTODY_RECORD', 'read');
  return parsed as TaskAttemptCustodyVerifiedHistoricalV1Sentinel;
}

function isSafeArtifactKey(value: string): boolean {
  return matchesPattern(SAFE_COMPONENT_PATTERN, value)
    && value !== '.'
    && value !== '..'
    && !value.endsWith('.')
    && !value.endsWith(' ')
    && !value.includes(':')
    && !matchesPattern(WINDOWS_RESERVED_COMPONENT_PATTERN, value);
}

/**
 * Canonical immutable Store location for one admitted attempt artifact.
 * Receipt consumers bind to this authority path, never to the mutable
 * worker-output source path from which an artifact was captured.
 */
export function taskAttemptCustodyArtifactDataRelativePath(input: {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly artifactClass: Exclude<
    TaskAttemptCustodyArtifactClass,
    'task-admission-snapshot'
  >;
  readonly artifactKey: string;
}): TaskAttemptCustodyRelativePath {
  assertIdentity(input.identity);
  if (
    !isTaskAttemptCustodyArtifactClass(input.artifactClass)
    || input.artifactClass === ('task-admission-snapshot' as TaskAttemptCustodyArtifactClass)
    || !isSafeArtifactKey(input.artifactKey)
  ) hold('UNSAFE_RELATIVE_PATH', 'canonicalize');
  return childPath(
    identityPrefix(input.identity),
    'artifacts',
    input.artifactClass,
    `${input.artifactKey}.bin`,
  );
}

function artifactCaptureModeForClass(
  artifactClass: unknown,
): TaskAttemptCustodyArtifactCaptureMode | null {
  switch (artifactClass) {
    case 'worker-result':
    case 'worker-partial-result':
    case 'worker-landing-proposal':
    case 'worker-provider-observation':
    case 'worker-timeout':
    case 'worker-log':
    case 'worker-ipc-question':
      return 'attempt-output-capture';
    case 'pristine-provider-stream':
      return 'provider-stream-capture';
    case 'worker-ipc-answer':
    case 'host-work-attribution':
    case 'execution-workspace-snapshot':
    case 'execution-workspace-release':
    case 'execution-effect-lifecycle-authority':
    case 'execution-effect-manifest':
    case 'execution-effect-staged-content':
    case 'execution-effect-landing-journal':
    case 'execution-effect-landing-receipt-evidence':
    case 'execution-effect-landing-receipt':
    case 'canonical-accepted-result':
    case 'production-wiring-host-settlement':
    case 'evaluation-receipt':
    case 'finalizer-receipt':
    case 'settlement-receipt':
    case 'archive-receipt':
      return 'host-authority-publication';
    default:
      return null;
  }
}

function isTaskAttemptCustodyArtifactClass(
  value: unknown,
): value is TaskAttemptCustodyArtifactClass {
  return value === 'task-admission-snapshot' || artifactCaptureModeForClass(value) !== null;
}

const CHAIN_ARTIFACT_CLASS: Readonly<
  Record<
    TaskAttemptCustodyChainStage,
    Exclude<TaskAttemptCustodyArtifactClass, 'task-admission-snapshot'>
  >
> = Object.freeze({
  'effect-landing': 'execution-effect-landing-receipt',
  'accepted-result': 'canonical-accepted-result',
  evaluation: 'evaluation-receipt',
  finalizer: 'finalizer-receipt',
  settlement: 'settlement-receipt',
  archive: 'archive-receipt',
});

function chainStagePath(
  prefix: TaskAttemptCustodyRelativePath,
  stage: TaskAttemptCustodyChainStage,
): TaskAttemptCustodyRelativePath {
  const ordinal = TASK_ATTEMPT_CUSTODY_CHAIN_STAGES.indexOf(stage) + 1;
  return childPath(prefix, 'chain', `${String(ordinal).padStart(2, '0')}-${stage}.json`);
}

interface IssuedPathCapabilityScope {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly access: TaskAttemptCustodyPathCapabilityAccess;
  readonly scopeDigest: Sha256Digest;
  readonly capabilityEvidenceDigest: Sha256Digest;
  readonly attemptOutputCaptureAuthority: AttemptOutputCaptureAuthority | null;
}

type AttemptOutputCaptureSourceState = 'ISSUED' | 'CAPTURING' | 'CONSUMED' | 'REVOKED';

interface AttemptOutputCaptureAuthority {
  readonly sourceRole: 'attempt-output-artifact-source';
  readonly artifactClass: TaskAttemptCustodyAttemptOutputArtifactClass;
  readonly artifactKey: string;
  readonly intentDigest: Sha256Digest;
  readonly bindingDigest: Sha256Digest;
  state: AttemptOutputCaptureSourceState;
  receiptDigest: Sha256Digest | null;
}

function sameAttemptOutputCaptureAuthority(
  left: AttemptOutputCaptureAuthority | null,
  right: AttemptOutputCaptureAuthority | null,
): boolean {
  return left === null || right === null
    ? left === right
    : left.sourceRole === right.sourceRole
      && left.artifactClass === right.artifactClass
      && left.artifactKey === right.artifactKey
      && left.intentDigest === right.intentDigest
      && left.bindingDigest === right.bindingDigest;
}

type MountLeaseState =
  | 'ISSUED'
  | 'CONSUMING'
  | 'CONSUMED'
  | 'CLEANUP_UNCONFIRMED'
  | 'RECONCILIATION_REQUIRED';

interface IssuedMountLeaseScope {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly scopeDigest: Sha256Digest;
  readonly adapterOwner: TaskAttemptCustodyAdapter;
  readonly taskSnapshot: TaskAttemptCustodyPathCapability;
  readonly workerOutput: TaskAttemptCustodyPathCapability;
  readonly target: TaskAttemptCustodyRelativePath;
  readonly descriptor: DurableEffectDescriptor;
  state: MountLeaseState;
}

type DurableEffectOperation = 'CREATE' | 'PUBLISH' | 'APPEND' | 'ABORT' | 'MOUNT';

interface DurableEffectDescriptor {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly operation: DurableEffectOperation;
  readonly target: TaskAttemptCustodyRelativePath;
  readonly contentDigest: Sha256Digest | null;
  readonly sequence: number;
  readonly opDigest: Sha256Digest;
}

interface DurableEffectOutcomeEvidence {
  readonly receiptDigest: Sha256Digest | null;
  readonly evidenceDigest: Sha256Digest | null;
}

type PublicationTokenState =
  | 'OPEN'
  | 'APPENDING'
  | 'APPEND_FAILED'
  | 'SEALING'
  | 'PUBLISHING'
  | 'PUBLISHED_UNCONFIRMED'
  | 'SEALED'
  | 'ABORTING'
  | 'ABORTED'
  | 'CLEANUP_UNCONFIRMED';

interface IssuedPublicationTokenScope {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly generation: number;
  readonly adapterOwner: TaskAttemptCustodyAdapter;
  readonly rootId: Sha256Digest;
  readonly createOpDigest: Sha256Digest;
  readonly target: TaskAttemptCustodyRelativePath;
  state: PublicationTokenState;
}

interface DurableEffectContext {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly scopeDigest: Sha256Digest;
}

interface PreparedArtifactWrite {
  readonly admission: TaskAttemptCustodyAdmissionV2;
  readonly artifactDirectory: TaskAttemptCustodyRelativePath;
  readonly artifactPath: TaskAttemptCustodyRelativePath;
  readonly receiptPath: TaskAttemptCustodyRelativePath;
  readonly limit: TaskAttemptCustodyArtifactLimit;
}

function attemptAccessScopeDigest(
  identity: TaskAttemptCustodyIdentityV2,
  admissionReceiptDigest: Sha256Digest,
  policy: TaskAttemptCustodyPolicyV2,
): Sha256Digest {
  return taskAttemptCustodyDigest('attempt-access-scope', {
    identity,
    admissionReceiptDigest,
    policyDigest: policy.policyDigest,
  }, policy.jsonBounds);
}

function attemptOutputCaptureIntentDigest(input: {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly scopeDigest: Sha256Digest;
  readonly artifactClass: TaskAttemptCustodyAttemptOutputArtifactClass;
  readonly artifactKey: string;
}): Sha256Digest {
  return taskAttemptCustodyDigest('attempt-output-capture-source-intent', {
    identity: input.identity,
    admissionReceiptDigest: input.admissionReceiptDigest,
    relativePath: input.relativePath,
    access: 'capture-read-file',
    scopeDigest: input.scopeDigest,
    sourceRole: 'attempt-output-artifact-source',
    artifactClass: input.artifactClass,
    artifactKey: input.artifactKey,
  }, TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS);
}

function attemptOutputCaptureBindingDigest(
  intentDigest: Sha256Digest,
  capabilityEvidenceDigest: Sha256Digest,
): Sha256Digest {
  return taskAttemptCustodyDigest('attempt-output-capture-source-binding', {
    intentDigest,
    capabilityEvidenceDigest,
  }, TASK_ATTEMPT_CUSTODY_JSON_HARD_BOUNDS);
}

function attemptEffectContext(
  identity: TaskAttemptCustodyIdentityV2,
  admissionReceiptDigest: Sha256Digest,
  policy: TaskAttemptCustodyPolicyV2,
): DurableEffectContext {
  return freezeObject({
    identity: cloneIdentity(identity),
    admissionReceiptDigest,
    policy,
    scopeDigest: attemptAccessScopeDigest(identity, admissionReceiptDigest, policy),
  });
}

function exactOwnDataErrorCode(value: unknown): string | null {
  if (
    value === null
    || (typeof value !== 'object' && typeof value !== 'function')
    || isUntrustedProxy(value)
  ) return null;
  try {
    const descriptor = intrinsicObjectGetOwnPropertyDescriptor(value, 'code');
    return descriptor !== undefined
      && 'value' in descriptor
      && typeof descriptor.value === 'string'
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function mappedAdapterHoldCode(
  cause: unknown,
  fallback: TaskAttemptCustodyHoldCode,
): TaskAttemptCustodyHoldCode {
  const code = exactOwnDataErrorCode(cause);
  switch (code) {
    case 'E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED':
      return 'CREATE_UNCONFIRMED';
    case 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED':
      return 'PUBLISHED_UNCONFIRMED';
    case 'E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED':
      return 'APPEND_FAILED';
    case 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED':
    case 'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED':
      return 'CLEANUP_UNCONFIRMED';
    case 'E_EXEC_AUTH_NATIVE_DURABILITY_UNCONFIRMED':
      return 'DURABILITY_UNCONFIRMED';
    case 'INVALID_IDENTITY':
    case 'INVALID_POLICY':
    case 'INVALID_CANONICAL_JSON':
    case 'JSON_BOUNDS_EXCEEDED':
    case 'UNSAFE_RELATIVE_PATH':
    case 'UNSUPPORTED_PLATFORM':
    case 'UNSUPPORTED_FILESYSTEM':
    case 'CAPABILITY_UNVERIFIED':
    case 'HOST_ROOT_INSIDE_PROJECT':
    case 'UNSAFE_ROOT':
    case 'UNSAFE_PATH_COMPONENT':
    case 'UNSAFE_LINK':
    case 'REPARSE_POINT':
    case 'PRIVACY_UNVERIFIED':
    case 'NOT_REGULAR_FILE':
    case 'LINK_COUNT_INVALID':
    case 'ARTIFACT_OVERSIZE':
    case 'ARTIFACT_CHANGED':
    case 'FIRST_WRITER_COLLISION':
    case 'DURABILITY_UNCONFIRMED':
    case 'NATIVE_CAPABILITY_UNAVAILABLE':
    case 'ADMISSION_REQUIRED':
    case 'ADMISSION_MISMATCH':
    case 'INCOMPLETE_PUBLICATION':
    case 'CORRUPT_CUSTODY_RECORD':
    case 'ARTIFACT_REPLAY_MISMATCH':
    case 'CHAIN_PREDECESSOR_MISMATCH':
    case 'CREATE_UNCONFIRMED':
    case 'PUBLISHED_UNCONFIRMED':
    case 'APPEND_FAILED':
    case 'CLEANUP_UNCONFIRMED':
    case 'LEASE_CONSUMED':
    case 'NO_EFFECT_ABORTED':
    case 'DISPATCH_DISCOVERY_BOUNDS_EXCEEDED':
    case 'DISPATCH_DISCOVERY_DEADLINE_EXCEEDED':
    case 'DISPATCH_DISCOVERY_MUTATED':
    case 'DISPATCH_DISCOVERY_MALFORMED_CANDIDATE':
    case 'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE':
    case 'RECONCILIATION_REQUIRED':
      return code;
    default: return fallback;
  }
}

function durableEffectMarker(
  phase: TaskAttemptCustodyDurableEffectMarker['phase'],
  opDigest: Sha256Digest,
  outcomeEvidence: DurableEffectOutcomeEvidence,
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDurableEffectMarker {
  const effectReceiptDigest = phase === 'OUTCOME' ? outcomeEvidence.receiptDigest : null;
  const effectEvidenceDigest = phase === 'OUTCOME' ? outcomeEvidence.evidenceDigest : null;
  const outcomeDigest = phase === 'OUTCOME'
    ? taskAttemptCustodyDigest('durable-effect-confirmed-outcome', {
      opDigest,
      effectReceiptDigest,
      effectEvidenceDigest,
    }, bounds)
    : null;
  const body = {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-effect-marker' as const,
    phase,
    opDigest,
    outcomeDigest,
    effectReceiptDigest,
    effectEvidenceDigest,
  };
  return freezeObject({
    ...body,
    markerDigest: taskAttemptCustodyDigest('durable-effect-marker', body, bounds),
  });
}

function sameDurableEffectMarker(
  value: unknown,
  expected: TaskAttemptCustodyDurableEffectMarker,
): boolean {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'phase',
    'opDigest',
    'outcomeDigest',
    'effectReceiptDigest',
    'effectEvidenceDigest',
    'markerDigest',
  ]);
  return record !== null
    && record.schemaVersion === expected.schemaVersion
    && record.kind === expected.kind
    && record.phase === expected.phase
    && record.opDigest === expected.opDigest
    && record.outcomeDigest === expected.outcomeDigest
    && record.effectReceiptDigest === expected.effectReceiptDigest
    && record.effectEvidenceDigest === expected.effectEvidenceDigest
    && record.markerDigest === expected.markerDigest;
}

function effectOutcomeRequiresReceipt(operation: DurableEffectOperation): boolean {
  return operation === 'MOUNT' || operation === 'APPEND' || operation === 'ABORT';
}

function snapshotDurableEffectMarker(
  value: unknown,
  descriptor: DurableEffectDescriptor,
  phase: TaskAttemptCustodyDurableEffectMarker['phase'],
  bounds: CanonicalJsonBounds,
): TaskAttemptCustodyDurableEffectMarker | null {
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'phase',
    'opDigest',
    'outcomeDigest',
    'effectReceiptDigest',
    'effectEvidenceDigest',
    'markerDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-effect-marker'
    || record.phase !== phase
    || record.opDigest !== descriptor.opDigest
  ) return null;
  let outcomeEvidence: DurableEffectOutcomeEvidence;
  if (phase === 'INTENT') {
    if (
      record.outcomeDigest !== null
      || record.effectReceiptDigest !== null
      || record.effectEvidenceDigest !== null
    ) return null;
    outcomeEvidence = { receiptDigest: null, evidenceDigest: null };
  } else if (effectOutcomeRequiresReceipt(descriptor.operation)) {
    if (!isDigest(record.effectReceiptDigest) || !isDigest(record.effectEvidenceDigest)) {
      return null;
    }
    outcomeEvidence = {
      receiptDigest: record.effectReceiptDigest,
      evidenceDigest: record.effectEvidenceDigest,
    };
  } else {
    if (record.effectReceiptDigest !== null || record.effectEvidenceDigest !== null) return null;
    outcomeEvidence = { receiptDigest: null, evidenceDigest: null };
  }
  const expected = durableEffectMarker(phase, descriptor.opDigest, outcomeEvidence, bounds);
  return sameDurableEffectMarker(value, expected) ? expected : null;
}

function snapshotDurableEffectPublication(
  value: unknown,
  expected: TaskAttemptCustodyDurableEffectMarker,
): TaskAttemptCustodyDurableEffectPublication {
  const record = snapshotExactDataRecord(value, ['state', 'marker']);
  if (
    record === null
    || (record.state !== 'CREATED' && record.state !== 'EXISTING_IDENTICAL')
    || !sameDurableEffectMarker(record.marker, expected)
  ) hold('RECONCILIATION_REQUIRED', 'publish');
  return freezeObject({ state: record.state, marker: expected });
}

function snapshotAdapterAppendResult(
  value: unknown,
  expected: {
    readonly byteLength: number;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  },
): TaskAttemptCustodyAdapterAppendResult {
  if (isUntrustedProxy(value) || !intrinsicObjectIsFrozen(value)) {
    hold('APPEND_FAILED', 'seal-stream');
  }
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'byteLength',
    'effectOpDigest',
    'scopeDigest',
    'generation',
    'evidenceDigest',
    'receiptDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-publication-append'
    || record.state !== 'APPENDED'
    || record.byteLength !== expected.byteLength
    || record.effectOpDigest !== expected.effectOpDigest
    || record.scopeDigest !== expected.scopeDigest
    || record.generation !== expected.generation
    || !isDigest(record.evidenceDigest)
    || !isDigest(record.receiptDigest)
  ) hold('APPEND_FAILED', 'seal-stream');
  const result = createTaskAttemptCustodyAdapterAppendResult({
    state: 'APPENDED',
    byteLength: expected.byteLength,
    effectOpDigest: expected.effectOpDigest,
    scopeDigest: expected.scopeDigest,
    generation: expected.generation,
    evidenceDigest: record.evidenceDigest,
  });
  if (result.receiptDigest !== record.receiptDigest) {
    hold('APPEND_FAILED', 'seal-stream');
  }
  return result;
}

function snapshotAdapterAbortResult(
  value: unknown,
  expected: {
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  },
): TaskAttemptCustodyAdapterAbortResult {
  if (isUntrustedProxy(value) || !intrinsicObjectIsFrozen(value)) {
    hold('CLEANUP_UNCONFIRMED', 'seal-stream');
  }
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'effectOpDigest',
    'scopeDigest',
    'generation',
    'evidenceDigest',
    'receiptDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-publication-abort'
    || (record.state !== 'ABORTED' && record.state !== 'CLEANUP_UNCONFIRMED')
    || record.effectOpDigest !== expected.effectOpDigest
    || record.scopeDigest !== expected.scopeDigest
    || record.generation !== expected.generation
    || !isDigest(record.evidenceDigest)
    || !isDigest(record.receiptDigest)
  ) hold('CLEANUP_UNCONFIRMED', 'seal-stream');
  const result = createTaskAttemptCustodyAdapterAbortResult({
    state: record.state,
    effectOpDigest: expected.effectOpDigest,
    scopeDigest: expected.scopeDigest,
    generation: expected.generation,
    evidenceDigest: record.evidenceDigest,
  });
  if (result.receiptDigest !== record.receiptDigest) {
    hold('CLEANUP_UNCONFIRMED', 'seal-stream');
  }
  return result;
}

function snapshotBackendMountTransferReceipt(
  value: unknown,
  expected: {
    readonly rootId: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly effectOpDigest: Sha256Digest;
    readonly attemptId: string;
    readonly generation: number;
  },
): TaskAttemptCustodyBackendMountTransferReceipt {
  if (isUntrustedProxy(value) || !intrinsicObjectIsFrozen(value)) {
    hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
  }
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'rootId',
    'scopeDigest',
    'effectOpDigest',
    'attemptId',
    'generation',
    'backend',
    'backendExecutionId',
    'backendImageDigest',
    'backendAuthorityLabelDigest',
    'taskSnapshotMountEvidenceDigest',
    'workerOutputMountEvidenceDigest',
    'backendBootstrapProbeEvidenceDigest',
    'daemonMountReceiptDigest',
    'transferEvidenceDigest',
    'cleanupEvidenceDigest',
    'receiptDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-mount-transfer'
    || record.rootId !== expected.rootId
    || record.scopeDigest !== expected.scopeDigest
    || record.effectOpDigest !== expected.effectOpDigest
    || record.attemptId !== expected.attemptId
    || record.generation !== expected.generation
    || record.backend !== 'docker'
    || !isDigest(record.transferEvidenceDigest)
    || !isDigest(record.receiptDigest)
  ) hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
  const state = record.state as TaskAttemptCustodyBackendMountTransferReceipt['state'];
  if (state !== 'CONSUMED' && state !== 'CLEANUP_UNCONFIRMED') {
    hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
  }
  const cleanupEvidenceDigest = record.cleanupEvidenceDigest as Sha256Digest | null;
  const receipt = createTaskAttemptCustodyBackendMountTransferReceipt({
    state,
    rootId: record.rootId,
    scopeDigest: record.scopeDigest,
    effectOpDigest: record.effectOpDigest,
    attemptId: record.attemptId,
    generation: record.generation,
    backend: 'docker',
    backendExecutionId: record.backendExecutionId as string | null,
    backendImageDigest: record.backendImageDigest as Sha256Digest | null,
    backendAuthorityLabelDigest: record.backendAuthorityLabelDigest as Sha256Digest | null,
    taskSnapshotMountEvidenceDigest: record.taskSnapshotMountEvidenceDigest as Sha256Digest | null,
    workerOutputMountEvidenceDigest: record.workerOutputMountEvidenceDigest as Sha256Digest | null,
    backendBootstrapProbeEvidenceDigest: record.backendBootstrapProbeEvidenceDigest as Sha256Digest | null,
    daemonMountReceiptDigest: record.daemonMountReceiptDigest as Sha256Digest | null,
    cleanupEvidenceDigest,
  });
  if (
    receipt.transferEvidenceDigest !== record.transferEvidenceDigest
    || receipt.receiptDigest !== record.receiptDigest
  ) {
    hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
  }
  return receipt;
}

function snapshotAdapterBeginPublicationResult(
  value: unknown,
  expected: Pick<DurableEffectDescriptor, 'opDigest' | 'scopeDigest'> & {
    readonly generation: number;
  },
): TaskAttemptCustodyAdapterBeginPublicationResult {
  if (isUntrustedProxy(value) || !intrinsicObjectIsFrozen(value)) {
    hold('CREATE_UNCONFIRMED', 'seal-stream');
  }
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'effectOpDigest',
    'scopeDigest',
    'generation',
    'evidenceDigest',
    'publication',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-publication-begin'
    || record.effectOpDigest !== expected.opDigest
    || record.scopeDigest !== expected.scopeDigest
    || record.generation !== expected.generation
    || !isDigest(record.evidenceDigest)
    || ![
      'CREATED',
      'NO_EFFECT_ABORTED',
      'CREATE_UNCONFIRMED',
      'CLEANUP_UNCONFIRMED',
    ].includes(record.state as string)
    || (record.state === 'CREATED' ? record.publication === null : record.publication !== null)
  ) hold('CREATE_UNCONFIRMED', 'seal-stream');
  if (record.state === 'CREATED') {
    assertOpaqueAdapterResource(record.publication, 'CREATE_UNCONFIRMED', 'seal-stream');
  }
  return freezeObject({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-publication-begin',
    state: record.state as TaskAttemptCustodyAdapterBeginPublicationResult['state'],
    effectOpDigest: expected.opDigest,
    scopeDigest: expected.scopeDigest,
    generation: expected.generation,
    evidenceDigest: record.evidenceDigest as Sha256Digest,
    publication: record.publication as TaskAttemptCustodyAdapterPublicationToken | null,
  });
}

function snapshotAdapterSealResult(
  value: unknown,
  expected: Pick<DurableEffectDescriptor, 'opDigest' | 'scopeDigest'> & {
    readonly generation: number;
  },
): TaskAttemptCustodyAdapterSealResult {
  if (isUntrustedProxy(value) || !intrinsicObjectIsFrozen(value)) {
    hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
  }
  const record = snapshotExactDataRecord(value, [
    'schemaVersion',
    'kind',
    'state',
    'effectOpDigest',
    'scopeDigest',
    'generation',
    'evidenceDigest',
    'publication',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-publication-seal'
    || record.effectOpDigest !== expected.opDigest
    || record.scopeDigest !== expected.scopeDigest
    || record.generation !== expected.generation
    || !isDigest(record.evidenceDigest)
    || ![
      'PUBLISHED',
      'NO_EFFECT_ABORTED',
      'PUBLISHED_UNCONFIRMED',
      'CLEANUP_UNCONFIRMED',
    ].includes(record.state as string)
    || (record.state === 'PUBLISHED' ? record.publication === null : record.publication !== null)
  ) hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
  const publication = record.state === 'PUBLISHED'
    ? snapshotAdapterPublication(record.publication, 'seal-stream')
    : null;
  return freezeObject({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-publication-seal',
    state: record.state as TaskAttemptCustodyAdapterSealResult['state'],
    effectOpDigest: expected.opDigest,
    scopeDigest: expected.scopeDigest,
    generation: expected.generation,
    evidenceDigest: record.evidenceDigest as Sha256Digest,
    publication,
  });
}

function assertOpaqueAdapterResource(
  value: unknown,
  code: TaskAttemptCustodyHoldCode,
  operation: TaskAttemptCustodyOperation,
): asserts value is object {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || isUntrustedProxy(value)
      || !intrinsicObjectIsFrozen(value)
      || intrinsicReflectOwnKeys(value).length !== 0
    ) hold(code, operation);
  } catch {
    hold(code, operation);
  }
}

export class TaskAttemptCustodyStore {
  readonly root: TaskAttemptCustodyRootProof;
  private readonly issuedPathCapabilities = new WeakMap<
    object,
    IssuedPathCapabilityScope
  >();
  private readonly revokedPathCapabilities = new WeakSet<object>();
  private readonly attemptOutputCaptureSourcesByPath = new Map<
    TaskAttemptCustodyRelativePath,
    TaskAttemptCustodyPathCapability
  >();
  private readonly issuedMountLeases = new WeakMap<object, IssuedMountLeaseScope>();
  private readonly mountLeaseIssuanceByScope = new Set<Sha256Digest>();
  private readonly activeMountLeaseByScope = new Set<Sha256Digest>();
  private readonly issuedPublicationTokens = new WeakMap<object, IssuedPublicationTokenScope>();
  private readonly revokedPublicationTokens = new WeakSet<object>();
  private readonly activeDurableEffects = new Set<Sha256Digest>();
  private readonly verifiedWorkerIpcAnsweredPrefix = new Map<
    string,
    Extract<TaskAttemptCustodyWorkerIpcConversationCursorV2, { readonly state: 'answered' }>
  >();

  private constructor(
    private readonly adapter: TaskAttemptCustodyAdapter,
    root: TaskAttemptCustodyRootProof,
    private readonly expectedProjectId: string,
    private readonly expectedProjectRootSha256: string,
  ) {
    this.root = Object.freeze({ ...root });
  }

  private assertStoreIdentity(
    identity: TaskAttemptCustodyIdentityV2,
    operation: TaskAttemptCustodyOperation,
  ): void {
    assertIdentity(identity);
    if (
      identity.projectId !== this.expectedProjectId
      || identity.projectRootSha256 !== this.expectedProjectRootSha256
      || this.root.projectId !== this.expectedProjectId
      || this.root.canonicalProjectRootSha256 !== this.expectedProjectRootSha256
    ) hold('ADMISSION_MISMATCH', operation);
  }

  private durableEffectDescriptor(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly scopeDigest: Sha256Digest;
    readonly operation: DurableEffectOperation;
    readonly target: TaskAttemptCustodyRelativePath;
    readonly contentDigest: Sha256Digest | null;
    readonly sequence: number;
  }): DurableEffectDescriptor {
    this.assertStoreIdentity(input.identity, 'publish');
    assertPolicy(input.policy);
    if (
      !isDigest(input.admissionReceiptDigest)
      || !isDigest(input.scopeDigest)
      || (input.contentDigest !== null && !isDigest(input.contentDigest))
      || !assertNonnegativeSafeInteger(input.sequence)
    ) hold('RECONCILIATION_REQUIRED', 'publish');
    const body = {
      identity: cloneIdentity(input.identity),
      generation: input.identity.generation,
      admissionReceiptDigest: input.admissionReceiptDigest,
      policyDigest: input.policy.policyDigest,
      scopeDigest: input.scopeDigest,
      operation: input.operation,
      target: input.target,
      contentDigest: input.contentDigest,
      sequence: input.sequence,
    };
    const opDigest = taskAttemptCustodyDigest(
      'durable-effect-operation',
      body,
      input.policy.jsonBounds,
    );
    return freezeObject({
      ...body,
      opDigest,
    });
  }

  private readDurableEffectMarker(
    descriptor: DurableEffectDescriptor,
    phase: TaskAttemptCustodyDurableEffectMarker['phase'],
    policy: TaskAttemptCustodyPolicyV2,
  ): TaskAttemptCustodyDurableEffectMarker | null {
    let value: TaskAttemptCustodyDurableEffectMarker | null;
    try {
      value = this.adapter.readDurableEffectMarker({
        root: this.root,
        opDigest: descriptor.opDigest,
        phase,
      });
    } catch (cause) {
      hold(mappedAdapterHoldCode(cause, 'RECONCILIATION_REQUIRED'), 'publish');
    }
    if (value === null) return null;
    const observed = snapshotDurableEffectMarker(
      value,
      descriptor,
      phase,
      policy.jsonBounds,
    );
    if (observed === null) {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    return observed;
  }

  private beginDurableEffect(
    descriptor: DurableEffectDescriptor,
    policy: TaskAttemptCustodyPolicyV2,
  ): 'EXECUTE' | 'CONFIRMED';
  private beginDurableEffect(
    descriptor: DurableEffectDescriptor,
    policy: TaskAttemptCustodyPolicyV2,
  ): 'EXECUTE' | 'CONFIRMED' {
    this.assertAttemptNotRetained(descriptor.identity, policy, 'publish');
    const intent = durableEffectMarker(
      'INTENT',
      descriptor.opDigest,
      { receiptDigest: null, evidenceDigest: null },
      policy.jsonBounds,
    );
    const existingIntent = this.readDurableEffectMarker(descriptor, 'INTENT', policy);
    const existingOutcome = this.readDurableEffectMarker(descriptor, 'OUTCOME', policy);
    if (existingOutcome !== null) {
      if (existingIntent === null) hold('RECONCILIATION_REQUIRED', 'publish');
      return 'CONFIRMED';
    }
    if (existingIntent !== null || this.activeDurableEffects.has(descriptor.opDigest)) {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    let publicationValue: TaskAttemptCustodyDurableEffectPublication;
    try {
      publicationValue = this.adapter.publishDurableEffectMarkerFirstWriter({
        root: this.root,
        marker: intent,
      });
    } catch (cause) {
      hold(mappedAdapterHoldCode(cause, 'RECONCILIATION_REQUIRED'), 'publish');
    }
    const publication = snapshotDurableEffectPublication(publicationValue, intent);
    const observed = this.readDurableEffectMarker(descriptor, 'INTENT', policy);
    if (observed === null) hold('RECONCILIATION_REQUIRED', 'publish');
    if (publication.state !== 'CREATED') {
      const racedOutcome = this.readDurableEffectMarker(descriptor, 'OUTCOME', policy);
      if (racedOutcome !== null) return 'CONFIRMED';
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    this.activeDurableEffects.add(descriptor.opDigest);
    return 'EXECUTE';
  }

  private completeDurableEffect(
    descriptor: DurableEffectDescriptor,
    policy: TaskAttemptCustodyPolicyV2,
    outcomeEvidence: DurableEffectOutcomeEvidence = {
      receiptDigest: null,
      evidenceDigest: null,
    },
  ): void {
    const requiresReceipt = effectOutcomeRequiresReceipt(descriptor.operation);
    if (
      requiresReceipt
        ? !isDigest(outcomeEvidence.receiptDigest) || !isDigest(outcomeEvidence.evidenceDigest)
        : outcomeEvidence.receiptDigest !== null || outcomeEvidence.evidenceDigest !== null
    ) hold('RECONCILIATION_REQUIRED', 'publish');
    const existingIntent = this.readDurableEffectMarker(descriptor, 'INTENT', policy);
    const existingOutcome = this.readDurableEffectMarker(descriptor, 'OUTCOME', policy);
    if (existingIntent === null) hold('RECONCILIATION_REQUIRED', 'publish');
    if (existingOutcome !== null) {
      const expectedOutcome = durableEffectMarker(
        'OUTCOME',
        descriptor.opDigest,
        outcomeEvidence,
        policy.jsonBounds,
      );
      if (!sameDurableEffectMarker(existingOutcome, expectedOutcome)) {
        hold('RECONCILIATION_REQUIRED', 'publish');
      }
      this.activeDurableEffects.delete(descriptor.opDigest);
      return;
    }
    if (!this.activeDurableEffects.has(descriptor.opDigest)) {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    const outcome = durableEffectMarker(
      'OUTCOME',
      descriptor.opDigest,
      outcomeEvidence,
      policy.jsonBounds,
    );
    let publicationValue: TaskAttemptCustodyDurableEffectPublication;
    try {
      publicationValue = this.adapter.publishDurableEffectMarkerFirstWriter({
        root: this.root,
        marker: outcome,
      });
    } catch (cause) {
      hold(mappedAdapterHoldCode(cause, 'RECONCILIATION_REQUIRED'), 'publish');
    }
    const publication = snapshotDurableEffectPublication(publicationValue, outcome);
    if (publication.state !== 'CREATED' && publication.state !== 'EXISTING_IDENTICAL') {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    const observed = this.readDurableEffectMarker(descriptor, 'OUTCOME', policy);
    if (observed === null || !sameDurableEffectMarker(observed, outcome)) {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    this.activeDurableEffects.delete(descriptor.opDigest);
  }

  private releaseDurableEffect(descriptor: DurableEffectDescriptor): void {
    this.activeDurableEffects.delete(descriptor.opDigest);
  }

  private requireCompletedDurableEffect(
    descriptor: DurableEffectDescriptor,
    policy: TaskAttemptCustodyPolicyV2,
    operation: TaskAttemptCustodyOperation,
  ): void {
    const intent = this.readDurableEffectMarker(descriptor, 'INTENT', policy);
    const outcome = this.readDurableEffectMarker(descriptor, 'OUTCOME', policy);
    if (intent === null || outcome === null) {
      hold('RECONCILIATION_REQUIRED', operation);
    }
  }

  private registerPublicationToken(
    token: TaskAttemptCustodyAdapterPublicationToken,
    input: Omit<IssuedPublicationTokenScope, 'adapterOwner' | 'rootId' | 'state'>,
  ): IssuedPublicationTokenScope {
    assertOpaqueAdapterResource(token, 'CLEANUP_UNCONFIRMED', 'seal-stream');
    const existing = this.issuedPublicationTokens.get(token);
    if (
      this.revokedPublicationTokens.has(token)
      || existing !== undefined
    ) {
      if (existing !== undefined) existing.state = 'CLEANUP_UNCONFIRMED';
      this.revokedPublicationTokens.add(token);
      hold('CLEANUP_UNCONFIRMED', 'seal-stream');
    }
    const scope: IssuedPublicationTokenScope = {
      identity: cloneIdentity(input.identity),
      admissionReceiptDigest: input.admissionReceiptDigest,
      policyDigest: input.policyDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      adapterOwner: this.adapter,
      rootId: this.root.rootId,
      createOpDigest: input.createOpDigest,
      target: input.target,
      state: 'OPEN',
    };
    this.issuedPublicationTokens.set(token, scope);
    return scope;
  }

  private requirePublicationToken(
    token: TaskAttemptCustodyAdapterPublicationToken,
    expected: Omit<IssuedPublicationTokenScope, 'adapterOwner' | 'rootId' | 'state'>,
    allowedStates: readonly PublicationTokenState[],
    code: TaskAttemptCustodyHoldCode,
  ): IssuedPublicationTokenScope {
    assertOpaqueAdapterResource(token, code, 'seal-stream');
    const scope = this.issuedPublicationTokens.get(token);
    if (
      scope === undefined
      || this.revokedPublicationTokens.has(token)
      || scope.adapterOwner !== this.adapter
      || scope.rootId !== this.root.rootId
      || !sameIdentity(scope.identity, expected.identity)
      || scope.admissionReceiptDigest !== expected.admissionReceiptDigest
      || scope.policyDigest !== expected.policyDigest
      || scope.scopeDigest !== expected.scopeDigest
      || scope.generation !== expected.generation
      || scope.createOpDigest !== expected.createOpDigest
      || scope.target !== expected.target
      || !allowedStates.includes(scope.state)
    ) hold(code, 'seal-stream');
    return scope;
  }

  /**
   * Bootstrap a semantic first-writer directory before an attempt identity
   * exists. The adapter's fd/handle-bound directory proof is the authority;
   * no path string is handed to a backend.
   */
  private ensureDispatchPrivateDirectory(
    relativePath: TaskAttemptCustodyRelativePath,
    operation: TaskAttemptCustodyOperation = 'reserve-dispatch',
  ): TaskAttemptCustodyDirectoryProof {
    const existing = this.readPrivateDirectorySnapshot(
      relativePath,
      operation,
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (existing !== null) {
      return existing;
    }
    let createdValue: TaskAttemptCustodyDirectoryProof;
    try {
      createdValue = this.adapter.ensurePrivateDirectory(this.root, relativePath);
    } catch (cause) {
      hold(
        mappedAdapterHoldCode(cause, 'CREATE_UNCONFIRMED'),
        operation,
      );
    }
    const created = assertDirectoryProof(createdValue, relativePath, this.root);
    const observed = this.readPrivateDirectorySnapshot(
      relativePath,
      operation,
      'CREATE_UNCONFIRMED',
    );
    if (observed === null || !sameDirectoryProof(created, observed)) {
      hold('CREATE_UNCONFIRMED', operation);
    }
    return observed;
  }

  /** Direct immutable publication used only for Store semantic authority. */
  private publishDispatchFirstWriter(
    relativePath: TaskAttemptCustodyRelativePath,
    bytes: Uint8Array,
    limit: TaskAttemptCustodyArtifactLimit,
    operation: TaskAttemptCustodyOperation = 'reserve-dispatch',
  ): TaskAttemptCustodyRead {
    validatedLimit(limit);
    const authorityBytes = snapshotAuthorityBytes(
      bytes,
      'DISPATCH_REQUEST_INVALID',
      operation,
    );
    assertBytesWithinLimit(authorityBytes, limit);
    const preexisting = this.readFirstWriterSnapshot(
      relativePath,
      limit,
      operation,
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (preexisting !== null) {
      return preexisting;
    }
    const adapterBytes = Uint8Array.from(authorityBytes);
    let publicationValue: TaskAttemptCustodyPublication | null = null;
    try {
      publicationValue = this.adapter.publishBytesFirstWriter({
        root: this.root,
        relativePath,
        bytes: adapterBytes,
        policy: limit,
      });
    } catch {
      // A concurrent first writer may have won. Only the fd-bound read below
      // decides whether that is idempotent or a semantic conflict.
    }
    if (!sameBytes(adapterBytes, authorityBytes)) {
      hold('PUBLISHED_UNCONFIRMED', operation);
    }
    if (publicationValue !== null) {
      const publication = snapshotAdapterPublication(publicationValue, operation);
      const proof = publication.state === 'CREATED'
        ? assertFileProof(
          publication.proof,
          relativePath,
          authorityBytes,
          this.root,
          limit,
        )
        : parseFileProof(publication.proof);
      if (
        proof === null
        || proof.relativePath !== relativePath
        || proof.volumeId !== this.root.volumeId
      ) hold('PUBLISHED_UNCONFIRMED', operation);
      const verified = this.readVerifiedSnapshot(
        proof,
        limit,
        operation,
        'PUBLISHED_UNCONFIRMED',
      );
      if (verified === null || !sameProof(proof, verified.proof)) {
        hold('PUBLISHED_UNCONFIRMED', operation);
      }
    }
    const observed = this.readFirstWriterSnapshot(
      relativePath,
      limit,
      operation,
      'PUBLISHED_UNCONFIRMED',
    );
    if (observed === null) hold('PUBLISHED_UNCONFIRMED', operation);
    return observed;
  }

  private readDispatchReservationRecord(
    dispatchRequestId: string,
    policy: TaskAttemptCustodyPolicyV2,
    allowRecoverableMaterialOnly = false,
  ): TaskAttemptCustodyDispatchReservationV2 | null {
    const materialPath = dispatchMaterialPath(
      this.expectedProjectId,
      this.expectedProjectRootSha256,
      dispatchRequestId,
    );
    const reservationPath = dispatchReservationPath(
      this.expectedProjectId,
      this.expectedProjectRootSha256,
      dispatchRequestId,
    );
    const observed = this.readFirstWriterSnapshot(
      reservationPath,
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (observed === null) {
      const material = this.readFirstWriterSnapshot(
        materialPath,
        policy.artifactLimits['task-admission-snapshot'],
        'read-dispatch',
        'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
      );
      if (material !== null) {
        if (allowRecoverableMaterialOnly) return null;
        hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
      }
      return null;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    }
    const reservation = parseDispatchReservation(parsed, policy);
    if (
      reservation === null
      || reservation.dispatchRequestId !== dispatchRequestId
      || reservation.identity.projectId !== this.expectedProjectId
      || reservation.identity.projectRootSha256 !== this.expectedProjectRootSha256
      || reservation.dispatchRequestMaterial.relativePath !== materialPath
      || !sameBytes(
        observed.bytes,
        canonicalTaskAttemptCustodyJson(reservation, policy.jsonBounds),
      )
    ) hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    const material = this.readVerifiedSnapshot(
      reservation.dispatchRequestMaterial,
      policy.artifactLimits['task-admission-snapshot'],
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (
      material === null
      || !sameProof(material.proof, reservation.dispatchRequestMaterial)
      || rawSha256(material.bytes) !== reservation.dispatchRequestMaterialDigest
    ) hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    return reservation;
  }

  private readDispatchReservationTransitionRecord(
    reservation: TaskAttemptCustodyDispatchReservationV2,
    policy: TaskAttemptCustodyPolicyV2,
  ): TaskAttemptCustodyDispatchReservationTransitionV2 | null {
    const path = dispatchReservationTransitionPath(
      this.expectedProjectId,
      this.expectedProjectRootSha256,
      reservation.dispatchRequestId,
    );
    const observed = this.readFirstWriterSnapshot(
      path,
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (observed === null) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    }
    const transition = parseDispatchReservationTransition(value, reservation, policy);
    if (
      transition === null
      || !sameBytes(
        observed.bytes,
        canonicalTaskAttemptCustodyJson(transition, policy.jsonBounds),
      )
    ) hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    return transition;
  }

  private claimDispatchReservationTransition(
    reservation: TaskAttemptCustodyDispatchReservationV2,
    policy: TaskAttemptCustodyPolicyV2,
    state: TaskAttemptCustodyDispatchReservationTransitionV2['state'],
    recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2 | null,
    recordedAt: string,
  ): TaskAttemptCustodyDispatchReservationTransitionV2 {
    const recoveryAuthorityDigest = recoveryAuthority === null
      ? null
      : dispatchRecoveryAuthorityDigest(recoveryAuthority, policy.jsonBounds);
    const body = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-dispatch-reservation-transition' as const,
      state,
      reservationReceiptDigest: reservation.receiptDigest,
      taskSnapshotDigest: reservation.taskSnapshotDigest,
      identity: cloneIdentity(reservation.identity),
      recoveryAuthority,
      recoveryAuthorityDigest,
      recordedAt,
    };
    const candidate: TaskAttemptCustodyDispatchReservationTransitionV2 = freezeObject({
      ...body,
      receiptDigest: dispatchReservationTransitionReceiptDigest(body, policy.jsonBounds),
    });
    const observed = this.publishDispatchFirstWriter(
      dispatchReservationTransitionPath(
        this.expectedProjectId,
        this.expectedProjectRootSha256,
        reservation.dispatchRequestId,
      ),
      canonicalTaskAttemptCustodyJson(candidate, policy.jsonBounds),
      metadataLimit(policy),
      state === 'ADMISSION_CLAIMED' ? 'reserve-dispatch' : 'settle-dispatch',
    );
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    const persisted = parseDispatchReservationTransition(value, reservation, policy);
    if (persisted === null || persisted.receiptDigest !== candidate.receiptDigest) {
      hold(
        state === 'ADMISSION_CLAIMED'
          ? 'DISPATCH_RESERVATION_RETIRED'
          : 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
        state === 'ADMISSION_CLAIMED' ? 'reserve-dispatch' : 'settle-dispatch',
      );
    }
    return persisted;
  }

  static open(input: {
    readonly adapter: TaskAttemptCustodyAdapter;
    readonly absoluteRoot: string;
    readonly canonicalProjectRoot: string;
    readonly projectId: string;
    readonly create: boolean;
  }): TaskAttemptCustodyStore {
    const record = requireExactDataRecord(input, [
      'adapter',
      'absoluteRoot',
      'canonicalProjectRoot',
      'projectId',
      'create',
    ], 'CAPABILITY_UNVERIFIED', 'open-root');
    if (
      typeof record.absoluteRoot !== 'string'
      || typeof record.canonicalProjectRoot !== 'string'
      || !isProjectId(record.projectId)
      || typeof record.create !== 'boolean'
    ) hold('INVALID_IDENTITY', 'open-root');
    const adapter = captureAdapterFacade(record.adapter);
    const expectedProjectRootSha256 = canonicalProjectRootSha256(record.canonicalProjectRoot);
    let rootValue: TaskAttemptCustodyRootProof;
    try {
      rootValue = adapter.openRoot({
        absoluteRoot: record.absoluteRoot,
        canonicalProjectRoot: record.canonicalProjectRoot,
        projectId: record.projectId,
        create: record.create,
      });
    } catch (error) {
      hold(mappedAdapterHoldCode(error, 'CAPABILITY_UNVERIFIED'), 'open-root');
    }
    let root: TaskAttemptCustodyRootProof;
    try {
      root = snapshotRootProof(
        rootValue,
        adapter,
        record.projectId,
        expectedProjectRootSha256,
      );
    } catch {
      hold(
        record.create ? 'CREATE_UNCONFIRMED' : 'CAPABILITY_UNVERIFIED',
        'open-root',
      );
    }
    return new TaskAttemptCustodyStore(
      adapter,
      root,
      record.projectId,
      expectedProjectRootSha256,
    );
  }

  reserveDispatchAdmission(input: {
    readonly dispatchRequestId: string;
    readonly dispatchRequestMaterial: unknown;
    readonly taskId: string;
    readonly taskSnapshot: unknown;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly reservedAt: string;
    readonly predecessor: TaskAttemptCustodyDispatchPredecessorRefV2 | null;
  }): Extract<TaskAttemptCustodyDispatchAdmissionReadV2, { readonly state: 'admitted' }> {
    const inputRecord = requireExactDataRecord(input, [
      'dispatchRequestId',
      'dispatchRequestMaterial',
      'taskId',
      'taskSnapshot',
      'policy',
      'reservedAt',
      'predecessor',
    ], 'DISPATCH_REQUEST_INVALID', 'reserve-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    if (
      !isDispatchRequestId(inputRecord.dispatchRequestId)
      || typeof inputRecord.taskId !== 'string'
      || inputRecord.taskId.length === 0
      || utf8Length(inputRecord.taskId) > 512
      || !isTimestamp(inputRecord.reservedAt)
    ) hold('DISPATCH_REQUEST_INVALID', 'reserve-dispatch');
    const predecessor = inputRecord.predecessor === null
      ? null
      : snapshotDispatchPredecessorRef(inputRecord.predecessor);
    if (inputRecord.predecessor !== null && predecessor === null) {
      hold('DISPATCH_REQUEST_INVALID', 'reserve-dispatch');
    }
    const dispatchRequestId = inputRecord.dispatchRequestId;
    const taskId = inputRecord.taskId;
    const materialBytes = canonicalTaskAttemptCustodyJson(
      inputRecord.dispatchRequestMaterial,
      policy.jsonBounds,
    );
    const snapshotBytes = canonicalTaskAttemptCustodyJson(
      inputRecord.taskSnapshot,
      policy.jsonBounds,
    );
    const dispatchRequestMaterialDigest = rawSha256(materialBytes);
    const taskSnapshotDigest = rawSha256(snapshotBytes);
    const existingReservationBeforeWrite = this.readDispatchReservationRecord(
      dispatchRequestId,
      policy,
      true,
    );
    let predecessorAdmission: TaskAttemptCustodyAdmissionV2 | null = null;
    if (predecessor !== null) {
      this.assertStoreIdentity(predecessor.identity, 'reserve-dispatch');
      if (predecessor.identity.taskId !== taskId) {
        hold('DISPATCH_REQUEST_CONFLICT', 'reserve-dispatch');
      }
      predecessorAdmission = this.readAdmission(predecessor.identity, policy);
      if (
        predecessorAdmission === null
        || predecessorAdmission.receiptDigest !== predecessor.admissionReceiptDigest
        || (
          existingReservationBeforeWrite === null
          && Date.parse(inputRecord.reservedAt) < Date.parse(predecessorAdmission.admittedAt)
        )
      ) hold('CHAIN_PREDECESSOR_MISMATCH', 'reserve-dispatch');
      if (predecessor.identity.generation >= TASK_ATTEMPT_CUSTODY_MAX_LINEAGE_DEPTH) {
        hold('CHAIN_PREDECESSOR_MISMATCH', 'reserve-dispatch');
      }
    }
    const projectPrefix = dispatchProjectPrefix(
      this.expectedProjectId,
      this.expectedProjectRootSha256,
    );
    const requestPrefix = dispatchRequestPrefix(
      this.expectedProjectId,
      this.expectedProjectRootSha256,
      dispatchRequestId,
    );
    this.ensureDispatchPrivateDirectory(projectPrefix);
    this.ensureDispatchPrivateDirectory(requestPrefix);
    const materialPath = dispatchMaterialPath(
      this.expectedProjectId,
      this.expectedProjectRootSha256,
      dispatchRequestId,
    );
    const material = this.publishDispatchFirstWriter(
      materialPath,
      materialBytes,
      policy.artifactLimits['task-admission-snapshot'],
    );
    if (!sameBytes(material.bytes, materialBytes)) {
      hold('DISPATCH_REQUEST_CONFLICT', 'reserve-dispatch');
    }
    const pendingSnapshot = this.publishDispatchFirstWriter(
      dispatchPendingTaskSnapshotPath(
        this.expectedProjectId,
        this.expectedProjectRootSha256,
        dispatchRequestId,
      ),
      snapshotBytes,
      policy.artifactLimits['task-admission-snapshot'],
    );
    if (!sameBytes(pendingSnapshot.bytes, snapshotBytes)) {
      hold('DISPATCH_REQUEST_CONFLICT', 'reserve-dispatch');
    }

    const identitySeed = taskAttemptCustodyDigest(
      'dispatch-identity-seed',
      {
        projectId: this.expectedProjectId,
        projectRootSha256: this.expectedProjectRootSha256,
        taskId,
        dispatchRequestId,
        dispatchRequestMaterialDigest,
        taskSnapshotDigest,
        policyDigest: policy.policyDigest,
      },
      policy.jsonBounds,
    );
    const identity: TaskAttemptCustodyIdentityV2 = freezeObject({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      backend: 'docker',
      projectRootSha256: this.expectedProjectRootSha256,
      projectId: this.expectedProjectId,
      taskId,
      attemptId: predecessor === null
        ? deterministicDispatchUuid(identitySeed)
        : predecessor.identity.attemptId,
      generation: predecessor === null ? 1 : predecessor.identity.generation + 1,
    });
    const bindingBody = {
      dispatchRequestId,
      dispatchRequestMaterialDigest,
      taskSnapshotDigest,
      policyDigest: policy.policyDigest,
      identity,
      predecessor,
    };
    const bindingDigest = dispatchReservationBindingDigest(
      bindingBody,
      policy.jsonBounds,
    );
    if (predecessor !== null) {
      const predecessorDispatchDirectory = dispatchAuthorityDirectory(predecessor.identity);
      this.ensureDispatchPrivateDirectory(predecessorDispatchDirectory);
      const slotBody = freezeObject({
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-dispatch-generation-slot' as const,
        dispatchRequestId,
        dispatchRequestMaterialDigest,
        bindingDigest,
        identity,
      });
      const slotBytes = canonicalTaskAttemptCustodyJson(slotBody, policy.jsonBounds);
      const slot = this.publishDispatchFirstWriter(
        dispatchGenerationSlotPath(predecessor.identity),
        slotBytes,
        metadataLimit(policy),
      );
      if (!sameBytes(slot.bytes, slotBytes)) {
        hold('DISPATCH_REQUEST_CONFLICT', 'reserve-dispatch');
      }
    }
    const withoutReceipt = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-dispatch-reservation' as const,
      state: 'reserved' as const,
      dispatchRequestId,
      dispatchRequestMaterialDigest,
      dispatchRequestMaterial: cloneProof(material.proof),
      taskSnapshotDigest,
      policyDigest: policy.policyDigest,
      identity,
      predecessor,
      reservedAt: inputRecord.reservedAt,
      bindingDigest,
    };
    const candidate: TaskAttemptCustodyDispatchReservationV2 = freezeObject({
      ...withoutReceipt,
      receiptDigest: dispatchReservationReceiptDigest(withoutReceipt, policy.jsonBounds),
    });
    const candidateBytes = canonicalTaskAttemptCustodyJson(candidate, policy.jsonBounds);
    const reservationObserved = this.publishDispatchFirstWriter(
      dispatchReservationPath(
        this.expectedProjectId,
        this.expectedProjectRootSha256,
        dispatchRequestId,
      ),
      candidateBytes,
      metadataLimit(policy),
    );
    let observedValue: unknown;
    try { observedValue = JSON.parse(Buffer.from(reservationObserved.bytes).toString('utf8')); } catch {
      return hold(
        'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
        'reserve-dispatch',
      );
    }
    const reservation = parseDispatchReservation(observedValue, policy);
    if (
      reservation === null
      || reservation.dispatchRequestId !== dispatchRequestId
      || reservation.dispatchRequestMaterialDigest !== dispatchRequestMaterialDigest
      || reservation.taskSnapshotDigest !== taskSnapshotDigest
      || reservation.bindingDigest !== bindingDigest
      || !sameIdentity(reservation.identity, identity)
      || !sameProof(reservation.dispatchRequestMaterial, material.proof)
    ) hold('DISPATCH_REQUEST_CONFLICT', 'reserve-dispatch');
    if (predecessor === null) {
      if (reservation.predecessor !== null) {
        hold('DISPATCH_REQUEST_CONFLICT', 'reserve-dispatch');
      }
    } else if (
      reservation.predecessor === null
      || reservation.predecessor.admissionReceiptDigest !== predecessor.admissionReceiptDigest
      || !sameIdentity(reservation.predecessor.identity, predecessor.identity)
    ) hold('DISPATCH_REQUEST_CONFLICT', 'reserve-dispatch');

    const existingRead = this.readDispatchAdmission({ dispatchRequestId, policy });
    if (existingRead.state === 'admitted') return existingRead;
    if (existingRead.state === 'retired-before-admission') {
      hold('DISPATCH_RESERVATION_RETIRED', 'reserve-dispatch');
    }
    this.claimDispatchReservationTransition(
      reservation,
      policy,
      'ADMISSION_CLAIMED',
      null,
      reservation.reservedAt,
    );
    this.createAdmission({
      identity,
      policy,
      admittedAt: reservation.reservedAt,
      predecessorDigest: predecessorAdmission?.receiptDigest ?? null,
      predecessorIdentity: predecessor?.identity ?? null,
      taskSnapshot: inputRecord.taskSnapshot,
    });
    const completed = this.readDispatchAdmission({ dispatchRequestId, policy });
    if (completed.state !== 'admitted') {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'reserve-dispatch');
    }
    return completed;
  }

  readDispatchAdmission(input: {
    readonly dispatchRequestId: string;
    readonly policy: TaskAttemptCustodyPolicyV2;
  }): TaskAttemptCustodyDispatchAdmissionReadV2 {
    const inputRecord = requireExactDataRecord(input, [
      'dispatchRequestId',
      'policy',
    ], 'DISPATCH_REQUEST_INVALID', 'read-dispatch');
    if (!isDispatchRequestId(inputRecord.dispatchRequestId)) {
      hold('DISPATCH_REQUEST_INVALID', 'read-dispatch');
    }
    const policy = snapshotPolicy(inputRecord.policy);
    const reservation = this.readDispatchReservationRecord(
      inputRecord.dispatchRequestId,
      policy,
    );
    if (reservation === null) {
      return freezeObject({
        state: 'absent' as const,
        dispatchRequestId: inputRecord.dispatchRequestId,
      });
    }
    const admission = this.readAdmission(reservation.identity, policy);
    if (admission === null) {
      const transition = this.readDispatchReservationTransitionRecord(reservation, policy);
      if (transition?.state === 'RETIRED_BEFORE_ADMISSION') {
        return freezeObject({
          state: 'retired-before-admission' as const,
          reservation,
          transition,
        });
      }
      return freezeObject({
        state: 'reserved-pending-admission' as const,
        reservation,
        reconciliationRef: taskAttemptCustodyDigest(
          'dispatch-pending-admission-reconciliation',
          {
            reservationReceiptDigest: reservation.receiptDigest,
            identity: reservation.identity,
          },
          policy.jsonBounds,
        ),
      });
    }
    const transition = this.readDispatchReservationTransitionRecord(reservation, policy);
    if (transition?.state === 'RETIRED_BEFORE_ADMISSION') {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    }
    if (
      admission.admittedAt !== reservation.reservedAt
      || admission.policyDigest !== reservation.policyDigest
      || admission.taskSnapshot.sha256 !== reservation.taskSnapshotDigest
      || (
        reservation.predecessor === null
          ? admission.predecessorDigest !== null || admission.predecessorIdentity !== null
          : admission.predecessorDigest !== reservation.predecessor.admissionReceiptDigest
            || admission.predecessorIdentity === null
            || !sameIdentity(
              admission.predecessorIdentity,
              reservation.predecessor.identity,
            )
      )
    ) hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    return freezeObject({
      state: 'admitted' as const,
      reservation,
      admission,
      ref: createDispatchAdmissionRef(reservation, admission, policy.jsonBounds),
    });
  }

  /**
   * Reconcile exactly one reservation after canonical Sprint recovery has
   * proved coordinator death and bound an owner approval. A current
   * reservation carries a host-staged canonical task snapshot and is completed
   * as an admission. A legacy reservation without that material can only be
   * retired before admission. Both paths are append-only and first-writer
   * fenced against a concurrent admission.
   */
  reconcilePendingDispatchReservation(input: {
    readonly dispatchRequestId: string;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2;
    readonly reconciledAt: string;
  }): Extract<TaskAttemptCustodyDispatchAdmissionReadV2, {
    readonly state: 'admitted' | 'retired-before-admission';
  }> {
    const inputRecord = requireExactDataRecord(input, [
      'dispatchRequestId',
      'policy',
      'recoveryAuthority',
      'reconciledAt',
    ], 'DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    if (!isDispatchRequestId(inputRecord.dispatchRequestId)
      || !isTimestamp(inputRecord.reconciledAt)) {
      hold('DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    }
    const policy = snapshotPolicy(inputRecord.policy);
    const recoveryAuthority = snapshotDispatchRecoveryAuthority(
      inputRecord.recoveryAuthority,
    );
    if (recoveryAuthority === null) {
      hold('DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    }
    const sprintNumber = recoveryAuthority.executionId.slice('sprint-'.length);
    const current = this.readDispatchAdmission({
      dispatchRequestId: inputRecord.dispatchRequestId,
      policy,
    });
    if (current.state === 'absent'
      || !current.reservation.identity.taskId.startsWith(`${sprintNumber}-`)
      || Date.parse(inputRecord.reconciledAt) < Date.parse(current.reservation.reservedAt)) {
      hold('DISPATCH_REQUEST_CONFLICT', 'settle-dispatch');
    }
    if (current.state === 'admitted') return current;
    if (current.state === 'retired-before-admission') {
      const expectedDigest = dispatchRecoveryAuthorityDigest(
        recoveryAuthority,
        policy.jsonBounds,
      );
      if (
        current.transition.recoveryAuthorityDigest !== expectedDigest
        || current.transition.recordedAt !== inputRecord.reconciledAt
      ) hold('DISPATCH_REQUEST_CONFLICT', 'settle-dispatch');
      return current;
    }

    const pendingSnapshotPath = dispatchPendingTaskSnapshotPath(
      this.expectedProjectId,
      this.expectedProjectRootSha256,
      current.reservation.dispatchRequestId,
    );
    const pendingSnapshot = this.readFirstWriterSnapshot(
      pendingSnapshotPath,
      policy.artifactLimits['task-admission-snapshot'],
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    const existingTransition = this.readDispatchReservationTransitionRecord(
      current.reservation,
      policy,
    );
    if (pendingSnapshot === null) {
      if (existingTransition !== null) {
        hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
      }
      this.claimDispatchReservationTransition(
        current.reservation,
        policy,
        'RETIRED_BEFORE_ADMISSION',
        recoveryAuthority,
        inputRecord.reconciledAt,
      );
      const retired = this.readDispatchAdmission({
        dispatchRequestId: current.reservation.dispatchRequestId,
        policy,
      });
      if (retired.state !== 'retired-before-admission') {
        hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
      }
      return retired;
    }
    if (rawSha256(pendingSnapshot.bytes) !== current.reservation.taskSnapshotDigest) {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    let taskSnapshot: unknown;
    try { taskSnapshot = JSON.parse(Buffer.from(pendingSnapshot.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    if (!sameBytes(
      pendingSnapshot.bytes,
      canonicalTaskAttemptCustodyJson(taskSnapshot, policy.jsonBounds),
    )) hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    this.claimDispatchReservationTransition(
      current.reservation,
      policy,
      'ADMISSION_CLAIMED',
      null,
      current.reservation.reservedAt,
    );
    const predecessorAdmission = current.reservation.predecessor === null
      ? null
      : this.readAdmission(current.reservation.predecessor.identity, policy);
    if (
      current.reservation.predecessor !== null
      && (predecessorAdmission === null
        || predecessorAdmission.receiptDigest
          !== current.reservation.predecessor.admissionReceiptDigest)
    ) hold('CHAIN_PREDECESSOR_MISMATCH', 'settle-dispatch');
    this.createAdmission({
      identity: current.reservation.identity,
      policy,
      admittedAt: current.reservation.reservedAt,
      predecessorDigest: predecessorAdmission?.receiptDigest ?? null,
      predecessorIdentity: current.reservation.predecessor?.identity ?? null,
      taskSnapshot,
    });
    const admitted = this.readDispatchAdmission({
      dispatchRequestId: current.reservation.dispatchRequestId,
      policy,
    });
    if (admitted.state !== 'admitted') {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    return admitted;
  }

  private readHistoricalNoEffectAdmission(
    reservation: TaskAttemptCustodyDispatchReservationV2,
    policy: TaskAttemptCustodyPolicyV2,
  ): Readonly<{
    historicalAdmission: TaskAttemptCustodyAdmissionV2;
    historicalTerminal: TaskAttemptCustodyDispatchNotDispatchedAuthorityV2;
  }> {
    const admissionPath = childPath(identityPrefix(reservation.identity), 'admission.json');
    const observedAdmission = this.readFirstWriterSnapshot(
      admissionPath,
      metadataLimit(policy),
      'settle-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (observedAdmission === null) {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    let admissionValue: unknown;
    try {
      admissionValue = JSON.parse(Buffer.from(observedAdmission.bytes).toString('utf8'));
    } catch {
      return hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    const historicalAdmission = parseTaskAttemptCustodyAdmissionV2(admissionValue, policy);
    if (
      historicalAdmission === null
      || !sameIdentity(historicalAdmission.identity, reservation.identity)
      || historicalAdmission.admittedAt !== reservation.reservedAt
      || historicalAdmission.policyDigest !== reservation.policyDigest
      || historicalAdmission.taskSnapshot.sha256 !== reservation.taskSnapshotDigest
      || !sameBytes(
        observedAdmission.bytes,
        canonicalTaskAttemptCustodyJson(historicalAdmission, policy.jsonBounds),
      )
      || (
        historicalAdmission.custodyRootId === this.root.rootId
        && historicalAdmission.custodyCapabilityEvidenceDigest
          === this.root.capabilityEvidenceDigest
      )
    ) hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');

    const observedTerminal = this.readFirstWriterSnapshot(
      dispatchTerminalPath(reservation.identity),
      metadataLimit(policy),
      'settle-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (observedTerminal === null) {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    let terminalValue: unknown;
    try {
      terminalValue = JSON.parse(Buffer.from(observedTerminal.bytes).toString('utf8'));
    } catch {
      return hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    const historicalTerminal = parseDispatchTerminalAuthority(terminalValue, policy);
    const expectedRef = createDispatchAdmissionRef(
      reservation,
      historicalAdmission,
      policy.jsonBounds,
    );
    if (
      historicalTerminal === null
      || historicalTerminal.state !== 'NOT_DISPATCHED'
      || historicalTerminal.attemptCount !== 0
      || historicalTerminal.admissionRef.refDigest !== expectedRef.refDigest
      || historicalTerminal.admissionRef.admissionReceiptDigest
        !== historicalAdmission.receiptDigest
      || !sameIdentity(historicalTerminal.admissionRef.identity, reservation.identity)
      || !sameBytes(
        observedTerminal.bytes,
        canonicalTaskAttemptCustodyJson(historicalTerminal, policy.jsonBounds),
      )
    ) hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    return freezeObject({ historicalAdmission, historicalTerminal });
  }

  private readHistoricalAdmissionQuarantine(
    reservation: TaskAttemptCustodyDispatchReservationV2,
    policy: TaskAttemptCustodyPolicyV2,
    observedCustodyHoldCode: TaskAttemptCustodyHoldCode,
  ): TaskAttemptCustodyDispatchQuarantinedHistoryV2 | null {
    const observed = this.readFirstWriterSnapshot(
      dispatchHistoricalAdmissionQuarantinePath(
        this.expectedProjectId,
        this.expectedProjectRootSha256,
        reservation.dispatchRequestId,
      ),
      metadataLimit(policy),
      'list-dispatch',
      'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE',
    );
    if (observed === null) return null;
    const history = this.readHistoricalNoEffectAdmission(reservation, policy);
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
    }
    const quarantine = parseHistoricalAdmissionQuarantine(
      value,
      reservation,
      history.historicalAdmission,
      history.historicalTerminal,
      observedCustodyHoldCode,
      this.root,
      policy,
    );
    if (
      quarantine === null
      || !sameBytes(
        observed.bytes,
        canonicalTaskAttemptCustodyJson(quarantine, policy.jsonBounds),
      )
    ) hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
    return freezeObject({
      state: 'quarantined-historical-admission' as const,
      reservation,
      historicalAdmission: history.historicalAdmission,
      historicalTerminal: history.historicalTerminal,
      quarantine,
    });
  }

  /**
   * Append one recovery-authorized quarantine receipt for an identity-bound
   * old-epoch admission that already proves zero provider attempts. Historical
   * bytes remain immutable and never become current execution authority.
   */
  quarantineHistoricalNoEffectDispatchAdmission(input: {
    readonly dispatchRequestId: string;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2;
    readonly quarantinedAt: string;
    readonly maxEntries: number;
    readonly maxNameBytes: number;
    readonly deadlineAt: string;
  }): TaskAttemptCustodyDispatchQuarantinedHistoryV2 {
    const inputRecord = requireExactDataRecord(input, [
      'dispatchRequestId',
      'policy',
      'recoveryAuthority',
      'quarantinedAt',
      'maxEntries',
      'maxNameBytes',
      'deadlineAt',
    ], 'DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    if (!isDispatchRequestId(inputRecord.dispatchRequestId)
      || !isTimestamp(inputRecord.quarantinedAt)) {
      hold('DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    }
    const policy = snapshotPolicy(inputRecord.policy);
    const recoveryAuthority = snapshotDispatchRecoveryAuthority(
      inputRecord.recoveryAuthority,
    );
    if (recoveryAuthority === null) {
      hold('DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    }
    const scanned = this.listDispatchAdmissionsForRecovery({
      policy,
      maxEntries: inputRecord.maxEntries as number,
      maxNameBytes: inputRecord.maxNameBytes as number,
      deadlineAt: inputRecord.deadlineAt as string,
    });
    const existing = scanned.entries.find(entry => (
      entry.state === 'quarantined-historical-admission'
      && entry.reservation.dispatchRequestId === inputRecord.dispatchRequestId
    ));
    if (existing?.state === 'quarantined-historical-admission') {
      const expectedAuthorityDigest = dispatchRecoveryAuthorityDigest(
        recoveryAuthority,
        policy.jsonBounds,
      );
      if (
        existing.quarantine.recoveryAuthorityDigest !== expectedAuthorityDigest
        || existing.quarantine.recordedAt !== inputRecord.quarantinedAt
      ) hold('DISPATCH_REQUEST_CONFLICT', 'settle-dispatch');
      return existing;
    }
    const held = scanned.heldAdmissions.find(entry => (
      entry.reservation.dispatchRequestId === inputRecord.dispatchRequestId
    ));
    if (held === undefined
      || !isHistoricalAdmissionQuarantineHoldCode(held.custodyHoldCode)
    ) hold('DISPATCH_REQUEST_CONFLICT', 'settle-dispatch');
    const sprintNumber = recoveryAuthority.executionId.slice('sprint-'.length);
    if (!held.reservation.identity.taskId.startsWith(`${sprintNumber}-`)) {
      hold('DISPATCH_REQUEST_CONFLICT', 'settle-dispatch');
    }
    const history = this.readHistoricalNoEffectAdmission(held.reservation, policy);
    if (Date.parse(inputRecord.quarantinedAt) < Date.parse(
      history.historicalTerminal.recordedAt,
    )) hold('DISPATCH_REQUEST_CONFLICT', 'settle-dispatch');
    const recoveryAuthorityDigest = dispatchRecoveryAuthorityDigest(
      recoveryAuthority,
      policy.jsonBounds,
    );
    const body: Omit<TaskAttemptCustodyHistoricalAdmissionQuarantineV2, 'receiptDigest'> = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-historical-admission-quarantine',
      state: 'QUARANTINED_NO_EFFECT_CUSTODY_EPOCH',
      dispatchRequestId: held.reservation.dispatchRequestId,
      reservationReceiptDigest: held.reservation.receiptDigest,
      historicalAdmissionReceiptDigest: history.historicalAdmission.receiptDigest,
      historicalTerminalReceiptDigest: history.historicalTerminal.receiptDigest,
      identity: cloneIdentity(held.reservation.identity),
      observedCustodyHoldCode: held.custodyHoldCode,
      previousCustodyRootId: history.historicalAdmission.custodyRootId,
      previousCustodyCapabilityEvidenceDigest:
        history.historicalAdmission.custodyCapabilityEvidenceDigest,
      currentCustodyRootId: this.root.rootId,
      currentCustodyCapabilityEvidenceDigest: this.root.capabilityEvidenceDigest,
      recoveryAuthority,
      recoveryAuthorityDigest,
      recordedAt: inputRecord.quarantinedAt as string,
    };
    const candidate: TaskAttemptCustodyHistoricalAdmissionQuarantineV2 = freezeObject({
      ...body,
      receiptDigest: historicalAdmissionQuarantineReceiptDigest(body, policy.jsonBounds),
    });
    const observed = this.publishDispatchFirstWriter(
      dispatchHistoricalAdmissionQuarantinePath(
        this.expectedProjectId,
        this.expectedProjectRootSha256,
        held.reservation.dispatchRequestId,
      ),
      canonicalTaskAttemptCustodyJson(candidate, policy.jsonBounds),
      metadataLimit(policy),
      'settle-dispatch',
    );
    let persistedValue: unknown;
    try { persistedValue = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    const persisted = parseHistoricalAdmissionQuarantine(
      persistedValue,
      held.reservation,
      history.historicalAdmission,
      history.historicalTerminal,
      held.custodyHoldCode,
      this.root,
      policy,
    );
    if (persisted === null || persisted.receiptDigest !== candidate.receiptDigest) {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    return freezeObject({
      state: 'quarantined-historical-admission' as const,
      reservation: held.reservation,
      historicalAdmission: history.historicalAdmission,
      historicalTerminal: history.historicalTerminal,
      quarantine: persisted,
    });
  }

  /**
   * Discover exact dispatch admissions without a second catalog. Directory names are only
   * untrusted candidate locators: every candidate is hash-bound to its embedded request id and
   * accepted only after `readDispatchAdmission` performs the full semantic reread.
   */
  listDispatchAdmissions(input: {
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly maxEntries: number;
    readonly maxNameBytes: number;
    readonly deadlineAt: string;
  }): TaskAttemptCustodyDispatchAdmissionListV2 {
    const scanned = this.scanDispatchAdmissions(input, false);
    if (scanned.kind !== 'task-attempt-custody-dispatch-admission-list') {
      hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
    }
    return scanned;
  }

  /**
   * Recovery-only discovery. A candidate whose canonical reservation identity
   * is proven but whose admission graph cannot be reread becomes an explicit
   * per-entry HOLD. Malformed or identity-unbound directory candidates still
   * fail the whole scan closed.
   */
  listDispatchAdmissionsForRecovery(input: {
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly maxEntries: number;
    readonly maxNameBytes: number;
    readonly deadlineAt: string;
  }): TaskAttemptCustodyDispatchRecoveryListV2 {
    const scanned = this.scanDispatchAdmissions(input, true);
    if (scanned.kind !== 'task-attempt-custody-dispatch-recovery-list') {
      hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
    }
    return scanned;
  }

  private scanDispatchAdmissions(input: {
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly maxEntries: number;
    readonly maxNameBytes: number;
    readonly deadlineAt: string;
  }, isolateAdmissionHolds: boolean):
    | TaskAttemptCustodyDispatchAdmissionListV2
    | TaskAttemptCustodyDispatchRecoveryListV2 {
    const inputRecord = requireExactDataRecord(input, [
      'policy',
      'maxEntries',
      'maxNameBytes',
      'deadlineAt',
    ], 'INVALID_POLICY', 'list-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    if (
      !assertPositiveSafeInteger(inputRecord.maxEntries)
      || inputRecord.maxEntries > 100_000
      || !assertPositiveSafeInteger(inputRecord.maxNameBytes)
      || inputRecord.maxNameBytes < 64
      || inputRecord.maxNameBytes > 128
      || !isTimestamp(inputRecord.deadlineAt)
    ) hold('DISPATCH_DISCOVERY_BOUNDS_EXCEEDED', 'list-dispatch');
    const deadlineUnixMs = intrinsicReflectApply(
      intrinsicDateParse,
      Date,
      [inputRecord.deadlineAt],
    ) as number;
    if (!Number.isSafeInteger(deadlineUnixMs) || deadlineUnixMs <= 0) {
      hold('DISPATCH_DISCOVERY_DEADLINE_EXCEEDED', 'list-dispatch');
    }
    if ((intrinsicReflectApply(intrinsicDateNow, Date, []) as number) > deadlineUnixMs) {
      hold('DISPATCH_DISCOVERY_DEADLINE_EXCEEDED', 'list-dispatch');
    }
    const maxEntries = inputRecord.maxEntries;
    const maxNameBytes = inputRecord.maxNameBytes;
    const deadlineAt = inputRecord.deadlineAt;
    const projectDirectory = dispatchProjectPrefix(
      this.expectedProjectId,
      this.expectedProjectRootSha256,
    );
    const directory = this.readPrivateDirectorySnapshot(
      projectDirectory,
      'list-dispatch',
      'DISPATCH_DISCOVERY_MUTATED',
    );
    let names: readonly string[];
    let directoryScanReceiptDigest: Sha256Digest;
    if (directory === null) {
      names = freezeObject([] as string[]);
      directoryScanReceiptDigest = taskAttemptCustodyDigest(
        'dispatch-directory-absent',
        {
          projectId: this.expectedProjectId,
          projectRootSha256: this.expectedProjectRootSha256,
          policyDigest: policy.policyDigest,
          maxEntries,
          maxNameBytes,
          deadlineAt,
        },
        policy.jsonBounds,
      );
    } else {
      const scan = this.adapter.scanPrivateDirectoryBounded;
      if (typeof scan !== 'function' || isUntrustedProxy(scan)) {
        hold('NATIVE_CAPABILITY_UNAVAILABLE', 'list-dispatch');
      }
      let receiptValue: TaskAttemptCustodyDirectoryScanReceiptV2;
      try {
        receiptValue = scan({
          root: this.root,
          relativeDirectory: projectDirectory,
          maxEntries,
          maxNameBytes,
          deadlineUnixMs,
        });
      } catch (cause) {
        hold(mappedAdapterHoldCode(cause, 'DISPATCH_DISCOVERY_MUTATED'), 'list-dispatch');
      }
      const receipt = createTaskAttemptCustodyDirectoryScanReceiptV2({
        rootId: receiptValue.rootId,
        relativeDirectory: receiptValue.relativeDirectory,
        names: receiptValue.names,
        entryCount: receiptValue.entryCount,
        maxEntries: receiptValue.maxEntries,
        maxNameBytes: receiptValue.maxNameBytes,
        deadlineUnixMs: receiptValue.deadlineUnixMs,
        nativeMutationEvidence: receiptValue.nativeMutationEvidence,
        nativeDirectoryIdentityBeforeDigest: receiptValue.nativeDirectoryIdentityBeforeDigest,
        nativeDirectoryIdentityAfterDigest: receiptValue.nativeDirectoryIdentityAfterDigest,
      });
      if (
        receiptValue.receiptDigest !== receipt.receiptDigest
        || receipt.rootId !== this.root.rootId
        || receipt.relativeDirectory !== projectDirectory
        || receipt.maxEntries !== maxEntries
        || receipt.maxNameBytes !== maxNameBytes
        || receipt.deadlineUnixMs !== deadlineUnixMs
        || receipt.nativeDirectoryIdentityBeforeDigest
          !== receipt.nativeDirectoryIdentityAfterDigest
      ) hold('DISPATCH_DISCOVERY_MUTATED', 'list-dispatch');
      names = receipt.names;
      directoryScanReceiptDigest = receipt.receiptDigest;
    }
    if ((intrinsicReflectApply(intrinsicDateNow, Date, []) as number) > deadlineUnixMs) {
      hold('DISPATCH_DISCOVERY_DEADLINE_EXCEEDED', 'list-dispatch');
    }

    const entries: TaskAttemptCustodyDispatchDiscoveryEntryV2[] = [];
    const heldAdmissions: TaskAttemptCustodyDispatchRecoveryHoldV2[] = [];
    let admittedCount = 0;
    let pendingAdmissionCount = 0;
    let retiredBeforeAdmissionCount = 0;
    let quarantinedHistoricalAdmissionCount = 0;
    for (let index = 0; index < names.length; index += 1) {
      if ((intrinsicReflectApply(intrinsicDateNow, Date, []) as number) > deadlineUnixMs) {
        hold('DISPATCH_DISCOVERY_DEADLINE_EXCEEDED', 'list-dispatch');
      }
      const candidateName = names[index]!;
      if (!matchesPattern(SHA256_HEX_PATTERN, candidateName)) {
        hold('DISPATCH_DISCOVERY_MALFORMED_CANDIDATE', 'list-dispatch');
      }
      const candidateDirectory = childPath(projectDirectory, candidateName);
      const reservationPath = childPath(candidateDirectory, 'reservation.json');
      let observed: TaskAttemptCustodyRead | null;
      try {
        observed = this.readFirstWriterSnapshot(
          reservationPath,
          metadataLimit(policy),
          'list-dispatch',
          'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE',
        );
      } catch {
        hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
      }
      if (observed === null) {
        hold('DISPATCH_DISCOVERY_MALFORMED_CANDIDATE', 'list-dispatch');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(observed.bytes).toString('utf8'));
      } catch {
        hold('DISPATCH_DISCOVERY_MALFORMED_CANDIDATE', 'list-dispatch');
      }
      const reservation = parseDispatchReservation(parsed, policy);
      if (reservation === null) {
        hold('DISPATCH_DISCOVERY_MALFORMED_CANDIDATE', 'list-dispatch');
      }
      if (
        pathHash(reservation.dispatchRequestId) !== candidateName
        || reservation.identity.projectId !== this.expectedProjectId
        || reservation.identity.projectRootSha256 !== this.expectedProjectRootSha256
        || reservation.dispatchRequestMaterial.relativePath !== childPath(
          candidateDirectory,
          'request-material.json',
        )
        || !sameBytes(
          observed.bytes,
          canonicalTaskAttemptCustodyJson(reservation, policy.jsonBounds),
        )
      ) hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
      let admitted: TaskAttemptCustodyDispatchAdmissionReadV2;
      try {
        admitted = this.readDispatchAdmission({
          dispatchRequestId: reservation.dispatchRequestId,
          policy,
        });
      } catch (error) {
        if (error instanceof TaskAttemptCustodyHold) {
          const quarantined = this.readHistoricalAdmissionQuarantine(
            reservation,
            policy,
            error.code,
          );
          if (quarantined !== null) {
            entries.push(quarantined);
            quarantinedHistoricalAdmissionCount += 1;
            continue;
          }
          if (isolateAdmissionHolds) {
            heldAdmissions.push(freezeObject({
              state: 'admission-graph-hold' as const,
              reservation,
              candidateLocatorDigest: taskAttemptCustodyDigest(
                'dispatch-recovery-candidate-locator',
                { candidateName, directoryScanReceiptDigest },
                policy.jsonBounds,
              ),
              custodyHoldCode: error.code,
            }));
            continue;
          }
          hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
        }
        throw error;
      }
      if (admitted.state === 'absent') {
        hold('DISPATCH_DISCOVERY_TAMPERED_CANDIDATE', 'list-dispatch');
      }
      entries.push(admitted);
      if (admitted.state === 'admitted') admittedCount += 1;
      else if (admitted.state === 'reserved-pending-admission') pendingAdmissionCount += 1;
      else retiredBeforeAdmissionCount += 1;
    }
    const frozenEntries = freezeObject(entries);
    if (isolateAdmissionHolds) {
      const frozenHeldAdmissions = freezeObject(heldAdmissions);
      const recoveryBody = freezeObject({
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-dispatch-recovery-list' as const,
        state: 'scanned-with-isolated-holds' as const,
        projectId: this.expectedProjectId,
        projectRootSha256: this.expectedProjectRootSha256,
        policyDigest: policy.policyDigest,
        entries: frozenEntries,
        heldAdmissions: frozenHeldAdmissions,
        candidateCount: names.length,
        admittedCount,
        pendingAdmissionCount,
        retiredBeforeAdmissionCount,
        quarantinedHistoricalAdmissionCount,
        heldAdmissionCount: frozenHeldAdmissions.length,
        maxEntries,
        maxNameBytes,
        deadlineAt,
        directoryScanReceiptDigest,
      });
      return freezeObject({
        ...recoveryBody,
        receiptDigest: taskAttemptCustodyDigest(
          'dispatch-recovery-list-receipt',
          recoveryBody,
          policy.jsonBounds,
        ),
      });
    }
    const body = freezeObject({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-dispatch-admission-list' as const,
      state: 'scanned' as const,
      projectId: this.expectedProjectId,
      projectRootSha256: this.expectedProjectRootSha256,
      policyDigest: policy.policyDigest,
      entries: frozenEntries,
      candidateCount: names.length,
      admittedCount,
      pendingAdmissionCount,
      retiredBeforeAdmissionCount,
      quarantinedHistoricalAdmissionCount,
      maxEntries,
      maxNameBytes,
      deadlineAt,
      directoryScanReceiptDigest,
    });
    return freezeObject({
      ...body,
      receiptDigest: taskAttemptCustodyDigest(
        'dispatch-admission-list-receipt',
        body,
        policy.jsonBounds,
      ),
    });
  }

  private startedFailedDispatchPath(identity: TaskAttemptCustodyIdentityV2): TaskAttemptCustodyRelativePath {
    return childPath(dispatchAuthorityDirectory(identity), 'started-failed-retained.json');
  }

  private effectCommittedReleasePendingDispatchPath(
    identity: TaskAttemptCustodyIdentityV2,
  ): TaskAttemptCustodyRelativePath {
    return childPath(dispatchAuthorityDirectory(identity), 'effect-committed-release-pending.json');
  }

  private assertAttemptNotRetained(
    identity: TaskAttemptCustodyIdentityV2,
    policy: TaskAttemptCustodyPolicyV2,
    operation: TaskAttemptCustodyOperation,
  ): void {
    // Any marker, including corrupt/incomplete authority, prevents resurrection.
    // This raw read deliberately does not call requireDispatchAdmissionRef.
    if (this.readFirstWriterSnapshot(this.startedFailedDispatchPath(identity),
      metadataLimit(policy), operation, 'DISPATCH_AUTHORITY_INVALID') !== null
      || this.readFirstWriterSnapshot(this.effectCommittedReleasePendingDispatchPath(identity),
        metadataLimit(policy), operation, 'DISPATCH_AUTHORITY_INVALID') !== null) {
      hold('DISPATCH_TRANSITION_INVALID', operation);
    }
  }

  private assertNoConflictingRetainedDisposition(
    policy: TaskAttemptCustodyPolicyV2,
    conflictingPath: TaskAttemptCustodyRelativePath,
  ): void {
    if (this.readFirstWriterSnapshot(conflictingPath, metadataLimit(policy),
      'settle-dispatch', 'DISPATCH_AUTHORITY_INVALID') !== null) {
      hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
    }
  }

  private startedFailedDirectoryNames(
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): readonly string[] {
    if (this.readPrivateDirectorySnapshot(relativeDirectory, 'read', 'ARTIFACT_CHANGED') === null) {
      return freezeObject([] as string[]);
    }
    const scan = this.adapter.scanPrivateDirectoryBounded;
    if (typeof scan !== 'function' || isUntrustedProxy(scan)) hold('NATIVE_CAPABILITY_UNAVAILABLE', 'read');
    const deadlineUnixMs = (intrinsicReflectApply(intrinsicDateNow, Date, []) as number) + 10_000;
    const maxEntries = 100_000;
    const maxNameBytes = 128;
    let value: TaskAttemptCustodyDirectoryScanReceiptV2;
    try {
      value = scan({ root: this.root, relativeDirectory, maxEntries, maxNameBytes, deadlineUnixMs });
    } catch (cause) { return hold(mappedAdapterHoldCode(cause, 'ARTIFACT_CHANGED'), 'read'); }
    const parsed = createTaskAttemptCustodyDirectoryScanReceiptV2({
      rootId: value.rootId, relativeDirectory: value.relativeDirectory,
      names: value.names, entryCount: value.entryCount, maxEntries: value.maxEntries,
      maxNameBytes: value.maxNameBytes, deadlineUnixMs: value.deadlineUnixMs,
      nativeMutationEvidence: value.nativeMutationEvidence,
      nativeDirectoryIdentityBeforeDigest: value.nativeDirectoryIdentityBeforeDigest,
      nativeDirectoryIdentityAfterDigest: value.nativeDirectoryIdentityAfterDigest,
    });
    if (value.receiptDigest !== parsed.receiptDigest || parsed.rootId !== this.root.rootId
      || parsed.relativeDirectory !== relativeDirectory || parsed.maxEntries !== maxEntries
      || parsed.maxNameBytes !== maxNameBytes || parsed.deadlineUnixMs !== deadlineUnixMs
      || parsed.nativeDirectoryIdentityBeforeDigest !== parsed.nativeDirectoryIdentityAfterDigest
      || (intrinsicReflectApply(intrinsicDateNow, Date, []) as number) > deadlineUnixMs) {
      hold('ARTIFACT_CHANGED', 'read');
    }
    return parsed.names;
  }

  private inspectExactReleasedProviderLifecycle(
    admitted: Extract<TaskAttemptCustodyDispatchAdmissionReadV2, { readonly state: 'admitted' }>,
    policy: TaskAttemptCustodyPolicyV2,
  ): Readonly<{
    terminal: TaskAttemptCustodyDispatchReleasedAuthorityV2;
    observations: readonly (TaskAttemptCustodyVerifiedDispatchObservationV2 | null)[];
    start: TaskAttemptCustodyVerifiedDispatchObservationV2;
    execution: TaskAttemptCustodyVerifiedDispatchObservationV2;
    exit: TaskAttemptCustodyVerifiedDispatchObservationV2;
  }> {
    const terminal = this.readDispatchAuthority({ admissionRef: admitted.ref, policy });
    if (terminal.state !== 'terminal' || terminal.authority.state !== 'RELEASED') {
      hold('DISPATCH_TRANSITION_INVALID', 'read');
    }
    const observations = TASK_ATTEMPT_CUSTODY_DISPATCH_OBSERVATION_CLASSES.map(observationClass => (
      this.readOptionalDispatchObservation(admitted, policy, observationClass)
    ));
    const observation = (kind: TaskAttemptCustodyDispatchObservationClass) => observations.find(
      entry => entry?.receipt.observationClass === kind,
    );
    const start = observation('PROVIDER_START');
    const execution = observation('PROVIDER_EXECUTION');
    const exit = observation('PROVIDER_EXIT');
    if (!start || !execution || !exit
      || Date.parse(start.receipt.observedAt) < Date.parse(terminal.authority.recordedAt)
      || Date.parse(execution.receipt.observedAt) < Date.parse(start.receipt.observedAt)
      || Date.parse(exit.receipt.observedAt) < Date.parse(execution.receipt.observedAt)) {
      hold('DISPATCH_TRANSITION_INVALID', 'read');
    }
    const decode = (entry: TaskAttemptCustodyVerifiedDispatchObservationV2, keys: readonly string[]) => {
      let value: unknown;
      try { value = JSON.parse(Buffer.from(entry.bytes).toString('utf8')); }
      catch { return hold('DISPATCH_AUTHORITY_INVALID', 'read'); }
      const parsed = snapshotExactDataRecord(value, keys);
      if (!parsed || parsed.schemaVersion !== 2 || parsed.admissionRefDigest !== admitted.ref.refDigest
        || parsed.containerId !== terminal.authority.backendExecutionId
        || parsed.observedAt !== entry.receipt.observedAt) hold('DISPATCH_AUTHORITY_INVALID', 'read');
      return parsed;
    };
    const sharedKeys = ['schemaVersion', 'kind', 'admissionRefDigest', 'containerId', 'taskSnapshotSha256',
      'providerInvocationDigest', 'authorityLabelsDigest', 'executionCommitNonceSha256',
      'providerExecutionAttemptId', 'providerExecutionAttemptIdentityDigest', 'dispatchReceiptDigest',
      'releaseReceiptRef', 'releaseReceiptDigest', 'projectionFence', 'startAuthorizationDigest',
      'state', 'providerState', 'observedAt'];
    const started = decode(start, [...sharedKeys, 'providerStartNonceSha256', 'pid1StartAckDigest']);
    const executed = decode(execution, [...sharedKeys, 'providerStartAckBytesSha256',
      'childPid', 'providerExecutionAckBytesSha256']);
    const exited = decode(exit, ['schemaVersion', 'kind', 'admissionRefDigest', 'containerId', 'exitCode',
      'dockerWaitProcessExitCode', 'dockerWaitSignal', 'stdoutSha256', 'stderrSha256', 'waitEvidenceDigest', 'observedAt']);
    const released = terminal.authority;
    for (const entry of [started, executed]) {
      if (entry.taskSnapshotSha256 !== admitted.admission.taskSnapshot.sha256
        || entry.providerInvocationDigest !== released.releaseEvidence.providerInvocationDigest
        || entry.authorityLabelsDigest !== released.releaseEvidence.daemonAuthorityLabelDigest
        || entry.providerExecutionAttemptId !== released.providerExecutionAttempt.providerExecutionAttemptId
        || entry.providerExecutionAttemptIdentityDigest !== released.providerExecutionAttempt.identityDigest
        || entry.dispatchReceiptDigest !== released.receiptDigest
        || entry.releaseReceiptRef !== released.releaseReceiptDigest
        || entry.releaseReceiptDigest !== released.releaseEvidenceDigest
        || entry.projectionFence !== released.projectionFence
        || !isDigest(entry.startAuthorizationDigest) || !isDigest(entry.executionCommitNonceSha256)) {
        hold('DISPATCH_AUTHORITY_INVALID', 'read');
      }
    }
    const waitEvidence = { admissionRefDigest: exited.admissionRefDigest, containerId: exited.containerId,
      exitCode: exited.exitCode, dockerWaitProcessExitCode: exited.dockerWaitProcessExitCode,
      dockerWaitSignal: exited.dockerWaitSignal, stdoutSha256: exited.stdoutSha256,
      stderrSha256: exited.stderrSha256, observedAt: exited.observedAt };
    if (started.kind !== 'exact-docker-provider-start' || started.state !== 'START_AUTHORIZATION_ACCEPTED'
      || started.providerState !== 'NOT_STARTED' || !isDigest(started.providerStartNonceSha256)
      || !isDigest(started.pid1StartAckDigest)
      || executed.kind !== 'exact-docker-pid1-provider-execution-ack'
      || executed.state !== 'PROVIDER_PROCESS_SPAWNED' || executed.providerState !== 'STARTED'
      || !assertPositiveSafeInteger(executed.childPid) || !isDigest(executed.providerStartAckBytesSha256)
      || !isDigest(executed.providerExecutionAckBytesSha256)
      || executed.executionCommitNonceSha256 !== started.executionCommitNonceSha256
      || executed.startAuthorizationDigest !== started.startAuthorizationDigest
      || exited.kind !== 'exact-docker-provider-exit' || !assertNonnegativeSafeInteger(exited.exitCode)
      || exited.exitCode > 255 || exited.dockerWaitProcessExitCode !== 0 || exited.dockerWaitSignal !== null
      || !isDigest(exited.stdoutSha256) || !isDigest(exited.stderrSha256)
      || exited.waitEvidenceDigest !== rawSha256(canonicalTaskAttemptCustodyJson(waitEvidence, policy.jsonBounds))) {
      hold('DISPATCH_AUTHORITY_INVALID', 'read');
    }
    return freezeObject({ terminal: released, observations: freezeObject(observations), start, execution, exit });
  }

  private inspectPreservedArtifactInventory(
    admitted: Extract<TaskAttemptCustodyDispatchAdmissionReadV2, { readonly state: 'admitted' }>,
    policy: TaskAttemptCustodyPolicyV2,
    forbidden: ReadonlySet<string>,
  ): Readonly<{
    artifacts: readonly TaskAttemptCustodyPreservedArtifactRefV2[];
    capturedAtByRef: ReadonlyMap<string, string>;
  }> {
    const artifactRoot = childPath(identityPrefix(admitted.ref.identity), 'artifacts');
    const classes = this.startedFailedDirectoryNames(artifactRoot);
    const artifacts: TaskAttemptCustodyPreservedArtifactRefV2[] = [];
    const capturedAtByRef = new Map<string, string>();
    for (const artifactClass of classes) {
      if (!isTaskAttemptCustodyArtifactClass(artifactClass)
        || artifactClass === 'task-admission-snapshot'
        || forbidden.has(artifactClass)) hold('DISPATCH_TRANSITION_INVALID', 'read');
      const names = this.startedFailedDirectoryNames(childPath(artifactRoot, artifactClass));
      const receipts = names.filter(name => name.endsWith('.receipt.json'));
      const binaries = names.filter(name => name.endsWith('.bin'));
      if (names.length !== receipts.length + binaries.length || receipts.length !== binaries.length) {
        hold('INCOMPLETE_PUBLICATION', 'read');
      }
      for (const name of receipts) {
        const artifactKey = name.slice(0, -'.receipt.json'.length);
        if (!isSafeArtifactKey(artifactKey) || !names.includes(`${artifactKey}.bin`)) {
          hold('INCOMPLETE_PUBLICATION', 'read');
        }
        const receipt = this.readArtifactReceipt({
          identity: admitted.ref.identity,
          policy,
          artifactClass,
          artifactKey,
        });
        const artifact = receipt ? this.readVerifiedSnapshot(
          receipt.artifact,
          policy.artifactLimits[artifactClass],
          'read',
        ) : null;
        if (!receipt || !artifact
          || receipt.admissionReceiptDigest !== admitted.admission.receiptDigest
          || receipt.policyDigest !== policy.policyDigest
          || !sameIdentity(receipt.identity, admitted.ref.identity)
          || !sameProof(artifact.proof, receipt.artifact)) {
          hold('ARTIFACT_REPLAY_MISMATCH', 'read');
        }
        const reference = freezeObject({
          artifactClass,
          artifactKey,
          receiptDigest: receipt.receiptDigest,
          contentDigest: receipt.artifact.sha256,
          byteLength: receipt.artifact.byteLength,
        });
        artifacts.push(reference);
        capturedAtByRef.set(`${artifactClass}\0${artifactKey}\0${receipt.receiptDigest}`, receipt.capturedAt);
      }
    }
    return freezeObject({ artifacts: freezeObject(artifacts), capturedAtByRef });
  }

  private latestEffectCommittedEvidenceTimestamp(
    admitted: Extract<TaskAttemptCustodyDispatchAdmissionReadV2, { readonly state: 'admitted' }>,
    policy: TaskAttemptCustodyPolicyV2,
    evidence: TaskAttemptCustodyEffectCommittedReleasePendingEvidenceV2,
  ): number {
    const references = [
      evidence.landingRecoveryAnchor,
      evidence.readyLifecycle,
      evidence.committedJournal,
      evidence.leaseEvidence,
      evidence.finalEvidence,
      evidence.finalManifest,
    ];
    let latest = Number.NEGATIVE_INFINITY;
    for (const reference of references) {
      const receipt = this.readArtifactReceipt({
        identity: admitted.ref.identity,
        policy,
        artifactClass: reference.artifactClass as Exclude<
          TaskAttemptCustodyArtifactClass,
          'task-admission-snapshot'
        >,
        artifactKey: reference.artifactKey,
      });
      if (!receipt || receipt.receiptDigest !== reference.receiptDigest) {
        hold('ARTIFACT_REPLAY_MISMATCH', 'read');
      }
      const capturedAt = Date.parse(receipt.capturedAt);
      if (capturedAt > latest) latest = capturedAt;
    }
    return latest;
  }

  private assertRecoveryAuthorityBoundToCandidate(
    authority: TaskAttemptCustodyDispatchRecoveryAuthorityV2,
    identity: TaskAttemptCustodyIdentityV2,
    recordedAt: string,
    earliestRecordedAt: number,
    operation: TaskAttemptCustodyOperation,
  ): void {
    const sprintOrdinal = authority.executionId.slice('sprint-'.length);
    if (!identity.taskId.startsWith(`${sprintOrdinal}-`)
      || Date.parse(recordedAt) < earliestRecordedAt) {
      hold(operation === 'read' ? 'DISPATCH_AUTHORITY_INVALID' : 'DISPATCH_REQUEST_INVALID', operation);
    }
  }

  inspectStartedFailedDispatchCandidate(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
  }): TaskAttemptCustodyStartedFailedCandidateV2 {
    const record = requireExactDataRecord(input, ['admissionRef', 'policy'], 'DISPATCH_AUTHORITY_INVALID', 'read');
    const policy = snapshotPolicy(record.policy);
    const admitted = this.requireDispatchAdmissionRef(record.admissionRef, policy, 'read');
    const lifecycle = this.inspectExactReleasedProviderLifecycle(admitted, policy);
    const { terminal, observations, start, execution, exit } = lifecycle;
    const prefix = identityPrefix(admitted.ref.identity);
    // Even an empty directory means publication may have begun. Never infer
    // unlanded state from a missing final receipt after APPLYING/COMMITTED.
    const forbidden = new Set<TaskAttemptCustodyArtifactClass>([
      'execution-workspace-release', 'execution-effect-landing-journal',
      'execution-effect-landing-receipt-evidence', 'execution-effect-landing-receipt',
      'canonical-accepted-result', 'production-wiring-host-settlement',
      'evaluation-receipt', 'finalizer-receipt', 'settlement-receipt', 'archive-receipt',
    ]);
    // Admission preallocates the chain directory; only a verified empty scan
    // is inert. In contrast, forbidden artifact-class directories are lazy.
    if (this.startedFailedDirectoryNames(childPath(prefix, 'chain')).length !== 0) {
      hold('DISPATCH_TRANSITION_INVALID', 'read');
    }
    const preserved = this.inspectPreservedArtifactInventory(admitted, policy, forbidden).artifacts;
    const preservationManifestDigest = taskAttemptCustodyDigest('started-failed-preservation', {
      taskSnapshotDigest: admitted.admission.taskSnapshot.sha256,
      observations: observations.filter(entry => entry !== null).map(entry => entry!.receipt),
      artifacts: preserved,
    }, policy.jsonBounds);
    const body = freezeObject({
      state: 'STARTED_FAILED_CANDIDATE' as const, identity: cloneIdentity(admitted.ref.identity),
      admissionRefDigest: admitted.ref.refDigest, admissionReceiptDigest: admitted.admission.receiptDigest,
      releasedDispatchReceiptDigest: terminal.receiptDigest,
      providerStartObservationReceiptDigest: start.receipt.receiptDigest,
      providerExecutionObservationReceiptDigest: execution.receipt.receiptDigest,
      providerExitObservationReceiptDigest: exit.receipt.receiptDigest,
      providerExitObservedAt: exit.receipt.observedAt, preservationManifestDigest, preservedArtifacts: preserved,
    });
    return freezeObject({ ...body, evidenceDigest: taskAttemptCustodyDigest('started-failed-candidate', body, policy.jsonBounds) });
  }

  readStartedFailedDispatch(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
  }): TaskAttemptCustodyStartedFailedDispatchV2 | null {
    const record = requireExactDataRecord(input, ['admissionRef', 'policy'], 'DISPATCH_AUTHORITY_INVALID', 'read');
    const policy = snapshotPolicy(record.policy);
    const admitted = this.requireDispatchAdmissionRef(record.admissionRef, policy, 'read');
    const observed = this.readFirstWriterSnapshot(this.startedFailedDispatchPath(admitted.ref.identity),
      metadataLimit(policy), 'read', 'DISPATCH_AUTHORITY_INVALID');
    if (observed === null) return null;
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); }
    catch { return hold('DISPATCH_AUTHORITY_INVALID', 'read'); }
    const row = snapshotExactDataRecord(decoded, [
      'schemaVersion', 'kind', 'state', 'identity', 'admissionRefDigest', 'admissionReceiptDigest',
      'releasedDispatchReceiptDigest', 'providerStartObservationReceiptDigest',
      'providerExecutionObservationReceiptDigest', 'providerExitObservationReceiptDigest',
      'providerExitObservedAt', 'preservationManifestDigest', 'preservedArtifacts', 'evidenceDigest',
      'custodyRootId', 'custodyCapabilityEvidenceDigest', 'recoveryAuthority', 'recoveryAuthorityDigest',
      'stoppedExecutionEvidenceDigest', 'recordedAt', 'receiptDigest',
    ]);
    const authority = row ? snapshotDispatchRecoveryAuthority(row.recoveryAuthority) : null;
    if (!row || !authority || row.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
      || row.kind !== 'task-attempt-custody-started-failed-dispatch' || row.state !== 'STARTED_FAILED_RETAINED'
      || row.custodyRootId !== this.root.rootId || row.custodyCapabilityEvidenceDigest !== this.root.capabilityEvidenceDigest
      || !isDigest(row.stoppedExecutionEvidenceDigest) || !isTimestamp(row.recordedAt)
      || !isDigest(row.receiptDigest)) hold('DISPATCH_AUTHORITY_INVALID', 'read');
    const candidate = this.inspectStartedFailedDispatchCandidate({ admissionRef: admitted.ref, policy });
    this.assertRecoveryAuthorityBoundToCandidate(authority, candidate.identity, row.recordedAt,
      Date.parse(candidate.providerExitObservedAt), 'read');
    const body = freezeObject({ ...candidate, schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-started-failed-dispatch' as const, state: 'STARTED_FAILED_RETAINED' as const,
      custodyRootId: this.root.rootId, custodyCapabilityEvidenceDigest: this.root.capabilityEvidenceDigest,
      recoveryAuthority: authority, recoveryAuthorityDigest: dispatchRecoveryAuthorityDigest(authority, policy.jsonBounds),
      stoppedExecutionEvidenceDigest: row.stoppedExecutionEvidenceDigest as Sha256Digest, recordedAt: row.recordedAt,
    });
    const disposition = freezeObject({ ...body, receiptDigest: taskAttemptCustodyDigest('started-failed-dispatch', body, policy.jsonBounds) });
    if (!sameBytes(observed.bytes, canonicalTaskAttemptCustodyJson(disposition, policy.jsonBounds))) {
      hold('DISPATCH_AUTHORITY_INVALID', 'read');
    }
    return disposition;
  }

  retainStartedFailedDispatch(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2;
    readonly recordedAt: string;
    readonly stoppedExecutionEvidenceDigest: Sha256Digest;
  }): TaskAttemptCustodyStartedFailedDispatchV2 {
    const row = requireExactDataRecord(input, ['admissionRef', 'policy', 'recoveryAuthority',
      'recordedAt', 'stoppedExecutionEvidenceDigest'], 'DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    const policy = snapshotPolicy(row.policy);
    const admitted = this.requireDispatchAdmissionRef(row.admissionRef, policy, 'settle-dispatch');
    const authority = snapshotDispatchRecoveryAuthority(row.recoveryAuthority);
    if (!authority || !isTimestamp(row.recordedAt) || !isDigest(row.stoppedExecutionEvidenceDigest)
      || !admitted.ref.identity.taskId.startsWith(`${authority.executionId.slice('sprint-'.length)}-`)) {
      hold('DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    }
    this.assertNoConflictingRetainedDisposition(policy,
      this.effectCommittedReleasePendingDispatchPath(admitted.ref.identity));
    const candidate = this.inspectStartedFailedDispatchCandidate({ admissionRef: admitted.ref, policy });
    this.assertRecoveryAuthorityBoundToCandidate(authority, candidate.identity, row.recordedAt,
      Date.parse(candidate.providerExitObservedAt), 'settle-dispatch');
    const body = freezeObject({ ...candidate, schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-started-failed-dispatch' as const, state: 'STARTED_FAILED_RETAINED' as const,
      custodyRootId: this.root.rootId, custodyCapabilityEvidenceDigest: this.root.capabilityEvidenceDigest,
      recoveryAuthority: authority, recoveryAuthorityDigest: dispatchRecoveryAuthorityDigest(authority, policy.jsonBounds),
      stoppedExecutionEvidenceDigest: row.stoppedExecutionEvidenceDigest as Sha256Digest, recordedAt: row.recordedAt,
    });
    const disposition = freezeObject({ ...body, receiptDigest: taskAttemptCustodyDigest('started-failed-dispatch', body, policy.jsonBounds) });
    this.publishDispatchFirstWriter(this.startedFailedDispatchPath(admitted.ref.identity),
      canonicalTaskAttemptCustodyJson(disposition, policy.jsonBounds), metadataLimit(policy), 'settle-dispatch');
    const reread = this.readStartedFailedDispatch({ admissionRef: admitted.ref, policy });
    if (!reread || reread.receiptDigest !== disposition.receiptDigest) hold('DISPATCH_REQUEST_CONFLICT', 'settle-dispatch');
    return reread;
  }

  /** Structural-only half of the committed-journal recovery contract. The
   * orchestra adapter must verify journal/lease semantics before every call. */
  inspectEffectCommittedReleasePendingCandidate(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly evidence: TaskAttemptCustodyEffectCommittedReleasePendingEvidenceV2;
  }): TaskAttemptCustodyEffectCommittedReleasePendingCandidateV2 {
    const row = requireExactDataRecord(input, ['admissionRef', 'policy', 'evidence'], 'DISPATCH_AUTHORITY_INVALID', 'read');
    const policy = snapshotPolicy(row.policy);
    const admitted = this.requireDispatchAdmissionRef(row.admissionRef, policy, 'read');
    const lifecycle = this.inspectExactReleasedProviderLifecycle(admitted, policy);
    const { terminal, exit } = lifecycle;
    const evidenceRecord = snapshotExactDataRecord(row.evidence, [
      'phase', 'landingRecoveryAnchor', 'readyLifecycle', 'committedJournal', 'leaseEvidence',
      'finalEvidence', 'finalManifest', 'semanticVerifier', 'semanticEvidenceDigest',
    ]);
    if (!evidenceRecord || evidenceRecord.phase !== 'COMMITTED_JOURNAL_RELEASE_PENDING'
      || evidenceRecord.semanticVerifier !== 'orchestra-required-v1'
      || !isDigest(evidenceRecord.semanticEvidenceDigest)) hold('DISPATCH_AUTHORITY_INVALID', 'read');
    const expected: ReadonlyArray<readonly [string, Exclude<
      TaskAttemptCustodyArtifactClass,
      'task-admission-snapshot'
    >]> = [
      ['landingRecoveryAnchor', 'execution-effect-lifecycle-authority'],
      ['readyLifecycle', 'execution-effect-lifecycle-authority'],
      ['committedJournal', 'execution-effect-landing-journal'],
      ['leaseEvidence', 'execution-effect-landing-receipt-evidence'],
      ['finalEvidence', 'execution-effect-landing-receipt-evidence'],
      ['finalManifest', 'execution-effect-manifest'],
    ];
    const refs: Record<string, TaskAttemptCustodyPreservedArtifactRefV2> = Object.create(null);
    const requiredRefs: TaskAttemptCustodyPreservedArtifactRefV2[] = [];
    for (const [key, artifactClass] of expected) {
      const ref = snapshotExactDataRecord(evidenceRecord[key], [
        'artifactClass', 'artifactKey', 'receiptDigest', 'contentDigest', 'byteLength',
      ]);
      if (!ref || ref.artifactClass !== artifactClass || typeof ref.artifactKey !== 'string'
        || !isSafeArtifactKey(ref.artifactKey) || !isDigest(ref.receiptDigest)
        || !isDigest(ref.contentDigest) || !assertNonnegativeSafeInteger(ref.byteLength)) {
        hold('DISPATCH_AUTHORITY_INVALID', 'read');
      }
      const receipt = this.readArtifactReceipt({ identity: admitted.ref.identity, policy,
        artifactClass, artifactKey: ref.artifactKey as string });
      const artifact = receipt ? this.readVerifiedSnapshot(receipt.artifact,
        policy.artifactLimits[artifactClass], 'read') : null;
      if (!receipt || !artifact || receipt.receiptDigest !== ref.receiptDigest
        || receipt.artifact.sha256 !== ref.contentDigest || receipt.artifact.byteLength !== ref.byteLength
        || receipt.admissionReceiptDigest !== admitted.admission.receiptDigest
        || receipt.policyDigest !== policy.policyDigest || !sameProof(artifact.proof, receipt.artifact)) {
        hold('ARTIFACT_REPLAY_MISMATCH', 'read');
      }
      refs[key] = freezeObject({ artifactClass, artifactKey: ref.artifactKey as string,
        receiptDigest: ref.receiptDigest as Sha256Digest, contentDigest: ref.contentDigest as Sha256Digest,
        byteLength: ref.byteLength as number });
      requiredRefs.push(refs[key]!);
    }
    const forbidden = new Set<string>([
      'execution-workspace-release', 'execution-effect-landing-receipt', 'canonical-accepted-result',
      'production-wiring-host-settlement', 'evaluation-receipt', 'finalizer-receipt',
      'settlement-receipt', 'archive-receipt',
    ]);
    const prefix = identityPrefix(admitted.ref.identity);
    const inventory = this.inspectPreservedArtifactInventory(admitted, policy, forbidden);
    const preservedArtifacts = inventory.artifacts;
    for (const reference of requiredRefs) {
      const inventoryReferenceExists = intrinsicArraySome(preservedArtifacts, candidate => (
        candidate.artifactClass === reference.artifactClass
        && candidate.artifactKey === reference.artifactKey
        && candidate.receiptDigest === reference.receiptDigest
        && candidate.contentDigest === reference.contentDigest
        && candidate.byteLength === reference.byteLength
      ));
      const capturedAt = inventory.capturedAtByRef.get(
        `${reference.artifactClass}\0${reference.artifactKey}\0${reference.receiptDigest}`,
      );
      if (!inventoryReferenceExists || !capturedAt
        || Date.parse(capturedAt) < Date.parse(exit.receipt.observedAt)) {
        hold('ARTIFACT_REPLAY_MISMATCH', 'read');
      }
    }
    // Release-pending has no chain authority at all. A nonempty directory is
    // publication evidence, including an unknown future stage.
    if (this.startedFailedDirectoryNames(childPath(prefix, 'chain')).length !== 0) {
      hold('DISPATCH_TRANSITION_INVALID', 'read');
    }
    const evidence = freezeObject({ phase: 'COMMITTED_JOURNAL_RELEASE_PENDING' as const,
      landingRecoveryAnchor: refs['landingRecoveryAnchor']!, readyLifecycle: refs['readyLifecycle']!,
      committedJournal: refs['committedJournal']!, leaseEvidence: refs['leaseEvidence']!,
      finalEvidence: refs['finalEvidence']!, finalManifest: refs['finalManifest']!,
      semanticVerifier: 'orchestra-required-v1' as const,
      semanticEvidenceDigest: evidenceRecord.semanticEvidenceDigest as Sha256Digest });
    const preservationManifestDigest = taskAttemptCustodyDigest('effect-committed-release-pending-preservation', {
      taskSnapshotDigest: admitted.admission.taskSnapshot.sha256, evidence,
      providerObservations: lifecycle.observations
        .filter(entry => entry !== null)
        .map(entry => entry!.receipt),
      artifacts: preservedArtifacts,
    }, policy.jsonBounds);
    const body = freezeObject({ state: 'EFFECT_COMMITTED_RELEASE_PENDING_CANDIDATE' as const,
      identity: cloneIdentity(admitted.ref.identity), admissionRefDigest: admitted.ref.refDigest,
      admissionReceiptDigest: admitted.admission.receiptDigest,
      releasedDispatchReceiptDigest: terminal.receiptDigest,
      providerExitObservationReceiptDigest: exit.receipt.receiptDigest,
      providerExitObservedAt: exit.receipt.observedAt, evidence, preservedArtifacts,
      preservationManifestDigest });
    return freezeObject({ ...body, evidenceDigest: taskAttemptCustodyDigest(
      'effect-committed-release-pending-candidate', body, policy.jsonBounds) });
  }

  readEffectCommittedReleasePendingDispatch(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
  }): TaskAttemptCustodyEffectCommittedReleasePendingDispatchV2 | null {
    const row = requireExactDataRecord(input, ['admissionRef', 'policy'], 'DISPATCH_AUTHORITY_INVALID', 'read');
    const policy = snapshotPolicy(row.policy);
    const admitted = this.requireDispatchAdmissionRef(row.admissionRef, policy, 'read');
    const observed = this.readFirstWriterSnapshot(this.effectCommittedReleasePendingDispatchPath(admitted.ref.identity),
      metadataLimit(policy), 'read', 'DISPATCH_AUTHORITY_INVALID');
    if (!observed) return null;
    let decoded: unknown; try { decoded = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); }
    catch { return hold('DISPATCH_AUTHORITY_INVALID', 'read'); }
    const record = snapshotExactDataRecord(decoded, [
      'schemaVersion', 'kind', 'state', 'identity', 'admissionRefDigest', 'admissionReceiptDigest',
      'releasedDispatchReceiptDigest', 'providerExitObservationReceiptDigest', 'providerExitObservedAt',
      'evidence', 'preservedArtifacts', 'preservationManifestDigest', 'evidenceDigest', 'custodyRootId',
      'custodyCapabilityEvidenceDigest', 'recoveryAuthority', 'recoveryAuthorityDigest',
      'stoppedResourceEvidenceDigest', 'hostObservationDigest', 'recordedAt', 'receiptDigest',
    ]);
    const authority = record ? snapshotDispatchRecoveryAuthority(record.recoveryAuthority) : null;
    if (!record || !authority || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
      || record.kind !== 'task-attempt-custody-effect-committed-release-pending-dispatch'
      || record.state !== 'COMMITTED_JOURNAL_RELEASE_PENDING' || record.custodyRootId !== this.root.rootId
      || record.custodyCapabilityEvidenceDigest !== this.root.capabilityEvidenceDigest
      || !isDigest(record.stoppedResourceEvidenceDigest) || !isDigest(record.hostObservationDigest)
      || !isTimestamp(record.recordedAt) || !isDigest(record.receiptDigest)) hold('DISPATCH_AUTHORITY_INVALID', 'read');
    const candidate = this.inspectEffectCommittedReleasePendingCandidate({ admissionRef: admitted.ref, policy,
      evidence: record.evidence as TaskAttemptCustodyEffectCommittedReleasePendingEvidenceV2 });
    const latestCommittedAt = this.latestEffectCommittedEvidenceTimestamp(admitted, policy, candidate.evidence);
    this.assertRecoveryAuthorityBoundToCandidate(authority, candidate.identity, record.recordedAt,
      latestCommittedAt > Date.parse(candidate.providerExitObservedAt)
        ? latestCommittedAt
        : Date.parse(candidate.providerExitObservedAt), 'read');
    const body = freezeObject({ ...candidate, schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-effect-committed-release-pending-dispatch' as const,
      state: 'COMMITTED_JOURNAL_RELEASE_PENDING' as const, custodyRootId: this.root.rootId,
      custodyCapabilityEvidenceDigest: this.root.capabilityEvidenceDigest, recoveryAuthority: authority,
      recoveryAuthorityDigest: dispatchRecoveryAuthorityDigest(authority, policy.jsonBounds),
      stoppedResourceEvidenceDigest: record.stoppedResourceEvidenceDigest as Sha256Digest,
      hostObservationDigest: record.hostObservationDigest as Sha256Digest, recordedAt: record.recordedAt });
    const result = freezeObject({ ...body, receiptDigest: taskAttemptCustodyDigest(
      'effect-committed-release-pending-dispatch', body, policy.jsonBounds) });
    if (!sameBytes(observed.bytes, canonicalTaskAttemptCustodyJson(result, policy.jsonBounds))) hold('DISPATCH_AUTHORITY_INVALID', 'read');
    return result;
  }

  retainEffectCommittedReleasePendingDispatch(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly evidence: TaskAttemptCustodyEffectCommittedReleasePendingEvidenceV2;
    readonly recoveryAuthority: TaskAttemptCustodyDispatchRecoveryAuthorityV2;
    readonly recordedAt: string;
    readonly stoppedResourceEvidenceDigest: Sha256Digest;
    readonly hostObservationDigest: Sha256Digest;
  }): TaskAttemptCustodyEffectCommittedReleasePendingDispatchV2 {
    const row = requireExactDataRecord(input, ['admissionRef', 'policy', 'evidence', 'recoveryAuthority',
      'recordedAt', 'stoppedResourceEvidenceDigest', 'hostObservationDigest'], 'DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    const policy = snapshotPolicy(row.policy);
    const admitted = this.requireDispatchAdmissionRef(row.admissionRef, policy, 'settle-dispatch');
    const authority = snapshotDispatchRecoveryAuthority(row.recoveryAuthority);
    if (!authority || !isTimestamp(row.recordedAt) || !isDigest(row.stoppedResourceEvidenceDigest)
      || !isDigest(row.hostObservationDigest)) hold('DISPATCH_REQUEST_INVALID', 'settle-dispatch');
    this.assertNoConflictingRetainedDisposition(policy,
      this.startedFailedDispatchPath(admitted.ref.identity));
    const candidate = this.inspectEffectCommittedReleasePendingCandidate({ admissionRef: admitted.ref, policy,
      evidence: row.evidence as TaskAttemptCustodyEffectCommittedReleasePendingEvidenceV2 });
    const latestCommittedAt = this.latestEffectCommittedEvidenceTimestamp(admitted, policy, candidate.evidence);
    this.assertRecoveryAuthorityBoundToCandidate(authority, candidate.identity, row.recordedAt,
      latestCommittedAt > Date.parse(candidate.providerExitObservedAt)
        ? latestCommittedAt
        : Date.parse(candidate.providerExitObservedAt), 'settle-dispatch');
    const body = freezeObject({ ...candidate, schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-effect-committed-release-pending-dispatch' as const,
      state: 'COMMITTED_JOURNAL_RELEASE_PENDING' as const, custodyRootId: this.root.rootId,
      custodyCapabilityEvidenceDigest: this.root.capabilityEvidenceDigest, recoveryAuthority: authority,
      recoveryAuthorityDigest: dispatchRecoveryAuthorityDigest(authority, policy.jsonBounds),
      stoppedResourceEvidenceDigest: row.stoppedResourceEvidenceDigest as Sha256Digest,
      hostObservationDigest: row.hostObservationDigest as Sha256Digest, recordedAt: row.recordedAt });
    const disposition = freezeObject({ ...body, receiptDigest: taskAttemptCustodyDigest(
      'effect-committed-release-pending-dispatch', body, policy.jsonBounds) });
    this.publishDispatchFirstWriter(this.effectCommittedReleasePendingDispatchPath(admitted.ref.identity),
      canonicalTaskAttemptCustodyJson(disposition, policy.jsonBounds), metadataLimit(policy), 'settle-dispatch');
    const reread = this.readEffectCommittedReleasePendingDispatch({ admissionRef: admitted.ref, policy });
    if (!reread || reread.receiptDigest !== disposition.receiptDigest) hold('DISPATCH_REQUEST_CONFLICT', 'settle-dispatch');
    return reread;
  }

  private requireDispatchAdmissionRef(
    value: unknown,
    policy: TaskAttemptCustodyPolicyV2,
    operation: TaskAttemptCustodyOperation,
  ): Extract<TaskAttemptCustodyDispatchAdmissionReadV2, { readonly state: 'admitted' }> {
    const ref = snapshotDispatchAdmissionRef(value, policy.jsonBounds);
    if (ref === null) hold('DISPATCH_AUTHORITY_INVALID', operation);
    this.assertStoreIdentity(ref.identity, operation);
    const admitted = this.readDispatchAdmission({
      dispatchRequestId: ref.dispatchRequestId,
      policy,
    });
    if (
      admitted.state !== 'admitted'
      || admitted.ref.refDigest !== ref.refDigest
      || admitted.ref.reservationReceiptDigest !== ref.reservationReceiptDigest
      || admitted.ref.admissionReceiptDigest !== ref.admissionReceiptDigest
      || admitted.ref.dispatchRequestMaterialDigest !== ref.dispatchRequestMaterialDigest
      || !sameIdentity(admitted.ref.identity, ref.identity)
    ) hold('DISPATCH_AUTHORITY_INVALID', operation);
    return admitted;
  }

  /** Restart lookup for one immutable observation class without path or receipt discovery. */
  readDispatchObservationByClass(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly observationClass: TaskAttemptCustodyDispatchObservationClass;
  }): TaskAttemptCustodyVerifiedDispatchObservationV2 | null {
    const inputRecord = requireExactDataRecord(input, [
      'admissionRef',
      'policy',
      'observationClass',
    ], 'DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    if (!isDispatchObservationClass(inputRecord.observationClass)) {
      hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    const admitted = this.requireDispatchAdmissionRef(
      inputRecord.admissionRef,
      policy,
      'read-dispatch',
    );
    return this.readOptionalDispatchObservation(
      admitted,
      policy,
      inputRecord.observationClass,
    );
  }

  private readOptionalDispatchObservation(
    admitted: Extract<
      TaskAttemptCustodyDispatchAdmissionReadV2,
      { readonly state: 'admitted' }
    >,
    policy: TaskAttemptCustodyPolicyV2,
    observationClass: TaskAttemptCustodyDispatchObservationClass,
  ): TaskAttemptCustodyVerifiedDispatchObservationV2 | null {
    const receiptPath = dispatchObservationReceiptPath(
      admitted.ref.identity,
      observationClass,
    );
    const receiptRead = this.readFirstWriterSnapshot(
      receiptPath,
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (receiptRead === null) {
      const claimRead = this.readFirstWriterSnapshot(
        dispatchObservationClaimPath(admitted.ref.identity, observationClass),
        metadataLimit(policy),
        'read-dispatch',
        'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
      );
      const bytesRead = this.readFirstWriterSnapshot(
        dispatchObservationBytesPath(admitted.ref.identity, observationClass),
        policy.artifactLimits['worker-provider-observation'],
        'read-dispatch',
        'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
      );
      if (claimRead !== null || bytesRead !== null) {
        hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
      }
      return null;
    }
    let receiptValue: unknown;
    try {
      receiptValue = JSON.parse(Buffer.from(receiptRead.bytes).toString('utf8'));
    } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    const receipt = parseDispatchObservationReceipt(receiptValue, policy.jsonBounds);
    if (
      receipt === null
      || receipt.observationClass !== observationClass
      || receipt.admissionRefDigest !== admitted.ref.refDigest
      || !sameBytes(
        receiptRead.bytes,
        canonicalTaskAttemptCustodyJson(receipt, policy.jsonBounds),
      )
    ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    return this.readDispatchObservation({
      admissionRef: admitted.ref,
      policy,
      observationClass,
      receiptDigest: receipt.receiptDigest,
    });
  }

  publishDispatchObservation(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly observationClass: TaskAttemptCustodyDispatchObservationClass;
    readonly observedAt: string;
    readonly bytes: Uint8Array;
  }): TaskAttemptCustodyDispatchObservationReceiptV2 {
    const inputRecord = requireExactDataRecord(input, [
      'admissionRef',
      'policy',
      'observationClass',
      'observedAt',
      'bytes',
    ], 'DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    const admitted = this.requireDispatchAdmissionRef(
      inputRecord.admissionRef,
      policy,
      'settle-dispatch',
    );
    if (
      !isDispatchObservationClass(inputRecord.observationClass)
      || !isTimestamp(inputRecord.observedAt)
      || Date.parse(inputRecord.observedAt) < Date.parse(admitted.admission.admittedAt)
    ) {
      hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const observationClass = inputRecord.observationClass;
    this.assertAttemptNotRetained(admitted.ref.identity, policy, 'settle-dispatch');
    if (
      observationClass === 'PROVIDER_START'
      || observationClass === 'PROVIDER_EXECUTION'
      || observationClass === 'PROVIDER_EXIT'
      || observationClass === 'EFFECT_DIAGNOSTIC'
    ) {
      // Provider lifecycle observations are downstream of release. readDispatchAuthority
      // deliberately consumes neither class, so this gate cannot recurse through them.
      const dispatchAuthority = this.readDispatchAuthority({
        admissionRef: admitted.ref,
        policy,
      });
      if (
        dispatchAuthority.state !== 'terminal'
        || dispatchAuthority.authority.state !== 'RELEASED'
      ) hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
      if (
        Date.parse(inputRecord.observedAt) < Date.parse(dispatchAuthority.authority.recordedAt)
        || Date.parse(inputRecord.observedAt)
          < Date.parse(dispatchAuthority.authority.releaseEvidence.releasedAt)
      ) {
        hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
      }
      const current = this.readOptionalDispatchObservation(
        admitted,
        policy,
        observationClass,
      );
      if (current === null) {
        const observedUnixMs = intrinsicReflectApply(
          intrinsicDateParse,
          Date,
          [inputRecord.observedAt],
        ) as number;
        const providerStart = observationClass === 'PROVIDER_START'
          ? null
          : this.readOptionalDispatchObservation(admitted, policy, 'PROVIDER_START');
        const providerExecution = observationClass === 'PROVIDER_EXECUTION'
          ? null
          : this.readOptionalDispatchObservation(admitted, policy, 'PROVIDER_EXECUTION');
        const providerExit = observationClass === 'PROVIDER_EXIT'
          ? null
          : this.readOptionalDispatchObservation(admitted, policy, 'PROVIDER_EXIT');
        if (
          (observationClass === 'PROVIDER_START'
            && (providerExecution !== null || providerExit !== null))
          || (observationClass === 'PROVIDER_EXECUTION'
            && (providerStart === null || providerExit !== null))
          || (observationClass === 'PROVIDER_EXIT'
            && (providerStart === null || providerExecution === null))
          || (observationClass === 'EFFECT_DIAGNOSTIC'
            && (providerStart === null || providerExecution === null || providerExit === null))
        ) {
          hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
        }
        if (
          (providerStart !== null
            && observedUnixMs < (intrinsicReflectApply(
              intrinsicDateParse,
              Date,
              [providerStart.receipt.observedAt],
            ) as number))
          || (providerExecution !== null
            && observedUnixMs < (intrinsicReflectApply(
              intrinsicDateParse,
              Date,
              [providerExecution.receipt.observedAt],
            ) as number))
          || (providerExit !== null
            && observedUnixMs < (intrinsicReflectApply(
              intrinsicDateParse,
              Date,
              [providerExit.receipt.observedAt],
            ) as number))
        ) {
          hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
        }
      }
    }
    const bytes = snapshotAuthorityBytes(
      inputRecord.bytes,
      'DISPATCH_AUTHORITY_INVALID',
      'settle-dispatch',
    );
    const observationLimit = policy.artifactLimits['worker-provider-observation'];
    assertBytesWithinLimit(bytes, observationLimit);
    const bytesPath = dispatchObservationBytesPath(
      admitted.ref.identity,
      observationClass,
    );
    const claimPath = dispatchObservationClaimPath(
      admitted.ref.identity,
      observationClass,
    );
    const receiptPath = dispatchObservationReceiptPath(
      admitted.ref.identity,
      observationClass,
    );
    const candidateClaim = createDispatchObservationClaim({
      observationClass,
      admissionRefDigest: admitted.ref.refDigest,
      observedAt: inputRecord.observedAt,
      bytes,
    }, policy.jsonBounds);
    const preexistingClaim = this.readFirstWriterSnapshot(
      claimPath,
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    const preexistingBytes = this.readFirstWriterSnapshot(
      bytesPath,
      observationLimit,
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    const preexistingReceipt = this.readFirstWriterSnapshot(
      receiptPath,
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (
      preexistingClaim === null
      && (preexistingBytes !== null || preexistingReceipt !== null)
    ) {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    if (preexistingReceipt !== null && preexistingBytes === null) {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'settle-dispatch');
    }
    if (preexistingClaim !== null) {
      let value: unknown;
      try { value = JSON.parse(Buffer.from(preexistingClaim.bytes).toString('utf8')); } catch {
        return hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
      }
      const claim = parseDispatchObservationClaim(value, policy.jsonBounds);
      if (
        claim === null
        || claim.claimDigest !== candidateClaim.claimDigest
        || !sameBytes(
          preexistingClaim.bytes,
          canonicalTaskAttemptCustodyJson(claim, policy.jsonBounds),
        )
      ) hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    if (preexistingBytes !== null && !sameBytes(preexistingBytes.bytes, bytes)) {
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    const authorityDirectory = dispatchAuthorityDirectory(admitted.ref.identity);
    const observationsDirectory = childPath(authorityDirectory, 'observations');
    const classDirectory = dispatchObservationDirectory(
      admitted.ref.identity,
      observationClass,
    );
    this.ensureDispatchPrivateDirectory(authorityDirectory, 'settle-dispatch');
    this.ensureDispatchPrivateDirectory(observationsDirectory, 'settle-dispatch');
    this.ensureDispatchPrivateDirectory(classDirectory, 'settle-dispatch');
    const persistedClaim = this.publishDispatchFirstWriter(
      claimPath,
      canonicalTaskAttemptCustodyJson(candidateClaim, policy.jsonBounds),
      metadataLimit(policy),
      'settle-dispatch',
    );
    let persistedClaimValue: unknown;
    try { persistedClaimValue = JSON.parse(Buffer.from(persistedClaim.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const claim = parseDispatchObservationClaim(persistedClaimValue, policy.jsonBounds);
    if (claim?.claimDigest !== candidateClaim.claimDigest) {
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    const persistedBytes = this.publishDispatchFirstWriter(
      bytesPath,
      bytes,
      observationLimit,
      'settle-dispatch',
    );
    if (!sameBytes(persistedBytes.bytes, bytes)) {
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    const candidate = createDispatchObservationReceipt({
      observationClass,
      admissionRefDigest: admitted.ref.refDigest,
      observedAt: inputRecord.observedAt,
      bytes,
    }, policy.jsonBounds);
    const persistedReceipt = this.publishDispatchFirstWriter(
      receiptPath,
      canonicalTaskAttemptCustodyJson(candidate, policy.jsonBounds),
      metadataLimit(policy),
      'settle-dispatch',
    );
    let value: unknown;
    try { value = JSON.parse(Buffer.from(persistedReceipt.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const receipt = parseDispatchObservationReceipt(value, policy.jsonBounds);
    if (
      receipt === null
      || receipt.receiptDigest !== candidate.receiptDigest
      || receipt.evidenceDigest !== candidate.evidenceDigest
      || receipt.admissionRefDigest !== admitted.ref.refDigest
      || receipt.observationClass !== observationClass
      || !sameBytes(
        persistedReceipt.bytes,
        canonicalTaskAttemptCustodyJson(receipt, policy.jsonBounds),
      )
    ) hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    const verified = this.readDispatchObservation({
      admissionRef: admitted.ref,
      policy,
      observationClass,
      receiptDigest: receipt.receiptDigest,
    });
    if (!sameBytes(verified.bytes, bytes)) {
      hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    return verified.receipt;
  }

  readDispatchObservation(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly observationClass: TaskAttemptCustodyDispatchObservationClass;
    readonly receiptDigest: Sha256Digest;
  }): TaskAttemptCustodyVerifiedDispatchObservationV2 {
    const inputRecord = requireExactDataRecord(input, [
      'admissionRef',
      'policy',
      'observationClass',
      'receiptDigest',
    ], 'DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    const admitted = this.requireDispatchAdmissionRef(
      inputRecord.admissionRef,
      policy,
      'read-dispatch',
    );
    if (
      !isDispatchObservationClass(inputRecord.observationClass)
      || !isDigest(inputRecord.receiptDigest)
    ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    const observationClass = inputRecord.observationClass;
    const observationLimit = policy.artifactLimits['worker-provider-observation'];
    const claimRead = this.readFirstWriterSnapshot(
      dispatchObservationClaimPath(admitted.ref.identity, observationClass),
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    const bytes = this.readFirstWriterSnapshot(
      dispatchObservationBytesPath(admitted.ref.identity, observationClass),
      observationLimit,
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    const receiptRead = this.readFirstWriterSnapshot(
      dispatchObservationReceiptPath(admitted.ref.identity, observationClass),
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED',
    );
    if (claimRead === null || bytes === null || receiptRead === null) {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    }
    let claimValue: unknown;
    try { claimValue = JSON.parse(Buffer.from(claimRead.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    const claim = parseDispatchObservationClaim(claimValue, policy.jsonBounds);
    let value: unknown;
    try { value = JSON.parse(Buffer.from(receiptRead.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    const receipt = parseDispatchObservationReceipt(value, policy.jsonBounds);
    if (
      claim === null
      || claim.observationClass !== observationClass
      || claim.admissionRefDigest !== admitted.ref.refDigest
      || claim.rawBytesDigest !== rawSha256(bytes.bytes)
      || claim.byteLength !== bytes.bytes.byteLength
      || !sameBytes(
        claimRead.bytes,
        canonicalTaskAttemptCustodyJson(claim, policy.jsonBounds),
      )
      || receipt === null
      || receipt.observationClass !== observationClass
      || receipt.admissionRefDigest !== admitted.ref.refDigest
      || receipt.receiptDigest !== inputRecord.receiptDigest
      || receipt.byteLength !== bytes.bytes.byteLength
      || Date.parse(receipt.observedAt) < Date.parse(admitted.admission.admittedAt)
      || receipt.observedAt !== claim.observedAt
      || receipt.evidenceDigest !== dispatchObservationEvidenceDigest({
        observationClass,
        admissionRefDigest: admitted.ref.refDigest,
        observedAt: receipt.observedAt,
        rawBytesDigest: rawSha256(bytes.bytes),
        byteLength: bytes.bytes.byteLength,
      }, policy.jsonBounds)
      || !sameBytes(
        receiptRead.bytes,
        canonicalTaskAttemptCustodyJson(receipt, policy.jsonBounds),
      )
    ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    return freezeObject({
      receipt,
      bytes: Uint8Array.from(bytes.bytes),
    });
  }

  private dispatchMountObservation(
    admission: TaskAttemptCustodyAdmissionV2,
    policy: TaskAttemptCustodyPolicyV2,
  ): Readonly<{
    readonly state: 'ABSENT' | 'INTENT_ONLY' | 'OUTCOME_CONFIRMED';
    readonly descriptor: DurableEffectDescriptor;
    readonly intent: TaskAttemptCustodyDurableEffectMarker | null;
    readonly outcome: TaskAttemptCustodyDurableEffectMarker | null;
  }> {
    const scopeDigest = attemptAccessScopeDigest(
      admission.identity,
      admission.receiptDigest,
      policy,
    );
    const descriptor = this.durableEffectDescriptor({
      identity: admission.identity,
      admissionReceiptDigest: admission.receiptDigest,
      policy,
      scopeDigest,
      operation: 'MOUNT',
      target: admission.workerOutputDirectory.relativePath,
      contentDigest: taskAttemptCustodyDigest('mount-capability-authority', {
        taskSnapshotRelativePath: admission.taskSnapshot.relativePath,
        workerOutputRelativePath: admission.workerOutputDirectory.relativePath,
        scopeDigest,
      }, policy.jsonBounds),
      sequence: 0,
    });
    const intent = this.readDurableEffectMarker(descriptor, 'INTENT', policy);
    const outcome = this.readDurableEffectMarker(descriptor, 'OUTCOME', policy);
    if (outcome !== null && intent === null) {
      hold('DISPATCH_RESERVATION_RECONCILIATION_REQUIRED', 'read-dispatch');
    }
    return freezeObject({
      state: outcome !== null
        ? 'OUTCOME_CONFIRMED' as const
        : intent !== null
          ? 'INTENT_ONLY' as const
          : 'ABSENT' as const,
      descriptor,
      intent,
      outcome,
    });
  }

  private readDispatchTerminalRecord(
    identity: TaskAttemptCustodyIdentityV2,
    policy: TaskAttemptCustodyPolicyV2,
  ): TaskAttemptCustodyDispatchTerminalAuthorityV2 | null {
    const observed = this.readFirstWriterSnapshot(
      dispatchTerminalPath(identity),
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_AUTHORITY_INVALID',
    );
    if (observed === null) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    const authority = parseDispatchTerminalAuthority(value, policy);
    if (
      authority === null
      || !sameIdentity(authority.admissionRef.identity, identity)
      || !sameBytes(
        observed.bytes,
        canonicalTaskAttemptCustodyJson(authority, policy.jsonBounds),
      )
    ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    return authority;
  }

  private readDispatchReconciliationRecord(
    identity: TaskAttemptCustodyIdentityV2,
    policy: TaskAttemptCustodyPolicyV2,
  ): TaskAttemptCustodyDispatchReconciliationV2 | null {
    const observed = this.readFirstWriterSnapshot(
      dispatchReconciliationPath(identity),
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_AUTHORITY_INVALID',
    );
    if (observed === null) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    const reconciliation = parseDispatchReconciliation(value, policy);
    if (
      reconciliation === null
      || !sameIdentity(reconciliation.admissionRef.identity, identity)
      || !sameBytes(
        observed.bytes,
        canonicalTaskAttemptCustodyJson(reconciliation, policy.jsonBounds),
      )
    ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    return reconciliation;
  }

  private readPhysicalTransitionRecord(
    identity: TaskAttemptCustodyIdentityV2,
    policy: TaskAttemptCustodyPolicyV2,
  ): TaskAttemptCustodyPhysicalTransitionV2 | null {
    const observed = this.readFirstWriterSnapshot(
      physicalTransitionPath(identity),
      metadataLimit(policy),
      'read-dispatch',
      'DISPATCH_AUTHORITY_INVALID',
    );
    if (observed === null) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    const transition = parsePhysicalTransition(value, policy);
    if (
      transition === null
      || !sameIdentity(transition.identity, identity)
      || !sameBytes(
        observed.bytes,
        canonicalTaskAttemptCustodyJson(transition, policy.jsonBounds),
      )
    ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    const admission = this.readAdmission(identity, policy);
    if (
      admission === null
      || admission.receiptDigest !== transition.admissionReceiptDigest
    ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    return transition;
  }

  private claimPhysicalTransition(input: {
    readonly admission: TaskAttemptCustodyAdmissionV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly state: TaskAttemptCustodyPhysicalTransitionV2['state'];
    readonly reasonCode: TaskAttemptCustodyNotDispatchedReasonCode | null;
    readonly noEffectObservationBindingDigest: Sha256Digest | null;
  }): TaskAttemptCustodyPhysicalTransitionV2 {
    const claimBody = {
      state: input.state,
      identity: cloneIdentity(input.admission.identity),
      admissionReceiptDigest: input.admission.receiptDigest,
      policyDigest: input.policy.policyDigest,
      reasonCode: input.reasonCode,
      noEffectObservationBindingDigest: input.noEffectObservationBindingDigest,
    };
    if (
      input.state === 'MOUNT_CLAIMED'
        ? input.reasonCode !== null || input.noEffectObservationBindingDigest !== null
        : !TASK_ATTEMPT_CUSTODY_NOT_DISPATCHED_REASON_CODES.includes(
          input.reasonCode as TaskAttemptCustodyNotDispatchedReasonCode,
        ) || !isDigest(input.noEffectObservationBindingDigest)
    ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const claimDigest = physicalTransitionClaimDigest(claimBody, input.policy.jsonBounds);
    const withoutReceipt = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-physical-transition' as const,
      ...claimBody,
      claimDigest,
    };
    const candidate: TaskAttemptCustodyPhysicalTransitionV2 = freezeObject({
      ...withoutReceipt,
      receiptDigest: physicalTransitionReceiptDigest(
        withoutReceipt,
        input.policy.jsonBounds,
      ),
    });
    this.ensureDispatchPrivateDirectory(
      dispatchAuthorityDirectory(input.admission.identity),
      input.state === 'MOUNT_CLAIMED' ? 'resolve-mount' : 'settle-dispatch',
    );
    const observed = this.publishDispatchFirstWriter(
      physicalTransitionPath(input.admission.identity),
      canonicalTaskAttemptCustodyJson(candidate, input.policy.jsonBounds),
      metadataLimit(input.policy),
      input.state === 'MOUNT_CLAIMED' ? 'resolve-mount' : 'settle-dispatch',
    );
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const persisted = parsePhysicalTransition(value, input.policy);
    if (
      persisted === null
      || persisted.claimDigest !== claimDigest
      || persisted.state !== input.state
    ) hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
    return persisted;
  }

  settleReleasedDispatch(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly mountTransferReceipt: TaskAttemptCustodyBackendMountTransferReceipt;
    readonly releaseEvidence: Readonly<{
      readonly containerId: string;
      readonly imageDigest: Sha256Digest;
      readonly mountReceiptDigest: Sha256Digest;
      readonly mountTransferEvidenceDigest: Sha256Digest;
      readonly daemonAuthorityLabelDigest: Sha256Digest;
      readonly releaseNonceDigest: Sha256Digest;
      readonly providerInvocationDigest: Sha256Digest;
      readonly gateAckReceiptDigest: Sha256Digest;
      readonly gateAckEvidenceDigest: Sha256Digest;
      readonly releasedAt: string;
      readonly ackMethod: TaskAttemptCustodyReleaseAckMethod;
      readonly ackStatus: 'ACKNOWLEDGED';
    }>;
    readonly recordedAt: string;
  }): TaskAttemptCustodyDispatchReleasedAuthorityV2 {
    const inputRecord = requireExactDataRecord(input, [
      'admissionRef',
      'policy',
      'mountTransferReceipt',
      'releaseEvidence',
      'recordedAt',
    ], 'DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    const admitted = this.requireDispatchAdmissionRef(
      inputRecord.admissionRef,
      policy,
      'settle-dispatch',
    );
    if (!isTimestamp(inputRecord.recordedAt)) {
      hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const mount = this.dispatchMountObservation(admitted.admission, policy);
    if (mount.state !== 'OUTCOME_CONFIRMED' || mount.outcome === null) {
      hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
    }
    const physicalTransition = this.readPhysicalTransitionRecord(
      admitted.ref.identity,
      policy,
    );
    if (physicalTransition?.state !== 'MOUNT_CLAIMED') {
      hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
    }
    const transfer = snapshotBackendMountTransferReceipt(
      inputRecord.mountTransferReceipt,
      {
        rootId: this.root.rootId,
        scopeDigest: mount.descriptor.scopeDigest,
        effectOpDigest: mount.descriptor.opDigest,
        attemptId: admitted.ref.identity.attemptId,
        generation: admitted.ref.identity.generation,
      },
    );
    if (
      transfer.state !== 'CONSUMED'
      || transfer.backendExecutionId === null
      || transfer.backendImageDigest === null
      || transfer.backendAuthorityLabelDigest === null
      || mount.outcome.effectReceiptDigest !== transfer.receiptDigest
      || mount.outcome.effectEvidenceDigest !== transfer.transferEvidenceDigest
    ) hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
    const releaseEvidence = createDispatchReleaseEvidence(
      inputRecord.releaseEvidence,
      policy.jsonBounds,
    );
    if (
      releaseEvidence.containerId !== transfer.backendExecutionId
      || releaseEvidence.imageDigest !== transfer.backendImageDigest
      || releaseEvidence.daemonAuthorityLabelDigest !== transfer.backendAuthorityLabelDigest
      || releaseEvidence.mountReceiptDigest !== transfer.receiptDigest
      || releaseEvidence.mountTransferEvidenceDigest !== transfer.transferEvidenceDigest
      || Date.parse(releaseEvidence.releasedAt) < Date.parse(admitted.admission.admittedAt)
      || Date.parse(inputRecord.recordedAt) < Date.parse(releaseEvidence.releasedAt)
    ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const gateAckObservation = this.readDispatchObservation({
      admissionRef: admitted.ref,
      policy,
      observationClass: 'GATE_ACK',
      receiptDigest: releaseEvidence.gateAckReceiptDigest,
    });
    if (
      gateAckObservation.receipt.evidenceDigest !== releaseEvidence.gateAckEvidenceDigest
      || Date.parse(gateAckObservation.receipt.observedAt)
        > Date.parse(releaseEvidence.releasedAt)
      || Date.parse(gateAckObservation.receipt.observedAt)
        > Date.parse(inputRecord.recordedAt)
    ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const existing = this.readDispatchTerminalRecord(admitted.ref.identity, policy);
    if (existing !== null) {
      if (
        existing.state === 'RELEASED'
        && existing.releaseReceiptDigest === releaseEvidence.receiptDigest
      ) return existing;
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    const providerExecutionAttempt = dispatchProviderExecutionAttempt(
      admitted.ref,
      releaseEvidence.containerId,
      releaseEvidence,
      policy.jsonBounds,
    );
    if (providerExecutionAttempt.providerExecutionAttemptId === admitted.ref.identity.attemptId) {
      hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const projectionFence = dispatchProjectionFence({
      admissionRefDigest: admitted.ref.refDigest,
      state: 'RELEASED',
      mountReceiptDigest: transfer.receiptDigest,
      releaseReceiptDigest: releaseEvidence.receiptDigest,
      providerExecutionAttemptDigest: providerExecutionAttempt.identityDigest,
      noEffectEvidenceDigest: null,
    }, policy.jsonBounds);
    const body: Omit<TaskAttemptCustodyDispatchReleasedAuthorityV2, 'receiptDigest'> = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-dispatch-authority',
      state: 'RELEASED',
      admissionRef: admitted.ref,
      attemptCount: 1,
      providerExecutionAttempt,
      backendExecutionId: releaseEvidence.containerId,
      mountReceiptDigest: transfer.receiptDigest,
      mountTransferEvidenceDigest: transfer.transferEvidenceDigest,
      releaseEvidence,
      releaseReceiptDigest: releaseEvidence.receiptDigest,
      releaseEvidenceDigest: releaseEvidence.evidenceDigest,
      noEffectEvidence: null,
      reasonCode: null,
      projectionFence,
      recordedAt: inputRecord.recordedAt,
    };
    const candidate: TaskAttemptCustodyDispatchReleasedAuthorityV2 = freezeObject({
      ...body,
      receiptDigest: dispatchTerminalReceiptDigest(body, policy.jsonBounds),
    });
    this.ensureDispatchPrivateDirectory(
      dispatchAuthorityDirectory(admitted.ref.identity),
      'settle-dispatch',
    );
    const observed = this.publishDispatchFirstWriter(
      dispatchTerminalPath(admitted.ref.identity),
      canonicalTaskAttemptCustodyJson(candidate, policy.jsonBounds),
      metadataLimit(policy),
      'settle-dispatch',
    );
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const persisted = parseDispatchTerminalAuthority(value, policy);
    if (persisted?.state !== 'RELEASED') {
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    if (persisted.releaseReceiptDigest !== releaseEvidence.receiptDigest) {
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    return persisted;
  }

  settleNotDispatched(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly reasonCode: TaskAttemptCustodyNotDispatchedReasonCode;
    readonly noEffectObservation: TaskAttemptCustodyDispatchNoEffectObservationV2;
  }): TaskAttemptCustodyDispatchNotDispatchedAuthorityV2 {
    const inputRecord = requireExactDataRecord(input, [
      'admissionRef',
      'policy',
      'reasonCode',
      'noEffectObservation',
    ], 'DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    const admitted = this.requireDispatchAdmissionRef(
      inputRecord.admissionRef,
      policy,
      'settle-dispatch',
    );
    if (!TASK_ATTEMPT_CUSTODY_NOT_DISPATCHED_REASON_CODES.includes(
      inputRecord.reasonCode as TaskAttemptCustodyNotDispatchedReasonCode,
    )) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const mount = this.dispatchMountObservation(admitted.admission, policy);
    if (mount.state !== 'ABSENT') {
      hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
    }
    const noEffectEvidence = createNoEffectEvidence(
      admitted.ref,
      inputRecord.noEffectObservation,
      policy.jsonBounds,
    );
    if (Date.parse(noEffectEvidence.verifiedAt) < Date.parse(admitted.admission.admittedAt)) {
      hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const durableNoEffectObservation = this.readDispatchObservation({
      admissionRef: admitted.ref,
      policy,
      observationClass: 'NO_EFFECT',
      receiptDigest: noEffectEvidence.observation.observationReceiptDigest,
    });
    if (
      durableNoEffectObservation.receipt.evidenceDigest
        !== noEffectEvidence.observation.observationEvidenceDigest
      || Date.parse(durableNoEffectObservation.receipt.observedAt)
        > Date.parse(noEffectEvidence.verifiedAt)
    ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const existing = this.readDispatchTerminalRecord(admitted.ref.identity, policy);
    if (existing !== null) {
      if (
        existing.state === 'NOT_DISPATCHED'
        && existing.reasonCode === inputRecord.reasonCode
        && existing.noEffectEvidence.observationBindingDigest
          === noEffectEvidence.observationBindingDigest
      ) {
        const transition = this.readPhysicalTransitionRecord(admitted.ref.identity, policy);
        if (
          transition?.state === 'NOT_DISPATCHED_CLAIMED'
          && transition.reasonCode === existing.reasonCode
          && transition.noEffectObservationBindingDigest
            === existing.noEffectEvidence.observationBindingDigest
        ) return existing;
        hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
      }
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    this.claimPhysicalTransition({
      admission: admitted.admission,
      policy,
      state: 'NOT_DISPATCHED_CLAIMED',
      reasonCode: inputRecord.reasonCode as TaskAttemptCustodyNotDispatchedReasonCode,
      noEffectObservationBindingDigest: noEffectEvidence.observationBindingDigest,
    });
    const projectionFence = dispatchProjectionFence({
      admissionRefDigest: admitted.ref.refDigest,
      state: 'NOT_DISPATCHED',
      mountReceiptDigest: null,
      releaseReceiptDigest: null,
      providerExecutionAttemptDigest: null,
      noEffectEvidenceDigest: noEffectEvidence.evidenceDigest,
    }, policy.jsonBounds);
    const body: Omit<TaskAttemptCustodyDispatchNotDispatchedAuthorityV2, 'receiptDigest'> = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-dispatch-authority',
      state: 'NOT_DISPATCHED',
      admissionRef: admitted.ref,
      attemptCount: 0,
      providerExecutionAttempt: null,
      backendExecutionId: null,
      mountReceiptDigest: null,
      mountTransferEvidenceDigest: null,
      releaseEvidence: null,
      releaseReceiptDigest: null,
      releaseEvidenceDigest: null,
      noEffectEvidence,
      reasonCode: inputRecord.reasonCode as TaskAttemptCustodyNotDispatchedReasonCode,
      projectionFence,
      recordedAt: noEffectEvidence.verifiedAt,
    };
    const candidate: TaskAttemptCustodyDispatchNotDispatchedAuthorityV2 = freezeObject({
      ...body,
      receiptDigest: dispatchTerminalReceiptDigest(body, policy.jsonBounds),
    });
    this.ensureDispatchPrivateDirectory(
      dispatchAuthorityDirectory(admitted.ref.identity),
      'settle-dispatch',
    );
    const observed = this.publishDispatchFirstWriter(
      dispatchTerminalPath(admitted.ref.identity),
      canonicalTaskAttemptCustodyJson(candidate, policy.jsonBounds),
      metadataLimit(policy),
      'settle-dispatch',
    );
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const persisted = parseDispatchTerminalAuthority(value, policy);
    if (
      persisted?.state !== 'NOT_DISPATCHED'
      || persisted.noEffectEvidence.observationBindingDigest
        !== noEffectEvidence.observationBindingDigest
      || persisted.reasonCode !== inputRecord.reasonCode
    ) hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    return persisted;
  }

  recordAmbiguousDispatch(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly reasonCode: TaskAttemptCustodyAmbiguousReasonCode;
    readonly reconciliationEvidence: Readonly<{
      readonly containerState: 'ABSENT' | 'PRESENT' | 'UNKNOWN';
      readonly containerId: string | null;
      readonly imageDigest: Sha256Digest | null;
      readonly mountReceiptDigest: Sha256Digest | null;
      readonly releaseState: 'NOT_ATTEMPTED' | 'UNCONFIRMED' | 'ACKNOWLEDGED' | 'UNKNOWN';
      readonly releaseNonceDigest: Sha256Digest | null;
      readonly providerInvocationDigest: Sha256Digest | null;
      readonly containmentEvidenceDigest: Sha256Digest;
      readonly backendProbeEvidenceDigest: Sha256Digest;
      readonly observationReceiptDigest: Sha256Digest;
      readonly observationEvidenceDigest: Sha256Digest;
      readonly observedAt: string;
    }>;
  }): TaskAttemptCustodyDispatchReconciliationV2 {
    const inputRecord = requireExactDataRecord(input, [
      'admissionRef',
      'policy',
      'reasonCode',
      'reconciliationEvidence',
    ], 'DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    const admitted = this.requireDispatchAdmissionRef(
      inputRecord.admissionRef,
      policy,
      'settle-dispatch',
    );
    if (
      !TASK_ATTEMPT_CUSTODY_AMBIGUOUS_REASON_CODES.includes(
        inputRecord.reasonCode as TaskAttemptCustodyAmbiguousReasonCode,
      )
    ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    if (this.readDispatchTerminalRecord(admitted.ref.identity, policy) !== null) {
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    if (
      this.readPhysicalTransitionRecord(admitted.ref.identity, policy)?.state
        !== 'MOUNT_CLAIMED'
    ) hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
    const mount = this.dispatchMountObservation(admitted.admission, policy);
    const reconciliationEvidence = createDispatchReconciliationEvidence(
      admitted.ref,
      mount.state,
      inputRecord.reconciliationEvidence,
      policy.jsonBounds,
    );
    const durableReconciliationObservation = this.readDispatchObservation({
      admissionRef: admitted.ref,
      policy,
      observationClass: 'RECONCILIATION',
      receiptDigest: reconciliationEvidence.observationReceiptDigest,
    });
    if (
      Date.parse(reconciliationEvidence.observedAt) < Date.parse(admitted.admission.admittedAt)
      || durableReconciliationObservation.receipt.evidenceDigest
        !== reconciliationEvidence.observationEvidenceDigest
      || Date.parse(durableReconciliationObservation.receipt.observedAt)
        > Date.parse(reconciliationEvidence.observedAt)
      || (
        mount.state === 'OUTCOME_CONFIRMED'
        && mount.outcome?.effectReceiptDigest !== reconciliationEvidence.mountReceiptDigest
      )
    ) hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    const reasonCode = inputRecord.reasonCode as TaskAttemptCustodyAmbiguousReasonCode;
    if (
      (reasonCode === 'PRE_MOUNT_RECONCILIATION_REQUIRED' && mount.state !== 'ABSENT')
      || (reasonCode === 'MOUNT_RECONCILIATION_REQUIRED' && mount.state !== 'INTENT_ONLY')
      || (reasonCode === 'PROVIDER_RELEASE_UNCONFIRMED'
        && (
          mount.state !== 'OUTCOME_CONFIRMED'
          || reconciliationEvidence.containerState !== 'PRESENT'
          || reconciliationEvidence.releaseState !== 'UNCONFIRMED'
        ))
    ) hold('DISPATCH_TRANSITION_INVALID', 'settle-dispatch');
    const reconciliationRef = taskAttemptCustodyDigest(
      'dispatch-reconciliation-ref',
      {
        admissionRefDigest: admitted.ref.refDigest,
        mountEffectState: mount.state,
        reasonCode,
        evidenceDigest: reconciliationEvidence.evidenceDigest,
      },
      policy.jsonBounds,
    );
    const withoutReceipt = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-dispatch-reconciliation' as const,
      state: 'AMBIGUOUS' as const,
      admissionRef: admitted.ref,
      mountEffectState: mount.state,
      reasonCode,
      reconciliationEvidence,
      evidenceDigest: reconciliationEvidence.evidenceDigest,
      recordedAt: reconciliationEvidence.observedAt,
      reconciliationRef,
    };
    const candidate: TaskAttemptCustodyDispatchReconciliationV2 = freezeObject({
      ...withoutReceipt,
      receiptDigest: dispatchReconciliationReceiptDigest(
        withoutReceipt,
        policy.jsonBounds,
      ),
    });
    const existing = this.readDispatchReconciliationRecord(admitted.ref.identity, policy);
    if (existing !== null) {
      if (existing.reconciliationRef === reconciliationRef) return existing;
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    this.ensureDispatchPrivateDirectory(
      dispatchAuthorityDirectory(admitted.ref.identity),
      'settle-dispatch',
    );
    const observed = this.publishDispatchFirstWriter(
      dispatchReconciliationPath(admitted.ref.identity),
      canonicalTaskAttemptCustodyJson(candidate, policy.jsonBounds),
      metadataLimit(policy),
      'settle-dispatch',
    );
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('DISPATCH_AUTHORITY_INVALID', 'settle-dispatch');
    }
    const persisted = parseDispatchReconciliation(value, policy);
    if (persisted?.reconciliationRef !== reconciliationRef) {
      hold('DISPATCH_AUTHORITY_CONFLICT', 'settle-dispatch');
    }
    return persisted;
  }

  readDispatchAuthority(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
  }): TaskAttemptCustodyDispatchAuthorityReadV2 {
    const inputRecord = requireExactDataRecord(input, [
      'admissionRef',
      'policy',
    ], 'DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    const policy = snapshotPolicy(inputRecord.policy);
    const admitted = this.requireDispatchAdmissionRef(
      inputRecord.admissionRef,
      policy,
      'read-dispatch',
    );
    const authority = this.readDispatchTerminalRecord(admitted.ref.identity, policy);
    const reconciliation = this.readDispatchReconciliationRecord(
      admitted.ref.identity,
      policy,
    );
    const mount = this.dispatchMountObservation(admitted.admission, policy);
    const transition = this.readPhysicalTransitionRecord(admitted.ref.identity, policy);
    if (reconciliation !== null) {
      const durableReconciliationObservation = this.readDispatchObservation({
        admissionRef: admitted.ref,
        policy,
        observationClass: 'RECONCILIATION',
        receiptDigest: reconciliation.reconciliationEvidence.observationReceiptDigest,
      });
      if (
        durableReconciliationObservation.receipt.evidenceDigest
          !== reconciliation.reconciliationEvidence.observationEvidenceDigest
        || Date.parse(durableReconciliationObservation.receipt.observedAt)
          > Date.parse(reconciliation.recordedAt)
      ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    if (authority === null) {
      if (reconciliation !== null) {
        if (
          transition?.state !== 'MOUNT_CLAIMED'
          || reconciliation.admissionRef.refDigest !== admitted.ref.refDigest
          || reconciliation.mountEffectState !== mount.state
        ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
        return freezeObject({ state: 'ambiguous' as const, reconciliation });
      }
      if (transition !== null) {
        if (
          transition.state === 'NOT_DISPATCHED_CLAIMED' && mount.state !== 'ABSENT'
        ) hold('DISPATCH_TRANSITION_INVALID', 'read-dispatch');
        return freezeObject({
          state: 'transition-pending' as const,
          transition,
          mountEffectState: mount.state,
          reconciliationRef: taskAttemptCustodyDigest(
            'physical-transition-pending-reconciliation',
            {
              transitionReceiptDigest: transition.receiptDigest,
              mountEffectState: mount.state,
            },
            policy.jsonBounds,
          ),
        });
      }
      if (mount.state !== 'ABSENT') {
        hold('DISPATCH_TRANSITION_INVALID', 'read-dispatch');
      }
      return freezeObject({ state: 'absent' as const, admissionRef: admitted.ref });
    }
    if (authority.admissionRef.refDigest !== admitted.ref.refDigest) {
      hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    }
    if (authority.state === 'RELEASED') {
      const gateAckObservation = this.readDispatchObservation({
        admissionRef: admitted.ref,
        policy,
        observationClass: 'GATE_ACK',
        receiptDigest: authority.releaseEvidence.gateAckReceiptDigest,
      });
      if (
        transition?.state !== 'MOUNT_CLAIMED'
        || mount.state !== 'OUTCOME_CONFIRMED'
        || mount.outcome === null
        || mount.outcome.effectReceiptDigest !== authority.mountReceiptDigest
        || mount.outcome.effectEvidenceDigest !== authority.mountTransferEvidenceDigest
        || gateAckObservation.receipt.evidenceDigest
          !== authority.releaseEvidence.gateAckEvidenceDigest
        || Date.parse(gateAckObservation.receipt.observedAt)
          > Date.parse(authority.releaseEvidence.releasedAt)
        || Date.parse(gateAckObservation.receipt.observedAt)
          > Date.parse(authority.recordedAt)
      ) hold('DISPATCH_AUTHORITY_INVALID', 'read-dispatch');
    } else {
      const durableNoEffectObservation = this.readDispatchObservation({
        admissionRef: admitted.ref,
        policy,
        observationClass: 'NO_EFFECT',
        receiptDigest: authority.noEffectEvidence.observation.observationReceiptDigest,
      });
      if (
        mount.state !== 'ABSENT'
        || reconciliation !== null
        || transition?.state !== 'NOT_DISPATCHED_CLAIMED'
        || transition.reasonCode !== authority.reasonCode
        || transition.noEffectObservationBindingDigest
          !== authority.noEffectEvidence.observationBindingDigest
        || durableNoEffectObservation.receipt.evidenceDigest
          !== authority.noEffectEvidence.observation.observationEvidenceDigest
        || Date.parse(durableNoEffectObservation.receipt.observedAt)
          > Date.parse(authority.noEffectEvidence.verifiedAt)
      ) {
        hold('DISPATCH_TRANSITION_INVALID', 'read-dispatch');
      }
    }
    return freezeObject({
      state: 'terminal' as const,
      authority,
      reconciliation,
    });
  }

  createAdmission(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admittedAt: string;
    readonly predecessorDigest: Sha256Digest | null;
    readonly predecessorIdentity: TaskAttemptCustodyIdentityV2 | null;
    readonly taskSnapshot: unknown;
  }): TaskAttemptCustodyAdmissionV2 {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admittedAt',
      'predecessorDigest',
      'predecessorIdentity',
      'taskSnapshot',
    ], 'INVALID_IDENTITY', 'admit');
    const predecessorIdentity = inputRecord.predecessorIdentity === null
      ? null
      : cloneIdentity(inputRecord.predecessorIdentity as TaskAttemptCustodyIdentityV2);
    input = Object.freeze({
      identity: cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2),
      policy: snapshotPolicy(inputRecord.policy),
      admittedAt: inputRecord.admittedAt as string,
      predecessorDigest: inputRecord.predecessorDigest as Sha256Digest | null,
      predecessorIdentity,
      taskSnapshot: inputRecord.taskSnapshot,
    });
    this.assertStoreIdentity(input.identity, 'admit');
    assertPolicy(input.policy);
    if (!isTimestamp(input.admittedAt)) hold('INVALID_IDENTITY', 'admit');
    if (input.predecessorDigest !== null && !isDigest(input.predecessorDigest)) {
      hold('INVALID_IDENTITY', 'admit');
    }
    if (
      (input.identity.generation === 1
        && (input.predecessorDigest !== null || input.predecessorIdentity !== null))
      || (input.identity.generation > 1
        && (input.predecessorDigest === null || input.predecessorIdentity === null))
    ) hold('CHAIN_PREDECESSOR_MISMATCH', 'admit');
    let predecessor: TaskAttemptCustodyAdmissionV2 | null = null;
    if (input.predecessorIdentity !== null) {
      this.assertStoreIdentity(input.predecessorIdentity, 'admit');
      if (!isExactPredecessorIdentity(input.identity, input.predecessorIdentity)) {
        hold('CHAIN_PREDECESSOR_MISMATCH', 'admit');
      }
      predecessor = this.readAdmission(input.predecessorIdentity, input.policy);
      if (
        predecessor === null
        || predecessor.receiptDigest !== input.predecessorDigest
        || Date.parse(input.admittedAt) < Date.parse(predecessor.admittedAt)
      ) hold('CHAIN_PREDECESSOR_MISMATCH', 'admit');
    }
    const identity = cloneIdentity(input.identity);
    const prefix = identityPrefix(identity);
    const snapshotDirectory = childPath(prefix, 'snapshot');
    const snapshotPath = childPath(snapshotDirectory, 'task.json');
    const workerOutputDirectoryPath = childPath(prefix, 'worker-output');
    const snapshotBytes = canonicalTaskAttemptCustodyJson(
      input.taskSnapshot,
      input.policy.jsonBounds,
    );
    const admissionReceiptDigest = taskAttemptCustodyDigest(
      'admission-effect-authority',
      {
        identity,
        admittedAt: input.admittedAt,
        predecessorDigest: input.predecessorDigest,
        predecessorIdentity: input.predecessorIdentity,
        policyDigest: input.policy.policyDigest,
        taskSnapshotDigest: rawSha256(snapshotBytes),
      },
      input.policy.jsonBounds,
    );
    const admissionEffect: DurableEffectContext = Object.freeze({
      identity,
      admissionReceiptDigest,
      policy: input.policy,
      scopeDigest: taskAttemptCustodyDigest(
        'admission-effect-scope',
        { identity, admissionReceiptDigest, policyDigest: input.policy.policyDigest },
        input.policy.jsonBounds,
      ),
    });
    this.ensureAndVerifyPrivateDirectory(prefix, admissionEffect);
    this.ensureAndVerifyPrivateDirectory(snapshotDirectory, admissionEffect);
    this.ensureAndVerifyPrivateDirectory(childPath(prefix, 'artifacts'), admissionEffect);
    this.ensureAndVerifyPrivateDirectory(childPath(prefix, 'chain'), admissionEffect);
    const workerOutputDirectory = this.ensureAndVerifyPrivateDirectory(
      workerOutputDirectoryPath,
      admissionEffect,
    );

    const snapshotLimit = input.policy.artifactLimits['task-admission-snapshot'];
    const snapshotProof = this.publishAndVerify(
      snapshotPath,
      snapshotBytes,
      snapshotLimit,
      admissionEffect,
    );
    const withoutDigest = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-admission' as const,
      state: 'admitted' as const,
      identity,
      admittedAt: input.admittedAt,
      policyDigest: input.policy.policyDigest,
      predecessorDigest: input.predecessorDigest,
      predecessorIdentity: input.predecessorIdentity === null
        ? null
        : cloneIdentity(input.predecessorIdentity),
      custodyPlatform: this.root.platform,
      custodyRootId: this.root.rootId,
      custodyVolumeId: this.root.volumeId,
      custodyDirectoryId: this.root.directoryId,
      custodyCapabilityEvidenceDigest: this.root.capabilityEvidenceDigest,
      taskSnapshot: snapshotProof,
      workerOutputDirectory,
    };
    const admission: TaskAttemptCustodyAdmissionV2 = Object.freeze({
      ...withoutDigest,
      receiptDigest: admissionDigest(withoutDigest, input.policy.jsonBounds),
    });
    const bytes = canonicalTaskAttemptCustodyJson(admission, input.policy.jsonBounds);
    this.publishAndVerify(
      childPath(prefix, 'admission.json'),
      bytes,
      metadataLimit(input.policy),
      admissionEffect,
    );
    const persisted = this.readAdmission(identity, input.policy);
    if (!persisted || persisted.receiptDigest !== admission.receiptDigest) {
      hold('CORRUPT_CUSTODY_RECORD', 'admit');
    }
    return persisted;
  }

  readAdmission(
    identity: TaskAttemptCustodyIdentityV2,
    policy: TaskAttemptCustodyPolicyV2,
  ): TaskAttemptCustodyAdmissionV2 | null {
    identity = cloneIdentity(identity);
    policy = snapshotPolicy(policy);
    this.assertStoreIdentity(identity, 'read');
    assertPolicy(policy);
    let cursor = cloneIdentity(identity);
    let child: TaskAttemptCustodyAdmissionV2 | null = null;
    let requested: TaskAttemptCustodyAdmissionV2 | null = null;
    let traversed = 0;
    while (true) {
      traversed += 1;
      if (traversed > TASK_ATTEMPT_CUSTODY_MAX_LINEAGE_DEPTH) {
        hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
      }
      const admission = this.readAdmissionRecord(cursor, policy);
      if (admission === null) {
        if (child === null) return null;
        return hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
      }
      requested ??= admission;
      if (child !== null) {
        if (
          child.predecessorIdentity === null
          || child.predecessorDigest === null
          || !sameIdentity(child.predecessorIdentity, admission.identity)
          || !isExactPredecessorIdentity(child.identity, admission.identity)
          || child.predecessorDigest !== admission.receiptDigest
          || Date.parse(child.admittedAt) < Date.parse(admission.admittedAt)
        ) hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
      }
      if (admission.identity.generation === 1) return requested;
      if (
        admission.predecessorIdentity === null
        || admission.predecessorDigest === null
        || !isExactPredecessorIdentity(admission.identity, admission.predecessorIdentity)
      ) hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
      child = admission;
      cursor = admission.predecessorIdentity;
    }
  }

  private readAdmissionRecord(
    identity: TaskAttemptCustodyIdentityV2,
    policy: TaskAttemptCustodyPolicyV2,
  ): TaskAttemptCustodyAdmissionV2 | null {
    this.assertStoreIdentity(identity, 'read');
    const prefix = identityPrefix(identity);
    const path = childPath(prefix, 'admission.json');
    const expectedSnapshotPath = childPath(prefix, 'snapshot', 'task.json');
    const expectedWorkerOutputPath = childPath(prefix, 'worker-output');
    const observed = this.readFirstWriterSnapshot(path, metadataLimit(policy), 'read');
    if (observed === null) {
      const orphanedSnapshot = this.readFirstWriterSnapshot(
        expectedSnapshotPath,
        policy.artifactLimits['task-admission-snapshot'],
        'read',
      );
      const orphanedWorkerOutput = this.readPrivateDirectorySnapshot(
        expectedWorkerOutputPath,
      );
      if (orphanedSnapshot !== null || orphanedWorkerOutput !== null) {
        hold('INCOMPLETE_PUBLICATION', 'read');
      }
      return null;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const admission = parseTaskAttemptCustodyAdmissionV2(parsed, policy);
    if (
      !admission
      || !sameIdentity(admission.identity, identity)
      || admission.custodyPlatform !== this.root.platform
      || admission.custodyRootId !== this.root.rootId
      || admission.custodyVolumeId !== this.root.volumeId
      || admission.custodyDirectoryId !== this.root.directoryId
      || admission.custodyCapabilityEvidenceDigest !== this.root.capabilityEvidenceDigest
      || admission.taskSnapshot.relativePath !== expectedSnapshotPath
      || admission.workerOutputDirectory.relativePath !== expectedWorkerOutputPath
    ) {
      hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    if (!sameBytes(
      observed.bytes,
      canonicalTaskAttemptCustodyJson(admission, policy.jsonBounds),
    )) hold('CORRUPT_CUSTODY_RECORD', 'read');
    const snapshot = this.readVerifiedSnapshot(
      admission.taskSnapshot,
      policy.artifactLimits['task-admission-snapshot'],
      'read',
    );
    if (snapshot === null) hold('INCOMPLETE_PUBLICATION', 'read');
    if (!sameProof(snapshot.proof, admission.taskSnapshot)) {
      hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const workerOutputDirectory = this.readPrivateDirectorySnapshot(expectedWorkerOutputPath);
    if (workerOutputDirectory === null) hold('INCOMPLETE_PUBLICATION', 'read');
    if (!sameDirectoryProof(workerOutputDirectory, admission.workerOutputDirectory)) {
      hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    let snapshotValue: unknown;
    try { snapshotValue = JSON.parse(Buffer.from(snapshot.bytes).toString('utf8')); } catch {
      return hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const canonicalSnapshot = canonicalTaskAttemptCustodyJson(snapshotValue, policy.jsonBounds);
    if (!sameBytes(snapshot.bytes, canonicalSnapshot)) hold('CORRUPT_CUSTODY_RECORD', 'read');
    const admissionReceiptDigest = taskAttemptCustodyDigest(
      'admission-effect-authority',
      {
        identity: admission.identity,
        admittedAt: admission.admittedAt,
        predecessorDigest: admission.predecessorDigest,
        predecessorIdentity: admission.predecessorIdentity,
        policyDigest: policy.policyDigest,
        taskSnapshotDigest: rawSha256(snapshot.bytes),
      },
      policy.jsonBounds,
    );
    const admissionEffect: DurableEffectContext = Object.freeze({
      identity: cloneIdentity(admission.identity),
      admissionReceiptDigest,
      policy,
      scopeDigest: taskAttemptCustodyDigest(
        'admission-effect-scope',
        {
          identity: admission.identity,
          admissionReceiptDigest,
          policyDigest: policy.policyDigest,
        },
        policy.jsonBounds,
      ),
    });
    for (const directory of [
      prefix,
      childPath(prefix, 'snapshot'),
      childPath(prefix, 'artifacts'),
      childPath(prefix, 'chain'),
      expectedWorkerOutputPath,
    ] as const) {
      this.requireCompletedDurableEffect(this.durableEffectDescriptor({
        ...admissionEffect,
        operation: 'CREATE',
        target: directory,
        contentDigest: null,
        sequence: 0,
      }), policy, 'read');
    }
    for (const publication of [
      { target: expectedSnapshotPath, bytes: snapshot.bytes },
      { target: path, bytes: observed.bytes },
    ] as const) {
      this.requireCompletedDurableEffect(this.durableEffectDescriptor({
        ...admissionEffect,
        operation: 'PUBLISH',
        target: publication.target,
        contentDigest: rawSha256(publication.bytes),
        sequence: 0,
      }), policy, 'read');
    }
    return admission;
  }

  openAttemptAccess(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
  }): TaskAttemptCustodyAttemptAccess | null {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admissionReceiptDigest',
    ], 'CAPABILITY_UNVERIFIED', 'probe');
    input = Object.freeze({
      identity: cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2),
      policy: snapshotPolicy(inputRecord.policy),
      admissionReceiptDigest: inputRecord.admissionReceiptDigest as Sha256Digest,
    });
    this.assertStoreIdentity(input.identity, 'probe');
    assertPolicy(input.policy);
    if (!isDigest(input.admissionReceiptDigest)) hold('ADMISSION_MISMATCH', 'probe');
    const admission = this.readAdmission(input.identity, input.policy);
    if (admission === null) return null;
    if (admission.receiptDigest !== input.admissionReceiptDigest) {
      hold('ADMISSION_MISMATCH', 'probe');
    }
    const scopeDigest = attemptAccessScopeDigest(
      input.identity,
      admission.receiptDigest,
      input.policy,
    );
    const taskSnapshotRead = this.issuePathCapability({
      identity: input.identity,
      admissionReceiptDigest: admission.receiptDigest,
      relativePath: admission.taskSnapshot.relativePath,
      access: 'read-only-file',
      scopeDigest,
      attemptOutputCaptureIntent: null,
    });
    const workerOutputWrite = this.issuePathCapability({
      identity: input.identity,
      admissionReceiptDigest: admission.receiptDigest,
      relativePath: admission.workerOutputDirectory.relativePath,
      access: 'read-write-directory',
      scopeDigest,
      attemptOutputCaptureIntent: null,
    });
    return Object.freeze({
      identity: cloneIdentity(input.identity),
      admissionReceiptDigest: admission.receiptDigest,
      scopeDigest,
      taskSnapshotRead,
      workerOutputWrite,
    });
  }

  issueAttemptMountLease(input: {
    readonly access: TaskAttemptCustodyAttemptAccess;
    readonly policy: TaskAttemptCustodyPolicyV2;
  }): TaskAttemptCustodyMountLease {
    const inputRecord = requireExactDataRecord(
      input,
      ['access', 'policy'],
      'CAPABILITY_UNVERIFIED',
      'resolve-mount',
    );
    const accessRecord = requireExactDataRecord(inputRecord.access, [
      'identity',
      'admissionReceiptDigest',
      'scopeDigest',
      'taskSnapshotRead',
      'workerOutputWrite',
    ], 'CAPABILITY_UNVERIFIED', 'resolve-mount');
    const identity = cloneIdentity(accessRecord.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(inputRecord.policy);
    if (
      !isDigest(accessRecord.admissionReceiptDigest)
      || !isDigest(accessRecord.scopeDigest)
    ) hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    const admission = this.readAdmission(identity, policy);
    if (
      admission === null
      || admission.receiptDigest !== accessRecord.admissionReceiptDigest
    ) hold('ADMISSION_MISMATCH', 'resolve-mount');
    if (this.readDispatchTerminalRecord(identity, policy) !== null) {
      hold('DISPATCH_TRANSITION_INVALID', 'resolve-mount');
    }
    const expectedScopeDigest = attemptAccessScopeDigest(
      identity,
      accessRecord.admissionReceiptDigest,
      policy,
    );
    if (accessRecord.scopeDigest !== expectedScopeDigest) {
      hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    }
    const taskSnapshotScope = this.requireIssuedPathCapability(
      accessRecord.taskSnapshotRead as TaskAttemptCustodyPathCapability,
      identity,
      accessRecord.admissionReceiptDigest,
      'read-only-file',
    );
    const workerOutputScope = this.requireIssuedPathCapability(
      accessRecord.workerOutputWrite as TaskAttemptCustodyPathCapability,
      identity,
      accessRecord.admissionReceiptDigest,
      'read-write-directory',
    );
    if (
      taskSnapshotScope.scopeDigest !== expectedScopeDigest
      || workerOutputScope.scopeDigest !== expectedScopeDigest
      || taskSnapshotScope.relativePath !== admission.taskSnapshot.relativePath
      || workerOutputScope.relativePath !== admission.workerOutputDirectory.relativePath
    ) hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    if (this.activeMountLeaseByScope.has(expectedScopeDigest)) {
      hold('RECONCILIATION_REQUIRED', 'resolve-mount');
    }
    this.claimPhysicalTransition({
      admission,
      policy,
      state: 'MOUNT_CLAIMED',
      reasonCode: null,
      noEffectObservationBindingDigest: null,
    });
    if (this.mountLeaseIssuanceByScope.has(expectedScopeDigest)) {
      hold('LEASE_CONSUMED', 'resolve-mount');
    }
    const descriptor = this.durableEffectDescriptor({
      identity,
      admissionReceiptDigest: admission.receiptDigest,
      policy,
      scopeDigest: expectedScopeDigest,
      operation: 'MOUNT',
      target: workerOutputScope.relativePath,
      contentDigest: taskAttemptCustodyDigest('mount-capability-authority', {
        taskSnapshotRelativePath: taskSnapshotScope.relativePath,
        workerOutputRelativePath: workerOutputScope.relativePath,
        scopeDigest: expectedScopeDigest,
      }, policy.jsonBounds),
      sequence: 0,
    });
    this.mountLeaseIssuanceByScope.add(expectedScopeDigest);
    try {
      if (this.beginDurableEffect(descriptor, policy) !== 'EXECUTE') {
        hold('LEASE_CONSUMED', 'resolve-mount');
      }
      const lease = Object.freeze(Object.create(null)) as TaskAttemptCustodyMountLease;
      const scope: IssuedMountLeaseScope = {
        identity,
        admissionReceiptDigest: admission.receiptDigest,
        policy,
        scopeDigest: expectedScopeDigest,
        adapterOwner: this.adapter,
        taskSnapshot: accessRecord.taskSnapshotRead as TaskAttemptCustodyPathCapability,
        workerOutput: accessRecord.workerOutputWrite as TaskAttemptCustodyPathCapability,
        target: workerOutputScope.relativePath,
        descriptor,
        state: 'ISSUED',
      };
      this.issuedMountLeases.set(lease, scope);
      this.activeMountLeaseByScope.add(expectedScopeDigest);
      this.releaseDurableEffect(descriptor);
      return lease;
    } catch (error) {
      this.releaseDurableEffect(descriptor);
      throw error;
    } finally {
      this.mountLeaseIssuanceByScope.delete(expectedScopeDigest);
    }
  }

  async consumeAttemptMountLease(
    lease: TaskAttemptCustodyMountLease,
  ): Promise<TaskAttemptCustodyBackendMountTransferReceipt> {
    if (lease === null || typeof lease !== 'object' || isUntrustedProxy(lease)) {
      hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    }
    const scope = this.issuedMountLeases.get(lease);
    if (scope === undefined || scope.adapterOwner !== this.adapter) {
      hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    }
    if (scope.state !== 'ISSUED') {
      hold(
        scope.state === 'CLEANUP_UNCONFIRMED'
          ? 'CLEANUP_UNCONFIRMED'
          : scope.state === 'RECONCILIATION_REQUIRED'
            ? 'RECONCILIATION_REQUIRED'
          : 'LEASE_CONSUMED',
        'resolve-mount',
      );
    }
    scope.state = 'CONSUMING';
    let backendIssueStarted = false;
    let transferConfirmed = false;
    try {
      const taskSnapshotScope = this.requireIssuedPathCapability(
        scope.taskSnapshot,
        scope.identity,
        scope.admissionReceiptDigest,
        'read-only-file',
      );
      const workerOutputScope = this.requireIssuedPathCapability(
        scope.workerOutput,
        scope.identity,
        scope.admissionReceiptDigest,
        'read-write-directory',
      );
      const recomputedDescriptor = this.durableEffectDescriptor({
        identity: scope.identity,
        admissionReceiptDigest: scope.admissionReceiptDigest,
        policy: scope.policy,
        scopeDigest: scope.scopeDigest,
        operation: 'MOUNT',
        target: scope.target,
        contentDigest: taskAttemptCustodyDigest('mount-capability-authority', {
          taskSnapshotRelativePath: taskSnapshotScope.relativePath,
          workerOutputRelativePath: workerOutputScope.relativePath,
          scopeDigest: scope.scopeDigest,
        }, scope.policy.jsonBounds),
        sequence: 0,
      });
      if (
        recomputedDescriptor.opDigest !== scope.descriptor.opDigest
        || this.readDurableEffectMarker(scope.descriptor, 'INTENT', scope.policy) === null
        || this.readDurableEffectMarker(scope.descriptor, 'OUTCOME', scope.policy) !== null
        || this.activeDurableEffects.has(scope.descriptor.opDigest)
      ) {
        scope.state = 'RECONCILIATION_REQUIRED';
        hold('RECONCILIATION_REQUIRED', 'resolve-mount');
      }
      this.activeDurableEffects.add(scope.descriptor.opDigest);
      let backendCapability: TaskAttemptCustodyBackendMountCapability;
      backendIssueStarted = true;
      try {
        backendCapability = this.adapter.issueBackendMountCapability({
          root: this.root,
          taskSnapshot: scope.taskSnapshot,
          workerOutput: scope.workerOutput,
        });
      } catch {
        scope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
      }
      assertOpaqueAdapterResource(
        backendCapability,
        'CLEANUP_UNCONFIRMED',
        'resolve-mount',
      );
      let transferValue: TaskAttemptCustodyBackendMountTransferReceipt;
      try {
        transferValue = await this.adapter.consumeBackendMountCapability({
          root: this.root,
          capability: backendCapability,
          scopeDigest: scope.scopeDigest,
          effectOpDigest: scope.descriptor.opDigest,
          attemptId: scope.identity.attemptId,
          generation: scope.identity.generation,
        });
      } catch {
        scope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
      }
      const transfer = snapshotBackendMountTransferReceipt(transferValue, {
        rootId: this.root.rootId,
        scopeDigest: scope.scopeDigest,
        effectOpDigest: scope.descriptor.opDigest,
        attemptId: scope.identity.attemptId,
        generation: scope.identity.generation,
      });
      if (transfer.state !== 'CONSUMED') {
        scope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
      }
      transferConfirmed = true;
      try {
        this.completeDurableEffect(scope.descriptor, scope.policy, {
          receiptDigest: transfer.receiptDigest,
          evidenceDigest: transfer.transferEvidenceDigest,
        });
      } catch {
        scope.state = 'RECONCILIATION_REQUIRED';
        hold('RECONCILIATION_REQUIRED', 'resolve-mount');
      }
      scope.state = 'CONSUMED';
      return transfer;
    } catch (error) {
      let code = mappedAdapterHoldCode(error, 'CAPABILITY_UNVERIFIED');
      if (code === 'CLEANUP_UNCONFIRMED' || backendIssueStarted && !transferConfirmed) {
        scope.state = 'CLEANUP_UNCONFIRMED';
        code = 'CLEANUP_UNCONFIRMED';
      } else if (code === 'RECONCILIATION_REQUIRED' || transferConfirmed) {
        scope.state = 'RECONCILIATION_REQUIRED';
        code = 'RECONCILIATION_REQUIRED';
      } else {
        scope.state = 'CONSUMED';
      }
      hold(code, 'resolve-mount');
    } finally {
      this.releaseDurableEffect(scope.descriptor);
      this.activeMountLeaseByScope.delete(scope.scopeDigest);
    }
    return hold('RECONCILIATION_REQUIRED', 'resolve-mount');
  }

  issueAttemptOutputCaptureSource(input: {
    readonly access: TaskAttemptCustodyAttemptAccess;
    readonly childRelativePath: string;
    readonly artifactClass: TaskAttemptCustodyAttemptOutputArtifactClass;
    readonly artifactKey: string;
  }): TaskAttemptCustodyPathCapability {
    const inputRecord = requireExactDataRecord(
      input,
      ['access', 'childRelativePath', 'artifactClass', 'artifactKey'],
      'CAPABILITY_UNVERIFIED',
      'probe',
    );
    const accessRecord = requireExactDataRecord(inputRecord.access, [
      'identity',
      'admissionReceiptDigest',
      'scopeDigest',
      'taskSnapshotRead',
      'workerOutputWrite',
    ], 'CAPABILITY_UNVERIFIED', 'probe');
    if (
      typeof inputRecord.childRelativePath !== 'string'
      || artifactCaptureModeForClass(inputRecord.artifactClass) !== 'attempt-output-capture'
      || typeof inputRecord.artifactKey !== 'string'
      || !isSafeArtifactKey(inputRecord.artifactKey)
      || !isDigest(accessRecord.admissionReceiptDigest)
      || !isDigest(accessRecord.scopeDigest)
    ) hold('CAPABILITY_UNVERIFIED', 'probe');
    input = Object.freeze({
      access: Object.freeze({
        identity: cloneIdentity(accessRecord.identity as TaskAttemptCustodyIdentityV2),
        admissionReceiptDigest: accessRecord.admissionReceiptDigest,
        scopeDigest: accessRecord.scopeDigest,
        taskSnapshotRead: accessRecord.taskSnapshotRead as TaskAttemptCustodyPathCapability,
        workerOutputWrite: accessRecord.workerOutputWrite as TaskAttemptCustodyPathCapability,
      }),
      childRelativePath: inputRecord.childRelativePath,
      artifactClass: inputRecord.artifactClass as TaskAttemptCustodyAttemptOutputArtifactClass,
      artifactKey: inputRecord.artifactKey,
    });
    const workerOutputScope = this.requireIssuedPathCapability(
      input.access.workerOutputWrite,
      input.access.identity,
      input.access.admissionReceiptDigest,
      'read-write-directory',
    );
    if (workerOutputScope.scopeDigest !== input.access.scopeDigest) {
      hold('CAPABILITY_UNVERIFIED', 'probe');
    }
    const child = taskAttemptCustodyRelativePath(input.childRelativePath);
    const relativePath = childPath(workerOutputScope.relativePath, child);
    const intentDigest = attemptOutputCaptureIntentDigest({
      identity: workerOutputScope.identity,
      admissionReceiptDigest: workerOutputScope.admissionReceiptDigest,
      relativePath,
      scopeDigest: workerOutputScope.scopeDigest,
      artifactClass: input.artifactClass,
      artifactKey: input.artifactKey,
    });
    const existingCapability = this.attemptOutputCaptureSourcesByPath.get(relativePath);
    if (existingCapability !== undefined) {
      const existingScope = this.requireIssuedPathCapability(
        existingCapability,
        workerOutputScope.identity,
        workerOutputScope.admissionReceiptDigest,
        'capture-read-file',
      );
      const existingAuthority = existingScope.attemptOutputCaptureAuthority;
      if (existingAuthority?.intentDigest === intentDigest) return existingCapability;
      if (existingAuthority?.state === 'ISSUED') {
        existingAuthority.state = 'REVOKED';
        this.revokedPathCapabilities.add(existingCapability);
      }
      hold('CAPABILITY_UNVERIFIED', 'probe');
    }
    const capability = this.issuePathCapability({
      identity: workerOutputScope.identity,
      admissionReceiptDigest: workerOutputScope.admissionReceiptDigest,
      relativePath,
      access: 'capture-read-file',
      scopeDigest: workerOutputScope.scopeDigest,
      attemptOutputCaptureIntent: Object.freeze({
        sourceRole: 'attempt-output-artifact-source' as const,
        artifactClass: input.artifactClass,
        artifactKey: input.artifactKey,
        intentDigest,
      }),
    });
    this.attemptOutputCaptureSourcesByPath.set(relativePath, capability);
    return capability;
  }

  /**
   * Presence-only read of one attempt-private output path. The returned bit is
   * not execution authority: callers must still issue a capture capability and
   * persist a verified artifact before consuming any bytes. A missing file is
   * the only false result; unsafe paths, policy drift and adapter ambiguity
   * remain typed HOLDs.
   */
  hasAttemptOutputArtifact(input: {
    readonly access: TaskAttemptCustodyAttemptAccess;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly childRelativePath: string;
    readonly artifactClass: TaskAttemptCustodyAttemptOutputArtifactClass;
  }): boolean {
    const inputRecord = requireExactDataRecord(
      input,
      ['access', 'policy', 'childRelativePath', 'artifactClass'],
      'CAPABILITY_UNVERIFIED',
      'probe',
    );
    const accessRecord = requireExactDataRecord(inputRecord.access, [
      'identity',
      'admissionReceiptDigest',
      'scopeDigest',
      'taskSnapshotRead',
      'workerOutputWrite',
    ], 'CAPABILITY_UNVERIFIED', 'probe');
    const policy = snapshotPolicy(inputRecord.policy);
    if (
      typeof inputRecord.childRelativePath !== 'string'
      || artifactCaptureModeForClass(inputRecord.artifactClass) !== 'attempt-output-capture'
      || !isDigest(accessRecord.admissionReceiptDigest)
      || !isDigest(accessRecord.scopeDigest)
    ) hold('CAPABILITY_UNVERIFIED', 'probe');
    const identity = cloneIdentity(accessRecord.identity as TaskAttemptCustodyIdentityV2);
    const workerOutputScope = this.requireIssuedPathCapability(
      accessRecord.workerOutputWrite as TaskAttemptCustodyPathCapability,
      identity,
      accessRecord.admissionReceiptDigest as Sha256Digest,
      'read-write-directory',
    );
    if (workerOutputScope.scopeDigest !== accessRecord.scopeDigest) {
      hold('CAPABILITY_UNVERIFIED', 'probe');
    }
    const child = taskAttemptCustodyRelativePath(inputRecord.childRelativePath);
    const relativePath = childPath(workerOutputScope.relativePath, child);
    return this.adapter.readFirstWriter({
      root: this.root,
      relativePath,
      policy: policy.artifactLimits[
        inputRecord.artifactClass as TaskAttemptCustodyAttemptOutputArtifactClass
      ],
    }) !== null;
  }

  readTaskSnapshot(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
  }): TaskAttemptCustodyVerifiedSnapshot | null {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admissionReceiptDigest',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'read');
    input = Object.freeze({
      identity: cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2),
      policy: snapshotPolicy(inputRecord.policy),
      admissionReceiptDigest: inputRecord.admissionReceiptDigest as Sha256Digest,
    });
    const admission = this.readAdmission(input.identity, input.policy);
    if (admission === null) return null;
    if (admission.receiptDigest !== input.admissionReceiptDigest) {
      hold('ADMISSION_MISMATCH', 'read');
    }
    const observed = this.readVerifiedSnapshot(
      admission.taskSnapshot,
      input.policy.artifactLimits['task-admission-snapshot'],
      'read',
    );
    if (observed === null) hold('INCOMPLETE_PUBLICATION', 'read');
    if (!sameProof(observed.proof, admission.taskSnapshot)) {
      hold('ARTIFACT_CHANGED', 'read');
    }
    return Object.freeze({
      admission,
      bytes: observed.bytes,
      proof: observed.proof,
    });
  }

  readVerifiedArtifact(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly artifactClass: Exclude<
      TaskAttemptCustodyArtifactClass,
      'task-admission-snapshot'
    >;
    readonly artifactKey: string;
    readonly receiptDigest: Sha256Digest;
  }): TaskAttemptCustodyVerifiedArtifact | null {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'artifactClass',
      'artifactKey',
      'receiptDigest',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'read');
    input = Object.freeze({
      identity: cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2),
      policy: snapshotPolicy(inputRecord.policy),
      artifactClass: inputRecord.artifactClass as Exclude<
        TaskAttemptCustodyArtifactClass,
        'task-admission-snapshot'
      >,
      artifactKey: inputRecord.artifactKey as string,
      receiptDigest: inputRecord.receiptDigest as Sha256Digest,
    });
    if (!isDigest(input.receiptDigest)) hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    const receipt = this.readArtifactReceipt({
      identity: input.identity,
      policy: input.policy,
      artifactClass: input.artifactClass,
      artifactKey: input.artifactKey,
    });
    if (receipt === null) return null;
    if (receipt.receiptDigest !== input.receiptDigest) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    }
    const observed = this.readVerifiedSnapshot(
      receipt.artifact,
      input.policy.artifactLimits[input.artifactClass],
      'read',
    );
    if (observed === null) hold('INCOMPLETE_PUBLICATION', 'read');
    if (!sameProof(observed.proof, receipt.artifact)) {
      hold('ARTIFACT_CHANGED', 'read');
    }
    return Object.freeze({
      receipt,
      bytes: observed.bytes,
      proof: observed.proof,
    });
  }

  private requireWorkerIpcDispatchBinding(
    dispatchRequestId: string,
    identity: TaskAttemptCustodyIdentityV2,
    admissionReceiptDigest: Sha256Digest,
    policy: TaskAttemptCustodyPolicyV2,
    operation: TaskAttemptCustodyOperation,
  ): void {
    const dispatch = this.readDispatchAdmission({ dispatchRequestId, policy });
    if (
      dispatch.state !== 'admitted'
      || !sameIdentity(dispatch.ref.identity, identity)
      || dispatch.ref.admissionReceiptDigest !== admissionReceiptDigest
    ) hold('DISPATCH_REQUEST_CONFLICT', operation);
  }

  private readWorkerIpcCursorInventory(
    identity: TaskAttemptCustodyIdentityV2,
  ): ReadonlySet<string> {
    const directoryPath = workerIpcCursorDirectory(identity);
    const directory = this.readPrivateDirectorySnapshot(
      directoryPath,
      'read',
      'CORRUPT_CUSTODY_RECORD',
    );
    if (directory === null) return new Set<string>();
    const scan = this.adapter.scanPrivateDirectoryBounded;
    if (typeof scan !== 'function' || isUntrustedProxy(scan)) {
      hold('NATIVE_CAPABILITY_UNAVAILABLE', 'read');
    }
    const maxEntries = TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS * 2;
    const maxNameBytes = 64;
    const deadlineUnixMs = (intrinsicReflectApply(intrinsicDateNow, Date, []) as number) + 1_000;
    let value: TaskAttemptCustodyDirectoryScanReceiptV2;
    try {
      value = scan({
        root: this.root,
        relativeDirectory: directoryPath,
        maxEntries,
        maxNameBytes,
        deadlineUnixMs,
      });
    } catch (cause) {
      hold(mappedAdapterHoldCode(cause, 'CORRUPT_CUSTODY_RECORD'), 'read');
    }
    const receipt = createTaskAttemptCustodyDirectoryScanReceiptV2({
      rootId: value.rootId,
      relativeDirectory: value.relativeDirectory,
      names: value.names,
      entryCount: value.entryCount,
      maxEntries: value.maxEntries,
      maxNameBytes: value.maxNameBytes,
      deadlineUnixMs: value.deadlineUnixMs,
      nativeMutationEvidence: value.nativeMutationEvidence,
      nativeDirectoryIdentityBeforeDigest: value.nativeDirectoryIdentityBeforeDigest,
      nativeDirectoryIdentityAfterDigest: value.nativeDirectoryIdentityAfterDigest,
    });
    if (
      value.receiptDigest !== receipt.receiptDigest
      || receipt.rootId !== this.root.rootId
      || receipt.relativeDirectory !== directoryPath
      || receipt.maxEntries !== maxEntries
      || receipt.maxNameBytes !== maxNameBytes
      || receipt.deadlineUnixMs !== deadlineUnixMs
      || receipt.nativeDirectoryIdentityBeforeDigest
        !== receipt.nativeDirectoryIdentityAfterDigest
    ) hold('CORRUPT_CUSTODY_RECORD', 'read');
    const names = new Set<string>();
    let maximumSequence = 0;
    for (const name of receipt.names) {
      const match = /^(\d{6})\.(question-open|answered)\.json$/u.exec(name);
      if (match === null) hold('CORRUPT_CUSTODY_RECORD', 'read');
      const sequence = Number(match[1]);
      if (
        !assertPositiveSafeInteger(sequence)
        || sequence > TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS
        || String(sequence).padStart(6, '0') !== match[1]
      ) hold('CORRUPT_CUSTODY_RECORD', 'read');
      maximumSequence = Math.max(maximumSequence, sequence);
      names.add(name);
    }
    for (let sequence = 1; sequence <= maximumSequence; sequence += 1) {
      const prefix = String(sequence).padStart(6, '0');
      const hasOpen = names.has(`${prefix}.question-open.json`);
      const hasAnswered = names.has(`${prefix}.answered.json`);
      if (!hasOpen || (sequence < maximumSequence && !hasAnswered)) {
        hold('CORRUPT_CUSTODY_RECORD', 'read');
      }
      if (hasAnswered && !hasOpen) hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    return names;
  }

  private requireWorkerIpcCursorPublication(
    identity: TaskAttemptCustodyIdentityV2,
    admissionReceiptDigest: Sha256Digest,
    policy: TaskAttemptCustodyPolicyV2,
    relativePath: TaskAttemptCustodyRelativePath,
    bytes: Uint8Array,
  ): void {
    this.requireCompletedDurableEffect(this.durableEffectDescriptor({
      ...attemptEffectContext(identity, admissionReceiptDigest, policy),
      operation: 'PUBLISH',
      target: relativePath,
      contentDigest: rawSha256(bytes),
      sequence: 0,
    }), policy, 'read');
  }

  private publishWorkerIpcCursorAndVerify(
    identity: TaskAttemptCustodyIdentityV2,
    admissionReceiptDigest: Sha256Digest,
    policy: TaskAttemptCustodyPolicyV2,
    relativePath: TaskAttemptCustodyRelativePath,
    bytes: Uint8Array,
  ): void {
    const authorityBytes = snapshotAuthorityBytes(bytes, 'CAPABILITY_UNVERIFIED', 'publish');
    const limit = metadataLimit(policy);
    assertBytesWithinLimit(authorityBytes, limit);
    const effect = attemptEffectContext(identity, admissionReceiptDigest, policy);
    const descriptor = this.durableEffectDescriptor({
      ...effect,
      operation: 'PUBLISH',
      target: relativePath,
      contentDigest: rawSha256(authorityBytes),
      sequence: 0,
    });
    const intent = this.readDurableEffectMarker(descriptor, 'INTENT', policy);
    const outcome = this.readDurableEffectMarker(descriptor, 'OUTCOME', policy);
    if (intent === null || outcome !== null) {
      this.publishAndVerify(relativePath, authorityBytes, limit, effect);
      return;
    }

    let observed = this.readFirstWriterSnapshot(
      relativePath,
      limit,
      'publish',
      'PUBLISHED_UNCONFIRMED',
    );
    if (observed === null) {
      let publicationValue: TaskAttemptCustodyPublication;
      try {
        publicationValue = this.adapter.publishBytesFirstWriter({
          root: this.root,
          relativePath,
          bytes: Uint8Array.from(authorityBytes),
          policy: limit,
        });
      } catch (error) {
        hold(mappedAdapterHoldCode(error, 'PUBLISHED_UNCONFIRMED'), 'publish');
      }
      const publication = snapshotAdapterPublication(publicationValue, 'publish');
      const proof = assertFileProof(
        publication.proof,
        relativePath,
        authorityBytes,
        this.root,
        limit,
      );
      observed = this.readVerifiedSnapshot(
        proof,
        limit,
        'publish',
        'PUBLISHED_UNCONFIRMED',
      );
    }
    if (
      observed === null
      || !sameBytes(observed.bytes, authorityBytes)
      || observed.proof.sha256 !== descriptor.contentDigest
    ) hold('RECONCILIATION_REQUIRED', 'publish');
    this.activeDurableEffects.add(descriptor.opDigest);
    this.completeDurableEffect(descriptor, policy);
  }

  readWorkerIpcConversationCursor(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly dispatchRequestId: string;
  }): TaskAttemptCustodyWorkerIpcConversationCursorV2 {
    const record = requireExactDataRecord(input, [
      'identity', 'policy', 'admissionReceiptDigest', 'dispatchRequestId',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'read');
    const identity = cloneIdentity(record.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(record.policy);
    const admissionReceiptDigest = record.admissionReceiptDigest as Sha256Digest;
    const dispatchRequestId = record.dispatchRequestId as string;
    this.assertStoreIdentity(identity, 'read');
    if (!isDigest(admissionReceiptDigest) || !isDispatchRequestId(dispatchRequestId)) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    }
    this.requireWorkerIpcDispatchBinding(
      dispatchRequestId,
      identity,
      admissionReceiptDigest,
      policy,
      'read',
    );

    const inventory = this.readWorkerIpcCursorInventory(identity);
    if (inventory.size === 0) {
      return freezeObject({
        state: 'empty' as const,
        identity,
        admissionReceiptDigest,
        dispatchRequestId,
        nextSequence: 1 as const,
        cursorReceiptDigest: null,
      });
    }

    const maximumSequence = Math.max(...[...inventory].map(name => Number(name.slice(0, 6))));
    const cachedPrefix = this.verifiedWorkerIpcAnsweredPrefix.get(dispatchRequestId);
    let predecessor: PersistedWorkerIpcCursor | null = cachedPrefix !== undefined
      && cachedPrefix.sequence <= maximumSequence
      && inventory.has(`${String(cachedPrefix.sequence).padStart(6, '0')}.question-open.json`)
      && inventory.has(`${String(cachedPrefix.sequence).padStart(6, '0')}.answered.json`)
      ? cachedPrefix
      : null;
    const firstSequence = predecessor === null ? 1 : predecessor.sequence + 1;
    for (let sequence = firstSequence;
      sequence <= TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS;
      sequence += 1) {
      const openPath = workerIpcCursorPath(identity, sequence, 'question-open');
      const prefix = String(sequence).padStart(6, '0');
      if (!inventory.has(`${prefix}.question-open.json`)) {
        if (predecessor === null || predecessor.state !== 'answered') {
          hold('CORRUPT_CUSTODY_RECORD', 'read');
        }
        return predecessor;
      }
      const openObserved = this.readFirstWriterSnapshot(
        openPath,
        metadataLimit(policy),
        'read',
        'RECONCILIATION_REQUIRED',
      );
      if (openObserved === null) {
        hold('CORRUPT_CUSTODY_RECORD', 'read');
      }
      this.requireWorkerIpcCursorPublication(
        identity,
        admissionReceiptDigest,
        policy,
        openPath,
        openObserved.bytes,
      );
      let openValue: unknown;
      try { openValue = JSON.parse(Buffer.from(openObserved.bytes).toString('utf8')); } catch {
        return hold('CORRUPT_CUSTODY_RECORD', 'read');
      }
      const open = parseWorkerIpcCursor(openValue, policy);
      const expectedPredecessor = predecessor?.cursorReceiptDigest ?? null;
      if (
        open === null
        || open.state !== 'question-open'
        || !sameIdentity(open.identity, identity)
        || open.admissionReceiptDigest !== admissionReceiptDigest
        || open.dispatchRequestId !== dispatchRequestId
        || open.sequence !== sequence
        || open.predecessorCursorReceiptDigest !== expectedPredecessor
        || !sameBytes(openObserved.bytes, canonicalTaskAttemptCustodyJson(open, policy.jsonBounds))
      ) hold('CORRUPT_CUSTODY_RECORD', 'read');
      const question = this.readVerifiedArtifact({
        identity,
        policy,
        artifactClass: 'worker-ipc-question',
        artifactKey: open.questionArtifactKey,
        receiptDigest: open.questionReceiptDigest,
      });
      if (question === null || question.proof.sha256 !== open.questionArtifactSha256) {
        hold('RECONCILIATION_REQUIRED', 'read');
      }

      const answeredPath = workerIpcCursorPath(identity, sequence, 'answered');
      const answeredObserved = this.readFirstWriterSnapshot(
        answeredPath,
        metadataLimit(policy),
        'read',
        'RECONCILIATION_REQUIRED',
      );
      const hasAnswered = inventory.has(`${prefix}.answered.json`);
      if (!hasAnswered) return open;
      if (answeredObserved === null) hold('CORRUPT_CUSTODY_RECORD', 'read');
      this.requireWorkerIpcCursorPublication(
        identity,
        admissionReceiptDigest,
        policy,
        answeredPath,
        answeredObserved.bytes,
      );
      let answeredValue: unknown;
      try { answeredValue = JSON.parse(Buffer.from(answeredObserved.bytes).toString('utf8')); } catch {
        return hold('CORRUPT_CUSTODY_RECORD', 'read');
      }
      const answered = parseWorkerIpcCursor(answeredValue, policy);
      if (
        answered === null
        || answered.state !== 'answered'
        || !sameIdentity(answered.identity, identity)
        || answered.admissionReceiptDigest !== admissionReceiptDigest
        || answered.dispatchRequestId !== dispatchRequestId
        || answered.sequence !== sequence
        || answered.predecessorCursorReceiptDigest !== open.predecessorCursorReceiptDigest
        || answered.questionCursorReceiptDigest !== open.cursorReceiptDigest
        || answered.sealedSourceReceiptDigest !== open.sealedSourceReceiptDigest
        || answered.sourceFileIdentityDigest !== open.sourceFileIdentityDigest
        || answered.sourceEpoch !== open.sourceEpoch
        || answered.questionReceiptDigest !== open.questionReceiptDigest
        || !sameBytes(
          answeredObserved.bytes,
          canonicalTaskAttemptCustodyJson(answered, policy.jsonBounds),
        )
      ) hold('CORRUPT_CUSTODY_RECORD', 'read');
      const delivery = this.readWorkerIpcAnswerDelivery({
        identity,
        policy,
        admissionReceiptDigest,
        sequence,
        artifactKey: workerIpcAnswerArtifactKey(sequence),
      });
      if (delivery === null || delivery.receiptDigest !== answered.answerDeliveryReceiptDigest) {
        hold('RECONCILIATION_REQUIRED', 'read');
      }
      predecessor = answered;
      this.verifiedWorkerIpcAnsweredPrefix.set(dispatchRequestId, answered);
    }
    if (predecessor === null) hold('CORRUPT_CUSTODY_RECORD', 'read');
    return predecessor;
  }

  readWorkerIpcQuestionOpenCursor(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly dispatchRequestId: string;
    readonly sequence: number;
    readonly cursorReceiptDigest: Sha256Digest;
  }): Extract<TaskAttemptCustodyWorkerIpcConversationCursorV2, { state: 'question-open' }> {
    const record = requireExactDataRecord(input, [
      'identity', 'policy', 'admissionReceiptDigest', 'dispatchRequestId', 'sequence',
      'cursorReceiptDigest',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'read');
    const identity = cloneIdentity(record.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(record.policy);
    const admissionReceiptDigest = record.admissionReceiptDigest as Sha256Digest;
    const dispatchRequestId = record.dispatchRequestId as string;
    const sequence = record.sequence as number;
    const cursorReceiptDigest = record.cursorReceiptDigest as Sha256Digest;
    if (!assertPositiveSafeInteger(sequence) || !isDigest(cursorReceiptDigest)) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    }
    const head = this.readWorkerIpcConversationCursor({
      identity, policy, admissionReceiptDigest, dispatchRequestId,
    });
    if (head.state === 'empty' || sequence > head.sequence) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    }
    const observed = this.readFirstWriterSnapshot(
      workerIpcCursorPath(identity, sequence, 'question-open'),
      metadataLimit(policy),
      'read',
      'RECONCILIATION_REQUIRED',
    );
    if (observed === null) hold('CORRUPT_CUSTODY_RECORD', 'read');
    this.requireWorkerIpcCursorPublication(
      identity,
      admissionReceiptDigest,
      policy,
      workerIpcCursorPath(identity, sequence, 'question-open'),
      observed.bytes,
    );
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const cursor = parseWorkerIpcCursor(value, policy);
    if (
      cursor === null
      || cursor.state !== 'question-open'
      || !sameIdentity(cursor.identity, identity)
      || cursor.admissionReceiptDigest !== admissionReceiptDigest
      || cursor.dispatchRequestId !== dispatchRequestId
      || cursor.sequence !== sequence
      || cursor.cursorReceiptDigest !== cursorReceiptDigest
      || !sameBytes(observed.bytes, canonicalTaskAttemptCustodyJson(cursor, policy.jsonBounds))
    ) hold('CORRUPT_CUSTODY_RECORD', 'read');
    const question = this.readVerifiedArtifact({
      identity,
      policy,
      artifactClass: 'worker-ipc-question',
      artifactKey: cursor.questionArtifactKey,
      receiptDigest: cursor.questionReceiptDigest,
    });
    if (question === null || question.proof.sha256 !== cursor.questionArtifactSha256) {
      hold('RECONCILIATION_REQUIRED', 'read');
    }
    return cursor;
  }

  captureNextWorkerIpcQuestion(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly dispatchRequestId: string;
    readonly access: TaskAttemptCustodyAttemptAccess;
    readonly expectedCursorReceiptDigest: Sha256Digest | null;
    readonly sequence: number;
    readonly sealedSourceReceipt: TaskAttemptCustodyWorkerIpcSealedQuestionSourceV2;
    readonly source: TaskAttemptCustodyPathCapability;
  }): TaskAttemptCustodyWorkerIpcQuestionCaptureV2 {
    const record = requireExactDataRecord(input, [
      'identity', 'policy', 'admissionReceiptDigest', 'dispatchRequestId', 'access',
      'expectedCursorReceiptDigest', 'sequence', 'sealedSourceReceipt', 'source',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'capture');
    const identity = cloneIdentity(record.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(record.policy);
    const admissionReceiptDigest = record.admissionReceiptDigest as Sha256Digest;
    const dispatchRequestId = record.dispatchRequestId as string;
    const expectedCursorReceiptDigest = record.expectedCursorReceiptDigest as Sha256Digest | null;
    const sequence = record.sequence as number;
    const sealed = parseTaskAttemptCustodyWorkerIpcSealedQuestionSourceV2(
      record.sealedSourceReceipt,
      policy,
    );
    if (
      sealed === null
      || !sameIdentity(sealed.identity, identity)
      || sealed.admissionReceiptDigest !== admissionReceiptDigest
      || sealed.dispatchRequestId !== dispatchRequestId
      || sealed.sequence !== sequence
      || (expectedCursorReceiptDigest !== null && !isDigest(expectedCursorReceiptDigest))
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'capture');
    const current = this.readWorkerIpcConversationCursor({
      identity, policy, admissionReceiptDigest, dispatchRequestId,
    });
    const expectedSequence = current.state === 'empty' ? 1 : current.nextSequence;
    if (
      current.state === 'question-open'
      || expectedSequence === null
      || sequence !== expectedSequence
      || sequence > TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS
      || current.cursorReceiptDigest !== expectedCursorReceiptDigest
      || (current.state === 'answered' && (
        current.sourceFileIdentityDigest === sealed.sourceFileIdentityDigest
        || current.sourceEpoch === sealed.sourceEpoch
      ))
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'capture');
    const sourceScope = this.requireIssuedPathCapability(
      record.source as TaskAttemptCustodyPathCapability,
      identity,
      admissionReceiptDigest,
      'capture-read-file',
    );
    const accessRecord = requireExactDataRecord(record.access, [
      'identity', 'admissionReceiptDigest', 'scopeDigest', 'taskSnapshotRead', 'workerOutputWrite',
    ], 'CAPABILITY_UNVERIFIED', 'capture');
    const workerOutputScope = this.requireIssuedPathCapability(
      accessRecord.workerOutputWrite as TaskAttemptCustodyPathCapability,
      identity,
      admissionReceiptDigest,
      'read-write-directory',
    );
    const expectedSourcePath = childPath(
      workerOutputScope.relativePath,
      workerIpcQuestionSealedChild(dispatchRequestId, sequence),
    );
    if (sourceScope.relativePath !== expectedSourcePath) hold('CAPABILITY_UNVERIFIED', 'capture');
    const question = this.captureAttemptOutputArtifact({
      identity,
      policy,
      admissionReceiptDigest,
      artifactClass: 'worker-ipc-question',
      artifactKey: workerIpcQuestionArtifactKey(sequence),
      capturedAt: sealed.capturedAt,
      source: record.source as TaskAttemptCustodyPathCapability,
    });
    if (
      question.artifact.sha256 !== sealed.contentSha256
      || question.artifact.byteLength !== sealed.byteLength
    ) hold('ARTIFACT_CHANGED', 'capture');
    const withoutDigest: Omit<
      Extract<TaskAttemptCustodyWorkerIpcConversationCursorV2, { state: 'question-open' }>,
      'cursorReceiptDigest'
    > = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-worker-ipc-conversation-cursor',
      state: 'question-open',
      identity,
      admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      dispatchRequestId,
      sequence,
      nextSequence: null,
      predecessorCursorReceiptDigest: current.cursorReceiptDigest,
      sealedSourceReceiptDigest: sealed.receiptDigest,
      sourceFileIdentityDigest: sealed.sourceFileIdentityDigest,
      sourceEpoch: sealed.sourceEpoch,
      questionArtifactKey: question.artifactKey,
      questionReceiptDigest: question.receiptDigest,
      questionArtifactSha256: question.artifact.sha256,
      recordedAt: sealed.capturedAt,
    };
    const cursor = freezeObject({
      ...withoutDigest,
      cursorReceiptDigest: workerIpcCursorReceiptDigest(withoutDigest, policy.jsonBounds),
    });
    this.ensureAndVerifyPrivateDirectory(
      workerIpcCursorDirectory(identity),
      attemptEffectContext(identity, admissionReceiptDigest, policy),
    );
    this.publishWorkerIpcCursorAndVerify(
      identity,
      admissionReceiptDigest,
      policy,
      workerIpcCursorPath(identity, sequence, 'question-open'),
      canonicalTaskAttemptCustodyJson(cursor, policy.jsonBounds),
    );
    const persisted = this.readWorkerIpcConversationCursor({
      identity, policy, admissionReceiptDigest, dispatchRequestId,
    });
    if (persisted.state !== 'question-open'
      || persisted.cursorReceiptDigest !== cursor.cursorReceiptDigest) {
      hold('RECONCILIATION_REQUIRED', 'capture');
    }
    return freezeObject({ question, cursor: persisted });
  }

  readWorkerIpcAnswerDelivery(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly sequence: number;
    readonly artifactKey: string;
  }): TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2 | null {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admissionReceiptDigest',
      'sequence',
      'artifactKey',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'read');
    const identity = cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(inputRecord.policy);
    const admissionReceiptDigest = inputRecord.admissionReceiptDigest as Sha256Digest;
    const sequence = inputRecord.sequence as number;
    const artifactKey = inputRecord.artifactKey as string;
    this.assertStoreIdentity(identity, 'read');
    if (
      !isDigest(admissionReceiptDigest)
      || !assertPositiveSafeInteger(sequence)
      || artifactKey !== workerIpcAnswerArtifactKey(sequence)
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    const admission = this.readAdmission(identity, policy);
    if (admission === null) return null;
    if (admission.receiptDigest !== admissionReceiptDigest) {
      hold('ADMISSION_MISMATCH', 'read');
    }
    const prefix = identityPrefix(identity);
    const receiptPath = childPath(
      prefix,
      'artifacts',
      'worker-ipc-answer',
      `${artifactKey}.delivery.receipt.json`,
    );
    const observed = this.readFirstWriterSnapshot(
      receiptPath,
      metadataLimit(policy),
      'read',
      'RECONCILIATION_REQUIRED',
    );
    if (observed === null) {
      try {
        const authority = this.readArtifactReceipt({
          identity,
          policy,
          artifactClass: 'worker-ipc-answer',
          artifactKey,
        });
        if (authority !== null) hold('RECONCILIATION_REQUIRED', 'read');
      } catch {
        hold('RECONCILIATION_REQUIRED', 'read');
      }
      return null;
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(observed.bytes).toString('utf8'));
    } catch {
      return hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const receipt = parseTaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2(value, policy);
    if (
      receipt === null
      || !sameIdentity(receipt.identity, identity)
      || receipt.admissionReceiptDigest !== admission.receiptDigest
      || receipt.sequence !== sequence
      || receipt.artifactKey !== artifactKey
      || receipt.destination.volumeId !== this.root.volumeId
      || Date.parse(receipt.deliveredAt) < Date.parse(admission.admittedAt)
    ) hold('CORRUPT_CUSTODY_RECORD', 'read');
    if (!sameBytes(
      observed.bytes,
      canonicalTaskAttemptCustodyJson(receipt, policy.jsonBounds),
    )) hold('CORRUPT_CUSTODY_RECORD', 'read');
    const authority = this.readVerifiedArtifact({
      identity,
      policy,
      artifactClass: 'worker-ipc-answer',
      artifactKey,
      receiptDigest: receipt.authorityArtifactReceiptDigest,
    });
    if (
      authority === null
      || authority.receipt.captureMode !== 'host-authority-publication'
      || authority.proof.sha256 !== receipt.authorityArtifactSha256
      || rawSha256(authority.bytes) !== receipt.authorityArtifactSha256
    ) hold('RECONCILIATION_REQUIRED', 'read');
    const effect = attemptEffectContext(identity, admission.receiptDigest, policy);
    this.requireCompletedDurableEffect(this.durableEffectDescriptor({
      ...effect,
      operation: 'PUBLISH',
      target: receipt.destination.relativePath,
      contentDigest: receipt.deliverySha256,
      sequence,
    }), policy, 'read');
    this.requireCompletedDurableEffect(this.durableEffectDescriptor({
      ...effect,
      operation: 'PUBLISH',
      target: receiptPath,
      contentDigest: rawSha256(observed.bytes),
      sequence: 0,
    }), policy, 'read');
    return receipt;
  }

  publishWorkerIpcAnswerDelivery(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly access: TaskAttemptCustodyAttemptAccess;
    readonly sequence: number;
    readonly artifactKey: string;
    readonly destinationChildRelativePath: string;
    readonly deliveredAt: string;
    readonly authorityEnvelopeBytes: Uint8Array;
    readonly deliveryBytes: Uint8Array;
  }): TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2 {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admissionReceiptDigest',
      'access',
      'sequence',
      'artifactKey',
      'destinationChildRelativePath',
      'deliveredAt',
      'authorityEnvelopeBytes',
      'deliveryBytes',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'publish');
    const identity = cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(inputRecord.policy);
    const admissionReceiptDigest = inputRecord.admissionReceiptDigest as Sha256Digest;
    const sequence = inputRecord.sequence as number;
    const artifactKey = inputRecord.artifactKey as string;
    const destinationChildRelativePath = inputRecord.destinationChildRelativePath as string;
    const deliveredAt = inputRecord.deliveredAt as string;
    const authorityEnvelopeBytes = snapshotAuthorityBytes(
      inputRecord.authorityEnvelopeBytes,
      'CAPABILITY_UNVERIFIED',
      'publish',
    );
    const deliveryBytes = snapshotAuthorityBytes(
      inputRecord.deliveryBytes,
      'CAPABILITY_UNVERIFIED',
      'publish',
    );
    const accessRecord = requireExactDataRecord(inputRecord.access, [
      'identity',
      'admissionReceiptDigest',
      'scopeDigest',
      'taskSnapshotRead',
      'workerOutputWrite',
    ], 'CAPABILITY_UNVERIFIED', 'publish');
    const accessIdentity = cloneIdentity(
      accessRecord.identity as TaskAttemptCustodyIdentityV2,
    );
    this.assertStoreIdentity(identity, 'publish');
    if (
      !sameIdentity(accessIdentity, identity)
      || !isDigest(admissionReceiptDigest)
      || accessRecord.admissionReceiptDigest !== admissionReceiptDigest
      || !isDigest(accessRecord.scopeDigest)
      || !assertPositiveSafeInteger(sequence)
      || artifactKey !== workerIpcAnswerArtifactKey(sequence)
      || !isTimestamp(deliveredAt)
      || sameBytes(authorityEnvelopeBytes, deliveryBytes)
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
    let expectedChild: TaskAttemptCustodyRelativePath;
    try {
      expectedChild = workerIpcAnswerDestinationChild(identity);
    } catch {
      return hold('UNSAFE_RELATIVE_PATH', 'publish');
    }
    if (destinationChildRelativePath !== expectedChild) {
      hold('UNSAFE_RELATIVE_PATH', 'publish');
    }
    const admission = this.readAdmission(identity, policy);
    if (admission === null) hold('ADMISSION_REQUIRED', 'publish');
    if (
      admission.receiptDigest !== admissionReceiptDigest
      || Date.parse(deliveredAt) < Date.parse(admission.admittedAt)
    ) hold('ADMISSION_MISMATCH', 'publish');
    const expectedScopeDigest = attemptAccessScopeDigest(
      identity,
      admissionReceiptDigest,
      policy,
    );
    if (accessRecord.scopeDigest !== expectedScopeDigest) {
      hold('CAPABILITY_UNVERIFIED', 'publish');
    }
    const taskSnapshotScope = this.requireIssuedPathCapability(
      accessRecord.taskSnapshotRead as TaskAttemptCustodyPathCapability,
      identity,
      admissionReceiptDigest,
      'read-only-file',
    );
    const workerOutputScope = this.requireIssuedPathCapability(
      accessRecord.workerOutputWrite as TaskAttemptCustodyPathCapability,
      identity,
      admissionReceiptDigest,
      'read-write-directory',
    );
    if (
      taskSnapshotScope.scopeDigest !== expectedScopeDigest
      || workerOutputScope.scopeDigest !== expectedScopeDigest
      || taskSnapshotScope.relativePath !== admission.taskSnapshot.relativePath
      || workerOutputScope.relativePath !== admission.workerOutputDirectory.relativePath
    ) hold('CAPABILITY_UNVERIFIED', 'publish');
    const limit = policy.artifactLimits['worker-ipc-answer'];
    assertBytesWithinLimit(authorityEnvelopeBytes, limit);
    assertBytesWithinLimit(deliveryBytes, limit);

    const existing = this.readWorkerIpcAnswerDelivery({
      identity,
      policy,
      admissionReceiptDigest,
      sequence,
      artifactKey,
    });
    if (existing !== null) {
      if (
        existing.deliveredAt !== deliveredAt
        || existing.authorityArtifactSha256 !== rawSha256(authorityEnvelopeBytes)
        || existing.deliverySha256 !== rawSha256(deliveryBytes)
        || existing.destinationChildRelativePath !== destinationChildRelativePath
      ) hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
      return existing;
    }

    const authorityArtifact = this.publishHostArtifact({
      identity,
      policy,
      admissionReceiptDigest,
      artifactClass: 'worker-ipc-answer',
      artifactKey,
      capturedAt: deliveredAt,
      bytes: authorityEnvelopeBytes,
    });
    const destinationPath = childPath(workerOutputScope.relativePath, expectedChild);
    const destination = this.publishWorkerIpcAnswerDestination({
      identity,
      policy,
      admissionReceiptDigest,
      scopeDigest: expectedScopeDigest,
      sequence,
      destinationPath,
      deliveryBytes,
      limit,
    });
    const proofBody = {
      identity: cloneIdentity(identity),
      admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      sequence,
      artifactKey,
      authorityArtifactReceiptDigest: authorityArtifact.receiptDigest,
      authorityArtifactSha256: authorityArtifact.artifact.sha256,
      deliverySha256: rawSha256(deliveryBytes),
      destinationChildRelativePath,
      destination: cloneProof(destination),
    };
    const withoutDigest: Omit<
      TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2,
      'receiptDigest'
    > = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-worker-ipc-answer-delivery',
      state: 'delivered',
      ...proofBody,
      destinationProofDigest: workerIpcAnswerDestinationProofDigest(
        proofBody,
        policy.jsonBounds,
      ),
      deliveredAt,
    };
    const receipt: TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2 = Object.freeze({
      ...withoutDigest,
      receiptDigest: workerIpcAnswerDeliveryReceiptDigest(withoutDigest, policy.jsonBounds),
    });
    const receiptPath = childPath(
      identityPrefix(identity),
      'artifacts',
      'worker-ipc-answer',
      `${artifactKey}.delivery.receipt.json`,
    );
    try {
      this.publishAndVerify(
        receiptPath,
        canonicalTaskAttemptCustodyJson(receipt, policy.jsonBounds),
        metadataLimit(policy),
        attemptEffectContext(identity, admissionReceiptDigest, policy),
      );
    } catch {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    const persisted = this.readWorkerIpcAnswerDelivery({
      identity,
      policy,
      admissionReceiptDigest,
      sequence,
      artifactKey,
    });
    if (persisted === null || persisted.receiptDigest !== receipt.receiptDigest) {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    return persisted;
  }

  publishNextWorkerIpcAnswerDelivery(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly dispatchRequestId: string;
    readonly access: TaskAttemptCustodyAttemptAccess;
    readonly expectedCursorReceiptDigest: Sha256Digest;
    readonly questionReceiptDigest: Sha256Digest;
    readonly sequence: number;
    readonly artifactKey: string;
    readonly destinationChildRelativePath: string;
    readonly deliveredAt: string;
    readonly authorityEnvelopeBytes: Uint8Array;
    readonly deliveryBytes: Uint8Array;
  }): TaskAttemptCustodyWorkerIpcAnswerPublicationV2 {
    const record = requireExactDataRecord(input, [
      'identity', 'policy', 'admissionReceiptDigest', 'dispatchRequestId', 'access',
      'expectedCursorReceiptDigest', 'questionReceiptDigest', 'sequence', 'artifactKey',
      'destinationChildRelativePath', 'deliveredAt', 'authorityEnvelopeBytes', 'deliveryBytes',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'publish');
    const identity = cloneIdentity(record.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(record.policy);
    const admissionReceiptDigest = record.admissionReceiptDigest as Sha256Digest;
    const dispatchRequestId = record.dispatchRequestId as string;
    const expectedCursorReceiptDigest = record.expectedCursorReceiptDigest as Sha256Digest;
    const questionReceiptDigest = record.questionReceiptDigest as Sha256Digest;
    const sequence = record.sequence as number;
    if (!isDigest(expectedCursorReceiptDigest) || !isDigest(questionReceiptDigest)) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
    }
    const accessRecord = requireExactDataRecord(record.access, [
      'identity', 'admissionReceiptDigest', 'scopeDigest', 'taskSnapshotRead', 'workerOutputWrite',
    ], 'CAPABILITY_UNVERIFIED', 'publish');
    const accessIdentity = cloneIdentity(accessRecord.identity as TaskAttemptCustodyIdentityV2);
    const expectedScopeDigest = attemptAccessScopeDigest(
      identity,
      admissionReceiptDigest,
      policy,
    );
    if (
      !sameIdentity(accessIdentity, identity)
      || accessRecord.admissionReceiptDigest !== admissionReceiptDigest
      || accessRecord.scopeDigest !== expectedScopeDigest
    ) hold('CAPABILITY_UNVERIFIED', 'publish');
    const taskSnapshotScope = this.requireIssuedPathCapability(
      accessRecord.taskSnapshotRead as TaskAttemptCustodyPathCapability,
      identity,
      admissionReceiptDigest,
      'read-only-file',
    );
    const workerOutputScope = this.requireIssuedPathCapability(
      accessRecord.workerOutputWrite as TaskAttemptCustodyPathCapability,
      identity,
      admissionReceiptDigest,
      'read-write-directory',
    );
    const admission = this.readAdmission(identity, policy);
    if (
      admission === null
      || admission.receiptDigest !== admissionReceiptDigest
      || taskSnapshotScope.scopeDigest !== expectedScopeDigest
      || workerOutputScope.scopeDigest !== expectedScopeDigest
      || taskSnapshotScope.relativePath !== admission.taskSnapshot.relativePath
      || workerOutputScope.relativePath !== admission.workerOutputDirectory.relativePath
    ) hold('CAPABILITY_UNVERIFIED', 'publish');
    const current = this.readWorkerIpcConversationCursor({
      identity, policy, admissionReceiptDigest, dispatchRequestId,
    });
    if (current.state === 'answered') {
      if (
        current.sequence !== sequence
        || current.questionCursorReceiptDigest !== expectedCursorReceiptDigest
        || current.questionReceiptDigest !== questionReceiptDigest
        || record.artifactKey !== workerIpcAnswerArtifactKey(sequence)
        || record.destinationChildRelativePath !== workerIpcAnswerDestinationChild(identity)
      ) hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
      const authorityEnvelopeBytes = snapshotAuthorityBytes(
        record.authorityEnvelopeBytes,
        'CAPABILITY_UNVERIFIED',
        'publish',
      );
      const deliveryBytes = snapshotAuthorityBytes(
        record.deliveryBytes,
        'CAPABILITY_UNVERIFIED',
        'publish',
      );
      const existing = this.readWorkerIpcAnswerDelivery({
        identity,
        policy,
        admissionReceiptDigest,
        sequence,
        artifactKey: record.artifactKey as string,
      });
      if (
        existing === null
        || current.answerDeliveryReceiptDigest !== existing.receiptDigest
        || existing.deliveredAt !== record.deliveredAt
        || existing.authorityArtifactSha256 !== rawSha256(authorityEnvelopeBytes)
        || existing.deliverySha256 !== rawSha256(deliveryBytes)
      ) hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
      return freezeObject({ delivery: existing, cursor: current });
    }
    if (
      current.state !== 'question-open'
      || current.sequence !== sequence
      || current.cursorReceiptDigest !== expectedCursorReceiptDigest
      || current.questionReceiptDigest !== questionReceiptDigest
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
    const delivery = this.publishWorkerIpcAnswerDelivery({
      identity,
      policy,
      admissionReceiptDigest,
      access: record.access as TaskAttemptCustodyAttemptAccess,
      sequence,
      artifactKey: record.artifactKey as string,
      destinationChildRelativePath: record.destinationChildRelativePath as string,
      deliveredAt: record.deliveredAt as string,
      authorityEnvelopeBytes: record.authorityEnvelopeBytes as Uint8Array,
      deliveryBytes: record.deliveryBytes as Uint8Array,
    });
    const withoutDigest: Omit<
      Extract<TaskAttemptCustodyWorkerIpcConversationCursorV2, { state: 'answered' }>,
      'cursorReceiptDigest'
    > = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-worker-ipc-conversation-cursor',
      state: 'answered',
      identity,
      admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      dispatchRequestId,
      sequence,
      nextSequence: sequence === TASK_ATTEMPT_CUSTODY_MAX_WORKER_IPC_QUESTIONS
        ? null
        : sequence + 1,
      predecessorCursorReceiptDigest: current.predecessorCursorReceiptDigest,
      questionCursorReceiptDigest: current.cursorReceiptDigest,
      sealedSourceReceiptDigest: current.sealedSourceReceiptDigest,
      sourceFileIdentityDigest: current.sourceFileIdentityDigest,
      sourceEpoch: current.sourceEpoch,
      questionReceiptDigest,
      answerDeliveryReceiptDigest: delivery.receiptDigest,
      answeredAt: delivery.deliveredAt,
    };
    const cursor = freezeObject({
      ...withoutDigest,
      cursorReceiptDigest: workerIpcCursorReceiptDigest(withoutDigest, policy.jsonBounds),
    });
    this.publishWorkerIpcCursorAndVerify(
      identity,
      admissionReceiptDigest,
      policy,
      workerIpcCursorPath(identity, sequence, 'answered'),
      canonicalTaskAttemptCustodyJson(cursor, policy.jsonBounds),
    );
    const persisted = this.readWorkerIpcConversationCursor({
      identity, policy, admissionReceiptDigest, dispatchRequestId,
    });
    if (persisted.state !== 'answered'
      || persisted.cursorReceiptDigest !== cursor.cursorReceiptDigest) {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    return freezeObject({ delivery, cursor: persisted });
  }

  publishHostArtifact(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly artifactClass: TaskAttemptCustodyHostAuthorityArtifactClass;
    readonly artifactKey: string;
    readonly capturedAt: string;
    readonly bytes: Uint8Array;
  }): TaskAttemptCustodyArtifactReceiptV2 {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admissionReceiptDigest',
      'artifactClass',
      'artifactKey',
      'capturedAt',
      'bytes',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'publish');
    input = Object.freeze({
      identity: cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2),
      policy: snapshotPolicy(inputRecord.policy),
      admissionReceiptDigest: inputRecord.admissionReceiptDigest as Sha256Digest,
      artifactClass: inputRecord.artifactClass as TaskAttemptCustodyHostAuthorityArtifactClass,
      artifactKey: inputRecord.artifactKey as string,
      capturedAt: inputRecord.capturedAt as string,
      bytes: snapshotAuthorityBytes(inputRecord.bytes, 'CAPABILITY_UNVERIFIED', 'publish'),
    });
    const captureMode = 'host-authority-publication' as const;
    if (input.artifactClass === 'execution-effect-landing-receipt') {
      let value: unknown;
      try {
        value = JSON.parse(Buffer.from(input.bytes).toString('utf8'));
      } catch {
        hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
      }
      const landing = parseTaskAttemptCustodyEffectLandingReceiptV2(value, input.policy);
      if (
        landing === null
        || !sameIdentity(landing.identity, input.identity)
        || landing.admissionReceiptDigest !== input.admissionReceiptDigest
        || landing.policyDigest !== input.policy.policyDigest
        || landing.releasedAt !== input.capturedAt
        || !sameBytes(
          input.bytes,
          canonicalTaskAttemptCustodyJson(landing, input.policy.jsonBounds),
        )
      ) hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
      this.requireEffectLandingReferences(landing, input.policy, 'publish');
    }
    if (input.artifactClass === 'canonical-accepted-result') {
      this.requireAcceptedResultLandingBinding({
        identity: input.identity,
        policy: input.policy,
        admissionReceiptDigest: input.admissionReceiptDigest,
        bytes: input.bytes,
      }, 'publish');
    }
    const prepared = this.prepareArtifactWrite({ ...input, captureMode }, 'publish');
    const artifact = this.publishAndVerify(
      prepared.artifactPath,
      input.bytes,
      prepared.limit,
      attemptEffectContext(input.identity, input.admissionReceiptDigest, input.policy),
    );
    return this.persistArtifactReceipt({ ...input, captureMode, prepared, artifact }, 'publish');
  }

  /**
   * Publish the immutable provider stream after the durable provider-exit boundary.
   *
   * Unlike the live append session, this one-shot host capture is restart-safe: Docker is
   * the retained stream source until cleanup, while the Store's normal durable PUBLISH
   * markers make an interrupted publication exactly replayable. The stable provider-exit
   * timestamp is the only accepted capture timestamp, so a retry cannot mint new receipt
   * bytes for the same attempt.
   */
  publishProviderStreamCapture(input: {
    readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly artifactKey: string;
    readonly capturedAt: string;
    readonly bytes: Uint8Array;
  }): TaskAttemptCustodyArtifactReceiptV2 {
    const inputRecord = requireExactDataRecord(input, [
      'admissionRef',
      'policy',
      'artifactKey',
      'capturedAt',
      'bytes',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'publish');
    const policy = snapshotPolicy(inputRecord.policy);
    const admitted = this.requireDispatchAdmissionRef(
      inputRecord.admissionRef,
      policy,
      'publish',
    );
    const terminal = this.readDispatchAuthority({ admissionRef: admitted.ref, policy });
    const providerExit = this.readOptionalDispatchObservation(
      admitted,
      policy,
      'PROVIDER_EXIT',
    );
    if (terminal.state !== 'terminal' || terminal.authority.state !== 'RELEASED'
      || providerExit === null
      || typeof inputRecord.artifactKey !== 'string'
      || !isSafeArtifactKey(inputRecord.artifactKey)
      || typeof inputRecord.capturedAt !== 'string'
      || providerExit.receipt.observedAt !== inputRecord.capturedAt) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'publish');
    }
    const bytes = snapshotAuthorityBytes(
      inputRecord.bytes,
      'CAPABILITY_UNVERIFIED',
      'publish',
    );
    const publication = Object.freeze({
      identity: cloneIdentity(admitted.ref.identity),
      policy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
      artifactClass: 'pristine-provider-stream' as const,
      artifactKey: inputRecord.artifactKey,
      capturedAt: inputRecord.capturedAt,
      bytes,
    });
    const captureMode = 'provider-stream-capture' as const;
    const prepared = this.prepareArtifactWrite(
      { ...publication, captureMode },
      'publish',
    );
    const artifact = this.publishAndVerify(
      prepared.artifactPath,
      publication.bytes,
      prepared.limit,
      attemptEffectContext(
        publication.identity,
        publication.admissionReceiptDigest,
        publication.policy,
      ),
    );
    return this.persistArtifactReceipt(
      { ...publication, captureMode, prepared, artifact },
      'publish',
    );
  }

  captureAttemptOutputArtifact(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly artifactClass: TaskAttemptCustodyAttemptOutputArtifactClass;
    readonly artifactKey: string;
    readonly capturedAt: string;
    readonly source: TaskAttemptCustodyPathCapability;
  }): TaskAttemptCustodyArtifactReceiptV2 {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admissionReceiptDigest',
      'artifactClass',
      'artifactKey',
      'capturedAt',
      'source',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'capture');
    input = Object.freeze({
      identity: cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2),
      policy: snapshotPolicy(inputRecord.policy),
      admissionReceiptDigest: inputRecord.admissionReceiptDigest as Sha256Digest,
      artifactClass: inputRecord.artifactClass as TaskAttemptCustodyAttemptOutputArtifactClass,
      artifactKey: inputRecord.artifactKey as string,
      capturedAt: inputRecord.capturedAt as string,
      source: inputRecord.source as TaskAttemptCustodyPathCapability,
    });
    const captureMode = 'attempt-output-capture' as const;
    if (
      artifactCaptureModeForClass(input.artifactClass) !== captureMode
      || !isSafeArtifactKey(input.artifactKey)
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'capture');
    const sourceScope = this.requireIssuedPathCapability(
      input.source,
      input.identity,
      input.admissionReceiptDigest,
      'capture-read-file',
    );
    const expectedScopeDigest = attemptAccessScopeDigest(
      input.identity,
      input.admissionReceiptDigest,
      input.policy,
    );
    if (sourceScope.scopeDigest !== expectedScopeDigest) {
      hold('CAPABILITY_UNVERIFIED', 'capture');
    }
    const sourceAuthority = sourceScope.attemptOutputCaptureAuthority;
    const expectedIntentDigest = attemptOutputCaptureIntentDigest({
      identity: input.identity,
      admissionReceiptDigest: input.admissionReceiptDigest,
      relativePath: sourceScope.relativePath,
      scopeDigest: sourceScope.scopeDigest,
      artifactClass: input.artifactClass,
      artifactKey: input.artifactKey,
    });
    const expectedBindingDigest = attemptOutputCaptureBindingDigest(
      expectedIntentDigest,
      sourceScope.capabilityEvidenceDigest,
    );
    if (
      sourceAuthority === null
      || sourceAuthority.sourceRole !== 'attempt-output-artifact-source'
      || sourceAuthority.artifactClass !== input.artifactClass
      || sourceAuthority.artifactKey !== input.artifactKey
      || sourceAuthority.intentDigest !== expectedIntentDigest
      || sourceAuthority.bindingDigest !== expectedBindingDigest
      || this.attemptOutputCaptureSourcesByPath.get(sourceScope.relativePath) !== input.source
    ) hold('CAPABILITY_UNVERIFIED', 'capture');
    if (sourceAuthority.state === 'CONSUMED') {
      const persisted = this.readArtifactReceipt({
        identity: input.identity,
        policy: input.policy,
        artifactClass: input.artifactClass,
        artifactKey: input.artifactKey,
      });
      if (
        persisted === null
        || sourceAuthority.receiptDigest === null
        || persisted.receiptDigest !== sourceAuthority.receiptDigest
        || persisted.capturedAt !== input.capturedAt
      ) hold('ARTIFACT_REPLAY_MISMATCH', 'capture');
      return persisted;
    }
    if (sourceAuthority.state !== 'ISSUED') hold('CAPABILITY_UNVERIFIED', 'capture');
    const prepared = this.prepareArtifactWrite({ ...input, captureMode }, 'capture');
    sourceAuthority.state = 'CAPTURING';
    const effect = attemptEffectContext(
      input.identity,
      input.admissionReceiptDigest,
      input.policy,
    );
    const descriptor = this.durableEffectDescriptor({
      ...effect,
      operation: 'PUBLISH',
      target: prepared.artifactPath,
      contentDigest: taskAttemptCustodyDigest(
        'capture-source-content-authority',
        {
          sourceRole: sourceAuthority.sourceRole,
          artifactClass: sourceAuthority.artifactClass,
          artifactKey: sourceAuthority.artifactKey,
          intentDigest: sourceAuthority.intentDigest,
          bindingDigest: sourceAuthority.bindingDigest,
          relativePath: sourceScope.relativePath,
          scopeDigest: sourceScope.scopeDigest,
          capabilityEvidenceDigest: sourceScope.capabilityEvidenceDigest,
        },
        input.policy.jsonBounds,
      ),
      sequence: 0,
    });
    try {
      const disposition = this.beginDurableEffect(descriptor, input.policy);
      let artifact: TaskAttemptCustodyFileProof;
      if (disposition === 'CONFIRMED') {
        const confirmed = this.readFirstWriterSnapshot(
          prepared.artifactPath,
          prepared.limit,
          'capture',
          'PUBLISHED_UNCONFIRMED',
        );
        if (confirmed === null) hold('RECONCILIATION_REQUIRED', 'capture');
        artifact = confirmed.proof;
      } else {
        let publication: TaskAttemptCustodyPublication;
        try {
          publication = this.adapter.captureStableFile({
            root: this.root,
            source: input.source,
            frozenRelativePath: prepared.artifactPath,
            policy: prepared.limit,
          });
        } catch (cause) {
          this.releaseDurableEffect(descriptor);
          hold(mappedAdapterHoldCode(cause, 'PUBLISHED_UNCONFIRMED'), 'capture');
        }
        try {
          artifact = this.verifyPublication(
            prepared.artifactPath,
            publication,
            prepared.limit,
            'capture',
          );
          this.completeDurableEffect(descriptor, input.policy);
        } catch {
          this.releaseDurableEffect(descriptor);
          hold('PUBLISHED_UNCONFIRMED', 'capture');
        }
      }
      const receipt = this.persistArtifactReceipt({
        ...input,
        captureMode,
        prepared,
        artifact,
      }, 'capture');
      sourceAuthority.receiptDigest = receipt.receiptDigest;
      sourceAuthority.state = 'CONSUMED';
      return receipt;
    } catch (error) {
      sourceAuthority.state = 'REVOKED';
      this.revokedPathCapabilities.add(input.source);
      throw error;
    }
  }

  beginProviderStreamCapture(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly artifactKey: string;
  }): TaskAttemptCustodyArtifactWriteSession {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admissionReceiptDigest',
      'artifactKey',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'seal-stream');
    const identity = cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(inputRecord.policy);
    if (
      !isDigest(inputRecord.admissionReceiptDigest)
      || typeof inputRecord.artifactKey !== 'string'
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'seal-stream');
    input = Object.freeze({
      identity,
      policy,
      admissionReceiptDigest: inputRecord.admissionReceiptDigest,
      artifactKey: inputRecord.artifactKey,
    });
    const artifactClass = 'pristine-provider-stream' as const;
    const captureMode = 'provider-stream-capture' as const;
    const prepared = this.prepareArtifactWrite(
      {
        ...input,
        artifactClass,
        captureMode,
        capturedAt: '1970-01-01T00:00:00.000Z',
      },
      'seal-stream',
      false,
    );
    const effect = attemptEffectContext(
      input.identity,
      input.admissionReceiptDigest,
      input.policy,
    );
    const createDescriptor = this.durableEffectDescriptor({
      ...effect,
      operation: 'CREATE',
      target: prepared.artifactPath,
      contentDigest: null,
      sequence: 0,
    });
    if (this.beginDurableEffect(createDescriptor, input.policy) !== 'EXECUTE') {
      hold('RECONCILIATION_REQUIRED', 'seal-stream');
    }
    let beginValue: TaskAttemptCustodyAdapterBeginPublicationResult;
    try {
      beginValue = this.adapter.beginFirstWriterPublication({
        root: this.root,
        relativePath: prepared.artifactPath,
        policy: prepared.limit,
        effectOpDigest: createDescriptor.opDigest,
        scopeDigest: createDescriptor.scopeDigest,
        generation: input.identity.generation,
      });
    } catch {
      this.releaseDurableEffect(createDescriptor);
      hold('CREATE_UNCONFIRMED', 'seal-stream');
    }
    let beginResult: TaskAttemptCustodyAdapterBeginPublicationResult;
    try {
      beginResult = snapshotAdapterBeginPublicationResult(beginValue, {
        opDigest: createDescriptor.opDigest,
        scopeDigest: createDescriptor.scopeDigest,
        generation: input.identity.generation,
      });
    } catch {
      this.releaseDurableEffect(createDescriptor);
      hold('CREATE_UNCONFIRMED', 'seal-stream');
    }
    if (beginResult.state !== 'CREATED') {
      this.releaseDurableEffect(createDescriptor);
      hold(
        beginResult.state === 'NO_EFFECT_ABORTED'
          ? 'NO_EFFECT_ABORTED'
          : beginResult.state === 'CLEANUP_UNCONFIRMED'
            ? 'CLEANUP_UNCONFIRMED'
            : 'CREATE_UNCONFIRMED',
        'seal-stream',
      );
    }
    const publicationToken = beginResult.publication as TaskAttemptCustodyAdapterPublicationToken;
    const publicationTokenExpected = Object.freeze({
      identity: input.identity,
      admissionReceiptDigest: input.admissionReceiptDigest,
      policyDigest: input.policy.policyDigest,
      scopeDigest: createDescriptor.scopeDigest,
      generation: input.identity.generation,
      createOpDigest: createDescriptor.opDigest,
      target: prepared.artifactPath,
    });
    let publicationTokenScope: IssuedPublicationTokenScope;
    try {
      publicationTokenScope = this.registerPublicationToken(
        publicationToken,
        publicationTokenExpected,
      );
    } catch {
      this.releaseDurableEffect(createDescriptor);
      hold('CLEANUP_UNCONFIRMED', 'seal-stream');
    }
    try {
      this.completeDurableEffect(createDescriptor, input.policy);
    } catch {
      const cleanupDescriptor = this.durableEffectDescriptor({
        ...effect,
        operation: 'ABORT',
        target: prepared.artifactPath,
        contentDigest: null,
        sequence: 0,
      });
      try {
        this.requirePublicationToken(
          publicationToken,
          publicationTokenExpected,
          ['OPEN'],
          'CLEANUP_UNCONFIRMED',
        );
        publicationTokenScope.state = 'ABORTING';
        if (this.beginDurableEffect(cleanupDescriptor, input.policy) !== 'EXECUTE') {
          hold('CLEANUP_UNCONFIRMED', 'seal-stream');
        }
        const cleanup = snapshotAdapterAbortResult(
          this.adapter.abortFirstWriterPublication({
            publication: publicationToken,
            effectOpDigest: cleanupDescriptor.opDigest,
            scopeDigest: cleanupDescriptor.scopeDigest,
            generation: input.identity.generation,
          }),
          {
            effectOpDigest: cleanupDescriptor.opDigest,
            scopeDigest: cleanupDescriptor.scopeDigest,
            generation: input.identity.generation,
          },
        );
        this.completeDurableEffect(cleanupDescriptor, input.policy, {
          receiptDigest: cleanup.receiptDigest,
          evidenceDigest: cleanup.evidenceDigest,
        });
        if (cleanup.state !== 'ABORTED') {
          publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
          hold('CLEANUP_UNCONFIRMED', 'seal-stream');
        }
        publicationTokenScope.state = 'ABORTED';
        this.revokedPublicationTokens.add(publicationToken);
      } catch {
        publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
        this.releaseDurableEffect(cleanupDescriptor);
        this.releaseDurableEffect(createDescriptor);
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      this.releaseDurableEffect(createDescriptor);
      hold('RECONCILIATION_REQUIRED', 'seal-stream');
    }
    let state: TaskAttemptCustodyArtifactWriteSession['state'] = 'OPEN';
    let byteLength = 0;
    let appendSequence = 0;
    let streamHash = createHash('sha256');
    const synchronizeTokenState = (): void => {
      if (publicationTokenScope.state === 'CLEANUP_UNCONFIRMED') {
        state = 'CLEANUP_UNCONFIRMED';
      }
    };
    const knownContentDigest = (): Sha256Digest => (
      `sha256:${streamHash.copy().digest('hex')}` as Sha256Digest
    );
    const terminalHold = (): never => {
      if (state === 'APPENDING' || state === 'APPEND_FAILED') {
        hold('APPEND_FAILED', 'seal-stream');
      }
      if (state === 'SEALING') hold('RECONCILIATION_REQUIRED', 'seal-stream');
      if (state === 'PUBLISHING' || state === 'PUBLISHED_UNCONFIRMED') {
        hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
      }
      if (state === 'ABORTING' || state === 'CLEANUP_UNCONFIRMED') {
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      hold('ARTIFACT_CHANGED', 'seal-stream');
    };
    const abortAdapterPublication = (allowSealing = false): void => {
      synchronizeTokenState();
      if (state === 'ABORTED') return;
      if (
        state !== 'OPEN'
        && state !== 'APPEND_FAILED'
        && !(allowSealing && state === 'SEALING')
      ) {
        terminalHold();
      }
      this.requirePublicationToken(
        publicationToken,
        publicationTokenExpected,
        allowSealing ? ['OPEN', 'APPEND_FAILED', 'SEALING'] : ['OPEN', 'APPEND_FAILED'],
        'CLEANUP_UNCONFIRMED',
      );
      state = 'ABORTING';
      publicationTokenScope.state = 'ABORTING';
      const descriptor = this.durableEffectDescriptor({
        ...effect,
        operation: 'ABORT',
        target: prepared.artifactPath,
        contentDigest: knownContentDigest(),
        sequence: appendSequence,
      });
      let disposition: 'EXECUTE' | 'CONFIRMED';
      try {
        disposition = this.beginDurableEffect(descriptor, input.policy);
      } catch {
        this.releaseDurableEffect(descriptor);
        state = 'CLEANUP_UNCONFIRMED';
        publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      if (disposition !== 'EXECUTE') {
        this.releaseDurableEffect(descriptor);
        state = 'CLEANUP_UNCONFIRMED';
        publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      let abortValue: TaskAttemptCustodyAdapterAbortResult;
      try {
        abortValue = this.adapter.abortFirstWriterPublication({
          publication: publicationToken,
          effectOpDigest: descriptor.opDigest,
          scopeDigest: descriptor.scopeDigest,
          generation: input.identity.generation,
        });
      } catch {
        this.releaseDurableEffect(descriptor);
        state = 'CLEANUP_UNCONFIRMED';
        publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      let abortResult: TaskAttemptCustodyAdapterAbortResult;
      try {
        abortResult = snapshotAdapterAbortResult(abortValue, {
          effectOpDigest: descriptor.opDigest,
          scopeDigest: descriptor.scopeDigest,
          generation: input.identity.generation,
        });
      } catch {
        this.releaseDurableEffect(descriptor);
        state = 'CLEANUP_UNCONFIRMED';
        publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      try {
        this.completeDurableEffect(descriptor, input.policy, {
          receiptDigest: abortResult.receiptDigest,
          evidenceDigest: abortResult.evidenceDigest,
        });
      } catch {
        this.releaseDurableEffect(descriptor);
        state = 'CLEANUP_UNCONFIRMED';
        publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      if (abortResult.state !== 'ABORTED') {
        state = 'CLEANUP_UNCONFIRMED';
        publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
        hold('CLEANUP_UNCONFIRMED', 'seal-stream');
      }
      state = 'ABORTED';
      publicationTokenScope.state = 'ABORTED';
      this.revokedPublicationTokens.add(publicationToken);
    };
    const abortForHold = (code: TaskAttemptCustodyHoldCode): never => {
      abortAdapterPublication(true);
      hold(code, 'seal-stream');
    };
    const session: TaskAttemptCustodyArtifactWriteSession = {
      get state() {
        synchronizeTokenState();
        return state;
      },
      get byteLength() { return byteLength; },
      append: chunk => {
        synchronizeTokenState();
        if (state !== 'OPEN') terminalHold();
        try {
          this.requirePublicationToken(
            publicationToken,
            publicationTokenExpected,
            ['OPEN'],
            'APPEND_FAILED',
          );
        } catch {
          state = 'APPEND_FAILED';
          publicationTokenScope.state = 'APPEND_FAILED';
          hold('APPEND_FAILED', 'seal-stream');
        }
        let capturedChunk: Uint8Array;
        try {
          capturedChunk = snapshotAuthorityBytes(
            chunk,
            'ARTIFACT_CHANGED',
            'seal-stream',
          );
        } catch {
          return abortForHold('ARTIFACT_CHANGED');
        }
        const nextByteLength = byteLength + capturedChunk.byteLength;
        if (!Number.isSafeInteger(nextByteLength) || nextByteLength > prepared.limit.maxBytes) {
          abortForHold('ARTIFACT_OVERSIZE');
        }
        const nextSequence = appendSequence + 1;
        let nextStreamHash: ReturnType<typeof createHash>;
        try {
          nextStreamHash = streamHash.copy();
          nextStreamHash.update(capturedChunk);
        } catch {
          return abortForHold('APPEND_FAILED');
        }
        state = 'APPENDING';
        publicationTokenScope.state = 'APPENDING';
        let descriptor: DurableEffectDescriptor | null = null;
        try {
          descriptor = this.durableEffectDescriptor({
            ...effect,
            operation: 'APPEND',
            target: prepared.artifactPath,
            contentDigest: rawSha256(capturedChunk),
            sequence: nextSequence,
          });
          if (this.beginDurableEffect(descriptor, input.policy) !== 'EXECUTE') {
            hold('RECONCILIATION_REQUIRED', 'seal-stream');
          }
          const adapterChunk = new IntrinsicUint8Array(capturedChunk.byteLength);
          intrinsicReflectApply(intrinsicTypedArraySet, adapterChunk, [capturedChunk]);
          const appendResult = this.adapter.appendFirstWriterPublication({
            publication: publicationToken,
            bytes: adapterChunk,
            effectOpDigest: descriptor.opDigest,
            scopeDigest: descriptor.scopeDigest,
            generation: input.identity.generation,
          });
          const appendReceipt = snapshotAdapterAppendResult(appendResult, {
            byteLength: capturedChunk.byteLength,
            effectOpDigest: descriptor.opDigest,
            scopeDigest: descriptor.scopeDigest,
            generation: input.identity.generation,
          });
          if (!sameBytes(adapterChunk, capturedChunk)) {
            hold('APPEND_FAILED', 'seal-stream');
          }
          this.completeDurableEffect(descriptor, input.policy, {
            receiptDigest: appendReceipt.receiptDigest,
            evidenceDigest: appendReceipt.evidenceDigest,
          });
        } catch (error) {
          if (descriptor !== null) this.releaseDurableEffect(descriptor);
          state = 'APPEND_FAILED';
          publicationTokenScope.state = 'APPEND_FAILED';
          hold(mappedAdapterHoldCode(error, 'APPEND_FAILED'), 'seal-stream');
        }
        streamHash = nextStreamHash;
        byteLength = nextByteLength;
        appendSequence = nextSequence;
        state = 'OPEN';
        publicationTokenScope.state = 'OPEN';
      },
      seal: sealInput => {
        synchronizeTokenState();
        if (state !== 'OPEN') terminalHold();
        try {
          this.requirePublicationToken(
            publicationToken,
            publicationTokenExpected,
            ['OPEN'],
            'PUBLISHED_UNCONFIRMED',
          );
        } catch {
          state = 'PUBLISHED_UNCONFIRMED';
          publicationTokenScope.state = 'PUBLISHED_UNCONFIRMED';
          hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
        }
        const sealRecord = snapshotExactDataRecord(sealInput, ['capturedAt']);
        const capturedAt = sealRecord?.capturedAt;
        if (
          typeof capturedAt !== 'string'
          || !isTimestamp(capturedAt)
        ) {
          return abortForHold('ARTIFACT_REPLAY_MISMATCH');
        }
        if (
          byteLength < prepared.limit.minBytes
          || Date.parse(capturedAt) < Date.parse(prepared.admission.admittedAt)
        ) abortForHold('ARTIFACT_REPLAY_MISMATCH');
        state = 'SEALING';
        publicationTokenScope.state = 'SEALING';
        let descriptor: DurableEffectDescriptor;
        try {
          descriptor = this.durableEffectDescriptor({
            ...effect,
            operation: 'PUBLISH',
            target: prepared.artifactPath,
            contentDigest: knownContentDigest(),
            sequence: appendSequence,
          });
          if (this.beginDurableEffect(descriptor, input.policy) !== 'EXECUTE') {
            hold('RECONCILIATION_REQUIRED', 'seal-stream');
          }
        } catch {
          return abortForHold('RECONCILIATION_REQUIRED');
        }
        state = 'PUBLISHING';
        publicationTokenScope.state = 'PUBLISHING';
        let sealValue: TaskAttemptCustodyAdapterSealResult;
        try {
          sealValue = this.adapter.sealFirstWriterPublication({
            publication: publicationToken,
            effectOpDigest: descriptor.opDigest,
            scopeDigest: descriptor.scopeDigest,
            generation: input.identity.generation,
          });
        } catch {
          this.releaseDurableEffect(descriptor);
          state = 'PUBLISHED_UNCONFIRMED';
          publicationTokenScope.state = 'PUBLISHED_UNCONFIRMED';
          return hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
        }
        let sealResult: TaskAttemptCustodyAdapterSealResult;
        try {
          sealResult = snapshotAdapterSealResult(sealValue, {
            opDigest: descriptor.opDigest,
            scopeDigest: descriptor.scopeDigest,
            generation: input.identity.generation,
          });
        } catch {
          this.releaseDurableEffect(descriptor);
          state = 'PUBLISHED_UNCONFIRMED';
          publicationTokenScope.state = 'PUBLISHED_UNCONFIRMED';
          return hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
        }
        if (sealResult.state !== 'PUBLISHED') {
          this.releaseDurableEffect(descriptor);
          if (sealResult.state === 'NO_EFFECT_ABORTED') {
            state = 'ABORTED';
            publicationTokenScope.state = 'ABORTED';
            this.revokedPublicationTokens.add(publicationToken);
            return hold('NO_EFFECT_ABORTED', 'seal-stream');
          }
          if (sealResult.state === 'CLEANUP_UNCONFIRMED') {
            state = 'CLEANUP_UNCONFIRMED';
            publicationTokenScope.state = 'CLEANUP_UNCONFIRMED';
            return hold('CLEANUP_UNCONFIRMED', 'seal-stream');
          }
          state = 'PUBLISHED_UNCONFIRMED';
          publicationTokenScope.state = 'PUBLISHED_UNCONFIRMED';
          return hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
        }
        const publication = sealResult.publication as TaskAttemptCustodyPublication;
        state = 'PUBLISHED_UNCONFIRMED';
        publicationTokenScope.state = 'PUBLISHED_UNCONFIRMED';
        try {
          const artifact = this.verifyPublication(
            prepared.artifactPath,
            publication,
            prepared.limit,
            'seal-stream',
          );
          if (
            artifact.byteLength !== byteLength
            || artifact.sha256 !== descriptor.contentDigest
          ) hold('ARTIFACT_CHANGED', 'seal-stream');
          this.completeDurableEffect(descriptor, input.policy);
          const receipt = this.persistArtifactReceipt({
            ...input,
            artifactClass,
            captureMode,
            capturedAt,
            prepared,
            artifact,
          }, 'seal-stream');
          state = 'SEALED';
          publicationTokenScope.state = 'SEALED';
          this.revokedPublicationTokens.add(publicationToken);
          return receipt;
        } catch {
          this.releaseDurableEffect(descriptor);
          state = 'PUBLISHED_UNCONFIRMED';
          publicationTokenScope.state = 'PUBLISHED_UNCONFIRMED';
          return hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
        }
      },
      abort: () => {
        synchronizeTokenState();
        if (state === 'ABORTED' || state === 'SEALED') return;
        abortAdapterPublication(false);
      },
    };
    return Object.freeze(session);
  }

  readArtifactReceipt(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly artifactClass: Exclude<
      TaskAttemptCustodyArtifactClass,
      'task-admission-snapshot'
    >;
    readonly artifactKey: string;
  }): TaskAttemptCustodyArtifactReceiptV2 | null {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'artifactClass',
      'artifactKey',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'read');
    input = Object.freeze({
      identity: cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2),
      policy: snapshotPolicy(inputRecord.policy),
      artifactClass: inputRecord.artifactClass as Exclude<
        TaskAttemptCustodyArtifactClass,
        'task-admission-snapshot'
      >,
      artifactKey: inputRecord.artifactKey as string,
    });
    this.assertStoreIdentity(input.identity, 'read');
    assertPolicy(input.policy);
    if (
      input.artifactClass === ('task-admission-snapshot' as TaskAttemptCustodyArtifactClass)
      || !isTaskAttemptCustodyArtifactClass(input.artifactClass)
    ) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    }
    if (!isSafeArtifactKey(input.artifactKey)) hold('UNSAFE_RELATIVE_PATH', 'read');
    const prefix = identityPrefix(input.identity);
    const receiptPath = childPath(
      prefix,
      'artifacts',
      input.artifactClass,
      `${input.artifactKey}.receipt.json`,
    );
    const expectedArtifactPath = taskAttemptCustodyArtifactDataRelativePath(input);
    const observed = this.readFirstWriterSnapshot(
      receiptPath,
      metadataLimit(input.policy),
      'read',
    );
    if (observed === null) {
      const orphanedArtifact = this.readFirstWriterSnapshot(
        expectedArtifactPath,
        input.policy.artifactLimits[input.artifactClass],
        'read',
      );
      if (orphanedArtifact !== null) hold('INCOMPLETE_PUBLICATION', 'read');
      return null;
    }
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const receipt = parseTaskAttemptCustodyArtifactReceiptV2(value, input.policy);
    if (
      !receipt
      || !sameIdentity(receipt.identity, input.identity)
      || receipt.artifactClass !== input.artifactClass
      || receipt.artifactKey !== input.artifactKey
    ) hold('CORRUPT_CUSTODY_RECORD', 'read');
    if (!sameBytes(
      observed.bytes,
      canonicalTaskAttemptCustodyJson(receipt, input.policy.jsonBounds),
    )) hold('CORRUPT_CUSTODY_RECORD', 'read');
    if (receipt.artifact.relativePath !== expectedArtifactPath) {
      hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const admission = this.readAdmission(input.identity, input.policy);
    if (!admission || receipt.admissionReceiptDigest !== admission.receiptDigest) {
      hold('ADMISSION_MISMATCH', 'read');
    }
    const effect = attemptEffectContext(input.identity, admission.receiptDigest, input.policy);
    this.requireCompletedDurableEffect(this.durableEffectDescriptor({
      ...effect,
      operation: 'PUBLISH',
      target: receiptPath,
      contentDigest: rawSha256(observed.bytes),
      sequence: 0,
    }), input.policy, 'read');
    if (Date.parse(receipt.capturedAt) < Date.parse(admission.admittedAt)) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    }
    const artifact = this.readVerifiedSnapshot(
      receipt.artifact,
      input.policy.artifactLimits[input.artifactClass],
      'read',
    );
    if (artifact === null) hold('INCOMPLETE_PUBLICATION', 'read');
    if (!sameProof(artifact.proof, receipt.artifact)) {
      hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    return receipt;
  }

  readEffectLandingReceipt(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly artifactKey: string;
  }): TaskAttemptCustodyEffectLandingReceiptV2 | null {
    return this.readVerifiedEffectLanding(input)?.landing ?? null;
  }

  readVerifiedEffectLanding(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly artifactKey: string;
  }): TaskAttemptCustodyVerifiedEffectLandingV2 | null {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'artifactKey',
    ], 'ARTIFACT_REPLAY_MISMATCH', 'read');
    input = Object.freeze({
      identity: cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2),
      policy: snapshotPolicy(inputRecord.policy),
      artifactKey: inputRecord.artifactKey as string,
    });
    const artifactReceipt = this.readArtifactReceipt({
      identity: input.identity,
      policy: input.policy,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: input.artifactKey,
    });
    if (artifactReceipt === null) return null;
    const observed = this.readVerifiedSnapshot(
      artifactReceipt.artifact,
      input.policy.artifactLimits['execution-effect-landing-receipt'],
      'read',
    );
    if (observed === null || !sameProof(observed.proof, artifactReceipt.artifact)) {
      hold('INCOMPLETE_PUBLICATION', 'read');
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(observed.bytes).toString('utf8'));
    } catch {
      hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    }
    const landing = parseTaskAttemptCustodyEffectLandingReceiptV2(value, input.policy);
    if (
      landing === null
      || !sameIdentity(landing.identity, input.identity)
      || landing.admissionReceiptDigest !== artifactReceipt.admissionReceiptDigest
      || landing.policyDigest !== input.policy.policyDigest
      || landing.releasedAt !== artifactReceipt.capturedAt
      || !sameBytes(
        observed.bytes,
        canonicalTaskAttemptCustodyJson(landing, input.policy.jsonBounds),
      )
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    const references = this.requireEffectLandingReferences(landing, input.policy, 'read');
    return intrinsicObjectFreeze({
      landing,
      verifiedBundle: references.verifiedBundle,
      workspaceRelease: references.workspaceRelease,
    });
  }

  appendChain(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly stage: TaskAttemptCustodyChainStage;
    readonly occurredAt: string;
    readonly predecessorDigest: Sha256Digest;
    readonly artifactReceipt: TaskAttemptCustodyArtifactReceiptV2;
  }): TaskAttemptCustodyChainReceiptV2 {
    const inputRecord = requireExactDataRecord(input, [
      'identity',
      'policy',
      'admissionReceiptDigest',
      'stage',
      'occurredAt',
      'predecessorDigest',
      'artifactReceipt',
    ], 'CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
    const identity = cloneIdentity(inputRecord.identity as TaskAttemptCustodyIdentityV2);
    const policy = snapshotPolicy(inputRecord.policy);
    const artifactReceipt = parseTaskAttemptCustodyArtifactReceiptV2(
      inputRecord.artifactReceipt,
      policy,
    );
    if (artifactReceipt === null) hold('ARTIFACT_REPLAY_MISMATCH', 'append-chain');
    input = Object.freeze({
      identity,
      policy,
      admissionReceiptDigest: inputRecord.admissionReceiptDigest as Sha256Digest,
      stage: inputRecord.stage as TaskAttemptCustodyChainStage,
      occurredAt: inputRecord.occurredAt as string,
      predecessorDigest: inputRecord.predecessorDigest as Sha256Digest,
      artifactReceipt,
    });
    this.assertStoreIdentity(input.identity, 'append-chain');
    assertPolicy(input.policy);
    if (!TASK_ATTEMPT_CUSTODY_CHAIN_STAGES.includes(input.stage)) {
      hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
    }
    if (!isTimestamp(input.occurredAt)) hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
    const admission = this.readAdmission(input.identity, input.policy);
    if (!admission) hold('ADMISSION_REQUIRED', 'append-chain');
    const expectedArtifactClass = CHAIN_ARTIFACT_CLASS[input.stage];
    if (
      admission.receiptDigest !== input.admissionReceiptDigest
      || !sameIdentity(input.artifactReceipt.identity, input.identity)
      || input.artifactReceipt.admissionReceiptDigest !== admission.receiptDigest
      || input.artifactReceipt.artifactClass !== expectedArtifactClass
      || input.artifactReceipt.captureMode !== 'host-authority-publication'
      || !parseTaskAttemptCustodyArtifactReceiptV2(input.artifactReceipt, input.policy)
    ) hold('ARTIFACT_REPLAY_MISMATCH', 'append-chain');
    const persistedArtifact = this.readArtifactReceipt({
      identity: input.identity,
      policy: input.policy,
      artifactClass: expectedArtifactClass,
      artifactKey: input.artifactReceipt.artifactKey,
    });
    if (!persistedArtifact || persistedArtifact.receiptDigest !== input.artifactReceipt.receiptDigest) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'append-chain');
    }
    if (input.stage === 'effect-landing') {
      const landing = this.readEffectLandingReceipt({
        identity: input.identity,
        policy: input.policy,
        artifactKey: persistedArtifact.artifactKey,
      });
      if (
        landing === null
        || landing.releasedAt !== persistedArtifact.capturedAt
      ) hold('ARTIFACT_REPLAY_MISMATCH', 'append-chain');
    }
    if (input.stage === 'accepted-result') {
      const accepted = this.readVerifiedSnapshot(
        persistedArtifact.artifact,
        input.policy.artifactLimits['canonical-accepted-result'],
        'read',
      );
      if (accepted === null || !sameProof(accepted.proof, persistedArtifact.artifact)) {
        hold('INCOMPLETE_PUBLICATION', 'append-chain');
      }
      const binding = this.requireAcceptedResultLandingBinding({
        identity: input.identity,
        policy: input.policy,
        admissionReceiptDigest: admission.receiptDigest,
        bytes: accepted.bytes,
      }, 'append-chain');
      if (binding.effectLandingChainDigest !== input.predecessorDigest) {
        hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
      }
    }
    if (
      Date.parse(persistedArtifact.capturedAt) < Date.parse(admission.admittedAt)
      || Date.parse(input.occurredAt) < Date.parse(persistedArtifact.capturedAt)
    ) hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');

    const stageIndex = TASK_ATTEMPT_CUSTODY_CHAIN_STAGES.indexOf(input.stage);
    let expectedPredecessor = admission.receiptDigest;
    if (stageIndex > 0) {
      const previousStage = TASK_ATTEMPT_CUSTODY_CHAIN_STAGES[stageIndex - 1];
      if (previousStage === undefined) hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
      const previous = this.readChain(input.identity, input.policy, previousStage);
      if (!previous) hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
      if (
        Date.parse(persistedArtifact.capturedAt) < Date.parse(previous.occurredAt)
        || Date.parse(input.occurredAt) < Date.parse(previous.occurredAt)
      ) {
        hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
      }
      expectedPredecessor = previous.receiptDigest;
    }
    if (input.predecessorDigest !== expectedPredecessor) {
      hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
    }
    const withoutDigest = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-chain' as const,
      identity: cloneIdentity(input.identity),
      admissionReceiptDigest: admission.receiptDigest,
      stage: input.stage,
      occurredAt: input.occurredAt,
      predecessorDigest: input.predecessorDigest,
      artifactReceiptDigest: input.artifactReceipt.receiptDigest,
      artifactKey: input.artifactReceipt.artifactKey,
    };
    const receipt: TaskAttemptCustodyChainReceiptV2 = Object.freeze({
      ...withoutDigest,
      receiptDigest: chainReceiptDigest(withoutDigest, input.policy.jsonBounds),
    });
    const path = chainStagePath(identityPrefix(input.identity), input.stage);
    const bytes = canonicalTaskAttemptCustodyJson(receipt, input.policy.jsonBounds);
    this.publishAndVerify(
      path,
      bytes,
      metadataLimit(input.policy),
      attemptEffectContext(input.identity, admission.receiptDigest, input.policy),
    );
    const persisted = this.readChain(input.identity, input.policy, input.stage);
    if (!persisted || persisted.receiptDigest !== receipt.receiptDigest) {
      hold('CHAIN_PREDECESSOR_MISMATCH', 'append-chain');
    }
    return persisted;
  }

  readChain(
    identity: TaskAttemptCustodyIdentityV2,
    policy: TaskAttemptCustodyPolicyV2,
    stage: TaskAttemptCustodyChainStage,
  ): TaskAttemptCustodyChainReceiptV2 | null {
    identity = cloneIdentity(identity);
    policy = snapshotPolicy(policy);
    this.assertStoreIdentity(identity, 'read');
    assertPolicy(policy);
    if (!TASK_ATTEMPT_CUSTODY_CHAIN_STAGES.includes(stage)) {
      hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
    }
    const path = chainStagePath(identityPrefix(identity), stage);
    const observed = this.readFirstWriterSnapshot(path, metadataLimit(policy), 'read');
    if (observed === null) {
      const stageIndex = TASK_ATTEMPT_CUSTODY_CHAIN_STAGES.indexOf(stage);
      for (const laterStage of TASK_ATTEMPT_CUSTODY_CHAIN_STAGES.slice(stageIndex + 1)) {
        const later = this.readFirstWriterSnapshot(
          chainStagePath(identityPrefix(identity), laterStage),
          metadataLimit(policy),
          'read',
        );
        if (later !== null) hold('INCOMPLETE_PUBLICATION', 'read');
      }
      return null;
    }
    let value: unknown;
    try { value = JSON.parse(Buffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const receipt = parseTaskAttemptCustodyChainReceiptV2(value, policy);
    if (!receipt || !sameIdentity(receipt.identity, identity) || receipt.stage !== stage) {
      hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    if (!sameBytes(
      observed.bytes,
      canonicalTaskAttemptCustodyJson(receipt, policy.jsonBounds),
    )) hold('CORRUPT_CUSTODY_RECORD', 'read');
    const admission = this.readAdmission(identity, policy);
    if (!admission || receipt.admissionReceiptDigest !== admission.receiptDigest) {
      hold('ADMISSION_MISMATCH', 'read');
    }
    this.requireCompletedDurableEffect(this.durableEffectDescriptor({
      ...attemptEffectContext(identity, admission.receiptDigest, policy),
      operation: 'PUBLISH',
      target: path,
      contentDigest: rawSha256(observed.bytes),
      sequence: 0,
    }), policy, 'read');
    const stageIndex = TASK_ATTEMPT_CUSTODY_CHAIN_STAGES.indexOf(stage);
    if (stageIndex === 0 && receipt.predecessorDigest !== admission.receiptDigest) {
      hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
    }
    const artifact = this.readArtifactReceipt({
      identity,
      policy,
      artifactClass: CHAIN_ARTIFACT_CLASS[stage],
      artifactKey: receipt.artifactKey,
    });
    if (!artifact || artifact.receiptDigest !== receipt.artifactReceiptDigest) {
      hold('ARTIFACT_REPLAY_MISMATCH', 'read');
    }
    if (stage === 'effect-landing') {
      const landing = this.readEffectLandingReceipt({
        identity,
        policy,
        artifactKey: artifact.artifactKey,
      });
      if (landing === null || landing.releasedAt !== artifact.capturedAt) {
        hold('ARTIFACT_REPLAY_MISMATCH', 'read');
      }
    }
    if (stage === 'accepted-result') {
      const accepted = this.readVerifiedSnapshot(
        artifact.artifact,
        policy.artifactLimits['canonical-accepted-result'],
        'read',
      );
      if (accepted === null || !sameProof(accepted.proof, artifact.artifact)) {
        hold('INCOMPLETE_PUBLICATION', 'read');
      }
      const binding = this.requireAcceptedResultLandingBinding({
        identity,
        policy,
        admissionReceiptDigest: admission.receiptDigest,
        bytes: accepted.bytes,
      }, 'read');
      if (binding.effectLandingChainDigest !== receipt.predecessorDigest) {
        hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
      }
    }
    if (
      Date.parse(artifact.capturedAt) < Date.parse(admission.admittedAt)
      || Date.parse(receipt.occurredAt) < Date.parse(artifact.capturedAt)
    ) hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
    if (stageIndex > 0) {
      const previousStage = TASK_ATTEMPT_CUSTODY_CHAIN_STAGES[stageIndex - 1];
      if (previousStage === undefined) hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
      const previous = this.readChain(identity, policy, previousStage);
      if (
        !previous
        || receipt.predecessorDigest !== previous.receiptDigest
        || Date.parse(artifact.capturedAt) < Date.parse(previous.occurredAt)
        || Date.parse(receipt.occurredAt) < Date.parse(previous.occurredAt)
      ) {
        hold('CHAIN_PREDECESSOR_MISMATCH', 'read');
      }
    }
    return receipt;
  }

  private requireEffectLandingReferences(
    landing: TaskAttemptCustodyEffectLandingReceiptV2,
    policy: TaskAttemptCustodyPolicyV2,
    operation: 'publish' | 'read' | 'append-chain',
  ): Readonly<{
    readonly verifiedBundle: VerifiedExecutionEffectPersistenceBundleV1;
    readonly workspaceRelease: ExecutionEffectWorkspaceReleaseV1;
  }> {
    const admission = this.readAdmission(landing.identity, policy);
    if (
      admission === null
      || landing.admissionReceiptDigest !== admission.receiptDigest
      || landing.policyDigest !== policy.policyDigest
    ) hold('ADMISSION_MISMATCH', operation);

    const requireReference = (
      artifactClass: Exclude<TaskAttemptCustodyHostAuthorityArtifactClass,
        | 'worker-ipc-answer'
        | 'execution-effect-landing-receipt'
        | 'canonical-accepted-result'
        | 'evaluation-receipt'
        | 'finalizer-receipt'
        | 'settlement-receipt'
        | 'archive-receipt'>,
      reference: TaskAttemptCustodyEffectArtifactRefV2,
    ): TaskAttemptCustodyArtifactReceiptV2 => {
      const persisted = this.readArtifactReceipt({
        identity: landing.identity,
        policy,
        artifactClass,
        artifactKey: reference.artifactKey,
      });
      if (
        persisted === null
        || persisted.receiptDigest !== reference.artifactReceiptDigest
        || persisted.captureMode !== 'host-authority-publication'
      ) hold('ARTIFACT_REPLAY_MISMATCH', operation);
      return persisted;
    };

    const workspaceSnapshot = requireReference(
      'execution-workspace-snapshot',
      landing.workspaceSnapshot,
    );
    const baselineManifest = requireReference(
      'execution-effect-manifest',
      landing.baselineManifest,
    );
    const finalManifest = requireReference(
      'execution-effect-manifest',
      landing.finalManifest,
    );
    const stagedContents = intrinsicArrayMap(
      landing.stagedContents,
      reference => requireReference('execution-effect-staged-content', reference),
    );
    const landingJournal = requireReference(
      'execution-effect-landing-journal',
      landing.landingJournal,
    );
    const workspaceRelease = requireReference(
      'execution-workspace-release',
      landing.workspaceRelease,
    );

    const readReferenceBytes = (
      receipt: TaskAttemptCustodyArtifactReceiptV2,
    ): Uint8Array => {
      const observed = this.readVerifiedSnapshot(
        receipt.artifact,
        policy.artifactLimits[receipt.artifactClass],
        operation === 'publish' ? 'publish' : 'read',
      );
      if (observed === null || !sameProof(observed.proof, receipt.artifact)) {
        hold('INCOMPLETE_PUBLICATION', operation);
      }
      return observed.bytes;
    };

    const stagedArtifacts: ExecutionEffectPersistenceArtifactV1[] = intrinsicArrayMap(
      stagedContents,
      staged => Object.freeze({
        artifactKey: staged.artifactKey,
        artifactReceiptDigest: staged.receiptDigest,
        bytes: readReferenceBytes(staged),
      }),
    );
    const workspaceBytes = readReferenceBytes(workspaceSnapshot);
    const terminalBytes = readReferenceBytes(landingJournal);
    let workspaceValue: unknown;
    let terminalValue: unknown;
    try {
      workspaceValue = JSON.parse(Buffer.from(workspaceBytes).toString('utf8'));
      terminalValue = JSON.parse(Buffer.from(terminalBytes).toString('utf8'));
    } catch {
      return hold('ARTIFACT_REPLAY_MISMATCH', operation);
    }
    const workspaceSeal = parseExecutionEffectWorkspaceSnapshotSealV1(workspaceValue);
    const terminalSeal = workspaceSeal && parseExecutionEffectLandingTerminalSealV1(
      terminalValue,
      { attempt: workspaceSeal.attempt, attemptDigest: workspaceSeal.attemptDigest },
    );
    if (!workspaceSeal || !terminalSeal) hold('ARTIFACT_REPLAY_MISMATCH', operation);
    const journalReferences = [
      terminalSeal.journalArtifacts.prepared,
      ...(terminalSeal.journalArtifacts.applying
        ? [terminalSeal.journalArtifacts.applying] : []),
      ...terminalSeal.journalArtifacts.steps,
      terminalSeal.journalArtifacts.committed,
    ];
    const journalArtifacts: ExecutionEffectLandingJournalArtifactV1[] = intrinsicArrayMap(
      journalReferences,
      reference => {
        const receipt = requireReference('execution-effect-landing-journal', reference);
        return Object.freeze({
          artifactKey: receipt.artifactKey,
          artifactReceiptDigest: receipt.receiptDigest,
          contentDigest: receipt.artifact.sha256,
          byteLength: receipt.artifact.byteLength,
          bytes: readReferenceBytes(receipt),
        });
      },
    );
    const receiptReferences = [
      ...terminalSeal.receiptArtifacts.nativeReceipts,
      ...(terminalSeal.receiptArtifacts.finalVerificationReceipt
        ? [terminalSeal.receiptArtifacts.finalVerificationReceipt] : []),
      terminalSeal.receiptArtifacts.leaseTerminalReceipt,
    ];
    const receiptArtifacts: ExecutionEffectLandingJournalArtifactV1[] = intrinsicArrayMap(
      receiptReferences,
      reference => {
        const receipt = requireReference('execution-effect-landing-receipt-evidence', reference);
        return Object.freeze({
          artifactKey: receipt.artifactKey,
          artifactReceiptDigest: receipt.receiptDigest,
          contentDigest: receipt.artifact.sha256,
          byteLength: receipt.artifact.byteLength,
          bytes: readReferenceBytes(receipt),
        });
      },
    );
    const verified = verifyExecutionEffectPersistenceBundleV1({
      workspaceBytes,
      baselineBytes: readReferenceBytes(baselineManifest),
      finalBytes: readReferenceBytes(finalManifest),
      terminalBytes,
      stagedArtifacts,
      journalArtifacts,
      receiptArtifacts,
      maxJsonBytes: TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
    });
    if (
      verified === null
      || !sameExecutionEffectIdentity(verified.workspace.attempt, landing.identity)
      || verified.workspace.admissionReceiptDigest !== admission.receiptDigest
      || verified.workspace.custodyPolicyDigest !== policy.policyDigest
      || verified.workspace.sealedAt !== workspaceSnapshot.capturedAt
      || verified.terminal.disposition !== landing.disposition
      || verified.decisionDigest !== landing.effectDecisionDigest
      || verified.terminal.transactionDigest !== landing.transactionDigest
      || verified.terminal.committedAt !== landing.committedAt
      || verified.stagedArtifactRefs.length !== landing.stagedContents.length
      || intrinsicArraySome(verified.stagedArtifactRefs, reference => !landing.stagedContents.some(
        candidate => candidate.artifactKey === reference.artifactKey
          && candidate.artifactReceiptDigest === reference.artifactReceiptDigest,
      ))
    ) hold('ARTIFACT_REPLAY_MISMATCH', operation);

    const workspaceReleaseBytes = readReferenceBytes(workspaceRelease);
    let workspaceReleaseValue: unknown;
    try {
      workspaceReleaseValue = JSON.parse(Buffer.from(workspaceReleaseBytes).toString('utf8'));
    } catch {
      return hold('ARTIFACT_REPLAY_MISMATCH', operation);
    }
    const release = parseExecutionEffectWorkspaceReleaseV1(workspaceReleaseValue);
    if (release === null || !sameExecutionEffectIdentity(release.attempt, landing.identity)
      || release.admissionReceiptDigest !== admission.receiptDigest
      || release.custodyPolicyDigest !== policy.policyDigest
      || release.workspaceSnapshotSealDigest !== verified.workspace.sealDigest
      || release.workspaceResourceDigest !== verified.workspace.workspaceResource.resourceDigest
      || release.dependencyResourceDigest
        !== verified.workspace.dependencyResource.resourceDigest
      || release.transactionDigest !== verified.terminal.transactionDigest
      || release.committedJournalDigest !== verified.terminal.committedJournalDigest
      || release.workspaceVolume.volumeNameDigest
        !== verified.workspace.workspaceResource.volumeNameDigest
      || release.dependencyVolume.volumeName
        !== verified.workspace.dependencyResource.volumeName
      || release.dependencyVolume.volumeNameDigest
        !== verified.workspace.dependencyResource.volumeNameDigest
      || release.dependencyVolume.volumeIdentityDigest
        !== verified.workspace.dependencyResource.volumeIdentityDigest
      || release.releasedAt !== landing.releasedAt
      || release.releasedAt !== workspaceRelease.capturedAt
      || !sameBytes(
        workspaceReleaseBytes,
        canonicalTaskAttemptCustodyJson(release, policy.jsonBounds),
      )) hold('ARTIFACT_REPLAY_MISMATCH', operation);

    const admissionTime = Date.parse(admission.admittedAt);
    const workspaceTime = Date.parse(workspaceSnapshot.capturedAt);
    const baselineTime = Date.parse(baselineManifest.capturedAt);
    const finalTime = Date.parse(finalManifest.capturedAt);
    const journalTime = Date.parse(landingJournal.capturedAt);
    const committedTime = Date.parse(landing.committedAt);
    const releasedTime = Date.parse(landing.releasedAt);
    if (
      baselineTime < admissionTime
      || workspaceTime < baselineTime
      || finalTime < workspaceTime
      || journalTime < finalTime
      || committedTime < journalTime
      || releasedTime < committedTime
      || intrinsicArraySome(stagedContents, staged => (
        Date.parse(staged.capturedAt) < finalTime
        || Date.parse(staged.capturedAt) > journalTime
      ))
    ) hold('ARTIFACT_REPLAY_MISMATCH', operation);
    return intrinsicObjectFreeze({ verifiedBundle: verified, workspaceRelease: release });
  }

  private requireAcceptedResultLandingBinding(input: Readonly<{
    identity: TaskAttemptCustodyIdentityV2;
    policy: TaskAttemptCustodyPolicyV2;
    admissionReceiptDigest: Sha256Digest;
    bytes: Uint8Array;
  }>, operation: 'publish' | 'read' | 'append-chain'): TaskAttemptEffectLandingBindingV2 {
    let value: unknown;
    try { value = JSON.parse(Buffer.from(input.bytes).toString('utf8')); } catch {
      return hold('ARTIFACT_REPLAY_MISMATCH', operation);
    }
    if (!sameBytes(input.bytes, canonicalTaskAttemptCustodyJson(value, input.policy.jsonBounds))) {
      hold('ARTIFACT_REPLAY_MISMATCH', operation);
    }
    const binding = extractTaskAttemptEffectLandingBindingV2(value);
    const attemptCustodyDescriptor = isPlainRecord(value)
      ? intrinsicObjectGetOwnPropertyDescriptor(value, 'attemptCustody') : null;
    const custodyRecord = snapshotExactDataRecord(
      attemptCustodyDescriptor && attemptCustodyDescriptor.enumerable
        && 'value' in attemptCustodyDescriptor
        ? attemptCustodyDescriptor.value : null,
      [
      'version', 'identity', 'policyDigest', 'admissionReceiptDigest', 'sourceResult',
      'hostWorkAttribution', 'hostPromotion', 'effectLanding',
      ],
    );
    const hostWorkBinding = snapshotExactDataRecord(custodyRecord?.hostWorkAttribution, [
      'artifactClass', 'artifactKey', 'artifactReceiptDigest', 'artifactSha256', 'byteLength',
    ]);
    if (
      binding === null
      || !sameExecutionEffectIdentity(binding.identity, input.identity)
      || binding.admissionReceiptDigest !== input.admissionReceiptDigest
      || binding.custodyPolicyDigest !== input.policy.policyDigest
      || hostWorkBinding === null
      || hostWorkBinding.artifactClass !== 'host-work-attribution'
      || hostWorkBinding.artifactKey !== `host-work-${input.identity.attemptId}`
      || !isDigest(hostWorkBinding.artifactReceiptDigest)
      || !isDigest(hostWorkBinding.artifactSha256)
      || !Number.isSafeInteger(hostWorkBinding.byteLength)
      || Number(hostWorkBinding.byteLength) < 0
    ) hold('ARTIFACT_REPLAY_MISMATCH', operation);
    const hostWorkArtifact = this.readVerifiedArtifact({
      identity: input.identity,
      policy: input.policy,
      artifactClass: 'host-work-attribution',
      artifactKey: hostWorkBinding.artifactKey as string,
      receiptDigest: hostWorkBinding.artifactReceiptDigest as Sha256Digest,
    });
    if (hostWorkArtifact === null
      || hostWorkArtifact.receipt.artifact.sha256 !== hostWorkBinding.artifactSha256
      || hostWorkArtifact.receipt.artifact.byteLength !== hostWorkBinding.byteLength) {
      hold('ARTIFACT_REPLAY_MISMATCH', operation);
    }
    const landingArtifact = this.readArtifactReceipt({
      identity: input.identity,
      policy: input.policy,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: binding.landingArtifactKey,
    });
    const landing = this.readEffectLandingReceipt({
      identity: input.identity,
      policy: input.policy,
      artifactKey: binding.landingArtifactKey,
    });
    const landingChain = this.readChain(input.identity, input.policy, 'effect-landing');
    if (
      landingArtifact === null
      || landing === null
      || landingChain === null
      || landingArtifact.receiptDigest !== binding.landingArtifactReceiptDigest
      || landing.receiptDigest !== binding.landingReceiptDigest
      || landingChain.receiptDigest !== binding.effectLandingChainDigest
      || landingChain.artifactKey !== binding.landingArtifactKey
      || landingChain.artifactReceiptDigest !== binding.landingArtifactReceiptDigest
      || landing.disposition !== binding.disposition
      || landing.effectDecisionDigest !== binding.effectDecisionDigest
      || landing.transactionDigest !== binding.transactionDigest
    ) hold('ARTIFACT_REPLAY_MISMATCH', operation);
    return binding;
  }

  private prepareArtifactWrite(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly artifactClass: Exclude<
      TaskAttemptCustodyArtifactClass,
      'task-admission-snapshot'
    >;
    readonly captureMode: TaskAttemptCustodyArtifactCaptureMode;
    readonly artifactKey: string;
    readonly capturedAt: string;
  }, operation: TaskAttemptCustodyOperation, validateTimestamp = true): PreparedArtifactWrite {
    this.assertStoreIdentity(input.identity, operation);
    assertPolicy(input.policy);
    if (!isDigest(input.admissionReceiptDigest)) {
      hold('ARTIFACT_REPLAY_MISMATCH', operation);
    }
    const runtimeArtifactClass = input.artifactClass as string;
    if (
      runtimeArtifactClass === 'task-admission-snapshot'
      || !isTaskAttemptCustodyArtifactClass(runtimeArtifactClass)
      || artifactCaptureModeForClass(input.artifactClass) !== input.captureMode
    ) hold('ARTIFACT_REPLAY_MISMATCH', operation);
    if (!isSafeArtifactKey(input.artifactKey)) {
      hold('UNSAFE_RELATIVE_PATH', operation);
    }
    const admission = this.readAdmission(input.identity, input.policy);
    if (admission === null) hold('ADMISSION_REQUIRED', operation);
    if (admission.receiptDigest !== input.admissionReceiptDigest) {
      hold('ADMISSION_MISMATCH', operation);
    }
    if (
      validateTimestamp
      && (
        !isTimestamp(input.capturedAt)
        || Date.parse(input.capturedAt) < Date.parse(admission.admittedAt)
      )
    ) hold('ARTIFACT_REPLAY_MISMATCH', operation);
    const prefix = identityPrefix(input.identity);
    const artifactDirectory = childPath(prefix, 'artifacts', input.artifactClass);
    const artifactPath = taskAttemptCustodyArtifactDataRelativePath(input);
    const receiptPath = childPath(artifactDirectory, `${input.artifactKey}.receipt.json`);
    this.ensureAndVerifyPrivateDirectory(
      artifactDirectory,
      attemptEffectContext(input.identity, admission.receiptDigest, input.policy),
    );
    return {
      admission,
      artifactDirectory,
      artifactPath,
      receiptPath,
      limit: input.policy.artifactLimits[input.artifactClass],
    };
  }

  private persistArtifactReceipt(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly artifactClass: Exclude<
      TaskAttemptCustodyArtifactClass,
      'task-admission-snapshot'
    >;
    readonly captureMode: TaskAttemptCustodyArtifactCaptureMode;
    readonly artifactKey: string;
    readonly capturedAt: string;
    readonly prepared: PreparedArtifactWrite;
    readonly artifact: TaskAttemptCustodyFileProof;
  }, operation: TaskAttemptCustodyOperation): TaskAttemptCustodyArtifactReceiptV2 {
    if (
      input.prepared.admission.receiptDigest !== input.admissionReceiptDigest
      || input.artifact.relativePath !== input.prepared.artifactPath
      || artifactCaptureModeForClass(input.artifactClass) !== input.captureMode
      || !isTimestamp(input.capturedAt)
      || Date.parse(input.capturedAt) < Date.parse(input.prepared.admission.admittedAt)
    ) hold('ARTIFACT_REPLAY_MISMATCH', operation);
    const withoutDigest = {
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-artifact' as const,
      identity: cloneIdentity(input.identity),
      admissionReceiptDigest: input.admissionReceiptDigest,
      artifactClass: input.artifactClass,
      captureMode: input.captureMode,
      artifactKey: input.artifactKey,
      capturedAt: input.capturedAt,
      policyDigest: input.policy.policyDigest,
      artifact: cloneProof(input.artifact),
    };
    const receipt: TaskAttemptCustodyArtifactReceiptV2 = Object.freeze({
      ...withoutDigest,
      receiptDigest: artifactReceiptDigest(withoutDigest, input.policy.jsonBounds),
    });
    const receiptBytes = canonicalTaskAttemptCustodyJson(receipt, input.policy.jsonBounds);
    this.publishAndVerify(
      input.prepared.receiptPath,
      receiptBytes,
      metadataLimit(input.policy),
      attemptEffectContext(input.identity, input.admissionReceiptDigest, input.policy),
    );
    const persisted = this.readArtifactReceipt({
      identity: input.identity,
      policy: input.policy,
      artifactClass: input.artifactClass,
      artifactKey: input.artifactKey,
    });
    if (persisted === null || persisted.receiptDigest !== receipt.receiptDigest) {
      hold('ARTIFACT_REPLAY_MISMATCH', operation);
    }
    return persisted;
  }

  private issuePathCapability(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly access: TaskAttemptCustodyPathCapabilityAccess;
    readonly scopeDigest: Sha256Digest;
    readonly attemptOutputCaptureIntent: Readonly<{
      readonly sourceRole: 'attempt-output-artifact-source';
      readonly artifactClass: TaskAttemptCustodyAttemptOutputArtifactClass;
      readonly artifactKey: string;
      readonly intentDigest: Sha256Digest;
    }> | null;
  }): TaskAttemptCustodyPathCapability {
    let capability: TaskAttemptCustodyPathCapability;
    try {
      capability = this.adapter.issuePathCapability({
        root: this.root,
        relativePath: input.relativePath,
        access: input.access,
        scopeDigest: input.scopeDigest,
      });
    } catch (error) {
      hold(mappedAdapterHoldCode(error, 'CAPABILITY_UNVERIFIED'), 'probe');
    }
    const capabilityRecord = snapshotExactDataRecord(capability, [
      'kind',
      'access',
      'rootId',
      'scopeDigest',
      'capabilityEvidenceDigest',
    ]);
    if (capabilityRecord === null || !isDigest(capabilityRecord.capabilityEvidenceDigest)) {
      hold('CAPABILITY_UNVERIFIED', 'probe');
    }
    let attemptOutputCaptureAuthority: AttemptOutputCaptureAuthority | null = null;
    if (input.attemptOutputCaptureIntent !== null) {
      const expectedIntentDigest = attemptOutputCaptureIntentDigest({
        identity: input.identity,
        admissionReceiptDigest: input.admissionReceiptDigest,
        relativePath: input.relativePath,
        scopeDigest: input.scopeDigest,
        artifactClass: input.attemptOutputCaptureIntent.artifactClass,
        artifactKey: input.attemptOutputCaptureIntent.artifactKey,
      });
      if (
        input.access !== 'capture-read-file'
        || input.attemptOutputCaptureIntent.sourceRole !== 'attempt-output-artifact-source'
        || artifactCaptureModeForClass(input.attemptOutputCaptureIntent.artifactClass)
          !== 'attempt-output-capture'
        || !isSafeArtifactKey(input.attemptOutputCaptureIntent.artifactKey)
        || input.attemptOutputCaptureIntent.intentDigest !== expectedIntentDigest
      ) hold('CAPABILITY_UNVERIFIED', 'probe');
      attemptOutputCaptureAuthority = {
        sourceRole: 'attempt-output-artifact-source',
        artifactClass: input.attemptOutputCaptureIntent.artifactClass,
        artifactKey: input.attemptOutputCaptureIntent.artifactKey,
        intentDigest: expectedIntentDigest,
        bindingDigest: attemptOutputCaptureBindingDigest(
          expectedIntentDigest,
          capabilityRecord.capabilityEvidenceDigest,
        ),
        state: 'ISSUED',
        receiptDigest: null,
      };
    } else if (input.access === 'capture-read-file') {
      hold('CAPABILITY_UNVERIFIED', 'probe');
    }
    const nextScope: IssuedPathCapabilityScope = Object.freeze({
      identity: cloneIdentity(input.identity),
      admissionReceiptDigest: input.admissionReceiptDigest,
      relativePath: input.relativePath,
      access: input.access,
      scopeDigest: input.scopeDigest,
      capabilityEvidenceDigest: capabilityRecord.capabilityEvidenceDigest,
      attemptOutputCaptureAuthority,
    });
    const existingScope = this.issuedPathCapabilities.get(capability);
    if (this.revokedPathCapabilities.has(capability)) {
      hold('CAPABILITY_UNVERIFIED', 'probe');
    }
    if (existingScope !== undefined) {
      if (
        !sameIdentity(existingScope.identity, nextScope.identity)
        || existingScope.admissionReceiptDigest !== nextScope.admissionReceiptDigest
        || existingScope.relativePath !== nextScope.relativePath
        || existingScope.access !== nextScope.access
        || existingScope.scopeDigest !== nextScope.scopeDigest
        || existingScope.capabilityEvidenceDigest !== nextScope.capabilityEvidenceDigest
        || !sameAttemptOutputCaptureAuthority(
          existingScope.attemptOutputCaptureAuthority,
          nextScope.attemptOutputCaptureAuthority,
        )
      ) {
        this.revokedPathCapabilities.add(capability);
        hold('CAPABILITY_UNVERIFIED', 'probe');
      }
      try {
        assertPathCapability(capability, this.root, input.access, input.scopeDigest);
      } catch {
        this.revokedPathCapabilities.add(capability);
        hold('CAPABILITY_UNVERIFIED', 'probe');
      }
      return capability;
    }
    assertPathCapability(capability, this.root, input.access, input.scopeDigest);
    this.issuedPathCapabilities.set(capability, nextScope);
    return capability;
  }

  private requireIssuedPathCapability(
    capability: TaskAttemptCustodyPathCapability,
    identity: TaskAttemptCustodyIdentityV2,
    admissionReceiptDigest: Sha256Digest,
    access: TaskAttemptCustodyPathCapabilityAccess,
  ): IssuedPathCapabilityScope {
    if (
      capability === null
      || typeof capability !== 'object'
      || isUntrustedProxy(capability)
    ) {
      hold('CAPABILITY_UNVERIFIED', 'probe');
    }
    const scope = this.issuedPathCapabilities.get(capability);
    if (
      this.revokedPathCapabilities.has(capability)
      ||
      scope === undefined
      || !sameIdentity(scope.identity, identity)
      || scope.admissionReceiptDigest !== admissionReceiptDigest
      || scope.access !== access
    ) hold('CAPABILITY_UNVERIFIED', 'probe');
    assertPathCapability(capability, this.root, scope.access, scope.scopeDigest);
    return scope;
  }

  private readFirstWriterSnapshot(
    relativePath: TaskAttemptCustodyRelativePath,
    policy: TaskAttemptCustodyArtifactLimit,
    operation: TaskAttemptCustodyOperation,
    fallback: TaskAttemptCustodyHoldCode = 'CAPABILITY_UNVERIFIED',
  ): TaskAttemptCustodyRead | null {
    let value: TaskAttemptCustodyRead | null;
    try {
      value = this.adapter.readFirstWriter({
        root: this.root,
        relativePath,
        policy,
      });
    } catch (cause) {
      hold(mappedAdapterHoldCode(cause, fallback), operation);
    }
    return value === null
      ? null
      : snapshotAdapterRead(value, relativePath, this.root, policy, operation);
  }

  private readVerifiedSnapshot(
    proofValue: TaskAttemptCustodyFileProof,
    policy: TaskAttemptCustodyArtifactLimit,
    operation: TaskAttemptCustodyOperation,
    fallback: TaskAttemptCustodyHoldCode = 'CAPABILITY_UNVERIFIED',
  ): TaskAttemptCustodyRead | null {
    const proof = parseFileProof(proofValue);
    if (proof === null) hold('CAPABILITY_UNVERIFIED', operation);
    let value: TaskAttemptCustodyRead | null;
    try {
      value = this.adapter.readVerified({ root: this.root, proof, policy });
    } catch (cause) {
      hold(mappedAdapterHoldCode(cause, fallback), operation);
    }
    return value === null
      ? null
      : snapshotAdapterRead(value, proof.relativePath, this.root, policy, operation);
  }

  private readPrivateDirectorySnapshot(
    relativePath: TaskAttemptCustodyRelativePath,
    operation: TaskAttemptCustodyOperation = 'read',
    fallback: TaskAttemptCustodyHoldCode = 'CAPABILITY_UNVERIFIED',
  ): TaskAttemptCustodyDirectoryProof | null {
    let value: TaskAttemptCustodyDirectoryProof | null;
    try {
      value = this.adapter.readPrivateDirectory(this.root, relativePath);
    } catch (cause) {
      hold(mappedAdapterHoldCode(cause, fallback), operation);
    }
    return value === null ? null : assertDirectoryProof(value, relativePath, this.root);
  }

  private verifyPublication(
    relativePath: TaskAttemptCustodyRelativePath,
    publication: TaskAttemptCustodyPublication,
    policy: TaskAttemptCustodyArtifactLimit,
    operation: TaskAttemptCustodyOperation,
  ): TaskAttemptCustodyFileProof {
    validatedLimit(policy);
    const publicationSnapshot = snapshotAdapterPublication(publication, operation);
    if (
      publicationSnapshot.proof.relativePath !== relativePath
      || publicationSnapshot.proof.volumeId !== this.root.volumeId
      || publicationSnapshot.proof.byteLength < policy.minBytes
      || publicationSnapshot.proof.byteLength > policy.maxBytes
    ) {
      hold('CAPABILITY_UNVERIFIED', operation);
    }
    const observed = this.readVerifiedSnapshot(
      publicationSnapshot.proof,
      policy,
      operation,
      operation === 'seal-stream' ? 'PUBLISHED_UNCONFIRMED' : 'DURABILITY_UNCONFIRMED',
    );
    if (observed === null) {
      hold('DURABILITY_UNCONFIRMED', operation);
    }
    assertBytesWithinLimit(observed.bytes, policy);
    if (!sameProof(publicationSnapshot.proof, observed.proof)) {
      hold('ARTIFACT_CHANGED', operation);
    }
    return observed.proof;
  }

  private publishAndVerify(
    relativePath: TaskAttemptCustodyRelativePath,
    bytes: Uint8Array,
    policy: TaskAttemptCustodyArtifactLimit,
    effect: DurableEffectContext,
  ): TaskAttemptCustodyFileProof {
    validatedLimit(policy);
    const authorityBytes = snapshotAuthorityBytes(bytes, 'CAPABILITY_UNVERIFIED', 'publish');
    assertBytesWithinLimit(authorityBytes, policy);
    const descriptor = this.durableEffectDescriptor({
      ...effect,
      operation: 'PUBLISH',
      target: relativePath,
      contentDigest: rawSha256(authorityBytes),
      sequence: 0,
    });
    const disposition = this.beginDurableEffect(descriptor, effect.policy);
    if (disposition === 'CONFIRMED') {
      const confirmed = this.readFirstWriterSnapshot(
        relativePath,
        policy,
        'publish',
        'PUBLISHED_UNCONFIRMED',
      );
      if (
        confirmed === null
        || !sameBytes(confirmed.bytes, authorityBytes)
        || confirmed.proof.sha256 !== descriptor.contentDigest
      ) {
        this.releaseDurableEffect(descriptor);
        hold('RECONCILIATION_REQUIRED', 'publish');
      }
      return confirmed.proof;
    }
    const adapterBytes = Uint8Array.from(authorityBytes);
    let publicationValue: TaskAttemptCustodyPublication;
    try {
      publicationValue = this.adapter.publishBytesFirstWriter({
        root: this.root,
        relativePath,
        bytes: adapterBytes,
        policy,
      });
    } catch (error) {
      this.releaseDurableEffect(descriptor);
      hold(mappedAdapterHoldCode(error, 'PUBLISHED_UNCONFIRMED'), 'publish');
    }
    try {
      if (!sameBytes(adapterBytes, authorityBytes)) {
        hold('PUBLISHED_UNCONFIRMED', 'publish');
      }
      const publication = snapshotAdapterPublication(publicationValue, 'publish');
      const publicationProof = assertFileProof(
        publication.proof,
        relativePath,
        authorityBytes,
        this.root,
        policy,
      );
      const observed = this.readVerifiedSnapshot(
        publicationProof,
        policy,
        'publish',
        'PUBLISHED_UNCONFIRMED',
      );
      if (observed === null) hold('PUBLISHED_UNCONFIRMED', 'publish');
      if (!sameProof(publicationProof, observed.proof)) {
        hold('PUBLISHED_UNCONFIRMED', 'publish');
      }
      if (!sameBytes(observed.bytes, authorityBytes)) {
        hold('PUBLISHED_UNCONFIRMED', 'publish');
      }
      this.completeDurableEffect(descriptor, effect.policy);
      return observed.proof;
    } catch {
      this.releaseDurableEffect(descriptor);
      hold('PUBLISHED_UNCONFIRMED', 'publish');
    }
  }

  private publishWorkerIpcAnswerDestination(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly policy: TaskAttemptCustodyPolicyV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly sequence: number;
    readonly destinationPath: TaskAttemptCustodyRelativePath;
    readonly deliveryBytes: Uint8Array;
    readonly limit: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyFileProof {
    const deliveryBytes = snapshotAuthorityBytes(
      input.deliveryBytes,
      'CAPABILITY_UNVERIFIED',
      'publish',
    );
    assertBytesWithinLimit(deliveryBytes, input.limit);
    const descriptor = this.durableEffectDescriptor({
      identity: input.identity,
      admissionReceiptDigest: input.admissionReceiptDigest,
      policy: input.policy,
      scopeDigest: input.scopeDigest,
      operation: 'PUBLISH',
      target: input.destinationPath,
      contentDigest: rawSha256(deliveryBytes),
      sequence: input.sequence,
    });
    const disposition = this.beginDurableEffect(descriptor, input.policy);
    if (disposition === 'CONFIRMED') {
      const confirmed = this.readFirstWriterSnapshot(
        input.destinationPath,
        input.limit,
        'publish',
        'RECONCILIATION_REQUIRED',
      );
      if (
        confirmed === null
        || confirmed.proof.sha256 !== descriptor.contentDigest
        || !sameBytes(confirmed.bytes, deliveryBytes)
      ) {
        this.releaseDurableEffect(descriptor);
        hold('RECONCILIATION_REQUIRED', 'publish');
      }
      return confirmed.proof;
    }
    const adapterBytes = Uint8Array.from(deliveryBytes);
    let publicationValue: TaskAttemptCustodyPublication;
    try {
      publicationValue = this.adapter.publishBytesFirstWriter({
        root: this.root,
        relativePath: input.destinationPath,
        bytes: adapterBytes,
        policy: input.limit,
      });
    } catch (cause) {
      this.releaseDurableEffect(descriptor);
      const code = mappedAdapterHoldCode(cause, 'PUBLISHED_UNCONFIRMED');
      hold(code === 'FIRST_WRITER_COLLISION' ? code : 'RECONCILIATION_REQUIRED', 'publish');
    }
    try {
      if (!sameBytes(adapterBytes, deliveryBytes)) {
        hold('RECONCILIATION_REQUIRED', 'publish');
      }
      const publication = snapshotAdapterPublication(publicationValue, 'publish');
      const publicationProof = assertFileProof(
        publication.proof,
        input.destinationPath,
        deliveryBytes,
        this.root,
        input.limit,
      );
      const observed = this.readVerifiedSnapshot(
        publicationProof,
        input.limit,
        'publish',
        'RECONCILIATION_REQUIRED',
      );
      if (
        observed === null
        || !sameProof(publicationProof, observed.proof)
        || !sameBytes(observed.bytes, deliveryBytes)
      ) hold('RECONCILIATION_REQUIRED', 'publish');
      this.completeDurableEffect(descriptor, input.policy);
      return observed.proof;
    } catch {
      this.releaseDurableEffect(descriptor);
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
  }

  private ensureAndVerifyPrivateDirectory(
    relativePath: TaskAttemptCustodyRelativePath,
    effect: DurableEffectContext,
  ): TaskAttemptCustodyDirectoryProof {
    const descriptor = this.durableEffectDescriptor({
      ...effect,
      operation: 'CREATE',
      target: relativePath,
      contentDigest: null,
      sequence: 0,
    });
    const disposition = this.beginDurableEffect(descriptor, effect.policy);
    if (disposition === 'CONFIRMED') {
      const confirmed = this.readPrivateDirectorySnapshot(
        relativePath,
        'create-directory',
        'CREATE_UNCONFIRMED',
      );
      if (confirmed === null) {
        this.releaseDurableEffect(descriptor);
        hold('RECONCILIATION_REQUIRED', 'create-directory');
      }
      return confirmed;
    }
    try {
      const createdValue = this.adapter.ensurePrivateDirectory(this.root, relativePath);
      const created = assertDirectoryProof(createdValue, relativePath, this.root);
      const observed = this.readPrivateDirectorySnapshot(
        relativePath,
        'create-directory',
        'CREATE_UNCONFIRMED',
      );
      if (observed === null) hold('CREATE_UNCONFIRMED', 'create-directory');
      if (!sameDirectoryProof(created, observed)) {
        hold('CREATE_UNCONFIRMED', 'create-directory');
      }
      this.completeDurableEffect(descriptor, effect.policy);
      return observed;
    } catch {
      this.releaseDurableEffect(descriptor);
      hold('CREATE_UNCONFIRMED', 'create-directory');
    }
  }
}
