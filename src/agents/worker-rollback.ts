/**
 * Worker Rollback — Sprint 177 Task 1 + Sprint 181 untracked-safe revision.
 *
 * **Sprint 181 fix:** previously a bare `git stash --include-untracked` would
 * sweep ALL untracked files (including the previous sprint's uncommitted
 * deliverables). Sprint 179 -> 180 incident lost 7 src/ files this way. The
 * new implementation is **scope-bounded**: only the worker's `scopedDirs` and
 * `scopedFiles` are included in the stash. Out-of-scope uncommitted changes
 * remain in the working tree untouched.
 *
 * Archive folder: drops are written to
 * `.deckent/worker-rollback-history/{sprintId}/{taskId}/stash-{iso}.patch`
 * before `git stash drop`, with a 7-sprint TTL prune.
 */

import { execFileSync, execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { detectDeckentRepo } from '../orchestra/self-modifying-detector.js';

const STASH_REF_PATTERN = /^stash@\{(\d+|NOSTASH)\}$/;
const NOSTASH_SENTINEL = 'stash@{NOSTASH}';
const ARCHIVE_ROOT_REL = '.deckent/worker-rollback-history';
const ARCHIVE_TTL_SPRINTS = 7;

export class WorkerRollbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerRollbackError';
  }
}

export interface SnapshotOptions {
  scopedDirs?: string[];
  scopedFiles?: string[];
  sprintId?: string;
  onWarn?: (event: { code: string; files: string[] }) => void;
}

