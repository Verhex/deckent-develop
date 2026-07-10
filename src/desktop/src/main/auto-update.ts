/**
 * Auto-update stub (DESK-1, born-496 — real update flow lands in Phase 4).
 *
 * Deliberately honest: the menu surface (see menu.ts's "Check for Updates"
 * item) exists, but the actual check/download/install flow is not wired
 * yet. Calling this logs that fact instead of silently doing nothing or
 * pretending to check. The log line is an internal diagnostic, not a
 * user-facing string — same precedent as messages.ts's own
 * `[getMessage] missing i18n key` dev warning — so it stays untranslated.
 */

export interface UpdateCheckResult {
  status: 'not-implemented';
}

export function checkForUpdatesStub(): UpdateCheckResult {
  console.log('[deckent-desktop] auto-update not yet wired — Phase 4 (checkForUpdatesStub is a no-op)');
  return { status: 'not-implemented' };
}
