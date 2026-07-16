/**
 * Desktop main-process i18n bridge (DESK-1, born-496).
 *
 * Wraps the repo's getMessage/getLanguage (src/cli/helpers/messages.ts) so
 * every other main-process module (tray, menu, ...) stays string-free: they
 * call t(key) and never embed a literal user-facing string. Electron-import-
 * free by design — the caller supplies the OS locale (see
 * resolveDesktopLanguage) so this module stays unit-testable without an
 * Electron runtime.
 */
import { getLanguage, getMessage } from '../../../cli/helpers/messages.js';
// D4-2: the served-key list is SHARED with the renderer (its English fallback
// map derives from the same SSOT) — single list, no drift.
import { DESKTOP_MESSAGE_KEYS, type DesktopMessageKey } from '../shared/desktop-messages.js';

export type { DesktopMessageKey };

let currentLanguage: string | undefined;

/**
 * Resolve the desktop shell's UI language. Pass Electron's app.getLocale()
 * (read after the 'ready' event) as `osLocale` — it is the first signal;
 * the repo's existing LC_ALL/LANG env fallback (getLanguage's own priority
 * logic) applies when the OS locale is unset or unsupported. Call once at
 * startup — callers that never call this still get correct env-only
 * resolution via getDesktopLanguage()/t().
 */
export function resolveDesktopLanguage(osLocale?: string): string {
  currentLanguage = getLanguage(osLocale);
  return currentLanguage;
}

/** The currently resolved language (env-only fallback if resolveDesktopLanguage was never called). */
export function getDesktopLanguage(): string {
  return currentLanguage ?? getLanguage();
}

/** Translate a desktop.* key in the currently resolved language. */
export function t(key: DesktopMessageKey, vars?: Record<string, string>): string {
  return getMessage(key, getDesktopLanguage(), vars);
}

/**
 * Flat desktop.* string map for the renderer — served over IPC via
 * DeckentDesktopApi.app.getStrings() (src/desktop/src/shared/desktop-api.ts).
 */
export function getDesktopStrings(lang?: string): Record<string, string> {
  const effectiveLang = lang ?? getDesktopLanguage();
  const strings: Record<string, string> = {};
  for (const key of DESKTOP_MESSAGE_KEYS) {
    strings[key] = getMessage(key, effectiveLang);
  }
  return strings;
}
