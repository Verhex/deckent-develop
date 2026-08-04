import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectDeckentRepo } from '../orchestra/self-modifying-detector.js';

export const BUILD_IDENTITY_SCHEMA_VERSION = 2 as const;
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
}

export interface DeckentSourceTreeIdentity {
  readonly sourceTreeSha256: string;
  readonly sourceTreeFileCount: number;
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
      readonly status: 'hold' | 'override';
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
}

interface ResolveWorktreeBinaryAuthorityOptions {
  readonly argv: readonly string[];
  readonly projectRoot: string;
  readonly runtimeModuleUrl: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

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

function decisionForIssue(
  issue: WorktreeBinaryIssue,
  options: EvaluateWorktreeBinaryAuthorityOptions,
): WorktreeBinaryAuthorityDecision {
  const crossCheckoutOverrideEligible = issue === 'runtime-root-mismatch'
    || issue === 'build-root-mismatch';
  return {
    status: options.override && crossCheckoutOverrideEligible ? 'override' : 'hold',
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

  const sourceTree = options.projectSourceTreeIdentity
    ?? buildSourceTreeIdentity(options.projectRoot);
  if (
    options.buildIdentity.sourceTreeSha256 !== sourceTree.sourceTreeSha256
    || options.buildIdentity.sourceTreeFileCount !== sourceTree.sourceTreeFileCount
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

function readRuntimeBuildIdentity(runtimePackageRoot: string): {
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
    ? readRuntimeBuildIdentity(runtimePackageRoot)
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
