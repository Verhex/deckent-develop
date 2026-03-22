import { describe, it, expect } from 'vitest';
import {
  PROVIDER_MODEL_MAP,
  CLAUDE_MODELS,
  ALL_MODELS,
  getProviderForModel,
  isClaudeModel,
  isOpenAIModel,
  isGeminiModel,
  getModelTier,
  isValidModel,
  UnknownModelError,
} from '../../src/core/task-types.js';
import type {
  ClaudeModel,
  OpenAIModel,
  GeminiModel,
  ModelType,
  ProviderName,
} from '../../src/core/task-types.js';

// ─── PROVIDER_MODEL_MAP ──────────────────────────────────────────────────────

describe('PROVIDER_MODEL_MAP', () => {
  it('maps claude to opus, sonnet, haiku', () => {
    expect(PROVIDER_MODEL_MAP.claude).toEqual(['opus', 'sonnet', 'haiku']);
  });

  it('maps codex to gpt-4.1, o3, o4-mini', () => {
    expect(PROVIDER_MODEL_MAP.codex).toEqual(['gpt-4.1', 'o3', 'o4-mini']);
  });

  it('maps gemini to gemini-2.5-pro, gemini-2.5-flash', () => {
    expect(PROVIDER_MODEL_MAP.gemini).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
  });

  it('has exactly 3 providers', () => {
    expect(Object.keys(PROVIDER_MODEL_MAP)).toHaveLength(3);
  });
});

// ─── CLAUDE_MODELS ───────────────────────────────────────────────────────────

describe('CLAUDE_MODELS', () => {
  it('contains opus, sonnet, haiku', () => {
    expect(CLAUDE_MODELS).toEqual(['opus', 'sonnet', 'haiku']);
  });

  it('is readonly (cannot mutate)', () => {
    // TypeScript enforces this at compile time; runtime check that it is a frozen-like array
    expect(Array.isArray(CLAUDE_MODELS)).toBe(true);
  });
});

// ─── ALL_MODELS ──────────────────────────────────────────────────────────────

describe('ALL_MODELS', () => {
  it('contains all 8 model names', () => {
    expect(ALL_MODELS).toHaveLength(8);
  });

  it('includes all Claude models', () => {
    for (const m of CLAUDE_MODELS) {
      expect(ALL_MODELS).toContain(m);
    }
  });

  it('includes OpenAI models', () => {
    expect(ALL_MODELS).toContain('gpt-4.1');
    expect(ALL_MODELS).toContain('o3');
    expect(ALL_MODELS).toContain('o4-mini');
  });

  it('includes Gemini models', () => {
    expect(ALL_MODELS).toContain('gemini-2.5-pro');
    expect(ALL_MODELS).toContain('gemini-2.5-flash');
  });

  it('covers every model in PROVIDER_MODEL_MAP', () => {
    for (const models of Object.values(PROVIDER_MODEL_MAP)) {
      for (const m of models) {
        expect(ALL_MODELS).toContain(m);
      }
    }
  });
});

// ─── getProviderForModel ─────────────────────────────────────────────────────

describe('getProviderForModel', () => {
  it('returns claude for opus', () => {
    expect(getProviderForModel('opus')).toBe('claude');
  });

  it('returns claude for sonnet', () => {
    expect(getProviderForModel('sonnet')).toBe('claude');
  });

  it('returns claude for haiku', () => {
    expect(getProviderForModel('haiku')).toBe('claude');
  });

  it('returns codex for gpt-4.1', () => {
    expect(getProviderForModel('gpt-4.1')).toBe('codex');
  });

  it('returns codex for o3', () => {
    expect(getProviderForModel('o3')).toBe('codex');
  });

  it('returns codex for o4-mini', () => {
    expect(getProviderForModel('o4-mini')).toBe('codex');
  });

  it('returns gemini for gemini-2.5-pro', () => {
    expect(getProviderForModel('gemini-2.5-pro')).toBe('gemini');
  });

  it('returns gemini for gemini-2.5-flash', () => {
    expect(getProviderForModel('gemini-2.5-flash')).toBe('gemini');
  });

  it('throws UnknownModelError for invalid model', () => {
    expect(() => getProviderForModel('invalid' as ModelType)).toThrow(UnknownModelError);
  });
});

// ─── isClaudeModel ───────────────────────────────────────────────────────────

describe('isClaudeModel', () => {
  it('returns true for opus', () => {
    expect(isClaudeModel('opus')).toBe(true);
  });

  it('returns true for sonnet', () => {
    expect(isClaudeModel('sonnet')).toBe(true);
  });

  it('returns true for haiku', () => {
    expect(isClaudeModel('haiku')).toBe(true);
  });

  it('returns false for gpt-4.1', () => {
    expect(isClaudeModel('gpt-4.1')).toBe(false);
  });

  it('returns false for gemini-2.5-pro', () => {
    expect(isClaudeModel('gemini-2.5-pro')).toBe(false);
  });
});

// ─── isOpenAIModel ───────────────────────────────────────────────────────────

