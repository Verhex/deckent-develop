import { describe, it, expect } from 'vitest';
import { countTokensExternal } from '../../src/core/tokenizer-fallback.js';

// Worker Output Contract spec §1.3 — external token estimation for providers
// that do NOT report usage. Faithful: each assertion fails without the module.
describe('tokenizer-fallback / countTokensExternal', () => {
  it('counts a known-family model externally, marked tokenizer-fallback (spec goNogo)', () => {
    const u = countTokensExternal({ prompt: 'aaaa', output: 'bbbb', model: 'qwen2.5', provider: 'ollama' });
    expect(u.inputTokens).toBeGreaterThan(0);
    expect(u.outputTokens).toBeGreaterThan(0);
    expect(u.source).toBe('tokenizer-fallback');
    expect(u.totalTokens).toBe(u.inputTokens + u.outputTokens);
  });

  it('UNKNOWN model still yields >0 (heuristic, never silent-zero)', () => {
    const u = countTokensExternal({
      prompt: 'a real prompt with several words',
      output: 'a real answer',
      model: 'totally-unknown-model-xyz',
      provider: 'mystery',
    });
    expect(u.inputTokens).toBeGreaterThan(0);
    expect(u.outputTokens).toBeGreaterThan(0);
    expect(u.source).toBe('tokenizer-fallback');
  });

  it('empty text → 0 (correct; not forced to ≥1)', () => {
    const u = countTokensExternal({ prompt: '', output: '', model: 'claude-opus-4-8', provider: 'claude' });
    expect(u.inputTokens).toBe(0);
    expect(u.outputTokens).toBe(0);
    expect(u.totalTokens).toBe(0);
  });

  it('scales with text length (longer prompt → more tokens)', () => {
    const short = countTokensExternal({ prompt: 'hi', output: '', model: 'deepseek-chat', provider: 'deepseek' });
    const long = countTokensExternal({ prompt: 'hi '.repeat(200), output: '', model: 'deepseek-chat', provider: 'deepseek' });
    expect(long.inputTokens).toBeGreaterThan(short.inputTokens);
  });

  it('is total — never throws on empty/garbage input', () => {
    expect(() => countTokensExternal({ prompt: '', output: '', model: '', provider: '' })).not.toThrow();
  });
});
