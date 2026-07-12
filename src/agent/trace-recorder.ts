// src/agent/trace-recorder.ts
// ═══ Trace recorder (SP-2) ══════════════════════════════════════════════════
// Maps a native-agent ProviderMessage[] transcript into an OpenAI-messages
// training example (the unsloth/LLaMA-Factory tool-calling SFT shape) and
// appends it as one JSONL line. Local-only (.deckent/traces/, gitignored);
// nothing is uploaded. The ProviderMessage shape is ALREADY the OpenAI
// round-trip shape (M2) — this is a thin, pure mapping + an fs append.

import { appendFileSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProviderMessage } from './provider-tooluse/types.js';
import type { LogEvent } from '../core/log-event.js';
import { redactSensitive } from '../core/redact-sensitive.js';
import {
  appendManifestDelta,
  parseManifestDelta,
  projectTranscript,
  readManifest,
  segmentFileName,
  stableRecordId,
  TRACE_SCHEMA_VERSION,
  type TelemetryEvent,
  type TraceSegmentEntry,
  type WorkerPrompt,
} from '../core/trace-schema.js';

export interface TraceMeta {
  source: string;
  model: string;
  ts: string;
  /** TRN-1 sprint-worker task-labeling — omitted by the native-REPL source. */
  taskId?: string;
  sprintId?: string;
  agent?: string;
  selfAssessment?: string;
  /** born-614: worker's own claim alongside the Brain verdict (honesty-gap signal). */
  workerSelfAssessment?: string;
  /** born-637 (TRACE-CONTENT-PARITY): marks a MINIMAL single-message reconstruction
   *  parsed out of a CLI's final result envelope, used when a sprint worker's
   *  structured JSONL log carried zero LogEvent rows (see
   *  orchestra/output-collector.ts recordSprintWorkerTrace). Omitted for a full
   *  LogEvent-derived transcript — a training consumer filters/weights a partial
   *  reconstruction differently via this field's presence. */
  contentSource?: 'envelope-fallback';
  /** TT551 (FIX-PHASE-TRACE) — attempt index (1..n): 1 is the original worker,
   *  ≥2 is a FIX re-run. Additive; omitted by the attempt-1 EVALUATE wire and
   *  the native-REPL source. */
  attempt?: number;
  /** TT551 — the ORIGINAL taskId this trace is a retry of (the fix task's
   *  `fixForTaskId`). Omitted for a first-attempt / non-retry trace. */
  retryOf?: string;
  /** TT551 — what this trace IS relative to the work-item: 'original' (first
   *  attempt or NOT_DISPATCHED re-dispatch), 'fix' (a NO_GO→FIX re-run), or
   *  'xfix' (a fix-of-a-fix). Omitted by the attempt-1 EVALUATE wire. */
  purpose?: 'original' | 'fix' | 'xfix';
  /** TT551 — the FIX-phase Brain evaluation verdict, NO_GO INCLUDED. The field
   *  that de-biases the corpus: EVALUATE-only recording captured ~0 NO_GO labels
   *  because fix-attempt + intermediate-NO_GO verdicts went unrecorded. Carried
   *  explicitly (alongside `selfAssessment`) so a training consumer can filter
   *  fix-phase verdicts. */
  verdict?: string;
  /** TT552 (TRACE-V2) — record-format discriminator mirrored into meta so a
   *  meta-only reader (training/pipeline.ts parseTraceLine) can tell v1 from v2.
   *  Absent ⇒ legacy v1. Populated ONLY on the v2 projection path. */
  schemaVersion?: number;
  /** TT552 — the record is corpus-OUT (incomplete/promptless/orphan-bearing).
   *  A quarantined record must never silently reach the training set; the
   *  pipeline skips it. Populated ONLY on the v2 path. */
  quarantine?: boolean;
  /** TT552 — why the record was quarantined (e.g. 'no-prompt',
   *  'orphan-tool-result', 'no-conversation'). Populated ONLY on the v2 path. */
  quarantineReasons?: string[];
  /** born-662 (TRSEG) — the record's STABLE, position-independent id
   *  (`stableRecordId`: sprint·task·attempt·fix-purpose). Stamped by
   *  `appendTraceSegment` on the sprint-partitioned segment path; a citation of
   *  it survives compaction/re-ordering (unlike a line number). Absent on the
   *  legacy single-file path — additive, so every existing reader is unaffected. */
  recordId?: string;
}
export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  /** TT552 (TRACE-V2) — source LogEvent.seq/ts provenance, carried by the v2
   *  projection (the v1 mapping dropped them). Optional + set ONLY on the v2
   *  path, so every v1 message stays byte-identical (field simply absent). The
   *  ShareGPT projection ignores them, so training output is unaffected. */
  seq?: number;
  ts?: string;
}
export interface TrainingExample {
  messages: OpenAiMessage[];
  meta: TraceMeta;
  /** TT552 (TRACE-V2) — top-level record-format version. Absent ⇒ legacy v1. */
  schemaVersion?: number;
  /** TT552 — TELEMETRY-SIDECAR: raw-stream telemetry (turn/usage/lifecycle/
   *  stderr) split OUT of `messages`, retained seq/ts/type-only. The ShareGPT
   *  training projection never reads this field, so telemetry can never reach
   *  the training set. Present ONLY on v2 records. */
  telemetry?: TelemetryEvent[];
}

