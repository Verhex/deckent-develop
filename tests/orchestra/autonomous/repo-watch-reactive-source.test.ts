// tests/orchestra/autonomous/repo-watch-reactive-source.test.ts
//
// Repo-watch reactive source (N2). Hermetic: the fs.watch seam is injected, so no
// real watcher/timer runs; debounceMs:0 flushes immediately.

import { describe, it, expect, vi } from 'vitest';
import { makeRepoWatchReactiveSource, type RepoWatcher } from '../../../src/orchestra/autonomous/reactive/repo-watch-reactive-source.js';
import type { ReactiveEvent } from '../../../src/orchestra/autonomous/reactive/reactive-types.js';

function makeHarness() {
  const ingested: ReactiveEvent[] = [];
  const ingester = { ingest: (ev: ReactiveEvent) => { ingested.push(ev); return 'written' as const; } };
  let onChange: ((relPath: string) => void) | undefined;
  const close = vi.fn();
  const watch: RepoWatcher = (cb) => { onChange = cb; return { close }; };
  return { ingested, ingester, watch, close, fire: (p: string) => onChange!(p) };
}

describe('makeRepoWatchReactiveSource', () => {
  it('ingests a repo ReactiveEvent on a working-tree change (immediate when debounceMs=0)', () => {
    const h = makeHarness();
    const src = makeRepoWatchReactiveSource({ projectRoot: '/x', ingester: h.ingester, debounceMs: 0, watch: h.watch });
    src.start();
    h.fire('src/foo.ts');

    expect(h.ingested).toHaveLength(1);
    expect(h.ingested[0].sourceType).toBe('repo');
    expect(h.ingested[0].risk).toBe('low');
    expect(h.ingested[0].groupKey).toBe('repo.change');
    expect(h.ingested[0].metadata).toEqual({ paths: ['src/foo.ts'] });
  });

  it('ignores deckent-internal paths (.git / .deckent / .brain / .tasks / dist) — no self-trigger', () => {
    const h = makeHarness();
    const src = makeRepoWatchReactiveSource({ projectRoot: '/x', ingester: h.ingester, debounceMs: 0, watch: h.watch });
    src.start();
    for (const p of ['.git/HEAD', '.deckent/config.json', '.brain/memory.db', '.tasks/task-1.json', 'dist/x.js', '.locks/y.lock', 'node_modules/z']) {
      h.fire(p);
    }
    expect(h.ingested).toHaveLength(0);
  });

  it('honours custom risk + groupKey', () => {
    const h = makeHarness();
    const src = makeRepoWatchReactiveSource({ projectRoot: '/x', ingester: h.ingester, debounceMs: 0, watch: h.watch, risk: 'medium', groupKey: 'repo.src' });
    src.start();
    h.fire('src/a.ts');
    expect(h.ingested[0].risk).toBe('medium');
    expect(h.ingested[0].groupKey).toBe('repo.src');
  });

  it('debounces a burst into a single event carrying all paths', () => {
    vi.useFakeTimers();
    try {
      const h = makeHarness();
      const src = makeRepoWatchReactiveSource({ projectRoot: '/x', ingester: h.ingester, debounceMs: 200, watch: h.watch });
      src.start();
      h.fire('src/a.ts');
      h.fire('src/b.ts');
      h.fire('src/a.ts'); // dup path collapses
      expect(h.ingested).toHaveLength(0); // not flushed yet
      vi.advanceTimersByTime(200);
      expect(h.ingested).toHaveLength(1);
      expect(h.ingested[0].metadata).toEqual({ paths: ['src/a.ts', 'src/b.ts'] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() closes the watcher and clears a pending timer', () => {
    vi.useFakeTimers();
    try {
      const h = makeHarness();
      const src = makeRepoWatchReactiveSource({ projectRoot: '/x', ingester: h.ingester, debounceMs: 200, watch: h.watch });
      src.start();
      h.fire('src/a.ts');
      src.stop();
      expect(h.close).toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(h.ingested).toHaveLength(0); // timer was cleared on stop
    } finally {
      vi.useRealTimers();
    }
  });
});
