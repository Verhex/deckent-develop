/**
 * Tests for /api/autonomous/* routes (W6-W7 — the dashboard AutonomousPage backend).
 * Hermetic: tmpdir project root via startTestServer, no gitignored state. Mirrors
 * the nervous-endpoint contract so the dashboard pages share one shape.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';
import { makeApprovalGate } from '../../src/orchestra/autonomous/approval-adapter.js';
import { autonomousPendingPath } from '../../src/core/constants.js';
import type { AutonomousTrigger } from '../../src/orchestra/autonomous-runtime.js';

/** Park a real pending trigger through the SAME canonical resolver the endpoint's
 *  gate reads (autonomousPendingPath), so this test pins the real park↔read
 *  contract — not a hardcoded copy that would keep passing if production drifts. */
async function parkPending(projectRoot: string, id: string): Promise<void> {
  const trigger: AutonomousTrigger = { id, source: 'scheduled-flow', action: 'start', requestedBy: 'system' };
  await makeApprovalGate({ pendingPath: autonomousPendingPath(projectRoot) }).request(trigger);
}

describe('/api/autonomous/* routes', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('GET /api/autonomous/status returns pendingCount + backlogSummary + recentAudit', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/status');
    expect(res.status).toBe(200);
    const body = res.json<{
      pendingCount: number;
      backlogSummary: { total: number; pending: number; running: number; parked: number; done: number; failed: number };
      recentAudit: unknown[];
    }>();
    expect(typeof body.pendingCount).toBe('number');
    expect(typeof body.backlogSummary.total).toBe('number');
    expect(Array.isArray(body.recentAudit)).toBe(true);
  });

  it('GET /api/autonomous/pending returns an array (empty on a fresh project)', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/pending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('GET /api/autonomous/backlog returns an array (empty on a fresh project)', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/backlog');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /api/autonomous/approve/<id> on a PARKED trigger returns 200 with the approved id', async () => {
    handle = await startTestServer({ disableAuth: true });
    await parkPending(handle.projectRoot, 'trig-001');
    const res = await call(handle, '/api/autonomous/approve/trig-001', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ approved: string }>().approved).toBe('trig-001');
  });

  it('POST /api/autonomous/reject/<id> on a PARKED trigger returns 200 with the rejected id', async () => {
    handle = await startTestServer({ disableAuth: true });
    await parkPending(handle.projectRoot, 'trig-002');
    const res = await call(handle, '/api/autonomous/reject/trig-002', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ rejected: string }>().rejected).toBe('trig-002');
  });

  // APPROVAL-001 T1: a forged/stale id was never parked — the gate must refuse it
  // with a typed 403 instead of minting an `approved` outcome for a phantom request.
  it('POST /api/autonomous/approve/<forged-id> is refused with a typed 403', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/approve/forged-999', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = res.json<{ code: string; triggerId: string }>();
    expect(body.code).toBe('APR_UNKNOWN_REQUEST');
    expect(body.triggerId).toBe('forged-999');
  });

  it('POST /api/autonomous/reject/<forged-id> is refused with a typed 403', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/reject/forged-998', { method: 'POST' });
    expect(res.status).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('APR_UNKNOWN_REQUEST');
  });

  it('unknown /api/autonomous/* path falls through to 404', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/bogus');
    expect(res.status).toBe(404);
  });
});