/** Task-labeling context for a sprint-worker trace entry (TRN-1). */
export interface SprintTraceMeta {
  taskId: string;
  sprintId: string;
  agent: string;
  model: string;
  /** The GROUND-TRUTH outcome label. born-614 wiring passes Brain's final
   *  TaskEvaluation verdict here (not the worker's claim) — the pipeline's
   *  normalizeOutcome maps it to the training `outcome` label, and a label
   *  derived from a self-claim would poison the moat (feedback: trust Brain
   *  eval, not worker). */
  selfAssessment: string;
  /** The worker's OWN claim, kept alongside the Brain verdict (born-614) —
   *  the claim↔verdict delta is itself a training signal (honesty gap). */
  workerSelfAssessment?: string;
  /** TT551 (FIX-PHASE-TRACE) — attempt index (1..n); ≥2 is a FIX re-run. */
  attempt?: number;
  /** TT551 — the original taskId this is a retry of (fix task's fixForTaskId). */
  retryOf?: string;
  /** TT551 — trace purpose relative to the work-item. */
  purpose?: 'original' | 'fix' | 'xfix';
  /** TT551 — FIX-phase Brain verdict (NO_GO included) — de-biases the corpus. */
  verdict?: string;
  ts: string;
  /** TT552 (TRACE-V2) — opt-in signal from the sprint-worker caller
   *  (sprint-phases.ts) that this record must be emitted in the v2 schema
   *  (prompt-injected + telemetry-split + native tool_calls + quarantine).
   *  Absent/false ⇒ legacy v1 mapping (byte-identical to pre-TT552), which
   *  every existing direct caller/test relies on. */
  traceV2?: boolean;
  /** TT552 — the worker's real SYSTEM prompt (worker-contract + skills + persona
   *  + ADRs), injected as a `system` message on the v2 path. Absent ⇒ 'no-prompt'
   *  quarantine reason. */
  systemPrompt?: string;
  /** TT552 — the worker's real TASK prompt (`## Your Task` onward), injected as
   *  a `user` message on the v2 path. */
  taskPrompt?: string;
}

function toOpenAiMessage(m: ProviderMessage): OpenAiMessage {
  if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
    };
  }
  return { role: m.role, content: m.content };
}

/**
 * TT551 (FIX-PHASE-TRACE) — the additive FIX-phase label fields (attempt /
 * retryOf / purpose / verdict), each included ONLY when defined so a pre-TT551
 * trace (the attempt-1 EVALUATE wire, the native-REPL source) stays
 * byte-identical and every existing meta consumer (training/pipeline.ts
 * buildLabels reads only selfAssessment/agent/model) is unaffected. Shared by
 * BOTH sprint-worker example builders so the two mapping paths cannot drift.
 */
function additiveTraceLabels(meta: SprintTraceMeta): Partial<Pick<TraceMeta, 'attempt' | 'retryOf' | 'purpose' | 'verdict'>> {
  return {
    ...(meta.attempt !== undefined ? { attempt: meta.attempt } : {}),
    ...(meta.retryOf !== undefined ? { retryOf: meta.retryOf } : {}),
    ...(meta.purpose !== undefined ? { purpose: meta.purpose } : {}),
    ...(meta.verdict !== undefined ? { verdict: meta.verdict } : {}),
  };
}

/** Build a training example: a system message + the mapped transcript. */
export function toTrainingExample(system: string, transcript: ProviderMessage[], meta: TraceMeta): TrainingExample {
  return { messages: [{ role: 'system', content: system }, ...transcript.map(toOpenAiMessage)], meta };
}

