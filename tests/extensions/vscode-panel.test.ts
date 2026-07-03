// Task 363-012: rpc-bridge (TERM-RPC HTTP client) + deckent-panel (webview
// data-binding) — node-side unit tests with a mocked fetch and a mocked
// webview (no real VS Code host, no real network).

import { describe, it, expect, vi } from 'vitest';
import { RpcBridge, type RpcBridgeResult } from '../../src/extensions/vscode/src/rpc-bridge.js';
import {
  loadPanelData,
  refreshPanel,
  renderPanelHtml,
  PANEL_MESSAGE_TYPE,
  type PanelHost,
  type DeckentPanelData,
} from '../../src/extensions/vscode/src/deckent-panel.js';
import { TERM_RPC_VERSION, type RpcResponse } from '../../src/core/term-rpc.js';

// ─── fetch mocks (mirrors tests/catalog/enrichment-sources.test.ts convention) ─

function mockFetch(response: RpcResponse, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => JSON.stringify(response),
  }) as unknown as typeof globalThis.fetch;
}

function mockFetchRaw(bodyText: string, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => bodyText,
  }) as unknown as typeof globalThis.fetch;
}

function failingFetch(message = 'network error'): typeof globalThis.fetch {
  return vi.fn().mockRejectedValue(new Error(message)) as unknown as typeof globalThis.fetch;
}

function okResponse(result: unknown): RpcResponse {
  return { id: 'ignored-by-client', version: TERM_RPC_VERSION, result };
}

function errorResponse(message: string): RpcResponse {
  return {
    id: 'ignored-by-client',
    version: TERM_RPC_VERSION,
    error: { code: 'INTERNAL_ERROR', message },
  };
}

// ─── RpcBridge — 4 read methods ─────────────────────────────────────────────────

