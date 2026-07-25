import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostRoleInvocationAdmissionRuntime } from '../../../../src/core/host-role-invocation-admission-runtime.js';
import type {
  InvocationEvent,
  InvocationReceiptLedger,
} from '../../../../src/core/invocation-receipt.js';
import { InvocationReceiptStore } from '../../../../src/core/invocation-receipt-store.js';
import {
  createProviderLimitResult,
  deriveProviderQuotaScopeRefHash,
  type ProviderLimitObservation,
  type ProviderLimitPolicy,
  type ProviderLimitReservationRequest,
} from '../../../../src/core/provider-limit-truth.js';
import { ProviderLimitStore } from '../../../../src/core/provider-limit-store.js';
import {
  probeExactModelReachability,
  type ReachabilityResult,
} from '../../../../src/core/provider-truth.js';
import {
  ProviderTruthStore,
  type ExactReachabilityQuery,
} from '../../../../src/core/provider-truth-store.js';
import type { RoleInvocationSelected } from '../../../../src/core/role-invocation-resolver.js';
import {
  MissionWorkerInvocationCoordinator,
  deriveMissionWorkerInvocationIdentity,
  deriveMissionWorkerReservationIdentity,
  type MissionWorkerInvocationAuthorities,
  type MissionWorkerInvocationExecution,
  type MissionWorkerInvocationPreparation,
} from '../../../../src/orchestra/autonomous/mission-store/mission-worker-invocation-coordinator.js';
import type { MissionTaskContext } from '../../../../src/orchestra/autonomous/mission-store/mission-dispatch.js';
import type {
  Mission,
  MissionDispatchClaim,
} from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';

const roots: string[] = [];
const T0 = new Date('2026-07-22T08:00:00.000Z');
const T1 = '2026-07-22T08:01:00.000Z';
const T2 = '2026-07-22T08:02:00.000Z';
const T5 = '2026-07-22T08:05:00.000Z';
const T10 = '2026-07-22T08:10:00.000Z';
const INTEGRITY_KEY = 'mission-worker-coordinator-integrity-key-0001';
const POLICY: ProviderLimitPolicy = {
  policyRef: 'limit-policy:mission-worker-0001',
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

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-mission-worker-invocation-'));
  roots.push(value);
  return value;
}

