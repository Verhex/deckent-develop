#!/usr/bin/env node
// audit-user-surfaces.mjs — re-audit "DONE" user-surface tasks via the real
// `dist/cli/entry.js` binary and report hollow vs real per Proof-of-Function
// DoD (feedback_proof_of_function_dod / Sprint 216).
//
// Surfaces probed:
//   - serve     → real-binary boot, expect / 200 + __DECKENT_API_TOKEN__ + /api/status 200
//   - chat      → real-binary CLI, expect non-empty / non-error stdout for one user turn
//   - dashboard → derived from serve (/ HTML served by serve)
//
// Each surface yields `{ surface, real, evidence, hollow_reason? }`.
// A `200 but missing token` or `200 but /api/status 401` is classified HOLLOW
// (Sprint 214 serve-token-inject regression signature).
//
// Async spawn only (no spawnSync — would block CI event loop). try/finally
// guarantees server kill on failure.
//
// Run directly: node scripts/audit-user-surfaces.mjs [--port <n>]
// Import in tests: import { classifySurface, formatReport, runAudit } from ...

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Pure classifier: given a probe result, decide REAL vs HOLLOW.
 *
 * Probe shapes:
 *   serve     → { surface:'serve', httpRoot:number, tokenPresent:boolean, apiStatus:number }
 *   chat      → { surface:'chat',  stdout:string, errored:boolean, exitCode:number }
 *   dashboard → { surface:'dashboard', httpRoot:number, tokenPresent:boolean }
 *
 * REAL means: the surface is observably user-working, not just wired.
 * HOLLOW means: surface looked alive (e.g. 200) but the user-facing contract
 * is broken (no token, 401 behind, empty cli output).
 */
export function classifySurface(probe) {
  const surface = probe?.surface ?? 'unknown';

  if (surface === 'serve') {
    if (probe.httpRoot !== 200) {
      return { real: false, hollow_reason: `http_root=${probe.httpRoot ?? 'n/a'}` };
    }
    if (!probe.tokenPresent) {
      return { real: false, hollow_reason: 'http_root=200 but __DECKENT_API_TOKEN__ missing' };
    }
    if (probe.apiStatus !== 200) {
      return { real: false, hollow_reason: `/ 200 but /api/status=${probe.apiStatus ?? 'n/a'}` };
    }
    return { real: true };
  }

  if (surface === 'dashboard') {
    if (probe.httpRoot !== 200) {
      return { real: false, hollow_reason: `http_root=${probe.httpRoot ?? 'n/a'}` };
    }
    if (!probe.tokenPresent) {
      return { real: false, hollow_reason: 'dashboard HTML served but token absent' };
    }
    return { real: true };
  }

  if (surface === 'chat') {
    if (probe.errored) {
      return { real: false, hollow_reason: `chat process errored (exit=${probe.exitCode ?? 'n/a'})` };
    }
    const out = (probe.stdout ?? '').trim();
    if (out.length === 0) {
      return { real: false, hollow_reason: 'empty stdout' };
    }
    if (/^error[: ]/i.test(out) || /traceback/i.test(out)) {
      return { real: false, hollow_reason: 'stdout looks like an error message' };
    }
    return { real: true };
  }

  return { real: false, hollow_reason: 'unknown surface' };
}

// ─── Report formatting ────────────────────────────────────────────────────────

/**
 * Render results as a Markdown report. `distSkipped` indicates the audit
 * could not run because `dist/cli/entry.js` was absent on a fresh checkout.
 */
export function formatReport(results, { distSkipped = false, generatedAt = new Date().toISOString() } = {}) {
  const lines = [];
  lines.push('# User-Surface Re-Audit Report');
  lines.push('');
  lines.push(`- Generated: ${generatedAt}`);
  if (distSkipped) {
    lines.push('- Status: **SKIPPED** (dist/cli/entry.js not present — run `npm run build` first)');
    lines.push('');
    return lines.join('\n');
  }

  const real = results.filter((r) => r.real).length;
  const hollow = results.length - real;
  lines.push(`- Surfaces probed: ${results.length}`);
  lines.push(`- REAL: ${real}`);
  lines.push(`- HOLLOW: ${hollow}`);
  lines.push('');
  lines.push('| surface | status | evidence |');
  lines.push('| --- | --- | --- |');
  for (const r of results) {
    const status = r.real ? 'REAL' : 'HOLLOW';
    const evidence = (r.evidence ?? r.hollow_reason ?? '').replace(/\|/g, '\\|');
    lines.push(`| ${r.surface} | ${status} | ${evidence} |`);
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Probes (using injected spawn + fetch for hermeticity) ───────────────────

const DEFAULT_PORT = 38216;

function pickFreePort(base) {
  // Pseudo-random offset based on time; collisions caller-handled (graceful).
  return base + Math.floor(Math.random() * 200);
}

async function readStreamWithLimit(stream, limit = 16 * 1024) {
  return new Promise((resolveStream) => {
    if (!stream) return resolveStream('');
    let buf = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolveStream(buf);
    };
    stream.on('data', (chunk) => {
      if (buf.length >= limit) return;
      buf += chunk.toString('utf8');
      if (buf.length >= limit) finish();
    });
    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', finish);
  });
}

async function waitForServe(fetchFn, port, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetchFn(`http://127.0.0.1:${port}/`);
      if (res && typeof res.status === 'number') return res;
    } catch (err) {
      lastErr = err?.message ?? String(err);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`serve did not respond on :${port} within ${deadlineMs}ms (last=${lastErr})`);
}

