import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderMarkdown } from '../../src/cli/commands/chat-render.js';

// born-525: (1) inline-code/link RESET bleeding through an outer heading/bold
// span, (2) markdown link regex truncating a balanced-paren URL.
// TERMINAL-READABILITY-001: inline code is the code role (94) and a level-1
// heading is bold + the info role (94) in the host-theme-mapped tier — pinned
// with FORCE_COLOR=1 and no background hint so the SGR codes are exact.
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CODE = '\x1b[94m';
const INFO = '\x1b[94m';

const ENV_KEYS = ['NO_COLOR', 'FORCE_COLOR', 'COLORTERM', 'COLORFGBG', 'TERM'] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env['FORCE_COLOR'] = '1';
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('renderMarkdown — nested-style reset bleed (born-525)', () => {
  it('bold survives an inline-code span nested inside it', () => {
    const out = renderMarkdown('**bold `code` sonrası metin**', true);
    expect(out).toBe(`${BOLD}bold ${CODE}code${RESET}${BOLD} sonrası metin${RESET}`);
    expect(out).not.toContain('**');
  });

  it('heading style survives an inline-code span nested inside it', () => {
    const out = renderMarkdown('# Title `code` more', true);
    expect(out).toBe(`${BOLD}${INFO}Title ${CODE}code${RESET}${BOLD}${INFO} more${RESET}`);
  });

  it('bold style survives a markdown link span nested inside it', () => {
    const out = renderMarkdown('**see [Docs](https://x.io) now**', true);
    // bold re-opens immediately after the link's own inner RESET
    expect(out).toContain(`${RESET}${BOLD}`);
    expect(out).not.toContain('**');
    expect(out).toContain('Docs');
    expect(out).toContain('now');
  });

  it('plain bold with no nested span is unaffected (no spurious extra RESET/BOLD)', () => {
    expect(renderMarkdown('**simple**', true)).toBe(`${BOLD}simple${RESET}`);
  });
});

describe('renderMarkdown — link regex balanced-paren URL (born-525)', () => {
  it('does not truncate a Wikipedia-style URL with a balanced paren', () => {
    const out = renderMarkdown('[Wiki](https://en.wikipedia.org/wiki/Foo_(bar)) end', true, { hyperlinks: true });
    expect(out).toContain('\x1b]8;;https://en.wikipedia.org/wiki/Foo_(bar)\x07');
    expect(out).toContain('end');
    // no leaked, un-hyperlinked ')' dangling right after the OSC-8 close
    expect(out).not.toMatch(/\x07\)/);
  });

  it('still handles a plain URL with no parens (no regression)', () => {
    const out = renderMarkdown('[Docs](https://example.com/path) end', true, { hyperlinks: true });
    expect(out).toContain('\x1b]8;;https://example.com/path\x07');
  });

  it('still handles a link with a title attribute (no regression)', () => {
    const out = renderMarkdown('[Docs](https://example.com "Title") end', true, { hyperlinks: true });
    expect(out).toContain('\x1b]8;;https://example.com\x07');
  });
});
