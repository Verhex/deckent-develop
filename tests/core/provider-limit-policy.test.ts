import { describe, expect, it } from 'vitest';

import { ConfigValidationError, mergeConfigs } from '../../src/core/config.js';
import type {
  ProviderLimitPolicySelectorConfig,
  ProviderLimitsConfig,
} from '../../src/core/config-types.js';
import {
  assertProviderLimitPolicyLayerPrecedence,
  assertProviderLimitsConfig,
  createProviderLimitPolicyAuthoritySnapshot,
  createProviderLimitPolicyRuntimeResolver,
  projectExactProviderLimitAuthoritySelector,
  resolveProviderLimitPolicy,
} from '../../src/core/provider-limit-policy.js';

const ACCOUNT_HASH = 'a'.repeat(64);
const QUOTA_HASH = 'b'.repeat(64);
const ENDPOINT_HASH = 'c'.repeat(64);

function selector(
  overrides: Partial<ProviderLimitPolicySelectorConfig> = {},
): ProviderLimitPolicySelectorConfig {
  return {
    tenantId: 'tenant-a',
    provider: 'claude',
    accountRefHash: ACCOUNT_HASH,
    quotaScopeRefHash: QUOTA_HASH,
    authMode: 'subscription',
    backend: {
      transport: 'cli',
      executionBackend: 'host-subprocess',
      endpointRefHash: ENDPOINT_HASH,
    },
    requiredWindowIds: ['session', 'week-all'],
    sourceScopes: [
      {
        sourceKind: 'provider-cli',
        authority: 'authoritative',
        transport: 'cli',
        executionBackend: 'host-subprocess',
        endpointRefHash: ENDPOINT_HASH,
      },
      {
        sourceKind: 'provider-api',
        authority: 'advisory',
        transport: 'http',
        executionBackend: 'in-process',
        endpointRefHash: ENDPOINT_HASH,
      },
    ],
    ...overrides,
  };
}

function parentConfig(
  selected = selector(),
): ProviderLimitsConfig {
  return {
    schemaVersion: 1,
    authorityRef: 'provider-limit-authority:global-0001',
    policies: [{
      selector: selected,
      values: {
        warnAtRatio: 0.7,
        blockAtRatio: 0.9,
        minimumRemaining: { tokens: 100, requests: 2 },
      },
    }],
  };
}

function projectConfig(
  values: ProviderLimitsConfig['policies'][number]['values'],
  selected = selector(),
): ProviderLimitsConfig {
  return {
    schemaVersion: 1,
    authorityRef: 'provider-limit-project:project-0001',
    policies: [{ selector: selected, values }],
  };
}

