import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, posix, relative, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectDeckentRepo } from '../orchestra/self-modifying-detector.js';

export const BUILD_IDENTITY_SCHEMA_VERSION = 3 as const;
export const BUILD_IDENTITY_RELATIVE_PATH = join('dist', 'build-identity.json');
export const CROSS_CHECKOUT_BINARY_OVERRIDE_ENV = 'DECKENT_ALLOW_CROSS_CHECKOUT_BINARY' as const;

const DIAGNOSTIC_TOKENS: ReadonlySet<string> = new Set([
  '--help',
  '-h',
  'help',
  '--version',
  '-V',
  '--version-json',
]);

export interface DeckentBuildIdentity {
  readonly schemaVersion: typeof BUILD_IDENTITY_SCHEMA_VERSION;
  readonly packageName: 'deckent';
  readonly packageVersion: string;
  readonly sourceRootSha256: string;
  readonly sourceTreeSha256: string;
  readonly sourceTreeFileCount: number;
  readonly nativeSourceTreeSha256: string;
  readonly nativeSourceTreeFileCount: number;
}

export interface DeckentSourceTreeIdentity {
  readonly sourceTreeSha256: string;
  readonly sourceTreeFileCount: number;
}

export interface DeckentNativeSourceTreeIdentity {
  readonly nativeSourceTreeSha256: string;
  readonly nativeSourceTreeFileCount: number;
}

export type WorktreeBinaryIssue =
  | 'runtime-root-mismatch'
  | 'build-identity-missing'
  | 'build-identity-invalid'
  | 'build-root-mismatch'
  | 'build-source-mismatch';

export type WorktreeBinaryAuthorityDecision =
  | {
      readonly status: 'allow';
      readonly reason:
        | 'diagnostic-invocation'
        | 'user-project'
        | 'same-root-source-entry'
        | 'matching-build-identity';
    }
  | {
      readonly status: 'hold' | 'override' | 'warn';
      readonly issue: WorktreeBinaryIssue;
      readonly projectRoot: string;
      readonly runtimePackageRoot: string;
    };

interface EvaluateWorktreeBinaryAuthorityOptions {
  readonly projectRoot: string;
  readonly runtimePackageRoot: string;
  readonly runtimeKind: 'source' | 'dist';
  readonly buildIdentity: DeckentBuildIdentity | undefined;
  readonly buildIdentityState?: 'missing' | 'invalid';
  readonly override: boolean;
  readonly platform?: NodeJS.Platform;
  readonly isDeckentCheckout?: boolean;
  readonly projectRootSha256?: string;
  readonly projectSourceTreeIdentity?: DeckentSourceTreeIdentity;
  readonly projectNativeSourceTreeIdentity?: DeckentNativeSourceTreeIdentity;
}

