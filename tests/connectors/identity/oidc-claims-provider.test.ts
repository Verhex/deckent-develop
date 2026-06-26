// tests/connectors/identity/oidc-claims-provider.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore } from '../../../src/connectors/identity/identity-store.js';
import {
  OidcClaimsIdentityProvider,
  principalFromClaims,
  type OidcClaimsConfig,
  type OidcClaimsProviderOptions,
} from '../../../src/connectors/identity/providers/oidc-claims.js';
import type { RoleMap } from '../../../src/connectors/identity/role-map.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT = 'acme-corp';

/**
 * Entra v2.0-style role map: groups are GUIDs, mapped to deckent roles.
 * Operator entry has explicit permissions to verify resolvePermissions pass-through.
 */
const ENTRA_ROLE_MAP: RoleMap = {
  'aaaaaa-admins': { role: 'admin' },
  'bbbbbb-ops': { role: 'operator', permissions: ['sprint:read', 'sprint:write'] },
  'cccccc-viewers': { role: 'viewer' },
};

/**
 * Okta-style role map: groups are human-readable names.
 */
const OKTA_ROLE_MAP: RoleMap = {
  'Platform Admins': { role: 'admin' },
  'Dev Operators': { role: 'operator' },
  Viewers: { role: 'viewer' },
};

/** Minimal Entra v2.0 ID-token claim-set. */
function entraClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'ali@firmax.io',
    tid: TENANT,
    groups: ['bbbbbb-ops'],
    ...overrides,
  };
}

/** Minimal Okta ID-token claim-set (no `tid` — tenant comes from tenantFallback). */
function oktaClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'veli@firmax.io',
    groups: ['Dev Operators'],
    ...overrides,
  };
}

const ENTRA_CFG: OidcClaimsConfig = {}; // all defaults match Entra v2.0

const OKTA_CFG: OidcClaimsConfig = {
  groupsClaim: 'groups', // same as default, just explicit
};

// ── principalFromClaims — Entra v2.0 ─────────────────────────────────────────

describe('principalFromClaims — Entra v2.0 claims', () => {
  it('maps operator group to operator role with explicit permissions', () => {
    const result = principalFromClaims(entraClaims(), ENTRA_CFG, ENTRA_ROLE_MAP);
    expect(result).toMatchObject({
      userId: 'ali@firmax.io',
      role: 'operator',
      tenantId: TENANT,
      verified: true,
      source: 'oidc-claims',
      permissions: ['sprint:read', 'sprint:write'],
    });
  });

  it('maps admin group to admin role', () => {
    const result = principalFromClaims(entraClaims({ groups: ['aaaaaa-admins'] }), ENTRA_CFG, ENTRA_ROLE_MAP);
    expect(result?.role).toBe('admin');
  });

  it('maps viewer group to viewer role', () => {
    const result = principalFromClaims(entraClaims({ groups: ['cccccc-viewers'] }), ENTRA_CFG, ENTRA_ROLE_MAP);
    expect(result?.role).toBe('viewer');
  });

  it('uses tid claim as tenantId', () => {
    const result = principalFromClaims(entraClaims({ tid: 'custom-tenant' }), ENTRA_CFG, ENTRA_ROLE_MAP);
    expect(result?.tenantId).toBe('custom-tenant');
  });
});

// ── principalFromClaims — Okta claims ────────────────────────────────────────

describe('principalFromClaims — Okta-style claims', () => {
  it('maps operator group via tenantFallback (no tid claim)', () => {
    const result = principalFromClaims(oktaClaims(), OKTA_CFG, OKTA_ROLE_MAP, TENANT);
    expect(result).toMatchObject({
      userId: 'veli@firmax.io',
      role: 'operator',
      tenantId: TENANT,
      verified: true,
      source: 'oidc-claims',
    });
  });

  it('maps admin group correctly', () => {
    const result = principalFromClaims(oktaClaims({ groups: ['Platform Admins'] }), OKTA_CFG, OKTA_ROLE_MAP, TENANT);
    expect(result?.role).toBe('admin');
  });
});

// ── principalFromClaims — highest-privilege wins ──────────────────────────────

