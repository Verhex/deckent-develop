// ═══ 362-009 RPC-REPL-WIRE — in-process TERM-RPC local transport + `/rpc`
// debug-command tests ═══════════════════════════════════════════════════
//
// Proves the SECOND TERM-RPC consumer (createLocalRpcTransport, in-process,
// no HTTP) genuinely dispatches through the same core/term-rpc.ts contract
// the HTTP transport (362-008, src/api/server.ts) uses — same fake-handler
// style as tests/core/term-rpc.test.ts's own dispatch tests, run through
// this module's transport wrapper instead of calling dispatchRpcRequest
// directly. Hermetic: no real MemoryStore/ApprovalBroker/spawn — every dep
// is a fake.

import { describe, it, expect, vi } from 'vitest';
import {
  createLocalRpcTransport,
  buildReplRpcHandlers,
  parseRpcDebugCommand,
  runRpcDebugCommand,
  type ReplRpcHandlerDeps,
} from '../../../src/cli/repl/rpc-client.js';
import { TERM_RPC_VERSION, type RpcHandlerMap } from '../../../src/core/term-rpc.js';
import type { ChatSessionSummary } from '../../../src/core/memory-types.js';
import type { SubscriptionLimitResult } from '../../../src/core/limit-preflight.js';

// ─── createLocalRpcTransport — all 4 v1 read methods, fake handlers ───────

function fakeReadHandlers(): RpcHandlerMap {
  return {
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
    'run.status': (params) => ({
      runId: params.runId,
      state: 'running',
      startedAt: '2026-07-02T00:00:00.000Z',
      finishedAt: null,
      exitCode: null,
    }),
    'approval.list': (params) => ({
      approvals: params.scopeId ? [{ scopeId: params.scopeId }] : [{ scopeId: 'any' }],
    }),
    'limits.get': () => ({ limits: { unavailable: false, sessionPct: 42 } }),
  };
}

describe('createLocalRpcTransport — in-process dispatch over all 4 v1 read methods', () => {
  it('session.list — dispatches and returns a schema-shaped result', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const response = await transport.call('session.list', {});
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
    expect(response.version).toBe(TERM_RPC_VERSION);
  });

  it('run.status — dispatches with params and echoes runId', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const response = await transport.call('run.status', { runId: 'run-42' });
    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({
      runId: 'run-42',
      state: 'running',
      startedAt: '2026-07-02T00:00:00.000Z',
      finishedAt: null,
      exitCode: null,
    });
  });

  it('approval.list — dispatches with an optional scopeId param', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const response = await transport.call('approval.list', { scopeId: 'sprint-362' });
    expect(response.result).toEqual({ approvals: [{ scopeId: 'sprint-362' }] });
  });

  it('limits.get — dispatches with empty params', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const response = await transport.call('limits.get', {});
    expect(response.result).toEqual({ limits: { unavailable: false, sessionPct: 42 } });
  });

  it('generates a fresh id per call when none is supplied, and honors an explicit id', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const a = await transport.call('limits.get', {});
    const b = await transport.call('limits.get', {});
    expect(a.id).not.toBe(b.id);
    const c = await transport.call('limits.get', {}, 'fixed-id-1');
    expect(c.id).toBe('fixed-id-1');
  });

  it('an unknown method resolves to UNKNOWN_METHOD, never throws', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const response = await transport.call('session.teleport', {});
    expect(response.error?.code).toBe('UNKNOWN_METHOD');
  });

  it('a method absent from the handler map resolves to METHOD_NOT_IMPLEMENTED', async () => {
    const transport = createLocalRpcTransport({});
    const response = await transport.call('session.list', {});
    expect(response.error?.code).toBe('METHOD_NOT_IMPLEMENTED');
  });

  it('an empty method string is rejected as a malformed envelope, never throws', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const response = await transport.call('', {});
    expect(response.error).toBeDefined();
  });

  it('roundtrip — the response returned is itself schema-shaped (survived serialize->parse)', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const response = await transport.call('limits.get', {}, 'req-roundtrip');
    expect(response).toEqual({
      id: 'req-roundtrip',
      version: TERM_RPC_VERSION,
      result: { limits: { unavailable: false, sessionPct: 42 } },
    });
  });
});

// ─── buildReplRpcHandlers — REPL-side real wiring, fake deps ──────────────

