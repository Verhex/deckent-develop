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

  it('tier mapping is preserved after apiId update', () => {
    const registry = new ModelRegistry();
    expect(registry.getTier('claude-opus-4-8')).toBe('premium');
    expect(registry.getTier('claude-sonnet-5')).toBe('standard');
    expect(registry.getTier('claude-haiku-4-5-20251001')).toBe('economy');
  });

  it('14-model invariant holds (4 Claude + 6 OpenAI + 4 Gemini)', () => {
    expect(BUILTIN_MODELS.length).toBe(14);
    const claude = BUILTIN_MODELS.filter(m => m.provider === 'claude');
    const codex = BUILTIN_MODELS.filter(m => m.provider === 'codex');
    const gemini = BUILTIN_MODELS.filter(m => m.provider === 'gemini');
    expect(claude.length).toBe(4);
    expect(codex.length).toBe(6);
    expect(gemini.length).toBe(4);
  });

  it('bundled fallback resolves the canonical Opus API ID unchanged', () => {
    const registry = new ModelRegistry(BUILTIN_MODELS);
    expect(registry.resolveApiId('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(registry.has('claude-opus-4-8')).toBe(true);
  });

  it('singleton modelRegistry also returns canonical Opus unchanged', () => {
    expect(modelRegistry.resolveApiId('claude-opus-4-8')).toBe('claude-opus-4-8');
  });
});
