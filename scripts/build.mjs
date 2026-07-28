#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
  renameSync,
  statSync,
  writeSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acquireCleanMaintenanceLock,
  assertCleanMaintenanceLock,
  beginCleanMaintenanceIrreversibleBoundary,
  completeCleanMaintenanceIrreversibleBoundary,
  quarantineCleanMaintenanceLock,
  recoverQuarantinedCleanMaintenanceLock,
  releaseCleanMaintenanceLock,
  renewCleanMaintenanceLock,
} from './clean.mjs';
import {
  copyAssets,
  ensureBinExecutable,
  writeBuildIdentity,
} from './copy-assets.mjs';
import { buildDashboard } from './build-dashboard.mjs';

const SCRIPT_PATH = realpathSync.native(fileURLToPath(import.meta.url));
const REPO_ROOT = realpathSync.native(resolve(dirname(SCRIPT_PATH), '..'));
const BUILD_SCHEMA_VERSION = 1;
const MAX_MANIFEST_FILES = 1_000_000;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024 * 1024;
const DEFAULT_MAINTENANCE_LEASE_MS = 5 * 60_000;
const DEFAULT_MAINTENANCE_HEARTBEAT_MS = 30_000;
const MIN_MAINTENANCE_HEARTBEAT_MS = 250;
const MAX_RETAINED_COMMITTED_RUNS = 3;
const MAX_RETAINED_COMMITTED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_RETAINED_COMMITTED_AGE_MS = 7 * 24 * 60 * 60_000;
const BUILD_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const BUILD_SCOPES = new Set(['core', 'dashboard', 'all']);
const REQUIRED_CORE_ARTIFACTS = Object.freeze([
  'index.js',
  'index.d.ts',
  'sdk/index.js',
  'sdk/index.d.ts',
  'cli/entry.js',
  'mcp/server.js',
  'build-identity.json',
]);

function codedError(code, detail, cause) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function isWithin(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== ''
    && rel !== '..'
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel);
}

function assertContained(root, candidate, code) {
  if (!isWithin(root, candidate)) throw codedError(code, candidate);
}

function canonicalTimestamp(now = Date.now()) {
  if (!Number.isSafeInteger(now)
    || !Number.isFinite(new Date(now).getTime())) {
    throw codedError('E_BUILD_CLOCK_INVALID');
  }
  return new Date(now).toISOString();
}

