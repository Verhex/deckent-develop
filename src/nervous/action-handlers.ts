// src/nervous/action-handlers.ts
//
// Nervous Action Handlers — Step C — Sprint 180 W2-1, Sprint 181 recovery.
// NERVOUS-TODO §11.2 Step C.
//
// Maintenance / observability handlers (autonomous-safe, real direct effect via
// maintenance-ops.ts — projectRoot-scoped, standalone):
//   - ORPHAN_TASK_ARCHIVE(sprintId)     → sprint-docs-updater.archiveOrphanTasks
//   - STALE_LOCK_RELEASE(filePath)      → file-lock.releaseLock
//   - DEAD_EVENT_STREAM_CLEANUP(sprintId) → pruneDeadEventStream (drop corrupt lines)
//   - LOG_ROTATION                      → rotateSprintLogs (archive old .brain/sprints)
//   - CACHE_INVALIDATE(cacheType)       → invalidateDocCache (ADR-031 docs cache)
//   - IPC_DIR_CLEANUP                   → cleanIpcDirs (orphan nervous/panic markers)
//   - DEBT_TRENDING_REPORT              → generateDebtTrendReport (.deckent/reports)
//   - METRIC_EMIT(metricName,value)     → append .deckent/metrics.jsonl (observability)
//   - WORKER_RESPAWN(taskId)            → kill+spawn ONLY with an injected coordinator
//                                         (canRespawn); otherwise PROPOSES the respawn.
//
// Resource-recommendation handlers — EVERY non-maintenance registry action
// (ADR-037: nervous PROPOSES, Brain/operator DISPOSES — never self-mutates the
// repo, guarding the self-modification P0). The whole medium / high / safety-floor
// surface (debt · routing · agents · directives · sprint · git · src control)
// lands an inert proposal in .deckent/nervous-recommendations.jsonl; the operator
// executes through the normal guarded CLI. Only an action id absent from the
// registry returns `{ outcome: 'unimplemented', actionId }`.

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ACTION_REGISTRY } from './action-registry.js';
import { recordRecommendation } from './recommendation-log.js';
import {
  rotateSprintLogs,
  invalidateDocCache,
  cleanIpcDirs,
  pruneDeadEventStream,
  generateDebtTrendReport,
} from './maintenance-ops.js';
import type { ActionHandler } from './executor.js';

type ExecutorBridgeResult = Awaited<ReturnType<ActionHandler>>;

export type ActionDispatchResult =
  | { outcome: 'success' }
  | { outcome: 'failure'; error: string }
  | { outcome: 'unimplemented'; actionId: string };

export type ActionHandlerResult = ActionDispatchResult;

export interface ActionHandlerDeps {
  killWorker: (taskId: string) => void;
  spawnWorker: (taskId: string) => void;
  archiveOrphanTasks: (projectRoot: string, sprintId: string) => void;
  releaseLock: (projectRoot: string, filePath: string, workerId: string) => void;
  cleanDeadEventStream: (projectRoot: string, sprintId: string) => number;
  rotateLogs: (projectRoot: string) => void;
  invalidateCache: (projectRoot: string, cacheType: string) => void;
  cleanIpcDir: (projectRoot: string) => number;
  generateDebtReport: (projectRoot: string) => void;
  emitMetric: (projectRoot: string, metricName: string, value: number) => void;
  /** Land a Brain-actionable proposal for a resource the nervous system does not
   *  own (ADR-037). Defaults to recommendation-log.recordRecommendation. */
  recommend: (projectRoot: string, actionId: string, payload: Record<string, unknown>) => void;
  /** True only when a live coordinator injected a real kill+spawn pair (it has the
   *  task's spawn context). Default false → WORKER_RESPAWN proposes instead of
   *  faking a respawn it cannot perform standalone. */
  canRespawn: boolean;
  projectRoot: string;
}

/** Maintenance / observability actions the nervous system OWNS — autonomous-safe,
 *  direct effect (clean state, rotate, prune, emit a metric). WORKER_RESPAWN is
 *  here because it acts through a coordinator-injected kill/spawn, not the repo. */
const MAINTENANCE_ACTION_IDS = new Set([
  'WORKER_RESPAWN',
  'ORPHAN_TASK_ARCHIVE',
  'STALE_LOCK_RELEASE',
  'DEAD_EVENT_STREAM_CLEANUP',
  'LOG_ROTATION',
  'CACHE_INVALIDATE',
  'IPC_DIR_CLEANUP',
  'DEBT_TRENDING_REPORT',
  'METRIC_EMIT',
]);

