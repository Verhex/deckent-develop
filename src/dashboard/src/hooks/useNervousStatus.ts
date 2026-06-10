import { useLiveData } from "../lib/use-live-data";

interface NervousStatusMin {
  pendingCount: number;
}

/** Poll cadence for the sidebar badge — less aggressive than the NervousPage full view. */
const SIDEBAR_POLL_MS = 30_000;

/**
 * Lightweight hook that polls /api/nervous/status and exposes the pending-approval
 * count for the sidebar Bell badge. Returns 0 safely when the endpoint is unavailable.
 */
export function useNervousStatus(): { pendingCount: number } {
  const { data } = useLiveData<NervousStatusMin>("/api/nervous/status", {
    pollIntervalMs: SIDEBAR_POLL_MS,
  });
  return { pendingCount: data?.pendingCount ?? 0 };
}
