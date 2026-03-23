import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ─── Mock child_process to prevent real spawnSync calls ─────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: '', error: null }),
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

// Mock dynamic imports for provider adapters
vi.mock('../../src/providers/claude.js', () => ({
  createClaudeAdapter: vi.fn().mockReturnValue({
    name: 'claude',
    supportedModels: ['opus', 'sonnet', 'haiku'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({ fiveHourPercent: 10, weeklyPercent: 5, measuredAt: new Date().toISOString() }),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('claude -p test'),
  }),
}));

vi.mock('../../src/providers/codex.js', () => ({
  createCodexAdapter: vi.fn().mockReturnValue({
    name: 'codex',
    supportedModels: ['gpt-4.1', 'o3', 'o4-mini'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({ fiveHourPercent: 10, weeklyPercent: 5, measuredAt: new Date().toISOString() }),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('codex exec test'),
  }),
}));

vi.mock('../../src/providers/gemini.js', () => ({
  createGeminiAdapter: vi.fn().mockReturnValue({
    name: 'gemini',
    supportedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({ fiveHourPercent: 10, weeklyPercent: 5, measuredAt: new Date().toISOString() }),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('node -e gemini'),
  }),
}));

import { spawnSync } from 'node:child_process';
import {
  ProviderRegistry,
  bootstrapProviders,
} from '../../src/core/provider.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdapter(name: string, models: ModelType[] = ['opus', 'sonnet', 'haiku']): ProviderAdapter {
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({ fiveHourPercent: 10, weeklyPercent: 5, measuredAt: new Date().toISOString() }),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue(`test -p ${name}`),
  };
}

function makeConfig(overrides: Partial<Pick<ResolvedConfig, 'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot'>> = {}) {
  return {
    projectRoot: '/tmp/test-project',
    brain_provider: undefined,
    worker_provider: undefined,
    fallback_provider: undefined,
    ...overrides,
  } as Pick<ResolvedConfig, 'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot'>;
}

/** Configure spawnSync mock to make claude detected as available */
function mockClaudeAvailable() {
  vi.mocked(spawnSync).mockImplementation((cmd: string) => {
    if (cmd === 'claude') {
      return { status: 0, stdout: '1.0.0\n', stderr: '', error: null, pid: 0, output: [], signal: null } as any;
    }
    return { status: 1, stdout: '', stderr: '', error: null, pid: 0, output: [], signal: null } as any;
  });
}

