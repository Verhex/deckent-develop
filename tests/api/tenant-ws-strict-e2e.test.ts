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
  /** Live session count — 'was a PTY ever wired?' rather than 'was it closed?'. */
  sessionCount: () => number;
}

interface LiveApi {
  close: () => Promise<void>;
  terminalManager?: { list(): Array<{ id: string }>; kill(id: string): void };
}
const live: { api?: LiveApi; root?: string } = {};

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
  live.api = api as unknown as LiveApi;
  await new Promise<void>((resolve) => {
    if ((api.server.address() as { port: number } | null)?.port) return resolve();
    api.server.once('listening', () => resolve());
  });
  const address = api.server.address() as { port: number } | null;
  return {
    port: address?.port ?? 0,
    terminalToken: api.terminalToken,
    sessionCount: () => api.terminalManager?.list().length ?? 0,
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
async function upgrade(
  port: number,
  token: string,
): Promise<{ opened: boolean; closeCode: number | null; framesSeen: number }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, [`deckent.${token}`]);
  let opened = false;
  let framesSeen = 0;
  const settled = await new Promise<{ opened: boolean; closeCode: number | null; framesSeen: number }>((resolve) => {
    const timer = setTimeout(() => resolve({ opened, closeCode: null, framesSeen }), 750);
    ws.on('open', () => {
      opened = true;
      // Push the gateway as hard as a real client would the instant it can:
      // ask for a session. If the refusal were too late, this is what would
      // slip through.
      try {
        ws.send(JSON.stringify({ t: 'create', kind: 'shell' }));
      } catch {
        // socket already gone — that is the expected strict-mode outcome
      }
    });
    ws.on('message', () => { framesSeen += 1; });
    ws.on('close', (code) => { clearTimeout(timer); resolve({ opened, closeCode: code, framesSeen }); });
    ws.on('error', () => { clearTimeout(timer); resolve({ opened, closeCode: -1, framesSeen }); });
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
    // The permissive case really does spawn a PTY (that is the point of it),
    // so tear the shells down explicitly — close() only reaps IDLE sessions
    // and a leaked shell would outlive the test run.
    for (const sess of live.api.terminalManager?.list() ?? []) {
      live.api.terminalManager?.kill(sess.id);
    }
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

    // The close code alone would still be satisfied by a socket that briefly
    // bridged and was then torn down. On a shell pipe "refused late" and
    // "never wired" are different security properties, so pin the stronger
    // one: no PTY session exists at all, and an attach attempt sent the
    // instant the handshake completed produced no output frame.
    expect(s.sessionCount()).toBe(0);
    expect(outcome.framesSeen).toBe(0);
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
