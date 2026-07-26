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
//     throws before any spawn — a typed RunProposalPlanError, fast and
//     100% hermetic.
//
// No `vi.mock('node:child_process', ...)` anywhere in this file — a real
// AI/provider call would show up as an actual attempted spawn, not a mock hit.

import { describe, it, expect, vi } from 'vitest';
import {
  compileRunProposal,
  compileRunProposalIntent,
  RunProposalPlanError,
  type RunProposalPlanner,
} from '../../src/orchestra/run-proposal-compiler.js';
import { callZeroConfigPlanner, buildZeroConfigPlanPrompt } from '../../src/orchestra/planner.js';
import { DEFAULT_MODES } from '../../src/core/config.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';
import type { DeckentConfig, PlannerResult, PlannerTask } from '../../src/core/types.js';

// Task 431-003 — spy (never replace) `callZeroConfigPlanner` so the model-selection
// tests below (group 5) can assert on the `model` argument `defaultRunProposalPlanner`
// passes in. `actual.callZeroConfigPlanner` is preserved as the real implementation —
// it still calls the real `resolveAdapter()`, which still throws because no provider is
// registered in this hermetic process — so group 4's "production default is wired to the
// real planner core" guarantee is untouched by this wrapper.
vi.mock('../../src/orchestra/planner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/planner.js')>();
  return {
    ...actual,
    callZeroConfigPlanner: vi.fn(actual.callZeroConfigPlanner),
  };
});

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
    model: 'claude-sonnet-5',
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
  it('maps a real multi-task PlannerResult into a real multi-task DirectiveBuildIntent', async () => {
    const proposal = makeProposal();
    const fakePlanner: RunProposalPlanner = () => makeRealMultiTaskPlan();

    const intent = await compileRunProposalIntent(proposal, fakePlanner);

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

  it('U1-G2: traceability travels in the meta field — NEVER in the description (reason stays)', async () => {
    // Pre-U1 this test pinned the OPPOSITE: flowId folded into desc. That
    // embedding poisoned intent classification ('cd' matched a flowId hex,
    // A1-İz#2 / sprint-442 misroute) and is now forbidden.
    const proposal = makeProposal({ flowId: 'flow-429-2', revision: 3 });
    const fakePlanner: RunProposalPlanner = () => makeRealMultiTaskPlan();

    const intent = await compileRunProposalIntent(proposal, fakePlanner);

    for (const task of intent.tasks) {
      expect(task.desc).not.toContain('flow-429-2');
      expect(task.desc).not.toContain('RunProposal metadata');
      expect(task.desc).toContain('Reason:');
      expect(task.meta?.flowId).toBe('flow-429-2');
      expect(task.meta?.revision).toBe('3');
    }
  });

  it('compileRunProposal round-trips the fake-planner plan through the UNCHANGED directives-builder', async () => {
    const proposal = makeProposal();
    const fakePlanner: RunProposalPlanner = () => makeRealMultiTaskPlan();

    const { directivesMarkdown, intent } = await compileRunProposal(proposal, fakePlanner);

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
  it('throws RunProposalPlanError (not a scaffold) when the injected planner returns zero tasks', async () => {
    const proposal = makeProposal();
    const emptyPlanner: RunProposalPlanner = () => ({ tasks: [], reasoning: 'nothing to plan' });

    let caught: unknown;
    try {
      await compileRunProposalIntent(proposal, emptyPlanner);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(RunProposalPlanError);
    expect((caught as RunProposalPlanError).flowId).toBe(proposal.flowId);
  });

  it('throws RunProposalPlanError (not a scaffold) when the injected planner itself throws', async () => {
    const proposal = makeProposal();
    const throwingPlanner: RunProposalPlanner = () => {
      throw new Error('simulated provider timeout');
    };

    await expect(compileRunProposalIntent(proposal, throwingPlanner)).rejects.toThrow(RunProposalPlanError);
    try {
      await compileRunProposalIntent(proposal, throwingPlanner);
    } catch (e) {
      expect(e).toBeInstanceOf(RunProposalPlanError);
      expect((e as Error).message).toContain('simulated provider timeout');
      expect((e as { cause?: unknown }).cause).toBeInstanceOf(Error);
    }
  });

  it('compileRunProposal (markdown entrypoint) surfaces the same typed error, not partial markdown', async () => {
    const proposal = makeProposal();
    const emptyPlanner: RunProposalPlanner = () => ({ tasks: [], reasoning: 'nothing to plan' });

    await expect(compileRunProposal(proposal, emptyPlanner)).rejects.toThrow(RunProposalPlanError);
  });
});

// ─── 4. Production default really calls the real planner core — proven hermetically ──

describe('compileRunProposalIntent — production default is wired to the real planner core', () => {
  it(
    'with NO planner injected, and no provider registered in this hermetic test process, ' +
      'throws RunProposalPlanError instead of silently degrading to a scaffold — proving the ' +
      'default path is really the AI/structured planner core (buildPlanNlIntent is never revived)',
    async () => {
      const proposal = makeProposal({ flowId: 'flow-429-default' });

      let caught: unknown;
      try {
        await compileRunProposalIntent(proposal);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(RunProposalPlanError);
      expect((caught as RunProposalPlanError).flowId).toBe('flow-429-default');
      // Never a TODO-scaffold intent — the call above threw before returning anything.
    },
  );
});

// ─── 5. Model selection: resolveBrainModel(config) wiring (Task 431-003) ───────
//
// The former bare 'sonnet' literal at defaultRunProposalPlanner's
// callZeroConfigPlanner call site is now resolveBrainModel(config). Every call
// below still exercises the REAL callZeroConfigPlanner (wrapped, not replaced,
// by the vi.fn spy above) — it still throws via the real resolveAdapter() with
// no provider registered, so these assertions read the `model` argument off
// the spy's recorded call, then let the same RunProposalPlanError surface.

describe('defaultRunProposalPlanner — model resolution via resolveBrainModel(config)', () => {
  it("passes the balanced-mode canonical 'claude-sonnet-5' when no config is given", async () => {
    const proposal = makeProposal({ flowId: 'flow-431-no-config' });
    const spy = vi.mocked(callZeroConfigPlanner);
    spy.mockClear();

    await expect(compileRunProposalIntent(proposal)).rejects.toThrow(RunProposalPlanError);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe('claude-sonnet-5');
  });

  it("passes 'claude-sonnet-5' for an economic-mode config", async () => {
    const proposal = makeProposal({ flowId: 'flow-431-economic' });
    const spy = vi.mocked(callZeroConfigPlanner);
    spy.mockClear();

    const config: DeckentConfig = { mode: 'economic', modes: DEFAULT_MODES };
    await expect(compileRunProposalIntent(proposal, undefined, config)).rejects.toThrow(RunProposalPlanError);

    expect(spy.mock.calls[0]?.[1]).toBe('claude-sonnet-5');
  });

  it("passes 'claude-opus-4-8' for a performance-mode config", async () => {
    const proposal = makeProposal({ flowId: 'flow-431-performance' });
    const spy = vi.mocked(callZeroConfigPlanner);
    spy.mockClear();

    const config: DeckentConfig = { mode: 'performance', modes: DEFAULT_MODES };
    await expect(compileRunProposalIntent(proposal, undefined, config)).rejects.toThrow(RunProposalPlanError);

    expect(spy.mock.calls[0]?.[1]).toBe('claude-opus-5');
  });

  it('keeps the Brain invocation model separate from the configured Worker task-model policy', async () => {
    const proposal = makeProposal({ flowId: 'flow-role-split' });
    const spy = vi.mocked(callZeroConfigPlanner);
    spy.mockClear();

    const config: DeckentConfig = {
      mode: 'balanced',
      modes: DEFAULT_MODES,
      brain_provider: 'claude',
      worker_provider: 'codex',
    };
    await expect(compileRunProposalIntent(proposal, undefined, config)).rejects.toThrow(RunProposalPlanError);

    expect(spy.mock.calls[0]?.[1]).toBe('claude-sonnet-5');
    expect(spy.mock.calls[0]?.[8]).toMatchObject({ defaultModel: 'gpt-5.6-sol' });
    expect(spy.mock.calls[0]?.[8]?.allowedModels).toEqual(
      expect.arrayContaining(['gpt-5.5', 'gpt-5.6-sol']),
    );
  });

  it('F-1: grounds the planner with the REAL tracked file tree (no more blind planning)', async () => {
    // This test process runs at the repo root, so `git ls-files` returns the
    // real tracked set — the 4th argument must be a non-empty file list
    // containing a known tracked file (hermetic: tracked state exists on a
    // fresh checkout; nothing gitignored is read).
    const proposal = makeProposal({ flowId: 'flow-f1-tree' });
    const spy = vi.mocked(callZeroConfigPlanner);
    spy.mockClear();

    await expect(compileRunProposalIntent(proposal)).rejects.toThrow(RunProposalPlanError);

    const tree = spy.mock.calls[0]?.[3];
    expect(Array.isArray(tree)).toBe(true);
    expect((tree as string[]).length).toBeGreaterThan(0);
    expect(tree as string[]).toContain('package.json');
  });
});

// ─── 6. Pin the two planner-prompt rules (435-002) that back run-proposal-compiler's ──
//        boundary invariants (born-691 empty-filesWrite, born-692 comma-title). These
//        rules live in buildZeroConfigPlanPrompt's own TASK SPLITTING RULES / GOREV
//        BOLME KURALLARI bullet list (planner.ts) — pinned here so a future edit to
//        that prompt cannot silently drop either rule without a test failure.
//        buildZeroConfigPlanPrompt is a pure string-template function (no subprocess,
//        no provider call) — hermetic like every other test in this file, and it
//        passes through the `vi.mock(...)` spread above (`...actual`) untouched.

describe('buildZeroConfigPlanPrompt — pins the two new TASK SPLITTING RULES (435-002)', () => {
  // Single English prompt since the PCOMP-8 U3 language unification — the
  // former TR variants of these pins died with the TR/EN fork.
  it('states EVERY task.scope.filesWrite must contain at least one file path', () => {
    const prompt = buildZeroConfigPlanPrompt('Ship a feature', 'deckent');
    expect(prompt).toContain(
      "EVERY task's scope.filesWrite MUST contain at least one file path — an empty filesWrite array is invalid",
    );
  });

  it('states a task title MUST NOT contain a comma character', () => {
    const prompt = buildZeroConfigPlanPrompt('Ship a feature', 'deckent');
    expect(prompt).toContain(
      'A task\'s "title" MUST NOT contain a comma (,) character — rephrase with "and"/a dash instead',
    );
  });
});
