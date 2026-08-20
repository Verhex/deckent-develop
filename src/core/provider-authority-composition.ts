import { createHash } from 'node:crypto';

import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePaths,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';
import {
  HostRoleInvocationAdmissionRuntime,
} from './host-role-invocation-admission-runtime.js';
import {
  ExecutionTerminationLedger,
  ExecutionTerminationLedgerError,
  createProviderLimitTerminationEvidenceVerifier,
  resolveExecutionTerminationAdapter,
  type ExecutionTerminationBackend,
} from './execution-termination-ledger.js';
import {
  ProviderAuthorityKeyring,
  ProviderAuthorityKeyringError,
} from './provider-authority-keyring.js';
import {
  ProviderEvidenceProducer,
  type ProviderEvidenceSourceResolver,
} from './provider-evidence-producer.js';
import type { InvocationReceiptLedger } from './invocation-receipt.js';
import {
  InvocationReceiptStore,
  InvocationReceiptStoreError,
  type InvocationReceiptStoreOptions,
} from './invocation-receipt-store.js';
import {
  ProviderEvidenceSourceRegistry,
  type ProviderEvidenceSourceRegistration,
} from './provider-evidence-source-registry.js';
import {
  createProviderLimitPolicyRuntimeResolver,
  type ProviderLimitPolicyLayer,
} from './provider-limit-policy.js';
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
  | 'project_identity_unavailable'
  | 'keyring_unavailable'
  | 'keyring_storage_unsafe'
  | 'schema_migration_required'
  | 'integrity_failure'
  | 'policy_authority_unavailable'
  | 'policy_authority_invalid'
  | 'termination_authority_unavailable'
  | 'termination_adapter_unsupported'
  | 'source_resolver_unavailable'
  | 'source_bundle_unavailable'
  | 'receipt_ledger_unavailable'
  | 'runtime_closed'
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
  readonly sourceResolverAuthorityRef: string;
  readonly evidenceProducer: ProviderEvidenceProducer;
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
  readonly sourceResolver?: ProviderEvidenceSourceResolver;
  readonly receiptLedger?: InvocationReceiptLedger;
  /** 7094/7081: reachability-evidence freshness window (ms); config-resolved
   *  from `cross_verify.reachability_ttl_ms`, producer default when absent. */
  readonly reachabilityTtlMs?: number;
}

export interface ProviderAuthorityRuntimeServiceOptions {
  readonly mode: 'solo' | 'enterprise';
  readonly tenantId?: string;
  readonly projectRoot: string;
  readonly platform?: GlobalScopePlatform;
  readonly nodePlatform?: string;
  readonly env?: GlobalScopeEnv;
  readonly now?: () => Date;
  readonly parentPolicy: ProviderLimitPolicyLayer | null;
  readonly projectPolicy?: ProviderLimitPolicyLayer | null;
  readonly sourceRegistrations: readonly ProviderEvidenceSourceRegistration[];
  /** Hermetic/test seam; production callers omit it. */
  readonly receiptStoreOptions?: InvocationReceiptStoreOptions;
  /** 7094/7081: reachability-evidence freshness window (ms); config-resolved
   *  from `cross_verify.reachability_ttl_ms`, producer default when absent. */
  readonly reachabilityTtlMs?: number;
}

export interface ProviderAuthorityRuntimeScope {
  readonly provider: string;
  readonly authMode: ProviderEvidenceSourceRegistration['authMode'];
  readonly transport: ProviderEvidenceSourceRegistration['transport'];
  readonly executionBackend: ProviderEvidenceSourceRegistration['executionBackend'];
}

export type ProviderAuthorityRuntimeScopePreflight =
  | {
      readonly decision: 'ready';
      readonly sourceAuthorityRef: string;
      readonly terminationEvidenceContract: 'task-result-settlement-v1';
      readonly authorityEvidenceRef: string;
    }
  | {
      readonly decision: 'hold';
      readonly reasonCode:
        | 'source_bundle_unavailable'
        | 'termination_adapter_unsupported'
        | 'runtime_closed';
      readonly authorityEvidenceRef: string;
    };

export interface ProviderAuthorityRuntimeServiceReady {
  readonly state: 'ready';
  readonly tenantId: string;
  readonly projectId: string;
  readonly authorityEvidenceRef: string;
  readonly service: ProviderAuthorityRuntimeService;
  close(): void;
}

