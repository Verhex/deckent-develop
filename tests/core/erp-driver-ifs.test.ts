// tests/core/erp-driver-ifs.test.ts
//
// IFS Cloud OData ERP driver — fourth concrete ErpDriver (read-only). Hermetic:
// fetchImpl is injected, so no test ever touches the network. Mirrors the
// Dynamics driver test surface (both speak OData v4) with IFS projection-REST
// path construction.

import { describe, it, expect, vi } from 'vitest';
import { createIfsErpDriver, type IfsFetchLike } from '../../src/core/erp/ifs/driver.js';
import type { CompiledQuery } from '../../src/core/erp/connector.js';

function compiled(overrides: Partial<CompiledQuery> = {}): CompiledQuery {
  return {
    entity: 'CustomerOrder',
    source: 'CustomerOrder',
    fields: ['OrderNo', 'CustomerNo'],
    predicates: [],
    params: [],
    limit: 50,
    operation: 'read',
    readOnly: true,
    ...overrides,
  };
}

function okFetch(rows: unknown[]): IfsFetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ value: rows }),
    text: async () => JSON.stringify({ value: rows }),
  })) as IfsFetchLike & ReturnType<typeof vi.fn>;
}

const BASE = {
  baseUrl: 'https://ifs.example.com',
  projection: 'CustomerOrdersHandling',
  auth: { kind: 'bearer' as const, token: 'ifs-secret-token' },
};

describe('createIfsErpDriver', () => {
  it('builds the IFS projection-REST URL with $select + $top and bearer auth', async () => {
    const fetchImpl = okFetch([{ OrderNo: 'CO-1', CustomerNo: 'C-1' }]);
    const driver = createIfsErpDriver({ ...BASE, fetchImpl });
    const rows = await driver(compiled());

    expect(rows).toEqual([{ OrderNo: 'CO-1', CustomerNo: 'C-1' }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/main/ifsapplications/projection/v1/CustomerOrdersHandling/CustomerOrder');
    expect(url).toContain('$select=OrderNo%2CCustomerNo');
    expect(url).toContain('$top=50');
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe('Bearer ifs-secret-token');
  });

  it('translates eq / in / like predicates into one OData v4 $filter', async () => {
    const fetchImpl = okFetch([]);
    const driver = createIfsErpDriver({ ...BASE, fetchImpl });
    await driver(compiled({
      predicates: [
        { field: 'CustomerNo', op: 'eq', placeholders: [1] },
        { field: 'State', op: 'in', placeholders: [2, 3] },
        { field: 'Name', op: 'like', placeholders: [4] },
      ],
      params: ['C-1', 'Planned', 'Released', 'Acme'],
    }));
    const url = decodeURIComponent(fetchImpl.mock.calls[0][0]);
    expect(url).toContain("CustomerNo eq 'C-1'");
    expect(url).toContain("State in ('Planned','Released')");
    expect(url).toContain("contains(Name,'Acme')");
    expect(url).toContain(' and ');
  });

  it('maps logical entity → IFS entity set via entityModelMap', async () => {
    const fetchImpl = okFetch([]);
    const driver = createIfsErpDriver({ ...BASE, fetchImpl, entityModelMap: { CustomerOrder: 'CustomerOrderSet' } });
    await driver(compiled());
    expect(fetchImpl.mock.calls[0][0]).toContain('/CustomerOrdersHandling/CustomerOrderSet?');
  });

  it('honours a custom apiVersion segment', async () => {
    const fetchImpl = okFetch([]);
    const driver = createIfsErpDriver({ ...BASE, fetchImpl, apiVersion: 'v2' });
    await driver(compiled());
    expect(fetchImpl.mock.calls[0][0]).toContain('/projection/v2/CustomerOrdersHandling/');
  });

  it('refuses a non-read-only compiled query (defence in depth)', async () => {
    const fetchImpl = okFetch([]);
    const driver = createIfsErpDriver({ ...BASE, fetchImpl });
    await expect(driver(compiled({ readOnly: false as unknown as true }))).rejects.toThrow(/read-only/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('redacts the bearer token from error messages', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false, status: 401,
      json: async () => ({}),
      text: async () => 'unauthorized for token ifs-secret-token',
    })) as IfsFetchLike;
    const driver = createIfsErpDriver({ ...BASE, fetchImpl });
    await expect(driver(compiled())).rejects.toThrow(/\[redacted\]/);
    await expect(driver(compiled())).rejects.not.toThrow(/ifs-secret-token/);
  });

  it('rejects an OData response without a `value` array', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ notValue: [] }),
      text: async () => '{}',
    })) as IfsFetchLike;
    const driver = createIfsErpDriver({ ...BASE, fetchImpl });
    await expect(driver(compiled())).rejects.toThrow(/value/i);
  });

  it('eagerly validates wiring at construction time', () => {
    const fetchImpl = okFetch([]);
    expect(() => createIfsErpDriver({ ...BASE, baseUrl: 'ftp://x', fetchImpl })).toThrow(/protocol/i);
    expect(() => createIfsErpDriver({ ...BASE, auth: { kind: 'bearer', token: '' }, fetchImpl })).toThrow(/token/i);
    expect(() => createIfsErpDriver({ ...BASE, projection: 'bad name!', fetchImpl })).toThrow(/projection/i);
    expect(() => createIfsErpDriver({ ...BASE, apiVersion: '9.2', fetchImpl })).toThrow(/apiVersion/i);
  });
});
