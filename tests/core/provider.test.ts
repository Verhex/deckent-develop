import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProviderRegistry,
  ProviderError,
  ProviderNotFoundError,
  ProviderUnavailableError,
  providerRegistry,
} from '../../src/core/provider.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';
import { ALL_PROVIDER_NAMES } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdapter(name: string, models: ModelType[] = ['opus', 'sonnet', 'haiku']): ProviderAdapter {
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue(`claude -p ${name}`),
  };
}

// ─── ProviderAdapter interface shape ─────────────────────────────────────────

describe('ProviderAdapter interface', () => {
  it('includes cursor in the canonical provider-name spine', () => {
    expect(ALL_PROVIDER_NAMES).toContain('cursor');
  });

  it('should define required properties', () => {
    const adapter = makeAdapter('test-provider');
    expect(typeof adapter.name).toBe('string');
    expect(Array.isArray(adapter.supportedModels)).toBe(true);
    expect(typeof adapter.spawn).toBe('function');
    expect(typeof adapter.kill).toBe('function');
    expect(typeof adapter.listWorkers).toBe('function');
    expect(typeof adapter.isAvailable).toBe('function');
    expect(typeof adapter.buildCommand).toBe('function');
  });

  it('should support readonly name property', () => {
    const adapter = makeAdapter('immutable');
    expect(adapter.name).toBe('immutable');
  });

  it('should support readonly supportedModels array', () => {
    const adapter = makeAdapter('models-test', ['opus', 'sonnet']);
    expect(adapter.supportedModels).toEqual(['opus', 'sonnet']);
  });

  it('spawn should be callable with taskId, model, prompt, opts', () => {
    const adapter = makeAdapter('spawn-test');
    const opts: ProviderSpawnOptions = { allowedTools: 'Read,Write', autoApprove: true, projectDir: '/tmp' };
    adapter.spawn('task-001', 'opus', 'Hello prompt', opts);
    expect(adapter.spawn).toHaveBeenCalledWith('task-001', 'opus', 'Hello prompt', opts);
  });

  it('kill should be callable with taskId', () => {
    const adapter = makeAdapter('kill-test');
    adapter.kill('task-001');
    expect(adapter.kill).toHaveBeenCalledWith('task-001');
  });

  it('listWorkers should return an array', () => {
    const adapter = makeAdapter('list-test');
    (adapter.listWorkers as ReturnType<typeof vi.fn>).mockReturnValue(['task-001', 'task-002']);
    const workers = adapter.listWorkers();
    expect(Array.isArray(workers)).toBe(true);
    expect(workers).toHaveLength(2);
  });

  it('isAvailable should return a promise resolving to boolean', async () => {
    const adapter = makeAdapter('avail-test');
    const result = await adapter.isAvailable();
    expect(typeof result).toBe('boolean');
  });

  it('buildCommand should return a string', () => {
    const adapter = makeAdapter('cmd-test');
    const cmd = adapter.buildCommand('opus', '/tmp/prompt.txt', { allowedTools: 'Read' });
    expect(typeof cmd).toBe('string');
  });
});

