import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/cli/commands/chat-render.js';

// born-525: (1) inline-code/link RESET bleeding through an outer heading/bold
// span, (2) markdown link regex truncating a balanced-paren URL.
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';

describe('renderMarkdown — nested-style reset bleed (born-525)', () => {
  it('bold survives an inline-code span nested inside it', () => {
    const out = renderMarkdown('**bold `code` sonrası metin**', true);
    expect(out).toBe(`${BOLD}bold ${DIM}code${RESET}${BOLD} sonrası metin${RESET}`);
    expect(out).not.toContain('**');
  });

  it('heading style survives an inline-code span nested inside it', () => {
    const out = renderMarkdown('# Title `code` more', true);
    expect(out).toBe(`${BOLD}${CYAN}Title ${DIM}code${RESET}${BOLD}${CYAN} more${RESET}`);
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
    const out = renderMarkdown('[Wiki](https://en.wikipedia.org/wiki/Foo_(bar)) end', true);
    expect(out).toContain('\x1b]8;;https://en.wikipedia.org/wiki/Foo_(bar)\x07');
    expect(out).toContain('end');
    // no leaked, un-hyperlinked ')' dangling right after the OSC-8 close
    expect(out).not.toMatch(/\x07\)/);
  });

  it('still handles a plain URL with no parens (no regression)', () => {
    const out = renderMarkdown('[Docs](https://example.com/path) end', true);
    expect(out).toContain('\x1b]8;;https://example.com/path\x07');
  });

  it('still handles a link with a title attribute (no regression)', () => {
    const out = renderMarkdown('[Docs](https://example.com "Title") end', true);
    expect(out).toContain('\x1b]8;;https://example.com\x07');
  });
});
