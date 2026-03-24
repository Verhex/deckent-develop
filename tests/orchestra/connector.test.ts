import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connector } from '../../src/orchestra/connector.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type { ProviderName } from '../../src/core/task-types.js';

/** Create a mock ProviderAdapter with sensible defaults */
function createMockAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    name: 'mock-adapter',
    supportedModels: ['opus', 'sonnet', 'haiku'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn(() => []),
    checkUsage: vi.fn(async () => ({ totalCost: 0, remaining: 100, percentUsed: 0 })),
    isAvailable: vi.fn(async () => true),
    buildCommand: vi.fn(() => 'mock-command'),
    ...overrides,
  } as unknown as ProviderAdapter;
}

describe('Connector', () => {
  let connector: Connector;

  beforeEach(() => {
    connector = new Connector();
  });

  // ─── registerProvider / getProvider ────────────────────────────────

  it('should register and retrieve a provider', () => {
    const adapter = createMockAdapter();
    connector.registerProvider('claude', adapter);
    expect(connector.getProvider('claude')).toBe(adapter);
  });

  it('should return null for unregistered provider', () => {
    expect(connector.getProvider('codex')).toBeNull();
  });

  it('should overwrite a previously registered provider', () => {
    const first = createMockAdapter({ name: 'first' });
    const second = createMockAdapter({ name: 'second' });
    connector.registerProvider('claude', first);
    connector.registerProvider('claude', second);
    expect(connector.getProvider('claude')).toBe(second);
  });

  // ─── isProviderReady ──────────────────────────────────────────────

  it('should return true for registered provider', () => {
    connector.registerProvider('gemini', createMockAdapter());
    expect(connector.isProviderReady('gemini')).toBe(true);
  });

  it('should return false for unregistered provider', () => {
    expect(connector.isProviderReady('codex')).toBe(false);
  });

  // ─── getAvailableProviders ────────────────────────────────────────

  it('should return empty array when no providers registered', () => {
    expect(connector.getAvailableProviders()).toEqual([]);
  });

  it('should return all registered provider names', () => {
    connector.registerProvider('claude', createMockAdapter());
    connector.registerProvider('codex', createMockAdapter());
    const available = connector.getAvailableProviders();
    expect(available).toContain('claude');
    expect(available).toContain('codex');
    expect(available).toHaveLength(2);
  });

  // ─── healthCheck ──────────────────────────────────────────────────

  it('should detect available provider in health check', async () => {
    const adapter = createMockAdapter({ isAvailable: vi.fn(async () => true) });
    connector.registerProvider('claude', adapter);
    const results = await connector.healthCheck('claude');
    expect(results).toHaveLength(1);
    expect(results[0]!.provider).toBe('claude');
    expect(results[0]!.available).toBe(true);
    expect(results[0]!.authStatus).toBe('ok'); // claude uses session auth
    expect(results[0]!.error).toBeNull();
  });

  it('should detect unavailable provider in health check', async () => {
    const adapter = createMockAdapter({ isAvailable: vi.fn(async () => false) });
    connector.registerProvider('codex', adapter);
    const results = await connector.healthCheck('codex');
    expect(results).toHaveLength(1);
    expect(results[0]!.available).toBe(false);
  });

  it('should report error when isAvailable throws', async () => {
    const adapter = createMockAdapter({
      isAvailable: vi.fn(async () => { throw new Error('connection refused'); }),
    });
    connector.registerProvider('gemini', adapter);
    const results = await connector.healthCheck('gemini');
    expect(results).toHaveLength(1);
    expect(results[0]!.available).toBe(false);
    expect(results[0]!.error).toBe('connection refused');
  });

  it('should report missing auth for codex without OPENAI_API_KEY', async () => {
    const original = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];

    const adapter = createMockAdapter({ isAvailable: vi.fn(async () => true) });
    connector.registerProvider('codex', adapter);
    const results = await connector.healthCheck('codex');
    expect(results[0]!.authStatus).toBe('missing');

    // Restore
    if (original !== undefined) process.env['OPENAI_API_KEY'] = original;
  });

  it('should report ok auth for codex with OPENAI_API_KEY set', async () => {
    const original = process.env['OPENAI_API_KEY'];
    process.env['OPENAI_API_KEY'] = 'sk-test-key';

    const adapter = createMockAdapter({ isAvailable: vi.fn(async () => true) });
    connector.registerProvider('codex', adapter);
    const results = await connector.healthCheck('codex');
    expect(results[0]!.authStatus).toBe('ok');

    // Restore
    if (original !== undefined) {
      process.env['OPENAI_API_KEY'] = original;
    } else {
      delete process.env['OPENAI_API_KEY'];
    }
  });

  it('should report missing auth for gemini without GOOGLE_API_KEY', async () => {
    const original = process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];

    const adapter = createMockAdapter({ isAvailable: vi.fn(async () => true) });
    connector.registerProvider('gemini', adapter);
    const results = await connector.healthCheck('gemini');
    expect(results[0]!.authStatus).toBe('missing');

    if (original !== undefined) process.env['GOOGLE_API_KEY'] = original;
  });

  it('should health check all registered providers when no name given', async () => {
    connector.registerProvider('claude', createMockAdapter());
    connector.registerProvider('codex', createMockAdapter());
    connector.registerProvider('gemini', createMockAdapter());
    const results = await connector.healthCheck();
    expect(results).toHaveLength(3);
    const names = results.map(r => r.provider);
    expect(names).toContain('claude');
    expect(names).toContain('codex');
    expect(names).toContain('gemini');
  });

  it('should return error result for health check on unregistered provider', async () => {
    const results = await connector.healthCheck('codex');
    expect(results).toHaveLength(1);
    expect(results[0]!.available).toBe(false);
    expect(results[0]!.error).toContain('not registered');
  });

  // ─── Multiple providers simultaneously ────────────────────────────

  it('should handle multiple providers registered simultaneously', () => {
    const claude = createMockAdapter({ name: 'claude-tmux' });
    const codex = createMockAdapter({ name: 'codex-cli' });
    const gemini = createMockAdapter({ name: 'gemini-api' });

    connector.registerProvider('claude', claude);
    connector.registerProvider('codex', codex);
    connector.registerProvider('gemini', gemini);

    expect(connector.size).toBe(3);
    expect(connector.getProvider('claude')).toBe(claude);
    expect(connector.getProvider('codex')).toBe(codex);
    expect(connector.getProvider('gemini')).toBe(gemini);
  });

  // ─── unregisterProvider ───────────────────────────────────────────

  it('should unregister a provider', () => {
    connector.registerProvider('claude', createMockAdapter());
    expect(connector.unregisterProvider('claude')).toBe(true);
    expect(connector.getProvider('claude')).toBeNull();
    expect(connector.isProviderReady('claude')).toBe(false);
  });

  it('should return false when unregistering non-existent provider', () => {
    expect(connector.unregisterProvider('codex')).toBe(false);
  });

  // ─── clear ────────────────────────────────────────────────────────

  it('should clear all providers', () => {
    connector.registerProvider('claude', createMockAdapter());
    connector.registerProvider('codex', createMockAdapter());
    connector.clear();
    expect(connector.size).toBe(0);
    expect(connector.getAvailableProviders()).toEqual([]);
  });

  // ─── size ─────────────────────────────────────────────────────────

  it('should track provider count via size', () => {
    expect(connector.size).toBe(0);
    connector.registerProvider('claude', createMockAdapter());
    expect(connector.size).toBe(1);
    connector.registerProvider('codex', createMockAdapter());
    expect(connector.size).toBe(2);
  });
});
