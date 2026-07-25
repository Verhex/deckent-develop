/**
 * Tests for /api/process/* routes (process mode — the client-facing execution
 * surface). Hermetic: tmpdir project root via startTestServer. The submit cases
 * use a side-effecting capability (erp.write) so they PARK (no worker spawn /
 * external call) — deterministic; auto-execution is covered by the controller
 * unit tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

// ─── Real OIDC HS256 bearer setup (mirrors tests/api/auth-me-endpoint.test.ts) ──
// The HTTP server verifies HS256 JWTs when `.deckent/config.json` carries an
// `api_oidc` block (server.ts → auth.ts bearerAuthMiddleware). A valid token
// passes the auth-gate; `deriveRequestPrincipal` then extracts its tenant/role/sub
// claims — a REAL principal, unlike the degenerate DECKENT_API_AUTH_DISABLED path
// (no bearer → tenantId undefined → crossTenant trivially false).
const OIDC_SECRET = 'test-oidc-secret-289-process-endpoint';
const OIDC_ISSUER = 'https://idp.test/289';
const OIDC_CONFIG = {
  api_oidc: { enabled: true, issuer: OIDC_ISSUER, algorithm: 'HS256', key: OIDC_SECRET },
};

function makeHs256(claims: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

/** Build an `Authorization: Bearer <jwt>` header carrying the given identity claims. */
function bearer(claims: Record<string, unknown>): Record<string, string> {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { Authorization: `Bearer ${makeHs256({ iss: OIDC_ISSUER, exp, ...claims }, OIDC_SECRET)}` };
}

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

  it('returns a structured provider-authority HOLD for an auto task without HTTP 500', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/process/submit', {
      method: 'POST',
      body: JSON.stringify({
        description: 'summarize the changelog',
        kind: 'task',
        scopeDir: 'docs/',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.json<{
      status: string;
      providerAuthorityHold: {
        reasonCode: string;
        executionId: string;
        authorityEvidenceRefs: string[];
      };
    }>()).toMatchObject({
      status: 'held',
      providerAuthorityHold: {
        reasonCode: expect.stringMatching(
          /^(policy_authority_unavailable|keyring_unavailable)$/u,
        ),
        executionId: expect.stringMatching(/^proc-/u),
        authorityEvidenceRefs: [
          expect.stringMatching(/^provider-authority:[a-f0-9]{64}$/u),
        ],
      },
    });
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

  it('SECURITY (anti-IDOR): a cross-tenant OIDC bearer gets 404 on another tenant\'s entry (no existence leak)', async () => {
    // Real auth-gate: HS256 JWTs verified via the seeded api_oidc block — NOT
    // DECKENT_API_AUTH_DISABLED. Each request carries a tenant-bearing principal.
    handle = await startTestServer({ seed: { config: OIDC_CONFIG } });

    // tenant-B submits a parking (erp.write) entry → durable entry stamped tenant-B.
    const submit = await call(handle, '/api/process/submit', {
      method: 'POST',
      headers: bearer({ sub: 'user-b', tenant: 'tenant-B' }),
      body: JSON.stringify({ description: 'tenant-B ledger sync', kind: 'capability', capabilityTarget: { capability: 'erp.write' } }),
    });
    expect(submit.status).toBe(200);
    const id = submit.json<{ executionId: string }>().executionId;

    // Owner (tenant-B) sees its own entry → 200 (proves the entry truly exists).
    const owner = await call(handle, `/api/process/status/${id}`, { headers: bearer({ sub: 'user-b', tenant: 'tenant-B' }) });
    expect(owner.status).toBe(200);

    // Cross-tenant (tenant-A) → 404. The crossTenant branch fires: a tenant-tagged
    // entry is invisible to a foreign tenant and leaks no existence signal.
    const crossStatus = await call(handle, `/api/process/status/${id}`, { headers: bearer({ sub: 'user-a', tenant: 'tenant-A' }) });
    expect(crossStatus.status).toBe(404);
    // Same anti-IDOR scope on the /result alias.
    const crossResult = await call(handle, `/api/process/result/${id}`, { headers: bearer({ sub: 'user-a', tenant: 'tenant-A' }) });
    expect(crossResult.status).toBe(404);

    // Control: an admin-role principal (even with a different tenant) sees it → 200.
    // This proves the 404 above is a tenant-scope decision, not a real "not found".
    const admin = await call(handle, `/api/process/status/${id}`, { headers: bearer({ sub: 'root', tenant: 'tenant-A', role: 'admin' }) });
    expect(admin.status).toBe(200);
    expect(admin.json<{ id: string }>().id).toBe(id);
  });

  it('SECURITY (fail-closed): claim-siz (no-tenant) principal cannot access another-tenant entry → 404', async () => {
    // Seed the backlog with an entry stamped tenant: 'other-tenant' directly.
    // Then access with no bearer (claim-siz → callerTenant='local') → fail-closed → 404.
    handle = await startTestServer({ disableAuth: true });
    const blDir = join(handle.projectRoot, '.deckent', 'autonomous');
    mkdirSync(blDir, { recursive: true });
    const seededEntry = {
      id: 'proc-seed-001',
      title: 'Seeded other-tenant entry',
      kind: 'task',
      policy: 'auto',
      status: 'pending',
      tenant: 'other-tenant',
      trigger: { type: 'one-off' },
      spec: { description: 'seeded for fail-closed test' },
    };
    writeFileSync(join(blDir, 'backlog.json'), JSON.stringify({ _version: '1.0', entries: [seededEntry] }));

    // No bearer → principal.tenantId = undefined → callerTenant = 'local'
    // Entry tenant = 'other-tenant' ≠ 'local' → allowed = false → 404
    const status = await call(handle, '/api/process/status/proc-seed-001');
    expect(status.status).toBe(404);
    const result = await call(handle, '/api/process/result/proc-seed-001');
    expect(result.status).toBe(404);
  });

  it('SECURITY (fail-closed): claim-siz principal sees local (untagged) entry → 200 (v1-default)', async () => {
    // A no-tenant principal should still see untagged ('local') entries.
    // entry.tenant = undefined → entry.tenant??'local' = 'local' = callerTenant → allowed.
    handle = await startTestServer({ disableAuth: true });
    const submit = await call(handle, '/api/process/submit', {
      method: 'POST',
      body: JSON.stringify({ description: 'local task', kind: 'capability', capabilityTarget: { capability: 'erp.write' } }),
    });
    expect(submit.status).toBe(200);
    const id = submit.json<{ executionId: string }>().executionId;

    // Same no-bearer request → principal.tenantId = undefined → callerTenant = 'local'
    // Entry was submitted with no bearer → entry.tenant = undefined → 'local' match → 200
    const statusRes = await call(handle, `/api/process/status/${id}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.json<{ id: string }>().id).toBe(id);
  });

  it('SECURITY (tenant-stamp): submit stamps the durable entry tenant from the OIDC claim, not the client body', async () => {
    handle = await startTestServer({ seed: { config: OIDC_CONFIG } });

    // Bearer carries tenant=tenant-real; the request body tries to spoof a DIFFERENT
    // tenant + actor. The server must derive the tenant from the verified claim only.
    const submit = await call(handle, '/api/process/submit', {
      method: 'POST',
      headers: bearer({ sub: 'user-real', tenant: 'tenant-real' }),
      body: JSON.stringify({
        description: 'post invoice to ERP',
        kind: 'capability',
        capabilityTarget: { capability: 'erp.write' },
        // attacker-controlled identity — MUST be ignored, not trusted
        tenant: 'tenant-spoofed',
        actor: { id: 'attacker', tenantId: 'tenant-spoofed' },
      }),
    });
    expect(submit.status).toBe(200);
    const id = submit.json<{ executionId: string }>().executionId;

    const bl = JSON.parse(readFileSync(join(handle.projectRoot, '.deckent', 'autonomous', 'backlog.json'), 'utf-8'));
    const entry = bl.entries.find((e: { id: string }) => e.id === id);
    // Server-derived from the OIDC tenant claim — positive path the degenerate test missed.
    expect(entry.tenant).toBe('tenant-real');
    // Client-supplied tenant is dropped.
    expect(entry.tenant).not.toBe('tenant-spoofed');
  });
});