describe('principalFromClaims — multiple groups', () => {
  it('picks the highest-privilege role when a user is in multiple mapped groups', () => {
    const claims = entraClaims({ groups: ['cccccc-viewers', 'bbbbbb-ops', 'aaaaaa-admins'] });
    const result = principalFromClaims(claims, ENTRA_CFG, ENTRA_ROLE_MAP);
    expect(result?.role).toBe('admin'); // admin outranks operator outranks viewer
  });

  it('ignores unmapped groups and picks the best match from the rest', () => {
    const claims = entraClaims({ groups: ['unknown-guid', 'bbbbbb-ops', 'another-unknown'] });
    const result = principalFromClaims(claims, ENTRA_CFG, ENTRA_ROLE_MAP);
    expect(result?.role).toBe('operator');
  });
});

// ── principalFromClaims — fail-closed cases ───────────────────────────────────

describe('principalFromClaims — fail-closed', () => {
  it('returns null when email claim is missing', () => {
    const claims = entraClaims();
    delete claims['email'];
    expect(principalFromClaims(claims, ENTRA_CFG, ENTRA_ROLE_MAP)).toBeNull();
  });

  it('returns null when email is not a valid email string', () => {
    expect(principalFromClaims(entraClaims({ email: 'not-an-email' }), ENTRA_CFG, ENTRA_ROLE_MAP)).toBeNull();
    expect(principalFromClaims(entraClaims({ email: 42 }), ENTRA_CFG, ENTRA_ROLE_MAP)).toBeNull();
  });

  it('returns null when tenantId claim is absent and no tenantFallback provided', () => {
    const claims = entraClaims();
    delete claims['tid'];
    expect(principalFromClaims(claims, ENTRA_CFG, ENTRA_ROLE_MAP)).toBeNull();
  });

  it('returns null when groups claim is absent', () => {
    const claims = entraClaims();
    delete claims['groups'];
    expect(principalFromClaims(claims, ENTRA_CFG, ENTRA_ROLE_MAP)).toBeNull();
  });

  it('returns null when groups is an empty array', () => {
    expect(principalFromClaims(entraClaims({ groups: [] }), ENTRA_CFG, ENTRA_ROLE_MAP)).toBeNull();
  });

  it('returns null when no group matches the roleMap', () => {
    const claims = entraClaims({ groups: ['totally-unknown-guid', 'another-unknown-guid'] });
    expect(principalFromClaims(claims, ENTRA_CFG, ENTRA_ROLE_MAP)).toBeNull();
  });

  it('returns null when groups is not an array (scalar)', () => {
    expect(principalFromClaims(entraClaims({ groups: 'single-string' }), ENTRA_CFG, ENTRA_ROLE_MAP)).toBeNull();
  });

  it('returns null when roleMap is empty (no whitelist entries)', () => {
    expect(principalFromClaims(entraClaims(), ENTRA_CFG, {})).toBeNull();
  });
});

// ── principalFromClaims — roleClaim fallback ──────────────────────────────────

describe('principalFromClaims — roleClaim scalar fallback', () => {
  const ROLE_MAP_WITH_SCALAR: RoleMap = {
    AppAdmin: { role: 'admin' },
    AppOperator: { role: 'operator', permissions: ['flow:manage'] },
  };

  it('uses roleClaim when groupsClaim is absent', () => {
    const claims: Record<string, unknown> = { email: 'ali@firmax.io', tid: TENANT, roles: 'AppAdmin' };
    const result = principalFromClaims(claims, ENTRA_CFG, ROLE_MAP_WITH_SCALAR);
    expect(result?.role).toBe('admin');
    expect(result?.source).toBe('oidc-claims');
  });

  it('uses roleClaim when groups array has no matching entries', () => {
    const claims: Record<string, unknown> = {
      email: 'ali@firmax.io', tid: TENANT,
      groups: ['unknown-group'],
      roles: 'AppOperator',
    };
    const result = principalFromClaims(claims, ENTRA_CFG, ROLE_MAP_WITH_SCALAR);
    expect(result?.role).toBe('operator');
    expect(result?.permissions).toEqual(['flow:manage']);
  });

  it('uses groupsClaim result over roleClaim (groups take precedence)', () => {
    const claims: Record<string, unknown> = {
      email: 'ali@firmax.io', tid: TENANT,
      groups: ['AppAdmin'],    // admin via groupsClaim
      roles: 'AppOperator',   // operator via roleClaim — should NOT win
    };
    const result = principalFromClaims(claims, ENTRA_CFG, ROLE_MAP_WITH_SCALAR);
    expect(result?.role).toBe('admin');
  });

  it('returns null when roleClaim value is not in the roleMap (no raw role bypass)', () => {
    const claims: Record<string, unknown> = { email: 'ali@firmax.io', tid: TENANT, roles: 'admin' }; // 'admin' not a roleMap key
    expect(principalFromClaims(claims, ENTRA_CFG, ROLE_MAP_WITH_SCALAR)).toBeNull();
  });

  it('supports custom roleClaim key via OidcClaimsConfig', () => {
    const cfg: OidcClaimsConfig = { roleClaim: 'app_role' };
    const claims: Record<string, unknown> = { email: 'ali@firmax.io', tid: TENANT, app_role: 'AppAdmin' };
    const result = principalFromClaims(claims, cfg, ROLE_MAP_WITH_SCALAR);
    expect(result?.role).toBe('admin');
  });
});

