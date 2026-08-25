// ─── Owner-authored `provider_limits` derived from live provider truth ──────
//
// Why this module exists: `projectExactProviderLimitAuthoritySelector` holds
// `xverify_provider_scope_unavailable` whenever the global config layer carries
// no authored `provider_limits` parent block — and that block could not be
// hand-written, because a valid selector demands an `accountRefHash` and a
// `quotaScopeRefHash` that only exist behind live account authority and the
// consuming resolver's own derivation.
//
// Boundaries this module keeps:
//   - ONE derivation per hash. `accountRefHash` comes from the same exported
//     `resolveProviderAccountRefHash` the evidence producer uses; the quota
//     scope hash comes from `deriveProviderQuotaScopeRefHash`, the function the
//     limit store and producer themselves call. Nothing is re-implemented here.
//   - Window ids and source scope come from a live `limit.observe` call, never
//     from a default table — an authored policy that no live source backs is a
//     fabricated selector.
//   - Validation is performed BY THE CONSUMERS (authority snapshot + runtime
//     resolver), so a block this module calls ready is a block they accept.
//   - Persistence requires explicit owner confirmation. Existing authorities
//     are evolved by exact-selector upsert under compare-and-set (CAS), so one
//     provider can be added or updated without replacing unrelated policies.

import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

import { canonicalJson } from './audit-writer.js';
import type {
  DeckentConfig,
  ProviderLimitPolicySelectorConfig,
  ProviderLimitPolicySourceScopeConfig,
  ProviderLimitPolicyValuesConfig,
  ProviderLimitsConfig,
} from './config-types.js';
import { loadGlobalConfig, resolveGlobalConfigReadPath } from './config.js';
import type {
  InvocationAuthMode,
  InvocationExecutionBackend,
  InvocationTransport,
} from './invocation-receipt.js';
import type { ProviderAuthorityKeyring } from './provider-authority-keyring.js';
import {
  resolveProviderAccountRefHash,
  type ProviderEvidenceSourceResolver,
} from './provider-evidence-producer.js';
import {
  createProviderLimitPolicyAuthoritySnapshot,
  createProviderLimitPolicyRuntimeResolver,
  resolveProviderLimitPolicy,
  PROVIDER_LIMIT_POLICY_SCHEMA_VERSION,
} from './provider-limit-policy.js';
import { deriveProviderQuotaScopeRefHash } from './provider-limit-truth.js';
import type { ProviderExecutionProfile, ReachabilityBackendScope } from './provider-truth.js';
import { DeckentError } from './errors.js';

const DEFAULT_ACCOUNT_IDENTITY_MAX_TTL_MS = 60_000;

export type ProviderLimitAuthoringHoldReason =
  | 'scope_not_exact'
  | 'source_bundle_unavailable'
  | 'account_identity_unavailable'
  | 'limit_source_failure'
  | 'limit_windows_unavailable'
  | 'policy_invalid';

export interface ProviderLimitAuthoringHeld {
  readonly state: 'hold';
  readonly reasonCode: ProviderLimitAuthoringHoldReason;
  readonly detail: string;
  readonly authorityEvidenceRef: string;
}

export interface ProviderLimitAuthoringReady {
  readonly state: 'ready';
  /** Validator-green parent block, ready to be written to the global layer. */
  readonly config: ProviderLimitsConfig;
  readonly selector: ProviderLimitPolicySelectorConfig;
  /** Null only for `local` auth, which has no provider account authority. */
  readonly accountRefHash: string | null;
  readonly quotaScopeRefHash: string;
  readonly selectorDigest: string;
  readonly policyRef: string;
  readonly authorityEvidenceRef: string;
}

export type ProviderLimitAuthoringProposal =
  | ProviderLimitAuthoringReady
  | ProviderLimitAuthoringHeld;

