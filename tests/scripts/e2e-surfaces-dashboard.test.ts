// Tests for the 218-011 dashboard extensions to scripts/test-e2e-surfaces.mjs.
// Hermetic: no real spawn, no real HTTP — mocked via opts.spawnImpl + opts.fetchImpl.
// Verifies:
//   1. Dashboard endpoints respond 200 → assertDashboardSurfaces pass.
//   2. Sprint-start POST does NOT block /api/status (218-001 detached path).
//   3. dist-yok skip-guard returns { skipped: true }.
//   4. Throwing fetch mid-assert still triggers child.kill() via try/finally.
// Plus failure-axis tests:
//   5. Dashboard endpoint 401 (auth-fail regression) → pass=false.
//   6. Sprint-start blocked (status timeout simulated) → pass=false.

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertDashboardSurfaces,
  assertSprintStartNoFreeze,
  runE2E,
  REPO_ROOT,
} from '../../scripts/test-e2e-surfaces.mjs';

const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/test-e2e-surfaces.mjs');

// ─── Mock helpers (mirrored from test-e2e-surfaces.test.ts for isolation) ────

function makeFakeChild({
  readyLine = 'Deckent API server listening on http://127.0.0.1:54321',
  emitReady = true,
  exitCode = null,
}: { readyLine?: string; emitReady?: boolean; exitCode?: number | null } = {}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child: any = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.killed = false;
  child.kill = (sig?: string) => {
    child.killed = true;
    child.lastSignal = sig;
    child.emit('exit', null, sig ?? null);
    return true;
  };
  if (emitReady) setImmediate(() => stdout.emit('data', Buffer.from(readyLine + '\n')));
  else if (exitCode !== null) setImmediate(() => child.emit('exit', exitCode, null));
  return child;
}

type Route = { status: number; body?: string };

function makeRouteFetch(routes: Record<string, Route | ((init?: any) => Route)>) {
  return async (url: string, init?: any) => {
    const u = String(url);
    // Strip query string for matching, but also try exact match first.
    for (const [key, val] of Object.entries(routes)) {
      if (u.endsWith(key)) {
        const r = typeof val === 'function' ? val(init) : val;
        return { status: r.status, text: async () => r.body ?? '' };
      }
    }
    // Fallback for `?` query routes (e.g. /api/memory/search?q=test).
    const noQuery = u.split('?')[0]!;
    for (const [key, val] of Object.entries(routes)) {
      if (noQuery.endsWith(key.split('?')[0]!)) {
        const r = typeof val === 'function' ? val(init) : val;
        return { status: r.status, text: async () => r.body ?? '' };
      }
    }
    return { status: 404, text: async () => 'not found' };
  };
}

// ─── 1. Dashboard endpoints all 200 (the happy-path goCriteria) ──────────────

