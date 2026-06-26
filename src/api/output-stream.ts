// ═══ Output Stream SSE Endpoint ════════════════════════════════════════════
// Server-Sent Events endpoint for Sprint 140+ web dashboard.
// Streams worker output from OutputCollector → SSE → React dashboard client.
//
// Usage:
//   GET /api/output-stream?taskId=<taskId>&sprintId=<sprintId>
//
// Protocol:
//   Content-Type: text/event-stream
//   Cache-Control: no-cache
//   Connection: keep-alive
//
//   Event types:
//   - "output"   : new output lines from worker
//   - "snapshot" : full snapshot on connect
//   - "error"    : error message
//   - "done"     : worker collection stopped
//
// Sprint 140 hook point: React dashboard connects to this endpoint
// to display real-time worker output in the dashboard UI.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { OutputCollector } from '../core/output-collector.js';
import type { OutputSnapshot, OutputEntry } from '../core/output-collector.js';
import type { LogEvent } from '../core/log-event.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** SSE event data payload for "output" events. */
export interface OutputStreamEvent {
  /** Task identifier. */
  taskId: string;
  /** New output lines since last push. */
  lines: readonly OutputEntry[];
  /** Total lines received by collector (including dropped). */
  totalReceived: number;
  /** Total lines dropped due to buffer overflow. */
  droppedLines: number;
}

/** SSE event data payload for "snapshot" events. */
export interface SnapshotEvent {
  /** Task identifier. */
  taskId: string;
  /** Full snapshot of all buffered lines. */
  snapshot: OutputSnapshot;
}

/** SSE event data payload for "error" events. */
export interface ErrorEvent {
  /** Error message. */
  message: string;
  /** Optional error code. */
  code?: string;
}

/**
 * SSE event data payload for the structured JSONL log stream (spec §2.3).
 * Emitted as `log-backfill` (full history on connect) and `log` (live appends),
 * mirroring the `snapshot`/`output` pair of the line-based stream.
 */
export interface LogStreamEvent {
  /** Task identifier. */
  taskId: string;
  /** A batch of structured log events (backfill history or live appends). */
  events: readonly LogEvent[];
  /** Highest `seq` sent so far — the resume cursor for the next push. */
  lastSeq: number;
}

/** Options for configuring the SSE handler. */
export interface OutputStreamOptions {
  /** How often to poll the collector for new lines (ms). Default: 500 */
  pollIntervalMs?: number;
  /** Max time a connection can stay open (ms). 0 = unlimited. Default: 0 */
  maxConnectionMs?: number;
}

// ─── SSE Helpers ─────────────────────────────────────────────────────────────

/**
 * Write a single SSE event to the response.
 * Format: "event: <type>\ndata: <json>\n\n"
 */
