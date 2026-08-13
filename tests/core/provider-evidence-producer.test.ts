import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deriveProviderAccountBackendScopeRefHash,
  ProviderEvidenceProducer,
  type ProviderAccountIdentityReady,
  type ProviderAccountIdentityRequest,
  type ProviderEvidenceRefreshRequest,
  type ProviderEvidenceSources,
} from '../../src/core/provider-evidence-producer.js';
import { ProviderEvidenceSourceRegistry } from '../../src/core/provider-evidence-source-registry.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import { ProviderLimitStore } from '../../src/core/provider-limit-store.js';
import {
  type ProviderLimitPolicy,
  type ProviderLimitWindow,
} from '../../src/core/provider-limit-truth.js';
import { ProviderTruthStore } from '../../src/core/provider-truth-store.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';

const T0 = new Date('2026-07-23T08:00:00.000Z');
const T1 = '2026-07-23T08:01:00.000Z';
const ENDPOINT_HASH = 'e'.repeat(64);
const RUNTIME_HASH = 'f'.repeat(64);
const RESET_HASH = 'a'.repeat(64);
const roots: string[] = [];
const closers: Array<{ close(): void }> = [];

const POLICY: ProviderLimitPolicy = {
  policyRef: 'provider-policy:test-0001',
  warnAtRatio: 0.8,
  blockAtRatio: 0.95,
  minimumRemaining: {},
};