describe('218-011 dashboard endpoints', () => {
  it('all dashboard endpoints respond 200 → assertDashboardSurfaces.pass=true', async () => {
    const fetchImpl = makeRouteFetch({
      '/': { status: 200, body: '<html><script type="module" src="/assets/index-abc.js"></script></html>' },
      '/api/evolution/genealogy': { status: 200 },
      '/api/evolution/retirement': { status: 200 },
      '/api/evolution/prompt-metrics': { status: 200 },
      '/api/memory/search?q=test': { status: 200 },
      '/api/nervous/status': { status: 200 },
    });
    const result = await assertDashboardSurfaces('http://127.0.0.1:1234', { fetchImpl, token: 'tok' });
    expect(result.pass).toBe(true);
    expect(result.hasBundle).toBe(true);
    expect(result.endpointStatuses['/api/evolution/genealogy']).toBe(200);
    expect(result.endpointStatuses['/api/evolution/retirement']).toBe(200);
    expect(result.endpointStatuses['/api/evolution/prompt-metrics']).toBe(200);
    expect(result.endpointStatuses['/api/memory/search?q=test']).toBe(200);
    expect(result.evidence).toContain('OK');
  });

  it('/api/nervous/status=404 is acceptable (route pending wire in 218-005, !=401 check)', async () => {
    const fetchImpl = makeRouteFetch({
      '/': { status: 200, body: '<html>/assets/index-abc.js</html>' },
      '/api/evolution/genealogy': { status: 200 },
      '/api/evolution/retirement': { status: 200 },
      '/api/evolution/prompt-metrics': { status: 200 },
      '/api/memory/search?q=test': { status: 200 },
      '/api/nervous/status': { status: 404 }, // endpoint not wired yet
    });
    const result = await assertDashboardSurfaces('http://127.0.0.1:1234', { fetchImpl, token: 'tok' });
    expect(result.pass).toBe(true); // 404 != 401, gate passes
    expect(result.checks['/api/nervous/status!=401']).toBe(true);
  });

  it('dashboard endpoint 401 (auth-fail) → assertDashboardSurfaces.pass=false', async () => {
    const fetchImpl = makeRouteFetch({
      '/': { status: 200, body: '<html>/assets/index-abc.js</html>' },
      '/api/evolution/genealogy': { status: 401 }, // simulates auth regression
      '/api/evolution/retirement': { status: 200 },
      '/api/evolution/prompt-metrics': { status: 200 },
      '/api/memory/search?q=test': { status: 200 },
      '/api/nervous/status': { status: 200 },
    });
    const result = await assertDashboardSurfaces('http://127.0.0.1:1234', { fetchImpl, token: 'tok' });
    expect(result.pass).toBe(false);
    expect(result.evidence).toContain('/api/evolution/genealogy=200');
  });

  it('missing bundle (no /assets/index- or script type=module) → pass=false', async () => {
    const fetchImpl = makeRouteFetch({
      '/': { status: 200, body: '<html>no bundle here</html>' },
      '/api/evolution/genealogy': { status: 200 },
      '/api/evolution/retirement': { status: 200 },
      '/api/evolution/prompt-metrics': { status: 200 },
      '/api/memory/search?q=test': { status: 200 },
      '/api/nervous/status': { status: 200 },
    });
    const result = await assertDashboardSurfaces('http://127.0.0.1:1234', { fetchImpl, token: 'tok' });
    expect(result.pass).toBe(false);
    expect(result.hasBundle).toBe(false);
    expect(result.evidence).toContain('bundle-present');
  });
});

// ─── 2. Sprint-start no-freeze ──────────────────────────────────────────────

describe('218-011 sprint-start no-freeze', () => {
  it('POST /api/start=202 then GET /api/status=200 → pass=true', async () => {
    const fetchImpl = makeRouteFetch({
      '/api/start': { status: 202, body: '{}' },
      '/api/status': { status: 200, body: '{}' },
    });
    const result = await assertSprintStartNoFreeze('http://127.0.0.1:1234', { fetchImpl, token: 'tok' });
    expect(result.pass).toBe(true);
    expect(result.startStatus).toBe(202);
    expect(result.statusAfter).toBe(200);
  });

  it('POST /api/start=409 (already running) is acceptable, status still=200', async () => {
    const fetchImpl = makeRouteFetch({
      '/api/start': { status: 409 },
      '/api/status': { status: 200, body: '{}' },
    });
    const result = await assertSprintStartNoFreeze('http://127.0.0.1:1234', { fetchImpl, token: 'tok' });
    expect(result.pass).toBe(true);
    expect(result.startStatus).toBe(409);
  });

  it('FREEZE detected: /api/status returns non-200 after start → pass=false', async () => {
    // Simulate the pre-218-001 bug: serve event loop blocked, status fails.
    const fetchImpl = makeRouteFetch({
      '/api/start': { status: 202 },
      '/api/status': { status: 500, body: 'event loop blocked' },
    });
    const result = await assertSprintStartNoFreeze('http://127.0.0.1:1234', { fetchImpl, token: 'tok' });
    expect(result.pass).toBe(false);
    expect(result.evidence).toContain('FREEZE');
    expect(result.statusAfter).toBe(500);
  });

  it('FREEZE detected: /api/status throws (timeout/hang simulation) → pass=false', async () => {
    let call = 0;
    const fetchImpl = async (_url: string, _init?: any) => {
      call += 1;
      if (call === 1) return { status: 202, text: async () => '{}' };
      throw new Error('status hang — event loop blocked');
    };
    const result = await assertSprintStartNoFreeze('http://127.0.0.1:1234', { fetchImpl: fetchImpl as any, token: 'tok' });
    expect(result.pass).toBe(false);
    expect(String(result.statusAfter)).toContain('error:');
  });
});

// ─── 3. runE2E: dist-yok skip + kill-on-fail (integration via mocks) ────────

