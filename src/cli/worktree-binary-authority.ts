import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectDeckentRepo } from '../orchestra/self-modifying-detector.js';

export const BUILD_IDENTITY_SCHEMA_VERSION = 1 as const;
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
}

export type WorktreeBinaryIssue =
  | 'runtime-root-mismatch'
  | 'build-identity-missing'
  | 'build-identity-invalid'
  | 'build-root-mismatch';

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
  ) {
    return undefined;
  }

  return {
    schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION,
    packageName: 'deckent',
    packageVersion: record['packageVersion'],
    sourceRootSha256: record['sourceRootSha256'],
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
  });
}
