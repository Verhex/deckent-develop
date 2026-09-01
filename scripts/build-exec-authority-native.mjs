#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXEC_AUTHORITY_NAPI_VERSION = 8;
export const EXEC_AUTHORITY_ABI_NAME = 'deckent.exec-authority';
export const EXEC_AUTHORITY_ABI_VERSION = '1.0.0';
export const EXEC_AUTHORITY_HANDLE_ABI = 'deckent.exec-authority.opaque-generation.v1';
export const EXEC_AUTHORITY_NATIVE_PACKAGE = '@deckent/exec-authority-native';
export const EXEC_AUTHORITY_NODE_GYP_VERSION = '12.2.0';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE_RELATIVE_ROOT = 'native/exec-authority';
const NATIVE_ROOT = join(ROOT, NATIVE_RELATIVE_ROOT);
const MAX_SOURCE_FILES = 256;
const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_CHILD_OUTPUT_BYTES = 2 * 1024 * 1024;
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const SOURCE_ROOT_FILES = Object.freeze([
  'binding.gyp',
  'index.mjs',
  'package.json',
]);
const SOURCE_EXTENSIONS = Object.freeze(['.c', '.h']);
const EXPECTED_EXPORT_SET = Object.freeze([
  'capabilityManifest',
  'closeFd',
  'custodyCloseHandle',
  'custodyInvoke',
  'fdPath',
  'fstatIdentity',
  'hostBootIdentity',
  'mountIdentity',
  'openDirAt',
  'readdirFd',
  'renameAt',
  'unlinkAt',
]);
const ARTIFACT_KEYS = Object.freeze([
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

function fail(code, detail = '') {
  throw new Error(detail === '' ? code : `${code}:${detail}`);
}

function pathInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function assertGeneratedPath(path) {
  const resolved = resolve(path);
  if (!pathInside(NATIVE_ROOT, resolved)) fail('E_NATIVE_BUILD_PATH_OUTSIDE_ROOT', resolved);
  return resolved;
}

function stableFileBytes(path, maximumBytes = MAX_SOURCE_FILE_BYTES, requiredLinkCount = 1n) {
  const named = lstatSync(path, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink()
    || (requiredLinkCount !== null && named.nlink !== requiredLinkCount)
    || named.size <= 0n || named.size > BigInt(maximumBytes)) {
    fail('E_NATIVE_SOURCE_FILE_UNSAFE', path);
  }
  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()
      || (requiredLinkCount !== null && before.nlink !== requiredLinkCount)
      || before.nlink !== named.nlink
      || before.dev !== named.dev || before.ino !== named.ino
      || before.size !== named.size || before.mtimeNs !== named.mtimeNs) {
      fail('E_NATIVE_SOURCE_FILE_CHANGED', path);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino
      || after.nlink !== before.nlink
      || after.size !== before.size || after.mtimeNs !== before.mtimeNs
      || afterPath.dev !== before.dev || afterPath.ino !== before.ino
      || afterPath.nlink !== before.nlink
      || afterPath.size !== before.size || afterPath.mtimeNs !== before.mtimeNs
      || BigInt(bytes.byteLength) !== before.size) {
      fail('E_NATIVE_SOURCE_FILE_CHANGED', path);
    }
    return bytes;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function stableGeneratedBinaryBytes(path, expectedHardlinkPath, maximumBytes) {
  const named = lstatSync(path, { bigint: true });
  if (named.nlink === 1n) return stableFileBytes(path, maximumBytes);
  if (named.nlink !== 2n) fail('E_NATIVE_BUILD_OUTPUT_LINK_UNSAFE', path);
  const peer = lstatSync(expectedHardlinkPath, { bigint: true });
  if (!peer.isFile() || peer.isSymbolicLink() || peer.nlink !== 2n
    || peer.dev !== named.dev || peer.ino !== named.ino
    || peer.size !== named.size || peer.mtimeNs !== named.mtimeNs) {
    fail('E_NATIVE_BUILD_OUTPUT_LINK_UNSAFE', expectedHardlinkPath);
  }
  const bytes = stableFileBytes(path, maximumBytes, null);
  const afterNamed = lstatSync(path, { bigint: true });
  const afterPeer = lstatSync(expectedHardlinkPath, { bigint: true });
  if (!afterNamed.isFile() || afterNamed.isSymbolicLink() || afterNamed.nlink !== 2n
    || afterNamed.dev !== named.dev || afterNamed.ino !== named.ino
    || afterNamed.size !== named.size || afterNamed.mtimeNs !== named.mtimeNs
    || !afterPeer.isFile() || afterPeer.isSymbolicLink() || afterPeer.nlink !== 2n
    || afterPeer.dev !== named.dev || afterPeer.ino !== named.ino
    || afterPeer.size !== named.size || afterPeer.mtimeNs !== named.mtimeNs) {
    fail('E_NATIVE_BUILD_OUTPUT_CHANGED', expectedHardlinkPath);
  }
  return bytes;
}

function assertDirectory(path) {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync.native(path) !== path) {
    fail('E_NATIVE_SOURCE_DIRECTORY_UNSAFE', path);
  }
}

export function nativeSourceRelativePaths(packageRoot = ROOT) {
  const root = realpathSync.native(packageRoot);
  const nativeRoot = join(root, NATIVE_RELATIVE_ROOT);
  assertDirectory(nativeRoot);
  const paths = SOURCE_ROOT_FILES.map(name => join(nativeRoot, name));
  const sourceRoot = join(nativeRoot, 'src');
  assertDirectory(sourceRoot);
  const visit = directory => {
    assertDirectory(directory);
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      const stat = lstatSync(path, { bigint: true });
      if (stat.isSymbolicLink()) fail('E_NATIVE_SOURCE_SYMLINK', path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isFile() && SOURCE_EXTENSIONS.some(extension => entry.endsWith(extension))) {
        paths.push(path);
      } else {
        fail('E_NATIVE_SOURCE_ENTRY_UNSUPPORTED', path);
      }
      if (paths.length > MAX_SOURCE_FILES) fail('E_NATIVE_SOURCE_FILE_LIMIT');
    }
  };
  visit(sourceRoot);
  return paths
    .map(path => relative(root, path).split(sep).join('/'))
    .sort((left, right) => left.localeCompare(right));
}

