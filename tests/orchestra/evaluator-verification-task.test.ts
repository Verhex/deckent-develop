import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  isVerificationTask,
  evaluateWithRubric,
} from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
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
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'Verified existing implementation is correct.',
    ...overrides,
  };
}

// ─── D-1: Verification Task Recognition ─────────────────────────────

describe('isVerificationTask()', () => {
  it('detects "verify" keyword in task description', () => {
    const task = makeTask({ description: 'Verify that the existing config merge works correctly' });
    const result = makeResult();
    expect(isVerificationTask(task, result)).toBe(true);
  });

  it('detects "already implemented" keyword in task description', () => {
    const task = makeTask({ description: 'This feature was already implemented in Sprint 140' });
    const result = makeResult();
    expect(isVerificationTask(task, result)).toBe(true);
  });

  it('detects "Sprint N\'de yapıldı" Turkish pattern', () => {
    const task = makeTask({ description: 'Bu özellik Sprint 140\'de yapıldı, doğrulama gerekli' });
    const result = makeResult();
    expect(isVerificationTask(task, result)).toBe(true);
  });

  it('detects "audit" keyword in task title', () => {
    const task = makeTask({ title: 'Audit existing security headers' });
    const result = makeResult();
    expect(isVerificationTask(task, result)).toBe(true);
  });

  it('detects verification pattern in worker notes', () => {
    const task = makeTask({ description: 'Check implementation' });
    const result = makeResult({ notes: 'Confirmed that the feature already implemented works fine' });
    expect(isVerificationTask(task, result)).toBe(true);
  });

  it('returns false when filesChanged is non-empty', () => {
    const task = makeTask({ description: 'Verify existing implementation' });
    const result = makeResult({ filesChanged: ['src/foo.ts'] });
    expect(isVerificationTask(task, result)).toBe(false);
  });

  it('returns false when testsPassed is false', () => {
    const task = makeTask({ description: 'Verify existing implementation' });
    const result = makeResult({ testsPassed: false });
    expect(isVerificationTask(task, result)).toBe(false);
  });

  it('returns false for normal coding tasks', () => {
    const task = makeTask({ description: 'Implement new feature for config parsing' });
    const result = makeResult({ notes: 'All tests pass. Implementation complete.' });
    expect(isVerificationTask(task, result)).toBe(false);
  });
});

describe('evaluateWithRubric() — verification task fast-path', () => {
  it('returns DONE for verification task with filesChanged=[] + testsPassed=true', () => {
    const task = makeTask({ description: 'Verify that Sprint 140 config merge works' });
    const result = makeResult({
      filesChanged: [],
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'Verified — all tests pass, feature already implemented.',
    });

    const evalResult = evaluateWithRubric(result, task);
    expect(evalResult.decision).toBe('DONE');
    expect(evalResult.totalScore).toBe(100);
  });

  it('does NOT fast-path when description has no verification keywords', () => {
    const task = makeTask({ description: 'Implement new caching layer' });
    const result = makeResult({
      filesChanged: [],
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'All tests pass. Implementation complete.',
    });

    const evalResult = evaluateWithRubric(result, task);
    // Normal evaluation path — verification fast-path should NOT trigger
    // because description/title/notes contain no verification keywords
    const hasVerificationScore = evalResult.rubricScores.some(
      s => s.reason.includes('verification task'),
    );
    expect(hasVerificationScore).toBe(false);
  });
});
