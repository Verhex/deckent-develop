import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeAuditHmac,
  loadOrCreateAuditKey,
  verifyAuditChain,
  AUDIT_KEY_FILENAME,
  type AuditChainRow,
} from '../../../src/api/terminal/audit-integrity.js';

describe('audit-integrity (I4 invariant)', () => {
  const secret = Buffer.alloc(32, 0x01);

  it('(a) computeAuditHmac is deterministic', () => {
    const input = {
      prevHmac: null,
      timestamp: '2026-05-21T00:00:00.000Z',
      tenantId: 'local',
      action: 'session.create',
      contentSignal: '{"a":1}',
    };
    const h1 = computeAuditHmac(secret, input);
    const h2 = computeAuditHmac(secret, input);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('(b) chain link integrity: changing prevHmac changes digest', () => {
    const base = {
      timestamp: '2026-05-21T00:00:00.000Z',
      tenantId: 'local',
      action: 'session.create',
      contentSignal: '{"a":1}',
    };
    const h1 = computeAuditHmac(secret, { ...base, prevHmac: null });
    const h2 = computeAuditHmac(secret, { ...base, prevHmac: 'aa'.repeat(32) });
    expect(h1).not.toBe(h2);
  });

  it('(c) verifyAuditChain returns ok on clean chain', () => {
    const rows: AuditChainRow[] = [];
    let prev: string | null = null;
    for (let i = 1; i <= 3; i++) {
      const content = JSON.stringify({ action: 'session.create', at: `2026-05-21T00:00:0${i}.000Z` });
      const hmac = computeAuditHmac(secret, {
        prevHmac: prev,
        timestamp: `2026-05-21T00:00:0${i}.000Z`,
        tenantId: 'local',
        action: 'session.create',
        contentSignal: content,
      });
      rows.push({
        id: i,
        content,
        tenant_id: 'local',
        audit_hmac: hmac,
        audit_prev_hmac: prev,
        created_at: `2026-05-21T00:00:0${i}.000Z`,
      });
      prev = hmac;
    }
    const result = verifyAuditChain({ store: { queryAuditChain: () => rows }, secret });
    expect(result.ok).toBe(true);
    expect(result.rowsVerified).toBe(3);
    expect(result.firstTamperedRowId).toBeNull();
  });

  it('(d) verifyAuditChain detects UPDATE tamper', () => {
    const content1 = JSON.stringify({ action: 'session.create', at: '2026-05-21T00:00:01.000Z' });
    const hmac1 = computeAuditHmac(secret, {
      prevHmac: null,
      timestamp: '2026-05-21T00:00:01.000Z',
      tenantId: 'local',
      action: 'session.create',
      contentSignal: content1,
    });
    const tamperedContent = JSON.stringify({ action: 'session.create', at: '2026-05-21T00:00:01.000Z', evil: true });
    const rows: AuditChainRow[] = [{
      id: 1,
      content: tamperedContent,
      tenant_id: 'local',
      audit_hmac: hmac1,
      audit_prev_hmac: null,
      created_at: '2026-05-21T00:00:01.000Z',
    }];
    const result = verifyAuditChain({ store: { queryAuditChain: () => rows }, secret });
    expect(result.ok).toBe(false);
    expect(result.firstTamperedRowId).toBe(1);
  });

  it('(e) loadOrCreateAuditKey generates 32-byte hex key on first call', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'audit-key-'));
    try {
      const k1 = loadOrCreateAuditKey(tmp);
      expect(k1.length).toBe(32);
      const keyPath = join(tmp, '.deckent', AUDIT_KEY_FILENAME);
      expect(existsSync(keyPath)).toBe(true);
      const hex = readFileSync(keyPath, 'utf-8').trim();
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
      const k2 = loadOrCreateAuditKey(tmp);
      expect(k2.equals(k1)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
