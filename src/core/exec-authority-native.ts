import { Buffer as NodeBuffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import process from 'node:process';
import { types as nodeTypes } from 'node:util';

const EXPECTED_ABI_NAME = 'deckent.exec-authority';
const EXPECTED_ABI_VERSION = '1.0.0';
const EXPECTED_HANDLE_ABI = 'deckent.exec-authority.opaque-generation.v1';
const EXPECTED_EFFECT_ABI_NAME = 'deckent.execution-effect';
const EXPECTED_EFFECT_ABI_VERSION = '2.1.0';
const EXPECTED_EFFECT_HANDLE_ABI = 'deckent.execution-effect.opaque-generation.v2';
const EXPECTED_EFFECT_TRUST_DOMAIN = 'execution-effect-linux-v1';
const EXPECTED_NAPI_VERSION = 8;
const EXPECTED_PACKAGE_NAME = '@deckent/exec-authority-native';
const NATIVE_LOADER_MODULE = '../../native/exec-authority/index.mjs';
const MINIMUM_NODE_MAJOR = 24;
const EXPECTED_EXPORT_SET = Object.freeze([
  'capabilityManifest',
  'closeFd',
  'custodyCloseHandle',
  'custodyInvoke',
  'effectCloseHandle',
  'effectInvoke',
  'fdPath',
  'fstatIdentity',
  'hostBootIdentity',
  'mountIdentity',
  'openDirAt',
  'readdirFd',
  'renameAt',
  'unlinkAt',
]);

const nativeLoaderRequire = createRequire(import.meta.url);
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectIsFrozen = Object.isFrozen;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const numberParseInt = Number.parseInt;
const numberToString = Number.prototype.toString;
const stringIncludes = String.prototype.includes;
const stringSlice = String.prototype.slice;
const bufferByteLength = NodeBuffer.byteLength;
const setHas = Set.prototype.has;
const weakMapGet = WeakMap.prototype.get;
const weakMapHas = WeakMap.prototype.has;
const weakMapSet = WeakMap.prototype.set;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const isProxyObject = nodeTypes.isProxy;
const TrustedArrayBuffer = ArrayBuffer;
const TrustedError = Error;
const TrustedUint8Array = Uint8Array;
const TrustedWeakMap = WeakMap;
const trustedObjectPrototype = Object.prototype;
const trustedArrayBufferPrototype = TrustedArrayBuffer.prototype;
const trustedUint8ArrayPrototype = TrustedUint8Array.prototype;
const trustedBufferPrototype = NodeBuffer.prototype;
const trustedTypedArrayPrototype = objectGetPrototypeOf(trustedUint8ArrayPrototype) as object;
const typedArrayBufferGetter = objectGetOwnPropertyDescriptor(
  trustedTypedArrayPrototype,
  'buffer',
)?.get;
const typedArrayByteOffsetGetter = objectGetOwnPropertyDescriptor(
  trustedTypedArrayPrototype,
  'byteOffset',
)?.get;
const typedArrayByteLengthGetter = objectGetOwnPropertyDescriptor(
  trustedTypedArrayPrototype,
  'byteLength',
)?.get;
const typedArraySet = objectGetOwnPropertyDescriptor(trustedTypedArrayPrototype, 'set')?.value;
const arrayBufferByteLengthGetter = objectGetOwnPropertyDescriptor(
  trustedArrayBufferPrototype,
  'byteLength',
)?.get;
const arrayBufferSlice = objectGetOwnPropertyDescriptor(
  trustedArrayBufferPrototype,
  'slice',
)?.value;

function listSome<TValue>(
  values: readonly TValue[],
  predicate: (value: TValue, index: number) => boolean,
): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (predicate(values[index] as TValue, index)) return true;
  }
  return false;
}

function listEvery<TValue>(
  values: readonly TValue[],
  predicate: (value: TValue, index: number) => boolean,
): boolean {
  return !listSome(values, (value, index) => !predicate(value, index));
}

function listIncludes<TValue>(values: readonly TValue[], expected: TValue): boolean {
  return listSome(values, value => value === expected);
}

function stringContains(value: string, expected: string): boolean {
  return reflectApply(stringIncludes, value, [expected]) as boolean;
}

function utf8ByteLength(value: string): number {
  return reflectApply(bufferByteLength, NodeBuffer, [value, 'utf8']) as number;
}

function setContains<TValue>(values: ReadonlySet<TValue>, expected: TValue): boolean {
  return reflectApply(setHas, values, [expected]) as boolean;
}

declare const custodyHandleBrand: unique symbol;
declare const custodyResultBrand: unique symbol;
declare const effectHandleBrand: unique symbol;
declare const featureEvidenceBrand: unique symbol;

export type ExecAuthorityNativePlatform = 'linux' | 'darwin' | 'win32' | 'unsupported';
export type ExecAuthorityNativeArch = 'x64' | 'arm64' | 'ia32' | 'arm' | 'unknown';
export type ExecAuthorityNativeFeature =
  | 'custody-posix-v1'
  | 'custody-win32-v1'
  | 'execution-effect-linux-v1'
  | 'legacy-posix-fd-v1';

export type ExecAuthorityNativeFeatureEvidenceBits = number & {
  readonly [featureEvidenceBrand]: true;
};

export type ExecAuthorityNativeErrorCode =
  | 'E_EXEC_AUTH_NATIVE_STATE'
  | 'E_EXEC_AUTH_NATIVE_BACKEND_ABI'
  | 'E_EXEC_AUTH_NATIVE_INIT'
  | 'E_EXEC_AUTH_NATIVE_ARGUMENT'
  | 'E_EXEC_AUTH_NATIVE_OPERATION'
  | 'E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_LIMIT'
  | 'E_EXEC_AUTH_NATIVE_ALLOCATION'
  | 'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_CREATE'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_FORGED'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_STALE'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_KIND'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_RIGHTS'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_STATE'
  | 'E_EXEC_AUTH_NATIVE_HANDLE_BORROWED'
  | 'E_EXEC_AUTH_NATIVE_BORROW_CONTRACT'
  | 'E_EXEC_AUTH_NATIVE_BORROW_LIMIT'
  | 'E_EXEC_AUTH_NATIVE_BORROW_STALE'
  | 'E_EXEC_AUTH_NATIVE_LEGACY_TOKEN_LIMIT'
  | 'E_EXEC_AUTH_NATIVE_LEGACY_TOKEN_EXHAUSTED'
  | 'E_EXEC_AUTH_NATIVE_NOT_FOUND'
  | 'E_EXEC_AUTH_NATIVE_ALREADY_EXISTS'
  | 'E_EXEC_AUTH_NATIVE_INVALID_COMPONENT'
  | 'E_EXEC_AUTH_NATIVE_REPARSE_REJECTED'
  | 'E_EXEC_AUTH_NATIVE_PRIVACY_UNCONFIRMED'
  | 'E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH'
  | 'E_EXEC_AUTH_NATIVE_LINK_COUNT_UNSAFE'
  | 'E_EXEC_AUTH_NATIVE_SIZE_LIMIT'
  | 'E_EXEC_AUTH_NATIVE_IDENTITY_CHANGED'
  | 'E_EXEC_AUTH_NATIVE_VOLUME_UNSUPPORTED'
  | 'E_EXEC_AUTH_NATIVE_REMOTE_VOLUME_UNSUPPORTED'
  | 'E_EXEC_AUTH_NATIVE_NAMESPACE_CONFLICT'
  | 'E_EXEC_AUTH_NATIVE_DURABILITY_UNCONFIRMED'
  | 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED'
  | 'E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED'
  | 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED'
  | 'E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED'
  | 'E_EXEC_AUTH_NATIVE_ROOT_OVERLAP'
  | 'E_EXEC_AUTH_NATIVE_ROOT_SEPARATION_UNCONFIRMED'
  | 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_BOUNDS'
  | 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_DEADLINE'
  | 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_MUTATED'
  | 'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_ENTRY_INVALID'
  | 'E_EXEC_AUTH_EFFECT_CANCELLED'
  | 'E_EXEC_AUTH_EFFECT_DEADLINE'
  | 'E_EXEC_AUTH_EFFECT_BOUNDS'
  | 'E_EXEC_AUTH_EFFECT_CAS_MISMATCH'
  | 'E_EXEC_AUTH_EFFECT_DURABILITY'
  | 'E_EXEC_AUTH_EFFECT_RECONCILE_AMBIGUOUS'
  | 'E_EXEC_AUTH_EFFECT_ENVELOPE'
  | 'ENOENT'
  | 'ENOTDIR'
  | 'EISDIR'
  | 'ELOOP'
  | 'EACCES'
  | 'EPERM'
  | 'EEXIST'
  | 'ENOTEMPTY'
  | 'EBADF'
  | 'EINVAL'
  | 'EXDEV'
  | 'EUNKNOWN';

export type ExecAuthorityNativeReasonCode =
  | 'PLATFORM_UNSUPPORTED'
  | 'MOUNT_UNSUPPORTED'
  | 'PUBLISH_PRIMITIVE_UNAVAILABLE'
  | 'NAMESPACE_CONFLICT'
  | 'EXISTING_DIFFERENT'
  | 'FILE_DURABILITY_UNCONFIRMED'
  | 'DIRECTORY_DURABILITY_UNCONFIRMED'
  | 'FINAL_IDENTITY_UNCONFIRMED'
  | 'CLEANUP_UNCONFIRMED'
  | 'IO_UNCONFIRMED';

export type ExecAuthorityNativeOpenDisposition =
  | 'OPEN_EXISTING'
  | 'CREATE_NEW'
  | 'OPEN_OR_CREATE';

export type ExecAuthorityNativePrivacyPolicy = 'OWNER_PRIVATE';

export type ExecAuthorityNativeObjectType = 'DIRECTORY' | 'REGULAR_FILE' | 'OTHER';

export type ExecAuthorityNativeVolumeCapability =
  | 'ANONYMOUS_TEMPFILE'
  | 'DIRECTORY_DURABILITY'
  | 'HARD_LINKS'
  | 'NO_REPLACE_PUBLISH'
  | 'PERSISTENT_ACL'
  | 'REMOTE'
  | 'REPARSE_POINTS'
  | 'STABLE_OBJECT_ID';

export type ExecAuthorityNativeCustodyHandle = object & {
  readonly [custodyHandleBrand]: true;
};

export type ExecAuthorityNativeEffectHandle = object & {
  readonly [effectHandleBrand]: true;
};

export type ExecAuthorityNativeEffectRootKind = 'PROJECT' | 'WORKSPACE' | 'STAGING';
export type ExecAuthorityNativeEffectEntryKind = 'DIRECTORY' | 'REGULAR_FILE';

export interface ExecAuthorityNativeEffectContract {
  readonly schemaVersion: 1;
  readonly abiName: typeof EXPECTED_EFFECT_ABI_NAME;
  readonly abiVersion: typeof EXPECTED_EFFECT_ABI_VERSION;
  readonly handleAbi: typeof EXPECTED_EFFECT_HANDLE_ABI;
  readonly trustDomain: typeof EXPECTED_EFFECT_TRUST_DOMAIN;
  readonly available: boolean;
  readonly operations: readonly [
    'append-stage',
    'apply-operation',
    'begin-source-read',
    'begin-stage',
    'capture-tree',
    'finish-source-read',
    'inspect-entry',
    'next-source-chunk',
    'open-root',
    'reconcile-operation',
    'seal-stage',
    'verify-postimages',
  ];
}

export interface ExecAuthorityNativeEffectLimits {
  readonly deadlineUnixMs: number;
  readonly maxDepth: number;
  readonly maxEntries: number;
  readonly maxFileBytes: number;
  readonly maxManifestBytes: number;
  readonly maxNameBytes: number;
  readonly maxPathBytes: number;
  readonly maxTotalBytes: number;
}

export interface ExecAuthorityNativeEffectEntry {
  readonly schemaVersion: 1;
  readonly path: string;
  readonly kind: ExecAuthorityNativeEffectEntryKind;
  readonly mode: string;
  readonly size: string | null;
  readonly objectIdentityDigest: string;
  readonly contentDigest: string | null;
}

export interface ExecAuthorityNativeEffectRoot {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-root';
  readonly state: 'OPENED';
  readonly rootKind: ExecAuthorityNativeEffectRootKind;
  readonly identityDigest: string;
  readonly handle: ExecAuthorityNativeEffectHandle;
}

export interface ExecAuthorityNativeEffectManifest {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-manifest';
  readonly state: 'CAPTURED';
  readonly entries: readonly ExecAuthorityNativeEffectEntry[];
  readonly entryCount: number;
  readonly totalBytes: number;
  readonly manifestDigest: string;
}

export interface ExecAuthorityNativeEffectInspection {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-inspection';
  readonly state: 'PRESENT';
  readonly entry: ExecAuthorityNativeEffectEntry;
}

export interface ExecAuthorityNativeEffectSourceReadAuthority {
  readonly deadlineUnixMs: number;
  readonly expectedContentDigest: string;
  readonly expectedMode: number;
  readonly expectedSize: number;
  readonly maxChunkBytes: number;
  readonly path: string;
}

export interface ExecAuthorityNativeEffectSourceOpen {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-source-read';
  readonly state: 'OPEN';
  readonly contentDigest: string;
  readonly deadlineUnixMs: number;
  readonly handle: ExecAuthorityNativeEffectHandle;
  readonly maxChunkBytes: number;
  readonly mode: string;
  readonly path: string;
  readonly sourceObjectIdentityDigest: string;
  readonly totalBytes: number;
}

export interface ExecAuthorityNativeEffectSourceChunk {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-source-chunk';
  readonly state: 'CHUNK';
  readonly byteLength: number;
  readonly byteOffset: number;
  readonly bytes: Uint8Array;
  readonly contentDigest: string;
  readonly index: number;
  readonly observedBytes: number;
}

export interface ExecAuthorityNativeEffectSourceVerified {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-source-read';
  readonly state: 'VERIFIED';
  readonly chunkCount: number;
  readonly contentDigest: string;
  readonly observedBytes: number;
  readonly sourceObjectIdentityDigest: string;
}

export interface ExecAuthorityNativeEffectStageOpen {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-stage';
  readonly state: 'OPEN';
  readonly handle: ExecAuthorityNativeEffectHandle;
  readonly totalBytes: number;
  readonly contentDigest: string;
  readonly nativeStagingObjectIdentityDigest: string;
}

export interface ExecAuthorityNativeEffectStageAppend {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-stage-append';
  readonly state: 'APPENDED';
  readonly observedBytes: number;
}

export interface ExecAuthorityNativeEffectStageSealed {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-stage';
  readonly state: 'SEALED';
  readonly contentDigest: string;
  readonly nativeStagingObjectIdentityDigest: string;
}

export interface ExecAuthorityNativeEffectMutation {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-mutation';
  readonly state: 'APPLIED' | 'NOT_APPLIED';
  readonly operationDigest: string;
  readonly durabilityEvidenceDigest: string;
  readonly postimageDigest: string | 'ABSENT' | null;
}

export interface ExecAuthorityNativeEffectFinalVerification {
  readonly schemaVersion: 1;
  readonly kind: 'execution-effect-final-verification';
  readonly state: 'VERIFIED';
  readonly planDigest: string;
  readonly postimageSetDigest: string;
  readonly verifiedCount: number;
}

export interface ExecAuthorityNativeEffectFacade {
  openRoot(rootKind: ExecAuthorityNativeEffectRootKind, path: string): ExecAuthorityNativeEffectRoot;
  captureTree(
    root: ExecAuthorityNativeEffectHandle,
    limits: ExecAuthorityNativeEffectLimits,
    cancelState?: 'ACTIVE' | 'CANCELLED',
  ): ExecAuthorityNativeEffectManifest;
  inspectEntry(
    root: ExecAuthorityNativeEffectHandle,
    path: string,
  ): ExecAuthorityNativeEffectInspection;
  beginSourceRead(
    workspaceRoot: ExecAuthorityNativeEffectHandle,
    authority: ExecAuthorityNativeEffectSourceReadAuthority,
  ): ExecAuthorityNativeEffectSourceOpen;
  nextSourceChunk(
    sourceRead: ExecAuthorityNativeEffectHandle,
    cancelState?: 'ACTIVE' | 'CANCELLED',
  ): ExecAuthorityNativeEffectSourceChunk;
  finishSourceRead(
    sourceRead: ExecAuthorityNativeEffectHandle,
  ): ExecAuthorityNativeEffectSourceVerified;
  beginStage(
    stagingRoot: ExecAuthorityNativeEffectHandle,
    totalBytes: number,
    contentDigest: string,
  ): ExecAuthorityNativeEffectStageOpen;
  appendStage(
    stagedContent: ExecAuthorityNativeEffectHandle,
    bytes: Uint8Array,
  ): ExecAuthorityNativeEffectStageAppend;
  sealStage(stagedContent: ExecAuthorityNativeEffectHandle): ExecAuthorityNativeEffectStageSealed;
  applyOperation(
    projectRoot: ExecAuthorityNativeEffectHandle,
    operationEnvelope: Uint8Array,
    stagedContent?: ExecAuthorityNativeEffectHandle | null,
  ): ExecAuthorityNativeEffectMutation;
  reconcileOperation(
    projectRoot: ExecAuthorityNativeEffectHandle,
    operationEnvelope: Uint8Array,
    stagedContent?: ExecAuthorityNativeEffectHandle | null,
  ): ExecAuthorityNativeEffectMutation;
  verifyPostimages(
    projectRoot: ExecAuthorityNativeEffectHandle,
    planEnvelope: Uint8Array,
  ): ExecAuthorityNativeEffectFinalVerification;
  closeHandle(handle: ExecAuthorityNativeEffectHandle): void;
}

export interface ExecAuthorityNativeEffectUnsupported {
  readonly available: false;
  readonly reason: 'platform-unsupported';
}

interface ExecAuthorityNativeCustodyResultBrand {
  readonly [custodyResultBrand]: true;
}

export interface ExecAuthorityNativeManifest {
  readonly schemaVersion: 1;
  readonly abiName: typeof EXPECTED_ABI_NAME;
  readonly abiVersion: typeof EXPECTED_ABI_VERSION;
  readonly napiVersion: typeof EXPECTED_NAPI_VERSION;
  readonly packageName: typeof EXPECTED_PACKAGE_NAME;
  readonly packageVersion: string;
  readonly platform: ExecAuthorityNativePlatform;
  readonly arch: ExecAuthorityNativeArch;
  readonly handleAbi: typeof EXPECTED_HANDLE_ABI;
  readonly buildType: 'Release';
  readonly effectContract: ExecAuthorityNativeEffectContract;
  readonly features: readonly ExecAuthorityNativeFeature[];
  readonly exportSet: readonly string[];
}

export interface ExecAuthorityNativeIdentity extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-identity';
  readonly platform: ExecAuthorityNativePlatform;
  readonly objectType: ExecAuthorityNativeObjectType;
  readonly size: string;
  readonly linkCount: string;
  readonly mntId: string | null;
  readonly dev: string | null;
  readonly ino: string | null;
  readonly fsMagic: string | null;
  readonly mode: string | null;
  readonly ownerUid: string | null;
  readonly volumeId: string | null;
  readonly fileId: string | null;
  readonly reparseTag: string | null;
  readonly ownerSid: string | null;
  readonly daclPresent: boolean | null;
  readonly daclProtected: boolean | null;
  readonly daclEntryCount: string | null;
  readonly daclOwnerAllowMask: string | null;
  readonly daclCanonicalHash: string | null;
  readonly volumeRemote: boolean | null;
  readonly volumeCapabilities: readonly ExecAuthorityNativeVolumeCapability[];
  readonly featureEvidenceBits: ExecAuthorityNativeFeatureEvidenceBits;
}

export interface ExecAuthorityNativeOpen extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-open';
  readonly state: 'OPENED' | 'CREATED';
  readonly handle: ExecAuthorityNativeCustodyHandle;
  readonly identity: ExecAuthorityNativeIdentity;
}

export interface ExecAuthorityNativeProbe extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-probe';
  readonly available: boolean;
  readonly platform: ExecAuthorityNativePlatform;
  readonly featureEvidenceBits: ExecAuthorityNativeFeatureEvidenceBits;
  readonly identity: ExecAuthorityNativeIdentity | null;
}

export interface ExecAuthorityNativeRootSeparation
  extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-root-separation';
  readonly state: 'CONFIRMED';
  readonly custodyIdentity: ExecAuthorityNativeIdentity;
  readonly projectIdentity: ExecAuthorityNativeIdentity;
  readonly featureEvidenceBits: ExecAuthorityNativeFeatureEvidenceBits;
}