function openSecureRegularFile(path) {
  const pathStat = lstatSync(path, { bigint: true });
  if (!pathStat.isFile()
    || pathStat.isSymbolicLink()
    || pathStat.nlink !== 1n) {
    throw codedError('E_BUILD_INPUT_UNSAFE', path);
  }
  const fd = openSync(
    path,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  const stat = fstatSync(fd, { bigint: true });
  if (!stat.isFile()
    || stat.nlink !== 1n
    || stat.dev !== pathStat.dev
    || stat.ino !== pathStat.ino) {
    closeSync(fd);
    throw codedError('E_BUILD_INPUT_IDENTITY_CHANGED', path);
  }
  return { fd, stat };
}

function secureFileDigest(path) {
  const opened = openSecureRegularFile(path);
  try {
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (true) {
      const bytesRead = readSync(
        opened.fd,
        buffer,
        0,
        buffer.length,
        offset,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const after = fstatSync(opened.fd, { bigint: true });
    if (after.dev !== opened.stat.dev
      || after.ino !== opened.stat.ino
      || after.size !== opened.stat.size
      || after.mtimeNs !== opened.stat.mtimeNs
      || BigInt(offset) !== opened.stat.size) {
      throw codedError('E_BUILD_INPUT_IDENTITY_CHANGED', path);
    }
    return {
      mode: Number(opened.stat.mode & 0o777n),
      size: Number(opened.stat.size),
      sha256: hash.digest('hex'),
    };
  } finally {
    closeSync(opened.fd);
  }
}

function secureReadFile(path, maxBytes = 1024 * 1024) {
  const opened = openSecureRegularFile(path);
  try {
    if (opened.stat.size > BigInt(maxBytes)) {
      throw codedError('E_BUILD_INPUT_LIMIT_EXCEEDED', path);
    }
    const bytes = Buffer.alloc(Number(opened.stat.size));
    let offset = 0;
    while (offset < bytes.length) {
      const bytesRead = readSync(
        opened.fd,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = fstatSync(opened.fd, { bigint: true });
    if (after.dev !== opened.stat.dev
      || after.ino !== opened.stat.ino
      || after.size !== opened.stat.size
      || after.mtimeNs !== opened.stat.mtimeNs
      || offset !== bytes.length) {
      throw codedError('E_BUILD_INPUT_IDENTITY_CHANGED', path);
    }
    return bytes;
  } finally {
    closeSync(opened.fd);
  }
}

function manifestDigest(records) {
  return createHash('sha256')
    .update(JSON.stringify(records))
    .digest('hex');
}

function treeManifest(directory, options = {}) {
  if (!existsSync(directory)) {
    return Object.freeze({
      digest: manifestDigest([]),
      fileCount: 0,
      totalBytes: 0,
      records: Object.freeze([]),
    });
  }
  const namedDirectoryStat = lstatSync(directory);
  if (!namedDirectoryStat.isDirectory()
    || namedDirectoryStat.isSymbolicLink()) {
    throw codedError('E_BUILD_TREE_UNSAFE', directory);
  }
  const canonicalDirectory = realpathSync.native(directory);
  const directoryStat = lstatSync(canonicalDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw codedError('E_BUILD_TREE_UNSAFE', directory);
  }
  const records = [];
  let totalBytes = 0;
  const walk = (current, relativeDirectory) => {
    for (const entry of readdirSync(current).sort()) {
      const relativePath = relativeDirectory
        ? join(relativeDirectory, entry)
        : entry;
      if (options.exclude?.(relativePath, entry) === true) continue;
      const full = join(current, entry);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        throw codedError('E_BUILD_TREE_SYMLINK_UNSUPPORTED', full);
      }
      if (stat.isDirectory()) {
        walk(full, relativePath);
        continue;
      }
      if (!stat.isFile()) {
        throw codedError('E_BUILD_TREE_ENTRY_UNSUPPORTED', full);
      }
      options.checkpoint?.();
      const file = secureFileDigest(full);
      totalBytes += file.size;
      records.push({
        path: relativePath.split(sep).join('/'),
        size: file.size,
        mode: file.mode,
        sha256: file.sha256,
      });
      if (records.length > MAX_MANIFEST_FILES
        || totalBytes > MAX_MANIFEST_BYTES) {
        throw codedError('E_BUILD_TREE_LIMIT_EXCEEDED', directory);
      }
    }
  };
  walk(canonicalDirectory, '');
  return Object.freeze({
    digest: manifestDigest(records),
    fileCount: records.length,
    totalBytes,
    records: Object.freeze(records),
  });
}

function copyFileIdentityChecked(source, destination, expected) {
  const opened = openSecureRegularFile(source);
  let destinationFd;
  try {
    if (Number(opened.stat.size) !== expected.size
      || Number(opened.stat.mode & 0o777n) !== expected.mode) {
      throw codedError('E_BUILD_COPY_SOURCE_DRIFT', source);
    }
    destinationFd = openSync(
      destination,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      expected.mode || 0o600,
    );
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (true) {
      const bytesRead = readSync(
        opened.fd,
        buffer,
        0,
        buffer.length,
        offset,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) {
        const count = writeSync(
          destinationFd,
          buffer,
          written,
          bytesRead - written,
        );
        if (count <= 0) {
          throw codedError('E_BUILD_COPY_WRITE_FAILED', destination);
        }
        written += count;
      }
      offset += bytesRead;
    }
    fsyncSync(destinationFd);
    const after = fstatSync(opened.fd, { bigint: true });
    if (after.dev !== opened.stat.dev
      || after.ino !== opened.stat.ino
      || after.size !== opened.stat.size
      || after.mtimeNs !== opened.stat.mtimeNs
      || BigInt(offset) !== opened.stat.size
      || hash.digest('hex') !== expected.sha256) {
      throw codedError('E_BUILD_COPY_SOURCE_DRIFT', source);
    }
  } finally {
    if (destinationFd !== undefined) closeSync(destinationFd);
    closeSync(opened.fd);
  }
}

function copyTreeIdentityChecked(source, destination, options = {}) {
  const before = treeManifest(source, options);
  if (existsSync(destination)) {
    const destinationStat = lstatSync(destination);
    if (!destinationStat.isDirectory()
      || destinationStat.isSymbolicLink()
      || readdirSync(destination).length !== 0) {
      throw codedError('E_BUILD_COPY_DESTINATION_UNSAFE', destination);
    }
  } else {
    mkdirSync(destination, { recursive: false, mode: 0o700 });
  }
  for (const record of before.records) {
    options.checkpoint?.();
    const sourcePath = join(source, ...record.path.split('/'));
    const destinationPath = join(destination, ...record.path.split('/'));
    mkdirSync(dirname(destinationPath), {
      recursive: true,
      mode: 0o700,
    });
    copyFileIdentityChecked(sourcePath, destinationPath, record);
    if (process.platform !== 'win32') {
      chmodSync(destinationPath, record.mode);
    }
  }
  const after = treeManifest(source, options);
  const copied = treeManifest(destination);
  if (after.digest !== before.digest || copied.digest !== before.digest) {
    throw codedError('E_BUILD_COPY_IDENTITY_MISMATCH', source);
  }
  return before;
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(
      path,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0),
    );
    fsyncSync(fd);
  } catch (error) {
    throw codedError('E_BUILD_DIRECTORY_DURABILITY_UNSUPPORTED', path, error);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function fsyncTree(directory, checkpoint) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw codedError('E_BUILD_TREE_UNSAFE', directory);
  }
  for (const entry of readdirSync(directory).sort()) {
    checkpoint?.();
    const path = join(directory, entry);
    const child = lstatSync(path);
    if (child.isSymbolicLink()) {
      throw codedError('E_BUILD_TREE_SYMLINK_UNSUPPORTED', path);
    }
    if (child.isDirectory()) {
      fsyncTree(path, checkpoint);
      continue;
    }
    if (!child.isFile()) {
      throw codedError('E_BUILD_TREE_ENTRY_UNSUPPORTED', path);
    }
    let fd;
    try {
      fd = openSync(
        path,
        fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
      );
      fsyncSync(fd);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  fsyncDirectory(directory);
}

function bindDirectory(path, code) {
  const canonical = realpathSync.native(path);
  const namedStat = lstatSync(path, { bigint: true });
  const canonicalStat = lstatSync(canonical, { bigint: true });
  if (!namedStat.isDirectory()
    || namedStat.isSymbolicLink()
    || !canonicalStat.isDirectory()
    || canonicalStat.isSymbolicLink()
    || namedStat.dev !== canonicalStat.dev
    || namedStat.ino !== canonicalStat.ino) {
    throw codedError(code, path);
  }
  return Object.freeze({
    path,
    canonical,
    dev: canonicalStat.dev,
    ino: canonicalStat.ino,
  });
}

function assertDirectoryBinding(binding, code) {
  let canonical;
  let stat;
  try {
    canonical = realpathSync.native(binding.path);
    stat = lstatSync(binding.path, { bigint: true });
  } catch (error) {
    throw codedError(code, binding.path, error);
  }
  if (!stat.isDirectory()
    || stat.isSymbolicLink()
    || canonical !== binding.canonical
    || stat.dev !== binding.dev
    || stat.ino !== binding.ino) {
    throw codedError(code, binding.path);
  }
}

function ensureContainedDirectory(root, directory) {
  assertContained(root, directory, 'E_BUILD_PATH_OUTSIDE_PROJECT');
  const components = relative(root, directory).split(sep);
  let current = root;
  for (const component of components) {
    const parentBinding = bindDirectory(
      current,
      'E_BUILD_DIRECTORY_CHAIN_UNSAFE',
    );
    const next = join(current, component);
    if (existsSync(next)) {
      const stat = lstatSync(next);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw codedError('E_BUILD_DIRECTORY_CHAIN_UNSAFE', next);
      }
    } else {
      mkdirSync(next, { recursive: false, mode: 0o700 });
      fsyncDirectory(current);
    }
    assertDirectoryBinding(
      parentBinding,
      'E_BUILD_DIRECTORY_CHAIN_IDENTITY_CHANGED',
    );
    const canonical = realpathSync.native(next);
    if (!isWithin(root, canonical)) {
      throw codedError('E_BUILD_DIRECTORY_CHAIN_UNSAFE', next);
    }
    current = next;
  }
  return bindDirectory(current, 'E_BUILD_DIRECTORY_CHAIN_UNSAFE');
}

function writeJournal(path, value) {
  const temporary = `${path}.tmp-${randomUUID()}`;
  let fd;
  try {
    fd = openSync(
      temporary,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
    fsyncDirectory(dirname(path));
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function copyManifestFile(sourceRoot, destinationRoot, relativePath) {
  const source = join(sourceRoot, relativePath);
  if (!existsSync(source)) return;
  const record = secureFileDigest(source);
  const destination = join(destinationRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileIdentityChecked(source, destination, {
    ...record,
    path: relativePath,
  });
  if (process.platform !== 'win32') chmodSync(destination, record.mode);
}

function prepareSourceWorkspace(
  root,
  workspace,
  scope,
  checkpoint,
) {
  mkdirSync(workspace, { recursive: false, mode: 0o700 });
  for (const relativePath of [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'scripts/build.mjs',
    'scripts/build-dashboard.mjs',
    'scripts/copy-assets.mjs',
  ]) {
    checkpoint?.();
    copyManifestFile(root, workspace, relativePath);
  }
  const includeCore = scope === 'core' || scope === 'all';
  const includeDashboard = scope === 'dashboard' || scope === 'all';
  if (includeCore) {
    copyTreeIdentityChecked(
      join(root, 'src'),
      join(workspace, 'src'),
      {
        checkpoint,
        exclude: (relativePath, entry) => {
          const top = relativePath.split(sep)[0];
          return top === 'dashboard'
            || top === 'desktop'
            || entry === 'node_modules';
        },
      },
    );
    copyTreeIdentityChecked(
      join(root, 'node_modules'),
      join(workspace, 'node_modules'),
      {
        checkpoint,
        exclude: (_relativePath, entry) => entry === '.bin',
      },
    );
  }
  if (includeDashboard) {
    mkdirSync(join(workspace, 'src'), { recursive: true, mode: 0o700 });
    copyTreeIdentityChecked(
      join(root, 'src', 'dashboard'),
      join(workspace, 'src', 'dashboard'),
      {
        checkpoint,
        exclude: (_relativePath, entry) => entry === 'node_modules',
      },
    );
    copyTreeIdentityChecked(
      join(root, 'src', 'dashboard', 'node_modules'),
      join(workspace, 'src', 'dashboard', 'node_modules'),
      {
        checkpoint,
        exclude: (_relativePath, entry) => entry === '.bin',
      },
    );
  }
  const expected = snapshotBuildInputs(root, scope);
  const actual = snapshotBuildInputs(workspace, scope);
  if (actual.digest !== expected.digest) {
    throw codedError('E_BUILD_SOURCE_SNAPSHOT_MISMATCH');
  }
  return Object.freeze({
    source: actual,
    toolchain: toolchainSnapshot(workspace, scope),
  });
}

function toolchainSnapshot(workspace, scope) {
  const records = [];
  if (scope === 'core' || scope === 'all') {
    const core = treeManifest(join(workspace, 'node_modules'));
    records.push({
      path: 'node_modules',
      digest: core.digest,
      fileCount: core.fileCount,
      totalBytes: core.totalBytes,
    });
  }
  if (scope === 'dashboard' || scope === 'all') {
    const dashboard = treeManifest(
      join(workspace, 'src', 'dashboard', 'node_modules'),
    );
    records.push({
      path: 'src/dashboard/node_modules',
      digest: dashboard.digest,
      fileCount: dashboard.fileCount,
      totalBytes: dashboard.totalBytes,
    });
  }
  return Object.freeze({
    digest: manifestDigest(records),
    records: Object.freeze(records),
  });
}

function outputEnvironmentSnapshot(environment = process.env) {
  const names = Object.keys(environment)
    .filter(name =>
      name === 'LANG'
      || name === 'LC_ALL'
      || name === 'NODE_ENV'
      || name === 'NODE_OPTIONS'
      || name === 'SOURCE_DATE_EPOCH'
      || name === 'TZ'
      || name.startsWith('VITE_'))
    .sort();
  const values = names.map(name => [name, String(environment[name] ?? '')]);
  return Object.freeze({
    names: Object.freeze(names),
    digest: createHash('sha256')
      .update(JSON.stringify(values))
      .digest('hex'),
  });
}

function snapshotBuildInputs(root, scope) {
  const records = [];
  const addFile = relativePath => {
    const file = secureFileDigest(join(root, relativePath));
    records.push({
      path: relativePath.split(sep).join('/'),
      size: file.size,
      mode: file.mode,
      sha256: file.sha256,
    });
  };
  for (const file of [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'scripts/build.mjs',
    'scripts/build-dashboard.mjs',
    'scripts/copy-assets.mjs',
  ]) {
    if (existsSync(join(root, file))) addFile(file);
  }
  const includeCore = scope === 'core' || scope === 'all';
  const includeDashboard = scope === 'dashboard' || scope === 'all';
  if (includeCore) {
    const core = treeManifest(join(root, 'src'), {
      exclude: (relativePath, entry) => {
        const top = relativePath.split(sep)[0];
        return top === 'dashboard'
          || top === 'desktop'
          || entry === 'node_modules';
      },
    });
    records.push(...core.records.map(record => ({
      ...record,
      path: `src/${record.path}`,
    })));
  }
  if (includeDashboard) {
    const dashboard = treeManifest(join(root, 'src', 'dashboard'), {
      exclude: (_relativePath, entry) => entry === 'node_modules',
    });
    records.push(...dashboard.records.map(record => ({
      ...record,
      path: `src/dashboard/${record.path}`,
    })));
  }
  records.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return Object.freeze({
    digest: manifestDigest(records),
    fileCount: records.length,
    totalBytes: records.reduce((sum, record) => sum + record.size, 0),
  });
}

function requireLocalNodeTool(path, kind) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw codedError('E_BUILD_TOOLCHAIN_MISSING', `${kind}:${path}`);
  }
  return realpathSync.native(path);
}

export function runBuildNodeTool(
  entrypoint,
  args,
  cwd,
  options = {},
) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      options.nodeExecutable ?? process.execPath,
      [entrypoint, ...args],
      {
        cwd,
        env: options.env ?? process.env,
        stdio: options.stdio ?? 'inherit',
        shell: false,
        windowsHide: true,
        signal: options.signal,
      },
    );
    child.once('error', error => {
      reject(codedError(
        'E_BUILD_PROCESS_START_FAILED',
        error instanceof Error ? error.message : String(error),
      ));
    });
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(codedError(
        'E_BUILD_PROCESS_FAILED',
        `exit=${String(code)}:signal=${String(signal)}`,
      ));
    });
  });
}

