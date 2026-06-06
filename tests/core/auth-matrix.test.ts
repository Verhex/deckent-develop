/**
 * Sprint 238 İŞ7 — Auth matrix: per-provider credential isolation (F1-014).
 *
 * F1-014 (per-worker auth isolation contract, load-bearing): each worker env
 * gets ONLY its provider's credential; a subscription Claude worker gets NO
 * `ANTHROPIC_API_KEY`; zero cross-leak. The primitive that enforces this is
 * `applyDeckSecretsToEnv`, which maps `.deck` secrets to per-provider override
 * maps that `bootstrapProviders` hands to the spawn backend per worker.
 *
 * Matrix covered (the 4 auth combinations that matter for the mixed fleet):
 *  - subscription Claude → NO key (subscription mode never loads `.deck`, so the
 *    secrets map is empty → no override → worker spawns with session auth only).
 *  - api Claude       → ANTHROPIC_API_KEY only.
 *  - api Codex        → OPENAI_API_KEY only (no ANTHROPIC leak).
 *  - ollama (host)    → never appears in deck-secret overrides (host-HTTP, no key).
 *
 * Hermetic: `applyDeckSecretsToEnv` mutates `process.env` for the keys it sets;
 * we snapshot + restore every touched var so the test leaves no global state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyDeckSecretsToEnv } from '../../src/core/provider.js';

// Every env var applyDeckSecretsToEnv may write — snapshot + restore around each test.
const TOUCHED_ENV = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
] as const;

describe('Sprint 238 İŞ7 — auth matrix: per-provider credential isolation (F1-014)', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of TOUCHED_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of TOUCHED_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('each provider override map carries ONLY its own credential (zero cross-leak)', () => {
    const overrides = applyDeckSecretsToEnv({
      DECKENT_CLAUDE_API_KEY: 'sk-ant-xxx',
      DECKENT_OPENAI_API_KEY: 'sk-oai-yyy',
      DECKENT_GOOGLE_API_KEY: 'goog-zzz',
    });

    // Each map = exactly one credential, the provider's own.
    expect(overrides.claude).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(overrides.codex).toEqual({ OPENAI_API_KEY: 'sk-oai-yyy' });
    expect(overrides.gemini).toEqual({ GOOGLE_API_KEY: 'goog-zzz' });

    // Non-leak: no map carries another provider's credential.
    expect(overrides.claude!['OPENAI_API_KEY']).toBeUndefined();
    expect(overrides.claude!['GOOGLE_API_KEY']).toBeUndefined();
    expect(overrides.codex!['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(overrides.codex!['GOOGLE_API_KEY']).toBeUndefined();
    expect(overrides.gemini!['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(overrides.gemini!['OPENAI_API_KEY']).toBeUndefined();
  });

  it('subscription mode (empty secrets) → empty overrides → Claude worker gets NO ANTHROPIC_API_KEY', () => {
    // Subscription mode never loads .deck, so bootstrapProviders passes {} here.
    const overrides = applyDeckSecretsToEnv({});
    expect(overrides).toEqual({});
    expect(overrides.claude).toBeUndefined();
  });

  it('only the provided provider produces an override; ollama (host-HTTP) never appears', () => {
    const overrides = applyDeckSecretsToEnv({ DECKENT_OPENAI_API_KEY: 'sk-oai' });
    expect(overrides.codex).toEqual({ OPENAI_API_KEY: 'sk-oai' });
    expect(overrides.claude).toBeUndefined();
    expect(overrides.gemini).toBeUndefined();
    // ollama runs on the host over HTTP — it has no deck secret → no override entry.
    expect(overrides['ollama']).toBeUndefined();
  });

  it('matrix: the 4 auth combinations resolve to isolated/empty credential sets', () => {
    // 1) subscription Claude → no key
    expect(applyDeckSecretsToEnv({}).claude).toBeUndefined();

    // 2) api Claude → ANTHROPIC_API_KEY only
    expect(applyDeckSecretsToEnv({ DECKENT_CLAUDE_API_KEY: 'k' }).claude).toEqual({ ANTHROPIC_API_KEY: 'k' });

    // 3) api Codex → OPENAI_API_KEY only, no ANTHROPIC leak
    const codexOnly = applyDeckSecretsToEnv({ DECKENT_OPENAI_API_KEY: 'o' });
    expect(codexOnly.codex).toEqual({ OPENAI_API_KEY: 'o' });
    expect(codexOnly.claude).toBeUndefined();

    // 4) ollama host → empty (no deck key needed)
    const ollamaHost = applyDeckSecretsToEnv({});
    expect(ollamaHost.codex).toBeUndefined();
    expect(ollamaHost['ollama']).toBeUndefined();
  });

  it('empty-string keys are ignored (no override, no env mutation)', () => {
    const overrides = applyDeckSecretsToEnv({ DECKENT_CLAUDE_API_KEY: '' });
    expect(overrides.claude).toBeUndefined();
    expect(process.env['ANTHROPIC_API_KEY']).toBeUndefined();
  });
});
