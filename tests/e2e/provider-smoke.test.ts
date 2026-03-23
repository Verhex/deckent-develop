import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeAdapter, createClaudeAdapter } from '../../src/providers/claude.js';
import { CodexAdapter, createCodexAdapter } from '../../src/providers/codex.js';
import { GeminiAdapter, createGeminiAdapter, GEMINI_AUTH_HEADER } from '../../src/providers/gemini.js';
import {
  ProviderRegistry,
  ProviderUnavailableError,
  resolveProviderWithFallback,
  detectAvailableProviders,
  bootstrapProviders,
} from '../../src/core/provider.js';
import {
  getEquivalentModel,
  getModelTier,
  getModelProvider,
  MODEL_TIERS,
} from '../../src/core/model-equivalence.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type { ModelType, ProviderName } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_DIR = '/tmp/deckent-provider-smoke-test';

function makeMockAdapter(
  name: string,
  available: boolean,
  models: ModelType[] = ['opus', 'sonnet', 'haiku'],
): ProviderAdapter {
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({
      fiveHourPercent: 0,
      weeklyPercent: 0,
      measuredAt: new Date().toISOString(),
    }),
    isAvailable: vi.fn().mockResolvedValue(available),
    buildCommand: vi.fn().mockReturnValue(`${name} exec`),
  };
}

// ─── Claude Adapter ───────────────────────────────────────────────────────────

describe('Claude Adapter Smoke Tests', () => {
  let adapter: ClaudeAdapter;

  beforeEach(() => {
    adapter = createClaudeAdapter(TEST_DIR);
  });

  it('should have correct name and supported models', () => {
    expect(adapter.name).toBe('claude-tmux');
    expect(adapter.supportedModels).toContain('opus');
    expect(adapter.supportedModels).toContain('sonnet');
    expect(adapter.supportedModels).toContain('haiku');
  });

  it('buildCommand produces valid claude CLI string with model', () => {
    const cmd = adapter.buildCommand('opus', '/tmp/prompt.txt');
    expect(cmd).toContain('claude');
    expect(cmd).toContain('-p -');
    expect(cmd).toContain('--model opus');
    expect(cmd).toContain('< /tmp/prompt.txt');
  });

  it('buildCommand includes allowedTools when specified', () => {
    const cmd = adapter.buildCommand('sonnet', '/tmp/prompt.txt', {
      allowedTools: 'Read,Write,Bash',
    });
    expect(cmd).toContain("--allowedTools 'Read,Write,Bash'");
  });

  it('buildCommand includes --dangerously-skip-permissions when autoApprove', () => {
    const cmd = adapter.buildCommand('haiku', '/tmp/prompt.txt', {
      autoApprove: true,
    });
    expect(cmd).toContain('--dangerously-skip-permissions');
  });

  it('buildCommand without opts produces clean command', () => {
    const cmd = adapter.buildCommand('sonnet', '/tmp/task.txt');
    expect(cmd).toBe('claude -p - --model sonnet < /tmp/task.txt');
  });

  it('isAvailable returns boolean (checks claude --version)', async () => {
    const result = await adapter.isAvailable();
    expect(typeof result).toBe('boolean');
  }, 15_000);
});

// ─── Codex Adapter ────────────────────────────────────────────────────────────

