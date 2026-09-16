#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isNpmShrinkwrapSha256,
  NpmShrinkwrapContractError,
  readCanonicalNpmShrinkwrapIdentity,
} from './npm-shrinkwrap-contract.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const EXPECTED_ENVIRONMENTS = new Set(['linux', 'wsl2', 'darwin', 'win32']);
const MAX_CHILD_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_TARBALL_BYTES = 128 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const MAX_RECEIPT_PATH_BYTES = 4096;
const MAX_LOOPBACK_REQUESTS = 16;
const LOOPBACK_HOST = '127.0.0.1';
const CANONICAL_PUBLIC_NPM_REGISTRY = 'https://registry.npmjs.org/';
const NPM_EXECUTABLE = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const INHERITED_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  Object.freeze(['PATH', Object.freeze(['PATH', 'Path'])]),
  Object.freeze(['PATHEXT', Object.freeze(['PATHEXT', 'Pathext'])]),
  Object.freeze(['SystemRoot', Object.freeze(['SystemRoot', 'SYSTEMROOT'])]),
  Object.freeze(['ComSpec', Object.freeze(['ComSpec', 'COMSPEC'])]),
  Object.freeze(['WINDIR', Object.freeze(['WINDIR', 'windir'])]),
]);

class PackedNetworklessInstallError extends Error {
  constructor(code, detail = '') {
    super(detail === '' ? code : `${code}:${detail}`);
    this.name = 'PackedNetworklessInstallError';
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new PackedNetworklessInstallError(code, detail);
}

function parseArguments(argv) {
  if ((argv.length !== 2 && argv.length !== 4)
    || argv[0] !== '--expected-environment'
    || (argv.length === 4 && argv[2] !== '--receipt-file')) {
    fail(
      'E_PACKED_NETWORKLESS_ARGUMENT',
      'expected --expected-environment <linux|wsl2|darwin|win32> [--receipt-file <absolute-path>]',
    );
  }
  const expectedEnvironmentKind = argv[1];
  if (!EXPECTED_ENVIRONMENTS.has(expectedEnvironmentKind)) {
    fail('E_PACKED_NETWORKLESS_ENVIRONMENT_INVALID');
  }
  const receiptFile = argv.length === 4 ? argv[3] : null;
  if (receiptFile !== null
    && (typeof receiptFile !== 'string'
      || receiptFile.includes('\0')
      || Buffer.byteLength(receiptFile, 'utf8') > MAX_RECEIPT_PATH_BYTES
      || !isAbsolute(receiptFile)
      || resolve(receiptFile) !== receiptFile)) {
    fail('E_PACKED_NETWORKLESS_RECEIPT_TARGET_INVALID');
  }
  return { expectedEnvironmentKind, receiptFile };
}

function commandDetail(result) {
  const stderr = result.stderr.slice(-4000);
  const stdout = result.stdout.slice(-4000);
  return `exit=${result.exitCode},timedOut=${result.timedOut},outputExceeded=${result.outputExceeded},stderr=${stderr},stdout=${stdout}`;
}

export function writeDurableReceiptFile(path, output) {
  if (typeof path !== 'string'
    || path.includes('\0')
    || Buffer.byteLength(path, 'utf8') > MAX_RECEIPT_PATH_BYTES
    || !isAbsolute(path)
    || resolve(path) !== path
    || typeof output !== 'string') {
    fail('E_PACKED_NETWORKLESS_RECEIPT_TARGET_INVALID');
  }
  const outputBytes = Buffer.from(output, 'utf8');
  if (outputBytes.byteLength === 0 || outputBytes.byteLength > MAX_RECEIPT_BYTES) {
    fail('E_PACKED_NETWORKLESS_RECEIPT_BYTES_INVALID');
  }
  const parent = dirname(path);
  let parentNamed;
  try {
    parentNamed = lstatSync(parent, { bigint: true });
    if (!parentNamed.isDirectory()
      || parentNamed.isSymbolicLink()
      || realpathSync.native(parent) !== parent) {
      fail('E_PACKED_NETWORKLESS_RECEIPT_PARENT_UNSAFE');
    }
  } catch (error) {
    if (error instanceof PackedNetworklessInstallError) throw error;
    fail('E_PACKED_NETWORKLESS_RECEIPT_PARENT_UNSAFE');
  }

  let receiptFd;
  let parentFd;
  let created = false;
  let completed = false;
  try {
    receiptFd = openSync(
      path,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    created = true;
    fchmodSync(receiptFd, 0o600);
    let offset = 0;
    while (offset < outputBytes.byteLength) {
      const written = writeSync(
        receiptFd,
        outputBytes,
        offset,
        outputBytes.byteLength - offset,
      );
      if (written <= 0) fail('E_PACKED_NETWORKLESS_RECEIPT_WRITE_FAILED');
      offset += written;
    }
    fsyncSync(receiptFd);
    const receiptStat = fstatSync(receiptFd, { bigint: true });
    const receiptNamed = lstatSync(path, { bigint: true });
    if (!receiptStat.isFile()
      || receiptStat.nlink !== 1n
      || (receiptStat.mode & 0o777n) !== 0o600n
      || receiptStat.dev !== receiptNamed.dev
      || receiptStat.ino !== receiptNamed.ino
      || receiptStat.size !== BigInt(outputBytes.byteLength)
      || realpathSync.native(path) !== path) {
      fail('E_PACKED_NETWORKLESS_RECEIPT_WRITE_FAILED');
    }
    closeSync(receiptFd);
    receiptFd = undefined;

    parentFd = openSync(
      parent,
      fsConstants.O_RDONLY
        | (fsConstants.O_DIRECTORY ?? 0)
        | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const parentOpened = fstatSync(parentFd, { bigint: true });
    const parentAfter = lstatSync(parent, { bigint: true });
    if (!parentOpened.isDirectory()
      || parentOpened.dev !== parentNamed.dev
      || parentOpened.ino !== parentNamed.ino
      || parentAfter.dev !== parentNamed.dev
      || parentAfter.ino !== parentNamed.ino
      || realpathSync.native(parent) !== parent) {
      fail('E_PACKED_NETWORKLESS_RECEIPT_PARENT_CHANGED');
    }
    fsyncSync(parentFd);
    completed = true;
  } catch (error) {
    if (error instanceof PackedNetworklessInstallError) throw error;
    fail(
      created
        ? 'E_PACKED_NETWORKLESS_RECEIPT_WRITE_FAILED'
        : 'E_PACKED_NETWORKLESS_RECEIPT_EXISTS_OR_UNSAFE',
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (receiptFd !== undefined) closeSync(receiptFd);
    if (parentFd !== undefined) closeSync(parentFd);
    if (created && !completed && existsSync(path)) {
      try {
        rmSync(path, { force: false });
      } catch {
        // The original typed write failure remains authoritative. A surviving
        // exclusive partial file prevents silent retry/overwrite.
      }
    }
  }
}

function inheritedEnvironmentValue(candidates) {
  for (const candidate of candidates) {
    const value = process.env[candidate];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function privateChildEnvironment(
  homeRoot,
  cacheRoot,
  tempRoot,
  userConfigPath,
  globalConfigPath,
) {
  const env = {};
  for (const [key, candidates] of INHERITED_CHILD_ENVIRONMENT_KEYS) {
    const value = inheritedEnvironmentValue(candidates);
    if (typeof value === 'string' && value.length > 0) env[key] = value;
  }
  return {
    ...env,
    HOME: homeRoot,
    USERPROFILE: homeRoot,
    TEMP: tempRoot,
    TMP: tempRoot,
    TMPDIR: tempRoot,
    npm_config_cache: cacheRoot,
    npm_config_userconfig: userConfigPath,
    npm_config_globalconfig: globalConfigPath,
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    npm_config_ignore_scripts: 'true',
  };
}

export function runBoundedCommand({ command, args, cwd, env, timeoutMs }) {
  return new Promise(resolvePromise => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let outputExceeded = false;
    let settled = false;
    const append = (stream, chunk) => {
      if (outputExceeded) return stream;
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_CHILD_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill('SIGKILL');
        return stream;
      }
      return `${stream}${chunk.toString('utf8')}`;
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      resolvePromise({
        exitCode: 1,
        timedOut: false,
        outputExceeded,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`,
      });
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolvePromise({
        exitCode: code ?? 1,
        timedOut: code === null && signal !== null && !outputExceeded,
        outputExceeded,
        stdout,
        stderr,
      });
    });
  });
}

function stableTarballIdentity(path) {
  const named = lstatSync(path, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n
    || named.size <= 0n || named.size > BigInt(MAX_TARBALL_BYTES)
    || realpathSync.native(path) !== path) {
    fail('E_PACKED_NETWORKLESS_TARBALL_UNSAFE');
  }
  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n
      || before.dev !== named.dev || before.ino !== named.ino
      || before.size !== named.size || before.mtimeNs !== named.mtimeNs) {
      fail('E_PACKED_NETWORKLESS_TARBALL_CHANGED');
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino
      || after.nlink !== before.nlink || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || afterPath.dev !== before.dev || afterPath.ino !== before.ino
      || afterPath.nlink !== before.nlink || afterPath.size !== before.size
      || afterPath.mtimeNs !== before.mtimeNs
      || BigInt(bytes.byteLength) !== before.size) {
      fail('E_PACKED_NETWORKLESS_TARBALL_CHANGED');
    }
    const immutableBytes = Buffer.from(bytes);
    return Object.freeze({
      bytes: immutableBytes,
      byteLength: immutableBytes.byteLength,
      sha256: `sha256:${createHash('sha256').update(immutableBytes).digest('hex')}`,
    });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function createImmutableTarballRequestHandler({ bytes, requestPath, sha256 }) {
  if (!Buffer.isBuffer(bytes)
    || bytes.byteLength === 0
    || bytes.byteLength > MAX_TARBALL_BYTES
    || typeof requestPath !== 'string'
    || !/^\/deckent-[0-9a-f]{64}\.tgz$/u.test(requestPath)
    || typeof sha256 !== 'string'
    || requestPath !== `/deckent-${sha256.replace(/^sha256:/u, '')}.tgz`) {
    fail('E_PACKED_NETWORKLESS_LOOPBACK_IDENTITY_INVALID');
  }
  const immutableBytes = Buffer.from(bytes);
  let requestCount = 0;
  return (request, response) => {
    requestCount += 1;
    response.setHeader('Connection', 'close');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (requestCount > MAX_LOOPBACK_REQUESTS) {
      response.statusCode = 429;
      response.end();
      return;
    }
    if (request.url !== requestPath) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', String(immutableBytes.byteLength));
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('ETag', `"${sha256}"`);
    response.end(request.method === 'HEAD' ? undefined : immutableBytes);
  };
}

export async function startImmutableTarballLoopbackServer(identity) {
  const requestPath = `/deckent-${identity.sha256.replace(/^sha256:/u, '')}.tgz`;
  const handler = createImmutableTarballRequestHandler({
    bytes: identity.bytes,
    requestPath,
    sha256: identity.sha256,
  });
  const server = createServer(handler);
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxHeadersCount = 32;
  await new Promise((resolvePromise, rejectPromise) => {
    const onError = error => rejectPromise(error);
    server.once('error', onError);
    server.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, () => {
      server.off('error', onError);
      resolvePromise();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || address.address !== LOOPBACK_HOST) {
    server.close();
    fail('E_PACKED_NETWORKLESS_LOOPBACK_ADDRESS_INVALID');
  }
  let closed = false;
  return Object.freeze({
    url: `http://${LOOPBACK_HOST}:${address.port}${requestPath}`,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolvePromise, rejectPromise) => {
        const timeout = setTimeout(() => {
          server.closeAllConnections?.();
          rejectPromise(new Error('loopback close timeout'));
        }, 10_000);
        server.close(error => {
          clearTimeout(timeout);
          if (error) rejectPromise(error);
          else resolvePromise();
        });
        server.closeAllConnections?.();
      });
    },
  });
}

function assertLoopbackTarballServer(server, expectedRequestPath) {
  if (server === null || typeof server !== 'object'
    || typeof server.url !== 'string'
    || typeof server.close !== 'function') {
    fail('E_PACKED_NETWORKLESS_LOOPBACK_SERVER_INVALID');
  }
  let parsed;
  try {
    parsed = new URL(server.url);
  } catch {
    fail('E_PACKED_NETWORKLESS_LOOPBACK_SERVER_INVALID');
  }
  if (parsed.protocol !== 'http:'
    || parsed.hostname !== LOOPBACK_HOST
    || parsed.port === ''
    || parsed.pathname !== expectedRequestPath
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.username !== ''
    || parsed.password !== '') {
    fail('E_PACKED_NETWORKLESS_LOOPBACK_SERVER_INVALID');
  }
  return server.url;
}

function parsePackedTarball(stdout, packRoot) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    fail('E_PACKED_NETWORKLESS_PACK_JSON_INVALID');
  }
  if (!Array.isArray(report) || report.length !== 1
    || report[0] === null || typeof report[0] !== 'object') {
    fail('E_PACKED_NETWORKLESS_PACK_JSON_AMBIGUOUS');
  }
  const filename = report[0].filename;
  if (typeof filename !== 'string' || filename.length === 0
    || filename.includes('\0') || basename(filename) !== filename) {
    fail('E_PACKED_NETWORKLESS_PACK_FILENAME_INVALID');
  }
  const tarballPath = resolve(packRoot, filename);
  if (dirname(tarballPath) !== packRoot || !existsSync(tarballPath)) {
    fail('E_PACKED_NETWORKLESS_TARBALL_MISSING');
  }
  return tarballPath;
}

function installedPackageRoot(prefixRoot) {
  const candidates = process.platform === 'win32'
    ? [
      join(prefixRoot, 'node_modules', 'deckent'),
      join(prefixRoot, 'lib', 'node_modules', 'deckent'),
    ]
    : [
      join(prefixRoot, 'lib', 'node_modules', 'deckent'),
      join(prefixRoot, 'node_modules', 'deckent'),
    ];
  const present = candidates.filter(candidate => existsSync(candidate));
  if (present.length !== 1) {
    fail('E_PACKED_NETWORKLESS_INSTALLED_ROOT_AMBIGUOUS', String(present.length));
  }
  return present[0];
}

function parseNativeReceipt(stdout, expectedEnvironmentKind, expectedShrinkwrapSha256) {
  const lines = stdout.split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) fail('E_PACKED_NETWORKLESS_NATIVE_RECEIPT_AMBIGUOUS');
  let receipt;
  try {
    receipt = JSON.parse(lines[0]);
  } catch {
    fail('E_PACKED_NETWORKLESS_NATIVE_RECEIPT_INVALID');
  }
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)
    || receipt.schemaVersion !== 1
    || receipt.event !== 'EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_VERIFIED'
    || receipt.environment?.expectedEnvironmentKind !== expectedEnvironmentKind
    || receipt.environment?.environmentKind !== expectedEnvironmentKind
    || receipt.npmShrinkwrapSha256 !== expectedShrinkwrapSha256
    || receipt.installTimeNativeBuild !== 'ABSENT'
    || receipt.installTimeNativeDownload !== 'ABSENT'
    || receipt.nativeArtifactOrigin !== 'PACKAGED_PREBUILD'
    || receipt.lifecycle?.state !== 'PUBLISHED_READ_VERIFIED') {
    fail('E_PACKED_NETWORKLESS_NATIVE_RECEIPT_CONTRACT');
  }
  return receipt;
}

