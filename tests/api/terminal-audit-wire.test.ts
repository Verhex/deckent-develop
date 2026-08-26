import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { SessionBackend, BackendHandle } from '../../src/api/terminal/session-backend.js';
import { MemoryStoreAuditSink, TerminalAudit } from '../../src/api/terminal/audit.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { loadOrCreateAuditKey, verifyAuditChain } from '../../src/api/terminal/audit-integrity.js';
import { WebSocket } from "ws";

/**
 * Task 348-004 (W0-11 AUDIT-WIRE, ADR-G-029 invariant #3 clause-2).
 *
 * `server.ts` used to wire `TerminalAudit` to a hardcoded no-op sink — every
 * terminal lifecycle event (session.create/kill, auth.deny) was silently
 * dropped and the HMAC integrity chain never ran in production. This suite
 * proves the real, MemoryStore-backed wiring: a real HTTP request through a
 * real `createHttpServer()` instance persists a real row into
 * `.brain/memory.db`, and (when integrity is enabled) that row is
 * HMAC-chain-linked and verifiable.
 *
 * Smoke: POST /api/terminal/sessions on a real createHttpServer() instance
 * → close() → reopen .brain/memory.db → an 'audit' row with
 * title 'terminal:session.create' exists AND verifyAuditChain() reports ok.
 */

function fakeBackend(): SessionBackend {
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  return { spawn: (_spec, _onData, _onExit) => handle };
}

let tmpRoot: string;
let api: HttpApi | undefined;

beforeEach(() => {
  delete process.env['DECKENT_API_TOKEN'];
  delete process.env['DECKENT_API_AUTH_DISABLED'];
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-audit-wire-'));
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

function writeProjectConfig(root: string, cfg: Record<string, unknown>): void {
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(cfg), 'utf-8');
}

describe('terminal audit — real MemoryStore wiring (AUDIT-WIRE)', () => {
  it('Smoke: POST /api/terminal/sessions on the real served path persists a chain-linked audit row', async () => {
    api = createHttpServer(tmpRoot, {
      port: 0,
      autoGenerateToken: true,
      terminalBackend: fakeBackend(),
    });
    const base = `http://127.0.0.1:${await port(api)}`;
    const headers = { Authorization: `Bearer ${api.terminalToken!}`, 'Content-Type': 'application/json' };

    const createRes = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'shell' }),
    });
    expect(createRes.status).toBe(201);

    // Real HTTP round-trip done — close the server (flushes/closes the real
    // MemoryStore handle) before re-opening a fresh handle on the same file.
    await api.close();
    api = undefined;

    const dbPath = join(tmpRoot, '.brain', 'memory.db');
    const store = new MemoryStore(dbPath);
    try {
      const rows = store.getByType('audit');
      const created = rows.find((r) => r.title === 'terminal:session.create');
      expect(created).toBeDefined();
      expect(created?.content).toContain('session.create');
      // no raw PTY bytes ever reach the audit row
      expect(created?.content).not.toContain('\x1b[');

      // HMAC chain: integrity is enabled by default (no config override) —
      // the row must be chain-linked and the chain must verify clean.
      expect(store.getLastAuditHmac()).not.toBeNull();
      const secret = loadOrCreateAuditKey(tmpRoot);
      const result = verifyAuditChain({
        store: store as unknown as { queryAuditChain: () => never[] },
        secret,
      });
      expect(result.ok).toBe(true);
      expect(result.rowsVerified).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it('persists events but skips the HMAC chain when terminal_audit_integrity.enabled=false', async () => {
    writeProjectConfig(tmpRoot, { terminal_audit_integrity: { enabled: false } });
    api = createHttpServer(tmpRoot, {
      port: 0,
      autoGenerateToken: true,
      terminalBackend: fakeBackend(),
    });
    const base = `http://127.0.0.1:${await port(api)}`;
    const headers = { Authorization: `Bearer ${api.terminalToken!}`, 'Content-Type': 'application/json' };

    const createRes = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'shell' }),
    });
    expect(createRes.status).toBe(201);

    await api.close();
    api = undefined;

    const dbPath = join(tmpRoot, '.brain', 'memory.db');
    const store = new MemoryStore(dbPath);
    try {
      const rows = store.getByType('audit');
      const created = rows.find((r) => r.title === 'terminal:session.create');
      // Persistence is unconditional — the row still lands...
      expect(created).toBeDefined();
      // ...but with integrity disabled, no chain link was ever computed.
      expect(store.getLastAuditHmac()).toBeNull();
    } finally {
      store.close();
    }
  });

  it('MemoryStoreAuditSink.insert() generates its own id — safe even without an integrity config', () => {
    const store = new MemoryStore(':memory:');
    try {
      const sink = new MemoryStoreAuditSink(store);
      const audit = new TerminalAudit(sink); // no integrity config → legacy insert() path
      expect(() => {
        audit.record({
          action: 'auth.deny',
          tenantId: 'local',
          detail: 'http GET /api/terminal/sessions',
          at: '2026-07-01T00:00:00.000Z',
        });
      }).not.toThrow();

      const rows = store.getByType('audit');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe('terminal:auth.deny');
      expect(rows[0]?.id).toMatch(/^audit-/);
    } finally {
      store.close();
    }
  });

  it('MemoryStoreAuditSink chain-links rows when TerminalAudit is given an integrity config', () => {
    const store = new MemoryStore(':memory:');
    try {
      const sink = new MemoryStoreAuditSink(store);
      const secret = Buffer.alloc(32, 0x02);
      const audit = new TerminalAudit(sink, { secret });

      audit.record({
        action: 'session.create',
        tenantId: 'tenant-a',
        sessionId: 'sess-1',
        detail: 'kind=shell',
        at: '2026-07-01T00:00:01.000Z',
      });
      audit.record({
        action: 'session.kill',
        tenantId: 'tenant-a',
        sessionId: 'sess-1',
        detail: 'reason=user',
        at: '2026-07-01T00:00:02.000Z',
      });

      expect(store.getLastAuditHmac()).not.toBeNull();
      const result = verifyAuditChain({
        store: store as unknown as { queryAuditChain: () => never[] },
        secret,
      });
      expect(result.ok).toBe(true);
      expect(result.rowsVerified).toBe(2);
    } finally {
      store.close();
    }
  });
});

// WIRE-006: physically merged from tests/api/terminal-config-wire.test.ts.
{
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
function capturingBackend(): {
    be: SessionBackend;
    emit: (data: string) => void;
} {
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
        const create = (): Promise<Response> => fetch(`${base}/api/terminal/sessions`, {
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
        const killFrame = await new Promise<{
            t: string;
            bytesUsed: number;
        }>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timed out waiting for outbound_kill')), 2000);
            ws.on('message', (raw) => {
                const parsed = JSON.parse(raw.toString()) as {
                    t: string;
                    bytesUsed?: number;
                };
                if (parsed.t === 'outbound_kill') {
                    clearTimeout(timer);
                    resolve(parsed as {
                        t: string;
                        bytesUsed: number;
                    });
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
}
