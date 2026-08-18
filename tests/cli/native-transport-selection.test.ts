// tests/cli/native-transport-selection.test.ts
// ═══ resolveNativeSelection / settings-pinned boot / context budget ══════════
// Born from the 2026-07-07 incident: /model — /provider switches never reached
// the native engine, and the boot path shipped an ollama tag at the anthropic
// transport. These tests pin the selection seam both paths now share.
import { describe, it, expect } from 'vitest';
import { discoverNativeEndpointModels, validateNativeModelIdentity } from '../../src/cli/repl/native-transport.js';
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
    const r = resolveNativeSelection({ provider: 'claude', model: 'claude-fable-5' }, { env: emptyEnv, config: cfg });
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

  it('rejects every legacy alias before provider credential lookup or adapter construction', () => {
    for (const provider of ['claude', 'openai', 'ollama', 'deepseek', 'qwen', 'glm']) {
      for (const alias of ['fable', 'opus', 'sonnet', 'haiku', 'gpt-5', 'gpt-5.6']) {
        const r = resolveNativeSelection(
          { provider, model: alias },
          { env: emptyEnv, config: cfg },
        );
        expect(r).toMatchObject({
          errorCode: 'legacy-model-alias',
          provider,
          detail: alias,
        });
      }
    }
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
  it('refuses every provider family with no authority (7086/560-001 — no per-family literals)', () => {
    expect(() => resolveContextBudgetTokens('ollama', {})).toThrowError(/INPUT_CONTEXT_AUTHORITY_UNAVAILABLE/);
    expect(() => resolveContextBudgetTokens('claude', {})).toThrowError(/INPUT_CONTEXT_AUTHORITY_UNAVAILABLE/);
    expect(() => resolveContextBudgetTokens('openai', {})).toThrowError(/INPUT_CONTEXT_AUTHORITY_UNAVAILABLE/);
  });
  it('an invalid override is not authority — typed refusal, never a literal fallback', () => {
    expect(() => resolveContextBudgetTokens('ollama', { native_context_tokens: -1 })).toThrowError(/INPUT_CONTEXT_AUTHORITY_UNAVAILABLE/);
    expect(() => resolveContextBudgetTokens('ollama', { native_context_tokens: 'x' as unknown as number })).toThrowError(/INPUT_CONTEXT_AUTHORITY_UNAVAILABLE/);
    // A real advertised window restores normal resolution.
    expect(resolveContextBudgetTokens('ollama', { native_context_tokens: -1 }, null, 32_768)).toBe(32_768);
  });
});

describe('inferNativeProviderForModel — bare /model provider inference', () => {
  it('maps canonical Claude IDs but never infers a provider from legacy aliases', () => {
    expect(inferNativeProviderForModel('claude-fable-5')).toBe('claude');
    for (const alias of ['fable', 'opus', 'sonnet', 'haiku', 'gpt-5', 'gpt-5.6']) {
      expect(inferNativeProviderForModel(alias)).toBeNull();
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

describe('local-llm model identity (LOCAL-LLM-MODEL-IDENTITY-001)', () => {
  const llmCfg = { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' } };

  it('refuses a missing model selection with a typed error — no hardcoded fallback identity', () => {
    const r = resolveNativeSelection(
      { provider: 'local-llm', model: null },
      { env: {}, config: llmCfg },
    );
    expect('errorCode' in r && r.errorCode).toBe('missing-native-model');
    expect('detail' in r && r.detail).toBe('native_model');
  });

  it('carries the exact selected model and a modelIdentity seam', () => {
    const r = resolveNativeSelection(
      { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
      { env: {}, config: llmCfg },
    );
    expect('model' in r && r.model).toBe('Qwen3.8-27B-Q4_K_M');
    expect('modelIdentity' in r && typeof r.modelIdentity).toBe('function');
  });

  it('discovery parses exact published router IDs and tolerates failure as typed data', async () => {
    const fetchOk = (async () => new Response(JSON.stringify({
      data: [{ id: 'Qwen3.8-27B-Q4_K_M' }, { id: 'Qwen3.8-27B-CRACK-Q6_K_L' }],
    }), { status: 200 })) as unknown as typeof fetch;
    const ok = await discoverNativeEndpointModels('http://127.0.0.1:8080/v1', fetchOk);
    expect(ok).toEqual({ ok: true, ids: ['Qwen3.8-27B-Q4_K_M', 'Qwen3.8-27B-CRACK-Q6_K_L'] });

    const fetchDown = (async () => { throw new Error('fetch failed'); }) as unknown as typeof fetch;
    const down = await discoverNativeEndpointModels('http://127.0.0.1:8080/v1', fetchDown);
    expect(down).toEqual({ ok: false, detail: 'fetch failed' });
  });

  it('validation verdicts: valid / unknown-model with published IDs / unreachable cold-start', async () => {
    const fetchOk = (async () => new Response(JSON.stringify({
      data: [{ id: 'Qwen3.8-27B-Q4_K_M' }],
    }), { status: 200 })) as unknown as typeof fetch;
    expect(await validateNativeModelIdentity('Qwen3.8-27B-Q4_K_M', 'http://x/v1', fetchOk))
      .toEqual({ state: 'valid', model: 'Qwen3.8-27B-Q4_K_M' });
    expect(await validateNativeModelIdentity('Qwen3.8-27B', 'http://x/v1', fetchOk))
      .toEqual({ state: 'unknown-model', model: 'Qwen3.8-27B', published: ['Qwen3.8-27B-Q4_K_M'] });
    const fetchDown = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    expect(await validateNativeModelIdentity('Qwen3.8-27B', 'http://x/v1', fetchDown))
      .toEqual({ state: 'unreachable', model: 'Qwen3.8-27B', detail: 'ECONNREFUSED' });
  });
});
