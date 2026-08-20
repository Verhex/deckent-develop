// ─── Normative Verdict Vocabulary (ADR-G-040) — mapping-table pins ──────────
//
// Owner decision 2026-08-20: five single-word verdicts (CONFIRMED · QUALIFIED
// · UNDECIDABLE · FAILED · HOLD) as the canonical vocabulary for every
// evaluation surface. Pins: (1) the full legacy→normative mapping tables;
// (2) the lossy direction returns null instead of guessing (no fabricated
// verdict); (3) the vocabulary is frozen; (4) writeEvaluationAudit stamps the
// normative projection on every persisted audit record (real wiring, not a
// test-only import).

import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskEvaluation } from '../../src/core/task-types.js';
import {
  NORMATIVE_VERDICTS,
  fromCriterionStatus,
  fromCrossVerifyVerdict,
  fromRubricDecision,
  fromSelfAssessment,
  fromTaskEvaluation,
  isNormativeVerdict,
  toTaskEvaluation,
} from '../../src/core/verdict-types.js';
import {
  evaluationAuditPath,
  writeEvaluationAudit,
} from '../../src/orchestra/evaluation-audit-trail.js';

describe('normative verdict vocabulary (ADR-G-040)', () => {
  it('is exactly the five owner-approved single words, frozen', () => {
    expect([...NORMATIVE_VERDICTS])
      .toEqual(['CONFIRMED', 'QUALIFIED', 'UNDECIDABLE', 'FAILED', 'HOLD']);
    expect(Object.isFrozen(NORMATIVE_VERDICTS)).toBe(true);
    expect(NORMATIVE_VERDICTS.every(v => !v.includes('_') && !v.includes(' '))).toBe(true);
    expect(isNormativeVerdict('QUALIFIED')).toBe(true);
    expect(isNormativeVerdict('GO_WITH_TECH_DEBT')).toBe(false);
  });

  it('maps every TaskEvaluation member (total function)', () => {
    expect(fromTaskEvaluation(TaskEvaluation.DONE)).toBe('CONFIRMED');
    expect(fromTaskEvaluation(TaskEvaluation.GO_WITH_TECH_DEBT)).toBe('QUALIFIED');
    expect(fromTaskEvaluation(TaskEvaluation.NO_GO)).toBe('FAILED');
    expect(fromTaskEvaluation(TaskEvaluation.DEFERRED)).toBe('HOLD');
    expect(fromTaskEvaluation(TaskEvaluation.NOT_DISPATCHED)).toBe('HOLD');
  });

  it('maps rubric decisions, criterion statuses and cross-verify verdicts', () => {
    expect(fromRubricDecision('DONE')).toBe('CONFIRMED');
    expect(fromRubricDecision('GO_WITH_TECH_DEBT')).toBe('QUALIFIED');
    expect(fromRubricDecision('NO_GO')).toBe('FAILED');

    expect(fromCriterionStatus('satisfied')).toBe('CONFIRMED');
    expect(fromCriterionStatus('unsatisfied')).toBe('FAILED');
    expect(fromCriterionStatus('undecidable')).toBe('UNDECIDABLE');

    expect(fromCrossVerifyVerdict('CONFIRMED')).toBe('CONFIRMED');
    expect(fromCrossVerifyVerdict('REFUTED')).toBe('FAILED');
    expect(fromCrossVerifyVerdict('UNCLEAR')).toBe('UNDECIDABLE');
    expect(fromCrossVerifyVerdict('HOLD')).toBe('HOLD');
    expect(fromCrossVerifyVerdict('unavailable')).toBe('HOLD');
    expect(fromCrossVerifyVerdict('SOMETHING_ELSE')).toBeNull();
  });

  it('never fabricates: unknown selfAssessment and lossy projections return null', () => {
    expect(fromSelfAssessment('DONE')).toBe('CONFIRMED');
    expect(fromSelfAssessment('TIMEOUT_WITH_WORK')).toBeNull();
    expect(toTaskEvaluation('CONFIRMED')).toBe(TaskEvaluation.DONE);
    expect(toTaskEvaluation('QUALIFIED')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    expect(toTaskEvaluation('FAILED')).toBe(TaskEvaluation.NO_GO);
    expect(toTaskEvaluation('UNDECIDABLE')).toBeNull();
    expect(toTaskEvaluation('HOLD')).toBeNull();
  });

  it('writeEvaluationAudit stamps the normative projection on the persisted record', () => {
    const root = mkdtempSync(join(tmpdir(), 'verdict-audit-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));

    const record = writeEvaluationAudit(root, 'sprint-900', '900-001', 1, {
      ruleSet: 'CODE',
      schemaValidation: { valid: true, missingFields: [], coverageRelaxed: false },
      criterionScores: [],
      totalScore: 80,
      decision: 'GO_WITH_TECH_DEBT',
    });
    expect(record.normativeVerdict).toBe('QUALIFIED');

    const persisted = JSON.parse(
      readFileSync(evaluationAuditPath(root, 'sprint-900', '900-001', 1), 'utf-8'),
    ) as { decision: string; normativeVerdict: string };
    expect(persisted.decision).toBe('GO_WITH_TECH_DEBT');
    expect(persisted.normativeVerdict).toBe('QUALIFIED');
  });
});
