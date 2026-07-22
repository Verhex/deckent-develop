// tests/cli/native-transport-selection.test.ts
// ═══ resolveNativeSelection / settings-pinned boot / context budget ══════════
// Born from the 2026-07-07 incident: /model — /provider switches never reached
// the native engine, and the boot path shipped an ollama tag at the anthropic
// transport. These tests pin the selection seam both paths now share.
import { describe, it, expect } from 'vitest';
import {
  resolveNativeSelection,
  resolveNativeProvider,
  resolveContextBudgetTokens,
  inferNativeProviderForModel,
  type NativeTransportConfig,
} from '../../src/cli/repl/native-transport.js';

const emptyEnv: Record<string, string | undefined> = {};

function ok(r: ReturnType<typeof resolveNativeSelection>): asserts r is Exclude<typeof r, { error: string }> {
  expect(r).not.toHaveProperty('error');
}

describe('resolveNativeSelection — claude', () => {
  const cfg: NativeTransportConfig = {};

  it('refuses without an API key (errorCode missing-api-key, no silent fallback)', () => {
    const r = resolveNativeSelection({ provider: 'claude', model: 'fable' }, { env: emptyEnv, config: cfg });
    expect(r).toMatchObject({ errorCode: 'missing-api-key', provider: 'claude' });
  });

  it('resolves with a .deck DECKENT_CLAUDE_API_KEY (ADR-G-005: .deck over env)', () => {
    const r = resolveNativeSelection(
      { provider: 'claude', model: 'claude-fable-5' },
      { env: emptyEnv, config: cfg, secrets: { DECKENT_CLAUDE_API_KEY: 'sk-deck' } },
    );
    ok(r);
    expect(r.providerName).toBe('claude');
    expect(r.adapter.name).toBe('anthropic');
  });

  it('resolves with env ANTHROPIC_API_KEY when .deck has no key', () => {
    const r = resolveNativeSelection({ provider: 'claude', model: null }, { env: { ANTHROPIC_API_KEY: 'sk-env' }, config: cfg });
    ok(r);
    expect(r.providerName).toBe('claude');
  });

  it("rejects the legacy 'fable' alias at the native execution boundary", () => {
    const r = resolveNativeSelection(
      { provider: 'claude', model: 'fable' },
      { env: { ANTHROPIC_API_KEY: 'k' }, config: cfg },
    );
    expect(r).toMatchObject({ errorCode: 'unknown-model', provider: 'claude', detail: 'fable' });
  });

  it('never ships a non-claude model id at the anthropic transport (incident guard)', () => {
    const r = resolveNativeSelection(
      { provider: 'claude', model: null },
      { env: { ANTHROPIC_API_KEY: 'k' }, config: { native_model: 'qwen3.6:27b' } },
    );
    ok(r);
    expect(r.model.startsWith('claude')).toBe(true);
  });

  // REPL-575 K6 — an explicit `/model <foreign-id>` whose provider does not
  // infer to anything (deepseek-chat has no colon, no gpt/gemini prefix) keeps
  // the provider on claude; inferProviderFromId's 'claude' fallback used to let
  // it ship at the Anthropic API with a false 'switched' report. It must now be
  // REFUSED with a switchError, not resolved.
  it('refuses an unrecognized non-claude model id instead of shipping it (errorCode unknown-model)', () => {
    const r = resolveNativeSelection(
      { provider: 'claude', model: 'deepseek-chat' },
      { env: { ANTHROPIC_API_KEY: 'k' }, config: {} },
    );
    expect(r).toMatchObject({ errorCode: 'unknown-model', provider: 'claude', detail: 'deepseek-chat' });
  });

  it('rejects a claude-shaped id until catalog registration supplies authority', () => {
    const r = resolveNativeSelection(
      { provider: 'claude', model: 'claude-future-9' },
      { env: { ANTHROPIC_API_KEY: 'k' }, config: {} },
    );
    expect(r).toMatchObject({ errorCode: 'unknown-model', provider: 'claude', detail: 'claude-future-9' });
  });
});

