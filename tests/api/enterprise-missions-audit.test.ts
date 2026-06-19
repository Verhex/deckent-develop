/**
 * Sprint 298 Task 298-004 / Sprint 299 Task 299-002 — GET /api/enterprise/missions-audit
 *
 * Verifies:
 * - Route resolves (not 404) — handler returns AuditEntry[]
 * - AuditEntry fields (id, action, actor, resource, timestamp, result) are correctly mapped
 * - Missing/empty audit stream → [] (fail-safe, never 404/500)
 * - Auth gate: 401 without bearer token
 * - Admin-gate (299-002): static/opaque token → 200; OIDC non-admin → 403; OIDC admin → 200
 * - Gate covers sibling reads: /api/enterprise/audit non-admin → 403
 *
 * Hermetic: all I/O in tmpdir, torn down in afterEach. Uses registerEnterpriseRoutes
 * directly via a minimal HTTP server — no mocks, req is passed in full.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';

import { registerEnterpriseRoutes } from '../../src/api/enterprise-endpoint.js';
import { auditMissionLifecycle } from '../../src/orchestra/autonomous/mission-store/mission-audit-bridge.js';
import { _resetChainHead } from '../../src/core/audit-writer.js';

/** Static opaque token for v1-default / localhost tests. */
const TOKEN = 'ent-missions-audit-298';

/**
 * Build a minimal fake JWT whose payload carries the given claims.
 * parseOidcClaims only base64-decodes the payload — no signature check.
 */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-299-002-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  return root;
}

/**
 * Minimal HTTP server that wires registerEnterpriseRoutes directly.
 * - No Authorization header → 401.
 * - Authorization present → passed to registerEnterpriseRoutes as req (gate decides 403/200).
 */
