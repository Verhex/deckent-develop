// src/orchestra/autonomous/reactive/repo-watch-reactive-source.ts
//
// Repo-watch reactive source (N2): watches the project working tree and turns a
// change into a `repo` ReactiveEvent fed to the reactive ingester → backlog
// (declarative reactive-map decides whether/what to enqueue). In-process; the
// autonomous loop owns its lifetime.
//
// Self-trigger guard: deckent itself writes to .deckent/.brain/.tasks/.locks/dist
// — watching those would loop forever, so they are ignored. The fs.watch seam is
// injectable so tests never touch the real filesystem watcher.

import { watch as fsWatch } from 'node:fs';
import type { RiskLevel } from '../../../core/nervous-types.js';
import type { ReactiveEvent } from './reactive-types.js';
import type { IngestOutcome } from './reactive-ingester.js';

/** A watcher seam: register `onChange(relPath)` and get a `close()` back. */
export type RepoWatcher = (onChange: (relPath: string) => void) => { close(): void };

export interface RepoWatchReactiveSourceDeps {
  projectRoot: string;
  ingester: { ingest(ev: ReactiveEvent): IngestOutcome };
  /** Risk tagged onto the emitted event (reactive-map can filter by it). Default 'low'. */
  risk?: RiskLevel;
  /** Group key for reactive-map routing. Default 'repo.change'. */
  groupKey?: string;
  /** Coalesce a burst of changes into one event. Default 500ms; <=0 = immediate. */
  debounceMs?: number;
  /** Injectable watcher (tests). Default: recursive fs.watch on projectRoot. */
  watch?: RepoWatcher;
}

/** Paths deckent writes itself — watching them would self-trigger forever. */
const IGNORED_PREFIXES = ['.git/', 'node_modules/', 'dist/', '.deckent/', '.brain/', '.locks/', '.tasks/'];

function isIgnored(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/');
  return IGNORED_PREFIXES.some((prefix) => p === prefix.slice(0, -1) || p.startsWith(prefix));
}

/** Default recursive fs.watch watcher (fail-safe: a watch error yields a no-op). */
function defaultWatch(projectRoot: string): RepoWatcher {
  return (onChange) => {
    try {
      const watcher = fsWatch(projectRoot, { recursive: true }, (_event, filename) => {
        if (filename) onChange(String(filename));
      });
      return { close: () => watcher.close() };
    } catch {
      return { close: () => {} };
    }
  };
}

/**
 * Build a repo-watch reactive source. `start()` begins watching; each
 * (non-ignored) working-tree change debounces into one `repo` ReactiveEvent
 * carrying the changed `paths`. `stop()` closes the watcher + clears the timer.
 */
export function makeRepoWatchReactiveSource(
  deps: RepoWatchReactiveSourceDeps,
): { start(): void; stop(): void } {
  const debounceMs = deps.debounceMs ?? 500;
  const watch = deps.watch ?? defaultWatch(deps.projectRoot);

  let pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let handle: { close(): void } | null = null;

  const flush = (): void => {
    if (pending.size === 0) return;
    const paths = [...pending];
    pending = new Set();
    deps.ingester.ingest({
      sourceType: 'repo',
      risk: deps.risk ?? 'low',
      groupKey: deps.groupKey ?? 'repo.change',
      metadata: { paths },
    });
  };

  const onChange = (relPath: string): void => {
    if (isIgnored(relPath)) return;
    pending.add(relPath);
    if (debounceMs <= 0) {
      flush();
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
    if (typeof timer.unref === 'function') timer.unref();
  };

  return {
    start(): void {
      handle = watch(onChange);
    },
    stop(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      handle?.close();
      handle = null;
    },
  };
}
