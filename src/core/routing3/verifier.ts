// ─── RoutingEngineV3 — stage-3 VERIFIER (LLM cannot bypass; defense-in-depth) ─
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §3 stage-3 + brainstorm
// decisions 1/5: every candidate — including an LLM-proposed or force-* one —
// passes deterministic verification. The verifier NEVER trusts that upstream
// stages ran (defense-in-depth re-asserts). Zero-candidate outcomes surface as
// a typed CatalogGapError (V2's silent fallback-chain class is dead), and the
// Sprint-205 anti-temp guarantee is re-expressed vectorially here.

import { DeckentError } from '../errors.js';
import { parseSubtype } from './vocabulary-builtin.js';
import type { RequirementVector } from './requirement-vector.js';
import type { AgentCandidate } from './stage-eliminate.js';
import type { ScoredCandidate } from './decision-types.js';
import type { PolicyPackRegistry, PolicyRule } from './policy-pack.js';
import { policyMatches } from './policy-pack.js';

// ─── Verdicts ────────────────────────────────────────────────────────────────

export type VerifierViolationCode =
  | 'CONTENT_STRUCTURAL_CONFLICT'
  | 'DELIVERABLE_UNCOVERED'
  | 'WRITE_AUTHORITY_MISSING'
  | 'WORK_TYPE_NEVER'
  | 'POLICY_ROLE_RESTRICTED'
  | 'POLICY_AGENT_DENIED'
  | 'POLICY_ALLOWLIST_MISS';

export interface VerifierViolation {
  code: VerifierViolationCode;
  detail: string;
  /** Present when a policy rule produced the violation (auditable story). */
  policyId?: string;
}

export interface VerifierVerdict {
  pass: boolean;
  violations: VerifierViolation[];
  /** force-* path: authority-violating force needs explicit confirmation. */
  forceWarning: boolean;
  /** A matching policy demanded escalation regardless of scores. */
  policyEscalate: boolean;
  /** Matching policies raised the confidence floor to this value (max wins). */
  policyMinConfidence: number | null;
}

// ─── Catalog gap (ownership invariant) ───────────────────────────────────────

/** Zero capable candidates — surfaced to Brain, never silently fallback-routed. */
export class CatalogGapError extends DeckentError {
  public readonly workType: string;
  public readonly domains: readonly string[];
  public readonly eliminatedSummary: readonly string[];
  constructor(
    workType: string,
    domains: readonly string[],
    eliminatedSummary: readonly string[],
  ) {
    super(
      'ROUTING3_CATALOG_GAP',
      `No capable agent for work-type '${workType}' over domains [${domains.join(', ')}]`,
      'The catalog has an ownership gap: author a capable agent, widen an existing capability block, or adjust the requirement. Run `deckent agent lint` for the full gap map. This error intentionally replaces the V2 silent fallback chain.',
    );
    this.name = 'CatalogGapError';
    this.workType = workType;
    this.domains = domains;
    this.eliminatedSummary = eliminatedSummary;
  }
}

// ─── Core verification (per candidate) ───────────────────────────────────────

export interface VerifyOptions {
  policies?: PolicyPackRegistry;
  /** True when this candidate arrived via forceAgent (ADR-G-006 force-*). */
  forced?: boolean;
}

/**
 * Stage-3: deterministic checks over one candidate. Force bypasses RANKING,
 * never verification — a force with authority violations returns a verdict
 * flagged `forceWarning` (caller must confirm through Brain/Alperen).
 */
export function verify(
  requirement: RequirementVector,
  candidate: AgentCandidate,
  options: VerifyOptions = {},
): VerifierVerdict {
  const violations: VerifierViolation[] = [];
  const cap = candidate.capabilities;
  const reqWorkType = parseSubtype(requirement.content.workType).parent;

  // Defense-in-depth: re-assert the stage-1 hard constraints.
  if (requirement.positional.needsWrite && !cap.positional.writeAuthority) {
    violations.push({
      code: 'WRITE_AUTHORITY_MISSING',
      detail: `needsWrite requirement vs writeAuthority=false (${candidate.agentId})`,
    });
  }
  const wtEntry = cap.content.workTypes.find(
    (w) => parseSubtype(w.type).parent === reqWorkType,
  );
  if (wtEntry?.proficiency === 'never') {
    violations.push({
      code: 'WORK_TYPE_NEVER',
      detail: `capabilities declare ${reqWorkType}:never (${candidate.agentId})`,
    });
  }

  // Content-claim vs structural evidence: a proposed workType that contradicts
  // the deliverable mass is the LLM-cannot-bypass gate (built and tested on
  // deterministic inputs now; Slice-2 routes LLM output through this exact check).
  const conflict = contentStructuralConflict(requirement);
  if (conflict) {
    violations.push({ code: 'CONTENT_STRUCTURAL_CONFLICT', detail: conflict });
  }

  // Deliverable coverage re-assert (mirror of stage-1 rule 4).
  if (cap.positional.deliverables.length > 0) {
    const covered = new Set(cap.positional.deliverables);
    const missing = requirement.positional.deliverables
      .filter(
        (d) =>
          d.ratio > 0 &&
          !covered.has(d.type) &&
          !(d.type === 'code-test' && cap.positional.writeAuthority),
      )
      .map((d) => d.type);
    if (missing.length > 0) {
      violations.push({
        code: 'DELIVERABLE_UNCOVERED',
        detail: `deliverables not covered: ${missing.join(', ')} (${candidate.agentId})`,
      });
    }
  }

  // Policy-pack enforcement (matching rules only; violations carry policy id).
  let policyEscalate = false;
  let policyMinConfidence: number | null = null;
  for (const rule of options.policies?.rules ?? []) {
    if (!policyMatches(rule, requirement)) continue;
    applyPolicy(rule, candidate, violations);
    if (rule.require.escalate) policyEscalate = true;
    if (typeof rule.require.minConfidence === 'number') {
      policyMinConfidence = Math.max(policyMinConfidence ?? 0, rule.require.minConfidence);
    }
  }

  const authorityViolations = violations.length > 0;
  return {
    pass: !authorityViolations,
    violations,
    forceWarning: Boolean(options.forced && authorityViolations),
    policyEscalate,
    policyMinConfidence,
  };
}

