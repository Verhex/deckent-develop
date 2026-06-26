// tests/connectors/identity/scim-provider.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore } from '../../../src/connectors/identity/identity-store.js';
import { ScimIdentityProvider, type FetchLike, type ScimProviderOptions } from '../../../src/connectors/identity/providers/scim.js';

const ENDPOINT = 'https://idp.example.com/scim/v2';
const TENANT = 'firmax';

interface ScimUser { id: string; userName?: string; active?: boolean; emails?: Array<{ value: string; primary?: boolean }>; groups?: Array<{ value?: string; display?: string }> }
interface ScimGroup { id: string; displayName: string; members?: Array<{ value: string }> }

/** A mock SCIM 2.0 server with real startIndex/count pagination — records every URL fetched. */
function scimServer(users: ScimUser[], groups: ScimGroup[]) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    const parsed = new URL(url);
    const startIndex = Number(parsed.searchParams.get('startIndex') ?? '1');
    const count = Number(parsed.searchParams.get('count') ?? '100');
    const source = parsed.pathname.endsWith('/Users') ? users : parsed.pathname.endsWith('/Groups') ? groups : null;
    if (!source) return { ok: false, status: 404, json: async () => ({}) };
    const page = source.slice(startIndex - 1, startIndex - 1 + count);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: source.length,
        startIndex,
        itemsPerPage: page.length,
        Resources: page,
      }),
    };
  };
  return { fetchImpl, calls };
}

const ROLE_MAP = {
  'Sales-Ops': { role: 'operator' as const },
  Admins: { role: 'admin' as const },
  operator: { role: 'operator' as const, permissions: ['order:read', 'order:write'] },
};

function provider(store: IdentityStore, fetchImpl: FetchLike, over: Partial<ScimProviderOptions> = {}): ScimIdentityProvider {
  return new ScimIdentityProvider(store, {
    endpoint: ENDPOINT, token: 'tok-123', connector: 'email', tenantId: TENANT,
    roleMap: ROLE_MAP, defaultRole: 'viewer', fetch: fetchImpl, ...over,
  });
}

let dir: string; let store: IdentityStore;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-scim-')); store = new IdentityStore(join(dir, 'identity.db')); });
afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });

