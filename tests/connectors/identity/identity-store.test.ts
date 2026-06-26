// tests/connectors/identity/identity-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore } from '../../../src/connectors/identity/identity-store.js';
import type { IdentityRecord } from '../../../src/connectors/identity/provider.js';

let dir: string;
let store: IdentityStore;
const rec: IdentityRecord = {
  connector: 'telegram', externalId: '55', principalId: 'ali',
  role: 'operator', tenantId: 'firmax', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z',
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deckent-id-'));
  store = new IdentityStore(join(dir, 'identity.db'));
});
afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });

describe('IdentityStore', () => {
  it('upserts and reads back an identity', () => {
    store.upsertIdentity(rec);
    expect(store.getIdentity('telegram', '55', 'firmax')).toEqual(rec);
  });
  it('returns null for a different tenant (tenant isolation)', () => {
    store.upsertIdentity(rec);
    expect(store.getIdentity('telegram', '55', 'firmay')).toBeNull();
  });
  it('upsert overwrites (idempotent on PK)', () => {
    store.upsertIdentity(rec);
    store.upsertIdentity({ ...rec, role: 'viewer' });
    expect(store.getIdentity('telegram', '55', 'firmax')?.role).toBe('viewer');
  });
  it('deletes an identity', () => {
    store.upsertIdentity(rec);
    store.deleteIdentity('telegram', '55', 'firmax');
    expect(store.getIdentity('telegram', '55', 'firmax')).toBeNull();
  });
  it('exports and re-imports a bundle round-trip', () => {
    store.upsertIdentity(rec);
    const bundle = store.exportBundle();
    const dir2 = mkdtempSync(join(tmpdir(), 'deckent-id2-'));
    const store2 = new IdentityStore(join(dir2, 'identity.db'));
    store2.importBundle(bundle);
    expect(store2.getIdentity('telegram', '55', 'firmax')).toEqual(rec);
    store2.close(); rmSync(dir2, { recursive: true, force: true });
  });
  it('does not collide cache keys across segment boundaries', () => {
    // ("tg","a b","x") vs ("tg","a","b x") would collide under a space separator
    store.upsertIdentity({ ...rec, connector: 'telegram', externalId: 'a b', tenantId: 'x', principalId: 'p1' });
    store.upsertIdentity({ ...rec, connector: 'telegram', externalId: 'a', tenantId: 'b x', principalId: 'p2' });
    // First read populates cache
    expect(store.getIdentity('telegram', 'a b', 'x')?.principalId).toBe('p1');
    expect(store.getIdentity('telegram', 'a', 'b x')?.principalId).toBe('p2');
    // Second read exercises the cache path
    expect(store.getIdentity('telegram', 'a b', 'x')?.principalId).toBe('p1');
    expect(store.getIdentity('telegram', 'a', 'b x')?.principalId).toBe('p2');
  });
  it('stores and reads a pending-verify with attempts', () => {
    store.putPendingVerify({ connector: 'telegram', externalId: '77', code: '123456', email: 'a@b.c', tenantId: 'firmax', expiresAt: 999 });
    store.bumpVerifyAttempts('telegram', '77');
    const p = store.getPendingVerify('telegram', '77');
    expect(p).toEqual({ code: '123456', email: 'a@b.c', tenantId: 'firmax', expiresAt: 999, attempts: 1 });
    store.deletePendingVerify('telegram', '77');
    expect(store.getPendingVerify('telegram', '77')).toBeNull();
  });
});
