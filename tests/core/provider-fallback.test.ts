import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProviderRegistry,
  ProviderUnavailableError,
  resolveProviderWithFallback,
} from '../../src/core/provider.js';
import type { FallbackResult, ProviderAdapter } from '../../src/core/provider.js';
import type { ModelType, ProviderName } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdapter(
  name: string,
  opts: { available?: boolean; models?: ModelType[] } = {},
): ProviderAdapter {
  const { available = true, models = ['opus', 'sonnet', 'haiku'] } = opts;
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    checkUsage: vi.fn().mockResolvedValue({
      fiveHourPercent: 10,
      weeklyPercent: 5,
      measuredAt: new Date().toISOString(),
    }),
    isAvailable: vi.fn().mockResolvedValue(available),
    buildCommand: vi.fn().mockReturnValue(`${name} -p`),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('resolveProviderWithFallback', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  // --- Primary provider available ---

  it('returns primary provider when it is available', async () => {
    registry.registerProvider(makeAdapter('claude'));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'opus' as ModelType,
      {},
      registry,
    );

    expect(result.provider).toBe('claude');
    expect(result.model).toBe('opus');
    expect(result.wasOriginal).toBe(true);
    expect(result.reason).toContain('available');
  });

  it('returns original model unchanged when primary is available', async () => {
    registry.registerProvider(makeAdapter('claude'));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'sonnet' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    expect(result.model).toBe('sonnet');
    expect(result.wasOriginal).toBe(true);
  });

  // --- Primary unavailable + fallback available ---

  it('falls back when primary is unavailable', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'opus' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    expect(result.provider).toBe('codex');
    expect(result.wasOriginal).toBe(false);
    expect(result.reason).toContain('fallback');
  });

  it('remaps model via getEquivalentModel on fallback', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'opus' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    // opus (premium tier on claude) -> gpt-4.1 (premium tier on codex)
    expect(result.model).toBe('gpt-4.1');
  });

  it('remaps standard-tier model correctly on fallback', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'sonnet' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    // sonnet (standard tier on claude) -> o3 (standard tier on codex)
    expect(result.model).toBe('o3');
  });

  it('remaps economy-tier model correctly on fallback', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'haiku' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    // haiku (economy tier on claude) -> o4-mini (economy tier on codex)
    expect(result.model).toBe('o4-mini');
  });

  // --- Primary unavailable + no fallback configured ---

  it('throws when primary unavailable and no fallback configured', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));

    await expect(
      resolveProviderWithFallback(
        'claude' as ProviderName,
        'opus' as ModelType,
        {},
        registry,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('error message mentions no fallback_provider configured', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));

    await expect(
      resolveProviderWithFallback(
        'claude' as ProviderName,
        'opus' as ModelType,
        {},
        registry,
      ),
    ).rejects.toThrow(/no fallback_provider/i);
  });

  // --- Primary not registered ---

  it('falls back when primary is not registered at all', async () => {
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'opus' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    expect(result.provider).toBe('codex');
    expect(result.wasOriginal).toBe(false);
  });

  // --- Both providers unavailable ---

  it('throws when both primary and fallback are unavailable', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: false, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    await expect(
      resolveProviderWithFallback(
        'claude' as ProviderName,
        'opus' as ModelType,
        { fallback_provider: 'codex' as ProviderName },
        registry,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('error mentions both providers when both unavailable', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: false, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    await expect(
      resolveProviderWithFallback(
        'claude' as ProviderName,
        'opus' as ModelType,
        { fallback_provider: 'codex' as ProviderName },
        registry,
      ),
    ).rejects.toThrow(/both.*unavailable/i);
  });

  // --- Fallback not registered ---

  it('throws when fallback provider is not registered', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));

    await expect(
      resolveProviderWithFallback(
        'claude' as ProviderName,
        'opus' as ModelType,
        { fallback_provider: 'gemini' as ProviderName },
        registry,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('error mentions fallback not registered', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));

    await expect(
      resolveProviderWithFallback(
        'claude' as ProviderName,
        'opus' as ModelType,
        { fallback_provider: 'gemini' as ProviderName },
        registry,
      ),
    ).rejects.toThrow(/not registered/i);
  });

  // --- FallbackResult shape ---

  it('returns correct FallbackResult shape for primary', async () => {
    registry.registerProvider(makeAdapter('claude'));

    const result: FallbackResult = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'opus' as ModelType,
      {},
      registry,
    );

    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('wasOriginal');
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('returns correct FallbackResult shape for fallback', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result: FallbackResult = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'opus' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('wasOriginal');
    expect(result.reason).toContain('codex');
  });

  // --- Does not call isAvailable on fallback if primary succeeds ---

  it('does not check fallback availability when primary is available', async () => {
    const claudeAdapter = makeAdapter('claude', { available: true });
    const codexAdapter = makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] });
    registry.registerProvider(claudeAdapter);
    registry.registerProvider(codexAdapter);

    await resolveProviderWithFallback(
      'claude' as ProviderName,
      'opus' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    expect(codexAdapter.isAvailable).not.toHaveBeenCalled();
  });
});
