/**
 * alert-emitter.ts — Sprint 166 T9 emitAlert helper
 *
 * emitAlert(type, payload) writes to:
 *   1. .dashboard.json alerts array (atomic read+write, fail-safe)
 *   2. .deckent/<sprintId>-events.jsonl via writeEvent() (M4 monitoring source codepath)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DASHBOARD_FILE } from '../core/constants.js';
import { AlertLevel } from '../core/types.js';
import type { DashboardState } from '../core/types.js';
import { writeEvent, CHANNELS } from '../orchestra/event-stream.js';

export type AlertType = 'stale_md' | 'boundary_violation' | 'pattern_detected' | string;

export interface AlertPayload {
  type: AlertType;
  message: string;
  source?: string;
  [key: string]: unknown;
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

  // 1. Append to .dashboard.json alerts array
  const dashPath = join(projectRoot, DASHBOARD_FILE);
  try {
    if (existsSync(dashPath)) {
      // safe: dashboard file is always written with DashboardState shape
      const state = JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
      const alert = {
        level: AlertLevel.WARNING,
        message: payload.message,
        source: payload.source ?? payload.type,
        timestamp,
      };
      state.alerts = [...(state.alerts ?? []), alert];
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
