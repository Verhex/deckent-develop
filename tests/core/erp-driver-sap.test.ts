// tests/core/erp-driver-sap.test.ts
// Sprint 267 T-002 — SAP OData read-only ErpDriver: CompiledQuery → OData GET.
// Hermetic: fetch is always injected (mock) — no real network I/O.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSapErpDriver, type SapFetchLike } from '../../src/core/erp/sap/driver.js';
import {
  createErpConnector,
  type CompiledQuery,
  type ErpFilterOp,
  type ErpRow,
  type ErpScalar,
} from '../../src/core/erp/connector.js';

const BASE_URL = 'https://sap.example.com/sap/opu/odata/sap/API_TEST';
const PASSWORD = 'super-secret-sap-password';
const TOKEN = 'super-secret-sap-token';

const BASIC_OPTS = { baseUrl: BASE_URL, auth: { kind: 'basic', username: 'svc-user', password: PASSWORD } as const };
const BEARER_OPTS = { baseUrl: BASE_URL, auth: { kind: 'bearer', token: TOKEN } as const };

/** Mock fetch capturing every call; replies with a canned OData payload. */
function mockSapFetch(reply: { status?: number; payload?: unknown; bodyText?: string } = {}): {
  impl: SapFetchLike;
  calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }>;
} {
  const status = reply.status ?? 200;
  const payload = reply.payload ?? { value: [] };
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> = [];
  const impl: SapFetchLike = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => reply.bodyText ?? JSON.stringify(payload),
    };
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

/** Decoded `$filter` query parameter of the captured request URL. */
function sentFilter(call: { url: string }): string | null {
  return new URL(call.url).searchParams.get('$filter');
}

describe('createSapErpDriver — $filter translation', () => {
  const SCALAR_OPS: Array<[ErpFilterOp, string]> = [
    ['eq', 'eq'],
    ['ne', 'ne'],
    ['gt', 'gt'],
    ['gte', 'ge'],
    ['lt', 'lt'],
    ['lte', 'le'],
  ];

  it.each(SCALAR_OPS)(
    "translates scalar op '%s' to OData operator '%s' with the 1-based-resolved param",
    async (op, odataOp) => {
      const { impl, calls } = mockSapFetch();
      const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

      await driver(
        compiled({
          predicates: [{ field: 'amount', op, placeholders: [1] }],
          params: [42],
        }),
      );

      expect(sentFilter(calls[0]!)).toBe(`amount ${odataOp} 42`);
    },
  );

  it("translates op 'in' to a parenthesized eq-or-chain (no native v2 'in')", async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [{ field: 'state', op: 'in', placeholders: [1, 2, 3] }],
        params: ['draft', 'open', 'paid'],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe("(state eq 'draft' or state eq 'open' or state eq 'paid')");
  });

  it("translates op 'like' to OData v2 substringof('needle', field)", async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [{ field: 'name', op: 'like', placeholders: [1] }],
        params: ['acme'],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe("substringof('acme', name)");
  });

  it("escapes embedded single quotes as '' in string literals (OData injection guard)", async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [
          { field: 'name', op: 'eq', placeholders: [1] },
          { field: 'city', op: 'like', placeholders: [2] },
        ],
        params: ["O'Reilly", "l'Aquila' or 1 eq 1"],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe(
      "name eq 'O''Reilly' and substringof('l''Aquila'' or 1 eq 1', city)",
    );
  });

  it('emits numbers and booleans raw (unquoted) and null as the keyword', async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [
          { field: 'active', op: 'eq', placeholders: [1] },
          { field: 'amount', op: 'gte', placeholders: [2] },
          { field: 'parent', op: 'ne', placeholders: [3] },
        ],
        params: [true, 99.5, null] as ErpScalar[],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe('active eq true and amount ge 99.5 and parent ne null');
  });

  it("joins multiple predicates with ' and ' (AND semantics) across one shared params list", async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [
          { field: 'active', op: 'eq', placeholders: [1] },
          { field: 'state', op: 'in', placeholders: [2, 3] },
        ],
        params: [true, 'open', 'paid'] as ErpScalar[],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe("active eq true and (state eq 'open' or state eq 'paid')");
  });

  it('omits $filter entirely when the compiled query carries no predicates', async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await driver(compiled());

    expect(new URL(calls[0]!.url).searchParams.has('$filter')).toBe(false);
  });

  it('throws on an out-of-range placeholder index (corrupt compiled query)', async () => {
    const { impl } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await expect(
      driver(compiled({ predicates: [{ field: 'id', op: 'eq', placeholders: [2] }], params: [1] })),
    ).rejects.toThrow(/placeholder 2.*out of range/);
  });
});