export interface ExecAuthorityNativeAppend extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-append';
  readonly state: 'APPENDED';
  readonly byteLength: number;
}

export interface ExecAuthorityNativeRead extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-read';
  readonly bytes: Uint8Array;
  readonly before: ExecAuthorityNativeIdentity;
  readonly after: ExecAuthorityNativeIdentity;
  readonly eof: boolean;
  readonly requestedMaxBytes: number;
  readonly observedBytes: number;
}

export interface ExecAuthorityNativeDirectoryScan
  extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-directory-scan';
  readonly state: 'SCANNED';
  readonly before: ExecAuthorityNativeIdentity;
  readonly after: ExecAuthorityNativeIdentity;
  readonly names: readonly string[];
  readonly entryCount: number;
  readonly requestedMaxEntries: number;
  readonly requestedMaxNameBytes: number;
  readonly deadlineUnixMs: number;
  readonly mutationEvidence: 'DIRECTORY_IDENTITY_STABLE';
}

export interface ExecAuthorityNativeEvidence extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-evidence';
  readonly operation: 'APPLY_PRIVATE' | 'SYNC';
  readonly state: 'CONFIRMED';
  readonly featureEvidenceBits: ExecAuthorityNativeFeatureEvidenceBits;
}

export interface ExecAuthorityNativePublication extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-publication';
  readonly state: 'CREATED' | 'EXISTING_IDENTICAL' | 'PUBLISHED_UNCONFIRMED';
  readonly readHandle: ExecAuthorityNativeCustodyHandle | null;
  readonly identity: ExecAuthorityNativeIdentity | null;
  readonly featureEvidenceBits: ExecAuthorityNativeFeatureEvidenceBits;
  readonly reasonCode: ExecAuthorityNativeReasonCode | null;
}

export interface ExecAuthorityNativeCleanup extends ExecAuthorityNativeCustodyResultBrand {
  readonly schemaVersion: 1;
  readonly kind: 'custody-cleanup';
  readonly state: 'CLEANUP_CONFIRMED' | 'CLEANUP_UNCONFIRMED';
  readonly reasonCode: ExecAuthorityNativeReasonCode | null;
}

export interface ExecAuthorityNativeSealReconciliation {
  readonly schemaVersion: 1;
  readonly kind: 'custody-seal-reconciliation';
  readonly outcome: 'PUBLISHED_UNCONFIRMED' | 'CLEANUP_UNCONFIRMED';
  readonly publicationState: 'PUBLISHED_UNCONFIRMED' | 'CONSUMED';
  readonly sourceGeneration: number;
  readonly authorityKind: 'PUBLICATION' | 'READ_FILE';
  readonly authorityHandle: ExecAuthorityNativeCustodyHandle;
  readonly identity: ExecAuthorityNativeIdentity;
}

export interface ExecAuthorityNativeOpenRootInput {
  readonly path: string;
  readonly disposition: ExecAuthorityNativeOpenDisposition;
  readonly privacyPolicy: ExecAuthorityNativePrivacyPolicy;
}

export interface ExecAuthorityNativeOpenDirectoryAtInput {
  readonly parent: ExecAuthorityNativeCustodyHandle;
  readonly name: string;
  readonly disposition: ExecAuthorityNativeOpenDisposition;
  readonly privacyPolicy: ExecAuthorityNativePrivacyPolicy;
}

export interface ExecAuthorityNativeOpenFileAtInput {
  readonly parent: ExecAuthorityNativeCustodyHandle;
  readonly name: string;
  readonly disposition: 'OPEN_EXISTING';
  readonly privacyPolicy: ExecAuthorityNativePrivacyPolicy;
}

export interface ExecAuthorityNativeHandleInput {
  readonly handle: ExecAuthorityNativeCustodyHandle;
}

export interface ExecAuthorityNativeBeginPublicationInput {
  readonly parent: ExecAuthorityNativeCustodyHandle;
  readonly name: string;
  readonly maxBytes: number;
}

export interface ExecAuthorityNativeAppendPublicationInput {
  readonly publication: ExecAuthorityNativeCustodyHandle;
  readonly bytes: Uint8Array;
}

export interface ExecAuthorityNativePublicationInput {
  readonly publication: ExecAuthorityNativeCustodyHandle;
}

export interface ExecAuthorityNativeReadBoundedInput {
  readonly file: ExecAuthorityNativeCustodyHandle;
  readonly maxBytes: number;
}

export interface ExecAuthorityNativeScanDirectoryInput {
  readonly directory: ExecAuthorityNativeCustodyHandle;
  readonly maxEntries: number;
  readonly maxNameBytes: number;
  readonly deadlineUnixMs: number;
}

export interface ExecAuthorityNativeProveRootSeparationInput {
  readonly custodyRoot: ExecAuthorityNativeCustodyHandle;
  readonly canonicalProjectRoot: string;
}

export interface ExecAuthorityNativeCustodyInputByOperation {
  readonly probe: ExecAuthorityNativeHandleInput;
  readonly 'open-root': ExecAuthorityNativeOpenRootInput;
  readonly 'open-directory-at': ExecAuthorityNativeOpenDirectoryAtInput;
  readonly 'open-file-at': ExecAuthorityNativeOpenFileAtInput;
  readonly 'begin-publication': ExecAuthorityNativeBeginPublicationInput;
  readonly 'append-publication': ExecAuthorityNativeAppendPublicationInput;
  readonly 'seal-publication': ExecAuthorityNativePublicationInput;
  readonly 'abort-publication': ExecAuthorityNativePublicationInput;
  readonly 'read-bounded': ExecAuthorityNativeReadBoundedInput;
  readonly 'scan-directory-bounded': ExecAuthorityNativeScanDirectoryInput;
  readonly identity: ExecAuthorityNativeHandleInput;
  readonly 'apply-private': ExecAuthorityNativeHandleInput;
  readonly sync: ExecAuthorityNativeHandleInput;
  readonly 'prove-root-separation': ExecAuthorityNativeProveRootSeparationInput;
}

export interface ExecAuthorityNativeCustodyResultByOperation {
  readonly probe: ExecAuthorityNativeProbe;
  readonly 'open-root': ExecAuthorityNativeOpen;
  readonly 'open-directory-at': ExecAuthorityNativeOpen;
  readonly 'open-file-at': ExecAuthorityNativeOpen;
  readonly 'begin-publication': ExecAuthorityNativeCustodyHandle;
  readonly 'append-publication': ExecAuthorityNativeAppend;
  readonly 'seal-publication': ExecAuthorityNativePublication;
  readonly 'abort-publication': ExecAuthorityNativeCleanup;
  readonly 'read-bounded': ExecAuthorityNativeRead;
  readonly 'scan-directory-bounded': ExecAuthorityNativeDirectoryScan;
  readonly identity: ExecAuthorityNativeIdentity;
  readonly 'apply-private': ExecAuthorityNativeEvidence;
  readonly sync: ExecAuthorityNativeEvidence;
  readonly 'prove-root-separation': ExecAuthorityNativeRootSeparation;
}

export type ExecAuthorityNativeCustodyOperation =
  keyof ExecAuthorityNativeCustodyResultByOperation;

export type ExecAuthorityNativeCustodyResult =
  ExecAuthorityNativeCustodyResultByOperation[ExecAuthorityNativeCustodyOperation];

export interface ExecAuthorityNativeCustodyFacade {
  invoke<TOperation extends ExecAuthorityNativeCustodyOperation>(
    operation: TOperation,
    input: ExecAuthorityNativeCustodyInputByOperation[TOperation],
  ): ExecAuthorityNativeCustodyResultByOperation[TOperation];
  consumeSealReconciliation(
    publication: ExecAuthorityNativeCustodyHandle,
  ): ExecAuthorityNativeSealReconciliation;
  closeHandle(handle: ExecAuthorityNativeCustodyHandle): void;
}

export interface ExecAuthorityNativeLegacyIdentity {
  readonly dev: string;
  readonly ino: string;
  readonly isDirectory: boolean;
}

export interface ExecAuthorityNativeLegacyMountIdentity {
  readonly available: boolean;
  readonly fsid?: string;
}

export interface ExecAuthorityNativeLegacyHostBootIdentity {
  readonly available: boolean;
  readonly hostUuid?: string;
  readonly bootTime?: string;
}

export interface ExecAuthorityNativeLegacyFacade {
  openDirAt(parentToken: number | null, name: string): number;
  closeFd(token: number): void;
  fstatIdentity(token: number): ExecAuthorityNativeLegacyIdentity;
  readdirFd(token: number): string[];
  unlinkAt(token: number, name: string, removeDir: boolean): void;
  renameAt(fromToken: number, fromName: string, toToken: number, toName: string): void;
  mountIdentity(token: number): ExecAuthorityNativeLegacyMountIdentity;
  fdPath(token: number): string;
  hostBootIdentity(): ExecAuthorityNativeLegacyHostBootIdentity;
}

export type ExecAuthorityNativeUnavailableReason =
  | 'binding-artifact-digest-mismatch'
  | 'binding-artifact-invalid'
  | 'binding-contract-mismatch'
  | 'binding-debug-not-authorized'
  | 'binding-layout-ambiguous'
  | 'binding-load-failed'
  | 'binding-load-snapshot-unverified'
  | 'binding-not-built'
  | 'binding-package-metadata-invalid'
  | 'binding-runtime-napi-unsupported'
  | 'loader-contract-mismatch'
  | 'loader-module-unavailable'
  | 'node-runtime-unsupported';

export interface ExecAuthorityNativeUnavailable {
  readonly available: false;
  readonly reason: ExecAuthorityNativeUnavailableReason;
}

export interface ExecAuthorityNativeAvailable {
  readonly available: true;
  readonly manifest: ExecAuthorityNativeManifest;
  readonly legacy: ExecAuthorityNativeLegacyFacade;
  readonly binding: ExecAuthorityNativeLegacyFacade;
  readonly custody: ExecAuthorityNativeCustodyFacade;
  readonly effect: ExecAuthorityNativeEffectFacade | ExecAuthorityNativeEffectUnsupported;
}

export type ExecAuthorityNativeState =
  | ExecAuthorityNativeAvailable
  | ExecAuthorityNativeUnavailable;

interface RawLoaderModule {
  readonly loadExecAuthorityNative: () => unknown;
}

interface RawLegacyFacade {
  readonly openDirAt: (...args: unknown[]) => unknown;
  readonly closeFd: (...args: unknown[]) => unknown;
  readonly fstatIdentity: (...args: unknown[]) => unknown;
  readonly readdirFd: (...args: unknown[]) => unknown;
  readonly unlinkAt: (...args: unknown[]) => unknown;
  readonly renameAt: (...args: unknown[]) => unknown;
  readonly mountIdentity: (...args: unknown[]) => unknown;
  readonly fdPath: (...args: unknown[]) => unknown;
  readonly hostBootIdentity: (...args: unknown[]) => unknown;
}

interface RawCustodyFacade {
  readonly abortPublication: (publication: unknown) => unknown;
  readonly appendPublication: (publication: unknown, bytes: unknown) => unknown;
  readonly applyPrivate: (handle: unknown) => unknown;
  readonly beginPublication: (parent: unknown, name: unknown, maxBytes: unknown) => unknown;
  readonly closeHandle: (...args: unknown[]) => unknown;
  readonly identity: (handle: unknown) => unknown;
  readonly openDirectoryAt: (
    parent: unknown,
    name: unknown,
    disposition: unknown,
    privacyPolicy: unknown,
  ) => unknown;
  readonly openFileAt: (
    parent: unknown,
    name: unknown,
    disposition: unknown,
    privacyPolicy: unknown,
  ) => unknown;
  readonly openRoot: (
    path: unknown,
    disposition: unknown,
    privacyPolicy: unknown,
  ) => unknown;
  readonly probe: (handle: unknown) => unknown;
  readonly proveRootSeparation: (custodyRoot: unknown, canonicalProjectRoot: unknown) => unknown;
  readonly readBounded: (file: unknown, maxBytes: unknown) => unknown;
  readonly scanDirectoryBounded: (
    directory: unknown,
    maxEntries: unknown,
    maxNameBytes: unknown,
    deadlineUnixMs: unknown,
  ) => unknown;
  readonly sealPublication: (publication: unknown) => unknown;
  readonly sync: (handle: unknown) => unknown;
}

interface RawCustodyTransport {
  readonly accepted: boolean;
  readonly value: unknown;
}

interface RawEffectFacade {
  readonly appendStage: (stagedContent: unknown, bytes: unknown) => unknown;
  readonly applyOperation: (
    projectRoot: unknown,
    operationEnvelope: unknown,
    stagedContent?: unknown,
  ) => unknown;
  readonly beginSourceRead: (workspaceRoot: unknown, authority: unknown) => unknown;
  readonly beginStage: (
    stagingRoot: unknown,
    totalBytes: unknown,
    contentDigest: unknown,
  ) => unknown;
  readonly captureTree: (root: unknown, limits: unknown, cancelState?: unknown) => unknown;
  readonly closeHandle: (handle: unknown) => unknown;
  readonly finishSourceRead: (sourceRead: unknown) => unknown;
  readonly inspectEntry: (root: unknown, path: unknown) => unknown;
  readonly nextSourceChunk: (sourceRead: unknown, cancelState?: unknown) => unknown;
  readonly openRoot: (rootKind: unknown, path: unknown) => unknown;
  readonly reconcileOperation: (
    projectRoot: unknown,
    operationEnvelope: unknown,
    stagedContent?: unknown,
  ) => unknown;
  readonly sealStage: (stagedContent: unknown) => unknown;
  readonly verifyPostimages: (projectRoot: unknown, planEnvelope: unknown) => unknown;
}

type RegisteredHandleKind =
  | 'ROOT_DIRECTORY'
  | 'DIRECTORY'
  | 'READ_FILE'
  | 'PUBLICATION';

type RegisteredHandleState =
  | 'OPEN'
  | 'APPEND_FAILED'
  | 'PUBLISHED_UNCONFIRMED'
  | 'CLEANUP_UNCONFIRMED'
  | 'CONSUMED';

interface RetainedSealAuthority {
  readonly outcome: 'PUBLISHED_UNCONFIRMED' | 'CLEANUP_UNCONFIRMED';
  readonly sourceGeneration: number;
  readonly replacementHandle: ExecAuthorityNativeCustodyHandle | null;
  readonly replacementIdentity: ExecAuthorityNativeIdentity | null;
}

interface RegisteredHandleRecord {
  readonly owner: object;
  readonly kind: RegisteredHandleKind;
  readonly rights: number;
  readonly state: RegisteredHandleState;
  readonly logicalGeneration: number;
  readonly provenance: Readonly<{
    readonly operation: ExecAuthorityNativeCustodyOperation | 'seal-reconciliation';
    readonly parentGeneration: number | null;
  }>;
  readonly identity: ExecAuthorityNativeIdentity;
  readonly retainedSealAuthority: RetainedSealAuthority | null;
}

interface HandleRegistry {
  readonly owner: object;
  readonly records: WeakMap<object, RegisteredHandleRecord>;
  nextLogicalGeneration: number;
}

const LOADER_UNAVAILABLE_REASONS = new Set<ExecAuthorityNativeUnavailableReason>([
  'binding-artifact-digest-mismatch',
  'binding-artifact-invalid',
  'binding-contract-mismatch',
  'binding-debug-not-authorized',
  'binding-layout-ambiguous',
  'binding-load-failed',
  'binding-load-snapshot-unverified',
  'binding-not-built',
  'binding-package-metadata-invalid',
  'binding-runtime-napi-unsupported',
]);

const MANIFEST_KEYS = Object.freeze([
  'abiName',
  'abiVersion',
  'arch',
  'buildType',
  'effectContract',
  'exportSet',
  'features',
  'handleAbi',
  'napiVersion',
  'packageName',
  'packageVersion',
  'platform',
  'schemaVersion',
]);

const LEGACY_KEYS = Object.freeze([
  'closeFd',
  'fdPath',
  'fstatIdentity',
  'hostBootIdentity',
  'mountIdentity',
  'openDirAt',
  'readdirFd',
  'renameAt',
  'unlinkAt',
]);

const CUSTODY_KEYS = Object.freeze([
  'abortPublication',
  'appendPublication',
  'applyPrivate',
  'beginPublication',
  'closeHandle',
  'identity',
  'openDirectoryAt',
  'openFileAt',
  'openRoot',
  'probe',
  'proveRootSeparation',
  'readBounded',
  'scanDirectoryBounded',
  'sealPublication',
  'sync',
]);
const EFFECT_KEYS = Object.freeze([
  'appendStage',
  'applyOperation',
  'beginSourceRead',
  'beginStage',
  'captureTree',
  'closeHandle',
  'finishSourceRead',
  'inspectEntry',
  'nextSourceChunk',
  'openRoot',
  'reconcileOperation',
  'sealStage',
  'verifyPostimages',
]);
const EFFECT_UNSUPPORTED_KEYS = Object.freeze(['available', 'reason']);
const EFFECT_ROOT_KEYS = Object.freeze([
  'handle', 'identityDigest', 'kind', 'rootKind', 'schemaVersion', 'state',
]);
const EFFECT_MANIFEST_KEYS = Object.freeze([
  'entries', 'entryCount', 'kind', 'manifestDigest', 'schemaVersion', 'state', 'totalBytes',
]);
const EFFECT_ENTRY_KEYS = Object.freeze([
  'contentDigest', 'kind', 'mode', 'objectIdentityDigest', 'path', 'schemaVersion', 'size',
]);
const EFFECT_INSPECTION_KEYS = Object.freeze(['entry', 'kind', 'schemaVersion', 'state']);
const EFFECT_STAGE_OPEN_KEYS = Object.freeze([
  'contentDigest', 'handle', 'kind', 'nativeStagingObjectIdentityDigest',
  'schemaVersion', 'state', 'totalBytes',
]);
const EFFECT_STAGE_APPEND_KEYS = Object.freeze([
  'kind', 'observedBytes', 'schemaVersion', 'state',
]);
const EFFECT_STAGE_SEALED_KEYS = Object.freeze([
  'contentDigest', 'kind', 'nativeStagingObjectIdentityDigest', 'schemaVersion', 'state',
]);
const EFFECT_MUTATION_KEYS = Object.freeze([
  'durabilityEvidenceDigest', 'kind', 'operationDigest', 'postimageDigest',
  'schemaVersion', 'state',
]);
const EFFECT_FINAL_VERIFY_KEYS = Object.freeze([
  'kind', 'planDigest', 'postimageSetDigest', 'schemaVersion', 'state', 'verifiedCount',
]);
const EFFECT_SOURCE_OPEN_KEYS = Object.freeze([
  'contentDigest', 'deadlineUnixMs', 'handle', 'kind', 'maxChunkBytes', 'mode',
  'path', 'schemaVersion', 'sourceObjectIdentityDigest', 'state', 'totalBytes',
]);
const EFFECT_SOURCE_CHUNK_KEYS = Object.freeze([
  'byteLength', 'byteOffset', 'bytes', 'contentDigest', 'index', 'kind',
  'observedBytes', 'schemaVersion', 'state',
]);
const EFFECT_SOURCE_FINISH_KEYS = Object.freeze([
  'chunkCount', 'contentDigest', 'kind', 'observedBytes', 'schemaVersion',
  'sourceObjectIdentityDigest', 'state',
]);
const EFFECT_CONTRACT_KEYS = Object.freeze([
  'abiName',
  'abiVersion',
  'available',
  'handleAbi',
  'operations',
  'schemaVersion',
  'trustDomain',
]);
const EXPECTED_EFFECT_OPERATIONS = Object.freeze([
  'append-stage',
  'apply-operation',
  'begin-source-read',
  'begin-stage',
  'capture-tree',
  'finish-source-read',
  'inspect-entry',
  'next-source-chunk',
  'open-root',
  'reconcile-operation',
  'seal-stage',
  'verify-postimages',
] as const);
const CUSTODY_TRANSPORT_KEYS = Object.freeze(['accepted', 'value']);
const AVAILABLE_KEYS = Object.freeze([
  'available', 'binding', 'custody', 'effect', 'legacy', 'manifest',
]);
const UNAVAILABLE_KEYS = Object.freeze(['available', 'reason']);
const ALLOWED_FEATURES = new Set<ExecAuthorityNativeFeature>([
  'custody-posix-v1',
  'custody-win32-v1',
  'execution-effect-linux-v1',
  'legacy-posix-fd-v1',
]);
const LINUX_FEATURES = Object.freeze<readonly ExecAuthorityNativeFeature[]>([
  'custody-posix-v1',
  'execution-effect-linux-v1',
  'legacy-posix-fd-v1',
]);
const DARWIN_FEATURES = Object.freeze<readonly ExecAuthorityNativeFeature[]>([
  'custody-posix-v1',
  'legacy-posix-fd-v1',
]);
const WIN32_FEATURES = Object.freeze<readonly ExecAuthorityNativeFeature[]>([
  'custody-win32-v1',
]);