/**
 * Map one structured JSONL `LogEvent` (the output-collector contract —
 * `OutputCollector.readLogEvents`) into an `OpenAiMessage`. A LogEvent stream
 * is a heterogeneous technical event log (turn/tool_use/tool_result/text/
 * stderr/usage/lifecycle), not a clean conversation, so this is a best-effort
 * mapping into the shared OpenAI-messages schema (`tool_result` -> role
 * 'tool', everything else -> role 'assistant'), not a full ProviderMessage
 * reconstruction. `ev.content` is redacted before being embedded (TRN-1: raw
 * secrets must never reach disk).
 */
function logEventToOpenAiMessage(ev: LogEvent): OpenAiMessage {
  const raw = typeof ev.content === 'string' ? ev.content : JSON.stringify(ev.content);
  const content = redactSensitive(raw);
  return ev.type === 'tool_result'
    ? { role: 'tool', content, tool_call_id: '' }
    : { role: 'assistant', content };
}

/**
 * Build a training example from a sprint worker's structured JSONL log
 * (TRN-1 — wires the output-collector JSONL contract into the trace-recorder).
 * `meta` carries the task-labeling (taskId/sprintId/agent/model/selfAssessment)
 * so a training consumer can filter/weight examples by outcome.
 */
export function toSprintTrainingExample(events: readonly LogEvent[], meta: SprintTraceMeta): TrainingExample {
  // TT552 (TRACE-V2) — the caller opts into the semantic v2 projection via
  // `traceV2`. Without it, the v1 mapping below runs byte-identical to pre-TT552
  // (every existing direct caller/test — trn1, trace-content-parity,
  // fix-phase-trace — passes no `traceV2`, so their asserted shape is preserved).
  if (meta.traceV2 === true) return toSprintTrainingExampleV2(events, meta);
  return {
    messages: events.map(logEventToOpenAiMessage),
    meta: {
      source: 'sprint-worker',
      model: meta.model,
      ts: meta.ts,
      taskId: meta.taskId,
      sprintId: meta.sprintId,
      agent: meta.agent,
      selfAssessment: meta.selfAssessment,
      ...(meta.workerSelfAssessment !== undefined
        ? { workerSelfAssessment: meta.workerSelfAssessment }
        : {}),
      ...additiveTraceLabels(meta),
    },
  };
}

/**
 * TT552 (TRACE-V2) — build the schema-v2 sprint-worker training example: the
 * real worker prompt injected as system/user turns, raw-stream telemetry split
 * into the `telemetry` sidecar (out of `messages`), native `tool_calls` on
 * assistant turns with each `tool_result` matched to its originating id (the
 * empty-id orphan class dies), source seq/ts carried, and the Read
 * double-representation unified. An incomplete/promptless/orphan-bearing
 * transcript is stamped `quarantine:true` (+ reasons) so it is corpus-OUT. The
 * projection itself is the pure `core/trace-schema.ts` layer.
 */
export function toSprintTrainingExampleV2(events: readonly LogEvent[], meta: SprintTraceMeta): TrainingExample {
  const prompt: WorkerPrompt = {
    ...(meta.systemPrompt !== undefined ? { system: meta.systemPrompt } : {}),
    ...(meta.taskPrompt !== undefined ? { task: meta.taskPrompt } : {}),
  };
  const projection = projectTranscript(events, prompt);
  const quarantined = projection.quarantineReasons.length > 0;
  return {
    schemaVersion: TRACE_SCHEMA_VERSION,
    messages: projection.messages,
    telemetry: projection.telemetry,
    meta: {
      source: 'sprint-worker',
      model: meta.model,
      ts: meta.ts,
      taskId: meta.taskId,
      sprintId: meta.sprintId,
      agent: meta.agent,
      selfAssessment: meta.selfAssessment,
      schemaVersion: TRACE_SCHEMA_VERSION,
      ...(meta.workerSelfAssessment !== undefined
        ? { workerSelfAssessment: meta.workerSelfAssessment }
        : {}),
      ...additiveTraceLabels(meta),
      ...(quarantined
        ? { quarantine: true, quarantineReasons: projection.quarantineReasons }
        : {}),
    },
  };
}

