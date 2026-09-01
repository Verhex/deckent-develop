import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCrossVerifyEnforcedAttemptContract } from '../../src/core/cross-verify-execution-contract.js';
import {
  claimExecutionContinuationAtomic,
  createExecutionLandingCheckpointV2,
  createExecutionLandingCustodyRefV2,
  createExecutionLandingOperationalPayloadV2,
  createExecutionLandingPreparationRefV2,
  createExecutionLandingResultSourceBindingV2,
  createExecutionLandingVerifiedArtifactBindingV2,
  createExecutionLandingCheckpoint,
  readExecutionContinuationClaim,
  readExecutionContinuationClaimV2,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionAttemptRetirementAtomicV2,
  writeExecutionLandingCheckpointAtomic,
  writeExecutionLandingCheckpointAtomicV2,
  type CreateExecutionLandingCheckpointInput,
} from '../../src/core/execution-landing-checkpoint.js';
import {
  openOrCreateExecutionLandingContextV2,
  writeExecutionLandingDiskEvidenceAtomicV2,
} from '../../src/core/execution-landing-context.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementExecutionContractAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
  writeTaskResultSettlementPreparedAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  dispatchExactExecutionContinuation,
  dispatchExecutionContinuation,
} from '../../src/orchestra/execution-continuation-runner.js';
import { RuntimeBudgetMonitor } from '../../src/orchestra/runtime-budget-monitor.js';
import type {
  ExactDockerCustodyCompletionV2,
  ExactDockerCustodyDispatchEnvelopeV2,
  ExactDockerCustodyDispatchOutcomeV2,
  PrepareExactDockerCustodyInputV2,
  PreparedExactDockerCustodyV2,
  SpawnBackend,
} from '../../src/orchestra/spawn-backend.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-continuation-runner-'));
  roots.push(base);
  const root = join(base, 'project');
  mkdirSync(root, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return { root };
}

function checkpointInput(attemptId: string): CreateExecutionLandingCheckpointInput {
  return {
    taskId: 'task-continuation-runner',
    attemptId,
    tenantId: 'tenant-a',
    originalRequestDigest: '1'.repeat(64),
    taskDigest: '2'.repeat(64),
    role: 'worker',
    kind: 'code-development',
    admissionMode: 'unattended',
    identity: {
      configuredProvider: 'anthropic',
      configuredModel: 'claude-fable-5',
      requestedProvider: 'anthropic',
      requestedModel: 'claude-fable-5',
      resolvedProvider: 'anthropic',
      resolvedModel: 'claude-fable-5',
      calledProvider: 'anthropic',
      calledModel: 'claude-fable-5',
      backend: 'docker',
      auth: 'subscription',
      fallbackReason: null,
    },
    policyDigest: '3'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    hardBudget: { maxTokens: 1_000, maxCacheReadTokens: 800, maxContextTokens: 4_000 },
    cumulativeUsage: {
      turns: 2,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 500,
      cacheCreationTokens: 50,
      totalTokens: 700,
      maxContextTokens: 650,
    },
    attemptFence: 'fence-parent',
    providerSequence: {
      firstSequence: 1,
      lastSequence: 4,
      eventCount: 4,
      eventDigest: '4'.repeat(64),
    },
    semanticState: {
      summary: 'The attempt landed after completing the checkpoint authority.',
      completedWork: ['Created immutable checkpoint and retirement receipts.'],
      remainingWork: ['Wire the bounded continuation.'],
      nextAction: 'Dispatch from the first-writer continuation claim.',
      unresolvedRisks: [],
    },
    scope: {
      filesRead: ['src/core/execution-landing-checkpoint.ts'],
      filesWrite: ['src/orchestra/execution-continuation-runner.ts'],
    },
    diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
    evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
    acceptanceCriteria: 'Continuation must use remaining cumulative budget and exact scope.',
    landingRequestedAt: '2026-07-23T18:00:00.000Z',
    landedAt: '2026-07-23T18:00:01.000Z',
  };
}

