import type { RequestMeasurementEvent } from './events.js';
import type { ProviderAdapter, ProviderContextIdentity, ProviderUsage, RequestMeasurement } from './provider-tooluse/types.js';
import type { ReferenceDigestPhase, ReferenceDigestProgress, ReferenceInvalidReason, ReferenceSnapshot, ReferenceOutline, ReferenceRange, ReferenceFailureCode } from './reference-digest-types.js';
import type { ReferenceJournalIdentity } from './reference-digest-journal.js';
import type { SessionToolContentStore } from './session-tool-content.js';
import type { ScratchStoreInfo } from './scratch-checkpoint.js';

export interface DigestCitation extends ReferenceRange { sectionId: string }
export interface DigestClaim { text: string; citations: DigestCitation[] }
export interface DigestPayload {
  claims: DigestClaim[];
  decisions: string[];
  entities: string[];
  openQuestions: string[];
  contradictions: string[];
  lossNotes: string[];
}
export interface DigestNode {
  schemaVersion: 1;
  nodeId: string;
  sourceDigest: string;
  childRefs: string[];
  coverage: DigestCitation[];
  payload: DigestPayload;
  requestId: string;
  descriptorDigest: string;
  createdAt: string;
}
/** Resolved ceilings, already narrowed by the enclosing native turn's remaining budget. */
export interface ReferenceDigestPolicy {
  maxSourceBytes: number;
  maxRequests: number;
  maxDepth: number;
  maxWallTimeMs: number;
  maxTotalTokens: number;
  maxMapOutputTokens: number;
  maxReduceOutputTokens: number;
  maxResponseBytes: number;
  maxItems: number;
  maxTextBytes: number;
  finalAnswerReserveTokens: number;
  contextSafetyReserveTokens: number;
  concurrencyCap: number;
  providerConcurrency: number;
  tenantConcurrency: number;
  measurementTimeoutMs: number;
}
/**
 * 7113-E-DIAGNOSTICS — why a rejected response was rejected. Optional and
 * additive: a journal written before this field simply has none, and such a
 * record reads back as `unknown` (never a synthesized reason). No raw response
 * text and no hidden reasoning is stored — only sizes, digests and the
 * provider's own stop reason.
 */
export interface DigestRequestDiagnostics {
  /** `unknown` only if a throw site somehow carried no reason: never guessed. */
  readonly invalidReason: ReferenceInvalidReason | 'unknown';
  /** Bytes of response text the provider actually streamed, cap or not. */
  readonly responseBytes: number;
  /** sha256 of the FULL streamed text — never the capped, retained slice. */
  readonly responseSha256: string;
  /** Bytes actually retained for validation (<= the response byte cap). */
  readonly retainedBytes: number;
  /** The provider's stop reason when it reported one. */
  readonly stopReason?: string;
}

/**
 * 7113-E D0 — where a request's wall time actually went.
 *
 * Two clocks, on purpose. `startedAtEpochMs` is EVIDENCE (a wall-clock instant
 * a reader can line up with a PTY capture); the phase durations come from a
 * MONOTONIC source, because wall clocks jump and a resumed program runs in a
 * different process whose epoch cannot be subtracted from this one.
 *
 * `processId` marks which run produced these numbers, so a reader never
 * subtracts across two of them. A record written before this existed has no
 * timing at all: that is UNKNOWN, and it is never rendered as zero.
 */
export interface DigestRequestTiming {
  /** Wall-clock instant the request began. Evidence only, never subtracted. */
  readonly startedAtEpochMs: number;
  /** Identifies the run that measured these durations. */
  readonly processId: string;
  /** Prompt measurement (apply-template + tokenize), monotonic ms. */
  readonly measureMs?: number;
  /** Journal write + ledger reservation, monotonic ms. */
  readonly reserveMs?: number;
  /** First byte of the provider stream, monotonic ms from dispatch. */
  readonly firstByteMs?: number;
  /** Whole provider stream until its last event, monotonic ms. */
  readonly streamMs?: number;
  /** Usage persistence + ledger settle, monotonic ms. */
  readonly settleMs?: number;
  /** Interim only: hand-off accepted by the consumer, monotonic ms. */
  readonly deliverMs?: number;
  /**
   * Did the request reach the end of its phases?
   *
   * `complete` — every phase finished and its duration is final.
   * `interrupted` — the request stopped mid-flight (deadline, cancel, transport
   * failure). The durations present are REAL up to that instant; the phases
   * that never finished are simply ABSENT, never given a made-up total. This
   * matters most for the longest request in a run, which is exactly the one a
   * deadline cuts and the one a latency question is about.
   */
  readonly status?: 'complete' | 'interrupted';
  /** Why an interrupted request ended. Typed, never a guess. */
  readonly endedReason?: 'deadline' | 'cancelled' | 'stream-failed' | 'usage-unconfirmed';
  /** Monotonic ms from dispatch to the interruption, when it was interrupted. */
  readonly interruptedAfterMs?: number;
}