const CUSTODY_REASON_CODES = new Set<ExecAuthorityNativeReasonCode>([
  'CLEANUP_UNCONFIRMED',
  'DIRECTORY_DURABILITY_UNCONFIRMED',
  'EXISTING_DIFFERENT',
  'FILE_DURABILITY_UNCONFIRMED',
  'FINAL_IDENTITY_UNCONFIRMED',
  'IO_UNCONFIRMED',
  'MOUNT_UNSUPPORTED',
  'NAMESPACE_CONFLICT',
  'PLATFORM_UNSUPPORTED',
  'PUBLISH_PRIMITIVE_UNAVAILABLE',
]);

const ADMITTED_NATIVE_ERROR_CODES = new Set<ExecAuthorityNativeErrorCode>([
  'E_EXEC_AUTH_NATIVE_STATE',
  'E_EXEC_AUTH_NATIVE_BACKEND_ABI',
  'E_EXEC_AUTH_NATIVE_INIT',
  'E_EXEC_AUTH_NATIVE_ARGUMENT',
  'E_EXEC_AUTH_NATIVE_OPERATION',
  'E_EXEC_AUTH_NATIVE_FEATURE_UNAVAILABLE',
  'E_EXEC_AUTH_NATIVE_HANDLE_LIMIT',
  'E_EXEC_AUTH_NATIVE_ALLOCATION',
  'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED',
  'E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT',
  'E_EXEC_AUTH_NATIVE_HANDLE_CREATE',
  'E_EXEC_AUTH_NATIVE_HANDLE_FORGED',
  'E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN',
  'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED',
  'E_EXEC_AUTH_NATIVE_HANDLE_STALE',
  'E_EXEC_AUTH_NATIVE_HANDLE_KIND',
  'E_EXEC_AUTH_NATIVE_HANDLE_RIGHTS',
  'E_EXEC_AUTH_NATIVE_HANDLE_STATE',
  'E_EXEC_AUTH_NATIVE_HANDLE_BORROWED',
  'E_EXEC_AUTH_NATIVE_BORROW_CONTRACT',
  'E_EXEC_AUTH_NATIVE_BORROW_LIMIT',
  'E_EXEC_AUTH_NATIVE_BORROW_STALE',
  'E_EXEC_AUTH_NATIVE_LEGACY_TOKEN_LIMIT',
  'E_EXEC_AUTH_NATIVE_LEGACY_TOKEN_EXHAUSTED',
  'E_EXEC_AUTH_NATIVE_NOT_FOUND',
  'E_EXEC_AUTH_NATIVE_ALREADY_EXISTS',
  'E_EXEC_AUTH_NATIVE_INVALID_COMPONENT',
  'E_EXEC_AUTH_NATIVE_REPARSE_REJECTED',
  'E_EXEC_AUTH_NATIVE_PRIVACY_UNCONFIRMED',
  'E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH',
  'E_EXEC_AUTH_NATIVE_LINK_COUNT_UNSAFE',
  'E_EXEC_AUTH_NATIVE_SIZE_LIMIT',
  'E_EXEC_AUTH_NATIVE_IDENTITY_CHANGED',
  'E_EXEC_AUTH_NATIVE_VOLUME_UNSUPPORTED',
  'E_EXEC_AUTH_NATIVE_REMOTE_VOLUME_UNSUPPORTED',
  'E_EXEC_AUTH_NATIVE_NAMESPACE_CONFLICT',
  'E_EXEC_AUTH_NATIVE_DURABILITY_UNCONFIRMED',
  'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED',
  'E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED',
  'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED',
  'E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED',
  'E_EXEC_AUTH_NATIVE_ROOT_OVERLAP',
  'E_EXEC_AUTH_NATIVE_ROOT_SEPARATION_UNCONFIRMED',
  'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_BOUNDS',
  'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_DEADLINE',
  'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_MUTATED',
  'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_ENTRY_INVALID',
  'E_EXEC_AUTH_EFFECT_CANCELLED',
  'E_EXEC_AUTH_EFFECT_DEADLINE',
  'E_EXEC_AUTH_EFFECT_BOUNDS',
  'E_EXEC_AUTH_EFFECT_CAS_MISMATCH',
  'E_EXEC_AUTH_EFFECT_DURABILITY',
  'E_EXEC_AUTH_EFFECT_RECONCILE_AMBIGUOUS',
  'E_EXEC_AUTH_EFFECT_ENVELOPE',
  'ENOENT',
  'ENOTDIR',
  'EISDIR',
  'ELOOP',
  'EACCES',
  'EPERM',
  'EEXIST',
  'ENOTEMPTY',
  'EBADF',
  'EINVAL',
  'EXDEV',
  'EUNKNOWN',
]);

const GENERIC_NATIVE_UNCERTAINTY_CODES = new Set<ExecAuthorityNativeErrorCode>([
  'E_EXEC_AUTH_NATIVE_BACKEND_ABI',
  'E_EXEC_AUTH_NATIVE_OPERATION',
  'EUNKNOWN',
]);

const VOLUME_CAPABILITIES = new Set<ExecAuthorityNativeVolumeCapability>([
  'ANONYMOUS_TEMPFILE',
  'DIRECTORY_DURABILITY',
  'HARD_LINKS',
  'NO_REPLACE_PUBLISH',
  'PERSISTENT_ACL',
  'REMOTE',
  'REPARSE_POINTS',
  'STABLE_OBJECT_ID',
]);

const IDENTITY_KEYS = Object.freeze([
  'daclCanonicalHash',
  'daclEntryCount',
  'daclOwnerAllowMask',
  'daclPresent',
  'daclProtected',
  'dev',
  'featureEvidenceBits',
  'fileId',
  'fsMagic',
  'ino',
  'kind',
  'linkCount',
  'mntId',
  'mode',
  'objectType',
  'ownerSid',
  'ownerUid',
  'platform',
  'reparseTag',
  'schemaVersion',
  'size',
  'volumeCapabilities',
  'volumeId',
  'volumeRemote',
]);

const OPEN_RESULT_KEYS = Object.freeze(['handle', 'identity', 'kind', 'schemaVersion', 'state']);
const PROBE_RESULT_KEYS = Object.freeze([
  'available',
  'featureEvidenceBits',
  'identity',
  'kind',
  'platform',
  'schemaVersion',
]);
const ROOT_SEPARATION_RESULT_KEYS = Object.freeze([
  'custodyIdentity',
  'featureEvidenceBits',
  'kind',
  'projectIdentity',
  'schemaVersion',
  'state',
]);
const APPEND_RESULT_KEYS = Object.freeze(['byteLength', 'kind', 'schemaVersion', 'state']);
const READ_RESULT_KEYS = Object.freeze([
  'after',
  'before',
  'bytes',
  'eof',
  'kind',
  'observedBytes',
  'requestedMaxBytes',
  'schemaVersion',
]);
const DIRECTORY_SCAN_RESULT_KEYS = Object.freeze([
  'after',
  'before',
  'deadlineUnixMs',
  'entryCount',
  'kind',
  'mutationEvidence',
  'names',
  'requestedMaxEntries',
  'requestedMaxNameBytes',
  'schemaVersion',
  'state',
]);
const EVIDENCE_RESULT_KEYS = Object.freeze([
  'featureEvidenceBits',
  'kind',
  'operation',
  'schemaVersion',
  'state',
]);
const PUBLICATION_RESULT_KEYS = Object.freeze([
  'featureEvidenceBits',
  'identity',
  'kind',
  'readHandle',
  'reasonCode',
  'schemaVersion',
  'state',
]);
const CLEANUP_RESULT_KEYS = Object.freeze(['kind', 'reasonCode', 'schemaVersion', 'state']);
const EVIDENCE_COMPONENT_NOFOLLOW = 1 << 0;
const EVIDENCE_OWNER_PRIVATE = 1 << 1;
const EVIDENCE_ANONYMOUS_TEMPFILE = 1 << 2;
const EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH = 1 << 3;
const EVIDENCE_FILE_DURABILITY = 1 << 4;
const EVIDENCE_DIRECTORY_DURABILITY = 1 << 5;
const EVIDENCE_BOUNDED_READ = 1 << 7;
const EVIDENCE_PUBLISH_AT_EMPTY_PATH = 1 << 8;
const EVIDENCE_PUBLISH_PROC_FD_ALIAS = 1 << 9;
const EVIDENCE_OBJECT_TYPE = 1 << 10;
const EVIDENCE_LINK_COUNT = 1 << 11;
const EVIDENCE_SIZE = 1 << 12;
const EVIDENCE_OWNER_IDENTITY = 1 << 13;
const EVIDENCE_DACL_PRESENT = 1 << 14;
const EVIDENCE_DACL_PROTECTED = 1 << 15;
const EVIDENCE_DACL_EXACT_OWNER_ONLY = 1 << 16;
const EVIDENCE_LOCAL_VOLUME = 1 << 17;
const EVIDENCE_ROOT_SEPARATION = 1 << 18;
const KNOWN_FEATURE_EVIDENCE_MASK = 0x0007_ffff;
const POSIX_ONLY_EVIDENCE_MASK = EVIDENCE_ANONYMOUS_TEMPFILE
  | EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH
  | EVIDENCE_PUBLISH_AT_EMPTY_PATH
  | EVIDENCE_PUBLISH_PROC_FD_ALIAS;
const WIN32_ONLY_EVIDENCE_MASK = EVIDENCE_DACL_PRESENT
  | EVIDENCE_DACL_PROTECTED
  | EVIDENCE_DACL_EXACT_OWNER_ONLY;
const HANDLE_RIGHT_TRAVERSE = 1 << 0;
const HANDLE_RIGHT_READ = 1 << 1;
const HANDLE_RIGHT_APPEND = 1 << 2;
const HANDLE_RIGHT_IDENTITY = 1 << 3;
const HANDLE_RIGHT_APPLY_PRIVATE = 1 << 4;
const HANDLE_RIGHT_SYNC = 1 << 5;
const HANDLE_RIGHT_PUBLISH = 1 << 6;
const HANDLE_RIGHT_ABORT = 1 << 7;
const DIRECTORY_HANDLE_RIGHTS = HANDLE_RIGHT_TRAVERSE
  | HANDLE_RIGHT_IDENTITY
  | HANDLE_RIGHT_APPLY_PRIVATE
  | HANDLE_RIGHT_SYNC
  | HANDLE_RIGHT_PUBLISH;
const READ_FILE_HANDLE_RIGHTS = HANDLE_RIGHT_READ | HANDLE_RIGHT_IDENTITY;
const PUBLICATION_HANDLE_RIGHTS = HANDLE_RIGHT_APPEND
  | HANDLE_RIGHT_IDENTITY
  | HANDLE_RIGHT_APPLY_PRIVATE
  | HANDLE_RIGHT_SYNC
  | HANDLE_RIGHT_PUBLISH
  | HANDLE_RIGHT_ABORT;
const UINT32_MAX = 4_294_967_295n;
const UINT64_MAX = 18_446_744_073_709_551_615n;

let memoizedState: ExecAuthorityNativeState | null = null;

function unavailable(reason: ExecAuthorityNativeUnavailableReason): ExecAuthorityNativeUnavailable {
  return objectFreeze({ available: false as const, reason });
}

function ownData(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined;
  }
  if (isProxyObject(value)) return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !objectHasOwn(descriptor, 'value')) return undefined;
  return descriptor.value;
}

function hasExactFrozenDataShape(value: unknown, expectedKeys: readonly string[]): value is object {
  if (value === null
    || typeof value !== 'object'
    || arrayIsArray(value)
    || isProxyObject(value)
    || !objectIsFrozen(value)) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== trustedObjectPrototype && prototype !== null) return false;
  const keys = reflectOwnKeys(value);
  if (listSome(keys, key => typeof key !== 'string')
    || keys.length !== expectedKeys.length) {
    return false;
  }
  return listEvery(expectedKeys, key => {
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    return descriptor !== undefined
      && objectHasOwn(descriptor, 'value')
      && descriptor.enumerable === true
      && descriptor.configurable === false
      && descriptor.writable === false;
  });
}

function frozenSortedStringArray<TValue extends string>(
  value: unknown,
  allowed: ReadonlySet<TValue> | null,
): readonly TValue[] | null {
  if (!arrayIsArray(value) || isProxyObject(value) || !objectIsFrozen(value)) return null;
  const lengthDescriptor = objectGetOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined
    || !objectHasOwn(lengthDescriptor, 'value')
    || !numberIsSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.writable !== false
    || lengthDescriptor.configurable !== false) {
    return null;
  }
  const length = lengthDescriptor.value as number;
  const keys = reflectOwnKeys(value);
  if (listSome(keys, key => typeof key !== 'string') || keys.length !== length + 1) return null;
  const entries: TValue[] = [];
  let previous: string | null = null;
  for (let index = 0; index < length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined
      || !objectHasOwn(descriptor, 'value')
      || descriptor.enumerable !== true
      || descriptor.writable !== false
      || descriptor.configurable !== false) {
      return null;
    }
    const entry = descriptor.value;
    if (typeof entry !== 'string'
      || (previous !== null && entry <= previous)
      || (allowed !== null && !setContains(allowed, entry as TValue))) {
      return null;
    }
    entries.push(entry as TValue);
    previous = entry;
  }
  return objectFreeze(entries);
}

function expectedPlatform(): ExecAuthorityNativePlatform {
  if (process.platform === 'linux'
    || process.platform === 'darwin'
    || process.platform === 'win32') {
    return process.platform;
  }
  return 'unsupported';
}

function expectedArch(): ExecAuthorityNativeArch {
  if (process.arch === 'x64'
    || process.arch === 'arm64'
    || process.arch === 'ia32'
    || process.arch === 'arm') {
    return process.arch;
  }
  return 'unknown';
}

function expectedFeatures(
  platform: ExecAuthorityNativePlatform = expectedPlatform(),
): readonly ExecAuthorityNativeFeature[] | null {
  if (platform === 'linux') return LINUX_FEATURES;
  if (platform === 'darwin') return DARWIN_FEATURES;
  if (platform === 'win32') return WIN32_FEATURES;
  return null;
}

function validateManifest(value: unknown): ExecAuthorityNativeManifest | null {
  if (!hasExactFrozenDataShape(value, MANIFEST_KEYS)) return null;
  const features = ownData(value, 'features');
  const exportSet = ownData(value, 'exportSet');
  const effectContract = ownData(value, 'effectContract');
  const validatedFeatures = frozenSortedStringArray(features, ALLOWED_FEATURES);
  const validatedExportSet = frozenSortedStringArray<string>(exportSet, null);
  const validatedEffectOperations = hasExactFrozenDataShape(
    effectContract,
    EFFECT_CONTRACT_KEYS,
  )
    ? frozenSortedStringArray<string>(ownData(effectContract, 'operations'), null)
    : null;
  const packageVersion = ownData(value, 'packageVersion');
  const platform = expectedPlatform();
  const platformFeatures = expectedFeatures(platform);
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'abiName') !== EXPECTED_ABI_NAME
    || ownData(value, 'abiVersion') !== EXPECTED_ABI_VERSION
    || ownData(value, 'napiVersion') !== EXPECTED_NAPI_VERSION
    || ownData(value, 'packageName') !== EXPECTED_PACKAGE_NAME
    || typeof packageVersion !== 'string'
    || packageVersion.length === 0
    || ownData(value, 'platform') !== platform
    || ownData(value, 'arch') !== expectedArch()
    || ownData(value, 'handleAbi') !== EXPECTED_HANDLE_ABI
    || ownData(value, 'buildType') !== 'Release'
    || validatedEffectOperations === null
    || validatedEffectOperations.length !== EXPECTED_EFFECT_OPERATIONS.length
    || listSome(
      validatedEffectOperations,
      (entry, index) => entry !== EXPECTED_EFFECT_OPERATIONS[index],
    )
    || ownData(effectContract, 'schemaVersion') !== 1
    || ownData(effectContract, 'abiName') !== EXPECTED_EFFECT_ABI_NAME
    || ownData(effectContract, 'abiVersion') !== EXPECTED_EFFECT_ABI_VERSION
    || ownData(effectContract, 'handleAbi') !== EXPECTED_EFFECT_HANDLE_ABI
    || ownData(effectContract, 'trustDomain') !== EXPECTED_EFFECT_TRUST_DOMAIN
    || ownData(effectContract, 'available') !== (platform === 'linux')
    || validatedFeatures === null
    || platformFeatures === null
    || validatedFeatures.length !== platformFeatures.length
    || listSome(validatedFeatures, (entry, index) => entry !== platformFeatures[index])
    || validatedExportSet === null
    || validatedExportSet.length !== EXPECTED_EXPORT_SET.length
    || listSome(validatedExportSet, (entry, index) => entry !== EXPECTED_EXPORT_SET[index])) {
    return null;
  }
  return value as unknown as ExecAuthorityNativeManifest;
}

function validateFunctions<T extends object>(
  value: unknown,
  keys: readonly string[],
): T | null {
  if (!hasExactFrozenDataShape(value, keys)) return null;
  if (listSome(keys, key => typeof ownData(value, key) !== 'function')) return null;
  return value as T;
}

function nativeBoundaryError(code: ExecAuthorityNativeErrorCode): Error {
  const error = new TrustedError('Execution authority native contract validation failed');
  objectDefineProperty(error, 'name', {
    value: 'ExecAuthorityNativeError',
    configurable: false,
    enumerable: false,
    writable: false,
  });
  objectDefineProperty(error, 'code', {
    value: code,
    configurable: false,
    enumerable: true,
    writable: false,
  });
  return error;
}

function admittedNativeErrorCode(error: unknown): ExecAuthorityNativeErrorCode | null {
  const code = ownData(error, 'code');
  return typeof code === 'string'
    && setContains(ADMITTED_NATIVE_ERROR_CODES, code as ExecAuthorityNativeErrorCode)
    ? code as ExecAuthorityNativeErrorCode
    : null;
}

function snapshotExactInput(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (value === null
    || typeof value !== 'object'
    || arrayIsArray(value)
    || isProxyObject(value)) {
    return null;
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== trustedObjectPrototype && prototype !== null) return null;
  const keys = reflectOwnKeys(value);
  if (listSome(keys, key => typeof key !== 'string')
    || keys.length !== expectedKeys.length) {
    return null;
  }
  const snapshot = objectCreate(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (descriptor === undefined
      || !objectHasOwn(descriptor, 'value')
      || descriptor.enumerable !== true) {
      return null;
    }
    snapshot[key] = descriptor.value;
  }
  return objectFreeze(snapshot);
}

function trustedTypedArrayNumber(getter: unknown, value: object): number | null {
  if (typeof getter !== 'function') return null;
  try {
    const observed = reflectApply(getter, value, []) as unknown;
    return numberIsSafeInteger(observed) && (observed as number) >= 0
      ? observed as number
      : null;
  } catch {
    return null;
  }
}

/**
 * Produce the sole byte authority admitted across the JS/native boundary.
 * Captured TypedArray intrinsics read internal slots directly, so input-owned
 * buffer/offset/length accessors, iteration hooks and symbol properties are
 * never consulted. The native backend receives only the private clone.
 */
function snapshotExactBytes(value: unknown): Uint8Array | null {
  if (value === null || typeof value !== 'object' || isProxyObject(value)) return null;
  try {
    const prototype = objectGetPrototypeOf(value);
    if (prototype !== trustedUint8ArrayPrototype && prototype !== trustedBufferPrototype) {
      return null;
    }
    if (typeof typedArrayBufferGetter !== 'function'
      || typeof typedArraySet !== 'function'
      || typeof arrayBufferByteLengthGetter !== 'function'
      || typeof arrayBufferSlice !== 'function') {
      return null;
    }
    const backing = reflectApply(typedArrayBufferGetter, value, []) as unknown;
    if (backing === null
      || typeof backing !== 'object'
      || objectGetPrototypeOf(backing) !== trustedArrayBufferPrototype) {
      // This rejects SharedArrayBuffer and cross-realm/forged backing stores.
      return null;
    }
    // ArrayBuffer#slice performs a non-observing detached-buffer check even
    // for a legitimate zero-length view; a detached buffer throws here.
    reflectApply(arrayBufferSlice, backing, [0, 0]);
    const backingLength = trustedTypedArrayNumber(arrayBufferByteLengthGetter, backing);
    const byteOffset = trustedTypedArrayNumber(typedArrayByteOffsetGetter, value);
    const byteLength = trustedTypedArrayNumber(typedArrayByteLengthGetter, value);
    if (backingLength === null
      || byteOffset === null
      || byteLength === null
      || byteOffset > backingLength
      || byteLength > backingLength - byteOffset) {
      return null;
    }
    const cloned = new TrustedUint8Array(byteLength);
    reflectApply(typedArraySet, cloned, [value, 0]);
    return objectGetPrototypeOf(cloned) === trustedUint8ArrayPrototype
      && trustedTypedArrayNumber(typedArrayByteLengthGetter, cloned) === byteLength
      ? cloned
      : null;
  } catch {
    return null;
  }
}

