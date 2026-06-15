// tests/core/erp-driver-odoo.test.ts
// Sprint 266 T-001 — Odoo read-only ErpDriver: CompiledQuery → JSON-RPC search_read.
// Hermetic: fetch is always injected (mock) — no real network I/O.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOdooErpDriver, type OdooFetchLike } from '../../src/core/erp/odoo/driver.js';
import {
  createErpConnector,
  type CompiledQuery,
  type ErpFilterOp,
  type ErpRow,
  type ErpScalar,
} from '../../src/core/erp/connector.js';

const URL_OK = 'https://erp.example.com/jsonrpc';
const API_KEY = 'super-secret-odoo-key';

const BASE_OPTS = { url: URL_OK, db: 'prod', uid: 7, apiKey: API_KEY };

/** Mock fetch capturing every call; replies with a canned JSON-RPC payload. */
function mockOdooFetch(reply: { status?: number; payload?: unknown } = {}): {
  impl: OdooFetchLike;
  calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }>;
} {
  const status = reply.status ?? 200;
  const payload = reply.payload ?? { jsonrpc: '2.0', id: 1, result: [] };
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> = [];
  const impl: OdooFetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };
  return { impl, calls };
}

/** A valid CompiledQuery literal (the shape erp-connector.ts hands a driver). */
function compiled(overrides: Partial<CompiledQuery> = {}): CompiledQuery {
  return {
    entity: 'partner',
    source: 'partner',
    fields: ['id', 'name'],
    predicates: [],
    params: [],
    limit: 50,
    operation: 'read',
    readOnly: true,
    ...overrides,
  };
}

/** The `execute_kw` positional args from the captured request body. */
function sentArgs(call: { init: { body: string } }): unknown[] {
  const body = JSON.parse(call.init.body) as { params: { args: unknown[] } };
  return body.params.args;
}

/** The Odoo domain list (first positional `search_read` argument). */
function sentDomain(call: { init: { body: string } }): unknown[] {
  return (sentArgs(call)[5] as unknown[][])[0] as unknown[];
}

describe('createOdooErpDriver — domain translation', () => {
  const SCALAR_OPS: Array<[ErpFilterOp, string]> = [
    ['eq', '='],
    ['ne', '!='],
    ['gt', '>'],
    ['gte', '>='],
    ['lt', '<'],
    ['lte', '<='],
  ];

  it.each(SCALAR_OPS)(
    "translates scalar op '%s' to Odoo operator '%s' with the 1-based-resolved param",
    async (op, odooOp) => {
      const { impl, calls } = mockOdooFetch();
      const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

      await driver(
        compiled({
          predicates: [{ field: 'amount', op, placeholders: [1] }],
          params: [42],
        }),
      );

      expect(sentDomain(calls[0]!)).toEqual([['amount', odooOp, 42]]);
    },
  );

  it("translates op 'in' to Odoo 'in' collecting ALL placeholder values into an array", async () => {
    const { impl, calls } = mockOdooFetch();
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [{ field: 'state', op: 'in', placeholders: [1, 2, 3] }],
        params: ['draft', 'open', 'paid'],
      }),
    );

    expect(sentDomain(calls[0]!)).toEqual([['state', 'in', ['draft', 'open', 'paid']]]);
  });

  it("translates op 'like' to Odoo 'ilike'", async () => {
    const { impl, calls } = mockOdooFetch();
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [{ field: 'name', op: 'like', placeholders: [1] }],
        params: ['%acme%'],
      }),
    );

    expect(sentDomain(calls[0]!)).toEqual([['name', 'ilike', '%acme%']]);
  });

  it('resolves 1-based placeholders across MULTIPLE predicates sharing one params list', async () => {
    const { impl, calls } = mockOdooFetch();
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [
          { field: 'active', op: 'eq', placeholders: [1] },
          { field: 'state', op: 'in', placeholders: [2, 3] },
        ],
        params: [true, 'open', 'paid'] as ErpScalar[],
      }),
    );

    expect(sentDomain(calls[0]!)).toEqual([
      ['active', '=', true],
      ['state', 'in', ['open', 'paid']],
    ]);
  });

  it('throws on an out-of-range placeholder index (corrupt compiled query)', async () => {
    const { impl } = mockOdooFetch();
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    await expect(
      driver(compiled({ predicates: [{ field: 'id', op: 'eq', placeholders: [2] }], params: [1] })),
    ).rejects.toThrow(/placeholder 2.*out of range/);
  });
});