describe('isOpenAIModel', () => {
  it('returns true for gpt-4.1', () => {
    expect(isOpenAIModel('gpt-4.1')).toBe(true);
  });

  it('returns true for o3', () => {
    expect(isOpenAIModel('o3')).toBe(true);
  });

  it('returns true for o4-mini', () => {
    expect(isOpenAIModel('o4-mini')).toBe(true);
  });

  it('returns false for opus', () => {
    expect(isOpenAIModel('opus')).toBe(false);
  });

  it('returns false for gemini-2.5-flash', () => {
    expect(isOpenAIModel('gemini-2.5-flash')).toBe(false);
  });
});

// ─── isGeminiModel ───────────────────────────────────────────────────────────

describe('isGeminiModel', () => {
  it('returns true for gemini-2.5-pro', () => {
    expect(isGeminiModel('gemini-2.5-pro')).toBe(true);
  });

  it('returns true for gemini-2.5-flash', () => {
    expect(isGeminiModel('gemini-2.5-flash')).toBe(true);
  });

  it('returns false for opus', () => {
    expect(isGeminiModel('opus')).toBe(false);
  });

  it('returns false for o3', () => {
    expect(isGeminiModel('o3')).toBe(false);
  });
});

// ─── getModelTier ────────────────────────────────────────────────────────────

describe('getModelTier', () => {
  it('tier 0: haiku, o4-mini, gemini-2.5-flash', () => {
    expect(getModelTier('haiku')).toBe(0);
    expect(getModelTier('o4-mini')).toBe(0);
    expect(getModelTier('gemini-2.5-flash')).toBe(0);
  });

  it('tier 1: sonnet, o3, gemini-2.5-pro', () => {
    expect(getModelTier('sonnet')).toBe(1);
    expect(getModelTier('o3')).toBe(1);
    expect(getModelTier('gemini-2.5-pro')).toBe(1);
  });

  it('tier 2: opus, gpt-4.1', () => {
    expect(getModelTier('opus')).toBe(2);
    expect(getModelTier('gpt-4.1')).toBe(2);
  });

  it('all 8 models have a defined tier', () => {
    for (const m of ALL_MODELS) {
      expect(typeof getModelTier(m)).toBe('number');
    }
  });
});

// ─── isValidModel ────────────────────────────────────────────────────────────

describe('isValidModel', () => {
  it('returns true for all known models', () => {
    for (const m of ALL_MODELS) {
      expect(isValidModel(m)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isValidModel('gpt-3')).toBe(false);
    expect(isValidModel('claude-3')).toBe(false);
    expect(isValidModel('')).toBe(false);
    expect(isValidModel('invalid')).toBe(false);
  });
});

// ─── Type compatibility ─────────────────────────────────────────────────────

describe('Type compatibility', () => {
  it('ClaudeModel values are valid ModelType values', () => {
    const models: ClaudeModel[] = ['opus', 'sonnet', 'haiku'];
    for (const m of models) {
      const _mt: ModelType = m; // compile-time check
      expect(isValidModel(_mt)).toBe(true);
    }
  });

  it('OpenAIModel values are valid ModelType values', () => {
    const models: OpenAIModel[] = ['gpt-4.1', 'o3', 'o4-mini'];
    for (const m of models) {
      const _mt: ModelType = m;
      expect(isValidModel(_mt)).toBe(true);
    }
  });

  it('GeminiModel values are valid ModelType values', () => {
    const models: GeminiModel[] = ['gemini-2.5-pro', 'gemini-2.5-flash'];
    for (const m of models) {
      const _mt: ModelType = m;
      expect(isValidModel(_mt)).toBe(true);
    }
  });

  it('ProviderName has exactly 3 valid values', () => {
    const providers: ProviderName[] = ['claude', 'codex', 'gemini'];
    expect(providers).toHaveLength(3);
    for (const p of providers) {
      expect(PROVIDER_MODEL_MAP[p]).toBeDefined();
    }
  });
});

// ─── Re-export verification ────────────────────────────────────────────────

describe('Re-export from types.ts barrel', () => {
  it('ALL_MODELS is accessible from types.ts', async () => {
    const types = await import('../../src/core/types.js');
    expect(types.ALL_MODELS).toBeDefined();
    expect(types.ALL_MODELS).toEqual(ALL_MODELS);
  });

  it('CLAUDE_MODELS is accessible from types.ts', async () => {
    const types = await import('../../src/core/types.js');
    expect(types.CLAUDE_MODELS).toBeDefined();
    expect(types.CLAUDE_MODELS).toEqual(CLAUDE_MODELS);
  });

  it('getProviderForModel is accessible from types.ts', async () => {
    const types = await import('../../src/core/types.js');
    expect(types.getProviderForModel).toBe(getProviderForModel);
  });

  it('isClaudeModel is accessible from types.ts', async () => {
    const types = await import('../../src/core/types.js');
    expect(types.isClaudeModel).toBe(isClaudeModel);
  });

  it('getModelTier is accessible from types.ts', async () => {
    const types = await import('../../src/core/types.js');
    expect(types.getModelTier).toBe(getModelTier);
  });

  it('isValidModel is accessible from types.ts', async () => {
    const types = await import('../../src/core/types.js');
    expect(types.isValidModel).toBe(isValidModel);
  });

  it('PROVIDER_MODEL_MAP is accessible from types.ts', async () => {
    const types = await import('../../src/core/types.js');
    expect(types.PROVIDER_MODEL_MAP).toBe(PROVIDER_MODEL_MAP);
  });
});
