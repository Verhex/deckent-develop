import { highlight, type Theme as HighlightTheme } from 'cli-highlight';
import { stripAnsi } from '../helpers/output.js';
import { roleSgrAt, suppressionTier, type ColorTier } from '../helpers/theme.js';
import type { PaletteRole } from '../helpers/generated/palette.js';

// TERMINAL-READABILITY-001 — every color here is a palette ROLE resolved for
// the tier the color gate admits (helpers/theme.ts): host-theme-mapped 16-color
// by default (the user's IDE theme paints it), NOVA token hex only on a
// known-dark background, nothing at all when color is suppressed. SGR
// attributes (bold / italic / underline / inverse / strike) are carriers that
// survive every theme; SGR dim is not a carrier on any theme and is gone
// (owner decision 2026-09-03). Node built-in ANSI (ADR-010 relaxed:
// cli-highlight added for code).
const RESET = '\x1b[0m';

interface Styles {
  bold: string;
  italic: string;
  strike: string;
  inverse: string;
  code: string;
  accent: string;
  link: string;
  info: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
}

function sgr(role: PaletteRole, tier: ColorTier): string {
  const params = roleSgrAt(role, tier);
  return params === null ? '' : `\x1b[${params}m`;
}

/** Resolve the style strings for one render (the tier can change between turns). */
function resolveStyles(tier: ColorTier): Styles {
  const attr = (code: string): string => (tier === 'none' ? '' : `\x1b[${code}m`);
  return {
    bold: attr('1'),
    italic: attr('3'),
    strike: attr('9'),
    inverse: attr('7'),
    code: sgr('code', tier),
    accent: sgr('accent', tier),
    link: sgr('link', tier),
    info: sgr('info', tier),
    success: sgr('success', tier),
    warning: sgr('warning', tier),
    error: sgr('error', tier),
    muted: sgr('muted', tier),
  };
}

/** Visible (printable) width of a string, ignoring ANSI escapes. */
function visibleWidth(s: string): number { return stripAnsi(s).length; }

/** Wrap text in a style; an empty style (default foreground) leaves the text untouched. */
function style(open: string, text: string): string {
  return open === '' ? text : `${open}${text}${RESET}`;
}

/**
 * Wrap `content` in an outer ANSI style, re-opening `open` after any RESET
 * already embedded in `content` (e.g. a nested inline-code/link span rendered
 * by an earlier pass). A plain `${open}${content}${RESET}` wrap would let the
 * inner span's own RESET clear the outer style early — this keeps the outer
 * style active for the remainder of the span, closing only at the very end.
 */
function wrapStyle(open: string, content: string): string {
  if (open === '') return content;
  return `${open}${content.split(RESET).join(`${RESET}${open}`)}${RESET}`;
}

/** TERMINAL-READABILITY-002 — renderer options (the caller resolves them once). */
export interface RenderMarkdownOptions {
  /** Emit OSC 8 hyperlinks (`\x1b]8;;URL\x07 TEXT \x1b]8;;\x07`). Only when the
   *  host is proven to render them (helpers/terminal-links resolveHyperlinks);
   *  off by default so no unproven terminal ever receives the bytes — the URL
   *  then stays visible as text for the host's own link detection. */
  hyperlinks?: boolean;
}

/**
 * A labeled link: an OSC-8 hyperlink when the host renders them (the label is
 * the visible text), otherwise the label in the link role followed by the
 * URL in parentheses — the URL itself is the carrier a host can still detect.
 */
function hyperlink(url: string, text: string, s: Styles, enabled: boolean): string {
  if (!enabled) return text === url ? url : `${style(s.link, text)} (${url})`;
  return `\x1b]8;;${url}\x07${style(s.link, text)}\x1b]8;;\x07`;
}

/** cli-highlight theme from palette roles: attributes and gate-passing colors only. */
function codeTheme(s: Styles): HighlightTheme {
  const w = (open: string) => (text: string): string => style(open, text);
  return {
    keyword: w(s.bold),
    built_in: w(s.code),
    type: w(s.code),
    literal: w(s.info),
    number: w(s.info),
    regexp: w(s.warning),
    string: w(s.success),
    subst: w(''),
    symbol: w(s.info),
    class: w(s.bold),
    function: w(s.bold),
    title: w(s.bold),
    params: w(''),
    comment: w(s.italic),
    doctag: w(s.italic),
    meta: w(s.warning),
    'meta-keyword': w(s.warning),
    'meta-string': w(s.success),
    section: w(s.bold),
    tag: w(s.code),
    name: w(s.code),
    'builtin-name': w(s.code),
    attr: w(s.info),
    attribute: w(s.info),
    variable: w(s.info),
    bullet: w(s.accent),
    code: w(s.code),
    emphasis: w(s.italic),
    strong: w(s.bold),
    formula: w(s.info),
    link: w(s.link),
    quote: w(s.italic),
    'selector-tag': w(s.code),
    'selector-id': w(s.info),
    'selector-class': w(s.info),
    'selector-attr': w(s.info),
    'selector-pseudo': w(s.info),
    'template-tag': w(s.warning),
    'template-variable': w(s.info),
    addition: w(s.success),
    deletion: w(s.error),
    default: w(''),
  };
}

