// ═══ IFS Cloud OData ERP Driver — fourth concrete ErpDriver (read-only) ═══════
// Translates a `CompiledQuery` (erp-connector.ts) into an IFS Cloud projection
// REST (OData v4) read request:
//   GET <baseUrl>/main/ifsapplications/projection/<apiVersion>/<Projection>/<Entity>
//       ?$filter=...&$select=...&$top=<limit>
// STRICTLY read-only: the driver re-checks the compiled query's read-only
// contract (defence in depth — the connector already guarantees it) and only
// ever issues GET requests.
//
// OData dialect: IFS Cloud projection REST speaks OData v4, so the filter syntax
// matches the Dynamics driver — native `in` (`field in ('a','b')`), the v4 string
// function `contains(field,'value')` for `like`, and the `{ value: [...] }`
// envelope. The ONLY difference is the IFS projection-REST path layout (a named
// projection groups its entities) plus IFS-style apiVersion segments (`v1`,`v2`).
//
// Injection safety: string literals are single-quoted with any embedded single
// quote escaped as `''` (the OData escape); numbers/booleans raw; `null` keyword.
// The projection name + apiVersion are validated as safe path segments at
// construction time so they can never break the URL path.
//
// Auth: bearer ONLY — IFS Cloud authenticates via its IAM (OAuth2 / OpenID
// Connect); the access token is acquired externally and handed in. The token
// travels ONLY in the Authorization header and is redacted from any error.
//
// Hermetic by construction: `fetchImpl` is injectable (default `globalThis.fetch`),
// so tests never touch the network.
//
// SSOT: NO compilation/validation logic is re-implemented here — the connector
// owns allow-listing, parameterization and limits; this driver only TRANSLATES
// the already-compiled request into the IFS projection-REST wire format.
//
// ADR-008 (core/ imports core/ only) · ADR-010 (no new dependency — built-in fetch).

import type { CompiledQuery, ErpDriver, ErpFilterOp, ErpRow, ErpScalar } from '../connector.js';
import { DeckentError } from '../../errors.js';

// ─── Injectable fetch seam ────────────────────────────────────────────────────

/** Minimal structural fetch contract — what this driver needs from `fetch`. */
export type IfsFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

// ─── Options ──────────────────────────────────────────────────────────────────

/** Construction options for {@link createIfsErpDriver}. */
export interface IfsErpDriverOptions {
  /** IFS Cloud root, e.g. `https://ifs.example.com` (http/https only). */
  baseUrl: string;
  /** IFS projection name that groups the queried entities, e.g. `CustomerOrdersHandling`. */
  projection: string;
  /** Bearer ONLY — the IFS IAM (OAuth2/OIDC) access token comes from outside. */
  auth: { kind: 'bearer'; token: string };
  /** Injectable fetch for hermetic tests. Default: `globalThis.fetch`. */
  fetchImpl?: IfsFetchLike;
  /**
   * Logical entity name → IFS entity set name within the projection. Unmapped
   * entities fall back to the entity name (the connector already guarantees it
   * is a safe identifier).
   */
  entityModelMap?: Record<string, string>;
  /** Projection API version path segment (`/projection/<apiVersion>/`). Default 'v1'. */
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

/** IFS apiVersion path segment — `v1`, `v2`, … (keeps the path injection-proof). */
const API_VERSION_SHAPE = /^v[0-9]+$/;
/** Projection / entity-set names are IFS identifiers — safe path segments. */
const SAFE_PATH_SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Render a scalar as an OData literal. Strings single-quoted with embedded
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
        `ifs ERP driver: predicate '${field}' references placeholder ${index}, out of range for ${params.length} param(s)`,
      );
    }
    return params[index - 1] as ErpScalar;
  });
}

/** Translate compiled predicates (AND semantics) into one OData v4 `$filter`.
 *  Returns `undefined` when there are no predicates. */
