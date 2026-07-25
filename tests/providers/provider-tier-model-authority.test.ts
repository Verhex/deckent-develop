import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModelForProviderTier } from '../../src/core/model-equivalence.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import { CODEX_TIER_MODELS, CodexAdapter } from '../../src/providers/codex.js';
import { GEMINI_TIER_MODELS, GeminiAdapter } from '../../src/providers/gemini.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('provider tier-model authority', () => {
  it('returns exact API IDs from the live registry for both adapters', () => {
    const codex = new CodexAdapter('.');
    const gemini = new GeminiAdapter('.');

    for (const tier of ['premium', 'standard', 'economy'] as const) {
      const expected = getModelForProviderTier('codex', tier);
      expect(expected).toBeDefined();
      expect(CODEX_TIER_MODELS[tier]).toBe(expected);
      expect(codex.getModelForTier(tier)).toBe(expected);
    }

    for (const tier of ['premium_plus', 'premium', 'standard', 'economy'] as const) {
      const expected = getModelForProviderTier('gemini', tier);
      expect(expected).toBeDefined();
      expect(GEMINI_TIER_MODELS[tier]).toBe(expected);
      expect(gemini.getModelForTier(tier)).toBe(expected);
    }
  });

  it('fails loudly when the registry has no Codex tier authority', () => {
    vi.spyOn(modelRegistry, 'getByProviderAndTier').mockReturnValue(undefined);
    const adapter = new CodexAdapter('.');

    expect(() => CODEX_TIER_MODELS.standard)
      .toThrow('E_CODEX_TIER_MODEL_UNAVAILABLE: tier=standard');
    expect(() => adapter.getModelForTier('economy'))
      .toThrow('E_CODEX_TIER_MODEL_UNAVAILABLE: tier=economy');
  });

  it('fails loudly when the registry has no Gemini tier authority', () => {
    vi.spyOn(modelRegistry, 'getByProviderAndTier').mockReturnValue(undefined);
    const adapter = new GeminiAdapter('.');

    expect(() => GEMINI_TIER_MODELS.premium_plus)
      .toThrow('E_GEMINI_TIER_MODEL_UNAVAILABLE: tier=premium_plus');
    expect(() => adapter.getModelForTier('standard'))
      .toThrow('E_GEMINI_TIER_MODEL_UNAVAILABLE: tier=standard');
  });
});
