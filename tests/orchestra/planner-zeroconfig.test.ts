import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

// F-2: node:child_process stays mocked so the fail-soft `git ls-files`
// normalization step never runs real git; planner calls inject PlannerSpawnFn.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

import {
  buildPlanPrompt,
  buildZeroConfigPlanPrompt,
  callZeroConfigPlanner,
  buildZeroConfigFallbackPlan,
  type PlannerSpawnFn,
  type PlannerSpawnOutcome,
} from '../../src/orchestra/planner.js';
import type { BrainContext, SprintSizeRecommendation, Task, ModelType } from '../../src/core/types.js';
import { BRAIN_PLAN_TIMEOUT_MS } from '../../src/core/constants.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

// ─── Mock ProviderAdapter ─────────────────────────────────────────────────
function makeMockAdapter(): ProviderAdapter {
  return {
    name: 'claude',
    supportedModels: ['opus', 'sonnet', 'haiku'] as readonly ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('claude --model sonnet /dev/null'),
    buildPlannerCommand: (prompt: string, model: ModelType) => ({
      command: 'claude',
      args: ['-p', prompt, '--model', model, '--output-format', 'json'],
    }),
  };
}

const mockAdapter = makeMockAdapter();

// ─── Helpers ────────────────────────────────────────────────────────

function makeContext(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    directives: '# Sprint 027\n## Task 1: Some task\nDo something',
    memory: '',
    retro: '',
    debt: [],
    patterns: '',
    decisions: '',
    existingTasks: [] as Task[],
    projectState: { gitStatus: '', fileTree: ['src/index.ts', 'src/core/types.ts'] },
    ...overrides,
  };
}

function makeRecommendation(overrides: Partial<SprintSizeRecommendation> = {}): SprintSizeRecommendation {
  return {
    size: 'full',
    maxWorkers: 4,
    modelConstraint: null,
    reason: 'OK',
    ...overrides,
  };
}

