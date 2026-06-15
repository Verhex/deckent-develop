// ═══ ERP Capability Handler — Sprint 265 Task 1 (E12 wake) ═════════════════
//
// Bridges the F8 capability path to the read-only ERP connector: an
// `erp.read` CapabilityTarget is SHAPE-validated into an `ErpQuerySpec` and
// executed through an injected {@link ErpConnector}. Deep semantics —
// entity/field allow-list, mutation-verb rejection, parameterization, limit
// clamping — stay in the connector (SSOT, deliberately NOT re-implemented
// here). The in-memory driver is the reference/test implementation; concrete
// SAP / Odoo / Dynamics drivers plug in behind the same `ErpDriver` seam later.
//
// ADR-008: imports only from core/ siblings. ADR-010: no new deps.

import {
  CapabilityRegistry,
  type CapabilityHandler,
  type InvocationContext,
} from '../capability-broker.js';
import type {
  CompiledPredicate,
  CompiledQuery,
  ErpConnector,
  ErpDriver,
  ErpFilter,
  ErpFilterOp,
  ErpQuerySpec,
  ErpRow,
  ErpScalar,
} from './connector.js';
import type { Capability } from '../work-model.js';
import { DeckentError } from '../errors.js';

// ─── erp.read handler ─────────────────────────────────────────────────────────

/** Construction options — the connector that fulfils erp.read queries. */
export interface ErpReadHandlerOptions {
  connector: ErpConnector;
}

const ERP_FILTER_OPS: ReadonlySet<string> = new Set<ErpFilterOp>([
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'like',
]);

/** Shape-validate one raw filter into an {@link ErpFilter}. Scalar-ness of the
 *  value and field allow-listing are the connector's job (SSOT) — only the
 *  JSON shape (and op membership, which the connector types but does not
 *  runtime-check) is validated here. */
function parseFilter(raw: unknown, index: number): ErpFilter {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DeckentError('DECKENT_E004', `erp.read filter #${index} must be an object { field, op, value }`);
  }
  const { field, op, value } = raw as Record<string, unknown>;
  if (typeof field !== 'string' || field.length === 0) {
    throw new DeckentError('DECKENT_E039', `erp.read filter #${index} requires a non-empty string field`);
  }
  if (typeof op !== 'string' || !ERP_FILTER_OPS.has(op)) {
    throw new DeckentError(
      'DECKENT_E004',
      `erp.read filter #${index} has an unknown op ${JSON.stringify(op)} (expected eq|ne|gt|gte|lt|lte|in|like)`,
    );
  }
  if (value === undefined) {
    throw new DeckentError('DECKENT_E039', `erp.read filter #${index} requires a value`);
  }
  return { field, op: op as ErpFilterOp, value: value as ErpScalar | readonly ErpScalar[] };
}

/** Shape-validate raw capability args into an {@link ErpQuerySpec} — explanatory
 *  throws here surface as `CAPABILITY_FAILED` through the broker. */
function parseQuerySpec(args: Record<string, unknown>): ErpQuerySpec {
  const entity = args.entity;
  if (typeof entity !== 'string' || entity.trim().length === 0) {
    throw new DeckentError('DECKENT_E039', 'erp.read requires a non-empty string args.entity');
  }
  const spec: { entity: string; fields?: string[]; filters?: ErpFilter[]; limit?: number } = {
    entity,
  };

  const fields = args.fields;
  if (fields !== undefined) {
    if (!Array.isArray(fields)) {
      throw new DeckentError('DECKENT_E004', 'erp.read requires args.fields to be an array of strings when provided');
    }
    spec.fields = fields.map((item, index) => {
      if (typeof item !== 'string') {
        throw new DeckentError('DECKENT_E004', `erp.read field #${index} must be a string, got: ${JSON.stringify(item)}`);
      }
      return item;
    });
  }

  const filters = args.filters;
  if (filters !== undefined) {
    if (!Array.isArray(filters)) {
      throw new DeckentError('DECKENT_E004', 'erp.read requires args.filters to be an array when provided');
    }
    spec.filters = filters.map((raw, index) => parseFilter(raw, index));
  }

  const limit = args.limit;
  if (limit !== undefined) {
    if (typeof limit !== 'number') {
      throw new DeckentError('DECKENT_E004', 'erp.read requires args.limit to be a number when provided');
    }
    spec.limit = limit; // positivity / clamping is the connector's job (INVALID_LIMIT)
  }

  return spec;
}

/**
 * Build the `erp.read` handler: shape-validates the capability args into an
 * {@link ErpQuerySpec} and executes it through `opts.connector`. The actor on
 * the invocation context is forwarded so the connector tags the compiled query
 * + result for downstream audit. Validation/connector throws surface as
 * `CAPABILITY_FAILED` via the broker — the handler never returns an error shape.
 */