export function nativeSourceTreeIdentity(packageRoot = ROOT) {
  const root = realpathSync.native(packageRoot);
  const paths = nativeSourceRelativePaths(root);
  const hash = createHash('sha256');
  let totalBytes = 0;
  const entries = [];
  for (const relativePath of paths) {
    const bytes = stableFileBytes(join(root, ...relativePath.split('/')));
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SOURCE_TOTAL_BYTES) fail('E_NATIVE_SOURCE_BYTE_LIMIT');
    hash.update(relativePath);
    hash.update('\0');
    hash.update(String(bytes.byteLength));
    hash.update('\0');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    hash.update(sha256);
    hash.update('\n');
    entries.push(Object.freeze({ relativePath, byteLength: bytes.byteLength, sha256 }));
  }
  return Object.freeze({
    sha256: `sha256:${hash.digest('hex')}`,
    fileCount: paths.length,
    totalBytes,
    paths: Object.freeze(paths),
    entries: Object.freeze(entries),
  });
}

export function expectedNativePlatform() {
  if (process.platform === 'linux' || process.platform === 'darwin' || process.platform === 'win32') {
    return process.platform;
  }
  fail('E_NATIVE_PLATFORM_UNSUPPORTED', process.platform);
}

export function expectedNativeArch() {
  if (['x64', 'arm64', 'ia32', 'arm'].includes(process.arch)) return process.arch;
  fail('E_NATIVE_ARCH_UNSUPPORTED', process.arch);
}

export function expectedNativeFeatures(platform = expectedNativePlatform()) {
  if (platform === 'linux' || platform === 'darwin') {
    return Object.freeze(['custody-posix-v1', 'legacy-posix-fd-v1']);
  }
  if (platform === 'win32') return Object.freeze(['custody-win32-v1']);
  fail('E_NATIVE_PLATFORM_UNSUPPORTED', platform);
}

function readJson(path, maximumBytes = 1024 * 1024) {
  try {
    return JSON.parse(stableFileBytes(path, maximumBytes).toString('utf8'));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('E_NATIVE_')) throw error;
    fail('E_NATIVE_JSON_INVALID', path);
  }
}