function persistedPredecessor(
  root: string,
  customize?: (input: CreateExecutionLandingCheckpointInput) => void,
  withStartupObservation = true,
) {
  const attemptId = randomUUID();
  const settlementRef = createTaskResultSettlementRefForAttempt(
    root,
    'task-continuation-runner',
    attemptId,
  );
  writeTaskResultSettlementAttemptAtomic(settlementRef);
  claimTaskResultSettlementAttemptAtomic(settlementRef);
  const input = checkpointInput(attemptId);
  customize?.(input);
  const checkpoint = createExecutionLandingCheckpoint(root, input);
  writeExecutionLandingCheckpointAtomic(root, checkpoint);
  writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
    checkpointSha256: checkpoint.checkpointSha256,
    runtimeDisposition: 'stopped-removed',
    resourcesReleased: true,
    evidenceRefs: [`runtime-release:sha256:${'7'.repeat(64)}`],
  });
  writeTaskResultSettlementLandedRetirementAtomic(settlementRef);
  if (withStartupObservation) {
    const monitor = new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId: input.taskId,
      attemptId,
      backend: 'docker',
      budget: input.hardBudget,
      onStop: vi.fn(),
    });
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'parent-startup-call',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 20,
          },
          content: [],
        },
      },
    }, 1);
  }
  return checkpoint;
}