/**
 * born-637 (TRACE-CONTENT-PARITY envelope-fallback): build a MINIMAL training
 * example from a CLI's final result-envelope string, for use when the sprint
 * worker's structured JSONL log carried zero LogEvent rows (today: any
 * backend not yet stream-ported to the `writeLogEvent` contract — see
 * `orchestra/output-collector.ts` `recordSprintWorkerTrace`). No system
 * message (none is recoverable from a bare envelope) — the envelope's
 * `result` string becomes the sole assistant message, redacted like every
 * other trace message. `meta.contentSource` is always stamped
 * `'envelope-fallback'` so a training consumer can filter/weight this apart
 * from a full transcript ({@link toSprintTrainingExample}).
 */
export function toEnvelopeFallbackTrainingExample(envelopeResult: string, meta: SprintTraceMeta): TrainingExample {
  return {
    messages: [{ role: 'assistant', content: redactSensitive(envelopeResult) }],
    meta: {
      source: 'sprint-worker',
      model: meta.model,
      ts: meta.ts,
      taskId: meta.taskId,
      sprintId: meta.sprintId,
      agent: meta.agent,
      selfAssessment: meta.selfAssessment,
      contentSource: 'envelope-fallback',
      ...(meta.workerSelfAssessment !== undefined
        ? { workerSelfAssessment: meta.workerSelfAssessment }
        : {}),
      ...additiveTraceLabels(meta),
    },
  };
}

/** Append one example as a JSONL line (creates the dir + file as needed). */
export function appendTrace(filePath: string, example: TrainingExample): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(example) + '\n', 'utf-8');
}

/** Sub-directory (under a project's `.deckent/traces/`) holding the
 *  sprint-partitioned segments + their append-only manifest. */
export const TRACE_SEGMENTS_SUBDIR = 'segments';
/** The append-only manifest file inside {@link TRACE_SEGMENTS_SUBDIR}. */
export const TRACE_MANIFEST_FILE = 'manifest.jsonl';

/** Where {@link appendTraceSegment} placed a record + its stable id. */
export interface SegmentAppendResult {
  /** The sprint-partitioned segment file the record was appended to. */
  segmentPath: string;
  /** The append-only manifest a delta was recorded in. */
  manifestPath: string;
  /** The record's stamped stable id (also present as `example.meta.recordId`). */
  recordId: string;
}

/**
 * born-662 (TRSEG-WRITE) — append one training example to its SPRINT-PARTITIONED,
 * append-only segment under `<tracesDir>/segments/`, stamp a STABLE record-ID
 * (task/attempt/fix based — position-independent) into `meta.recordId`, and
 * record an append-only manifest delta. This is ADDITIVE to the legacy single
 * file ({@link appendTrace} → `sprint-worker.jsonl`): both coexist so existing
 * readers keep working (dual-read). The record's JSONL shape (v1/v2,
 * `schemaVersion`, `telemetry`) is preserved byte-for-byte apart from the
 * additive `meta.recordId` — the stamp is a shallow spread that leaves every
 * top-level field untouched, so the 552 schema cannot break.
 *
 * `tracesDir` is the project's `.deckent/traces/` directory (the caller resolves
 * it, mirroring `orchestra/output-collector.ts sprintTraceFilePath`). The
 * `segments/` subdir + manifest are created on demand.
 */
export function appendTraceSegment(tracesDir: string, example: TrainingExample): SegmentAppendResult {
  const sprintId = example.meta.sprintId ?? 'unknown';
  const recordId = stableRecordId({
    sprintId,
    taskId: example.meta.taskId ?? 'unknown',
    attempt: example.meta.attempt,
    purpose: example.meta.purpose,
  });
  const file = segmentFileName(sprintId);
  const segmentDir = join(tracesDir, TRACE_SEGMENTS_SUBDIR);
  const segmentPath = join(segmentDir, file);
  const manifestPath = join(segmentDir, TRACE_MANIFEST_FILE);

  // Additive stamp only — spread preserves top-level schemaVersion/telemetry
  // (v2) and every meta field, and does NOT mutate the caller's `example`.
  const stamped: TrainingExample = { ...example, meta: { ...example.meta, recordId } };

  appendTrace(segmentPath, stamped); // reuse the append-only JSONL writer
  appendManifestDelta(manifestPath, { sprintId, file, recordId, ts: example.meta.ts });
  return { segmentPath, manifestPath, recordId };
}

