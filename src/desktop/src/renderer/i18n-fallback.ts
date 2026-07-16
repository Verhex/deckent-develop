/**
 * D4-2 (SURF-4) — renderer English fallback strings, DERIVED from the repo
 * i18n SSOT (src/cli/helpers/messages.ts) at bundle time.
 *
 * Why this exists: when `window.deckentDesktop` is absent (plain-browser
 * preview) or `app.getStrings()` fails, the screens must still render
 * readable English (the original DESK-1 "don't hide" spec). Before D4-2 that
 * was a hand-written literal map in app.ts, which had silently drifted from
 * the bridge (short keys vs the IPC map's full `desktop.*` keys — the IPC
 * strings NEVER matched and the literals always won). Now the fallback IS
 * getMessage(key, 'en') over the shared served-key list: zero renderer-local
 * user-facing literals (D4-2 done-criterion), zero drift by construction.
 *
 * messages.ts is dependency-free (a pure map + resolver), so bundling it
 * into the renderer is safe; electron-vite tree-shakes nothing here but the
 * catalog is plain data and this is a local desktop bundle.
 */
import { getMessage } from '../../../cli/helpers/messages.js';
import { DESKTOP_MESSAGE_KEYS } from '../shared/desktop-messages.js';

/** English fallback map keyed by the FULL `desktop.*` keys (bridge-identical). */
export function buildFallbackStrings(): Record<string, string> {
  const strings: Record<string, string> = {};
  for (const key of DESKTOP_MESSAGE_KEYS) {
    strings[key] = getMessage(key, 'en');
  }
  return strings;
}
