import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelRegistry,
  BUILTIN_MODELS,
  modelRegistry,
  type ModelDefinition,
  type ModelTier,
  type RegistryProviderName,
} from '../../src/core/model-registry.js';

// ─── Builtin catalog tests ───────────────────────────────────────────

describe('BUILTIN_MODELS catalog', () => {
  it('contains exactly 15 models', () => {
    expect(BUILTIN_MODELS).toHaveLength(15);
  });

  it('has 5 Claude models', () => {
    const claude = BUILTIN_MODELS.filter(m => m.provider === 'claude');
    expect(claude).toHaveLength(5);
    expect(claude.map(m => m.id).sort()).toEqual([
      'claude-fable-5',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-sonnet-5',
    ]);
  });

  it('has 6 OpenAI/Codex models', () => {
    const codex = BUILTIN_MODELS.filter(m => m.provider === 'codex');
    expect(codex).toHaveLength(6);
    expect(codex.map(m => m.id).sort()).toEqual([
      'gpt-4.1', 'gpt-4.1-mini', 'gpt-5-mini', 'gpt-5.5', 'o3', 'o4-mini',
    ]);
  });

  it('has 4 Gemini models', () => {
    const gemini = BUILTIN_MODELS.filter(m => m.provider === 'gemini');
    expect(gemini).toHaveLength(4);
    expect(gemini.map(m => m.id).sort()).toEqual([
      'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview',
    ]);
  });

  it('every model has a unique id', () => {
    const ids = BUILTIN_MODELS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every model has a non-empty apiId', () => {
    for (const m of BUILTIN_MODELS) {
      expect(m.apiId.length).toBeGreaterThan(0);
    }
  });

  it('every model has valid tier', () => {
    const validTiers: ModelTier[] = ['economy', 'standard', 'premium', 'premium_plus'];
    for (const m of BUILTIN_MODELS) {
      expect(validTiers).toContain(m.tier);
    }
  });

  it('every model has positive contextWindow', () => {
    for (const m of BUILTIN_MODELS) {
      expect(m.contextWindow).toBeGreaterThan(0);
    }
  });

  it('every model has non-negative cost', () => {
    for (const m of BUILTIN_MODELS) {
      expect(m.costPerMillion.input).toBeGreaterThanOrEqual(0);
      expect(m.costPerMillion.output).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── ModelRegistry class tests ────────────────────────────────────────

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  // ── get / has / getOrThrow ──

  describe('get()', () => {
    it('returns model for valid id', () => {
      const model = registry.get('claude-opus-4-8');
      expect(model).toBeDefined();
      expect(model!.id).toBe('claude-opus-4-8');
      expect(model!.provider).toBe('claude');
    });

    it('returns undefined for unknown id', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has()', () => {
    it('returns true for known models', () => {
      expect(registry.has('claude-opus-4-8')).toBe(true);
      expect(registry.has('claude-opus-5')).toBe(true);
      expect(registry.has('gpt-5.5')).toBe(true);
      expect(registry.has('gemini-2.5-pro')).toBe(true);
    });

    it('returns false for unknown models', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('getOrThrow()', () => {
    it('returns model for valid id', () => {
      const model = registry.getOrThrow('claude-sonnet-5');
      expect(model.id).toBe('claude-sonnet-5');
    });

    it('throws for unknown model', () => {
      expect(() => registry.getOrThrow('nonexistent')).toThrow('Unknown model: nonexistent');
    });
  });

  // ── getByProvider ──

  describe('getByProvider()', () => {
    it('returns 5 models for claude', () => {
      expect(registry.getByProvider('claude')).toHaveLength(5);
    });

    it('returns all 9 canonical Codex models', () => {
      expect(registry.getByProvider('codex')).toHaveLength(9);
    });

    it('returns 4 models for gemini', () => {
      expect(registry.getByProvider('gemini')).toHaveLength(4);
    });

    it('all returned models belong to the requested provider', () => {
      const models = registry.getByProvider('codex');
      for (const m of models) {
        expect(m.provider).toBe('codex');
      }
    });
  });

  // ── getByTier ──

  describe('getByTier()', () => {
    it('returns economy models', () => {
      const models = registry.getByTier('economy');
      expect(models.length).toBeGreaterThanOrEqual(3);
      for (const m of models) {
        expect(m.tier).toBe('economy');
      }
    });

    it('returns standard models', () => {
      const models = registry.getByTier('standard');
      expect(models.length).toBeGreaterThanOrEqual(3);
      for (const m of models) {
        expect(m.tier).toBe('standard');
      }
    });

    it('returns premium models', () => {
      const models = registry.getByTier('premium');
      expect(models.length).toBeGreaterThanOrEqual(3);
      for (const m of models) {
        expect(m.tier).toBe('premium');
      }
    });

    it('returns premium_plus models', () => {
      const models = registry.getByTier('premium_plus');
      expect(models.length).toBeGreaterThanOrEqual(2);
      for (const m of models) {
        expect(m.tier).toBe('premium_plus');
      }
    });
  });

  // ── getByProviderAndTier ──

  describe('getByProviderAndTier()', () => {
    it('returns the DESIGNATED GA model for claude+premium', () => {
      // MASTER-PLAN 670 (owner-approved 2026-07-26): claude/premium holds two GA
      // models, so this used to return whichever registered first (Opus 4.8).
      // The tier now names its current generation explicitly.
      const model = registry.getByProviderAndTier('claude', 'premium');
      expect(model).toBeDefined();
      expect(model!.id).toBe('claude-opus-5');
      expect(model!.preferredForTier).toBe(true);
    });

    it('returns GA model for codex+standard', () => {
      const model = registry.getByProviderAndTier('codex', 'standard');
      expect(model).toBeDefined();
      expect(model!.provider).toBe('codex');
      expect(model!.tier).toBe('standard');
    });

    it('returns undefined for provider+tier with no GA model', () => {
      // gemini's only premium_plus model (gemini-3.1-pro-preview) is status 'preview', not GA.
      // (claude+premium_plus is now GA — claude-fable-5.)
      expect(registry.getByProviderAndTier('gemini', 'premium_plus')).toBeUndefined();
    });

    // ── preferredForTier (MASTER-PLAN 669/670) ──
    // Registration order must not decide which billed model a tier resolves to.
    // No BUILTIN entry carries the flag yet (that marking is an owner-approved
    // default flip), so these exercise the branch on purpose-built catalogs.

    /** Two GA models in one (provider, tier); only the second is preferred. */
    function tierPair(preferSecond: boolean): ModelDefinition[] {
      const base = {
        provider: 'codex' as RegistryProviderName,
        tier: 'standard' as const,
        contextWindow: 100_000,
        costPerMillion: { input: 1, output: 2 },
        capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
        status: 'ga' as const,
      };
      return [
        { ...base, id: 'legacy-first', apiId: 'legacy-first' },
        { ...base, id: 'current-second', apiId: 'current-second', ...(preferSecond ? { preferredForTier: true } : {}) },
      ];
    }

    it('resolves to the designated model even when it registered later', () => {
      const reg = new ModelRegistry(tierPair(true));
      expect(reg.getByProviderAndTier('codex', 'standard')?.id).toBe('current-second');
    });

    it('falls back to first-match when the tier designates nothing', () => {
      const reg = new ModelRegistry(tierPair(false));
      expect(reg.getByProviderAndTier('codex', 'standard')?.id).toBe('legacy-first');
    });

    it('rejects a second designation in the same tier at register() time', () => {
      const reg = new ModelRegistry(tierPair(true));
      expect(() => reg.register({
        ...tierPair(true)[1]!,
        id: 'rival-third',
        apiId: 'rival-third',
      })).toThrow(/registration order/);
    });

    it('rejects a catalog that designates two models in one tier', () => {
      const [first, second] = tierPair(true);
      expect(() => new ModelRegistry([
        { ...first!, preferredForTier: true },
        second!,
      ])).toThrow(/registration order/);
    });

    it('lets a designation coexist with one in a different tier', () => {
      const reg = new ModelRegistry([
        ...tierPair(true),
        {
          id: 'premium-pick',
          apiId: 'premium-pick',
          provider: 'codex' as RegistryProviderName,
          tier: 'premium',
          contextWindow: 100_000,
          costPerMillion: { input: 5, output: 10 },
          capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
          status: 'ga',
          preferredForTier: true,
        },
      ]);
      expect(reg.getByProviderAndTier('codex', 'standard')?.id).toBe('current-second');
      expect(reg.getByProviderAndTier('codex', 'premium')?.id).toBe('premium-pick');
    });
  });

  // ── getEquivalent ──

  describe('getEquivalent()', () => {
    it('maps opus → gpt-5.6-sol (claude premium → codex premium)', () => {
      expect(registry.getEquivalent('claude-opus-4-8', 'codex')).toBe('gpt-5.6-sol');
    });

    it('maps opus → gemini-2.5-pro (claude premium → gemini premium)', () => {
      expect(registry.getEquivalent('claude-opus-4-8', 'gemini')).toBe('gemini-2.5-pro');
    });

    it('maps gpt-5.5 → opus-5 (codex premium → claude premium)', () => {
      expect(registry.getEquivalent('gpt-5.5', 'claude')).toBe('claude-opus-5');
    });

    it('maps sonnet → gpt-5.6-terra (claude standard → codex standard)', () => {
      expect(registry.getEquivalent('claude-sonnet-5', 'codex')).toBe('gpt-5.6-terra');
    });

    it('maps sonnet → gemini-2.5-flash (claude standard → gemini standard)', () => {
      expect(registry.getEquivalent('claude-sonnet-5', 'gemini')).toBe('gemini-2.5-flash');
    });

    it('maps haiku → gpt-5.6-luna (claude economy → codex economy)', () => {
      expect(registry.getEquivalent('claude-haiku-4-5-20251001', 'codex')).toBe('gpt-5.6-luna');
    });

    it('maps haiku → gemini-2.0-flash (claude economy → gemini economy)', () => {
      expect(registry.getEquivalent('claude-haiku-4-5-20251001', 'gemini')).toBe('gemini-2.0-flash');
    });

    it('returns same model when target provider matches source', () => {
      expect(registry.getEquivalent('claude-opus-4-8', 'claude')).toBe('claude-opus-4-8');
    });

    it('maps premium_plus to claude premium_plus (fable)', () => {
      // o3 is codex premium_plus; claude now has a premium_plus GA model (fable),
      // so the equivalent is the exact-tier match, not a premium fallback.
      expect(registry.getEquivalent('o3', 'claude')).toBe('claude-fable-5');
    });

    it('throws when no equivalent exists', () => {
      // Create a registry with only one model at a unique tier
      const tiny = new ModelRegistry([
        {
          id: 'custom-top',
          apiId: 'custom-top',
          provider: 'claude' as RegistryProviderName,
          tier: 'premium_plus',
          contextWindow: 100_000,
          costPerMillion: { input: 100, output: 200 },
          capabilities: { streaming: false, toolUse: false, vision: false, codeExecution: false, reasoning: false },
          status: 'ga',
        },
      ]);
      expect(() => tiny.getEquivalent('custom-top', 'codex')).toThrow();
    });
  });

  // ── getTier ──

  describe('getTier()', () => {
    it('returns correct tier for each known model', () => {
      expect(registry.getTier('claude-opus-4-8')).toBe('premium');
      expect(registry.getTier('claude-sonnet-5')).toBe('standard');
      expect(registry.getTier('claude-haiku-4-5-20251001')).toBe('economy');
      expect(registry.getTier('o3')).toBe('premium_plus');
      expect(registry.getTier('gpt-5.5')).toBe('premium');
      expect(registry.getTier('gpt-4.1')).toBe('standard');
      expect(registry.getTier('gpt-5-mini')).toBe('economy');
      expect(registry.getTier('gemini-3.1-pro-preview')).toBe('premium_plus');
      expect(registry.getTier('gemini-2.5-pro')).toBe('premium');
      expect(registry.getTier('gemini-2.5-flash')).toBe('standard');
      expect(registry.getTier('gemini-2.0-flash')).toBe('economy');
    });

    it('throws for unknown model', () => {
      expect(() => registry.getTier('nonexistent')).toThrow();
    });
  });

  // ── compareTiers ──

  describe('compareTiers()', () => {
    it('orders economy < standard < premium < premium_plus', () => {
      expect(registry.compareTiers('economy', 'standard')).toBeLessThan(0);
      expect(registry.compareTiers('standard', 'premium')).toBeLessThan(0);
      expect(registry.compareTiers('premium', 'premium_plus')).toBeLessThan(0);
    });

    it('returns 0 for same tier', () => {
      expect(registry.compareTiers('standard', 'standard')).toBe(0);
      expect(registry.compareTiers('premium_plus', 'premium_plus')).toBe(0);
    });

    it('returns positive when first > second', () => {
      expect(registry.compareTiers('premium', 'economy')).toBeGreaterThan(0);
      expect(registry.compareTiers('premium_plus', 'standard')).toBeGreaterThan(0);
    });
  });

  // ── isAtLeastTier ──

  describe('isAtLeastTier()', () => {
    it('opus (premium) is at least economy', () => {
      expect(registry.isAtLeastTier('claude-opus-4-8', 'economy')).toBe(true);
    });

    it('opus (premium) is at least standard', () => {
      expect(registry.isAtLeastTier('claude-opus-4-8', 'standard')).toBe(true);
    });

    it('opus (premium) is at least premium', () => {
      expect(registry.isAtLeastTier('claude-opus-4-8', 'premium')).toBe(true);
    });

    it('opus (premium) is NOT at least premium_plus', () => {
      expect(registry.isAtLeastTier('claude-opus-4-8', 'premium_plus')).toBe(false);
    });

    it('haiku (economy) is NOT at least standard', () => {
      expect(registry.isAtLeastTier('claude-haiku-4-5-20251001', 'standard')).toBe(false);
    });

    it('o3 (premium_plus) is at least any tier', () => {
      expect(registry.isAtLeastTier('o3', 'economy')).toBe(true);
      expect(registry.isAtLeastTier('o3', 'standard')).toBe(true);
      expect(registry.isAtLeastTier('o3', 'premium')).toBe(true);
      expect(registry.isAtLeastTier('o3', 'premium_plus')).toBe(true);
    });
  });

  // ── register / unregister ──

  describe('register()', () => {
    it('adds a new model at runtime', () => {
      const customModel: ModelDefinition = {
        id: 'custom-test-model',
        apiId: 'custom-test-model',
        provider: 'claude',
        tier: 'standard',
        contextWindow: 128_000,
        costPerMillion: { input: 1, output: 3 },
        capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
        status: 'ga',
      };

      expect(registry.has('custom-test-model')).toBe(false);
      registry.register(customModel);
      expect(registry.has('custom-test-model')).toBe(true);
      expect(registry.get('custom-test-model')).toEqual(customModel);
    });

    it('overwrites existing model with same id', () => {
      const original = registry.get('claude-opus-4-8')!;
      const modified: ModelDefinition = { ...original, contextWindow: 999_999 };

      registry.register(modified);
      expect(registry.get('claude-opus-4-8')!.contextWindow).toBe(999_999);
    });
  });

  describe('unregister()', () => {
    it('removes a model', () => {
      registry.register({
        id: 'temp-model',
        apiId: 'temp-model',
        provider: 'claude',
        tier: 'economy',
        contextWindow: 100_000,
        costPerMillion: { input: 0.5, output: 2 },
        capabilities: { streaming: true, toolUse: false, vision: false, codeExecution: false, reasoning: false },
        status: 'ga',
      });
      expect(registry.has('temp-model')).toBe(true);
      expect(registry.unregister('temp-model')).toBe(true);
      expect(registry.has('temp-model')).toBe(false);
    });

    it('returns false for non-existent model', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  // ── resolveApiId ──

  describe('resolveApiId()', () => {
    it('returns correct API ID for Claude models', () => {
      expect(registry.resolveApiId('claude-opus-4-8')).toBe('claude-opus-4-8');
      expect(registry.resolveApiId('claude-sonnet-5')).toBe('claude-sonnet-5');
      expect(registry.resolveApiId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001');
    });

    it('returns correct API ID for OpenAI models', () => {
      // Sprint 248 (Provider Parity): premium codex id `gpt-5` wires to apiId
      // `gpt-5.5` — the name a ChatGPT subscription accepts (`gpt-5` is rejected).
      expect(registry.resolveApiId('gpt-5.5')).toBe('gpt-5.5');
      expect(registry.resolveApiId('gpt-4.1')).toBe('gpt-4.1');
      expect(registry.resolveApiId('o3')).toBe('o3');
      expect(registry.resolveApiId('o4-mini')).toBe('o4-mini');
      expect(registry.resolveApiId('gpt-5-mini')).toBe('gpt-5-mini');
      expect(registry.resolveApiId('gpt-4.1-mini')).toBe('gpt-4.1-mini');
    });

    it('returns correct API ID for Gemini models', () => {
      expect(registry.resolveApiId('gemini-2.5-pro')).toBe('gemini-2.5-pro');
      expect(registry.resolveApiId('gemini-2.5-flash')).toBe('gemini-2.5-flash');
      expect(registry.resolveApiId('gemini-2.0-flash')).toBe('gemini-2.0-flash');
      expect(registry.resolveApiId('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview');
    });

    it('throws for unknown model', () => {
      expect(() => registry.resolveApiId('nonexistent')).toThrow();
    });
  });

  // ── estimateCost ──

  describe('estimateCost()', () => {
    it('calculates cost for opus with 1M input + 500K output', () => {
      // opus (4.5+ repricing): $5/M input, $25/M output — baseline-aligned
      const cost = registry.estimateCost('claude-opus-4-8', 1_000_000, 500_000);
      expect(cost).toBeCloseTo(5 + 12.5, 2);
    });

    it('calculates official Opus 5 cost with 1M input + 500K output', () => {
      const cost = registry.estimateCost('claude-opus-5', 1_000_000, 500_000);
      expect(cost).toBeCloseTo(5 + 12.5, 2);
    });

    it('calculates cost for haiku with 100K input + 50K output', () => {
      // haiku: $0.8/M input, $4/M output
      const cost = registry.estimateCost('claude-haiku-4-5-20251001', 100_000, 50_000);
      expect(cost).toBeCloseTo(0.08 + 0.2, 4);
    });

    it('returns 0 for zero tokens', () => {
      expect(registry.estimateCost('claude-sonnet-5', 0, 0)).toBe(0);
    });

    it('calculates cost for gpt-4.1-mini (cheapest model)', () => {
      // gpt-4.1-mini: $0.4/M input, $1.6/M output
      const cost = registry.estimateCost('gpt-4.1-mini', 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(0.4 + 1.6, 2);
    });

    it('throws for unknown model', () => {
      expect(() => registry.estimateCost('nonexistent', 100, 100)).toThrow();
    });
  });

  // ── getNumericTier ──

  describe('getNumericTier()', () => {
    it('returns 0 for economy', () => {
      expect(registry.getNumericTier('claude-haiku-4-5-20251001')).toBe(0);
    });

    it('returns 1 for standard', () => {
      expect(registry.getNumericTier('claude-sonnet-5')).toBe(1);
    });

    it('returns 2 for premium', () => {
      expect(registry.getNumericTier('claude-opus-4-8')).toBe(2);
    });

    it('returns 3 for premium_plus', () => {
      expect(registry.getNumericTier('o3')).toBe(3);
    });
  });

  // ── getAllModelIds / getAllModels / getAllProviders ──

  describe('getAllModelIds()', () => {
    it('returns the 15 core and 3 pinned Codex parity model ids', () => {
      const ids = registry.getAllModelIds();
      expect(ids).toHaveLength(18);
      expect(ids).toContain('claude-fable-5');
      expect(ids).toContain('claude-opus-4-8');
      expect(ids).toContain('claude-opus-5');
      expect(ids).toContain('gpt-5.5');
      expect(ids).toContain('gemini-2.5-pro');
      expect(ids).toContain('gpt-4.1-mini');
      expect(ids).toContain('gemini-3.1-pro-preview');
    });
  });

  describe('getAllModels()', () => {
    it('returns all canonical model definitions', () => {
      const models = registry.getAllModels();
      expect(models).toHaveLength(18);
      for (const m of models) {
        expect(m.id).toBeDefined();
        expect(m.apiId).toBeDefined();
        expect(m.provider).toBeDefined();
      }
    });
  });

  describe('getAllProviders()', () => {
    it('returns 3 providers: claude, codex, gemini', () => {
      const providers = registry.getAllProviders();
      expect(providers).toHaveLength(3);
      expect(providers).toContain('claude');
      expect(providers).toContain('codex');
      expect(providers).toContain('gemini');
    });
  });

  // ── Constructor with custom builtins ──

  describe('constructor', () => {
    it('accepts custom builtins array', () => {
      const custom = new ModelRegistry([BUILTIN_MODELS[0]!]);
      expect(custom.getAllModelIds()).toHaveLength(1);
      expect(custom.has('claude-fable-5')).toBe(true); // BUILTIN_MODELS[0] is now claude-fable-5
      expect(custom.has('claude-sonnet-5')).toBe(false);
    });

    it('empty array creates empty registry', () => {
      const empty = new ModelRegistry([]);
      expect(empty.getAllModelIds()).toHaveLength(0);
    });
  });

  // ── Model capabilities ──

  describe('model capabilities', () => {
    it('o3 has reasoning capability', () => {
      expect(registry.get('o3')!.capabilities.reasoning).toBe(true);
    });

    it('o4-mini has reasoning capability', () => {
      expect(registry.get('o4-mini')!.capabilities.reasoning).toBe(true);
    });

    it('gemini-3.1-pro-preview has reasoning capability', () => {
      expect(registry.get('gemini-3.1-pro-preview')!.capabilities.reasoning).toBe(true);
    });

    it('opus does not have reasoning capability', () => {
      expect(registry.get('claude-opus-4-8')!.capabilities.reasoning).toBe(false);
      expect(registry.get('claude-opus-5')!.capabilities.reasoning).toBe(false);
    });

    it('all models support streaming and toolUse', () => {
      for (const m of registry.getAllModels()) {
        expect(m.capabilities.streaming).toBe(true);
        expect(m.capabilities.toolUse).toBe(true);
      }
    });
  });

  // ── Model status ──

  describe('model status', () => {
    it('gemini-3.1-pro-preview has preview status', () => {
      expect(registry.get('gemini-3.1-pro-preview')!.status).toBe('preview');
    });

    it('all other models have ga status', () => {
      const nonPreview = registry.getAllModels().filter(m => m.id !== 'gemini-3.1-pro-preview');
      for (const m of nonPreview) {
        expect(m.status).toBe('ga');
      }
    });
  });
});

// ─── Singleton export test ───────────────────────────────────────────

describe('modelRegistry singleton', () => {
  it('is an instance of ModelRegistry', () => {
    expect(modelRegistry).toBeInstanceOf(ModelRegistry);
  });

  it('has the complete canonical offline catalog', () => {
    expect(modelRegistry.getAllModelIds()).toHaveLength(18);
  });
});
