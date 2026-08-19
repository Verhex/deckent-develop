import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelRegistry,
  CANONICAL_MODELS,
  buildParametricModel,
  inferProviderFromId,
  inferTierFromId,
} from '../../src/core/model-registry.js';

// ─── F1-PD: De-hardcode model catalog (parametric) ───────────────────────────
// These tests exercise the parametric resolution path: the bundled catalog
// stays as the fallback, but an unknown / brand-new model id is RESOLVED into a
// runtime-validated definition instead of being rejected.

describe('parametric model resolution (F1-PD)', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  // ── 1) Bundled catalog preserved as fallback + strict path unchanged ──

  describe('bundled catalog fallback is preserved', () => {
    it('keeps all bundled builtin models available', () => {
      expect(registry.getAllModelIds()).toHaveLength(CANONICAL_MODELS.length);
      // resolve() returns the bundled entry verbatim for a known id (no synthesis).
      expect(registry.resolve('claude-opus-4-8')).toEqual(registry.getOrThrow('claude-opus-4-8'));
      expect(registry.resolve('gemini-2.5-pro').apiId).toBe('gemini-2.5-pro');
    });

    it('getOrThrow() stays strict for unknown ids (rigidity intact on the strict path)', () => {
      expect(() => registry.getOrThrow('totally-unknown-model')).toThrow('Unknown model');
      expect(registry.has('totally-unknown-model')).toBe(false);
    });
  });

  // ── 2) Unknown / new model id is accepted + resolved (not rejected) ──

  describe('unknown / new model id is resolved, not rejected', () => {
    it('resolve() synthesizes a runtime-validated definition for a brand-new id', () => {
      // Before: the new id is genuinely unknown and the strict path rejects it.
      expect(registry.has('gpt-6-turbo')).toBe(false);
      expect(() => registry.getOrThrow('gpt-6-turbo')).toThrow();

      // After: the parametric path accepts and resolves it instead of throwing.
      const def = registry.resolve('gpt-6-turbo', {
        provider: 'codex',
        costPerMillion: { input: 7, output: 35 },
        pricingEvidenceRef: 'catalog:test:gpt-6-turbo',
        status: 'ga',
      });
      expect(def.id).toBe('gpt-6-turbo');
      expect(def.apiId).toBe('gpt-6-turbo');
      expect(def.status).toBe('ga');

      // It is now first-class: get / getOrThrow / resolveApiId all work.
      expect(registry.has('gpt-6-turbo')).toBe(true);
      expect(() => registry.getOrThrow('gpt-6-turbo')).not.toThrow();
      expect(registry.resolveApiId('gpt-6-turbo')).toBe('gpt-6-turbo');
      // Registering the new id must not drop any bundled entry.
      expect(registry.getAllModelIds()).toHaveLength(CANONICAL_MODELS.length + 1);
    });

    it('resolve({ register: false }) resolves without mutating the registry', () => {
      const def = registry.resolve('ephemeral-model-x', {
        provider: 'codex',
        costPerMillion: { input: 1, output: 2 },
        pricingEvidenceRef: 'catalog:test:ephemeral-model-x',
        register: false,
      });
      expect(def.id).toBe('ephemeral-model-x');
      expect(registry.has('ephemeral-model-x')).toBe(false);
      expect(registry.getAllModelIds()).toHaveLength(CANONICAL_MODELS.length);
    });
  });

  // ── 3) Provider + tier mapping is parametric (inferred from the id) ──

  describe('provider + tier inference is parametric', () => {
    it('infers provider from the id naming convention', () => {
      expect(inferProviderFromId('claude-zeta-9')).toBe('claude');
      expect(inferProviderFromId('gpt-7')).toBe('codex');
      expect(inferProviderFromId('o5-mini')).toBe('codex');
      expect(inferProviderFromId('gemini-9.0-pro')).toBe('gemini');
      expect(inferProviderFromId('qwen3:8b')).toBe('ollama');
      expect(inferProviderFromId('cursor-grok-4.6-high')).toBe('cursor');
    });

    it('matches the cursor- namespace before the vendor branches', () => {
      // A Cursor-hosted id may embed another vendor's family name. Precedence,
      // not the vendor token, decides ownership — otherwise these land on codex
      // and claude and get dispatched through the wrong adapter.
      expect(inferProviderFromId('cursor-gpt-5-style-id')).toBe('cursor');
      expect(inferProviderFromId('cursor-claude-style-id')).toBe('cursor');
      // The prefix is exact: substring matches stay unowned.
      expect(inferProviderFromId('cursorless-model')).toBeUndefined();
      expect(inferProviderFromId('cursor')).toBeUndefined();
    });

    it('cannot infer the cursor effort tier — why the catalog sets it explicitly', () => {
      // Regression pin, NOT desired behaviour: inferTierFromId has no notion of
      // Cursor's reasoning-effort suffixes, so all four ids flatten to
      // 'standard'. CURSOR_MODELS therefore declares every tier explicitly; if
      // this pin ever changes, that decision must be revisited deliberately.
      for (const effort of ['low', 'medium', 'high', 'xhigh']) {
        expect(inferTierFromId(`cursor-grok-4.6-${effort}`)).toBe('standard');
      }
    });

    it('infers tier from the id naming convention', () => {
      expect(inferTierFromId('gpt-7-mini')).toBe('economy');
      expect(inferTierFromId('gemini-9.0-pro')).toBe('premium');
      expect(inferTierFromId('some-flash-model')).toBe('standard');
      expect(inferTierFromId('frontier-ultra')).toBe('premium_plus');
    });

    it('resolve() wires the inferred provider + tier onto the new model', () => {
      const gem = registry.resolve('gemini-9.0-pro', {
        costPerMillion: { input: 3, output: 15 },
        pricingEvidenceRef: 'catalog:test:gemini-9.0-pro',
      });
      expect(gem.provider).toBe('gemini');
      expect(gem.tier).toBe('premium');

      const mini = registry.resolve('gpt-7-mini', {
        costPerMillion: { input: 1, output: 4 },
        pricingEvidenceRef: 'catalog:test:gpt-7-mini',
      });
      expect(mini.provider).toBe('codex');
      expect(mini.tier).toBe('economy');

      // The resolved entries participate in provider/tier queries like bundled ones.
      expect(registry.getByProvider('gemini').some(m => m.id === 'gemini-9.0-pro')).toBe(true);
      expect(registry.getByTier('economy').some(m => m.id === 'gpt-7-mini')).toBe(true);
    });

    it('buildParametricModel honors explicit overrides over inference', () => {
      const def = buildParametricModel('mystery-model', {
        provider: 'claude',
        tier: 'premium_plus',
        apiId: 'mystery-model',
        contextWindow: 500_000,
        costPerMillion: { input: 7, output: 21 },
        pricingEvidenceRef: 'catalog:test:mystery-model',
        capabilities: { reasoning: true },
        maxOutputTokens: 64_000,
      });
      expect(def.provider).toBe('claude');
      expect(def.tier).toBe('premium_plus');
      expect(def.apiId).toBe('mystery-model');
      expect(def.contextWindow).toBe(500_000);
      expect(def.costPerMillion).toEqual({ input: 7, output: 21 });
      expect(def.capabilities.reasoning).toBe(true);
      // Defaults still apply to fields not overridden.
      expect(def.capabilities.streaming).toBe(true);
      expect(def.maxOutputTokens).toBe(64_000);
    });
  });
});