// ── principalFromClaims — custom claim keys ───────────────────────────────────

describe('principalFromClaims — custom claim key config', () => {
  const CUSTOM_MAP: RoleMap = { eng: { role: 'operator' } };

  it('reads email from a custom emailClaim key', () => {
    const cfg: OidcClaimsConfig = { emailClaim: 'preferred_username', groupsClaim: 'grps', tenantClaim: 'tenant' };
    const claims: Record<string, unknown> = { preferred_username: 'vel@firmax.io', tenant: TENANT, grps: ['eng'] };
    const result = principalFromClaims(claims, cfg, CUSTOM_MAP);
    expect(result?.userId).toBe('vel@firmax.io');
    expect(result?.role).toBe('operator');
  });
});

// ── OidcClaimsIdentityProvider — resolve() ────────────────────────────────────

describe('OidcClaimsIdentityProvider', () => {
  let dir: string;
  let store: IdentityStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deckent-oidc-'));
    store = new IdentityStore(join(dir, 'identity.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function provider(over: Partial<OidcClaimsProviderOptions> = {}): OidcClaimsIdentityProvider {
    return new OidcClaimsIdentityProvider(store, {
      connector: 'email',
      roleMap: ENTRA_ROLE_MAP,
      ...over,
    });
  }

  it('exposes oidc-claims id and enterprise edition by default', () => {
    const p = provider();
    expect(p.id).toBe('oidc-claims');
    expect(p.edition).toBe('enterprise');
  });

  it('resolve() returns null for an unknown sender (fail-closed, no network)', () => {
    const p = provider();
    const result = p.resolve({ connector: 'email', externalId: 'nobody@firmax.io', kind: 'email' }, TENANT);
    expect(result).toBeNull();
  });

  it('resolve() returns the stored principal for a previously bound OIDC identity', () => {
    const p = provider();
    // Simulate what verify-bind OIDC callback does after calling principalFromClaims:
    store.upsertIdentity({
      connector: 'email',
      externalId: 'ali@firmax.io',
      tenantId: TENANT,
      principalId: 'ali@firmax.io',
      role: 'operator',
      verified: true,
      method: 'oidc',
      updatedAt: '2026-06-26T00:00:00.000Z',
    });

    const result = p.resolve({ connector: 'email', externalId: 'ali@firmax.io', kind: 'email' }, TENANT);
    expect(result).toMatchObject({
      userId: 'ali@firmax.io',
      role: 'operator',
      tenantId: TENANT,
      verified: true,
      source: 'oidc-claims',
      // resolve() calls resolvePermissions(role, roleMap) without a groupKey — falls through to
      // DEFAULT_ROLE_PERMISSIONS['operator'] = ['*:read', '*:write']
      permissions: ['*:read', '*:write'],
    });
  });

  it('resolve() is tenant-scoped — same externalId in a different tenant returns null', () => {
    const p = provider();
    store.upsertIdentity({
      connector: 'email',
      externalId: 'ali@firmax.io',
      tenantId: TENANT,
      principalId: 'ali@firmax.io',
      role: 'operator',
      verified: true,
      method: 'oidc',
      updatedAt: '2026-06-26T00:00:00.000Z',
    });

    // Different tenant — must return null
    expect(p.resolve({ connector: 'email', externalId: 'ali@firmax.io', kind: 'email' }, 'other-tenant')).toBeNull();
  });

  it('accepts a custom edition', () => {
    const p = provider({ edition: 'team' });
    expect(p.edition).toBe('team');
  });
});
