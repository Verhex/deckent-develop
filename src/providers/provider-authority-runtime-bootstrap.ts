import type { ResolvedConfig } from '../core/config-types.js';
import {
  ProviderAuthorityRuntimeService,
  type ProviderAuthorityRuntimeServiceOpenResult,
} from '../core/provider-authority-composition.js';
import type { GlobalScopeEnv } from '../core/global-scope-resolver.js';
import type { ProviderEvidenceSourceResolver } from '../core/provider-evidence-producer.js';
import {
  ProviderEvidenceSourceRegistry,
  type ProviderEvidenceSourceRegistration,
} from '../core/provider-evidence-source-registry.js';
import { createClaudeHostSubscriptionEvidenceSourceRegistrations } from './claude-provider-evidence-sources.js';
import { createCodexHostSubscriptionEvidenceSourceRegistrations } from './codex-provider-evidence-sources.js';

export interface LocalProviderAuthorityRuntimeBootstrapOptions {
  readonly env?: GlobalScopeEnv;
  readonly nodePlatform?: string;
  readonly now?: () => Date;
}

export function hasAuthoredProviderLimitAuthority(
  config: Pick<ResolvedConfig, 'provider_limit_authority'>,
): boolean {
  const envelope = config.provider_limit_authority;
  return (envelope?.parent !== null && envelope?.parent !== undefined)
    || (envelope?.project !== null && envelope?.project !== undefined);
}

/**
 * The one place the local composition root's evidence sources come from.
 *
 * Every registered provider set is exact to its own proven scope (subscription
 * CLI on host-subprocess) and stays lazy/provider-free: registering a set reads
 * no credential, spawns no process and proves nothing by itself. Both the runtime
 * open path below and the source-registration tests consume THIS function, so the
 * registered provider set can never drift from what the runtime actually wires.
 */
export function createLocalProviderEvidenceSourceRegistrations(
  projectRoot: string,
  options: LocalProviderAuthorityRuntimeBootstrapOptions = {},
): readonly ProviderEvidenceSourceRegistration[] {
  const env = options.env as NodeJS.ProcessEnv | undefined;
  const platform = options.nodePlatform as NodeJS.Platform | undefined;
  return Object.freeze([
    ...createClaudeHostSubscriptionEvidenceSourceRegistrations({ projectRoot, env, platform }),
    // Codex sources read only the CLI's durable on-disk state — no project tree,
    // so they take no projectRoot.
    ...createCodexHostSubscriptionEvidenceSourceRegistrations({ env, platform }),
  ]);
}

/**
 * Resolver view over the SAME registrations
 * {@link createLocalProviderEvidenceSourceRegistrations} builds — one registry,
 * not a parallel list.
 *
 * A caller that must ASK "does this host have a live evidence source for this
 * exact scope?" without opening the whole runtime (the `limits init` authoring
 * flow) reads THIS instead of assembling its own registry, so a scope the
 * runtime could never open can never look resolvable to an authoring caller.
 * Construction stays lazy/provider-free: no credential is read and no process
 * is started by resolving.
 */
export function createLocalProviderEvidenceSourceResolver(
  projectRoot: string,
  options: LocalProviderAuthorityRuntimeBootstrapOptions = {},
): ProviderEvidenceSourceResolver {
  return new ProviderEvidenceSourceRegistry(
    createLocalProviderEvidenceSourceRegistrations(projectRoot, options),
  );
}

/**
 * Local CLI composition root. It consumes only the separately authored
 * provider-limit envelope; merged `provider_limits` is intentionally ignored.
 * Source construction is lazy/provider-free and exact to the Claude and Codex
 * subscription CLI scopes on host-subprocess.
 */
export function openLocalProviderAuthorityRuntime(
  projectRoot: string,
  config: Pick<ResolvedConfig, 'provider_limit_authority'>,
  options: LocalProviderAuthorityRuntimeBootstrapOptions = {},
): ProviderAuthorityRuntimeServiceOpenResult {
  const envelope = config.provider_limit_authority;
  const parent = envelope?.parent?.scope === 'global'
    ? { scope: 'global' as const, config: envelope.parent.config }
    : null;
  const project = envelope?.project?.scope === 'project'
    ? { scope: 'project' as const, config: envelope.project.config }
    : null;
  return ProviderAuthorityRuntimeService.open({
    mode: 'solo',
    tenantId: 'local',
    projectRoot,
    env: options.env,
    nodePlatform: options.nodePlatform,
    now: options.now,
    parentPolicy: parent,
    projectPolicy: project,
    sourceRegistrations: createLocalProviderEvidenceSourceRegistrations(projectRoot, options),
  });
}

/**
 * Rollout-safe process composition seam. Merely wiring the runtime must not
 * flip existing execution defaults; an owner-authored parent or project layer
 * is the explicit enablement signal. Once authored, every open failure remains
 * a typed HOLD rather than falling back to the pre-authority path.
 */
export function openLocalProviderAuthorityRuntimeIfConfigured(
  projectRoot: string,
  config: Pick<ResolvedConfig, 'provider_limit_authority'>,
  options: LocalProviderAuthorityRuntimeBootstrapOptions = {},
): ProviderAuthorityRuntimeServiceOpenResult | undefined {
  if (!hasAuthoredProviderLimitAuthority(config)) return undefined;
  return openLocalProviderAuthorityRuntime(projectRoot, config, options);
}
