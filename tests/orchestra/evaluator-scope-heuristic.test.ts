import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  scoreScopeCompliance,
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
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] },
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
    filesChanged: ['src/core/config.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'All tests pass. Implementation complete.',
    ...overrides,
  };
}

// ─── D-5: Scope Compliance Heuristic Relaxation ─────────────────────

describe('scoreScopeCompliance() — auxiliary directory whitelist', () => {
  it('gives 100 for files all within scope', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({ filesChanged: ['src/core/config.ts', 'src/core/types.ts'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
  });

  it('gives 0 for files completely outside scope with no auxiliary', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({ filesChanged: ['src/agents/worker.ts'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(0);
    expect(score.passed).toBe(false);
  });

  it('gives partial credit (80) for auxiliary docs/ files outside scope', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({ filesChanged: ['docs/guide.md'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(80);
    expect(score.passed).toBe(true);
    expect(score.reason).toContain('auxiliary');
  });

  it('gives partial credit for .deckent/ files outside scope', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({ filesChanged: ['.deckent/config.json'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(80);
    expect(score.passed).toBe(true);
  });

  it('handles mixed in-scope + auxiliary files correctly', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({
      filesChanged: ['src/core/config.ts', 'docs/api.md', '.deckent/config.json'],
    });
    const score = scoreScopeCompliance(result, task);
    // (1*100 + 2*80) / (3*100) * 100 = 260/300 * 100 = 86.67 → 87
    expect(score.score).toBeGreaterThanOrEqual(86);
    expect(score.passed).toBe(true);
  });

  it('handles mixed in-scope + out-of-scope + auxiliary files', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({
      filesChanged: ['src/core/config.ts', 'src/agents/worker.ts', 'docs/guide.md'],
    });
    const score = scoreScopeCompliance(result, task);
    // (1*100 + 0*100 + 1*80) / (3*100) * 100 = 180/300 * 100 = 60
    expect(score.score).toBe(60);
    expect(score.passed).toBe(false); // < 80 threshold
  });

  it('gives 100 for no files changed', () => {
    const task = makeTask();
    const result = makeResult({ filesChanged: [] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
  });

  it('gives partial credit for .tasks/ files', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({ filesChanged: ['.tasks/task-001.hb'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(80);
  });

  it('gives partial credit for CHANGELOG at root', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({ filesChanged: ['CHANGELOG.md'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(80);
    expect(score.passed).toBe(true);
  });
});

describe('evaluateWithRubric() — scope heuristic in full evaluation', () => {
  it('does NOT give NO_GO when only auxiliary files are out of scope', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({
      filesChanged: ['src/core/config.ts', 'docs/guide.md'],
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'Implementation complete with documentation update.',
    });

    const evalResult = evaluateWithRubric(result, task);
    // Should not be NO_GO just because docs/ was touched
    expect(evalResult.decision).not.toBe('NO_GO');
  });
});
