import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrainContext, SprintSizeRecommendation, DebtItem, Task, ModelType } from '../../src/core/types.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

// ─── Mocks ──────────────────────────────────────────────────────────

// F-2: the planner's LLM calls are async now (injectable PlannerSpawnFn seam —
// the spawnSync freeze-class died). node:child_process stays mocked so the
// fail-soft `git ls-files` normalization step never runs real git in tests.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

import {
  buildPlanPrompt,
  parsePlannerResponse,
  callBrainPlanner,
  callZeroConfigPlanner,
  buildZeroConfigFallbackPlan,
  buildPlannerSpawnArgs,
  buildZeroConfigPlanPrompt,
  resolveAdapter,
  normalizePlannerDependencies,
  type PlannerSpawnFn,
  type PlannerSpawnOutcome,
} from '../../src/orchestra/planner.js';
import { providerRegistry } from '../../src/core/provider.js';
import { BRAIN_PLAN_TIMEOUT_MS } from '../../src/core/constants.js';
import { modelRegistry } from '../../src/core/model-registry.js';

/** Hermetic PlannerSpawnFn fake: records every call, returns the canned
 *  outcome (per-call overrides supported for the retry path). */
function makeSpawnFn(outcome: Partial<PlannerSpawnOutcome> = {}, perCall?: Array<Partial<PlannerSpawnOutcome>>) {
  const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = [];
  const fn: PlannerSpawnFn = async (command, args, opts) => {
    const idx = calls.length;
    calls.push({ command, args: [...args], timeoutMs: opts.timeoutMs });
    return { status: 0, signal: null, stdout: validPlannerJSON, stderr: '', ...(perCall?.[idx] ?? outcome) };
  };
  return { fn, calls };
}

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
    expect(prompt).toContain('Plan ALL tasks');
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
    expect(prompt).toContain('RULES:');
  });

  it('F-1: carries the shared FILE PATH RULES contract (same block as the zero-config prompt)', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'test');
    expect(prompt).toContain('FILE PATH RULES:');
    expect(prompt).toContain('directory-qualified');
    expect(prompt).toContain('NEVER a bare filename');
    // SURF-6 kuyruk-D: goCriteria↔scope consistency (shared block — both prompts)
    expect(prompt).toContain('goNogo.goCriteria/noGoCriteria MUST also appear');
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

  // ─── born-690: model-aware resolution ──────────────────────────────
  // The default provider and the requested model are independent axes.
  // With brain_provider=codex the registry default became codex, and the
  // planner spawned `codex exec --model sonnet` → hard 400. resolveAdapter
  // must prefer the adapter that OWNS the model.

  it('born-690: prefers the model-owning provider over the registry default', () => {
    const codex = makeCodexAdapter(); // name: 'codex'
    const claude = makeMockAdapter({ name: 'claude' });
    providerRegistry.registerProvider(codex, true); // codex is DEFAULT
    providerRegistry.registerProvider(claude);
    // 'sonnet' is registry-owned by claude → claude adapter wins, not the default
    expect(resolveAdapter(undefined, 'sonnet')).toBe(claude);
  });

  it('born-690: falls back to registry default for models unknown to the model registry', () => {
    const codex = makeCodexAdapter();
    providerRegistry.registerProvider(codex, true);
    expect(resolveAdapter(undefined, 'my-custom-ollama-tag' as ModelType)).toBe(codex);
  });

  it('born-690: falls back to registry default when the owning provider is not registered', () => {
    const codex = makeCodexAdapter();
    providerRegistry.registerProvider(codex, true);
    // 'sonnet' is owned by claude, but claude is not registered → default (codex)
    expect(resolveAdapter(undefined, 'sonnet')).toBe(codex);
  });

  it('born-690: an explicitly provided adapter still wins over model-aware resolution', () => {
    const codex = makeCodexAdapter();
    const claude = makeMockAdapter({ name: 'claude' });
    providerRegistry.registerProvider(claude, true);
    expect(resolveAdapter(codex, 'sonnet')).toBe(codex);
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
    // Sprint 238 İŞ5: planner passes the real apiId (live from the registry), not the alias.
    expect(result.args).toEqual(['-p', 'my prompt', '--model', modelRegistry.resolveApiId('sonnet'), '--output-format', 'json']);
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
  it('uses adapter to determine CLI command', async () => {
    const adapter = makeMockAdapter();
    const { fn, calls } = makeSpawnFn();

    await callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test', adapter, undefined, undefined, fn);

    expect(calls[0]!.command).toBe('mock-cli');
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['-p', expect.any(String), '--model', 'claude-opus-4-8', '--output-format', 'json']));
    expect(calls[0]!.timeoutMs).toBe(BRAIN_PLAN_TIMEOUT_MS);
  });

  it('uses codex adapter CLI binary when codex adapter provided', async () => {
    const adapter = makeCodexAdapter();
    const { fn, calls } = makeSpawnFn();

    await callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter, undefined, undefined, fn);

    expect(calls[0]!.command).toBe('codex');
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['--model', modelRegistry.resolveApiId('sonnet')]));
  });

  it('falls back to registry default when no adapter passed', async () => {
    const adapter = makeMockAdapter({ name: 'registry-default' });
    providerRegistry.registerProvider(adapter, true);
    const { fn, calls } = makeSpawnFn();

    await callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test', undefined, undefined, undefined, fn);

    expect(calls[0]!.command).toBe('mock-cli');
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['--model', 'claude-opus-4-8']));
  });

  it('rejects when registry is empty and no adapter provided (no silent fallback)', async () => {
    await expect(
      callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test'),
    ).rejects.toThrow(/No providers registered/);
  });

  it('returns parsed result when adapter-based call succeeds', async () => {
    const adapter = makeMockAdapter();
    const { fn } = makeSpawnFn();

    const result = await callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter, undefined, undefined, fn);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0]!.title).toBe('Build feature');
  });

  it('returns null when adapter-based call fails (non-zero exit)', async () => {
    const adapter = makeMockAdapter();
    const { fn } = makeSpawnFn({ status: 1, stdout: '', stderr: 'error' });

    await expect(
      callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test', adapter, undefined, undefined, fn),
    ).resolves.toBeNull();
  });

  it('returns null on empty stdout', async () => {
    const adapter = makeMockAdapter();
    const { fn } = makeSpawnFn({ status: 0, stdout: '' });

    await expect(
      callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter, undefined, undefined, fn),
    ).resolves.toBeNull();
  });

  it('returns null when the spawn times out (SIGTERM at the deadline)', async () => {
    const adapter = makeMockAdapter();
    const { fn } = makeSpawnFn({ status: null, signal: 'SIGTERM', stdout: '' });

    await expect(
      callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter, undefined, undefined, fn),
    ).resolves.toBeNull();
  });

  it('uses adapter with buildPlannerCommand for callBrainPlanner', async () => {
    const adapter = makeAdapterWithPlannerCommand();
    const { fn, calls } = makeSpawnFn();

    await callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test', adapter, undefined, undefined, fn);

    expect(calls[0]!.command).toBe('custom-ai');
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['--prompt', expect.any(String), '--model', 'opus', '--json']));
  });

  it('passes model parameter correctly', async () => {
    const adapter = makeMockAdapter();
    const { fn, calls } = makeSpawnFn();

    await callBrainPlanner(makeContext(), makeRecommendation(), 'haiku', 'test', adapter, undefined, undefined, fn);

    const args = calls[0]!.args;
    const modelIdx = args.indexOf('--model');
    // Sprint 238 İŞ5: planner passes the real apiId, not the alias.
    expect(args[modelIdx + 1]).toBe('claude-haiku-4-5-20251001');
  });
});

