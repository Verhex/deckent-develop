// tests/connectors/identity/local-provider.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore } from '../../../src/connectors/identity/identity-store.js';
import { LocalIdentityProvider, createIdentityProvider } from '../../../src/connectors/identity/index.js';

let dir: string; let store: IdentityStore;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-lp-')); store = new IdentityStore(join(dir, 'identity.db')); });
afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });

describe('LocalIdentityProvider', () => {
  it('resolves the owner as admin without a store record', () => {
    const p = new LocalIdentityProvider(store, { edition: 'solo', owner: { connector: 'telegram', externalId: '1', tenantId: 'solo' } });
    const r = p.resolve({ connector: 'telegram', externalId: '1', kind: 'telegram-id' }, 'solo');
    expect(r).toMatchObject({ role: 'admin', verified: true, source: 'local', permissions: ['*'] });
  });
  it('resolves a stored identity with role-map permissions', () => {
    store.upsertIdentity({ connector: 'telegram', externalId: '55', tenantId: 'firmax', principalId: 'ali', role: 'operator', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z' });
    const p = new LocalIdentityProvider(store, { edition: 'team', roleMap: { operator: { role: 'operator', permissions: ['order:read', 'order:write'] } } });
    const r = p.resolve({ connector: 'telegram', externalId: '55', kind: 'telegram-id' }, 'firmax');
    expect(r).toMatchObject({ userId: 'ali', role: 'operator', permissions: ['order:read', 'order:write'], tenantId: 'firmax', verified: true });
  });
  it('returns null for an unknown sender (fail-closed)', () => {
    const p = new LocalIdentityProvider(store, { edition: 'team' });
    expect(p.resolve({ connector: 'telegram', externalId: '999', kind: 'telegram-id' }, 'firmax')).toBeNull();
  });
  it('factory builds a local provider', () => {
    const p = createIdentityProvider({ kind: 'local', store, local: { edition: 'solo' } });
    expect(p.id).toBe('local');
  });
  it('factory throws on unknown provider kind', () => {
    // @ts-expect-error — exercising the runtime guard
    expect(() => createIdentityProvider({ kind: 'scim', store, local: { edition: 'enterprise' } })).toThrow(/E_UNKNOWN_IDENTITY_PROVIDER/);
  });
});
