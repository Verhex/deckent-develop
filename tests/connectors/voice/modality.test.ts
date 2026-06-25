import { describe, it, expect } from 'vitest';
import { resolveReplyModality } from '../../../src/connectors/voice/modality.js';

// ─── resolveReplyModality ─────────────────────────────────────────────────────
//
// Pure function — no side effects, no I/O.
// Tests are ordered: defaults → voice override → text override → tie-break → no-misfire.

describe('resolveReplyModality', () => {
  // ── Defaults (no explicit modality phrase in text) ────────────────────────────

  describe('defaults (no override phrase)', () => {
    it('ttsMode=off, voiceOrigin=false → text, overridden=false', () => {
      expect(resolveReplyModality('merhaba nasılsın', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: false,
      });
    });

    it('ttsMode=off, voiceOrigin=true → text, overridden=false', () => {
      expect(resolveReplyModality('merhaba nasılsın', { ttsMode: 'off', voiceOrigin: true })).toEqual({
        modality: 'text',
        overridden: false,
      });
    });

    it('ttsMode=always, voiceOrigin=false → voice, overridden=false', () => {
      expect(resolveReplyModality('merhaba nasılsın', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: false,
      });
    });

    it('ttsMode=always, voiceOrigin=true → voice, overridden=false', () => {
      expect(resolveReplyModality('merhaba nasılsın', { ttsMode: 'always', voiceOrigin: true })).toEqual({
        modality: 'voice',
        overridden: false,
      });
    });

    it('ttsMode=reply-in-kind, voiceOrigin=true → voice, overridden=false', () => {
      expect(resolveReplyModality('merhaba nasılsın', { ttsMode: 'reply-in-kind', voiceOrigin: true })).toEqual({
        modality: 'voice',
        overridden: false,
      });
    });

    it('ttsMode=reply-in-kind, voiceOrigin=false → text, overridden=false', () => {
      expect(resolveReplyModality('merhaba nasılsın', { ttsMode: 'reply-in-kind', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: false,
      });
    });

    it('empty text, ttsMode=off → text, overridden=false', () => {
      expect(resolveReplyModality('', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: false,
      });
    });
  });

  // ── Voice override phrases ────────────────────────────────────────────────────

  describe('voice override', () => {
    it('"bunu bana sesli anlat" + reply-in-kind + voiceOrigin=false → voice, overridden=true', () => {
      expect(
        resolveReplyModality('bunu bana sesli anlat', { ttsMode: 'reply-in-kind', voiceOrigin: false }),
      ).toEqual({ modality: 'voice', overridden: true });
    });

    it('"sesli cevap ver" + ttsMode=off → voice, overridden=true (off beaten)', () => {
      expect(resolveReplyModality('sesli cevap ver', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"sesli yanıt ver" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('bunu sesli yanıt ver', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"sesli söyle" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('bunu sesli söyle', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"ses olarak" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('ses olarak gönder', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"bana oku" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('bana oku lütfen', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"sesli olarak" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('sesli olarak cevap ver', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"reply by voice" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('please reply by voice', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"in voice" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('answer in voice', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"read it aloud" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('read it aloud please', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"say it aloud" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('say it aloud', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"say it aloud" + ttsMode=reply-in-kind + voiceOrigin=false → voice, overridden=true', () => {
      // "say it aloud" is the explicit form; bare "say it" was removed (UX footgun: fires on
      // "Can you say it again?" etc.). This test confirms the intended case still works.
      expect(resolveReplyModality('please say it aloud', { ttsMode: 'reply-in-kind', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });

    it('"please say it" (bare, no aloud) → NOT overridden — falls back to default', () => {
      // Bare "say it" was removed from VOICE_PATTERNS to avoid UX footgun
      // (e.g. "Can you say it again?" forcing a voice reply). No override.
      expect(resolveReplyModality('please say it', { ttsMode: 'reply-in-kind', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: false,
      });
    });

    it('"can you say it again" → NOT overridden (UX-footgun guard)', () => {
      expect(resolveReplyModality('can you say it again', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: false,
      });
    });

    it('"say italy" must NOT trigger voice override — no "say it aloud" match', () => {
      expect(resolveReplyModality('say italy now', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: false,
      });
    });

    it('case-insensitive: "SESLİ CEVAP" + ttsMode=off → voice, overridden=true', () => {
      expect(resolveReplyModality('SESLİ CEVAP ver', { ttsMode: 'off', voiceOrigin: false })).toEqual({
        modality: 'voice',
        overridden: true,
      });
    });
  });

  // ── Text override phrases ─────────────────────────────────────────────────────

  describe('text override', () => {
    it('"ekran görüntüsü al ve bana yaz" + reply-in-kind + voiceOrigin=true → text, overridden=true', () => {
      expect(
        resolveReplyModality('ekran görüntüsü al ve bana yaz', { ttsMode: 'reply-in-kind', voiceOrigin: true }),
      ).toEqual({ modality: 'text', overridden: true });
    });

    it('"yazarak cevap ver" + ttsMode=always → text, overridden=true (always beaten)', () => {
      expect(resolveReplyModality('yazarak cevap ver', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"yazılı cevap" + ttsMode=always → text, overridden=true', () => {
      expect(resolveReplyModality('yazılı cevap ver', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"metin olarak" + ttsMode=always → text, overridden=true', () => {
      expect(resolveReplyModality('metin olarak cevapla', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"yazıyla" + ttsMode=always → text, overridden=true', () => {
      expect(resolveReplyModality('yazıyla açıkla', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"reply in text" + ttsMode=always → text, overridden=true', () => {
      expect(resolveReplyModality('please reply in text', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"in text" + ttsMode=always → text, overridden=true', () => {
      expect(resolveReplyModality('answer in text please', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"as text" + ttsMode=always → text, overridden=true', () => {
      expect(resolveReplyModality('send it as text', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"write it" + ttsMode=always → text, overridden=true', () => {
      expect(resolveReplyModality('write it down', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('bare "yaz" as word boundary + ttsMode=always → text, overridden=true', () => {
      // "yaz" as an imperative word — the expected canonical use case
      expect(resolveReplyModality('ekran görüntüsü al ve yaz', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('case-insensitive: "YAZARAK" + ttsMode=always → text, overridden=true', () => {
      expect(resolveReplyModality('YAZARAK cevapla', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"bana yaz" (standalone) + ttsMode=always → text, overridden=true (leading boundary)', () => {
      // Confirms that the leading (?<!\p{L}) boundary does NOT block the legitimate case.
      expect(resolveReplyModality('ekran görüntüsü al ve bana yaz', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });

    it('"Xbana yaz" (contrived leading-letter glue) → text still via bare "yaz" pattern', () => {
      // "Xbana yaz": the "bana yaz" pattern should NOT match (X is \p{L} preceding 'b').
      // However, bare (?<!\p{L})yaz(?!\p{L}) still matches, so modality is still text.
      // This validates leading-boundary consistency without breaking the real use-case.
      expect(resolveReplyModality('Xbana yaz', { ttsMode: 'always', voiceOrigin: false })).toEqual({
        modality: 'text',
        overridden: true,
      });
    });
  });

  // ── No-misfire: normal sentences that must NOT override ───────────────────────

  describe('no-misfire: unrelated words containing keyword substrings', () => {
    it('"yazılım güncellemesi yap" — "yazılım" must NOT trigger text override (reply-in-kind, voiceOrigin=false)', () => {
      // "yazılım" contains "yazılı" substring but is NOT the same word
      // multi-word phrase "yazılı" requires a word boundary AFTER "yazılı"
      // However, "yazılım" starts with "yazılı" — test to confirm no misfire
      expect(
        resolveReplyModality('yazılım güncellemesi yap', { ttsMode: 'reply-in-kind', voiceOrigin: false }),
      ).toEqual({ modality: 'text', overridden: false });
    });

    it('"yazıyorum" must NOT trigger override — word-boundary on bare "yaz"', () => {
      expect(
        resolveReplyModality('sana bir şey yazıyorum', { ttsMode: 'always', voiceOrigin: false }),
      ).toEqual({ modality: 'voice', overridden: false });
    });

    it('"yazılımcı" must NOT trigger text override', () => {
      expect(
        resolveReplyModality('ben bir yazılımcıyım', { ttsMode: 'always', voiceOrigin: false }),
      ).toEqual({ modality: 'voice', overridden: false });
    });

    it('"ses" alone in a sentence does NOT trigger voice override', () => {
      // "ses" is a substring of "sesli" but "sesli cevap" requires exact phrase
      expect(
        resolveReplyModality('ses kalitesi nasıl', { ttsMode: 'off', voiceOrigin: false }),
      ).toEqual({ modality: 'text', overridden: false });
    });

    it('"seslemek" must NOT trigger voice override', () => {
      expect(
        resolveReplyModality('müziği seslemek istiyorum', { ttsMode: 'off', voiceOrigin: false }),
      ).toEqual({ modality: 'text', overridden: false });
    });

    it('"voice" alone in a sentence does NOT trigger voice override', () => {
      // Only "in voice", "reply by voice" etc. should match — not bare "voice"
      expect(
        resolveReplyModality('voice quality check', { ttsMode: 'off', voiceOrigin: false }),
      ).toEqual({ modality: 'text', overridden: false });
    });

    it('"text" alone does NOT trigger text override', () => {
      // Only "in text", "as text", "reply in text" — not bare "text"
      expect(
        resolveReplyModality('text me later', { ttsMode: 'always', voiceOrigin: false }),
      ).toEqual({ modality: 'voice', overridden: false });
    });
  });

  // ── Tie-break: both voice AND text phrase in the same message ─────────────────
  //
  // Tie-break rule: LAST-OCCURRING phrase wins.
  // Rationale: later in the sentence = more recent intent. This is rare in practice.

  describe('tie-break (both voice and text phrase present)', () => {
    it('text phrase last → text wins (last-occurring wins)', () => {
      // voice phrase "sesli anlat" appears first, text phrase "bana yaz" appears last
      expect(
        resolveReplyModality('sesli anlat ama sonra bana yaz', { ttsMode: 'off', voiceOrigin: false }),
      ).toEqual({ modality: 'text', overridden: true });
    });

    it('voice phrase last → voice wins (last-occurring wins)', () => {
      // text phrase "yazarak" appears first, voice phrase "sesli cevap" appears last
      expect(
        resolveReplyModality('yazarak değil sesli cevap ver', { ttsMode: 'off', voiceOrigin: false }),
      ).toEqual({ modality: 'voice', overridden: true });
    });
  });
});