interface ResolveWorktreeBinaryAuthorityOptions {
  readonly argv: readonly string[];
  readonly projectRoot: string;
  readonly runtimeModuleUrl: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

export interface ReadRuntimeBuildIdentityOptions {
  /** Checkout whose current sources and dist output must be bound together. */
  readonly projectRoot: string;
  /** URL of the module that is actually executing (normally `import.meta.url`). */
  readonly runtimeModuleUrl: string;
}

export type RuntimeBuildIdentityHoldIssue =
  | 'runtime-module-url-invalid'
  | 'runtime-not-checkout-dist'
  | 'runtime-entrypoint-unsafe'
  | 'build-identity-missing'
  | 'build-identity-unsafe'
  | 'build-identity-invalid'
  | 'build-root-mismatch'
  | 'build-source-unreadable'
  | 'build-source-mismatch';

export interface RuntimeBuildIdentityAdoptionBinding {
  readonly runtimePackageRoot: string;
  readonly entrypointPath: string;
  readonly buildIdentityPath: string;
  readonly buildIdentity: DeckentBuildIdentity;
  readonly currentSourceTreeIdentity: DeckentSourceTreeIdentity;
  readonly currentNativeSourceTreeIdentity: DeckentNativeSourceTreeIdentity;
  readonly buildIdentitySha256: string;
  readonly entrypointSha256: string;
}

export type RuntimeBuildIdentityReadResult =
  | {
      readonly status: 'adopt';
      readonly binding: RuntimeBuildIdentityAdoptionBinding;
    }
  | {
      readonly status: 'hold';
      readonly issue: RuntimeBuildIdentityHoldIssue;
    };

function canonicalRoot(root: string): string {
  try {
    return realpathSync.native(root);
  } catch {
    return resolve(root);
  }
}

const SOURCE_INPUT_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.json', '.md', '.template']);
const SOURCE_INPUT_EXCLUDED_DIRECTORIES = new Set(['dashboard', 'desktop']);
const SOURCE_INPUT_FILE_LIMIT = 100_000;
const SOURCE_INPUT_MAX_BYTES = 64 * 1024 * 1024;
const BUILD_IDENTITY_MAX_BYTES = 64 * 1024;
const RUNTIME_ENTRYPOINT_MAX_BYTES = 64 * 1024 * 1024;
const NATIVE_SOURCE_RELATIVE_ROOT = join('native', 'exec-authority');
const NATIVE_SOURCE_ROOT_FILES = Object.freeze([
  'binding.gyp',
  'index.mjs',
  'package.json',
]);
const NATIVE_SOURCE_EXTENSIONS = Object.freeze(['.c', '.h']);
const NATIVE_SOURCE_FILE_LIMIT = 256;
const NATIVE_SOURCE_FILE_MAX_BYTES = 8 * 1024 * 1024;
const NATIVE_SOURCE_TOTAL_MAX_BYTES = 32 * 1024 * 1024;

class BoundedReadError extends Error {}

/**
 * Read one regular file through a stable descriptor. The path is checked both
 * before and after the read, while descriptor metadata proves that the bytes
 * came from that exact inode. This intentionally rejects symlinks and hard
 * links: neither is needed for files inside a checkout's real `dist` tree.
 */
function readStableFile(path: string, maxBytes: number): Buffer {
  let before: ReturnType<typeof lstatSync>;
  try {
    before = lstatSync(path, { bigint: true });
  } catch {
    throw new BoundedReadError('missing');
  }
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1n
    || before.size > BigInt(maxBytes)
  ) throw new BoundedReadError('unsafe');

  let fd: number;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch {
    throw new BoundedReadError('unsafe');
  }
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (
      !opened.isFile()
      || opened.dev !== before.dev
      || opened.ino !== before.ino
      || opened.size !== before.size
    ) throw new BoundedReadError('changed');
    const bytes = readFileSync(fd);
    const afterDescriptor = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      afterDescriptor.dev !== opened.dev
      || afterDescriptor.ino !== opened.ino
      || afterDescriptor.size !== opened.size
      || afterDescriptor.mtimeNs !== opened.mtimeNs
      || afterPath.dev !== opened.dev
      || afterPath.ino !== opened.ino
      || afterPath.size !== opened.size
      || afterPath.mtimeNs !== opened.mtimeNs
      || BigInt(bytes.byteLength) !== opened.size
    ) throw new BoundedReadError('changed');
    return bytes;
  } catch (error) {
    if (error instanceof BoundedReadError) throw error;
    throw new BoundedReadError('unsafe');
  } finally {
    closeSync(fd);
  }
}

function isPathInside(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel !== '' && !rel.startsWith(`..${posix.sep}`) && !rel.startsWith(`..${win32.sep}`)
    && rel !== '..' && !posix.isAbsolute(rel) && !win32.isAbsolute(rel);
}

