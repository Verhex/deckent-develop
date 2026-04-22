import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  validateResultSchema,
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
    filesChanged: ['src/foo.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'All tests pass.',
    ...overrides,
  };
}

// ─── D-2: Result Schema Validation ──────────────────────────────────

describe('validateResultSchema()', () => {
  it('returns valid for complete result', () => {
    const result = makeResult();
    const check = validateResultSchema(result);
    expect(check.valid).toBe(true);
    expect(check.missingFields).toEqual([]);
  });

  it('detects missing coverage', () => {
    const result = makeResult({ coverage: undefined as unknown as number });
    const check = validateResultSchema(result);
    expect(check.valid).toBe(false);
    expect(check.missingFields).toContain('coverage');
  });

  it('detects missing selfAssessment', () => {
    const result = makeResult({ selfAssessment: '' as unknown as 'DONE' });
    const check = validateResultSchema(result);
    expect(check.valid).toBe(false);
    expect(check.missingFields).toContain('selfAssessment');
  });

  it('detects missing testsPassed', () => {
    const result = makeResult({ testsPassed: undefined as unknown as boolean });
    const check = validateResultSchema(result);
    expect(check.valid).toBe(false);
    expect(check.missingFields).toContain('testsPassed');
  });

  it('detects missing taskId', () => {
    const result = makeResult({ taskId: '' });
    const check = validateResultSchema(result);
    expect(check.valid).toBe(false);
    expect(check.missingFields).toContain('taskId');
  });

  it('detects missing filesChanged array', () => {
    const result = makeResult({ filesChanged: undefined as unknown as string[] });
    const check = validateResultSchema(result);
    expect(check.valid).toBe(false);
    expect(check.missingFields).toContain('filesChanged');
  });
});

describe('evaluateWithRubric() — schema enforcement', () => {
  it('returns NO_GO when coverage is missing', () => {
    const task = makeTask();
    const result = makeResult({ coverage: undefined as unknown as number });
    const evalResult = evaluateWithRubric(result, task);
    expect(evalResult.decision).toBe('NO_GO');
    expect(evalResult.rubricScores[0]?.reason).toContain('Schema violation');
  });

  it('returns NO_GO when taskId is empty', () => {
    const task = makeTask();
    const result = makeResult({ taskId: '' });
    const evalResult = evaluateWithRubric(result, task);
    expect(evalResult.decision).toBe('NO_GO');
  });

  it('passes schema check for valid result and proceeds to rubric scoring', () => {
    const task = makeTask();
    const result = makeResult();
    const evalResult = evaluateWithRubric(result, task);
    // Should NOT have schema_validation criterion — it passed validation
    const hasSchemaScore = evalResult.rubricScores.some(s => s.criterion === 'schema_validation');
    expect(hasSchemaScore).toBe(false);
    expect(evalResult.decision).toBe('DONE');
  });
});
