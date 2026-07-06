/**
 * Shared in-flight request cache (SWR-style dedup) for dashboard polling.
 *
 * Problem: each page/component polls its own endpoints independently
 * (2-5s intervals via `useLiveData`). When several callers happen to poll the
 * SAME URL around the same time, that used to fire one `fetch` per caller —
 * a duplicate-GET storm. This module de-duplicates concurrent callers for the
 * same URL onto a single underlying network request.
 *
 * This is intentionally NOT a response cache: there is no TTL and no
 * last-value memoization here — `useLiveData` already owns stale-while-revalidate
 * (it keeps the previous `data` in React state across polls). This module only
 * dedupes *in-flight* requests; once a request settles, its cache entry is
 * evicted so the next poll tick issues a fresh fetch.
 */

export type FetchLike = typeof fetch;

export interface DedupedRequestInit {
  headers?: Record<string, string>;
}

export interface DedupedRequestHandle {
  /** Resolves/rejects exactly like a direct `fetch(url, init)` call. */
  promise: Promise<Response>;
  /**
   * Release this subscription (e.g. on component unmount). Reference-counted:
   * the underlying request is only aborted once EVERY subscriber sharing it
   * has released — one caller unmounting must not cancel the response for a
   * sibling caller still awaiting the same URL.
   */
  release: () => void;
}

interface InFlightEntry {
  promise: Promise<Response>;
  controller: AbortController;
  refCount: number;
}

const inFlightRequests = new Map<string, InFlightEntry>();

export function dedupedFetch(
  url: string,
  init: DedupedRequestInit = {},
  fetchImpl: FetchLike = fetch,
): DedupedRequestHandle {
  let entry = inFlightRequests.get(url);

  if (!entry) {
    const controller = new AbortController();
    const created: InFlightEntry = {
      controller,
      refCount: 0,
      promise: fetchImpl(url, { headers: init.headers, signal: controller.signal }).finally(() => {
        // Only evict if this entry is still the current one for `url` — a
        // fresh request may already have replaced it (settled-then-refetched).
        if (inFlightRequests.get(url) === created) {
          inFlightRequests.delete(url);
        }
      }),
    };
    entry = created;
    inFlightRequests.set(url, entry);
  }

  entry.refCount += 1;
  const sharedEntry = entry;

  return {
    promise: sharedEntry.promise,
    release: () => {
      sharedEntry.refCount -= 1;
      if (sharedEntry.refCount <= 0) {
        sharedEntry.controller.abort();
        if (inFlightRequests.get(url) === sharedEntry) {
          inFlightRequests.delete(url);
        }
      }
    },
  };
}
