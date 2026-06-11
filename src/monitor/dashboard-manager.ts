/**
 * Dashboard Manager — .dashboard file read/validate/repair pipeline.
 *
 * Addresses the Sprint 137+ "ghost parse error" pattern by providing:
 *   A) Schema validation with detailed error messages
 *   B) Auto-repair for missing/corrupt dashboard files
 *   C) Safe read helper that never throws
 *
 * Single writer is auditor (scan cycle per 30s). This module is read-side only.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DASHBOARD_FILE } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import type { Alert, DashboardState } from '../core/monitoring-types.js';
import { SprintPhase, SprintStatus } from '../core/sprint-types.js';

/** Canonical empty dashboard state — used when creating or repairing. */
export const DASHBOARD_INITIAL_STATE: DashboardState = {
  sprint: { id: '', number: 0, phase: SprintPhase.PLAN, status: SprintStatus.PLANNING },
  agents: [],
  progress: { done: 0, active: 0, blocked: 0, total: 0 },
  alerts: [],
  updatedAt: new Date().toISOString(),
};

/** Result of reading and validating the dashboard file. */
export interface DashboardReadResult {
  /** The parsed dashboard state (merged with defaults if fields missing). */
  state: DashboardState;
  /** Whether the file existed and was valid JSON (parseable). */
  valid: boolean;
  /** Whether the file was auto-repaired (rewritten with initial state). */
  repaired: boolean;
  /** Error detail if parsing failed — never swallowed. */
  error?: string;
}

/**
 * Runtime type guard: checks that `data` has the minimum required shape.
 *
 * Checks: (1) is object, (2) sprint is object with string id, (3) agents is array,
 * (4) progress is object with numeric done/total, (5) alerts is array, (6) updatedAt is string.
 */