export function writeSseEvent(
  res: ServerResponse,
  eventType: string,
  data: unknown,
): boolean {
  if (res.writableEnded || res.destroyed) return false;
  try {
    const payload = JSON.stringify(data);
    res.write(`event: ${eventType}\ndata: ${payload}\n\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write SSE headers to start an event stream.
 * Must be called before any writeSseEvent calls.
 */
export function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
  });
}

// ─── Query Parsing ────────────────────────────────────────────────────────────

/**
 * Parse taskId and sprintId from request URL query string.
 * Returns null if taskId is missing.
 */
export function parseStreamQuery(
  req: IncomingMessage,
): { taskId: string; sprintId?: string } | null {
  const url = req.url ?? '';
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;

  const params = new URLSearchParams(url.slice(queryStart + 1));
  const taskId = params.get('taskId');
  if (!taskId || taskId.trim().length === 0) return null;

  const sprintId = params.get('sprintId') ?? undefined;
  return { taskId: taskId.trim(), sprintId };
}

// ─── SSE Handler ─────────────────────────────────────────────────────────────

/**
 * Handle a Server-Sent Events request for worker output streaming.
 *
 * Attaches to an OutputCollector and pushes new lines to the client
 * on each poll interval. Sends an initial "snapshot" event with all
 * buffered lines, then "output" events for each new batch.
 *
 * @param req       - Incoming HTTP request
 * @param res       - Server response (will be kept open as SSE stream)
 * @param collector - OutputCollector to read worker output from
 * @param opts      - Optional configuration overrides
 * @returns cleanup function that stops polling and closes the connection
 *
 * @example
 * ```ts
 * // In your HTTP server route handler:
 * if (req.url?.startsWith('/api/output-stream')) {
 *   handleOutputStream(req, res, myCollector);
 * }
 * ```
 */
export function handleOutputStream(
  req: IncomingMessage,
  res: ServerResponse,
  collector: OutputCollector,
  opts: OutputStreamOptions = {},
): () => void {
  const pollIntervalMs = opts.pollIntervalMs ?? 500;
  const maxConnectionMs = opts.maxConnectionMs ?? 0;

  // Parse query parameters
  const query = parseStreamQuery(req);
  if (!query) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing required query parameter: taskId' }));
    return () => undefined;
  }

  const { taskId } = query;

  // Start SSE stream
  writeSseHeaders(res);

  // Send initial snapshot
  const initialSnapshot = collector.getSnapshot(taskId);
  if (initialSnapshot) {
    writeSseEvent(res, 'snapshot', {
      taskId,
      snapshot: initialSnapshot,
    } satisfies SnapshotEvent);
  } else {
    // Worker not yet registered — send empty snapshot
    writeSseEvent(res, 'snapshot', {
      taskId,
      snapshot: {
        workerId: taskId,
        taskId,
        lines: [],
        totalLinesReceived: 0,
        droppedLines: 0,
      },
    } satisfies SnapshotEvent);
  }

  // Track how many lines we've already sent
  let sentLineCount = initialSnapshot?.totalLinesReceived ?? 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function cleanup(): void {
    if (closed) return;
    closed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (maxTimer) clearTimeout(maxTimer);
    if (!res.writableEnded) res.end();
  }

  // Poll for new output
  pollTimer = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      cleanup();
      return;
    }

    const snapshot = collector.getSnapshot(taskId);
    if (!snapshot) return;

    // Check if there are new lines
    if (snapshot.totalLinesReceived > sentLineCount) {
      const allLines = snapshot.lines;
      // Calculate how many new lines to send
      const newLinesCount = snapshot.totalLinesReceived - sentLineCount;
      const newLines = allLines.slice(-newLinesCount);

      const ok = writeSseEvent(res, 'output', {
        taskId,
        lines: newLines,
        totalReceived: snapshot.totalLinesReceived,
        droppedLines: snapshot.droppedLines,
      } satisfies OutputStreamEvent);

      if (ok) {
        sentLineCount = snapshot.totalLinesReceived;
      } else {
        cleanup();
      }
    }

    // Check if worker is done (no longer active)
    const activeWorkers = collector.getActiveWorkers();
    if (!activeWorkers.includes(taskId)) {
      writeSseEvent(res, 'done', { taskId });
      cleanup();
    }
  }, pollIntervalMs);

  // Max connection timeout
  if (maxConnectionMs > 0) {
    maxTimer = setTimeout(() => {
      writeSseEvent(res, 'done', { taskId, reason: 'max-connection-timeout' });
      cleanup();
    }, maxConnectionMs);
  }

  // Clean up when client disconnects
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);

  return cleanup;
}

// ─── Structured Log SSE Handler (live JSONL tail) ───────────────────────────────

/** Highest `seq` across a batch of log events (0 when empty). */
function maxSeq(events: readonly LogEvent[]): number {
  let max = 0;
  for (const ev of events) if (ev.seq > max) max = ev.seq;
  return max;
}

/**
 * Handle a Server-Sent Events request for a worker's **structured JSONL log**
 * (spec §2.3 — the dead-stream fix).
 *
 * Unlike {@link handleOutputStream} (which serves line-based pane/log scraping
 * from the in-memory CircularBuffer that `collect()` would fill), this tails the
 * per-task JSONL log the spawn-backend writes (`.tasks/task-<id>.log` via
 * `writeLogEvent`). That file is the live source of truth, so the stream is no
 * longer dead even when `collect()` has no caller.
 *
 * On connect it backfills the full event history (`log-backfill`), then polls
 * the log and pushes each new appended batch (`log`) — backfill + push. The
 * worker's `LogEvent.seq` is the resume cursor, so no event is sent twice and
 * none is missed. `done` fires when an actively-collected worker finishes,
 * the client disconnects, or `maxConnectionMs` elapses.
 *
 * @param req       - Incoming HTTP request
 * @param res       - Server response (kept open as the SSE stream)
 * @param collector - OutputCollector exposing `readLogEvents`
 * @param opts      - Optional configuration overrides
 * @returns cleanup function that stops polling and closes the connection
 */
export function handleLogStream(
  req: IncomingMessage,
  res: ServerResponse,
  collector: OutputCollector,
  opts: OutputStreamOptions = {},
): () => void {
  const pollIntervalMs = opts.pollIntervalMs ?? 500;
  const maxConnectionMs = opts.maxConnectionMs ?? 0;

  const query = parseStreamQuery(req);
  if (!query) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing required query parameter: taskId' }));
    return () => undefined;
  }

  const { taskId } = query;

  writeSseHeaders(res);

  // Backfill: every event already on disk (full history).
  const backfill = collector.readLogEvents(taskId);
  let lastSeq = maxSeq(backfill);
  writeSseEvent(res, 'log-backfill', {
    taskId,
    events: backfill,
    lastSeq,
  } satisfies LogStreamEvent);

  // A worker that is being actively collected lets us emit `done` on completion;
  // a pure file-tail (no collect caller) stays open until disconnect/timeout.
  let everActive = collector.getActiveWorkers().includes(taskId);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function cleanup(): void {
    if (closed) return;
    closed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (maxTimer) clearTimeout(maxTimer);
    if (!res.writableEnded) res.end();
  }

  pollTimer = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      cleanup();
      return;
    }

    // Push: only events newer than the last seq we sent.
    const fresh = collector.readLogEvents(taskId, lastSeq);
    if (fresh.length > 0) {
      const nextSeq = maxSeq(fresh);
      const ok = writeSseEvent(res, 'log', {
        taskId,
        events: fresh,
        lastSeq: nextSeq,
      } satisfies LogStreamEvent);
      if (ok) {
        lastSeq = nextSeq;
      } else {
        cleanup();
        return;
      }
    }

    // Done when an actively-collected worker transitions to inactive.
    const active = collector.getActiveWorkers().includes(taskId);
    if (active) {
      everActive = true;
    } else if (everActive) {
      writeSseEvent(res, 'done', { taskId });
      cleanup();
    }
  }, pollIntervalMs);

  if (maxConnectionMs > 0) {
    maxTimer = setTimeout(() => {
      writeSseEvent(res, 'done', { taskId, reason: 'max-connection-timeout' });
      cleanup();
    }, maxConnectionMs);
  }

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);

  return cleanup;
}

// ─── Request Router ───────────────────────────────────────────────────────────

/**
 * Check if an HTTP request is an output-stream SSE request.
 * Matches GET /api/output-stream (with any query string).
 */
export function isOutputStreamRequest(req: IncomingMessage): boolean {
  const url = req.url ?? '';
  const path = url.split('?')[0];
  return req.method === 'GET' && path === '/api/output-stream';
}