describe('Codex Adapter Smoke Tests', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    adapter = createCodexAdapter(TEST_DIR);
  });

  it('should have correct name and supported models', () => {
    expect(adapter.name).toBe('codex');
    expect(adapter.supportedModels).toContain('gpt-5');
    expect(adapter.supportedModels).toContain('gpt-5-mini');
    expect(adapter.supportedModels).toContain('gpt-4.1');
    expect(adapter.supportedModels).toContain('o3');
  });

  it('buildCommand produces valid codex exec string', () => {
    const cmd = adapter.buildCommand('gpt-5', '/tmp/prompt.txt');
    expect(cmd).toContain('codex exec');
    expect(cmd).toContain('--model gpt-5');
    expect(cmd).toContain('--quiet');
    expect(cmd).toContain('< /tmp/prompt.txt');
  });

  it('buildCommand includes --approval-mode full-auto when autoApprove', () => {
    const cmd = adapter.buildCommand('gpt-4.1', '/tmp/prompt.txt', {
      autoApprove: true,
    });
    expect(cmd).toContain('--approval-mode full-auto');
  });

  it('buildCommand without autoApprove omits approval flag', () => {
    const cmd = adapter.buildCommand('o3', '/tmp/prompt.txt');
    expect(cmd).not.toContain('--approval-mode');
  });

  it('isAvailable checks OPENAI_API_KEY and codex CLI', async () => {
    const result = await adapter.isAvailable();
    expect(typeof result).toBe('boolean');
    // Without OPENAI_API_KEY set, should be false
    if (!process.env['OPENAI_API_KEY']) {
      expect(result).toBe(false);
    }
  });

  it('listWorkers returns empty array initially', () => {
    expect(adapter.listWorkers()).toEqual([]);
  });

  it('checkUsage returns valid metrics', async () => {
    const usage = await adapter.checkUsage();
    expect(usage).toHaveProperty('fiveHourPercent');
    expect(usage).toHaveProperty('weeklyPercent');
    expect(usage).toHaveProperty('measuredAt');
    expect(typeof usage.fiveHourPercent).toBe('number');
    expect(typeof usage.weeklyPercent).toBe('number');
  });
});

// ─── Gemini Adapter ───────────────────────────────────────────────────────────

describe('Gemini Adapter Smoke Tests', () => {
  let adapter: GeminiAdapter;

  beforeEach(() => {
    adapter = createGeminiAdapter(TEST_DIR);
  });

  it('should have correct name and supported models', () => {
    expect(adapter.name).toBe('gemini');
    expect(adapter.supportedModels).toContain('gemini-2.5-pro');
    expect(adapter.supportedModels).toContain('gemini-2.5-flash');
    expect(adapter.supportedModels).toContain('gemini-2.0-flash');
  });

  it('buildCommand produces valid curl command with API URL', () => {
    const cmd = adapter.buildCommand('gemini-2.5-pro', '/tmp/prompt.json');
    expect(cmd).toContain('curl');
    expect(cmd).toContain('generativelanguage.googleapis.com');
    expect(cmd).toContain('gemini-2.5-pro:generateContent');
    expect(cmd).toContain(`${GEMINI_AUTH_HEADER}:`);
    expect(cmd).toContain('-d @/tmp/prompt.json');
  });

  it('isAvailable checks GOOGLE_API_KEY env var', async () => {
    const result = await adapter.isAvailable();
    expect(typeof result).toBe('boolean');
    // Without GOOGLE_API_KEY, should be false
    if (!process.env['GOOGLE_API_KEY']) {
      expect(result).toBe(false);
    }
  });

  it('validateApiKey returns invalid when key not set', () => {
    if (!process.env['GOOGLE_API_KEY']) {
      const validation = adapter.validateApiKey();
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('not set');
    }
  });

  it('buildApiScript produces valid JS with fetch call', () => {
    const script = adapter.buildApiScript(
      'https://example.com/api',
      'test-key',
      'Hello world',
    );
    expect(script).toContain('fetch(');
    expect(script).toContain('https://example.com/api');
    expect(script).toContain(GEMINI_AUTH_HEADER);
    expect(script).toContain('test-key');
    expect(script).toContain('Hello world');
    expect(script).toContain('process.stdout.write');
  });

  it('buildStreamingApiScript produces SSE streaming script', () => {
    const script = adapter.buildStreamingApiScript(
      'gemini-2.5-flash',
      'test-key',
      'test prompt',
    );
    expect(script).toContain('streamGenerateContent?alt=sse');
    expect(script).toContain('reader.read()');
    expect(script).toContain(GEMINI_AUTH_HEADER);
  });

  it('getEndpoint and getStreamingEndpoint produce correct URLs', () => {
    const endpoint = adapter.getEndpoint('gemini-2.5-pro');
    expect(endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    );

    const streamEndpoint = adapter.getStreamingEndpoint('gemini-2.5-pro');
    expect(streamEndpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse',
    );
  });

  it('checkUsage returns neutral defaults', async () => {
    const usage = await adapter.checkUsage();
    expect(usage.fiveHourPercent).toBe(0);
    expect(usage.weeklyPercent).toBe(0);
  });
});

