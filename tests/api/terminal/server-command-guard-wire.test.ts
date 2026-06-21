/**
 * Server-level command-guard host wiring (A8).
 *
 * The command guard (deny-list for remote `shell` sessions, invariant I3) only
 * fires when the session manager's host is non-localhost. createHttpServer built
 * the PtySessionManager WITHOUT passing the server's bind host, so host defaulted
 * to 'localhost' and the guard was exempt for EVERY session — even on a remote
 * bind. The session-manager unit tests pass a host directly, so they never
 * exercised this wiring (the bug lived only at the server construction site).
 *
 * This drives createHttpServer end-to-end via the test-exposed terminalManager:
 * on a remote bind (0.0.0.0) a denied command must be blocked; on a loopback bind
 * it passes through. Only passes when server.ts threads `host` into the manager.
 *
 * Hermetic: tmpdir projectRoot + injected fake backend; torn down per-test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, type HttpApi } from '../../../src/api/server.js';
import type { SessionBackend, BackendHandle } from '../../../src/api/terminal/session-backend.js';

function fakeBackend(): { be: SessionBackend; handle: BackendHandle } {
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  const be: SessionBackend = { spawn: () => handle };
  return { be, handle };
}

const DENIED = 'rm -rf /\n';

let api: HttpApi | undefined;
let projectRoot: string | undefined;

afterEach(async () => {
  if (api) { try { await api.close(); } catch { /* ignore */ } api = undefined; }
  if (projectRoot) { try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ } projectRoot = undefined; }
});

function boot(host: string, backend: SessionBackend): HttpApi {
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-cmdguard-'));
  return createHttpServer(projectRoot, { port: 0, host, terminalBackend: backend });
}

describe('server command-guard host wiring (A8)', () => {
  it('remote bind (0.0.0.0): a denied command is blocked (guard enforces)', () => {
    const fb = fakeBackend();
    api = boot('0.0.0.0', fb.be);
    const mgr = api.terminalManager;
    expect(mgr).toBeTruthy();

    const sess = mgr!.create({ kind: 'shell' });
    mgr!.write(sess.id, DENIED);

    // Guard fired → the command never reached the PTY and the session was killed.
    // Pre-fix (host not threaded → defaulted localhost) the guard was exempt and
    // the command passed straight through.
    expect(fb.handle.write).not.toHaveBeenCalled();
    expect(mgr!.get(sess.id)).toBeUndefined();
  });

  it('loopback bind (127.0.0.1): the same command passes through (owner-trusted)', () => {
    const fb = fakeBackend();
    api = boot('127.0.0.1', fb.be);
    const mgr = api.terminalManager;

    const sess = mgr!.create({ kind: 'shell' });
    mgr!.write(sess.id, DENIED);

    // Loopback is exempt by design (invariant I3) → command reaches the PTY.
    expect(fb.handle.write).toHaveBeenCalledWith(DENIED);
  });
});
