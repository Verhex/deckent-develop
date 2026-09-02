import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createPromptRegion, createLineQueue, createThinkingTicker, createPasteCoalescer, renderToolActivity, createLineBufferedSink } from '../../src/cli/commands/chat-render-region.js';
import { buildThinkingVerbs } from '../../src/cli/commands/chat-thinking-verbs.js';

/** Catalog verb pool (tr) — createThinkingTicker owns no list since TERMINAL-TOOLS-002. */
const VERBS = buildThinkingVerbs('tr');

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
    const ticker = createThinkingTicker(out, { isTty: false, verbs: VERBS });
    ticker.start();
    ticker.stop();
    expect(out.writes.length).toBe(0);
  });

  it('TTY → start shows `● deckent` + a FIXED verb; only the braille frame animates', () => {
    vi.useFakeTimers();
    try {
      const out = fakeOut(true);
      const ticker = createThinkingTicker(out, { isTty: true, verb: 'şahlanıyor', verbs: VERBS });
      ticker.start();
      const first = out.writes.join('');
      expect(first).toContain('deckent');
      expect(first).toContain('şahlanıyor');
      out.writes.length = 0;
      vi.advanceTimersByTime(90);
      // The verb stays the SAME across ticks (user request: not constantly changing).
      expect(out.writes.join('')).toContain('şahlanıyor');
      ticker.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('TTY → stop finalizes to plain `● deckent` + newline and clears the timer', () => {
    vi.useFakeTimers();
    try {
      const out = fakeOut(true);
      const ticker = createThinkingTicker(out, { isTty: true, verbs: VERBS });
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

// (slashCompleter lives in chat-slash-registry; tested in its own block below)

describe('createPasteCoalescer — multi-line paste → one message (T-224-004)', () => {
  it('coalesces a burst of lines (within window) into ONE message', () => {
    vi.useFakeTimers();
    try {
      const msgs: string[] = [];
      const pc = createPasteCoalescer((m) => msgs.push(m), 40);
      pc.feed('line one');
      pc.feed('line two');
      pc.feed('line three');
      vi.advanceTimersByTime(40);
      expect(msgs).toEqual(['line one\nline two\nline three']);
    } finally { vi.useRealTimers(); }
  });

  it('single line → one message after the window', () => {
    vi.useFakeTimers();
    try {
      const msgs: string[] = [];
      const pc = createPasteCoalescer((m) => msgs.push(m), 40);
      pc.feed('solo');
      expect(msgs).toEqual([]); // not yet
      vi.advanceTimersByTime(40);
      expect(msgs).toEqual(['solo']);
    } finally { vi.useRealTimers(); }
  });

  it('two bursts separated by > window → two messages', () => {
    vi.useFakeTimers();
    try {
      const msgs: string[] = [];
      const pc = createPasteCoalescer((m) => msgs.push(m), 40);
      pc.feed('first');
      vi.advanceTimersByTime(50);
      pc.feed('second');
      vi.advanceTimersByTime(50);
      expect(msgs).toEqual(['first', 'second']);
    } finally { vi.useRealTimers(); }
  });

  it('flush() emits the buffered message immediately', () => {
    vi.useFakeTimers();
    try {
      const msgs: string[] = [];
      const pc = createPasteCoalescer((m) => msgs.push(m), 40);
      pc.feed('a'); pc.feed('b');
      pc.flush();
      expect(msgs).toEqual(['a\nb']);
    } finally { vi.useRealTimers(); }
  });
});

describe('renderToolActivity — live tool activity line (T-224-022)', () => {
  it('known tool → Turkish verb + target (non-TTY plain)', () => {
    const s = renderToolActivity('deckent_write_file', { path: 'a.md' }, false);
    expect(s).toBe('🔧 dosya yazıyor: a.md…');
  });

  it('bash → komut çalıştırıyor + cmd', () => {
    expect(renderToolActivity('deckent_bash', { cmd: 'ls' }, false)).toBe('🔧 komut çalıştırıyor: ls…');
  });

  it('unknown tool → raw name', () => {
    expect(renderToolActivity('deckent_mystery', {}, false)).toBe('🔧 deckent_mystery…');
  });

  it('TTY → dim-wrapped (ANSI)', () => {
    expect(renderToolActivity('deckent_read_file', { path: 'x' }, true)).toMatch(/\x1b\[2m.*\x1b\[0m/);
  });
});

describe('createLineBufferedSink — pinned-bar line streaming (T-224-019)', () => {
  it('emits a complete line only on \\n; holds the partial', () => {
    const lines: string[] = [];
    const s = createLineBufferedSink((l) => lines.push(l));
    s.feed('hello ');
    expect(lines).toEqual([]);            // no newline yet
    s.feed('world\n');
    expect(lines).toEqual(['hello world']);
  });

  it('splits multiple newlines in one chunk', () => {
    const lines: string[] = [];
    const s = createLineBufferedSink((l) => lines.push(l));
    s.feed('a\nb\nc\n');
    expect(lines).toEqual(['a', 'b', 'c']);
  });

  it('flush emits the trailing partial line', () => {
    const lines: string[] = [];
    const s = createLineBufferedSink((l) => lines.push(l));
    s.feed('partial');
    s.flush();
    expect(lines).toEqual(['partial']);
  });

  it('flush with empty buffer is a no-op', () => {
    const lines: string[] = [];
    const s = createLineBufferedSink((l) => lines.push(l));
    s.feed('x\n');
    s.flush();
    expect(lines).toEqual(['x']);
  });
});
