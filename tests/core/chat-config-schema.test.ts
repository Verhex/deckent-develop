import { describe, it, expect } from 'vitest';
import {
  CHAT_CONFIG_SCHEMA,
  resolveChatConfig,
  deepMerge,
} from '../../src/core/config.js';
import type { ChatConfig } from '../../src/core/config.js';

// All tests are hermetic — no file I/O, no gitignored state, no network calls.

describe('CHAT_CONFIG_SCHEMA', () => {
  it('parses a valid full chat config object', () => {
    const input = {
      provider: 'ollama',
      mode: 'enterprise',
      status_line: true,
      local_fallback: 'ollama',
      slash_extra: ['/mycommand'],
    };
    const result = CHAT_CONFIG_SCHEMA.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe('ollama');
      expect(result.data.mode).toBe('enterprise');
      expect(result.data.status_line).toBe(true);
      expect(result.data.local_fallback).toBe('ollama');
      expect(result.data.slash_extra).toEqual(['/mycommand']);
    }
  });

  it('accepts empty object — all fields are optional (sade default)', () => {
    const result = CHAT_CONFIG_SCHEMA.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBeUndefined();
      expect(result.data.mode).toBeUndefined();
      expect(result.data.status_line).toBeUndefined();
    }
  });

  it('accepts status_line as a string array (field list)', () => {
    const result = CHAT_CONFIG_SCHEMA.safeParse({ status_line: ['provider', 'sprint'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.status_line)).toBe(true);
    }
  });

  it('rejects invalid mode value', () => {
    const result = CHAT_CONFIG_SCHEMA.safeParse({ mode: 'admin' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid provider value', () => {
    const result = CHAT_CONFIG_SCHEMA.safeParse({ provider: 'unknown-llm' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown extra fields (strict mode)', () => {
    const result = CHAT_CONFIG_SCHEMA.safeParse({ unknownField: true });
    expect(result.success).toBe(false);
  });
});

describe('resolveChatConfig', () => {
  it('returns parsed ChatConfig when chat block is valid', () => {
    const config = { chat: { provider: 'ollama', mode: 'user' } };
    const result: ChatConfig = resolveChatConfig(config as any);
    expect(result.provider).toBe('ollama');
    expect(result.mode).toBe('user');
  });

  it('returns empty object when config is null', () => {
    expect(resolveChatConfig(null)).toEqual({});
  });

  it('returns empty object when config is undefined', () => {
    expect(resolveChatConfig(undefined)).toEqual({});
  });

  it('returns empty object when chat block is absent', () => {
    const config = { brain_provider: 'claude' };
    expect(resolveChatConfig(config as any)).toEqual({});
  });

  it('returns empty object when chat block is invalid (invalid mode)', () => {
    const config = { chat: { mode: 'superuser' } };
    expect(resolveChatConfig(config as any)).toEqual({});
  });

  it('returns empty object when chat block is an array (non-object)', () => {
    const config = { chat: ['provider'] };
    expect(resolveChatConfig(config as any)).toEqual({});
  });
});

describe('3-layer merge for chat config', () => {
  it('project chat block overrides global chat block (deepMerge semantics)', () => {
    const globalBase = { chat: { provider: 'claude' as const, mode: 'user' as const } };
    const projectOverride = { chat: { provider: 'ollama' as const } };
    const merged = deepMerge(globalBase, projectOverride as any);
    const resolved = resolveChatConfig(merged as any);
    // project provider wins; global mode is preserved
    expect(resolved.provider).toBe('ollama');
    expect(resolved.mode).toBe('user');
  });

  it('enterprise chat.mode visible only when explicitly set in config', () => {
    const global = { chat: { mode: 'user' as const } };
    const project = { chat: { mode: 'enterprise' as const } };
    const merged = deepMerge(global, project as any);
    const resolved = resolveChatConfig(merged as any);
    expect(resolved.mode).toBe('enterprise');
  });

  it('slash_extra is replaced by project layer (not concatenated)', () => {
    const global = { chat: { slash_extra: ['/alpha'] } };
    const project = { chat: { slash_extra: ['/beta', '/gamma'] } };
    const merged = deepMerge(global, project as any);
    const resolved = resolveChatConfig(merged as any);
    // deepMerge replaces arrays (not concat) — project wins
    expect(resolved.slash_extra).toEqual(['/beta', '/gamma']);
  });
});
