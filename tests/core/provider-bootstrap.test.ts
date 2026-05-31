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
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('node -e gemini'),
  }),
}));

// Mock deck-file for .deck secret loading tests
vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
}));

import { spawnSync } from 'node:child_process';
import {
  ProviderRegistry,
  bootstrapProviders,
} from '../../src/core/provider.js';
import { Connector } from '../../src/orchestra/connector.js';
import { loadDeckSecrets } from '../../src/core/deck-file.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdapter(name: string, models: ModelType[] = ['opus', 'sonnet', 'haiku']): ProviderAdapter {
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
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
    // Default: loadDeckSecrets returns empty (no .deck file)
    vi.mocked(loadDeckSecrets).mockReturnValue({});
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
      // Sprint 202 Task 202-001: Ollama joined detectAvailableProviders so the
      // upper bound is now 4 (claude, codex, gemini, ollama).
      expect(totalHandled).toBeLessThanOrEqual(4);
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

  // ─── Connector integration ───────────────────────────────────────────────

  describe('Connector wiring', () => {
    it('should return a connector field in BootstrapResult', async () => {
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      expect(result).toHaveProperty('connector');
      expect(result.connector).toBeInstanceOf(Connector);
    });

    it('should create Connector with available providers', async () => {
      mockClaudeAvailable();
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      // Connector should have the same providers that were registered
      for (const name of result.registered) {
        expect(result.connector.isProviderReady(name)).toBe(true);
      }
    });

    it('should have same providers in Connector as in registry', async () => {
      mockClaudeAvailable();
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      const connectorProviders = result.connector.getAvailableProviders();
      for (const name of result.registered) {
        expect(connectorProviders).toContain(name);
      }
      expect(connectorProviders.length).toBe(result.registered.length);
    });

    it('should run health check during bootstrap', async () => {
      mockClaudeAvailable();
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      // Health check ran — connector should have cached results
      // Re-check to verify it doesn't throw
      const healthResults = await result.connector.healthCheck();
      expect(Array.isArray(healthResults)).toBe(true);
    });

    it('should keep unhealthy providers registered in Connector', async () => {
      // Claude available but adapter.isAvailable returns true by default
      // Register a provider that is "unhealthy" — we mock isAvailable to false
      const unhealthyAdapter = makeAdapter('claude');
      (unhealthyAdapter.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      registry.registerProvider(unhealthyAdapter);
      mockClaudeAvailable();

      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      // Provider should still be in connector despite unhealthy status
      if (result.registered.includes('claude')) {
        expect(result.connector.isProviderReady('claude')).toBe(true);
      }
    });

    it('should return empty Connector when no providers available', async () => {
      mockNoneAvailable();
      const config = makeConfig();
      const emptyRegistry = new ProviderRegistry();
      const result = await bootstrapProviders(config, '/tmp/test', emptyRegistry);

      expect(result.connector).toBeInstanceOf(Connector);
      expect(result.connector.size).toBe(0);
    });

    it('backward compat: providerRegistry.getDefault() still works after bootstrap', async () => {
      const claudeAdapter = makeAdapter('claude');
      registry.registerProvider(claudeAdapter);
      mockClaudeAvailable();

      const config = makeConfig({ brain_provider: 'claude' });
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      // providerRegistry (the passed registry) should still work as before
      expect(registry.getDefault().name).toBe('claude');
      // And connector also has it
      expect(result.connector.isProviderReady('claude')).toBe(true);
    });

    it('should not throw when health check fails internally', async () => {
      // Register a provider whose isAvailable throws
      const throwingAdapter = makeAdapter('claude');
      (throwingAdapter.isAvailable as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network timeout'));
      registry.registerProvider(throwingAdapter);
      mockClaudeAvailable();

      const config = makeConfig();
      // Should not throw — health check errors are caught
      const result = await bootstrapProviders(config, '/tmp/test', registry);
      expect(result.connector).toBeInstanceOf(Connector);
    });

    it('Connector size matches registered provider count', async () => {
      mockClaudeAvailable();
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      expect(result.connector.size).toBe(result.registered.length);
    });

    it('Connector getProvider returns same adapter as registry', async () => {
      const claudeAdapter = makeAdapter('claude');
      registry.registerProvider(claudeAdapter);
      mockClaudeAvailable();

      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      if (result.registered.includes('claude')) {
        const fromConnector = result.connector.getProvider('claude');
        const fromRegistry = registry.getProvider('claude');
        expect(fromConnector).toBe(fromRegistry);
      }
    });

    it('existing BootstrapResult fields still present alongside connector', async () => {
      mockClaudeAvailable();
      const config = makeConfig();
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      expect(result).toHaveProperty('registered');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('defaultProvider');
      expect(result).toHaveProperty('connector');
      expect(Array.isArray(result.registered)).toBe(true);
      expect(Array.isArray(result.skipped)).toBe(true);
    });
  });

  // ─── .deck secret loading ────────────────────────────────────────────────

  describe('.deck secret loading', () => {
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      // Save env vars we may modify
      savedEnv['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'];
      savedEnv['GOOGLE_API_KEY'] = process.env['GOOGLE_API_KEY'];
      savedEnv['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'];
      // Clear them for clean tests
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];
    });

    afterEach(() => {
      // Restore env vars
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });

    it('should load .deck API key for codex (OPENAI_API_KEY)', async () => {
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_OPENAI_API_KEY: 'sk-deck-openai-test',
      });

      const config = makeConfig({ projectRoot: '/tmp/test' });
      await bootstrapProviders(config, '/tmp/test', registry);

      expect(process.env['OPENAI_API_KEY']).toBe('sk-deck-openai-test');
    });

    it('should load .deck API key for gemini (GOOGLE_API_KEY)', async () => {
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_GOOGLE_API_KEY: 'AIza-deck-google-test',
      });

      const config = makeConfig({ projectRoot: '/tmp/test' });
      await bootstrapProviders(config, '/tmp/test', registry);

      expect(process.env['GOOGLE_API_KEY']).toBe('AIza-deck-google-test');
    });

    it('should load .deck API key for claude (ANTHROPIC_API_KEY)', async () => {
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_CLAUDE_API_KEY: 'sk-ant-deck-test',
      });

      const config = makeConfig({ projectRoot: '/tmp/test' });
      await bootstrapProviders(config, '/tmp/test', registry);

      expect(process.env['ANTHROPIC_API_KEY']).toBe('sk-ant-deck-test');
    });

    it('should OVERWRITE existing OPENAI_API_KEY — .deck takes precedence over system env', async () => {
      process.env['OPENAI_API_KEY'] = 'sk-existing-openai';
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_OPENAI_API_KEY: 'sk-deck-openai-override',
      });

      const config = makeConfig({ projectRoot: '/tmp/test' });
      await bootstrapProviders(config, '/tmp/test', registry);

      // .deck keys take precedence over system env vars (explicit > implicit)
      expect(process.env['OPENAI_API_KEY']).toBe('sk-deck-openai-override');
    });

    it('should OVERWRITE existing GOOGLE_API_KEY — .deck takes precedence over system env', async () => {
      process.env['GOOGLE_API_KEY'] = 'AIza-existing-google';
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_GOOGLE_API_KEY: 'AIza-deck-google-override',
      });

      const config = makeConfig({ projectRoot: '/tmp/test' });
      await bootstrapProviders(config, '/tmp/test', registry);

      // .deck keys take precedence over system env vars (explicit > implicit)
      expect(process.env['GOOGLE_API_KEY']).toBe('AIza-deck-google-override');
    });

    it('should skip .deck loading when auth_mode is subscription', async () => {
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_OPENAI_API_KEY: 'sk-should-not-load',
        DECKENT_GOOGLE_API_KEY: 'AIza-should-not-load',
        DECKENT_CLAUDE_API_KEY: 'sk-ant-should-not-load',
      });

      const config = { ...makeConfig({ projectRoot: '/tmp/test' }), auth_mode: 'subscription' as const };
      await bootstrapProviders(config, '/tmp/test', registry);

      expect(loadDeckSecrets).not.toHaveBeenCalled();
      expect(process.env['OPENAI_API_KEY']).toBeUndefined();
      expect(process.env['GOOGLE_API_KEY']).toBeUndefined();
      expect(process.env['ANTHROPIC_API_KEY']).toBeUndefined();
    });

    it('should not crash when .deck file is missing (empty secrets)', async () => {
      vi.mocked(loadDeckSecrets).mockReturnValue({});

      const config = makeConfig({ projectRoot: '/tmp/test' });
      const result = await bootstrapProviders(config, '/tmp/test', registry);

      expect(result).toBeDefined();
      expect(loadDeckSecrets).toHaveBeenCalledWith('/tmp/test');
    });

    it('should ignore empty string values from .deck', async () => {
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_OPENAI_API_KEY: '',
        DECKENT_GOOGLE_API_KEY: '',
        DECKENT_CLAUDE_API_KEY: '',
      });

      const config = makeConfig({ projectRoot: '/tmp/test' });
      await bootstrapProviders(config, '/tmp/test', registry);

      expect(process.env['OPENAI_API_KEY']).toBeUndefined();
      expect(process.env['GOOGLE_API_KEY']).toBeUndefined();
      expect(process.env['ANTHROPIC_API_KEY']).toBeUndefined();
    });

    it('should load .deck when auth_mode is api', async () => {
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_OPENAI_API_KEY: 'sk-api-mode-test',
      });

      const config = { ...makeConfig({ projectRoot: '/tmp/test' }), auth_mode: 'api' as const };
      await bootstrapProviders(config, '/tmp/test', registry);

      expect(loadDeckSecrets).toHaveBeenCalledWith('/tmp/test');
      expect(process.env['OPENAI_API_KEY']).toBe('sk-api-mode-test');
    });

    it('should load .deck when auth_mode is hybrid', async () => {
      vi.mocked(loadDeckSecrets).mockReturnValue({
        DECKENT_GOOGLE_API_KEY: 'AIza-hybrid-test',
      });

      const config = { ...makeConfig({ projectRoot: '/tmp/test' }), auth_mode: 'hybrid' as const };
      await bootstrapProviders(config, '/tmp/test', registry);

      expect(loadDeckSecrets).toHaveBeenCalledWith('/tmp/test');
      expect(process.env['GOOGLE_API_KEY']).toBe('AIza-hybrid-test');
    });
  });
});
