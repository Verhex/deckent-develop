// ═══ chat-layout — REPL conversation layout chrome ═══════════════════════════
//
// Visual structure for the native REPL so user input and Deckent replies are
// clearly distinguishable (the claude-code "who said what" hierarchy):
//   - renderUserMessage(line) → echoes the user line with a `›` prefix
//   - renderAssistantHeader() → announces the `● deckent` reply block
//   - messageSeparator()      → a thin rule closing the turn
//
// TTY-aware (ADR-010, Node built-in ANSI — no deps): on a TTY the prefixes
// carry colour; on a pipe/non-TTY they degrade to plain text. The separator
// is pure decoration, so it returns '' on non-TTY (the caller drops empties).
//
// Mirrors the tty-override convention of chat-render.ts so tests can drive
// both branches deterministically.

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

function resolveTty(tty?: boolean): boolean {
  return tty !== undefined ? tty : process.stdout.isTTY === true;
}

/**
 * Render the user's line as a discrete prompt block.
 *
 * @param line The raw user input (already trimmed by the loop).
 * @param tty  Force colour on/off. Defaults to process.stdout.isTTY.
 */
export function renderUserMessage(line: string, tty?: boolean): string {
  if (!resolveTty(tty)) return `› ${line}`;
  return `${CYAN}›${RESET} ${line}`;
}

/**
 * Render the assistant block header shown immediately before the reply.
 *
 * @param tty Force colour on/off. Defaults to process.stdout.isTTY.
 */
export function renderAssistantHeader(tty?: boolean): string {
  if (!resolveTty(tty)) return '● deckent';
  return `${MAGENTA}${BOLD}●${RESET} ${BOLD}deckent${RESET}`;
}

/**
 * Render the inter-turn separator. Pure decoration: returns '' on non-TTY so
 * piped/test output stays clean (the caller suppresses empty strings).
 *
 * @param tty Force colour on/off. Defaults to process.stdout.isTTY.
 */
export function messageSeparator(tty?: boolean): string {
  if (!resolveTty(tty)) return '';
  return `${DIM}${'─'.repeat(40)}${RESET}`;
}
