// src/nervous/respawn-request.ts
//
// Cooperative worker-respawn signal (N3). The nervous WORKER_RESPAWN action does
// NOT kill+spawn a worker itself — the sprint-controller is the single authority
// over worker lifecycle, so a parallel respawn would race it. Instead nervous
// writes a durable respawn-REQUEST here; the sprint-controller drains it inside
// its OWN result loop and respawns the task through its authoritative path. This
// keeps the lifecycle single-owner (no double-spawn / no task-state race).
//
// Opt-in: only used when config.nervous_system.worker_respawn === true. Otherwise
// WORKER_RESPAWN stays a Brain proposal (the safe default).

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Path (relative to project root) of the durable respawn-request queue. */
export const RESPAWN_REQUESTS_FILE = '.deckent/nervous-respawn-requests.jsonl';

export interface RespawnRequest {
  taskId: string;
  requestedAt: string;
}

/** Append a respawn request for `taskId` (creates `.deckent` if absent). */
export function requestWorkerRespawn(projectRoot: string, taskId: string): void {
  const path = join(projectRoot, RESPAWN_REQUESTS_FILE);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const req: RespawnRequest = { taskId, requestedAt: new Date().toISOString() };
  appendFileSync(path, JSON.stringify(req) + '\n', 'utf-8');
}

/**
 * Read + CLEAR all pending respawn requests, returning the unique requested task
 * ids (most-recent-wins dedup). Consume-once semantics: the controller calls this
 * inside its single-threaded result loop, actions each id, and the file is removed
 * so the same request is never replayed. Malformed lines are skipped. Missing
 * file → `[]`.
 */
export function drainRespawnRequests(projectRoot: string): string[] {
  const path = join(projectRoot, RESPAWN_REQUESTS_FILE);
  if (!existsSync(path)) return [];
  let content = '';
  try {
    content = readFileSync(path, 'utf-8');
  } catch {
    return [];
  }
  // Remove the queue first — a failure actioning one id must not replay the rest.
  try {
    rmSync(path, { force: true });
  } catch {
    // best-effort: if removal fails the ids are still returned (at-least-once)
  }
  const ids = new Set<string>();
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line) as RespawnRequest;
      if (typeof req.taskId === 'string' && req.taskId) ids.add(req.taskId);
    } catch {
      // skip corrupt line
    }
  }
  return [...ids];
}
