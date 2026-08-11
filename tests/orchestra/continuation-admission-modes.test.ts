import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalJson } from '../../src/core/audit-writer.js';
import {
  createExecutionLandingCheckpoint,
  readExecutionContinuationClaim,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
  type CreateExecutionLandingCheckpointInput,
} from '../../src/core/execution-landing-checkpoint.js';
import type { StreamLogEvent } from '../../src/core/log-event.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
  writeTaskResultSettlementPreparedAtomic,
} from '../../src/core/task-result-settlement.js';
import { dispatchExecutionContinuation } from '../../src/orchestra/execution-continuation-runner.js';
import {
  RuntimeBudgetMonitor,
  readRuntimeBudgetObservations,
  resolveRuntimeBudgetLedgerDir,
  RUNTIME_BUDGET_OBSERVATION_SUFFIX,
} from '../../src/orchestra/runtime-budget-monitor.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';

const TASK_ID = 'task-continuation-admission-modes';
const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

/**
 * The same measured startup work reported under the two honest provider usage
 * semantics: one incremental per-call delta, one cumulative attempt snapshot.
 */
const STARTUP_USAGE = {
  input_tokens: 10,
  output_tokens: 5,
  cache_creation_input_tokens: 20,
} as const;

const incrementalStartupEvent: StreamLogEvent = {
  type: 'text',
  content: {
    type: 'assistant',
    message: { id: 'parent-startup-call', usage: STARTUP_USAGE, content: [] },
  },
};

function cumulativeStartupEvent(countsAsTurn = true): StreamLogEvent {
  return {
    type: 'usage',
    content: { type: 'usage', id: 'parent-startup-turn', usage: STARTUP_USAGE },
    usageSemantics: {
      provider: 'fixture-provider',
      mode: 'cumulative',
      terminal: true,
      identity: 'parent-startup-turn',
      countsAsTurn,
    },
  };
}

function fixture(): string {
  const base = mkdtempSync(join(tmpdir(), 'deckent-continuation-admission-'));
  roots.push(base);
  const root = join(base, 'project');
  mkdirSync(root, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return root;
}

function checkpointInput(attemptId: string): CreateExecutionLandingCheckpointInput {
  return {
    taskId: TASK_ID,
    attemptId,
    tenantId: 'tenant-a',
    originalRequestDigest: '1'.repeat(64),
    taskDigest: '2'.repeat(64),
    role: 'worker',
    kind: 'code-development',
    admissionMode: 'unattended',
    identity: {
      configuredProvider: 'fixture-provider',
      configuredModel: 'fixture-model-a',
      requestedProvider: 'fixture-provider',
      requestedModel: 'fixture-model-a',
      resolvedProvider: 'fixture-provider',
      resolvedModel: 'fixture-model-a',
      calledProvider: 'fixture-provider',
      calledModel: 'fixture-model-a',
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

function persistedPredecessor(root: string, startupEvent: StreamLogEvent | null) {
  const attemptId = randomUUID();
  const settlementRef = createTaskResultSettlementRefForAttempt(root, TASK_ID, attemptId);
  writeTaskResultSettlementAttemptAtomic(settlementRef);
  claimTaskResultSettlementAttemptAtomic(settlementRef);
  const input = checkpointInput(attemptId);
  const checkpoint = createExecutionLandingCheckpoint(root, input);
  writeExecutionLandingCheckpointAtomic(root, checkpoint);
  writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
    checkpointSha256: checkpoint.checkpointSha256,
    runtimeDisposition: 'stopped-removed',
    resourcesReleased: true,
    evidenceRefs: [`runtime-release:sha256:${'7'.repeat(64)}`],
  });
  writeTaskResultSettlementLandedRetirementAtomic(settlementRef);
  if (startupEvent) {
    new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId: TASK_ID,
      attemptId,
      backend: 'docker',
      budget: input.hardBudget,
      onStop: vi.fn(),
    }).observe(startupEvent, 1);
  }
  return { checkpoint, attemptId };
}