export interface ProviderLimitAuthoringRequest {
  readonly tenantId: string;
  readonly projectId: string;
  readonly provider: string;
  /** Exact model api id the live limit source is asked about. */
  readonly model: string;
  readonly authMode: InvocationAuthMode;
  readonly backend: ReachabilityBackendScope;
  readonly executionProfile: ProviderExecutionProfile;
  /** Owner-authored thresholds; a parent layer requires both ratios. */
  readonly values: ProviderLimitPolicyValuesConfig;
  readonly sourceResolver: ProviderEvidenceSourceResolver;
  readonly keyring: Pick<ProviderAuthorityKeyring, 'pseudonymizeAccount'>;
  readonly now?: () => Date;
  readonly accountIdentityMaxTtlMs?: number;
}

export type ProviderLimitsWriteRefusalReason =
  | 'owner_confirmation_required'
  | 'provider_limits_authority_changed'
  | 'provider_limits_invalid'
  | 'config_unreadable'
  | 'config_write_in_progress';

export type ProviderLimitsWriteAction = 'create' | 'add' | 'update' | 'unchanged';

export interface ProviderLimitsWritePlanReady {
  readonly state: 'ready';
  readonly action: ProviderLimitsWriteAction;
  readonly configPath: string;
  /** Null means the plan was prepared against an absent authority. */
  readonly expectedAuthorityRef: string | null;
  readonly config: ProviderLimitsConfig;
  readonly authorityRef: string;
}

export type ProviderLimitsWritePlan =
  | ProviderLimitsWritePlanReady
  | {
      readonly state: 'refused';
      readonly reasonCode: ProviderLimitsWriteRefusalReason;
      readonly detail: string;
    };

export type ProviderLimitsWriteResult =
  | {
      readonly state: 'written' | 'unchanged';
      readonly action: ProviderLimitsWriteAction;
      readonly configPath: string;
      readonly authorityRef: string;
    }
  | {
      readonly state: 'refused';
      readonly reasonCode: ProviderLimitsWriteRefusalReason;
      readonly detail: string;
    };

export interface PrepareProviderLimitsWriteRequest {
  readonly proposal: ProviderLimitAuthoringReady;
  /** Hermetic/test seam; production callers omit it and take the global layer. */
  readonly configPath?: string;
}

export interface ProviderLimitsWriteRequest {
  readonly plan: ProviderLimitsWritePlanReady;
  /** An explicit owner decision — a default-true parameter would be a silent write. */
  readonly ownerConfirmed: boolean;
}

function evidenceRef(kind: string, detail: unknown): string {
  return `provider-limit-authoring:${createHash('sha256')
    .update(`${kind}\0${canonicalJson(detail)}`)
    .digest('hex')}`;
}

