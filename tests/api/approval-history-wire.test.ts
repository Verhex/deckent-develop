/**
 * Wire test for GET /api/approvals/history (360-013 APR-HISTORY-WIRE).
 *
 * approval-history-endpoint.ts itself was built + unit-verified in 359-013 but
 * left unwired ("server.ts is closed for this sprint"). This test proves the
 * live route dispatch added in server.ts: real HTTP through createHttpServer,
 * same E2E harness as tests/api/api-approvals.test.ts, real ApprovalBroker
 * fixtures (no mocking of the store or the endpoint module).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';

const TOKEN = 'approval-history-wire-360-013';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-360-013' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-360',
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

describe('GET /api/approvals/history (live wire)', () => {
  let handle: TestServerHandle | null = null;

  beforeEach(async () => {
    handle = await startTestServer({ apiToken: TOKEN });
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = null;
    }
  });

  it('route is registered: returns 200 + empty page when no history exists', async () => {
    const res = await call(handle!, '/api/approvals/history');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({
      entries: [],
      pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
    });
  });

  it('serves settled entries, most-recent-first, maskedArgs-only', async () => {
    const broker = new ApprovalBroker(handle!.projectRoot);
    const approvedReq = broker.submit(buildRequest('apr-hist-approved-1', {
      maskedArgs: { secret: '[REDACTED]' },
      rawArgsRef: '.deckent/approvals/raw/apr-hist-approved-1.json',
    }));
    broker.decide(approvedReq.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:05:00.000Z',
      reason: 'looks fine',
    });
    const deniedReq = broker.submit(buildRequest('apr-hist-denied-1'));
    broker.decide(deniedReq.id, {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:10:00.000Z',
      reason: 'nope',
    });
    // A pending (non-settled) entry must NOT appear in the history endpoint.
    broker.submit(buildRequest('apr-hist-pending-1'));

    const res = await call(handle!, '/api/approvals/history');
    expect(res.status).toBe(200);
    const body = res.json<{
      entries: Array<{ id: string; category: string; maskedArgs: Record<string, unknown> | null }>;
      pagination: { total: number };
    }>();

    expect(body.pagination.total).toBe(2);
    expect(body.entries.map((e) => e.id)).toEqual(['apr-hist-denied-1', 'apr-hist-approved-1']);
    expect(body.entries.every((e) => e.id !== 'apr-hist-pending-1')).toBe(true);
    expect(body.entries.find((e) => e.id === 'apr-hist-approved-1')!.maskedArgs).toEqual({ secret: '[REDACTED]' });
    // Defense-in-depth: raw-args storage path never leaks through the wire.
    expect(res.text).not.toContain('raw/apr-hist-approved-1.json');
  });

  it('honors status/limit/offset query params', async () => {
    const broker = new ApprovalBroker(handle!.projectRoot);
    const deniedReq = broker.submit(buildRequest('apr-hist-q-denied'));
    broker.decide(deniedReq.id, {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:05:00.000Z',
      reason: 'no',
    });
    const approvedReq = broker.submit(buildRequest('apr-hist-q-approved'));
    broker.decide(approvedReq.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:06:00.000Z',
      reason: 'ok',
    });

    const res = await call(handle!, '/api/approvals/history?status=denied&limit=1&offset=0');
    expect(res.status).toBe(200);
    const body = res.json<{ entries: Array<{ id: string; category: string }>; pagination: { total: number; limit: number } }>();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.category).toBe('denied');
    expect(body.pagination.limit).toBe(1);
  });

  it('400s on an invalid status filter', async () => {
    const res = await call(handle!, '/api/approvals/history?status=not-a-real-status');
    expect(res.status).toBe(400);
  });

  it('fails closed: 401 without a valid auth token (auth middleware chain preserved)', async () => {
    const res = await fetch(`${handle!.baseUrl}/api/approvals/history`);
    expect(res.status).toBe(401);
  });

  it('routing order: /api/approvals/history is not swallowed by the /api/approvals/:id block', async () => {
    // Before the fix this would hit the :id handler — "history" passes the id
    // regex (/^[a-zA-Z0-9_-]+$/) and would 404 as "Approval not found" instead
    // of reaching the history route's 200-with-empty-page response.
    const res = await call(handle!, '/api/approvals/history');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
  });
});