describe('ScimIdentityProvider', () => {
  it('exposes scim id and enterprise edition by default', () => {
    const p = provider(store, scimServer([], []).fetchImpl);
    expect(p.id).toBe('scim');
    expect(p.edition).toBe('enterprise');
  });

  it('sync() upserts every active user and maps external groups → deckent roles', async () => {
    const users: ScimUser[] = [
      { id: 'u1', userName: 'ali@firmax.io', active: true, emails: [{ value: 'ali@firmax.io', primary: true }] },
      { id: 'u2', userName: 'vel@firmax.io', active: true, emails: [{ value: 'vel@firmax.io', primary: true }] },
      { id: 'u3', userName: 'gst@firmax.io', active: true, emails: [{ value: 'gst@firmax.io', primary: true }] },
    ];
    const groups: ScimGroup[] = [
      { id: 'g1', displayName: 'Sales-Ops', members: [{ value: 'u1' }] },
      { id: 'g2', displayName: 'Admins', members: [{ value: 'u2' }] },
    ];
    const { fetchImpl } = scimServer(users, groups);
    const report = await provider(store, fetchImpl).sync();

    expect(report).toEqual({ upserted: 3, removed: 0 });
    expect(store.getIdentity('email', 'ali@firmax.io', TENANT)?.role).toBe('operator'); // Sales-Ops
    expect(store.getIdentity('email', 'vel@firmax.io', TENANT)?.role).toBe('admin');    // Admins
    expect(store.getIdentity('email', 'gst@firmax.io', TENANT)?.role).toBe('viewer');   // no group → default
    expect(store.getIdentity('email', 'ali@firmax.io', TENANT)?.method).toBe('directory');
  });

  it('picks the highest-privilege role when a user is in multiple mapped groups', async () => {
    const users: ScimUser[] = [{ id: 'u1', emails: [{ value: 'multi@firmax.io', primary: true }] }];
    const groups: ScimGroup[] = [
      { id: 'g1', displayName: 'Sales-Ops', members: [{ value: 'u1' }] }, // operator
      { id: 'g2', displayName: 'Admins', members: [{ value: 'u1' }] },    // admin (wins)
    ];
    await provider(store, scimServer(users, groups).fetchImpl).sync();
    expect(store.getIdentity('email', 'multi@firmax.io', TENANT)?.role).toBe('admin');
  });

  it('resolve() is pure-local — never calls fetch and reads only the store', async () => {
    const users: ScimUser[] = [{ id: 'u1', emails: [{ value: 'ali@firmax.io', primary: true }], groups: [{ display: 'Sales-Ops' }] }];
    const server = scimServer(users, []);
    const p = provider(store, server.fetchImpl);
    await p.sync();
    const callsAfterSync = server.calls.length;

    const resolved = p.resolve({ connector: 'email', externalId: 'ali@firmax.io', kind: 'email' }, TENANT);

    expect(server.calls.length).toBe(callsAfterSync); // resolve() made ZERO network calls
    expect(resolved).toMatchObject({
      userId: 'ali@firmax.io', role: 'operator', tenantId: TENANT, verified: true, source: 'scim',
      permissions: ['order:read', 'order:write'], // role→permission via role-map
    });
  });

  it('resolve() is fail-closed for an unknown sender (null, no network)', () => {
    const server = scimServer([], []);
    const p = provider(store, server.fetchImpl);
    expect(p.resolve({ connector: 'email', externalId: 'nobody@firmax.io', kind: 'email' }, TENANT)).toBeNull();
    expect(server.calls.length).toBe(0);
  });

  it('paginates SCIM /Users across multiple pages (startIndex/count)', async () => {
    const users: ScimUser[] = Array.from({ length: 5 }, (_, i) => ({
      id: `u${i}`, emails: [{ value: `user${i}@firmax.io`, primary: true }],
    }));
    const server = scimServer(users, []);
    const report = await provider(store, server.fetchImpl, { pageSize: 2 }).sync();

    expect(report.upserted).toBe(5);
    for (let i = 0; i < 5; i++) expect(store.getIdentity('email', `user${i}@firmax.io`, TENANT)).not.toBeNull();
    // 5 users @ pageSize 2 → 3 /Users pages (startIndex 1,3,5)
    const userPages = server.calls.filter((u) => u.includes('/Users'));
    expect(userPages.length).toBe(3);
  });

  it('a sync failure leaves the existing store untouched', async () => {
    // First, a good sync seeds the store.
    const seedUsers: ScimUser[] = [{ id: 'u1', emails: [{ value: 'ali@firmax.io', primary: true }], groups: [{ display: 'Admins' }] }];
    await provider(store, scimServer(seedUsers, []).fetchImpl).sync();
    const before = store.getIdentity('email', 'ali@firmax.io', TENANT);
    expect(before?.role).toBe('admin');

    // Now a failing endpoint must NOT mutate the store.
    const failing: FetchLike = async () => { throw new Error('ECONNREFUSED 127.0.0.1:443'); };
    await expect(provider(store, failing).sync()).rejects.toThrow(/E_SCIM_SYNC/);

    const after = store.getIdentity('email', 'ali@firmax.io', TENANT);
    expect(after).toEqual(before); // bit-for-bit preserved
  });

  it('a non-2xx response throws E_SCIM_SYNC without corrupting the store', async () => {
    const http500: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(provider(store, http500).sync()).rejects.toThrow(/HTTP 500/);
    expect(store.exportBundle().records.length).toBe(0);
  });

  it('deprovisions directory users removed from the IdP, keeping non-directory records', async () => {
    // Seed: two directory users + one OTP-bound user (must survive).
    const users: ScimUser[] = [
      { id: 'u1', emails: [{ value: 'stay@firmax.io', primary: true }], groups: [{ display: 'Sales-Ops' }] },
      { id: 'u2', emails: [{ value: 'gone@firmax.io', primary: true }] },
    ];
    await provider(store, scimServer(users, []).fetchImpl).sync();
    store.upsertIdentity({ connector: 'email', externalId: 'otp@firmax.io', tenantId: TENANT, principalId: 'otp@firmax.io', role: 'viewer', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z' });

    // Next sync: u2 has been removed from the directory.
    const report = await provider(store, scimServer([users[0]!], []).fetchImpl).sync();

    expect(report).toEqual({ upserted: 1, removed: 1 });
    expect(store.getIdentity('email', 'gone@firmax.io', TENANT)).toBeNull();      // deprovisioned
    expect(store.getIdentity('email', 'stay@firmax.io', TENANT)).not.toBeNull();  // kept
    expect(store.getIdentity('email', 'otp@firmax.io', TENANT)?.method).toBe('otp'); // OTP record untouched
  });

  it('treats active:false users as deprovisioned', async () => {
    const users: ScimUser[] = [
      { id: 'u1', active: true, emails: [{ value: 'live@firmax.io', primary: true }] },
      { id: 'u2', active: false, emails: [{ value: 'dead@firmax.io', primary: true }] },
    ];
    const report = await provider(store, scimServer(users, []).fetchImpl).sync();
    expect(report.upserted).toBe(1);
    expect(store.getIdentity('email', 'live@firmax.io', TENANT)).not.toBeNull();
    expect(store.getIdentity('email', 'dead@firmax.io', TENANT)).toBeNull();
  });
});
