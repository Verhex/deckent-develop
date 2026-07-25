import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCrossVerifyEnforcedAttemptContract } from '../../src/core/cross-verify-execution-contract.js';
import {
  createExecutionLandingCheckpoint,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
} from '../../src/core/execution-landing-checkpoint.js';
import { ExecutionTerminationLedger } from '../../src/core/execution-termination-ledger.js';
import { deriveProviderQuotaScopeRefHash, type ProviderLimitReservation } from '../../src/core/provider-limit-truth.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  readTaskProviderActualCallReceipt,
  taskProviderActualCallEvidenceRef,
  writeTaskProviderTerminalBillingReceiptAtomic,
  writeTaskProviderTerminalUsageReceiptAtomic,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementExecutionContractAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
  writeTaskResultSettlementPreparedAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  CrossVerifyDockerHostObservationAuthority,
  CrossVerifyDockerProviderUsageAuthority,
  CrossVerifyDockerTerminationAuthority,
} from '../../src/orchestra/cross-verify-docker-runtime-authority.js';
import { persistDockerTerminalProviderBillingReceipt } from '../../src/orchestra/spawn-backend-docker.js';
import type { CrossVerifyInvocationExecutionGrant } from '../../src/orchestra/cross-verify-invocation-coordinator.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;
const T0 = '2026-07-25T02:00:00.000Z';
const T1 = '2026-07-25T02:01:00.000Z';
const T2 = '2026-07-25T02:02:00.000Z';
const T3 = '2026-07-25T02:03:00.000Z';
const T4 = '2026-07-25T02:04:00.000Z';
const T10 = '2026-07-25T02:10:00.000Z';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'deckent-xverify-docker-runtime-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const stateRoot = join(base, 'host-state');
  mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  process.env.DECKENT_HOME = stateRoot;
  return {
    projectRoot,
    stateRoot,
    dbPath: join(stateRoot, 'execution-terminations.db'),
  };
}

function reservation(
  attemptId: string,
  estimates: ProviderLimitReservation['estimates'] = [
    { windowId: 'tokens-all', unit: 'tokens', amount: 1_000 },
    { windowId: 'billing-usd', unit: 'usd', amount: 1 },
    { windowId: 'requests-all', unit: 'requests', amount: 1 },
  ],
): ProviderLimitReservation {
  const backend = {
    transport: 'cli' as const,
    executionBackend: 'docker' as const,
    endpointRefHash: null,
  };
  const scope = {
    tenantId: 'tenant-a',
    provider: 'claude',
    accountRefHash: 'a'.repeat(64),
    authMode: 'subscription' as const,
    backend,
  };
  return {
    tenantId: scope.tenantId,
    projectId: 'project-a',
    reservationId: 'reservation-a',
    idempotencyKey: 'reservation-key-a',
    runId: 'run-a',
    taskId: 'strict-xverify',
    callId: 'call-a',
    attemptId,
    fenceTokenHash: 'b'.repeat(64),
    receiptRef: 'invocation-receipt:strict-xverify-0001',
    reachabilityEvidenceRef: 'provider-reachability:strict-xverify-0001',
    provider: scope.provider,
    model: 'claude-fable-5',
    accountRefHash: scope.accountRefHash,
    quotaScopeRefHash: deriveProviderQuotaScopeRefHash(scope),
    authMode: scope.authMode,
    backend,
    estimates,
    estimateEvidenceRefs: ['budget-estimate:strict-xverify-0001'],
    leaseExpiresAt: T10,
    requestedAt: T0,
    snapshotEvidenceRef: 'provider-limit:snapshot-strict-xverify',
    decision: 'allow',
    reasonCode: 'allowed',
    effectiveRemaining: Object.fromEntries(
      estimates.map(estimate => [estimate.windowId, 100_000]),
    ),
    appliedPolicy: {
      policyRef: 'provider-limit-policy:strict-xverify',
      warnAtRatio: 0.7,
      blockAtRatio: 0.9,
      minimumRemaining: {},
    },
  };
}

