// ─── KPI Surface Smoke — ADR-079 Tier-1 Real-Binary E2E ──────────────────────
// Sprint 333 Task 333-004. End-to-end proof that the BUILT artifact actually
// serves the KPI surfaces introduced in sprint-331/332:
//
//   T1: GET /                                 → 200 (dashboard shell)
//   T2: GET /api/kpi                          → 200 + non-empty kpis[], cost KPI
//                                               carries a numeric value (forward-
//                                               collection fix verified)
//   T3: GET /api/kpi/trend?kpiId=cost_per_sprint → 200 + non-empty series[]
//
// Hermetic guarantees (ADR-079 + karpathy-discipline CUSTOM "Test Hermeticity"):
//   - Project root is a fresh tmpdir (os.tmpdir() — never the real repo root).
//   - HOME is sandboxed to a second tmpdir so ~/.deckent is not read or written.
//   - The DB is seeded via the real KpiStore (upsertResults) — not mocked.
//   - Auth uses a known DECKENT_API_TOKEN set in the child env — no stderr parsing.
//   - Readiness is detected by polling GET /health (auth-exempt) — never spawnSync.
//   - The server process is closed in afterEach (try/finally); the timer that
//     escalates to SIGKILL is .unref()-ed to prevent handle leaks on Windows.
//   - If dist/cli/entry.js is absent (fresh checkout without `npm run build`),
//     the entire suite is skipped via describe.skipIf — never a hard failure.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const ENTRY = resolve(REPO_ROOT, 'dist', 'cli', 'entry.js');

// Skip the entire suite if the binary has not been built yet.
const DIST_ABSENT = !existsSync(ENTRY);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SPRINT_ID = 'sprint-999-kpi-smoke';
const PREV_SPRINT_ID = 'sprint-998-kpi-smoke';
const API_TOKEN = 'kpi-smoke-test-token-333-004';
const TENANT_ID = 'default';

// ─── Free-port discovery ──────────────────────────────────────────────────────

function findFreePort(): Promise<number> {
  return new Promise((resolveP, rejectP) => {
    const srv = createServer();
    srv.once('error', rejectP);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      srv.close((err) => {
        if (err) rejectP(err);
        else if (port) resolveP(port);
        else rejectP(new Error('no port assigned'));
      });
    });
  });
}

// ─── DB seeding ───────────────────────────────────────────────────────────────

/**
 * Seed `.brain/memory.db` with finalized kpi_results for two sprint periods:
 * - PREV_SPRINT_ID: an older sprint (needed for non-empty trend series[])
 * - SPRINT_ID:      the "current" sprint the endpoint serves (scorecard)
 *
 * Uses the real KpiStore (upsertResults) — no mocks, no in-memory substitutes.
 */
function seedDatabase(projectRoot: string): void {
  const dbPath = join(projectRoot, '.brain', 'memory.db');
  const store = new KpiStore(dbPath);
  try {
    store.upsertResults([
      {
        tenantId: TENANT_ID,
        kpiId: 'cost_per_sprint',
        grain: 'sprint',
        periodKey: PREV_SPRINT_ID,
        value: 0.98,
        status: 'healthy',
      },
      {
        tenantId: TENANT_ID,
        kpiId: 'cost_per_sprint',
        grain: 'sprint',
        periodKey: SPRINT_ID,
        value: 1.23,
        status: 'healthy',
      },
    ]);
  } finally {
    store.close();
  }
}

// ─── Project scaffold ─────────────────────────────────────────────────────────

/**
 * Create a hermetic tmpdir project:
 *   .deckent/sprint-active.json → points getCurrentSprintId() to SPRINT_ID
 *   .brain/memory.db            → seeded kpi_results (cost_per_sprint × 2 periods)
 */
function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-kpi-smoke-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });

  // Tell the server which sprint is active
  writeFileSync(
    join(root, '.deckent', 'sprint-active.json'),
    JSON.stringify({ sprintId: SPRINT_ID }),
    'utf-8',
  );

  seedDatabase(root);
  return root;
}

// ─── Readiness probe ──────────────────────────────────────────────────────────

/**
 * Poll GET /health (auth-exempt) until the server responds 200 or we time out.
 * Uses async setTimeout — never blocks the event loop.
 */
async function waitForServer(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${baseUrl}/health`);
      if (resp.status === 200) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise<void>((res) => setTimeout(res, 150));
  }
  throw new Error(
    `Server not ready at ${baseUrl}/health within ${timeoutMs}ms — last error: ${String(lastErr)}`,
  );
}

// ─── Server boot ──────────────────────────────────────────────────────────────

interface ServerCtx {
  child: ChildProcess;
  baseUrl: string;
  sandboxHome: string;
  root: string;
}

async function bootRealServer(): Promise<ServerCtx> {
  const root = makeProject();
  const sandboxHome = mkdtempSync(join(tmpdir(), 'deckent-kpi-smoke-home-'));
  const port = await findFreePort();

  const env: Record<string, string> = {};
  // Copy parent env selectively — include PATH so node/binaries resolve, but
  // override HOME and inject a known token. Strip the real API key so no live
  // AI calls happen.
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  env['HOME'] = sandboxHome;
  env['DECKENT_API_TOKEN'] = API_TOKEN;
  delete env['ANTHROPIC_API_KEY'];

  const child = spawn(
    'node',
    ['--enable-source-maps', ENTRY, 'serve', '--port', String(port), '--no-terminal'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const baseUrl = `http://127.0.0.1:${port}`;

  // Wait for the TCP listener to be ready (polling /health, no spawnSync)
  await waitForServer(baseUrl, 25_000);

  return { child, baseUrl, sandboxHome, root };
}

