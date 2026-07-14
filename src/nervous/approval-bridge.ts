// ─── NervousApprovalBridge — nervous accept/reject ↔ ApprovalBroker (NERVOUS-APR) ─
// Governs: ADR-G-022 (nervous — "APR unification" roadmap: nervous becomes one
// approval-source on the runtime-wide ApprovalBroker) + ADR-G-020 (authority). Built
// directly on ApprovalBroker's (APR-1) PUBLIC `decide()` surface only — this module
// owns ZERO broker internals, mirroring the `ApprovalTelegramChannel` /
// `ApprovalTerminalChannel` / `WorkerApprovalGate` precedent (approval-telegram.ts,
// approval-terminal-channel.ts, approval-worker-gate.ts).
//
// Pure bridge — deliberately does NOT subscribe to a live broker's 'pending' event and
// does NOT touch src/nervous/executor.ts, src/mcp/tools/nervous.ts, or
// src/nervous/bootstrap.ts. Wiring this into the real Executor/IPC-queue/MCP-tool flow
// is explicit follow-up work (task description: "gerçek-wiring follow-up").
//
// Two directions:
//  • nervous -> broker: `applyNervousDecision()` maps a resolved nervous accept/reject
//    (the existing `deckent_nervous_accept`/`deckent_nervous_reject` tool/handler
//    outcome, or `Executor.resolveApproval`'s decision) onto `ApprovalDecisionInput`
//    and forwards it to the injected broker's `decide()`. The known gotcha
//    (project_nervous_accept_pending_not_cleared — accept used to leave
//    `nervous-pending.json` stale while reject correctly cleared it) is owned here for
//    THIS bridge's own decide-forwarding path: pending-store cleanup runs
//    unconditionally, including when `decide()` throws `APR_ALREADY_DECIDED` — a
//    duplicate accept/reject is swallowed (idempotent), never thrown, and still clears
//    the pending store.
//  • broker -> nervous: `toNervousNotification()` is a pure projection of a
//    broker-pending `ApprovalRequest` — guarded to ONLY nervous-sourced requests
//    (`requester.role === 'nervous'`) — back into a `NervousNotification`-shaped
//    payload, so nervous's own pending/history/CLI-render surfaces can consume a
//    broker-mirrored nervous request using their existing shape.

import {
  ApprovalBrokerError,
  type ApprovalDecisionInput,
} from '../core/approval-broker.js';
import type {
  ApprovalAction,
  ApprovalDecision,
  ApprovalPolicy as ApprovalRequestPolicy,
  ApprovalRequest,
  ApprovalRisk,
} from '../core/approval-contract.js';
import type {
  ApprovalPolicy as NervousApprovalPolicy,
  NervousNotification,
  NotificationAction,
  RiskLevel,
  Severity,
} from '../core/nervous-types.js';

// ─── Direction 1: nervous decision -> broker.decide() ────────────────────────────

/** Narrow decide-only broker surface this bridge depends on — satisfied structurally
 *  by a real `ApprovalBroker` or a test fake (same pattern as
 *  `WorkerApprovalGate`'s `ApprovalBrokerLike`). */
export interface NervousApprovalBrokerLike {
  decide(id: string, input: ApprovalDecisionInput): ApprovalDecision;
}

/** Pending-store cleanup seam — the same shape as Executor's
 *  `PendingApprovalStore.remove`, so a real Executor pendingStore satisfies this with
 *  zero adapter glue. */
export interface NervousPendingCleanup {
  remove(notificationId: string): void;
}

/** The nervous-side resolution vocabulary — `deckent nervous accept|reject` /
 *  `Executor.resolveApproval`'s own decision values. */
export type NervousResolution = 'accepted' | 'rejected';

/** nervous resolution -> broker decision vocabulary (allow/deny). */
const DECISION_BY_RESOLUTION: Readonly<Record<NervousResolution, ApprovalAction>> = {
  accepted: 'allow',
  rejected: 'deny',
};

