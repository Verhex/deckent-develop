import { existsSync, realpathSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

type RuntimePlatform = NodeJS.Platform | 'win32' | 'posix';
type MutableFunction = (...args: unknown[]) => unknown;
type MutableFunctionMap = Record<string, MutableFunction>;

const require = createRequire(import.meta.url);
const mutableFs = require('node:fs') as typeof import('node:fs');
const INSTALL_STATE = Symbol.for('deckent.tests.hermeticity.runtime-write-guard');

const SINGLE_TARGET_MUTATIONS = [
  'appendFile',
  'appendFileSync',
  'chmod',
  'chmodSync',
  'chown',
  'chownSync',
  'createWriteStream',
  'lchmod',
  'lchmodSync',
  'lchown',
  'lchownSync',
  'lutimes',
  'lutimesSync',
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'mkdtempDisposableSync',
  'mkdtempSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'truncate',
  'truncateSync',
  'unlink',
  'unlinkSync',
  'utimes',
  'utimesSync',
  'writeFile',
  'writeFileSync',
] as const;

const PROMISE_SINGLE_TARGET_MUTATIONS = [
  'appendFile',
  'chmod',
  'chown',
  'lchmod',
  'lchown',
  'lutimes',
  'mkdir',
  'mkdtemp',
  'mkdtempDisposable',
  'rm',
  'rmdir',
  'truncate',
  'unlink',
  'utimes',
  'writeFile',
] as const;

const PATH_OPENERS = [
  'createReadStream',
] as const;

const PATH_CONSTRUCTORS = [
  'FileReadStream',
  'FileWriteStream',
  'ReadStream',
  'WriteStream',
] as const;

export const RUNTIME_FS_API_CLASSIFICATION = Object.freeze({
  pathMutations: Object.freeze([
    ...SINGLE_TARGET_MUTATIONS,
    'copyFile',
    'copyFileSync',
    'cp',
    'cpSync',
    'link',
    'linkSync',
    'open',
    'openSync',
    'rename',
    'renameSync',
    'symlink',
    'symlinkSync',
  ]),
  pathOpeners: Object.freeze([...PATH_OPENERS, ...PATH_CONSTRUCTORS]),
  fdCapabilities: Object.freeze([
    'close',
    'closeSync',
    'fchmod',
    'fchmodSync',
    'fchown',
    'fchownSync',
    'fdatasync',
    'fdatasyncSync',
    'fsync',
    'fsyncSync',
    'fstat',
    'fstatSync',
    'ftruncate',
    'ftruncateSync',
    'futimes',
    'futimesSync',
    'read',
    'readSync',
    'readv',
    'readvSync',
    'write',
    'writeSync',
    'writev',
    'writevSync',
  ]),
  statefulPathWriters: Object.freeze([
    'Utf8Stream',
  ]),
  nonMutatingOrControl: Object.freeze([
    'Dir',
    'Dirent',
    'Stats',
    '_toUnixTimestamp',
    'access',
    'accessSync',
    'exists',
    'existsSync',
    'glob',
    'globSync',
    'lstat',
    'lstatSync',
    'openAsBlob',
    'opendir',
    'opendirSync',
    'readFile',
    'readFileSync',
    'readdir',
    'readdirSync',
    'readlink',
    'readlinkSync',
    'realpath',
    'realpathSync',
    'stat',
    'statSync',
    'statfs',
    'statfsSync',
    'unwatchFile',
    'watch',
    'watchFile',
  ]),
  promisePathMutations: Object.freeze([
    ...PROMISE_SINGLE_TARGET_MUTATIONS,
    'copyFile',
    'cp',
    'link',
    'open',
    'rename',
    'symlink',
  ]),
  promiseNonMutatingOrControl: Object.freeze([
    'access',
    'glob',
    'lstat',
    'opendir',
    'readFile',
    'readdir',
    'readlink',
    'realpath',
    'stat',
    'statfs',
    'watch',
  ]),
});

export type HermeticWriteCode =
  | 'E_HERMETIC_TASKS_WRITE'
  | 'E_HERMETIC_PROJECT_WRITE'
  | 'E_HERMETIC_DIST_CLEAN'
  | 'E_HERMETIC_UNTRACKED_FD'
  | 'E_HERMETIC_GUARD_CONFLICT';

export class HermeticWriteError extends Error {
  readonly code: HermeticWriteCode;
  readonly operation: string;
  readonly target: string;

  constructor(code: HermeticWriteCode, operation: string, target: string) {
    super(`${code}:${operation}:${target}`);
    this.name = 'HermeticWriteError';
    this.code = code;
    this.operation = operation;
    this.target = target;
  }
}

function pathApi(platform: RuntimePlatform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

function stripWindowsNamespace(value: string): string {
  if (value.slice(0, '\\\\?\\UNC\\'.length).toUpperCase() === '\\\\?\\UNC\\') {
    return `\\\\${value.slice('\\\\?\\UNC\\'.length)}`;
  }
  if (value.startsWith('\\\\?\\')) return value.slice('\\\\?\\'.length);
  return value;
}

function stripWindowsAlternateDataStreams(value: string): string {
  const root = path.win32.parse(value).root;
  const remainder = value.slice(root.length)
    .split('\\')
    .map(segment => segment.split(':', 1)[0])
    .join('\\');
  return `${root}${remainder}`;
}

function hasWindowsExtendedNamespace(value: string): boolean {
  return value.slice(0, '\\\\?\\'.length).toUpperCase() === '\\\\?\\';
}

function stripWindowsTrailingDotsAndSpaces(value: string): string {
  const root = path.win32.parse(value).root;
  const remainder = value.slice(root.length)
    .split('\\')
    .map(segment => segment.replace(/[ .]+$/u, ''))
    .join('\\');
  return `${root}${remainder}`;
}

export function normalizeComparablePath(
  value: string,
  platform: RuntimePlatform = process.platform,
): string {
  const api = pathApi(platform);
  const platformNormalized = api.normalize(value);
  const normalized = platform === 'win32'
    ? stripWindowsAlternateDataStreams(
      hasWindowsExtendedNamespace(platformNormalized)
        ? stripWindowsNamespace(platformNormalized)
        : stripWindowsTrailingDotsAndSpaces(stripWindowsNamespace(platformNormalized)),
    ).toLocaleLowerCase('en-US')
    : platformNormalized.toLocaleLowerCase('en-US');
  return normalized.length > api.parse(normalized).root.length
    ? normalized.replace(/[\\/]+$/, '')
    : normalized;
}

export function physicalAncestorFromModuleUrl(moduleUrl: string, levels: number): string {
  if (!Number.isSafeInteger(levels) || levels < 0) {
    throw new TypeError(`Invalid physical ancestor level: ${String(levels)}`);
  }
  let cursor = path.dirname(realpathSync.native(fileURLToPath(moduleUrl)));
  for (let level = 0; level < levels; level += 1) cursor = path.dirname(cursor);
  return cursor;
}

export function isPathWithin(
  candidate: string,
  root: string,
  platform: RuntimePlatform = process.platform,
): boolean {
  const api = pathApi(platform);
  const normalizedCandidate = normalizeComparablePath(candidate, platform);
  const normalizedRoot = normalizeComparablePath(root, platform);
  const relative = api.relative(normalizedRoot, normalizedCandidate);
  const escapesRoot = relative === '..' || relative.startsWith(`..${api.sep}`);
  return relative === '' || (!escapesRoot && !api.isAbsolute(relative));
}

function pathsOverlap(
  left: string,
  right: string,
  platform: RuntimePlatform = process.platform,
): boolean {
  return isPathWithin(left, right, platform) || isPathWithin(right, left, platform);
}

function pathLikeToString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString();
  if (value instanceof URL && value.protocol === 'file:') return fileURLToPath(value);
  return undefined;
}

function canonicalizeTarget(value: string): string {
  const absolute = path.resolve(value);
  let cursor = absolute;
  const missingSegments: string[] = [];

  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }

  const physicalBase = existsSync(cursor) ? realpathSync.native(cursor) : cursor;
  return path.resolve(physicalBase, ...missingSegments);
}

