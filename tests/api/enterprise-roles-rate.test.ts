/**
 * DASH-UX-6 — Enterprise RBAC role + Rate-limit rule CRUD write endpoints.
 *
 * Exercises handleEnterpriseRbacWrite and handleEnterpriseRateWrite through the
 * real HTTP server (hermetic tmpdir, OIDC HS256 mode) so the full auth-gate +
 * enterprise RBAC gate + handler chain is exercised end-to-end.
 *
 * Coverage:
 *   - RBAC: POST (create 201), PUT (update 200), DELETE (200)
 *   - Rate: POST (create 201), PUT (update 200), DELETE (200)
 *   - 403 when caller has OIDC viewer role (RBAC gate fires)
 *   - 400 on invalid body (Zod validation)
 *   - Audit entry written to the events stream on success
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';

// ─── OIDC JWT helpers (HS256) ────────────────────────────────────────────────

const OIDC_SECRET = 'test-oidc-hs256-dashux6';
const OIDC_ISSUER = 'https://test-dashux6.idp.dev';

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function makeJwt(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: OIDC_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600, ...claims }));
  const sig = createHmac('sha256', OIDC_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const ADMIN_TOKEN = makeJwt({ sub: 'admin-user', role: 'admin' });
const VIEWER_TOKEN = makeJwt({ sub: 'viewer-user', role: 'viewer' });

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SPRINT_ID = 'sprint-dashux6';

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-ent-rr-'));
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  // Minimal events stream so latestEventSprintId resolves → audit writes land.
  writeFileSync(
    join(root, '.deckent', 'recently-works', `${SPRINT_ID}-events.jsonl`),
    JSON.stringify({
      timestamp: '2026-06-16T00:00:00.000Z',
      sequence: 1,
      protocol_version: '1.0',
      source: 'deckent',
      target: '*',
      channel: 'BRAIN→*:SPRINT_PHASE_CHANGE',
      payload: {},
    }) + '\n',
    'utf-8',
  );
  return root;
}

function readConfig(root: string): Record<string, unknown> | null {
  const p = join(root, '.deckent', 'config.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>) : null;
}

function readEvents(root: string): string {
  const p = join(root, '.deckent', 'recently-works', `${SPRINT_ID}-events.jsonl`);
  return existsSync(p) ? readFileSync(p, 'utf-8') : '';
}

// ─── Server boot ─────────────────────────────────────────────────────────────

async function bootServer(root: string): Promise<{ api: HttpApi; base: string }> {
  const api = createHttpServer(root, {
    port: 0,
    host: '127.0.0.1',
    rateLimitExemptLoopback: false,
    // OIDC-only mode (no static token) — admin/viewer roles are distinguished via JWT claims.
    oidc: { issuer: OIDC_ISSUER, algorithm: 'HS256', key: OIDC_SECRET },
  });
  await new Promise<void>((resolve) => api.server.once('listening', resolve));
  const addr = api.server.address() as AddressInfo;
  return { api, base: `http://127.0.0.1:${addr.port}` };
}

function httpReq(
  base: string,
  path: string,
  method: string,
  body?: unknown,
  token = ADMIN_TOKEN,
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let bodyStr: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(body);
  }
  return fetch(`${base}${path}`, { method, headers, body: bodyStr });
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('enterprise RBAC + Rate-limit CRUD write endpoints (DASH-UX-6)', () => {
  let currentApi: HttpApi | undefined;
  let currentRoot: string | undefined;

  afterEach(async () => {
    if (currentApi) {
      try { await currentApi.close(); } catch { /* ignore */ }
      currentApi = undefined;
    }
    if (currentRoot) {
      try { rmSync(currentRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      currentRoot = undefined;
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // RBAC role write endpoints
  // ══════════════════════════════════════════════════════════════════════════

  describe('/api/enterprise/rbac — CRUD writes', () => {
    it('POST create → 201, persists role in config, writes create audit', async () => {
      const root = makeRoot();
      currentRoot = root;
      const { api, base } = await bootServer(root);
      currentApi = api;

      const res = await httpReq(base, '/api/enterprise/rbac', 'POST', { role: 'billing-admin', permissions: ['invoices:read', 'invoices:write'] });
      expect(res.status).toBe(201);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toMatchObject({ role: 'billing-admin', permissions: ['invoices:read', 'invoices:write'] });

      const cfg = readConfig(root);
      const roles = cfg?.['rbac_roles'] as Array<Record<string, unknown>> | undefined;
      expect(roles).toHaveLength(1);
      expect(roles?.[0]).toMatchObject({ role: 'billing-admin' });
      expect(readEvents(root)).toContain('enterprise:rbac:create');
    });

    it('PUT /:role update → 200, persists updated permissions', async () => {
      const root = makeRoot();
      currentRoot = root;
      writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ rbac_roles: [{ role: 'data-analyst', permissions: ['reports:read'] }] }), 'utf-8');
      const { api, base } = await bootServer(root);
      currentApi = api;

      const res = await httpReq(base, '/api/enterprise/rbac/data-analyst', 'PUT', { permissions: ['reports:read', 'reports:export'] });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toMatchObject({ role: 'data-analyst', permissions: ['reports:read', 'reports:export'] });
      expect(readEvents(root)).toContain('enterprise:rbac:update');
    });

    it('DELETE /:role → 200, removes only the target role', async () => {
      const root = makeRoot();
      currentRoot = root;
      writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({
        rbac_roles: [{ role: 'role-del', permissions: [] }, { role: 'role-keep', permissions: ['x'] }],
      }), 'utf-8');
      const { api, base } = await bootServer(root);
      currentApi = api;

      const res = await httpReq(base, '/api/enterprise/rbac/role-del', 'DELETE');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, role: 'role-del' });

      const cfg = readConfig(root);
      const roles = cfg?.['rbac_roles'] as Array<Record<string, unknown>>;
      expect(roles.map((r) => r['role'])).toEqual(['role-keep']);
      expect(readEvents(root)).toContain('enterprise:rbac:delete');
    });

    it('RBAC gate: OIDC viewer → 403, nothing persisted', async () => {
      const root = makeRoot();
      currentRoot = root;
      const { api, base } = await bootServer(root);
      currentApi = api;

      const res = await httpReq(base, '/api/enterprise/rbac', 'POST', { role: 'x', permissions: [] }, VIEWER_TOKEN);
      expect(res.status).toBe(403);
      expect(readConfig(root)).toBeNull();
    });

    it('POST invalid body → 400 (missing permissions, unknown field)', async () => {
      const root = makeRoot();
      currentRoot = root;
      const { api, base } = await bootServer(root);
      currentApi = api;

      // Missing permissions
      const r1 = await httpReq(base, '/api/enterprise/rbac', 'POST', { role: 'r' });
      expect(r1.status).toBe(400);

      // Unknown field (.strict() rejects it)
      const r2 = await httpReq(base, '/api/enterprise/rbac', 'POST', { role: 'r', permissions: [], evil: true });
      expect(r2.status).toBe(400);

      expect(readConfig(root)).toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Rate-limit rule write endpoints
  // ══════════════════════════════════════════════════════════════════════════

  describe('/api/enterprise/rate — CRUD writes', () => {
    it('POST create → 201, persists rule in config, writes create audit', async () => {
      const root = makeRoot();
      currentRoot = root;
      const { api, base } = await bootServer(root);
      currentApi = api;

      const res = await httpReq(base, '/api/enterprise/rate', 'POST', { id: 'api-strict', endpoint: '/api/run', limit: 10 });
      expect(res.status).toBe(201);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toMatchObject({ id: 'api-strict', endpoint: '/api/run', limit: 10 });

      const cfg = readConfig(root);
      const rules = cfg?.['rate_rules'] as Array<Record<string, unknown>> | undefined;
      expect(rules).toHaveLength(1);
      expect(rules?.[0]).toMatchObject({ id: 'api-strict', endpoint: '/api/run', limit: 10 });
      expect(readEvents(root)).toContain('enterprise:rate:create');
    });

    it('PUT /:id update → 200, merges fields', async () => {
      const root = makeRoot();
      currentRoot = root;
      writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ rate_rules: [{ id: 'rl-upd', endpoint: '/api/chat', limit: 20 }] }), 'utf-8');
      const { api, base } = await bootServer(root);
      currentApi = api;

      const res = await httpReq(base, '/api/enterprise/rate/rl-upd', 'PUT', { limit: 50 });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toMatchObject({ id: 'rl-upd', endpoint: '/api/chat', limit: 50 });
      expect(readEvents(root)).toContain('enterprise:rate:update');
    });

    it('DELETE /:id → 200, removes only the target rule', async () => {
      const root = makeRoot();
      currentRoot = root;
      writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({
        rate_rules: [{ id: 'rl-del', endpoint: '/api/x', limit: 5 }, { id: 'rl-keep', endpoint: '/api/y', limit: 10 }],
      }), 'utf-8');
      const { api, base } = await bootServer(root);
      currentApi = api;

      const res = await httpReq(base, '/api/enterprise/rate/rl-del', 'DELETE');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, id: 'rl-del' });

      const cfg = readConfig(root);
      const rules = cfg?.['rate_rules'] as Array<Record<string, unknown>>;
      expect(rules.map((r) => r['id'])).toEqual(['rl-keep']);
      expect(readEvents(root)).toContain('enterprise:rate:delete');
    });

    it('RBAC gate: OIDC viewer → 403, nothing persisted', async () => {
      const root = makeRoot();
      currentRoot = root;
      const { api, base } = await bootServer(root);
      currentApi = api;

      const res = await httpReq(base, '/api/enterprise/rate', 'POST', { id: 'x', endpoint: '/api/x', limit: 5 }, VIEWER_TOKEN);
      expect(res.status).toBe(403);
      expect(readConfig(root)).toBeNull();
    });

    it('POST invalid body → 400 (missing limit, unknown field)', async () => {
      const root = makeRoot();
      currentRoot = root;
      const { api, base } = await bootServer(root);
      currentApi = api;

      // Missing limit
      const r1 = await httpReq(base, '/api/enterprise/rate', 'POST', { id: 'x', endpoint: '/api/x' });
      expect(r1.status).toBe(400);

      // Unknown field (.strict() rejects it)
      const r2 = await httpReq(base, '/api/enterprise/rate', 'POST', { id: 'x', endpoint: '/api/x', limit: 5, evil: true });
      expect(r2.status).toBe(400);

      expect(readConfig(root)).toBeNull();
    });
  });
});
