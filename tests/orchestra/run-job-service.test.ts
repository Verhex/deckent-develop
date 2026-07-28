// ═══ run-job-service.test — TERM-FLOW-UNIFY Sprint-4 dilim (426-001) ═══════
//
// Covers: (1) a static import-scan guard proving run-job-service.ts can
// never trigger a fresh plan — "flag-açıkken fresh-replan ölür (yeni
// plan-fazı çağrılmaz)" is structural, not a runtime if-check; (2) the CAS
// digest-mismatch refusal; (3) not-approved refusal; (4) budget/topology
// refusal; (5) success returns the immutable Sprint without a side effect.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  startApprovedRun,
  RunJobFlowNotApprovedError,
  RunJobDigestMismatchError,
  RunJobBudgetHoldError,
  RunJobTopologyHoldError,
  type ApprovedRunSnapshotInput,
  type StartApprovedRunDeps,
} from '../../src/orchestra/run-job-service.js';
import type { Sprint } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import {
  computeExecutionPlanDigest,
  computeExecutionPlanDigestV3,
  EXECUTION_PLAN_DIGEST_VERSION,
  EXECUTION_PLAN_DIGEST_VERSION_V2,
  type ExecutionPlanDigestContext,
} from '../../src/core/execution-plan-digest.js';

// ─── Fixtures ───────────────────────────────────────────────────────────

function makeSprint(id = 'sprint-999'): Sprint {
  return {
    id,
    number: 999,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks: [],
    workers: [],
  };
}

