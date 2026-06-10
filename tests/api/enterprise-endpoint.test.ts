/**
 * Sprint 269 Task 269-001 — /api/enterprise/{tenants,rbac,audit,rate}
 * (audit finding B-Enterprise).
 *
 * The dashboard EnterprisePage (src/dashboard/src/pages/EnterprisePage.tsx)
 * fetches four endpoints that did not exist — the page rendered eternal
 * skeletons. These tests boot the REAL HTTP server against tmpdir fixtures
 * and assert:
 *   - response shapes match the page's interfaces EXACTLY
 *     (TenantInfo / RbacRole / AuditEntry / RateLimitInfo)
 *   - missing data → empty-array-with-200 (never 404/500) so the page can
 *     render its EmptyState
 *   - the routes sit behind the bearer auth middleware like every /api/* route
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import { AUDIT_EVENT_CHANNEL } from '../../src/core/audit-writer.js';

const TOKEN = 'ent-tok-269';

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-ent-proj-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

function writeEventsFixture(
  root: string,
  sprintId: string,
  events: Array<{ channel: string; payload: Record<string, unknown> }>,
): void {
  const lines = events.map((e, i) =>
    JSON.stringify({
      timestamp: `2026-06-10T00:00:0${i}.000Z`,
      sequence: i + 1,
      protocol_version: '1.0',
      source: 'deckent',
      target: '*',
      channel: e.channel,
      payload: e.payload,
    }),
  );
  writeFileSync(
    join(root, '.deckent', `${sprintId}-events.jsonl`),
    lines.join('\n') + '\n',
    'utf-8',
  );
}

async function bootServer(
  projectRoot: string,
  opts: { rateLimit?: number } = {},
): Promise<{ api: HttpApi; baseUrl: string }> {
  const api = createHttpServer(projectRoot, {
    port: 0,
    apiToken: TOKEN,
    host: '127.0.0.1',
    // strict limiter over loopback so the rate snapshot test stays meaningful
    rateLimitExemptLoopback: false,
    ...(opts.rateLimit !== undefined ? { rateLimit: opts.rateLimit } : {}),
  });
  await new Promise<void>((resolve) =>
    api.server.once('listening', () => resolve()),
  );
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}` };
}

function authedGet(baseUrl: string, path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
}

describe('/api/enterprise/* — dashboard EnterprisePage data endpoints', () => {
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;

  afterEach(async () => {
    if (api) {
      try { await api.close(); } catch { /* ignore */ }
      api = undefined;
    }
    if (projectRoot) {
      try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      projectRoot = undefined;
    }
  });

  // ─── tenants ────────────────────────────────────────────────────────

  // 1. Empty-but-200: no config, no tenant dirs → [] (page shows EmptyState).
  it('tenants: returns 200 with [] when no tenants exist', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/tenants');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // 2. Config-declared tenants — both string and object entries, full
  //    TenantInfo shape ({id,name,status,users,createdAt}).
  it('tenants: maps config `tenants` entries to the TenantInfo shape', async () => {
    projectRoot = makeProjectRoot();
    writeFileSync(
      join(projectRoot, '.deckent', 'config.json'),
      JSON.stringify({
        tenants: [
          'acme',
          { id: 'beta', name: 'Beta Corp', status: 'suspended', users: 4, createdAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
      'utf-8',
    );
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/tenants');
    expect(res.status).toBe(200);
    const tenants = await res.json() as Array<Record<string, unknown>>;
    expect(tenants).toHaveLength(2);
    expect(tenants[0]).toEqual({ id: 'acme', name: 'acme', status: 'active', users: 0, createdAt: '' });
    expect(tenants[1]).toEqual({
      id: 'beta', name: 'Beta Corp', status: 'suspended', users: 4, createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  // 3. Filesystem tenants — .deckent/tenants/<id>/ isolation roots are listed.
  it('tenants: lists .deckent/tenants/* directories', async () => {
    projectRoot = makeProjectRoot();
    mkdirSync(join(projectRoot, '.deckent', 'tenants', 'gamma'), { recursive: true });
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/tenants');
    expect(res.status).toBe(200);
    const tenants = await res.json() as Array<Record<string, unknown>>;
    expect(tenants).toHaveLength(1);
    expect(tenants[0]).toMatchObject({ id: 'gamma', name: 'gamma', status: 'active', users: 0 });
    expect(typeof tenants[0]?.['createdAt']).toBe('string');
  });

  // ─── rbac ───────────────────────────────────────────────────────────

  // 4. Role matrix from core/rbac.ts SSOT — three roles, hierarchy inherited
  //    (admin permissions ⊇ viewer permissions).
  it('rbac: returns the three-role matrix with inherited permissions', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/rbac');
    expect(res.status).toBe(200);
    const roles = await res.json() as Array<{ role: string; permissions: string[] }>;
    expect(roles.map((r) => r.role).sort()).toEqual(['admin', 'operator', 'viewer']);

    const admin = roles.find((r) => r.role === 'admin');
    const viewer = roles.find((r) => r.role === 'viewer');
    expect(admin && viewer).toBeTruthy();
    expect(viewer!.permissions.length).toBeGreaterThan(0);
    for (const p of viewer!.permissions) {
      expect(admin!.permissions).toContain(p);
    }
  });

  // ─── audit ──────────────────────────────────────────────────────────

  // 5. Empty-but-200: no event stream files → [].
  it('audit: returns 200 with [] when no events exist', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/audit');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // 6. Audit-channel events map to the page's AuditEntry shape; the
  //    access:denied action maps to result 'denied'.
  it('audit: maps audit-channel events to the AuditEntry shape', async () => {
    projectRoot = makeProjectRoot();
    writeEventsFixture(projectRoot, 'sprint-001', [
      {
        channel: AUDIT_EVENT_CHANNEL,
        payload: { actor: 'brain', action: 'config:read', target: 'config.json', timestamp: '2026-06-10T00:00:00.000Z', hmac: 'h-1' },
      },
      {
        channel: AUDIT_EVENT_CHANNEL,
        payload: { actor: 'worker', action: 'access:denied', target: 'secret.deck', timestamp: '2026-06-10T00:00:01.000Z', hmac: 'h-2' },
      },
    ]);
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/audit');
    expect(res.status).toBe(200);
    const entries = await res.json() as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: 'h-1', action: 'config:read', actor: 'brain', resource: 'config.json',
      timestamp: '2026-06-10T00:00:00.000Z', result: 'success',
    });
    expect(entries[1]).toMatchObject({ action: 'access:denied', result: 'denied' });
  });

  // 7. `?channel=` rides the queryAudit SSOT — only events on that exact
  //    channel are returned.
  it('audit: filters by ?channel= (exact match)', async () => {
    projectRoot = makeProjectRoot();
    writeEventsFixture(projectRoot, 'sprint-001', [
      {
        channel: AUDIT_EVENT_CHANNEL,
        payload: { actor: 'brain', action: 'config:read', timestamp: '2026-06-10T00:00:00.000Z' },
      },
      {
        channel: 'WORKER→BRAIN:RESULT',
        payload: { actor: 'worker', action: 'result:written', timestamp: '2026-06-10T00:00:01.000Z' },
      },
    ]);
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(
      booted.baseUrl,
      `/api/enterprise/audit?channel=${encodeURIComponent('WORKER→BRAIN:RESULT')}`,
    );
    expect(res.status).toBe(200);
    const entries = await res.json() as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'result:written', actor: 'worker' });
  });

  // 8. `?limit=` keeps the LAST N events (most recent tail of the stream).
  it('audit: honours ?limit= and keeps the newest entries', async () => {
    projectRoot = makeProjectRoot();
    writeEventsFixture(projectRoot, 'sprint-001', [0, 1, 2, 3].map((i) => ({
      channel: AUDIT_EVENT_CHANNEL,
      payload: { actor: 'brain', action: `step:${i}`, timestamp: `2026-06-10T00:00:0${i}.000Z` },
    })));
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/audit?limit=2');
    expect(res.status).toBe(200);
    const entries = await res.json() as Array<{ action: string }>;
    expect(entries.map((e) => e.action)).toEqual(['step:2', 'step:3']);
  });

  // ─── rate ───────────────────────────────────────────────────────────

  // 9. Live RateLimiter snapshot in the page's RateLimitInfo shape — the
  //    authed requests above count, so at least one window row exists.
  it('rate: returns live limiter state in the RateLimitInfo shape', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot); // default rateLimit=100
    api = booted.api;

    await authedGet(booted.baseUrl, '/api/enterprise/rbac'); // open a window
    const res = await authedGet(booted.baseUrl, '/api/enterprise/rate');
    expect(res.status).toBe(200);
    const rows = await res.json() as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0]!;
    expect(typeof row['endpoint']).toBe('string');
    expect(row['limit']).toBe(100);
    expect(typeof row['remaining']).toBe('number');
    expect((row['remaining'] as number)).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(row['resetAt'] as string))).toBe(false);
  });

  // 10. Rate limiting disabled (rateLimit: 0) → empty-but-200, never an error.
  it('rate: returns 200 with [] when rate limiting is disabled', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot, { rateLimit: 0 });
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/rate');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // ─── auth + routing edges ───────────────────────────────────────────

  // 11. All four routes sit behind the bearer middleware — no token → 401.
  it('rejects unauthenticated requests with 401', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    api = booted.api;

    for (const path of ['tenants', 'rbac', 'audit', 'rate']) {
      const res = await fetch(`${booted.baseUrl}/api/enterprise/${path}`);
      expect(res.status).toBe(401);
    }
  });

  // 12. Unknown sub-path falls through to the server's 404 (no accidental
  //     catch-all under /api/enterprise/).
  it('returns 404 for an unknown /api/enterprise/ sub-path', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    api = booted.api;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/unknown');
    expect(res.status).toBe(404);
  });
});
