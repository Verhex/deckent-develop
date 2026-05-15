// ═══ Sprint 171 Bug B — FIX-phase re-evaluation forensic audit-trail ═══
//
// RC (systematic-debugging): runFixPhase re-evaluates fix tasks
// (evaluateWithRubric + handleEvaluation, sprint-phases.ts:1105-1115) and
// updates the in-memory `evaluations` Map, BUT never calls
// writeEvaluationAudit. That writer is only called from runEvaluatePhase
// (sprint-phases.ts:856, hardcoded attempt=1). Result: the forensic ledger
// records ONLY the EVALUATE-phase attempt-1; FIX decisions are invisible.
//
// Sprint 171 evidence: 171-014 retro=DONE (reconciled via fix) but
// .deckent/evaluations/sprint-171/171-014-attempt-1.json=NO_GO and NO
// 171-014-attempt-2.json → a post-mortem reading the ledger falsely
// concludes "never reconciled". The ledger lies by omission.
//
// Fix: recordFixEvaluationAudit() persists the FIX re-evaluation —
//   <fixTaskId>-attempt-1.json  (the fix task's own forensic record)
//   <originalId>-attempt-2.json (when the original is reconciled, so the
//                                ledger is self-consistent with the retro)

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordFixEvaluationAudit } from '../../src/orchestra/sprint-phases.js';
import { evaluationAuditPath } from '../../src/orchestra/evaluation-audit-trail.js';
import { TaskEvaluation } from '../../src/core/task-types.js';
import type { Task, EvaluationResult } from '../../src/core/task-types.js';

function fixTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '171-014-fix',
    title: 'Fix: extensions + scripts Audit',
    description: 'Priority fix for NO_GO task 171-014.',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test bootstrap',
    scope: {
      directories: ['docs/audits/sprint-171/'],
      filesRead: [],
      filesWrite: ['docs/audits/sprint-171/01-modul-derin/14-extensions-scripts.md'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'EXECUTING',
    assignedAgent: 'devops-engineer',
    isPriorityFix: true,
    fixForTaskId: '171-014',
    ...overrides,
  } as Task;
}

function rubricResult(decision: 'DONE' | 'NO_GO'): EvaluationResult {
  return {
    decision,
    totalScore: decision === 'DONE' ? 92 : 0,
    rubricScores: [
      { criterion: 'audit_completeness', score: decision === 'DONE' ? 90 : 0, passed: decision === 'DONE', reason: 'test' },
      { criterion: 'finding_count', score: decision === 'DONE' ? 80 : 0, passed: decision === 'DONE', reason: 'test' },
      { criterion: 'citation_density', score: decision === 'DONE' ? 70 : 0, passed: decision === 'DONE', reason: 'test' },
      { criterion: 'migration_triage', score: decision === 'DONE' ? 60 : 0, passed: decision === 'DONE', reason: 'test' },
    ],
    retryCount: 0,
  } as EvaluationResult;
}

describe('Sprint 171 Bug B — recordFixEvaluationAudit', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'deckent-fix-audit-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('fix DONE + orijinal reconcile → fix attempt-1 VE orijinal attempt-2 yazılır', () => {
    recordFixEvaluationAudit(
      root, 'sprint-171', fixTask(), rubricResult('DONE'), TaskEvaluation.DONE, true,
    );

    const fixRec = evaluationAuditPath(root, 'sprint-171', '171-014-fix', 1);
    const origRec = evaluationAuditPath(root, 'sprint-171', '171-014', 2);

    expect(existsSync(fixRec)).toBe(true);
    expect(existsSync(origRec)).toBe(true);
    const orig = JSON.parse(readFileSync(origRec, 'utf-8'));
    expect(orig.decision).toBe('DONE');
  });

  it('fix NO_GO (reconcile YOK) → sadece fix attempt-1, orijinal attempt-2 YAZILMAZ', () => {
    recordFixEvaluationAudit(
      root, 'sprint-171', fixTask(), rubricResult('NO_GO'), TaskEvaluation.NO_GO, false,
    );

    const fixRec = evaluationAuditPath(root, 'sprint-171', '171-014-fix', 1);
    const origRec = evaluationAuditPath(root, 'sprint-171', '171-014', 2);

    expect(existsSync(fixRec)).toBe(true);
    expect(existsSync(origRec)).toBe(false);
  });

  it('fixForTaskId yoksa orijinal attempt-2 yazılmaz (defansif)', () => {
    recordFixEvaluationAudit(
      root, 'sprint-171', fixTask({ fixForTaskId: undefined }),
      rubricResult('DONE'), TaskEvaluation.DONE, true,
    );

    expect(existsSync(evaluationAuditPath(root, 'sprint-171', '171-014-fix', 1))).toBe(true);
    expect(existsSync(evaluationAuditPath(root, 'sprint-171', '171-014', 2))).toBe(false);
  });
});
