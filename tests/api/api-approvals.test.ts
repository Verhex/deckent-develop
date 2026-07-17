/**
 * Tests for /api/approvals endpoints (356-002 — API-APPROVALS, ADR-G-033/ADR-G-020).
 *
 * GET  /api/approvals              — pending/approved/denied buckets, maskedArgs-only.
 * GET  /api/approvals/:id          — single entry detail; raw args NEVER served.
 * POST /api/approvals/:id/decision — ApprovalBroker.decide(); flag-gated by
 *   `approval.api_decide` (default-off -> 403). The GET routes above are NOT
 *   gated by this flag (dashboard monitoring stays always-on).
 *
 * Hermetic: real E2E server via startTestServer on a tmpdir project root.
 * Approval fixtures are seeded directly through a real ApprovalBroker pointed
 * at the SAME project root the server reads from (the multi-process design
 * approval-broker.ts itself documents), never mocked.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';

const TOKEN = 'approvals-test-356-002';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-356-002' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-356',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: '2026-07-02T00:00:00.000Z',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // time-bomb fix: relative future, never expires mid-suite
    maskedArgs: { command: '[REDACTED]' },
    rawArgsRef: null,
    ...overrides,
  };
}

function enableApiDecide(projectRoot: string): void {
  writeFileSync(
    join(projectRoot, '.deckent', 'config.json'),
    JSON.stringify({ approval: { api_decide: true } }, null, 2),
  );
}

describe('/api/approvals', () => {
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

  describe('GET /api/approvals', () => {
    it('returns empty buckets when no approvals exist', async () => {
      const res = await call(handle!, '/api/approvals');
      expect(res.status).toBe(200);
      // SURF-kuyruk-E: `expired` is a first-class observable bucket (TTL-swept
      // approvals were invisible here until the expiry chaos-leg smoke caught it)
      expect(res.json()).toEqual({ pending: [], approved: [], denied: [], expired: [] });
    });

    it('lists pending/approved buckets, maskedArgs-only — no rawArgsRef leak', async () => {
      const broker = new ApprovalBroker(handle!.projectRoot);
      broker.submit(buildRequest('apr-pending-1', {
        maskedArgs: { secret: '[REDACTED]' },
        rawArgsRef: '.deckent/approvals/raw/apr-pending-1.json',
      }));
      const approvedReq = broker.submit(buildRequest('apr-approved-1'));
      broker.decide(approvedReq.id, {
        decision: 'allow',
        decidedBy: 'alperen',
        channel: 'terminal',
        decidedAt: '2026-07-02T00:05:00.000Z',
        reason: 'looks fine',
      });

      const res = await call(handle!, '/api/approvals');
      expect(res.status).toBe(200);
      const body = res.json<{
        pending: Array<{ request: Record<string, unknown> }>;
        approved: Array<{ request: Record<string, unknown>; decision: { decision: string } }>;
        denied: unknown[];
      }>();

      expect(body.pending).toHaveLength(1);
      expect(body.pending[0]!.request['id']).toBe('apr-pending-1');
      expect(body.pending[0]!.request['maskedArgs']).toEqual({ secret: '[REDACTED]' });
      expect(body.pending[0]!.request).not.toHaveProperty('rawArgsRef');
      // Defense-in-depth: the raw-args storage path must never appear anywhere
      // in the response, even serialized as a nested string.
      expect(res.text).not.toContain('raw/apr-pending-1.json');

      expect(body.approved).toHaveLength(1);
      expect(body.approved[0]!.decision.decision).toBe('allow');
      expect(body.denied).toHaveLength(0);
    });
  });

  describe('GET /api/approvals/:id', () => {
    it('returns the entry detail with maskedArgs, never raw', async () => {
      const broker = new ApprovalBroker(handle!.projectRoot);
      broker.submit(buildRequest('apr-detail-1', { maskedArgs: { key: '[REDACTED]' } }));

      const res = await call(handle!, '/api/approvals/apr-detail-1');
      expect(res.status).toBe(200);
      const body = res.json<{ category: string; request: Record<string, unknown> }>();
      expect(body.category).toBe('pending');
      expect(body.request['id']).toBe('apr-detail-1');
      expect(body.request['maskedArgs']).toEqual({ key: '[REDACTED]' });
      expect(body.request).not.toHaveProperty('rawArgsRef');
    });

    it('404s for an unknown id', async () => {
      const res = await call(handle!, '/api/approvals/does-not-exist');
      expect(res.status).toBe(404);
    });

    it('400s for a path-traversal-shaped id', async () => {
      const res = await call(handle!, '/api/approvals/..%2F..%2Fetc%2Fpasswd');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/approvals/:id/decision', () => {
    it('403s with an explanation when approval.api_decide is off (default)', async () => {
      const broker = new ApprovalBroker(handle!.projectRoot);
      broker.submit(buildRequest('apr-flagoff-1'));

      const res = await call(handle!, '/api/approvals/apr-flagoff-1/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(403);
      const body = res.json<{ error: string }>();
      expect(body.error).toMatch(/api_decide/);
    });

    it('decides via the broker when the flag is enabled, decidedBy server-derived', async () => {
      enableApiDecide(handle!.projectRoot);
      const broker = new ApprovalBroker(handle!.projectRoot);
      broker.submit(buildRequest('apr-flagon-1'));

      const res = await call(handle!, '/api/approvals/apr-flagon-1/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'allow', reason: 'approved via API' }),
      });
      expect(res.status).toBe(200);
      const body = res.json<{
        success: boolean;
        decision: { decision: string; decidedBy: string; channel: string; reason: string };
      }>();
      expect(body.success).toBe(true);
      expect(body.decision.decision).toBe('allow');
      expect(body.decision.channel).toBe('api');
      expect(body.decision.reason).toBe('approved via API');
      expect(body.decision.decidedBy).toBeTruthy();

      // Broker-visible effect: a fresh store re-scan sees it as approved.
      const listRes = await call(handle!, '/api/approvals');
      const listBody = listRes.json<{ approved: Array<{ request: { id: string } }> }>();
      expect(listBody.approved.map((e) => e.request.id)).toContain('apr-flagon-1');
    });

    it('400s on an invalid decision body', async () => {
      enableApiDecide(handle!.projectRoot);
      const broker = new ApprovalBroker(handle!.projectRoot);
      broker.submit(buildRequest('apr-badbody-1'));

      const res = await call(handle!, '/api/approvals/apr-badbody-1/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'not-a-real-action' }),
      });
      expect(res.status).toBe(400);
    });

    it('409s when the approval is already decided', async () => {
      enableApiDecide(handle!.projectRoot);
      const broker = new ApprovalBroker(handle!.projectRoot);
      const req = broker.submit(buildRequest('apr-double-1'));
      broker.decide(req.id, {
        decision: 'deny',
        decidedBy: 'someone',
        channel: 'terminal',
        decidedAt: '2026-07-02T00:05:00.000Z',
        reason: 'already handled',
      });

      const res = await call(handle!, '/api/approvals/apr-double-1/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(409);
    });

    it('404s when the approval id is unknown', async () => {
      enableApiDecide(handle!.projectRoot);
      const res = await call(handle!, '/api/approvals/does-not-exist/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(404);
    });
  });
});