async function probeServe({ spawnFn, fetchFn, projectRoot, port }) {
  const entry = resolvePath(projectRoot, 'dist/cli/entry.js');
  const child = spawnFn('node', [entry, 'serve', '--port', String(port), '--no-terminal'], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let httpRoot = 0;
  let tokenPresent = false;
  let apiStatus = 0;
  let evidenceParts = [];

  try {
    const rootRes = await waitForServe(fetchFn, port, 8000);
    httpRoot = rootRes.status;
    const html = typeof rootRes.text === 'function' ? await rootRes.text() : '';
    tokenPresent = html.includes('__DECKENT_API_TOKEN__');

    const statusRes = await fetchFn(`http://127.0.0.1:${port}/api/status`);
    apiStatus = statusRes?.status ?? 0;

    evidenceParts.push(`http_root=${httpRoot}`, `token=${tokenPresent ? 1 : 0}`, `api_status=${apiStatus}`);
  } catch (err) {
    evidenceParts.push(`error=${err?.message ?? String(err)}`);
  } finally {
    try {
      child.kill?.('SIGTERM');
    } catch {
      /* noop */
    }
  }

  const verdict = classifySurface({ surface: 'serve', httpRoot, tokenPresent, apiStatus });
  return {
    surface: 'serve',
    real: verdict.real,
    evidence: evidenceParts.join(' '),
    hollow_reason: verdict.hollow_reason,
    raw: { httpRoot, tokenPresent, apiStatus },
  };
}

async function probeDashboardFromServe(serveResult) {
  const raw = serveResult.raw ?? {};
  const verdict = classifySurface({
    surface: 'dashboard',
    httpRoot: raw.httpRoot,
    tokenPresent: raw.tokenPresent,
  });
  return {
    surface: 'dashboard',
    real: verdict.real,
    evidence: `derived-from-serve http_root=${raw.httpRoot ?? 'n/a'} token=${raw.tokenPresent ? 1 : 0}`,
    hollow_reason: verdict.hollow_reason,
  };
}

async function probeChat({ spawnFn, projectRoot }) {
  const entry = resolvePath(projectRoot, 'dist/cli/entry.js');
  const child = spawnFn('node', [entry, 'chat', '--once'], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    if (child.stdin && typeof child.stdin.end === 'function') {
      child.stdin.write?.('merhaba\n');
      child.stdin.end();
    }
    const [stdout, stderr, exitCode] = await Promise.all([
      readStreamWithLimit(child.stdout),
      readStreamWithLimit(child.stderr),
      new Promise((resolveExit) => {
        if (!child.on) return resolveExit(null);
        child.on('exit', (code) => resolveExit(code));
        child.on('error', () => resolveExit(null));
      }),
    ]);
    const errored = (exitCode ?? 0) !== 0;
    const verdict = classifySurface({ surface: 'chat', stdout, errored, exitCode });
    const trimmed = stdout.trim().split('\n').slice(0, 3).join(' / ');
    return {
      surface: 'chat',
      real: verdict.real,
      evidence: `exit=${exitCode ?? 'n/a'} stdout_head="${trimmed}" stderr_len=${stderr.length}`,
      hollow_reason: verdict.hollow_reason,
    };
  } finally {
    try {
      child.kill?.('SIGTERM');
    } catch {
      /* noop */
    }
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Run the full audit. DI lets tests pass a mock spawn + fetch without booting
 * any real server.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot - repo root containing dist/cli/entry.js
 * @param {Function} [opts.spawnFn=spawn] - child_process.spawn compatible
 * @param {Function} [opts.fetchFn=fetch] - global fetch compatible
 * @param {boolean} [opts.distExists] - override dist presence check
 * @param {number} [opts.port=DEFAULT_PORT]
 * @returns {Promise<{results:object[], report:string, distSkipped:boolean}>}
 */
export async function runAudit({
  projectRoot,
  spawnFn = spawn,
  fetchFn = (typeof fetch === 'function' ? fetch : null),
  distExists,
  port,
} = {}) {
  const root = projectRoot ?? process.cwd();
  const distPath = resolvePath(root, 'dist/cli/entry.js');
  const present = typeof distExists === 'boolean' ? distExists : existsSync(distPath);

  if (!present) {
    const report = formatReport([], { distSkipped: true });
    return { results: [], report, distSkipped: true };
  }
  if (!fetchFn) {
    throw new Error('fetchFn is required when audit runs (no global fetch in this runtime)');
  }

  const actualPort = port ?? pickFreePort(DEFAULT_PORT);
  const serveResult = await probeServe({ spawnFn, fetchFn, projectRoot: root, port: actualPort });
  const dashboardResult = await probeDashboardFromServe(serveResult);
  const chatResult = await probeChat({ spawnFn, projectRoot: root });

  const results = [serveResult, dashboardResult, chatResult];
  const report = formatReport(results, { distSkipped: false });
  return { results, report, distSkipped: false };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function parsePort(argv) {
  const i = argv.indexOf('--port');
  if (i >= 0 && argv[i + 1]) {
    const n = Number(argv[i + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parsePort(process.argv.slice(2));
  runAudit({ port })
    .then(({ report, results, distSkipped }) => {
      process.stdout.write(report + '\n');
      if (distSkipped) {
        process.exit(0);
      }
      const hollowCount = results.filter((r) => !r.real).length;
      process.exit(hollowCount > 0 ? 1 : 0);
    })
    .catch((err) => {
      process.stderr.write(`audit failed: ${err?.message ?? err}\n`);
      process.exit(2);
    });
}
