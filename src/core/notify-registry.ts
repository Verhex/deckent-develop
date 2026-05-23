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
//
// Sprint 189 Task 1 — ADR-008 dependency inversion:
//   notify.ts must not import orchestra/event-bus.js directly. Instead, event-bus.ts
//   registers an emit function here at init time via setNotificationDispatcher(),
//   and notify.ts reads it via getNotificationDispatcher(). Direction stays
//   orchestra → core; core/ has zero orchestra/ imports.

import type { NotifyDispatcher } from './notification-dispatcher.js';

// ─── Types ──────────────────────────────────────────────────────

/**
 * Wire-format event payload emitted on the DECKENT→USER:NOTIFY channel.
 * Defined in core/ (not orchestra/) so notify.ts and event-bus.ts share the
 * shape without core depending on orchestra. Mirrors `DeckentEvent` fields
 * actually used by notify(); orchestra/event-bus.ts may extend in its own type.
 */
export interface NotifyBusEvent {
  type: 'NOTIFY';
  source: string;
  target: string;
  channel: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

/**
 * Function-shaped dispatcher that forwards a NotifyBusEvent to the in-process
 * event bus. Implementation is provided by orchestra/event-bus.ts at module init.
 */
export type NotificationEventDispatcher = (event: NotifyBusEvent) => void;

// ─── Singleton State ────────────────────────────────────────────

let _globalDispatcher: NotifyDispatcher | null = null;
let _notificationDispatcher: NotificationEventDispatcher | null = null;

// ─── Public API — NotifyDispatcher (class instance, MCP/CLI adapters) ────────

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

// ─── Public API — NotificationEventDispatcher (event-bus emit function) ──────

/**
 * Register the function-based event dispatcher.
 * orchestra/event-bus.ts calls this at module init with a closure that emits
 * the event on the singleton EventBus. Null clears the registration.
 *
 * Direction is orchestra → core (allowed by ADR-008). core/notify.ts only reads
 * the registered function via getNotificationDispatcher().
 */
export function setNotificationDispatcher(
  fn: NotificationEventDispatcher | null,
): void {
  _notificationDispatcher = fn;
}

/**
 * Get the registered event dispatcher, or null when no orchestra layer
 * has wired the bridge (pure-core unit tests, partial bootstraps).
 */
export function getNotificationDispatcher(): NotificationEventDispatcher | null {
  return _notificationDispatcher;
}

/**
 * Clear the event dispatcher (test helper).
 */
export function clearNotificationDispatcher(): void {
  _notificationDispatcher = null;
}
