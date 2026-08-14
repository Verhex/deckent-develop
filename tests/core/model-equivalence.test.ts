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
      expect(getModelTier('claude-opus-4-8')).toBe('premium');
    });

    it('returns premium for gpt-5', () => {
      expect(getModelTier('gpt-5.5')).toBe('premium');
    });

    it('returns premium for gemini-2.5-pro', () => {
      expect(getModelTier('gemini-2.5-pro')).toBe('premium');
    });

    it('returns standard for sonnet', () => {
      expect(getModelTier('claude-sonnet-5')).toBe('standard');
    });

    it('returns standard for gpt-4.1', () => {
      expect(getModelTier('gpt-4.1')).toBe('standard');
    });

    it('returns premium_plus for o3', () => {
      expect(getModelTier('o3')).toBe('premium_plus');
    });

    it('returns standard for gemini-2.5-flash', () => {
      expect(getModelTier('gemini-2.5-flash')).toBe('standard');
    });

    it('returns economy for haiku', () => {
      expect(getModelTier('claude-haiku-4-5-20251001')).toBe('economy');
    });

    it('returns economy for gpt-5-mini', () => {
      expect(getModelTier('gpt-5-mini')).toBe('economy');
    });

    it('returns economy for gpt-4.1-mini', () => {
      expect(getModelTier('gpt-4.1-mini')).toBe('economy');
    });

    it('returns standard for o4-mini', () => {
      expect(getModelTier('o4-mini')).toBe('standard');
    });

    it('returns economy for gemini-2.0-flash', () => {
      expect(getModelTier('gemini-2.0-flash')).toBe('economy');
    });

    it('throws for unknown model', () => {
      expect(() => getModelTier('unknown' as MultiProviderModelType)).toThrow('Unknown model');
    });
  });

  // ─── getEquivalentModel — Claude → Codex ──────────────────────────
  //
  // MASTER-PLAN 670 (owner-approved 2026-07-26): each codex tier now names its
  // current generation via `preferredForTier` instead of letting catalog
  // registration order decide. These expectations moved from the older
  // generation to the designated one — the assertions below are the point of
  // the change, not collateral of it.
  describe('getEquivalentModel — Claude to Codex', () => {
    it('opus → gpt-5.5 for codex (premium tier)', () => {
      expect(getEquivalentModel('claude-opus-4-8', 'codex')).toBe('gpt-5.5');
    });

    it('fable → gpt-5.6-sol for codex (premium_plus tier)', () => {
      expect(getEquivalentModel('claude-fable-5', 'codex')).toBe('gpt-5.6-sol');
    });

    it('sonnet → gpt-5.6-terra for codex (standard tier)', () => {
      expect(getEquivalentModel('claude-sonnet-5', 'codex')).toBe('gpt-5.6-terra');
    });

    it('haiku → gpt-5.6-luna for codex (economy tier)', () => {
      expect(getEquivalentModel('claude-haiku-4-5-20251001', 'codex')).toBe('gpt-5.6-luna');
    });
  });

  // ─── getEquivalentModel — Claude → Gemini ─────────────────────────
  describe('getEquivalentModel — Claude to Gemini', () => {
    it('opus → gemini-2.5-pro for gemini', () => {
      expect(getEquivalentModel('claude-opus-4-8', 'gemini')).toBe('gemini-2.5-pro');
    });

    it('sonnet → gemini-2.5-flash for gemini', () => {
      expect(getEquivalentModel('claude-sonnet-5', 'gemini')).toBe('gemini-2.5-flash');
    });

    it('haiku → gemini-2.0-flash for gemini (economy tier)', () => {
      expect(getEquivalentModel('claude-haiku-4-5-20251001', 'gemini')).toBe('gemini-2.0-flash');
    });
  });

  // ─── getEquivalentModel — Codex → Claude ──────────────────────────
  describe('getEquivalentModel — Codex to Claude', () => {
    it('gpt-5.5 → opus-5 for claude (premium)', () => {
      // Reverse direction of the same designation: claude/premium now names
      // Opus 5 rather than resolving to whichever Opus registered first.
      expect(getEquivalentModel('gpt-5.5', 'claude')).toBe('claude-opus-5');
    });

    it('gpt-4.1 → sonnet for claude (standard)', () => {
      expect(getEquivalentModel('gpt-4.1', 'claude')).toBe('claude-sonnet-5');
    });

    it('o3 → fable for claude (premium_plus exact tier)', () => {
      expect(getEquivalentModel('o3', 'claude')).toBe('claude-fable-5');
    });

    it('gpt-5-mini → haiku for claude (economy)', () => {
      expect(getEquivalentModel('gpt-5-mini', 'claude')).toBe('claude-haiku-4-5-20251001');
    });

    it('gpt-4.1-mini → haiku for claude (economy)', () => {
      expect(getEquivalentModel('gpt-4.1-mini', 'claude')).toBe('claude-haiku-4-5-20251001');
    });

    it('o4-mini → sonnet for claude (standard)', () => {
      expect(getEquivalentModel('o4-mini', 'claude')).toBe('claude-sonnet-5');
    });
  });

  // ─── getEquivalentModel — same provider ───────────────────────────
  describe('getEquivalentModel — same provider', () => {
    it('opus → opus for claude', () => {
      expect(getEquivalentModel('claude-opus-4-8', 'claude')).toBe('claude-opus-4-8');
    });

    it('gpt-5 → gpt-5 for codex', () => {
      expect(getEquivalentModel('gpt-5.5', 'codex')).toBe('gpt-5.5');
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
    // Same designation, third source provider: MASTER-PLAN 670 is a property of
    // the codex tiers, so gemini→codex moves in lockstep with claude→codex.
    it('gemini-2.5-pro → gpt-5.5 for codex (premium)', () => {
      expect(getEquivalentModel('gemini-2.5-pro', 'codex')).toBe('gpt-5.5');
    });

    it('gemini-2.5-flash → gpt-5.6-terra for codex (standard)', () => {
      expect(getEquivalentModel('gemini-2.5-flash', 'codex')).toBe('gpt-5.6-terra');
    });

    it('gemini-2.0-flash → gpt-5.6-luna for codex (economy)', () => {
      expect(getEquivalentModel('gemini-2.0-flash', 'codex')).toBe('gpt-5.6-luna');
    });
  });

  // ─── getEquivalentModel — Codex → Gemini ──────────────────────────
  describe('getEquivalentModel — Codex to Gemini', () => {
    it('gpt-5 → gemini-2.5-pro for gemini (premium)', () => {
      expect(getEquivalentModel('gpt-5.5', 'gemini')).toBe('gemini-2.5-pro');
    });

    it('gpt-4.1 → gemini-2.5-flash for gemini (standard)', () => {
      expect(getEquivalentModel('gpt-4.1', 'gemini')).toBe('gemini-2.5-flash');
    });

    it('o3 → gemini-2.5-pro for gemini (premium_plus falls back to premium)', () => {
      expect(getEquivalentModel('o3', 'gemini')).toBe('gemini-2.5-pro');
    });

    it('gpt-5-mini → gemini-2.0-flash for gemini (economy)', () => {
      expect(getEquivalentModel('gpt-5-mini', 'gemini')).toBe('gemini-2.0-flash');
    });

    it('gpt-4.1-mini → gemini-2.0-flash for gemini (economy)', () => {
      expect(getEquivalentModel('gpt-4.1-mini', 'gemini')).toBe('gemini-2.0-flash');
    });

    it('o4-mini → gemini-2.5-flash for gemini (standard)', () => {
      expect(getEquivalentModel('o4-mini', 'gemini')).toBe('gemini-2.5-flash');
    });
  });

  // ─── getEquivalentModel — Gemini → Claude ─────────────────────────
  describe('getEquivalentModel — Gemini to Claude', () => {
    it('gemini-2.5-pro → opus-5 for claude (premium)', () => {
      expect(getEquivalentModel('gemini-2.5-pro', 'claude')).toBe('claude-opus-5');
    });

    it('gemini-2.5-flash → sonnet for claude (standard)', () => {
      expect(getEquivalentModel('gemini-2.5-flash', 'claude')).toBe('claude-sonnet-5');
    });

    it('gemini-2.0-flash → haiku for claude (economy)', () => {
      expect(getEquivalentModel('gemini-2.0-flash', 'claude')).toBe('claude-haiku-4-5-20251001');
    });
  });

  // ─── isModelAvailable ─────────────────────────────────────────────
  describe('isModelAvailable', () => {
    it('opus is available on claude', () => {
      expect(isModelAvailable('claude-opus-4-8', 'claude')).toBe(true);
    });

    it('opus is NOT available on codex', () => {
      expect(isModelAvailable('claude-opus-4-8', 'codex')).toBe(false);
    });

    it('gpt-5 is available on codex', () => {
      expect(isModelAvailable('gpt-5.5', 'codex')).toBe(true);
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
      expect(isModelAvailable('gpt-5.5', 'claude')).toBe(false);
    });

    it('gemini-2.5-pro is available on gemini', () => {
      expect(isModelAvailable('gemini-2.5-pro', 'gemini')).toBe(true);
    });

    it('gemini-2.0-flash is available on gemini', () => {
      expect(isModelAvailable('gemini-2.0-flash', 'gemini')).toBe(true);
    });

    it('haiku is NOT available on gemini', () => {
      expect(isModelAvailable('claude-haiku-4-5-20251001', 'gemini')).toBe(false);
    });

    it('gemini-2.0-flash is NOT available on claude', () => {
      expect(isModelAvailable('gemini-2.0-flash', 'claude')).toBe(false);
    });
  });

  // ─── getModelProvider ─────────────────────────────────────────────
  describe('getModelProvider', () => {
    it('opus belongs to claude', () => {
      expect(getModelProvider('claude-opus-4-8')).toBe('claude');
    });

    it('gpt-5 belongs to codex', () => {
      expect(getModelProvider('gpt-5.5')).toBe('codex');
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
    it('premium tier exposes every registered canonical API id', () => {
      expect(getModelsInTier('premium')).toEqual([
        'claude-opus-4-8', 'claude-opus-5', 'gpt-5.5', 'gemini-2.5-pro',
      ]);
    });

    it('standard tier exposes every registered canonical API id', () => {
      expect(getModelsInTier('standard')).toEqual([
        'claude-sonnet-5', 'gpt-4.1', 'o4-mini', 'gemini-2.5-flash', 'gpt-5.6-terra',
      ]);
    });

    it('economy tier exposes every registered canonical API id', () => {
      expect(getModelsInTier('economy')).toEqual([
        'claude-haiku-4-5-20251001', 'gpt-5-mini', 'gpt-4.1-mini',
        'gemini-2.0-flash', 'gpt-5.6-luna',
      ]);
    });
  });

  // ─── getProviderModels ────────────────────────────────────────────
  describe('getProviderModels', () => {
    it('claude has 5 models', () => {
      expect(getProviderModels('claude')).toEqual([
        'claude-fable-5', 'claude-opus-4-8', 'claude-opus-5',
        'claude-sonnet-5', 'claude-haiku-4-5-20251001',
      ]);
    });

    it('codex exposes the base and versioned canonical API ids', () => {
      expect(getProviderModels('codex')).toEqual([
        'o3', 'gpt-5.5', 'gpt-4.1', 'o4-mini', 'gpt-5-mini', 'gpt-4.1-mini',
        'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
      ]);
    });

    it('gemini has 4 models', () => {
      expect(getProviderModels('gemini')).toEqual(['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']);
    });
  });

  // ─── MODEL_TIERS constant ────────────────────────────────────────
  describe('MODEL_TIERS', () => {
    it('all tiers defined', () => {
      expect(Object.keys(MODEL_TIERS)).toEqual(['premium', 'standard', 'economy', 'premium_plus']);
    });

    it('total model count includes the versioned 5.6 family and Opus 5', () => {
      const total = Object.values(MODEL_TIERS).reduce((sum, models) => sum + models.length, 0);
      expect(total).toBe(18);
    });

    it('every model in MODEL_TIERS has a provider', () => {
      for (const models of Object.values(MODEL_TIERS)) {
        for (const model of models) {
          expect(() => getModelProvider(model as MultiProviderModelType)).not.toThrow();
        }
      }
    });

    it('every base tier has at least one model per provider', () => {
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
      'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001',
      'o3', 'gpt-5.5', 'gpt-4.1', 'o4-mini', 'gpt-5-mini', 'gpt-4.1-mini',
      'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash',
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

    it('premium_plus models map to numeric tier 3', async () => {
      const { getModelTier: numericTier } = await import('../../src/core/task-types.js');
      for (const model of MODEL_TIERS.premium_plus) {
        expect(numericTier(model as MultiProviderModelType)).toBe(3);
      }
    });
  });
});
