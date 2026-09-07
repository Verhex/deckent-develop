import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildMemoryReadLabels } from '../../src/core/memory-read-labels.js';
import {
  getMemoryReadMessage,
  MEMORY_READ_MESSAGES,
  resolveMemoryReadAmbientLanguage,
  resolveMemoryReadLanguage,
} from '../../src/core/memory-read-messages.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

describe('memory read presentation labels', () => {
  it('injects the caller catalog and defaults to English', () => {
    const message = vi.fn((key: string, language: string) => `${language}:${key}`);
    const labels = buildMemoryReadLabels(message);
    expect(labels.source).toBe('en:memory_read.source');
    expect(labels.updatedAt).toBe('en:memory_read.updated_at');
    expect(Object.values(labels)).toHaveLength(10);
    expect(Object.isFrozen(labels)).toBe(true);
  });

  it.each(['en', 'tr'])('resolves every label and state message in %s', language => {
    const labels = buildMemoryReadLabels(getMessage, language);
    for (const value of Object.values(labels)) {
      expect(value).toBeTruthy();
      expect(value).not.toContain('memory_read.');
    }
    const hold = getMessage('memory_read.hold', language, { reason: 'REQUIRED_ENTRY_MISSING' });
    expect(hold).toContain('REQUIRED_ENTRY_MISSING');
    expect(hold).not.toContain('{reason}');
    expect(getMessage('memory_read.invalid_limits', language)).not.toBe('memory_read.invalid_limits');
    for (const key of [
      'memory_read.invalid_profiles', 'memory_read.context_heading', 'memory_read.unavailable',
      'bot.memory.context.heading', 'bot.memory.context.guidance', 'bot.memory.context.absent',
      'bot.memory.tool.invalid_request',
    ]) {
      expect(getMessage(key, language)).not.toBe(key);
    }
    for (const key of ['bot.memory.context.hold', 'bot.memory.tool.unavailable']) {
      expect(getMessage(key, language, { reason: 'QUERY_FAILED' })).toContain('QUERY_FAILED');
    }
  });

  it.each(['en', 'tr'])('preserves every canonical memory-read catalog byte in %s', language => {
    for (const key of Object.keys(MEMORY_READ_MESSAGES)) {
      const vars = key.endsWith('.hold') || key.endsWith('.unavailable')
        ? { reason: 'QUERY_FAILED' }
        : undefined;
      expect(getMemoryReadMessage(key, language, vars)).toBe(getMessage(key, language, vars));
    }
  });

  it.each([
    ['tr', 'tr'],
    ['TR', 'en'],
    ['tr_TR.UTF-8', 'en'],
    ['unknown', 'en'],
  ])('matches getMessage explicit locale semantics for %s', (language, expected) => {
    expect(resolveMemoryReadLanguage(language)).toBe(expected);
    expect(getMemoryReadMessage('memory_read.absent', language))
      .toBe(getMessage('memory_read.absent', language));
  });

  it('keeps an explicit English config locale when the host environment is Turkish', () => {
    vi.stubEnv('DECKENT_LANGUAGE', 'tr_TR.UTF-8');
    try {
      expect(resolveMemoryReadLanguage('en')).toBe('en');
      expect(getMemoryReadMessage('memory_read.absent', 'en')).toBe('No matching memory records.');
      expect(resolveMemoryReadAmbientLanguage('en')).toBe('tr');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps an explicit Turkish config locale when the host environment is English', () => {
    vi.stubEnv('DECKENT_LANGUAGE', 'en_US.UTF-8');
    try {
      expect(resolveMemoryReadLanguage('tr')).toBe('tr');
      expect(getMemoryReadMessage('memory_read.absent', 'tr')).toBe('Eşleşen bellek kaydı yok.');
      expect(resolveMemoryReadAmbientLanguage('tr')).toBe('en');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps memory-read consumers out of the CLI helper layer', () => {
    for (const path of [
      'src/api/memory-search-endpoint.ts',
      'src/mcp/resources/memory.ts',
      'src/mcp/tools/memory-query.ts',
      'src/orchestra/task-builder.ts',
    ]) {
      expect(readFileSync(path, 'utf8')).not.toContain('cli/helpers/messages.js');
    }
  });
});
