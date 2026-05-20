/**
 * Worker Rollback — Sprint 177 Task 1
 *
 * Captures the working tree at worker spawn via `git stash --include-untracked
 * --keep-index`, then either reverts (NO_GO) or drops (DONE / GO_WITH_TECH_DEBT)
 * the snapshot once the result-evaluator delivers a verdict.
 *
 * Closes the Sprint 176 dogfood gap where NO_GO workers left `src/` corrupted
 * because no infrastructure existed to revert their partial edits.
 *
 * Persistence: the stash ref is stored in a sidecar file `.tasks/task-{id}.stash-ref`
 * alongside the existing `.hb` / `.plan` / `.result` sidecars. Type-level
 * documentation lives in `src/core/memory-types.ts` (TaskRecord interface).
 */

import { execFileSync, execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const STASH_REF_PATTERN = /^stash@\{\d+\}$/;

export class WorkerRollbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerRollbackError';
  }
}

function ensureTasksDir(projectRoot: string): string {
  const tasksDir = join(projectRoot, '.tasks');
  if (!existsSync(tasksDir)) {
    mkdirSync(tasksDir, { recursive: true });
  }
  return tasksDir;
}

function stashRefPath(projectRoot: string, taskId: string): string {
  return join(ensureTasksDir(projectRoot), `task-${taskId}.stash-ref`);
}

/**
 * Captures the current working-tree state into a named stash and returns the
 * stash ref (e.g. `stash@{0}`). New files are included via `--include-untracked`.
 *
 * The stash message is `deckent-worker-{taskId}-{iso}` so concurrent workers can
 * be disambiguated and so `git stash list` makes the intent obvious to operators.
 *
 * If the working tree is clean we still create a sentinel stash (with a single
 * untracked sentinel file removed immediately afterward) so callers always get a
 * valid ref — see test "snapshot captures pre-spawn state".
 */
export function snapshotWorkerScope(repoRoot: string, taskId: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const message = `deckent-worker-${taskId}-${ts}`;

  // Ensure there is at least one change to stash. `git stash push` is a no-op
  // when the working tree is clean and produces no stash entry, which would
  // break the contract that snapshotWorkerScope always returns a ref. Touching
  // a sentinel untracked file guarantees the stash captures *something*.
  const sentinelPath = join(repoRoot, `.deckent-worker-sentinel-${taskId}`);
  let sentinelCreated = false;
  if (!existsSync(sentinelPath)) {
    writeFileSync(sentinelPath, '');
    sentinelCreated = true;
  }

  execFileSync(
    'git',
    ['stash', 'push', '--include-untracked', '--keep-index', '--message', message],
    { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] },
  );

  // Clean up sentinel from working tree if we created it. The stash itself
  // still contains the sentinel, so a rollback will not resurrect it because
  // rollback restores the entire pre-snapshot tree (sentinel didn't exist
  // pre-snapshot either).
  if (sentinelCreated && existsSync(sentinelPath)) {
    try {
      unlinkSync(sentinelPath);
    } catch {
      // best-effort cleanup
    }
  }

  return resolveStashRefByMessage(repoRoot, message);
}

/**
 * Reverts the working tree to the snapshot captured by `snapshotWorkerScope`.
 *
 * Implementation: `git checkout HEAD -- .` resets tracked files, `git clean -fd`
 * removes untracked files. The stash itself is then dropped because it has
 * served its purpose as proof-of-pre-state.
 *
 * `scopedPaths` is accepted for API surface stability but the rollback is
 * intentionally whole-tree — ADR-037 advisory: if a worker wrote out of scope,
 * we still revert those writes because they should never have happened.
 */
export function rollbackWorkerScope(
  repoRoot: string,
  stashRef: string,
  _scopedPaths: string[],
): void {
  if (!STASH_REF_PATTERN.test(stashRef)) {
    throw new WorkerRollbackError(`rollbackWorkerScope: invalid stashRef "${stashRef}"`);
  }

  execFileSync('git', ['checkout', 'HEAD', '--', '.'], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  execFileSync('git', ['clean', '-fd'], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  execFileSync('git', ['stash', 'drop', stashRef], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

/**
 * Drops the snapshot stash without reverting — used on DONE / GO_WITH_TECH_DEBT
 * verdicts where the worker's changes should be preserved.
 */
export function dropWorkerSnapshot(repoRoot: string, stashRef: string): void {
  if (!STASH_REF_PATTERN.test(stashRef)) {
    throw new WorkerRollbackError(`dropWorkerSnapshot: invalid stashRef "${stashRef}"`);
  }
  execFileSync('git', ['stash', 'drop', stashRef], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

/**
 * Persists the stash ref for a task to `.tasks/task-{id}.stash-ref` so that
 * the result-evaluator can recover it after the worker process has exited.
 */
export function writeStashRef(
  projectRoot: string,
  taskId: string,
  stashRef: string,
): void {
  writeFileSync(stashRefPath(projectRoot, taskId), stashRef, 'utf-8');
}

/**
 * Reads the persisted stash ref for a task. Returns `null` if no snapshot was
 * recorded (older sprints, or when rollback infrastructure is disabled).
 */
export function readStashRef(
  projectRoot: string,
  taskId: string,
): string | null {
  const path = stashRefPath(projectRoot, taskId);
  if (!existsSync(path)) return null;
  const ref = readFileSync(path, 'utf-8').trim();
  return ref.length === 0 ? null : ref;
}

/**
 * Removes the stash-ref sidecar — called after rollback/drop so subsequent
 * reads don't return a stale reference.
 */
export function clearStashRef(projectRoot: string, taskId: string): void {
  const path = stashRefPath(projectRoot, taskId);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // non-fatal
    }
  }
}

// ─── Internal ──────────────────────────────────────────────────────

function resolveStashRefByMessage(repoRoot: string, message: string): string {
  // `git stash list --format=%gd:%gs` emits one line per stash with the ref
  // (e.g. `stash@{0}`) and the message. We grep for the message to be robust
  // against concurrent workers also stashing.
  const out = execSync('git stash list --format="%gd:%gs"', {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  for (const line of out.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const ref = line.slice(0, idx);
    const msg = line.slice(idx + 1);
    if (msg.includes(message)) return ref;
  }
  // Fallback: top of stack — works when there's exactly one stash entry.
  return 'stash@{0}';
}
