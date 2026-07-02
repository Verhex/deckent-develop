// ─── NervousApprovalActions — accept/reject ACTION-PATH wire (NERVOUS-APR-WIRE) ─
// Governs: ADR-G-022 (nervous — "APR unification" roadmap) + ADR-G-020 (authority).
// Wires the READ-ONLY `NervousApprovalBridge` (approval-bridge.ts, sprint 355 task
// 355-012) onto an actual accept/reject dispatch — the follow-up approval-bridge.ts's
// own header names ("gerçek-wiring follow-up work").
//
// `approval-actions.ts` (this task's originally-assumed target file) did not exist
// before this task. The REAL `deckent_nervous_accept`/`deckent_nervous_reject`
// handlers (`handleNervousAccept`/`handleNervousReject`) live in
// `src/mcp/tools/nervous.ts`, which is OUTSIDE this task's write scope
// (src/nervous/ + tests/nervous/ only) — see this task's .result `notes` for the
// named follow-up. This module is the nearest-correct file this task CAN write: a
// self-contained, flag-gated dispatch function a future task wires directly into
// those handlers (and/or `Executor.resolveApproval`) without this module owning any
// of their internals — same zero-internals precedent as approval-bridge.ts itself.
//
// Flag: `nervous_system.approval_bridge` (default false — legacy path, unchanged
// behavior):
//  - off → `legacyResolve` runs UNCHANGED — byte-identical to pre-task behavior.
//  - on  → forwarded to `NervousApprovalBridge.applyNervousDecision` (accept ->
//    allow, reject -> deny). Pending-store cleanup is owned by the bridge itself
//    (approval-bridge.ts), including its already-decided idempotent path — this
//    module does not reimplement it.

import type {
  NervousApprovalBridge,
  NervousBridgeApplyResult,
  NervousResolution,
} from './approval-bridge.js';

/** The nervous-side accept/reject resolution this dispatch routes. */
export interface NervousApprovalActionInput {
  /** Nervous notification id (or the broker request id it was mirrored under). */
  readonly notificationId: string;
  readonly resolution: NervousResolution;
  /** Who resolved it (e.g. "user-cli", "user-mcp", a Telegram handle). */
  readonly decidedBy: string;
  readonly reason?: string;
}

export type NervousApprovalActionResult<TLegacy> =
  | { readonly routedTo: 'bridge'; readonly bridgeResult: NervousBridgeApplyResult }
  | { readonly routedTo: 'legacy'; readonly legacyResult: TLegacy };

export interface NervousApprovalActionDeps<TLegacy> {
  /** `nervous_system.approval_bridge` — default false (legacy path). */
  readonly approvalBridgeEnabled: boolean;
  readonly bridge: Pick<NervousApprovalBridge, 'applyNervousDecision'>;
  /** The existing accept/reject side effect (e.g. the `NervousIpcQueue.writeApproval`
   *  call inside `handleNervousAccept`/`handleNervousReject`) — invoked UNCHANGED
   *  when the flag is off, so flag-off stays byte-identical to pre-task behavior. */
  readonly legacyResolve: (input: NervousApprovalActionInput) => TLegacy;
}

/**
 * Route a resolved nervous accept/reject either through the runtime-wide
 * ApprovalBroker bridge (flag on) or the existing legacy side effect (flag off,
 * default). The single entry point a future caller wires in.
 */
export function resolveNervousApprovalAction<TLegacy>(
  input: NervousApprovalActionInput,
  deps: NervousApprovalActionDeps<TLegacy>,
): NervousApprovalActionResult<TLegacy> {
  if (!deps.approvalBridgeEnabled) {
    return { routedTo: 'legacy', legacyResult: deps.legacyResolve(input) };
  }

  const bridgeResult = deps.bridge.applyNervousDecision({
    notificationId: input.notificationId,
    resolution: input.resolution,
    decidedBy: input.decidedBy,
    reason: input.reason,
  });

  return { routedTo: 'bridge', bridgeResult };
}

/**
 * Reads the `nervous_system.approval_bridge` flag driving
 * {@link resolveNervousApprovalAction}'s routing. Not yet part of the V2 config
 * schema (`core/config-types.ts` is outside this task's write scope) — mirrors the
 * existing `nervous_system.worker_respawn` cast precedent (bootstrap.ts). Default
 * false: legacy path, unchanged behavior.
 */
export function isNervousApprovalBridgeEnabled(nervousConfig: unknown): boolean {
  return (nervousConfig as { approval_bridge?: boolean } | undefined)?.approval_bridge ?? false;
}
