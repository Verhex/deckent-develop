import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readExecutionLandingContext,
} from '../../src/core/execution-landing-context.js';
import {
  createExecutionLandingPreparationRefV2,
  readExecutionLandingCheckpoint,
} from '../../src/core/execution-landing-checkpoint.js';
import {
  executionLandingProposalPath,
} from '../../src/core/execution-landing-proposal.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRef,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import { TaskStatus, type Task } from '../../src/core/task-types.js';
import {
  ExecutionLandingHoldError,
  assertExactDockerExecutionLandingCaptureV2,
  prepareExactDockerExecutionLandingContextV2,
  prepareDockerExecutionLanding,
  stampExactDockerExecutionLandingCheckpointV2,
  stampDockerExecutionLandingCheckpoint,
  type ExactDockerExecutionLandingCaptureV2,
} from '../../src/orchestra/execution-landing-coordinator.js';
import type { RuntimeBudgetUsageEvidence } from '../../src/orchestra/runtime-budget-monitor.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; task: Task } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-landing-coordinator-'));
  roots.push(base);
  const root = join(base, 'project');
  mkdirSync(join(root, '.tasks'), { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
  const task: Task = {
    id: 'm1-007',
    title: 'Checkpoint-stop',
    description: 'Produce one coherent change.',
    model: 'claude-fable-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'M1',
    type: 'code-development',
    scope: {
      directories: ['src'],
      filesRead: ['source.ts'],
      filesWrite: ['source.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'source.ts is updated and targeted evidence exists',
      noGoCriteria: 'checkpoint identity is inferred from worker prose',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.PENDING,
    provider: 'claude',
    authMode: 'subscription',
    actor: { id: 'owner', tenantId: 'tenant-a' },
    budget: { maxCacheReadTokens: 1_000 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'execution_budget.roles.worker.default',
      policyDigest: 'a'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
  };
  return { root, task };
}

function terminalUsage(
  settlementRef: ReturnType<typeof createTaskResultSettlementRef>,
  counters: RuntimeBudgetUsageEvidence['decision']['counters'],
  state: RuntimeBudgetUsageEvidence['decision']['state'] = 'landing-requested',
): RuntimeBudgetUsageEvidence {
  return {
    version: 2,
    projectId: settlementRef.projectRootSha256,
    taskId: settlementRef.taskId,
    attemptId: settlementRef.attemptId,
    budgetFingerprint: 'b'.repeat(64),
    backend: 'docker',
    terminal: true,
    budget: { maxCacheReadTokens: 1_000 },
    decision: {
      state,
      reasons: state === 'exceeded' ? ['cache-read token budget exceeded'] : ['reserve reached'],
      counters,
      consecutiveCacheReadEvents: 1,
    },
    guardState: {
      version: 2,
      counters,
      seenDedupeKeys: ['call:terminal'],
      measurableEvents: 1,
      incrementalUsageEvents: 1,
      consecutiveCacheReadEvents: 1,
    },
    updatedAt: new Date().toISOString(),
  };
}

function exactLandingCapture(root?: string): ExactDockerExecutionLandingCaptureV2 {
  const digest = (character: string): `sha256:${string}` =>
    `sha256:${character.repeat(64)}`;
  const identity = {
    schemaVersion: 2 as const,
    backend: 'docker' as const,
    projectRootSha256: root
      ? createHash('sha256').update(realpathSync.native(root)).digest('hex')
      : '1'.repeat(64),
    projectId: 'project-a',
    taskId: 'task-exact-landing',
    attemptId: randomUUID(),
    generation: 1,
  };
  const preparationRef = createExecutionLandingPreparationRefV2({
    dispatchRequestId: `dreq-${'2'.repeat(64)}`,
    dispatchRequestMaterialDigest: digest('3'),
    privateIdentity: identity,
    admissionReceiptDigest: digest('4'),
    admissionRefDigest: digest('5'),
    admittedAt: '2026-09-01T00:58:00.000Z',
    policyDigest: digest('6'),
    taskSnapshotDigest: digest('7'),
    providerInvocationDigest: digest('8'),
  });
  const providerStartReceipt = { ref: digest('a'), digest: digest('b') };
  const custodyRef = {
    dispatchRequestId: preparationRef.dispatchRequestId,
    identity,
    admissionReceiptDigest: preparationRef.admissionReceiptDigest,
    admissionRefDigest: preparationRef.admissionRefDigest,
    providerStartReceipt,
  };
  const providerExecutionAttempt = {
    schemaVersion: 2 as const,
    kind: 'task-attempt-custody-provider-execution-attempt' as const,
    providerExecutionAttemptId: randomUUID(),
    custodyIdentity: identity,
    admissionReceiptDigest: preparationRef.admissionReceiptDigest,
    backendExecutionId: 'container-exact-landing',
    identityDigest: digest('c'),
  };
  const releaseReceipt = { ref: digest('d'), digest: digest('e') };
  const dispatch = {
    kind: 'released' as const,
    settlementRef: {
      schemaVersion: 1 as const,
      taskId: identity.taskId,
      backend: 'docker' as const,
      projectRootSha256: identity.projectRootSha256,
      attemptId: providerExecutionAttempt.providerExecutionAttemptId,
    },
    admissionRef: {
      dispatchRequestId: preparationRef.dispatchRequestId,
      dispatchRequestMaterialDigest: preparationRef.dispatchRequestMaterialDigest,
      admissionRefDigest: preparationRef.admissionRefDigest,
    },
    preparationRef,
    custodyRef,
    providerExecutionAttempt,
    backendExecutionId: providerExecutionAttempt.backendExecutionId,
    mountReceiptDigest: digest('f'),
    dispatchReceipt: { ref: digest('0'), digest: digest('0') },
    releaseReceipt,
    providerStartReceipt,
    projectionFence: digest('1'),
    releasedAt: '2026-09-01T01:00:00.000Z',
    providerStartAcceptedAt: '2026-09-01T01:00:01.000Z',
  };
  const resultArtifact = {
    identity,
    admissionReceiptDigest: preparationRef.admissionReceiptDigest,
    policyDigest: preparationRef.policyDigest,
    artifactClass: 'worker-result' as const,
    artifactKey: 'result-exact-landing',
    contentDigest: digest('2'),
    byteLength: 120,
    capturedAt: '2026-09-01T01:00:03.000Z',
    receiptDigest: digest('3'),
  };
  const providerStream = {
    identity,
    admissionReceiptDigest: preparationRef.admissionReceiptDigest,
    policyDigest: preparationRef.policyDigest,
    artifactClass: 'pristine-provider-stream' as const,
    artifactKey: 'provider-exact-landing',
    contentDigest: digest('4'),
    byteLength: 300,
    capturedAt: '2026-09-01T01:00:02.500Z',
    receiptDigest: digest('5'),
  };
  const landingArtifact = {
    identity,
    admissionReceiptDigest: preparationRef.admissionReceiptDigest,
    policyDigest: preparationRef.policyDigest,
    artifactClass: 'worker-landing-proposal' as const,
    artifactKey: 'landing-exact-landing',
    contentDigest: digest('6'),
    byteLength: 90,
    capturedAt: '2026-09-01T01:00:04.000Z',
    receiptDigest: digest('7'),
  };
  const terminal = {
    kind: 'landing-captured' as const,
    custodyRef,
    releaseReceipt,
    projectionFence: dispatch.projectionFence,
    providerExit: {
      containerId: dispatch.backendExecutionId,
      exitCode: 0,
      observedAt: '2026-09-01T01:00:02.000Z',
      waitEvidenceDigest: digest('8'),
      observationReceiptDigest: digest('9'),
      observationEvidenceDigest: digest('a'),
    },
    providerStream,
    result: {
      version: 2 as const,
      identity,
      policyDigest: preparationRef.policyDigest,
      admissionReceiptDigest: preparationRef.admissionReceiptDigest,
      sourceResult: {
        artifactClass: 'worker-result' as const,
        artifactKey: resultArtifact.artifactKey,
        artifactReceiptDigest: resultArtifact.receiptDigest,
        artifactSha256: resultArtifact.contentDigest,
        byteLength: resultArtifact.byteLength,
      },
    },
    resultArtifact,
    providerBilling: {
      evidence: {
        source: 'provider-envelope' as const,
        provider: 'claude',
        currency: 'USD' as const,
        providerReportedUsd: 0,
        modelUsage: {},
        capturedAt: providerStream.capturedAt,
      },
      evidenceDigest: digest('b'),
      providerStreamReceiptDigest: providerStream.receiptDigest,
    },
    landingProposal: {
      artifact: landingArtifact,
      proposal: {
        version: 3 as const,
        taskId: identity.taskId,
        dispatchRequestId: preparationRef.dispatchRequestId,
        sequence: 2,
        summary: 'Exact landing is ready.',
        completedWork: ['captured exact result'],
        remainingWork: ['continue after checkpoint'],
        nextAction: 'resume exact continuation',
        unresolvedRisks: [],
        updatedAt: '2026-09-01T01:00:03.500Z',
      },
      verifiedAt: '2026-09-01T01:00:05.000Z',
    },
  };
  return { dispatch, terminal };
}

beforeEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('Docker execution landing coordinator', () => {
  it('accepts only a fully equal released and terminal exact-custody landing', () => {
    const capture = exactLandingCapture();
    expect(() => assertExactDockerExecutionLandingCaptureV2(capture)).not.toThrow();

    expect(() => assertExactDockerExecutionLandingCaptureV2({
      ...capture,
      terminal: {
        ...capture.terminal,
        resultArtifact: {
          ...capture.terminal.resultArtifact,
          receiptDigest: `sha256:${'f'.repeat(64)}`,
        },
      },
    })).toThrow(/does not match released custody/);
    expect(() => assertExactDockerExecutionLandingCaptureV2({
      ...capture,
      terminal: {
        ...capture.terminal,
        landingProposal: {
          ...capture.terminal.landingProposal,
          proposal: {
            ...capture.terminal.landingProposal.proposal,
            dispatchRequestId: `dreq-${'f'.repeat(64)}`,
          },
        },
      },
    })).toThrow(/does not match released custody/);
    expect(() => assertExactDockerExecutionLandingCaptureV2({
      ...capture,
      terminal: {
        ...capture.terminal,
        providerStream: {
          ...capture.terminal.providerStream,
          capturedAt: '2026-09-01T00:59:59.000Z',
        },
      },
    })).toThrow(/does not match released custody/);
    expect(() => assertExactDockerExecutionLandingCaptureV2({
      ...capture,
      terminal: {
        ...capture.terminal,
        landingProposal: {
          ...capture.terminal.landingProposal,
          verifiedAt: '2026-09-01T00:59:59.000Z',
        },
      },
    })).toThrow(/does not match released custody/);
  });

  it('writes the pre-provider baseline then stamps only the path-free terminal custody chain', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-01T00:59:00.000Z');
    const { root } = fixture();
    const capture = exactLandingCapture(root);
    const preparation = capture.dispatch.preparationRef;
    const identity = {
      configuredProvider: 'claude',
      configuredModel: 'claude-fable-5',
      requestedProvider: 'claude',
      requestedModel: 'claude-fable-5',
      resolvedProvider: 'claude',
      resolvedModel: 'claude-fable-5',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      backend: 'docker' as const,
      auth: 'subscription',
      fallbackReason: null,
    };
    const preparationInput = {
      taskId: preparation.privateIdentity.taskId,
      tenantId: 'tenant-a',
      originalRequestDigest: '1'.repeat(64),
      taskDigest: '2'.repeat(64),
      taskSnapshotDigest: preparation.taskSnapshotDigest,
      providerInvocationDigest: preparation.providerInvocationDigest,
      role: 'worker' as const,
      taskKind: 'code-development' as const,
      admissionMode: 'unattended' as const,
      approvalEvidenceRef: null,
      identity,
      policyDigest: preparation.policyDigest.slice('sha256:'.length),
      landingPolicy: { reserve_ratio: 0.25 },
      hardBudget: { maxTokens: 1_000, maxTurns: 10 },
      parentAttemptId: null,
      parentFence: null,
      parentCheckpointSha256: null,
      attemptFence: 'exact-attempt-fence',
      scope: { filesRead: ['source.ts'], filesWrite: ['source.ts'] },
      acceptanceCriteria: 'Exact custody, disk evidence and landing proposal must agree.',
    };
    const prepared = {
      kind: 'exact-docker-custody-prepared' as const,
      dispatchEnvelope: Object.freeze({}) as never,
      admissionRef: capture.dispatch.admissionRef,
      preparationRef: preparation,
    };
    const context = prepareExactDockerExecutionLandingContextV2({
      projectRoot: root,
      prepared,
      preparationInput,
    });
    writeFileSync(join(root, 'source.ts'), 'export const value = 2;\n');
    const terminalOperational = {
      taskId: preparation.privateIdentity.taskId,
      tenantId: preparationInput.tenantId,
      originalRequestDigest: preparationInput.originalRequestDigest,
      taskDigest: preparationInput.taskDigest,
      role: preparationInput.role,
      kind: preparationInput.taskKind,
      admissionMode: preparationInput.admissionMode,
      approvalEvidenceRef: preparationInput.approvalEvidenceRef,
      identity,
      policyDigest: preparationInput.policyDigest,
      landingPolicy: preparationInput.landingPolicy,
      hardBudget: preparationInput.hardBudget,
      cumulativeUsage: {
        turns: 2, inputTokens: 100, outputTokens: 50, cacheReadTokens: 10,
        cacheCreationTokens: 0, totalTokens: 160, maxContextTokens: 150,
      },
      parentAttemptId: null,
      parentFence: null,
      parentCheckpointSha256: null,
      attemptFence: preparationInput.attemptFence,
      providerSequence: {
        firstSequence: 1, lastSequence: 2, eventCount: 2,
        eventDigest: '3'.repeat(64),
      },
      semanticState: {
        summary: 'Exact Docker landing captured.',
        completedWork: ['Captured result and proposal.'],
        remainingWork: ['Dispatch bounded continuation.'],
        nextAction: 'Use the V2 checkpoint.',
        unresolvedRisks: [],
      },
      scope: preparationInput.scope,
      evidenceRefs: [`provider-stream:sha256:${'4'.repeat(64)}`],
      acceptanceCriteria: preparationInput.acceptanceCriteria,
      landingRequestedAt: '2026-09-01T01:00:04.500Z',
    };
    vi.setSystemTime('2026-09-01T01:00:06.000Z');
    const stamped = stampExactDockerExecutionLandingCheckpointV2({
      projectRoot: root,
      capture,
      operationalInput: terminalOperational,
    });
    expect(context.context.baseline.entries).toContainEqual(expect.objectContaining({
      path: 'source.ts',
    }));
    expect(stamped.checkpoint.checkpoint.operationalPayload.diskEvidenceDigest)
      .toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(stamped.retirement).toMatchObject({
      state: 'RETIRED',
      resourcesReleased: true,
      runtimeDisposition: 'checkpointed-process-exited',
    });
    const durable = JSON.stringify(stamped);
    expect(durable).not.toContain('.tasks');
    expect(durable).not.toContain('/workspace');
    expect(durable).not.toContain(root);
    expect(() => stampExactDockerExecutionLandingCheckpointV2({
      projectRoot: root,
      capture,
      operationalInput: {
        ...terminalOperational,
        identity: { ...identity, calledProvider: 'foreign-provider' },
      },
    })).toThrow(/billing identity/);
  });

  it('selects the finite proposal cadence only for the closed xverify protocol', () => {
    const { root, task } = fixture();
    const settlementRef = createTaskResultSettlementRef(root, task.id);
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);

    const prepared = prepareDockerExecutionLanding({
      projectRoot: root,
      task: {
        ...task,
        type: 'audit',
        scope: { directories: [], filesRead: ['source.ts'], filesWrite: [] },
        budgetPolicy: { ...task.budgetPolicy!, role: 'auditor', taskKind: 'audit' },
      },
      prompt: 'FINITE VERIFIER PROMPT',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef,
      terminalProtocol: 'xverify-v1',
    });

    expect(prepared.prompt).toContain('Do not spend a standalone tool call');
    expect(prepared.prompt).toContain('SAME single Bash tool call');
    expect(prepared.prompt).not.toContain('after your plan and after each coherent completed step');
  });

  it('does not mint a checkpoint when the attempt-bound proposal is absent', () => {
    const { root, task } = fixture();
    const settlementRef = createTaskResultSettlementRef(root, task.id);
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    const prepared = prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'ORIGINAL WORKER PROMPT',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef,
    });
    expect(prepared.context).not.toBeNull();
    const now = new Date().toISOString();

    let held: unknown;
    try {
      stampDockerExecutionLandingCheckpoint({
      projectRoot: root,
      settlementRef,
      terminalUsage: terminalUsage(settlementRef, {
        turns: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 750,
        cacheCreationTokens: 0,
        totalTokens: 750,
        maxContextTokens: 750,
      }),
      landing: {
        version: 2,
        projectId: settlementRef.projectRootSha256,
        taskId: task.id,
        attemptId: settlementRef.attemptId,
        budgetFingerprint: 'b'.repeat(64),
        backend: 'docker',
        state: 'landing-requested',
        budget: { maxCacheReadTokens: 1_000 },
        decision: {
          state: 'landing-requested',
          reasons: ['maxCacheReadTokens landing reserve reached'],
          counters: {
            turns: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 750,
            cacheCreationTokens: 0,
            totalTokens: 750,
            maxContextTokens: 750,
          },
          consecutiveCacheReadEvents: 1,
        },
        providerSequence: {
          firstSequence: 1,
          lastSequence: 1,
          eventCount: 1,
          eventDigest: 'c'.repeat(64),
        },
        requestedAt: now,
      },
      });
    } catch (error) {
      held = error;
    }
    expect(held).toBeInstanceOf(ExecutionLandingHoldError);
    expect(held).toMatchObject({
      code: 'DECKENT_EXECUTION_LANDING_HOLD',
      reasonCode: 'checkpoint-missing',
      attribution: {
        taskId: task.id,
        attemptId: settlementRef.attemptId,
        expectedSequence: 1,
        observedSequence: null,
      },
    });
    expect(readExecutionLandingCheckpoint(root, {
      schemaVersion: 1,
      projectId: settlementRef.projectRootSha256,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
    })).toBeNull();
  });

  it('rejects LANDED when exact terminal usage exceeded after the reserve trigger', () => {
    const { root, task } = fixture();
    const settlementRef = createTaskResultSettlementRef(root, task.id);
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'ORIGINAL WORKER PROMPT',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef,
    });
    writeFileSync(executionLandingProposalPath(root, task.id), JSON.stringify({
      version: 1,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
      sequence: 2,
      summary: 'A coherent step completed before provider shutdown.',
      completedWork: ['updated source.ts'],
      remainingWork: ['targeted verification'],
      nextAction: 'run targeted verification',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    }));
    const requestedAt = new Date().toISOString();

    expect(() => stampDockerExecutionLandingCheckpoint({
      projectRoot: root,
      settlementRef,
      terminalUsage: terminalUsage(settlementRef, {
        turns: 5,
        inputTokens: 12,
        outputTokens: 24,
        cacheReadTokens: 1_100,
        cacheCreationTokens: 0,
        totalTokens: 1_136,
        maxContextTokens: 1_100,
      }, 'exceeded'),
      landing: {
        version: 2,
        projectId: settlementRef.projectRootSha256,
        taskId: task.id,
        attemptId: settlementRef.attemptId,
        budgetFingerprint: 'b'.repeat(64),
        backend: 'docker',
        state: 'landing-requested',
        budget: { maxCacheReadTokens: 1_000 },
        decision: {
          state: 'landing-requested',
          reasons: ['reserve reached'],
          counters: {
            turns: 3,
            inputTokens: 10,
            outputTokens: 20,
            cacheReadTokens: 750,
            cacheCreationTokens: 0,
            totalTokens: 780,
            maxContextTokens: 760,
          },
          consecutiveCacheReadEvents: 3,
        },
        providerSequence: {
          firstSequence: 1,
          lastSequence: 12,
          eventCount: 12,
          eventDigest: 'c'.repeat(64),
        },
        requestedAt,
      },
    })).toThrow(/state exceeded cannot mint LANDED/);
    expect(readExecutionLandingCheckpoint(root, {
      schemaVersion: 1,
      projectId: settlementRef.projectRootSha256,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
    })).toBeNull();
  });

  it('rejects semantic proposals that predate scoped disk work', () => {
    const { root, task } = fixture();
    const settlementRef = createTaskResultSettlementRef(root, task.id);
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    const prepared = prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'ORIGINAL WORKER PROMPT',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef,
    });
    writeFileSync(join(root, 'source.ts'), 'export const value = 2;\n');
    const proposalPath = executionLandingProposalPath(root, task.id);
    writeFileSync(proposalPath, JSON.stringify({
      version: 1,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
      sequence: 1,
      summary: 'Initial state before scoped work.',
      completedWork: [],
      remainingWork: ['update source.ts'],
      nextAction: 'update source.ts',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    }));
    expect(prepared.context).not.toBeNull();
    const proposalMtime = new Date(
      Date.parse(prepared.context!.context.preparedAt) + 10_000,
    );
    utimesSync(proposalPath, proposalMtime, proposalMtime);
    const requestedAt = new Date().toISOString();
    const stamp = () => stampDockerExecutionLandingCheckpoint({
      projectRoot: root,
      settlementRef,
      terminalUsage: terminalUsage(settlementRef, {
        turns: 4,
        inputTokens: 12,
        outputTokens: 24,
        cacheReadTokens: 800,
        cacheCreationTokens: 0,
        totalTokens: 836,
        maxContextTokens: 800,
      }),
      landing: {
        version: 2,
        projectId: settlementRef.projectRootSha256,
        taskId: task.id,
        attemptId: settlementRef.attemptId,
        budgetFingerprint: 'b'.repeat(64),
        backend: 'docker',
        state: 'landing-requested',
        budget: { maxCacheReadTokens: 1_000 },
        decision: {
          state: 'landing-requested',
          reasons: ['reserve reached'],
          counters: {
            turns: 3,
            inputTokens: 10,
            outputTokens: 20,
            cacheReadTokens: 750,
            cacheCreationTokens: 0,
            totalTokens: 780,
            maxContextTokens: 760,
          },
          consecutiveCacheReadEvents: 3,
        },
        providerSequence: {
          firstSequence: 1,
          lastSequence: 12,
          eventCount: 12,
          eventDigest: 'c'.repeat(64),
        },
        requestedAt,
      },
    });

    expect(stamp).toThrow(/sequence 1 is stale; expected at least 2/);

    writeFileSync(proposalPath, JSON.stringify({
      version: 1,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
      sequence: 2,
      summary: 'Claimed completion before the disk write.',
      completedWork: ['updated source.ts'],
      remainingWork: [],
      nextAction: 'settle',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    }));
    utimesSync(proposalPath, proposalMtime, proposalMtime);
    const future = new Date(proposalMtime.getTime() + 10_000);
    utimesSync(join(root, 'source.ts'), future, future);

    expect(stamp).toThrow(/proposal predates scoped disk change: source.ts/);
    expect(readExecutionLandingCheckpoint(root, {
      schemaVersion: 1,
      projectId: settlementRef.projectRootSha256,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
    })).toBeNull();
  });

  it('holds the terminal production path with resumable attribution for a regressed sequence', () => {
    const { root, task } = fixture();
    writeFileSync(join(root, 'second.ts'), 'export const second = 1;\n');
    task.scope.filesRead.push('second.ts');
    task.scope.filesWrite.push('second.ts');
    const settlementRef = createTaskResultSettlementRef(root, task.id);
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'ORIGINAL WORKER PROMPT',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef,
    });
    writeFileSync(join(root, 'source.ts'), 'export const value = 2;\n');
    writeFileSync(join(root, 'second.ts'), 'export const second = 2;\n');
    writeFileSync(executionLandingProposalPath(root, task.id), JSON.stringify({
      version: 1,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
      sequence: 2,
      summary: 'Only one material mutation was checkpointed.',
      completedWork: ['updated source.ts'],
      remainingWork: ['checkpoint second.ts'],
      nextAction: 'resume after the second mutation',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    }));
    const counters = {
      turns: 4,
      inputTokens: 12,
      outputTokens: 24,
      cacheReadTokens: 800,
      cacheCreationTokens: 0,
      totalTokens: 836,
      maxContextTokens: 800,
    };

    let held: unknown;
    try {
      stampDockerExecutionLandingCheckpoint({
        projectRoot: root,
        settlementRef,
        terminalUsage: terminalUsage(settlementRef, counters),
        landing: {
          version: 2,
          projectId: settlementRef.projectRootSha256,
          taskId: task.id,
          attemptId: settlementRef.attemptId,
          budgetFingerprint: 'b'.repeat(64),
          backend: 'docker',
          state: 'landing-requested',
          budget: { maxCacheReadTokens: 1_000 },
          decision: {
            state: 'landing-requested',
            reasons: ['reserve reached'],
            counters,
            consecutiveCacheReadEvents: 1,
          },
          providerSequence: {
            firstSequence: 1,
            lastSequence: 4,
            eventCount: 4,
            eventDigest: 'c'.repeat(64),
          },
          requestedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      held = error;
    }

    expect(held).toBeInstanceOf(ExecutionLandingHoldError);
    expect(held).toMatchObject({
      reasonCode: 'checkpoint-stale',
      attribution: {
        taskId: task.id,
        attemptId: settlementRef.attemptId,
        expectedSequence: 3,
        observedSequence: 2,
      },
    });
  });

  it('stamps host truth around an untrusted attempt-bound semantic proposal', () => {
    const { root, task } = fixture();
    const settlementRef = createTaskResultSettlementRef(root, task.id);
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);

    const prepared = prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'ORIGINAL WORKER PROMPT',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef,
    });
    expect(prepared.prompt).toContain('Budget Landing Checkpoint Protocol');
    expect(prepared.prompt).toContain(settlementRef.attemptId);
    // 7094-F1a: the nonce-bearing landing segment rides AFTER the task prompt
    // (stable-prefix order — Sol seal …f4e859); the task prompt itself is the
    // prefix, so it must start the composed prompt verbatim.
    expect(prepared.prompt.startsWith('ORIGINAL WORKER PROMPT')).toBe(true);
    expect(prepared.prompt.indexOf('ORIGINAL WORKER PROMPT'))
      .toBeLessThan(prepared.prompt.indexOf('Budget Landing Checkpoint Protocol'));
    expect(prepared.prompt).not.toContain('## Primary Task Prompt');
    expect(prepared.prompt).toContain('FIRST lifecycle action');
    expect(prepared.context).not.toBeNull();

    const ref = {
      schemaVersion: 1 as const,
      projectId: settlementRef.projectRootSha256,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
    };
    const context = readExecutionLandingContext(root, ref);
    expect(context.context.identity).toMatchObject({
      requestedProvider: 'claude',
      resolvedProvider: 'claude',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      backend: 'docker',
    });

    writeFileSync(join(root, 'source.ts'), 'export const value = 2;\n');
    const now = new Date().toISOString();
    writeFileSync(executionLandingProposalPath(root, task.id), JSON.stringify({
      version: 1,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
      sequence: 3,
      summary: 'Source change is coherent and ready for targeted verification.',
      completedWork: ['updated source.ts'],
      remainingWork: ['run targeted verification'],
      nextAction: 'run the targeted test',
      unresolvedRisks: [],
      // Worker clocks are untrusted metadata. Exact attempt identity plus the
      // host-observed file mtime/context boundary owns freshness.
      updatedAt: '2000-01-01T00:00:00.000Z',
    }));

    const checkpoint = stampDockerExecutionLandingCheckpoint({
      projectRoot: root,
      settlementRef,
      terminalUsage: terminalUsage(settlementRef, {
        turns: 4,
        inputTokens: 12,
        outputTokens: 24,
        cacheReadTokens: 800,
        cacheCreationTokens: 0,
        totalTokens: 836,
        maxContextTokens: 800,
      }),
      landing: {
        version: 2,
        projectId: settlementRef.projectRootSha256,
        taskId: task.id,
        attemptId: settlementRef.attemptId,
        budgetFingerprint: 'b'.repeat(64),
        backend: 'docker',
        state: 'landing-requested',
        budget: { maxCacheReadTokens: 1_000 },
        decision: {
          state: 'landing-requested',
          reasons: ['maxCacheReadTokens landing reserve reached'],
          counters: {
            turns: 3,
            inputTokens: 10,
            outputTokens: 20,
            cacheReadTokens: 750,
            cacheCreationTokens: 0,
            totalTokens: 780,
            maxContextTokens: 760,
          },
          consecutiveCacheReadEvents: 3,
        },
        providerSequence: {
          firstSequence: 1,
          lastSequence: 12,
          eventCount: 12,
          eventDigest: 'c'.repeat(64),
        },
        requestedAt: now,
      },
    });

    expect(checkpoint.checkpoint.semanticState.summary).toContain('Source change');
    expect(checkpoint.checkpoint.cumulativeUsage.cacheReadTokens).toBe(800);
    expect(checkpoint.checkpoint.remainingBudget.maxCacheReadTokens).toBe(200);
    expect(checkpoint.checkpoint.diskDiffRefs).toEqual(expect.arrayContaining([
      expect.stringMatching(/^scope-diff:sha256:[a-f0-9]{64}$/),
    ]));
    expect(checkpoint.checkpoint.evidenceRefs).toEqual(expect.arrayContaining([
      expect.stringMatching(/^worker-landing-proposal:sha256:[a-f0-9]{64}$/),
      expect.stringMatching(/^execution-landing-context:sha256:[a-f0-9]{64}$/),
      expect.stringMatching(/^runtime-budget-terminal:/),
    ]));
    expect(JSON.parse(readFileSync(executionLandingProposalPath(root, task.id), 'utf-8'))).toMatchObject({
      version: 2,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
      generation: 1,
      resultReference: {
        taskId: task.id,
        attemptId: settlementRef.attemptId,
        generation: 1,
        relativePath: `.tasks/task-${task.id}.result`,
      },
    });
    expect(readExecutionLandingCheckpoint(root, ref)).toEqual(checkpoint);
  });

  it('adds no prompt or context when no landing policy is present', () => {
    const { root, task } = fixture();
    delete task.budgetPolicy!.landingPolicy;
    const settlementRef = createTaskResultSettlementRef(root, task.id);
    const prepared = prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'UNCHANGED',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef,
    });
    expect(prepared).toEqual({ prompt: 'UNCHANGED', context: null });
  });
});