function backend(provider: ProviderKey) {
  return {
    transport: 'http' as const,
    executionBackend: 'docker' as const,
    endpointRefHash: PROVIDERS[provider].endpointRefHash,
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

function reachabilityQuery(projectId: string, provider: ProviderKey): ExactReachabilityQuery {
  const item = PROVIDERS[provider];
  return {
    tenantId: 'tenant-a', projectId, provider, model: item.model,
    authMode: 'api', accountRefHash: item.accountRefHash,
    ...backend(provider), runtimeFingerprint: item.runtimeFingerprint,
    executionProfileRef: `execution-profile:${provider}-worker-0001`, capability: 'inference',
  };
}

async function reachability(projectId: string, provider: ProviderKey): Promise<ReachabilityResult> {
  const query = reachabilityQuery(projectId, provider);
  const item = PROVIDERS[provider];
  const auth = { mode: query.authMode, accountRefHash: query.accountRefHash };
  const reachabilityBackend = {
    transport: query.transport,
    executionBackend: query.executionBackend,
    endpointRefHash: query.endpointRefHash,
    runtimeFingerprint: query.runtimeFingerprint,
    executionProfileRef: query.executionProfileRef,
  };
  return probeExactModelReachability({
    idempotencyKey: `worker-reachability-${provider}`,
    tenantId: query.tenantId, projectId, provider, model: item.model,
    auth, backend: reachabilityBackend, probeKind: 'model-invocation', capability: 'inference',
    admission: {
      decision: 'allow', tenantId: query.tenantId, projectId, provider, model: item.model,
      auth, backend: reachabilityBackend, approvalRef: `approval:${provider}-worker-0001`,
      approvalGrantedAt: T0.toISOString(), approvalExpiresAt: T10,
      limits: {
        state: 'known', decision: 'allow', evidenceRefs: [`limit:${provider}-worker-0001`],
        fetchedAt: T0.toISOString(), expiresAt: T10,
      },
      budget: {
        evidenceRef: `budget:${provider}-worker-0001`, maxInputTokens: 64,
        maxOutputTokens: 64, maxTotalTokens: 128, maxUsd: 0.01,
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
      providerRequestRefHash: '9'.repeat(64), latencyMs: 2,
    }),
    now: () => T0,
    idFactory: () => `reach-worker-${provider}`,
  });
}

function limitObservation(
  projectId: string,
  provider: ProviderKey,
  remaining: number,
): ProviderLimitObservation {
  return {
    ...limitScope(provider), projectId, backend: backend(provider),
    idempotencyKey: `worker-limit-${provider}-${remaining}`,
    state: 'known', requiredWindowIds: ['tokens-all'],
    windows: [{
      windowId: 'tokens-all', kind: 'rate-window', model: PROVIDERS[provider].model,
      unit: 'tokens', consumed: 100 - remaining, remaining, limit: 100,
      reset: { state: 'known', at: T10, displayRefHash: null },
    }],
    source: {
      kind: 'provider-api', authority: 'authoritative', operatorApprovalRef: null,
      evidenceRef: `limit-source:${provider}-worker-0001`, fetchedAt: T0.toISOString(),
      expiresAt: T10, incorporatedReservationEventRefs: [],
    },
  };
}

const FENCE_TOKEN = 'mission-worker-private-fence-token';
const CLAIM: MissionDispatchClaim = Object.freeze({
  schemaVersion: 1,
  workItemId: 'mission-a-task-1',
  missionId: 'mission-a',
  claimedBy: 'scheduler',
  claimedAt: T1,
  itemRevision: 3,
  attemptId: 'mission-a-task-1-attempt-1',
  fenceToken: FENCE_TOKEN,
  fenceTokenHash: createHash('sha256').update(FENCE_TOKEN).digest('hex'),
  claimRegistryRevision: 'goal-v2-production-v2',
  claimRegistryDigest: '7'.repeat(64),
});
const { fenceToken: _TEST_RAW_FENCE, ...CLAIM_BINDING } = CLAIM;
const TEST_IDENTITY = deriveMissionWorkerInvocationIdentity(
  'tenant-a', 'project-worker-a', CLAIM_BINDING,
);
const TEST_RESERVATIONS = {
  claude: deriveMissionWorkerReservationIdentity(TEST_IDENTITY, 'claude', PROVIDERS.claude.model),
  codex: deriveMissionWorkerReservationIdentity(TEST_IDENTITY, 'codex', PROVIDERS.codex.model),
};
const MISSION: Mission = {
  id: 'mission-a', kind: 'list', status: 'active', tenant: 'tenant-a',
  title: 'Mission A', spec: null, createdBy: 'test', deliverTo: null,
  renderAs: 'checklist', progress: null, createdAt: T0.toISOString(),
  updatedAt: T1, completedAt: null, lastResult: null,
};
const CONTEXT: MissionTaskContext = {
  projectRoot: '/project', description: 'perform exact work',
  provider: 'claude', model: 'claude-opus-4-8',
};

interface Harness {
  readonly receiptStore: InvocationReceiptStore;
  readonly truthStore: ProviderTruthStore;
  readonly limitStore: ProviderLimitStore;
  readonly runtime: HostRoleInvocationAdmissionRuntime;
  readonly authorities: MissionWorkerInvocationAuthorities;
  readonly preparation: MissionWorkerInvocationPreparation;
  close(): void;
}

async function harness(
  remaining: Partial<Record<ProviderKey, number>> = {},
  ledgerOverride?: InvocationReceiptLedger,
): Promise<Harness> {
  const projectRoot = root();
  const receiptStore = new InvocationReceiptStore(projectRoot, {
    idFactory: () => 'project-worker-a', now: () => T2,
  });
  const truthStore = new ProviderTruthStore(projectRoot, {
    projectId: receiptStore.projectId, now: () => new Date(T2), integrityKey: INTEGRITY_KEY,
  });
  const limitStore = new ProviderLimitStore(projectRoot, {
    now: () => new Date(T2), policyResolver: () => POLICY,
    terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
  });
  for (const provider of ['claude', 'codex'] as const) {
    truthStore.putReachability(await reachability(receiptStore.projectId, provider));
    limitStore.putSnapshot(createProviderLimitResult(
      limitObservation(receiptStore.projectId, provider, remaining[provider] ?? 100),
      POLICY,
      { idFactory: () => `limit-worker-${provider}` },
    ));
  }
  const runtime = new HostRoleInvocationAdmissionRuntime({
    tenantId: 'tenant-a', truthStore, limitStore, now: () => new Date(T1),
  });
  const ledger = ledgerOverride ?? receiptStore;
  const invocationIdentity = deriveMissionWorkerInvocationIdentity(
    MISSION.tenant, ledger.projectId, CLAIM_BINDING,
  );
  const preparation: MissionWorkerInvocationPreparation = {
    admission: {
      invocation: {
        role: 'worker', purpose: 'worker-execution', primaryProvider: 'claude',
        model: PROVIDERS.claude.model, fallbackProviders: ['codex'],
      },
      candidates: Object.fromEntries((['claude', 'codex'] as const).map(provider => [provider, {
        provider, model: PROVIDERS[provider].model,
        reachabilityQuery: reachabilityQuery(ledger.projectId, provider),
        limitQuery: limitScope(provider),
      }])),
      buildReservation: (selected: RoleInvocationSelected): ProviderLimitReservationRequest => {
        const provider = selected.provider as ProviderKey;
        const reservationIdentity = deriveMissionWorkerReservationIdentity(
          invocationIdentity, provider, selected.model,
        );
        return {
          ...limitScope(provider), projectId: ledger.projectId, backend: backend(provider),
          model: selected.model, ...reservationIdentity,
          runId: CLAIM.missionId, taskId: CLAIM.workItemId, callId: invocationIdentity.callId,
          attemptId: CLAIM.attemptId, fenceTokenHash: CLAIM.fenceTokenHash,
          receiptRef: invocationIdentity.receiptRef,
          reachabilityEvidenceRef: `provider-reachability:reach-worker-${provider}`,
          estimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 10 }],
          estimateEvidenceRefs: ['budget-estimate:mission-worker-0001'],
          requestedAt: T1, leaseExpiresAt: T5,
        };
      },
    },
    receipt: {
      configured: {
        provider: 'claude', model: PROVIDERS.claude.model, source: 'config', reasonCode: 'none',
      },
      requested: {
        provider: 'claude', model: PROVIDERS.claude.model, source: 'directive', reasonCode: 'none',
      },
      createdAt: T1,
    },
    buildDispatchEvent: admission => ({
      eventId: `dispatch-worker-${admission.reservation.provider}`,
      type: 'dispatched', occurredAt: T1,
      fenceTokenHash: CLAIM.fenceTokenHash,
      evidenceRef: `provider-dispatch:${admission.reservation.provider}-worker-0001`,
    }),
  };
  const authorities: MissionWorkerInvocationAuthorities = {
    admissionRuntime: runtime,
    receiptLedger: ledger,
    prepare: preparedInput => {
      expect(preparedInput.identity).toEqual(invocationIdentity);
      return preparation;
    },
  };
  return {
    receiptStore, truthStore, limitStore, runtime, authorities, preparation,
    close: () => { receiptStore.close(); truthStore.close(); limitStore.close(); },
  };
}