export type ProviderAuthorityRuntimeServiceOpenResult =
  | ProviderAuthorityRuntimeServiceReady
  | ProviderAuthorityCompositionHeld;

export class ProviderAuthorityRuntimeServiceError extends Error {
  constructor(
    readonly code: 'RUNTIME_CLOSED',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderAuthorityRuntimeServiceError';
  }
}

function evidenceRef(reason: ProviderAuthorityCompositionHoldReason, detail: string): string {
  return `provider-authority:${createHash('sha256').update(`${reason}\0${detail}`).digest('hex')}`;
}

function runtimeEvidenceRef(kind: string, detail: string): string {
  return `provider-authority:${createHash('sha256').update(`${kind}\0${detail}`).digest('hex')}`;
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
  if (error instanceof ExecutionTerminationLedgerError) {
    return hold(
      error.code === 'INTEGRITY_FAILURE' || error.code === 'INTEGRITY_KEY_UNAVAILABLE'
        ? 'integrity_failure'
        : 'termination_authority_unavailable',
      `${error.name}:${error.code}`,
      false,
    );
  }
  if (error instanceof InvocationReceiptStoreError) {
    return hold('receipt_ledger_unavailable', `${error.name}:${error.code}`, false);
  }
  return hold('global_scope_unavailable', error instanceof Error ? error.name : 'unknown', true);
}

function openReadyComposition(input: {
  readonly tenantId: string;
  readonly projectId: string;
  readonly keyring: ProviderAuthorityKeyring;
  readonly stateDir: string;
  readonly now?: () => Date;
  readonly policyResolver: NonNullable<ProviderAuthorityCompositionOptions['policyResolver']>;
  readonly terminationEvidenceVerifier: NonNullable<
    ProviderAuthorityCompositionOptions['terminationEvidenceVerifier']
  >;
  readonly sourceResolver: ProviderEvidenceSourceResolver;
  readonly receiptLedger: InvocationReceiptLedger;
  readonly reachabilityTtlMs?: number;
}): ProviderAuthorityCompositionReady {
  let truthStore: ProviderTruthStore | null = null;
  let limitStore: ProviderLimitStore | null = null;
  try {
    truthStore = new ProviderTruthStore(input.stateDir, {
      projectId: input.projectId,
      integrityAuthority: input.keyring,
      now: input.now,
    });
    limitStore = new ProviderLimitStore(input.stateDir, {
      integrityAuthority: input.keyring,
      policyResolver: input.policyResolver,
      terminationEvidenceVerifier: input.terminationEvidenceVerifier,
      now: input.now,
    });
    const runtime = new HostRoleInvocationAdmissionRuntime({
      tenantId: input.tenantId,
      truthStore,
      limitStore,
      now: input.now,
    });
    const evidenceProducer = new ProviderEvidenceProducer({
      tenantId: input.tenantId,
      projectId: input.projectId,
      keyring: input.keyring,
      truthStore,
      limitStore,
      receiptLedger: input.receiptLedger,
      sourceResolver: input.sourceResolver,
      policyResolver: input.policyResolver,
      now: input.now,
      ...(input.reachabilityTtlMs !== undefined
        ? { reachabilityTtlMs: input.reachabilityTtlMs }
        : {}),
    });
    let closed = false;
    return {
      state: 'ready',
      tenantId: input.tenantId,
      projectId: input.projectId,
      sourceResolverAuthorityRef: input.sourceResolver.authorityRef,
      evidenceProducer,
      keyring: input.keyring,
      truthStore,
      limitStore,
      runtime,
      pseudonymizeAccount(account) {
        return input.keyring.pseudonymizeAccount({ tenantId: input.tenantId, ...account });
      },
      close() {
        if (closed) return;
        closed = true;
        let closeError: unknown = null;
        try { truthStore?.close(); } catch (error) { closeError = error; }
        try { limitStore?.close(); } catch (error) { closeError ??= error; }
        if (closeError) throw closeError;
      },
    };
  } catch (error) {
    try { truthStore?.close(); } catch { /* best-effort after failed composition */ }
    try { limitStore?.close(); } catch { /* best-effort after failed composition */ }
    throw error;
  }
}

/**
 * Host-only composition root. It is deliberately non-provisioning: no key,
 * tenant, producer, policy, or account authority is invented at dispatch time.
 */
