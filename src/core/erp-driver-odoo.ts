// ═══ Odoo ERP Driver — first concrete ErpDriver (read-only, JSON-RPC) ═════════
// Translates a `CompiledQuery` (erp-connector.ts) into an Odoo External API
// `search_read` call: JSON-RPC 2.0 envelope → POST /jsonrpc → service `object`,
// method `execute_kw`, model method `search_read`. STRICTLY read-only: the
// driver re-checks the compiled query's read-only contract (defence in depth —
// the connector already guarantees it) and only ever emits `search_read`.
//
// Hermetic by construction: `fetchImpl` is injectable (default `globalThis.fetch`),
// so tests never touch the network. The `apiKey` travels ONLY inside the JSON-RPC
// `args` — it is never interpolated into error messages, and any server-echoed
// occurrence is redacted before a message is thrown.
//
// SSOT: NO compilation/validation logic is re-implemented here — the connector
// owns allow-listing, parameterization and limits; this driver only TRANSLATES
// the already-compiled request into the Odoo wire format.
//
// ADR-008 (core/ imports core/ only) · ADR-010 (no new dependency — built-in fetch).

import type { CompiledQuery, ErpDriver, ErpFilterOp, ErpRow, ErpScalar } from './erp-connector.js';
import { DeckentError } from './errors.js';

// ─── Injectable fetch seam ────────────────────────────────────────────────────

/** Minimal structural fetch contract — what this driver needs from `fetch`. */
export type OdooFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// ─── Options ──────────────────────────────────────────────────────────────────

/** Construction options for {@link createOdooErpDriver}. */
export interface OdooErpDriverOptions {
  /** Odoo JSON-RPC endpoint, e.g. `https://erp.example.com/jsonrpc` (http/https only). */
  url: string;
  /** Odoo database name (1st `execute_kw` positional arg). */
  db: string;
  /** Authenticated Odoo user id (2nd `execute_kw` positional arg). */
  uid: number;
  /** Odoo API key / password (3rd `execute_kw` positional arg). NEVER appears in errors. */
  apiKey: string;
  /** Injectable fetch for hermetic tests. Default: `globalThis.fetch`. */
  fetchImpl?: OdooFetchLike;
  /**
   * Logical entity name → Odoo model name (e.g. `partner` → `res.partner`).
   * Needed because Odoo model names contain dots, which the connector's
   * identifier rule forbids. Unmapped entities fall back to the entity name.
   */
  entityModelMap?: Record<string, string>;
}

// ─── Operator translation (connector op → Odoo domain operator) ──────────────

const OP_TO_ODOO: Record<ErpFilterOp, string> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'in',
  like: 'ilike',
};

/** One Odoo domain term: `[field, operator, value]`. */
type OdooDomainTerm = [string, string, ErpScalar | ErpScalar[]];

/** Resolve 1-based placeholder indices against `params` (throws on out-of-range). */
function resolvePlaceholders(
  placeholders: readonly number[],
  params: readonly ErpScalar[],
  field: string,
): ErpScalar[] {
  return placeholders.map((index) => {
    if (!Number.isInteger(index) || index < 1 || index > params.length) {
      throw new DeckentError('DECKENT_E004', 
        `odoo ERP driver: predicate '${field}' references placeholder ${index}, out of range for ${params.length} param(s)`,
      );
    }
    return params[index - 1] as ErpScalar;
  });
}

/** Translate compiled predicates (AND semantics) into a flat Odoo domain list. */
function buildDomain(compiled: CompiledQuery): OdooDomainTerm[] {
  return compiled.predicates.map((predicate) => {
    const resolved = resolvePlaceholders(predicate.placeholders, compiled.params, predicate.field);
    const value = predicate.op === 'in' ? resolved : (resolved[0] as ErpScalar);
    return [predicate.field, OP_TO_ODOO[predicate.op], value];
  });
}

// ─── JSON-RPC response handling ───────────────────────────────────────────────