describe('buildReplRpcHandlers — REPL local-data wiring', () => {
  const summaries: ChatSessionSummary[] = [
    { sessionId: 's-current', turnCount: 3, lastAt: '2026-07-02T10:00:00.000Z', preview: 'hello there' },
    { sessionId: 's-other', turnCount: 1, lastAt: '2026-07-01T09:00:00.000Z', preview: 'older session' },
  ];

  it('session.list maps ChatSessionSummary -> SessionSummary, marking the current session active', async () => {
    const deps: ReplRpcHandlerDeps = {
      listChatSessions: () => summaries,
      currentSessionId: 's-current',
    };
    const transport = createLocalRpcTransport(buildReplRpcHandlers(deps));
    const response = await transport.call('session.list', {});
    expect(response.result).toEqual({
      sessions: [
        {
          sessionId: 's-current',
          label: 'hello there',
          status: 'active',
          createdAt: '2026-07-02T10:00:00.000Z',
          lastActivityAt: '2026-07-02T10:00:00.000Z',
        },
        {
          sessionId: 's-other',
          label: 'older session',
          status: 'idle',
          createdAt: '2026-07-01T09:00:00.000Z',
          lastActivityAt: '2026-07-01T09:00:00.000Z',
        },
      ],
    });
  });

  it('session.list is absent from the map when listChatSessions is not supplied', async () => {
    const transport = createLocalRpcTransport(buildReplRpcHandlers({}));
    const response = await transport.call('session.list', {});
    expect(response.error?.code).toBe('METHOD_NOT_IMPLEMENTED');
  });

  it('approval.list filters by scopeId when supplied, and passes everything through unfiltered otherwise', async () => {
    const listApprovals = vi.fn(() => [
      { scopeId: 'sprint-362', summary: 'approve X' },
      { scopeId: 'sprint-361', summary: 'approve Y' },
    ]);
    const transport = createLocalRpcTransport(buildReplRpcHandlers({ listApprovals }));

    const filtered = await transport.call('approval.list', { scopeId: 'sprint-362' });
    expect(filtered.result).toEqual({ approvals: [{ scopeId: 'sprint-362', summary: 'approve X' }] });

    const unfiltered = await transport.call('approval.list', {});
    expect(unfiltered.result).toEqual({
      approvals: [
        { scopeId: 'sprint-362', summary: 'approve X' },
        { scopeId: 'sprint-361', summary: 'approve Y' },
      ],
    });
    expect(listApprovals).toHaveBeenCalledWith('pending');
  });

  it('limits.get passes through an available probe result', async () => {
    const probe: SubscriptionLimitResult = {
      unavailable: false,
      sessionPct: 81,
      sessionResetAt: { text: 'resets Jul 2, 8:30pm', timezone: 'Europe/Istanbul' },
      weekAllPct: 31,
      weekAllResetAt: null,
      raw: 'fake raw output',
    };
    const transport = createLocalRpcTransport(buildReplRpcHandlers({ probeLimits: async () => probe }));
    const response = await transport.call('limits.get', {});
    expect(response.result).toEqual({
      limits: {
        unavailable: false,
        sessionPct: 81,
        sessionResetAt: { text: 'resets Jul 2, 8:30pm', timezone: 'Europe/Istanbul' },
        weekAllPct: 31,
        weekAllResetAt: null,
      },
    });
  });

  it('limits.get honestly reports an unavailable probe, without fabricating numbers', async () => {
    const probe: SubscriptionLimitResult = { unavailable: true, reason: 'claude binary not found', raw: '' };
    const transport = createLocalRpcTransport(buildReplRpcHandlers({ probeLimits: async () => probe }));
    const response = await transport.call('limits.get', {});
    expect(response.result).toEqual({ limits: { unavailable: true, reason: 'claude binary not found' } });
  });

  it('run.status is NEVER registered by this slice, regardless of deps supplied', async () => {
    const transport = createLocalRpcTransport(
      buildReplRpcHandlers({
        listChatSessions: () => summaries,
        listApprovals: () => [],
        probeLimits: async () => ({ unavailable: true, reason: 'n/a', raw: '' }),
      }),
    );
    const response = await transport.call('run.status', { runId: 'anything' });
    expect(response.error?.code).toBe('METHOD_NOT_IMPLEMENTED');
  });
});

// ─── /rpc debug-command parsing + execution ───────────────────────────────

describe('parseRpcDebugCommand', () => {
  it('a non-/rpc line returns null (fall through to normal chat handling)', () => {
    expect(parseRpcDebugCommand('hello world')).toBeNull();
    expect(parseRpcDebugCommand('/resume')).toBeNull();
  });

  it('bare "/rpc" with no method returns a usage error', () => {
    expect(parseRpcDebugCommand('/rpc')).toEqual({ error: 'usage: /rpc <method> [json-params]' });
    expect(parseRpcDebugCommand('/rpc   ')).toEqual({ error: 'usage: /rpc <method> [json-params]' });
  });

  it('"/rpc <method>" with no params', () => {
    expect(parseRpcDebugCommand('/rpc session.list')).toEqual({ method: 'session.list' });
  });

  it('"/rpc <method> <json>" parses params', () => {
    expect(parseRpcDebugCommand('/rpc approval.list {"scopeId":"sprint-362"}')).toEqual({
      method: 'approval.list',
      params: { scopeId: 'sprint-362' },
    });
  });

  it('malformed JSON params returns a parse error, never throws', () => {
    const result = parseRpcDebugCommand('/rpc approval.list {not-json');
    expect(result).not.toBeNull();
    expect(result && 'error' in result).toBe(true);
  });
});

describe('runRpcDebugCommand', () => {
  it('returns null for a non-/rpc line', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    expect(await runRpcDebugCommand(transport, 'not an rpc line')).toBeNull();
  });

  it('formats a successful dispatch as pretty-printed JSON', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const output = await runRpcDebugCommand(transport, '/rpc limits.get');
    expect(output).not.toBeNull();
    const parsed: unknown = JSON.parse(output!);
    expect(parsed).toMatchObject({ result: { limits: { unavailable: false, sessionPct: 42 } } });
  });

  it('reports an unknown method without invoking the transport', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const output = await runRpcDebugCommand(transport, '/rpc session.teleport');
    expect(output).toContain('unknown method');
    expect(output).toContain('session.teleport');
  });

  it('surfaces a parse error (bad JSON params) as a formatted message', async () => {
    const transport = createLocalRpcTransport(fakeReadHandlers());
    const output = await runRpcDebugCommand(transport, '/rpc session.list {bad');
    expect(output).toContain('[rpc]');
    expect(output).toContain('invalid JSON params');
  });
});
