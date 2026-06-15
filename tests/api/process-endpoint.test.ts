/**
 * Tests for /api/process/* routes (process mode — the client-facing execution
 * surface). Hermetic: tmpdir project root via startTestServer. The submit cases
 * use a side-effecting capability (erp.write) so they PARK (no worker spawn /
 * external call) — deterministic; auto-execution is covered by the controller
 * unit tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('SECURITY: client-supplied actor/tenant in the body is IGNORED (server-derived)', async () => {
    handle = await startTestServer({ disableAuth: true });
    const submit = await call(handle, '/api/process/submit', {
      method: 'POST',
      body: JSON.stringify({
        description: 'tenant spoof attempt',
        kind: 'capability',
        capabilityTarget: { capability: 'erp.write' },
        // attacker-controlled identity — MUST be dropped, not trusted
        actor: { id: 'attacker', tenantId: 'victim-tenant' },
        tenant: 'victim-tenant',
        origin: 'webhook',
      }),
    });
    expect(submit.status).toBe(200);
    const id = submit.json<{ executionId: string }>().executionId;
    const bl = JSON.parse(readFileSync(join(handle.projectRoot, '.deckent', 'autonomous', 'backlog.json'), 'utf-8'));
    const entry = bl.entries.find((e: { id: string }) => e.id === id);
    // the spoofed tenant never reaches the durable entry (no bearer → no tenant)
    expect(entry.tenant).not.toBe('victim-tenant');
  });
});
