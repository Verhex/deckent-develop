#!/usr/bin/env node
// test-e2e-surfaces.mjs — permanent regression guard for user-surface flows
// (Sprint 216 Task 216-005, ADR-078 + karpathy-discipline CUSTOM "Proof-of-Function").
//
// Boots the REAL `dist/cli/entry.js serve` on a free random port, asserts:
//   1. GET /            → 200 + HTML contains `__DECKENT_API_TOKEN__` placeholder
//   2. GET /api/status  → 200 (auth via the placeholder token, auto-minted)
// Then kills the child process via try/finally (always cleans up).
//
// Hermetic: uses os.tmpdir() for projectRoot + HOME-sandbox, skips when dist
// is missing (no install required for fresh checkouts). Tests for THIS script
// inject mock spawn/fetch via opts; real-binary boot only when `npm run
// test:e2e-surfaces` is invoked directly.
//
// Usage:
//   npm run test:e2e-surfaces                 # real boot, full assert chain
//   node scripts/test-e2e-surfaces.mjs        # same as above
//
// Exit codes: 0 = all surfaces green, 1 = at least one assertion failed,
//             2 = skipped (dist not built; fresh-checkout pass)

import { spawn as nodeSpawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(__filename), '..');
export const DEFAULT_ENTRY = resolve(REPO_ROOT, 'dist/cli/entry.js');

const READY_SIGNAL = /Deckent API server listening on (http:\/\/[^\s]+)/;
const BOOT_TIMEOUT_MS = 15_000;

// ─── Free port discovery ──────────────────────────────────────────────────────

/**
 * Bind ephemeral port via OS, then release it. Caller passes the returned
 * number to `serve --port N` — small race window is acceptable for a local
 * smoke harness (CI workers are quiet).
 */
export function findFreePort() {
  return new Promise((resolveP, rejectP) => {
    const srv = createServer();
    srv.once('error', rejectP);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      srv.close((err) => (err ? rejectP(err) : port ? resolveP(port) : rejectP(new Error('no port'))));
    });
  });
}

// ─── Boot dist/cli/entry.js serve ─────────────────────────────────────────────

/**
 * Spawn `node dist/cli/entry.js serve --port N --no-terminal` and wait for the
 * ready signal in stdout. Returns { child, baseUrl }. Caller MUST call
 * child.kill() in a finally block.
 *
 * opts.spawnImpl injects a custom spawner for tests (default: node:child_process).
 * opts.entry overrides the default dist entry path (default: dist/cli/entry.js).
 * opts.cwd overrides the working directory (default: a fresh tmpdir).
 * opts.timeoutMs caps how long we wait for the ready signal.
 */
export function bootServer(opts = {}) {
  const entry = opts.entry ?? DEFAULT_ENTRY;
  const port = opts.port;
  const spawnImpl = opts.spawnImpl ?? nodeSpawn;
  const cwd = opts.cwd ?? mkdtempSync(join(tmpdir(), 'deckent-e2e-surfaces-'));
  const timeoutMs = opts.timeoutMs ?? BOOT_TIMEOUT_MS;
  const sandboxHome = opts.sandboxHome ?? mkdtempSync(join(tmpdir(), 'deckent-e2e-home-'));
  const env = {
    ...process.env,
    HOME: sandboxHome,
    // Strip API key so auto-mint path is exercised (matches the smoke directive).
    ANTHROPIC_API_KEY: '',
  };
  delete env.ANTHROPIC_API_KEY;

  const args = ['--enable-source-maps', entry, 'serve', '--port', String(port), '--no-terminal'];
  const child = spawnImpl('node', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

  const baseUrlPromise = new Promise((resolveP, rejectP) => {
    let resolved = false;
    let buf = '';
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      rejectP(new Error(`bootServer timeout after ${timeoutMs}ms; stdout=${buf.slice(0, 400)}`));
    }, timeoutMs);

    const onData = (chunk) => {
      buf += String(chunk);
      const match = buf.match(READY_SIGNAL);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolveP(match[1].replace(/0\.0\.0\.0/, '127.0.0.1'));
      }
    };

    if (child.stdout) child.stdout.on('data', onData);
    if (child.stderr) child.stderr.on('data', onData); // some lines may land on stderr

    child.once('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      rejectP(err);
    });

    child.once('exit', (code, signal) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      rejectP(new Error(`bootServer child exited prematurely code=${code} signal=${signal} stdout=${buf.slice(0, 400)}`));
    });
  });

  return { child, baseUrlPromise, cwd, sandboxHome };
}

