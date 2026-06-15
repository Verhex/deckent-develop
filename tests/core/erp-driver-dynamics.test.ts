// tests/core/erp-driver-dynamics.test.ts
// Sprint 268 T-005 — Dynamics 365 OData v4 read-only ErpDriver: CompiledQuery → Web API GET.
// Hermetic: fetch is always injected (mock) — no real network I/O.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDynamicsErpDriver, type DynamicsFetchLike } from '../../src/core/erp/dynamics/driver.js';
import {
  createErpConnector,
  type CompiledQuery,
  type ErpFilterOp,
  type ErpRow,
  type ErpScalar,
} from '../../src/core/erp/connector.js';

const BASE_URL = 'https://org.crm.dynamics.com';
const TOKEN = 'super-secret-dynamics-oauth-token';

const OPTS = { baseUrl: BASE_URL, auth: { kind: 'bearer', token: TOKEN } as const };

/** Mock fetch capturing every call; replies with a canned OData v4 payload. */
function mockDynamicsFetch(reply: { status?: number; payload?: unknown; bodyText?: string } = {}): {
  impl: DynamicsFetchLike;
  calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }>;
} {
  const status = reply.status ?? 200;
  const payload = reply.payload ?? { value: [] };
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> = [];
  const impl: DynamicsFetchLike = async (url, init) => {
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
    entity: 'account',
    source: 'account',
    fields: ['accountid', 'name'],
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

describe('createDynamicsErpDriver — $filter translation (OData v4)', () => {
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
      const { impl, calls } = mockDynamicsFetch();
      const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

      await driver(
        compiled({
          predicates: [{ field: 'revenue', op, placeholders: [1] }],
          params: [42],
        }),
      );

      expect(sentFilter(calls[0]!)).toBe(`revenue ${odataOp} 42`);
    },
  );

  it("translates op 'in' to the NATIVE v4 in operator — f in ('a','b') — not an or-chain", async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [{ field: 'statecode', op: 'in', placeholders: [1, 2, 3] }],
        params: ['draft', 'open', 'paid'],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe("statecode in ('draft','open','paid')");
  });

  it("renders numeric members of an 'in' list raw (unquoted)", async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [{ field: 'statecode', op: 'in', placeholders: [1, 2] }],
        params: [0, 1],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe('statecode in (0,1)');
  });

  it("translates op 'like' to the v4 string function contains(field,'value')", async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [{ field: 'name', op: 'like', placeholders: [1] }],
        params: ['acme'],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe("contains(name,'acme')");
  });

  it("escapes embedded single quotes as '' in string literals (OData injection guard)", async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [
          { field: 'name', op: 'eq', placeholders: [1] },
          { field: 'city', op: 'like', placeholders: [2] },
          { field: 'statecode', op: 'in', placeholders: [3] },
        ],
        params: ["O'Reilly", "l'Aquila' or 1 eq 1", "x') or ('a' eq 'a"],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe(
      "name eq 'O''Reilly' and contains(city,'l''Aquila'' or 1 eq 1') and statecode in ('x'') or (''a'' eq ''a')",
    );
  });

  it('emits numbers and booleans raw (unquoted) and null as the keyword', async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [
          { field: 'isprivate', op: 'eq', placeholders: [1] },
          { field: 'revenue', op: 'gte', placeholders: [2] },
          { field: 'parentaccountid', op: 'ne', placeholders: [3] },
        ],
        params: [true, 99.5, null] as ErpScalar[],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe('isprivate eq true and revenue ge 99.5 and parentaccountid ne null');
  });

  it("joins multiple predicates with ' and ' (AND semantics) across one shared params list", async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(
      compiled({
        predicates: [
          { field: 'isprivate', op: 'eq', placeholders: [1] },
          { field: 'statecode', op: 'in', placeholders: [2, 3] },
        ],
        params: [true, 'open', 'paid'] as ErpScalar[],
      }),
    );

    expect(sentFilter(calls[0]!)).toBe("isprivate eq true and statecode in ('open','paid')");
  });

  it('omits $filter entirely when the compiled query carries no predicates', async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(compiled());

    expect(new URL(calls[0]!.url).searchParams.has('$filter')).toBe(false);
  });

  it('throws on an out-of-range placeholder index (corrupt compiled query)', async () => {
    const { impl } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await expect(
      driver(compiled({ predicates: [{ field: 'accountid', op: 'eq', placeholders: [2] }], params: [1] })),
    ).rejects.toThrow(/placeholder 2.*out of range/);
  });
});

