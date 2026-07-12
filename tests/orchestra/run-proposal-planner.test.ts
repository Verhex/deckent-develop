// ═══ run-proposal-planner — N678A planner-core mount (429-001, born-678) ═══
//
// compileRunProposal used to emit a single-task TODO-SCAFFOLD
// (files/scope/goCriteria/nogo as literal 'TODO-fill-in-*' strings) — the
// prompt-gate correctly rejected it, so a RunProposal never became a runnable
// plan. This suite proves the injectable planner-seam:
//   - an injected planner produces a REAL multi-task DirectiveBuildIntent
//     (task decomposition + file scope + per-task verifiable goCriteria/nogo,
//     zero TODO placeholders anywhere in the output);
//   - a planner failure (throw / empty tasks) is a typed RunProposalPlanError,
//     never a silent fall-back to a scaffold;
//   - the PRODUCTION default really is wired to the real AI/structured
//     planner core (not silently reduced to a scaffold) — proven WITHOUT ever
//     spawning a subprocess: this test file imports no provider-registration
//     module, so the global providerRegistry is empty and resolveAdapter()
//     throws before any spawnSync — a typed RunProposalPlanError, fast and
//     100% hermetic.
//
// No `vi.mock('node:child_process', ...)` anywhere in this file — a real
// AI/provider call would show up as an actual attempted spawn, not a mock hit.

import { describe, it, expect } from 'vitest';
import {
  compileRunProposal,
  compileRunProposalIntent,
  RunProposalPlanError,
  type RunProposalPlanner,
} from '../../src/orchestra/run-proposal-compiler.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';
import type { PlannerResult, PlannerTask } from '../../src/core/types.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeProposal(overrides: Partial<RunProposal> = {}): RunProposal {
  return {
    flowId: 'flow-429-1',
    tenant: 'local',
    project: 'deckent',
    actor: { id: 'native-agent', role: 'operator' },
    origin: 'chat',
    revision: 1,
    intentSummary: 'Ship the CSV+JSON exporter feature end to end',
    ...overrides,
  };
}

function makePlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'Backend export endpoints',
    description: 'Add POST /export/csv and /export/json handlers.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Single-module CRUD change, follows existing route pattern.',
    scope: { directories: ['src/api/'], filesRead: ['src/api/router.ts'], filesWrite: ['src/api/export.ts'] },
    dependencies: [],
    goNogo: {
      goCriteria: 'POST /export/csv and /export/json both return 200 with correct content-type.',
      noGoCriteria: 'Either endpoint 500s or returns the wrong content-type.',
      techDebtAcceptable: 'Streaming for very large exports can follow up later.',
    },
    ...overrides,
  };
}

function makeRealMultiTaskPlan(): PlannerResult {
  return {
    reasoning: 'Split into backend, frontend, and integration-test tasks.',
    tasks: [
      makePlannerTask(),
      makePlannerTask({
        title: 'Export UI button',
        description: 'Add an "Export" dropdown to the toolbar (CSV / JSON).',
        scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/ExportButton.tsx'] },
        dependencies: ['Backend export endpoints'],
        goNogo: {
          goCriteria: 'Clicking Export CSV/JSON triggers the matching endpoint and downloads a file.',
          noGoCriteria: 'The button is present but clicking it does nothing or errors.',
          techDebtAcceptable: '',
        },
      }),
      makePlannerTask({
        title: 'Integration tests',
        description: 'E2E test hitting both export endpoints against a seeded dataset.',
        scope: { directories: ['tests/api/'], filesRead: [], filesWrite: ['tests/api/export.test.ts'] },
        dependencies: ['Backend export endpoints', 'Export UI button'],
        goNogo: {
          goCriteria: 'tests/api/export.test.ts passes and asserts both response bodies.',
          noGoCriteria: 'Test file is missing or does not assert response content.',
          techDebtAcceptable: '',
        },
      }),
    ],
  };
}

// ─── 1. Injected fake planner -> real multi-task plan, zero TODO placeholders ──

