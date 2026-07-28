// ─── `deckent provider-authority keyring` — owner-gated integrity material ──
//
// The provider execution authority refuses to compose without a host-scoped
// integrity keyring; every run then holds fail-closed with `keyring_unavailable`
// BEFORE any task, provider, or backend is started. That refusal is correct, but
// until this command existed there was (a) no way for an operator to see WHERE
// the keyring is expected or WHETHER it is provisioned, and (b) no supported way
// for the owner to provision it — `ProviderAuthorityKeyring.create/rotate` were
// reachable only programmatically.
//
// Boundaries this command keeps:
//   - Key material is NEVER printed. `status` shows ids, revision, and hashes.
//   - The keyring lives OUTSIDE the project tree by construction: the project
//     directory is mounted into workers, so project-scoped authority material
//     would be worker-readable. `projectRoot` is passed as the defence-in-depth
//     boundary the keyring module enforces (`KEYRING_PROJECT_SCOPE_FORBIDDEN`).
//   - `init` never overwrites: genesis publication is first-writer-wins, and an
//     existing keyring returns a refusal naming the rotate path instead.
//   - `rotate` requires the caller-supplied `--expect-revision` so a concurrent
//     update is a loud `KEYRING_CONCURRENT_UPDATE`, never a silent clobber.

import type { Command } from 'commander';

import {
  ProviderAuthorityKeyring,
  ProviderAuthorityKeyringError,
  resolveProviderAuthorityKeyringDirectory,
  type ProviderAuthorityKeyringSnapshot,
} from '../../core/provider-authority-keyring.js';
import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
} from '../../core/global-scope-resolver.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Injectable seams so the command is testable without touching a real HOME. */
export interface ProviderAuthorityKeyringDeps {
  resolveProjectRootFn?: () => string;
  /** Overrides the resolved global data directory (tests point this at a tmpdir). */
  dataDirOverride?: string;
  platformOverride?: NodeJS.Platform;
}

interface ResolvedKeyringScope {
  readonly dataDir: string;
  readonly directory: string;
  readonly projectRoot: string;
  readonly platform: NodeJS.Platform;
}

function resolveScope(deps: ProviderAuthorityKeyringDeps): ResolvedKeyringScope {
  const projectRoot = (deps.resolveProjectRootFn ?? resolveProjectRoot)();
  const platform = deps.platformOverride ?? process.platform;
  const scopePlatform = normalizeGlobalScopePlatform(platform, process.env);
  const dataDir = deps.dataDirOverride
    ?? resolveGlobalScopePaths(scopePlatform, process.env).dataDir;
  return {
    dataDir,
    directory: resolveProviderAuthorityKeyringDirectory(scopePlatform, process.env),
    projectRoot,
    platform,
  };
}

function openOptions(scope: ResolvedKeyringScope): {
  dataDir: string;
  platform: NodeJS.Platform;
  projectRoot: string;
} {
  return { dataDir: scope.dataDir, platform: scope.platform, projectRoot: scope.projectRoot };
}

/** Read state without asserting availability — absence is a normal answer here. */
export type KeyringReadState =
  | { readonly state: 'present'; readonly snapshot: ProviderAuthorityKeyringSnapshot }
  | { readonly state: 'absent' }
  | { readonly state: 'unreadable'; readonly code: string; readonly message: string };

