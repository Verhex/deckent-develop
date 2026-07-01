// ═══ Task 352-003 — EVAL-AUDIT-REVIVE ═══════════════════════════════
//
// RC (disk-verify, git-trail): three EVALUATE-phase branches inside
// runEvaluatePhase (extension-hit, alive-grace-hit, timeout/synthetic-NO_GO
// — sprint-phases.ts) call handleEvaluation()+evaluations.set() directly
// and `continue`, bypassing the forensic audit-trail write that only lived
// inline at the collectedIds.has(task.id) top-of-loop branch. The first two
// branches HAVE a rubric result ("rubric'li"); the timeout branch never runs
// a rubric at all ("rubric'siz"). Fix: writeTaskEvaluationAudit() is the
// single writer all four branches now share — this suite exercises both
// shapes directly (mirrors tests/orchestra/fix-eval-audit-trail.test.ts).

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeTaskEvaluationAudit } from '../../src/orchestra/sprint-phases.js';
import { evaluationAuditPath } from '../../src/orchestra/evaluation-audit-trail.js';
import { TaskEvaluation } from '../../src/core/task-types.js';
import type { Task, EvaluationResult } from '../../src/core/task-types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '352-003-t',
    title: 'Test task',
    description: '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test bootstrap',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/foo.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'EXECUTING',
    ...overrides,
  } as Task;
}

function rubricResult(decision: 'DONE' | 'NO_GO'): EvaluationResult {
  return {
    decision,
    totalScore: decision === 'DONE' ? 88 : 20,
    rubricScores: [
      { criterion: 'correctness', score: decision === 'DONE' ? 90 : 20, passed: decision === 'DONE', reason: 'test' },
      { criterion: 'test_coverage', score: decision === 'DONE' ? 80 : 10, passed: decision === 'DONE', reason: 'test' },
      { criterion: 'scope_compliance', score: 100, passed: true, reason: 'test' },
      { criterion: 'documentation', score: decision === 'DONE' ? 90 : 20, passed: decision === 'DONE', reason: 'test' },
    ],
    retryCount: 0,
  } as EvaluationResult;
}

describe('352-003 EVAL-AUDIT-REVIVE — writeTaskEvaluationAudit', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'deckent-eval-audit-revive-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  // ─── rubric'li path (extension-hit / alive-grace-hit shape) ─────────
  it('rubric-having evaluation (extension-hit/alive-grace-hit shape) writes an attempt-1 record', () => {
    const task = makeTask({ id: '352-100' });
    writeTaskEvaluationAudit(
      root, 'sprint-352', task, TaskEvaluation.DONE, rubricResult('DONE'),
    );

    const recPath = evaluationAuditPath(root, 'sprint-352', '352-100', 1);
    expect(existsSync(recPath)).toBe(true);
    const onDisk = JSON.parse(readFileSync(recPath, 'utf-8'));
    expect(onDisk.decision).toBe('DONE');
    expect(onDisk.criterionScores).toHaveLength(4);
    expect(onDisk.totalScore).toBe(88);
    expect(typeof onDisk.decisionRationale).toBe('string');
    expect(onDisk.decisionRationale.length).toBeGreaterThan(0);
    expect(onDisk.decisionRationale).toContain('decision=DONE');
  });

  it('rubric-having NO_GO evaluation preserves failed criteria in the record', () => {
    const task = makeTask({ id: '352-101' });
    writeTaskEvaluationAudit(
      root, 'sprint-352', task, TaskEvaluation.NO_GO, rubricResult('NO_GO'),
    );

    const recPath = evaluationAuditPath(root, 'sprint-352', '352-101', 1);
    const onDisk = JSON.parse(readFileSync(recPath, 'utf-8'));
    expect(onDisk.decision).toBe('NO_GO');
    const failed = onDisk.criterionScores.filter((c: { passed: boolean }) => !c.passed).map((c: { name: string }) => c.name);
    expect(failed).toEqual(['correctness', 'test_coverage', 'documentation']);
  });

  // ─── rubric'siz path (timeout/synthetic-NO_GO shape) ─────────────────
  it('rubric-less evaluation (timeout/synthetic-NO_GO shape) still writes decision + rationale', () => {
    const task = makeTask({ id: '352-102' });
    writeTaskEvaluationAudit(
      root, 'sprint-352', task, TaskEvaluation.NO_GO, undefined,
      'Timeout - no result received (extension denied: max-reached); liveness=dead',
    );

    const recPath = evaluationAuditPath(root, 'sprint-352', '352-102', 1);
    expect(existsSync(recPath)).toBe(true);
    const onDisk = JSON.parse(readFileSync(recPath, 'utf-8'));
    expect(onDisk.decision).toBe('NO_GO');
    expect(onDisk.criterionScores).toEqual([]);
    expect(onDisk.totalScore).toBe(0);
    expect(onDisk.schemaValidation.valid).toBe(false);
    expect(onDisk.schemaValidation.missingFields).toEqual(['result']);
    expect(onDisk.decisionRationale).toBe(
      'Timeout - no result received (extension denied: max-reached); liveness=dead',
    );
  });

  it('rubric-less evaluation without an explicit rationale override still gets a non-empty rationale', () => {
    const task = makeTask({ id: '352-103' });
    writeTaskEvaluationAudit(root, 'sprint-352', task, TaskEvaluation.NO_GO);

    const recPath = evaluationAuditPath(root, 'sprint-352', '352-103', 1);
    const onDisk = JSON.parse(readFileSync(recPath, 'utf-8'));
    expect(onDisk.decision).toBe('NO_GO');
    expect(typeof onDisk.decisionRationale).toBe('string');
    expect(onDisk.decisionRationale.length).toBeGreaterThan(0);
  });

  // ─── Fail-soft: a throwing write must not propagate ──────────────────
  it('never throws even when projectRoot is unwritable (fail-soft, mirrors every other EVALUATE gate)', () => {
    const task = makeTask({ id: '352-104' });
    expect(() => writeTaskEvaluationAudit(
      '\0invalid-path', 'sprint-352', task, TaskEvaluation.DONE, rubricResult('DONE'),
    )).not.toThrow();
  });
});
