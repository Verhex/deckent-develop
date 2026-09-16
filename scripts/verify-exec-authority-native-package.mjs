#!/usr/bin/env node
// TN-PACKAGE installed-product verifier.
//
// This verifier accepts one exact, already-installed Deckent package root. It
// deliberately refuses the live repository, source-module fallbacks, symlinked
// roots, locally-built native candidates, and missing/ambiguous prebuilds. A
// successful receipt means the installed `dist/core` adapter loaded the
// packaged native loader, all packaged identities agreed, and a bounded real
// native custody publication/read lifecycle completed with confirmed cleanup.

import { createHash, randomBytes } from 'node:crypto';
import { Buffer as NodeBuffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { release as osRelease, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { types as nodeTypes } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  NPM_SHRINKWRAP_FILENAME,
  NPM_SHRINKWRAP_MAX_BYTES,
  NpmShrinkwrapContractError,
  readCanonicalNpmShrinkwrapIdentity,
} from './npm-shrinkwrap-contract.mjs';

const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIsFrozen = Object.isFrozen;
const objectKeys = Object.keys;
const arrayIsArray = Array.isArray;
const arrayJoin = Array.prototype.join;
const arraySort = Array.prototype.sort;
const numberIsSafeInteger = Number.isSafeInteger;
const numberParseInt = Number.parseInt;
const numberToString = Number.prototype.toString;
const bigIntToString = BigInt.prototype.toString;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const reflectApply = Reflect.apply;
const setHas = Set.prototype.has;
const stringEndsWith = String.prototype.endsWith;
const stringIncludes = String.prototype.includes;
const stringLocaleCompare = String.prototype.localeCompare;
const stringSlice = String.prototype.slice;
const stringSplit = String.prototype.split;
const stringStartsWith = String.prototype.startsWith;
const stringToLowerCase = String.prototype.toLowerCase;
const stringTrim = String.prototype.trim;
const TrustedError = Error;
const TrustedUint8Array = Uint8Array;
const isProxyObject = nodeTypes.isProxy;
const trustedUint8ArrayPrototype = Uint8Array.prototype;
const trustedTypedArrayPrototype = objectGetPrototypeOf(trustedUint8ArrayPrototype);
const typedArrayByteLengthGetter = objectGetOwnPropertyDescriptor(
  trustedTypedArrayPrototype,
  'byteLength',
)?.get;
const trustedObjectPrototype = Object.prototype;
const stdoutWrite = process.stdout.write.bind(process.stdout);
const stderrWrite = process.stderr.write.bind(process.stderr);

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const LIVE_REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const EXPECTED_ROOT_PACKAGE = 'deckent';
const EXPECTED_NATIVE_PACKAGE = '@deckent/exec-authority-native';
const EXPECTED_ABI_NAME = 'deckent.exec-authority';
const EXPECTED_ABI_VERSION = '1.0.0';
const EXPECTED_HANDLE_ABI = 'deckent.exec-authority.opaque-generation.v1';
const EXPECTED_EFFECT_ABI_NAME = 'deckent.execution-effect';
const EXPECTED_EFFECT_ABI_VERSION = '2.1.0';
const EXPECTED_EFFECT_HANDLE_ABI = 'deckent.execution-effect.opaque-generation.v2';
const EXPECTED_EFFECT_TRUST_DOMAIN = 'execution-effect-linux-v1';
const EXPECTED_NAPI_VERSION = 8;
const MAX_PACKAGE_JSON_BYTES = 16 * 1024;
const MAX_RUNTIME_MODULE_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 16 * 1024;
const MAX_BINARY_BYTES = 128 * 1024 * 1024;
const MAX_SOURCE_FILES = 256;
const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_TOTAL_BYTES = 32 * 1024 * 1024;
const LIFECYCLE_MAX_BYTES = 128;
const INTERNAL_CHALLENGE_MAX_BYTES = 4 * 1024;
const INTERNAL_OUTPUT_MAX_BYTES = 64 * 1024;
const INTERNAL_RUNTIME_TIMEOUT_MS = 15 * 1000;
const INTERNAL_RUNTIME_TIMEOUT_OVERRIDE_MIN_MS = 100;
const INTERNAL_RUNTIME_TIMEOUT_OVERRIDE_MAX_MS = 5 * 1000;
const INTERNAL_CHILD_MODE = '--internal-runtime-child';
const INSTALL_LIFECYCLE_NAMES = Object.freeze([
  'install',
  'postinstall',
  'preinstall',
]);
const EXPECTED_ENVIRONMENT_KINDS = new Set(['darwin', 'linux', 'win32', 'wsl2']);

function validPackageVersion(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && !reflectApply(stringIncludes, value, ['\0']);
}
const SOURCE_ROOT_FILES = Object.freeze([
  'binding.gyp',
  'index.mjs',
  'package.json',
]);
const SOURCE_EXTENSIONS = Object.freeze(['.c', '.h']);
const ARTIFACT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'abiName',
  'abiVersion',
  'handleAbi',
  'napiVersion',
  'packageName',
  'packageVersion',
  'rootPackageName',
  'rootPackageVersion',
  'platform',
  'arch',
  'buildType',
  'binaryFile',
  'binaryByteLength',
  'binarySha256',
  'nativeSourceTreeSha256',
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
const AVAILABLE_STATE_KEYS = Object.freeze([
  'available',
  'binding',
  'custody',
  'effect',
  'legacy',
  'manifest',
]);
const CUSTODY_FACADE_KEYS = Object.freeze([
  'closeHandle',
  'consumeSealReconciliation',
  'invoke',
]);
const EFFECT_FACADE_KEYS = Object.freeze([
  'appendStage', 'applyOperation', 'beginSourceRead', 'beginStage', 'captureTree',
  'closeHandle', 'finishSourceRead', 'inspectEntry', 'nextSourceChunk', 'openRoot',
  'reconcileOperation', 'sealStage', 'verifyPostimages',
]);
const EFFECT_UNSUPPORTED_KEYS = Object.freeze(['available', 'reason']);
const EFFECT_CONTRACT_KEYS = Object.freeze([
  'abiName', 'abiVersion', 'available', 'handleAbi', 'operations',
  'schemaVersion', 'trustDomain',
]);
const EXPECTED_EFFECT_OPERATIONS = Object.freeze([
  'append-stage', 'apply-operation', 'begin-source-read', 'begin-stage', 'capture-tree',
  'finish-source-read', 'inspect-entry', 'next-source-chunk', 'open-root',
  'reconcile-operation', 'seal-stage', 'verify-postimages',
]);
const SEAL_RECONCILIATION_KEYS = Object.freeze([
  'authorityHandle',
  'authorityKind',
  'identity',
  'kind',
  'outcome',
  'publicationState',
  'schemaVersion',
  'sourceGeneration',
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
const INTERNAL_CHALLENGE_KEYS = Object.freeze([
  'schemaVersion',
  'event',
  'nonce',
  'artifactSha256',
  'binarySha256',
  'platform',
  'arch',
]);
const INTERNAL_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'event',
  'nonce',
  'artifactSha256',
  'binarySha256',
  'platform',
  'arch',
  'abiVersion',
  'napiVersion',
  'features',
  'effectLifecycle',
  'lifecycle',
  'proofSha256',
]);
const LIFECYCLE_RECEIPT_KEYS = Object.freeze([
  'state',
  'byteLength',
  'payloadSha256',
  'filesystemType',
  'evidenceSha256',
]);
const EFFECT_LIFECYCLE_RECEIPT_KEYS = Object.freeze([
  'effectAbiVersion',
  'evidenceSha256',
  'manifestDigest',
  'operationDigest',
  'postimageSetDigest',
  'sourceContentDigest',
  'sourceObjectIdentityDigest',
  'sourceReadChunkCount',
  'stagingObjectIdentityDigest',
  'state',
  'trustDomain',
]);

function failure(code, detail = '') {
  return new TrustedError(detail === '' ? code : `${code}:${detail}`);
}

function fail(code, detail = '') {
  throw failure(code, detail);
}

function listAppend(values, value) {
  values[values.length] = value;
}

function setContains(values, expected) {
  return reflectApply(setHas, values, [expected]);
}

function ownData(value, key) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && objectHasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function sortedStrings(values) {
  const copy = [];
  for (let index = 0; index < values.length; index += 1) listAppend(copy, values[index]);
  reflectApply(arraySort, copy, []);
  return copy;
}

function exactDataRecord(value, expectedKeys) {
  if (value === null
    || typeof value !== 'object'
    || arrayIsArray(value)
    || isProxyObject(value)
    || objectGetPrototypeOf(value) !== trustedObjectPrototype) {
    return false;
  }
  const observed = sortedStrings(objectKeys(value));
  const expected = sortedStrings(expectedKeys);
  if (observed.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (observed[index] !== expected[index]) return false;
    const descriptor = objectGetOwnPropertyDescriptor(value, expected[index]);
    if (descriptor === undefined || !objectHasOwn(descriptor, 'value')) return false;
  }
  return true;
}

function pathInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function assertDirectory(path, code = 'E_NATIVE_VERIFY_DIRECTORY_UNSAFE') {
  let stat;
  try {
    stat = lstatSync(path, { bigint: true });
  } catch {
    fail(code, path);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync.native(path) !== path) {
    fail(code, path);
  }
}

function assertAbsent(path, code) {
  try {
    lstatSync(path);
  } catch (error) {
    if (ownData(error, 'code') === 'ENOENT') return;
    fail(code, path);
  }
  fail(code, path);
}

function assertExactDirectoryEntries(path, expected, code) {
  assertDirectory(path, code);
  const observed = sortedStrings(readdirSync(path));
  const sortedExpected = sortedStrings(expected);
  if (observed.length !== sortedExpected.length) fail(code, path);
  for (let index = 0; index < sortedExpected.length; index += 1) {
    if (observed[index] !== sortedExpected[index]) fail(code, path);
  }
}

function stableFileBytes(path, maximumBytes) {
  let named;
  try {
    named = lstatSync(path, { bigint: true });
  } catch {
    fail('E_NATIVE_VERIFY_FILE_UNSAFE', path);
  }
  if (!named.isFile()
    || named.isSymbolicLink()
    || named.nlink !== 1n
    || named.size <= 0n
    || named.size > BigInt(maximumBytes)) {
    fail('E_NATIVE_VERIFY_FILE_UNSAFE', path);
  }
  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()
      || before.nlink !== 1n
      || before.dev !== named.dev
      || before.ino !== named.ino
      || before.size !== named.size
      || before.mtimeNs !== named.mtimeNs) {
      fail('E_NATIVE_VERIFY_FILE_CHANGED', path);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || afterPath.dev !== before.dev
      || afterPath.ino !== before.ino
      || afterPath.size !== before.size
      || afterPath.mtimeNs !== before.mtimeNs
      || BigInt(bytes.byteLength) !== before.size) {
      fail('E_NATIVE_VERIFY_FILE_CHANGED', path);
    }
    return bytes;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function filesystemTypeHex(path) {
  let type;
  try {
    type = ownData(statfsSync(path, { bigint: true }), 'type');
  } catch {
    fail('E_NATIVE_VERIFY_FILESYSTEM_IDENTITY');
  }
  if (typeof type !== 'bigint') fail('E_NATIVE_VERIFY_FILESYSTEM_IDENTITY');
  return `0x${reflectApply(bigIntToString, type, [16])}`;
}

function detectEnvironmentKind(kernelRelease) {
  if (process.platform === 'darwin' || process.platform === 'win32') return process.platform;
  if (process.platform !== 'linux') return 'unsupported';
  const normalized = reflectApply(stringToLowerCase, kernelRelease, []);
  if (reflectApply(stringIncludes, normalized, ['microsoft'])) {
    return reflectApply(stringIncludes, normalized, ['wsl2']) ? 'wsl2' : 'wsl-unsupported';
  }
  return 'linux';
}

function linuxBootIdentitySha256() {
  let bootIdentity;
  try {
    bootIdentity = reflectApply(
      stringTrim,
      readFileSync('/proc/sys/kernel/random/boot_id', 'utf8'),
      [],
    );
  } catch {
    fail('E_NATIVE_VERIFY_BOOT_IDENTITY');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(bootIdentity)) {
    fail('E_NATIVE_VERIFY_BOOT_IDENTITY');
  }
  return sha256(bootIdentity);
}

function observeEnvironment(packageRoot, expectedEnvironmentKind) {
  const kernelRelease = osRelease();
  if (typeof kernelRelease !== 'string'
    || kernelRelease.length === 0
    || kernelRelease.length > 256
    || reflectApply(stringIncludes, kernelRelease, ['\0'])) {
    fail('E_NATIVE_VERIFY_KERNEL_IDENTITY');
  }
  const environmentKind = detectEnvironmentKind(kernelRelease);
  if (environmentKind !== expectedEnvironmentKind) {
    fail(
      'E_NATIVE_VERIFY_ENVIRONMENT_MISMATCH',
      `${expectedEnvironmentKind}:${environmentKind}`,
    );
  }
  const packageIdentity = lstatSync(packageRoot, { bigint: true });
  const evidence = Object.freeze({
    schemaVersion: 1,
    expectedEnvironmentKind,
    environmentKind,
    kernelRelease,
    bootIdentitySha256: process.platform === 'linux' ? linuxBootIdentitySha256() : null,
    packageFilesystemType: filesystemTypeHex(packageRoot),
    packageRootDev: reflectApply(bigIntToString, packageIdentity.dev, [10]),
    packageRootIno: reflectApply(bigIntToString, packageIdentity.ino, [10]),
  });
  return Object.freeze({
    evidence,
    evidenceSha256: sha256(reflectApply(jsonStringify, JSON, [evidence])),
  });
}

function isSha256(value) {
  if (typeof value !== 'string'
    || value.length !== 71
    || value.slice(0, 7) !== 'sha256:') {
    return false;
  }
  for (let index = 7; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) return false;
  }
  return true;
}

