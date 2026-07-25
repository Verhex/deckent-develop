import { describe, it, expect } from 'vitest';

import {
  MockFleetRegistry,
  createFleetAdapters,
  createFleetRegistry,
  routeFleetTask,
  resolveFleetOverflow,
  runFleetSmoke,
} from '../../scripts/multi-provider-fleet-smoke.mjs';

// ─── MockFleetRegistry ────────────────────────────────────────────────────────

describe('multi-provider-fleet-smoke — MockFleetRegistry', () => {
  it('registers 8 fleet providers and lists them', () => {
    const registry = createFleetRegistry();
    const providers = registry.list();
    const expected = ['claude', 'gemini', 'codex', 'deepseek', 'qwen', 'glm', 'mistral', 'ollama'];
    for (const name of expected) {
      expect(providers).toContain(name);
    }
    expect(providers).toHaveLength(8);
  });

  it('default provider is claude (first registered subscription)', () => {
    const registry = createFleetRegistry();
    expect(registry.getDefault()?.name).toBe('claude');
  });

  it('listByType returns subscription providers', () => {
    const registry = createFleetRegistry();
    const subs = registry.listByType('subscription');
    const names = subs.map((a: { name: string }) => a.name);
    expect(names).toContain('claude');
    expect(names).toContain('gemini');
    expect(names).toContain('codex');
    expect(names).toHaveLength(3);
  });

  it('listByType returns api providers', () => {
    const registry = createFleetRegistry();
    const apis = registry.listByType('api');
    const names = apis.map((a: { name: string }) => a.name);
    expect(names).toContain('deepseek');
    expect(names).toContain('qwen');
    expect(names).toContain('glm');
    expect(names).toContain('mistral');
    expect(names).toHaveLength(4);
  });

  it('listByType returns local providers', () => {
    const registry = createFleetRegistry();
    const local = registry.listByType('local');
    const names = local.map((a: { name: string }) => a.name);
    expect(names).toContain('ollama');
    expect(names).toHaveLength(1);
  });

  it('throws on duplicate registration', () => {
    const registry = new MockFleetRegistry();
    registry.register({ name: 'claude', authMode: 'session', providerType: 'subscription' });
    expect(() =>
      registry.register({ name: 'claude', authMode: 'session', providerType: 'subscription' }),
    ).toThrow('Provider already registered: claude');
  });

  it('empty registry getDefault returns null', () => {
    const registry = new MockFleetRegistry();
    expect(registry.getDefault()).toBeNull();
  });
});

// ─── createFleetAdapters ──────────────────────────────────────────────────────

describe('multi-provider-fleet-smoke — createFleetAdapters', () => {
  it('returns all 8 adapters with correct authMode', () => {
    const adapters = createFleetAdapters();
    expect(adapters.claude.authMode).toBe('session');
    expect(adapters.gemini.authMode).toBe('session');
    expect(adapters.codex.authMode).toBe('session');
    expect(adapters.deepseek.authMode).toBe('api');
    expect(adapters.qwen.authMode).toBe('api');
    expect(adapters.glm.authMode).toBe('api');
    expect(adapters.mistral.authMode).toBe('api');
    expect(adapters.ollama.authMode).toBe('none');
  });

  it('does not mint a second model catalog inside a provider-routing smoke', () => {
    const adapters = createFleetAdapters();
    for (const adapter of Object.values(adapters)) {
      expect(adapter).not.toHaveProperty('models');
    }
  });
});

// ─── routeFleetTask — per-task selection ─────────────────────────────────────

describe('multi-provider-fleet-smoke — per-task provider selection', () => {
  it('routes each of the 8 providers to the correct adapter', () => {
    const registry = createFleetRegistry();
    const names = ['claude', 'gemini', 'codex', 'deepseek', 'qwen', 'glm', 'mistral', 'ollama'];
    for (const name of names) {
      const result = routeFleetTask({ provider: name }, registry);
      expect(result.adapter.name).toBe(name);
    }
  });

  it('rejects an explicit unknown provider instead of selecting the default', () => {
    const registry = createFleetRegistry();
    expect(() => routeFleetTask({ provider: 'unknown-xyz' }, registry))
      .toThrow("Unknown task.provider 'unknown-xyz'");
  });

  it('no task.provider uses default (claude)', () => {
    const registry = createFleetRegistry();
    const result = routeFleetTask({}, registry);
    expect(result.adapter.name).toBe('claude');
    expect(result.reason).toContain('default');
  });

  it('throws when registry is empty', () => {
    const registry = new MockFleetRegistry();
    expect(() => routeFleetTask({}, registry)).toThrow('No providers registered');
  });
});

// ─── mix coexist ─────────────────────────────────────────────────────────────

