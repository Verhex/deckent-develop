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
  | 'human-checkpoint-required'
  | 'progress'
  | 'phase-change';

/** An actionable command an operator can run to resolve/act on a notification
 *  (e.g. approving a parked nervous/autonomous decision). Carried on the
 *  notification + event payload so EVERY surface (terminal print, status/watch
 *  tail, dashboard) shows the operator exactly what to run. */
export interface NotificationAction {
  /** Short, already-localized label (e.g. "Approve", "Reject"). */
  label: string;
  /** The exact CLI command to run (e.g. "deckent nervous accept <id>"). */
  cliCommand: string;
  /**
   * Optional machine-actionable payload for rich surfaces (rich-approval bot).
   * When set, button-capable connectors (Telegram) render this action as an
   * inline button whose press carries this string back (e.g. `approve:<id>`);
   * text-only surfaces keep showing {@link cliCommand}. See connectors/callback-router.
   */
  callbackData?: string;
}

export interface Notification {
  priority: NotificationPriority;
  event: NotificationEventName;
  title: string;
  summary: string;
  details?: string;
  sprintId: string;
  timestamp: string;
  /** PID of the process that OWNS the in-memory gate this notification refers to
   *  (the running sprint/executor whose terminal the operator must act in and
   *  whose IPC poller consumes the accept). Defaults to the emitting process.pid. */
  owningPid?: number;
  /** Actionable commands (approve/reject) — self-describing so any surface can act. */
  actions?: NotificationAction[];
}

/** Optional self-describing context for {@link createNotification}. */
export interface CreateNotificationOpts {
  /** Override the owning PID (defaults to process.pid). */
  owningPid?: number;
  /** Actionable commands surfaced on every channel. */
  actions?: NotificationAction[];
}

export interface NotificationAdapter {
  readonly name: string;
  isAvailable(): boolean;
  send(notification: Notification): Promise<void>;
  /** Release resources owned by this adapter. Implementations must be idempotent. */
  close?(): Promise<void>;
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
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private state: 'open' | 'closing' | 'closed' = 'open';
  private inFlight = new Set<Promise<number>>();
  private closePromise: Promise<void> | null = null;

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
    if (this.state !== 'open') return;
    this.adapters.push(adapter);
  }

  /**
   * Remove all registered adapters.
   */
  clearAdapters(): void {
    if (this.state !== 'open') return;
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
    if (this.state !== 'open') return 0;
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
    if (this.state !== 'open') return 0;
    return this.startDelivery(notification);
  }

  /** Admit one delivery and retain it so close() can await terminal teardown. */
  private startDelivery(notification: Notification): Promise<number> {
    const delivery = this.deliver(notification);
    this.inFlight.add(delivery);
    void delivery.finally(() => this.inFlight.delete(delivery));
    return delivery;
  }

  private async deliver(notification: Notification): Promise<number> {
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
    if (this.state !== 'open') return 0;
    const next = this.queue.shift();
    if (!next) return 0;
    return this.startDelivery(next);
  }

  /**
   * Get current queue length.
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Permanently close the dispatcher and every adapter it owns.
   *
   * Closing is async and idempotent. It rejects new work, cancels the throttle
   * timer, waits for admitted delivery, drains the queued notifications FIFO,
   * and only then closes each adapter exactly once.
   */
  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.state = 'closing';
    this.processing = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.closePromise = (async () => {
      await Promise.allSettled([...this.inFlight]);

      while (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) await this.startDelivery(next);
      }

      const adapters = this.adapters;
      const results = await Promise.allSettled(
        adapters.map((adapter) => adapter.close?.()),
      );
      this.adapters = [];
      this.state = 'closed';
      const errors = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason as unknown);
      if (errors.length > 0) throw new AggregateError(errors, 'Notification adapter close failed');
    })();
    return this.closePromise;
  }

  /**
   * Schedule a flush after delay. Non-blocking.
   */
  private scheduleFlush(delayMs: number): void {
    if (this.state !== 'open' || this.processing) return;
    this.processing = true;
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      this.processing = false;
      await this.flush();
      if (this.queue.length > 0) this.scheduleFlush(this.throttle.minInterval);
    }, delayMs);
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
  }
}

// ─── Helper: Create Notification ─────────────────────────────────

const EVENT_PRIORITY: Record<NotificationEventName, NotificationPriority> = {
  'sprint-started': 'info',
  'task-done': 'info',
  'task-no-go': 'warning',
  'sprint-finalized': 'info',
  'human-checkpoint-required': 'critical',
  'progress': 'info',
  'phase-change': 'info',
};

export function createNotification(
  event: NotificationEventName,
  sprintId: string,
  title: string,
  summary: string,
  details?: string,
  opts?: CreateNotificationOpts,
): Notification {
  return {
    priority: EVENT_PRIORITY[event],
    event,
    title,
    summary,
    details,
    sprintId,
    timestamp: new Date().toISOString(),
    owningPid: opts?.owningPid ?? process.pid,
    ...(opts?.actions && opts.actions.length > 0 ? { actions: opts.actions } : {}),
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
    owningPid: notification.owningPid,
    ...(notification.actions ? { actions: notification.actions } : {}),
  };
}
