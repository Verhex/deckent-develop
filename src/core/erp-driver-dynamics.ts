// ═══ Dynamics 365 OData ERP Driver — third concrete ErpDriver (read-only) ═════
// Translates a `CompiledQuery` (erp-connector.ts) into a Dynamics 365 Web API
// read request: GET <baseUrl>/api/data/v<apiVersion>/<EntitySet>?$filter=...&
// $select=...&$top=<limit>. STRICTLY read-only: the driver re-checks the
// compiled query's read-only contract (defence in depth — the connector already
// guarantees it) and only ever issues GET requests.
//
// OData dialect note: the Dynamics 365 Web API speaks **OData v4 ONLY** — unlike
// the SAP driver there is no v2 compatibility surface. Consequences:
//   • `in` uses the NATIVE v4 `in` operator — `field in ('a','b')` — instead of
//     the eq-or-chain the SAP driver emits for v2 compatibility.
//   • `like` uses the v4 string function `contains(field,'value')` (v2's
//     `substringof` argument order is reversed and does not exist in v4).
//   • Responses carry the v4 `{ value: [...] }` envelope only; v2 `d.results`
//     is rejected, and the v2-era `$format=json` knob is never sent (v4 is
//     JSON-native).
//
// Injection safety: string literals are single-quoted with any embedded single
// quote escaped as `''` (the OData escape), so a parameter value can never break
// out of its literal; numbers/booleans are emitted raw, `null` as the keyword.
//
// Auth note: bearer ONLY. Dynamics 365 authenticates via Azure AD OAuth — the
// access token is acquired externally (client-credentials / on-behalf-of flow)
// and handed in; the Web API does not accept basic credentials, so this driver
// deliberately offers no basic option.
//
// Hermetic by construction: `fetchImpl` is injectable (default `globalThis.fetch`),
// so tests never touch the network. The bearer token travels ONLY inside the
// Authorization header — it is never interpolated into error messages, and any
// server-echoed occurrence is redacted before a message is thrown (SAP pattern).
//
// SSOT: NO compilation/validation logic is re-implemented here — the connector
// owns allow-listing, parameterization and limits; this driver only TRANSLATES
// the already-compiled request into the Web API wire format.
//
// ADR-008 (core/ imports core/ only) · ADR-010 (no new dependency — built-in fetch).

import type { CompiledQuery, ErpDriver, ErpFilterOp, ErpRow, ErpScalar } from './erp-connector.js';
import { DeckentError } from './errors.js';

// ─── Injectable fetch seam ────────────────────────────────────────────────────

/** Minimal structural fetch contract — what this driver needs from `fetch`. */
export type DynamicsFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

// ─── Options ──────────────────────────────────────────────────────────────────

/** Construction options for {@link createDynamicsErpDriver}. */
export interface DynamicsErpDriverOptions {
  /** Organization root, e.g. `https://org.crm.dynamics.com` (http/https only). */
  baseUrl: string;
  /** Bearer ONLY — the Azure AD OAuth access token comes from outside (no basic). */
  auth: { kind: 'bearer'; token: string };
  /** Injectable fetch for hermetic tests. Default: `globalThis.fetch`. */
  fetchImpl?: DynamicsFetchLike;
  /**
   * Logical entity name → Web API entity set (e.g. `account` → `accounts`).
   * Dynamics entity sets are plural logical names, so the connector's logical
   * names often need mapping. Unmapped entities fall back to the entity name.
   */
  entityModelMap?: Record<string, string>;
  /** Web API version segment (`/api/data/v<apiVersion>/`). Default '9.2'. */
  apiVersion?: string;
}

// ─── Operator translation (connector op → OData v4 comparison operator) ──────

/** Scalar comparison ops — `in` and `like` are expanded structurally instead. */
const OP_TO_ODATA: Record<Exclude<ErpFilterOp, 'in' | 'like'>, string> = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  gte: 'ge',
  lt: 'lt',
  lte: 'le',
};

/** Dotted numeric version like '9.2' — keeps the path segment injection-proof. */
const API_VERSION_SHAPE = /^[0-9]+(\.[0-9]+)*$/;

/** Render a scalar as an OData literal. Strings are single-quoted with embedded
 *  single quotes escaped as `''` (injection guard); numbers/booleans raw. */
function toODataLiteral(value: ErpScalar): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  return String(value);
}

/** Resolve 1-based placeholder indices against `params` (throws on out-of-range). */
function resolvePlaceholders(
  placeholders: readonly number[],
  params: readonly ErpScalar[],
  field: string,
): ErpScalar[] {
  return placeholders.map((index) => {
    if (!Number.isInteger(index) || index < 1 || index > params.length) {
      throw new DeckentError('DECKENT_E004', 
        `dynamics ERP driver: predicate '${field}' references placeholder ${index}, out of range for ${params.length} param(s)`,
      );
    }
    return params[index - 1] as ErpScalar;
  });
}

/** Translate compiled predicates (AND semantics) into one `$filter` expression.
 *  Returns `undefined` when there are no predicates (no `$filter` emitted). */