function defaultAuthority() {
  return {
    acquire: acquireCleanMaintenanceLock,
    assert: assertCleanMaintenanceLock,
    renew: renewCleanMaintenanceLock,
    begin: beginCleanMaintenanceIrreversibleBoundary,
    complete: completeCleanMaintenanceIrreversibleBoundary,
    quarantine: quarantineCleanMaintenanceLock,
    recover: recoverQuarantinedCleanMaintenanceLock,
    release: releaseCleanMaintenanceLock,
  };
}

function readBuildJournal(path, expectedRunId, root) {
  let value;
  try {
    value = JSON.parse(secureReadFile(path, 256 * 1024).toString('utf8'));
  } catch (error) {
    throw codedError('E_BUILD_RECOVERY_JOURNAL_INVALID', path, error);
  }
  const expectedPaths = {
    stagingDist: `.deckent/build/runs/${expectedRunId}/staging-dist`,
    backupDist: `.deckent/build/runs/${expectedRunId}/backup-dist`,
    liveDist: 'dist',
  };
  if (!value
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.schemaVersion !== BUILD_SCHEMA_VERSION
    || value.runId !== expectedRunId
    || !BUILD_SCOPES.has(value.scope)
    || !value.source
    || !SHA256_RE.test(value.source.digest)
    || !value.artifact
    || !SHA256_RE.test(value.artifact.digest)
    || !value.oldArtifact
    || !SHA256_RE.test(value.oldArtifact.digest)
    || !value.paths
    || value.paths.stagingDist !== expectedPaths.stagingDist
    || value.paths.backupDist !== expectedPaths.backupDist
    || value.paths.liveDist !== expectedPaths.liveDist
    || !value.authority
    || !value.authority.lock
    || (value.authority.boundary !== null
      && (!value.authority.boundary
        || typeof value.authority.boundary.quarantineId !== 'string'))) {
    throw codedError('E_BUILD_RECOVERY_JOURNAL_INVALID', path);
  }
  for (const relativePath of Object.values(expectedPaths)) {
    assertContained(
      root,
      resolve(root, relativePath),
      'E_BUILD_RECOVERY_PATH_OUTSIDE_PROJECT',
    );
  }
  return value;
}

