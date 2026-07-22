import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HostRoleInvocationAdmissionRuntime,
  type HostRoleInvocationAdmissionRequest,
  type HostRoleInvocationCandidateAuthority,
} from '../../src/core/host-role-invocation-admission-runtime.js';
import {
  createProviderLimitResult,
  deriveProviderQuotaScopeRefHash,
  type ProviderLimitObservation,
  type ProviderLimitPolicy,
  type ProviderLimitReservationRequest,
} from '../../src/core/provider-limit-truth.js';
import { ProviderLimitStore } from '../../src/core/provider-limit-store.js';
import {
  probeExactModelReachability,
  type ReachabilityResult,
} from '../../src/core/provider-truth.js';
import {
  ProviderTruthStore,
  type ExactReachabilityQuery,
} from '../../src/core/provider-truth-store.js';
import type { RoleInvocationSelected } from '../../src/core/role-invocation-resolver.js';
import type { InvocationRole } from '../../src/core/invocation-receipt.js';

const roots: string[] = [];
const T0 = new Date('2026-07-20T12:00:00.000Z');
const T1 = new Date('2026-07-20T12:01:00.000Z');
const T2 = '2026-07-20T12:02:00.000Z';
const T5 = '2026-07-20T12:05:00.000Z';
const T10 = '2026-07-20T12:10:00.000Z';
const INTEGRITY_KEY = 'host-role-admission-test-integrity-key-0001';
const POLICY: ProviderLimitPolicy = {
  policyRef: 'limit-policy:host-role-admission-0001',
  warnAtRatio: 0.8,
  blockAtRatio: 0.95,
  minimumRemaining: {},
};

const PROVIDERS = {
  claude: {
    model: 'claude-opus-4-8', accountRefHash: 'a'.repeat(64),
    endpointRefHash: 'b'.repeat(64), runtimeFingerprint: 'c'.repeat(64),
  },
  codex: {
    model: 'gpt-5.5', accountRefHash: 'd'.repeat(64),
    endpointRefHash: 'e'.repeat(64), runtimeFingerprint: 'f'.repeat(64),
  },
} as const;

type ProviderKey = keyof typeof PROVIDERS;

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-host-role-admission-'));
  roots.push(root);
  return root;
}

function backend(provider: ProviderKey) {
  const item = PROVIDERS[provider];
  return {
    transport: 'http' as const,
    executionBackend: 'docker' as const,
    endpointRefHash: item.endpointRefHash,
  };
}

function limitScope(provider: ProviderKey) {
  const item = PROVIDERS[provider];
  const wire = backend(provider);
  return {
    tenantId: 'tenant-a', provider, accountRefHash: item.accountRefHash, authMode: 'api' as const,
    quotaScopeRefHash: deriveProviderQuotaScopeRefHash({
      tenantId: 'tenant-a', provider, accountRefHash: item.accountRefHash,
      authMode: 'api', backend: wire,
    }),
  };
}

function reachabilityQuery(store: ProviderTruthStore, provider: ProviderKey): ExactReachabilityQuery {
  const item = PROVIDERS[provider];
  return {
    tenantId: 'tenant-a', projectId: store.projectId, provider, model: item.model,
    authMode: 'api', accountRefHash: item.accountRefHash,
    ...backend(provider), runtimeFingerprint: item.runtimeFingerprint,
    executionProfileRef: `execution-profile:${provider}-0001`, capability: 'inference',
  };
}

async function reachabilityResult(
  store: ProviderTruthStore,
  provider: ProviderKey,
): Promise<ReachabilityResult> {
  const item = PROVIDERS[provider];
  const query = reachabilityQuery(store, provider);
  const auth = { mode: query.authMode, accountRefHash: query.accountRefHash };
  const reachabilityBackend = {
    transport: query.transport,
    executionBackend: query.executionBackend,
    endpointRefHash: query.endpointRefHash,
    runtimeFingerprint: query.runtimeFingerprint,
    executionProfileRef: query.executionProfileRef,
  };
  return probeExactModelReachability({
    idempotencyKey: `reachability-key-${provider}`,
    tenantId: query.tenantId, projectId: query.projectId, provider, model: item.model,
    auth, backend: reachabilityBackend, probeKind: 'model-invocation', capability: 'inference',
    admission: {
      decision: 'allow', tenantId: query.tenantId, projectId: query.projectId,
      provider, model: item.model, auth, backend: reachabilityBackend,
      approvalRef: `approval:${provider}-0001`,
      approvalGrantedAt: '2026-07-20T11:59:00.000Z', approvalExpiresAt: T10,
      limits: {
        state: 'known', decision: 'allow', evidenceRefs: [`limit:${provider}-0001`],
        fetchedAt: '2026-07-20T11:59:00.000Z', expiresAt: T10,
      },
      budget: {
        evidenceRef: `budget:${provider}-0001`, maxInputTokens: 128,
        maxOutputTokens: 128, maxTotalTokens: 256, maxUsd: 0.01,
      },
    },
    executionProfile: {
      profileRef: query.executionProfileRef, provider,
      allowed: [{ authMode: 'api', transport: 'http', executionBackend: 'docker' }],
    },
    ttlMs: 10 * 60_000,
  }, {
    probe: async () => ({
      outcome: 'succeeded', calledProvider: provider, calledModel: item.model,
      providerRequestRefHash: '9'.repeat(64), latencyMs: 5,
    }),
    now: () => T0,
    idFactory: () => `reach-${provider}`,
  });
}

