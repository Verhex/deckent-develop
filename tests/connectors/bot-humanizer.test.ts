// BOT-1 — bot-agent humanizer core (provider-agnostic, fail-safe).
//
// The humanizer rephrases raw deckent bot messages into natural, conversational
// text and summarizes-to-fit when long — but NEVER drops actionable items and
// NEVER throws: an LLM error or a disabled humanizer falls back to the raw text,
// losslessly chunked. The LLM `complete` is injected, so the core is unit-tested
// without a real provider.

import { describe, it, expect, vi } from 'vitest';
import { makeBotHumanizer, criticalTokens } from '../../src/connectors/bot-humanizer.js';

describe('makeBotHumanizer', () => {
  it('passthrough when no completer: lossless chunk of the raw text', async () => {
    const parts = await makeBotHumanizer().toParts('hello world');
    expect(parts).toEqual(['hello world']);
  });

  it('humanizes via the injected completer; the prompt carries the raw text', async () => {
    let seen = '';
    const complete = vi.fn(async (p: string) => { seen = p; return 'Hey — approve it with approve t-42 👍'; });
    const parts = await makeBotHumanizer({ complete }).toParts(
      '[autonomous] autonomous.execute — approve t-42 / reject t-42',
    );
    expect(complete).toHaveBeenCalledOnce();
    expect(seen).toContain('approve t-42');            // raw message handed to the LLM
    expect(parts.join('')).toContain('approve t-42');  // humanized output keeps the command
  });

  it('fail-safe: completer throws → raw lossless chunk, never throws', async () => {
    const complete = vi.fn(async () => { throw new Error('llm down'); });
    const parts = await makeBotHumanizer({ complete }).toParts('raw content approve x');
    expect(parts).toEqual(['raw content approve x']);
  });

  it('fail-safe: completer returns blank → raw fallback', async () => {
    const parts = await makeBotHumanizer({ complete: async () => '   ' }).toParts('raw approve x');
    expect(parts).toEqual(['raw approve x']);
  });

  it('summarize-to-fit: a long humanized result is chunked ≤ limit (still never cut)', async () => {
    const long = 'H'.repeat(9000);
    const parts = await makeBotHumanizer({ complete: async () => long, maxChars: 4000 }).toParts('short');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(4000);
  });

  it('injects persona + target language into the prompt', async () => {
    let seen = '';
    await makeBotHumanizer({
      complete: async (p) => { seen = p; return 'ok'; },
      persona: 'warm pirate tone',
      lang: 'tr',
    }).toParts('x');
    expect(seen).toContain('warm pirate tone');
    expect(seen).toContain('tr');
  });

  // Correctness gate — a model that ALTERS the approve/reject id must not reach
  // the user (the reply would not resolve); fall back to the raw message.
  it('discards humanized output that altered the action id (re-cased) → raw', async () => {
    // model re-cased t-42 → T-42 (like a weak small model) — must fall back to raw.
    const h = makeBotHumanizer({ complete: async () => 'Onayla: Approve T-42 / Reject T-42' });
    const parts = await h.toParts('approve t-42 / reject t-42');
    expect(parts).toEqual(['approve t-42 / reject t-42']);
  });

  it('keeps humanized output that preserved the action id verbatim', async () => {
    const h = makeBotHumanizer({ complete: async () => 'Hey! Onaylamak için approve t-42 yaz 👍' });
    const parts = await h.toParts('approve t-42 / reject t-42');
    expect(parts.join('')).toContain('Hey!');
    expect(parts.join('')).toContain('approve t-42');
  });

  it('criticalTokens extracts approve/reject/accept ids (de-duped, punctuation-stripped)', () => {
    expect(criticalTokens('approve t-42 / reject t-42')).toEqual(['t-42']);
    expect(criticalTokens('reply accept k9.').sort()).toEqual(['k9']);
    expect(criticalTokens('no commands here')).toEqual([]);
  });
});