describe('createSapErpDriver — request shape ($select/$top/$format, GET, entity set)', () => {
  it('issues a GET with $select from compiled fields, $top from limit, and $format=json', async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await driver(compiled({ fields: ['id', 'name', 'email'], limit: 25 }));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe('GET');
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get('$select')).toBe('id,name,email');
    expect(url.searchParams.get('$top')).toBe('25');
    expect(url.searchParams.get('$format')).toBe('json');
  });

  it('maps entity → OData entity set via entityModelMap, falling back to the entity name', async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({
      ...BASIC_OPTS,
      fetchImpl: impl,
      entityModelMap: { partner: 'A_BusinessPartner' },
    });

    await driver(compiled({ entity: 'partner' }));
    await driver(compiled({ entity: 'invoice' }));

    expect(new URL(calls[0]!.url).pathname.endsWith('/A_BusinessPartner')).toBe(true); // mapped
    expect(new URL(calls[1]!.url).pathname.endsWith('/invoice')).toBe(true); // unmapped → entity name
  });

  it('joins entity set onto baseUrl without doubling a trailing slash', async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, baseUrl: `${BASE_URL}/`, fetchImpl: impl });

    await driver(compiled());

    expect(calls[0]!.url.startsWith(`${BASE_URL}/partner?`)).toBe(true);
  });
});

describe('createSapErpDriver — authentication headers', () => {
  it('sends Basic base64(user:pass) for basic auth', async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await driver(compiled());

    const expected = `Basic ${Buffer.from(`svc-user:${PASSWORD}`).toString('base64')}`;
    expect(calls[0]!.init.headers.authorization).toBe(expected);
    expect(calls[0]!.init.headers.accept).toBe('application/json');
  });

  it('sends Bearer <token> for bearer auth', async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BEARER_OPTS, fetchImpl: impl });

    await driver(compiled());

    expect(calls[0]!.init.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe('createSapErpDriver — response envelopes (v2 + v4)', () => {
  const ROWS: ErpRow[] = [
    { id: 1, name: 'Acme' },
    { id: 2, name: 'Globex' },
  ];

  it('unwraps the OData v2 envelope { d: { results: [...] } } to ErpRow[]', async () => {
    const { impl } = mockSapFetch({ payload: { d: { results: ROWS } } });
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await expect(driver(compiled())).resolves.toEqual(ROWS);
  });

  it('unwraps the OData v4 envelope { value: [...] } to ErpRow[]', async () => {
    const { impl } = mockSapFetch({ payload: { value: ROWS } });
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await expect(driver(compiled())).resolves.toEqual(ROWS);
  });

  it('throws when the response carries neither v2 d.results nor v4 value rows', async () => {
    const { impl } = mockSapFetch({ payload: { d: 'nope' } });
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await expect(driver(compiled())).rejects.toThrow(/neither v2 `d\.results` nor v4 `value`/);
  });
});

describe('createSapErpDriver — error paths (secrets never leak)', () => {
  it('throws on a non-2xx HTTP response with the status and a redacted body snippet', async () => {
    const { impl } = mockSapFetch({
      status: 403,
      bodyText: `Forbidden: credentials ${PASSWORD} rejected by gateway`,
    });
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    const failure = await driver(compiled()).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toContain('403');
    expect(failure!.message).not.toContain(PASSWORD);
    expect(failure!.message).toContain('[redacted]');
  });

  it('redacts a server-echoed bearer token out of the error body', async () => {
    const { impl } = mockSapFetch({ status: 401, bodyText: `invalid token: ${TOKEN}` });
    const driver = createSapErpDriver({ ...BEARER_OPTS, fetchImpl: impl });

    const failure = await driver(compiled()).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure!.message).not.toContain(TOKEN);
    expect(failure!.message).toContain('[redacted]');
  });

  it('throws when the 2xx response body is not valid JSON', async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> = [];
    const impl: SapFetchLike = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
        text: async () => '<html>gateway error</html>',
      };
    };
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });

    await expect(driver(compiled())).rejects.toThrow(/not valid JSON/);
  });

  it('refuses a compiled query that is not read-only (defence in depth)', async () => {
    const { impl, calls } = mockSapFetch();
    const driver = createSapErpDriver({ ...BASIC_OPTS, fetchImpl: impl });
    const mutated = { ...compiled(), readOnly: false } as unknown as CompiledQuery;
    const wrongOp = { ...compiled(), operation: 'write' } as unknown as CompiledQuery;

    await expect(driver(mutated)).rejects.toThrow(/read-only/);
    await expect(driver(wrongOp)).rejects.toThrow(/read-only/);
    expect(calls).toHaveLength(0); // refused BEFORE any network call
  });
});