// ─── ProviderRegistry ─────────────────────────────────────────────────────────

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('starts empty with no providers', () => {
    expect(registry.listProviders()).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it('registerProvider adds provider and sets first as default', () => {
    const a = makeAdapter('provider-a');
    registry.registerProvider(a);
    expect(registry.listProviders()).toEqual(['provider-a']);
    expect(registry.getDefault().name).toBe('provider-a');
  });

  it('registerProvider throws on duplicate name', () => {
    const a = makeAdapter('dup');
    registry.registerProvider(a);
    expect(() => registry.registerProvider(makeAdapter('dup'))).toThrow(ProviderError);
  });

  it('registerProvider with setDefault=true overrides default', () => {
    registry.registerProvider(makeAdapter('first'));
    registry.registerProvider(makeAdapter('second'), true);
    expect(registry.getDefault().name).toBe('second');
  });

  it('getProvider returns the correct adapter', () => {
    const a = makeAdapter('my-provider');
    registry.registerProvider(a);
    expect(registry.getProvider('my-provider')).toBe(a);
  });

  it('getProvider throws ProviderNotFoundError for unknown name', () => {
    expect(() => registry.getProvider('no-such-provider')).toThrow(ProviderNotFoundError);
  });

  it('listProviders returns all registered names', () => {
    registry.registerProvider(makeAdapter('prov-1'));
    registry.registerProvider(makeAdapter('prov-2'));
    registry.registerProvider(makeAdapter('prov-3'));
    expect(registry.listProviders()).toEqual(['prov-1', 'prov-2', 'prov-3']);
  });

  it('getDefault throws when no providers registered', () => {
    expect(() => registry.getDefault()).toThrow(ProviderError);
  });

  it('setDefault changes the default provider', () => {
    registry.registerProvider(makeAdapter('alpha'));
    registry.registerProvider(makeAdapter('beta'));
    registry.setDefault('beta');
    expect(registry.getDefault().name).toBe('beta');
  });

  it('setDefault throws ProviderNotFoundError for unknown name', () => {
    expect(() => registry.setDefault('ghost')).toThrow(ProviderNotFoundError);
  });

  it('hasProvider returns true for registered providers', () => {
    registry.registerProvider(makeAdapter('exists'));
    expect(registry.hasProvider('exists')).toBe(true);
  });

  it('hasProvider returns false for unregistered providers', () => {
    expect(registry.hasProvider('nope')).toBe(false);
  });

  it('unregisterProvider removes the provider', () => {
    registry.registerProvider(makeAdapter('to-remove'));
    const removed = registry.unregisterProvider('to-remove');
    expect(removed).toBe(true);
    expect(registry.hasProvider('to-remove')).toBe(false);
  });

  it('unregisterProvider returns false for unknown provider', () => {
    const removed = registry.unregisterProvider('ghost');
    expect(removed).toBe(false);
  });

  it('unregisterProvider resets default when default is removed', () => {
    registry.registerProvider(makeAdapter('first'));
    registry.registerProvider(makeAdapter('second'));
    registry.unregisterProvider('first');
    expect(registry.getDefault().name).toBe('second');
  });

  it('unregisterProvider sets default to null when last provider removed', () => {
    registry.registerProvider(makeAdapter('only'));
    registry.unregisterProvider('only');
    expect(() => registry.getDefault()).toThrow(ProviderError);
  });

  it('clear removes all providers', () => {
    registry.registerProvider(makeAdapter('a'));
    registry.registerProvider(makeAdapter('b'));
    registry.clear();
    expect(registry.listProviders()).toEqual([]);
    expect(registry.size).toBe(0);
    expect(() => registry.getDefault()).toThrow(ProviderError);
  });

  it('size reflects the number of registered providers', () => {
    expect(registry.size).toBe(0);
    registry.registerProvider(makeAdapter('one'));
    expect(registry.size).toBe(1);
    registry.registerProvider(makeAdapter('two'));
    expect(registry.size).toBe(2);
    registry.unregisterProvider('one');
    expect(registry.size).toBe(1);
  });
});

// ─── Error classes ───────────────────────────────────────────────────────────

describe('Provider error classes', () => {
  it('ProviderError has correct name and providerName', () => {
    const err = new ProviderError('something went wrong', 'my-provider');
    expect(err.name).toBe('ProviderError');
    expect(err.providerName).toBe('my-provider');
    expect(err.message).toBe('something went wrong');
    expect(err instanceof Error).toBe(true);
  });

  it('ProviderNotFoundError has correct name and message', () => {
    const err = new ProviderNotFoundError('ghost-provider');
    expect(err.name).toBe('ProviderNotFoundError');
    expect(err.providerName).toBe('ghost-provider');
    expect(err.message).toContain('ghost-provider');
    expect(err instanceof ProviderError).toBe(true);
  });

  it('ProviderUnavailableError with reason', () => {
    const err = new ProviderUnavailableError('tmux', 'tmux not installed');
    expect(err.name).toBe('ProviderUnavailableError');
    expect(err.message).toContain('tmux not installed');
    expect(err instanceof ProviderError).toBe(true);
  });

  it('ProviderUnavailableError without reason', () => {
    const err = new ProviderUnavailableError('claude');
    expect(err.name).toBe('ProviderUnavailableError');
    expect(err.message).toContain('claude');
    expect(err instanceof ProviderError).toBe(true);
  });
});

// ─── Global singleton ─────────────────────────────────────────────────────────

describe('providerRegistry global singleton', () => {
  it('is a ProviderRegistry instance', () => {
    expect(providerRegistry).toBeInstanceOf(ProviderRegistry);
  });
});

// ─── applyDeckSecretsToEnv ────────────────────────────────────────────────────

import { applyDeckSecretsToEnv } from '../../src/core/provider.js';

