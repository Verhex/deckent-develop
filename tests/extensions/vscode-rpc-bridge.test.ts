import { describe, expect, it, vi } from 'vitest';
import { TERM_RPC_VERSION, type RpcResponse, type TermRpcMethodTable } from '../../src/core/term-rpc.js';
import { RpcBridge } from '../../src/extensions/vscode/src/rpc-bridge.js';
import { renderPanelHtml, type DeckentPanelData } from '../../src/extensions/vscode/src/deckent-panel.js';

function mockFetch(response: RpcResponse): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(response),
  }) as unknown as typeof globalThis.fetch;
}

function response(result: unknown): RpcResponse {
  return { id: 'response-id', version: TERM_RPC_VERSION, result };
}

describe('RpcBridge approval.decide', () => {
  it('uses the established RPC envelope and omits an absent reason', async () => {
    const fetchFn = mockFetch(response({ id: 'approval-1', status: 'approved' }));
    const bridge = new RpcBridge({ baseUrl: 'http://localhost:3100/', fetchFn });

    await bridge.decideApproval('approval-1', 'approve');

    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!;
    expect(url).toBe('http://localhost:3100/api/rpc');
    const body = JSON.parse(init?.body as string) as {
      id: string;
      version: string;
      method: string;
      params: unknown;
    };
    expect(body.id).toEqual(expect.any(String));
    expect(body.version).toBe(TERM_RPC_VERSION);
    expect(body.method).toBe('approval.decide');
    expect(body.params).toEqual({ requestId: 'approval-1', decision: 'allow', decidedBy: 'vscode' });
  });

  it('forwards a rejection reason', async () => {
    const fetchFn = mockFetch(response({ id: 'approval-2', status: 'rejected' }));
    const bridge = new RpcBridge({ fetchFn });

    await bridge.decideApproval('approval-2', 'reject', 'unsafe');

    const [, init] = vi.mocked(fetchFn).mock.calls[0]!;
    const body = JSON.parse(init?.body as string) as { params: unknown };
    expect(body.params).toEqual({
      requestId: 'approval-2',
      decision: 'deny',
      decidedBy: 'vscode',
      reason: 'unsafe',
    });
  });

  it('returns api_decide_disabled as a typed RPC failure without throwing', async () => {
    const fetchFn = mockFetch({
      id: 'response-id',
      version: TERM_RPC_VERSION,
      error: { code: 'METHOD_NOT_IMPLEMENTED', message: 'api_decide_disabled' },
    });
    const bridge = new RpcBridge({ fetchFn });

    await expect(bridge.decideApproval('approval-1', 'approve')).resolves.toEqual({
      ok: false,
      error: {
        kind: 'rpc',
        error: { code: 'METHOD_NOT_IMPLEMENTED', message: 'api_decide_disabled' },
      },
    });
  });

  it('keeps an existing read call shape unchanged', async () => {
    const fetchFn = mockFetch(response({ approvals: [] }));
    const bridge = new RpcBridge({ fetchFn });

    await bridge.listApprovals('scope-1');

    const [, init] = vi.mocked(fetchFn).mock.calls[0]!;
    const body = JSON.parse(init?.body as string) as { method: string; params: unknown };
    expect(body).toMatchObject({ method: 'approval.list', params: { scopeId: 'scope-1' } });
  });
});

describe('approval panel actions', () => {
  it('renders actions for non-critical rows and only a CLI hint for critical rows', () => {
    const approvals = {
      approvals: [
        { id: 'approval-safe', shortCode: 'safe1', risk: 'low', summary: 'Safe operation' },
        { id: 'approval-critical', shortCode: 'crit1', risk: 'critical', summary: 'Critical operation' },
      ],
    } as unknown as TermRpcMethodTable['approval.list']['result'];
    const data: DeckentPanelData = {
      fetchedAt: '2026-08-21T00:00:00.000Z',
      runStatus: { data: null, error: null },
      sessions: { data: { sessions: [] }, error: null },
      limits: { data: { limits: {} }, error: null },
      approvals: { data: approvals, error: null },
    };

    const html = renderPanelHtml(data);
    const safeRow = html.match(/<li class="approval">[^]*?<\/li>/)?.[0] ?? '';
    const criticalRow = html.match(/<li class="approval critical">[^]*?<\/li>/)?.[0] ?? '';

    expect(safeRow).toContain('<code>#safe1</code>');
    expect(safeRow).toContain('data-action="approve">Approve</button>');
    expect(safeRow).toContain('data-action="reject">Reject</button>');
    expect(criticalRow).toContain('<code>#crit1</code>');
    expect(criticalRow).toContain('CLI: deckent approvals decide #crit1');
    expect(criticalRow).not.toContain('<button');
    expect(criticalRow).not.toContain('data-action=');
  });
});
