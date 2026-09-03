// tests/cli/ollama-repl-error-i18n.test.ts
// ═══ TERMINAL-I18N-NATIVE-001 — the readline Ollama network-failure hint is a catalog row ═══
//
// entry.ts wrapped a connection-refused / DNS failure with a hardcoded
// Turkish sentence ("Ollama (<host>) erişilemedi … 'ollama serve' ile
// başlatın …"), shown in English sessions too (real-binary capture,
// 2026-09-03). The hint is now `chat.ollama_unreachable` (en + tr, {host} +
// {reason}) resolved in the session language. Hermetic (source scan + catalog).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';

const ROOT = join(__dirname, '..', '..');

describe('chat.ollama_unreachable', () => {
  it('exists in en and tr, names the host and the reason, and differs between languages', () => {
    expect(getMessageLanguages('chat.ollama_unreachable')).toEqual(expect.arrayContaining(['en', 'tr']));
    const en = getMessage('chat.ollama_unreachable', 'en', { host: 'http://h:1', reason: 'ECONNREFUSED' });
    const tr = getMessage('chat.ollama_unreachable', 'tr', { host: 'http://h:1', reason: 'ECONNREFUSED' });
    expect(en).toContain('http://h:1');
    expect(en).toContain('ECONNREFUSED');
    expect(en).toContain('ollama serve');
    expect(en).toContain('DECKENT_OLLAMA_HOST');
    expect(tr).not.toBe(en);
    expect(tr).toContain('http://h:1');
  });
  it('entry.ts resolves the hint through the catalog and carries no Turkish literal for it', () => {
    const entry = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf-8');
    expect(entry).toMatch(/getMessage\('chat\.ollama_unreachable'/);
    expect(entry).not.toMatch(/erişilemedi/);
    expect(entry).not.toMatch(/ile başlatın/);
  });
});
