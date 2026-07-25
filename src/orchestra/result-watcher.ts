// ─── Result File Watcher ───────────────────────────────────────────
// Replaces polling in waitForResults with fs.watch for faster detection.
// Falls back to polling if fs.watch is unavailable or errors.
import { watch, existsSync, type FSWatcher } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { TASKS_DIR } from '../core/constants.js';
import { createExecutionAuthorityError } from '../core/errors.js';

export interface ResultWatcher {
  /** Promise that resolves when a new .result file is detected */
  waitForChange(): Promise<void>;
  close(): void;
}

export interface ResultWatcherOptions {
  /**
   * Exact project-relative control files that should wake the same pending
   * result-loop tick. They are wake hints only; their owning module remains the
   * durable authority and consumes them after the loop wakes.
   */
  wakeFiles?: readonly string[];
}

/**
 * Watch the .tasks/ directory for new .result files.
 * Returns a watcher that can be awaited for changes.
 * Falls back to a timed interval if fs.watch fails.
 */
export function createResultWatcher(
  projectRoot: string,
  fallbackMs = 5_000,
  options: ResultWatcherOptions = {},
): ResultWatcher {
  const canonicalRoot = resolve(projectRoot);
  const tasksDir = join(canonicalRoot, TASKS_DIR);
  const wakeFilesByDirectory = new Map<string, Set<string>>();
  for (const wakeFile of options.wakeFiles ?? []) {
    if (!wakeFile || isAbsolute(wakeFile)) {
      throw createExecutionAuthorityError('Result watcher wake files must be non-empty project-relative paths');
    }
    const absoluteWakeFile = resolve(canonicalRoot, wakeFile);
    const projectRelative = relative(canonicalRoot, absoluteWakeFile);
    if (
      projectRelative === ''
      || projectRelative === '..'
      || projectRelative.startsWith(`..${sep}`)
      || isAbsolute(projectRelative)
    ) {
      throw createExecutionAuthorityError(`Result watcher wake file escapes project root: ${wakeFile}`);
    }
    const directory = dirname(absoluteWakeFile);
    const names = wakeFilesByDirectory.get(directory) ?? new Set<string>();
    names.add(basename(absoluteWakeFile));
    wakeFilesByDirectory.set(directory, names);
  }

  const fsWatchers = new Set<FSWatcher>();
  let closed = false;
  let pendingResolve: (() => void) | null = null;

  const installWatcher = (
    directory: string,
    matches: (filename: string) => boolean,
  ): void => {
    if (!existsSync(directory)) return;
    try {
      const watcher = watch(directory, (_eventType, filename) => {
        if (filename && matches(String(filename)) && pendingResolve) {
          pendingResolve();
        }
      });
      fsWatchers.add(watcher);
      watcher.on('error', () => {
        // One watch target failing must not disable the others. The timer in
        // waitForChange remains the common degraded-mode fallback.
        try { watcher.close(); } finally { fsWatchers.delete(watcher); }
      });
    } catch {
      // Directory-specific watch unavailable — common fallback timer remains.
    }
  };

  installWatcher(tasksDir, filename => filename.endsWith('.result'));
  for (const [directory, names] of wakeFilesByDirectory) {
    installWatcher(directory, filename => names.has(filename));
  }

  return {
    waitForChange(): Promise<void> {
      if (closed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          pendingResolve = null;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(settle, fallbackMs);
        pendingResolve = settle;
      });
    },
    close(): void {
      closed = true;
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve();
      }
      for (const watcher of fsWatchers) watcher.close();
      fsWatchers.clear();
    },
  };
}
