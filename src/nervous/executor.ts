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
import {
  DEFAULT_APPROVE_TIMEOUT_ATTENDED_MS,
  DEFAULT_APPROVE_TIMEOUT_UNATTENDED_MS,
} from '../core/config.js';
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
 * Optional auto-apply predicate — detectors may implement this to gate
 * timeout-auto-proceed. Executor calls it before auto-applying a conditional-
 * approve action and logs the result for auditability.
 *
 * ok=true  → proceed with auto-apply (timeout-auto-applied decision)
 * ok=false → veto auto-apply; action stays pending for explicit human approval
 */
export type CanAutoApplyFn = (payload: Record<string, unknown>) => {ok: boolean; reason: string};

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

/** Attended session timeout. Config key: nervous_system.approve_timeout_attended_ms. */
export const APPROVE_TIMEOUT_ATTENDED_MS = DEFAULT_APPROVE_TIMEOUT_ATTENDED_MS;
/** Unattended session timeout. Config key: nervous_system.approve_timeout_unattended_ms. */
export const APPROVE_TIMEOUT_UNATTENDED_MS = DEFAULT_APPROVE_TIMEOUT_UNATTENDED_MS;

/**
 * Returns true when the current process is running in an interactive (attended)
 * session: a TTY stdout, an SSH connection, or a terminal emulator environment.
 * Used to select the appropriate approval-window length at module-init time.
 * Safety-floor actions ignore this value — they always require explicit approval.
 */
export function detectAttendedSession(): boolean {
  // isTTY is true when stdout is connected to a real terminal
  if (process.stdout.isTTY) return true;
  // SSH_CONNECTION is set for remote interactive sessions
  if (process.env['SSH_CONNECTION']) return true;
  // TERM is set by most terminal emulators (exclude 'dumb' which is CI/non-interactive)
  const term = process.env['TERM'];
  if (term && term !== 'dumb') return true;
  return false;
}

/** Default hard timeout for approve-policy actions (non-SAFETY_FLOOR).
 *  Presence-aware: attended sessions get 30s, unattended get 5s.
 *  Override via config.nervous_system.approve_timeout_ms. */
export const APPROVE_TIMEOUT_MS = detectAttendedSession()
  ? APPROVE_TIMEOUT_ATTENDED_MS
  : APPROVE_TIMEOUT_UNATTENDED_MS;

/**
 * Arm the auto-proceed timer only for a non-safety-floor action with a POSITIVE
 * timeout. A timeout <= 0 means "never auto-proceed" (the cautious-user trust
 * setting): the action then stays pending until an explicit human accept/reject.
 * Safety-floor (locked) actions never auto-proceed regardless. Pure → testable.
 */
export function shouldArmAutoProceed(locked: boolean, approveTimeoutMs: number): boolean {
  return !locked && approveTimeoutMs > 0;
}

// ─── Executor Class ──────────────────────────────────────────────────────────

export class Executor {
  private readonly pendingTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly pendingApprovals: Map<string, {
    notification: NervousNotification;
    actionId: string;
    resolve: (
      decision: 'accepted' | 'rejected',
      modifiedPayload?: Record<string, unknown>,
    ) => void;
  }> = new Map();

