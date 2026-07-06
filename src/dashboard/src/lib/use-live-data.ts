import { useCallback, useEffect, useRef, useState } from "react";
import { getBootstrapApiToken } from "./api";
import { dedupedFetch } from "./request-cache";

// ─── Live Activity (DASH-RT-1) ──────────────────────────────────────────────

/** A single entry in the live activity ring buffer fed by typed SSE events. */
export interface LiveActivityEntry {
  id: string;
  ts: string;
  /** 'deckent_event' from the sprint JSONL stream; 'worker_heartbeat'/'worker_done' from .tasks/ */
  type: 'deckent_event' | 'worker_heartbeat' | 'worker_done';
  payload?: unknown;
}

/** Maximum entries kept in the live activity ring buffer. */
export const MAX_LIVE_ACTIVITY = 20;

/**
 * Live-data hook with stale-while-revalidate semantics.
 *
 * Why this hook instead of `useApi` + `setInterval`:
 *   - Native feel: previous data stays on screen during refresh — no skeleton flicker.
 *   - Graceful retry on disconnect: status flips to "reconnecting" and the poll
 *     loop backs off via `retryDelayMs` instead of hammering the server.
 *   - Abort-on-unmount: in-flight requests are cancelled when the component leaves,
 *     so React never tries to setState on an unmounted hook.
 *
 * For push streams (server-sent events), use `hooks/useSSE.ts` — EventSource is the
 * right primitive there. This hook is the polling counterpart for REST endpoints
 * that do not yet have an SSE channel.
 */

export type LiveDataStatus = "connecting" | "connected" | "reconnecting";

export interface UseLiveDataOptions {
  pollIntervalMs?: number;
  retryDelayMs?: number;
  enabled?: boolean;
}

export interface UseLiveDataResult<T> {
  data: T | null;
  isStale: boolean;
  isLoading: boolean;
  error: Error | null;
  status: LiveDataStatus;
  /** Trigger an immediate re-fetch (cancels the pending poll timer) — e.g.
   *  right after a mutation so the UI reflects it without waiting a poll. */
  refresh: () => void;
}

export function useLiveData<T>(
  url: string,
  options: UseLiveDataOptions = {},
): UseLiveDataResult<T> {
  const { pollIntervalMs = 5000, retryDelayMs = 3000, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<LiveDataStatus>("connecting");

  const releaseRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Latest tick function — written by the effect below so the stable
  // `refresh` callback can trigger an immediate re-fetch.
  const tickRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;

    async function tick(): Promise<void> {
      setIsLoading(true);

      const headers: Record<string, string> = {};
      const token = getBootstrapApiToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // De-duplicated fetch (DASH-POLLING-DEDUP): if another caller already
      // has an in-flight request to this same URL, share its promise instead
      // of firing a duplicate GET. `release` is reference-counted — it only
      // aborts the underlying request once every subscriber has released it.
      const handle = dedupedFetch(url, { headers });
      releaseRef.current = handle.release;

      try {
        const res = await handle.promise;
        if (!mountedRef.current) return;
        if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
        const body = (await res.json()) as T;
        if (!mountedRef.current) return;
        setData(body);
        setError(null);
        setIsStale(false);
        setStatus("connected");
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) void tick();
        }, pollIntervalMs);
      } catch (err) {
        // Aborted on unmount → no state updates, no retry.
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        // Stale-while-revalidate: KEEP the previous `data`. Mark it stale so the
        // UI can flag it; do not reset to null. Status flips to "reconnecting"
        // (not "disconnected") so views show a friendly indicator rather than
        // a freeze.
        setIsStale(true);
        setStatus("reconnecting");
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) void tick();
        }, retryDelayMs);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    }

    tickRef.current = () => {
      if (!mountedRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void tick();
    };

    void tick();

    return () => {
      mountedRef.current = false;
      tickRef.current = () => {};
      releaseRef.current?.();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [url, pollIntervalMs, retryDelayMs, enabled]);

  const refresh = useCallback(() => {
    tickRef.current();
  }, []);

  return { data, isStale, isLoading, error, status, refresh };
}
