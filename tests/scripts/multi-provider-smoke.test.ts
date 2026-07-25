import { describe, it, expect } from 'vitest';

// Dynamic import — smoke script is ESM (.mjs), no TypeScript compilation.
import {
  MockProviderRegistry,
  createMockAdapters,
  createMockRegistry,
  routeTaskToProvider,
  runSmoke,
} from '../../scripts/multi-provider-smoke.mjs';

// ─── MockProviderRegistry ────────────────────────────────────────────────────

describe('multi-provider-smoke — MockProviderRegistry', () => {
  it('registers providers and lists them', () => {
    const registry = new MockProviderRegistry();
    registry.register({ name: 'claude' });
    registry.register({ name: 'ollama' });
    expect(registry.list()).toContain('claude');
    expect(registry.list()).toContain('ollama');
    expect(registry.list()).toHaveLength(2);
  });

  it('first registered provider becomes default', () => {
    const registry = new MockProviderRegistry();
    registry.register({ name: 'claude' });
    registry.register({ name: 'ollama' });
    expect(registry.getDefault()?.name).toBe('claude');
  });

  it('setDefault=true overrides default', () => {
    const registry = new MockProviderRegistry();
    registry.register({ name: 'claude' });
    registry.register({ name: 'ollama' }, true);
    expect(registry.getDefault()?.name).toBe('ollama');
  });

  it('has() returns true for registered, false for unknown', () => {
    const registry = new MockProviderRegistry();
    registry.register({ name: 'claude' });
    expect(registry.has('claude')).toBe(true);
    expect(registry.has('unknown-xyz')).toBe(false);
  });

  it('throws on duplicate registration', () => {
    const registry = new MockProviderRegistry();
    registry.register({ name: 'claude' });
    expect(() => registry.register({ name: 'claude' })).toThrow(
      'Provider already registered: claude',
    );
  });

  it('empty registry getDefault returns null', () => {
    const registry = new MockProviderRegistry();
    expect(registry.getDefault()).toBeNull();
  });
});

// ─── createMockRegistry ──────────────────────────────────────────────────────

describe('multi-provider-smoke — createMockRegistry', () => {
  it('3 providers registered — claude, ollama, openai-compat', () => {
    const registry = createMockRegistry();
    const providers = registry.list();
    expect(providers).toContain('claude');
    expect(providers).toContain('ollama');
    expect(providers).toContain('openai-compat');
    expect(providers).toHaveLength(3);
  });

  it('default provider is claude (registered first)', () => {
    const registry = createMockRegistry();
    expect(registry.getDefault()?.name).toBe('claude');
  });
});

// ─── routeTaskToProvider ─────────────────────────────────────────────────────

describe('multi-provider-smoke — routeTaskToProvider', () => {
  it('routes to declared provider when registered', () => {
    const registry = createMockRegistry();
    const result = routeTaskToProvider({ provider: 'ollama' }, registry);
    expect(result.adapter.name).toBe('ollama');
    expect(result.reason).toContain('ollama');
  });

  it('routes openai-compat task to openai-compat adapter', () => {
    const registry = createMockRegistry();
    const result = routeTaskToProvider({ provider: 'openai-compat' }, registry);
    expect(result.adapter.name).toBe('openai-compat');
  });

  it('rejects an explicit unknown provider instead of selecting the default', () => {
    const registry = createMockRegistry();
    expect(() => routeTaskToProvider({ provider: 'unknown-xyz' }, registry))
      .toThrow("Unknown task.provider 'unknown-xyz'");
  });

  it('no task.provider uses default (claude)', () => {
    const registry = createMockRegistry();
    const result = routeTaskToProvider({}, registry);
    expect(result.adapter.name).toBe('claude');
    expect(result.reason).toContain('default');
  });

  it('throws when registry is empty', () => {
    const registry = new MockProviderRegistry();
    expect(() => routeTaskToProvider({}, registry)).toThrow('No providers registered');
  });
});

// ─── mix coexist ─────────────────────────────────────────────────────────────

describe('multi-provider-smoke — mix coexist', () => {
  it('concurrent routing to 3 providers resolves each correctly', () => {
    const registry = createMockRegistry();
    const tasks = [
      { id: 't1', provider: 'claude' },
      { id: 't2', provider: 'ollama' },
      { id: 't3', provider: 'openai-compat' },
    ];
    const results = tasks.map((t) => routeTaskToProvider(t, registry));
    expect(results[0].adapter.name).toBe('claude');
    expect(results[1].adapter.name).toBe('ollama');
    expect(results[2].adapter.name).toBe('openai-compat');
  });

  it('registry remains intact after multiple routing calls', () => {
    const registry = createMockRegistry();
    for (let i = 0; i < 10; i++) {
      routeTaskToProvider({ provider: 'claude' }, registry);
      routeTaskToProvider({ provider: 'ollama' }, registry);
    }
    expect(registry.list()).toHaveLength(3);
    expect(registry.getDefault()?.name).toBe('claude');
  });
});

// ─── createMockAdapters ───────────────────────────────────────────────────────

describe('multi-provider-smoke — createMockAdapters', () => {
  it('does not mint a second model catalog inside a provider-routing smoke', () => {
    const adapters = createMockAdapters();
    for (const adapter of Object.values(adapters)) {
      expect(adapter).toEqual({ name: adapter.name });
      expect(adapter).not.toHaveProperty('models');
    }
  });
});

// ─── runSmoke integration ────────────────────────────────────────────────────

describe('multi-provider-smoke — runSmoke', () => {
  it('runSmoke passes all 4 scenarios', async () => {
    const result = await runSmoke();
    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.scenarios.filter((s: string) => s.startsWith('PASS'))).toHaveLength(4);
    expect(result.scenarios.filter((s: string) => s.startsWith('FAIL'))).toHaveLength(0);
  });

  it('runSmoke scenarios include expected labels', async () => {
    const result = await runSmoke();
    const scenarioNames = result.scenarios.map((s: string) => s.replace(/^(PASS|FAIL) /, ''));
    expect(scenarioNames).toContain('three-providers-registered');
    expect(scenarioNames).toContain('per-task-provider-selection');
    expect(scenarioNames).toContain('unknown-provider-rejected');
    expect(scenarioNames).toContain('mix-coexist');
  });
});
