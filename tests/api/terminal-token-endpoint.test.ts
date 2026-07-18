// ═══ GET /api/terminal/token — Desktop terminal-token delivery (583/N3) ═════
//
// ADR-G-029 inv#2 SECOND bootstrap channel (amendment 2026-07-18): the
// Desktop renderer never loads the daemon's index.html, so the inv#2 inject
// can't reach it — instead it GETs the terminal token with its API bearer.
// The RCE law shapes every pin here:
//   inv#1 → the check is BYPASS-INDEPENDENT: DECKENT_API_AUTH_DISABLED=1
//           must NOT open this endpoint (fail-CLOSED, mirrors the
//           control-mutation ratchet-spec pattern of deleting/setting env).
//   inv#2 → loopback-only; the token never appears in a query string.
//   Cache-Control: no-store — a shell-opening secret must never be cached.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { SessionBackend, BackendHandle } from '../../src/api/terminal/session-backend.js';

function fakeBackend(): SessionBackend {
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  return { spawn: (_spec, _onData, _onExit) => handle };
}

let tmpRoot: string;
let api: HttpApi | undefined;

beforeEach(() => {
  delete process.env['DECKENT_API_TOKEN'];
  delete process.env['DECKENT_API_AUTH_DISABLED'];
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-term-token-ep-'));
});

afterEach(async () => {
  delete process.env['DECKENT_API_AUTH_DISABLED'];
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
  if (addr === null || typeof addr === 'string') throw new Error('server address unavailable');
  return addr.port;
}

describe('GET /api/terminal/token — loopback + API-bearer bootstrap (583/N3, ADR-G-029 inv#2b)', () => {
  it('valid API bearer → 200 { token } matching the minted terminal token, Cache-Control: no-store', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true, terminalBackend: fakeBackend() });
    const base = `http://127.0.0.1:${await port(api)}`;

    const res = await fetch(`${base}/api/terminal/token`, {
      headers: { Authorization: `Bearer ${api.apiToken!}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { token?: string };
    expect(body.token).toBe(api.terminalToken);
    // Sanity: the two tokens are genuinely different secrets — the endpoint
    // exchanges one for the other, it never echoes the caller's own bearer.
    expect(api.terminalToken).not.toBe(api.apiToken);
  });

  it('no bearer → 401; wrong bearer → 401 (the API token gate, constant-time path)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true, terminalBackend: fakeBackend() });
    const base = `http://127.0.0.1:${await port(api)}`;

    expect((await fetch(`${base}/api/terminal/token`)).status).toBe(401);
    const wrong = await fetch(`${base}/api/terminal/token`, {
      headers: { Authorization: 'Bearer not-the-api-token' },
    });
    expect(wrong.status).toBe(401);
  });

  it('the TERMINAL token itself does not unlock the endpoint (API bearer only — no cross-token confusion)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true, terminalBackend: fakeBackend() });
    const base = `http://127.0.0.1:${await port(api)}`;

    const res = await fetch(`${base}/api/terminal/token`, {
      headers: { Authorization: `Bearer ${api.terminalToken!}` },
    });
    expect(res.status).toBe(401);
  });

  it('DECKENT_API_AUTH_DISABLED=1 → STILL 401 without a valid bearer (inv#1: bypass-independent, fail-CLOSED)', async () => {
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    api = createHttpServer(tmpRoot, { port: 0, terminalBackend: fakeBackend() });
    const base = `http://127.0.0.1:${await port(api)}`;

    // The global bypass waves normal /api/* requests through — but this
    // endpoint hands out a shell-opening secret, so with no API token
    // configured it must answer 401 to EVERY caller. (fail-CLOSED)
    expect((await fetch(`${base}/api/terminal/token`)).status).toBe(401);
    const withGarbage = await fetch(`${base}/api/terminal/token`, {
      headers: { Authorization: 'Bearer anything' },
    });
    expect(withGarbage.status).toBe(401);
  });

  it('terminal disabled (no backend) → 404 with an honest error body', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true });
    const base = `http://127.0.0.1:${await port(api)}`;

    const res = await fetch(`${base}/api/terminal/token`, {
      headers: { Authorization: `Bearer ${api.apiToken!}` },
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error?: string }).error).toMatch(/terminal disabled/);
  });

  it('does not disturb the terminal-token-gated /api/terminal/sessions block (same prefix, different bearer)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true, terminalBackend: fakeBackend() });
    const base = `http://127.0.0.1:${await port(api)}`;

    // The sessions route still answers to the TERMINAL bearer…
    const sessions = await fetch(`${base}/api/terminal/sessions`, {
      headers: { Authorization: `Bearer ${api.terminalToken!}` },
    });
    expect(sessions.status).toBe(200);
    // …and still refuses the API bearer (the two gates stay disjoint).
    const crossed = await fetch(`${base}/api/terminal/sessions`, {
      headers: { Authorization: `Bearer ${api.apiToken!}` },
    });
    expect(crossed.status).toBe(401);
  });
});
