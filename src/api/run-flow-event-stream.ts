// ═══ run-flow-event-stream — TERM-FLOW-UNIFY Sprint-7 dilim (429-009) ══════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md, Sprint-7 row: "Yeni
// api/run-flow-routes.ts, api/run-flow-event-stream.ts" — the SSE sibling of
// 429-008's REST routes. Streams versioned `RunFlowEvent` objects
// (core/run-flow-contract.ts) to a single flow's subscribers over
// `GET /api/run-flow/:flowId/events` — flowId-scoped ONLY, never a global
// broadcast (task nogo: "global-broadcast (scope'suz) NO_GO").
//
// Pattern precedent: this is a path-segment-scoped single-resource stream —
// the same shape as worker-logs.ts's `/api/workers/:taskId/logs/stream`
// (matchWorkerLogStream/isValidTaskId/formatWorkerLogFrame/
// handleWorkerLogStream), copy-adapted here for flowId instead of taskId
// ("mevcut api SSE desenini kopyala-uyarla").
//
// SCOPE NOTE (429-009 write-authority): `run-flow-routes.ts` (429-008) is
// NOT in this task's scope.filesWrite. Its handlers build RunFlowEvent
// objects internally via reduceRunFlow but never emit them anywhere. This
// module therefore ships the flowId-scoped pub/sub + SSE-stream
// infrastructure and its server.ts route registration (exactly what this
// task's Description asks for: "flowId-scoped subscribe" + "server.ts'e
// route+stream kayıtları"); a production caller that actually invokes
// `publishRunFlowEvent` from run-flow-routes.ts's transition sites is a
// follow-up outside this task's write authority (see .result notes).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../core/config.js';
import type { RunFlowEvent } from '../core/run-flow-contract.js';
import { readFlowEvents } from '../core/run-flow-store.js';

const RUN_FLOW_STREAM_DISABLED_MESSAGE =
  'run-flow event-stream is disabled — set terminal.run_flow_v2: true in .deckent/config.json to enable /api/run-flow/:flowId/events';

/** `/api/run-flow/:flowId/events` (optionally with a query string). */
const RUN_FLOW_EVENT_STREAM_RE = /^\/api\/run-flow\/([^/?]+)\/events(?:\?|$)/;

/** Path-segment guard for `:flowId` — same charset as run-flow-routes.ts's
 *  own FLOW_ID_RE (duplicated: that regex is private to the sibling module,
 *  which is outside this task's write scope). Production flowIds are always
 *  randomUUID() output, which this pattern already covers. */
const FLOW_ID_RE = /^[a-zA-Z0-9_-]+$/;

// ─── Route matching ─────────────────────────────────────────────────────

/**
 * Return the RAW (still url-encoded) flowId segment if `url` is a run-flow
 * event-stream request, else null. The caller must `decodeURIComponent` +
 * validate with {@link isValidRunFlowId} before use.
 */
export function matchRunFlowEventStream(url: string): string | null {
  const m = RUN_FLOW_EVENT_STREAM_RE.exec(url);
  return m ? (m[1] ?? null) : null;
}

/** Whether a (decoded) flowId is safe to use as a subscription key. */
export function isValidRunFlowId(flowId: string): boolean {
  return FLOW_ID_RE.test(flowId);
}

// ─── flowId-scoped pub/sub ──────────────────────────────────────────────

type RunFlowEventListener = (event: RunFlowEvent) => void;

const subscribers = new Map<string, Set<RunFlowEventListener>>();

/**
 * Publish a RunFlowEvent to every subscriber of THAT event's flowId only —
 * never a global broadcast (task nogo: "global-broadcast (scope'suz) NO_GO").
 * A flowId with no subscribers is a silent no-op (nothing buffers/backfills
 * here — a stream connects to observe events from the moment it subscribes).
 */
export function publishRunFlowEvent(event: RunFlowEvent): void {
  const listeners = subscribers.get(event.flowId);
  if (!listeners || listeners.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // a faulting subscriber must not break fan-out to the others
    }
  }
}

/** Subscribe to a single flow's events. Returns an unsubscribe function. */
export function subscribeRunFlowEvents(flowId: string, listener: RunFlowEventListener): () => void {
  let set = subscribers.get(flowId);
  if (!set) {
    set = new Set();
    subscribers.set(flowId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) subscribers.delete(flowId);
  };
}

/** Test-only seam — clears all in-process subscriptions between tests. */
export function _resetRunFlowEventStreamState(): void {
  subscribers.clear();
}

// ─── Frame formatter ─────────────────────────────────────────────────────

