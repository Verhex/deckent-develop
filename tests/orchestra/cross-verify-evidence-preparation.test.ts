import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareCrossVerifyCandidateEvidence } from '../../src/orchestra/cross-verify-evidence-preparation.js';
import {
  AttendedExecutionApprovalError,
  attendedExecutionProjectId,
} from '../../src/core/attended-execution-approval.js';
import {
  probeExactModelReachability,
  type ReachabilityProbeRequest,
  type ReachabilityResult,
} from '../../src/core/provider-truth.js';

const NOW = new Date('2026-08-12T12:00:00.000Z');
const PROFILE_REF = `docker-execution-profile:${'a'.repeat(64)}`;
const FINGERPRINT = 'f'.repeat(64);
const MODEL = 'gpt-5.6-sol';

const tempRoots: string[] = [];
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'xv-prep-'));
  tempRoots.push(root);
  return root;
}

function readyRuntimeIdentity() {
  return {
    state: 'ready' as const,
    imageId: `sha256:${'1'.repeat(64)}`,
    runtimeFingerprint: FINGERPRINT,
    executionProfileRef: PROFILE_REF,
    toolProfileDigest: 'd'.repeat(64),
    authorityEvidenceRef: `docker-xverify-runtime:${'2'.repeat(64)}`,
  };
}

function dockerBackend(identity: unknown = readyRuntimeIdentity()) {
  return {
    inspectExactCrossVerifyRuntime: vi.fn(async () => identity),
  } as never;
}

function budgetPolicy() {
  return {
    roles: { worker: { default: { maxTokens: 8_000_000 } } },
    purposes: {
      'reachability-probe': {
        maxInputTokens: 32_768,
        maxOutputTokens: 512,
        maxTokens: 33_280,
        timeoutMs: 60_000,
      },
    },
  };
}

function config(overrides: Record<string, unknown> = {}) {
  return {
    auth_mode: 'subscription',
    execution_budget: budgetPolicy(),
    ...overrides,
  } as never;
}

function providerAuthority(service: Record<string, unknown>) {
  return {
    state: 'ready' as const,
    authorityEvidenceRef: `provider-authority:${'3'.repeat(64)}`,
    service: {
      tenantId: 'local',
      projectId: 'project-prep-0001',
      truthStore: { getLatestReachability: vi.fn(() => null), getLatestReachabilityAnyAccount: vi.fn(() => null) },
      evidenceProducer: { refresh: vi.fn() },
      ...service,
    },
  } as never;
}

function baseInput(root: string, overrides: Record<string, unknown> = {}) {
  return {
    projectRoot: root,
    config: config(),
    providerAuthority: providerAuthority({}),
    candidate: { provider: 'codex', model: MODEL },
    dockerBackend: dockerBackend(),
    requester: { role: 'brain' as const, instanceId: 'test-prep' },
    userId: 'operator',
    approvalSummary: 'probe approval',
    runId: 'xverify:prep-test',
    decisionWindowMs: 50,
    decisionPollMs: 1,
    now: () => NOW,
    sleepFn: async () => {},
    ...overrides,
  } as never;
}

async function mintFreshRow(root: string): Promise<ReachabilityResult> {
  const request: ReachabilityProbeRequest = {
    idempotencyKey: 'fresh-row-0001',
    tenantId: 'local',
    projectId: 'project-prep-0001',
    provider: 'codex',
    model: MODEL,
    auth: { mode: 'subscription', accountRefHash: '0'.repeat(64) },
    backend: {
      transport: 'cli',
      executionBackend: 'docker',
      endpointRefHash: null,
      runtimeFingerprint: FINGERPRINT,
      executionProfileRef: PROFILE_REF,
    },
    probeKind: 'model-invocation',
    capability: 'inference',
    admission: {
      tenantId: 'local',
      projectId: 'project-prep-0001',
      decision: 'allow',
      provider: 'codex',
      model: MODEL,
      auth: { mode: 'subscription', accountRefHash: '0'.repeat(64) },
      backend: {
        transport: 'cli',
        executionBackend: 'docker',
        endpointRefHash: null,
        runtimeFingerprint: FINGERPRINT,
        executionProfileRef: PROFILE_REF,
      },
      approvalRef: `approval:aprp-${'4'.repeat(64)}`,
      approvalGrantedAt: NOW.toISOString(),
      approvalExpiresAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
      limits: {
        state: 'known',
        decision: 'allow',
        evidenceRefs: [`codex-limit-snapshot:${'5'.repeat(64)}`],
        fetchedAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
      },
      budget: {
        evidenceRef: `execution-budget:${'6'.repeat(64)}`,
        projection: {
          billingMode: 'subscription',
          maxInputTokens: 32_768,
          maxOutputTokens: 512,
          maxTokens: 33_280,
          timeoutMs: 60_000,
        },
      },
    },
    executionProfile: {
      profileRef: PROFILE_REF,
      provider: 'codex',
      allowed: [{ authMode: 'subscription', transport: 'cli', executionBackend: 'docker' }],
    },
    ttlMs: 60_000,
  };
  void root;
  return probeExactModelReachability(request, {
    probe: async () => ({
      outcome: 'succeeded',
      calledProvider: 'codex',
      calledModel: MODEL,
      providerRequestRefHash: '7'.repeat(64),
      latencyMs: 42,
    }),
    now: () => NOW,
    idFactory: () => `reach-${'8'.repeat(32)}`,
  });
}