function backend(): SpawnBackend {
  return {
    name: 'docker',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'checkpoint-stop',
    spawn: vi.fn((_taskId, model, _prompt, opts) => {
      if (!opts?.settlementRef) return;
      writeTaskResultSettlementPreparedAtomic(opts.settlementRef, model);
      writeTaskResultSettlementDispatchAtomic(opts.settlementRef, 'a'.repeat(64));
    }),
    kill: vi.fn(),
    list: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
  };
}

/** Locate the immutable first observation without duplicating ledger layout knowledge. */
function firstObservationPath(root: string): string {
  const ledger = resolveRuntimeBudgetLedgerDir(root);
  const match = readdirSync(ledger, { recursive: true, encoding: 'utf-8' })
    .filter(entry => entry.endsWith(RUNTIME_BUDGET_OBSERVATION_SUFFIX))
    .sort()[0];
  if (!match) throw new Error('no observation evidence was written by the fixture');
  return join(ledger, match);
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('continuation startup admission across provider usage semantics', () => {
  it('admits a cumulative-semantics first observation with exact delta-from-zero arithmetic', () => {
    const root = fixture();
    const { checkpoint, attemptId } = persistedPredecessor(root, cumulativeStartupEvent());
    const executionBackend = backend();

    const dispatched = dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
      spawnOptions: { autoApprove: true },
    });

    expect(dispatched.state).toBe('dispatched');
    expect(executionBackend.spawn).toHaveBeenCalledTimes(1);
    const [first] = readRuntimeBudgetObservations(root, TASK_ID, attemptId);
    expect(first?.observation.mode).toBe('cumulative');
    expect(first?.appliedDelta).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheCreationTokens: 20,
    });
    // Budget truth: the cumulative snapshot is applied exactly once, as one turn.
    expect(first?.countersAfter).toEqual({
      turns: 1,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheCreationTokens: 20,
      totalTokens: 35,
      maxContextTokens: 0,
    });
  });

  it('admits an incremental-semantics first observation with unchanged behaviour', () => {
    const root = fixture();
    const { checkpoint, attemptId } = persistedPredecessor(root, incrementalStartupEvent);
    const executionBackend = backend();

    const dispatched = dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
      spawnOptions: { autoApprove: true },
    });

    expect(dispatched.state).toBe('dispatched');
    expect(executionBackend.spawn).toHaveBeenCalledTimes(1);
    const [first] = readRuntimeBudgetObservations(root, TASK_ID, attemptId);
    expect(first?.observation.mode).toBe('incremental');
    expect(first?.appliedDelta).toEqual(first?.observation.counts);
    expect(first?.countersAfter).toEqual({
      turns: 1,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheCreationTokens: 20,
      totalTokens: 35,
      maxContextTokens: 30,
    });
  });

  it.each([
    ['cumulative', () => cumulativeStartupEvent()],
    ['incremental', () => incrementalStartupEvent],
  ])('holds a double-counted %s first observation closed before any claim', (_mode, event) => {
    const root = fixture();
    const { checkpoint } = persistedPredecessor(root, event());
    const path = firstObservationPath(root);
    const { observationDigest: _stale, ...payload } = JSON.parse(readFileSync(path, 'utf-8'));
    // Same recorded provider counts, twice the applied input tokens: an
    // internally re-sealed record whose arithmetic no longer reproduces.
    payload.appliedDelta.inputTokens *= 2;
    writeFileSync(path, JSON.stringify({
      ...payload,
      observationDigest: createHash('sha256').update(canonicalJson(payload)).digest('hex'),
    }), 'utf-8');
    const executionBackend = backend();

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/applied delta is not exact for its usage semantics/);
    expect(readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).toBeNull();
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });

  it('holds a cumulative first observation that proves no completed turn', () => {
    const root = fixture();
    const { checkpoint } = persistedPredecessor(root, cumulativeStartupEvent(false));
    const executionBackend = backend();

    expect(() => dispatchExecutionContinuation({
      projectRoot: root,
      checkpointRef: checkpoint.checkpoint,
      backend: executionBackend,
    })).toThrow(/requires an immutable incremental parent startup observation/);
    expect(executionBackend.spawn).not.toHaveBeenCalled();
  });

  it('holds a missing first observation closed', () => {
    const root = fixture();
    const { checkpoint } = persistedPredecessor(root, null);
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
});
