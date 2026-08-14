import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deriveProviderAccountBackendScopeRefHash,
  ProviderEvidenceProducer,
  type ProviderEvidenceRefreshRequest,
  type ProviderEvidenceSources,
} from '../../src/core/provider-evidence-producer.js';
import { ProviderEvidenceSourceRegistry } from '../../src/core/provider-evidence-source-registry.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import { ProviderLimitStore } from '../../src/core/provider-limit-store.js';
import type { ProviderLimitPolicy, ProviderLimitWindow } from '../../src/core/provider-limit-truth.js';
import { ProviderTruthStore } from '../../src/core/provider-truth-store.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';

const roots: string[] = [];
const closers: Array<{ close(): void }> = [];
const policy: ProviderLimitPolicy = {
  policyRef: 'provider-policy:freshness-test', warnAtRatio: 0.8, blockAtRatio: 0.95, minimumRemaining: {},
};

function temporaryRoot(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

function request(idempotencyKey = 'caller:one'): ProviderEvidenceRefreshRequest {
  return {
    idempotencyKey, runId: `run:${idempotencyKey}`, taskId: null, callId: `call:${idempotencyKey}`,
    provider: 'claude', model: 'claude-fable-5', authMode: 'subscription',
    backend: {
      transport: 'cli', executionBackend: 'host-subprocess', endpointRefHash: 'e'.repeat(64),
      runtimeFingerprint: 'f'.repeat(64), executionProfileRef: 'execution-profile:freshness-test',
    },
    executionProfile: {
      profileRef: 'execution-profile:freshness-test', provider: 'claude',
      allowed: [{ authMode: 'subscription', transport: 'cli', executionBackend: 'host-subprocess' }],
    },
    approval: { evidenceRef: 'approval:freshness-test', grantedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-01T01:00:00.000Z' },
    budget: {
      evidenceRef: 'budget:freshness-test',
      projection: {
        billingMode: 'subscription',
        maxInputTokens: 64,
        maxOutputTokens: 16,
        maxTokens: 80,
        timeoutMs: 30_000,
      },
    },
  };
}

function limitWindow(): ProviderLimitWindow {
  return {
    windowId: 'session', kind: 'session', model: null, unit: 'percent', consumed: 20, remaining: 80, limit: 100,
    reset: { state: 'unknown', at: null, displayRefHash: 'a'.repeat(64) },
  };
}

function fixture(probe: ProviderEvidenceSources['reachability']['probe'], ttl = 60_000) {
  let current = new Date('2026-08-01T00:01:00.000Z');
  const globalRoot = temporaryRoot('deckent-freshness-global-');
  const projectRoot = temporaryRoot('deckent-freshness-project-');
  const keyring = ProviderAuthorityKeyring.create({
    dataDir: globalRoot, keyringIdFactory: () => 'par-freshness-test', keyIdFactory: () => 'pak-freshness-test',
    randomBytesFactory: size => Buffer.alloc(size, 0x31),
  }).keyring;
  const truthStore = new ProviderTruthStore(globalRoot, { projectId: 'project-freshness-test', integrityAuthority: keyring, now: () => current });
  const limitStore = new ProviderLimitStore(globalRoot, { integrityAuthority: keyring, policyResolver: () => policy, terminationEvidenceVerifier: () => true, now: () => current });
  const receiptLedger = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-freshness-test', now: () => current.toISOString() });
  closers.push(truthStore, limitStore, receiptLedger);
  const sources: ProviderEvidenceSources = {
    account: {
      authorityRef: 'account-authority:freshness-test',
      resolve: async input => ({
        state: 'ready', provider: input.provider, authMode: input.authMode, identityKind: 'provider-account', assurance: 'provider-verified', issuer: 'test', stableSubject: 'test-account', evidenceRef: 'account:freshness-test', credentialGenerationRef: 'credential:freshness-test', backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(input), fetchedAt: current.toISOString(), expiresAt: new Date(current.getTime() + 60_000).toISOString(),
      }),
    },
    limit: {
      authorityRef: 'limit-authority:freshness-test', kind: 'provider-cli', authority: 'authoritative',
      observe: async () => ({ state: 'known', requiredWindowIds: ['session'], windows: [limitWindow()], source: { operatorApprovalRef: null, evidenceRef: 'limit:freshness-test', fetchedAt: current.toISOString(), expiresAt: new Date(current.getTime() + 60_000).toISOString(), incorporatedReservationEventRefs: [] } }),
    },
    reachability: { authorityRef: 'reachability-authority:freshness-test', probe },
  };
  return {
    producer: new ProviderEvidenceProducer({
      tenantId: 'tenant-freshness-test', projectId: 'project-freshness-test', keyring, truthStore, limitStore, receiptLedger,
      sourceResolver: new ProviderEvidenceSourceRegistry([{ provider: 'claude', authMode: 'subscription', transport: 'cli', executionBackend: 'host-subprocess', sources }]),
      policyResolver: () => policy, now: () => current, reachabilityTtlMs: ttl,
    }),
    advance(milliseconds: number) { current = new Date(current.getTime() + milliseconds); },
  };
}

afterEach(() => {
  for (const closer of closers.splice(0)) closer.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ProviderEvidenceProducer freshness epochs', () => {
  it('reuses fresh exact-scope evidence without another model probe', async () => {
    const probe = vi.fn(async input => ({ outcome: 'succeeded' as const, calledProvider: input.provider, calledModel: input.model, providerRequestRefHash: 'b'.repeat(64), latencyMs: 1 }));
    const fx = fixture(probe);
    expect((await fx.producer.refresh(request('caller:first'))).state).toBe('ready');
    expect((await fx.producer.refresh(request('caller:second'))).state).toBe('ready');
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('lets a same-epoch follower reuse the winner instead of reporting replay blockage', async () => {
    let release!: () => void;
    let signal!: () => void;
    const started = new Promise<void>(resolve => { signal = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const probe = vi.fn(async input => {
      signal();
      await blocked;
      return { outcome: 'succeeded' as const, calledProvider: input.provider, calledModel: input.model, providerRequestRefHash: 'b'.repeat(64), latencyMs: 1 };
    });
    const fx = fixture(probe);
    const winner = fx.producer.refresh(request('caller:winner'));
    await started;
    const follower = fx.producer.refresh(request('caller:follower'));
    release();
    const [winnerResult, followerResult] = await Promise.all([winner, follower]);
    expect(winnerResult.state).toBe('ready');
    expect(followerResult).toMatchObject({ state: 'ready' });
    expect(probe).toHaveBeenCalledTimes(1);
    if (winnerResult.state !== 'ready' || followerResult.state !== 'ready') throw new Error('expected ready results');
    expect(followerResult.receiptRef.invocationId).toBe(winnerResult.receiptRef.invocationId);
  });

  it('holds negative evidence through cooldown and opens a new immutable epoch after expiry', async () => {
    const probe = vi.fn(async input => ({ outcome: 'succeeded' as const, calledProvider: input.provider, calledModel: 'claude-wrong-model', providerRequestRefHash: 'b'.repeat(64), latencyMs: 1 }));
    const fx = fixture(probe, 1_000);
    const first = await fx.producer.refresh(request('caller:negative'));
    expect(first).toMatchObject({ state: 'hold', reasonCode: 'probe_unreachable' });
    const cooling = await fx.producer.refresh(request('caller:cooling'));
    expect(cooling).toMatchObject({ state: 'hold', reasonCode: 'probe_cooldown', deferralEvidenceRef: expect.stringMatching(/^provider-reachability:/u) });
    expect(probe).toHaveBeenCalledTimes(1);
    fx.advance(1_001);
    const rollover = await fx.producer.refresh(request('caller:rollover'));
    expect(rollover).toMatchObject({ state: 'hold', reasonCode: 'probe_unreachable' });
    expect(probe).toHaveBeenCalledTimes(2);
    if (!first.reachability || !rollover.reachability) throw new Error('expected immutable reachability evidence');
    expect(rollover.reachability.idempotencyKey).not.toBe(first.reachability.idempotencyKey);
  });
});
