/**
 * Sprint 415 Task 415-003 (SEC-03) — API/terminal token-redaction.
 *
 * KANIT (sol-sweep SEC-03 + CC grep-confirm): three `process.stderr.write`
 * call sites in src/api/server.ts used to interpolate the RAW bearer token
 * directly into a startup log line:
 *   - the `autoGenerateToken` branch ("Auto-generated API token: <raw>")
 *   - the localhost auto-mint branch ("Auto-minted localhost API token: <raw>")
 *   - the terminal-session-mint branch ("Terminal session token: <raw>")
 * Any process-log collector (CI, journald, a log-shipper) that captures
 * stderr verbatim would then store the live credential in plaintext. This
 * suite is the RED->GREEN regression guard: every raw-token regex below
 * (a v4 UUID and a 64-char hex string — the exact shapes `randomUUID()` and
 * `randomBytes(32).toString('hex')` produce) MUST NOT match anything in
 * captured stderr; against the pre-fix code every one of these assertions
 * would have failed, because the raw value was written verbatim.
 *
 * Existing-consumer regression: the localhost-dashboard HTML-injection path
 * (`window.__DECKENT_API_TOKEN__` / `__DECKENT_TERMINAL_TOKEN__`) and the
 * `api.apiToken` / `api.terminalToken` fields on the returned HttpApi object
 * are the ACTUAL token-read paths every other test/consumer uses (see
 * serve-token-matrix.test.ts, serve-daemon-meta.test.ts, terminal-*-wire.test.ts) —
 * none of them scrape stderr, so they are unaffected by this change and this
 * suite additionally re-asserts they still carry the real, working token.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { SessionBackend } from '../../src/api/terminal/session-backend.js';

const INDEX_HTML = '<html><head><title>test</title></head><body>SPA</body></html>';
const API_TOKEN_RE = /window\.__DECKENT_API_TOKEN__ = "([^"]+)";/;
const TERMINAL_TOKEN_RE = /window\.__DECKENT_TERMINAL_TOKEN__ = "([^"]+)";/;
const FINGERPRINT_RE = /tok:[0-9a-f]{12}/;
// Shapes of the two possible raw API-token values + the raw terminal token
// (always a v4 UUID) — matching either in stderr is the RED condition.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const HEX64_RE = /\b[0-9a-f]{64}\b/;

const mockBackend: SessionBackend = {
  spawn: () => ({ write: () => {}, resize: () => {}, kill: () => {} }),
};

function makeStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-tokredact-static-'));
  writeFileSync(join(dir, 'index.html'), INDEX_HTML, 'utf-8');
  return dir;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-tokredact-proj-'));
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
  autoGenerateToken?: boolean;
  terminalBackend?: SessionBackend;
}): Promise<{ api: HttpApi; baseUrl: string }> {
  const api = createHttpServer(opts.projectRoot, {
    port: 0,
    apiToken: opts.apiToken,
    staticDir: opts.staticDir,
    host: opts.host ?? '127.0.0.1',
    autoGenerateToken: opts.autoGenerateToken,
    terminalBackend: opts.terminalBackend,
  });
  await new Promise<void>((resolve) => api.server.once('listening', () => resolve()));
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe('SEC-03 — API/terminal token-redaction', () => {
  let staticDir: string | undefined;
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;
  let stderrSpy: ReturnType<typeof vi.spyOn> | undefined;

  const savedToken = process.env['DECKENT_API_TOKEN'];
  const savedDisabled = process.env['DECKENT_API_AUTH_DISABLED'];

  afterEach(async () => {
    stderrSpy?.mockRestore();
    stderrSpy = undefined;
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

  function stderrText(): string {
    return (stderrSpy?.mock.calls ?? []).map((c) => String(c[0])).join('');
  }

  // ─── 1. autoGenerateToken branch (was server.ts ~1651: randomUUID()) ─────
  it('autoGenerateToken: stderr carries no raw token, but a fingerprint + 0600 file with the active token', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const booted = await bootServer({ staticDir, projectRoot, autoGenerateToken: true });
    api = booted.api;

    const activeToken = api.apiToken;
    expect(activeToken).toBeTruthy();

    const logs = stderrText();
    // RED guard: the raw token string must never appear verbatim in stderr.
    expect(logs.includes(activeToken as string)).toBe(false);
    // RED guard: no UUID-shaped or 64-hex-shaped secret leaked anywhere in stderr.
    expect(UUID_RE.test(logs)).toBe(false);
    // GREEN: a fingerprint took its place.
    expect(logs).toMatch(FINGERPRINT_RE);

    const tokenPath = join(projectRoot, '.deckent', 'runtime', 'api-token');
    expect(logs).toContain(tokenPath);

    if (process.platform !== 'win32') {
      const mode = statSync(tokenPath).mode & 0o777;
      expect(mode).toBe(0o600);
    }
    const fileContent = readFileSync(tokenPath, 'utf-8').trim();
    expect(fileContent).toBe(activeToken);

    // The file-persisted token is the ACTUAL active token, not a decoy.
    const statusRes = await fetch(`${booted.baseUrl}/api/status`, {
      headers: { Authorization: `Bearer ${fileContent}` },
    });
    expect(statusRes.status).toBe(200);

    // Existing consumer (localhost dashboard HTML injection) unaffected.
    const indexRes = await fetch(`${booted.baseUrl}/`);
    const html = await indexRes.text();
    expect(html).toContain(`window.__DECKENT_API_TOKEN__ = "${activeToken}"`);
  });

  // ─── 2. localhost auto-mint branch (was server.ts ~1679: randomBytes(32)) ─
  it('localhost auto-mint: stderr carries no raw token, fingerprint + same api-token file, real auth works', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    // No apiToken, no autoGenerateToken — falls through to the loopback auto-mint branch.
    const booted = await bootServer({ staticDir, projectRoot });
    api = booted.api;

    const activeToken = api.apiToken;
    expect(activeToken).toMatch(/^[0-9a-f]{64}$/);

    const logs = stderrText();
    expect(logs.includes(activeToken as string)).toBe(false);
    expect(HEX64_RE.test(logs)).toBe(false);
    expect(logs).toMatch(FINGERPRINT_RE);

    const tokenPath = join(projectRoot, '.deckent', 'runtime', 'api-token');
    expect(logs).toContain(tokenPath);

    if (process.platform !== 'win32') {
      expect(statSync(tokenPath).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(tokenPath, 'utf-8').trim()).toBe(activeToken);

    const statusRes = await fetch(`${booted.baseUrl}/api/status`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    });
    expect(statusRes.status).toBe(200);
  });

  // ─── 3. terminal session-mint branch (was server.ts ~1963: randomUUID()) ──
  it('terminal token: stderr carries no raw token, separate terminal-token file, WS/HTML consumer unaffected', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const booted = await bootServer({ staticDir, projectRoot, terminalBackend: mockBackend });
    api = booted.api;

    const terminalToken = api.terminalToken;
    expect(terminalToken).toBeTruthy();

    const logs = stderrText();
    expect(logs.includes(terminalToken as string)).toBe(false);
    expect(logs).toMatch(FINGERPRINT_RE);

    const tokenPath = join(projectRoot, '.deckent', 'runtime', 'terminal-token');
    expect(logs).toContain(tokenPath);
    // Distinct file from the API token (SEC-03 requires two separate files).
    expect(tokenPath).not.toBe(join(projectRoot, '.deckent', 'runtime', 'api-token'));

    if (process.platform !== 'win32') {
      expect(statSync(tokenPath).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(tokenPath, 'utf-8').trim()).toBe(terminalToken);

    // Existing consumer (terminal HTML bootstrap injection) unaffected.
    const indexRes = await fetch(`${booted.baseUrl}/`);
    const html = await indexRes.text();
    expect(html).toContain(`window.__DECKENT_TERMINAL_TOKEN__ = "${terminalToken}"`);
    expect(html).toMatch(TERMINAL_TOKEN_RE);
    expect(html).toMatch(API_TOKEN_RE);
  });

  // ─── 4. i18n: both locales resolve real strings, not the raw i18n key ────
  it('i18n: serve.token.* keys resolve to real EN/TR text (not the raw key) via getMessage', async () => {
    const { getMessage } = await import('../../src/cli/helpers/messages.js');
    for (const key of [
      'serve.token.auto_generated',
      'serve.token.auto_minted',
      'serve.token.terminal_minted',
      'serve.token.persist_failed',
      'serve.token.posix_chmod_failed',
      'serve.token.win_acl_unavailable',
      'serve.token.win_acl_warn',
    ]) {
      const en = getMessage(key, 'en', { fingerprint: 'tok:abcdef123456', path: '/x', file: 'api-token', error: 'e', detail: 'd' });
      const tr = getMessage(key, 'tr', { fingerprint: 'tok:abcdef123456', path: '/x', file: 'api-token', error: 'e', detail: 'd' });
      expect(en).not.toBe(key);
      expect(tr).not.toBe(key);
      expect(en).not.toBe(tr);
    }
  });
});
