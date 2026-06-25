import { useCallback } from "react";
import { fetchJson, postJson } from "./api";

/**
 * Hook providing token-aware imperative GET and POST fetch helpers.
 *
 * Named `useApiClient` to disambiguate from the data-fetching hook
 * `hooks/useApi` (which returns `{ data, loading, error, refetch }`). This one
 * returns imperative `{ get, post }` callers for action endpoints — a different
 * purpose, so the two are kept distinct rather than collapsed (Task 323-011 / R4).
 *
 * Sprint 269 Task 269-002 client unification: delegates to the canonical
 * lib/api.ts client (single token-read via getBootstrapApiToken, Bearer
 * header attach, 401 'deckent:unauthorized' signaling) instead of carrying
 * its own token/fetch path.
 */
export function useApiClient() {
  const get = useCallback(<T,>(url: string): Promise<T> => fetchJson<T>(url), []);

  const post = useCallback(
    <T,>(url: string, body?: unknown): Promise<T> => postJson<T>(url, body),
    [],
  );

  return { get, post };
}