function applyPolicy(
  rule: PolicyRule,
  candidate: AgentCandidate,
  violations: VerifierViolation[],
): void {
  const { require } = rule;
  if (require.roles && require.roles.length > 0) {
    if (!require.roles.includes(candidate.capabilities.positional.role)) {
      violations.push({
        code: 'POLICY_ROLE_RESTRICTED',
        detail: `policy '${rule.id}' restricts to roles [${require.roles.join(', ')}], candidate role=${candidate.capabilities.positional.role}`,
        policyId: rule.id,
      });
    }
  }
  if (require.denyAgents?.includes(candidate.agentId)) {
    violations.push({
      code: 'POLICY_AGENT_DENIED',
      detail: `policy '${rule.id}' denies agent ${candidate.agentId}`,
      policyId: rule.id,
    });
  }
  if (require.agentAllowlist && require.agentAllowlist.length > 0) {
    if (!require.agentAllowlist.includes(candidate.agentId)) {
      violations.push({
        code: 'POLICY_ALLOWLIST_MISS',
        detail: `policy '${rule.id}' allowlists [${require.agentAllowlist.join(', ')}]`,
        policyId: rule.id,
      });
    }
  }
}

/**
 * Structural cross-check: 'document' claimed while ≥80% of the write mass is
 * code (or the inverse: 'build' claimed on a 100%-doc deliverable set) is a
 * contradiction the LLM cannot argue past. Returns the conflict detail or null.
 */
export function contentStructuralConflict(requirement: RequirementVector): string | null {
  const workType = parseSubtype(requirement.content.workType).parent;
  const mass = (types: readonly string[]): number =>
    requirement.positional.deliverables
      .filter((d) => types.includes(d.type))
      .reduce((sum, d) => sum + d.ratio, 0);

  const codeMass = mass(['code-src', 'code-test', 'migration', 'script']);
  const docMass = mass(['doc']);

  if (workType === 'document' && codeMass >= 0.8) {
    return `workType 'document' vs ${(codeMass * 100).toFixed(0)}% code deliverables`;
  }
  if ((workType === 'build' || workType === 'fix' || workType === 'refactor') && docMass >= 0.999 && requirement.positional.deliverables.length > 0) {
    return `workType '${workType}' vs 100% doc deliverables`;
  }
  return null;
}

// ─── Ownership invariant + anti-temp ─────────────────────────────────────────

/**
 * Ownership invariant: zero verified candidates → typed CatalogGapError.
 * Never returns a fallback — the Brain decides (decision-5).
 */
export function assertOwnership(
  requirement: RequirementVector,
  verifiedCandidates: readonly AgentCandidate[],
  eliminatedSummary: readonly string[],
): void {
  if (verifiedCandidates.length === 0) {
    throw new CatalogGapError(
      parseSubtype(requirement.content.workType).parent,
      requirement.positional.domains.map((d) => d.id),
      eliminatedSummary,
    );
  }
}

/**
 * Anti-temp invariant (Sprint-205, re-expressed vectorially): a 'learned' temp
 * agent may hold the top slot ONLY when no builtin/user candidate sits within
 * `epsilon` of its finalScore. Returns the (possibly re-ordered) ranking.
 */
export function enforceAntiTemp(
  ordered: readonly ScoredCandidate[],
  sourceOf: (agentId: string) => AgentCandidate['source'] | undefined,
  epsilon: number,
): ScoredCandidate[] {
  const result = [...ordered];
  const top = result[0];
  if (!top || sourceOf(top.agentId) !== 'learned') return result;

  const challenger = result.find(
    (c) => sourceOf(c.agentId) !== 'learned' && top.finalScore - c.finalScore <= epsilon,
  );
  if (challenger) {
    const idx = result.indexOf(challenger);
    result.splice(idx, 1);
    result.unshift(challenger);
  }
  return result;
}
