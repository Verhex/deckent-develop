// ─── ApprovalPolicy — pure policy decision engine (APR-POLICY) ──────────────
// Governs: strategic-pivot §11.2 + ADR-G-020 (authority). Built on
// approval-contract.ts (APR-CONTRACT, sprint-350 task 350-004) — this module
// owns ZERO contract shape; it only imports and reasons over it.
//
// `decidePolicy` is a deterministic, side-effect-free function: no IO, no
// clock, no randomness. Given an ApprovalRequest and an ordered rule list it
// always returns the same ApprovalPolicy verdict + a human-readable reason.
// Wiring this into the runtime broker (evaluating rules at submit-time,
// consuming the returned `timeoutMs`) is a downstream integration concern —
// out of scope here.

import type {
  ApprovalAction,
  ApprovalPolicy,
  ApprovalRequest,
  ApprovalRisk,
  ApprovalScope,
  RequesterRole,
} from './approval-contract.js';
import { approvalRiskTierFor } from './approval-channel-authenticator.js';

// ─── Rule schema ──────────────────────────────────────────────────────────────

/**
 * Match predicate for a policy rule. Every present field must equal the
 * corresponding request field; an absent field is a wildcard (always matches).
 * `requester` matches `request.requester.role` — a policy rule targets a
 * CLASS of actor (worker/brain/auditor/nervous/connector), not one running
 * instance.
 */
export interface ApprovalPolicyRuleMatch {
  scope?: ApprovalScope;
  risk?: ApprovalRisk;
  requester?: RequesterRole;
  tenantId?: string;
}

/**
 * One policy rule: what to decide when `match` fires. `timeoutMs`, when
 * present, is carried through into the {@link PolicyDecisionResult} for a
 * downstream broker to apply — this module performs no timing itself.
 */
export interface ApprovalPolicyRule {
  match: ApprovalPolicyRuleMatch;
  action: ApprovalPolicy;
  timeoutMs?: number;
}

/** Result of {@link decidePolicy} — the verdict plus why it was reached. */
export interface PolicyDecisionResult {
  policy: ApprovalPolicy;
  reason: string;
  timeoutMs?: number;
}

// ─── No-match fallback: ApprovalAction -> ApprovalPolicy ─────────────────────

// Rank-preserving map, most- to least-restrictive on both sides:
//   defaultAction:  deny > defer     > escalate > allow
//   policy:         deny > require-approval > notify > auto-approve
// A 1:1 order-preserving mapping guarantees the fallback can never resolve to
// a MORE permissive policy than defaultAction implies (no "yükseltme").
const DEFAULT_ACTION_TO_POLICY: Record<ApprovalAction, ApprovalPolicy> = {
  deny: 'deny',
  defer: 'require-approval',
  escalate: 'notify',
  allow: 'auto-approve',
};

// ─── Rule matching ────────────────────────────────────────────────────────────

function ruleMatches(request: ApprovalRequest, match: ApprovalPolicyRuleMatch): boolean {
  if (match.scope !== undefined && match.scope !== request.scope) return false;
  if (match.risk !== undefined && match.risk !== request.risk) return false;
  if (match.requester !== undefined && match.requester !== request.requester.role) return false;
  if (match.tenantId !== undefined && match.tenantId !== request.tenantId) return false;
  return true;
}

function describeMatch(match: ApprovalPolicyRuleMatch): string {
  const parts: string[] = [];
  if (match.scope !== undefined) parts.push(`scope=${match.scope}`);
  if (match.risk !== undefined) parts.push(`risk=${match.risk}`);
  if (match.requester !== undefined) parts.push(`requester=${match.requester}`);
  if (match.tenantId !== undefined) parts.push(`tenantId=${match.tenantId}`);
  return parts.length > 0 ? parts.join(',') : '(wildcard)';
}

// ─── decidePolicy ─────────────────────────────────────────────────────────────

/**
 * Decide the {@link ApprovalPolicy} verdict for `request` given an ordered
 * `rules` list. First matching rule wins. No match falls back to
 * `request.defaultAction`, mapped to the safe-side policy (never more
 * permissive than defaultAction implies). Regardless of source, `risk:
 * 'critical'` may never resolve to `'auto-approve'` — it is clamped to
 * `'deny'`.
 */
export function decidePolicy(
  request: ApprovalRequest,
  rules: readonly ApprovalPolicyRule[],
): PolicyDecisionResult {
  const matched = rules.find((rule) => ruleMatches(request, rule.match));

  const result: PolicyDecisionResult = matched
    ? {
        policy: matched.action,
        reason: `rule matched: ${describeMatch(matched.match)} -> ${matched.action}`,
        ...(matched.timeoutMs !== undefined ? { timeoutMs: matched.timeoutMs } : {}),
      }
    : {
        policy: DEFAULT_ACTION_TO_POLICY[request.defaultAction],
        reason: `no rule matched — defaultAction=${request.defaultAction} (safe-side fallback)`,
      };

  const riskTier = approvalRiskTierFor(request);
  if (riskTier === null) {
    return {
      ...result,
      policy: 'deny',
      reason: `clamped: invalid riskTier must fail closed (was: ${result.reason})`,
    };
  }

  if (riskTier === 'critical' && result.policy === 'auto-approve') {
    const legacyCritical = request.risk === 'critical' ? 'risk=critical, ' : '';
    return {
      ...result,
      policy: 'deny',
      reason: `clamped: ${legacyCritical}riskTier=critical must never auto-approve (was: ${result.reason})`,
    };
  }

  return result;
}
