import { describe, it, expect } from 'vitest';
import {
  resolveChatProvider,
  resolveChatProviderWithFallback,
  assertChatProviderAvailable,
  ChatProviderError,
} from '../../src/core/config.js';

// All tests are hermetic — no file I/O, no gitignored state, no network calls.

describe('resolveChatProvider', () => {
  it('chat_provider takes priority over brain_provider', () => {
    const cfg = { chat_provider: 'codex' as const, brain_provider: 'gemini' as const };
    expect(resolveChatProvider(cfg)).toBe('codex');
  });

  it('brain_provider used when chat_provider absent', () => {
    const cfg = { brain_provider: 'gemini' as const };
    expect(resolveChatProvider(cfg)).toBe('gemini');
  });

  it('defaults to claude when both are absent', () => {
    expect(resolveChatProvider({})).toBe('claude');
    expect(resolveChatProvider(undefined)).toBe('claude');
    expect(resolveChatProvider(null)).toBe('claude');
  });

  it('returns claude for unknown/invalid provider values', () => {
    const cfg = { chat_provider: 'unknown-provider' as unknown as 'claude' };
    expect(resolveChatProvider(cfg)).toBe('claude');
  });

  it('handles ollama as a valid provider', () => {
    const cfg = { chat_provider: 'ollama' as const };
    expect(resolveChatProvider(cfg)).toBe('ollama');
  });
});

describe('resolveChatProviderWithFallback', () => {
  it('returns primary provider when available probe returns true', () => {
    const cfg = { chat_provider: 'codex' as const };
    const result = resolveChatProviderWithFallback(cfg, () => true);
    expect(result).toBe('codex');
  });

  it('falls back to ollama when primary unavailable and local_fallback=ollama', () => {
    const cfg = {
      chat_provider: 'gemini' as const,
      chat: { local_fallback: 'ollama' },
    };
    const result = resolveChatProviderWithFallback(cfg as any, () => false);
    expect(result).toBe('ollama');
  });

  it('returns primary when unavailable but no local_fallback configured', () => {
    const cfg = { chat_provider: 'codex' as const };
    // No chat.local_fallback — returns primary; caller must handle with assertChatProviderAvailable
    const result = resolveChatProviderWithFallback(cfg, () => false);
    expect(result).toBe('codex');
  });

  it('skips isAvailable probe when not provided', () => {
    const cfg = { brain_provider: 'gemini' as const };
    expect(resolveChatProviderWithFallback(cfg)).toBe('gemini');
  });
});

describe('assertChatProviderAvailable', () => {
  it('does not throw when provider is available', () => {
    expect(() => assertChatProviderAvailable('claude', true)).not.toThrow();
  });

  it('throws ChatProviderError with clear message when unavailable', () => {
    expect(() => assertChatProviderAvailable('ollama', false)).toThrow(ChatProviderError);
  });

  it('error message contains provider name and actionable guidance', () => {
    try {
      assertChatProviderAvailable('ollama', false, 'localhost:11434 erişilemedi');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ChatProviderError);
      const err = e as ChatProviderError;
      expect(err.message).toContain('ollama');
      expect(err.message).toContain('localhost:11434 erişilemedi');
      expect(err.code).toBe('PROVIDER_UNAVAILABLE');
      expect(err.provider).toBe('ollama');
    }
  });

  it('error has correct name and provider field', () => {
    try {
      assertChatProviderAvailable('gemini', false);
    } catch (e) {
      const err = e as ChatProviderError;
      expect(err.name).toBe('ChatProviderError');
      expect(err.provider).toBe('gemini');
    }
  });
});