function hasOpaqueHandleShape(value: unknown): value is object {
  if (value === null
    || typeof value !== 'object'
    || arrayIsArray(value)
    || isProxyObject(value)
    || !objectIsFrozen(value)) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  return (prototype === trustedObjectPrototype || prototype === null)
    && reflectOwnKeys(value).length === 0;
}

function isFeatureEvidenceBits(value: unknown): value is ExecAuthorityNativeFeatureEvidenceBits {
  return numberIsSafeInteger(value)
    && (value as number) >= 0
    && ((value as number) & KNOWN_FEATURE_EVIDENCE_MASK) === value;
}

function isPlatformCompatibleFeatureEvidence(
  value: unknown,
  platform: ExecAuthorityNativePlatform = expectedPlatform(),
): value is ExecAuthorityNativeFeatureEvidenceBits {
  if (!isFeatureEvidenceBits(value)) return false;
  if (platform === 'win32') return (value & POSIX_ONLY_EVIDENCE_MASK) === 0;
  if (platform === 'linux' || platform === 'darwin') {
    return (value & WIN32_ONLY_EVIDENCE_MASK) === 0;
  }
  return value === 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return numberIsSafeInteger(value) && (value as number) >= 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return numberIsSafeInteger(value) && (value as number) > 0;
}

function isCanonicalDecimal(
  value: unknown,
  maximum: bigint = UINT64_MAX,
): value is string {
  if (typeof value !== 'string') return false;
  const maximumString = maximum.toString();
  return value.length <= maximumString.length
    && /^(?:0|[1-9][0-9]*)$/u.test(value)
    && BigInt(value) <= maximum;
}

function isCanonicalFsMagic(value: unknown): value is string {
  return typeof value === 'string'
    && /^0x(?:0|[1-9a-f][0-9a-f]{0,15})$/u.test(value);
}

function isCanonicalWin32Hex32(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-f]{8}$/u.test(value);
}

function isCanonicalWin32VolumeId(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-f]{16}$/u.test(value);
}

function isCanonicalWin32FileId(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-f]{32}$/u.test(value);
}

function isCanonicalOwnerSid(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 184) return false;
  const components = value.split('-');
  const authority = components[2];
  if (components.length < 4
    || components.length > 18
    || components[0] !== 'S'
    || components[1] !== '1'
    || authority === undefined
    || !isCanonicalBoundedDecimal(authority, 281_474_976_710_655n)) {
    return false;
  }
  for (let index = 3; index < components.length; index += 1) {
    if (!isCanonicalBoundedDecimal(components[index] as string, UINT32_MAX)) return false;
  }
  return true;
}

function isCanonicalBoundedDecimal(value: string, maximum: bigint): boolean {
  return isCanonicalDecimal(value, maximum);
}

function isStableIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 4096
    && !stringContains(value, '\0');
}

function isIngressPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 32767
    && !stringContains(value, '\0')
    && isAbsolute(value);
}

function isEffectDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isEffectRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_048_576
    || value[0] === '/' || value[value.length - 1] === '/'
    || stringContains(value, '\0') || stringContains(value, '\\')
    || utf8ByteLength(value) > 1_048_576) return false;
  if (value === '.') return true;
  let componentStart = 0;
  let componentCount = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index !== value.length && value[index] !== '/') continue;
    const component = reflectApply(stringSlice, value, [componentStart, index]) as string;
    componentCount += 1;
    if (componentCount > 1024 || component.length === 0
      || component === '.' || component === '..'
      || utf8ByteLength(component) > 4096) return false;
    componentStart = index + 1;
  }
  return true;
}

function validateEffectEntry(value: unknown): ExecAuthorityNativeEffectEntry | null {
  if (!hasExactFrozenDataShape(value, EFFECT_ENTRY_KEYS)
    || ownData(value, 'schemaVersion') !== 1
    || !isEffectRelativePath(ownData(value, 'path'))
    || !isEffectDigest(ownData(value, 'objectIdentityDigest'))
    || typeof ownData(value, 'mode') !== 'string'
    || !/^[0-7]{4}$/u.test(ownData(value, 'mode') as string)) return null;
  const kind = ownData(value, 'kind');
  if (kind === 'DIRECTORY') {
    return ownData(value, 'size') === null && ownData(value, 'contentDigest') === null
      ? value as unknown as ExecAuthorityNativeEffectEntry : null;
  }
  return kind === 'REGULAR_FILE'
    && isCanonicalDecimal(ownData(value, 'size'))
    && isEffectDigest(ownData(value, 'contentDigest'))
    ? value as unknown as ExecAuthorityNativeEffectEntry : null;
}

function validateEffectEntryArray(
  value: unknown,
  count: number,
): readonly ExecAuthorityNativeEffectEntry[] | null {
  if (!arrayIsArray(value) || !objectIsFrozen(value) || value.length !== count
    || count > 100_000) return null;
  let pathBytes = 0;
  for (let index = 0; index < count; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, String(index));
    const entry = descriptor !== undefined
      && objectHasOwn(descriptor, 'value')
      && descriptor.enumerable === true
      && descriptor.configurable === false
      && descriptor.writable === false
      ? validateEffectEntry(descriptor.value) : null;
    if (entry === null) return null;
    pathBytes += utf8ByteLength(entry.path);
    if (pathBytes > 16_777_216) return null;
  }
  return reflectOwnKeys(value).length === count + 1
    ? value as readonly ExecAuthorityNativeEffectEntry[] : null;
}

type EffectResultOperation =
  | 'open-root' | 'capture-tree' | 'inspect-entry' | 'begin-stage'
  | 'append-stage' | 'seal-stage' | 'apply-operation'
  | 'reconcile-operation' | 'verify-postimages' | 'begin-source-read'
  | 'next-source-chunk' | 'finish-source-read';

