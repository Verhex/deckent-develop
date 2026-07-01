/**
 * Worker Rollback — partial-promotion file revert (PROMOTE-W1b).
 *
 * Historical note: this file previously also hosted a pre-spawn git-stash
 * snapshot/verdict mechanism (`snapshotWorkerScope` / `rollbackWorkerScope` /
 * `dropWorkerSnapshot` / stash-ref sidecar, Sprint 177 Task 1 + Sprint 181
 * untracked-safe revision). It was removed (born-427, ADR-D-006 §3 Remove
 * tier, task 355-005): `setupTaskSnapshot` (worker.ts) and
 * `applyRollbackVerdict` (result-evaluator.ts) had zero live callers, and
 * wiring them up would have fought the sprint's existing fix-forward /
 * debt-tracking NO_GO handling (see task 355-005 decision notes). The one
 * genuinely live export, `revertFilesToHead`, survives below.
 */

import { execFileSync } from 'node:child_process';

/**
 * Revert specific out-of-scope files to HEAD — partial-promotion pipeline (PROMOTE-W1b).
 * For each path: first attempts `git checkout HEAD -- <path>` (tracked files),
 * then `git clean -fd -- <path>` for untracked.
 */
export function revertFilesToHead(repoRoot: string, filePaths: string[]): void {
  for (const p of filePaths) {
    try {
      execFileSync('git', ['checkout', 'HEAD', '--', p], {
        cwd: repoRoot,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch {
      // not in HEAD — may be untracked, try clean
      try {
        execFileSync('git', ['clean', '-fd', '--', p], {
          cwd: repoRoot,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch { /* nothing to clean */ }
    }
  }
}
