import { describe, it, expect } from 'vitest';
import {
  PROVIDER_MODEL_MAP,
  CLAUDE_MODELS,
  ALL_MODELS,
  MODEL_API_IDS,
  getProviderForModel,
  isClaudeModel,
  isOpenAIModel,
  isGeminiModel,
  getModelTier,
  isValidModel,
  resolveApiModelId,
  UnknownModelError,
} from '../../src/core/task-types.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import type {
  ClaudeModel,
  OpenAIModel,
  GeminiModel,
  ModelType,
  ProviderName,
} from '../../src/core/task-types.js';

// ─── PROVIDER_MODEL_MAP ──────────────────────────────────────────────────────

describe('PROVIDER_MODEL_MAP', () => {
  it('maps claude to every canonical Claude API identity', () => {
    expect(PROVIDER_MODEL_MAP.claude).toEqual([
      'claude-fable-5',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-haiku-4-5-20251001',
    ]);
  });

  it('maps codex to canonical core and parity API IDs', () => {
    expect(PROVIDER_MODEL_MAP.codex).toEqual([
      'o3', 'gpt-5.5', 'gpt-4.1', 'o4-mini', 'gpt-5-mini', 'gpt-4.1-mini',
      'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
    ]);
  });

  it('maps gemini to gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash', () => {
    expect(PROVIDER_MODEL_MAP.gemini).toEqual(['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']);
  });

  it('has every canonical provider including OpenRouter and local-llm', () => {
    // ddc523bf0 cursor adapter: PROVIDER_MODEL_MAP gained a 'cursor' getter
    // (7091 FAZ-1 spine) — 6 providers became 7.
    expect(Object.keys(PROVIDER_MODEL_MAP)).toHaveLength(7);
    expect(Object.keys(PROVIDER_MODEL_MAP).sort()).toEqual(['claude', 'codex', 'cursor', 'gemini', 'local-llm', 'ollama', 'openrouter']);
  });
});

// ─── CLAUDE_MODELS ───────────────────────────────────────────────────────────

describe('CLAUDE_MODELS', () => {
  it('contains every canonical Claude API identity', () => {
    expect(CLAUDE_MODELS).toEqual([
      'claude-fable-5',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-haiku-4-5-20251001',
    ]);
  });

  it('is readonly (cannot mutate)', () => {
    // TypeScript enforces this at compile time; runtime check that it is a frozen-like array
    expect(Array.isArray(CLAUDE_MODELS)).toBe(true);
  });
});

// ─── ALL_MODELS ──────────────────────────────────────────────────────────────

describe('ALL_MODELS', () => {
  it('contains the complete 18-model canonical offline catalog', () => {
    expect(ALL_MODELS).toHaveLength(18);
  });

  it('includes all Claude models', () => {
    for (const m of CLAUDE_MODELS) {
      expect(ALL_MODELS).toContain(m);
    }
  });

  it('includes OpenAI models', () => {
    expect(ALL_MODELS).toContain('gpt-5.5');
    expect(ALL_MODELS).toContain('gpt-5-mini');
    expect(ALL_MODELS).toContain('gpt-4.1');
    expect(ALL_MODELS).toContain('gpt-4.1-mini');
    expect(ALL_MODELS).toContain('o3');
    expect(ALL_MODELS).toContain('o4-mini');
  });

  it('includes Gemini models', () => {
    expect(ALL_MODELS).toContain('gemini-2.5-pro');
    expect(ALL_MODELS).toContain('gemini-2.5-flash');
    expect(ALL_MODELS).toContain('gemini-2.0-flash');
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
    expect(getProviderForModel('claude-opus-4-8')).toBe('claude');
  });

  it('returns claude for sonnet', () => {
    expect(getProviderForModel('claude-sonnet-5')).toBe('claude');
  });

  it('returns claude for haiku', () => {
    expect(getProviderForModel('claude-haiku-4-5-20251001')).toBe('claude');
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
    expect(isClaudeModel('claude-opus-4-8')).toBe(true);
  });

  it('returns true for sonnet', () => {
    expect(isClaudeModel('claude-sonnet-5')).toBe(true);
  });

  it('returns true for haiku', () => {
    expect(isClaudeModel('claude-haiku-4-5-20251001')).toBe(true);
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
    expect(isOpenAIModel('claude-opus-4-8')).toBe(false);
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
    expect(isGeminiModel('claude-opus-4-8')).toBe(false);
  });

  it('returns false for o3', () => {
    expect(isGeminiModel('o3')).toBe(false);
  });
});

// ─── getModelTier ────────────────────────────────────────────────────────────