function inspectRecoveryTree(path, expectedDigests) {
  if (!existsSync(path)) {
    return Object.freeze({
      exists: false,
      matchesOld: false,
      matchesNew: false,
    });
  }
  const manifest = treeManifest(path);
  return Object.freeze({
    exists: true,
    matchesOld: manifest.digest === expectedDigests.old,
    matchesNew: manifest.digest === expectedDigests.new,
    manifest,
  });
}

export function recoverTransactionalBuild(options = {}) {
  const root = realpathSync.native(options.root ?? REPO_ROOT);
  if (root !== REPO_ROOT && options.allowFixtureRoot !== true) {
    throw codedError('E_BUILD_ROOT_AUTHORITY_MISMATCH', root);
  }
  const runId = options.runId;
  if (typeof runId !== 'string' || !BUILD_RUN_ID_RE.test(runId)) {
    throw codedError('E_BUILD_RUN_ID_INVALID', String(runId));
  }
  if (!options.attestation
    || typeof options.recoveryAttestationVerifier !== 'function') {
    throw codedError('E_BUILD_RECOVERY_ATTESTATION_REQUIRED', runId);
  }
  fsyncDirectory(root);
  const runDirectory = join(root, '.deckent', 'build', 'runs', runId);
  const journalPath = join(runDirectory, 'journal.json');
  const stagingDist = join(runDirectory, 'staging-dist');
  const backupDist = join(runDirectory, 'backup-dist');
  const sourceWorkspace = join(runDirectory, 'source-workspace');
  const liveDist = join(root, 'dist');
  const rootBinding = bindDirectory(root, 'E_BUILD_ROOT_UNSAFE');
  const runDirectoryBinding = bindDirectory(
    runDirectory,
    'E_BUILD_RECOVERY_RUN_DIRECTORY_UNSAFE',
  );
  if (!isWithin(root, runDirectoryBinding.canonical)) {
    throw codedError(
      'E_BUILD_RECOVERY_RUN_DIRECTORY_UNSAFE',
      runDirectory,
    );
  }
  const journal = readBuildJournal(journalPath, runId, root);
  const quarantineId =
    journal.authority.boundary?.quarantineId
    ?? options.attestation.quarantineId;
  if (typeof quarantineId !== 'string' || quarantineId.length === 0) {
    throw codedError('E_BUILD_RECOVERY_ATTESTATION_REQUIRED', runId);
  }
  const expectedDigests = {
    old: journal.oldArtifact.digest,
    new: journal.artifact.digest,
  };
  const disk = {
    live: inspectRecoveryTree(liveDist, expectedDigests),
    staging: inspectRecoveryTree(stagingDist, expectedDigests),
    backup: inspectRecoveryTree(backupDist, expectedDigests),
  };
  let disposition;
  if (disk.live.exists
    && disk.live.matchesOld
    && disk.staging.exists
    && disk.staging.matchesNew
    && !disk.backup.exists) {
    disposition = 'rollback-staged';
  } else if (!disk.live.exists
    && disk.staging.exists
    && disk.staging.matchesNew
    && disk.backup.exists
    && disk.backup.matchesOld) {
    assertDirectoryBinding(rootBinding, 'E_BUILD_ROOT_IDENTITY_CHANGED');
    assertDirectoryBinding(
      runDirectoryBinding,
      'E_BUILD_RECOVERY_RUN_DIRECTORY_IDENTITY_CHANGED',
    );
    renameSync(backupDist, liveDist);
    fsyncDirectory(runDirectory);
    fsyncDirectory(root);
    disposition = 'rollback-restored';
  } else if (disk.live.exists
    && disk.live.matchesNew
    && !disk.staging.exists
    && (!disk.backup.exists || disk.backup.matchesOld)) {
    disposition = 'commit-retained';
  } else if (!journal.liveDistExisted
    && !disk.live.exists
    && disk.staging.exists
    && disk.staging.matchesNew
    && !disk.backup.exists) {
    disposition = 'rollback-staged';
  } else {
    throw codedError(
      'E_BUILD_RECOVERY_DISK_STATE_AMBIGUOUS',
      JSON.stringify({
        live: {
          exists: disk.live.exists,
          old: disk.live.matchesOld,
          new: disk.live.matchesNew,
        },
        staging: {
          exists: disk.staging.exists,
          old: disk.staging.matchesOld,
          new: disk.staging.matchesNew,
        },
        backup: {
          exists: disk.backup.exists,
          old: disk.backup.matchesOld,
          new: disk.backup.matchesNew,
        },
      }),
    );
  }
  const expectedEvidence = buildEventEvidence(
    runId,
    journal.scope,
    journal.source.digest,
    journal.artifact.digest,
  );
  expectedEvidence.push(
    `build-old-artifact-sha256:${journal.oldArtifact.digest}`,
  );
  expectedEvidence.sort();
  const authority = options.authority ?? defaultAuthority();
  if (typeof authority.recover !== 'function') {
    throw codedError('E_BUILD_RECOVERY_AUTHORITY_UNAVAILABLE', runId);
  }
  const recovery = authority.recover(
    root,
    journal.authority.lock,
    options.attestation,
    {
      ...(options.authorityOptions ?? {}),
      now: options.now,
      recoveryAttestationVerifier: context => {
        const evidence = context.quarantine?.evidenceRefs;
        if (!Array.isArray(evidence)
          || context.quarantine.quarantineId
            !== quarantineId
          || !expectedEvidence.every(item => evidence.includes(item))) {
          return false;
        }
        return options.recoveryAttestationVerifier({
          ...context,
          journal,
          disk,
          disposition,
        }) === true;
      },
    },
  );
  if (recovery.projectionCleanup !== undefined
    && recovery.projectionCleanup !== 'completed') {
    throw codedError(
      'E_BUILD_RECOVERY_PROJECTION_CLEANUP_UNCERTAIN',
      runId,
    );
  }
  if ((disposition === 'rollback-staged'
      || disposition === 'rollback-restored')
    && existsSync(stagingDist)) {
    rmSync(stagingDist, { recursive: true, force: false });
    fsyncDirectory(runDirectory);
  }
  if (existsSync(sourceWorkspace)) {
    rmSync(sourceWorkspace, { recursive: true, force: false });
    fsyncDirectory(runDirectory);
  }
  writeJournal(journalPath, {
    ...journal,
    state: disposition === 'commit-retained'
      ? 'recovered-committed'
      : 'recovered-rolled-back',
    recoveredAt: canonicalTimestamp(options.now?.() ?? Date.now()),
    recoveryDisposition: disposition,
    recoveryAuditEventId: recovery.audit.eventId,
  });
  const retention = enforceBuildRetention(
    root,
    runId,
    options.now?.() ?? Date.now(),
  );
  return Object.freeze({
    schemaVersion: BUILD_SCHEMA_VERSION,
    runId,
    state: disposition === 'commit-retained'
      ? 'recovered-committed'
      : 'recovered-rolled-back',
    disposition,
    artifactDigest: disposition === 'commit-retained'
      ? journal.artifact.digest
      : journal.oldArtifact.digest,
    authorityAuditEventId: recovery.audit.eventId,
    authorityProjectionCleanup:
      recovery.projectionCleanup ?? 'not-reported',
    retention,
  });
}

