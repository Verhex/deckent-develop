import { describe, it, expect } from 'vitest';
import {
  buildTaskForEval, mapEvaluation, evaluateBacklogResult,
} from '../../../src/orchestra/autonomous/backlog-eval.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult, EvaluationResult } from '../../../src/core/types.js';

const entry: BacklogEntry = {
  id: 'roles', title: 'Roles CRUD', kind: 'task',
  spec: { scopeDir: 'src/api/', description: 'add roles crud endpoints' },
  policy: 'auto', trigger: { type: 'one-off' }, status: 'running',
  lastRun: null, lastResult: null,
};

function result(over: Partial<TaskResult>): TaskResult {
  return {
    taskId: 'run-1', workerId: 'w1', filesChanged: ['src/api/roles.ts', 'tests/api/roles.test.ts'],
    linesAdded: 120, linesRemoved: 4, testsPassed: true, coverage: 92,
    selfAssessment: 'DONE', notes: 'done', ...over,
  };
}

describe('buildTaskForEval', () => {
  it('maps entry+result into a Task with JIT description, scope, and run-id', () => {
    const task = buildTaskForEval(entry, result({}));
    expect(task.id).toBe('run-1');                       // result.taskId wins
    expect(task.description).toBe('add roles crud endpoints');
    expect(task.scope.directories).toEqual(['src/api/']);
    expect(task.goNogo.goCriteria).toBe('Roles CRUD');   // summary ?? title
  });
});

describe('mapEvaluation (EvaluationResult -> BacklogEvaluation)', () => {
  const rubric = (over: Partial<EvaluationResult>): EvaluationResult => ({
    decision: 'DONE', totalScore: 95,
    rubricScores: [{ criterion: 'correctness', score: 95, passed: true, reason: 'ok' }],
    retryCount: 0, ...over,
  });
  it('clean DONE → reconciled false, quality = totalScore', () => {
    const m = mapEvaluation(result({ selfAssessment: 'DONE' }), rubric({}));
    expect(m).toEqual({ decision: 'DONE', quality: 95, reconciled: false, reason: 'all criteria passed' });
  });
  it('selfAssessment NO_GO but kernel decided GO_WITH_TECH_DEBT → reconciled true', () => {
    const m = mapEvaluation(
      result({ selfAssessment: 'NO_GO' }),
      rubric({ decision: 'GO_WITH_TECH_DEBT', totalScore: 78,
        rubricScores: [{ criterion: 'test_coverage', score: 40, passed: false, reason: 'low coverage' }] }),
    );
    expect(m.decision).toBe('GO_WITH_TECH_DEBT');
    expect(m.reconciled).toBe(true);
    expect(m.quality).toBe(78);
    expect(m.reason).toBe('low coverage');               // worst failing criterion
  });
});

describe('evaluateBacklogResult (end-to-end via real evaluateWithRubric)', () => {
  it('a clean passing result decides non-NO_GO', () => {
    const e = evaluateBacklogResult(entry, result({}), '/nonexistent-root');
    expect(e.decision).not.toBe('NO_GO');
    expect(e.reconciled).toBe(false);
  });
  it('an honest NO_GO with no disk work stays NO_GO', () => {
    const e = evaluateBacklogResult(
      entry,
      result({ selfAssessment: 'NO_GO', testsPassed: false, filesChanged: [], coverage: 0 }),
      '/nonexistent-root',
    );
    expect(e.decision).toBe('NO_GO');
    expect(e.reconciled).toBe(false);
  });
});
