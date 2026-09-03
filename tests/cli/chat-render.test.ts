import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderMarkdown } from '../../src/cli/commands/chat-render.js';

// TERMINAL-READABILITY-001 — every color is a palette ROLE resolved for the
// tier the color gate admits. The tests pin the host-theme-mapped 16-color
// tier (FORCE_COLOR=1, no COLORFGBG/COLORTERM) so the SGR codes are exact:
//   code / info  → 94 (bright blue: ≥4.5:1 on every host theme fixture)
//   link         → 4;94 (underlined bright blue)
//   accent       → 36 (decorative frames, bullets, rules)
//   warning      → 33 · success → 32 · error → 31 (beside their words)
//   muted        → default foreground (no SGR)  ·  dim → never
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const CODE  = '\x1b[94m';
const INFO  = '\x1b[94m';
const LINK  = '\x1b[4;94m';
const ACCENT = '\x1b[36m';
const DIM = '\x1b[2m';

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

describe('renderMarkdown', () => {
  it('renders fenced code blocks framed by the accent role with the code-role label (never dim)', () => {
    const input = 'Example:\n```\nconsole.log("hello");\n```\nDone.';
    const output = renderMarkdown(input, true);
    expect(output).toContain(`${ACCENT}╭─ ${RESET}${CODE}code${RESET}`);
    // the body is syntax-highlighted through the role theme, so compare the plain text
    expect(output.replace(/\x1b\[[0-9;]*m/g, '')).toContain('console.log("hello");');
    expect(output).toContain(RESET);
    expect(output).not.toContain(DIM);
    // backtick fences should be stripped from output
    expect(output).not.toContain('```');
  });

  it('renders ATX headings with a visual hierarchy (# bold+info, ## bold)', () => {
    const input = '# Main Title\n## Section\nBody text.';
    const output = renderMarkdown(input, true);
    expect(output).toContain(`${BOLD}${INFO}Main Title${RESET}`); // level 1 → bold + info role
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

  it('renders inline code with the code role (bright blue), never dim', () => {
    const input = 'Use `npm install` to install deps.';
    const output = renderMarkdown(input, true);
    expect(output).toContain(`${CODE}npm install${RESET}`);
    expect(output).not.toContain(DIM);
    // backtick markers stripped
    expect(output).not.toMatch(/`npm install`/);
  });

  it('renders unordered list items as accent bullet points (indent-preserving)', () => {
    const input = '- first item\n- second item\n* third item';
    const output = renderMarkdown(input, true);
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    expect(strip(output)).toContain('• first item');
    expect(strip(output)).toContain('• second item');
    expect(strip(output)).toContain('• third item');
    expect(output).toContain(`${ACCENT}•${RESET}`); // accent bullet
  });

  it('handles empty string without throwing', () => {
    expect(() => renderMarkdown('', true)).not.toThrow();
    expect(renderMarkdown('', true)).toBe('');
  });

  it('handles plain prose (no markdown) unchanged in TTY mode', () => {
    const input = 'Hello world, this is plain text.';
    expect(renderMarkdown(input, true)).toBe(input);
  });

  it('never emits SGR dim on any element (kitchen sink)', () => {
    const md = [
      '# Title `code` more', '## Section', '### Sub', 'text `inline` and **bold** and *it*',
      '- a', '1. b', '> quote', '> [!NOTE]\n> note', '---', '<kbd>Ctrl</kbd>', '~~old~~',
      '[Docs](https://x.io) and [rel](docs/a.md) and src/a.ts:1',
      '| A | B |\n|---|--:|\n| 1 | 2 |', '```ts\nconst x = 1; // c\n```',
    ].join('\n\n');
    expect(renderMarkdown(md, true)).not.toContain(DIM);
  });

  it('tty=true still obeys the color gate: NO_COLOR → markers stripped, no ANSI at all', () => {
    delete process.env['FORCE_COLOR'];
    process.env['NO_COLOR'] = '1';
    const out = renderMarkdown('# T\n**b** `c` [d](https://x.io)\n- e', true);
    expect(out).not.toContain('\x1b[');
    expect(out).not.toContain('**');
    expect(out).toContain('T');
    expect(out).toContain('• e');
  });
});

import { renderMarkdown as renderMd2 } from '../../src/cli/commands/chat-render.js';

describe('renderMarkdown — links, URLs, file paths (Sprint 224 readability)', () => {
  // TERMINAL-READABILITY-002 — OSC 8 is capability-gated: the caller passes
  // `{ hyperlinks: true }` only when the host is proven (helpers/terminal-links);
  // the default writes NO OSC byte and keeps the URL visible for the IDE's own
  // link detection.
  const ON = { hyperlinks: true };

  it('markdown link → OSC-8 hyperlink with the underlined link role (hyperlinks on)', () => {
    const out = renderMd2('see [Docs](https://docs.anthropic.com)', true, ON);
    expect(out).toContain('\x1b]8;;https://docs.anthropic.com\x07'); // OSC-8 open
    expect(out).toContain(`${LINK}Docs${RESET}`);
    expect(out).toContain('\x1b]8;;\x07'); // OSC-8 close
    expect(out).not.toContain('[Docs]'); // raw markdown gone
  });

  it('markdown link (hyperlinks off / default) → label in the link role + the URL visible, no OSC byte', () => {
    const out = renderMd2('see [Docs](https://docs.anthropic.com)', true);
    expect(out).not.toContain('\x1b]8;;');
    expect(out).toContain(`${LINK}Docs${RESET} (https://docs.anthropic.com)`);
    expect(out).not.toContain('[Docs]');
  });

  it('bare URL → clickable OSC-8 (on); untouched plain URL (off)', () => {
    expect(renderMd2('go to https://github.com/x/y now', true, ON)).toContain('\x1b]8;;https://github.com/x/y\x07');
    const off = renderMd2('go to https://github.com/x/y now', true);
    expect(off).not.toContain('\x1b]8;;');
    expect(off).toContain('go to https://github.com/x/y now');
  });

  it('does NOT double-wrap a URL already inside a markdown link', () => {
    const out = renderMd2('[API](https://docs.anthropic.com/en/api)', true, ON);
    // exactly one OSC-8 open for that URL
    const opens = out.split('\x1b]8;;https://docs.anthropic.com/en/api\x07').length - 1;
    expect(opens).toBe(1);
  });

  it('a file reference is never wrapped in OSC 8 — the host detects path:line:col itself', () => {
    const out = renderMd2('see src/cli/entry.ts:42:7 now', true, ON);
    expect(out).not.toContain('\x1b]8;;');
    expect(out).toContain(`${CODE}src/cli/entry.ts:42:7${RESET}`);
  });

  it('project file path → code role', () => {
    const out = renderMd2('edit src/cli/commands/chat-native.ts please', true);
    expect(out).toContain(`${CODE}src/cli/commands/chat-native.ts${RESET}`);
  });

  it('file path with line number → colored incl. :NN', () => {
    const out = renderMd2('at src/cli/entry.ts:42 there', true);
    expect(out).toContain(`${CODE}src/cli/entry.ts:42${RESET}`);
  });

  it('relative link → link role text + the path in parentheses (no dim)', () => {
    const out = renderMd2('read [the guide](docs/guide.md)', true);
    // the path inside the parentheses is a project path → the code role (pass 13)
    expect(out).toContain(`${LINK}the guide${RESET} (${CODE}docs/guide.md${RESET})`);
    expect(out).not.toContain(DIM);
  });

  it('non-TTY → passthrough (no ANSI, no OSC-8)', () => {
    const out = renderMd2('[Docs](https://x.io) and src/a.ts', false);
    expect(out).toBe('[Docs](https://x.io) and src/a.ts');
  });

  it('does not colorize a path segment inside a URL', () => {
    const out = renderMd2('https://github.com/anthropics/claude-code', true, { hyperlinks: true });
    // the URL is one hyperlink; no stray path-coloring inside it
    expect(out).toContain('\x1b]8;;https://github.com/anthropics/claude-code\x07');
    expect(out).not.toContain(`${CODE}anthropics`);
    const off = renderMd2('https://github.com/anthropics/claude-code', true);
    expect(off).not.toContain(`${CODE}anthropics`);
    expect(off).toContain('https://github.com/anthropics/claude-code');
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
    expect(out).toContain(`${ACCENT}│${RESET}`); // accent frame
  });

  it('fenced code block → framed box with language label', () => {
    const out = renderMarkdown('```ts\nconst x = 1;\n```', true);
    const plain = strip(out);
    expect(plain).toContain('╭'); expect(plain).toContain('ts'); expect(plain).toContain('const x = 1;');
    expect(plain).toContain('╰');
  });

  it('syntax highlighting uses roles and attributes only (keyword bold, comment italic, no dim, no raw chalk color)', () => {
    const out = renderMarkdown('```ts\nconst x = "s"; // note\n```', true);
    expect(out).toContain(`${BOLD}const${RESET}`);
    expect(out).toContain('\x1b[3m// note\x1b[0m');
    expect(out).toContain('\x1b[32m"s"\x1b[0m');
    expect(out).not.toContain(DIM);
    expect(out).not.toMatch(/\x1b\[(90|3[4-5])m/); // no gray / blue / magenta from a chalk default theme
  });

  it('admonition [!WARNING] → warning role header word + left bar', () => {
    const out = renderMarkdown('> [!WARNING]\n> dikkat et', true);
    expect(out).toContain('\x1b[33m'); // warning role (the WORD carries it)
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

  it('horizontal rule --- → accent line', () => {
    const out = renderMarkdown('---', true);
    expect(strip(out)).toContain('─');
    expect(out).toContain(ACCENT);
    expect(out).not.toContain(DIM);
  });

  it('ordered list 1. → accent number', () => {
    const out = renderMarkdown('1. ilk\n2. iki', true);
    expect(strip(out)).toContain('1.'); expect(out).toContain(ACCENT);
  });

  it('blockquote > → left bar, quoted text in the default foreground', () => {
    const out = renderMarkdown('> alıntı', true);
    expect(strip(out)).toContain('▌');
    expect(out).toContain(`${ACCENT}▌${RESET} alıntı`);
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
