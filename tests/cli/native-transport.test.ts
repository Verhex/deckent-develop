// tests/cli/native-transport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNativeProvider } from '../../src/cli/repl/native-transport.js';

describe('resolveNativeProvider', () => {
  it('picks the Anthropic adapter when ANTHROPIC_API_KEY is set', () => {
    const r = resolveNativeProvider({ ANTHROPIC_API_KEY: 'sk-ant' }, {});
    expect('adapter' in r).toBe(true);
    if ('adapter' in r) {
      expect(r.adapter.name).toBe('anthropic');
      expect(typeof r.model).toBe('string');
      expect(r.model.length).toBeGreaterThan(0);
    }
  });
  it('picks an OpenAI-compatible adapter for OPENAI_API_KEY', () => {
    const r = resolveNativeProvider({ OPENAI_API_KEY: 'sk-oai' }, {});
    expect('adapter' in r && r.adapter.name).toBe('openai');
  });
  it('picks Ollama when only ollama_host is configured', () => {
    const r = resolveNativeProvider({}, { ollama_host: 'http://127.0.0.1:11434' });
    expect('adapter' in r && r.adapter.name).toBe('ollama');
  });
  it('honors DECKENT_NATIVE_MODEL override', () => {
    const r = resolveNativeProvider({ ANTHROPIC_API_KEY: 'k', DECKENT_NATIVE_MODEL: 'claude-fable-5' }, {});
    expect('adapter' in r && r.model).toBe('claude-fable-5');
  });
  it('returns an honest error (no adapter) when no transport is available', () => {
    const r = resolveNativeProvider({}, {});
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/API|yerel|ollama/i);
  });
});
