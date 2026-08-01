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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DASHBOARD_FILE } from '../core/constants.js';
import { AlertLevel } from '../core/types.js';
import type { Alert, DashboardState } from '../core/types.js';
import { writeEvent, CHANNELS } from '../orchestra/event-stream.js';
import { updateDashboard } from './auditor.js';

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
 * Deduplicate an alert list by source identity (single-incoming upsert).
 *
 * Incoming alert is upserted: if an entry with the same `source` exists, its
 * count and lastSeenAt are updated (and message refreshed to the latest);
 * otherwise a new entry is appended. The resulting list is capped at
 * MAX_ALERTS, retaining the most recent entries by INSERTION order (no re-sort).
 *
 * ─── INTENTIONALLY DIVERGENT — DO NOT COLLAPSE (sprint 319-010 NO_GO / 321-003 recheck) ───
 * This is ONE of THREE alert-dedup helpers under src/monitor/. They are NOT
 * redundant copies of one operation — each has a distinct, test-locked contract,
 * and they CONTRADICT each other on the dedup KEY, so a single "SSOT" helper is
 * impossible without silently changing observable behavior:
 *
 *   1. deduplicateAlert  (THIS — alert-emitter.ts) key = `source`
 *        sig (list, ONE incoming) → upsert; cap = insertion-order slice(-MAX_ALERTS).
 *        Same source + DIFFERENT message ⇒ MERGED into one entry (message refreshed).
 *   2. deduplicateAlerts (auditor.ts)              key = `source + "::" + message`
 *        sig (existing[], incoming[]) → batch merge; cap = oldest-dropped slice(-ALERT_MAX).
 *        Same source + DIFFERENT message ⇒ KEPT SEPARATE (two entries).  ← contradicts (1)
 *   3. dedupAlerts       (dashboard-manager.ts)    key = `source ?? message`
 *        sig (single list) → Map-fold; cap = lastSeenAt-DESC sort + slice(0, DASHBOARD_MAX_ALERTS).
 *
 * (1) and (2) disagree on whether `message` is part of identity, so unifying them
 * would flip dedup results their respective tests assert (alert-dedup.test.ts vs
 * auditor.test.ts). They serve different call-sites by design: emitter single-upsert
 * vs auditor scan-merge vs dashboard full-rewrite. Triage disposition: not-a-bug,
 * intentional divergence — disambiguated here rather than collapsed.
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
      updateDashboard(projectRoot, state);
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
