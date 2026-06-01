/**
 * Tests for /api/nervous/* routes (Sprint 218 follow-up — run-verify caught
 * NervousPage 404; backend routes were never wired). Hermetic: tmpdir project
 * root via startTestServer, no gitignored state.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

describe('/api/nervous/* routes', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('GET /api/nervous/status returns panicGuard + detectors + pendingCount', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/status');
    expect(res.status).toBe(200);
    const body = res.json<{ panicGuard: boolean; detectors: unknown[]; pendingCount: number }>();
    expect(typeof body.panicGuard).toBe('boolean');
    expect(Array.isArray(body.detectors)).toBe(true);
    expect(typeof body.pendingCount).toBe('number');
  });

  it('GET /api/nervous/pending returns an array (empty on a fresh project)', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/pending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /api/nervous/accept/<id> returns 200 with the accepted id', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/accept/task-001', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ accepted: string }>().accepted).toBe('task-001');
  });

  it('POST /api/nervous/reject/<id> returns 200 with the rejected id', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/reject/task-002', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ rejected: string }>().rejected).toBe('task-002');
  });

  it('unknown /api/nervous/* path falls through to 404', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/bogus');
    expect(res.status).toBe(404);
  });
});
