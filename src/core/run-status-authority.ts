import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  DASHBOARD_FILE,
  DECKENT_DIR,
  SPRINT_ACTIVE_FILE,
  SPRINT_PAUSE_STATE_FILE,
  SPRINT_STATE_FILE,
  TASKS_DIR,
} from './constants.js';
import { isPidAlive } from './pid-liveness.js';

export type CanonicalRunLifecycle =
  | 'IDLE'
  | 'ACTIVE'
  | 'PAUSED'
  | 'ORPHANED'
  | 'COMPLETE'
  | 'ABORTED';

export interface RunStatusConflict {
  readonly surface: 'active-marker' | 'sprint-state' | 'pause-state' | 'dashboard' | 'coordinator-pid';
  readonly sprintId: string | null;
  readonly value: string;
}

export interface CanonicalRunStatus {
  readonly schemaVersion: 1;
  readonly lifecycle: CanonicalRunLifecycle;
  readonly active: boolean;
  readonly resumable: boolean;
  readonly sprintId: string | null;
  readonly phase: string | null;
  readonly status: string | null;
  readonly reason: string | null;
  readonly recoveryCommand: string | null;
  readonly finalizeCommand: string | null;
  readonly coordinator: 'alive' | 'dead' | 'absent' | 'unknown';
  readonly conflicts: readonly RunStatusConflict[];
}

interface RawSprintState {
  sprintId?: unknown;
  phase?: unknown;
  status?: unknown;
}

interface RawPauseState {
  sprintId?: unknown;
  phase?: unknown;
  status?: unknown;
  reason?: unknown;
  recoveryCommand?: unknown;
  finalizeCommand?: unknown;
}

interface RawDashboard {
  sprint?: {
    id?: unknown;
    phase?: unknown;
    status?: unknown;
  };
}

interface RawPidRecord {
  pid?: unknown;
}

