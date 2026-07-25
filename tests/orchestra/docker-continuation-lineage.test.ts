import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createExecutionLandingCheckpoint,
  executionLandingCheckpointPath,
  writeExecutionLandingCheckpointAtomic,
  type CreateExecutionLandingCheckpointInput,
} from '../../src/core/execution-landing-checkpoint.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import type { TaskResult } from '../../src/core/task-types.js';
import {
  archiveLandedAttemptArtifacts,
  persistDockerTerminalProviderBillingReceipt,
  readArchivedLandedAttemptLog,
  reconcileDockerContinuationLineageResultFile,
} from '../../src/orchestra/spawn-backend-docker.js';
import type { RuntimeBudgetUsageEvidence } from '../../src/orchestra/runtime-budget-monitor.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; tasksDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-docker-lineage-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return { root, tasksDir };
}

function checkpointInput(
  taskId: string,
  attemptId: string,
): CreateExecutionLandingCheckpointInput {
  return {
    taskId,
    attemptId,
    tenantId: 'tenant-a',
    originalRequestDigest: '1'.repeat(64),
    taskDigest: '2'.repeat(64),
    role: 'worker',
    kind: 'code-development',
    admissionMode: 'unattended',
    identity: {
      configuredProvider: 'claude',
      configuredModel: 'claude-fable-5',
      requestedProvider: 'claude',
      requestedModel: 'claude-fable-5',
      resolvedProvider: 'claude',
      resolvedModel: 'claude-fable-5',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      backend: 'docker',
      auth: 'subscription',
      fallbackReason: null,
    },
    policyDigest: '3'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    hardBudget: {
      maxTokens: 1_000,
      maxCacheReadTokens: 900,
      maxContextTokens: 4_000,
    },
    cumulativeUsage: {
      turns: 2,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 500,
      cacheCreationTokens: 50,
      totalTokens: 670,
      maxContextTokens: 650,
    },
    attemptFence: 'parent-fence',
    providerSequence: {
      firstSequence: 1,
      lastSequence: 4,
      eventCount: 4,
      eventDigest: '4'.repeat(64),
    },
    semanticState: {
      summary: 'The parent landed with durable host evidence.',
      completedWork: ['Completed the bounded exploration.'],
      remainingWork: ['Finish the exact continuation.'],
      nextAction: 'Resume from the immutable checkpoint.',
      unresolvedRisks: [],
    },
    scope: {
      filesRead: ['src/core/provider-billing-evidence.ts'],
      filesWrite: ['src/orchestra/spawn-backend-docker.ts'],
    },
    diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
    evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
    acceptanceCriteria: 'The continuation must retain cumulative usage and billing truth.',
    landingRequestedAt: '2026-07-24T01:00:00.000Z',
    landedAt: '2026-07-24T01:00:01.000Z',
  };
}

