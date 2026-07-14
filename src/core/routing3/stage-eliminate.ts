// ─── RoutingEngineV3 — stage-1 ELIMINATION (hard binary filters) ─────────────
// Slice-1 (hand-coded, Brain 2026-07-14). Spec detail §3 stage-1: deterministic
// pre-score elimination — a candidate that fails ANY hard constraint is out
// with a typed reason. NO score math lives here (elimination is binary).
//
// This generalizes V2's write-denied HARD-exclude (routing-engine.ts:1359):
// construction work never reaches a Write-denied agent — pinned in tests as
// the explicit V2-parity case.

import type { CapabilityVector } from './capability-vector.js';
import type { RequirementVector } from './requirement-vector.js';
import type { EliminatedCandidate, EliminationReason } from './decision-types.js';
import { parseSubtype } from './vocabulary-builtin.js';

/** One agent candidate as the pipeline sees it. */
export interface AgentCandidate {
  agentId: string;
  capabilities: CapabilityVector;
  /** Manifest source — 'learned' marks temp agents (anti-temp invariant, verifier). */
  source: 'builtin' | 'learned' | 'user';
  /** Set by the Slice-0 migrator: capabilities synthesized from V2 rules. */
  provisional?: boolean;
}

export interface EliminationResult {
  survivors: AgentCandidate[];
  eliminated: EliminatedCandidate[];
}

/** Roles whose persona produces findings/plans, not diffs (review lane). */
const REVIEW_ROLES = new Set(['reviewer', 'analyst', 'advisor']);
/** Work-types whose deliverable is a judgement/report, not code. */
const REVIEW_WORK_TYPES = new Set(['review', 'analyze']);

function out(
  agentId: string,
  reason: EliminationReason,
  detail: string,
): EliminatedCandidate {
  return { entityId: agentId, kind: 'agent', reason, detail };
}

/**
 * Stage-1: apply the hard filters in documented order. Pure — same inputs,
 * same outputs; every elimination carries a typed reason for the story.
 */
export function eliminate(
  requirement: RequirementVector,
  candidates: readonly AgentCandidate[],
): EliminationResult {
  const survivors: AgentCandidate[] = [];
  const eliminated: EliminatedCandidate[] = [];
  const reqWorkType = parseSubtype(requirement.content.workType).parent;

  for (const candidate of candidates) {
    const cap = candidate.capabilities;

    // 1 · Write authority: work that writes files never reaches a non-writer.
    //     (V2-parity: deniedTools-Write agents on construction intents.)
    if (requirement.positional.needsWrite && !cap.positional.writeAuthority) {
      eliminated.push(out(candidate.agentId, 'write-authority-missing',
        `requirement needsWrite but writeAuthority=false (role=${cap.positional.role})`));
      continue;
    }

    // 2 · Declared refusal: proficiency 'never' on the requirement's work-type.
    const wtEntry = cap.content.workTypes.find(
      (w) => parseSubtype(w.type).parent === reqWorkType,
    );
    if (wtEntry?.proficiency === 'never') {
      eliminated.push(out(candidate.agentId, 'work-type-never',
        `capabilities declare ${reqWorkType}:never`));
      continue;
    }

    // 3 · Role contradiction: review-lane work needs a review-lane persona and
    //     vice versa — an implementer persona on review work produces diffs
    //     where a verdict is expected (and a reviewer persona cannot build).
    const isReviewWork = REVIEW_WORK_TYPES.has(reqWorkType);
    const isReviewRole = REVIEW_ROLES.has(cap.positional.role);
    if (isReviewWork && !isReviewRole && !hasExplicitGrant(cap, reqWorkType)) {
      eliminated.push(out(candidate.agentId, 'role-contradiction',
        `work-type ${reqWorkType} (review lane) vs role=${cap.positional.role} with no explicit ${reqWorkType} grant`));
      continue;
    }
    if (!isReviewWork && isReviewRole && !hasExplicitGrant(cap, reqWorkType)) {
      eliminated.push(out(candidate.agentId, 'role-contradiction',
        `construction work-type ${reqWorkType} vs review role=${cap.positional.role} with no explicit grant`));
      continue;
    }

    // 4 · Deliverable coverage: when the candidate DECLARES a deliverable list,
    //     every requirement deliverable must be covered. An empty declaration
    //     means "undeclared" (no constraint), never "covers nothing".
    if (cap.positional.deliverables.length > 0) {
      const covered = new Set(cap.positional.deliverables);
      const missing = requirement.positional.deliverables
        .filter((d) => d.ratio > 0 && !covered.has(d.type) && !isImplicitDeliverable(cap, d.type))
        .map((d) => d.type);
      if (missing.length > 0) {
        eliminated.push(out(candidate.agentId, 'deliverable-uncovered',
          `deliverables not covered: ${missing.join(', ')}`));
        continue;
      }
    }

    survivors.push(candidate);
  }

  return { survivors, eliminated };
}

/**
 * An explicit primary/secondary/able grant on the work-type overrides the
 * role-lane heuristic — capability authorship is the stronger signal.
 */
function hasExplicitGrant(cap: CapabilityVector, workType: string): boolean {
  return cap.content.workTypes.some(
    (w) => parseSubtype(w.type).parent === workType && w.proficiency !== 'never',
  );
}

/**
 * Universal test capability (Alperen decision, taxonomy §4): every
 * Write-authorized agent carries implicit code-test competence — code-test is
 * never a coverage gap for a writer.
 */
function isImplicitDeliverable(cap: CapabilityVector, type: string): boolean {
  return type === 'code-test' && cap.positional.writeAuthority;
}
