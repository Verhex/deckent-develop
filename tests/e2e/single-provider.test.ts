import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProviderRegistry,
  ProviderError,
  ProviderUnavailableError,
  resolveProviderWithFallback,
} from '../../src/core/provider.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type { ModelType, ProviderName } from '../../src/core/types.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Mock Adapter Factory ─────────────────────────────────────────────────────

function createMockAdapter(
  name: string,
  available: boolean,
  models: readonly ModelType[],
): ProviderAdapter & {
  spawn: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  isAvailable: ReturnType<typeof vi.fn>;
  buildCommand: ReturnType<typeof vi.fn>;
} {
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(available),
    buildCommand: vi.fn().mockReturnValue(`${name} exec --model test`),
  };
}

// ─── Task Factory ─────────────────────────────────────────────────────────────

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'A test task',
    model: 'claude-sonnet-5' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: 'Tests pass',
      noGoCriteria: 'Tests fail',
      techDebtAcceptable: 'Minor issues',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Test 1: Codex-only sprint
// ═════════════════════════════════════════════════════════════════════════════

describe('Codex-only sprint (no Claude, no Gemini)', () => {
  let registry: ProviderRegistry;
  let codexAdapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    registry = new ProviderRegistry();
    codexAdapter = createMockAdapter('codex', true, [
      'gpt-5.5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini',
    ]);
    registry.registerProvider(codexAdapter, true);
  });

  it('registry contains ONLY codex — no claude, no gemini', () => {
    expect(registry.listProviders()).toEqual(['codex']);
    expect(registry.hasProvider('claude')).toBe(false);
    expect(registry.hasProvider('gemini')).toBe(false);
    expect(registry.hasProvider('codex')).toBe(true);
  });

  it('default provider is codex', () => {
    const def = registry.getDefault();
    expect(def.name).toBe('codex');
  });

  it('resolveProviderWithFallback selects codex for gpt-4.1 tasks', async () => {
    const result = await resolveProviderWithFallback(
      'codex',
      'gpt-4.1' as ModelType,
      {},
      registry,
    );
    expect(result.provider).toBe('codex');
    expect(result.model).toBe('gpt-4.1');
    expect(result.wasOriginal).toBe(true);
  });

  it('resolveProviderWithFallback selects codex for gpt-5 tasks', async () => {
    const result = await resolveProviderWithFallback(
      'codex',
      'gpt-5.5' as ModelType,
      {},
      registry,
    );
    expect(result.provider).toBe('codex');
    expect(result.model).toBe('gpt-5.5');
  });

  it('spawn is called on codexAdapter for codex tasks', () => {
    codexAdapter.spawn('task-001', 'gpt-4.1' as ModelType, 'do stuff', {
      allowedTools: 'Read,Write,Bash',
      autoApprove: true,
      projectDir: '/tmp/test',
    });
    expect(codexAdapter.spawn).toHaveBeenCalledWith(
      'task-001',
      'gpt-4.1',
      'do stuff',
      expect.objectContaining({ autoApprove: true }),
    );
  });

  it('spawn called for both tasks in a 2-task sprint', () => {
    const task1 = createMockTask({ id: '001-001', model: 'gpt-4.1' as ModelType, provider: 'codex' });
    const task2 = createMockTask({ id: '001-002', model: 'gpt-5.5' as ModelType, provider: 'codex' });

    for (const task of [task1, task2]) {
      const adapter = registry.getProvider(task.provider!);
      adapter.spawn(task.id, task.model, `Prompt for ${task.id}`, { projectDir: '/tmp/test' });
    }

    expect(codexAdapter.spawn).toHaveBeenCalledTimes(2);
    expect(codexAdapter.spawn).toHaveBeenCalledWith('001-001', 'gpt-4.1', expect.any(String), expect.any(Object));
    expect(codexAdapter.spawn).toHaveBeenCalledWith('001-002', 'gpt-5.5', expect.any(String), expect.any(Object));
  });

  it('requesting claude provider throws ProviderNotFoundError', () => {
    expect(() => registry.getProvider('claude')).toThrow();
  });

  it('requesting gemini provider throws ProviderNotFoundError', () => {
    expect(() => registry.getProvider('gemini')).toThrow();
  });

  it('buildCommand produces codex-flavored string', () => {
    const cmd = codexAdapter.buildCommand('gpt-4.1' as ModelType, '/tmp/prompt.txt');
    expect(cmd).toContain('codex');
    expect(cmd).not.toContain('claude');
  });

  it('resolveProviderWithFallback throws when requesting claude with no fallback', async () => {
    await expect(
      resolveProviderWithFallback('claude', 'claude-opus-4-8' as ModelType, {}, registry),
    ).rejects.toThrow(ProviderUnavailableError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 2: Gemini-only sprint
// ═════════════════════════════════════════════════════════════════════════════

describe('Gemini-only sprint (no Claude, no Codex)', () => {
  let registry: ProviderRegistry;
  let geminiAdapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    registry = new ProviderRegistry();
    geminiAdapter = createMockAdapter('gemini', true, [
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash',
    ]);
    registry.registerProvider(geminiAdapter, true);
  });

  it('registry contains ONLY gemini — no claude, no codex', () => {
    expect(registry.listProviders()).toEqual(['gemini']);
    expect(registry.hasProvider('claude')).toBe(false);
    expect(registry.hasProvider('codex')).toBe(false);
    expect(registry.hasProvider('gemini')).toBe(true);
  });

  it('default provider is gemini', () => {
    expect(registry.getDefault().name).toBe('gemini');
  });

  it('resolveProviderWithFallback selects gemini for gemini-2.5-pro', async () => {
    const result = await resolveProviderWithFallback(
      'gemini',
      'gemini-2.5-pro' as ModelType,
      {},
      registry,
    );
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-pro');
    expect(result.wasOriginal).toBe(true);
  });

  it('resolveProviderWithFallback selects gemini for flash models', async () => {
    const result = await resolveProviderWithFallback(
      'gemini',
      'gemini-2.5-flash' as ModelType,
      {},
      registry,
    );
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash');
  });

  it('spawn is routed to geminiAdapter', () => {
    const task = createMockTask({ id: '002-001', model: 'gemini-2.5-pro' as ModelType, provider: 'gemini' });
    const adapter = registry.getProvider(task.provider!);
    adapter.spawn(task.id, task.model, 'Do gemini work', { projectDir: '/tmp/test' });

    expect(geminiAdapter.spawn).toHaveBeenCalledWith(
      '002-001',
      'gemini-2.5-pro',
      'Do gemini work',
      expect.objectContaining({ projectDir: '/tmp/test' }),
    );
  });

  it('spawn called for 2-task gemini sprint', () => {
    const tasks = [
      createMockTask({ id: '002-001', model: 'gemini-2.5-pro' as ModelType, provider: 'gemini' }),
      createMockTask({ id: '002-002', model: 'gemini-2.5-flash' as ModelType, provider: 'gemini' }),
    ];

    for (const task of tasks) {
      registry.getProvider('gemini').spawn(task.id, task.model, `Prompt ${task.id}`, { projectDir: '/tmp' });
    }

    expect(geminiAdapter.spawn).toHaveBeenCalledTimes(2);
  });

  it('requesting claude throws ProviderNotFoundError', () => {
    expect(() => registry.getProvider('claude')).toThrow();
  });

  it('requesting codex throws ProviderNotFoundError', () => {
    expect(() => registry.getProvider('codex')).toThrow();
  });

  it('buildCommand produces gemini-flavored string', () => {
    const cmd = geminiAdapter.buildCommand('gemini-2.5-pro' as ModelType, '/tmp/prompt.txt');
    expect(cmd).toContain('gemini');
    expect(cmd).not.toContain('claude');
  });

  it('resolveProviderWithFallback throws when requesting claude with no fallback', async () => {
    await expect(
      resolveProviderWithFallback('claude', 'claude-opus-4-8' as ModelType, {}, registry),
    ).rejects.toThrow(ProviderUnavailableError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 3: No providers registered
// ═════════════════════════════════════════════════════════════════════════════

describe('No providers registered', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registry is empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.listProviders()).toEqual([]);
  });

  it('getDefault throws ProviderError (not silently returning claude)', () => {
    expect(() => registry.getDefault()).toThrow(ProviderError);
    expect(() => registry.getDefault()).toThrow(/No providers registered/);
  });

  it('getProvider("claude") throws', () => {
    expect(() => registry.getProvider('claude')).toThrow();
  });

  it('getProvider("codex") throws', () => {
    expect(() => registry.getProvider('codex')).toThrow();
  });

  it('getProvider("gemini") throws', () => {
    expect(() => registry.getProvider('gemini')).toThrow();
  });

  it('resolveProviderWithFallback throws when no providers exist', async () => {
    await expect(
      resolveProviderWithFallback('codex', 'gpt-4.1' as ModelType, {}, registry),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('resolveProviderWithFallback throws even with fallback_provider configured but unregistered', async () => {
    await expect(
      resolveProviderWithFallback(
        'codex',
        'gpt-4.1' as ModelType,
        { fallback_provider: 'gemini' as ProviderName },
        registry,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('resolveProviderWithFallback error message does not default to claude', async () => {
    try {
      await resolveProviderWithFallback('codex', 'gpt-4.1' as ModelType, {}, registry);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderUnavailableError);
      // The error should reference codex, not silently return claude
      expect((err as ProviderUnavailableError).providerName).toBe('codex');
    }
  });

  it('hasProvider returns false for all providers', () => {
    expect(registry.hasProvider('claude')).toBe(false);
    expect(registry.hasProvider('codex')).toBe(false);
    expect(registry.hasProvider('gemini')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 4: Fallback from Codex to Gemini (no Claude)
// ═════════════════════════════════════════════════════════════════════════════

describe('Fallback from Codex to Gemini (no Claude)', () => {
  let registry: ProviderRegistry;
  let codexAdapter: ReturnType<typeof createMockAdapter>;
  let geminiAdapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    registry = new ProviderRegistry();

    // Codex is registered but UNAVAILABLE
    codexAdapter = createMockAdapter('codex', false, [
      'gpt-5.5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini',
    ]);
    registry.registerProvider(codexAdapter);

    // Gemini is registered and available
    geminiAdapter = createMockAdapter('gemini', true, [
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash',
    ]);
    registry.registerProvider(geminiAdapter);
  });

  it('no claude registered', () => {
    expect(registry.hasProvider('claude')).toBe(false);
    expect(registry.listProviders()).toEqual(['codex', 'gemini']);
  });

  it('codex isAvailable returns false', async () => {
    expect(await codexAdapter.isAvailable()).toBe(false);
  });

  it('gemini isAvailable returns true', async () => {
    expect(await geminiAdapter.isAvailable()).toBe(true);
  });

  it('fallback: gpt-4.1 (standard tier) maps to gemini-2.5-flash', async () => {
    const result = await resolveProviderWithFallback(
      'codex',
      'gpt-4.1' as ModelType,
      { fallback_provider: 'gemini' as ProviderName },
      registry,
    );
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.wasOriginal).toBe(false);
    expect(result.reason).toContain('fallback');
  });

  it('fallback: gpt-5 (premium tier) maps to gemini-2.5-pro', async () => {
    const result = await resolveProviderWithFallback(
      'codex',
      'gpt-5.5' as ModelType,
      { fallback_provider: 'gemini' as ProviderName },
      registry,
    );
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-pro');
    expect(result.wasOriginal).toBe(false);
  });

  it('fallback: gpt-5-mini (economy tier) maps to gemini-2.0-flash', async () => {
    const result = await resolveProviderWithFallback(
      'codex',
      'gpt-5-mini' as ModelType,
      { fallback_provider: 'gemini' as ProviderName },
      registry,
    );
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.0-flash');
    expect(result.wasOriginal).toBe(false);
  });

  it('fallback result reason mentions both providers', async () => {
    const result = await resolveProviderWithFallback(
      'codex',
      'gpt-4.1' as ModelType,
      { fallback_provider: 'gemini' as ProviderName },
      registry,
    );
    expect(result.reason).toContain('codex');
    expect(result.reason).toContain('gemini');
  });

  it('throws when both codex and gemini are unavailable', async () => {
    geminiAdapter.isAvailable.mockResolvedValue(false);
    await expect(
      resolveProviderWithFallback(
        'codex',
        'gpt-4.1' as ModelType,
        { fallback_provider: 'gemini' as ProviderName },
        registry,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('throws when no fallback_provider configured and codex is down', async () => {
    await expect(
      resolveProviderWithFallback(
        'codex',
        'gpt-4.1' as ModelType,
        {},
        registry,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('gemini adapter spawn is callable after fallback resolution', async () => {
    const result = await resolveProviderWithFallback(
      'codex',
      'gpt-4.1' as ModelType,
      { fallback_provider: 'gemini' as ProviderName },
      registry,
    );

    const adapter = registry.getProvider(result.provider);
    adapter.spawn('task-fallback', result.model, 'Fallback prompt', { projectDir: '/tmp' });

    expect(geminiAdapter.spawn).toHaveBeenCalledWith(
      'task-fallback',
      'gemini-2.5-flash',
      'Fallback prompt',
      expect.any(Object),
    );
  });

  it('codex spawn is NOT called during fallback', async () => {
    const result = await resolveProviderWithFallback(
      'codex',
      'gpt-4.1' as ModelType,
      { fallback_provider: 'gemini' as ProviderName },
      registry,
    );

    const adapter = registry.getProvider(result.provider);
    adapter.spawn('task-fb', result.model, 'prompt', { projectDir: '/tmp' });

    expect(codexAdapter.spawn).not.toHaveBeenCalled();
    expect(geminiAdapter.spawn).toHaveBeenCalledTimes(1);
  });
});