describe('multi-provider-fleet-smoke — mix coexist', () => {
  it('concurrent routing to 8 providers resolves each correctly', () => {
    const registry = createFleetRegistry();
    const tasks = [
      { id: 't1', provider: 'claude' },
      { id: 't2', provider: 'deepseek' },
      { id: 't3', provider: 'ollama' },
      { id: 't4', provider: 'gemini' },
      { id: 't5', provider: 'qwen' },
      { id: 't6', provider: 'codex' },
      { id: 't7', provider: 'glm' },
      { id: 't8', provider: 'mistral' },
    ];
    const results = tasks.map((t) => routeFleetTask(t, registry));
    expect(results[0].adapter.name).toBe('claude');
    expect(results[1].adapter.name).toBe('deepseek');
    expect(results[2].adapter.name).toBe('ollama');
    expect(results[3].adapter.name).toBe('gemini');
    expect(results[4].adapter.name).toBe('qwen');
    expect(results[5].adapter.name).toBe('codex');
    expect(results[6].adapter.name).toBe('glm');
    expect(results[7].adapter.name).toBe('mistral');
  });

  it('registry remains intact after many routing calls', () => {
    const registry = createFleetRegistry();
    for (let i = 0; i < 20; i++) {
      routeFleetTask({ provider: 'claude' }, registry);
      routeFleetTask({ provider: 'deepseek' }, registry);
      routeFleetTask({ provider: 'ollama' }, registry);
    }
    expect(registry.list()).toHaveLength(8);
    expect(registry.getDefault()?.name).toBe('claude');
  });

  it('tasks with no provider all route to claude default', () => {
    const registry = createFleetRegistry();
    for (let i = 0; i < 5; i++) {
      const result = routeFleetTask({}, registry);
      expect(result.adapter.name).toBe('claude');
    }
  });
});

// ─── overflow trigger ─────────────────────────────────────────────────────────

describe('multi-provider-fleet-smoke — overflow trigger', () => {
  it('no overflow when quota not exhausted', () => {
    const registry = createFleetRegistry();
    const task = { provider: 'claude', authMode: 'session', rateLimitExhausted: false };
    const result = resolveFleetOverflow(task, registry);
    expect(result.overflowed).toBe(false);
    expect(result.reason).toBe('no_signal');
    expect(result.task).toStrictEqual(task);
  });

  it('overflows to API provider when subscription quota exhausted', () => {
    const registry = createFleetRegistry();
    const task = { provider: 'claude', authMode: 'session', rateLimitExhausted: true };
    const result = resolveFleetOverflow(task, registry);
    expect(result.overflowed).toBe(true);
    expect(result.reason).toBe('overflow');
    expect(['deepseek', 'qwen', 'glm', 'mistral']).toContain(result.fallbackProvider);
    expect(result.task.authMode).toBe('api');
    expect(result.task.rateLimitExhausted).toBe(false);
  });

  it('already_api task is not overflowed', () => {
    const registry = createFleetRegistry();
    const task = { provider: 'deepseek', authMode: 'api', rateLimitExhausted: true };
    const result = resolveFleetOverflow(task, registry);
    expect(result.overflowed).toBe(false);
    expect(result.reason).toBe('already_api');
  });

  it('local provider (ollama) is not overflowed', () => {
    const registry = createFleetRegistry();
    const task = { provider: 'ollama', authMode: 'none', rateLimitExhausted: true };
    const result = resolveFleetOverflow(task, registry);
    expect(result.overflowed).toBe(false);
    expect(result.reason).toBe('already_api');
  });

  it('no_equivalent when registry has no API providers', () => {
    const registry = new MockFleetRegistry();
    registry.register({ name: 'claude', authMode: 'session', providerType: 'subscription' });
    const task = { provider: 'claude', authMode: 'session', rateLimitExhausted: true };
    const result = resolveFleetOverflow(task, registry);
    expect(result.overflowed).toBe(false);
    expect(result.reason).toBe('no_equivalent');
  });
});

// ─── runFleetSmoke integration ────────────────────────────────────────────────

describe('multi-provider-fleet-smoke — runFleetSmoke', () => {
  it('passes all 4 scenarios', async () => {
    const result = await runFleetSmoke();
    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.scenarios.filter((s: string) => s.startsWith('PASS'))).toHaveLength(4);
    expect(result.scenarios.filter((s: string) => s.startsWith('FAIL'))).toHaveLength(0);
  });

  it('scenarios include expected labels', async () => {
    const result = await runFleetSmoke();
    const names = result.scenarios.map((s: string) => s.replace(/^(PASS|FAIL) /, ''));
    expect(names).toContain('eight-providers-registered');
    expect(names).toContain('per-task-provider-selection');
    expect(names).toContain('mix-coexist');
    expect(names).toContain('overflow-trigger');
  });
});
