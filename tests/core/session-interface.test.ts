import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connector } from '../../src/core/session-interface.js';
import type { HealthCheckResult } from '../../src/core/session-interface.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type { ProviderName } from '../../src/core/task-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    name: 'mock-adapter',
    supportedModels: ['opus', 'sonnet', 'haiku'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
    buildCommand: vi.fn(() => 'mock-command'),
    ...overrides,
  } as unknown as ProviderAdapter;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Connector (core/session-interface)', () => {
  let connector: Connector;

  beforeEach(() => {
    connector = new Connector();
  });

  // ─── Module location ────────────────────────────────────────────────

  it('should be importable from core/session-interface', () => {
    expect(Connector).toBeDefined();
    expect(typeof Connector).toBe('function');
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
    expect(results[0]!.authStatus).toBe('ok');
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

  it('should health check all providers when no name given', async () => {
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

  it('should return error result for unregistered provider health check', async () => {
    const results = await connector.healthCheck('codex');
    expect(results).toHaveLength(1);
    expect(results[0]!.available).toBe(false);
    expect(results[0]!.error).toContain('not registered');
  });

  // ─── Auth status ──────────────────────────────────────────────────

  it('should report missing auth for codex without OPENAI_API_KEY', async () => {
    const original = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];

    const adapter = createMockAdapter({ isAvailable: vi.fn(async () => true) });
    connector.registerProvider('codex', adapter);
    const results = await connector.healthCheck('codex');
    expect(results[0]!.authStatus).toBe('missing');

    if (original !== undefined) process.env['OPENAI_API_KEY'] = original;
  });

  it('should report ok auth for gemini with GOOGLE_API_KEY set', async () => {
    const original = process.env['GOOGLE_API_KEY'];
    process.env['GOOGLE_API_KEY'] = 'test-key-123';

    const adapter = createMockAdapter({ isAvailable: vi.fn(async () => true) });
    connector.registerProvider('gemini', adapter);
    const results = await connector.healthCheck('gemini');
    expect(results[0]!.authStatus).toBe('ok');

    if (original !== undefined) {
      process.env['GOOGLE_API_KEY'] = original;
    } else {
      delete process.env['GOOGLE_API_KEY'];
    }
  });

  // ─── unregisterProvider ───────────────────────────────────────────

  it('should unregister a provider and return true', () => {
    connector.registerProvider('claude', createMockAdapter());
    expect(connector.unregisterProvider('claude')).toBe(true);
    expect(connector.getProvider('claude')).toBeNull();
  });

  it('should return false when unregistering non-existent provider', () => {
    expect(connector.unregisterProvider('codex')).toBe(false);
  });

  // ─── clear / size ────────────────────────────────────────────────

  it('should clear all providers', () => {
    connector.registerProvider('claude', createMockAdapter());
    connector.registerProvider('codex', createMockAdapter());
    connector.clear();
    expect(connector.size).toBe(0);
    expect(connector.getAvailableProviders()).toEqual([]);
  });

  it('should track provider count via size', () => {
    expect(connector.size).toBe(0);
    connector.registerProvider('claude', createMockAdapter());
    expect(connector.size).toBe(1);
    connector.registerProvider('codex', createMockAdapter());
    expect(connector.size).toBe(2);
  });

  // ─── HealthCheckResult type shape ────────────────────────────────

  it('should produce HealthCheckResult with all required fields', async () => {
    connector.registerProvider('claude', createMockAdapter());
    const [result] = await connector.healthCheck('claude');
    const fields: (keyof HealthCheckResult)[] = ['provider', 'available', 'authStatus', 'cliVersion', 'error'];
    for (const field of fields) {
      expect(result).toHaveProperty(field);
    }
  });

  // ─── Re-export backward compatibility ────────────────────────────

  it('should be importable from orchestra/connector (re-export)', async () => {
    const orchestraModule = await import('../../src/orchestra/connector.js');
    expect(orchestraModule.Connector).toBe(Connector);
  });
});