function readJson(path, maximumBytes) {
  const bytes = stableFileBytes(path, maximumBytes);
  let value;
  try {
    value = reflectApply(jsonParse, JSON, [bytes.toString('utf8')]);
  } catch {
    fail('E_NATIVE_VERIFY_JSON_INVALID', path);
  }
  if (value === null || typeof value !== 'object' || arrayIsArray(value)) {
    fail('E_NATIVE_VERIFY_JSON_INVALID', path);
  }
  return { bytes, value };
}

function expectedPlatform() {
  if (process.platform === 'linux' || process.platform === 'darwin' || process.platform === 'win32') {
    return process.platform;
  }
  fail('E_NATIVE_VERIFY_PLATFORM_UNSUPPORTED', process.platform);
}

function expectedArch() {
  if (process.arch === 'x64'
    || process.arch === 'arm64'
    || process.arch === 'ia32'
    || process.arch === 'arm') {
    return process.arch;
  }
  fail('E_NATIVE_VERIFY_ARCH_UNSUPPORTED', process.arch);
}

function expectedFeatures(platform) {
  if (platform === 'linux') {
    return ['custody-posix-v1', 'execution-effect-linux-v1', 'legacy-posix-fd-v1'];
  }
  if (platform === 'darwin') {
    return ['custody-posix-v1', 'legacy-posix-fd-v1'];
  }
  if (platform === 'win32') return ['custody-win32-v1'];
  fail('E_NATIVE_VERIFY_PLATFORM_UNSUPPORTED', platform);
}

function assertNoInstallLifecycle(packageJson, label) {
  const scripts = ownData(packageJson, 'scripts');
  if (scripts !== undefined
    && (scripts === null || typeof scripts !== 'object' || arrayIsArray(scripts))) {
    fail('E_NATIVE_VERIFY_INSTALL_LIFECYCLE_INVALID', label);
  }
  if (scripts !== undefined) {
    for (let index = 0; index < INSTALL_LIFECYCLE_NAMES.length; index += 1) {
      if (objectHasOwn(scripts, INSTALL_LIFECYCLE_NAMES[index])) {
        fail('E_NATIVE_VERIFY_INSTALL_LIFECYCLE_PRESENT', `${label}:${INSTALL_LIFECYCLE_NAMES[index]}`);
      }
    }
  }
}

function sourceRelativePaths(packageRoot) {
  const nativeRoot = join(packageRoot, 'native', 'exec-authority');
  const paths = [];
  for (let index = 0; index < SOURCE_ROOT_FILES.length; index += 1) {
    listAppend(paths, join(nativeRoot, SOURCE_ROOT_FILES[index]));
  }
  const sourceRoot = join(nativeRoot, 'src');
  const visit = directory => {
    assertDirectory(directory, 'E_NATIVE_VERIFY_SOURCE_DIRECTORY_UNSAFE');
    const entries = sortedStrings(readdirSync(directory));
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const path = join(directory, entry);
      const stat = lstatSync(path, { bigint: true });
      if (stat.isSymbolicLink()) fail('E_NATIVE_VERIFY_SOURCE_SYMLINK', path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isFile()) {
        let admitted = false;
        for (let extensionIndex = 0; extensionIndex < SOURCE_EXTENSIONS.length; extensionIndex += 1) {
          if (reflectApply(stringEndsWith, entry, [SOURCE_EXTENSIONS[extensionIndex]])) {
            admitted = true;
            break;
          }
        }
        if (!admitted) fail('E_NATIVE_VERIFY_SOURCE_ENTRY_UNEXPECTED', path);
        listAppend(paths, path);
      } else {
        fail('E_NATIVE_VERIFY_SOURCE_ENTRY_UNEXPECTED', path);
      }
      if (paths.length > MAX_SOURCE_FILES) fail('E_NATIVE_VERIFY_SOURCE_FILE_LIMIT');
    }
  };
  visit(sourceRoot);
  const relativePaths = [];
  for (let index = 0; index < paths.length; index += 1) {
    const platformPath = relative(packageRoot, paths[index]);
    let portablePath = '';
    for (let pathIndex = 0; pathIndex < platformPath.length; pathIndex += 1) {
      portablePath += platformPath[pathIndex] === sep ? '/' : platformPath[pathIndex];
    }
    listAppend(relativePaths, portablePath);
  }
  reflectApply(arraySort, relativePaths, [
    (left, right) => reflectApply(stringLocaleCompare, left, [right]),
  ]);
  return relativePaths;
}

function nativeSourceTreeIdentity(packageRoot) {
  const paths = sourceRelativePaths(packageRoot);
  const hash = createHash('sha256');
  let totalBytes = 0;
  for (let index = 0; index < paths.length; index += 1) {
    const relativePath = paths[index];
    const bytes = stableFileBytes(
      resolve(packageRoot, relativePath),
      MAX_SOURCE_FILE_BYTES,
    );
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SOURCE_TOTAL_BYTES) fail('E_NATIVE_VERIFY_SOURCE_BYTE_LIMIT');
    hash.update(relativePath);
    hash.update('\0');
    hash.update(reflectApply(numberToString, bytes.byteLength, []));
    hash.update('\0');
    hash.update(reflectApply(stringSlice, sha256(bytes), [7]));
    hash.update('\n');
  }
  return {
    sha256: `sha256:${hash.digest('hex')}`,
    fileCount: paths.length,
    totalBytes,
  };
}

