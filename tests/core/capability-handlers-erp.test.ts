// tests/core/capability-handlers-erp.test.ts
// ERP capability wake (Sprint 265 Task 1): erp.read handler arg validation,
// in-memory reference driver predicates, and broker round-trip — all hermetic
// (injected driver, no network / no disk).
import { describe, it, expect } from 'vitest';
import {
  createErpReadHandler,
  createInMemoryErpDriver,
  installErpHandler,
} from '../../src/core/erp/handler.js';
import { CapabilityRegistry } from '../../src/core/capability-broker.js';
import {
  createErpConnector,
  type ErpConnector,
  type ErpResultSet,
  type ErpRow,
} from '../../src/core/erp/connector.js';
import type { Capability } from '../../src/core/work-model.js';

const CUSTOMERS: ErpRow[] = [
  { id: 1, name: 'Acme GmbH', country: 'DE', revenue: 1200 },
  { id: 2, name: 'Globex', country: 'US', revenue: 800 },
  { id: 3, name: 'Initech', country: 'DE', revenue: 1500 },
  { id: 4, name: 'Umbrella', country: 'UK', revenue: 300 },
];

function buildConnector(): ErpConnector {
  const driver = createInMemoryErpDriver({ customers: CUSTOMERS });
  return createErpConnector({ driver }).registerEntity('customers', {
    fields: ['id', 'name', 'country', 'revenue'],
  });
}

function buildRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  installErpHandler(registry, { connector: buildConnector() });
  return registry;
}

/** Invoke erp.read and unwrap the ErpResultSet (asserts ok). */
async function query(
  registry: CapabilityRegistry,
  args: Record<string, unknown>,
): Promise<ErpResultSet> {
  const res = await registry.invoke({ capability: 'erp.read', args });
  expect(res.ok, res.ok ? '' : `expected ok, got: ${res.error}`).toBe(true);
  if (!res.ok) throw new Error('unreachable');
  return res.value as ErpResultSet;
}