function validateEffectResult(operation: EffectResultOperation, value: unknown): unknown | null {
  if (operation === 'open-root') {
    return hasExactFrozenDataShape(value, EFFECT_ROOT_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-root'
      && ownData(value, 'state') === 'OPENED'
      && listIncludes(['PROJECT', 'WORKSPACE', 'STAGING'] as const, ownData(value, 'rootKind'))
      && isEffectDigest(ownData(value, 'identityDigest'))
      && hasOpaqueHandleShape(ownData(value, 'handle')) ? value : null;
  }
  if (operation === 'capture-tree') {
    const count = ownData(value, 'entryCount');
    return hasExactFrozenDataShape(value, EFFECT_MANIFEST_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-manifest'
      && ownData(value, 'state') === 'CAPTURED'
      && isSafeNonNegativeInteger(count)
      && isSafeNonNegativeInteger(ownData(value, 'totalBytes'))
      && isEffectDigest(ownData(value, 'manifestDigest'))
      && validateEffectEntryArray(ownData(value, 'entries'), count as number) !== null
      ? value : null;
  }
  if (operation === 'inspect-entry') {
    return hasExactFrozenDataShape(value, EFFECT_INSPECTION_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-inspection'
      && ownData(value, 'state') === 'PRESENT'
      && validateEffectEntry(ownData(value, 'entry')) !== null ? value : null;
  }
  if (operation === 'begin-source-read') {
    return hasExactFrozenDataShape(value, EFFECT_SOURCE_OPEN_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-source-read'
      && ownData(value, 'state') === 'OPEN'
      && isEffectRelativePath(ownData(value, 'path'))
      && typeof ownData(value, 'mode') === 'string'
      && /^[0-7]{4}$/u.test(ownData(value, 'mode') as string)
      && isSafeNonNegativeInteger(ownData(value, 'totalBytes'))
      && isSafePositiveInteger(ownData(value, 'deadlineUnixMs'))
      && isSafePositiveInteger(ownData(value, 'maxChunkBytes'))
      && (ownData(value, 'maxChunkBytes') as number) <= 67_108_864
      && isEffectDigest(ownData(value, 'contentDigest'))
      && isEffectDigest(ownData(value, 'sourceObjectIdentityDigest'))
      && hasOpaqueHandleShape(ownData(value, 'handle')) ? value : null;
  }
  if (operation === 'next-source-chunk') {
    if (!hasExactFrozenDataShape(value, EFFECT_SOURCE_CHUNK_KEYS)
      || ownData(value, 'schemaVersion') !== 1
      || ownData(value, 'kind') !== 'execution-effect-source-chunk'
      || ownData(value, 'state') !== 'CHUNK'
      || !isSafeNonNegativeInteger(ownData(value, 'index'))
      || !isSafeNonNegativeInteger(ownData(value, 'byteOffset'))
      || !isSafeNonNegativeInteger(ownData(value, 'byteLength'))
      || !isSafeNonNegativeInteger(ownData(value, 'observedBytes'))
      || !isEffectDigest(ownData(value, 'contentDigest'))) return null;
    const bytes = snapshotExactBytes(ownData(value, 'bytes'));
    if (bytes === null || bytes.byteLength !== ownData(value, 'byteLength')
      || `sha256:${createHash('sha256').update(bytes).digest('hex')}`
        !== ownData(value, 'contentDigest')) return null;
    return objectFreeze({ ...(value as ExecAuthorityNativeEffectSourceChunk), bytes });
  }
  if (operation === 'finish-source-read') {
    return hasExactFrozenDataShape(value, EFFECT_SOURCE_FINISH_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-source-read'
      && ownData(value, 'state') === 'VERIFIED'
      && isSafePositiveInteger(ownData(value, 'chunkCount'))
      && isSafeNonNegativeInteger(ownData(value, 'observedBytes'))
      && isEffectDigest(ownData(value, 'contentDigest'))
      && isEffectDigest(ownData(value, 'sourceObjectIdentityDigest')) ? value : null;
  }
  if (operation === 'begin-stage') {
    return hasExactFrozenDataShape(value, EFFECT_STAGE_OPEN_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-stage'
      && ownData(value, 'state') === 'OPEN'
      && isSafeNonNegativeInteger(ownData(value, 'totalBytes'))
      && isEffectDigest(ownData(value, 'contentDigest'))
      && isEffectDigest(ownData(value, 'nativeStagingObjectIdentityDigest'))
      && hasOpaqueHandleShape(ownData(value, 'handle')) ? value : null;
  }
  if (operation === 'append-stage') {
    return hasExactFrozenDataShape(value, EFFECT_STAGE_APPEND_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-stage-append'
      && ownData(value, 'state') === 'APPENDED'
      && isSafeNonNegativeInteger(ownData(value, 'observedBytes')) ? value : null;
  }
  if (operation === 'seal-stage') {
    return hasExactFrozenDataShape(value, EFFECT_STAGE_SEALED_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-stage'
      && ownData(value, 'state') === 'SEALED'
      && isEffectDigest(ownData(value, 'contentDigest'))
      && isEffectDigest(ownData(value, 'nativeStagingObjectIdentityDigest')) ? value : null;
  }
  if (operation === 'apply-operation' || operation === 'reconcile-operation') {
    const state = ownData(value, 'state');
    const postimage = ownData(value, 'postimageDigest');
    return hasExactFrozenDataShape(value, EFFECT_MUTATION_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-mutation'
      && (state === 'APPLIED' || (operation === 'reconcile-operation' && state === 'NOT_APPLIED'))
      && isEffectDigest(ownData(value, 'operationDigest'))
      && isEffectDigest(ownData(value, 'durabilityEvidenceDigest'))
      && (postimage === null || postimage === 'ABSENT' || isEffectDigest(postimage)) ? value : null;
  }
  return hasExactFrozenDataShape(value, EFFECT_FINAL_VERIFY_KEYS)
    && ownData(value, 'schemaVersion') === 1
    && ownData(value, 'kind') === 'execution-effect-final-verification'
    && ownData(value, 'state') === 'VERIFIED'
    && isEffectDigest(ownData(value, 'planDigest'))
    && isEffectDigest(ownData(value, 'postimageSetDigest'))
    && isSafePositiveInteger(ownData(value, 'verifiedCount')) ? value : null;
}

function isCanonicalRootSeparationIngressPath(value: unknown): value is string {
  if (!isIngressPath(value)) return false;
  if (expectedPlatform() === 'win32') return true;
  if (value[0] !== '/') return false;
  if (value === '/') return true;
  let componentStart = 1;
  for (let index = 1; index <= value.length; index += 1) {
    if (index !== value.length && value[index] !== '/') continue;
    const length = index - componentStart;
    if (length === 0
      || (length === 1 && value[componentStart] === '.')
      || (length === 2
        && value[componentStart] === '.'
        && value[componentStart + 1] === '.')) {
      return false;
    }
    componentStart = index + 1;
  }
  return true;
}

function isComponent(value: unknown): value is string {
  return isStableIdentifier(value)
    && value !== '.'
    && value !== '..'
    && !stringContains(value, '/')
    && !stringContains(value, '\\');
}

function isOpenDisposition(value: unknown): value is ExecAuthorityNativeOpenDisposition {
  return value === 'OPEN_EXISTING' || value === 'CREATE_NEW' || value === 'OPEN_OR_CREATE';
}

function validateIdentity(value: unknown): ExecAuthorityNativeIdentity | null {
  if (!hasExactFrozenDataShape(value, IDENTITY_KEYS)) return null;
  const platform = ownData(value, 'platform');
  const currentPlatform = expectedPlatform();
  const objectType = ownData(value, 'objectType');
  const capabilities = frozenSortedStringArray(
    ownData(value, 'volumeCapabilities'),
    VOLUME_CAPABILITIES,
  );
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-identity'
    || platform !== currentPlatform
    || (objectType !== 'DIRECTORY' && objectType !== 'REGULAR_FILE' && objectType !== 'OTHER')
    || !isCanonicalDecimal(ownData(value, 'size'))
    || !isCanonicalDecimal(ownData(value, 'linkCount'))
    || !isPlatformCompatibleFeatureEvidence(
      ownData(value, 'featureEvidenceBits'),
      currentPlatform,
    )
    || capabilities === null) {
    return null;
  }

  if (platform === 'linux' || platform === 'darwin') {
    const mntId = ownData(value, 'mntId');
    const fsMagic = ownData(value, 'fsMagic');
    if ((platform === 'linux' && !isCanonicalDecimal(mntId))
      || (platform === 'darwin'
        && (typeof mntId !== 'string'
          || !/^fsid:0x[0-9a-f]{8}:0x[0-9a-f]{8}$/u.test(mntId)))
      || !isCanonicalDecimal(ownData(value, 'dev'))
      || !isCanonicalDecimal(ownData(value, 'ino'))
      || (platform === 'linux' && !isCanonicalFsMagic(fsMagic))
      || (platform === 'darwin' && fsMagic !== null)
      || typeof ownData(value, 'mode') !== 'string'
      || !/^0[0-7]{3}$/u.test(ownData(value, 'mode') as string)
      || !isCanonicalDecimal(ownData(value, 'ownerUid'), UINT32_MAX)
      || ownData(value, 'volumeId') !== null
      || ownData(value, 'fileId') !== null
      || ownData(value, 'reparseTag') !== null
      || ownData(value, 'ownerSid') !== null
      || ownData(value, 'daclPresent') !== null
      || ownData(value, 'daclProtected') !== null
      || ownData(value, 'daclEntryCount') !== null
      || ownData(value, 'daclOwnerAllowMask') !== null
      || ownData(value, 'daclCanonicalHash') !== null
      || ownData(value, 'volumeRemote') !== null) {
      return null;
    }
  } else if (platform === 'win32') {
    if (ownData(value, 'mntId') !== null
      || ownData(value, 'dev') !== null
      || ownData(value, 'ino') !== null
      || ownData(value, 'fsMagic') !== null
      || ownData(value, 'mode') !== null
      || ownData(value, 'ownerUid') !== null
      || !isCanonicalWin32VolumeId(ownData(value, 'volumeId'))
      || !isCanonicalWin32FileId(ownData(value, 'fileId'))
      || !isCanonicalWin32Hex32(ownData(value, 'reparseTag'))
      || !isCanonicalOwnerSid(ownData(value, 'ownerSid'))
      || typeof ownData(value, 'daclPresent') !== 'boolean'
      || typeof ownData(value, 'daclProtected') !== 'boolean'
      || !isCanonicalDecimal(ownData(value, 'daclEntryCount'), UINT32_MAX)
      || !isCanonicalWin32Hex32(ownData(value, 'daclOwnerAllowMask'))
      || typeof ownData(value, 'daclCanonicalHash') !== 'string'
      || !/^sha256:[0-9a-f]{64}$/u.test(ownData(value, 'daclCanonicalHash') as string)
      || typeof ownData(value, 'volumeRemote') !== 'boolean'
      || ((ownData(value, 'volumeRemote') === true) !== listIncludes(capabilities, 'REMOTE'))) {
      return null;
    }
  } else {
    return null;
  }
  return value as unknown as ExecAuthorityNativeIdentity;
}

function hasEvidenceBits(
  value: ExecAuthorityNativeFeatureEvidenceBits,
  required: number,
): boolean {
  return (value & required) === required;
}

function isOwnerPrivateOpenIdentity(
  identity: ExecAuthorityNativeIdentity,
  expectedObjectType: 'DIRECTORY' | 'REGULAR_FILE',
  expectedRegularLinkCount: '0' | '1' = '1',
): boolean {
  let requiredEvidence = EVIDENCE_COMPONENT_NOFOLLOW
    | EVIDENCE_OWNER_PRIVATE
    | EVIDENCE_OBJECT_TYPE
    | EVIDENCE_OWNER_IDENTITY;
  if (expectedObjectType === 'REGULAR_FILE') {
    requiredEvidence |= EVIDENCE_LINK_COUNT | EVIDENCE_SIZE;
  }
  if (identity.platform === 'win32') {
    requiredEvidence |= EVIDENCE_LOCAL_VOLUME
      | EVIDENCE_DACL_PRESENT
      | EVIDENCE_DACL_PROTECTED
      | EVIDENCE_DACL_EXACT_OWNER_ONLY;
  }
  if (identity.objectType !== expectedObjectType
    || !hasEvidenceBits(identity.featureEvidenceBits, requiredEvidence)
    || listIncludes(identity.volumeCapabilities, 'REMOTE')
    || (expectedObjectType === 'REGULAR_FILE'
      && identity.linkCount !== expectedRegularLinkCount)) {
    return false;
  }
  if (identity.platform === 'linux' || identity.platform === 'darwin') {
    return expectedObjectType === 'DIRECTORY'
      ? identity.mode === '0700'
      : identity.mode === '0400' || identity.mode === '0600';
  }
  return identity.platform === 'win32'
    && identity.reparseTag === '0x00000000'
    && identity.daclPresent === true
    && identity.daclProtected === true
    && identity.daclEntryCount === '1'
    && identity.daclOwnerAllowMask === '0x001f01ff'
    && identity.volumeRemote === false;
}

function isOwnerPrivatePublicationIdentity(
  identity: ExecAuthorityNativeIdentity,
): boolean {
  if (identity.linkCount !== '0' && identity.linkCount !== '1') return false;
  if (!isOwnerPrivateOpenIdentity(identity, 'REGULAR_FILE', identity.linkCount)) return false;
  return identity.linkCount === '1'
    || (hasEvidenceBits(identity.featureEvidenceBits, EVIDENCE_ANONYMOUS_TEMPFILE)
      && listIncludes(identity.volumeCapabilities, 'ANONYMOUS_TEMPFILE'));
}

function isOwnerPrivateRegularHandleIdentity(
  identity: ExecAuthorityNativeIdentity,
): boolean {
  return identity.linkCount === '0'
    ? isOwnerPrivatePublicationIdentity(identity)
    : isOwnerPrivateOpenIdentity(identity, 'REGULAR_FILE');
}

function sameIdentity(
  left: ExecAuthorityNativeIdentity,
  right: ExecAuthorityNativeIdentity,
): boolean {
  for (const key of IDENTITY_KEYS) {
    const leftValue = ownData(left, key);
    const rightValue = ownData(right, key);
    if (key === 'volumeCapabilities') {
      const leftCapabilities = leftValue as readonly string[];
      const rightCapabilities = rightValue as readonly string[];
      if (leftCapabilities.length !== rightCapabilities.length
        || listSome(leftCapabilities, (entry, index) => entry !== rightCapabilities[index])) {
        return false;
      }
    } else if (!objectIs(leftValue, rightValue)) {
      return false;
    }
  }
  return true;
}

function sameStableObjectIdentity(
  left: ExecAuthorityNativeIdentity,
  right: ExecAuthorityNativeIdentity,
): boolean {
  for (const key of IDENTITY_KEYS) {
    if (key === 'featureEvidenceBits' || key === 'volumeCapabilities') continue;
    if (!objectIs(ownData(left, key), ownData(right, key))) return false;
  }
  return true;
}

function sameAppendObjectIdentity(
  left: ExecAuthorityNativeIdentity,
  right: ExecAuthorityNativeIdentity,
): boolean {
  for (const key of IDENTITY_KEYS) {
    if (key === 'featureEvidenceBits'
      || key === 'size'
      || key === 'volumeCapabilities') {
      continue;
    }
    if (!objectIs(ownData(left, key), ownData(right, key))) return false;
  }
  return true;
}

function validateRawCustodyTransport(value: unknown): RawCustodyTransport | null {
  if (!hasExactFrozenDataShape(value, CUSTODY_TRANSPORT_KEYS)
    || typeof ownData(value, 'accepted') !== 'boolean') {
    return null;
  }
  return value as RawCustodyTransport;
}

function createHandleRegistry(): HandleRegistry {
  // Native type tags/generations remain authoritative. This registry adds the
  // canonical-core owner, logical issuance and monotonic lifecycle fence that
  // empty frozen JS handle shapes cannot prove by themselves.
  return {
    owner: objectFreeze(objectCreate(null) as object),
    records: new TrustedWeakMap<object, RegisteredHandleRecord>(),
    nextLogicalGeneration: 1,
  };
}

function rightsForHandleKind(kind: RegisteredHandleKind): number {
  if (kind === 'ROOT_DIRECTORY' || kind === 'DIRECTORY') return DIRECTORY_HANDLE_RIGHTS;
  if (kind === 'READ_FILE') return READ_FILE_HANDLE_RIGHTS;
  return PUBLICATION_HANDLE_RIGHTS;
}

function registeredHandleRecord(
  registry: HandleRegistry,
  handle: unknown,
): RegisteredHandleRecord | null {
  if (!hasOpaqueHandleShape(handle)) return null;
  const record = reflectApply(weakMapGet, registry.records, [handle]) as
    | RegisteredHandleRecord
    | undefined;
  return record !== undefined && objectIs(record.owner, registry.owner) ? record : null;
}

function registerHandle(
  registry: HandleRegistry,
  handle: ExecAuthorityNativeCustodyHandle,
  kind: RegisteredHandleKind,
  identity: ExecAuthorityNativeIdentity,
  operation: ExecAuthorityNativeCustodyOperation | 'seal-reconciliation',
  parentGeneration: number | null,
): RegisteredHandleRecord | null {
  if (!hasOpaqueHandleShape(handle)
    || reflectApply(weakMapHas, registry.records, [handle]) === true
    || !numberIsSafeInteger(registry.nextLogicalGeneration)
    || registry.nextLogicalGeneration <= 0) {
    return null;
  }
  const record = objectFreeze<RegisteredHandleRecord>({
    owner: registry.owner,
    kind,
    rights: rightsForHandleKind(kind),
    state: 'OPEN',
    logicalGeneration: registry.nextLogicalGeneration,
    provenance: objectFreeze({ operation, parentGeneration }),
    identity,
    retainedSealAuthority: null,
  });
  registry.nextLogicalGeneration += 1;
  reflectApply(weakMapSet, registry.records, [handle, record]);
  return record;
}

function replaceHandleRecord(
  registry: HandleRegistry,
  handle: ExecAuthorityNativeCustodyHandle,
  previous: RegisteredHandleRecord,
  state: RegisteredHandleState,
  identity: ExecAuthorityNativeIdentity = previous.identity,
  retainedSealAuthority: RetainedSealAuthority | null = previous.retainedSealAuthority,
): RegisteredHandleRecord {
  const monotonic = previous.state === state
    || (previous.state === 'OPEN'
      && (state === 'APPEND_FAILED'
        || state === 'PUBLISHED_UNCONFIRMED'
        || state === 'CLEANUP_UNCONFIRMED'
        || state === 'CONSUMED'))
    || (previous.state === 'APPEND_FAILED'
      && (state === 'CLEANUP_UNCONFIRMED' || state === 'CONSUMED'))
    || (previous.state === 'PUBLISHED_UNCONFIRMED'
      && (state === 'CLEANUP_UNCONFIRMED' || state === 'CONSUMED'));
  if (!monotonic) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
  const replacement = objectFreeze<RegisteredHandleRecord>({
    owner: previous.owner,
    kind: previous.kind,
    rights: previous.rights,
    state,
    logicalGeneration: previous.logicalGeneration,
    provenance: previous.provenance,
    identity,
    retainedSealAuthority,
  });
  reflectApply(weakMapSet, registry.records, [handle, replacement]);
  return replacement;
}

function requireRegisteredHandle(
  registry: HandleRegistry,
  value: unknown,
  kinds: readonly RegisteredHandleKind[],
  requiredRights: number,
  states: readonly RegisteredHandleState[],
): RegisteredHandleRecord {
  if (!hasOpaqueHandleShape(value)) {
    throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FORGED');
  }
  const record = registeredHandleRecord(registry, value);
  if (record === null) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN');
  if (record.state === 'CONSUMED') {
    throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_CLOSED');
  }
  if (!listIncludes(kinds, record.kind)) {
    throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_KIND');
  }
  if ((record.rights & requiredRights) !== requiredRights) {
    throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_RIGHTS');
  }
  if (!listIncludes(states, record.state)) {
    throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
  }
  return record;
}

type HandleInspection =
  | Readonly<{ state: 'LIVE'; identity: ExecAuthorityNativeIdentity }>
  | Readonly<{ state: 'CONSUMED' | 'INVALID'; identity: null }>;

function inspectOpaqueHandle(
  custody: RawCustodyFacade,
  value: unknown,
): HandleInspection {
  if (!hasOpaqueHandleShape(value)) {
    return objectFreeze({ state: 'INVALID' as const, identity: null });
  }
  let identityResult: unknown;
  try {
    const transport = validateRawCustodyTransport(custody.identity(value));
    if (transport === null || transport.accepted !== true) {
      return objectFreeze({ state: 'INVALID' as const, identity: null });
    }
    identityResult = transport.value;
  } catch (error) {
    const code = admittedNativeErrorCode(error);
    if (code === 'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED'
      || code === 'E_EXEC_AUTH_NATIVE_HANDLE_STALE') {
      return objectFreeze({ state: 'CONSUMED' as const, identity: null });
    }
    throw error;
  }
  const identity = validateIdentity(identityResult);
  return identity === null
    ? objectFreeze({ state: 'INVALID' as const, identity: null })
    : objectFreeze({ state: 'LIVE' as const, identity });
}

function validateReturnedHandle(
  custody: RawCustodyFacade,
  value: unknown,
  expectedIdentity: ExecAuthorityNativeIdentity | null,
): Readonly<{
  handle: ExecAuthorityNativeCustodyHandle;
  identity: ExecAuthorityNativeIdentity;
}> | null {
  const inspected = inspectOpaqueHandle(custody, value);
  if (inspected.state !== 'LIVE'
    || (expectedIdentity !== null && !sameIdentity(inspected.identity, expectedIdentity))) {
    return null;
  }
  return objectFreeze({
    handle: value as unknown as ExecAuthorityNativeCustodyHandle,
    identity: inspected.identity,
  });
}

function validateOpenResult(
  custody: RawCustodyFacade,
  value: unknown,
  disposition: ExecAuthorityNativeOpenDisposition,
  expectedObjectType: 'DIRECTORY' | 'REGULAR_FILE',
): ExecAuthorityNativeOpen | null {
  if (!hasExactFrozenDataShape(value, OPEN_RESULT_KEYS)) return null;
  const state = ownData(value, 'state');
  const handle = ownData(value, 'handle');
  const identity = validateIdentity(ownData(value, 'identity'));
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-open'
    || (state !== 'OPENED' && state !== 'CREATED')
    || (disposition === 'OPEN_EXISTING' && state !== 'OPENED')
    || (disposition === 'CREATE_NEW' && state !== 'CREATED')
    || identity === null
    || !isOwnerPrivateOpenIdentity(identity, expectedObjectType)) {
    return null;
  }
  const validatedHandle = validateReturnedHandle(custody, handle, identity);
  if (validatedHandle === null) return null;
  return value as unknown as ExecAuthorityNativeOpen;
}

function validateProbeResult(
  custody: RawCustodyFacade,
  value: unknown,
  inputHandle: ExecAuthorityNativeCustodyHandle,
  preIdentity: ExecAuthorityNativeIdentity,
): ExecAuthorityNativeProbe | null {
  if (!hasExactFrozenDataShape(value, PROBE_RESULT_KEYS)) return null;
  const available = ownData(value, 'available');
  const identityValue = ownData(value, 'identity');
  const identity = identityValue === null ? null : validateIdentity(identityValue);
  const featureEvidenceBits = ownData(value, 'featureEvidenceBits');
  const input = inspectOpaqueHandle(custody, inputHandle);
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-probe'
    || typeof available !== 'boolean'
    || ownData(value, 'platform') !== expectedPlatform()
    || !isPlatformCompatibleFeatureEvidence(
      featureEvidenceBits,
      ownData(value, 'platform') as ExecAuthorityNativePlatform,
    )
    || identity === null
    || input.state !== 'LIVE'
    || !sameStableObjectIdentity(preIdentity, identity)
    || !sameStableObjectIdentity(input.identity, identity)
    || identity.objectType !== 'DIRECTORY'
    || !isOwnerPrivateOpenIdentity(identity, 'DIRECTORY')
    || featureEvidenceBits !== identity.featureEvidenceBits) {
    return null;
  }
  if (available) {
    const platform = identity.platform;
    const minimumConfirmed = platform === 'win32'
      ? hasEvidenceBits(
        identity.featureEvidenceBits,
        EVIDENCE_LOCAL_VOLUME
          | EVIDENCE_DACL_PRESENT
          | EVIDENCE_DACL_PROTECTED
          | EVIDENCE_DACL_EXACT_OWNER_ONLY,
      )
        && listIncludes(identity.volumeCapabilities, 'NO_REPLACE_PUBLISH')
        && listIncludes(identity.volumeCapabilities, 'PERSISTENT_ACL')
        && listIncludes(identity.volumeCapabilities, 'STABLE_OBJECT_ID')
      : (platform === 'linux' || platform === 'darwin')
        && hasEvidenceBits(identity.featureEvidenceBits, EVIDENCE_ANONYMOUS_TEMPFILE)
        && listIncludes(identity.volumeCapabilities, 'ANONYMOUS_TEMPFILE')
        && listIncludes(identity.volumeCapabilities, 'STABLE_OBJECT_ID');
    if (!minimumConfirmed) return null;
  }
  return value as unknown as ExecAuthorityNativeProbe;
}

function validateAppendResult(
  value: unknown,
  expectedByteLength: number,
): ExecAuthorityNativeAppend | null {
  if (!hasExactFrozenDataShape(value, APPEND_RESULT_KEYS)
    || ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-append'
    || ownData(value, 'state') !== 'APPENDED'
    || !isSafeNonNegativeInteger(ownData(value, 'byteLength'))
    || ownData(value, 'byteLength') !== expectedByteLength) {
    return null;
  }
  return value as unknown as ExecAuthorityNativeAppend;
}

function validateReadResult(
  custody: RawCustodyFacade,
  value: unknown,
  inputHandle: ExecAuthorityNativeCustodyHandle,
  preIdentity: ExecAuthorityNativeIdentity,
  expectedMaxBytes: number,
): ExecAuthorityNativeRead | null {
  if (!hasExactFrozenDataShape(value, READ_RESULT_KEYS)) return null;
  const bytes = ownData(value, 'bytes');
  const clonedBytes = snapshotExactBytes(bytes);
  const before = validateIdentity(ownData(value, 'before'));
  const after = validateIdentity(ownData(value, 'after'));
  const eof = ownData(value, 'eof');
  const requestedMaxBytes = ownData(value, 'requestedMaxBytes');
  const observedBytes = ownData(value, 'observedBytes');
  const postInspection = inspectOpaqueHandle(custody, inputHandle);
  const exactObservedSize = isSafeNonNegativeInteger(observedBytes)
    ? reflectApply(numberToString, observedBytes, []) as string
    : null;
  const requiredEvidence = EVIDENCE_COMPONENT_NOFOLLOW
    | EVIDENCE_OWNER_PRIVATE
    | EVIDENCE_BOUNDED_READ
    | EVIDENCE_OBJECT_TYPE
    | EVIDENCE_LINK_COUNT
    | EVIDENCE_SIZE
    | EVIDENCE_OWNER_IDENTITY
    | (expectedPlatform() === 'win32'
      ? EVIDENCE_LOCAL_VOLUME
        | EVIDENCE_DACL_PRESENT
        | EVIDENCE_DACL_PROTECTED
        | EVIDENCE_DACL_EXACT_OWNER_ONLY
      : 0);
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-read'
    || clonedBytes === null
    || before === null
    || after === null
    || !sameIdentity(before, after)
    || postInspection.state !== 'LIVE'
    || !sameStableObjectIdentity(preIdentity, before)
    || !sameStableObjectIdentity(after, postInspection.identity)
    || !isOwnerPrivateOpenIdentity(before, 'REGULAR_FILE')
    || !hasEvidenceBits(before.featureEvidenceBits, requiredEvidence)
    || typeof eof !== 'boolean'
    || !isSafePositiveInteger(requestedMaxBytes)
    || requestedMaxBytes !== expectedMaxBytes
    || !isSafeNonNegativeInteger(observedBytes)
    || observedBytes !== trustedTypedArrayNumber(typedArrayByteLengthGetter, clonedBytes)
    || observedBytes > requestedMaxBytes
    || exactObservedSize === null
    || preIdentity.size !== exactObservedSize
    || before.size !== exactObservedSize
    || after.size !== exactObservedSize
    || postInspection.identity.size !== exactObservedSize
    || eof !== (observedBytes < requestedMaxBytes)) {
    return null;
  }
  return objectFreeze({
    schemaVersion: 1 as const,
    kind: 'custody-read' as const,
    bytes: clonedBytes,
    before,
    after,
    eof,
    requestedMaxBytes,
    observedBytes,
  }) as unknown as ExecAuthorityNativeRead;
}

function validateDirectoryScanResult(
  custody: RawCustodyFacade,
  value: unknown,
  inputHandle: ExecAuthorityNativeCustodyHandle,
  preIdentity: ExecAuthorityNativeIdentity,
  expectedMaxEntries: number,
  expectedMaxNameBytes: number,
  expectedDeadlineUnixMs: number,
): ExecAuthorityNativeDirectoryScan | null {
  if (!hasExactFrozenDataShape(value, DIRECTORY_SCAN_RESULT_KEYS)) return null;
  const before = validateIdentity(ownData(value, 'before'));
  const after = validateIdentity(ownData(value, 'after'));
  const names = frozenSortedStringArray<string>(ownData(value, 'names'), null);
  const entryCount = ownData(value, 'entryCount');
  const requestedMaxEntries = ownData(value, 'requestedMaxEntries');
  const requestedMaxNameBytes = ownData(value, 'requestedMaxNameBytes');
  const deadlineUnixMs = ownData(value, 'deadlineUnixMs');
  const postInspection = inspectOpaqueHandle(custody, inputHandle);
  if (
    ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-directory-scan'
    || ownData(value, 'state') !== 'SCANNED'
    || ownData(value, 'mutationEvidence') !== 'DIRECTORY_IDENTITY_STABLE'
    || before === null
    || after === null
    || names === null
    || !isSafeNonNegativeInteger(entryCount)
    || entryCount !== names.length
    || entryCount > expectedMaxEntries
    || requestedMaxEntries !== expectedMaxEntries
    || requestedMaxNameBytes !== expectedMaxNameBytes
    || deadlineUnixMs !== expectedDeadlineUnixMs
    || postInspection.state !== 'LIVE'
    || !sameStableObjectIdentity(preIdentity, before)
    || !sameIdentity(before, after)
    || !sameStableObjectIdentity(after, postInspection.identity)
    || !isOwnerPrivateOpenIdentity(before, 'DIRECTORY')
    || listSome(names, name => (
      !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(name)
      || utf8ByteLength(name) > expectedMaxNameBytes
    ))
  ) return null;
  return objectFreeze({
    schemaVersion: 1 as const,
    kind: 'custody-directory-scan' as const,
    state: 'SCANNED' as const,
    before,
    after,
    names,
    entryCount,
    requestedMaxEntries,
    requestedMaxNameBytes,
    deadlineUnixMs,
    mutationEvidence: 'DIRECTORY_IDENTITY_STABLE' as const,
  }) as ExecAuthorityNativeDirectoryScan;
}

function validateEvidenceResult(
  custody: RawCustodyFacade,
  value: unknown,
  expectedOperation: 'APPLY_PRIVATE' | 'SYNC',
  inputHandle: ExecAuthorityNativeCustodyHandle,
  preIdentity: ExecAuthorityNativeIdentity,
): ExecAuthorityNativeEvidence | null {
  const featureEvidenceBits = ownData(value, 'featureEvidenceBits');
  const platform = expectedPlatform();
  if (!hasExactFrozenDataShape(value, EVIDENCE_RESULT_KEYS)
    || ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-evidence'
    || ownData(value, 'operation') !== expectedOperation
    || ownData(value, 'state') !== 'CONFIRMED'
    || (platform !== 'linux' && platform !== 'darwin' && platform !== 'win32')
    || !isPlatformCompatibleFeatureEvidence(featureEvidenceBits, platform)) {
    return null;
  }
  const inspected = inspectOpaqueHandle(custody, inputHandle);
  if (inspected.state !== 'LIVE'
    || !sameStableObjectIdentity(preIdentity, inspected.identity)
    || (inspected.identity.objectType !== 'DIRECTORY'
      && inspected.identity.objectType !== 'REGULAR_FILE')
    || !(inspected.identity.objectType === 'REGULAR_FILE'
      ? isOwnerPrivateRegularHandleIdentity(inspected.identity)
      : isOwnerPrivateOpenIdentity(inspected.identity, inspected.identity.objectType))
    || featureEvidenceBits !== inspected.identity.featureEvidenceBits) {
    return null;
  }
  if (expectedOperation === 'SYNC') {
    const durabilityEvidence = inspected.identity.objectType === 'DIRECTORY'
      ? EVIDENCE_DIRECTORY_DURABILITY
      : EVIDENCE_FILE_DURABILITY;
    if (!hasEvidenceBits(featureEvidenceBits, durabilityEvidence)) return null;
  } else {
    const privacyEvidence = EVIDENCE_OWNER_PRIVATE
      | EVIDENCE_OWNER_IDENTITY
      | (platform === 'win32'
        ? EVIDENCE_DACL_PRESENT
          | EVIDENCE_DACL_PROTECTED
          | EVIDENCE_DACL_EXACT_OWNER_ONLY
          | EVIDENCE_LOCAL_VOLUME
        : 0);
    if (!hasEvidenceBits(featureEvidenceBits, privacyEvidence)) return null;
  }
  return value as unknown as ExecAuthorityNativeEvidence;
}

function isReasonCode(value: unknown): value is ExecAuthorityNativeReasonCode {
  return typeof value === 'string'
    && setContains(CUSTODY_REASON_CODES, value as ExecAuthorityNativeReasonCode);
}

function validatePublicationResult(
  custody: RawCustodyFacade,
  value: unknown,
  inputPublication: ExecAuthorityNativeCustodyHandle,
): ExecAuthorityNativePublication | null {
  if (!hasExactFrozenDataShape(value, PUBLICATION_RESULT_KEYS)) return null;
  const state = ownData(value, 'state');
  const readHandle = ownData(value, 'readHandle');
  const identityValue = ownData(value, 'identity');
  const identity = identityValue === null ? null : validateIdentity(identityValue);
  const reasonCode = ownData(value, 'reasonCode');
  const featureEvidenceBitsValue = ownData(value, 'featureEvidenceBits');
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-publication'
    || (state !== 'CREATED'
      && state !== 'EXISTING_IDENTICAL'
      && state !== 'PUBLISHED_UNCONFIRMED')
    || !isPlatformCompatibleFeatureEvidence(featureEvidenceBitsValue)
    || (identityValue !== null && identity === null)) {
    return null;
  }
  const validatedReadHandle = readHandle === null
    ? null
    : validateReturnedHandle(custody, readHandle, identity);
  const inputState = inspectOpaqueHandle(custody, inputPublication);
  if ((readHandle === null) !== (identityValue === null)
    || (readHandle !== null && validatedReadHandle === null)
    || (readHandle !== null && objectIs(readHandle, inputPublication))
    || (validatedReadHandle !== null
      && (identity === null || !isOwnerPrivateOpenIdentity(identity, 'REGULAR_FILE')))) {
    return null;
  }
  if (state === 'CREATED' || state === 'EXISTING_IDENTICAL') {
    const requiredDurability = EVIDENCE_FILE_DURABILITY | EVIDENCE_DIRECTORY_DURABILITY;
    const provenanceMask = EVIDENCE_PUBLISH_AT_EMPTY_PATH | EVIDENCE_PUBLISH_PROC_FD_ALIAS;
    const publishProvenance = featureEvidenceBitsValue & provenanceMask;
    const posixOnlyPublicationEvidence = EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH
      | provenanceMask;
    const platform = expectedPlatform();
    const platformPublicationConfirmed = platform === 'win32'
      ? (featureEvidenceBitsValue & posixOnlyPublicationEvidence) === 0
        && identity !== null
        && listIncludes(identity.volumeCapabilities, 'NO_REPLACE_PUBLISH')
        && listIncludes(identity.volumeCapabilities, 'PERSISTENT_ACL')
        && listIncludes(identity.volumeCapabilities, 'STABLE_OBJECT_ID')
      : ((platform === 'linux' || platform === 'darwin')
        && hasEvidenceBits(
        featureEvidenceBitsValue,
        EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH,
      )
        && (publishProvenance === EVIDENCE_PUBLISH_AT_EMPTY_PATH
          || publishProvenance === EVIDENCE_PUBLISH_PROC_FD_ALIAS)
        && identity !== null
        && listIncludes(identity.volumeCapabilities, 'ANONYMOUS_TEMPFILE')
        && listIncludes(identity.volumeCapabilities, 'NO_REPLACE_PUBLISH')
        && listIncludes(identity.volumeCapabilities, 'STABLE_OBJECT_ID'));
    if (inputState.state !== 'CONSUMED'
      || validatedReadHandle === null
      || identity === null
      || !isOwnerPrivateOpenIdentity(identity, 'REGULAR_FILE')
      || !hasEvidenceBits(featureEvidenceBitsValue, requiredDurability)
      || !platformPublicationConfirmed
      || reasonCode !== null) {
      return null;
    }
  } else {
    if (!isReasonCode(reasonCode)) return null;
    if (reasonCode === 'CLEANUP_UNCONFIRMED') {
      if (inputState.state !== 'CONSUMED'
        || validatedReadHandle === null
        || identity === null) {
        return null;
      }
    } else if (validatedReadHandle !== null
      || identity !== null
      || inputState.state !== 'LIVE'
      || !isOwnerPrivatePublicationIdentity(inputState.identity)) {
      // A non-cleanup uncertainty retains the original publication as the
      // sole reconciliation authority. A replacement would create dual or
      // lifecycle-inconsistent authority.
      return null;
    }
  }
  return value as unknown as ExecAuthorityNativePublication;
}

function validateCleanupResult(
  custody: RawCustodyFacade,
  value: unknown,
  inputPublication: ExecAuthorityNativeCustodyHandle,
): ExecAuthorityNativeCleanup | null {
  if (!hasExactFrozenDataShape(value, CLEANUP_RESULT_KEYS)) return null;
  const state = ownData(value, 'state');
  const reasonCode = ownData(value, 'reasonCode');
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-cleanup'
    || (state !== 'CLEANUP_CONFIRMED' && state !== 'CLEANUP_UNCONFIRMED')
    || (state === 'CLEANUP_CONFIRMED' && reasonCode !== null)
    || (state === 'CLEANUP_UNCONFIRMED' && reasonCode !== 'CLEANUP_UNCONFIRMED')) {
    return null;
  }
  const inputState = inspectOpaqueHandle(custody, inputPublication);
  if (inputState.state !== 'CONSUMED') return null;
  return value as unknown as ExecAuthorityNativeCleanup;
}

function validateCustodyInput<TOperation extends ExecAuthorityNativeCustodyOperation>(
  operation: TOperation,
  input: ExecAuthorityNativeCustodyInputByOperation[TOperation],
): ExecAuthorityNativeCustodyInputByOperation[TOperation] | null {
  let record: Readonly<Record<string, unknown>> | null;
  switch (operation) {
    case 'open-root':
      record = snapshotExactInput(input, ['disposition', 'path', 'privacyPolicy']);
      if (record === null
        || !isIngressPath(record.path)
        || !isOpenDisposition(record.disposition)
        || record.privacyPolicy !== 'OWNER_PRIVATE') {
        return null;
      }
      break;
    case 'open-directory-at':
      record = snapshotExactInput(input, ['disposition', 'name', 'parent', 'privacyPolicy']);
      if (record === null
        || !hasOpaqueHandleShape(record.parent)
        || !isComponent(record.name)
        || !isOpenDisposition(record.disposition)
        || record.privacyPolicy !== 'OWNER_PRIVATE') {
        return null;
      }
      break;
    case 'open-file-at':
      record = snapshotExactInput(input, ['disposition', 'name', 'parent', 'privacyPolicy']);
      if (record === null
        || !hasOpaqueHandleShape(record.parent)
        || !isComponent(record.name)
        || record.disposition !== 'OPEN_EXISTING'
        || record.privacyPolicy !== 'OWNER_PRIVATE') {
        return null;
      }
      break;
    case 'begin-publication':
      record = snapshotExactInput(input, ['maxBytes', 'name', 'parent']);
      if (record === null
        || !hasOpaqueHandleShape(record.parent)
        || !isComponent(record.name)
        || !isSafePositiveInteger(record.maxBytes)) {
        return null;
      }
      break;
    case 'append-publication': {
      record = snapshotExactInput(input, ['bytes', 'publication']);
      const bytes = snapshotExactBytes(record?.bytes);
      if (record === null
        || !hasOpaqueHandleShape(record.publication)
        || bytes === null) {
        return null;
      }
      record = objectFreeze({
        publication: record.publication,
        bytes,
      });
      break;
    }
    case 'seal-publication':
    case 'abort-publication':
      record = snapshotExactInput(input, ['publication']);
      if (record === null || !hasOpaqueHandleShape(record.publication)) return null;
      break;
    case 'read-bounded':
      record = snapshotExactInput(input, ['file', 'maxBytes']);
      if (record === null
        || !hasOpaqueHandleShape(record.file)
        || !isSafePositiveInteger(record.maxBytes)) {
        return null;
      }
      break;
    case 'scan-directory-bounded':
      record = snapshotExactInput(input, [
        'deadlineUnixMs',
        'directory',
        'maxEntries',
        'maxNameBytes',
      ]);
      if (record === null
        || !hasOpaqueHandleShape(record.directory)
        || !isSafePositiveInteger(record.maxEntries)
        || record.maxEntries > 100_000
        || !isSafePositiveInteger(record.maxNameBytes)
        || record.maxNameBytes > 128
        || !isSafePositiveInteger(record.deadlineUnixMs)) {
        return null;
      }
      break;
    case 'prove-root-separation':
      record = snapshotExactInput(input, ['canonicalProjectRoot', 'custodyRoot']);
      if (record === null
        || !hasOpaqueHandleShape(record.custodyRoot)
        || !isCanonicalRootSeparationIngressPath(record.canonicalProjectRoot)) {
        return null;
      }
      break;
    case 'probe':
    case 'identity':
    case 'apply-private':
    case 'sync':
      record = snapshotExactInput(input, ['handle']);
      if (record === null || !hasOpaqueHandleShape(record.handle)) return null;
      break;
    default:
      return null;
  }
  return record as unknown as ExecAuthorityNativeCustodyInputByOperation[TOperation];
}

interface CustodyInvocationContext {
  readonly inputHandle: ExecAuthorityNativeCustodyHandle | null;
  readonly inputRecord: RegisteredHandleRecord | null;
  readonly preIdentity: ExecAuthorityNativeIdentity | null;
}

function inspectRegisteredHandle(
  custody: RawCustodyFacade,
  registry: HandleRegistry,
  handle: ExecAuthorityNativeCustodyHandle,
  record: RegisteredHandleRecord,
): ExecAuthorityNativeIdentity {
  const inspected = inspectOpaqueHandle(custody, handle);
  if (inspected.state === 'CONSUMED') {
    replaceHandleRecord(registry, handle, record, 'CONSUMED');
    throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_CLOSED');
  }
  if (inspected.state !== 'LIVE') {
    throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT');
  }
  if (!sameStableObjectIdentity(record.identity, inspected.identity)) {
    throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STALE');
  }
  return inspected.identity;
}

function preflightCustodyInvocation(
  custody: RawCustodyFacade,
  registry: HandleRegistry,
  operation: ExecAuthorityNativeCustodyOperation,
  input: ExecAuthorityNativeCustodyInputByOperation[ExecAuthorityNativeCustodyOperation],
): CustodyInvocationContext {
  let handle: ExecAuthorityNativeCustodyHandle | null = null;
  let record: RegisteredHandleRecord | null = null;
  let inspectBeforeEffect = false;
  switch (operation) {
    case 'open-root':
      break;
    case 'probe':
      handle = ownData(input, 'handle') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['ROOT_DIRECTORY'],
        HANDLE_RIGHT_IDENTITY,
        ['OPEN'],
      );
      inspectBeforeEffect = true;
      break;
    case 'prove-root-separation':
      handle = ownData(input, 'custodyRoot') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['ROOT_DIRECTORY'],
        HANDLE_RIGHT_TRAVERSE | HANDLE_RIGHT_IDENTITY,
        ['OPEN'],
      );
      inspectBeforeEffect = true;
      break;
    case 'open-directory-at':
    case 'open-file-at':
      handle = ownData(input, 'parent') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['ROOT_DIRECTORY', 'DIRECTORY'],
        HANDLE_RIGHT_TRAVERSE,
        ['OPEN'],
      );
      break;
    case 'begin-publication':
      handle = ownData(input, 'parent') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['ROOT_DIRECTORY', 'DIRECTORY'],
        HANDLE_RIGHT_PUBLISH,
        ['OPEN'],
      );
      break;
    case 'append-publication':
      handle = ownData(input, 'publication') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['PUBLICATION'],
        HANDLE_RIGHT_APPEND,
        ['OPEN'],
      );
      break;
    case 'seal-publication':
      handle = ownData(input, 'publication') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['PUBLICATION'],
        HANDLE_RIGHT_PUBLISH,
        ['OPEN'],
      );
      break;
    case 'abort-publication':
      handle = ownData(input, 'publication') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['PUBLICATION'],
        HANDLE_RIGHT_ABORT,
        ['OPEN', 'APPEND_FAILED'],
      );
      break;
    case 'read-bounded':
      handle = ownData(input, 'file') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['READ_FILE'],
        HANDLE_RIGHT_READ,
        ['OPEN'],
      );
      inspectBeforeEffect = true;
      break;
    case 'scan-directory-bounded':
      handle = ownData(input, 'directory') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['ROOT_DIRECTORY', 'DIRECTORY'],
        HANDLE_RIGHT_TRAVERSE | HANDLE_RIGHT_IDENTITY,
        ['OPEN'],
      );
      inspectBeforeEffect = true;
      break;
    case 'identity':
      handle = ownData(input, 'handle') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['ROOT_DIRECTORY', 'DIRECTORY', 'READ_FILE', 'PUBLICATION'],
        HANDLE_RIGHT_IDENTITY,
        ['OPEN', 'APPEND_FAILED', 'PUBLISHED_UNCONFIRMED'],
      );
      inspectBeforeEffect = true;
      break;
    case 'apply-private':
      handle = ownData(input, 'handle') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['ROOT_DIRECTORY', 'DIRECTORY', 'PUBLICATION'],
        HANDLE_RIGHT_APPLY_PRIVATE,
        ['OPEN'],
      );
      inspectBeforeEffect = true;
      break;
    case 'sync':
      handle = ownData(input, 'handle') as ExecAuthorityNativeCustodyHandle;
      record = requireRegisteredHandle(
        registry,
        handle,
        ['ROOT_DIRECTORY', 'DIRECTORY', 'PUBLICATION'],
        HANDLE_RIGHT_SYNC,
        ['OPEN'],
      );
      inspectBeforeEffect = true;
      break;
  }
  const preIdentity = inspectBeforeEffect && handle !== null && record !== null
    ? inspectRegisteredHandle(custody, registry, handle, record)
    : null;
  return objectFreeze({ inputHandle: handle, inputRecord: record, preIdentity });
}