describe('RpcBridge', () => {
  describe('getRunStatus (run.status)', () => {
    it('posts a well-formed envelope and returns the typed result', async () => {
      const result = {
        runId: 'run-1',
        state: 'running' as const,
        startedAt: '2026-07-03T00:00:00.000Z',
        finishedAt: null,
        exitCode: null,
      };
      const fetchFn = mockFetch(okResponse(result));
      const bridge = new RpcBridge({ baseUrl: 'http://127.0.0.1:3100', token: 'tok-123', fetchFn });

      const out = await bridge.getRunStatus('run-1');

      expect(out).toEqual({ ok: true, value: result });
      expect(fetchFn).toHaveBeenCalledOnce();
      const [url, init] = vi.mocked(fetchFn).mock.calls[0]!;
      expect(url).toBe('http://127.0.0.1:3100/api/rpc');
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer tok-123');
      const body = JSON.parse(init?.body as string) as { method: string; params: unknown; version: string };
      expect(body.method).toBe('run.status');
      expect(body.params).toEqual({ runId: 'run-1' });
      expect(body.version).toBe(TERM_RPC_VERSION);
    });

    it('omits Authorization header when no token is configured', async () => {
      const fetchFn = mockFetch(
        okResponse({ runId: 'r', state: 'pending', startedAt: null, finishedAt: null, exitCode: null }),
      );
      const bridge = new RpcBridge({ fetchFn });
      await bridge.getRunStatus('r');
      const [, init] = vi.mocked(fetchFn).mock.calls[0]!;
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('listSessions (session.list)', () => {
    it('sends empty params and returns the sessions array', async () => {
      const result = {
        sessions: [
          {
            sessionId: 's1',
            label: 'main',
            status: 'active' as const,
            createdAt: '2026-07-03T00:00:00.000Z',
            lastActivityAt: '2026-07-03T00:00:01.000Z',
          },
        ],
      };
      const fetchFn = mockFetch(okResponse(result));
      const bridge = new RpcBridge({ fetchFn });

      const out = await bridge.listSessions();

      expect(out).toEqual({ ok: true, value: result });
      const [, init] = vi.mocked(fetchFn).mock.calls[0]!;
      const body = JSON.parse(init?.body as string) as { method: string; params: unknown };
      expect(body.method).toBe('session.list');
      expect(body.params).toEqual({});
    });
  });

  describe('getLimits (limits.get)', () => {
    it('returns the limits record', async () => {
      const result = { limits: { dailyTokens: 1000, used: 42 } };
      const fetchFn = mockFetch(okResponse(result));
      const bridge = new RpcBridge({ fetchFn });

      const out = await bridge.getLimits();

      expect(out).toEqual({ ok: true, value: result });
    });

    it('surfaces a structured RPC-level error without throwing', async () => {
      const fetchFn = mockFetch(errorResponse('limits backend unavailable'));
      const bridge = new RpcBridge({ fetchFn });

      const out = (await bridge.getLimits()) as RpcBridgeResult<unknown>;

      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error).toEqual({
          kind: 'rpc',
          error: { code: 'INTERNAL_ERROR', message: 'limits backend unavailable' },
        });
      }
    });
  });

  describe('listApprovals (approval.list)', () => {
    it('forwards an explicit scopeId', async () => {
      const result = { approvals: [{ id: 'a1' }] };
      const fetchFn = mockFetch(okResponse(result));
      const bridge = new RpcBridge({ fetchFn });

      const out = await bridge.listApprovals('scope-1');

      expect(out).toEqual({ ok: true, value: result });
      const [, init] = vi.mocked(fetchFn).mock.calls[0]!;
      const body = JSON.parse(init?.body as string) as { params: unknown };
      expect(body.params).toEqual({ scopeId: 'scope-1' });
    });

    it('omits scopeId from params when not provided', async () => {
      const fetchFn = mockFetch(okResponse({ approvals: [] }));
      const bridge = new RpcBridge({ fetchFn });
      await bridge.listApprovals();
      const [, init] = vi.mocked(fetchFn).mock.calls[0]!;
      const body = JSON.parse(init?.body as string) as { params: unknown };
      expect(body.params).toEqual({});
    });

    it('returns a transport error on network failure (fetch rejects)', async () => {
      const bridge = new RpcBridge({ fetchFn: failingFetch('ECONNREFUSED') });

      const out = (await bridge.listApprovals()) as RpcBridgeResult<unknown>;

      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error.kind).toBe('transport');
        expect(out.error).toMatchObject({ message: 'ECONNREFUSED' });
      }
    });

    it('returns a transport error on non-2xx HTTP status', async () => {
      const bridge = new RpcBridge({ fetchFn: mockFetchRaw('{"error":"unauthorized"}', 401) });

      const out = (await bridge.listApprovals()) as RpcBridgeResult<unknown>;

      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error.kind).toBe('transport');
        if (out.error.kind === 'transport') expect(out.error.status).toBe(401);
      }
    });

    it('returns a transport error on a malformed (schema-invalid) 200 response body', async () => {
      const bridge = new RpcBridge({ fetchFn: mockFetchRaw('{"not":"an rpc envelope"}', 200) });

      const out = (await bridge.listApprovals()) as RpcBridgeResult<unknown>;

      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error.kind).toBe('transport');
        expect(out.error.message).toContain('malformed RPC response');
      }
    });
  });
});

// ─── deckent-panel — data-binding ────────────────────────────────────────────────

function makeBridgeStub(overrides: Partial<Record<'getRunStatus' | 'listSessions' | 'getLimits' | 'listApprovals', unknown>> = {}) {
  return {
    getRunStatus: vi.fn().mockResolvedValue({
      ok: true,
      value: { runId: 'r1', state: 'running', startedAt: null, finishedAt: null, exitCode: null },
    }),
    listSessions: vi.fn().mockResolvedValue({ ok: true, value: { sessions: [] } }),
    getLimits: vi.fn().mockResolvedValue({ ok: true, value: { limits: {} } }),
    listApprovals: vi.fn().mockResolvedValue({ ok: true, value: { approvals: [] } }),
    ...overrides,
  } as unknown as RpcBridge;
}

