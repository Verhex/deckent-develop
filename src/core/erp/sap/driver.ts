// ═══ SAP OData ERP Driver — second concrete ErpDriver (read-only, OData GET) ══
// Translates a `CompiledQuery` (erp-connector.ts) into an SAP OData read request:
// GET <baseUrl>/<EntitySet>?$filter=...&$select=...&$top=<limit>&$format=json.
// STRICTLY read-only: the driver re-checks the compiled query's read-only
// contract (defence in depth — the connector already guarantees it) and only
// ever issues GET requests.
//
// OData dialect note: predicates target the OData **v2** grammar (`substringof`
// for `like`, `$format=json`) because SAP Gateway services are predominantly
// OData v2; the comparison operators (`eq/ne/gt/ge/lt/le`) and the or-chain for
// `in` are valid in BOTH v2 and v4, and the response parser accepts both the v2
// (`d.results`) and v4 (`value`) envelopes — so v4 services work for everything
// except `like`.
//
// Injection safety: string literals are single-quoted with any embedded single
// quote escaped as `''` (the OData escape), so a parameter value can never break
// out of its literal; numbers/booleans are emitted raw, `null` as the keyword.
//
// Hermetic by construction: `fetchImpl` is injectable (default `globalThis.fetch`),
// so tests never touch the network. Secrets (basic password / bearer token)
// travel ONLY inside the Authorization header — they are never interpolated into
// error messages, and any server-echoed occurrence is redacted before a message
// is thrown (Odoo driver pattern).
//
// SSOT: NO compilation/validation logic is re-implemented here — the connector
// owns allow-listing, parameterization and limits; this driver only TRANSLATES
// the already-compiled request into the OData wire format.
//
// ADR-008 (core/ imports core/ only) · ADR-010 (no new dependency — built-in fetch).

import type { CompiledQuery, ErpDriver, ErpFilterOp, ErpRow, ErpScalar } from '../connector.js';
import { DeckentError } from '../../errors.js';

// ─── Injectable fetch seam ────────────────────────────────────────────────────

/** Minimal structural fetch contract — what this driver needs from `fetch`. */
export type SapFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

// ─── Options ──────────────────────────────────────────────────────────────────

/** Authentication for the SAP OData service. Secrets NEVER appear in errors. */
export type SapErpAuth =
  | { kind: 'basic'; username: string; password: string }
  | { kind: 'bearer'; token: string };

/** Construction options for {@link createSapErpDriver}. */
export interface SapErpDriverOptions {
  /** OData service root, e.g. `https://sap.example.com/sap/opu/odata/sap/API_X` (http/https only). */
  baseUrl: string;
  /** Basic (user/password) or bearer (token) authentication. */
  auth: SapErpAuth;
  /** Injectable fetch for hermetic tests. Default: `globalThis.fetch`. */
  fetchImpl?: SapFetchLike;
  /**
   * Logical entity name → OData entity set (e.g. `partner` → `A_BusinessPartner`).
   * Needed because SAP entity sets often don't match the connector's logical
   * names. Unmapped entities fall back to the entity name.
   */
  entityModelMap?: Record<string, string>;
}

// ─── Operator translation (connector op → OData v2/v4 comparison operator) ───

/** Scalar comparison ops — `in` and `like` are expanded structurally instead. */
const OP_TO_ODATA: Record<Exclude<ErpFilterOp, 'in' | 'like'>, string> = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  gte: 'ge',
  lt: 'lt',
  lte: 'le',
};

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
        `sap ERP driver: predicate '${field}' references placeholder ${index}, out of range for ${params.length} param(s)`,
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
      // OData has no `in` in v2 — expand to an or-chain (also valid in v4).
      const alternatives = resolved.map((value) => `${predicate.field} eq ${toODataLiteral(value)}`);
      return `(${alternatives.join(' or ')})`;
    }
    if (predicate.op === 'like') {
      // OData v2 substring match: substringof('needle', field). Value is always
      // rendered as an (escaped) string literal regardless of scalar type.
      const needle = resolved[0] as ErpScalar;
      const literal = typeof needle === 'string' ? needle : String(needle);
      return `substringof('${literal.replace(/'/g, "''")}', ${predicate.field})`;
    }
    return `${predicate.field} ${OP_TO_ODATA[predicate.op]} ${toODataLiteral(resolved[0] as ErpScalar)}`;
  });
  return clauses.join(' and ');
}