function enforceBuildRetention(root, currentRunId, nowMs) {
  const runsDirectory = join(root, '.deckent', 'build', 'runs');
  if (!existsSync(runsDirectory)) {
    return Object.freeze({ removedRunIds: [], retainedBytes: 0 });
  }
  const candidates = [];
  for (const entry of readdirSync(runsDirectory).sort()) {
    if (!BUILD_RUN_ID_RE.test(entry)) continue;
    const directory = join(runsDirectory, entry);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    const journalPath = join(directory, 'journal.json');
    if (!existsSync(journalPath)) continue;
    let journal;
    try {
      journal = JSON.parse(
        secureReadFile(journalPath, 256 * 1024).toString('utf8'),
      );
    } catch {
      continue;
    }
    if (journal?.schemaVersion !== BUILD_SCHEMA_VERSION
      || journal.runId !== entry
      || ![
        'committed',
        'recovered-committed',
        'recovered-rolled-back',
      ].includes(journal.state)) {
      continue;
    }
    const timestamp = Date.parse(
      journal.recoveredAt
        ?? journal.committedAt
        ?? journal.preparedAt,
    );
    if (!Number.isFinite(timestamp)) continue;
    const manifest = treeManifest(directory);
    candidates.push({
      runId: entry,
      directory,
      timestamp,
      totalBytes: manifest.totalBytes,
    });
  }
  candidates.sort((left, right) => {
    if (left.runId === currentRunId) return -1;
    if (right.runId === currentRunId) return 1;
    return right.timestamp - left.timestamp
      || left.runId.localeCompare(right.runId, 'en');
  });
  const removedRunIds = [];
  let retainedCount = 0;
  let retainedBytes = 0;
  for (const candidate of candidates) {
    const current = candidate.runId === currentRunId;
    const expired =
      nowMs - candidate.timestamp > MAX_RETAINED_COMMITTED_AGE_MS;
    const exceedsCount = retainedCount >= MAX_RETAINED_COMMITTED_RUNS;
    const exceedsBytes =
      retainedBytes + candidate.totalBytes > MAX_RETAINED_COMMITTED_BYTES;
    if (!current && (expired || exceedsCount || exceedsBytes)) {
      rmSync(candidate.directory, { recursive: true, force: false });
      removedRunIds.push(candidate.runId);
      continue;
    }
    retainedCount += 1;
    retainedBytes += candidate.totalBytes;
  }
  if (removedRunIds.length > 0) fsyncDirectory(runsDirectory);
  return Object.freeze({
    removedRunIds: Object.freeze(removedRunIds),
    retainedBytes,
  });
}

function startMaintenanceHeartbeat(
  root,
  state,
  authority,
  abortController,
  options,
) {
  let failure;
  const intervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_MAINTENANCE_HEARTBEAT_MS;
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  let nextPulseAt = monotonicNow() + intervalMs;
  const pulse = (force = false) => {
    if (failure !== undefined) throw failure;
    if (!force && monotonicNow() < nextPulseAt) return;
    try {
      const renewed = authority.renew(
        root,
        state.lock,
        options.authorityOptions,
      );
      state.lock = renewed;
      nextPulseAt = monotonicNow() + intervalMs;
    } catch (error) {
      failure = error;
      abortController.abort(error);
      clearInterval(timer);
      throw error;
    }
  };
  const timer = setInterval(() => {
    if (failure !== undefined) return;
    try {
      pulse(true);
    } catch {
      // pulse records and propagates the terminal heartbeat failure.
    }
  }, intervalMs);
  timer.unref();
  return {
    failure: () => failure,
    pulse,
    stop: () => clearInterval(timer),
  };
}

function buildEventEvidence(runId, scope, sourceDigest, artifactDigest) {
  return [
    `build-run:${runId}`,
    `build-scope:${scope}`,
    `build-source-sha256:${sourceDigest}`,
    `build-artifact-sha256:${artifactDigest}`,
  ].sort();
}