export interface NervousBridgeDecisionInput {
  /** The nervous notification id (or the broker request id it was mirrored under). */
  readonly notificationId: string;
  readonly resolution: NervousResolution;
  /** Who resolved it (e.g. a Telegram user handle, "user-cli", "user-mcp"). */
  readonly decidedBy: string;
  readonly reason?: string;
  /** Recorded on the resulting `ApprovalDecision`. Default `'nervous'`. */
  readonly channel?: string;
  /** Clock seam for deterministic tests. Defaults to `new Date().toISOString()`. */
  readonly decidedAt?: string;
}

export type NervousBridgeApplyResult =
  | { readonly applied: true; readonly decision: ApprovalDecision }
  | { readonly applied: false; readonly reason: 'already-decided' };

const DEFAULT_CHANNEL = 'nervous';

/**
 * Bridges nervous's own accept/reject resolution onto the runtime-wide
 * `ApprovalBroker` (NERVOUS-APR).
 */
export class NervousApprovalBridge {
  constructor(
    private readonly broker: NervousApprovalBrokerLike,
    private readonly pendingCleanup?: NervousPendingCleanup,
    private readonly defaultChannel: string = DEFAULT_CHANNEL,
  ) {}

  /**
   * Forward a resolved nervous accept/reject to the broker. Idempotent: a second call
   * for an already-decided id is swallowed (`applied: false`, never thrown) — the
   * pending-store cleanup ALWAYS runs regardless, so a duplicate accept/reject can
   * never leave the pending store stale (parity fix for
   * project_nervous_accept_pending_not_cleared, scoped to this bridge's own path).
   */
  applyNervousDecision(input: NervousBridgeDecisionInput): NervousBridgeApplyResult {
    const decisionInput: ApprovalDecisionInput = {
      decision: DECISION_BY_RESOLUTION[input.resolution],
      decidedBy: input.decidedBy,
      channel: input.channel ?? this.defaultChannel,
      decidedAt: input.decidedAt ?? new Date().toISOString(),
      reason: input.reason ?? '',
    };

    try {
      const decision = this.broker.decide(input.notificationId, decisionInput);
      this.pendingCleanup?.remove(input.notificationId);
      return { applied: true, decision };
    } catch (err: unknown) {
      if (err instanceof ApprovalBrokerError && err.code === 'APR_ALREADY_DECIDED') {
        this.pendingCleanup?.remove(input.notificationId);
        return { applied: false, reason: 'already-decided' };
      }
      throw err;
    }
  }
}

// ─── Direction 2: broker-pending (nervous-sourced) -> nervous notification ───────

/** True iff `request` was submitted by nervous itself (the requester this bridge's
 *  reverse projection applies to). */
export function isNervousSourced(request: ApprovalRequest): boolean {
  return request.requester.role === 'nervous';
}

/** 5-level `ApprovalRisk` -> 3-level nervous `RiskLevel`. */
const RISK_LEVEL_BY_APPROVAL_RISK: Readonly<Record<ApprovalRisk, RiskLevel>> = {
  none: 'low',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'high',
};

/** `ApprovalRisk` -> nervous `Severity` (notification display priority). */
const SEVERITY_BY_RISK: Readonly<Record<ApprovalRisk, Severity>> = {
  none: 'info',
  low: 'info',
  medium: 'warning',
  high: 'critical',
  critical: 'emergency',
};

/** Broker policy verdict -> nervous `ApprovalPolicy`. `deny` maps to `approve`
 *  (fail-safe): a still-pending request can only carry a policy-engine
 *  *recommendation*, so the most conservative gate (explicit human approval) applies. */
const NERVOUS_POLICY_BY_REQUEST_POLICY: Readonly<Record<ApprovalRequestPolicy, NervousApprovalPolicy>> = {
  'auto-approve': 'autonomous',
  notify: 'suggest-30m',
  'require-approval': 'approve',
  deny: 'approve',
};