function invokeNaturalCustodyOperation(
  custody: RawCustodyFacade,
  operation: ExecAuthorityNativeCustodyOperation,
  input: ExecAuthorityNativeCustodyInputByOperation[ExecAuthorityNativeCustodyOperation],
): unknown {
  switch (operation) {
    case 'probe': return custody.probe(ownData(input, 'handle'));
    case 'prove-root-separation': return custody.proveRootSeparation(
      ownData(input, 'custodyRoot'),
      ownData(input, 'canonicalProjectRoot'),
    );
    case 'open-root': return custody.openRoot(
      ownData(input, 'path'),
      ownData(input, 'disposition'),
      ownData(input, 'privacyPolicy'),
    );
    case 'open-directory-at': return custody.openDirectoryAt(
      ownData(input, 'parent'),
      ownData(input, 'name'),
      ownData(input, 'disposition'),
      ownData(input, 'privacyPolicy'),
    );
    case 'open-file-at': return custody.openFileAt(
      ownData(input, 'parent'),
      ownData(input, 'name'),
      ownData(input, 'disposition'),
      ownData(input, 'privacyPolicy'),
    );
    case 'begin-publication': return custody.beginPublication(
      ownData(input, 'parent'),
      ownData(input, 'name'),
      ownData(input, 'maxBytes'),
    );
    case 'append-publication': return custody.appendPublication(
      ownData(input, 'publication'),
      ownData(input, 'bytes'),
    );
    case 'seal-publication': return custody.sealPublication(ownData(input, 'publication'));
    case 'abort-publication': return custody.abortPublication(ownData(input, 'publication'));
    case 'read-bounded': return custody.readBounded(
      ownData(input, 'file'),
      ownData(input, 'maxBytes'),
    );
    case 'scan-directory-bounded': return custody.scanDirectoryBounded(
      ownData(input, 'directory'),
      ownData(input, 'maxEntries'),
      ownData(input, 'maxNameBytes'),
      ownData(input, 'deadlineUnixMs'),
    );
    case 'identity': return custody.identity(ownData(input, 'handle'));
    case 'apply-private': return custody.applyPrivate(ownData(input, 'handle'));
    case 'sync': return custody.sync(ownData(input, 'handle'));
  }
}

function validateIdentityResult(
  custody: RawCustodyFacade,
  value: unknown,
  inputHandle: ExecAuthorityNativeCustodyHandle,
  preIdentity: ExecAuthorityNativeIdentity,
): ExecAuthorityNativeIdentity | null {
  const identity = validateIdentity(value);
  const postInspection = inspectOpaqueHandle(custody, inputHandle);
  return identity !== null
    && postInspection.state === 'LIVE'
    && sameIdentity(preIdentity, identity)
    && sameIdentity(identity, postInspection.identity)
    ? identity
    : null;
}

function validateRootSeparationResult(
  custody: RawCustodyFacade,
  value: unknown,
  inputHandle: ExecAuthorityNativeCustodyHandle,
  registeredIdentity: ExecAuthorityNativeIdentity,
  preIdentity: ExecAuthorityNativeIdentity,
): ExecAuthorityNativeRootSeparation | null {
  if (!hasExactFrozenDataShape(value, ROOT_SEPARATION_RESULT_KEYS)) return null;
  const custodyIdentity = validateIdentity(ownData(value, 'custodyIdentity'));
  const projectIdentity = validateIdentity(ownData(value, 'projectIdentity'));
  const featureEvidenceBits = ownData(value, 'featureEvidenceBits');
  const postInspection = inspectOpaqueHandle(custody, inputHandle);
  const requiredEvidence = EVIDENCE_COMPONENT_NOFOLLOW
    | EVIDENCE_OBJECT_TYPE
    | EVIDENCE_ROOT_SEPARATION;
  return ownData(value, 'schemaVersion') === 1
    && ownData(value, 'kind') === 'custody-root-separation'
    && ownData(value, 'state') === 'CONFIRMED'
    && featureEvidenceBits === requiredEvidence
    && custodyIdentity !== null
    && projectIdentity !== null
    && sameIdentity(registeredIdentity, custodyIdentity)
    && sameIdentity(preIdentity, custodyIdentity)
    && postInspection.state === 'LIVE'
    && sameIdentity(custodyIdentity, postInspection.identity)
    && isOwnerPrivateOpenIdentity(custodyIdentity, 'DIRECTORY')
    && projectIdentity.objectType === 'DIRECTORY'
    && hasEvidenceBits(
      projectIdentity.featureEvidenceBits,
      EVIDENCE_COMPONENT_NOFOLLOW | EVIDENCE_OBJECT_TYPE,
    )
    && listIncludes(projectIdentity.volumeCapabilities, 'STABLE_OBJECT_ID')
    && (custodyIdentity.dev !== projectIdentity.dev
      || custodyIdentity.ino !== projectIdentity.ino)
    ? value as unknown as ExecAuthorityNativeRootSeparation
    : null;
}

function validateCustodyResult(
  custody: RawCustodyFacade,
  operation: ExecAuthorityNativeCustodyOperation,
  value: unknown,
  input: ExecAuthorityNativeCustodyInputByOperation[ExecAuthorityNativeCustodyOperation],
  context: CustodyInvocationContext,
): ExecAuthorityNativeCustodyResult | null {
  switch (operation) {
    case 'probe': return validateProbeResult(
      custody,
      value,
      ownData(input, 'handle') as ExecAuthorityNativeCustodyHandle,
      context.preIdentity as ExecAuthorityNativeIdentity,
    );
    case 'prove-root-separation': return validateRootSeparationResult(
      custody,
      value,
      ownData(input, 'custodyRoot') as ExecAuthorityNativeCustodyHandle,
      context.inputRecord?.identity as ExecAuthorityNativeIdentity,
      context.preIdentity as ExecAuthorityNativeIdentity,
    );
    case 'open-root':
      return validateOpenResult(
        custody,
        value,
        ownData(input, 'disposition') as ExecAuthorityNativeOpenDisposition,
        'DIRECTORY',
      );
    case 'open-directory-at':
      return validateOpenResult(
        custody,
        value,
        ownData(input, 'disposition') as ExecAuthorityNativeOpenDisposition,
        'DIRECTORY',
      );
    case 'open-file-at':
      return validateOpenResult(custody, value, 'OPEN_EXISTING', 'REGULAR_FILE');
    case 'begin-publication': {
      const validated = validateReturnedHandle(custody, value, null);
      return validated?.identity.objectType === 'REGULAR_FILE' ? validated.handle : null;
    }
    case 'append-publication':
      return validateAppendResult(
        value,
        trustedTypedArrayNumber(
          typedArrayByteLengthGetter,
          ownData(input, 'bytes') as object,
        ) ?? -1,
      );
    case 'seal-publication': return validatePublicationResult(
      custody,
      value,
      ownData(input, 'publication') as ExecAuthorityNativeCustodyHandle,
    );
    case 'abort-publication': return validateCleanupResult(
      custody,
      value,
      ownData(input, 'publication') as ExecAuthorityNativeCustodyHandle,
    );
    case 'read-bounded':
      return validateReadResult(
        custody,
        value,
        ownData(input, 'file') as ExecAuthorityNativeCustodyHandle,
        context.preIdentity as ExecAuthorityNativeIdentity,
        ownData(input, 'maxBytes') as number,
      );
    case 'scan-directory-bounded':
      return validateDirectoryScanResult(
        custody,
        value,
        ownData(input, 'directory') as ExecAuthorityNativeCustodyHandle,
        context.preIdentity as ExecAuthorityNativeIdentity,
        ownData(input, 'maxEntries') as number,
        ownData(input, 'maxNameBytes') as number,
        ownData(input, 'deadlineUnixMs') as number,
      );
    case 'identity': return validateIdentityResult(
      custody,
      value,
      ownData(input, 'handle') as ExecAuthorityNativeCustodyHandle,
      context.preIdentity as ExecAuthorityNativeIdentity,
    );
    case 'apply-private': return validateEvidenceResult(
      custody,
      value,
      'APPLY_PRIVATE',
      ownData(input, 'handle') as ExecAuthorityNativeCustodyHandle,
      context.preIdentity as ExecAuthorityNativeIdentity,
    );
    case 'sync': return validateEvidenceResult(
      custody,
      value,
      'SYNC',
      ownData(input, 'handle') as ExecAuthorityNativeCustodyHandle,
      context.preIdentity as ExecAuthorityNativeIdentity,
    );
  }
}

