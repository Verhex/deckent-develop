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
import type { StreamLogEvent } from '../core/log-event.js';

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
  /** Activity kind — the feed's icon/filter key. `'tool'` (SURF-3 Claude-CLI
   *  rich-stream) is a per-tool call/result line; the terminal consumer
   *  (status-renderer.ts) renders `line` kind-agnostically, so extending this
   *  closed union is additive. */
  kind: 'status' | 'file' | 'step' | 'test' | 'result' | 'tool';
  /** Click-through payload (current file, step detail, counts…). */
  detail?: Record<string, unknown>;
}

// ─── Claude-CLI rich-stream → activity (SURF-3, S1 pure map) ─────────────────
//
// `normalizeStreamEvent` (core/log-event.ts) already classifies a Claude-CLI
// stream-json line into tool_use/tool_result/usage/text/turn/lifecycle. This
// pure map turns the tool events into a live ACTIVITY line ("🔧 Edit(src/x.ts)"
// / "↳ ✓"), extracting the tool name+input the classifier keeps but does not
// unpack. Everything else → null (not a per-tool activity). S1 is the map only;
// wiring it to a live-streamable backend (captureStreamToLog's onEvent) is S2.

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Find the first content block of `blockType` in an SDK message envelope
 *  (`content.message.content[]`), else undefined. */
function findBlock(content: unknown, blockType: string): Record<string, unknown> | undefined {
  if (!isRec(content) || !isRec(content['message'])) return undefined;
  const blocks = (content['message'] as Record<string, unknown>)['content'];
  if (!Array.isArray(blocks)) return undefined;
  return blocks.find((b): b is Record<string, unknown> => isRec(b) && b['type'] === blockType);
}

/** The most identifying arg of a tool call (path / command / url / pattern) —
 *  the same precedence loop.ts's permission `primaryResource` uses. */
function primaryToolArg(input: unknown): string | undefined {
  if (!isRec(input)) return undefined;
  const v = input['path'] ?? input['file_path'] ?? input['cmd'] ?? input['command'] ?? input['url'] ?? input['pattern'];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Map a normalized Claude-CLI stream event to a per-tool `WorkerActivity`, or
 * `null` for anything that is not a tool call/result (text/usage/turn/…). Pure
 * — no I/O, never throws (defends every field). `line` is clipped by
 * `emitWorkerActivity` at write time, so callers pass the raw text.
 */
export function logEventToActivity(ev: StreamLogEvent, taskId: string, workerId?: string): WorkerActivity | null {
  const base = { taskId, ...(workerId ? { workerId } : {}) };
  if (ev.type === 'tool_use') {
    // SDK envelope (content.message.content[]) or raw streaming (content.content_block).
    const block = findBlock(ev.content, 'tool_use')
      ?? (isRec(ev.content) && isRec(ev.content['content_block']) ? (ev.content['content_block'] as Record<string, unknown>) : undefined);
    const name = block && typeof block['name'] === 'string' ? block['name'] : undefined;
    if (!name) return null;
    const arg = primaryToolArg(block?.['input']);
    return {
      ...base,
      kind: 'tool',
      line: `🔧 ${name}${arg ? `(${arg})` : ''}`,
      detail: { tool: name, ...(block?.['input'] !== undefined ? { args: block['input'] } : {}) },
    };
  }
  if (ev.type === 'tool_result') {
    const block = findBlock(ev.content, 'tool_result')
      ?? (isRec(ev.content) && isRec(ev.content['content_block']) ? (ev.content['content_block'] as Record<string, unknown>) : undefined);
    // tool_result carries no tool name (only tool_use_id) — a compact ok/error mark.
    const isError = block?.['is_error'] === true;
    return {
      ...base,
      kind: 'tool',
      line: isError ? '↳ ✗ error' : '↳ ✓ ok',
      detail: { ok: !isError, ...(typeof block?.['tool_use_id'] === 'string' ? { toolUseId: block['tool_use_id'] } : {}) },
    };
  }
  return null;
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
