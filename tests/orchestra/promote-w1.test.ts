import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, EvaluationResult } from '../../src/core/types.js';
import { attemptPartialPromotion } from '../../src/orchestra/result-promoter.js';
import type { PartialPromotionResult } from '../../src/orchestra/result-promoter.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '303-012',
    title: 'Partial promotion test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/result-promoter.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '303-012',
    workerId: 'w-303-012',
    filesChanged: [],
    linesAdded: 20,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 80,
    selfAssessment: 'NO_GO',
    notes: 'out-of-scope file touched',
    ...overrides,
  };
}

function makeNoGoEvaluation(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    decision: 'NO_GO',
    totalScore: 40,
    rubricScores: [],
    retryCount: 0,
    ...overrides,
  };
}

/** Injectable tsc always-pass */
const tscPass = () => true;
/** Injectable tsc always-fail */
const tscFail = () => false;
/** Injectable vitest always-pass (ratio=1.0) */
const vitestPass = () => ({ passRatio: 1.0, passed: true });
/** Injectable vitest always-fail (ratio=0.0) */
const vitestFail = () => ({ passRatio: 0.0, passed: false });
/** Injectable vitest borderline-pass (ratio=0.5, exactly at threshold) */
const vitestBorderlinePass = () => ({ passRatio: 0.5, passed: true });
/** Injectable vitest just-below-threshold (ratio=0.49) */
const vitestJustBelow = () => ({ passRatio: 0.49, passed: false });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attemptPartialPromotion — PROMOTE-W1', () => {
  describe('GATE-1: category eligibility', () => {
    it('returns promoted=false when category is TECHNICAL', async () => {
      const task = makeTask();
      const result = makeResult({ filesChanged: ['src/orchestra/result-promoter.ts', 'src/unrelated/foo.ts'] });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'TECHNICAL',
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: ['src/unrelated/foo.ts'],
        isPartialPromotable: true,
      });

      const out: PartialPromotionResult = await attemptPartialPromotion(
        '/tmp/fake-root',
        task,
        result,
        evaluation,
        { runTscCheck: tscPass, runVitestScopeCheck: vitestPass },
      );

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('gate1_fail');
      expect(out.reason).toContain('TECHNICAL');
      expect(out.promotedResult).toBeNull();
    });

    it('returns promoted=false when category is RUNTIME_ERROR', async () => {
      const task = makeTask();
      const result = makeResult({ filesChanged: ['src/orchestra/result-promoter.ts'] });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'RUNTIME_ERROR',
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: [],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('gate1_fail');
    });

    it('returns promoted=false when category is FATAL_ERROR', async () => {
      const task = makeTask();
      const result = makeResult({ filesChanged: ['src/orchestra/result-promoter.ts'] });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'FATAL_ERROR',
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: [],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('gate1_fail');
    });

    it('returns promoted=false when filesInScope is empty (even with eligible category)', async () => {
      const task = makeTask();
      const result = makeResult({ filesChanged: ['src/unrelated/foo.ts'] });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'BOUNDARY_VIOLATION',
        filesInScope: [],
        filesOutOfScope: ['src/unrelated/foo.ts'],
        isPartialPromotable: false,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('gate1_fail');
      expect(out.reason).toContain('no_in_scope_files');
    });
  });

  describe('GATE-2: tsc check', () => {
    it('returns promoted=false when tsc fails (BOUNDARY_VIOLATION category)', async () => {
      const task = makeTask();
      const result = makeResult({
        filesChanged: ['src/orchestra/result-promoter.ts', 'src/unrelated/foo.ts'],
      });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'BOUNDARY_VIOLATION',
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: ['src/unrelated/foo.ts'],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscFail,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('gate2_fail');
      expect(out.reason).toContain('tsc');
      expect(out.promotedResult).toBeNull();
    });

    it('returns promoted=false when tsc fails (UNKNOWN category)', async () => {
      const task = makeTask();
      const result = makeResult({
        filesChanged: ['src/orchestra/result-promoter.ts', 'src/unrelated/foo.ts'],
      });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'UNKNOWN',
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: ['src/unrelated/foo.ts'],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscFail,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('tsc');
    });
  });

  describe('GATE-2: vitest check', () => {
    it('returns promoted=false when vitest pass ratio < 0.5', async () => {
      const task = makeTask();
      const result = makeResult({
        filesChanged: ['src/orchestra/result-promoter.ts', 'src/unrelated/foo.ts'],
      });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'BOUNDARY_VIOLATION',
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: ['src/unrelated/foo.ts'],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestFail,
      });

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('gate2_fail');
      expect(out.reason).toContain('vitest');
    });

    it('returns promoted=false when vitest pass ratio is 0.49 (just below threshold)', async () => {
      const task = makeTask();
      const result = makeResult({
        filesChanged: ['src/orchestra/result-promoter.ts', 'src/unrelated/foo.ts'],
      });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'BOUNDARY_VIOLATION',
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: ['src/unrelated/foo.ts'],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestJustBelow,
      });

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('vitest');
    });

    it('promotes when vitest pass ratio is exactly 0.5 (at threshold)', async () => {
      const task = makeTask();
      const result = makeResult({
        filesChanged: ['src/orchestra/result-promoter.ts', 'src/unrelated/foo.ts'],
      });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'BOUNDARY_VIOLATION',
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: ['src/unrelated/foo.ts'],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestBorderlinePass,
      });

      expect(out.promoted).toBe(true);
    });
  });

  describe('Successful partial promotion', () => {
    it('A+B in-scope tsc-clean + C out-of-scope → promoted=true, inScopeFiles=[A,B], droppedFiles=[C]', async () => {
      const fileA = 'src/orchestra/result-promoter.ts';
      const fileB = 'src/orchestra/result-evaluator.ts';
      const fileC = 'src/unrelated/other.ts';

      const task = makeTask({
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: [fileA, fileB],
        },
      });
      const result = makeResult({
        filesChanged: [fileA, fileB, fileC],
        linesAdded: 50,
        linesRemoved: 5,
        selfAssessment: 'NO_GO',
        notes: 'wrote out-of-scope file accidentally',
      });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'BOUNDARY_VIOLATION',
        filesInScope: [fileA, fileB],
        filesOutOfScope: [fileC],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(true);
      expect(out.reason).toContain('partial_promotion');
      expect(out.inScopeFiles).toEqual([fileA, fileB]);
      expect(out.droppedFiles).toEqual([fileC]);
      expect(out.promotedResult).not.toBeNull();
      expect(out.promotedResult!.filesChanged).toEqual([fileA, fileB]);
    });

    it('promotedResult preserves all other result fields unchanged', async () => {
      const fileA = 'src/orchestra/result-promoter.ts';
      const fileC = 'src/unrelated/other.ts';

      const task = makeTask();
      const result = makeResult({
        filesChanged: [fileA, fileC],
        linesAdded: 42,
        linesRemoved: 7,
        testsPassed: true,
        coverage: 85,
        notes: 'out-of-scope touch',
        selfAssessment: 'NO_GO',
      });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'BOUNDARY_VIOLATION',
        filesInScope: [fileA],
        filesOutOfScope: [fileC],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(true);
      const pr = out.promotedResult!;
      expect(pr.linesAdded).toBe(42);
      expect(pr.linesRemoved).toBe(7);
      expect(pr.testsPassed).toBe(true);
      expect(pr.coverage).toBe(85);
      expect(pr.notes).toBe('out-of-scope touch');
      expect(pr.selfAssessment).toBe('NO_GO');
      expect(pr.filesChanged).toEqual([fileA]);
    });

    it('promotes when category is UNKNOWN and in-scope files exist', async () => {
      const fileA = 'src/orchestra/result-promoter.ts';
      const fileC = 'src/unrelated/other.ts';

      const task = makeTask();
      const result = makeResult({ filesChanged: [fileA, fileC] });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'UNKNOWN',
        filesInScope: [fileA],
        filesOutOfScope: [fileC],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(true);
      expect(out.inScopeFiles).toEqual([fileA]);
      expect(out.droppedFiles).toEqual([fileC]);
    });

    it('returns empty droppedFiles when all files are in-scope (UNKNOWN category)', async () => {
      const fileA = 'src/orchestra/result-promoter.ts';

      const task = makeTask();
      const result = makeResult({ filesChanged: [fileA] });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'UNKNOWN',
        filesInScope: [fileA],
        filesOutOfScope: [],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(true);
      expect(out.droppedFiles).toEqual([]);
      expect(out.inScopeFiles).toEqual([fileA]);
    });
  });

  describe('Edge cases', () => {
    it('handles missing noGoCategory (undefined) as gate1 fail', async () => {
      const task = makeTask();
      const result = makeResult({ filesChanged: ['src/orchestra/result-promoter.ts'] });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: undefined,
        filesInScope: ['src/orchestra/result-promoter.ts'],
        filesOutOfScope: [],
        isPartialPromotable: true,
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      expect(out.promoted).toBe(false);
      expect(out.reason).toContain('gate1_fail');
    });

    it('handles missing filesInScope/filesOutOfScope gracefully', async () => {
      const task = makeTask();
      const result = makeResult({ filesChanged: ['src/orchestra/result-promoter.ts'] });
      const evaluation = makeNoGoEvaluation({
        noGoCategory: 'BOUNDARY_VIOLATION',
        // filesInScope / filesOutOfScope not set
      });

      const out = await attemptPartialPromotion('/tmp/fake-root', task, result, evaluation, {
        runTscCheck: tscPass,
        runVitestScopeCheck: vitestPass,
      });

      // filesInScope defaults to [] → GATE-1 fails (no in-scope files)
      expect(out.promoted).toBe(false);
      expect(out.inScopeFiles).toEqual([]);
      expect(out.droppedFiles).toEqual([]);
    });
  });
});
