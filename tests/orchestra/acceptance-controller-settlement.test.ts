import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TaskEvaluation } from '../../src/core/types.js';
import {
  evaluationAuditPath,
  writeEvaluationAudit,
} from '../../src/orchestra/evaluation-audit-trail.js';
import {
  consumeControllerEvaluationSettlement,
} from '../../src/orchestra/sprint-controller.js';

const roots: string[] = [];

function fixture(): { root: string; sprintId: string; taskId: string } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-controller-settlement-'));
  roots.push(root);
  return { root, sprintId: 'sprint-settlement', taskId: '610-010-a' };
}

function publishReceipt(
  root: string,
  sprintId: string,
  taskId: string,
  attemptNum = 1,
): void {
  writeEvaluationAudit(root, sprintId, taskId, attemptNum, {
    ruleSet: 'CODE',
    schemaValidation: { valid: true, missingFields: [], coverageRelaxed: false },
    criterionScores: [],
    totalScore: 100,
    decision: 'DONE',
    decisionRationale: 'immutable host settlement',
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('controller settlement consumption', () => {
  it('consumes one immutable attempt receipt before dependency release', () => {
    const { root, sprintId, taskId } = fixture();
    publishReceipt(root, sprintId, taskId);

    const consumed = consumeControllerEvaluationSettlement({
      projectRoot: root,
      sprintId,
      taskId,
      expectedEvaluation: TaskEvaluation.DONE,
    });

    expect(consumed).toMatchObject({
      state: 'SETTLED',
      evaluation: TaskEvaluation.DONE,
      receipt: { sprintId, taskId, attemptNum: 1, decision: 'DONE' },
    });
    // Replay consumes the same receipt; it does not mint a second settlement.
    expect(consumeControllerEvaluationSettlement({
      projectRoot: root,
      sprintId,
      taskId,
      expectedEvaluation: TaskEvaluation.DONE,
    })).toMatchObject({ state: 'SETTLED' });
  });

  it('holds a raw DONE when its settlement receipt is missing', () => {
    const { root, sprintId, taskId } = fixture();
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.tasks', `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
    }));

    expect(consumeControllerEvaluationSettlement({
      projectRoot: root,
      sprintId,
      taskId,
      expectedEvaluation: TaskEvaluation.DONE,
    })).toMatchObject({
      state: 'HOLD',
      reason: 'SETTLEMENT_RECEIPT_MISSING',
    });
  });

  it('holds a receipt whose immutable verdict conflicts with the phase projection', () => {
    const { root, sprintId, taskId } = fixture();
    publishReceipt(root, sprintId, taskId);

    expect(consumeControllerEvaluationSettlement({
      projectRoot: root,
      sprintId,
      taskId,
      expectedEvaluation: TaskEvaluation.NO_GO,
    })).toMatchObject({
      state: 'HOLD',
      reason: 'SETTLEMENT_RECEIPT_CONFLICT',
    });

    // The original receipt is still the sole attempt settlement.
    expect(() => writeEvaluationAudit(root, sprintId, taskId, 1, {
      ruleSet: 'CODE',
      schemaValidation: { valid: true, missingFields: [], coverageRelaxed: false },
      criterionScores: [],
      totalScore: 0,
      decision: 'NO_GO',
    })).toThrow(/EVALUATION_AUDIT_CONFLICT/);
    expect(evaluationAuditPath(root, sprintId, taskId, 1)).toContain('attempt-1.json');
  });

  it('scopes conflicts to the exact attempt so an older receipt cannot block recovery', () => {
    const { root, sprintId, taskId } = fixture();
    publishReceipt(root, sprintId, taskId, 1);

    // Attempt 1 is immutable, but it is not authority for generation 2.
    expect(consumeControllerEvaluationSettlement({
      projectRoot: root,
      sprintId,
      taskId,
      attemptNum: 2,
      expectedEvaluation: TaskEvaluation.NO_GO,
    })).toMatchObject({
      state: 'HOLD',
      reason: 'SETTLEMENT_RECEIPT_MISSING',
    });

    publishReceipt(root, sprintId, taskId, 2);
    expect(consumeControllerEvaluationSettlement({
      projectRoot: root,
      sprintId,
      taskId,
      attemptNum: 2,
      expectedEvaluation: TaskEvaluation.DONE,
    })).toMatchObject({
      state: 'SETTLED',
      receipt: { attemptNum: 2, decision: 'DONE' },
    });

    // Recovery did not rewrite the source generation's verdict.
    expect(consumeControllerEvaluationSettlement({
      projectRoot: root,
      sprintId,
      taskId,
      attemptNum: 1,
      expectedEvaluation: TaskEvaluation.DONE,
    })).toMatchObject({
      state: 'SETTLED',
      receipt: { attemptNum: 1, decision: 'DONE' },
    });
  });
});