// ─── HTTP assertions ──────────────────────────────────────────────────────────

/**
 * Run the proof-of-function assertions against a live serve instance.
 *   1. GET /            → status 200 AND body contains "__DECKENT_API_TOKEN__"
 *   2. GET /api/status  → status 200 (must NOT be 401)
 * Returns { pass, evidence, rootStatus, hasTokenPlaceholder, statusCode }.
 *
 * opts.fetchImpl injects a fetch stub for tests; defaults to global fetch.
 */
export async function assertSurfaces(baseUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  const rootRes = await fetchImpl(`${baseUrl}/`);
  const rootBody = await rootRes.text();
  const rootStatus = rootRes.status;
  const hasTokenPlaceholder = rootBody.includes('__DECKENT_API_TOKEN__');
  const tokenMatch = rootBody.match(/window\.__DECKENT_API_TOKEN__\s*=\s*"([^"]+)"/);
  const token = tokenMatch ? tokenMatch[1] : null;

  const statusHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const statusRes = await fetchImpl(`${baseUrl}/api/status`, { headers: statusHeaders });
  const statusCode = statusRes.status;

  const checks = {
    'root=200': rootStatus === 200,
    '__DECKENT_API_TOKEN__': hasTokenPlaceholder,
    '/api/status=200': statusCode === 200,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  const pass = failed.length === 0;
  const evidence = pass
    ? `root=${rootStatus} token=present status=${statusCode}`
    : `failed: ${failed.join(', ')} (root=${rootStatus} token=${hasTokenPlaceholder} status=${statusCode})`;

  return { pass, evidence, rootStatus, hasTokenPlaceholder, statusCode, token };
}

// ─── Dashboard surface + sprint-start no-freeze assertions (218-011) ──────────

const DASHBOARD_ENDPOINTS = ['/api/evolution/genealogy', '/api/evolution/retirement', '/api/evolution/prompt-metrics', '/api/memory/search?q=test'];

async function safeFetchStatus(fetchImpl, url, init) {
  try { return (await fetchImpl(url, init)).status; }
  catch (err) { return `error:${err instanceof Error ? err.message : String(err)}`; }
}

