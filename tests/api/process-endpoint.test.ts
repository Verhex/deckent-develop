/**
 * Tests for /api/process/* routes (process mode — the client-facing execution
 * surface). Hermetic: tmpdir project root via startTestServer. The submit cases
 * use a side-effecting capability (erp.write) so they PARK (no worker spawn /
 * external call) — deterministic; auto-execution is covered by the controller
 * unit tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

describe('/api/process/* routes', () => {
  let handle: TestServerHandle;
  afterEach(async () => {
    if (handle) { await handle.close(); handle = undefined as unknown as TestServerHandle; }
  });

  it('POST /api/process/submit (erp.write → parks) returns an executionId + pending-approval', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/process/submit', {
      method: 'POST',
      body: JSON.stringify({ description: 'post invoice to ERP', kind: 'capability', capabilityTarget: { capability: 'erp.write', connector: 'odoo' } }),
    });
    expect(res.status).toBe(200);
    const body = res.json<{ executionId: string; status: string }>();
    expect(body.executionId).toMatch(/^proc-/);
    expect(body.status).toBe('pending-approval');
  });

  it('GET /api/process/status/<id> reflects the submitted (parked) entry', async () => {
    handle = await startTestServer({ disableAuth: true });
    const submit = await call(handle, '/api/process/submit', {
      method: 'POST',
      body: JSON.stringify({ description: 'sync ledger', kind: 'capability', capabilityTarget: { capability: 'erp.write' } }),
    });
    const id = submit.json<{ executionId: string }>().executionId;
    const status = await call(handle, `/api/process/status/${id}`);
    expect(status.status).toBe(200);
    const rec = status.json<{ id: string; status: string; kind: string }>();
    expect(rec.id).toBe(id);
    expect(rec.kind).toBe('capability');
    expect(rec.status).toBe('pending'); // parked, awaiting approval
  });

  it('POST /api/process/submit without a description → 400', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/process/submit', { method: 'POST', body: JSON.stringify({ kind: 'task' }) });
    expect(res.status).toBe(400);
  });

  it('GET /api/process/status/<unknown> → 404', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/process/status/proc-does-not-exist');
    expect(res.status).toBe(404);
  });
});
