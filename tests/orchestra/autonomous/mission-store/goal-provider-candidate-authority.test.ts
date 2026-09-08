import { describe, expect, it } from 'vitest';
import { projectGoalProviderCandidateAuthority } from '../../../../src/orchestra/autonomous/mission-store/goal-provider-candidate-authority.js';
import type { ProviderLimitPolicySelectorConfig } from '../../../../src/core/config-types.js';

const selector: ProviderLimitPolicySelectorConfig = {
  tenantId: 'tenant-a', provider: 'claude', accountRefHash: 'a'.repeat(64),
  quotaScopeRefHash: 'b'.repeat(64), authMode: 'subscription',
  backend: { transport: 'cli', executionBackend: 'host-subprocess', endpointRefHash: null,
    runtimeFingerprint: 'c'.repeat(64), executionProfileRef: 'profile:claude-host-0001' },
  requiredWindowIds: ['tokens'], sourceScopes: [{ sourceKind: 'cli-status', authority: 'authoritative',
    transport: 'cli', executionBackend: 'host-subprocess', endpointRefHash: null }],
};

describe('projectGoalProviderCandidateAuthority', () => {
  it('binds both stores to the same exact executable profile', () => {
    const result = projectGoalProviderCandidateAuthority({ selector, projectId: 'project-a', model: 'claude-fable-5' });
    expect(result).toMatchObject({ state: 'ready', candidate: { reachabilityQuery: {
      runtimeFingerprint: 'c'.repeat(64), executionProfileRef: 'profile:claude-host-0001',
    }, limitQuery: { quotaScopeRefHash: 'b'.repeat(64) } } });
  });

  it('holds legacy selectors without executable authority', () => {
    const legacy = { ...selector, backend: { transport: 'cli' as const,
      executionBackend: 'host-subprocess' as const, endpointRefHash: null } };
    expect(projectGoalProviderCandidateAuthority({ selector: legacy, projectId: 'project-a', model: 'claude-fable-5' }))
      .toEqual({ state: 'hold', reasonCode: 'goal_execution_profile_authority_unavailable' });
  });
});