export function createErpReadHandler(opts: ErpReadHandlerOptions): CapabilityHandler {
  const { connector } = opts;
  return {
    // The WM Capability union has not been widened to the dotted F8 read-only
    // names yet; the broker gates by string equality (same pattern as other
    // capability handlers — see capability-broker.ts registration).
    requiredCapability: 'erp.read' as Capability,
    description: 'Runs one structured read-only ERP query through the injected ErpConnector.',
    invoke: (args: Record<string, unknown>, ctx: InvocationContext) =>
      connector.query(parseQuerySpec(args), ctx.actor),
  };
}

/** Register the erp.read handler on `registry` without modifying the broker. */
export function installErpHandler(registry: CapabilityRegistry, opts: ErpReadHandlerOptions): void {
  registry.register('erp.read', createErpReadHandler(opts));
}

// ─── In-memory reference driver ───────────────────────────────────────────────

/** Translate an SQL LIKE pattern (`%` any-run, `_` single char) into an
 *  anchored RegExp. All other characters match literally. */
function likePatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`);
}

/** Ordering comparison for gt/gte/lt/lte — defined only for number↔number and
 *  string↔string pairs; anything else is incomparable (predicate → false). */
function compareOrdered(rowValue: unknown, param: ErpScalar): number | undefined {
  if (typeof rowValue === 'number' && typeof param === 'number') {
    return rowValue === param ? 0 : rowValue < param ? -1 : 1;
  }
  if (typeof rowValue === 'string' && typeof param === 'string') {
    return rowValue === param ? 0 : rowValue < param ? -1 : 1;
  }
  return undefined;
}

/** Does `row` satisfy `predicate`? Placeholder indices are 1-based into `params`. */
function matchesPredicate(
  row: ErpRow,
  predicate: CompiledPredicate,
  params: readonly ErpScalar[],
): boolean {
  const rowValue = row[predicate.field];
  const resolved = predicate.placeholders.map((index) => {
    const param = params[index - 1];
    if (param === undefined) {
      throw new DeckentError('DECKENT_E004', `in-memory ERP driver: placeholder ${index} is out of range for params`);
    }
    return param;
  });

  switch (predicate.op) {
    case 'eq':
      return rowValue === resolved[0];
    case 'ne':
      return rowValue !== resolved[0];
    case 'gt': {
      const cmp = compareOrdered(rowValue, resolved[0] as ErpScalar);
      return cmp !== undefined && cmp > 0;
    }
    case 'gte': {
      const cmp = compareOrdered(rowValue, resolved[0] as ErpScalar);
      return cmp !== undefined && cmp >= 0;
    }
    case 'lt': {
      const cmp = compareOrdered(rowValue, resolved[0] as ErpScalar);
      return cmp !== undefined && cmp < 0;
    }
    case 'lte': {
      const cmp = compareOrdered(rowValue, resolved[0] as ErpScalar);
      return cmp !== undefined && cmp <= 0;
    }
    case 'in':
      return resolved.some((param) => rowValue === param);
    case 'like':
      return (
        typeof rowValue === 'string' &&
        typeof resolved[0] === 'string' &&
        likePatternToRegExp(resolved[0]).test(rowValue)
      );
  }
}

/** Project `fields` out of `row` — only keys actually present are emitted (no
 *  explicit `undefined` properties). */
function projectFields(row: ErpRow, fields: readonly string[]): ErpRow {
  const projected: ErpRow = {};
  for (const field of fields) {
    if (field in row) projected[field] = row[field];
  }
  return projected;
}

/**
 * Reference {@link ErpDriver} over in-memory tables keyed by PHYSICAL source
 * name (`CompiledQuery.source`). Applies the compiled predicates (AND
 * semantics), projects the compiled field list, and slices to the mandatory
 * limit. Reference/test driver — concrete SAP / Odoo drivers are follow-up work.
 */
export function createInMemoryErpDriver(tables: Record<string, ErpRow[]>): ErpDriver {
  return async (compiled: CompiledQuery): Promise<readonly ErpRow[]> => {
    const rows = tables[compiled.source];
    if (rows === undefined) {
      throw new DeckentError('DECKENT_E004', `in-memory ERP driver has no table for source '${compiled.source}'`);
    }
    return rows
      .filter((row) => compiled.predicates.every((p) => matchesPredicate(row, p, compiled.params)))
      .slice(0, compiled.limit)
      .map((row) => projectFields(row, compiled.fields));
  };
}
