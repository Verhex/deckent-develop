// src/nervous/executor.ts
//
// Nervous System Executor — 3 mod handler (autonomous / suggest-timeout / approve).
// Notification onaylandıktan sonra eylemi fiilen yürütür.
// Sprint 147 Task 7.

import type {
  NervousNotification,
  NotificationAction,
  ExecutionRecord,
} from '../core/nervous-types.js';
import { ACTION_BY_ID } from './action-registry.js';
import { awaitPanicGateApproval, isLockedPanicAction } from './panic-gate.js';
import { randomUUID } from 'node:crypto';

// ─── NervousHistory Interface ────────────────────────────────────────────────
// Defined here until history.ts (Task 8) is implemented.

export interface NervousHistory {
  append(record: ExecutionRecord): Promise<void>;
}

// ─── ActionHandler Type ──────────────────────────────────────────────────────

/**
 * External action handler — injected via constructor.
 * Called when an action is approved/autonomous for actual execution.
 */
export interface ActionHandler {
  (actionId: string, payload: Record<string, unknown>): Promise<{
    outcome: 'success' | 'failure';
    error?: string;
  }>;
}

/**
 * Sink for parked approvals (APPROVE-004, §4G). The Executor calls add() when a
 * notification parks awaiting a human decision and remove() when it resolves, so
 * the parked queue is visible to `deckent nervous` / REPL `/nervous` (which read
 * .deckent/nervous-pending.json). Injected by bootstrap; string-free here.
 */
export interface PendingApprovalStore {
  add(notification: NervousNotification): void;
  remove(notificationId: string): void;
}

// ─── Timeout Constants ───────────────────────────────────────────────────────

const TIMEOUT_MAP: Readonly<Record<string, number>> = {
  'suggest-5m': 5 * 60 * 1000,   // 300000 ms
  'suggest-30m': 30 * 60 * 1000, // 1800000 ms
};

/** Hard timeout for approve-policy actions (non-SAFETY_FLOOR). Matches panic-gate default. */
const APPROVE_TIMEOUT_MS = 10_000;

// ─── Executor Class ──────────────────────────────────────────────────────────

export class Executor {
  private readonly pendingTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly pendingApprovals: Map<string, {
    notification: NervousNotification;
    actionId: string;
    resolve: (decision: 'accepted' | 'rejected') => void;
  }> = new Map();

  constructor(
    private readonly history: NervousHistory,
    private readonly actionHandler: ActionHandler,
    private readonly pendingStore?: PendingApprovalStore,
    private readonly projectRoot: string = process.cwd(),
  ) {}

  /**
   * Handle all actions in a notification sequentially.
   * Each action is processed, recorded, and appended to history.
   */
  async handle(notification: NervousNotification): Promise<ExecutionRecord[]> {
    const records: ExecutionRecord[] = [];
    for (const action of notification.actions) {
      const record = await this.handleAction(notification, action);
      records.push(record);
      await this.history.append(record);
    }
    return records;
  }

  /**
   * User-driven resolution: `deckent nervous accept <id>` / `reject <id>` calls this.
   * Works for both suggest-timeout and approve policies.
   */
  resolveApproval(notificationId: string, decision: 'accepted' | 'rejected'): void {
    const pending = this.pendingApprovals.get(notificationId);
    if (pending) {
      pending.resolve(decision);
      this.pendingApprovals.delete(notificationId);
      this.pendingStore?.remove(notificationId);
    }
  }

  /**
   * Graceful shutdown — clear all timers, reject all pending approvals.
   */
  shutdown(): void {
    for (const t of this.pendingTimers.values()) {
      clearTimeout(t);
    }
    this.pendingTimers.clear();

    for (const p of this.pendingApprovals.values()) {
      p.resolve('rejected');
    }
    this.pendingApprovals.clear();
  }