function successExecution(
  provider: ProviderKey,
  overrides: Partial<MissionWorkerInvocationExecution> = {},
): MissionWorkerInvocationExecution {
  return {
    result: { ok: true, reason: 'verified worker result' },
    actualCall: {
      provider, model: PROVIDERS[provider].model, backend: backend(provider),
      auth: { mode: 'api', accountRefHash: PROVIDERS[provider].accountRefHash },
      evidenceRef: `provider-call:${provider}-worker-0001`,
    },
    transportEvent: {
      eventId: `transport-worker-${provider}`, type: 'transport_settled', occurredAt: T2,
      payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 50 },
    },
    providerSettlementEvent: {
      eventId: `consume-worker-${provider}`, type: 'consumed', occurredAt: T2,
      fenceTokenHash: CLAIM.fenceTokenHash,
      evidenceRef: `provider-usage:${provider}-worker-0001`,
      actual: [{ windowId: 'tokens-all', unit: 'tokens', amount: 0 }],
    },
    consumerEvent: {
      eventId: `consumer-worker-${provider}`, type: 'consumer_settled', occurredAt: T2,
      payload: { outcome: 'accepted', reasonCode: 'none' },
    },
    ...overrides,
  };
}

function input(active = true) {
  return { mission: MISSION, context: CONTEXT, claim: CLAIM, isClaimActive: () => active };
}

