// tests/agent/provider-detect-i18n.test.ts
// ═══ TERMINAL-I18N-NATIVE-001 — transport detection is code-typed and string-free ═══
//
// Owner decision (2026-09-03): provider-detect.ts carried hardcoded Turkish
// reason sentences (rendered in every session language). The mechanism now
// returns a typed reasonCode (+ technical detail) and an English technical
// reason; the user-facing sentence is a catalog row (`native.detect.<code>`,
// en + tr) resolved by the surface. Hermetic.

import { describe, it, expect } from 'vitest';
import { detectTransport, DETECT_REASON_CODES, type DetectReasonCode } from '../../src/agent/provider-detect.js';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';

const TURKISH = /[çğıöşüÇĞİÖŞÜ]|mevcut|yapılandırıldı|bağla/;

describe('detectTransport reason codes', () => {
  it('names the winning signal with a typed code and a technical detail', () => {
    expect(detectTransport({ ANTHROPIC_API_KEY: 'k' }, {})).toMatchObject({ kind: 'anthropic-api', reasonCode: 'anthropic-api-key' });
    expect(detectTransport({ OPENAI_API_KEY: 'k' }, {})).toMatchObject({ kind: 'openai-compatible', reasonCode: 'openai-compatible' });
    expect(detectTransport({}, { openai_base_url: 'http://x' })).toMatchObject({ kind: 'openai-compatible', reasonCode: 'openai-compatible' });
    expect(detectTransport({}, { ollama_host: 'http://127.0.0.1:11434' })).toMatchObject({ kind: 'ollama', reasonCode: 'ollama-host', detail: 'http://127.0.0.1:11434' });
    expect(detectTransport({}, {})).toMatchObject({ kind: 'none', reasonCode: 'no-transport' });
  });
  it('the mechanism reason is technical English — never a Turkish sentence', () => {
    for (const t of [
      detectTransport({ ANTHROPIC_API_KEY: 'k' }, {}),
      detectTransport({ OPENAI_API_KEY: 'k' }, {}),
      detectTransport({}, { ollama_host: 'http://h' }),
      detectTransport({}, {}),
    ]) {
      expect(t.reason, t.reasonCode).not.toMatch(TURKISH);
      expect(t.reason.length).toBeGreaterThan(0);
    }
  });
  it('every reason code has a catalog sentence in en and tr', () => {
    expect([...DETECT_REASON_CODES].sort()).toEqual(['anthropic-api-key', 'no-transport', 'ollama-host', 'openai-compatible']);
    for (const code of DETECT_REASON_CODES as readonly DetectReasonCode[]) {
      const key = `native.detect.${code}`;
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en', { detail: 'D' })).not.toBe(key);
      expect(getMessage(key, 'tr', { detail: 'D' })).not.toBe(getMessage(key, 'en', { detail: 'D' }));
    }
    expect(getMessage('native.detect.ollama-host', 'en', { detail: 'http://h' })).toContain('http://h');
  });
});
