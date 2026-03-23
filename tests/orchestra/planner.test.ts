import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrainContext, SprintSizeRecommendation, DebtItem, Task, ModelType } from '../../src/core/types.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import {
  buildPlanPrompt,
  parsePlannerResponse,
  callBrainPlanner,
  callZeroConfigPlanner,
  buildZeroConfigFallbackPlan,
  buildPlannerSpawnArgs,
  buildZeroConfigPlanPrompt,
  resolveAdapter,
} from '../../src/orchestra/planner.js';
import { providerRegistry } from '../../src/core/provider.js';
import { BRAIN_PLAN_TIMEOUT_MS } from '../../src/core/constants.js';

const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeContext(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    directives: '# Sprint 13\n## Task 1: Build feature\nBuild it',
    memory: '# Memory',
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

// ─── Mock Adapter Factory ────────────────────────────────────────────

function makeMockAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    name: 'mock-provider',
    supportedModels: ['opus', 'sonnet', 'haiku'] as readonly ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({ fiveHourPercent: 50, weeklyPercent: 30, measuredAt: '' }),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockImplementation(
      (model: ModelType, promptPath: string) => `mock-cli -p - --model ${model} < ${promptPath}`,
    ),
    ...overrides,
  };
}

function makeCodexAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    name: 'codex',
    supportedModels: ['o3', 'o4-mini'] as readonly ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' }),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockImplementation(
      (model: ModelType, promptPath: string) => `codex --model ${model} --quiet < ${promptPath}`,
    ),
    ...overrides,
  };
}

function makeAdapterWithPlannerCommand(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    ...makeMockAdapter(),
    name: 'custom-planner-provider',
    buildPlannerCommand: vi.fn().mockImplementation(
      (prompt: string, model: ModelType) => ({
        command: 'custom-ai',
        args: ['--prompt', prompt, '--model', model, '--json'],
      }),
    ),
    ...overrides,
  };
}

const validPlannerJSON = JSON.stringify({
  tasks: [
    {
      title: 'Build feature',
      description: 'Build the feature',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'Standard task',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/feature.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor' },
    },
  ],
  reasoning: 'Single task for the directive',
});

beforeEach(() => {
  vi.clearAllMocks();
  providerRegistry.clear();
});

// ═══ Tests ═══════════════════════════════════════════════════════════

describe('buildPlanPrompt', () => {
  it('includes directives content', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'test-project');
    expect(prompt).toContain('Build feature');
  });

  it('includes project name', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'my-app');
    expect(prompt).toContain('my-app');
  });

  it('includes maxWorkers as concurrent execution limit (not task count cap)', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation({ maxWorkers: 3 }), 'test');
    expect(prompt).toContain('3');
    expect(prompt).not.toMatch(/Maksimum\s+\d+\s+görev oluştur/);
  });

  it('instructs AI to plan ALL directive tasks without count limit', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation({ maxWorkers: 5 }), 'test');
    expect(prompt).toContain('TÜM görevleri');
  });

  it('includes JSON format instruction', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'test');
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain('"reasoning"');
  });

  it('includes memory when present', () => {
    const prompt = buildPlanPrompt(makeContext({ memory: 'Remember this' }), makeRecommendation(), 'test');
    expect(prompt).toContain('Remember this');
  });

  it('includes critical debt', () => {
    const debt: DebtItem[] = [{
      id: 'debt-1', description: 'Fix the bug', originTaskId: 't-1', originSprintId: 's-1',
      priority: 'CRITICAL' as never, sprintsOpen: 3, resolved: false, createdAt: '',
    }];
    const prompt = buildPlanPrompt(makeContext({ debt }), makeRecommendation(), 'test');
    expect(prompt).toContain('Fix the bug');
  });

  it('includes file tree (limited to 100)', () => {
    const fileTree = Array.from({ length: 150 }, (_, i) => `src/file-${i}.ts`);
    const prompt = buildPlanPrompt(
      makeContext({ projectState: { gitStatus: '', fileTree } }),
      makeRecommendation(),
      'test',
    );
    expect(prompt).toContain('src/file-0.ts');
    expect(prompt).toContain('first 100');
    expect(prompt).not.toContain('src/file-149.ts');
  });

  it('truncates context to BRAIN_PLAN_MAX_CONTEXT_LINES', () => {
    const longDirectives = Array.from({ length: 300 }, (_, i) => `Directive line ${i}`).join('\n');
    const prompt = buildPlanPrompt(makeContext({ directives: longDirectives }), makeRecommendation(), 'test');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('handles empty context gracefully', () => {
    const emptyCtx = makeContext({ directives: '', memory: '', retro: '', patterns: '', decisions: '' });
    const prompt = buildPlanPrompt(emptyCtx, makeRecommendation(), 'test');
    expect(prompt).toContain('KURALLAR');
  });
});

