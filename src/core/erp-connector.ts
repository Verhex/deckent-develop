// ═══ ERP/DB Connector — ERP-1 (read-only enterprise data access) ═════════════
// The foundation for "Deckent runs inside an enterprise" (MASTER-PLAN #ERP).
// Scoped strictly READ-ONLY: it compiles a STRUCTURED query spec — never raw SQL —
// into a parameterized, read-only request that an INJECTED driver fulfils. This
// keeps the compiler pure + hermetic and lets concrete connectors (SAP / Odoo /
// Dynamics / Postgres …) plug in behind the `ErpDriver` seam later.
//
// Least-privilege by construction:
//   • no mutation verbs — entity/field identifiers are validated and DDL/DML
//     keywords (INSERT/UPDATE/DELETE/DROP/…) are rejected, so a mutation can never
//     be smuggled through an identifier; the compiled request is flagged read-only.
//   • mandatory `limit` cap — every compiled query carries a bounded `limit`.
//   • field allow-list per entity — only fields declared via `registerEntity`
//     are selectable / filterable; everything else is rejected.
//   • values are PARAMETERIZED (collected into `params`, referenced by positional
//     placeholder) — never inlined — so the read-only request is injection-safe.
//
// The requesting `ActorContext` is tagged onto every compiled query + result for
// downstream audit (event emission itself belongs to the capability-audit bridge
// + the wiring iteration — this module only carries the actor, it does not emit).
//
// ADR-008 (core/ must not import orchestra/): imports types from work-model only.
// ADR-010 (single runtime dependency): Node built-ins / hand-rolled only — no deps.

import type { ActorContext } from './work-model.js';

// ─── Query spec types (the structured, NOT-raw-SQL input) ────────────────────

/** A bindable scalar value. Values are always parameterized, never inlined. */
export type ErpScalar = string | number | boolean | null;

/** Read-safe comparison operators. No mutation/DDL verbs exist in this union. */
export type ErpFilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';

/** A single filter predicate. `in` takes an array; every other op takes a scalar. */
export interface ErpFilter {
  field: string;
  op: ErpFilterOp;
  value: ErpScalar | readonly ErpScalar[];
}

/**
 * A STRUCTURED read query — the only input shape `query` accepts. Deliberately
 * NOT raw SQL: `{ entity, filters, fields, limit }` is compiled to a parameterized
 * read-only request, so the surface cannot express a mutation.
 */
export interface ErpQuerySpec {
  /** Declared entity name (must be registered via {@link ErpConnector.registerEntity}). */
  entity: string;
  /** Subset of the entity allow-list to return. Omitted ⇒ all declared fields. */
  fields?: readonly string[];
  /** Read-only predicates. Every `field` must be in the entity allow-list. */
  filters?: readonly ErpFilter[];
  /** Requested row cap. Always clamped to the entity/connector ceiling. */
  limit?: number;
}

// ─── Entity registration (the allow-list) ────────────────────────────────────

/** A declared queryable entity. Only listed fields are selectable / filterable. */
export interface EntitySchema {
  /** Allow-listed field names — the per-entity field allow-list. */
  fields: readonly string[];
  /** Physical source the driver maps to (table / model / object). Defaults to the entity name. */
  source?: string;
  /** Per-entity row ceiling, itself bounded by the connector-level `maxLimit`. */
  maxLimit?: number;
}

// ─── Compiled (driver-facing) types ──────────────────────────────────────────

/** A compiled predicate. `placeholders` are 1-based indices into `CompiledQuery.params`. */
export interface CompiledPredicate {
  field: string;
  op: ErpFilterOp;
  /** 1-based positional placeholder indices (a single index for scalars; many for `in`). */
  placeholders: number[];
}

/**
 * The compiled, parameterized, read-only request handed to the injected driver.
 * Structured (NOT a SQL string) so non-SQL connectors (SAP/Odoo/Dynamics) can
 * translate it natively. `operation: 'read'` + `readOnly: true` make the
 * read-only contract explicit and machine-checkable.
 */
export interface CompiledQuery {
  entity: string;
  source: string;
  fields: string[];
  predicates: CompiledPredicate[];
  /** Positional parameters referenced by `predicates[].placeholders` (1-based). */
  params: ErpScalar[];
  /** Mandatory, always-bounded row cap. */
  limit: number;
  /** This connector only ever emits read operations. */
  operation: 'read';
  /** Explicit read-only flag — a compiled query can never carry a mutation. */
  readOnly: true;
  /** WHO requested it — carried for downstream audit (not emitted here). */
  actor?: ActorContext;
}

/** A raw row as returned by the driver before result wrapping. */
export type ErpRow = Record<string, unknown>;

/**
 * Executes a compiled read request. INJECTED so the connector stays pure +
 * hermetic — a concrete connector (SAP/Odoo/Dynamics/Postgres) supplies the impl.
 */
export type ErpDriver = (compiled: CompiledQuery) => Promise<readonly ErpRow[]>;

