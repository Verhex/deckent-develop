import { describe, expect, it, vi } from 'vitest';

import {
  createCapabilityCatalog,
  materializeReachability,
  probeExactModelReachability,
  toReachabilityEvidence,
  withLiveProof,
  type ReachabilityProbeRequest,
} from '../../src/core/provider-truth.js';

const T0 = new Date('2026-07-20T12:00:00.000Z');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

function request(overrides: Partial<ReachabilityProbeRequest> = {}): ReachabilityProbeRequest {
  const tenantId = overrides.tenantId ?? 'tenant-a';
  const projectId = overrides.projectId ?? 'project-a';
  const provider = overrides.provider ?? 'openrouter';
  const model = overrides.model ?? 'anthropic/claude-fable-5';
  const auth = overrides.auth ?? { mode: 'api' as const, accountRefHash: HASH_A };
  const backend = overrides.backend ?? {
    transport: 'api' as const,
    executionBackend: 'api' as const,
    endpointRefHash: HASH_B,
    runtimeFingerprint: HASH_C,
    executionProfileRef: 'execution-profile:00000001',
  };
  const executionProfile = overrides.executionProfile ?? {
    profileRef: 'execution-profile:00000001',
    provider,
    allowed: [
      { authMode: 'api' as const, transport: 'api' as const, executionBackend: 'api' as const },
      { authMode: 'api' as const, transport: 'http' as const, executionBackend: 'in-process' as const },
      { authMode: 'api' as const, transport: 'http' as const, executionBackend: 'docker' as const },
    ],
  };
  const admission = overrides.admission ?? {
    decision: 'allow' as const,
    tenantId,
    projectId,
    provider,
    model,
    auth,
    backend,
    approvalRef: 'approval:00000001',
    approvalGrantedAt: '2026-07-20T11:59:00.000Z',
    approvalExpiresAt: '2026-07-20T12:05:00.000Z',
    limits: {
      state: 'known' as const,
      decision: 'allow' as const,
      evidenceRefs: ['limit:00000001'],
      fetchedAt: '2026-07-20T11:59:00.000Z',
      expiresAt: '2026-07-20T12:05:00.000Z',
    },
    budget: {
      evidenceRef: 'budget:00000001',
      maxInputTokens: 128,
      maxOutputTokens: 128,
      maxTotalTokens: 256,
      maxUsd: 0.01,
    },
  };
  return {
    idempotencyKey: 'tenant-a:project-a:openrouter:model:1',
    tenantId,
    projectId,
    provider,
    model,
    auth,
    backend,
    probeKind: 'model-invocation',
    capability: 'inference',
    admission,
    executionProfile,
    ttlMs: 60_000,
    ...overrides,
  };
}