function buildFilter(compiled: CompiledQuery): string | undefined {
  if (compiled.predicates.length === 0) return undefined;
  const clauses = compiled.predicates.map((predicate) => {
    const resolved = resolvePlaceholders(predicate.placeholders, compiled.params, predicate.field);
    if (predicate.op === 'in') {
      // OData v4 has a NATIVE `in` operator — `field in ('a','b')`. This differs
      // from the SAP driver, which emits an eq-or-chain for v2 compatibility.
      return `${predicate.field} in (${resolved.map(toODataLiteral).join(',')})`;
    }
    if (predicate.op === 'like') {
      // OData v4 substring match: contains(field,'needle') — note the reversed
      // argument order vs v2's substringof. Value is always rendered as an
      // (escaped) string literal regardless of scalar type.
      const needle = resolved[0] as ErpScalar;
      const literal = typeof needle === 'string' ? needle : String(needle);
      return `contains(${predicate.field},'${literal.replace(/'/g, "''")}')`;
    }
    return `${predicate.field} ${OP_TO_ODATA[predicate.op]} ${toODataLiteral(resolved[0] as ErpScalar)}`;
  });
  return clauses.join(' and ');
}

// ─── Driver factory ───────────────────────────────────────────────────────────

/**
 * Create a read-only {@link ErpDriver} backed by the Dynamics 365 Web API
 * (OData v4 GET with `$filter`/`$select`/`$top`). Validates its wiring eagerly
 * (URL protocol, bearer token, apiVersion shape, fetch availability) so
 * misconfiguration fails at construction time, not on the first query.
 */
export function createDynamicsErpDriver(opts: DynamicsErpDriverOptions): ErpDriver {
  let parsed: URL;
  try {
    parsed = new URL(opts.baseUrl);
  } catch {
    throw new DeckentError('DECKENT_E004', `dynamics ERP driver: invalid baseUrl: ${JSON.stringify(opts.baseUrl)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DeckentError('DECKENT_E004', 
      `dynamics ERP driver: unsupported protocol '${parsed.protocol}' — only http/https URLs are accepted`,
    );
  }

  // Bearer ONLY — Dynamics OAuth tokens come from Azure AD, basic is not a thing
  // on the Web API. Anything else is a misconfiguration, refused eagerly.
  const auth = opts.auth;
  if (auth?.kind !== 'bearer') {
    throw new DeckentError('DECKENT_E004', "dynamics ERP driver: auth.kind must be 'bearer' (the Web API only accepts OAuth bearer tokens)");
  }
  if (typeof auth.token !== 'string' || auth.token.length === 0) {
    throw new DeckentError('DECKENT_E004', 'dynamics ERP driver: bearer auth requires a non-empty token');
  }

  const apiVersion = opts.apiVersion ?? '9.2';
  if (!API_VERSION_SHAPE.test(apiVersion)) {
    throw new DeckentError('DECKENT_E004', 
      `dynamics ERP driver: apiVersion must be a dotted numeric version like '9.2', got: ${JSON.stringify(apiVersion)}`,
    );
  }

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as DynamicsFetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new DeckentError('DECKENT_E004', 
      'dynamics ERP driver: no fetch available — pass fetchImpl or run on Node 18+ where globalThis.fetch is built in',
    );
  }

  const authorization = `Bearer ${auth.token}`;

  /** Secrets never leak through errors — redact any server-echoed token. */
  const secret = auth.token;
  const redact = (text: string): string => text.split(secret).join('[redacted]');

  const serviceRoot = `${opts.baseUrl.replace(/\/+$/, '')}/api/data/v${apiVersion}`;

  return async (compiled: CompiledQuery): Promise<readonly ErpRow[]> => {
    // Defence in depth: the connector only ever emits read-only queries, but a
    // driver must not trust its caller blindly — re-check the contract.
    if (compiled.readOnly !== true || compiled.operation !== 'read') {
      throw new DeckentError('DECKENT_E004', 'dynamics ERP driver: refusing non-read-only compiled query (read-only driver)');
    }

    const entitySet = opts.entityModelMap?.[compiled.entity] ?? compiled.entity;
    const filter = buildFilter(compiled);

    const query: string[] = [];
    if (filter !== undefined) query.push(`$filter=${encodeURIComponent(filter)}`);
    query.push(`$select=${encodeURIComponent(compiled.fields.join(','))}`);
    query.push(`$top=${compiled.limit}`);
    const url = `${serviceRoot}/${entitySet}?${query.join('&')}`;

    const res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        authorization,
        accept: 'application/json',
        // OData v4 protocol negotiation — Dynamics rejects/misbehaves without these.
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 500);
      } catch {
        // body unreadable — the status alone still explains the failure
      }
      throw new DeckentError('DECKENT_E004', 
        `dynamics ERP driver: Web API returned HTTP ${res.status}${detail ? ` — ${redact(detail)}` : ''}`,
      );
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new DeckentError('DECKENT_E004', 'dynamics ERP driver: Web API response body is not valid JSON');
    }
    if (typeof payload !== 'object' || payload === null) {
      throw new DeckentError('DECKENT_E004', 'dynamics ERP driver: Web API response is not an object');
    }

    // v4 envelope ONLY: { value: [...] }. The Web API never speaks v2, so a
    // missing `value` array is a hard protocol error (no d.results fallback).
    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.value)) {
      return body.value as ErpRow[];
    }
    throw new DeckentError('DECKENT_E004', 'dynamics ERP driver: Web API response has no OData v4 `value` rows');
  };
}
