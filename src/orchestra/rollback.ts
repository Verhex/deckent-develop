// ═══ Rollback — Git Safety Point Management ══════════════════════════
// Provides automatic git safety before sprint starts.
// createSafetyPoint: create a backup branch before sprint
// rollback: restore to backup branch on failure
// isCleanWorkingTree: detect uncommitted changes

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ErrorRegistry } from '../core/errors.js';
import { debugLog } from '../core/utils.js';
import { recordRollbackDebt } from './debt-manager.js';

// ─── Types ────────────────────────────────────────────────────────

export interface SafetyPoint {
  /** Unique ID (sprintId) */
  id: string;
  /** Git branch name created for backup */
  branchName: string;
  /** SHA of HEAD at the time the safety point was created */
  commitSha: string;
  /** ISO timestamp */
  createdAt: string;
  /** Whether the working tree was clean at creation time */
  wasClean: boolean;
}

export interface RollbackResult {
  success: boolean;
  message: string;
}

export type RollbackPolicy = 'auto' | 'ask' | 'never';

// ─── Helpers ──────────────────────────────────────────────────────

function git(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    status: result.status ?? 1,
  };
}

// ─── isCleanWorkingTree ────────────────────────────────────────────

/**
 * Returns true if there are no uncommitted changes (staged or unstaged).
 * Untracked files are NOT considered dirty.
 */
export function isCleanWorkingTree(projectRoot: string): boolean {
  const result = git(['status', '--porcelain', '--untracked-files=no'], projectRoot);
  if (result.status !== 0) {
    // If git command fails, assume dirty to be safe
    return false;
  }
  return result.stdout.length === 0;
}

/**
 * Returns a list of uncommitted changed files (tracked, not committed).
 */
export function getDirtyFiles(projectRoot: string): string[] {
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: projectRoot,
    encoding: 'utf-8',
  });
  if ((result.status ?? 1) !== 0) return [];
  const raw = result.stdout ?? '';
  if (!raw.trim()) return [];
  return raw
    .split('\n')
    .filter(line => line.length >= 3)
    .map(line => line.slice(3).trim())
    .filter(Boolean);
}

// ─── getCurrentCommitSha ──────────────────────────────────────────

export function getCurrentCommitSha(projectRoot: string): string {
  const result = git(['rev-parse', 'HEAD'], projectRoot);
  if (result.status !== 0) return '';
  return result.stdout;
}

// ─── getCurrentBranch ─────────────────────────────────────────────

export function getCurrentBranch(projectRoot: string): string {
  const result = git(['rev-parse', '--abbrev-ref', 'HEAD'], projectRoot);
  if (result.status !== 0) return 'HEAD';
  return result.stdout;
}

// ─── createSafetyPoint ───────────────────────────────────────────

/**
 * Creates a git backup branch `deckent-backup-{sprintId}` at current HEAD.
 * If the working tree is dirty, stashes changes first.
 *
 * @returns SafetyPoint metadata
 */
export function createSafetyPoint(projectRoot: string, sprintId: string): SafetyPoint {
  const branchName = `deckent-backup-${sprintId}`;
  const wasClean = isCleanWorkingTree(projectRoot);

  // If dirty, stash to get a clean SHA reference
  if (!wasClean) {
    const stashResult = git(['stash', 'push', '-m', `deckent-safety-${sprintId}`], projectRoot);
    if (stashResult.status !== 0) {
      throw ErrorRegistry.createError('DECKENT_E050', { message: `Failed to stash changes before creating safety point: ${stashResult.stderr}` });
    }
  }

  const commitSha = getCurrentCommitSha(projectRoot);
  if (!commitSha) {
    throw ErrorRegistry.createError('DECKENT_E051');
  }

  // Create the backup branch pointing to current HEAD
  const branchResult = git(['branch', branchName], projectRoot);
  if (branchResult.status !== 0) {
    // Branch may already exist — try to force update
    const forceResult = git(['branch', '-f', branchName], projectRoot);
    if (forceResult.status !== 0) {
      throw ErrorRegistry.createError('DECKENT_E052', { message: `Failed to create safety branch "${branchName}": ${branchResult.stderr}` });
    }
  }

  // If we stashed, pop the stash to restore working tree state
  if (!wasClean) {
    const popResult = git(['stash', 'pop'], projectRoot);
    if (popResult.status !== 0) {
      // CRITICAL: stash pop failed — user's uncommitted changes are trapped in stash.
      // We must NOT silently continue; the user needs to recover manually.
      throw ErrorRegistry.createError('DECKENT_E057', {
        message: `Stash pop failed after safety point creation: ${popResult.stderr}. ` +
          'Your uncommitted changes are saved in git stash. ' +
          'Run `git stash list` to see them, then `git stash pop` to restore manually.',
      });
    }
  }

  return {
    id: sprintId,
    branchName,
    commitSha,
    createdAt: new Date().toISOString(),
    wasClean,
  };
}

// ─── rollback ─────────────────────────────────────────────────────

/**
 * Rolls back to the safety point branch using `git reset --hard`.
 * WARNING: This will discard all uncommitted changes.
 *
 * @param projectRoot - absolute path to the git repository root
 * @param safetyPoint - the SafetyPoint returned by createSafetyPoint
 */
