import { createHash } from 'node:crypto';

import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';
import {
  HostRoleInvocationAdmissionRuntime,
} from './host-role-invocation-admission-runtime.js';
import {
  ProviderAuthorityKeyring,
  ProviderAuthorityKeyringError,
} from './provider-authority-keyring.js';
import {
  ProviderLimitStore,
  ProviderLimitStoreError,
  type ProviderLimitSnapshotQuery,
  type ProviderLimitStoreOptions,
} from './provider-limit-store.js';
import type { ProviderLimitResult } from './provider-limit-truth.js';
import {
  ProviderTruthStore,
  ProviderTruthStoreError,
} from './provider-truth-store.js';

export type ProviderAuthorityCompositionHoldReason =
  | 'tenant_authority_unavailable'
  | 'keyring_unavailable'
  | 'keyring_storage_unsafe'
  | 'schema_migration_required'
  | 'integrity_failure'
  | 'policy_authority_unavailable'
  | 'termination_authority_unavailable'
  | 'account_authority_unavailable'
  | 'truth_producer_unavailable'
  | 'limit_producer_unavailable'
  | 'global_scope_unavailable';

export interface ProviderAuthorityCompositionHeld {
  readonly state: 'hold';
  readonly reasonCode: ProviderAuthorityCompositionHoldReason;
  readonly authorityEvidenceRef: string;
  readonly retryable: boolean;
  close(): void;
}

export interface ProviderAuthorityCompositionReady {
  readonly state: 'ready';
  readonly tenantId: string;
  readonly projectId: string;
  readonly truthProducerAuthorityRef: string;
  readonly limitProducerAuthorityRef: string;
  readonly accountAuthorityRef: string;
  readonly keyring: ProviderAuthorityKeyring;
  readonly truthStore: ProviderTruthStore;
  readonly limitStore: ProviderLimitStore;
  readonly runtime: HostRoleInvocationAdmissionRuntime;
  pseudonymizeAccount(input: {
    readonly provider: string;
    readonly authMode: string;
    readonly stableAccountIdentity: string;
  }): string;
  close(): void;
}

export type ProviderAuthorityComposition =
  | ProviderAuthorityCompositionReady
  | ProviderAuthorityCompositionHeld;

export interface ProviderAuthorityCompositionOptions {
  readonly mode: 'solo' | 'enterprise';
  readonly tenantId?: string;
  /** Canonical identity minted by InvocationReceiptStore; this factory never derives a second project id. */
  readonly projectId: string;
  readonly projectRoot: string;
  readonly platform?: GlobalScopePlatform;
  readonly nodePlatform?: string;
  readonly env?: GlobalScopeEnv;
  readonly now?: () => Date;
  readonly policyResolver?: (
    scope: ProviderLimitSnapshotQuery,
  ) => ProviderLimitResult['policy'] | null;
  readonly terminationEvidenceVerifier?: ProviderLimitStoreOptions['terminationEvidenceVerifier'];
  readonly accountAuthorityRef?: string;
  readonly truthProducerAuthorityRef?: string;
  readonly limitProducerAuthorityRef?: string;
}

function evidenceRef(reason: ProviderAuthorityCompositionHoldReason, detail: string): string {
  return `provider-authority:${createHash('sha256').update(`${reason}\0${detail}`).digest('hex')}`;
}

function hold(
  reasonCode: ProviderAuthorityCompositionHoldReason,
  detail: string,
  retryable: boolean,
): ProviderAuthorityCompositionHeld {
  return {
    state: 'hold',
    reasonCode,
    retryable,
    authorityEvidenceRef: evidenceRef(reasonCode, detail),
    close() {},
  };
}

function requiredRef(value: string | undefined): string | null {
  return value && value === value.trim() ? value : null;
}