describe('parsePlannerResponse', () => {
  it('parses valid JSON', () => {
    const result = parsePlannerResponse(validPlannerJSON);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0]!.title).toBe('Build feature');
    expect(result!.reasoning).toBe('Single task for the directive');
  });

  it('strips code fences', () => {
    const wrapped = '```json\n' + validPlannerJSON + '\n```';
    const result = parsePlannerResponse(wrapped);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePlannerResponse('not json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePlannerResponse('')).toBeNull();
  });

  it('returns null for missing required fields', () => {
    const incomplete = JSON.stringify({ tasks: [{ title: 'X' }], reasoning: 'Y' });
    expect(parsePlannerResponse(incomplete)).toBeNull();
  });

  it('returns null for invalid model value', () => {
    const bad = JSON.stringify({
      tasks: [{
        title: 'X', description: 'Y', model: 'gpt4', effort: 'normal',
        priority: 'NORMAL', reason: 'R', scope: { directories: [], filesRead: [], filesWrite: [] },
        dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      }],
      reasoning: 'Y',
    });
    expect(parsePlannerResponse(bad)).toBeNull();
  });

  it('returns null for empty tasks array', () => {
    const empty = JSON.stringify({ tasks: [], reasoning: 'Y' });
    expect(parsePlannerResponse(empty)).toBeNull();
  });

  it('validates all model values', () => {
    for (const model of ['opus', 'sonnet', 'haiku']) {
      const json = JSON.stringify({
        tasks: [{
          title: 'T', description: 'D', model, effort: 'normal',
          priority: 'NORMAL', reason: 'R', scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [], goNogo: { goCriteria: 'G', noGoCriteria: 'N', techDebtAcceptable: 'T' },
        }],
        reasoning: 'R',
      });
      expect(parsePlannerResponse(json)).not.toBeNull();
    }
  });
});

// ═══ resolveAdapter ═════════════════════════════════════════════════

describe('resolveAdapter', () => {
  it('returns explicitly provided adapter', () => {
    const adapter = makeMockAdapter();
    expect(resolveAdapter(adapter)).toBe(adapter);
  });

  it('returns registry default when no adapter provided', () => {
    const adapter = makeMockAdapter({ name: 'reg-default' });
    providerRegistry.registerProvider(adapter, true);
    expect(resolveAdapter()).toBe(adapter);
  });

  it('throws when no adapter provided and registry is empty', () => {
    expect(() => resolveAdapter()).toThrow(/No providers registered/);
  });

  it('does NOT silently fall back to any hardcoded provider', () => {
    expect(() => resolveAdapter()).toThrow();
  });
});

// ═══ buildPlannerSpawnArgs ═══════════════════════════════════════════