// ─── Server teardown ──────────────────────────────────────────────────────────

function killServer(child: ChildProcess): Promise<void> {
  return new Promise((resolveP) => {
    if (child.exitCode !== null || child.killed) {
      resolveP();
      return;
    }
    child.once('exit', () => resolveP());
    child.kill('SIGTERM');

    // Escalate to SIGKILL if SIGTERM is not enough (e.g. Windows).
    // .unref() ensures this timer does not keep the event loop alive after the
    // test suite finishes — the Windows handle-leak guard the task requires.
    const timer = setTimeout(() => {
      try {
        if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
      } catch { /* process may have exited between the check and the kill */ }
      resolveP();
    }, 3_000);
    if (timer.unref) timer.unref();
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(DIST_ABSENT)(
  `KPI surface smoke — real-binary e2e (ADR-079 Tier-1)${DIST_ABSENT ? ' [SKIP: dist not built]' : ''}`,
  () => {
    let child: ChildProcess;
    let baseUrl: string;
    let sandboxHome: string;
    let root: string;

    beforeEach(async () => {
      const ctx = await bootRealServer();
      child = ctx.child;
      baseUrl = ctx.baseUrl;
      sandboxHome = ctx.sandboxHome;
      root = ctx.root;
    }, 35_000);

    afterEach(async () => {
      try {
        await killServer(child);
      } finally {
        try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
        try { rmSync(sandboxHome, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }, 15_000);

    // ── T1: Dashboard shell ──────────────────────────────────────────────────

    it('T1: GET / → 200 (dashboard shell served by real binary)', async () => {
      const resp = await fetch(`${baseUrl}/`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      });
      expect(resp.status).toBe(200);
    }, 15_000);

    // ── T2: KPI scorecard ────────────────────────────────────────────────────

    it(
      'T2: GET /api/kpi → 200 + non-empty kpis[] + cost_per_sprint has numeric value',
      async () => {
        const resp = await fetch(`${baseUrl}/api/kpi`, {
          headers: { Authorization: `Bearer ${API_TOKEN}` },
        });
        expect(resp.status).toBe(200);

        const body = (await resp.json()) as {
          sprintId: string | null;
          kpis: Array<{ id: string; value: number | null; status: string }>;
        };
        expect(Array.isArray(body.kpis)).toBe(true);
        expect(body.kpis.length).toBeGreaterThan(0);

        const costKpi = body.kpis.find((k) => k.id === 'cost_per_sprint');
        expect(costKpi).toBeDefined();
        // Forward-collection fix verified: value must be a number, not null.
        expect(typeof costKpi!.value).toBe('number');
        // The seeded value is 1.23 — confirm the real KpiStore data reached the API.
        expect(costKpi!.value).toBeCloseTo(1.23, 2);
      },
      15_000,
    );

    // ── T3: KPI trend ────────────────────────────────────────────────────────

    it(
      'T3: GET /api/kpi/trend?kpiId=cost_per_sprint → 200 + non-empty series[]',
      async () => {
        const resp = await fetch(`${baseUrl}/api/kpi/trend?kpiId=cost_per_sprint`, {
          headers: { Authorization: `Bearer ${API_TOKEN}` },
        });
        expect(resp.status).toBe(200);

        const body = (await resp.json()) as {
          kpiId: string;
          series: Array<{ periodKey: string; value: number; status: string }>;
        };
        expect(body.kpiId).toBe('cost_per_sprint');
        expect(Array.isArray(body.series)).toBe(true);
        // At least one point (we seeded two periods, so at least 1 returned)
        expect(body.series.length).toBeGreaterThan(0);
        // Confirm series items carry the expected shape
        const first = body.series[0];
        expect(typeof first!.periodKey).toBe('string');
        expect(typeof first!.value).toBe('number');
      },
      15_000,
    );
  },
);

// ─── Explicit skip notice when dist is absent ─────────────────────────────────
// describe.skipIf suppresses the block entirely; this gives a visible test row
// in the report so CI reviewers understand the skip reason rather than seeing
// 0 tests from this file.

if (DIST_ABSENT) {
  describe('KPI surface smoke — real-binary e2e [dist absent]', () => {
    it.skip(
      `SKIP: ${ENTRY} not found — run \`npm run build\` first`,
      () => { /* intentionally skipped */ },
    );
  });
}