export function rollback(projectRoot: string, safetyPoint: SafetyPoint): RollbackResult {
  const { branchName, commitSha } = safetyPoint;

  // Verify the branch exists
  const checkResult = git(['rev-parse', '--verify', branchName], projectRoot);
  if (checkResult.status !== 0) {
    return {
      success: false,
      message: `Safety branch "${branchName}" not found — cannot rollback`,
    };
  }

  // Get the SHA that the safety branch points to
  const safetyResult = git(['rev-parse', branchName], projectRoot);
  if (safetyResult.status !== 0) {
    return {
      success: false,
      message: `Failed to resolve safety branch SHA: ${safetyResult.stderr}`,
    };
  }

  const safetySha = safetyResult.stdout;

  // Hard reset to the safety point SHA
  const resetResult = git(['reset', '--hard', safetySha], projectRoot);
  if (resetResult.status !== 0) {
    return {
      success: false,
      message: `git reset --hard failed: ${resetResult.stderr}`,
    };
  }

  return {
    success: true,
    message: `Rolled back to safety point "${branchName}" (${commitSha.slice(0, 8)})`,
  };
}

// ─── deleteSafetyPoint ────────────────────────────────────────────

/**
 * Removes the backup branch AND the persisted JSON file after a successful sprint (cleanup).
 * Symmetric partner of saveSafetyPoint — ensures no stale artifacts remain.
 */
export function deleteSafetyPoint(projectRoot: string, safetyPoint: SafetyPoint): boolean {
  const result = git(['branch', '-D', safetyPoint.branchName], projectRoot);
  // Always clean up the JSON file, even if branch delete failed (branch may already be gone)
  deleteSafetyPointFile(projectRoot);
  return result.status === 0;
}

/**
 * Delete the persisted safety-point JSON file from disk.
 * Symmetric partner of saveSafetyPoint / loadSafetyPoint.
 */
export function deleteSafetyPointFile(projectRoot: string): void {
  const filePath = join(projectRoot, SAFETY_POINT_FILE);
  try {
    rmSync(filePath, { force: true });
  } catch (e) { debugLog('deleteSafetyPointFile:rmSync', e); }
}

// ─── safetyBranchExists ───────────────────────────────────────────

export function safetyBranchExists(projectRoot: string, sprintId: string): boolean {
  const branchName = `deckent-backup-${sprintId}`;
  const result = git(['rev-parse', '--verify', branchName], projectRoot);
  return result.status === 0;
}

// ─── getRollbackPolicy ────────────────────────────────────────────

/**
 * Determines the rollback policy based on task evaluation outcomes.
 * - All NO_GO  → auto-offer rollback
 * - Some NO_GO → ask user
 * - All DONE   → no rollback needed
 */
export function getRollbackPolicy(
  evaluations: Array<'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'>
): RollbackPolicy {
  if (evaluations.length === 0) return 'never';
  const noGoCount = evaluations.filter(e => e === 'NO_GO').length;
  if (noGoCount === evaluations.length) return 'auto';
  if (noGoCount > 0) return 'ask';
  return 'never';
}

// ─── recordRollbackInDebt ─────────────────────────────────────────

/**
 * Records a sprint rollback event as a debt entry.
 * Task #4b: DB-first — was a `.brain/DEBT.md` row append (the source of the
 * 7-vs-9-column corruption + missing-newline bug); now delegates to the
 * Memory V2 DB via recordRollbackDebt().
 */
export function recordRollbackInDebt(
  projectRoot: string,
  sprintId: string,
  result: RollbackResult,
): void {
  recordRollbackDebt(projectRoot, sprintId, result.success, result.message);
}

// ─── isGitRepo ───────────────────────────────────────────────────

/**
 * Check if the given directory is inside a git repository.
 */
export function isGitRepo(projectRoot: string): boolean {
  const result = git(['rev-parse', '--git-dir'], projectRoot);
  return result.status === 0;
}

// ─── cleanOrphanSafetyPoint ──────────────────────────────────────

/**
 * Remove orphan safety-point JSON from disk if it belongs to a different sprint.
 * Called at PLAN phase start to clean up stale artifacts from previous sprints
 * whose cleanup was incomplete.
 *
 * @returns true if an orphan was cleaned, false otherwise
 */
export function cleanOrphanSafetyPoint(projectRoot: string, currentSprintId: string): boolean {
  const existing = loadSafetyPoint(projectRoot);
  if (!existing) return false;

  // If the safety point belongs to the current sprint, leave it alone
  if (existing.id === currentSprintId) return false;

  // Check if the corresponding git branch is still live (someone might still need it)
  const branchLive = safetyBranchExists(projectRoot, existing.id);
  if (branchLive) {
    // Branch exists but sprint ID doesn't match — try to clean up both
    try {
      git(['branch', '-D', existing.branchName], projectRoot);
    } catch (e) { debugLog('cleanOrphanSafetyPoint:branchDelete', e); }
  }

  // Remove the stale JSON file
  deleteSafetyPointFile(projectRoot);
  debugLog('cleanOrphanSafetyPoint', `Cleaned orphan safety point from ${existing.id} (current: ${currentSprintId})`);
  return true;
}

// ─── saveSafetyPoint / loadSafetyPoint ────────────────────────────

const SAFETY_POINT_FILE = '.deckent/safety-point.json';

/**
 * Persist a safety point to disk so it survives process restarts.
 */
export function saveSafetyPoint(projectRoot: string, safetyPoint: SafetyPoint): void {
  const deckentDir = join(projectRoot, '.deckent');
  try {
    if (!existsSync(deckentDir)) mkdirSync(deckentDir, { recursive: true });
    writeFileSync(
      join(projectRoot, SAFETY_POINT_FILE),
      JSON.stringify(safetyPoint, null, 2),
      'utf-8',
    );
  } catch (e) { debugLog('saveSafetyPoint:writeFile', e); }
}

/**
 * Load a previously persisted safety point from disk.
 */
export function loadSafetyPoint(projectRoot: string): SafetyPoint | null {
  const path = join(projectRoot, SAFETY_POINT_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SafetyPoint;
  } catch (e) {
    debugLog('loadSafetyPoint:readFile', e);
    return null;
  }
}