function makeValidPlannerJSON(taskCount: number): string {
  const tasks = Array.from({ length: taskCount }, (_, i) => ({
    title: `Task ${i + 1}`,
    description: `Description ${i + 1}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: `Standard task ${i + 1}`,
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/feature-${i + 1}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor' },
  }));
  return JSON.stringify({ tasks, reasoning: 'Zero-config split plan' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══ buildPlanPrompt — zero-config context ════════════════════════════

describe('buildPlanPrompt with zeroConfigDescription', () => {
  it('includes zero-config section when description provided', () => {
    const prompt = buildPlanPrompt(
      makeContext(),
      makeRecommendation(),
      'my-app',
      'Add login page with Google OAuth',
    );
    expect(prompt).toContain('ZERO-CONFIG MODE');
    expect(prompt).toContain('Add login page with Google OAuth');
  });

  it('instructs AI to split into 3-5 tasks', () => {
    const prompt = buildPlanPrompt(
      makeContext(),
      makeRecommendation(),
      'my-app',
      'Add login page with Google OAuth',
    );
    expect(prompt).toContain('3-5');
  });

  it('provides splitting example in zero-config context', () => {
    const prompt = buildPlanPrompt(
      makeContext(),
      makeRecommendation(),
      'my-app',
      'Some feature',
    );
    expect(prompt).toContain('Google OAuth');
  });

  it('does NOT include zero-config section when description is absent', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'my-app');
    expect(prompt).not.toContain('ZERO-CONFIG MODE');
  });

  it('backward compatible — existing tests unaffected (no 4th arg)', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'my-app');
    expect(prompt).toContain('RULES:');
    expect(prompt).toContain('Plan ALL tasks');
  });
});

// ═══ buildZeroConfigPlanPrompt ════════════════════════════════════════

describe('buildZeroConfigPlanPrompt', () => {
  it('includes the user description in the prompt', () => {
    const prompt = buildZeroConfigPlanPrompt('Add login page with Google OAuth', 'my-app');
    expect(prompt).toContain('Add login page with Google OAuth');
  });

  it('includes project name', () => {
    const prompt = buildZeroConfigPlanPrompt('Fix the bug', 'awesome-project');
    expect(prompt).toContain('awesome-project');
  });

  it('instructs to produce 3-5 tasks', () => {
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'app');
    expect(prompt).toContain('3');
    expect(prompt).toContain('5');
  });

  it('includes JSON output format instruction', () => {
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'app');
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain('"reasoning"');
  });

  it('includes model selection criteria', () => {
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'app');
    expect(prompt).toContain('opus');
    expect(prompt).toContain('sonnet');
    expect(prompt).toContain('haiku');
  });

  it('includes example task splitting for login/OAuth scenario', () => {
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'app');
    expect(prompt).toContain('Google OAuth');
    expect(prompt).toContain('Auth API endpoints');
  });

  it('instructs last task to be integration/test task', () => {
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'app');
    expect(prompt).toContain('The last task MUST be an integration/test task');
  });

  it('includes file tree when provided', () => {
    const fileTree = ['src/index.ts', 'src/auth/auth.service.ts'];
    const prompt = buildZeroConfigPlanPrompt('Add auth', 'app', fileTree);
    expect(prompt).toContain('src/auth/auth.service.ts');
  });

  it('limits file tree to 50 entries', () => {
    const fileTree = Array.from({ length: 100 }, (_, i) => `src/file-${i}.ts`);
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'app', fileTree);
    expect(prompt).toContain('src/file-0.ts');
    expect(prompt).not.toContain('src/file-99.ts');
    expect(prompt).toContain('first 50');
  });

  it('works without file tree', () => {
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'app');
    expect(prompt).not.toContain('FILE TREE');
  });

  it('includes task splitting parallelism rules', () => {
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'app');
    expect(prompt).toContain('parallel execution');
  });
});

// ═══ callZeroConfigPlanner ════════════════════════════════════════════

describe('callZeroConfigPlanner', () => {
  // F-2: the planner call is async with an injectable PlannerSpawnFn — the
  // spawnSync freeze-class died; these fakes are hermetic and record calls.
  function makeSpawnFn(outcome: Partial<PlannerSpawnOutcome> = {}) {
    const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = [];
    const fn: PlannerSpawnFn = async (command, args, opts) => {
      calls.push({ command, args: [...args], timeoutMs: opts.timeoutMs });
      return { status: 0, signal: null, stdout: makeValidPlannerJSON(3), stderr: '', ...outcome };
    };
    return { fn, calls };
  }

  it('returns parsed result when AI call succeeds with 4 tasks', async () => {
    const { fn } = makeSpawnFn({ stdout: makeValidPlannerJSON(4) });
    const result = await callZeroConfigPlanner('Add login page', 'sonnet', 'my-app', [], mockAdapter, undefined, fn);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(4);
    expect(result!.reasoning).toBe('Zero-config split plan');
  });

  it('returns 3 tasks for a simple feature', async () => {
    const { fn } = makeSpawnFn();
    const result = await callZeroConfigPlanner('Fix the bug', 'sonnet', 'app', [], mockAdapter, undefined, fn);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(3);
  });

  it('returns null when AI call fails (non-zero exit)', async () => {
    const { fn } = makeSpawnFn({ status: 1, stdout: '', stderr: 'error' });
    await expect(callZeroConfigPlanner('Add feature', 'sonnet', 'app', [], mockAdapter, undefined, fn)).resolves.toBeNull();
  });

  it('returns null when stdout is empty', async () => {
    const { fn } = makeSpawnFn({ status: 0, stdout: '' });
    await expect(callZeroConfigPlanner('Add feature', 'sonnet', 'app', [], mockAdapter, undefined, fn)).resolves.toBeNull();
  });

  it('returns null when AI returns invalid JSON (even after the U2 retry)', async () => {
    const { fn, calls } = makeSpawnFn({ status: 0, stdout: 'not valid json' });
    await expect(callZeroConfigPlanner('Add feature', 'sonnet', 'app', [], mockAdapter, undefined, fn)).resolves.toBeNull();
    expect(calls).toHaveLength(2); // initial + one schema-feedback retry
  });

  it('passes model parameter to the planner spawn', async () => {
    const { fn, calls } = makeSpawnFn();
    await callZeroConfigPlanner('Add feature', 'opus', 'app', [], mockAdapter, undefined, fn);
    const args = calls[0]!.args;
    const modelIdx = args.indexOf('--model');
    expect(args[modelIdx + 1]).toBe('opus');
  });

  it('spawns with the correct timeout', async () => {
    const { fn, calls } = makeSpawnFn();
    await callZeroConfigPlanner('Add feature', 'sonnet', 'app', [], mockAdapter, undefined, fn);
    expect(calls[0]!.command).toBe('claude');
    expect(calls[0]!.timeoutMs).toBe(BRAIN_PLAN_TIMEOUT_MS);
  });

  it('passes file tree context to the prompt', async () => {
    const { fn, calls } = makeSpawnFn();
    await callZeroConfigPlanner('Add feature', 'sonnet', 'app', ['src/auth.ts', 'src/api.ts'], mockAdapter, undefined, fn);
    const promptArg = calls[0]!.args[1]!;
    expect(promptArg).toContain('src/auth.ts');
  });

  it('handles valid 5-task response', async () => {
    const { fn } = makeSpawnFn({ stdout: makeValidPlannerJSON(5) });
    const result = await callZeroConfigPlanner('Complex feature', 'opus', 'app', [], mockAdapter, undefined, fn);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(5);
  });
});

// ═══ buildZeroConfigFallbackPlan ═════════════════════════════════════

describe('buildZeroConfigFallbackPlan', () => {
  it('returns a single-task plan', () => {
    const plan = buildZeroConfigFallbackPlan('Add login page');
    expect(plan.tasks).toHaveLength(1);
  });

  it('uses description as task title (truncated to 80 chars)', () => {
    const description = 'Add login page with Google OAuth';
    const plan = buildZeroConfigFallbackPlan(description);
    expect(plan.tasks[0]!.title).toBe(description);
  });

  it('truncates long descriptions in title to 80 chars', () => {
    const description = 'A'.repeat(100);
    const plan = buildZeroConfigFallbackPlan(description);
    expect(plan.tasks[0]!.title).toHaveLength(80);
  });

  it('keeps full description in task description field', () => {
    const description = 'A'.repeat(100);
    const plan = buildZeroConfigFallbackPlan(description);
    expect(plan.tasks[0]!.description).toHaveLength(100);
  });

  it('uses sonnet model as default', () => {
    const plan = buildZeroConfigFallbackPlan('Add feature');
    expect(plan.tasks[0]!.model).toBe('sonnet');
  });

  it('sets scope.directories to src/', () => {
    const plan = buildZeroConfigFallbackPlan('Add feature');
    expect(plan.tasks[0]!.scope.directories).toContain('src/');
  });

  it('includes description in reasoning', () => {
    const plan = buildZeroConfigFallbackPlan('Add login page');
    expect(plan.reasoning).toContain('Add login page');
  });

  it('sets goNogo criteria', () => {
    const plan = buildZeroConfigFallbackPlan('Add feature');
    expect(plan.tasks[0]!.goNogo.goCriteria).toBeTruthy();
    expect(plan.tasks[0]!.goNogo.noGoCriteria).toBeTruthy();
  });

  it('marks as fallback in reason field', () => {
    const plan = buildZeroConfigFallbackPlan('Add feature');
    expect(plan.tasks[0]!.reason).toContain('fallback');
  });

  it('sets normal effort and priority', () => {
    const plan = buildZeroConfigFallbackPlan('Add feature');
    expect(plan.tasks[0]!.effort).toBe('normal');
    expect(plan.tasks[0]!.priority).toBe('NORMAL');
  });

  it('returns empty dependencies', () => {
    const plan = buildZeroConfigFallbackPlan('Add feature');
    expect(plan.tasks[0]!.dependencies).toHaveLength(0);
  });
});
