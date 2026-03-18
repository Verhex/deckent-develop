// ─── Result File Watcher ───────────────────────────────────────────
// Replaces polling in waitForResults with fs.watch for faster detection.
// Falls back to polling if fs.watch is unavailable or errors.
import { watch, existsSync, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { TASKS_DIR } from '../core/constants.js';

export interface ResultWatcher {
  /** Promise that resolves when a new .result file is detected */
  waitForChange(): Promise<void>;
  close(): void;
}

/**
 * Watch the .tasks/ directory for new .result files.
 * Returns a watcher that can be awaited for changes.
 * Falls back to a timed interval if fs.watch fails.
 */
export function createResultWatcher(projectRoot: string, fallbackMs = 5_000): ResultWatcher {
  const tasksDir = join(projectRoot, TASKS_DIR);
  let fsWatcher: FSWatcher | null = null;
  let closed = false;
  let pendingResolve: (() => void) | null = null;

  // Try to start fs.watch
  try {
    if (existsSync(tasksDir)) {
      fsWatcher = watch(tasksDir, (_eventType, filename) => {
        if (filename && filename.endsWith('.result') && pendingResolve) {
          const resolve = pendingResolve;
          pendingResolve = null;
          resolve();
        }
      });
      fsWatcher.on('error', () => {
        // Watch failed — fall back to timer in waitForChange
        fsWatcher?.close();
        fsWatcher = null;
      });
    }
  } catch {
    fsWatcher = null;
  }

  return {
    waitForChange(): Promise<void> {
      if (closed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        if (fsWatcher) {
          // fs.watch mode — resolve when a .result file event fires
          pendingResolve = resolve;
          // Safety fallback in case watch misses events
          const timer = setTimeout(() => {
            if (pendingResolve === resolve) {
              pendingResolve = null;
              resolve();
            }
          }, fallbackMs);
          // Store cleanup reference
          const origResolve = resolve;
          pendingResolve = () => {
            clearTimeout(timer);
            origResolve();
          };
        } else {
          // No watcher — pure timer fallback
          setTimeout(resolve, fallbackMs);
        }
      });
    },
    close(): void {
      closed = true;
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve();
      }
      fsWatcher?.close();
      fsWatcher = null;
    },
  };
}
