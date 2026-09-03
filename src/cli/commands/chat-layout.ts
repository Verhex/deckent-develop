// ═══ chat-layout — REPL conversation layout chrome ═══════════════════════════
//
// Visual structure for the native REPL so user input and Deckent replies are
// clearly distinguishable (the claude-code "who said what" hierarchy):
//   - renderUserMessage(line) → echoes the user line with a `›` prefix
//   - renderAssistantHeader() → announces the `● deckent` reply block
//   - messageSeparator()      → a thin rule closing the turn
//
// TTY-aware (ADR-010, Node built-in ANSI — no deps): on a TTY the prefixes
// carry the palette roles the color gate admits (TERMINAL-READABILITY-001:
// host-theme-mapped, never a literal, never dim); on a pipe/non-TTY they
// degrade to plain text. The separator is pure decoration, so it returns ''
// on non-TTY (the caller drops empties).
//
// Mirrors the tty-override convention of chat-render.ts so tests can drive
// both branches deterministically.

import { roleSgrAt, suppressionTier, type ColorTier } from '../helpers/theme.js';
import type { PaletteRole } from '../helpers/generated/palette.js';

const RESET = '\x1b[0m';

function resolveTty(tty?: boolean): boolean {
  return tty !== undefined ? tty : process.stdout.isTTY === true;
}

function paint(role: PaletteRole, text: string, tier: ColorTier): string {
  const params = roleSgrAt(role, tier);
  return params === null ? text : `\x1b[${params}m${text}${RESET}`;
}

function bold(text: string, tier: ColorTier): string {
  return tier === 'none' ? text : `\x1b[1m${text}${RESET}`;
}

/**
 * Render the user's line as a discrete prompt block.
 *
 * @param line The raw user input (already trimmed by the loop).
 * @param tty  Force colour on/off. Defaults to process.stdout.isTTY.
 */
export function renderUserMessage(line: string, tty?: boolean): string {
  if (!resolveTty(tty)) return `› ${line}`;
  return `${paint('accent', '›', suppressionTier())} ${line}`;
}

/**
 * Render the assistant block header shown immediately before the reply.
 *
 * @param tty Force colour on/off. Defaults to process.stdout.isTTY.
 */
export function renderAssistantHeader(tty?: boolean): string {
  if (!resolveTty(tty)) return '● deckent';
  const tier = suppressionTier();
  return `${paint('accent', '●', tier)} ${bold('deckent', tier)}`;
}

/**
 * Render the inter-turn separator. Pure decoration: returns '' on non-TTY so
 * piped/test output stays clean (the caller suppresses empty strings).
 *
 * @param tty Force colour on/off. Defaults to process.stdout.isTTY.
 */
export function messageSeparator(tty?: boolean): string {
  if (!resolveTty(tty)) return '';
  return paint('accent', '─'.repeat(40), suppressionTier());
}
