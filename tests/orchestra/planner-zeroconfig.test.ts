import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import {
  buildPlanPrompt,
  buildZeroConfigPlanPrompt,
  callZeroConfigPlanner,
  buildZeroConfigFallbackPlan,
} from '../../src/orchestra/planner.js';
import type { BrainContext, SprintSizeRecommendation, Task, ModelType } from '../../src/core/types.js';
import { BRAIN_PLAN_TIMEOUT_MS } from '../../src/core/constants.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

const mockedSpawnSync = vi.mocked(spawnSync);

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
    expect(prompt).toContain('KURALLAR');
    expect(prompt).toContain('TÜM görevleri');
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
    expect(prompt).toContain('entegrasyon');
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
    expect(prompt).toContain('paralel');
  });
});

// ═══ callZeroConfigPlanner ════════════════════════════════════════════

describe('callZeroConfigPlanner', () => {
  it('returns parsed result when AI call succeeds with 4 tasks', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(4),
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    const result = callZeroConfigPlanner('Add login page', 'sonnet', 'my-app', [], mockAdapter);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(4);
    expect(result!.reasoning).toBe('Zero-config split plan');
  });

  it('returns 3 tasks for a simple feature', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(3),
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    const result = callZeroConfigPlanner('Fix the bug', 'sonnet', 'app', [], mockAdapter);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(3);
  });

  it('returns null when AI call fails (non-zero exit)', () => {
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'error',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    const result = callZeroConfigPlanner('Add feature', 'sonnet', 'app', [], mockAdapter);
    expect(result).toBeNull();
  });

  it('returns null when stdout is empty', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    const result = callZeroConfigPlanner('Add feature', 'sonnet', 'app', [], mockAdapter);
    expect(result).toBeNull();
  });

  it('returns null when AI returns invalid JSON', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'not valid json',
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    const result = callZeroConfigPlanner('Add feature', 'sonnet', 'app', [], mockAdapter);
    expect(result).toBeNull();
  });

  it('passes model parameter to spawnSync', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(3),
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    callZeroConfigPlanner('Add feature', 'opus', 'app', [], mockAdapter);

    const args = mockedSpawnSync.mock.calls[0]![1] as string[];
    const modelIdx = args.indexOf('--model');
    expect(args[modelIdx + 1]).toBe('opus');
  });

  it('calls spawnSync with correct timeout', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(3),
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    callZeroConfigPlanner('Add feature', 'sonnet', 'app', [], mockAdapter);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({ timeout: BRAIN_PLAN_TIMEOUT_MS }),
    );
  });

  it('passes file tree context to the prompt', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(3),
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    callZeroConfigPlanner('Add feature', 'sonnet', 'app', ['src/auth.ts', 'src/api.ts'], mockAdapter);

    const promptArg = (mockedSpawnSync.mock.calls[0]![1] as string[])[1]!;
    expect(promptArg).toContain('src/auth.ts');
  });

  it('handles valid 5-task response', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(5),
      stderr: '',
      pid: 1,
      signal: null,
      output: [],
    } as never);

    const result = callZeroConfigPlanner('Complex feature', 'opus', 'app', [], mockAdapter);
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
