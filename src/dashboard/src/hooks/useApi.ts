import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import { useLiveData } from "../lib/use-live-data";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseApiOptions {
  /**
   * When set, the endpoint is polled via `useLiveData` (stale-while-revalidate)
   * instead of fetched once — `refetch` then triggers an immediate re-fetch.
   * Default (unset) keeps the original one-shot behavior unchanged.
   *
   * Sprint 269 Task 269-002: this option is the live-data wire for pages that
   * consume the `useApi` result shape (NervousPage) — delegating here instead
   * of importing `useLiveData` directly preserves the existing module contract
   * (and the tests that mock it) while production gains live polling.
   */
  pollIntervalMs?: number;
}

export function useApi<T>(url: string, options: UseApiOptions = {}): UseApiResult<T> {
  const live = typeof options.pollIntervalMs === "number";
  const liveResult = useLiveData<T>(url, {
    enabled: live,
    pollIntervalMs: options.pollIntervalMs,
  });

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchJson<T>(url)
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => {
    if (live) return;
    refetch();
  }, [refetch, live]);

  if (live) {
    return {
      data: liveResult.data,
      // loading only while the FIRST response is pending — later re-fetches keep
      // previous data on screen (stale-while-revalidate, no skeleton flicker)
      loading: liveResult.data === null && liveResult.error === null,
      error: liveResult.error ? liveResult.error.message : null,
      refetch: liveResult.refresh,
    };
  }
  return { data, loading, error, refetch };
}