/** A fenced code block → syntax-highlighted, framed box with a language label. */
function renderCodeBlock(lang: string, code: string, s: Styles): string {
  const body = code.replace(/\n$/, '');
  let highlighted = body;
  try {
    const theme = codeTheme(s);
    highlighted = highlight(body, lang ? { language: lang, ignoreIllegals: true, theme } : { ignoreIllegals: true, theme });
  } catch { highlighted = body; }
  const lines = highlighted.split('\n');
  const label = lang || 'code';
  const inner = Math.max(visibleWidth(label) + 2, ...lines.map(visibleWidth));
  const top = `${style(s.accent, '╭─ ')}${style(s.code, label)}${style(s.accent, ` ${'─'.repeat(Math.max(0, inner - visibleWidth(label) - 2))}╮`)}`;
  const bottom = style(s.accent, `╰${'─'.repeat(inner + 1)}╯`);
  const bar = style(s.accent, '│');
  const mid = lines.map((l) => `${bar} ${l}${' '.repeat(Math.max(0, inner - visibleWidth(l) - 1))}${bar}`);
  return [top, ...mid, bottom].join('\n');
}

/** A markdown table block (header + separator + rows) → aligned, boxed ANSI. */
function renderTable(block: string[], s: Styles): string {
  const cells = (line: string): string[] =>
    line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const header = cells(block[0] as string);
  const aligns = cells(block[1] as string).map((a) => {
    const l = a.startsWith(':'), r = a.endsWith(':');
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
    style(s.accent, `${l}${widths.map((w) => '─'.repeat(w + 2)).join(m)}${r}`);
  const edge = style(s.accent, '│');
  const rowLine = (vals: string[], bold: boolean): string =>
    `${edge} ` + vals.map((v, i) => (bold ? style(s.bold, pad(v, i)) : pad(v, i))).join(` ${edge} `) + ` ${edge}`;
  return [
    bar('┌', '┬', '┐'),
    rowLine(header, true),
    bar('├', '┼', '┤'),
    ...rows.map((r) => rowLine(Array.from({ length: cols }, (_, i) => r[i] ?? ''), false)),
    bar('└', '┴', '┘'),
  ].join('\n');
}

/** Admonition kinds → icon + palette role (the WORD is the carrier; color supplements). */
const ADMONITIONS: Record<string, { icon: string; role: keyof Styles }> = {
  NOTE: { icon: 'ℹ', role: 'info' }, TIP: { icon: '💡', role: 'success' },
  IMPORTANT: { icon: '❗', role: 'info' }, WARNING: { icon: '⚠', role: 'warning' },
  CAUTION: { icon: '🛑', role: 'error' },
};

/**
 * Render markdown text to ANSI-colored output for TTY terminals. Block elements
 * (fenced code, tables) are extracted FIRST and stashed behind sentinels so the
 * inline regexes can't corrupt their ANSI, then restored at the end.
 *
 * @param text Raw markdown string from the provider
 * @param tty  Whether to apply ANSI styling. Defaults to process.stdout.isTTY.
 *             Styling still obeys the color gate (NO_COLOR / --no-color /
 *             FORCE_COLOR=0 → attribute-free plain text with markers stripped).
 * @param opts Renderer options — `hyperlinks` (OSC 8) is off unless the caller proved the host.
 */
export function renderMarkdown(text: string, tty?: boolean, opts: RenderMarkdownOptions = {}): string {
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;
  if (!isTTY) return text;
  const s = resolveStyles(suppressionTier());
  const links = opts.hyperlinks === true;

  const blocks: string[] = [];
  const stash = (rendered: string): string => { blocks.push(rendered); return `\x00B${blocks.length - 1}\x00`; };

  let result = text;

  // 1. Fenced code blocks → cli-highlight + framed box (stash to protect).
  result = result.replace(/```(\w*)[^\n]*\n([\s\S]*?)```/g, (_, lang: string, code: string) => stash(renderCodeBlock(lang, code, s)));

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
        out.push(stash(renderTable(blk, s)));
        i = j - 1;
      } else { out.push(cur); }
    }
    result = out.join('\n');
  }

  // 3. Inline code (`code`) — the code role (primary contrast class on every host theme).
  result = result.replace(/`([^`\n]+)`/g, (_: string, code: string) => style(s.code, code));

  // 4. <kbd>X</kbd> → inverse-video badge
  result = result.replace(/<kbd>([^<]+)<\/kbd>/g, (_: string, k: string) => style(s.inverse, ` ${k} `));

  // 5. Markdown links [text](url): http(s) → clickable OSC-8; relative → link
  // text + the path in parentheses (the parentheses are the carrier, not a color).
  // URL group allows one level of balanced parens (e.g. Wikipedia-style
  // `Foo_(bar)`) so the regex doesn't truncate at the URL's own inner ')'
  // and leak the link's real closing ')' unprocessed into the output.
  result = result.replace(
    /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()]*\))+)(?:\s+"[^"]*")?\)/g,
    (_: string, t: string, url: string) =>
      /^https?:\/\//.test(url) ? hyperlink(url, t, s, links) : `${style(s.link, t)} ${style(s.muted, `(${url})`)}`,
  );

  // 6. Bare URLs (http/https) → clickable where proven; otherwise left as the
  // plain text the host detects itself (never split by a style).
  if (links) result = result.replace(/(?<![;\w])(https?:\/\/[^\s)<>\]]+)/g, (_: string, url: string) => hyperlink(url, url, s, true));

  // 7. Horizontal rule (---, ***, ___) — a decorative frame line.
  result = result.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, style(s.accent, '─'.repeat(40)));

  // 8. ATX headings — hierarchy: # bold+info, ## bold, ### bold (weight, never dim).
  result = result.replace(/^(#{1,6}) (.+)$/gm, (_: string, hashes: string, content: string) => {
    const level = hashes.length;
    if (level === 1) return wrapStyle(`${s.bold}${s.info}`, content);
    return wrapStyle(s.bold, content);
  });

  // 9. Admonitions: > [!NOTE] … → icon + WORD header + role-colored left bar.
  {
    const lines = result.split('\n');
    let activeStyle: string | null = null;
    result = lines.map((line) => {
      const adm = line.match(/^\s*>\s*\[!(\w+)\]\s*(.*)$/i);
      if (adm) {
        const a = ADMONITIONS[(adm[1] as string).toUpperCase()];
        if (a) {
          activeStyle = s[a.role];
          return `${style(`${activeStyle}${s.bold}`, `${a.icon} ${(adm[1] as string).toUpperCase()}`)}${adm[2] ? ` ${style(activeStyle, adm[2])}` : ''}`;
        }
      }
      const q = line.match(/^\s*>\s?(.*)$/);
      if (q) { const c = activeStyle ?? s.accent; return `${style(c, '▌')} ${q[1]}`; }
      activeStyle = null;
      return line;
    }).join('\n');
  }

  // 10. Bold + italic + strikethrough (order matters: *** before ** before *).
  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, (_: string, c: string) => wrapStyle(`${s.bold}${s.italic}`, c));
  result = result.replace(/\*\*([^*\n]+)\*\*/g, (_: string, c: string) => wrapStyle(s.bold, c));
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_: string, c: string) => wrapStyle(s.italic, c));
  result = result.replace(/(?<![\w\\])_([^_\n]+)_(?![\w])/g, (_: string, c: string) => wrapStyle(s.italic, c));
  result = result.replace(/~~([^~\n]+)~~/g, (_: string, c: string) => wrapStyle(s.strike, c));

  // 11. Ordered lists (1. 2. …) — preserve leading indent (nesting).
  result = result.replace(/^(\s*)(\d+)\. (.+)$/gm, (_: string, ind: string, n: string, c: string) => `${ind}${style(s.accent, `${n}.`)} ${c}`);

  // 12. Unordered list items (-, *, + at line start) — preserve indent (nesting).
  result = result.replace(/^(\s*)[*+-] (.+)$/gm, (_: string, ind: string, c: string) => `${ind}${style(s.accent, '•')} ${c}`);

  // 13. Project file paths → code role. LAST + ANSI-safe (split on escapes, colour plain only).
  const ANSI_RUN = /(\x1b\[[0-9;]*m|\x1b\]8;;[^\x07]*\x07)/;
  // TERMINAL-READABILITY-002 — the whole `path:line:col` reference is ONE span
  // (never split by a style) so the host's own link detection opens the file
  // at the line; OSC 8 is deliberately not used for file references.
  const PATH = /(?<![\w/:.@-])((?:src|docs|tests|scripts|\.brain|\.deckent|\.claude)\/[\w./-]+|[\w-]+\/[\w./-]+\.(?:ts|tsx|md|json|mjs|cjs|js))(?::\d+(?::\d+)?)?/g;
  result = result
    .split(ANSI_RUN)
    .map((seg) => (ANSI_RUN.test(seg) ? seg : seg.replace(PATH, (m) => style(s.code, m))))
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
 * The styles follow the color gate like renderMarkdown (suppressed → the
 * markers are stripped, nothing is painted).
 */
export function createStreamMarkdown(tty?: boolean): StreamMarkdown {
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;
  if (!isTTY) {
    return { feed: (chunk) => chunk, flush: () => '' };
  }
  const s = resolveStyles(suppressionTier());
  const close = (open: string): string => (open === '' ? '' : RESET);
  let bold = false;
  let code = false;
  let pending = ''; // a trailing '*' that might be the start of '**'

  return {
    feed(chunk: string): string {
      const src = pending + chunk;
      pending = '';
      let out = '';
      for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === '*' && src[i + 1] === '*') {
          out += bold ? close(s.bold) : s.bold;
          bold = !bold;
          i++; // consume the second '*'
          continue;
        }
        if (c === '*' && i === src.length - 1) {
          pending = '*'; // could be the first of '**' arriving next chunk
          break;
        }
        if (c === '`') {
          out += code ? close(s.code) : s.code;
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
      if (bold) { out += close(s.bold); bold = false; }
      if (code) { out += close(s.code); code = false; }
      return out;
    },
  };
}
