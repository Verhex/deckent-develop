// Sprint 230 Task 230-002 — models.dev native wire
// Asserts that PROVIDER_MODEL_MAP, type guards, and provider adapters read
// from the live `modelRegistry` rather than a module-load snapshot, so that
// `bootstrapFromCatalog()` (models.dev) can introduce non-builtin models
// without a process restart.

import { afterEach, describe, expect, it } from 'vitest';
import {
  PROVIDER_MODEL_MAP,
  isClaudeModel,
  isGeminiModel,
  isOpenAIModel,
  getProviderForModel,
  isValidModel,
} from '../../src/core/task-types.js';
import type { ModelDefinition } from '../../src/core/model-registry.js';
import { modelRegistry } from '../../src/core/model-registry.js';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const NON_BUILTIN_CODEX_ID = 'gpt-5.5-models-dev-test';
const NON_BUILTIN_GEMINI_ID = 'gemini-3.5-flash-models-dev-test';
const NON_BUILTIN_CLAUDE_ID = 'claude-opus-5-models-dev-test';

function makeDef(id: string, provider: 'claude' | 'codex' | 'gemini'): ModelDefinition {
  return {
    id,
    apiId: id,
    provider,
    tier: 'standard',
    contextWindow: 200_000,
    costPerMillion: { input: 1, output: 4 },
    capabilities: {
      streaming: true,
      toolUse: true,
      vision: false,
      codeExecution: false,
      reasoning: false,
    },
    status: 'ga',
  };
}

// Cleanup: unregister test-injected models after every test to keep the
// shared registry hermetic across the suite.
const registeredTestIds: string[] = [];
afterEach(() => {
  while (registeredTestIds.length > 0) {
    const id = registeredTestIds.pop()!;
    modelRegistry.unregister(id);
  }
});