describe('loadPanelData', () => {
  it('binds all 4 sections and stamps fetchedAt from the injected clock', async () => {
    const bridge = makeBridgeStub();

    const data = await loadPanelData(bridge, { runId: 'r1', now: () => '2026-07-03T12:00:00.000Z' });

    expect(data.fetchedAt).toBe('2026-07-03T12:00:00.000Z');
    expect(data.runStatus.data).toEqual({ runId: 'r1', state: 'running', startedAt: null, finishedAt: null, exitCode: null });
    expect(data.sessions.data).toEqual({ sessions: [] });
    expect(data.limits.data).toEqual({ limits: {} });
    expect(data.approvals.data).toEqual({ approvals: [] });
  });

  it('skips the run.status call and leaves runStatus empty when runId is omitted', async () => {
    const bridge = makeBridgeStub();

    const data = await loadPanelData(bridge, {});

    expect(data.runStatus).toEqual({ data: null, error: null });
    expect((bridge.getRunStatus as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('folds a failing section into PanelSection.error without discarding the others', async () => {
    const bridge = makeBridgeStub({
      getLimits: vi.fn().mockResolvedValue({ ok: false, error: { kind: 'transport', message: 'boom' } }),
    });

    const data = await loadPanelData(bridge, { runId: 'r1' });

    expect(data.limits).toEqual({ data: null, error: { kind: 'transport', message: 'boom' } });
    expect(data.sessions.error).toBeNull();
    expect(data.sessions.data).toEqual({ sessions: [] });
  });
});

describe('refreshPanel', () => {
  it('posts a deckent.panelData message to the webview and returns the data', async () => {
    const bridge = makeBridgeStub();
    const postMessage = vi.fn();
    const host: PanelHost = { webview: { postMessage } };

    const data = await refreshPanel(host, bridge, { runId: 'r1', now: () => '2026-07-03T12:00:00.000Z' });

    expect(postMessage).toHaveBeenCalledOnce();
    const [message] = postMessage.mock.calls[0] as [{ type: string; data: DeckentPanelData }];
    expect(message.type).toBe(PANEL_MESSAGE_TYPE);
    expect(message.data).toEqual(data);
    expect(data.fetchedAt).toBe('2026-07-03T12:00:00.000Z');
  });
});

describe('renderPanelHtml', () => {
  it('renders populated sections', () => {
    const data: DeckentPanelData = {
      fetchedAt: '2026-07-03T12:00:00.000Z',
      runStatus: { data: { runId: 'r1', state: 'completed', startedAt: null, finishedAt: null, exitCode: 0 }, error: null },
      sessions: {
        data: {
          sessions: [
            { sessionId: 's1', label: 'main', status: 'active', createdAt: 'x', lastActivityAt: 'x' },
          ],
        },
        error: null,
      },
      limits: { data: { limits: { dailyTokens: 1000 } }, error: null },
      approvals: { data: { approvals: [{ id: 'a1' }] }, error: null },
    };

    const html = renderPanelHtml(data);

    expect(html).toContain('Run <code>r1</code>');
    expect(html).toContain('completed');
    expect(html).toContain('main');
    expect(html).toContain('dailyTokens: 1000');
    expect(html).toContain('{&quot;id&quot;:&quot;a1&quot;}');
  });

  it('renders an error message for a failed section', () => {
    const data: DeckentPanelData = {
      fetchedAt: '2026-07-03T12:00:00.000Z',
      runStatus: { data: null, error: null },
      sessions: { data: null, error: { kind: 'transport', message: 'connection refused' } },
      limits: { data: { limits: {} }, error: null },
      approvals: { data: { approvals: [] }, error: null },
    };

    const html = renderPanelHtml(data);

    expect(html).toContain('connection refused');
    expect(html).toContain('No data');
    expect(html).toContain('No limits reported');
    expect(html).toContain('No pending approvals');
  });

  it('renders an RPC-level error message via error.error.message', () => {
    const data: DeckentPanelData = {
      fetchedAt: '2026-07-03T12:00:00.000Z',
      runStatus: { data: null, error: null },
      sessions: { data: null, error: { kind: 'rpc', error: { code: 'METHOD_NOT_IMPLEMENTED', message: 'not wired yet' } } },
      limits: { data: { limits: {} }, error: null },
      approvals: { data: { approvals: [] }, error: null },
    };

    const html = renderPanelHtml(data);

    expect(html).toContain('not wired yet');
  });

  it('HTML-escapes hostile data instead of injecting raw markup', () => {
    const data: DeckentPanelData = {
      fetchedAt: '2026-07-03T12:00:00.000Z',
      runStatus: { data: null, error: null },
      sessions: {
        data: {
          sessions: [
            {
              sessionId: 's1',
              label: '<script>alert(1)</script>',
              status: 'active',
              createdAt: 'x',
              lastActivityAt: 'x',
            },
          ],
        },
        error: null,
      },
      limits: { data: { limits: {} }, error: null },
      approvals: { data: { approvals: [] }, error: null },
    };

    const html = renderPanelHtml(data);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