  /**
   * Get pending approval count (for status display).
   */
  get pendingCount(): number {
    return this.pendingApprovals.size;
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  private async handleAction(
    notification: NervousNotification,
    action: NotificationAction,
  ): Promise<ExecutionRecord> {
    const reversible = this.lookupReversible(action.id);
    const baseFields = {
      id: randomUUID(),
      notificationId: notification.id,
      actionId: action.id,
      executedAt: new Date().toISOString(),
      reversible,
      payload: action.payload ?? {},
    };

    switch (action.policy) {
      case 'autonomous':
        return this.handleAutonomous(baseFields, action);

      case 'suggest-5m':
      case 'suggest-30m':
        return this.handleSuggestTimeout(notification, action, baseFields);

      case 'approve':
        return this.handleApprove(notification, action, baseFields);

      default:
        throw new Error(`Unknown policy: ${action.policy as string}`);
    }
  }

  private async handleAutonomous(
    baseFields: ExecutionRecordBase,
    action: NotificationAction,
  ): Promise<ExecutionRecord> {
    try {
      const result = await this.actionHandler(action.id, action.payload ?? {});
      return {
        ...baseFields,
        decision: 'autonomous',
        decidedBy: 'system',
        outcome: result.outcome,
        error: result.error,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        ...baseFields,
        decision: 'autonomous',
        decidedBy: 'system',
        outcome: 'failure',
        error: errorMsg,
      };
    }
  }

  private handleSuggestTimeout(
    notification: NervousNotification,
    action: NotificationAction,
    baseFields: ExecutionRecordBase,
  ): Promise<ExecutionRecord> {
    const timeoutMs = TIMEOUT_MAP[action.policy] ?? 300000;

    return new Promise<ExecutionRecord>((resolve) => {
      // Set up timeout — auto-apply on expiry
      const timer = setTimeout(async () => {
        this.pendingTimers.delete(notification.id);
        this.pendingApprovals.delete(notification.id);
        this.pendingStore?.remove(notification.id);

        try {
          const result = await this.actionHandler(action.id, action.payload ?? {});
          resolve({
            ...baseFields,
            decision: 'timeout-auto-applied',
            decidedBy: 'timeout',
            outcome: result.outcome,
            error: result.error,
            durationMs: timeoutMs,
          });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          resolve({
            ...baseFields,
            decision: 'timeout-auto-applied',
            decidedBy: 'timeout',
            outcome: 'failure',
            error: errorMsg,
            durationMs: timeoutMs,
          });
        }
      }, timeoutMs);

      this.pendingTimers.set(notification.id, timer);

      // Register for user decision
      this.pendingApprovals.set(notification.id, {
        notification,
        actionId: action.id,
        resolve: async (decision: 'accepted' | 'rejected') => {
          clearTimeout(timer);
          this.pendingTimers.delete(notification.id);

          if (decision === 'accepted') {
            try {
              const result = await this.actionHandler(action.id, action.payload ?? {});
              resolve({
                ...baseFields,
                decision: 'accepted',
                decidedBy: 'user',
                outcome: result.outcome,
                error: result.error,
              });
            } catch (err: unknown) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              resolve({
                ...baseFields,
                decision: 'accepted',
                decidedBy: 'user',
                outcome: 'failure',
                error: errorMsg,
              });
            }
          } else {
            resolve({
              ...baseFields,
              decision: 'rejected',
              decidedBy: 'user',
              outcome: 'pending',
            });
          }
        },
      });
      this.pendingStore?.add(notification);
    });
  }

  private handleApprove(
    notification: NervousNotification,
    action: NotificationAction,
    baseFields: ExecutionRecordBase,
  ): Promise<ExecutionRecord> {
    const locked = isLockedPanicAction(action.id);

    return new Promise<ExecutionRecord>((outerResolve) => {
      let settled = false;

      const finish = async (
        decision: 'accepted' | 'rejected' | 'timeout-auto-applied',
        decidedBy: 'user' | 'timeout',
      ): Promise<void> => {
        if (settled) return;
        settled = true;
        this.pendingApprovals.delete(notification.id);
        this.pendingStore?.remove(notification.id);

        if (decision === 'accepted' || decision === 'timeout-auto-applied') {
          try {
            const result = await this.actionHandler(action.id, action.payload ?? {});
            outerResolve({
              ...baseFields,
              decision,
              decidedBy,
              outcome: result.outcome,
              error: result.error,
            });
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            outerResolve({
              ...baseFields,
              decision,
              decidedBy,
              outcome: 'failure',
              error: errorMsg,
            });
          }
        } else {
          outerResolve({
            ...baseFields,
            decision: 'rejected',
            decidedBy: 'user',
            outcome: 'pending',
          });
        }
      };

      // In-memory approval path — `resolveApproval` calls this.
      this.pendingApprovals.set(notification.id, {
        notification,
        actionId: action.id,
        resolve: (decision: 'accepted' | 'rejected') => {
          void finish(decision, 'user');
        },
      });
      this.pendingStore?.add(notification);

      // Hard-timeout path for non-SAFETY_FLOOR actions via awaitPanicGateApproval.
      // SAFETY_FLOOR actions are exempt — they require explicit human approval and
      // keep the in-memory-only path (no auto-proceed on timeout).
      if (!locked) {
        void awaitPanicGateApproval({
          actionId: action.id,
          taskId: notification.id,
          projectRoot: this.projectRoot,
          timeoutMs: APPROVE_TIMEOUT_MS,
        }).then((gateDecision) => {
          if (gateDecision === 'TIMEOUT_AUTO_PROCEED') {
            void finish('timeout-auto-applied', 'timeout');
          }
          // APPROVED/REJECTED from file marker: handled by resolveApproval in-memory path.
        });
      }
    });
  }

  private lookupReversible(actionId: string): boolean {
    const action = ACTION_BY_ID.get(actionId);
    return action?.reversible ?? false;
  }
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface ExecutionRecordBase {
  readonly id: string;
  readonly notificationId: string;
  readonly actionId: string;
  readonly executedAt: string;
  readonly reversible: boolean;
  readonly payload: Record<string, unknown>;
}
