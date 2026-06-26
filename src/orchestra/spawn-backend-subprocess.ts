// ═══ Complete Worker-Stream → Structured-JSONL Capture ═══════════════════
// Worker Output Contract & Observability — Pillar 2 (spec §2.1), Phase 4.2.
//
// PROBLEM (pre-fix): a worker's `.log` captured only the FINAL summary — the
// docker backend writes one opaque `docker logs` blob post-exit
// (spawn-backend-docker.ts), the subprocess backend redirects raw stdout/stderr
// to an FD (providers/subprocess.ts); neither emits the per-event structured
// JSONL contract. The sprint-325 archived log was 3 lines / 463 bytes — the
// full execution trace (every turn, tool_use, tool_result, text, stderr, usage)
// was lost, and the live dashboard stream had nothing to tail.
//
// THIS MODULE is the provider-agnostic capture seam the spawn-backends drive:
// it reads the worker subprocess output stream line-by-line (claude
// `--output-format stream-json`, Ollama, OpenAI-compatible and any NDJSON
// provider emit one JSON event per line), normalizes EVERY line into the common
// `LogEvent` shape (`normalizeStreamEvent` — never drops) and appends it to
// `task-<id>.log` as one JSONL row with a monotonic `seq` (`writeLogEvent`).
//
// No Claude-CLI dependency: normalization lives in `core/log-event.ts` and is
// cross-provider. The final `usage` event is surfaced on the result as the
// single source of truth feeding Pillar-1 token capture (Phase 2). An optional
// `onEvent` hook taps each event live for the SSE OutputCollector wire (Phase 5)
// without re-reading the log.

import type { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import {
  writeLogEvent,
  normalizeStreamEvent,
  type StreamLogEvent,
} from '../core/log-event.js';

// ─── Types ───────────────────────────────────────────────────────────

/** Options for {@link captureStreamToLog}. */
export interface StreamCaptureOptions {
  /** Absolute path to the JSONL `.log` file (e.g. `.tasks/task-<id>.log`). */
  logPath: string;
  /** Provider id driving normalization (`'claude'`, `'ollama'`, `'gemini'`, …). */
  provider: string;
  /**
   * First sequence number to stamp (default `1`). Lets a caller capturing
   * multiple streams into one log (e.g. stdout then stderr) keep `seq`
   * monotonic across both by threading `nextSeq` forward.
   */
  startSeq?: number;
  /**
   * Optional live tap — invoked for every captured event, in order, with the
   * normalized event and the `seq` it was written under. Used by Phase-5 to
   * feed the SSE `OutputCollector` without re-reading the log. A throwing hook
   * never breaks capture (fail-safe, mirroring `writeLogEvent`).
   */
  onEvent?: (event: StreamLogEvent, seq: number) => void;
}

/** Outcome of a {@link captureStreamToLog} run. */
export interface StreamCaptureResult {
  /** Number of events written to the log. */
  eventsWritten: number;
  /** The next free sequence number (monotonic continuation point). */
  nextSeq: number;
  /**
   * The last `usage` event seen, or `null` if the stream carried none. This is
   * the single source of truth feeding Pillar-1 provider-agnostic token capture.
   */
  finalUsage: StreamLogEvent | null;
}

// ─── Capture ─────────────────────────────────────────────────────────

/**
 * Capture the COMPLETE worker subprocess output stream into a structured-JSONL
 * log — every turn, tool_use, tool_result, text, stderr and usage event, not
 * just the final summary.
 *
 * Reads `stream` line-by-line (NDJSON — one provider event per line),
 * normalizes each line via `normalizeStreamEvent` (provider-agnostic, never
 * drops: a non-JSON / plain stderr line degrades to a `text` event) and appends
 * it via `writeLogEvent` with a monotonic `seq`. Resolves once the stream ends.
 *
 * @param stream A worker subprocess output stream (e.g. `child.stdout`, or
 *               `Readable.from(blob)` for a post-hoc `docker logs` dump).
 * @param opts   Log path, provider, optional `startSeq` and `onEvent` tap.
 * @returns      Count written, the next free `seq`, and the final `usage` event.
 */
export async function captureStreamToLog(
  stream: Readable,
  opts: StreamCaptureOptions,
): Promise<StreamCaptureResult> {
  const { logPath, provider, startSeq = 1, onEvent } = opts;

  let seq = startSeq;
  let eventsWritten = 0;
  let finalUsage: StreamLogEvent | null = null;

  // readline reassembles arbitrary chunk boundaries into whole lines, so a JSON
  // event split across two stdout chunks is still parsed once. `crlfDelay:
  // Infinity` treats \r\n as a single break (Windows worker streams).
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    // Skip purely-blank lines (NDJSON inter-record whitespace); a line that is
    // non-empty but non-JSON is genuine output and is preserved as `text`.
    if (line.trim() === '') continue;

    const event = normalizeStreamEvent(line, provider);
    writeLogEvent(logPath, event, seq);

    if (event.type === 'usage') finalUsage = event;

    if (onEvent) {
      try {
        onEvent(event, seq);
      } catch {
        // Fail-safe: a live-tap consumer must never break stream capture.
      }
    }

    seq += 1;
    eventsWritten += 1;
  }

  return { eventsWritten, nextSeq: seq, finalUsage };
}
