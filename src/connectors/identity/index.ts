// src/connectors/identity/index.ts
import { DeckentError } from '../../core/errors.js';
import type { IdentityStore } from './identity-store.js';
import type { IdentityDirectoryProvider } from './provider.js';
import { LocalIdentityProvider, type LocalProviderOptions } from './providers/local.js';
import { OidcClaimsIdentityProvider, type OidcClaimsProviderOptions } from './providers/oidc-claims.js';
import { ScimIdentityProvider, type ScimProviderOptions } from './providers/scim.js';

export { LocalIdentityProvider } from './providers/local.js';
export type { LocalProviderOptions } from './providers/local.js';
export { OidcClaimsIdentityProvider } from './providers/oidc-claims.js';
export type { OidcClaimsProviderOptions } from './providers/oidc-claims.js';
export { ScimIdentityProvider } from './providers/scim.js';
export type { ScimProviderOptions } from './providers/scim.js';
export * from './provider.js';

export type CreateProviderOptions =
  | { kind: 'local'; store: IdentityStore; local: LocalProviderOptions }
  | { kind: 'scim'; store: IdentityStore; scim: ScimProviderOptions }
  | { kind: 'oidc-claims'; store: IdentityStore; oidcClaims: OidcClaimsProviderOptions };

/**
 * Build the configured identity provider. Faz 1 supports `local`; Faz 3 adds `scim` and
 * `oidc-claims`. `csv` (Faz 2) and any other unknown kind throw honestly — never a silent stub.
 */
export function createIdentityProvider(opts: CreateProviderOptions): IdentityDirectoryProvider {
  if (opts.kind === 'local') return new LocalIdentityProvider(opts.store, opts.local);
  if (opts.kind === 'scim') return new ScimIdentityProvider(opts.store, opts.scim);
  if (opts.kind === 'oidc-claims') return new OidcClaimsIdentityProvider(opts.store, opts.oidcClaims);
  throw new DeckentError('E_UNKNOWN_IDENTITY_PROVIDER', `[E_UNKNOWN_IDENTITY_PROVIDER] Identity provider "${(opts as { kind: string }).kind}" is not available in this build (csv = Faz 2, not yet implemented)`);
}
