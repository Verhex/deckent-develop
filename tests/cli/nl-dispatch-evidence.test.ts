import { describe, it, expect } from 'vitest';

import { classifyAgenticIntent } from '../../src/cli/commands/chat-agentic-dispatch.js';

// ═══ nl-dispatch-evidence — Sıra-57 karar-kapısı kanıt paketi (359-009) ═══
//
// Bu dosya KARAR VERMEZ — `agenticDispatch`'in (chat-native.ts opts.agenticDispatch →
// classifyAgenticIntent, chat-agentic-dispatch.ts) MEVCUT davranışını test-sabitler.
// Her `it` bloğu bir "sınır-vakası" (boundary case): sıradan bir cümlenin, salt-regex
// tabanlı NL sınıflandırıcı tarafından yanlışlıkla bir deckent_* araç çağrısına
// dönüştürülüp dönüştürülmediğini ölçer. Referans karar-belgesi:
// docs/design/nl-dispatch-default-decision.md (bu dosyadaki her case oraya
// kod-satır-referanslı olarak taşınır).
//
// Sınıflandırma: her test'in adı "dispatch-OLUR" (yanlışlıkla eşleşir → false-positive
// riski) veya "dispatch-OLMAZ" (doğru şekilde eşleşmez) etiketiyle başlar.

