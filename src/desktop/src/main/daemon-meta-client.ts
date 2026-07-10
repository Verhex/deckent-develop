/**
 * DESK-1 (born-496) — thin client over the repo daemon handshake reader
 * (`src/api/serve-daemon-meta.ts`). Re-exported verbatim, never re-implemented,
 * so the desktop main process and `deckent serve` share exactly one parser for
 * `.deckent/serve-daemon.json` (see that module's header for the file's
 * security/lifecycle contract: mode 0600, atomic temp+rename, best-effort —
 * readers must treat it as a hint and re-verify via pid-ownership + /health).
 */
export { readServeDaemonMeta, clearServeDaemonMeta } from '../../../api/serve-daemon-meta.js';
export type { ServeDaemonMeta } from '../../../api/serve-daemon-meta.js';