function buildFilter(compiled: CompiledQuery): string | undefined {
  if (compiled.predicates.length === 0) return undefined;
  const clauses = compiled.predicates.map((predicate) => {
    const resolved = resolvePlaceholders(predicate.placeholders, compiled.params, predicate.field);
    if (predicate.op === 'in') {
      return `${predicate.field} in (${resolved.map(toODataLiteral).join(',')})`;
    }
    if (predicate.op === 'like') {
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
 * Create a read-only {@link ErpDriver} backed by the IFS Cloud projection REST
 * API (OData v4 GET with `$filter`/`$select`/`$top`). Validates its wiring
 * eagerly (URL protocol, projection + apiVersion path safety, bearer token,
 * fetch availability) so misconfiguration fails at construction time.
 */
export function createIfsErpDriver(opts: IfsErpDriverOptions): ErpDriver {
  let parsed: URL;
  try {
    parsed = new URL(opts.baseUrl);
  } catch {
    throw new DeckentError('DECKENT_E004', `ifs ERP driver: invalid baseUrl: ${JSON.stringify(opts.baseUrl)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DeckentError('DECKENT_E004',
      `ifs ERP driver: unsupported protocol '${parsed.protocol}' — only http/https URLs are accepted`,
    );
  }

  if (typeof opts.projection !== 'string' || !SAFE_PATH_SEGMENT.test(opts.projection)) {
    throw new DeckentError('DECKENT_E004',
      `ifs ERP driver: projection must be a plain identifier, got: ${JSON.stringify(opts.projection)}`,
    );
  }

  const auth = opts.auth;
  if (auth?.kind !== 'bearer') {
    throw new DeckentError('DECKENT_E004', "ifs ERP driver: auth.kind must be 'bearer' (IFS IAM issues OAuth bearer tokens)");
  }
  if (typeof auth.token !== 'string' || auth.token.length === 0) {
    throw new DeckentError('DECKENT_E004', 'ifs ERP driver: bearer auth requires a non-empty token');
  }

  const apiVersion = opts.apiVersion ?? 'v1';
  if (!API_VERSION_SHAPE.test(apiVersion)) {
    throw new DeckentError('DECKENT_E004',
      `ifs ERP driver: apiVersion must be an IFS version segment like 'v1', got: ${JSON.stringify(apiVersion)}`,
    );
  }

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as IfsFetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new DeckentError('DECKENT_E004',
      'ifs ERP driver: no fetch available — pass fetchImpl or run on Node 18+ where globalThis.fetch is built in',
    );
  }

  const authorization = `Bearer ${auth.token}`;
  const secret = auth.token;
  /** Secrets never leak through errors — redact any server-echoed token. */
  const redact = (text: string): string => text.split(secret).join('[redacted]');

  const serviceRoot =
    `${opts.baseUrl.replace(/\/+$/, '')}/main/ifsapplications/projection/${apiVersion}/${opts.projection}`;

  return async (compiled: CompiledQuery): Promise<readonly ErpRow[]> => {
    // Defence in depth: the connector only ever emits read-only queries, but a
    // driver must not trust its caller blindly — re-check the contract.
    if (compiled.readOnly !== true || compiled.operation !== 'read') {
      throw new DeckentError('DECKENT_E004', 'ifs ERP driver: refusing non-read-only compiled query (read-only driver)');
    }

    const entitySet = opts.entityModelMap?.[compiled.entity] ?? compiled.entity;
    if (!SAFE_PATH_SEGMENT.test(entitySet)) {
      throw new DeckentError('DECKENT_E004', `ifs ERP driver: entity set '${entitySet}' is not a safe path segment`);
    }
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
        `ifs ERP driver: projection REST returned HTTP ${res.status}${detail ? ` — ${redact(detail)}` : ''}`,
      );
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new DeckentError('DECKENT_E004', 'ifs ERP driver: projection REST response body is not valid JSON');
    }
    if (typeof payload !== 'object' || payload === null) {
      throw new DeckentError('DECKENT_E004', 'ifs ERP driver: projection REST response is not an object');
    }

    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.value)) {
      return body.value as ErpRow[];
    }
    throw new DeckentError('DECKENT_E004', 'ifs ERP driver: projection REST response has no OData v4 `value` rows');
  };
}
