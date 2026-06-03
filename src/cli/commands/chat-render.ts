import { highlight } from 'cli-highlight';
import { stripAnsi } from '../helpers/output.js';

// ANSI escape codes — Node built-in (ADR-010 relaxed: cli-highlight added for code).
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m'; // grey — used for inline code
const CYAN  = '\x1b[36m';
const UNDER = '\x1b[4m';
const ITALIC = '\x1b[3m';
const STRIKE = '\x1b[9m';
const INVERSE = '\x1b[7m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';

/** Visible (printable) width of a string, ignoring ANSI escapes. */
function visibleWidth(s: string): number { return stripAnsi(s).length; }

/**
 * Wrap visible text as an OSC-8 terminal hyperlink (clickable in VS Code /
 * iTerm / modern terminals). Falls back gracefully — terminals that ignore
 * OSC-8 just print the visible text. `\x1b]8;;URL\x07 TEXT \x1b]8;;\x07`.
 */
function hyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x07${CYAN}${UNDER}${text}${RESET}\x1b]8;;\x07`;
}

/** A fenced code block → syntax-highlighted, framed box with a language label. */
function renderCodeBlock(lang: string, code: string): string {
  const body = code.replace(/\n$/, '');
  let highlighted = body;
  try {
    highlighted = highlight(body, lang ? { language: lang, ignoreIllegals: true } : { ignoreIllegals: true });
  } catch { highlighted = `${DIM}${body}${RESET}`; }
  const lines = highlighted.split('\n');
  const label = lang || 'code';
  const inner = Math.max(visibleWidth(label) + 2, ...lines.map(visibleWidth));
  const top = `${DIM}╭─ ${RESET}${CYAN}${label}${RESET}${DIM} ${'─'.repeat(Math.max(0, inner - visibleWidth(label) - 2))}╮${RESET}`;
  const bottom = `${DIM}╰${'─'.repeat(inner + 1)}╯${RESET}`;
  const mid = lines.map((l) => `${DIM}│${RESET} ${l}${' '.repeat(Math.max(0, inner - visibleWidth(l) - 1))}${DIM}│${RESET}`);
  return [top, ...mid, bottom].join('\n');
}

/** A markdown table block (header + separator + rows) → aligned, boxed ANSI. */
function renderTable(block: string[]): string {
  const cells = (line: string): string[] =>
    line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const header = cells(block[0] as string);
  const aligns = cells(block[1] as string).map((s) => {
    const l = s.startsWith(':'), r = s.endsWith(':');
    return r && l ? 'center' : r ? 'right' : 'left';
  });
  const rows = block.slice(2).map(cells);
  const cols = header.length;
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(visibleWidth(header[i] ?? ''), ...rows.map((r) => visibleWidth(r[i] ?? ''))));
  const pad = (text: string, i: number): string => {
    const w = widths[i] ?? 0; const gap = w - visibleWidth(text);
    const a = aligns[i] ?? 'left';
    if (gap <= 0) return text;
    if (a === 'right') return ' '.repeat(gap) + text;
    if (a === 'center') { const l = gap >> 1; return ' '.repeat(l) + text + ' '.repeat(gap - l); }
    return text + ' '.repeat(gap);
  };
  const bar = (l: string, m: string, r: string): string =>
    `${DIM}${l}${widths.map((w) => '─'.repeat(w + 2)).join(m)}${r}${RESET}`;
  const rowLine = (vals: string[], bold: boolean): string =>
    `${DIM}│${RESET} ` + vals.map((v, i) => (bold ? `${BOLD}${pad(v, i)}${RESET}` : pad(v, i))).join(`${DIM} │ ${RESET}`) + ` ${DIM}│${RESET}`;
  return [
    bar('┌', '┬', '┐'),
    rowLine(header, true),
    bar('├', '┼', '┤'),
    ...rows.map((r) => rowLine(Array.from({ length: cols }, (_, i) => r[i] ?? ''), false)),
    bar('└', '┴', '┘'),
  ].join('\n');
}

const ADMONITIONS: Record<string, { icon: string; color: string }> = {
  NOTE: { icon: 'ℹ', color: BLUE }, TIP: { icon: '💡', color: GREEN },
  IMPORTANT: { icon: '❗', color: MAGENTA }, WARNING: { icon: '⚠', color: YELLOW },
  CAUTION: { icon: '🛑', color: RED },
};

/**
 * Render markdown text to ANSI-colored output for TTY terminals. Block elements
 * (fenced code, tables) are extracted FIRST and stashed behind sentinels so the
 * inline regexes can't corrupt their ANSI, then restored at the end.
 *
 * @param text Raw markdown string from the provider
 * @param tty  Whether to apply ANSI color. Defaults to process.stdout.isTTY.
 */
export function renderMarkdown(text: string, tty?: boolean): string {
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;
  if (!isTTY) return text;

  const blocks: string[] = [];
  const stash = (rendered: string): string => { blocks.push(rendered); return `\x00B${blocks.length - 1}\x00`; };

  let result = text;

  // 1. Fenced code blocks → cli-highlight + framed box (stash to protect).
  result = result.replace(/```(\w*)[^\n]*\n([\s\S]*?)```/g, (_, lang: string, code: string) => stash(renderCodeBlock(lang, code)));

  // 2. Tables (header + |---| separator + rows) → aligned boxed table (stash).
  const isSep = (l: string): boolean => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  {
    const lines = result.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i] as string;
      const next = lines[i + 1];
      if (cur.includes('|') && next !== undefined && isSep(next)) {
        const blk = [cur, next];
        let j = i + 2;
        while (j < lines.length && (lines[j] as string).includes('|') && (lines[j] as string).trim() !== '') { blk.push(lines[j] as string); j++; }
        out.push(stash(renderTable(blk)));
        i = j - 1;
      } else { out.push(cur); }
    }
    result = out.join('\n');
  }

  // 3. Inline code (`code`)
  result = result.replace(/`([^`\n]+)`/g, (_: string, code: string) => `${DIM}${code}${RESET}`);

  // 4. <kbd>X</kbd> → inverse-video badge
  result = result.replace(/<kbd>([^<]+)<\/kbd>/g, (_: string, k: string) => `${INVERSE} ${k} ${RESET}`);

  // 5. Markdown links [text](url): http(s) → clickable OSC-8; relative → cyan + dim path.
  result = result.replace(
    /\[([^\]\n]+)\]\((\S+?)(?:\s+"[^"]*")?\)/g,
    (_: string, t: string, url: string) =>
      /^https?:\/\//.test(url) ? hyperlink(url, t) : `${CYAN}${t}${RESET} ${DIM}(${url})${RESET}`,
  );

  // 6. Bare URLs (http/https) → clickable.
  result = result.replace(/(?<![;\w])(https?:\/\/[^\s)<>\]]+)/g, (_: string, url: string) => hyperlink(url, url));

  // 7. Horizontal rule (---, ***, ___)
  result = result.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, `${DIM}${'─'.repeat(40)}${RESET}`);

  // 8. ATX headings — hierarchy: # bold-cyan, ## bold, ### dim-bold.
  result = result.replace(/^(#{1,6}) (.+)$/gm, (_: string, hashes: string, content: string) => {
    const level = hashes.length;
    if (level === 1) return `${BOLD}${CYAN}${content}${RESET}`;
    if (level === 2) return `${BOLD}${content}${RESET}`;
    return `${BOLD}${DIM}${content}${RESET}`;
  });

  // 9. Admonitions: > [!NOTE] … → colored icon header + colored left-bar quote.
  {
    const lines = result.split('\n');
    let activeColor: string | null = null;
    result = lines.map((line) => {
      const adm = line.match(/^\s*>\s*\[!(\w+)\]\s*(.*)$/i);
      if (adm) {
        const a = ADMONITIONS[(adm[1] as string).toUpperCase()];
        if (a) { activeColor = a.color; return `${a.color}${BOLD}${a.icon} ${(adm[1] as string).toUpperCase()}${RESET}${adm[2] ? ` ${a.color}${adm[2]}${RESET}` : ''}`; }
      }
      const q = line.match(/^\s*>\s?(.*)$/);
      if (q) { const c = activeColor ?? DIM; return `${c}▌${RESET} ${c === DIM ? DIM : ''}${q[1]}${RESET}`; }
      activeColor = null;
      return line;
    }).join('\n');
  }

  // 10. Bold + italic + strikethrough (order matters: *** before ** before *).
  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, (_: string, c: string) => `${BOLD}${ITALIC}${c}${RESET}`);
  result = result.replace(/\*\*([^*\n]+)\*\*/g, (_: string, c: string) => `${BOLD}${c}${RESET}`);
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_: string, c: string) => `${ITALIC}${c}${RESET}`);
  result = result.replace(/(?<![\w\\])_([^_\n]+)_(?![\w])/g, (_: string, c: string) => `${ITALIC}${c}${RESET}`);
  result = result.replace(/~~([^~\n]+)~~/g, (_: string, c: string) => `${STRIKE}${c}${RESET}`);

  // 11. Ordered lists (1. 2. …) — preserve leading indent (nesting).
  result = result.replace(/^(\s*)(\d+)\. (.+)$/gm, (_: string, ind: string, n: string, c: string) => `${ind}${CYAN}${n}.${RESET} ${c}`);

  // 12. Unordered list items (-, *, + at line start) — preserve indent (nesting).
  result = result.replace(/^(\s*)[*+-] (.+)$/gm, (_: string, ind: string, c: string) => `${ind}${CYAN}•${RESET} ${c}`);

  // 13. Project file paths → cyan. LAST + ANSI-safe (split on escapes, colour plain only).
  const ANSI_RUN = /(\x1b\[[0-9;]*m|\x1b\]8;;[^\x07]*\x07)/;
  const PATH = /(?<![\w/:.@-])((?:src|docs|tests|scripts|\.brain|\.deckent|\.claude)\/[\w./-]+|[\w-]+\/[\w./-]+\.(?:ts|tsx|md|json|mjs|cjs|js))(?::\d+)?/g;
  result = result
    .split(ANSI_RUN)
    .map((seg) => (ANSI_RUN.test(seg) ? seg : seg.replace(PATH, (m) => `${CYAN}${m}${RESET}`)))
    .join('');

  // Restore stashed block elements (code/tables) untouched by the inline passes.
  result = result.replace(/\x00B(\d+)\x00/g, (_: string, i: string) => blocks[Number(i)] ?? '');

  return result;
}

