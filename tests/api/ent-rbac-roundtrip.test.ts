/**
 * born-575 (389-006) — ENT-RBAC-ROUNDTRIP.
 *
 * enterprise-endpoint's RBAC-role and rate-limit-rule write handlers
 * (handleEnterpriseRbacWrite / handleEnterpriseRateWrite) persist to
 * config.json, but the GET read endpoints (listRbacRoles / listRateLimits)
 * previously read only the built-in PERMISSION_MATRIX / live RateLimiter
 * snapshot — a written role/limit was never read back. These tests boot the
 * real HTTP server and assert the write→read round-trip is consistent.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';

// ─── OIDC JWT helpers (HS256) ────────────────────────────────────────────────

const OIDC_SECRET = 'test-oidc-hs256-rbac-roundtrip';
const OIDC_ISSUER = 'https://test-rbac-roundtrip.idp.dev';

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

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SPRINT_ID = 'sprint-rbac-roundtrip';

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-ent-rbac-rt-'));
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  writeFileSync(
    join(root, '.deckent', 'recently-works', `${SPRINT_ID}-events.jsonl`),
    JSON.stringify({
      timestamp: '2026-07-08T00:00:00.000Z',
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

async function bootServer(root: string): Promise<{ api: HttpApi; base: string }> {
  const api = createHttpServer(root, {
    port: 0,
    host: '127.0.0.1',
    rateLimitExemptLoopback: false,
    oidc: { issuer: OIDC_ISSUER, algorithm: 'HS256', key: OIDC_SECRET },
  });
  await new Promise<void>((resolve) => api.server.once('listening', resolve));
  const addr = api.server.address() as AddressInfo;
  return { api, base: `http://127.0.0.1:${addr.port}` };
}

function httpReq(base: string, path: string, method: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  let bodyStr: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(body);
  }
  return fetch(`${base}${path}`, { method, headers, body: bodyStr });
}

interface RbacRoleRow {
  role: string;
  permissions: string[];
}

interface RateLimitRow {
  endpoint: string;
  limit: number;
  remaining: number;
  resetAt: string;
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('born-575: enterprise RBAC-role / rate-limit write→read round-trip', () => {
  let currentApi: HttpApi | undefined;

  afterEach(async () => {
    if (currentApi) {
      try { await currentApi.close(); } catch { /* ignore */ }
      currentApi = undefined;
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // RBAC role round-trip
  // ══════════════════════════════════════════════════════════════════════════

  describe('/api/enterprise/rbac', () => {
    it('POST role → immediately visible in GET with the same value', async () => {
      const root = makeRoot();
      const { api, base } = await bootServer(root);
      currentApi = api;

      const created = await httpReq(base, '/api/enterprise/rbac', 'POST', {
        role: 'billing-admin',
        permissions: ['invoices:read', 'invoices:write'],
      });
      expect(created.status).toBe(201);

      const res = await httpReq(base, '/api/enterprise/rbac', 'GET');
      expect(res.status).toBe(200);
      const roles = await res.json() as RbacRoleRow[];

      // Written role reads back with the exact same value.
      const written = roles.find((r) => r.role === 'billing-admin');
      expect(written).toEqual({ role: 'billing-admin', permissions: ['invoices:read', 'invoices:write'] });

      // Built-in 3-role matrix is still present alongside the custom role.
      expect(roles.map((r) => r.role).sort()).toEqual(['admin', 'billing-admin', 'operator', 'viewer']);
    });

    it('PUT update → GET reflects the new permissions immediately', async () => {
      const root = makeRoot();
      const { api, base } = await bootServer(root);
      currentApi = api;

      await httpReq(base, '/api/enterprise/rbac', 'POST', { role: 'data-analyst', permissions: ['reports:read'] });
      const updated = await httpReq(base, '/api/enterprise/rbac/data-analyst', 'PUT', {
        permissions: ['reports:read', 'reports:export'],
      });
      expect(updated.status).toBe(200);

      const res = await httpReq(base, '/api/enterprise/rbac', 'GET');
      const roles = await res.json() as RbacRoleRow[];
      const row = roles.find((r) => r.role === 'data-analyst');
      expect(row).toEqual({ role: 'data-analyst', permissions: ['reports:read', 'reports:export'] });
    });

    it('DELETE → GET no longer returns the role, built-ins untouched', async () => {
      const root = makeRoot();
      const { api, base } = await bootServer(root);
      currentApi = api;

      await httpReq(base, '/api/enterprise/rbac', 'POST', { role: 'temp-role', permissions: ['x:read'] });
      const deleted = await httpReq(base, '/api/enterprise/rbac/temp-role', 'DELETE');
      expect(deleted.status).toBe(200);

      const res = await httpReq(base, '/api/enterprise/rbac', 'GET');
      const roles = await res.json() as RbacRoleRow[];
      expect(roles.find((r) => r.role === 'temp-role')).toBeUndefined();
      expect(roles.map((r) => r.role).sort()).toEqual(['admin', 'operator', 'viewer']);
    });

    it('custom role sharing a built-in name overrides its persisted permissions on read', async () => {
      const root = makeRoot();
      const { api, base } = await bootServer(root);
      currentApi = api;

      await httpReq(base, '/api/enterprise/rbac', 'POST', { role: 'viewer', permissions: ['custom:only'] });

      const res = await httpReq(base, '/api/enterprise/rbac', 'GET');
      const roles = await res.json() as RbacRoleRow[];
      const viewer = roles.find((r) => r.role === 'viewer');
      expect(viewer).toEqual({ role: 'viewer', permissions: ['custom:only'] });
      // Still exactly 3 rows — the override replaces, does not duplicate.
      expect(roles).toHaveLength(3);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Rate-limit rule round-trip
  // ══════════════════════════════════════════════════════════════════════════

  describe('/api/enterprise/rate', () => {
    it('POST rule → immediately visible in GET with the same limit', async () => {
      const root = makeRoot();
      const { api, base } = await bootServer(root);
      currentApi = api;

      const created = await httpReq(base, '/api/enterprise/rate', 'POST', {
        id: 'api-strict',
        endpoint: '/api/run',
        limit: 10,
      });
      expect(created.status).toBe(201);

      const res = await httpReq(base, '/api/enterprise/rate', 'GET');
      expect(res.status).toBe(200);
      const rows = await res.json() as RateLimitRow[];

      const written = rows.find((r) => r.endpoint === '/api/run');
      expect(written).toBeDefined();
      expect(written?.limit).toBe(10);
      expect(written?.remaining).toBe(10);
      expect(typeof written?.resetAt).toBe('string');
    });

    it('PUT update → GET reflects the new limit immediately', async () => {
      const root = makeRoot();
      const { api, base } = await bootServer(root);
      currentApi = api;

      await httpReq(base, '/api/enterprise/rate', 'POST', { id: 'rl-upd', endpoint: '/api/chat', limit: 20 });
      const updated = await httpReq(base, '/api/enterprise/rate/rl-upd', 'PUT', { limit: 50 });
      expect(updated.status).toBe(200);

      const res = await httpReq(base, '/api/enterprise/rate', 'GET');
      const rows = await res.json() as RateLimitRow[];
      const row = rows.find((r) => r.endpoint === '/api/chat');
      expect(row?.limit).toBe(50);
      expect(row?.remaining).toBe(50);
    });

    it('DELETE → GET no longer returns the rule', async () => {
      const root = makeRoot();
      const { api, base } = await bootServer(root);
      currentApi = api;

      await httpReq(base, '/api/enterprise/rate', 'POST', { id: 'rl-del', endpoint: '/api/x', limit: 5 });
      const deleted = await httpReq(base, '/api/enterprise/rate/rl-del', 'DELETE');
      expect(deleted.status).toBe(200);

      const res = await httpReq(base, '/api/enterprise/rate', 'GET');
      const rows = await res.json() as RateLimitRow[];
      expect(rows.find((r) => r.endpoint === '/api/x')).toBeUndefined();
    });

    it('persisted rule coexists with the live RateLimiter snapshot', async () => {
      const root = makeRoot();
      const { api, base } = await bootServer(root); // default rateLimit=100
      currentApi = api;

      // Trigger a live window row.
      await httpReq(base, '/api/enterprise/rbac', 'GET');
      await httpReq(base, '/api/enterprise/rate', 'POST', { id: 'rl-co', endpoint: '/api/co', limit: 7 });

      const res = await httpReq(base, '/api/enterprise/rate', 'GET');
      const rows = await res.json() as RateLimitRow[];

      // Live snapshot row still present (limit=100 default).
      expect(rows.some((r) => r.limit === 100)).toBe(true);
      // Persisted rule also present with its own value.
      const persisted = rows.find((r) => r.endpoint === '/api/co');
      expect(persisted).toEqual({ endpoint: '/api/co', limit: 7, remaining: 7, resetAt: '' });
    });
  });
});