function retainSealReconciliationAuthority(
  custody: RawCustodyFacade,
  registry: HandleRegistry,
  inputPublication: ExecAuthorityNativeCustodyHandle,
  rawResult: unknown,
): void {
  const inputRecord = registeredHandleRecord(registry, inputPublication);
  if (inputRecord === null || inputRecord.kind !== 'PUBLICATION') return;

  let replacementHandle: ExecAuthorityNativeCustodyHandle | null = null;
  let replacementIdentity: ExecAuthorityNativeIdentity | null = null;
  const rawReadHandle = ownData(rawResult, 'readHandle');
  const rawIdentity = validateIdentity(ownData(rawResult, 'identity'));
  if (rawIdentity !== null
    && hasOpaqueHandleShape(rawReadHandle)
    && !objectIs(rawReadHandle, inputPublication)) {
    try {
      const validated = validateReturnedHandle(custody, rawReadHandle, rawIdentity);
      if (validated !== null
        && isOwnerPrivateOpenIdentity(validated.identity, 'REGULAR_FILE')) {
        replacementHandle = validated.handle;
        replacementIdentity = validated.identity;
        const knownReplacement = registeredHandleRecord(registry, replacementHandle);
        if (knownReplacement === null) {
          const registered = registerHandle(
            registry,
            replacementHandle,
            'READ_FILE',
            replacementIdentity,
            'seal-reconciliation',
            inputRecord.logicalGeneration,
          );
          if (registered === null) {
            replacementHandle = null;
            replacementIdentity = null;
          }
        } else if (knownReplacement.kind !== 'READ_FILE'
          || knownReplacement.state !== 'OPEN'
          || !sameIdentity(knownReplacement.identity, replacementIdentity)) {
          replacementHandle = null;
          replacementIdentity = null;
        }
      }
    } catch {
      replacementHandle = null;
      replacementIdentity = null;
    }
  }

  const retained = objectFreeze<RetainedSealAuthority>({
    outcome: 'PUBLISHED_UNCONFIRMED',
    sourceGeneration: inputRecord.logicalGeneration,
    replacementHandle,
    replacementIdentity,
  });
  let state: RegisteredHandleState = 'PUBLISHED_UNCONFIRMED';
  let identity = inputRecord.identity;
  try {
    const inspected = inspectOpaqueHandle(custody, inputPublication);
    if (inspected.state === 'CONSUMED') {
      state = 'CONSUMED';
    } else if (inspected.state === 'LIVE') {
      identity = inspected.identity;
    }
  } catch {
    // The namespace-effect class is already uncertain. Preserve the original
    // token plus any replacement authority; never guess cleanup or retry.
  }
  replaceHandleRecord(registry, inputPublication, inputRecord, state, identity, retained);
}

function admitCustodyResult(
  custody: RawCustodyFacade,
  registry: HandleRegistry,
  operation: ExecAuthorityNativeCustodyOperation,
  result: ExecAuthorityNativeCustodyResult,
  context: CustodyInvocationContext,
): boolean {
  const parentGeneration = context.inputRecord?.logicalGeneration ?? null;
  switch (operation) {
    case 'open-root':
    case 'open-directory-at':
    case 'open-file-at': {
      const open = result as ExecAuthorityNativeOpen;
      const kind: RegisteredHandleKind = operation === 'open-root'
        ? 'ROOT_DIRECTORY'
        : operation === 'open-directory-at'
          ? 'DIRECTORY'
          : 'READ_FILE';
      return registerHandle(
        registry,
        open.handle,
        kind,
        open.identity,
        operation,
        parentGeneration,
      ) !== null;
    }
    case 'begin-publication': {
      const handle = result as ExecAuthorityNativeCustodyHandle;
      const inspected = inspectOpaqueHandle(custody, handle);
      return inspected.state === 'LIVE'
        && isOwnerPrivatePublicationIdentity(inspected.identity)
        && registerHandle(
          registry,
          handle,
          'PUBLICATION',
          inspected.identity,
          operation,
          parentGeneration,
        ) !== null;
    }
    case 'probe': {
      const probe = result as ExecAuthorityNativeProbe;
      if (context.inputHandle === null || context.inputRecord === null || probe.identity === null) {
        return false;
      }
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        context.inputRecord.state,
        probe.identity,
      );
      return true;
    }
    case 'prove-root-separation': {
      if (context.inputHandle === null || context.inputRecord === null) return false;
      const proof = result as ExecAuthorityNativeRootSeparation;
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        context.inputRecord.state,
        proof.custodyIdentity,
      );
      return true;
    }
    case 'identity':
      if (context.inputHandle === null || context.inputRecord === null) return false;
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        context.inputRecord.state,
        result as ExecAuthorityNativeIdentity,
      );
      return true;
    case 'read-bounded':
    case 'scan-directory-bounded': {
      if (context.inputHandle === null || context.inputRecord === null) return false;
      const inspected = inspectOpaqueHandle(custody, context.inputHandle);
      if (inspected.state !== 'LIVE') return false;
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        context.inputRecord.state,
        inspected.identity,
      );
      return true;
    }
    case 'apply-private':
    case 'sync': {
      if (context.inputHandle === null || context.inputRecord === null) return false;
      const inspected = inspectOpaqueHandle(custody, context.inputHandle);
      if (inspected.state !== 'LIVE'
        || inspected.identity.featureEvidenceBits
          !== (result as ExecAuthorityNativeEvidence).featureEvidenceBits) {
        return false;
      }
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        context.inputRecord.state,
        inspected.identity,
      );
      return true;
    }
    case 'seal-publication': {
      if (context.inputHandle === null || context.inputRecord === null) return false;
      const publication = result as ExecAuthorityNativePublication;
      if (publication.state === 'CREATED'
        || publication.state === 'EXISTING_IDENTICAL'
        || publication.reasonCode === 'CLEANUP_UNCONFIRMED') {
        if (publication.readHandle === null || publication.identity === null) return false;
        const registered = registerHandle(
          registry,
          publication.readHandle,
          'READ_FILE',
          publication.identity,
          publication.reasonCode === 'CLEANUP_UNCONFIRMED'
            ? 'seal-reconciliation'
            : operation,
          context.inputRecord.logicalGeneration,
        );
        if (registered === null) return false;
        replaceHandleRecord(
          registry,
          context.inputHandle,
          context.inputRecord,
          'CONSUMED',
          context.inputRecord.identity,
          publication.reasonCode === 'CLEANUP_UNCONFIRMED'
            ? objectFreeze({
              outcome: 'CLEANUP_UNCONFIRMED',
              sourceGeneration: context.inputRecord.logicalGeneration,
              replacementHandle: publication.readHandle,
              replacementIdentity: publication.identity,
            })
            : null,
        );
        return true;
      }
      const inspected = inspectOpaqueHandle(custody, context.inputHandle);
      if (inspected.state !== 'LIVE') return false;
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        'PUBLISHED_UNCONFIRMED',
        inspected.identity,
        objectFreeze({
          outcome: 'PUBLISHED_UNCONFIRMED',
          sourceGeneration: context.inputRecord.logicalGeneration,
          replacementHandle: null,
          replacementIdentity: null,
        }),
      );
      return true;
    }
    case 'abort-publication': {
      if (context.inputHandle === null || context.inputRecord === null) return false;
      const cleanup = result as ExecAuthorityNativeCleanup;
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        cleanup.state === 'CLEANUP_CONFIRMED' ? 'CONSUMED' : 'CLEANUP_UNCONFIRMED',
      );
      return true;
    }
    case 'append-publication': {
      if (context.inputHandle === null || context.inputRecord === null) return false;
      const inspected = inspectOpaqueHandle(custody, context.inputHandle);
      if (inspected.state !== 'LIVE'
        || !sameAppendObjectIdentity(context.inputRecord.identity, inspected.identity)
        || !isOwnerPrivatePublicationIdentity(inspected.identity)) {
        return false;
      }
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        context.inputRecord.state,
        inspected.identity,
      );
      return true;
    }
  }
}

function returnedHandleCandidate(
  operation: ExecAuthorityNativeCustodyOperation,
  value: unknown,
): unknown {
  if (operation === 'begin-publication') return value;
  if (operation === 'open-root'
    || operation === 'open-directory-at'
    || operation === 'open-file-at') {
    return ownData(value, 'handle');
  }
  return null;
}

function closeRawHandlesConfirmed(
  custody: RawCustodyFacade,
  candidates: readonly unknown[],
): boolean {
  const closed: object[] = [];
  let confirmed = true;
  for (const candidate of candidates) {
    if (!hasOpaqueHandleShape(candidate)
      || listSome(closed, previous => objectIs(previous, candidate))) {
      continue;
    }
    closed.push(candidate);
    try {
      if (custody.closeHandle(candidate) !== undefined) confirmed = false;
    } catch {
      confirmed = false;
    }
  }
  return confirmed;
}

function terminalizeUncertainOperation(
  custody: RawCustodyFacade,
  registry: HandleRegistry,
  operation: ExecAuthorityNativeCustodyOperation,
  rawResult: unknown,
  context: CustodyInvocationContext,
): boolean {
  const returnedCandidate = returnedHandleCandidate(operation, rawResult);
  const candidates: unknown[] = context.inputHandle !== null
    && objectIs(returnedCandidate, context.inputHandle)
    ? []
    : [returnedCandidate];
  if (operation === 'append-publication') {
    if (context.inputHandle !== null && context.inputRecord !== null) {
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        'APPEND_FAILED',
      );
    }
    return true;
  }
  if (operation === 'abort-publication') {
    if (context.inputHandle !== null && context.inputRecord !== null) {
      replaceHandleRecord(
        registry,
        context.inputHandle,
        context.inputRecord,
        'CLEANUP_UNCONFIRMED',
      );
    }
    return false;
  }
  if (operation === 'prove-root-separation') {
    return true;
  }
  if (operation === 'seal-publication') {
    if (context.inputHandle !== null) {
      retainSealReconciliationAuthority(
        custody,
        registry,
        context.inputHandle,
        rawResult,
      );
    }
    return false;
  }
  return closeRawHandlesConfirmed(custody, candidates);
}

function uncertainEffectErrorCode(
  operation: ExecAuthorityNativeCustodyOperation,
  input: ExecAuthorityNativeCustodyInputByOperation[ExecAuthorityNativeCustodyOperation],
  cleanupConfirmed: boolean,
  rawResult: unknown,
  nativeReturned: boolean,
): ExecAuthorityNativeErrorCode | null {
  const createCapable = (operation === 'open-root'
      || operation === 'open-directory-at'
      || operation === 'open-file-at')
      && ownData(input, 'disposition') !== 'OPEN_EXISTING';
  if (createCapable) return 'E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED';
  if (operation === 'begin-publication') {
    if (!nativeReturned || !hasOpaqueHandleShape(rawResult)) {
      return 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED';
    }
    return cleanupConfirmed ? null : 'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED';
  }
  if (operation === 'append-publication') {
    return !cleanupConfirmed
      ? 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED'
      : 'E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED';
  }
  if (operation === 'seal-publication') {
    return 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED';
  }
  if (operation === 'abort-publication') {
    return 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED';
  }
  if (operation === 'prove-root-separation') {
    return 'E_EXEC_AUTH_NATIVE_ROOT_SEPARATION_UNCONFIRMED';
  }
  return cleanupConfirmed ? null : 'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED';
}

type EffectHandleRecord = Readonly<{
  kind: ExecAuthorityNativeEffectRootKind | 'STAGED_CONTENT' | 'SOURCE_READ';
  state: 'OPEN' | 'SEALED' | 'VERIFIED' | 'FAILED' | 'CLOSED';
  contentDigest: string | null;
  stagingIdentityDigest: string | null;
  sourceIdentityDigest: string | null;
  totalBytes: number | null;
  deadlineUnixMs: number | null;
  maxChunkBytes: number | null;
  observedBytes: number;
  chunkCount: number;
}>;

function effectEnvelopeOperationDigest(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 200
    || bytes[0] !== 0x44 || bytes[1] !== 0x45
    || bytes[2] !== 0x45 || bytes[3] !== 0x32) return null;
  let hex = '';
  for (let index = 40; index < 72; index += 1) {
    const encoded = reflectApply(numberToString, bytes[index] as number, [16]) as string;
    hex += encoded.length === 1 ? `0${encoded}` : encoded;
  }
  return `sha256:${hex}`;
}

function effectLimitsSnapshot(value: unknown): ExecAuthorityNativeEffectLimits | null {
  const record = snapshotExactInput(value, [
    'deadlineUnixMs', 'maxDepth', 'maxEntries', 'maxFileBytes',
    'maxManifestBytes', 'maxNameBytes', 'maxPathBytes', 'maxTotalBytes',
  ]);
  if (record === null
    || !isSafePositiveInteger(record.deadlineUnixMs)
    || !isSafePositiveInteger(record.maxDepth)
    || !isSafePositiveInteger(record.maxEntries)
    || !isSafePositiveInteger(record.maxFileBytes)
    || !isSafePositiveInteger(record.maxManifestBytes)
    || !isSafePositiveInteger(record.maxNameBytes)
    || !isSafePositiveInteger(record.maxPathBytes)
    || !isSafePositiveInteger(record.maxTotalBytes)
    || record.maxEntries > 100_000 || record.maxDepth > 1024
    || record.maxPathBytes > 1_048_576 || record.maxNameBytes > 4096
    || record.maxFileBytes > 17_179_869_184
    || record.maxTotalBytes > 1_099_511_627_776
    || record.maxManifestBytes > 16_777_216) return null;
  return record as unknown as ExecAuthorityNativeEffectLimits;
}

function effectSourceReadAuthoritySnapshot(
  value: unknown,
): ExecAuthorityNativeEffectSourceReadAuthority | null {
  const record = snapshotExactInput(value, [
    'deadlineUnixMs', 'expectedContentDigest', 'expectedMode', 'expectedSize',
    'maxChunkBytes', 'path',
  ]);
  if (record === null
    || !isSafePositiveInteger(record.deadlineUnixMs)
    || !isEffectDigest(record.expectedContentDigest)
    || !isSafeNonNegativeInteger(record.expectedMode)
    || record.expectedMode > 0o777
    || !isSafeNonNegativeInteger(record.expectedSize)
    || record.expectedSize > 17_179_869_184
    || !isSafePositiveInteger(record.maxChunkBytes)
    || record.maxChunkBytes > 67_108_864
    || !isEffectRelativePath(record.path)) return null;
  return record as unknown as ExecAuthorityNativeEffectSourceReadAuthority;
}

function invokeRawEffect<TResult = unknown>(
  effect: RawEffectFacade,
  operation: EffectResultOperation,
  args: readonly unknown[],
): TResult {
  let result: unknown;
  try {
    switch (operation) {
      case 'open-root': result = effect.openRoot(args[0], args[1]); break;
      case 'capture-tree': result = effect.captureTree(args[0], args[1], args[2]); break;
      case 'inspect-entry': result = effect.inspectEntry(args[0], args[1]); break;
      case 'begin-source-read': result = effect.beginSourceRead(args[0], args[1]); break;
      case 'next-source-chunk': result = effect.nextSourceChunk(args[0], args[1]); break;
      case 'finish-source-read': result = effect.finishSourceRead(args[0]); break;
      case 'begin-stage': result = effect.beginStage(args[0], args[1], args[2]); break;
      case 'append-stage': result = effect.appendStage(args[0], args[1]); break;
      case 'seal-stage': result = effect.sealStage(args[0]); break;
      case 'apply-operation': result = effect.applyOperation(args[0], args[1], args[2]); break;
      case 'reconcile-operation': {
        result = effect.reconcileOperation(args[0], args[1], args[2]);
        break;
      }
      case 'verify-postimages': result = effect.verifyPostimages(args[0], args[1]); break;
    }
  } catch (error) {
    throw nativeBoundaryError(
      admittedNativeErrorCode(error) ?? 'E_EXEC_AUTH_NATIVE_BACKEND_ABI',
    );
  }
  const validated = validateEffectResult(operation, result);
  if (validated === null) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
  return validated as TResult;
}