/**
 * Serialise a {@link RunFlowEvent} as a named SSE frame — the `event:` field
 * carries the versioned event's own `type` (e.g. `PREVIEW_READY`), and the
 * `data:` payload is the exact event object (schemaVersion/flowId/timestamp/
 * type/... preserved verbatim — "versioned-event şekli korunur").
 */
export function formatRunFlowEventFrame(event: RunFlowEvent): string {
  // SURF-2: the durable sequence rides the SSE `id:` line, so EventSource's
  // native Last-Event-ID reconnect carries the replay cursor for free.
  const idLine = typeof event.sequence === 'number' ? `id: ${event.sequence}\n` : '';
  return `${idLine}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// ─── HTTP handler ────────────────────────────────────────────────────────

/**
 * Wire a single flow's event subscription to an SSE response. The caller has
 * already flag-checked and validated `flowId`. The subscription is torn down
 * on client disconnect.
 */
export function handleRunFlowEventStream(
  req: IncomingMessage,
  res: ServerResponse,
  flowId: string,
  allowedOrigin: string,
  projectRoot?: string,
): () => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': allowedOrigin,
  });
  res.write('retry: 3000\n\n');

  // ── SURF-2 replay-cursor: `?after=N` or the EventSource-native
  //    Last-Event-ID header selects the durable backfill start. Race-closed:
  //    subscribe FIRST (live events buffer), then backfill from the durable
  //    log, then flush any buffered live event newer than the backfill tail.
  const afterParam = (() => {
    try {
      const q = new URL(req.url ?? '', 'http://localhost').searchParams.get('after');
      if (q !== null) return Number.parseInt(q, 10);
    } catch { /* fall through */ }
    const header = req.headers['last-event-id'];
    if (typeof header === 'string') return Number.parseInt(header, 10);
    return null;
  })();
  const afterSequence = afterParam !== null && Number.isFinite(afterParam) && afterParam >= 0 ? afterParam : null;

  let backfilling = afterSequence !== null && projectRoot !== undefined;
  let backfillTail = afterSequence ?? 0;
  const liveBuffer: RunFlowEvent[] = [];

  const writeFrame = (event: RunFlowEvent): void => {
    try {
      res.write(formatRunFlowEventFrame(event));
    } catch {
      // client gone — req.on('close') below tears the subscription down
    }
  };

  const unsubscribe = subscribeRunFlowEvents(flowId, (event) => {
    if (backfilling) {
      liveBuffer.push(event);
      return;
    }
    writeFrame(event);
  });

  if (backfilling && projectRoot !== undefined && afterSequence !== null) {
    try {
      const backlog = readFlowEvents(projectRoot, flowId, { afterSequence });
      for (const event of backlog) {
        writeFrame(event);
        if (typeof event.sequence === 'number' && event.sequence > backfillTail) backfillTail = event.sequence;
      }
    } catch {
      // durable read failure degrades to live-only — never kills the stream
    }
    backfilling = false;
    for (const buffered of liveBuffer) {
      if (typeof buffered.sequence === 'number' && buffered.sequence <= backfillTail) continue; // already replayed
      writeFrame(buffered);
    }
    liveBuffer.length = 0;
  }

  let closed = false;
  function cleanup(): void {
    if (closed) return;
    closed = true;
    unsubscribe();
  }
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);

  return cleanup;
}

// ─── Route dispatch ──────────────────────────────────────────────────────

/**
 * Handle `GET /api/run-flow/:flowId/events`. Returns true when the route
 * matched (a response was sent or the SSE stream was opened), false to let
 * the caller fall through — same true/false contract as every other
 * register*Route in server.ts's dispatch chain.
 *
 * Flag-gated behind `terminal.run_flow_v2` (checked FIRST, same order and
 * message convention as run-flow-routes.ts's own gate) — while off, the
 * whole endpoint answers 404, never a hanging/empty stream.
 */
export async function registerRunFlowEventStreamRoute(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
  req: IncomingMessage,
  allowedOrigin: string,
): Promise<boolean> {
  if (method !== 'GET') return false;
  const rawFlowId = matchRunFlowEventStream(url);
  if (rawFlowId === null) return false;

  const config = await loadConfig(projectRoot);
  if (config.terminal?.run_flow_v2 !== true) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: RUN_FLOW_STREAM_DISABLED_MESSAGE }));
    return true;
  }

  let flowId: string;
  try {
    flowId = decodeURIComponent(rawFlowId);
  } catch {
    flowId = rawFlowId; // malformed %-escape → fails the regex below
  }
  if (!isValidRunFlowId(flowId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid flow id' }));
    return true;
  }

  handleRunFlowEventStream(req, res, flowId, allowedOrigin, projectRoot);
  return true;
}