interface ProtectedRoot {
  code: HermeticWriteCode;
  path: string;
}

export interface RuntimeWritePolicy {
  readonly repoRoot: string;
  readonly protectedRoots: readonly ProtectedRoot[];
  assertWritable(operation: string, target: unknown): void;
}

export function createRuntimeWritePolicy(repoRoot: string): RuntimeWritePolicy {
  const canonicalRepoRoot = canonicalizeTarget(repoRoot);
  const protectedRoots: readonly ProtectedRoot[] = [
    {
      code: 'E_HERMETIC_TASKS_WRITE',
      path: canonicalizeTarget(path.join(canonicalRepoRoot, '.tasks')),
    },
    {
      code: 'E_HERMETIC_PROJECT_WRITE',
      path: canonicalizeTarget(path.join(canonicalRepoRoot, '.locks')),
    },
    {
      code: 'E_HERMETIC_DIST_CLEAN',
      path: canonicalizeTarget(path.join(canonicalRepoRoot, 'dist')),
    },
  ];

  return {
    repoRoot: canonicalRepoRoot,
    protectedRoots,
    assertWritable(operation: string, target: unknown): void {
      const rawPath = pathLikeToString(target);
      if (rawPath === undefined) return;
      const canonicalTarget = canonicalizeTarget(rawPath);
      const protectedRoot = protectedRoots.find(root => pathsOverlap(canonicalTarget, root.path));
      if (protectedRoot) {
        throw new HermeticWriteError(protectedRoot.code, operation, canonicalTarget);
      }
    },
  };
}