/** Every registry action that is NOT direct maintenance is a Brain proposal
 *  (ADR-037: nervous proposes, Brain/operator disposes). This is the whole
 *  medium/high/safety-floor surface — debt/routing/agents/directives/sprint/git/
 *  src control — which the nervous system NEVER self-executes (self-modification
 *  P0). It lands an inert proposal in .deckent/nervous-recommendations.jsonl;
 *  the operator acts through the normal guarded CLI. Deriving from the registry
 *  means a newly-registered action defaults to "propose" — fail-safe, not silent. */
const RECOMMENDATION_ACTION_IDS = new Set(
  ACTION_REGISTRY.map((a) => a.id).filter((id) => !MAINTENANCE_ACTION_IDS.has(id)),
);

/** Implemented = the full registry (maintenance ∪ recommendation). Only an action
 *  id absent from the registry falls through to `unimplemented`. */
const IMPLEMENTED_ACTION_IDS = new Set(ACTION_REGISTRY.map((a) => a.id));

function success(): ActionDispatchResult {
  return { outcome: 'success' };
}

function failure(error: string): ActionDispatchResult {
  return { outcome: 'failure', error };
}

function unimplemented(actionId: string): ActionDispatchResult {
  return { outcome: 'unimplemented', actionId };
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing or invalid payload field: ${key}`);
  }
  return value;
}

async function handleWorkerRespawn(
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  const taskId = requireString(payload, 'taskId');
  // Respawn needs the coordinator's full spawn context (command/options/adapter).
  // Without an injected real kill+spawn pair, the standalone handler CANNOT
  // re-spawn safely — so it proposes the respawn to the operator/Brain instead
  // of faking a success it did not perform (honest, no silent no-op).
  if (!deps.canRespawn) {
    deps.recommend(deps.projectRoot, 'WORKER_RESPAWN', payload);
    return success();
  }
  deps.killWorker(taskId);
  deps.spawnWorker(taskId);
  return success();
}

async function handleOrphanTaskArchive(
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  const sprintId = requireString(payload, 'sprintId');
  deps.archiveOrphanTasks(deps.projectRoot, sprintId);
  return success();
}

async function handleStaleLockRelease(
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  const filePath = requireString(payload, 'filePath');
  const workerId = requireString(payload, 'workerId');
  deps.releaseLock(deps.projectRoot, filePath, workerId);
  return success();
}

async function handleDeadEventStreamCleanup(
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  const sprintId = requireString(payload, 'sprintId');
  deps.cleanDeadEventStream(deps.projectRoot, sprintId);
  return success();
}

async function handleLogRotation(
  _payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  deps.rotateLogs(deps.projectRoot);
  return success();
}

async function handleCacheInvalidate(
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  const cacheType = typeof payload['cacheType'] === 'string' ? payload['cacheType'] : 'all';
  deps.invalidateCache(deps.projectRoot, cacheType);
  return success();
}

async function handleIpcDirCleanup(
  _payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  deps.cleanIpcDir(deps.projectRoot);
  return success();
}

async function handleDebtTrendingReport(
  _payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  deps.generateDebtReport(deps.projectRoot);
  return success();
}

async function handleMetricEmit(
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  const metricName = requireString(payload, 'metricName');
  const value = typeof payload['value'] === 'number' ? payload['value'] : 1;
  deps.emitMetric(deps.projectRoot, metricName, value);
  return success();
}

/**
 * Resource-recommendation handler (ADR-037). The action touches a resource the
 * nervous system does not own (debt priority, routing, agent flags, wave order,
 * directives, over-budget proceed) → it lands a Brain-actionable proposal rather
 * than self-mutating the repo. The full detector payload is preserved as context.
 */
async function handleRecommend(
  actionId: string,
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionDispatchResult> {
  deps.recommend(deps.projectRoot, actionId, payload);
  return success();
}

let defaultDeps: ActionHandlerDeps | null = null;

async function loadDefaultDeps(): Promise<ActionHandlerDeps> {
  if (defaultDeps) return defaultDeps;
  const [docsUpdater, fileLock] = await Promise.all([
    import('../orchestra/sprint-docs-updater.js').catch(() => null),
    import('../core/file-lock.js').catch(() => null),
  ]);

  defaultDeps = {
    killWorker: (_taskId: string) => {
      // Inert placeholder — invoked ONLY when a coordinator sets canRespawn:true
      // (it injects a real kill+spawn pair with the task's spawn context). The
      // default WORKER_RESPAWN path never reaches here: canRespawn is false →
      // the handler proposes the respawn instead.
    },
    spawnWorker: (_taskId: string) => {
      // Inert placeholder — see killWorker (coordinator-injected path only).
    },
    archiveOrphanTasks: (projectRoot: string, sprintId: string): void => {
      const fn = (docsUpdater as { archiveOrphanTasks?: (r: string, s: string) => void })?.archiveOrphanTasks;
      if (fn) fn(projectRoot, sprintId);
    },
    releaseLock: (projectRoot: string, filePath: string, workerId: string): void => {
      const fn = (fileLock as { releaseLock?: (r: string, f: string, w: string) => void })?.releaseLock;
      if (fn) fn(projectRoot, filePath, workerId);
    },
    cleanDeadEventStream: (projectRoot: string, sprintId: string): number =>
      pruneDeadEventStream(projectRoot, sprintId),
    rotateLogs: (projectRoot: string): void => {
      rotateSprintLogs(projectRoot);
    },
    invalidateCache: (projectRoot: string, cacheType: string): void => {
      invalidateDocCache(projectRoot, cacheType);
    },
    cleanIpcDir: (projectRoot: string): number => cleanIpcDirs(projectRoot),
    generateDebtReport: (projectRoot: string): void => {
      generateDebtTrendReport(projectRoot);
    },
    emitMetric: (projectRoot: string, metricName: string, value: number): void => {
      // Observability metric point — append-only JSONL, dependency-free.
      const path = join(projectRoot, '.deckent', 'metrics.jsonl');
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const line = JSON.stringify({ ts: new Date().toISOString(), metricName, value }) + '\n';
      appendFileSync(path, line, 'utf-8');
    },
    recommend: recordRecommendation,
    canRespawn: false,
    projectRoot: process.cwd(),
  };
  return defaultDeps;
}

/**
 * Dispatch an action by ID: maintenance actions run their real op, every other
 * registry action lands a Brain proposal (ADR-037). Only an id absent from the
 * registry returns `{outcome: 'unimplemented', actionId}`.
 */
export async function dispatchAction(
  actionId: string,
  payload: Record<string, unknown> = {},
  deps?: Partial<ActionHandlerDeps>,
): Promise<ActionDispatchResult> {
  const resolved: ActionHandlerDeps = deps
    ? { ...(await loadDefaultDeps()), ...deps }
    : await loadDefaultDeps();

  if (!IMPLEMENTED_ACTION_IDS.has(actionId)) {
    return unimplemented(actionId);
  }

  try {
    // Resource-recommendation actions all share one effect (ADR-037 propose).
    if (RECOMMENDATION_ACTION_IDS.has(actionId)) {
      return await handleRecommend(actionId, payload, resolved);
    }
    switch (actionId) {
      case 'WORKER_RESPAWN':
        return await handleWorkerRespawn(payload, resolved);
      case 'ORPHAN_TASK_ARCHIVE':
        return await handleOrphanTaskArchive(payload, resolved);
      case 'STALE_LOCK_RELEASE':
        return await handleStaleLockRelease(payload, resolved);
      case 'DEAD_EVENT_STREAM_CLEANUP':
        return await handleDeadEventStreamCleanup(payload, resolved);
      case 'LOG_ROTATION':
        return await handleLogRotation(payload, resolved);
      case 'CACHE_INVALIDATE':
        return await handleCacheInvalidate(payload, resolved);
      case 'IPC_DIR_CLEANUP':
        return await handleIpcDirCleanup(payload, resolved);
      case 'DEBT_TRENDING_REPORT':
        return await handleDebtTrendingReport(payload, resolved);
      case 'METRIC_EMIT':
        return await handleMetricEmit(payload, resolved);
      default:
        return unimplemented(actionId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(message);
  }
}

/**
 * Build an Executor-compatible ActionHandler that delegates to `dispatchAction`.
 * Maps `unimplemented` → `{outcome: 'failure', error}` so the Executor's binary
 * outcome contract holds.
 */
export function createActionHandler(deps?: Partial<ActionHandlerDeps>): ActionHandler {
  return async (actionId: string, payload: unknown): Promise<ExecutorBridgeResult> => {
    const result = await dispatchAction(actionId, (payload as Record<string, unknown>) ?? {}, deps);
    if (result.outcome === 'unimplemented') {
      return {
        outcome: 'failure',
        error: `unimplemented:${result.actionId ?? actionId}`,
      };
    }
    return result.outcome === 'success'
      ? { outcome: 'success' }
      : { outcome: 'failure', error: result.error };
  };
}

// ─── Sanity Check ───────────────────────────────────────────────────────────
// Build-time guard: every maintenance id must exist in ACTION_REGISTRY (a typo
// in MAINTENANCE_ACTION_IDS would otherwise silently route the action to the
// recommendation inbox instead of its direct handler).
const REGISTRY_IDS = new Set(
  (ACTION_REGISTRY as readonly { id: string }[]).map((a) => a.id),
);
for (const id of MAINTENANCE_ACTION_IDS) {
  if (!REGISTRY_IDS.has(id)) {
    throw new Error(`Maintenance action id ${id} missing from ACTION_REGISTRY`);
  }
}
