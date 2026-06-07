// src/orchestra/autonomous/reactive/reactive-ingester.ts
// Maps a ReactiveEvent to a BacklogEntry (via reactive-map), deduplicates
// against live pending/running reactive entries, and atomically appends to
// the durable backlog. Dedup is title + detector based (no extra BacklogEntry
// fields needed — see plan Task 2 open decision #1).
import { atomicWriteFileSync } from '../../../agents/worker-lifecycle.js';
import { loadBacklog } from '../backlog.js';
import { mapEventToEntry } from './reactive-map.js';
import type { ReactiveEvent, ReactiveMapFile } from './reactive-types.js';

export type IngestOutcome = 'written' | 'deduped' | 'unmatched';

export interface ReactiveIngesterDeps {
  backlogPath: string;
  map: ReactiveMapFile;
  idGen: () => string;
}

export function makeReactiveIngester(deps: ReactiveIngesterDeps): { ingest(ev: ReactiveEvent): IngestOutcome } {
  return {
    ingest(ev: ReactiveEvent): IngestOutcome {
      const entry = mapEventToEntry(ev, deps.map, deps.idGen);
      if (!entry) return 'unmatched';

      const bl = loadBacklog(deps.backlogPath);

      // Dedup: a live duplicate exists when there is already a pending/running
      // reactive entry for the same detector signal AND the same generated title.
      // This is title-based per plan Task 2 open decision #1 (no extra field on BacklogEntry).
      const liveDup = bl.entries.some(
        (e) =>
          e.trigger.type === 'reactive' &&
          (e.status === 'pending' || e.status === 'running') &&
          e.trigger.detector === (ev.groupKey ?? 'nervous') &&
          e.title === entry.title,
      );
      if (liveDup) return 'deduped';

      bl.entries.push(entry);
      atomicWriteFileSync(deps.backlogPath, JSON.stringify(bl, null, 2));
      return 'written';
    },
  };
}
