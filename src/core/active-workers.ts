import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TASKS_DIR = '.tasks';

interface HeartbeatPayload {
  taskId?: string;
  workerId?: string;
  status?: string;
}

// ─── Pending Spawns — Race-Window Protection (Sprint 170 P0-5) ────────────
// Tracks taskIds that are in the process of spawning but haven't written a
// .hb heartbeat file yet. Without this Set, a sibling worker kill() that
// triggers _cleanupOrphanedPromptFiles() during the ~3s docker run + health
// check window would see no .hb and delete the new worker's prompt file.
const PENDING_SPAWNS = new Set<string>();

/** Called in spawn() BEFORE prompt write — bridges the race window. */
export function markPending(taskId: string): void {
  PENDING_SPAWNS.add(taskId);
}

/** Called AFTER .hb is written — heartbeat file is now authoritative. */
export function markActive(taskId: string): void {
  PENDING_SPAWNS.delete(taskId);
}

/** Called on spawn failure / error path — prevents Set from leaking. */
export function clearPending(taskId: string): void {
  PENDING_SPAWNS.delete(taskId);
}

/** Test helper — clears entire pending set between test cases. */
export function _clearAllPending(): void {
  PENDING_SPAWNS.clear();
}

/** Test helper — returns snapshot of current pending taskIds. */
export function _getPendingSpawns(): string[] {
  return [...PENDING_SPAWNS];
}

/**
 * Returns active worker task IDs from heartbeat files (`.tasks/task-*.hb`).
 *
 * Extracted from `auditor.ts:2162-2168` pattern (Sprint 168 C0e — Cluster E fix).
 *
 * NOTE — field choice rationale:
 *  - This helper returns `taskId` because its primary consumer is
 *    `claude.ts._cleanupOrphanedPromptFiles()` selective filter, which matches
 *    Docker-spawned prompt filenames `.prompt-{taskId}-{promptId}.txt`
 *    (spawn-backend-docker.ts:226-230). The taskId is embedded inside the prompt
 *    filename, so a taskId-based filter correctly protects active worker prompts.
 *  - `auditor.ts:2162-2168` purposely uses `workerId` (different semantic) for
 *    its lock-cleanup pattern; auditor's local logic is left intact and is NOT
 *    replaced by this helper. The two patterns are complementary, not redundant.
 *
 * Used by:
 *  - `src/providers/claude.ts` — `_cleanupOrphanedPromptFiles()` selective filter
 *    (Option C protection, Sprint 168 C0e BUG-HH eradication)
 *
 * @param projectRoot Project root directory (parent of `.tasks/`)
 * @returns Array of active worker `taskId` strings (empty if directory missing,
 *          malformed, or contains no parseable `.hb` files).
 */
export function getActiveWorkerIds(projectRoot: string): string[] {
  // Union: pending (no .hb yet) + heartbeat files on disk — deduped via Set
  const ids = new Set<string>(PENDING_SPAWNS);

  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return [...ids];

  try {
    const files = readdirSync(tasksDir);
    for (const file of files) {
      if (!file.endsWith('.hb')) continue;
      try {
        const raw = readFileSync(join(tasksDir, file), 'utf-8');
        const hb = JSON.parse(raw) as HeartbeatPayload;
        if (hb.taskId) ids.add(hb.taskId);
      } catch {
        // malformed .hb — skip
      }
    }
    return [...ids];
  } catch {
    return [...ids];
  }
}
