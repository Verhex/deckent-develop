// TERMINAL-PICKER-002 / 7099 — environment-aware ASCII vs Unicode capability SSOT.
// terminal-glyphs.ts stays environment-free; this module owns locale/TERM policy.

import { isDumbTerminal } from './theme.js';

/**
 * Unicode glyphs are trusted only under a UTF-8 locale
 * (LC_ALL > LC_CTYPE > LANG). Unset locale is UTF-8-capable on modern hosts.
 */
export function hasUtf8Locale(env: Record<string, string | undefined>): boolean {
  const locale = env['LC_ALL'] || env['LC_CTYPE'] || env['LANG'];
  if (!locale) return true;
  return /utf-?8/i.test(locale);
}

/**
 * Terminal-owned decoration uses printable ASCII when the environment cannot
 * trust Unicode block art. Independent of NO_COLOR — color suppression does
 * not demote glyphs. Matches native REPL policy (run.tsx terminalAscii).
 */
export function resolveTerminalAscii(
  env: Record<string, string | undefined> = process.env,
  term: string | undefined = env['TERM'],
): boolean {
  return isDumbTerminal(term ?? '') || env['DECKENT_ASCII'] === '1' || !hasUtf8Locale(env);
}