export interface DigestRequestRecord {
  nodeId: string;
  attempt: number;
  /** 7113-E B-2 — `reference-interim` is a THIRD purpose, never folded into
   *  map/reduce: it is a real answer to the user, not coverage work, and both
   *  the durable record and the host projection must be able to tell them
   *  apart (billable usage still attaches to the same ledger). */
  purpose: 'reference-map' | 'reference-reduce' | 'reference-interim';
  measurement: RequestMeasurement;
  outputCeilingTokens: number;
  status: 'reserved' | 'received' | 'invalid';
  /** 7113-E D0 — absent means UNKNOWN (legacy record), never zero. */
  timing?: DigestRequestTiming;
  usage?: ProviderUsage;
  nodeRef?: string;
  /** Present only on `status: 'invalid'` records written by this version. */
  diagnostics?: DigestRequestDiagnostics;
}

/** Stable key of one partition part inside `mapPartitionDepths`. */
export function partitionDepthKey(part: Pick<DigestCitation, 'sectionId' | 'byteStart' | 'byteEnd'>): string {
  return `${part.sectionId}\u0000${part.byteStart}-${part.byteEnd}`;
}

/**
 * Split depth of a recorded part. A journal written before the depth field
 * carries none, so the depth is DERIVED from real recorded sizes instead of
 * being assumed zero: every split halves a range, so a part that is 2^n times
 * smaller than its section took at least n splits. Nothing is invented — the
 * section range comes from the immutable outline.
 */
export function partitionDepth(
  part: Pick<DigestCitation, 'sectionId' | 'byteStart' | 'byteEnd'>,
  sectionBytes: number,
  recorded: Readonly<Record<string, number>> | undefined,
): number {
  const stored = recorded?.[partitionDepthKey(part)];
  if (typeof stored === 'number' && Number.isSafeInteger(stored) && stored >= 0) return stored;
  const partBytes = part.byteEnd - part.byteStart;
  if (partBytes <= 0 || sectionBytes <= 0 || partBytes >= sectionBytes) return 0;
  return Math.max(0, Math.ceil(Math.log2(sectionBytes / partBytes)));
}

/** The recorded sub-reason, or `unknown` for a record written before 7113-E.
 *  A missing field is never filled in with a guess. */
export function referenceInvalidReason(record: Pick<DigestRequestRecord, 'status' | 'diagnostics'>): ReferenceInvalidReason | 'unknown' {
  if (record.status !== 'invalid') return 'unknown';
  return record.diagnostics?.invalidReason ?? 'unknown';
}
export interface DurableReferenceJournal {
  identity: ReferenceJournalIdentity;
  /** Includes the exact outline, effective limits and task instruction; identity data is not authorization. */
  planDigest: string;
  startedAt: number;
  phase: ReferenceDigestPhase;
  requests: Record<string, DigestRequestRecord>;
  mapPartitions: Record<string, DigestCitation[]>;
  /** 7113-E — durable split depth per partition part, keyed by
   *  `sectionId\u0000byteStart-byteEnd`. Without it a restart re-entered the
   *  subdivision at depth 0 and could halve past `maxDepth` (Astra repro
   *  2026-09-10T02:07Z: 64 B / maxDepth 2 reached 16 B, then 4 B on resume).
   *  Absent for journals written before this field; see `partitionDepth`. */
  mapPartitionDepths?: Record<string, number>;
  completedNodeRefs: Record<string, string>;
  settledRequestIds: string[];
  failure?: ReferenceFailureCode;
}
/** C must bind this to the SAME durable native-turn accounting service. Both operations
 * MUST be idempotent by requestId: replay after a crash between sink and journal is legal. */