describe('createDynamicsErpDriver — request shape (Web API path, $select/$top, GET)', () => {
  it('issues a GET against <baseUrl>/api/data/v9.2/<EntitySet> with $select and $top (no v2 $format)', async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(compiled({ fields: ['accountid', 'name', 'emailaddress1'], limit: 25 }));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe('GET');
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/data/v9.2/account');
    expect(url.searchParams.get('$select')).toBe('accountid,name,emailaddress1');
    expect(url.searchParams.get('$top')).toBe('25');
    // v4 responses are JSON-native — the v2-era $format=json knob must not be sent.
    expect(url.searchParams.has('$format')).toBe(false);
  });

  it('honors an apiVersion override in the Web API path', async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl, apiVersion: '9.0' });

    await driver(compiled());

    expect(new URL(calls[0]!.url).pathname).toBe('/api/data/v9.0/account');
  });

  it('maps entity → entity set via entityModelMap, falling back to the entity name', async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({
      ...OPTS,
      fetchImpl: impl,
      entityModelMap: { partner: 'accounts' },
    });

    await driver(compiled({ entity: 'partner' }));
    await driver(compiled({ entity: 'contact' }));

    expect(new URL(calls[0]!.url).pathname).toBe('/api/data/v9.2/accounts'); // mapped
    expect(new URL(calls[1]!.url).pathname).toBe('/api/data/v9.2/contact'); // unmapped → entity name
  });

  it('joins the Web API path onto baseUrl without doubling a trailing slash', async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, baseUrl: `${BASE_URL}/`, fetchImpl: impl });

    await driver(compiled());

    expect(calls[0]!.url.startsWith(`${BASE_URL}/api/data/v9.2/account?`)).toBe(true);
  });
});

describe('createDynamicsErpDriver — authentication + OData v4 headers', () => {
  it('sends Bearer <token> plus OData-MaxVersion/OData-Version 4.0 and Accept application/json', async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await driver(compiled());

    const headers = calls[0]!.init.headers;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers['OData-MaxVersion']).toBe('4.0');
    expect(headers['OData-Version']).toBe('4.0');
    expect(headers.accept).toBe('application/json');
  });
});

describe('createDynamicsErpDriver — response envelope (v4 value only)', () => {
  const ROWS: ErpRow[] = [
    { accountid: 'a-1', name: 'Acme' },
    { accountid: 'a-2', name: 'Globex' },
  ];

  it('unwraps the OData v4 envelope { value: [...] } to ErpRow[]', async () => {
    const { impl } = mockDynamicsFetch({ payload: { value: ROWS } });
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await expect(driver(compiled())).resolves.toEqual(ROWS);
  });

  it('throws when the response carries no v4 value rows (v2 d.results is NOT accepted)', async () => {
    const { impl } = mockDynamicsFetch({ payload: { d: { results: ROWS } } });
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await expect(driver(compiled())).rejects.toThrow(/v4 `value`/);
  });

  it('throws when the 2xx response body is not valid JSON', async () => {
    const impl: DynamicsFetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
      text: async () => '<html>gateway error</html>',
    });
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    await expect(driver(compiled())).rejects.toThrow(/not valid JSON/);
  });
});

