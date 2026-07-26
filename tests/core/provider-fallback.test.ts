import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProviderRegistry,
  ProviderUnavailableError,
  resolveProviderWithFallback,
  orderedRoleProviders,
} from '../../src/core/provider.js';
import type { FallbackResult, ProviderAdapter } from '../../src/core/provider.js';
import type { ModelType, ProviderName } from '../../src/core/types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdapter(
  name: string,
  opts: { available?: boolean; models?: ModelType[] } = {},
): ProviderAdapter {
  const { available = true, models = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'] } = opts;
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
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
      'claude-opus-4-8' as ModelType,
      {},
      registry,
    );

    expect(result.provider).toBe('claude');
    expect(result.model).toBe('claude-opus-4-8');
    expect(result.wasOriginal).toBe(true);
    expect(result.reason).toContain('available');
  });

  it('returns original model unchanged when primary is available', async () => {
    registry.registerProvider(makeAdapter('claude'));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'claude-sonnet-5' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    expect(result.model).toBe('claude-sonnet-5');
    expect(result.wasOriginal).toBe(true);
  });

  // --- Primary unavailable + fallback available ---

  it('falls back when primary is unavailable', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'claude-opus-4-8' as ModelType,
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
      'claude-opus-4-8' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    // opus (premium on claude) -> the DESIGNATED codex premium model.
    // MASTER-PLAN 670 (owner-approved 2026-07-26): the tier names its current
    // generation instead of returning whichever GA model registered first.
    expect(result.model).toBe('gpt-5.6-sol');
  });

  it('remaps standard-tier model correctly on fallback', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'claude-sonnet-5' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    // sonnet (standard on claude) -> designated codex standard model, replacing
    // `gpt-4.1` which this account is measured to refuse (sprint-460, HTTP 400).
    expect(result.model).toBe('gpt-5.6-terra');
  });

  it('remaps economy-tier model correctly on fallback', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));
    registry.registerProvider(makeAdapter('codex', { available: true, models: ['gpt-4.1', 'o3', 'o4-mini'] }));

    const result = await resolveProviderWithFallback(
      'claude' as ProviderName,
      'claude-haiku-4-5-20251001' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    // haiku (economy on claude) -> designated codex economy model.
    expect(result.model).toBe('gpt-5.6-luna');
  });

  // --- Primary unavailable + no fallback configured ---

  it('throws when primary unavailable and no fallback configured', async () => {
    registry.registerProvider(makeAdapter('claude', { available: false }));

    await expect(
      resolveProviderWithFallback(
        'claude' as ProviderName,
        'claude-opus-4-8' as ModelType,
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
        'claude-opus-4-8' as ModelType,
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
      'claude-opus-4-8' as ModelType,
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
        'claude-opus-4-8' as ModelType,
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
        'claude-opus-4-8' as ModelType,
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
        'claude-opus-4-8' as ModelType,
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
        'claude-opus-4-8' as ModelType,
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
      'claude-opus-4-8' as ModelType,
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
      'claude-opus-4-8' as ModelType,
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
      'claude-opus-4-8' as ModelType,
      { fallback_provider: 'codex' as ProviderName },
      registry,
    );

    expect(codexAdapter.isAvailable).not.toHaveBeenCalled();
  });
});

// ─── orderedRoleProviders (454-007) — configured order, NEVER registry order ──

type OrderConfig = Pick<
  ResolvedConfig,
  'brain_provider' | 'worker_provider' | 'fallback_provider' | 'providers' | 'provider_fallback'
>;

