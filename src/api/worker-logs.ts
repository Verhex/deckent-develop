// ═══ Worker Log Stream (DASH-RT-2, Sprint 284) ════════════════════════
// Backend-agnostic live tail of a worker's log file over SSE. The docker
// backend writes `.tasks/task-<taskId>.log` (spawn-backend-docker.ts:1344);
// because the source of truth is a plain file, the SAME path serves the
// subprocess/tmux backends too — no per-backend branch.
//
// Route: GET /api/workers/:taskId/logs/stream
//   - on connect: backfill the existing complete lines, then stream appends
//   - file missing → ONE honest `log_unavailable` event (silent-empty is
//     forbidden — the dashboard must be able to tell "no log" from "no lines
//     yet"). The watcher keeps running, so a log written AFTER connect still
//     streams (worker may start after the panel opens).
//   - frames carry a named SSE `event:` field (mirrors live-events.ts) so the
//     client subscribes via addEventListener and they never collide with the
//     default `data:` snapshot stream on `/api/events`.
//
// Security: the taskId is validated against `^[A-Za-z0-9_-]+$` at the server
// route BEFORE this module touches the filesystem (path-traversal → 403), so
// the join below can never escape `.tasks/`.

import { watch, existsSync, readFileSync, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TASKS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';

// ─── Types ───────────────────────────────────────────────────────

/** A typed real-time event for a worker's log stream. */
export interface WorkerLogEvent {
  type: 'log_line' | 'log_unavailable';
  /** The (already-validated) task id this stream belongs to. */
  taskId: string;
  /** ISO 8601 emission timestamp. */
  ts: string;
  /** Present for `log_line` — one complete log line (no trailing newline). */
  line?: string;
}

export interface WorkerLogTail {
  close(): void;
}

export interface WorkerLogTailOptions {
  projectRoot: string;
  /** Validated task id — caller guarantees it matches `^[A-Za-z0-9_-]+$`. */
  taskId: string;
  /** Sink called for every typed event — server wires this to `res.write`. */
  onEvent: (event: WorkerLogEvent) => void;
  /** Per-change debounce window in ms (≤250). Default 100. */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 100;

/** taskId charset — pinned here as the single source of truth for the route. */
const TASK_ID_RE = /^[A-Za-z0-9_-]+$/;
/** `/api/workers/:taskId/logs/stream` (optionally with a query string). */
const LOG_STREAM_RE = /^\/api\/workers\/([^/?]+)\/logs\/stream(?:\?|$)/;

// ─── Route helpers ───────────────────────────────────────────────

/**
 * Return the RAW (still url-encoded) taskId segment if `url` is a worker-log
 * stream request, else null. The caller must `decodeURIComponent` + validate
 * with {@link isValidTaskId} before use.
 */
export function matchWorkerLogStream(url: string): string | null {
  const m = LOG_STREAM_RE.exec(url);
  return m ? (m[1] ?? null) : null;
}

/** Whether a (decoded) taskId is safe to interpolate into a file path. */
export function isValidTaskId(taskId: string): boolean {
  return TASK_ID_RE.test(taskId);
}

// ─── Frame formatter ─────────────────────────────────────────────

/**
 * Serialise a {@link WorkerLogEvent} as a named SSE frame. The `event:` field
 * keeps these pushes distinct from any `data:`-only stream on the same socket.
 */
export function formatWorkerLogFrame(event: WorkerLogEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// ─── Tail ────────────────────────────────────────────────────────

/**
 * Start tailing `.tasks/task-<taskId>.log`. Returns a handle whose `close()`
 * tears down the watcher and timer. Construction is fail-safe — it never throws;
 * a watcher fault degrades to "no further lines" rather than crashing `serve`.
 */
export function startWorkerLogTail(opts: WorkerLogTailOptions): WorkerLogTail {
  const { projectRoot, taskId, onEvent } = opts;
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const logFile = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
  const tasksDir = join(projectRoot, TASKS_DIR);
  const logBasename = `task-${taskId}.log`;

  let closed = false;
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** char offset already consumed from the log file. */
  let readOffset = 0;
  /** carry for an incomplete (no trailing newline) tail between drains. */
  let lineBuffer = '';

  const now = (): string => new Date().toISOString();

  function emit(event: WorkerLogEvent): void {
    if (closed) return;
    // A throwing sink (dead SSE client, buggy formatter) must not kill the tail.
    try {
      onEvent(event);
    } catch (err) {
      debugLog('worker-logs:emit', err);
    }
  }

  /** Read fresh bytes from `readOffset`, split into complete lines, emit them. */
  function drainFresh(): void {
    if (closed || !existsSync(logFile)) return;
    let content: string;
    try {
      content = readFileSync(logFile, 'utf-8');
    } catch (err) {
      debugLog('worker-logs:read', err);
      return;
    }
    // File truncated/rotated under us → restart from the top.
    if (content.length < readOffset) {
      readOffset = 0;
      lineBuffer = '';
    }
    if (content.length <= readOffset) {
      readOffset = content.length;
      return;
    }
    const fresh = content.slice(readOffset);
    readOffset = content.length;
    lineBuffer += fresh;
    const segments = lineBuffer.split('\n');
    // The last segment has no trailing newline yet — keep it for the next drain
    // so a half-written line is never emitted split across two events.
    lineBuffer = segments.pop() ?? '';
    for (const line of segments) {
      // Drop a CR from CRLF logs; keep otherwise-empty lines out of the stream.
      const clean = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (clean.length === 0) continue;
      emit({ type: 'log_line', taskId, line: clean, ts: now() });
    }
  }

  function schedule(): void {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        drainFresh();
      } catch (err) {
        debugLog('worker-logs:drain', err);
      }
    }, debounceMs);
    timer.unref?.();
  }

  // ── Initial backfill / unavailable signal ─────────────────────
  try {
    if (existsSync(logFile)) {
      drainFresh();
    } else {
      // Honest signal — the dashboard distinguishes "no log file" from "no
      // lines yet". The watcher stays up, so a log created later still streams.
      emit({ type: 'log_unavailable', taskId, ts: now() });
    }
  } catch (err) {
    debugLog('worker-logs:backfill', err);
  }

  // ── Watch the .tasks/ dir (not the file): handles the log being created
  //    AFTER connect and avoids fs.watch on a missing path. ───────────────
  try {
    if (existsSync(tasksDir)) {
      watcher = watch(tasksDir, (_event, filename) => {
        if (closed || filename === null || filename === undefined) return;
        if (String(filename) !== logBasename) return;
        schedule();
      });
      watcher.on('error', (err) => {
        debugLog('worker-logs:watch-error', err);
      });
    }
  } catch (err) {
    // Race / unsupported — degrade to backfill-only rather than crash serve.
    debugLog('worker-logs:watch-setup', err);
  }

  return {
    close(): void {
      closed = true;
      if (watcher) {
        try {
          watcher.close();
        } catch {
          // already closed / faulted — nothing to do
        }
        watcher = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

// ─── HTTP handler ────────────────────────────────────────────────

/**
 * Wire a worker-log tail to an SSE response. The caller has already validated
 * `taskId` and passed the auth gate. The tail is torn down on client disconnect.
 */
export function handleWorkerLogStream(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
  taskId: string,
  allowedOrigin: string,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': allowedOrigin,
  });
  res.write('retry: 3000\n\n');

  const tail = startWorkerLogTail({
    projectRoot,
    taskId,
    onEvent: (ev) => {
      try {
        res.write(formatWorkerLogFrame(ev));
      } catch {
        // client gone — req.on('close') closes the tail
      }
    },
  });

  req.on('close', () => tail.close());
}