describe('applyDeckSecretsToEnv', () => {
  // Save and restore process.env for each test
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Clear relevant keys before each test
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
  });

  afterEach(() => {
    // Restore original env
    process.env['ANTHROPIC_API_KEY'] = savedEnv['ANTHROPIC_API_KEY'];
    process.env['OPENAI_API_KEY'] = savedEnv['OPENAI_API_KEY'];
    process.env['GOOGLE_API_KEY'] = savedEnv['GOOGLE_API_KEY'];
    if (savedEnv['ANTHROPIC_API_KEY'] === undefined) delete process.env['ANTHROPIC_API_KEY'];
    if (savedEnv['OPENAI_API_KEY'] === undefined) delete process.env['OPENAI_API_KEY'];
    if (savedEnv['GOOGLE_API_KEY'] === undefined) delete process.env['GOOGLE_API_KEY'];
  });

  it('returns empty object for empty secrets', () => {
    const overrides = applyDeckSecretsToEnv({});
    expect(overrides).toEqual({});
  });

  it('sets ANTHROPIC_API_KEY from DECKENT_CLAUDE_API_KEY', () => {
    applyDeckSecretsToEnv({ DECKENT_CLAUDE_API_KEY: 'sk-claude-test-key' });
    expect(process.env['ANTHROPIC_API_KEY']).toBe('sk-claude-test-key');
  });

  it('returns claude override with only ANTHROPIC_API_KEY', () => {
    const overrides = applyDeckSecretsToEnv({ DECKENT_CLAUDE_API_KEY: 'sk-claude-123' });
    expect(overrides['claude']).toEqual({ ANTHROPIC_API_KEY: 'sk-claude-123' });
    // Codex and Gemini overrides should NOT be set
    expect(overrides['codex']).toBeUndefined();
    expect(overrides['gemini']).toBeUndefined();
  });

  it('sets OPENAI_API_KEY from DECKENT_OPENAI_API_KEY', () => {
    applyDeckSecretsToEnv({ DECKENT_OPENAI_API_KEY: 'sk-openai-test-key' });
    expect(process.env['OPENAI_API_KEY']).toBe('sk-openai-test-key');
  });

  it('returns codex override with only OPENAI_API_KEY', () => {
    const overrides = applyDeckSecretsToEnv({ DECKENT_OPENAI_API_KEY: 'sk-openai-456' });
    expect(overrides['codex']).toEqual({ OPENAI_API_KEY: 'sk-openai-456' });
    expect(overrides['claude']).toBeUndefined();
    expect(overrides['gemini']).toBeUndefined();
  });

  it('sets GOOGLE_API_KEY from DECKENT_GOOGLE_API_KEY', () => {
    applyDeckSecretsToEnv({ DECKENT_GOOGLE_API_KEY: 'google-test-key' });
    expect(process.env['GOOGLE_API_KEY']).toBe('google-test-key');
  });

  it('returns gemini override with only GOOGLE_API_KEY', () => {
    const overrides = applyDeckSecretsToEnv({ DECKENT_GOOGLE_API_KEY: 'google-789' });
    expect(overrides['gemini']).toEqual({ GOOGLE_API_KEY: 'google-789' });
    expect(overrides['claude']).toBeUndefined();
    expect(overrides['codex']).toBeUndefined();
  });

  it('.deck key takes precedence over existing system env var', () => {
    // Set a system env var first
    process.env['OPENAI_API_KEY'] = 'system-openai-key';
    // .deck should override it
    applyDeckSecretsToEnv({ DECKENT_OPENAI_API_KEY: 'deck-openai-key' });
    expect(process.env['OPENAI_API_KEY']).toBe('deck-openai-key');
  });

  it('.deck key takes precedence for claude provider', () => {
    process.env['ANTHROPIC_API_KEY'] = 'system-anthropic-key';
    applyDeckSecretsToEnv({ DECKENT_CLAUDE_API_KEY: 'deck-anthropic-key' });
    expect(process.env['ANTHROPIC_API_KEY']).toBe('deck-anthropic-key');
  });

  it('.deck key takes precedence for gemini provider', () => {
    process.env['GOOGLE_API_KEY'] = 'system-google-key';
    applyDeckSecretsToEnv({ DECKENT_GOOGLE_API_KEY: 'deck-google-key' });
    expect(process.env['GOOGLE_API_KEY']).toBe('deck-google-key');
  });

  it('skips empty string values — does not overwrite env or add override', () => {
    process.env['OPENAI_API_KEY'] = 'original-key';
    const overrides = applyDeckSecretsToEnv({ DECKENT_OPENAI_API_KEY: '' });
    // Empty string in .deck → skip, env unchanged
    expect(process.env['OPENAI_API_KEY']).toBe('original-key');
    expect(overrides['codex']).toBeUndefined();
  });

  it('sets all three providers when all keys present', () => {
    const overrides = applyDeckSecretsToEnv({
      DECKENT_CLAUDE_API_KEY: 'key-claude',
      DECKENT_OPENAI_API_KEY: 'key-openai',
      DECKENT_GOOGLE_API_KEY: 'key-google',
    });
    expect(overrides['claude']).toEqual({ ANTHROPIC_API_KEY: 'key-claude' });
    expect(overrides['codex']).toEqual({ OPENAI_API_KEY: 'key-openai' });
    expect(overrides['gemini']).toEqual({ GOOGLE_API_KEY: 'key-google' });
    expect(process.env['ANTHROPIC_API_KEY']).toBe('key-claude');
    expect(process.env['OPENAI_API_KEY']).toBe('key-openai');
    expect(process.env['GOOGLE_API_KEY']).toBe('key-google');
  });

  it('ignores unknown .deck keys — does not affect env or overrides', () => {
    const overrides = applyDeckSecretsToEnv({
      DECKENT_SMTP_HOST: 'smtp.example.com',
      DECKENT_WEBHOOK_URL: 'https://example.com/hook',
    });
    // No env vars set, no overrides returned
    expect(overrides).toEqual({});
    expect(process.env['DECKENT_SMTP_HOST']).toBeUndefined();
  });

  it('worker receives only needed key — codex override has only OPENAI_API_KEY', () => {
    const overrides = applyDeckSecretsToEnv({
      DECKENT_CLAUDE_API_KEY: 'claude-key',
      DECKENT_OPENAI_API_KEY: 'openai-key',
      DECKENT_GOOGLE_API_KEY: 'google-key',
      DECKENT_SMTP_HOST: 'smtp.host',
    });
    // Each provider override contains only its own key
    expect(Object.keys(overrides['codex']!)).toEqual(['OPENAI_API_KEY']);
    expect(Object.keys(overrides['claude']!)).toEqual(['ANTHROPIC_API_KEY']);
    expect(Object.keys(overrides['gemini']!)).toEqual(['GOOGLE_API_KEY']);
  });
});

