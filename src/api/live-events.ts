// ═══ Live Event Bridge (DASH-RT-1, Sprint 284) ═════════════════════════
// Watches `.tasks/` heartbeat+result files and the active sprint's
// event-stream JSONL, pushing typed real-time events to the existing
// `/api/events` SSE channel so the dashboard reflects worker spawn/done/
// phase/action in ≤1-2s instead of waiting for the 30s auditor snapshot.
//
// Design:
//   - `.tasks/*.hb`   change → { type:'worker_heartbeat', taskId, status, currentAction, ts }
//   - `.tasks/*.result`      → { type:'worker_done', taskId, ts }
//   - `<sprint>-events.jsonl` new lines → { type:'deckent_event', event, ts }
//   - per-file debounce (≤250ms) coalesces rapid writes
//   - fail-safe: a missing dir is silently retried until it appears; a watcher
//     `error` event is swallowed; emit/onEvent are wrapped — a watcher crash
//     NEVER brings down `serve`.
//   - frames ride the EXISTING `sseClients` set via the injected `onEvent`
//     sink (server reuses its one registry — no second client set). Typed
//     pushes use a named SSE `event:` field, so the dashboard snapshot's
//     default `data:` message stream is untouched (backward-compat).

import { watch, existsSync, readFileSync, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR, TASKS_DIR } from '../core/constants.js';
import { getCurrentSprintId, type DeckentEvent } from '../core/event-stream.js';
import { debugLog } from '../core/utils.js';

// ─── Types ───────────────────────────────────────────────────────

/** A typed real-time event pushed onto the `/api/events` SSE channel. */
export interface LiveEvent {
  type: 'worker_heartbeat' | 'worker_done' | 'deckent_event';
  /** ISO 8601 emission timestamp. */
  ts: string;
  /** Present for worker_heartbeat / worker_done. */
  taskId?: string;
  /** Present for worker_heartbeat — the worker's AgentStatus string. */
  status?: string;
  /** Present for worker_heartbeat — what the worker is doing right now. */
  currentAction?: string;
  /** Present for deckent_event — the raw event-stream line. */
  event?: DeckentEvent;
}

export interface LiveEventBridge {
  close(): void;
}

export interface LiveEventBridgeOptions {
  projectRoot: string;
  /** Sink called for every typed event — server wires this to the SSE fan-out. */
  onEvent: (event: LiveEvent) => void;
  /** Per-file debounce window in ms (≤250). Default 150. */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 150;
const RETRY_INTERVAL_MS = 1000;

// ─── Frame Formatter ─────────────────────────────────────────────

/**
 * Serialise a {@link LiveEvent} as an SSE frame. The named `event:` field is
 * what keeps these typed pushes from colliding with the dashboard snapshot's
 * default (unnamed) `data:` message — the dashboard client subscribes to the
 * named events via `addEventListener`.
 */
export function formatLiveEventFrame(event: LiveEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Derive a taskId from a `.tasks/` filename. Strips the extension and an
 * optional leading `task-` so both the canonical `task-284-001.hb` and a bare
 * fixture like `test-smoke.hb` resolve to a usable id.
 */
function deriveTaskId(filename: string, ext: string): string {
  let base = filename;
  if (base.endsWith(ext)) base = base.slice(0, -ext.length);
  if (base.startsWith('task-')) base = base.slice('task-'.length);
  return base;
}

// ─── Bridge ──────────────────────────────────────────────────────

/**
 * Start the live event bridge. Returns a handle whose `close()` tears down
 * every watcher and timer. Construction is fail-safe — it never throws; on any
 * setup error it returns an inert (but closeable) handle so `serve` stays up.
 */
export function startLiveEventBridge(opts: LiveEventBridgeOptions): LiveEventBridge {
  const { projectRoot, onEvent } = opts;
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let closed = false;
  const watchers: FSWatcher[] = [];
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const retryTimers = new Set<ReturnType<typeof setInterval>>();
  /** event-stream JSONL char offsets already consumed (per file). */
  const offsets = new Map<string, number>();
  let eventsTimer: ReturnType<typeof setTimeout> | null = null;

  const now = (): string => new Date().toISOString();

  function emit(event: LiveEvent): void {
    if (closed) return;
    // A throwing sink (a dead SSE client, a buggy formatter) must not kill the
    // bridge — swallow so the next file change still flows.
    try {
      onEvent(event);
    } catch (err) {
      debugLog('live-events:emit', err);
    }
  }

  // ── `.tasks/` heartbeat + result ──────────────────────────────

  function emitHeartbeat(filename: string): void {
    let taskId = deriveTaskId(filename, '.hb');
    let status: string | undefined;
    let currentAction: string | undefined;
    // Read the hb body for richer fields; a partial write or non-JSON fixture
    // falls back to the filename-derived id (so the smoke `test-smoke.hb` still
    // surfaces a heartbeat).
    try {
      const raw = readFileSync(join(projectRoot, TASKS_DIR, filename), 'utf-8');
      const hb = JSON.parse(raw) as { taskId?: unknown; status?: unknown; currentAction?: unknown };
      if (typeof hb.taskId === 'string' && hb.taskId.length > 0) taskId = hb.taskId;
      if (typeof hb.status === 'string') status = hb.status;
      if (typeof hb.currentAction === 'string') currentAction = hb.currentAction;
    } catch {
      // keep filename-derived id; status/currentAction stay undefined
    }
    emit({ type: 'worker_heartbeat', taskId, status, currentAction, ts: now() });
  }

  function handleTaskFile(filename: string): void {
    if (closed || !filename) return;
    if (filename.endsWith('.hb')) {
      emitHeartbeat(filename);
    } else if (filename.endsWith('.result')) {
      emit({ type: 'worker_done', taskId: deriveTaskId(filename, '.result'), ts: now() });
    }
  }

  function scheduleTaskFile(filename: string): void {
    if (closed || !filename || (!filename.endsWith('.hb') && !filename.endsWith('.result'))) return;
    const existing = debounceTimers.get(filename);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      debounceTimers.delete(filename);
      try {
        handleTaskFile(filename);
      } catch (err) {
        debugLog('live-events:task', err);
      }
    }, debounceMs);
    t.unref?.();
    debounceTimers.set(filename, t);
  }