describe('createSapErpDriver — eager wiring validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-http(s) and unparseable baseUrl at construction time', () => {
    const { impl } = mockSapFetch();
    expect(() => createSapErpDriver({ ...BASIC_OPTS, baseUrl: 'ftp://sap.example.com/odata', fetchImpl: impl }))
      .toThrow(/unsupported protocol 'ftp:'/);
    expect(() => createSapErpDriver({ ...BASIC_OPTS, baseUrl: 'not a url', fetchImpl: impl }))
      .toThrow(/invalid baseUrl/);
  });

  it('rejects empty basic username/password, empty bearer token, and unknown auth kind', () => {
    const { impl } = mockSapFetch();
    expect(() =>
      createSapErpDriver({ baseUrl: BASE_URL, auth: { kind: 'basic', username: '', password: 'x' }, fetchImpl: impl }),
    ).toThrow(/non-empty username/);
    expect(() =>
      createSapErpDriver({ baseUrl: BASE_URL, auth: { kind: 'basic', username: 'u', password: '' }, fetchImpl: impl }),
    ).toThrow(/non-empty password/);
    expect(() =>
      createSapErpDriver({ baseUrl: BASE_URL, auth: { kind: 'bearer', token: '' }, fetchImpl: impl }),
    ).toThrow(/non-empty token/);
    expect(() =>
      createSapErpDriver({
        baseUrl: BASE_URL,
        auth: { kind: 'digest' } as unknown as { kind: 'bearer'; token: string },
        fetchImpl: impl,
      }),
    ).toThrow(/auth\.kind must be/);
  });

  it('throws an explanatory error when no fetch is available (no fetchImpl, no global)', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => createSapErpDriver({ ...BASIC_OPTS })).toThrow(/no fetch available/);
  });
});

describe('createSapErpDriver — end-to-end through the real ErpConnector', () => {
  it('round-trips a registered-entity query: connector compiles, driver hits OData, rows come back', async () => {
    const rows: ErpRow[] = [{ id: 5, name: 'Acme', email: 'hq@acme.test' }];
    const { impl, calls } = mockSapFetch({ payload: { d: { results: rows } } });
    const connector = createErpConnector({
      driver: createSapErpDriver({
        ...BASIC_OPTS,
        fetchImpl: impl,
        entityModelMap: { partner: 'A_BusinessPartner' },
      }),
      maxLimit: 100,
    }).registerEntity('partner', { fields: ['id', 'name', 'email', 'active'] });

    const result = await connector.query({
      entity: 'partner',
      fields: ['id', 'name', 'email'],
      filters: [
        { field: 'active', op: 'eq', value: true },
        { field: 'name', op: 'like', value: 'acme' },
      ],
      limit: 10,
    });

    // The driver received the connector-compiled query translated to OData wire format…
    const url = new URL(calls[0]!.url);
    expect(url.pathname.endsWith('/A_BusinessPartner')).toBe(true);
    expect(url.searchParams.get('$filter')).toBe("active eq true and substringof('acme', name)");
    expect(url.searchParams.get('$select')).toBe('id,name,email');
    expect(url.searchParams.get('$top')).toBe('10');
    // …and the rows flow back through the connector's audited result set.
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual(rows);
    expect(result.compiled.readOnly).toBe(true);
    expect(result.compiled.operation).toBe('read');
  });
});