describe('nl-dispatch-evidence — false-positive boundary cases (agenticDispatch)', () => {
  // ─── "ara" (Turkish: search/call/occasionally) — RECALL_RE bare-keyword match ──
  // chat-agentic-dispatch.ts RECALL_RE: /\b(?:hafiza\w*|recall|memory|ara|search|find)\b/
  // "ara" is matched as a STANDALONE word regardless of its actual Turkish meaning in
  // context (call somebody / a street / occasionally) — the classifier has no semantic
  // disambiguation, only a bare-keyword regex.

  it('dispatch-OLUR: "beni sonra ara" (call me later) → false-positive deckent_memory_query', () => {
    const intent = classifyAgenticIntent('beni sonra ara');
    expect(intent.tool).toBe('deckent_memory_query');
  });

  it('dispatch-OLUR: "işten çıkınca beni ara lütfen" (call me when you leave work) → false-positive deckent_memory_query', () => {
    const intent = classifyAgenticIntent('işten çıkınca beni ara lütfen');
    expect(intent.tool).toBe('deckent_memory_query');
  });

  // ─── "durum" prefix — STATUS_RE greedy \w* extension ───────────────────────────
  // STATUS_RE: /\b(?:sprint\s+durum\w*|durum\w*(?:\s+ne(?:dir)?)?|...)\b/ — the bare
  // `durum\w*` branch matches ANY word beginning with "durum" (dative/genitive/derived
  // forms included), not just the literal noun "durum" (situation/status).

  it('dispatch-OLUR: "bu duruma göre karar verelim" (let\'s decide based on this) → false-positive deckent_status', () => {
    const intent = classifyAgenticIntent('bu duruma göre karar verelim');
    expect(intent.tool).toBe('deckent_status');
  });

  it('dispatch-OLUR: "olağanüstü durumda ne yapmalı" (what to do in an emergency) → false-positive deckent_status', () => {
    const intent = classifyAgenticIntent('olağanüstü durumda ne yapmalı');
    expect(intent.tool).toBe('deckent_status');
  });

  // ─── "memory" as an everyday English noun — RECALL_RE bare-keyword match ──────

  it('dispatch-OLUR: "I have a great memory for names" → false-positive deckent_memory_query', () => {
    const intent = classifyAgenticIntent('I have a great memory for names');
    expect(intent.tool).toBe('deckent_memory_query');
  });

  it('dispatch-OLUR: "this laptop needs more memory" → false-positive deckent_memory_query', () => {
    const intent = classifyAgenticIntent('this laptop needs more memory');
    expect(intent.tool).toBe('deckent_memory_query');
  });

  // ─── "find" / "search" as everyday verbs — RECALL_RE bare-keyword match ───────

  it('dispatch-OLUR: "did you find the bug?" → false-positive deckent_memory_query', () => {
    const intent = classifyAgenticIntent('did you find the bug?');
    expect(intent.tool).toBe('deckent_memory_query');
  });

  it('dispatch-OLUR: "can you find my keys" → false-positive deckent_memory_query', () => {
    const intent = classifyAgenticIntent('can you find my keys');
    expect(intent.tool).toBe('deckent_memory_query');
  });

  it('dispatch-OLUR: "let\'s search for a new apartment" → false-positive deckent_memory_query', () => {
    const intent = classifyAgenticIntent("let's search for a new apartment");
    expect(intent.tool).toBe('deckent_memory_query');
  });

  // ─── "plan" as an everyday noun — PLAN_RE bare-keyword match ───────────────────
  // PLAN_RE: /\b(?:plan(?:la)?|sprint\s+planla|generate\s+plan)\b/ — bare "plan" fires
  // regardless of whether the user means "sprint plan" or "dinner plan."

  it('dispatch-OLUR: "what\'s the plan for tonight?" → false-positive deckent_plan', () => {
    const intent = classifyAgenticIntent("what's the plan for tonight?");
    expect(intent.tool).toBe('deckent_plan');
  });

  it('dispatch-OLUR: "I need a diet plan" → false-positive deckent_plan', () => {
    const intent = classifyAgenticIntent('I need a diet plan');
    expect(intent.tool).toBe('deckent_plan');
  });

  // ─── "status"/"how is X" small talk — STATUS_RE bare-keyword + phrase match ───

  it('dispatch-OLUR: "just checking on the status of my order" → false-positive deckent_status', () => {
    const intent = classifyAgenticIntent('just checking on the status of my order');
    expect(intent.tool).toBe('deckent_status');
  });

  it('dispatch-OLUR: "how is sprint going for you these days?" (small talk, not a status query) → false-positive deckent_status', () => {
    const intent = classifyAgenticIntent('how is sprint going for you these days?');
    expect(intent.tool).toBe('deckent_status');
  });

  it('dispatch-OLUR: "how are we doing today, feeling ok?" → false-positive deckent_status', () => {
    const intent = classifyAgenticIntent('how are we doing today, feeling ok?');
    expect(intent.tool).toBe('deckent_status');
  });

  // ─── Turkish diacritic-stripped collisions — normalize() strips ç/ğ/ı/ö/ş/ü ───

  it('dispatch-OLUR: "hafızam çok zayıf bu aralar" (my memory is weak lately) → false-positive deckent_memory_query', () => {
    const intent = classifyAgenticIntent('hafızam çok zayıf bu aralar');
    expect(intent.tool).toBe('deckent_memory_query');
  });

  it('dispatch-OLUR: "geçmiş olsun, tekrar dene" (get well soon, try again) → false-positive deckent_history', () => {
    const intent = classifyAgenticIntent('geçmiş olsun, tekrar dene');
    expect(intent.tool).toBe('deckent_history');
  });

  // ─── True negatives — sanity check that ordinary small talk correctly falls through ──

  it('dispatch-OLMAZ: "merhaba nasılsın bugün hava çok güzel" (greeting/weather chat) → correctly no_match', () => {
    const intent = classifyAgenticIntent('merhaba nasılsın bugün hava çok güzel');
    expect(intent.tool).toBeNull();
  });

  it('dispatch-OLMAZ: "let\'s grab lunch tomorrow" → correctly no_match', () => {
    const intent = classifyAgenticIntent("let's grab lunch tomorrow");
    expect(intent.tool).toBeNull();
  });

  it('dispatch-OLMAZ: "thanks for the help earlier" → correctly no_match', () => {
    const intent = classifyAgenticIntent('thanks for the help earlier');
    expect(intent.tool).toBeNull();
  });

  it('dispatch-OLMAZ: "kahve ister misin" (want some coffee?) → correctly no_match', () => {
    const intent = classifyAgenticIntent('kahve ister misin');
    expect(intent.tool).toBeNull();
  });
});
