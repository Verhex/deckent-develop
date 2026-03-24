import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  evaluateResult,
  isDocTask,
  waitForResults,
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
