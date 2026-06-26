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
      return { userId: owner.externalId, role: 'admin', permissions: ['*'], tenantId, verified: true, source: 'local' };
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
