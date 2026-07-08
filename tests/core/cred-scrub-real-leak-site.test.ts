/**
 * tests/core/cred-scrub-real-leak-site.test.ts
 *
 * born-518-REDO (task 382-002) — CRED-SCRUB wired to the REAL leak site.
 *
 * Sprint-1 (born-518) wired the scrub-then-reinject pattern into
 * `providers/subprocess.ts` via a standalone helper module
 * (`providers/provider.ts`) instead of fixing it at the source. The actual
 * leak site is `applyDeckSecretsToEnv` (`core/provider.ts:806`, audit §4.4):
 * it writes every configured provider's `.deck` secret into the shared
 * `process.env` unconditionally. This task moves the scrub helpers into
 * `core/provider.ts` (co-located with the write site) and adds
 * `scrubForeignProviderEnv`, which derives its scrub set directly from
 * `applyDeckSecretsToEnv`'s own return value — so the two can never drift.
 *
 * §A proves the end-to-end contract at core level: applyDeckSecretsToEnv +
 * scrubForeignProviderEnv together give every provider's child env ONLY its
 * own key, across a mixed fleet of all 6 built-in providers + one
 * config-driven provider (goCriteria: "her non-tmux provider child-env
 * dump'ında SIFIR yabancı-secret").
 * §B is a regression check for the moved scrubCrossProviderEnv/
 * buildProviderChildEnv primitives, now imported from core/provider.js.
 *
 * Hermetic: process.env is snapshotted + restored around every test; no
 * disk I/O, no subprocess spawn — every function under test is pure.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  applyDeckSecretsToEnv,
  scrubCrossProviderEnv,
  buildProviderChildEnv,
  scrubForeignProviderEnv,
} from '../../src/core/provider.js';

/** Every built-in provider credential env var, in canonical map order. */
const BASE_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
] as const;

// ═══════════════════════════════════════════════════════════════════════
// §A — applyDeckSecretsToEnv + scrubForeignProviderEnv, mixed fleet
// ═══════════════════════════════════════════════════════════════════════

describe('§A core/provider.ts — applyDeckSecretsToEnv leak-site closed by scrubForeignProviderEnv', () => {
  let saved: Record<string, string | undefined>;
  const ALL_KEYS = [...BASE_KEYS, 'MY_LLM_KEY'] as const;

  beforeEach(() => {
    saved = {};
    for (const k of ALL_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ALL_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('every provider identity sees ONLY its own key across a full 6-provider + config-driven mixed fleet', () => {
    const overrides = applyDeckSecretsToEnv(
      {
        DECKENT_CLAUDE_API_KEY: 'sk-ant-xxx',
        DECKENT_OPENAI_API_KEY: 'sk-oai-yyy',
        DECKENT_GOOGLE_API_KEY: 'goog-zzz',
        DECKENT_DEEPSEEK_API_KEY: 'ds-www',
        DECKENT_DASHSCOPE_API_KEY: 'qw-vvv',
        DECKENT_ZHIPU_API_KEY: 'zp-uuu',
        DECKENT_MY_LLM_KEY: 'my-llm-ttt',
      },
      [{ name: 'my-llm', type: 'openai-compatible', baseUrl: 'https://api.my-llm.test/v1', apiKeyEnv: 'MY_LLM_KEY', models: ['my-llm-large'] }],
    );

    // Sanity: applyDeckSecretsToEnv did write every provider's key into the
    // shared process.env (the leak-site behavior we are NOT changing).
    for (const k of ALL_KEYS) {
      expect(process.env[k]).toBeDefined();
    }

    const hostEnvSnapshot: NodeJS.ProcessEnv = { ...process.env, PATH: '/usr/bin' };
    const identities = Object.keys(overrides);
    expect(identities.sort()).toEqual(
      ['claude', 'codex', 'gemini', 'deepseek', 'qwen', 'zhipu', 'my-llm'].sort(),
    );

    for (const target of identities) {
      const childEnv = scrubForeignProviderEnv(hostEnvSnapshot, target, overrides);
      const ownKey = Object.keys(overrides[target]!)[0]!;
      expect(childEnv[ownKey]).toBe(overrides[target]![ownKey]);

      for (const other of identities) {
        if (other === target) continue;
        for (const foreignKey of Object.keys(overrides[other]!)) {
          expect(childEnv[foreignKey], `${target} child env must not see ${other}'s ${foreignKey}`).toBeUndefined();
        }
      }
      // Non-credential vars survive untouched.
      expect(childEnv['PATH']).toBe('/usr/bin');
    }
  });

  it('a provider with no override map entry (e.g. subscription-mode / no .deck secret) gets NO credential key at all', () => {
    const overrides = applyDeckSecretsToEnv({ DECKENT_CLAUDE_API_KEY: 'sk-ant-xxx' });
    const hostEnvSnapshot: NodeJS.ProcessEnv = { ...process.env, PATH: '/usr/bin' };

    const childEnv = scrubForeignProviderEnv(hostEnvSnapshot, 'ollama', overrides);
    expect(childEnv['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(childEnv['PATH']).toBe('/usr/bin');
  });

  it('never mutates the hostEnv snapshot passed in', () => {
    const overrides = applyDeckSecretsToEnv({
      DECKENT_CLAUDE_API_KEY: 'sk-ant-xxx',
      DECKENT_OPENAI_API_KEY: 'sk-oai-yyy',
    });
    const hostEnvSnapshot: NodeJS.ProcessEnv = { ...process.env };
    const before = { ...hostEnvSnapshot };

    scrubForeignProviderEnv(hostEnvSnapshot, 'claude', overrides);
    expect(hostEnvSnapshot).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §B — scrubCrossProviderEnv / buildProviderChildEnv regression (moved from
// providers/provider.ts — now the canonical core/provider.ts home)
// ═══════════════════════════════════════════════════════════════════════

describe('§B core/provider.ts — scrubCrossProviderEnv (moved primitive)', () => {
  it('removes every key in scrubKeys, keeps everything else', () => {
    const host: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-oai',
      PATH: '/usr/bin',
      LANG: 'en_US.UTF-8',
    };
    const result = scrubCrossProviderEnv(host, ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
    expect(result['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(result['OPENAI_API_KEY']).toBeUndefined();
    expect(result['PATH']).toBe('/usr/bin');
    expect(result['LANG']).toBe('en_US.UTF-8');
  });

  it('never mutates the input hostEnv', () => {
    const host: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-ant', PATH: '/usr/bin' };
    scrubCrossProviderEnv(host, ['ANTHROPIC_API_KEY']);
    expect(host['ANTHROPIC_API_KEY']).toBe('sk-ant');
  });
});

describe('§B core/provider.ts — buildProviderChildEnv (moved primitive)', () => {
  it('scrubs foreign keys then re-injects ownEnv on top', () => {
    const host: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-ant-HOST',
      OPENAI_API_KEY: 'sk-oai-HOST',
      PATH: '/usr/bin',
    };
    const result = buildProviderChildEnv(host, [...BASE_KEYS], { OPENAI_API_KEY: 'sk-oai-OWN' });
    expect(result['OPENAI_API_KEY']).toBe('sk-oai-OWN');
    expect(result['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(result['PATH']).toBe('/usr/bin');
  });

  it('with no ownEnv, the child gets NO credential key at all (subscription/session auth fallback)', () => {
    const host: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-ant-HOST', PATH: '/usr/bin' };
    const result = buildProviderChildEnv(host, [...BASE_KEYS]);
    expect(result['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(result['PATH']).toBe('/usr/bin');
  });
});