export async function runTransactionalBuild(options = {}) {
  const root = realpathSync.native(options.root ?? REPO_ROOT);
  if (root !== REPO_ROOT && options.allowFixtureRoot !== true) {
    throw codedError('E_BUILD_ROOT_AUTHORITY_MISMATCH', root);
  }
  const scope = options.scope ?? 'core';
  if (!BUILD_SCOPES.has(scope)) {
    throw codedError('E_BUILD_SCOPE_INVALID', String(scope));
  }
  const now = options.now ?? (() => Date.now());
  const runId = options.runId ?? randomUUID();
  if (typeof runId !== 'string' || !BUILD_RUN_ID_RE.test(runId)) {
    throw codedError('E_BUILD_RUN_ID_INVALID', String(runId));
  }
  const leaseDurationMs =
    options.leaseDurationMs ?? DEFAULT_MAINTENANCE_LEASE_MS;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_MAINTENANCE_HEARTBEAT_MS;
  if (!Number.isSafeInteger(leaseDurationMs)
    || leaseDurationMs < MIN_MAINTENANCE_HEARTBEAT_MS * 3
    || !Number.isSafeInteger(heartbeatIntervalMs)
    || heartbeatIntervalMs < MIN_MAINTENANCE_HEARTBEAT_MS
    || heartbeatIntervalMs > Math.floor(leaseDurationMs / 3)) {
    throw codedError('E_BUILD_HEARTBEAT_CONFIGURATION_INVALID');
  }
  const authority = options.authority ?? defaultAuthority();
  const runTool = options.runTool ?? runBuildNodeTool;
  const dashboardBuilder = options.dashboardBuilder ?? buildDashboard;
  const buildEnvironment = Object.freeze({
    ...(options.env ?? process.env),
  });
  const buildRoot = join(root, '.deckent', 'build');
  const runDirectory = join(buildRoot, 'runs', runId);
  const sourceWorkspace = join(runDirectory, 'source-workspace');
  const stagingDist = join(runDirectory, 'staging-dist');
  const backupDist = join(runDirectory, 'backup-dist');
  const journalPath = join(runDirectory, 'journal.json');
  const liveDist = join(root, 'dist');
  for (const candidate of [
    buildRoot,
    runDirectory,
    sourceWorkspace,
    stagingDist,
    backupDist,
    journalPath,
    liveDist,
  ]) {
    assertContained(root, candidate, 'E_BUILD_PATH_OUTSIDE_PROJECT');
  }

  const runsDirectoryBinding = ensureContainedDirectory(
    root,
    dirname(runDirectory),
  );
  // Prove the platform can durably commit directory-entry transitions before
  // acquiring authority or starting toolchain work.
  fsyncDirectory(root);
  const rootBinding = bindDirectory(root, 'E_BUILD_ROOT_UNSAFE');
  const sourceBefore = snapshotBuildInputs(root, scope);
  const authorityOptions = {
    ...(options.authorityOptions ?? {}),
    leaseDurationMs,
  };
  const state = {
    lock: authority.acquire(root, authorityOptions),
    boundary: undefined,
    mutationStarted: false,
    authorityTerminal: false,
  };
  const abortController = new AbortController();
  const heartbeat = startMaintenanceHeartbeat(
    root,
    state,
    authority,
    abortController,
    {
      heartbeatIntervalMs,
      authorityOptions,
      monotonicNow: options.monotonicNow,
    },
  );

  try {
    assertDirectoryBinding(
      runsDirectoryBinding,
      'E_BUILD_RUNS_DIRECTORY_IDENTITY_CHANGED',
    );
    if (existsSync(runDirectory)) {
      throw codedError('E_BUILD_RUN_ID_COLLISION', runId);
    }
    mkdirSync(runDirectory, { recursive: false, mode: 0o700 });
    fsyncDirectory(dirname(runDirectory));
    const runDirectoryBinding = bindDirectory(
      runDirectory,
      'E_BUILD_RUN_DIRECTORY_UNSAFE',
    );
    assertDirectoryBinding(rootBinding, 'E_BUILD_ROOT_IDENTITY_CHANGED');
    const workspaceSnapshot = prepareSourceWorkspace(
      root,
      sourceWorkspace,
      scope,
      heartbeat.pulse,
    );
    if (workspaceSnapshot.source.digest !== sourceBefore.digest) {
      throw codedError('E_BUILD_SOURCE_DRIFT_DURING_SNAPSHOT');
    }
    fsyncTree(sourceWorkspace, heartbeat.pulse);
    mkdirSync(stagingDist, { recursive: false, mode: 0o700 });

    const includeCore = scope === 'core' || scope === 'all';
    const includeDashboard = scope === 'dashboard' || scope === 'all';
    if (scope === 'core' && existsSync(join(liveDist, 'dashboard'))) {
      copyTreeIdentityChecked(
        join(liveDist, 'dashboard'),
        join(stagingDist, 'dashboard'),
        { checkpoint: heartbeat.pulse },
      );
    } else if (scope === 'dashboard') {
      if (!existsSync(liveDist)) {
        throw codedError('E_BUILD_EXISTING_CORE_ARTIFACT_MISSING', liveDist);
      }
      for (const relativePath of REQUIRED_CORE_ARTIFACTS) {
        const required = join(liveDist, ...relativePath.split('/'));
        if (!existsSync(required)
          || !lstatSync(required).isFile()
          || lstatSync(required).isSymbolicLink()) {
          throw codedError(
            'E_BUILD_EXISTING_CORE_ARTIFACT_MISSING',
            required,
          );
        }
      }
      // Dashboard-only builds preserve the exact current core artifact while
      // replacing the dashboard subtree in isolated staging.
      const stagedExisting = copyTreeIdentityChecked(
        liveDist,
        stagingDist,
        {
          checkpoint: heartbeat.pulse,
          exclude: relativePath =>
            relativePath.split(sep)[0] === 'dashboard',
        },
      );
      if (stagedExisting.fileCount === 0) {
        throw codedError('E_BUILD_EXISTING_ARTIFACT_EMPTY', liveDist);
      }
    }

    if (includeCore) {
      const typeScript = requireLocalNodeTool(
        join(
          sourceWorkspace,
          'node_modules',
          'typescript',
          'bin',
          'tsc',
        ),
        'typescript',
      );
      await runTool(
        typeScript,
        [
          '-p',
          join(sourceWorkspace, 'tsconfig.json'),
          '--rootDir',
          join(sourceWorkspace, 'src'),
          '--outDir',
          stagingDist,
        ],
        sourceWorkspace,
        {
          signal: abortController.signal,
          env: buildEnvironment,
          stdio: options.stdio,
        },
      );
      assertDirectoryBinding(rootBinding, 'E_BUILD_ROOT_IDENTITY_CHANGED');
      copyAssets(
        sourceWorkspace,
        stagingDist,
        {
          checkpoint: heartbeat.pulse,
          outputAuthorityRoot: root,
        },
      );
      writeBuildIdentity(
        root,
        stagingDist,
        { packageSourceRoot: sourceWorkspace },
      );
      ensureBinExecutable(root, stagingDist);
    }
    if (includeDashboard) {
      await dashboardBuilder({
        root,
        sourceDirectory: join(sourceWorkspace, 'src', 'dashboard'),
        toolchainDashboardDirectory:
          join(sourceWorkspace, 'src', 'dashboard'),
        outputDirectory: join(stagingDist, 'dashboard'),
        signal: abortController.signal,
        env: buildEnvironment,
        stdio: options.stdio,
      });
    }
    assertDirectoryBinding(rootBinding, 'E_BUILD_ROOT_IDENTITY_CHANGED');
    if (heartbeat.failure() !== undefined) throw heartbeat.failure();
    const workspaceSourceAfterBuild =
      snapshotBuildInputs(sourceWorkspace, scope);
    const workspaceToolchainAfterBuild =
      toolchainSnapshot(sourceWorkspace, scope);
    if (workspaceSourceAfterBuild.digest
        !== workspaceSnapshot.source.digest
      || workspaceToolchainAfterBuild.digest
        !== workspaceSnapshot.toolchain.digest) {
      throw codedError('E_BUILD_IMMUTABLE_WORKSPACE_DRIFT');
    }

    if (includeCore) {
      for (const relativePath of REQUIRED_CORE_ARTIFACTS) {
        const required = join(
          stagingDist,
          ...relativePath.split('/'),
        );
        if (!existsSync(required) || !statSync(required).isFile()) {
          throw codedError('E_BUILD_ARTIFACT_REQUIRED_FILE_MISSING', required);
        }
      }
    }
    if (includeDashboard
      && (!existsSync(join(stagingDist, 'dashboard', 'index.html'))
        || !statSync(join(stagingDist, 'dashboard', 'index.html')).isFile())) {
      throw codedError(
        'E_BUILD_ARTIFACT_REQUIRED_FILE_MISSING',
        join(stagingDist, 'dashboard', 'index.html'),
      );
    }

    fsyncTree(stagingDist, heartbeat.pulse);
    const sourceAfterBuild = snapshotBuildInputs(root, scope);
    if (sourceAfterBuild.digest !== sourceBefore.digest) {
      throw codedError('E_BUILD_SOURCE_DRIFT_BEFORE_COMMIT');
    }
    const artifact = treeManifest(stagingDist);
    const liveDistExisted = existsSync(liveDist);
    const oldArtifact = liveDistExisted
      ? treeManifest(liveDist)
      : {
        digest: manifestDigest([]),
        fileCount: 0,
        totalBytes: 0,
      };
    const environment = outputEnvironmentSnapshot(buildEnvironment);
    const nodeRuntime = secureFileDigest(process.execPath);
    const preparedAt = canonicalTimestamp(now());
    const journal = {
      schemaVersion: BUILD_SCHEMA_VERSION,
      runId,
      scope,
      state: 'prepared',
      source: sourceBefore,
      artifact: {
        digest: artifact.digest,
        fileCount: artifact.fileCount,
        totalBytes: artifact.totalBytes,
      },
      oldArtifact: {
        digest: oldArtifact.digest,
        fileCount: oldArtifact.fileCount,
        totalBytes: oldArtifact.totalBytes,
      },
      toolchain: workspaceSnapshot.toolchain,
      environment,
      nodeRuntime: {
        pathSha256: createHash('sha256')
          .update(realpathSync.native(process.execPath))
          .digest('hex'),
        bytesSha256: nodeRuntime.sha256,
        version: process.version,
      },
      liveDistExisted,
      authority: {
        lock: state.lock,
        boundary: null,
      },
      paths: {
        stagingDist: relative(root, stagingDist).split(sep).join('/'),
        backupDist: relative(root, backupDist).split(sep).join('/'),
        liveDist: relative(root, liveDist).split(sep).join('/'),
      },
      preparedAt,
    };
    writeJournal(journalPath, journal);
    authority.assert(root, state.lock, authorityOptions);
    const sourceBeforeBoundary = snapshotBuildInputs(root, scope);
    if (sourceBeforeBoundary.digest !== sourceBefore.digest) {
      throw codedError('E_BUILD_SOURCE_DRIFT_BEFORE_BOUNDARY');
    }
    const evidenceRefs = buildEventEvidence(
      runId,
      scope,
      sourceBefore.digest,
      artifact.digest,
    );
    evidenceRefs.push(`build-old-artifact-sha256:${oldArtifact.digest}`);
    evidenceRefs.sort();
    state.boundary = authority.begin(
      root,
      state.lock,
      { evidenceRefs },
      authorityOptions,
    );
    writeJournal(journalPath, {
      ...journal,
      state: 'boundary-entered',
      authority: {
        lock: state.lock,
        boundary: state.boundary,
      },
      boundaryEnteredAt: canonicalTimestamp(now()),
    });
    options.transitionObserver?.('boundary-entered');

    state.mutationStarted = true;
    assertDirectoryBinding(rootBinding, 'E_BUILD_ROOT_IDENTITY_CHANGED');
    assertDirectoryBinding(
      runDirectoryBinding,
      'E_BUILD_RUN_DIRECTORY_IDENTITY_CHANGED',
    );
    const stagedBeforeMutation = treeManifest(stagingDist);
    if (stagedBeforeMutation.digest !== artifact.digest) {
      throw codedError('E_BUILD_STAGED_ARTIFACT_DRIFT');
    }
    if (existsSync(liveDist)) {
      const liveBeforeMutation = treeManifest(liveDist);
      if (!liveDistExisted
        || liveBeforeMutation.digest !== oldArtifact.digest) {
        throw codedError('E_BUILD_LIVE_ARTIFACT_DRIFT');
      }
      if (existsSync(backupDist)) {
        throw codedError('E_BUILD_BACKUP_COLLISION', backupDist);
      }
      renameSync(liveDist, backupDist);
      fsyncDirectory(root);
      fsyncDirectory(runDirectory);
      writeJournal(journalPath, {
        ...journal,
        state: 'live-backed-up',
        authority: {
          lock: state.lock,
          boundary: state.boundary,
        },
        liveBackedUpAt: canonicalTimestamp(now()),
      });
      options.transitionObserver?.('live-backed-up');
    } else if (liveDistExisted) {
      throw codedError('E_BUILD_LIVE_ARTIFACT_DRIFT');
    }
    renameSync(stagingDist, liveDist);
    fsyncDirectory(root);
    fsyncDirectory(runDirectory);
    writeJournal(journalPath, {
      ...journal,
      state: 'live-installed',
      authority: {
        lock: state.lock,
        boundary: state.boundary,
      },
      liveInstalledAt: canonicalTimestamp(now()),
    });
    options.transitionObserver?.('live-installed');
    const committedArtifact = treeManifest(liveDist);
    if (committedArtifact.digest !== artifact.digest) {
      throw codedError('E_BUILD_COMMITTED_ARTIFACT_MISMATCH');
    }
    const sourceAfterCommit = snapshotBuildInputs(root, scope);
    if (sourceAfterCommit.digest !== sourceBefore.digest) {
      throw codedError('E_BUILD_SOURCE_DRIFT_DURING_COMMIT');
    }
    writeJournal(journalPath, {
      ...journal,
      state: 'committed',
      authority: {
        lock: state.lock,
        boundary: state.boundary,
      },
      committedAt: canonicalTimestamp(now()),
    });
    const completion = authority.complete(
      root,
      state.lock,
      {
        quarantineId: state.boundary.quarantineId,
        evidenceRefs: [
          ...evidenceRefs,
          `build-journal:${relative(root, journalPath)}`,
        ].sort(),
      },
      authorityOptions,
    );
    state.authorityTerminal = true;
    heartbeat.stop();
    if (completion.projectionCleanup !== undefined
      && completion.projectionCleanup !== 'completed') {
      writeJournal(journalPath, {
        ...journal,
        state: 'committed-authority-cleanup-uncertain',
        authority: {
          lock: state.lock,
          boundary: state.boundary,
        },
        committedAt: canonicalTimestamp(now()),
        authorityAuditEventId: completion.audit.eventId,
      });
      throw codedError(
        'E_BUILD_AUTHORITY_PROJECTION_CLEANUP_UNCERTAIN',
        runId,
      );
    }
    writeJournal(journalPath, {
      ...journal,
      state: 'committed',
      authority: {
        lock: state.lock,
        boundary: state.boundary,
      },
      committedAt: canonicalTimestamp(now()),
      authorityAuditEventId: completion.audit.eventId,
    });
    let retention;
    try {
      if (existsSync(sourceWorkspace)) {
        rmSync(sourceWorkspace, { recursive: true, force: false });
        fsyncDirectory(runDirectory);
      }
      retention = enforceBuildRetention(root, runId, now());
    } catch (cleanupError) {
      writeJournal(journalPath, {
        ...journal,
        state: 'committed-retention-uncertain',
        authority: {
          lock: state.lock,
          boundary: state.boundary,
        },
        committedAt: canonicalTimestamp(now()),
        authorityAuditEventId: completion.audit.eventId,
      });
      throw codedError(
        'E_BUILD_POSTCOMMIT_RETENTION_UNCERTAIN',
        runId,
        cleanupError,
      );
    }
    return Object.freeze({
      schemaVersion: BUILD_SCHEMA_VERSION,
      runId,
      scope,
      state: 'committed',
      artifactDigest: artifact.digest,
      sourceDigest: sourceBefore.digest,
      journalPath,
      retainedBackupPath: existsSync(backupDist) ? backupDist : null,
      authorityAuditEventId: completion.audit.eventId,
      authorityProjectionCleanup:
        completion.projectionCleanup ?? 'not-reported',
      retention,
    });
  } catch (error) {
    heartbeat.stop();
    if (state.authorityTerminal) throw error;
    if (state.boundary !== undefined || state.mutationStarted) {
      const evidenceRefs = [
        `build-run:${runId}`,
        `build-failure:${error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'E_BUILD_UNKNOWN'}`,
        `build-journal:${relative(root, journalPath)}`,
      ].sort();
      try {
        authority.quarantine(
          root,
          state.lock,
          {
            reason: 'partial-mutation',
            evidenceRefs,
          },
          authorityOptions,
        );
      } catch {
        // An already-committed in-flight row is itself non-retirable HOLD.
      }
      throw codedError(
        'E_BUILD_MUTATION_AUTHORITY_RETAINED',
        runId,
        error,
      );
    }
    try {
      authority.release(root, state.lock, authorityOptions);
    } catch {
      throw codedError(
        'E_BUILD_PRECOMMIT_AUTHORITY_RELEASE_UNCERTAIN',
        runId,
        error,
      );
    }
    try {
      if (existsSync(runDirectory)) {
        rmSync(runDirectory, { recursive: true, force: false });
        fsyncDirectory(dirname(runDirectory));
      }
    } catch (cleanupError) {
      throw codedError(
        'E_BUILD_PRECOMMIT_STAGING_CLEANUP_UNCERTAIN',
        runId,
        cleanupError,
      );
    }
    throw error;
  } finally {
    heartbeat.stop();
  }
}

