// tests/connectors/connector-bootstrap-gate-e2e.test.ts
//
// Production-path integration test for the per-user identity gate (final review I-1).
//
// WHAT THIS PROVES (the I-1 gap the final review flagged):
//   The per-user identity feature was INERT in the live path because (1) bot.ts never
//   threaded `config.identity` into the bootstrap and (2) nothing ever created a
//   ChannelBinding, so `getBinding()` always returned null → `turnPrincipal` undefined
//   → the L2 gate was a no-op. The pre-existing `identity-e2e-smoke.test.ts` exercises
//   `buildIdentityResolver` + `runCapability` in ISOLATION; it never drives the
//   `bootstrapConnectorCommands` → onMessage → onChat → getBinding → resolveIdentity
//   chain, nor the config.channels → setBinding seeding. THIS test does.
//
// HOW REAL THE PATH IS (and where it stops — no faking of the gate):
//   * REAL: bootstrapConnectorCommands seeds bindings from `identityCfg.channels`
//     (Fix b), wires the connector's onMessage handler, routes the inbound message
//     through the REAL incoming-command-router → onChat, looks the binding up via the
//     REAL gateway-access getBinding, resolves the sender via the REAL
//     buildIdentityResolver, and threads the resolved principal into the chat turn.
//   * REAL: the L2 authorization gate is the REAL `runCapability` (execute.ts) +
//     REAL `principalCan` (rbac.ts). It is NOT mocked or re-implemented.
//   * SUBSTITUTED (and why): the `chat` responder is injected via the production
//     `deps.chat` seam (the same seam bot.ts uses for makeChatResponder). It threads
//     the principal it RECEIVES from the bootstrap into a real CapabilityContext —
//     byte-for-byte the production threading in chat-bridge.ts (`...principal !==
//     undefined ? { principal, tenantId } : {}`) — and calls the REAL runCapability.
//     We substitute the responder ONLY because no builtin capability declares a
//     `requiredPermission` yet, so the real gate is reachable only via a fixture cap;
//     makeChatResponder builds its own internal builtin registry that cannot host a
//     fixture cap, so it cannot exercise the deny branch. The gate code itself is real.
//
// Hermetic: tmpdir root + DECKENT_GATEWAY_HOME override (gateway-paths.ts) + a
// fake connector. No real network, no real ~/.deckent. Passes on a fresh checkout.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import { IdentityStore } from '../../src/connectors/identity/identity-store.js';
import { CapabilityRegistry } from '../../src/connectors/capabilities/registry.js';
import { runCapability } from '../../src/connectors/capabilities/execute.js';
import { loadGatewayAccess } from '../../src/connectors/gateway/gateway-access.js';
import type { Capability, CapabilityContext } from '../../src/connectors/capabilities/types.js';
import type { IMessageConnector, ConnectorId, IncomingMessage } from '../../src/connectors/types.js';
import type { ResolvedPrincipal } from '../../src/connectors/identity/provider.js';
import type { DeckentConfig } from '../../src/core/types.js';

// ─── Fixture capability: requires 'order:write' (no builtin declares one yet) ──
const cancelCap: Capability = {
  id: 'order.cancel', titleKey: 'x', tier: 'destructive', defaultPolicy: 'auto', edition: 'solo',
  paramsSchema: z.object({}), requiredPermission: 'order:write',
  // NOTE: the success marker must avoid markdown-special chars (_ * ~ etc.) — the
  // bootstrap relays chat replies through markdownToTelegramHtml, which would mangle
  // e.g. 'A_B_C' into italics. Plain words + spaces survive intact.
  preview: () => 'cancel order', run: async () => ({ text: 'order cancelled now' }),
};
const registry = new CapabilityRegistry();
registry.register(cancelCap);
const noopSink = (async () => undefined) as never;

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

/**
 * REAL production threading: build a CapabilityContext that carries the principal the
 * bootstrap resolved for THIS sender (chat-bridge.ts makeCapCtx, line ~291), then call
 * the REAL gate. Returns the gate's verdict string, which the bootstrap relays outbound.
 */
function capCtx(root: string, channelId: string, principal: ResolvedPrincipal | undefined): CapabilityContext {
  return {
    chatKey: channelId, project: root, lang: 'en', config: {}, now: Date.now(),
    spawn: (async () => ({ code: 0, stdout: Buffer.alloc(0), stderr: '' })) as never,
    loadMailTransport: (async () => ({ sendMail: async () => ({ messageId: 'x' }) })) as never,
    ...(principal !== undefined ? { principal, tenantId: principal.tenantId } : {}),
  } as CapabilityContext;
}

const TS = (): string => new Date().toISOString();