function persistedExactPredecessor(root: string) {
  const digest = (character: string): `sha256:${string}` =>
    `sha256:${character.repeat(64)}`;
  const privateIdentity = {
    schemaVersion: 2 as const,
    backend: 'docker' as const,
    projectRootSha256: createHash('sha256').update(realpathSync.native(root)).digest('hex'),
    projectId: 'project',
    taskId: 'task',
    attemptId: randomUUID(),
    generation: 1,
  };
  const preparationRef = createExecutionLandingPreparationRefV2({
    dispatchRequestId: `dreq-${'1'.repeat(64)}`,
    dispatchRequestMaterialDigest: digest('1'),
    privateIdentity,
    admissionReceiptDigest: digest('2'),
    admissionRefDigest: digest('3'),
    admittedAt: '2026-09-01T00:40:00.000Z',
    policyDigest: digest('4'),
    taskSnapshotDigest: digest('5'),
    providerInvocationDigest: digest('6'),
  });
  const identity = {
    configuredProvider: 'claude', configuredModel: 'claude-fable-5',
    requestedProvider: 'claude', requestedModel: 'claude-fable-5',
    resolvedProvider: 'claude', resolvedModel: 'claude-fable-5',
    calledProvider: 'claude', calledModel: 'claude-fable-5',
    backend: 'docker' as const, auth: 'subscription', fallbackReason: null,
  };
  const preparationInput = {
    taskId: privateIdentity.taskId,
    tenantId: 'tenant-a',
    originalRequestDigest: '7'.repeat(64),
    taskDigest: '8'.repeat(64),
    taskSnapshotDigest: preparationRef.taskSnapshotDigest,
    providerInvocationDigest: preparationRef.providerInvocationDigest,
    role: 'worker' as const,
    taskKind: 'code-development' as const,
    admissionMode: 'unattended' as const,
    approvalEvidenceRef: null,
    identity,
    policyDigest: preparationRef.policyDigest.slice('sha256:'.length),
    landingPolicy: { reserve_ratio: 0.25 },
    hardBudget: { maxTokens: 1_000, maxTurns: 10 },
    parentAttemptId: null,
    parentFence: null,
    parentCheckpointSha256: null,
    attemptFence: 'parent-fence',
    scope: { filesRead: ['continuation.ts'], filesWrite: ['continuation.ts'] },
    acceptanceCriteria: 'Continuation preserves exact retired custody.',
  };
  writeFileSync(join(root, 'continuation.ts'), 'before\n');
  const context = openOrCreateExecutionLandingContextV2(root, {
    preparationRef,
    preparationInput,
    preparedAt: '2026-09-01T00:41:00.000Z',
  });
  const resultSource = createExecutionLandingResultSourceBindingV2({
    artifactClass: 'worker-result', artifactKey: 'parent-result',
    identity: privateIdentity, admissionReceiptDigest: preparationRef.admissionReceiptDigest,
    policyDigest: preparationRef.policyDigest, artifactReceiptDigest: digest('9'),
    contentDigest: digest('a'), byteLength: 12,
    capturedAt: '2026-09-01T00:44:00.000Z',
  });
  const landingArtifact = createExecutionLandingVerifiedArtifactBindingV2({
    artifactClass: 'worker-landing-proposal', artifactKey: 'parent-landing',
    identity: privateIdentity, admissionReceiptDigest: preparationRef.admissionReceiptDigest,
    policyDigest: preparationRef.policyDigest, artifactReceiptDigest: digest('b'),
    contentDigest: digest('c'), byteLength: 12,
    capturedAt: '2026-09-01T00:45:00.000Z',
    verifiedAt: '2026-09-01T00:46:00.000Z',
  });
  const providerExecutionAttemptId = randomUUID();
  const custodyRef = createExecutionLandingCustodyRefV2({
    dispatchState: 'RELEASED', preparationRef, providerExecutionAttemptId,
    providerExecutionAttemptIdentityDigest: digest('d'),
    dispatchAuthorityReceiptDigest: digest('e'), releaseReceiptRefDigest: digest('f'),
    releaseEvidenceDigest: digest('0'), releasedAt: '2026-09-01T00:42:00.000Z',
    providerStartReceiptRefDigest: digest('1'), providerStartEvidenceDigest: digest('2'),
    providerStartAcceptedAt: '2026-09-01T00:43:00.000Z', projectionFence: digest('3'),
    resultSource, landingArtifact,
  });
  writeFileSync(join(root, 'continuation.ts'), 'after\n');
  const diskEvidence = writeExecutionLandingDiskEvidenceAtomicV2(
    root, context, custodyRef, '2026-09-01T00:46:30.000Z',
  );
  const operationalPayload = createExecutionLandingOperationalPayloadV2(root, {
    taskId: privateIdentity.taskId, attemptId: providerExecutionAttemptId,
    tenantId: preparationInput.tenantId,
    originalRequestDigest: preparationInput.originalRequestDigest,
    taskDigest: preparationInput.taskDigest, role: preparationInput.role,
    kind: preparationInput.taskKind, admissionMode: preparationInput.admissionMode,
    approvalEvidenceRef: null, identity, policyDigest: preparationInput.policyDigest,
    landingPolicy: preparationInput.landingPolicy, hardBudget: preparationInput.hardBudget,
    cumulativeUsage: { turns: 2, inputTokens: 10, outputTokens: 10, cacheReadTokens: 0,
      cacheCreationTokens: 0, totalTokens: 20, maxContextTokens: 20 },
    parentAttemptId: null, parentFence: null, parentCheckpointSha256: null,
    attemptFence: preparationInput.attemptFence,
    providerSequence: { firstSequence: 1, lastSequence: 2, eventCount: 2,
      eventDigest: '9'.repeat(64) },
    semanticState: { summary: 'Parent landed.', completedWork: ['parent'],
      remainingWork: ['continuation'], nextAction: 'continue', unresolvedRisks: [] },
    scope: preparationInput.scope, diskEvidenceDigest: diskEvidence.evidenceDigest,
    evidenceRefs: [`provider-exit:sha256:${'8'.repeat(64)}`],
    acceptanceCriteria: preparationInput.acceptanceCriteria,
    landingRequestedAt: '2026-09-01T00:45:30.000Z',
    landedAt: '2026-09-01T00:47:00.000Z',
  });
  const checkpoint = createExecutionLandingCheckpointV2(root, {
    custodyRef, operationalPayload, contextDigest: context.contextDigest,
    diskEvidenceDigest: diskEvidence.evidenceDigest,
    landedAt: '2026-09-01T00:47:00.000Z',
  });
  writeExecutionLandingCheckpointAtomicV2(root, checkpoint);
  const retirement = writeExecutionAttemptRetirementAtomicV2(root, checkpoint.checkpoint.ref, {
    checkpointDigest: checkpoint.checkpointDigest,
    runtimeDisposition: 'checkpointed-process-exited', resourcesReleased: true,
    evidenceDigests: [digest('7')], retiredAt: '2026-09-01T00:48:00.000Z',
  });
  return { checkpoint, retirement, custodyRef, preparationInput };
}

function backend(capability: SpawnBackend['executionLandingCapability'] = 'checkpoint-stop'): SpawnBackend {
  const executionBackend: SpawnBackend = {
    name: 'docker',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: capability,
    spawn: vi.fn((_taskId, model, _prompt, opts) => {
      if (!opts?.settlementRef) return;
      writeTaskResultSettlementPreparedAtomic(opts.settlementRef, model);
      writeTaskResultSettlementDispatchAtomic(opts.settlementRef, 'a'.repeat(64));
    }),
    kill: vi.fn(),
    list: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
  };
  return executionBackend;
}