interface RawCoordinatorSnapshot {
  sprintId?: unknown;
  pid?: unknown;
  lastHeartbeat?: unknown;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isTerminal(value: string | null): boolean {
  return value === 'COMPLETE' || value === 'ABORTED' || value === 'FAILED';
}

function hasCheckpoint(projectRoot: string, sprintId: string): boolean {
  return existsSync(join(projectRoot, DECKENT_DIR, `${sprintId}-checkpoint.json`));
}

function hasTaskProjection(projectRoot: string, sprintId: string): boolean {
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return false;
  try {
    return readdirSync(tasksDir).some(file =>
      file.startsWith(`task-${sprintId.replace(/^sprint-/, '')}-`) && file.endsWith('.json'),
    );
  } catch {
    return false;
  }
}

function readCoordinatorState(
  projectRoot: string,
  sprintId: string | null,
  nowMs: number,
): CanonicalRunStatus['coordinator'] {
  if (!sprintId) return 'absent';
  const path = join(projectRoot, DECKENT_DIR, 'pids', `${sprintId}.pid`);
  if (!existsSync(path)) return 'absent';
  const record = readJson<RawPidRecord>(path);
  if (!record || typeof record.pid !== 'number' || !Number.isInteger(record.pid) || record.pid <= 0) {
    return 'unknown';
  }
  if (isPidAlive(record.pid)) return 'alive';

  // A PID can be alive on the host yet invisible from a container/WSL PID
  // namespace. The coordinator already writes a same-PID snapshot every 30s;
  // treat that fresh lease as liveness evidence instead of publishing a false
  // ORPHANED state. A genuinely dead process ages out to `dead`.
  const snapshot = readJson<RawCoordinatorSnapshot>(
    join(projectRoot, DECKENT_DIR, 'pids', `${sprintId}.snapshot.json`),
  );
  const config = readJson<{ heartbeat_timeout?: unknown }>(
    join(projectRoot, DECKENT_DIR, 'config.json'),
  );
  const configuredTimeout = config?.heartbeat_timeout;
  const leaseTimeoutMs =
    typeof configuredTimeout === 'number'
    && Number.isFinite(configuredTimeout)
    && configuredTimeout >= 30
      ? configuredTimeout * 1_000
      : 120_000;
  const heartbeatAt =
    typeof snapshot?.lastHeartbeat === 'string'
      ? Date.parse(snapshot.lastHeartbeat)
      : Number.NaN;
  if (
    snapshot?.sprintId === sprintId
    && snapshot.pid === record.pid
    && Number.isFinite(heartbeatAt)
    && nowMs >= heartbeatAt
    && nowMs - heartbeatAt <= leaseTimeoutMs
  ) {
    return 'alive';
  }
  return 'dead';
}

/**
 * Resolve all run-status surfaces into one read-only projection.
 *
 * Authority order is lifecycle-aware rather than file-order-only:
 * a durable pause record wins over a stale live marker; a live coordinator +
 * non-terminal sprint-state wins over display-only dashboard data; terminal
 * dashboard data is used only when no resumable/live authority remains.
 */
export function readCanonicalRunStatus(
  projectRoot: string,
  options: { sprintIdHint?: string | null; nowMs?: number } = {},
): CanonicalRunStatus {
  const active = readJson<{ sprintId?: unknown }>(join(projectRoot, SPRINT_ACTIVE_FILE));
  const sprintState = readJson<RawSprintState>(join(projectRoot, SPRINT_STATE_FILE));
  const pauseState = readJson<RawPauseState>(join(projectRoot, SPRINT_PAUSE_STATE_FILE));
  const dashboard = readJson<RawDashboard>(join(projectRoot, DASHBOARD_FILE));

  const activeId = text(active?.sprintId);
  const stateId = text(sprintState?.sprintId);
  const pauseId = text(pauseState?.sprintId);
  const dashboardId = text(dashboard?.sprint?.id);
  // sprint-state is the durable lifecycle authority written on every
  // pause/resume transition. A pause record may refine that SAME run, but a
  // stale pause from an older run must never hide the current state/marker.
  const sprintId = stateId ?? activeId ?? options.sprintIdHint ?? pauseId ?? dashboardId;
  const coordinator = readCoordinatorState(
    projectRoot,
    sprintId,
    options.nowMs ?? Date.now(),
  );
  const phase = pauseId === sprintId
    ? text(pauseState?.phase) ?? text(sprintState?.phase) ?? text(dashboard?.sprint?.phase)
    : stateId === sprintId
      ? text(sprintState?.phase) ?? (dashboardId === sprintId ? text(dashboard?.sprint?.phase) : null)
      : dashboardId === sprintId
        ? text(dashboard?.sprint?.phase)
        : null;
  const rawStatus = pauseId === sprintId
    ? text(pauseState?.status) ?? text(sprintState?.status) ?? text(dashboard?.sprint?.status)
    : stateId === sprintId
      ? text(sprintState?.status) ?? (dashboardId === sprintId ? text(dashboard?.sprint?.status) : null)
      : dashboardId === sprintId
        ? text(dashboard?.sprint?.status)
        : null;
  const conflicts: RunStatusConflict[] = [];

  const signalValues: Array<[RunStatusConflict['surface'], string | null, string | null]> = [
    ['active-marker', activeId, activeId ? 'present' : null],
    ['sprint-state', stateId, text(sprintState?.status) ?? text(sprintState?.phase)],
    ['pause-state', pauseId, text(pauseState?.status) ?? 'PAUSED'],
    ['dashboard', dashboardId, text(dashboard?.sprint?.status) ?? text(dashboard?.sprint?.phase)],
  ];
  for (const [surface, id, value] of signalValues) {
    if (!id || !value) continue;
    if (sprintId !== id) {
      conflicts.push({ surface, sprintId: id, value });
    }
  }
  if (sprintId && coordinator !== 'alive' && activeId === sprintId) {
    conflicts.push({
      surface: 'coordinator-pid',
      sprintId,
      value: `${coordinator}-while-active-marker-present`,
    });
  }

  const paused = pauseId === sprintId || rawStatus === 'PAUSED';
  const resumableEvidence = sprintId
    ? hasCheckpoint(projectRoot, sprintId) || hasTaskProjection(projectRoot, sprintId)
    : false;

  if (paused && sprintId) {
    for (const [surface, id, value] of signalValues) {
      if (
        id === sprintId
        && surface !== 'active-marker'
        && value !== 'PAUSED'
      ) {
        conflicts.push({ surface, sprintId: id, value: `${value}-while-canonical-PAUSED` });
      }
    }
    const recoveryCommand = pauseId === sprintId
      ? text(pauseState?.recoveryCommand)
        ?? `deckent recover ${sprintId} --resume`
      : `deckent recover ${sprintId} --resume`;
    return {
      schemaVersion: 1,
      lifecycle: 'PAUSED',
      active: false,
      resumable: resumableEvidence,
      sprintId,
      phase,
      status: 'PAUSED',
      reason: pauseId === sprintId ? text(pauseState?.reason) : null,
      recoveryCommand,
      finalizeCommand: pauseId === sprintId
        ? text(pauseState?.finalizeCommand)
          ?? `deckent finalize --sprint ${sprintId} --force`
        : `deckent finalize --sprint ${sprintId} --force`,
      coordinator,
      conflicts,
    };
  }

  if (sprintId && !isTerminal(rawStatus) && coordinator === 'alive') {
    const dashboardStatus = text(dashboard?.sprint?.status);
    if (dashboardId === sprintId && dashboardStatus && isTerminal(dashboardStatus)) {
      conflicts.push({
        surface: 'dashboard',
        sprintId,
        value: `${dashboardStatus}-while-canonical-ACTIVE`,
      });
    }
    return {
      schemaVersion: 1,
      lifecycle: 'ACTIVE',
      active: true,
      resumable: false,
      sprintId,
      phase,
      status: rawStatus ?? 'ACTIVE',
      reason: null,
      recoveryCommand: null,
      finalizeCommand: null,
      coordinator,
      conflicts,
    };
  }

  if (sprintId && !isTerminal(rawStatus) && (stateId || activeId || resumableEvidence)) {
    return {
      schemaVersion: 1,
      lifecycle: 'ORPHANED',
      active: false,
      resumable: resumableEvidence,
      sprintId,
      phase,
      status: rawStatus,
      reason: coordinator === 'dead'
        ? 'coordinator-dead'
        : 'coordinator-authority-unavailable',
      recoveryCommand: resumableEvidence ? `deckent recover ${sprintId} --resume` : null,
      finalizeCommand: `deckent finalize --sprint ${sprintId} --force`,
      coordinator,
      conflicts,
    };
  }

  if (sprintId && isTerminal(rawStatus)) {
    for (const [surface, id, value] of signalValues) {
      if (
        id === sprintId
        && surface !== 'active-marker'
        && value !== rawStatus
        && (value === 'PAUSED' || isTerminal(value))
      ) {
        conflicts.push({ surface, sprintId: id, value: `${value}-while-canonical-${rawStatus}` });
      }
    }
    return {
      schemaVersion: 1,
      lifecycle: rawStatus === 'COMPLETE' ? 'COMPLETE' : 'ABORTED',
      active: false,
      resumable: false,
      sprintId,
      phase,
      status: rawStatus,
      reason: null,
      recoveryCommand: null,
      finalizeCommand: null,
      coordinator,
      conflicts,
    };
  }

  return {
    schemaVersion: 1,
    lifecycle: 'IDLE',
    active: false,
    resumable: false,
    sprintId: null,
    phase: null,
    status: null,
    reason: null,
    recoveryCommand: null,
    finalizeCommand: null,
    coordinator: 'absent',
    conflicts,
  };
}
