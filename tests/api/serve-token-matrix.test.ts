/**
 * Sprint 216 Task 216-009 — serve token-combination matrix.
 *
 * Tests `createHttpServer` across 4 combinations:
 *   1. terminal-on  + no token  → both terminalToken AND finalToken auto-minted
 *   2. terminal-off + no token  → only finalToken auto-minted (API mint)
 *   3. explicit token provided  → override, no auto-mint
 *   4. DECKENT_API_AUTH_DISABLED=1 → no mint at all
 *
 * Hermetic: port 0 (ephemeral), tmpdir fixtures, env restored in afterEach.
 * No spawnSync. Mock SessionBackend avoids real PTY.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { SessionBackend } from '../../src/api/terminal/session-backend.js';

const INDEX_HTML = '<html><head><title>test</title></head><body>SPA</body></html>';
const API_TOKEN_RE = /window\.__DECKENT_API_TOKEN__ = "([^"]+)";/;
const TERMINAL_TOKEN_RE = /window\.__DECKENT_TERMINAL_TOKEN__ = "([^"]+)";/;

const mockBackend: SessionBackend = {
  spawn: () => ({ write: () => {}, resize: () => {}, kill: () => {} }),
};

function makeStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-matrix-static-'));
  writeFileSync(join(dir, 'index.html'), INDEX_HTML, 'utf-8');
  return dir;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-matrix-proj-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

async function bootServer(opts: {
  apiToken?: string;
  staticDir: string;
  projectRoot: string;
  host?: string;
  terminalBackend?: SessionBackend;
}): Promise<{ api: HttpApi; baseUrl: string }> {
  const api = createHttpServer(opts.projectRoot, {
    port: 0,
    apiToken: opts.apiToken,
    staticDir: opts.staticDir,
    host: opts.host ?? '127.0.0.1',
    terminalBackend: opts.terminalBackend,
  });
  await new Promise<void>((resolve) =>
    api.server.once('listening', () => resolve()),
  );
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe('serve — token-combination matrix', () => {
  let staticDir: string | undefined;
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;

  const savedToken = process.env['DECKENT_API_TOKEN'];
  const savedDisabled = process.env['DECKENT_API_AUTH_DISABLED'];

  afterEach(async () => {
    if (api) {
      try { await api.close(); } catch { /* ignore */ }
      api = undefined;
    }
    if (staticDir) {
      try { rmSync(staticDir, { recursive: true, force: true }); } catch { /* ignore */ }
      staticDir = undefined;
    }
    if (projectRoot) {
      try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      projectRoot = undefined;
    }
    if (savedToken === undefined) {
      delete process.env['DECKENT_API_TOKEN'];
    } else {
      process.env['DECKENT_API_TOKEN'] = savedToken;
    }
    if (savedDisabled === undefined) {
      delete process.env['DECKENT_API_AUTH_DISABLED'];
    } else {
      process.env['DECKENT_API_AUTH_DISABLED'] = savedDisabled;
    }
  });

  // Case 1: terminal-on + no token → both terminalToken AND finalToken minted.
  // HTML must include window.__DECKENT_TERMINAL_TOKEN__ AND window.__DECKENT_API_TOKEN__.
  it('terminal-on + no-token: mints both terminalToken and API finalToken', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];

    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();

    const booted = await bootServer({
      staticDir,
      projectRoot,
      host: '127.0.0.1',
      terminalBackend: mockBackend,
    });
    api = booted.api;

    // terminalToken exposed on return value
    expect(api.terminalToken).toBeTruthy();

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // Both tokens injected into HTML
    expect(html).toMatch(TERMINAL_TOKEN_RE);
    expect(html).toMatch(API_TOKEN_RE);
    expect(html).toContain(api.terminalToken);
  });

  // Case 2: terminal-off + no token → only API finalToken auto-minted.
  // HTML must have __DECKENT_API_TOKEN__ but NO __DECKENT_TERMINAL_TOKEN__.
  it('terminal-off + no-token: mints only API finalToken (no terminalToken)', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];

    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();

    const booted = await bootServer({
      staticDir,
      projectRoot,
      host: '127.0.0.1',
      // no terminalBackend
    });
    api = booted.api;

    // No terminal token in return value
    expect(api.terminalToken).toBeUndefined();

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // API token injected, terminal token absent
    expect(html).toMatch(API_TOKEN_RE);
    expect(html).not.toMatch(TERMINAL_TOKEN_RE);

    // Token is a 64-char hex (randomBytes(32).toString('hex'))
    const match = html.match(API_TOKEN_RE);
    expect(match?.[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  // Case 3: explicit token provided → override, no auto-mint.
  // HTML carries exactly the explicit token value (not a 64-char hex).
  it('explicit-token: serves the given token verbatim, no auto-mint', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];

    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();

    const explicitToken = 'explicit-matrix-token-216-009';
    const booted = await bootServer({
      apiToken: explicitToken,
      staticDir,
      projectRoot,
      host: '127.0.0.1',
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain(`window.__DECKENT_API_TOKEN__ = "${explicitToken}"`);
    const match = html.match(API_TOKEN_RE);
    // The explicit token is short — must not be replaced by a 64-char hex mint.
    expect(match?.[1]).toBe(explicitToken);
  });

  // Case 4: DECKENT_API_AUTH_DISABLED=1 → auto-mint skipped.
  // HTML must NOT contain __DECKENT_API_TOKEN__ (auth is disabled, no token needed).
  it('auth-disabled: skips auto-mint — HTML carries no API token', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';

    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();

    const booted = await bootServer({
      staticDir,
      projectRoot,
      host: '127.0.0.1',
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).not.toMatch(API_TOKEN_RE);
    expect(html).not.toMatch(TERMINAL_TOKEN_RE);
    expect(html).toContain('<body>SPA</body>');
  });
});