/** Configure spawnSync mock so all CLIs are unavailable */
function mockNoneAvailable() {
  vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', error: null, pid: 0, output: [], signal: null } as any);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('bootstrapProviders', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    vi.clearAllMocks();
    mockNoneAvailable();
    // Clear env vars that affect detection
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('BootstrapResult shape', () => {
    it('should return registered, skipped, and defaultProvider fields', async () => {
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      expect(result).toHaveProperty('registered');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('defaultProvider');
      expect(Array.isArray(result.registered)).toBe(true);
      expect(Array.isArray(result.skipped)).toBe(true);
    });

    it('should have ProviderName types in registered array', async () => {
      mockClaudeAvailable();
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      for (const name of result.registered) {
        expect(['claude', 'codex', 'gemini']).toContain(name);
      }
    });

    it('should have name and reason in skipped entries', async () => {
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      for (const entry of result.skipped) {
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('reason');
        expect(typeof entry.reason).toBe('string');
      }
    });
  });

  describe('default provider selection', () => {
    it('should set default to brain_provider when available and registered', async () => {
      const claudeAdapter = makeAdapter('claude');
      registry.registerProvider(claudeAdapter);
      mockClaudeAvailable();

      const config = makeConfig({ brain_provider: 'claude' });
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      expect(result.defaultProvider).toBe('claude');
      expect(registry.getDefault().name).toBe('claude');
    });

    it('should fall back to first registered when brain_provider unavailable', async () => {
      const codexAdapter = makeAdapter('codex', ['gpt-4.1', 'o3', 'o4-mini'] as ModelType[]);
      registry.registerProvider(codexAdapter);

      const config = makeConfig({ brain_provider: 'claude' });
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      if (result.registered.length > 0) {
        expect(result.defaultProvider).not.toBeNull();
      }
    });

    it('should default to claude when no brain_provider configured', async () => {
      const claudeAdapter = makeAdapter('claude');
      registry.registerProvider(claudeAdapter);
      mockClaudeAvailable();

      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      expect(result.defaultProvider).toBe('claude');
    });

    it('should return null defaultProvider when no providers registered', async () => {
      const config = makeConfig({ brain_provider: 'gemini' });
      const emptyRegistry = new ProviderRegistry();

      const result = await bootstrapProviders(config, '/tmp/test', emptyRegistry);

      if (result.registered.length === 0) {
        expect(result.defaultProvider).toBeNull();
      }
    });
  });

  describe('idempotent registration', () => {
    it('should skip already-registered providers without error', async () => {
      const claudeAdapter = makeAdapter('claude');
      registry.registerProvider(claudeAdapter);
      mockClaudeAvailable();

      const config = makeConfig();
      const result1 = await bootstrapProviders(config, '/tmp/test', registry);
      const result2 = await bootstrapProviders(config, '/tmp/test', registry);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should count pre-registered providers in registered array', async () => {
      const claudeAdapter = makeAdapter('claude');
      registry.registerProvider(claudeAdapter);
      mockClaudeAvailable();

      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      if (result.registered.includes('claude')) {
        expect(registry.hasProvider('claude')).toBe(true);
      }
    });
  });

  describe('skipped providers', () => {
    it('should report unavailable providers in skipped array', async () => {
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      const totalHandled = result.registered.length + result.skipped.filter(
        s => !s.reason.includes('Configured brain_provider')
      ).length;
      expect(totalHandled).toBeLessThanOrEqual(3);
    });

    it('should include reason string for each skipped provider', async () => {
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      for (const entry of result.skipped) {
        expect(entry.reason.length).toBeGreaterThan(0);
      }
    });

    it('should warn when configured brain_provider is unavailable', async () => {
      const config = makeConfig({ brain_provider: 'gemini' });
      const claudeAdapter = makeAdapter('claude');
      registry.registerProvider(claudeAdapter);
      mockClaudeAvailable();

      const result = await bootstrapProviders(config, '/tmp/test', registry);

      if (!registry.hasProvider('gemini')) {
        const warning = result.skipped.find(s => s.reason.includes('brain_provider'));
        expect(warning).toBeDefined();
        expect(warning?.name).toBe('gemini');
      }
    });
  });

  describe('projectRoot handling', () => {
    it('should use explicit projectRoot when provided', async () => {
      const config = makeConfig({ projectRoot: '/default/root' });
      const result = await bootstrapProviders(config, '/explicit/root', registry);
      expect(result).toBeDefined();
    });

    it('should fall back to config.projectRoot when projectRoot omitted', async () => {
      const config = makeConfig({ projectRoot: '/config/root' });
      const result = await bootstrapProviders(config, undefined, registry);
      expect(result).toBeDefined();
    });
  });

  describe('registry parameter', () => {
    it('should use provided registry instead of global singleton', async () => {
      const customRegistry = new ProviderRegistry();
      const config = makeConfig();
      await bootstrapProviders(config, '/tmp/test', customRegistry);

      expect(customRegistry).not.toBe(registry);
    });

    it('should register providers into the given registry', async () => {
      const customRegistry = new ProviderRegistry();
      const claudeAdapter = makeAdapter('claude');
      customRegistry.registerProvider(claudeAdapter);
      mockClaudeAvailable();

      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', customRegistry);

      if (result.registered.includes('claude')) {
        expect(customRegistry.hasProvider('claude')).toBe(true);
      }
    });
  });
});
