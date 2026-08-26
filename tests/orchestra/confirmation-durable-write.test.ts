import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import type { EvaluationResult } from '../../src/core/task-types.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { createConfirmationRequest, readConfirmation } from '../../src/core/confirmation-store.js';
import { applyAcceptanceEnforcement } from '../../src/orchestra/acceptance-enforcement.js';
import { persistDurableAcceptanceConfirmation } from '../../src/orchestra/sprint-phases.js';

function fixture(): { task: Task; result: TaskResult; baseline: EvaluationResult } {
  const task = {
    id: '609-012', title: 'security review', description: 'durable confirmation',
    model: 'claude-sonnet-5', effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src'], filesRead: [], filesWrite: ['src/core/a.ts'] },
    dependencies: [],
    goNogo: {
      goCriteria: 'owner signs off', noGoCriteria: 'not reviewed', techDebtAcceptable: '',
      items: [{ id: 'owner', statement: 'Owner signs off', evidenceRequirements: ['review.json'] }],
    },
    status: TaskStatus.PENDING,
    type: 'security',
  } as Task;
  const result: TaskResult = {
    taskId: task.id, workerId: 'worker-1', filesChanged: ['src/core/a.ts'],
    linesAdded: 2, linesRemoved: 0, testsPassed: true, coverage: 100,
    selfAssessment: 'DONE', notes: 'review ready',
    workAttribution: {
      state: 'VERIFIED', attemptId: 'attempt-authority-1', baselineRef: 'base', scopeDigest: 'scope',
    },
  };
  const baseline: EvaluationResult = {
    decision: 'DONE', totalScore: 100, rubricScores: [], retryCount: 0,
    contractSummary: {
      decided: 0, total: 1,
      undecidableItems: [{ itemId: 'owner', statement: 'Owner signs off' }],
    },
  };
  return { task, result, baseline };
}

describe('EVALUATE durable confirmation boundary', () => {
  it('applies the DONE downgrade only after a durable v2 create', () => {
    const root = mkdtempSync(join(tmpdir(), 'confirmation-durable-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const { task, result, baseline } = fixture();
    const enforcement = applyAcceptanceEnforcement(
      baseline, task, result, 'sprint-609', { acceptance_enforcement: 'enforce' },
    );
    const durable = persistDurableAcceptanceConfirmation({
      projectRoot: root,
      sprint: { id: 'sprint-609', tasks: [task] },
      task, result, baselineEvaluation: baseline, enforcement,
      requestedAt: '2026-08-21T08:00:00.000Z',
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
    });
    expect(durable.confirmation?.created).toBe(true);
    expect(durable.enforcement.evaluation.decision).toBe('GO_WITH_TECH_DEBT');
    expect(durable.enforcement.postRubricCause).toBe('acceptance-policy:route:human');
    const found = readConfirmation(root, durable.confirmation!.id, {
      clock: () => new Date('2026-08-21T08:00:00.000Z'),
    });
    expect(found?.state).toBe('pending');
    if (!found || found.state !== 'pending') throw new Error('expected pending confirmation');
    expect(found.request.identity).toMatchObject({ attemptId: 'attempt-authority-1', generation: 1 });
    expect(found.request.approval.version).toBe('2.0');
  });

  it('retains the rubric DONE and removes the route cause when durable create fails', () => {
    const { task, result, baseline } = fixture();
    const enforcement = applyAcceptanceEnforcement(
      baseline, task, result, 'sprint-609', { acceptance_enforcement: 'enforce' },
    );
    const durable = persistDurableAcceptanceConfirmation({
      projectRoot: '/not-used',
      sprint: { id: 'sprint-609', tasks: [task] },
      task, result, baselineEvaluation: baseline, enforcement,
      requestedAt: '2026-08-21T08:00:00.000Z',
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      createFn: (() => { throw new Error('durability unavailable'); }) as typeof createConfirmationRequest,
    });
    expect(durable.confirmation).toBeUndefined();
    expect(durable.writeError).toBeInstanceOf(Error);
    expect(durable.enforcement.evaluation).toBe(baseline);
    expect(durable.enforcement.enforced).toBe(false);
    expect(durable.enforcement.postRubricCause).toBeUndefined();
  });
});