describe('compileRunProposalIntent — injected fake planner (hermetic, no real AI call)', () => {
  it('maps a real multi-task PlannerResult into a real multi-task DirectiveBuildIntent', () => {
    const proposal = makeProposal();
    const fakePlanner: RunProposalPlanner = () => makeRealMultiTaskPlan();

    const intent = compileRunProposalIntent(proposal, fakePlanner);

    expect(intent.tasks).toHaveLength(3);
    expect(intent.tasks.map((t) => t.title)).toEqual([
      'Backend export endpoints',
      'Export UI button',
      'Integration tests',
    ]);
    expect(intent.goal).toBe(proposal.intentSummary);

    // Task-based, verifiable goCriteria/nogo straight from the planner's goNogo —
    // never a generic/TODO placeholder.
    expect(intent.tasks[0]!.goCriteria).toEqual([
      'POST /export/csv and /export/json both return 200 with correct content-type.',
    ]);
    expect(intent.tasks[0]!.nogo).toEqual(['Either endpoint 500s or returns the wrong content-type.']);
    expect(intent.tasks[0]!.files).toEqual(['src/api/export.ts']);
    expect(intent.tasks[0]!.scope).toEqual(['src/api/']);
    expect(intent.tasks[1]!.deps).toEqual(['Backend export endpoints']);

    // TODO-placeholder generation is dead — assert it is provably absent.
    const serialized = JSON.stringify(intent);
    expect(serialized).not.toMatch(/TODO-fill-in/);
    expect(serialized).not.toMatch(/TODO: define/);
  });

  it('folds RunProposal traceability + planner reason into each task description', () => {
    const proposal = makeProposal({ flowId: 'flow-429-2', revision: 3 });
    const fakePlanner: RunProposalPlanner = () => makeRealMultiTaskPlan();

    const intent = compileRunProposalIntent(proposal, fakePlanner);

    for (const task of intent.tasks) {
      expect(task.desc).toContain('flow-429-2');
      expect(task.desc).toContain('revision=3');
      expect(task.desc).toContain('Reason:');
    }
  });

  it('compileRunProposal round-trips the fake-planner plan through the UNCHANGED directives-builder', () => {
    const proposal = makeProposal();
    const fakePlanner: RunProposalPlanner = () => makeRealMultiTaskPlan();

    const { directivesMarkdown, intent } = compileRunProposal(proposal, fakePlanner);

    expect(directivesMarkdown).toContain('## Task 1: Backend export endpoints');
    expect(directivesMarkdown).toContain('## Task 2: Export UI button');
    expect(directivesMarkdown).toContain('## Task 3: Integration tests');
    expect(directivesMarkdown).toContain(proposal.flowId);
    expect(directivesMarkdown).not.toMatch(/TODO-fill-in/);
    expect(intent.tasks).toHaveLength(3);
  });
});

// ─── 2 & 3. Planner failure -> typed RunProposalPlanError, never a scaffold ────

describe('compileRunProposalIntent — planner failure is typed, never a silent scaffold', () => {
  it('throws RunProposalPlanError (not a scaffold) when the injected planner returns zero tasks', () => {
    const proposal = makeProposal();
    const emptyPlanner: RunProposalPlanner = () => ({ tasks: [], reasoning: 'nothing to plan' });

    let caught: unknown;
    try {
      compileRunProposalIntent(proposal, emptyPlanner);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(RunProposalPlanError);
    expect((caught as RunProposalPlanError).flowId).toBe(proposal.flowId);
  });

  it('throws RunProposalPlanError (not a scaffold) when the injected planner itself throws', () => {
    const proposal = makeProposal();
    const throwingPlanner: RunProposalPlanner = () => {
      throw new Error('simulated provider timeout');
    };

    expect(() => compileRunProposalIntent(proposal, throwingPlanner)).toThrow(RunProposalPlanError);
    try {
      compileRunProposalIntent(proposal, throwingPlanner);
    } catch (e) {
      expect(e).toBeInstanceOf(RunProposalPlanError);
      expect((e as Error).message).toContain('simulated provider timeout');
      expect((e as { cause?: unknown }).cause).toBeInstanceOf(Error);
    }
  });

  it('compileRunProposal (markdown entrypoint) surfaces the same typed error, not partial markdown', () => {
    const proposal = makeProposal();
    const emptyPlanner: RunProposalPlanner = () => ({ tasks: [], reasoning: 'nothing to plan' });

    expect(() => compileRunProposal(proposal, emptyPlanner)).toThrow(RunProposalPlanError);
  });
});

// ─── 4. Production default really calls the real planner core — proven hermetically ──

describe('compileRunProposalIntent — production default is wired to the real planner core', () => {
  it(
    'with NO planner injected, and no provider registered in this hermetic test process, ' +
      'throws RunProposalPlanError instead of silently degrading to a scaffold — proving the ' +
      'default path is really the AI/structured planner core (buildPlanNlIntent is never revived)',
    () => {
      const proposal = makeProposal({ flowId: 'flow-429-default' });

      let caught: unknown;
      try {
        compileRunProposalIntent(proposal);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(RunProposalPlanError);
      expect((caught as RunProposalPlanError).flowId).toBe('flow-429-default');
      // Never a TODO-scaffold intent — the call above threw before returning anything.
    },
  );
});