/** The result of {@link ErpConnector.query}. Echoes the actor + compiled query for audit. */
export interface ErpResultSet {
  entity: string;
  rows: ErpRow[];
  rowCount: number;
  /** The actor the query ran as (audit). */
  actor?: ActorContext;
  /** The exact compiled request the driver received (audit / inspection). */
  compiled: CompiledQuery;
}

/** Connector construction options. */
export interface ErpConnectorOptions {
  /** Injected executor for compiled read requests. */
  driver: ErpDriver;
  /** Hard ceiling on rows for ANY query (least-privilege). Default 1000. */
  maxLimit?: number;
  /** Limit applied when a spec omits one (still bounded by `maxLimit`). Default = `maxLimit`. */
  defaultLimit?: number;
  /** Actor tagged onto queries that don't pass one explicitly (audit). */
  actor?: ActorContext;
}

// ─── Typed error ─────────────────────────────────────────────────────────────

/** Why a query / registration was refused — programmatic `code` for callers. */
export type ErpErrorCode =
  | 'INVALID_IDENTIFIER'
  | 'ENTITY_NOT_REGISTERED'
  | 'FIELD_NOT_ALLOWED'
  | 'INVALID_FILTER'
  | 'INVALID_LIMIT';

/** Thrown on any validation failure. Read-only enforcement is fail-closed. */
export class ErpQueryError extends Error {
  readonly code: ErpErrorCode;
  constructor(code: ErpErrorCode, message: string) {
    super(message);
    this.name = 'ErpQueryError';
    this.code = code;
  }
}

// ─── Identifier safety (the "no mutation verbs" gate) ────────────────────────

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** SQL DML/DDL/privilege verbs an identifier must never be — defence in depth on
 *  top of the allow-list, so a mutation verb can't be smuggled as entity/field. */
const MUTATION_KEYWORDS: ReadonlySet<string> = new Set([
  'insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'create',
  'grant', 'revoke', 'merge', 'exec', 'execute', 'call', 'replace', 'upsert',
]);

const DEFAULT_MAX_LIMIT = 1000;

/** Reject anything that isn't a plain identifier or that names a mutation verb. */
function assertSafeIdentifier(name: unknown, role: string): string {
  if (typeof name !== 'string' || !SAFE_IDENTIFIER.test(name)) {
    throw new ErpQueryError(
      'INVALID_IDENTIFIER',
      `${role} must be a plain identifier ([A-Za-z_][A-Za-z0-9_]*), got: ${JSON.stringify(name)}`,
    );
  }
  if (MUTATION_KEYWORDS.has(name.toLowerCase())) {
    throw new ErpQueryError(
      'INVALID_IDENTIFIER',
      `${role} is a forbidden mutation verb (read-only connector): ${name}`,
    );
  }
  return name;
}

function assertPositiveInt(value: number, role: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ErpQueryError('INVALID_LIMIT', `${role} must be a positive integer, got: ${value}`);
  }
  return value;
}

// ─── Connector ───────────────────────────────────────────────────────────────

/**
 * Read-only structured query compiler over an allow-listed set of entities,
 * backed by an injected driver. Register entities, then `query` them; the
 * connector never exposes a mutation path. Extensible to concrete enterprise
 * connectors (SAP / Odoo / Dynamics) behind the {@link ErpDriver} seam.
 */
export class ErpConnector {
  private readonly entities = new Map<string, EntitySchema>();
  private readonly driver: ErpDriver;
  private readonly maxLimit: number;
  private readonly defaultLimit: number;
  private readonly actor?: ActorContext;

  constructor(opts: ErpConnectorOptions) {
    if (typeof opts?.driver !== 'function') {
      throw new ErpQueryError('INVALID_FILTER', 'ErpConnector requires an injected driver function');
    }
    this.driver = opts.driver;
    this.maxLimit = assertPositiveInt(opts.maxLimit ?? DEFAULT_MAX_LIMIT, 'maxLimit');
    this.defaultLimit = Math.min(
      assertPositiveInt(opts.defaultLimit ?? this.maxLimit, 'defaultLimit'),
      this.maxLimit,
    );
    this.actor = opts.actor;
  }

  /**
   * Declare a queryable entity and its field allow-list. Only declared
   * entities/fields are queryable. Validates the entity name + every field as a
   * safe, non-mutation identifier. Returns `this` for fluent registration.
   */
  registerEntity(name: string, schema: EntitySchema): this {
    assertSafeIdentifier(name, 'entity name');
    if (!Array.isArray(schema?.fields) || schema.fields.length === 0) {
      throw new ErpQueryError('FIELD_NOT_ALLOWED', `entity '${name}' must declare at least one field`);
    }
    for (const field of schema.fields) assertSafeIdentifier(field, `field of '${name}'`);
    if (schema.source !== undefined) assertSafeIdentifier(schema.source, `source of '${name}'`);
    if (schema.maxLimit !== undefined) assertPositiveInt(schema.maxLimit, `maxLimit of '${name}'`);
    this.entities.set(name, {
      fields: [...schema.fields],
      source: schema.source ?? name,
      maxLimit: schema.maxLimit,
    });
    return this;
  }

