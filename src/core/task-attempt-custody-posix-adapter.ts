import { Buffer as NodeBuffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { types as nodeTypes } from 'node:util';

import {
  loadExecAuthorityNative,
  type ExecAuthorityNativeAvailable,
  type ExecAuthorityNativeCustodyFacade,
  type ExecAuthorityNativeCustodyHandle,
  type ExecAuthorityNativeErrorCode,
  type ExecAuthorityNativeIdentity,
  type ExecAuthorityNativePublication,
  type ExecAuthorityNativeRootSeparation,
} from './exec-authority-native.js';
import {
  TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  TaskAttemptCustodyHold,
  canonicalTaskAttemptCustodyJson,
  createTaskAttemptCustodyAdapterAbortResult,
  createTaskAttemptCustodyAdapterAppendResult,
  createTaskAttemptCustodyBackendMountTransferReceipt,
  createTaskAttemptCustodyDirectoryScanReceiptV2,
  taskAttemptCustodyDigest,
  taskAttemptCustodyRelativePath,
  type CanonicalJsonBounds,
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
  type TaskAttemptCustodyHoldCode,
  type TaskAttemptCustodyOperation,
  type TaskAttemptCustodyPathCapability,
  type TaskAttemptCustodyPathCapabilityAccess,
  type TaskAttemptCustodyPublication,
  type TaskAttemptCustodyRead,
  type TaskAttemptCustodyRelativePath,
  type TaskAttemptCustodyRootProof,
} from './task-attempt-custody-store.js';

const POSIX_ADAPTER_CONTRACT = 'deckent.task-attempt-custody.posix-native-adapter.v2';
const EFFECT_DIRECTORY = 'effects-v2';
const INTERNAL_JSON_BOUNDS: Readonly<CanonicalJsonBounds> = Object.freeze({
  maxDepth: 32,
  maxNodes: 10_000,
  maxStringBytes: 64 * 1024,
  maxArrayLength: 1_000,
  maxObjectKeys: 1_000,
  maxCanonicalBytes: 1024 * 1024,
});
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTAINER_ID_PATTERN = /^[a-f0-9]{64}$/u;
const UNSIGNED_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/u;
const UINT64_MAX_DECIMAL = '18446744073709551615';
const TASK_SNAPSHOT_CONTAINER_PATH = '/run/deckent/task.json';
const WORKER_OUTPUT_CONTAINER_PATH = '/workspace/.tasks';

const intrinsicObjectPrototype = Object.prototype;
const intrinsicObjectGetPrototypeOf = Object.getPrototypeOf;
const intrinsicObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const intrinsicObjectIsFrozen = Object.isFrozen;
const intrinsicObjectCreate = Object.create;
const intrinsicObjectFreeze = Object.freeze;
const intrinsicArrayIsArray = Array.isArray;
const intrinsicArrayPrototype = Array.prototype;
const intrinsicArraySort = intrinsicArrayPrototype.sort;
const intrinsicArrayEvery = intrinsicArrayPrototype.every;
const intrinsicArraySome = intrinsicArrayPrototype.some;
const intrinsicRegExpTest = RegExp.prototype.test;
const intrinsicStringSplit = String.prototype.split;
const IntrinsicSet = Set;
const IntrinsicWeakSet = WeakSet;
const intrinsicSetPrototype = Set.prototype;
const intrinsicWeakSetPrototype = WeakSet.prototype;
const intrinsicSetHas = intrinsicSetPrototype.has;
const intrinsicSetAdd = intrinsicSetPrototype.add;
const intrinsicWeakSetHas = intrinsicWeakSetPrototype.has;
const intrinsicWeakSetAdd = intrinsicWeakSetPrototype.add;
const intrinsicReflectApply = Reflect.apply;
const intrinsicReflectOwnKeys = Reflect.ownKeys;
const intrinsicNodeTypesIsProxy = nodeTypes.isProxy;
const intrinsicUint8ArrayPrototype = Uint8Array.prototype;
const intrinsicBufferPrototype = NodeBuffer.prototype;
const intrinsicTypedArrayPrototype = Object.getPrototypeOf(intrinsicUint8ArrayPrototype) as object;
const intrinsicTypedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  'buffer',
)?.get;
const intrinsicTypedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  'byteLength',
)?.get;
const intrinsicTypedArraySet = intrinsicUint8ArrayPrototype.set;

function freezeObject<T extends object>(value: T): Readonly<T> {
  return intrinsicReflectApply(intrinsicObjectFreeze, Object, [value]) as Readonly<T>;
}

function matchesPattern(pattern: RegExp, value: string): boolean {
  return intrinsicReflectApply(intrinsicRegExpTest, pattern, [value]);
}

export interface TaskAttemptCustodyPosixMountConsumerInput {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-posix-mount-consumer-input';
  readonly taskSnapshot: Readonly<{
    readonly sourcePath: string;
    readonly readOnly: true;
  }>;
  readonly workerOutput: Readonly<{
    readonly sourcePath: string;
    readonly readOnly: false;
  }>;
  readonly rootId: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly effectOpDigest: Sha256Digest;
  readonly attemptId: string;
  readonly generation: number;
}

export interface TaskAttemptCustodyPosixMountedIdentityObservation {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-posix-mounted-identity';
  readonly platform: 'linux';
  readonly objectType: 'DIRECTORY' | 'REGULAR_FILE';
  readonly dev: string;
  readonly ino: string;
  readonly mntId: string;
  readonly fsMagic: string;
  readonly ownerUid: string;
  readonly mode: string;
  readonly size: string;
  readonly linkCount: string;
}

export interface TaskAttemptCustodyPosixAuthorityLabelsObservation {
  readonly rootId: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly effectOpDigest: Sha256Digest;
  readonly attemptId: string;
  readonly generation: number;
}

export interface TaskAttemptCustodyPosixDockerMountObservation {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-attempt-custody-posix-docker-mount-observation';
  readonly state: 'MOUNTED_GATED';
  readonly backend: 'docker';
  readonly containerId: string;
  readonly imageDigest: Sha256Digest;
  readonly authorityLabels: TaskAttemptCustodyPosixAuthorityLabelsObservation;
  readonly taskSnapshotMount: Readonly<{
    readonly sourcePath: string;
    readonly targetPath: typeof TASK_SNAPSHOT_CONTAINER_PATH;
    readonly mountType: 'bind';
    readonly propagation: 'rprivate';
    readonly readOnly: true;
    readonly access: 'READ_ONLY';
    readonly identity: TaskAttemptCustodyPosixMountedIdentityObservation;
    readonly contentDigest: Sha256Digest;
  }>;
  readonly workerOutputMount: Readonly<{
    readonly sourcePath: string;
    readonly targetPath: typeof WORKER_OUTPUT_CONTAINER_PATH;
    readonly mountType: 'bind';
    readonly propagation: 'rprivate';
    readonly readOnly: false;
    readonly access: 'READ_WRITE';
    readonly identity: TaskAttemptCustodyPosixMountedIdentityObservation;
  }>;
  readonly bootstrap: Readonly<{
    readonly abiName: string;
    readonly abiVersion: string;
    readonly napiVersion: number;
    readonly handleAbi: string;
    readonly packageName: string;
    readonly packageVersion: string;
    readonly platform: 'linux';
    readonly arch: string;
    readonly binarySha256: Sha256Digest;
    readonly rootSeparationEvidenceBits: number;
  }>;
  readonly daemon: Readonly<{
    readonly containerId: string;
    readonly imageDigest: Sha256Digest;
    readonly authorityLabels: TaskAttemptCustodyPosixAuthorityLabelsObservation;
    readonly taskSnapshotMount: Readonly<{
      readonly sourcePath: string;
      readonly targetPath: typeof TASK_SNAPSHOT_CONTAINER_PATH;
      readonly mountType: 'bind';
      readonly propagation: 'rprivate';
      readonly readOnly: true;
    }>;
    readonly workerOutputMount: Readonly<{
      readonly sourcePath: string;
      readonly targetPath: typeof WORKER_OUTPUT_CONTAINER_PATH;
      readonly mountType: 'bind';
      readonly propagation: 'rprivate';
      readonly readOnly: false;
    }>;
  }>;
}

export type TaskAttemptCustodyPosixMountConsumer = (
  input: TaskAttemptCustodyPosixMountConsumerInput,
) => Promise<TaskAttemptCustodyPosixDockerMountObservation>;

export interface TaskAttemptCustodyPosixAdapterOptions {
  /** T5-owned daemon handoff. Paths exist only for this bounded callback invocation. */
  readonly mountConsumer?: TaskAttemptCustodyPosixMountConsumer;
}

interface NativeRootBinding {
  readonly absoluteRoot: string;
  readonly canonicalProjectRoot: string;
  readonly projectId: string;
  readonly native: ExecAuthorityNativeAvailable;
  readonly custody: ExecAuthorityNativeCustodyFacade;
  readonly rootHandle: ExecAuthorityNativeCustodyHandle;
  readonly rootIdentity: ExecAuthorityNativeIdentity;
  readonly rootSeparation: ExecAuthorityNativeRootSeparation;
  readonly rootSeparationEvidenceDigest: Sha256Digest;
  readonly proof: TaskAttemptCustodyRootProof;
}

type PathCapabilityState = 'OPEN' | 'CONSUMED' | 'CLEANUP_UNCONFIRMED';

interface PathCapabilityScope {
  readonly rootId: Sha256Digest;
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly access: TaskAttemptCustodyPathCapabilityAccess;
  readonly scopeDigest: Sha256Digest;
  readonly capabilityEvidenceDigest: Sha256Digest;
  readonly handle: ExecAuthorityNativeCustodyHandle;
  readonly identity: ExecAuthorityNativeIdentity;
  readonly contentDigest: Sha256Digest | null;
  state: PathCapabilityState;
}

type BackendMountState = 'ISSUED' | 'CONSUMING' | 'CONSUMED' | 'CLEANUP_UNCONFIRMED';

interface BackendMountScope {
  readonly taskSnapshot: PathCapabilityScope;
  readonly workerOutput: PathCapabilityScope;
  state: BackendMountState;
}

interface ValidatedBackendMountEvidence {
  readonly backendExecutionId: string;
  readonly backendImageDigest: Sha256Digest;
  readonly backendAuthorityLabelDigest: Sha256Digest;
  readonly taskSnapshotMountEvidenceDigest: Sha256Digest;
  readonly workerOutputMountEvidenceDigest: Sha256Digest;
  readonly backendBootstrapProbeEvidenceDigest: Sha256Digest;
  readonly daemonMountReceiptDigest: Sha256Digest;
}

type PublicationState =
  | 'OPEN'
  | 'APPEND_FAILED'
  | 'PUBLISHED_UNCONFIRMED'
  | 'CLEANUP_UNCONFIRMED'
  | 'CONSUMED';

interface PublicationScope {
  readonly handle: ExecAuthorityNativeCustodyHandle;
  readonly target: TaskAttemptCustodyRelativePath;
  readonly policy: Readonly<TaskAttemptCustodyArtifactLimit>;
  readonly createEffectOpDigest: Sha256Digest;
  readonly scopeDigest: Sha256Digest;
  readonly generation: number;
  readonly beginIdentity: ExecAuthorityNativeIdentity;
  readonly consumedEffectOpDigests: Set<Sha256Digest>;
  state: PublicationState;
  byteLength: number;
  appendSequence: number;
  terminalCode: TaskAttemptCustodyHoldCode | null;
}

interface OpenedNativeObject {
  readonly handle: ExecAuthorityNativeCustodyHandle;
  readonly identity: ExecAuthorityNativeIdentity;
}

interface OpenedNativeParent extends OpenedNativeObject {
  readonly owned: boolean;
  readonly name: string;
}

