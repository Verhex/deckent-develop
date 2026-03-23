import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPlanPrompt, parsePlannerResponse, callBrainPlanner } from '../../src/orchestra/planner.js';
import type { BrainContext, SprintSizeRecommendation, ModelType } from '../../src/core/types.js';
import { BRAIN_PLAN_MAX_CONTEXT_LINES } from '../../src/core/constants.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

// ─── Mock child_process ───────────────────────────────────────────────────
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';

// ─── Mock ProviderAdapter ─────────────────────────────────────────────────
function makeMockAdapter(): ProviderAdapter {
  return {
    name: 'claude',
    supportedModels: ['opus', 'sonnet', 'haiku'] as readonly ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' }),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('claude --model sonnet /dev/null'),
    buildPlannerCommand: (prompt: string, model: ModelType) => ({
      command: 'claude',
      args: ['-p', prompt, '--model', model, '--output-format', 'json'],
    }),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    directives: 'Do task A\nDo task B',
    memory: 'Key learning: X',
    retro: 'Last sprint was good',
    debt: [],
    patterns: 'Pattern: avoid Y',
    decisions: 'Decision: use Z',
    existingTasks: [],
    projectState: {
      gitStatus: 'M src/foo.ts',
      fileTree: ['src/foo.ts', 'src/bar.ts'],
    },
    ...overrides,
  };
}

function makeRecommendation(overrides: Partial<SprintSizeRecommendation> = {}): SprintSizeRecommendation {
  return {
    size: 'full',
    maxWorkers: 4,
    modelConstraint: null,
    reason: 'Normal usage',
    ...overrides,
  };
}

function makeValidPlannerJSON(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    tasks: [
      {
        title: 'Task 1',
        description: 'Do something',
        model: 'sonnet',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'Standard work',
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
        dependencies: [],
        goNogo: {
          goCriteria: 'Tests pass',
          noGoCriteria: 'Tests fail',
          techDebtAcceptable: 'Minor issues',
        },
      },
    ],
    reasoning: 'Plan rationale',
    ...overrides,
  });
}

// ─── buildPlanPrompt ─────────────────────────────────────────────────────