function pathFromParentIsSymlinkFree(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  if (!isPathInside(parent, candidate)) return false;
  let cursor = parent;
  try {
    for (const segment of rel.split(/[\\/]/u)) {
      cursor = join(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function sourceInputFiles(root: string): string[] {
  const files: string[] = [];
  const addTree = (directory: string, atSourceRoot: boolean): void => {
    for (const entry of readdirSync(directory).sort()) {
      if (atSourceRoot && SOURCE_INPUT_EXCLUDED_DIRECTORIES.has(entry)) continue;
      const path = join(directory, entry);
      const stat = lstatSync(path, { bigint: true });
      if (stat.isSymbolicLink()) throw new Error(`E_BUILD_SOURCE_SYMLINK:${path}`);
      if (stat.isDirectory()) {
        addTree(path, false);
        continue;
      }
      if (!stat.isFile()) continue;
      if (!SOURCE_INPUT_EXTENSIONS.some(extension => entry.endsWith(extension))) continue;
      files.push(path);
      if (files.length > SOURCE_INPUT_FILE_LIMIT) {
        throw new Error('E_BUILD_SOURCE_FILE_LIMIT');
      }
    }
  };
  for (const name of ['package.json', 'tsconfig.json']) {
    const path = join(root, name);
    if (existsSync(path)) files.push(path);
  }
  const source = join(root, 'src');
  if (!existsSync(source)) throw new Error('E_BUILD_SOURCE_TREE_MISSING');
  addTree(source, true);
  return files.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

function identityCheckedSourceBytes(path: string): Buffer {
  const before = lstatSync(path, { bigint: true });
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1n
    || before.size > BigInt(SOURCE_INPUT_MAX_BYTES)
  ) throw new Error(`E_BUILD_SOURCE_INPUT_UNSAFE:${path}`);
  const bytes = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (
    after.dev !== before.dev
    || after.ino !== before.ino
    || after.size !== before.size
    || after.mtimeNs !== before.mtimeNs
    || BigInt(bytes.byteLength) !== before.size
  ) throw new Error(`E_BUILD_SOURCE_INPUT_CHANGED:${path}`);
  return bytes;
}

export function buildSourceTreeIdentity(root: string): DeckentSourceTreeIdentity {
  const canonical = canonicalRoot(root);
  const hash = createHash('sha256');
  const files = sourceInputFiles(canonical);
  for (const path of files) {
    const relativePath = relative(canonical, path).split(/[\\/]/u).join('/');
    const bytes = identityCheckedSourceBytes(path);
    hash.update(relativePath);
    hash.update('\0');
    hash.update(String(bytes.byteLength));
    hash.update('\0');
    hash.update(createHash('sha256').update(bytes).digest('hex'));
    hash.update('\n');
  }
  return Object.freeze({
    sourceTreeSha256: hash.digest('hex'),
    sourceTreeFileCount: files.length,
  });
}

function assertNativeSourceDirectory(path: string): void {
  const stat = lstatSync(path, { bigint: true });
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || realpathSync.native(path) !== path
  ) throw new Error(`E_NATIVE_SOURCE_DIRECTORY_UNSAFE:${path}`);
}

export function nativeSourceRelativePaths(root: string): readonly string[] {
  const canonical = realpathSync.native(root);
  const nativeRoot = join(canonical, NATIVE_SOURCE_RELATIVE_ROOT);
  assertNativeSourceDirectory(nativeRoot);
  const paths = NATIVE_SOURCE_ROOT_FILES.map(name => join(nativeRoot, name));
  const sourceRoot = join(nativeRoot, 'src');
  assertNativeSourceDirectory(sourceRoot);

  const visit = (directory: string): void => {
    assertNativeSourceDirectory(directory);
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      const stat = lstatSync(path, { bigint: true });
      if (stat.isSymbolicLink()) throw new Error(`E_NATIVE_SOURCE_SYMLINK:${path}`);
      if (stat.isDirectory()) {
        visit(path);
      } else if (
        stat.isFile()
        && NATIVE_SOURCE_EXTENSIONS.some(extension => entry.endsWith(extension))
      ) {
        paths.push(path);
      } else {
        throw new Error(`E_NATIVE_SOURCE_ENTRY_UNSUPPORTED:${path}`);
      }
      if (paths.length > NATIVE_SOURCE_FILE_LIMIT) {
        throw new Error('E_NATIVE_SOURCE_FILE_LIMIT');
      }
    }
  };
  visit(sourceRoot);
  return Object.freeze(paths
    .map(path => relative(canonical, path).split(/[\\/]/u).join('/'))
    .sort((left, right) => left.localeCompare(right)));
}

function nativeSourceBytes(path: string): Buffer {
  const named = lstatSync(path, { bigint: true });
  if (
    !named.isFile()
    || named.isSymbolicLink()
    || named.nlink !== 1n
    || named.size <= 0n
    || named.size > BigInt(NATIVE_SOURCE_FILE_MAX_BYTES)
  ) throw new Error(`E_NATIVE_SOURCE_FILE_UNSAFE:${path}`);

  let fd: number | undefined;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd, { bigint: true });
    if (
      !before.isFile()
      || before.nlink !== 1n
      || before.dev !== named.dev
      || before.ino !== named.ino
      || before.size !== named.size
      || before.mtimeNs !== named.mtimeNs
    ) throw new Error(`E_NATIVE_SOURCE_FILE_CHANGED:${path}`);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || afterPath.dev !== before.dev
      || afterPath.ino !== before.ino
      || afterPath.size !== before.size
      || afterPath.mtimeNs !== before.mtimeNs
      || BigInt(bytes.byteLength) !== before.size
    ) throw new Error(`E_NATIVE_SOURCE_FILE_CHANGED:${path}`);
    return bytes;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function buildNativeSourceTreeIdentity(root: string): DeckentNativeSourceTreeIdentity {
  const canonical = realpathSync.native(root);
  const paths = nativeSourceRelativePaths(canonical);
  const hash = createHash('sha256');
  let totalBytes = 0;
  for (const relativePath of paths) {
    const bytes = nativeSourceBytes(join(canonical, ...relativePath.split('/')));
    totalBytes += bytes.byteLength;
    if (totalBytes > NATIVE_SOURCE_TOTAL_MAX_BYTES) {
      throw new Error('E_NATIVE_SOURCE_BYTE_LIMIT');
    }
    hash.update(relativePath);
    hash.update('\0');
    hash.update(String(bytes.byteLength));
    hash.update('\0');
    hash.update(createHash('sha256').update(bytes).digest('hex'));
    hash.update('\n');
  }
  return Object.freeze({
    nativeSourceTreeSha256: `sha256:${hash.digest('hex')}`,
    nativeSourceTreeFileCount: paths.length,
  });
}

export function buildSourceRootSha256(root: string): string {
  return createHash('sha256').update(canonicalRoot(root)).digest('hex');
}

export function parseBuildIdentity(raw: string): DeckentBuildIdentity | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = [
    'nativeSourceTreeFileCount',
    'nativeSourceTreeSha256',
    'packageName',
    'packageVersion',
    'schemaVersion',
    'sourceRootSha256',
    'sourceTreeFileCount',
    'sourceTreeSha256',
  ];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return undefined;
  }
  if (
    record['schemaVersion'] !== BUILD_IDENTITY_SCHEMA_VERSION
    || record['packageName'] !== 'deckent'
    || typeof record['packageVersion'] !== 'string'
    || record['packageVersion'].length === 0
    || typeof record['sourceRootSha256'] !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record['sourceRootSha256'])
    || typeof record['sourceTreeSha256'] !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record['sourceTreeSha256'])
    || !Number.isSafeInteger(record['sourceTreeFileCount'])
    || (record['sourceTreeFileCount'] as number) < 1
    || typeof record['nativeSourceTreeSha256'] !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(record['nativeSourceTreeSha256'])
    || !Number.isSafeInteger(record['nativeSourceTreeFileCount'])
    || (record['nativeSourceTreeFileCount'] as number) < NATIVE_SOURCE_ROOT_FILES.length + 1
  ) {
    return undefined;
  }

  return {
    schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION,
    packageName: 'deckent',
    packageVersion: record['packageVersion'],
    sourceRootSha256: record['sourceRootSha256'],
    sourceTreeSha256: record['sourceTreeSha256'],
    sourceTreeFileCount: record['sourceTreeFileCount'] as number,
    nativeSourceTreeSha256: record['nativeSourceTreeSha256'],
    nativeSourceTreeFileCount: record['nativeSourceTreeFileCount'] as number,
  };
}

