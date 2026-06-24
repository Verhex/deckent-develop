import { describe, expect, it, vi } from 'vitest';
import { CapabilityRegistry, type CapabilityHandler, type CapabilityResult } from '../../src/core/capability-broker.js';
import {
  createDbQueryHandler,
  createMailSearchHandler,
  dbQueryHandler,
  installDataHandlers,
  mailSearchHandler,
  type DbQueryImpl,
  type MailSearchImpl,
} from '../../src/core/capability-handlers-data.js';
import type { Capability } from '../../src/core/work-model.js';

function grant(capability: 'db-read' | 'mail-read'): Capability {
  return capability as Capability;
}

function expectOk(result: CapabilityResult): { value: unknown; handler: string } {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.error}`);
  return result;
}

async function invoke(handler: CapabilityHandler, args: Record<string, unknown>): Promise<unknown> {
  return handler.invoke(args, {});
}

describe('data capability handlers', () => {
  it('declares least-privilege requiredCapability values', () => {
    expect(dbQueryHandler.requiredCapability).toBe('db-read');
    expect(mailSearchHandler.requiredCapability).toBe('mail-read');
  });

  // Faithful regression (B-CAPNOTATION): requiredCapability is a `Capability`
  // grant-tag, whose canonical namespace is uniformly HYPHEN (`fs-read`,
  // `db-query`, `mcp-tool`...). The data handlers previously declared DOT tags
  // (`db.read` / `mail.read`) — inconsistent notation that never matches a
  // hyphen grant set. Notation must be hyphen-only (no `.`).
  it('uses hyphen notation for requiredCapability (no dot, matches Capability namespace)', () => {
    for (const handler of [dbQueryHandler, mailSearchHandler]) {
      // Pre-fix RED: 'db.read'/'mail.read' contain a '.'.
      expect(handler.requiredCapability).not.toContain('.');
      expect(handler.requiredCapability).toMatch(/^[a-z]+-[a-z]+$/);
    }
  });

  it('gates against the canonical hyphen grant tag (dot tag never matched)', async () => {
    const queryImpl = vi.fn<DbQueryImpl>(async () => ({ rows: [] }));
    const registry = new CapabilityRegistry();
    installDataHandlers(registry, { db: { queryImpl } });

    // Granting the canonical hyphen capability `db-read` ALLOWS the handler.
    // Pre-fix the handler required dot `db.read`, so this hyphen grant produced
    // CAPABILITY_DENIED (RED); post-fix it matches and the query runs (GREEN).
    const allowed = await registry.invoke(
      { capability: 'db.query', args: { sql: 'SELECT id FROM accounts' } },
      { grantedCapabilities: [grant('db-read')] },
    );
    expect(allowed.ok).toBe(true);
    expect(queryImpl).toHaveBeenCalledTimes(1);
  });

  it('installDataHandlers registers handlers without editing the broker', () => {
    const registry = new CapabilityRegistry();
    installDataHandlers(registry);
    expect(registry.list()).toEqual(['db.query', 'mail.search']);
  });

  it('keeps broker least-privilege gating active for installed handlers', async () => {
    const queryImpl = vi.fn<DbQueryImpl>(async () => ({ rows: [{ id: 1 }] }));
    const registry = new CapabilityRegistry();
    installDataHandlers(registry, { db: { queryImpl } });

    const denied = await registry.invoke(
      { capability: 'db.query', args: { sql: 'SELECT id FROM accounts' } },
      { grantedCapabilities: [grant('mail-read')] },
    );
    expect(denied.ok).toBe(false);
    expect(!denied.ok && denied.code).toBe('CAPABILITY_DENIED');
    expect(queryImpl).not.toHaveBeenCalled();

    const allowed = await registry.invoke(
      { capability: 'db.query', args: { sql: 'SELECT id FROM accounts' } },
      { grantedCapabilities: [grant('db-read')] },
    );
    expect(expectOk(allowed).value).toEqual({ rows: [{ id: 1 }] });
  });
});

describe('dbQueryHandler', () => {
  it('allows one SELECT statement and passes params through to injected queryImpl', async () => {
    const queryImpl = vi.fn<DbQueryImpl>((sql, params, ctx) => ({
      sql,
      params,
      tenantId: ctx.actor?.tenantId,
    }));
    const handler = createDbQueryHandler({ queryImpl });

    const value = await handler.invoke(
      { sql: '  SELECT id, name FROM accounts WHERE tenant_id = ?  ', params: ['tenant-1'] },
      { actor: { id: 'u1', tenantId: 'tenant-1' } },
    );

    expect(value).toEqual({
      sql: 'SELECT id, name FROM accounts WHERE tenant_id = ?',
      params: ['tenant-1'],
      tenantId: 'tenant-1',
    });
    expect(queryImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects write and admin SQL before queryImpl runs', async () => {
    const queryImpl = vi.fn<DbQueryImpl>();
    const handler = createDbQueryHandler({ queryImpl });

    for (const sql of [
      'INSERT INTO accounts(id) VALUES (1)',
      'UPDATE accounts SET name = ?',
      'DELETE FROM accounts WHERE id = 1',
      'DROP TABLE accounts',
    ]) {
      await expect(invoke(handler, { sql })).rejects.toThrow(/read-only/);
    }

    expect(queryImpl).not.toHaveBeenCalled();
  });

  it('rejects non-SELECT and semicolon multi-statement SQL', async () => {
    const queryImpl = vi.fn<DbQueryImpl>();
    const handler = createDbQueryHandler({ queryImpl });

    await expect(invoke(handler, { sql: 'WITH rows AS (SELECT 1) SELECT * FROM rows' })).rejects.toThrow(/SELECT/);
    await expect(invoke(handler, { sql: 'SELECT 1; SELECT 2' })).rejects.toThrow(/multi-statement/);
    await expect(invoke(handler, { sql: 'SELECT 1 -- hide write' })).rejects.toThrow(/comments/);
    expect(queryImpl).not.toHaveBeenCalled();
  });
});

describe('mailSearchHandler', () => {
  it('searches through injected searchImpl and maps normalized headers', async () => {
    const searchImpl = vi.fn<MailSearchImpl>(async () => [
      {
        id: 'local-1',
        headers: {
          Subject: 'Quarterly report',
          From: 'ops@example.test',
          To: ['a@example.test', 'b@example.test'],
          Date: '2026-06-09T00:00:00Z',
        },
      },
      {
        messageId: '<msg-2@example.test>',
        subject: 'Direct field wins',
        from: 'alerts@example.test',
        to: 'team@example.test',
        date: '2026-06-10T00:00:00Z',
      },
    ]);
    const handler = createMailSearchHandler({ searchImpl });

    const value = await handler.invoke({ query: 'from:ops', limit: 10 }, {});

    expect(value).toEqual([
      {
        id: 'local-1',
        subject: 'Quarterly report',
        from: 'ops@example.test',
        to: ['a@example.test', 'b@example.test'],
        date: '2026-06-09T00:00:00Z',
      },
      {
        id: '<msg-2@example.test>',
        subject: 'Direct field wins',
        from: 'alerts@example.test',
        to: ['team@example.test'],
        date: '2026-06-10T00:00:00Z',
      },
    ]);
    expect(searchImpl).toHaveBeenCalledWith({ query: 'from:ops', limit: 10 }, {});
  });

  it('validates query and limit before searchImpl runs', async () => {
    const searchImpl = vi.fn<MailSearchImpl>();
    const handler = createMailSearchHandler({ searchImpl });

    await expect(invoke(handler, {})).rejects.toThrow(/args.query/);
    await expect(invoke(handler, { query: 'subject:test', limit: 0 })).rejects.toThrow(/positive integer/);
    expect(searchImpl).not.toHaveBeenCalled();
  });
});
