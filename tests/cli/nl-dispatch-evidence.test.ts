import { describe, it, expect } from 'vitest';

import { classifyAgenticIntent } from '../../src/cli/commands/chat-agentic-dispatch.js';

// ═══ nl-dispatch-evidence — born-514 (task 380-007, AGENTIC-DISPATCH-OVERMATCH) regression guard ═══
//
// This file used to DOCUMENT a bug: `agenticDispatch`'s pre-born-514 rules matched on a
// single bare, unqualified keyword ("ara", "memory", "find", "search", "plan", bare
// "durum\w*"/"gecmis", "how is/are") anywhere in the sentence, silently misrouting 16/20
// ordinary conversational sentences into a deckent_* tool call (sprint-359 task 359-009,
// docs/design/nl-dispatch-default-decision.md). born-514 (chat-agentic-dispatch.ts, task
// 380-007) tightened every rule to require either a distinctive/rare word (recall, planla) or
// an explicit command-shape context (sprint-scoped, or a memory-noun + search-verb pairing in
// the SAME utterance) — a bare generic word alone no longer fires.
//
// This file now KEEPS the same boundary-case sentences as a regression guard: each
// `regression-guard` case asserts `intent.tool` is `null` (no dispatch) for a sentence that
// used to be misrouted. If a future edit to chat-agentic-dispatch.ts widens a rule back to a
// bare-keyword match, one of these cases fails and catches the regression before it ships.
//
// The `dispatch-OLMAZ` true-negative cases (ordinary small talk, unaffected by born-514) are
// unchanged sanity checks that the classifier correctly falls through to `no_match`.

describe('nl-dispatch-evidence — born-514 regression guard (agenticDispatch)', () => {
  // ─── "ara" (Turkish: search/call/occasionally) — recall rule now requires a memory-noun pairing ──
  // chat-agentic-dispatch.ts: SEARCH_VERB_RE (`ara`/`search`/`find`) only fires the recall rule
  // when MEMORY_WORD_RE (`hafiza\w*`/`memory`) also matches in the same utterance — a bare "ara"
  // with no memory-noun context no longer dispatches.

  it('regression-guard: "beni sonra ara" (call me later) → no memory-noun pairing, correctly no_match', () => {
    const intent = classifyAgenticIntent('beni sonra ara');
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "işten çıkınca beni ara lütfen" (call me when you leave work) → no memory-noun pairing, correctly no_match', () => {
    const intent = classifyAgenticIntent('işten çıkınca beni ara lütfen');
    expect(intent.tool).toBe(null);
  });

  // ─── "durum" prefix — STATUS_RE now requires an explicit "durum(u/un)? ne(dir)?" / "durumu nasıl" shape ──
  // chat-agentic-dispatch.ts STATUS_RE: the bare `durum\w*` branch was removed — declined forms
  // like "duruma"/"durumda" (dative/locative) no longer match; only the literal
  // "sprint durum\w*", "durum(u/un)? ne(dir)?", "durumu nasıl", or English "what's/is the status"
  // shapes fire.

  it('regression-guard: "bu duruma göre karar verelim" (let\'s decide based on this) → declined form, correctly no_match', () => {
    const intent = classifyAgenticIntent('bu duruma göre karar verelim');
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "olağanüstü durumda ne yapmalı" (what to do in an emergency) → declined form, correctly no_match', () => {
    const intent = classifyAgenticIntent('olağanüstü durumda ne yapmalı');
    expect(intent.tool).toBe(null);
  });

  // ─── "memory" as an everyday English noun — MEMORY_WORD_RE now requires a paired search-verb ──

  it('regression-guard: "I have a great memory for names" → memory-noun with no search-verb, correctly no_match', () => {
    const intent = classifyAgenticIntent('I have a great memory for names');
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "this laptop needs more memory" → memory-noun with no search-verb, correctly no_match', () => {
    const intent = classifyAgenticIntent('this laptop needs more memory');
    expect(intent.tool).toBe(null);
  });

  // ─── "find" / "search" as everyday verbs — SEARCH_VERB_RE now requires a paired memory-noun ──

  it('regression-guard: "did you find the bug?" → search-verb with no memory-noun, correctly no_match', () => {
    const intent = classifyAgenticIntent('did you find the bug?');
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "can you find my keys" → search-verb with no memory-noun, correctly no_match', () => {
    const intent = classifyAgenticIntent('can you find my keys');
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "let\'s search for a new apartment" → search-verb with no memory-noun, correctly no_match', () => {
    const intent = classifyAgenticIntent("let's search for a new apartment");
    expect(intent.tool).toBe(null);
  });

  // ─── "plan" as an everyday noun — PLAN_RE now requires "planla" / "sprint plan\w*" / "generate plan" ──
  // chat-agentic-dispatch.ts PLAN_RE: the bare "plan" branch was removed — only the Turkish verb
  // form "planla", the sprint-scoped "sprint plan\w*", or the explicit "generate plan" shape fire.

  it('regression-guard: "what\'s the plan for tonight?" → bare noun "plan", correctly no_match', () => {
    const intent = classifyAgenticIntent("what's the plan for tonight?");
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "I need a diet plan" → bare noun "plan", correctly no_match', () => {
    const intent = classifyAgenticIntent('I need a diet plan');
    expect(intent.tool).toBe(null);
  });

  // ─── "status"/"how is X" small talk — STATUS_RE now requires the exact "what's/is the status" phrase ──

  it('regression-guard: "just checking on the status of my order" → not the literal "what\'s/is the status" phrase, correctly no_match', () => {
    const intent = classifyAgenticIntent('just checking on the status of my order');
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "how is sprint going for you these days?" (small talk, not a status query) → correctly no_match', () => {
    const intent = classifyAgenticIntent('how is sprint going for you these days?');
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "how are we doing today, feeling ok?" → correctly no_match', () => {
    const intent = classifyAgenticIntent('how are we doing today, feeling ok?');
    expect(intent.tool).toBe(null);
  });

  // ─── Turkish diacritic-stripped collisions — normalize() strips ç/ğ/ı/ö/ş/ü ───

  it('regression-guard: "hafızam çok zayıf bu aralar" (my memory is weak lately) → memory-noun with no standalone search-verb, correctly no_match', () => {
    const intent = classifyAgenticIntent('hafızam çok zayıf bu aralar');
    expect(intent.tool).toBe(null);
  });

  it('regression-guard: "geçmiş olsun, tekrar dene" (get well soon, try again) → not "gecmis + sprint" shape, correctly no_match', () => {
    const intent = classifyAgenticIntent('geçmiş olsun, tekrar dene');
    expect(intent.tool).toBe(null);
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