// ─── Retention + compaction (born-662 / TRSEG-RETAIN · 427-016 / Sıra-557) ────
// Steady state is append-only (`appendTraceSegment`). This section adds the ONE
// explicit MAINTENANCE pass a log-structured store needs: compaction (fold away
// redundancy — LOSSLESS) and retention (delete provably-old partitions — only
// above an explicit threshold, ALWAYS journaled). Both rewrite atomically via a
// sibling tmp file + `rename`, so a reader of the live path observes the whole
// old file until the rename commits, then the whole new file — never a torn
// write (POSIX `rename` is atomic within a filesystem; the tmp file is a sibling,
// so same fs).
//
// PRECONDITION (honest, load-bearing): these are single-writer maintenance passes
// that require QUIESCENT manifest appends. `manifest.jsonl` is ONE file shared by
// every sprint, so rewriting it — unavoidable, since the fixed `foldManifest`
// cannot consume a subtraction/tombstone delta, so reflecting a deletion REQUIRES
// a rewrite — races a concurrent append from a DIFFERENT active sprint (read-old →
// other appends → rename-over → append lost). Compaction/retention therefore MUST
// NOT run during a live sprint that is still appending. Today that is trivially
// satisfied: `appendTraceSegment` has no wired caller yet (write-side landed in
// 427-015; the maintenance pass is introduced here for the caller to come). The
// per-sprint segment files are race-free regardless — a maintenance pass targets
// OLD sprints; live appends target the CURRENT sprint's own file.
//
// NO SILENT DELETION (the task's NO_GO): compaction collapses ONLY byte-identical
// duplicate lines. An exact re-append is provably redundant, so nothing logical is
// lost; and (critically) a DISTINCT-content record that happens to share a
// `stableRecordId` — e.g. a NOT_DISPATCHED re-dispatch that keeps attempt=1 /
// purpose='original' but produced a different transcript — is KEPT, never
// "deduped" away. Every collapsed line's recordId is surfaced in the result.
// Retention is the ONLY operation that deletes bytes, only above an explicit
// configured threshold, and every deletion is written to an append-only audit
// journal ({@link TRACE_RETENTION_LOG_FILE}) BEFORE the segment is unlinked.

/** Append-only audit journal (inside {@link TRACE_SEGMENTS_SUBDIR}) recording
 *  every retention deletion — the "never silent" guarantee. */
export const TRACE_RETENTION_LOG_FILE = 'retention.jsonl';

/** Configurable retention thresholds. EMPTY policy ⇒ delete nothing (the "only
 *  above an explicit threshold" guarantee). Mirrors `core/audit-retention.ts`
 *  RetentionPolicy, including the injectable `now` test-seam. */
export interface RetentionPolicy {
  /** Keep at most this many most-recent sprint segments (ranked by `lastTs`);
   *  older segments are deleted. Absent ⇒ no count-based deletion. */
  maxSegments?: number;
  /** Delete a segment whose `lastTs` is older than `now - maxAgeMs`. Absent ⇒ no
   *  age-based deletion. */
  maxAgeMs?: number;
  /** Injectable clock (ms since epoch) for deterministic tests. Defaults to `Date.now()`. */
  now?: number;
}

/** One journaled retention deletion (a `retention.jsonl` line). */
export interface RetentionRecord {
  op: 'retention';
  sprintId: string;
  file: string;
  recordCount: number;
  firstTs: string;
  lastTs: string;
  /** ISO-8601 wall-clock of the deletion. */
  deletedAt: string;
}

/** Outcome of {@link applyRetention}. */
export interface RetentionResult {
  /** Segments deleted this pass (empty ⇒ below threshold — nothing removed). */
  deleted: RetentionRecord[];
  retentionLogPath: string;
  manifestPath: string;
}

/** Outcome of {@link compactSegment}. */
export interface CompactionResult {
  segmentPath: string;
  manifestPath: string;
  /** Segment record lines before / after the (lossless) collapse. */
  recordsBefore: number;
  recordsAfter: number;
  /** How many byte-identical duplicate lines were collapsed (0 ⇒ pure no-op). */
  merged: number;
  /** recordIds of the collapsed duplicates — surfaced so the merge is
   *  observable, never silent. */
  mergedRecordIds: string[];
}

/** Read a file, or '' when absent — retention/compaction is fail-soft on a
 *  not-yet-created store and never throws. */