function validateArtifact(path, rootPackage, nativePackage, platform, arch) {
  const { bytes, value } = readJson(path, MAX_ARTIFACT_BYTES);
  if (!exactDataRecord(value, ARTIFACT_KEYS)) {
    fail('E_NATIVE_VERIFY_ARTIFACT_SHAPE');
  }
  const observedOrder = objectKeys(value);
  for (let index = 0; index < ARTIFACT_KEYS.length; index += 1) {
    if (observedOrder[index] !== ARTIFACT_KEYS[index]) fail('E_NATIVE_VERIFY_ARTIFACT_CANONICAL');
  }
  const canonical = `${reflectApply(jsonStringify, JSON, [value, null, 2])}\n`;
  if (bytes.toString('utf8') !== canonical) fail('E_NATIVE_VERIFY_ARTIFACT_CANONICAL');
  if (ownData(value, 'schemaVersion') !== 1
    || ownData(value, 'kind') !== 'deckent-exec-authority-native-artifact'
    || ownData(value, 'abiName') !== EXPECTED_ABI_NAME
    || ownData(value, 'abiVersion') !== EXPECTED_ABI_VERSION
    || ownData(value, 'handleAbi') !== EXPECTED_HANDLE_ABI
    || ownData(value, 'napiVersion') !== EXPECTED_NAPI_VERSION
    || ownData(value, 'packageName') !== EXPECTED_NATIVE_PACKAGE
    || ownData(value, 'packageVersion') !== ownData(nativePackage, 'version')
    || ownData(value, 'rootPackageName') !== EXPECTED_ROOT_PACKAGE
    || ownData(value, 'rootPackageVersion') !== ownData(rootPackage, 'version')
    || ownData(value, 'platform') !== platform
    || ownData(value, 'arch') !== arch
    || ownData(value, 'buildType') !== 'Release'
    || ownData(value, 'binaryFile') !== 'exec_authority.node'
    || !numberIsSafeInteger(ownData(value, 'binaryByteLength'))
    || ownData(value, 'binaryByteLength') <= 0
    || ownData(value, 'binaryByteLength') > MAX_BINARY_BYTES
    || !isSha256(ownData(value, 'binarySha256'))
    || !isSha256(ownData(value, 'nativeSourceTreeSha256'))) {
    fail('E_NATIVE_VERIFY_ARTIFACT_CONTRACT');
  }
  return { artifact: value, artifactSha256: sha256(bytes) };
}

function exactFrozenStringArray(value, expected) {
  if (!arrayIsArray(value)
    || isProxyObject(value)
    || !objectIsFrozen(value)
    || value.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (ownData(value, reflectApply(numberToString, index, [])) !== expected[index]) return false;
  }
  return true;
}

function validateLoadedState(state, artifact, platform, arch) {
  if (!exactDataRecord(state, AVAILABLE_STATE_KEYS)
    || !objectIsFrozen(state)
    || ownData(state, 'available') !== true
    || ownData(state, 'binding') !== ownData(state, 'legacy')) {
    const reason = ownData(state, 'reason');
    fail('E_NATIVE_VERIFY_RUNTIME_UNAVAILABLE', typeof reason === 'string' ? reason : 'invalid-state');
  }
  const manifest = ownData(state, 'manifest');
  const effectContract = ownData(manifest, 'effectContract');
  if (!exactDataRecord(manifest, MANIFEST_KEYS)
    || !objectIsFrozen(manifest)
    || ownData(manifest, 'schemaVersion') !== 1
    || ownData(manifest, 'abiName') !== EXPECTED_ABI_NAME
    || ownData(manifest, 'abiVersion') !== EXPECTED_ABI_VERSION
    || ownData(manifest, 'handleAbi') !== EXPECTED_HANDLE_ABI
    || ownData(manifest, 'napiVersion') !== EXPECTED_NAPI_VERSION
    || ownData(manifest, 'packageName') !== EXPECTED_NATIVE_PACKAGE
    || ownData(manifest, 'packageVersion') !== ownData(artifact, 'packageVersion')
    || ownData(manifest, 'platform') !== platform
    || ownData(manifest, 'arch') !== arch
    || ownData(manifest, 'buildType') !== 'Release'
    || !exactDataRecord(effectContract, EFFECT_CONTRACT_KEYS)
    || !objectIsFrozen(effectContract)
    || ownData(effectContract, 'schemaVersion') !== 1
    || ownData(effectContract, 'abiName') !== EXPECTED_EFFECT_ABI_NAME
    || ownData(effectContract, 'abiVersion') !== EXPECTED_EFFECT_ABI_VERSION
    || ownData(effectContract, 'handleAbi') !== EXPECTED_EFFECT_HANDLE_ABI
    || ownData(effectContract, 'trustDomain') !== EXPECTED_EFFECT_TRUST_DOMAIN
    || ownData(effectContract, 'available') !== (platform === 'linux')
    || !exactFrozenStringArray(
      ownData(effectContract, 'operations'),
      EXPECTED_EFFECT_OPERATIONS,
    )
    || !exactFrozenStringArray(ownData(manifest, 'features'), expectedFeatures(platform))
    || !exactFrozenStringArray(ownData(manifest, 'exportSet'), EXPECTED_EXPORT_SET)) {
    fail('E_NATIVE_VERIFY_RUNTIME_MANIFEST');
  }
  const custody = ownData(state, 'custody');
  if (!exactDataRecord(custody, CUSTODY_FACADE_KEYS) || !objectIsFrozen(custody)) {
    fail('E_NATIVE_VERIFY_RUNTIME_CUSTODY', 'shape');
  }
  for (const name of ['closeHandle', 'consumeSealReconciliation', 'invoke']) {
    if (typeof ownData(custody, name) !== 'function') fail('E_NATIVE_VERIFY_RUNTIME_CUSTODY', name);
  }
  const effect = ownData(state, 'effect');
  if (platform === 'linux') {
    if (!exactDataRecord(effect, EFFECT_FACADE_KEYS) || !objectIsFrozen(effect)) {
      fail('E_NATIVE_VERIFY_RUNTIME_EFFECT', 'shape');
    }
    for (const name of EFFECT_FACADE_KEYS) {
      if (typeof ownData(effect, name) !== 'function') fail('E_NATIVE_VERIFY_RUNTIME_EFFECT', name);
    }
  } else if (!exactDataRecord(effect, EFFECT_UNSUPPORTED_KEYS)
      || !objectIsFrozen(effect)
      || ownData(effect, 'available') !== false
      || ownData(effect, 'reason') !== 'platform-unsupported') {
    fail('E_NATIVE_VERIFY_RUNTIME_EFFECT', 'unsupported-shape');
  }
  return { custody, effect, manifest };
}

function bytesEqual(left, right) {
  if (left === null
    || typeof left !== 'object'
    || objectGetPrototypeOf(left) !== trustedUint8ArrayPrototype
    || typeof typedArrayByteLengthGetter !== 'function') {
    return false;
  }
  let byteLength;
  try {
    byteLength = reflectApply(typedArrayByteLengthGetter, left, []);
  } catch {
    return false;
  }
  if (byteLength !== right.byteLength) return false;
  for (let index = 0; index < right.byteLength; index += 1) {
    if (ownData(left, reflectApply(numberToString, index, [])) !== right[index]) return false;
  }
  return true;
}

function nativeErrorCode(error) {
  const code = ownData(error, 'code');
  return typeof code === 'string' ? code : 'unknown';
}