async function unavailableReachabilityResult(
  store: ProviderTruthStore,
  provider: ProviderKey,
): Promise<ReachabilityResult> {
  const known = await reachabilityResult(store, provider);
  return {
    ...known,
    reachabilityId: `reach-unavailable-${provider}`,
    idempotencyKey: `reachability-unavailable-key-${provider}`,
    state: 'unavailable',
    reachable: false,
    liveProven: false,
    outcome: 'auth-rejected',
    reasonCode: 'auth_rejected',
    observed: {
      ...known.observed,
      calledProvider: null,
      calledModel: null,
      providerRequestRefHash: null,
    },
  };
}

function limitObservation(provider: ProviderKey, remaining = 100): ProviderLimitObservation {
  const item = PROVIDERS[provider];
  return {
    ...limitScope(provider), projectId: 'project-a',
    idempotencyKey: `limit-key-${provider}-${remaining}`,
    backend: backend(provider), state: 'known', requiredWindowIds: ['tokens-all'],
    windows: [{
      windowId: 'tokens-all', kind: 'rate-window', model: item.model, unit: 'tokens',
      consumed: 100 - remaining, remaining, limit: 100,
      reset: { state: 'known', at: T10, displayRefHash: null },
    }],
    source: {
      kind: 'provider-api', authority: 'authoritative', operatorApprovalRef: null,
      evidenceRef: `limit-source:${provider}-0001`, fetchedAt: T0.toISOString(),
      expiresAt: T10, incorporatedReservationEventRefs: [],
    },
  };
}

function candidate(
  truthStore: ProviderTruthStore,
  provider: ProviderKey,
): HostRoleInvocationCandidateAuthority {
  const item = PROVIDERS[provider];
  return {
    provider, model: item.model, reachabilityQuery: reachabilityQuery(truthStore, provider),
    limitQuery: limitScope(provider),
  };
}

function reservation(selected: RoleInvocationSelected): ProviderLimitReservationRequest {
  const provider = selected.provider as ProviderKey;
  return {
    ...limitScope(provider), projectId: 'project-a', backend: backend(provider),
    model: selected.model, reservationId: `reservation-${provider}`,
    idempotencyKey: `reservation-key-${provider}`,
    runId: 'run-a', taskId: 'task-a', callId: 'call-a', attemptId: 'attempt-a',
    fenceTokenHash: '8'.repeat(64), receiptRef: 'invocation-receipt:host-admission-0001',
    reachabilityEvidenceRef: `provider-reachability:reach-${provider}`,
    estimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 10 }],
    estimateEvidenceRefs: ['budget-estimate:host-admission-0001'],
    requestedAt: T1.toISOString(), leaseExpiresAt: T5,
  };
}

function request(
  truthStore: ProviderTruthStore,
  role: InvocationRole = 'brain',
): HostRoleInvocationAdmissionRequest {
  return {
    invocation: {
      role, primaryProvider: 'claude', model: PROVIDERS.claude.model,
      fallbackProviders: ['codex'],
    },
    candidates: {
      claude: candidate(truthStore, 'claude'),
      codex: candidate(truthStore, 'codex'),
    },
    buildReservation: reservation,
  };
}

