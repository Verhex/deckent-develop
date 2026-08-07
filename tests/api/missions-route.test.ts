/**
 * Tests for /api/missions/* endpoints (295-005, 298-001).
 * Hermetic: tmpdir project root + real SqliteMissionStore + mini http server.
 * Tier-1: all assertions use real served JSON over real HTTP — no mock-only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { SqliteMissionStore } from '../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { registerMissionsRoute } from '../../src/api/missions-route.js';
import { createHttpServer } from '../../src/api/server.js';
import type { MissionView } from '../../src/orchestra/autonomous/mission-store/mission-view.js';

let projectRoot: string;
let server: Server;
let baseUrl: string;

/**
 * Build a minimal fake JWT whose payload carries the given claims.
 * parseOidcClaims only base64-decodes the payload — no signature check.
 * deriveRequestPrincipal uses the extracted tenant/role from this token.
 */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

/** Returns fetch options with an Authorization: Bearer header for the given claims. */
function bearerHeaders(claims: Record<string, unknown>): Record<string, string> {
  return { Authorization: `Bearer ${fakeJwt(claims)}` };
}

async function startServer(root: string): Promise<{ server: Server; baseUrl: string }> {
  const s = createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    if (!registerMissionsRoute(url, method, res, root, req)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', () => resolve()));
  const addr = s.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { server: s, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopServer(s: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    s.close((err) => (err ? reject(err) : resolve())),
  );
}

afterEach(async () => {
  if (server) await stopServer(server);
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  server = undefined as unknown as Server;
  projectRoot = undefined as unknown as string;
  baseUrl = undefined as unknown as string;
});

describe('GET /api/missions', () => {
  it('returns { missions: [] } when the store is empty', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-api-'));
    // Seed an empty (but initialized) store
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { missions: MissionView[] };
    expect(Array.isArray(body.missions)).toBe(true);
    expect(body.missions.length).toBe(0);
  });

  it('returns { missions: [] } when autonomous.db does not exist (fail-safe)', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-api-'));
    // No store created — db file absent

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { missions: MissionView[] };
    expect(Array.isArray(body.missions)).toBe(true);
    expect(body.missions.length).toBe(0);
  });

  it('returns 2 MissionViews with correct render_as + shape when 2 missions exist', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-api-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.createMission({
      id: 'mission-alpha', kind: 'list', title: 'Alpha list', renderAs: 'checklist',
    });
    store.createMission({
      id: 'mission-beta', kind: 'goal', title: 'Beta goal', renderAs: 'goal',
    });
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { missions: MissionView[] };
    expect(body.missions.length).toBe(2);

    const alpha = body.missions.find((m) => m.id === 'mission-alpha');
    expect(alpha).toBeDefined();
    expect(alpha?.renderAs).toBe('checklist');
    expect(alpha?.title).toBe('Alpha list');
    expect(alpha?.status).toBe('pending');
    expect(Array.isArray(alpha?.items)).toBe(true);
    expect(alpha?.progress).toBeDefined();

    const beta = body.missions.find((m) => m.id === 'mission-beta');
    expect(beta).toBeDefined();
    expect(beta?.renderAs).toBe('goal');
    expect(beta?.title).toBe('Beta goal');
  });
});

