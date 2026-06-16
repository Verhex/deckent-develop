// ═══ Task Restoration — Pre-Archive Guard ═══════════════════════════
// Sprint 143 Task 13: Auto-archive guard with pre-archive snapshot,
// status-aware filtering, and restore capability.

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { RECENT_WORKS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';

// ─── Types ───────────────────────────────────────────────────────────

/** Terminal statuses — only these are safe to archive */
const TERMINAL_STATUSES = new Set(['DONE', 'NO_GO']);

/** All task statuses that mean "still active" */
const ACTIVE_STATUSES = new Set(['DRAFT', 'PENDING', 'CLAIMED', 'EXECUTING', 'TESTING', 'DOCUMENTING', 'PAUSED']);

export interface SnapshotResult {
  snapshotPath: string;
  hashPath: string;
  hash: string;
  fileCount: number;
}

export interface RestoreResult {
  restoredFiles: string[];
  success: boolean;
  error?: string;
}

// ─── Snapshot Creation ───────────────────────────────────────────────

/**
 * Create a pre-archive snapshot of all task files for a sprint.
 * Produces `.deckent/recently-works/<sprintId>-pre-archive.tar.gz` + SHA-256 hash file.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Sprint ID (e.g. 'sprint-143')
 * @returns Snapshot result with path and hash, or null if no files to snapshot
 */
export function createPreArchiveSnapshot(
  projectRoot: string,
  sprintId: string,
): SnapshotResult | null {
  const tasksDir = join(projectRoot, '.tasks');
  if (!existsSync(tasksDir)) {
    debugLog('createPreArchiveSnapshot', '.tasks/ not found — skipping');
    return null;
  }

  // Extract sprint number from sprintId
  const match = sprintId.match(/sprint-(\d+)/);
  if (!match) {
    debugLog('createPreArchiveSnapshot', `Cannot extract sprint number from ${sprintId}`);
    return null;
  }
  const prefix = `task-${match[1]}-`;

  const allFiles = readdirSync(tasksDir);
  const sprintFiles = allFiles.filter(f => f.startsWith(prefix));

  if (sprintFiles.length === 0) {
    debugLog('createPreArchiveSnapshot', `No task files for ${sprintId}`);
    return null;
  }

  const recentWorksDir = join(projectRoot, RECENT_WORKS_DIR);
  mkdirSync(recentWorksDir, { recursive: true });

  const snapshotPath = join(recentWorksDir, `${sprintId}-pre-archive.tar.gz`);
  const hashPath = join(recentWorksDir, `${sprintId}-pre-archive.sha256`);

  // Create tar.gz using tar command (available on linux/macOS)
  const tarResult = spawnSync('tar', [
    '-czf', snapshotPath,
    '-C', tasksDir,
    ...sprintFiles,
  ], {
    encoding: 'utf-8',
    timeout: 30_000,
  });

  if (tarResult.status !== 0) {
    debugLog('createPreArchiveSnapshot', `tar failed: ${tarResult.stderr}`);
    return null;
  }

  // Compute SHA-256 hash of the tar.gz
  const hash = computeFileHash(snapshotPath);
  writeFileSync(hashPath, `${hash}  ${sprintId}-pre-archive.tar.gz\n`, 'utf-8');

  debugLog('createPreArchiveSnapshot', `Snapshot created: ${snapshotPath} (${sprintFiles.length} files, hash=${hash.slice(0, 12)}...)`);

  return {
    snapshotPath,
    hashPath,
    hash,
    fileCount: sprintFiles.length,
  };
}

// ─── Hash Verification ──────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a file.
 */
export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verify snapshot integrity by comparing stored hash with computed hash.
 *
 * @param snapshotPath - Path to the .tar.gz file
 * @param expectedHash - Expected SHA-256 hash
 * @returns true if hash matches
 */
export function verifySnapshot(snapshotPath: string, expectedHash: string): boolean {
  if (!existsSync(snapshotPath)) {
    debugLog('verifySnapshot', `Snapshot not found: ${snapshotPath}`);
    return false;
  }

  const actualHash = computeFileHash(snapshotPath);
  const valid = actualHash === expectedHash;

  if (!valid) {
    debugLog('verifySnapshot', `Hash mismatch: expected=${expectedHash.slice(0, 12)}... actual=${actualHash.slice(0, 12)}...`);
  }

  return valid;
}

// ─── Status-Aware Filtering ─────────────────────────────────────────

/**
 * Read task status from a task JSON file.
 * Returns the status string, or null if file can't be parsed.
 */
export function readTaskStatus(filePath: string): string | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as { status?: string };
    return parsed.status ?? null;
  } catch {
    return null;
  }
}

