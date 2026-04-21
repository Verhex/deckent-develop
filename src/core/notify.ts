// ═══ Notify Helper — Global Entry Point for Lifecycle Events ══════════════════
// Sprint 150 Hot Fix H6 — DECKENT→USER:NOTIFY runtime wire.
//
// Provides a single fail-safe entry point for sprint/task lifecycle code to
// emit user-facing notifications. Bridges:
//   1. In-process event bus (DECKENT→USER:NOTIFY channel)
//   2. Global NotifyDispatcher (CLI parent-TTY + MCP notifications/message + file log)
//
// Fail-safe guarantees:
//   - If globalNotifyDispatcher is not initialized → event-bus emit only, no throw
//   - If any adapter fails → caught and swallowed (dispatcher already handles this)
//   - All calls are try/catch wrapped at the outermost level
//
// Usage:
//   await notify('sprint-started', sprintId, 'Sprint başladı', '18 task planlandı');

import { eventBus } from '../orchestra/event-bus.js';
import {
  createNotification,
  toEventPayload,
  type NotificationEventName,
} from './notification-dispatcher.js';
import { getGlobalNotifyDispatcher } from './notify-registry.js';
import { debugLog } from './utils.js';

// ─── Public API ─────────────────────────────────────────────────

/**
 * Emit a user-facing notification.
 *
 * Fires two parallel channels:
 *   1. In-process event bus — DECKENT→USER:NOTIFY channel (subscribers, dashboards)
 *   2. Global NotifyDispatcher — CLI parent-TTY + MCP logging + file log
 *
 * Fail-safe: never throws. If the dispatcher is not initialized, only the
 * event-bus emit happens (pure-CLI sprint runs, tests, etc.).
 *
 * @param event - Notification event name (sprint-started, task-done, task-no-go,
 *   sprint-finalized, human-checkpoint-required)
 * @param sprintId - Sprint identifier for context
 * @param title - Short human-readable title
 * @param summary - One-line summary (1-2 sentences)
 * @param details - Optional longer details / stack trace / context
 */
export async function notify(
  event: NotificationEventName,
  sprintId: string,
  title: string,
  summary: string,
  details?: string,
): Promise<void> {
  // Build the notification object first (reused for both channels)
  let notification;
  try {
    notification = createNotification(event, sprintId, title, summary, details);
  } catch (err) {
    debugLog('notify:createNotification', err);
    return;
  }

  // 1. In-process event-bus emit — DECKENT→USER:NOTIFY channel
  try {
    eventBus.emit('deckent-event', {
      type: 'NOTIFY',
      source: 'brain',
      target: 'user',
      channel: 'DECKENT→USER:NOTIFY',
      payload: toEventPayload(notification),
      timestamp: notification.timestamp,
    });
  } catch (err) {
    debugLog('notify:eventBusEmit', err);
  }

  // 2. Global NotifyDispatcher — CLI + MCP + file adapters
  const dispatcher = getGlobalNotifyDispatcher();
  if (!dispatcher) return; // Fail-safe: no dispatcher in pure-CLI / test runtime

  try {
    await dispatcher.dispatch(notification);
  } catch (err) {
    // Dispatcher already fail-safes per-adapter; this only catches systemic errors
    debugLog('notify:dispatch', err);
  }
}

/**
 * Fire-and-forget variant — schedules notify() via microtask queue without awaiting.
 * Use this when the caller cannot afford even a microtask delay
 * (e.g. hot path in event loop). Otherwise prefer `await notify(...)` for ordering.
 */
export function notifyAsync(
  event: NotificationEventName,
  sprintId: string,
  title: string,
  summary: string,
  details?: string,
): void {
  void notify(event, sprintId, title, summary, details).catch((err) => {
    debugLog('notifyAsync', err);
  });
}
