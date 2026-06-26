// src/connectors/identity/providers/oidc-claims.ts
import type { Role } from '../../../core/rbac.js';
import type { ConnectorId } from '../../types.js';
import type { IdentityStore } from '../identity-store.js';
import type {
  Edition,
  ExternalRef,
  IdentityDirectoryProvider,
  ResolvedPrincipal,
} from '../provider.js';
import { resolvePermissions, type RoleMap } from '../role-map.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_RANK: Record<Role, number> = { admin: 3, operator: 2, viewer: 1 };

/**
 * Claim-key configuration for `principalFromClaims`.
 * All keys default to their well-known JWT claim names (email / groups / tid / roles).
 */
export interface OidcClaimsConfig {
  /** Claim key for the user's email address. Default: `'email'`. */
  emailClaim?: string;
  /**
   * Claim key for a string-array of group identifiers (e.g. Entra `groups` GUIDs or
   * Okta group names). Default: `'groups'`. Each value is looked up in `roleMap` as a
   * `groupKey` — unrecognised entries are silently ignored.
   */
  groupsClaim?: string;
  /**
   * Claim key for a single role-string fallback, checked ONLY when `groupsClaim` yields
   * no roleMap match. Default: `'roles'`. The scalar value is also looked up in `roleMap`
   * (never accepted raw as a deckent Role — prevents privilege escalation).
   */
  roleClaim?: string;
  /** Claim key for the tenant ID. Default: `'tid'` (Entra v2.0 standard). */
  tenantClaim?: string;
}

export interface OidcClaimsProviderOptions {
  /** Connector these identities bind to. */
  connector: ConnectorId;
  edition?: Edition;
  /** Group → role / role → permission map used by both `principalFromClaims` and `resolve()`. */
  roleMap?: RoleMap;
  /** Claim-key overrides. Defaults match Entra v2.0 / OIDC standard names. */
  claims?: OidcClaimsConfig;
}

/**
 * Map a verified OIDC ID-token claim-set to a deckent `ResolvedPrincipal`.
 *
 * Pure function — no I/O, no network. Token-signature verification is the caller's
 * responsibility (verify-bind OIDC callback); this function only does claim → principal
 * mapping after the token is proven authentic.
 *
 * Fail-closed: returns `null` when any required claim is absent or when no group /
 * role claim matches a `roleMap` entry. There is no `defaultRole` — every accepted
 * principal must be explicitly whitelisted through the roleMap.
 *
 * @param claims     Raw JWT payload (already decoded, not yet trusted for role escalation).
 * @param cfg        Claim-key overrides (defaults: email/groups/tid/roles).
 * @param roleMap    Group-key → role + permissions whitelist.
 * @param tenantFallback  Used when the token carries no `tenantClaim` (e.g. Okta orgs).
 */
export function principalFromClaims(
  claims: Record<string, unknown>,
  cfg: OidcClaimsConfig,
  roleMap: RoleMap,
  tenantFallback?: string,
): ResolvedPrincipal | null {
  // 1. Email — required identity key
  const emailKey = cfg.emailClaim ?? 'email';
  const email = typeof claims[emailKey] === 'string' ? (claims[emailKey] as string) : null;
  if (!email || !EMAIL_RE.test(email)) return null;

  // 2. Tenant — claim-first, then explicit fallback; neither → fail-closed
  const tenantKey = cfg.tenantClaim ?? 'tid';
  const tenantIdRaw = typeof claims[tenantKey] === 'string' ? (claims[tenantKey] as string) : undefined;
  const tenantId = tenantIdRaw ?? tenantFallback;
  if (!tenantId) return null;

  // 3. Groups array — looked up in roleMap; highest-privilege entry wins
  const groupsKey = cfg.groupsClaim ?? 'groups';
  const rawGroups = claims[groupsKey];
  const groups: string[] = Array.isArray(rawGroups)
    ? rawGroups.filter((g): g is string => typeof g === 'string')
    : [];

  let bestRole: Role | null = null;
  let bestGroupKey: string | undefined;

  for (const group of groups) {
    const entry = roleMap[group];
    if (!entry) continue;
    if (bestRole === null || ROLE_RANK[entry.role] > ROLE_RANK[bestRole]) {
      bestRole = entry.role;
      bestGroupKey = group;
    }
  }

  // 4. roleClaim scalar fallback — only when groups yield no match
  if (bestRole === null) {
    const roleKey = cfg.roleClaim ?? 'roles';
    const roleClaimVal = typeof claims[roleKey] === 'string' ? (claims[roleKey] as string) : null;
    if (roleClaimVal !== null) {
      const entry = roleMap[roleClaimVal];
      if (entry) {
        bestRole = entry.role;
        bestGroupKey = roleClaimVal;
      }
    }
  }

  // 5. Fail-closed — no whitelisted mapping found
  if (bestRole === null) return null;

  return {
    userId: email,
    role: bestRole,
    permissions: resolvePermissions(bestRole, roleMap, bestGroupKey),
    tenantId,
    verified: true, // token was verified by the caller (verify-bind OIDC path)
    source: 'oidc-claims',
  };
}

/**
 * `IdentityDirectoryProvider` backed by the local `IdentityStore`.
 *
 * `resolve()` is the HOT PATH — pure-local store lookup, never network.
 * OIDC binding is event-driven: verify-bind calls `principalFromClaims()` and upserts
 * the result into the store with `method: 'oidc'`; subsequent inbound-message lookups
 * go through `resolve()`.
 *
 * No `sync()` — unlike SCIM, OIDC principals are bound per-login, not via bulk sync.
 */
export class OidcClaimsIdentityProvider implements IdentityDirectoryProvider {
  readonly id = 'oidc-claims';
  readonly edition: Edition;

  constructor(
    private readonly store: IdentityStore,
    private readonly opts: OidcClaimsProviderOptions,
  ) {
    this.edition = opts.edition ?? 'enterprise';
  }

  /** HOT PATH — pure-local store lookup, no network. Fail-closed: null if unknown. */
  resolve(ref: ExternalRef, tenantId: string): ResolvedPrincipal | null {
    const rec = this.store.getIdentity(ref.connector, ref.externalId, tenantId);
    if (!rec) return null;
    return {
      userId: rec.principalId,
      role: rec.role,
      permissions: resolvePermissions(rec.role, this.opts.roleMap),
      tenantId: rec.tenantId,
      verified: rec.verified,
      source: 'oidc-claims',
    };
  }
}