function hold(
  code: TaskAttemptCustodyHoldCode,
  operation: TaskAttemptCustodyOperation,
): never {
  throw new TaskAttemptCustodyHold(code, operation);
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && matchesPattern(DIGEST_PATTERN, value);
}

function isCanonicalUint64Decimal(value: unknown): value is string {
  return typeof value === 'string'
    && matchesPattern(UNSIGNED_DECIMAL_PATTERN, value)
    && (
      value.length < UINT64_MAX_DECIMAL.length
      || (value.length === UINT64_MAX_DECIMAL.length && value <= UINT64_MAX_DECIMAL)
    );
}

function snapshotExactRecord(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || intrinsicReflectApply(intrinsicArrayIsArray, Array, [value])
      || intrinsicReflectApply(intrinsicNodeTypesIsProxy, nodeTypes, [value])
    ) return null;
    const prototype = intrinsicReflectApply(intrinsicObjectGetPrototypeOf, Object, [value]);
    if (prototype !== intrinsicObjectPrototype && prototype !== null) return null;
    const ownKeys = intrinsicReflectApply(intrinsicReflectOwnKeys, Reflect, [value]);
    if (intrinsicReflectApply(
      intrinsicArraySome,
      ownKeys,
      [(key: PropertyKey) => typeof key !== 'string'],
    )) return null;
    const actual = intrinsicReflectApply(intrinsicArraySort, ownKeys as string[], []);
    const expected: string[] = [];
    for (let index = 0; index < keys.length; index += 1) {
      expected[index] = keys[index]!;
    }
    intrinsicReflectApply(intrinsicArraySort, expected, []);
    if (
      actual.length !== expected.length
      || !intrinsicReflectApply(
        intrinsicArrayEvery,
        actual,
        [(key: string, index: number) => key === expected[index]],
      )
    ) return null;
    const snapshot = intrinsicReflectApply(
      intrinsicObjectCreate,
      Object,
      [null],
    ) as Record<string, unknown>;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!;
      const descriptor = intrinsicReflectApply(
        intrinsicObjectGetOwnPropertyDescriptor,
        Object,
        [value, key],
      );
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return intrinsicReflectApply(intrinsicObjectFreeze, Object, [snapshot]);
  } catch {
    return null;
  }

}

function snapshotFrozenExactRecord(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  const snapshot = snapshotExactRecord(value, keys);
  if (snapshot === null) return null;
  try {
    return intrinsicReflectApply(intrinsicObjectIsFrozen, Object, [value]) ? snapshot : null;
  } catch {
    return null;
  }
}

function sameObservedMountIdentity(
  host: ExecAuthorityNativeIdentity,
  observed: Readonly<Record<string, unknown>>,
  immutableFile: boolean,
): boolean {
  return observed.schemaVersion === TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    && observed.kind === 'task-attempt-custody-posix-mounted-identity'
    && observed.platform === 'linux'
    && observed.objectType === host.objectType
    && observed.dev === host.dev
    && observed.ino === host.ino
    && isCanonicalUint64Decimal(observed.mntId)
    && observed.fsMagic === host.fsMagic
    && observed.ownerUid === host.ownerUid
    && observed.mode === host.mode
    && isCanonicalUint64Decimal(observed.size)
    && isCanonicalUint64Decimal(observed.linkCount)
    && (!immutableFile || (
      observed.size === host.size
      && observed.linkCount === host.linkCount
    ));
}

function validateAuthorityLabels(
  value: unknown,
  expected: Readonly<{
    rootId: Sha256Digest;
    scopeDigest: Sha256Digest;
    effectOpDigest: Sha256Digest;
    attemptId: string;
    generation: number;
  }>,
): Readonly<Record<string, unknown>> | null {
  const labels = snapshotFrozenExactRecord(value, [
    'rootId', 'scopeDigest', 'effectOpDigest', 'attemptId', 'generation',
  ]);
  return labels !== null
    && labels.rootId === expected.rootId
    && labels.scopeDigest === expected.scopeDigest
    && labels.effectOpDigest === expected.effectOpDigest
    && labels.attemptId === expected.attemptId
    && labels.generation === expected.generation
    ? labels
    : null;
}

function validateDockerMountObservation(
  value: unknown,
  binding: NativeRootBinding,
  mount: BackendMountScope,
  expected: Readonly<{
    taskSnapshotPath: string;
    workerOutputPath: string;
    rootId: Sha256Digest;
    scopeDigest: Sha256Digest;
    effectOpDigest: Sha256Digest;
    attemptId: string;
    generation: number;
  }>,
): ValidatedBackendMountEvidence | null {
  const observation = snapshotFrozenExactRecord(value, [
    'schemaVersion', 'kind', 'state', 'backend', 'containerId', 'imageDigest',
    'authorityLabels', 'taskSnapshotMount', 'workerOutputMount', 'bootstrap', 'daemon',
  ]);
  if (
    observation === null
    || observation.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || observation.kind !== 'task-attempt-custody-posix-docker-mount-observation'
    || observation.state !== 'MOUNTED_GATED'
    || observation.backend !== 'docker'
    || typeof observation.containerId !== 'string'
    || !matchesPattern(CONTAINER_ID_PATTERN, observation.containerId)
    || !isDigest(observation.imageDigest)
  ) return null;

  const labels = validateAuthorityLabels(observation.authorityLabels, expected);
  const task = snapshotFrozenExactRecord(observation.taskSnapshotMount, [
    'sourcePath', 'targetPath', 'mountType', 'propagation', 'readOnly',
    'access', 'identity', 'contentDigest',
  ]);
  const output = snapshotFrozenExactRecord(observation.workerOutputMount, [
    'sourcePath', 'targetPath', 'mountType', 'propagation', 'readOnly',
    'access', 'identity',
  ]);
  const taskIdentity = task === null ? null : snapshotFrozenExactRecord(task.identity, [
    'schemaVersion', 'kind', 'platform', 'objectType', 'dev', 'ino', 'mntId',
    'fsMagic', 'ownerUid', 'mode', 'size', 'linkCount',
  ]);
  const outputIdentity = output === null ? null : snapshotFrozenExactRecord(output.identity, [
    'schemaVersion', 'kind', 'platform', 'objectType', 'dev', 'ino', 'mntId',
    'fsMagic', 'ownerUid', 'mode', 'size', 'linkCount',
  ]);
  if (
    labels === null
    || task === null
    || output === null
    || taskIdentity === null
    || outputIdentity === null
    || task.sourcePath !== expected.taskSnapshotPath
    || task.targetPath !== TASK_SNAPSHOT_CONTAINER_PATH
    || task.mountType !== 'bind'
    || task.propagation !== 'rprivate'
    || task.readOnly !== true
    || task.access !== 'READ_ONLY'
    || !isDigest(task.contentDigest)
    || task.contentDigest !== mount.taskSnapshot.contentDigest
    || !sameObservedMountIdentity(mount.taskSnapshot.identity, taskIdentity, true)
    || output.sourcePath !== expected.workerOutputPath
    || output.targetPath !== WORKER_OUTPUT_CONTAINER_PATH
    || output.mountType !== 'bind'
    || output.propagation !== 'rprivate'
    || output.readOnly !== false
    || output.access !== 'READ_WRITE'
    || outputIdentity.objectType !== 'DIRECTORY'
    || !sameObservedMountIdentity(mount.workerOutput.identity, outputIdentity, false)
  ) return null;

  const bootstrap = snapshotFrozenExactRecord(observation.bootstrap, [
    'abiName', 'abiVersion', 'napiVersion', 'handleAbi', 'packageName', 'packageVersion',
    'platform', 'arch', 'binarySha256', 'rootSeparationEvidenceBits',
  ]);
  const manifest = binding.native.manifest;
  if (
    bootstrap === null
    || bootstrap.abiName !== manifest.abiName
    || bootstrap.abiVersion !== manifest.abiVersion
    || bootstrap.napiVersion !== manifest.napiVersion
    || bootstrap.handleAbi !== manifest.handleAbi
    || bootstrap.packageName !== manifest.packageName
    || bootstrap.packageVersion !== manifest.packageVersion
    || bootstrap.platform !== manifest.platform
    || bootstrap.arch !== manifest.arch
    || !isDigest(bootstrap.binarySha256)
    || bootstrap.rootSeparationEvidenceBits !== binding.rootSeparation.featureEvidenceBits
  ) return null;

  const daemon = snapshotFrozenExactRecord(observation.daemon, [
    'containerId', 'imageDigest', 'authorityLabels', 'taskSnapshotMount', 'workerOutputMount',
  ]);
  const daemonLabels = daemon === null
    ? null
    : validateAuthorityLabels(daemon.authorityLabels, expected);
  const daemonTask = daemon === null ? null : snapshotFrozenExactRecord(
    daemon.taskSnapshotMount,
    ['sourcePath', 'targetPath', 'mountType', 'propagation', 'readOnly'],
  );
  const daemonOutput = daemon === null ? null : snapshotFrozenExactRecord(
    daemon.workerOutputMount,
    ['sourcePath', 'targetPath', 'mountType', 'propagation', 'readOnly'],
  );
  if (
    daemon === null
    || daemonLabels === null
    || daemonTask === null
    || daemonOutput === null
    || daemon.containerId !== observation.containerId
    || daemon.imageDigest !== observation.imageDigest
    || daemonTask.sourcePath !== expected.taskSnapshotPath
    || daemonTask.targetPath !== TASK_SNAPSHOT_CONTAINER_PATH
    || daemonTask.mountType !== 'bind'
    || daemonTask.propagation !== 'rprivate'
    || daemonTask.readOnly !== true
    || daemonOutput.sourcePath !== expected.workerOutputPath
    || daemonOutput.targetPath !== WORKER_OUTPUT_CONTAINER_PATH
    || daemonOutput.mountType !== 'bind'
    || daemonOutput.propagation !== 'rprivate'
    || daemonOutput.readOnly !== false
  ) return null;

  return freezeObject({
    backendExecutionId: observation.containerId,
    backendImageDigest: observation.imageDigest,
    backendAuthorityLabelDigest: digest('docker-authority-label-observation', labels),
    taskSnapshotMountEvidenceDigest: digest('docker-task-snapshot-mount-observation', {
      mount: task,
      hostIdentity: stableIdentityEvidence(mount.taskSnapshot.identity),
      hostContentDigest: mount.taskSnapshot.contentDigest,
    }),
    workerOutputMountEvidenceDigest: digest('docker-worker-output-mount-observation', {
      mount: output,
      hostIdentity: stableIdentityEvidence(mount.workerOutput.identity),
    }),
    backendBootstrapProbeEvidenceDigest: digest('docker-bootstrap-observation', {
      bootstrap,
      pinnedRootSeparationEvidenceDigest: binding.rootSeparationEvidenceDigest,
    }),
    daemonMountReceiptDigest: digest('docker-daemon-raw-observation', daemon),
  });
}

abstract class PosixTaskAttemptCustodyAdapterCore implements TaskAttemptCustodyAdapter {
  readonly platform = 'posix' as const;
  protected binding: NativeRootBinding | null = null;
  protected readonly pathCapabilities = new WeakMap<object, PathCapabilityScope>();
  protected readonly backendMounts = new WeakMap<object, BackendMountScope>();
  protected readonly consumedMountObservations = new IntrinsicWeakSet<object>();
  protected readonly publications = new WeakMap<object, PublicationScope>();

  constructor(protected readonly mountConsumer: TaskAttemptCustodyPosixMountConsumer | null) {}

  abstract openRoot(input: {
    readonly absoluteRoot: string;
    readonly canonicalProjectRoot: string;
    readonly projectId: string;
    readonly create: boolean;
  }): TaskAttemptCustodyRootProof;

