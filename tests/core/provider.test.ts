import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProviderRegistry,
  ProviderError,
  ProviderNotFoundError,
  ProviderUnavailableError,
  providerRegistry,
} from '../../src/core/provider.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';

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
    buildCommand: vi.fn().mockReturnValue(`claude -p ${name}`),
  };
}

// ─── ProviderAdapter interface shape ─────────────────────────────────────────

describe('ProviderAdapter interface', () => {
  it('should define required properties', () => {
    const adapter = makeAdapter('test-provider');
    expect(typeof adapter.name).toBe('string');
    expect(Array.isArray(adapter.supportedModels)).toBe(true);
    expect(typeof adapter.spawn).toBe('function');
    expect(typeof adapter.kill).toBe('function');
    expect(typeof adapter.listWorkers).toBe('function');
    expect(typeof adapter.checkUsage).toBe('function');
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

  it('checkUsage should return a promise resolving to UsageMetrics shape', async () => {
    const adapter = makeAdapter('usage-test');
    const metrics = await adapter.checkUsage();
    expect(typeof metrics.fiveHourPercent).toBe('number');
    expect(typeof metrics.weeklyPercent).toBe('number');
    expect(typeof metrics.measuredAt).toBe('string');
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
