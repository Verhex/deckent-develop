// D4-3 — transport-client + CSP pins (node-env, hermetic):
//   * api-client: Bearer header on REST, ?token= + ?after= on the SSE URL,
//     404 → ApiError(status) so views can surface the run_flow_v2 flag
//     precondition honestly, named-SSE-event subscription set.
//   * security.ts buildLocalRendererCsp: connect-src extends to exactly the
//     active daemon origins while everything else stays 'self'.

import { describe, it, expect, vi } from 'vitest';
import { ApiError, buildEventsUrl, createApiClient } from '../src/renderer/shell/api-client.js';
import { buildLocalRendererCsp } from '../src/main/security.js';
import type { DaemonSession } from '../src/shared/desktop-api.js';

const SESSION: DaemonSession = { profileId: 'p-1', url: 'http://127.0.0.1:4317', apiToken: 'tok-123' };

function makeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  return { fetchFn, calls };
}

describe('api-client (D4-3)', () => {
  it('sends the Bearer token on REST calls and hits the documented endpoints', async () => {
    const { fetchFn, calls } = makeFetch(200, { flows: [] });
    const client = createApiClient(SESSION, fetchFn);
    await client.listFlows();
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/run-flow/list');
    expect((calls[0]!.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
  });

  it('POSTs propose/decision with JSON bodies', async () => {
    const { fetchFn, calls } = makeFetch(200, {});
    const client = createApiClient(SESSION, fetchFn);
    await client.propose('add auth');
    await client.decide('flow-1', 'approve');
    expect(calls[0]!.url).toContain('/api/run-flow/propose');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ intentSummary: 'add auth' });
    expect(calls[1]!.url).toContain('/api/run-flow/flow-1/decision');
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({ decision: 'approve' });
  });

  it('a 404 surfaces as ApiError(404) — the run_flow_v2 flag-off signal', async () => {
    const { fetchFn } = makeFetch(404, { error: 'Not found' });
    const client = createApiClient(SESSION, fetchFn);
    await expect(client.listFlows()).rejects.toMatchObject({ name: 'ApiError', status: 404 });
  });

  it('the approvals contract stays separate (poll endpoint, same auth)', async () => {
    const { fetchFn, calls } = makeFetch(200, { pending: [], approved: [], denied: [] });
    const client = createApiClient(SESSION, fetchFn);
    await client.getApprovals();
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/approvals');
  });

  it('decideApproval POSTs the broker decision endpoint with the server schema body (SURF-5)', async () => {
    const { fetchFn, calls } = makeFetch(200, { ok: true });
    const client = createApiClient(SESSION, fetchFn);
    await client.decideApproval('appr-1', 'allow');
    await client.decideApproval('appr-2', 'deny', 'not in scope');
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/api/approvals/appr-1/decision');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ decision: 'allow' });
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({ decision: 'deny', reason: 'not in scope' });
  });

  it('decideApproval 403 surfaces as ApiError(403) — the approval.api_decide flag-off signal (SURF-5)', async () => {
    const { fetchFn } = makeFetch(403, { error: 'approval.api_decide is disabled' });
    const client = createApiClient(SESSION, fetchFn);
    await expect(client.decideApproval('appr-1', 'allow')).rejects.toMatchObject({ name: 'ApiError', status: 403 });
  });

  it('buildEventsUrl carries ?token= (EventSource cannot set headers) and ?after= (replay cursor)', () => {
    const url = new URL(buildEventsUrl(SESSION, 'flow-9', 42));
    expect(url.pathname).toBe('/api/run-flow/flow-9/events');
    expect(url.searchParams.get('token')).toBe('tok-123');
    expect(url.searchParams.get('after')).toBe('42');
    // token omitted when the session has none — never an empty param
    const bare = new URL(buildEventsUrl({ ...SESSION, apiToken: undefined }, 'flow-9'));
    expect(bare.searchParams.has('token')).toBe(false);
    expect(bare.searchParams.has('after')).toBe(false);
  });

  it('openEvents subscribes to the NAMED RunFlow event types and parses frames into the callback', () => {
    const listeners = new Map<string, (e: { data: string }) => void>();
    class FakeEventSource {
      static last: FakeEventSource | undefined;
      url: string;
      closed = false;
      constructor(url: string) {
        this.url = url;
        FakeEventSource.last = this;
      }
      addEventListener(type: string, cb: (e: { data: string }) => void) {
        listeners.set(type, cb);
      }
      close() {
        this.closed = true;
      }
    }
    const client = createApiClient(SESSION, makeFetch(200, {}).fetchFn);
    const received: string[] = [];
    const close = client.openEvents('flow-1', (e) => received.push(e.type), {
      afterSequence: 0,
      EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
    });

    expect(listeners.has('RUN_STARTED')).toBe(true);
    expect(listeners.has('RUN_COMPLETED')).toBe(true);
    listeners.get('RUN_STARTED')!({ data: JSON.stringify({ type: 'RUN_STARTED', flowId: 'flow-1', timestamp: 't', sequence: 3 }) });
    expect(received).toEqual(['RUN_STARTED']);

    close();
    expect(FakeEventSource.last!.closed).toBe(true);
  });

  it('ApiError carries the status + a truncated server detail', async () => {
    const { fetchFn } = makeFetch(502, { error: 'preview generation failed' });
    const client = createApiClient(SESSION, fetchFn);
    const error = await client.propose('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('502');
  });
});

describe('buildLocalRendererCsp (D4-3 — approved transport decision)', () => {
  it('always allows the loopback port-wildcards (the connect flow enforces loopback-only)', () => {
    // NOT [::1]: Chromium rejects a bracketed-IPv6 wildcard source — an ::1
    // daemon joins via its exact dynamic origin instead (see builder note).
    expect(buildLocalRendererCsp([])).toBe(
      "default-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:*",
    );
  });

  it('a loopback daemon origin is already covered (no duplicate entry added)', () => {
    const csp = buildLocalRendererCsp(['http://127.0.0.1:4317']);
    expect(csp).not.toContain('http://127.0.0.1:4317');
    // everything else inherits default-src 'self' — no script/style loosening
    expect(csp).not.toContain('script-src');
    expect(csp).not.toContain('unsafe');
  });

  it('a future non-loopback (https/tunnel) origin joins dynamically', () => {
    const csp = buildLocalRendererCsp(['https://daemon.example:8443']);
    expect(csp).toContain('https://daemon.example:8443');
  });
});