  constructor(
    private readonly history: NervousHistory,
    private readonly actionHandler: ActionHandler,
    private readonly pendingStore?: PendingApprovalStore,
    private readonly projectRoot: string = process.cwd(),
    /** Hard timeout (ms) before a non-safety-floor approve action auto-proceeds.
     *  <= 0 disables auto-proceed entirely (action stays pending). */
    private readonly approveTimeoutMs: number = APPROVE_TIMEOUT_MS,
    /** Optional map of action-id → canAutoApply predicate. When present for an
     *  action, the predicate is called before timeout-auto-proceed and its result
     *  is logged (auditable). ok=false vetoes auto-apply; action stays pending. */
    private readonly canAutoApplyMap?: ReadonlyMap<string, CanAutoApplyFn>,
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
   *
   * APPROVE-007b (Sprint 280): `opts.modifiedPayload` lets a human edit the action
   * payload before accepting. When present on an `accepted` decision, the handler
   * runs with the shallow-merged payload (`{ ...original, ...modifiedPayload }`).
   * Absent → byte-identical to the pre-edit behavior. Ignored on `rejected`
   * (the handler is never invoked on reject). SAFETY_FLOOR (locked) actions keep
   * their explicit-approval gating — editing only changes the accepted payload.
   */
  /**
   * Resolve a pending approval by full id or shortCode.
   * @returns true if a matching pending approval was found and resolved; false
   *   if nothing matched (the caller can then skip the Brain-ack, FIX-1).
   */
  resolveApproval(
    notificationId: string,
    decision: 'accepted' | 'rejected',
    opts?: { modifiedPayload?: Record<string, unknown> },
  ): boolean {
    // FIX-2 (B-COLLISION-HANG cross-source approval): accept EITHER the full
    // notification id OR the 5-char shortCode that surfaces (Telegram/CLI/MCP)
    // display. The map is keyed by full id; if the direct lookup misses, resolve
    // a shortCode by scanning entries for a matching notification.shortCode. The
    // bot resolver pre-maps shortCode→id from the pending file, but CLI/MCP may
    // forward the shortCode verbatim — without this fallback such an accept
    // silently no-ops ("approve <shortCode>" lands but never resolves).
    let resolvedKey = notificationId;
    let pending = this.pendingApprovals.get(resolvedKey);
    if (!pending) {
      for (const [id, p] of this.pendingApprovals) {
        if (p.notification.shortCode === notificationId) {
          resolvedKey = id;
          pending = p;
          break;
        }
      }
    }
    if (pending) {
      pending.resolve(decision, opts?.modifiedPayload);
      this.pendingApprovals.delete(resolvedKey);
      this.pendingStore?.remove(resolvedKey);
      return true;
    }
    return false;
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
        resolve: async (
          decision: 'accepted' | 'rejected',
          modifiedPayload?: Record<string, unknown>,
        ) => {
          clearTimeout(timer);
          this.pendingTimers.delete(notification.id);

          if (decision === 'accepted') {
            try {
              const effectivePayload = modifiedPayload
                ? { ...(action.payload ?? {}), ...modifiedPayload }
                : action.payload ?? {};
              const result = await this.actionHandler(action.id, effectivePayload);
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
        modifiedPayload?: Record<string, unknown>,
      ): Promise<void> => {
        if (settled) return;
        settled = true;
        this.pendingApprovals.delete(notification.id);
        this.pendingStore?.remove(notification.id);

        if (decision === 'accepted' || decision === 'timeout-auto-applied') {
          try {
            const effectivePayload = modifiedPayload
              ? { ...(action.payload ?? {}), ...modifiedPayload }
              : action.payload ?? {};
            const result = await this.actionHandler(action.id, effectivePayload);
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
        resolve: (
          decision: 'accepted' | 'rejected',
          modifiedPayload?: Record<string, unknown>,
        ) => {
          void finish(decision, 'user', modifiedPayload);
        },
      });
      this.pendingStore?.add(notification);

      // Hard-timeout path for non-SAFETY_FLOOR actions via awaitPanicGateApproval.
      // SAFETY_FLOOR actions are exempt (explicit human approval, no auto-proceed),
      // and a configured approveTimeoutMs <= 0 disables auto-proceed for everyone
      // (the cautious-user setting — the action stays pending until decided).
      if (shouldArmAutoProceed(locked, this.approveTimeoutMs)) {
        void awaitPanicGateApproval({
          actionId: action.id,
          taskId: notification.id,
          projectRoot: this.projectRoot,
          timeoutMs: this.approveTimeoutMs,
        }).then((gateDecision) => {
          if (gateDecision === 'TIMEOUT_AUTO_PROCEED') {
            const predicate = this.canAutoApplyMap?.get(action.id);
            if (predicate) {
              const result = predicate(action.payload ?? {});
              console.log(`[nervous][canAutoApply] action=${action.id} ok=${result.ok} reason="${result.reason}"`);
              if (!result.ok) {
                // Predicate vetoed auto-apply — action stays pending for human approval
                return;
              }
            }
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
