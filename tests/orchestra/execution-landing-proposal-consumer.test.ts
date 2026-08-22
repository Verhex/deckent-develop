import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readExecutionLandingCheckpoint } from '../../src/core/execution-landing-checkpoint.js';
import { executionLandingProposalPath } from '../../src/core/execution-landing-proposal.js';
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
import type {
  RuntimeBudgetLandingEvidence,
  RuntimeBudgetUsageEvidence,
} from '../../src/orchestra/runtime-budget-monitor.js';

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'landing-proposal-consumer-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'));
  writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
  const task: Task = {
    id: 'consumer-001',
    title: 'Consume a landing proposal',
    description: 'Pin the production proposal consumer truth.',
    model: 'codex-test',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '621-010',
    type: 'code-development',
    scope: { directories: [], filesRead: ['source.ts'], filesWrite: ['source.ts'] },
    dependencies: [],
    goNogo: {
      goCriteria: 'an exact proposal has a durable consumed receipt',
      noGoCriteria: 'artifact existence is treated as consumption',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.EXECUTING,
    provider: 'codex',
    budget: { maxCacheReadTokens: 1_000 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider: 'codex',
      executionCostClass: 'remote',
      profileRef: 'execution_budget.roles.worker.default',
      policyDigest: 'a'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
  };
  const settlementRef = createTaskResultSettlementRef(root, task.id);
  writeTaskResultSettlementAttemptAtomic(settlementRef);
  claimTaskResultSettlementAttemptAtomic(settlementRef);
  const prepared = prepareDockerExecutionLanding({
    projectRoot: root,
    task,
    prompt: 'PRODUCTION WORKER PROMPT',
    calledProvider: 'codex',
    calledModel: 'codex-test',
    auth: 'subscription',
    settlementRef,
  });
  if (!prepared.context) throw new Error('test fixture failed to prepare landing context');

  const counters = {
    turns: 2,
    inputTokens: 10,
    outputTokens: 20,
    cacheReadTokens: 800,
    cacheCreationTokens: 0,
    totalTokens: 830,
    maxContextTokens: 800,
  };
  const requestedAt = new Date().toISOString();
  const landing: RuntimeBudgetLandingEvidence = {
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
      counters: { ...counters, cacheReadTokens: 750, totalTokens: 780, maxContextTokens: 750 },
      consecutiveCacheReadEvents: 1,
    },
    providerSequence: {
      firstSequence: 1,
      lastSequence: 2,
      eventCount: 2,
      eventDigest: 'c'.repeat(64),
    },
    requestedAt,
  };
  const terminalUsage: RuntimeBudgetUsageEvidence = {
    version: 2,
    projectId: settlementRef.projectRootSha256,
    taskId: task.id,
    attemptId: settlementRef.attemptId,
    budgetFingerprint: 'b'.repeat(64),
    backend: 'docker',
    terminal: true,
    budget: { maxCacheReadTokens: 1_000 },
    decision: {
      state: 'landing-requested',
      reasons: ['reserve reached'],
      counters,
      consecutiveCacheReadEvents: 1,
    },
    guardState: {
      version: 2,
      counters,
      seenDedupeKeys: ['terminal'],
      measurableEvents: 1,
      incrementalUsageEvents: 1,
      consecutiveCacheReadEvents: 1,
    },
    updatedAt: requestedAt,
  };
  return { root, task, settlementRef, landing, terminalUsage, preparedAt: prepared.context.context.preparedAt };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('execution landing proposal production consumer', () => {
  it('binds an exact producer proposal to the typed durable checkpoint receipt', () => {
    const { root, task, settlementRef, landing, terminalUsage, preparedAt } = fixture();
    writeFileSync(join(root, 'source.ts'), 'export const value = 2;\n');
    const proposalPath = executionLandingProposalPath(root, task.id);
    writeFileSync(proposalPath, JSON.stringify({
      version: 1,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
      sequence: 2,
      summary: 'The scoped source change is coherent.',
      completedWork: ['updated source.ts'],
      remainingWork: ['continue from the checkpoint'],
      nextAction: 'resume the remaining work',
      unresolvedRisks: [],
      updatedAt: '2000-01-01T00:00:00.000Z',
    }));
    const observedAfterPreparation = new Date(Date.parse(preparedAt) + 10_000);
    utimesSync(proposalPath, observedAfterPreparation, observedAfterPreparation);

    const consumed = stampDockerExecutionLandingCheckpoint({
      projectRoot: root,
      settlementRef,
      landing,
      terminalUsage,
    });
    const ref = {
      schemaVersion: 1 as const,
      projectId: settlementRef.projectRootSha256,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
    };

    expect(consumed.checkpoint).toMatchObject({
      taskId: task.id,
      attemptId: settlementRef.attemptId,
      semanticState: { summary: 'The scoped source change is coherent.' },
    });
    expect(consumed.checkpoint.evidenceRefs).toEqual(expect.arrayContaining([
      expect.stringMatching(/^worker-landing-proposal:sha256:[a-f0-9]{64}$/),
      expect.stringMatching(/^execution-landing-context:sha256:[a-f0-9]{64}$/),
      expect.stringMatching(/^runtime-budget-terminal:/),
    ]));
    expect(readExecutionLandingCheckpoint(root, ref)).toEqual(consumed);
    expect(JSON.parse(readFileSync(proposalPath, 'utf8')))
      .toMatchObject({
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
  });

  it('rejects an existing orphan artifact instead of treating existence as consumption', () => {
    const { root, task, settlementRef, landing, terminalUsage } = fixture();
    const proposalPath = executionLandingProposalPath(root, task.id);
    const orphan = JSON.stringify({
      version: 1,
      taskId: task.id,
      attemptId: 'foreign-attempt',
      sequence: 2,
      summary: 'Unrelated artifact.',
      completedWork: [],
      remainingWork: [],
      nextAction: 'none',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    });
    writeFileSync(proposalPath, orphan);

    expect(() => stampDockerExecutionLandingCheckpoint({
      projectRoot: root,
      settlementRef,
      landing,
      terminalUsage,
    })).toThrow(/attempt|conflicts/i);
    expect(readFileSync(proposalPath, 'utf8')).toBe(orphan);
    expect(readExecutionLandingCheckpoint(root, {
      schemaVersion: 1,
      projectId: settlementRef.projectRootSha256,
      taskId: task.id,
      attemptId: settlementRef.attemptId,
    })).toBeNull();
  });
});
