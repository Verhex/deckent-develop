import { useCallback } from "react";
import { fetchJson, postJson } from "./api";

/**
 * Hook providing token-aware GET and POST fetch helpers.
 *
 * Sprint 269 Task 269-002 client unification: delegates to the canonical
 * lib/api.ts client (single token-read via getBootstrapApiToken, Bearer
 * header attach, 401 'deckent:unauthorized' signaling) instead of carrying
 * its own token/fetch path.
 */
export function useApi() {
  const get = useCallback(<T,>(url: string): Promise<T> => fetchJson<T>(url), []);

  const post = useCallback(
    <T,>(url: string, body?: unknown): Promise<T> => postJson<T>(url, body),
    [],
  );

  return { get, post };
}