// ═══ Provider Decoupling — callZeroConfigPlanner ════════════════════

describe('callZeroConfigPlanner', () => {
  it('rejects when no adapter and empty registry (no silent fallback)', async () => {
    await expect(
      callZeroConfigPlanner('Add login page', 'sonnet', 'test-project'),
    ).rejects.toThrow(/No providers registered/);
  });

  it('uses adapter CLI when adapter provided', async () => {
    const adapter = makeCodexAdapter();
    const { fn, calls } = makeSpawnFn();

    await callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter, undefined, fn);

    expect(calls[0]!.command).toBe('codex');
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['--model', modelRegistry.resolveApiId('sonnet')]));
  });

  it('uses registry default when no adapter passed but registry has provider', async () => {
    const adapter = makeCodexAdapter({ name: 'codex-default' });
    providerRegistry.registerProvider(adapter, true);
    const { fn, calls } = makeSpawnFn();

    await callZeroConfigPlanner('Add login page', 'opus', 'test-project', [], undefined, undefined, fn);

    expect(calls[0]!.command).toBe('codex');
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['--model', 'claude-opus-4-8']));
  });

  it('returns parsed result on success', async () => {
    const adapter = makeMockAdapter();
    const { fn } = makeSpawnFn();

    const result = await callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter, undefined, fn);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
  });

  it('returns null on failure', async () => {
    const adapter = makeMockAdapter();
    const { fn } = makeSpawnFn({ status: 1, stdout: '', stderr: 'fail' });

    await expect(
      callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter, undefined, fn),
    ).resolves.toBeNull();
  });

  it('returns null on empty stdout', async () => {
    const adapter = makeMockAdapter();
    const { fn } = makeSpawnFn({ status: 0, stdout: '' });

    await expect(
      callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter, undefined, fn),
    ).resolves.toBeNull();
  });

  it('uses adapter with buildPlannerCommand for zero-config', async () => {
    const adapter = makeAdapterWithPlannerCommand();
    const { fn, calls } = makeSpawnFn();

    await callZeroConfigPlanner('Add feature', 'opus', 'test-project', [], adapter, undefined, fn);

    expect(calls[0]!.command).toBe('custom-ai');
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['--prompt', expect.any(String), '--model', 'opus', '--json']));
  });

  it('retries ONCE with a schema-feedback prompt when the first response is unparseable (U2)', async () => {
    const adapter = makeMockAdapter();
    const { fn, calls } = makeSpawnFn({}, [
      { status: 0, stdout: 'not json at all' },
      { status: 0, stdout: validPlannerJSON },
    ]);

    const result = await callZeroConfigPlanner('Add login page', 'sonnet', 'test-project', [], adapter, undefined, fn);

    expect(calls).toHaveLength(2);
    expect(calls[1]!.args.join(' ')).toContain('YOUR PREVIOUS RESPONSE WAS INVALID');
    expect(result).not.toBeNull();
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

// ═══ AI Planner Timeout Configurable ════════════════════════════════

describe('callBrainPlanner — configurable timeout', () => {
  it('uses default BRAIN_PLAN_TIMEOUT_MS when no timeout provided', async () => {
    const adapter = makeMockAdapter();
    const { fn, calls } = makeSpawnFn();

    await callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter, undefined, undefined, fn);

    expect(calls[0]!.timeoutMs).toBe(BRAIN_PLAN_TIMEOUT_MS);
  });

  it('uses custom timeout when provided (config.ai_planner_timeout)', async () => {
    const adapter = makeMockAdapter();
    const { fn, calls } = makeSpawnFn();

    const customTimeout = 120_000;
    await callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test', adapter, customTimeout, undefined, fn);

    expect(calls[0]!.timeoutMs).toBe(customTimeout);
  });

  it('custom timeout overrides the default BRAIN_PLAN_TIMEOUT_MS', async () => {
    const adapter = makeMockAdapter();
    const { fn, calls } = makeSpawnFn();

    const shortTimeout = 5_000;
    await callBrainPlanner(makeContext(), makeRecommendation(), 'haiku', 'test', adapter, shortTimeout, undefined, fn);

    expect(calls[0]!.timeoutMs).toBe(shortTimeout);
    expect(calls[0]!.timeoutMs).not.toBe(BRAIN_PLAN_TIMEOUT_MS);
  });

  it('callZeroConfigPlanner uses custom timeout when provided', async () => {
    const adapter = makeMockAdapter();
    const { fn, calls } = makeSpawnFn();

    const customTimeout = 90_000;
    await callZeroConfigPlanner('Add feature', 'sonnet', 'test-project', [], adapter, customTimeout, fn);

    expect(calls[0]!.timeoutMs).toBe(customTimeout);
  });

  it('callZeroConfigPlanner uses default timeout when none provided', async () => {
    const adapter = makeMockAdapter();
    const { fn, calls } = makeSpawnFn();

    await callZeroConfigPlanner('Add feature', 'sonnet', 'test-project', [], adapter, undefined, fn);

    expect(calls[0]!.timeoutMs).toBe(BRAIN_PLAN_TIMEOUT_MS);
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

// ═══ buildPriorityContextBlock ════════════════════════════════════════

import { buildPriorityContextBlock } from '../../src/orchestra/planner.js';

describe('buildPriorityContextBlock', () => {
  it('returns all sections joined when within limit', () => {
    const sections = [
      { text: 'DIRECTIVES:\nDo X', priority: 1 },
      { text: 'MEMORY:\nRemember Y', priority: 2 },
    ];
    const result = buildPriorityContextBlock(sections, 100);
    expect(result).toContain('DIRECTIVES');
    expect(result).toContain('MEMORY');
  });

  it('preserves higher-priority sections when truncating', () => {
    const directives = Array.from({ length: 50 }, (_, i) => `directive line ${i}`).join('\n');
    const memory = Array.from({ length: 50 }, (_, i) => `memory line ${i}`).join('\n');
    const patterns = Array.from({ length: 50 }, (_, i) => `pattern line ${i}`).join('\n');
    const sections = [
      { text: `DIRECTIVES:\n${directives}`, priority: 1 },
      { text: `MEMORY:\n${memory}`, priority: 2 },
      { text: `PATTERNS:\n${patterns}`, priority: 4 },
    ];
    const result = buildPriorityContextBlock(sections, 60);
    // DIRECTIVES (priority 1) must be preserved over PATTERNS (priority 4)
    expect(result).toContain('DIRECTIVES');
    expect(result).toContain('directive line');
  });

  it('drops lowest priority sections first when over limit', () => {
    const sections = [
      { text: 'DIRECTIVES:\nKeep this', priority: 1 },
      { text: 'FILE TREE:\nMaybe drop this', priority: 8 },
    ];
    const result = buildPriorityContextBlock(sections, 5);
    expect(result).toContain('DIRECTIVES');
    // FILE TREE has lower priority and may be dropped
  });

  it('skips empty text sections', () => {
    const sections = [
      { text: '', priority: 1 },
      { text: 'MEMORY:\nContent', priority: 2 },
    ];
    const result = buildPriorityContextBlock(sections, 100);
    expect(result).toBe('MEMORY:\nContent');
    expect(result).not.toContain('\n\n\n');
  });
});

// ═══ prompt language unification (PCOMP-8 U3) ═════════════════════════
// Model-facing prompts are SINGLE-SOURCE English — the former TR/EN fork had
// drifted (ADR block only in the TR branch while production defaulted to TR).
// These pins keep the fork dead: no Turkish prompt text may reappear.

describe('buildPlanPrompt — single English source', () => {
  it('is English with no language parameter', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'test-project');
    expect(prompt).toContain('RULES:');
    expect(prompt).toContain('OUTPUT FORMAT');
    expect(prompt).toContain('Plan ALL tasks');
    expect(prompt).not.toContain('KURALLAR');
    expect(prompt).not.toContain('ÇIKTI FORMAT');
  });

  it('includes the context block', () => {
    const prompt = buildPlanPrompt(
      makeContext({ directives: 'Build something great' }),
      makeRecommendation(),
      'test-project',
    );
    expect(prompt).toContain('Build something great');
  });

  it('zero-config mode block is English', () => {
    const prompt = buildPlanPrompt(
      makeContext(), makeRecommendation(), 'test-project',
      'Add dark mode',
    );
    expect(prompt).toContain('ZERO-CONFIG MODE');
    expect(prompt).toContain('User started sprint');
    expect(prompt).not.toContain('Kullanıcı');
  });
});

describe('buildZeroConfigPlanPrompt — single English source', () => {
  it('is English with no language parameter', () => {
    const prompt = buildZeroConfigPlanPrompt('Add feature', 'my-app');
    expect(prompt).toContain('USER REQUEST');
    expect(prompt).toContain('OUTPUT FORMAT');
    expect(prompt).not.toContain('KULLANICI TALEBİ');
  });

  it('contains the description and project name', () => {
    const prompt = buildZeroConfigPlanPrompt('Add dark mode', 'my-app');
    expect(prompt).toContain('Add dark mode');
    expect(prompt).toContain('my-app');
  });
});

// ═══ normalizePlannerDependencies (323-031) ══════════════════════════

describe('normalizePlannerDependencies', () => {
  // Sibling tasks as the AI planner would produce them once createTask has
  // assigned real NNN-NNN ids. AI emits deps by TITLE; this pass rewrites them.
  function siblings(): Array<{ id: string; title: string; dependencies?: string[] }> {
    return [
      { id: '323-005', title: 'Setup database schema', dependencies: [] },
      { id: '323-007', title: 'Build REST API', dependencies: [] },
      { id: '323-010', title: 'Login page UI', dependencies: [] },
    ];
  }

  it('resolves a title-string dependency to the sibling task id (faithful — pre-fix RED)', () => {
    // Pre-fix: the title would survive (or be silently dropped by buildDependencyGraph).
    // Post-fix: it normalizes to the concrete id.
    const tasks = siblings();
    tasks[2]!.dependencies = ['Build REST API']; // Login UI depends on the API (by title)

    const result = normalizePlannerDependencies(tasks);

    expect(tasks[2]!.dependencies).toEqual(['323-007']);
    expect(result.resolvedCount).toBe(1);
    expect(result.dropped).toEqual([]);
  });

  it('resolves multiple deps mixing title and slot-id refs', () => {
    const tasks = siblings();
    tasks[2]!.dependencies = ['Setup database schema', '323-007'];

    const result = normalizePlannerDependencies(tasks);

    expect(tasks[2]!.dependencies).toEqual(['323-005', '323-007']);
    expect(result.resolvedCount).toBe(2);
    expect(result.dropped).toEqual([]);
  });

  it('preserves already-correct slot-id dependencies (behaviour-preserving)', () => {
    const tasks = siblings();
    tasks[1]!.dependencies = ['323-005'];

    const result = normalizePlannerDependencies(tasks);

    expect(tasks[1]!.dependencies).toEqual(['323-005']);
    expect(result.dropped).toEqual([]);
  });

  it('de-duplicates repeated refs that resolve to the same id', () => {
    const tasks = siblings();
    tasks[2]!.dependencies = ['Setup database schema', 'Setup database schema', '323-005'];

    normalizePlannerDependencies(tasks);

    expect(tasks[2]!.dependencies).toEqual(['323-005']);
  });

  it('drops a self-reference without reporting it as unresolvable', () => {
    const tasks = siblings();
    tasks[0]!.dependencies = ['Setup database schema']; // names itself by title

    const result = normalizePlannerDependencies(tasks);

    expect(tasks[0]!.dependencies).toEqual([]);
    expect(result.dropped).toEqual([]);
  });

  it('drops an unresolvable title dep and reports it (never silent)', () => {
    const tasks = siblings();
    tasks[1]!.dependencies = ['Nonexistent task'];

    const result = normalizePlannerDependencies(tasks);

    expect(tasks[1]!.dependencies).toEqual([]);
    expect(result.resolvedCount).toBe(0);
    expect(result.dropped).toEqual([
      { taskId: '323-007', ref: 'Nonexistent task', looksLikePlanSlotId: false },
    ]);
  });

  it('flags an id-shaped unresolvable ref distinctly from a title typo', () => {
    const tasks = siblings();
    tasks[1]!.dependencies = ['999-999']; // id-shaped but no such task

    const result = normalizePlannerDependencies(tasks);

    expect(tasks[1]!.dependencies).toEqual([]);
    expect(result.dropped).toEqual([
      { taskId: '323-007', ref: '999-999', looksLikePlanSlotId: true },
    ]);
  });

  it('leaves tasks with empty / undefined dependencies untouched', () => {
    const tasks: Array<{ id: string; title: string; dependencies?: string[] }> = [
      { id: '323-005', title: 'A', dependencies: [] },
      { id: '323-007', title: 'B' }, // undefined dependencies
    ];

    const result = normalizePlannerDependencies(tasks);

    expect(tasks[0]!.dependencies).toEqual([]);
    expect(tasks[1]!.dependencies).toBeUndefined();
    expect(result.resolvedCount).toBe(0);
    expect(result.dropped).toEqual([]);
  });
});
