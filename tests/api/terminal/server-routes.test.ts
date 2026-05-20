import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createHttpServer,
  type HttpApi,
} from '../../../src/api/server.js';
import type {
  SessionBackend,
  BackendHandle,
} from '../../../src/api/terminal/session-backend.js';

/**
 * Sprint 175 Task W2.2 — HTTP control + localhost bootstrap inject.
 *
 * Verifies:
 *  - POST /api/terminal/sessions creates (201) + GET lists + DELETE removes (200)
 *  - api.terminalToken is exposed for tests (no env var coupling)
 *  - terminal token is auto-generated even when API auth is disabled (spec §1c.2)
 *  - localhost-only index.html bootstrap script injection (127.0.0.1 / ::1)
 *
 * Test injects a fake SessionBackend so node-pty native binary is NOT required
 * (CI compatibility — session-backend's own integration test covers real PTY).
 */

// ─── fakeBackend: no real PTY, no native binding ────────────────────
function fakeBackend(): SessionBackend {
  const handle: BackendHandle = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
  return {
    spawn: (_spec, _onData, _onExit) => handle,
  };
}

let tmpRoot: string;
let api: HttpApi | undefined;

beforeEach(() => {
  // Clean DECKENT_* env so resolveAuthToken / DECKENT_API_AUTH_DISABLED
  // do not bleed across tests.
  delete process.env['DECKENT_API_TOKEN'];
  delete process.env['DECKENT_API_AUTH_DISABLED'];

  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-server-routes-'));
});

afterEach(async () => {
  if (api) {
    await api.close();
    api = undefined;
  }
  rmSync(tmpRoot, { recursive: true, force: true });
});

async function port(a: HttpApi): Promise<number> {
  if (!a.server.listening) {
    await new Promise<void>((resolve, reject) => {
      a.server.once('listening', () => resolve());
      a.server.once('error', reject);
    });
  }
  const addr = a.server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('server address unavailable');
  }
  return addr.port;
}

describe('terminal HTTP control routes', () => {
  it('POST /api/terminal/sessions → 201; GET lists; DELETE → 200', async () => {
    api = createHttpServer(tmpRoot, {
      port: 0,
      autoGenerateToken: true,
      terminalBackend: fakeBackend(),
    });
    expect(api.terminalToken).toBeDefined();
    expect(typeof api.terminalToken).toBe('string');
    expect(api.terminalToken!.length).toBeGreaterThan(8);

    const base = `http://127.0.0.1:${await port(api)}`;
    const tok = api.terminalToken!;
    const headers = { Authorization: `Bearer ${tok}` };

    // Create
    const createRes = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'shell' }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; kind: string };
    expect(created.id).toMatch(/[0-9a-f-]/i);
    expect(created.kind).toBe('shell');

    // List
    const listRes = await fetch(`${base}/api/terminal/sessions`, { headers });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.some((s) => s.id === created.id)).toBe(true);

    // Delete
    const delRes = await fetch(`${base}/api/terminal/sessions/${created.id}`, {
      method: 'DELETE',
      headers,
    });
    expect(delRes.status).toBe(200);

    // After delete, list no longer includes it
    const list2Res = await fetch(`${base}/api/terminal/sessions`, { headers });
    const list2 = (await list2Res.json()) as Array<{ id: string }>;
    expect(list2.some((s) => s.id === created.id)).toBe(false);
  });

  it('terminal token is generated even when API auth is disabled (spec §1c.2)', async () => {
    // Simulate read-only dashboard dev bypass — API auth disabled,
    // but terminal MUST still mint its own token.
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    api = createHttpServer(tmpRoot, {
      port: 0,
      // No autoGenerateToken → no API token; terminal must still mint one
      terminalBackend: fakeBackend(),
    });
    expect(api.terminalToken).toBeDefined();
    expect(api.terminalToken!.length).toBeGreaterThan(8);
  });

  it('disables terminal routes when cfg.terminal.enabled === false', async () => {
    // Write project config disabling terminal
    mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
    writeFileSync(
      join(tmpRoot, '.deckent', 'config.json'),
      JSON.stringify({ terminal: { enabled: false } }),
      'utf-8',
    );

    api = createHttpServer(tmpRoot, {
      port: 0,
      autoGenerateToken: true,
      terminalBackend: fakeBackend(),
    });
    expect(api.terminalToken).toBeUndefined();

    const base = `http://127.0.0.1:${await port(api)}`;
    const tok = (api as unknown as { _apiToken?: string })._apiToken;
    // Use a header that satisfies the bearer middleware via env var lookup,
    // or just expect 404 regardless of auth status by hitting a known-non-route.
    const res = await fetch(`${base}/api/terminal/sessions`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    });
    // Terminal disabled → routes are not registered → 401 (auth fail) or 404.
    expect([401, 403, 404]).toContain(res.status);
  });
});

describe('localhost-only bootstrap token injection', () => {
  function makeStaticDir(html: string): string {
    const staticDir = join(tmpRoot, 'static');
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(join(staticDir, 'index.html'), html, 'utf-8');
    return staticDir;
  }

  it('injects window.__DECKENT_TERMINAL_TOKEN__ into index.html for 127.0.0.1', async () => {
    const html = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';
    const staticDir = makeStaticDir(html);
    api = createHttpServer(tmpRoot, {
      port: 0,
      staticDir,
      autoGenerateToken: true,
      terminalBackend: fakeBackend(),
    });
    expect(api.terminalToken).toBeDefined();

    const res = await fetch(`http://127.0.0.1:${await port(api)}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    // Token injected before </head>
    expect(body).toContain('window.__DECKENT_TERMINAL_TOKEN__');
    expect(body).toContain(JSON.stringify(api.terminalToken));
    // Order: script comes BEFORE </head>, not after
    const tokenIdx = body.indexOf('__DECKENT_TERMINAL_TOKEN__');
    const headEndIdx = body.indexOf('</head>');
    expect(tokenIdx).toBeGreaterThan(-1);
    expect(headEndIdx).toBeGreaterThan(-1);
    expect(tokenIdx).toBeLessThan(headEndIdx);
  });

  it('does NOT inject when terminal is disabled', async () => {
    mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
    writeFileSync(
      join(tmpRoot, '.deckent', 'config.json'),
      JSON.stringify({ terminal: { enabled: false } }),
      'utf-8',
    );
    const html = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';
    const staticDir = makeStaticDir(html);
    api = createHttpServer(tmpRoot, {
      port: 0,
      staticDir,
      autoGenerateToken: true,
      terminalBackend: fakeBackend(),
    });

    const res = await fetch(`http://127.0.0.1:${await port(api)}/`);
    const body = await res.text();
    expect(body).not.toContain('__DECKENT_TERMINAL_TOKEN__');
  });
});