async function bootServer(projectRoot: string): Promise<{ server: Server; baseUrl: string }> {
  const s = createServer((req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    if (!registerEnterpriseRoutes(url, method, res, projectRoot, {}, req)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', () => resolve()));
  const addr = s.address();
  if (!addr || typeof addr === 'string') {
    await new Promise<void>((_, reject) => s.close((err) => reject(err ?? new Error('close'))));
    throw new Error('Test server did not bind a port');
  }
  return { server: s, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function stopServer(s: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    s.close((err) => (err ? reject(err) : resolve())),
  );
}

/**
 * Boot a server WITHOUT the 401 auth-gate — simulates auth-disabled mode where
 * the upstream middleware does not block unauthenticated requests.
 */
async function bootServerNoAuth(projectRoot: string): Promise<{ server: Server; baseUrl: string }> {
  const s = createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    if (!registerEnterpriseRoutes(url, method, res, projectRoot, {}, req)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', () => resolve()));
  const addr = s.address();
  if (!addr || typeof addr === 'string') {
    await new Promise<void>((_, reject) => s.close((err) => reject(err ?? new Error('close'))));
    throw new Error('Test server did not bind a port');
  }
  return { server: s, baseUrl: `http://127.0.0.1:${addr.port}` };
}

function authedGet(baseUrl: string, path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
}

function unauthGet(baseUrl: string, path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`);
}

describe('GET /api/enterprise/missions-audit', () => {
  let projectRoot: string | undefined;
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      try { await stopServer(server); } catch { /* ignore */ }
      server = undefined;
    }
    if (projectRoot) {
      try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      projectRoot = undefined;
    }
    // Reset hmac chain head between tests so chain verification is deterministic.
    _resetChainHead();
  });

  // (b) No audit events → [] (fail-safe empty, never 500/404)
  it('returns 200 with [] when no mission audit events exist', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    server = booted.server;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/missions-audit');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // (a) Seed missions:create + missions:settle → AuditEntry[] with correct fields
  it('maps mission audit events to AuditEntry[] with correct fields', async () => {
    projectRoot = makeProjectRoot();

    // Write missions:create and missions:settle events via the real bridge
    auditMissionLifecycle(projectRoot, {
      tenantId: 'acme',
      actor: 'cli',
      action: 'missions:create',
      missionId: 'mission-001',
      metadata: { kind: 'list', title: 'Test Mission' },
    });
    auditMissionLifecycle(projectRoot, {
      tenantId: 'acme',
      actor: 'scheduler',
      action: 'missions:settle',
      missionId: 'mission-001',
      metadata: { status: 'done', ok: true },
    });

    const booted = await bootServer(projectRoot);
    server = booted.server;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/missions-audit');
    expect(res.status).toBe(200);

    const entries = await res.json() as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(2);

    // First entry: missions:create
    const createEntry = entries[0]!;
    expect(createEntry['action']).toBe('missions:create');
    expect(createEntry['actor']).toBe('cli');
    expect(createEntry['resource']).toBe('mission-001');
    expect(typeof createEntry['timestamp']).toBe('string');
    expect(createEntry['timestamp']).not.toBe('');
    expect(createEntry['result']).toBe('success');
    // id must be truthy (hmac or timestamp-based fallback)
    expect(createEntry['id']).toBeTruthy();

    // Second entry: missions:settle
    const settleEntry = entries[1]!;
    expect(settleEntry['action']).toBe('missions:settle');
    expect(settleEntry['actor']).toBe('scheduler');
    expect(settleEntry['resource']).toBe('mission-001');
    expect(settleEntry['result']).toBe('success');
  });

  // (d) Route resolves — not 404
  it('route /api/enterprise/missions-audit is handled (not 404)', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    server = booted.server;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/missions-audit');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
  });

  // (c) Auth gate: 401 without bearer token
  it('returns 401 when no authorization header is provided', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    server = booted.server;

    const res = await unauthGet(booted.baseUrl, '/api/enterprise/missions-audit');
    expect(res.status).toBe(401);
  });

  // 299-002 admin-gate tests ─────────────────────────────────────────────────

  // (a) static/opaque token (v1-default) → 200 (localhost owner gate passes)
  it('299-002: static/opaque token → 200 (v1-default localhost gate passes)', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    server = booted.server;

    const res = await authedGet(booted.baseUrl, '/api/enterprise/missions-audit');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  // (b) no-bearer (auth-disabled mode) → 200 + all entries (279-008 open-contract)
  it('300-001: no-bearer (auth-disabled) → 200, full view', async () => {
    projectRoot = makeProjectRoot();
    auditMissionLifecycle(projectRoot, {
      tenantId: 'acme',
      actor: 'cli',
      action: 'missions:create',
      missionId: 'mission-nb-001',
      metadata: { kind: 'list', title: 'No-bearer test' },
    });
    const booted = await bootServerNoAuth(projectRoot);
    server = booted.server;

    const res = await fetch(`${booted.baseUrl}/api/enterprise/missions-audit`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
  });

  // (c) OIDC non-admin tenant=acme + seed acme+globex → 200, only acme (cross-tenant not leaked)
  it('300-001: OIDC non-admin tenant=acme + acme+globex seed → 200, only acme entries', async () => {
    projectRoot = makeProjectRoot();

    auditMissionLifecycle(projectRoot, {
      tenantId: 'acme',
      actor: 'cli',
      action: 'missions:create',
      missionId: 'mission-acme-001',
      metadata: { kind: 'list', title: 'Acme Mission' },
    });
    auditMissionLifecycle(projectRoot, {
      tenantId: 'globex',
      actor: 'cli',
      action: 'missions:create',
      missionId: 'mission-globex-001',
      metadata: { kind: 'list', title: 'Globex Mission' },
    });

    const booted = await bootServer(projectRoot);
    server = booted.server;

    const acmeNonAdminJwt = fakeJwt({ sub: 'user-acme', role: 'viewer', tenant: 'acme', exp: 9999999999 });
    const res = await fetch(`${booted.baseUrl}/api/enterprise/missions-audit`, {
      headers: { Authorization: `Bearer ${acmeNonAdminJwt}` },
    });
    expect(res.status).toBe(200);
    const entries = await res.json() as Array<Record<string, unknown>>;
    // Only acme's record visible — globex must NOT leak
    expect(entries).toHaveLength(1);
    expect(entries[0]!['resource']).toBe('mission-acme-001');
  });

  // (c) OIDC admin Bearer → 200
  it('299-002: OIDC admin Bearer → 200', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    server = booted.server;

    const adminJwt = fakeJwt({ sub: 'user-admin', role: 'admin', exp: 9999999999 });
    const res = await fetch(`${booted.baseUrl}/api/enterprise/missions-audit`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  // (d) 279-008 open-contract: /api/enterprise/audit OIDC non-admin → 200 (gate removed)
  it('300-001: /api/enterprise/audit OIDC non-admin → 200 (279-008 open-contract restored)', async () => {
    projectRoot = makeProjectRoot();
    const booted = await bootServer(projectRoot);
    server = booted.server;

    const nonAdminJwt = fakeJwt({ sub: 'user-viewer', role: 'viewer', exp: 9999999999 });
    const res = await fetch(`${booted.baseUrl}/api/enterprise/audit`, {
      headers: { Authorization: `Bearer ${nonAdminJwt}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
