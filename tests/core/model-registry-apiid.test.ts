import { describe, it, expect } from 'vitest';
import {
  BUILTIN_MODELS,
  ModelRegistry,
  modelRegistry,
} from '../../src/core/model-registry.js';

describe('model-registry apiId correctness (207-001)', () => {
  it('Claude Opus canonical id is current and identical to apiId', () => {
    const opus = BUILTIN_MODELS.find(m => m.id === 'claude-opus-4-8');
    expect(opus).toBeDefined();
    expect(opus!.apiId).toBe('claude-opus-4-8');
    expect(opus!.apiId).not.toBe('claude-opus-4-6');
  });

  it('Claude Opus 5 is a distinct exact API identity', () => {
    const opus5 = BUILTIN_MODELS.find(m => m.id === 'claude-opus-5');
    expect(opus5).toMatchObject({
      id: 'claude-opus-5',
      apiId: 'claude-opus-5',
      provider: 'claude',
      tier: 'premium',
      status: 'ga',
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
      costPerMillion: { input: 5, output: 25 },
    });
  });

  it('tier mapping is preserved after apiId update', () => {
    const registry = new ModelRegistry();
    expect(registry.getTier('claude-opus-4-8')).toBe('premium');
    expect(registry.getTier('claude-sonnet-5')).toBe('standard');
    expect(registry.getTier('claude-haiku-4-5-20251001')).toBe('economy');
  });

  it('15-model invariant holds (5 Claude + 6 OpenAI + 4 Gemini)', () => {
    expect(BUILTIN_MODELS.length).toBe(15);
    const claude = BUILTIN_MODELS.filter(m => m.provider === 'claude');
    const codex = BUILTIN_MODELS.filter(m => m.provider === 'codex');
    const gemini = BUILTIN_MODELS.filter(m => m.provider === 'gemini');
    expect(claude.length).toBe(5);
    expect(codex.length).toBe(6);
    expect(gemini.length).toBe(4);
  });

  it('bundled fallback resolves the canonical Opus API ID unchanged', () => {
    const registry = new ModelRegistry(BUILTIN_MODELS);
    expect(registry.resolveApiId('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(registry.resolveApiId('claude-opus-5')).toBe('claude-opus-5');
    expect(registry.has('claude-opus-4-8')).toBe(true);
    expect(registry.has('claude-opus-5')).toBe(true);
  });

  it('singleton modelRegistry also returns canonical Opus unchanged', () => {
    expect(modelRegistry.resolveApiId('claude-opus-4-8')).toBe('claude-opus-4-8');
  });
});
