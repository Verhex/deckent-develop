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

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR, TASKS_DIR } from '../core/constants.js';
import type { OutputCollector } from '../core/output-collector.js';
import {
  appendTrace,
  toSprintTrainingExample,
  toEnvelopeFallbackTrainingExample,
  type SprintTraceMeta,
  type TrainingExample,
} from '../agent/trace-recorder.js';

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
 *
 * born-637 (TRACE-CONTENT-PARITY envelope-fallback): a backend whose `.log`
 * is not yet a LogEvent JSONL stream (e.g. a docker worker before the
 * stream-json capture wire — see spawn-backend-docker.ts
 * `writeNormalizedDockerLog`) makes `readLogEvents` return `[]` even though
 * the CLI's final result envelope is sitting right there on disk. Rather than
 * silently record a `messages:[]` entry (the sprint-401 live-trace bug this
 * closes), fall back to a MINIMAL single-message reconstruction parsed out of
 * that envelope. No envelope recoverable → nothing is written (more honest
 * than an empty-messages record).
 */
export function recordSprintWorkerTrace(opts: RecordSprintWorkerTraceOptions): void {
  if (!opts.enabled) return;
  try {
    const events = opts.collector.readLogEvents(opts.meta.taskId);
    const example = events.length > 0
      ? toSprintTrainingExample(events, opts.meta)
      : buildEnvelopeFallbackExample(opts.projectRoot, opts.meta);
    if (example) appendTrace(sprintTraceFilePath(opts.projectRoot), example);
  } catch {
    // Fail-soft (ADR-G-009 / TRN-1): a trace-write error must never affect the sprint.
  }
}

/**
 * born-637 envelope-fallback: read the raw `.log` from disk, extract the
 * CLI's final result-envelope, and build a minimal training example. Returns
 * null when the file is missing or no envelope is recoverable — the caller
 * then writes nothing, same as the pre-existing zero-events case.
 */
function buildEnvelopeFallbackExample(projectRoot: string, meta: SprintTraceMeta): TrainingExample | null {
  const logPath = join(projectRoot, TASKS_DIR, `task-${meta.taskId}.log`);
  if (!existsSync(logPath)) return null;
  const raw = readFileSync(logPath, 'utf-8');
  const result = extractEnvelopeResultString(raw);
  if (result === null) return null;
  return toEnvelopeFallbackTrainingExample(result, meta);
}

/**
 * Parse a claude-CLI `--output-format json` result envelope out of raw
 * `.log` content and return its `result` string, or null when none is found.
 * Scans the whole trimmed content first (single-envelope dump, the common
 * docker/tmux shape), then each JSON-looking line (mixed stdout/stderr, or a
 * multi-line NDJSON dump) — keeping the LAST match, the same last-wins
 * convention `orchestra/token-counter.ts` and `providers/claude.ts` already
 * use for this exact envelope shape.
 */
function extractEnvelopeResultString(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const candidates = [trimmed, ...raw.split(/\r?\n/).map((l) => l.trim())];
  let found: string | null = null;
  for (const c of candidates) {
    if (!c.startsWith('{')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(c);
    } catch {
      continue;
    }
    if (
      parsed !== null && typeof parsed === 'object'
      && (parsed as { type?: unknown }).type === 'result'
      && typeof (parsed as { result?: unknown }).result === 'string'
    ) {
      found = (parsed as { result: string }).result;
    }
  }
  return found;
}
