// ─── Serve Endpoints Smoke — Real-Binary GERÇEK-200 Proof (372-004) ──────────
// 371-002 (tests/api/server-endpoint-wire.test.ts) proved server.ts's route
// dispatch REACHES /api/limits + /api/evaluate-health, but did so with MOCKED
// register* handlers and only asserted the real auth chain up to 401. This
// task proves the REAL, unmocked `dist/cli/entry.js serve` binary answers
// four GET routes with a genuine HTTP 200:
//
//   T1: GET /api/status            → 200 (idle:true, fresh project — no
//                                     .dashboard file yet)
//   T2: GET /api/limits            → 200 (see PATH-neutering note below)
//   T3: GET /api/evaluate-health   → 200 (clean:true, no recent-works dir)
//   T4: GET /api/approvals/history → 200 (entries:[], fresh approvals store)
//
// Each route is also checked WITHOUT a Bearer token to prove the auth chain
// is active (401 = route registered + auth-active), matching this task's
// documented fallback contract.
//
// ── Why /api/limits needs a PATH trick, and why it is still a real 200 ──
// registerLimitsRoute (src/api/limits-endpoint.ts) really spawns
// `claude -p "/usage"` (core/limit-preflight.ts) — there is no server.ts-level
// injectable-spawn seam (out of this task's write scope to add one; see that
// file's own header note). This sandbox happens to have a real `claude`
// binary installed, so invoking it live would be non-hermetic (a real
// subprocess, possibly a real API call, possibly slow/non-deterministic).
// Fix: the child server process is spawned via `process.execPath` (an
// absolute path — no PATH lookup needed to find `node` itself) with its
// `PATH` env pointed at a freshly-created EMPTY tmpdir. That guarantees the
// child's *internal* `spawn('claude', ...)` genuinely cannot resolve the
// binary, on any OS — a deterministic ENOENT-equivalent, not a mock. This
// hits limit-preflight.ts's own documented "fail-honest by design" branch for
// real: `{ unavailable: true, reason, windows: [] }` at HTTP 200. Real,
// unmocked production code; zero network calls; fully hermetic and
// cross-platform (an empty PATH dir hides `claude` identically everywhere,
// unlike a shebang-script stub which would need a separate Windows shim).
//
// Hermetic guarantees (mirrors tests/e2e/kpi-surface-smoke.test.ts):
//   - Project root is a fresh tmpdir (os.tmpdir()), never the real repo root.
//   - HOME is sandboxed to a second tmpdir so ~/.deckent is never touched.
//   - Auth uses a known DECKENT_API_TOKEN in the child env — no stderr
//     parsing of the server's auto-mint log line.
//   - Readiness is polled via GET /health (auth-exempt) — never spawnSync.
//   - The server process is closed in afterAll (try/finally); the SIGKILL
//     escalation timer is .unref()-ed to avoid a Windows handle leak.
//   - If dist/cli/entry.js is absent (fresh checkout, no `npm run build`
//     yet), the whole suite is skipped via describe.skipIf — never a hard
//     failure.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync, mkdirSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const ENTRY = resolve(REPO_ROOT, 'dist', 'cli', 'entry.js');

const DIST_ABSENT = !existsSync(ENTRY);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const API_TOKEN = 'serve-smoke-test-token-372-004';

// ─── Free-port discovery (async — never spawnSync) ───────────────────────────

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

// ─── Project scaffold ─────────────────────────────────────────────────────────

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-serve-smoke-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

// ─── Readiness probe ──────────────────────────────────────────────────────────

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
  pathStubDir: string;
  root: string;
}