  abstract beginFirstWriterPublication(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterBeginPublicationResult;

  abstract appendFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly bytes: Uint8Array;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAppendResult;

  abstract sealFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterSealResult;

  abstract abortFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAbortResult;

  protected abstract requireBinding(
    root: TaskAttemptCustodyRootProof,
    operation: TaskAttemptCustodyOperation,
  ): NativeRootBinding;
  protected abstract openDirectory(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
    disposition: 'OPEN_EXISTING' | 'OPEN_OR_CREATE',
  ): OpenedNativeObject;
  protected abstract openFile(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
  ): OpenedNativeObject;
  protected abstract readOpenedFile(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
    opened: OpenedNativeObject,
    policy: Readonly<TaskAttemptCustodyArtifactLimit>,
  ): TaskAttemptCustodyRead;
  protected abstract directoryProof(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
    identity: ExecAuthorityNativeIdentity,
  ): TaskAttemptCustodyDirectoryProof;
  protected abstract closeNativeHandle(
    custody: ExecAuthorityNativeCustodyFacade,
    handle: ExecAuthorityNativeCustodyHandle,
    operation: TaskAttemptCustodyOperation,
  ): void;
  protected abstract requirePathCapability(
    capability: TaskAttemptCustodyPathCapability,
    binding: NativeRootBinding,
    access: TaskAttemptCustodyPathCapabilityAccess,
    operation: TaskAttemptCustodyOperation,
  ): PathCapabilityScope;
  protected abstract closeMountScopes(
    binding: NativeRootBinding,
    mount: BackendMountScope,
  ): boolean;
  protected abstract revalidateRootPath(binding: NativeRootBinding): void;
  protected abstract revalidateRootSeparation(binding: NativeRootBinding): void;
  protected abstract revalidatePathScope(
    binding: NativeRootBinding,
    scope: PathCapabilityScope,
    immutableFile: boolean,
  ): void;
  protected abstract effectMarkerPath(
    opDigest: Sha256Digest,
    phase: TaskAttemptCustodyDurableEffectMarker['phase'],
  ): TaskAttemptCustodyRelativePath;

  ensurePrivateDirectory(
    root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof {
    const binding = this.requireBinding(root, 'create-directory');
    const path = taskAttemptCustodyRelativePath(relativeDirectory);
    let opened: OpenedNativeObject | null = null;
    try {
      opened = this.openDirectory(binding, path, 'OPEN_OR_CREATE');
      binding.custody.invoke('sync', { handle: opened.handle });
      const identity = binding.custody.invoke('identity', { handle: opened.handle });
      if (!sameObjectIdentity(opened.identity, identity)) {
        hold('CREATE_UNCONFIRMED', 'create-directory');
      }
      const proof = this.directoryProof(binding, path, identity);
      this.closeNativeHandle(binding.custody, opened.handle, 'create-directory');
      opened = null;
      return proof;
    } catch (error) {
      if (opened !== null) {
        try { this.closeNativeHandle(binding.custody, opened.handle, 'create-directory'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'create-directory');
        }
      }
      return mappedNativeHold(error, 'create-directory', 'CREATE_UNCONFIRMED');
    }
  }

  readPrivateDirectory(
    root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof | null {
    const binding = this.requireBinding(root, 'read');
    const path = taskAttemptCustodyRelativePath(relativeDirectory);
    let opened: OpenedNativeObject | null = null;
    try {
      opened = this.openDirectory(binding, path, 'OPEN_EXISTING');
      binding.custody.invoke('sync', { handle: opened.handle });
      const identity = binding.custody.invoke('identity', { handle: opened.handle });
      if (!sameObjectIdentity(opened.identity, identity)) hold('ARTIFACT_CHANGED', 'read');
      const proof = this.directoryProof(binding, path, identity);
      this.closeNativeHandle(binding.custody, opened.handle, 'read');
      opened = null;
      return proof;
    } catch (error) {
      if (opened !== null) {
        try { this.closeNativeHandle(binding.custody, opened.handle, 'read'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'read');
        }
      }
      if (isNativeMissing(error)) return null;
      return mappedNativeHold(error, 'read');
    }
  }

  scanPrivateDirectoryBounded(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativeDirectory: TaskAttemptCustodyRelativePath;
    readonly maxEntries: number;
    readonly maxNameBytes: number;
    readonly deadlineUnixMs: number;
  }): TaskAttemptCustodyDirectoryScanReceiptV2 {
    const binding = this.requireBinding(input.root, 'list-dispatch');
    const path = taskAttemptCustodyRelativePath(input.relativeDirectory);
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
    let opened: OpenedNativeObject | null = null;
    try {
      opened = this.openDirectory(binding, path, 'OPEN_EXISTING');
      const scan = binding.custody.invoke('scan-directory-bounded', {
        directory: opened.handle,
        maxEntries: input.maxEntries,
        maxNameBytes: input.maxNameBytes,
        deadlineUnixMs: input.deadlineUnixMs,
      });
      if (!sameObjectIdentity(opened.identity, scan.before)
        || !sameObjectIdentity(scan.before, scan.after)) {
        hold('DISPATCH_DISCOVERY_MUTATED', 'list-dispatch');
      }
      const receipt = createTaskAttemptCustodyDirectoryScanReceiptV2({
        rootId: binding.proof.rootId,
        relativeDirectory: path,
        names: scan.names,
        entryCount: scan.entryCount,
        maxEntries: scan.requestedMaxEntries,
        maxNameBytes: scan.requestedMaxNameBytes,
        deadlineUnixMs: scan.deadlineUnixMs,
        nativeMutationEvidence: scan.mutationEvidence,
        nativeDirectoryIdentityBeforeDigest: digest(
          'directory-scan-native-identity',
          stableIdentityEvidence(scan.before),
        ),
        nativeDirectoryIdentityAfterDigest: digest(
          'directory-scan-native-identity',
          stableIdentityEvidence(scan.after),
        ),
      });
      this.closeNativeHandle(binding.custody, opened.handle, 'list-dispatch');
      opened = null;
      return receipt;
    } catch (error) {
      if (opened !== null) {
        try { this.closeNativeHandle(binding.custody, opened.handle, 'list-dispatch'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'list-dispatch');
        }
      }
      return mappedNativeHold(error, 'list-dispatch');
    }
  }

  issuePathCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly access: TaskAttemptCustodyPathCapabilityAccess;
    readonly scopeDigest: Sha256Digest;
  }): TaskAttemptCustodyPathCapability {
    const binding = this.requireBinding(input.root, 'probe');
    const relativePath = taskAttemptCustodyRelativePath(input.relativePath);
    if (!isDigest(input.scopeDigest)) hold('CAPABILITY_UNVERIFIED', 'probe');
    let opened: OpenedNativeObject;
    try {
      opened = input.access === 'read-write-directory'
        ? this.openDirectory(binding, relativePath, 'OPEN_EXISTING')
        : this.openFile(binding, relativePath);
    } catch (error) {
      return mappedNativeHold(error, 'probe');
    }
    let contentDigest: Sha256Digest | null = null;
    if (input.access === 'read-only-file') {
      try {
        contentDigest = this.readOpenedFile(
          binding,
          relativePath,
          opened,
          freezeObject({
            minBytes: 0,
            maxBytes: TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
            requireSingleLink: true,
          }),
        ).proof.sha256;
      } catch (error) {
        try { this.closeNativeHandle(binding.custody, opened.handle, 'probe'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'probe');
        }
        return mappedNativeHold(error, 'probe');
      }
    }
    const capabilityEvidenceDigest = digest('path-capability', {
      rootId: binding.proof.rootId,
      relativePath,
      access: input.access,
      scopeDigest: input.scopeDigest,
      identity: stableIdentityEvidence(opened.identity),
      contentDigest,
    });
    const capability = freezeObject({
      kind: 'task-attempt-custody-path-capability' as const,
      access: input.access,
      rootId: binding.proof.rootId,
      scopeDigest: input.scopeDigest,
      capabilityEvidenceDigest,
    }) as TaskAttemptCustodyPathCapability;
    this.pathCapabilities.set(capability, {
      rootId: binding.proof.rootId,
      relativePath,
      access: input.access,
      scopeDigest: input.scopeDigest,
      capabilityEvidenceDigest,
      handle: opened.handle,
      identity: opened.identity,
      contentDigest,
      state: 'OPEN',
    });
    return capability;
  }

  issueBackendMountCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly taskSnapshot: TaskAttemptCustodyPathCapability;
    readonly workerOutput: TaskAttemptCustodyPathCapability;
  }): TaskAttemptCustodyBackendMountCapability {
    const binding = this.requireBinding(input.root, 'resolve-mount');
    const taskSnapshot = this.requirePathCapability(
      input.taskSnapshot,
      binding,
      'read-only-file',
      'resolve-mount',
    );
    const workerOutput = this.requirePathCapability(
      input.workerOutput,
      binding,
      'read-write-directory',
      'resolve-mount',
    );
    if (taskSnapshot.scopeDigest !== workerOutput.scopeDigest) {
      hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    }
    const capability = freezeObject(
      intrinsicReflectApply(intrinsicObjectCreate, Object, [null]) as object,
    ) as TaskAttemptCustodyBackendMountCapability;
    this.backendMounts.set(capability, {
      taskSnapshot,
      workerOutput,
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
    const binding = this.requireBinding(input.root, 'resolve-mount');
    if (
      input.capability === null
      || typeof input.capability !== 'object'
      || intrinsicReflectApply(intrinsicNodeTypesIsProxy, nodeTypes, [input.capability])
      || !intrinsicReflectApply(intrinsicObjectIsFrozen, Object, [input.capability])
      || intrinsicReflectApply(intrinsicReflectOwnKeys, Reflect, [input.capability]).length !== 0
      || !isDigest(input.scopeDigest)
      || !isDigest(input.effectOpDigest)
      || typeof input.attemptId !== 'string'
      || !matchesPattern(UUID_PATTERN, input.attemptId)
      || !Number.isSafeInteger(input.generation)
      || input.generation <= 0
    ) hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    const mount = this.backendMounts.get(input.capability);
    if (
      mount === undefined
      || mount.state !== 'ISSUED'
      || mount.taskSnapshot.state !== 'OPEN'
      || mount.workerOutput.state !== 'OPEN'
      || mount.taskSnapshot.scopeDigest !== input.scopeDigest
      || mount.workerOutput.scopeDigest !== input.scopeDigest
    ) hold('LEASE_CONSUMED', 'resolve-mount');
    mount.state = 'CONSUMING';
    const taskSnapshotPath = join(binding.absoluteRoot, mount.taskSnapshot.relativePath);
    const workerOutputPath = join(binding.absoluteRoot, mount.workerOutput.relativePath);
    let validatedEvidence: ValidatedBackendMountEvidence | null = null;
    let transferFailure: TaskAttemptCustodyHoldCode | null = null;
    const mountConsumer = this.mountConsumer;
    if (mountConsumer === null) {
      transferFailure = 'NATIVE_CAPABILITY_UNAVAILABLE';
    } else {
      try {
        this.revalidateRootSeparation(binding);
        this.revalidateRootPath(binding);
        this.revalidatePathScope(binding, mount.taskSnapshot, true);
        this.revalidatePathScope(binding, mount.workerOutput, false);
        const callbackInput = freezeObject({
          schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
          kind: 'task-attempt-custody-posix-mount-consumer-input' as const,
          taskSnapshot: freezeObject({ sourcePath: taskSnapshotPath, readOnly: true as const }),
          workerOutput: freezeObject({ sourcePath: workerOutputPath, readOnly: false as const }),
          rootId: binding.proof.rootId,
          scopeDigest: input.scopeDigest,
          effectOpDigest: input.effectOpDigest,
          attemptId: input.attemptId,
          generation: input.generation,
        });
        const observationValue = await mountConsumer(callbackInput);
        if (
          observationValue === null
          || typeof observationValue !== 'object'
          || intrinsicReflectApply(
            intrinsicNodeTypesIsProxy,
            nodeTypes,
            [observationValue],
          )
          || intrinsicReflectApply(
            intrinsicWeakSetHas,
            this.consumedMountObservations,
            [observationValue],
          )
        ) hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
        intrinsicReflectApply(
          intrinsicWeakSetAdd,
          this.consumedMountObservations,
          [observationValue],
        );
        validatedEvidence = validateDockerMountObservation(
          observationValue,
          binding,
          mount,
          freezeObject({
            taskSnapshotPath,
            workerOutputPath,
            rootId: binding.proof.rootId,
            scopeDigest: input.scopeDigest,
            effectOpDigest: input.effectOpDigest,
            attemptId: input.attemptId,
            generation: input.generation,
          }),
        );
        if (validatedEvidence === null) hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
        this.revalidateRootSeparation(binding);
        this.revalidateRootPath(binding);
        this.revalidatePathScope(binding, mount.taskSnapshot, true);
        this.revalidatePathScope(binding, mount.workerOutput, false);
      } catch (error) {
        transferFailure = error instanceof TaskAttemptCustodyHold
          ? error.code
          : 'RECONCILIATION_REQUIRED';
      }
    }
    const cleanupConfirmed = this.closeMountScopes(binding, mount);
    if (validatedEvidence === null || transferFailure !== null || !cleanupConfirmed) {
      mount.state = 'CLEANUP_UNCONFIRMED';
      return freezeObject(createTaskAttemptCustodyBackendMountTransferReceipt({
        state: 'CLEANUP_UNCONFIRMED',
        rootId: binding.proof.rootId,
        scopeDigest: input.scopeDigest,
        effectOpDigest: input.effectOpDigest,
        attemptId: input.attemptId,
        generation: input.generation,
        backend: 'docker',
        backendExecutionId: validatedEvidence?.backendExecutionId ?? null,
        backendImageDigest: validatedEvidence?.backendImageDigest ?? null,
        backendAuthorityLabelDigest: validatedEvidence?.backendAuthorityLabelDigest ?? null,
        taskSnapshotMountEvidenceDigest:
          validatedEvidence?.taskSnapshotMountEvidenceDigest ?? null,
        workerOutputMountEvidenceDigest:
          validatedEvidence?.workerOutputMountEvidenceDigest ?? null,
        backendBootstrapProbeEvidenceDigest:
          validatedEvidence?.backendBootstrapProbeEvidenceDigest ?? null,
        daemonMountReceiptDigest: validatedEvidence?.daemonMountReceiptDigest ?? null,
        cleanupEvidenceDigest: digest('mount-cleanup-uncertain', {
          effectOpDigest: input.effectOpDigest,
          transferFailure,
          cleanupConfirmed,
          rootSeparationEvidenceDigest: binding.rootSeparationEvidenceDigest,
          knownEvidence: validatedEvidence,
        }),
      }));
    }
    mount.state = 'CONSUMED';
    return freezeObject(createTaskAttemptCustodyBackendMountTransferReceipt({
      state: 'CONSUMED',
      rootId: binding.proof.rootId,
      scopeDigest: input.scopeDigest,
      effectOpDigest: input.effectOpDigest,
      attemptId: input.attemptId,
      generation: input.generation,
      backend: 'docker',
      backendExecutionId: validatedEvidence.backendExecutionId,
      backendImageDigest: validatedEvidence.backendImageDigest,
      backendAuthorityLabelDigest: validatedEvidence.backendAuthorityLabelDigest,
      taskSnapshotMountEvidenceDigest: validatedEvidence.taskSnapshotMountEvidenceDigest,
      workerOutputMountEvidenceDigest: validatedEvidence.workerOutputMountEvidenceDigest,
      backendBootstrapProbeEvidenceDigest: validatedEvidence.backendBootstrapProbeEvidenceDigest,
      daemonMountReceiptDigest: validatedEvidence.daemonMountReceiptDigest,
      cleanupEvidenceDigest: null,
    }));
  }

  readDurableEffectMarker(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly opDigest: Sha256Digest;
    readonly phase: TaskAttemptCustodyDurableEffectMarker['phase'];
  }): TaskAttemptCustodyDurableEffectMarker | null {
    this.requireBinding(input.root, 'read');
    if (!isDigest(input.opDigest) || (input.phase !== 'INTENT' && input.phase !== 'OUTCOME')) {
      hold('CAPABILITY_UNVERIFIED', 'read');
    }
    const path = this.effectMarkerPath(input.opDigest, input.phase);
    const observed = this.readFirstWriter({
      root: input.root,
      relativePath: path,
      policy: {
        minBytes: 2,
        maxBytes: INTERNAL_JSON_BOUNDS.maxCanonicalBytes,
        requireSingleLink: true,
      },
    });
    if (observed === null) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(NodeBuffer.from(observed.bytes).toString('utf8')); } catch {
      return hold('CORRUPT_CUSTODY_RECORD', 'read');
    }
    const marker = parseDurableMarker(parsed);
    if (
      marker === null
      || marker.opDigest !== input.opDigest
      || marker.phase !== input.phase
      || !NodeBuffer.from(canonicalTaskAttemptCustodyJson(marker, INTERNAL_JSON_BOUNDS))
        .equals(NodeBuffer.from(observed.bytes))
    ) hold('CORRUPT_CUSTODY_RECORD', 'read');
    return marker;
  }

  publishDurableEffectMarkerFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly marker: TaskAttemptCustodyDurableEffectMarker;
  }): TaskAttemptCustodyDurableEffectPublication {
    const marker = parseDurableMarker(input.marker);
    if (marker === null) hold('CAPABILITY_UNVERIFIED', 'publish');
    const directory = taskAttemptCustodyRelativePath(
      `${EFFECT_DIRECTORY}/${marker.opDigest.slice('sha256:'.length)}`,
    );
    this.ensurePrivateDirectory(input.root, directory);
    const path = this.effectMarkerPath(marker.opDigest, marker.phase);
    const bytes = canonicalTaskAttemptCustodyJson(marker, INTERNAL_JSON_BOUNDS);
    const publication = this.publishBytesFirstWriter({
      root: input.root,
      relativePath: path,
      bytes,
      policy: {
        minBytes: 2,
        maxBytes: INTERNAL_JSON_BOUNDS.maxCanonicalBytes,
        requireSingleLink: true,
      },
    });
    const observed = this.readDurableEffectMarker({
      root: input.root,
      opDigest: marker.opDigest,
      phase: marker.phase,
    });
    if (observed === null || observed.markerDigest !== marker.markerDigest) {
      hold('RECONCILIATION_REQUIRED', 'publish');
    }
    return freezeObject({ state: publication.state, marker: observed });
  }

  publishBytesFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly bytes: Uint8Array;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication {
    const binding = this.requireBinding(input.root, 'publish');
    const relativePath = taskAttemptCustodyRelativePath(input.relativePath);
    const policy = validatedPolicy(input.policy);
    const bytes = snapshotBytes(input.bytes);
    if (
      bytes === null
      || bytes.byteLength < policy.minBytes
      || bytes.byteLength > policy.maxBytes
    ) hold('ARTIFACT_OVERSIZE', 'publish');
    const contentDigest = rawSha256(bytes);
    const scopeDigest = digest('direct-publication-scope', {
      rootId: binding.proof.rootId,
      relativePath,
      contentDigest,
    });
    const createEffectOpDigest = digest('direct-publication-stage-effect', {
      scopeDigest,
      stage: 'CREATE',
      contentDigest,
      sequence: 0,
    });
    const appendEffectOpDigest = digest('direct-publication-stage-effect', {
      scopeDigest,
      stage: 'APPEND',
      contentDigest,
      sequence: 1,
    });
    const publishEffectOpDigest = digest('direct-publication-stage-effect', {
      scopeDigest,
      stage: 'PUBLISH',
      contentDigest,
      sequence: 1,
    });
    const abortEffectOpDigest = digest('direct-publication-stage-effect', {
      scopeDigest,
      stage: 'ABORT',
      contentDigest,
      sequence: 1,
    });
    const begin = this.beginFirstWriterPublication({
      root: input.root,
      relativePath,
      policy,
      effectOpDigest: createEffectOpDigest,
      scopeDigest,
      generation: 1,
    });
    if (begin.state !== 'CREATED' || begin.publication === null) {
      return hold(
        begin.state === 'CLEANUP_UNCONFIRMED'
          ? 'CLEANUP_UNCONFIRMED'
          : begin.state === 'CREATE_UNCONFIRMED'
            ? 'CREATE_UNCONFIRMED'
            : 'NO_EFFECT_ABORTED',
        'publish',
      );
    }
    const token = begin.publication;
    try {
      if (bytes.byteLength > 0) {
        this.appendFirstWriterPublication({
          publication: token,
          bytes,
          effectOpDigest: appendEffectOpDigest,
          scopeDigest,
          generation: 1,
        });
      }
      const seal = this.sealFirstWriterPublication({
        publication: token,
        effectOpDigest: publishEffectOpDigest,
        scopeDigest,
        generation: 1,
      });
      if (seal.state === 'PUBLISHED' && seal.publication !== null) return seal.publication;
      const scope = this.publications.get(token);
      if (seal.state === 'NO_EFFECT_ABORTED') {
        hold(scope?.terminalCode ?? 'FIRST_WRITER_COLLISION', 'publish');
      }
      hold(
        seal.state === 'CLEANUP_UNCONFIRMED'
          ? 'CLEANUP_UNCONFIRMED'
          : 'PUBLISHED_UNCONFIRMED',
        'publish',
      );
    } catch (error) {
      const scope = this.publications.get(token);
      if (scope?.state === 'OPEN' || scope?.state === 'APPEND_FAILED') {
        try {
          const cleanup = this.abortFirstWriterPublication({
            publication: token,
            effectOpDigest: abortEffectOpDigest,
            scopeDigest,
            generation: 1,
          });
          if (cleanup.state !== 'ABORTED') {
            return hold('CLEANUP_UNCONFIRMED', 'publish');
          }
        } catch {
          return hold('CLEANUP_UNCONFIRMED', 'publish');
        }
      }
      if (error instanceof TaskAttemptCustodyHold) throw error;
      return mappedNativeHold(error, 'publish', 'PUBLISHED_UNCONFIRMED');
    }
  }

  readFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null {
    const binding = this.requireBinding(input.root, 'read');
    const path = taskAttemptCustodyRelativePath(input.relativePath);
    const policy = validatedPolicy(input.policy);
    let opened: OpenedNativeObject | null = null;
    try {
      opened = this.openFile(binding, path);
      const observed = this.readOpenedFile(binding, path, opened, policy);
      this.closeNativeHandle(binding.custody, opened.handle, 'read');
      opened = null;
      return observed;
    } catch (error) {
      if (opened !== null) {
        try { this.closeNativeHandle(binding.custody, opened.handle, 'read'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'read');
        }
      }
      if (isNativeMissing(error)) return null;
      return mappedNativeHold(error, 'read');
    }
  }

  readVerified(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly proof: TaskAttemptCustodyFileProof;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null {
    const observed = this.readFirstWriter({
      root: input.root,
      relativePath: taskAttemptCustodyRelativePath(input.proof.relativePath),
      policy: input.policy,
    });
    if (observed === null) return null;
    if (!sameProof(observed.proof, input.proof)) hold('ARTIFACT_CHANGED', 'read');
    return observed;
  }

  captureStableFile(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly source: TaskAttemptCustodyPathCapability;
    readonly frozenRelativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication {
    const binding = this.requireBinding(input.root, 'capture');
    const source = this.requirePathCapability(
      input.source,
      binding,
      'capture-read-file',
      'capture',
    );
    const policy = validatedPolicy(input.policy);
    try {
      const observed = this.readOpenedFile(
        binding,
        source.relativePath,
        { handle: source.handle, identity: source.identity },
        policy,
      );
      const publication = this.publishBytesFirstWriter({
        root: input.root,
        relativePath: taskAttemptCustodyRelativePath(input.frozenRelativePath),
        bytes: observed.bytes,
        policy,
      });
      const after = binding.custody.invoke('identity', { handle: source.handle });
      if (!sameImmutableFileIdentity(source.identity, after)) {
        source.state = 'CLEANUP_UNCONFIRMED';
        hold('PUBLISHED_UNCONFIRMED', 'capture');
      }
      this.closeNativeHandle(binding.custody, source.handle, 'capture');
      source.state = 'CONSUMED';
      return publication;
    } catch (error) {
      if (source.state === 'OPEN') {
        try {
          this.closeNativeHandle(binding.custody, source.handle, 'capture');
          source.state = 'CONSUMED';
        } catch {
          source.state = 'CLEANUP_UNCONFIRMED';
          return hold('CLEANUP_UNCONFIRMED', 'capture');
        }
      }
      if (error instanceof TaskAttemptCustodyHold) throw error;
      return mappedNativeHold(error, 'capture', 'PUBLISHED_UNCONFIRMED');
    }
  }
}

function snapshotBytes(value: unknown): Uint8Array | null {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || intrinsicReflectApply(intrinsicNodeTypesIsProxy, nodeTypes, [value])
      || typeof intrinsicTypedArrayBufferGetter !== 'function'
      || typeof intrinsicTypedArrayByteLengthGetter !== 'function'
    ) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== intrinsicUint8ArrayPrototype && prototype !== intrinsicBufferPrototype) {
      return null;
    }
    const backing = Reflect.apply(intrinsicTypedArrayBufferGetter, value, []) as unknown;
    const byteLength = Reflect.apply(intrinsicTypedArrayByteLengthGetter, value, []) as unknown;
    if (
      backing === null
      || typeof backing !== 'object'
      || nodeTypes.isSharedArrayBuffer(backing)
      || typeof byteLength !== 'number'
      || !Number.isSafeInteger(byteLength)
      || byteLength < 0
      || byteLength > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
    ) return null;
    const copy = new Uint8Array(byteLength);
    Reflect.apply(intrinsicTypedArraySet, copy, [value]);
    return copy;
  } catch {
    return null;
  }
}

