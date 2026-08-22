import { describe, expect, it } from 'vitest';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import type { EvaluationResult } from '../../src/core/task-types.js';
import { acceptanceConfirmationDigest } from '../../src/core/acceptance-confirmation-contract.js';
import { applyAcceptanceEnforcement } from '../../src/orchestra/acceptance-enforcement.js';

const task = {
  id: '616-010', title: 'lineage canary', description: 'exact route authority',
  model: 'gpt-5.6-sol', effort: 'high', priority: 'NORMAL', reason: 'test',
  scope: { directories: ['src'], filesRead: [], filesWrite: ['src/example.ts'] },
  dependencies: [], status: TaskStatus.PENDING, type: 'security',
  goNogo: {
    goCriteria: 'owner confirms', noGoCriteria: 'owner rejects', techDebtAcceptable: '',
    items: [{ id: 'owner', statement: 'Owner confirms', evidenceRequirements: ['receipt'] }],
  },
} as Task;

const result: TaskResult = {
  taskId: task.id, workerId: 'w-616-010', filesChanged: ['src/example.ts'],
  linesAdded: 1, linesRemoved: 0, testsPassed: true, coverage: 100,
  selfAssessment: 'DONE', notes: 'awaiting owner',
  workAttribution: {
    state: 'VERIFIED', attemptId: 'attempt-14', baselineRef: 'baseline', scopeDigest: 'scope',
  },
};

const evaluation: EvaluationResult = {
  decision: 'DONE', totalScore: 100, rubricScores: [], retryCount: 0,
  contractSummary: {
    decided: 0, total: 1,
    undecidableItems: [{ itemId: 'owner', statement: 'Owner confirms' }],
  },
};

describe('acceptance enforcement full-lineage canary', () => {
  it('emits the canonical full lineage without consumer-minted identity', () => {
    const out = applyAcceptanceEnforcement(
      evaluation, task, result, 'sprint-616', { acceptance_enforcement: 'enforce' },
      { tenantId: 'tenant-616', projectId: 'project-616', generation: 14 },
    );
    const claim = out.routeClaim!;

    expect(claim.lineage).toEqual({
      tenantId: 'tenant-616', projectId: 'project-616', sprintId: 'sprint-616',
      taskId: '616-010', attemptId: 'attempt-14', generation: 14,
      evaluationDigest: acceptanceConfirmationDigest(evaluation),
      resultDigest: acceptanceConfirmationDigest(result),
      policyDigest: acceptanceConfirmationDigest(out.outcome),
      sourceDigest: acceptanceConfirmationDigest({
        verdict: 'UNDECIDABLE',
        undecidableItems: evaluation.contractSummary!.undecidableItems,
      }),
    });
    expect(claim.evaluationDigest).toBe(claim.lineage.evaluationDigest);
    expect(claim.confirmationId).toMatch(/^[a-f0-9]{64}$/u);
    expect(out.pendingConfirmation).toMatchObject({
      sprintId: claim.lineage.sprintId,
      taskId: claim.lineage.taskId,
    });
  });

  it.each([
    ['observe', undefined],
    ['missing route authority', { acceptance_enforcement: 'enforce' }],
  ] as const)('%s cannot mint lineage', (_label, config) => {
    const out = applyAcceptanceEnforcement(evaluation, task, result, 'sprint-616', config);
    expect(out.routeClaim).toBeUndefined();
    expect(out.pendingConfirmation).toBeUndefined();
  });
});
