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
