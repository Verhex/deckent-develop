#!/usr/bin/env node
// rt-latency-verify.mjs — DASH-RT-1 "≤1-2sn" latency proof-chain (Sprint 284)
//
// Boots the REAL `dist/cli/entry.js serve` binary in a hermetic tmpdir project,
// then measures two latency paths:
//   1. hb-write  → worker_heartbeat SSE event  on /api/events
//   2. log-append → log_line SSE event          on /api/workers/:id/logs/stream
//
// Both must arrive within LATENCY_LIMIT_MS (2000ms) to PASS.
//
// Hermetic: cwd + HOME are tmpdir sandboxes; teardown is in try/finally.
// Skip-guard: exits 2 when dist/cli/entry.js is absent (fresh-checkout pass).
//
// Usage:
//   npm run verify:rt-latency           # run-proven real-binary check
//   node scripts/rt-latency-verify.mjs  # same

import { spawn as nodeSpawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const DEFAULT_ENTRY = resolve(REPO_ROOT, 'dist/cli/entry.js');

const LATENCY_LIMIT_MS = 2000;
const BOOT_TIMEOUT_MS = 20_000;
const READY_SIGNAL = /Deckent (?:is ready|API server listening on) [—-]+ (http:\/\/[^\s\n]+)/;
// Use a fixed token so auth works without needing the dashboard HTML built.
const TEST_TOKEN = 'rt-latency-test-token-84284';

// ─── Free port ───────────────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      srv.close((err) => (err ? rej(err) : port ? res(port) : rej(new Error('no port'))));
    });
  });
}

// ─── Boot server ─────────────────────────────────────────────────────────────

function bootServer(entry, port, cwd, sandboxHome) {
  const env = { ...process.env, HOME: sandboxHome, DECKENT_API_TOKEN: TEST_TOKEN };
  delete env.ANTHROPIC_API_KEY;
  const args = ['--enable-source-maps', entry, 'serve', '--port', String(port), '--no-terminal'];
  const child = nodeSpawn('node', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

  const baseUrlPromise = new Promise((res, rej) => {
    let resolved = false;
    let buf = '';
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      rej(new Error(`bootServer timeout after ${BOOT_TIMEOUT_MS}ms; buf=${buf.slice(0, 300)}`));
    }, BOOT_TIMEOUT_MS);

    const onData = (chunk) => {
      buf += String(chunk);
      const m = buf.match(READY_SIGNAL);
      if (m && !resolved) {
        resolved = true;
        clearTimeout(timer);
        res(m[1].replace(/0\.0\.0\.0/, '127.0.0.1'));
      }
    };
    if (child.stdout) child.stdout.on('data', onData);
    if (child.stderr) child.stderr.on('data', onData);
    child.once('error', (err) => { if (!resolved) { resolved = true; clearTimeout(timer); rej(err); } });
    child.once('exit', (code, sig) => {
      if (!resolved) { resolved = true; clearTimeout(timer); rej(new Error(`child exited code=${code} sig=${sig} buf=${buf.slice(0, 300)}`)); }
    });
  });

  return { child, baseUrlPromise };
}

// ─── API health check ─────────────────────────────────────────────────────────

async function verifyApiStatus(baseUrl) {
  const res = await fetch(`${baseUrl}/api/status`, {
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  return res.status === 200;
}

// ─── SSE listener (Node http) ─────────────────────────────────────────────────

/**
 * Open an SSE connection and resolve when we receive a frame whose `event:` field
 * matches `eventName`. Returns the parsed data object and the elapsed ms since t0.
 * Rejects if the wait exceeds timeoutMs.
 */
function waitForSseEvent(url, eventName, timeoutMs) {
  return new Promise((res, rej) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: Number(parsed.port),
      path: parsed.pathname + parsed.search,
      headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
    };
    const t0 = Date.now();
    const req = http.get(options, (response) => {
      let buf = '';
      let currentEvent = null;

      const timer = setTimeout(() => {
        req.destroy();
        rej(new Error(`timeout waiting for SSE event "${eventName}" after ${timeoutMs}ms`));
      }, timeoutMs);

      response.on('data', (chunk) => {
        buf += String(chunk);
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trimEnd();
          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice('event:'.length).trim();
          } else if (trimmed.startsWith('data:')) {
            if (currentEvent === eventName) {
              clearTimeout(timer);
              req.destroy();
              res({ elapsed: Date.now() - t0 });
              return;
            }
            currentEvent = null;
          } else if (trimmed === '') {
            currentEvent = null;
          }
        }
      });

      response.once('end', () => {
        clearTimeout(timer);
        rej(new Error(`SSE stream ended before receiving "${eventName}"`));
      });
      response.once('error', (err) => {
        clearTimeout(timer);
        rej(err);
      });
    });

    req.once('error', (err) => {
      // req.destroy() emits an error with code ECONNRESET — suppress it on our side
      if (err.code === 'ECONNRESET') return;
      rej(err);
    });
  });
}

