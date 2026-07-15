/**
 * worker-logs — Sprint 284 Task 284-003 (DASH-RT-2 backend).
 *
 * GET /api/workers/:taskId/logs/stream — backend-agnostic SSE tail of
 * `.tasks/task-<taskId>.log` (the docker backend writes this file; the
 * file-based path serves subprocess/tmux identically).
 *
 * Coverage axes (task DoD):
 *   - backfill        — existing log lines flow on connect
 *   - canlı-append    — a line appended AFTER connect streams within ~2s
 *   - dosya-yok       — a missing log file yields an HONEST `log_unavailable`
 *                       event (silent-empty is forbidden)
 *   - traversal-403   — a path-traversal / invalid taskId is rejected 403
 *                       BEFORE any fs access
 *   - auth pin        — the new `queryTokenPrefixes` gate authenticates the
 *                       dynamic worker-log path WITHOUT regressing the existing
 *                       exact `queryTokenPaths` whitelist
 *
 * Fully hermetic: pure unit tests for the route/format helpers; E2E tests boot
 * `createHttpServer` on a random loopback port over a tmpdir project (no spawn,
 * no network egress, no gitignored state); middleware-direct auth tests use
 * synthetic req/res.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  matchWorkerLogStream,
  isValidTaskId,
  formatWorkerLogFrame,
} from '../../src/api/worker-logs.js';
import { bearerAuthMiddleware } from '../../src/api/auth.js';
import { startTestServer, type TestServerHandle } from './test-server-helper.js';

const TOKEN = 'worker-logs-284003';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Connect to an SSE endpoint and accumulate the body until `until(body)` is
 * true (or the timeout aborts). A non-200 response (e.g. 403) is read as text
 * and returned immediately — the tail keeps the socket open otherwise, so a
 * plain `res.text()` would hang.
 */
async function collectSse(
  baseUrl: string,
  path: string,
  opts: { until: (body: string) => boolean; timeoutMs?: number },
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 2500);
  let body = '';
  let status = 0;
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    status = res.status;
    if (!res.body || status !== 200) {
      try {
        body = await res.text();
      } catch {
        /* aborted / empty */
      }
      return { status, body };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (opts.until(body)) break;
    }
  } catch {
    // abort on timeout — return what we collected
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return { status, body };
}

// ─── Pure route/format helpers ──────────────────────────────────

describe('worker-logs route helpers', () => {
  it('matchWorkerLogStream extracts the taskId segment', () => {
    expect(matchWorkerLogStream('/api/workers/284-001/logs/stream')).toBe('284-001');
    expect(matchWorkerLogStream('/api/workers/284-001/logs/stream?token=x')).toBe('284-001');
  });

  it('matchWorkerLogStream returns null for unrelated paths', () => {
    expect(matchWorkerLogStream('/api/workers')).toBeNull();
    expect(matchWorkerLogStream('/api/worker/284-001/log')).toBeNull();
    expect(matchWorkerLogStream('/api/events')).toBeNull();
    // a slash inside the segment cannot match (the route is single-segment)
    expect(matchWorkerLogStream('/api/workers/a/b/logs/stream')).toBeNull();
  });

  it('isValidTaskId allows the safe charset and rejects traversal', () => {
    expect(isValidTaskId('284-001')).toBe(true);
    expect(isValidTaskId('smoke_1')).toBe(true);
    expect(isValidTaskId('../../etc/passwd')).toBe(false);
    expect(isValidTaskId('a.b')).toBe(false);
    expect(isValidTaskId('a/b')).toBe(false);
    expect(isValidTaskId('')).toBe(false);
  });

  it('formatWorkerLogFrame emits a named SSE event field', () => {
    const frame = formatWorkerLogFrame({
      type: 'log_line',
      taskId: '284-001',
      line: 'satır-1',
      ts: '2026-06-12T00:00:00.000Z',
    });
    expect(frame).toMatch(/^event: log_line\n/);
    expect(frame.endsWith('\n\n')).toBe(true);
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))!;
    const parsed = JSON.parse(dataLine.slice('data: '.length)) as { line: string };
    expect(parsed.line).toBe('satır-1');
  });
});

// ─── Auth pin (middleware-direct) ───────────────────────────────
// EXACT mirror of the serve auth-gate config (src/api/server.ts) — the new
// `queryTokenPrefixes: ['/api/workers/']` grants query-token auth to the
// dynamic worker-log path; existing exact whitelist entries are unaffected.

const SERVE_EXEMPT_PATHS = ['/health', '/api/health', '/api/auth/oidc/exchange'];
const SERVE_QUERY_TOKEN_PATHS = ['/api/events', '/api/chat/stream'];
const SERVE_QUERY_TOKEN_PREFIXES = ['/api/workers/'];

function fakeReq(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { method: 'GET', url, headers, socket: {} } as unknown as IncomingMessage;
}

function runGate(
  url: string,
  headers: Record<string, string> = {},
): { allowed: boolean; status: number | null; body: string } {
  const cap = { status: null as number | null, body: '' };
  const res = {
    writeHead(code: number) {
      cap.status = code;
      return res;
    },
    end(chunk?: unknown) {
      if (typeof chunk === 'string') cap.body += chunk;
      return res;
    },
  } as unknown as ServerResponse;
  const mw = bearerAuthMiddleware({
    configToken: TOKEN,
    exemptPaths: SERVE_EXEMPT_PATHS,
    queryTokenPaths: SERVE_QUERY_TOKEN_PATHS,
    queryTokenPrefixes: SERVE_QUERY_TOKEN_PREFIXES,
  });
  const allowed = mw(fakeReq(url, headers), res);
  return { allowed, status: cap.status, body: cap.body };
}

