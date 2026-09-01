import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export const NPM_SHRINKWRAP_FILENAME = 'npm-shrinkwrap.json';
export const NPM_SHRINKWRAP_MAX_BYTES = 8 * 1024 * 1024;
const PACKAGE_JSON_MAX_BYTES = 16 * 1024;
const ROOT_DEPENDENCY_MAPS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]);
const SHRINKWRAP_KEYS = Object.freeze([
  'name',
  'version',
  'lockfileVersion',
  'requires',
  'packages',
]);
const COMPETING_ROOT_LOCK_FILES = Object.freeze([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]);

export class NpmShrinkwrapContractError extends Error {
  constructor(code, detail = '') {
    super(detail === '' ? code : `${code}:${detail}`);
    this.name = 'NpmShrinkwrapContractError';
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new NpmShrinkwrapContractError(code, detail);
}

function isPlainRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const observed = Object.keys(value);
  return observed.length === expected.length
    && observed.every((key, index) => key === expected[index]);
}

function validIdentityString(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && !value.includes('\0');
}

function stableFileBytes(path, maximumBytes, unsafeCode, changedCode) {
  let named;
  try {
    named = lstatSync(path, { bigint: true });
  } catch {
    fail(unsafeCode, path);
  }
  if (!named.isFile()
    || named.isSymbolicLink()
    || named.nlink !== 1n
    || named.size <= 0n
    || named.size > BigInt(maximumBytes)
    || realpathSync.native(path) !== path) {
    fail(unsafeCode, path);
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
      fail(changedCode, path);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (after.dev !== before.dev
      || after.ino !== before.ino
      || after.nlink !== before.nlink
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || afterPath.dev !== before.dev
      || afterPath.ino !== before.ino
      || afterPath.nlink !== before.nlink
      || afterPath.size !== before.size
      || afterPath.mtimeNs !== before.mtimeNs
      || BigInt(bytes.byteLength) !== before.size) {
      fail(changedCode, path);
    }
    return bytes;
  } catch (error) {
    if (error instanceof NpmShrinkwrapContractError) throw error;
    fail(changedCode, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readJsonObject(path, maximumBytes, label) {
  const bytes = stableFileBytes(
    path,
    maximumBytes,
    `E_NPM_SHRINKWRAP_${label}_UNSAFE`,
    `E_NPM_SHRINKWRAP_${label}_CHANGED`,
  );
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(`E_NPM_SHRINKWRAP_${label}_JSON_INVALID`, path);
  }
  if (!isPlainRecord(value)) fail(`E_NPM_SHRINKWRAP_${label}_JSON_INVALID`, path);
  return { bytes, value };
}

function assertCompetingRootLocksAbsent(packageRoot) {
  for (const filename of COMPETING_ROOT_LOCK_FILES) {
    const lockPath = join(packageRoot, filename);
    try {
      lstatSync(lockPath);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') continue;
      fail('E_NPM_SHRINKWRAP_COMPETING_LOCK_UNSAFE', filename);
    }
    if (filename === 'package-lock.json') {
      fail('E_NPM_SHRINKWRAP_PACKAGE_LOCK_PRESENT', lockPath);
    }
    fail('E_NPM_SHRINKWRAP_COMPETING_LOCK_PRESENT', filename);
  }
}

function assertDependencyMapParity(packageJson, shrinkwrapRoot, key) {
  const packageHas = Object.hasOwn(packageJson, key);
  const shrinkwrapHas = Object.hasOwn(shrinkwrapRoot, key);
  if (packageHas !== shrinkwrapHas) fail('E_NPM_SHRINKWRAP_DEPENDENCY_MAP_MISMATCH', key);
  if (!packageHas) return;
  const packageMap = packageJson[key];
  const shrinkwrapMap = shrinkwrapRoot[key];
  if (!isPlainRecord(packageMap) || !isPlainRecord(shrinkwrapMap)) {
    fail('E_NPM_SHRINKWRAP_DEPENDENCY_MAP_INVALID', key);
  }
  const packageKeys = Object.keys(packageMap).sort();
  const shrinkwrapKeys = Object.keys(shrinkwrapMap).sort();
  if (packageKeys.length !== shrinkwrapKeys.length) {
    fail('E_NPM_SHRINKWRAP_DEPENDENCY_MAP_MISMATCH', key);
  }
  for (let index = 0; index < packageKeys.length; index += 1) {
    const name = packageKeys[index];
    if (name !== shrinkwrapKeys[index]
      || typeof packageMap[name] !== 'string'
      || packageMap[name].length === 0
      || packageMap[name].includes('\0')
      || shrinkwrapMap[name] !== packageMap[name]) {
      fail('E_NPM_SHRINKWRAP_DEPENDENCY_MAP_MISMATCH', `${key}:${name}`);
    }
  }
}

export function isNpmShrinkwrapSha256(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

export function readCanonicalNpmShrinkwrapIdentity(packageRoot) {
  if (typeof packageRoot !== 'string'
    || packageRoot.includes('\0')
    || !isAbsolute(packageRoot)
    || resolve(packageRoot) !== packageRoot) {
    fail('E_NPM_SHRINKWRAP_ROOT_INVALID');
  }
  let canonicalRoot;
  try {
    const rootStat = lstatSync(packageRoot, { bigint: true });
    canonicalRoot = realpathSync.native(packageRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || canonicalRoot !== packageRoot) {
      fail('E_NPM_SHRINKWRAP_ROOT_UNSAFE', packageRoot);
    }
  } catch (error) {
    if (error instanceof NpmShrinkwrapContractError) throw error;
    fail('E_NPM_SHRINKWRAP_ROOT_UNSAFE', packageRoot);
  }

  assertCompetingRootLocksAbsent(canonicalRoot);
  const packageJsonPath = join(canonicalRoot, 'package.json');
  const shrinkwrapPath = join(canonicalRoot, NPM_SHRINKWRAP_FILENAME);
  const packageRecord = readJsonObject(packageJsonPath, PACKAGE_JSON_MAX_BYTES, 'PACKAGE_JSON');
  const shrinkwrapRecord = readJsonObject(
    shrinkwrapPath,
    NPM_SHRINKWRAP_MAX_BYTES,
    'FILE',
  );
  const packageJson = packageRecord.value;
  const shrinkwrap = shrinkwrapRecord.value;
  const packages = shrinkwrap.packages;
  const shrinkwrapRoot = isPlainRecord(packages) ? packages[''] : undefined;

  if (!validIdentityString(packageJson.name)
    || !validIdentityString(packageJson.version)
    || !exactKeys(shrinkwrap, SHRINKWRAP_KEYS)
    || shrinkwrap.name !== packageJson.name
    || shrinkwrap.version !== packageJson.version
    || shrinkwrap.lockfileVersion !== 3
    || shrinkwrap.requires !== true
    || !isPlainRecord(packages)
    || !isPlainRecord(shrinkwrapRoot)
    || shrinkwrapRoot.name !== packageJson.name
    || shrinkwrapRoot.version !== packageJson.version) {
    fail('E_NPM_SHRINKWRAP_IDENTITY_MISMATCH');
  }
  for (const key of ROOT_DEPENDENCY_MAPS) {
    assertDependencyMapParity(packageJson, shrinkwrapRoot, key);
  }
  const canonicalBytes = `${JSON.stringify(shrinkwrap, null, 2)}\n`;
  if (!shrinkwrapRecord.bytes.equals(Buffer.from(canonicalBytes, 'utf8'))) {
    fail('E_NPM_SHRINKWRAP_BYTES_NONCANONICAL');
  }
  const packageCount = Object.keys(packages).length;
  if (!Number.isSafeInteger(packageCount) || packageCount < 1) {
    fail('E_NPM_SHRINKWRAP_PACKAGE_COUNT_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    name: packageJson.name,
    version: packageJson.version,
    lockfileVersion: 3,
    sha256: `sha256:${createHash('sha256').update(shrinkwrapRecord.bytes).digest('hex')}`,
    byteLength: shrinkwrapRecord.bytes.byteLength,
    packageCount,
  });
}