function assertCommandSuccess(step, result) {
  if (result.exitCode !== 0 || result.timedOut || result.outputExceeded) {
    fail(`E_PACKED_NETWORKLESS_${step}_FAILED`, commandDetail(result));
  }
}

function readShrinkwrapIdentity(packageRoot, rejectionCode) {
  try {
    return readCanonicalNpmShrinkwrapIdentity(packageRoot);
  } catch (error) {
    const detail = error instanceof NpmShrinkwrapContractError
      ? error.message
      : 'E_NPM_SHRINKWRAP_UNKNOWN';
    fail(rejectionCode, detail);
  }
}

function sameShrinkwrapIdentity(left, right) {
  return left.name === right.name
    && left.version === right.version
    && left.sha256 === right.sha256
    && left.byteLength === right.byteLength
    && left.packageCount === right.packageCount;
}

function buildInstalledCliReceipt(result, packageVersion) {
  if (result.stderr !== '') {
    fail('E_PACKED_NETWORKLESS_INSTALLED_CLI_STDERR', result.stderr.slice(-4000));
  }
  const versionTokens = result.stdout.split(/\s+/u);
  if (!versionTokens.some(token => token === packageVersion || token === `v${packageVersion}`)) {
    fail('E_PACKED_NETWORKLESS_INSTALLED_CLI_VERSION_OUTPUT');
  }
  return {
    schemaVersion: 1,
    event: 'DECKENT_INSTALLED_CLI_VERIFIED',
    packageVersion,
    outputSha256: `sha256:${createHash('sha256').update(result.stdout, 'utf8').digest('hex')}`,
  };
}