describe('218-011 runE2E orchestrator', () => {
  it('dist-yok skip-guard: returns { skipped: true } when entry missing', async () => {
    const result = await runE2E({ entry: '/definitely/missing/dist/cli/entry.js' });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/dist not built/i);
  });

  it('kill-on-fail: throwing fetch still triggers child.kill via try/finally', async () => {
    const killTracker = { killed: false, signal: null as string | null };
    const fakeSpawn = () => {
      const c = makeFakeChild({ readyLine: 'Deckent API server listening on http://127.0.0.1:9999' });
      const origKill = c.kill;
      c.kill = (sig?: string) => { killTracker.killed = true; killTracker.signal = sig ?? null; return origKill.call(c, sig); };
      return c;
    };
    const throwingFetch = async () => { throw new Error('mid-assert boom'); };
    const result = await runE2E({
      entry: SCRIPT_PATH, // exists, satisfies existsSync skip-guard
      spawnImpl: fakeSpawn as any,
      fetchImpl: throwingFetch as any,
      port: 9999,
      killSignal: 'SIGTERM',
    });
    expect(result.skipped).toBeUndefined();
    expect(result.pass).toBe(false);
    expect(killTracker.killed).toBe(true);
    expect(killTracker.signal).toBe('SIGTERM');
  });

  it('aggregate pass: all three gates green → runE2E.pass=true', async () => {
    const fakeSpawn = () => makeFakeChild({ readyLine: 'Deckent API server listening on http://127.0.0.1:9998' });
    // assertSurfaces hits / then /api/status with the token from HTML.
    // assertDashboardSurfaces hits / again + dashboard endpoints + nervous.
    // assertSprintStartNoFreeze hits /api/start + /api/status.
    const html = '<html>window.__DECKENT_API_TOKEN__ = "tok-aggregate";/assets/index-x.js</html>';
    const fetchImpl = makeRouteFetch({
      '/': { status: 200, body: html },
      '/api/status': { status: 200, body: '{}' },
      '/api/evolution/genealogy': { status: 200 },
      '/api/evolution/retirement': { status: 200 },
      '/api/evolution/prompt-metrics': { status: 200 },
      '/api/memory/search?q=test': { status: 200 },
      '/api/nervous/status': { status: 200 },
      '/api/start': { status: 202 },
    });
    const result = await runE2E({
      entry: SCRIPT_PATH,
      spawnImpl: fakeSpawn as any,
      fetchImpl: fetchImpl as any,
      port: 9998,
      killSignal: 'SIGTERM',
    });
    expect(result.pass).toBe(true);
    expect(result.dashboardPass).toBe(true);
    expect(result.sprintStartPass).toBe(true);
    expect(result.evidence).toContain('dashboard:');
    expect(result.evidence).toContain('sprint-start no-freeze');
  });

  it('aggregate fail: dashboard endpoint 401 → runE2E.pass=false (sprint-start may still pass)', async () => {
    const fakeSpawn = () => makeFakeChild({ readyLine: 'Deckent API server listening on http://127.0.0.1:9997' });
    const html = '<html>window.__DECKENT_API_TOKEN__ = "tok";/assets/index-y.js</html>';
    const fetchImpl = makeRouteFetch({
      '/': { status: 200, body: html },
      '/api/status': { status: 200, body: '{}' },
      '/api/evolution/genealogy': { status: 401 }, // regression
      '/api/evolution/retirement': { status: 200 },
      '/api/evolution/prompt-metrics': { status: 200 },
      '/api/memory/search?q=test': { status: 200 },
      '/api/nervous/status': { status: 200 },
      '/api/start': { status: 202 },
    });
    const result = await runE2E({
      entry: SCRIPT_PATH,
      spawnImpl: fakeSpawn as any,
      fetchImpl: fetchImpl as any,
      port: 9997,
    });
    expect(result.pass).toBe(false);
    expect(result.dashboardPass).toBe(false);
  });
});

// ─── 4. Script artifact + Kanit keyword presence ────────────────────────────

describe('218-011 harness artifact + kanit keywords', () => {
  it('script file exists and Kanit grep keywords present (>=3)', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    const text = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(text).toMatch(/evolution/);
    expect(text).toMatch(/nervous/);
    expect(text).toMatch(/memory/);
    expect(text).toMatch(/api\/start/);
    expect(text).toMatch(/=== 200|=== 202|=== 409|status === 200/);
  });
});