function makeApprovedSnapshot(overrides: Partial<ApprovedRunSnapshotInput> = {}): ApprovedRunSnapshotInput {
  return {
    flowId: 'flow-1',
    revision: 1,
    planDigest: 'digest-abc',
    approvedBy: { id: 'alperen' },
    approvedAt: '2026-07-12T00:00:00.000Z',
    sprint: makeSprint(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<StartApprovedRunDeps> = {}): StartApprovedRunDeps {
  return {
    flowId: 'flow-1',
    expectedRevision: 1,
    expectedPlanDigest: 'digest-abc',
    approvedSnapshot: makeApprovedSnapshot(),
    ...overrides,
  };
}

// ─── Static import-scan guard ───────────────────────────────────────────

/** Strip `/* ... *\/` block comments and `// ...` line comments so the guard
 *  below scans real CODE only — the file's own doc comments legitimately
 *  name `planSprint`/`runPlanPhase`/`cli/repl/run-flow-store.ts` in prose to
 *  EXPLAIN why no such import/call exists in code. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('run-job-service.ts — structural no-replan guard', () => {
  it('never imports a planning entrypoint (sprint-controller/sprint-phases/brain)', () => {
    const source = stripComments(readFileSync(
      new URL('../../src/orchestra/run-job-service.ts', import.meta.url),
      'utf-8',
    ));
    expect(source).not.toMatch(/from ['"]\.\/sprint-controller\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/sprint-phases\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/brain\.js['"]/);
    expect(source).not.toContain('runPlanPhase');
    expect(source).not.toContain('planSprint');
    expect(source).not.toContain('runSprint(');
  });

  it('never imports the cli/repl run-flow-store (ADR-D-004 C2 — orchestra must not import cli/)', () => {
    const source = stripComments(readFileSync(
      new URL('../../src/orchestra/run-job-service.ts', import.meta.url),
      'utf-8',
    ));
    expect(source).not.toMatch(/cli\/repl\/run-flow-store/);
  });
});

// ─── Functional behavior ─────────────────────────────────────────────────

describe('startApprovedRun', () => {
  it('throws RunJobFlowNotApprovedError when no snapshot was ever approved', () => {
    const deps = makeDeps({ approvedSnapshot: undefined });
    expect(() => startApprovedRun(deps)).toThrow(RunJobFlowNotApprovedError);
  });

  it('throws RunJobDigestMismatchError when expected revision/digest does not CAS-match the approved snapshot', () => {
    const deps = makeDeps({ expectedPlanDigest: 'wrong-digest' });
    let caught: unknown;
    try {
      startApprovedRun(deps);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RunJobDigestMismatchError);
    expect((caught as RunJobDigestMismatchError).code).toBe('RUN_JOB_DIGEST_MISMATCH');
    expect((caught as RunJobDigestMismatchError).actualPlanDigest).toBe('digest-abc');
  });

  it('throws RunJobDigestMismatchError on a revision mismatch even when the digest string matches', () => {
    const deps = makeDeps({ expectedRevision: 2 });
    expect(() => startApprovedRun(deps)).toThrow(RunJobDigestMismatchError);
  });

  it('refuses every budget HOLD before spawnStart and reports held tasks deterministically', () => {
    const heldSprint = makeSprint();
    heldSprint.tasks = [
      {
        id: '999-020', title: 'B', description: 'B', model: 'claude-sonnet-5', effort: 'normal',
        priority: 'NORMAL', reason: 'test', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [], goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
        status: TaskStatus.PENDING,
        budgetPolicy: {
          state: 'hold', role: 'worker', resolvedProvider: 'claude', executionCostClass: 'remote',
          profileRef: 'execution_budget.roles.worker.default', reasonCode: 'budget-policy-missing',
        },
      },
      {
        id: '999-010', title: 'A', description: 'A', model: 'claude-sonnet-5', effort: 'normal',
        priority: 'NORMAL', reason: 'test', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [], goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
        status: TaskStatus.PENDING,
        budgetPolicy: {
          state: 'hold', role: 'worker', resolvedProvider: 'claude', executionCostClass: 'remote',
          profileRef: 'execution_budget.roles.worker.by_task_kind.documentation', reasonCode: 'role-profile-missing',
        },
      },
    ];
    const deps = makeDeps({ approvedSnapshot: makeApprovedSnapshot({ sprint: heldSprint }) });

    let caught: unknown;
    try {
      startApprovedRun(deps);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RunJobBudgetHoldError);
    expect((caught as RunJobBudgetHoldError).heldTasks.map(task => [task.slot, task.title])).toEqual([[1, 'B'], [2, 'A']]);
  });

  it('derives v2 HOLD from the canonical projection even when raw task budgetPolicy is absent', () => {
    const heldSprint = makeSprint();
    heldSprint.tasks = [{
      id: '999-001', title: 'Remote', description: 'Remote', model: 'claude-sonnet-5', effort: 'normal',
      priority: 'NORMAL', reason: 'test', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: TaskStatus.PENDING, provider: 'claude', type: 'code-development',
    }];
    const context = {
      configuredProvider: 'claude',
      configuredModel: 'claude-sonnet-5',
      configuredBackend: 'docker',
      configuredAuthMode: 'subscription',
      fallbackProvider: null,
      fallbackPolicy: null,
      executionBudgetPolicy: null,
    } satisfies ExecutionPlanDigestContext;
    const planDigest = computeExecutionPlanDigest(heldSprint, context).digest;
    const deps = makeDeps({
      expectedPlanDigest: planDigest,
      approvedSnapshot: makeApprovedSnapshot({
        planDigest,
        planDigestVersion: EXECUTION_PLAN_DIGEST_VERSION_V2,
        planDigestContext: context,
        sprint: heldSprint,
      }),
    });

    expect(() => startApprovedRun(deps)).toThrow(RunJobBudgetHoldError);
  });

  it('keeps explicit local-exempt and legacy-v1 tasks startable', () => {
    const allowedSprint = makeSprint();
    allowedSprint.tasks = [{
      id: '999-001', title: 'Local', description: 'Local', model: 'qwen3.6:27b', effort: 'normal',
      priority: 'NORMAL', reason: 'test', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: TaskStatus.PENDING,
      budgetPolicy: {
        state: 'allow', role: 'worker', resolvedProvider: 'ollama', executionCostClass: 'local',
        profileRef: 'local-exempt', policyDigest: 'a'.repeat(64),
      },
    }];
    const local = makeDeps({ approvedSnapshot: makeApprovedSnapshot({ sprint: allowedSprint }) });
    expect(startApprovedRun(local).status).toBe('validated');

    const legacy = makeDeps();
    expect(startApprovedRun(legacy).status).toBe('validated');
  });

  it('refuses a digest-valid v3 snapshot with an undeclared writer collision before spawnStart', () => {
    const blockedSprint = makeSprint();
    blockedSprint.tasks = ['A', 'B'].map((title, index) => ({
      id: `volatile-${index}`,
      title,
      description: title,
      model: 'qwen3.6:27b',
      effort: 'normal' as const,
      priority: 'NORMAL' as const,
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: TaskStatus.PENDING,
      provider: 'ollama' as const,
    }));
    const context = {
      configuredProvider: 'ollama',
      configuredModel: 'qwen3.6:27b',
      configuredBackend: 'subprocess',
      configuredAuthMode: 'subscription',
      fallbackProvider: null,
      fallbackPolicy: null,
      executionBudgetPolicy: null,
      configuredMaxWorkers: 4,
    } satisfies ExecutionPlanDigestContext;
    const planDigest = computeExecutionPlanDigestV3(blockedSprint, context).digest;
    const deps = makeDeps({
      expectedPlanDigest: planDigest,
      approvedSnapshot: makeApprovedSnapshot({
        planDigest,
        planDigestVersion: EXECUTION_PLAN_DIGEST_VERSION,
        planDigestContext: context,
        sprint: blockedSprint,
      }),
    });

    expect(() => startApprovedRun(deps)).toThrow(RunJobTopologyHoldError);
  });

  it('returns the exact approved Sprint without executing a start side effect', () => {
    const deps = makeDeps();
    const result = startApprovedRun(deps);
    expect(result.status).toBe('validated');
    expect(result.sprint).toBe(deps.approvedSnapshot!.sprint);
  });
});