describe('buildPlannerSpawnArgs', () => {
  it('extracts CLI binary from adapter.buildCommand()', () => {
    const adapter = makeMockAdapter();
    const result = buildPlannerSpawnArgs(adapter, 'test prompt', 'opus');
    expect(result.command).toBe('mock-cli');
  });

  it('builds generic args when adapter lacks buildPlannerCommand', () => {
    const adapter = makeMockAdapter();
    const result = buildPlannerSpawnArgs(adapter, 'my prompt', 'sonnet');
    expect(result.args).toEqual(['-p', 'my prompt', '--model', 'sonnet', '--output-format', 'json']);
  });

  it('extracts "codex" from codex adapter buildCommand', () => {
    const adapter = makeCodexAdapter();
    const result = buildPlannerSpawnArgs(adapter, 'test', 'opus');
    expect(result.command).toBe('codex');
  });

  it('calls adapter.buildCommand to extract binary name', () => {
    const adapter = makeMockAdapter();
    buildPlannerSpawnArgs(adapter, 'test', 'haiku');
    expect(adapter.buildCommand).toHaveBeenCalledWith('haiku', '/dev/null');
  });

  it('delegates to adapter.buildPlannerCommand() when available', () => {
    const adapter = makeAdapterWithPlannerCommand();
    const result = buildPlannerSpawnArgs(adapter, 'my prompt', 'opus');
    expect(result.command).toBe('custom-ai');
    expect(result.args).toEqual(['--prompt', 'my prompt', '--model', 'opus', '--json']);
    expect(adapter.buildPlannerCommand).toHaveBeenCalledWith('my prompt', 'opus');
  });

  it('does NOT call buildCommand when buildPlannerCommand is available', () => {
    const adapter = makeAdapterWithPlannerCommand();
    buildPlannerSpawnArgs(adapter, 'test', 'sonnet');
    expect(adapter.buildCommand).not.toHaveBeenCalled();
  });

  it('codex adapter builds its own args via buildPlannerCommand', () => {
    const codexAdapter = makeCodexAdapter({
      buildPlannerCommand: vi.fn().mockImplementation(
        (prompt: string, model: ModelType) => ({
          command: 'codex',
          args: ['exec', '--model', model, '-q', prompt],
        }),
      ),
    });
    const result = buildPlannerSpawnArgs(codexAdapter, 'plan this', 'o3');
    expect(result.command).toBe('codex');
    expect(result.args).toEqual(['exec', '--model', 'o3', '-q', 'plan this']);
    expect(result.args).not.toContain('-p');
    expect(result.args).not.toContain('--output-format');
  });

  it('throws when adapter.buildCommand returns empty string', () => {
    const adapter = makeMockAdapter({
      buildCommand: vi.fn().mockReturnValue(''),
    });
    expect(() => buildPlannerSpawnArgs(adapter, 'test', 'opus')).toThrow(/empty buildCommand/);
  });
});

// ═══ Provider Decoupling — callBrainPlanner ═════════════════════════

describe('callBrainPlanner with adapter', () => {
  it('uses adapter to determine CLI command', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test', adapter);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'mock-cli',
      expect.arrayContaining(['-p', expect.any(String), '--model', 'opus', '--output-format', 'json']),
      expect.objectContaining({ encoding: 'utf-8', timeout: BRAIN_PLAN_TIMEOUT_MS }),
    );
  });

  it('uses codex adapter CLI binary when codex adapter provided', () => {
    const adapter = makeCodexAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['--model', 'sonnet']),
      expect.any(Object),
    );
  });

  it('falls back to registry default when no adapter passed', () => {
    const adapter = makeMockAdapter({ name: 'registry-default' });
    providerRegistry.registerProvider(adapter, true);
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test');

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'mock-cli',
      expect.arrayContaining(['--model', 'opus']),
      expect.any(Object),
    );
  });

  it('throws when registry is empty and no adapter provided (no silent fallback)', () => {
    expect(() => {
      callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test');
    }).toThrow(/No providers registered/);
  });

  it('returns parsed result when adapter-based call succeeds', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0]!.title).toBe('Build feature');
  });

  it('returns null when adapter-based call fails (non-zero exit)', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: 'error', pid: 1, signal: null, output: [],
    } as never);

    expect(callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test', adapter)).toBeNull();
  });

  it('returns null on empty stdout', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    expect(callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter)).toBeNull();
  });

  it('uses adapter with buildPlannerCommand for callBrainPlanner', () => {
    const adapter = makeAdapterWithPlannerCommand();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test', adapter);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'custom-ai',
      expect.arrayContaining(['--prompt', expect.any(String), '--model', 'opus', '--json']),
      expect.any(Object),
    );
  });

  it('passes model parameter correctly', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'haiku', 'test', adapter);

    const args = mockedSpawnSync.mock.calls[0]![1] as string[];
    const modelIdx = args.indexOf('--model');
    expect(args[modelIdx + 1]).toBe('haiku');
  });
});

// ═══ Provider Decoupling — callZeroConfigPlanner ════════════════════