function parseArguments(argv) {
  let scope = 'core';
  let recoverRunId;
  let attestationFile;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--scope') {
      const value = argv[index + 1];
      if (!value || !BUILD_SCOPES.has(value)) {
        throw codedError('E_BUILD_SCOPE_INVALID', String(value));
      }
      scope = value;
      index += 1;
      continue;
    }
    if (argument === '--recover') {
      const value = argv[index + 1];
      if (!value || !BUILD_RUN_ID_RE.test(value) || recoverRunId) {
        throw codedError('E_BUILD_RECOVERY_ARGUMENT_INVALID', String(value));
      }
      recoverRunId = value;
      index += 1;
      continue;
    }
    if (argument === '--attestation-file') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--') || attestationFile) {
        throw codedError('E_BUILD_RECOVERY_ARGUMENT_INVALID', String(value));
      }
      attestationFile = value;
      index += 1;
      continue;
    }
    throw codedError('E_BUILD_ARGUMENT_UNKNOWN', argument);
  }
  if ((recoverRunId === undefined) !== (attestationFile === undefined)) {
    throw codedError('E_BUILD_RECOVERY_ARGUMENT_INVALID');
  }
  if (recoverRunId !== undefined && scope !== 'core') {
    throw codedError('E_BUILD_RECOVERY_ARGUMENT_INVALID');
  }
  return recoverRunId === undefined
    ? { operation: 'build', scope }
    : {
      operation: 'recover',
      runId: recoverRunId,
      attestationFile,
    };
}