export function readKeyringState(deps: ProviderAuthorityKeyringDeps = {}): KeyringReadState {
  const scope = resolveScope(deps);
  try {
    return { state: 'present', snapshot: ProviderAuthorityKeyring.open(openOptions(scope)).snapshot() };
  } catch (error) {
    if (error instanceof ProviderAuthorityKeyringError) {
      // A scope that resolves but holds no genesis revision is "not provisioned",
      // which is an operator-actionable state — not a fault to shout about.
      const absent = error.code === 'KEYRING_SCOPE_UNRESOLVED' || error.code === 'KEYRING_IO_FAILURE';
      return absent
        ? { state: 'absent' }
        : { state: 'unreadable', code: error.code, message: error.message };
    }
    return {
      state: 'unreadable',
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Operator-actionable remedy for an authority hold the operator can actually
 * resolve. Returns null for every other reason so an unrelated hold never gets
 * pointed at the wrong fix.
 */
export function providerAuthorityHoldRemedy(reasonCode: string, lang: string): string | null {
  return reasonCode === 'keyring_unavailable' || reasonCode === 'keyring_storage_unsafe'
    ? getMessage('run.provider_authority_hold.remedy_keyring', lang)
    : null;
}

function printSnapshot(snapshot: ProviderAuthorityKeyringSnapshot, lang: string): void {
  print(getMessage('provider_authority.keyring.present', lang, {
    keyringId: snapshot.keyringId,
    revision: String(snapshot.revision),
    revisionHash: snapshot.revisionHash,
    activeKeyId: snapshot.activeAuthorityKeyId,
    keyCount: String(snapshot.authorityKeys.length),
  }));
  for (const key of snapshot.authorityKeys) {
    print(getMessage('provider_authority.keyring.key_line', lang, {
      keyId: key.keyId,
      status: key.status,
      domains: key.domains.join('+'),
      derivation: key.derivation,
      createdAt: key.createdAt,
    }));
  }
}

export function runKeyringStatus(deps: ProviderAuthorityKeyringDeps = {}): void {
  const lang = getLanguage(undefined);
  const scope = resolveScope(deps);
  print(getMessage('provider_authority.keyring.location', lang, { dir: scope.directory }));
  print(getMessage('provider_authority.keyring.project_scope_note', lang));
  const read = readKeyringState(deps);
  if (read.state === 'present') {
    printSnapshot(read.snapshot, lang);
    return;
  }
  if (read.state === 'unreadable') {
    print(getMessage('provider_authority.keyring.unreadable', lang, {
      code: read.code,
      message: read.message,
    }));
    return;
  }
  print(getMessage('provider_authority.keyring.absent', lang));
}

export function runKeyringInit(deps: ProviderAuthorityKeyringDeps = {}): void {
  const lang = getLanguage(undefined);
  const scope = resolveScope(deps);
  // First-writer-wins genesis: `created === false` means someone else already
  // owns this keyring, which must never be silently replaced.
  const { keyring, created } = ProviderAuthorityKeyring.create(openOptions(scope));
  const snapshot = keyring.snapshot();
  if (!created) {
    print(getMessage('provider_authority.keyring.init_exists', lang, {
      keyringId: snapshot.keyringId,
      revision: String(snapshot.revision),
      revisionHash: snapshot.revisionHash,
    }));
    return;
  }
  print(getMessage('provider_authority.keyring.init_created', lang, {
    keyringId: snapshot.keyringId,
    revision: String(snapshot.revision),
    revisionHash: snapshot.revisionHash,
    dir: scope.directory,
  }));
}

export function runKeyringRotate(
  expectedRevisionHash: string | undefined,
  deps: ProviderAuthorityKeyringDeps = {},
): void {
  const lang = getLanguage(undefined);
  if (!expectedRevisionHash?.trim()) {
    print(getMessage('provider_authority.keyring.rotate_needs_revision', lang));
    return;
  }
  const read = readKeyringState(deps);
  if (read.state === 'absent') {
    print(getMessage('provider_authority.keyring.rotate_absent', lang));
    return;
  }
  const scope = resolveScope(deps);
  const snapshot = ProviderAuthorityKeyring.open(openOptions(scope))
    .rotate({ expectedRevisionHash: expectedRevisionHash.trim() });
  print(getMessage('provider_authority.keyring.rotated', lang, {
    revision: String(snapshot.revision),
    revisionHash: snapshot.revisionHash,
    activeKeyId: snapshot.activeAuthorityKeyId,
  }));
}

export function registerProviderAuthorityCommand(
  program: Command,
  deps: ProviderAuthorityKeyringDeps = {},
): void {
  const lang = getLanguage(undefined);
  const group = program
    .command('provider-authority')
    .description(getMessage('provider_authority.cmd_desc', lang));

  const keyring = group
    .command('keyring')
    .description(getMessage('provider_authority.keyring.cmd_desc', lang));

  keyring
    .command('status')
    .description(getMessage('provider_authority.keyring.status_desc', lang))
    .action(() => {
      try {
        runKeyringStatus(deps);
      } catch (err) {
        printError(err instanceof Error ? err : new Error(String(err)));
        process.exitCode = 1;
      }
    });

  keyring
    .command('init')
    .description(getMessage('provider_authority.keyring.init_desc', lang))
    .action(() => {
      try {
        runKeyringInit(deps);
      } catch (err) {
        printError(err instanceof Error ? err : new Error(String(err)));
        process.exitCode = 1;
      }
    });

  keyring
    .command('rotate')
    .description(getMessage('provider_authority.keyring.rotate_desc', lang))
    .option('--expect-revision <hash>', getMessage('provider_authority.keyring.opt_expect_revision', lang))
    .action((opts: { expectRevision?: string }) => {
      try {
        runKeyringRotate(opts.expectRevision, deps);
      } catch (err) {
        printError(err instanceof Error ? err : new Error(String(err)));
        process.exitCode = 1;
      }
    });
}