function validPackageVersion(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && !value.includes('\0');
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function assertNoInstallLifecycle(packageJson, label) {
  const scripts = packageJson?.scripts;
  if (scripts !== undefined
    && (scripts === null || typeof scripts !== 'object' || Array.isArray(scripts))) {
    fail('E_NATIVE_PACKAGE_INSTALL_LIFECYCLE', label);
  }
  if (scripts !== undefined
    && ['preinstall', 'install', 'postinstall'].some(name => Object.hasOwn(scripts, name))) {
    fail('E_NATIVE_PACKAGE_INSTALL_LIFECYCLE', label);
  }
}

function exactFrozenStringArray(value, expected) {
  return Array.isArray(value) && Object.isFrozen(value) && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function validateRawBinding(raw, nativeVersion, platform, arch) {
  if (raw === null || typeof raw !== 'object' || !Object.isFrozen(raw)
    || Reflect.ownKeys(raw).map(String).sort().join('\0') !== [...EXPECTED_EXPORT_SET].sort().join('\0')) {
    fail('E_NATIVE_BINDING_EXPORT_CONTRACT');
  }
  const manifest = raw.capabilityManifest;
  const keys = [
    'abiName', 'abiVersion', 'arch', 'buildType', 'exportSet', 'features', 'handleAbi',
    'napiVersion', 'packageName', 'packageVersion', 'platform', 'schemaVersion',
  ];
  if (!exactKeys(manifest, keys) || !Object.isFrozen(manifest)
    || manifest.schemaVersion !== 1
    || manifest.abiName !== EXEC_AUTHORITY_ABI_NAME
    || manifest.abiVersion !== EXEC_AUTHORITY_ABI_VERSION
    || manifest.handleAbi !== EXEC_AUTHORITY_HANDLE_ABI
    || manifest.napiVersion !== EXEC_AUTHORITY_NAPI_VERSION
    || manifest.packageName !== EXEC_AUTHORITY_NATIVE_PACKAGE
    || manifest.packageVersion !== nativeVersion
    || manifest.platform !== platform || manifest.arch !== arch
    || manifest.buildType !== 'Release'
    || !exactFrozenStringArray(manifest.features, expectedNativeFeatures(platform))
    || !exactFrozenStringArray(manifest.exportSet, EXPECTED_EXPORT_SET)) {
    fail('E_NATIVE_BINDING_MANIFEST_CONTRACT');
  }
  for (const name of EXPECTED_EXPORT_SET) {
    if (name !== 'capabilityManifest' && typeof raw[name] !== 'function') {
      fail('E_NATIVE_BINDING_EXPORT_CONTRACT', name);
    }
  }
  return manifest;
}

function nodeHeaderCandidates() {
  const version = process.versions.node;
  const home = homedir();
  const candidates = [];
  const configured = process.env.npm_config_nodedir;
  if (typeof configured === 'string' && configured !== '' && isAbsolute(configured)) {
    candidates.push(configured);
  }
  candidates.push(resolve(dirname(process.execPath), '..'));
  candidates.push(dirname(process.execPath));
  candidates.push(join(home, '.cache', 'node-gyp', version));
  if (process.platform === 'darwin') {
    candidates.push(join(home, 'Library', 'Caches', 'node-gyp', version));
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (typeof localAppData === 'string' && localAppData !== '' && isAbsolute(localAppData)) {
      candidates.push(join(localAppData, 'node-gyp', 'Cache', version));
    }
  }
  return [...new Set(candidates.map(candidate => resolve(candidate)))];
}

function nodeHeaderVersionMatches(nodeVersionHeader) {
  const text = stableFileBytes(nodeVersionHeader).toString('utf8');
  const [major, minor, patch] = process.versions.node.split('.');
  return new RegExp(`^#define NODE_MAJOR_VERSION ${major}$`, 'mu').test(text)
    && new RegExp(`^#define NODE_MINOR_VERSION ${minor}$`, 'mu').test(text)
    && new RegExp(`^#define NODE_PATCH_VERSION ${patch}$`, 'mu').test(text);
}

function resolveLocalNodeHeaders() {
  const failures = [];
  for (const candidate of nodeHeaderCandidates()) {
    try {
      if (!existsSync(candidate)) continue;
      const canonical = realpathSync.native(candidate);
      const includeRoot = join(canonical, 'include', 'node');
      assertDirectory(includeRoot);
      const nodeVersionHeader = join(includeRoot, 'node_version.h');
      for (const name of ['node_api.h', 'common.gypi', 'config.gypi', 'node_version.h']) {
        stableFileBytes(join(includeRoot, name));
      }
      if (!nodeHeaderVersionMatches(nodeVersionHeader)) {
        failures.push(`${canonical}:version-mismatch`);
        continue;
      }
      return canonical;
    } catch (error) {
      failures.push(`${candidate}:${error instanceof Error ? error.message.split(':', 1)[0] : 'invalid'}`);
    }
  }
  fail('E_NATIVE_NODE_HEADERS_UNAVAILABLE', failures.join(','));
}

function localToolchain() {
  const nodeGypPackagePath = join(ROOT, 'node_modules', 'node-gyp', 'package.json');
  const nodeGypEntry = join(ROOT, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
  const nodeGypPackage = readJson(nodeGypPackagePath);
  if (nodeGypPackage.name !== 'node-gyp' || nodeGypPackage.version !== EXEC_AUTHORITY_NODE_GYP_VERSION
    || !existsSync(nodeGypEntry)) {
    fail('E_NATIVE_NODE_GYP_UNPINNED');
  }
  return Object.freeze({ nodeGypEntry, nodePrefix: resolveLocalNodeHeaders() });
}

function runChild(command, args, cwd, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let outputExceeded = false;
    const append = (current, chunk) => {
      const next = current + chunk.toString();
      if (Buffer.byteLength(next) > MAX_CHILD_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill('SIGTERM');
        return current;
      }
      return next;
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => child.kill('SIGTERM'), BUILD_TIMEOUT_MS);
    child.once('error', error => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, signal, stdout, stderr, outputExceeded });
    });
  });
}

