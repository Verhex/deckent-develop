// src/cli/repl/trace-wire.ts
// ═══ Per-turn record wiring (SP-2 · 7089 NATIVE-SESSION-LEDGER) ══════════════
// Builds the per-turn recorders the native bridge calls at turn-end:
//   · the SESSION LEDGER — the full-fidelity durable record of a native REPL
//     session (per-turn message delta + the usage the turn actually billed).
//     ALWAYS built: it is deliberately NOT gated on `training_trace.enabled`,
//     because a training flag must never decide whether the user's own session
//     history and token accounting survive the process.
//   · the local TRAINING TRACE — .deckent/traces/<session>.jsonl, gated by
//     `resolveTraceEnabled` (config authority + DECKENT_TRACE opt-out) exactly
//     as before. Now that the ledger is the full-fidelity source, the trace is
//     a training artifact only.
// Both write one DELTA record per turn instead of re-copying the whole
// transcript, so N turns cost O(N) records/bytes instead of O(N²).
// Pure/injectable (clock + dir/root) for hermetic tests.

import { join } from 'node:path';
import { chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { appendTrace, toTrainingExample, type TrainingExample, type OpenAiMessage } from '../../agent/trace-recorder.js';
import { redactSensitive } from '../../core/redact-sensitive.js';
import type { ProviderMessage } from '../../agent/provider-tooluse/types.js';
import { appendLedgerTurn, type LedgerUsage } from './session-ledger.js';

/** `meta.source` stamped on every native-REPL trace line (unchanged since SP-2). */
const NATIVE_TRACE_SOURCE = 'native-repl';
/** Version of the additive `nativeTrace` sibling marker described below. */
const NATIVE_TRACE_MARKER_VERSION = 1 as const;

/** What one recorded turn cost and who served it — the accounting half of a
 *  turn record, carried alongside the message delta. The bridge fills it from
 *  the SAME counters `onTurnEnd` reports, so the number the user sees on screen
 *  and the number that reaches disk cannot drift. */
export interface TurnRecordMeta {
  /** `null` when the provider reported no usage for the turn (honest absence,
   *  never a synthesized zero). */
  usage: LedgerUsage | null;
  /** The model that ACTUALLY served the turn (live `/model` switch aware). */
  model: string;
  /** The provider that actually served the turn. Resolved by the caller — no
   *  provider name is ever hardcoded on this path. */
  provider: string;
  /** Monotonic 0-based index of this turn within the session. */
  turnIndex: number;
}

/** The bridge-side recorder contract (`NativeEngineDeps.recordTurn`): the FULL
 *  cross-turn transcript plus this turn's accounting. Recorders reduce the
 *  transcript to their own delta; the boundary stays full-fidelity so a
 *  recorder can recover from a context-epoch compaction. */
export type TurnRecorder = (messages: ProviderMessage[], meta: TurnRecordMeta) => void;

/** How one written record relates to the previous one. */
export type TurnRecordShape = 'delta' | 'epoch';

/** The slice of transcript a recorder must actually persist this turn. */
export interface TurnDelta {
  messages: ProviderMessage[];
  shape: TurnRecordShape;
  /** Incremented every time the transcript stopped extending the previous
   *  prefix (a context-epoch compaction replaced it). */
  epoch: number;
}

/** O(1) identity of one message — the anchor that proves the transcript this
 *  turn still EXTENDS the prefix we already wrote. Hashing the whole prefix
 *  would reintroduce the very O(n²) this delta strategy exists to kill. */
function anchorOf(message: ProviderMessage): string {
  return createHash('sha256').update(`${message.role}\u0000${message.content}`).digest('hex');
}

/**
 * One recorder's cursor over a growing transcript. Returns only what is new
 * since the last call.
 *
 * The transcript does not only grow: a context epoch (session.ts
 * `compactForContextEpoch`) REPLACES it with objective + checkpoint + lineage.
 * A naive `slice(written)` would then silently emit garbage, so a shrink or an
 * anchor mismatch is detected and reported honestly as a new `epoch` record
 * carrying the whole current transcript — never a wrong delta, never a silent
 * gap.
 */
export function createDeltaCursor(): (messages: readonly ProviderMessage[]) => TurnDelta {
  let written = 0;
  let anchor = '';
  let epoch = 1;
  return (messages) => {
    const previous = written > 0 ? messages[written - 1] : undefined;
    const extendsPrefix = written > 0 && previous !== undefined && anchorOf(previous) === anchor;
    if (written > 0 && !extendsPrefix) epoch++;
    const slice = extendsPrefix ? messages.slice(written) : messages.slice();
    const last = messages[messages.length - 1];
    written = messages.length;
    anchor = last === undefined ? '' : anchorOf(last);
    return {
      messages: slice.map((message) => ({ ...message })),
      shape: extendsPrefix ? 'delta' : 'epoch',
      epoch,
    };
  };
}

// ─── Training trace (config-gated) ──────────────────────────────────────────

/** Redact message content + tool-call argument JSON before it ever hits disk (TRN-2, same rule as TRN-1). */
function redactMessage(m: OpenAiMessage): OpenAiMessage {
  return {
    ...m,
    content: redactSensitive(m.content),
    ...(m.tool_calls ? { tool_calls: m.tool_calls.map((tc) => ({ ...tc, function: { ...tc.function, arguments: redactSensitive(tc.function.arguments) } })) } : {}),
  };
}

/** Generic so an extended record (see {@link NativeTraceRecord}) keeps its
 *  additive sibling fields through redaction. */
function redactExample<T extends TrainingExample>(example: T): T {
  return { ...example, messages: example.messages.map(redactMessage) };
}

/**
 * One native-REPL trace line: the unchanged `TrainingExample` shape (a `system`
 * message + this record's messages, plus `meta`) with ONE additive top-level
 * sibling that marks the delta transition.
 *
 * Kept ADDITIVE on purpose — the disk consumers of this file
 * (`src/training/pipeline.ts` `parseTraceLineDetailed`, which requires only an
 * array `messages`, and `src/cli/commands/trace-extract.ts`, which reads
 * `messages` alone) keep parsing every line unchanged; a consumer that assumed
 * "one line = the whole conversation" can now SEE that assumption is no longer
 * true and reassemble a session by `epoch` + `turnIndex` instead of guessing.
 */
export interface NativeTraceRecord extends TrainingExample {
  nativeTrace: {
    v: typeof NATIVE_TRACE_MARKER_VERSION;
    shape: TurnRecordShape;
    epoch: number;
    turnIndex: number;
    provider: string;
  };
}

export interface TurnRecorderOptions {
  enabled: boolean;
  dir: string;
  sessionId: string;
  /** System prompt stamped on each trace line. Pass a GETTER whenever the real
   *  model-facing prompt is only knowable after the session opened (e.g. the
   *  scratchpad section, which needs the resolved scratch dir) — a boot-time
   *  snapshot silently records a system prompt the model never received. */
  system: string | (() => string);
  /** Model id stamped on each trace line. Pass a getter when the session can
   *  switch models at runtime (/model) so the trace records the model that
   *  actually served the turn — a fixed boot-time stamp misled the 2026-07-07
   *  incident diagnosis. */
  model: string | (() => string);
  now: () => string;
}

/**
 * NT-13 — `training_trace.enabled` (effective config) is the sole AUTHORITY that can turn
 * capture ON; absent/false means zero capture regardless of environment. `DECKENT_TRACE=0`
 * may additionally force capture OFF on top of an enabled config, but can never force it ON
 * when the config says off — an env-default-on trace was the exact bug this closes (the prior
 * call site read only `process.env['DECKENT_TRACE'] !== '0'`, so an unset env var captured by
 * default even with no config authority at all).
 *
 * This gate covers the TRAINING TRACE ONLY. The session ledger
 * ({@link buildLedgerRecorder}) never consults it.
 */
export function resolveTraceEnabled(
  config: { training_trace?: { enabled?: boolean } } | undefined,
  env: NodeJS.ProcessEnv,
): boolean {
  if (config?.training_trace?.enabled !== true) return false;
  return env['DECKENT_TRACE'] !== '0';
}

export function buildTurnRecorder(
  opts: TurnRecorderOptions,
): ((messages: ProviderMessage[], meta?: TurnRecordMeta) => void) | undefined {
  if (!opts.enabled) return undefined;
  const file = join(opts.dir, `${opts.sessionId}.jsonl`);
  const nextDelta = createDeltaCursor();
  // Fallback index for a meta-less caller (library/test use); the bridge always
  // supplies the real turn index.
  let recorded = 0;
  return (messages, meta) => {
    try {
      const delta = nextDelta(messages);
      const turnIndex = meta?.turnIndex ?? recorded;
      recorded++;
      // Nothing new happened on the wire — writing an empty example would add a
      // line with no training value and re-inflate the file for free.
      if (delta.messages.length === 0) return;
      const system = typeof opts.system === 'function' ? opts.system() : opts.system;
      const model = typeof opts.model === 'function' ? opts.model() : opts.model;
      const record: NativeTraceRecord = {
        ...toTrainingExample(system, delta.messages, { source: NATIVE_TRACE_SOURCE, model, ts: opts.now() }),
        nativeTrace: {
          v: NATIVE_TRACE_MARKER_VERSION,
          shape: delta.shape,
          epoch: delta.epoch,
          turnIndex,
          provider: meta?.provider ?? '',
        },
      };
      appendTrace(file, redactExample(record));
      // appendTrace/appendFileSync carries no mode option, so harden after each write —
      // training-trace content is a workspace-content-derived attack surface (TRN-2).
      if (process.platform !== 'win32') chmodSync(file, 0o600);
    } catch {
      // Fail-soft (ADR-G-009 / TRN-2, same rule as TRN-1): a trace-write error must never break the REPL turn.
    }
  };
}

// ─── Session ledger (always on) ─────────────────────────────────────────────

export interface LedgerRecorderOptions {
  sessionId: string;
  /** Project directory the ledger is namespaced under (defaults to the store's own `process.cwd()`). */
  cwd?: string;
  /** Injectable replacement for the global deckent home. Required in tests. */
  rootDir?: string;
  now: () => string;
}

/**
 * The session ledger recorder — the durable, full-fidelity record of a native
 * REPL session. Unconditional by design: there is NO flag, and in particular it
 * is never wired to `training_trace.enabled` (that gate is a training-corpus
 * decision, not a "does the user keep their own session history" decision).
 *
 * Each turn appends exactly one JSONL row: this turn's message delta plus the
 * usage it billed, so replaying the rows reconstructs the transcript and the
 * running token totals without any row ever re-copying history.
 *
 * A context-epoch compaction re-anchors the cursor (see {@link createDeltaCursor})
 * and the replacing transcript is appended as that turn's delta. Nothing is
 * lost: the pre-compaction turns are already on disk and the compaction
 * preamble is itself what the model saw from then on.
 */
export function buildLedgerRecorder(opts: LedgerRecorderOptions): TurnRecorder {
  const nextDelta = createDeltaCursor();
  return (messages, meta) => {
    try {
      const delta = nextDelta(messages);
      appendLedgerTurn({
        sessionId: opts.sessionId,
        turnIndex: meta.turnIndex,
        ts: opts.now(),
        provider: meta.provider,
        model: meta.model,
        messagesDelta: delta.messages,
        usage: meta.usage,
        ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
        ...(opts.rootDir !== undefined ? { rootDir: opts.rootDir } : {}),
      });
    } catch {
      // Fail-soft, same rule as the trace: a ledger-write error must never break the REPL turn.
    }
  };
}

/** Fan one bridge-side `recordTurn` call out to every active recorder, in the
 *  order given. `undefined` entries (a disabled trace) are dropped; all-absent
 *  returns `undefined` so the caller can omit the dep entirely. */
export function composeTurnRecorders(
  ...recorders: Array<TurnRecorder | undefined>
): TurnRecorder | undefined {
  const active = recorders.filter((recorder): recorder is TurnRecorder => recorder !== undefined);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0]!;
  return (messages, meta) => {
    for (const recorder of active) recorder(messages, meta);
  };
}
