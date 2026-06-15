/**
 * Tests for /api/nervous/* routes (Sprint 218 follow-up — run-verify caught
 * NervousPage 404; backend routes were never wired). Hermetic: tmpdir project
 * root via startTestServer, no gitignored state.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

describe('/api/nervous/* routes', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('GET /api/nervous/status returns panicGuard + detectors + pendingCount', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/status');
    expect(res.status).toBe(200);
    const body = res.json<{ panicGuard: boolean; detectors: unknown[]; pendingCount: number }>();
    expect(typeof body.panicGuard).toBe('boolean');
    expect(Array.isArray(body.detectors)).toBe(true);
    expect(typeof body.pendingCount).toBe('number');
  });

  it('GET /api/nervous/pending returns an array (empty on a fresh project)', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/pending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /api/nervous/accept/<id> returns 200 with the accepted id', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/accept/task-001', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ accepted: string }>().accepted).toBe('task-001');
  });

  it('POST /api/nervous/reject/<id> returns 200 with the rejected id', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/reject/task-002', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ rejected: string }>().rejected).toBe('task-002');
  });

  it('unknown /api/nervous/* path falls through to 404', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/bogus');
    expect(res.status).toBe(404);
  });
});

// W8 — the dashboard nervous surface is unified with the cross-surface hub: it
// surfaces the SAME nervous-pending.json approvals shown by `deckent status` /
// Telegram, and resolves them via the nervous-ipc queue (the executor poller),
// not only the legacy panic-guard channel.
describe('/api/nervous/* — unified hub integration (W8)', () => {
  let handle: TestServerHandle;
  afterEach(async () => {
    if (handle) { await handle.close(); handle = undefined as unknown as TestServerHandle; }
  });

  function seedNervousPending(root: string): void {
    writeFileSync(join(root, '.deckent', 'nervous-pending.json'), JSON.stringify([
      { id: 'nrv-1', type: 'directives-protection', title: 'Directives changed mid-sprint', message: 'baseline drift', severity: 'critical', detectorId: 'directives-protection', createdAt: '2026-06-15T00:00:00.000Z' },
    ]));
  }

  it('GET /api/nervous/pending surfaces nervous-pending.json approvals (unified hub)', async () => {
    handle = await startTestServer({ disableAuth: true });
    seedNervousPending(handle.projectRoot);
    const res = await call(handle, '/api/nervous/pending');
    expect(res.status).toBe(200);
    const body = res.json<Array<{ id: string; description: string; risk: string }>>();
    const nrv = body.find((p) => p.id === 'nrv-1');
    expect(nrv).toBeTruthy();
    expect(nrv!.description).toContain('Directives changed');
    expect(nrv!.risk).toBe('high'); // critical → high
  });

  it('GET /api/nervous/status counts nervous-pending approvals in pendingCount', async () => {
    handle = await startTestServer({ disableAuth: true });
    seedNervousPending(handle.projectRoot);
    const res = await call(handle, '/api/nervous/status');
    expect(res.json<{ pendingCount: number }>().pendingCount).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/nervous/accept/<id> writes a nervous-ipc approval (executor round-trip)', async () => {
    handle = await startTestServer({ disableAuth: true });
    seedNervousPending(handle.projectRoot);
    const res = await call(handle, '/api/nervous/accept/nrv-1', { method: 'POST' });
    expect(res.status).toBe(200);
    const ipcPending = join(handle.projectRoot, '.deckent', 'nervous-ipc', 'pending');
    expect(existsSync(ipcPending)).toBe(true);
    expect(readdirSync(ipcPending).length).toBeGreaterThanOrEqual(1);
  });
});

// Brain inbox — the recommendation feed surfaced for the dashboard NervousPage.
describe('/api/nervous/recommendations routes', () => {
  let handle: TestServerHandle;
  afterEach(async () => {
    if (handle) { await handle.close(); handle = undefined as unknown as TestServerHandle; }
  });

  function seedRecommendations(root: string): void {
    const lines = [
      { id: 'rec-aaaaaaaaaa11', actionId: 'DEBT_REPRIORITIZE', createdAt: '2026-06-15T10:00:00.000Z', payload: { debtId: 'D-12' }, status: 'open' },
      { id: 'rec-bbbbbbbbbb22', actionId: 'COMMIT_PUSH', createdAt: '2026-06-15T11:00:00.000Z', payload: {}, status: 'dismissed' },
    ];
    writeFileSync(join(root, '.deckent', 'nervous-recommendations.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }

  it('GET /api/nervous/recommendations returns [] on a fresh project', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/nervous/recommendations');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('GET returns only open recommendations by default; ?all=1 includes dismissed', async () => {
    handle = await startTestServer({ disableAuth: true });
    seedRecommendations(handle.projectRoot);

    const open = await call(handle, '/api/nervous/recommendations');
    const openBody = open.json<Array<{ id: string; status: string }>>();
    expect(openBody).toHaveLength(1);
    expect(openBody[0].id).toBe('rec-aaaaaaaaaa11');

    const all = await call(handle, '/api/nervous/recommendations?all=1');
    expect(all.json<unknown[]>()).toHaveLength(2);
  });

  it('POST /recommendations/dismiss/<id> flips open → dismissed (then excluded)', async () => {
    handle = await startTestServer({ disableAuth: true });
    seedRecommendations(handle.projectRoot);

    const res = await call(handle, '/api/nervous/recommendations/dismiss/rec-aaaaaaaaaa11', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.json<{ dismissed: string }>().dismissed).toBe('rec-aaaaaaaaaa11');

    const after = await call(handle, '/api/nervous/recommendations');
    expect(after.json<unknown[]>()).toHaveLength(0);
  });

  it('POST /recommendations/dismiss/<unknown> returns 404', async () => {
    handle = await startTestServer({ disableAuth: true });
    seedRecommendations(handle.projectRoot);
    const res = await call(handle, '/api/nervous/recommendations/dismiss/rec-nope', { method: 'POST' });
    expect(res.status).toBe(404);
    expect(res.json<{ dismissed: string | null }>().dismissed).toBeNull();
  });
});
