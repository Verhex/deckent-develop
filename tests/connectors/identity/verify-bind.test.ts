// tests/connectors/identity/verify-bind.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore } from '../../../src/connectors/identity/identity-store.js';
import { startVerify, confirmVerify, type VerifyDeps } from '../../../src/connectors/identity/verify-bind.js';

let dir: string; let store: IdentityStore; let clock: number;
const ref = { connector: 'telegram' as const, externalId: '77' };
const bind = { principalId: 'ahmet', role: 'operator' as const, tenantId: 'firmax' };
const deps = (): VerifyDeps => ({ store, now: () => clock, genCode: () => '123456', ttlSec: 300, maxAttempts: 3 });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-vb-')); store = new IdentityStore(join(dir, 'identity.db')); clock = 1_000_000; });
afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });

describe('verify-bind', () => {
  it('rejects an invalid email at start', () => {
    expect(startVerify(deps(), ref, 'not-an-email', 'firmax')).toEqual({ ok: false, reason: 'invalid-email' });
  });
  it('happy path: start then confirm binds a verified identity', () => {
    expect(startVerify(deps(), ref, 'ahmet@firma.com', 'firmax')).toEqual({ ok: true, code: '123456' });
    const r = confirmVerify(deps(), ref, '123456', bind);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.principal).toMatchObject({ userId: 'ahmet', role: 'operator', tenantId: 'firmax', verified: true });
    expect(store.getIdentity('telegram', '77', 'firmax')?.verified).toBe(true);
    expect(store.getPendingVerify('telegram', '77')).toBeNull(); // cleared
  });
  it('rejects an expired code', () => {
    startVerify(deps(), ref, 'ahmet@firma.com', 'firmax');
    clock += 301_000; // past ttlSec
    expect(confirmVerify(deps(), ref, '123456', bind)).toEqual({ ok: false, reason: 'expired' });
  });
  it('rejects a wrong code and counts attempts, then locks out', () => {
    startVerify(deps(), ref, 'ahmet@firma.com', 'firmax');
    expect(confirmVerify(deps(), ref, '000000', bind)).toEqual({ ok: false, reason: 'wrong-code' });
    expect(confirmVerify(deps(), ref, '000000', bind)).toEqual({ ok: false, reason: 'wrong-code' });
    expect(confirmVerify(deps(), ref, '000000', bind)).toEqual({ ok: false, reason: 'too-many' });
  });
  it('rejects confirm with nothing pending', () => {
    expect(confirmVerify(deps(), ref, '123456', bind)).toEqual({ ok: false, reason: 'none-pending' });
  });
});
