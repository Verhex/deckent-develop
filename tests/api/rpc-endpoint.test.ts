/**
 * Tests for POST /api/rpc (362-008 — RPC-API-WIRE, TERM-RPC HTTP wire, slice-2a).
 *
 * Verifies:
 *  - the route sits behind the same bearer-auth gate as every other /api/*
 *    route (401 without a token)
 *  - an unknown method / a write method left unwired this slice both answer
 *    honestly through dispatchRpcRequest's own error taxonomy (UNKNOWN_METHOD /
 *    METHOD_NOT_IMPLEMENTED), never a 500
 *  - the 4 read methods wired this slice round-trip against hermetic fixtures:
 *    limits.get (fake spawn, no real `claude` binary), approval.list (real
 *    ApprovalBroker fixture), session.list + run.status (fake terminal
 *    backend, no real PTY)
 *
 * Hermetic throughout — no real subprocess, no real PTY, tmpdir project root.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createHttpServer,
  setRpcLimitProbeSpawnImpl,
  type HttpApi,
} from '../../src/api/server.js';
import type { SessionBackend, BackendHandle } from '../../src/api/terminal/session-backend.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { TERM_RPC_VERSION, type RpcResponse } from '../../src/core/term-rpc.js';
import type { SpawnImpl, SpawnedProcessLike } from '../../src/core/limit-preflight.js';

const API_TOKEN = 'rpc-endpoint-test-362-008';

// ─── Fake terminal backend (no real PTY, no native binding) ────────────────
function fakeBackend(): { be: SessionBackend; exit: (code: number) => void } {
  const handle: BackendHandle = { write: () => {}, resize: () => {}, kill: () => {} };
  let onExitCb: (code: number) => void = () => {};
  const be: SessionBackend = {
    spawn: (_spec, _onData, onExit) => {
      onExitCb = onExit;
      return handle;
    },
  };
  return { be, exit: (code) => onExitCb(code) };
}

// ─── Fake `claude -p "/usage"` spawn (mirrors tests/core/limit-preflight.test.ts) ──
function fakeUsageSpawn(stdout: string): SpawnImpl {
  return (_command, _args) => {
    const child = new EventEmitter() as EventEmitter & SpawnedProcessLike;
    child.stdout = Readable.from([stdout]);
    child.stderr = Readable.from(['']);
    child.kill = () => true;
    process.nextTick(() => child.emit('close', 0, null));
    return child;
  };
}

const USAGE_FIXTURE =
  'Current session: 42% used · resets Jul 2, 8:30pm (Europe/Istanbul)\n' +
  'Current week (all models): 10% used · resets Jul 6, 12:00am (Europe/Istanbul)\n';

function buildApprovalInput(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-362-008' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-362',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: '2026-07-02T00:00:00.000Z',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    maskedArgs: { command: '[REDACTED]' },
    rawArgsRef: null,
    ...overrides,
  };
}

let tmpRoot: string;
let api: HttpApi | undefined;

beforeEach(() => {
  delete process.env['DECKENT_API_TOKEN'];
  delete process.env['DECKENT_API_AUTH_DISABLED'];
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-rpc-endpoint-'));
});

afterEach(async () => {
  setRpcLimitProbeSpawnImpl(undefined);
  if (api) {
    await api.close();
    api = undefined;
  }
  rmSync(tmpRoot, { recursive: true, force: true });
});

async function port(a: HttpApi): Promise<number> {
  if (!a.server.listening) {
    await new Promise<void>((resolve, reject) => {
      a.server.once('listening', () => resolve());
      a.server.once('error', reject);
    });
  }
  const addr = a.server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('server address unavailable');
  }
  return addr.port;
}

async function rpcCall(
  base: string,
  token: string | undefined,
  body: unknown,
): Promise<{ status: number; body: RpcResponse }> {
  const res = await fetch(`${base}/api/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as RpcResponse };
}

describe('POST /api/rpc', () => {
  it('401s without a bearer token — auth chain is not weakened for this route', async () => {
    api = createHttpServer(tmpRoot, { port: 0, apiToken: API_TOKEN });
    const base = `http://127.0.0.1:${await port(api)}`;
    const { status } = await rpcCall(base, undefined, {
      id: 'r1',
      version: TERM_RPC_VERSION,
      method: 'limits.get',
    });
    expect(status).toBe(401);
  });

  it('answers an unknown method honestly (UNKNOWN_METHOD), not a 500', async () => {
    api = createHttpServer(tmpRoot, { port: 0, apiToken: API_TOKEN });
    const base = `http://127.0.0.1:${await port(api)}`;
    const { status, body } = await rpcCall(base, API_TOKEN, {
      id: 'r1',
      version: TERM_RPC_VERSION,
      method: 'session.teleport',
    });
    expect(status).toBe(200);
    expect(body.error?.code).toBe('UNKNOWN_METHOD');
  });

  it('answers a write method left unwired this slice with METHOD_NOT_IMPLEMENTED (honest unsupported)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, apiToken: API_TOKEN });
    const base = `http://127.0.0.1:${await port(api)}`;
    const { body } = await rpcCall(base, API_TOKEN, {
      id: 'r1',
      version: TERM_RPC_VERSION,
      method: 'approval.decide',
      params: { requestId: 'x', decision: 'allow', decidedBy: 'tester' },
    });
    expect(body.error?.code).toBe('METHOD_NOT_IMPLEMENTED');
    expect(body.result).toBeUndefined();
  });

  it('rejects a malformed RPC envelope with 400 (never reaches the dispatcher)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, apiToken: API_TOKEN });
    const base = `http://127.0.0.1:${await port(api)}`;
    const res = await fetch(`${base}/api/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
      body: JSON.stringify({ id: 'r1', version: TERM_RPC_VERSION }), // missing method
    });
    expect(res.status).toBe(400);
  });

  it('limits.get round-trips a schema-valid result via a fake spawn (no real claude binary)', async () => {
    setRpcLimitProbeSpawnImpl(fakeUsageSpawn(USAGE_FIXTURE));
    api = createHttpServer(tmpRoot, { port: 0, apiToken: API_TOKEN });
    const base = `http://127.0.0.1:${await port(api)}`;
    const { status, body } = await rpcCall(base, API_TOKEN, {
      id: 'r1',
      version: TERM_RPC_VERSION,
      method: 'limits.get',
    });
    expect(status).toBe(200);
    expect(body.error).toBeUndefined();
    const limits = (body.result as { limits: Record<string, unknown> }).limits;
    expect(limits['unavailable']).toBe(false);
    expect(limits['sessionPct']).toBe(42);
    expect(limits['weekAllPct']).toBe(10);
  });

  it('approval.list round-trips against a real ApprovalBroker fixture, filtered by scopeId', async () => {
    const broker = new ApprovalBroker(tmpRoot);
    broker.submit(buildApprovalInput('apr-362-1', { scopeId: 'sprint-362' }));
    broker.submit(buildApprovalInput('apr-362-2', { scopeId: 'sprint-999' }));

    api = createHttpServer(tmpRoot, { port: 0, apiToken: API_TOKEN });
    const base = `http://127.0.0.1:${await port(api)}`;

    const allResp = await rpcCall(base, API_TOKEN, {
      id: 'r1',
      version: TERM_RPC_VERSION,
      method: 'approval.list',
    });
    expect(allResp.status).toBe(200);
    const allApprovals = (allResp.body.result as { approvals: Array<{ request: { id: string } }> }).approvals;
    expect(allApprovals.map((a) => a.request.id).sort()).toEqual(['apr-362-1', 'apr-362-2']);

    const scopedResp = await rpcCall(base, API_TOKEN, {
      id: 'r2',
      version: TERM_RPC_VERSION,
      method: 'approval.list',
      params: { scopeId: 'sprint-362' },
    });
    const scopedApprovals = (scopedResp.body.result as { approvals: Array<{ request: { id: string } }> }).approvals;
    expect(scopedApprovals.map((a) => a.request.id)).toEqual(['apr-362-1']);
  });

  it('session.list + run.status round-trip against a fake terminal-backend session lifecycle', async () => {
    const fb = fakeBackend();
    api = createHttpServer(tmpRoot, { port: 0, apiToken: API_TOKEN, terminalBackend: fb.be });
    const base = `http://127.0.0.1:${await port(api)}`;
    expect(api.terminalToken).toBeDefined();

    const createRes = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${api.terminalToken!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind: 'shell' }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const listResp = await rpcCall(base, API_TOKEN, {
      id: 'r1',
      version: TERM_RPC_VERSION,
      method: 'session.list',
    });
    expect(listResp.status).toBe(200);
    const sessions = (listResp.body.result as { sessions: Array<{ sessionId: string; status: string }> }).sessions;
    expect(sessions.some((s) => s.sessionId === created.id && s.status === 'active')).toBe(true);

    const runningResp = await rpcCall(base, API_TOKEN, {
      id: 'r2',
      version: TERM_RPC_VERSION,
      method: 'run.status',
      params: { runId: created.id },
    });
    expect((runningResp.body.result as { state: string }).state).toBe('running');

    fb.exit(0);

    const completedResp = await rpcCall(base, API_TOKEN, {
      id: 'r3',
      version: TERM_RPC_VERSION,
      method: 'run.status',
      params: { runId: created.id },
    });
    const completed = completedResp.body.result as { state: string; exitCode: number | null };
    expect(completed.state).toBe('completed');
    expect(completed.exitCode).toBe(0);
  });

  it('run.status reports "pending" honestly for an unknown runId (no fabricated verdict)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, apiToken: API_TOKEN });
    const base = `http://127.0.0.1:${await port(api)}`;
    const { body } = await rpcCall(base, API_TOKEN, {
      id: 'r1',
      version: TERM_RPC_VERSION,
      method: 'run.status',
      params: { runId: 'does-not-exist' },
    });
    const result = body.result as { state: string; startedAt: string | null; exitCode: number | null };
    expect(result.state).toBe('pending');
    expect(result.startedAt).toBeNull();
    expect(result.exitCode).toBeNull();
  });
});