function runCustodyLifecycle(custody) {
  const prefix = join(tmpdir(), 'deckent-installed-native-proof-');
  let lifecycleRoot = null;
  let rootHandle = null;
  let publicationHandle = null;
  let publicationAbortable = false;
  let publicationNeedsReconciliation = false;
  let readHandle = null;
  let operationError = null;
  let operationStep = 'setup';
  const cleanupFailures = [];
  let lifecycleFilesystemType = null;
  const payload = new TrustedUint8Array([
    0x64, 0x65, 0x63, 0x6b, 0x65, 0x6e, 0x74, 0x2d,
    0x6e, 0x61, 0x74, 0x69, 0x76, 0x65, 0x2d, 0x70,
    0x72, 0x6f, 0x6f, 0x66, 0x2d, 0x76, 0x31, 0x0a,
  ]);
  let receipt = null;
  try {
    lifecycleRoot = mkdtempSync(prefix);
    chmodSync(lifecycleRoot, 0o700);
    lifecycleFilesystemType = filesystemTypeHex(lifecycleRoot);
    operationStep = 'open-root';
    const opened = custody.invoke('open-root', {
      path: lifecycleRoot,
      disposition: 'OPEN_EXISTING',
      privacyPolicy: 'OWNER_PRIVATE',
    });
    if (ownData(opened, 'state') !== 'OPENED'
      || ownData(ownData(opened, 'identity'), 'objectType') !== 'DIRECTORY') {
      fail('E_NATIVE_VERIFY_LIFECYCLE_OPEN');
    }
    rootHandle = ownData(opened, 'handle');
    operationStep = 'probe-root';
    const probe = custody.invoke('probe', { handle: rootHandle });
    if (ownData(probe, 'available') !== true
      || ownData(probe, 'identity') === null
      || ownData(ownData(probe, 'identity'), 'objectType') !== 'DIRECTORY') {
      fail('E_NATIVE_VERIFY_LIFECYCLE_PROBE');
    }
    operationStep = 'begin-publication';
    publicationHandle = custody.invoke('begin-publication', {
      parent: rootHandle,
      name: 'installed-native-proof.bin',
      maxBytes: LIFECYCLE_MAX_BYTES,
    });
    publicationAbortable = true;
    operationStep = 'apply-private';
    const privateEvidence = custody.invoke('apply-private', { handle: publicationHandle });
    if (ownData(privateEvidence, 'operation') !== 'APPLY_PRIVATE'
      || ownData(privateEvidence, 'state') !== 'CONFIRMED') {
      fail('E_NATIVE_VERIFY_LIFECYCLE_PRIVACY');
    }
    operationStep = 'append-publication';
    const appended = custody.invoke('append-publication', {
      publication: publicationHandle,
      bytes: payload,
    });
    if (ownData(appended, 'state') !== 'APPENDED'
      || ownData(appended, 'byteLength') !== payload.byteLength) {
      fail('E_NATIVE_VERIFY_LIFECYCLE_APPEND');
    }
    operationStep = 'sync-publication';
    const fileSync = custody.invoke('sync', { handle: publicationHandle });
    if (ownData(fileSync, 'operation') !== 'SYNC'
      || ownData(fileSync, 'state') !== 'CONFIRMED') {
      fail('E_NATIVE_VERIFY_LIFECYCLE_SYNC');
    }
    publicationAbortable = false;
    publicationNeedsReconciliation = true;
    operationStep = 'seal-publication';
    const sealed = custody.invoke('seal-publication', {
      publication: publicationHandle,
    });
    if (ownData(sealed, 'state') !== 'CREATED') {
      fail('E_NATIVE_VERIFY_LIFECYCLE_SEAL');
    }
    const sealedReadHandle = ownData(sealed, 'readHandle');
    if (sealedReadHandle !== null && typeof sealedReadHandle === 'object') {
      readHandle = sealedReadHandle;
    }
    publicationNeedsReconciliation = false;
    publicationHandle = null;
    if (readHandle === null
      || ownData(ownData(sealed, 'identity'), 'objectType') !== 'REGULAR_FILE'
      || ownData(ownData(sealed, 'identity'), 'size')
        !== reflectApply(numberToString, payload.byteLength, [])) {
      fail('E_NATIVE_VERIFY_LIFECYCLE_SEAL');
    }
    operationStep = 'read-bounded';
    const observed = custody.invoke('read-bounded', {
      file: readHandle,
      maxBytes: payload.byteLength + 1,
    });
    if (ownData(observed, 'eof') !== true
      || ownData(observed, 'requestedMaxBytes') !== payload.byteLength + 1
      || ownData(observed, 'observedBytes') !== payload.byteLength
      || !bytesEqual(ownData(observed, 'bytes'), payload)) {
      fail('E_NATIVE_VERIFY_LIFECYCLE_READ');
    }
    operationStep = 'sync-root';
    const directorySync = custody.invoke('sync', { handle: rootHandle });
    if (ownData(directorySync, 'operation') !== 'SYNC'
      || ownData(directorySync, 'state') !== 'CONFIRMED') {
      fail('E_NATIVE_VERIFY_LIFECYCLE_DIRECTORY_SYNC');
    }
    const identity = ownData(sealed, 'identity');
    const lifecycleEvidence = {
      byteLength: payload.byteLength,
      payloadSha256: sha256(payload),
      platform: ownData(identity, 'platform'),
      objectType: ownData(identity, 'objectType'),
      size: ownData(identity, 'size'),
      linkCount: ownData(identity, 'linkCount'),
      mntId: ownData(identity, 'mntId'),
      dev: ownData(identity, 'dev'),
      ino: ownData(identity, 'ino'),
      volumeId: ownData(identity, 'volumeId'),
      fileId: ownData(identity, 'fileId'),
      filesystemType: lifecycleFilesystemType,
    };
    receipt = {
      state: 'PUBLISHED_READ_VERIFIED',
      byteLength: payload.byteLength,
      payloadSha256: lifecycleEvidence.payloadSha256,
      filesystemType: lifecycleFilesystemType,
      evidenceSha256: sha256(reflectApply(jsonStringify, JSON, [lifecycleEvidence])),
    };
  } catch (error) {
    operationError = error;
  } finally {
    if (publicationAbortable && publicationHandle !== null) {
      try {
        const cleanup = custody.invoke('abort-publication', {
          publication: publicationHandle,
        });
        if (ownData(cleanup, 'state') !== 'CLEANUP_CONFIRMED') {
          listAppend(cleanupFailures, 'publication-abort-unconfirmed');
        }
      } catch (error) {
        listAppend(cleanupFailures, `publication-abort:${nativeErrorCode(error)}`);
      }
    }
    if (publicationNeedsReconciliation && publicationHandle !== null) {
      let authorityHandle = null;
      let reconciliationValid = false;
      try {
        const reconciliation = custody.consumeSealReconciliation(publicationHandle);
        authorityHandle = ownData(reconciliation, 'authorityHandle');
        const outcome = ownData(reconciliation, 'outcome');
        const publicationState = ownData(reconciliation, 'publicationState');
        const authorityKind = ownData(reconciliation, 'authorityKind');
        reconciliationValid = exactDataRecord(reconciliation, SEAL_RECONCILIATION_KEYS)
          && objectIsFrozen(reconciliation)
          && ownData(reconciliation, 'schemaVersion') === 1
          && ownData(reconciliation, 'kind') === 'custody-seal-reconciliation'
          && outcome === 'PUBLISHED_UNCONFIRMED'
          && numberIsSafeInteger(ownData(reconciliation, 'sourceGeneration'))
          && ownData(reconciliation, 'sourceGeneration') > 0
          && ownData(ownData(reconciliation, 'identity'), 'objectType') === 'REGULAR_FILE'
          && ((publicationState === 'PUBLISHED_UNCONFIRMED'
              && authorityKind === 'PUBLICATION'
              && authorityHandle === publicationHandle)
            || (publicationState === 'CONSUMED'
              && authorityKind === 'READ_FILE'
              && authorityHandle !== null
              && typeof authorityHandle === 'object'));
        if (!reconciliationValid) {
          listAppend(cleanupFailures, outcome === 'CLEANUP_UNCONFIRMED'
            ? 'seal-reconciliation-cleanup-unconfirmed'
            : 'seal-reconciliation-invalid');
        }
      } catch (error) {
        listAppend(cleanupFailures, `seal-reconciliation:${nativeErrorCode(error)}`);
        authorityHandle = publicationHandle;
      }
      if (authorityHandle !== null && typeof authorityHandle === 'object') {
        try {
          custody.closeHandle(authorityHandle);
        } catch (error) {
          listAppend(cleanupFailures, `seal-authority-close:${nativeErrorCode(error)}`);
        }
      } else {
        listAppend(cleanupFailures, 'seal-authority-missing');
      }
      publicationHandle = null;
    }
    if (readHandle !== null) {
      try {
        custody.closeHandle(readHandle);
      } catch (error) {
        listAppend(cleanupFailures, `read-close:${nativeErrorCode(error)}`);
      }
    }
    if (rootHandle !== null) {
      try {
        custody.closeHandle(rootHandle);
      } catch (error) {
        listAppend(cleanupFailures, `root-close:${nativeErrorCode(error)}`);
      }
    }
    if (lifecycleRoot !== null) {
      try {
        rmSync(lifecycleRoot, { recursive: true, force: false });
        if (existsSync(lifecycleRoot)) listAppend(cleanupFailures, 'lifecycle-root-still-present');
      } catch {
        listAppend(cleanupFailures, 'lifecycle-root-remove');
      }
    }
  }
  if (cleanupFailures.length > 0) {
    const operationContext = operationError === null
      ? 'operation:none'
      : `operation:${operationStep}:${nativeErrorCode(operationError)}`;
    fail(
      'E_NATIVE_VERIFY_LIFECYCLE_CLEANUP',
      `${operationContext};cleanup:${reflectApply(arrayJoin, cleanupFailures, [','])}`,
    );
  }
  if (operationError !== null) {
    const message = ownData(operationError, 'message');
    if (typeof message === 'string'
      && reflectApply(stringStartsWith, message, ['E_NATIVE_VERIFY_'])) {
      throw operationError;
    }
    fail(
      'E_NATIVE_VERIFY_LIFECYCLE_NATIVE',
      `${operationStep},${nativeErrorCode(operationError)}`,
    );
  }
  if (receipt === null) fail('E_NATIVE_VERIFY_LIFECYCLE_MISSING');
  return receipt;
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

function putDigest(bytes, offset, digest) {
  if (!isSha256(digest)) fail('E_NATIVE_VERIFY_EFFECT_DIGEST_INPUT');
  const raw = NodeBuffer.from(digest.slice(7), 'hex');
  if (raw.byteLength !== 32) fail('E_NATIVE_VERIFY_EFFECT_DIGEST_INPUT');
  for (let index = 0; index < 32; index += 1) bytes[offset + index] = raw[index];
}

function effectAddEnvelope(parentIdentityDigest, contentDigest, payloadBytes, path) {
  const pathBytes = NodeBuffer.from(path, 'utf8');
  const envelope = new TrustedUint8Array(200 + pathBytes.byteLength);
  envelope[0] = 0x44; envelope[1] = 0x45; envelope[2] = 0x45; envelope[3] = 0x32;
  envelope[4] = 1;
  envelope[5] = 2;
  envelope[6] = 0;
  envelope[7] = 2;
  putBe32(envelope, 8, 0);
  putBe32(envelope, 12, 0o600);
  putBe32(envelope, 16, pathBytes.byteLength);
  putBe32(envelope, 20, 0);
  putBe64(envelope, 24, 0);
  putBe64(envelope, 32, payloadBytes);
  putDigest(envelope, 72, parentIdentityDigest);
  putDigest(envelope, 168, contentDigest);
  for (let index = 0; index < pathBytes.byteLength; index += 1) {
    envelope[200 + index] = pathBytes[index];
  }
  const operationDigest = sha256(envelope);
  putDigest(envelope, 40, operationDigest);
  return { envelope, operationDigest };
}

function effectPlanEnvelope(operationEnvelope) {
  const envelope = new TrustedUint8Array(16 + operationEnvelope.byteLength);
  envelope[0] = 0x44; envelope[1] = 0x45; envelope[2] = 0x50; envelope[3] = 0x32;
  putBe32(envelope, 4, 1);
  putBe32(envelope, 8, 1);
  putBe32(envelope, 12, operationEnvelope.byteLength);
  for (let index = 0; index < operationEnvelope.byteLength; index += 1) {
    envelope[16 + index] = operationEnvelope[index];
  }
  return envelope;
}

function runEffectLifecycle(effect, manifest, platform) {
  if (platform !== 'linux') {
    return {
      state: 'PLATFORM_UNSUPPORTED',
      effectAbiVersion: EXPECTED_EFFECT_ABI_VERSION,
      trustDomain: EXPECTED_EFFECT_TRUST_DOMAIN,
      manifestDigest: null,
      operationDigest: null,
      postimageSetDigest: null,
      sourceContentDigest: null,
      sourceObjectIdentityDigest: null,
      sourceReadChunkCount: null,
      stagingObjectIdentityDigest: null,
      evidenceSha256: sha256(`${platform}:platform-unsupported`),
    };
  }
  const lifecycleRoot = mkdtempSync(join(tmpdir(), 'deckent-installed-effect-proof-'));
  const projectPath = join(lifecycleRoot, 'project');
  const workspacePath = join(lifecycleRoot, 'workspace');
  const stagingPath = join(lifecycleRoot, 'staging');
  const handles = [];
  const payload = new TrustedUint8Array([
    0x64, 0x65, 0x63, 0x6b, 0x65, 0x6e, 0x74, 0x2d,
    0x65, 0x66, 0x66, 0x65, 0x63, 0x74, 0x2d, 0x76, 0x32, 0x0a,
  ]);
  try {
    for (const path of [projectPath, workspacePath, stagingPath]) {
      mkdirSync(path, { mode: 0o700 });
      chmodSync(path, 0o700);
    }
    const project = effect.openRoot('PROJECT', projectPath);
    const workspace = effect.openRoot('WORKSPACE', workspacePath);
    const staging = effect.openRoot('STAGING', stagingPath);
    handles.push(project.handle, workspace.handle, staging.handle);
    const captured = effect.captureTree(workspace.handle, {
      deadlineUnixMs: Date.now() + 5_000,
      maxDepth: 64,
      maxEntries: 1024,
      maxFileBytes: 1_048_576,
      maxManifestBytes: 1_048_576,
      maxNameBytes: 255,
      maxPathBytes: 4096,
      maxTotalBytes: 8_388_608,
    });
    if (ownData(captured, 'state') !== 'CAPTURED'
      || ownData(captured, 'entryCount') !== 0
      || !isSha256(ownData(captured, 'manifestDigest'))) {
      fail('E_NATIVE_VERIFY_EFFECT_CAPTURE');
    }
    const contentDigest = sha256(payload);
    const sourcePath = join(workspacePath, 'native-effect-source.bin');
    writeFileSync(sourcePath, payload, { mode: 0o600 });
    chmodSync(sourcePath, 0o600);
    const source = effect.beginSourceRead(workspace.handle, {
      deadlineUnixMs: Date.now() + 5_000,
      expectedContentDigest: contentDigest,
      expectedMode: 0o600,
      expectedSize: payload.byteLength,
      maxChunkBytes: 7,
      path: 'native-effect-source.bin',
    });
    handles.push(source.handle);
    let sourceOffset = 0;
    let sourceChunkCount = 0;
    while (sourceOffset < payload.byteLength) {
      const chunk = effect.nextSourceChunk(source.handle, 'ACTIVE');
      const chunkBytes = ownData(chunk, 'bytes');
      const chunkLength = ownData(chunk, 'byteLength');
      if (!numberIsSafeInteger(chunkLength) || chunkLength <= 0
        || ownData(chunk, 'index') !== sourceChunkCount
        || ownData(chunk, 'byteOffset') !== sourceOffset
        || !bytesEqual(chunkBytes, payload.slice(sourceOffset, sourceOffset + chunkLength))) {
        fail('E_NATIVE_VERIFY_EFFECT_SOURCE_CHUNK');
      }
      sourceOffset += chunkLength;
      sourceChunkCount += 1;
    }
    const sourceVerified = effect.finishSourceRead(source.handle);
    if (ownData(sourceVerified, 'state') !== 'VERIFIED'
      || ownData(sourceVerified, 'observedBytes') !== payload.byteLength
      || ownData(sourceVerified, 'chunkCount') !== sourceChunkCount
      || ownData(sourceVerified, 'contentDigest') !== contentDigest
      || !isSha256(ownData(sourceVerified, 'sourceObjectIdentityDigest'))) {
      fail('E_NATIVE_VERIFY_EFFECT_SOURCE_FINISH');
    }
    const stage = effect.beginStage(staging.handle, payload.byteLength, contentDigest);
    handles.push(stage.handle);
    const appended = effect.appendStage(stage.handle, payload);
    if (ownData(appended, 'observedBytes') !== payload.byteLength) {
      fail('E_NATIVE_VERIFY_EFFECT_STAGE_APPEND');
    }
    const sealed = effect.sealStage(stage.handle);
    if (ownData(sealed, 'contentDigest') !== contentDigest
      || !isSha256(ownData(sealed, 'nativeStagingObjectIdentityDigest'))) {
      fail('E_NATIVE_VERIFY_EFFECT_STAGE_SEAL');
    }
    const prepared = effectAddEnvelope(
      ownData(project, 'identityDigest'),
      contentDigest,
      payload.byteLength,
      'native-effect-proof.bin',
    );
    const applied = effect.applyOperation(project.handle, prepared.envelope, stage.handle);
    if (ownData(applied, 'state') !== 'APPLIED'
      || ownData(applied, 'operationDigest') !== prepared.operationDigest) {
      fail('E_NATIVE_VERIFY_EFFECT_APPLY');
    }
    const inspected = effect.inspectEntry(project.handle, 'native-effect-proof.bin');
    if (ownData(ownData(inspected, 'entry'), 'contentDigest') !== contentDigest) {
      fail('E_NATIVE_VERIFY_EFFECT_INSPECT');
    }
    const verified = effect.verifyPostimages(
      project.handle,
      effectPlanEnvelope(prepared.envelope),
    );
    if (ownData(verified, 'state') !== 'VERIFIED'
      || ownData(verified, 'verifiedCount') !== 1
      || !isSha256(ownData(verified, 'postimageSetDigest'))) {
      fail('E_NATIVE_VERIFY_EFFECT_VERIFY');
    }
    const evidence = {
      effectAbiVersion: ownData(ownData(manifest, 'effectContract'), 'abiVersion'),
      trustDomain: ownData(ownData(manifest, 'effectContract'), 'trustDomain'),
      manifestDigest: ownData(captured, 'manifestDigest'),
      operationDigest: prepared.operationDigest,
      postimageSetDigest: ownData(verified, 'postimageSetDigest'),
      sourceContentDigest: ownData(sourceVerified, 'contentDigest'),
      sourceObjectIdentityDigest: ownData(sourceVerified, 'sourceObjectIdentityDigest'),
      sourceReadChunkCount: ownData(sourceVerified, 'chunkCount'),
      stagingObjectIdentityDigest: ownData(sealed, 'nativeStagingObjectIdentityDigest'),
    };
    return {
      state: 'LANDING_VERIFIED',
      ...evidence,
      evidenceSha256: sha256(reflectApply(jsonStringify, JSON, [evidence])),
    };
  } finally {
    while (handles.length > 0) {
      const handle = handles.pop();
      if (handle !== undefined) effect.closeHandle(handle);
    }
    rmSync(lifecycleRoot, { recursive: true, force: false });
  }
}

function validInternalNonce(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function exactStringArray(value, expected) {
  if (!arrayIsArray(value) || value.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (ownData(value, reflectApply(numberToString, index, [])) !== expected[index]) return false;
  }
  return true;
}

function canonicalLifecycle(value) {
  return {
    state: ownData(value, 'state'),
    byteLength: ownData(value, 'byteLength'),
    payloadSha256: ownData(value, 'payloadSha256'),
    filesystemType: ownData(value, 'filesystemType'),
    evidenceSha256: ownData(value, 'evidenceSha256'),
  };
}

function canonicalEffectLifecycle(value) {
  return {
    state: ownData(value, 'state'),
    effectAbiVersion: ownData(value, 'effectAbiVersion'),
    trustDomain: ownData(value, 'trustDomain'),
    manifestDigest: ownData(value, 'manifestDigest'),
    operationDigest: ownData(value, 'operationDigest'),
    postimageSetDigest: ownData(value, 'postimageSetDigest'),
    sourceContentDigest: ownData(value, 'sourceContentDigest'),
    sourceObjectIdentityDigest: ownData(value, 'sourceObjectIdentityDigest'),
    sourceReadChunkCount: ownData(value, 'sourceReadChunkCount'),
    stagingObjectIdentityDigest: ownData(value, 'stagingObjectIdentityDigest'),
    evidenceSha256: ownData(value, 'evidenceSha256'),
  };
}

function internalProofBinding(value) {
  return {
    schemaVersion: ownData(value, 'schemaVersion'),
    event: ownData(value, 'event'),
    nonce: ownData(value, 'nonce'),
    artifactSha256: ownData(value, 'artifactSha256'),
    binarySha256: ownData(value, 'binarySha256'),
    platform: ownData(value, 'platform'),
    arch: ownData(value, 'arch'),
    abiVersion: ownData(value, 'abiVersion'),
    napiVersion: ownData(value, 'napiVersion'),
    features: ownData(value, 'features'),
    effectLifecycle: canonicalEffectLifecycle(ownData(value, 'effectLifecycle')),
    lifecycle: canonicalLifecycle(ownData(value, 'lifecycle')),
  };
}

function internalRuntimeTimeoutMs() {
  const requested = numberParseInt(
    process.env.DECKENT_NATIVE_VERIFY_CHILD_TIMEOUT_MS ?? '',
    10,
  );
  return numberIsSafeInteger(requested)
    && requested >= INTERNAL_RUNTIME_TIMEOUT_OVERRIDE_MIN_MS
    && requested <= INTERNAL_RUNTIME_TIMEOUT_OVERRIDE_MAX_MS
    ? requested
    : INTERNAL_RUNTIME_TIMEOUT_MS;
}

function isolatedChildEnvironment() {
  const temporaryDirectory = tmpdir();
  const environment = {
    TMPDIR: temporaryDirectory,
    TMP: temporaryDirectory,
    TEMP: temporaryDirectory,
  };
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
    if (typeof systemRoot !== 'string'
      || systemRoot.length === 0
      || systemRoot.length > 32 * 1024
      || systemRoot.includes('\0')) {
      fail('E_NATIVE_VERIFY_INTERNAL_SYSTEM_ROOT');
    }
    environment.SystemRoot = systemRoot;
  }
  return environment;
}

async function readInternalChallenge() {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += bytes.byteLength;
    if (byteLength > INTERNAL_CHALLENGE_MAX_BYTES) {
      fail('E_NATIVE_VERIFY_INTERNAL_CHALLENGE_TOO_LARGE');
    }
    listAppend(chunks, bytes);
  }
  process.stdin.destroy();
  const input = Buffer.concat(chunks, byteLength).toString('utf8');
  if (input.length === 0
    || input[input.length - 1] !== '\n'
    || input.indexOf('\n') !== input.length - 1
    || input.includes('\r')) {
    fail('E_NATIVE_VERIFY_INTERNAL_CHALLENGE_FRAMING');
  }
  let challenge;
  try {
    challenge = reflectApply(jsonParse, JSON, [input.slice(0, -1)]);
  } catch {
    fail('E_NATIVE_VERIFY_INTERNAL_CHALLENGE_JSON');
  }
  if (!exactDataRecord(challenge, INTERNAL_CHALLENGE_KEYS)
    || ownData(challenge, 'schemaVersion') !== 1
    || ownData(challenge, 'event') !== 'EXEC_AUTHORITY_NATIVE_INTERNAL_CHALLENGE'
    || !validInternalNonce(ownData(challenge, 'nonce'))
    || !isSha256(ownData(challenge, 'artifactSha256'))
    || !isSha256(ownData(challenge, 'binarySha256'))
    || ownData(challenge, 'platform') !== expectedPlatform()
    || ownData(challenge, 'arch') !== expectedArch()) {
    fail('E_NATIVE_VERIFY_INTERNAL_CHALLENGE_CONTRACT');
  }
  return challenge;
}

