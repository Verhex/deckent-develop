// src/nervous/action-handlers.ts
//
// Nervous Action Handlers — Step C — Sprint 180 W2-1, Sprint 181 recovery.
// NERVOUS-TODO §11.2 Step C.
//
// İlk 4 MVP action handler:
//   - WORKER_RESPAWN(taskId)            → spawn-backend kill + spawn
//   - ORPHAN_TASK_ARCHIVE(sprintId)     → sprint-docs-updater.archiveOrphanTasks
//   - STALE_LOCK_RELEASE(filePath)      → file-lock.releaseLock
//   - DEAD_EVENT_STREAM_CLEANUP(sprintId) → event-stream cleanup (Faz 2 wire)
//
// Diğer 26 action stub: `{ outcome: 'unimplemented', actionId }` döndürür.

import { ACTION_REGISTRY } from './action-registry.js';
import type { ActionHandler } from './executor.js';

type ActionHandlerResult = Awaited<ReturnType<ActionHandler>>;

export type ActionDispatchResult =
  | { outcome: 'success' }
  | { outcome: 'failure'; error: string }
  | { outcome: 'unimplemented'; actionId: string };

export interface ActionHandlerDeps {
  killWorker: (taskId: string) => void;
  spawnWorker: (taskId: string) => void;
  archiveOrphanTasks: (projectRoot: string, sprintId: string) => void;
  releaseLock: (projectRoot: string, filePath: string, workerId: string) => void;
  cleanDeadEventStream: (projectRoot: string, sprintId: string) => number;
  projectRoot: string;
}

const MVP_ACTION_IDS = new Set([
  'WORKER_RESPAWN',
  'ORPHAN_TASK_ARCHIVE',
  'STALE_LOCK_RELEASE',
  'DEAD_EVENT_STREAM_CLEANUP',
]);

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

let defaultDeps: ActionHandlerDeps | null = null;

async function loadDefaultDeps(): Promise<ActionHandlerDeps> {
  if (defaultDeps) return defaultDeps;
  const [docsUpdater, fileLock] = await Promise.all([
    import('../orchestra/sprint-docs-updater.js').catch(() => null),
    import('../core/file-lock.js').catch(() => null),
  ]);

  defaultDeps = {
    killWorker: (_taskId: string) => {
      // No default kill — spawn-backend integration is Faz 2.
    },
    spawnWorker: (_taskId: string) => {
      // No default spawn — sprint-controller orchestrates spawn lifecycle.
    },
    archiveOrphanTasks: (projectRoot: string, sprintId: string): void => {
      const fn = (docsUpdater as { archiveOrphanTasks?: (r: string, s: string) => void })?.archiveOrphanTasks;
      if (fn) fn(projectRoot, sprintId);
    },
    releaseLock: (projectRoot: string, filePath: string, workerId: string): void => {
      const fn = (fileLock as { releaseLock?: (r: string, f: string, w: string) => void })?.releaseLock;
      if (fn) fn(projectRoot, filePath, workerId);
    },
    cleanDeadEventStream: (_projectRoot: string, _sprintId: string) => {
      // event-bus has no prune helper yet — Faz 2 will wire this.
      return 0;
    },
    projectRoot: process.cwd(),
  };
  return defaultDeps;
}

/**
 * Dispatch an action by ID to the appropriate MVP handler, or return
 * `{outcome: 'unimplemented', actionId}` for the 26 stub actions.
 */
export async function dispatchAction(
  actionId: string,
  payload: Record<string, unknown> = {},
  deps?: Partial<ActionHandlerDeps>,
): Promise<ActionDispatchResult> {
  const resolved: ActionHandlerDeps = deps
    ? { ...(await loadDefaultDeps()), ...deps }
    : await loadDefaultDeps();

  if (!MVP_ACTION_IDS.has(actionId)) {
    return unimplemented(actionId);
  }

  try {
    switch (actionId) {
      case 'WORKER_RESPAWN':
        return await handleWorkerRespawn(payload, resolved);
      case 'ORPHAN_TASK_ARCHIVE':
        return await handleOrphanTaskArchive(payload, resolved);
      case 'STALE_LOCK_RELEASE':
        return await handleStaleLockRelease(payload, resolved);
      case 'DEAD_EVENT_STREAM_CLEANUP':
        return await handleDeadEventStreamCleanup(payload, resolved);
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
  return async (actionId: string, payload: unknown): Promise<ActionHandlerResult> => {
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
// Build-time guard: every MVP id must exist in ACTION_REGISTRY.
const REGISTRY_IDS = new Set(
  (ACTION_REGISTRY as readonly { id: string }[]).map((a) => a.id),
);
for (const mvp of MVP_ACTION_IDS) {
  if (!REGISTRY_IDS.has(mvp)) {
    throw new Error(`MVP action id ${mvp} missing from ACTION_REGISTRY`);
  }
}