  /** Is `name` a registered, queryable entity? */
  hasEntity(name: string): boolean {
    return this.entities.has(name);
  }

  /** Registered entity names, sorted for stable output. */
  listEntities(): string[] {
    return [...this.entities.keys()].sort();
  }

  /**
   * Compile `spec` to a read-only parameterized request and execute it through
   * the injected driver. `actor` (or the connector default) is tagged on the
   * compiled query + result for audit. Throws {@link ErpQueryError} on any
   * validation failure (fail-closed).
   */
  async query(spec: ErpQuerySpec, actor?: ActorContext): Promise<ErpResultSet> {
    const compiled = this.compile(spec, actor ?? this.actor);
    const rows = await this.driver(compiled);
    const materialized = [...rows];
    return {
      entity: compiled.entity,
      rows: materialized,
      rowCount: materialized.length,
      actor: compiled.actor,
      compiled,
    };
  }

  /** Pure compilation step — validates against the allow-list and builds the
   *  parameterized read-only request. Exposed-free (private); `query` is the API. */
  private compile(spec: ErpQuerySpec, actor: ActorContext | undefined): CompiledQuery {
    const entityName = assertSafeIdentifier(spec?.entity, 'entity');
    const schema = this.entities.get(entityName);
    if (schema === undefined) {
      throw new ErpQueryError('ENTITY_NOT_REGISTERED', `entity is not registered: ${entityName}`);
    }
    const allowed = new Set(schema.fields);

    const fields = this.resolveFields(spec.fields, allowed, schema.fields, entityName);
    const { predicates, params } = this.compileFilters(spec.filters, allowed, entityName);
    const limit = this.resolveLimit(spec.limit, schema);

    return {
      entity: entityName,
      source: schema.source ?? entityName,
      fields,
      predicates,
      params,
      limit,
      operation: 'read',
      readOnly: true,
      actor,
    };
  }

  private resolveFields(
    requested: readonly string[] | undefined,
    allowed: ReadonlySet<string>,
    declared: readonly string[],
    entity: string,
  ): string[] {
    if (requested === undefined) return [...declared];
    return requested.map((field) => {
      assertSafeIdentifier(field, 'field');
      if (!allowed.has(field)) {
        throw new ErpQueryError('FIELD_NOT_ALLOWED', `field '${field}' is not allow-listed for entity '${entity}'`);
      }
      return field;
    });
  }

  private compileFilters(
    filters: readonly ErpFilter[] | undefined,
    allowed: ReadonlySet<string>,
    entity: string,
  ): { predicates: CompiledPredicate[]; params: ErpScalar[] } {
    const predicates: CompiledPredicate[] = [];
    const params: ErpScalar[] = [];
    if (filters === undefined) return { predicates, params };

    for (const filter of filters) {
      assertSafeIdentifier(filter?.field, 'filter field');
      if (!allowed.has(filter.field)) {
        throw new ErpQueryError(
          'FIELD_NOT_ALLOWED',
          `filter field '${filter.field}' is not allow-listed for entity '${entity}'`,
        );
      }
      const placeholders = this.bindFilterValue(filter, params);
      predicates.push({ field: filter.field, op: filter.op, placeholders });
    }
    return { predicates, params };
  }

  /** Append a filter's value(s) to `params` (parameterized — never inlined) and
   *  return the 1-based placeholder index/indices. Validates op/value shape. */
  private bindFilterValue(filter: ErpFilter, params: ErpScalar[]): number[] {
    if (filter.op === 'in') {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new ErpQueryError('INVALID_FILTER', `filter '${filter.field}' op 'in' requires a non-empty array value`);
      }
      return filter.value.map((scalar) => {
        assertScalar(scalar, filter.field);
        params.push(scalar);
        return params.length;
      });
    }
    if (Array.isArray(filter.value)) {
      throw new ErpQueryError('INVALID_FILTER', `filter '${filter.field}' op '${filter.op}' requires a scalar value`);
    }
    assertScalar(filter.value, filter.field);
    params.push(filter.value);
    return [params.length];
  }

  /** Resolve + clamp the row cap so every compiled query is bounded (mandatory cap). */
  private resolveLimit(requested: number | undefined, schema: EntitySchema): number {
    const cap = Math.min(schema.maxLimit ?? this.maxLimit, this.maxLimit);
    const want = requested ?? Math.min(this.defaultLimit, cap);
    assertPositiveInt(want, 'limit');
    return Math.min(want, cap);
  }
}

function assertScalar(value: unknown, field: string): asserts value is ErpScalar {
  const t = typeof value;
  if (value !== null && t !== 'string' && t !== 'number' && t !== 'boolean') {
    throw new ErpQueryError('INVALID_FILTER', `filter '${field}' value must be a scalar (string|number|boolean|null)`);
  }
}

/** Build a read-only {@link ErpConnector} with an injected driver. */
export function createErpConnector(opts: ErpConnectorOptions): ErpConnector {
  return new ErpConnector(opts);
}