export interface ReferenceUsageLedger {
  reserve(requestId: string, input: { inputTokens: number; outputTokens: number; rounds: 1 }): Promise<boolean>;
  settle(requestId: string, usage: ProviderUsage): Promise<void>;
}
/** Why no interim answer was produced at an opportunity. Typed, never silent. */
export type ReferenceInterimSkip =
  /** Host policy said no (cadence not reached, or the per-turn ask budget is spent). */
  | 'not-due'
  /** The remaining request/token/time budget cannot admit one more call. */
  | 'budget-refused'
  /** A prior reservation for THIS exact request has no confirmed usage: replaying
   *  it would bill the user twice for an answer we cannot prove was produced. */
  | 'unconfirmed-reservation'
  /** The model returned nothing substantive; narration is never a delivery. */
  | 'empty-answer'
  /** The response breached the stream contract (tool call, hidden reasoning,
   *  oversize, non-stop finish) or reported spend beyond its reservation. */
  | 'invalid-answer'
  /** A previous breach closed this seam for the rest of the program. */
  | 'seam-closed'
  /** The turn was cancelled or the program deadline passed. */
  | 'stopped';

/**
 * 7113-E B-2 — the host seam for a REAL interim answer during a long reference
 * program.
 *
 * The runner owns the dispatch slot, the ledger and the deadline, so it makes
 * the call; the HOST owns policy (cadence, per-turn ask budget) and delivery
 * (session output, transcript, the delivered counter). Neither side guesses the
 * other's job, and no content is invented: the only input is a digest payload
 * this program already validated against the source byte ranges.
 */
export interface ReferenceInterimCapability {
  /**
   * Consume one interim opportunity. `true` means the host's policy owes an
   * answer NOW and has charged its own per-turn request budget for it, so the
   * runner may spend one provider call. Called at most once per verified node.
   */
  claim(): boolean;
  /** Host-authored instruction for the answer (no strings live in the runner). */
  readonly instruction: string;
  /** Output ceiling for the interim answer. Comes out of the same token budget. */
  readonly outputCeilingTokens: number;
  /**
   * Hand the produced answer to the real session surface. The host counts a
   * delivery only after the text actually reaches output AND the transcript.
   */
  deliver(input: {
    readonly text: string;
    readonly usage: ProviderUsage;
    readonly requestId: string;
    readonly coverage: readonly DigestCitation[];
    readonly coveredBytes: number;
    readonly sourceBytes: number;
  }): Promise<void>;
  /** Why an opportunity produced nothing. Reporting only; never fabricates. */
  skipped(reason: ReferenceInterimSkip): void;
}

export interface ReferenceDigestInput {
  snapshot: ReferenceSnapshot;
  outline: ReferenceOutline;
  adapter: ProviderAdapter;
  context: ProviderContextIdentity;
  identity: ReferenceJournalIdentity;
  policy: ReferenceDigestPolicy;
  /** Immutable host prompt + active user intent, never source-authored instructions. */
  instruction: string;
  contentStore: SessionToolContentStore;
  scratch: ScratchStoreInfo;
  ledger: ReferenceUsageLedger;
  signal?: AbortSignal;
  /**
   * 7113-E B-2 — the USER's turn signal, unmixed.
   *
   * `signal` is a COMPOSED signal: the caller folds its own program deadline
   * into the turn's abort before handing it over. Both arrive as "aborted", so
   * the runner used to attribute its own 150 s exhaustion to the user and wrote
   * `CANCELLED` into the durable journal (measured 2026-09-10T04:09Z). When the
   * caller supplies this, cancellation attribution reads the user's signal
   * alone: own exhaustion is REFERENCE_DEADLINE, a real abort is
   * REFERENCE_CANCELLED. Absent, behaviour is exactly as before.
   */
  userSignal?: AbortSignal;
  /** 7113-E B-2 — absent means the program behaves exactly as before. */
  interim?: ReferenceInterimCapability;
  onNodePersist?: (ref: string) => Promise<void>;
  /** 7113 D — host progress at every REAL transition (journal phase, request
   *  reserve, settled usage, persisted node, typed failure). Never model text,
   *  never a prediction; the view throttles rendering, this stream does not
   *  withhold facts. Must not throw: a view fault cannot fail the program. */
  onDigestProgress?: (progress: ReferenceDigestProgress) => void;
  onMeasurement?: (event: RequestMeasurementEvent & { requestId: string }) => void;
}
export interface ReferenceDigestResult {
  /**
   * 7113-E B-2 rev2 — interim requests whose usage could not be resolved.
   *
   * Coverage completeness and COST completeness are separate facts. A finished
   * reading (`ANSWERING`) with an unresolved reservation is NOT a closed cost
   * truth, so this rides the result to the outer settlement as an open hold,
   * independently of whether a later opportunity was ever claimed.
   */
  unresolvedInterimUsage?: readonly string[];
  phase: 'ANSWERING' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  journalRef: string;
  rootRef?: string;
  coveredRanges: DigestCitation[];
  missingRanges: ReferenceRange[];
  usage: { inputTokens: number; outputTokens: number };
  requests: number;
  failure?: ReferenceFailureCode;
}
