import { describe, it, expect } from 'vitest';
import {
  getModelTier,
  getEquivalentModel,
  isModelAvailable,
  getModelProvider,
  getModelsInTier,
  getProviderModels,
  MODEL_TIERS,
  type MultiProviderModelType,
  type ProviderName,
  type ModelTier,
} from '../../src/core/model-equivalence.js';

describe('model-equivalence', () => {
  // ─── getModelTier ─────────────────────────────────────────────────
  describe('getModelTier', () => {
    it('returns premium for opus', () => {
      expect(getModelTier('opus')).toBe('premium');
    });

    it('returns premium for gpt-5', () => {
      expect(getModelTier('gpt-5')).toBe('premium');
    });

    it('returns premium for gemini-2.5-pro', () => {
      expect(getModelTier('gemini-2.5-pro')).toBe('premium');
    });

    it('returns standard for sonnet', () => {
      expect(getModelTier('sonnet')).toBe('standard');
    });

    it('returns standard for gpt-4.1', () => {
      expect(getModelTier('gpt-4.1')).toBe('standard');
    });

    it('returns standard for o3', () => {
      expect(getModelTier('o3')).toBe('standard');
    });

    it('returns standard for gemini-2.5-flash', () => {
      expect(getModelTier('gemini-2.5-flash')).toBe('standard');
    });

    it('returns economy for haiku', () => {
      expect(getModelTier('haiku')).toBe('economy');
    });

    it('returns economy for gpt-5-mini', () => {
      expect(getModelTier('gpt-5-mini')).toBe('economy');
    });

    it('returns economy for gpt-4.1-mini', () => {
      expect(getModelTier('gpt-4.1-mini')).toBe('economy');
    });

    it('returns economy for o4-mini', () => {
      expect(getModelTier('o4-mini')).toBe('economy');
    });

    it('returns economy for gemini-2.0-flash', () => {
      expect(getModelTier('gemini-2.0-flash')).toBe('economy');
    });

    it('throws for unknown model', () => {
      expect(() => getModelTier('unknown' as MultiProviderModelType)).toThrow('Unknown model');
    });
  });

  // ─── getEquivalentModel — Claude → Codex ──────────────────────────
  describe('getEquivalentModel — Claude to Codex', () => {
    it('opus → gpt-5 for codex (premium tier)', () => {
      expect(getEquivalentModel('opus', 'codex')).toBe('gpt-5');
    });

    it('sonnet → gpt-4.1 for codex (standard tier)', () => {
      expect(getEquivalentModel('sonnet', 'codex')).toBe('gpt-4.1');
    });

    it('haiku → gpt-5-mini for codex (economy tier)', () => {
      expect(getEquivalentModel('haiku', 'codex')).toBe('gpt-5-mini');
    });
  });

  // ─── getEquivalentModel — Claude → Gemini ─────────────────────────
  describe('getEquivalentModel — Claude to Gemini', () => {
    it('opus → gemini-2.5-pro for gemini', () => {
      expect(getEquivalentModel('opus', 'gemini')).toBe('gemini-2.5-pro');
    });

    it('sonnet → gemini-2.5-flash for gemini', () => {
      expect(getEquivalentModel('sonnet', 'gemini')).toBe('gemini-2.5-flash');
    });

    it('haiku → gemini-2.0-flash for gemini (economy tier)', () => {
      expect(getEquivalentModel('haiku', 'gemini')).toBe('gemini-2.0-flash');
    });
  });

  // ─── getEquivalentModel — Codex → Claude ──────────────────────────
  describe('getEquivalentModel — Codex to Claude', () => {
    it('gpt-5 → opus for claude (premium)', () => {
      expect(getEquivalentModel('gpt-5', 'claude')).toBe('opus');
    });

    it('gpt-4.1 → sonnet for claude (standard)', () => {
      expect(getEquivalentModel('gpt-4.1', 'claude')).toBe('sonnet');
    });

    it('o3 → sonnet for claude (standard)', () => {
      expect(getEquivalentModel('o3', 'claude')).toBe('sonnet');
    });

    it('gpt-5-mini → haiku for claude (economy)', () => {
      expect(getEquivalentModel('gpt-5-mini', 'claude')).toBe('haiku');
    });

    it('gpt-4.1-mini → haiku for claude (economy)', () => {
      expect(getEquivalentModel('gpt-4.1-mini', 'claude')).toBe('haiku');
    });

    it('o4-mini → haiku for claude (economy)', () => {
      expect(getEquivalentModel('o4-mini', 'claude')).toBe('haiku');
    });
  });

  // ─── getEquivalentModel — same provider ───────────────────────────
  describe('getEquivalentModel — same provider', () => {
    it('opus → opus for claude', () => {
      expect(getEquivalentModel('opus', 'claude')).toBe('opus');
    });

    it('gpt-5 → gpt-5 for codex', () => {
      expect(getEquivalentModel('gpt-5', 'codex')).toBe('gpt-5');
    });

    it('gpt-4.1 → gpt-4.1 for codex', () => {
      expect(getEquivalentModel('gpt-4.1', 'codex')).toBe('gpt-4.1');
    });

    it('gpt-4.1-mini → gpt-4.1-mini for codex', () => {
      expect(getEquivalentModel('gpt-4.1-mini', 'codex')).toBe('gpt-4.1-mini');
    });

    it('gemini-2.5-pro → gemini-2.5-pro for gemini', () => {
      expect(getEquivalentModel('gemini-2.5-pro', 'gemini')).toBe('gemini-2.5-pro');
    });

    it('gemini-2.0-flash → gemini-2.0-flash for gemini', () => {
      expect(getEquivalentModel('gemini-2.0-flash', 'gemini')).toBe('gemini-2.0-flash');
    });
  });

  // ─── getEquivalentModel — Gemini → Codex ──────────────────────────
  describe('getEquivalentModel — Gemini to Codex', () => {
    it('gemini-2.5-pro → gpt-5 for codex (premium)', () => {
      expect(getEquivalentModel('gemini-2.5-pro', 'codex')).toBe('gpt-5');
    });

    it('gemini-2.5-flash → gpt-4.1 for codex (standard)', () => {
      expect(getEquivalentModel('gemini-2.5-flash', 'codex')).toBe('gpt-4.1');
    });

    it('gemini-2.0-flash → gpt-5-mini for codex (economy)', () => {
      expect(getEquivalentModel('gemini-2.0-flash', 'codex')).toBe('gpt-5-mini');
    });
  });

  // ─── getEquivalentModel — Codex → Gemini ──────────────────────────
  describe('getEquivalentModel — Codex to Gemini', () => {
    it('gpt-5 → gemini-2.5-pro for gemini (premium)', () => {
      expect(getEquivalentModel('gpt-5', 'gemini')).toBe('gemini-2.5-pro');
    });

    it('gpt-4.1 → gemini-2.5-flash for gemini (standard)', () => {
      expect(getEquivalentModel('gpt-4.1', 'gemini')).toBe('gemini-2.5-flash');
    });

    it('o3 → gemini-2.5-flash for gemini (standard)', () => {
      expect(getEquivalentModel('o3', 'gemini')).toBe('gemini-2.5-flash');
    });

    it('gpt-5-mini → gemini-2.0-flash for gemini (economy)', () => {
      expect(getEquivalentModel('gpt-5-mini', 'gemini')).toBe('gemini-2.0-flash');
    });

    it('gpt-4.1-mini → gemini-2.0-flash for gemini (economy)', () => {
      expect(getEquivalentModel('gpt-4.1-mini', 'gemini')).toBe('gemini-2.0-flash');
    });

    it('o4-mini → gemini-2.0-flash for gemini (economy)', () => {
      expect(getEquivalentModel('o4-mini', 'gemini')).toBe('gemini-2.0-flash');
    });
  });

  // ─── getEquivalentModel — Gemini → Claude ─────────────────────────
  describe('getEquivalentModel — Gemini to Claude', () => {
    it('gemini-2.5-pro → opus for claude (premium)', () => {
      expect(getEquivalentModel('gemini-2.5-pro', 'claude')).toBe('opus');
    });

    it('gemini-2.5-flash → sonnet for claude (standard)', () => {
      expect(getEquivalentModel('gemini-2.5-flash', 'claude')).toBe('sonnet');
    });

    it('gemini-2.0-flash → haiku for claude (economy)', () => {
      expect(getEquivalentModel('gemini-2.0-flash', 'claude')).toBe('haiku');
    });
  });

  // ─── isModelAvailable ─────────────────────────────────────────────
  describe('isModelAvailable', () => {
    it('opus is available on claude', () => {
      expect(isModelAvailable('opus', 'claude')).toBe(true);
    });

    it('opus is NOT available on codex', () => {
      expect(isModelAvailable('opus', 'codex')).toBe(false);
    });

    it('gpt-5 is available on codex', () => {
      expect(isModelAvailable('gpt-5', 'codex')).toBe(true);
    });

    it('gpt-5-mini is available on codex', () => {
      expect(isModelAvailable('gpt-5-mini', 'codex')).toBe(true);
    });

    it('gpt-4.1 is available on codex', () => {
      expect(isModelAvailable('gpt-4.1', 'codex')).toBe(true);
    });

    it('gpt-4.1-mini is available on codex', () => {
      expect(isModelAvailable('gpt-4.1-mini', 'codex')).toBe(true);
    });

    it('gpt-5 is NOT available on claude', () => {
      expect(isModelAvailable('gpt-5', 'claude')).toBe(false);
    });

    it('gemini-2.5-pro is available on gemini', () => {
      expect(isModelAvailable('gemini-2.5-pro', 'gemini')).toBe(true);
    });

    it('gemini-2.0-flash is available on gemini', () => {
      expect(isModelAvailable('gemini-2.0-flash', 'gemini')).toBe(true);
    });

    it('haiku is NOT available on gemini', () => {
      expect(isModelAvailable('haiku', 'gemini')).toBe(false);
    });

    it('gemini-2.0-flash is NOT available on claude', () => {
      expect(isModelAvailable('gemini-2.0-flash', 'claude')).toBe(false);
    });
  });

  // ─── getModelProvider ─────────────────────────────────────────────
  describe('getModelProvider', () => {
    it('opus belongs to claude', () => {
      expect(getModelProvider('opus')).toBe('claude');
    });

    it('gpt-5 belongs to codex', () => {
      expect(getModelProvider('gpt-5')).toBe('codex');
    });

    it('gpt-5-mini belongs to codex', () => {
      expect(getModelProvider('gpt-5-mini')).toBe('codex');
    });

    it('gpt-4.1 belongs to codex', () => {
      expect(getModelProvider('gpt-4.1')).toBe('codex');
    });

    it('gpt-4.1-mini belongs to codex', () => {
      expect(getModelProvider('gpt-4.1-mini')).toBe('codex');
    });

    it('gemini-2.5-flash belongs to gemini', () => {
      expect(getModelProvider('gemini-2.5-flash')).toBe('gemini');
    });

    it('gemini-2.0-flash belongs to gemini', () => {
      expect(getModelProvider('gemini-2.0-flash')).toBe('gemini');
    });

    it('throws for unknown model', () => {
      expect(() => getModelProvider('unknown' as MultiProviderModelType)).toThrow('Unknown model');
    });
  });

  // ─── getModelsInTier ──────────────────────────────────────────────
  describe('getModelsInTier', () => {
    it('premium tier has 3 models', () => {
      expect(getModelsInTier('premium')).toEqual(['opus', 'gpt-5', 'gemini-2.5-pro']);
    });

    it('standard tier has 4 models', () => {
      expect(getModelsInTier('standard')).toEqual(['sonnet', 'gpt-4.1', 'o3', 'gemini-2.5-flash']);
    });

    it('economy tier has 5 models', () => {
      expect(getModelsInTier('economy')).toEqual(['haiku', 'gpt-5-mini', 'gpt-4.1-mini', 'o4-mini', 'gemini-2.0-flash']);
    });
  });

  // ─── getProviderModels ────────────────────────────────────────────
  describe('getProviderModels', () => {
    it('claude has 3 models', () => {
      expect(getProviderModels('claude')).toEqual(['opus', 'sonnet', 'haiku']);
    });

    it('codex has 6 models', () => {
      expect(getProviderModels('codex')).toEqual(['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini']);
    });

    it('gemini has 3 models', () => {
      expect(getProviderModels('gemini')).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']);
    });
  });

  // ─── MODEL_TIERS constant ────────────────────────────────────────
  describe('MODEL_TIERS', () => {
    it('all tiers defined', () => {
      expect(Object.keys(MODEL_TIERS)).toEqual(['premium', 'standard', 'economy']);
    });

    it('total model count is 12', () => {
      const total = Object.values(MODEL_TIERS).reduce((sum, models) => sum + models.length, 0);
      expect(total).toBe(12);
    });

    it('every model in MODEL_TIERS has a provider', () => {
      for (const models of Object.values(MODEL_TIERS)) {
        for (const model of models) {
          expect(() => getModelProvider(model as MultiProviderModelType)).not.toThrow();
        }
      }
    });

    it('every tier has at least one model per provider', () => {
      const tiers: ModelTier[] = ['premium', 'standard', 'economy'];
      const providers: ProviderName[] = ['claude', 'codex', 'gemini'];
      for (const tier of tiers) {
        const models = getModelsInTier(tier);
        for (const provider of providers) {
          const hasModel = models.some(m => isModelAvailable(m as MultiProviderModelType, provider));
          expect(hasModel).toBe(true);
        }
      }
    });
  });

  // ─── Cross-provider equivalence completeness ─────────────────────
  describe('equivalence completeness', () => {
    const providers: ProviderName[] = ['claude', 'codex', 'gemini'];
    const allModels: MultiProviderModelType[] = [
      'opus', 'sonnet', 'haiku',
      'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini',
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash',
    ];

    it('every model can find an equivalent on every provider', () => {
      for (const model of allModels) {
        for (const provider of providers) {
          expect(() => getEquivalentModel(model, provider)).not.toThrow();
        }
      }
    });

    it('equivalent model always belongs to the target provider', () => {
      for (const model of allModels) {
        for (const provider of providers) {
          const equivalent = getEquivalentModel(model, provider);
          expect(isModelAvailable(equivalent, provider)).toBe(true);
        }
      }
    });

    it('same-provider equivalence returns the same model', () => {
      for (const model of allModels) {
        const provider = getModelProvider(model);
        expect(getEquivalentModel(model, provider)).toBe(model);
      }
    });
  });

  // ─── Tier alignment with task-types ────────────────────────────────
  describe('tier alignment with task-types getModelTier', () => {
    it('premium models map to numeric tier 2', async () => {
      const { getModelTier: numericTier } = await import('../../src/core/task-types.js');
      for (const model of MODEL_TIERS.premium) {
        expect(numericTier(model as MultiProviderModelType)).toBe(2);
      }
    });

    it('standard models map to numeric tier 1', async () => {
      const { getModelTier: numericTier } = await import('../../src/core/task-types.js');
      for (const model of MODEL_TIERS.standard) {
        expect(numericTier(model as MultiProviderModelType)).toBe(1);
      }
    });

    it('economy models map to numeric tier 0', async () => {
      const { getModelTier: numericTier } = await import('../../src/core/task-types.js');
      for (const model of MODEL_TIERS.economy) {
        expect(numericTier(model as MultiProviderModelType)).toBe(0);
      }
    });
  });
});
