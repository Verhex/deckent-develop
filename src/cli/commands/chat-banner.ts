import { requireInjectedLabel } from '../helpers/injected-label.js';
import { theme } from '../helpers/theme.js';

// TERMINAL-TOOLS-003 — color goes through the theme.ts SSOT gate (--no-color >
// FORCE_COLOR > NO_COLOR > TERM=dumb > TTY). The raw BOLD/DIM/CYAN constants
// this file used to own painted SGR on a dumb terminal and under NO_COLOR
// (real-binary evidence, 2026-09-02).

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
 * String-free mechanism (TERMINAL-TOOLS-001): the only user-visible words
 * here are the product name and the caller's `ctx` fields; the hint line is a
 * REQUIRED injected label (entry.ts resolves `tui.banner.hint` for the
 * session language). There is no fallback text — a missing hint throws
 * {@link InjectedLabelMissingError} before the TTY check so the contract
 * violation is loud in every mode. (Before this closure the Turkish hint was
 * hardcoded here and rendered above an English `/` menu in every non-Turkish
 * legacy session.)
 *
 * TTY output (two lines):
 *   deckent  claude  ~/my-project
 *   <hint>
 *
 * @param ctx  Banner context (provider + dir)
 * @param tty  Whether to print the banner at all. Defaults to
 *             process.stdout.isTTY. Pass false explicitly for pipe contexts.
 *             Color itself is decided by the theme.ts gate, never by `tty`.
 * @param hint Localized hint line (tui.banner.hint) — required.
 */
export function renderBanner(ctx: BannerContext, tty: boolean | undefined, hint: string): string {
  const hintText = requireInjectedLabel('banner.hint', hint);
  const isTTY = tty !== undefined ? tty : process.stdout.isTTY === true;
  if (!isTTY) return '';

  const header = `${theme.bold(theme.accent('deckent'))}  ${ctx.provider}  ${theme.muted(ctx.dir)}`;
  const hintLine = theme.muted(hintText);

  return `${header}\n${hintLine}\n`;
}