export async function verifyPackedNetworklessInstall({
  expectedEnvironmentKind,
  loopbackServerFactory = startImmutableTarballLoopbackServer,
  repositoryRoot = REPOSITORY_ROOT,
  runner = runBoundedCommand,
} = {}) {
  if (!EXPECTED_ENVIRONMENTS.has(expectedEnvironmentKind)) {
    fail('E_PACKED_NETWORKLESS_ENVIRONMENT_INVALID');
  }
  const canonicalRepositoryRoot = realpathSync.native(resolve(repositoryRoot));
  const sourceIdentity = readShrinkwrapIdentity(
    canonicalRepositoryRoot,
    'E_PACKED_NETWORKLESS_SOURCE_SHRINKWRAP_INVALID',
  );
  let proofRoot = null;
  let loopbackServer = null;
  let operationError = null;
  try {
    proofRoot = mkdtempSync(join(tmpdir(), 'deckent-packed-networkless-'));
    chmodSync(proofRoot, 0o700);
    const homeRoot = join(proofRoot, 'home');
    const cacheRoot = join(proofRoot, 'cache');
    const packRoot = join(proofRoot, 'pack');
    const warmPrefixRoot = join(proofRoot, 'warm-prefix');
    const targetPrefixRoot = join(proofRoot, 'target-prefix');
    const privateTempRoot = join(proofRoot, 'tmp');
    const userConfigPath = join(proofRoot, 'user.npmrc');
    const globalConfigPath = join(proofRoot, 'global.npmrc');
    for (const directory of [
      homeRoot,
      cacheRoot,
      packRoot,
      warmPrefixRoot,
      targetPrefixRoot,
      privateTempRoot,
    ]) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    writeFileSync(userConfigPath, '', { mode: 0o600 });
    writeFileSync(globalConfigPath, '', { mode: 0o600 });
    const privateEnv = privateChildEnvironment(
      homeRoot,
      cacheRoot,
      privateTempRoot,
      userConfigPath,
      globalConfigPath,
    );
    const packResult = await runner({
      command: NPM_EXECUTABLE,
      args: [
        'pack',
        canonicalRepositoryRoot,
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        packRoot,
      ],
      cwd: proofRoot,
      env: privateEnv,
      timeoutMs: 120_000,
    });
    assertCommandSuccess('PACK', packResult);
    const tarballPath = parsePackedTarball(packResult.stdout, packRoot);
    const tarballIdentity = stableTarballIdentity(tarballPath);
    const tarballSha256 = tarballIdentity.sha256;
    const requestPath = `/deckent-${tarballSha256.replace(/^sha256:/u, '')}.tgz`;
    try {
      loopbackServer = await loopbackServerFactory({
        bytes: Buffer.from(tarballIdentity.bytes),
        byteLength: tarballIdentity.byteLength,
        sha256: tarballSha256,
      });
    } catch (error) {
      fail(
        'E_PACKED_NETWORKLESS_LOOPBACK_START_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
    const tarballUrl = assertLoopbackTarballServer(loopbackServer, requestPath);

    const warmEnv = {
      ...privateEnv,
      npm_config_prefix: warmPrefixRoot,
      npm_config_registry: CANONICAL_PUBLIC_NPM_REGISTRY,
      NO_PROXY: LOOPBACK_HOST,
      no_proxy: LOOPBACK_HOST,
    };
    let warmOperationError = null;
    try {
      const warmInstallResult = await runner({
        command: NPM_EXECUTABLE,
        args: [
          'install',
          '-g',
          tarballUrl,
          '--prefix',
          warmPrefixRoot,
          '--cache',
          cacheRoot,
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
        ],
        cwd: proofRoot,
        env: warmEnv,
        timeoutMs: 600_000,
      });
      assertCommandSuccess('WARM_INSTALL', warmInstallResult);
      const warmInstalledRoot = installedPackageRoot(warmPrefixRoot);
      const warmInstalledIdentity = readShrinkwrapIdentity(
        warmInstalledRoot,
        'E_PACKED_NETWORKLESS_WARM_SHRINKWRAP_INVALID',
      );
      if (!sameShrinkwrapIdentity(warmInstalledIdentity, sourceIdentity)) {
        fail('E_PACKED_NETWORKLESS_WARM_SHRINKWRAP_MISMATCH');
      }
    } catch (error) {
      warmOperationError = error;
    }
    try {
      await loopbackServer.close();
      loopbackServer = null;
    } catch (error) {
      fail(
        'E_PACKED_NETWORKLESS_LOOPBACK_CLOSE_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (warmOperationError !== null) throw warmOperationError;

    const offlineEnv = {
      ...privateEnv,
      npm_config_offline: 'true',
      npm_config_registry: CANONICAL_PUBLIC_NPM_REGISTRY,
      npm_config_proxy: 'http://127.0.0.1:9',
      npm_config_https_proxy: 'http://127.0.0.1:9',
      npm_config_prefix: targetPrefixRoot,
    };
    const installResult = await runner({
      command: NPM_EXECUTABLE,
      args: [
        'install',
        '-g',
        tarballUrl,
        '--prefix',
        targetPrefixRoot,
        '--cache',
        cacheRoot,
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
      ],
      cwd: proofRoot,
      env: offlineEnv,
      timeoutMs: 600_000,
    });
    assertCommandSuccess('INSTALL', installResult);
    const installedRoot = installedPackageRoot(targetPrefixRoot);
    const installedIdentity = readShrinkwrapIdentity(
      installedRoot,
      'E_PACKED_NETWORKLESS_INSTALLED_SHRINKWRAP_INVALID',
    );
    if (!sameShrinkwrapIdentity(installedIdentity, sourceIdentity)) {
      fail(
        'E_PACKED_NETWORKLESS_INSTALLED_SHRINKWRAP_MISMATCH',
        `${sourceIdentity.sha256}:${installedIdentity.sha256}`,
      );
    }

    const nativeResult = await runner({
      command: process.execPath,
      args: [
        join(canonicalRepositoryRoot, 'scripts', 'verify-exec-authority-native-package.mjs'),
        '--package-root',
        installedRoot,
        '--expected-environment',
        expectedEnvironmentKind,
        '--expected-shrinkwrap-sha256',
        sourceIdentity.sha256,
      ],
      cwd: proofRoot,
      env: offlineEnv,
      timeoutMs: 120_000,
    });
    assertCommandSuccess('NATIVE_VERIFY', nativeResult);
    const nativeReceipt = parseNativeReceipt(
      nativeResult.stdout,
      expectedEnvironmentKind,
      sourceIdentity.sha256,
    );
    const cliResult = await runner({
      command: process.execPath,
      args: [join(installedRoot, 'dist', 'cli', 'entry.js'), '--version'],
      cwd: proofRoot,
      env: offlineEnv,
      timeoutMs: 120_000,
    });
    assertCommandSuccess('INSTALLED_CLI', cliResult);
    const installedCliReceipt = buildInstalledCliReceipt(cliResult, installedIdentity.version);

    const postSourceIdentity = readShrinkwrapIdentity(
      canonicalRepositoryRoot,
      'E_PACKED_NETWORKLESS_SOURCE_SHRINKWRAP_CHANGED',
    );
    if (!sameShrinkwrapIdentity(postSourceIdentity, sourceIdentity)) {
      fail('E_PACKED_NETWORKLESS_SOURCE_SHRINKWRAP_CHANGED');
    }
    const postInstalledIdentity = readShrinkwrapIdentity(
      installedRoot,
      'E_PACKED_NETWORKLESS_INSTALLED_SHRINKWRAP_CHANGED',
    );
    if (!sameShrinkwrapIdentity(postInstalledIdentity, installedIdentity)
      || !sameShrinkwrapIdentity(postInstalledIdentity, postSourceIdentity)) {
      fail('E_PACKED_NETWORKLESS_INSTALLED_SHRINKWRAP_CHANGED');
    }
    if (!isNpmShrinkwrapSha256(installedIdentity.sha256)) {
      fail('E_PACKED_NETWORKLESS_SHRINKWRAP_DIGEST_INVALID');
    }
    return {
      schemaVersion: 1,
      event: 'DECKENT_PACKED_NETWORKLESS_INSTALL_VERIFIED',
      expectedEnvironmentKind,
      installNetworkMode: 'OFFLINE',
      cacheAuthority: 'FRESH_PRIVATE_PREWARMED',
      sourceNpmShrinkwrapSha256: sourceIdentity.sha256,
      installedNpmShrinkwrapSha256: installedIdentity.sha256,
      tarballSha256,
      installedCliReceipt,
      nativeReceipt,
    };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (loopbackServer !== null) {
      try {
        await loopbackServer.close();
      } catch {
        // The typed operation/close failure remains authoritative.
      }
    }
    if (proofRoot !== null) {
      try {
        rmSync(proofRoot, { recursive: true, force: false });
      } catch (cleanupError) {
        if (operationError === null) {
          fail(
            'E_PACKED_NETWORKLESS_CLEANUP_FAILED',
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          );
        }
      }
    }
  }
}

export async function runPackedNetworklessInstallCli(argv, verificationOptions = {}) {
  const { expectedEnvironmentKind, receiptFile } = parseArguments(argv);
  const receipt = await verifyPackedNetworklessInstall({
    ...verificationOptions,
    expectedEnvironmentKind,
  });
  const output = `${JSON.stringify(receipt)}\n`;
  if (receiptFile !== null) writeDurableReceiptFile(receiptFile, output);
  return output;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH;
if (isMain) {
  try {
    const output = await runPackedNetworklessInstallCli(process.argv.slice(2));
    process.stdout.write(output);
  } catch (error) {
    const code = error instanceof PackedNetworklessInstallError
      ? error.code
      : 'E_PACKED_NETWORKLESS_UNKNOWN';
    process.stderr.write(`${JSON.stringify({
      schemaVersion: 1,
      event: 'DECKENT_PACKED_NETWORKLESS_INSTALL_REJECTED',
      code,
      detail: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
