// ═══ repl/nervous-bridge — REPL ↔ nervous accept/reject/edit plan bridge (APPROVE-007b) ═
//
// MASTER-PLAN Sıra-72. Sprint 357 Task 357-006.
//
// Pure, read-only, dependency-injected bridge from the REPL to nervous's own
// accept/reject/edit decision surface. This module NEVER touches `src/nervous/`
// internals and NEVER executes a real action — it only (a) lists pending
// suggestions from an injected store and (b) builds an "action plan" object
// describing what accepting/rejecting/editing WOULD do. A separate
// `applyNervousBridgePlan` is the single function that calls the injected
// collaborators (`executor` + `pendingCleanup`) — list/plan builders never call
// anything themselves. Real wiring (a live `Executor` + a live pending store) is
// explicit follow-up work, mirroring the `NervousApprovalBridge`
// (../../nervous/approval-bridge.ts) precedent's "wiring is follow-up" split.
//
// `NervousBridgeExecutor` is `Pick<Executor, 'resolveApproval'>` — a type-only
// import of the real `Executor` class (erased at compile time, zero runtime
// coupling, ADR-001-safe) so this module's injected-executor seam can never
// drift from the real `resolveApproval` signature. A real `Executor` instance
// satisfies it with zero adapter glue; tests inject a duck-typed fake.
//
// Gotcha parity (tarihçe: nervous-accept pending-temizleme asimetrisi, 2026-06-24 fix): historically, accepting a nervous suggestion
// left it stale in the pending store while reject correctly cleared it — fixed
// at the Executor level (2026-06-24) by making `resolveApproval` clear the
// pending store unconditionally for both decisions. This module does not
// re-fix that (it delegates execution entirely), but every plan it returns —
// including `handleEdit`'s edit-accept plan — explicitly enumerates a
// `clear-pending` step alongside `resolve-approval`, so a caller applying the
// plan can never reintroduce the accept/reject asymmetry by special-casing one
// path and forgetting the other.

import type { NervousNotification } from '../../core/nervous-types.js';
import type { Executor } from '../../nervous/executor.js';

// ─── Injection Seams ─────────────────────────────────────────────────────────

/** Read-only pending-list source — a fake in tests, a real disk/IPC-backed
 *  reader in production wiring (follow-up work, not owned by this module). */
export interface NervousPendingStore {
  listPending(): readonly NervousNotification[];
}

/** The nervous-side resolution vocabulary — mirrors `Executor.resolveApproval`'s
 *  own decision parameter. */
export type NervousBridgeResolution = 'accepted' | 'rejected';

/** Narrow, structurally-typed executor surface this bridge depends on —
 *  satisfied by a real `Executor` instance or a test fake. Derived from the
 *  real class via `Pick` so the seam can never drift from the actual
 *  `resolveApproval` signature (sync, returns whether a pending approval was
 *  found and resolved). */
export type NervousBridgeExecutor = Pick<Executor, 'resolveApproval'>;

/** Pending-store cleanup seam — same shape as `NervousPendingCleanup`
 *  (../../nervous/approval-bridge.ts) and `PendingApprovalStore.remove`
 *  (../../nervous/executor.ts), for a caller whose own pending view is not the
 *  same store instance the injected executor owns internally. */
export interface NervousBridgePendingCleanup {
  remove(notificationId: string): void;
}

// ─── Plan Shape ───────────────────────────────────────────────────────────────

export type NervousBridgeStepKind = 'resolve-approval' | 'clear-pending';

export interface NervousBridgeStep {
  readonly kind: NervousBridgeStepKind;
  readonly notificationId: string;
}

export interface NervousBridgePlan {
  readonly notification: NervousNotification;
  readonly resolution: NervousBridgeResolution;
  /** Carried for display/audit only — `Executor.resolveApproval` has no reason
   *  parameter, so `applyNervousBridgePlan` does not forward this. */
  readonly reason?: string;
  readonly modifiedPayload?: Record<string, unknown>;
  readonly steps: readonly NervousBridgeStep[];
}