const invokedDirectly =
  process.argv[1]
  && realpathSync.native(process.argv[1]) === SCRIPT_PATH;

if (invokedDirectly) {
  try {
    const command = parseArguments(process.argv.slice(2));
    let result;
    if (command.operation === 'recover') {
      const attestationPath = resolve(REPO_ROOT, command.attestationFile);
      assertContained(
        REPO_ROOT,
        attestationPath,
        'E_BUILD_RECOVERY_ATTESTATION_PATH_OUTSIDE_PROJECT',
      );
      const attestation = JSON.parse(
        secureReadFile(attestationPath, 64 * 1024).toString('utf8'),
      );
      result = recoverTransactionalBuild({
        runId: command.runId,
        attestation,
        recoveryAttestationVerifier: () => true,
      });
    } else {
      result = await runTransactionalBuild({ scope: command.scope });
    }
    console.log(JSON.stringify({
      schemaVersion: BUILD_SCHEMA_VERSION,
      event: command.operation === 'recover'
        ? 'BUILD_RECOVERED'
        : 'BUILD_COMMITTED',
      runId: result.runId,
      scope: result.scope ?? null,
      state: result.state,
      disposition: result.disposition ?? null,
      artifactDigest: result.artifactDigest,
      sourceDigest: result.sourceDigest ?? null,
      retainedBackupPath: result.retainedBackupPath
        ? relative(REPO_ROOT, result.retainedBackupPath)
        : null,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      schemaVersion: BUILD_SCHEMA_VERSION,
      event: 'BUILD_FAILED',
      code: error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'E_BUILD_UNKNOWN',
    }));
    process.exitCode = 1;
  }
}