function grant(
  projectRoot: string,
  admitted: ProviderLimitReservation,
): CrossVerifyInvocationExecutionGrant {
  const ref = createTaskResultSettlementRefForAttempt(
    projectRoot,
    admitted.taskId!,
    admitted.attemptId,
  );
  const contract = createCrossVerifyEnforcedAttemptContract({
    tenantId: admitted.tenantId,
    projectId: admitted.projectId,
    runId: admitted.runId,
    taskId: 'author-task',
    verifierTaskId: admitted.taskId!,
    callId: admitted.callId,
    attemptId: admitted.attemptId,
    fenceTokenHash: admitted.fenceTokenHash,
    operationClass: 'verify-implementation',
    basePromptSha256: '1'.repeat(64),
    dispatchedPromptSha256: '2'.repeat(64),
    taskSnapshotSha256: '3'.repeat(64),
    budget: { maxTurns: 3, maxTokens: 5_000 },
    budgetFingerprint: '4'.repeat(64),
    budgetProfileRef: 'execution-budget:strict-xverify-0001',
    budgetPolicyDigest: '5'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    attendanceMode: 'unattended',
    provider: admitted.provider,
    model: admitted.model,
    authMode: admitted.authMode,
    accountRefHash: admitted.accountRefHash,
    transport: admitted.backend.transport,
    executionBackend: admitted.backend.executionBackend,
    endpointRefHash: admitted.backend.endpointRefHash,
    executionProfileRef: 'execution-profile:strict-xverify-0001',
    providerLimitEstimates: admitted.estimates,
    timeoutMs: 120_000,
    modelEffort: 'low',
    toolProfileDigest: '6'.repeat(64),
    isolatedContext: true,
    settlementAttemptRef: ref,
  });
  return {
    reservationId: admitted.reservationId,
    dispatchEventRef: 'provider-limit-dispatch:strict-xverify-0001',
    dispatchEventHash: '7'.repeat(64),
    reservation: admitted,
    tenantId: admitted.tenantId,
    projectId: admitted.projectId,
    runId: admitted.runId,
    taskId: admitted.taskId!,
    callId: admitted.callId,
    attemptId: admitted.attemptId,
    fenceTokenHash: admitted.fenceTokenHash,
    provider: admitted.provider,
    model: admitted.model,
    receiptRef: {
      schemaVersion: 1,
      tenantId: admitted.tenantId,
      projectId: admitted.projectId,
      invocationId: 'invocation-strict-xverify',
    },
    backend: {
      ...admitted.backend,
      executionProfileRef: contract.executionProfileRef,
    },
    auth: {
      mode: admitted.authMode,
      accountRefHash: admitted.accountRefHash,
    },
    executionContract: contract,
  };
}

function terminationLedger(
  f: ReturnType<typeof fixture>,
): ExecutionTerminationLedger {
  return new ExecutionTerminationLedger(f.stateRoot, {
    dbPath: f.dbPath,
    now: () => new Date(T4),
    integrityKey: 'xverify-docker-runtime-test-integrity-key-0001',
  });
}

