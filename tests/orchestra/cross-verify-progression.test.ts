// ─── Cross-verify evidence progression matrix (§12.2 T2b / task 009) ────────
//
// Pins the exact produce→consume chain the candidate gate depends on: a real
// ProviderEvidenceProducer.refresh() writes reachability+limit rows into real
// tmpdir SQLite stores, and the SAME exact-scope queries the admission
// runtime's candidate gate issues (getLatestReachability + getLatestSnapshot +
// toReachabilityEvidence known∧reachable) come back satisfied. Each arm
// asserts the exact typed state transition, never the mere absence of a throw.
// The admission runtime's own gate ladder over rows like these is pinned in
// tests/core/host-role-invocation-admission-runtime.test.ts; the preparation
// orchestrator's hold ladder in cross-verify-evidence-preparation.test.ts.

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
import { ProviderTruthStore, type ExactReachabilityQuery } from '../../src/core/provider-truth-store.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import { toReachabilityEvidence } from '../../src/core/provider-truth.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const roots: string[] = [];
const closers: Array<{ close(): void }> = [];
const policy: ProviderLimitPolicy = {
  policyRef: 'provider-policy:progression-test', warnAtRatio: 0.8, blockAtRatio: 0.95, minimumRemaining: {},
};
const PROFILE_REF = 'execution-profile:progression-test';
const FINGERPRINT = 'f'.repeat(64);
const TTL_MS = 60_000;

