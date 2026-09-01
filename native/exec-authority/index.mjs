// @deckent/exec-authority-native loader (W3-PR-A).
//
// FAIL-CLOSED CONTRACT: when the compiled binding is absent or unloadable this
// module returns a typed `{ available: false, reason }` — it never substitutes
// path-based I/O and consumers must treat absence exactly like today's
// `secure-open-unsupported` boundary (D3, owner-approved 2026-08-05).

import { createHash, randomBytes } from 'node:crypto';
import { Buffer as NodeBuffer } from 'node:buffer';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { types as nodeTypes } from 'node:util';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIsFrozen = Object.isFrozen;
const arrayIsArray = Array.isArray;
const arraySort = Array.prototype.sort;
const numberIsSafeInteger = Number.isSafeInteger;
const numberParseInt = Number.parseInt;
const stringIncludes = String.prototype.includes;
const stringSlice = String.prototype.slice;
const bufferByteLength = NodeBuffer.byteLength;
const setHas = Set.prototype.has;
const reflectApply = Reflect.apply;
const reflectDeleteProperty = Reflect.deleteProperty;
const reflectOwnKeys = Reflect.ownKeys;
const isProxyObject = nodeTypes.isProxy;
const TrustedArrayBuffer = ArrayBuffer;
const TrustedUint8Array = Uint8Array;
const trustedObjectPrototype = Object.prototype;
const trustedArrayBufferPrototype = TrustedArrayBuffer.prototype;
const trustedUint8ArrayPrototype = TrustedUint8Array.prototype;
const trustedTypedArrayPrototype = objectGetPrototypeOf(trustedUint8ArrayPrototype);
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
const TrustedError = Error;

function listSome(values, predicate) {
  for (let index = 0; index < values.length; index += 1) {
    if (predicate(values[index], index)) return true;
  }
  return false;
}

function listEvery(values, predicate) {
  return !listSome(values, (value, index) => !predicate(value, index));
}

function setContains(values, expected) {
  return reflectApply(setHas, values, [expected]);
}

const BINARY_FILE = 'exec_authority.node';
const ARTIFACT_FILE = 'artifact.json';
const RELEASE_DIRECTORY = join(HERE, 'build', 'Release');
const DEBUG_DIRECTORY = join(HERE, 'build', 'Debug');
const PACKAGE_JSON = join(HERE, 'package.json');
const ROOT_PACKAGE_JSON = join(HERE, '..', '..', 'package.json');
const MAX_ARTIFACT_BYTES = 16 * 1024;
const MAX_BINARY_BYTES = 128 * 1024 * 1024;
const ARTIFACT_SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const OPEN_READ_FLAGS = fsConstants.O_RDONLY
  | (fsConstants.O_CLOEXEC ?? 0)
  | (fsConstants.O_NOFOLLOW ?? 0);
const OPEN_DIRECTORY_FLAGS = OPEN_READ_FLAGS | (fsConstants.O_DIRECTORY ?? 0);
const OPEN_SNAPSHOT_WRITE_FLAGS = fsConstants.O_RDWR
  | fsConstants.O_CREAT
  | fsConstants.O_EXCL
  | (fsConstants.O_CLOEXEC ?? 0)
  | (fsConstants.O_NOFOLLOW ?? 0);

const EXPECTED_ABI = Object.freeze({
  schemaVersion: 1,
  abiName: 'deckent.exec-authority',
  abiVersion: '1.0.0',
  napiVersion: 8,
  packageName: '@deckent/exec-authority-native',
  handleAbi: 'deckent.exec-authority.opaque-generation.v1',
  buildType: 'Release',
});
const EXPECTED_EFFECT_ABI = Object.freeze({
  schemaVersion: 1,
  abiName: 'deckent.execution-effect',
  abiVersion: '2.1.0',
  handleAbi: 'deckent.execution-effect.opaque-generation.v2',
  trustDomain: 'execution-effect-linux-v1',
});
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
]);

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

