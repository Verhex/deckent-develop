import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveReachabilityProbePurposeProfile,
  type ReachabilityProbePurposeProfile,
} from '../../src/core/execution-budget-policy.js';
import { deriveReachabilityProbeBudget } from '../../src/core/execution-budget-derivation.js';
import { ExecutionAdmissionStore, type ExecutionAdmissionInput } from '../../src/core/execution-admission.js';
import { probeExactModelReachability, type ReachabilityProbeRequest } from '../../src/core/provider-truth.js';

function policy(profile?: ReachabilityProbePurposeProfile) {
  return {
    roles: { worker: { default: { maxTurns: 1 } } },
    landing: { reserve_ratio: 0.5 },
    ...(profile ? { purposes: { 'reachability-probe': profile } } : {}),
  };
}

function profile(): ReachabilityProbePurposeProfile {
  return { maxInputTokens: 64, maxOutputTokens: 16, maxTokens: 80, timeoutMs: 1_000, maxUsd: 0.02 };
}

describe('ReachabilityProbeBudget projection', () => {
  it.each(['subscription', 'free', 'local'] as const)('keeps USD absent for %s billing from tmpdir-authored config', billingMode => {
    const root = mkdtempSync(join(tmpdir(), 'reachability-probe-budget-'));
    try {
      writeFileSync(join(root, 'config.json'), JSON.stringify(policy(profile())));
      const resolved = resolveReachabilityProbePurposeProfile({
        policy: JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')), billingMode,
      });
      expect(resolved.state).toBe('available');
      if (resolved.state !== 'available') return;
      const budget = deriveReachabilityProbeBudget({ executionBudget: {}, billingMode, purposeProfile: resolved.profile });
      expect(budget).not.toHaveProperty('maxUsd');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('returns typed unavailable outcomes for absent profile and missing metered USD', () => {
    expect(resolveReachabilityProbePurposeProfile({ policy: policy(), billingMode: 'subscription' }))
      .toMatchObject({ state: 'unavailable', reasonCode: 'reachability-probe-profile-missing' });
    const withoutUsd = { ...profile() }; delete withoutUsd.maxUsd;
    expect(resolveReachabilityProbePurposeProfile({ policy: policy(withoutUsd), billingMode: 'metered-api' }))
      .toMatchObject({ state: 'unavailable', reasonCode: 'metered-api-usd-ceiling-missing' });
  });

  it('uses owner USD only for metered API and admits the derived projection without putting USD on ExecutionBudget', () => {
    const resolved = resolveReachabilityProbePurposeProfile({ policy: policy(profile()), billingMode: 'metered-api' });
    expect(resolved.state).toBe('available');
    if (resolved.state !== 'available') return;
    const projection = deriveReachabilityProbeBudget({ executionBudget: { maxUsd: 0.01 }, billingMode: 'metered-api', purposeProfile: resolved.profile });
    expect(projection).toMatchObject({ billingMode: 'metered-api', maxUsd: 0.01 });
    const root = mkdtempSync(join(tmpdir(), 'reachability-admission-'));
    try {
      const store = new ExecutionAdmissionStore(root, { storeDir: join(root, 'admissions') });
      const input: ExecutionAdmissionInput = {
        tenantId: 'tenant', runId: 'run', taskId: 'task', callId: 'call', attemptId: 'attempt', role: 'worker', mode: 'unattended',
        configured: { provider: 'openrouter', model: 'openai/gpt-5.6-sol' }, requested: { provider: 'openrouter', model: 'openai/gpt-5.6-sol' }, resolved: { provider: 'openrouter', model: 'openai/gpt-5.6-sol' },
        authMode: 'api', configuredBackend: 'api', resolvedBackend: 'api', fallbackChain: [{ sequence: 1, provider: 'openrouter', model: 'openai/gpt-5.6-sol', accepted: true, reasonCode: 'none', reachabilityEvidenceRef: 'reachability:12345678', limitEvidenceRefs: ['limits:12345678'] }],
        reachability: { state: 'known', evidenceRefs: ['reachability:12345678'] }, limits: { state: 'known', evidenceRefs: ['limits:12345678'] }, receiptRef: 'receipt:12345678', approvalEvidenceRef: null,
        budgetProfileRef: resolved.profileRef, budgetPolicyDigest: resolved.policyDigest, budget: { maxTurns: 1 }, reachabilityProbeBudget: projection, decision: 'allow', reasonCode: 'none',
      };
      expect(store.declare(input).permit).not.toBeNull();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('lets provider truth validate subscription projection without requiring USD', async () => {
    const projection = deriveReachabilityProbeBudget({ executionBudget: {}, billingMode: 'subscription', purposeProfile: profile() });
    const accountRefHash = 'a'.repeat(64);
    const endpointRefHash = 'b'.repeat(64);
    const runtimeFingerprint = 'c'.repeat(64);
    const request: ReachabilityProbeRequest = {
      idempotencyKey: 'probe:12345678', tenantId: 'tenant', projectId: 'project', provider: 'openrouter', model: 'openai/gpt-5.6-sol',
      auth: { mode: 'subscription', accountRefHash }, backend: { transport: 'api', executionBackend: 'api', endpointRefHash, runtimeFingerprint, executionProfileRef: 'profile:12345678' }, probeKind: 'model-invocation', capability: 'inference',
      admission: { decision: 'allow', tenantId: 'tenant', projectId: 'project', provider: 'openrouter', model: 'openai/gpt-5.6-sol', auth: { mode: 'subscription', accountRefHash }, backend: { transport: 'api', executionBackend: 'api', endpointRefHash, runtimeFingerprint, executionProfileRef: 'profile:12345678' }, approvalRef: 'approval:12345678', approvalGrantedAt: '2026-01-01T00:00:00.000Z', approvalExpiresAt: '2026-01-01T00:02:00.000Z', limits: { state: 'known', decision: 'allow', evidenceRefs: ['limits:12345678'], fetchedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T00:02:00.000Z' }, budget: { evidenceRef: 'budget:12345678', projection } },
      executionProfile: { profileRef: 'profile:12345678', provider: 'openrouter', allowed: [{ authMode: 'subscription', transport: 'api', executionBackend: 'api' }] }, ttlMs: 60_000,
    };
    const result = await probeExactModelReachability(request, { now: () => new Date('2026-01-01T00:01:00.000Z'), probe: async () => ({ outcome: 'succeeded', calledProvider: 'openrouter', calledModel: 'openai/gpt-5.6-sol', providerRequestRefHash: null, latencyMs: 1 }) });
    expect(result.reasonCode).toBe('none');
  });
});
