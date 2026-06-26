// tests/connectors/identity-faz3-e2e.test.ts
//
// Faz-3 directory-sync e2e (task 329-005): bootstrap background sync() opt-in +
// role-map groupKey live.
//
// WHAT THIS PROVES:
//   * A `scim`/`oidc`-style directory provider (one that implements the OPTIONAL
//     IdentityDirectoryProvider.sync()) is wired into bootstrapConnectorCommands via
//     the deps.makeIdentityProvider seam, and its FIRST sync() is fired OUT-OF-BAND
//     (triggerBackgroundSync — fire-and-forget; never blocks the resolve hot-path).
//   * After the mock-fetch sync populates the per-project IdentityStore, an inbound
//     message resolves through the REAL path (onMessage → onChat → getBinding →
//     resolveIdentity → scim.resolve) and the REAL L2 gate (runCapability +
//     principalCan) ALLOWS an authorized sender / DENIES an unauthorized one.
//   * role-map groupKey is LIVE: a sender whose base role is `viewer` (read-only)
//     but who belongs to a directory group mapped to order:write is ALLOWED — the
//     group entry takes precedence over the role default (resolvePermissions SSOT).
//   * Fail-safe: a sync() that rejects (mock-fetch throws) NEVER crashes the
//     connector — it logs + continues, and the connector keeps serving (unknown
//     senders fail closed to the verify prompt instead of the connector dying).
//   * The disabled/local path is unchanged: the `local` provider has no sync() so
//     triggerBackgroundSync is a no-op.
//
// Hermetic (ADR-078): tmpdir root + DECKENT_GATEWAY_HOME override + fake connector +
// injected mock-fetch (no real network, no real ~/.deckent). Passes on a fresh checkout.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  bootstrapConnectorCommands,
  buildIdentityResolverFromProvider,
  triggerBackgroundSync,
} from '../../src/connectors/connector-bootstrap.js';
import { IdentityStore } from '../../src/connectors/identity/identity-store.js';
import { createIdentityProvider } from '../../src/connectors/identity/index.js';
import { resolvePermissions, type RoleMap } from '../../src/connectors/identity/role-map.js';
import { CapabilityRegistry } from '../../src/connectors/capabilities/registry.js';
import { runCapability } from '../../src/connectors/capabilities/execute.js';
import { loadGatewayAccess } from '../../src/connectors/gateway/gateway-access.js';
import type { Capability, CapabilityContext } from '../../src/connectors/capabilities/types.js';
import type { IMessageConnector, ConnectorId, IncomingMessage } from '../../src/connectors/types.js';
import type {
  ExternalRef,
  IdentityDirectoryProvider,
  ResolvedPrincipal,
  SyncReport,
} from '../../src/connectors/identity/provider.js';
import type { ChannelBinding } from '../../src/connectors/identity/principal-resolver.js';
import type { DeckentConfig } from '../../src/core/types.js';

// ─── Fixture capability: requires 'order:write' (no builtin declares one yet) ──
// Success marker avoids markdown-special chars (the bootstrap relays replies through
// markdownToTelegramHtml, which would mangle e.g. underscores into italics).
const cancelCap: Capability = {
  id: 'order.cancel', titleKey: 'x', tier: 'destructive', defaultPolicy: 'auto', edition: 'solo',
  paramsSchema: z.object({}), requiredPermission: 'order:write',
  preview: () => 'cancel order', run: async () => ({ text: 'order cancelled now' }),
};
const registry = new CapabilityRegistry();
registry.register(cancelCap);
const noopSink = (async () => undefined) as never;

const TS = (): string => '2026-06-26T00:00:00.000Z';

// ─── A SCIM-like directory provider: implements the OPTIONAL sync() ───────────
// sync() pulls a (mock) directory and upserts identities into the shared store +
// records each user's directory group; resolve() applies groupKey precedence via the
// resolvePermissions SSOT so a group can grant permissions beyond the user's base role.
interface ScimUser {
  connector: ConnectorId;
  externalId: string;
  tenantId: string;
  principalId: string;
  role: 'admin' | 'operator' | 'viewer';
  group?: string;
}

class ScimMockProvider implements IdentityDirectoryProvider {
  readonly id = 'scim';
  readonly edition = 'enterprise' as const;
  /** externalId → directory group key (populated by sync, consumed by resolve). */
  private readonly groups = new Map<string, string>();
  private settle!: () => void;
  /** Resolves when sync() finishes (success OR failure) — NEVER rejects, so awaiting it
   *  in the fail-safe test cannot raise an unhandled rejection. */
  readonly synced: Promise<void>;
  syncCalls = 0;