async function setup(
  remaining: Partial<Record<ProviderKey, number>> = {},
  now: () => Date = () => T1,
): Promise<{
  truthStore: ProviderTruthStore;
  limitStore: ProviderLimitStore;
  runtime: HostRoleInvocationAdmissionRuntime;
}> {
  const root = makeRoot();
  const truthStore = new ProviderTruthStore(root, { projectId: 'project-a', now });
  const limitStore = new ProviderLimitStore(root, {
    now, policyResolver: () => POLICY,
    terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
  });
  for (const provider of ['claude', 'codex'] as const) {
    truthStore.putReachability(await reachabilityResult(truthStore, provider));
    limitStore.putSnapshot(createProviderLimitResult(
      limitObservation(provider, remaining[provider] ?? 100), POLICY,
      { idFactory: () => `limit-${provider}` },
    ));
  }
  return {
    truthStore, limitStore,
    runtime: new HostRoleInvocationAdmissionRuntime({
      tenantId: 'tenant-a', truthStore, limitStore, now,
    }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('HostRoleInvocationAdmissionRuntime', () => {
  it.each(['brain', 'worker', 'auditor'] as const)(
    'returns an explicit %s HOLD when host authorities are unavailable',
    (role) => {
      const buildReservation = vi.fn(() => { throw new Error('must not build'); });
      const result = new HostRoleInvocationAdmissionRuntime(null).admit({
        invocation: {
          role, primaryProvider: 'claude', model: PROVIDERS.claude.model,
          fallbackProviders: ['codex'],
        },
        candidates: {}, buildReservation,
      });
      expect(result).toMatchObject({
        decision: 'hold', reasonCode: 'authority_unavailable',
        resolution: { role, selected: null },
      });
      expect(buildReservation).not.toHaveBeenCalled();
    },
  );

  it('admits an exact known primary but does not grant dispatch by admission alone', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    const result = runtime.admit(request(truthStore));
    expect(result).toMatchObject({
      decision: 'allow', dispatchClaimRequired: true,
      reservation: { provider: 'claude', model: 'claude-opus-4-8' },
      resolution: { selected: { provider: 'claude', model: 'claude-opus-4-8' } },
    });
    expect(result).not.toHaveProperty('executionGrant');
    truthStore.close();
    limitStore.close();
  });

  it('uses canonical exact-model fallback when the primary limit is held', async () => {
    const { truthStore, limitStore, runtime } = await setup({ claude: 0 });
    const result = runtime.admit(request(truthStore, 'worker'));
    expect(result).toMatchObject({
      decision: 'allow', reservation: { provider: 'codex', model: 'gpt-5.5' },
      resolution: {
        role: 'worker', selected: { provider: 'codex', model: 'gpt-5.5' },
        fallbackChain: [{ fromProvider: 'claude', toProvider: 'codex' }],
      },
    });
    truthStore.close();
    limitStore.close();
  });

  it('never builds a reservation when exact reachability evidence is missing', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    const buildReservation = vi.fn(reservation);
    const input = request(truthStore, 'auditor');
    const result = runtime.admit({
      ...input,
      candidates: {
        ...input.candidates,
        claude: {
          ...input.candidates.claude!,
          reachabilityQuery: {
            ...input.candidates.claude!.reachabilityQuery,
            runtimeFingerprint: '7'.repeat(64),
          },
        },
        codex: {
          ...input.candidates.codex!,
          reachabilityQuery: {
            ...input.candidates.codex!.reachabilityQuery,
            runtimeFingerprint: '7'.repeat(64),
          },
        },
      },
      buildReservation,
    });
    expect(result).toMatchObject({ decision: 'hold', resolution: { selected: null } });
    expect(buildReservation).not.toHaveBeenCalled();
    truthStore.close();
    limitStore.close();
  });

  it('treats a missing candidate authority as terminal HOLD instead of fallback spend', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    const input = request(truthStore);
    const buildReservation = vi.fn(reservation);
    const result = runtime.admit({
      ...input,
      candidates: { codex: input.candidates.codex! },
      buildReservation,
    });
    expect(result).toMatchObject({
      decision: 'hold', reasonCode: 'authority_unavailable',
      resolution: { selected: null },
    });
    expect(buildReservation).not.toHaveBeenCalled();
    truthStore.close();
    limitStore.close();
  });

  it('projects expired reachability and limit evidence to stale HOLD', async () => {
    const { truthStore, limitStore, runtime } = await setup({}, () => new Date(T10));
    const buildReservation = vi.fn(reservation);
    const spoofedHistoricalClock = {
      ...request(truthStore),
      at: T1,
      buildReservation,
    } as HostRoleInvocationAdmissionRequest;
    const result = runtime.admit(spoofedHistoricalClock);
    expect(result).toMatchObject({
      decision: 'hold',
      resolution: {
        selected: null,
        attempts: [
          { reachability: { state: 'stale' }, limits: { state: 'stale' } },
          { reachability: { state: 'stale' }, limits: { state: 'stale' } },
        ],
      },
    });
    expect(buildReservation).not.toHaveBeenCalled();
    truthStore.close();
    limitStore.close();
  });

  it('keeps explicit unavailable reachability and limit truth fail-closed', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    for (const provider of ['claude', 'codex'] as const) {
      truthStore.putReachability(await unavailableReachabilityResult(truthStore, provider));
      limitStore.putSnapshot(createProviderLimitResult({
        ...limitObservation(provider),
        idempotencyKey: `limit-unavailable-key-${provider}`,
        state: 'unavailable',
        requiredWindowIds: [],
        windows: [],
        source: {
          ...limitObservation(provider).source,
          evidenceRef: `limit-source-unavailable:${provider}-0001`,
        },
      }, POLICY, { idFactory: () => `limit-unavailable-${provider}` }));
    }
    const buildReservation = vi.fn(reservation);
    const result = runtime.admit({ ...request(truthStore), buildReservation });
    expect(result).toMatchObject({
      decision: 'hold',
      resolution: {
        selected: null,
        attempts: [
          { reachability: { state: 'unavailable' }, limits: { state: 'unavailable' } },
          { reachability: { state: 'unavailable' }, limits: { state: 'unavailable' } },
        ],
      },
    });
    expect(buildReservation).not.toHaveBeenCalled();
    truthStore.close();
    limitStore.close();
  });

  it('fails closed on candidate identity mismatch and truth-store failure', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    const input = request(truthStore);
    const mismatched = runtime.admit({
      ...input,
      candidates: {
        ...input.candidates,
        claude: { ...input.candidates.claude!, model: 'claude-fable-5' },
      },
    });
    expect(mismatched).toMatchObject({
      decision: 'hold', reasonCode: 'authority_identity_mismatch',
      resolution: { selected: null },
    });

    const fallbackMismatched = runtime.admit({
      ...input,
      candidates: {
        ...input.candidates,
        codex: { ...input.candidates.codex!, model: 'gpt-5.6-sol' },
      },
    });
    expect(fallbackMismatched).toMatchObject({
      decision: 'hold', reasonCode: 'authority_identity_mismatch',
      resolution: { selected: null, resolved: { provider: null } },
    });

    const failedRuntime = new HostRoleInvocationAdmissionRuntime({
      tenantId: 'tenant-a',
      truthStore: {
        projectId: truthStore.projectId,
        getLatestReachability: () => { throw new Error('tampered truth'); },
      },
      limitStore,
    });
    expect(failedRuntime.admit(input)).toMatchObject({
      decision: 'hold', reasonCode: 'authority_failure',
      resolution: { selected: null },
    });
    truthStore.close();
    limitStore.close();
  });

  it('binds reservation tenant/project/account/backend to the exact host authority', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    const input = request(truthStore);
    for (const mutate of [
      (value: ProviderLimitReservationRequest) => ({ ...value, projectId: 'project-b' }),
      (value: ProviderLimitReservationRequest) => ({ ...value, tenantId: 'tenant-b' }),
      (value: ProviderLimitReservationRequest) => ({ ...value, accountRefHash: '1'.repeat(64) }),
      (value: ProviderLimitReservationRequest) => ({
        ...value,
        backend: { ...value.backend, endpointRefHash: '2'.repeat(64) },
      }),
    ]) {
      const result = runtime.admit({
        ...input,
        buildReservation: selected => mutate(reservation(selected)),
      });
      expect(result).toMatchObject({
        decision: 'hold', reasonCode: 'authority_identity_mismatch',
        resolution: { selected: null },
      });
    }

    const crossTenantFallback = runtime.admit({
      ...input,
      candidates: {
        ...input.candidates,
        codex: {
          ...input.candidates.codex!,
          reachabilityQuery: {
            ...input.candidates.codex!.reachabilityQuery,
            tenantId: 'tenant-b',
          },
          limitQuery: { ...input.candidates.codex!.limitQuery, tenantId: 'tenant-b' },
        },
      },
    });
    expect(crossTenantFallback).toMatchObject({
      decision: 'hold', reasonCode: 'authority_identity_mismatch',
      resolution: { selected: null },
    });
    truthStore.close();
    limitStore.close();
  });

  it('never lets a reservation lease outlive selected reachability proof', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    const known = await reachabilityResult(truthStore, 'claude');
    truthStore.putReachability({
      ...known,
      reachabilityId: 'reach-claude-short-ttl',
      idempotencyKey: 'reachability-key-claude-short-ttl',
      probe: { ...known.probe, expiresAt: T2 },
    });
    const result = runtime.admit(request(truthStore));
    expect(result).toMatchObject({
      decision: 'hold', reasonCode: 'authority_identity_mismatch',
      resolution: { selected: null },
    });
    truthStore.close();
    limitStore.close();
  });

  it('turns a host clock authority failure into terminal HOLD', async () => {
    const { truthStore, limitStore } = await setup();
    const runtime = new HostRoleInvocationAdmissionRuntime({
      tenantId: 'tenant-a', truthStore, limitStore,
      now: () => { throw new Error('clock unavailable'); },
    });
    expect(runtime.admit(request(truthStore))).toMatchObject({
      decision: 'hold', reasonCode: 'authority_failure', resolution: { selected: null },
    });
    truthStore.close();
    limitStore.close();
  });

  it('grants dispatch exactly once through the injected host store', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    const admission = runtime.admit(request(truthStore));
    if (admission.decision !== 'allow') throw new Error('expected allow');
    expect(runtime.getReservation(admission.reservation)).toMatchObject({ state: 'admitted' });
    expect(() => runtime.getReservation({
      ...admission.reservation, projectId: 'project-b',
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    const event = {
      eventId: 'dispatch-host-role', type: 'dispatched' as const, occurredAt: T1.toISOString(),
      fenceTokenHash: '8'.repeat(64), evidenceRef: 'provider-dispatch:host-role-0001',
    };
    for (const foreignReservation of [
      { ...admission.reservation, tenantId: 'tenant-b' },
      { ...admission.reservation, projectId: 'project-b' },
    ]) {
      expect(() => runtime.claimDispatch(
        { ...admission, reservation: foreignReservation },
        event,
      )).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    }
    expect(runtime.claimDispatch(admission, event)).toMatchObject({ claimed: true });
    expect(runtime.claimDispatch(admission, event)).toEqual({
      claimed: false,
      existingDispatchEvidenceRef: 'provider-limit-reservation-event:dispatch-host-role',
    });
    expect(runtime.claimDispatch(admission, {
      ...event,
      eventId: 'dispatch-host-role-loser',
      evidenceRef: 'provider-dispatch:host-role-loser-0001',
    })).toEqual({
      claimed: false,
      existingDispatchEvidenceRef: 'provider-limit-reservation-event:dispatch-host-role',
    });
    truthStore.close();
    limitStore.close();
  });

  it('settles the exact dispatched reservation through the same scoped host authority', async () => {
    const { truthStore, limitStore, runtime } = await setup();
    const admission = runtime.admit(request(truthStore));
    if (admission.decision !== 'allow') throw new Error('expected allow');
    runtime.claimDispatch(admission, {
      eventId: 'dispatch-host-settle', type: 'dispatched', occurredAt: T1.toISOString(),
      fenceTokenHash: admission.reservation.fenceTokenHash,
      evidenceRef: 'provider-dispatch:host-settle-0001',
    });

    expect(() => runtime.settleDispatch(admission, {
      eventId: 'dispatch-host-settle-again', type: 'dispatched', occurredAt: T1.toISOString(),
      fenceTokenHash: admission.reservation.fenceTokenHash,
      evidenceRef: 'provider-dispatch:host-settle-0002',
    })).toThrowError(expect.objectContaining({ code: 'INVALID_EVENT' }));
    expect(() => runtime.settleDispatch(admission, {
      eventId: 'consume-host-wrong-fence', type: 'consumed', occurredAt: T1.toISOString(),
      fenceTokenHash: '7'.repeat(64), evidenceRef: 'provider-usage:host-settle-0001',
      actual: [{ windowId: 'tokens-all', unit: 'tokens', amount: 0 }],
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));

    const settled = runtime.settleDispatch(admission, {
      eventId: 'consume-host-settle', type: 'consumed', occurredAt: T1.toISOString(),
      fenceTokenHash: admission.reservation.fenceTokenHash,
      evidenceRef: 'provider-usage:host-settle-0002',
      actual: [{ windowId: 'tokens-all', unit: 'tokens', amount: 0 }],
    });
    expect(settled).toMatchObject({ type: 'consumed', sequence: 2, actual: [{ amount: 0 }] });
    truthStore.close();
    limitStore.close();
  });
});