describe('createOdooErpDriver — JSON-RPC envelope + kwargs', () => {
  it('POSTs a JSON-RPC 2.0 execute_kw/search_read envelope with db, uid, apiKey and an id', async () => {
    const { impl, calls } = mockOdooFetch();
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    await driver(compiled());

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL_OK);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers['content-type']).toBe('application/json');
    const body = JSON.parse(calls[0]!.init.body) as Record<string, unknown>;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('call');
    expect(typeof body.id).toBe('number');
    const params = body.params as { service: string; method: string; args: unknown[] };
    expect(params.service).toBe('object');
    expect(params.method).toBe('execute_kw');
    expect(params.args.slice(0, 5)).toEqual(['prod', 7, API_KEY, 'partner', 'search_read']);
  });

  it('passes compiled fields and limit through as search_read kwargs', async () => {
    const { impl, calls } = mockOdooFetch();
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    await driver(compiled({ fields: ['id', 'name', 'email'], limit: 25 }));

    expect(sentArgs(calls[0]!)[6]).toEqual({ fields: ['id', 'name', 'email'], limit: 25 });
  });

  it('maps entity → Odoo model via entityModelMap, falling back to the entity name', async () => {
    const { impl, calls } = mockOdooFetch();
    const driver = createOdooErpDriver({
      ...BASE_OPTS,
      fetchImpl: impl,
      entityModelMap: { partner: 'res.partner' },
    });

    await driver(compiled({ entity: 'partner' }));
    await driver(compiled({ entity: 'invoice' }));

    expect(sentArgs(calls[0]!)[3]).toBe('res.partner'); // mapped
    expect(sentArgs(calls[1]!)[3]).toBe('invoice'); // unmapped → entity name
  });

  it('returns the JSON-RPC result array as ErpRow[]', async () => {
    const rows: ErpRow[] = [
      { id: 1, name: 'Acme' },
      { id: 2, name: 'Globex' },
    ];
    const { impl } = mockOdooFetch({ payload: { jsonrpc: '2.0', id: 1, result: rows } });
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    await expect(driver(compiled())).resolves.toEqual(rows);
  });
});

describe('createOdooErpDriver — error paths (apiKey never leaks)', () => {
  it('throws on an Odoo JSON-RPC error including error.data.message — WITHOUT the apiKey', async () => {
    const { impl } = mockOdooFetch({
      payload: {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: 200,
          message: 'Odoo Server Error',
          data: { name: 'odoo.exceptions.AccessError', message: 'Access denied to res.partner' },
        },
      },
    });
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    const failure = await driver(compiled()).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toContain('Odoo Server Error');
    expect(failure!.message).toContain('Access denied to res.partner');
    expect(failure!.message).not.toContain(API_KEY);
  });

  it('redacts a server-echoed apiKey out of the Odoo error message', async () => {
    const { impl } = mockOdooFetch({
      payload: {
        jsonrpc: '2.0',
        id: 1,
        error: { message: `invalid credentials: ${API_KEY}`, data: { message: 'check your key' } },
      },
    });
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    const failure = await driver(compiled()).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure!.message).not.toContain(API_KEY);
    expect(failure!.message).toContain('[redacted]');
  });

  it('throws on a non-2xx HTTP response with the status — WITHOUT the apiKey', async () => {
    const { impl } = mockOdooFetch({ status: 503 });
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    const failure = await driver(compiled()).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toContain('503');
    expect(failure!.message).not.toContain(API_KEY);
  });

  it('throws when the JSON-RPC response carries no array result', async () => {
    const { impl } = mockOdooFetch({ payload: { jsonrpc: '2.0', id: 1, result: 'nope' } });
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });

    await expect(driver(compiled())).rejects.toThrow(/no array `result`/);
  });

  it('refuses a compiled query that is not read-only (defence in depth)', async () => {
    const { impl, calls } = mockOdooFetch();
    const driver = createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl });
    const mutated = { ...compiled(), readOnly: false } as unknown as CompiledQuery;
    const wrongOp = { ...compiled(), operation: 'write' } as unknown as CompiledQuery;

    await expect(driver(mutated)).rejects.toThrow(/read-only/);
    await expect(driver(wrongOp)).rejects.toThrow(/read-only/);
    expect(calls).toHaveLength(0); // refused BEFORE any network call
  });
});

