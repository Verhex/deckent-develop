// src/agent/trace-recorder.ts
// ═══ Trace recorder (SP-2) ══════════════════════════════════════════════════
// Maps a native-agent ProviderMessage[] transcript into an OpenAI-messages
// training example (the unsloth/LLaMA-Factory tool-calling SFT shape) and
// appends it as one JSONL line. Local-only (.deckent/traces/, gitignored);
// nothing is uploaded. The ProviderMessage shape is ALREADY the OpenAI
// round-trip shape (M2) — this is a thin, pure mapping + an fs append.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProviderMessage } from './provider-tooluse/types.js';
import type { LogEvent } from '../core/log-event.js';
import { redactSensitive } from '../core/redact-sensitive.js';
import {
  projectTranscript,
  TRACE_SCHEMA_VERSION,
  type TelemetryEvent,
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