function terminalUsage(
  projectId: string,
  taskId: string,
  attemptId: string,
): RuntimeBudgetUsageEvidence {
  const counters = {
    turns: 1,
    inputTokens: 30,
    outputTokens: 10,
    cacheReadTokens: 100,
    cacheCreationTokens: 20,
    totalTokens: 160,
    maxContextTokens: 140,
  };
  return {
    version: 2,
    projectId,
    taskId,
    attemptId,
    budgetFingerprint: '7'.repeat(64),
    backend: 'docker',
    terminal: true,
    budget: { maxTokens: 330, maxCacheReadTokens: 400, maxContextTokens: 4_000 },
    decision: {
      state: 'exceeded',
      reasons: ['maxTokens exceeded'],
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
    updatedAt: '2026-07-24T01:05:00.000Z',
  };
}

function providerLog(totalUsd: number, inputTokens: number): string {
  return `${JSON.stringify({
    ts: '2026-07-24T01:00:00.000Z',
    seq: 1,
    type: 'usage',
    content: {
      type: 'result',
      total_cost_usd: totalUsd,
      modelUsage: {
        'claude-fable-5': {
          inputTokens,
          outputTokens: 10,
          cacheReadInputTokens: 100,
          cacheCreationInputTokens: 20,
          costUSD: totalUsd,
          contextWindow: 4_000,
        },
      },
    },
  })}\n`;
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Docker continuation lineage settlement', () => {
  it('archives the parent log and persists cumulative host usage and complete billing', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'lineage-complete';
    const parentAttemptId = randomUUID();
    const parent = createExecutionLandingCheckpoint(
      root,
      checkpointInput(taskId, parentAttemptId),
    );
    writeExecutionLandingCheckpointAtomic(root, parent);
    const parentLogPath = join(tasksDir, `task-${taskId}.log`);
    const parentLog = providerLog(0.4, 100);
    writeFileSync(parentLogPath, parentLog);

    const refs = archiveLandedAttemptArtifacts(tasksDir, taskId, parent.checkpoint);
    expect(refs).toContainEqual(expect.stringMatching(
      new RegExp(`^worker-artifact:task-${taskId}\\.log:sha256:[a-f0-9]{64}$`),
    ));
    expect(existsSync(parentLogPath)).toBe(false);
    expect(readArchivedLandedAttemptLog(parent.checkpoint)).toEqual({
      content: parentLog,
      evidenceRef: expect.stringMatching(/^worker-artifact:.*:sha256:[a-f0-9]{64}$/),
    });

    const continuationAttemptId = randomUUID();
    const settlementRef = createTaskResultSettlementRefForAttempt(
      root,
      taskId,
      continuationAttemptId,
    );
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    const terminalEvidence = persistDockerTerminalProviderBillingReceipt(
      settlementRef,
      'claude',
      providerLog(0.15, 30),
    )!;
    const terminalBilling = terminalEvidence.billing;
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    const result: TaskResult = {
      taskId,
      workerId: 'docker-lineage-complete',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Budget stop remains terminal.',
      tokenUsage: {
        inputTokens: 30,
        outputTokens: 10,
        cacheReadTokens: 100,
        cacheCreationTokens: 20,
        provider: 'claude',
        model: 'claude-fable-5',
      },
      providerBilling: terminalBilling,
    };
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

    reconcileDockerContinuationLineageResultFile({
      resultPath,
      projectRoot: root,
      taskId,
      model: 'claude-fable-5',
      settlementRef,
      executionContinuation: {
        version: 1,
        checkpointSha256: parent.checkpointSha256,
        parentAttemptId,
        continuationAttemptId,
        continuationFence: 'continuation-fence',
      },
      terminalUsage: terminalUsage(
        settlementRef.projectRootSha256,
        taskId,
        continuationAttemptId,
      ),
      terminalBilling,
      terminalBillingEvidenceRef: terminalEvidence.evidenceRef,
    });

    const reconciled = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
    expect(reconciled.selfAssessment).toBe('NO_GO');
    expect(reconciled.testsPassed).toBe(false);
    expect(reconciled.notes).toBe('Budget stop remains terminal.');
    expect(reconciled.tokenUsage).toEqual({
      inputTokens: 130,
      outputTokens: 30,
      cacheReadTokens: 600,
      cacheCreationTokens: 70,
      source: 'host-runtime-budget-lineage',
      provider: 'claude',
      model: 'claude-fable-5',
    });
    expect(reconciled.providerBilling).toMatchObject({
      providerReportedUsd: 0.55,
      lineage: {
        coverage: 'complete',
        attemptIds: [parentAttemptId, continuationAttemptId],
        evidenceRefs: [
          expect.stringMatching(/^worker-artifact:.*:sha256:[a-f0-9]{64}$/),
          terminalEvidence.evidenceRef,
        ],
      },
    });
  });

  it('marks terminal billing partial when the exact parent envelope is unavailable', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'lineage-partial';
    const parentAttemptId = randomUUID();
    const parent = createExecutionLandingCheckpoint(
      root,
      checkpointInput(taskId, parentAttemptId),
    );
    writeExecutionLandingCheckpointAtomic(root, parent);
    const continuationAttemptId = randomUUID();
    const settlementRef = createTaskResultSettlementRefForAttempt(
      root,
      taskId,
      continuationAttemptId,
    );
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    const terminalEvidence = persistDockerTerminalProviderBillingReceipt(
      settlementRef,
      'claude',
      providerLog(0.15, 30),
    )!;
    const terminalBilling = terminalEvidence.billing;
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    writeFileSync(resultPath, `${JSON.stringify({
      taskId,
      workerId: 'docker-lineage-partial',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Parent billing is unknown.',
      providerBilling: terminalBilling,
    }, null, 2)}\n`);

    reconcileDockerContinuationLineageResultFile({
      resultPath,
      projectRoot: root,
      taskId,
      model: 'claude-fable-5',
      settlementRef,
      executionContinuation: {
        version: 1,
        checkpointSha256: parent.checkpointSha256,
        parentAttemptId,
        continuationAttemptId,
        continuationFence: 'continuation-fence',
      },
      terminalUsage: terminalUsage(
        settlementRef.projectRootSha256,
        taskId,
        continuationAttemptId,
      ),
      terminalBilling,
      terminalBillingEvidenceRef: terminalEvidence.evidenceRef,
    });

    const reconciled = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
    expect(reconciled.providerBilling).toMatchObject({
      providerReportedUsd: 0.15,
      lineage: {
        coverage: 'partial',
        attemptIds: [continuationAttemptId],
        missingAttemptIds: [parentAttemptId],
      },
    });
    expect(reconciled.tokenUsage?.source).toBe('host-runtime-budget-lineage');
  });

  it('fails loudly when the content-addressed parent archive is corrupt', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'lineage-corrupt';
    const parent = createExecutionLandingCheckpoint(
      root,
      checkpointInput(taskId, randomUUID()),
    );
    writeExecutionLandingCheckpointAtomic(root, parent);
    writeFileSync(join(tasksDir, `task-${taskId}.log`), providerLog(0.4, 100));
    archiveLandedAttemptArtifacts(tasksDir, taskId, parent.checkpoint);
    const archiveDir = resolve(
      dirname(executionLandingCheckpointPath(parent.checkpoint)),
      'worker-artifacts',
    );
    const archivedLog = readdirSync(archiveDir)
      .find(file => file.startsWith(`task-${taskId}.log.`))!;
    writeFileSync(resolve(archiveDir, archivedLog), 'tampered');

    expect(() => readArchivedLandedAttemptLog(parent.checkpoint))
      .toThrow(/Corrupt LANDED worker artefact archive/);
  });

  it('refuses to rewrite a result for terminal evidence from another attempt', () => {
    const { root, tasksDir } = fixture();
    const taskId = 'lineage-attempt-mismatch';
    const parentAttemptId = randomUUID();
    const parent = createExecutionLandingCheckpoint(
      root,
      checkpointInput(taskId, parentAttemptId),
    );
    writeExecutionLandingCheckpointAtomic(root, parent);
    const continuationAttemptId = randomUUID();
    const settlementRef = createTaskResultSettlementRefForAttempt(
      root,
      taskId,
      continuationAttemptId,
    );
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    const original = `${JSON.stringify({
      taskId,
      workerId: 'docker-lineage-mismatch',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Must remain byte-identical.',
    }, null, 2)}\n`;
    writeFileSync(resultPath, original);

    expect(() => reconcileDockerContinuationLineageResultFile({
      resultPath,
      projectRoot: root,
      taskId,
      model: 'claude-fable-5',
      settlementRef,
      executionContinuation: {
        version: 1,
        checkpointSha256: parent.checkpointSha256,
        parentAttemptId,
        continuationAttemptId,
        continuationFence: 'continuation-fence',
      },
      terminalUsage: terminalUsage(
        settlementRef.projectRootSha256,
        taskId,
        randomUUID(),
      ),
      terminalBilling: null,
      terminalBillingEvidenceRef: null,
    })).toThrow(/terminal runtime evidence mismatch/);
    expect(readFileSync(resultPath, 'utf-8')).toBe(original);
  });
});