afterEach(() => {
  vi.useRealTimers();
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('execution continuation runner', () => {
  it('uses only the async exact custody port and awaits the released start-bound identity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-01T01:00:30.000Z');
    const { root } = fixture();
    const predecessor = persistedExactPredecessor(root);
    const spawn = vi.fn();
    const digest = (character: string): `sha256:${string}` =>
      `sha256:${character.repeat(64)}`;
    const envelope = Object.freeze({}) as ExactDockerCustodyDispatchEnvelopeV2;
    const providerStartReceipt = Object.freeze({ ref: digest('1'), digest: digest('2') });
    const continuationIdentity = {
      ...predecessor.custodyRef.preparationRef.privateIdentity,
      generation: predecessor.custodyRef.preparationRef.privateIdentity.generation + 1,
    };
    const preparationRef = createExecutionLandingPreparationRefV2({
      dispatchRequestId: `dreq-${'e'.repeat(64)}`,
      dispatchRequestMaterialDigest: digest('9'),
      privateIdentity: continuationIdentity,
      admissionReceiptDigest: digest('4'),
      admissionRefDigest: digest('5'),
      admittedAt: '2026-09-01T01:00:00.000Z',
      policyDigest: digest('b'),
      taskSnapshotDigest: digest('c'),
      providerInvocationDigest: digest('d'),
    });
    const custodyRef = {
      dispatchRequestId: preparationRef.dispatchRequestId,
      identity: continuationIdentity,
      admissionReceiptDigest: preparationRef.admissionReceiptDigest,
      admissionRefDigest: preparationRef.admissionRefDigest,
      providerStartReceipt,
    } as const;
    const releaseReceipt = Object.freeze({ ref: digest('6'), digest: digest('7') });
    const projectionFence = digest('8');
    const providerExecutionAttemptId = randomUUID();
    const released = Object.freeze({
      kind: 'released',
      settlementRef: {
        schemaVersion: 1, taskId: continuationIdentity.taskId, backend: 'docker',
        projectRootSha256: continuationIdentity.projectRootSha256,
        attemptId: providerExecutionAttemptId,
      },
      admissionRef: {
        dispatchRequestId: custodyRef.dispatchRequestId,
        dispatchRequestMaterialDigest: digest('9'),
        admissionRefDigest: custodyRef.admissionRefDigest,
      },
      preparationRef,
      custodyRef,
      providerExecutionAttempt: {
        schemaVersion: 2,
        kind: 'task-attempt-custody-provider-execution-attempt',
        providerExecutionAttemptId,
        custodyIdentity: custodyRef.identity,
        admissionReceiptDigest: custodyRef.admissionReceiptDigest,
        backendExecutionId: 'container-exact-1',
        identityDigest: digest('a'),
      },
      backendExecutionId: 'container-exact-1',
      mountReceiptDigest: digest('b'),
      dispatchReceipt: { ref: digest('c'), digest: digest('d') },
      releaseReceipt,
      providerStartReceipt,
      projectionFence,
      releasedAt: '2026-09-01T01:01:00.000Z',
      providerStartAcceptedAt: '2026-09-01T01:02:00.000Z',
    }) satisfies Extract<ExactDockerCustodyDispatchOutcomeV2, { kind: 'released' }>;
    const prepared = Object.freeze({
      kind: 'exact-docker-custody-prepared', dispatchEnvelope: envelope,
      admissionRef: released.admissionRef,
      preparationRef,
    }) satisfies PreparedExactDockerCustodyV2;
    const prepareExactDockerCustody = vi.fn(async () => prepared);
    const dispatchExactDockerCustody = vi.fn(async () => released);
    const terminal = Object.freeze({
      kind: 'capture-hold', custodyRef, releaseReceipt, projectionFence,
      reasonCode: 'LIVE_MONITOR_UNAVAILABLE',
      evidence: { kind: 'release-authority', receipt: releaseReceipt },
    }) satisfies ExactDockerCustodyCompletionV2;
    const awaitExactDockerCustodyTerminal = vi.fn(async () => terminal);
    const exactBackend = {
      ...backend(), spawn,
      prepareExactDockerCustody,
      dispatchExactDockerCustody,
      awaitExactDockerCustodyTerminal,
    };
    const preparation = Object.freeze({
      dispatchRequestId: preparationRef.dispatchRequestId,
      projectId: 'project',
      taskId: 'task',
      approvedTaskMaterial: { taskId: 'task', accepted: true },
      approvedTaskMaterialDigest: digest('f'),
      dispatchTaskMaterial: { taskId: 'task', promptPlan: 'exact' },
      dispatchTaskMaterialDigest: digest('0'),
      lineageMaterial: { kind: 'continuation', ordinal: 2 },
      lineageMaterialDigest: digest('1'),
      prompt: 'continue from the verified landing checkpoint',
      systemPromptCore: 'immutable worker core',
      model: 'claude-fable-5',
      execution: {
        allowedTools: 'Read,Edit', availableTools: 'Read,Edit',
        authMode: 'subscription', isolatedContext: true,
        reasoningEffort: 'high', excludeDynamicPromptSections: true,
        taskTimeoutSeconds: 120, actionId: 'continuation-2',
        executionBudget: { maxTurns: 4 },
        executionLandingPolicy: { reserve_ratio: 0.25 },
        executionAdmissionMode: 'unattended',
        executionApprovalEvidenceRef: null,
        finalOnlyUsageContainment: null,
      },
      predecessor: {
        dispatchRequestId: predecessor.custodyRef.preparationRef.dispatchRequestId,
        identity: predecessor.custodyRef.preparationRef.privateIdentity,
        admissionReceiptDigest: predecessor.custodyRef.preparationRef.admissionReceiptDigest,
        admissionRefDigest: predecessor.custodyRef.preparationRef.admissionRefDigest,
        providerStartReceipt: {
          ref: predecessor.custodyRef.providerStartReceiptRefDigest,
          digest: predecessor.custodyRef.providerStartEvidenceDigest,
        },
      },
    }) satisfies PrepareExactDockerCustodyInputV2;
    const landingPreparationInput = {
      ...predecessor.preparationInput,
      taskSnapshotDigest: preparationRef.taskSnapshotDigest,
      providerInvocationDigest: preparationRef.providerInvocationDigest,
      policyDigest: preparationRef.policyDigest.slice('sha256:'.length),
      parentAttemptId: predecessor.custodyRef.providerExecutionAttemptId,
      parentFence: predecessor.custodyRef.projectionFence,
      parentCheckpointSha256: predecessor.checkpoint.checkpointDigest,
      attemptFence: 'continuation-fence',
    };

    dispatchExactDockerCustody.mockResolvedValueOnce({
      ...released,
      releasedAt: '2026-09-01T00:47:30.000Z',
    });
    await expect(dispatchExactExecutionContinuation({
      backend: exactBackend,
      projectRoot: root,
      predecessorRef: predecessor.checkpoint.checkpoint.ref,
      checkpointDigest: predecessor.checkpoint.checkpointDigest,
      retirementReceiptDigest: predecessor.retirement.receiptDigest,
      preparation,
      landingPreparationInput,
      awaitTerminal: false,
    })).rejects.toThrow(/released custody bindings are inconsistent/);
    expect(readExecutionContinuationClaimV2(
      root, predecessor.checkpoint.checkpoint.ref,
    )).toBeNull();

    await expect(dispatchExactExecutionContinuation({
      backend: exactBackend,
      projectRoot: root,
      predecessorRef: predecessor.checkpoint.checkpoint.ref,
      checkpointDigest: predecessor.checkpoint.checkpointDigest,
      retirementReceiptDigest: predecessor.retirement.receiptDigest,
      preparation,
      landingPreparationInput,
      awaitTerminal: true,
    })).resolves.toMatchObject({ state: 'released', dispatch: released, terminal });
    expect(spawn).not.toHaveBeenCalled();
    expect(prepareExactDockerCustody).toHaveBeenCalledWith(preparation);
    expect(dispatchExactDockerCustody).toHaveBeenCalledWith(envelope);
    expect(awaitExactDockerCustodyTerminal).toHaveBeenCalledWith({
      custodyRef, releaseReceipt, providerStartReceipt, projectionFence,
    });
    const second = await dispatchExactExecutionContinuation({
      backend: exactBackend,
      projectRoot: root,
      predecessorRef: predecessor.checkpoint.checkpoint.ref,
      checkpointDigest: predecessor.checkpoint.checkpointDigest,
      retirementReceiptDigest: predecessor.retirement.receiptDigest,
      preparation,
      landingPreparationInput,
      awaitTerminal: false,
    });
    expect(second.state).toBe('released');
    expect(prepareExactDockerCustody).toHaveBeenCalledTimes(3);
  });

  it('never falls back to generic spawn when an exact continuation port is incomplete', async () => {
    const executionBackend = backend();
    await expect(dispatchExactExecutionContinuation({
      backend: executionBackend,
      preparation: { predecessor: {} } as never,
      awaitTerminal: false,
    })).rejects.toThrow(/complete Docker custody port/);
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });

  it('publishes zero continuation claim for contained or ambiguous exact dispatch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-01T01:10:30.000Z');
    const { root } = fixture();
    const predecessor = persistedExactPredecessor(root);
    const digest = (character: string): `sha256:${string}` =>
      `sha256:${character.repeat(64)}`;
    const privateIdentity = {
      ...predecessor.custodyRef.preparationRef.privateIdentity,
      generation: predecessor.custodyRef.preparationRef.privateIdentity.generation + 1,
    };
    const preparationRef = createExecutionLandingPreparationRefV2({
      dispatchRequestId: `dreq-${'f'.repeat(64)}`,
      dispatchRequestMaterialDigest: digest('1'), privateIdentity,
      admissionReceiptDigest: digest('2'), admissionRefDigest: digest('3'),
      admittedAt: '2026-09-01T01:10:00.000Z', policyDigest: digest('4'),
      taskSnapshotDigest: digest('5'), providerInvocationDigest: digest('6'),
    });
    const envelope = Object.freeze({}) as ExactDockerCustodyDispatchEnvelopeV2;
    const prepared = {
      kind: 'exact-docker-custody-prepared' as const,
      dispatchEnvelope: envelope,
      admissionRef: {
        dispatchRequestId: preparationRef.dispatchRequestId,
        dispatchRequestMaterialDigest: preparationRef.dispatchRequestMaterialDigest,
        admissionRefDigest: preparationRef.admissionRefDigest,
      },
      preparationRef,
    };
    const predecessorRef = {
      dispatchRequestId: predecessor.custodyRef.preparationRef.dispatchRequestId,
      identity: predecessor.custodyRef.preparationRef.privateIdentity,
      admissionReceiptDigest: predecessor.custodyRef.preparationRef.admissionReceiptDigest,
      admissionRefDigest: predecessor.custodyRef.preparationRef.admissionRefDigest,
      providerStartReceipt: {
        ref: predecessor.custodyRef.providerStartReceiptRefDigest,
        digest: predecessor.custodyRef.providerStartEvidenceDigest,
      },
    };
    const preparation = {
      dispatchRequestId: preparationRef.dispatchRequestId,
      projectId: privateIdentity.projectId,
      taskId: privateIdentity.taskId,
      approvedTaskMaterial: { accepted: true }, approvedTaskMaterialDigest: digest('7'),
      dispatchTaskMaterial: { id: privateIdentity.taskId, scope: {
        filesRead: ['continuation.ts'], filesWrite: ['continuation.ts'],
      } },
      dispatchTaskMaterialDigest: digest('8'),
      lineageMaterial: { kind: 'continuation' }, lineageMaterialDigest: digest('9'),
      prompt: 'continue', systemPromptCore: null, model: 'claude-fable-5' as const,
      execution: {
        allowedTools: null, availableTools: null, authMode: 'subscription' as const,
        isolatedContext: true, reasoningEffort: null, excludeDynamicPromptSections: true,
        taskTimeoutSeconds: 120, actionId: null, executionBudget: null,
        executionLandingPolicy: { reserve_ratio: 0.25 },
        executionAdmissionMode: 'unattended', executionApprovalEvidenceRef: null,
        finalOnlyUsageContainment: null,
      },
      predecessor: predecessorRef,
    } satisfies PrepareExactDockerCustodyInputV2;
    const landingPreparationInput = {
      ...predecessor.preparationInput,
      taskSnapshotDigest: preparationRef.taskSnapshotDigest,
      providerInvocationDigest: preparationRef.providerInvocationDigest,
      policyDigest: preparationRef.policyDigest.slice('sha256:'.length),
      parentAttemptId: predecessor.custodyRef.providerExecutionAttemptId,
      parentFence: predecessor.custodyRef.projectionFence,
      parentCheckpointSha256: predecessor.checkpoint.checkpointDigest,
      attemptFence: 'contained-continuation',
    };
    const outcomes = [
      {
        kind: 'not-dispatched', admissionRef: prepared.admissionRef,
        custodyRef: {
          dispatchRequestId: preparationRef.dispatchRequestId, identity: privateIdentity,
          admissionReceiptDigest: preparationRef.admissionReceiptDigest,
          admissionRefDigest: preparationRef.admissionRefDigest,
        },
        providerAttemptCount: 0, providerExecutionAttempt: null,
        reasonCode: 'PLATFORM_UNSUPPORTED',
        zeroWorkReceipt: { ref: digest('a'), digest: digest('b') },
        projectionFence: digest('c'),
      },
      {
        kind: 'ambiguous', admissionRef: prepared.admissionRef,
        custodyRef: {
          dispatchRequestId: preparationRef.dispatchRequestId, identity: privateIdentity,
          admissionReceiptDigest: preparationRef.admissionReceiptDigest,
          admissionRefDigest: preparationRef.admissionRefDigest,
        },
        reasonCode: 'MOUNT_RECONCILIATION_REQUIRED',
        reconciliationReceipt: { ref: digest('d'), digest: digest('e') },
        projectionFence: digest('f'),
      },
    ] as const;
    for (const outcome of outcomes) {
      const exactBackend = {
        ...backend(),
        prepareExactDockerCustody: vi.fn(async () => prepared),
        dispatchExactDockerCustody: vi.fn(async () => outcome as never),
      };
      await expect(dispatchExactExecutionContinuation({
        backend: exactBackend, projectRoot: root,
        predecessorRef: predecessor.checkpoint.checkpoint.ref,
        checkpointDigest: predecessor.checkpoint.checkpointDigest,
        retirementReceiptDigest: predecessor.retirement.receiptDigest,
        preparation, landingPreparationInput,
        awaitTerminal: false,
      })).resolves.toMatchObject({ state: outcome.kind, dispatch: outcome });
      expect(readExecutionContinuationClaimV2(
        root, predecessor.checkpoint.checkpoint.ref,
      )).toBeNull();
      expect(exactBackend.spawn).not.toHaveBeenCalled();
    }
  });

  it('rejects the legacy continuation surface for a production exact Docker backend', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root);
    const executionBackend: SpawnBackend = {
      ...backend(),
      prepareExactDockerCustody: vi.fn(),
      dispatchExactDockerCustody: vi.fn(),
    };

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/async exact-custody continuation port/);
    expect(executionBackend.spawn).not.toHaveBeenCalled();
    expect(readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).toBeNull();
  });

  it('dispatches once and adopts the same first-writer lineage on retry', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root);
    const executionBackend = backend();

    const first = dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
      spawnOptions: { autoApprove: true },
    });
    const retry = dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
      spawnOptions: { autoApprove: true },
    });

    expect(first.state).toBe('dispatched');
    expect(retry.state).toBe('adopted');
    expect(retry.claim).toEqual(first.claim);
    expect(executionBackend.spawn).toHaveBeenCalledTimes(1);
    expect(executionBackend.spawn).toHaveBeenCalledWith(
      checkpoint.checkpoint.taskId,
      'claude-fable-5',
      expect.stringContaining(checkpoint.checkpointSha256),
      expect.objectContaining({
        executionBudget: {
          maxTokens: 300,
          maxCacheReadTokens: 300,
          maxContextTokens: 4_000,
        },
        executionLandingPolicy: { reserve_ratio: 0.25 },
        executionAdmissionMode: 'unattended',
        executionContinuation: expect.objectContaining({
          checkpointSha256: checkpoint.checkpointSha256,
          continuationAttemptId: first.claim.continuationAttemptId,
        }),
        settlementRef: expect.objectContaining({
          attemptId: first.claim.continuationAttemptId,
        }),
      }),
    );
  });

  it('holds before claim when backend landing capability is unsupported', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root);
    const executionBackend = backend('unsupported');

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/does not support budget landing/);
    expect(executionBackend.spawn).not.toHaveBeenCalled();
    expect(readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).toBeNull();
  });

  it('holds an exact xverify parent before continuation claim or generic spawn', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root);
    const predecessorRef = createTaskResultSettlementRefForAttempt(
      root,
      checkpoint.checkpoint.taskId,
      checkpoint.checkpoint.attemptId,
    );
    writeTaskResultSettlementExecutionContractAtomic(
      predecessorRef,
      createCrossVerifyEnforcedAttemptContract({
        tenantId: checkpoint.checkpoint.tenantId,
        projectId: 'project-a',
        runId: 'run-a',
        taskId: 'author-task',
        verifierTaskId: checkpoint.checkpoint.taskId,
        callId: 'call-a',
        attemptId: checkpoint.checkpoint.attemptId,
        fenceTokenHash: '8'.repeat(64),
        operationClass: 'verify-implementation',
        basePromptSha256: '9'.repeat(64),
        dispatchedPromptSha256: 'a'.repeat(64),
        taskSnapshotSha256: 'b'.repeat(64),
        budget: { maxTokens: 1_000, maxCacheReadTokens: 800 },
        budgetFingerprint: 'c'.repeat(64),
        budgetProfileRef: 'execution-budget:xverify-continuation-test',
        budgetPolicyDigest: 'd'.repeat(64),
        landingPolicy: { reserve_ratio: 0.25 },
        attendanceMode: 'unattended',
        provider: 'claude',
        model: 'claude-fable-5',
        authMode: 'subscription',
        accountRefHash: 'e'.repeat(64),
        transport: 'cli',
        executionBackend: 'docker',
        endpointRefHash: null,
        executionProfileRef: 'execution-profile:xverify-continuation-test',
        providerLimitEstimates: [{
          windowId: 'tokens-all',
          unit: 'tokens',
          amount: 1_000,
        }],
        timeoutMs: 120_000,
        modelEffort: 'low',
        toolProfileDigest: 'f'.repeat(64),
        isolatedContext: true,
        settlementAttemptRef: predecessorRef,
      }),
    );
    const executionBackend = backend();

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/fresh invocation, reservation and attempt contract/);
    expect(readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).toBeNull();
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });

  it('holds before claim when requested backend differs from checkpoint identity', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root);
    const executionBackend = { ...backend(), name: 'subprocess' };

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/backend mismatch/);
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });

  it('retries the exact claimed attempt when host crashed before Docker prepare', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root);
    const continuationAttemptId = randomUUID();
    const claim = claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      continuationAttemptId,
      continuationFence: 'continuation-crash-fence',
    });
    const settlementRef = createTaskResultSettlementRefForAttempt(
      root,
      checkpoint.checkpoint.taskId,
      continuationAttemptId,
    );
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    const executionBackend = backend();

    const resumed = dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    });

    expect(resumed.state).toBe('dispatched');
    expect(resumed.claim).toEqual(claim);
    expect(resumed.settlementRef).toEqual(settlementRef);
    expect(executionBackend.spawn).toHaveBeenCalledOnce();
  });

  it('holds an under-reserved legacy checkpoint before first claim and spawn', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root, input => {
      input.hardBudget.maxTurns = 5;
      input.cumulativeUsage.turns = 4;
    });
    const executionBackend = backend();

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/turn reserve is insufficient: remaining=1, required=2/);
    expect(readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).toBeNull();
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });

  it('holds before claim when the observed parent startup floor cannot fit', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root, input => {
      input.hardBudget.maxCacheCreationTokens = 65;
    });
    const executionBackend = backend();

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(
      /observed startup reserve is insufficient for cache-creation token: remaining=15, required=20/,
    );
    expect(readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).toBeNull();
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });

  it('holds before claim when immutable parent startup evidence is missing', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root, undefined, false);
    const executionBackend = backend();

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/requires an immutable incremental parent startup observation/);
    expect(readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).toBeNull();
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });

  it('holds an under-reserved pre-dispatch claim but adopts durable dispatch evidence', () => {
    const { root } = fixture();
    const checkpoint = persistedPredecessor(root, input => {
      input.hardBudget.maxTurns = 5;
      input.cumulativeUsage.turns = 4;
    });
    const claim = claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      continuationAttemptId: randomUUID(),
      continuationFence: 'continuation-under-reserved-fence',
    });
    const settlementRef = createTaskResultSettlementRefForAttempt(
      root,
      checkpoint.checkpoint.taskId,
      claim.continuationAttemptId,
    );
    const executionBackend = backend();

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/turn reserve is insufficient/);
    expect(executionBackend.spawn).not.toHaveBeenCalled();

    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    writeTaskResultSettlementPreparedAtomic(settlementRef, 'claude-fable-5');
    writeTaskResultSettlementDispatchAtomic(settlementRef, 'b'.repeat(64));
    const adopted = dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    });
    expect(adopted).toMatchObject({
      state: 'adopted',
      claim,
      settlementRef,
    });
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });
});