function readFileOrEmpty(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Atomic whole-file replace: write `content` to a sibling `<path>.tmp`, then
 * `rename` it over `path`. A concurrent reader of `path` observes the OLD file
 * until the rename commits, then the NEW file — never a partial write. `onStaged`
 * (a test/observability seam) fires AFTER the tmp write, BEFORE the rename — the
 * exact window in which a reader must still see the old complete content.
 */
function atomicWrite(filePath: string, content: string, onStaged?: () => void): void {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, content, 'utf-8');
  onStaged?.();
  renameSync(tmp, filePath);
}

/** `meta.recordId` of a JSONL trace line, or undefined when the line is
 *  unparseable / unkeyed (such a line is always KEPT by compaction). */
function recordIdOf(line: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed === 'object' && parsed !== null) {
      const meta = (parsed as { meta?: unknown }).meta;
      if (typeof meta === 'object' && meta !== null) {
        const id = (meta as { recordId?: unknown }).recordId;
        if (typeof id === 'string') return id;
      }
    }
  } catch {
    /* unparseable — treated as unkeyed, kept */
  }
  return undefined;
}

/**
 * Collapse byte-identical duplicate lines, keeping the FIRST occurrence and
 * preserving order. A line outside `scope` (when given) is ALWAYS kept untouched.
 * LOSSLESS by construction: only an EXACT byte-for-byte repeat is dropped, so no
 * distinct record — even one sharing a recordId — can ever be lost.
 */
function collapseIdenticalLines(
  lines: readonly string[],
  scope?: (line: string) => boolean,
): { kept: string[]; dropped: string[] } {
  const seen = new Set<string>();
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const line of lines) {
    const inScope = scope === undefined || scope(line);
    if (inScope) {
      if (seen.has(line)) {
        dropped.push(line);
        continue;
      }
      seen.add(line);
    }
    kept.push(line);
  }
  return { kept, dropped };
}

function splitJsonl(raw: string): string[] {
  return raw.split('\n').filter((l) => l.length > 0);
}

