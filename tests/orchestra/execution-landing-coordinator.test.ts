import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  readExecutionLandingContext,
} from '../../src/core/execution-landing-context.js';
import {
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
  prepareDockerExecutionLanding,
  stampDockerExecutionLandingCheckpoint,
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

beforeEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('Docker execution landing coordinator', () => {
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

    expect(() => stampDockerExecutionLandingCheckpoint({
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
    })).toThrow();
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

    expect(stamp).toThrow(/did not advance after scoped disk changes/);

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
    expect(prepared.prompt.indexOf('Budget Landing Checkpoint Protocol'))
      .toBeLessThan(prepared.prompt.indexOf('## Primary Task Prompt'));
    expect(prepared.prompt.indexOf('## Primary Task Prompt'))
      .toBeLessThan(prepared.prompt.indexOf('ORIGINAL WORKER PROMPT'));
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
