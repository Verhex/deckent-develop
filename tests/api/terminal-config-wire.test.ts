import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { SessionBackend, BackendHandle } from '../../src/api/terminal/session-backend.js';

/**
 * Task 357-009 (MASTER-PLAN Sıra-58, TERM-CONFIG-WIRE, ADR-G-029).
 *
 * `config.terminal.*` (maxSessions/idleTimeoutMs/scrollbackBytes/allowShellKind/
 * bind/outboundDailyQuotaBytes) used to be schema-only — server.ts hardcoded
 * every PtySessionManager default and never consulted the block at all. This
 * suite proves each field is now read from `.deckent/config.json` through a
 * real `createHttpServer()` instance, AND that omitting the block preserves
 * the exact pre-wire defaults (byte-identical, no config-absent regression).
 */

function fakeBackend(): SessionBackend {
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  return { spawn: (_spec, _onData, _onExit) => handle };
}

/** Captures the manager's per-session onData callback so a test can simulate PTY output. */
function capturingBackend(): { be: SessionBackend; emit: (data: string) => void } {
  let onDataCb: ((d: string) => void) | undefined;
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  const be: SessionBackend = {
    spawn: (_spec, onData) => {
      onDataCb = onData;
      return handle;
    },
  };
  return { be, emit: (data) => onDataCb?.(data) };
}

let tmpRoot: string;
let api: HttpApi | undefined;

beforeEach(() => {
  delete process.env['DECKENT_API_TOKEN'];
  delete process.env['DECKENT_API_AUTH_DISABLED'];
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-term-cfg-wire-'));
});