describe('createErpReadHandler — arg validation (broker converts throw → CAPABILITY_FAILED)', () => {
  it('rejects a missing entity with an explanatory failure', async () => {
    const res = await buildRegistry().invoke({ capability: 'erp.read', args: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CAPABILITY_FAILED');
      expect(res.error).toContain('entity');
    }
  });

  it('rejects a non-string entity', async () => {
    const res = await buildRegistry().invoke({ capability: 'erp.read', args: { entity: 42 } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('CAPABILITY_FAILED');
  });

  it('rejects non-array filters', async () => {
    const res = await buildRegistry().invoke({
      capability: 'erp.read',
      args: { entity: 'customers', filters: 'country = DE' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CAPABILITY_FAILED');
      expect(res.error).toContain('filters');
    }
  });

  it('rejects a filter with an unknown op', async () => {
    const res = await buildRegistry().invoke({
      capability: 'erp.read',
      args: { entity: 'customers', filters: [{ field: 'country', op: 'between', value: 'DE' }] },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CAPABILITY_FAILED');
      expect(res.error).toContain('op');
    }
  });

  it('rejects a filter without a value', async () => {
    const res = await buildRegistry().invoke({
      capability: 'erp.read',
      args: { entity: 'customers', filters: [{ field: 'country', op: 'eq' }] },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('CAPABILITY_FAILED');
  });

  it('rejects non-string-array fields and non-number limit', async () => {
    const registry = buildRegistry();
    const badFields = await registry.invoke({
      capability: 'erp.read',
      args: { entity: 'customers', fields: [1, 2] },
    });
    expect(badFields.ok).toBe(false);
    if (!badFields.ok) expect(badFields.code).toBe('CAPABILITY_FAILED');

    const badLimit = await registry.invoke({
      capability: 'erp.read',
      args: { entity: 'customers', limit: 'ten' },
    });
    expect(badLimit.ok).toBe(false);
    if (!badLimit.ok) expect(badLimit.code).toBe('CAPABILITY_FAILED');
  });

  it('surfaces connector validation (unregistered entity) as CAPABILITY_FAILED — SSOT, not re-validated', async () => {
    const res = await buildRegistry().invoke({
      capability: 'erp.read',
      args: { entity: 'invoices' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('CAPABILITY_FAILED');
      expect(res.error).toContain('not registered');
    }
  });
});

describe('erp.read — least-privilege gate', () => {
  it('is DENIED when the grant set lacks erp.read', async () => {
    const res = await buildRegistry().invoke(
      { capability: 'erp.read', args: { entity: 'customers' } },
      { grantedCapabilities: ['fs-read'] },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('CAPABILITY_DENIED');
  });

  it('is allowed when erp.read is granted', async () => {
    const res = await buildRegistry().invoke(
      { capability: 'erp.read', args: { entity: 'customers' } },
      { grantedCapabilities: ['erp.read' as Capability] },
    );
    expect(res.ok).toBe(true);
  });
});

describe('erp.read round-trip — connector + in-memory driver', () => {
  it('returns all rows and declared fields for a bare entity query', async () => {
    const result = await query(buildRegistry(), { entity: 'customers' });
    expect(result.entity).toBe('customers');
    expect(result.rowCount).toBe(4);
    expect(result.rows[0]).toEqual({ id: 1, name: 'Acme GmbH', country: 'DE', revenue: 1200 });
    expect(result.compiled.readOnly).toBe(true);
  });

  it('applies eq and projects only the requested fields', async () => {
    const result = await query(buildRegistry(), {
      entity: 'customers',
      fields: ['id', 'name'],
      filters: [{ field: 'country', op: 'eq', value: 'DE' }],
    });
    expect(result.rows).toEqual([
      { id: 1, name: 'Acme GmbH' },
      { id: 3, name: 'Initech' },
    ]);
  });

  it('applies ne', async () => {
    const result = await query(buildRegistry(), {
      entity: 'customers',
      fields: ['id'],
      filters: [{ field: 'country', op: 'ne', value: 'DE' }],
    });
    expect(result.rows.map((r) => r.id)).toEqual([2, 4]);
  });

  it('applies gt / gte / lt / lte over numbers', async () => {
    const registry = buildRegistry();
    const gt = await query(registry, {
      entity: 'customers',
      fields: ['id'],
      filters: [{ field: 'revenue', op: 'gt', value: 1200 }],
    });
    expect(gt.rows.map((r) => r.id)).toEqual([3]);

    const gte = await query(registry, {
      entity: 'customers',
      fields: ['id'],
      filters: [{ field: 'revenue', op: 'gte', value: 1200 }],
    });
    expect(gte.rows.map((r) => r.id)).toEqual([1, 3]);

    const lt = await query(registry, {
      entity: 'customers',
      fields: ['id'],
      filters: [{ field: 'revenue', op: 'lt', value: 800 }],
    });
    expect(lt.rows.map((r) => r.id)).toEqual([4]);

    const lte = await query(registry, {
      entity: 'customers',
      fields: ['id'],
      filters: [{ field: 'revenue', op: 'lte', value: 800 }],
    });
    expect(lte.rows.map((r) => r.id)).toEqual([2, 4]);
  });

  it('applies in over a parameter list', async () => {
    const result = await query(buildRegistry(), {
      entity: 'customers',
      fields: ['id'],
      filters: [{ field: 'country', op: 'in', value: ['US', 'UK'] }],
    });
    expect(result.rows.map((r) => r.id)).toEqual([2, 4]);
  });

  it('applies like with % and _ wildcards (anchored)', async () => {
    const registry = buildRegistry();
    const prefix = await query(registry, {
      entity: 'customers',
      fields: ['name'],
      filters: [{ field: 'name', op: 'like', value: 'Ini%' }],
    });
    expect(prefix.rows).toEqual([{ name: 'Initech' }]);

    const single = await query(registry, {
      entity: 'customers',
      fields: ['name'],
      filters: [{ field: 'name', op: 'like', value: 'Glob_x' }],
    });
    expect(single.rows).toEqual([{ name: 'Globex' }]);

    // No wildcard ⇒ exact match only — must NOT behave like contains.
    const exact = await query(registry, {
      entity: 'customers',
      fields: ['name'],
      filters: [{ field: 'name', op: 'like', value: 'tech' }],
    });
    expect(exact.rowCount).toBe(0);
  });

  it('combines multiple filters with AND semantics and honors limit', async () => {
    const registry = buildRegistry();
    const combined = await query(registry, {
      entity: 'customers',
      fields: ['id'],
      filters: [
        { field: 'country', op: 'eq', value: 'DE' },
        { field: 'revenue', op: 'gt', value: 1300 },
      ],
    });
    expect(combined.rows.map((r) => r.id)).toEqual([3]);

    const limited = await query(registry, { entity: 'customers', fields: ['id'], limit: 2 });
    expect(limited.rows.map((r) => r.id)).toEqual([1, 2]);
    expect(limited.compiled.limit).toBe(2);
  });
});

describe('createInMemoryErpDriver — driver-level behavior', () => {
  it('throws an explanatory error for an unknown source table', async () => {
    const driver = createInMemoryErpDriver({});
    const connector = createErpConnector({ driver }).registerEntity('orders', {
      fields: ['id'],
    });
    await expect(connector.query({ entity: 'orders' })).rejects.toThrow(/no table.*orders/);
  });

  it('maps an entity to its declared physical source', async () => {
    const driver = createInMemoryErpDriver({ crm_accounts: [{ id: 7 }] });
    const connector = createErpConnector({ driver }).registerEntity('accounts', {
      fields: ['id'],
      source: 'crm_accounts',
    });
    const result = await connector.query({ entity: 'accounts' });
    expect(result.rows).toEqual([{ id: 7 }]);
  });

  it('omits fields that are absent from a row instead of emitting undefined', async () => {
    const driver = createInMemoryErpDriver({ items: [{ id: 1 }] });
    const connector = createErpConnector({ driver }).registerEntity('items', {
      fields: ['id', 'label'],
    });
    const result = await connector.query({ entity: 'items', fields: ['id', 'label'] });
    expect(result.rows).toEqual([{ id: 1 }]);
    expect(Object.keys(result.rows[0]!)).toEqual(['id']);
  });
});

describe('createErpReadHandler — direct contract', () => {
  it("declares requiredCapability 'erp.read' and forwards ctx.actor to the connector", async () => {
    const handler = createErpReadHandler({ connector: buildConnector() });
    expect(handler.requiredCapability).toBe('erp.read');
    const value = (await handler.invoke(
      { entity: 'customers', limit: 1 },
      { actor: { id: 'w-265', role: 'worker' } },
    )) as ErpResultSet;
    expect(value.actor).toEqual({ id: 'w-265', role: 'worker' });
    expect(value.compiled.actor).toEqual({ id: 'w-265', role: 'worker' });
  });
});