export function composeProviderAuthority(
  options: ProviderAuthorityCompositionOptions,
): ProviderAuthorityComposition {
  // Solo default tenant is 'main' (owner directive, 2026-08-17): approval requests
  // minted here must be decidable under the owner's approval.authority.tenant_id.
  // The 'local' fallback made probe approvals structurally unauthorized.
  const tenantId = options.mode === 'solo'
    ? (requiredRef(options.tenantId) ?? 'main')
    : requiredRef(options.tenantId);
  if (!tenantId) return hold('tenant_authority_unavailable', options.mode, false);
  if (!options.policyResolver) return hold('policy_authority_unavailable', tenantId, false);
  if (!options.terminationEvidenceVerifier) {
    return hold('termination_authority_unavailable', tenantId, false);
  }
  if (!options.sourceResolver) {
    return hold('source_resolver_unavailable', tenantId, true);
  }
  if (!options.receiptLedger || options.receiptLedger.projectId !== options.projectId) {
    return hold('receipt_ledger_unavailable', 'receipt-ledger', false);
  }

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
    return openReadyComposition({
      tenantId,
      projectId: options.projectId,
      keyring,
      stateDir: scope.stateDir,
      ...(options.reachabilityTtlMs !== undefined
        ? { reachabilityTtlMs: options.reachabilityTtlMs }
        : {}),
      now: options.now,
      receiptLedger: options.receiptLedger,
      sourceResolver: options.sourceResolver,
      policyResolver: options.policyResolver,
      terminationEvidenceVerifier: options.terminationEvidenceVerifier,
    });
  } catch (error) {
    return classifyOpenFailure(error);
  }
}

/**
 * The only lifecycle-owning provider-authority root intended for production
 * surfaces. Construction is provider-free and opens existing custody only.
 */
export class ProviderAuthorityRuntimeService {
  private closed = false;

  private constructor(
    readonly tenantId: string,
    readonly projectId: string,
    readonly authorityEvidenceRef: string,
    readonly policyAuthorityRef: string,
    private readonly sourceRegistry: ProviderEvidenceSourceRegistry,
    private readonly composition: ProviderAuthorityCompositionReady,
    private readonly terminationStore: ExecutionTerminationLedger,
    private readonly receiptStore: InvocationReceiptStore,
  ) {}

  static open(
    options: ProviderAuthorityRuntimeServiceOptions,
  ): ProviderAuthorityRuntimeServiceOpenResult {
    const tenantId = options.mode === 'solo'
      ? (requiredRef(options.tenantId) ?? 'main')
      : requiredRef(options.tenantId);
    if (!tenantId) return hold('tenant_authority_unavailable', options.mode, false);

    let receiptStore: InvocationReceiptStore | null = null;
    let terminationStore: ExecutionTerminationLedger | null = null;
    let composition: ProviderAuthorityCompositionReady | null = null;
    try {
      receiptStore = new InvocationReceiptStore(
        options.projectRoot,
        options.receiptStoreOptions,
      );
    } catch (error) {
      return error instanceof InvocationReceiptStoreError
        ? classifyOpenFailure(error)
        : hold(
            'project_identity_unavailable',
            error instanceof Error ? error.name : 'unknown',
            false,
          );
    }

    const policy = createProviderLimitPolicyRuntimeResolver({
      parent: options.parentPolicy,
      project: options.projectPolicy,
    });
    if (policy.state === 'hold') {
      receiptStore.close();
      return hold(
        policy.reasonCode === 'policy_authority_unavailable'
          ? 'policy_authority_unavailable'
          : 'policy_authority_invalid',
        policy.reasonCode,
        false,
      );
    }
    if (options.sourceRegistrations.length === 0) {
      receiptStore.close();
      return hold('source_resolver_unavailable', 'empty-registry', false);
    }

    let sourceRegistry: ProviderEvidenceSourceRegistry;
    try {
      sourceRegistry = new ProviderEvidenceSourceRegistry(options.sourceRegistrations);
    } catch (error) {
      receiptStore.close();
      return hold(
        'source_resolver_unavailable',
        error instanceof Error ? error.name : 'invalid-registry',
        false,
      );
    }

    try {
      const env = options.env ?? process.env;
      const platform = options.platform
        ?? normalizeGlobalScopePlatform(options.nodePlatform ?? process.platform, env);
      const scope: GlobalScopePaths = resolveGlobalScopePaths(platform, env);
      const keyring = ProviderAuthorityKeyring.open({
        dataDir: scope.dataDir,
        projectRoot: options.projectRoot,
        platform: (platform === 'wsl' ? 'linux' : platform) as NodeJS.Platform,
      });
      terminationStore = new ExecutionTerminationLedger(scope.stateDir, {
        integrityAuthority: keyring,
        now: options.now,
      });
      composition = openReadyComposition({
        tenantId,
        projectId: receiptStore.projectId,
        keyring,
        stateDir: scope.stateDir,
        ...(options.reachabilityTtlMs !== undefined
          ? { reachabilityTtlMs: options.reachabilityTtlMs }
          : {}),
        now: options.now,
        receiptLedger: receiptStore,
        sourceResolver: sourceRegistry,
        policyResolver: query => policy.resolve(query),
        terminationEvidenceVerifier: createProviderLimitTerminationEvidenceVerifier(
          terminationStore,
        ),
      });
      const authorityEvidenceRef = runtimeEvidenceRef(
        'runtime',
        [
          tenantId,
          receiptStore.projectId,
          policy.authorityRef,
          sourceRegistry.authorityRef,
          keyring.snapshot().revisionHash,
        ].join('\0'),
      );
      const service = new ProviderAuthorityRuntimeService(
        tenantId,
        receiptStore.projectId,
        authorityEvidenceRef,
        policy.authorityRef,
        sourceRegistry,
        composition,
        terminationStore,
        receiptStore,
      );
      return {
        state: 'ready',
        tenantId,
        projectId: receiptStore.projectId,
        authorityEvidenceRef,
        service,
        close: () => service.close(),
      };
    } catch (error) {
      try { composition?.close(); } catch { /* best-effort failed-open cleanup */ }
      try { terminationStore?.close(); } catch { /* best-effort failed-open cleanup */ }
      try { receiptStore.close(); } catch { /* best-effort failed-open cleanup */ }
      return classifyOpenFailure(error);
    }
  }