function rootsEqual(left: string, right: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32') {
    return win32.resolve(left).toLocaleLowerCase('en-US')
      === win32.resolve(right).toLocaleLowerCase('en-US');
  }
  return posix.resolve(left) === posix.resolve(right);
}

export function shouldCheckWorktreeBinaryAuthority(argv: readonly string[]): boolean {
  return !argv.slice(2).some((token) => DIAGNOSTIC_TOKENS.has(token));
}

/**
 * Issues where the running binary provably belongs to ANOTHER checkout — the
 * hazard this authority exists for. These stay fail-closed.
 */
const CROSS_CHECKOUT_ISSUES: ReadonlySet<WorktreeBinaryIssue> = new Set([
  'runtime-root-mismatch',
  'build-root-mismatch',
]);

function decisionForIssue(
  issue: WorktreeBinaryIssue,
  options: EvaluateWorktreeBinaryAuthorityOptions,
): WorktreeBinaryAuthorityDecision {
  // Same-checkout drift (stale/missing/invalid dist for THIS root) is advisory,
  // not a hold. Deckent is a self-modifying agent runtime: a worker writing to
  // `src/` during a run makes `dist/` stale by construction, so holding here
  // locked the operator out of the very commands needed to observe or rescue
  // that run (`status`, `watch`, `recover`, `finalize`) — measured three times
  // on 2026-08-09, each time producing a closed loop that only a clean-less
  // `tsc` could break. A missing/invalid `dist` is the same class: it happens
  // when a build is interrupted, which is exactly when recovery is needed.
  // The genuine hazard — running a build that belongs to a DIFFERENT checkout —
  // remains fail-closed below.
  if (!CROSS_CHECKOUT_ISSUES.has(issue)) {
    return {
      status: 'warn',
      issue,
      projectRoot: options.projectRoot,
      runtimePackageRoot: options.runtimePackageRoot,
    };
  }
  return {
    status: options.override ? 'override' : 'hold',
    issue,
    projectRoot: options.projectRoot,
    runtimePackageRoot: options.runtimePackageRoot,
  };
}

