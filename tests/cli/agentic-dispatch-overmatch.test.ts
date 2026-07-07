import { describe, it, expect } from 'vitest';

import { classifyAgenticIntent } from '../../src/cli/commands/chat-agentic-dispatch.js';

// ═══ agentic-dispatch-overmatch — task 380-007 (born-514) regression guard ═══
//
// AGENTIC-DISPATCH-OVERMATCH: chat-agentic-dispatch.ts's NL-intent regexes used to fire on a
// single bare, unqualified keyword ("ara", "memory", "find", "search", "plan", "status", bare
// "durum\w*"/"gecmis", "how is/are") anywhere in a sentence, silently misrouting ordinary
// conversation into a deckent_* tool call — measured at 16/20 in
// tests/cli/nl-dispatch-evidence.test.ts (sprint-359 task 359-009). This file locks in the FIX:
// each case below previously matched (see the referenced evidence-file line) and now correctly
// falls through to `no_match`, while every genuine tool-intent (chat-agentic-dispatch.test.ts /
// nl-dispatch-class-gate.test.ts) still dispatches. ADR-D-013's class-based confirm-gate
// (chat-native.ts / agentic-confirm.ts) is untouched by this fix — narrowing happens entirely in
// the classifier, per this task's `nogo`: agentic-dispatch as a whole stays enabled.

describe('agentic-dispatch-overmatch — before-matches, now-no-longer-matches (task 380-007)', () => {
  // ─── RECALL_RE: bare ara/search/find/memory no longer fire alone ──────────────
  // nl-dispatch-evidence.test.ts lines 25-33, 52-77, 112-115

  it('"beni sonra ara" (call me later) — no longer misroutes to deckent_memory_query', () => {
    expect(classifyAgenticIntent('beni sonra ara').tool).toBeNull();
  });

  it('"işten çıkınca beni ara lütfen" — no longer misroutes to deckent_memory_query', () => {
    expect(classifyAgenticIntent('işten çıkınca beni ara lütfen').tool).toBeNull();
  });

  it('"I have a great memory for names" — bare "memory" alone no longer dispatches', () => {
    expect(classifyAgenticIntent('I have a great memory for names').tool).toBeNull();
  });

  it('"this laptop needs more memory" — bare "memory" alone no longer dispatches', () => {
    expect(classifyAgenticIntent('this laptop needs more memory').tool).toBeNull();
  });

  it('"did you find the bug?" — bare "find" alone no longer dispatches', () => {
    expect(classifyAgenticIntent('did you find the bug?').tool).toBeNull();
  });

  it('"can you find my keys" — bare "find" alone no longer dispatches', () => {
    expect(classifyAgenticIntent('can you find my keys').tool).toBeNull();
  });

  it('"let\'s search for a new apartment" — bare "search" alone no longer dispatches', () => {
    expect(classifyAgenticIntent("let's search for a new apartment").tool).toBeNull();
  });

  it('"hafızam çok zayıf bu aralar" — memory-noun without a search-verb no longer dispatches', () => {
    expect(classifyAgenticIntent('hafızam çok zayıf bu aralar').tool).toBeNull();
  });

  // ─── STATUS_RE: bare status/durum stems + small-talk "how is/are" no longer fire ──
  // nl-dispatch-evidence.test.ts lines 40-48, 95-108

  it('"bu duruma göre karar verelim" — bare durum stem (dative) no longer dispatches', () => {
    expect(classifyAgenticIntent('bu duruma göre karar verelim').tool).toBeNull();
  });

  it('"olağanüstü durumda ne yapmalı" — bare durum stem (locative) no longer dispatches', () => {
    expect(classifyAgenticIntent('olağanüstü durumda ne yapmalı').tool).toBeNull();
  });

  it('"just checking on the status of my order" — bare "status" alone no longer dispatches', () => {
    expect(classifyAgenticIntent('just checking on the status of my order').tool).toBeNull();
  });

  it('"how is sprint going for you these days?" — small talk no longer dispatches', () => {
    expect(classifyAgenticIntent('how is sprint going for you these days?').tool).toBeNull();
  });

  it('"how are we doing today, feeling ok?" — small talk no longer dispatches', () => {
    expect(classifyAgenticIntent('how are we doing today, feeling ok?').tool).toBeNull();
  });

  // ─── HISTORY_RE: bare "gecmis" idiom no longer fires ──────────────────────────
  // nl-dispatch-evidence.test.ts lines 117-120

  it('"geçmiş olsun, tekrar dene" (get well soon) — idiom no longer dispatches', () => {
    expect(classifyAgenticIntent('geçmiş olsun, tekrar dene').tool).toBeNull();
  });

  // ─── PLAN_RE: bare English "plan" noun no longer fires ────────────────────────
  // nl-dispatch-evidence.test.ts lines 83-91

  it('"what\'s the plan for tonight?" — bare "plan" alone no longer dispatches', () => {
    expect(classifyAgenticIntent("what's the plan for tonight?").tool).toBeNull();
  });

  it('"I need a diet plan" — bare "plan" alone no longer dispatches', () => {
    expect(classifyAgenticIntent('I need a diet plan').tool).toBeNull();
  });
});

describe('agentic-dispatch-overmatch — genuine tool-intents still dispatch (regression guard)', () => {
  it('"sprint durumu ne" → deckent_status', () => {
    expect(classifyAgenticIntent('sprint durumu ne').tool).toBe('deckent_status');
  });

  it('"sprint durumu nasıl" → deckent_status', () => {
    expect(classifyAgenticIntent('sprint durumu nasıl').tool).toBe('deckent_status');
  });

  it('"what is the status" → deckent_status', () => {
    expect(classifyAgenticIntent('what is the status').tool).toBe('deckent_status');
  });

  it('"son sprinti göster" → deckent_history', () => {
    expect(classifyAgenticIntent('son sprinti göster').tool).toBe('deckent_history');
  });

  it('"son sprintleri göster" → deckent_history', () => {
    expect(classifyAgenticIntent('son sprintleri göster').tool).toBe('deckent_history');
  });

  it('"show me sprint history" → deckent_history', () => {
    expect(classifyAgenticIntent('show me sprint history').tool).toBe('deckent_history');
  });

  it('"hafızada rbac ara" → deckent_memory_query with extracted query', () => {
    const intent = classifyAgenticIntent('hafızada rbac ara');
    expect(intent.tool).toBe('deckent_memory_query');
    if (intent.tool === 'deckent_memory_query') {
      expect(intent.args['query']).toBe('rbac');
    }
  });

  it('"hafızada adr-037 ara" → deckent_memory_query', () => {
    expect(classifyAgenticIntent('hafızada adr-037 ara').tool).toBe('deckent_memory_query');
  });

  it('"hafızada docker ara" → deckent_memory_query', () => {
    expect(classifyAgenticIntent('hafızada docker ara').tool).toBe('deckent_memory_query');
  });

  it('"search memory for docker" → deckent_memory_query', () => {
    expect(classifyAgenticIntent('search memory for docker').tool).toBe('deckent_memory_query');
  });

  it('"sprint planla" → deckent_plan', () => {
    expect(classifyAgenticIntent('sprint planla').tool).toBe('deckent_plan');
  });

  it('"hello there friend" → no_match (unaffected true negative)', () => {
    expect(classifyAgenticIntent('hello there friend').tool).toBeNull();
  });

  it('"let\'s grab lunch tomorrow" → no_match (unaffected true negative)', () => {
    expect(classifyAgenticIntent("let's grab lunch tomorrow").tool).toBeNull();
  });
});
