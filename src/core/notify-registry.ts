// ═══ Notify Registry — Global Singleton for NotifyDispatcher ════════════════
// Sprint 150 Hot Fix H6 — DECKENT→USER:NOTIFY runtime wire.
// Breaks circular import: mcp/server.ts ↔ core/notify.ts.
// Both modules import from here, neither imports from each other for dispatcher.
//
// MCP server calls setGlobalNotifyDispatcher() at startup.
// Lifecycle hooks (sprint-controller, sprint-finalizer, etc.) call getGlobalNotifyDispatcher()
// via the notify() helper which fail-safes to no-op if dispatcher is null.
//
// Fail-safe: dispatcher may be null (non-MCP runtime e.g. CLI sprint). notify() must never throw.

import type { NotifyDispatcher } from './notification-dispatcher.js';

// ─── Singleton State ────────────────────────────────────────────

let _globalDispatcher: NotifyDispatcher | null = null;

// ─── Public API ─────────────────────────────────────────────────

/**
 * Register the global NotifyDispatcher instance.
 * Called by the MCP server at startup after createServer().
 * Idempotent: later calls replace the previous dispatcher.
 */
export function setGlobalNotifyDispatcher(dispatcher: NotifyDispatcher | null): void {
  _globalDispatcher = dispatcher;
}

/**
 * Get the global NotifyDispatcher instance.
 * Returns null when not initialized (e.g. pure CLI runs without MCP server).
 */
export function getGlobalNotifyDispatcher(): NotifyDispatcher | null {
  return _globalDispatcher;
}

/**
 * Clear the global dispatcher (test helper, also used on MCP shutdown).
 */
export function clearGlobalNotifyDispatcher(): void {
  _globalDispatcher = null;
}
