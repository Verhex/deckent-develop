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
  existsSync, readdirSync, readFileSync, statSync,
  mkdirSync, copyFileSync, unlinkSync, rmSync,
} from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { join } from 'node:path';

import { TASKS_DIR } from './constants.js';
import { clearStaleLocks } from './file-lock.js';
import { isPidAlive } from './pid-liveness.js';
import { openTaskSettlementProjection } from './task-settlement-authority.js';
import { resolveTenant } from './tenant-context.js';
import { debugLog } from './utils.js';

// ─── Constants ──────────────────────────────────────────────────────

/** Task statuses that mean "still active" — never archive these */
const ACTIVE_STATUSES = new Set([
  'DRAFT', 'PENDING', 'CLAIMED', 'EXECUTING', 'TESTING', 'DOCUMENTING', 'PAUSED',
]);

/** Only explicit terminal proof is archive-eligible. Unknown is preserved. */
const TERMINAL_STATUSES = new Set(['DONE', 'NO_GO']);
const RECEIPT_PROJECTED_TERMINAL_STATUSES = new Set([
  'DONE',
  'NO_GO',
  'NOT_DISPATCHED',
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

export interface TaskExecutionStateProjection {
  readonly effectiveStatus: string;
  readonly evidenceRefs: readonly string[];
  readonly receiptRef?: {
    readonly invocationId: string;
    readonly tenantId: string;
    readonly projectId: string;
  };
}

export interface OrphanCleanerAuthorityOptions {
  /**
   * Optional canonical receipt projection. A projected terminal status is
   * archive-eligible only when the projection also carries an exact receipt
   * ref and at least one immutable evidence ref.
   */
  readonly projectTaskExecutionState?: (
    taskId: string,
    rawStatus: string,
    tenantId?: string,
  ) => TaskExecutionStateProjection;
}

// ─── Helpers ────────────────────────────────────────────────────────

function extractSprintNumber(sprintId: string): string | null {
  const match = sprintId.match(/sprint-(\d+)/);
  return match?.[1] ?? null;
}

interface TaskAuthorityIdentity {
  readonly status: string;
  readonly tenantId: string;
}

function readTaskAuthorityIdentity(
  projectRoot: string,
  filePath: string,
  expectedTaskId: string,
): TaskAuthorityIdentity | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const task = parsed as Record<string, unknown>;
    if (
      task.id !== expectedTaskId
      || typeof task.status !== 'string'
      || task.status.trim().length === 0
    ) return null;

    let tenantId: string | undefined;
    if (task.actor !== undefined) {
      if (!task.actor || typeof task.actor !== 'object' || Array.isArray(task.actor)) return null;
      const actor = task.actor as Record<string, unknown>;
      if (actor.tenantId !== undefined) {
        if (typeof actor.tenantId !== 'string') return null;
        tenantId = actor.tenantId;
      }
    }
    return {
      status: task.status,
      tenantId: resolveTenant(projectRoot, {
        ...(tenantId !== undefined ? { tenantId } : {}),
      }).tenantId,
    };
  } catch {
    return null;
  }
}

function hasReceiptProjectionProof(
  projection: TaskExecutionStateProjection,
  tenantId: string,
): boolean {
  if (
    !RECEIPT_PROJECTED_TERMINAL_STATUSES.has(projection.effectiveStatus)
    || !Array.isArray(projection.evidenceRefs)
    || projection.evidenceRefs.length < 1
    || projection.evidenceRefs.length > 32
    || projection.evidenceRefs.some(ref => (
      typeof ref !== 'string'
      || ref !== ref.trim()
      || ref.length < 1
      || ref.length > 512
    ))
    || new Set(projection.evidenceRefs).size !== projection.evidenceRefs.length
    || projection.receiptRef === undefined
  ) return false;
  const { receiptRef } = projection;
  return (
    typeof receiptRef.invocationId === 'string'
    && receiptRef.invocationId.trim().length > 0
    && typeof receiptRef.tenantId === 'string'
    && receiptRef.tenantId === tenantId
    && typeof receiptRef.projectId === 'string'
    && receiptRef.projectId.trim().length > 0
  );
}

/**
 * Extract sprint number from a task filename like "task-143-001.json".
 * Returns the sprint number string (e.g. "143") or null.
 */
function taskIdFromArtifactFilename(filename: string): string | null {
  const extensionBoundary = filename.indexOf('.');
  if (extensionBoundary <= 0) return null;
  const artifactTaskId = filename.slice(0, extensionBoundary);
  const canonicalTaskId = artifactTaskId.replace(/^task-/, '');
  return /^\d+-\d+(?:-(?:fix|xfix))*$/.test(canonicalTaskId)
    ? canonicalTaskId
    : null;
}

