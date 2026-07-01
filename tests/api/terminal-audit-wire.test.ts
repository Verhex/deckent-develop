import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { SessionBackend, BackendHandle } from '../../src/api/terminal/session-backend.js';
import { MemoryStoreAuditSink, TerminalAudit } from '../../src/api/terminal/audit.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { loadOrCreateAuditKey, verifyAuditChain } from '../../src/api/terminal/audit-integrity.js';

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
