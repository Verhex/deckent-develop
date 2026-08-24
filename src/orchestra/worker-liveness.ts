/**
 * Worker Liveness Check (Sprint 191 hotfix — pre-Sprint 192 W-INTEGRITY)
 *
 * Memory: [[feedback_no_synthetic_results]] — sentetik NO_GO YASAK; gerçekliği doğrula.
 *
 * Host-primary liveness signals consulted before writing a synthetic NO_GO:
 *   L1 spawn-attempted — task.assignedWorker set (dispatcher reached it)
 *   L2 exact attempt — activity heartbeat supplies task/worker/attempt identity
 *   L3 host authority — durable host observation says alive, dead, or HOLD
 *
 * Returned status drives runEvaluatePhase decision:
 *   - 'never-spawned' → DEFERRED (skip synthetic NO_GO; emit audit-trail event)
 *   - 'alive'         → host has proven the exact attempt is still live
 *   - 'dead'          → host explicitly observed the exact attempt dead
 *   - 'unavailable'   → HOLD; no missing probe or activity age becomes dead
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Task } from '../core/task-types.js';
import { RUNTIME_DIR, TASKS_DIR } from '../core/constants.js';
import {
  parseWorkerActivityHeartbeat,
  type WorkerActivityHeartbeat,
} from '../core/worker-activity-heartbeat.js';

export type WorkerLivenessStatus = 'alive' | 'dead' | 'unavailable' | 'never-spawned';

/**
 * Host-captured log activity freshness used by the legacy host-lifecycle
 * adapter as a secondary subprocess signal. This is deliberately not worker
 * heartbeat process truth; exact-attempt host authority remains authoritative.
 */
export const LIVENESS_FRESHNESS_MS = 90_000;

export interface WorkerLivenessSignals {
  /** L1 — task.assignedWorker is non-empty (dispatcher reached the task). */
  assignedWorker: boolean;
  /** Host authority has an exact attempt identity for this worker. */
  authorityMatched: boolean;
  /** A terminal result exists, so the row must not be presented as stale. */
  resultSettled: boolean;
}

export interface WorkerLivenessResult {
  status: WorkerLivenessStatus;
  signals: WorkerLivenessSignals;
  /** Diagnostic reason — always present, useful for debugLog and audit events. */
  reason: string;
}

export interface LivenessDeps {
  /** Host-owned exact-attempt authority read-model seam. */
  readAuthority?: (
    projectRoot: string,
    activity: WorkerActivityHeartbeat,
  ) => WorkerLivenessStatus;
}

interface AuthorityIdentityRecord {
  readonly identity?: {
    readonly taskId?: unknown;
    readonly workerId?: unknown;
    readonly attemptId?: unknown;
  };
}

function authorityOutcome(value: unknown): WorkerLivenessStatus {
  if (value === true) return 'alive';
  if (value === false) return 'dead';
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'alive' || normalized === 'running') return 'alive';
    if (normalized === 'dead' || normalized === 'exited') return 'dead';
    return 'unavailable';
  }
  if (value === null || typeof value !== 'object') return 'unavailable';
  const record = value as Record<string, unknown>;
  for (const key of ['state', 'status', 'outcome', 'alive']) {
    if (key in record) return authorityOutcome(record[key]);
  }
  return 'unavailable';
}

/**
 * Read the host-owned authority journal only after the worker activity record
 * supplies its exact attempt identity. A missing, ambiguous, or malformed
 * journal is HOLD/unavailable; it is never silently converted into dead.
 */
export function readHostHeartbeatAuthority(
  projectRoot: string,
  activity: WorkerActivityHeartbeat,
): WorkerLivenessStatus {
  const root = join(projectRoot, RUNTIME_DIR, 'worker-heartbeat-authority');
  if (!existsSync(root)) return 'unavailable';

  try {
    const matches = readdirSync(root).flatMap((entry) => {
      const directory = join(root, entry);
      try {
        const record = JSON.parse(
          readFileSync(join(directory, 'identity.json'), 'utf8'),
        ) as AuthorityIdentityRecord;
        const identity = record.identity;
        if (
          identity?.taskId !== activity.taskId
          || identity.workerId !== activity.workerId
          || identity.attemptId !== activity.attemptId
        ) return [];
        const revisions = readdirSync(directory)
          .filter(name => /^[0-9]{16}\.json$/u.test(name))
          .sort();
        const latest = revisions.at(-1);
        if (!latest) return ['unavailable' as const];
        const observation = JSON.parse(readFileSync(join(directory, latest), 'utf8')) as Record<string, unknown>;
        return [authorityOutcome(observation.liveness ?? observation.hostProcessOutcome)];
      } catch {
        return [];
      }
    });
    return matches.length === 1 ? matches[0]! : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Inspect a task's runtime liveness signals.
 *
 * Pure with respect to disk reads only — never mutates files. Safe to call
 * during EVALUATE loop iteration. Activity timestamps and mtimes are never
 * consulted as process truth.
 */
export function checkWorkerLiveness(
  task: Task,
  projectRoot: string,
  deps?: LivenessDeps,
): WorkerLivenessResult {
  const taskId = task.id;
  const signals: WorkerLivenessSignals = {
    assignedWorker: typeof task.assignedWorker === 'string' && task.assignedWorker.length > 0,
    authorityMatched: false,
    resultSettled: existsSync(join(projectRoot, TASKS_DIR, `task-${taskId}.result`)),
  };

  // L1 — never-dispatched short-circuit
  if (!signals.assignedWorker) {
    return {
      status: 'never-spawned',
      signals,
      reason: 'task.assignedWorker not set — dispatcher never reached this task (max_workers saturation or wave-barrier hold)',
    };
  }

  const hbPath = join(projectRoot, '.tasks', `task-${taskId}.hb`);
  if (!existsSync(hbPath)) {
    return {
      status: signals.resultSettled ? 'unavailable' : 'unavailable',
      signals,
      reason: signals.resultSettled
        ? 'terminal result is present; no worker stale projection is applied'
        : 'worker activity identity is unavailable',
    };
  }
  try {
    const parsed = parseWorkerActivityHeartbeat(
      JSON.parse(readFileSync(hbPath, 'utf8')) as unknown,
    );
    if (parsed.state === 'HOLD') {
      return { status: 'unavailable', signals, reason: `activity identity HOLD: ${parsed.reasonCode}` };
    }
    if (parsed.heartbeat.taskId !== taskId || parsed.heartbeat.workerId !== task.assignedWorker) {
      return { status: 'unavailable', signals, reason: 'activity identity does not match task assignment' };
    }
    signals.authorityMatched = true;
    const status = deps?.readAuthority?.(projectRoot, parsed.heartbeat)
      ?? readHostHeartbeatAuthority(projectRoot, parsed.heartbeat);
    return {
      status,
      signals,
      reason: `host heartbeat authority returned ${status} for exact attempt ${parsed.heartbeat.attemptId}`,
    };
  } catch {
    return { status: 'unavailable', signals, reason: 'activity heartbeat could not be read' };
  }
}
