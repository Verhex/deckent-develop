// ═══ Orphan Cleaner ══════════════════════════════════════════════════
// Sprint 144 Task 018: Post-finalize orphan archival + Pre-flight cleanup.
//
// Post-finalize: archive terminal (DONE/NO_GO) task files after sprint ends.
//   PENDING/EXECUTING tasks are preserved.
//   Stale locks (>5min) are cleared.
//
// Pre-flight: before PLAN phase, move orphan task files from previous sprints
//   to archive. Skips if another live sprint pid exists.

import {
  existsSync, readdirSync, readFileSync,
  mkdirSync, copyFileSync, unlinkSync,
} from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { join } from 'node:path';

import { TASKS_DIR } from './constants.js';
import { clearStaleLocks } from './file-lock.js';
import { debugLog } from './utils.js';

// ─── Constants ──────────────────────────────────────────────────────

/** Task statuses that mean "still active" — never archive these */
const ACTIVE_STATUSES = new Set([
  'DRAFT', 'PENDING', 'CLAIMED', 'EXECUTING', 'TESTING', 'DOCUMENTING', 'PAUSED',
]);

/** Stale lock threshold: 5 minutes */
const STALE_LOCK_AGE_MS = 5 * 60 * 1000;

/** Task file extensions eligible for archival */
const TASK_FILE_RE = /\.(json|result|hb|plan|log|timeout|verify-delta\.json)$/;

// ─── Types ──────────────────────────────────────────────────────────

export interface PostFinalizeReport {
  archivedFiles: string[];
  preservedFiles: string[];
  staleLocksCleaned: number;
}

export interface PreflightReport {
  /** Whether cleanup was actually performed */
  performed: boolean;
  /** Reason cleanup was skipped (if not performed) */
  skipReason?: string;
  /** Files moved to archive */
  archivedFiles: string[];
  /** Sprint IDs whose files were cleaned */
  cleanedSprintIds: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function extractSprintNumber(sprintId: string): string | null {
  const match = sprintId.match(/sprint-(\d+)/);
  return match?.[1] ?? null;
}

function readTaskStatus(filePath: string): string | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as { status?: string };
    return parsed.status ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract sprint number from a task filename like "task-143-001.json".
 * Returns the sprint number string (e.g. "143") or null.
 */
function sprintNumberFromFilename(filename: string): string | null {
  const match = filename.match(/^task-(\d+)-/);
  return match?.[1] ?? null;
}

// ─── Post-Finalize Cleanup ──────────────────────────────────────────

/**
 * Archive terminal task files (DONE/NO_GO) after sprint finalization.
 * Active tasks (PENDING/EXECUTING/etc.) are preserved.
 * Stale locks (>5min) are cleaned.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - The sprint that just completed (e.g. "sprint-144")
 * @returns Report of what was archived/preserved/cleaned
 */
export function postFinalizeCleanup(
  projectRoot: string,
  sprintId: string,
): PostFinalizeReport {
  const report: PostFinalizeReport = {
    archivedFiles: [],
    preservedFiles: [],
    staleLocksCleaned: 0,
  };

  const sprintNum = extractSprintNumber(sprintId);
  if (!sprintNum) {
    debugLog('orphan-cleaner:postFinalize', `Cannot extract sprint number from ${sprintId}`);
    return report;
  }

  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return report;

  const prefix = `task-${sprintNum}-`;
  const allFiles = readdirSync(tasksDir).filter(f => f.startsWith(prefix));

  // Archive task files (if any)
  if (allFiles.length > 0) {
    // Group files by task ID
    const taskGroups = new Map<string, string[]>();
    for (const file of allFiles) {
      const idMatch = file.match(/^(task-\d+-\d+)/);
      if (idMatch?.[1]) {
        const group = taskGroups.get(idMatch[1]) ?? [];
        group.push(file);
        taskGroups.set(idMatch[1], group);
      }
    }

    const archiveDir = join(projectRoot, TASKS_DIR, 'archive', sprintId);

    for (const [taskId, files] of taskGroups) {
      const jsonPath = join(tasksDir, `${taskId}.json`);
      const status = existsSync(jsonPath) ? readTaskStatus(jsonPath) : null;

      if (status && ACTIVE_STATUSES.has(status)) {
        // Active — preserve
        report.preservedFiles.push(...files);
        debugLog('orphan-cleaner:postFinalize', `Preserving active task ${taskId} (status=${status})`);
        continue;
      }

      // Terminal or unknown → archive
      mkdirSync(archiveDir, { recursive: true });
      for (const file of files) {
        try {
          const src = join(tasksDir, file);
          const dest = join(archiveDir, file);
          copyFileSync(src, dest);
          unlinkSync(src);
          report.archivedFiles.push(file);
        } catch (e) {
          debugLog('orphan-cleaner:postFinalize', `Failed to archive ${file}: ${e}`);
        }
      }
    }
  }

  // Clean stale locks (>5min) — always runs regardless of task files
  try {
    report.staleLocksCleaned = clearStaleLocks(projectRoot, STALE_LOCK_AGE_MS);
    if (report.staleLocksCleaned > 0) {
      debugLog('orphan-cleaner:postFinalize', `Cleaned ${report.staleLocksCleaned} stale locks`);
    }
  } catch (e) {
    debugLog('orphan-cleaner:postFinalize', `Stale lock cleanup failed: ${e}`);
  }

  debugLog('orphan-cleaner:postFinalize',
    `archived=${report.archivedFiles.length} preserved=${report.preservedFiles.length} staleLocks=${report.staleLocksCleaned}`);

  return report;
}

// ─── Pre-flight Orphan Cleanup ──────────────────────────────────────

/**
 * Pre-flight cleanup: before PLAN phase, move task files from previous sprints
 * to archive. Skips if another live sprint pid is found.
 *
 * Sprint 143 lesson (2026-04-17): orphan task files from a previous sprint
 * can confuse the planner and result collector. This function runs at
 * `deckent_start` → PLAN phase ÖNCESİ.
 *
 * @param projectRoot - Project root directory
 * @param currentSprintId - The new sprint about to start (e.g. "sprint-145")
 * @returns Report of what was cleaned
 */
export function preflightOrphanCleanup(
  projectRoot: string,
  currentSprintId: string,
): PreflightReport {
  const report: PreflightReport = {
    performed: false,
    archivedFiles: [],
    cleanedSprintIds: [],
  };

  const currentNum = extractSprintNumber(currentSprintId);
  if (!currentNum) {
    report.skipReason = `Cannot extract sprint number from ${currentSprintId}`;
    return report;
  }

  // Check for other live sprint PIDs — skip if found
  const pidsDir = join(projectRoot, '.deckent', 'pids');
  if (existsSync(pidsDir)) {
    try {
      const pidFiles = readdirSync(pidsDir).filter(f => f.endsWith('.pid'));
      for (const pidFile of pidFiles) {
        const pidSprintId = pidFile.replace('.pid', '');
        if (pidSprintId === currentSprintId) continue;

        // Read PID and check liveness
        try {
          const raw = readFileSync(join(pidsDir, pidFile), 'utf-8');
          const data = JSON.parse(raw) as { pid?: number };
          if (typeof data.pid === 'number') {
            try {
              process.kill(data.pid, 0);
              // Process alive — another sprint is running, skip cleanup
              report.skipReason = `Live sprint detected: ${pidSprintId} (PID ${data.pid})`;
              return report;
            } catch (err: unknown) {
              const code = (err as NodeJS.ErrnoException).code;
              if (code === 'EPERM') {
                // Process alive but we don't own it — still skip
                report.skipReason = `Live sprint detected: ${pidSprintId} (PID ${data.pid}, EPERM)`;
                return report;
              }
              // ESRCH = dead — continue, this PID is stale
            }
          }
        } catch {
          // Unparseable PID file — ignore
        }
      }
    } catch {
      // pidsDir read failed — continue with cleanup
    }
  }

  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) {
    report.skipReason = '.tasks/ directory does not exist';
    return report;
  }

