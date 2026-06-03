import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/cli/commands/chat-render.js';

// ANSI constants mirrored from implementation for assertions
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';

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

  it('renders ATX headings with BOLD ANSI code', () => {
    const input = '# Main Title\n## Section\nBody text.';
    const output = renderMarkdown(input, true);
    expect(output).toContain(`${BOLD}Main Title${RESET}`);
    expect(output).toContain(`${BOLD}Section${RESET}`);
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

  it('renders unordered list items as bullet points', () => {
    const input = '- first item\n- second item\n* third item';
    const output = renderMarkdown(input, true);
    expect(output).toContain('  • first item');
    expect(output).toContain('  • second item');
    expect(output).toContain('  • third item');
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
