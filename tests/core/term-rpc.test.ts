// ─── TERM-RPC-CORE — RpcRequest/RpcResponse contract + dispatcher tests ──────
// Slice-1 (task 361-011): envelope round-trip, method catalog shape,
// unknown-method/version-mismatch/invalid-params error paths, and
// handler-map dispatch using fake in-memory handlers. No existing api/repl
// surface is touched or imported — this module is a pure, transport-agnostic
// contract + dispatcher skeleton.
import { describe, it, expect, vi } from 'vitest';
import {
  TERM_RPC_VERSION,
  TERM_RPC_METHODS,
  TERM_RPC_METHOD_SCHEMAS,
  rpcRequestSchema,
  rpcResponseSchema,
  dispatchRpcRequest,
  isTermRpcMethod,
  serializeRpcRequest,
  serializeRpcResponse,
  parseRpcRequest,
  parseRpcResponse,
  type RpcRequest,
  type RpcResponse,
  type RpcHandlerMap,
} from '../../src/core/term-rpc.js';

function makeRequest(method: string, params?: unknown, overrides: Partial<RpcRequest> = {}): RpcRequest {
  return rpcRequestSchema.parse({
    id: 'req-1',
    version: TERM_RPC_VERSION,
    method,
    ...(params !== undefined ? { params } : {}),
    ...overrides,
  });
}

describe('term-rpc — envelope shape + round-trip', () => {
  it('a valid request round-trips through serialize -> parse losslessly', () => {
    const request = makeRequest('session.list', {});
    const wire = serializeRpcRequest(request);
    const parsed = parseRpcRequest(wire);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(request);
  });

  it('a valid response round-trips through serialize -> parse losslessly', () => {
    const response: RpcResponse = rpcResponseSchema.parse({
      id: 'req-1',
      version: TERM_RPC_VERSION,
      result: { sessions: [] },
    });
    const wire = serializeRpcResponse(response);
    const parsed = parseRpcResponse(wire);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(response);
  });

  it('rpcResponseSchema rejects a response carrying both result and error', () => {
    const attempt = rpcResponseSchema.safeParse({
      id: 'req-1',
      version: TERM_RPC_VERSION,
      result: { ok: true },
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });
    expect(attempt.success).toBe(false);
  });

  it('rpcResponseSchema rejects a response carrying neither result nor error', () => {
    const attempt = rpcResponseSchema.safeParse({ id: 'req-1', version: TERM_RPC_VERSION });
    expect(attempt.success).toBe(false);
  });

  it('parseRpcRequest never throws on malformed JSON and reports an error', () => {
    const parsed = parseRpcRequest('{not valid json');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('parseRpcRequest reports validation errors for a structurally invalid request', () => {
    const parsed = parseRpcRequest(JSON.stringify({ id: 'req-1', version: TERM_RPC_VERSION }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.some((e) => e.includes('method'))).toBe(true);
  });
});

describe('term-rpc — v1 method catalog', () => {
  it('TERM_RPC_METHODS is exactly the 7 v1 catalog entries', () => {
    expect([...TERM_RPC_METHODS].sort()).toEqual(
      [
        'session.list',
        'session.resume',
        'run.status',
        'run.start-detached',
        'approval.list',
        'approval.decide',
        'limits.get',
      ].sort(),
    );
  });

  it('TERM_RPC_METHOD_SCHEMAS has exactly one entry per catalog method (compile-time Record<> sync)', () => {
    expect(Object.keys(TERM_RPC_METHOD_SCHEMAS).sort()).toEqual([...TERM_RPC_METHODS].sort());
  });

  it('isTermRpcMethod is true for a catalog method and false for an arbitrary string', () => {
    expect(isTermRpcMethod('run.status')).toBe(true);
    expect(isTermRpcMethod('run.does-not-exist')).toBe(false);
  });
});

describe('term-rpc — dispatchRpcRequest error paths', () => {
  it('rejects a version mismatch with VERSION_MISMATCH, without invoking any handler', async () => {
    const handler = vi.fn();
    const request = makeRequest('session.list', {}, { version: '2.0' });
    const response = await dispatchRpcRequest(request, { 'session.list': handler });
    expect(response.error?.code).toBe('VERSION_MISMATCH');
    expect(response.result).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects an unknown method with UNKNOWN_METHOD', async () => {
    const request = { id: 'req-1', version: TERM_RPC_VERSION, method: 'session.teleport' };
    const response = await dispatchRpcRequest(request as RpcRequest, {});
    expect(response.error?.code).toBe('UNKNOWN_METHOD');
  });

  it('rejects invalid params for a known method with INVALID_PARAMS', async () => {
    const handler = vi.fn();
    const request = makeRequest('session.resume', {}); // missing required sessionId
    const response = await dispatchRpcRequest(request, { 'session.resume': handler });
    expect(response.error?.code).toBe('INVALID_PARAMS');
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports METHOD_NOT_IMPLEMENTED when the injected handler map has no handler for a known method', async () => {
    const request = makeRequest('limits.get', {});
    const response = await dispatchRpcRequest(request, {});
    expect(response.error?.code).toBe('METHOD_NOT_IMPLEMENTED');
  });

  it('wraps a thrown handler exception as INTERNAL_ERROR without escaping the dispatcher', async () => {
    const handlers: RpcHandlerMap = {
      'limits.get': () => {
        throw new Error('fake handler boom');
      },
    };
    const request = makeRequest('limits.get', {});
    const response = await dispatchRpcRequest(request, handlers);
    expect(response.error?.code).toBe('INTERNAL_ERROR');
    expect(response.error?.message).toContain('fake handler boom');
  });
});

describe('term-rpc — dispatchRpcRequest success path (fake handlers)', () => {
  it('dispatches session.list to its fake handler and returns a schema-valid result', async () => {
    const handlers: RpcHandlerMap = {
      'session.list': () => ({
        sessions: [
          {
            sessionId: 's-1',
            label: 'main',
            status: 'active',
            createdAt: '2026-07-02T00:00:00.000Z',
            lastActivityAt: '2026-07-02T00:01:00.000Z',
          },
        ],
      }),
    };
    const request = makeRequest('session.list', {});
    const response = await dispatchRpcRequest(request, handlers);
    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({
      sessions: [
        {
          sessionId: 's-1',
          label: 'main',
          status: 'active',
          createdAt: '2026-07-02T00:00:00.000Z',
          lastActivityAt: '2026-07-02T00:01:00.000Z',
        },
      ],
    });
    expect(rpcResponseSchema.safeParse(response).success).toBe(true);
  });

  it('dispatches run.start-detached to its fake (async) handler and returns the runId', async () => {
    const handlers: RpcHandlerMap = {
      'run.start-detached': async (params) => {
        expect(params.command).toBe('npm test');
        return { runId: 'run-42' };
      },
    };
    const request = makeRequest('run.start-detached', { command: 'npm test' });
    const response = await dispatchRpcRequest(request, handlers);
    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({ runId: 'run-42' });
  });

  it('dispatches approval.decide to its fake handler with validated params', async () => {
    const handlers: RpcHandlerMap = {
      'approval.decide': (params) => {
        expect(params.decision).toBe('allow');
        return { ok: true as const };
      },
    };
    const request = makeRequest('approval.decide', {
      requestId: 'apr-1',
      decision: 'allow',
      decidedBy: 'alperen',
    });
    const response = await dispatchRpcRequest(request, handlers);
    expect(response.result).toEqual({ ok: true });
  });
});