describe('GET /api/missions/:id', () => {
  it('returns 404 for an unknown mission id', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-api-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions/nonexistent-id`);
    expect(res.status).toBe(404);
  });

  it('returns the MissionView for a known mission id', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-api-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.createMission({
      id: 'mission-gamma', kind: 'list', title: 'Gamma list', renderAs: 'checklist',
      deliverTo: 'user@example.com',
    });
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions/mission-gamma`);
    expect(res.status).toBe(200);
    const view = await res.json() as MissionView;
    expect(view.id).toBe('mission-gamma');
    expect(view.renderAs).toBe('checklist');
    expect(view.title).toBe('Gamma list');
    expect(view.deliverTo).toBe('user@example.com');
    expect(Array.isArray(view.items)).toBe(true);
  });

  it('returns 404 when autonomous.db does not exist (fail-safe)', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-api-'));

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions/any-id`);
    expect(res.status).toBe(404);
  });
});

describe('tenant isolation (anti-IDOR, 298-001)', () => {
  it('(a) acme-principal sees only acme missions, not globex', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-idor-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.createMission({ id: 'acme-1', kind: 'list', title: 'Acme task', renderAs: 'checklist', tenant: 'acme' });
    store.createMission({ id: 'globex-1', kind: 'list', title: 'Globex task', renderAs: 'checklist', tenant: 'globex' });
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions`, { headers: bearerHeaders({ sub: 'alice', tenant: 'acme' }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { missions: MissionView[] };
    const ids = body.missions.map((m) => m.id);
    expect(ids).toContain('acme-1');
    expect(ids).not.toContain('globex-1');
  });

  it('(b) acme-principal GET /api/missions/:id for a globex mission → 404 (no existence leak)', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-idor-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.createMission({ id: 'globex-2', kind: 'list', title: 'Globex secret', renderAs: 'checklist', tenant: 'globex' });
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions/globex-2`, { headers: bearerHeaders({ sub: 'alice', tenant: 'acme' }) });
    expect(res.status).toBe(404);
  });

  it('(c-a) claim-siz (no-tenant) principal + acme/globex missions → list empty (fail-closed regression guard)', async () => {
    // Previously fail-open: no-tenant principal saw ALL missions.
    // After fix: callerTenant='local', acme/globex missions invisible → fail-closed.
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-idor-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.createMission({ id: 'acme-3', kind: 'list', title: 'Acme item', renderAs: 'checklist', tenant: 'acme' });
    store.createMission({ id: 'globex-3', kind: 'list', title: 'Globex item', renderAs: 'checklist', tenant: 'globex' });
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    // No Authorization header → deriveRequestPrincipal returns { id: 'api-static' } with no tenantId
    // callerTenant defaults to 'local'; acme/globex missions are NOT 'local' → not visible
    const res = await fetch(`${baseUrl}/api/missions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { missions: MissionView[] };
    const ids = body.missions.map((m) => m.id);
    expect(ids).not.toContain('acme-3');
    expect(ids).not.toContain('globex-3');
    expect(ids.length).toBe(0);
  });

  it('(c-b) claim-siz + local (untagged) mission → visible (v1-default)', async () => {
    // No-tenant principal → callerTenant='local'; untagged mission → tenant??'local'='local' → visible.
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-idor-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.createMission({ id: 'local-1', kind: 'list', title: 'Local task', renderAs: 'checklist' });
    store.createMission({ id: 'acme-5', kind: 'list', title: 'Acme task', renderAs: 'checklist', tenant: 'acme' });
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { missions: MissionView[] };
    const ids = body.missions.map((m) => m.id);
    expect(ids).toContain('local-1');
    expect(ids).not.toContain('acme-5');
  });

  it('(d) admin-role principal sees all missions regardless of tenant', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-idor-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.createMission({ id: 'acme-4', kind: 'list', title: 'Acme admin', renderAs: 'checklist', tenant: 'acme' });
    store.createMission({ id: 'globex-4', kind: 'list', title: 'Globex admin', renderAs: 'checklist', tenant: 'globex' });
    store.close();

    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    // Admin from tenant 'acme' should still see globex missions
    const res = await fetch(`${baseUrl}/api/missions`, { headers: bearerHeaders({ sub: 'root', tenant: 'acme', role: 'admin' }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { missions: MissionView[] };
    const ids = body.missions.map((m) => m.id);
    expect(ids).toContain('acme-4');
    expect(ids).toContain('globex-4');
  });
});

describe('server.ts dispatch — /api/missions is wired (integration)', () => {
  it('GET /api/missions resolves 200 through createHttpServer dispatch (not 404)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'missions-server-wire-'));
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    const api = createHttpServer(root, { port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => api.server.once('listening', resolve));
    try {
      const addr = api.server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const res = await fetch(`http://127.0.0.1:${port}/api/missions`);
      expect(res.status).toBe(200);
    } finally {
      delete process.env['DECKENT_API_AUTH_DISABLED'];
      await api.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ═══ TENANT-001 T2 — strict isolation reaches the missions ingress ══════════
// T1 closed the run-flow propose path; the same NULL-tenant default still sat
// here, so a caller with no tenant claim was folded into `local` and could read
// `local` missions. These pins prove the gate now decides on this surface too.
describe('TENANT-001 T2 — missions ingress under strict tenant isolation', () => {
  function seedStrictRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'missions-strict-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(
      join(root, '.deckent', 'config.json'),
      JSON.stringify({ strict_tenant_isolation: true }),
    );
    const store = new SqliteMissionStore(root);
    store.migrate();
    store.close();
    return root;
  }

  it('strict ON: a tenant-less caller is refused with 403', async () => {
    projectRoot = seedStrictRoot();
    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions`, {
      headers: bearerHeaders({ sub: 'alice' }), // no tenant claim
    });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toMatch(/tenant scope unresolved/u);
  });

  it('strict ON: a caller WITH a tenant claim is served normally', async () => {
    projectRoot = seedStrictRoot();
    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions`, {
      headers: bearerHeaders({ sub: 'alice', tenant: 'acme' }),
    });
    expect(res.status).toBe(200);
  });

  it('strict OFF (default): the tenant-less caller is served as before (v1)', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'missions-permissive-'));
    const store = new SqliteMissionStore(projectRoot);
    store.migrate();
    store.close();
    const started = await startServer(projectRoot);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/missions`, {
      headers: bearerHeaders({ sub: 'alice' }),
    });
    expect(res.status).toBe(200);
  });
});