export type NervousBridgePlanResult =
  | { readonly found: true; readonly plan: NervousBridgePlan }
  | { readonly found: false; readonly id: string };

// ─── Lookup (id / id-prefix / shortCode — parity with nervous.ts + chat-nervous-bridge.ts) ─

function findPending(store: NervousPendingStore, id: string): NervousNotification | undefined {
  return store
    .listPending()
    .find((n) => n.id === id || n.id.startsWith(id) || n.shortCode === id.toLowerCase());
}

function buildPlan(
  notification: NervousNotification,
  resolution: NervousBridgeResolution,
  extra?: { reason?: string; modifiedPayload?: Record<string, unknown> },
): NervousBridgePlan {
  return {
    notification,
    resolution,
    ...(extra?.reason !== undefined ? { reason: extra.reason } : {}),
    ...(extra?.modifiedPayload !== undefined ? { modifiedPayload: extra.modifiedPayload } : {}),
    // Both steps always present, for every resolution — the gotcha-parity
    // guarantee described in the module banner above.
    steps: [
      { kind: 'resolve-approval', notificationId: notification.id },
      { kind: 'clear-pending', notificationId: notification.id },
    ],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** List pending nervous suggestions — a pure pass-through read of `store`. */
export function listPendingNervous(store: NervousPendingStore): readonly NervousNotification[] {
  return store.listPending();
}

/** Build an accept plan for `id` (full id / id-prefix / shortCode). Does not
 *  execute anything — see `applyNervousBridgePlan`. */
export function planAccept(store: NervousPendingStore, id: string): NervousBridgePlanResult {
  const notification = findPending(store, id);
  if (!notification) return { found: false, id };
  return { found: true, plan: buildPlan(notification, 'accepted') };
}

/** Build a reject plan for `id` (full id / id-prefix / shortCode). Does not
 *  execute anything — see `applyNervousBridgePlan`. */
export function planReject(
  store: NervousPendingStore,
  id: string,
  reason?: string,
): NervousBridgePlanResult {
  const notification = findPending(store, id);
  if (!notification) return { found: false, id };
  return { found: true, plan: buildPlan(notification, 'rejected', { reason }) };
}

/**
 * Build an accept-with-edited-payload plan for `id` (APPROVE-007b). Same shape
 * as `planAccept` plus `modifiedPayload`, and — deliberately, not a
 * special case — the identical `clear-pending` step: this is the path the
 * task's disk-verified gotcha (nervous-accept-pending-asymmetry (2026-06-24 fix))
 * historically broke, so it gets no different treatment than a plain accept.
 * Does not execute anything — see `applyNervousBridgePlan`.
 */
export function handleEdit(
  store: NervousPendingStore,
  id: string,
  modifiedPayload: Record<string, unknown>,
): NervousBridgePlanResult {
  const notification = findPending(store, id);
  if (!notification) return { found: false, id };
  return { found: true, plan: buildPlan(notification, 'accepted', { modifiedPayload }) };
}

/**
 * Apply a plan by walking its `steps` and delegating each one to the injected
 * collaborator — `executor.resolveApproval` for `'resolve-approval'`,
 * `pendingCleanup.remove` for `'clear-pending'`. This is the ONLY function in
 * this module that calls anything; `pendingCleanup` is optional (a caller
 * whose injected `executor` already owns pending-store cleanup internally,
 * e.g. a real `Executor` constructed with its own `pendingStore`, has nothing
 * further to clean up here). Synchronous — `Executor.resolveApproval` is sync.
 */
export function applyNervousBridgePlan(
  plan: NervousBridgePlan,
  executor: NervousBridgeExecutor,
  pendingCleanup?: NervousBridgePendingCleanup,
): boolean {
  let resolved = false;
  for (const step of plan.steps) {
    if (step.kind === 'resolve-approval') {
      const opts = plan.modifiedPayload !== undefined ? { modifiedPayload: plan.modifiedPayload } : undefined;
      resolved = executor.resolveApproval(step.notificationId, plan.resolution, opts);
    } else {
      pendingCleanup?.remove(step.notificationId);
    }
  }
  return resolved;
}
