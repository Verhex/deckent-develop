import { describe, it, expect } from 'vitest';
import { createStreamMarkdown } from '../../src/cli/commands/chat-render.js';

// Sprint 224 T-224-023 — streaming markdown renderer.
// Hermetic: tty forced via the param, no real terminal.
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

describe('createStreamMarkdown (T-224-023)', () => {
  it('non-TTY → passthrough (no ANSI, flush empty)', () => {
    const md = createStreamMarkdown(false);
    expect(md.feed('**bold** and `code`')).toBe('**bold** and `code`');
    expect(md.flush()).toBe('');
  });

  it('TTY → **bold** in one chunk renders BOLD…RESET (no literal **)', () => {
    const md = createStreamMarkdown(true);
    const out = md.feed('hi **there** bye') + md.flush();
    expect(out).toBe(`hi ${BOLD}there${RESET} bye`);
    expect(out).not.toContain('**');
  });

  it('TTY → ** split across chunk boundary still toggles correctly', () => {
    const md = createStreamMarkdown(true);
    let out = md.feed('a **bo');   // open bold mid-stream
    out += md.feed('ld** z');      // close bold next chunk
    out += md.flush();
    expect(out).toBe(`a ${BOLD}bold${RESET} z`);
    expect(out).not.toContain('**');
  });

  it('TTY → single * at chunk end held then flushed (not a bold marker)', () => {
    const md = createStreamMarkdown(true);
    let out = md.feed('rate is 5'); // ends normal
    out += md.feed('*');            // lone * held in pending
    out += md.flush();              // flush emits it
    expect(out).toBe('rate is 5*');
  });

  it('TTY → `code` renders DIM…RESET', () => {
    const md = createStreamMarkdown(true);
    const out = md.feed('run `npm test` now') + md.flush();
    expect(out).toBe(`run ${DIM}npm test${RESET} now`);
  });

  it('TTY → flush closes an unclosed bold (no style leak)', () => {
    const md = createStreamMarkdown(true);
    let out = md.feed('**oops unclosed');
    out += md.flush();
    expect(out).toBe(`${BOLD}oops unclosed${RESET}`);
  });
});
