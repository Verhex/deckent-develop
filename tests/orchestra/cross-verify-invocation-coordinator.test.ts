import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HostRoleInvocationAdmissionRuntime,
  type HostRoleInvocationNonReservableSubscription,
} from '../../src/core/host-role-invocation-admission-runtime.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import { canonicalJson } from '../../src/core/audit-writer.js';
import {
  createCrossVerifyEnforcedAttemptContract,
  type CrossVerifyEnforcedAttemptContractV1,
} from '../../src/core/cross-verify-execution-contract.js';
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
import {
  defaultRoleInvocationPolicy,
  type RoleInvocationSelected,
} from '../../src/core/role-invocation-resolver.js';
import {
  projectCrossVerifyInvocation,
  deriveCrossVerifyReservationIdentity,
} from '../../src/orchestra/cross-verify-invocation-authority.js';
import {
  CrossVerifyInvocationCoordinator,
  type CrossVerifyInvocationCoordinatorInput,
  type CrossVerifyInvocationExecutionGrant,
  type CrossVerifyHostObservationAuthority,
  type CrossVerifyProviderUsageAuthority,
  type CrossVerifyStrictDispatchHandle,
  type CrossVerifyTerminalEvidenceBundle,
} from '../../src/orchestra/cross-verify-invocation-coordinator.js';

const roots: string[] = [];
const stores: Array<{ close(): void }> = [];
const T0 = new Date('2026-07-25T04:00:00.000Z');
const T1 = '2026-07-25T04:01:00.000Z';
const T5 = '2026-07-25T04:05:00.000Z';
const T10 = '2026-07-25T04:10:00.000Z';
const MODEL = 'gpt-5.5';
const ACCOUNT = 'a'.repeat(64);
const ENDPOINT = 'b'.repeat(64);
const RUNTIME = 'c'.repeat(64);
const FENCE = 'd'.repeat(64);
const INTEGRITY_KEY = 'xverify-coordinator-integrity-key-000000000001';
const POLICY: ProviderLimitPolicy = {
  policyRef: 'limit-policy:xverify-coordinator-0001',
  warnAtRatio: 0.8,
  blockAtRatio: 0.95,
  minimumRemaining: {},
};

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-xverify-coordinator-'));
  roots.push(value);
  return value;
}

function backend() {
  return {
    transport: 'http' as const,
    executionBackend: 'docker' as const,
    endpointRefHash: ENDPOINT,
  };
}

function limitScope() {
  const wire = backend();
  return {
    tenantId: 'tenant-a',
    provider: 'codex',
    accountRefHash: ACCOUNT,
    authMode: 'api' as const,
    quotaScopeRefHash: deriveProviderQuotaScopeRefHash({
      tenantId: 'tenant-a',
      provider: 'codex',
      accountRefHash: ACCOUNT,
      authMode: 'api',
      backend: wire,
    }),
  };
}

function reachabilityQuery(projectId: string): ExactReachabilityQuery {
  return {
    tenantId: 'tenant-a',
    projectId,
    provider: 'codex',
    model: MODEL,
    authMode: 'api',
    accountRefHash: ACCOUNT,
    ...backend(),
    runtimeFingerprint: RUNTIME,
    executionProfileRef: 'execution-profile:codex-xverify-0001',
    capability: 'inference',
  };
}

async function reachability(projectId: string): Promise<ReachabilityResult> {
  const query = reachabilityQuery(projectId);
  const auth = { mode: query.authMode, accountRefHash: query.accountRefHash };
  const reachabilityBackend = {
    transport: query.transport,
    executionBackend: query.executionBackend,
    endpointRefHash: query.endpointRefHash,
    runtimeFingerprint: query.runtimeFingerprint,
    executionProfileRef: query.executionProfileRef,
  };
  return probeExactModelReachability({
    idempotencyKey: 'xverify-reachability-idempotency-0001',
    tenantId: query.tenantId,
    projectId,
    provider: 'codex',
    model: MODEL,
    auth,
    backend: reachabilityBackend,
    probeKind: 'model-invocation',
    capability: 'inference',
    admission: {
      decision: 'allow',
      tenantId: query.tenantId,
      projectId,
      provider: 'codex',
      model: MODEL,
      auth,
      backend: reachabilityBackend,
      approvalRef: 'approval:xverify-reachability-0001',
      approvalGrantedAt: T0.toISOString(),
      approvalExpiresAt: T10,
      limits: {
        state: 'known',
        decision: 'allow',
        evidenceRefs: ['limit:xverify-reachability-0001'],
        fetchedAt: T0.toISOString(),
        expiresAt: T10,
      },
      budget: {
        evidenceRef: 'budget:xverify-reachability-0001',
        maxInputTokens: 64,
        maxOutputTokens: 64,
        maxTotalTokens: 128,
        maxUsd: 0.01,
      },
    },
    executionProfile: {
      profileRef: query.executionProfileRef,
      provider: 'codex',
      allowed: [{ authMode: 'api', transport: 'http', executionBackend: 'docker' }],
    },
    ttlMs: 10 * 60_000,
  }, {
    probe: async () => ({
      outcome: 'succeeded',
      calledProvider: 'codex',
      calledModel: MODEL,
      providerRequestRefHash: 'e'.repeat(64),
      latencyMs: 2,
    }),
    now: () => T0,
    idFactory: () => 'reach-xverify-coordinator-0001',
  });
}