describe('provider truth contract', () => {
  it('keeps catalog, binary and enabled evidence separate from live proof', async () => {
    const catalog = createCapabilityCatalog({
      catalogId: 'catalog-1',
      idempotencyKey: 'catalog-key-1',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      source: {
        sourceId: 'openrouter-model-list:hash',
        kind: 'remote-catalog',
        fetchedAt: T0.toISOString(),
        expiresAt: new Date(T0.getTime() + 60_000).toISOString(),
      },
      entries: [{
        provider: 'openrouter',
        model: 'anthropic/claude-fable-5',
        stages: {
          'code-present': { state: 'known', evidenceRef: 'adapter:openrouter' },
          wired: { state: 'known', evidenceRef: 'wire:http0000' },
          enabled: { state: 'known', evidenceRef: 'auth:key-present' },
        },
        capabilities: {
          streaming: { value: true, state: 'known', evidenceRef: 'catalog:model-list' },
        },
      }],
    });

    expect(catalog.entries[0]?.liveProofs).toEqual([]);

    const probe = vi.fn().mockResolvedValue({
      outcome: 'succeeded',
      calledProvider: 'openrouter',
      calledModel: 'anthropic/claude-fable-5',
      providerRequestRefHash: null,
      latencyMs: 12,
    });
    const catalogOnly = await probeExactModelReachability(
      request({ probeKind: 'catalog-list' }),
      { probe, now: () => T0, idFactory: () => 'reach-catalog' },
    );
    expect(catalogOnly).toMatchObject({
      state: 'unknown', reachable: false, liveProven: false, reasonCode: 'probe_not_live',
    });
    expect(withLiveProof(catalog, catalogOnly, T0)).toStrictEqual(catalog);
  });

  it('admits only a successful exact provider and exact API model invocation', async () => {
    const exact = await probeExactModelReachability(request(), {
      probe: async () => ({
        outcome: 'succeeded',
        calledProvider: 'openrouter',
        calledModel: 'anthropic/claude-fable-5',
        providerRequestRefHash: HASH_D,
        latencyMs: 20,
      }),
      now: () => T0,
      idFactory: () => 'reach-exact',
    });
    expect(exact).toMatchObject({ state: 'known', reachable: true, liveProven: true, reasonCode: 'none' });
    expect(toReachabilityEvidence(exact, T0)).toEqual({
      state: 'known', reachable: true, evidenceRef: 'provider-reachability:reach-exact',
    });

    const modelMismatch = await probeExactModelReachability(request(), {
      probe: async () => ({
        outcome: 'succeeded', calledProvider: 'openrouter', calledModel: 'openai/gpt-5.6-sol',
        providerRequestRefHash: null, latencyMs: 10,
      }),
      now: () => T0,
      idFactory: () => 'reach-model-mismatch',
    });
    expect(modelMismatch).toMatchObject({
      state: 'unavailable', reachable: false, liveProven: false, reasonCode: 'model_mismatch',
    });

    const providerMismatch = await probeExactModelReachability(request(), {
      probe: async () => ({
        outcome: 'succeeded', calledProvider: 'claude', calledModel: 'anthropic/claude-fable-5',
        providerRequestRefHash: null, latencyMs: 10,
      }),
      now: () => T0,
      idFactory: () => 'reach-provider-mismatch',
    });
    expect(providerMismatch.reasonCode).toBe('provider_mismatch');
  });

  it.each([
    ['auth-rejected', 'auth_rejected'],
    ['model-not-found', 'model_not_found'],
    ['rate-limited', 'rate_limited'],
    ['timeout', 'timeout'],
    ['backend-unreachable', 'backend_unreachable'],
  ] as const)('maps %s to fail-closed unavailable evidence', async (outcome, reasonCode) => {
    const result = await probeExactModelReachability(request(), {
      probe: async () => ({
        outcome, calledProvider: null, calledModel: null,
        providerRequestRefHash: null, latencyMs: null,
      }),
      now: () => T0,
      idFactory: () => `reach-${outcome}`,
    });
    expect(result).toMatchObject({ state: 'unavailable', reachable: false, liveProven: false, reasonCode });
  });

  it('sanitizes a thrown probe into transport-error evidence', async () => {
    const result = await probeExactModelReachability(request(), {
      probe: async () => { throw new Error('secret provider body'); },
      now: () => T0,
      idFactory: () => 'reach-thrown',
    });
    expect(result).toMatchObject({
      state: 'unavailable', reachable: false, liveProven: false,
      outcome: 'transport-error', reasonCode: 'transport_error',
    });
    expect(JSON.stringify(result)).not.toContain('secret provider body');
  });

  it('does not call a live probe without a scoped allow decision and complete budget evidence', async () => {
    const base = request();
    const cases: Array<[ReachabilityProbeRequest, string]> = [
      [{ ...base, admission: {
        ...base.admission,
        budget: { ...base.admission.budget, evidenceRef: null },
      } }, 'budget_required'],
      [{ ...base, admission: {
        ...base.admission,
        approvalRef: null, approvalGrantedAt: null, approvalExpiresAt: null,
      } }, 'approval_required'],
      [{ ...base, admission: {
        ...base.admission,
        limits: { state: 'unknown', decision: 'hold', evidenceRefs: [], fetchedAt: null, expiresAt: null },
      } }, 'limit_hold'],
      [{ ...base, executionProfile: {
        ...base.executionProfile,
        allowed: [{ authMode: 'api', transport: 'http', executionBackend: 'host-subprocess' }],
      } }, 'backend_unreachable'],
      [{ ...base, admission: {
        ...base.admission,
        provider: 'claude',
      } }, 'approval_required'],
    ];
    for (const [candidate, reasonCode] of cases) {
      const probe = vi.fn();
      const result = await probeExactModelReachability(candidate, {
        probe, now: () => T0, idFactory: () => `reach-${reasonCode}`,
      });
      expect(probe).not.toHaveBeenCalled();
      expect(result).toMatchObject({ state: 'unknown', reachable: false, reasonCode });
    }
  });

  it('requires capability-specific proof beyond a normal inference success', async () => {
    const unverified = await probeExactModelReachability(request({ capability: 'tools' }), {
      probe: async () => ({
        outcome: 'succeeded', calledProvider: 'openrouter', calledModel: 'anthropic/claude-fable-5',
        providerRequestRefHash: null, latencyMs: 4,
      }),
      now: () => T0,
    });
    expect(unverified).toMatchObject({ state: 'unavailable', reasonCode: 'invalid_response' });

    const verified = await probeExactModelReachability(request({ capability: 'tools' }), {
      probe: async () => ({
        outcome: 'succeeded', calledProvider: 'openrouter', calledModel: 'anthropic/claude-fable-5',
        providerRequestRefHash: null, latencyMs: 4, verifiedCapability: 'tools',
      }),
      now: () => T0,
    });
    expect(verified).toMatchObject({ state: 'known', reachable: true, liveProven: true });
  });

  it('never lets reachability TTL outlive approval or limit evidence', async () => {
    const result = await probeExactModelReachability(request({ ttlMs: 600_000 }), {
      probe: async () => ({
        outcome: 'succeeded', calledProvider: 'openrouter', calledModel: 'anthropic/claude-fable-5',
        providerRequestRefHash: null, latencyMs: 4,
      }),
      now: () => T0,
    });
    expect(result.probe.expiresAt).toBe('2026-07-20T12:05:00.000Z');
  });

  it('expires evidence to stale and never carries a live proof across scope', async () => {
    const result = await probeExactModelReachability(request(), {
      probe: async () => ({
        outcome: 'succeeded', calledProvider: 'openrouter', calledModel: 'anthropic/claude-fable-5',
        providerRequestRefHash: null, latencyMs: 2,
      }),
      now: () => T0,
      idFactory: () => 'reach-expiring',
    });
    const expiredAt = new Date(T0.getTime() + 60_000);
    expect(materializeReachability(result, expiredAt)).toMatchObject({
      state: 'stale', reachable: false, liveProven: false,
    });
    expect(toReachabilityEvidence(result, expiredAt).state).toBe('stale');

    const otherTenantCatalog = createCapabilityCatalog({
      catalogId: 'catalog-other', idempotencyKey: 'catalog-other', tenantId: 'tenant-b', projectId: 'project-a',
      source: { sourceId: 'builtin', kind: 'builtin', fetchedAt: T0.toISOString(), expiresAt: null },
      entries: [{ provider: result.provider, model: result.model, capabilities: {} }],
    });
    expect(withLiveProof(otherTenantCatalog, result, T0)).toStrictEqual(otherTenantCatalog);
  });

  it('rejects removed aliases and preserves backend/auth dimensions in the probe request', async () => {
    await expect(probeExactModelReachability(request({ model: 'gpt-5' }), {
      probe: async () => ({
        outcome: 'not-run', calledProvider: null, calledModel: null,
        providerRequestRefHash: null, latencyMs: null,
      }),
    })).rejects.toThrow(/Legacy model alias/);

    const probe = vi.fn().mockResolvedValue({
      outcome: 'not-run', calledProvider: null, calledModel: null,
      providerRequestRefHash: null, latencyMs: null,
    });
    await probeExactModelReachability(request({
      model: 'openai/gpt-5.6-sol',
      backend: {
        transport: 'http', executionBackend: 'docker',
        endpointRefHash: HASH_B, runtimeFingerprint: HASH_C,
        executionProfileRef: 'execution-profile:00000001',
      },
    }), { probe, now: () => T0 });
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openrouter', model: 'openai/gpt-5.6-sol',
      auth: { mode: 'api', accountRefHash: HASH_A },
      backend: expect.objectContaining({ transport: 'http', executionBackend: 'docker' }),
    }));
  });
});
