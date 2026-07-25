import {
  ProviderEvidenceSourceRegistry,
  type ProviderEvidenceSourceRegistration,
} from '../core/provider-evidence-source-registry.js';
import { probeSubscriptionLimits } from '../core/limit-preflight.js';
import { ClaudeAccountIdentityAuthority } from './claude-account-evidence.js';
import { ClaudeReachabilityEvidenceSource } from './claude-reachability-evidence.js';
import { ClaudeSubscriptionLimitEvidenceSource } from './claude-subscription-limit-evidence.js';

export interface ClaudeHostSubscriptionEvidenceRegistryOptions {
  readonly projectRoot: string;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  /** Additional config-defined credential keys. Canonical built-ins are always scrubbed. */
  readonly additionalCredentialKeys?: readonly string[];
}

/**
 * Canonical registrations for the one currently proven Claude subscription
 * scope. Construction is provider-free; the producer functions remain lazy.
 */
export function createClaudeHostSubscriptionEvidenceSourceRegistrations(
  options: ClaudeHostSubscriptionEvidenceRegistryOptions,
): readonly ProviderEvidenceSourceRegistration[] {
  const common = {
    platform: options.platform,
    env: options.env,
    additionalCredentialKeys: options.additionalCredentialKeys,
  };
  const accountAuthority = new ClaudeAccountIdentityAuthority(common);
  const limitSource = new ClaudeSubscriptionLimitEvidenceSource({
    probe: () => probeSubscriptionLimits(common),
  });
  const reachabilitySource = new ClaudeReachabilityEvidenceSource({
    projectRoot: options.projectRoot,
    ...common,
  });
  return Object.freeze([{
    provider: 'claude',
    authMode: 'subscription',
    transport: 'cli',
    executionBackend: 'host-subprocess',
    sources: {
      account: {
        authorityRef: accountAuthority.authorityRef,
        resolve: input => accountAuthority.resolve(input),
      },
      limit: {
        authorityRef: limitSource.authorityRef,
        kind: limitSource.kind,
        authority: limitSource.authority,
        observe: input => limitSource.observe(input),
      },
      reachability: {
        authorityRef: reachabilitySource.authorityRef,
        probe: input => reachabilitySource.probe(input),
      },
    },
  } satisfies ProviderEvidenceSourceRegistration]);
}

/**
 * Canonical concrete source registry for the one currently proven Claude
 * subscription scope. Host account evidence is intentionally not projected
 * onto Docker, tmux, API or hybrid backends.
 */
export function createClaudeHostSubscriptionEvidenceSourceRegistry(
  options: ClaudeHostSubscriptionEvidenceRegistryOptions,
): ProviderEvidenceSourceRegistry {
  return new ProviderEvidenceSourceRegistry(
    createClaudeHostSubscriptionEvidenceSourceRegistrations(options),
  );
}