function joinJsonl(lines: readonly string[]): string {
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

/**
 * born-662 (TRSEG-RETAIN) — LOSSLESS compaction of one sprint's segment. Collapses
 * byte-identical duplicate record lines (an exact re-append is provably redundant
 * — "merges, never deletes"), atomically (tmp+rename) so readers stay consistent,
 * and reflects the change in the manifest by collapsing THIS sprint's byte-identical
 * duplicate deltas the same way (so `recordCount` stays truthful and the append-only
 * manifest stops growing unbounded). `merged === 0` ⇒ a pure no-op: no file is
 * rewritten, so the append-only inode is preserved in the common (no-duplicate)
 * case. See the section note for the quiescence precondition.
 *
 * `opts.onStaged` is the atomicity/observability seam used by the reader-consistency
 * test (fires between the segment tmp write and its rename).
 */
export function compactSegment(
  tracesDir: string,
  sprintId: string,
  opts: { onStaged?: (ctx: { segmentPath: string }) => void } = {},
): CompactionResult {
  const segmentDir = join(tracesDir, TRACE_SEGMENTS_SUBDIR);
  const segmentPath = join(segmentDir, segmentFileName(sprintId));
  const manifestPath = join(segmentDir, TRACE_MANIFEST_FILE);

  const lines = splitJsonl(readFileOrEmpty(segmentPath));
  const { kept, dropped } = collapseIdenticalLines(lines);
  const result: CompactionResult = {
    segmentPath,
    manifestPath,
    recordsBefore: lines.length,
    recordsAfter: kept.length,
    merged: dropped.length,
    mergedRecordIds: dropped.map((l) => recordIdOf(l) ?? '').filter((id) => id.length > 0),
  };
  if (dropped.length === 0) return result; // pure no-op — nothing rewritten

  atomicWrite(
    segmentPath,
    joinJsonl(kept),
    opts.onStaged ? () => opts.onStaged!({ segmentPath }) : undefined,
  );

  // Reflect in the manifest: collapse THIS sprint's byte-identical duplicate
  // deltas (other sprints' lines + any unparseable line are left untouched).
  // NOTE: segment collapse keys on the full line (content-sensitive) while a
  // delta is {sprintId,file,recordId,ts} (content-INsensitive), so the two stay
  // 1:1 ONLY while distinct records carry distinct `ts`. Two distinct-content
  // records sharing BOTH recordId AND the exact `ts` would leave the segment
  // with 2 lines but recordCount 1 — a count skew, NOT data loss (both records
  // survive in the segment). Unreachable with real per-record timestamps.
  const mlines = splitJsonl(readFileOrEmpty(manifestPath));
  const { kept: mkept, dropped: mdropped } = collapseIdenticalLines(
    mlines,
    (line) => parseManifestDelta(line)?.sprintId === sprintId,
  );
  if (mdropped.length > 0) atomicWrite(manifestPath, joinJsonl(mkept));

  return result;
}

/**
 * PURE retention planner (fs-free — mirrors `core/audit-retention.ts` planRetention).
 * Returns the segments to delete, OLDEST-first (by `lastTs`). EMPTY policy (no
 * threshold set) ⇒ `[]`: deletion happens ONLY above an explicit configured
 * threshold. A segment with an unparseable `lastTs` is never age-deleted (its age
 * is unknown — the conservative direction).
 */
export function selectSegmentsForDeletion(
  segments: readonly TraceSegmentEntry[],
  policy: RetentionPolicy,
): TraceSegmentEntry[] {
  if (policy.maxSegments === undefined && policy.maxAgeMs === undefined) return [];
  const sorted = [...segments].sort((a, b) => (a.lastTs < b.lastTs ? -1 : a.lastTs > b.lastTs ? 1 : 0));
  const doomed = new Set<TraceSegmentEntry>();

  if (policy.maxAgeMs !== undefined) {
    const cutoff = (policy.now ?? Date.now()) - policy.maxAgeMs;
    for (const s of sorted) {
      const last = Date.parse(s.lastTs);
      if (!Number.isNaN(last) && last < cutoff) doomed.add(s);
    }
  }
  if (policy.maxSegments !== undefined && sorted.length > policy.maxSegments) {
    for (const s of sorted.slice(0, sorted.length - policy.maxSegments)) doomed.add(s);
  }
  return sorted.filter((s) => doomed.has(s));
}

/**
 * born-662 (TRSEG-RETAIN) — apply retention: delete the OLD sprint segments the
 * (configurable) policy selects, and reflect each deletion in the manifest. The
 * ONLY operation in this module that deletes bytes — and it does so only above an
 * explicit threshold and NEVER silently: every deletion is written to the
 * append-only audit journal ({@link TRACE_RETENTION_LOG_FILE}) BEFORE the segment
 * is unlinked, then the manifest is atomically rewritten to drop the deleted
 * sprints' deltas (so no reader dangles at a removed segment). Below threshold ⇒
 * `deleted: []` and NOTHING is touched. See the section note for the precondition.
 */
export function applyRetention(tracesDir: string, policy: RetentionPolicy): RetentionResult {
  const segmentDir = join(tracesDir, TRACE_SEGMENTS_SUBDIR);
  const manifestPath = join(segmentDir, TRACE_MANIFEST_FILE);
  const retentionLogPath = join(segmentDir, TRACE_RETENTION_LOG_FILE);

  const doomed = selectSegmentsForDeletion(readManifest(manifestPath).segments, policy);
  if (doomed.length === 0) return { deleted: [], retentionLogPath, manifestPath };

  const deletedAt = new Date(policy.now ?? Date.now()).toISOString();
  const deleted: RetentionRecord[] = [];
  const doomedSprints = new Set(doomed.map((s) => s.sprintId));

  for (const seg of doomed) {
    const record: RetentionRecord = {
      op: 'retention',
      sprintId: seg.sprintId,
      file: seg.file,
      recordCount: seg.recordCount,
      firstTs: seg.firstTs,
      lastTs: seg.lastTs,
      deletedAt,
    };
    // Journal BEFORE unlink: a crash mid-pass over-records (auditable) rather than
    // deleting silently — the safe failure direction.
    mkdirSync(segmentDir, { recursive: true });
    appendFileSync(retentionLogPath, JSON.stringify(record) + '\n', 'utf-8');
    try {
      unlinkSync(join(segmentDir, seg.file));
    } catch {
      /* already absent — still journaled */
    }
    deleted.push(record);
  }

  // Drop the deleted sprints' deltas from the manifest (atomic tmp+rename). An
  // unparseable line + every surviving sprint's delta are kept (never lose data).
  const kept = splitJsonl(readFileOrEmpty(manifestPath)).filter((line) => {
    const d = parseManifestDelta(line);
    return d === null || !doomedSprints.has(d.sprintId);
  });
  atomicWrite(manifestPath, joinJsonl(kept));

  return { deleted, retentionLogPath, manifestPath };
}
