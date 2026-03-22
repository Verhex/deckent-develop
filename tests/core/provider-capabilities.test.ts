import { describe, it, expect } from 'vitest';
import {
  getCapabilities,
  getProvidersWithCapability,
  canProviderHandle,
  getAllProviders,
} from '../../src/core/provider-capabilities.js';
import type { ProviderName } from '../../src/core/model-equivalence.js';

describe('provider-capabilities', () => {
  // ─── getCapabilities ──────────────────────────────────────────────

  describe('getCapabilities', () => {
    it('returns correct Claude capabilities', () => {
      const caps = getCapabilities('claude');
      expect(caps.streaming).toBe(true);
      expect(caps.toolUse).toBe(true);
      expect(caps.vision).toBe(true);
      expect(caps.codeExecution).toBe(true);
      expect(caps.maxContextTokens).toBe(200_000);
      expect(caps.costPerMillionTokens).toEqual({ input: 15, output: 75 });
    });

    it('returns correct Codex capabilities', () => {
      const caps = getCapabilities('codex');
      expect(caps.streaming).toBe(true);
      expect(caps.toolUse).toBe(true);
      expect(caps.vision).toBe(true);
      expect(caps.codeExecution).toBe(true);
      expect(caps.maxContextTokens).toBe(1_047_576);
      expect(caps.costPerMillionTokens).toEqual({ input: 2, output: 8 });
    });

    it('returns correct Gemini capabilities', () => {
      const caps = getCapabilities('gemini');
      expect(caps.streaming).toBe(true);
      expect(caps.toolUse).toBe(true);
      expect(caps.vision).toBe(true);
      expect(caps.codeExecution).toBe(true);
      expect(caps.maxContextTokens).toBe(1_048_576);
      expect(caps.costPerMillionTokens).toEqual({ input: 1.25, output: 10 });
    });

    it('throws DeckentError for unknown provider', () => {
      expect(() => getCapabilities('openai' as ProviderName)).toThrow('Unknown provider');
    });

    it('returns a copy (not the original object)', () => {
      const a = getCapabilities('claude');
      const b = getCapabilities('claude');
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });
  });

  // ─── getProvidersWithCapability ───────────────────────────────────

  describe('getProvidersWithCapability', () => {
    it('returns all providers for streaming', () => {
      const providers = getProvidersWithCapability('streaming');
      expect(providers).toContain('claude');
      expect(providers).toContain('codex');
      expect(providers).toContain('gemini');
      expect(providers).toHaveLength(3);
    });

    it('returns all providers for toolUse', () => {
      const providers = getProvidersWithCapability('toolUse');
      expect(providers).toHaveLength(3);
    });

    it('returns all providers for maxContextTokens (non-zero)', () => {
      const providers = getProvidersWithCapability('maxContextTokens');
      expect(providers).toHaveLength(3);
    });

    it('returns all providers for costPerMillionTokens', () => {
      const providers = getProvidersWithCapability('costPerMillionTokens');
      expect(providers).toHaveLength(3);
    });
  });

  // ─── canProviderHandle ────────────────────────────────────────────

  describe('canProviderHandle', () => {
    it('returns true when provider meets all boolean requirements', () => {
      expect(canProviderHandle('claude', { streaming: true, toolUse: true })).toBe(true);
    });

    it('returns true when provider meets context token requirement', () => {
      expect(canProviderHandle('gemini', { maxContextTokens: 500_000 })).toBe(true);
    });

    it('returns false when provider context is too small', () => {
      expect(canProviderHandle('claude', { maxContextTokens: 500_000 })).toBe(false);
    });

    it('returns true for cost within budget', () => {
      expect(canProviderHandle('codex', {
        costPerMillionTokens: { input: 5, output: 10 },
      })).toBe(true);
    });

    it('returns false when provider cost exceeds budget', () => {
      expect(canProviderHandle('claude', {
        costPerMillionTokens: { input: 10, output: 50 },
      })).toBe(false);
    });

    it('returns true for empty requirements', () => {
      expect(canProviderHandle('claude', {})).toBe(true);
    });

    it('throws for unknown provider', () => {
      expect(() => canProviderHandle('unknown' as ProviderName, {})).toThrow('Unknown provider');
    });
  });

  // ─── getAllProviders ──────────────────────────────────────────────

  describe('getAllProviders', () => {
    it('returns all three providers', () => {
      const all = getAllProviders();
      expect(all).toHaveLength(3);
      expect(all).toContain('claude');
      expect(all).toContain('codex');
      expect(all).toContain('gemini');
    });
  });
});