/**
 * Determine which task files are safe to archive based on their status.
 * Only tasks in terminal states (DONE, NO_GO) are archivable.
 * Tasks in active states (PENDING, EXECUTING, etc.) are preserved.
 *
 * @param tasksDir - Path to .tasks/ directory
 * @param sprintPrefix - File prefix (e.g. 'task-143-')
 * @param files - List of file names to check
 * @returns Object with archivable and preserved file lists
 */
export function classifyTaskFiles(
  tasksDir: string,
  _sprintPrefix: string,
  files: string[],
): { archivable: string[]; preserved: string[] } {
  const archivable: string[] = [];
  const preserved: string[] = [];

  // Group files by task ID (e.g. task-143-001)
  const taskGroups = new Map<string, string[]>();
  for (const file of files) {
    // Extract task ID: task-NNN-MMM from filename like task-143-001.json or task-143-001.hb
    const taskIdMatch = file.match(/^(task-\d+-\d+)/);
    if (taskIdMatch && taskIdMatch[1]) {
      const taskId = taskIdMatch[1];
      const group = taskGroups.get(taskId) ?? [];
      group.push(file);
      taskGroups.set(taskId, group);
    } else {
      // Non-task files (e.g. .prompt-*) are always archivable
      archivable.push(file);
    }
  }

  for (const [taskId, taskFiles] of taskGroups) {
    // Check status from .json file
    const jsonFile = `${taskId}.json`;
    const jsonPath = join(tasksDir, jsonFile);
    const status = existsSync(jsonPath) ? readTaskStatus(jsonPath) : null;

    if (status && ACTIVE_STATUSES.has(status)) {
      // Active task — preserve ALL related files
      preserved.push(...taskFiles);
    } else if (status && TERMINAL_STATUSES.has(status)) {
      // Terminal task — archive ALL related files
      archivable.push(...taskFiles);
    } else {
      // Unknown status or missing JSON — archive (safe default for orphans)
      archivable.push(...taskFiles);
    }
  }

  return { archivable, preserved };
}

// ─── Restore ─────────────────────────────────────────────────────────

/**
 * Restore task files from a pre-archive snapshot.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Sprint ID (e.g. 'sprint-143')
 * @returns Restore result with list of restored files
 */
export function restoreFromSnapshot(
  projectRoot: string,
  sprintId: string,
): RestoreResult {
  const recentWorksDir = join(projectRoot, RECENT_WORKS_DIR);
  const snapshotPath = join(recentWorksDir, `${sprintId}-pre-archive.tar.gz`);
  const hashPath = join(recentWorksDir, `${sprintId}-pre-archive.sha256`);

  if (!existsSync(snapshotPath)) {
    return { restoredFiles: [], success: false, error: `Snapshot not found: ${snapshotPath}` };
  }

  // Verify hash if hash file exists
  if (existsSync(hashPath)) {
    const hashContent = readFileSync(hashPath, 'utf-8').trim();
    const expectedHash = hashContent.split(/\s+/)[0] ?? '';
    if (!verifySnapshot(snapshotPath, expectedHash)) {
      return { restoredFiles: [], success: false, error: 'Snapshot hash verification failed — file may be corrupted' };
    }
  }

  const tasksDir = join(projectRoot, '.tasks');
  mkdirSync(tasksDir, { recursive: true });

  // List files in archive
  const listResult = spawnSync('tar', ['-tzf', snapshotPath], {
    encoding: 'utf-8',
    timeout: 10_000,
  });

  if (listResult.status !== 0) {
    return { restoredFiles: [], success: false, error: `Failed to list snapshot contents: ${listResult.stderr}` };
  }

  const archivedFiles = listResult.stdout.trim().split('\n').filter(f => f.length > 0);

  // Extract to .tasks/
  const extractResult = spawnSync('tar', [
    '-xzf', snapshotPath,
    '-C', tasksDir,
  ], {
    encoding: 'utf-8',
    timeout: 30_000,
  });

  if (extractResult.status !== 0) {
    return { restoredFiles: [], success: false, error: `Failed to extract snapshot: ${extractResult.stderr}` };
  }

  debugLog('restoreFromSnapshot', `Restored ${archivedFiles.length} files from ${snapshotPath}`);

  return { restoredFiles: archivedFiles, success: true };
}
