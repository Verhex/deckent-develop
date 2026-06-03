import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/cli/commands/chat-render.js';

// ANSI constants mirrored from implementation for assertions
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';

describe('renderMarkdown', () => {
  it('renders fenced code blocks with DIM (grey) ANSI code', () => {
    const input = 'Example:\n```\nconsole.log("hello");\n```\nDone.';
    const output = renderMarkdown(input, true);
    expect(output).toContain(DIM);
    expect(output).toContain('console.log("hello");');
    expect(output).toContain(RESET);
    // backtick fences should be stripped from output
    expect(output).not.toContain('```');
  });

  it('renders ATX headings with a visual hierarchy (# bold-cyan, ## bold)', () => {
    const input = '# Main Title\n## Section\nBody text.';
    const output = renderMarkdown(input, true);
    expect(output).toContain(`${BOLD}${CYAN}Main Title${RESET}`); // level 1 → bold + cyan
    expect(output).toContain(`${BOLD}Section${RESET}`);            // level 2 → bold
    // heading markers stripped
    expect(output).not.toMatch(/^#+ /m);
  });

  it('renders **bold** text with BOLD ANSI code', () => {
    const input = 'This is **important** and **critical** text.';
    const output = renderMarkdown(input, true);
    expect(output).toContain(`${BOLD}important${RESET}`);
    expect(output).toContain(`${BOLD}critical${RESET}`);
    expect(output).not.toContain('**');
  });

  it('returns plain text unchanged when tty=false (pipe/non-TTY context)', () => {
    const input = '# Heading\n**bold**\n```\ncode\n```\n- item';
    const output = renderMarkdown(input, false);
    // no ANSI codes at all
    expect(output).not.toContain('\x1b[');
    // original markdown syntax preserved
    expect(output).toContain('# Heading');
    expect(output).toContain('**bold**');
    expect(output).toContain('```');
    expect(output).toContain('- item');
  });

  it('renders inline code with DIM ANSI code', () => {
    const input = 'Use `npm install` to install deps.';
    const output = renderMarkdown(input, true);
    expect(output).toContain(`${DIM}npm install${RESET}`);
    // backtick markers stripped
    expect(output).not.toMatch(/`npm install`/);
  });

  it('renders unordered list items as cyan bullet points (indent-preserving)', () => {
    const input = '- first item\n- second item\n* third item';
    const output = renderMarkdown(input, true);
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    expect(strip(output)).toContain('• first item');
    expect(strip(output)).toContain('• second item');
    expect(strip(output)).toContain('• third item');
    expect(output).toContain(`${CYAN}•${RESET}`); // cyan bullet
  });

  it('handles empty string without throwing', () => {
    expect(() => renderMarkdown('', true)).not.toThrow();
    expect(renderMarkdown('', true)).toBe('');
  });

  it('handles plain prose (no markdown) unchanged in TTY mode', () => {
    const input = 'Hello world, this is plain text.';
    expect(renderMarkdown(input, true)).toBe(input);
  });
});

import { renderMarkdown as renderMd2 } from '../../src/cli/commands/chat-render.js';

describe('renderMarkdown — links, URLs, file paths (Sprint 224 readability)', () => {
  it('markdown link → OSC-8 hyperlink with cyan-underlined text', () => {
    const out = renderMd2('see [Docs](https://docs.anthropic.com)', true);
    expect(out).toContain('\x1b]8;;https://docs.anthropic.com\x07'); // OSC-8 open
    expect(out).toContain('Docs');
    expect(out).toContain('\x1b]8;;\x07'); // OSC-8 close
    expect(out).not.toContain('[Docs]'); // raw markdown gone
  });

  it('bare URL → clickable OSC-8', () => {
    const out = renderMd2('go to https://github.com/x/y now', true);
    expect(out).toContain('\x1b]8;;https://github.com/x/y\x07');
  });

  it('does NOT double-wrap a URL already inside a markdown link', () => {
    const out = renderMd2('[API](https://docs.anthropic.com/en/api)', true);
    // exactly one OSC-8 open for that URL
    const opens = out.split('\x1b]8;;https://docs.anthropic.com/en/api\x07').length - 1;
    expect(opens).toBe(1);
  });

  it('project file path → cyan colored', () => {
    const out = renderMd2('edit src/cli/commands/chat-native.ts please', true);
    expect(out).toContain('\x1b[36msrc/cli/commands/chat-native.ts\x1b[0m');
  });

  it('file path with line number → colored incl. :NN', () => {
    const out = renderMd2('at src/cli/entry.ts:42 there', true);
    expect(out).toContain('\x1b[36msrc/cli/entry.ts:42\x1b[0m');
  });

  it('non-TTY → passthrough (no ANSI, no OSC-8)', () => {
    const out = renderMd2('[Docs](https://x.io) and src/a.ts', false);
    expect(out).toBe('[Docs](https://x.io) and src/a.ts');
  });

  it('does not colorize a path segment inside a URL', () => {
    const out = renderMd2('https://github.com/anthropics/claude-code', true);
    // the URL is one hyperlink; no stray cyan path-coloring inside it
    expect(out).toContain('\x1b]8;;https://github.com/anthropics/claude-code\x07');
    expect(out).not.toContain('\x1b[36manthropics');
  });
});

describe('renderMarkdown — block elements (E1: tables, code, admonitions, kbd, …)', () => {
  const strip = (s: string) => s.replace(/\x1b\][0-9;]*[^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');

  it('table → boxed + aligned (├ ┼ │ borders, headers bold)', () => {
    const out = renderMarkdown('| A | B |\n|---|--:|\n| 1 | 2 |', true);
    const plain = strip(out);
    expect(plain).toContain('┌'); expect(plain).toContain('┼'); expect(plain).toContain('│');
    expect(plain).toContain('A'); expect(plain).toContain('1');
    expect(out).toContain('\x1b[1m'); // header bold
  });

  it('fenced code block → framed box with language label', () => {
    const out = renderMarkdown('```ts\nconst x = 1;\n```', true);
    const plain = strip(out);
    expect(plain).toContain('╭'); expect(plain).toContain('ts'); expect(plain).toContain('const x = 1;');
    expect(plain).toContain('╰');
  });

  it('admonition [!WARNING] → colored icon header + left bar', () => {
    const out = renderMarkdown('> [!WARNING]\n> dikkat et', true);
    expect(out).toContain('\x1b[33m'); // yellow
    expect(strip(out)).toContain('WARNING');
    expect(strip(out)).toContain('▌');
  });

  it('<kbd> → inverse badge', () => {
    const out = renderMarkdown('bas <kbd>Ctrl</kbd>', true);
    expect(out).toContain('\x1b[7m'); // inverse
    expect(strip(out)).toContain('Ctrl');
  });

  it('strikethrough ~~x~~ → STRIKE ansi', () => {
    expect(renderMarkdown('~~eski~~', true)).toContain('\x1b[9m');
  });

  it('horizontal rule --- → dim line', () => {
    expect(strip(renderMarkdown('---', true))).toContain('─');
  });

  it('ordered list 1. → cyan number', () => {
    const out = renderMarkdown('1. ilk\n2. iki', true);
    expect(strip(out)).toContain('1.'); expect(out).toContain('\x1b[36m');
  });

  it('blockquote > → left bar', () => {
    expect(strip(renderMarkdown('> alıntı', true))).toContain('▌');
  });

  it('code block content is NOT corrupted by inline path/bold passes', () => {
    const out = renderMarkdown('```js\nconst p = "src/a.ts"; // **not bold**\n```', true);
    const plain = strip(out);
    expect(plain).toContain('src/a.ts');       // path text intact
    expect(plain).toContain('**not bold**');   // markdown inside code NOT processed
  });

  it('non-TTY → all block elements pass through unchanged', () => {
    const md = '| A |\n|---|\n| 1 |\n```ts\nx\n```';
    expect(renderMarkdown(md, false)).toBe(md);
  });
});
