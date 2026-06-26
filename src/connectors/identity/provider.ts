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
