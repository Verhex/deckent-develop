// ─── Spurious NO_GO Reconciliation Helper Tests ──────────────────────────
// Sprint 145 Task 015: Tests for reconcileSpuriousNoGo wiring.
// Validates TIMEOUT_WITH_WORK and NO_GO reconciliation pipeline:
//   1. git diff stats → meaningful work exists
//   2. scope compliance → filesChanged ⊂ task.scope
//   3. tsc --noEmit → syntax/type check
//   4. vitest scope → test pass ratio >= 50%

import { describe, it, expect } from 'vitest';
import { reconcileSpuriousNoGo, type ReconciliationDeps } from '../../src/orchestra/mid-sprint-adapter.js';
import { evaluateResult } from '../../src/orchestra/result-evaluator.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '145-015',
    title: 'Test task',
    description: 'Test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/result-evaluator.ts', 'src/orchestra/mid-sprint-adapter.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'EXECUTING',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '145-015',
    workerId: 'w-145-015',
    filesChanged: ['src/orchestra/result-evaluator.ts'],
    linesAdded: 100,
    linesRemoved: 10,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'Worker timeout',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ReconciliationDeps> = {}): ReconciliationDeps {
  return {
    getGitDiffStats: () => ({
      linesChanged: 120,
      filesChanged: ['src/orchestra/result-evaluator.ts', 'src/orchestra/mid-sprint-adapter.ts'],
    }),
    runTscCheck: () => true,
    runVitestScopeCheck: () => ({ passRatio: 0.85, passed: true }),
    ...overrides,
  };
}

// ─── Test Suite 1: TIMEOUT_WITH_WORK scenarios ───────────────────────────

describe('reconcileSpuriousNoGo — TIMEOUT_WITH_WORK', () => {
  it('1. TIMEOUT_WITH_WORK + git diff dolu + tsc PASS → GO_WITH_TECH_DEBT', async () => {
    const result = makeResult({ selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'] });
    const task = makeTask();
    const deps = makeDeps();

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);

    expect(reconciled.decision).toBe('GO_WITH_TECH_DEBT');
    expect(reconciled.reconciled).toBe(true);
    expect(reconciled.tscPassed).toBe(true);
    expect(reconciled.linesChanged).toBe(120);
    expect(reconciled.notes).toContain('Spurious NO_GO reconciled');
  });

  it('2. TIMEOUT_WITH_WORK + git diff boş → NO_GO unchanged', async () => {
    const result = makeResult({ selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'] });
    const task = makeTask();
    const deps = makeDeps({
      getGitDiffStats: () => ({ linesChanged: 0, filesChanged: [] }),
    });

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);

    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.notes).toContain('No file changes');
  });

  it('3. TIMEOUT_WITH_WORK + tsc FAIL → NO_GO', async () => {
    const result = makeResult({ selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'] });
    const task = makeTask();
    const deps = makeDeps({
      runTscCheck: () => false,
    });

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);

    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.tscPassed).toBe(false);
    expect(reconciled.notes).toContain('tsc --noEmit failed');
  });
});

// ─── Test Suite 2: NO_GO scenarios ───────────────────────────────────────

describe('reconcileSpuriousNoGo — NO_GO', () => {
  it('4. NO_GO + git diff > 50 lines + tsc PASS → reconciled GO_WITH_TECH_DEBT', async () => {
    const result = makeResult({ selfAssessment: 'NO_GO' });
    const task = makeTask();
    const deps = makeDeps({
      getGitDiffStats: () => ({
        linesChanged: 80,
        filesChanged: ['src/orchestra/result-evaluator.ts'],
      }),
    });

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);

    expect(reconciled.decision).toBe('GO_WITH_TECH_DEBT');
    expect(reconciled.reconciled).toBe(true);
    expect(reconciled.linesChanged).toBe(80);
  });

  it('5. NO_GO + git diff < 10 lines → NO_GO unchanged (still reconciled if tsc+vitest pass)', async () => {
    const result = makeResult({ selfAssessment: 'NO_GO' });
    const task = makeTask();
    // Even with < 10 lines, if they exist and pass all checks, reconciliation applies
    // The threshold is "any work" not "50 lines" — the 50-line threshold is in evaluateResult
    const deps = makeDeps({
      getGitDiffStats: () => ({
        linesChanged: 5,
        filesChanged: ['src/orchestra/result-evaluator.ts'],
      }),
    });

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);

    // With 5 lines, tsc PASS, vitest 85% → still GO_WITH_TECH_DEBT
    expect(reconciled.decision).toBe('GO_WITH_TECH_DEBT');
    expect(reconciled.reconciled).toBe(true);
  });
});

// ─── Test Suite 3: Scope and vitest edge cases ──────────────────────────

