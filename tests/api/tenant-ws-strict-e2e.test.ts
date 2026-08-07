// ═══ TENANT-001 T4a — real-server proof: the WS shell honours strict mode ═══
//
// Tier-1 proof-of-function. Every other pin in this slice exercises a unit
// (the resolver, the gateway with injected deps). This one boots the PRODUCTION
// entry `createHttpServer` — the same function `deckent serve` calls — against a
// real project directory on disk, then opens a REAL WebSocket to the terminal
// path. Nothing here is mocked: the config is read from a real file, the flag is
// resolved by the real reader, and the refusal is observed as a real close code
// on a real socket.
//
// What it proves, which no unit could:
//   1. the flag actually travels config-file → createHttpServer → gateway
//      (the carry gap that made this whole bug class possible), and
//   2. the WS upgrade — which bypasses the HTTP request handler entirely — is
//      refused for a caller with no resolvable tenant.
//
// Note on scope: this runs the real server from source. The packaged-binary
// (`node dist/cli/entry.js serve`) confirmation is a separate, owner-authorised
// build step and is recorded as such in the settlement, not claimed here.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createHttpServer } from '../../src/api/server.js';
import { LocalPtyBackend } from '../../src/api/terminal/session-backend.js';

const APP_CLOSE_TENANT_SCOPE = 4403;

interface Booted {
  close: () => Promise<void>;
  port: number;
  terminalToken: string | undefined;
}

const live: { api?: { close: () => Promise<void> }; root?: string; home?: string | undefined } = {};

/** Boot the real server over a real project dir with the given flag value. */
async function boot(strict: boolean): Promise<Booted> {
  const root = mkdtempSync(join(tmpdir(), 't4a-e2e-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(
    join(root, '.deckent', 'config.json'),
    JSON.stringify({ strict_tenant_isolation: strict, terminal: { enabled: true } }),
  );
  live.root = root;
  // A real PTY backend, exactly as `deckent serve` wires it — without one the
  // terminal surface is not constructed at all and this proof would be vacuous.
  const api = createHttpServer(root, {
    port: 0,
    apiToken: 't4a-api-token',
    terminalBackend: new LocalPtyBackend(),
  });
  live.api = api;
  await new Promise<void>((resolve) => {
    if ((api.server.address() as { port: number } | null)?.port) return resolve();
    api.server.once('listening', () => resolve());
  });
  const address = api.server.address() as { port: number } | null;
  return {
    port: address?.port ?? 0,
    terminalToken: api.terminalToken,
    close: () => api.close(),
  };
}

/**
 * Open a WS to the terminal path and let it settle.
 *
 * The gateway completes the WebSocket handshake and THEN closes with an
 * application close code — exactly what the pre-existing 4401 auth-deny path
 * does. So a client legitimately sees `open` before a refusal, and the honest
 * question is not "did open fire" but "did the server close it, and with which
 * code". This helper reports both.
 */
async function upgrade(port: number, token: string): Promise<{ opened: boolean; closeCode: number | null }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, [`deckent.${token}`]);
  let opened = false;
  const settled = await new Promise<{ opened: boolean; closeCode: number | null }>((resolve) => {
    const timer = setTimeout(() => resolve({ opened, closeCode: null }), 750);
    ws.on('open', () => { opened = true; });
    ws.on('close', (code) => { clearTimeout(timer); resolve({ opened, closeCode: code }); });
    ws.on('error', () => { clearTimeout(timer); resolve({ opened, closeCode: -1 }); });
  });
  try {
    ws.close();
  } catch {
    // already closed by the server — nothing to do
  }
  return settled;
}

afterEach(async () => {
  if (live.api) {
    await live.api.close();
    live.api = undefined;
  }
  if (live.root) {
    rmSync(live.root, { recursive: true, force: true });
    live.root = undefined;
  }
});

describe('TENANT-001 T4a — real server, real WebSocket, strict tenant isolation', () => {
  it('strict ON: the terminal WS upgrade is refused with the tenant-scope close code', async () => {
    const s = await boot(true);
    expect(s.terminalToken, 'terminal must be enabled for this proof to mean anything').toBeTruthy();

    const outcome = await upgrade(s.port, s.terminalToken as string);
    // A VALID terminal token — the refusal is about tenant scope, not auth.
    // The server tore the socket down itself, with the tenant-scope code.
    expect(outcome.closeCode).toBe(APP_CLOSE_TENANT_SCOPE);
  }, 20_000);

  it('strict OFF: the same valid token opens the shell — v1 behaviour intact', async () => {
    const s = await boot(false);
    expect(s.terminalToken).toBeTruthy();

    const outcome = await upgrade(s.port, s.terminalToken as string);
    // Stays up: opened, and the server never closed it.
    expect(outcome.opened).toBe(true);
    expect(outcome.closeCode).toBeNull();
  }, 20_000);
});
