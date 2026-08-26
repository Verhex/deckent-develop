// ─── FallbackResolver — terminal-unavailable / no-decision fallback (APR-FALLBACK) ─
// Governs: strategic-pivot §11.1 (runtime-wide ApprovalBroker follow-up) + ADR-G-020
// (authority). Built directly on approval-contract.ts (APR-CONTRACT) — this module
// owns ZERO contract shape; it only reads `risk`/`expiresAt` off an already-validated
// ApprovalRequest.
//
// Scope: decides what happens to a pending approval when a TERMINAL channel is not
// available, or no decision has arrived yet — deny | pause | timeout-default |
// escalate(dashboard/api). This is the pure decision core; ApprovalBroker/ApprovalRelay
// (APR-1/APR-2) own the IO (TTL sweep, channel dispatch) that ACTS on the returned
// FallbackDecision. resolveFallback() itself never reads the wall clock, never touches
// the filesystem, and never awaits anything — every input it needs (including "now",
// via ctx.expiresAt) is supplied by the caller, so the SAME (request, ctx) pair always
// produces the SAME decision. This is what makes "sonsuz-takılma ASLA" (never an
// infinite hang) true by construction: a total, synchronous, side-effect-free function
// cannot hang.
//
// Precedence (evaluated in this exact order — every ctx combination hits exactly one):
//  1. `risk === 'critical'` AND no reachable escalation channel   → 'deny'.
//     A critical, unattended, channel-less request must fail SAFE, never silently ride
//     out to whatever policyDefault happens to be.
//  2. Expired (`request.expiresAt <= ctx.expiresAt`)              → 'timeout-default'.
//     Once the deadline has passed, continuing to try to escalate is pointless —
//     ctx.policyDefault is the deterministic outcome.
//  3. A reachable escalation channel exists ('dashboard' preferred, then 'api')
//                                                                  → 'escalate' to it.
//  4. Otherwise (not expired, not critical-and-channelless, no channel yet reachable)
//                                                                  → 'pause'.
//     Bounded, NOT an infinite wait — the SAME request re-resolves to 'timeout-default'
//     once ctx.expiresAt catches up, or to 'escalate' once a channel comes alive; the
//     caller (ApprovalBroker-family poll/sweep) is what re-invokes this, never this
//     function itself.

import type { ApprovalAction, ApprovalRequest } from './approval-contract.js';
import type { ApprovalRiskTier } from './config-types.js';
import { approvalRiskTierFor } from './approval-channel-authenticator.js';

// ─── Input types ──────────────────────────────────────────────────────────────

/** The only ApprovalRequest fields this resolver reads — never the full contract, to
 *  keep the pure-decision core decoupled from fields it has no business touching. */
export type FallbackRequest = Pick<ApprovalRequest, 'risk' | 'expiresAt'> & {
  readonly riskTier?: ApprovalRiskTier;
};

/** Escalation-capable channel names. Deliberately excludes 'terminal' — this resolver
 *  runs precisely BECAUSE no terminal is available. */
export const ESCALATION_CHANNELS = ['dashboard', 'api'] as const;
export type EscalationChannel = (typeof ESCALATION_CHANNELS)[number];

export interface FallbackContext {
  /** Channel names currently alive/reachable right now. May contain any string (e.g.
   *  'terminal', 'slack') — only 'dashboard'/'api' are recognized as escalation
   *  targets by this resolver; anything else is ignored for escalation purposes. */
  channelsAlive: readonly string[];
  /** Evaluation instant, ISO 8601 UTC (`new Date().toISOString()` convention — same
   *  as ApprovalRequest.expiresAt). The caller reads the wall clock ONCE and passes it
   *  in here; resolveFallback itself never calls `Date.now()`/`new Date()`, which is
   *  what keeps it pure. Compared against `request.expiresAt` to detect expiry. */
  expiresAt: string;
  /** The action to report on a `'timeout-default'` decision. Resolver-level policy —
   *  independent of (and may differ from) `request.defaultAction`; the caller decides
   *  which one to pass. */
  policyDefault: ApprovalAction;
}

// ─── Output type ──────────────────────────────────────────────────────────────

export type FallbackDecisionKind = 'deny' | 'pause' | 'timeout-default' | 'escalate';

interface FallbackDecisionBase<TKind extends FallbackDecisionKind> {
  kind: TKind;
  /** Human-readable one-liner explaining WHY this decision was reached — for audit
   *  trail / dashboard display, never parsed by callers. */
  reason: string;
}

export type FallbackDenyDecision = FallbackDecisionBase<'deny'>;
export type FallbackPauseDecision = FallbackDecisionBase<'pause'>;
export interface FallbackTimeoutDefaultDecision extends FallbackDecisionBase<'timeout-default'> {
  action: ApprovalAction;
}
export interface FallbackEscalateDecision extends FallbackDecisionBase<'escalate'> {
  channel: EscalationChannel;
}

/** The 4-way, always-finite outcome of {@link resolveFallback}. */
export type FallbackDecision =
  | FallbackDenyDecision
  | FallbackPauseDecision
  | FallbackTimeoutDefaultDecision
  | FallbackEscalateDecision;

// ─── resolveFallback ──────────────────────────────────────────────────────────

function pickEscalationChannel(channelsAlive: readonly string[]): EscalationChannel | undefined {
  const alive = new Set(channelsAlive);
  for (const channel of ESCALATION_CHANNELS) {
    if (alive.has(channel)) return channel;
  }
  return undefined;
}

/**
 * Pure, deterministic fallback decision for a pending approval when no terminal
 * channel is available (or no decision has arrived yet). See the module header for
 * the exact precedence order. Never throws, never performs IO, never reads the wall
 * clock — the SAME (request, ctx) pair always yields the SAME {@link FallbackDecision}.
 */
export function resolveFallback(request: FallbackRequest, ctx: FallbackContext): FallbackDecision {
  const escalationChannel = pickEscalationChannel(ctx.channelsAlive);
  const riskTier = approvalRiskTierFor(request);
  const expired = Date.parse(request.expiresAt) <= Date.parse(ctx.expiresAt);

  if (riskTier === null) {
    return { kind: 'deny', reason: 'invalid risk tier — fail safe' };
  }

  if (riskTier === 'critical' && (expired || !escalationChannel)) {
    return { kind: 'deny', reason: 'critical risk tier cannot fall back to allow/proceed' };
  }

  if (expired) {
    return {
      kind: 'timeout-default',
      action: ctx.policyDefault,
      reason: 'request expired — policyDefault applied',
    };
  }

  if (escalationChannel) {
    return { kind: 'escalate', channel: escalationChannel, reason: `escalated to '${escalationChannel}' channel` };
  }

  return {
    kind: 'pause',
    reason: 'no terminal and no reachable escalation channel, not yet expired — parked pending channel/expiry',
  };
}