export interface DropOptions {
  sprintId?: string;
  taskId?: string;
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

function collectOutOfScopeUntracked(
  repoRoot: string,
  scopedDirs: string[],
  scopedFiles: string[],
): string[] {
  try {
    const out = execSync('git status --porcelain --untracked-files=all', {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    const offenders: string[] = [];
    for (const line of out.split('\n')) {
      if (!line.startsWith('??')) continue;
      const file = line.slice(3).trim();
      if (!file) continue;
      const inDirs = scopedDirs.some((d) => {
        const norm = d.endsWith('/') ? d : d + '/';
        return file === d || file.startsWith(norm);
      });
      const inFiles = scopedFiles.includes(file);
      if (!inDirs && !inFiles) {
        offenders.push(file);
      }
    }
    return offenders;
  } catch {
    return [];
  }
}

export function snapshotWorkerScope(
  repoRoot: string,
  taskId: string,
  options?: SnapshotOptions,
): string {
  // ADR-039 self-project guard: NEVER stash the deckent-dev dogfood working
  // tree. With no scope, `git stash push --include-untracked` (below) is
  // UNSCOPED — it sweeps every sibling task's untracked deliverable into a stash
  // that is later dropped, destroying real work (the Sprint-326 self-wipe that
  // deleted 326-001's output and reverted DIRECTIVES.md). Returning the no-stash
  // sentinel makes the paired rollback path a no-op too. Mirrors rollback.ts:178.
  if (detectDeckentRepo(repoRoot)) {
    return NOSTASH_SENTINEL;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const message = `deckent-worker-${taskId}-${ts}`;
  const scopedDirs = options?.scopedDirs ?? [];
  const scopedFiles = options?.scopedFiles ?? [];
  const scopeBounded = scopedDirs.length > 0 || scopedFiles.length > 0;

  if (scopeBounded && options?.onWarn) {
    const offenders = collectOutOfScopeUntracked(repoRoot, scopedDirs, scopedFiles);
    if (offenders.length > 0) {
      options.onWarn({ code: 'UNCOMMITTED_OUT_OF_SCOPE', files: offenders });
    }
  }

  const args = [
    'stash',
    'push',
    '--include-untracked',
    '--keep-index',
    '--message',
    message,
  ];

  // Sentinel only in legacy mode — in scope-bounded mode, the scope paths
  // are the stash content. If scope is empty git stash push will be a no-op
  // but `resolveStashRefByMessage` will fall back to `stash@{0}` (possibly
  // unrelated). Scope-bounded callers should ensure their scope dir exists.
  let sentinelPath: string | null = null;
  let sentinelCreated = false;
  if (!scopeBounded) {
    sentinelPath = join(repoRoot, `.deckent-worker-sentinel-${taskId}`);
    if (!existsSync(sentinelPath)) {
      writeFileSync(sentinelPath, '');
      sentinelCreated = true;
    }
  } else {
    // Ensure scope dirs exist so stash has something to capture
    for (const dir of scopedDirs) {
      const abs = join(repoRoot, dir);
      if (!existsSync(abs)) {
        mkdirSync(abs, { recursive: true });
      }
    }
    args.push('--');
    for (const dir of scopedDirs) args.push(dir);
    for (const file of scopedFiles) args.push(file);
  }

  try {
    execFileSync('git', args, {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch {
    // Empty scope can cause stash to fail with "No local changes to save".
    // In that case fall through — caller still gets a (possibly stale) ref.
  }

  if (sentinelCreated && sentinelPath && existsSync(sentinelPath)) {
    try {
      unlinkSync(sentinelPath);
    } catch {
      /* best-effort */
    }
  }

  return resolveStashRefByMessage(repoRoot, message);
}

export function rollbackWorkerScope(
  repoRoot: string,
  stashRef: string,
  scopedPaths: string[],
): void {
  if (!STASH_REF_PATTERN.test(stashRef)) {
    throw new WorkerRollbackError(`rollbackWorkerScope: invalid stashRef "${stashRef}"`);
  }

  // ADR-039 self-project guard: never mutate the deckent-dev dogfood working
  // tree — the empty-scope branch below would `git checkout HEAD -- . &&
  // git clean -fd`, reverting and deleting every other task's uncommitted work
  // (the Sprint-326 self-wipe). Mirrors rollback.ts:178.
  if (detectDeckentRepo(repoRoot)) {
    return;
  }

  if (scopedPaths.length > 0) {
    // Checkout tracked paths individually so untracked files in the list
    // (which don't exist in HEAD) don't abort the entire checkout batch.
    for (const p of scopedPaths) {
      try {
        execFileSync('git', ['checkout', 'HEAD', '--', p], {
          cwd: repoRoot,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch {
        /* not in HEAD — handled by clean step below */
      }
    }
    for (const p of scopedPaths) {
      try {
        execFileSync('git', ['clean', '-fd', '--', p], {
          cwd: repoRoot,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch {
        /* nothing to clean */
      }
    }
  } else {
    // SAFETY (Sprint-326 self-wipe fix): an empty scope must NEVER
    // `git checkout HEAD -- . && git clean -fd` — that reverts every tracked
    // file and deletes every untracked file in the WHOLE repo, destroying
    // sibling tasks' uncommitted deliverables. With no explicit scope there is
    // nothing to roll back via tree-ops; the stash drop below is the only safe
    // action. (A scoped rollback requires the caller to pass scope.filesWrite.)
  }

  if (stashRef !== NOSTASH_SENTINEL) {
    execFileSync('git', ['stash', 'drop', stashRef], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  }
}

/**
 * Revert specific out-of-scope files to HEAD — partial-promotion pipeline (PROMOTE-W1b).
 * For each path: first attempts `git checkout HEAD -- <path>` (tracked files),
 * then `git clean -fd -- <path>` for untracked. Mirrors the per-file loop in
 * rollbackWorkerScope without the stash-drop step.
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

export function dropWorkerSnapshot(
  repoRoot: string,
  stashRef: string,
  options?: DropOptions,
): void {
  if (!STASH_REF_PATTERN.test(stashRef)) {
    throw new WorkerRollbackError(`dropWorkerSnapshot: invalid stashRef "${stashRef}"`);
  }

  if (stashRef === NOSTASH_SENTINEL) {
    return;
  }

  if (options?.sprintId && options?.taskId) {
    archiveStash(repoRoot, stashRef, options.sprintId, options.taskId);
    pruneArchiveHistory(repoRoot);
  }

  execFileSync('git', ['stash', 'drop', stashRef], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function archiveStash(
  repoRoot: string,
  stashRef: string,
  sprintId: string,
  taskId: string,
): void {
  const archiveDir = join(repoRoot, ARCHIVE_ROOT_REL, sprintId, taskId);
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const patchPath = join(archiveDir, `stash-${ts}.patch`);
  try {
    const patch = execFileSync('git', ['stash', 'show', '-p', stashRef], {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
    writeFileSync(patchPath, patch, 'utf-8');
  } catch {
    // best-effort archive
  }
}

function pruneArchiveHistory(repoRoot: string): void {
  const archiveRoot = join(repoRoot, ARCHIVE_ROOT_REL);
  if (!existsSync(archiveRoot)) return;
  try {
    const sprints = readdirSync(archiveRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    while (sprints.length > ARCHIVE_TTL_SPRINTS) {
      const oldest = sprints.shift();
      if (oldest) {
        rmSync(join(archiveRoot, oldest), { recursive: true, force: true });
      }
    }
  } catch {
    /* best-effort prune */
  }
}

export function writeStashRef(
  projectRoot: string,
  taskId: string,
  stashRef: string,
): void {
  writeFileSync(stashRefPath(projectRoot, taskId), stashRef, 'utf-8');
}

export function readStashRef(
  projectRoot: string,
  taskId: string,
): string | null {
  const path = stashRefPath(projectRoot, taskId);
  if (!existsSync(path)) return null;
  const ref = readFileSync(path, 'utf-8').trim();
  return ref.length === 0 ? null : ref;
}

export function clearStashRef(projectRoot: string, taskId: string): void {
  const path = stashRefPath(projectRoot, taskId);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      /* non-fatal */
    }
  }
}

function resolveStashRefByMessage(repoRoot: string, message: string): string {
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
  // No stash entry — scope-bounded with empty diff. Return sentinel that
  // drop/rollback recognize as no-op.
  return 'stash@{NOSTASH}';
}