export function isDashboardState(data: unknown): data is DashboardState {
  if (data === null || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  // sprint must be an object with at least an id field
  if (typeof obj['sprint'] !== 'object' || obj['sprint'] === null) return false;
  const sprint = obj['sprint'] as Record<string, unknown>;
  if (typeof sprint['id'] !== 'string') return false;

  // agents must be an array
  if (!Array.isArray(obj['agents'])) return false;

  // progress must be an object with done/total numbers
  if (typeof obj['progress'] !== 'object' || obj['progress'] === null) return false;
  const progress = obj['progress'] as Record<string, unknown>;
  if (typeof progress['done'] !== 'number' || typeof progress['total'] !== 'number') return false;

  // alerts must be an array
  if (!Array.isArray(obj['alerts'])) return false;

  // updatedAt must be a string
  if (typeof obj['updatedAt'] !== 'string') return false;

  return true;
}

/**
 * Validate schema and return a descriptive error listing each missing/invalid field.
 * Returns null if valid, or a string describing all failures.
 */
export function validateDashboardSchema(data: Record<string, unknown>): string | null {
  const missing: string[] = [];

  // sprint field checks
  if (typeof data['sprint'] !== 'object' || data['sprint'] === null) {
    missing.push('sprint (must be object)');
  } else {
    const sprint = data['sprint'] as Record<string, unknown>;
    if (typeof sprint['id'] !== 'string') missing.push('sprint.id (must be string)');
  }

  // agents check
  if (!Array.isArray(data['agents'])) missing.push('agents (must be array)');

  // progress field checks
  if (typeof data['progress'] !== 'object' || data['progress'] === null) {
    missing.push('progress (must be object)');
  } else {
    const progress = data['progress'] as Record<string, unknown>;
    if (typeof progress['done'] !== 'number') missing.push('progress.done (must be number)');
    if (typeof progress['total'] !== 'number') missing.push('progress.total (must be number)');
  }

  // alerts check
  if (!Array.isArray(data['alerts'])) missing.push('alerts (must be array)');

  // updatedAt check
  if (typeof data['updatedAt'] !== 'string') missing.push('updatedAt (must be string)');

  if (missing.length === 0) return null;
  return `Schema validation failed: missing or invalid fields: ${missing.join(', ')}`;
}

/**
 * Merge parsed JSON data with DASHBOARD_INITIAL_STATE defaults.
 * Handles partial data: fills in missing top-level fields while preserving existing ones.
 */
function mergeDashboardDefaults(data: Record<string, unknown>): DashboardState {
  const now = new Date().toISOString();
  const defaults = { ...DASHBOARD_INITIAL_STATE, updatedAt: now };

  // sprint: merge sub-fields with defaults
  const sprintRaw = (typeof data['sprint'] === 'object' && data['sprint'] !== null)
    ? data['sprint'] as Record<string, unknown>
    : {};
  const sprint = {
    id: typeof sprintRaw['id'] === 'string' ? sprintRaw['id'] : defaults.sprint.id,
    number: typeof sprintRaw['number'] === 'number' ? sprintRaw['number'] : defaults.sprint.number,
    phase: typeof sprintRaw['phase'] === 'string' ? sprintRaw['phase'] as SprintPhase : defaults.sprint.phase,
    status: typeof sprintRaw['status'] === 'string' ? sprintRaw['status'] as SprintStatus : defaults.sprint.status,
  };

  // progress: merge sub-fields
  const progRaw = (typeof data['progress'] === 'object' && data['progress'] !== null)
    ? data['progress'] as Record<string, unknown>
    : {};
  const progress = {
    done: typeof progRaw['done'] === 'number' ? progRaw['done'] : defaults.progress.done,
    active: typeof progRaw['active'] === 'number' ? progRaw['active'] : defaults.progress.active,
    blocked: typeof progRaw['blocked'] === 'number' ? progRaw['blocked'] : defaults.progress.blocked,
    total: typeof progRaw['total'] === 'number' ? progRaw['total'] : defaults.progress.total,
  };

  return {
    ...data,
    sprint,
    agents: Array.isArray(data['agents']) ? data['agents'] as DashboardState['agents'] : defaults.agents,
    progress,
    alerts: Array.isArray(data['alerts']) ? data['alerts'] as DashboardState['alerts'] : defaults.alerts,
    updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : now,
  } as DashboardState;
}

/**
 * Ensure a valid `.dashboard` file exists at projectRoot.
 *
 * If the file is missing or corrupt, writes DASHBOARD_INITIAL_STATE.
 * Returns true if file was created/repaired, false if it was already valid.
 */
export function ensureDashboard(projectRoot: string): boolean {
  const dashPath = join(projectRoot, DASHBOARD_FILE);

  if (!existsSync(dashPath)) {
    const state = { ...DASHBOARD_INITIAL_STATE, updatedAt: new Date().toISOString() };
    writeFileSync(dashPath, JSON.stringify(state, null, 2), 'utf-8');
    debugLog('dashboard-manager:ensureDashboard', 'Created missing .dashboard file');
    return true;
  }

  // Validate existing file — repair if JSON is unparseable OR schema invalid
  try {
    const content = readFileSync(dashPath, 'utf-8');
    const parsed = JSON.parse(content);
    // Schema check: must be a valid DashboardState
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const schemaError = validateDashboardSchema(parsed as Record<string, unknown>);
      if (!schemaError) {
        return false; // parseable and valid schema — no repair needed
      }
      debugLog('dashboard-manager:ensureDashboard', `Schema invalid, repairing: ${schemaError}`);
    } else {
      debugLog('dashboard-manager:ensureDashboard', 'Parsed JSON is not an object, repairing');
    }
    const state = { ...DASHBOARD_INITIAL_STATE, updatedAt: new Date().toISOString() };
    writeFileSync(dashPath, JSON.stringify(state, null, 2), 'utf-8');
    return true;
  } catch (err) {
    // Corrupt JSON — repair
    const detail = err instanceof Error ? err.message : String(err);
    const state = { ...DASHBOARD_INITIAL_STATE, updatedAt: new Date().toISOString() };
    writeFileSync(dashPath, JSON.stringify(state, null, 2), 'utf-8');
    debugLog('dashboard-manager:ensureDashboard', `Repaired corrupt .dashboard: ${detail}`);
    return true;
  }
}

