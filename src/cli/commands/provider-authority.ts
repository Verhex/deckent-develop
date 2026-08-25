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
  getGovernanceMessage,
  governancePrerequisiteHelp,
} from '../helpers/message-catalog/cli-governance.js';

import { loadConfig } from '../../core/config.js';
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
import { InvocationReceiptStore } from '../../core/invocation-receipt-store.js';
import type {
  InvocationAuthMode,
  InvocationExecutionBackend,
  InvocationTransport,
} from '../../core/invocation-receipt.js';
import type {
  ProviderEvidenceSourceResolver,
  ProviderEvidenceSourceScope,
} from '../../core/provider-evidence-producer.js';
import {
  prepareProviderLimitsAuthorityWrite,
  proposeProviderLimitsAuthoring,
  writeProviderLimitsAuthority,
} from '../../core/provider-limit-authoring.js';
import { createLocalProviderEvidenceSourceResolver } from '../../providers/provider-authority-runtime-bootstrap.js';
import { createLazyDockerReachabilityTransportResolver } from '../provider-authority-process-runtime.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { promptConfirm } from '../helpers/prompt.js';

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

// ─── `deckent provider-authority limits init` — authored provider policy ────
//
// Until this sub-flow existed the `provider_limits` parent block could not be
// authored at all: its selector demands a pseudonymous account hash and a quota
// scope hash that only live account authority produces, so every run held
// `xverify_provider_scope_unavailable` with no operator path forward. This
// command derives both from the SAME code the consumers use and refuses, typed,
// whenever live truth is unavailable — it never fills a selector with defaults.

export interface ProviderAuthorityLimitsDeps extends ProviderAuthorityKeyringDeps {
  /**
   * Overrides the live host-registered provider evidence sources. Absent means
   * the host's own runtime registrations are read (see
   * {@link createLocalProviderEvidenceSourceResolver}); a scope no source
   * answers for is a typed refusal, never a fallback to fabricated selector
   * values.
   */
  sourceResolver?: ProviderEvidenceSourceResolver;
  /** Hermetic seams for the production effective-config Docker composition. */
  loadConfigFn?: typeof loadConfig;
  dockerReachabilityTransportResolverFactory?:
    typeof createLazyDockerReachabilityTransportResolver;
  /** Hermetic seam: the global config path the authored block is written to. */
  configPathOverride?: string;
  /** Owner-confirmation seam; defaults to the interactive prompt. */
  confirmFn?: (question: string) => Promise<boolean>;
  /** Canonical project identity seam; defaults to the invocation receipt ledger. */
  projectIdFn?: () => string;
}

export interface ProviderAuthorityLimitsInitOptions {
  provider?: string;
  model?: string;
  authMode?: string;
  transport?: string;
  executionBackend?: string;
  executionProfileRef?: string;
  endpointRefHash?: string;
  tenant?: string;
  warnAtRatio?: string;
  blockAtRatio?: string;
  ratioEnforcement?: string;
}