/** Extract a human-readable message from an Odoo JSON-RPC `error` object
 *  (top-level `message` plus the more specific `error.data.message`). */
function extractOdooErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'unknown JSON-RPC error';
  const top = (error as Record<string, unknown>).message;
  const data = (error as Record<string, unknown>).data;
  const detail =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>).message
      : undefined;
  const parts = [top, detail].filter((part): part is string => typeof part === 'string');
  return parts.length > 0 ? parts.join(': ') : 'unknown JSON-RPC error';
}

// ─── Driver factory ───────────────────────────────────────────────────────────

/**
 * Create a read-only {@link ErpDriver} backed by the Odoo External API
 * (`search_read` over JSON-RPC 2.0). Validates its wiring eagerly (URL
 * protocol, credentials shape, fetch availability) so misconfiguration fails
 * at construction time, not on the first query.
 */
export function createOdooErpDriver(opts: OdooErpDriverOptions): ErpDriver {
  let parsed: URL;
  try {
    parsed = new URL(opts.url);
  } catch {
    throw new DeckentError('DECKENT_E004', `odoo ERP driver: invalid endpoint URL: ${JSON.stringify(opts.url)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DeckentError('DECKENT_E004', 
      `odoo ERP driver: unsupported protocol '${parsed.protocol}' — only http/https URLs are accepted`,
    );
  }
  if (typeof opts.db !== 'string' || opts.db.length === 0) {
    throw new DeckentError('DECKENT_E004', 'odoo ERP driver: db must be a non-empty string');
  }
  if (!Number.isInteger(opts.uid)) {
    throw new DeckentError('DECKENT_E004', 'odoo ERP driver: uid must be an integer Odoo user id');
  }
  if (typeof opts.apiKey !== 'string' || opts.apiKey.length === 0) {
    throw new DeckentError('DECKENT_E004', 'odoo ERP driver: apiKey must be a non-empty string');
  }

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as OdooFetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new DeckentError('DECKENT_E004', 
      'odoo ERP driver: no fetch available — pass fetchImpl or run on Node 18+ where globalThis.fetch is built in',
    );
  }

  /** Secrets never leak through errors — redact any server-echoed apiKey. */
  const redact = (text: string): string => text.split(opts.apiKey).join('[redacted]');

  let nextRequestId = 0;

  return async (compiled: CompiledQuery): Promise<readonly ErpRow[]> => {
    // Defence in depth: the connector only ever emits read-only queries, but a
    // driver must not trust its caller blindly — re-check the contract.
    if (compiled.readOnly !== true || compiled.operation !== 'read') {
      throw new DeckentError('DECKENT_E004', 'odoo ERP driver: refusing non-read-only compiled query (read-only driver)');
    }

    const model = opts.entityModelMap?.[compiled.entity] ?? compiled.entity;
    const domain = buildDomain(compiled);

    const envelope = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          opts.db,
          opts.uid,
          opts.apiKey,
          model,
          'search_read',
          [domain],
          { fields: compiled.fields, limit: compiled.limit },
        ],
      },
      id: ++nextRequestId,
    };

    const res = await fetchImpl(opts.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    if (!res.ok) {
      throw new DeckentError('DECKENT_E004', `odoo ERP driver: JSON-RPC endpoint returned HTTP ${res.status}`);
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new DeckentError('DECKENT_E004', 'odoo ERP driver: JSON-RPC response body is not valid JSON');
    }
    if (typeof payload !== 'object' || payload === null) {
      throw new DeckentError('DECKENT_E004', 'odoo ERP driver: JSON-RPC response is not an object');
    }

    const body = payload as Record<string, unknown>;
    if (body.error !== undefined) {
      throw new DeckentError('DECKENT_E004', `odoo ERP driver: Odoo error — ${redact(extractOdooErrorMessage(body.error))}`);
    }
    if (!Array.isArray(body.result)) {
      throw new DeckentError('DECKENT_E004', 'odoo ERP driver: JSON-RPC response has no array `result`');
    }
    return body.result as ErpRow[];
  };
}
