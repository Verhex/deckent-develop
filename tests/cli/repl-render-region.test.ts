import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createPromptRegion, createLineQueue, createThinkingTicker } from '../../src/cli/commands/chat-render-region.js';

// Sprint 224 T-224-014 — pinned-prompt render region.
// Hermetic: fake readline interface + fake write stream, no real TTY.

function fakeOut(isTTY: boolean): NodeJS.WriteStream & { writes: string[] } {
  const writes: string[] = [];
  // Minimal WriteStream surface used by readline.cursorTo/clearLine + our code.
  const stream = {
    isTTY,
    columns: 80,
    rows: 24,
    write: (chunk: string) => { writes.push(String(chunk)); return true; },
    writes,
  };
  return stream as unknown as NodeJS.WriteStream & { writes: string[] };
}

describe('createPromptRegion — writeAbove (T-224-014)', () => {
  it('non-TTY → plain passthrough (text + newline), no readline calls', () => {
    const out = fakeOut(false);
    const rl = { setPrompt: vi.fn(), prompt: vi.fn() };
    const region = createPromptRegion(rl, out, { isTty: false });
    region.writeAbove('merhaba');
    expect(out.writes.join('')).toBe('merhaba\n');
    expect(rl.setPrompt).not.toHaveBeenCalled();
    expect(rl.prompt).not.toHaveBeenCalled();
  });

  it('TTY → sets `› ` prompt, writes the text, then redraws prompt (preserves buffer)', () => {
    const out = fakeOut(true);
    const rl = { setPrompt: vi.fn(), prompt: vi.fn() };
    const region = createPromptRegion(rl, out, { isTty: true });
    expect(rl.setPrompt).toHaveBeenCalledWith('› ');
    region.writeAbove('cevap');
    // The output text reached the stream...
    expect(out.writes.join('')).toContain('cevap');
    // ...and the prompt was redrawn with preserve=true (pin + keep typed buffer).
    expect(rl.prompt).toHaveBeenCalledWith(true);
  });

  it('reprompt → redraws on TTY, no-op off-TTY', () => {
    const ttyRl = { setPrompt: vi.fn(), prompt: vi.fn() };
    createPromptRegion(ttyRl, fakeOut(true), { isTty: true }).reprompt();
    expect(ttyRl.prompt).toHaveBeenCalledWith(true);

    const pipeRl = { setPrompt: vi.fn(), prompt: vi.fn() };
    createPromptRegion(pipeRl, fakeOut(false), { isTty: false }).reprompt();
    expect(pipeRl.prompt).not.toHaveBeenCalled();
  });
});

describe('createLineQueue — buffered back-to-back input (T-224-014)', () => {
  it('yields buffered lines in order, then ends on close', async () => {
    const rl = new EventEmitter();
    const got: string[] = [];
    const pump = (async () => {
      for await (const line of createLineQueue(rl as never)) got.push(line);
    })();
    // Emit two lines "back to back" before they are consumed, then close.
    rl.emit('line', 'first');
    rl.emit('line', 'second');
    await new Promise((r) => setImmediate(r));
    rl.emit('line', 'third');
    rl.emit('close');
    await pump;
    expect(got).toEqual(['first', 'second', 'third']);
  });

  it('ends immediately on close with no lines', async () => {
    const rl = new EventEmitter();
    const got: string[] = [];
    const pump = (async () => {
      for await (const line of createLineQueue(rl as never)) got.push(line);
    })();
    rl.emit('close');
    await pump;
    expect(got).toEqual([]);
  });
});

describe('createThinkingTicker — rotating-verb indicator (T-224-014)', () => {
  it('non-TTY → start/stop are no-ops (no writes, no throw)', () => {
    const out = fakeOut(false);
    const ticker = createThinkingTicker(out, { isTty: false });
    ticker.start();
    ticker.stop();
    expect(out.writes.length).toBe(0);
  });

  it('TTY → start shows `● deckent` + a verb, then rotates on tick', () => {
    vi.useFakeTimers();
    try {
      const out = fakeOut(true);
      const ticker = createThinkingTicker(out, { isTty: true });
      ticker.start();
      const first = out.writes.join('');
      expect(first).toContain('deckent');
      expect(first).toContain('düşünüyor'); // first verb
      out.writes.length = 0;
      vi.advanceTimersByTime(700);
      expect(out.writes.join('')).toContain('şahlanıyor'); // rotated to next verb
      ticker.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('TTY → stop finalizes to plain `● deckent` + newline and clears the timer', () => {
    vi.useFakeTimers();
    try {
      const out = fakeOut(true);
      const ticker = createThinkingTicker(out, { isTty: true });
      ticker.start();
      out.writes.length = 0;
      ticker.stop();
      // Finalize line carries the header and a trailing newline (reply streams below).
      const finalWrite = out.writes.join('');
      expect(finalWrite).toContain('deckent');
      expect(finalWrite.endsWith('\n')).toBe(true);
      out.writes.length = 0;
      // After stop, advancing time must NOT rotate (timer cleared).
      vi.advanceTimersByTime(2100);
      expect(out.writes.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
