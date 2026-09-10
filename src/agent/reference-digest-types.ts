/** 7113 A: host-owned foundation. Reference bytes are data, never instruction authority. */
export interface ReferenceScope {
  readonly tenantId: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly policyDigest: string;
}
export interface ReferenceAttachment {
  readonly path: string;
  readonly sourceDigest: string;
  readonly bytes: number;
  readonly disposition: 'inline' | 'digest-required';
}
export interface ReferenceSnapshotV1 {
  readonly schemaVersion: 1;
  readonly scope: ReferenceScope;
  readonly sourceAuthority: 'reference-data';
  readonly sourceDigest: string;
  readonly bytes: number;
  readonly encoding: 'utf-8';
  readonly createdAt: string;
  /** Session-store opaque identity. Host only; never interpolate a filesystem path. */
  readonly snapshotRef: string;
}
export interface ReferenceSnapshot {
  readonly metadata: ReferenceSnapshotV1;
  /** Complete, ordered immutable source bytes. Must fail on expired or changed custody. */
  stream(signal?: AbortSignal): AsyncIterable<Uint8Array>;
}
export interface ReferenceRange { readonly byteStart: number; readonly byteEnd: number }
export interface ReferenceOutlineNode extends ReferenceRange {
  readonly sectionId: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly headingPath: readonly string[];
  readonly continuation: boolean;
  /** Repeated table header context is not counted as new source coverage. */
  readonly context: readonly ReferenceRange[];
}
export interface ReferenceOutline {
  readonly partitionVersion: 1;
  readonly sourceDigest: string;
  readonly sourceBytes: number;
  readonly nodes: readonly ReferenceOutlineNode[];
}
export type ReferenceDigestPhase = 'ADMITTING' | 'SNAPSHOTTING' | 'MAPPING' | 'REDUCING' | 'ANSWERING' | 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
/** Every typed failure this program can end with. Exported as a value so the
 *  view can prove it localizes ALL of them (7113 D) — the union stays derived
 *  from this one list, so a new code cannot slip in unlocalized. */
export const REFERENCE_FAILURE_CODES = [
  'REFERENCE_SCOPE_REFUSED', 'REFERENCE_SOURCE_CHANGED', 'REFERENCE_SOURCE_UNSUPPORTED',
  'REFERENCE_ENCODING_INVALID', 'REFERENCE_SOURCE_TOO_LARGE', 'REFERENCE_BUDGET_INVALID', 'REFERENCE_CANCELLED',
  'REFERENCE_BUDGET_INSUFFICIENT', 'REFERENCE_OUTPUT_INVALID', 'REFERENCE_USAGE_UNCERTAIN',
  'REFERENCE_THINKING_CONTROL_UNAVAILABLE', 'REFERENCE_STRUCTURED_OUTPUT_UNAVAILABLE',
  'REFERENCE_PROVIDER_FAILED', 'REFERENCE_DEADLINE',
  'REFERENCE_STORE_FAILED', 'REFERENCE_RANGE_INVALID', 'REFERENCE_JOURNAL_MISMATCH',
] as const;
export type ReferenceFailureCode = typeof REFERENCE_FAILURE_CODES[number];
/**
 * 7113 D — the host's progress projection for one reference-digest program.
 * Every field is derived from the durable journal, the outline, the settled
 * usage ledger or the host clock; nothing here is read from model output.
 * An OPTIONAL field means UNKNOWN at this instant and must render as unknown —
 * never as zero (deckent-agentic-ux: unknown, stale, unavailable and failed
 * are different states).
 */
export interface ReferenceDigestProgress {
  /** Durable journal phase — the authoritative state, not a view guess. */
  readonly phase: ReferenceDigestPhase;
  /** Referenced path exactly as the user wrote it; the host adds it, not the model. */
  readonly sourcePath?: string;
  /** Source size. BYTES — a separate unit that is never mixed with tokens. */
  readonly sourceBytes: number;
  readonly sourceDigest: string;
  /** Source bytes actually read and hashed so far (the pre-map verification pass). */
  readonly observedBytes?: number;
  /** Outline sections carrying at least one verified digest node / total sections. */
  readonly sections?: { readonly covered: number; readonly total: number };
  /** Union of verified coverage, in source bytes. */
  readonly coveredBytes: number;
  /** Verified child requests by purpose plus the resolved request ceiling. */
  /** Issued child requests by purpose plus the resolved ceiling. `interim` is a
   *  REAL answer to the user, never folded into map/reduce coverage work. */
  readonly requests: { readonly map: number; readonly reduce: number; readonly interim: number; readonly cap: number };
  /** 7113-E B-2 rev3 — interim requests whose usage was never reconciled.
   *  Coverage completeness and COST completeness are separate facts: a finished
   *  reading with entries here is NOT a closed cost truth. */
  readonly unresolvedInterimUsage?: readonly string[];
  /** Provider-reported usage of SETTLED child requests only. A reserved but
   *  unspent amount is never shown as spent. */
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  /** What the finished digest costs the parent turn — known only once it exists. */
  readonly retained?: { readonly digestTokens: number; readonly capTokens: number; readonly windowTokens: number };
  /** Remaining wall time of this program under the host deadline. */
  readonly deadlineRemainingMs: number;
  /** Durable journal identity, once the journal is open. */
  readonly journalRef?: string;
  /** Last typed failure recorded for this program. */
  readonly failure?: ReferenceFailureCode;
  /** Host clock (epoch ms) at which this program started — the age the user
   *  reads on the Workline is measured from here, not from the projection. */
  readonly startedAtMs: number;
  /** Host clock (epoch ms) at which this projection was computed. */
  readonly updatedAt: number;
}

/**
 * 7113-E-DIAGNOSTICS — WHY one child response was rejected. `REFERENCE_OUTPUT_INVALID`
 * is produced by two different seams (the stream itself and the payload schema)
 * and the durable journal could not tell them apart, so a real failure
 * (2026-09-10T01:28Z attempt eed7045eabcb, 2 of 5 sections lost) could not be
 * diagnosed afterwards. These sub-reasons are recorded; the raw response text
 * and any hidden reasoning are NEVER persisted.
 */
export const REFERENCE_INVALID_REASONS = [
  // Stream-level: the response never became a candidate payload.
  'stream-missing-done',
  'stream-tool-call',
  'stream-reasoning',
  'stream-oversize',
  'stream-non-stop',
  // Payload-level: a candidate arrived and failed the schema contract.
  'payload-oversize',
  'payload-json-parse',
  'payload-schema-keys',
  'payload-string',
  'payload-array',
  'payload-citation-range',
  'payload-no-citation',
  'payload-empty',
] as const;
export type ReferenceInvalidReason = typeof REFERENCE_INVALID_REASONS[number];

export class ReferenceDigestError extends Error {
  /** `invalidReason` is set only for REFERENCE_OUTPUT_INVALID; it never changes
   *  the outer typed code or the honest PARTIAL disposition. */
  constructor(readonly code: ReferenceFailureCode, readonly invalidReason?: ReferenceInvalidReason) {
    super(code);
    this.name = 'ReferenceDigestError';
  }
}
export function assertReferenceActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReferenceDigestError('REFERENCE_CANCELLED');
}