afterEach(async () => {
  if (api) {
    await api.close();
    api = undefined;
  }
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeProjectConfig(cfg: Record<string, unknown>): void {
  mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
  writeFileSync(join(tmpRoot, '.deckent', 'config.json'), JSON.stringify(cfg), 'utf-8');
}

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

describe('terminal config wiring (TERM-CONFIG-WIRE, 357-009)', () => {
  it('config absent: maxSessions default of 10 is preserved (byte-identical)', () => {
    api = createHttpServer(tmpRoot, { port: 0, terminalBackend: fakeBackend() });
    const mgr = api.terminalManager!;
    for (let i = 0; i < 10; i++) {
      expect(() => mgr.create({ kind: 'shell' })).not.toThrow();
    }
    expect(() => mgr.create({ kind: 'shell' })).toThrow(/max sessions reached/);
  });

  it('terminal.maxSessions=2: the 3rd POST /api/terminal/sessions is rejected (409)', async () => {
    writeProjectConfig({ terminal: { maxSessions: 2 } });
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true, terminalBackend: fakeBackend() });
    const base = `http://127.0.0.1:${await port(api)}`;
    const headers = { Authorization: `Bearer ${api.terminalToken!}`, 'Content-Type': 'application/json' };

    const create = (): Promise<Response> =>
      fetch(`${base}/api/terminal/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'shell' }),
      });

    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(409);
  });

  it('terminal.idleTimeoutMs is read from config: reapIdle() kills a session past the configured timeout', async () => {
    writeProjectConfig({ terminal: { idleTimeoutMs: 20 } });
    api = createHttpServer(tmpRoot, { port: 0, terminalBackend: fakeBackend() });
    const mgr = api.terminalManager!;
    const sess = mgr.create({ kind: 'shell' });

    await new Promise((r) => setTimeout(r, 60));
    mgr.reapIdle();

    expect(mgr.get(sess.id)).toBeUndefined();
  });

  it('terminal.allowShellKind=false: shell sessions are rejected (403), other kinds unaffected', async () => {
    writeProjectConfig({ terminal: { allowShellKind: false } });
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true, terminalBackend: fakeBackend() });
    const base = `http://127.0.0.1:${await port(api)}`;
    const headers = { Authorization: `Bearer ${api.terminalToken!}`, 'Content-Type': 'application/json' };

    const shellRes = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'shell' }),
    });
    expect(shellRes.status).toBe(403);

    const aiRes = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'ai', tool: 'claude' }),
    });
    expect(aiRes.status).toBe(201);
  });

  it('config absent: shell sessions are still allowed by default (byte-identical)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true, terminalBackend: fakeBackend() });
    const base = `http://127.0.0.1:${await port(api)}`;
    const headers = { Authorization: `Bearer ${api.terminalToken!}`, 'Content-Type': 'application/json' };
    const res = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'shell' }),
    });
    expect(res.status).toBe(201);
  });

  it('terminal.scrollbackBytes is read from config: the ring buffer truncates to the configured size', () => {
    writeProjectConfig({ terminal: { scrollbackBytes: 10 } });
    const cap = capturingBackend();
    api = createHttpServer(tmpRoot, { port: 0, terminalBackend: cap.be });
    const mgr = api.terminalManager!;
    const sess = mgr.create({ kind: 'shell' });

    cap.emit('0123456789ABCDEFGHIJ'); // 20 chars > configured 10-byte scrollback

    const replay = mgr.replay(sess.id);
    expect(replay.length).toBe(10);
    expect(replay).toBe('ABCDEFGHIJ');
  });

  it('terminal.bind fallback flows into the actual server bind (no separate declared-vs-actual bind)', async () => {
    writeProjectConfig({ terminal: { bind: '0.0.0.0' } });
    api = createHttpServer(tmpRoot, { port: 0, terminalBackend: fakeBackend() });
    await port(api); // ensure listening
    const addr = api.server.address();
    expect(addr && typeof addr === 'object' ? addr.address : undefined).toBe('0.0.0.0');
  });

  it('an explicit host always wins over terminal.bind config (no API-contract change)', async () => {
    writeProjectConfig({ terminal: { bind: '0.0.0.0' } });
    api = createHttpServer(tmpRoot, { port: 0, host: '127.0.0.1', terminalBackend: fakeBackend() });
    await port(api);
    const addr = api.server.address();
    expect(addr && typeof addr === 'object' ? addr.address : undefined).toBe('127.0.0.1');
  });

  it('config absent: server still binds to 127.0.0.1 by default (byte-identical)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, terminalBackend: fakeBackend() });
    await port(api);
    const addr = api.server.address();
    expect(addr && typeof addr === 'object' ? addr.address : undefined).toBe('127.0.0.1');
  });

  it('terminal.outboundDailyQuotaBytes is read from config: exceeding it closes the WS with outbound_kill', async () => {
    writeProjectConfig({ terminal: { outboundDailyQuotaBytes: 100 } });
    const cap = capturingBackend();
    api = createHttpServer(tmpRoot, { port: 0, terminalBackend: cap.be });
    const mgr = api.terminalManager!;
    const sess = mgr.create({ kind: 'shell' });

    const p = await port(api);
    const ws = new WebSocket(`ws://127.0.0.1:${p}/api/terminal/ws`, [`deckent.${api.terminalToken!}`]);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ t: 'attach', sessionId: sess.id }));
    // give the gateway a tick to process the attach message before feeding data
    await new Promise((r) => setTimeout(r, 20));

    const killFrame = await new Promise<{ t: string; bytesUsed: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for outbound_kill')), 2000);
      ws.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as { t: string; bytesUsed?: number };
        if (parsed.t === 'outbound_kill') {
          clearTimeout(timer);
          resolve(parsed as { t: string; bytesUsed: number });
        }
      });
      cap.emit('X'.repeat(200)); // 200 bytes > configured 100-byte quota
    });

    expect(killFrame.t).toBe('outbound_kill');
    // The gateway already initiated the close (APP_CLOSE_OUTBOUND_QUOTA) as
    // part of the kill path. Await the client-side close AND a short grace
    // delay so the server-side `session.detach` audit write (bridge's own ws
    // 'close' handler, which fires independently of the client's) completes
    // BEFORE afterEach() closes the audit MemoryStore — avoids a
    // use-after-close race on the sqlite handle.
    await new Promise<void>((resolve) => ws.once('close', () => resolve()));
    await new Promise((r) => setTimeout(r, 50));
  });
});