function copySourceToStage(stage, sourceIdentity) {
  for (const entry of sourceIdentity.entries) {
    const { relativePath } = entry;
    const sourceBytes = stableFileBytes(join(ROOT, ...relativePath.split('/')));
    const observedSha256 = createHash('sha256').update(sourceBytes).digest('hex');
    if (sourceBytes.byteLength !== entry.byteLength || observedSha256 !== entry.sha256) {
      fail('E_NATIVE_SOURCE_CHANGED_AFTER_IDENTITY', relativePath);
    }
    if (relativePath.endsWith('/index.mjs')) continue;
    const nativeRelative = relativePath.slice(`${NATIVE_RELATIVE_ROOT}/`.length);
    const destination = join(stage, ...nativeRelative.split('/'));
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, sourceBytes, { flag: 'wx', mode: 0o600 });
    chmodSync(destination, 0o600);
    syncFile(destination);
  }
}

function syncFile(path) {
  const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function syncDirectory(path) {
  const fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function removeGeneratedTree(path) {
  const resolved = assertGeneratedPath(path);
  if (!existsSync(resolved)) return;
  if (lstatSync(resolved).isSymbolicLink()) fail('E_NATIVE_GENERATED_PATH_SYMLINK', resolved);
  rmSync(resolved, { recursive: true, force: false });
}

function installArtifactPair(binaryBytes, artifact) {
  const platformDirectoryName = `${artifact.platform}-${artifact.arch}`;
  const prebuildRoot = join(NATIVE_ROOT, 'prebuilds');
  mkdirSync(prebuildRoot, { recursive: true, mode: 0o700 });
  assertDirectory(prebuildRoot);
  const preexisting = readdirSync(prebuildRoot);
  if (preexisting.length !== 0) fail('E_NATIVE_PREBUILD_STALE_CANDIDATE', preexisting.join(','));
  const finalPlatform = join(prebuildRoot, platformDirectoryName);
  const nonce = `${process.pid}-${Date.now().toString(36)}`;
  const nextPlatform = join(prebuildRoot, `.next-${nonce}`);
  const nextTarget = join(nextPlatform, `napi-v${EXEC_AUTHORITY_NAPI_VERSION}`);
  mkdirSync(nextTarget, { recursive: true, mode: 0o700 });
  const nextBinary = join(nextTarget, 'exec_authority.node');
  const nextArtifact = join(nextTarget, 'artifact.json');
  const binarySha256 = `sha256:${createHash('sha256').update(binaryBytes).digest('hex')}`;
  if (binaryBytes.byteLength !== artifact.binaryByteLength || binarySha256 !== artifact.binarySha256) {
    fail('E_NATIVE_BINARY_CHANGED_AFTER_VALIDATION');
  }
  writeFileSync(nextBinary, binaryBytes, { flag: 'wx', mode: 0o600 });
  chmodSync(nextBinary, 0o600);
  writeFileSync(nextArtifact, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  syncFile(nextBinary);
  syncFile(nextArtifact);
  syncDirectory(nextTarget);
  syncDirectory(nextPlatform);
  let installed = false;
  try {
    renameSync(nextPlatform, finalPlatform);
    installed = true;
    syncDirectory(prebuildRoot);
  } catch (error) {
    const incompletePath = installed ? finalPlatform : nextPlatform;
    if (existsSync(incompletePath)) removeGeneratedTree(incompletePath);
    throw error;
  }
}

function assertPristineGeneratedState() {
  const buildRoot = join(NATIVE_ROOT, 'build');
  if (existsSync(buildRoot)) fail('E_NATIVE_BUILD_PREEXISTING_OUTPUT', buildRoot);
  const prebuildRoot = join(NATIVE_ROOT, 'prebuilds');
  if (existsSync(prebuildRoot)) {
    assertDirectory(prebuildRoot);
    const entries = readdirSync(prebuildRoot);
    if (entries.length !== 0) fail('E_NATIVE_PREBUILD_STALE_CANDIDATE', entries.join(','));
  }
  const stages = readdirSync(NATIVE_ROOT).filter(entry =>
    entry.startsWith('.build-stage-') || entry.startsWith('.next-') || entry.startsWith('.backup-'));
  if (stages.length !== 0) fail('E_NATIVE_BUILD_STALE_STAGE', stages.join(','));
}

function cleanGeneratedOutputs() {
  removeGeneratedTree(join(NATIVE_ROOT, 'build'));
  removeGeneratedTree(join(NATIVE_ROOT, 'prebuilds'));
  for (const entry of readdirSync(NATIVE_ROOT)) {
    if (entry.startsWith('.build-stage-')) removeGeneratedTree(join(NATIVE_ROOT, entry));
  }
}

export async function buildExecAuthorityNative() {
  if (realpathSync.native(ROOT) !== ROOT || realpathSync.native(NATIVE_ROOT) !== NATIVE_ROOT) {
    fail('E_NATIVE_BUILD_ROOT_UNSAFE');
  }
  const platform = expectedNativePlatform();
  const arch = expectedNativeArch();
  const runtimeNapi = Number.parseInt(process.versions.napi ?? '', 10);
  if (!Number.isSafeInteger(runtimeNapi) || runtimeNapi < EXEC_AUTHORITY_NAPI_VERSION) {
    fail('E_NATIVE_RUNTIME_NAPI_UNSUPPORTED');
  }
  assertPristineGeneratedState();
  const sourceIdentity = nativeSourceTreeIdentity(ROOT);
  const rootPackage = readJson(join(ROOT, 'package.json'), 16 * 1024);
  const nativePackage = readJson(join(NATIVE_ROOT, 'package.json'), 16 * 1024);
  const nativeBinary = nativePackage.binary;
  if (rootPackage.name !== 'deckent' || !validPackageVersion(rootPackage.version)
    || nativePackage.name !== EXEC_AUTHORITY_NATIVE_PACKAGE
    || !validPackageVersion(nativePackage.version)
    || nativePackage.private !== true
    || nativePackage.main !== 'index.mjs'
    || nativePackage.type !== 'module'
    || !exactKeys(nativeBinary, ['napi_versions'])
    || !Array.isArray(nativeBinary.napi_versions)
    || nativeBinary.napi_versions.length !== 1
    || nativeBinary.napi_versions[0] !== EXEC_AUTHORITY_NAPI_VERSION
    || rootPackage.gypfile === true) {
    fail('E_NATIVE_PACKAGE_IDENTITY');
  }
  assertNoInstallLifecycle(rootPackage, 'root');
  assertNoInstallLifecycle(nativePackage, 'native');
  const toolchain = localToolchain();
  const stage = mkdtempSync(join(NATIVE_ROOT, '.build-stage-'));
  chmodSync(stage, 0o700);
  try {
    copySourceToStage(stage, sourceIdentity);
    const result = await runChild(
      process.execPath,
      [toolchain.nodeGypEntry, 'rebuild', '--release', `--nodedir=${toolchain.nodePrefix}`],
      stage,
      {
        ...process.env,
        npm_config_nodedir: toolchain.nodePrefix,
        npm_config_offline: 'true',
        npm_config_update_notifier: 'false',
      },
    );
    if (result.code !== 0 || result.signal !== null || result.outputExceeded) {
      fail('E_NATIVE_BUILD_FAILED', `${result.code}:${result.signal ?? 'none'}:${result.stderr.slice(-2000)}`);
    }
    const binaryPath = join(stage, 'build', 'Release', 'exec_authority.node');
    const binaryPeerPath = join(stage, 'build', 'Release', 'obj.target', 'exec_authority.node');
    const debugPath = join(stage, 'build', 'Debug');
    if (!existsSync(binaryPath) || existsSync(debugPath)) fail('E_NATIVE_BUILD_LAYOUT');
    const generatedBinaryBytes = stableGeneratedBinaryBytes(
      binaryPath,
      binaryPeerPath,
      128 * 1024 * 1024,
    );
    const trustedBinaryPath = join(stage, 'exec_authority.node');
    writeFileSync(trustedBinaryPath, generatedBinaryBytes, { flag: 'wx', mode: 0o600 });
    chmodSync(trustedBinaryPath, 0o600);
    syncFile(trustedBinaryPath);
    const binaryBytes = stableFileBytes(trustedBinaryPath, 128 * 1024 * 1024);
    const require = createRequire(import.meta.url);
    const raw = require(trustedBinaryPath);
    validateRawBinding(raw, nativePackage.version, platform, arch);
    const postLoadBytes = stableFileBytes(trustedBinaryPath, 128 * 1024 * 1024);
    if (createHash('sha256').update(postLoadBytes).digest('hex')
      !== createHash('sha256').update(binaryBytes).digest('hex')) {
      fail('E_NATIVE_BUILD_OUTPUT_CHANGED', trustedBinaryPath);
    }
    const artifact = Object.freeze({
      schemaVersion: 1,
      kind: 'deckent-exec-authority-native-artifact',
      abiName: EXEC_AUTHORITY_ABI_NAME,
      abiVersion: EXEC_AUTHORITY_ABI_VERSION,
      handleAbi: EXEC_AUTHORITY_HANDLE_ABI,
      napiVersion: EXEC_AUTHORITY_NAPI_VERSION,
      packageName: EXEC_AUTHORITY_NATIVE_PACKAGE,
      packageVersion: nativePackage.version,
      rootPackageName: 'deckent',
      rootPackageVersion: rootPackage.version,
      platform,
      arch,
      buildType: 'Release',
      binaryFile: 'exec_authority.node',
      binaryByteLength: binaryBytes.byteLength,
      binarySha256: `sha256:${createHash('sha256').update(binaryBytes).digest('hex')}`,
      nativeSourceTreeSha256: sourceIdentity.sha256,
    });
    if (!exactKeys(artifact, ARTIFACT_KEYS)) fail('E_NATIVE_ARTIFACT_INTERNAL_SHAPE');
    installArtifactPair(binaryBytes, artifact);
    return Object.freeze({ artifact, sourceIdentity });
  } finally {
    if (existsSync(stage)) removeGeneratedTree(stage);
  }
}

const isMain = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--clean') {
      cleanGeneratedOutputs();
      process.stdout.write('{"event":"EXEC_AUTHORITY_NATIVE_CLEANED"}\n');
    } else if (args.length !== 0) {
      fail('E_NATIVE_BUILD_ARGUMENT');
    } else {
      const result = await buildExecAuthorityNative();
      process.stdout.write(`${JSON.stringify({
        event: 'EXEC_AUTHORITY_NATIVE_BUILT',
        platform: result.artifact.platform,
        arch: result.artifact.arch,
        binarySha256: result.artifact.binarySha256,
        nativeSourceTreeSha256: result.artifact.nativeSourceTreeSha256,
      })}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'E_NATIVE_BUILD_UNKNOWN'}\n`);
    process.exitCode = 1;
  }
}
