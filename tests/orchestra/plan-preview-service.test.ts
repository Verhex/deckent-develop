import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type {
  Sprint, Task, ResolvedConfig, BrainContext, SprintSizeRecommendation, PromptGateResult,
} from '../../src/core/types.js';

// TERM-FLOW-UNIFY Sprint-2 dilim (424-001,
// docs/analysis/term-flow-unify-design-2026-07-11.md). generatePlanPreview
// is the single shared "actual preview" path CLI `plan --dry-run` and MCP
// `deckent_plan` both delegate to (src/cli/commands/plan.ts,
// src/mcp/tools/plan.ts) — mocking `orchestra/brain.js` here mirrors
// tests/cli/commands/plan.test.ts / tests/mcp/tools/plan.test.ts exactly,
// since plan-preview-service.ts imports `planSprint` from that SAME module
// (not sprint-planner.js directly) so those existing suites' mocks stay
// transparent to calls routed through the new service.

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
}));

import { planSprint } from '../../src/orchestra/brain.js';
import { generatePlanPreview } from '../../src/orchestra/plan-preview-service.js';
import { compileRunProposal } from '../../src/orchestra/run-proposal-compiler.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import { extractGoNogo } from '../../src/orchestra/directives-builder.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';

const mockPlanSprint = vi.mocked(planSprint);

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true, brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
  } as ResolvedConfig;
}

function makeContext(directives = ''): BrainContext {
  return {
    directives, memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  };
}

function makeRecommendation(): SprintSizeRecommendation {
  return { size: 'full', maxWorkers: 4, modelConstraint: null, reason: 'No usage constraints' };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Do the thing', description: 'Do the thing well.', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-001', createdAt: new Date(0).toISOString(),
    ...overrides,
  } as Task;
}

function makeGate(ok: boolean): PromptGateResult {
  return { ok, findings: [], blockers: [] };
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-001', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-001-001'],
    ...overrides,
  };
}

function proposal(overrides?: Partial<RunProposal>): RunProposal {
  return {
    flowId: 'flow-1', tenant: 'tenant-1', project: 'project-1',
    actor: { id: 'actor-1', role: 'operator' }, origin: 'chat',
    revision: 1, intentSummary: 'Fix the flaky retry test', ...overrides,
  };
}

