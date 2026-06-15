import { describe, expect, it, vi } from 'vitest';
import {
  ErpConnector,
  ErpQueryError,
  createErpConnector,
  type CompiledQuery,
  type ErpDriver,
  type ErpRow,
} from '../../src/core/erp/connector.js';
import type { ActorContext } from '../../src/core/work-model.js';

/** A capturing driver — records every compiled request it receives + returns canned rows. */
function makeDriver(rows: readonly ErpRow[] = []): {
  driver: ErpDriver;
  calls: CompiledQuery[];
} {
  const calls: CompiledQuery[] = [];
  const driver: ErpDriver = vi.fn(async (compiled: CompiledQuery) => {
    calls.push(compiled);
    return rows;
  });
  return { driver, calls };
}

function connectorWithUsers(driver: ErpDriver): ErpConnector {
  return new ErpConnector({ driver }).registerEntity('users', {
    fields: ['id', 'email', 'role', 'tenant_id'],
    source: 'app_users',
    maxLimit: 50,
  });
}

const ACTOR: ActorContext = { id: 'u-1', role: 'analyst', tenantId: 't-9' };

describe('ErpConnector — read-only structured query compiler', () => {
  it('queries an allowed entity/field, parameterizes filters, tags the actor', async () => {
    const { driver, calls } = makeDriver([{ id: 1, email: 'a@x.io' }]);
    const erp = connectorWithUsers(driver);

    const result = await erp.query(
      {
        entity: 'users',
        fields: ['id', 'email'],
        filters: [
          { field: 'role', op: 'eq', value: 'admin' },
          { field: 'id', op: 'in', value: [1, 2, 3] },
        ],
        limit: 10,
      },
      ACTOR,
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ id: 1, email: 'a@x.io' }]);
    expect(result.actor).toEqual(ACTOR);

    // Assert on what the driver actually received — proof the compiler did its job.
    expect(calls).toHaveLength(1);
    const compiled = calls[0];
    expect(compiled.operation).toBe('read');
    expect(compiled.readOnly).toBe(true);
    expect(compiled.entity).toBe('users');
    expect(compiled.source).toBe('app_users');
    expect(compiled.fields).toEqual(['id', 'email']);
    expect(compiled.actor).toEqual(ACTOR);
    expect(compiled.limit).toBe(10);

    // Values are parameterized (never inlined); `in` spans multiple placeholders.
    expect(compiled.params).toEqual(['admin', 1, 2, 3]);
    expect(compiled.predicates).toEqual([
      { field: 'role', op: 'eq', placeholders: [1] },
      { field: 'id', op: 'in', placeholders: [2, 3, 4] },
    ]);
  });

  it('defaults to all declared fields when none requested', async () => {
    const { driver, calls } = makeDriver();
    const erp = connectorWithUsers(driver);
    await erp.query({ entity: 'users' });
    expect(calls[0].fields).toEqual(['id', 'email', 'role', 'tenant_id']);
    expect(calls[0].predicates).toEqual([]);
    expect(calls[0].params).toEqual([]);
  });

  it('rejects an undeclared entity (allow-list)', async () => {
    const { driver } = makeDriver();
    const erp = connectorWithUsers(driver);
    await expect(erp.query({ entity: 'invoices' })).rejects.toMatchObject({
      name: 'ErpQueryError',
      code: 'ENTITY_NOT_REGISTERED',
    });
  });

  it('rejects a field not in the entity allow-list', async () => {
    const { driver } = makeDriver();
    const erp = connectorWithUsers(driver);
    await expect(erp.query({ entity: 'users', fields: ['password_hash'] })).rejects.toMatchObject({
      code: 'FIELD_NOT_ALLOWED',
    });
    await expect(
      erp.query({ entity: 'users', filters: [{ field: 'ssn', op: 'eq', value: 'x' }] }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
  });

  it('rejects mutation verbs smuggled as identifiers (no mutation verbs)', async () => {
    const { driver } = makeDriver();
    const erp = connectorWithUsers(driver);

    // mutation verb as entity name
    await expect(erp.query({ entity: 'DROP' })).rejects.toMatchObject({ code: 'INVALID_IDENTIFIER' });
    // mutation verb as a filter field on a REGISTERED entity (unambiguous path)
    await expect(
      erp.query({ entity: 'users', filters: [{ field: 'delete', op: 'eq', value: 1 }] }),
    ).rejects.toMatchObject({ code: 'INVALID_IDENTIFIER' });
    // non-identifier (injection attempt) as entity
    await expect(erp.query({ entity: 'users; DROP TABLE users' })).rejects.toMatchObject({
      code: 'INVALID_IDENTIFIER',
    });
    // registerEntity validates field identifiers too
    expect(() => erp.registerEntity('orders', { fields: ['truncate'] })).toThrow(ErpQueryError);
  });

  it('always enforces a bounded limit (mandatory cap)', async () => {
    const { driver, calls } = makeDriver();
    const erp = connectorWithUsers(driver); // entity maxLimit = 50

    // over-cap request is clamped to the entity ceiling
    await erp.query({ entity: 'users', limit: 999999 });
    expect(calls[0].limit).toBe(50);

    // omitted limit falls back to a bounded default (connector maxLimit clamps it)
    const { driver: d2, calls: c2 } = makeDriver();
    const erp2 = new ErpConnector({ driver: d2, maxLimit: 25 }).registerEntity('items', {
      fields: ['id'],
    });
    await erp2.query({ entity: 'items' });
    expect(c2[0].limit).toBe(25);

    // invalid limit rejected
    await expect(erp.query({ entity: 'users', limit: 0 })).rejects.toMatchObject({
      code: 'INVALID_LIMIT',
    });
    await expect(erp.query({ entity: 'users', limit: 1.5 })).rejects.toMatchObject({
      code: 'INVALID_LIMIT',
    });
  });

  it('validates filter value shapes', async () => {
    const { driver } = makeDriver();
    const erp = connectorWithUsers(driver);
    await expect(
      erp.query({ entity: 'users', filters: [{ field: 'id', op: 'in', value: 5 }] }),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    await expect(
      erp.query({ entity: 'users', filters: [{ field: 'role', op: 'eq', value: ['a', 'b'] }] }),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    await expect(
      erp.query({ entity: 'users', filters: [{ field: 'id', op: 'in', value: [] }] }),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
  });

  it('tags the connector default actor when no per-call actor is passed, per-call overrides', async () => {
    const { driver, calls } = makeDriver();
    const erp = new ErpConnector({ driver, actor: ACTOR }).registerEntity('items', {
      fields: ['id'],
    });
    await erp.query({ entity: 'items' });
    expect(calls[0].actor).toEqual(ACTOR);

    const override: ActorContext = { id: 'u-2' };
    await erp.query({ entity: 'items' }, override);
    expect(calls[1].actor).toEqual(override);
  });

  it('exposes entity introspection and a factory', () => {
    const { driver } = makeDriver();
    const erp = createErpConnector({ driver })
      .registerEntity('users', { fields: ['id'] })
      .registerEntity('items', { fields: ['id'] });
    expect(erp).toBeInstanceOf(ErpConnector);
    expect(erp.hasEntity('users')).toBe(true);
    expect(erp.hasEntity('nope')).toBe(false);
    expect(erp.listEntities()).toEqual(['items', 'users']);
  });

  it('requires an injected driver function', () => {
    // @ts-expect-error — driver is mandatory
    expect(() => new ErpConnector({})).toThrow(ErpQueryError);
  });
});