let root: string;
let gwHome: string;
let prevGwHome: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gate-e2e-'));
  gwHome = mkdtempSync(join(tmpdir(), 'gate-gw-'));
  prevGwHome = process.env['DECKENT_GATEWAY_HOME'];
  process.env['DECKENT_GATEWAY_HOME'] = gwHome;
  // The bootstrap opens IdentityStore at <root>/.deckent/identity.db — the parent dir
  // must exist (better-sqlite3 does not mkdir). Seed it before bootstrap.
  mkdirSync(join(root, '.deckent'), { recursive: true });
});
afterEach(() => {
  if (prevGwHome === undefined) delete process.env['DECKENT_GATEWAY_HOME'];
  else process.env['DECKENT_GATEWAY_HOME'] = prevGwHome;
  try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  try { rmSync(gwHome, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** Seed the per-project IdentityStore the bootstrap will open. */
function seedIdentities(): void {
  const store = new IdentityStore(join(root, '.deckent', 'identity.db'));
  try {
    // Authorized: operator → order:read + order:write (passes the order:write gate).
    store.upsertIdentity({ connector: 'telegram', externalId: 'op-1', tenantId: 'firmax', principalId: 'ali', role: 'operator', verified: true, method: 'otp', updatedAt: TS() });
    // Known-but-unauthorized: viewer → order:read only (reaches the gate, then DENIED).
    store.upsertIdentity({ connector: 'telegram', externalId: 'view-1', tenantId: 'firmax', principalId: 'veli', role: 'viewer', verified: true, method: 'otp', updatedAt: TS() });
  } finally {
    store.close();
  }
}

function identityCfg(): NonNullable<DeckentConfig['identity']> {
  return {
    enabled: true,
    provider: { kind: 'local' },
    roleMap: {
      operator: { role: 'operator', permissions: ['order:read', 'order:write'] },
      viewer: { role: 'viewer', permissions: ['order:read'] },
    },
    // The channels map is what Fix (b) reads → setBinding. Keyed by chatKey
    // (`<connector>:<channelId>` — gateway-router.chatKeyOf). No guestRole →
    // fail-closed for unknown senders (tenant-locked).
    channels: {
      'telegram:chan-1': { tenantId: 'firmax', projectPath: root, mode: 'tenant-locked' },
    },
  };
}

describe('connector-bootstrap I-1 — per-user gate is LIVE through the real bootstrap path', () => {
  it('authorized operator runs the capability; known viewer is denied; unknown sender is dropped', async () => {
    seedIdentities();
    const fakeConnector = makeFakeConnector();
    // Capture the principal the bootstrap threads into each chat turn (audit of the wiring).
    const seenPrincipals: Array<ResolvedPrincipal | undefined> = [];

    const handle = await bootstrapConnectorCommands(root, connectorCfg(), {
      makeConnector: () => fakeConnector,
      identityCfg: identityCfg(),
      lang: 'en',
      // deps.chat: the REAL production seam. Thread the received principal into the
      // REAL runCapability gate (not faked) and relay its verdict outbound.
      chat: (async (_channelId: string, _text: string, _media?: unknown, _lang?: string, principal?: ResolvedPrincipal): Promise<string> => {
        seenPrincipals.push(principal);
        return runCapability(registry, 'order.cancel', {}, capCtx(root, _channelId, principal), _channelId, noopSink, 'auto');
      }) as never,
    });

    try {
      // Fix (b) persistence proof: the binding declared in config.channels must be
      // written to the gateway binding store during bootstrap (a fresh load sees it).
      const reloaded = await loadGatewayAccess();
      const persisted = reloaded.getBinding('telegram:chan-1');
      expect(persisted, 'config.identity.channels must be seeded into the binding store').not.toBeNull();
      expect(persisted).toMatchObject({ tenantId: 'firmax', mode: 'tenant-locked' });

      // 1) Authorized operator → real gate ALLOWS → capability runs.
      fakeConnector._fire({ id: 'm1', connector: 'telegram' as ConnectorId, fromUser: 'op-1', channelId: 'chan-1', text: 'cancel order 7', timestamp: TS() });
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(fakeConnector.sent.some((t) => t.includes('order cancelled now')), 'authorized sender capability must run').toBe(true);
      // The bootstrap resolved + threaded a real operator principal (the wiring works).
      expect(seenPrincipals.at(-1)).toMatchObject({ userId: 'ali', role: 'operator' });

      // 2) Known viewer → reaches gate, lacks order:write → real gate DENIES.
      fakeConnector.sent.length = 0;
      fakeConnector._fire({ id: 'm2', connector: 'telegram' as ConnectorId, fromUser: 'view-1', channelId: 'chan-1', text: 'cancel order 7', timestamp: TS() });
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(fakeConnector.sent.some((t) => t.includes('order:write')), 'denial names the missing permission').toBe(true);
      expect(fakeConnector.sent.some((t) => t.includes('order cancelled now')), 'capability must NOT run for viewer').toBe(false);
      expect(seenPrincipals.at(-1)).toMatchObject({ userId: 'veli', role: 'viewer' });

      // 3) Unknown sender on a tenant-locked binding (no guestRole) → fail-closed:
      //    verify prompt sent, turn DROPPED before chat/gate (the responder is not called).
      const principalsBefore = seenPrincipals.length;
      fakeConnector.sent.length = 0;
      fakeConnector._fire({ id: 'm3', connector: 'telegram' as ConnectorId, fromUser: 'ghost-1', channelId: 'chan-1', text: 'cancel order 7', timestamp: TS() });
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(fakeConnector.sent.some((t) => t.includes('/verify')), 'unknown sender gets the verify prompt').toBe(true);
      expect(fakeConnector.sent.some((t) => t.includes('order cancelled now'))).toBe(false);
      expect(seenPrincipals.length, 'unknown sender turn is dropped before the chat responder').toBe(principalsBefore);
    } finally {
      await handle.dispose();
    }
  });

  it('REGRESSION (escaped bug): a bound GROUP whose chat_id ≠ notify chat_id is admitted — not dropped by the per-channel gate', async () => {
    // The bug: authorizedChatIds = [notify chat_id] only, so a group message (different
    // channelId) was dropped at incoming-command-router BEFORE the identity layer ran.
    // The earlier e2e fixtures conflated notify + group into the same 'chan-1', masking it.
    const store = new IdentityStore(join(root, '.deckent', 'identity.db'));
    try {
      store.upsertIdentity({ connector: 'telegram', externalId: 'op-1', tenantId: 'firmax', principalId: 'ali', role: 'operator', verified: true, method: 'otp', updatedAt: TS() });
    } finally {
      store.close();
    }
    const fakeConnector = makeFakeConnector();
    const seen: Array<ResolvedPrincipal | undefined> = [];
    const handle = await bootstrapConnectorCommands(
      root,
      { telegram: { enabled: true, token: 'fake-token-12345', chat_id: 'owner-dm' } }, // notify = owner DM
      {
        makeConnector: () => fakeConnector,
        identityCfg: {
          enabled: true,
          provider: { kind: 'local' },
          roleMap: { operator: { role: 'operator', permissions: ['order:read', 'order:write'] } },
          channels: { 'telegram:grp-9': { tenantId: 'firmax', projectPath: root, mode: 'tenant-locked' } }, // group ≠ notify
        },
        lang: 'en',
        chat: (async (_c: string, _t: string, _m?: unknown, _l?: string, principal?: ResolvedPrincipal): Promise<string> => {
          seen.push(principal);
          return runCapability(registry, 'order.cancel', {}, capCtx(root, _c, principal), _c, noopSink, 'auto');
        }) as never,
      },
    );
    try {
      // Fire from the GROUP channel (NOT the notify chat_id). Pre-fix: dropped → nothing runs.
      fakeConnector._fire({ id: 'g1', connector: 'telegram' as ConnectorId, fromUser: 'op-1', channelId: 'grp-9', text: 'cancel order 7', timestamp: TS() });
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(fakeConnector.sent.some((t) => t.includes('order cancelled now')), 'a group message must reach the identity gate, not be dropped by the per-channel gate').toBe(true);
      expect(seen.at(-1)).toMatchObject({ userId: 'ali', role: 'operator' });
    } finally {
      await handle.dispose();
    }
  });

  it('opt-out: identity absent → no binding seeded, sender flows to chat with NO principal (gate no-op)', async () => {
    seedIdentities();
    const fakeConnector = makeFakeConnector();
    const seenPrincipals: Array<ResolvedPrincipal | undefined> = [];

    // No identityCfg at all → byte-for-byte the legacy path.
    const handle = await bootstrapConnectorCommands(root, connectorCfg(), {
      makeConnector: () => fakeConnector,
      lang: 'en',
      chat: (async (_channelId: string, _text: string, _m?: unknown, _l?: string, principal?: ResolvedPrincipal): Promise<string> => {
        seenPrincipals.push(principal);
        return runCapability(registry, 'order.cancel', {}, capCtx(root, _channelId, principal), _channelId, noopSink, 'auto');
      }) as never,
    });
    try {
      // No binding written when identity is absent.
      const reloaded = await loadGatewayAccess();
      expect(reloaded.getBinding('telegram:chan-1')).toBeNull();

      // Any sender flows straight to chat with principal undefined → gate no-op → runs.
      fakeConnector._fire({ id: 'm1', connector: 'telegram' as ConnectorId, fromUser: 'anyone', channelId: 'chan-1', text: 'cancel order 7', timestamp: TS() });
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(seenPrincipals.at(-1)).toBeUndefined();
      expect(fakeConnector.sent.some((t) => t.includes('order cancelled now')), 'opt-out path unchanged: capability runs ungated').toBe(true);
    } finally {
      await handle.dispose();
    }
  });
});