// ─── Driver factory ───────────────────────────────────────────────────────────

/**
 * Create a read-only {@link ErpDriver} backed by an SAP OData service (GET with
 * `$filter`/`$select`/`$top`). Validates its wiring eagerly (URL protocol,
 * credentials shape, fetch availability) so misconfiguration fails at
 * construction time, not on the first query.
 */
export function createSapErpDriver(opts: SapErpDriverOptions): ErpDriver {
  let parsed: URL;
  try {
    parsed = new URL(opts.baseUrl);
  } catch {
    throw new DeckentError('DECKENT_E004', `sap ERP driver: invalid baseUrl: ${JSON.stringify(opts.baseUrl)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DeckentError('DECKENT_E004', 
      `sap ERP driver: unsupported protocol '${parsed.protocol}' — only http/https URLs are accepted`,
    );
  }

  const auth = opts.auth;
  if (auth?.kind === 'basic') {
    if (typeof auth.username !== 'string' || auth.username.length === 0) {
      throw new DeckentError('DECKENT_E004', 'sap ERP driver: basic auth requires a non-empty username');
    }
    if (typeof auth.password !== 'string' || auth.password.length === 0) {
      throw new DeckentError('DECKENT_E004', 'sap ERP driver: basic auth requires a non-empty password');
    }
  } else if (auth?.kind === 'bearer') {
    if (typeof auth.token !== 'string' || auth.token.length === 0) {
      throw new DeckentError('DECKENT_E004', 'sap ERP driver: bearer auth requires a non-empty token');
    }
  } else {
    throw new DeckentError('DECKENT_E004', "sap ERP driver: auth.kind must be 'basic' or 'bearer'");
  }

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as SapFetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new DeckentError('DECKENT_E004', 
      'sap ERP driver: no fetch available — pass fetchImpl or run on Node 18+ where globalThis.fetch is built in',
    );
  }

  const authorization =
    auth.kind === 'basic'
      ? `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
      : `Bearer ${auth.token}`;

  /** Secrets never leak through errors — redact any server-echoed password/token. */
  const secret = auth.kind === 'basic' ? auth.password : auth.token;
  const redact = (text: string): string => text.split(secret).join('[redacted]');

  const serviceRoot = opts.baseUrl.replace(/\/+$/, '');

  return async (compiled: CompiledQuery): Promise<readonly ErpRow[]> => {
    // Defence in depth: the connector only ever emits read-only queries, but a
    // driver must not trust its caller blindly — re-check the contract.
    if (compiled.readOnly !== true || compiled.operation !== 'read') {
      throw new DeckentError('DECKENT_E004', 'sap ERP driver: refusing non-read-only compiled query (read-only driver)');
    }

    const entitySet = opts.entityModelMap?.[compiled.entity] ?? compiled.entity;
    const filter = buildFilter(compiled);

    const query: string[] = [];
    if (filter !== undefined) query.push(`$filter=${encodeURIComponent(filter)}`);
    query.push(`$select=${encodeURIComponent(compiled.fields.join(','))}`);
    query.push(`$top=${compiled.limit}`);
    query.push('$format=json');
    const url = `${serviceRoot}/${entitySet}?${query.join('&')}`;

    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { authorization, accept: 'application/json' },
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 500);
      } catch {
        // body unreadable — the status alone still explains the failure
      }
      throw new DeckentError('DECKENT_E004', 
        `sap ERP driver: OData endpoint returned HTTP ${res.status}${detail ? ` — ${redact(detail)}` : ''}`,
      );
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new DeckentError('DECKENT_E004', 'sap ERP driver: OData response body is not valid JSON');
    }
    if (typeof payload !== 'object' || payload === null) {
      throw new DeckentError('DECKENT_E004', 'sap ERP driver: OData response is not an object');
    }

    // Accept BOTH envelope generations: OData v2 `{ d: { results: [...] } }`
    // and OData v4 `{ value: [...] }`.
    const body = payload as Record<string, unknown>;
    const v2 = body.d;
    if (typeof v2 === 'object' && v2 !== null && Array.isArray((v2 as Record<string, unknown>).results)) {
      return (v2 as Record<string, unknown>).results as ErpRow[];
    }
    if (Array.isArray(body.value)) {
      return body.value as ErpRow[];
    }
    throw new DeckentError('DECKENT_E004', 'sap ERP driver: OData response has neither v2 `d.results` nor v4 `value` rows');
  };
}
