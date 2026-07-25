import { createHash } from 'node:crypto';

import type {
  InvocationAuthMode,
  InvocationExecutionBackend,
  InvocationTransport,
} from './invocation-receipt.js';
import {
  type ProviderEvidenceSourceResolver,
  type ProviderEvidenceSourceScope,
  type ProviderEvidenceSourceSelection,
  type ProviderEvidenceSources,
} from './provider-evidence-producer.js';
import {
  assertCanonicalProviderId,
  assertOpaqueEvidenceRef,
} from './provider-truth.js';

const EXECUTABLE_AUTH_MODES = new Set<InvocationAuthMode>([
  'subscription',
  'api',
  'hybrid',
  'local',
]);
const EXECUTABLE_BACKENDS = new Set<InvocationExecutionBackend>([
  'host-subprocess',
  'docker',
  'tmux',
  'api',
  'in-process',
]);
const TRANSPORTS = new Set<InvocationTransport>(['cli', 'api', 'http', 'local-runtime']);

export interface ProviderEvidenceSourceRegistration extends ProviderEvidenceSourceScope {
  readonly sources: ProviderEvidenceSources;
}

interface RegisteredSource {
  readonly selection: ProviderEvidenceSourceSelection;
  readonly digestInput: string;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function scopeKey(scope: ProviderEvidenceSourceScope): string {
  return [
    scope.provider,
    scope.authMode,
    scope.transport,
    scope.executionBackend,
  ].join('\u0000');
}

function validateScope(
  scope: ProviderEvidenceSourceScope,
  operation: 'register' | 'resolve',
): boolean {
  assertCanonicalProviderId(scope.provider);
  if (!EXECUTABLE_AUTH_MODES.has(scope.authMode)
    || !TRANSPORTS.has(scope.transport)
    || !EXECUTABLE_BACKENDS.has(scope.executionBackend)) {
    if (operation === 'register') {
      throw new TypeError('Provider evidence sources require an executable auth and backend scope');
    }
    return false;
  }
  return true;
}

function validateSources(sources: ProviderEvidenceSources): void {
  for (const ref of [
    sources.account.authorityRef,
    sources.limit.authorityRef,
    sources.reachability.authorityRef,
  ]) assertOpaqueEvidenceRef('provider evidence source authority', ref, true);
}

/**
 * Immutable host-side source authority. Resolution is exact; registration
 * order, catalog order, adapter availability and provider fallback never
 * participate in source selection.
 */
export class ProviderEvidenceSourceRegistry implements ProviderEvidenceSourceResolver {
  readonly authorityRef: string;
  private readonly byScope: ReadonlyMap<string, RegisteredSource>;

  constructor(registrations: readonly ProviderEvidenceSourceRegistration[]) {
    const byScope = new Map<string, RegisteredSource>();
    for (const registration of registrations) {
      validateScope(registration, 'register');
      validateSources(registration.sources);
      const key = scopeKey(registration);
      if (byScope.has(key)) {
        throw new TypeError(
          `Duplicate provider evidence source scope: ${registration.provider}/`
          + `${registration.authMode}/${registration.transport}/${registration.executionBackend}`,
        );
      }
      const digestInput = [
        key,
        registration.sources.account.authorityRef,
        registration.sources.limit.authorityRef,
        registration.sources.reachability.authorityRef,
      ].join('\u0000');
      const immutableSources: ProviderEvidenceSources = Object.freeze({
        account: Object.freeze({ ...registration.sources.account }),
        limit: Object.freeze({ ...registration.sources.limit }),
        reachability: Object.freeze({ ...registration.sources.reachability }),
      });
      byScope.set(key, {
        digestInput,
        selection: Object.freeze({
          provider: registration.provider,
          authMode: registration.authMode,
          transport: registration.transport,
          executionBackend: registration.executionBackend,
          authorityEvidenceRef: `provider-source-selection:${digest(digestInput)}`,
          sources: immutableSources,
        }),
      });
    }
    const registryDigest = [...byScope.values()]
      .map(item => item.digestInput)
      .sort()
      .join('\u0001');
    this.authorityRef = `provider-source-registry:${digest(registryDigest)}`;
    this.byScope = byScope;
  }

  resolve(scope: ProviderEvidenceSourceScope): ProviderEvidenceSourceSelection | null {
    if (!validateScope(scope, 'resolve')) return null;
    return this.byScope.get(scopeKey(scope))?.selection ?? null;
  }
}
