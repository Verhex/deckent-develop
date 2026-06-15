/**
 * Tests for /api/autonomous/* routes (W6-W7 — the dashboard AutonomousPage backend).
 * Hermetic: tmpdir project root via startTestServer, no gitignored state. Mirrors
 * the nervous-endpoint contract so the dashboard pages share one shape.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

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

  it('POST /api/autonomous/approve/<id> returns 200 with the approved id', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/approve/trig-001', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ approved: string }>().approved).toBe('trig-001');
  });

  it('POST /api/autonomous/reject/<id> returns 200 with the rejected id', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/reject/trig-002', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ rejected: string }>().rejected).toBe('trig-002');
  });

  it('unknown /api/autonomous/* path falls through to 404', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/autonomous/bogus');
    expect(res.status).toBe(404);
  });
});
