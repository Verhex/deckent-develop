import { describe, it, expect } from 'vitest';
import {
  BUILTIN_MODELS,
  ModelRegistry,
  modelRegistry,
} from '../../src/core/model-registry.js';

describe('model-registry apiId correctness (207-001)', () => {
  it('opus bundled apiId is current (claude-opus-4-8, not stale 4-6)', () => {
    const opus = BUILTIN_MODELS.find(m => m.id === 'opus');
    expect(opus).toBeDefined();
    expect(opus!.apiId).toBe('claude-opus-4-8');
    expect(opus!.apiId).not.toBe('claude-opus-4-6');
  });

  it('tier mapping is preserved after apiId update', () => {
    const registry = new ModelRegistry();
    expect(registry.getTier('opus')).toBe('premium');
    expect(registry.getTier('sonnet')).toBe('standard');
    expect(registry.getTier('haiku')).toBe('economy');
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

  it('bundled fallback: ModelRegistry resolves opus apiId correctly', () => {
    const registry = new ModelRegistry(BUILTIN_MODELS);
    expect(registry.resolveApiId('opus')).toBe('claude-opus-4-8');
    expect(registry.has('opus')).toBe(true);
  });

  it('singleton modelRegistry also returns updated opus apiId', () => {
    expect(modelRegistry.resolveApiId('opus')).toBe('claude-opus-4-8');
  });
});