function classifyOpenFailure(error: unknown): ProviderAuthorityCompositionHeld {
  if (error instanceof ProviderAuthorityKeyringError) {
    if (error.code === 'KEYRING_STORAGE_UNSAFE'
      || error.code === 'KEYRING_ACL_UNSUPPORTED'
      || error.code === 'KEYRING_ACL_ENFORCEMENT_FAILED'
      || error.code === 'KEYRING_PROJECT_SCOPE_FORBIDDEN'
      || error.code === 'KEYRING_ATOMIC_PUBLICATION_UNSUPPORTED') {
      return hold('keyring_storage_unsafe', error.code, false);
    }
    return hold(
      'keyring_unavailable',
      error.code,
      error.code === 'KEYRING_IO_FAILURE' || error.code === 'KEYRING_SCOPE_UNRESOLVED',
    );
  }
  if ((error instanceof ProviderTruthStoreError || error instanceof ProviderLimitStoreError)
    && error.code === 'MIGRATION_REQUIRED') {
    return hold('schema_migration_required', error.name, false);
  }
  if (error instanceof ProviderTruthStoreError || error instanceof ProviderLimitStoreError) {
    return hold('integrity_failure', `${error.name}:${error.code}`, false);
  }
  return hold('global_scope_unavailable', error instanceof Error ? error.name : 'unknown', true);
}

/**
 * Host-only composition root. It is deliberately non-provisioning: no key,
 * tenant, producer, policy, or account authority is invented at dispatch time.
 */
export function composeProviderAuthority(
  options: ProviderAuthorityCompositionOptions,
): ProviderAuthorityComposition {
  const tenantId = options.mode === 'solo'
    ? (requiredRef(options.tenantId) ?? 'local')
    : requiredRef(options.tenantId);
  if (!tenantId) return hold('tenant_authority_unavailable', options.mode, false);
  if (!options.policyResolver) return hold('policy_authority_unavailable', tenantId, false);
  if (!options.terminationEvidenceVerifier) {
    return hold('termination_authority_unavailable', tenantId, false);
  }
  const accountAuthorityRef = requiredRef(options.accountAuthorityRef);
  if (!accountAuthorityRef) return hold('account_authority_unavailable', tenantId, false);
  const truthProducerAuthorityRef = requiredRef(options.truthProducerAuthorityRef);
  if (!truthProducerAuthorityRef) return hold('truth_producer_unavailable', tenantId, true);
  const limitProducerAuthorityRef = requiredRef(options.limitProducerAuthorityRef);
  if (!limitProducerAuthorityRef) return hold('limit_producer_unavailable', tenantId, true);

  let truthStore: ProviderTruthStore | null = null;
  let limitStore: ProviderLimitStore | null = null;
  try {
    const env = options.env ?? process.env;
    const platform = options.platform
      ?? normalizeGlobalScopePlatform(options.nodePlatform ?? process.platform, env);
    const scope = resolveGlobalScopePaths(platform, env);
    const keyring = ProviderAuthorityKeyring.open({
      dataDir: scope.dataDir,
      projectRoot: options.projectRoot,
      platform: (platform === 'wsl' ? 'linux' : platform) as NodeJS.Platform,
    });
    truthStore = new ProviderTruthStore(scope.stateDir, {
      projectId: options.projectId,
      integrityAuthority: keyring,
      now: options.now,
    });
    limitStore = new ProviderLimitStore(scope.stateDir, {
      integrityAuthority: keyring,
      policyResolver: options.policyResolver,
      terminationEvidenceVerifier: options.terminationEvidenceVerifier,
      now: options.now,
    });
    const runtime = new HostRoleInvocationAdmissionRuntime({
      tenantId,
      truthStore,
      limitStore,
      now: options.now,
    });
    let closed = false;
    return {
      state: 'ready',
      tenantId,
      projectId: options.projectId,
      truthProducerAuthorityRef,
      limitProducerAuthorityRef,
      accountAuthorityRef,
      keyring,
      truthStore,
      limitStore,
      runtime,
      pseudonymizeAccount(input) {
        return keyring.pseudonymizeAccount({ tenantId, ...input });
      },
      close() {
        if (closed) return;
        closed = true;
        truthStore?.close();
        limitStore?.close();
      },
    };
  } catch (error) {
    try { truthStore?.close(); } catch { /* best-effort after failed composition */ }
    try { limitStore?.close(); } catch { /* best-effort after failed composition */ }
    return classifyOpenFailure(error);
  }
}