function registerTestModel(def: ModelDefinition): void {
  modelRegistry.register(def);
  registeredTestIds.push(def.id);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('models.dev wire — type guards loosened to registry lookup', () => {
  it('isOpenAIModel accepts a non-builtin codex model registered at runtime', () => {
    expect(isOpenAIModel(NON_BUILTIN_CODEX_ID)).toBe(false);
    registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
    expect(isOpenAIModel(NON_BUILTIN_CODEX_ID)).toBe(true);
  });

  it('isGeminiModel accepts a non-builtin gemini model registered at runtime', () => {
    expect(isGeminiModel(NON_BUILTIN_GEMINI_ID)).toBe(false);
    registerTestModel(makeDef(NON_BUILTIN_GEMINI_ID, 'gemini'));
    expect(isGeminiModel(NON_BUILTIN_GEMINI_ID)).toBe(true);
  });

  it('isClaudeModel accepts a non-builtin claude model registered at runtime', () => {
    expect(isClaudeModel(NON_BUILTIN_CLAUDE_ID)).toBe(false);
    registerTestModel(makeDef(NON_BUILTIN_CLAUDE_ID, 'claude'));
    expect(isClaudeModel(NON_BUILTIN_CLAUDE_ID)).toBe(true);
  });

  it('builtin models still resolve to the correct provider after the change', () => {
    expect(isClaudeModel('claude-opus-4-8')).toBe(true);
    expect(isOpenAIModel('gpt-4.1')).toBe(true);
    expect(isGeminiModel('gemini-2.5-pro')).toBe(true);
    expect(isClaudeModel('gpt-4.1')).toBe(false);
    expect(isOpenAIModel('claude-opus-4-8')).toBe(false);
    expect(isGeminiModel('claude-opus-4-8')).toBe(false);
  });
});

describe('models.dev wire — getProviderForModel maps non-builtin entries', () => {
  it('routes a non-builtin codex model to the codex provider', () => {
    registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
    expect(getProviderForModel(NON_BUILTIN_CODEX_ID)).toBe('codex');
  });

  it('routes a non-builtin gemini model to the gemini provider', () => {
    registerTestModel(makeDef(NON_BUILTIN_GEMINI_ID, 'gemini'));
    expect(getProviderForModel(NON_BUILTIN_GEMINI_ID)).toBe('gemini');
  });

  it('isValidModel returns true for a registered non-builtin model and false before', () => {
    expect(isValidModel(NON_BUILTIN_CODEX_ID)).toBe(false);
    registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
    expect(isValidModel(NON_BUILTIN_CODEX_ID)).toBe(true);
  });
});

describe('models.dev wire — PROVIDER_MODEL_MAP reads live registry', () => {
  it('exposes a freshly registered codex model on PROVIDER_MODEL_MAP.codex', () => {
    const before = [...PROVIDER_MODEL_MAP.codex];
    expect(before).not.toContain(NON_BUILTIN_CODEX_ID);
    registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
    const after = [...PROVIDER_MODEL_MAP.codex];
    expect(after).toContain(NON_BUILTIN_CODEX_ID);
    // Live readers should not return the stale `before` snapshot.
    expect(after.length).toBe(before.length + 1);
  });

  it('exposes a freshly registered gemini model on PROVIDER_MODEL_MAP.gemini', () => {
    expect(PROVIDER_MODEL_MAP.gemini).not.toContain(NON_BUILTIN_GEMINI_ID);
    registerTestModel(makeDef(NON_BUILTIN_GEMINI_ID, 'gemini'));
    expect(PROVIDER_MODEL_MAP.gemini).toContain(NON_BUILTIN_GEMINI_ID);
  });

  it('removes an unregistered model from PROVIDER_MODEL_MAP on next access (live read)', () => {
    registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
    expect(PROVIDER_MODEL_MAP.codex).toContain(NON_BUILTIN_CODEX_ID);
    modelRegistry.unregister(NON_BUILTIN_CODEX_ID);
    // Pull the id out of the cleanup queue since we already unregistered it.
    const idx = registeredTestIds.indexOf(NON_BUILTIN_CODEX_ID);
    if (idx >= 0) registeredTestIds.splice(idx, 1);
    expect(PROVIDER_MODEL_MAP.codex).not.toContain(NON_BUILTIN_CODEX_ID);
  });

  it('preserves builtin model coverage when no extras are registered', () => {
    // Builtin baseline — these must always be present in the live view.
    expect(PROVIDER_MODEL_MAP.claude).toEqual(
      expect.arrayContaining(['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']),
    );
    expect(PROVIDER_MODEL_MAP.codex).toEqual(
      expect.arrayContaining(['gpt-5.6-sol', 'gpt-4.1', 'o3']),
    );
    expect(PROVIDER_MODEL_MAP.gemini).toEqual(
      expect.arrayContaining(['gemini-2.5-pro', 'gemini-2.5-flash']),
    );
  });
});

describe('models.dev wire — provider adapter supportedModels is live', () => {
  it('ClaudeAdapter.supportedModels reflects a runtime-registered claude model', async () => {
    const { ClaudeAdapter } = await import('../../src/providers/claude.js');
    const adapter = new ClaudeAdapter('/tmp/deckent-models-dev-wire-test');
    expect(adapter.supportedModels).not.toContain(NON_BUILTIN_CLAUDE_ID);
    registerTestModel(makeDef(NON_BUILTIN_CLAUDE_ID, 'claude'));
    expect(adapter.supportedModels).toContain(NON_BUILTIN_CLAUDE_ID);
  });

  it('CodexAdapter.supportedModels reflects a runtime-registered codex model', async () => {
    const { CodexAdapter } = await import('../../src/providers/codex.js');
    const adapter = new CodexAdapter('/tmp/deckent-models-dev-wire-test');
    expect(adapter.supportedModels).not.toContain(NON_BUILTIN_CODEX_ID);
    registerTestModel(makeDef(NON_BUILTIN_CODEX_ID, 'codex'));
    expect(adapter.supportedModels).toContain(NON_BUILTIN_CODEX_ID);
  });

  it('GeminiAdapter.supportedModels reflects a runtime-registered gemini model', async () => {
    const { GeminiAdapter } = await import('../../src/providers/gemini.js');
    const adapter = new GeminiAdapter('/tmp/deckent-models-dev-wire-test');
    expect(adapter.supportedModels).not.toContain(NON_BUILTIN_GEMINI_ID);
    registerTestModel(makeDef(NON_BUILTIN_GEMINI_ID, 'gemini'));
    expect(adapter.supportedModels).toContain(NON_BUILTIN_GEMINI_ID);
  });
});
