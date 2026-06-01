import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Dynamic-import the harness (.mjs sibling) — same pattern as other scripts/ tests.
import {
  assertSurfaces,
  bootServer,
  findFreePort,
  runE2E,
  DEFAULT_ENTRY,
  REPO_ROOT,
} from '../../scripts/test-e2e-surfaces.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/test-e2e-surfaces.mjs');
const PACKAGE_JSON = resolve(REPO_ROOT, 'package.json');

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Build a fake ChildProcess-like object that emits the serve "ready" line on
 * the next tick, tracks kill() calls, and exposes deterministic stdout/stderr.
 */
function makeFakeChild({ readyLine = 'Deckent API server listening on http://127.0.0.1:54321', emitReady = true, exitCode = null } = {}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child: any = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.killed = false;
  child.kill = (sig?: string) => { child.killed = true; child.lastSignal = sig; child.emit('exit', null, sig ?? null); return true; };
  if (emitReady) {
    setImmediate(() => stdout.emit('data', Buffer.from(readyLine + '\n')));
  } else if (exitCode !== null) {
    setImmediate(() => child.emit('exit', exitCode, null));
  }
  return child;
}

/**
 * Build a fake fetch that maps URL → { status, body }.
 */
function makeFakeFetch(mapping: Record<string, { status: number; body: string }>) {
  return async (url: string, _init?: unknown) => {
    const u = String(url);
    for (const [key, val] of Object.entries(mapping)) {
      if (u.endsWith(key)) {
        return {
          status: val.status,
          text: async () => val.body,
        };
      }
    }
    return { status: 404, text: async () => 'not found' };
  };
}

// ─── findFreePort ─────────────────────────────────────────────────────────────

describe('test-e2e-surfaces — findFreePort', () => {
  it('returns a positive integer port number', async () => {
    const port = await findFreePort();
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });
});

// ─── bootServer (mocked spawn) ────────────────────────────────────────────────

describe('test-e2e-surfaces — bootServer', () => {
  it('boot+ready: resolves baseUrl when child stdout emits the listening signal', async () => {
    let capturedArgs: string[] | null = null;
    const fakeSpawn = (_cmd: string, args: string[], _opts: unknown) => {
      capturedArgs = args;
      return makeFakeChild({ readyLine: 'Deckent API server listening on http://127.0.0.1:54321' });
    };
    const { child, baseUrlPromise } = bootServer({ spawnImpl: fakeSpawn as any, port: 54321, entry: '/fake/entry.js' });
    const url = await baseUrlPromise;
    expect(url).toBe('http://127.0.0.1:54321');
    expect(capturedArgs).toContain('serve');
    expect(capturedArgs).toContain('--port');
    expect(capturedArgs).toContain('--no-terminal');
    child.kill('SIGTERM');
  });

  it('port-collision / no-ready: rejects baseUrlPromise within timeout window', async () => {
    const fakeSpawn = () => makeFakeChild({ emitReady: false });
    const { child, baseUrlPromise } = bootServer({ spawnImpl: fakeSpawn as any, port: 0, entry: '/fake/entry.js', timeoutMs: 60 });
    await expect(baseUrlPromise).rejects.toThrow(/timeout/i);
    child.kill('SIGTERM');
  });

  it('premature exit: rejects when child exits before emitting ready', async () => {
    const fakeSpawn = () => makeFakeChild({ emitReady: false, exitCode: 1 });
    const { baseUrlPromise } = bootServer({ spawnImpl: fakeSpawn as any, port: 0, entry: '/fake/entry.js', timeoutMs: 500 });
    await expect(baseUrlPromise).rejects.toThrow(/exited prematurely/i);
  });
});

// ─── assertSurfaces ───────────────────────────────────────────────────────────