async function bootRealServer(): Promise<ServerCtx> {
  const root = makeProject();
  const sandboxHome = mkdtempSync(join(tmpdir(), 'deckent-serve-smoke-home-'));
  // Empty dir — deliberately excludes any real `claude` binary from PATH
  // resolution inside the child process (see file header note).
  const pathStubDir = mkdtempSync(join(tmpdir(), 'deckent-serve-smoke-path-'));
  const port = await findFreePort();

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  env['HOME'] = sandboxHome;
  env['DECKENT_API_TOKEN'] = API_TOKEN;
  env['PATH'] = pathStubDir;
  delete env['ANTHROPIC_API_KEY'];

  // Absolute node path — no PATH lookup needed to locate the interpreter
  // itself, which is precisely what lets PATH be neutered for `claude`.
  const child = spawn(
    process.execPath,
    ['--enable-source-maps', ENTRY, 'serve', '--port', String(port), '--no-terminal'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, 25_000);

  return { child, baseUrl, sandboxHome, pathStubDir, root };
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

    const timer = setTimeout(() => {
      try {
        if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
      } catch { /* process may have exited between the check and the kill */ }
      resolveP();
    }, 3_000);
    if (timer.unref) timer.unref();
  });
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function getJson(
  baseUrl: string,
  path: string,
  withAuth: boolean,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (withAuth) headers['Authorization'] = `Bearer ${API_TOKEN}`;
  const resp = await fetch(`${baseUrl}${path}`, { headers });
  const body = (await resp.json()) as Record<string, unknown>;
  return { status: resp.status, body };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(DIST_ABSENT)(
  `serve endpoints smoke — real-binary e2e (372-004)${DIST_ABSENT ? ' [SKIP: dist not built]' : ''}`,
  () => {
    let child: ChildProcess;
    let baseUrl: string;
    let sandboxHome: string;
    let pathStubDir: string;
    let root: string;

    beforeAll(async () => {
      const ctx = await bootRealServer();
      child = ctx.child;
      baseUrl = ctx.baseUrl;
      sandboxHome = ctx.sandboxHome;
      pathStubDir = ctx.pathStubDir;
      root = ctx.root;
    }, 30_000);

    afterAll(async () => {
      try {
        await killServer(child);
      } finally {
        try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
        try { rmSync(sandboxHome, { recursive: true, force: true }); } catch { /* ignore */ }
        try { rmSync(pathStubDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }, 15_000);

    // ── T1: /api/status ──────────────────────────────────────────────────────

    it('T1: GET /api/status → 200 idle (fresh project, no .dashboard yet)', async () => {
      const { status, body } = await getJson(baseUrl, '/api/status', true);
      expect(status).toBe(200);
      expect(body['idle']).toBe(true);
      expect(body['lastSprint']).toBeNull();
    }, 10_000);

    it('T1b: GET /api/status without Bearer token → 401 (auth active)', async () => {
      const { status } = await getJson(baseUrl, '/api/status', false);
      expect(status).toBe(401);
    }, 10_000);

    // ── T2: /api/limits ──────────────────────────────────────────────────────

    it(
      'T2: GET /api/limits → 200 real fail-honest unavailable (claude unresolvable by design)',
      async () => {
        const { status, body } = await getJson(baseUrl, '/api/limits', true);
        expect(status).toBe(200);
        expect(body['unavailable']).toBe(true);
        expect(typeof body['reason']).toBe('string');
        expect(body['windows']).toEqual([]);
      },
      10_000,
    );

    it('T2b: GET /api/limits without Bearer token → 401 (auth active)', async () => {
      const { status } = await getJson(baseUrl, '/api/limits', false);
      expect(status).toBe(401);
    }, 10_000);

    // ── T3: /api/evaluate-health ─────────────────────────────────────────────

    it('T3: GET /api/evaluate-health → 200 clean (no recent-works dir)', async () => {
      const { status, body } = await getJson(baseUrl, '/api/evaluate-health', true);
      expect(status).toBe(200);
      expect(body['clean']).toBe(true);
      expect(body['sprintsScanned']).toBe(0);
      expect(body['counts']).toEqual({
        EVALUATION_FAULT: 0,
        EVALUATE_ABORTED: 0,
        EVALUATE_PREMATURE: 0,
        RESULT_CONTRACT_DRIFT: 0,
      });
    }, 10_000);

    it('T3b: GET /api/evaluate-health without Bearer token → 401 (auth active)', async () => {
      const { status } = await getJson(baseUrl, '/api/evaluate-health', false);
      expect(status).toBe(401);
    }, 10_000);

    // ── T4: /api/approvals/history ───────────────────────────────────────────

    it('T4: GET /api/approvals/history → 200 empty page (fresh approvals store)', async () => {
      const { status, body } = await getJson(baseUrl, '/api/approvals/history', true);
      expect(status).toBe(200);
      expect(body['entries']).toEqual([]);
      expect(body['pagination']).toEqual({
        total: 0, limit: 20, offset: 0, hasMore: false,
      });
    }, 10_000);

    it('T4b: GET /api/approvals/history without Bearer token → 401 (auth active)', async () => {
      const { status } = await getJson(baseUrl, '/api/approvals/history', false);
      expect(status).toBe(401);
    }, 10_000);
  },
);

if (DIST_ABSENT) {
  describe('serve endpoints smoke — real-binary e2e [dist absent]', () => {
    it.skip(
      `SKIP: ${ENTRY} not found — run \`npm run build\` first`,
      () => { /* intentionally skipped */ },
    );
  });
}