function parseInternalChildArguments(argv) {
  if (argv.length !== 3
    || argv[0] !== INTERNAL_CHILD_MODE
    || argv[1] !== '--package-root') {
    fail('E_NATIVE_VERIFY_INTERNAL_ARGUMENT');
  }
  const packageRoot = argv[2];
  if (typeof packageRoot !== 'string'
    || packageRoot.includes('\0')
    || !isAbsolute(packageRoot)
    || resolve(packageRoot) !== packageRoot) {
    fail('E_NATIVE_VERIFY_INTERNAL_PACKAGE_ROOT_INVALID');
  }
  return packageRoot;
}

async function verifyRuntimeInChild(packageRoot, challenge) {
  assertDirectory(packageRoot, 'E_NATIVE_VERIFY_INTERNAL_PACKAGE_ROOT_UNSAFE');
  const artifactRoot = join(
    packageRoot,
    'native',
    'exec-authority',
    'prebuilds',
    `${ownData(challenge, 'platform')}-${ownData(challenge, 'arch')}`,
    `napi-v${EXPECTED_NAPI_VERSION}`,
  );
  const artifactRecord = readJson(join(artifactRoot, 'artifact.json'), MAX_ARTIFACT_BYTES);
  const artifact = artifactRecord.value;
  if (!exactDataRecord(artifact, ARTIFACT_KEYS)
    || sha256(artifactRecord.bytes) !== ownData(challenge, 'artifactSha256')
    || ownData(artifact, 'binarySha256') !== ownData(challenge, 'binarySha256')
    || ownData(artifact, 'platform') !== ownData(challenge, 'platform')
    || ownData(artifact, 'arch') !== ownData(challenge, 'arch')) {
    fail('E_NATIVE_VERIFY_INTERNAL_ARTIFACT_IDENTITY');
  }
  const binarySha256 = sha256(stableFileBytes(
    join(artifactRoot, 'exec_authority.node'),
    MAX_BINARY_BYTES,
  ));
  if (binarySha256 !== ownData(challenge, 'binarySha256')) {
    fail('E_NATIVE_VERIFY_INTERNAL_BINARY_IDENTITY');
  }

  const runtimeModulePath = join(packageRoot, 'dist', 'core', 'exec-authority-native.js');
  stableFileBytes(runtimeModulePath, MAX_RUNTIME_MODULE_BYTES);
  const runtimeModule = await import(pathToFileURL(runtimeModulePath).href);
  const load = ownData(runtimeModule, 'loadExecAuthorityNative');
  if (typeof load !== 'function') fail('E_NATIVE_VERIFY_RUNTIME_EXPORT');
  let loaded;
  try {
    loaded = reflectApply(load, undefined, []);
  } catch (error) {
    fail('E_NATIVE_VERIFY_RUNTIME_LOAD', nativeErrorCode(error));
  }
  const { custody, effect, manifest } = validateLoadedState(
    loaded,
    artifact,
    ownData(challenge, 'platform'),
    ownData(challenge, 'arch'),
  );
  const lifecycle = runCustodyLifecycle(custody);
  const effectLifecycle = runEffectLifecycle(
    effect,
    manifest,
    ownData(challenge, 'platform'),
  );
  const binding = {
    schemaVersion: 1,
    event: 'EXEC_AUTHORITY_NATIVE_INTERNAL_RUNTIME_VERIFIED',
    nonce: ownData(challenge, 'nonce'),
    artifactSha256: ownData(challenge, 'artifactSha256'),
    binarySha256,
    platform: ownData(challenge, 'platform'),
    arch: ownData(challenge, 'arch'),
    abiVersion: ownData(manifest, 'abiVersion'),
    napiVersion: ownData(manifest, 'napiVersion'),
    features: ownData(manifest, 'features'),
    effectLifecycle,
    lifecycle,
  };
  return {
    ...binding,
    proofSha256: sha256(reflectApply(jsonStringify, JSON, [binding])),
  };
}