function digest(domain: string, value: unknown): Sha256Digest {
  return taskAttemptCustodyDigest(`posix-adapter.${domain}`, {
    contract: POSIX_ADAPTER_CONTRACT,
    value,
  }, INTERNAL_JSON_BOUNDS);
}

function rawSha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function nativeErrorCode(error: unknown): ExecAuthorityNativeErrorCode | null {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
      ? descriptor.value as ExecAuthorityNativeErrorCode
      : null;
  } catch {
    return null;
  }
}

function isNativeMissing(error: unknown): boolean {
  const code = nativeErrorCode(error);
  return code === 'E_EXEC_AUTH_NATIVE_NOT_FOUND' || code === 'ENOENT';
}

function mappedNativeHold(
  error: unknown,
  operation: TaskAttemptCustodyOperation,
  fallback: TaskAttemptCustodyHoldCode = 'CAPABILITY_UNVERIFIED',
): never {
  if (error instanceof TaskAttemptCustodyHold) throw error;
  const code = nativeErrorCode(error);
  switch (code) {
    case 'E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE':
      return hold('NATIVE_CAPABILITY_UNAVAILABLE', operation);
    case 'E_EXEC_AUTH_NATIVE_VOLUME_UNSUPPORTED':
    case 'E_EXEC_AUTH_NATIVE_REMOTE_VOLUME_UNSUPPORTED':
    case 'EXDEV':
      return hold('UNSUPPORTED_FILESYSTEM', operation);
    case 'E_EXEC_AUTH_NATIVE_INVALID_COMPONENT':
    case 'EINVAL':
      return hold('UNSAFE_PATH_COMPONENT', operation);
    case 'E_EXEC_AUTH_NATIVE_REPARSE_REJECTED':
    case 'ELOOP':
      return hold('UNSAFE_LINK', operation);
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
      return hold('ARTIFACT_CHANGED', operation);
    case 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_BOUNDS':
      return hold('DISPATCH_DISCOVERY_BOUNDS_EXCEEDED', operation);
    case 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_DEADLINE':
      return hold('DISPATCH_DISCOVERY_DEADLINE_EXCEEDED', operation);
    case 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_MUTATED':
      return hold('DISPATCH_DISCOVERY_MUTATED', operation);
    case 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_ENTRY_INVALID':
      return hold('DISPATCH_DISCOVERY_MALFORMED_CANDIDATE', operation);
    case 'E_EXEC_AUTH_NATIVE_ROOT_OVERLAP':
      return hold(
        operation === 'open-root' ? 'HOST_ROOT_INSIDE_PROJECT' : 'CAPABILITY_UNVERIFIED',
        operation,
      );
    case 'E_EXEC_AUTH_NATIVE_ROOT_SEPARATION_UNCONFIRMED':
      return hold('CAPABILITY_UNVERIFIED', operation);
    case 'E_EXEC_AUTH_NATIVE_NAMESPACE_CONFLICT':
    case 'E_EXEC_AUTH_NATIVE_ALREADY_EXISTS':
    case 'EEXIST':
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
      return hold(
        operation === 'list-dispatch' ? 'DISPATCH_DISCOVERY_MUTATED' : 'APPEND_FAILED',
        operation,
      );
    default:
      return hold(fallback, operation);
  }
}

function validatedPolicy(
  value: TaskAttemptCustodyArtifactLimit,
): Readonly<TaskAttemptCustodyArtifactLimit> {
  const record = snapshotExactRecord(value, ['minBytes', 'maxBytes', 'requireSingleLink']);
  if (
    record === null
    || typeof record.minBytes !== 'number'
    || !Number.isSafeInteger(record.minBytes)
    || record.minBytes < 0
    || typeof record.maxBytes !== 'number'
    || !Number.isSafeInteger(record.maxBytes)
    || record.maxBytes <= 0
    || record.maxBytes < record.minBytes
    || record.maxBytes > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
    || record.requireSingleLink !== true
  ) hold('INVALID_POLICY', 'probe');
  return freezeObject({
    minBytes: record.minBytes,
    maxBytes: record.maxBytes,
    requireSingleLink: true,
  });
}

function checkedRelativePath(value: TaskAttemptCustodyRelativePath): readonly string[] {
  return intrinsicReflectApply(intrinsicStringSplit, value, ['/']) as string[];
}

function pathsOverlap(left: string, right: string): boolean {
  const inside = (candidate: string): boolean => candidate === '' || (
    candidate !== '..'
    && !candidate.startsWith(`..${sep}`)
    && !isAbsolute(candidate)
  );
  return inside(relative(left, right)) || inside(relative(right, left));
}

function identityVolumeId(identity: ExecAuthorityNativeIdentity): string {
  if (
    (identity.platform !== 'linux' && identity.platform !== 'darwin')
    || identity.dev === null
  ) hold('CAPABILITY_UNVERIFIED', 'probe');
  return `posix-dev:${identity.dev}`;
}

function identityObjectId(identity: ExecAuthorityNativeIdentity): string {
  if (identity.dev === null || identity.ino === null) {
    hold('CAPABILITY_UNVERIFIED', 'probe');
  }
  return `posix-devino:${identity.dev}:${identity.ino}`;
}

function sameObjectIdentity(
  left: ExecAuthorityNativeIdentity,
  right: ExecAuthorityNativeIdentity,
): boolean {
  return left.platform === right.platform
    && left.objectType === right.objectType
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mntId === right.mntId
    && left.fsMagic === right.fsMagic
    && left.ownerUid === right.ownerUid
    && left.mode === right.mode
    && left.linkCount === right.linkCount;
}

function sameImmutableFileIdentity(
  left: ExecAuthorityNativeIdentity,
  right: ExecAuthorityNativeIdentity,
): boolean {
  return sameObjectIdentity(left, right) && left.size === right.size;
}

function stableIdentityEvidence(identity: ExecAuthorityNativeIdentity): Readonly<Record<string, unknown>> {
  return freezeObject({
    platform: identity.platform,
    objectType: identity.objectType,
    dev: identity.dev,
    ino: identity.ino,
    mntId: identity.mntId,
    fsMagic: identity.fsMagic,
    ownerUid: identity.ownerUid,
    mode: identity.mode,
    linkCount: identity.linkCount,
    size: identity.size,
  });
}

function exactByteLength(identity: ExecAuthorityNativeIdentity): number {
  try {
    const value = BigInt(identity.size);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) hold('ARTIFACT_OVERSIZE', 'read');
    return Number(value);
  } catch {
    return hold('CAPABILITY_UNVERIFIED', 'read');
  }
}

function sameProof(left: TaskAttemptCustodyFileProof, right: TaskAttemptCustodyFileProof): boolean {
  return left.relativePath === right.relativePath
    && left.sha256 === right.sha256
    && left.byteLength === right.byteLength
    && left.volumeId === right.volumeId
    && left.fileId === right.fileId
    && left.linkCount === right.linkCount
    && left.privacyEvidenceDigest === right.privacyEvidenceDigest
    && left.durabilityEvidenceDigest === right.durabilityEvidenceDigest;
}

