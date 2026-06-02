// ANSI escape codes — Node built-in, no external deps (ADR-010)
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m'; // grey — used for code blocks

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

  // ATX headings (# Heading, ## Heading, …)
  result = result.replace(/^(#{1,6}) (.+)$/gm, (_: string, _hashes: string, content: string) => `${BOLD}${content}${RESET}`);

  // Bold (**text**)
  result = result.replace(/\*\*([^*\n]+)\*\*/g, (_: string, content: string) => `${BOLD}${content}${RESET}`);

  // Unordered list items (- item or * item at line start)
  result = result.replace(/^[*-] (.+)$/gm, (_: string, content: string) => `  • ${content}`);

  return result;
}