describe('worker-logs auth-gate (queryTokenPrefixes)', () => {
  const ENV_KEYS = [
    'DECKENT_API_AUTH_DISABLED',
    'DECKENT_API_LOCALHOST_AUTO',
    'DECKENT_API_TOKEN',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('FIX: a valid ?token= authenticates the dynamic worker-log path', () => {
    const r = runGate(`/api/workers/284-001/logs/stream?token=${TOKEN}`);
    expect(r.allowed).toBe(true);
    expect(r.status).toBeNull();
  });

  it('control: /api/events?token= still authenticates (exact whitelist no regression)', () => {
    expect(runGate(`/api/events?token=${TOKEN}`).allowed).toBe(true);
  });

  it('behavior-preserving: /api/workers LIST (no trailing slash) is NOT query-token eligible → 401', () => {
    const r = runGate(`/api/workers?token=${TOKEN}`);
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(401);
  });

  it('no prefix bleed: an exact whitelist entry is not widened (/api/eventsX → 401)', () => {
    const r = runGate(`/api/eventsX?token=${TOKEN}`);
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(401);
  });

  it('wrong ?token= on the worker-log path → 403 and never leaks the token', () => {
    const r = runGate('/api/workers/284-001/logs/stream?token=not-the-token');
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body).not.toContain(TOKEN);
  });

  it('worker-log path WITH a valid Authorization header authenticates (header path intact)', () => {
    const r = runGate('/api/workers/284-001/logs/stream', { authorization: `Bearer ${TOKEN}` });
    expect(r.allowed).toBe(true);
  });
});

// ─── E2E (real server, header-less query-token transport) ───────

describe('worker-logs SSE (E2E real server)', () => {
  let handle: TestServerHandle | null = null;
  const ENV_KEYS = ['DECKENT_API_LOCALHOST_AUTO', 'DECKENT_API_AUTH_DISABLED'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k]; // no localhost-auto / bypass — the query-token gate is exercised
    }
    handle = await startTestServer({ apiToken: TOKEN });
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = null;
    }
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function logPath(taskId: string): string {
    return join(handle!.projectRoot, '.tasks', `task-${taskId}.log`);
  }

  it('backfills existing log lines on connect', async () => {
    writeFileSync(logPath('backfill-1'), 'satır-1\nsatır-2\n', 'utf-8');
    const { status, body } = await collectSse(
      handle!.baseUrl,
      `/api/workers/backfill-1/logs/stream?token=${TOKEN}`,
      { until: (b) => b.includes('satır-2') },
    );
    expect(status).toBe(200);
    expect(body).toContain('event: log_line');
    expect(body).toContain('satır-1');
    expect(body).toContain('satır-2');
  });

  it('streams a line appended AFTER connect (live tail ≤2s)', async () => {
    writeFileSync(logPath('live-1'), 'ilk-satır\n', 'utf-8');
    const p = collectSse(
      handle!.baseUrl,
      `/api/workers/live-1/logs/stream?token=${TOKEN}`,
      { until: (b) => b.includes('yeni-satır') },
    );
    await sleep(200); // let the connection + backfill + watcher settle
    appendFileSync(logPath('live-1'), 'yeni-satır\n', 'utf-8');
    const { status, body } = await p;
    expect(status).toBe(200);
    expect(body).toContain('ilk-satır');
    expect(body).toContain('yeni-satır');
  });

  it('emits an HONEST log_unavailable event when the log file is missing', async () => {
    const { status, body } = await collectSse(
      handle!.baseUrl,
      `/api/workers/no-log-1/logs/stream?token=${TOKEN}`,
      { until: (b) => b.includes('log_unavailable') },
    );
    expect(status).toBe(200);
    expect(body).toContain('event: log_unavailable');
    expect(body).toContain('no-log-1');
  });

  it('rejects a path-traversal taskId with 403 (before any fs access)', async () => {
    const evil = encodeURIComponent('../../etc/passwd'); // ..%2F..%2Fetc%2Fpasswd
    const { status } = await collectSse(
      handle!.baseUrl,
      `/api/workers/${evil}/logs/stream?token=${TOKEN}`,
      { until: () => true },
    );
    expect(status).toBe(403);
  });

  it('rejects an invalid taskId (dot) with 403', async () => {
    const { status } = await collectSse(
      handle!.baseUrl,
      `/api/workers/a.b/logs/stream?token=${TOKEN}`,
      { until: () => true },
    );
    expect(status).toBe(403);
  });

  it('rejects a wrong query-token with 403 (no silent stream, no token echo)', async () => {
    writeFileSync(logPath('secret-1'), 'should-not-appear\n', 'utf-8');
    const { status, body } = await collectSse(
      handle!.baseUrl,
      '/api/workers/secret-1/logs/stream?token=wrong-token',
      { until: () => true },
    );
    expect(status).toBe(403);
    expect(body).not.toContain('should-not-appear');
    expect(body).not.toContain(TOKEN);
  });
});