describe('resolveNativeSelection — ollama / vendors / unsupported', () => {
  it('resolves ollama from config host + keeps a local tag model', () => {
    const r = resolveNativeSelection(
      { provider: 'ollama', model: null },
      { env: emptyEnv, config: { ollama_host: 'http://127.0.0.1:11434', native_model: 'qwen3.6:27b' } },
    );
    ok(r);
    expect(r).toMatchObject({ providerName: 'ollama', model: 'qwen3.6:27b' });
  });

  it('refuses ollama without a host (errorCode missing-ollama-host)', () => {
    const r = resolveNativeSelection({ provider: 'ollama', model: null }, { env: emptyEnv, config: {} });
    expect(r).toMatchObject({ errorCode: 'missing-ollama-host' });
  });

  it('does not leak a claude alias from config into the ollama default', () => {
    const r = resolveNativeSelection(
      { provider: 'ollama', model: null },
      { env: emptyEnv, config: { ollama_host: 'http://127.0.0.1:11434', native_model: 'fable' } },
    );
    ok(r);
    expect(r.model).toBe('qwen2.5-coder:7b');
  });

  it('resolves vendor presets from their key envs (deepseek) and refuses without', () => {
    const missing = resolveNativeSelection({ provider: 'deepseek', model: null }, { env: emptyEnv, config: {} });
    expect(missing).toMatchObject({ errorCode: 'missing-api-key', detail: 'DEEPSEEK_API_KEY' });
    const r = resolveNativeSelection({ provider: 'deepseek', model: null }, { env: { DEEPSEEK_API_KEY: 'k' }, config: {} });
    ok(r);
    expect(r).toMatchObject({ providerName: 'deepseek', model: 'deepseek-chat' });
  });

  it('honestly refuses subscription-CLI providers (codex/gemini)', () => {
    for (const provider of ['codex', 'gemini']) {
      const r = resolveNativeSelection({ provider, model: null }, { env: emptyEnv, config: {} });
      expect(r).toMatchObject({ errorCode: 'unsupported-native-provider', detail: provider });
    }
  });
});

describe('resolveNativeProvider — settings pin (native_provider)', () => {
  it('binds claude+fable from settings when a .deck key exists', () => {
    const r = resolveNativeProvider(
      emptyEnv,
      { native_provider: 'claude', native_model: 'claude-fable-5' },
      { DECKENT_CLAUDE_API_KEY: 'sk-deck' },
    );
    ok(r);
    expect(r).toMatchObject({ providerName: 'claude', model: 'claude-fable-5' });
  });

  it('fails honestly (no detection fall-through) when the pinned provider cannot resolve', () => {
    // ollama_host present — silent fallback would have picked it; the pin must not.
    const r = resolveNativeProvider(
      emptyEnv,
      { native_provider: 'claude', native_model: 'claude-fable-5', ollama_host: 'http://127.0.0.1:11434' },
    );
    expect(r).toMatchObject({ errorCode: 'missing-api-key' });
  });

  it('keeps the detection order when no pin is set (env key → claude)', () => {
    const r = resolveNativeProvider({ ANTHROPIC_API_KEY: 'k' }, { native_model: 'claude-fable-5' });
    ok(r);
    expect(r).toMatchObject({ providerName: 'claude', model: 'claude-fable-5' });
  });

  it('detects ollama from config when nothing else is bound', () => {
    const r = resolveNativeProvider(emptyEnv, { ollama_host: 'http://127.0.0.1:11434', native_model: 'qwen3.6:27b' });
    ok(r);
    expect(r).toMatchObject({ providerName: 'ollama', model: 'qwen3.6:27b' });
  });
});

describe('resolveContextBudgetTokens', () => {
  it('uses the explicit config override when valid', () => {
    expect(resolveContextBudgetTokens('ollama', { native_context_tokens: 8000 })).toBe(8000);
  });
  it('defaults per provider family (ollama small, claude large)', () => {
    expect(resolveContextBudgetTokens('ollama', {})).toBe(24_000);
    expect(resolveContextBudgetTokens('claude', {})).toBe(160_000);
    expect(resolveContextBudgetTokens('openai', {})).toBe(100_000);
  });
  it('ignores invalid overrides', () => {
    expect(resolveContextBudgetTokens('ollama', { native_context_tokens: -1 })).toBe(24_000);
    expect(resolveContextBudgetTokens('ollama', { native_context_tokens: 'x' as unknown as number })).toBe(24_000);
  });
});

describe('inferNativeProviderForModel — bare /model provider inference', () => {
  it('maps unambiguous claude ids/aliases to claude', () => {
    for (const m of ['fable', 'opus', 'sonnet', 'haiku', 'claude-fable-5']) {
      expect(inferNativeProviderForModel(m)).toBe('claude');
    }
  });
  it('maps name:tag shapes to ollama and gpt/o-series to openai', () => {
    expect(inferNativeProviderForModel('qwen3.6:27b')).toBe('ollama');
    expect(inferNativeProviderForModel('gpt-4.1')).toBe('openai');
    expect(inferNativeProviderForModel('o3')).toBe('openai');
  });
  it('returns null for ambiguous ids (no silent re-route of vendor models)', () => {
    expect(inferNativeProviderForModel('deepseek-chat')).toBeNull();
    expect(inferNativeProviderForModel('glm-4-plus')).toBeNull();
    expect(inferNativeProviderForModel('qwen-plus')).toBeNull();
  });
});