function limitObservation(projectId: string, remaining = 100): ProviderLimitObservation {
  return {
    ...limitScope(),
    projectId,
    backend: backend(),
    idempotencyKey: `xverify-limit-${remaining}`,
    state: 'known',
    requiredWindowIds: ['tokens-all'],
    windows: [{
      windowId: 'tokens-all',
      kind: 'rate-window',
      model: MODEL,
      unit: 'tokens',
      consumed: 100 - remaining,
      remaining,
      limit: 100,
      reset: { state: 'known', at: T10, displayRefHash: null },
    }],
    source: {
      kind: 'provider-api',
      authority: 'authoritative',
      operatorApprovalRef: null,
      evidenceRef: 'limit-source:xverify-coordinator-0001',
      fetchedAt: T0.toISOString(),
      expiresAt: T10,
      incorporatedReservationEventRefs: [],
    },
  };
}

// The reserved-path tests never dispatch the non-reservable arm; this stub proves
// that by throwing if the coordinator ever routes a reserved fixture through it.
const unusedProjectNonReservable: CrossVerifyProviderUsageAuthority['projectNonReservable'] =
  () => { throw new Error('projectNonReservable must not run on a reserved fixture'); };

function consumedUsageAuthority(): CrossVerifyProviderUsageAuthority {
  return {
    projectNonReservable: unusedProjectNonReservable,
    preflight: () => ({
      state: 'ready',
      authorityEvidenceRef: 'provider-usage-preflight:xverify-coordinator-0001',
    }),
    project: ({ grant }) => ({
      state: 'settled',
      authorityEvidenceRef: 'provider-usage-authority:xverify-coordinator-0001',
      event: {
        eventId: 'consumed-xverify-coordinator-0001',
        type: 'consumed',
        occurredAt: T1,
        fenceTokenHash: grant.fenceTokenHash,
        evidenceRef: 'provider-usage:xverify-coordinator-0001',
        actual: [{ windowId: 'tokens-all', unit: 'tokens', amount: 7 }],
      },
    }),
  };
}

interface Harness {
  readonly receiptStore: InvocationReceiptStore;
  readonly truthStore: ProviderTruthStore;
  readonly limitStore: ProviderLimitStore;
  readonly runtime: HostRoleInvocationAdmissionRuntime;
  readonly input: CrossVerifyInvocationCoordinatorInput;
  close(): void;
}

