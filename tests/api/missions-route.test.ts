/**
 * Tests for /api/missions/* endpoints (295-005).
 * Hermetic: tmpdir project root + real SqliteMissionStore + mini http server.
 * Tier-1: all assertions use real served JSON over real HTTP — no mock-only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { SqliteMissionStore } from '../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { registerMissionsRoute } from '../../src/api/missions-route.js';
import type { MissionView } from '../../src/orchestra/autonomous/mission-store/mission-view.js';

let projectRoot: string;
let server: Server;
let baseUrl: string;

async function startServer(root: string): Promise<{ server: Server; baseUrl: string }> {
  const s = createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    if (!registerMissionsRoute(url, method, res, root)) {
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