function parseInternalReceipt(bytes, challenge) {
  const output = bytes.toString('utf8');
  if (output.length === 0
    || output[output.length - 1] !== '\n'
    || output.indexOf('\n') !== output.length - 1
    || output.includes('\r')) {
    fail('E_NATIVE_VERIFY_INTERNAL_OUTPUT_FRAMING');
  }
  let receipt;
  try {
    receipt = reflectApply(jsonParse, JSON, [output.slice(0, -1)]);
  } catch {
    fail('E_NATIVE_VERIFY_INTERNAL_OUTPUT_JSON');
  }
  const platform = ownData(challenge, 'platform');
  const lifecycle = ownData(receipt, 'lifecycle');
  const effectLifecycle = ownData(receipt, 'effectLifecycle');
  const expectedEffectState = platform === 'linux'
    ? 'LANDING_VERIFIED'
    : 'PLATFORM_UNSUPPORTED';
  if (!exactDataRecord(receipt, INTERNAL_RECEIPT_KEYS)
    || ownData(receipt, 'schemaVersion') !== 1
    || ownData(receipt, 'event') !== 'EXEC_AUTHORITY_NATIVE_INTERNAL_RUNTIME_VERIFIED'
    || ownData(receipt, 'nonce') !== ownData(challenge, 'nonce')
    || ownData(receipt, 'artifactSha256') !== ownData(challenge, 'artifactSha256')
    || ownData(receipt, 'binarySha256') !== ownData(challenge, 'binarySha256')
    || platform !== expectedPlatform()
    || ownData(receipt, 'platform') !== platform
    || ownData(receipt, 'arch') !== ownData(challenge, 'arch')
    || ownData(receipt, 'abiVersion') !== EXPECTED_ABI_VERSION
    || ownData(receipt, 'napiVersion') !== EXPECTED_NAPI_VERSION
    || !exactStringArray(ownData(receipt, 'features'), expectedFeatures(platform))
    || !exactDataRecord(effectLifecycle, EFFECT_LIFECYCLE_RECEIPT_KEYS)
    || ownData(effectLifecycle, 'state') !== expectedEffectState
    || ownData(effectLifecycle, 'effectAbiVersion') !== EXPECTED_EFFECT_ABI_VERSION
    || ownData(effectLifecycle, 'trustDomain') !== EXPECTED_EFFECT_TRUST_DOMAIN
    || !isSha256(ownData(effectLifecycle, 'evidenceSha256'))
    || (platform === 'linux'
      && (!isSha256(ownData(effectLifecycle, 'manifestDigest'))
        || !isSha256(ownData(effectLifecycle, 'operationDigest'))
        || !isSha256(ownData(effectLifecycle, 'postimageSetDigest'))
        || !isSha256(ownData(effectLifecycle, 'sourceContentDigest'))
        || !isSha256(ownData(effectLifecycle, 'sourceObjectIdentityDigest'))
        || !numberIsSafeInteger(ownData(effectLifecycle, 'sourceReadChunkCount'))
        || ownData(effectLifecycle, 'sourceReadChunkCount') <= 0
        || !isSha256(ownData(effectLifecycle, 'stagingObjectIdentityDigest'))))
    || (platform !== 'linux'
      && (ownData(effectLifecycle, 'manifestDigest') !== null
        || ownData(effectLifecycle, 'operationDigest') !== null
        || ownData(effectLifecycle, 'postimageSetDigest') !== null
        || ownData(effectLifecycle, 'sourceContentDigest') !== null
        || ownData(effectLifecycle, 'sourceObjectIdentityDigest') !== null
        || ownData(effectLifecycle, 'sourceReadChunkCount') !== null
        || ownData(effectLifecycle, 'stagingObjectIdentityDigest') !== null))
    || !exactDataRecord(lifecycle, LIFECYCLE_RECEIPT_KEYS)
    || ownData(lifecycle, 'state') !== 'PUBLISHED_READ_VERIFIED'
    || !numberIsSafeInteger(ownData(lifecycle, 'byteLength'))
    || ownData(lifecycle, 'byteLength') <= 0
    || ownData(lifecycle, 'byteLength') > LIFECYCLE_MAX_BYTES
    || !isSha256(ownData(lifecycle, 'payloadSha256'))
    || typeof ownData(lifecycle, 'filesystemType') !== 'string'
    || !/^0x[0-9a-f]+$/u.test(ownData(lifecycle, 'filesystemType'))
    || !isSha256(ownData(lifecycle, 'evidenceSha256'))
    || !isSha256(ownData(receipt, 'proofSha256'))
    || ownData(receipt, 'proofSha256')
      !== sha256(reflectApply(jsonStringify, JSON, [internalProofBinding(receipt)]))) {
    fail('E_NATIVE_VERIFY_INTERNAL_OUTPUT_CONTRACT');
  }
  return receipt;
}

