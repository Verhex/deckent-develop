# Social-Identity & Authorization Engine (Faz 1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, headless identity→principal→permission engine that resolves a messaging-platform sender to a tenant-scoped RBAC principal and answers "may this principal do `resource:action`?" — with zero connector changes.

**Architecture:** A pluggable `IdentityDirectoryProvider` port (Faz-1 adapter: `local`) backed by a better-sqlite3 `IdentityStore`. A `principal-resolver` wraps resolution in `withTenant` (fail-closed). `rbac.ts` gains a wildcard-aware `principalCan()` for `resource:action` checks. A `verify-bind` module implements OTP binding. Everything here is unit-testable in isolation; connector wiring (TurnContext, router gate, capability L2 gate, config, ADR-092, Tier-1 smoke) is the follow-up **Plan B**.

**Tech Stack:** TypeScript (Node16 ESM — `.js` import extensions mandatory), better-sqlite3 (already a dependency, see `src/core/memory-store.ts:10`), vitest.

## Global Constraints

- **ESM imports:** every relative import MUST end in `.js` (Node16 resolution). `import { x } from './y'` fails; use `'./y.js'`.
- **i18n-first:** no user-facing string is hardcoded — all go through `getMessage(key, lang)` (`src/cli/helpers/messages.ts`). *This engine emits NO user-facing strings* (it returns data/decisions); string emission happens in Plan B. Do not add TR/EN literals here.
- **Hermetic tests:** all file I/O under `os.tmpdir()` via `mkdtempSync`; clean up in `afterEach`. Never read gitignored state (`.deckent/`, `~/.deckent`, `.brain/memory.db`). Async only — no `spawnSync`. Must pass `npm run test:ci-sim`.
- **Determinism:** `verify-bind` injects `now()` and `genCode()` — tests pass fixed functions; never call `Date.now()`/`Math.random()` directly in testable logic.
- **Fail-closed:** any resolution ambiguity, missing binding, or store error resolves to `null`/deny — never fail-open.
- **No-MVP (Law 3):** the *port* is the full extensible matrix; only the `local` adapter is implemented here. `scim`/`oidc-claims`/`csv` are Plan-B/C seams — do NOT stub them silently; they simply do not exist yet in this plan.
- **Tenant id format:** `^[a-z0-9][a-z0-9-]{0,62}$` (`src/core/tenant-context.ts:12`) — reuse `isValidTenantId`.

---

### Task 1: `principalCan()` — wildcard-aware resource:action check in rbac.ts

**Files:**
- Modify: `src/core/rbac.ts` (append after `enforceRbac`, ~line 129)
- Test: `tests/core/principal-can.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `principalCan(permissions: readonly string[], required: string): boolean` — `'*'` grants all; exact match grants; `'<res>:*'` grants any action on `<res>`; `'*:<act>'` grants `<act>` on any resource. Required token MUST be `resource:action` shaped.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/principal-can.test.ts
import { describe, it, expect } from 'vitest';
import { principalCan } from '../../src/core/rbac.js';

describe('principalCan', () => {
  it('grants everything with "*"', () => {
    expect(principalCan(['*'], 'order:write')).toBe(true);
  });
  it('grants exact match', () => {
    expect(principalCan(['order:read'], 'order:read')).toBe(true);
  });
  it('grants resource wildcard "<res>:*"', () => {
    expect(principalCan(['order:*'], 'order:write')).toBe(true);
  });
  it('grants action wildcard "*:<act>"', () => {
    expect(principalCan(['*:read'], 'invoice:read')).toBe(true);
  });
  it('denies when not granted', () => {
    expect(principalCan(['order:read'], 'order:write')).toBe(false);
  });
  it('denies on empty permission set (fail-closed)', () => {
    expect(principalCan([], 'order:read')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/principal-can.test.ts`
