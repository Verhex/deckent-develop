/**
 * 591-006 — approvals-route i18n pin.
 *
 * GET /api/approvals/:id and POST /api/approvals/:id/decision previously threw
 * raw English literals (`'Invalid approval id'`, `'Approval not found'`,
 * the api_decide-disabled explanation, and the `Approval already ${category}`
 * template). This suite hermetically pins that those four error bodies now
 * come from the `api.approvals.*` getMessage catalog (en+tr) instead of an
 * inline literal — HTTP status codes and JSON field names are unchanged and
 * are re-asserted here as a guard against silent regressions.
 *
 * Hermetic: real E2E server via startTestServer on a tmpdir project root
 * (same harness as tests/api/api-approvals.test.ts). Approval fixtures are
 * seeded through a real ApprovalBroker pointed at the server's own project
 * root, never mocked. Language is switched per-request via DECKENT_LANGUAGE —
 * getLanguage() (src/cli/helpers/messages.ts) reads it fresh on every call.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const TOKEN = 'approvals-endpoint-i18n-591-006';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-591-006' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-591',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: '2026-08-20T00:00:00.000Z',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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

describe('/api/approvals — i18n error catalog (591-006)', () => {
  let handle: TestServerHandle | null = null;
  const langBefore = process.env['DECKENT_LANGUAGE'];

  beforeEach(async () => {
    delete process.env['DECKENT_LANGUAGE'];
    handle = await startTestServer({ apiToken: TOKEN });
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = null;
    }
    if (langBefore === undefined) {
      delete process.env['DECKENT_LANGUAGE'];
    } else {
      process.env['DECKENT_LANGUAGE'] = langBefore;
    }
  });

  describe('GET /api/approvals/:id', () => {
    it('400s a path-traversal-shaped id with the catalog en text, same status/field shape', async () => {
      const res = await call(handle!, '/api/approvals/..%2F..%2Fetc%2Fpasswd');
      expect(res.status).toBe(400);
      const body = res.json<{ error: string }>();
      expect(Object.keys(body)).toEqual(['error']);
      expect(body.error).toBe(getMessage('api.approvals.invalid_id', 'en'));
    });

    it('400s a path-traversal-shaped id with the catalog tr text when DECKENT_LANGUAGE=tr', async () => {
      process.env['DECKENT_LANGUAGE'] = 'tr';
      const res = await call(handle!, '/api/approvals/..%2F..%2Fetc%2Fpasswd');
      expect(res.status).toBe(400);
      expect(res.json<{ error: string }>().error).toBe(getMessage('api.approvals.invalid_id', 'tr'));
    });

    it('404s an unknown id with the catalog en text', async () => {
      const res = await call(handle!, '/api/approvals/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.json<{ error: string }>().error).toBe(getMessage('api.approvals.not_found', 'en'));
    });

    it('404s an unknown id with the catalog tr text when DECKENT_LANGUAGE=tr', async () => {
      process.env['DECKENT_LANGUAGE'] = 'tr';
      const res = await call(handle!, '/api/approvals/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.json<{ error: string }>().error).toBe(getMessage('api.approvals.not_found', 'tr'));
    });
  });

  describe('POST /api/approvals/:id/decision', () => {
    it('400s a path-traversal-shaped id with the catalog en text', async () => {
      enableApiDecide(handle!.projectRoot);
      const res = await call(handle!, '/api/approvals/..%2F..%2Fetc%2Fpasswd/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(400);
      expect(res.json<{ error: string }>().error).toBe(getMessage('api.approvals.invalid_id', 'en'));
    });

    it('403s with the catalog en explanation when approval.api_decide is off (default)', async () => {
      const broker = new ApprovalBroker(handle!.projectRoot);
      broker.submit(buildRequest('apr-flagoff-591-006'));

      const res = await call(handle!, '/api/approvals/apr-flagoff-591-006/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(403);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe(getMessage('api.approvals.api_decide_disabled', 'en'));
      expect(body.error).toMatch(/api_decide/);
    });

    it('403s with the catalog tr explanation when approval.api_decide is off and DECKENT_LANGUAGE=tr', async () => {
      process.env['DECKENT_LANGUAGE'] = 'tr';
      const broker = new ApprovalBroker(handle!.projectRoot);
      broker.submit(buildRequest('apr-flagoff-591-006-tr'));

      const res = await call(handle!, '/api/approvals/apr-flagoff-591-006-tr/decision', {
        method: 'POST',
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(403);
      expect(res.json<{ error: string }>().error).toBe(
        getMessage('api.approvals.api_decide_disabled', 'tr'),
      );
    });

    it('404s an unknown id with the catalog en text', async () => {
      enableApiDecide(handle!.projectRoot);
      const res = await call(handle!, '/api/approvals/does-not-exist/decision', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'unknown-request-591-006' },
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(404);
      expect(res.json<{ error: string }>().error).toBe(getMessage('api.approvals.not_found', 'en'));
    });

    it('409s an already-decided approval with the catalog en text, interpolating the category', async () => {
      enableApiDecide(handle!.projectRoot);
      const broker = new ApprovalBroker(handle!.projectRoot);
      const req = broker.submit(buildRequest('apr-double-591-006'));
      broker.decide(req.id, {
        decision: 'deny',
        decidedBy: 'someone',
        channel: 'terminal',
        decidedAt: '2026-08-20T00:05:00.000Z',
        reason: 'already handled',
      });

      const res = await call(handle!, '/api/approvals/apr-double-591-006/decision', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'already-decided-591-006' },
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(409);
      expect(res.json<{ error: string }>().error).toBe(
        getMessage('api.approvals.already_decided', 'en', { category: 'denied' }),
      );
    });

    it('409s an already-decided approval with the catalog tr text when DECKENT_LANGUAGE=tr', async () => {
      process.env['DECKENT_LANGUAGE'] = 'tr';
      enableApiDecide(handle!.projectRoot);
      const broker = new ApprovalBroker(handle!.projectRoot);
      const req = broker.submit(buildRequest('apr-double-591-006-tr'));
      broker.decide(req.id, {
        decision: 'allow',
        decidedBy: 'someone',
        channel: 'terminal',
        decidedAt: '2026-08-20T00:05:00.000Z',
        reason: 'already handled',
      });

      const res = await call(handle!, '/api/approvals/apr-double-591-006-tr/decision', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'already-decided-591-006-tr' },
        body: JSON.stringify({ decision: 'allow' }),
      });
      expect(res.status).toBe(409);
      expect(res.json<{ error: string }>().error).toBe(
        getMessage('api.approvals.already_decided', 'tr', { category: 'approved' }),
      );
    });
  });
});