describe('generatePlanPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Read-only pin ──────────────────────────────────────────────────────

  it('forces dryRun:true on the underlying planSprint call — PlanPreviewOptions has no dryRun/asDraft knob to override it', async () => {
    mockPlanSprint.mockReturnValue(makeSprint() as any);
    await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation(), { mode: 'structured' });

    expect(mockPlanSprint).toHaveBeenCalledTimes(1);
    expect(mockPlanSprint).toHaveBeenCalledWith(
      '/mock/root', expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ dryRun: true, mode: 'structured' }),
    );
  });

  it('forwards acknowledgePromptGate through to planSprint', async () => {
    mockPlanSprint.mockReturnValue(makeSprint() as any);
    await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation(), {
      acknowledgePromptGate: true,
    });

    expect(mockPlanSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ acknowledgePromptGate: true, dryRun: true }),
    );
  });

  // ─── Determinism ─────────────────────────────────────────────────────────

  it('same task set + same gate outcome ⇒ identical planDigest, even across different sprint IDs', async () => {
    mockPlanSprint.mockReturnValue(makeSprint({ id: 'sprint-001', number: 1 }) as any);
    const first = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    // Different sprint counter state (e.g. a later plan call) must NOT change the
    // digest — planDigest is a function of task content + gate/policy, not of the
    // filesystem-derived sprint/task IDs.
    mockPlanSprint.mockReturnValue(makeSprint({ id: 'sprint-042', number: 42 }) as any);
    const second = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    expect(second.planDigest).toBe(first.planDigest);
    expect(first.planDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('a different task set ⇒ a different planDigest', async () => {
    mockPlanSprint.mockReturnValue(makeSprint({
      tasks: [makeTask({ title: 'Task A', description: 'First task' })],
    }) as any);
    const a = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    mockPlanSprint.mockReturnValue(makeSprint({
      tasks: [makeTask({ title: 'Task B', description: 'Second, unrelated task' })],
    }) as any);
    const b = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    expect(a.planDigest).not.toBe(b.planDigest);
  });

  // ─── CLI/MCP parity (by construction — same shared function) ───────────

  it('two callers (simulating CLI --dry-run and MCP deckent_plan) hitting generatePlanPreview with the same inputs get an identical preview', async () => {
    mockPlanSprint.mockReturnValue(makeSprint() as any);
    const config = makeConfig();
    const context = makeContext();
    const recommendation = makeRecommendation();

    const cliPreview = await generatePlanPreview('/mock/root', config, context, recommendation, { mode: 'structured' });
    const mcpPreview = await generatePlanPreview('/mock/root', config, context, recommendation, { mode: 'structured' });

    expect(mcpPreview.planDigest).toBe(cliPreview.planDigest);
    expect(mcpPreview.taskSummaries).toEqual(cliPreview.taskSummaries);
    expect(mcpPreview.gateResult).toBe(cliPreview.gateResult);
    expect(mcpPreview.policyDecision).toBe(cliPreview.policyDecision);
  });

  // ─── taskSummaries / gate / policy mapping ──────────────────────────────

  it('maps sprint.tasks to {title, summary} taskSummaries', async () => {
    mockPlanSprint.mockReturnValue(makeSprint({
      tasks: [makeTask({ title: 'Fix the bug', description: 'Root-cause and fix.' })],
    }) as any);
    const preview = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    expect(preview.taskSummaries).toEqual([{ title: 'Fix the bug', summary: 'Root-cause and fix.' }]);
  });

  it('no promptGate on the sprint ⇒ gateResult "skipped", policyDecision "allow"', async () => {
    mockPlanSprint.mockReturnValue(makeSprint({ promptGate: undefined }) as any);
    const preview = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    expect(preview.gateResult).toBe('skipped');
    expect(preview.policyDecision).toBe('allow');
  });

  it('promptGate.ok === true ⇒ gateResult "pass", policyDecision "allow"', async () => {
    mockPlanSprint.mockReturnValue(makeSprint({ promptGate: makeGate(true) }) as any);
    const preview = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    expect(preview.gateResult).toBe('pass');
    expect(preview.policyDecision).toBe('allow');
  });

  it('promptGate.ok === false ⇒ gateResult "fail", policyDecision "needs-approval"', async () => {
    mockPlanSprint.mockReturnValue(makeSprint({ promptGate: makeGate(false) }) as any);
    const preview = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    expect(preview.gateResult).toBe('fail');
    expect(preview.policyDecision).toBe('needs-approval');
  });

  it('returns the underlying sprint unmodified so CLI/MCP display logic keeps working', async () => {
    const sprint = makeSprint({ reasoning: 'AI chose tasks', planningMode: 'ai' });
    mockPlanSprint.mockReturnValue(sprint as any);
    const preview = await generatePlanPreview('/mock/root', makeConfig(), makeContext(), makeRecommendation());

    expect(preview.sprint).toBe(sprint);
  });
});

// ─── run-proposal-compiler round-trip (real, unmocked — pure functions) ───
//
// No dedicated tests/orchestra/run-proposal-compiler.test.ts file: only
// tests/orchestra/plan-preview-service.test.ts is in this task's write
// scope. Compiler correctness is validated here instead, via the REAL
// (unmocked) parseStructuredDirectives/extractGoNogo round-trip — both pure,
// no fs/network — proving compileRunProposal emits well-formed, parseable
// DIRECTIVES.md content that a future native-flow caller can feed straight
// into generatePlanPreview's `context.directives`.

describe('compileRunProposal (builder-adapter round-trip)', () => {
  it('produces DIRECTIVES markdown that parseStructuredDirectives reads back losslessly', () => {
    const { directivesMarkdown } = compileRunProposal(proposal());

    const parsed = parseStructuredDirectives(directivesMarkdown);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toBe('Fix the flaky retry test');

    const { goCriteria, nogo } = extractGoNogo(parsed[0]!.description);
    expect(goCriteria.length).toBeGreaterThan(0);
    expect(nogo.length).toBeGreaterThan(0);
    expect(parsed[0]!.scope.filesWrite.length).toBeGreaterThan(0);
    expect(parsed[0]!.scope.directories.length).toBeGreaterThan(0);
  });

  it('folds flowId/tenant/project/actor/origin into the description as traceability prose (never a directive label line)', () => {
    const { directivesMarkdown } = compileRunProposal(proposal({ flowId: 'flow-42', tenant: 'acme', project: 'widgets' }));

    expect(directivesMarkdown).toContain('flow-42');
    expect(directivesMarkdown).toContain('acme');
    expect(directivesMarkdown).toContain('widgets');

    // Must still round-trip — a stray "Label:" line would corrupt parseStructuredDirectives.
    const parsed = parseStructuredDirectives(directivesMarkdown);
    expect(parsed).toHaveLength(1);
  });

  it('is deterministic — same RunProposal ⇒ byte-identical markdown', () => {
    const p = proposal();
    expect(compileRunProposal(p).directivesMarkdown).toBe(compileRunProposal(p).directivesMarkdown);
  });
});