// ─── Provider Registry ────────────────────────────────────────────────────────

describe('Provider Registry Smoke Tests', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registers providers and sets first as default', () => {
    const claude = makeMockAdapter('claude', true);
    const codex = makeMockAdapter('codex', true, ['gpt-5', 'gpt-4.1']);

    registry.registerProvider(claude);
    registry.registerProvider(codex);

    expect(registry.listProviders()).toEqual(['claude', 'codex']);
    expect(registry.getDefault().name).toBe('claude');
    expect(registry.size).toBe(2);
  });

  it('setDefault changes the default provider', () => {
    const claude = makeMockAdapter('claude', true);
    const codex = makeMockAdapter('codex', true);

    registry.registerProvider(claude);
    registry.registerProvider(codex);
    registry.setDefault('codex');

    expect(registry.getDefault().name).toBe('codex');
  });

  it('unregisterProvider resets default when removing current default', () => {
    const claude = makeMockAdapter('claude', true);
    const codex = makeMockAdapter('codex', true);

    registry.registerProvider(claude);
    registry.registerProvider(codex);

    registry.unregisterProvider('claude');
    expect(registry.getDefault().name).toBe('codex');
    expect(registry.hasProvider('claude')).toBe(false);
  });

  it('clear removes all providers', () => {
    registry.registerProvider(makeMockAdapter('claude', true));
    registry.registerProvider(makeMockAdapter('codex', true));
    registry.clear();

    expect(registry.size).toBe(0);
    expect(registry.listProviders()).toEqual([]);
  });

  it('getProvider throws for unregistered provider', () => {
    expect(() => registry.getProvider('nonexistent')).toThrow();
  });
});

// ─── Fallback Chain ───────────────────────────────────────────────────────────