describe('createOdooErpDriver — eager wiring validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-http(s) and unparseable endpoint URLs at construction time', () => {
    const { impl } = mockOdooFetch();
    expect(() => createOdooErpDriver({ ...BASE_OPTS, url: 'ftp://erp.example.com/jsonrpc', fetchImpl: impl }))
      .toThrow(/unsupported protocol 'ftp:'/);
    expect(() => createOdooErpDriver({ ...BASE_OPTS, url: 'not a url', fetchImpl: impl }))
      .toThrow(/invalid endpoint URL/);
  });

  it('rejects empty db / non-integer uid / empty apiKey at construction time', () => {
    const { impl } = mockOdooFetch();
    expect(() => createOdooErpDriver({ ...BASE_OPTS, db: '', fetchImpl: impl })).toThrow(/db must be/);
    expect(() => createOdooErpDriver({ ...BASE_OPTS, uid: 1.5, fetchImpl: impl })).toThrow(/uid must be/);
    expect(() => createOdooErpDriver({ ...BASE_OPTS, apiKey: '', fetchImpl: impl })).toThrow(/apiKey must be/);
  });

  it('throws an explanatory error when no fetch is available (no fetchImpl, no global)', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => createOdooErpDriver({ ...BASE_OPTS })).toThrow(/no fetch available/);
  });
});

describe('createOdooErpDriver — end-to-end through the real ErpConnector', () => {
  it('round-trips a registered-entity query: connector compiles, driver hits Odoo, rows come back', async () => {
    const rows: ErpRow[] = [{ id: 5, name: 'Acme', email: 'hq@acme.test' }];
    const { impl, calls } = mockOdooFetch({ payload: { jsonrpc: '2.0', id: 1, result: rows } });
    const connector = createErpConnector({
      driver: createOdooErpDriver({ ...BASE_OPTS, fetchImpl: impl, entityModelMap: { partner: 'res.partner' } }),
      maxLimit: 100,
    }).registerEntity('partner', { fields: ['id', 'name', 'email', 'active'] });

    const result = await connector.query({
      entity: 'partner',
      fields: ['id', 'name', 'email'],
      filters: [
        { field: 'active', op: 'eq', value: true },
        { field: 'name', op: 'like', value: '%acme%' },
      ],
      limit: 10,
    });

    // The driver received the connector-compiled query translated to Odoo wire format…
    expect(sentArgs(calls[0]!)[3]).toBe('res.partner');
    expect(sentDomain(calls[0]!)).toEqual([
      ['active', '=', true],
      ['name', 'ilike', '%acme%'],
    ]);
    expect(sentArgs(calls[0]!)[6]).toEqual({ fields: ['id', 'name', 'email'], limit: 10 });
    // …and the rows flow back through the connector's audited result set.
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual(rows);
    expect(result.compiled.readOnly).toBe(true);
    expect(result.compiled.operation).toBe('read');
  });
});