function root(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

function limitWindow(consumed = 20): ProviderLimitWindow {
  return {
    windowId: 'session',
    kind: 'session',
    model: null,
    unit: 'percent',
    consumed,
    remaining: 100 - consumed,
    limit: 100,
    reset: { state: 'unknown', at: null, displayRefHash: RESET_HASH },
  };
}

function request(overrides: Partial<ProviderEvidenceRefreshRequest> = {}): ProviderEvidenceRefreshRequest {
  return {
    idempotencyKey: 'probe-refresh:00000001',
    runId: 'provider-probe-run-0001',
    taskId: null,
    callId: 'provider-probe-call-0001',
    provider: 'claude',
    model: 'claude-fable-5',
    authMode: 'subscription',
    backend: {
      transport: 'cli',
      executionBackend: 'host-subprocess',
      endpointRefHash: ENDPOINT_HASH,
      runtimeFingerprint: RUNTIME_HASH,
      executionProfileRef: 'execution-profile:probe-0001',
    },
    executionProfile: {
      profileRef: 'execution-profile:probe-0001',
      provider: 'claude',
      allowed: [{
        authMode: 'subscription',
        transport: 'cli',
        executionBackend: 'host-subprocess',
      }],
    },
    approval: {
      evidenceRef: 'approval:provider-probe-0001',
      grantedAt: '2026-07-23T07:59:00.000Z',
      expiresAt: T1,
    },
    budget: {
      evidenceRef: 'budget:provider-probe-0001',
      projection: {
        billingMode: 'subscription',
        maxInputTokens: 64,
        maxOutputTokens: 16,
        maxTokens: 80,
        timeoutMs: 30_000,
      },
    },
    ...overrides,
  };
}

function verifiedAccountIdentity(
  input: ProviderAccountIdentityRequest,
  overrides: Partial<ProviderAccountIdentityReady> = {},
): ProviderAccountIdentityReady {
  return {
    state: 'ready',
    provider: input.provider,
    authMode: input.authMode,
    identityKind: 'provider-account',
    assurance: 'provider-verified',
    issuer: 'provider.example',
    stableSubject: 'raw-account@example.invalid',
    evidenceRef: 'account-evidence:test-0001',
    credentialGenerationRef: 'credential-generation:test-0001',
    backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(input),
    fetchedAt: T0.toISOString(),
    expiresAt: T1,
    ...overrides,
  };
}

function sources(overrides: Partial<ProviderEvidenceSources> = {}): ProviderEvidenceSources {
  return {
    account: {
      authorityRef: 'account-authority:test-0001',
      resolve: async input => verifiedAccountIdentity(input),
    },
    limit: {
      authorityRef: 'limit-authority:test-0001',
      kind: 'provider-cli',
      authority: 'authoritative',
      observe: async () => ({
        state: 'known',
        requiredWindowIds: ['session'],
        windows: [limitWindow()],
        source: {
          operatorApprovalRef: null,
          evidenceRef: 'provider-limit:source-0001',
          fetchedAt: T0.toISOString(),
          expiresAt: T1,
          incorporatedReservationEventRefs: [],
        },
      }),
    },
    reachability: {
      authorityRef: 'reachability-authority:test-0001',
      probe: async input => ({
        outcome: 'succeeded',
        calledProvider: input.provider,
        calledModel: input.model,
        providerRequestRefHash: 'b'.repeat(64),
        latencyMs: 4,
      }),
    },
    ...overrides,
  };
}

function fixture(sourceOverrides: Partial<ProviderEvidenceSources> = {}): {
  producer: ProviderEvidenceProducer;
  truthStore: ProviderTruthStore;
  limitStore: ProviderLimitStore;
  receiptStore: InvocationReceiptStore;
  globalRoot: string;
  projectRoot: string;
} {
  const globalRoot = root('deckent-evidence-global-');
  const projectRoot = root('deckent-evidence-project-');
  const keyring = ProviderAuthorityKeyring.create({
    dataDir: globalRoot,
    keyringIdFactory: () => 'par-evidence-0001',
    keyIdFactory: () => 'pak-evidence-0001',
    randomBytesFactory: size => Buffer.alloc(size, 0x31),
  }).keyring;
  const truthStore = new ProviderTruthStore(globalRoot, {
    projectId: 'project-evidence-0001',
    integrityAuthority: keyring,
    now: () => T0,
  });
  const limitStore = new ProviderLimitStore(globalRoot, {
    integrityAuthority: keyring,
    policyResolver: () => POLICY,
    terminationEvidenceVerifier: () => true,
    now: () => T0,
  });
  const receiptStore = new InvocationReceiptStore(projectRoot, {
    idFactory: () => 'project-evidence-0001',
    now: () => T0.toISOString(),
  });
  closers.push(truthStore, limitStore, receiptStore);
  const selectedSources = sources(sourceOverrides);
  return {
    producer: new ProviderEvidenceProducer({
      tenantId: 'tenant-a',
      projectId: 'project-evidence-0001',
      keyring,
      truthStore,
      limitStore,
      receiptLedger: receiptStore,
      sourceResolver: new ProviderEvidenceSourceRegistry([
        {
          provider: 'claude',
          authMode: 'subscription',
          transport: 'cli',
          executionBackend: 'host-subprocess',
          sources: selectedSources,
        },
        {
          provider: 'ollama',
          authMode: 'local',
          transport: 'local-runtime',
          executionBackend: 'in-process',
          sources: selectedSources,
        },
      ]),
      policyResolver: () => POLICY,
      now: () => T0,
    }),
    truthStore,
    limitStore,
    receiptStore,
    globalRoot,
    projectRoot,
  };
}

afterEach(() => {
  for (const item of closers.splice(0)) item.close();
  for (const item of roots.splice(0)) rmSync(item, { recursive: true, force: true });
});

describe('ProviderEvidenceProducer', () => {
  it('holds an unregistered exact source scope before any evidence source runs', async () => {
    const accountResolve = vi.fn();
    const limitObserve = vi.fn();
    const reachabilityProbe = vi.fn();
    const fx = fixture({
      account: { authorityRef: 'account-authority:missing-scope', resolve: accountResolve },
      limit: {
        ...sources().limit,
        authorityRef: 'limit-authority:missing-scope',
        observe: limitObserve,
      },
      reachability: {
        authorityRef: 'reachability-authority:missing-scope',
        probe: reachabilityProbe,
      },
    });

    const result = await fx.producer.refresh(request({
      backend: { ...request().backend, executionBackend: 'docker' },
      executionProfile: {
        ...request().executionProfile,
        allowed: [{
          authMode: 'subscription',
          transport: 'cli',
          executionBackend: 'docker',
        }],
      },
    }));

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'source_bundle_unavailable',
      limit: null,
      reachability: null,
      receiptRef: null,
    });
    expect(accountResolve).not.toHaveBeenCalled();
    expect(limitObserve).not.toHaveBeenCalled();
    expect(reachabilityProbe).not.toHaveBeenCalled();
  });

  it('persists limit before one receipt-bound exact probe and exposes no raw principal', async () => {
    const order: string[] = [];
    const limitProbe = vi.fn(async () => {
      order.push('limit');
      return {
        state: 'known' as const,
        requiredWindowIds: ['session'],
        windows: [limitWindow()],
        source: {
          operatorApprovalRef: null,
          evidenceRef: 'provider-limit:source-0001',
          fetchedAt: T0.toISOString(),
          expiresAt: T1,
          incorporatedReservationEventRefs: [],
        },
      };
    });
    const exactProbe = vi.fn(async (input) => {
      order.push('reachability');
      expect(input.admission.limits).toMatchObject({ state: 'known', decision: 'allow' });
      return {
        outcome: 'succeeded' as const,
        calledProvider: input.provider,
        calledModel: input.model,
        providerRequestRefHash: 'b'.repeat(64),
        latencyMs: 4,
      };
    });
    const fx = fixture({
      limit: { ...sources().limit, observe: limitProbe },
      reachability: { ...sources().reachability, probe: exactProbe },
    });

    const result = await fx.producer.refresh(request());
    expect(result).toMatchObject({
      state: 'ready',
      limit: { state: 'known', decision: 'allow', provider: 'claude' },
      reachability: {
        state: 'known',
        liveProven: true,
        observed: { requestedModel: 'claude-fable-5', calledModel: 'claude-fable-5' },
      },
    });
    expect(order).toEqual(['limit', 'reachability']);
    expect(limitProbe).toHaveBeenCalledTimes(1);
    expect(exactProbe).toHaveBeenCalledTimes(1);
    if (result.state !== 'ready') throw new Error('expected ready evidence');

    expect(fx.truthStore.getReachability(
      { tenantId: 'tenant-a', projectId: 'project-evidence-0001' },
      result.reachability.reachabilityId,
      T0,
    )).toEqual(result.reachability);
    expect(fx.limitStore.getLatestSnapshot({
      tenantId: 'tenant-a',
      provider: 'claude',
      accountRefHash: result.limit.accountRefHash,
      quotaScopeRefHash: result.limit.quotaScopeRefHash,
      authMode: 'subscription',
      backend: result.limit.backend,
    }, T0)).toEqual(result.limit);
    expect(fx.receiptStore.get(result.receiptRef, result.receiptRef.invocationId)).toMatchObject({
      receipt: {
        purpose: 'reachability-probe',
        called: { provider: 'claude', model: 'claude-fable-5' },
        limits: { state: 'known' },
      },
      transportOutcome: 'succeeded',
      consumerOutcome: 'accepted',
      events: [
        { type: 'dispatch_started' },
        { type: 'transport_settled' },
        { type: 'consumer_settled' },
      ],
    });

    const persisted = [
      readFileSync(join(fx.globalRoot, 'provider-truth.db')).toString('utf8'),
      readFileSync(join(fx.globalRoot, 'provider-limits.db')).toString('utf8'),
      readFileSync(join(fx.projectRoot, '.deckent', 'runtime', 'invocations.db')).toString('utf8'),
    ].join('\n');
    expect(persisted).not.toContain('raw-account@example.invalid');
  });

  it('persists unavailable limit evidence and never invokes a model when the limit source fails', async () => {
    const exactProbe = vi.fn();
    const fx = fixture({
      limit: {
        ...sources().limit,
        observe: async () => {
          throw Object.assign(new Error('contains-secret-output'), { code: 'SOURCE_DOWN' });
        },
      },
      reachability: { ...sources().reachability, probe: exactProbe },
    });
    const result = await fx.producer.refresh(request());
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'limit_source_failure',
      limit: { state: 'unavailable', decision: 'hold' },
      receiptRef: null,
    });
    expect(exactProbe).not.toHaveBeenCalled();
    if (!result.limit) throw new Error('expected unavailable limit evidence');
    expect(fx.limitStore.getLatestSnapshot({
      tenantId: result.limit.tenantId,
      provider: result.limit.provider,
      accountRefHash: result.limit.accountRefHash,
      quotaScopeRefHash: result.limit.quotaScopeRefHash,
      authMode: result.limit.authMode,
      backend: result.limit.backend,
    }, T0)).toEqual(result.limit);
    expect(readFileSync(join(fx.globalRoot, 'provider-limits.db')).toString('utf8'))
      .not.toContain('contains-secret-output');
  });

  it('holds credential-only identity evidence before limit, probe, or receipt declaration', async () => {
    const limitProbe = vi.fn();
    const exactProbe = vi.fn();
    const fx = fixture({
      account: {
        authorityRef: 'account-authority:test-credential-only',
        resolve: async () => ({
          state: 'credential-only',
          credentialGenerationRef: 'credential-generation:test-only',
          evidenceRef: 'account-evidence:credential-only',
          fetchedAt: T0.toISOString(),
          expiresAt: T1,
        }),
      },
      limit: { ...sources().limit, observe: limitProbe },
      reachability: { ...sources().reachability, probe: exactProbe },
    });

    const result = await fx.producer.refresh(request());
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'account_authority_hold',
      limit: null,
      reachability: null,
      receiptRef: null,
    });
    expect(limitProbe).not.toHaveBeenCalled();
    expect(exactProbe).not.toHaveBeenCalled();
  });

  it.each([
    ['provider mismatch', (input: ProviderAccountIdentityRequest) => (
      verifiedAccountIdentity(input, { provider: 'codex' })
    )],
    ['auth mismatch', (input: ProviderAccountIdentityRequest) => (
      verifiedAccountIdentity(input, { authMode: 'api' })
    )],
    ['backend mismatch', (input: ProviderAccountIdentityRequest) => (
      verifiedAccountIdentity(input, { backendScopeRefHash: 'f'.repeat(64) })
    )],
    ['stale evidence', (input: ProviderAccountIdentityRequest) => (
      verifiedAccountIdentity(input, {
        fetchedAt: '2026-07-23T07:58:00.000Z',
        expiresAt: '2026-07-23T07:59:00.000Z',
      })
    )],
    ['overlong TTL', (input: ProviderAccountIdentityRequest) => (
      verifiedAccountIdentity(input, { expiresAt: '2026-07-23T08:02:00.000Z' })
    )],
  ])('holds %s account evidence before downstream calls', async (_name, identityFactory) => {
    const limitProbe = vi.fn();
    const exactProbe = vi.fn();
    const fx = fixture({
      account: {
        authorityRef: 'account-authority:test-invalid',
        resolve: async input => identityFactory(input),
      },
      limit: { ...sources().limit, observe: limitProbe },
      reachability: { ...sources().reachability, probe: exactProbe },
    });

    const result = await fx.producer.refresh(request());
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'account_authority_hold',
      limit: null,
      reachability: null,
      receiptRef: null,
    });
    expect(limitProbe).not.toHaveBeenCalled();
    expect(exactProbe).not.toHaveBeenCalled();
  });

  it('keeps local execution accountless and never invokes the account authority', async () => {
    const accountResolve = vi.fn();
    const fx = fixture({
      account: {
        authorityRef: 'account-authority:test-local-unused',
        resolve: accountResolve,
      },
    });
    const localRequest = request({
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
      authMode: 'local',
      backend: {
        ...request().backend,
        transport: 'local-runtime',
        executionBackend: 'in-process',
      },
      executionProfile: {
        profileRef: 'execution-profile:probe-0001',
        provider: 'ollama',
        allowed: [{
          authMode: 'local',
          transport: 'local-runtime',
          executionBackend: 'in-process',
        }],
      },
    });
    const result = await fx.producer.refresh(localRequest);
    expect(accountResolve).not.toHaveBeenCalled();
    expect(result).toMatchObject({ limit: { accountRefHash: null } });
  });

  it('admits the bounded probe on an advisory limit under the block ratio, keeping the durable snapshot advisory (§12.2 Öneri-A)', async () => {
    // Default window = 20% consumed, block ratio 0.95 → under block. An advisory
    // usage read (codex/claude CLI) no longer blocks the bounded reachability
    // probe: the probe runs and promotes to liveProven, while the DURABLE limit
    // snapshot stays advisory `unknown/hold` so heavy-task admission is unaffected.
    const exactProbe = vi.fn(async input => ({
      outcome: 'succeeded' as const,
      calledProvider: input.provider,
      calledModel: input.model,
      providerRequestRefHash: 'b'.repeat(64),
      latencyMs: 2,
    }));
    const fx = fixture({
      limit: { ...sources().limit, authority: 'advisory' },
      reachability: { ...sources().reachability, probe: exactProbe },
    });
    const result = await fx.producer.refresh(request());
    expect(exactProbe).toHaveBeenCalledOnce();
    expect(result.state).toBe('ready');
    // The durable snapshot is still the advisory truth, not an authoritative allow.
    expect(result.limit).toMatchObject({ state: 'unknown', decision: 'hold' });
    if (result.state === 'ready') {
      expect(result.reachability).toMatchObject({ liveProven: true, reachable: true });
    }
  });

  it('holds a blocked advisory limit WITHOUT running the probe (fails closed at the block ratio)', async () => {
    const exactProbe = vi.fn();
    const fx = fixture({
      limit: {
        ...sources().limit,
        authority: 'advisory',
        observe: async () => ({
          state: 'known' as const,
          requiredWindowIds: ['session'],
          windows: [limitWindow(96)], // 96% consumed ≥ 0.95 block ratio
          source: {
            operatorApprovalRef: null,
            evidenceRef: 'provider-limit:source-blocked',
            fetchedAt: T0.toISOString(),
            expiresAt: T1,
            incorporatedReservationEventRefs: [],
          },
        }),
      },
      reachability: { ...sources().reachability, probe: exactProbe },
    });
    const result = await fx.producer.refresh(request());
    expect(result).toMatchObject({ state: 'hold', reasonCode: 'limit_hold' });
    expect(exactProbe).not.toHaveBeenCalled();
  });

  it('threads exact model and verified account provenance into the limit source', async () => {
    const defaultSources = sources();
    const limitObserve = vi.fn(defaultSources.limit.observe);
    const fx = fixture({
      limit: { ...defaultSources.limit, observe: limitObserve },
    });

    await fx.producer.refresh(request());

    expect(limitObserve).toHaveBeenCalledOnce();
    expect(limitObserve).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'claude',
      model: 'claude-fable-5',
      authMode: 'subscription',
      accountRefHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      accountEvidence: {
        identityEvidenceRef: 'account-evidence:test-0001',
        credentialGenerationRef: 'credential-generation:test-0001',
        backendScopeRefHash: deriveProviderAccountBackendScopeRefHash({
          tenantId: 'tenant-test',
          provider: 'claude',
          authMode: 'subscription',
          backend: request().backend,
          executionProfile: request().executionProfile,
        }),
      },
      backend: {
        transport: 'cli',
        executionBackend: 'host-subprocess',
        endpointRefHash: ENDPOINT_HASH,
      },
    }));
  });

  it('records successful transport but rejects an exact-model mismatch', async () => {
    const fx = fixture({
      reachability: {
        ...sources().reachability,
        probe: async input => ({
          outcome: 'succeeded',
          calledProvider: input.provider,
          calledModel: 'claude-sonnet-5',
          providerRequestRefHash: 'c'.repeat(64),
          latencyMs: 3,
        }),
      },
    });
    const result = await fx.producer.refresh(request());
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'probe_unreachable',
      reachability: { reasonCode: 'model_mismatch', liveProven: false },
    });
    expect(result.receiptRef).not.toBeNull();
    expect(fx.receiptStore.get(result.receiptRef!, result.receiptRef!.invocationId)).toMatchObject({
      transportOutcome: 'succeeded',
      consumerOutcome: 'rejected',
    });
  });

  it('allows exactly one model invocation for concurrent identical refreshes', async () => {
    let releaseProbe!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const released = new Promise<void>(resolve => { releaseProbe = resolve; });
    const exactProbe = vi.fn(async input => {
      signalStarted();
      await released;
      return {
        outcome: 'succeeded' as const,
        calledProvider: input.provider,
        calledModel: input.model,
        providerRequestRefHash: 'd'.repeat(64),
        latencyMs: 5,
      };
    });
    const fx = fixture({
      reachability: { ...sources().reachability, probe: exactProbe },
    });

    const first = fx.producer.refresh(request());
    await started;
    const second = fx.producer.refresh(request());
    const secondResult = await second;
    releaseProbe();
    const firstResult = await first;

    expect(firstResult.state).toBe('ready');
    // §12.2 clause 3 supersede (sprint-527): a same-epoch follower is a typed
    // bounded singleflight deferral, never an operator-facing replay error.
    expect(secondResult).toMatchObject({
      state: 'hold',
      reasonCode: 'probe_singleflight_deferred',
      receiptRef: null,
    });
    expect(exactProbe).toHaveBeenCalledTimes(1);
    if (firstResult.state !== 'ready') throw new Error('expected one ready producer');
    expect(fx.receiptStore.get(firstResult.receiptRef, firstResult.receiptRef.invocationId)?.events)
      .toHaveLength(3);
  });

  it('terminally rejects the receipt when truth persistence fails after the provider call', async () => {
    const exactProbe = vi.fn(async input => ({
      outcome: 'succeeded' as const,
      calledProvider: input.provider,
      calledModel: input.model,
      providerRequestRefHash: 'd'.repeat(64),
      latencyMs: 5,
    }));
    const fx = fixture({
      reachability: { ...sources().reachability, probe: exactProbe },
    });
    vi.spyOn(fx.truthStore, 'putReachability').mockImplementation(() => {
      throw Object.assign(new Error('disk details must not persist'), { code: 'STORE_WRITE_FAILED' });
    });

    const result = await fx.producer.refresh(request());
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'authority_failure',
      receiptRef: {
        tenantId: 'tenant-a',
        projectId: 'project-evidence-0001',
      },
    });
    expect(exactProbe).toHaveBeenCalledTimes(1);
    if (!result.receiptRef) throw new Error('expected terminal probe receipt');
    expect(fx.receiptStore.get(result.receiptRef, result.receiptRef.invocationId)).toMatchObject({
      transportOutcome: 'succeeded',
      consumerOutcome: 'rejected',
      events: [
        { type: 'dispatch_started' },
        { type: 'transport_settled' },
        {
          type: 'consumer_settled',
          payload: { outcome: 'rejected', reasonCode: 'validation_failed' },
        },
      ],
    });
    expect(readFileSync(join(fx.projectRoot, '.deckent', 'runtime', 'invocations.db')).toString('utf8'))
      .not.toContain('disk details must not persist');
  });

  it('holds a refresh whose budget projection violates the billing-mode contract, before any probe', async () => {
    const exactProbe = vi.fn();
    const fx = fixture({
      reachability: { ...sources().reachability, probe: exactProbe },
    });

    // metered-api without an owner-authored usd ceiling is exactly the arm the
    // discriminated projection forbids — a flat/fabricated budget must never
    // reach the provider.
    const result = await fx.producer.refresh(request({
      budget: {
        evidenceRef: 'budget:provider-probe-0001',
        projection: {
          billingMode: 'metered-api',
          maxInputTokens: 64,
          maxOutputTokens: 16,
          maxTokens: 80,
          timeoutMs: 30_000,
        } as never,
      },
    }));

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'authority_failure',
    });
    expect(exactProbe).not.toHaveBeenCalled();
  });
});