function createTypedEffectFacade(effect: RawEffectFacade): ExecAuthorityNativeEffectFacade {
  const records = new TrustedWeakMap<object, EffectHandleRecord>();
  const register = (
    handle: unknown,
    record: EffectHandleRecord,
  ): ExecAuthorityNativeEffectHandle => {
    if (!hasOpaqueHandleShape(handle) || reflectApply(weakMapHas, records, [handle])) {
      throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FORGED');
    }
    reflectApply(weakMapSet, records, [handle, objectFreeze(record)]);
    return handle as ExecAuthorityNativeEffectHandle;
  };
  const requireHandle = (
    handle: unknown,
    kinds: readonly EffectHandleRecord['kind'][],
    states: readonly EffectHandleRecord['state'][],
  ): EffectHandleRecord => {
    if (!hasOpaqueHandleShape(handle)) {
      throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FORGED');
    }
    const record = reflectApply(weakMapGet, records, [handle]) as EffectHandleRecord | undefined;
    if (record === undefined) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN');
    if (!listIncludes(kinds, record.kind)) {
      throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_KIND');
    }
    if (!listIncludes(states, record.state)) {
      throw nativeBoundaryError(
        record.state === 'CLOSED'
          ? 'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED'
          : 'E_EXEC_AUTH_NATIVE_HANDLE_STATE',
      );
    }
    return record;
  };
  const replaceRecord = (
    handle: ExecAuthorityNativeEffectHandle,
    record: EffectHandleRecord,
    state: EffectHandleRecord['state'],
  ): void => {
    reflectApply(weakMapSet, records, [handle, objectFreeze({ ...record, state })]);
  };
  const facade: ExecAuthorityNativeEffectFacade = {
    openRoot: (rootKind, path) => {
      if (!listIncludes(['PROJECT', 'WORKSPACE', 'STAGING'] as const, rootKind)
        || !isCanonicalRootSeparationIngressPath(path)) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      const result = invokeRawEffect<ExecAuthorityNativeEffectRoot>(
        effect,
        'open-root',
        [rootKind, path],
      );
      if (result.rootKind !== rootKind) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      const handle = register(result.handle, {
        kind: rootKind,
        state: 'OPEN',
        contentDigest: null,
        stagingIdentityDigest: null,
        sourceIdentityDigest: null,
        totalBytes: null,
        deadlineUnixMs: null,
        maxChunkBytes: null,
        observedBytes: 0,
        chunkCount: 0,
      });
      return objectFreeze({ ...result, handle });
    },
    captureTree: (root, limits, cancelState = 'ACTIVE') => {
      requireHandle(root, ['PROJECT', 'WORKSPACE'], ['OPEN']);
      const snapshot = effectLimitsSnapshot(limits);
      if (snapshot === null || (cancelState !== 'ACTIVE' && cancelState !== 'CANCELLED')) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invokeRawEffect<ExecAuthorityNativeEffectManifest>(
        effect,
        'capture-tree',
        [root, snapshot, cancelState],
      );
    },
    inspectEntry: (root, path) => {
      requireHandle(root, ['PROJECT', 'WORKSPACE'], ['OPEN']);
      if (!isEffectRelativePath(path)) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      return invokeRawEffect<ExecAuthorityNativeEffectInspection>(
        effect,
        'inspect-entry',
        [root, path],
      );
    },
    beginSourceRead: (workspaceRoot, authority) => {
      requireHandle(workspaceRoot, ['WORKSPACE'], ['OPEN']);
      const snapshot = effectSourceReadAuthoritySnapshot(authority);
      if (snapshot === null) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      const result = invokeRawEffect<ExecAuthorityNativeEffectSourceOpen>(
        effect,
        'begin-source-read',
        [workspaceRoot, snapshot],
      );
      if (result.path !== snapshot.path
        || numberParseInt(result.mode, 8) !== snapshot.expectedMode
        || result.totalBytes !== snapshot.expectedSize
        || result.contentDigest !== snapshot.expectedContentDigest
        || result.deadlineUnixMs !== snapshot.deadlineUnixMs
        || result.maxChunkBytes !== snapshot.maxChunkBytes) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      const handle = register(result.handle, {
        kind: 'SOURCE_READ',
        state: 'OPEN',
        contentDigest: result.contentDigest,
        stagingIdentityDigest: null,
        sourceIdentityDigest: result.sourceObjectIdentityDigest,
        totalBytes: result.totalBytes,
        deadlineUnixMs: result.deadlineUnixMs,
        maxChunkBytes: result.maxChunkBytes,
        observedBytes: 0,
        chunkCount: 0,
      });
      return objectFreeze({ ...result, handle });
    },
    nextSourceChunk: (sourceRead, cancelState = 'ACTIVE') => {
      const record = requireHandle(sourceRead, ['SOURCE_READ'], ['OPEN']);
      if ((cancelState !== 'ACTIVE' && cancelState !== 'CANCELLED')
        || record.totalBytes === null || record.maxChunkBytes === null) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      if (record.observedBytes === record.totalBytes && record.chunkCount !== 0) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
      }
      let result: ExecAuthorityNativeEffectSourceChunk;
      try {
        result = invokeRawEffect<ExecAuthorityNativeEffectSourceChunk>(
          effect,
          'next-source-chunk',
          [sourceRead, cancelState],
        );
      } catch (error) {
        if (admittedNativeErrorCode(error) !== 'E_EXEC_AUTH_EFFECT_CANCELLED') {
          replaceRecord(sourceRead, record, 'FAILED');
        }
        throw error;
      }
      const zeroLengthAllowed = record.totalBytes === 0 && record.chunkCount === 0;
      if (result.index !== record.chunkCount
        || result.byteOffset !== record.observedBytes
        || result.byteLength !== result.bytes.byteLength
        || result.byteLength > record.maxChunkBytes
        || (result.byteLength === 0 && !zeroLengthAllowed)
        || result.observedBytes !== record.observedBytes + result.byteLength
        || result.observedBytes > record.totalBytes) {
        replaceRecord(sourceRead, record, 'FAILED');
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      reflectApply(weakMapSet, records, [sourceRead, objectFreeze({
        ...record,
        observedBytes: result.observedBytes,
        chunkCount: record.chunkCount + 1,
      })]);
      return result;
    },
    finishSourceRead: sourceRead => {
      const record = requireHandle(sourceRead, ['SOURCE_READ'], ['OPEN']);
      if (record.totalBytes === null || record.observedBytes !== record.totalBytes
        || record.chunkCount === 0) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
      let result: ExecAuthorityNativeEffectSourceVerified;
      try {
        result = invokeRawEffect<ExecAuthorityNativeEffectSourceVerified>(
          effect,
          'finish-source-read',
          [sourceRead],
        );
      } catch (error) {
        replaceRecord(sourceRead, record, 'FAILED');
        throw error;
      }
      if (result.chunkCount !== record.chunkCount
        || result.observedBytes !== record.observedBytes
        || result.contentDigest !== record.contentDigest
        || result.sourceObjectIdentityDigest !== record.sourceIdentityDigest) {
        replaceRecord(sourceRead, record, 'FAILED');
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      replaceRecord(sourceRead, record, 'VERIFIED');
      return result;
    },
    beginStage: (stagingRoot, totalBytes, contentDigest) => {
      requireHandle(stagingRoot, ['STAGING'], ['OPEN']);
      if (!isSafeNonNegativeInteger(totalBytes) || totalBytes > 17_179_869_184
        || !isEffectDigest(contentDigest)) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      const result = invokeRawEffect<ExecAuthorityNativeEffectStageOpen>(
        effect,
        'begin-stage',
        [stagingRoot, totalBytes, contentDigest],
      );
      if (result.totalBytes !== totalBytes || result.contentDigest !== contentDigest) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      const handle = register(result.handle, {
        kind: 'STAGED_CONTENT',
        state: 'OPEN',
        contentDigest,
        stagingIdentityDigest: result.nativeStagingObjectIdentityDigest,
        sourceIdentityDigest: null,
        totalBytes,
        deadlineUnixMs: null,
        maxChunkBytes: null,
        observedBytes: 0,
        chunkCount: 0,
      });
      return objectFreeze({ ...result, handle });
    },
    appendStage: (stagedContent, bytes) => {
      requireHandle(stagedContent, ['STAGED_CONTENT'], ['OPEN']);
      const snapshot = snapshotExactBytes(bytes);
      if (snapshot === null || snapshot.byteLength > 67_108_864) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invokeRawEffect<ExecAuthorityNativeEffectStageAppend>(
        effect,
        'append-stage',
        [stagedContent, snapshot],
      );
    },
    sealStage: stagedContent => {
      const record = requireHandle(stagedContent, ['STAGED_CONTENT'], ['OPEN']);
      const result = invokeRawEffect<ExecAuthorityNativeEffectStageSealed>(
        effect,
        'seal-stage',
        [stagedContent],
      );
      if (result.contentDigest !== record.contentDigest
        || result.nativeStagingObjectIdentityDigest !== record.stagingIdentityDigest) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      replaceRecord(stagedContent, record, 'SEALED');
      return result;
    },
    applyOperation: (projectRoot, operationEnvelope, stagedContent = null) => {
      requireHandle(projectRoot, ['PROJECT'], ['OPEN']);
      if (stagedContent !== null) {
        requireHandle(stagedContent, ['STAGED_CONTENT'], ['SEALED']);
      }
      const snapshot = snapshotExactBytes(operationEnvelope);
      const expectedDigest = snapshot === null ? null : effectEnvelopeOperationDigest(snapshot);
      if (snapshot === null || snapshot.byteLength > 1_048_776 || expectedDigest === null) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      const result = invokeRawEffect<ExecAuthorityNativeEffectMutation>(
        effect,
        'apply-operation',
        [projectRoot, snapshot, stagedContent],
      );
      if (result.operationDigest !== expectedDigest) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      return result;
    },
    reconcileOperation: (projectRoot, operationEnvelope, stagedContent = null) => {
      requireHandle(projectRoot, ['PROJECT'], ['OPEN']);
      if (stagedContent !== null) {
        requireHandle(stagedContent, ['STAGED_CONTENT'], ['SEALED']);
      }
      const snapshot = snapshotExactBytes(operationEnvelope);
      const expectedDigest = snapshot === null ? null : effectEnvelopeOperationDigest(snapshot);
      if (snapshot === null || snapshot.byteLength > 1_048_776 || expectedDigest === null) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      const result = invokeRawEffect<ExecAuthorityNativeEffectMutation>(
        effect,
        'reconcile-operation',
        [projectRoot, snapshot, stagedContent],
      );
      if (result.operationDigest !== expectedDigest) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      return result;
    },
    verifyPostimages: (projectRoot, planEnvelope) => {
      requireHandle(projectRoot, ['PROJECT'], ['OPEN']);
      const snapshot = snapshotExactBytes(planEnvelope);
      if (snapshot === null || snapshot.byteLength < 12
        || snapshot.byteLength > 16_777_216) throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      const expectedPlanDigest = `sha256:${createHash('sha256').update(snapshot).digest('hex')}`;
      const result = invokeRawEffect<ExecAuthorityNativeEffectFinalVerification>(
        effect,
        'verify-postimages',
        [projectRoot, snapshot],
      );
      if (result.planDigest !== expectedPlanDigest) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      return result;
    },
    closeHandle: handle => {
      const record = requireHandle(
        handle,
        ['PROJECT', 'WORKSPACE', 'STAGING', 'STAGED_CONTENT', 'SOURCE_READ'],
        ['OPEN', 'SEALED', 'VERIFIED', 'FAILED'],
      );
      try {
        if (effect.closeHandle(handle) !== undefined) {
          throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED');
        }
      } catch (error) {
        throw nativeBoundaryError(
          admittedNativeErrorCode(error) ?? 'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED',
        );
      }
      replaceRecord(handle, record, 'CLOSED');
    },
  };
  return objectFreeze(facade);
}

function validateLoaderState(value: unknown): ExecAuthorityNativeState | null {
  const available = ownData(value, 'available');
  if (available === false) {
    if (!hasExactFrozenDataShape(value, UNAVAILABLE_KEYS)) return null;
    const reason = ownData(value, 'reason');
    if (typeof reason !== 'string'
      || !setContains(
        LOADER_UNAVAILABLE_REASONS,
        reason as ExecAuthorityNativeUnavailableReason,
      )) {
      return null;
    }
    return unavailable(reason as ExecAuthorityNativeUnavailableReason);
  }
  if (available !== true || !hasExactFrozenDataShape(value, AVAILABLE_KEYS)) return null;

  const manifest = validateManifest(ownData(value, 'manifest'));
  const legacyValue = ownData(value, 'legacy');
  const bindingValue = ownData(value, 'binding');
  const custodyValue = ownData(value, 'custody');
  const effectValue = ownData(value, 'effect');
  const legacy = validateFunctions<RawLegacyFacade>(legacyValue, LEGACY_KEYS);
  const custody = validateFunctions<RawCustodyFacade>(custodyValue, CUSTODY_KEYS);
  if (manifest === null || legacy === null || custody === null || bindingValue !== legacyValue) {
    return null;
  }
  let typedEffect: ExecAuthorityNativeEffectFacade | ExecAuthorityNativeEffectUnsupported;
  if (manifest.effectContract.available) {
    const effect = validateFunctions<RawEffectFacade>(effectValue, EFFECT_KEYS);
    if (effect === null) return null;
    typedEffect = createTypedEffectFacade(effect);
  } else {
    if (!hasExactFrozenDataShape(effectValue, EFFECT_UNSUPPORTED_KEYS)
      || ownData(effectValue, 'available') !== false
      || ownData(effectValue, 'reason') !== 'platform-unsupported') return null;
    typedEffect = objectFreeze({ available: false, reason: 'platform-unsupported' });
  }
  const handleRegistry = createHandleRegistry();

  const typedLegacy = objectFreeze<ExecAuthorityNativeLegacyFacade>({
    openDirAt: (parentToken, name) => legacy.openDirAt(parentToken, name) as number,
    closeFd: token => { legacy.closeFd(token); },
    fstatIdentity: token => legacy.fstatIdentity(token) as ExecAuthorityNativeLegacyIdentity,
    readdirFd: token => legacy.readdirFd(token) as string[],
    unlinkAt: (token, name, removeDir) => { legacy.unlinkAt(token, name, removeDir); },
    renameAt: (fromToken, fromName, toToken, toName) => {
      legacy.renameAt(fromToken, fromName, toToken, toName);
    },
    mountIdentity: token => legacy.mountIdentity(token) as ExecAuthorityNativeLegacyMountIdentity,
    fdPath: token => legacy.fdPath(token) as string,
    hostBootIdentity: () => legacy.hostBootIdentity() as ExecAuthorityNativeLegacyHostBootIdentity,
  });
  const typedCustody: ExecAuthorityNativeCustodyFacade = objectFreeze({
    invoke: <TOperation extends ExecAuthorityNativeCustodyOperation>(
      operation: TOperation,
      input: ExecAuthorityNativeCustodyInputByOperation[TOperation],
    ): ExecAuthorityNativeCustodyResultByOperation[TOperation] => {
      const validatedInput = validateCustodyInput(operation, input);
      if (validatedInput === null) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      const effectInput = validatedInput as ExecAuthorityNativeCustodyInputByOperation[
        ExecAuthorityNativeCustodyOperation
      ];
      let context: CustodyInvocationContext;
      try {
        context = preflightCustodyInvocation(
          custody,
          handleRegistry,
          operation,
          effectInput,
        );
      } catch (error) {
        throw nativeBoundaryError(
          admittedNativeErrorCode(error) ?? 'E_EXEC_AUTH_NATIVE_BACKEND_ABI',
        );
      }
      let transportValue: unknown;
      let rawResult: unknown;
      try {
        transportValue = invokeNaturalCustodyOperation(custody, operation, effectInput);
      } catch (error) {
        const nativeCode = admittedNativeErrorCode(error);
        const genericUncertainty = nativeCode === null
          || setContains(GENERIC_NATIVE_UNCERTAINTY_CODES, nativeCode);
        if (!genericUncertainty) {
          if ((nativeCode === 'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED'
              || nativeCode === 'E_EXEC_AUTH_NATIVE_HANDLE_STALE')
            && context.inputHandle !== null
            && context.inputRecord !== null) {
            replaceHandleRecord(
              handleRegistry,
              context.inputHandle,
              context.inputRecord,
              'CONSUMED',
            );
          }
          if (operation === 'begin-publication'
            && nativeCode === 'E_EXEC_AUTH_NATIVE_CREATE_UNCONFIRMED') {
            throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED');
          }
          if (operation === 'append-publication'
            && nativeCode === 'E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED') {
            terminalizeUncertainOperation(
              custody,
              handleRegistry,
              operation,
              null,
              context,
            );
          } else if ((operation === 'seal-publication'
              && (nativeCode === 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED'
                || nativeCode === 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED'))
            || (operation === 'abort-publication'
              && nativeCode === 'E_EXEC_AUTH_NATIVE_CLEANUP_UNCONFIRMED')) {
            terminalizeUncertainOperation(
              custody,
              handleRegistry,
              operation,
              null,
              context,
            );
            if (operation === 'seal-publication') {
              throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED');
            }
          }
          throw nativeBoundaryError(nativeCode);
        }
        const cleanupConfirmed = terminalizeUncertainOperation(
          custody,
          handleRegistry,
          operation,
          null,
          context,
        );
        const effectCode = uncertainEffectErrorCode(
          operation,
          effectInput,
          cleanupConfirmed,
          null,
          false,
        );
        if (effectCode !== null) throw nativeBoundaryError(effectCode);
        throw nativeBoundaryError(nativeCode ?? 'E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      const transport = validateRawCustodyTransport(transportValue);
      rawResult = transport?.value ?? null;
      let validatedResult: ExecAuthorityNativeCustodyResult | null;
      try {
        validatedResult = transport?.accepted === true
          ? validateCustodyResult(
            custody,
            operation,
            rawResult,
            effectInput,
            context,
          )
          : null;
        if (validatedResult !== null
          && !admitCustodyResult(
            custody,
            handleRegistry,
            operation,
            validatedResult,
            context,
          )) {
          validatedResult = null;
        }
      } catch (error) {
        const nativeCode = admittedNativeErrorCode(error);
        const cleanupConfirmed = terminalizeUncertainOperation(
          custody,
          handleRegistry,
          operation,
          rawResult,
          context,
        );
        const effectCode = uncertainEffectErrorCode(
          operation,
          effectInput,
          cleanupConfirmed,
          rawResult,
          true,
        );
        if (effectCode !== null) throw nativeBoundaryError(effectCode);
        throw nativeBoundaryError(nativeCode ?? 'E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      if (validatedResult === null) {
        const cleanupConfirmed = terminalizeUncertainOperation(
          custody,
          handleRegistry,
          operation,
          rawResult,
          context,
        );
        const effectCode = uncertainEffectErrorCode(
          operation,
          effectInput,
          cleanupConfirmed,
          rawResult,
          true,
        );
        throw nativeBoundaryError(effectCode ?? 'E_EXEC_AUTH_NATIVE_BACKEND_ABI');
      }
      return validatedResult as unknown as ExecAuthorityNativeCustodyResultByOperation[TOperation];
    },
    consumeSealReconciliation: (
      publication: ExecAuthorityNativeCustodyHandle,
    ): ExecAuthorityNativeSealReconciliation => {
      if (!hasOpaqueHandleShape(publication)) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FORGED');
      }
      const record = registeredHandleRecord(handleRegistry, publication);
      if (record === null) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN');
      }
      if (record.kind !== 'PUBLICATION'
        || (record.state !== 'PUBLISHED_UNCONFIRMED' && record.state !== 'CONSUMED')) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
      }
      const retained = record.retainedSealAuthority;
      if (retained === null
        || retained.sourceGeneration !== record.logicalGeneration) {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
      }
      let authorityKind: 'PUBLICATION' | 'READ_FILE';
      let authorityHandle: ExecAuthorityNativeCustodyHandle;
      let authorityIdentity: ExecAuthorityNativeIdentity;
      if (record.state === 'CONSUMED') {
        if (retained.replacementHandle === null
          || retained.replacementIdentity === null) {
          throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED');
        }
        const replacement = registeredHandleRecord(
          handleRegistry,
          retained.replacementHandle,
        );
        if (replacement === null
          || replacement.kind !== 'READ_FILE'
          || replacement.state !== 'OPEN'
          || replacement.provenance.operation !== 'seal-reconciliation'
          || replacement.provenance.parentGeneration
            !== record.logicalGeneration
          || !sameIdentity(replacement.identity, retained.replacementIdentity)) {
          throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
        }
        const inspectedReplacement = inspectOpaqueHandle(
          custody,
          retained.replacementHandle,
        );
        if (inspectedReplacement.state !== 'LIVE'
          || !sameIdentity(
            retained.replacementIdentity,
            inspectedReplacement.identity,
          )) {
          throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
        }
        authorityKind = 'READ_FILE';
        authorityHandle = retained.replacementHandle;
        authorityIdentity = inspectedReplacement.identity;
      } else {
        if (retained.replacementHandle !== null
          || retained.replacementIdentity !== null) {
          throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
        }
        const inspected = inspectOpaqueHandle(custody, publication);
        if (inspected.state !== 'LIVE'
          || !sameStableObjectIdentity(record.identity, inspected.identity)) {
          throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
        }
        authorityKind = 'PUBLICATION';
        authorityHandle = publication;
        authorityIdentity = inspected.identity;
      }
      const receipt = objectFreeze<ExecAuthorityNativeSealReconciliation>({
        schemaVersion: 1,
        kind: 'custody-seal-reconciliation',
        outcome: retained.outcome,
        publicationState: record.state,
        sourceGeneration: retained.sourceGeneration,
        authorityKind,
        authorityHandle,
        identity: authorityIdentity,
      });
      replaceHandleRecord(
        handleRegistry,
        publication,
        record,
        record.state,
        record.identity,
        null,
      );
      return receipt;
    },
    closeHandle: (handle: ExecAuthorityNativeCustodyHandle): void => {
      const record = requireRegisteredHandle(
        handleRegistry,
        handle,
        ['ROOT_DIRECTORY', 'DIRECTORY', 'READ_FILE', 'PUBLICATION'],
        0,
        ['OPEN', 'APPEND_FAILED', 'PUBLISHED_UNCONFIRMED', 'CLEANUP_UNCONFIRMED'],
      );
      if (record.state === 'CLEANUP_UNCONFIRMED') {
        throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED');
      }
      try {
        if (custody.closeHandle(handle) !== undefined) {
          throw nativeBoundaryError('E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED');
        }
        replaceHandleRecord(handleRegistry, handle, record, 'CONSUMED');
      } catch (error) {
        const code = admittedNativeErrorCode(error);
        if ((code === 'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED'
            || code === 'E_EXEC_AUTH_NATIVE_HANDLE_STALE')) {
          replaceHandleRecord(handleRegistry, handle, record, 'CONSUMED');
          throw nativeBoundaryError(code);
        }
        if (code !== null
          && code !== 'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED'
          && !setContains(GENERIC_NATIVE_UNCERTAINTY_CODES, code)) {
          throw nativeBoundaryError(code);
        }
        replaceHandleRecord(
          handleRegistry,
          handle,
          record,
          'CLEANUP_UNCONFIRMED',
        );
        throw nativeBoundaryError(
          'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED',
        );
      }
    },
  });
  return objectFreeze({
    available: true as const,
    manifest,
    legacy: typedLegacy,
    binding: typedLegacy,
    custody: typedCustody,
    effect: typedEffect,
  });
}

function loadNativeLoaderModule(): RawLoaderModule | null {
  let value: unknown;
  try {
    value = nativeLoaderRequire(NATIVE_LOADER_MODULE);
  } catch {
    return null;
  }
  const load = ownData(value, 'loadExecAuthorityNative');
  if (typeof load !== 'function') return null;
  return objectFreeze({
    loadExecAuthorityNative: load as () => unknown,
  });
}

/** Synchronously resolves the validated native package facade under Node 24+. */
export function loadExecAuthorityNative(): ExecAuthorityNativeState {
  if (memoizedState !== null) return memoizedState;

  const nodeMajor = numberParseInt(process.versions.node.split('.')[0] ?? '', 10);
  if (!numberIsSafeInteger(nodeMajor) || nodeMajor < MINIMUM_NODE_MAJOR) {
    memoizedState = unavailable('node-runtime-unsupported');
    return memoizedState;
  }

  const loader = loadNativeLoaderModule();
  if (loader === null) {
    memoizedState = unavailable('loader-module-unavailable');
    return memoizedState;
  }
  let loaded: unknown;
  try {
    loaded = loader.loadExecAuthorityNative();
  } catch {
    memoizedState = unavailable('loader-contract-mismatch');
    return memoizedState;
  }
  memoizedState = validateLoaderState(loaded)
    ?? unavailable('loader-contract-mismatch');
  return memoizedState;
}