// ─── Streaming markdown (Sprint 224 T-224-023) ──────────────────────
//
// renderMarkdown() needs the FULL text (regex over the whole string), so it
// can't run on a token-by-token stream — the REPL streams the reply inline and
// `**bold**` / `` `code` `` markers would show LITERALLY. createStreamMarkdown
// is a STATEFUL transform: feed(chunk) emits ANSI as `**`/`` ` `` toggles are
// seen, carrying a marker split across chunk boundaries in `pending`. On a
// non-TTY it is a passthrough (pipe/test/HTTP unchanged). flush() closes any
// still-open bold/code at end of turn so styling never leaks.

export interface StreamMarkdown {
  /** Transform one streamed chunk → ANSI-styled text (bold/code toggles). */
  feed(chunk: string): string;
  /** End-of-turn: emit any held partial marker + close open bold/code. */
  flush(): string;
}

/**
 * Stateful streaming markdown renderer. TTY only — non-TTY returns a
 * passthrough so piped/test output stays byte-for-byte identical.
 * Handles `**bold**` and `` `code` `` (the markers that otherwise leak as
 * literal `**`/`` ` `` during inline token streaming). A lone trailing `*`
 * is held in `pending` in case the next chunk starts the second `*`.
 */
export function createStreamMarkdown(tty?: boolean): StreamMarkdown {
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;
  if (!isTTY) {
    return { feed: (chunk) => chunk, flush: () => '' };
  }
  let bold = false;
  let code = false;
  let pending = ''; // a trailing '*' that might be the start of '**'

  return {
    feed(chunk: string): string {
      const s = pending + chunk;
      pending = '';
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '*' && s[i + 1] === '*') {
          out += bold ? RESET : BOLD;
          bold = !bold;
          i++; // consume the second '*'
          continue;
        }
        if (c === '*' && i === s.length - 1) {
          pending = '*'; // could be the first of '**' arriving next chunk
          break;
        }
        if (c === '`') {
          out += code ? RESET : DIM;
          code = !code;
          continue;
        }
        out += c;
      }
      return out;
    },
    flush(): string {
      let out = pending;
      pending = '';
      if (bold) { out += RESET; bold = false; }
      if (code) { out += RESET; code = false; }
      return out;
    },
  };
}
