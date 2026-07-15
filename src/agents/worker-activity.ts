// ─── WORKER-LIVE-LOG (MASTER-PLAN #582, SURF-1c) ─────────────────────────────
// Alperen (2026-07-14): "workers write their log at the END; I want it LIVE —
// short-form line + click-through detail, or I can't build a good interface."
//
// This module adds a worker-ACTIVITY channel to the EXISTING event stream
// (no second mechanism): every emission is one short-form line (≤80 chars,
// the live-feed row) plus a structured detail payload (the click-through).
// The line/detail contract is IDENTICAL to routing's DecisionStory steps —
// terminal and Desktop render both feeds with one component.
//
// Emission sources (foundation slice):
//   · worker.ts writeHeartbeat — status transitions + files-changed deltas
//   · agentic-worker-runner's progress emitter — per-step dual-write
// Richer tool-by-tool Claude-CLI activity lands with the SURF-3 client work.
//
// Flag-gated on `live_trace.enabled` (the ONE existing toggle for worker
// progress streams). Fail-soft: an emission failure never touches the worker.

import { writeEvent, CHANNELS, getCurrentSprintId } from '../core/event-stream.js';
import { debugLog } from '../core/utils.js';

export const ACTIVITY_LINE_MAX = 80;

/** Clip a line to the live-feed width (ellipsis, never mid-codepoint garbage). */
export function clipActivityLine(line: string): string {
  const flat = line.replace(/\s+/g, ' ').trim();
  return flat.length <= ACTIVITY_LINE_MAX ? flat : `${flat.slice(0, ACTIVITY_LINE_MAX - 1)}…`;
}

export interface WorkerActivity {
  taskId: string;
  workerId?: string;
  /** Short-form live-feed row (clipped to 80 here — callers pass raw text). */
  line: string;
  /** Activity kind — the feed's icon/filter key. */
  kind: 'status' | 'file' | 'step' | 'test' | 'result';
  /** Click-through payload (current file, step detail, counts…). */
  detail?: Record<string, unknown>;
}

/**
 * Emit one worker-activity event onto the sprint event stream. Fail-soft and
 * cheap when disabled — callers pass the resolved `live_trace.enabled` flag
 * (workers already carry their config; no per-emission config load).
 */
export function emitWorkerActivity(
  projectRoot: string,
  enabled: boolean,
  activity: WorkerActivity,
  sprintId?: string,
): void {
  if (!enabled) return;
  try {
    const sid = sprintId ?? getCurrentSprintId(projectRoot);
    if (!sid) return;
    writeEvent(projectRoot, sid, 'worker', '*', CHANNELS.ACTIVITY, {
      taskId: activity.taskId,
      ...(activity.workerId ? { workerId: activity.workerId } : {}),
      line: clipActivityLine(activity.line),
      kind: activity.kind,
      ...(activity.detail ? { detail: activity.detail } : {}),
    });
  } catch (err) {
    debugLog('worker-activity:emit', err);
  }
}