  get evidenceProducer(): ProviderEvidenceProducer {
    this.assertOpen();
    return this.composition.evidenceProducer;
  }

  /** Read-only truth access for pre-compose freshness checks (§12.2 T2b). */
  get truthStore(): ProviderTruthStore {
    this.assertOpen();
    return this.composition.truthStore;
  }

  get roleAdmissionRuntime(): HostRoleInvocationAdmissionRuntime {
    this.assertOpen();
    return this.composition.runtime;
  }

  get terminationLedger(): ExecutionTerminationLedger {
    this.assertOpen();
    return this.terminationStore;
  }

  get invocationReceiptLedger(): InvocationReceiptStore {
    this.assertOpen();
    return this.receiptStore;
  }

  preflightUnattendedScope(
    scope: ProviderAuthorityRuntimeScope,
  ): ProviderAuthorityRuntimeScopePreflight {
    if (this.closed) {
      return {
        decision: 'hold',
        reasonCode: 'runtime_closed',
        authorityEvidenceRef: evidenceRef('runtime_closed', this.authorityEvidenceRef),
      };
    }
    let source;
    try {
      source = this.sourceRegistry.resolve(scope);
    } catch {
      source = null;
    }
    if (!source) {
      return {
        decision: 'hold',
        reasonCode: 'source_bundle_unavailable',
      authorityEvidenceRef: evidenceRef(
        'source_bundle_unavailable',
        JSON.stringify(scope),
        ),
      };
    }
    const termination = resolveExecutionTerminationAdapter(
      scope.executionBackend as ExecutionTerminationBackend,
    );
    if (termination.decision === 'hold') {
      return {
        decision: 'hold',
        reasonCode: termination.reasonCode,
        authorityEvidenceRef: evidenceRef(
          'termination_adapter_unsupported',
          JSON.stringify(scope),
        ),
      };
    }
    return {
      decision: 'ready',
      sourceAuthorityRef: source.authorityEvidenceRef,
      terminationEvidenceContract: termination.evidenceContract,
      authorityEvidenceRef: runtimeEvidenceRef(
        'runtime-scope',
        `${this.authorityEvidenceRef}\0${source.authorityEvidenceRef}`,
      ),
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    let closeError: unknown = null;
    try { this.composition.close(); } catch (error) { closeError = error; }
    try { this.terminationStore.close(); } catch (error) { closeError ??= error; }
    try { this.receiptStore.close(); } catch (error) { closeError ??= error; }
    if (closeError) throw closeError;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ProviderAuthorityRuntimeServiceError(
        'RUNTIME_CLOSED',
        'Provider authority runtime service is closed',
      );
    }
  }
}
