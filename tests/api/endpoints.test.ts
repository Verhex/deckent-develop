/**
 * End-to-end HTTP tests for the Deckent dashboard API.
 *
 * Unlike `tests/api/server.test.ts` (which mocks `node:fs` to focus on
 * per-handler unit logic), this suite boots a real server against a
 * temporary project root and exercises the full request pipeline:
 *
 *   1. CORS preflight
 *   2. Bearer auth middleware
 *   3. Rate limiter
 *   4. Route dispatch + Zod validation
 *   5. Response serialization (status + JSON shape)
 *
 * Coverage target (Sprint 189 Task 189-011): >=5 endpoint happy-paths,
 * SSE consumer, auth gate, rate-limit gate.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  startTestServer,
  call,
  readFirstSseEvent,
  buildDashboardSeed,
  buildSprintMarkdown,
  type TestServerHandle,
} from './test-server-helper.js';
import { publishCanonicalRunStatusReadModel } from '../../src/core/run-status-read-model.js';

describe('E2E /api endpoint surface', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  describe('happy paths', () => {
    it('GET /api/health returns 200 + status payload (no auth required)', async () => {
      handle = await startTestServer();
      const res = await call(handle, '/api/health');
      expect(res.status).toBe(200);
      const body = res.json<{ status: string; timestamp: string }>();
      expect(body.status).toBe('ok');
      expect(typeof body.timestamp).toBe('string');
    });

    it('GET /health (no /api prefix) is also exempt from auth', async () => {
      handle = await startTestServer();
      const res = await call(handle, '/health');
      expect(res.status).toBe(200);
      const body = res.json<{ status: string }>();
      expect(body.status).toBe('ok');
    });

    it('GET /api/status returns idle snapshot when nothing is seeded', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/status');
      expect(res.status).toBe(200);
      const body = res.json<{
        idle: boolean;
        sprint: { phase: string; status: string; id: string | null };
        agents: unknown[];
        progress: { total: number };
      }>();
      expect(body.idle).toBe(true);
      expect(body.sprint.phase).toBe('IDLE');
      expect(body.sprint.status).toBe('IDLE');
      expect(Array.isArray(body.agents)).toBe(true);
      expect(body.progress.total).toBe(0);
    });

    it('GET /api/status reflects seeded .dashboard JSON', async () => {
      handle = await startTestServer({
        disableAuth: true,
        seed: {
          dashboard: buildDashboardSeed({ progress: { done: 3, active: 1, blocked: 0, total: 4 } }),
          // Sprint 282: reconcileStatusResponse requires a non-terminal sprint-state
          // to pass dashboard data through; without it the idle fallback zeros all counts.
          sprintState: { status: 'ACTIVE', phase: 'EXECUTE', sprintId: 'sprint-001' },
          // FAZ4B: progress artık .tasks lineage'larından projekte edilir
          // (logicalProgress) — 3 DONE + 1 EXECUTING = done 3 / total 4.
          tasks: Array.from({ length: 4 }, (_, i) => {
            const id = `001-${String(i + 1).padStart(3, '0')}`;
            const status = i < 3 ? 'DONE' : 'EXECUTING';
            return { id, json: { id, title: `Task ${id}`, status, sprintId: 'sprint-001' } };
          }),
        },
      });
      // FAZ4B: authority-first /api/status — ACTIVE projeksiyon için canlı
      // koordinatör PID'i + authority'yle eşleşen persisted read-model şart.
      const pidsDir = join(handle.projectRoot, '.deckent', 'pids');
      mkdirSync(pidsDir, { recursive: true });
      writeFileSync(join(pidsDir, 'sprint-001.pid'), JSON.stringify({ pid: process.pid }), 'utf-8');
      publishCanonicalRunStatusReadModel(handle.projectRoot);
      const res = await call(handle, '/api/status');
      expect(res.status).toBe(200);
      const body = res.json<{
        sprint: { id: string };
        progress: { done: number; total: number };
      }>();
      expect(body.sprint.id).toBe('sprint-001');
      expect(body.progress.done).toBe(3);
      expect(body.progress.total).toBe(4);
    });

    it('GET /api/history returns array of parsed sprint logs', async () => {
      handle = await startTestServer({
        disableAuth: true,
        seed: {
          sprintLogs: [
            { id: 'sprint-001', markdown: buildSprintMarkdown('sprint-001') },
            { id: 'sprint-002', markdown: buildSprintMarkdown('sprint-002') },
          ],
        },
      });
      const res = await call(handle, '/api/history');
      expect(res.status).toBe(200);
      const body = res.json<Array<{ id: string }>>();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2);
      const ids = body.map((s) => s.id);
      expect(ids).toContain('sprint-001');
      expect(ids).toContain('sprint-002');
    });

    it('GET /api/tasks returns seeded task JSON files', async () => {
      handle = await startTestServer({
        disableAuth: true,
        seed: {
          tasks: [
            { id: '001-001', json: { id: '001-001', title: 'A', status: 'DONE' } },
            { id: '001-002', json: { id: '001-002', title: 'B', status: 'PENDING' } },
          ],
        },
      });
      const res = await call(handle, '/api/tasks');
      expect(res.status).toBe(200);
      const body = res.json<Array<{ id: string; title: string }>>();
      expect(body.length).toBe(2);
      expect(body.map((t) => t.id).sort()).toEqual(['001-001', '001-002']);
    });

    it('GET /api/memory returns the exports/memory.md view', async () => {
      handle = await startTestServer({
        disableAuth: true,
        seed: { memoryMd: '# Memory\n\nLearnings...' },
      });
      const res = await call(handle, '/api/memory');
      expect(res.status).toBe(200);
      const body = res.json<{ content: string }>();
      expect(body.content).toContain('Memory');
      expect(body.content).toContain('Learnings');
    });

    it('GET /api/memory returns 404 when export is missing', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/memory');
      expect(res.status).toBe(404);
      expect(res.json<{ error: string }>().error).toMatch(/not found/i);
    });

    it('GET /api/debt returns the exports/debt.md view', async () => {
      handle = await startTestServer({
        disableAuth: true,
        seed: { debtMd: '# Debt\n\n_No active technical debt._' },
      });
      const res = await call(handle, '/api/debt');
      expect(res.status).toBe(200);
      const body = res.json<{ content: string }>();
      expect(body.content).toContain('Debt');
    });

    it('GET /api/config/defaults returns a config snapshot', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/config/defaults');
      expect(res.status).toBe(200);
      const body = res.json<Record<string, unknown>>();
      // The defaults snapshot is an object with at least one known config key.
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
      expect(Object.keys(body).length).toBeGreaterThan(0);
    });

    it('GET /api/config returns 404 when config file is missing', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/config');
      expect(res.status).toBe(404);
    });

    it('GET /api/config returns the seeded config payload', async () => {
      handle = await startTestServer({
        disableAuth: true,
        seed: { config: { mode: 'balanced', max_workers: 4 } },
      });
      const res = await call(handle, '/api/config');
      expect(res.status).toBe(200);
      const body = res.json<{ mode: string; max_workers: number }>();
      expect(body.mode).toBe('balanced');
      expect(body.max_workers).toBe(4);
    });

    it('POST /api/chat replies to the status command', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'status' }),
      });
      expect(res.status).toBe(200);
      const body = res.json<{ reply: string }>();
      expect(body.reply).toMatch(/sprint durumu/i);
    });

    it('POST /api/chat 400 when body is invalid', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/chat', {
        method: 'POST',
        body: JSON.stringify({ notmessage: 'oops' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('SSE /api/events', () => {
    it('returns text/event-stream and a retry directive', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await readFirstSseEvent(handle, '/api/events', 800);
      expect(res.status).toBe(200);
      expect(res.firstChunk).toContain('retry:');
    });
  });

  describe('auth middleware gate', () => {
    it('401 when no token configured and auth not disabled', async () => {
      handle = await startTestServer({});
      const res = await call(handle, '/api/status');
      expect(res.status).toBe(401);
      expect(res.json<{ error: string }>().error).toMatch(/authentication/i);
    });

    it('401 when Bearer header is missing', async () => {
      handle = await startTestServer({ apiToken: 'shhh-secret' });
      const res = await call(handle, '/api/status');
      // call() injects authHeaders from the handle — so this happy-path actually
      // sends a valid token. Hit the route directly via fetch to assert the
      // unauthenticated branch.
      expect(res.status).toBe(200);

      const direct = await fetch(`${handle.baseUrl}/api/status`);
      const directText = await direct.text();
      expect(direct.status).toBe(401);
      expect(directText).toMatch(/authentication required/i);
    });

    it('403 when Bearer token is wrong', async () => {
      handle = await startTestServer({ apiToken: 'right-token' });
      const direct = await fetch(`${handle.baseUrl}/api/status`, {
        headers: { Authorization: 'Bearer wrong-token' },
      });
      expect(direct.status).toBe(403);
    });

    it('health endpoint is exempt even without token', async () => {
      handle = await startTestServer({});
      const res = await call(handle, '/api/health');
      expect(res.status).toBe(200);
    });
  });

  describe('rate-limit gate', () => {
    it('returns 429 once max requests are exceeded within window', async () => {
      handle = await startTestServer({ disableAuth: true, rateLimit: 3 });

      // First 3 requests succeed.
      for (let i = 0; i < 3; i++) {
        const ok = await call(handle, '/api/status');
        expect(ok.status, `request ${i + 1}`).toBe(200);
      }

      // Fourth request triggers the limiter.
      const limited = await call(handle, '/api/status');
      expect(limited.status).toBe(429);
      const body = limited.json<{ error: string }>();
      expect(body.error).toMatch(/too many/i);
    });

    it('health endpoint shares the same /api/* bucket so /health stays clean', async () => {
      handle = await startTestServer({ disableAuth: true, rateLimit: 2 });
      // Burn through the /api/* bucket.
      await call(handle, '/api/status');
      await call(handle, '/api/status');
      const limited = await call(handle, '/api/status');
      expect(limited.status).toBe(429);

      // /health (without /api prefix) is unaffected.
      const health = await call(handle, '/health');
      expect(health.status).toBe(200);
    });
  });

  describe('CORS', () => {
    it('OPTIONS preflight from localhost gets 200 + Allow headers', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await fetch(`${handle.baseUrl}/api/status`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-methods')).toMatch(/GET/);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });

    it('OPTIONS preflight from disallowed origin returns 403', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await fetch(`${handle.baseUrl}/api/status`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example',
          'Access-Control-Request-Method': 'GET',
        },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('error handling', () => {
    it('405 for unsupported HTTP method', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/status', { method: 'PUT' });
      expect(res.status).toBe(405);
    });

    it('GET unknown /api/* path → 404', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/this-does-not-exist');
      expect(res.status).toBe(404);
    });

    it('POST unknown /api/* path → 404', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/whoknows', { method: 'POST', body: '{}' });
      expect(res.status).toBe(404);
    });

    it('POST with malformed JSON → 400', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/chat', {
        method: 'POST',
        body: '{not-json',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('v1 compat alias', () => {
    it('GET /api/v1/health behaves like /api/health', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('ok');
    });

    it('GET /api/v1/status mirrors /api/status', async () => {
      handle = await startTestServer({ disableAuth: true });
      const res = await call(handle, '/api/v1/status');
      expect(res.status).toBe(200);
      const body = res.json<{ idle: boolean }>();
      expect(body.idle).toBe(true);
    });
  });
});

describe('E2E test harness lifecycle', () => {
  let handle: TestServerHandle | undefined;

  beforeAll(async () => {
    handle = await startTestServer({ disableAuth: true });
  });

  afterAll(async () => {
    if (handle) await handle.close();
  });

  it('boots once and reuses the connection for multiple sequential calls', async () => {
    if (!handle) throw new Error('Handle not initialised');
    const a = await call(handle, '/api/health');
    const b = await call(handle, '/api/health');
    const c = await call(handle, '/api/health');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
  });

  it('exposes a bound port via baseUrl', () => {
    if (!handle) throw new Error('Handle not initialised');
    expect(handle.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
