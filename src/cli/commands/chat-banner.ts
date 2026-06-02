// ANSI escape codes — Node built-in, no external deps (ADR-010)
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const CYAN   = '\x1b[36m';

/** Context provided to renderBanner by the REPL boot path. */
export interface BannerContext {
  /** Provider name, e.g. 'claude', 'ollama', 'gemini'. */
  provider: string;
  /** Current working directory shown to the user. */
  dir: string;
}

/**
 * Render the REPL welcome banner.
 *
 * Pure function — no I/O, no side effects. Returns an empty string for
 * non-TTY contexts (pipe / redirect) so banner output never pollutes
 * scripted consumers.
 *
 * Default TTY output (two lines):
 *   deckent  claude  ~/my-project
 *   /help komutlar için · doğal dil sohbet
 *
 * @param ctx  Banner context (provider + dir)
 * @param tty  Whether to apply ANSI color + banner. Defaults to
 *             process.stdout.isTTY. Pass false explicitly for pipe contexts.
 */
export function renderBanner(ctx: BannerContext, tty?: boolean): string {
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;
  if (!isTTY) return '';

  const header = `${BOLD}${CYAN}deckent${RESET}  ${ctx.provider}  ${DIM}${ctx.dir}${RESET}`;
  const hint   = `${DIM}/help komutlar için · doğal dil sohbet${RESET}`;

  return `${header}\n${hint}\n`;
}