describe('Provider Fallback Chain Smoke Tests', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('returns original provider when available', async () => {
    const claude = makeMockAdapter('claude', true);
    registry.registerProvider(claude);

    const result = await resolveProviderWithFallback(
      'claude',
      'opus',
      {},
      registry,
    );

    expect(result.provider).toBe('claude');
    expect(result.model).toBe('opus');
    expect(result.wasOriginal).toBe(true);
  });

  it('falls back to alternative provider when primary unavailable', async () => {
    const claude = makeMockAdapter('claude', false);
    const codex = makeMockAdapter('codex', true, ['gpt-5', 'gpt-4.1', 'gpt-5-mini', 'gpt-4.1-mini', 'o3', 'o4-mini']);
    registry.registerProvider(claude);
    registry.registerProvider(codex);

    const result = await resolveProviderWithFallback(
      'claude',
      'opus',
      { fallback_provider: 'codex' },
      registry,
    );

    expect(result.provider).toBe('codex');
    expect(result.wasOriginal).toBe(false);
    // opus → gpt-5 (premium tier equivalent)
    expect(result.model).toBe('gpt-5');
  });

  it('applies model equivalence during fallback: sonnet → gpt-4.1', async () => {
    const claude = makeMockAdapter('claude', false);
    const codex = makeMockAdapter('codex', true, ['gpt-5', 'gpt-4.1', 'gpt-5-mini', 'gpt-4.1-mini', 'o3', 'o4-mini']);
    registry.registerProvider(claude);
    registry.registerProvider(codex);

    const result = await resolveProviderWithFallback(
      'claude',
      'sonnet',
      { fallback_provider: 'codex' },
      registry,
    );

    expect(result.model).toBe('gpt-4.1');
  });

  it('applies model equivalence during fallback: haiku → gpt-5-mini', async () => {
    const claude = makeMockAdapter('claude', false);
    const codex = makeMockAdapter('codex', true, ['gpt-5', 'gpt-4.1', 'gpt-5-mini', 'gpt-4.1-mini', 'o3', 'o4-mini']);
    registry.registerProvider(claude);
    registry.registerProvider(codex);

    const result = await resolveProviderWithFallback(
      'claude',
      'haiku',
      { fallback_provider: 'codex' },
      registry,
    );

    expect(result.model).toBe('gpt-5-mini');
  });

  it('throws ProviderUnavailableError when no fallback configured', async () => {
    const claude = makeMockAdapter('claude', false);
    registry.registerProvider(claude);

    await expect(
      resolveProviderWithFallback('claude', 'opus', {}, registry),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('throws when both primary and fallback are unavailable', async () => {
    const claude = makeMockAdapter('claude', false);
    const codex = makeMockAdapter('codex', false);
    registry.registerProvider(claude);
    registry.registerProvider(codex);

    await expect(
      resolveProviderWithFallback(
        'claude',
        'opus',
        { fallback_provider: 'codex' },
        registry,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('fallback to gemini maps opus → gemini-2.5-pro', async () => {
    const claude = makeMockAdapter('claude', false);
    const gemini = makeMockAdapter('gemini', true, ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']);
    registry.registerProvider(claude);
    registry.registerProvider(gemini);

    const result = await resolveProviderWithFallback(
      'claude',
      'opus',
      { fallback_provider: 'gemini' },
      registry,
    );

    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-pro');
  });
});

// ─── Model Equivalence ────────────────────────────────────────────────────────

describe('Model Equivalence Smoke Tests', () => {
  it('getModelTier returns correct tiers', () => {
    expect(getModelTier('opus')).toBe('premium');
    expect(getModelTier('sonnet')).toBe('standard');
    expect(getModelTier('haiku')).toBe('economy');
    expect(getModelTier('gpt-5')).toBe('premium');
    expect(getModelTier('gemini-2.5-pro')).toBe('premium');
  });

  it('getEquivalentModel maps across providers correctly', () => {
    expect(getEquivalentModel('opus', 'codex')).toBe('gpt-5');
    expect(getEquivalentModel('opus', 'gemini')).toBe('gemini-2.5-pro');
    expect(getEquivalentModel('sonnet', 'codex')).toBe('gpt-4.1');
    expect(getEquivalentModel('sonnet', 'gemini')).toBe('gemini-2.5-flash');
    expect(getEquivalentModel('haiku', 'codex')).toBe('gpt-5-mini');
    expect(getEquivalentModel('haiku', 'gemini')).toBe('gemini-2.0-flash');
  });

  it('getEquivalentModel returns same model for same provider', () => {
    expect(getEquivalentModel('opus', 'claude')).toBe('opus');
    expect(getEquivalentModel('gpt-5', 'codex')).toBe('gpt-5');
    expect(getEquivalentModel('gemini-2.5-pro', 'gemini')).toBe('gemini-2.5-pro');
  });

  it('getModelProvider returns correct provider', () => {
    expect(getModelProvider('opus')).toBe('claude');
    expect(getModelProvider('gpt-5')).toBe('codex');
    expect(getModelProvider('gemini-2.5-pro')).toBe('gemini');
  });

  it('MODEL_TIERS covers all three tiers', () => {
    expect(MODEL_TIERS.premium.length).toBeGreaterThanOrEqual(3);
    expect(MODEL_TIERS.standard.length).toBeGreaterThanOrEqual(3);
    expect(MODEL_TIERS.economy.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Provider Detection ───────────────────────────────────────────────────────

describe('Provider Detection Smoke Tests', () => {
  it('detectAvailableProviders returns array of 3 providers', async () => {
    const providers = await detectAvailableProviders();
    expect(providers).toHaveLength(3);

    const names = providers.map((p) => p.name);
    expect(names).toContain('claude');
    expect(names).toContain('codex');
    expect(names).toContain('gemini');
  }, 15_000);

  it('each detected provider has required fields', async () => {
    const providers = await detectAvailableProviders();
    for (const p of providers) {
      expect(typeof p.name).toBe('string');
      expect(typeof p.available).toBe('boolean');
      expect(['session', 'api_key', 'none']).toContain(p.authMethod);
      expect(Array.isArray(p.models)).toBe(true);
      expect(p.models.length).toBeGreaterThan(0);
    }
  }, 15_000);
});