export function evaluateWorktreeBinaryAuthority(
  options: EvaluateWorktreeBinaryAuthorityOptions,
): WorktreeBinaryAuthorityDecision {
  const isDeckentCheckout = options.isDeckentCheckout
    ?? detectDeckentRepo(options.projectRoot);
  if (!isDeckentCheckout) return { status: 'allow', reason: 'user-project' };

  const platform = options.platform ?? process.platform;
  if (!rootsEqual(options.projectRoot, options.runtimePackageRoot, platform)) {
    return decisionForIssue('runtime-root-mismatch', options);
  }

  if (options.runtimeKind === 'source') {
    return { status: 'allow', reason: 'same-root-source-entry' };
  }

  if (!options.buildIdentity) {
    return decisionForIssue(
      options.buildIdentityState === 'invalid'
        ? 'build-identity-invalid'
        : 'build-identity-missing',
      options,
    );
  }

  const projectRootSha256 = options.projectRootSha256
    ?? buildSourceRootSha256(options.projectRoot);
  if (options.buildIdentity.sourceRootSha256 !== projectRootSha256) {
    return decisionForIssue('build-root-mismatch', options);
  }

  let sourceTree: DeckentSourceTreeIdentity;
  let nativeSourceTree: DeckentNativeSourceTreeIdentity;
  try {
    sourceTree = options.projectSourceTreeIdentity
      ?? buildSourceTreeIdentity(options.projectRoot);
    nativeSourceTree = options.projectNativeSourceTreeIdentity
      ?? buildNativeSourceTreeIdentity(options.projectRoot);
  } catch {
    return decisionForIssue('build-source-mismatch', options);
  }
  if (
    options.buildIdentity.sourceTreeSha256 !== sourceTree.sourceTreeSha256
    || options.buildIdentity.sourceTreeFileCount !== sourceTree.sourceTreeFileCount
    || options.buildIdentity.nativeSourceTreeSha256 !== nativeSourceTree.nativeSourceTreeSha256
    || options.buildIdentity.nativeSourceTreeFileCount !== nativeSourceTree.nativeSourceTreeFileCount
  ) {
    return decisionForIssue('build-source-mismatch', options);
  }

  return { status: 'allow', reason: 'matching-build-identity' };
}

