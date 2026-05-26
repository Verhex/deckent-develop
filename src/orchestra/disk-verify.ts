// ═══ Disk Verify — Synthetic NO_GO Gate (Sprint 195 Task 195-001) ════════
// W-INTEGRITY — host-side verification that a worker actually produced code
// before Brain converts a missing/empty `.result` into a synthetic NO_GO.
//
// Background — Sprint 191/192/194 forensics: five Brain code paths can fire
// a synthetic NO_GO when `.result` is absent or `filesChanged=[]`, even if
// the worker wrote real code on the host filesystem. The 1633 LoC manual
// rescue in Sprint 194 is the canonical cost-of-failure example.
//
// Design — one helper, two providers, three call-sites:
//   verifyDiskAgainstClaim(projectDir, scope, opts?)
//     → { hasDiskEvidence, linesAdded, untrackedFiles }
//   Providers are injectable for tests (Karpathy D2: simplicity first).
//   Fail-open: if git commands fail, returns "no evidence" so callers keep
//   their existing synthetic-NO_GO behavior — never bias toward false GO.
//
// Audit channel: BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH (emitted by callers,
// not by this module — separation of concerns).
//
// ADR-006: spawnSync array-form, no shell, fixed timeout.
// ADR-010: zero new runtime deps — Node builtins + existing spawnSync.

import { spawnSync } from 'node:child_process';
import { debugLog } from '../core/utils.js';
import type { TaskScope } from '../core/task-types.js';

// ─── Public API ───────────────────────────────────────────────────────

/** Audit channel emitted by callers when this module's result triggers a
 *  conversion of synthetic NO_GO → MANUAL_REVIEW_REQUIRED. */
export const DISK_VS_CLAIM_MISMATCH_CHANNEL =
  'BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH';

/** Result of {@link verifyDiskAgainstClaim}. */
export interface DiskVerifyResult {
  /** True iff `linesAdded > 0` or `untrackedFiles.length > 0`. */
  hasDiskEvidence: boolean;
  /** Sum of `added` from `git diff --numstat HEAD -- <scope.filesWrite>`. */
  linesAdded: number;
  /** Untracked files found via `git ls-files --others --exclude-standard
   *  -- <scope.directories>` (path-normalized, forward-slash). */
  untrackedFiles: string[];
}

/** Provider for `git diff --numstat HEAD -- <paths>`. Injectable for tests. */
export interface GitDiffNumstatProvider {
  /** Returns total added-lines across the given paths. Empty → 0. */
  numstatSum(paths: readonly string[]): number;
}

/** Provider for `git ls-files --others --exclude-standard -- <paths>`. */
export interface GitLsOthersProvider {
  /** Returns normalized paths of untracked files. Empty → []. */
  lsOthers(paths: readonly string[]): string[];
}

/** Options for {@link verifyDiskAgainstClaim}. */
export interface VerifyDiskOptions {
  /** Override the default git numstat provider — tests inject deterministic. */
  numstatProvider?: GitDiffNumstatProvider;
  /** Override the default git ls-others provider. */
  lsOthersProvider?: GitLsOthersProvider;
}

/**
 * Check whether the worker actually produced code on disk for a given task
 * scope, irrespective of `.result` presence or content.
 *
 * Uses two git commands scoped to the task's write paths:
 *   1. `git diff --numstat HEAD -- <scope.filesWrite>` → tracked-file deltas
 *   2. `git ls-files --others --exclude-standard -- <scope.directories>` →
 *      newly created files (untracked) inside the task's directories
 *
 * Returns `{hasDiskEvidence:false, linesAdded:0, untrackedFiles:[]}` on
 * fail-open errors (sandbox without git, permission denied, etc.) so
 * synthetic NO_GO behavior is preserved instead of silently flipped.
 */
