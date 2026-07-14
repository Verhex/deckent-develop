/**
 * adr-constraints.ts — PCOMP-6 D4.5: machine-readable constraints for
 * high-value accepted ADRs (ADR-G-019 Amendment, 2026-07-14).
 *
 * ONE source, THREE consumers:
 *   1. planner prompts (buildPlanPrompt + buildZeroConfigPlanPrompt) render
 *      the `plannerSummary` lines as a binding block — a task that would
 *      contradict an ADR dies before it is born;
 *   2. prompt-lint W7 (`adr-constraint-violation`) scans each planned task's
 *      title/description/goCriteria against `forbiddenPattern` at spawn time;
 *   3. the existing worker ADR injection stays the LAST line of defence.
 *
 * Live trigger (sprint-440, task 440-001): a spec demanded
 * `intent.primary='test'`, violating ADR-G-023 — caught only by a mid-sprint
 * worker NO_GO, the most expensive possible point. Defence-in-depth decision:
 * shift left.
 *
 * Keep this table SMALL and high-value (revisit selection once it grows past
 * ~10 records — see the amendment's roadmap: DB-schema migration + relevance
 * selection). Every record's `adrId` must exist as an ACCEPTED ADR — pinned
 * by a governance test.
 */

export interface AdrConstraint {
  /** Accepted ADR this constraint is derived from (lowercase doc id). */
  readonly adrId: string;
  /** One-line, planner-facing statement of the binding rule (English — model-facing text
   *  is EN-only per the PCOMP-8 U3 language unification, Alperen 2026-07-14). */
  readonly plannerSummary: string;
  /** A task whose title/description/goCriteria matches this pattern violates the ADR. */
  readonly forbiddenPattern: RegExp;
  /** Human message shown in lint findings. */
  readonly message: string;
}

export const ADR_CONSTRAINTS: readonly AdrConstraint[] = [
  {
    adrId: 'adr-g-023',
    plannerSummary:
      "ADR-G-023: 'testing' is NOT a primary intent — test-authorship work is classified as the 'implementation' intent plus the 'test-coverage' TAG; do NOT produce a task demanding intent.primary='test'.",
    forbiddenPattern: /intent\.primary\s*(?:=|:|==|===)?\s*(?:literal\s+)?['"`]?(?:test|testing)\b/i,
    message:
      "demands an intent.primary='test|testing' value — ADR-G-023 retired 'testing' as a primary intent (use the test-coverage tag mechanism)",
  },
  {
    adrId: 'adr-d-002',
    plannerSummary:
      'ADR-D-002 (hermeticity): do NOT direct spawnSync usage in test/verify steps — async spawn is mandatory; do not produce a task that asks for spawnSync.',
    forbiddenPattern: /\b(?:use|kullan|add|ekle|çağır|cagir)\w*\s+spawnSync\b|spawnSync\s+kullan/i,
    message:
      'asks for spawnSync usage — the hermeticity contract (ADR-D-002 family) mandates async spawn; spawnSync blocks the event loop and is ratcheted',
  },
  {
    adrId: 'adr-g-035',
    plannerSummary:
      'ADR-G-035 (memory architecture): persistence = the better-sqlite evolution path (+optional sqlite-vec); a Postgres/external-vector-DB migration was REJECTED — do not produce a task proposing or requesting such a migration.',
    forbiddenPattern: /\b(?:migrate|move|geç|gec|switch)\w*\s+(?:to\s+)?(?:postgres|postgresql|pinecone|weaviate|qdrant)\b|postgres(?:ql)?['"`\s]*(?:'e|e)\s*geç/i,
    message:
      'proposes a Postgres/external-vector-DB migration — ADR-G-035 fixed persistence on the better-sqlite evolution path',
  },
];

/**
 * Render the binding-constraints block for planner prompts. Pure; returns ''
 * when the table is empty so callers can interpolate unconditionally.
 */
export function buildAdrConstraintsPlannerBlock(): string {
  if (ADR_CONSTRAINTS.length === 0) return '';
  const lines = ADR_CONSTRAINTS.map((c) => `- ${c.plannerSummary}`);
  return `\nBINDING ADR CONSTRAINTS (do NOT produce a task that violates these; if one seems necessary, write an amendment-proposal note instead of the task):\n${lines.join('\n')}\n`;
}
