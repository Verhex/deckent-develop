// ─── Approval Rules Loader — plain config -> ApprovalPolicyRule[] (APR-RULES-LOAD) ──
// Governs: strategic-pivot §11.2 + ADR-G-020 (authority). sprint-354 task 354-012.
// Builds on approval-contract.ts (enum vocabulary) + approval-policy.ts (the
// ApprovalPolicyRule shape `decidePolicy` consumes) — this module owns ZERO new
// vocabulary or policy semantics. It is a pure, side-effect-free loader: given an
// `unknown` plain config object, it returns an `ApprovalPolicyRule[]` (already
// shaped for `decidePolicy`, no adaptation needed) plus a `warnings` list.
//
// Fail-soft by design: a malformed rule entry (unknown field, invalid enum value,
// bad timeoutMs) never throws and never breaks the sprint — that ONE entry is
// skipped and a warning is recorded. Wiring `approval.rules` into the real
// AppConfig type (config.ts / config-types.ts) is an explicit follow-up — this
// module deliberately accepts `unknown` and never imports config.ts.

import { z } from 'zod';
import {
  ALL_APPROVAL_POLICIES,
  ALL_APPROVAL_RISKS,
  ALL_APPROVAL_SCOPES,
  ALL_REQUESTER_ROLES,
} from './approval-contract.js';
import type { ApprovalPolicyRule } from './approval-policy.js';

// ─── Input schema (plain-config rule entry) ──────────────────────────────────
// Mirrors ApprovalPolicyRule 1:1 — same shape decidePolicy consumes, so a
// validated entry needs zero translation before use. `.strict()` on both levels
// means an unknown key OR an invalid enum value fails validation for that one
// entry only (safeParse) — never the whole array.

const approvalRuleMatchInputSchema = z
  .object({
    scope: z.enum(ALL_APPROVAL_SCOPES).optional(),
    risk: z.enum(ALL_APPROVAL_RISKS).optional(),
    requester: z.enum(ALL_REQUESTER_ROLES).optional(),
    tenantId: z.string().min(1).optional(),
  })
  .strict();

const approvalRuleInputSchema = z
  .object({
    match: approvalRuleMatchInputSchema,
    action: z.enum(ALL_APPROVAL_POLICIES),
    timeoutMs: z.number().positive().optional(),
  })
  .strict();

// ─── Safe default rule set ────────────────────────────────────────────────────
// Applied when `approval.rules` is absent/null/not-an-array/empty — the expected
// first-run / not-yet-configured state, not a failure (no warning is emitted for
// taking this path). Risk-ordered, most- to least-restrictive; each rule matches
// a single distinct risk tier so order has no effect on the result (decidePolicy
// is first-match-wins) — the ordering itself is documentation of intent.

export const SAFE_DEFAULT_APPROVAL_RULES: readonly ApprovalPolicyRule[] = [
  { match: { risk: 'critical' }, action: 'require-approval' },
  { match: { risk: 'high' }, action: 'require-approval' },
  { match: { risk: 'medium' }, action: 'notify' },
  { match: { risk: 'low' }, action: 'auto-approve' },
  { match: { risk: 'none' }, action: 'auto-approve' },
];

// ─── loadApprovalRules ─────────────────────────────────────────────────────────

export interface ApprovalRulesLoadResult {
  /** Ready to pass straight into `decidePolicy(request, rules)` — no adaptation. */
  rules: ApprovalPolicyRule[];
  /** One entry per skipped/malformed rule, or per structural fallback. Never
   *  silently dropped — a skip always has a matching warning. */
  warnings: string[];
}

function describeIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Load an `ApprovalPolicyRule[]` from a plain config object's `approval.rules[]`
 * field. Never throws.
 *
 * - `approval` missing/null, or `approval.rules` missing/null/empty -> the safe
 *   default rule set (no warning — this is the expected unconfigured state).
 * - `approval.rules` present but not an array -> safe defaults + one warning
 *   (no partial data exists to salvage).
 * - `approval.rules` a non-empty array -> each entry is validated independently;
 *   a malformed entry (unknown field, invalid enum, bad timeoutMs) is skipped
 *   with a warning, valid entries are kept in their original order. If every
 *   entry turns out malformed the result is an empty `rules` array (still safe:
 *   `decidePolicy`'s own no-match fallback + critical-never-auto-approve clamp
 *   already handle an empty rule list) — defaults are intentionally NOT
 *   substituted here, since that would mask a real misconfiguration.
 */
export function loadApprovalRules(rawConfig: unknown): ApprovalRulesLoadResult {
  const warnings: string[] = [];

  if (rawConfig === null || typeof rawConfig !== 'object') {
    return { rules: [...SAFE_DEFAULT_APPROVAL_RULES], warnings };
  }

  const approvalRaw = (rawConfig as Record<string, unknown>).approval;
  if (approvalRaw === undefined || approvalRaw === null) {
    return { rules: [...SAFE_DEFAULT_APPROVAL_RULES], warnings };
  }
  if (typeof approvalRaw !== 'object') {
    warnings.push(`approval must be an object — got ${typeof approvalRaw}; using safe defaults`);
    return { rules: [...SAFE_DEFAULT_APPROVAL_RULES], warnings };
  }

  const rulesRaw = (approvalRaw as Record<string, unknown>).rules;
  if (rulesRaw === undefined || rulesRaw === null) {
    return { rules: [...SAFE_DEFAULT_APPROVAL_RULES], warnings };
  }
  if (!Array.isArray(rulesRaw)) {
    warnings.push(`approval.rules must be an array — got ${typeof rulesRaw}; using safe defaults`);
    return { rules: [...SAFE_DEFAULT_APPROVAL_RULES], warnings };
  }
  if (rulesRaw.length === 0) {
    return { rules: [...SAFE_DEFAULT_APPROVAL_RULES], warnings };
  }

  const rules: ApprovalPolicyRule[] = [];
  rulesRaw.forEach((entry, index) => {
    const parsed = approvalRuleInputSchema.safeParse(entry);
    if (!parsed.success) {
      warnings.push(`approval.rules[${index}] skipped — ${describeIssues(parsed.error.issues)}`);
      return;
    }
    const rule: ApprovalPolicyRule = {
      match: parsed.data.match,
      action: parsed.data.action,
      ...(parsed.data.timeoutMs !== undefined ? { timeoutMs: parsed.data.timeoutMs } : {}),
    };
    rules.push(rule);
  });

  return { rules, warnings };
}