  constructor(
    private readonly store: IdentityStore,
    private readonly roleMap: RoleMap | undefined,
    private readonly fetchDirectory: () => Promise<ScimUser[]>,
  ) {
    this.synced = new Promise<void>((res) => { this.settle = res; });
  }

  async sync(): Promise<SyncReport> {
    this.syncCalls++;
    try {
      const users = await this.fetchDirectory(); // mock-fetch (no real network)
      let upserted = 0;
      for (const u of users) {
        this.store.upsertIdentity({
          connector: u.connector, externalId: u.externalId, tenantId: u.tenantId,
          principalId: u.principalId, role: u.role, verified: true, method: 'scim', updatedAt: TS(),
        });
        if (u.group) this.groups.set(u.externalId, u.group);
        upserted++;
      }
      return { upserted, removed: 0 };
    } finally {
      this.settle(); // resolve `synced` whether sync succeeded or threw
    }
  }

  resolve(ref: ExternalRef, tenantId: string): ResolvedPrincipal | null {
    const rec = this.store.getIdentity(ref.connector, ref.externalId, tenantId);
    if (!rec) return null; // fail-closed
    const groupKey = this.groups.get(ref.externalId);
    return {
      userId: rec.principalId, role: rec.role,
      permissions: resolvePermissions(rec.role, this.roleMap, groupKey),
      tenantId: rec.tenantId, verified: rec.verified, source: 'scim',
    };
  }
}

// ─── Fake connector (capturing outbound sendMessage + the onMessage handler) ──
type MsgHandler = (msg: IncomingMessage) => void;
function makeFakeConnector(): IMessageConnector & { _fire: (m: IncomingMessage) => void; sent: string[] } {
  let handler: MsgHandler | undefined;
  const sent: string[] = [];
  return {
    id: 'telegram' as ConnectorId,
    async start() {},
    async stop() {},
    onMessage(h: MsgHandler) { handler = h; },
    async sendMessage(m: { channelId: string; text: string }) { sent.push(m.text); },
    _fire(m: IncomingMessage) { handler?.(m); },
    sent,
  };
}

function connectorCfg(): NonNullable<DeckentConfig['notify_connectors']> {
  return { telegram: { enabled: true, token: 'fake-token-12345', chat_id: 'chan-1' } };
}

function identityCfg(): NonNullable<DeckentConfig['identity']> {
  return {
    enabled: true,
    provider: { kind: 'local' }, // factory-kind is local-only today; the scim provider is injected.
    roleMap: {
      operator: { role: 'operator', permissions: ['order:read', 'order:write'] },
      viewer: { role: 'viewer', permissions: ['order:read'] },
    },
    channels: {
      'telegram:chan-1': { tenantId: 'firmax', projectPath: '__ROOT__', mode: 'tenant-locked' },
    },
  };
}

/** REAL production threading: thread the bootstrap-resolved principal into a real
 *  CapabilityContext and call the REAL gate (runCapability + principalCan). */
function capCtx(root: string, channelId: string, principal: ResolvedPrincipal | undefined): CapabilityContext {
  return {
    chatKey: channelId, project: root, lang: 'en', config: {}, now: 0,
    spawn: (async () => ({ code: 0, stdout: Buffer.alloc(0), stderr: '' })) as never,
    loadMailTransport: (async () => ({ sendMail: async () => ({ messageId: 'x' }) })) as never,
    ...(principal !== undefined ? { principal, tenantId: principal.tenantId } : {}),
  } as CapabilityContext;
}