function sprintNumberFromFilename(filename: string): string | null {
  return taskIdFromArtifactFilename(filename)?.split('-', 1)[0] ?? null;
}

// ─── Sprint-Scoped Task-File Classification (shared) ────────────────

/** Read-only classification of a sprint's on-disk task files. */
export interface SprintFileClassification {
  /** Files belonging to terminal tasks — eligible for archive. */
  archivedFiles: string[];
  /** Files belonging to active (ACTIVE_STATUSES) tasks — preserved. */
  preservedFiles: string[];
  /** taskId → files, terminal only (drives the archive mutation). */
  archiveGroups: Map<string, string[]>;
}

/**
 * Classify a sprint's task files into archive-eligible vs preserved, WITHOUT
 * mutating anything. Sprint-scoped by parsed task identity, so artifacts with
 * or without the `task-` filename prefix are considered only when their
 * canonical task JSON belongs to this sprint. Active tasks (PENDING — incl.
 * pending fix tasks — EXECUTING, PAUSED, …) are preserved; only an explicit
 * terminal status (DONE/NO_GO) is archive-eligible. Missing/malformed/unknown
 * status is preserved because absence of terminal proof is not completion.
 *
 * Pure read-only (readdir/stat/read only) — the single source of truth shared by
 * `postFinalizeCleanup` (which then mutates) and `previewFinalizeCleanup` (which
 * only reports), so the dry-run preview and the real archive can never disagree.
 *
 * @returns classification, or `null` when the sprintId has no extractable number.
 */
export function classifySprintTaskFiles(
  projectRoot: string,
  sprintId: string,
  options: OrphanCleanerAuthorityOptions = {},
): SprintFileClassification | null {
  const sprintNum = extractSprintNumber(sprintId);
  if (!sprintNum) return null;

  const result: SprintFileClassification = {
    archivedFiles: [],
    preservedFiles: [],
    archiveGroups: new Map(),
  };

  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return result;

  // Group files by the COMPLETE task ID. Task IDs may carry one or more
  // `-fix` suffixes (`task-144-001-fix-fix`). Grouping with the old
  // `/^(task-\d+-\d+)/` prefix collapsed every fix/xfix artifact into the base
  // task and could archive a PENDING fix merely because its base task was DONE.
  // Artifact filenames use the first `.` as the task-id/extension boundary;
  // task IDs themselves never contain dots.
  const taskGroups = new Map<string, string[]>();
  for (const file of readdirSync(tasksDir)) {
    const canonicalTaskId = taskIdFromArtifactFilename(file);
    if (!canonicalTaskId || !canonicalTaskId.startsWith(`${sprintNum}-`)) continue;
    const group = taskGroups.get(canonicalTaskId) ?? [];
    group.push(file);
    taskGroups.set(canonicalTaskId, group);
  }

  let projectionStore: ReturnType<typeof openTaskSettlementProjection> | null = null;
  let projectTaskExecutionState = options.projectTaskExecutionState;
  if (!projectTaskExecutionState) {
    try {
      projectionStore = openTaskSettlementProjection(projectRoot);
      projectTaskExecutionState = (taskId, rawStatus, tenantId) =>
        projectionStore!.projectTaskExecutionState(taskId, rawStatus, tenantId);
    } catch {
      // Missing/corrupt projection authority is not terminal proof.
      projectionStore = null;
    }
  }

  try {
    for (const [canonicalTaskId, files] of taskGroups) {
      const artifactTaskId = `task-${canonicalTaskId}`;
      const jsonPath = join(tasksDir, `${artifactTaskId}.json`);
      const identity = existsSync(jsonPath)
        ? readTaskAuthorityIdentity(projectRoot, jsonPath, canonicalTaskId)
        : null;
      const status = identity?.status ?? null;
      let terminal = status !== null && TERMINAL_STATUSES.has(status);
      if (!terminal && status && identity && projectTaskExecutionState) {
        try {
          const projection = projectTaskExecutionState(
            canonicalTaskId,
            status,
            identity.tenantId,
          );
          terminal = hasReceiptProjectionProof(projection, identity.tenantId);
        } catch {
          terminal = false;
        }
      }
      if (!status || (ACTIVE_STATUSES.has(status) && !terminal) || !terminal) {
        result.preservedFiles.push(...files);
        continue;
      }
      // Explicit terminal proof → archive-eligible.
      result.archivedFiles.push(...files);
      result.archiveGroups.set(artifactTaskId, files);
    }
  } finally {
    projectionStore?.close();
  }

  return result;
}