async function harness(remaining = 100): Promise<Harness> {
  const projectRoot = root();
  const receiptStore = new InvocationReceiptStore(projectRoot, {
    idFactory: () => 'project-xverify-coordinator',
    now: () => T1,
  });
  const truthStore = new ProviderTruthStore(projectRoot, {
    projectId: receiptStore.projectId,
    now: () => new Date(T1),
    integrityKey: INTEGRITY_KEY,
  });
  const limitStore = new ProviderLimitStore(projectRoot, {
    now: () => new Date(T1),
    policyResolver: () => POLICY,
    terminationEvidenceVerifier: () => true,
    integrityKey: INTEGRITY_KEY,
  });
  stores.push(receiptStore, truthStore, limitStore);
  truthStore.putReachability(await reachability(receiptStore.projectId));
  limitStore.putSnapshot(createProviderLimitResult(
    limitObservation(receiptStore.projectId, remaining),
    POLICY,
    { idFactory: () => 'limit-xverify-coordinator-0001' },
  ));
  const runtime = new HostRoleInvocationAdmissionRuntime({
    tenantId: 'tenant-a',
    truthStore,
    limitStore,
    now: () => new Date(T1),
  });
  const candidateAuthority = {
    provider: 'codex',
    model: MODEL,
    reachabilityQuery: reachabilityQuery(receiptStore.projectId),
    limitQuery: limitScope(),
  };
  const candidateProjection = runtime.projectVerifierCandidate(candidateAuthority);
  if (candidateProjection.state !== 'ready') {
    throw new Error(`fixture candidate projection failed: ${candidateProjection.reasonCode}`);
  }
  const projected = projectCrossVerifyInvocation({
    projection: candidateProjection,
    ledger: receiptStore,
    tenantId: 'tenant-a',
    projectId: receiptStore.projectId,
    runId: 'sprint-456',
    taskId: '456-001',
    attempt: 1,
    attemptId: '456-001-xverify-attempt-1',
    fenceTokenHash: FENCE,
    createdAt: T1,
  });
  if (projected.state !== 'ready') {
    throw new Error(`fixture invocation projection failed: ${projected.reasonCode}`);
  }
  const admission = {
    invocation: {
      role: 'auditor' as const,
      purpose: 'audit-evaluation' as const,
      primaryProvider: 'codex',
      model: MODEL,
      fallbackProviders: [],
    },
    candidates: { codex: candidateAuthority },
    buildReservation: (selected: RoleInvocationSelected): ProviderLimitReservationRequest => {
      const reservationIdentity = deriveCrossVerifyReservationIdentity(
        projected.identity,
        String(selected.provider),
        selected.model,
      );
      return {
        ...limitScope(),
        projectId: receiptStore.projectId,
        backend: backend(),
        ...reservationIdentity,
        runId: 'sprint-456',
        taskId: '456-001-xverify',
        callId: projected.identity.callId,
        attemptId: projected.binding.attemptId,
        fenceTokenHash: projected.binding.fenceTokenHash,
        receiptRef: projected.identity.receiptRef,
        reachabilityEvidenceRef: projected.verifierCandidates[0].reachability.evidenceRef!,
        model: selected.model,
        estimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 10 }],
        estimateEvidenceRefs: [
          'budget-estimate:xverify-coordinator-0001',
          executionContract.evidenceRef,
        ],
        requestedAt: T1,
        leaseExpiresAt: T5,
      };
    },
  };
  const executionRequest = {
    basePrompt: 'bounded base verifier prompt',
    dispatchedPrompt: 'bounded dispatched verifier prompt',
    taskSnapshot: {
      id: '456-001-xverify',
      model: MODEL,
      budget: { maxTokens: 10, maxTurns: 3 },
      budgetPolicy: {
        profileRef: 'execution-budget:xverify-coordinator-0001',
        policyDigest: '5'.repeat(64),
        admissionMode: 'unattended',
        landingPolicy: { reserve_ratio: 0.25 },
      },
    },
  } as const;
  const executionContract = createCrossVerifyEnforcedAttemptContract({
    tenantId: 'tenant-a',
    projectId: receiptStore.projectId,
    runId: 'sprint-456',
    taskId: '456-001',
    verifierTaskId: '456-001-xverify',
    callId: projected.identity.callId,
    attemptId: projected.binding.attemptId,
    fenceTokenHash: projected.binding.fenceTokenHash,
    operationClass: 'verify-implementation',
    basePromptSha256: createHash('sha256')
      .update(executionRequest.basePrompt)
      .digest('hex'),
    dispatchedPromptSha256: createHash('sha256')
      .update(executionRequest.dispatchedPrompt)
      .digest('hex'),
    taskSnapshotSha256: createHash('sha256')
      .update(canonicalJson(executionRequest.taskSnapshot))
      .digest('hex'),
    budget: { maxTokens: 10, maxTurns: 3 },
    budgetFingerprint: '4'.repeat(64),
    budgetProfileRef: 'execution-budget:xverify-coordinator-0001',
    budgetPolicyDigest: '5'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    attendanceMode: 'unattended',
    provider: 'codex',
    model: MODEL,
    authMode: 'api',
    accountRefHash: ACCOUNT,
    transport: 'http',
    executionBackend: 'docker',
    endpointRefHash: ENDPOINT,
    executionProfileRef: 'execution-profile:codex-xverify-0001',
    providerLimitEstimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 10 }],
    timeoutMs: 120_000,
    modelEffort: 'low',
    toolProfileDigest: '6'.repeat(64),
    isolatedContext: true,
    settlementAttemptRef: {
      schemaVersion: 1,
      taskId: '456-001-xverify',
      backend: 'docker',
      projectRootSha256: '7'.repeat(64),
      attemptId: projected.binding.attemptId,
    },
  });
  return {
    receiptStore,
    truthStore,
    limitStore,
    runtime,
    input: {
      projection: projected,
      admission,
      executionContract,
      executionRequest,
      buildDispatchEvent: allowed => ({
        eventId: 'dispatch-xverify-coordinator-0001',
        type: 'dispatched',
        occurredAt: T1,
        fenceTokenHash: allowed.reservation.fenceTokenHash,
        evidenceRef: 'provider-dispatch:xverify-coordinator-0001',
      }),
      isClaimActive: () => true,
    },
    close: () => {
      receiptStore.close();
      truthStore.close();
      limitStore.close();
    },
  };
}

