import { describe, it, expect, vi } from 'vitest';
import { SessionStore } from '../../src/core/auth-session.js';
import type { Session, PersistenceHook } from '../../src/core/auth-session.js';
import type { ActorContext } from '../../src/core/work-model.js';

const IDENTITY: ActorContext = { id: 'user-1', role: 'admin', tenantId: 'tenant-42' };
const TTL = 60_000; // 1 minute

describe('SessionStore', () => {
  // ─── create / resolve ──────────────────────────────────────────────────────

  it('create returns a non-empty token', () => {
    const store = new SessionStore({ now: () => 1000 });
    const token = store.create(IDENTITY, TTL);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('resolve returns the correct session for a valid token', () => {
    const store = new SessionStore({ now: () => 1000 });
    const token = store.create(IDENTITY, TTL);
    const session = store.resolve(token);
    expect(session).not.toBeNull();
    expect(session!.actorId).toBe('user-1');
    expect(session!.role).toBe('admin');
    expect(session!.tenantId).toBe('tenant-42');
    expect(session!.issuedAt).toBe(1000);
    expect(session!.expiresAt).toBe(1000 + TTL);
  });

  it('resolve returns null for unknown token', () => {
    const store = new SessionStore({ now: () => 1000 });
    expect(store.resolve('nonexistent')).toBeNull();
  });

  it('each create produces a unique token', () => {
    const store = new SessionStore({ now: () => 1000 });
    const t1 = store.create(IDENTITY, TTL);
    const t2 = store.create(IDENTITY, TTL);
    expect(t1).not.toBe(t2);
  });

  // ─── expiry ────────────────────────────────────────────────────────────────

  it('resolve returns null after session expires', () => {
    let ts = 1000;
    const store = new SessionStore({ now: () => ts });
    const token = store.create(IDENTITY, TTL);
    // before expiry: valid
    expect(store.resolve(token)).not.toBeNull();
    // at exact expiry boundary: expired (ts >= expiresAt)
    ts = 1000 + TTL;
    expect(store.resolve(token)).toBeNull();
    // well after expiry
    ts = 1000 + TTL + 1;
    expect(store.resolve(token)).toBeNull();
  });

  it('resolve is valid one millisecond before expiry', () => {
    let ts = 1000;
    const store = new SessionStore({ now: () => ts });
    const token = store.create(IDENTITY, TTL);
    ts = 1000 + TTL - 1;
    expect(store.resolve(token)).not.toBeNull();
  });

  // ─── revoke ────────────────────────────────────────────────────────────────

  it('revoke causes resolve to return null', () => {
    const store = new SessionStore({ now: () => 1000 });
    const token = store.create(IDENTITY, TTL);
    expect(store.resolve(token)).not.toBeNull();
    store.revoke(token);
    expect(store.resolve(token)).toBeNull();
  });

  it('revoking a non-existent token is a no-op', () => {
    const store = new SessionStore({ now: () => 1000 });
    expect(() => store.revoke('ghost-token')).not.toThrow();
  });

  // ─── prune ────────────────────────────────────────────────────────────────

  it('prune removes expired sessions and returns the count', () => {
    let ts = 1000;
    const store = new SessionStore({ now: () => ts });
    store.create(IDENTITY, 500);  // expires at 1500
    store.create(IDENTITY, 500);  // expires at 1500
    store.create(IDENTITY, 5000); // expires at 6000 — still valid

    ts = 2000; // advance past first two
    const pruned = store.prune();
    expect(pruned).toBe(2);
    // valid session still resolves
    expect(store.resolve(store.create(IDENTITY, 5000))).not.toBeNull();
  });

  it('prune with explicit now argument', () => {
    const store = new SessionStore({ now: () => 1000 });
    store.create(IDENTITY, 500);  // expires at 1500
    store.create(IDENTITY, 5000); // expires at 6000
    const pruned = store.prune(2000);
    expect(pruned).toBe(1);
  });

  it('prune on empty store returns 0', () => {
    const store = new SessionStore({ now: () => 1000 });
    expect(store.prune()).toBe(0);
  });

  it('prune returns 0 when no sessions have expired', () => {
    const store = new SessionStore({ now: () => 1000 });
    store.create(IDENTITY, TTL);
    expect(store.prune()).toBe(0);
  });

  // ─── persistence hook ────────────────────────────────────────────────────

  it('persistence.save is called on create', () => {
    const save = vi.fn();
    const store = new SessionStore({ now: () => 1000, persistence: { save } });
    store.create(IDENTITY, TTL);
    expect(save).toHaveBeenCalledOnce();
  });

  it('persistence.save is called on revoke', () => {
    const save = vi.fn();
    const store = new SessionStore({ now: () => 1000, persistence: { save } });
    const token = store.create(IDENTITY, TTL);
    save.mockClear();
    store.revoke(token);
    expect(save).toHaveBeenCalledOnce();
  });

  it('persistence.save is called on prune when entries removed', () => {
    let ts = 1000;
    const save = vi.fn();
    const store = new SessionStore({ now: () => ts, persistence: { save } });
    store.create(IDENTITY, 500);
    save.mockClear();
    ts = 2000;
    store.prune();
    expect(save).toHaveBeenCalledOnce();
  });

  it('persistence.save is NOT called on prune when nothing removed', () => {
    const save = vi.fn();
    const store = new SessionStore({ now: () => 1000, persistence: { save } });
    store.create(IDENTITY, TTL);
    save.mockClear();
    store.prune();
    expect(save).not.toHaveBeenCalled();
  });

  it('persistence.load populates store on construction', () => {
    const existing = new Map<string, Session>([
      ['tok-abc', { actorId: 'pre-loaded', role: 'viewer', tenantId: 't1', issuedAt: 0, expiresAt: 99999999999 }],
    ]);
    const hook: PersistenceHook = { load: () => existing };
    const store = new SessionStore({ now: () => 1000, persistence: hook });
    const session = store.resolve('tok-abc');
    expect(session).not.toBeNull();
    expect(session!.actorId).toBe('pre-loaded');
  });

  // ─── ActorContext mapping ─────────────────────────────────────────────────

  it('ActorContext fields map correctly to Session fields', () => {
    const store = new SessionStore({ now: () => 5000 });
    const identity: ActorContext = { id: 'alice', role: 'owner', tenantId: 'org-99' };
    const token = store.create(identity, 3000);
    const s = store.resolve(token)!;
    expect(s.actorId).toBe('alice');
    expect(s.role).toBe('owner');
    expect(s.tenantId).toBe('org-99');
    expect(s.issuedAt).toBe(5000);
    expect(s.expiresAt).toBe(8000);
  });

  it('ActorContext with only id (no role/tenantId) is accepted', () => {
    const store = new SessionStore({ now: () => 1000 });
    const token = store.create({ id: 'anon' }, TTL);
    const s = store.resolve(token)!;
    expect(s.actorId).toBe('anon');
    expect(s.role).toBeUndefined();
    expect(s.tenantId).toBeUndefined();
  });
});