function temporaryRoot(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

function request(idempotencyKey = 'caller:progression'): ProviderEvidenceRefreshRequest {
  return {
    idempotencyKey, runId: `run:${idempotencyKey}`, taskId: null, callId: `call:${idempotencyKey}`,
    provider: 'codex', model: 'gpt-5.6-sol', authMode: 'subscription',
    backend: {
      transport: 'cli', executionBackend: 'docker', endpointRefHash: null,
      runtimeFingerprint: FINGERPRINT, executionProfileRef: PROFILE_REF,
    },
    executionProfile: {
      profileRef: PROFILE_REF, provider: 'codex',
      allowed: [{ authMode: 'subscription', transport: 'cli', executionBackend: 'docker' }],
    },
    approval: { evidenceRef: 'approval:progression-test', grantedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-01T01:00:00.000Z' },
    budget: {
      evidenceRef: 'budget:progression-test',
      projection: {
        billingMode: 'subscription',
        maxInputTokens: 32_768,
        maxOutputTokens: 512,
        maxTokens: 33_280,
        timeoutMs: 60_000,
      },
    },
  };
}

/** The exact 12-field query the candidate gate issues over the truth store.
 *  `accountRefHash` comes from the SAME account authority the producer used —
 *  the gate resolves it identically, so the pin threads the produced value. */
function exactQuery(accountRefHash: string | null = null): ExactReachabilityQuery {
  return {
    tenantId: 'tenant-progression-test',
    projectId: 'project-progression-test',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    authMode: 'subscription',
    accountRefHash,
    transport: 'cli',
    executionBackend: 'docker',
    endpointRefHash: null,
    runtimeFingerprint: FINGERPRINT,
    executionProfileRef: PROFILE_REF,
    capability: 'inference',
  };
}

function limitWindow(): ProviderLimitWindow {
  return {
    windowId: 'session', kind: 'session', model: null, unit: 'percent', consumed: 20, remaining: 80, limit: 100,
    reset: { state: 'unknown', at: null, displayRefHash: 'a'.repeat(64) },
  };
}

function fixture(probe: ProviderEvidenceSources['reachability']['probe']) {
  let current = new Date('2026-08-01T00:01:00.000Z');
  const globalRoot = temporaryRoot('deckent-progression-global-');
  const projectRoot = temporaryRoot('deckent-progression-project-');
  const keyring = ProviderAuthorityKeyring.create({
    dataDir: globalRoot, keyringIdFactory: () => 'par-progression-test', keyIdFactory: () => 'pak-progression-test',
    randomBytesFactory: size => Buffer.alloc(size, 0x32),
  }).keyring;
  const truthStore = new ProviderTruthStore(globalRoot, { projectId: 'project-progression-test', integrityAuthority: keyring, now: () => current });
  const limitStore = new ProviderLimitStore(globalRoot, { integrityAuthority: keyring, policyResolver: () => policy, terminationEvidenceVerifier: () => true, now: () => current });
  const receiptLedger = new InvocationReceiptStore(projectRoot, { idFactory: () => 'project-progression-test', now: () => current.toISOString() });
  closers.push(truthStore, limitStore, receiptLedger);
  const sources: ProviderEvidenceSources = {
    account: {
      authorityRef: 'account-authority:progression-test',
      resolve: async input => ({
        state: 'ready', provider: input.provider, authMode: input.authMode, identityKind: 'provider-account', assurance: 'provider-verified', issuer: 'test', stableSubject: 'test-account', evidenceRef: 'account:progression-test', credentialGenerationRef: 'credential:progression-test', backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(input), fetchedAt: current.toISOString(), expiresAt: new Date(current.getTime() + TTL_MS).toISOString(),
      }),
    },
    limit: {
      authorityRef: 'limit-authority:progression-test', kind: 'provider-cli', authority: 'authoritative',
      observe: async () => ({ state: 'known', requiredWindowIds: ['session'], windows: [limitWindow()], source: { operatorApprovalRef: null, evidenceRef: 'limit:progression-test', fetchedAt: current.toISOString(), expiresAt: new Date(current.getTime() + TTL_MS).toISOString(), incorporatedReservationEventRefs: [] } }),
    },
    reachability: { authorityRef: 'reachability-authority:progression-test', probe },
  };
  return {
    truthStore,
    limitStore,
    producer: new ProviderEvidenceProducer({
      tenantId: 'tenant-progression-test', projectId: 'project-progression-test', keyring, truthStore, limitStore, receiptLedger,
      sourceResolver: new ProviderEvidenceSourceRegistry([{ provider: 'codex', authMode: 'subscription', transport: 'cli', executionBackend: 'docker', sources }]),
      policyResolver: () => policy, now: () => current, reachabilityTtlMs: TTL_MS,
    }),
    now: () => current,
    advance(milliseconds: number) { current = new Date(current.getTime() + milliseconds); },
  };
}

afterEach(() => {
  for (const closer of closers.splice(0)) closer.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('cross-verify candidate evidence progression', () => {
  it('absent stores → refresh → the exact candidate-gate reads flip from unavailable to known∧reachable', async () => {
    const probe = vi.fn(async input => ({
      outcome: 'succeeded' as const, calledProvider: input.provider, calledModel: input.model,
      providerRequestRefHash: 'b'.repeat(64), latencyMs: 3,
    }));
    const fx = fixture(probe);

    // BEFORE: both candidate-gate reads are empty — this is the exact
    // candidate_evidence_unavailable precondition (admission-runtime :233-241).
    expect(fx.truthStore.getLatestReachability(exactQuery(), fx.now())).toBeNull();

    const refreshed = await fx.producer.refresh(request());
    expect(refreshed.state).toBe('ready');
    if (refreshed.state !== 'ready') throw new Error('expected ready');
    const accountRefHash = refreshed.reachability.auth.accountRefHash;

    // AFTER: the same exact-scope reads return the produced rows and the
    // evidence predicate promotes to known∧reachable (probe outcome+identity
    // matched — promotion happened in canonical core, not in the source).
    const row = fx.truthStore.getLatestReachability(exactQuery(accountRefHash), fx.now());
    expect(row).not.toBeNull();
    const evidence = toReachabilityEvidence(row!, fx.now());
    expect(evidence).toMatchObject({ state: 'known', reachable: true });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('expiry rollover: stale evidence stops satisfying the gate and a NEW epoch re-proves it', async () => {
    const probe = vi.fn(async input => ({
      outcome: 'succeeded' as const, calledProvider: input.provider, calledModel: input.model,
      providerRequestRefHash: 'b'.repeat(64), latencyMs: 3,
    }));
    const fx = fixture(probe);
    const first = await fx.producer.refresh(request('caller:first'));
    expect(first.state).toBe('ready');
    if (first.state !== 'ready') throw new Error('expected ready');
    const accountRefHash = first.reachability.auth.accountRefHash;

    fx.advance(TTL_MS + 1_000);
    // The row remains readable but the evidence predicate demotes it to
    // stale∧unreachable — the exact candidate_not_eligible precondition.
    const staleRow = fx.truthStore.getLatestReachability(exactQuery(accountRefHash), fx.now());
    expect(staleRow).not.toBeNull();
    expect(toReachabilityEvidence(staleRow!, fx.now())).toMatchObject({ state: 'stale', reachable: false });

    const again = await fx.producer.refresh(request('caller:second'));
    expect(again.state).toBe('ready');
    expect(probe).toHaveBeenCalledTimes(2);
    const freshRow = fx.truthStore.getLatestReachability(exactQuery(accountRefHash), fx.now());
    expect(freshRow).not.toBeNull();
    expect(toReachabilityEvidence(freshRow!, fx.now())).toMatchObject({ state: 'known', reachable: true });
  });

  it('negative-cooldown refusal: a failed probe blocks a premature new epoch with a typed cooldown', async () => {
    const probe = vi.fn(async () => ({
      outcome: 'backend-unreachable' as const, calledProvider: null, calledModel: null,
      providerRequestRefHash: null, latencyMs: 5,
    }));
    const fx = fixture(probe);
    const first = await fx.producer.refresh(request('caller:first'));
    expect(first).toMatchObject({ state: 'hold', reasonCode: 'probe_unreachable' });

    const second = await fx.producer.refresh(request('caller:second'));
    expect(second).toMatchObject({ state: 'hold', reasonCode: 'probe_cooldown' });
    if (second.state !== 'hold') throw new Error('expected hold');
    expect(second.deferralEvidenceRef).toBeTruthy();
    expect(probe).toHaveBeenCalledTimes(1);

    // The negative row must never satisfy the candidate gate's predicate.
    const row = fx.truthStore.getLatestReachability(exactQuery(), fx.now());
    if (row) expect(toReachabilityEvidence(row, fx.now()).reachable).toBe(false);
  });

  it('every preparation hold reason renders a paired en+tr remedy naming the unblocking action', () => {
    const reasons = [
      'provider_authority_unavailable',
      'backend_identity_unavailable',
      'budget_profile_unavailable',
      'approval_authority_unavailable',
      'approval_undecided',
      'approval_rejected',
      'approval_untrusted',
      'approval_consumed',
      'evidence_refresh_hold',
    ] as const;
    for (const reason of reasons) {
      const en = getMessage(`xverify.remedy.${reason}`, 'en', { requestId: 'aprp-x', producerReason: 'probe_cooldown' });
      const tr = getMessage(`xverify.remedy.${reason}`, 'tr', { requestId: 'aprp-x', producerReason: 'probe_cooldown' });
      // Both languages resolve to REAL text (an unknown key echoes the key back).
      expect(en, `en remedy for ${reason}`).not.toContain('xverify.remedy.');
      expect(tr, `tr remedy for ${reason}`).not.toContain('xverify.remedy.');
      expect(en).not.toEqual(tr);
    }
  });
});
