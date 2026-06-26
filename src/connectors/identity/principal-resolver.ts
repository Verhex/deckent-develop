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