/**
 * Read-only preview of what {@link postFinalizeCleanup} WOULD archive/preserve
 * for a sprint — no filesystem mutation, no lock clearing, no subprocess. Used
 * by `deckent recover --dry-run` so the preview reports the requested sprint's
 * exact archive/preserve set (the same set the real archive would move).
 */
export function previewFinalizeCleanup(
  projectRoot: string,
  sprintId: string,
  options: OrphanCleanerAuthorityOptions = {},
): { archivedFiles: string[]; preservedFiles: string[] } {
  const cls = classifySprintTaskFiles(projectRoot, sprintId, options);
  if (!cls) return { archivedFiles: [], preservedFiles: [] };
  return { archivedFiles: cls.archivedFiles, preservedFiles: cls.preservedFiles };
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
  opts: { cleanStaleLocks?: boolean } & OrphanCleanerAuthorityOptions = {},
): PostFinalizeReport {
  const report: PostFinalizeReport = {
    archivedFiles: [],
    preservedFiles: [],
    staleLocksCleaned: 0,
  };

  const cls = classifySprintTaskFiles(projectRoot, sprintId, opts);
  if (!cls) {
    debugLog('orphan-cleaner:postFinalize', `Cannot extract sprint number from ${sprintId}`);
    return report;
  }

  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return report;

  // Preserve active tasks (classification is the shared source of truth).
  report.preservedFiles.push(...cls.preservedFiles);
  for (const taskId of cls.archiveGroups.keys()) {
    debugLog('orphan-cleaner:postFinalize', `Archiving terminal task ${taskId}`);
  }

  // Archive terminal task files (if any)
  if (cls.archiveGroups.size > 0) {
    const archiveDir = join(projectRoot, TASKS_DIR, 'archive', sprintId);
    for (const files of cls.archiveGroups.values()) {
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

  // Normal finalization keeps its historical stale-lock cleanup. A targeted
  // recovery command passes `cleanStaleLocks:false`: a sprint-scoped action
  // must never delete another sprint's lock merely because it is old.
  if (opts.cleanStaleLocks !== false) {
    try {
      report.staleLocksCleaned = clearStaleLocks(projectRoot, STALE_LOCK_AGE_MS);
      if (report.staleLocksCleaned > 0) {
        debugLog('orphan-cleaner:postFinalize', `Cleaned ${report.staleLocksCleaned} stale locks`);
      }
    } catch (e) {
      debugLog('orphan-cleaner:postFinalize', `Stale lock cleanup failed: ${e}`);
    }
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
  options: OrphanCleanerAuthorityOptions = {},
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
            if (isPidAlive(data.pid)) {
              // Process alive — another sprint is running, skip cleanup
              report.skipReason = `Live sprint detected: ${pidSprintId} (PID ${data.pid})`;
              return report;
            }
            // Dead PID — continue, this PID is stale
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

  const allFiles = readdirSync(tasksDir).filter(f => TASK_FILE_RE.test(f));

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

  // Move only receipt/raw-terminal orphan files to archive. A previous sprint
  // id is not completion proof: active or ambiguous task groups remain live.
  for (const [sprintNum] of orphansBySprintNum) {
    const classification = classifySprintTaskFiles(
      projectRoot,
      `sprint-${sprintNum}`,
      options,
    );
    if (!classification || classification.archivedFiles.length === 0) continue;
    const archiveDir = join(projectRoot, TASKS_DIR, 'archive', `sprint-${sprintNum}`);
    mkdirSync(archiveDir, { recursive: true });

    for (const file of classification.archivedFiles) {
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

    if (classification.archivedFiles.length > 0) {
      report.cleanedSprintIds.push(`sprint-${sprintNum}`);
    }
  }

  report.performed = true;
  debugLog('orphan-cleaner:preflight',
    `Cleaned ${report.archivedFiles.length} orphan files from ${report.cleanedSprintIds.length} sprints`);

  return report;
}

// ─── IPC Directory Cleanup ───────────────────────────────────────────

/**
 * M7.B (legacy async API): Pre-flight orphan IPC directory scan.
 * Removes stale sprint IPC directories from previous sprint runs.
 * Protects the current sprint's IPC directory.
 *
 * @param root - Project root directory
 * @param currentJobId - Current sprint/job ID (e.g. "sprint-145") — protected from deletion
 * @returns Number of orphan IPC directories removed
 * @deprecated Use cleanOrphanIpcDirs(root, opts) for live-PID-check support
 */
export async function cleanOrphanIpcDirsLegacy(root: string, currentJobId: string): Promise<number> {
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

// ─── IPC Directory Cleanup (Live-PID-Check) ──────────────────────────

export interface CleanOrphanIpcDirsOpts {
  /** If true, read config.json from each IPC dir and check if the PID is alive before deleting. */
  checkLivePid: boolean;
  /**
   * Minimum age in milliseconds before a PID-less IPC dir is eligible for deletion.
   * Prevents removing freshly-created dirs (e.g. from a concurrent deckent_start)
   * that haven't had time to write a pid to config.json yet.
   * Default: 30000 (30 seconds).
   */
  minAgeMs?: number;
}

/**
 * M7.B v2: Pre-flight orphan IPC directory scan with live-PID check.
 *
 * Scans `.deckent/` for `sprint-*-ipc` directories. For each:
 * - If no config.json → safe to remove (config-only leak or partial write).
 * - If config.json present and checkLivePid=true → read pid, skip if alive.
 * - If config.json present and pid is dead (or no pid) → remove.
 *
 * This makes it safe to call at `deckent_start` pre-flight even when concurrent
 * integration tests create their own IPC dirs, because live PIDs are preserved.
 *
 * @param root - Project root directory
 * @param opts - Options (default: { checkLivePid: true })
 * @returns Array of removed directory paths (relative to .deckent/)
 */
export function cleanOrphanIpcDirs(
  root: string,
  opts: CleanOrphanIpcDirsOpts = { checkLivePid: true },
): string[] {
  const cleaned: string[] = [];
  const deckentDir = join(root, '.deckent');
  const minAgeMs = opts.minAgeMs ?? 30_000; // 30 seconds default

  if (!existsSync(deckentDir)) return cleaned;

  let entries: string[];
  try {
    entries = readdirSync(deckentDir);
  } catch {
    return cleaned;
  }

  const ipcPattern = /^sprint-\d+-ipc$/;
  const now = Date.now();

  for (const entry of entries) {
    if (!ipcPattern.test(entry)) continue;

    const entryPath = join(deckentDir, entry);
    const configPath = join(entryPath, 'config.json');

    if (!existsSync(configPath)) {
      // No config.json — this is a config-only orphan or partial-write leak.
      // Guard: only remove if the dir is old enough (prevents races with
      // concurrent deckent_start that hasn't written config.json yet).
      try {
        const stat = statSync(entryPath);
        // Clamp to 0: on some filesystems/CI runners a freshly-created dir's
        // mtime can be >= now (coarse timestamp granularity / clock skew),
        // yielding a negative age that would wrongly skip with minAgeMs=0.
        const ageMs = Math.max(0, now - stat.mtimeMs);
        if (ageMs < minAgeMs) {
          debugLog('orphan-cleaner:cleanOrphanIpcDirs', `Skipping young config-less dir: ${entry} (age=${Math.round(ageMs)}ms < minAge=${minAgeMs}ms)`);
          continue;
        }
        rmSync(entryPath, { recursive: true, force: true });
        cleaned.push(entry);
      } catch {
        debugLog('orphan-cleaner:cleanOrphanIpcDirs', `Failed to remove config-less dir: ${entry}`);
      }
      continue;
    }

    if (opts.checkLivePid) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw) as { pid?: number };
        const pid = config.pid;
        if (pid !== undefined && isPidAlive(pid)) {
          // PID is alive — this is an active sprint IPC dir; preserve it
          debugLog('orphan-cleaner:cleanOrphanIpcDirs', `Preserving live IPC dir: ${entry} (PID ${pid})`);
          continue;
        }
        // No pid in config.json — apply age guard using config.json mtime
        if (pid === undefined) {
          try {
            const stat = statSync(configPath);
            // Clamp to 0 (CI fresh-dir mtime may be >= now → negative age).
            const ageMs = Math.max(0, now - stat.mtimeMs);
            if (ageMs < minAgeMs) {
              debugLog('orphan-cleaner:cleanOrphanIpcDirs', `Skipping young pid-less IPC dir: ${entry} (config age=${Math.round(ageMs)}ms)`);
              continue;
            }
          } catch {
            // stat failed — fall through to remove
          }
        }
      } catch {
        // Unparseable config.json — best-effort, fall through to remove
        debugLog('orphan-cleaner:cleanOrphanIpcDirs', `Failed to parse config.json in ${entry}, removing`);
      }
      // PID is dead or not present (and old enough) → remove
      try {
        rmSync(entryPath, { recursive: true, force: true });
        cleaned.push(entry);
      } catch {
        debugLog('orphan-cleaner:cleanOrphanIpcDirs', `Failed to remove dead IPC dir: ${entry}`);
      }
    }
  }

  return cleaned;
}

// Legacy local isPidAlive removed (Sprint 178 Task 4) — see
// src/core/pid-liveness.ts for the shared, portable implementation.
