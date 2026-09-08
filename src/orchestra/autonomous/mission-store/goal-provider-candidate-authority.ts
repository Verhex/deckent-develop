import type { HostRoleInvocationCandidateAuthority } from '../../../core/host-role-invocation-admission-runtime.js';
import type { ProviderLimitPolicySelectorConfig } from '../../../core/config-types.js';

export type GoalProviderCandidateAuthorityResult =
  | { readonly state: 'ready'; readonly candidate: HostRoleInvocationCandidateAuthority }
  | { readonly state: 'hold'; readonly reasonCode: 'goal_execution_profile_authority_unavailable' };

/**
 * Projects an authored provider-limit selector into the exact two-store query
 * authority required by HostRoleInvocationAdmissionRuntime. Legacy selectors
 * remain usable by their historical consumers, but cannot authorize a new goal
 * provider effect without an executable identity and profile binding.
 */
export function projectGoalProviderCandidateAuthority(input: {
  readonly selector: Readonly<ProviderLimitPolicySelectorConfig>;
  readonly projectId: string;
  readonly model: string;
}): GoalProviderCandidateAuthorityResult {
  const { selector } = input;
  const runtimeFingerprint = selector.backend.runtimeFingerprint;
  const executionProfileRef = selector.backend.executionProfileRef;
  if (runtimeFingerprint === undefined || executionProfileRef === undefined) {
    return { state: 'hold', reasonCode: 'goal_execution_profile_authority_unavailable' };
  }
  return {
    state: 'ready',
    candidate: {
      provider: selector.provider,
      model: input.model,
      reachabilityQuery: {
        tenantId: selector.tenantId,
        projectId: input.projectId,
        provider: selector.provider,
        model: input.model,
        authMode: selector.authMode,
        accountRefHash: selector.accountRefHash,
        transport: selector.backend.transport,
        executionBackend: selector.backend.executionBackend,
        endpointRefHash: selector.backend.endpointRefHash,
        runtimeFingerprint,
        executionProfileRef,
        capability: 'inference',
      },
      limitQuery: {
        tenantId: selector.tenantId,
        provider: selector.provider,
        accountRefHash: selector.accountRefHash,
        quotaScopeRefHash: selector.quotaScopeRefHash,
        authMode: selector.authMode,
      },
    },
  };
}
