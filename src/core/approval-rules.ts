// ─── Approval rules store (DE2a, design §3.5) ───────────────────────────────
//
// Persistent, trackable, REMOVABLE decision automation. Every promoted
// "always approve this kind" decision lives here as a typed rule: who made
// it, when, why, and exactly what it matches — and it can be disabled or
// removed later (automation that cannot be unwound is a design defect).
//
// DE2a scope (honest staging): the store, the matcher and the CLI are real;
// the matcher runs in ADVISORY mode only — listings show which rule WOULD
// decide a pending request. Automatic application requires a `rule`
// authorization variant in the approval contract (the envelope today only
// admits live-session identities), which lands with D2b; shipping an
// auto-decide knob before that envelope exists would be a fake enablement.
//
// Engine invariants (typed, not prose): critical tier is TYPE-EXCLUDED from
// riskTierMax; no rule is ever system-minted — rules are born only from an
// explicit owner promotion (`decide --always`) or manual authoring.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/** Critical is deliberately unrepresentable here (design §3.5 invariant i). */
export type RuleRiskTierMax = 'routine' | 'elevated';

export interface ApprovalRuleMatch {
  /** Request-id prefix the rule addresses (e.g. `aprp-` probe approvals). */
  readonly idPrefix: string;
  /** Optional case-insensitive substring the request summary must contain. */
  readonly summaryIncludes?: string;
  /** Forward-compat ceiling; advisory until D1 envelopes carry riskTier. */
  readonly riskTierMax: RuleRiskTierMax;
}

export interface ApprovalRule {
  readonly id: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly reason: string;
  readonly match: ApprovalRuleMatch;
  readonly decision: 'allow' | 'deny';
  readonly source: 'manual' | `promoted-from:${string}`;
  readonly expiresAt?: string;
  readonly disabled?: boolean;
  readonly disabledAt?: string;
  readonly disabledBy?: string;
}

export interface ApprovalRulesFile {
  readonly schemaVersion: 1;
  readonly rules: readonly ApprovalRule[];
}

const RULES_RELATIVE = join('.deckent', 'settings', 'approval-rules.json');

export function approvalRulesPath(projectRoot: string): string {
  return join(projectRoot, RULES_RELATIVE);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function absentOr(value: unknown, check: (v: unknown) => boolean): boolean {
  return value === undefined || check(value);
}

/**
 * FULL-shape validation — every field, optional ones included. A rules file
 * is decision AUTHORITY input: a row with a malformed optional field (a
 * non-string summaryIncludes, an unparseable expiresAt, a truthy non-boolean
 * disabled) must be dropped with the fault flag, never trusted partially.
 */
function isValidRule(value: unknown): value is ApprovalRule {
  const rule = value as ApprovalRule;
  return typeof rule?.id === 'string' && rule.id.length > 0
    && isIsoDate(rule.createdAt)
    && typeof rule.createdBy === 'string' && rule.createdBy.length > 0
    && typeof rule.reason === 'string' && rule.reason.length > 0
    && (rule.decision === 'allow' || rule.decision === 'deny')
    && (rule.source === 'manual'
      || (typeof rule.source === 'string' && /^promoted-from:.+$/u.test(rule.source)))
    && typeof rule.match?.idPrefix === 'string'
    && rule.match.idPrefix.length > 0
    && (rule.match.riskTierMax === 'routine' || rule.match.riskTierMax === 'elevated')
    && absentOr(rule.match.summaryIncludes,
      v => typeof v === 'string' && (v as string).length > 0)
    && absentOr(rule.expiresAt, isIsoDate)
    && absentOr(rule.disabled, v => typeof v === 'boolean')
    && absentOr(rule.disabledAt, isIsoDate)
    && absentOr(rule.disabledBy, v => typeof v === 'string' && (v as string).length > 0);
}

/**
 * Load the rules file. FAIL-SOFT: a missing file is an empty set; a corrupt
 * or invalid file returns the readable subset plus a fault flag so callers
 * can warn — a broken automation file must never crash a decision surface,
 * and must never be silently treated as authority either.
 */
export function loadApprovalRules(
  projectRoot: string,
): { rules: ApprovalRule[]; fault: boolean } {
  const path = approvalRulesPath(projectRoot);
  if (!existsSync(path)) return { rules: [], fault: false };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ApprovalRulesFile;
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.rules)) {
      return { rules: [], fault: true };
    }
    const valid = parsed.rules.filter(isValidRule);
    return { rules: valid, fault: valid.length !== parsed.rules.length };
  } catch {
    return { rules: [], fault: true };
  }
}

/** Atomic save (temp + rename) — a torn rules file is worse than none. */
export function saveApprovalRules(projectRoot: string, rules: readonly ApprovalRule[]): void {
  const path = approvalRulesPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  const payload: ApprovalRulesFile = { schemaVersion: 1, rules };
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  renameSync(tmp, path);
}

export function newRuleId(): string {
  return `rule-${randomBytes(4).toString('hex')}`;
}

function ruleActive(rule: ApprovalRule, at: Date): boolean {
  if (rule.disabled === true) return false;
  if (rule.expiresAt !== undefined && Date.parse(rule.expiresAt) <= at.getTime()) return false;
  return true;
}

/**
 * ADVISORY matcher (DE2a): which ACTIVE rule would decide this request.
 * First match wins in file order — the file is the readable authority and
 * reordering it is an explicit, reviewable edit.
 */
export function matchApprovalRule(
  request: { readonly id: string; readonly summary: string },
  rules: readonly ApprovalRule[],
  at: Date = new Date(),
): ApprovalRule | null {
  for (const rule of rules) {
    if (!ruleActive(rule, at)) continue;
    if (!request.id.startsWith(rule.match.idPrefix)) continue;
    if (rule.match.summaryIncludes !== undefined
      && !request.summary.toLowerCase().includes(rule.match.summaryIncludes.toLowerCase())) {
      continue;
    }
    return rule;
  }
  return null;
}

/**
 * Promotion from an explicit owner decision (`decide --always`). The rule is
 * scoped to the decided request's id-prefix family, records provenance, and
 * is ALWAYS routine-tier (elevated rules are manual-authoring territory).
 */
export function promoteRuleFromDecision(input: {
  readonly requestId: string;
  readonly decision: 'allow' | 'deny';
  readonly createdBy: string;
  readonly reason: string;
  readonly summaryIncludes?: string;
  readonly now?: Date;
}): ApprovalRule {
  const prefixMatch = /^([a-z]+-)/u.exec(input.requestId);
  const idPrefix = prefixMatch?.[1] ?? input.requestId;
  return {
    id: newRuleId(),
    createdAt: (input.now ?? new Date()).toISOString(),
    createdBy: input.createdBy,
    reason: input.reason,
    match: {
      idPrefix,
      ...(input.summaryIncludes !== undefined
        ? { summaryIncludes: input.summaryIncludes }
        : {}),
      riskTierMax: 'routine',
    },
    decision: input.decision,
    source: `promoted-from:${input.requestId}`,
  };
}
