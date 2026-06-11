/**
 * Status Reconcile — DASH-UX-2 fix (Sprint 282 Task 005).
 *
 * When a sprint completes, the `.dashboard` snapshot may still show the last
 * auditor scan (e.g. phase:EXECUTE, 8/10 workers). `/api/status` blindly
 * returns this stale data, making the dashboard believe the sprint is live.
 *
 * This module cross-checks the `.dashboard` JSON against the persisted
 * `.deckent/sprint-state.json`.  If the sprint-state is COMPLETE (or absent),
 * the dashboard data is overridden with a completed/idle response so callers
 * never see a false "active sprint" signal.
 *
 * The reconcile is read-only — it never mutates the `.dashboard` file.
 * Only the HTTP response is adjusted; actual file cleanup belongs to
 * `writeTerminalDashboardSnapshot` (sprint-finalizer.ts, Step 16).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonSafe } from '../core/utils.js';
import { SprintStatus, SprintPhase } from '../core/types.js';

// Path must match SPRINT_STATE_FILE in orchestra/sprint-utils.ts
const SPRINT_STATE_FILE = '.deckent/sprint-state.json';

// ─── Internal types ─────────────────────────────────────────────────

interface SprintStateFile {
  sprintId?: string;
  status?: string;
  phase?: string;
  startedAt?: string;
  updatedAt?: string;
}

interface DashboardLike {
  sprint?: {
    id?: string;
    phase?: string;
    status?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set<string>([
  SprintStatus.COMPLETE,
  SprintStatus.ABORTED,
  'COMPLETE',
  'ABORTED',
  'COMPLETED',
]);

const TERMINAL_PHASES = new Set<string>([
  SprintPhase.COMPLETE,
  'COMPLETE',
  'COMPLETED',
  'CLEANUP',
]);

function isTerminal(status?: string, phase?: string): boolean {
  if (status && TERMINAL_STATUSES.has(status)) return true;
  if (phase && TERMINAL_PHASES.has(phase)) return true;
  return false;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Build an idle/completed response when no live sprint is detected.
 */
function idleResponse(sprintId: string | null | undefined): unknown {
  return {
    sprint: {
      id: sprintId ?? null,
      phase: 'IDLE',
      status: 'IDLE',
    },
    agents: [],
    progress: { done: 0, active: 0, blocked: 0, total: 0 },
    alerts: [],
    updatedAt: new Date().toISOString(),
    idle: true,
  };
}

/**
 * Reconcile a raw dashboard JSON value with the persisted sprint-state.
 *
 * Rules:
 * - If sprint-state file is MISSING → the sprint is not running → return idle.
 * - If sprint-state status/phase is TERMINAL → sprint finished → return idle
 *   (preserves sprint id so the UI can show "last sprint: NNN").
 * - If sprint-state is ACTIVE → data is live → return `dashData` unchanged.
 * - If `dashData` itself already shows a terminal phase → return idle.
 *
 * @param projectRoot  Project root directory.
 * @param dashData     Raw value read from `.dashboard` (may be null/undefined).
 * @returns            Reconciled object suitable for JSON serialisation.
 */
export function reconcileStatusResponse(
  projectRoot: string,
  dashData: unknown,
): unknown {
  const statePath = join(projectRoot, SPRINT_STATE_FILE);

  // No sprint-state file — no active sprint.
  if (!existsSync(statePath)) {
    const dash = dashData as DashboardLike | null | undefined;
    return idleResponse(dash?.sprint?.id);
  }

  const state = readJsonSafe<SprintStateFile>(statePath);

  // Unreadable state file — treat as no active sprint.
  if (!state) {
    const dash = dashData as DashboardLike | null | undefined;
    return idleResponse(dash?.sprint?.id);
  }

  // Terminal sprint-state → sprint is complete.
  if (isTerminal(state.status, state.phase)) {
    return idleResponse(state.sprintId);
  }

  // No dashboard data despite an apparent active sprint — return live empty.
  if (!dashData || typeof dashData !== 'object') {
    return idleResponse(state.sprintId);
  }

  // If the dashboard snapshot itself claims a terminal phase, reconcile it.
  const dash = dashData as DashboardLike;
  if (isTerminal(dash.sprint?.status as string | undefined, dash.sprint?.phase as string | undefined)) {
    return idleResponse(dash.sprint?.id as string | undefined ?? state.sprintId);
  }

  // Sprint-state is active and dashboard has live data — return as-is.
  return dashData;
}