describe('test-e2e-surfaces — assertSurfaces', () => {
  it('pass: 200 + token placeholder + /api/status=200 → pass=true', async () => {
    const fetchImpl = makeFakeFetch({
      '/': { status: 200, body: '<html>window.__DECKENT_API_TOKEN__ = "abc123";</html>' },
      '/api/status': { status: 200, body: '{}' },
    });
    const result = await assertSurfaces('http://127.0.0.1:1234', { fetchImpl });
    expect(result.pass).toBe(true);
    expect(result.rootStatus).toBe(200);
    expect(result.hasTokenPlaceholder).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.token).toBe('abc123');
  });

  it('fail: /api/status=401 → pass=false (serve-401 regression detection)', async () => {
    const fetchImpl = makeFakeFetch({
      '/': { status: 200, body: '<html>window.__DECKENT_API_TOKEN__ = "tok";</html>' },
      '/api/status': { status: 401, body: 'unauthorized' },
    });
    const result = await assertSurfaces('http://127.0.0.1:1234', { fetchImpl });
    expect(result.pass).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.evidence).toContain('/api/status=200');
  });

  it('fail: token placeholder missing in HTML → pass=false', async () => {
    const fetchImpl = makeFakeFetch({
      '/': { status: 200, body: '<html>no token here</html>' },
      '/api/status': { status: 200, body: '{}' },
    });
    const result = await assertSurfaces('http://127.0.0.1:1234', { fetchImpl });
    expect(result.pass).toBe(false);
    expect(result.hasTokenPlaceholder).toBe(false);
    expect(result.evidence).toContain('__DECKENT_API_TOKEN__');
  });
});

// ─── runE2E (skip + kill-on-fail) ─────────────────────────────────────────────

describe('test-e2e-surfaces — runE2E', () => {
  it('dist-yok skip-guard: returns { skipped: true, reason } when entry path missing', async () => {
    const result = await runE2E({ entry: '/definitely/not/a/real/path/entry.js' });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/dist not built/i);
    expect(typeof result.durationMs).toBe('number');
  });

  it('kill-on-fail: when fetchImpl throws mid-assert, child.kill() is still invoked (try/finally)', async () => {
    // Use a real-ish entry path so skip-guard doesn't fire; we stub spawn.
    const stubEntry = SCRIPT_PATH; // exists, satisfies existsSync
    const killTracker = { killed: false, signal: null as string | null };
    const fakeSpawn = () => {
      const c = makeFakeChild({ readyLine: 'Deckent API server listening on http://127.0.0.1:9999' });
      const origKill = c.kill;
      c.kill = (sig?: string) => { killTracker.killed = true; killTracker.signal = sig ?? null; return origKill.call(c, sig); };
      return c;
    };
    const throwingFetch = async () => { throw new Error('mid-assert boom'); };

    const result = await runE2E({
      entry: stubEntry,
      spawnImpl: fakeSpawn as any,
      fetchImpl: throwingFetch as any,
      port: 9999,
      killSignal: 'SIGTERM',
    });
    expect(result.skipped).toBeUndefined();
    expect(result.pass).toBe(false);
    expect(result.evidence).toContain('boom');
    expect(killTracker.killed).toBe(true);
    expect(killTracker.signal).toBe('SIGTERM');
  });
});

// ─── Script artifact + npm wire ───────────────────────────────────────────────

describe('test-e2e-surfaces — artifact + wire', () => {
  it('script file exists and stays within reasonable size budget (≤300 LoC)', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    const lines = readFileSync(SCRIPT_PATH, 'utf-8').split('\n').length;
    expect(lines).toBeLessThanOrEqual(300);
  });

  it('script contains all required keywords (Kanit grep target)', () => {
    const text = readFileSync(SCRIPT_PATH, 'utf-8');
    // The directive: grep -c "entry.js|api/status|DECKENT_API_TOKEN|spawn|finally|kill" >= 3
    expect(text).toMatch(/entry\.js/);
    expect(text).toMatch(/api\/status/);
    expect(text).toMatch(/__DECKENT_API_TOKEN__/);
    expect(text).toMatch(/spawn/);
    expect(text).toMatch(/finally/);
    expect(text).toMatch(/\.kill\(/);
  });

  it('DEFAULT_ENTRY resolves to dist/cli/entry.js under REPO_ROOT', () => {
    expect(DEFAULT_ENTRY).toContain('dist/cli/entry.js');
    expect(DEFAULT_ENTRY.startsWith(REPO_ROOT)).toBe(true);
  });

  it('package.json registers `test:e2e-surfaces` script pointing at the harness', () => {
    expect(existsSync(PACKAGE_JSON)).toBe(true);
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
    expect(pkg.scripts?.['test:e2e-surfaces']).toBeDefined();
    expect(pkg.scripts['test:e2e-surfaces']).toContain('scripts/test-e2e-surfaces.mjs');
  });
});