// ─── HB latency test ─────────────────────────────────────────────────────────

async function measureHbLatency(baseUrl, token, tasksDir) {
  // Pre-create .tasks/ so the live-events bridge can attach a watcher immediately
  // when the SSE client connects (skips the 1s retry for a missing dir).
  mkdirSync(tasksDir, { recursive: true });

  const sseUrl = `${baseUrl}/api/events?token=${encodeURIComponent(token)}`;

  // Start listening BEFORE writing the file so we don't miss the event.
  const listenPromise = waitForSseEvent(sseUrl, 'worker_heartbeat', LATENCY_LIMIT_MS + 1500);

  // Give the SSE connection + bridge watcher setup time to establish.
  await new Promise((r) => setTimeout(r, 200));

  const t0 = Date.now();
  writeFileSync(
    join(tasksDir, 'test-rt-smoke.hb'),
    JSON.stringify({ workerId: 'w-rt-smoke', taskId: 'rt-smoke', status: 'EXECUTING', currentAction: 'latency-test', sequence: 1, timestamp: new Date().toISOString() }),
  );

  const { elapsed } = await listenPromise;
  // elapsed includes the 200ms pre-write delay — subtract for the true write→event latency.
  const hbMs = elapsed - 200;
  return hbMs < 0 ? elapsed : hbMs;
}

// ─── Worker-log latency test ──────────────────────────────────────────────────

async function measureLogLatency(baseUrl, token, tasksDir) {
  const taskId = 'rt-smoke-log';
  const logFile = join(tasksDir, `task-${taskId}.log`);
  // .tasks/ already exists from measureHbLatency.
  const sseUrl = `${baseUrl}/api/workers/${taskId}/logs/stream?token=${encodeURIComponent(token)}`;

  // Start listening BEFORE appending — we may receive log_unavailable first, then log_line.
  const listenPromise = waitForSseEvent(sseUrl, 'log_line', LATENCY_LIMIT_MS + 1500);

  // Wait for SSE + watcher setup to stabilize.
  await new Promise((r) => setTimeout(r, 200));

  const t0 = Date.now();
  appendFileSync(logFile, 'rt-latency-probe-line\n');

  const { elapsed } = await listenPromise;
  const logMs = elapsed - 200;
  return logMs < 0 ? elapsed : logMs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  if (!existsSync(DEFAULT_ENTRY)) {
    process.stderr.write(`SKIP: dist not built — ${DEFAULT_ENTRY} missing. Run \`npm run build\` first.\n`);
    process.exit(2);
  }

  const sandboxCwd = mkdtempSync(join(tmpdir(), 'deckent-rt-latency-cwd-'));
  const sandboxHome = mkdtempSync(join(tmpdir(), 'deckent-rt-latency-home-'));
  const tasksDir = join(sandboxCwd, '.tasks');
  const port = await findFreePort();
  const { child, baseUrlPromise } = bootServer(DEFAULT_ENTRY, port, sandboxCwd, sandboxHome);

  let hbMs = null;
  let logMs = null;
  let failed = false;
  let failReason = '';

  try {
    const baseUrl = await baseUrlPromise;
    const apiOk = await verifyApiStatus(baseUrl);
    if (!apiOk) throw new Error('GET /api/status did not return 200 — auth setup failed');

    hbMs = await measureHbLatency(baseUrl, TEST_TOKEN, tasksDir);
    if (hbMs > LATENCY_LIMIT_MS) {
      failed = true;
      failReason = `hb latency ${hbMs}ms exceeds ${LATENCY_LIMIT_MS}ms limit`;
    }

    logMs = await measureLogLatency(baseUrl, TEST_TOKEN, tasksDir);
    if (logMs > LATENCY_LIMIT_MS) {
      failed = true;
      failReason += (failReason ? '; ' : '') + `log latency ${logMs}ms exceeds ${LATENCY_LIMIT_MS}ms limit`;
    }
  } catch (err) {
    failed = true;
    failReason = err instanceof Error ? err.message : String(err);
  } finally {
    try { if (child && !child.killed) child.kill('SIGTERM'); } catch { /* best-effort */ }
    try { rmSync(sandboxCwd, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(sandboxHome, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  if (failed) {
    process.stderr.write(`FAIL: ${failReason}\n`);
    process.exit(1);
  }

  process.stdout.write(`PASS (hb: ${hbMs}ms, log: ${logMs}ms)\n`);
  process.exit(0);
}

run().catch((err) => {
  process.stderr.write(`FAIL: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