function extractStringDetail(details: Record<string, unknown>, key: string): string | undefined {
  const value = details[key];
  return typeof value === 'string' ? value : undefined;
}

/** Label-free `key: value` summary of the request's metadata + masked args — no raw
 *  argument value ever appears here (the contract itself has no raw-args field). */
function buildMessage(request: ApprovalRequest): string {
  const meta = `scope: ${request.scope} · risk: ${request.risk} · policy: ${request.policy}`;
  const argsLine = request.maskedArgs ? JSON.stringify(request.maskedArgs) : '';
  return [request.summary, meta, argsLine].filter((line) => line.length > 0).join('\n');
}

function toNotificationAction(request: ApprovalRequest): NotificationAction {
  return {
    id: request.id,
    label: request.summary,
    policy: NERVOUS_POLICY_BY_REQUEST_POLICY[request.policy],
    risk: RISK_LEVEL_BY_APPROVAL_RISK[request.risk],
    isSafetyFloor: request.risk === 'critical',
    payload: request.maskedArgs ?? undefined,
  };
}

/**
 * Project a nervous-sourced, broker-pending `ApprovalRequest` into a
 * `NervousNotification`-shaped payload. Returns `undefined` for any request that did
 * NOT originate from nervous (`requester.role !== 'nervous'`) — callers can apply this
 * unconditionally to every broker `'pending'` event without a separate guard.
 */
export function toNervousNotification(request: ApprovalRequest): NervousNotification | undefined {
  if (!isNervousSourced(request)) return undefined;

  const timeoutMs = Date.parse(request.expiresAt) - Date.parse(request.createdAt);

  return {
    id: request.id,
    type: request.scope,
    title: request.summary,
    message: buildMessage(request),
    severity: SEVERITY_BY_RISK[request.risk],
    createdAt: request.createdAt,
    detectorId: request.requester.instanceId,
    actions: [toNotificationAction(request)],
    timeoutMs,
    sprintId: extractStringDetail(request.details, 'sprintId'),
    taskId: extractStringDetail(request.details, 'taskId'),
    groupKey: request.scopeId,
  };
}

// ─── Direction 3: sweep-then-list — nervous-status pending read path ─────────
// EXPIRE-SWEEP wiring (Task-1's `ApprovalStore.sweepExpired()`): the nervous
// approval bridge is the nervous-status surface's own entry point into the
// runtime-wide ApprovalBroker, so this is the correct attach point for a
// sweep-before-read hook — an overdue nervous-sourced request must never be
// reported pending here without first having been given the chance to close.

/** Narrow store surface this read path depends on — satisfied structurally by a
 *  real `ApprovalStore` (core/approval-store.ts) or a test fake, mirroring
 *  `NervousApprovalBrokerLike`'s narrow-surface pattern above. */
export interface NervousApprovalStoreLike {
  sweepExpired(now?: Date): string[];
  load(): { pending: ReadonlyArray<{ request: ApprovalRequest }> };
}

const DEFAULT_ON_SWEEP_ERROR = (error: unknown): void => {
  console.error('[nervous/approval-bridge] sweepExpired failed:', error);
};

/**
 * List broker-pending, nervous-sourced requests projected as `NervousNotification`s
 * — the nervous-status pending read path. Sweeps `store` FIRST (fail-soft: a
 * throwing store is routed to `onSweepError` and never blocks this read) so a
 * TTL-overdue request gets its honest ttl-expire closure written before nervous
 * status ever reads it, instead of drifting stale until some other reader
 * happens to sweep it.
 */
export function listNervousPendingFromStore(
  store: NervousApprovalStoreLike,
  onSweepError: (error: unknown) => void = DEFAULT_ON_SWEEP_ERROR,
): NervousNotification[] {
  try {
    store.sweepExpired();
  } catch (error) {
    onSweepError(error);
  }
  const notifications: NervousNotification[] = [];
  for (const entry of store.load().pending) {
    const notification = toNervousNotification(entry.request);
    if (notification) notifications.push(notification);
  }
  return notifications;
}