interface PatchRecord {
  target: MutableFunctionMap;
  key: string;
  descriptor: PropertyDescriptor;
}

interface InstalledGuard {
  repoRoot: string;
  restore(): void;
}

function patchFunction(
  records: PatchRecord[],
  target: MutableFunctionMap,
  key: string,
  beforeCall: (args: unknown[]) => void,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const original = target[key];
  if (!descriptor || typeof original !== 'function') return;
  const guarded = new Proxy(original, {
    apply(callable, thisArg, args): unknown {
      beforeCall(args);
      return Reflect.apply(callable, thisArg, args);
    },
    construct(callable, args, newTarget): object {
      beforeCall(args);
      return Reflect.construct(callable, args, newTarget);
    },
  });
  records.push({ target, key, descriptor });
  Object.defineProperty(target, key, {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    value: guarded,
    writable: true,
  });
}

function patchCallable(
  records: PatchRecord[],
  target: MutableFunctionMap,
  key: string,
  beforeCall: (args: unknown[]) => void,
  sharedProxies?: WeakMap<MutableFunction, MutableFunction>,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const original = target[key];
  if (!descriptor || typeof original !== 'function') return;
  let guarded = sharedProxies?.get(original);
  if (!guarded) {
    guarded = new Proxy(original, {
      apply(callable, thisArg, args): unknown {
        beforeCall(args);
        return Reflect.apply(callable, thisArg, args);
      },
      construct(callable, args, newTarget): object {
        beforeCall(args);
        return Reflect.construct(callable, args, newTarget);
      },
    });
    sharedProxies?.set(original, guarded);
  }
  records.push({ target, key, descriptor });
  Object.defineProperty(target, key, {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    value: guarded,
    writable: true,
  });
}

function assertUtf8StreamWritable(
  policy: RuntimeWritePolicy,
  operation: string,
  options: unknown,
): void {
  if (options === null || typeof options !== 'object') return;
  const candidate = options as { dest?: unknown; fd?: unknown };
  policy.assertWritable(`${operation}:dest`, candidate.dest);
  policy.assertWritable(`${operation}:fd`, candidate.fd);
  const numericFd = typeof candidate.fd === 'number'
    ? candidate.fd
    : typeof candidate.dest === 'number'
      ? candidate.dest
      : undefined;
  if (numericFd !== undefined) {
    throw new HermeticWriteError(
      'E_HERMETIC_UNTRACKED_FD',
      `${operation}:fd`,
      `fd:${String(numericFd)}`,
    );
  }
}

const WRITE_CAPABLE_OPEN_FLAG_BITS =
  mutableFs.constants.O_WRONLY |
  mutableFs.constants.O_RDWR |
  mutableFs.constants.O_CREAT |
  mutableFs.constants.O_TRUNC |
  mutableFs.constants.O_APPEND;

/**
 * Classify open(2) flags. Only canonical read-only shapes ('r'/'rs', numeric
 * without any write-capable bit, or omitted flags defaulting to 'r') are
 * non-writable; every unknown shape stays fail-closed as write-capable.
 */
export function isWriteCapableOpenFlags(flags: unknown): boolean {
  if (flags === undefined || flags === null) {
    return false; // fs defaults omitted flags to 'r'
  }
  if (typeof flags === 'number') {
    return (flags & WRITE_CAPABLE_OPEN_FLAG_BITS) !== 0;
  }
  if (typeof flags === 'string') {
    return !/^[rs]+$/.test(flags); // 'r' / 'rs' read-only; '+', 'w', 'a' write
  }
  return true;
}

