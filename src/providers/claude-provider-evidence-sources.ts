import {
  ProviderEvidenceSourceRegistry,
  type ProviderEvidenceSourceRegistration,
} from '../core/provider-evidence-source-registry.js';
import type { BoundedReachabilityProbeTransport } from '../core/provider-evidence-probe-contract.js';
import { probeSubscriptionLimits } from '../core/limit-preflight.js';
import { ClaudeAccountIdentityAuthority } from './claude-account-evidence.js';
import { ClaudeReachabilityEvidenceSource } from './claude-reachability-evidence.js';
import { ClaudeSubscriptionLimitEvidenceSource } from './claude-subscription-limit-evidence.js';
import { DockerBoundedReachabilityEvidenceSource } from './docker-bounded-reachability-evidence.js';

export interface ClaudeHostSubscriptionEvidenceRegistryOptions {
  readonly projectRoot: string;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  /** Additional config-defined credential keys. Canonical built-ins are always scrubbed. */
  readonly additionalCredentialKeys?: readonly string[];
  /** Lazy canonical Docker transport; absence keeps the Docker slot typed unsupported. */
  readonly dockerReachabilityTransport?: () => BoundedReachabilityProbeTransport | null;
}

/**
 * Canonical registrations for Claude subscription CLI execution on the host
 * and in Docker. Construction is provider-free; the producer functions remain
 * lazy and account/limit authority is shared across both backend scopes.
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
  const hostReachabilitySource = new ClaudeReachabilityEvidenceSource({
    projectRoot: options.projectRoot,
    ...common,
  });
  const dockerReachabilitySource = new DockerBoundedReachabilityEvidenceSource(
    'claude',
    options.dockerReachabilityTransport ?? (() => null),
  );
  const account = {
    authorityRef: accountAuthority.authorityRef,
    resolve: input => accountAuthority.resolve(input),
  } satisfies ProviderEvidenceSourceRegistration['sources']['account'];
  const limit = {
    authorityRef: limitSource.authorityRef,
    kind: limitSource.kind,
    authority: limitSource.authority,
    observe: input => limitSource.observe(input),
  } satisfies ProviderEvidenceSourceRegistration['sources']['limit'];

  return Object.freeze((['host-subprocess', 'docker'] as const).map(executionBackend => {
    const reachabilitySource = executionBackend === 'host-subprocess'
      ? hostReachabilitySource
      : dockerReachabilitySource;
    return {
      provider: 'claude',
      authMode: 'subscription',
      transport: 'cli',
      executionBackend,
      sources: {
        account,
        limit,
        reachability: {
          authorityRef: reachabilitySource.authorityRef,
          probe: input => reachabilitySource.probe(input),
        },
      },
    } satisfies ProviderEvidenceSourceRegistration;
  }));
}

/**
 * Canonical concrete source registry for the exact Claude subscription CLI
 * host and Docker scopes. Registration never promotes one backend's
 * reachability observation into the other backend.
 */
export function createClaudeHostSubscriptionEvidenceSourceRegistry(
  options: ClaudeHostSubscriptionEvidenceRegistryOptions,
): ProviderEvidenceSourceRegistry {
  return new ProviderEvidenceSourceRegistry(
    createClaudeHostSubscriptionEvidenceSourceRegistrations(options),
  );
}