describe('provider-limit policy authority', () => {
  it('projects exactly one authored runtime/backend selector and rejects ambiguity', () => {
    const exact = selector({
      backend: {
        transport: 'cli',
        executionBackend: 'docker',
        endpointRefHash: ENDPOINT_HASH,
      },
    });
    const authority = createProviderLimitPolicyAuthoritySnapshot({
      parent: parentConfig(exact),
      project: null,
    });
    const query = {
      tenantId: 'tenant-a',
      provider: 'claude',
      authMode: 'subscription' as const,
      transport: 'cli' as const,
      executionBackend: 'docker' as const,
      endpointRefHash: ENDPOINT_HASH,
    };
    const ready = projectExactProviderLimitAuthoritySelector(authority, query);
    expect(ready.state).toBe('ready');
    if (ready.state === 'ready') {
      expect(ready.selector).toMatchObject({
        tenantId: exact.tenantId,
        provider: exact.provider,
        authMode: exact.authMode,
        backend: exact.backend,
        accountRefHash: exact.accountRefHash,
        quotaScopeRefHash: exact.quotaScopeRefHash,
      });
      expect(Object.isFrozen(ready.selector)).toBe(true);
    }

    const second = selector({
      quotaScopeRefHash: 'd'.repeat(64),
      backend: exact.backend,
      requiredWindowIds: ['other-window'],
    });
    const ambiguous = createProviderLimitPolicyAuthoritySnapshot({
      parent: {
        ...parentConfig(exact),
        policies: [
          parentConfig(exact).policies[0]!,
          parentConfig(second).policies[0]!,
        ],
      },
      project: null,
    });
    expect(projectExactProviderLimitAuthoritySelector(ambiguous, query)).toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_provider_scope_ambiguous',
    });
    expect(projectExactProviderLimitAuthoritySelector(authority, {
      ...query,
      endpointRefHash: 'e'.repeat(64),
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_provider_scope_unavailable',
    });
  });

  it('accepts an exact remote API selector without collapsing it into HTTP/in-process', () => {
    const apiSelector = selector({
      provider: 'openrouter',
      authMode: 'api',
      backend: {
        transport: 'api',
        executionBackend: 'api',
        endpointRefHash: ENDPOINT_HASH,
      },
      sourceScopes: [{
        sourceKind: 'provider-api',
        authority: 'authoritative',
        transport: 'api',
        executionBackend: 'api',
        endpointRefHash: ENDPOINT_HASH,
      }],
    });
    const result = resolveProviderLimitPolicy({
      selector: apiSelector,
      parent: { scope: 'global', config: parentConfig(apiSelector) },
    });

    expect(result.state).toBe('ready');
    expect(resolveProviderLimitPolicy({
      selector: {
        ...apiSelector,
        backend: {
          transport: 'http',
          executionBackend: 'in-process',
          endpointRefHash: ENDPOINT_HASH,
        },
      },
      parent: { scope: 'global', config: parentConfig(apiSelector) },
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'policy_selector_unavailable',
    });
  });

  it('resolves a parent policy with digest-derived provenance and no numeric defaults', () => {
    const parent = parentConfig();
    const result = resolveProviderLimitPolicy({
      selector: selector(),
      parent: { scope: 'global', config: parent },
    });

    expect(result).toMatchObject({
      state: 'ready',
      parentAuthorityRef: parent.authorityRef,
      projectAuthorityRef: null,
      policy: {
        warnAtRatio: 0.7,
        blockAtRatio: 0.9,
        minimumRemaining: { tokens: 100, requests: 2 },
      },
    });
    expect(result.state === 'ready' && result.policy.policyRef)
      .toMatch(/^provider-limit-policy:[a-f0-9]{64}$/u);
  });

  it('allows project tightening while inheriting every omitted parent value', () => {
    const project = projectConfig({
      warnAtRatio: 0.6,
      blockAtRatio: 0.8,
      minimumRemaining: { tokens: 150, usd: 1 },
    });
    const result = resolveProviderLimitPolicy({
      selector: selector(),
      parent: { scope: 'tenant', config: parentConfig() },
      project: { scope: 'project', config: project },
    });

    expect(result).toMatchObject({
      state: 'ready',
      projectAuthorityRef: project.authorityRef,
      policy: {
        warnAtRatio: 0.6,
        blockAtRatio: 0.8,
        minimumRemaining: {
          requests: 2,
          tokens: 150,
          usd: 1,
        },
      },
    });
  });

  it.each([
    [{ warnAtRatio: 0.75 }, 'warnAtRatio'],
    [{ blockAtRatio: 0.95 }, 'blockAtRatio'],
    [{ minimumRemaining: { tokens: 99 } }, 'minimumRemaining.tokens'],
    [{ minimumRemaining: { usd: 0 } }, 'minimumRemaining.usd'],
    [{ blockAtRatio: 0.6 }, 'effective warnAtRatio'],
  ])('holds a widening project layer before it becomes policy: %s', (values, detail) => {
    const result = resolveProviderLimitPolicy({
      selector: selector(),
      parent: { scope: 'global', config: parentConfig() },
      project: { scope: 'project', config: projectConfig(values) },
    });

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'project_policy_widens_authority',
    });
    expect(result.state === 'hold' && result.detail).toContain(detail);
  });

  it('holds when parent authority or its exact selector is missing', () => {
    expect(resolveProviderLimitPolicy({
      selector: selector(),
      parent: null,
      project: { scope: 'project', config: projectConfig({ blockAtRatio: 0.8 }) },
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
    });

    expect(resolveProviderLimitPolicy({
      selector: selector({ quotaScopeRefHash: 'd'.repeat(64) }),
      parent: { scope: 'global', config: parentConfig() },
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'policy_selector_unavailable',
    });
  });

  it('derives the same effective ref regardless of authored set ordering', () => {
    const forward = parentConfig();
    const reversed = parentConfig(selector({
      requiredWindowIds: ['week-all', 'session'],
      sourceScopes: [...selector().sourceScopes].reverse(),
    }));
    reversed.policies[0]!.values.minimumRemaining = { requests: 2, tokens: 100 };

    const left = resolveProviderLimitPolicy({
      selector: selector(),
      parent: { scope: 'global', config: forward },
    });
    const right = resolveProviderLimitPolicy({
      selector: selector(),
      parent: { scope: 'global', config: reversed },
    });
    expect(left.state).toBe('ready');
    expect(right.state).toBe('ready');
    expect(left.state === 'ready' && left.policy.policyRef)
      .toBe(right.state === 'ready' ? right.policy.policyRef : null);
  });

  it('rejects duplicate selectors and project selectors without parent authority', () => {
    const duplicate = parentConfig();
    duplicate.policies.push(structuredClone(duplicate.policies[0]!));
    expect(() => assertProviderLimitsConfig(duplicate)).toThrow(/duplicate selector/);

    const mismatched = projectConfig(
      { blockAtRatio: 0.8 },
      selector({ quotaScopeRefHash: 'd'.repeat(64) }),
    );
    expect(() => assertProviderLimitPolicyLayerPrecedence(parentConfig(), mismatched))
      .toThrow(/no matching parent authority/);
  });

  it('enforces project-tighten-only at generic config merge without trusting the merged field', () => {
    const parent = parentConfig();
    const project = projectConfig({ blockAtRatio: 0.8 });
    const resolved = mergeConfigs(
      { provider_limits: parent },
      { provider_limits: project },
    );
    expect(resolved.provider_limits).toEqual(project);
    expect(resolved.provider_limit_authority).toMatchObject({
      schemaVersion: 1,
      parent: {
        scope: 'global',
        config: { authorityRef: parent.authorityRef },
      },
      project: {
        scope: 'project',
        config: { authorityRef: project.authorityRef },
      },
    });
    expect(resolved.provider_limit_authority.authorityRef)
      .toMatch(/^provider-limit-authored-layers:[a-f0-9]{64}$/u);

    expect(() => mergeConfigs(null, { provider_limits: project }))
      .toThrow(ConfigValidationError);
    expect(() => mergeConfigs(
      { provider_limits: parent },
      { provider_limits: projectConfig({ blockAtRatio: 0.95 }) },
    )).toThrow(/widens parent authority/);
  });

  it('normalizes, isolates and deep-freezes separately authored authority layers', () => {
    const parent = parentConfig(selector({
      requiredWindowIds: ['week-all', 'session'],
      sourceScopes: [...selector().sourceScopes].reverse(),
    }));
    const project = projectConfig({
      blockAtRatio: 0.8,
      minimumRemaining: { usd: 1, tokens: 150 },
    });
    const snapshot = createProviderLimitPolicyAuthoritySnapshot({
      parent,
      project,
      parentScope: 'tenant',
    });
    const equivalent = createProviderLimitPolicyAuthoritySnapshot({
      parent: parentConfig(),
      project: projectConfig({
        minimumRemaining: { tokens: 150, usd: 1 },
        blockAtRatio: 0.8,
      }),
      parentScope: 'tenant',
    });

    expect(snapshot).toMatchObject({
      parent: { scope: 'tenant' },
      project: { scope: 'project' },
    });
    expect(snapshot.authorityRef).toBe(equivalent.authorityRef);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.parent?.config.policies[0]?.selector.sourceScopes)).toBe(true);

    parent.policies[0]!.values.blockAtRatio = 1;
    project.policies[0]!.values.minimumRemaining!.tokens = 1;
    expect(snapshot.parent?.config.policies[0]?.values.blockAtRatio).toBe(0.9);
    expect(snapshot.project?.config.policies[0]?.values.minimumRemaining?.tokens).toBe(150);
    expect(() => {
      snapshot.parent!.config.policies[0]!.values.blockAtRatio = 1;
    }).toThrow(TypeError);
  });

  it('pre-resolves exact selectors for the reduced runtime store query', () => {
    const runtime = createProviderLimitPolicyRuntimeResolver({
      parent: { scope: 'global', config: parentConfig() },
      project: {
        scope: 'project',
        config: projectConfig({ blockAtRatio: 0.8, minimumRemaining: { tokens: 150 } }),
      },
    });
    expect(runtime).toMatchObject({
      state: 'ready',
      authorityRef: expect.stringMatching(/^provider-limit-runtime-policy:[a-f0-9]{64}$/u),
    });
    if (runtime.state !== 'ready') throw new Error('expected ready runtime policy');
    expect(runtime.resolve({
      tenantId: 'tenant-a',
      provider: 'claude',
      accountRefHash: ACCOUNT_HASH,
      quotaScopeRefHash: QUOTA_HASH,
      authMode: 'subscription',
    })).toMatchObject({
      blockAtRatio: 0.8,
      minimumRemaining: { requests: 2, tokens: 150 },
    });
    expect(runtime.resolve({
      tenantId: 'tenant-a',
      provider: 'claude',
      accountRefHash: ACCOUNT_HASH,
      quotaScopeRefHash: 'd'.repeat(64),
      authMode: 'subscription',
    })).toBeNull();
  });

  it('holds when distinct full selectors collapse onto one runtime query', () => {
    const alternate = selector({
      backend: {
        transport: 'http',
        executionBackend: 'in-process',
        endpointRefHash: ENDPOINT_HASH,
      },
      requiredWindowIds: ['month'],
      sourceScopes: [{
        sourceKind: 'provider-api',
        authority: 'authoritative',
        transport: 'http',
        executionBackend: 'in-process',
        endpointRefHash: ENDPOINT_HASH,
      }],
    });
    const parent = parentConfig();
    parent.policies.push({
      selector: alternate,
      values: {
        warnAtRatio: 0.6,
        blockAtRatio: 0.85,
        minimumRemaining: { tokens: 200 },
      },
    });
    const runtime = createProviderLimitPolicyRuntimeResolver({
      parent: { scope: 'tenant', config: parent },
    });
    expect(runtime).toMatchObject({
      state: 'hold',
      reasonCode: 'policy_selector_ambiguous',
    });
  });
});
