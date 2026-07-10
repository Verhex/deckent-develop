/**
 * DESK-B2 (born-496 §392-003) — shared main-process constants.
 *
 * Electron-free by design (plain values only), same style as
 * daemon-lifecycle.ts, so this stays trivially importable from any future
 * unit test without pulling in an Electron runtime.
 */

/** Suggested default port for a new local connection profile. */
export const DEFAULT_PORT = 3100;

/**
 * Adopt-vs-spawn one-shot health-check timeout and pollHealth's exponential-
 * backoff floor/ceiling. Mirrors the values daemon-lifecycle.ts (392-001,
 * already shipped/out of this task's write scope) hardcodes locally as
 * DEFAULT_HEALTH_CHECK_TIMEOUT_MS/INITIAL_BACKOFF_MS/MAX_BACKOFF_MS — that
 * file predates this one and cannot be edited here; a follow-up should point
 * it at these instead of its private copies.
 */
export const HEALTH_CHECK_TIMEOUT_MS = 2000;
export const HEALTH_POLL_INITIAL_BACKOFF_MS = 50;
export const HEALTH_POLL_MAX_BACKOFF_MS = 1000;

/**
 * connection-profiles.json schema version. Not yet consumed —
 * connection-profile-store.ts (392-002, shipped) persists a plain
 * ConnectionProfile[] with no version wrapper. Reserved for the store's
 * first breaking on-disk shape change (add a `{ version, profiles }`
 * envelope + a migration path keyed off this constant).
 */
export const CONNECTION_PROFILE_SCHEMA_VERSION = 1;

/**
 * window-manager.ts's Map<profileId, BrowserWindow> key for the single
 * window index.ts creates at app launch, before the user has connected to
 * any saved profile. Not a real ConnectionProfile.id — a stable sentinel so
 * the initial window participates in the same Map (second-instance focus,
 * before-quit sweep) as any later profile-connected window.
 */
export const INITIAL_WINDOW_ID = '__initial__';