describe('reconcileSpuriousNoGo — edge cases', () => {
  it('6. Scope violation (filesChanged ⊄ scope) → NO_GO + RBAC alert', async () => {
    const result = makeResult({ selfAssessment: 'NO_GO' });
    const task = makeTask({
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/types.ts'],
      },
    });
    // Changed files are in src/orchestra/ but scope only allows src/core/
    const deps = makeDeps({
      getGitDiffStats: () => ({
        linesChanged: 100,
        filesChanged: ['src/orchestra/result-evaluator.ts'],
      }),
    });

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);

    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.scopeCompliant).toBe(false);
    expect(reconciled.notes).toContain('Scope violation');
    expect(reconciled.notes).toContain('RBAC alert');
  });

  it('7. vitest 75% PASS → GO_WITH_TECH_DEBT (notes explain gap)', async () => {
    const result = makeResult({
      selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'],
    });
    const task = makeTask();
    const deps = makeDeps({
      runVitestScopeCheck: () => ({ passRatio: 0.75, passed: true }), // >50% = passed
    });

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);

    expect(reconciled.decision).toBe('GO_WITH_TECH_DEBT');
    expect(reconciled.reconciled).toBe(true);
    expect(reconciled.vitestPassRatio).toBe(0.75);
    expect(reconciled.notes).toContain('75%');
  });

  it('8. T-144-001 scenario simulate (init split TIMEOUT_WITH_WORK) → reconciled GO_WITH_TECH_DEBT', async () => {
    // Simulates Sprint 144 Task 001: worker.ts split 1669→4 files,
    // worker timed out but significant work was done
    const result = makeResult({
      selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'],
      filesChanged: [
        'src/agents/worker-lifecycle.ts',
        'src/agents/worker-verify.ts',
        'src/agents/worker-ipc.ts',
        'src/agents/worker.ts',
      ],
      linesAdded: 450,
      linesRemoved: 300,
      notes: 'Worker timeout — process exceeded time limit. Partial split completed.',
    });
    const task = makeTask({
      id: '144-001',
      title: 'worker.ts Split (1669 → 4 dosya)',
      scope: {
        directories: ['src/agents/', 'tests/agents/'],
        filesRead: [],
        filesWrite: [
          'src/agents/worker.ts',
          'src/agents/worker-lifecycle.ts',
          'src/agents/worker-verify.ts',
          'src/agents/worker-ipc.ts',
        ],
      },
    });
    const deps = makeDeps({
      getGitDiffStats: () => ({
        linesChanged: 750,
        filesChanged: [
          'src/agents/worker-lifecycle.ts',
          'src/agents/worker-verify.ts',
          'src/agents/worker-ipc.ts',
          'src/agents/worker.ts',
        ],
      }),
      runTscCheck: () => true,
      runVitestScopeCheck: () => ({ passRatio: 0.92, passed: true }),
    });

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);

    expect(reconciled.decision).toBe('GO_WITH_TECH_DEBT');
    expect(reconciled.reconciled).toBe(true);
    expect(reconciled.linesChanged).toBe(750);
    expect(reconciled.tscPassed).toBe(true);
    expect(reconciled.vitestPassRatio).toBe(0.92);
    expect(reconciled.notes).toContain('Spurious NO_GO reconciled');
  });
});

// ─── Test Suite 4: evaluateResult integration ────────────────────────────

describe('evaluateResult — Spurious NO_GO wire integration', () => {
  it('TIMEOUT_WITH_WORK always returns GO_WITH_TECH_DEBT (no projectRoot)', async () => {
    const result = makeResult({
      selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'],
    });
    const task = makeTask();

    // Without projectRoot — fallback behavior
    const evaluation = await evaluateResult(result, task);
    expect(evaluation).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('NO_GO without projectRoot → NO_GO (no reconciliation attempted)', async () => {
    const result = makeResult({ selfAssessment: 'NO_GO' });
    const task = makeTask();

    const evaluation = await evaluateResult(result, task);
    expect(evaluation).toBe(TaskEvaluation.NO_GO);
  });

  it('vitest < 50% pass ratio → NO_GO (reconciliation fails)', async () => {
    const result = makeResult({ selfAssessment: 'NO_GO' });
    const task = makeTask();
    const deps: ReconciliationDeps = {
      getGitDiffStats: () => ({
        linesChanged: 100,
        filesChanged: ['src/orchestra/result-evaluator.ts'],
      }),
      runTscCheck: () => true,
      runVitestScopeCheck: () => ({ passRatio: 0.30, passed: false }),
    };

    const reconciled = await reconcileSpuriousNoGo(result, task, '/workspace', deps);
    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.vitestPassRatio).toBe(0.30);
  });
});