export function verifyDiskAgainstClaim(
  projectDir: string,
  scope: TaskScope,
  opts: VerifyDiskOptions = {},
): DiskVerifyResult {
  const numstat = opts.numstatProvider ?? createDefaultGitDiffNumstatProvider(projectDir);
  const lsOthers = opts.lsOthersProvider ?? createDefaultGitLsOthersProvider(projectDir);

  const filesWrite = (scope.filesWrite ?? []).filter(p => typeof p === 'string' && p.length > 0);
  const directories = (scope.directories ?? []).filter(p => typeof p === 'string' && p.length > 0);

  let linesAdded = 0;
  try {
    linesAdded = numstat.numstatSum(filesWrite);
  } catch (e) {
    debugLog('disk-verify:numstat', e);
  }

  let untrackedFiles: string[] = [];
  try {
    untrackedFiles = lsOthers.lsOthers(directories);
  } catch (e) {
    debugLog('disk-verify:lsOthers', e);
  }

  const hasDiskEvidence = linesAdded > 0 || untrackedFiles.length > 0;
  return { hasDiskEvidence, linesAdded, untrackedFiles };
}

// ─── Default providers (production) ───────────────────────────────────

/**
 * Default git numstat provider — sums the `added` column from
 * `git diff --numstat HEAD -- <paths>`. Follows ADR-006 (array-form spawn,
 * no shell). Fail-open on any error → 0.
 */
export function createDefaultGitDiffNumstatProvider(
  projectDir: string,
): GitDiffNumstatProvider {
  return {
    numstatSum(paths) {
      if (paths.length === 0) return 0;
      try {
        const args = ['diff', '--numstat', 'HEAD', '--', ...paths];
        const res = spawnSync('git', args, {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: 10_000,
        });
        if (res.error || res.status !== 0 || typeof res.stdout !== 'string') {
          debugLog('disk-verify:numstatSum', `git diff failed status=${res.status}`);
          return 0;
        }
        let total = 0;
        for (const line of res.stdout.split('\n')) {
          if (!line.trim()) continue;
          const parts = line.split('\t');
          if (parts.length < 3) continue;
          const added = parseGitCount(parts[0]);
          total += added;
        }
        return total;
      } catch (e) {
        debugLog('disk-verify:numstatSum', e);
        return 0;
      }
    },
  };
}

/**
 * Default git ls-others provider — returns untracked files inside the given
 * directories (after gitignore filtering). Fail-open on any error → [].
 */
export function createDefaultGitLsOthersProvider(
  projectDir: string,
): GitLsOthersProvider {
  return {
    lsOthers(paths) {
      if (paths.length === 0) return [];
      try {
        const args = ['ls-files', '--others', '--exclude-standard', '--', ...paths];
        const res = spawnSync('git', args, {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: 10_000,
        });
        if (res.error || res.status !== 0 || typeof res.stdout !== 'string') {
          debugLog('disk-verify:lsOthers', `git ls-files failed status=${res.status}`);
          return [];
        }
        const out: string[] = [];
        for (const line of res.stdout.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          out.push(normalizePath(t));
        }
        return out;
      } catch (e) {
        debugLog('disk-verify:lsOthers', e);
        return [];
      }
    },
  };
}

// ─── Test seam helpers ────────────────────────────────────────────────

/** Deterministic numstat provider — tests pass a fixed sum. */
export function makeStaticNumstatProvider(totalAdded: number): GitDiffNumstatProvider {
  return { numstatSum: () => totalAdded };
}

/** Deterministic ls-others provider — tests pass a fixed file list. */
export function makeStaticLsOthersProvider(files: readonly string[]): GitLsOthersProvider {
  const snapshot = files.slice();
  return { lsOthers: () => snapshot.slice() };
}

// ─── Internal helpers ─────────────────────────────────────────────────

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').trim();
}

function parseGitCount(raw: string | undefined): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  // git uses "-" for binary files — treat as 0
  if (trimmed === '-' || trimmed === '') return 0;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? 0 : n;
}