function terminal(
  grant: CrossVerifyInvocationExecutionGrant,
  overrides: Partial<CrossVerifyTerminalEvidenceBundle> = {},
): CrossVerifyTerminalEvidenceBundle {
  return {
    output: 'VERDICT: CONFIRMED exact invocation authority is consistent',
    actualCall: {
      provider: grant.provider,
      model: grant.model,
      backend: grant.backend,
      auth: grant.auth,
      evidenceRef: 'provider-call:xverify-coordinator-0001',
    },
    execution: {
      outcome: 'completed',
      initialAttemptId: grant.attemptId,
      terminalAttemptId: grant.attemptId,
      cumulativeUsage: {
        turns: 1,
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 15,
        maxContextTokens: 15,
      },
    },
    lineage: {
      coverage: 'complete',
      attemptIds: [grant.attemptId],
      settlementEvidenceRefs: ['task-result-settlement:xverify-coordinator-0001'],
    },
    usageEvidenceRefs: ['provider-usage-source:xverify-coordinator-0001'],
    transportEvent: {
      eventId: 'transport-xverify-coordinator-0001',
      type: 'transport_settled',
      payload: {
        outcome: 'succeeded',
        exitCode: 0,
        signal: null,
        reasonCode: 'none',
        durationMs: 5,
      },
    },
    consumerEvent: {
      eventId: 'consumer-xverify-coordinator-0001',
      type: 'consumer_settled',
      payload: { outcome: 'accepted', reasonCode: 'none' },
    },
    ...overrides,
  };
}

function dispatchHandle(
  grant: CrossVerifyInvocationExecutionGrant,
): CrossVerifyStrictDispatchHandle {
  return {
    settlementRef: grant.executionContract.settlementAttemptRef,
    outputArtifactRef: 'xverify-output:xverify-coordinator-0001',
  };
}

function rebuildContract(
  contract: Readonly<CrossVerifyEnforcedAttemptContractV1>,
  overrides: Partial<CrossVerifyEnforcedAttemptContractV1>,
) {
  const {
    schemaVersion: _schemaVersion,
    contractSha256: _contractSha256,
    evidenceRef: _evidenceRef,
    ...input
  } = contract;
  return createCrossVerifyEnforcedAttemptContract({ ...input, ...overrides });
}