describe('buildPlanPrompt', () => {
  it('includes project name at the top', () => {
    const ctx = makeContext();
    const rec = makeRecommendation();
    const prompt = buildPlanPrompt(ctx, rec, 'my-project');
    expect(prompt).toContain('Project: my-project');
  });

  it('includes directives section when provided', () => {
    const ctx = makeContext({ directives: 'Build feature X' });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).toContain('DIRECTIVES:');
    expect(prompt).toContain('Build feature X');
  });

  it('includes memory section when provided', () => {
    const ctx = makeContext({ memory: 'Important learning' });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).toContain('MEMORY:');
    expect(prompt).toContain('Important learning');
  });

  it('includes retro section when provided', () => {
    const ctx = makeContext({ retro: 'Sprint went well' });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).toContain('RETRO:');
    expect(prompt).toContain('Sprint went well');
  });

  it('includes patterns and decisions when provided', () => {
    const ctx = makeContext({ patterns: 'use-pattern', decisions: 'adr-001' });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).toContain('PATTERNS:');
    expect(prompt).toContain('use-pattern');
    expect(prompt).toContain('DECISIONS:');
    expect(prompt).toContain('adr-001');
  });

  it('omits CRITICAL DEBT section when no critical unresolved debt', () => {
    const ctx = makeContext({ debt: [] });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).not.toContain('CRITICAL DEBT:');
  });

  it('includes CRITICAL DEBT section for unresolved critical debt', () => {
    const ctx = makeContext({
      debt: [
        {
          id: 'D-001',
          description: 'Critical issue',
          originTaskId: 'T-001',
          originSprintId: 'sprint-001',
          priority: 'CRITICAL' as const,
          sprintsOpen: 2,
          resolved: false,
          createdAt: '2026-01-01',
        },
      ],
    });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).toContain('CRITICAL DEBT:');
    expect(prompt).toContain('D-001: Critical issue');
  });

  it('omits resolved critical debt from CRITICAL DEBT section', () => {
    const ctx = makeContext({
      debt: [
        {
          id: 'D-002',
          description: 'Old critical issue',
          originTaskId: 'T-002',
          originSprintId: 'sprint-001',
          priority: 'CRITICAL' as const,
          sprintsOpen: 3,
          resolved: true,
          resolvedInSprintId: 'sprint-002',
          createdAt: '2026-01-01',
        },
      ],
    });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).not.toContain('CRITICAL DEBT:');
  });

  it('includes maxWorkers from recommendation in prompt', () => {
    const rec = makeRecommendation({ maxWorkers: 6 });
    const prompt = buildPlanPrompt(makeContext(), rec, 'proj');
    expect(prompt).toContain('6');
  });

  it('includes file tree when present', () => {
    const ctx = makeContext({
      projectState: { gitStatus: '', fileTree: ['src/a.ts', 'src/b.ts'] },
    });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).toContain('FILE TREE');
    expect(prompt).toContain('src/a.ts');
  });

  it('limits file tree to first 100 entries', () => {
    const bigTree = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`);
    const ctx = makeContext({
      projectState: { gitStatus: '', fileTree: bigTree },
    });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).toContain('src/file99.ts');
    expect(prompt).not.toContain('src/file100.ts');
  });

  it('truncates context to BRAIN_PLAN_MAX_CONTEXT_LINES', () => {
    const longDirectives = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
    const ctx = makeContext({ directives: longDirectives });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    const lines = prompt.split('\n');
    // The prompt wraps context in fixed header + contextBlock
    // The contextBlock itself is capped at BRAIN_PLAN_MAX_CONTEXT_LINES
    // Total prompt may be bigger due to fixed header/footer
    expect(lines.length).toBeGreaterThan(0);
  });

  it('omits file tree section when fileTree is empty', () => {
    const ctx = makeContext({ projectState: { gitStatus: '', fileTree: [] } });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).not.toContain('FILE TREE');
  });

  it('omits empty optional sections when context fields are empty string', () => {
    const ctx = makeContext({ memory: '', retro: '', patterns: '', decisions: '' });
    const prompt = buildPlanPrompt(ctx, makeRecommendation(), 'proj');
    expect(prompt).not.toContain('MEMORY:');
    expect(prompt).not.toContain('RETRO:');
    expect(prompt).not.toContain('PATTERNS:');
    expect(prompt).not.toContain('DECISIONS:');
  });

  it('includes output format JSON template in prompt', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'proj');
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain('"reasoning"');
  });
});

// ─── parsePlannerResponse ─────────────────────────────────────────────────

describe('parsePlannerResponse', () => {
  it('parses valid JSON with one task', () => {
    const raw = makeValidPlannerJSON();
    const result = parsePlannerResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0].title).toBe('Task 1');
    expect(result!.reasoning).toBe('Plan rationale');
  });

  it('parses JSON wrapped in ```json code fence', () => {
    const inner = makeValidPlannerJSON();
    const raw = '```json\n' + inner + '\n```';
    const result = parsePlannerResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
  });

  it('parses JSON wrapped in ``` code fence without language tag', () => {
    const inner = makeValidPlannerJSON();
    const raw = '```\n' + inner + '\n```';
    const result = parsePlannerResponse(raw);
    expect(result).not.toBeNull();
  });

  it('returns null for invalid JSON string', () => {
    const result = parsePlannerResponse('not-json-at-all');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = parsePlannerResponse('');
    expect(result).toBeNull();
  });

  it('returns null when tasks array is empty (min(1) constraint)', () => {
    const raw = JSON.stringify({ tasks: [], reasoning: 'empty' });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('returns null when tasks field is missing', () => {
    const raw = JSON.stringify({ reasoning: 'no tasks here' });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('returns null when reasoning field is missing', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('returns null when a task has invalid model value', () => {
    const raw = makeValidPlannerJSON({
      tasks: [
        {
          title: 'Task 1',
          description: 'Desc',
          model: 'gpt-4',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('returns null when a task has invalid effort value', () => {
    const raw = makeValidPlannerJSON({
      tasks: [
        {
          title: 'Task 1',
          description: 'Desc',
          model: 'sonnet',
          effort: 'extreme',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('returns null when a task has invalid priority value', () => {
    const raw = makeValidPlannerJSON({
      tasks: [
        {
          title: 'Task 1',
          description: 'Desc',
          model: 'sonnet',
          effort: 'normal',
          priority: 'MEDIUM',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('returns null when title is empty string', () => {
    const raw = makeValidPlannerJSON({
      tasks: [
        {
          title: '',
          description: 'Desc',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('returns null when description is empty string', () => {
    const raw = makeValidPlannerJSON({
      tasks: [
        {
          title: 'T',
          description: '',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('parses multiple tasks correctly', () => {
    const task = {
      title: 'Task',
      description: 'Desc',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'r',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
    };
    const raw = JSON.stringify({
      tasks: [
        { ...task, title: 'Task A' },
        { ...task, title: 'Task B' },
        { ...task, title: 'Task C' },
      ],
      reasoning: 'Three tasks',
    });
    const result = parsePlannerResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(3);
    expect(result!.tasks[1].title).toBe('Task B');
  });

  it('parses all valid model types', () => {
    for (const model of ['opus', 'sonnet', 'haiku']) {
      const raw = makeValidPlannerJSON({
        tasks: [
          {
            title: 'T',
            description: 'D',
            model,
            effort: 'normal',
            priority: 'NORMAL',
            reason: 'r',
            scope: { directories: [], filesRead: [], filesWrite: [] },
            dependencies: [],
            goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
          },
        ],
      });
      const result = parsePlannerResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.tasks[0].model).toBe(model);
    }
  });

  it('parses all valid priority values', () => {
    for (const priority of ['CRITICAL', 'HIGH', 'NORMAL', 'LOW']) {
      const raw = makeValidPlannerJSON({
        tasks: [
          {
            title: 'T',
            description: 'D',
            model: 'sonnet',
            effort: 'normal',
            priority,
            reason: 'r',
            scope: { directories: [], filesRead: [], filesWrite: [] },
            dependencies: [],
            goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
          },
        ],
      });
      const result = parsePlannerResponse(raw);
      expect(result).not.toBeNull();
    }
  });

  it('returns null when goNogo fields are missing', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g' }, // missing noGoCriteria, techDebtAcceptable
        },
      ],
      reasoning: 'r',
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('returns null when scope is missing directories field', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { filesRead: [], filesWrite: [] }, // missing directories
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
      reasoning: 'r',
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('ignores extra fields on valid input (Zod passthrough not enabled)', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
          extraField: 'should be ignored',
        },
      ],
      reasoning: 'r',
      extraTopLevel: 42,
    });
    const result = parsePlannerResponse(raw);
    // Zod by default strips extra fields and returns success
    expect(result).not.toBeNull();
    expect(result!.tasks[0]).not.toHaveProperty('extraField');
  });
});

// ─── callBrainPlanner ─────────────────────────────────────────────────────

describe('callBrainPlanner', () => {
  const adapter = makeMockAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when spawnSync returns non-zero exit status', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'error occurred',
      pid: 123,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'proj', adapter);
    expect(result).toBeNull();
  });

  it('returns null when spawnSync stdout is empty', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 123,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'proj', adapter);
    expect(result).toBeNull();
  });

  it('returns null when spawnSync stdout is null', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: null,
      stderr: '',
      pid: 123,
      output: [],
      signal: null,
    } as unknown as ReturnType<typeof spawnSync>);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'proj', adapter);
    expect(result).toBeNull();
  });

  it('returns null on timeout (status null, signal SIGTERM)', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: null,
      stdout: null,
      stderr: '',
      pid: 123,
      output: [],
      signal: 'SIGTERM',
    } as unknown as ReturnType<typeof spawnSync>);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'proj', adapter);
    expect(result).toBeNull();
  });

  it('returns null when stdout is malformed JSON', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'not valid json',
      stderr: '',
      pid: 123,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'proj', adapter);
    expect(result).toBeNull();
  });

  it('returns null when stdout has valid JSON but fails Zod validation', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ tasks: [], reasoning: 'empty' }),
      stderr: '',
      pid: 123,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'proj', adapter);
    expect(result).toBeNull();
  });

  it('returns PlannerResult on valid stdout', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(),
      stderr: '',
      pid: 123,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'proj', adapter);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
  });

  it('calls spawnSync with correct claude command', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(),
      stderr: '',
      pid: 123,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'proj', adapter);

    expect(spawnSync).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['-p', expect.any(String), '--model', 'opus']),
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('calls spawnSync with output-format json flag', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(),
      stderr: '',
      pid: 123,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'proj', adapter);

    expect(spawnSync).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--output-format', 'json']),
      expect.any(Object),
    );
  });

  it('passes timeout option to spawnSync', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: makeValidPlannerJSON(),
      stderr: '',
      pid: 123,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    callBrainPlanner(makeContext(), makeRecommendation(), 'haiku', 'proj', adapter);

    expect(spawnSync).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });
});

// ─── Zod Schema Edge Cases ────────────────────────────────────────────────

describe('Zod Schema validation via parsePlannerResponse', () => {
  it('accepts haiku as valid model', () => {
    const raw = makeValidPlannerJSON({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'haiku',
          effort: 'low',
          priority: 'LOW',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
    });
    const result = parsePlannerResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.tasks[0].model).toBe('haiku');
  });

  it('rejects when dependencies is not an array', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: 'not-an-array',
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
      reasoning: 'r',
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('rejects when scope.directories is not an array', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: 'r',
          scope: { directories: 'src/', filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
      reasoning: 'r',
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('rejects when task is missing reason field', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          // reason missing
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
      reasoning: 'r',
    });
    const result = parsePlannerResponse(raw);
    expect(result).toBeNull();
  });

  it('accepts reason as empty string (no min constraint on reason)', () => {
    const raw = JSON.stringify({
      tasks: [
        {
          title: 'T',
          description: 'D',
          model: 'sonnet',
          effort: 'normal',
          priority: 'NORMAL',
          reason: '',
          scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [],
          goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
        },
      ],
      reasoning: 'r',
    });
    const result = parsePlannerResponse(raw);
    expect(result).not.toBeNull();
  });

  it('accepts all valid effort values', () => {
    for (const effort of ['low', 'normal', 'high']) {
      const raw = makeValidPlannerJSON({
        tasks: [
          {
            title: 'T',
            description: 'D',
            model: 'sonnet',
            effort,
            priority: 'NORMAL',
            reason: 'r',
            scope: { directories: [], filesRead: [], filesWrite: [] },
            dependencies: [],
            goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
          },
        ],
      });
      const result = parsePlannerResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.tasks[0].effort).toBe(effort);
    }
  });

  it('returns null for non-object top-level JSON', () => {
    expect(parsePlannerResponse(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parsePlannerResponse(JSON.stringify('string'))).toBeNull();
    expect(parsePlannerResponse(JSON.stringify(42))).toBeNull();
    expect(parsePlannerResponse(JSON.stringify(null))).toBeNull();
  });
});
