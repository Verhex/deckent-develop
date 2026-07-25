import type { ResolvedConfig } from '../core/config-types.js';
import {
  ProviderAuthorityRuntimeService,
  type ProviderAuthorityRuntimeServiceOpenResult,
} from '../core/provider-authority-composition.js';
import type { GlobalScopeEnv } from '../core/global-scope-resolver.js';
import { createClaudeHostSubscriptionEvidenceSourceRegistrations } from './claude-provider-evidence-sources.js';

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
 * Local CLI composition root. It consumes only the separately authored
 * provider-limit envelope; merged `provider_limits` is intentionally ignored.
 * Source construction is lazy/provider-free and exact to Claude subscription
 * CLI on host-subprocess.
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
    sourceRegistrations: createClaudeHostSubscriptionEvidenceSourceRegistrations({
      projectRoot,
      env: options.env as NodeJS.ProcessEnv | undefined,
      platform: options.nodePlatform as NodeJS.Platform | undefined,
    }),
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
