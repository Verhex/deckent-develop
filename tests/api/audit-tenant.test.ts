import { describe, it, expect } from 'vitest';
import { TerminalAudit, MemoryStoreAuditSink } from '../../src/api/terminal/audit.js';
import type { AuditEvent } from '../../src/api/terminal/types.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { verifyAuditChain } from '../../src/api/terminal/audit-integrity.js';

/**
 * Task 352-012 (AUDIT-TENANT, ADR-G-029 born row-59).
 *
 * `ws-gateway.ts`'s WS `auth.ok`/`auth.deny` events hardcode `tenantId: 'local'`
 * (out of this task's write scope — see .tasks/task-352-012.plan for the
 * disk-verified citation and the follow-up recommendation). What IS in scope
 * and fixable is `TerminalAudit.record()` — the single chokepoint every
 * terminal audit event flows through (HTTP routes in server.ts AND the WS
 * gateway both call the same `TerminalAudit` instance). This suite proves:
 *  - a real auth-context tenant (as the HTTP routes already resolve via
 *    `deriveRequestPrincipal`) is propagated verbatim and marked `resolved`.
 *  - the honest `'local'` fallback (used when no context is available, e.g.
 *    the WS auth events) is marked `fallback`, not silently indistinguishable
 *    from a resolved tenant.
 *  - the Sprint-350 HMAC integrity chain (MemoryStoreAuditSink) is unaffected.
 */

describe('AUDIT-TENANT — tenant provenance marking', () => {
  it('a real auth-context tenantId is persisted verbatim and marked resolved', () => {
    const recorded: Array<Record<string, unknown>> = [];
    const fakeStore = { insert: (e: Record<string, unknown>) => recorded.push(e) };
    const audit = new TerminalAudit(fakeStore);

    const ev: AuditEvent = {
      action: 'session.create',
      tenantId: 'tenant-acme', // e.g. resolved via deriveRequestPrincipal()
      sessionId: 's1',
      detail: 'kind=shell',
      at: '2026-07-01T00:00:00.000Z',
    };
    audit.record(ev);

    expect(recorded).toHaveLength(1);
    const e = recorded[0] as { tenant_id: string; tenant_source: string };
    expect(e.tenant_id).toBe('tenant-acme');
    expect(e.tenant_source).toBe('resolved');
  });

  it('the honest local fallback (no auth-context available) is marked fallback', () => {
    const recorded: Array<Record<string, unknown>> = [];
    const fakeStore = { insert: (e: Record<string, unknown>) => recorded.push(e) };
    const audit = new TerminalAudit(fakeStore);

    // Mirrors ws-gateway.ts's pre-session auth.ok/auth.deny hardcode — no
    // sessionId, no request principal available yet.
    audit.record({
      action: 'auth.ok',
      tenantId: 'local',
      detail: 'ws upgrade accepted',
      at: '2026-07-01T00:00:01.000Z',
    });

    const e = recorded[0] as { tenant_id: string; tenant_source: string };
    expect(e.tenant_id).toBe('local');
    expect(e.tenant_source).toBe('fallback');
  });

  it('existing content shape is untouched — tenant_source lives outside content', () => {
    const recorded: Array<Record<string, unknown>> = [];
    const fakeStore = { insert: (e: Record<string, unknown>) => recorded.push(e) };
    const audit = new TerminalAudit(fakeStore);

    audit.record({
      action: 'session.kill',
      tenantId: 'tenant-beta',
      sessionId: 'sess-1',
      detail: 'reason=user',
      at: '2026-07-01T00:00:02.000Z',
    });

    const e = recorded[0] as { content: string };
    const parsed = JSON.parse(e.content) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['action', 'at', 'detail', 'sessionId']);
    expect(parsed['tenantSource']).toBeUndefined();
  });

  it('round-trips tenant provenance through a real MemoryStore (legacy insert path)', () => {
    const store = new MemoryStore(':memory:');
    try {
      const sink = new MemoryStoreAuditSink(store);
      const audit = new TerminalAudit(sink); // no integrity config → legacy insert() path

      audit.record({
        action: 'auth.deny',
        tenantId: 'local',
        detail: 'ws upgrade rejected',
        at: '2026-07-01T00:00:03.000Z',
      });
      audit.record({
        action: 'session.create',
        tenantId: 'tenant-gamma',
        sessionId: 'sess-9',
        detail: 'kind=shell',
        at: '2026-07-01T00:00:04.000Z',
      });

      const rows = store.getByType('audit');
      const denied = rows.find((r) => r.title === 'terminal:auth.deny');
      const created = rows.find((r) => r.title === 'terminal:session.create');

      expect(denied?.tenant_id).toBe('local');
      expect(JSON.parse(denied?.metadata ?? '{}')).toEqual({ tenantSource: 'fallback' });

      expect(created?.tenant_id).toBe('tenant-gamma');
      expect(JSON.parse(created?.metadata ?? '{}')).toEqual({ tenantSource: 'resolved' });
    } finally {
      store.close();
    }
  });

  it('round-trips tenant provenance through the HMAC chain path and preserves chain integrity', () => {
    const store = new MemoryStore(':memory:');
    try {
      const sink = new MemoryStoreAuditSink(store);
      const secret = Buffer.alloc(32, 0x03);
      const audit = new TerminalAudit(sink, { secret });

      audit.record({
        action: 'auth.ok',
        tenantId: 'local',
        detail: 'ws upgrade accepted',
        at: '2026-07-01T00:00:05.000Z',
      });
      audit.record({
        action: 'session.create',
        tenantId: 'tenant-delta',
        sessionId: 'sess-10',
        detail: 'kind=shell',
        at: '2026-07-01T00:00:06.000Z',
      });

      const rows = store.getByType('audit');
      const authOk = rows.find((r) => r.title === 'terminal:auth.ok');
      const created = rows.find((r) => r.title === 'terminal:session.create');
      expect(JSON.parse(authOk?.metadata ?? '{}')).toEqual({ tenantSource: 'fallback' });
      expect(JSON.parse(created?.metadata ?? '{}')).toEqual({ tenantSource: 'resolved' });

      // Sprint-350 chain (350-inen MemoryStoreAuditSink zinciri) must still
      // verify — tenant_source is not part of the HMAC contentSignal.
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