async function verifyRuntimeInIsolatedChild(
  packageRoot,
  artifactSha256,
  binarySha256,
  platform,
  arch,
) {
  const challenge = {
    schemaVersion: 1,
    event: 'EXEC_AUTHORITY_NATIVE_INTERNAL_CHALLENGE',
    nonce: randomBytes(32).toString('hex'),
    artifactSha256,
    binarySha256,
    platform,
    arch,
  };
  const challengeBytes = Buffer.from(
    `${reflectApply(jsonStringify, JSON, [challenge])}\n`,
    'utf8',
  );
  if (challengeBytes.byteLength > INTERNAL_CHALLENGE_MAX_BYTES) {
    fail('E_NATIVE_VERIFY_INTERNAL_CHALLENGE_TOO_LARGE');
  }

  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [
      SCRIPT_PATH,
      INTERNAL_CHILD_MODE,
      '--package-root',
      packageRoot,
    ], {
      env: isolatedChildEnvironment(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutByteLength = 0;
    let stderrByteLength = 0;
    let overflow = null;
    let timedOut = false;
    let settled = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, internalRuntimeTimeoutMs());
    const rejectOnce = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    };
    const capture = (chunks, streamName) => chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (streamName === 'stdout') stdoutByteLength += bytes.byteLength;
      else stderrByteLength += bytes.byteLength;
      const total = streamName === 'stdout' ? stdoutByteLength : stderrByteLength;
      if (total > INTERNAL_OUTPUT_MAX_BYTES) {
        overflow = streamName;
        child.kill('SIGKILL');
        return;
      }
      listAppend(chunks, bytes);
    };
    child.stdout.on('data', capture(stdoutChunks, 'stdout'));
    child.stderr.on('data', capture(stderrChunks, 'stderr'));
    child.once('error', error => {
      rejectOnce(failure('E_NATIVE_VERIFY_INTERNAL_SPAWN', nativeErrorCode(error)));
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (timedOut) {
        rejectPromise(failure('E_NATIVE_VERIFY_INTERNAL_TIMEOUT'));
        return;
      }
      if (overflow !== null) {
        rejectPromise(failure('E_NATIVE_VERIFY_INTERNAL_OUTPUT_LIMIT', overflow));
        return;
      }
      const stdout = Buffer.concat(stdoutChunks, stdoutByteLength);
      const stderr = Buffer.concat(stderrChunks, stderrByteLength);
      if (exitCode !== 0 || signal !== null) {
        rejectPromise(failure(
          'E_NATIVE_VERIFY_INTERNAL_EXIT',
          `${exitCode === null ? 'null' : exitCode}:${signal ?? 'none'}`,
        ));
        return;
      }
      if (stderr.byteLength !== 0) {
        rejectPromise(failure('E_NATIVE_VERIFY_INTERNAL_STDERR'));
        return;
      }
      resolvePromise(stdout);
    });
    child.stdin.once('error', () => {
      // A target that exits before consuming the one-shot challenge cannot
      // produce the nonce-bound receipt; close/exit validation is canonical.
    });
    child.stdin.end(challengeBytes);
  });
  return parseInternalReceipt(result, challenge);
}

function parseArguments(argv) {
  if (argv.length !== 6
    || argv[0] !== '--package-root'
    || argv[2] !== '--expected-environment'
    || argv[4] !== '--expected-shrinkwrap-sha256') {
    fail(
      'E_NATIVE_VERIFY_ARGUMENT',
      'expected --package-root <absolute-installed-root> --expected-environment <linux|wsl2|darwin|win32> --expected-shrinkwrap-sha256 <sha256:digest>',
    );
  }
  const packageRoot = argv[1];
  const expectedEnvironmentKind = argv[3];
  const expectedShrinkwrapSha256 = argv[5];
  if (typeof packageRoot !== 'string'
    || packageRoot.includes('\0')
    || !isAbsolute(packageRoot)
    || resolve(packageRoot) !== packageRoot) {
    fail('E_NATIVE_VERIFY_PACKAGE_ROOT_INVALID');
  }
  if (typeof expectedEnvironmentKind !== 'string'
    || !setContains(EXPECTED_ENVIRONMENT_KINDS, expectedEnvironmentKind)) {
    fail('E_NATIVE_VERIFY_EXPECTED_ENVIRONMENT_INVALID');
  }
  if (!isSha256(expectedShrinkwrapSha256)) {
    fail('E_NATIVE_VERIFY_EXPECTED_SHRINKWRAP_INVALID');
  }
  return Object.freeze({ packageRoot, expectedEnvironmentKind, expectedShrinkwrapSha256 });
}

function installedShrinkwrapIdentity(packageRoot, expectedShrinkwrapSha256) {
  let identity;
  try {
    identity = readCanonicalNpmShrinkwrapIdentity(packageRoot);
  } catch (error) {
    const detail = error instanceof NpmShrinkwrapContractError
      ? error.message
      : 'E_NPM_SHRINKWRAP_UNKNOWN';
    fail('E_NATIVE_VERIFY_NPM_SHRINKWRAP', detail);
  }
  if (identity.sha256 !== expectedShrinkwrapSha256) {
    fail(
      'E_NATIVE_VERIFY_NPM_SHRINKWRAP_DIGEST_MISMATCH',
      `${expectedShrinkwrapSha256}:${identity.sha256}`,
    );
  }
  return identity;
}

