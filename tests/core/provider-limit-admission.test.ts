import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  admitRoleInvocation,
  claimAdmittedProviderDispatch,
  ProviderLimitAdmissionError,
} from '../../src/core/provider-limit-admission.js';
import {
  createProviderLimitResult,
  deriveProviderQuotaScopeRefHash,
  type ProviderLimitObservation,
  type ProviderLimitPolicy,
  type ProviderLimitReservationRequest,
} from '../../src/core/provider-limit-truth.js';
import {
  ProviderLimitStore,
  ProviderLimitStoreError,
} from '../../src/core/provider-limit-store.js';
import type {
  ProviderEvidence,
  RoleInvocationRequest,
  RoleInvocationSelected,
} from '../../src/core/role-invocation-resolver.js';
import type { InvocationRole } from '../../src/core/invocation-receipt.js';

const roots: string[] = [];
const T0 = '2026-07-20T12:00:00.000Z';
const T1 = '2026-07-20T12:01:00.000Z';
const T5 = '2026-07-20T12:05:00.000Z';
const T6 = '2026-07-20T12:06:00.000Z';
const T10 = '2026-07-20T12:10:00.000Z';
const INTEGRITY_KEY = 'deckent-admission-test-integrity-key-0001';
const POLICY: ProviderLimitPolicy = {
  policyRef: 'limit-policy:admission-0001',
  warnAtRatio: 0.8,
  blockAtRatio: 0.95,
  minimumRemaining: {},
};

const PROVIDERS = {
  claude: {
    accountRefHash: 'a'.repeat(64), endpointRefHash: 'b'.repeat(64), model: 'claude-opus-4-8',
  },
  codex: {
    accountRefHash: 'c'.repeat(64), endpointRefHash: 'd'.repeat(64), model: 'gpt-5.5',
  },
} as const;

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-provider-admission-'));
  roots.push(root);
  return root;
}

function providerScope(provider: keyof typeof PROVIDERS) {
  const item = PROVIDERS[provider];
  const backend = {
    transport: 'http' as const,
    executionBackend: 'docker' as const,
    endpointRefHash: item.endpointRefHash,
  };
  return {
    tenantId: 'tenant-a',
    provider,
    accountRefHash: item.accountRefHash,
    quotaScopeRefHash: deriveProviderQuotaScopeRefHash({
      tenantId: 'tenant-a', provider, accountRefHash: item.accountRefHash, authMode: 'api', backend,
    }),
    authMode: 'api' as const,
    backend,
  };
}

function observation(
  provider: keyof typeof PROVIDERS,
  remaining = 100,
): ProviderLimitObservation {
  const scope = providerScope(provider);
  return {
    ...scope,
    projectId: 'project-a',
    idempotencyKey: `snapshot-key-${provider}-${remaining}`,
    state: 'known',
    requiredWindowIds: ['tokens-all'],
    windows: [{
      windowId: 'tokens-all', kind: 'rate-window', model: PROVIDERS[provider].model,
      unit: 'tokens', consumed: 100 - remaining, remaining, limit: 100,
      reset: { state: 'known', at: T10, displayRefHash: null },
    }],
    source: {
      kind: 'provider-api', authority: 'authoritative', operatorApprovalRef: null,
      evidenceRef: `limit-source:${provider}-00000001`, fetchedAt: T0, expiresAt: T10,
      incorporatedReservationEventRefs: [],
    },
  };
}

function evidence(provider: keyof typeof PROVIDERS, state: 'known' | 'unknown' = 'known'): ProviderEvidence {
  return {
    reachability: {
      state,
      reachable: state === 'known',
      evidenceRef: `provider-reachability:${provider}-00000001`,
    },
    limits: {
      state,
      limited: false,
      evidenceRefs: [`provider-limit:${provider}-00000001`],
    },
  };
}

function invocation(role: InvocationRole = 'worker'): RoleInvocationRequest {
  return {
    role,
    primaryProvider: 'claude',
    model: 'claude-opus-4-8',
    fallbackProviders: ['codex'],
    evidence: { claude: evidence('claude'), codex: evidence('codex') },
  };
}

function candidateScopes() {
  return Object.fromEntries((['claude', 'codex'] as const).map(provider => [provider, {
    ...providerScope(provider),
    model: PROVIDERS[provider].model,
    reachabilityEvidenceRef: `provider-reachability:${provider}-00000001`,
  }]));
}

function reservationQuery(provider: keyof typeof PROVIDERS) {
  return { ...providerScope(provider), projectId: 'project-a' };
}