/**
 * Safely read the `.dashboard` file with validation and auto-repair.
 *
 * Never throws. Returns a DashboardReadResult with diagnostics.
 * If JSON is unparseable, repairs the file and returns initial state.
 * If JSON is parseable but has missing fields, merges with defaults (no disk write).
 */
export function readDashboardSafe(projectRoot: string): DashboardReadResult {
  const dashPath = join(projectRoot, DASHBOARD_FILE);

  if (!existsSync(dashPath)) {
    return {
      state: { ...DASHBOARD_INITIAL_STATE, updatedAt: new Date().toISOString() },
      valid: false,
      repaired: false,
      error: '.dashboard file does not exist',
    };
  }

  let content: string;
  try {
    content = readFileSync(dashPath, 'utf-8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    debugLog('dashboard-manager:readDashboardSafe', `Read error: ${detail}`);
    return {
      state: { ...DASHBOARD_INITIAL_STATE, updatedAt: new Date().toISOString() },
      valid: false,
      repaired: false,
      error: `Cannot read .dashboard: ${detail}`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    debugLog('dashboard-manager:readDashboardSafe', `JSON parse error: ${detail}`);
    // Auto-repair corrupt file
    const repaired = ensureDashboard(projectRoot);
    return {
      state: { ...DASHBOARD_INITIAL_STATE, updatedAt: new Date().toISOString() },
      valid: false,
      repaired,
      error: `JSON parse error: ${detail}`,
    };
  }

  // JSON is parseable — if it's not an object, treat as corrupt
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    debugLog('dashboard-manager:readDashboardSafe', 'Parsed JSON is not an object');
    const repaired = ensureDashboard(projectRoot);
    return {
      state: { ...DASHBOARD_INITIAL_STATE, updatedAt: new Date().toISOString() },
      valid: false,
      repaired,
      error: 'Parsed JSON is not an object',
    };
  }

  // JSON is a valid object — merge with defaults to fill missing fields.
  // This handles partial/stale dashboard data gracefully without repairing on disk,
  // since auditor will overwrite with full state on next scan cycle.
  const state = mergeDashboardDefaults(data as Record<string, unknown>);
  return { state, valid: true, repaired: false };
}

/** Maximum number of alerts stored in the dashboard. */
export const DASHBOARD_MAX_ALERTS = 50;

/**
 * Deduplicate an alert array by source identity.
 *
 * Alerts with the same `source` value are merged: the most recently seen entry is kept
 * with `count` reflecting the total occurrence tally and `lastSeenAt` updated to the
 * latest timestamp. Useful for batch-dedup when rewriting the full alerts list.
 * The result is sorted by `lastSeenAt` descending (most recent first) and capped at
 * DASHBOARD_MAX_ALERTS.
 */
export function dedupAlerts(alerts: Alert[]): Alert[] {
  const map = new Map<string, Alert & { lastSeenAt?: string; count?: number }>();
  for (const alert of alerts) {
    const key = alert.source ?? alert.message;
    const existing = map.get(key);
    if (existing) {
      existing.count = (existing.count ?? 1) + 1;
      const incomingTime = (alert as Alert & { lastSeenAt?: string }).lastSeenAt ?? alert.timestamp;
      if (!existing.lastSeenAt || incomingTime > existing.lastSeenAt) {
        existing.lastSeenAt = incomingTime;
        existing.message = alert.message;
      }
    } else {
      map.set(key, {
        ...alert,
        count: (alert as Alert & { count?: number }).count ?? 1,
        lastSeenAt: (alert as Alert & { lastSeenAt?: string }).lastSeenAt ?? alert.timestamp,
      });
    }
  }
  return [...map.values()]
    .sort((a, b) => {
      const ta = a.lastSeenAt ?? a.timestamp;
      const tb = b.lastSeenAt ?? b.timestamp;
      return tb.localeCompare(ta);
    })
    .slice(0, DASHBOARD_MAX_ALERTS) as Alert[];
}
