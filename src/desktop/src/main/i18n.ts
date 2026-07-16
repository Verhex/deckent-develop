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

/** The desktop.* keys this module resolves — see messages.ts for the en/tr pairs. */
const DESKTOP_MESSAGE_KEYS = [
  'desktop.tray.open',
  'desktop.tray.quit',
  'desktop.tray.tooltip',
  'desktop.connection.add_title',
  'desktop.connection.kind.local',
  'desktop.connection.kind.wsl',
  'desktop.connection.kind.ssh',
  'desktop.connection.kind.container',
  'desktop.connection.kind_not_yet_supported',
  'desktop.connection.connect_button',
  'desktop.connection.delete_confirm',
  'desktop.connecting.spawning',
  'desktop.connecting.adopting',
  'desktop.connecting.health_check',
  'desktop.connecting.retry',
  'desktop.error.node_not_found',
  'desktop.error.deckent_not_found',
  'desktop.error.port_conflict',
  'desktop.error.daemon_crashed',
  'desktop.error.health_timeout',
  'desktop.error.view_logs',
  'desktop.window.minimize_to_tray_hint',
  'desktop.update.available',
  'desktop.update.downloading',
  'desktop.update.restart_to_apply',
  'desktop.update.check_for_updates',
  'desktop.menu.help',
  // D4-1 «Köprüüstü» — watch (vardiya) theme system.
  'desktop.theme.title',
  'desktop.theme.watch.day-watch',
  'desktop.theme.watch.night-watch',
  'desktop.theme.watch.open-sea',
] as const;

export type DesktopMessageKey = (typeof DESKTOP_MESSAGE_KEYS)[number];

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
