// ─── Evaluate-Health API Endpoint (born-484 observability slice) ────────────
// GET /api/evaluate-health[?n=] — counts EVALUATION_FAULT / EVALUATE_ABORTED /
// EVALUATE_PREMATURE / RESULT_CONTRACT_DRIFT events across the last-N sprint
// event streams, for the dashboard EvaluateHealthCard. Read-only: this module
// never writes an event, and (per this task's NO_GO scope) is NOT wired into
// server.ts — see the wiring note at the bottom of this file.
//
// Channel constants below are a MIRROR (not an import) of the literal
// channel strings emitted at their call sites: 'BRAIN→AUDITOR:EVALUATION_FAULT'
// / 'BRAIN→AUDITOR:EVALUATE_PREMATURE' / 'BRAIN→AUDITOR:EVALUATE_ABORTED' are
// inline literals in orchestra/sprint-phases.ts (not exported anywhere), and
// while RESULT_CONTRACT_DRIFT_CHANNEL IS exported from
// orchestra/result-collector.ts, that module pulls in tmux/worker-ipc/spawn
// internals — importing it from a thin api/ read surface would violate
// ADR-D-004 C2/C3 (surfaces stay thin; api/ MAY call core/ + *approved*
// orchestra entrypoints, not internal Brain-family modules). Mirroring the
// literal here follows the same "replicated, not imported" precedent as
// kpi-trend-endpoint.ts's resolveTenant/parseWindow.
//
// "Last event time" uses the event ENVELOPE's `timestamp` field (always
// present, set by writeEvent itself) rather than any payload field — the
// RESULT_CONTRACT_DRIFT payload uses `emittedAt` while the other three use
// `timestamp`, so the envelope field is the only consistently-named source.

import type { ServerResponse } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RECENT_WORKS_DIR } from '../core/constants.js';
import { readEvents, type DeckentEvent } from '../core/event-stream.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** Default / max "last N sprints" scan window for `?n=` (mirrors kpi-trend-endpoint.ts). */
const DEFAULT_N = 20;
const MAX_N = 200;

export const EVALUATE_HEALTH_CHANNELS = {
  EVALUATION_FAULT: 'BRAIN→AUDITOR:EVALUATION_FAULT',
  EVALUATE_ABORTED: 'BRAIN→AUDITOR:EVALUATE_ABORTED',
  EVALUATE_PREMATURE: 'BRAIN→AUDITOR:EVALUATE_PREMATURE',
  RESULT_CONTRACT_DRIFT: 'BRAIN→AUDITOR:RESULT_CONTRACT_DRIFT',
} as const;

export type EvaluateHealthChannelKey = keyof typeof EVALUATE_HEALTH_CHANNELS;

export type EvaluateHealthCounts = Record<EvaluateHealthChannelKey, number>;

/** Pure aggregation output (no `generatedAt` — that's assigned at the I/O boundary). */
export interface EvaluateHealthSummary {
  counts: EvaluateHealthCounts;
  lastEventAt: string | null;
  sprintsScanned: number;
  clean: boolean;
}

export interface EvaluateHealthResponse extends EvaluateHealthSummary {
  generatedAt: string;
}

const CHANNEL_TO_KEY: ReadonlyMap<string, EvaluateHealthChannelKey> = new Map(
  (Object.entries(EVALUATE_HEALTH_CHANNELS) as Array<[EvaluateHealthChannelKey, string]>).map(
    ([key, channel]) => [channel, key],
  ),
);

/**
 * Parse the `?n=` window. A positive integer in [1, MAX_N]; anything missing,
 * non-numeric, or out of range falls back to DEFAULT_N.
 */
export function parseSprintWindow(raw: string | null): number {
  if (raw === null) return DEFAULT_N;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_N;
  return Math.min(n, MAX_N);
}

const SPRINT_EVENTS_FILE_RE = /^sprint-(\d+)-events\.jsonl$/;

/**
 * Discover the N most-recently-numbered sprint ids that have an events.jsonl
 * file under `.deckent/recently-works` (the long-lived 'autonomous' stream
 * and any `-archive`/`.1` rotation files never match this regex, so they're
 * naturally excluded). Fail-safe: returns [] if the directory is absent or
 * unreadable — never throws.
 */
export function listRecentSprintIds(projectRoot: string, n: number): string[] {
  const dir = join(projectRoot, RECENT_WORKS_DIR);
  if (!existsSync(dir)) return [];
  try {
    const numbered: Array<{ id: string; num: number }> = [];
    for (const file of readdirSync(dir)) {
      const match = SPRINT_EVENTS_FILE_RE.exec(file);
      if (match) numbered.push({ id: `sprint-${match[1]}`, num: Number(match[1]) });
    }
    numbered.sort((a, b) => b.num - a.num);
    return numbered.slice(0, n).map((entry) => entry.id);
  } catch {
    return [];
  }
}

/**
 * Pure aggregation over a flat event list (already merged across whichever
 * sprints the caller chose to scan). Exported so tests can exercise it with a
 * fake in-memory event stream — no disk I/O required.
 */
export function aggregateEvaluateHealth(
  events: ReadonlyArray<Pick<DeckentEvent, 'channel' | 'timestamp'>>,
  sprintsScanned: number,
): EvaluateHealthSummary {
  const counts: EvaluateHealthCounts = {
    EVALUATION_FAULT: 0,
    EVALUATE_ABORTED: 0,
    EVALUATE_PREMATURE: 0,
    RESULT_CONTRACT_DRIFT: 0,
  };
  let lastEventAt: string | null = null;

  for (const event of events) {
    const key = CHANNEL_TO_KEY.get(event.channel);
    if (!key) continue;
    counts[key] += 1;
    if (lastEventAt === null || event.timestamp > lastEventAt) {
      lastEventAt = event.timestamp;
    }
  }

  const clean = Object.values(counts).every((count) => count === 0);
  return { counts, lastEventAt, sprintsScanned, clean };
}

/**
 * Handle GET /api/evaluate-health[?n=]. Returns true when the route matched
 * (and a response was sent). Read-only: only calls `readEvents`, never
 * `writeEvent`.
 */
export function registerEvaluateHealthRoute(
  url: string,
  res: ServerResponse,
  projectRoot: string,
): boolean {
  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/evaluate-health') return false;

  try {
    const n = parseSprintWindow(parsed.searchParams.get('n'));
    const sprintIds = listRecentSprintIds(projectRoot, n);
    const events = sprintIds.flatMap((sprintId) => readEvents(projectRoot, sprintId));
    const summary = aggregateEvaluateHealth(events, sprintIds.length);
    sendJson(res, { ...summary, generatedAt: new Date().toISOString() } satisfies EvaluateHealthResponse);
  } catch (e) {
    sendJson(res, { error: String(e) }, 500);
  }
  return true;
}

// ─── server.ts wiring (NOT applied — out of this task's write scope) ────────
// One-line addition alongside the other `register*Route` call sites in
// src/api/server.ts's request handler chain:
//
//   import { registerEvaluateHealthRoute } from './evaluate-health-endpoint.js';
//   ...
//   if (registerEvaluateHealthRoute(req.url ?? '', res, projectRoot)) return;
