// ANSI escape codes — Node built-in, no external deps (ADR-010)
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m'; // grey — used for code blocks
const CYAN  = '\x1b[36m';
const UNDER = '\x1b[4m';
const ITALIC = '\x1b[3m';

/**
 * Wrap visible text as an OSC-8 terminal hyperlink (clickable in VS Code /
 * iTerm / modern terminals). Falls back gracefully — terminals that ignore
 * OSC-8 just print the visible text. `\x1b]8;;URL\x07 TEXT \x1b]8;;\x07`.
 */
function hyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x07${CYAN}${UNDER}${text}${RESET}\x1b]8;;\x07`;
}

/**
 * Render markdown text to ANSI-colored output for TTY terminals.
 *
 * @param text     Raw markdown string from the provider
 * @param tty      Whether to apply ANSI color. Defaults to process.stdout.isTTY.
 *                 Pass false explicitly for non-TTY / pipe contexts.
 */
export function renderMarkdown(text: string, tty?: boolean): string {
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;
  if (!isTTY) return text;

  let result = text;

  // Fenced code blocks (``` ... ```) — processed first to avoid re-matching
  result = result.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => {
    const trimmed = code.replace(/\n$/, '');
    return `${DIM}${trimmed}${RESET}`;
  });

  // Inline code (`code`) — only outside already-processed fenced blocks
  result = result.replace(/`([^`\n]+)`/g, (_: string, code: string) => `${DIM}${code}${RESET}`);

  // Markdown links [text](url): only http(s) become clickable OSC-8 hyperlinks.
  // A relative/local target (./docs/guide.md, #anchor) is NOT a URI the terminal
  // can open — render it as cyan text + a dim path so it stays readable instead
  // of a broken hyperlink. Process BEFORE bare URLs.
  result = result.replace(
    /\[([^\]\n]+)\]\((\S+?)(?:\s+"[^"]*")?\)/g,
    (_: string, text: string, url: string) =>
      /^https?:\/\//.test(url) ? hyperlink(url, text) : `${CYAN}${text}${RESET} ${DIM}(${url})${RESET}`,
  );

  // Bare URLs (http/https) → clickable. Negative lookbehind for ';' skips the
  // URL already embedded in an OSC-8 sequence (8;;URL) emitted just above.
  result = result.replace(
    /(?<![;\w])(https?:\/\/[^\s)<>\]]+)/g,
    (_: string, url: string) => hyperlink(url, url),
  );

  // ATX headings — visual hierarchy: # bold-cyan, ## bold, ### dim-bold.
  result = result.replace(/^(#{1,6}) (.+)$/gm, (_: string, hashes: string, content: string) => {
    const level = hashes.length;
    if (level === 1) return `${BOLD}${CYAN}${content}${RESET}`;
    if (level === 2) return `${BOLD}${content}${RESET}`;
    return `${BOLD}${DIM}${content}${RESET}`;
  });

  // Bold + italic (***…*** before **…** before *…*/_…_ so markers don't clash).
  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, (_: string, c: string) => `${BOLD}${ITALIC}${c}${RESET}`);
  result = result.replace(/\*\*([^*\n]+)\*\*/g, (_: string, c: string) => `${BOLD}${c}${RESET}`);
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_: string, c: string) => `${ITALIC}${c}${RESET}`);
  result = result.replace(/(?<![\w\\])_([^_\n]+)_(?![\w])/g, (_: string, c: string) => `${ITALIC}${c}${RESET}`);

  // Unordered list items (- item or * item at line start)
  result = result.replace(/^[*-] (.+)$/gm, (_: string, content: string) => `  • ${content}`);

  // Project file paths → cyan (VS Code click-to-open). Done LAST and ANSI-safe:
  // split on existing escape sequences and only colour PLAIN segments, so paths
  // never corrupt an already-emitted code/link/bold escape (the `\x1b[2m`+path
  // collision bug).
  const ANSI_RUN = /(\x1b\[[0-9;]*m|\x1b\]8;;[^\x07]*\x07)/;
  const PATH = /(?<![\w/:.@-])((?:src|docs|tests|scripts|\.brain|\.deckent|\.claude)\/[\w./-]+|[\w-]+\/[\w./-]+\.(?:ts|tsx|md|json|mjs|cjs|js))(?::\d+)?/g;
  result = result
    .split(ANSI_RUN)
    .map((seg) => (ANSI_RUN.test(seg) ? seg : seg.replace(PATH, (m) => `${CYAN}${m}${RESET}`)))
    .join('');

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