let root: string;
let gwHome: string;
let prevGwHome: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'faz3-e2e-'));
  gwHome = mkdtempSync(join(tmpdir(), 'faz3-gw-'));
  prevGwHome = process.env['DECKENT_GATEWAY_HOME'];
  process.env['DECKENT_GATEWAY_HOME'] = gwHome;
  // bootstrap opens IdentityStore at <root>/.deckent/identity.db — parent must exist.
  mkdirSync(join(root, '.deckent'), { recursive: true });
});
afterEach(() => {
  if (prevGwHome === undefined) delete process.env['DECKENT_GATEWAY_HOME'];
  else process.env['DECKENT_GATEWAY_HOME'] = prevGwHome;
  try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  try { rmSync(gwHome, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** identityCfg with the channels binding pinned to this test's tmpdir root. */
function cfgForRoot(): NonNullable<DeckentConfig['identity']> {
  const cfg = identityCfg();
  cfg.channels!['telegram:chan-1']!.projectPath = root;
  return cfg;
}

describe('identity Faz-3 — bootstrap background sync() + groupKey live', () => {
  it('T1: scim sync (mock-fetch) fills the store → inbound resolves per-user → real gate ALLOW/DENY', async () => {
    const fakeConnector = makeFakeConnector();
    const seenPrincipals: Array<ResolvedPrincipal | undefined> = [];
    let scim: ScimMockProvider | undefined;

    const handle = await bootstrapConnectorCommands(root, connectorCfg(), {
      makeConnector: () => fakeConnector,
      identityCfg: cfgForRoot(),
      lang: 'en',
      makeIdentityProvider: (store, cfg) => {
        scim = new ScimMockProvider(store, cfg.roleMap as RoleMap, async () => [
          { connector: 'telegram', externalId: 'op-1', tenantId: 'firmax', principalId: 'ali', role: 'operator' },
          { connector: 'telegram', externalId: 'view-1', tenantId: 'firmax', principalId: 'veli', role: 'viewer' },
        ]);
        return scim;
      },
      chat: (async (_channelId: string, _text: string, _media?: unknown, _lang?: string, principal?: ResolvedPrincipal): Promise<string> => {
        seenPrincipals.push(principal);
        return runCapability(registry, 'order.cancel', {}, capCtx(root, _channelId, principal), _channelId, noopSink, 'auto');
      }) as never,
    });

    try {
      // The bootstrap fired the first sync OUT-OF-BAND; wait for it to settle.
      await scim!.synced;
      expect(scim!.syncCalls, 'bootstrap must fire sync() exactly once').toBe(1);

      // "store dolar" — the sync actually persisted identities into the per-project DB.
      const probe = new IdentityStore(join(root, '.deckent', 'identity.db'));
      try {
        expect(probe.getIdentity('telegram', 'op-1', 'firmax'), 'sync upserted the operator').not.toBeNull();
        expect(probe.getIdentity('telegram', 'view-1', 'firmax'), 'sync upserted the viewer').not.toBeNull();
      } finally {
        probe.close();
      }

      // The config.channels binding was seeded into the gateway store.
      const reloaded = await loadGatewayAccess();
      expect(reloaded.getBinding('telegram:chan-1')).toMatchObject({ tenantId: 'firmax', mode: 'tenant-locked' });

      // 1) Authorized operator → real gate ALLOWS → capability runs.
      fakeConnector._fire({ id: 'm1', connector: 'telegram' as ConnectorId, fromUser: 'op-1', channelId: 'chan-1', text: 'cancel order 7', timestamp: new Date().toISOString() });
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(fakeConnector.sent.some((t) => t.includes('order cancelled now')), 'authorized sender capability must run').toBe(true);
      expect(seenPrincipals.at(-1)).toMatchObject({ userId: 'ali', role: 'operator', source: 'scim' });

      // 2) Known viewer → reaches the gate, lacks order:write → real gate DENIES.
      fakeConnector.sent.length = 0;
      fakeConnector._fire({ id: 'm2', connector: 'telegram' as ConnectorId, fromUser: 'view-1', channelId: 'chan-1', text: 'cancel order 7', timestamp: new Date().toISOString() });
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(fakeConnector.sent.some((t) => t.includes('order:write')), 'denial names the missing permission').toBe(true);
      expect(fakeConnector.sent.some((t) => t.includes('order cancelled now')), 'capability must NOT run for viewer').toBe(false);
      expect(seenPrincipals.at(-1)).toMatchObject({ userId: 'veli', role: 'viewer' });
    } finally {
      await handle.dispose();
    }
  });

  it('T2: role-map groupKey is LIVE — a viewer in an order-admins group is granted order:write', async () => {
    const dir = root;
    const store = new IdentityStore(join(dir, '.deckent', 'identity.db'));
    try {
      // roleMap: the GROUP entry grants write; the viewer ROLE default is read-only.
      const roleMap: RoleMap = {
        'order-admins': { role: 'operator', permissions: ['order:read', 'order:write'] },
        viewer: { role: 'viewer', permissions: ['order:read'] },
      };
      const provider = new ScimMockProvider(store, roleMap, async () => [
        // base role viewer, but member of the order-admins directory group
        { connector: 'telegram', externalId: 'grp-1', tenantId: 'firmax', principalId: 'gulen', role: 'viewer', group: 'order-admins' },
      ]);

      // triggerBackgroundSync fires the provider's sync(); await the settle signal.
      await triggerBackgroundSync(provider, provider.id);
      await provider.synced;

      const resolve = buildIdentityResolverFromProvider(provider, { enabled: true, roleMap }, dir);
      const binding: ChannelBinding = { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' };
      const principal = resolve({ connector: 'telegram', fromUser: 'grp-1' }, binding);

      // Base role is viewer, yet the group grants order:write (group precedence over role).
      expect(principal).toMatchObject({ userId: 'gulen', role: 'viewer' });
      expect(principal!.permissions).toContain('order:write');

      // …so the order:write-gated capability RUNS for this group member.
      const out = await runCapability(registry, 'order.cancel', {}, capCtx(dir, 'telegram:-100', principal!), 'telegram:-100', noopSink, 'auto');
      expect(out).toContain('cancelled');
    } finally {
      store.close();
    }
  });

  it('T3: sync failure is fail-safe — connector keeps serving, unknown senders fail closed', async () => {
    const fakeConnector = makeFakeConnector();
    let scim: ScimMockProvider | undefined;

    // bootstrap must NOT throw even though the directory fetch rejects.
    const handle = await bootstrapConnectorCommands(root, connectorCfg(), {
      makeConnector: () => fakeConnector,
      identityCfg: cfgForRoot(),
      lang: 'en',
      makeIdentityProvider: (store, cfg) => {
        scim = new ScimMockProvider(store, cfg.roleMap as RoleMap, async () => {
          throw new Error('SCIM endpoint 503');
        });
        return scim;
      },
      chat: (async (): Promise<string> => 'should-not-run') as never,
    });

    try {
      await scim!.synced; // resolves even though sync() threw (finally settle)
      expect(scim!.syncCalls).toBe(1);

      // Store stayed empty → an inbound sender is unknown on a tenant-locked binding
      // with no guestRole → fail-closed: verify prompt sent, turn dropped. The
      // connector did NOT crash on the failed sync.
      fakeConnector._fire({ id: 'm1', connector: 'telegram' as ConnectorId, fromUser: 'op-1', channelId: 'chan-1', text: 'cancel order 7', timestamp: new Date().toISOString() });
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(fakeConnector.sent.some((t) => t.includes('/verify')), 'unknown sender gets the verify prompt (connector alive)').toBe(true);
      expect(fakeConnector.sent.some((t) => t.includes('cancelled'))).toBe(false);
    } finally {
      await handle.dispose();
    }
  });

  it('T5: scim kind configured WITHOUT a provider seam → identity disabled, NOT silently downgraded to local', async () => {
    // Seed a local identity for op-1. If the bootstrap silently fell back to the local
    // provider, op-1 would resolve to an operator principal. The honest-fail contract
    // instead disables identity (principal undefined) and logs why.
    const seed = new IdentityStore(join(root, '.deckent', 'identity.db'));
    try {
      seed.upsertIdentity({ connector: 'telegram', externalId: 'op-1', tenantId: 'firmax', principalId: 'ali', role: 'operator', verified: true, method: 'otp', updatedAt: TS() });
    } finally {
      seed.close();
    }

    const cfg = cfgForRoot();
    cfg.provider = { kind: 'scim', scim: { baseUrl: 'https://scim.example.com/v2', token: 'x' } };

    const fakeConnector = makeFakeConnector();
    const seenPrincipals: Array<ResolvedPrincipal | undefined> = [];
    // No makeIdentityProvider seam → the local factory cannot build a scim adapter.
    const handle = await bootstrapConnectorCommands(root, connectorCfg(), {
      makeConnector: () => fakeConnector,
      identityCfg: cfg,
      lang: 'en',
      chat: (async (_channelId: string, _text: string, _media?: unknown, _lang?: string, principal?: ResolvedPrincipal): Promise<string> => {
        seenPrincipals.push(principal);
        return 'ok';
      }) as never,
    });
    try {
      fakeConnector._fire({ id: 'm1', connector: 'telegram' as ConnectorId, fromUser: 'op-1', channelId: 'chan-1', text: 'hello', timestamp: new Date().toISOString() });
      await new Promise<void>((r) => setTimeout(r, 80));
      // Reached chat (connector alive) but with NO principal — identity was disabled,
      // not silently resolved via the local provider.
      expect(seenPrincipals.length).toBeGreaterThan(0);
      expect(seenPrincipals.at(-1), 'scim-without-seam must NOT resolve op-1 via local fallback').toBeUndefined();
    } finally {
      await handle.dispose();
    }
  });

  it('T4: local provider has no sync() → triggerBackgroundSync is a no-op (disabled/local path unchanged)', async () => {
    const store = new IdentityStore(join(root, '.deckent', 'identity.db'));
    try {
      const local = createIdentityProvider({ kind: 'local', store, local: { edition: 'team' } });
      expect(local.sync, 'local provider does not implement sync()').toBeUndefined();
      // No-op: resolves without touching the store or throwing.
      await expect(triggerBackgroundSync(local, local.id)).resolves.toBeUndefined();
      expect(store.getIdentity('telegram', 'whoever', 'firmax')).toBeNull();
    } finally {
      store.close();
    }
  });
});