// ─── BootstrapResult + Connector integration ─────────────────────────────────

import { Connector } from '../../src/orchestra/connector.js';
import type { BootstrapResult } from '../../src/core/provider.js';

describe('BootstrapResult Connector contract', () => {
  it('BootstrapResult connector field accepts Connector instance', () => {
    const connector = new Connector();
    const result: BootstrapResult = {
      connector,
      registered: [],
      skipped: [],
      defaultProvider: null,
      providerEnvOverrides: {},
    };
    expect(result.connector).toBeInstanceOf(Connector);
  });

  it('Connector registered via bootstrap mirrors registry providers', () => {
    const registry = new ProviderRegistry();
    const adapter = makeAdapter('claude');
    registry.registerProvider(adapter);

    const connector = new Connector();
    for (const name of registry.listProviders()) {
      connector.registerProvider(name as any, registry.getProvider(name));
    }

    expect(connector.isProviderReady('claude' as any)).toBe(true);
    expect(connector.getProvider('claude' as any)).toBe(adapter);
  });

  it('Connector getAvailableProviders returns same names as registry.listProviders', () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(makeAdapter('claude'));
    registry.registerProvider(makeAdapter('codex'));

    const connector = new Connector();
    for (const name of registry.listProviders()) {
      connector.registerProvider(name as any, registry.getProvider(name));
    }

    expect(connector.getAvailableProviders().sort()).toEqual(registry.listProviders().sort());
  });

  it('Connector health check does not throw for available providers', async () => {
    const connector = new Connector();
    const adapter = makeAdapter('claude');
    connector.registerProvider('claude' as any, adapter);

    const results = await connector.healthCheck();
    expect(results).toHaveLength(1);
    expect(results[0]!.provider).toBe('claude');
    expect(results[0]!.available).toBe(true);
  });

  it('Connector health check returns available=false for unavailable providers', async () => {
    const connector = new Connector();
    const adapter = makeAdapter('codex');
    (adapter.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    connector.registerProvider('codex' as any, adapter);

    const results = await connector.healthCheck();
    expect(results[0]!.available).toBe(false);
  });

  it('BootstrapResult providerEnvOverrides only contains provider-specific keys', () => {
    const result: BootstrapResult = {
      connector: new Connector(),
      registered: ['claude', 'codex'],
      skipped: [],
      defaultProvider: 'claude',
      providerEnvOverrides: {
        claude: { ANTHROPIC_API_KEY: 'key1' },
        codex: { OPENAI_API_KEY: 'key2' },
      },
    };

    expect(Object.keys(result.providerEnvOverrides['claude']!)).toHaveLength(1);
    expect(Object.keys(result.providerEnvOverrides['codex']!)).toHaveLength(1);
  });
});