function closeExactAttempt(
  grantValue: CrossVerifyInvocationExecutionGrant,
  options: { billingOnly?: boolean } = {},
): void {
  const ref = grantValue.executionContract.settlementAttemptRef;
  writeTaskResultSettlementDispatchAtomic(ref, 'd'.repeat(64), T2);
  if (options.billingOnly) {
    writeTaskProviderTerminalBillingReceiptAtomic(ref, {
      source: 'provider-envelope',
      provider: grantValue.provider,
      currency: 'USD',
      providerReportedUsd: 0.125,
      modelUsage: {
        [grantValue.model]: {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 30,
          cacheCreationTokens: 40,
          costUsd: 0.12,
        },
        'claude-haiku-4-5-20251001': {
          inputTokens: 5,
          outputTokens: 1,
          costUsd: 0.005,
        },
      },
      capturedAt: T2,
    }, '8'.repeat(64), T2);
  } else {
    persistDockerTerminalProviderBillingReceipt(
      ref,
      grantValue.provider,
      JSON.stringify({
        ts: T2,
        seq: 1,
        type: 'usage',
        content: {
          total_cost_usd: 0.125,
          modelUsage: {
            [grantValue.model]: {
              inputTokens: 10,
              outputTokens: 20,
              cacheReadTokens: 30,
              cacheCreationTokens: 40,
              costUSD: 0.12,
            },
            'claude-haiku-4-5-20251001': {
              inputTokens: 5,
              outputTokens: 1,
              costUSD: 0.005,
            },
          },
        },
      }),
    );
  }
  writeTaskProviderTerminalUsageReceiptAtomic(ref, {
    version: 2,
    projectId: ref.projectRootSha256,
    taskId: ref.taskId,
    attemptId: ref.attemptId,
    budgetFingerprint: grantValue.executionContract.budgetFingerprint,
    backend: 'docker',
    terminal: true,
    decision: {
      state: 'within-budget',
      counters: {
        turns: 2,
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 30,
        cacheCreationTokens: 40,
        totalTokens: 100,
        maxContextTokens: 90,
      },
    },
    updatedAt: T3,
  });
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref,
    exitCode: 0,
    settledAt: T3,
    result: {
      taskId: ref.taskId,
      selfAssessment: 'DONE',
      notes: 'Host-observed terminal xverify protocol completed.\n'
        + 'VERDICT: CONFIRMED exact runtime authority is consistent',
      hostTerminalProjection: {
        version: 1,
        protocol: 'xverify-v1',
        observedBy: 'host',
      },
    },
  }));
  writeTaskResultSettlementClosureAtomic(ref, {
    containerDisposition: 'stopped-removed',
    locksReleased: true,
    closedAt: T4,
  });
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('CrossVerify Docker runtime authority', () => {
  it('binds prepared execution, observes exact terminal evidence and replays after restart', async () => {
    const f = fixture();
    const admitted = reservation('11111111-1111-4111-8111-111111111111');
    const grantValue = grant(f.projectRoot, admitted);
    const ref = grantValue.executionContract.settlementAttemptRef;
    writeTaskResultSettlementAttemptAtomic(ref, T0);
    claimTaskResultSettlementAttemptAtomic(ref, T0);
    writeTaskResultSettlementExecutionContractAtomic(ref, grantValue.executionContract);
    writeTaskResultSettlementPreparedAtomic(ref, grantValue.model, T1);

    const firstLedger = terminationLedger(f);
    const binding = new CrossVerifyDockerTerminationAuthority(
      firstLedger,
      grantValue,
      () => new Date(T1),
    ).bindPreparedAttempt({
      settlementRef: ref,
      executionContract: grantValue.executionContract,
    });
    expect(binding.evidenceRef).toMatch(/^execution-termination-binding:/u);
    closeExactAttempt(grantValue);

    const observer = new CrossVerifyDockerHostObservationAuthority(firstLedger, {
      now: () => new Date(T4),
      maxObservationMs: 0,
    });
    const observed = await observer.observe({
      grant: grantValue,
      reservation: admitted,
      dispatch: {
        settlementRef: ref,
        outputArtifactRef: `task-result-output:${sha256('output')}`,
      },
    });
    expect(observed).toMatchObject({
      state: 'settled',
      terminal: {
        output: expect.stringContaining('VERDICT: CONFIRMED'),
        actualCall: {
          provider: 'claude',
          model: 'claude-fable-5',
          evidenceRef: expect.stringMatching(/^provider-actual-call:/u),
        },
        execution: {
          outcome: 'completed',
          cumulativeUsage: { totalTokens: 100 },
        },
      },
    });

    firstLedger.close();
    const restartedLedger = terminationLedger(f);
    const restarted = await new CrossVerifyDockerHostObservationAuthority(restartedLedger, {
      now: () => new Date(T4),
      maxObservationMs: 0,
    }).observe({
      grant: grantValue,
      reservation: admitted,
      dispatch: {
        settlementRef: ref,
        outputArtifactRef: `task-result-output:${sha256('output')}`,
      },
    });
    expect(restarted).toEqual(observed);

    const terminal = observed.state === 'settled' ? observed.terminal : null;
    const persistedCall = readTaskProviderActualCallReceipt(ref);
    expect(persistedCall).not.toBeNull();
    expect(terminal?.actualCall?.evidenceRef)
      .toBe(taskProviderActualCallEvidenceRef(persistedCall!));
    const usage = new CrossVerifyDockerProviderUsageAuthority(
      restartedLedger,
      new Set(['claude']),
      () => new Date(T4),
    ).project({
      grant: grantValue,
      reservation: admitted,
      terminal: terminal!,
    });
    expect(usage).toMatchObject({
      state: 'settled',
      event: {
        type: 'consumed',
        actual: [
          { windowId: 'tokens-all', unit: 'tokens', amount: 100 },
          { windowId: 'billing-usd', unit: 'usd', amount: 0.125 },
          { windowId: 'requests-all', unit: 'requests', amount: 1 },
        ],
      },
    });
    restartedLedger.close();
  });

  it('derives a missing actual-call receipt after restart from immutable contract and billing', async () => {
    const f = fixture();
    const admitted = reservation('33333333-3333-4333-8333-333333333333');
    const grantValue = grant(f.projectRoot, admitted);
    const ref = grantValue.executionContract.settlementAttemptRef;
    writeTaskResultSettlementAttemptAtomic(ref, T0);
    claimTaskResultSettlementAttemptAtomic(ref, T0);
    writeTaskResultSettlementExecutionContractAtomic(ref, grantValue.executionContract);
    writeTaskResultSettlementPreparedAtomic(ref, grantValue.model, T1);

    const initialLedger = terminationLedger(f);
    new CrossVerifyDockerTerminationAuthority(
      initialLedger,
      grantValue,
      () => new Date(T1),
    ).bindPreparedAttempt({
      settlementRef: ref,
      executionContract: grantValue.executionContract,
    });
    closeExactAttempt(grantValue, { billingOnly: true });
    expect(readTaskProviderActualCallReceipt(ref)).toBeNull();
    initialLedger.close();

    const restartedLedger = terminationLedger(f);
    const observed = await new CrossVerifyDockerHostObservationAuthority(restartedLedger, {
      now: () => new Date(T4),
      maxObservationMs: 0,
    }).observe({
      grant: grantValue,
      reservation: admitted,
      dispatch: {
        settlementRef: ref,
        outputArtifactRef: `task-result-output:${sha256('restart-output')}`,
      },
    });

    expect(observed).toMatchObject({
      state: 'settled',
      terminal: {
        actualCall: {
          provider: 'claude',
          model: 'claude-fable-5',
        },
      },
    });
    expect(readTaskProviderActualCallReceipt(ref)).not.toBeNull();
    restartedLedger.close();
  });

  it('records LANDED as consumed D3 evidence and requires a fresh continuation authority', async () => {
    const f = fixture();
    const admitted = reservation('44444444-4444-4444-8444-444444444444');
    const grantValue = grant(f.projectRoot, admitted);
    const ref = grantValue.executionContract.settlementAttemptRef;
    writeTaskResultSettlementAttemptAtomic(ref, T0);
    claimTaskResultSettlementAttemptAtomic(ref, T0);
    writeTaskResultSettlementExecutionContractAtomic(ref, grantValue.executionContract);
    writeTaskResultSettlementPreparedAtomic(ref, grantValue.model, T1);

    const firstLedger = terminationLedger(f);
    new CrossVerifyDockerTerminationAuthority(
      firstLedger,
      grantValue,
      () => new Date(T1),
    ).bindPreparedAttempt({
      settlementRef: ref,
      executionContract: grantValue.executionContract,
    });
    writeTaskResultSettlementDispatchAtomic(ref, 'd'.repeat(64), T2);
    const checkpoint = createExecutionLandingCheckpoint(f.projectRoot, {
      taskId: ref.taskId,
      attemptId: ref.attemptId,
      tenantId: grantValue.tenantId,
      originalRequestDigest: '1'.repeat(64),
      taskDigest: '2'.repeat(64),
      role: 'auditor',
      kind: 'audit',
      admissionMode: grantValue.executionContract.attendanceMode,
      identity: {
        configuredProvider: grantValue.provider,
        configuredModel: grantValue.model,
        requestedProvider: grantValue.provider,
        requestedModel: grantValue.model,
        resolvedProvider: grantValue.provider,
        resolvedModel: grantValue.model,
        calledProvider: grantValue.provider,
        calledModel: grantValue.model,
        backend: 'docker',
        auth: grantValue.auth.mode,
        fallbackReason: null,
      },
      policyDigest: grantValue.executionContract.budgetPolicyDigest,
      landingPolicy: grantValue.executionContract.landingPolicy,
      hardBudget: grantValue.executionContract.budget,
      cumulativeUsage: {
        turns: 2,
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 30,
        cacheCreationTokens: 40,
        totalTokens: 100,
        maxContextTokens: 90,
      },
      attemptFence: 'strict-xverify-landed-fence',
      providerSequence: {
        firstSequence: 1,
        lastSequence: 1,
        eventCount: 1,
        eventDigest: '3'.repeat(64),
      },
      semanticState: {
        summary: 'Exact verifier landed before a semantic verdict.',
        completedWork: ['Persisted immutable parent evidence.'],
        remainingWork: ['Author a fresh exact continuation invocation.'],
        nextAction: 'Hold for a fresh receipt and reservation.',
        unresolvedRisks: ['No semantic verdict exists yet.'],
      },
      scope: {
        filesRead: ['src/orchestra/cross-verify-docker-runtime-authority.ts'],
        filesWrite: [],
      },
      diskDiffRefs: [`scope-diff:sha256:${'4'.repeat(64)}`],
      evidenceRefs: [grantValue.executionContract.evidenceRef],
      acceptanceCriteria: 'A child verifier call requires a fresh exact authority.',
      landingRequestedAt: T2,
      landedAt: T3,
    });
    writeExecutionLandingCheckpointAtomic(f.projectRoot, checkpoint);
    writeExecutionAttemptRetirementAtomic(f.projectRoot, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      runtimeDisposition: 'stopped-removed',
      resourcesReleased: true,
      evidenceRefs: [`docker-runtime-release:sha256:${'5'.repeat(64)}`],
      retiredAt: T3,
    });
    writeTaskResultSettlementLandedRetirementAtomic(ref, T3);

    const first = await new CrossVerifyDockerHostObservationAuthority(firstLedger, {
      now: () => new Date(T4),
      maxObservationMs: 0,
    }).observe({
      grant: grantValue,
      reservation: admitted,
      dispatch: {
        settlementRef: ref,
        outputArtifactRef: `task-result-output:${sha256('landed-output')}`,
      },
    });
    expect(first).toMatchObject({
      state: 'hold',
      reasonCode: 'execution_lineage_partial',
      authorityEvidenceRef: expect.stringMatching(/^execution-termination:/u),
    });
    if (first.state !== 'hold') throw new Error('Expected LANDED reconciliation HOLD');
    expect(firstLedger.getTerminalByEvidenceRef(first.authorityEvidenceRef)).toMatchObject({
      value: {
        terminalOutcome: 'landed',
        capacityDisposition: 'consumed',
      },
    });

    firstLedger.close();
    const restartedLedger = terminationLedger(f);
    const restarted = await new CrossVerifyDockerHostObservationAuthority(restartedLedger, {
      now: () => new Date(T4),
      maxObservationMs: 0,
    }).observe({
      grant: grantValue,
      reservation: admitted,
      dispatch: {
        settlementRef: ref,
        outputArtifactRef: `task-result-output:${sha256('landed-output')}`,
      },
    });
    expect(restarted).toEqual(first);
    restartedLedger.close();
  });

  it('holds unsupported percent windows before dispatch settlement', () => {
    const f = fixture();
    const admitted = reservation(
      '22222222-2222-4222-8222-222222222222',
      [{ windowId: 'session-percent', unit: 'percent', amount: 1 }],
    );
    const store = terminationLedger(f);
    expect(new CrossVerifyDockerProviderUsageAuthority(store).preflight({
      reservation: admitted,
      executionProfileRef: 'execution-profile:strict-xverify-0001',
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'window_mapper_unavailable',
    });
    store.close();
  });
});