describe('orderedRoleProviders', () => {
  it('resolves the brain primary from brain_provider', () => {
    const order = orderedRoleProviders('brain', { brain_provider: 'codex' as ProviderName } as OrderConfig);
    expect(order.primary).toBe('codex');
    expect(order.role).toBe('brain');
  });

  it('resolves the worker primary from worker_provider', () => {
    const order = orderedRoleProviders('worker', { worker_provider: 'gemini' as ProviderName } as OrderConfig);
    expect(order.primary).toBe('gemini');
  });

  it('auditor primary defaults to brain_provider (brain-family) when no auditor_provider set', () => {
    const order = orderedRoleProviders('auditor', { brain_provider: 'codex' as ProviderName } as OrderConfig);
    expect(order.primary).toBe('codex');
  });

  it('auditor primary honors provider_fallback.auditor_provider over brain_provider', () => {
    const order = orderedRoleProviders('auditor', {
      brain_provider: 'codex' as ProviderName,
      provider_fallback: { auditor_provider: 'gemini' as ProviderName },
    } as OrderConfig);
    expect(order.primary).toBe('gemini');
  });

  it('defaults the primary to claude when nothing is configured', () => {
    const order = orderedRoleProviders('brain', {} as OrderConfig);
    expect(order.primary).toBe('claude');
  });

  it('grouped providers.brain wins over legacy brain_provider for the primary', () => {
    const order = orderedRoleProviders('brain', {
      brain_provider: 'codex' as ProviderName,
      providers: { brain: 'gemini' as ProviderName },
    } as OrderConfig);
    expect(order.primary).toBe('gemini');
  });

  it('uses the per-role fallback chain in its configured order', () => {
    const order = orderedRoleProviders('worker', {
      worker_provider: 'claude' as ProviderName,
      provider_fallback: { worker: ['gemini', 'codex'] as ProviderName[], global: ['codex'] as ProviderName[] },
    } as OrderConfig);
    // per-role chain beats the global chain, in the exact authored order
    expect(order.fallbacks).toEqual(['gemini', 'codex']);
  });

  it('falls back to the global chain when no per-role chain is present', () => {
    const order = orderedRoleProviders('brain', {
      brain_provider: 'claude' as ProviderName,
      provider_fallback: { global: ['codex', 'gemini'] as ProviderName[] },
    } as OrderConfig);
    expect(order.fallbacks).toEqual(['codex', 'gemini']);
  });

  it('preserves OpenRouter as a first-class fallback and auditor primary', () => {
    const order = orderedRoleProviders('brain', {
      brain_provider: 'claude' as ProviderName,
      provider_fallback: { global: ['openrouter', 'codex'] as ProviderName[] },
    } as OrderConfig);
    expect(order.fallbacks).toEqual(['openrouter', 'codex']);
    expect(orderedRoleProviders('auditor', {
      provider_fallback: { auditor_provider: 'openrouter' as ProviderName },
    } as OrderConfig).primary).toBe('openrouter');
  });

  it('falls back to the legacy single fallback_provider when no chain is configured', () => {
    const order = orderedRoleProviders('brain', {
      brain_provider: 'claude' as ProviderName,
      fallback_provider: 'codex' as ProviderName,
    } as OrderConfig);
    expect(order.fallbacks).toEqual(['codex']);
  });

  it('strips the primary out of the fallback chain and de-dups, preserving order', () => {
    const order = orderedRoleProviders('brain', {
      brain_provider: 'claude' as ProviderName,
      provider_fallback: { global: ['claude', 'codex', 'codex', 'gemini'] as ProviderName[] },
    } as OrderConfig);
    // primary 'claude' removed; duplicate 'codex' collapsed; order kept
    expect(order.fallbacks).toEqual(['codex', 'gemini']);
  });

  it('CONFIGURED order is authoritative — reversing the config reverses the chain', () => {
    const forward = orderedRoleProviders('brain', {
      brain_provider: 'claude' as ProviderName,
      provider_fallback: { global: ['codex', 'gemini'] as ProviderName[] },
    } as OrderConfig);
    const reversed = orderedRoleProviders('brain', {
      brain_provider: 'claude' as ProviderName,
      provider_fallback: { global: ['gemini', 'codex'] as ProviderName[] },
    } as OrderConfig);
    expect(forward.fallbacks).toEqual(['codex', 'gemini']);
    expect(reversed.fallbacks).toEqual(['gemini', 'codex']);
  });

  it('defaults unattended to true; honors an explicit false', () => {
    expect(orderedRoleProviders('brain', {} as OrderConfig).unattended).toBe(true);
    const attended = orderedRoleProviders('brain', {
      provider_fallback: { unattended: false },
    } as OrderConfig);
    expect(attended.unattended).toBe(false);
  });

  it('returns an empty fallback chain when nothing is configured', () => {
    expect(orderedRoleProviders('worker', {} as OrderConfig).fallbacks).toEqual([]);
  });

  it('fails loudly instead of iterating a string fallback chain character by character', () => {
    expect(() => orderedRoleProviders('brain', {
      provider_fallback: { global: 'codex' } as unknown as OrderConfig['provider_fallback'],
    } as OrderConfig)).toThrow('provider_fallback.global must be an array');
  });

  it('fails loudly when an untyped caller bypasses config validation', () => {
    expect(() => orderedRoleProviders('auditor', {
      provider_fallback: { auditor_provider: 'not-a-provider' } as unknown as OrderConfig['provider_fallback'],
    } as OrderConfig)).toThrow('provider_fallback.auditor_provider contains unsupported provider');
    expect(() => orderedRoleProviders('worker', {
      provider_fallback: { unattended: 'yes' } as unknown as OrderConfig['provider_fallback'],
    } as OrderConfig)).toThrow('provider_fallback.unattended must be a boolean');
  });
});
