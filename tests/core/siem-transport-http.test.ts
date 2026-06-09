// tests/core/siem-transport-http.test.ts
// ENT-5 — HTTP SIEM transport: POST batches as JSON to an HTTP(S) endpoint.
// Hermetic: fetch is always injected (mock) — no real network I/O.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpSiemTransport, type SiemFetchLike } from '../../src/core/siem-transport-http.js';
import type { SiemRecord } from '../../src/core/siem-forwarder.js';

const URL_OK = 'https://siem.example.com/ingest';

function record(overrides: Partial<SiemRecord> = {}): SiemRecord {
  return {
    ts: '2026-06-09T00:00:00.000Z',
    actor: 'system',
    action: 'capability.success',
    outcome: 'success',
    ...overrides,
  };
}

function mockFetch(status = 200): { impl: SiemFetchLike; calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> } {
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> = [];
  const impl: SiemFetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status };
  };
  return { impl, calls };
}

describe('createHttpSiemTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the batch as a JSON array with content-type application/json (2xx ok)', async () => {
    const { impl, calls } = mockFetch(200);
    const transport = createHttpSiemTransport({ url: URL_OK, fetchImpl: impl });
    const batch = [record(), record({ actor: 'cli', action: 'rbac.denied', outcome: 'error' })];

    await expect(transport(batch)).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL_OK);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0]!.init.body)).toEqual(batch);
  });

  it('throws on a non-2xx response with the status in the message (no internal retry)', async () => {
    const { impl, calls } = mockFetch(500);
    const transport = createHttpSiemTransport({ url: URL_OK, fetchImpl: impl });

    await expect(transport([record()])).rejects.toThrow(/500/);
    // No retry inside the transport — the forwarder owns retry/drop semantics.
    expect(calls).toHaveLength(1);
  });

  it('throws at creation time on a malformed URL', () => {
    const { impl } = mockFetch(200);
    expect(() => createHttpSiemTransport({ url: 'not a url', fetchImpl: impl })).toThrow(/url/i);
  });

  it('throws at creation time on a non-http(s) scheme', () => {
    const { impl } = mockFetch(200);
    expect(() => createHttpSiemTransport({ url: 'ftp://siem.example.com/ingest', fetchImpl: impl })).toThrow(/http/i);
  });

  it('passes custom headers through alongside the JSON content-type', async () => {
    const { impl, calls } = mockFetch(200);
    const transport = createHttpSiemTransport({
      url: URL_OK,
      headers: { authorization: 'Bearer tok-123', 'x-tenant': 'acme' },
      fetchImpl: impl,
    });

    await transport([record()]);

    expect(calls[0]!.init.headers).toMatchObject({
      'content-type': 'application/json',
      authorization: 'Bearer tok-123',
      'x-tenant': 'acme',
    });
  });

  it('throws an explanatory error when no fetchImpl is given and globalThis.fetch is missing', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => createHttpSiemTransport({ url: URL_OK })).toThrow(/fetch/i);
  });

  it('skips the network call entirely for an empty batch', async () => {
    const { impl, calls } = mockFetch(200);
    const transport = createHttpSiemTransport({ url: URL_OK, fetchImpl: impl });

    await expect(transport([])).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('propagates fetch rejections (network errors) to the caller', async () => {
    const impl: SiemFetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    const transport = createHttpSiemTransport({ url: URL_OK, fetchImpl: impl });

    await expect(transport([record()])).rejects.toThrow('ECONNREFUSED');
  });
});
