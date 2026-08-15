// src/core/closure-ledger-types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Typed event union for the Closure OS append-only sidecar decision-ledger
// (§12.1 rev-2). This is the COMPILE-TIME CONTRACT for the phase-5 writer and any
// TypeScript reader — it is NOT a runtime validator. The single runtime validator
// is scripts/closure-ledger/canonical.mjs + scripts/lint-closure-dispositions.mjs
// (one validator, never re-implemented here).
//
// The literal enums below mirror src/core/closure-classification-schema.json (the
// SSOT). tests/governance/schema-sync.test.ts asserts they equal the schema
// arrays, so they cannot silently drift. Decision payloads are a discriminated
// union PER KIND (§12.1 requires typed-per-kind, never a generic from/to pair).
// ─────────────────────────────────────────────────────────────────────────────

export const LEVELS = ['outcome', 'package', 'task', 'check-proof', 'finding'] as const;
export const LANES = ['contract', 'runtime', 'desktop', 'terminal', 'proof'] as const;
export const HOLD_LANE = 'hold-unassigned' as const;
export const PRIORITIES = ['P0', 'P1', 'P2'] as const;
export const ADMISSION_DISPOSITIONS = [
  'child-proof-under-committed-outcome',
  'separate-committed-outcome',
  'discovery',
  'future-deferred',
  'duplicate-superseded-disposed',
  'hold',
] as const;
export const DECISION_KINDS = [
  'level-lane-disposition',
  'priority-retriage',
  'admission',
  'born-promotion',
  'supersede',
  'revoke',
] as const;
export const CONFIDENCE = ['high', 'medium', 'low'] as const;

export type Level = (typeof LEVELS)[number];
export type Lane = (typeof LANES)[number] | typeof HOLD_LANE;
export type Priority = (typeof PRIORITIES)[number];
export type AdmissionDisposition = (typeof ADMISSION_DISPOSITIONS)[number];
export type DecisionKind = (typeof DECISION_KINDS)[number];
export type Confidence = (typeof CONFIDENCE)[number];

/** rowRef binds an event to a MASTER row identity by THREE parts (§12.1): the
 *  stable work id, the row's definition digest (from identityRegistry), and the
 *  MASTER source digest. All three are required — 2/3 is not the contract. */
export interface RowRef {
  workId: string;
  rowDefinitionDigest: string;
  masterSourceDigest: string;
}

/** Owner authority proof — an actor string is insufficient (§12.1). Each event
 *  carries an authenticated owner decision-receipt reference; authority that
 *  cannot be resolved → typed HOLD (no canonical promotion, no fabricated ref). */
export interface AuthorityProof {
  ownerReceipt: string;
}

/** Decision = typed union PER KIND (§12.1). */
export type Decision =
  | { kind: 'level-lane-disposition'; level: Level; lane: Lane; ruleId: string; confidence: Confidence }
  | { kind: 'priority-retriage'; fromPriority?: Priority; toPriority: Priority }
  | { kind: 'admission'; disposition: AdmissionDisposition; parentOutcomeId?: string }
  | { kind: 'born-promotion'; promotedTo: 'committed-outcome'; outcomeId?: string }
  | { kind: 'supersede'; targetSeq: number; reason: string }
  | { kind: 'revoke'; targetSeq: number; reason: string };

/** One append-only, hash-chained ledger event. eventDigest covers every field
 *  except itself (see schema.canonicalEncoding.coveredFields). */
export interface ClosureDispositionEvent {
  schemaVersion: number;
  seq: number;
  eventId: string;
  recordedAt: string;
  rowRef: RowRef;
  decision: Decision;
  authorityProof: AuthorityProof;
  evidenceRefs?: string[];
  supersedesSeq?: number;
  previousEventDigest: string;
  eventDigest: string;
}

/** decisionClass of a kind (matches schema.decisionClasses.map). Used by the gate
 *  for the per-(row, class) active-exclusivity check and the admission→promotion
 *  ordering invariant. */
export type DecisionClass = 'classification' | 'priority' | 'admission' | 'promotion' | 'correction';
