import { describe, it, expect } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalAudit } from '../../../src/api/terminal/audit.js';
import type { AuditEvent } from '../../../src/api/terminal/types.js';
import { MemoryStore } from '../../../src/core/memory-store.js';

describe('TerminalAudit', () => {
  it('records a structured event and never stores raw output', () => {
    const recorded: Array<Record<string, unknown>> = [];
    const fakeStore = { insert: (e: Record<string, unknown>) => recorded.push(e) };
    const audit = new TerminalAudit(fakeStore);

    const ev: AuditEvent = {
      action: 'session.create',
      tenantId: 'local',
      sessionId: 's1',
      detail: 'kind=shell',
      at: new Date().toISOString(),
    };
    audit.record(ev);

    expect(recorded).toHaveLength(1);
    const e = recorded[0] as {
      type: string;
      tenant_id: string;
      content: string;
      title: string;
      decay_exempt: boolean;
    };
    expect(e.type).toBe('audit');
    expect(e.tenant_id).toBe('local');
    expect(e.title).toBe('terminal:session.create');
    expect(e.decay_exempt).toBe(true);
    // structured content carries action + detail, NOT raw bytes
    expect(e.content).toContain('session.create');
    expect(e.content).toContain('kind=shell');
    // security invariant: no ANSI / raw PTY bytes
    expect(e.content).not.toContain('\x1b[');
    expect(e.content).not.toContain('\x07');
  });

  it('serializes structured fields only — drops anything not in AuditEvent shape', () => {
    const recorded: Array<Record<string, unknown>> = [];
    const fakeStore = { insert: (e: Record<string, unknown>) => recorded.push(e) };
    const audit = new TerminalAudit(fakeStore);

    audit.record({
      action: 'session.kill',
      tenantId: 'local',
      sessionId: 'sess-42',
      detail: 'reason=idle-reaper',
      at: '2026-05-19T22:00:00.000Z',
    });

    const e = recorded[0] as { type: string; content: string };
    expect(e.type).toBe('audit');
    // content is JSON of {action, sessionId, detail, at} — no extra fields
    const parsed = JSON.parse(e.content) as Record<string, unknown>;
    expect(parsed['action']).toBe('session.kill');
    expect(parsed['sessionId']).toBe('sess-42');
    expect(parsed['detail']).toBe('reason=idle-reaper');
    expect(parsed['at']).toBe('2026-05-19T22:00:00.000Z');
    // not even the tenantId leaks into content — it's a column
    expect(Object.keys(parsed).sort()).toEqual(['action', 'at', 'detail', 'sessionId']);
  });

  it('handles events without optional fields', () => {
    const recorded: Array<Record<string, unknown>> = [];
    const fakeStore = { insert: (e: Record<string, unknown>) => recorded.push(e) };
    const audit = new TerminalAudit(fakeStore);

    audit.record({
      action: 'auth.deny',
      tenantId: 'local',
      at: '2026-05-19T22:00:00.000Z',
    });

    const e = recorded[0] as { type: string; tenant_id: string; title: string; content: string };
    expect(e.type).toBe('audit');
    expect(e.tenant_id).toBe('local');
    expect(e.title).toBe('terminal:auth.deny');
    const parsed = JSON.parse(e.content) as Record<string, unknown>;
    expect(parsed['action']).toBe('auth.deny');
    expect(parsed['sessionId']).toBeUndefined();
    expect(parsed['detail']).toBeUndefined();
  });

  // Regression for the integration bug behind task 175-007-xfix:
  // when TerminalAudit was wired to a *real* MemoryStore, `tenant_id` was
  // silently dropped because the CreateEntryInput type did not surface it
  // and the INSERT SQL omitted the column. This test exercises the round
  // trip through SQLite so the contract cannot regress.
  it('persists tenant_id round-trip through real MemoryStore', () => {
    const store = new MemoryStore(':memory:');
    try {
      const audit = new TerminalAudit({
        insert: (e: Record<string, unknown>) => {
          store.insert({
            id: `audit-${String(e['title']).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}`,
            type: 'audit',
            title: String(e['title']),
            content: String(e['content']),
            tenant_id: e['tenant_id'] as string | undefined,
            decay_exempt: e['decay_exempt'] === true,
          });
        },
      });

      audit.record({
        action: 'session.create',
        tenantId: 'tenant-alpha',
        sessionId: 'sess-1',
        detail: 'kind=shell',
        at: '2026-05-19T22:05:00.000Z',
      });
      audit.record({
        action: 'session.kill',
        tenantId: 'tenant-beta',
        sessionId: 'sess-2',
        detail: 'reason=user',
        at: '2026-05-19T22:06:00.000Z',
      });

      const rows = store.getByType('audit');
      expect(rows).toHaveLength(2);

      const alpha = rows.find(r => r.title === 'terminal:session.create');
      const beta = rows.find(r => r.title === 'terminal:session.kill');
      expect(alpha?.tenant_id).toBe('tenant-alpha');
      expect(beta?.tenant_id).toBe('tenant-beta');
      // structured content carries action + detail, never raw bytes
      expect(alpha?.content).toContain('kind=shell');
      expect(alpha?.content).not.toContain('\x1b[');
    } finally {
      store.close();
    }
  });

  // Regression: opening the same DB path twice must be idempotent. Without
  // the column-existence PRAGMA guard the second `new MemoryStore` would
  // throw `duplicate column name: tenant_id` from ALTER TABLE.
  //
  // We need TWO handles to the SAME DB, so `:memory:` (per-handle isolated)
  // is insufficient. Earlier revisions used a SQLite URI shared-cache trick
  // (`file:NAME?mode=memory&cache=shared`) which silently leaked ~100KB
  // phantom files to the repo root because `better-sqlite3` requires
  // `{ uri: true }` to honor URI syntax (option absent from MemoryStore
  // constructor + missing from @types/better-sqlite3, Sprint-175 audit).
  // Using a real temp file with explicit cleanup is the robust replacement.
  it('additive tenant_id migration is idempotent across reopens', () => {
    const tmpFile = join(tmpdir(), `deckent-audit-idem-${Date.now()}-${process.pid}.db`);
    const first = new MemoryStore(tmpFile);
    try {
      // Second open against the same on-disk DB MUST NOT throw.
      const reopen = new MemoryStore(tmpFile);
      try {
        reopen.insert({
          id: 'audit-second-open',
          type: 'audit',
          title: 'terminal:auth.ok',
          content: '{"action":"auth.ok"}',
          tenant_id: 'tenant-gamma',
        });
        const row = reopen.getById('audit-second-open');
        expect(row?.tenant_id).toBe('tenant-gamma');
      } finally {
        reopen.close();
      }
    } finally {
      first.close();
      // WAL mode → sidecar files (-wal, -shm); force=true tolerates missing.
      rmSync(tmpFile, { force: true });
      rmSync(`${tmpFile}-wal`, { force: true });
      rmSync(`${tmpFile}-shm`, { force: true });
    }
  });
});
