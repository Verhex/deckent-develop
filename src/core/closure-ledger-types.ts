// src/core/closure-ledger-types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Typed event union for the Closure OS append-only sidecar decision-ledger
// (§12.1 rev-2). This is the COMPILE-TIME CONTRACT for the phase-5 writer and any
// TypeScript reader — it is NOT a runtime validator. The single runtime validator
// is scripts/closure-ledger/canonical.mjs + scripts/lint-closure-dispositions.mjs
// (one validator, never re-implemented here).
//
// The literal enums + ROWREF_FIELDS below mirror src/core/closure-classification-schema.json
// (the SSOT). The TS↔schema exact-equality drift-guard in
// tests/governance/closure-ledger.test.ts asserts they equal the schema arrays
// (incl. rowRef.requiredFields), so they cannot silently drift. Decision payloads are a
// discriminated union PER KIND (§12.1 requires typed-per-kind, never a generic from/to pair).
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
// FOUR-part rowRef identity — mirrors schema.rowRef.requiredFields (SSOT). The
// TS↔schema exact-equality drift-guard pins this against the schema, and the gate
// resolves ALLOWED_ROWREF from the same SSOT, so all three stay aligned.
export const ROWREF_FIELDS = ['workId', 'rowDefinitionDigest', 'masterSourceDigest', 'batchManifestDigest'] as const;

export type Level = (typeof LEVELS)[number];
export type Lane = (typeof LANES)[number] | typeof HOLD_LANE;
export type Priority = (typeof PRIORITIES)[number];
export type AdmissionDisposition = (typeof ADMISSION_DISPOSITIONS)[number];
export type DecisionKind = (typeof DECISION_KINDS)[number];
export type Confidence = (typeof CONFIDENCE)[number];

/** rowRef binds an event to a MASTER row identity AND its immutable batch by FOUR
 *  parts (§12.1 rev-2 + phase-4.1 batch-snapshot binding): the stable work id, the
 *  row's definition digest (from identityRegistry), the MASTER source digest, and
 *  the batch manifest digest. All FOUR are required and non-empty — this exactly
 *  mirrors schema.rowRef.requiredFields / ROWREF_FIELDS, and the runtime gate
 *  enforces the same (ROWREF_INCOMPLETE on a missing field, UNKNOWN_FIELD on an
 *  extra one). Keep this interface, ROWREF_FIELDS, and the schema in lockstep. */
export interface RowRef {
  workId: string;
  rowDefinitionDigest: string;
  masterSourceDigest: string;
  batchManifestDigest: string;
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
