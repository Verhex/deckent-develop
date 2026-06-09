// ═══ SIEM HTTP Transport ═══════════════════════════════════════════════════════
// Real network transport for the SIEM forwarder (ENT-5): POSTs a batch of
// normalized SIEM records as a JSON array to an HTTP(S) endpoint.
//
// Design: dumb pipe, fail-loud. Non-2xx responses and network errors THROW —
// the forwarder (siem-forwarder.ts) owns retry/drop semantics, so the transport
// performs NO internal retries (no double-retry). fetch is injectable for
// hermetic tests; the default is globalThis.fetch (Node 18+ built-in).
//
// ADR-010: no new runtime deps — built-in fetch only.
// ADR-008: imports only from core/.

import type { SiemRecord } from './siem-forwarder.js';

/**
 * Minimal structural fetch type the transport needs. `globalThis.fetch` is
 * assignable to it; tests inject a plain async function returning
 * `{ ok, status }`.
 */
export type SiemFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

/** Options for {@link createHttpSiemTransport}. */
export interface HttpSiemTransportOptions {
  /** Destination endpoint. Must be an absolute http:// or https:// URL. */
  url: string;
  /**
   * Extra request headers (e.g. authorization). Merged after the default
   * `content-type: application/json`, so a caller-supplied content-type wins.
   */
  headers?: Record<string, string>;
  /** Injectable fetch for hermetic tests. Default: `globalThis.fetch`. */
  fetchImpl?: SiemFetchLike;
}

/**
 * Create an HTTP transport for {@link createSiemForwarder}.
 *
 * Validates the URL eagerly (fail-fast at wiring time, not first flush) and
 * returns a `(batch) => Promise<void>` that POSTs the batch as a JSON array.
 * A non-2xx response throws with the status code; the forwarder's bounded
 * retry/drop mechanism handles the failure — never retry here.
 */
export function createHttpSiemTransport(
  opts: HttpSiemTransportOptions,
): (batch: SiemRecord[]) => Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(opts.url);
  } catch {
    throw new Error(`siem-transport-http: invalid URL '${opts.url}'`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `siem-transport-http: unsupported protocol '${parsed.protocol}' — only http/https URLs are accepted`,
    );
  }

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as SiemFetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'siem-transport-http: no fetch available — pass fetchImpl or run on Node 18+ where globalThis.fetch is built in',
    );
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(opts.headers ?? {}),
  };

  return async (batch: SiemRecord[]): Promise<void> => {
    if (batch.length === 0) return; // nothing to ship — skip the network round-trip
    const res = await fetchImpl(opts.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(
        `siem-transport-http: endpoint responded ${res.status} for ${batch.length} record(s)`,
      );
    }
  };
}