function runtimeKindFor(modulePath: string, runtimePackageRoot: string): 'source' | 'dist' {
  const rel = relative(runtimePackageRoot, modulePath);
  const firstSegment = rel.split(/[\\/]/u)[0];
  return firstSegment === 'src' ? 'source' : 'dist';
}

/**
 * Fresh, read-only proof that an executing module and the exact build manifest
 * beside it belong to the requested checkout's `dist` output. No identity is
 * synthesized for source or diagnostic execution: callers receive a typed
 * HOLD unless all bytes and current source inputs can be bound exactly.
 */
export function readRuntimeBuildIdentity(
  options: ReadRuntimeBuildIdentityOptions,
): RuntimeBuildIdentityReadResult {
  const runtimePackageRoot = canonicalRoot(options.projectRoot);
  let modulePath: string;
  try {
    modulePath = fileURLToPath(options.runtimeModuleUrl);
  } catch {
    return { status: 'hold', issue: 'runtime-module-url-invalid' };
  }

  const distRoot = join(runtimePackageRoot, 'dist');
  try {
    if (!rootsEqual(realpathSync.native(distRoot), distRoot, process.platform)) {
      return { status: 'hold', issue: 'runtime-not-checkout-dist' };
    }
  } catch {
    return { status: 'hold', issue: 'runtime-not-checkout-dist' };
  }
  const unresolvedEntrypointPath = resolve(modulePath);
  if (!isPathInside(distRoot, unresolvedEntrypointPath)) {
    return { status: 'hold', issue: 'runtime-not-checkout-dist' };
  }
  if (!pathFromParentIsSymlinkFree(distRoot, unresolvedEntrypointPath)) {
    return { status: 'hold', issue: 'runtime-entrypoint-unsafe' };
  }
  let entrypointPath: string;
  try {
    entrypointPath = realpathSync.native(modulePath);
  } catch {
    return { status: 'hold', issue: 'runtime-entrypoint-unsafe' };
  }
  if (!isPathInside(distRoot, entrypointPath)) {
    return { status: 'hold', issue: 'runtime-not-checkout-dist' };
  }

  let entrypointBytes: Buffer;
  try {
    entrypointBytes = readStableFile(entrypointPath, RUNTIME_ENTRYPOINT_MAX_BYTES);
  } catch {
    return { status: 'hold', issue: 'runtime-entrypoint-unsafe' };
  }

  const buildIdentityPath = join(runtimePackageRoot, BUILD_IDENTITY_RELATIVE_PATH);
  let buildIdentityBytes: Buffer;
  try {
    buildIdentityBytes = readStableFile(buildIdentityPath, BUILD_IDENTITY_MAX_BYTES);
  } catch (error) {
    return {
      status: 'hold',
      issue: error instanceof BoundedReadError && error.message === 'missing'
        ? 'build-identity-missing'
        : 'build-identity-unsafe',
    };
  }
  const buildIdentity = parseBuildIdentity(buildIdentityBytes.toString('utf-8'));
  if (!buildIdentity) return { status: 'hold', issue: 'build-identity-invalid' };
  if (buildIdentity.sourceRootSha256 !== buildSourceRootSha256(runtimePackageRoot)) {
    return { status: 'hold', issue: 'build-root-mismatch' };
  }

  let currentSourceTreeIdentity: DeckentSourceTreeIdentity;
  let currentNativeSourceTreeIdentity: DeckentNativeSourceTreeIdentity;
  try {
    currentSourceTreeIdentity = buildSourceTreeIdentity(runtimePackageRoot);
    currentNativeSourceTreeIdentity = buildNativeSourceTreeIdentity(runtimePackageRoot);
  } catch {
    return { status: 'hold', issue: 'build-source-unreadable' };
  }
  if (
    buildIdentity.sourceTreeSha256 !== currentSourceTreeIdentity.sourceTreeSha256
    || buildIdentity.sourceTreeFileCount !== currentSourceTreeIdentity.sourceTreeFileCount
    || buildIdentity.nativeSourceTreeSha256 !== currentNativeSourceTreeIdentity.nativeSourceTreeSha256
    || buildIdentity.nativeSourceTreeFileCount !== currentNativeSourceTreeIdentity.nativeSourceTreeFileCount
  ) return { status: 'hold', issue: 'build-source-mismatch' };

  const normalizedIdentity = Object.freeze({ ...buildIdentity });
  const normalizedSourceTree = Object.freeze({ ...currentSourceTreeIdentity });
  const normalizedNativeSourceTree = Object.freeze({ ...currentNativeSourceTreeIdentity });
  return {
    status: 'adopt',
    binding: Object.freeze({
      runtimePackageRoot,
      entrypointPath,
      buildIdentityPath,
      buildIdentity: normalizedIdentity,
      currentSourceTreeIdentity: normalizedSourceTree,
      currentNativeSourceTreeIdentity: normalizedNativeSourceTree,
      buildIdentitySha256: createHash('sha256').update(buildIdentityBytes).digest('hex'),
      entrypointSha256: createHash('sha256').update(entrypointBytes).digest('hex'),
    }),
  };
}

