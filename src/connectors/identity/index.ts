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
  throw new DeckentError('E_UNKNOWN_IDENTITY_PROVIDER', `[E_UNKNOWN_IDENTITY_PROVIDER] Identity provider "${(opts as { kind: string }).kind}" is not available in this build (Faz 1: local only)`);
}