  const allFiles = readdirSync(tasksDir).filter(f =>
    f.startsWith('task-') && TASK_FILE_RE.test(f),
  );

  // Group orphan files by their sprint number
  const orphansBySprintNum = new Map<string, string[]>();

  for (const file of allFiles) {
    const fileSprintNum = sprintNumberFromFilename(file);
    if (!fileSprintNum) continue;
    if (fileSprintNum === currentNum) continue; // Skip current sprint's files

    const group = orphansBySprintNum.get(fileSprintNum) ?? [];
    group.push(file);
    orphansBySprintNum.set(fileSprintNum, group);
  }

  if (orphansBySprintNum.size === 0) {
    report.performed = true;
    return report;
  }

  // Move orphan files to archive
  for (const [sprintNum, files] of orphansBySprintNum) {
    const archiveDir = join(projectRoot, TASKS_DIR, 'archive', `sprint-${sprintNum}`);
    mkdirSync(archiveDir, { recursive: true });

    for (const file of files) {
      try {
        const src = join(tasksDir, file);
        const dest = join(archiveDir, file);
        copyFileSync(src, dest);
        unlinkSync(src);
        report.archivedFiles.push(file);
      } catch (e) {
        debugLog('orphan-cleaner:preflight', `Failed to archive ${file}: ${e}`);
      }
    }

    report.cleanedSprintIds.push(`sprint-${sprintNum}`);
  }

  report.performed = true;
  debugLog('orphan-cleaner:preflight',
    `Cleaned ${report.archivedFiles.length} orphan files from ${report.cleanedSprintIds.length} sprints`);

  return report;
}

// ─── IPC Directory Cleanup ───────────────────────────────────────────

/**
 * M7.B: Pre-flight orphan IPC directory scan.
 * Removes stale sprint IPC directories from previous sprint runs.
 * Protects the current sprint's IPC directory.
 *
 * @param root - Project root directory
 * @param currentJobId - Current sprint/job ID (e.g. "sprint-145") — protected from deletion
 * @returns Number of orphan IPC directories removed
 */
export async function cleanOrphanIpcDirs(root: string, currentJobId: string): Promise<number> {
  const deckentDir = join(root, '.deckent');
  const entries = await fsPromises.readdir(deckentDir).catch(() => [] as string[]);
  const ipcPattern = /^sprint-\d+-ipc$/;
  let cleaned = 0;
  for (const entry of entries) {
    if (!ipcPattern.test(entry)) continue;
    const jobIdMatch = entry.match(/^(sprint-\d+)-ipc$/);
    if (!jobIdMatch) continue;
    const jobId = jobIdMatch[1];
    if (jobId === currentJobId) continue; // protect current
    await fsPromises.rm(join(deckentDir, entry), { recursive: true, force: true });
    cleaned++;
  }
  return cleaned;
}
