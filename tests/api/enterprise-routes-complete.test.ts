/**
 * Sprint 279 Task 279-008 — F7-ENT-verify regression lock.
 *
 * Verifies that all 4 enterprise dashboard endpoints are properly mounted and
 * return the correct shapes after the 279-001 audit-writer import-cycle fix
 * (audit-writer now imports from core/event-stream instead of orchestra/event-stream).
 *
 * Coverage:
 *   - /api/enterprise/tenants  → TenantInfo[]
 *   - /api/enterprise/rbac     → RbacRole[]
 *   - /api/enterprise/audit    → AuditEntry[]
 *   - /api/enterprise/rate     → RateLimitInfo[]
 *
 * Each endpoint must:
 *   - Return 200 (never 404/500) — even when data is absent (EmptyState)
 *   - Be auth-gated (401 without bearer)
 *   - Return an array matching the EnterprisePage.tsx interface shape
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import { AUDIT_EVENT_CHANNEL } from '../../src/core/audit-writer.js';

const TOKEN = 'ent-complete-279';

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-ent-complete-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

async function bootServer(root: string, rateLimit?: number): Promise<{ api: HttpApi; base: string }> {
  const api = createHttpServer(root, {
    port: 0,
    apiToken: TOKEN,
    host: '127.0.0.1',
    rateLimitExemptLoopback: false,
    ...(rateLimit !== undefined ? { rateLimit } : {}),
  });
  await new Promise<void>((resolve) => api.server.once('listening', resolve));
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Server did not bind');
  }
  return { api, base: `http://127.0.0.1:${addr.port}` };
}

function get(base: string, path: string, auth = true): Promise<Response> {
  return fetch(`${base}${path}`, auth ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {});
}

function writeAuditFixture(
  root: string,
  sprintId: string,
  events: Array<{ actor: string; action: string; target?: string; hmac?: string }>,
): void {
  const lines = events.map((e, i) =>
    JSON.stringify({
      timestamp: `2026-06-10T00:00:0${i}.000Z`,
      sequence: i + 1,
      protocol_version: '1.0',
      source: 'deckent',
      target: e.target ?? '*',
      channel: AUDIT_EVENT_CHANNEL,
      payload: {
        actor: e.actor,
        action: e.action,
        target: e.target ?? '',
        timestamp: `2026-06-10T00:00:0${i}.000Z`,
        hmac: e.hmac ?? `hmac-${i}`,
      },
    }),
  );
  writeFileSync(
    join(root, '.deckent', `${sprintId}-events.jsonl`),
    lines.join('\n') + '\n',
    'utf-8',
  );
}

describe('/api/enterprise/* — complete shape + auth regression lock (279-008)', () => {
  let root: string | undefined;
  let api: HttpApi | undefined;

  afterEach(async () => {
    if (api) {
      try { await api.close(); } catch { /* ignore */ }
      api = undefined;
    }
    if (root) {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
      root = undefined;
    }
  });

  // ─── Test 1: all 4 endpoints return 200 with auth (empty project) ──────

  it('all 4 endpoints return 200 with an array when no data is present', async () => {
    root = makeRoot();
    const { api: a, base } = await bootServer(root);
    api = a;

    const paths = ['/api/enterprise/tenants', '/api/enterprise/rbac', '/api/enterprise/audit', '/api/enterprise/rate'];
    for (const path of paths) {
      const res = await get(base, path);
      expect(res.status, `${path} should be 200`).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body), `${path} should return an array`).toBe(true);
    }
  });

  // ─── Test 2: tenants — empty + shape ─────────────────────────────────

  it('tenants: empty project → 200 []', async () => {
    root = makeRoot();
    const { api: a, base } = await bootServer(root);
    api = a;

    const res = await get(base, '/api/enterprise/tenants');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('tenants: config entries map to TenantInfo shape', async () => {
    root = makeRoot();
    writeFileSync(
      join(root, '.deckent', 'config.json'),
      JSON.stringify({
        tenants: [
          'demo',
          { id: 'prod', name: 'Production', status: 'active', users: 12, createdAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
      'utf-8',
    );
    const { api: a, base } = await bootServer(root);
    api = a;

    const res = await get(base, '/api/enterprise/tenants');
    expect(res.status).toBe(200);
    const tenants = await res.json() as Array<Record<string, unknown>>;
    expect(tenants).toHaveLength(2);
    // Validate TenantInfo shape fields
    for (const t of tenants) {
      expect(typeof t['id']).toBe('string');
      expect(typeof t['name']).toBe('string');
      expect(typeof t['status']).toBe('string');
      expect(typeof t['users']).toBe('number');
      expect(typeof t['createdAt']).toBe('string');
    }
    expect(tenants[1]).toMatchObject({ id: 'prod', name: 'Production', status: 'active', users: 12 });
  });

  // ─── Test 3: rbac — three roles, inheritance ─────────────────────────

  it('rbac: returns admin/operator/viewer roles with permissions arrays', async () => {
    root = makeRoot();
    const { api: a, base } = await bootServer(root);
    api = a;

    const res = await get(base, '/api/enterprise/rbac');
    expect(res.status).toBe(200);
    const roles = await res.json() as Array<{ role: string; permissions: string[] }>;

    // All 3 roles present
    expect(roles.map((r) => r.role).sort()).toEqual(['admin', 'operator', 'viewer']);

    // RbacRole shape: { role: string, permissions: string[] }
    for (const r of roles) {
      expect(typeof r.role).toBe('string');
      expect(Array.isArray(r.permissions)).toBe(true);
      expect(r.permissions.every((p) => typeof p === 'string')).toBe(true);
    }

    // Permission inheritance: admin has at least all viewer permissions
    const admin = roles.find((r) => r.role === 'admin')!;
    const viewer = roles.find((r) => r.role === 'viewer')!;
    expect(viewer.permissions.length).toBeGreaterThan(0);
    for (const p of viewer.permissions) {
      expect(admin.permissions).toContain(p);
    }
  });

  // ─── Test 4: audit — empty + shape + access:denied mapping ──────────

  it('audit: empty project → 200 []', async () => {
    root = makeRoot();
    const { api: a, base } = await bootServer(root);
    api = a;

    const res = await get(base, '/api/enterprise/audit');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('audit: events map to AuditEntry shape; access:denied → result=denied', async () => {
    root = makeRoot();
    writeAuditFixture(root, 'sprint-001', [
      { actor: 'brain', action: 'config:read', target: 'config.json', hmac: 'h-abc' },
      { actor: 'worker', action: 'access:denied', target: 'secret.deck', hmac: 'h-def' },
    ]);
    const { api: a, base } = await bootServer(root);
    api = a;

    const res = await get(base, '/api/enterprise/audit');
    expect(res.status).toBe(200);
    const entries = await res.json() as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(2);

    // AuditEntry shape: { id, action, actor, resource, timestamp, result }
    for (const e of entries) {
      expect(typeof e['id']).toBe('string');
      expect(typeof e['action']).toBe('string');
      expect(typeof e['actor']).toBe('string');
      expect(typeof e['resource']).toBe('string');
      expect(typeof e['timestamp']).toBe('string');
      expect(['success', 'denied']).toContain(e['result']);
    }

    expect(entries[0]).toMatchObject({ id: 'h-abc', action: 'config:read', actor: 'brain', result: 'success' });
    expect(entries[1]).toMatchObject({ action: 'access:denied', result: 'denied' });
  });

  // ─── Test 5: rate — shape + disabled → [] ───────────────────────────

  it('rate: rate limiting disabled → 200 []', async () => {
    root = makeRoot();
    const { api: a, base } = await bootServer(root, 0);
    api = a;

    const res = await get(base, '/api/enterprise/rate');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('rate: active limiter returns RateLimitInfo shape entries', async () => {
    root = makeRoot();
    const { api: a, base } = await bootServer(root); // default 100 req/min
    api = a;

    // Trigger a window entry
    await get(base, '/api/enterprise/rbac');
    const res = await get(base, '/api/enterprise/rate');
    expect(res.status).toBe(200);
    const rows = await res.json() as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);

    // RateLimitInfo shape: { endpoint, limit, remaining, resetAt }
    const row = rows[0]!;
    expect(typeof row['endpoint']).toBe('string');
    expect(typeof row['limit']).toBe('number');
    expect(typeof row['remaining']).toBe('number');
    expect((row['remaining'] as number)).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(row['resetAt'] as string))).toBe(false);
    expect(row['limit']).toBe(100);
  });

  // ─── Test 6: auth gate — all 4 reject unauthenticated requests ──────

  it('all 4 endpoints reject unauthenticated requests with 401', async () => {
    root = makeRoot();
    const { api: a, base } = await bootServer(root);
    api = a;

    const paths = ['/api/enterprise/tenants', '/api/enterprise/rbac', '/api/enterprise/audit', '/api/enterprise/rate'];
    for (const path of paths) {
      const res = await get(base, path, false); // no auth
      expect(res.status, `${path} should be 401 without auth`).toBe(401);
    }
  });

  // ─── Test 7: unknown sub-path falls through → 404 ────────────────────

  it('unknown /api/enterprise/ sub-path → 404', async () => {
    root = makeRoot();
    const { api: a, base } = await bootServer(root);
    api = a;

    const res = await get(base, '/api/enterprise/missing');
    expect(res.status).toBe(404);
  });
});