// Asserts served HTML carries a built bundle AND read-only dashboard endpoints
// respond 200 with a Bearer token. `/api/nervous/status` accepts non-401 (route
// pending wire in 218-005; gate asserts auth passes, not route exists).
export async function assertDashboardSurfaces(baseUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const token = opts.token ?? null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const rootRes = await fetchImpl(`${baseUrl}/`);
  const rootBody = await rootRes.text();
  const rootStatus = rootRes.status;
  const hasBundle = rootBody.includes('/assets/index-') || rootBody.includes('<script type="module"');
  const endpointStatuses = {};
  for (const ep of DASHBOARD_ENDPOINTS) {
    endpointStatuses[ep] = await safeFetchStatus(fetchImpl, `${baseUrl}${ep}`, { headers });
  }
  const nervousStatus = await safeFetchStatus(fetchImpl, `${baseUrl}/api/nervous/status`, { headers });
  endpointStatuses['/api/nervous/status'] = nervousStatus;
  const checks = {
    'root=200': rootStatus === 200,
    'bundle-present': hasBundle,
    '/api/evolution/genealogy=200': endpointStatuses['/api/evolution/genealogy'] === 200,
    '/api/evolution/retirement=200': endpointStatuses['/api/evolution/retirement'] === 200,
    '/api/evolution/prompt-metrics=200': endpointStatuses['/api/evolution/prompt-metrics'] === 200,
    '/api/memory/search=200': endpointStatuses['/api/memory/search?q=test'] === 200,
    '/api/nervous/status!=401': nervousStatus !== 401,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  const pass = failed.length === 0;
  const evidence = pass ? `dashboard: bundle+5 endpoints OK (nervous=${nervousStatus})` : `dashboard failed: ${failed.join(', ')}`;
  return { pass, evidence, checks, endpointStatuses, rootStatus, hasBundle };
}

// Asserts POST /api/start does NOT block the serve event loop: start sprint
// (expect 202 or 409 already-running), then immediately poll /api/status
// (MUST be 200). 218-001 wired `startSprintDetached` to prevent this freeze.
export async function assertSprintStartNoFreeze(baseUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const token = opts.token ?? null;
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const startStatus = await safeFetchStatus(fetchImpl, `${baseUrl}/api/start`, {
    method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: '{}',
  });
  const statusAfter = await safeFetchStatus(fetchImpl, `${baseUrl}/api/status`, { headers: authHeader });
  const pass = (startStatus === 202 || startStatus === 409) && statusAfter === 200;
  const evidence = pass
    ? `sprint-start no-freeze: start=${startStatus} status-after=${statusAfter}`
    : `sprint-start FREEZE detected: start=${startStatus} status-after=${statusAfter}`;
  return { pass, evidence, startStatus, statusAfter };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * End-to-end: skip-guard → port → boot → assert → kill (try/finally).
 * Returns { skipped?, pass?, evidence?, reason?, durationMs }.
 *
 * opts.entry, opts.spawnImpl, opts.fetchImpl, opts.cwd, opts.timeoutMs are
 * forwarded for testing. opts.killSignal defaults to 'SIGTERM'.
 */
export async function runE2E(opts = {}) {
  const entry = opts.entry ?? DEFAULT_ENTRY;
  const killSignal = opts.killSignal ?? 'SIGTERM';
  const startedAt = Date.now();

  if (!existsSync(entry)) {
    return {
      skipped: true,
      reason: `dist not built — missing ${entry}. Run \`npm run build\` first.`,
      durationMs: Date.now() - startedAt,
    };
  }

  const port = opts.port ?? (await findFreePort());
  const { child, baseUrlPromise, cwd, sandboxHome } = bootServer({ ...opts, entry, port });

  let assertResult = null, dashboardResult = null, sprintStartResult = null;
  try {
    const baseUrl = await baseUrlPromise;
    assertResult = await assertSurfaces(baseUrl, { fetchImpl: opts.fetchImpl });
    // 218-011: dashboard + sprint-start no-freeze (skip when base auth fails).
    if (assertResult.pass) {
      const passOpts = { fetchImpl: opts.fetchImpl, token: assertResult.token };
      dashboardResult = await assertDashboardSurfaces(baseUrl, passOpts);
      sprintStartResult = await assertSprintStartNoFreeze(baseUrl, passOpts);
    }
  } catch (err) {
    assertResult = { pass: false, evidence: `error: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    try { if (child && !child.killed) child.kill(killSignal); } catch { /* best-effort */ }
    if (!opts.cwd) { try { rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ } }
    if (!opts.sandboxHome) { try { rmSync(sandboxHome, { recursive: true, force: true }); } catch { /* ignore */ } }
  }
  const aggregatePass = assertResult.pass && (dashboardResult === null || dashboardResult.pass) && (sprintStartResult === null || sprintStartResult.pass);
  const evidence = [assertResult.evidence, dashboardResult?.evidence, sprintStartResult?.evidence].filter(Boolean).join(' | ');
  return {
    pass: aggregatePass, evidence,
    rootStatus: assertResult.rootStatus, hasTokenPlaceholder: assertResult.hasTokenPlaceholder, statusCode: assertResult.statusCode,
    dashboardPass: dashboardResult ? dashboardResult.pass : null,
    sprintStartPass: sprintStartResult ? sprintStartResult.pass : null,
    dashboard: dashboardResult, sprintStart: sprintStartResult,
    port, durationMs: Date.now() - startedAt,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  runE2E()
    .then((result) => {
      if (result.skipped) {
        process.stderr.write(`SKIP: ${result.reason}\n`);
        process.exit(2);
      }
      if (result.pass) {
        process.stdout.write(`PASS ${result.evidence} (${result.durationMs}ms, port=${result.port})\n`);
        process.exit(0);
      }
      process.stderr.write(`FAIL ${result.evidence} (${result.durationMs}ms, port=${result.port})\n`);
      process.exit(1);
    })
    .catch((err) => {
      process.stderr.write(`FAIL: ${err instanceof Error ? err.stack : String(err)}\n`);
      process.exit(1);
    });
}