Expected: FAIL — `principalCan is not a function` (import resolves but symbol missing).

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/rbac.ts`:

```ts
// ─── Resource:action permission check (connector-surface RBAC) ────
// Principals carry a permission set of `resource:action` tokens (e.g. 'order:read'),
// resolved from a role-map (see connectors/identity/role-map.ts). Supports wildcards:
//   '*'        → all permissions
//   '<res>:*'  → any action on a resource
//   '*:<act>'  → an action on any resource
// Empty set denies (fail-closed). Used by the connector-surface tool-gate (ADR-092).
export function principalCan(permissions: readonly string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  const idx = required.indexOf(':');
  if (idx < 0) return false;
  const res = required.slice(0, idx);
  const act = required.slice(idx + 1);
  return permissions.includes(`${res}:*`) || permissions.includes(`*:${act}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/principal-can.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add src/core/rbac.ts tests/core/principal-can.test.ts
git commit -m "feat(rbac): principalCan — wildcard resource:action check for connector-surface RBAC"
```

---

### Task 2: Identity port types + role-map permission resolution

**Files:**
- Create: `src/connectors/identity/provider.ts` (types + port interface)
- Create: `src/connectors/identity/role-map.ts` (`resolvePermissions`)
- Test: `tests/connectors/identity/role-map.test.ts`

**Interfaces:**
- Consumes: `Role` from `../../core/rbac.js`; `ConnectorId` from `../types.js`.
- Produces:
  - `type Edition = 'solo' | 'team' | 'enterprise'`
  - `type ExternalRefKind = 'telegram-id' | 'discord-id' | 'phone' | 'email' | 'slack-id'`
  - `interface ExternalRef { connector: ConnectorId; externalId: string; kind: ExternalRefKind }`
  - `interface ResolvedPrincipal { userId: string; role: Role; permissions: string[]; tenantId: string; verified: boolean; source: string }`
  - `interface IdentityRecord { connector: ConnectorId; externalId: string; principalId: string; role: Role; tenantId: string; verified: boolean; method: string; updatedAt: string }`
  - `interface IdentityBundle { version: 1; records: IdentityRecord[] }`
  - `interface SyncReport { upserted: number; removed: number }`
  - `interface IdentityDirectoryProvider { readonly id: string; readonly edition: Edition; resolve(ref: ExternalRef, tenantId: string): ResolvedPrincipal | null; sync?(): Promise<SyncReport>; exportBundle?(): IdentityBundle; importBundle?(b: IdentityBundle): void }`
  - `interface RoleMapEntry { role: Role; permissions?: string[] }`, `type RoleMap = Record<string, RoleMapEntry>`
  - `const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]>`
  - `resolvePermissions(role: Role, roleMap?: RoleMap, groupKey?: string): string[]`

- [ ] **Step 1: Create the port/types file (no test — compile-checked by Task 2's test importing it)**

```ts
// src/connectors/identity/provider.ts
import type { Role } from '../../core/rbac.js';
import type { ConnectorId } from '../types.js';

export type Edition = 'solo' | 'team' | 'enterprise';
export type ExternalRefKind = 'telegram-id' | 'discord-id' | 'phone' | 'email' | 'slack-id';

/** A messaging-platform identity to resolve. Keyed on the immutable platform handle. */
export interface ExternalRef {
  connector: ConnectorId;
  externalId: string;
  kind: ExternalRefKind;
}

/** A sender resolved to a tenant-scoped RBAC principal. */
export interface ResolvedPrincipal {
  userId: string;
  role: Role;
  permissions: string[];   // 'resource:action' tokens — checked via principalCan()
  tenantId: string;
  verified: boolean;
  source: string;          // which provider resolved it (audit)
}

/** A persisted social-identity ↔ principal binding. */
export interface IdentityRecord {
  connector: ConnectorId;
  externalId: string;
  principalId: string;
  role: Role;
  tenantId: string;
  verified: boolean;
  method: string;          // 'owner' | 'otp' | 'oidc' | 'directory' | 'guest'
  updatedAt: string;       // ISO 8601
}

/** Portable export/import payload (audit, migration, cross-tenant copy). */
export interface IdentityBundle {
  version: 1;
  records: IdentityRecord[];
}

export interface SyncReport { upserted: number; removed: number }

/**
 * Pluggable directory port. Faz-1 adapter: `local`. Faz-3 adapters
 * (`scim`, `oidc-claims`) implement sync()/import to pull roles from an IdP.
 * resolve() is the HOT PATH — it MUST be pure-local (no network).
 */
export interface IdentityDirectoryProvider {
  readonly id: string;
  readonly edition: Edition;
  resolve(ref: ExternalRef, tenantId: string): ResolvedPrincipal | null;
  sync?(): Promise<SyncReport>;
  exportBundle?(): IdentityBundle;
  importBundle?(b: IdentityBundle): void;
}
```

- [ ] **Step 2: Write the failing test for role-map**

```ts
// tests/connectors/identity/role-map.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePermissions, DEFAULT_ROLE_PERMISSIONS } from '../../../src/connectors/identity/role-map.js';

describe('resolvePermissions', () => {
  it('falls back to built-in defaults when no role-map', () => {
    expect(resolvePermissions('admin')).toEqual(['*']);
    expect(resolvePermissions('operator')).toEqual(['*:read', '*:write']);
    expect(resolvePermissions('viewer')).toEqual(['*:read']);
  });
  it('uses role-map entry by role key', () => {
    const rm = { operator: { role: 'operator' as const, permissions: ['order:read', 'order:write'] } };
    expect(resolvePermissions('operator', rm)).toEqual(['order:read', 'order:write']);
  });
  it('prefers explicit groupKey entry over role entry', () => {
    const rm = {
      operator: { role: 'operator' as const, permissions: ['*:read'] },
      'Sales-Ops': { role: 'operator' as const, permissions: ['order:read', 'order:write'] },
    };
    expect(resolvePermissions('operator', rm, 'Sales-Ops')).toEqual(['order:read', 'order:write']);
  });
  it('DEFAULT_ROLE_PERMISSIONS covers all three roles', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(['admin', 'operator', 'viewer']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/connectors/identity/role-map.test.ts`
Expected: FAIL — cannot find module `role-map.js`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/connectors/identity/role-map.ts
import type { Role } from '../../core/rbac.js';

export interface RoleMapEntry { role: Role; permissions?: string[] }
export type RoleMap = Record<string, RoleMapEntry>;

/**
 * Built-in permission baselines per role (used when role-map provides no explicit set).
 * admin → all; operator → read+write on any resource; viewer → read on any resource.
 * Config role-map narrows these to specific resources (e.g. operator → only order:*).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ['*'],
  operator: ['*:read', '*:write'],
  viewer: ['*:read'],
};

/**
 * Resolve a principal's `resource:action` permission set.
 * Precedence: roleMap[groupKey].permissions → roleMap[role].permissions → built-in default.
 * groupKey carries an external directory group (e.g. an Entra group) when present.
 */
export function resolvePermissions(role: Role, roleMap?: RoleMap, groupKey?: string): string[] {
  if (groupKey && roleMap?.[groupKey]?.permissions) return roleMap[groupKey]!.permissions!;
  if (roleMap?.[role]?.permissions) return roleMap[role]!.permissions!;
  return DEFAULT_ROLE_PERMISSIONS[role];
}
```

- [ ] **Step 5: Run test to verify it passes + typecheck**

Run: `npx vitest run tests/connectors/identity/role-map.test.ts && npm run lint`
Expected: PASS (4 passed); `tsc --noEmit` clean (proves `provider.ts` types compile).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/identity/provider.ts src/connectors/identity/role-map.ts tests/connectors/identity/role-map.test.ts
git commit -m "feat(identity): provider port types + role-map permission resolution"
```

---

### Task 3: IdentityStore — better-sqlite3 persistence + cache

**Files:**
- Create: `src/connectors/identity/identity-store.ts`
- Test: `tests/connectors/identity/identity-store.test.ts`

**Interfaces:**
- Consumes: `IdentityRecord`, `IdentityBundle` from `../provider.js`; `ConnectorId` from `../../types.js`.
- Produces: class `IdentityStore`:
  - `constructor(dbPath: string)`
  - `upsertIdentity(rec: IdentityRecord): void`
  - `getIdentity(connector: ConnectorId, externalId: string, tenantId: string): IdentityRecord | null`
  - `deleteIdentity(connector: ConnectorId, externalId: string, tenantId: string): void`
  - `exportBundle(): IdentityBundle`
  - `importBundle(b: IdentityBundle): void`
  - `putPendingVerify(p: { connector: ConnectorId; externalId: string; code: string; email: string; tenantId: string; expiresAt: number }): void`
  - `getPendingVerify(connector: ConnectorId, externalId: string): { code: string; email: string; tenantId: string; expiresAt: number; attempts: number } | null`
  - `bumpVerifyAttempts(connector: ConnectorId, externalId: string): void`
  - `deletePendingVerify(connector: ConnectorId, externalId: string): void`
  - `close(): void`

- [ ] **Step 1: Write the failing test**

```ts
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
  it('stores and reads a pending-verify with attempts', () => {
    store.putPendingVerify({ connector: 'telegram', externalId: '77', code: '123456', email: 'a@b.c', tenantId: 'firmax', expiresAt: 999 });
    store.bumpVerifyAttempts('telegram', '77');
    const p = store.getPendingVerify('telegram', '77');
    expect(p).toEqual({ code: '123456', email: 'a@b.c', tenantId: 'firmax', expiresAt: 999, attempts: 1 });
    store.deletePendingVerify('telegram', '77');
    expect(store.getPendingVerify('telegram', '77')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/identity/identity-store.test.ts`
Expected: FAIL — cannot find module `identity-store.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/connectors/identity/identity-store.ts
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ConnectorId } from '../types.js';
import type { IdentityRecord, IdentityBundle } from './provider.js';

interface PendingVerify { code: string; email: string; tenantId: string; expiresAt: number; attempts: number }

/**
 * SQLite-backed social-identity store with a read-through in-memory cache.
 * resolve() hot-path reads go through the cache; writes invalidate it.
 * One file per project under .deckent/ (path injected — never hardcoded).
 */
export class IdentityStore {
  private readonly db: DatabaseType;
  private readonly cache = new Map<string, IdentityRecord | null>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS social_identity (
        connector TEXT NOT NULL, external_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
        principal_id TEXT NOT NULL, role TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (connector, external_id, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS pending_verify (
        connector TEXT NOT NULL, external_id TEXT NOT NULL,
        code TEXT NOT NULL, email TEXT NOT NULL, tenant_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (connector, external_id)
      );
    `);
  }

  private key(c: string, e: string, t: string): string { return `${c} ${e} ${t}`; }

  upsertIdentity(rec: IdentityRecord): void {
    this.db.prepare(`
      INSERT INTO social_identity (connector, external_id, tenant_id, principal_id, role, verified, method, updated_at)
      VALUES (@connector, @externalId, @tenantId, @principalId, @role, @verified, @method, @updatedAt)
      ON CONFLICT(connector, external_id, tenant_id) DO UPDATE SET
        principal_id=@principalId, role=@role, verified=@verified, method=@method, updated_at=@updatedAt
    `).run({ ...rec, verified: rec.verified ? 1 : 0 });
    this.cache.delete(this.key(rec.connector, rec.externalId, rec.tenantId));
  }

  getIdentity(connector: ConnectorId, externalId: string, tenantId: string): IdentityRecord | null {
    const k = this.key(connector, externalId, tenantId);
    const cached = this.cache.get(k);
    if (cached !== undefined) return cached;
    const row = this.db.prepare(`
      SELECT connector, external_id, tenant_id, principal_id, role, verified, method, updated_at
      FROM social_identity WHERE connector=? AND external_id=? AND tenant_id=?
    `).get(connector, externalId, tenantId) as Record<string, unknown> | undefined;
    const rec = row ? {
      connector: row['connector'] as ConnectorId, externalId: row['external_id'] as string,
      tenantId: row['tenant_id'] as string, principalId: row['principal_id'] as string,
      role: row['role'] as IdentityRecord['role'], verified: !!(row['verified'] as number),
      method: row['method'] as string, updatedAt: row['updated_at'] as string,
    } : null;
    this.cache.set(k, rec);
    return rec;
  }

  deleteIdentity(connector: ConnectorId, externalId: string, tenantId: string): void {
    this.db.prepare(`DELETE FROM social_identity WHERE connector=? AND external_id=? AND tenant_id=?`).run(connector, externalId, tenantId);
    this.cache.delete(this.key(connector, externalId, tenantId));
  }

  exportBundle(): IdentityBundle {
    const rows = this.db.prepare(`SELECT connector, external_id, tenant_id, principal_id, role, verified, method, updated_at FROM social_identity`).all() as Record<string, unknown>[];
    return {
      version: 1,
      records: rows.map((row) => ({
        connector: row['connector'] as ConnectorId, externalId: row['external_id'] as string,
        tenantId: row['tenant_id'] as string, principalId: row['principal_id'] as string,
        role: row['role'] as IdentityRecord['role'], verified: !!(row['verified'] as number),
        method: row['method'] as string, updatedAt: row['updated_at'] as string,
      })),
    };
  }

  importBundle(b: IdentityBundle): void {
    const tx = this.db.transaction((records: IdentityRecord[]) => {
      for (const rec of records) this.upsertIdentity(rec);
    });
    tx(b.records);
  }

  putPendingVerify(p: { connector: ConnectorId; externalId: string; code: string; email: string; tenantId: string; expiresAt: number }): void {
    this.db.prepare(`
      INSERT INTO pending_verify (connector, external_id, code, email, tenant_id, expires_at, attempts)
      VALUES (@connector, @externalId, @code, @email, @tenantId, @expiresAt, 0)
      ON CONFLICT(connector, external_id) DO UPDATE SET code=@code, email=@email, tenant_id=@tenantId, expires_at=@expiresAt, attempts=0
    `).run(p);
  }

  getPendingVerify(connector: ConnectorId, externalId: string): PendingVerify | null {
    const row = this.db.prepare(`SELECT code, email, tenant_id, expires_at, attempts FROM pending_verify WHERE connector=? AND external_id=?`).get(connector, externalId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { code: row['code'] as string, email: row['email'] as string, tenantId: row['tenant_id'] as string, expiresAt: row['expires_at'] as number, attempts: row['attempts'] as number };
  }

  bumpVerifyAttempts(connector: ConnectorId, externalId: string): void {
    this.db.prepare(`UPDATE pending_verify SET attempts = attempts + 1 WHERE connector=? AND external_id=?`).run(connector, externalId);
  }

  deletePendingVerify(connector: ConnectorId, externalId: string): void {
    this.db.prepare(`DELETE FROM pending_verify WHERE connector=? AND external_id=?`).run(connector, externalId);
  }

  close(): void { this.db.close(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/identity/identity-store.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/identity/identity-store.ts tests/connectors/identity/identity-store.test.ts
git commit -m "feat(identity): IdentityStore — better-sqlite3 persistence + read-through cache + pending-verify"
```

---

### Task 4: LocalIdentityProvider + provider factory

**Files:**
- Create: `src/connectors/identity/providers/local.ts`
- Create: `src/connectors/identity/index.ts` (factory)
- Test: `tests/connectors/identity/local-provider.test.ts`

**Interfaces:**
- Consumes: `IdentityStore` (Task 3); `IdentityDirectoryProvider`, `ExternalRef`, `ResolvedPrincipal`, `Edition` from `../provider.js`; `resolvePermissions`, `RoleMap` from `../role-map.js`.
- Produces:
  - `interface LocalProviderOptions { edition: Edition; roleMap?: RoleMap; owner?: { connector: ConnectorId; externalId: string; tenantId: string } }`
  - `class LocalIdentityProvider implements IdentityDirectoryProvider` (`id='local'`)
  - `createIdentityProvider(opts: { kind: 'local'; store: IdentityStore; local: LocalProviderOptions }): IdentityDirectoryProvider` — factory; throws `DeckentError('E_UNKNOWN_IDENTITY_PROVIDER', …)` for any non-`local` kind in Faz 1.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/identity/local-provider.test.ts`
Expected: FAIL — cannot find module `index.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/connectors/identity/providers/local.ts
import type { ConnectorId } from '../../types.js';
import type { IdentityStore } from '../identity-store.js';
import type { Edition, ExternalRef, IdentityBundle, IdentityDirectoryProvider, ResolvedPrincipal } from '../provider.js';
import { resolvePermissions, type RoleMap } from '../role-map.js';

export interface LocalProviderOptions {
  edition: Edition;
  roleMap?: RoleMap;
  /** Solo owner shortcut — always resolves to admin in its tenant, no store record needed. */
  owner?: { connector: ConnectorId; externalId: string; tenantId: string };
}

/** Faz-1 adapter: resolves senders from the local IdentityStore (+ solo owner shortcut). */
export class LocalIdentityProvider implements IdentityDirectoryProvider {
  readonly id = 'local';
  readonly edition: Edition;
  constructor(private readonly store: IdentityStore, private readonly opts: LocalProviderOptions) {
    this.edition = opts.edition;
  }

  resolve(ref: ExternalRef, tenantId: string): ResolvedPrincipal | null {
    const owner = this.opts.owner;
    if (owner && owner.connector === ref.connector && owner.externalId === ref.externalId && owner.tenantId === tenantId) {
      return { userId: owner.externalId, role: 'admin', permissions: resolvePermissions('admin', this.opts.roleMap), tenantId, verified: true, source: 'local' };
    }
    const rec = this.store.getIdentity(ref.connector, ref.externalId, tenantId);
    if (!rec) return null; // fail-closed
    return {
      userId: rec.principalId, role: rec.role,
      permissions: resolvePermissions(rec.role, this.opts.roleMap),
      tenantId: rec.tenantId, verified: rec.verified, source: 'local',
    };
  }

  exportBundle(): IdentityBundle { return this.store.exportBundle(); }
  importBundle(b: IdentityBundle): void { this.store.importBundle(b); }
}
```

```ts
// src/connectors/identity/index.ts
import { DeckentError } from '../../core/errors.js';
import type { IdentityStore } from './identity-store.js';
import type { IdentityDirectoryProvider } from './provider.js';
import { LocalIdentityProvider, type LocalProviderOptions } from './providers/local.js';

export { LocalIdentityProvider } from './providers/local.js';
export type { LocalProviderOptions } from './providers/local.js';
export * from './provider.js';

export interface CreateProviderOptions {
  kind: 'local';               // Faz-1: only 'local'. 'csv'|'scim'|'oidc-claims' are Plan-B/C.
  store: IdentityStore;
  local: LocalProviderOptions;
}

/**
 * Build the configured identity provider. Faz 1 supports only `local`; any other
 * kind throws honestly (never a silent stub) — Law 3 phasing seam.
 */
export function createIdentityProvider(opts: CreateProviderOptions): IdentityDirectoryProvider {
  if (opts.kind === 'local') return new LocalIdentityProvider(opts.store, opts.local);
  throw new DeckentError('E_UNKNOWN_IDENTITY_PROVIDER', `Identity provider "${(opts as { kind: string }).kind}" is not available in this build (Faz 1: local only)`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/identity/local-provider.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/identity/providers/local.ts src/connectors/identity/index.ts tests/connectors/identity/local-provider.test.ts
git commit -m "feat(identity): LocalIdentityProvider + provider factory (Faz-1 local adapter)"
```

---

### Task 5: principal-resolver — tenant-scoped resolution + guest + fail-closed

**Files:**
- Create: `src/connectors/identity/principal-resolver.ts`
- Test: `tests/connectors/identity/principal-resolver.test.ts`

**Interfaces:**
- Consumes: `withTenant` from `../../core/tenant-context.js`; `IdentityDirectoryProvider`, `ExternalRef`, `ExternalRefKind`, `ResolvedPrincipal` from `./provider.js`; `resolvePermissions`, `RoleMap` from `./role-map.js`; `ConnectorId`, `Role`.
- Produces:
  - `interface ChannelBinding { tenantId: string; projectPath: string; mode: 'tenant-locked' | 'per-user'; guestRole?: Role }`
  - `refKindFor(connector: ConnectorId): ExternalRefKind`
  - `resolvePrincipal(input: { connector: ConnectorId; fromUser: string }, binding: ChannelBinding, provider: IdentityDirectoryProvider, projectRoot: string, roleMap?: RoleMap): ResolvedPrincipal | null` — runs inside `withTenant(binding.tenantId)`. Returns the resolved principal; falls back to a guest principal when `binding.guestRole` is set and the sender is unknown; otherwise `null` (unknown → caller drives verify/silent).

- [ ] **Step 1: Write the failing test**

```ts
// tests/connectors/identity/principal-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePrincipal, refKindFor, type ChannelBinding } from '../../../src/connectors/identity/principal-resolver.js';
import type { IdentityDirectoryProvider, ResolvedPrincipal } from '../../../src/connectors/identity/provider.js';

function fakeProvider(map: Record<string, ResolvedPrincipal>): IdentityDirectoryProvider {
  return { id: 'fake', edition: 'team', resolve: (ref, tenantId) => map[`${ref.externalId}:${tenantId}`] ?? null };
}
const binding: ChannelBinding = { tenantId: 'firmax', projectPath: '/p', mode: 'tenant-locked' };

describe('refKindFor', () => {
  it('maps connectors to their native ref kind', () => {
    expect(refKindFor('telegram')).toBe('telegram-id');
    expect(refKindFor('whatsapp')).toBe('phone');
    expect(refKindFor('slack')).toBe('email');
    expect(refKindFor('discord')).toBe('discord-id');
    expect(refKindFor('email')).toBe('email');
  });
});

describe('resolvePrincipal', () => {
  const ali: ResolvedPrincipal = { userId: 'ali', role: 'operator', permissions: ['order:read'], tenantId: 'firmax', verified: true, source: 'fake' };
  it('resolves a known sender within the binding tenant', () => {
    const p = fakeProvider({ '55:firmax': ali });
    expect(resolvePrincipal({ connector: 'telegram', fromUser: '55' }, binding, p, '/root')).toEqual(ali);
  });
  it('returns null for an unknown sender with no guest role (fail-closed)', () => {
    const p = fakeProvider({});
    expect(resolvePrincipal({ connector: 'telegram', fromUser: '999' }, binding, p, '/root')).toBeNull();
  });
  it('returns a guest principal when binding.guestRole is set', () => {
    const p = fakeProvider({});
    const guestBinding: ChannelBinding = { ...binding, guestRole: 'viewer' };
    const r = resolvePrincipal({ connector: 'telegram', fromUser: '999' }, guestBinding, p, '/root');
    expect(r).toMatchObject({ role: 'viewer', tenantId: 'firmax', verified: false, source: 'guest', permissions: ['*:read'] });
    expect(r?.userId).toContain('guest');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/identity/principal-resolver.test.ts`
Expected: FAIL — cannot find module `principal-resolver.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/connectors/identity/principal-resolver.ts
import { withTenant } from '../../core/tenant-context.js';
import type { Role } from '../../core/rbac.js';
import type { ConnectorId } from '../types.js';
import type { ExternalRef, ExternalRefKind, IdentityDirectoryProvider, ResolvedPrincipal } from './provider.js';
import { resolvePermissions, type RoleMap } from './role-map.js';

export interface ChannelBinding {
  tenantId: string;
  projectPath: string;
  mode: 'tenant-locked' | 'per-user';
  guestRole?: Role;
}

const REF_KIND: Record<ConnectorId, ExternalRefKind> = {
  telegram: 'telegram-id',
  discord: 'discord-id',
  whatsapp: 'phone',
  slack: 'email',
  email: 'email',
};

/** Map a connector to the platform-native identity key it carries. */
export function refKindFor(connector: ConnectorId): ExternalRefKind {
  return REF_KIND[connector];
}

/**
 * Resolve an inbound sender to a tenant-scoped principal, inside the binding's tenant scope.
 * Unknown sender → guest principal (if binding allows) else null (fail-closed; caller drives verify/silent).
 */
export function resolvePrincipal(
  input: { connector: ConnectorId; fromUser: string },
  binding: ChannelBinding,
  provider: IdentityDirectoryProvider,
  projectRoot: string,
  roleMap?: RoleMap,
): ResolvedPrincipal | null {
  return withTenant(binding.tenantId, projectRoot, () => {
    const ref: ExternalRef = { connector: input.connector, externalId: input.fromUser, kind: refKindFor(input.connector) };
    const resolved = provider.resolve(ref, binding.tenantId);
    if (resolved) return resolved;
    if (binding.guestRole) {
      return {
        userId: `guest:${input.connector}:${input.fromUser}`,
        role: binding.guestRole,
        permissions: resolvePermissions(binding.guestRole, roleMap),
        tenantId: binding.tenantId,
        verified: false,
        source: 'guest',
      };
    }
    return null;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/identity/principal-resolver.test.ts`
Expected: PASS (refKindFor 1 + resolvePrincipal 3 = 4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/identity/principal-resolver.ts tests/connectors/identity/principal-resolver.test.ts
git commit -m "feat(identity): principal-resolver — tenant-scoped resolution + guest fallback + fail-closed"
```

---

### Task 6: verify-bind — OTP start/confirm with TTL + rate-limit

**Files:**
- Create: `src/connectors/identity/verify-bind.ts`
- Test: `tests/connectors/identity/verify-bind.test.ts`

**Interfaces:**
- Consumes: `IdentityStore` (Task 3); `Role`, `ConnectorId`, `ResolvedPrincipal`, `resolvePermissions`.
- Produces:
  - `interface VerifyDeps { store: IdentityStore; now: () => number; genCode: () => string; ttlSec: number; maxAttempts: number; roleMap?: RoleMap }`
  - `type StartResult = { ok: true; code: string } | { ok: false; reason: 'invalid-email' }`
  - `type ConfirmResult = { ok: true; principal: ResolvedPrincipal } | { ok: false; reason: 'none-pending' | 'expired' | 'too-many' | 'wrong-code' }`
  - `startVerify(deps, ref: { connector: ConnectorId; externalId: string }, email: string, tenantId: string): StartResult`
  - `confirmVerify(deps, ref: { connector: ConnectorId; externalId: string }, code: string, binding: { principalId: string; role: Role; tenantId: string }): ConfirmResult` — on success upserts a `verified` identity and clears the pending row.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/identity/verify-bind.test.ts`
Expected: FAIL — cannot find module `verify-bind.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/connectors/identity/verify-bind.ts
import type { ConnectorId } from '../types.js';
import type { Role } from '../../core/rbac.js';
import type { IdentityStore } from './identity-store.js';
import type { ResolvedPrincipal } from './provider.js';
import { resolvePermissions, type RoleMap } from './role-map.js';

export interface VerifyDeps {
  store: IdentityStore;
  now: () => number;        // injected clock (ms) — never Date.now() directly (determinism)
  genCode: () => string;    // injected code generator — never Math.random() directly
  ttlSec: number;
  maxAttempts: number;
  roleMap?: RoleMap;
}

export type StartResult = { ok: true; code: string } | { ok: false; reason: 'invalid-email' };
export type ConfirmResult =
  | { ok: true; principal: ResolvedPrincipal }
  | { ok: false; reason: 'none-pending' | 'expired' | 'too-many' | 'wrong-code' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Begin an OTP verification: store a pending row with code + TTL. */
export function startVerify(
  deps: VerifyDeps,
  ref: { connector: ConnectorId; externalId: string },
  email: string,
  tenantId: string,
): StartResult {
  if (!EMAIL_RE.test(email)) return { ok: false, reason: 'invalid-email' };
  const code = deps.genCode();
  deps.store.putPendingVerify({ connector: ref.connector, externalId: ref.externalId, code, email, tenantId, expiresAt: deps.now() + deps.ttlSec * 1000 });
  return { ok: true, code };
}

/** Confirm an OTP: on match, upsert a verified identity and clear the pending row. */
export function confirmVerify(
  deps: VerifyDeps,
  ref: { connector: ConnectorId; externalId: string },
  code: string,
  binding: { principalId: string; role: Role; tenantId: string },
): ConfirmResult {
  const pending = deps.store.getPendingVerify(ref.connector, ref.externalId);
  if (!pending) return { ok: false, reason: 'none-pending' };
  if (deps.now() > pending.expiresAt) { deps.store.deletePendingVerify(ref.connector, ref.externalId); return { ok: false, reason: 'expired' }; }
  if (pending.attempts >= deps.maxAttempts) { deps.store.deletePendingVerify(ref.connector, ref.externalId); return { ok: false, reason: 'too-many' }; }
  if (pending.code !== code) {
    deps.store.bumpVerifyAttempts(ref.connector, ref.externalId);
    if (pending.attempts + 1 >= deps.maxAttempts) { deps.store.deletePendingVerify(ref.connector, ref.externalId); return { ok: false, reason: 'too-many' }; }
    return { ok: false, reason: 'wrong-code' };
  }
  deps.store.upsertIdentity({
    connector: ref.connector, externalId: ref.externalId, tenantId: binding.tenantId,
    principalId: binding.principalId, role: binding.role, verified: true, method: 'otp',
    updatedAt: new Date(deps.now()).toISOString(),
  });
  deps.store.deletePendingVerify(ref.connector, ref.externalId);
  return {
    ok: true,
    principal: { userId: binding.principalId, role: binding.role, permissions: resolvePermissions(binding.role, deps.roleMap), tenantId: binding.tenantId, verified: true, source: 'otp' },
  };
}
```

> **Note on the lockout test:** after 2 wrong attempts `attempts` in the store is 2; the 3rd `confirmVerify` reads `pending.attempts = 2`, and since `2 >= maxAttempts(3)` is false it proceeds, mismatches, bumps to 3, then `3 >= 3` deletes and returns `too-many`. This matches the test's three-call sequence (wrong-code, wrong-code, too-many).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/identity/verify-bind.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Run the full identity suite + typecheck + hermetic sim**

Run: `npx vitest run tests/connectors/identity tests/core/principal-can.test.ts && npm run lint && npm run test:ci-sim`
Expected: all PASS; `tsc --noEmit` clean; ci-sim green (proves hermeticity).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/identity/verify-bind.ts tests/connectors/identity/verify-bind.test.ts
git commit -m "feat(identity): verify-bind — OTP start/confirm with TTL + rate-limit (injected clock/code)"
```

---

## Self-Review

**Spec coverage (against `2026-06-26-social-identity-rbac-design.md`):**
- §1 karar-2 (rol + `resource:action`) → Task 1 (`principalCan`) + Task 2 (`role-map`). ✅
- §3 pluggable provider port → Task 2 (`provider.ts`) + Task 4 (factory, `local` adapter, honest throw for other kinds). ✅
- §3.2 hot-path local → Task 3 (read-through cache) + Task 4 (`resolve` pure-local). ✅
- §3.5 multi-key externalId → Task 5 (`refKindFor`). ✅
- §4.1 modül planı (provider/store/resolver/role-map/verify-bind/local/index) → Tasks 2-6. ✅
- §3.4 solo-dev + guest → Task 4 (owner shortcut) + Task 5 (guest fallback). ✅
- §5.4 fail-closed → Task 4 (null on miss) + Task 5 (null without guest). ✅
- §5.3 verify-bind OTP (TTL, rate-limit) → Task 6. ✅
- **Deferred to Plan B (explicitly NOT in this plan):** TurnContext + router per-user gate + connector-bootstrap onChat rewire (§4.2) · capability L2 tool-gate (§7.1) · config schema `identity?` (§6) · audit emit on the surface (§5.5) · ADR-092 (§5.6) · channel-binding store in gateway-access (§4.2) · i18n strings (`rbac.unauthorized` etc.) · Tier-1 real-binary smoke (§8). These require a running connector and are the wiring subsystem.

**Placeholder scan:** none — every step has runnable code/commands. ✅

**Type consistency:** `IdentityRecord`/`ResolvedPrincipal`/`ExternalRef` defined in Task 2 are imported unchanged in Tasks 3-6; `IdentityStore` method signatures in Task 3 match call sites in Tasks 4 & 6; `ChannelBinding` defined in Task 5; `refKindFor` name consistent. ✅

---

## Execution Handoff

This is **Plan A (Faz 1a — engine)**. **Plan B (Faz 1b — connector wiring)** follows after this lands and is reviewed: TurnContext, per-user router gate, `connector-bootstrap` onChat rewire, capability L2 tool-gate (`principalCan` at execution), `identity?` config schema, surface audit + i18n strings, ADR-092 (fail-closed, written to `docs/adr/092-*.md` + `.brain/memory.db`), and the Tier-1 real-binary Telegram smoke (`Smoke:` directive).
