// ─── Approval rules ENGINE (D2b-2a, design §3.5 DE2 promotion) ──────────────
//
// Promotes the DE2a advisory matcher into a real automatic-decision engine —
// by ABSORPTION: a rule decision flows through the SAME ApprovalDecisionIngress
// every human decision uses (same MAC envelope, same first-writer-wins broker
// write), authenticated by a RuleEngineApprovalAuthenticator instead of a TTY.
// The envelope's actorId is `rule:<id>` and its authorityRef is the engine's
// constant, so every automated decision is visibly rule-decided in the durable
// record (decidedBy carries the rule id — no invisible automation).
//
// Safety model (typed, not prose):
//  - Only request kinds in REQUEST_KIND_TIERS are automatable; anything the
//    table does not know — including decision-federation mirrors, which are
//    human work by definition — is untouchable (fail-closed).
//  - A rule authenticates ONLY while it is still live on disk: reauthenticate
//    and isSessionActive both re-load approval-rules.json and re-match; a
//    disabled/removed/expired rule dies immediately (removability is enforced
//    at decision time, not just at authoring time).
//  - The session reference is the CURRENT rules-file digest: if the file
//    changed between envelope mint and verification, the session proof no
//    longer matches and the decision is refused.
//  - critical stays unrepresentable (ApprovalRule typing) and unknown tiers
//    never automate.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import type {
  LiveApprovalAuthenticator,
  LiveApprovalAuthentication,
  LiveApprovalReauthenticationContext,
  LiveApprovalSessionProof,
} from './approval-decision-ingress.js';
import type { ApprovalRequest } from './approval-contract.js';
import {
  approvalRulesPath,
  loadApprovalRules,
  matchApprovalRule,
  type ApprovalRule,
  type RuleRiskTierMax,
} from './approval-rules.js';

/** The engine's envelope authority reference — the typed discriminator the
 * decision authority's rule branch requires (staged alternative to a full
 * `kind:'rule'` union; recorded in the design as D2b staging). */
export const APPROVAL_RULES_ENGINE_AUTHORITY_REF = 'approval-rules-engine:v1';

/** Rule-actor prefix carried in decidedBy/actorId. */
export const RULE_ACTOR_PREFIX = 'rule:';

/**
 * Which request kinds may EVER be rule-decided, and at which tier. This is
 * the automation allowlist: an unknown kind — or a request without a typed
 * details.kind — can never be automated. Mirrors of human work are excluded
 * on purpose.
 */
export const REQUEST_KIND_TIERS: Readonly<Record<string, RuleRiskTierMax>> = Object.freeze({
  'provider-evidence-probe': 'routine',
});

export function requestTierFor(request: ApprovalRequest): RuleRiskTierMax | null {
  const kind = (request.details as { kind?: unknown } | undefined)?.kind;
  if (typeof kind !== 'string') return null;
  return REQUEST_KIND_TIERS[kind] ?? null;
}

function tierAllows(ruleMax: RuleRiskTierMax, requestTier: RuleRiskTierMax): boolean {
  if (ruleMax === 'elevated') return true;
  return requestTier === 'routine';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function rulesFileDigest(projectRoot: string): string {
  const path = approvalRulesPath(projectRoot);
  if (!existsSync(path)) return sha256('absent');
  try {
    return sha256(readFileSync(path, 'utf-8'));
  } catch {
    return sha256('unreadable');
  }
}

/**
 * Resolve the ACTIVE rule that may decide this request right now, or null.
 * Fresh-loads the file every time: a fault-flagged file automates NOTHING
 * (partially readable automation authority is no authority).
 */
export function liveRuleFor(
  projectRoot: string,
  request: ApprovalRequest,
  now: Date,
): ApprovalRule | null {
  const tier = requestTierFor(request);
  if (tier === null) return null;
  const loaded = loadApprovalRules(projectRoot);
  if (loaded.fault) return null;
  const rule = matchApprovalRule({ id: request.id, summary: request.summary }, loaded.rules, now);
  if (!rule) return null;
  if (!tierAllows(rule.match.riskTierMax, tier)) return null;
  return rule;
}

/**
 * Authenticator for the rules engine. Both boundary methods re-derive the
 * live rule from disk so the authority is the FILE'S CURRENT CONTENT —
 * disabling or removing a rule kills in-flight decisions immediately.
 */
export class RuleEngineApprovalAuthenticator implements LiveApprovalAuthenticator {
  constructor(
    private readonly projectRoot: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reauthenticate(
    context: LiveApprovalReauthenticationContext,
  ): Promise<LiveApprovalAuthentication | null> {
    const now = this.now();
    const rule = liveRuleFor(this.projectRoot, context.request, now);
    if (!rule) return null;
    return {
      actorId: `${RULE_ACTOR_PREFIX}${rule.id}`,
      tenantId: context.request.tenantId,
      sessionRef: rulesFileDigest(this.projectRoot),
      authorityRef: APPROVAL_RULES_ENGINE_AUTHORITY_REF,
      authenticatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 120_000).toISOString(),
    };
  }

  isSessionActive(
    proof: LiveApprovalSessionProof,
    context: LiveApprovalReauthenticationContext,
    now: Date,
  ): boolean {
    if (proof.authorityRef !== APPROVAL_RULES_ENGINE_AUTHORITY_REF) return false;
    const rule = liveRuleFor(this.projectRoot, context.request, now);
    if (!rule) return false;
    if (proof.actorId !== `${RULE_ACTOR_PREFIX}${rule.id}`) return false;
    // The envelope was minted against a specific rules-file content; any
    // change since then (edit, disable, remove) invalidates the session.
    return proof.sessionRefHash === sha256(rulesFileDigest(this.projectRoot));
  }
}

export interface RuleApplicationOutcome {
  readonly requestId: string;
  readonly ruleId: string;
  readonly action: 'allow' | 'deny';
  readonly result: 'decided' | 'idempotent' | 'refused';
  readonly refusalReason?: string;
}