function hold(
  reasonCode: ProviderLimitAuthoringHoldReason,
  detail: string,
): ProviderLimitAuthoringHeld {
  return {
    state: 'hold',
    reasonCode,
    detail,
    authorityEvidenceRef: evidenceRef(reasonCode, detail),
  };
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Derive an owner-confirmable `provider_limits` parent block from live provider
 * truth. Every refusal is typed: no partial block, no placeholder hash and no
 * "unknown" scope ever reaches the returned config.
 */
export async function proposeProviderLimitsAuthoring(
  request: ProviderLimitAuthoringRequest,
): Promise<ProviderLimitAuthoringProposal> {
  const { transport, executionBackend, endpointRefHash } = request.backend;
  if (request.authMode === 'unknown' || executionBackend === 'unknown') {
    return hold('scope_not_exact', `${request.authMode}/${executionBackend}`);
  }
  const authMode: Exclude<InvocationAuthMode, 'unknown'> = request.authMode;
  const exactBackend: Exclude<InvocationExecutionBackend, 'unknown'> = executionBackend;

  let selection;
  try {
    selection = request.sourceResolver.resolve({
      provider: request.provider,
      authMode,
      transport,
      executionBackend: exactBackend,
    });
  } catch (error) {
    return hold('source_bundle_unavailable', `resolver:${errorDetail(error)}`);
  }
  if (!selection) {
    return hold(
      'source_bundle_unavailable',
      `${request.provider}/${authMode}/${transport}/${exactBackend}`,
    );
  }

  const account = await resolveProviderAccountRefHash({
    account: selection.sources.account,
    keyring: request.keyring,
    request: {
      tenantId: request.tenantId,
      provider: request.provider,
      authMode,
      backend: request.backend,
      executionProfile: request.executionProfile,
    },
    now: request.now ?? (() => new Date()),
    maxTtlMs: request.accountIdentityMaxTtlMs ?? DEFAULT_ACCOUNT_IDENTITY_MAX_TTL_MS,
  }).catch((error: unknown) => ({ state: 'hold' as const, detail: errorDetail(error) }));
  if (account.state === 'hold') {
    return hold('account_identity_unavailable', account.detail);
  }

  const observationBackend: {
    transport: InvocationTransport;
    executionBackend: Exclude<InvocationExecutionBackend, 'unknown'>;
    endpointRefHash: string | null;
  } = { transport, executionBackend: exactBackend, endpointRefHash };

  let observed;
  try {
    observed = await selection.sources.limit.observe({
      tenantId: request.tenantId,
      projectId: request.projectId,
      provider: request.provider,
      model: request.model,
      authMode,
      accountRefHash: account.accountRefHash,
      accountEvidence: account.accountEvidence,
      backend: observationBackend,
    });
  } catch (error) {
    return hold('limit_source_failure', errorDetail(error));
  }

  // Live truth only: a source that declares required windows authors them; one
  // that reports windows without declaring the requirement authors those ids.
  // Neither is a default table, and an empty observation authors nothing.
  const windowIds = observed.requiredWindowIds.length > 0
    ? [...observed.requiredWindowIds]
    : observed.windows.map(window => window.windowId);
  if (windowIds.length === 0) {
    return hold('limit_windows_unavailable', `${observed.state}:${selection.sources.limit.authorityRef}`);
  }

  const quotaScopeRefHash = deriveProviderQuotaScopeRefHash({
    tenantId: request.tenantId,
    provider: request.provider,
    accountRefHash: account.accountRefHash,
    authMode,
    backend: observationBackend,
  });

  const sourceScope: ProviderLimitPolicySourceScopeConfig = {
    sourceKind: selection.sources.limit.kind,
    authority: selection.sources.limit.authority,
    transport,
    executionBackend: exactBackend,
    endpointRefHash,
  };
  const selector: ProviderLimitPolicySelectorConfig = {
    tenantId: request.tenantId,
    provider: request.provider,
    accountRefHash: account.accountRefHash,
    quotaScopeRefHash,
    authMode,
    backend: { transport, executionBackend: exactBackend, endpointRefHash },
    requiredWindowIds: windowIds,
    sourceScopes: [sourceScope],
  };
  const config: ProviderLimitsConfig = {
    schemaVersion: PROVIDER_LIMIT_POLICY_SCHEMA_VERSION,
    authorityRef: `provider-limit-authored:${createHash('sha256')
      .update(canonicalJson({
        schemaVersion: PROVIDER_LIMIT_POLICY_SCHEMA_VERSION,
        selector,
        values: request.values,
        sourceResolverAuthorityRef: request.sourceResolver.authorityRef,
        selectionAuthorityEvidenceRef: selection.authorityEvidenceRef,
        limitSourceAuthorityRef: selection.sources.limit.authorityRef,
        accountSourceAuthorityRef: selection.sources.account.authorityRef,
      }))
      .digest('hex')}`,
    policies: [{ selector, values: request.values }],
  };

  // Validate with the consuming code itself — the parent layer must normalize
  // complete, and the runtime resolver must find this exact policy under the
  // reduced account/quota key it derives at admission time. A hash this module
  // got wrong fails HERE, not silently at the next run's admission.
  const parent = { scope: 'global' as const, config };
  let selectorDigest: string;
  let policyRef: string;
  try {
    createProviderLimitPolicyAuthoritySnapshot({ parent: config, project: null });
    const resolved = resolveProviderLimitPolicy({ selector, parent });
    if (resolved.state === 'hold') {
      return hold('policy_invalid', `${resolved.reasonCode}:${resolved.detail}`);
    }
    const runtime = createProviderLimitPolicyRuntimeResolver({ parent });
    if (runtime.state === 'hold') {
      return hold('policy_invalid', `${runtime.reasonCode}:${runtime.detail}`);
    }
    const runtimePolicy = runtime.resolve({
      tenantId: request.tenantId,
      provider: request.provider,
      accountRefHash: account.accountRefHash,
      quotaScopeRefHash,
      authMode,
    });
    if (!runtimePolicy || runtimePolicy.policyRef !== resolved.policy.policyRef) {
      return hold('policy_invalid', 'runtime-resolver-does-not-select-authored-selector');
    }
    selectorDigest = resolved.selectorDigest;
    policyRef = resolved.policy.policyRef;
  } catch (error) {
    return hold('policy_invalid', errorDetail(error));
  }

  return {
    state: 'ready',
    config,
    selector,
    accountRefHash: account.accountRefHash,
    quotaScopeRefHash,
    selectorDigest,
    policyRef,
    authorityEvidenceRef: evidenceRef('ready', {
      authorityRef: config.authorityRef,
      selectorDigest,
      policyRef,
    }),
  };
}

/**
 * Persist a prepared transition into the global config layer. Refuses without
 * an explicit owner decision, serializes cooperating writers with an exclusive
 * sidecar, and re-checks the prepared authority revision before atomic rename.
 */
export async function writeProviderLimitsAuthority(
  request: ProviderLimitsWriteRequest,
): Promise<ProviderLimitsWriteResult> {
  if (!request.ownerConfirmed) {
    return {
      state: 'refused',
      reasonCode: 'owner_confirmation_required',
      detail: request.plan.authorityRef,
    };
  }

  const { configPath } = request.plan;
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const lockPath = `${configPath}.provider-limits.lock`;
  let lock: FileHandle | undefined;
  try {
    lock = await open(lockPath, 'wx', 0o600);
    await lock.writeFile(`${JSON.stringify({
      schemaVersion: 1,
      pid: process.pid,
      createdAt: new Date().toISOString(),
      expectedAuthorityRef: request.plan.expectedAuthorityRef,
    })}\n`, 'utf-8');
    await lock.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return {
        state: 'refused',
        reasonCode: 'config_write_in_progress',
        detail: lockPath,
      };
    }
    if (lock) await unlink(lockPath).catch(() => undefined);
    throw error;
  } finally {
    await lock?.close();
  }

  try {
    const existing = await readGlobalConfigForAuthoring(configPath);
    if (existing.state === 'refused') return existing;
    const actualAuthorityRef = existing.config.provider_limits?.authorityRef ?? null;
    if (actualAuthorityRef !== request.plan.expectedAuthorityRef) {
      return {
        state: 'refused',
        reasonCode: 'provider_limits_authority_changed',
        detail: actualAuthorityRef ?? 'none',
      };
    }
    if (request.plan.action === 'unchanged') {
      return {
        state: 'unchanged',
        action: request.plan.action,
        configPath,
        authorityRef: request.plan.authorityRef,
      };
    }
    const merged: Partial<DeckentConfig> = {
      ...existing.config,
      provider_limits: request.plan.config,
    };
    await writeGlobalConfigAtomic(configPath, merged);
    return {
      state: 'written',
      action: request.plan.action,
      configPath,
      authorityRef: request.plan.authorityRef,
    };
  } finally {
    // Only the holder that created this exclusive sidecar reaches here.
    await unlink(lockPath).catch(() => undefined);
  }
}