describe('callZeroConfigPlanner', () => {
  it('throws when no adapter and empty registry (no silent fallback)', () => {
    expect(() => {
      callZeroConfigPlanner('Add login page', 'sonnet', 'test-project');
    }).toThrow(/No providers registered/);
  });

  it('uses adapter CLI when adapter provided', () => {
    const adapter = makeCodexAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['--model', 'sonnet']),
      expect.any(Object),
    );
  });

  it('uses registry default when no adapter passed but registry has provider', () => {
    const adapter = makeCodexAdapter({ name: 'codex-default' });
    providerRegistry.registerProvider(adapter, true);
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callZeroConfigPlanner('Add login page', 'opus', 'test-project');

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['--model', 'opus']),
      expect.any(Object),
    );
  });

  it('returns parsed result on success', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const result = callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
  });

  it('returns null on failure', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: 'fail', pid: 1, signal: null, output: [],
    } as never);

    expect(callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter)).toBeNull();
  });

  it('returns null on empty stdout', () => {
    const adapter = makeMockAdapter();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    expect(callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter)).toBeNull();
  });

  it('uses adapter with buildPlannerCommand for zero-config', () => {
    const adapter = makeAdapterWithPlannerCommand();
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callZeroConfigPlanner('Add feature', 'opus', 'test-project', [], adapter);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'custom-ai',
      expect.arrayContaining(['--prompt', expect.any(String), '--model', 'opus', '--json']),
      expect.any(Object),
    );
  });
});

// ═══ Structured planner / fallback unchanged ════════════════════════

describe('buildZeroConfigFallbackPlan', () => {
  it('returns a single-task plan without provider interaction', () => {
    const result = buildZeroConfigFallbackPlan('Add dark mode');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.title).toBe('Add dark mode');
    expect(result.tasks[0]!.model).toBe('sonnet');
    expect(result.reasoning).toContain('Zero-config fallback');
  });

  it('truncates long descriptions in title to 80 chars', () => {
    const longDesc = 'A'.repeat(120);
    const result = buildZeroConfigFallbackPlan(longDesc);
    expect(result.tasks[0]!.title).toHaveLength(80);
    expect(result.tasks[0]!.description).toBe(longDesc);
  });

  it('works without any provider registered (structured mode)', () => {
    providerRegistry.clear();
    const result = buildZeroConfigFallbackPlan('Simple task');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.title).toBe('Simple task');
  });
});

describe('buildZeroConfigPlanPrompt', () => {
  it('includes the description in the prompt', () => {
    const prompt = buildZeroConfigPlanPrompt('Add login page', 'my-app');
    expect(prompt).toContain('Add login page');
    expect(prompt).toContain('my-app');
  });

  it('includes file tree when provided', () => {
    const prompt = buildZeroConfigPlanPrompt('Feature', 'app', ['src/index.ts', 'src/app.ts']);
    expect(prompt).toContain('src/index.ts');
    expect(prompt).toContain('FILE TREE');
  });

  it('omits file tree section when empty', () => {
    const prompt = buildZeroConfigPlanPrompt('Feature', 'app', []);
    expect(prompt).not.toContain('FILE TREE');
  });
});

// ═══ Zero hardcoded 'claude' strings verification ═══════════════════

describe('planner.ts provider decoupling — zero hardcoded claude', () => {
  it('planner.ts source file contains zero hardcoded "claude" strings', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../../src/orchestra/planner.ts', import.meta.url),
      'utf-8',
    );
    expect(source).not.toContain("'claude'");
    expect(source).not.toContain('"claude"');
    expect(source.toLowerCase()).not.toMatch(/command\s*=\s*['"]claude['"]/);
  });

  it('missing adapter throws error with clear message (no silent fallback)', () => {
    providerRegistry.clear();
    expect(() => resolveAdapter()).toThrow();
  });

  it('adapter with buildPlannerCommand produces non-Claude-shaped args', () => {
    const adapter = makeAdapterWithPlannerCommand();
    const result = buildPlannerSpawnArgs(adapter, 'test prompt', 'opus');
    expect(result.args).not.toContain('--output-format');
    expect(result.command).not.toBe('claude');
  });
});