const EXPECTED_MANIFEST_KEYS = Object.freeze([
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

const EXPECTED_ARTIFACT_KEYS = Object.freeze([
  'abiName',
  'abiVersion',
  'arch',
  'binaryByteLength',
  'binaryFile',
  'binarySha256',
  'buildType',
  'handleAbi',
  'kind',
  'napiVersion',
  'nativeSourceTreeSha256',
  'packageName',
  'packageVersion',
  'platform',
  'rootPackageName',
  'rootPackageVersion',
  'schemaVersion',
]);

const ALLOWED_FEATURES = new Set([
  'custody-posix-v1',
  'custody-win32-v1',
  'execution-effect-linux-v1',
  'legacy-posix-fd-v1',
]);
const LINUX_FEATURES = Object.freeze([
  'custody-posix-v1',
  'execution-effect-linux-v1',
  'legacy-posix-fd-v1',
]);
const DARWIN_FEATURES = Object.freeze([
  'custody-posix-v1',
  'legacy-posix-fd-v1',
]);
const WIN32_FEATURES = Object.freeze(['custody-win32-v1']);

const ALLOWED_NATIVE_ERROR_CODES = new Set([
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

const UNAVAILABLE_REASONS = new Set([
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

const CUSTODY_FACADE_KEYS = Object.freeze([
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
  'sealPublication',
  'sync',
]);
const EFFECT_FACADE_KEYS = Object.freeze([
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
const EFFECT_UNAVAILABLE_KEYS = Object.freeze(['available', 'reason']);
const EFFECT_CONTRACT_KEYS = Object.freeze([
  'abiName',
  'abiVersion',
  'available',
  'handleAbi',
  'operations',
  'schemaVersion',
  'trustDomain',
]);
const EFFECT_ROOT_RESULT_KEYS = Object.freeze([
  'handle', 'identityDigest', 'kind', 'rootKind', 'schemaVersion', 'state',
]);
const EFFECT_STAGE_OPEN_KEYS = Object.freeze([
  'contentDigest', 'handle', 'kind', 'nativeStagingObjectIdentityDigest',
  'schemaVersion', 'state', 'totalBytes',
]);
const EFFECT_STAGE_APPEND_KEYS = Object.freeze([
  'kind', 'observedBytes', 'schemaVersion', 'state',
]);
const EFFECT_STAGE_SEAL_KEYS = Object.freeze([
  'contentDigest', 'kind', 'nativeStagingObjectIdentityDigest',
  'schemaVersion', 'state',
]);
const EFFECT_INSPECTION_KEYS = Object.freeze([
  'entry', 'kind', 'schemaVersion', 'state',
]);
const EFFECT_ENTRY_KEYS = Object.freeze([
  'contentDigest', 'kind', 'mode', 'objectIdentityDigest', 'path',
  'schemaVersion', 'size',
]);
const EFFECT_MANIFEST_KEYS = Object.freeze([
  'entries', 'entryCount', 'kind', 'manifestDigest', 'schemaVersion', 'state',
  'totalBytes',
]);
const EFFECT_MUTATION_KEYS = Object.freeze([
  'durabilityEvidenceDigest', 'kind', 'operationDigest', 'postimageDigest',
  'schemaVersion', 'state',
]);
const EFFECT_FINAL_VERIFY_KEYS = Object.freeze([
  'kind', 'planDigest', 'postimageSetDigest', 'schemaVersion', 'state',
  'verifiedCount',
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
const CUSTODY_IDENTITY_KEYS = Object.freeze([
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
const CUSTODY_OPEN_RESULT_KEYS = Object.freeze([
  'handle',
  'identity',
  'kind',
  'schemaVersion',
  'state',
]);
const CUSTODY_PROBE_RESULT_KEYS = Object.freeze([
  'available',
  'featureEvidenceBits',
  'identity',
  'kind',
  'platform',
  'schemaVersion',
]);
const CUSTODY_ROOT_SEPARATION_RESULT_KEYS = Object.freeze([
  'custodyIdentity',
  'featureEvidenceBits',
  'kind',
  'projectIdentity',
  'schemaVersion',
  'state',
]);
const CUSTODY_APPEND_RESULT_KEYS = Object.freeze([
  'byteLength',
  'kind',
  'schemaVersion',
  'state',
]);
const CUSTODY_READ_RESULT_KEYS = Object.freeze([
  'after',
  'before',
  'bytes',
  'eof',
  'kind',
  'observedBytes',
  'requestedMaxBytes',
  'schemaVersion',
]);
const CUSTODY_DIRECTORY_SCAN_RESULT_KEYS = Object.freeze([
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
const CUSTODY_EVIDENCE_RESULT_KEYS = Object.freeze([
  'featureEvidenceBits',
  'kind',
  'operation',
  'schemaVersion',
  'state',
]);
const CUSTODY_PUBLICATION_RESULT_KEYS = Object.freeze([
  'featureEvidenceBits',
  'identity',
  'kind',
  'readHandle',
  'reasonCode',
  'schemaVersion',
  'state',
]);
const CUSTODY_CLEANUP_RESULT_KEYS = Object.freeze([
  'kind',
  'reasonCode',
  'schemaVersion',
  'state',
]);
const CUSTODY_REASON_CODES = new Set([
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
const CUSTODY_VOLUME_CAPABILITIES = new Set([
  'ANONYMOUS_TEMPFILE',
  'DIRECTORY_DURABILITY',
  'HARD_LINKS',
  'NO_REPLACE_PUBLISH',
  'PERSISTENT_ACL',
  'REMOTE',
  'REPARSE_POINTS',
  'STABLE_OBJECT_ID',
]);
const CUSTODY_EVIDENCE_COMPONENT_NOFOLLOW = 1 << 0;
const CUSTODY_EVIDENCE_OWNER_PRIVATE = 1 << 1;
const CUSTODY_EVIDENCE_ANONYMOUS_TEMPFILE = 1 << 2;
const CUSTODY_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH = 1 << 3;
const CUSTODY_EVIDENCE_FILE_DURABILITY = 1 << 4;
const CUSTODY_EVIDENCE_DIRECTORY_DURABILITY = 1 << 5;
const CUSTODY_EVIDENCE_BOUNDED_READ = 1 << 7;
const CUSTODY_EVIDENCE_PUBLISH_AT_EMPTY_PATH = 1 << 8;
const CUSTODY_EVIDENCE_PUBLISH_PROC_FD_ALIAS = 1 << 9;
const CUSTODY_EVIDENCE_OBJECT_TYPE = 1 << 10;
const CUSTODY_EVIDENCE_LINK_COUNT = 1 << 11;
const CUSTODY_EVIDENCE_SIZE = 1 << 12;
const CUSTODY_EVIDENCE_OWNER_IDENTITY = 1 << 13;
const CUSTODY_EVIDENCE_DACL_PRESENT = 1 << 14;
const CUSTODY_EVIDENCE_DACL_PROTECTED = 1 << 15;
const CUSTODY_EVIDENCE_DACL_EXACT_OWNER_ONLY = 1 << 16;
const CUSTODY_EVIDENCE_LOCAL_VOLUME = 1 << 17;
const CUSTODY_EVIDENCE_ROOT_SEPARATION = 1 << 18;
const CUSTODY_KNOWN_EVIDENCE_MASK = 0x0007_ffff;
const CUSTODY_POSIX_ONLY_EVIDENCE_MASK = CUSTODY_EVIDENCE_ANONYMOUS_TEMPFILE
  | CUSTODY_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH
  | CUSTODY_EVIDENCE_PUBLISH_AT_EMPTY_PATH
  | CUSTODY_EVIDENCE_PUBLISH_PROC_FD_ALIAS;
const CUSTODY_WIN32_ONLY_EVIDENCE_MASK = CUSTODY_EVIDENCE_DACL_PRESENT
  | CUSTODY_EVIDENCE_DACL_PROTECTED
  | CUSTODY_EVIDENCE_DACL_EXACT_OWNER_ONLY;
const CUSTODY_UINT32_MAX = 4_294_967_295n;
const CUSTODY_UINT64_MAX = 18_446_744_073_709_551_615n;

let memoizedState = null;

function unavailable(reason) {
  const safeReason = setContains(UNAVAILABLE_REASONS, reason)
    ? reason
    : 'binding-contract-mismatch';
  return objectFreeze({ available: false, reason: safeReason });
}

function sortedOwnStringKeys(value) {
  if (value === null || typeof value !== 'object' || isProxyObject(value)) return null;
  const keys = reflectOwnKeys(value);
  if (listSome(keys, key => typeof key !== 'string')) return null;
  return reflectApply(arraySort, keys, []);
}

function hasExactFrozenDataShape(value, expectedKeys) {
  const keys = sortedOwnStringKeys(value);
  if (keys === null
    || keys.length !== expectedKeys.length
    || listSome(keys, (key, index) => key !== expectedKeys[index])
    || !objectIsFrozen(value)) {
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

function ownData(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined;
  }
  if (isProxyObject(value)) return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !objectHasOwn(descriptor, 'value')) return undefined;
  return descriptor.value;
}

function stringContains(value, expected) {
  return reflectApply(stringIncludes, value, [expected]);
}

function utf8ByteLength(value) {
  return reflectApply(bufferByteLength, NodeBuffer, [value, 'utf8']);
}

function hasOpaqueCustodyHandleShape(value) {
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

function trustedTypedArrayNumber(getter, value) {
  if (typeof getter !== 'function') return null;
  try {
    const observed = reflectApply(getter, value, []);
    return numberIsSafeInteger(observed) && observed >= 0 ? observed : null;
  } catch {
    return null;
  }
}

function snapshotCustodyBytes(value) {
  if (value === null || typeof value !== 'object' || isProxyObject(value)) return null;
  try {
    if (objectGetPrototypeOf(value) !== trustedUint8ArrayPrototype
      || typeof typedArrayBufferGetter !== 'function'
      || typeof typedArraySet !== 'function'
      || typeof arrayBufferByteLengthGetter !== 'function'
      || typeof arrayBufferSlice !== 'function') {
      return null;
    }
    const backing = reflectApply(typedArrayBufferGetter, value, []);
    if (backing === null
      || typeof backing !== 'object'
      || objectGetPrototypeOf(backing) !== trustedArrayBufferPrototype) {
      return null;
    }
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
    const clone = new TrustedUint8Array(byteLength);
    reflectApply(typedArraySet, clone, [value, 0]);
    return objectGetPrototypeOf(clone) === trustedUint8ArrayPrototype
      && trustedTypedArrayNumber(typedArrayByteLengthGetter, clone) === byteLength
      ? clone
      : null;
  } catch {
    return null;
  }
}

function isCustodyIngressPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 32767
    && !stringContains(value, '\0')
    && isAbsolute(value);
}

function isCanonicalRootSeparationIngressPath(value) {
  if (!isCustodyIngressPath(value)) return false;
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

function isCanonicalEffectIngressPath(value) {
  if (!isCustodyIngressPath(value) || value[0] !== '/') return false;
  if (value === '/') return true;
  let componentStart = 1;
  for (let index = 1; index <= value.length; index += 1) {
    if (index !== value.length && value[index] !== '/') continue;
    const length = index - componentStart;
    if (length === 0 || length > 4096
      || (length === 1 && value[componentStart] === '.')
      || (length === 2 && value[componentStart] === '.'
        && value[componentStart + 1] === '.')) return false;
    componentStart = index + 1;
  }
  return true;
}

function isCustodyComponent(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 4096
    && value !== '.'
    && value !== '..'
    && !stringContains(value, '\0')
    && !stringContains(value, '/')
    && !stringContains(value, '\\');
}

function isCustodyDisposition(value) {
  return value === 'OPEN_EXISTING' || value === 'CREATE_NEW' || value === 'OPEN_OR_CREATE';
}

function isSafePositiveInteger(value) {
  return numberIsSafeInteger(value) && value > 0;
}

function isSafeNonNegativeInteger(value) {
  return numberIsSafeInteger(value) && value >= 0;
}

function validatedCustodyArguments(operation, args) {
  switch (operation) {
    case 'probe':
    case 'identity':
    case 'apply-private':
    case 'sync':
      return args.length === 1 && hasOpaqueCustodyHandleShape(args[0])
        ? objectFreeze([args[0]])
        : null;
    case 'open-root':
      return args.length === 3
        && isCustodyIngressPath(args[0])
        && isCustodyDisposition(args[1])
        && args[2] === 'OWNER_PRIVATE'
        ? objectFreeze([args[0], args[1], args[2]])
        : null;
    case 'open-directory-at':
      return args.length === 4
        && hasOpaqueCustodyHandleShape(args[0])
        && isCustodyComponent(args[1])
        && isCustodyDisposition(args[2])
        && args[3] === 'OWNER_PRIVATE'
        ? objectFreeze([args[0], args[1], args[2], args[3]])
        : null;
    case 'open-file-at':
      return args.length === 4
        && hasOpaqueCustodyHandleShape(args[0])
        && isCustodyComponent(args[1])
        && args[2] === 'OPEN_EXISTING'
        && args[3] === 'OWNER_PRIVATE'
        ? objectFreeze([args[0], args[1], args[2], args[3]])
        : null;
    case 'begin-publication':
      return args.length === 3
        && hasOpaqueCustodyHandleShape(args[0])
        && isCustodyComponent(args[1])
        && isSafePositiveInteger(args[2])
        ? objectFreeze([args[0], args[1], args[2]])
        : null;
    case 'append-publication': {
      if (args.length !== 2 || !hasOpaqueCustodyHandleShape(args[0])) return null;
      const bytes = snapshotCustodyBytes(args[1]);
      return bytes === null ? null : objectFreeze([args[0], bytes]);
    }
    case 'seal-publication':
    case 'abort-publication':
      return args.length === 1 && hasOpaqueCustodyHandleShape(args[0])
        ? objectFreeze([args[0]])
        : null;
    case 'read-bounded':
      return args.length === 2
        && hasOpaqueCustodyHandleShape(args[0])
        && isSafePositiveInteger(args[1])
        ? objectFreeze([args[0], args[1]])
        : null;
    case 'scan-directory-bounded':
      return args.length === 4
        && hasOpaqueCustodyHandleShape(args[0])
        && isSafePositiveInteger(args[1])
        && args[1] <= 100_000
        && isSafePositiveInteger(args[2])
        && args[2] <= 128
        && isSafePositiveInteger(args[3])
        ? objectFreeze([args[0], args[1], args[2], args[3]])
        : null;
    case 'prove-root-separation':
      return args.length === 2
        && hasOpaqueCustodyHandleShape(args[0])
        && isCanonicalRootSeparationIngressPath(args[1])
        ? objectFreeze([args[0], args[1]])
        : null;
    default:
      return null;
  }
}

function frozenSortedStringArray(value, allow) {
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
  const length = lengthDescriptor.value;
  const keys = reflectOwnKeys(value);
  if (listSome(keys, key => typeof key !== 'string') || keys.length !== length + 1) return null;
  const entries = [];
  let previous = null;
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
      || (allow !== null && !setContains(allow, entry))) {
      return null;
    }
    entries.push(entry);
    previous = entry;
  }
  return objectFreeze(entries);
}

function expectedPlatform() {
  if (process.platform === 'linux'
    || process.platform === 'darwin'
    || process.platform === 'win32') {
    return process.platform;
  }
  return 'unsupported';
}

function expectedArch() {
  if (process.arch === 'x64'
    || process.arch === 'arm64'
    || process.arch === 'ia32'
    || process.arch === 'arm') {
    return process.arch;
  }
  return 'unknown';
}

function expectedFeatures(platform = expectedPlatform()) {
  if (platform === 'linux') return LINUX_FEATURES;
  if (platform === 'darwin') return DARWIN_FEATURES;
  if (platform === 'win32') return WIN32_FEATURES;
  return null;
}

function hasExactDataShape(value, expectedKeys) {
  if (value === null
    || typeof value !== 'object'
    || arrayIsArray(value)
    || isProxyObject(value)) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== trustedObjectPrototype && prototype !== null) return false;
  const keys = sortedOwnStringKeys(value);
  if (keys === null
    || keys.length !== expectedKeys.length
    || listSome(keys, (key, index) => key !== expectedKeys[index])) {
    return false;
  }
  return listEvery(expectedKeys, key => {
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    return descriptor !== undefined
      && objectHasOwn(descriptor, 'value')
      && descriptor.enumerable === true;
  });
}

function isMissingError(error) {
  return ownData(error, 'code') === 'ENOENT';
}

function lstatBigInt(path) {
  return lstatSync(path, { bigint: true });
}

function fstatBigInt(fd) {
  return fstatSync(fd, { bigint: true });
}

function sameStableIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.gid === right.gid
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.gid === right.gid
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function samePinnedParent(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid;
}

function isBoundedRegularFile(stat, maximumBytes) {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1n
    && stat.size > 0n
    && stat.size <= BigInt(maximumBytes)
    && stat.size <= BigInt(Number.MAX_SAFE_INTEGER);
}

function readExactAt(fd, byteLength) {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) return null;
  const bytes = Buffer.alloc(byteLength);
  let offset = 0;
  while (offset < byteLength) {
    let observed;
    try {
      observed = readSync(fd, bytes, offset, byteLength - offset, offset);
    } catch (error) {
      if (ownData(error, 'code') === 'EINTR') continue;
      return null;
    }
    if (!Number.isSafeInteger(observed) || observed <= 0) return null;
    offset += observed;
  }
  const eofProbe = Buffer.alloc(1);
  try {
    return readSync(fd, eofProbe, 0, 1, byteLength) === 0 ? bytes : null;
  } catch {
    return null;
  }
}

function closeConfirmed(fd) {
  try {
    closeSync(fd);
    return true;
  } catch {
    // close(2) failure leaves descriptor ownership ambiguous; never retry it.
    return false;
  }
}

function isTrustedOriginDirectory(stat, ownerUid) {
  // The origin policy excludes other OS principals. The current effective UID
  // and uid 0 are the explicit trusted mutation boundary for this loader.
  if (!stat.isDirectory()
    || stat.isSymbolicLink()
    || (stat.uid !== ownerUid && stat.uid !== 0n)) {
    return false;
  }
  const mode = modeBits(stat);
  return (mode & 0o022n) === 0n
    || (stat.uid === 0n && (mode & 0o1000n) !== 0n);
}

function isTrustedOriginLeaf(stat, ownerUid, maximumBytes) {
  return isBoundedRegularFile(stat, maximumBytes)
    && (stat.uid === ownerUid || stat.uid === 0n)
    && (modeBits(stat) & 0o022n) === 0n;
}

function invalidOriginDirectory(present) {
  return objectFreeze({
    chain: Object.freeze([]),
    fd: null,
    identity: null,
    path: null,
    present,
    trusted: false,
  });
}

function inspectOriginDirectory(directoryPath, ownerUid) {
  if (!isAbsolute(directoryPath)
    || directoryPath !== resolve(directoryPath)
    || directoryPath === '/') {
    return invalidOriginDirectory(true);
  }

  const chain = [];
  let currentPath = '/';
  try {
    const rootStat = lstatBigInt(currentPath);
    if (!isTrustedOriginDirectory(rootStat, ownerUid)) {
      return invalidOriginDirectory(true);
    }
    chain.push(Object.freeze({ identity: rootStat, path: currentPath }));
  } catch {
    return invalidOriginDirectory(true);
  }
  const components = directoryPath.split('/').filter(component => component.length > 0);
  for (const component of components) {
    currentPath = join(currentPath, component);
    let stat;
    try {
      stat = lstatBigInt(currentPath);
    } catch (error) {
      if (isMissingError(error)) {
        return Object.freeze({
          chain: Object.freeze(chain),
          fd: null,
          identity: null,
          path: directoryPath,
          present: false,
          trusted: true,
        });
      }
      return invalidOriginDirectory(true);
    }
    if (!isTrustedOriginDirectory(stat, ownerUid)) {
      return invalidOriginDirectory(true);
    }
    chain.push(Object.freeze({ identity: stat, path: currentPath }));
  }

  let fd;
  try {
    if (realpathSync.native(directoryPath) !== directoryPath) {
      return invalidOriginDirectory(true);
    }
    fd = openSync(directoryPath, OPEN_DIRECTORY_FLAGS);
    const descriptor = fstatBigInt(fd);
    const pathStat = lstatBigInt(directoryPath);
    const last = chain.at(-1)?.identity;
    if (last === undefined
      || !isTrustedOriginDirectory(descriptor, ownerUid)
      || !isTrustedOriginDirectory(pathStat, ownerUid)
      || !sameDirectoryIdentity(last, descriptor)
      || !sameDirectoryIdentity(descriptor, pathStat)) {
      closeConfirmed(fd);
      return invalidOriginDirectory(true);
    }
    return Object.freeze({
      chain: Object.freeze(chain),
      fd,
      identity: descriptor,
      path: directoryPath,
      present: true,
      trusted: true,
    });
  } catch {
    if (fd !== undefined) closeConfirmed(fd);
    return invalidOriginDirectory(true);
  }
}

function verifyOriginDirectory(origin, ownerUid) {
  if (!origin.trusted || origin.path === null) return false;
  try {
    for (const entry of origin.chain) {
      const current = lstatBigInt(entry.path);
      if (!isTrustedOriginDirectory(current, ownerUid)
        || !samePinnedParent(entry.identity, current)) {
        return false;
      }
    }
    if (!origin.present) return pathConfirmedAbsent(origin.path);
    if (origin.fd === null || origin.identity === null) return false;
    const descriptor = fstatBigInt(origin.fd);
    const pathStat = lstatBigInt(origin.path);
    return isTrustedOriginDirectory(descriptor, ownerUid)
      && isTrustedOriginDirectory(pathStat, ownerUid)
      && sameDirectoryIdentity(origin.identity, descriptor)
      && sameDirectoryIdentity(descriptor, pathStat)
      && realpathSync.native(origin.path) === origin.path;
  } catch {
    return false;
  }
}

function inspectLeafInOrigin(path, maximumBytes, origin, ownerUid) {
  if (!origin.present
    || origin.fd === null
    || origin.path === null
    || dirname(path) !== origin.path
    || !verifyOriginDirectory(origin, ownerUid)) {
    return Object.freeze({ present: true, valid: false, bytes: null });
  }
  let pathBefore;
  try {
    pathBefore = lstatBigInt(path);
  } catch (error) {
    if (isMissingError(error)) {
      return Object.freeze({ present: false, valid: false, bytes: null });
    }
    return Object.freeze({ present: true, valid: false, bytes: null });
  }
  if (!isTrustedOriginLeaf(pathBefore, ownerUid, maximumBytes)) {
    return Object.freeze({ present: true, valid: false, bytes: null });
  }

  let fd;
  try {
    fd = openSync(path, OPEN_READ_FLAGS);
  } catch {
    return Object.freeze({ present: true, valid: false, bytes: null });
  }

  let bytes = null;
  let stable = false;
  try {
    const descriptorBefore = fstatBigInt(fd);
    if (isTrustedOriginLeaf(descriptorBefore, ownerUid, maximumBytes)
      && sameStableIdentity(pathBefore, descriptorBefore)) {
      bytes = readExactAt(fd, Number(descriptorBefore.size));
      const descriptorAfter = fstatBigInt(fd);
      const pathAfter = lstatBigInt(path);
      stable = bytes !== null
        && bytes.byteLength === Number(descriptorBefore.size)
        && isTrustedOriginLeaf(descriptorAfter, ownerUid, maximumBytes)
        && isTrustedOriginLeaf(pathAfter, ownerUid, maximumBytes)
        && sameStableIdentity(descriptorBefore, descriptorAfter)
        && sameStableIdentity(descriptorAfter, pathAfter)
        && verifyOriginDirectory(origin, ownerUid);
    }
  } catch {
    stable = false;
  }
  const closed = closeConfirmed(fd);
  return Object.freeze({
    present: true,
    valid: stable && closed,
    bytes: stable && closed ? bytes : null,
  });
}

function inspectTrustedLeaf(path, maximumBytes, ownerUid) {
  const origin = inspectOriginDirectory(dirname(path), ownerUid);
  if (!origin.trusted) {
    return Object.freeze({ present: true, valid: false, bytes: null });
  }
  if (!origin.present) {
    return Object.freeze({ present: false, valid: false, bytes: null });
  }
  const inspected = inspectLeafInOrigin(path, maximumBytes, origin, ownerUid);
  const originStable = verifyOriginDirectory(origin, ownerUid);
  const originClosed = origin.fd !== null && closeConfirmed(origin.fd);
  if (!originStable || !originClosed) {
    return Object.freeze({ present: inspected.present, valid: false, bytes: null });
  }
  return inspected;
}

function readPackageIdentity(path, expectedName, ownerUid) {
  const inspected = inspectTrustedLeaf(path, MAX_ARTIFACT_BYTES, ownerUid);
  if (!inspected.present || !inspected.valid || inspected.bytes === null) return null;
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inspected.bytes));
    if (value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || nodeTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
      return null;
    }
    const name = ownData(value, 'name');
    const version = ownData(value, 'version');
    if (name !== expectedName
      || typeof version !== 'string'
      || version.length === 0
      || version.length > 128
      || version.includes('\0')) {
      return null;
    }
    return Object.freeze({ name, version });
  } catch {
    return null;
  }
}

function packageIdentity(ownerUid) {
  const nativePackage = readPackageIdentity(PACKAGE_JSON, EXPECTED_ABI.packageName, ownerUid);
  const rootPackage = readPackageIdentity(ROOT_PACKAGE_JSON, 'deckent', ownerUid);
  if (nativePackage === null || rootPackage === null) return null;
  return Object.freeze({
    packageName: nativePackage.name,
    packageVersion: nativePackage.version,
    rootPackageName: rootPackage.name,
    rootPackageVersion: rootPackage.version,
  });
}

function candidateAt(directory) {
  return Object.freeze({
    binaryPath: join(directory, BINARY_FILE),
    artifactPath: join(directory, ARTIFACT_FILE),
  });
}

function inspectCandidate(candidate, ownerUid) {
  const directoryPath = dirname(candidate.artifactPath);
  if (dirname(candidate.binaryPath) !== directoryPath) {
    const invalid = Object.freeze({ present: true, valid: false, bytes: null });
    return Object.freeze({ candidate, artifact: invalid, binary: invalid, partial: false, trusted: false });
  }
  const origin = inspectOriginDirectory(directoryPath, ownerUid);
  if (!origin.trusted) {
    const invalid = Object.freeze({ present: true, valid: false, bytes: null });
    return Object.freeze({ candidate, artifact: invalid, binary: invalid, partial: false, trusted: false });
  }
  if (!origin.present) {
    const absent = Object.freeze({ present: false, valid: false, bytes: null });
    return Object.freeze({ candidate, artifact: absent, binary: absent, partial: false, trusted: true });
  }
  const artifact = inspectLeafInOrigin(
    candidate.artifactPath,
    MAX_ARTIFACT_BYTES,
    origin,
    ownerUid,
  );
  const binary = inspectLeafInOrigin(candidate.binaryPath, MAX_BINARY_BYTES, origin, ownerUid);
  const originStable = verifyOriginDirectory(origin, ownerUid);
  const originClosed = origin.fd !== null && closeConfirmed(origin.fd);
  if (!originStable || !originClosed) {
    const invalidArtifact = Object.freeze({
      present: artifact.present,
      valid: false,
      bytes: null,
    });
    const invalidBinary = Object.freeze({
      present: binary.present,
      valid: false,
      bytes: null,
    });
    return Object.freeze({
      candidate,
      artifact: invalidArtifact,
      binary: invalidBinary,
      partial: artifact.present !== binary.present,
      trusted: false,
    });
  }
  const partial = artifact.present !== binary.present;
  return Object.freeze({ candidate, artifact, binary, partial, trusted: true });
}

function validateArtifact(bytes, expectedIdentity) {
  let artifact;
  try {
    artifact = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  const platform = expectedPlatform();
  const arch = expectedArch();
  if (platform === 'unsupported' || arch === 'unknown') return null;
  if (!hasExactDataShape(artifact, EXPECTED_ARTIFACT_KEYS)) return null;
  if (ownData(artifact, 'schemaVersion') !== 1
    || ownData(artifact, 'kind') !== 'deckent-exec-authority-native-artifact'
    || ownData(artifact, 'abiName') !== EXPECTED_ABI.abiName
    || ownData(artifact, 'abiVersion') !== EXPECTED_ABI.abiVersion
    || ownData(artifact, 'handleAbi') !== EXPECTED_ABI.handleAbi
    || ownData(artifact, 'napiVersion') !== EXPECTED_ABI.napiVersion
    || ownData(artifact, 'packageName') !== expectedIdentity.packageName
    || ownData(artifact, 'packageVersion') !== expectedIdentity.packageVersion
    || ownData(artifact, 'rootPackageName') !== expectedIdentity.rootPackageName
    || ownData(artifact, 'rootPackageVersion') !== expectedIdentity.rootPackageVersion
    || ownData(artifact, 'platform') !== platform
    || ownData(artifact, 'arch') !== arch
    || ownData(artifact, 'buildType') !== EXPECTED_ABI.buildType
    || ownData(artifact, 'binaryFile') !== BINARY_FILE) {
    return null;
  }
  const binaryByteLength = ownData(artifact, 'binaryByteLength');
  const binarySha256 = ownData(artifact, 'binarySha256');
  // This source-tree digest is exact build metadata, not a signature or an
  // independent provenance claim. Admission trust comes from the canonical,
  // owner-controlled origin chain plus the artifact-to-binary digest binding.
  const nativeSourceTreeSha256 = ownData(artifact, 'nativeSourceTreeSha256');
  if (!Number.isSafeInteger(binaryByteLength)
    || binaryByteLength <= 0
    || binaryByteLength > MAX_BINARY_BYTES
    || typeof binarySha256 !== 'string'
    || !ARTIFACT_SHA256_RE.test(binarySha256)
    || typeof nativeSourceTreeSha256 !== 'string'
    || !ARTIFACT_SHA256_RE.test(nativeSourceTreeSha256)) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'deckent-exec-authority-native-artifact',
    abiName: EXPECTED_ABI.abiName,
    abiVersion: EXPECTED_ABI.abiVersion,
    handleAbi: EXPECTED_ABI.handleAbi,
    napiVersion: EXPECTED_ABI.napiVersion,
    packageName: expectedIdentity.packageName,
    packageVersion: expectedIdentity.packageVersion,
    rootPackageName: expectedIdentity.rootPackageName,
    rootPackageVersion: expectedIdentity.rootPackageVersion,
    platform,
    arch,
    buildType: EXPECTED_ABI.buildType,
    binaryFile: BINARY_FILE,
    binaryByteLength,
    binarySha256,
    nativeSourceTreeSha256,
  });
}

function validateCandidate(inspected, expectedIdentity) {
  if (!inspected.artifact.valid || !inspected.binary.valid) {
    return Object.freeze({ valid: false, reason: 'binding-artifact-invalid' });
  }
  const artifact = validateArtifact(inspected.artifact.bytes, expectedIdentity);
  if (artifact === null) {
    return Object.freeze({ valid: false, reason: 'binding-artifact-invalid' });
  }
  const binaryBytes = inspected.binary.bytes;
  const digest = `sha256:${createHash('sha256').update(binaryBytes).digest('hex')}`;
  if (binaryBytes.byteLength !== artifact.binaryByteLength
    || digest !== artifact.binarySha256) {
    return Object.freeze({ valid: false, reason: 'binding-artifact-digest-mismatch' });
  }
  return Object.freeze({
    valid: true,
    reason: null,
    artifact,
    binaryBytes,
  });
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function writeExactAt(fd, bytes) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    let observed;
    try {
      observed = writeSync(fd, bytes, offset, bytes.byteLength - offset, offset);
    } catch (error) {
      if (ownData(error, 'code') === 'EINTR') continue;
      return false;
    }
    if (!Number.isSafeInteger(observed) || observed <= 0) return false;
    offset += observed;
  }
  return true;
}

function modeBits(stat) {
  return stat.mode & 0o7777n;
}

function isOwnerPrivateDirectory(stat, ownerUid) {
  return stat.isDirectory()
    && !stat.isSymbolicLink()
    && stat.uid === ownerUid
    && modeBits(stat) === 0o700n;
}

function isOwnerPrivateSnapshotFile(stat, ownerUid, expectedSize) {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1n
    && stat.uid === ownerUid
    && modeBits(stat) === 0o400n
    && stat.size === BigInt(expectedSize);
}

function isExclusiveNewSnapshotFile(stat, ownerUid) {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1n
    && stat.uid === ownerUid
    && modeBits(stat) === 0o600n
    && stat.size === 0n;
}

function isSafeNewSnapshotObject(stat, ownerUid) {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1n
    && stat.uid === ownerUid
    && (modeBits(stat) & 0o022n) === 0n
    && stat.size === 0n;
}

function createdSnapshotIdentity(stat) {
  return Object.freeze({
    dev: stat.dev,
    gid: stat.gid,
    ino: stat.ino,
    nlink: stat.nlink,
    objectType: stat.isFile() && !stat.isSymbolicLink() ? 'REGULAR_FILE' : 'OTHER',
    uid: stat.uid,
  });
}

function sameCreatedSnapshotObject(identity, stat, ownerUid, maximumBytes) {
  return identity.objectType === 'REGULAR_FILE'
    && identity.nlink === 1n
    && identity.uid === ownerUid
    && stat.isFile()
    && !stat.isSymbolicLink()
    && stat.dev === identity.dev
    && stat.ino === identity.ino
    && stat.uid === identity.uid
    && stat.gid === identity.gid
    && stat.nlink === identity.nlink
    && stat.size >= 0n
    && stat.size <= BigInt(maximumBytes)
    && (modeBits(stat) === 0o600n || modeBits(stat) === 0o400n);
}

function isControlledSnapshotParent(stat, ownerUid) {
  if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
  const mode = modeBits(stat);
  const privateOwnerParent = stat.uid === ownerUid && (mode & 0o022n) === 0n;
  const rootStickyParent = stat.uid === 0n && (mode & 0o1000n) !== 0n;
  return privateOwnerParent || rootStickyParent;
}

function directorySyncResult(fd) {
  try {
    fsyncSync(fd);
    return 'confirmed';
  } catch (error) {
    const code = ownData(error, 'code');
    if (code === 'EINVAL' || code === 'ENOTSUP' || code === 'EOPNOTSUPP') {
      return 'unsupported';
    }
    return 'failed';
  }
}

function pathConfirmedAbsent(path) {
  try {
    lstatBigInt(path);
    return false;
  } catch (error) {
    return isMissingError(error);
  }
}

function posixSnapshotPrimitivesAvailable() {
  return (expectedPlatform() === 'linux' || expectedPlatform() === 'darwin')
    && typeof process.geteuid === 'function'
    && typeof fsConstants.O_NOFOLLOW === 'number'
    && fsConstants.O_NOFOLLOW !== 0
    && typeof fsConstants.O_DIRECTORY === 'number'
    && fsConstants.O_DIRECTORY !== 0;
}

function configuredSnapshotParent() {
  try {
    const configured = tmpdir();
    if (typeof configured !== 'string'
      || configured.length === 0
      || configured.length > 4096
      || configured === '/'
      || configured.includes('\0')
      || !isAbsolute(configured)) {
      return null;
    }
    const canonical = resolve(configured);
    if (canonical === '/') return null;
    return realpathSync.native(canonical) === canonical ? canonical : null;
  } catch {
    return null;
  }
}

function emptySnapshotContext() {
  return {
    directoryCreated: false,
    directoryFd: null,
    directoryIdentity: null,
    directoryPath: null,
    directorySync: null,
    fileCreated: false,
    fileCreatedIdentity: null,
    fileCloseUnconfirmed: false,
    fileFd: null,
    fileIdentity: null,
    fileMaximumBytes: null,
    filePath: null,
    ownerUid: null,
    parentFd: null,
    parentIdentity: null,
    parentPath: null,
    parentSync: null,
  };
}

function verifyPinnedParent(context) {
  if (context.parentFd === null
    || context.parentIdentity === null
    || context.parentPath === null
    || context.ownerUid === null) {
    return false;
  }
  try {
    const descriptor = fstatBigInt(context.parentFd);
    const path = lstatBigInt(context.parentPath);
    return isControlledSnapshotParent(descriptor, context.ownerUid)
      && isControlledSnapshotParent(path, context.ownerUid)
      && samePinnedParent(context.parentIdentity, descriptor)
      && samePinnedParent(descriptor, path);
  } catch {
    return false;
  }
}

function verifyPinnedDirectory(context) {
  if (context.directoryFd === null
    || context.directoryIdentity === null
    || context.directoryPath === null
    || context.ownerUid === null) {
    return false;
  }
  try {
    const descriptor = fstatBigInt(context.directoryFd);
    const path = lstatBigInt(context.directoryPath);
    return isOwnerPrivateDirectory(descriptor, context.ownerUid)
      && isOwnerPrivateDirectory(path, context.ownerUid)
      && sameDirectoryIdentity(context.directoryIdentity, descriptor)
      && sameDirectoryIdentity(descriptor, path);
  } catch {
    return false;
  }
}

function verifyPinnedSnapshotFile(context, artifact) {
  if (context.fileFd === null
    || context.fileIdentity === null
    || context.filePath === null
    || context.ownerUid === null) {
    return false;
  }
  try {
    const descriptor = fstatBigInt(context.fileFd);
    const path = lstatBigInt(context.filePath);
    if (!isOwnerPrivateSnapshotFile(descriptor, context.ownerUid, artifact.binaryByteLength)
      || !isOwnerPrivateSnapshotFile(path, context.ownerUid, artifact.binaryByteLength)
      || !sameStableIdentity(context.fileIdentity, descriptor)
      || !sameStableIdentity(descriptor, path)) {
      return false;
    }
    const bytes = readExactAt(context.fileFd, artifact.binaryByteLength);
    return bytes !== null && sha256(bytes) === artifact.binarySha256;
  } catch {
    return false;
  }
}

function preparePosixSnapshot(binaryBytes, artifact) {
  const context = emptySnapshotContext();
  try {
    if (!posixSnapshotPrimitivesAvailable()) return Object.freeze({ context, ready: false });
    const ownerUid = BigInt(process.geteuid());
    const parentPath = configuredSnapshotParent();
    if (parentPath === null) return Object.freeze({ context, ready: false });

    context.ownerUid = ownerUid;
    context.parentPath = parentPath;
    const parentPathBefore = lstatBigInt(parentPath);
    context.parentFd = openSync(parentPath, OPEN_DIRECTORY_FLAGS);
    const parentDescriptor = fstatBigInt(context.parentFd);
    if (!isControlledSnapshotParent(parentPathBefore, ownerUid)
      || !isControlledSnapshotParent(parentDescriptor, ownerUid)
      || !samePinnedParent(parentPathBefore, parentDescriptor)) {
      return Object.freeze({ context, ready: false });
    }

    const randomComponent = randomBytes(16).toString('hex');
    const directoryPrefix = join(
      parentPath,
      `.deckent-exec-authority-${process.pid}-${randomComponent}-`,
    );
    context.directoryPath = mkdtempSync(directoryPrefix);
    context.directoryCreated = true;
    context.directoryFd = openSync(context.directoryPath, OPEN_DIRECTORY_FLAGS);
    fchmodSync(context.directoryFd, 0o700);

    const directoryDescriptor = fstatBigInt(context.directoryFd);
    const directoryPathStat = lstatBigInt(context.directoryPath);
    if (!isOwnerPrivateDirectory(directoryDescriptor, ownerUid)
      || !isOwnerPrivateDirectory(directoryPathStat, ownerUid)
      || !sameDirectoryIdentity(directoryDescriptor, directoryPathStat)) {
      return Object.freeze({ context, ready: false });
    }

    context.filePath = join(context.directoryPath, BINARY_FILE);
    context.fileMaximumBytes = artifact.binaryByteLength;
    context.fileFd = openSync(context.filePath, OPEN_SNAPSHOT_WRITE_FLAGS, 0o600);
    context.fileCreated = true;
    const createdDescriptor = fstatBigInt(context.fileFd);
    if (!isSafeNewSnapshotObject(createdDescriptor, ownerUid)) {
      return Object.freeze({ context, ready: false });
    }
    context.fileCreatedIdentity = createdSnapshotIdentity(createdDescriptor);
    const createdPathStat = lstatBigInt(context.filePath);
    if (!isSafeNewSnapshotObject(createdPathStat, ownerUid)
      || !sameStableIdentity(createdDescriptor, createdPathStat)) {
      return Object.freeze({ context, ready: false });
    }
    fchmodSync(context.fileFd, 0o600);
    const newFileDescriptor = fstatBigInt(context.fileFd);
    const newFilePathStat = lstatBigInt(context.filePath);
    if (!isExclusiveNewSnapshotFile(newFileDescriptor, ownerUid)
      || !isExclusiveNewSnapshotFile(newFilePathStat, ownerUid)
      || !sameCreatedSnapshotObject(
        context.fileCreatedIdentity,
        newFileDescriptor,
        ownerUid,
        artifact.binaryByteLength,
      )
      || !sameStableIdentity(newFileDescriptor, newFilePathStat)) {
      return Object.freeze({ context, ready: false });
    }
    if (!writeExactAt(context.fileFd, binaryBytes)) {
      return Object.freeze({ context, ready: false });
    }
    fsyncSync(context.fileFd);
    fchmodSync(context.fileFd, 0o400);
    fsyncSync(context.fileFd);

    const sealedWriteDescriptor = fstatBigInt(context.fileFd);
    const sealedWritePathStat = lstatBigInt(context.filePath);
    if (!isOwnerPrivateSnapshotFile(
      sealedWriteDescriptor,
      ownerUid,
      artifact.binaryByteLength,
    )
      || !isOwnerPrivateSnapshotFile(
        sealedWritePathStat,
        ownerUid,
        artifact.binaryByteLength,
      )
      || !sameStableIdentity(sealedWriteDescriptor, sealedWritePathStat)) {
      return Object.freeze({ context, ready: false });
    }
    context.fileIdentity = sealedWriteDescriptor;
    if (!closeConfirmed(context.fileFd)) {
      context.fileFd = null;
      context.fileCloseUnconfirmed = true;
      return Object.freeze({ context, ready: false });
    }
    context.fileFd = null;
    context.fileFd = openSync(context.filePath, OPEN_READ_FLAGS);
    const readDescriptor = fstatBigInt(context.fileFd);
    const readPathStat = lstatBigInt(context.filePath);
    if (!isOwnerPrivateSnapshotFile(readDescriptor, ownerUid, artifact.binaryByteLength)
      || !isOwnerPrivateSnapshotFile(readPathStat, ownerUid, artifact.binaryByteLength)
      || !sameStableIdentity(sealedWriteDescriptor, readDescriptor)
      || !sameStableIdentity(readDescriptor, readPathStat)) {
      return Object.freeze({ context, ready: false });
    }

    context.directorySync = directorySyncResult(context.directoryFd);
    context.parentSync = directorySyncResult(context.parentFd);
    if (context.directorySync !== 'confirmed' || context.parentSync !== 'confirmed') {
      return Object.freeze({ context, ready: false });
    }

    const fileDescriptor = fstatBigInt(context.fileFd);
    const filePathStat = lstatBigInt(context.filePath);
    if (!isOwnerPrivateSnapshotFile(fileDescriptor, ownerUid, artifact.binaryByteLength)
      || !isOwnerPrivateSnapshotFile(filePathStat, ownerUid, artifact.binaryByteLength)
      || !sameStableIdentity(fileDescriptor, filePathStat)) {
      return Object.freeze({ context, ready: false });
    }
    const measuredSnapshot = readExactAt(context.fileFd, artifact.binaryByteLength);
    if (measuredSnapshot === null || sha256(measuredSnapshot) !== artifact.binarySha256) {
      return Object.freeze({ context, ready: false });
    }

    context.fileIdentity = fileDescriptor;
    context.directoryIdentity = fstatBigInt(context.directoryFd);
    context.parentIdentity = fstatBigInt(context.parentFd);
    if (!verifyPinnedSnapshotFile(context, artifact)
      || !verifyPinnedDirectory(context)
      || !verifyPinnedParent(context)) {
      return Object.freeze({ context, ready: false });
    }
    return Object.freeze({ context, ready: true });
  } catch {
    return Object.freeze({ context, ready: false });
  }
}

function removableSnapshotFile(context) {
  if (!context.fileCreated
    || context.fileCreatedIdentity === null
    || context.fileFd === null
    || context.filePath === null
    || context.fileMaximumBytes === null
    || context.ownerUid === null) {
    return false;
  }
  try {
    const path = lstatBigInt(context.filePath);
    if (!sameCreatedSnapshotObject(
      context.fileCreatedIdentity,
      path,
      context.ownerUid,
      context.fileMaximumBytes,
    )
      || (context.fileIdentity !== null
        && !sameStableIdentity(context.fileIdentity, path))) {
      return false;
    }
    const descriptor = fstatBigInt(context.fileFd);
    return sameCreatedSnapshotObject(
      context.fileCreatedIdentity,
      descriptor,
      context.ownerUid,
      context.fileMaximumBytes,
    )
      && (context.fileIdentity === null
        || sameStableIdentity(context.fileIdentity, descriptor))
      && sameStableIdentity(descriptor, path);
  } catch {
    return false;
  }
}

function pinSnapshotFileForCleanup(context) {
  if (context.fileFd !== null) return true;
  if (!context.fileCreated
    || context.fileCreatedIdentity === null
    || context.filePath === null
    || context.fileMaximumBytes === null
    || context.ownerUid === null) {
    return false;
  }
  try {
    context.fileFd = openSync(context.filePath, OPEN_READ_FLAGS);
    return true;
  } catch {
    return false;
  }
}

function removableSnapshotDirectory(context) {
  if (!context.directoryCreated
    || context.directoryPath === null
    || context.ownerUid === null) {
    return false;
  }
  try {
    const path = lstatBigInt(context.directoryPath);
    if (!isOwnerPrivateDirectory(path, context.ownerUid)) return false;
    if (context.directoryFd === null) return true;
    const descriptor = fstatBigInt(context.directoryFd);
    return isOwnerPrivateDirectory(descriptor, context.ownerUid)
      && sameDirectoryIdentity(descriptor, path);
  } catch {
    return false;
  }
}

function cleanupPosixSnapshot(context) {
  let confirmed = true;

  if (context.fileCloseUnconfirmed) confirmed = false;

  if (context.fileCreated) {
    if (!pinSnapshotFileForCleanup(context) || !removableSnapshotFile(context)) {
      confirmed = false;
    } else {
      try {
        unlinkSync(context.filePath);
      } catch {
        confirmed = false;
      }
      if (!pathConfirmedAbsent(context.filePath)) confirmed = false;
      if (context.directoryFd === null
        || directorySyncResult(context.directoryFd) !== 'confirmed') {
        confirmed = false;
      }
    }
  }

  if (context.fileFd !== null && !closeConfirmed(context.fileFd)) confirmed = false;

  const mayRemoveDirectory = context.directoryCreated
    ? removableSnapshotDirectory(context)
    : false;
  if (context.directoryFd !== null && !closeConfirmed(context.directoryFd)) confirmed = false;

  if (context.directoryCreated) {
    if (!mayRemoveDirectory) {
      confirmed = false;
    } else {
      try {
        rmdirSync(context.directoryPath);
      } catch {
        confirmed = false;
      }
      if (!pathConfirmedAbsent(context.directoryPath)) confirmed = false;
      if (context.parentFd === null
        || directorySyncResult(context.parentFd) !== 'confirmed') {
        confirmed = false;
      }
    }
  }

  if (context.parentFd !== null && !closeConfirmed(context.parentFd)) confirmed = false;
  return confirmed;
}

function requireCacheEntryAbsent(cacheKey) {
  try {
    return !objectHasOwn(require.cache, cacheKey);
  } catch {
    return false;
  }
}

function evictRequireCacheEntry(cacheKey) {
  try {
    if (objectHasOwn(require.cache, cacheKey)
      && !reflectDeleteProperty(require.cache, cacheKey)) {
      return false;
    }
    return !objectHasOwn(require.cache, cacheKey);
  } catch {
    return false;
  }
}

function loadVerifiedPosixSnapshot(selected) {
  const prepared = preparePosixSnapshot(selected.binaryBytes, selected.artifact);
  if (!prepared.ready) {
    if (!cleanupPosixSnapshot(prepared.context)) {
      return unavailable('binding-load-snapshot-unverified');
    }
    return unavailable('binding-load-snapshot-unverified');
  }

  let cacheKey;
  try {
    cacheKey = require.resolve(prepared.context.filePath);
    if (cacheKey !== prepared.context.filePath || !requireCacheEntryAbsent(cacheKey)) {
      if (!cleanupPosixSnapshot(prepared.context)) {
        return unavailable('binding-load-snapshot-unverified');
      }
      return unavailable('binding-load-snapshot-unverified');
    }
  } catch {
    if (!cleanupPosixSnapshot(prepared.context)) {
      return unavailable('binding-load-snapshot-unverified');
    }
    return unavailable('binding-load-snapshot-unverified');
  }

  let raw;
  let loadFailed = false;
  try {
    // The random, owner-private physical path isolates Node's native-module cache.
    // Code already running as this same OS principal is part of the trusted process
    // boundary; this loader prevents unprivileged cross-principal path replacement,
    // not hostile same-euid or privileged code execution inside the process.
    raw = require(cacheKey);
  } catch {
    loadFailed = true;
  }

  const cacheEvicted = evictRequireCacheEntry(cacheKey);
  const snapshotVerified = verifyPinnedSnapshotFile(prepared.context, selected.artifact)
    && verifyPinnedDirectory(prepared.context)
    && verifyPinnedParent(prepared.context);
  let validated = null;
  if (!loadFailed && cacheEvicted && snapshotVerified) {
    try {
      validated = validatedSuccess(raw, selected.artifact);
    } catch {
      validated = null;
    }
  }
  const cleanupConfirmed = cleanupPosixSnapshot(prepared.context);
  if (!cacheEvicted || !snapshotVerified || !cleanupConfirmed) {
    return unavailable('binding-load-snapshot-unverified');
  }
  if (loadFailed) return unavailable('binding-load-failed');
  return validated ?? unavailable('binding-contract-mismatch');
}

function validateManifest(raw, expectedPackageVersion) {
  const manifest = ownData(raw, 'capabilityManifest');
  if (!hasExactFrozenDataShape(manifest, EXPECTED_MANIFEST_KEYS)) return null;

  const features = ownData(manifest, 'features');
  const exportSet = ownData(manifest, 'exportSet');
  const validatedFeatures = frozenSortedStringArray(features, ALLOWED_FEATURES);
  const validatedExportSet = frozenSortedStringArray(exportSet, null);
  const platform = expectedPlatform();
  const platformFeatures = expectedFeatures(platform);
  const rawEffectContract = ownData(manifest, 'effectContract');
  if (!hasExactFrozenDataShape(rawEffectContract, EFFECT_CONTRACT_KEYS)) return null;
  const effectOperations = frozenSortedStringArray(
    ownData(rawEffectContract, 'operations'),
    new Set(EXPECTED_EFFECT_OPERATIONS),
  );
  const effectAvailable = platform === 'linux';
  if (effectOperations === null
    || effectOperations.length !== EXPECTED_EFFECT_OPERATIONS.length
    || listSome(effectOperations, (entry, index) => entry !== EXPECTED_EFFECT_OPERATIONS[index])
    || ownData(rawEffectContract, 'schemaVersion') !== EXPECTED_EFFECT_ABI.schemaVersion
    || ownData(rawEffectContract, 'abiName') !== EXPECTED_EFFECT_ABI.abiName
    || ownData(rawEffectContract, 'abiVersion') !== EXPECTED_EFFECT_ABI.abiVersion
    || ownData(rawEffectContract, 'handleAbi') !== EXPECTED_EFFECT_ABI.handleAbi
    || ownData(rawEffectContract, 'trustDomain') !== EXPECTED_EFFECT_ABI.trustDomain
    || ownData(rawEffectContract, 'available') !== effectAvailable) return null;
  if (validatedFeatures === null
    || platformFeatures === null
    || validatedFeatures.length !== platformFeatures.length
    || listSome(validatedFeatures, (entry, index) => entry !== platformFeatures[index])
    || validatedExportSet === null
    || validatedExportSet.length !== EXPECTED_EXPORT_SET.length
    || listSome(validatedExportSet, (entry, index) => entry !== EXPECTED_EXPORT_SET[index])) {
    return null;
  }

  if (ownData(manifest, 'schemaVersion') !== EXPECTED_ABI.schemaVersion
    || ownData(manifest, 'abiName') !== EXPECTED_ABI.abiName
    || ownData(manifest, 'abiVersion') !== EXPECTED_ABI.abiVersion
    || ownData(manifest, 'napiVersion') !== EXPECTED_ABI.napiVersion
    || ownData(manifest, 'packageName') !== EXPECTED_ABI.packageName
    || ownData(manifest, 'packageVersion') !== expectedPackageVersion
    || ownData(manifest, 'platform') !== platform
    || ownData(manifest, 'arch') !== expectedArch()
    || ownData(manifest, 'handleAbi') !== EXPECTED_ABI.handleAbi
    || ownData(manifest, 'buildType') !== EXPECTED_ABI.buildType) {
    return null;
  }

  return objectFreeze({
    schemaVersion: EXPECTED_ABI.schemaVersion,
    abiName: EXPECTED_ABI.abiName,
    abiVersion: EXPECTED_ABI.abiVersion,
    napiVersion: EXPECTED_ABI.napiVersion,
    packageName: EXPECTED_ABI.packageName,
    packageVersion: expectedPackageVersion,
    platform,
    arch: expectedArch(),
    handleAbi: EXPECTED_ABI.handleAbi,
    buildType: EXPECTED_ABI.buildType,
    effectContract: objectFreeze({
      ...EXPECTED_EFFECT_ABI,
      available: effectAvailable,
      operations: effectOperations,
    }),
    features: validatedFeatures,
    exportSet: validatedExportSet,
  });
}

function safeNativeError(error) {
  const rawCode = ownData(error, 'code');
  const code = typeof rawCode === 'string'
    && setContains(ALLOWED_NATIVE_ERROR_CODES, rawCode)
    ? rawCode
    : 'E_EXEC_AUTH_NATIVE_OPERATION';
  const safe = new TrustedError(`Exec authority native operation failed (${code})`);
  objectDefineProperty(safe, 'name', {
    value: 'ExecAuthorityNativeError',
    configurable: false,
    enumerable: false,
    writable: false,
  });
  objectDefineProperty(safe, 'code', {
    value: code,
    configurable: false,
    enumerable: true,
    writable: false,
  });
  return safe;
}

function custodyBoundaryError(code) {
  const source = objectCreate(null);
  objectDefineProperty(source, 'code', {
    value: code,
    configurable: false,
    enumerable: true,
    writable: false,
  });
  return safeNativeError(source);
}

function isCustodyEvidenceBits(value) {
  return numberIsSafeInteger(value)
    && value >= 0
    && (value & CUSTODY_KNOWN_EVIDENCE_MASK) === value;
}

function isPlatformCompatibleCustodyEvidence(value, platform = expectedPlatform()) {
  if (!isCustodyEvidenceBits(value)) return false;
  if (platform === 'win32') return (value & CUSTODY_POSIX_ONLY_EVIDENCE_MASK) === 0;
  if (platform === 'linux' || platform === 'darwin') {
    return (value & CUSTODY_WIN32_ONLY_EVIDENCE_MASK) === 0;
  }
  return value === 0;
}

function isCanonicalCustodyDecimal(value, maximum = CUSTODY_UINT64_MAX) {
  if (typeof value !== 'string') return false;
  const maximumString = maximum.toString();
  return value.length <= maximumString.length
    && /^(?:0|[1-9][0-9]*)$/u.test(value)
    && BigInt(value) <= maximum;
}

function isCanonicalCustodyFsMagic(value) {
  return typeof value === 'string'
    && /^0x(?:0|[1-9a-f][0-9a-f]{0,15})$/u.test(value);
}

function isCanonicalCustodyWin32Hex32(value) {
  return typeof value === 'string' && /^0x[0-9a-f]{8}$/u.test(value);
}

function isCanonicalCustodyWin32VolumeId(value) {
  return typeof value === 'string' && /^0x[0-9a-f]{16}$/u.test(value);
}

function isCanonicalCustodyWin32FileId(value) {
  return typeof value === 'string' && /^0x[0-9a-f]{32}$/u.test(value);
}

function isCanonicalCustodyOwnerSid(value) {
  if (typeof value !== 'string' || value.length > 184) return false;
  const components = value.split('-');
  const authority = components[2];
  if (components.length < 4
    || components.length > 18
    || components[0] !== 'S'
    || components[1] !== '1'
    || authority === undefined
    || !isCanonicalCustodyDecimal(authority, 281_474_976_710_655n)) {
    return false;
  }
  for (let index = 3; index < components.length; index += 1) {
    if (!isCanonicalCustodyDecimal(components[index], CUSTODY_UINT32_MAX)) return false;
  }
  return true;
}

function isCustodyIdentityTransport(value) {
  if (!hasExactFrozenDataShape(value, CUSTODY_IDENTITY_KEYS)) return false;
  const capabilities = frozenSortedStringArray(
    ownData(value, 'volumeCapabilities'),
    CUSTODY_VOLUME_CAPABILITIES,
  );
  const platform = ownData(value, 'platform');
  const objectType = ownData(value, 'objectType');
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'custody-identity'
    || platform !== expectedPlatform()
    || (objectType !== 'DIRECTORY' && objectType !== 'REGULAR_FILE' && objectType !== 'OTHER')
    || !isCanonicalCustodyDecimal(ownData(value, 'size'))
    || !isCanonicalCustodyDecimal(ownData(value, 'linkCount'))
    || capabilities === null
    || !isPlatformCompatibleCustodyEvidence(ownData(value, 'featureEvidenceBits'), platform)) {
    return false;
  }
  if (platform === 'linux' || platform === 'darwin') {
    const mntId = ownData(value, 'mntId');
    const fsMagic = ownData(value, 'fsMagic');
    return !((platform === 'linux' && !isCanonicalCustodyDecimal(mntId))
      || (platform === 'darwin'
        && (typeof mntId !== 'string'
          || !/^fsid:0x[0-9a-f]{8}:0x[0-9a-f]{8}$/u.test(mntId)))
      || !isCanonicalCustodyDecimal(ownData(value, 'dev'))
      || !isCanonicalCustodyDecimal(ownData(value, 'ino'))
      || (platform === 'linux' && !isCanonicalCustodyFsMagic(fsMagic))
      || (platform === 'darwin' && fsMagic !== null)
      || typeof ownData(value, 'mode') !== 'string'
      || !/^0[0-7]{3}$/u.test(ownData(value, 'mode'))
      || !isCanonicalCustodyDecimal(ownData(value, 'ownerUid'), CUSTODY_UINT32_MAX)
      || ownData(value, 'volumeId') !== null
      || ownData(value, 'fileId') !== null
      || ownData(value, 'reparseTag') !== null
      || ownData(value, 'ownerSid') !== null
      || ownData(value, 'daclPresent') !== null
      || ownData(value, 'daclProtected') !== null
      || ownData(value, 'daclEntryCount') !== null
      || ownData(value, 'daclOwnerAllowMask') !== null
      || ownData(value, 'daclCanonicalHash') !== null
      || ownData(value, 'volumeRemote') !== null);
  }
  if (platform === 'win32') {
    return ownData(value, 'mntId') === null
      && ownData(value, 'dev') === null
      && ownData(value, 'ino') === null
      && ownData(value, 'fsMagic') === null
      && ownData(value, 'mode') === null
      && ownData(value, 'ownerUid') === null
      && isCanonicalCustodyWin32VolumeId(ownData(value, 'volumeId'))
      && isCanonicalCustodyWin32FileId(ownData(value, 'fileId'))
      && isCanonicalCustodyWin32Hex32(ownData(value, 'reparseTag'))
      && isCanonicalCustodyOwnerSid(ownData(value, 'ownerSid'))
      && typeof ownData(value, 'daclPresent') === 'boolean'
      && typeof ownData(value, 'daclProtected') === 'boolean'
      && isCanonicalCustodyDecimal(ownData(value, 'daclEntryCount'), CUSTODY_UINT32_MAX)
      && isCanonicalCustodyWin32Hex32(ownData(value, 'daclOwnerAllowMask'))
      && typeof ownData(value, 'daclCanonicalHash') === 'string'
      && /^sha256:[0-9a-f]{64}$/u.test(ownData(value, 'daclCanonicalHash'))
      && typeof ownData(value, 'volumeRemote') === 'boolean'
      && ((ownData(value, 'volumeRemote') === true)
        === listSome(capabilities, entry => entry === 'REMOTE'));
  }
  return false;
}

function sameCustodyTransportIdentity(left, right) {
  for (const key of CUSTODY_IDENTITY_KEYS) {
    const leftValue = ownData(left, key);
    const rightValue = ownData(right, key);
    if (key === 'volumeCapabilities') {
      if (leftValue.length !== rightValue.length
        || listSome(leftValue, (entry, index) => entry !== rightValue[index])) {
        return false;
      }
    } else if (leftValue !== rightValue) {
      return false;
    }
  }
  return true;
}

function sameStableCustodyTransportIdentity(left, right) {
  for (const key of CUSTODY_IDENTITY_KEYS) {
    if (key === 'featureEvidenceBits' || key === 'volumeCapabilities') continue;
    if (ownData(left, key) !== ownData(right, key)) return false;
  }
  return true;
}

function sameAppendCustodyObjectIdentity(left, right) {
  for (const key of CUSTODY_IDENTITY_KEYS) {
    if (key === 'featureEvidenceBits'
      || key === 'size'
      || key === 'volumeCapabilities') {
      continue;
    }
    if (ownData(left, key) !== ownData(right, key)) return false;
  }
  return true;
}

function custodyCapabilitiesContain(identity, expected) {
  return listSome(ownData(identity, 'volumeCapabilities'), entry => entry === expected);
}

function custodyHasEvidenceBits(value, required) {
  return (value & required) === required;
}

function isOwnerPrivateCustodyIdentity(
  identity,
  expectedObjectType,
  expectedRegularLinkCount = '1',
) {
  let requiredEvidence = CUSTODY_EVIDENCE_COMPONENT_NOFOLLOW
    | CUSTODY_EVIDENCE_OWNER_PRIVATE
    | CUSTODY_EVIDENCE_OBJECT_TYPE
    | CUSTODY_EVIDENCE_OWNER_IDENTITY;
  if (expectedObjectType === 'REGULAR_FILE') {
    requiredEvidence |= CUSTODY_EVIDENCE_LINK_COUNT | CUSTODY_EVIDENCE_SIZE;
  }
  if (ownData(identity, 'platform') === 'win32') {
    requiredEvidence |= CUSTODY_EVIDENCE_LOCAL_VOLUME
      | CUSTODY_EVIDENCE_DACL_PRESENT
      | CUSTODY_EVIDENCE_DACL_PROTECTED
      | CUSTODY_EVIDENCE_DACL_EXACT_OWNER_ONLY;
  }
  if (ownData(identity, 'objectType') !== expectedObjectType
    || !custodyHasEvidenceBits(ownData(identity, 'featureEvidenceBits'), requiredEvidence)
    || custodyCapabilitiesContain(identity, 'REMOTE')
    || (expectedObjectType === 'REGULAR_FILE'
      && ownData(identity, 'linkCount') !== expectedRegularLinkCount)) {
    return false;
  }
  if (ownData(identity, 'platform') === 'linux'
    || ownData(identity, 'platform') === 'darwin') {
    return expectedObjectType === 'DIRECTORY'
      ? ownData(identity, 'mode') === '0700'
      : ownData(identity, 'mode') === '0400' || ownData(identity, 'mode') === '0600';
  }
  return ownData(identity, 'platform') === 'win32'
    && ownData(identity, 'reparseTag') === '0x00000000'
    && ownData(identity, 'daclPresent') === true
    && ownData(identity, 'daclProtected') === true
    && ownData(identity, 'daclEntryCount') === '1'
    && ownData(identity, 'daclOwnerAllowMask') === '0x001f01ff'
    && ownData(identity, 'volumeRemote') === false;
}

function isOwnerPrivateCustodyPublicationIdentity(identity) {
  const linkCount = ownData(identity, 'linkCount');
  if (linkCount !== '0' && linkCount !== '1') return false;
  if (!isOwnerPrivateCustodyIdentity(identity, 'REGULAR_FILE', linkCount)) return false;
  return linkCount === '1'
    || (custodyHasEvidenceBits(
      ownData(identity, 'featureEvidenceBits'),
      CUSTODY_EVIDENCE_ANONYMOUS_TEMPFILE,
    ) && custodyCapabilitiesContain(identity, 'ANONYMOUS_TEMPFILE'));
}

function isOwnerPrivateCustodyRegularHandleIdentity(identity) {
  return ownData(identity, 'linkCount') === '0'
    ? isOwnerPrivateCustodyPublicationIdentity(identity)
    : isOwnerPrivateCustodyIdentity(identity, 'REGULAR_FILE');
}

function inspectNativeCustodyHandle(captured, handle) {
  if (!hasOpaqueCustodyHandleShape(handle)) {
    return objectFreeze({ identity: null, state: 'INVALID' });
  }
  let identity;
  try {
    identity = captured.custodyInvoke('identity', handle);
  } catch (error) {
    const code = ownData(error, 'code');
    return objectFreeze({
      identity: null,
      state: code === 'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED'
        || code === 'E_EXEC_AUTH_NATIVE_HANDLE_STALE'
        ? 'CONSUMED'
        : 'INVALID',
    });
  }
  return isCustodyIdentityTransport(identity)
    ? objectFreeze({ identity, state: 'LIVE' })
    : objectFreeze({ identity: null, state: 'INVALID' });
}

function requireNativeCustodyPreIdentity(captured, operation, args) {
  if (operation === 'open-root') return null;
  const inspected = inspectNativeCustodyHandle(captured, ownData(args, '0'));
  if (inspected.state !== 'LIVE') {
    throw custodyBoundaryError(
      inspected.state === 'CONSUMED'
        ? 'E_EXEC_AUTH_NATIVE_HANDLE_CLOSED'
        : 'E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT',
    );
  }
  const expectedObjectType = operation === 'open-directory-at'
    || operation === 'open-file-at'
    || operation === 'begin-publication'
    || operation === 'probe'
    || operation === 'prove-root-separation'
    || operation === 'scan-directory-bounded'
    ? 'DIRECTORY'
    : operation === 'append-publication'
      || operation === 'seal-publication'
      || operation === 'abort-publication'
      || operation === 'read-bounded'
      ? 'REGULAR_FILE'
      : ownData(inspected.identity, 'objectType');
  const privateIdentity = expectedObjectType === 'REGULAR_FILE'
    ? isOwnerPrivateCustodyRegularHandleIdentity(inspected.identity)
    : isOwnerPrivateCustodyIdentity(inspected.identity, expectedObjectType);
  if ((expectedObjectType !== 'DIRECTORY' && expectedObjectType !== 'REGULAR_FILE')
    || !privateIdentity) {
    throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT');
  }
  return inspected.identity;
}

function validateReturnedCustodyHandle(captured, handle, expectedIdentity = null) {
  const inspected = inspectNativeCustodyHandle(captured, handle);
  return inspected.state === 'LIVE'
    && (expectedIdentity === null
      || sameCustodyTransportIdentity(inspected.identity, expectedIdentity))
    ? inspected
    : null;
}

function validatedCustodyTransportResult(operation, value, args, captured, preIdentity) {
  switch (operation) {
    case 'open-root':
    case 'open-directory-at':
    case 'open-file-at': {
      if (!hasExactFrozenDataShape(value, CUSTODY_OPEN_RESULT_KEYS)) return null;
      const state = ownData(value, 'state');
      const identity = ownData(value, 'identity');
      const disposition = operation === 'open-root'
        ? ownData(args, '1')
        : ownData(args, '2');
      const expectedObjectType = operation === 'open-file-at' ? 'REGULAR_FILE' : 'DIRECTORY';
      const handle = ownData(value, 'handle');
      const validatedHandle = isCustodyIdentityTransport(identity)
        ? validateReturnedCustodyHandle(captured, handle, identity)
        : null;
      return ownData(value, 'schemaVersion') === 1
        && ownData(value, 'kind') === 'custody-open'
        && (state === 'OPENED' || state === 'CREATED')
        && (disposition !== 'OPEN_EXISTING' || state === 'OPENED')
        && (disposition !== 'CREATE_NEW' || state === 'CREATED')
        && isCustodyIdentityTransport(identity)
        && isOwnerPrivateCustodyIdentity(identity, expectedObjectType)
        && validatedHandle !== null
        ? value
        : null;
    }
    case 'begin-publication': {
      const validatedHandle = validateReturnedCustodyHandle(captured, value);
      return validatedHandle !== null
        && isOwnerPrivateCustodyPublicationIdentity(validatedHandle.identity)
        ? value
        : null;
    }
    case 'probe': {
      if (!hasExactFrozenDataShape(value, CUSTODY_PROBE_RESULT_KEYS)) return null;
      const identity = ownData(value, 'identity');
      const featureEvidenceBits = ownData(value, 'featureEvidenceBits');
      const available = ownData(value, 'available');
      const postInspection = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      if (ownData(value, 'schemaVersion') !== 1
        || ownData(value, 'kind') !== 'custody-probe'
        || typeof available !== 'boolean'
        || ownData(value, 'platform') !== expectedPlatform()
        || !isPlatformCompatibleCustodyEvidence(featureEvidenceBits)
        || !isCustodyIdentityTransport(identity)
        || preIdentity === null
        || !sameStableCustodyTransportIdentity(preIdentity, identity)
        || postInspection.state !== 'LIVE'
        || !sameStableCustodyTransportIdentity(identity, postInspection.identity)
        || !isOwnerPrivateCustodyIdentity(identity, 'DIRECTORY')
        || featureEvidenceBits !== ownData(identity, 'featureEvidenceBits')) {
        return null;
      }
      if (available === true) {
        const minimumConfirmed = expectedPlatform() === 'win32'
          ? custodyHasEvidenceBits(
            ownData(identity, 'featureEvidenceBits'),
            CUSTODY_EVIDENCE_LOCAL_VOLUME
              | CUSTODY_EVIDENCE_DACL_PRESENT
              | CUSTODY_EVIDENCE_DACL_PROTECTED
              | CUSTODY_EVIDENCE_DACL_EXACT_OWNER_ONLY,
          )
            && custodyCapabilitiesContain(identity, 'NO_REPLACE_PUBLISH')
            && custodyCapabilitiesContain(identity, 'PERSISTENT_ACL')
            && custodyCapabilitiesContain(identity, 'STABLE_OBJECT_ID')
          : (expectedPlatform() === 'linux' || expectedPlatform() === 'darwin')
            && custodyHasEvidenceBits(
              ownData(identity, 'featureEvidenceBits'),
              CUSTODY_EVIDENCE_ANONYMOUS_TEMPFILE,
            )
            && custodyCapabilitiesContain(identity, 'ANONYMOUS_TEMPFILE')
            && custodyCapabilitiesContain(identity, 'STABLE_OBJECT_ID');
        if (!minimumConfirmed) return null;
      }
      return value;
    }
    case 'prove-root-separation': {
      if (!hasExactFrozenDataShape(value, CUSTODY_ROOT_SEPARATION_RESULT_KEYS)) return null;
      const custodyIdentity = ownData(value, 'custodyIdentity');
      const projectIdentity = ownData(value, 'projectIdentity');
      const featureEvidenceBits = ownData(value, 'featureEvidenceBits');
      const postInspection = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      const requiredEvidence = CUSTODY_EVIDENCE_COMPONENT_NOFOLLOW
        | CUSTODY_EVIDENCE_OBJECT_TYPE
        | CUSTODY_EVIDENCE_ROOT_SEPARATION;
      return ownData(value, 'schemaVersion') === 1
        && ownData(value, 'kind') === 'custody-root-separation'
        && ownData(value, 'state') === 'CONFIRMED'
        && featureEvidenceBits === requiredEvidence
        && isPlatformCompatibleCustodyEvidence(featureEvidenceBits)
        && isCustodyIdentityTransport(custodyIdentity)
        && isCustodyIdentityTransport(projectIdentity)
        && preIdentity !== null
        && sameCustodyTransportIdentity(preIdentity, custodyIdentity)
        && postInspection.state === 'LIVE'
        && sameCustodyTransportIdentity(custodyIdentity, postInspection.identity)
        && isOwnerPrivateCustodyIdentity(custodyIdentity, 'DIRECTORY')
        && ownData(projectIdentity, 'objectType') === 'DIRECTORY'
        && custodyHasEvidenceBits(
          ownData(projectIdentity, 'featureEvidenceBits'),
          CUSTODY_EVIDENCE_COMPONENT_NOFOLLOW | CUSTODY_EVIDENCE_OBJECT_TYPE,
        )
        && custodyCapabilitiesContain(projectIdentity, 'STABLE_OBJECT_ID')
        && (ownData(custodyIdentity, 'dev') !== ownData(projectIdentity, 'dev')
          || ownData(custodyIdentity, 'ino') !== ownData(projectIdentity, 'ino'))
        ? value
        : null;
    }
    case 'append-publication': {
      const expectedBytes = ownData(args, '1');
      const postInspection = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      return hasExactFrozenDataShape(value, CUSTODY_APPEND_RESULT_KEYS)
        && ownData(value, 'schemaVersion') === 1
        && ownData(value, 'kind') === 'custody-append'
        && ownData(value, 'state') === 'APPENDED'
        && isSafeNonNegativeInteger(ownData(value, 'byteLength'))
        && ownData(value, 'byteLength')
          === trustedTypedArrayNumber(typedArrayByteLengthGetter, expectedBytes)
        && preIdentity !== null
        && postInspection.state === 'LIVE'
        && sameAppendCustodyObjectIdentity(preIdentity, postInspection.identity)
        && isOwnerPrivateCustodyPublicationIdentity(postInspection.identity)
        ? value
        : null;
    }
    case 'read-bounded': {
      if (!hasExactFrozenDataShape(value, CUSTODY_READ_RESULT_KEYS)) return null;
      const bytes = snapshotCustodyBytes(ownData(value, 'bytes'));
      const requestedMaxBytes = ownData(value, 'requestedMaxBytes');
      const observedBytes = ownData(value, 'observedBytes');
      const before = ownData(value, 'before');
      const after = ownData(value, 'after');
      const eof = ownData(value, 'eof');
      const postInspection = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      const exactObservedSize = isSafeNonNegativeInteger(observedBytes)
        ? `${observedBytes}`
        : null;
      const requiredEvidence = CUSTODY_EVIDENCE_COMPONENT_NOFOLLOW
        | CUSTODY_EVIDENCE_OWNER_PRIVATE
        | CUSTODY_EVIDENCE_BOUNDED_READ
        | CUSTODY_EVIDENCE_OBJECT_TYPE
        | CUSTODY_EVIDENCE_LINK_COUNT
        | CUSTODY_EVIDENCE_SIZE
        | CUSTODY_EVIDENCE_OWNER_IDENTITY
        | (expectedPlatform() === 'win32'
          ? CUSTODY_EVIDENCE_LOCAL_VOLUME
            | CUSTODY_EVIDENCE_DACL_PRESENT
            | CUSTODY_EVIDENCE_DACL_PROTECTED
            | CUSTODY_EVIDENCE_DACL_EXACT_OWNER_ONLY
          : 0);
      if (ownData(value, 'schemaVersion') !== 1
        || ownData(value, 'kind') !== 'custody-read'
        || bytes === null
        || !isCustodyIdentityTransport(before)
        || !isCustodyIdentityTransport(after)
        || !sameCustodyTransportIdentity(before, after)
        || preIdentity === null
        || postInspection.state !== 'LIVE'
        || !sameStableCustodyTransportIdentity(preIdentity, before)
        || !sameStableCustodyTransportIdentity(after, postInspection.identity)
        || !isOwnerPrivateCustodyIdentity(before, 'REGULAR_FILE')
        || !custodyHasEvidenceBits(ownData(before, 'featureEvidenceBits'), requiredEvidence)
        || typeof eof !== 'boolean'
        || !isSafePositiveInteger(requestedMaxBytes)
        || requestedMaxBytes !== ownData(args, '1')
        || !isSafeNonNegativeInteger(observedBytes)
        || observedBytes !== trustedTypedArrayNumber(typedArrayByteLengthGetter, bytes)
        || observedBytes > requestedMaxBytes
        || exactObservedSize === null
        || ownData(preIdentity, 'size') !== exactObservedSize
        || ownData(before, 'size') !== exactObservedSize
        || ownData(after, 'size') !== exactObservedSize
        || ownData(postInspection.identity, 'size') !== exactObservedSize
        || eof !== (observedBytes < requestedMaxBytes)) {
        return null;
      }
      return objectFreeze({
        after: ownData(value, 'after'),
        before: ownData(value, 'before'),
        bytes,
        eof,
        kind: 'custody-read',
        observedBytes,
        requestedMaxBytes,
        schemaVersion: 1,
      });
    }
    case 'scan-directory-bounded': {
      if (!hasExactFrozenDataShape(value, CUSTODY_DIRECTORY_SCAN_RESULT_KEYS)) return null;
      const before = ownData(value, 'before');
      const after = ownData(value, 'after');
      const names = frozenSortedStringArray(ownData(value, 'names'), null);
      const entryCount = ownData(value, 'entryCount');
      const requestedMaxEntries = ownData(value, 'requestedMaxEntries');
      const requestedMaxNameBytes = ownData(value, 'requestedMaxNameBytes');
      const deadlineUnixMs = ownData(value, 'deadlineUnixMs');
      const postInspection = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      if (ownData(value, 'schemaVersion') !== 1
        || ownData(value, 'kind') !== 'custody-directory-scan'
        || ownData(value, 'state') !== 'SCANNED'
        || ownData(value, 'mutationEvidence') !== 'DIRECTORY_IDENTITY_STABLE'
        || !isCustodyIdentityTransport(before)
        || !isCustodyIdentityTransport(after)
        || !sameCustodyTransportIdentity(before, after)
        || preIdentity === null
        || postInspection.state !== 'LIVE'
        || !sameStableCustodyTransportIdentity(preIdentity, before)
        || !sameStableCustodyTransportIdentity(after, postInspection.identity)
        || !isOwnerPrivateCustodyIdentity(before, 'DIRECTORY')
        || names === null
        || !isSafeNonNegativeInteger(entryCount)
        || entryCount !== names.length
        || requestedMaxEntries !== ownData(args, '1')
        || requestedMaxNameBytes !== ownData(args, '2')
        || deadlineUnixMs !== ownData(args, '3')
        || entryCount > requestedMaxEntries
        || listSome(names, name => (
          !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(name)
          || utf8ByteLength(name) > requestedMaxNameBytes
        ))) return null;
      return objectFreeze({
        after,
        before,
        deadlineUnixMs,
        entryCount,
        kind: 'custody-directory-scan',
        mutationEvidence: 'DIRECTORY_IDENTITY_STABLE',
        names,
        requestedMaxEntries,
        requestedMaxNameBytes,
        schemaVersion: 1,
        state: 'SCANNED',
      });
    }
    case 'identity': {
      const postInspection = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      return isCustodyIdentityTransport(value)
        && preIdentity !== null
        && postInspection.state === 'LIVE'
        && sameCustodyTransportIdentity(preIdentity, value)
        && sameCustodyTransportIdentity(value, postInspection.identity)
        ? value
        : null;
    }
    case 'apply-private':
    case 'sync': {
      if (!hasExactFrozenDataShape(value, CUSTODY_EVIDENCE_RESULT_KEYS)) return null;
      const expectedOperation = operation === 'sync' ? 'SYNC' : 'APPLY_PRIVATE';
      const featureEvidenceBits = ownData(value, 'featureEvidenceBits');
      const postInspection = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      if (ownData(value, 'schemaVersion') !== 1
        || ownData(value, 'kind') !== 'custody-evidence'
        || ownData(value, 'operation') !== expectedOperation
        || ownData(value, 'state') !== 'CONFIRMED'
        || !isPlatformCompatibleCustodyEvidence(featureEvidenceBits)
        || preIdentity === null
        || postInspection.state !== 'LIVE'
        || !sameStableCustodyTransportIdentity(preIdentity, postInspection.identity)
        || (ownData(postInspection.identity, 'objectType') !== 'DIRECTORY'
          && ownData(postInspection.identity, 'objectType') !== 'REGULAR_FILE')
        || !(ownData(postInspection.identity, 'objectType') === 'REGULAR_FILE'
          ? isOwnerPrivateCustodyRegularHandleIdentity(postInspection.identity)
          : isOwnerPrivateCustodyIdentity(
            postInspection.identity,
            ownData(postInspection.identity, 'objectType'),
          ))
        || featureEvidenceBits !== ownData(postInspection.identity, 'featureEvidenceBits')) {
        return null;
      }
      if (expectedOperation === 'SYNC') {
        const durabilityEvidence = ownData(postInspection.identity, 'objectType') === 'DIRECTORY'
          ? CUSTODY_EVIDENCE_DIRECTORY_DURABILITY
          : CUSTODY_EVIDENCE_FILE_DURABILITY;
        if (!custodyHasEvidenceBits(featureEvidenceBits, durabilityEvidence)) return null;
      } else {
        const privacyEvidence = CUSTODY_EVIDENCE_OWNER_PRIVATE
          | CUSTODY_EVIDENCE_OWNER_IDENTITY
          | (expectedPlatform() === 'win32'
            ? CUSTODY_EVIDENCE_DACL_PRESENT
              | CUSTODY_EVIDENCE_DACL_PROTECTED
              | CUSTODY_EVIDENCE_DACL_EXACT_OWNER_ONLY
            : 0);
        if (!custodyHasEvidenceBits(featureEvidenceBits, privacyEvidence)) return null;
      }
      return value;
    }
    case 'seal-publication': {
      if (!hasExactFrozenDataShape(value, CUSTODY_PUBLICATION_RESULT_KEYS)) return null;
      const state = ownData(value, 'state');
      const readHandle = ownData(value, 'readHandle');
      const identity = ownData(value, 'identity');
      const reasonCode = ownData(value, 'reasonCode');
      const featureEvidenceBits = ownData(value, 'featureEvidenceBits');
      const validatedReadHandle = readHandle === null || !isCustodyIdentityTransport(identity)
        ? null
        : validateReturnedCustodyHandle(captured, readHandle, identity);
      const inputState = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      if (ownData(value, 'schemaVersion') !== 1
        || ownData(value, 'kind') !== 'custody-publication'
        || (state !== 'CREATED'
          && state !== 'EXISTING_IDENTICAL'
          && state !== 'PUBLISHED_UNCONFIRMED')
        || !isPlatformCompatibleCustodyEvidence(featureEvidenceBits)
        || (identity !== null && !isCustodyIdentityTransport(identity))
        || ((readHandle === null) !== (identity === null))
        || (readHandle !== null && validatedReadHandle === null)
        || readHandle === ownData(args, '0')
        || (validatedReadHandle !== null
          && !isOwnerPrivateCustodyIdentity(identity, 'REGULAR_FILE'))) {
        return null;
      }
      if (state === 'CREATED' || state === 'EXISTING_IDENTICAL') {
        if (validatedReadHandle === null || identity === null) return null;
        const requiredDurability = CUSTODY_EVIDENCE_FILE_DURABILITY
          | CUSTODY_EVIDENCE_DIRECTORY_DURABILITY;
        const provenanceMask = CUSTODY_EVIDENCE_PUBLISH_AT_EMPTY_PATH
          | CUSTODY_EVIDENCE_PUBLISH_PROC_FD_ALIAS;
        const publishProvenance = featureEvidenceBits & provenanceMask;
        const posixOnlyPublicationEvidence = CUSTODY_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH
          | provenanceMask;
        const platformPublicationConfirmed = expectedPlatform() === 'win32'
          ? (featureEvidenceBits & posixOnlyPublicationEvidence) === 0
            && custodyCapabilitiesContain(identity, 'NO_REPLACE_PUBLISH')
            && custodyCapabilitiesContain(identity, 'PERSISTENT_ACL')
            && custodyCapabilitiesContain(identity, 'STABLE_OBJECT_ID')
          : (expectedPlatform() === 'linux' || expectedPlatform() === 'darwin')
            && custodyHasEvidenceBits(
              featureEvidenceBits,
              CUSTODY_EVIDENCE_ANONYMOUS_NO_REPLACE_PUBLISH,
            )
            && (publishProvenance === CUSTODY_EVIDENCE_PUBLISH_AT_EMPTY_PATH
              || publishProvenance === CUSTODY_EVIDENCE_PUBLISH_PROC_FD_ALIAS)
            && custodyCapabilitiesContain(identity, 'ANONYMOUS_TEMPFILE')
            && custodyCapabilitiesContain(identity, 'NO_REPLACE_PUBLISH')
            && custodyCapabilitiesContain(identity, 'STABLE_OBJECT_ID');
        if (inputState.state !== 'CONSUMED'
          || validatedReadHandle === null
          || !custodyHasEvidenceBits(featureEvidenceBits, requiredDurability)
          || !platformPublicationConfirmed
          || reasonCode !== null) {
          return null;
        }
      } else {
        if (typeof reasonCode !== 'string'
          || !setContains(CUSTODY_REASON_CODES, reasonCode)) {
          return null;
        }
        if (reasonCode === 'CLEANUP_UNCONFIRMED') {
          if (inputState.state !== 'CONSUMED' || validatedReadHandle === null) return null;
        } else if (validatedReadHandle !== null
          || identity !== null
          || inputState.state !== 'LIVE'
          || !isOwnerPrivateCustodyPublicationIdentity(inputState.identity)) {
          return null;
        }
      }
      return value;
    }
    case 'abort-publication': {
      if (!hasExactFrozenDataShape(value, CUSTODY_CLEANUP_RESULT_KEYS)) return null;
      const state = ownData(value, 'state');
      const reasonCode = ownData(value, 'reasonCode');
      const inputState = inspectNativeCustodyHandle(captured, ownData(args, '0'));
      return ownData(value, 'schemaVersion') === 1
        && ownData(value, 'kind') === 'custody-cleanup'
        && (state === 'CLEANUP_CONFIRMED' || state === 'CLEANUP_UNCONFIRMED')
        && ((state === 'CLEANUP_CONFIRMED' && reasonCode === null)
          || (state === 'CLEANUP_UNCONFIRMED' && reasonCode === 'CLEANUP_UNCONFIRMED'))
        && inputState.state === 'CONSUMED'
        ? value
        : null;
    }
    default:
      return null;
  }
}

function createCustodyTransport(accepted, value) {
  return objectFreeze({ accepted, value });
}

/*
 * Public contract: `accepted: true` means the exact native result survived the
 * canonical identity syntax, owner-private/evidence requirements, and native
 * pre/post handle-lifecycle checks for that operation. It never means merely
 * "the addon returned an object". Raw addon callbacks remain lexical and the
 * loader keeps no shadow handle registry: opaque kind/rights/generation/state
 * authority stays in the native handle table and is re-observed through its
 * identity operation. A malformed or lifecycle-inconsistent result remains an
 * explicit `accepted: false` transport for the typed core's uncertainty path.
 */
function createCustodyFacade(captured) {
  const invoke = (operation, args) => {
    const validatedArgs = validatedCustodyArguments(operation, args);
    if (validatedArgs === null) throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
    const preIdentity = requireNativeCustodyPreIdentity(captured, operation, validatedArgs);
    let rawResult;
    if (validatedArgs.length === 1) {
      rawResult = captured.custodyInvoke(operation, ownData(validatedArgs, '0'));
    } else if (validatedArgs.length === 2) {
      rawResult = captured.custodyInvoke(
        operation,
        ownData(validatedArgs, '0'),
        ownData(validatedArgs, '1'),
      );
    } else if (validatedArgs.length === 3) {
      rawResult = captured.custodyInvoke(
        operation,
        ownData(validatedArgs, '0'),
        ownData(validatedArgs, '1'),
        ownData(validatedArgs, '2'),
      );
    } else {
      rawResult = captured.custodyInvoke(
        operation,
        ownData(validatedArgs, '0'),
        ownData(validatedArgs, '1'),
        ownData(validatedArgs, '2'),
        ownData(validatedArgs, '3'),
      );
    }
    const validatedResult = validatedCustodyTransportResult(
      operation,
      rawResult,
      validatedArgs,
      captured,
      preIdentity,
    );
    return createCustodyTransport(validatedResult !== null, validatedResult ?? rawResult);
  };
  const closeHandle = handle => {
    if (!hasOpaqueCustodyHandleShape(handle)) {
      throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
    }
    if (captured.custodyCloseHandle(handle) !== undefined) {
      throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED');
    }
  };
  return objectFreeze({
    abortPublication: publication => invoke('abort-publication', [publication]),
    appendPublication: (publication, bytes) => invoke(
      'append-publication',
      [publication, bytes],
    ),
    applyPrivate: handle => invoke('apply-private', [handle]),
    beginPublication: (parent, name, maxBytes) => invoke(
      'begin-publication',
      [parent, name, maxBytes],
    ),
    closeHandle,
    identity: handle => invoke('identity', [handle]),
    openDirectoryAt: (parent, name, disposition, privacyPolicy) => invoke(
      'open-directory-at',
      [parent, name, disposition, privacyPolicy],
    ),
    openFileAt: (parent, name, disposition, privacyPolicy) => invoke(
      'open-file-at',
      [parent, name, disposition, privacyPolicy],
    ),
    openRoot: (path, disposition, privacyPolicy) => invoke(
      'open-root',
      [path, disposition, privacyPolicy],
    ),
    probe: handle => invoke('probe', [handle]),
    proveRootSeparation: (custodyRoot, canonicalProjectRoot) => invoke(
      'prove-root-separation',
      [custodyRoot, canonicalProjectRoot],
    ),
    readBounded: (file, maxBytes) => invoke('read-bounded', [file, maxBytes]),
    scanDirectoryBounded: (directory, maxEntries, maxNameBytes, deadlineUnixMs) => invoke(
      'scan-directory-bounded',
      [directory, maxEntries, maxNameBytes, deadlineUnixMs],
    ),
    sealPublication: publication => invoke('seal-publication', [publication]),
    sync: handle => invoke('sync', [handle]),
  });
}

function isEffectRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_048_576
    || stringContains(value, '\0') || stringContains(value, '\\')
    || value[0] === '/' || value[value.length - 1] === '/') return false;
  if (utf8ByteLength(value) > 1_048_576) return false;
  if (value === '.') return true;
  let componentStart = 0;
  let componentCount = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index !== value.length && value[index] !== '/') continue;
    const component = reflectApply(stringSlice, value, [componentStart, index]);
    componentCount += 1;
    if (componentCount > 1024 || component.length === 0
      || component === '.' || component === '..'
      || utf8ByteLength(component) > 4096) return false;
    componentStart = index + 1;
  }
  return true;
}

function isSha256(value) {
  return typeof value === 'string' && ARTIFACT_SHA256_RE.test(value);
}

function snapshotEffectSourceReadAuthority(value) {
  const keys = [
    'deadlineUnixMs', 'expectedContentDigest', 'expectedMode', 'expectedSize',
    'maxChunkBytes', 'path',
  ];
  if (!hasExactDataShape(value, keys)) return null;
  const snapshot = objectCreate(null);
  for (const key of keys) snapshot[key] = ownData(value, key);
  if (!isEffectRelativePath(snapshot.path)
    || !numberIsSafeInteger(snapshot.expectedMode)
    || snapshot.expectedMode < 0 || snapshot.expectedMode > 0o777
    || !isSafeNonNegativeInteger(snapshot.expectedSize)
    || snapshot.expectedSize > 17_179_869_184
    || !isSha256(snapshot.expectedContentDigest)
    || !isSafePositiveInteger(snapshot.deadlineUnixMs)
    || !isSafePositiveInteger(snapshot.maxChunkBytes)
    || snapshot.maxChunkBytes > 67_108_864) return null;
  return objectFreeze(snapshot);
}

function putBe32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function putBe64(bytes, offset, value) {
  let remaining = BigInt(value);
  for (let index = 7; index >= 0; index -= 1) {
    bytes[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

function snapshotEffectLimits(value) {
  const keys = [
    'deadlineUnixMs', 'maxDepth', 'maxEntries', 'maxFileBytes',
    'maxManifestBytes', 'maxNameBytes', 'maxPathBytes', 'maxTotalBytes',
  ];
  if (!hasExactDataShape(value, keys)) return null;
  const snapshot = new Array(keys.length);
  for (let index = 0; index < keys.length; index += 1) {
    snapshot[index] = ownData(value, keys[index]);
  }
  if (listSome(snapshot, entry => !isSafePositiveInteger(entry))) return null;
  const [deadline, depth, entries, file, manifest, name, path, total] = snapshot;
  if (entries > 100_000 || depth > 1024 || path > 1_048_576 || name > 4096
    || file > 17_179_869_184 || total > 1_099_511_627_776
    || manifest > 16_777_216) return null;
  const bytes = new TrustedUint8Array(56);
  putBe32(bytes, 0, 1);
  putBe32(bytes, 4, entries);
  putBe32(bytes, 8, depth);
  putBe32(bytes, 12, path);
  putBe32(bytes, 16, name);
  putBe32(bytes, 20, 0);
  putBe64(bytes, 24, file);
  putBe64(bytes, 32, total);
  putBe64(bytes, 40, manifest);
  putBe64(bytes, 48, deadline);
  return bytes;
}

function validateEffectEntry(value) {
  if (!hasExactFrozenDataShape(value, EFFECT_ENTRY_KEYS)
    || ownData(value, 'schemaVersion') !== 1
    || !isEffectRelativePath(ownData(value, 'path'))
    || !isSha256(ownData(value, 'objectIdentityDigest'))
    || !/^[0-7]{4}$/u.test(ownData(value, 'mode'))) return null;
  const kind = ownData(value, 'kind');
  if (kind === 'DIRECTORY') {
    return ownData(value, 'contentDigest') === null && ownData(value, 'size') === null
      ? value : null;
  }
  return kind === 'REGULAR_FILE'
    && isSha256(ownData(value, 'contentDigest'))
    && /^(?:0|[1-9][0-9]*)$/u.test(ownData(value, 'size'))
    ? value : null;
}

function validateEffectEntries(value, expectedCount) {
  if (!arrayIsArray(value) || !objectIsFrozen(value)
    || !numberIsSafeInteger(expectedCount) || expectedCount < 0
    || expectedCount > 100_000 || value.length !== expectedCount) return null;
  const entries = [];
  let aggregatePathBytes = 0;
  for (let index = 0; index < expectedCount; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, String(index));
    const entry = descriptor !== undefined && objectHasOwn(descriptor, 'value')
      && descriptor.enumerable === true && descriptor.writable === false
      && descriptor.configurable === false
      ? validateEffectEntry(descriptor.value) : null;
    if (entry === null) return null;
    aggregatePathBytes += utf8ByteLength(ownData(entry, 'path'));
    if (aggregatePathBytes > 16_777_216) return null;
    entries[index] = entry;
  }
  return reflectOwnKeys(value).length === expectedCount + 1
    ? objectFreeze(entries) : null;
}

function validateEffectResult(operation, value) {
  if (operation === 'open-root') {
    return hasExactFrozenDataShape(value, EFFECT_ROOT_RESULT_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-root'
      && ownData(value, 'state') === 'OPENED'
      && (ownData(value, 'rootKind') === 'PROJECT'
        || ownData(value, 'rootKind') === 'WORKSPACE'
        || ownData(value, 'rootKind') === 'STAGING')
      && isSha256(ownData(value, 'identityDigest'))
      && hasOpaqueCustodyHandleShape(ownData(value, 'handle')) ? value : null;
  }
  if (operation === 'capture-tree') {
    if (!hasExactFrozenDataShape(value, EFFECT_MANIFEST_KEYS)
      || ownData(value, 'schemaVersion') !== 1
      || ownData(value, 'kind') !== 'execution-effect-manifest'
      || ownData(value, 'state') !== 'CAPTURED'
      || !isSafeNonNegativeInteger(ownData(value, 'entryCount'))
      || !isSafeNonNegativeInteger(ownData(value, 'totalBytes'))
      || !isSha256(ownData(value, 'manifestDigest'))) return null;
    return validateEffectEntries(ownData(value, 'entries'), ownData(value, 'entryCount'))
      === null ? null : value;
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
      && /^[0-7]{4}$/u.test(ownData(value, 'mode'))
      && isSafeNonNegativeInteger(ownData(value, 'totalBytes'))
      && isSafePositiveInteger(ownData(value, 'deadlineUnixMs'))
      && isSafePositiveInteger(ownData(value, 'maxChunkBytes'))
      && ownData(value, 'maxChunkBytes') <= 67_108_864
      && isSha256(ownData(value, 'contentDigest'))
      && isSha256(ownData(value, 'sourceObjectIdentityDigest'))
      && hasOpaqueCustodyHandleShape(ownData(value, 'handle')) ? value : null;
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
      || !isSha256(ownData(value, 'contentDigest'))) return null;
    const bytes = snapshotCustodyBytes(ownData(value, 'bytes'));
    if (bytes === null || bytes.byteLength !== ownData(value, 'byteLength')
      || `sha256:${createHash('sha256').update(bytes).digest('hex')}`
        !== ownData(value, 'contentDigest')) return null;
    return objectFreeze({ ...value, bytes });
  }
  if (operation === 'finish-source-read') {
    return hasExactFrozenDataShape(value, EFFECT_SOURCE_FINISH_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-source-read'
      && ownData(value, 'state') === 'VERIFIED'
      && isSafePositiveInteger(ownData(value, 'chunkCount'))
      && isSafeNonNegativeInteger(ownData(value, 'observedBytes'))
      && isSha256(ownData(value, 'contentDigest'))
      && isSha256(ownData(value, 'sourceObjectIdentityDigest')) ? value : null;
  }
  if (operation === 'begin-stage') {
    return hasExactFrozenDataShape(value, EFFECT_STAGE_OPEN_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-stage'
      && ownData(value, 'state') === 'OPEN'
      && isSafeNonNegativeInteger(ownData(value, 'totalBytes'))
      && isSha256(ownData(value, 'contentDigest'))
      && isSha256(ownData(value, 'nativeStagingObjectIdentityDigest'))
      && hasOpaqueCustodyHandleShape(ownData(value, 'handle')) ? value : null;
  }
  if (operation === 'append-stage') {
    return hasExactFrozenDataShape(value, EFFECT_STAGE_APPEND_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-stage-append'
      && ownData(value, 'state') === 'APPENDED'
      && isSafeNonNegativeInteger(ownData(value, 'observedBytes')) ? value : null;
  }
  if (operation === 'seal-stage') {
    return hasExactFrozenDataShape(value, EFFECT_STAGE_SEAL_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-stage'
      && ownData(value, 'state') === 'SEALED'
      && isSha256(ownData(value, 'contentDigest'))
      && isSha256(ownData(value, 'nativeStagingObjectIdentityDigest'))
      ? value : null;
  }
  if (operation === 'apply-operation' || operation === 'reconcile-operation') {
    return hasExactFrozenDataShape(value, EFFECT_MUTATION_KEYS)
      && ownData(value, 'schemaVersion') === 1
      && ownData(value, 'kind') === 'execution-effect-mutation'
      && (ownData(value, 'state') === 'APPLIED'
        || (operation === 'reconcile-operation' && ownData(value, 'state') === 'NOT_APPLIED'))
      && isSha256(ownData(value, 'operationDigest'))
      && isSha256(ownData(value, 'durabilityEvidenceDigest'))
      && (ownData(value, 'postimageDigest') === null
        || ownData(value, 'postimageDigest') === 'ABSENT'
        || isSha256(ownData(value, 'postimageDigest'))) ? value : null;
  }
  return hasExactFrozenDataShape(value, EFFECT_FINAL_VERIFY_KEYS)
    && ownData(value, 'schemaVersion') === 1
    && ownData(value, 'kind') === 'execution-effect-final-verification'
    && ownData(value, 'state') === 'VERIFIED'
    && isSha256(ownData(value, 'planDigest'))
    && isSha256(ownData(value, 'postimageSetDigest'))
    && isSafePositiveInteger(ownData(value, 'verifiedCount')) ? value : null;
}

function createEffectFacade(captured, effectContract) {
  if (ownData(effectContract, 'available') !== true) return null;
  const invoke = (operation, args) => {
    const raw = captured.effectInvoke(operation, ...args);
    const validated = validateEffectResult(operation, raw);
    if (validated === null) throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_BACKEND_ABI');
    return validated;
  };
  return objectFreeze({
    appendStage: (stagedContent, bytes) => {
      const snapshot = snapshotCustodyBytes(bytes);
      if (!hasOpaqueCustodyHandleShape(stagedContent) || snapshot === null
        || snapshot.byteLength > 67_108_864) throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      return invoke('append-stage', [stagedContent, snapshot]);
    },
    applyOperation: (projectRoot, envelope, stagedContent = null) => {
      const snapshot = snapshotCustodyBytes(envelope);
      if (!hasOpaqueCustodyHandleShape(projectRoot) || snapshot === null
        || snapshot.byteLength < 200 || snapshot.byteLength > 1_048_776
        || (stagedContent !== null && !hasOpaqueCustodyHandleShape(stagedContent))) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('apply-operation', [projectRoot, snapshot, stagedContent]);
    },
    beginSourceRead: (workspaceRoot, authority) => {
      const snapshot = snapshotEffectSourceReadAuthority(authority);
      if (!hasOpaqueCustodyHandleShape(workspaceRoot) || snapshot === null) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('begin-source-read', [
        workspaceRoot,
        snapshot.path,
        snapshot.expectedMode,
        snapshot.expectedSize,
        snapshot.expectedContentDigest,
        snapshot.deadlineUnixMs,
        snapshot.maxChunkBytes,
      ]);
    },
    beginStage: (stagingRoot, totalBytes, contentDigest) => {
      if (!hasOpaqueCustodyHandleShape(stagingRoot) || !isSafeNonNegativeInteger(totalBytes)
        || totalBytes > 17_179_869_184 || typeof contentDigest !== 'string'
        || !isSha256(contentDigest)) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('begin-stage', [stagingRoot, totalBytes, contentDigest]);
    },
    captureTree: (root, limits, cancelState = 'ACTIVE') => {
      const limitsBytes = snapshotEffectLimits(limits);
      if (!hasOpaqueCustodyHandleShape(root) || limitsBytes === null
        || (cancelState !== 'ACTIVE' && cancelState !== 'CANCELLED')) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('capture-tree', [root, limitsBytes, cancelState]);
    },
    closeHandle: handle => {
      if (!hasOpaqueCustodyHandleShape(handle)) throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FORGED');
      if (captured.effectCloseHandle(handle) !== undefined) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED');
      }
    },
    finishSourceRead: sourceRead => {
      if (!hasOpaqueCustodyHandleShape(sourceRead)) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FORGED');
      }
      return invoke('finish-source-read', [sourceRead]);
    },
    inspectEntry: (root, path) => {
      if (!hasOpaqueCustodyHandleShape(root) || !isEffectRelativePath(path)) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('inspect-entry', [root, path]);
    },
    nextSourceChunk: (sourceRead, cancelState = 'ACTIVE') => {
      if (!hasOpaqueCustodyHandleShape(sourceRead)
        || (cancelState !== 'ACTIVE' && cancelState !== 'CANCELLED')) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('next-source-chunk', [sourceRead, cancelState]);
    },
    openRoot: (rootKind, path) => {
      if ((rootKind !== 'PROJECT' && rootKind !== 'WORKSPACE' && rootKind !== 'STAGING')
        || !isCanonicalEffectIngressPath(path)) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('open-root', [rootKind, path]);
    },
    reconcileOperation: (projectRoot, envelope, stagedContent = null) => {
      const snapshot = snapshotCustodyBytes(envelope);
      if (!hasOpaqueCustodyHandleShape(projectRoot) || snapshot === null
        || snapshot.byteLength < 200 || snapshot.byteLength > 1_048_776
        || (stagedContent !== null && !hasOpaqueCustodyHandleShape(stagedContent))) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('reconcile-operation', [projectRoot, snapshot, stagedContent]);
    },
    sealStage: stagedContent => {
      if (!hasOpaqueCustodyHandleShape(stagedContent)) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_HANDLE_FORGED');
      }
      return invoke('seal-stage', [stagedContent]);
    },
    verifyPostimages: (projectRoot, envelope) => {
      const snapshot = snapshotCustodyBytes(envelope);
      if (!hasOpaqueCustodyHandleShape(projectRoot) || snapshot === null
        || snapshot.byteLength < 12 || snapshot.byteLength > 16_777_216) {
        throw custodyBoundaryError('E_EXEC_AUTH_NATIVE_ARGUMENT');
      }
      return invoke('verify-postimages', [projectRoot, snapshot]);
    },
  });
}

function capturedFunction(raw, name) {
  const candidate = ownData(raw, name);
  if (typeof candidate !== 'function') return null;
  const captured = (...args) => {
    try {
      return reflectApply(candidate, undefined, args);
    } catch (error) {
      throw safeNativeError(error);
    }
  };
  return objectFreeze(captured);
}

function validatedSuccess(raw, artifact) {
  if (!hasExactFrozenDataShape(raw, EXPECTED_EXPORT_SET)) return null;
  const manifest = validateManifest(raw, artifact.packageVersion);
  if (manifest === null
    || manifest.schemaVersion !== artifact.schemaVersion
    || manifest.abiName !== artifact.abiName
    || manifest.abiVersion !== artifact.abiVersion
    || manifest.handleAbi !== artifact.handleAbi
    || manifest.napiVersion !== artifact.napiVersion
    || manifest.packageName !== artifact.packageName
    || manifest.packageVersion !== artifact.packageVersion
    || manifest.platform !== artifact.platform
    || manifest.arch !== artifact.arch
    || manifest.buildType !== artifact.buildType) {
    return null;
  }

  const captured = objectCreate(null);
  for (const name of EXPECTED_EXPORT_SET) {
    if (name === 'capabilityManifest') continue;
    const fn = capturedFunction(raw, name);
    if (fn === null) return null;
    captured[name] = fn;
  }

  const legacy = objectFreeze({
    openDirAt: captured.openDirAt,
    closeFd: captured.closeFd,
    fstatIdentity: captured.fstatIdentity,
    readdirFd: captured.readdirFd,
    unlinkAt: captured.unlinkAt,
    renameAt: captured.renameAt,
    mountIdentity: captured.mountIdentity,
    fdPath: captured.fdPath,
    hostBootIdentity: captured.hostBootIdentity,
  });
  const custody = createCustodyFacade(captured);
  if (!hasExactFrozenDataShape(custody, CUSTODY_FACADE_KEYS)) return null;
  const effect = manifest.effectContract.available
    ? createEffectFacade(captured, manifest.effectContract)
    : objectFreeze({ available: false, reason: 'platform-unsupported' });
  if (effect === null
    || (manifest.effectContract.available
      ? !hasExactFrozenDataShape(effect, EFFECT_FACADE_KEYS)
      : !hasExactFrozenDataShape(effect, EFFECT_UNAVAILABLE_KEYS))) return null;
  const availableState = objectFreeze({
    available: true,
    custody,
    effect,
    manifest,
    legacy,
    binding: legacy,
  });
  return availableState;
}

/** Load and validate the one authoritative origin-verified Release binding exactly once. */
export function loadExecAuthorityNative() {
  if (memoizedState !== null) return memoizedState;

  const runtimeNapi = numberParseInt(process.versions.napi ?? '', 10);
  if (!numberIsSafeInteger(runtimeNapi) || runtimeNapi < EXPECTED_ABI.napiVersion) {
    memoizedState = unavailable('binding-runtime-napi-unsupported');
    return memoizedState;
  }
  if (!posixSnapshotPrimitivesAvailable()) {
    // Win32 needs a trusted native bootstrap/OS-loader authority that can prove
    // protected owner-only DACL custody, handle-to-image binding, locked-DLL
    // retention, and owner-bound stale cleanup. JS path checks cannot prove it.
    memoizedState = unavailable('binding-load-snapshot-unverified');
    return memoizedState;
  }

  let ownerUid;
  try {
    ownerUid = BigInt(process.geteuid());
  } catch {
    memoizedState = unavailable('binding-package-metadata-invalid');
    return memoizedState;
  }

  const expectedIdentity = packageIdentity(ownerUid);
  if (expectedIdentity === null) {
    memoizedState = unavailable('binding-package-metadata-invalid');
    return memoizedState;
  }

  const debug = inspectCandidate(candidateAt(DEBUG_DIRECTORY), ownerUid);
  if (!debug.trusted) {
    memoizedState = unavailable('binding-artifact-invalid');
    return memoizedState;
  }
  if (debug.artifact.present || debug.binary.present) {
    memoizedState = unavailable('binding-debug-not-authorized');
    return memoizedState;
  }

  const prebuildDirectory = join(
    HERE,
    'prebuilds',
    `${expectedPlatform()}-${expectedArch()}`,
    `napi-v${EXPECTED_ABI.napiVersion}`,
  );
  const candidates = [
    inspectCandidate(candidateAt(RELEASE_DIRECTORY), ownerUid),
    inspectCandidate(candidateAt(prebuildDirectory), ownerUid),
  ];
  if (listSome(candidates, candidate => !candidate.trusted || candidate.partial)) {
    memoizedState = unavailable('binding-artifact-invalid');
    return memoizedState;
  }
  const completeCandidates = candidates.filter(
    candidate => candidate.artifact.present && candidate.binary.present,
  );
  if (completeCandidates.length === 0) {
    memoizedState = unavailable('binding-not-built');
    return memoizedState;
  }
  const validatedCandidates = completeCandidates.map(
    candidate => validateCandidate(candidate, expectedIdentity),
  );
  const invalidCandidate = validatedCandidates.find(candidate => !candidate.valid);
  if (invalidCandidate !== undefined) {
    memoizedState = unavailable(invalidCandidate.reason);
    return memoizedState;
  }
  if (validatedCandidates.length !== 1) {
    memoizedState = unavailable('binding-layout-ambiguous');
    return memoizedState;
  }
  const selected = validatedCandidates[0];
  memoizedState = loadVerifiedPosixSnapshot(selected);
  return memoizedState;
}
