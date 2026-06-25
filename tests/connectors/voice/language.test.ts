import { describe, it, expect } from 'vitest';
import { resolveReplyLanguage } from '../../../src/connectors/voice/language.js';
import type { VoiceConfig } from '../../../src/connectors/voice/types.js';

// ─── resolveReplyLanguage ─────────────────────────────────────────────────────

describe('resolveReplyLanguage', () => {
  // ── config wins ──────────────────────────────────────────────────────────────

  it('returns forced cfg.language when it is a concrete tag (config wins over turnLang)', () => {
    const cfg: VoiceConfig = { enabled: true, language: 'tr' };
    expect(resolveReplyLanguage(cfg, 'en')).toEqual({ tag: 'tr', mode: 'forced' });
  });

  it('returns forced cfg.language even when turnLang is absent', () => {
    const cfg: VoiceConfig = { enabled: true, language: 'fr' };
    expect(resolveReplyLanguage(cfg)).toEqual({ tag: 'fr', mode: 'forced' });
  });

  // ── cfg.language = 'auto' → fall through to turnLang ─────────────────────────

  it('mirrors turnLang when cfg.language is "auto" and turnLang is present', () => {
    const cfg: VoiceConfig = { enabled: true, language: 'auto' };
    expect(resolveReplyLanguage(cfg, 'en')).toEqual({ tag: 'en', mode: 'forced' });
  });

  it('mirrors turnLang when cfg.language is "auto" and turnLang is "tr"', () => {
    const cfg: VoiceConfig = { enabled: true, language: 'auto' };
    expect(resolveReplyLanguage(cfg, 'tr')).toEqual({ tag: 'tr', mode: 'forced' });
  });

  it('returns mirror mode when cfg.language is "auto" and no turnLang', () => {
    const cfg: VoiceConfig = { enabled: true, language: 'auto' };
    expect(resolveReplyLanguage(cfg)).toEqual({ tag: null, mode: 'mirror' });
  });

  // ── cfg.language absent → behaves like 'auto' ────────────────────────────────

  it('mirrors turnLang when cfg.language is absent and turnLang is present', () => {
    const cfg: VoiceConfig = { enabled: true };
    expect(resolveReplyLanguage(cfg, 'en')).toEqual({ tag: 'en', mode: 'forced' });
  });

  it('returns mirror mode when cfg.language is absent and no turnLang', () => {
    const cfg: VoiceConfig = { enabled: true };
    expect(resolveReplyLanguage(cfg)).toEqual({ tag: null, mode: 'mirror' });
  });

  // ── disabled config still resolves correctly (pure function) ─────────────────

  it('resolves correctly even when voice is disabled (pure — no side effects)', () => {
    const cfg: VoiceConfig = { enabled: false, language: 'de' };
    expect(resolveReplyLanguage(cfg, 'en')).toEqual({ tag: 'de', mode: 'forced' });
  });

  it('resolves mirror when disabled and no turnLang', () => {
    const cfg: VoiceConfig = { enabled: false };
    expect(resolveReplyLanguage(cfg)).toEqual({ tag: null, mode: 'mirror' });
  });
});
