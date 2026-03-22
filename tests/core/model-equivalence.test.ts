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

    it('returns premium for gpt-4.1', () => {
      expect(getModelTier('gpt-4.1')).toBe('premium');
    });

    it('returns premium for gemini-2.5-pro', () => {
      expect(getModelTier('gemini-2.5-pro')).toBe('premium');
    });

    it('returns standard for sonnet', () => {
      expect(getModelTier('sonnet')).toBe('standard');
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

    it('returns economy for o4-mini', () => {
      expect(getModelTier('o4-mini')).toBe('economy');
    });

    it('throws for unknown model', () => {
      expect(() => getModelTier('unknown' as MultiProviderModelType)).toThrow('Unknown model');
    });
  });

  // ─── getEquivalentModel — Claude → Codex ──────────────────────────
  describe('getEquivalentModel — Claude to Codex', () => {
    it('opus → gpt-4.1 for codex', () => {
      expect(getEquivalentModel('opus', 'codex')).toBe('gpt-4.1');
    });

    it('sonnet → o3 for codex', () => {
      expect(getEquivalentModel('sonnet', 'codex')).toBe('o3');
    });

    it('haiku → o4-mini for codex', () => {
      expect(getEquivalentModel('haiku', 'codex')).toBe('o4-mini');
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

    it('haiku → gemini-2.5-flash for gemini (economy fallback to standard)', () => {
      expect(getEquivalentModel('haiku', 'gemini')).toBe('gemini-2.5-flash');
    });
  });

  // ─── getEquivalentModel — Codex → Claude ──────────────────────────
  describe('getEquivalentModel — Codex to Claude', () => {
    it('gpt-4.1 → opus for claude', () => {
      expect(getEquivalentModel('gpt-4.1', 'claude')).toBe('opus');
    });

    it('o3 → sonnet for claude', () => {
      expect(getEquivalentModel('o3', 'claude')).toBe('sonnet');
    });

    it('o4-mini → haiku for claude', () => {
      expect(getEquivalentModel('o4-mini', 'claude')).toBe('haiku');
    });
  });

  // ─── getEquivalentModel — same provider ───────────────────────────
  describe('getEquivalentModel — same provider', () => {
    it('opus → opus for claude', () => {
      expect(getEquivalentModel('opus', 'claude')).toBe('opus');
    });

    it('gpt-4.1 → gpt-4.1 for codex', () => {
      expect(getEquivalentModel('gpt-4.1', 'codex')).toBe('gpt-4.1');
    });

    it('gemini-2.5-pro → gemini-2.5-pro for gemini', () => {
      expect(getEquivalentModel('gemini-2.5-pro', 'gemini')).toBe('gemini-2.5-pro');
    });
  });

  // ─── getEquivalentModel — Gemini → Codex ──────────────────────────
  describe('getEquivalentModel — Gemini to Codex', () => {
    it('gemini-2.5-pro → gpt-4.1 for codex', () => {
      expect(getEquivalentModel('gemini-2.5-pro', 'codex')).toBe('gpt-4.1');
    });

    it('gemini-2.5-flash → o3 for codex', () => {
      expect(getEquivalentModel('gemini-2.5-flash', 'codex')).toBe('o3');
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

    it('gpt-4.1 is available on codex', () => {
      expect(isModelAvailable('gpt-4.1', 'codex')).toBe(true);
    });

    it('gpt-4.1 is NOT available on claude', () => {
      expect(isModelAvailable('gpt-4.1', 'claude')).toBe(false);
    });

    it('gemini-2.5-pro is available on gemini', () => {
      expect(isModelAvailable('gemini-2.5-pro', 'gemini')).toBe(true);
    });

    it('haiku is NOT available on gemini', () => {
      expect(isModelAvailable('haiku', 'gemini')).toBe(false);
    });
  });

  // ─── getModelProvider ─────────────────────────────────────────────
  describe('getModelProvider', () => {
    it('opus belongs to claude', () => {
      expect(getModelProvider('opus')).toBe('claude');
    });

    it('gpt-4.1 belongs to codex', () => {
      expect(getModelProvider('gpt-4.1')).toBe('codex');
    });

    it('gemini-2.5-flash belongs to gemini', () => {
      expect(getModelProvider('gemini-2.5-flash')).toBe('gemini');
    });

    it('throws for unknown model', () => {
      expect(() => getModelProvider('unknown' as MultiProviderModelType)).toThrow('Unknown model');
    });
  });

  // ─── getModelsInTier ──────────────────────────────────────────────
  describe('getModelsInTier', () => {
    it('premium tier has 3 models', () => {
      expect(getModelsInTier('premium')).toEqual(['opus', 'gpt-4.1', 'gemini-2.5-pro']);
    });

    it('economy tier has 2 models (no gemini)', () => {
      expect(getModelsInTier('economy')).toEqual(['haiku', 'o4-mini']);
    });
  });

  // ─── getProviderModels ────────────────────────────────────────────
  describe('getProviderModels', () => {
    it('claude has 3 models', () => {
      expect(getProviderModels('claude')).toEqual(['opus', 'sonnet', 'haiku']);
    });

    it('gemini has 2 models', () => {
      expect(getProviderModels('gemini')).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
    });
  });

  // ─── MODEL_TIERS constant ────────────────────────────────────────
  describe('MODEL_TIERS', () => {
    it('all tiers defined', () => {
      expect(Object.keys(MODEL_TIERS)).toEqual(['premium', 'standard', 'economy']);
    });

    it('total model count is 8', () => {
      const total = Object.values(MODEL_TIERS).reduce((sum, models) => sum + models.length, 0);
      expect(total).toBe(8);
    });
  });
});