function installPatches(policy: RuntimeWritePolicy): () => void {
  const records: PatchRecord[] = [];
  const fsFunctions = mutableFs as unknown as MutableFunctionMap;
  const promiseFunctions = mutableFs.promises as unknown as MutableFunctionMap;
  const sharedConstructorProxies = new WeakMap<MutableFunction, MutableFunction>();

  for (const key of SINGLE_TARGET_MUTATIONS) {
    patchFunction(records, fsFunctions, key, args => {
      policy.assertWritable(`fs.${key}`, args[0]);
    });
  }
  for (const key of PROMISE_SINGLE_TARGET_MUTATIONS) {
    patchFunction(records, promiseFunctions, key, args => {
      policy.assertWritable(`fs.promises.${key}`, args[0]);
    });
  }
  for (const key of PATH_OPENERS) {
    patchFunction(records, fsFunctions, key, args => {
      policy.assertWritable(`fs.${key}`, args[0]);
    });
  }
  for (const key of PATH_CONSTRUCTORS) {
    patchCallable(records, fsFunctions, key, args => {
      const operation = key === 'FileReadStream'
        ? 'fs.ReadStream'
        : key === 'FileWriteStream'
          ? 'fs.WriteStream'
          : `fs.${key}`;
      policy.assertWritable(operation, args[0]);
    }, sharedConstructorProxies);
  }
  const utf8Stream = fsFunctions.Utf8Stream as MutableFunction & {
    prototype?: MutableFunctionMap;
  };
  if (typeof utf8Stream === 'function') {
    if (utf8Stream.prototype) {
      patchFunction(records, utf8Stream.prototype, 'reopen', args => {
        policy.assertWritable('fs.Utf8Stream.reopen', args[0]);
      });
    }
    patchCallable(records, fsFunctions, 'Utf8Stream', args => {
      assertUtf8StreamWritable(policy, 'fs.Utf8Stream', args[0]);
    }, sharedConstructorProxies);
  }

  for (const key of ['rename', 'renameSync', 'link', 'linkSync'] as const) {
    patchFunction(records, fsFunctions, key, args => {
      policy.assertWritable(`fs.${key}:source`, args[0]);
      policy.assertWritable(`fs.${key}:destination`, args[1]);
    });
  }
  for (const key of ['rename', 'link'] as const) {
    patchFunction(records, promiseFunctions, key, args => {
      policy.assertWritable(`fs.promises.${key}:source`, args[0]);
      policy.assertWritable(`fs.promises.${key}:destination`, args[1]);
    });
  }

  for (const key of ['copyFile', 'copyFileSync', 'cp', 'cpSync'] as const) {
    patchFunction(records, fsFunctions, key, args => {
      policy.assertWritable(`fs.${key}:destination`, args[1]);
    });
  }
  for (const key of ['copyFile', 'cp'] as const) {
    patchFunction(records, promiseFunctions, key, args => {
      policy.assertWritable(`fs.promises.${key}:destination`, args[1]);
    });
  }

  // symlink(2) mutates only the destination directory entry. The referent is
  // not written during creation; later writes through the alias are still
  // canonicalized by assertWritable() and blocked at protected physical roots.
  for (const key of ['symlink', 'symlinkSync'] as const) {
    patchFunction(records, fsFunctions, key, args => {
      policy.assertWritable(`fs.${key}:destination`, args[1]);
    });
  }
  patchFunction(records, promiseFunctions, 'symlink', args => {
    policy.assertWritable('fs.promises.symlink:destination', args[1]);
  });

  // open(2) mutates only when its flags are write-capable. Read-only and
  // directory-pin descriptors (secure-open O_RDONLY/O_NOFOLLOW/O_DIRECTORY,
  // fsync-only 'r') must pass through so fd mutation vectors stay covered by
  // blocking every write-capable open instead — this guard cannot interpose
  // numeric descriptors after they are granted (see installRuntimeWriteGuard).
  for (const key of ['open', 'openSync'] as const) {
    patchFunction(records, fsFunctions, key, args => {
      const flags = typeof args[1] === 'function' ? undefined : args[1];
      if (isWriteCapableOpenFlags(flags)) {
        policy.assertWritable(`fs.${key}`, args[0]);
      }
    });
  }
  patchFunction(records, promiseFunctions, 'open', args => {
    if (isWriteCapableOpenFlags(args[1])) {
      policy.assertWritable('fs.promises.open', args[0]);
    }
  });

  syncBuiltinESMExports();

  return () => {
    for (const { target, key, descriptor } of records.reverse()) {
      Object.defineProperty(target, key, descriptor);
    }
    syncBuiltinESMExports();
  };
}

/**
 * Install a defense-in-depth interposition layer for `node:fs` path capabilities
 * acquired after this call. JavaScript cannot revoke constructors, factories, or
 * numeric file descriptors captured before installation; strong source-tree
 * isolation therefore also requires the static hermeticity gate and a future
 * process/OS sandbox boundary.
 */
export function installRuntimeWriteGuard(repoRoot: string): InstalledGuard {
  const globals = globalThis as typeof globalThis & {
    [INSTALL_STATE]?: InstalledGuard;
  };
  const canonicalRepoRoot = canonicalizeTarget(repoRoot);
  const existing = globals[INSTALL_STATE];
  if (existing) {
    if (existing.repoRoot !== canonicalRepoRoot) {
      throw new HermeticWriteError(
        'E_HERMETIC_GUARD_CONFLICT',
        'install',
        canonicalRepoRoot,
      );
    }
    return existing;
  }

  const restorePatches = installPatches(createRuntimeWritePolicy(canonicalRepoRoot));
  const installed: InstalledGuard = {
    repoRoot: canonicalRepoRoot,
    restore(): void {
      if (globals[INSTALL_STATE] !== installed) return;
      restorePatches();
      delete globals[INSTALL_STATE];
    },
  };
  globals[INSTALL_STATE] = installed;
  return installed;
}
