import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCrossVerifyEnforcedAttemptContract } from '../../src/core/cross-verify-execution-contract.js';
import {
  claimExecutionContinuationAtomic,
  createExecutionLandingCheckpoint,
  readExecutionContinuationClaim,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
  type CreateExecutionLandingCheckpointInput,
} from '../../src/core/execution-landing-checkpoint.js';
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
  dispatchExecutionContinuation,
} from '../../src/orchestra/execution-continuation-runner.js';
import { RuntimeBudgetMonitor } from '../../src/orchestra/runtime-budget-monitor.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';

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
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('execution continuation runner', () => {
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