describe('getModelTier', () => {
  it('tier 0 (economy): haiku, gpt-5-mini, gpt-4.1-mini, gemini-2.0-flash', () => {
    expect(getModelTier('claude-haiku-4-5-20251001')).toBe(0);
    expect(getModelTier('gpt-5-mini')).toBe(0);
    expect(getModelTier('gpt-4.1-mini')).toBe(0);
    expect(getModelTier('gemini-2.0-flash')).toBe(0);
  });

  it('tier 1 (standard): sonnet, gpt-4.1, o4-mini, gemini-2.5-flash', () => {
    expect(getModelTier('claude-sonnet-5')).toBe(1);
    expect(getModelTier('gpt-4.1')).toBe(1);
    expect(getModelTier('o4-mini')).toBe(1);
    expect(getModelTier('gemini-2.5-flash')).toBe(1);
  });

  it('tier 3 (premium_plus): o3, gemini-3.1-pro-preview', () => {
    expect(getModelTier('o3')).toBe(3);
    expect(getModelTier('gemini-3.1-pro-preview' as ModelType)).toBe(3);
  });

  it('tier 2 (premium): opus, gpt-5, gemini-2.5-pro', () => {
    expect(getModelTier('claude-opus-4-8')).toBe(2);
    expect(getModelTier('gpt-5.5')).toBe(2);
    expect(getModelTier('gemini-2.5-pro')).toBe(2);
  });

  it('all 13 models have a defined tier', () => {
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
    const models: ClaudeModel[] = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'];
    for (const m of models) {
      const _mt: ModelType = m; // compile-time check
      expect(isValidModel(_mt)).toBe(true);
    }
  });

  it('OpenAIModel values are valid ModelType values', () => {
    const models: OpenAIModel[] = ['gpt-5.5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'];
    for (const m of models) {
      const _mt: ModelType = m;
      expect(isValidModel(_mt)).toBe(true);
    }
  });

  it('GeminiModel values are valid ModelType values', () => {
    const models: GeminiModel[] = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.1-pro-preview'];
    for (const m of models) {
      const _mt: ModelType = m;
      expect(isValidModel(_mt)).toBe(true);
    }
  });

  it('ProviderName has exactly 4 valid values (claude, codex, gemini, ollama)', () => {
    // Sprint 202 Task 202-001: ollama widened the union.
    const providers: ProviderName[] = ['claude', 'codex', 'gemini', 'ollama'];
    expect(providers).toHaveLength(4);
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

// ─── MODEL_API_IDS ──────────────────────────────────────────────────────────

describe('MODEL_API_IDS', () => {
  it('maps Claude aliases to actual API model IDs', () => {
    expect(MODEL_API_IDS['claude-opus-4-8']).toBe('claude-opus-4-8');
    expect(MODEL_API_IDS['claude-sonnet-5']).toBe(modelRegistry.resolveApiId('claude-sonnet-5'));
    expect(MODEL_API_IDS['claude-haiku-4-5-20251001']).toBe('claude-haiku-4-5-20251001');
  });

  it('maps OpenAI models to their API IDs', () => {
    expect(MODEL_API_IDS['gpt-5.5']).toBe('gpt-5.5');
    expect(MODEL_API_IDS['gpt-4.1']).toBe('gpt-4.1');
    expect(MODEL_API_IDS['gpt-4.1-mini']).toBe('gpt-4.1-mini');
    expect(MODEL_API_IDS['gpt-5-mini']).toBe('gpt-5-mini');
    expect(MODEL_API_IDS['o3']).toBe('o3');
    expect(MODEL_API_IDS['o4-mini']).toBe('o4-mini');
  });

  it('maps Gemini models to their API IDs', () => {
    expect(MODEL_API_IDS['gemini-2.5-pro']).toBe('gemini-2.5-pro');
    expect(MODEL_API_IDS['gemini-2.5-flash']).toBe('gemini-2.5-flash');
    expect(MODEL_API_IDS['gemini-2.0-flash']).toBe('gemini-2.0-flash');
  });

  it('has an entry for every model in ALL_MODELS', () => {
    for (const m of ALL_MODELS) {
      expect(MODEL_API_IDS[m]).toBeDefined();
      expect(typeof MODEL_API_IDS[m]).toBe('string');
    }
  });
});

// ─── resolveApiModelId ──────────────────────────────────────────────────────

describe('resolveApiModelId', () => {
  it('resolves Claude aliases to full API model IDs', () => {
    expect(resolveApiModelId('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(resolveApiModelId('claude-sonnet-5')).toBe(modelRegistry.resolveApiId('claude-sonnet-5'));
    expect(resolveApiModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001');
  });

  it('resolves OpenAI models (alias = API ID)', () => {
    expect(resolveApiModelId('gpt-5.5')).toBe('gpt-5.5');
    expect(resolveApiModelId('gpt-4.1')).toBe('gpt-4.1');
    expect(resolveApiModelId('o3')).toBe('o3');
  });

  it('resolves Gemini models (alias = API ID)', () => {
    expect(resolveApiModelId('gemini-2.5-pro')).toBe('gemini-2.5-pro');
    expect(resolveApiModelId('gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });

  it('throws UnknownModelError for invalid model', () => {
    expect(() => resolveApiModelId('invalid' as ModelType)).toThrow(UnknownModelError);
  });
});

// ─── Tier consistency ──────────────────────────────────────────────────────

describe('Tier equivalence consistency', () => {
  it('each tier has a stable representative model per provider', () => {
    const tiers = [
      { tier: 2, claude: 'claude-opus-4-8', codex: 'gpt-5.5', gemini: 'gemini-2.5-pro' },
      { tier: 1, claude: 'claude-sonnet-5', codex: 'gpt-4.1', gemini: 'gemini-2.5-flash' },
      { tier: 0, claude: 'claude-haiku-4-5-20251001', codex: 'gpt-5-mini', gemini: 'gemini-2.0-flash' },
    ];
    for (const { tier, claude, codex, gemini } of tiers) {
      expect(getModelTier(claude as ModelType)).toBe(tier);
      expect(getModelTier(codex as ModelType)).toBe(tier);
      expect(getModelTier(gemini as ModelType)).toBe(tier);
    }
  });

  it('all canonical models have identity API IDs', () => {
    expect(Object.keys(MODEL_API_IDS)).toHaveLength(18);
    for (const [id, apiId] of Object.entries(MODEL_API_IDS)) {
      expect(apiId).toBe(id);
    }
  });
});
