import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  evaluateResult,
  isDocTask,
  isBashUnavailable,
  waitForResults,
  scoreCorrectness,
  scoreTestCoverage,
  scoreScopeCompliance,
  scoreDocumentation,
  evaluateWithRubric,
  DEFAULT_RUBRIC,
} from '../../src/orchestra/result-evaluator.js';
import type {
  WaitableSprint,
  ResultWatcher,
} from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(directories: string[], overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories, filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001-001',
    workerId: 'w-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

// ─── isDocTask() ─────────────────────────────────────────────────────

describe('isDocTask (result-evaluator)', () => {
  it('returns true for docs/ directory', () => {
    expect(isDocTask(makeTask(['docs']))).toBe(true);
  });

  it('returns true for docs subdirectory', () => {
    expect(isDocTask(makeTask(['docs/guides']))).toBe(true);
  });

  it('returns true when all directories are doc-only', () => {
    expect(isDocTask(makeTask(['docs/api', 'docs/guides', '.brain']))).toBe(true);
  });

  it('returns false for src/ directory', () => {
    expect(isDocTask(makeTask(['src/orchestra']))).toBe(false);
  });

  it('returns false for tests/ directory', () => {
    expect(isDocTask(makeTask(['tests/core']))).toBe(false);
  });

  it('returns false for lib/ directory', () => {
    expect(isDocTask(makeTask(['lib/utils']))).toBe(false);
  });

  it('returns false for mixed scope (docs/ + src/)', () => {
    expect(isDocTask(makeTask(['docs', 'src/orchestra']))).toBe(false);
  });

  it('returns false for empty directories', () => {
    expect(isDocTask(makeTask([]))).toBe(false);
  });

  it('returns false for bare "src" directory', () => {
    expect(isDocTask(makeTask(['src']))).toBe(false);
  });

  it('returns false for bare "tests" directory', () => {
    expect(isDocTask(makeTask(['tests']))).toBe(false);
  });

  it('returns false for bare "lib" directory', () => {
    expect(isDocTask(makeTask(['lib']))).toBe(false);
  });

  it('returns true for config-only directories', () => {
    expect(isDocTask(makeTask(['.deckent', '.brain']))).toBe(true);
  });

  it('handles task with no scope gracefully', () => {
    const task = makeTask([]);
    // @ts-expect-error — testing runtime safety
    task.scope = undefined;
    expect(isDocTask(task)).toBe(false);
  });
});

// ─── evaluateResult() ────────────────────────────────────────────────

describe('evaluateResult (result-evaluator)', () => {
  // ── Step 1: Hard failures ──────────────────────────────────────

  it('returns NO_GO when selfAssessment is NO_GO (highest priority)', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ selfAssessment: 'NO_GO', coverage: 100, testsPassed: true });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when selfAssessment is NO_GO even with new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      selfAssessment: 'NO_GO', coverage: 100, testsPassed: true,
      filesChanged: ['src/foo.test.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when tests failed (worker says DONE)', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({ testsPassed: false, selfAssessment: 'DONE', coverage: 100 });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when tests failed (worker says GO_WITH_TECH_DEBT)', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({ testsPassed: false, selfAssessment: 'GO_WITH_TECH_DEBT', coverage: 100 });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO for doc task when tests failed', () => {
    const task = makeTask(['docs']);
    const result = makeResult({ testsPassed: false, selfAssessment: 'DONE' });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  // ── Step 2: Doc tasks ──────────────────────────────────────────

  it('returns DONE for doc task with passing tests (skips coverage)', () => {
    const task = makeTask(['docs']);
    const result = makeResult({ testsPassed: true, coverage: 0, selfAssessment: 'DONE' });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE for doc task even with zero coverage', () => {
    const task = makeTask(['docs/api']);
    const result = makeResult({ coverage: 0, selfAssessment: 'DONE' });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('skips vitest validation for doc tasks', () => {
    const task = makeTask(['docs']);
    const result = makeResult({ testsPassed: true, coverage: 0, selfAssessment: 'DONE' });
    const vitestJson = JSON.stringify({
      lines: { pct: 50, total: 100, covered: 50 },
      statements: { pct: 50, total: 100, covered: 50 },
      functions: { pct: 50, total: 100, covered: 50 },
      branches: { pct: 50, total: 100, covered: 50 },
    });
    expect(evaluateResult(result, task, vitestJson)).toBe(TaskEvaluation.DONE);
  });

  // ── KEY CHANGE: Brain overrides worker self-assessment ─────────

  it('returns DONE when worker says GO_WITH_TECH_DEBT but has new tests (Brain override)', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true,
      coverage: 95,
      filesChanged: ['src/orchestra/foo.ts', 'tests/orchestra/foo.test.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE when worker says GO_WITH_TECH_DEBT but coverage >= 90 and has new tests', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true,
      coverage: 92,
      filesChanged: ['src/core/utils.ts', 'tests/core/utils.spec.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE when worker says GO_WITH_TECH_DEBT but coverage >= 90 and no new tests', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true,
      coverage: 95,
      filesChanged: ['src/core/utils.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  // ── hasNewTests detection ──────────────────────────────────────

  it('detects .test.ts files as new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'tests/foo.test.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('detects .spec.ts files as new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'tests/foo.spec.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('detects .test.js files as new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'tests/foo.test.js'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('detects .spec.js files as new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'tests/foo.spec.js'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('no test files detected when filesChanged has no test/spec files', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'src/bar.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('handles undefined filesChanged gracefully (no new tests)', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
    });
    // filesChanged defaults to [] in makeResult, but test with explicit undefined
    result.filesChanged = undefined as unknown as string[];
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('handles empty filesChanged (no new tests)', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: [],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  // ── Coverage thresholds ────────────────────────────────────────

  it('returns DONE for coverage >= 90 with no new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ testsPassed: true, coverage: 90, filesChanged: ['src/foo.ts'] });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE for coverage exactly 90', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({ testsPassed: true, coverage: 90, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns GO_WITH_TECH_DEBT for coverage 89.9 with no new tests', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({ testsPassed: true, coverage: 89.9, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns GO_WITH_TECH_DEBT for coverage 0 with no new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ testsPassed: true, coverage: 0, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns DONE for coverage 50 when worker wrote new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  // ── Mixed scope ────────────────────────────────────────────────

  it('treats mixed scope (docs + src) as normal task — low coverage, no tests', () => {
    const task = makeTask(['docs', 'src/core']);
    const result = makeResult({ testsPassed: true, coverage: 50, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('mixed scope with high coverage returns DONE', () => {
    const task = makeTask(['docs', 'src/core']);
    const result = makeResult({ testsPassed: true, coverage: 95, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('mixed scope with new tests returns DONE', () => {
    const task = makeTask(['docs', 'src/core']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  // ── vitest JSON coverage validation ────────────────────────────

  it('returns GO_WITH_TECH_DEBT when vitest JSON shows coverage mismatch', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      testsPassed: true, coverage: 95, selfAssessment: 'DONE',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
    });
    const vitestJson = JSON.stringify({
      lines: { pct: 50, total: 100, covered: 50 },
      statements: { pct: 50, total: 100, covered: 50 },
      functions: { pct: 50, total: 100, covered: 50 },
      branches: { pct: 50, total: 100, covered: 50 },
    });
    expect(evaluateResult(result, task, vitestJson)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns DONE when vitest JSON confirms coverage and has new tests', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      testsPassed: true, coverage: 95, selfAssessment: 'DONE',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
    });
    const vitestJson = JSON.stringify({
      lines: { pct: 94, total: 100, covered: 94 },
      statements: { pct: 94, total: 100, covered: 94 },
      functions: { pct: 94, total: 100, covered: 94 },
      branches: { pct: 94, total: 100, covered: 94 },
    });
    expect(evaluateResult(result, task, vitestJson)).toBe(TaskEvaluation.DONE);
  });

  // ── Fallback: worker hint for edge cases ───────────────────────

  it('respects GO_WITH_TECH_DEBT hint as fallback when coverage < 90 and no new tests', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true, coverage: 50,
      filesChanged: ['src/a.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns DONE as default when worker says DONE, coverage < 90 but not caught by other rules', () => {
    // Edge case: coverage exactly at boundary conditions
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true, coverage: 50,
      filesChanged: ['src/a.ts'],
    });
    // No new tests + coverage < 90 → GO_WITH_TECH_DEBT
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });
});

// ─── waitForResults() ────────────────────────────────────────────────

describe('waitForResults (result-evaluator)', () => {
  it('returns immediately when all results exist on disk', async () => {
    const resultData: TaskResult = makeResult({ taskId: '001' });
    const sprint: WaitableSprint = { tasks: [{ id: '001' }] };

    const result = await waitForResults('/project', sprint, {
      fileExists: () => true,
      readJson: () => resultData,
      createWatcher: () => ({
        waitForChange: () => new Promise(() => {}),
        close: () => {},
      }),
    });

    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('001');
  });

  it('collects multiple task results', async () => {
    const results: Record<string, TaskResult> = {
      '001': makeResult({ taskId: '001' }),
      '002': makeResult({ taskId: '002' }),
    };
    const sprint: WaitableSprint = { tasks: [{ id: '001' }, { id: '002' }] };

    const collected = await waitForResults('/project', sprint, {
      fileExists: (path: string) => {
        const id = path.includes('001') ? '001' : '002';
        return id in results;
      },
      readJson: (path: string) => {
        const id = path.includes('001') ? '001' : '002';
        return results[id] ?? null;
      },
      createWatcher: () => ({
        waitForChange: () => new Promise(() => {}),
        close: () => {},
      }),
    });

    expect(collected).toHaveLength(2);
  });

  it('waits for watcher when results not yet available', async () => {
    let callCount = 0;
    const resultData: TaskResult = makeResult({ taskId: '001' });
    const sprint: WaitableSprint = { tasks: [{ id: '001' }] };

    const collected = await waitForResults('/project', sprint, {
      timeoutMs: 1000,
      fileExists: () => {
        callCount++;
        return callCount >= 3; // Result appears on 3rd check
      },
      readJson: () => resultData,
      createWatcher: () => ({
        waitForChange: () => new Promise(resolve => setTimeout(resolve, 10)),
        close: () => {},
      }),
    });

    expect(collected).toHaveLength(1);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('returns partial results on timeout', async () => {
    const sprint: WaitableSprint = { tasks: [{ id: '001' }, { id: '002' }] };
    const resultData: TaskResult = makeResult({ taskId: '001' });

    const collected = await waitForResults('/project', sprint, {
      timeoutMs: 50,
      fileExists: (path: string) => path.includes('001'),
      readJson: (path: string) => path.includes('001') ? resultData : null,
      createWatcher: () => ({
        waitForChange: () => new Promise(resolve => setTimeout(resolve, 10)),
        close: () => {},
      }),
    });

    // Only task 001 had its result file
    expect(collected).toHaveLength(1);
    expect(collected[0].taskId).toBe('001');
  });

  it('processes queued tasks when a slot opens', async () => {
    const spawnedTasks: string[] = [];
    const killedTasks: string[] = [];
    const sprint: WaitableSprint = { tasks: [{ id: '001' }] };
    const queuedTask = makeTask(['src/'], { id: '002' });

    await waitForResults('/project', sprint, {
      timeoutMs: 100,
      queue: [queuedTask],
      fileExists: () => true,
      readJson: () => makeResult({ taskId: '001' }),
      killWorker: (taskId: string) => { killedTasks.push(taskId); },
      spawnTask: (task: Task) => { spawnedTasks.push(task.id); },
      createWatcher: () => ({
        waitForChange: () => new Promise(resolve => setTimeout(resolve, 10)),
        close: () => {},
      }),
    });

    expect(killedTasks).toContain('001');
    expect(spawnedTasks).toContain('002');
  });

  it('closes watcher on completion', async () => {
    let watcherClosed = false;
    const sprint: WaitableSprint = { tasks: [{ id: '001' }] };

    await waitForResults('/project', sprint, {
      timeoutMs: 50,
      fileExists: () => false,
      readJson: () => null,
      createWatcher: () => ({
        waitForChange: () => new Promise(resolve => setTimeout(resolve, 10)),
        close: () => { watcherClosed = true; },
      }),
    });

    expect(watcherClosed).toBe(true);
  });

  it('returns empty array when sprint has no tasks', async () => {
    const sprint: WaitableSprint = { tasks: [] };

    const collected = await waitForResults('/project', sprint, {
      fileExists: () => false,
      readJson: () => null,
      createWatcher: () => ({
        waitForChange: () => new Promise(() => {}),
        close: () => {},
      }),
    });

    expect(collected).toHaveLength(0);
  });

  it('handles readJson returning null gracefully', async () => {
    const sprint: WaitableSprint = { tasks: [{ id: '001' }] };

    const collected = await waitForResults('/project', sprint, {
      timeoutMs: 50,
      fileExists: () => true,
      readJson: () => null, // file exists but parse fails
      createWatcher: () => ({
        waitForChange: () => new Promise(resolve => setTimeout(resolve, 10)),
        close: () => {},
      }),
    });

    expect(collected).toHaveLength(0);
  });

  it('does not spawn queue when no killWorker provided', async () => {
    const spawnedTasks: string[] = [];
    const sprint: WaitableSprint = { tasks: [{ id: '001' }] };
    const queuedTask = makeTask(['src/'], { id: '002' });

    await waitForResults('/project', sprint, {
      timeoutMs: 100,
      queue: [queuedTask],
      fileExists: () => true,
      readJson: () => makeResult({ taskId: '001' }),
      // No killWorker provided — queue should still process but killWorker is a no-op
      spawnTask: (task: Task) => { spawnedTasks.push(task.id); },
      createWatcher: () => ({
        waitForChange: () => new Promise(resolve => setTimeout(resolve, 10)),
        close: () => {},
      }),
    });

    // Queue was processed — spawnTask was called for task 002
    expect(spawnedTasks).toContain('002');
  });
});

// ─── Rubric-Based Evaluation ────────────────────────────────────────

describe('scoreCorrectness', () => {
  it('returns 100 when tests pass and selfAssessment is DONE', () => {
    const result = makeResult({ testsPassed: true, selfAssessment: 'DONE' });
    const score = scoreCorrectness(result);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
    expect(score.criterion).toBe('correctness');
  });

  it('returns 80 when tests pass but selfAssessment is GO_WITH_TECH_DEBT', () => {
    const result = makeResult({ testsPassed: true, selfAssessment: 'GO_WITH_TECH_DEBT' });
    const score = scoreCorrectness(result);
    expect(score.score).toBe(80);
    expect(score.passed).toBe(true);
  });

  it('returns 0 when tests fail and selfAssessment is NO_GO', () => {
    const result = makeResult({ testsPassed: false, selfAssessment: 'NO_GO' });
    const score = scoreCorrectness(result);
    expect(score.score).toBe(0);
    expect(score.passed).toBe(false);
  });
});

describe('scoreTestCoverage', () => {
  it('returns coverage value boosted by new test files', () => {
    const result = makeResult({
      coverage: 70,
      filesChanged: ['src/foo.ts', 'tests/foo.test.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(85); // 70 + 15
    expect(score.passed).toBe(true);
  });

  it('returns raw coverage when no test files', () => {
    const result = makeResult({ coverage: 40, filesChanged: ['src/foo.ts'] });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(40);
    expect(score.passed).toBe(false);
  });

  it('caps score at 100', () => {
    const result = makeResult({
      coverage: 95,
      filesChanged: ['tests/foo.test.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(100); // 95 + 15 capped at 100
  });
});

describe('scoreScopeCompliance', () => {
  it('returns 100 when all files are within scope', () => {
    const task = makeTask(['src/core/'], {
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
    });
    const result = makeResult({ filesChanged: ['src/core/config.ts', 'src/core/types.ts'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
  });

  it('returns 0 when all files are out of scope', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({ filesChanged: ['docs/README.md', 'package.json'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(0);
    expect(score.passed).toBe(false);
  });

  it('returns 100 for empty filesChanged', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({ filesChanged: [] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
  });
});

describe('scoreDocumentation', () => {
  it('returns 100 for detailed notes (>=100 chars)', () => {
    const result = makeResult({ notes: 'A'.repeat(100) });
    const score = scoreDocumentation(result);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
  });

  it('returns 10 for minimal notes (<20 chars)', () => {
    const result = makeResult({ notes: 'ok' });
    const score = scoreDocumentation(result);
    expect(score.score).toBe(10);
    expect(score.passed).toBe(false);
  });
});

describe('evaluateWithRubric', () => {
  it('returns DONE with default rubric for perfect result', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'DONE',
      coverage: 95,
      filesChanged: ['src/core/foo.ts', 'tests/core/foo.test.ts'],
      notes: 'Implemented the feature with full test coverage and documentation.',
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(70);
    expect(evaluation.rubricScores).toHaveLength(4);
  });

  it('returns DONE with custom rubric', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'DONE',
      coverage: 80,
      filesChanged: ['src/core/foo.ts'],
      notes: 'Brief notes for the change.',
    });
    const evaluation = evaluateWithRubric(result, task, {
      passingScore: 50,
    });
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(50);
  });

  it('returns NO_GO for failing result', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: false,
      selfAssessment: 'NO_GO',
      coverage: 0,
      filesChanged: [],
      notes: '',
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.totalScore).toBeLessThan(DEFAULT_RUBRIC.passingScore * 0.7);
  });

  it('returns GO_WITH_TECH_DEBT for mediocre result', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      coverage: 30,
      filesChanged: ['src/core/foo.ts'],
      notes: 'Some notes about what was done here.',
    });
    const evaluation = evaluateWithRubric(result, task);
    // 80*0.4 + 30*0.25 + 100*0.2 + 40*0.15 = 32 + 7.5 + 20 + 6 = 65.5
    // 65.5 < 70 (passingScore) but >= 49 (70*0.7) → GO_WITH_TECH_DEBT
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('caps maxRetries at 3', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult();
    const evaluation = evaluateWithRubric(result, task, { maxRetries: 10 });
    expect(evaluation.retryCount).toBe(3);
  });

  it('handles unknown criterion gracefully', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({ testsPassed: true, selfAssessment: 'DONE' });
    const evaluation = evaluateWithRubric(result, task, {
      criteria: [
        { name: 'unknown_criterion', weight: 1.0, threshold: 50, evaluator: 'auto' },
      ],
    });
    expect(evaluation.rubricScores[0].score).toBe(0);
    expect(evaluation.rubricScores[0].reason).toContain('unknown');
  });

  it('respects per-criterion threshold', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'DONE',
      coverage: 30,
      notes: 'x',
    });
    const evaluation = evaluateWithRubric(result, task, {
      criteria: [
        { name: 'test_coverage', weight: 1.0, threshold: 90, evaluator: 'metric' },
      ],
    });
    // coverage 30 → score 30 < threshold 90 → passed = false
    expect(evaluation.rubricScores[0].passed).toBe(false);
  });
});

// ─── isBashUnavailable() ────────────────────────────────────────────

describe('isBashUnavailable', () => {
  it('detects "Bash tool unavailable" in notes', () => {
    const result = makeResult({ notes: 'Bash tool unavailable — session-env ENOENT' });
    expect(isBashUnavailable(result)).toBe(true);
  });

  it('detects "session-env ENOENT" pattern', () => {
    const result = makeResult({ notes: 'session-env ENOENT prevented running tsc' });
    expect(isBashUnavailable(result)).toBe(true);
  });

  it('returns false for normal notes', () => {
    const result = makeResult({ notes: 'All tests passed, coverage 95%' });
    expect(isBashUnavailable(result)).toBe(false);
  });

  it('returns false for empty notes', () => {
    const result = makeResult({ notes: '' });
    expect(isBashUnavailable(result)).toBe(false);
  });
});

// ─── evaluateResult() — Bash Unavailable Tolerance ─────────────────

describe('evaluateResult — Bash unavailable tolerance', () => {
  it('returns GO_WITH_TECH_DEBT when Bash unavailable and testsPassed=false (DONE self)', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Bash tool unavailable — session-env ENOENT prevented running tsc --noEmit',
      filesChanged: ['src/orchestra/result-evaluator.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns GO_WITH_TECH_DEBT when Bash unavailable and testsPassed=false (TECH_DEBT self)', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Bash tool is unavailable due to session-env ENOENT',
      filesChanged: ['src/orchestra/foo.ts'],
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns NO_GO when Bash unavailable but selfAssessment is NO_GO', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Bash tool unavailable — session-env ENOENT',
    });
    // selfAssessment NO_GO is checked BEFORE Bash tolerance
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when tests fail without Bash unavailable signal', () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Tests failed due to type error in config.ts',
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('detects "cannot run tsc" pattern as Bash unavailable', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Cannot run tsc due to environment constraint',
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('detects "ENOENT session-env" reversed pattern', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'ENOENT: no such file or directory, session-env path not found',
    });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });
});

// ─── scoreTestCoverage() — Bash Unavailable Tolerance ──────────────

describe('scoreTestCoverage — Bash unavailable tolerance', () => {
  it('returns neutral score 50 when Bash unavailable and coverage=0', () => {
    const result = makeResult({
      coverage: 0,
      notes: 'Bash tool unavailable — session-env ENOENT',
      filesChanged: ['src/foo.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(50);
    expect(score.passed).toBe(true);
    expect(score.reason).toContain('Bash unavailable');
  });

  it('returns normal score when Bash unavailable but coverage > 0', () => {
    const result = makeResult({
      coverage: 80,
      notes: 'Bash tool unavailable — session-env ENOENT',
      filesChanged: ['src/foo.ts'],
    });
    const score = scoreTestCoverage(result);
    // coverage > 0 means tests DID run somehow — use normal scoring
    expect(score.score).toBe(80);
  });

  it('returns normal score when coverage=0 without Bash unavailable', () => {
    const result = makeResult({
      coverage: 0,
      notes: 'No tests written',
      filesChanged: ['src/foo.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(0);
    expect(score.passed).toBe(false);
  });

  it('returns neutral score with "cannot run vitest" notes', () => {
    const result = makeResult({
      coverage: 0,
      notes: 'Cannot run vitest — environment unavailable',
      filesChanged: ['src/foo.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(50);
    expect(score.passed).toBe(true);
  });
});

// ─── evaluateWithRubric() — Bash Unavailable Integration ───────────

describe('evaluateWithRubric — Bash unavailable integration', () => {
  it('returns GO_WITH_TECH_DEBT (not NO_GO) for Bash unavailable result with rubric', () => {
    const task = makeTask(['src/orchestra/']);
    const result = makeResult({
      testsPassed: false,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      coverage: 0,
      notes: 'Bash tool unavailable — session-env ENOENT prevented running tsc --noEmit and vitest. Code changes applied correctly.',
      filesChanged: ['src/orchestra/result-evaluator.ts'],
    });
    const evaluation = evaluateWithRubric(result, task);
    // correctness: tests failed (0) + GO_WITH_TECH_DEBT (20) = 20
    // test_coverage: Bash unavailable + coverage 0 → neutral 50
    // scope_compliance: 1/1 in scope → 100
    // documentation: long notes → 100
    // weighted: 20*0.4 + 50*0.25 + 100*0.2 + 100*0.15 = 8 + 12.5 + 20 + 15 = 55.5
    // 55.5 >= 70*0.7=49 → GO_WITH_TECH_DEBT (not NO_GO)
    expect(evaluation.decision).not.toBe('NO_GO');
  });
});
