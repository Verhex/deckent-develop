/**
 * alert-emitter.ts — Sprint 166 T9 emitAlert helper
 *
 * emitAlert(type, payload) writes to:
 *   1. .dashboard.json alerts array (atomic read+write, fail-safe)
 *   2. .deckent/<sprintId>-events.jsonl via writeEvent() (M4 monitoring source codepath)
 *
 * Sprint 282: identity-based dedup — same (source) alert increments count+lastSeenAt
 * instead of appending a new entry (DASH-UX-4).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DASHBOARD_FILE } from '../core/constants.js';
import { AlertLevel } from '../core/types.js';
import type { Alert, DashboardState } from '../core/types.js';
import { writeEvent, CHANNELS } from '../orchestra/event-stream.js';

export type AlertType = 'stale_md' | 'boundary_violation' | 'pattern_detected' | string;

export interface AlertPayload {
  type: AlertType;
  message: string;
  source?: string;
  [key: string]: unknown;
}

/** Alert extended with dedup tracking fields. */
type DedupAlert = Alert & { lastSeenAt?: string };

/** Maximum number of alerts retained in the dashboard (most recent N). */
const MAX_ALERTS = 50;

/**
 * Deduplicate an alert list by source identity.
 * Incoming alert is upserted: if an entry with the same source exists, its
 * count and lastSeenAt are updated; otherwise a new entry is appended.
 * The resulting list is capped at MAX_ALERTS (most recent entries retained).
 */
export function deduplicateAlert(alerts: Alert[], incoming: DedupAlert): DedupAlert[] {
  const list = alerts as DedupAlert[];
  const key = incoming.source ?? '';
  const existing = list.find((a) => (a.source ?? '') === key);
  if (existing) {
    existing.count = (existing.count ?? 1) + 1;
    existing.lastSeenAt = incoming.lastSeenAt ?? incoming.timestamp;
    // Update message to latest (e.g. fresh mtime in the stale_md message)
    existing.message = incoming.message;
    return list;
  }
  const updated = [...list, { ...incoming, count: 1, lastSeenAt: incoming.lastSeenAt ?? incoming.timestamp }];
  // Keep most recent MAX_ALERTS entries
  return updated.slice(-MAX_ALERTS);
}

/**
 * Emit an alert to both .dashboard.json and the sprint events stream.
 * Never throws — all I/O failures are suppressed to keep the scan loop stable.
 */
export function emitAlert(
  projectRoot: string,
  sprintId: string,
  payload: AlertPayload,
): void {
  const timestamp = new Date().toISOString();

  // 1. Upsert into .dashboard.json alerts array (dedup by source identity)
  const dashPath = join(projectRoot, DASHBOARD_FILE);
  try {
    if (existsSync(dashPath)) {
      // safe: dashboard file is always written with DashboardState shape
      const state = JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
      const incoming: DedupAlert = {
        level: AlertLevel.WARNING,
        message: payload.message,
        source: payload.source ?? payload.type,
        timestamp,
        lastSeenAt: timestamp,
        count: 1,
      };
      state.alerts = deduplicateAlert(state.alerts ?? [], incoming) as Alert[];
      state.updatedAt = timestamp;
      writeFileSync(dashPath, JSON.stringify(state, null, 2), 'utf-8');
    }
  } catch {
    // Dashboard write failure must not break scan loop
  }

  // 2. Emit to sprint events stream
  try {
    writeEvent(
      projectRoot,
      sprintId,
      'auditor',
      'brain',
      CHANNELS.METRIC_EMITTED,
      { alertType: payload.type, ...payload, timestamp },
    );
  } catch {
    // Event stream write failure must not break scan loop
  }
}