function readAuthorityBuildIdentity(runtimePackageRoot: string): {
  readonly identity: DeckentBuildIdentity | undefined;
  readonly state: 'missing' | 'invalid' | undefined;
} {
  const manifestPath = join(runtimePackageRoot, BUILD_IDENTITY_RELATIVE_PATH);
  if (!existsSync(manifestPath)) return { identity: undefined, state: 'missing' };
  try {
    const identity = parseBuildIdentity(readFileSync(manifestPath, 'utf-8'));
    return identity
      ? { identity, state: undefined }
      : { identity: undefined, state: 'invalid' };
  } catch {
    return { identity: undefined, state: 'invalid' };
  }
}

export function resolveWorktreeBinaryAuthority(
  options: ResolveWorktreeBinaryAuthorityOptions,
): WorktreeBinaryAuthorityDecision {
  if (!shouldCheckWorktreeBinaryAuthority(options.argv)) {
    return { status: 'allow', reason: 'diagnostic-invocation' };
  }

  const modulePath = fileURLToPath(options.runtimeModuleUrl);
  const runtimePackageRoot = canonicalRoot(resolve(dirname(modulePath), '..', '..'));
  const projectRoot = canonicalRoot(options.projectRoot);
  const runtimeKind = runtimeKindFor(modulePath, runtimePackageRoot);
  const build = runtimeKind === 'dist'
    ? readAuthorityBuildIdentity(runtimePackageRoot)
    : { identity: undefined, state: undefined };

  return evaluateWorktreeBinaryAuthority({
    projectRoot,
    runtimePackageRoot,
    runtimeKind,
    buildIdentity: build.identity,
    ...(build.state ? { buildIdentityState: build.state } : {}),
    override: options.env?.[CROSS_CHECKOUT_BINARY_OVERRIDE_ENV] === '1',
    platform: options.platform,
    // projectSourceTreeIdentity deliberately NOT precomputed here: evaluate resolves it
    // lazily AFTER the user-project allow and root-mismatch gates. An eager
    // buildSourceTreeIdentity() call crashed every non-diagnostic command with a raw
    // E_BUILD_SOURCE_TREE_MISSING in any src-less user project
    // (PROD-BINARY-IDENTITY-EAGER-CRASH-001).
  });
}
