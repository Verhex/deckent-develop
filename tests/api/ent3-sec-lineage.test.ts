/**
 * ENT-3-SEC: GET /api/autonomous/lineage/:correlationId tenant-scope (anti-IDOR, fail-CLOSED).
 * Sprint 310 Task 310-001 + security-review hardening (no fail-open seeAll).
 *
 * Verifies (fail-closed: unknown/no-claim principal → effective tenant 'local', NEVER superuser):
 *   1. Static token + 'local' event   → visible (own-tenant, v1-default localhost owner)   200/len1
 *   2. Static token + 'acme' event    → NOT visible (foreign tenant, no fail-open)          200/len0
 *   3. OIDC tenant=acme + acme+globex  → only acme (globex must not leak)                    200/len1
 *   4. OIDC tenant=globex + acme-only  → empty (cross-tenant, no existence-leak, no 403)     200/len0
 *   5. OIDC admin                      → all events across tenants                           200/len2
 *   6. No bearer + 'local' event       → 'local'-scope (own-tenant only, not seeAll)         200/len1
 *
 * Hermetic: all I/O in tmpdir, torn down in afterEach.
 * Uses registerAutonomousRoutes directly via minimal HTTP server — req passed in full.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';

import { registerAutonomousRoutes } from '../../src/api/autonomous-endpoint.js';
import { writeAuditEvent, _resetChainHead } from '../../src/core/audit-writer.js';

/** Static opaque token — no OIDC claims → principal.tenantId undefined → effective tenant 'local'. */
const STATIC_TOKEN = 'ent3-sec-opaque-token-310';

/** Fixed correlationId used across tests. Each test gets a fresh projectRoot. */
const CORR_ID = 'corr-310-001-test';

/** Build a minimal fake JWT. deriveRequestPrincipal reads tenant/role from the payload. */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-310-001-'));
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  return root;
}

/** Minimal HTTP server wiring registerAutonomousRoutes (req passed). No auth-gate — tests in-handler filtering. */
async function bootServer(projectRoot: string): Promise<{ server: Server; baseUrl: string }> {
  const s = createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    if (!registerAutonomousRoutes(url, method, res, projectRoot, req)) {
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
  await new Promise<void>((resolve, reject) => s.close((err) => (err ? reject(err) : resolve())));
}

function seed(projectRoot: string, tenantId: string, action: string): void {
  writeAuditEvent(projectRoot, 'autonomous', { tenantId, actor: 'cli', action, correlationId: CORR_ID });
}

type Body = { correlationId?: string; events: Array<{ tenantId?: string }>; totalEvents: number };

describe('GET /api/autonomous/lineage/:correlationId — ENT-3-SEC tenant-scope (fail-closed)', () => {
  let projectRoot: string | undefined;
  let server: Server | undefined;

  afterEach(async () => {
    if (server) { try { await stopServer(server); } catch { /* ignore */ } server = undefined; }
    if (projectRoot) { try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ } projectRoot = undefined; }
    _resetChainHead();
  });

  async function get(headers?: Record<string, string>): Promise<{ status: number; body: Body }> {
    const booted = await bootServer(projectRoot!);
    server = booted.server;
    const res = await fetch(`${booted.baseUrl}/api/autonomous/lineage/${CORR_ID}`, headers ? { headers } : undefined);
    return { status: res.status, body: await res.json() as Body };
  }

  // 1. Static token + 'local' event → visible (own-tenant, v1-default localhost owner).
  it("static token + 'local' event → visible (200, len1)", async () => {
    projectRoot = makeProjectRoot();
    seed(projectRoot, 'local', 'autonomous:local-action');
    const { status, body } = await get({ Authorization: `Bearer ${STATIC_TOKEN}` });
    expect(status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.totalEvents).toBe(1);
  });

  // 2. Static token + 'acme' event → NOT visible (no fail-open seeAll for foreign tenant).
  it("static token + 'acme' event → NOT visible (fail-closed, 200, len0)", async () => {
    projectRoot = makeProjectRoot();
    seed(projectRoot, 'acme', 'autonomous:acme-action');
    const { status, body } = await get({ Authorization: `Bearer ${STATIC_TOKEN}` });
    expect(status).toBe(200);
    expect(body.events).toHaveLength(0);
    expect(body.totalEvents).toBe(0);
  });

  // 3. OIDC tenant=acme + acme+globex → only acme (globex must not leak).
  it('OIDC tenant=acme + acme+globex → only acme visible (200, len1)', async () => {
    projectRoot = makeProjectRoot();
    seed(projectRoot, 'acme', 'autonomous:acme-action');
    seed(projectRoot, 'globex', 'autonomous:globex-action');
    const jwt = fakeJwt({ sub: 'user-acme', role: 'viewer', tenant: 'acme', exp: 9999999999 });
    const { status, body } = await get({ Authorization: `Bearer ${jwt}` });
    expect(status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.tenantId).toBe('acme');
  });

  // 4. OIDC tenant=globex + acme-only → empty (cross-tenant, no existence-leak, no 403).
  it('OIDC cross-tenant (globex) + acme-only events → empty, no leak (200, len0)', async () => {
    projectRoot = makeProjectRoot();
    seed(projectRoot, 'acme', 'autonomous:acme-action');
    const jwt = fakeJwt({ sub: 'user-globex', role: 'viewer', tenant: 'globex', exp: 9999999999 });
    const { status, body } = await get({ Authorization: `Bearer ${jwt}` });
    expect(status).toBe(200);
    expect(body.events).toHaveLength(0);
    expect(body.totalEvents).toBe(0);
  });

  // 5. OIDC admin → all events across tenants.
  it('OIDC admin → all events across tenants (200, len2)', async () => {
    projectRoot = makeProjectRoot();
    seed(projectRoot, 'acme', 'autonomous:acme-action');
    seed(projectRoot, 'globex', 'autonomous:globex-action');
    const jwt = fakeJwt({ sub: 'user-admin', role: 'admin', exp: 9999999999 });
    const { status, body } = await get({ Authorization: `Bearer ${jwt}` });
    expect(status).toBe(200);
    expect(body.events).toHaveLength(2);
    expect(body.totalEvents).toBe(2);
  });

  // 6. No bearer + 'local' event → 'local'-scope (own-tenant only, not seeAll).
  it("no bearer + 'local' event → 'local'-scope (200, len1)", async () => {
    projectRoot = makeProjectRoot();
    seed(projectRoot, 'local', 'autonomous:local-action');
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.events).toHaveLength(1);
  });

  // 7. No bearer + 'acme' event → NOT visible (no-bearer is NOT superuser).
  it("no bearer + 'acme' event → NOT visible (fail-closed, 200, len0)", async () => {
    projectRoot = makeProjectRoot();
    seed(projectRoot, 'acme', 'autonomous:acme-action');
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.events).toHaveLength(0);
  });
});