describe('prepareCrossVerifyCandidateEvidence', () => {
  it('holds when the provider authority is absent or held', async () => {
    const root = projectRoot();
    const absent = await prepareCrossVerifyCandidateEvidence(
      baseInput(root, { providerAuthority: undefined }),
    );
    expect(absent).toMatchObject({
      state: 'hold',
      reasonCode: 'provider_authority_unavailable',
      detailCode: 'not-configured',
    });
  });

  it('holds with the exact backend reason when docker identity is unavailable', async () => {
    const root = projectRoot();
    const result = await prepareCrossVerifyCandidateEvidence(baseInput(root, {
      dockerBackend: dockerBackend({
        state: 'hold',
        reasonCode: 'docker_image_identity_unavailable',
        authorityEvidenceRef: `docker-xverify-runtime:${'9'.repeat(64)}`,
      }),
    }));
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'backend_identity_unavailable',
      detailCode: 'docker_image_identity_unavailable',
    });
  });

  it('fresh known∧reachable evidence skips APPROVAL but still runs the canonical refresh (7081 layer-2)', async () => {
    // The old early-return skipped refresh entirely, so the fresh LIMIT
    // snapshot the downstream verifier-candidate projection requires was
    // never written and the composition held with authority_failure. The
    // final contract: fresh evidence skips only the one-shot approval; the
    // refresh runs with approval:null and the producer's own exact-scope
    // reuse settles it.
    const root = projectRoot();
    const row = await mintFreshRow(root);
    const refresh = vi.fn(async () => ({
      state: 'ready' as const,
      authorityEvidenceRef: 'producer:ready',
      limit: null,
      reachability: row,
      receiptRef: 'invocation-receipt:reuse',
    }));
    const submit = vi.fn();
    const result = await prepareCrossVerifyCandidateEvidence(baseInput(root, {
      providerAuthority: providerAuthority({
        truthStore: { getLatestReachability: vi.fn(() => row), getLatestReachabilityAnyAccount: vi.fn(() => row) },
        evidenceProducer: { refresh },
      }),
      approvalRuntime: {
        attendedExecutionApprovalAuthority: { submitProviderEvidenceProbe: submit },
      },
    }));
    expect(result).toMatchObject({ state: 'ready' });
    expect(submit).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    const request = refresh.mock.calls[0]![0] as { approval: { evidenceRef: string | null } };
    expect(request.approval.evidenceRef).toBeNull();
  });

  it('holds on the owner budget profile before any approval is requested', async () => {
    const root = projectRoot();
    const submit = vi.fn();
    const result = await prepareCrossVerifyCandidateEvidence(baseInput(root, {
      config: config({ execution_budget: undefined }),
      approvalRuntime: {
        attendedExecutionApprovalAuthority: { submitProviderEvidenceProbe: submit },
      },
    }));
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'budget_profile_unavailable',
      detailCode: 'reachability-probe-profile-missing',
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('holds approval_authority_unavailable when no approval runtime is composed', async () => {
    const root = projectRoot();
    const result = await prepareCrossVerifyCandidateEvidence(baseInput(root));
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'approval_authority_unavailable',
    });
  });

  it('holds approval_undecided with the request id when no live decision arrives in the window', async () => {
    const root = projectRoot();
    let clock = NOW.getTime();
    const result = await prepareCrossVerifyCandidateEvidence(baseInput(root, {
      now: () => new Date(clock),
      sleepFn: async () => { clock += 25; },
      approvalRuntime: {
        attendedExecutionApprovalAuthority: {
          submitProviderEvidenceProbe: vi.fn(() => ({ id: 'ignored' })),
          verifyAndClaimProviderEvidenceProbe: vi.fn(() => {
            throw new AttendedExecutionApprovalError('DECISION_NOT_FOUND', 'no decision yet');
          }),
        },
      },
    }));
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'approval_undecided',
      approvalRequestId: expect.stringMatching(/^aprp-[a-f0-9]{64}$/u),
    });
  });

  it('D2b-2a micro-wiring: the poll tries the rules engine per tick and stays fail-soft', async () => {
    const root = projectRoot();
    const { saveApprovalRules } = await import('../../src/core/approval-rules.js');
    saveApprovalRules(root, [{
      id: 'rule-poll-01', createdAt: '2026-08-21T00:00:00.000Z', createdBy: 'alperen',
      reason: 'probe approvals are routine',
      match: { idPrefix: 'aprp-', riskTierMax: 'routine' },
      decision: 'allow', source: 'manual',
    }]);
    let clock = NOW.getTime();
    const decideByRules = vi.fn(async () => ({ kind: 'decided' }));
    const result = await prepareCrossVerifyCandidateEvidence(baseInput(root, {
      now: () => new Date(clock),
      sleepFn: async () => { clock += 25; },
      approvalRuntime: {
        broker: {
          getRequest: vi.fn((id: string) => ({
            version: 1, id, requester: { role: 'brain', instanceId: 'xverify' },
            summary: 'probe', details: { schemaVersion: 1, kind: 'provider-evidence-probe' },
            scopeId: 'p', scope: 'network', risk: 'high', policy: 'require-approval',
            defaultAction: 'deny', tenantId: 'main', userId: 'alperen',
            createdAt: new Date(clock - 1000).toISOString(),
            expiresAt: new Date(clock + 600_000).toISOString(),
            maskedArgs: null, rawArgsRef: null,
          })),
        },
        decideByRules,
        attendedExecutionApprovalAuthority: {
          submitProviderEvidenceProbe: vi.fn(() => ({ id: 'ignored' })),
          verifyAndClaimProviderEvidenceProbe: vi.fn(() => {
            throw new AttendedExecutionApprovalError('DECISION_NOT_FOUND', 'no decision yet');
          }),
        },
      },
    }));
    // The engine was invoked with the exact rule-derived command…
    expect(decideByRules).toHaveBeenCalledWith(root, expect.objectContaining({
      action: 'allow',
      idempotencyKey: expect.stringMatching(/^rules-engine:aprp-[a-f0-9]{64}:allow$/u),
      reason: 'probe approvals are routine',
    }));
    // …and with no decision materializing (mock), the window still closes as
    // the honest typed hold — the wiring never blocks the human path.
    expect(result).toMatchObject({ state: 'hold', reasonCode: 'approval_undecided' });
  });

  it('drives claim → refresh with the owner projection and reports producer holds typed', async () => {
    const root = projectRoot();
    const refresh = vi.fn(async () => ({
      state: 'hold' as const,
      reasonCode: 'probe_cooldown' as const,
      authorityEvidenceRef: `provider-authority:${'3'.repeat(64)}`,
      limit: null,
      reachability: null,
      receiptRef: null,
      deferralEvidenceRef: `provider-cooldown:${'a'.repeat(64)}`,
    }));
    const claim = {
      schemaVersion: 1,
      kind: 'provider-evidence-probe-claim',
      claimId: 'aprpc-x',
      requestId: 'aprp-x',
      subjectDigest: 'b'.repeat(64),
      subject: {},
      evidenceRef: `approval:aprp-${'c'.repeat(64)}`,
      grantedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      claimedAt: NOW.toISOString(),
    };
    const result = await prepareCrossVerifyCandidateEvidence(baseInput(root, {
      providerAuthority: providerAuthority({ evidenceProducer: { refresh } }),
      approvalRuntime: {
        attendedExecutionApprovalAuthority: {
          submitProviderEvidenceProbe: vi.fn(() => ({ id: 'ignored' })),
          verifyAndClaimProviderEvidenceProbe: vi.fn(() => claim),
        },
      },
    }));
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'evidence_refresh_hold',
      producerReasonCode: 'probe_cooldown',
    });
    expect(refresh).toHaveBeenCalledOnce();
    const request = (refresh.mock.calls as unknown as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(request).toMatchObject({
      provider: 'codex',
      model: MODEL,
      authMode: 'subscription',
      backend: { executionBackend: 'docker', executionProfileRef: PROFILE_REF },
      approval: { evidenceRef: claim.evidenceRef },
      budget: {
        projection: {
          billingMode: 'subscription',
          maxInputTokens: 32_768,
          maxOutputTokens: 512,
          maxTokens: 33_280,
          timeoutMs: 60_000,
        },
      },
    });
    // The probe subject binds the exact project the attended authority governs.
    expect(attendedExecutionProjectId(root)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('returns ready with evidence refs when the producer refresh succeeds', async () => {
    const root = projectRoot();
    const refresh = vi.fn(async () => ({
      state: 'ready' as const,
      authorityEvidenceRef: `provider-authority:${'3'.repeat(64)}`,
      limit: {} as never,
      reachability: { evidenceRefs: [`codex-reachability-scope:${'d'.repeat(64)}`] } as never,
      receiptRef: {} as never,
    }));
    const claim = {
      evidenceRef: `approval:aprp-${'c'.repeat(64)}`,
      grantedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    };
    const result = await prepareCrossVerifyCandidateEvidence(baseInput(root, {
      providerAuthority: providerAuthority({ evidenceProducer: { refresh } }),
      approvalRuntime: {
        attendedExecutionApprovalAuthority: {
          submitProviderEvidenceProbe: vi.fn(() => ({ id: 'ignored' })),
          verifyAndClaimProviderEvidenceProbe: vi.fn(() => claim),
        },
      },
    }));
    expect(result).toMatchObject({
      state: 'ready',
      reused: false,
      executionProfileRef: PROFILE_REF,
    });
  });
});
