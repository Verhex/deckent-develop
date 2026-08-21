import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProviderLimitsConfig, ResolvedConfig } from '../../src/core/config-types.js';
import type { BoundedReachabilityProbeRequest } from '../../src/core/provider-evidence-probe-contract.js';
import type { ReachabilityProbeRequest } from '../../src/core/provider-truth.js';
import { createProviderLimitPolicyAuthoritySnapshot } from '../../src/core/provider-limit-policy.js';
import {
  createLocalProviderEvidenceSourceRegistrations,
  createLocalProviderEvidenceSourceResolver,
  hasAuthoredProviderLimitAuthority,
  openLocalProviderAuthorityRuntime,
  openLocalProviderAuthorityRuntimeIfConfigured,
} from '../../src/providers/provider-authority-runtime-bootstrap.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'provider-authority-bootstrap-'));
  roots.push(value);
  return value;
}

function parentPolicy(): ProviderLimitsConfig {
  return {
    schemaVersion: 1,
    authorityRef: 'provider-limit-authority:global-bootstrap-0001',
    policies: [{
      selector: {
        tenantId: 'main',
        provider: 'claude',
        accountRefHash: 'a'.repeat(64),
        quotaScopeRefHash: 'b'.repeat(64),
        authMode: 'subscription',
        backend: {
          transport: 'cli',
          executionBackend: 'host-subprocess',
          endpointRefHash: 'c'.repeat(64),
        },
        requiredWindowIds: ['session'],
        sourceScopes: [{
          sourceKind: 'provider-cli',
          authority: 'authoritative',
          transport: 'cli',
          executionBackend: 'host-subprocess',
          endpointRefHash: 'c'.repeat(64),
        }],
      },
      values: {
        warnAtRatio: 0.7,
        blockAtRatio: 0.9,
        minimumRemaining: { tokens: 100 },
      },
    }],
  };
}

function dockerProbeRequest(provider: 'claude' | 'codex'): ReachabilityProbeRequest {
  const profileRef = `execution-profile:${provider}-docker-0001`;
  return {
    idempotencyKey: `bootstrap-${provider}-docker-0001`,
    tenantId: 'main',
    projectId: 'project-bootstrap',
    provider,
    model: provider === 'claude' ? 'claude-fable-5' : 'gpt-5.6-sol',
    auth: { mode: 'subscription', accountRefHash: 'a'.repeat(64) },
    backend: {
      transport: 'cli', executionBackend: 'docker', endpointRefHash: null,
      runtimeFingerprint: 'f'.repeat(64), executionProfileRef: profileRef,
    },
    probeKind: 'model-invocation',
    capability: 'inference',
    admission: {
      budget: {
        evidenceRef: `execution-budget:${'b'.repeat(64)}`,
        projection: {
          billingMode: 'subscription', maxInputTokens: 100, maxOutputTokens: 20,
          maxTokens: 120, timeoutMs: 4_000,
        },
      },
    },
    executionProfile: {
      profileRef, provider,
      allowed: [{ authMode: 'subscription', transport: 'cli', executionBackend: 'docker' }],
    },
    ttlMs: 60_000,
  };
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('openLocalProviderAuthorityRuntime', () => {
  it('builds one immutable six-slot inventory and shares the lazy Docker resolver', async () => {
    const projectRoot = root();
    const calls: BoundedReachabilityProbeRequest[] = [];
    const dockerReachabilityTransport = vi.fn(() => ({
      invoke: async (request: Readonly<BoundedReachabilityProbeRequest>) => {
        calls.push(request as BoundedReachabilityProbeRequest);
        return { outcome: 'completed' as const, providerRequestRef: null, outputBytes: 1, latencyMs: 2 };
      },
    }));
    const options = { nodePlatform: 'linux', env: {}, dockerReachabilityTransport };
    const registrations = createLocalProviderEvidenceSourceRegistrations(projectRoot, options);
    const resolver = createLocalProviderEvidenceSourceResolver(projectRoot, options);

    expect(registrations.map(({ provider, executionBackend }) => `${provider}:${executionBackend}`))
      .toEqual([
        'claude:host-subprocess', 'claude:docker',
        'codex:host-subprocess', 'codex:docker',
        'cursor:host-subprocess', 'cursor:docker',
      ]);
    expect(dockerReachabilityTransport).not.toHaveBeenCalled();

    for (const provider of ['claude', 'codex'] as const) {
      const selected = resolver.resolve({
        provider, authMode: 'subscription', transport: 'cli', executionBackend: 'docker',
      });
      expect(await selected!.sources.reachability.probe(dockerProbeRequest(provider)))
        .toMatchObject({ outcome: 'succeeded', calledProvider: provider });
    }
    expect(dockerReachabilityTransport).toHaveBeenCalledTimes(2);
    expect(calls.map(({ provider }) => provider)).toEqual(['claude', 'codex']);
  });

  it('keeps rollout disabled without an authored parent or project layer', () => {
    expect(hasAuthoredProviderLimitAuthority({})).toBe(false);
    expect(openLocalProviderAuthorityRuntimeIfConfigured(root(), {})).toBeUndefined();
  });

  it('holds a missing authored parent before key/source/provider work', () => {
    const projectRoot = root();
    const result = openLocalProviderAuthorityRuntime(
      projectRoot,
      {},
      {
        nodePlatform: 'linux',
        env: {
          DECKENT_HOME: join(projectRoot, 'global'),
          HOME: join(projectRoot, 'home'),
        },
      },
    );

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      authorityEvidenceRef: expect.stringMatching(/^provider-authority:[a-f0-9]{64}$/u),
    });
    result.close();
  });

  it('consumes the separate global envelope and then holds missing open-only custody', () => {
    const projectRoot = root();
    const config = {
      provider_limit_authority: createProviderLimitPolicyAuthoritySnapshot({
        parent: parentPolicy(),
        project: null,
      }),
    } satisfies Pick<ResolvedConfig, 'provider_limit_authority'>;
    const result = openLocalProviderAuthorityRuntime(
      projectRoot,
      config,
      {
        nodePlatform: 'linux',
        env: {
          DECKENT_HOME: join(projectRoot, 'global'),
          HOME: join(projectRoot, 'home'),
        },
      },
    );

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRef: expect.stringMatching(/^provider-authority:[a-f0-9]{64}$/u),
    });
    result.close();
  });

  it('enables once an authored layer exists and never falls back after open HOLD', () => {
    const projectRoot = root();
    const config = {
      provider_limit_authority: createProviderLimitPolicyAuthoritySnapshot({
        parent: parentPolicy(),
        project: null,
      }),
    } satisfies Pick<ResolvedConfig, 'provider_limit_authority'>;

    expect(hasAuthoredProviderLimitAuthority(config)).toBe(true);
    const result = openLocalProviderAuthorityRuntimeIfConfigured(
      projectRoot,
      config,
      {
        nodePlatform: 'linux',
        env: {
          DECKENT_HOME: join(projectRoot, 'global'),
          HOME: join(projectRoot, 'home'),
        },
      },
    );
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
    });
    result?.close();
  });
});
