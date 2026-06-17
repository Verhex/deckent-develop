import { describe, it, expect } from 'vitest';
import {
  buildTaskForEval, mapEvaluation, evaluateBacklogResult, auditBacklogResult,
  crossVerifyBacklogResult,
} from '../../../src/orchestra/autonomous/backlog-eval.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult, EvaluationResult, ResolvedConfig } from '../../../src/core/types.js';
import type { VerificationResult } from '../../../src/monitor/auditor.js';

const passFn = async (): Promise<VerificationResult> => ({ verdict: 'PASS', reason: 'ok' });
const failFn = async (): Promise<VerificationResult> => ({ verdict: 'FAIL', reason: 'broke' });

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

describe('auditBacklogResult (Component ② — advisory)', () => {
  it('in-scope clean result → boundary clean, adr ok, functional pass', async () => {
    const v = await auditBacklogResult(
      entry, result({ filesChanged: ['src/api/roles.ts'] }), '/nonexistent-root',
      { verifyFunctional: passFn },
    );
    expect(v.boundary).toBe('clean');
    expect(v.adr).toBe('ok');                            // no .brain/memory.db → no ADR rules
    expect(v.functional).toBe('pass');
  });
  it('out-of-scope filesChanged → boundary violation list', async () => {
    const v = await auditBacklogResult(
      entry, result({ filesChanged: ['src/orchestra/elsewhere.ts'] }), '/nonexistent-root',
      { verifyFunctional: passFn },
    );
    expect(Array.isArray(v.boundary)).toBe(true);
    expect((v.boundary as unknown[]).length).toBe(1);
  });
  it('maps a FAIL/DOWNGRADE verifyWorkerResult verdict to functional fail', async () => {
    const v = await auditBacklogResult(
      entry, result({ filesChanged: ['src/api/roles.ts'] }), '/nonexistent-root',
      { verifyFunctional: failFn },
    );
    expect(v.functional).toBe('fail');
  });
  it('skips functional when no files changed', async () => {
    const v = await auditBacklogResult(
      entry, result({ filesChanged: [] }), '/nonexistent-root', { verifyFunctional: passFn },
    );
    expect(v.functional).toBe('skipped');
  });
  it('treats scopeDir "." as unrestricted (no boundary claim)', async () => {
    const broad: typeof entry = { ...entry, spec: { ...entry.spec, scopeDir: '.' } };
    const v = await auditBacklogResult(
      broad, result({ filesChanged: ['anywhere/file.ts'] }), '/nonexistent-root',
      { verifyFunctional: passFn },
    );
    expect(v.boundary).toBe('clean');
  });
});

const passingEval = { decision: 'DONE' as const, quality: 95, reconciled: false, reason: 'ok' };

describe('crossVerifyBacklogResult (Component ③ — XVER-1 cross-provider, advisory)', () => {
  it('honest-skips (ran:false) when cross_verify is disabled (no config)', async () => {
    const xv = await crossVerifyBacklogResult(entry, result({}), '/nonexistent-root', undefined, passingEval);
    expect(xv.ran).toBe(false);
    expect(xv.verdict).toBeUndefined();
  });
  it('surfaces a refuted advisory but does NOT throw / does not block (advisory)', async () => {
    const config = { cross_verify: { enabled: true, high_stakes_only: false } } as unknown as ResolvedConfig;
    const xv = await crossVerifyBacklogResult(
      entry, result({}), '/nonexistent-root', config, passingEval,
      {
        availableProviders: ['claude', 'codex'],
        spawnVerifier: async () => 'VERDICT: refuted\nThe change does not cover the error path.',
      },
    );
    expect(xv.ran).toBe(true);
    expect(xv.verdict).toBe('refuted');
  });
});