function reservation(
  selected: RoleInvocationSelected,
  amount = 30,
  prefix = 'service',
): ProviderLimitReservationRequest {
  const provider = selected.provider as keyof typeof PROVIDERS;
  return {
    ...providerScope(provider),
    projectId: 'project-a',
    model: selected.model,
    reservationId: `${prefix}-reservation-${provider}`,
    idempotencyKey: `${prefix}-reservation-key-${provider}`,
    runId: 'run-a',
    taskId: 'task-a',
    callId: `call-${prefix}`,
    attemptId: `attempt-${prefix}`,
    fenceTokenHash: 'e'.repeat(64),
    receiptRef: 'invocation-receipt:admission-0001',
    reachabilityEvidenceRef: `provider-reachability:${provider}-00000001`,
    estimates: [{ windowId: 'tokens-all', unit: 'tokens', amount }],
    estimateEvidenceRefs: ['budget-estimate:admission-0001'],
    requestedAt: T1,
    leaseExpiresAt: T5,
  };
}

function setup(now: () => Date = () => new Date(T1)): {
  store: ProviderLimitStore;
  root: string;
  close: () => void;
} {
  const root = makeRoot();
  const store = new ProviderLimitStore(root, {
    now, policyResolver: () => POLICY, terminationEvidenceVerifier: () => true,
    integrityKey: INTEGRITY_KEY,
  });
  for (const provider of ['claude', 'codex'] as const) {
    store.putSnapshot(createProviderLimitResult(observation(provider), POLICY, {
      idFactory: () => `snapshot-${provider}`,
    }));
  }
  return { store, root, close: () => store.close() };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('admitRoleInvocation', () => {
  it.each(['brain', 'worker', 'auditor'] as const)(
    'returns executable %s admission only with an allowed primary reservation',
    (role) => {
      const { store, close } = setup();
      const result = admitRoleInvocation(store, {
        invocation: invocation(role), candidateScopes: candidateScopes(),
        buildReservation: selected => reservation(selected),
      });
      expect(result).toMatchObject({
        decision: 'allow',
        reservation: { provider: 'claude', model: 'claude-opus-4-8', decision: 'allow' },
        resolution: { role, selected: { provider: 'claude', model: 'claude-opus-4-8' } },
      });
      expect(result.resolution.limits.evidenceRefs[0]).toMatch(/^provider-limit-reservation:/u);
      close();
    },
  );

  it('turns a primary reservation race into durable fallback admission', () => {
    const { store, close } = setup();
    store.reserve(reservation({ provider: 'claude', model: 'claude-opus-4-8', source: 'config', sequence: 1 }, 80, 'prior'));
    const result = admitRoleInvocation(store, {
      invocation: invocation(), candidateScopes: candidateScopes(),
      buildReservation: selected => reservation(selected),
    });
    expect(result.decision, JSON.stringify(result, null, 2)).toBe('allow');
    expect(result).toMatchObject({
      decision: 'allow',
      reservation: { provider: 'codex', model: 'gpt-5.5', decision: 'allow' },
      resolution: { selected: { provider: 'codex', model: 'gpt-5.5' } },
    });
    expect(result.attempts.map(item => [item.provider, item.reservation?.decision]))
      .toEqual([['claude', 'hold'], ['codex', 'allow']]);
    expect(result.resolution.fallbackChain[0]).toMatchObject({
      fromProvider: 'claude', toProvider: 'codex', reasonCode: 'fallback_limit_hold',
    });
    expect(result.resolution.fallbackChain[0]!.limitEvidenceRefs[0])
      .toMatch(/^provider-limit-reservation:/u);
    close();
  });

  it('returns terminal HOLD when every configured provider loses reservation admission', () => {
    const { store, close } = setup();
    for (const provider of ['claude', 'codex'] as const) {
      store.reserve(reservation({
        provider, model: PROVIDERS[provider].model,
        source: provider === 'claude' ? 'config' : 'fallback', sequence: provider === 'claude' ? 1 : 2,
      }, 80, `prior-${provider}`));
    }
    const result = admitRoleInvocation(store, {
      invocation: invocation(), candidateScopes: candidateScopes(),
      buildReservation: selected => reservation(selected),
    });
    expect(result.decision).toBe('hold');
    expect(result.reservation).toBeNull();
    expect(result.resolution.selected).toBeNull();
    expect(result.attempts).toHaveLength(2);
    close();
  });

  it('never reserves when reachability is unknown', () => {
    const { store, close } = setup();
    const request = invocation();
    const result = admitRoleInvocation(store, {
      invocation: {
        ...request,
        evidence: { claude: evidence('claude', 'unknown'), codex: evidence('codex', 'unknown') },
      },
      candidateScopes: candidateScopes(),
      buildReservation: () => { throw new Error('must not build'); },
    });
    expect(result).toMatchObject({ decision: 'hold', reservation: null, attempts: [] });
    close();
  });

  it('replays the same durable admission idempotently', () => {
    const { store, close } = setup();
    const request = {
      invocation: invocation(), candidateScopes: candidateScopes(),
      buildReservation: (selected: RoleInvocationSelected) => reservation(selected),
    };
    const first = admitRoleInvocation(store, request);
    const replay = admitRoleInvocation(store, request);
    expect(first.decision).toBe('allow');
    expect(replay.decision).toBe('allow');
    expect(replay.reservation?.reservationId).toBe(first.reservation?.reservationId);
    close();
  });

  it('grants provider execution only to the first atomic dispatch claimant', () => {
    const { store, root } = setup();
    const request = {
      invocation: invocation(), candidateScopes: candidateScopes(),
      buildReservation: (selected: RoleInvocationSelected) => reservation(selected),
    };
    const admission = admitRoleInvocation(store, request);
    if (admission.decision !== 'allow') throw new Error('expected admitted invocation');
    const secondStore = new ProviderLimitStore(root, {
      now: () => new Date(T1), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    const event = {
      eventId: 'dispatch-claim', type: 'dispatched' as const, occurredAt: T1,
      fenceTokenHash: 'e'.repeat(64), evidenceRef: 'provider-dispatch:claim-0001',
    };

    const winner = claimAdmittedProviderDispatch(store, admission, event);
    const replay = claimAdmittedProviderDispatch(secondStore, admission, event);
    expect(winner).toMatchObject({
      claimed: true,
      executionGrant: {
        reservationId: admission.reservation.reservationId,
        dispatchEventRef: 'provider-limit-reservation-event:dispatch-claim',
      },
    });
    expect(replay).toEqual({
      claimed: false,
      existingDispatchEvidenceRef: 'provider-limit-reservation-event:dispatch-claim',
    });
    expect(claimAdmittedProviderDispatch(secondStore, admission, {
      ...event, eventId: 'dispatch-loser', evidenceRef: 'provider-dispatch:loser-0001',
    })).toEqual({
      claimed: false,
      existingDispatchEvidenceRef: 'provider-limit-reservation-event:dispatch-claim',
    });
    secondStore.close();
    store.close();
  });

  it('holds a dispatched replay without trying a fallback provider', () => {
    const { store, close } = setup();
    const request = {
      invocation: invocation(), candidateScopes: candidateScopes(),
      buildReservation: (selected: RoleInvocationSelected) => reservation(selected),
    };
    const first = admitRoleInvocation(store, request);
    expect(first.decision).toBe('allow');
    store.appendReservationEvent(reservationQuery('claude'), first.reservation!.reservationId, {
      eventId: 'dispatch-service', type: 'dispatched', occurredAt: T1,
      fenceTokenHash: 'e'.repeat(64), evidenceRef: 'provider-dispatch:admission-0001',
    });

    const replay = admitRoleInvocation(store, request);
    expect(replay).toMatchObject({
      decision: 'hold', reservation: null, reasonCode: 'reservation_not_executable',
      resolution: { selected: null },
    });
    expect(replay.attempts).toHaveLength(1);
    expect(store.getReservation(reservationQuery('codex'), 'service-reservation-codex')).toBeNull();
    close();
  });

  it.each(['consumed', 'released'] as const)(
    'holds a %s replay without opening fallback spend',
    (terminal) => {
      const { store, close } = setup();
      const request = {
        invocation: invocation(), candidateScopes: candidateScopes(),
        buildReservation: (selected: RoleInvocationSelected) => reservation(selected),
      };
      const first = admitRoleInvocation(store, request);
      store.appendReservationEvent(reservationQuery('claude'), first.reservation!.reservationId, {
        eventId: `dispatch-${terminal}`, type: 'dispatched', occurredAt: T1,
        fenceTokenHash: 'e'.repeat(64), evidenceRef: `provider-dispatch:${terminal}-0001`,
      });
      store.appendReservationEvent(reservationQuery('claude'), first.reservation!.reservationId, terminal === 'consumed'
        ? {
            eventId: 'terminal-consumed', type: 'consumed', occurredAt: T1,
            fenceTokenHash: 'e'.repeat(64), evidenceRef: 'provider-usage:terminal-0001',
            actual: [{ windowId: 'tokens-all', unit: 'tokens', amount: 30 }],
          }
        : {
            eventId: 'terminal-released', type: 'released', occurredAt: T1,
            fenceTokenHash: 'e'.repeat(64), evidenceRef: 'provider-release:terminal-0001',
            terminationEvidenceRef: 'runtime-stopped:terminal-0001',
            terminationAuthorityRef: 'termination-authority:v1-00001',
          });

      const replay = admitRoleInvocation(store, request);
      expect(replay).toMatchObject({
        decision: 'hold', reservation: null, reasonCode: 'reservation_not_executable',
        resolution: { selected: null },
      });
      expect(replay.attempts).toHaveLength(1);
      close();
    },
  );

  it('holds an expired admitted replay without trying fallback', () => {
    let now = new Date(T1);
    const { store, close } = setup(() => now);
    const request = {
      invocation: invocation(), candidateScopes: candidateScopes(),
      buildReservation: (selected: RoleInvocationSelected) => reservation(selected),
    };
    expect(admitRoleInvocation(store, request).decision).toBe('allow');
    now = new Date(T6);
    const replay = admitRoleInvocation(store, request);
    expect(replay).toMatchObject({
      decision: 'hold', reservation: null, reasonCode: 'reservation_not_executable',
      resolution: { selected: null },
    });
    expect(replay.attempts).toHaveLength(1);
    close();
  });

  it('treats changed idempotent input as terminal store failure, never fallback', () => {
    const { store, close } = setup();
    const request = {
      invocation: invocation(), candidateScopes: candidateScopes(),
      buildReservation: (selected: RoleInvocationSelected) => reservation(selected),
    };
    expect(admitRoleInvocation(store, request).decision).toBe('allow');
    const conflict = admitRoleInvocation(store, {
      ...request, buildReservation: selected => reservation(selected, 31),
    });
    expect(conflict).toMatchObject({
      decision: 'hold', reservation: null, reasonCode: 'store_failure',
      resolution: { selected: null },
    });
    expect(conflict.attempts).toHaveLength(1);
    expect(store.getReservation(reservationQuery('codex'), 'service-reservation-codex')).toBeNull();
    close();
  });

  it('fails closed at store-open on integrity-key mismatch before fallback is possible', () => {
    const { store, root } = setup();
    const request = {
      invocation: invocation(), candidateScopes: candidateScopes(),
      buildReservation: (selected: RoleInvocationSelected) => reservation(selected),
    };
    expect(admitRoleInvocation(store, request).decision).toBe('allow');
    store.close();
    expect(() => new ProviderLimitStore(root, {
      now: () => new Date(T1), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true,
      integrityKey: 'wrong-admission-integrity-key-00000001',
    })).toThrowError(expect.objectContaining<Partial<ProviderLimitStoreError>>({
      code: 'INTEGRITY_FAILURE',
    }));
  });

  it('enforces one allowed provider winner for a logical invocation', () => {
    const { store, close } = setup();
    expect(store.reserve(reservation({
      provider: 'claude', model: PROVIDERS.claude.model, source: 'config', sequence: 1,
    })).decision).toBe('allow');
    try {
      store.reserve(reservation({
        provider: 'codex', model: PROVIDERS.codex.model, source: 'fallback', sequence: 2,
      }));
      expect.unreachable('second logical winner must fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderLimitStoreError);
      expect(error).toMatchObject({
        code: 'LOGICAL_WINNER_EXISTS',
        evidenceRef: expect.stringMatching(/^provider-limit-reservation:/u),
      });
    }
    close();
  });

  it('rejects a builder that changes the exact selected model', () => {
    const { store, close } = setup();
    expect(() => admitRoleInvocation(store, {
      invocation: invocation(),
      candidateScopes: candidateScopes(),
      buildReservation: selected => ({ ...reservation(selected), model: 'gpt-5.6-sol' }),
    })).toThrowError(ProviderLimitAdmissionError);
    const scopes = candidateScopes();
    expect(() => admitRoleInvocation(store, {
      invocation: invocation(),
      candidateScopes: {
        ...scopes,
        claude: {
          ...scopes.claude!,
          backend: { ...scopes.claude!.backend, executionBackend: 'in-process' },
        },
      },
      buildReservation: selected => reservation(selected),
    })).toThrowError(ProviderLimitAdmissionError);
    close();
  });
});
