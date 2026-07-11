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
import { LOG_EVENT_TYPES, type LogEvent, type LogEventType } from '../core/log-event.js';

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
  /**
   * When true, a line that parses as a {@link LogEvent} (born-639(3)) is
   * rewritten to a human-readable `[type] summary` string before emission.
   * A line that does not parse (or doesn't match the LogEvent shape — legacy
   * codex/gemini plain-text logs, a partial/truncated line) passes through
   * byte-for-byte — never lossy. Default false (today's raw passthrough),
   * so existing callers of {@link startWorkerLogTail} are unaffected.
   */
  renderHuman?: boolean;
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

// ─── Human-render layer (born-639(3), Sprint 408 Task 408-003) ───
//
// `.log` is JSONL of `LogEvent` (src/core/log-event.ts) since 402-002 — the
// raw-tail SSE panel was rendering that JSON verbatim, which is unreadable
// for a human. This layer is opt-in (`?render=human`, wired in
// `handleWorkerLogStream` below): a line that parses as a LogEvent is
// rewritten to `[type] summary`; anything else (non-JSON text, a JSON object
// that isn't LogEvent-shaped, a half-written line) passes through unchanged
// — the on-disk `.log` file is never touched, so this is never lossy.

const LOG_EVENT_TYPE_SET: ReadonlySet<string> = new Set(LOG_EVENT_TYPES);
/** Cap on any extracted/serialized snippet embedded in a rendered line. */
const SNIPPET_MAX = 80;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isLogEventShape(v: unknown): v is LogEvent {
  return isRecord(v) && typeof v.type === 'string' && LOG_EVENT_TYPE_SET.has(v.type) && 'content' in v;
}

function truncate(s: string): string {
  return s.length > SNIPPET_MAX ? `${s.slice(0, SNIPPET_MAX)}…` : s;
}

/** Best-effort `JSON.stringify`, truncated — the last-resort summary for an unrecognized shape. */
function jsonSnippet(content: unknown): string {
  try {
    const s = JSON.stringify(content);
    return s ? truncate(s) : '';
  } catch {
    return '';
  }
}

/** Extract a tool-call's name + a short args snippet from any known provider shape. */
function extractToolUse(content: unknown): { name: string | null; argsSnippet: string } {
  if (!isRecord(content)) return { name: null, argsSnippet: '' };
  if (typeof content.name === 'string') {
    return { name: content.name, argsSnippet: argsSnippetOf(content.input ?? content.arguments) };
  }
  const msg = isRecord(content.message) ? (content.message as Record<string, unknown>) : null;
  if (msg && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (isRecord(block) && block.type === 'tool_use') {
        return {
          name: typeof block.name === 'string' ? block.name : null,
          argsSnippet: argsSnippetOf(block.input),
        };
      }
    }
  }
  return { name: null, argsSnippet: '' };
}

function argsSnippetOf(args: unknown): string {
  if (args === undefined || args === null) return '';
  const s = typeof args === 'string' ? args : jsonSnippet(args);
  return truncate(s);
}

/** Extract plain text content from any known provider chunk shape. */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!isRecord(content)) return '';
  if (typeof content.response === 'string') return content.response;
  if (isRecord(content.delta) && typeof content.delta.text === 'string') return content.delta.text;
  if (Array.isArray(content.choices) && content.choices.length > 0) {
    const choice = content.choices[0];
    if (isRecord(choice)) {
      const delta = (choice.delta ?? choice.message) as Record<string, unknown> | undefined;
      if (delta && typeof delta.content === 'string') return delta.content;
    }
  }
  const msg = isRecord(content.message) ? (content.message as Record<string, unknown>) : null;
  if (msg) {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      const texts = msg.content
        .filter((b): b is Record<string, unknown> => isRecord(b) && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string);
      if (texts.length > 0) return texts.join(' ');
    }
  }
  return '';
}

/** Extract a compact `in:N out:N` token summary from any known provider usage shape. */
function extractUsageSummary(content: unknown): string {
  if (!isRecord(content)) return '';
  if (isRecord(content.usage)) {
    const u = content.usage;
    const input = u.input_tokens ?? u.inputTokens ?? u.prompt_tokens ?? 0;
    const output = u.output_tokens ?? u.outputTokens ?? u.completion_tokens ?? 0;
    return `in:${input} out:${output}`;
  }
  if (isRecord(content.usageMetadata)) {
    const u = content.usageMetadata;
    return `in:${u.promptTokenCount ?? 0} out:${u.candidatesTokenCount ?? 0}`;
  }
  if (typeof content.prompt_eval_count === 'number' || typeof content.eval_count === 'number') {
    return `in:${content.prompt_eval_count ?? 0} out:${content.eval_count ?? 0}`;
  }
  return '';
}

function summarizeLogEventContent(type: LogEventType, content: unknown): string {
  switch (type) {
    case 'tool_use': {
      const { name, argsSnippet } = extractToolUse(content);
      const label = name ?? 'unknown-tool';
      return argsSnippet ? `${label} ${argsSnippet}` : label;
    }
    case 'tool_result':
      return extractText(content) || jsonSnippet(content) || 'result';
    case 'text':
      return extractText(content) || '(empty)';
    case 'stderr':
      return extractText(content) || jsonSnippet(content) || '(empty)';
    case 'usage':
      return extractUsageSummary(content) || jsonSnippet(content) || '(empty)';
    case 'lifecycle': {
      if (!isRecord(content)) return 'event';
      const sub = typeof content.type === 'string' ? content.type : typeof content.subtype === 'string' ? content.subtype : null;
      return sub ?? 'event';
    }
    case 'turn':
      return 'started';
    default:
      return jsonSnippet(content);
  }
}

/**
 * Render one raw `.log` JSONL line as a human-readable `[type] summary`
 * string. A line that does not parse as JSON, or parses but doesn't match
 * the {@link LogEvent} shape (`{type, content}` with a recognized `type`),
 * passes through byte-for-byte — legacy codex/gemini plain-text lines and
 * partial/truncated lines are never dropped or corrupted.
 */
export function renderLogLineHuman(line: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return line;
  }
  if (!isLogEventShape(parsed)) return line;
  return `[${parsed.type}] ${summarizeLogEventContent(parsed.type, parsed.content)}`;
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
  const renderHuman = opts.renderHuman ?? false;
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
      const rendered = renderHuman ? renderLogLineHuman(clean) : clean;
      emit({ type: 'log_line', taskId, line: rendered, ts: now() });
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
 *
 * Opt-in human render (born-639(3)): `?render=human` rewrites each parseable
 * `LogEvent` line to `[type] summary`. Any other/absent `render` value keeps
 * the original raw-JSONL passthrough — the default, pre-408-003 behavior.
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

  let renderHuman = false;
  try {
    renderHuman = new URL(req.url ?? '', 'http://localhost').searchParams.get('render') === 'human';
  } catch (err) {
    debugLog('worker-logs:render-param', err);
  }

  const tail = startWorkerLogTail({
    projectRoot,
    taskId,
    renderHuman,
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