function isRatio(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * A resolver that throws on a scope it cannot even parse is answering "no
 * source here" — the same typed refusal an unregistered scope gets, never a
 * stack trace at the operator.
 */
function hasLiveSourceForScope(
  resolver: ProviderEvidenceSourceResolver,
  scope: ProviderEvidenceSourceScope,
): boolean {
  try {
    return resolver.resolve(scope) !== null;
  } catch {
    return false;
  }
}

function resolveProjectId(scope: ResolvedKeyringScope, deps: ProviderAuthorityLimitsDeps): string {
  if (deps.projectIdFn) return deps.projectIdFn();
  // The receipt ledger mints the one canonical project identity the provider
  // authority composition itself reads; deriving a second one here would author
  // a selector no consumer could match.
  const store = new InvocationReceiptStore(scope.projectRoot);
  try {
    return store.projectId;
  } finally {
    store.close();
  }
}

export async function runLimitsInit(
  opts: ProviderAuthorityLimitsInitOptions,
  deps: ProviderAuthorityLimitsDeps = {},
): Promise<void> {
  const lang = getLanguage(undefined);
  const required = [
    opts.provider,
    opts.model,
    opts.authMode,
    opts.transport,
    opts.executionBackend,
    opts.executionProfileRef,
    opts.warnAtRatio,
    opts.blockAtRatio,
  ];
  if (required.some(value => !value?.trim())) {
    print(getMessage('provider_authority.limits.needs_scope', lang));
    process.exitCode = 1;
    return;
  }
  const warnAtRatio = Number(opts.warnAtRatio);
  const blockAtRatio = Number(opts.blockAtRatio);
  if (!isRatio(warnAtRatio) || !isRatio(blockAtRatio)) {
    print(getMessage('provider_authority.limits.invalid_ratio', lang));
    process.exitCode = 1;
    return;
  }
  const ratioEnforcement = opts.ratioEnforcement?.trim() || 'enforce';
  if (ratioEnforcement !== 'enforce' && ratioEnforcement !== 'observe_only') {
    print(getMessage('provider_authority.limits.invalid_enforcement', lang));
    process.exitCode = 1;
    return;
  }
  const scope = resolveScope(deps);
  const transport = opts.transport as InvocationTransport;
  const executionBackend = opts.executionBackend as InvocationExecutionBackend;
  const authMode = opts.authMode as InvocationAuthMode;
  const provider = opts.provider!;
  // Production injects nothing here, so the host's OWN registered evidence
  // sources — the same registrations the provider-authority runtime opens with —
  // are the one authority to ask. The injected seam still wins when supplied.
  let sourceResolver = deps.sourceResolver;
  if (!sourceResolver) {
    try {
      const config = await (deps.loadConfigFn ?? loadConfig)(scope.projectRoot);
      const dockerReachabilityTransport =
        (deps.dockerReachabilityTransportResolverFactory
          ?? createLazyDockerReachabilityTransportResolver)(scope.projectRoot, config);
      sourceResolver = createLocalProviderEvidenceSourceResolver(scope.projectRoot, {
        env: process.env,
        nodePlatform: process.platform,
        dockerReachabilityTransport,
      });
    } catch {
      print(getMessage('provider_authority.limits.sources_unavailable', lang));
      process.exitCode = 1;
      return;
    }
  }
  // A non-exact scope is the authoring module's typed `scope_not_exact` refusal;
  // asking a source registry about `unknown` would answer a different question.
  const exactScope = authMode !== 'unknown' && executionBackend !== 'unknown';
  if (exactScope && !hasLiveSourceForScope(sourceResolver, {
    provider,
    authMode,
    transport,
    executionBackend,
  })) {
    print(getMessage('provider_authority.limits.sources_unavailable', lang));
    process.exitCode = 1;
    return;
  }
  const read = readKeyringState(deps);
  if (read.state !== 'present') {
    print(read.state === 'absent'
      ? getMessage('provider_authority.keyring.absent', lang)
      : getMessage('provider_authority.keyring.unreadable', lang, {
        code: read.code,
        message: read.message,
      }));
    process.exitCode = 1;
    return;
  }

  const keyring = ProviderAuthorityKeyring.open(openOptions(scope));
  const executionProfileRef = opts.executionProfileRef!;
  const tenantId = opts.tenant?.trim() || 'local';
  const proposal = await proposeProviderLimitsAuthoring({
    tenantId,
    projectId: resolveProjectId(scope, deps),
    provider,
    model: opts.model!,
    authMode,
    backend: {
      transport,
      executionBackend,
      endpointRefHash: opts.endpointRefHash?.trim() || null,
      runtimeFingerprint: null,
      executionProfileRef,
    },
    executionProfile: {
      profileRef: executionProfileRef,
      provider,
      allowed: [{ authMode, transport, executionBackend }],
    },
    values: { ratioEnforcement, warnAtRatio, blockAtRatio },
    sourceResolver,
    keyring,
  });
  if (proposal.state === 'hold') {
    print(getMessage('provider_authority.limits.hold', lang, {
      reasonCode: proposal.reasonCode,
      detail: proposal.detail,
      evidenceRef: proposal.authorityEvidenceRef,
    }));
    process.exitCode = 1;
    return;
  }

  const plan = await prepareProviderLimitsAuthorityWrite({
    proposal,
    configPath: deps.configPathOverride,
  });
  if (plan.state === 'refused') {
    print(getMessage('provider_authority.limits.refused', lang, {
      reasonCode: plan.reasonCode,
      detail: plan.detail,
    }));
    process.exitCode = 1;
    return;
  }

  print(getMessage('provider_authority.limits.preview', lang, {
    provider,
    authMode,
    transport,
    executionBackend,
    tenantId,
    accountRefHash: proposal.accountRefHash ?? 'none (local auth)',
    quotaScopeRefHash: proposal.quotaScopeRefHash,
    windows: proposal.selector.requiredWindowIds.join(', '),
    warnAtRatio: String(warnAtRatio),
    blockAtRatio: String(blockAtRatio),
    ratioEnforcement,
    action: plan.action,
    expectedAuthorityRef: plan.expectedAuthorityRef ?? 'none',
    authorityRef: plan.authorityRef,
    policyRef: proposal.policyRef,
  }));
  const confirm = deps.confirmFn ?? ((question: string) => promptConfirm(question, false));
  const confirmed = await confirm(getMessage('provider_authority.limits.confirm', lang));
  if (!confirmed) {
    print(getMessage('provider_authority.limits.aborted', lang));
    return;
  }
  const written = await writeProviderLimitsAuthority({
    plan,
    ownerConfirmed: confirmed,
  });
  if (written.state === 'refused') {
    print(getMessage('provider_authority.limits.refused', lang, {
      reasonCode: written.reasonCode,
      detail: written.detail,
    }));
    process.exitCode = 1;
    return;
  }
  print(getMessage('provider_authority.limits.written', lang, {
    action: written.action,
    authorityRef: written.authorityRef,
    configPath: written.configPath,
  }));
}

export function registerProviderAuthorityCommand(
  program: Command,
  deps: ProviderAuthorityLimitsDeps = {},
): void {
  const lang = getLanguage(undefined);
  const group = program
    .command('provider-authority')
    .description(getMessage('provider_authority.cmd_desc', lang));

  const keyring = group
    .command('keyring')
    .description(getMessage('provider_authority.keyring.cmd_desc', lang));

  // Access classification stated in help: `status` reads, `init` and
  // `rotate` are authenticated mutations of durable key material. All three
  // depend on the OS credential store, so each states that prerequisite and
  // the honest-unavailable contract that goes with it.
  keyring
    .command('status')
    .description(getMessage('provider_authority.keyring.status_desc', lang))
    .addHelpText(
      'after',
      `\n${getGovernanceMessage('cli.governance.provider_authority.keyring.status.note', lang)}\n`
      + governancePrerequisiteHelp('os-keyring', lang),
    )
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
    .addHelpText(
      'after',
      `\n${getGovernanceMessage('cli.governance.provider_authority.keyring.init.note', lang)}\n`
      + governancePrerequisiteHelp('os-keyring', lang),
    )
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
    .addHelpText(
      'after',
      `\n${getGovernanceMessage('cli.governance.provider_authority.keyring.rotate.note', lang)}\n`
      + governancePrerequisiteHelp('os-keyring', lang),
    )
    .option('--expect-revision <hash>', getMessage('provider_authority.keyring.opt_expect_revision', lang))
    .action((opts: { expectRevision?: string }) => {
      try {
        runKeyringRotate(opts.expectRevision, deps);
      } catch (err) {
        printError(err instanceof Error ? err : new Error(String(err)));
        process.exitCode = 1;
      }
    });

  const limits = group
    .command('limits')
    .description(getMessage('provider_authority.limits.cmd_desc', lang));

  limits
    .command('init')
    .description(getMessage('provider_authority.limits.init_desc', lang))
    .option('--provider <id>', getMessage('provider_authority.limits.opt_provider', lang))
    .option('--model <apiId>', getMessage('provider_authority.limits.opt_model', lang))
    .option('--auth-mode <mode>', getMessage('provider_authority.limits.opt_auth_mode', lang))
    .option('--transport <transport>', getMessage('provider_authority.limits.opt_transport', lang))
    .option('--execution-backend <backend>', getMessage('provider_authority.limits.opt_execution_backend', lang))
    .option('--execution-profile-ref <ref>', getMessage('provider_authority.limits.opt_execution_profile_ref', lang))
    .option('--endpoint-ref-hash <hash>', getMessage('provider_authority.limits.opt_endpoint_ref_hash', lang))
    .option('--tenant <id>', getMessage('provider_authority.limits.opt_tenant', lang))
    .option('--warn-at-ratio <ratio>', getMessage('provider_authority.limits.opt_warn_at_ratio', lang))
    .option('--block-at-ratio <ratio>', getMessage('provider_authority.limits.opt_block_at_ratio', lang))
    .option('--ratio-enforcement <mode>', getMessage('provider_authority.limits.opt_ratio_enforcement', lang))
    .action(async (opts: ProviderAuthorityLimitsInitOptions) => {
      try {
        await runLimitsInit(opts, deps);
      } catch (err) {
        printError(err instanceof Error ? err : new Error(String(err)));
        process.exitCode = 1;
      }
    });
}