describe('createDynamicsErpDriver — error paths (secrets never leak)', () => {
  it('throws on a non-2xx HTTP response with the status and a redacted body snippet', async () => {
    const { impl } = mockDynamicsFetch({
      status: 401,
      bodyText: `Unauthorized: bearer ${TOKEN} rejected by Azure AD`,
    });
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });

    const failure = await driver(compiled()).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toContain('401');
    expect(failure!.message).not.toContain(TOKEN);
    expect(failure!.message).toContain('[redacted]');
  });

  it('refuses a compiled query that is not read-only (defence in depth, before any network call)', async () => {
    const { impl, calls } = mockDynamicsFetch();
    const driver = createDynamicsErpDriver({ ...OPTS, fetchImpl: impl });
    const mutated = { ...compiled(), readOnly: false } as unknown as CompiledQuery;
    const wrongOp = { ...compiled(), operation: 'write' } as unknown as CompiledQuery;

    await expect(driver(mutated)).rejects.toThrow(/read-only/);
    await expect(driver(wrongOp)).rejects.toThrow(/read-only/);
    expect(calls).toHaveLength(0); // refused BEFORE any network call
  });
});

describe('createDynamicsErpDriver — eager wiring validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-http(s) and unparseable baseUrl at construction time', () => {
    const { impl } = mockDynamicsFetch();
    expect(() => createDynamicsErpDriver({ ...OPTS, baseUrl: 'ftp://org.crm.dynamics.com', fetchImpl: impl }))
      .toThrow(/unsupported protocol 'ftp:'/);
    expect(() => createDynamicsErpDriver({ ...OPTS, baseUrl: 'not a url', fetchImpl: impl }))
      .toThrow(/invalid baseUrl/);
  });

  it('rejects an empty bearer token and a non-bearer auth kind (bearer-only driver)', () => {
    const { impl } = mockDynamicsFetch();
    expect(() =>
      createDynamicsErpDriver({ baseUrl: BASE_URL, auth: { kind: 'bearer', token: '' }, fetchImpl: impl }),
    ).toThrow(/non-empty token/);
    expect(() =>
      createDynamicsErpDriver({
        baseUrl: BASE_URL,
        auth: { kind: 'basic', username: 'u', password: 'p' } as unknown as { kind: 'bearer'; token: string },
        fetchImpl: impl,
      }),
    ).toThrow(/bearer/);
  });

  it('rejects a malformed apiVersion at construction time', () => {
    const { impl } = mockDynamicsFetch();
    expect(() => createDynamicsErpDriver({ ...OPTS, fetchImpl: impl, apiVersion: 'v9.2' })).toThrow(/apiVersion/);
    expect(() => createDynamicsErpDriver({ ...OPTS, fetchImpl: impl, apiVersion: '9.2/evil' })).toThrow(/apiVersion/);
  });

  it('throws an explanatory error when no fetch is available (no fetchImpl, no global)', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => createDynamicsErpDriver({ ...OPTS })).toThrow(/no fetch available/);
  });
});

describe('createDynamicsErpDriver — end-to-end through the real ErpConnector', () => {
  it('round-trips a registered-entity query: connector compiles, driver hits the Web API, rows come back', async () => {
    const rows: ErpRow[] = [{ accountid: 'a-5', name: 'Acme', emailaddress1: 'hq@acme.test' }];
    const { impl, calls } = mockDynamicsFetch({ payload: { value: rows } });
    const connector = createErpConnector({
      driver: createDynamicsErpDriver({
        ...OPTS,
        fetchImpl: impl,
        entityModelMap: { account: 'accounts' },
      }),
      maxLimit: 100,
    }).registerEntity('account', { fields: ['accountid', 'name', 'emailaddress1', 'statecode'] });

    const result = await connector.query({
      entity: 'account',
      fields: ['accountid', 'name', 'emailaddress1'],
      filters: [
        { field: 'statecode', op: 'in', value: [0, 1] },
        { field: 'name', op: 'like', value: 'acme' },
      ],
      limit: 10,
    });

    // The driver received the connector-compiled query translated to the v4 wire format…
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/data/v9.2/accounts');
    expect(url.searchParams.get('$filter')).toBe("statecode in (0,1) and contains(name,'acme')");
    expect(url.searchParams.get('$select')).toBe('accountid,name,emailaddress1');
    expect(url.searchParams.get('$top')).toBe('10');
    // …and the rows flow back through the connector's audited result set.
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual(rows);
    expect(result.compiled.readOnly).toBe(true);
    expect(result.compiled.operation).toBe('read');
  });
});
