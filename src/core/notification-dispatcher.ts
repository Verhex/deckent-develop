// ═══ Notification Dispatcher — ADR-035 DECKENT→USER:NOTIFY ══════════════════
// Sprint 139: Local user notification system (CLI terminal + MCP).
// Complementary to notifications.ts (external webhook/discord/slack).
// Throttled dispatch: max 1 notification per second (Alperen Q5).
// Fail-safe: adapter errors never crash the sprint.

import { debugLog } from './utils.js';

// ─── Types ───────────────────────────────────────────────────────

export type NotificationPriority = 'critical' | 'warning' | 'info';

export type NotificationEventName =
  | 'sprint-started'
  | 'task-done'
  | 'task-no-go'
  | 'sprint-finalized'
  | 'human-checkpoint-required';

export interface Notification {
  priority: NotificationPriority;
  event: NotificationEventName;
  title: string;
  summary: string;
  details?: string;
  sprintId: string;
  timestamp: string;
}

export interface NotificationAdapter {
  readonly name: string;
  isAvailable(): boolean;
  send(notification: Notification): Promise<void>;
}

// ─── Throttle State ──────────────────────────────────────────────

interface ThrottleState {
  lastSent: number;
  minInterval: number; // ms
}

// ─── NotificationDispatcher ──────────────────────────────────────

export class NotifyDispatcher {
  private adapters: NotificationAdapter[] = [];
  private queue: Notification[] = [];
  private throttle: ThrottleState;
  private processing = false;

  constructor(minIntervalMs = 1000) {
    this.throttle = {
      lastSent: 0,
      minInterval: minIntervalMs,
    };
  }

  /**
   * Register an adapter for notification delivery.
   */
  addAdapter(adapter: NotificationAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Remove all registered adapters.
   */
  clearAdapters(): void {
    this.adapters = [];
  }

  /**
   * Get count of registered adapters.
   */
  get adapterCount(): number {
    return this.adapters.length;
  }

  /**
   * Dispatch a notification. Critical notifications are sent immediately;
   * info/warning notifications respect the throttle interval.
   * Returns the number of adapters that successfully delivered.
   */
  async dispatch(notification: Notification): Promise<number> {
    if (notification.priority === 'critical') {
      return this.sendNow(notification);
    }

    // Throttle check for non-critical
    const now = Date.now();
    const elapsed = now - this.throttle.lastSent;

    if (elapsed >= this.throttle.minInterval) {
      return this.sendNow(notification);
    }

    // Queue for later delivery
    this.queue.push(notification);
    this.scheduleFlush(this.throttle.minInterval - elapsed);
    return 0;
  }

  /**
   * Send notification immediately to all available adapters.
   * Fail-safe: individual adapter errors are caught and logged.
   */
  async sendNow(notification: Notification): Promise<number> {
    this.throttle.lastSent = Date.now();
    let delivered = 0;

    for (const adapter of this.adapters) {
      try {
        if (!adapter.isAvailable()) {
          debugLog('notify-dispatcher', `Adapter "${adapter.name}" not available, skipping`);
          continue;
        }
        await adapter.send(notification);
        delivered++;
      } catch (err) {
        // Fail-safe: never crash the sprint due to notification failure
        debugLog('notify-dispatcher', `Adapter "${adapter.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return delivered;
  }

  /**
   * Flush queued notifications (oldest first, one per flush).
   */
  async flush(): Promise<number> {
    const next = this.queue.shift();
    if (!next) return 0;
    return this.sendNow(next);
  }

  /**
   * Get current queue length.
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Schedule a flush after delay. Non-blocking.
   */
  private scheduleFlush(delayMs: number): void {
    if (this.processing) return;
    this.processing = true;
    setTimeout(async () => {
      this.processing = false;
      await this.flush();
    }, delayMs);
  }
}

// ─── Helper: Create Notification ─────────────────────────────────

const EVENT_PRIORITY: Record<NotificationEventName, NotificationPriority> = {
  'sprint-started': 'info',
  'task-done': 'info',
  'task-no-go': 'warning',
  'sprint-finalized': 'info',
  'human-checkpoint-required': 'critical',
};

export function createNotification(
  event: NotificationEventName,
  sprintId: string,
  title: string,
  summary: string,
  details?: string,
): Notification {
  return {
    priority: EVENT_PRIORITY[event],
    event,
    title,
    summary,
    details,
    sprintId,
    timestamp: new Date().toISOString(),
  };
}

// ─── Helper: Event Stream Integration ────────────────────────────

/**
 * Build event stream payload for DECKENT→USER:NOTIFY channel.
 */
export function toEventPayload(notification: Notification): Record<string, unknown> {
  return {
    priority: notification.priority,
    event: notification.event,
    title: notification.title,
    summary: notification.summary,
    details: notification.details,
    sprintId: notification.sprintId,
  };
}