async function readGlobalConfigForAuthoring(
  configPath: string,
): Promise<
  | { readonly state: 'ready'; readonly config: Partial<DeckentConfig> }
  | Extract<ProviderLimitsWritePlan, { state: 'refused' }>
> {
  const loaded = await loadGlobalConfig(configPath);
  if (loaded === null && existsSync(configPath)) {
    return {
      state: 'refused',
      reasonCode: 'config_unreadable',
      detail: configPath,
    };
  }
  return { state: 'ready', config: loaded ?? {} };
}

function mergedAuthorityRef(input: {
  readonly previousAuthorityRef: string;
  readonly proposalAuthorityRef: string;
  readonly policies: ProviderLimitsConfig['policies'];
}): string {
  return `provider-limit-authored:${createHash('sha256')
    .update(canonicalJson({ schemaVersion: PROVIDER_LIMIT_POLICY_SCHEMA_VERSION, ...input }))
    .digest('hex')}`;
}

/**
 * Prepare the exact owner-visible transition before confirmation. The returned
 * expectedAuthorityRef is the CAS token re-checked while the write lock is held.
 */
export async function prepareProviderLimitsAuthorityWrite(
  request: PrepareProviderLimitsWriteRequest,
): Promise<ProviderLimitsWritePlan> {
  const configPath = request.configPath ?? resolveGlobalConfigReadPath();
  const existing = await readGlobalConfigForAuthoring(configPath);
  if (existing.state === 'refused') return existing;
  const current = existing.config.provider_limits;
  if (!current) {
    return {
      state: 'ready',
      action: 'create',
      configPath,
      expectedAuthorityRef: null,
      config: request.proposal.config,
      authorityRef: request.proposal.config.authorityRef,
    };
  }

  try {
    const currentSnapshot = createProviderLimitPolicyAuthoritySnapshot({
      parent: current,
      project: null,
    });
    const proposalSnapshot = createProviderLimitPolicyAuthoritySnapshot({
      parent: request.proposal.config,
      project: null,
    });
    const normalizedCurrent = currentSnapshot.parent!.config;
    const proposedEntries = proposalSnapshot.parent!.config.policies;
    const proposedEntry = proposedEntries[0];
    if (!proposedEntry || proposedEntries.length !== 1) {
      throw new DeckentError(
        'Provider-limit proposal must contain exactly one policy',
        'Provider-limit proposal must contain exactly one policy',
      );
    }
    const proposedSelectorKey = canonicalJson(proposedEntry.selector);
    const existingIndex = normalizedCurrent.policies.findIndex(
      entry => canonicalJson(entry.selector) === proposedSelectorKey,
    );
    const currentEntry = existingIndex >= 0
      ? normalizedCurrent.policies[existingIndex]
      : undefined;
    if (currentEntry && canonicalJson(currentEntry.values) === canonicalJson(proposedEntry.values)) {
      return {
        state: 'ready',
        action: 'unchanged',
        configPath,
        expectedAuthorityRef: current.authorityRef,
        config: current,
        authorityRef: current.authorityRef,
      };
    }
    const policies = normalizedCurrent.policies.map(entry => structuredClone(entry));
    if (existingIndex >= 0) policies[existingIndex] = structuredClone(proposedEntry);
    else policies.push(structuredClone(proposedEntry));
    const config: ProviderLimitsConfig = {
      schemaVersion: PROVIDER_LIMIT_POLICY_SCHEMA_VERSION,
      authorityRef: mergedAuthorityRef({
        previousAuthorityRef: current.authorityRef,
        proposalAuthorityRef: request.proposal.config.authorityRef,
        policies,
      }),
      policies,
    };
    createProviderLimitPolicyAuthoritySnapshot({ parent: config, project: null });
    const runtime = createProviderLimitPolicyRuntimeResolver({
      parent: { scope: 'global', config },
    });
    if (runtime.state === 'hold') {
      throw new DeckentError(
        runtime.reasonCode,
        `${runtime.reasonCode}:${runtime.detail}`,
      );
    }
    return {
      state: 'ready',
      action: existingIndex >= 0 ? 'update' : 'add',
      configPath,
      expectedAuthorityRef: current.authorityRef,
      config,
      authorityRef: config.authorityRef,
    };
  } catch (error) {
    return {
      state: 'refused',
      reasonCode: 'provider_limits_invalid',
      detail: errorDetail(error),
    };
  }
}

async function writeGlobalConfigAtomic(
  configPath: string,
  config: Partial<DeckentConfig>,
): Promise<void> {
  const tmpPath = `${configPath}.${randomUUID()}.tmp`;
  let handle: FileHandle | undefined;
  try {
    handle = await open(tmpPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tmpPath, configPath);
    await chmod(configPath, 0o600).catch(error => {
      if (process.platform !== 'win32') throw error;
    });
    if (process.platform !== 'win32') {
      const directory = await open(dirname(configPath), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(tmpPath).catch(() => undefined);
  }
}
