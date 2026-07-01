// src/orchestra/output-collector.ts
// ═══ Sprint-Worker Trace Wire (TRN-1) ═══════════════════════════════════════
// Wires the EXISTING core `OutputCollector.readLogEvents` (the structured
// JSONL log contract — `.tasks/task-<id>.log`, already tailed live by
// `src/api/output-stream.ts:handleLogStream` for the dashboard SSE stream)
// into the EXISTING `src/agent/trace-recorder.ts`, which had zero callers on
// the sprint-worker path (its only production caller is the native-REPL wire
// at `src/cli/repl/trace-wire.ts:24`).
//
// Config-gated (`enabled` — caller resolves `training_trace.enabled` from
// project config; default OFF): `enabled=false` is a pure no-op, byte-identical
// to pre-TRN-1 behavior (no read, no write, no perf cost). Fail-soft: any
// error (read/parse/write) is swallowed — a trace-write failure must never
// affect the sprint (ADR-G-009).

import { join } from 'node:path';
import { DECKENT_DIR } from '../core/constants.js';
import type { OutputCollector } from '../core/output-collector.js';
import { appendTrace, toSprintTrainingExample, type SprintTraceMeta } from '../agent/trace-recorder.js';

/** Options for {@link recordSprintWorkerTrace}. */
export interface RecordSprintWorkerTraceOptions {
  /** `training_trace.enabled` (default OFF) — resolved by the caller from project config. */
  enabled: boolean;
  projectRoot: string;
  /** Narrowed to the one method actually used — keeps hermetic test doubles trivial. */
  collector: Pick<OutputCollector, 'readLogEvents'>;
  meta: SprintTraceMeta;
}

/** Local-only, gitignored trace file — mirrors the `.deckent/traces/` convention already used by `trace-wire.ts`. */
export function sprintTraceFilePath(projectRoot: string): string {
  return join(projectRoot, DECKENT_DIR, 'traces', 'sprint-worker.jsonl');
}

/**
 * Record one sprint-worker training-trace entry from its collected JSONL log.
 *
 * Reads the task's full structured log via `collector.readLogEvents`, maps it
 * into a redacted + labeled `TrainingExample` (`toSprintTrainingExample`), and
 * appends it to `sprintTraceFilePath`. Flag OFF or any internal error is a
 * silent no-op — recording must never affect the sprint.
 */
export function recordSprintWorkerTrace(opts: RecordSprintWorkerTraceOptions): void {
  if (!opts.enabled) return;
  try {
    const events = opts.collector.readLogEvents(opts.meta.taskId);
    const example = toSprintTrainingExample(events, opts.meta);
    appendTrace(sprintTraceFilePath(opts.projectRoot), example);
  } catch {
    // Fail-soft (ADR-G-009 / TRN-1): a trace-write error must never affect the sprint.
  }
}
