import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  evaluateWithRubric,
  DEFAULT_RUBRIC,
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
    filesChanged: ['src/foo.ts', 'tests/foo.test.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'All tests pass. Implementation complete with full coverage.',
    ...overrides,
  };
}

// ─── evaluateWithRubric() Consistency Tests ─────────────────────────

describe('evaluateWithRubric() — Evaluator Consistency', () => {
  it('returns DONE when testsPassed=true, coverage sufficient, selfAssessment=DONE', () => {
    const result = makeResult({
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'All tests pass. Implementation complete with full test coverage.',
    });
    const task = makeTask();

    const evalResult = evaluateWithRubric(result, task);

    expect(evalResult.decision).toBe('DONE');
    expect(evalResult.totalScore).toBeGreaterThanOrEqual(DEFAULT_RUBRIC.passingScore);
    expect(evalResult.rubricScores).toHaveLength(DEFAULT_RUBRIC.criteria.length);
  });

  it('returns NO_GO when testsPassed=false and selfAssessment=NO_GO', () => {
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Tests failed. Cannot proceed.',
    });
    const task = makeTask();

    const evalResult = evaluateWithRubric(result, task);

    expect(evalResult.decision).toBe('NO_GO');
    expect(evalResult.totalScore).toBeLessThan(DEFAULT_RUBRIC.passingScore * 0.7);
  });

  it('returns GO_WITH_TECH_DEBT when bash unavailable pattern detected', () => {
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      filesChanged: ['src/foo.ts'],
      notes: 'Bash tool is unavailable — session-env ENOENT. Code changes applied but tsc and vitest could not run.',
    });
    // Include both src/ and tests/ in scope so scope_compliance doesn't penalize
    const task = makeTask({ scope: { directories: ['src/', 'tests/'], filesRead: [], filesWrite: [] } });

    const evalResult = evaluateWithRubric(result, task);

    // With bash unavailable: correctness gets partial score (20: tests failed + GO_WITH_TECH_DEBT),
    // test_coverage gets neutral 50 (bash unavailable tolerance), scope 100%, docs 100%.
    // Total ~55.5 which is >= passingScore*0.7 (49) → GO_WITH_TECH_DEBT
    expect(evalResult.decision).toBe('GO_WITH_TECH_DEBT');
    expect(evalResult.rubricScores.length).toBeGreaterThan(0);
    // Verify bash unavailable tolerance was applied to test_coverage criterion
    const coverageScore = evalResult.rubricScores.find(s => s.criterion === 'test_coverage');
    expect(coverageScore?.reason).toContain('Bash unavailable');
  });

  it('uses default rubric when no rubric parameter is provided', () => {
    const result = makeResult();
    const task = makeTask();

    // Call without third argument — should use DEFAULT_RUBRIC
    const evalResult = evaluateWithRubric(result, task);

    expect(evalResult.rubricScores).toHaveLength(DEFAULT_RUBRIC.criteria.length);
    const criterionNames = evalResult.rubricScores.map(s => s.criterion);
    expect(criterionNames).toContain('correctness');
    expect(criterionNames).toContain('test_coverage');
    expect(criterionNames).toContain('scope_compliance');
    expect(criterionNames).toContain('documentation');
    expect(typeof evalResult.totalScore).toBe('number');
    expect(typeof evalResult.retryCount).toBe('number');
  });

  it('sprint-phases.ts does NOT import evaluateResult (only evaluateWithRubric)', () => {
    const sprintPhasesPath = join(process.cwd(), 'src/orchestra/sprint-phases.ts');
    const content = readFileSync(sprintPhasesPath, 'utf-8');

    // Must NOT import evaluateResult from result-evaluator
    expect(content).not.toMatch(/import\s*\{[^}]*evaluateResult[^}]*\}\s*from\s*['"]\.\/result-evaluator/);

    // Must import evaluateWithRubric from result-evaluator
    expect(content).toMatch(/import\s*\{[^}]*evaluateWithRubric[^}]*\}\s*from\s*['"]\.\/result-evaluator/);

    // Double-check: no direct evaluateResult() calls (not as part of evaluateWithRubric)
    // Match evaluateResult( but not evaluateWithRubric(
    const lines = content.split('\n');
    const evaluateResultCalls = lines.filter(line =>
      /\bevaluateResult\s*\(/.test(line) && !line.trim().startsWith('//')
    );
    expect(evaluateResultCalls).toHaveLength(0);
  });
});