function wrappedLedger(
  base: InvocationReceiptStore,
  append: InvocationReceiptLedger['append'] = base.append.bind(base),
  declare: InvocationReceiptLedger['declare'] = base.declare.bind(base),
): InvocationReceiptLedger {
  return {
    projectId: base.projectId,
    declare,
    append,
    get: base.get.bind(base),
    close: () => undefined,
  };
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('MissionWorkerInvocationCoordinator', () => {
  it('parks null authority and inactive claims before preparation or provider execution', async () => {
    const executor = vi.fn();
    expect(await new MissionWorkerInvocationCoordinator(null).execute(input(), executor))
      .toMatchObject({
        ok: false, dispatchDisposition: 'parked',
        reason: 'MISSION_WORKER_INVOCATION_AUTHORITY_UNAVAILABLE',
      });
    const h = await harness();
    const prepare = vi.fn(h.authorities.prepare);
    const coordinator = new MissionWorkerInvocationCoordinator({ ...h.authorities, prepare });
    expect(await coordinator.execute(input(false), executor)).toMatchObject({
      ok: false, dispatchDisposition: 'parked', reason: 'MISSION_WORKER_INVOCATION_HOLD:authority_failure',
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    h.close();
  });

  it('preserves an exact upstream composition HOLD before the executor', async () => {
    const executor = vi.fn();
    const coordinator = new MissionWorkerInvocationCoordinator({
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      authorityEvidenceRef: 'provider-authority:policy-missing',
    });

    await expect(coordinator.execute(input(), executor)).resolves.toMatchObject({
      ok: false,
      dispatchDisposition: 'parked',
      reason: 'MISSION_WORKER_INVOCATION_HOLD:policy_authority_unavailable',
      authorityEvidenceRef: 'provider-authority:policy-missing',
      invocationReceiptRef: null,
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it('binds known primary claim→receipt→grant→zero-usage settlement exactly once', async () => {
    const h = await harness();
    const coordinator = new MissionWorkerInvocationCoordinator(h.authorities);
    const executor = vi.fn(async (grant) => {
      expect(grant).toMatchObject({
        provider: 'claude', model: 'claude-opus-4-8',
        reservationId: TEST_RESERVATIONS.claude.reservationId,
      });
      expect(Object.isFrozen(grant)).toBe(true);
      expect(JSON.stringify(grant)).not.toContain(CLAIM.fenceToken);
      return successExecution('claude');
    });
    const result = await coordinator.execute(input(), executor);

    expect(result).toMatchObject({
      ok: true, calledProvider: 'claude', calledModel: 'claude-opus-4-8',
      providerLimitReservationId: TEST_RESERVATIONS.claude.reservationId,
    });
    expect(executor).toHaveBeenCalledTimes(1);
    const receipt = h.receiptStore.get({ tenantId: 'tenant-a', projectId: h.receiptStore.projectId }, TEST_IDENTITY.invocationId);
    expect(receipt).toMatchObject({
      receipt: {
        runId: CLAIM.missionId, taskId: CLAIM.workItemId, callId: TEST_IDENTITY.callId,
        role: 'worker', purpose: 'worker-execution',
        called: { provider: 'claude', model: 'claude-opus-4-8' },
        reachability: { state: 'known' }, limits: { state: 'known' },
      },
      transportOutcome: 'succeeded', consumerOutcome: 'accepted',
    });
    expect(receipt?.events.map(event => event.type)).toEqual([
      'dispatch_started', 'transport_settled', 'consumer_settled',
    ]);
    expect(JSON.stringify(receipt)).not.toContain(CLAIM.fenceToken);
    expect(h.limitStore.getReservation({
      ...limitScope('claude'), projectId: h.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)).toMatchObject({
      state: 'consumed', events: [{ type: 'dispatched' }, { type: 'consumed', actual: [{ amount: 0 }] }],
    });

    const replay = await coordinator.execute(input(), executor);
    expect(replay).toMatchObject({ ok: false, dispatchDisposition: 'reconciliation-required' });
    expect(executor).toHaveBeenCalledTimes(1);
    h.close();
  });

  it('uses the canonical fallback reservation and receipt when primary capacity is held', async () => {
    const h = await harness({ claude: 0, codex: 100 });
    const executor = vi.fn(async (grant) => {
      expect(grant).toMatchObject({
        provider: 'codex', model: 'gpt-5.5',
        reservationId: TEST_RESERVATIONS.codex.reservationId,
      });
      return successExecution('codex');
    });
    const result = await new MissionWorkerInvocationCoordinator(h.authorities).execute(input(), executor);
    expect(result).toMatchObject({ ok: true, calledProvider: 'codex', calledModel: 'gpt-5.5' });
    const receipt = h.receiptStore.get({ tenantId: 'tenant-a', projectId: h.receiptStore.projectId }, TEST_IDENTITY.invocationId);
    expect(receipt?.receipt).toMatchObject({
      resolved: { provider: 'codex', model: 'gpt-5.5', source: 'fallback' },
      called: { provider: 'codex', model: 'gpt-5.5', source: 'wire' },
      fallbackChain: [{ fromProvider: 'claude', toProvider: 'codex', toModel: 'gpt-5.5' }],
    });
    expect(executor).toHaveBeenCalledTimes(1);
    h.close();
  });

  it('persists a terminal rejection receipt when every exact fallback is limit-held', async () => {
    const h = await harness({ claude: 0, codex: 0 });
    const executor = vi.fn();
    const result = await new MissionWorkerInvocationCoordinator(h.authorities).execute(input(), executor);
    expect(result).toMatchObject({
      ok: false, dispatchDisposition: 'parked',
      reason: 'MISSION_WORKER_INVOCATION_HOLD:fallback_exhausted',
      invocationReceiptRef: { invocationId: TEST_IDENTITY.invocationId },
    });
    expect(executor).not.toHaveBeenCalled();
    const receipt = h.receiptStore.get(
      { tenantId: 'tenant-a', projectId: h.receiptStore.projectId },
      TEST_IDENTITY.invocationId,
    );
    expect(receipt).toMatchObject({
      receipt: { called: { provider: null, model: null }, limits: { state: 'known' } },
      transportOutcome: 'not_dispatched', consumerOutcome: 'rejected',
    });
    expect(receipt?.events.map(event => event.type)).toEqual(['dispatch_rejected', 'consumer_settled']);
    h.close();
  });

  it('settles a provider grant as released only with host-verifiable no-effect evidence', async () => {
    const h = await harness();
    const executor = vi.fn(async () => successExecution('claude', {
      result: { ok: false, reason: 'cancelled before provider side effect' },
      transportEvent: {
        eventId: 'transport-worker-claude', type: 'transport_settled', occurredAt: T2,
        payload: {
          outcome: 'failed', exitCode: null, signal: 'SIGTERM',
          reasonCode: 'spawn_error', durationMs: 1,
        },
      },
      providerSettlementEvent: {
        eventId: 'release-worker-claude', type: 'released', occurredAt: T2,
        fenceTokenHash: CLAIM.fenceTokenHash,
        evidenceRef: 'provider-release:claude-worker-0001',
        terminationEvidenceRef: 'runtime-stopped:claude-worker-0001',
        terminationAuthorityRef: 'runtime-authority:claude-worker-0001',
      },
      consumerEvent: {
        eventId: 'consumer-worker-claude', type: 'consumer_settled', occurredAt: T2,
        payload: { outcome: 'rejected', reasonCode: 'spawn_error' },
      },
    }));
    const result = await new MissionWorkerInvocationCoordinator(h.authorities).execute(input(), executor);
    expect(result).toMatchObject({ ok: false, reason: 'cancelled before provider side effect' });
    expect(result).not.toHaveProperty('dispatchDisposition');
    expect(h.limitStore.getReservation({
      ...limitScope('claude'), projectId: h.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)?.state).toBe('released');
    expect(h.receiptStore.get(
      { tenantId: 'tenant-a', projectId: h.receiptStore.projectId },
      TEST_IDENTITY.invocationId,
    )).toMatchObject({ transportOutcome: 'failed', consumerOutcome: 'rejected' });
    h.close();
  });

  it('never executes when receipt declaration fails', async () => {
    const seed = await harness();
    const failing = wrappedLedger(seed.receiptStore, undefined, () => { throw new Error('receipt unavailable'); });
    const coordinator = new MissionWorkerInvocationCoordinator({
      ...seed.authorities,
      receiptLedger: failing,
    });
    const executor = vi.fn();
    expect(await coordinator.execute(input(), executor)).toMatchObject({
      ok: false, dispatchDisposition: 'parked', reason: 'MISSION_WORKER_INVOCATION_HOLD:authority_failure',
    });
    expect(executor).not.toHaveBeenCalled();
    expect(seed.limitStore.getReservation({
      ...limitScope('claude'), projectId: seed.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)?.state).toBe('admitted');
    seed.close();
  });

  it('parks a crash after provider grant but before receipt dispatch-start and never redrives', async () => {
    const seed = await harness();
    const failing = wrappedLedger(seed.receiptStore, (scope, id, event) => {
      if (event.type === 'dispatch_started') throw new Error('receipt event crash');
      return seed.receiptStore.append(scope, id, event);
    });
    const firstCoordinator = new MissionWorkerInvocationCoordinator({
      ...seed.authorities, receiptLedger: failing,
    });
    const executor = vi.fn(async () => successExecution('claude'));
    expect(await firstCoordinator.execute(input(), executor)).toMatchObject({
      ok: false, dispatchDisposition: 'reconciliation-required',
      reason: 'MISSION_WORKER_INVOCATION_RECONCILIATION_REQUIRED',
    });
    expect(executor).not.toHaveBeenCalled();
    expect(seed.limitStore.getReservation({
      ...limitScope('claude'), projectId: seed.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)?.state).toBe('dispatched');
    expect(seed.receiptStore.get(
      { tenantId: 'tenant-a', projectId: seed.receiptStore.projectId },
      TEST_IDENTITY.invocationId,
    )?.events).toHaveLength(0);

    await new MissionWorkerInvocationCoordinator(seed.authorities).execute(input(), executor);
    expect(executor).not.toHaveBeenCalled();
    seed.close();
  });

  it('parks an ambiguous executor failure and concurrent replay gets no second grant', async () => {
    const h = await harness();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const executor = vi.fn(async () => {
      await blocked;
      throw new Error('transport vanished after dispatch');
    });
    const coordinator = new MissionWorkerInvocationCoordinator(h.authorities);
    const first = coordinator.execute(input(), executor);
    await vi.waitFor(() => expect(executor).toHaveBeenCalledTimes(1));
    const replay = await coordinator.execute(input(), executor);
    expect(replay).toMatchObject({ ok: false, dispatchDisposition: 'reconciliation-required' });
    expect(executor).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toMatchObject({
      ok: false, dispatchDisposition: 'reconciliation-required',
      reason: 'MISSION_WORKER_INVOCATION_RECONCILIATION_REQUIRED',
    });
    expect(h.limitStore.getReservation({
      ...limitScope('claude'), projectId: h.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)?.state).toBe('dispatched');
    h.close();
  });

  it('keeps consumed usage and parks when consumer-receipt settlement crashes', async () => {
    const h = await harness();
    const failing = wrappedLedger(h.receiptStore, (scope, id, event: InvocationEvent) => {
      if (event.type === 'consumer_settled') throw new Error('consumer ledger unavailable');
      return h.receiptStore.append(scope, id, event);
    });
    const executor = vi.fn(async () => successExecution('claude'));
    const coordinator = new MissionWorkerInvocationCoordinator({
      ...h.authorities, receiptLedger: failing,
    });
    expect(await coordinator.execute(input(), executor)).toMatchObject({
      ok: false, dispatchDisposition: 'reconciliation-required',
      reason: 'MISSION_WORKER_INVOCATION_RECONCILIATION_REQUIRED',
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(h.limitStore.getReservation({
      ...limitScope('claude'), projectId: h.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)?.state).toBe('consumed');
    expect(h.receiptStore.get(
      { tenantId: 'tenant-a', projectId: h.receiptStore.projectId },
      TEST_IDENTITY.invocationId,
    )?.events.map(event => event.type)).toEqual(['dispatch_started', 'transport_settled']);
    await new MissionWorkerInvocationCoordinator(h.authorities).execute(input(), executor);
    expect(executor).toHaveBeenCalledTimes(1);
    h.close();
  });

  it('parks for reconciliation when transport receipt persistence fails after execution', async () => {
    const h = await harness();
    const failing = wrappedLedger(h.receiptStore, (scope, id, event: InvocationEvent) => {
      if (event.type === 'transport_settled') throw new Error('transport ledger unavailable');
      return h.receiptStore.append(scope, id, event);
    });
    const executor = vi.fn(async () => successExecution('claude'));
    const result = await new MissionWorkerInvocationCoordinator({
      ...h.authorities, receiptLedger: failing,
    }).execute(input(), executor);
    expect(result).toMatchObject({
      ok: false, dispatchDisposition: 'reconciliation-required',
      reason: 'MISSION_WORKER_INVOCATION_RECONCILIATION_REQUIRED',
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(h.limitStore.getReservation({
      ...limitScope('claude'), projectId: h.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)?.state).toBe('dispatched');
    expect(h.receiptStore.get(
      { tenantId: 'tenant-a', projectId: h.receiptStore.projectId }, TEST_IDENTITY.invocationId,
    )?.events.map(event => event.type)).toEqual(['dispatch_started']);
    h.close();
  });

  it('parks for reconciliation when provider-limit settlement rejects measured scope', async () => {
    const h = await harness();
    const executor = vi.fn(async () => successExecution('claude', {
      providerSettlementEvent: {
        eventId: 'consume-worker-wrong-window', type: 'consumed', occurredAt: T2,
        fenceTokenHash: CLAIM.fenceTokenHash,
        evidenceRef: 'provider-usage:claude-wrong-window',
        actual: [{ windowId: 'other-window', unit: 'tokens', amount: 1 }],
      },
    }));
    const result = await new MissionWorkerInvocationCoordinator(h.authorities).execute(input(), executor);
    expect(result).toMatchObject({
      ok: false, dispatchDisposition: 'reconciliation-required',
      reason: 'MISSION_WORKER_INVOCATION_RECONCILIATION_REQUIRED',
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(h.limitStore.getReservation({
      ...limitScope('claude'), projectId: h.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)?.state).toBe('dispatched');
    expect(h.receiptStore.get(
      { tenantId: 'tenant-a', projectId: h.receiptStore.projectId }, TEST_IDENTITY.invocationId,
    )?.events.map(event => event.type)).toEqual(['dispatch_started', 'transport_settled']);
    h.close();
  });

  it('rejects actual called-provider drift and executor-authored parked semantics', async () => {
    const mismatch = await harness();
    const mismatchedExecutor = vi.fn(async () => successExecution('claude', {
      actualCall: {
        provider: 'codex', model: PROVIDERS.codex.model, backend: backend('codex'),
        auth: { mode: 'api', accountRefHash: PROVIDERS.codex.accountRefHash },
        evidenceRef: 'provider-call:codex-mismatch-0001',
      },
    }));
    expect(await new MissionWorkerInvocationCoordinator(mismatch.authorities).execute(
      input(), mismatchedExecutor,
    )).toMatchObject({ ok: false, dispatchDisposition: 'reconciliation-required' });
    expect(mismatchedExecutor).toHaveBeenCalledTimes(1);
    mismatch.close();

    const spoof = await harness();
    const spoofingExecutor = vi.fn(async () => successExecution('claude', {
      result: { ok: false, dispatchDisposition: 'parked', reason: 'executor tried to hide dispatch' },
    }));
    expect(await new MissionWorkerInvocationCoordinator(spoof.authorities).execute(
      input(), spoofingExecutor,
    )).toMatchObject({ ok: false, dispatchDisposition: 'reconciliation-required' });
    expect(spoofingExecutor).toHaveBeenCalledTimes(1);
    spoof.close();
  });

  it('binds tenant/project before reservation or receipt declaration', async () => {
    const tenant = await harness();
    const foreignMission = { ...MISSION, tenant: 'tenant-b' };
    const executor = vi.fn();
    const tenantResult = await new MissionWorkerInvocationCoordinator(tenant.authorities).execute({
      ...input(), mission: foreignMission,
    }, executor);
    expect(tenantResult).toMatchObject({ ok: false, dispatchDisposition: 'parked' });
    expect(executor).not.toHaveBeenCalled();
    expect(tenant.limitStore.getReservation({
      ...limitScope('claude'), projectId: tenant.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)).toBeNull();
    const foreignIdentity = deriveMissionWorkerInvocationIdentity(
      'tenant-b', tenant.receiptStore.projectId, CLAIM_BINDING,
    );
    expect(tenant.receiptStore.get(
      { tenantId: 'tenant-b', projectId: tenant.receiptStore.projectId }, foreignIdentity.invocationId,
    )).toBeNull();
    tenant.close();

    const project = await harness();
    const foreignCandidate: MissionWorkerInvocationPreparation = {
      ...project.preparation,
      admission: {
        ...project.preparation.admission,
        candidates: {
          ...project.preparation.admission.candidates,
          claude: {
            ...project.preparation.admission.candidates.claude!,
            reachabilityQuery: {
              ...project.preparation.admission.candidates.claude!.reachabilityQuery,
              projectId: 'foreign-project',
            },
          },
        },
      },
    };
    expect(await new MissionWorkerInvocationCoordinator({
      ...project.authorities, prepare: () => foreignCandidate,
    }).execute(input(), executor)).toMatchObject({ ok: false, dispatchDisposition: 'parked' });
    expect(executor).not.toHaveBeenCalled();
    expect(project.limitStore.getReservation({
      ...limitScope('claude'), projectId: project.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)).toBeNull();
    project.close();
  });

  it('derives immutable invocation/call/reservation identity so producer drift cannot redrive', async () => {
    const h = await harness();
    const executor = vi.fn(async () => { throw new Error('ambiguous after grant'); });
    const coordinator = new MissionWorkerInvocationCoordinator(h.authorities);
    expect(await coordinator.execute(input(), executor)).toMatchObject({
      ok: false, dispatchDisposition: 'reconciliation-required',
    });
    const drifted: MissionWorkerInvocationPreparation = {
      ...h.preparation,
      admission: {
        ...h.preparation.admission,
        buildReservation: selected => ({
          ...h.preparation.admission.buildReservation(selected),
          reservationId: 'producer-drift-reservation',
          idempotencyKey: 'producer-drift-key',
          callId: 'producer-drift-call',
        }),
      },
    };
    expect(await new MissionWorkerInvocationCoordinator({
      ...h.authorities, prepare: () => drifted,
    }).execute(input(), executor)).toMatchObject({
      ok: false, dispatchDisposition: 'reconciliation-required',
    });
    expect(executor).toHaveBeenCalledTimes(1);
    h.close();
  });

  it('rejects a reservation/claim identity mutation before provider execution', async () => {
    const h = await harness();
    const mutated: MissionWorkerInvocationPreparation = {
      ...h.preparation,
      admission: {
        ...h.preparation.admission,
        buildReservation: selected => ({
          ...h.preparation.admission.buildReservation(selected),
          taskId: 'different-task',
        }),
      },
    };
    const executor = vi.fn();
    const result = await new MissionWorkerInvocationCoordinator({
      ...h.authorities, prepare: () => mutated,
    }).execute(input(), executor);
    expect(result).toMatchObject({ ok: false, dispatchDisposition: 'parked' });
    expect(executor).not.toHaveBeenCalled();
    h.close();
  });

  it('rejects a legacy model alias before creating a reservation or provider execution', async () => {
    const h = await harness();
    const legacy: MissionWorkerInvocationPreparation = {
      ...h.preparation,
      admission: {
        ...h.preparation.admission,
        invocation: { ...h.preparation.admission.invocation, model: 'gpt-5' },
      },
      receipt: {
        ...h.preparation.receipt,
        configured: { provider: 'claude', model: 'gpt-5', source: 'config', reasonCode: 'none' },
        requested: { provider: 'claude', model: 'gpt-5', source: 'directive', reasonCode: 'none' },
      },
    };
    const executor = vi.fn();
    const result = await new MissionWorkerInvocationCoordinator({
      ...h.authorities, prepare: () => legacy,
    }).execute(input(), executor);
    expect(result).toMatchObject({
      ok: false, dispatchDisposition: 'parked', reason: 'MISSION_WORKER_INVOCATION_HOLD:authority_failure',
    });
    expect(executor).not.toHaveBeenCalled();
    expect(h.limitStore.getReservation({
      ...limitScope('claude'), projectId: h.receiptStore.projectId,
    }, TEST_RESERVATIONS.claude.reservationId)).toBeNull();
    h.close();
  });
});