function settledObservationAuthority(
  project: (
    grant: CrossVerifyInvocationExecutionGrant,
  ) => CrossVerifyTerminalEvidenceBundle = terminal,
): CrossVerifyHostObservationAuthority {
  return {
    observe: async ({ grant }) => ({
      state: 'settled',
      terminal: project(grant),
      authorityEvidenceRef: 'xverify-observation:xverify-coordinator-0001',
    }),
  };
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // Already closed by an individual harness.
    }
  }
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('CrossVerifyInvocationCoordinator', () => {
  it('holds before provider work when host authority is absent', async () => {
    const h = await harness();
    const executor = vi.fn();
    const result = await new CrossVerifyInvocationCoordinator(null).execute(h.input, executor);
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'XVERIFY_INVOCATION_AUTHORITY_UNAVAILABLE',
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it('claims one exact route and settles receipt plus provider usage from host evidence', async () => {
    const h = await harness();
    const executor = vi.fn(async (grant: CrossVerifyInvocationExecutionGrant) => dispatchHandle(grant));
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: consumedUsageAuthority(),
      observationAuthority: settledObservationAuthority(),
    });
    const result = await coordinator.execute(h.input, executor);
    expect(result).toMatchObject({
      state: 'settled',
      calledProvider: 'codex',
      calledModel: MODEL,
      execution: { outcome: 'completed' },
    });
    expect(executor).toHaveBeenCalledTimes(1);
    const grant = executor.mock.calls[0]![0];
    expect(grant).toMatchObject({
      tenantId: 'tenant-a',
      projectId: h.receiptStore.projectId,
      runId: 'sprint-456',
      taskId: '456-001-xverify',
      attemptId: '456-001-xverify-attempt-1',
      fenceTokenHash: FENCE,
      provider: 'codex',
      model: MODEL,
      backend: {
        transport: 'http',
        executionBackend: 'docker',
        endpointRefHash: ENDPOINT,
        executionProfileRef: 'execution-profile:codex-xverify-0001',
      },
      auth: { mode: 'api', accountRefHash: ACCOUNT },
      executionContract: {
        evidenceRef: h.input.executionContract.evidenceRef,
        contractSha256: h.input.executionContract.contractSha256,
      },
    });
    expect(Object.isFrozen(grant)).toBe(true);
    expect(Object.isFrozen(grant.backend)).toBe(true);
    expect(Object.isFrozen(grant.auth)).toBe(true);
    expect(Object.isFrozen(grant.executionContract.budget)).toBe(true);
    if (result.state !== 'settled') return;
    expect(result).toMatchObject({
      executionContractEvidenceRef: h.input.executionContract.evidenceRef,
      outputArtifactRef: 'xverify-output:xverify-coordinator-0001',
      hostObservationEvidenceRef: 'xverify-observation:xverify-coordinator-0001',
      terminalSettlementRef: h.input.executionContract.settlementAttemptRef,
    });
    const receipt = h.receiptStore.get(result.invocationReceiptRef, result.invocationReceiptRef.invocationId);
    expect(receipt?.events.map(event => event.type)).toEqual([
      'dispatch_started',
      'transport_settled',
      'consumer_settled',
    ]);
    const reservation = h.limitStore.getReservation({
      ...limitScope(),
      projectId: h.receiptStore.projectId,
    }, result.providerLimitReservationId!);
    expect(reservation).toMatchObject({
      state: 'consumed',
      events: [
        { type: 'dispatched' },
        { type: 'consumed', actual: [{ windowId: 'tokens-all', unit: 'tokens', amount: 7 }] },
      ],
    });
  });

  it('dispatches and settles the non-reservable subscription arm from transport usage, forging no reservation', async () => {
    const h = await harness();
    const candidate = h.input.projection.verifierCandidates[0];
    const nonReservableAdmission: HostRoleInvocationNonReservableSubscription = {
      decision: 'non_reservable_subscription',
      reservation: null,
      attempts: [],
      authorityEvidenceRef: 'xverify-non-reservable-admission:coordinator-0001',
      basis: {
        advisoryLimitEvidenceRefs: candidate.limits.evidenceRefs,
        ownerBoundRef: 'config:cross_verify.allow_non_reservable_subscription_adjudication',
        requiredWindows: [{ windowId: 'codex.primary', unit: 'percent', model: null }],
      },
      resolution: {
        role: 'auditor',
        purpose: 'audit-evaluation',
        policy: defaultRoleInvocationPolicy('auditor'),
        selected: { provider: 'codex', model: MODEL, source: 'config', sequence: 1 },
        attempts: [],
        rejected: [],
        decisionReasonCode: 'none',
        configured: { provider: 'codex', model: MODEL, source: 'config', reasonCode: 'none' },
        resolved: { provider: 'codex', model: MODEL, source: 'wire', reasonCode: 'none' },
        fallbackChain: [],
        reachability: { state: candidate.reachability.state, evidenceRef: candidate.reachability.evidenceRef },
        limits: { state: candidate.limits.state, evidenceRefs: candidate.limits.evidenceRefs },
      },
    };
    const projectNonReservable = vi.fn(() => ({
      state: 'settled' as const,
      usage: { totalTokens: 15, inputTokens: 10, outputTokens: 5 },
      usageEvidenceRef: 'provider-usage:non-reservable-0001',
      authorityEvidenceRef: 'xverify-non-reservable-usage:coordinator-0001',
    }));
    const usageAuthority: CrossVerifyProviderUsageAuthority = {
      preflight: () => { throw new Error('reserved preflight must not run on the non-reservable arm'); },
      project: () => { throw new Error('reserved project must not run on the non-reservable arm'); },
      projectNonReservable,
    };
    const executor = vi.fn(async (grant: CrossVerifyInvocationExecutionGrant) => dispatchHandle(grant));
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority,
      observationAuthority: settledObservationAuthority(),
    });
    const result = await coordinator.execute({ ...h.input, nonReservableAdmission }, executor);
    expect(result.state).toBe('settled');
    if (result.state !== 'settled') return;
    expect(result).toMatchObject({
      calledProvider: 'codex',
      calledModel: MODEL,
      providerLimitReservationId: null,
      providerLimitSettlementEvidenceRef: null,
      providerReportedUsageEvidenceRef: 'provider-usage:non-reservable-0001',
    });
    expect(projectNonReservable).toHaveBeenCalledTimes(1);
    const grant = executor.mock.calls[0]![0];
    expect(grant.admissionMode).toBe('non_reservable_subscription');
    expect(grant.reservation).toBeNull();
    // The invocation-ledger settlement is byte-identical to the reserved arm; only
    // the numeric reservation ledger is skipped.
    const receipt = h.receiptStore.get(result.invocationReceiptRef, result.invocationReceiptRef.invocationId);
    expect(receipt?.events.map(event => event.type)).toEqual([
      'dispatch_started',
      'transport_settled',
      'consumer_settled',
    ]);
  });

  it('parks route drift after dispatch and never accepts or settles the verdict', async () => {
    const h = await harness();
    const usage = {
      projectNonReservable: unusedProjectNonReservable,
      preflight: consumedUsageAuthority().preflight,
      project: vi.fn(consumedUsageAuthority().project),
    };
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: usage,
      observationAuthority: settledObservationAuthority(grant => terminal(grant, {
        actualCall: {
          provider: 'claude',
          model: 'claude-fable-5',
          backend: grant.backend,
          auth: grant.auth,
          evidenceRef: 'provider-call:xverify-drift-0001',
        },
      })),
    });
    const result = await coordinator.execute(h.input, async grant => dispatchHandle(grant));
    expect(result).toMatchObject({
      state: 'reconciliation-required',
      reasonCode: 'XVERIFY_INVOCATION_RECONCILIATION_REQUIRED',
    });
    expect(usage.project).not.toHaveBeenCalled();
  });

  it('holds prompt-contract drift before dispatch and invokes neither launcher nor observer', async () => {
    const h = await harness();
    const launcher = vi.fn();
    const observer = vi.fn();
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: consumedUsageAuthority(),
      observationAuthority: { observe: observer },
    });
    const result = await coordinator.execute({
      ...h.input,
      executionContract: rebuildContract(h.input.executionContract, {
        dispatchedPromptSha256: 'b'.repeat(64),
      }),
    }, launcher);

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'XVERIFY_INVOCATION_HOLD:authority_failure',
      invocationReceiptRef: null,
    });
    expect(launcher).not.toHaveBeenCalled();
    expect(observer).not.toHaveBeenCalled();
  });

  it('holds substituted dispatched prompt bytes before dispatch', async () => {
    const h = await harness();
    const launcher = vi.fn();
    const observer = vi.fn();
    const result = await new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: consumedUsageAuthority(),
      observationAuthority: { observe: observer },
    }).execute({
      ...h.input,
      executionRequest: {
        ...h.input.executionRequest,
        dispatchedPrompt: 'substituted prompt bytes',
      },
    }, launcher);

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'XVERIFY_INVOCATION_HOLD:authority_failure',
      invocationReceiptRef: null,
    });
    expect(launcher).not.toHaveBeenCalled();
    expect(observer).not.toHaveBeenCalled();
  });

  it('rejects launcher-authored terminal fields before the host observer can consume them', async () => {
    const h = await harness();
    const observer = vi.fn();
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: consumedUsageAuthority(),
      observationAuthority: { observe: observer },
    });
    const result = await coordinator.execute(h.input, async grant => ({
      ...dispatchHandle(grant),
      actualCall: {
        provider: grant.provider,
        model: grant.model,
      },
    } as unknown as CrossVerifyStrictDispatchHandle));

    expect(result).toMatchObject({
      state: 'reconciliation-required',
      reasonCode: 'XVERIFY_INVOCATION_RECONCILIATION_REQUIRED',
    });
    expect(observer).not.toHaveBeenCalled();
  });

  it('keeps the claimed reservation open when host observation cannot prove the call', async () => {
    const h = await harness();
    const usage = {
      projectNonReservable: unusedProjectNonReservable,
      preflight: consumedUsageAuthority().preflight,
      project: vi.fn(consumedUsageAuthority().project),
    };
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: usage,
      observationAuthority: {
        observe: async () => ({
          state: 'hold',
          reasonCode: 'actual_call_unproven',
          authorityEvidenceRef: 'xverify-observation-hold:xverify-coordinator-0001',
        }),
      },
    });
    const result = await coordinator.execute(h.input, async grant => dispatchHandle(grant));

    expect(result).toMatchObject({
      state: 'reconciliation-required',
      reasonCode: 'XVERIFY_INVOCATION_OBSERVATION_HOLD:actual_call_unproven',
    });
    expect(usage.project).not.toHaveBeenCalled();
  });

  it('keeps a claimed reservation dispatched when terminal usage evidence is missing', async () => {
    const h = await harness();
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: {
        projectNonReservable: unusedProjectNonReservable,
        preflight: () => ({
          state: 'ready',
          authorityEvidenceRef: 'provider-usage-preflight:xverify-coordinator-0001',
        }),
        project: () => ({
          state: 'hold',
          reasonCode: 'usage_evidence_missing',
          authorityEvidenceRef: 'provider-usage-hold:xverify-coordinator-0001',
        }),
      },
      observationAuthority: settledObservationAuthority(),
    });
    const result = await coordinator.execute(h.input, async grant => dispatchHandle(grant));
    expect(result).toMatchObject({
      state: 'reconciliation-required',
      reasonCode: 'XVERIFY_INVOCATION_USAGE_HOLD:usage_evidence_missing',
    });
    if (result.state !== 'reconciliation-required') return;
    const reservationId = deriveCrossVerifyReservationIdentity(
      h.input.projection.identity,
      'codex',
      MODEL,
    ).reservationId;
    const reservation = h.limitStore.getReservation({
      ...limitScope(),
      projectId: h.receiptStore.projectId,
    }, reservationId);
    expect(reservation?.state).toBe('dispatched');
    expect(reservation?.events.map(event => event.type)).toEqual(['dispatched']);
  });

  it('holds a missing provider-window mapper before dispatch', async () => {
    const h = await harness();
    const executor = vi.fn();
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: {
        projectNonReservable: unusedProjectNonReservable,
        preflight: () => ({
          state: 'hold',
          reasonCode: 'window_mapper_unavailable',
          authorityEvidenceRef: 'provider-usage-preflight-hold:xverify-coordinator-0001',
        }),
        project: vi.fn(),
      },
      observationAuthority: settledObservationAuthority(),
    });
    const result = await coordinator.execute(h.input, executor);
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'XVERIFY_INVOCATION_USAGE_HOLD:window_mapper_unavailable',
      invocationReceiptRef: null,
    });
    expect(executor).not.toHaveBeenCalled();
    const reservationId = deriveCrossVerifyReservationIdentity(
      h.input.projection.identity,
      'codex',
      MODEL,
    ).reservationId;
    const reservation = h.limitStore.getReservation({
      ...limitScope(),
      projectId: h.receiptStore.projectId,
    }, reservationId);
    expect(reservation?.state).toBe('admitted');
    expect(reservation?.events).toEqual([]);
  });

  it('rejects substituted quota-scope authority before receipt declaration or dispatch', async () => {
    const h = await harness();
    const executor = vi.fn();
    const input: CrossVerifyInvocationCoordinatorInput = {
      ...h.input,
      admission: {
        ...h.input.admission,
        candidates: {
          codex: {
            ...h.input.admission.candidates.codex!,
            limitQuery: {
              ...h.input.admission.candidates.codex!.limitQuery,
              quotaScopeRefHash: 'f'.repeat(64),
            },
          },
        },
      },
    };
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: consumedUsageAuthority(),
      observationAuthority: settledObservationAuthority(),
    });
    const result = await coordinator.execute(input, executor);
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'XVERIFY_INVOCATION_HOLD:authority_failure',
      invocationReceiptRef: null,
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it('settles a no-call terminal only through termination-proven release evidence', async () => {
    const h = await harness();
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: {
        projectNonReservable: unusedProjectNonReservable,
        preflight: consumedUsageAuthority().preflight,
        project: ({ grant }) => ({
          state: 'settled',
          authorityEvidenceRef: 'provider-termination-authority:xverify-coordinator-0001',
          event: {
            eventId: 'released-xverify-coordinator-0001',
            type: 'released',
            occurredAt: T1,
            fenceTokenHash: grant.fenceTokenHash,
            evidenceRef: 'provider-release:xverify-coordinator-0001',
            terminationEvidenceRef: 'execution-termination:xverify-coordinator-0001',
            terminationAuthorityRef: 'termination-ledger:xverify-coordinator-0001',
          },
        }),
      },
      observationAuthority: settledObservationAuthority(grant => terminal(grant, {
        output: '',
        actualCall: null,
        execution: {
          outcome: 'failed',
          initialAttemptId: grant.attemptId,
          terminalAttemptId: grant.attemptId,
          reason: 'host proved provider side effect never started',
        },
        transportEvent: {
          eventId: 'transport-released-xverify-coordinator-0001',
          type: 'transport_settled',
          payload: {
            outcome: 'failed',
            exitCode: null,
            signal: null,
            reasonCode: 'spawn_error',
            durationMs: 2,
          },
        },
        consumerEvent: {
          eventId: 'consumer-released-xverify-coordinator-0001',
          type: 'consumer_settled',
          payload: { outcome: 'rejected', reasonCode: 'spawn_error' },
        },
      })),
    });
    const result = await coordinator.execute(h.input, async grant => dispatchHandle(grant));
    expect(result.state).toBe('settled');
    if (result.state !== 'settled') return;
    const reservation = h.limitStore.getReservation({
      ...limitScope(),
      projectId: h.receiptStore.projectId,
    }, result.providerLimitReservationId!);
    expect(reservation).toMatchObject({
      state: 'released',
      events: [
        { type: 'dispatched' },
        {
          type: 'released',
          terminationEvidenceRef: 'execution-termination:xverify-coordinator-0001',
          terminationAuthorityRef: 'termination-ledger:xverify-coordinator-0001',
        },
      ],
    });
  });

  it('does not re-dispatch a prior exact invocation', async () => {
    const h = await harness();
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: consumedUsageAuthority(),
      observationAuthority: settledObservationAuthority(),
    });
    const firstExecutor = vi.fn(async (grant: CrossVerifyInvocationExecutionGrant) => dispatchHandle(grant));
    expect((await coordinator.execute(h.input, firstExecutor)).state).toBe('settled');
    const replayExecutor = vi.fn();
    const replay = await coordinator.execute(h.input, replayExecutor);
    expect(replay).toMatchObject({
      state: 'reconciliation-required',
      reasonCode: 'XVERIFY_INVOCATION_REPLAY_AFTER_DISPATCH',
    });
    expect(firstExecutor).toHaveBeenCalledTimes(1);
    expect(replayExecutor).not.toHaveBeenCalled();
  });

  it('does not open fallback or retry when the exact executor throws after dispatch', async () => {
    const h = await harness();
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: consumedUsageAuthority(),
      observationAuthority: settledObservationAuthority(),
    });
    const executor = vi.fn(async () => {
      throw new Error('provider transport lost after claim');
    });
    const result = await coordinator.execute(h.input, executor);
    expect(result).toMatchObject({
      state: 'reconciliation-required',
      reasonCode: 'XVERIFY_INVOCATION_RECONCILIATION_REQUIRED',
    });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('holds provider-limit estimate drift before dispatch and never invokes the launcher', async () => {
    const h = await harness();
    const originalBuildReservation = h.input.admission.buildReservation;
    const input: CrossVerifyInvocationCoordinatorInput = {
      ...h.input,
      admission: {
        ...h.input.admission,
        buildReservation: selected => ({
          ...originalBuildReservation(selected),
          estimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 101 }],
        }),
      },
    };
    const coordinator = new CrossVerifyInvocationCoordinator({
      admissionRuntime: h.runtime,
      usageAuthority: consumedUsageAuthority(),
      observationAuthority: settledObservationAuthority(),
    });
    const executor = vi.fn();
    const result = await coordinator.execute(input, executor);
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'XVERIFY_INVOCATION_HOLD:authority_failure',
    });
    expect(executor).not.toHaveBeenCalled();
  });
});