  // ── `<sprint>-events.jsonl` tail ──────────────────────────────

  function tailActiveEvents(): void {
    if (closed) return;
    const sprintId = getCurrentSprintId(projectRoot);
    if (!sprintId) return;
    const file = join(projectRoot, DECKENT_DIR, `${sprintId}-events.jsonl`);
    if (!existsSync(file)) return;
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch (err) {
      debugLog('live-events:tail-read', err);
      return;
    }
    const prev = offsets.get(file) ?? 0;
    if (content.length <= prev) {
      offsets.set(file, content.length);
      return;
    }
    const fresh = content.slice(prev);
    offsets.set(file, content.length);
    for (const line of fresh.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as DeckentEvent;
        emit({ type: 'deckent_event', event, ts: now() });
      } catch {
        // skip partial / malformed line — a later write completes it
      }
    }
  }

  function scheduleDeckentFile(filename: string): void {
    if (closed || !filename || !filename.endsWith('-events.jsonl')) return;
    if (eventsTimer) clearTimeout(eventsTimer);
    eventsTimer = setTimeout(() => {
      eventsTimer = null;
      try {
        tailActiveEvents();
      } catch (err) {
        debugLog('live-events:tail', err);
      }
    }, debounceMs);
    eventsTimer.unref?.();
  }

  /**
   * Prime the active events file offset to its current size so the bridge only
   * streams lines written AFTER it started — never replays the whole sprint
   * history on the first dashboard connect.
   */
  function primeEventsOffset(): void {
    try {
      const sprintId = getCurrentSprintId(projectRoot);
      if (!sprintId) return;
      const file = join(projectRoot, DECKENT_DIR, `${sprintId}-events.jsonl`);
      if (existsSync(file)) {
        offsets.set(file, readFileSync(file, 'utf-8').length);
      }
    } catch (err) {
      debugLog('live-events:prime', err);
    }
  }

  // ── Watcher setup (with silent retry on a missing dir) ────────

  function setupDirWatch(dir: string, onFile: (filename: string) => void): void {
    if (closed) return;
    if (!existsSync(dir)) {
      // Silent-wait: the dir (e.g. `.tasks/` before the first sprint) may not
      // exist yet. Retry until it appears, then attach. unref'd so it never
      // keeps the event loop alive on its own.
      const retry = setInterval(() => {
        if (closed || existsSync(dir)) {
          clearInterval(retry);
          retryTimers.delete(retry);
          if (!closed) setupDirWatch(dir, onFile);
        }
      }, RETRY_INTERVAL_MS);
      retry.unref?.();
      retryTimers.add(retry);
      return;
    }
    try {
      const w = watch(dir, (_event, filename) => {
        if (closed || filename === null || filename === undefined) return;
        try {
          // `filename` is the changed entry's basename (string on Linux/macOS).
          onFile(String(filename));
        } catch (err) {
          debugLog('live-events:watch-cb', err);
        }
      });
      // An emitted 'error' with no listener throws — attach a swallow so a
      // watcher fault degrades to "no live events" instead of crashing serve.
      w.on('error', (err) => {
        debugLog('live-events:watch-error', err);
      });
      watchers.push(w);
    } catch (err) {
      // Race: dir removed between existsSync and watch(). Fail-safe.
      debugLog('live-events:watch-setup', err);
    }
  }

  try {
    primeEventsOffset();
    setupDirWatch(join(projectRoot, TASKS_DIR), scheduleTaskFile);
    setupDirWatch(join(projectRoot, DECKENT_DIR), scheduleDeckentFile);
  } catch (err) {
    debugLog('live-events:start', err);
  }

  return {
    close(): void {
      closed = true;
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // already closed / fault — nothing to do
        }
      }
      watchers.length = 0;
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();
      for (const r of retryTimers) clearInterval(r);
      retryTimers.clear();
      if (eventsTimer) {
        clearTimeout(eventsTimer);
        eventsTimer = null;
      }
    },
  };
}