async function verifyInstalledPackage(
  packageRoot,
  expectedEnvironmentKind,
  expectedShrinkwrapSha256,
) {
  assertDirectory(packageRoot, 'E_NATIVE_VERIFY_PACKAGE_ROOT_UNSAFE');
  if (packageRoot === LIVE_REPOSITORY_ROOT
    || pathInside(LIVE_REPOSITORY_ROOT, packageRoot)
    || existsSync(join(packageRoot, '.git'))
    || existsSync(join(packageRoot, 'src', 'core', 'exec-authority-native.ts'))) {
    fail('E_NATIVE_VERIFY_LIVE_REPOSITORY_REJECTED');
  }
  const environment = observeEnvironment(packageRoot, expectedEnvironmentKind);

  const platform = expectedPlatform();
  const arch = expectedArch();
  const rootPackagePath = join(packageRoot, 'package.json');
  const nativeRoot = join(packageRoot, 'native', 'exec-authority');
  const nativePackagePath = join(nativeRoot, 'package.json');
  const runtimeModulePath = join(packageRoot, 'dist', 'core', 'exec-authority-native.js');
  const nativeLoaderPath = join(nativeRoot, 'index.mjs');
  assertDirectory(join(packageRoot, 'dist'));
  assertDirectory(join(packageRoot, 'dist', 'core'));
  assertDirectory(join(packageRoot, 'native'));
  assertDirectory(nativeRoot);

  const rootPackage = readJson(rootPackagePath, MAX_PACKAGE_JSON_BYTES).value;
  const nativePackage = readJson(nativePackagePath, MAX_PACKAGE_JSON_BYTES).value;
  const nativeBinary = ownData(nativePackage, 'binary');
  const nativeNapiVersions = ownData(nativeBinary, 'napi_versions');
  const runtimeNapi = numberParseInt(process.versions.napi ?? '', 10);
  if (ownData(rootPackage, 'name') !== EXPECTED_ROOT_PACKAGE
    || !validPackageVersion(ownData(rootPackage, 'version'))
    || ownData(rootPackage, 'type') !== 'module'
    || ownData(nativePackage, 'name') !== EXPECTED_NATIVE_PACKAGE
    || !validPackageVersion(ownData(nativePackage, 'version'))
    || ownData(nativePackage, 'private') !== true
    || ownData(nativePackage, 'main') !== 'index.mjs'
    || ownData(nativePackage, 'type') !== 'module'
    || !exactDataRecord(nativeBinary, ['napi_versions'])
    || !arrayIsArray(nativeNapiVersions)
    || nativeNapiVersions.length !== 1
    || ownData(nativeNapiVersions, '0') !== EXPECTED_NAPI_VERSION
    || !numberIsSafeInteger(runtimeNapi)
    || runtimeNapi < EXPECTED_NAPI_VERSION) {
    fail('E_NATIVE_VERIFY_PACKAGE_IDENTITY');
  }
  assertNoInstallLifecycle(rootPackage, 'root');
  assertNoInstallLifecycle(nativePackage, 'native');
  const npmShrinkwrapIdentity = installedShrinkwrapIdentity(
    packageRoot,
    expectedShrinkwrapSha256,
  );
  if (ownData(rootPackage, 'gypfile') === true) fail('E_NATIVE_VERIFY_ROOT_GYPFILE');
  assertAbsent(join(packageRoot, 'binding.gyp'), 'E_NATIVE_VERIFY_ROOT_BINDING_GYP');
  assertAbsent(join(nativeRoot, 'build'), 'E_NATIVE_VERIFY_SOURCE_FALLBACK_PRESENT');

  const prebuildRoot = join(nativeRoot, 'prebuilds');
  const platformDirectoryName = `${platform}-${arch}`;
  const napiDirectoryName = `napi-v${EXPECTED_NAPI_VERSION}`;
  assertExactDirectoryEntries(
    prebuildRoot,
    [platformDirectoryName],
    'E_NATIVE_VERIFY_PREBUILD_LAYOUT',
  );
  const platformRoot = join(prebuildRoot, platformDirectoryName);
  assertExactDirectoryEntries(
    platformRoot,
    [napiDirectoryName],
    'E_NATIVE_VERIFY_PREBUILD_LAYOUT',
  );
  const artifactRoot = join(platformRoot, napiDirectoryName);
  assertExactDirectoryEntries(
    artifactRoot,
    ['artifact.json', 'exec_authority.node'],
    'E_NATIVE_VERIFY_PREBUILD_LAYOUT',
  );

  const sourceIdentity = nativeSourceTreeIdentity(packageRoot);
  const { artifact, artifactSha256 } = validateArtifact(
    join(artifactRoot, 'artifact.json'),
    rootPackage,
    nativePackage,
    platform,
    arch,
  );
  const binaryBytes = stableFileBytes(
    join(artifactRoot, 'exec_authority.node'),
    MAX_BINARY_BYTES,
  );
  const binarySha256 = sha256(binaryBytes);
  if (binaryBytes.byteLength !== ownData(artifact, 'binaryByteLength')
    || binarySha256 !== ownData(artifact, 'binarySha256')) {
    fail('E_NATIVE_VERIFY_BINARY_IDENTITY');
  }
  if (sourceIdentity.sha256 !== ownData(artifact, 'nativeSourceTreeSha256')) {
    fail('E_NATIVE_VERIFY_SOURCE_IDENTITY');
  }

  const runtimeModuleBytes = stableFileBytes(runtimeModulePath, MAX_RUNTIME_MODULE_BYTES);
  const nativeLoaderBytes = stableFileBytes(nativeLoaderPath, MAX_RUNTIME_MODULE_BYTES);
  const expectedLoaderLiteral = "'../../native/exec-authority/index.mjs'";
  const runtimeSource = runtimeModuleBytes.toString('utf8');
  const loaderLiteralIndex = runtimeSource.indexOf(expectedLoaderLiteral);
  if (loaderLiteralIndex < 0
    || runtimeSource.indexOf(expectedLoaderLiteral, loaderLiteralIndex + 1) >= 0
    || runtimeSource.includes('/src/core/exec-authority-native')) {
    fail('E_NATIVE_VERIFY_RUNTIME_LOADER_CHAIN');
  }

  const runtimeAdapterSha256 = sha256(runtimeModuleBytes);
  const nativeLoaderSha256 = sha256(nativeLoaderBytes);
  const runtimeProof = await verifyRuntimeInIsolatedChild(
    packageRoot,
    artifactSha256,
    binarySha256,
    platform,
    arch,
  );
  const lifecycle = ownData(runtimeProof, 'lifecycle');
  const effectLifecycle = ownData(runtimeProof, 'effectLifecycle');
  const postSourceIdentity = nativeSourceTreeIdentity(packageRoot);
  const postArtifactSha256 = sha256(stableFileBytes(
    join(artifactRoot, 'artifact.json'),
    MAX_ARTIFACT_BYTES,
  ));
  const postBinaryBytes = stableFileBytes(
    join(artifactRoot, 'exec_authority.node'),
    MAX_BINARY_BYTES,
  );
  const postNpmShrinkwrapBytes = stableFileBytes(
    join(packageRoot, NPM_SHRINKWRAP_FILENAME),
    NPM_SHRINKWRAP_MAX_BYTES,
  );
  const postNpmShrinkwrapSha256 = sha256(postNpmShrinkwrapBytes);
  if (postSourceIdentity.sha256 !== sourceIdentity.sha256
    || postSourceIdentity.fileCount !== sourceIdentity.fileCount
    || postSourceIdentity.totalBytes !== sourceIdentity.totalBytes
    || postArtifactSha256 !== artifactSha256
    || postBinaryBytes.byteLength !== binaryBytes.byteLength
    || sha256(postBinaryBytes) !== binarySha256
    || sha256(stableFileBytes(runtimeModulePath, MAX_RUNTIME_MODULE_BYTES))
      !== runtimeAdapterSha256
    || sha256(stableFileBytes(nativeLoaderPath, MAX_RUNTIME_MODULE_BYTES))
      !== nativeLoaderSha256
    || postNpmShrinkwrapSha256 !== npmShrinkwrapIdentity.sha256
    || postNpmShrinkwrapBytes.byteLength !== npmShrinkwrapIdentity.byteLength) {
    fail('E_NATIVE_VERIFY_PACKAGE_CHANGED_DURING_PROOF');
  }
  const postEnvironment = observeEnvironment(packageRoot, expectedEnvironmentKind);
  if (postEnvironment.evidenceSha256 !== environment.evidenceSha256) {
    fail('E_NATIVE_VERIFY_ENVIRONMENT_CHANGED_DURING_PROOF');
  }
  const packageEvidenceSha256 = sha256(reflectApply(jsonStringify, JSON, [{
    artifactSha256,
    binarySha256,
    environmentEvidenceSha256: environment.evidenceSha256,
    effectLifecycleEvidenceSha256: ownData(effectLifecycle, 'evidenceSha256'),
    lifecycleEvidenceSha256: lifecycle.evidenceSha256,
    nativeSourceTreeSha256: sourceIdentity.sha256,
    npmShrinkwrapByteLength: npmShrinkwrapIdentity.byteLength,
    npmShrinkwrapPackageCount: npmShrinkwrapIdentity.packageCount,
    npmShrinkwrapSha256: npmShrinkwrapIdentity.sha256,
    runtimeAdapterSha256,
    nativeLoaderSha256,
  }]));

  return {
    schemaVersion: 1,
    event: 'EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_VERIFIED',
    rootPackageName: EXPECTED_ROOT_PACKAGE,
    rootPackageVersion: ownData(rootPackage, 'version'),
    nativePackageName: EXPECTED_NATIVE_PACKAGE,
    nativePackageVersion: ownData(nativePackage, 'version'),
    platform,
    arch,
    abiVersion: ownData(runtimeProof, 'abiVersion'),
    napiVersion: ownData(runtimeProof, 'napiVersion'),
    runtimeNapiVersion: runtimeNapi,
    environment: environment.evidence,
    environmentEvidenceSha256: environment.evidenceSha256,
    features: ownData(runtimeProof, 'features'),
    executionEffect: effectLifecycle,
    artifactSha256,
    binarySha256,
    nativeSourceTreeSha256: sourceIdentity.sha256,
    nativeSourceFileCount: sourceIdentity.fileCount,
    nativeSourceTotalBytes: sourceIdentity.totalBytes,
    npmShrinkwrapSha256: npmShrinkwrapIdentity.sha256,
    npmShrinkwrapByteLength: npmShrinkwrapIdentity.byteLength,
    npmShrinkwrapPackageCount: npmShrinkwrapIdentity.packageCount,
    runtimeAdapterSha256,
    nativeLoaderSha256,
    packageEvidenceSha256,
    installTimeNativeBuild: 'ABSENT',
    installTimeNativeDownload: 'ABSENT',
    nativeArtifactOrigin: 'PACKAGED_PREBUILD',
    lifecycle,
  };
}

try {
  const argv = process.argv.slice(2);
  let receipt;
  if (argv[0] === INTERNAL_CHILD_MODE) {
    const packageRoot = parseInternalChildArguments(argv);
    const challenge = await readInternalChallenge();
    receipt = await verifyRuntimeInChild(packageRoot, challenge);
  } else {
    const {
      packageRoot,
      expectedEnvironmentKind,
      expectedShrinkwrapSha256,
    } = parseArguments(argv);
    receipt = await verifyInstalledPackage(
      packageRoot,
      expectedEnvironmentKind,
      expectedShrinkwrapSha256,
    );
  }
  stdoutWrite(`${reflectApply(jsonStringify, JSON, [receipt])}\n`);
} catch (error) {
  stderrWrite(`${reflectApply(jsonStringify, JSON, [{
    schemaVersion: 1,
    event: 'EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_REJECTED',
    code: error instanceof TrustedError
      ? reflectApply(stringSplit, error.message, [':', 1])[0]
      : 'E_NATIVE_VERIFY_UNKNOWN',
    detail: error instanceof TrustedError ? error.message : 'E_NATIVE_VERIFY_UNKNOWN',
  }])}\n`);
  process.exitCode = 1;
}