function parseDurableMarker(value: unknown): TaskAttemptCustodyDurableEffectMarker | null {
  const record = snapshotExactRecord(value, [
    'schemaVersion', 'kind', 'phase', 'opDigest', 'outcomeDigest',
    'effectReceiptDigest', 'effectEvidenceDigest', 'markerDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || record.kind !== 'task-attempt-custody-effect-marker'
    || (record.phase !== 'INTENT' && record.phase !== 'OUTCOME')
    || !isDigest(record.opDigest)
    || (record.outcomeDigest !== null && !isDigest(record.outcomeDigest))
    || (record.effectReceiptDigest !== null && !isDigest(record.effectReceiptDigest))
    || (record.effectEvidenceDigest !== null && !isDigest(record.effectEvidenceDigest))
    || !isDigest(record.markerDigest)
  ) return null;
  return freezeObject({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-effect-marker',
    phase: record.phase,
    opDigest: record.opDigest,
    outcomeDigest: record.outcomeDigest,
    effectReceiptDigest: record.effectReceiptDigest,
    effectEvidenceDigest: record.effectEvidenceDigest,
    markerDigest: record.markerDigest,
  });
}

class PosixTaskAttemptCustodyAdapter extends PosixTaskAttemptCustodyAdapterCore {
  openRoot(input: {
    readonly absoluteRoot: string;
    readonly canonicalProjectRoot: string;
    readonly projectId: string;
    readonly create: boolean;
  }): TaskAttemptCustodyRootProof {
    const record = snapshotExactRecord(input, [
      'absoluteRoot', 'canonicalProjectRoot', 'projectId', 'create',
    ]);
    if (
      record === null
      || typeof record.absoluteRoot !== 'string'
      || typeof record.canonicalProjectRoot !== 'string'
      || typeof record.projectId !== 'string'
      || record.projectId.length === 0
      || NodeBuffer.byteLength(record.projectId, 'utf8') > 512
      || typeof record.create !== 'boolean'
      || !isAbsolute(record.absoluteRoot)
      || !isAbsolute(record.canonicalProjectRoot)
      || resolve(record.absoluteRoot) !== record.absoluteRoot
      || resolve(record.canonicalProjectRoot) !== record.canonicalProjectRoot
      || record.absoluteRoot.includes('\0')
      || record.canonicalProjectRoot.includes('\0')
    ) hold('UNSAFE_ROOT', 'open-root');
    if (pathsOverlap(record.absoluteRoot, record.canonicalProjectRoot)) {
      hold('HOST_ROOT_INSIDE_PROJECT', 'open-root');
    }
    if (this.binding !== null) {
      if (
        this.binding.absoluteRoot !== record.absoluteRoot
        || this.binding.canonicalProjectRoot !== record.canonicalProjectRoot
        || this.binding.projectId !== record.projectId
      ) hold('CAPABILITY_UNVERIFIED', 'open-root');
      return this.binding.proof;
    }

    const native = loadExecAuthorityNative();
    if (!native.available) hold('NATIVE_CAPABILITY_UNAVAILABLE', 'open-root');
    if (
      native.manifest.platform !== 'linux'
      || !native.manifest.features.includes('custody-posix-v1')
    ) hold('UNSUPPORTED_PLATFORM', 'open-root');

    let root: OpenedNativeObject | null = null;
    try {
      const opened = native.custody.invoke('open-root', {
        path: record.absoluteRoot,
        disposition: record.create ? 'OPEN_OR_CREATE' : 'OPEN_EXISTING',
        privacyPolicy: 'OWNER_PRIVATE',
      });
      root = { handle: opened.handle, identity: opened.identity };
      const probe = native.custody.invoke('probe', { handle: root.handle });
      if (!probe.available || probe.identity === null) {
        this.closeNativeHandle(native.custody, root.handle, 'open-root');
        root = null;
        hold('UNSUPPORTED_FILESYSTEM', 'open-root');
      }
      native.custody.invoke('sync', { handle: root.handle });
      const rootIdentity = native.custody.invoke('identity', { handle: root.handle });
      if (
        rootIdentity.objectType !== 'DIRECTORY'
        || !sameObjectIdentity(probe.identity, rootIdentity)
      ) hold('CAPABILITY_UNVERIFIED', 'open-root');
      const rootSeparation = native.custody.invoke('prove-root-separation', {
        custodyRoot: root.handle,
        canonicalProjectRoot: record.canonicalProjectRoot,
      });
      if (
        rootSeparation.state !== 'CONFIRMED'
        || rootSeparation.projectIdentity.objectType !== 'DIRECTORY'
        || !sameObjectIdentity(rootIdentity, rootSeparation.custodyIdentity)
      ) hold('CAPABILITY_UNVERIFIED', 'open-root');
      const rootSeparationEvidenceDigest = digest('root-separation', {
        state: rootSeparation.state,
        custodyIdentity: stableIdentityEvidence(rootSeparation.custodyIdentity),
        projectIdentity: stableIdentityEvidence(rootSeparation.projectIdentity),
        featureEvidenceBits: rootSeparation.featureEvidenceBits,
      });
      const canonicalProjectRootSha256 = createHash('sha256')
        .update(record.canonicalProjectRoot, 'utf8')
        .digest('hex');
      const volumeId = identityVolumeId(rootIdentity);
      const directoryId = identityObjectId(rootIdentity);
      const capabilityEvidenceDigest = digest('root-capability', {
        platform: native.manifest.platform,
        arch: native.manifest.arch,
        abiVersion: native.manifest.abiVersion,
        handleAbi: native.manifest.handleAbi,
        projectId: record.projectId,
        canonicalProjectRootSha256,
        volumeId,
        directoryId,
        probeFeatureEvidenceBits: probe.featureEvidenceBits,
        volumeCapabilities: probe.identity.volumeCapabilities,
        rootSeparationEvidenceDigest,
      });
      const proof = freezeObject({
        platform: 'posix' as const,
        projectId: record.projectId,
        canonicalProjectRootSha256,
        rootId: digest('root-authority', {
          projectId: record.projectId,
          canonicalProjectRootSha256,
          volumeId,
          directoryId,
          capabilityEvidenceDigest,
        }),
        volumeId,
        directoryId,
        capabilityEvidenceDigest,
      });
      this.binding = freezeObject({
        absoluteRoot: record.absoluteRoot,
        canonicalProjectRoot: record.canonicalProjectRoot,
        projectId: record.projectId,
        native,
        custody: native.custody,
        rootHandle: root.handle,
        rootIdentity,
        rootSeparation,
        rootSeparationEvidenceDigest,
        proof,
      });
      return proof;
    } catch (error) {
      if (root !== null) {
        try { this.closeNativeHandle(native.custody, root.handle, 'open-root'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'open-root');
        }
      }
      return mappedNativeHold(error, 'open-root');
    }
  }

  beginFirstWriterPublication(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterBeginPublicationResult {
    const binding = this.requireBinding(input.root, 'seal-stream');
    const target = taskAttemptCustodyRelativePath(input.relativePath);
    const policy = validatedPolicy(input.policy);
    if (
      !isDigest(input.effectOpDigest)
      || !isDigest(input.scopeDigest)
      || !Number.isSafeInteger(input.generation)
      || input.generation <= 0
    ) hold('CAPABILITY_UNVERIFIED', 'seal-stream');

    let parent: OpenedNativeParent | null = null;
    let publicationHandle: ExecAuthorityNativeCustodyHandle | null = null;
    try {
      parent = this.openParentDirectory(binding, target);
      publicationHandle = binding.custody.invoke('begin-publication', {
        parent: parent.handle,
        name: parent.name,
        maxBytes: policy.maxBytes,
      });
      const beginIdentity = binding.custody.invoke('identity', { handle: publicationHandle });
      if (beginIdentity.objectType !== 'REGULAR_FILE' || beginIdentity.size !== '0') {
        hold('CREATE_UNCONFIRMED', 'seal-stream');
      }
      if (parent.owned) {
        this.closeNativeHandle(binding.custody, parent.handle, 'seal-stream');
      }
      parent = null;
      const publication = freezeObject(
        Object.create(null),
      ) as TaskAttemptCustodyAdapterPublicationToken;
      const consumedEffectOpDigests = new IntrinsicSet<Sha256Digest>();
      intrinsicReflectApply(
        intrinsicSetAdd,
        consumedEffectOpDigests,
        [input.effectOpDigest],
      );
      this.publications.set(publication, {
        handle: publicationHandle,
        target,
        policy,
        createEffectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        beginIdentity,
        consumedEffectOpDigests,
        state: 'OPEN',
        byteLength: 0,
        appendSequence: 0,
        terminalCode: null,
      });
      publicationHandle = null;
      return freezeObject({
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-publication-begin' as const,
        state: 'CREATED' as const,
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: digest('publication-begin', {
          rootId: binding.proof.rootId,
          target,
          policy,
          effectOpDigest: input.effectOpDigest,
          scopeDigest: input.scopeDigest,
          generation: input.generation,
          identity: stableIdentityEvidence(beginIdentity),
        }),
        publication,
      });
    } catch (error) {
      let cleanupConfirmed = true;
      if (publicationHandle !== null) {
        try {
          const cleanup = binding.custody.invoke('abort-publication', {
            publication: publicationHandle,
          });
          cleanupConfirmed = cleanup.state === 'CLEANUP_CONFIRMED';
        } catch {
          cleanupConfirmed = false;
        }
      }
      if (parent?.owned === true) {
        try { this.closeNativeHandle(binding.custody, parent.handle, 'seal-stream'); } catch {
          cleanupConfirmed = false;
        }
      }
      const nativeCode = nativeErrorCode(error);
      const state = !cleanupConfirmed
        ? 'CLEANUP_UNCONFIRMED' as const
        : nativeCode === 'E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED'
          ? 'CREATE_UNCONFIRMED' as const
          : 'NO_EFFECT_ABORTED' as const;
      if (
        error instanceof TaskAttemptCustodyHold
        && error.code !== 'CREATE_UNCONFIRMED'
        && error.code !== 'CLEANUP_UNCONFIRMED'
      ) throw error;
      return freezeObject({
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-publication-begin' as const,
        state,
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: digest('publication-begin-terminal', {
          rootId: binding.proof.rootId,
          target,
          effectOpDigest: input.effectOpDigest,
          scopeDigest: input.scopeDigest,
          generation: input.generation,
          nativeCode,
          cleanupConfirmed,
          state,
        }),
        publication: null,
      });
    }
  }

  appendFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly bytes: Uint8Array;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAppendResult {
    const scope = this.requirePublication(
      input.publication,
      input.scopeDigest,
      input.generation,
      ['OPEN'],
    );
    this.consumeStageEffectDigest(scope, input.effectOpDigest);
    const binding = this.requirePublicationBinding('seal-stream');
    const bytes = snapshotBytes(input.bytes);
    if (
      bytes === null
      || scope.byteLength + bytes.byteLength > scope.policy.maxBytes
      || scope.byteLength + bytes.byteLength > TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES
    ) {
      scope.state = 'APPEND_FAILED';
      hold('ARTIFACT_OVERSIZE', 'seal-stream');
    }
    try {
      const appended = binding.custody.invoke('append-publication', {
        publication: scope.handle,
        bytes,
      });
      if (appended.byteLength !== bytes.byteLength) {
        scope.state = 'APPEND_FAILED';
        hold('APPEND_FAILED', 'seal-stream');
      }
      scope.byteLength += appended.byteLength;
      scope.appendSequence += 1;
      return createTaskAttemptCustodyAdapterAppendResult({
        state: 'APPENDED',
        byteLength: bytes.byteLength,
        effectOpDigest: input.effectOpDigest,
        scopeDigest: scope.scopeDigest,
        generation: scope.generation,
        evidenceDigest: digest('publication-append', {
          target: scope.target,
          effectOpDigest: input.effectOpDigest,
          createEffectOpDigest: scope.createEffectOpDigest,
          scopeDigest: scope.scopeDigest,
          generation: scope.generation,
          appendSequence: scope.appendSequence,
          byteLength: scope.byteLength,
          chunkDigest: rawSha256(bytes),
        }),
      });
    } catch (error) {
      scope.state = 'APPEND_FAILED';
      return mappedNativeHold(error, 'seal-stream', 'APPEND_FAILED');
    }
  }

  sealFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterSealResult {
    const scope = this.requirePublication(
      input.publication,
      input.scopeDigest,
      input.generation,
      ['OPEN'],
    );
    this.consumeStageEffectDigest(scope, input.effectOpDigest);
    const binding = this.requirePublicationBinding('seal-stream');
    if (scope.byteLength < scope.policy.minBytes || scope.byteLength > scope.policy.maxBytes) {
      scope.terminalCode = 'ARTIFACT_OVERSIZE';
      return this.abortAsSealNoEffect(
        binding,
        scope,
        input.effectOpDigest,
        'ARTIFACT_OVERSIZE',
      );
    }

    let sealed: ExecAuthorityNativePublication;
    try {
      sealed = binding.custody.invoke('seal-publication', {
        publication: scope.handle,
      });
    } catch (error) {
      const code = nativeErrorCode(error);
      if (
        code === 'E_EXEC_AUTH_NATIVE_NAMESPACE_CONFLICT'
        || code === 'E_EXEC_AUTH_NATIVE_ALREADY_EXISTS'
        || code === 'EEXIST'
      ) {
        scope.terminalCode = 'FIRST_WRITER_COLLISION';
        return this.abortAsSealNoEffect(
          binding,
          scope,
          input.effectOpDigest,
          'FIRST_WRITER_COLLISION',
        );
      }
      return this.sealUncertain(binding, scope, input.effectOpDigest, code);
    }

    if (
      sealed.state === 'PUBLISHED_UNCONFIRMED'
      || sealed.readHandle === null
      || sealed.identity === null
    ) return this.sealUncertain(
      binding,
      scope,
      input.effectOpDigest,
      sealed.reasonCode,
    );

    const opened: OpenedNativeObject = {
      handle: sealed.readHandle,
      identity: sealed.identity,
    };
    try {
      const observed = this.readOpenedFile(binding, scope.target, opened, scope.policy);
      if (observed.proof.byteLength !== scope.byteLength) {
        hold('PUBLISHED_UNCONFIRMED', 'seal-stream');
      }
      this.closeNativeHandle(binding.custody, opened.handle, 'seal-stream');
      scope.state = 'CONSUMED';
      return this.sealTerminalResult(scope, input.effectOpDigest, 'PUBLISHED', {
        state: sealed.state,
        proof: observed.proof,
      }, {
        nativeState: sealed.state,
        nativeEvidenceBits: sealed.featureEvidenceBits,
        proof: observed.proof,
      });
    } catch (error) {
      try { this.closeNativeHandle(binding.custody, opened.handle, 'seal-stream'); } catch {
        scope.state = 'CLEANUP_UNCONFIRMED';
        return this.sealTerminalResult(
          scope,
          input.effectOpDigest,
          'CLEANUP_UNCONFIRMED',
          null,
          {
          nativeState: sealed.state,
          reason: 'post-seal-read-or-close',
          },
        );
      }
      scope.state = 'PUBLISHED_UNCONFIRMED';
      return this.sealTerminalResult(
        scope,
        input.effectOpDigest,
        'PUBLISHED_UNCONFIRMED',
        null,
        {
        nativeState: sealed.state,
        nativeCode: nativeErrorCode(error),
        reason: 'post-seal-proof',
        },
      );
    }
  }

  abortFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAbortResult {
    const scope = this.requirePublication(
      input.publication,
      input.scopeDigest,
      input.generation,
      ['OPEN', 'APPEND_FAILED'],
    );
    this.consumeStageEffectDigest(scope, input.effectOpDigest);
    const binding = this.requirePublicationBinding('seal-stream');
    let state: TaskAttemptCustodyAdapterAbortResult['state'];
    let nativeCode: ExecAuthorityNativeErrorCode | null = null;
    try {
      const cleanup = binding.custody.invoke('abort-publication', {
        publication: scope.handle,
      });
      state = cleanup.state === 'CLEANUP_CONFIRMED'
        ? 'ABORTED'
        : 'CLEANUP_UNCONFIRMED';
    } catch (error) {
      nativeCode = nativeErrorCode(error);
      state = 'CLEANUP_UNCONFIRMED';
    }
    scope.state = state === 'ABORTED' ? 'CONSUMED' : 'CLEANUP_UNCONFIRMED';
    return createTaskAttemptCustodyAdapterAbortResult({
      state,
      effectOpDigest: input.effectOpDigest,
      scopeDigest: scope.scopeDigest,
      generation: scope.generation,
      evidenceDigest: digest('publication-abort', {
        target: scope.target,
        effectOpDigest: input.effectOpDigest,
        createEffectOpDigest: scope.createEffectOpDigest,
        scopeDigest: scope.scopeDigest,
        generation: scope.generation,
        byteLength: scope.byteLength,
        nativeCode,
        state,
      }),
    });
  }

  protected requireBinding(
    root: TaskAttemptCustodyRootProof,
    operation: TaskAttemptCustodyOperation,
  ): NativeRootBinding {
    const binding = this.binding;
    if (
      binding === null
      || root === null
      || typeof root !== 'object'
      || intrinsicReflectApply(intrinsicNodeTypesIsProxy, nodeTypes, [root])
      || root.platform !== binding.proof.platform
      || root.projectId !== binding.proof.projectId
      || root.canonicalProjectRootSha256 !== binding.proof.canonicalProjectRootSha256
      || root.rootId !== binding.proof.rootId
      || root.volumeId !== binding.proof.volumeId
      || root.directoryId !== binding.proof.directoryId
      || root.capabilityEvidenceDigest !== binding.proof.capabilityEvidenceDigest
    ) hold('CAPABILITY_UNVERIFIED', operation);
    return binding;
  }

  protected openDirectory(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
    disposition: 'OPEN_EXISTING' | 'OPEN_OR_CREATE',
  ): OpenedNativeObject {
    const components = checkedRelativePath(path);
    return this.openDirectoryComponents(binding, components, components.length, disposition);
  }

  private openDirectoryComponents(
    binding: NativeRootBinding,
    components: readonly string[],
    componentCount: number,
    disposition: 'OPEN_EXISTING' | 'OPEN_OR_CREATE',
  ): OpenedNativeObject {
    let current: OpenedNativeObject = {
      handle: binding.rootHandle,
      identity: binding.rootIdentity,
    };
    let currentOwned = false;
    try {
      for (let index = 0; index < componentCount; index += 1) {
        const opened = binding.custody.invoke('open-directory-at', {
          parent: current.handle,
          name: components[index]!,
          disposition,
          privacyPolicy: 'OWNER_PRIVATE',
        });
        const previous = current;
        const previousOwned = currentOwned;
        current = { handle: opened.handle, identity: opened.identity };
        currentOwned = true;
        if (previousOwned) {
          this.closeNativeHandle(binding.custody, previous.handle, 'create-directory');
        }
      }
      binding.custody.invoke('apply-private', { handle: current.handle });
      const identity = binding.custody.invoke('identity', { handle: current.handle });
      if (
        identity.objectType !== 'DIRECTORY'
        || identity.mode !== '0700'
        || !sameObjectIdentity(current.identity, identity)
      ) hold('PRIVACY_UNVERIFIED', 'create-directory');
      return { handle: current.handle, identity };
    } catch (error) {
      if (currentOwned) {
        try { this.closeNativeHandle(binding.custody, current.handle, 'create-directory'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'create-directory');
        }
      }
      throw error;
    }
  }

  private openParentDirectory(
    binding: NativeRootBinding,
    target: TaskAttemptCustodyRelativePath,
  ): OpenedNativeParent {
    const components = checkedRelativePath(target);
    const name = components[components.length - 1];
    if (name === undefined) hold('UNSAFE_RELATIVE_PATH', 'seal-stream');
    if (components.length === 1) {
      return {
        handle: binding.rootHandle,
        identity: binding.rootIdentity,
        owned: false,
        name,
      };
    }
    const opened = this.openDirectoryComponents(
      binding,
      components,
      components.length - 1,
      'OPEN_EXISTING',
    );
    return { ...opened, owned: true, name };
  }

  protected openFile(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
  ): OpenedNativeObject {
    let parent: OpenedNativeParent | null = null;
    let opened: OpenedNativeObject | null = null;
    try {
      parent = this.openParentDirectory(binding, path);
      const result = binding.custody.invoke('open-file-at', {
        parent: parent.handle,
        name: parent.name,
        disposition: 'OPEN_EXISTING',
        privacyPolicy: 'OWNER_PRIVATE',
      });
      opened = { handle: result.handle, identity: result.identity };
      if (parent.owned) {
        this.closeNativeHandle(binding.custody, parent.handle, 'read');
      }
      parent = null;
      if (
        opened.identity.objectType !== 'REGULAR_FILE'
        || (opened.identity.mode !== '0400' && opened.identity.mode !== '0600')
        || opened.identity.linkCount !== '1'
      ) hold(
        opened.identity.linkCount !== '1' ? 'LINK_COUNT_INVALID' : 'PRIVACY_UNVERIFIED',
        'read',
      );
      return opened;
    } catch (error) {
      if (opened !== null) {
        try { this.closeNativeHandle(binding.custody, opened.handle, 'read'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'read');
        }
      }
      if (parent?.owned === true) {
        try { this.closeNativeHandle(binding.custody, parent.handle, 'read'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'read');
        }
      }
      throw error;
    }
  }

  protected readOpenedFile(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
    opened: OpenedNativeObject,
    policy: Readonly<TaskAttemptCustodyArtifactLimit>,
  ): TaskAttemptCustodyRead {
    const expectedLength = exactByteLength(opened.identity);
    if (expectedLength < policy.minBytes || expectedLength > policy.maxBytes) {
      hold('ARTIFACT_OVERSIZE', 'read');
    }
    const requestedMaxBytes = Math.max(1, expectedLength);
    const observed = binding.custody.invoke('read-bounded', {
      file: opened.handle,
      maxBytes: requestedMaxBytes,
    });
    const bytes = snapshotBytes(observed.bytes);
    if (
      bytes === null
      || observed.requestedMaxBytes !== requestedMaxBytes
      || observed.eof !== (observed.observedBytes < observed.requestedMaxBytes)
      || observed.observedBytes !== expectedLength
      || bytes.byteLength !== expectedLength
      || !sameImmutableFileIdentity(opened.identity, observed.before)
      || !sameImmutableFileIdentity(observed.before, observed.after)
    ) hold('ARTIFACT_CHANGED', 'read');
    return freezeObject({
      bytes,
      proof: this.fileProof(binding, path, observed.after, bytes),
    });
  }

  protected directoryProof(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
    identity: ExecAuthorityNativeIdentity,
  ): TaskAttemptCustodyDirectoryProof {
    if (identity.objectType !== 'DIRECTORY' || identity.mode !== '0700') {
      hold('PRIVACY_UNVERIFIED', 'probe');
    }
    const identityEvidence = stableIdentityEvidence(identity);
    return freezeObject({
      relativePath: path,
      volumeId: identityVolumeId(identity),
      directoryId: identityObjectId(identity),
      privacyEvidenceDigest: digest('directory-privacy', {
        rootId: binding.proof.rootId,
        path,
        identity: identityEvidence,
      }),
      durabilityEvidenceDigest: digest('directory-durability', {
        rootId: binding.proof.rootId,
        path,
        identity: identityEvidence,
        state: 'SYNC_CONFIRMED',
      }),
    });
  }

  private fileProof(
    binding: NativeRootBinding,
    path: TaskAttemptCustodyRelativePath,
    identity: ExecAuthorityNativeIdentity,
    bytes: Uint8Array,
  ): TaskAttemptCustodyFileProof {
    if (
      identity.objectType !== 'REGULAR_FILE'
      || (identity.mode !== '0400' && identity.mode !== '0600')
    ) hold('PRIVACY_UNVERIFIED', 'read');
    if (identity.linkCount !== '1') hold('LINK_COUNT_INVALID', 'read');
    const identityEvidence = stableIdentityEvidence(identity);
    return freezeObject({
      relativePath: path,
      sha256: rawSha256(bytes),
      byteLength: bytes.byteLength,
      volumeId: identityVolumeId(identity),
      fileId: identityObjectId(identity),
      linkCount: 1 as const,
      privacyEvidenceDigest: digest('file-privacy', {
        rootId: binding.proof.rootId,
        path,
        identity: identityEvidence,
      }),
      durabilityEvidenceDigest: digest('file-durability', {
        rootId: binding.proof.rootId,
        path,
        identity: identityEvidence,
        state: 'SEALED_AND_REOPENED',
      }),
    });
  }

  protected closeNativeHandle(
    custody: ExecAuthorityNativeCustodyFacade,
    handle: ExecAuthorityNativeCustodyHandle,
    operation: TaskAttemptCustodyOperation,
  ): void {
    try {
      custody.closeHandle(handle);
    } catch (error) {
      return mappedNativeHold(error, operation, 'CLEANUP_UNCONFIRMED');
    }
  }

  protected requirePathCapability(
    capability: TaskAttemptCustodyPathCapability,
    binding: NativeRootBinding,
    access: TaskAttemptCustodyPathCapabilityAccess,
    operation: TaskAttemptCustodyOperation,
  ): PathCapabilityScope {
    if (
      capability === null
      || typeof capability !== 'object'
      || intrinsicReflectApply(intrinsicNodeTypesIsProxy, nodeTypes, [capability])
      || !intrinsicReflectApply(intrinsicObjectIsFrozen, Object, [capability])
    ) hold('CAPABILITY_UNVERIFIED', operation);
    const scope = this.pathCapabilities.get(capability);
    if (
      scope === undefined
      || scope.state !== 'OPEN'
      || scope.rootId !== binding.proof.rootId
      || scope.access !== access
      || capability.kind !== 'task-attempt-custody-path-capability'
      || capability.access !== access
      || capability.rootId !== scope.rootId
      || capability.scopeDigest !== scope.scopeDigest
      || capability.capabilityEvidenceDigest !== scope.capabilityEvidenceDigest
    ) hold(scope?.state === 'CONSUMED' ? 'LEASE_CONSUMED' : 'CAPABILITY_UNVERIFIED', operation);
    return scope;
  }

  protected closeMountScopes(
    binding: NativeRootBinding,
    mount: BackendMountScope,
  ): boolean {
    let confirmed = true;
    const scopes = [mount.taskSnapshot, mount.workerOutput] as const;
    for (let index = 0; index < scopes.length; index += 1) {
      const scope = scopes[index]!;
      if (scope.state !== 'OPEN') continue;
      try {
        this.closeNativeHandle(binding.custody, scope.handle, 'resolve-mount');
        scope.state = 'CONSUMED';
      } catch {
        scope.state = 'CLEANUP_UNCONFIRMED';
        confirmed = false;
      }
    }
    return confirmed;
  }

  protected revalidateRootSeparation(binding: NativeRootBinding): void {
    try {
      const separation = binding.custody.invoke('prove-root-separation', {
        custodyRoot: binding.rootHandle,
        canonicalProjectRoot: binding.canonicalProjectRoot,
      });
      const evidenceDigest = digest('root-separation', {
        state: separation.state,
        custodyIdentity: stableIdentityEvidence(separation.custodyIdentity),
        projectIdentity: stableIdentityEvidence(separation.projectIdentity),
        featureEvidenceBits: separation.featureEvidenceBits,
      });
      if (
        separation.state !== 'CONFIRMED'
        || !sameObjectIdentity(binding.rootIdentity, separation.custodyIdentity)
        || !sameObjectIdentity(
          binding.rootSeparation.projectIdentity,
          separation.projectIdentity,
        )
        || separation.featureEvidenceBits !== binding.rootSeparation.featureEvidenceBits
        || evidenceDigest !== binding.rootSeparationEvidenceDigest
      ) hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    } catch (error) {
      return mappedNativeHold(error, 'resolve-mount');
    }
  }

  protected revalidateRootPath(binding: NativeRootBinding): void {
    let reopened: OpenedNativeObject | null = null;
    try {
      const result = binding.custody.invoke('open-root', {
        path: binding.absoluteRoot,
        disposition: 'OPEN_EXISTING',
        privacyPolicy: 'OWNER_PRIVATE',
      });
      reopened = { handle: result.handle, identity: result.identity };
      if (!sameObjectIdentity(binding.rootIdentity, reopened.identity)) {
        hold('CAPABILITY_UNVERIFIED', 'resolve-mount');
      }
      this.closeNativeHandle(binding.custody, reopened.handle, 'resolve-mount');
      reopened = null;
    } catch (error) {
      if (reopened !== null) {
        try { this.closeNativeHandle(binding.custody, reopened.handle, 'resolve-mount'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
        }
      }
      return mappedNativeHold(error, 'resolve-mount');
    }
  }

  protected revalidatePathScope(
    binding: NativeRootBinding,
    scope: PathCapabilityScope,
    immutableFile: boolean,
  ): void {
    let reopened: OpenedNativeObject | null = null;
    try {
      reopened = immutableFile
        ? this.openFile(binding, scope.relativePath)
        : this.openDirectory(binding, scope.relativePath, 'OPEN_EXISTING');
      const identical = immutableFile
        ? sameImmutableFileIdentity(scope.identity, reopened.identity)
        : sameObjectIdentity(scope.identity, reopened.identity);
      if (!identical) hold('ARTIFACT_CHANGED', 'resolve-mount');
      if (immutableFile) {
        const contentDigest = this.readOpenedFile(
          binding,
          scope.relativePath,
          reopened,
          freezeObject({
            minBytes: 0,
            maxBytes: TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
            requireSingleLink: true,
          }),
        ).proof.sha256;
        if (scope.contentDigest === null || contentDigest !== scope.contentDigest) {
          hold('ARTIFACT_CHANGED', 'resolve-mount');
        }
      }
      this.closeNativeHandle(binding.custody, reopened.handle, 'resolve-mount');
      reopened = null;
    } catch (error) {
      if (reopened !== null) {
        try { this.closeNativeHandle(binding.custody, reopened.handle, 'resolve-mount'); } catch {
          return hold('CLEANUP_UNCONFIRMED', 'resolve-mount');
        }
      }
      return mappedNativeHold(error, 'resolve-mount');
    }
  }

  protected effectMarkerPath(
    opDigest: Sha256Digest,
    phase: TaskAttemptCustodyDurableEffectMarker['phase'],
  ): TaskAttemptCustodyRelativePath {
    return taskAttemptCustodyRelativePath(
      `${EFFECT_DIRECTORY}/${opDigest.slice('sha256:'.length)}/${phase.toLowerCase()}.json`,
    );
  }

  private requirePublication(
    token: TaskAttemptCustodyAdapterPublicationToken,
    scopeDigest: Sha256Digest,
    generation: number,
    allowedStates: readonly PublicationState[],
  ): PublicationScope {
    if (
      token === null
      || typeof token !== 'object'
      || intrinsicReflectApply(intrinsicNodeTypesIsProxy, nodeTypes, [token])
      || !intrinsicReflectApply(intrinsicObjectIsFrozen, Object, [token])
      || intrinsicReflectApply(intrinsicReflectOwnKeys, Reflect, [token]).length !== 0
      || !isDigest(scopeDigest)
      || !Number.isSafeInteger(generation)
      || generation <= 0
    ) hold('CAPABILITY_UNVERIFIED', 'seal-stream');
    const scope = this.publications.get(token);
    if (
      scope === undefined
      || scope.scopeDigest !== scopeDigest
      || scope.generation !== generation
    ) hold('CAPABILITY_UNVERIFIED', 'seal-stream');
    if (!allowedStates.includes(scope.state)) {
      hold(scope.state === 'CONSUMED' ? 'LEASE_CONSUMED' : 'RECONCILIATION_REQUIRED', 'seal-stream');
    }
    return scope;
  }

  private consumeStageEffectDigest(
    scope: PublicationScope,
    effectOpDigest: Sha256Digest,
  ): void {
    if (
      !isDigest(effectOpDigest)
      || intrinsicReflectApply(
        intrinsicSetHas,
        scope.consumedEffectOpDigests,
        [effectOpDigest],
      )
    ) hold('CAPABILITY_UNVERIFIED', 'seal-stream');
    intrinsicReflectApply(
      intrinsicSetAdd,
      scope.consumedEffectOpDigests,
      [effectOpDigest],
    );
  }

  private requirePublicationBinding(operation: TaskAttemptCustodyOperation): NativeRootBinding {
    if (this.binding === null) hold('CAPABILITY_UNVERIFIED', operation);
    return this.binding;
  }

  private abortAsSealNoEffect(
    binding: NativeRootBinding,
    scope: PublicationScope,
    effectOpDigest: Sha256Digest,
    reason: TaskAttemptCustodyHoldCode,
  ): TaskAttemptCustodyAdapterSealResult {
    let cleanupConfirmed = false;
    let nativeCode: ExecAuthorityNativeErrorCode | null = null;
    try {
      const cleanup = binding.custody.invoke('abort-publication', {
        publication: scope.handle,
      });
      cleanupConfirmed = cleanup.state === 'CLEANUP_CONFIRMED';
    } catch (error) {
      nativeCode = nativeErrorCode(error);
    }
    scope.terminalCode = reason;
    scope.state = cleanupConfirmed ? 'CONSUMED' : 'CLEANUP_UNCONFIRMED';
    return this.sealTerminalResult(
      scope,
      effectOpDigest,
      cleanupConfirmed ? 'NO_EFFECT_ABORTED' : 'CLEANUP_UNCONFIRMED',
      null,
      { reason, nativeCode, cleanupConfirmed },
    );
  }

  private sealUncertain(
    binding: NativeRootBinding,
    scope: PublicationScope,
    effectOpDigest: Sha256Digest,
    nativeCode: string | null,
  ): TaskAttemptCustodyAdapterSealResult {
    let state: 'PUBLISHED_UNCONFIRMED' | 'CLEANUP_UNCONFIRMED' = 'CLEANUP_UNCONFIRMED';
    let reconciliationEvidence: Readonly<Record<string, unknown>> = freezeObject({
      nativeCode,
      reconciliation: 'UNAVAILABLE',
    });
    try {
      const reconciliation = binding.custody.consumeSealReconciliation(scope.handle);
      state = reconciliation.outcome;
      reconciliationEvidence = freezeObject({
        nativeCode,
        reconciliation: reconciliation.outcome,
        publicationState: reconciliation.publicationState,
        sourceGeneration: reconciliation.sourceGeneration,
        authorityKind: reconciliation.authorityKind,
        identity: stableIdentityEvidence(reconciliation.identity),
      });
      try {
        this.closeNativeHandle(binding.custody, reconciliation.authorityHandle, 'seal-stream');
      } catch {
        state = 'CLEANUP_UNCONFIRMED';
      }
    } catch {
      state = 'CLEANUP_UNCONFIRMED';
    }
    scope.state = state;
    return this.sealTerminalResult(
      scope,
      effectOpDigest,
      state,
      null,
      reconciliationEvidence,
    );
  }

  private sealTerminalResult(
    scope: PublicationScope,
    effectOpDigest: Sha256Digest,
    state: TaskAttemptCustodyAdapterSealResult['state'],
    publication: TaskAttemptCustodyPublication | null,
    evidence: unknown,
  ): TaskAttemptCustodyAdapterSealResult {
    return freezeObject({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-publication-seal' as const,
      state,
      effectOpDigest,
      scopeDigest: scope.scopeDigest,
      generation: scope.generation,
      evidenceDigest: digest('publication-seal', {
        target: scope.target,
        byteLength: scope.byteLength,
        effectOpDigest,
        createEffectOpDigest: scope.createEffectOpDigest,
        scopeDigest: scope.scopeDigest,
        generation: scope.generation,
        state,
        evidence,
      }),
      publication: publication === null ? null : freezeObject(publication),
    });
  }
}

export function createTaskAttemptCustodyPosixAdapter(
  options: TaskAttemptCustodyPosixAdapterOptions = {},
): TaskAttemptCustodyAdapter {
  if (
    options === null
    || typeof options !== 'object'
    || intrinsicReflectApply(intrinsicNodeTypesIsProxy, nodeTypes, [options])
  ) {
    hold('CAPABILITY_UNVERIFIED', 'open-root');
  }
  const record = snapshotExactRecord(options, ['mountConsumer']);
  if (
    record === null
    && intrinsicReflectApply(intrinsicReflectOwnKeys, Reflect, [options]).length !== 0
  ) {
    hold('CAPABILITY_UNVERIFIED', 'open-root');
  }
  const mountConsumer = record === null ? null : record.mountConsumer;
  if (
    mountConsumer !== null
    && mountConsumer !== undefined
    && (
      typeof mountConsumer !== 'function'
      || intrinsicReflectApply(intrinsicNodeTypesIsProxy, nodeTypes, [mountConsumer])
    )
  ) {
    hold('CAPABILITY_UNVERIFIED', 'open-root');
  }
  return new PosixTaskAttemptCustodyAdapter(
    mountConsumer as TaskAttemptCustodyPosixMountConsumer | undefined ?? null,
  );
}
