import { createHash } from 'node:crypto';

import { canonicalJson } from './audit-writer.js';
import type {
  ProviderLimitPolicyAuthoritySnapshot,
  ProviderLimitPolicyEntryConfig,
  ProviderLimitPolicySelectorConfig,
  ProviderLimitPolicyValuesConfig,
  ProviderLimitsConfig,
} from './config-types.js';
import type {
  ProviderLimitPolicy,
  ProviderLimitResult,
  ProviderLimitUnit,
} from './provider-limit-truth.js';
import {
  assertCanonicalProviderId,
  assertOpaqueEvidenceRef,
  assertOpaqueSha256,
} from './provider-truth.js';
import { createExecutionAdmissionError } from './errors.js';

export const PROVIDER_LIMIT_POLICY_SCHEMA_VERSION = 1 as const;

export type ProviderLimitPolicyParentScope = 'global' | 'tenant';
export type ProviderLimitPolicyHoldReason =
  | 'policy_authority_unavailable'
  | 'policy_selector_unavailable'
  | 'policy_selector_ambiguous'
  | 'project_policy_without_parent'
  | 'project_policy_widens_authority';

export interface ProviderLimitPolicyLayer {
  scope: ProviderLimitPolicyParentScope | 'project';
  config: ProviderLimitsConfig;
}

export interface ResolveProviderLimitPolicyInput {
  selector: ProviderLimitPolicySelectorConfig;
  parent: ProviderLimitPolicyLayer | null;
  project?: ProviderLimitPolicyLayer | null;
}

export interface ResolvedProviderLimitPolicy {
  state: 'ready';
  policy: ProviderLimitPolicy;
  selectorDigest: string;
  parentAuthorityRef: string;
  projectAuthorityRef: string | null;
}

export interface ProviderLimitPolicyHold {
  state: 'hold';
  reasonCode: ProviderLimitPolicyHoldReason;
  detail: string;
}

export type ProviderLimitPolicyResolution =
  | ResolvedProviderLimitPolicy
  | ProviderLimitPolicyHold;

export interface ProviderLimitAuthoritySelectorQuery {
  readonly tenantId: string;
  readonly provider: string;
  readonly authMode: ProviderLimitResult['authMode'];
  readonly transport: ProviderLimitPolicySelectorConfig['backend']['transport'];
  readonly executionBackend:
    ProviderLimitPolicySelectorConfig['backend']['executionBackend'];
  readonly endpointRefHash: string | null;
}

export type ProviderLimitAuthoritySelectorProjection =
  | {
      readonly state: 'ready';
      readonly selector: Readonly<ProviderLimitPolicySelectorConfig>;
      readonly policy: ProviderLimitPolicy;
      readonly selectorDigest: string;
      readonly authorityEvidenceRef: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'xverify_provider_scope_unavailable'
        | 'xverify_provider_scope_ambiguous'
        | 'xverify_provider_scope_invalid';
      readonly authorityEvidenceRef: string;
    };

/**
 * The account/quota identity available to ProviderLimitStore at read and
 * reservation time. Full backend/source/window identity remains in the authored
 * selector and its policyRef; this reduced key may select a policy only when it
 * maps to exactly one pre-resolved full selector.
 */
export interface ProviderLimitPolicyRuntimeQuery {
  readonly tenantId: string;
  readonly provider: string;
  readonly accountRefHash: string | null;
  readonly quotaScopeRefHash: string;
  readonly authMode: ProviderLimitResult['authMode'];
}

export interface ProviderLimitPolicyRuntimeResolverReady {
  readonly state: 'ready';
  readonly authorityRef: string;
  resolve(query: ProviderLimitPolicyRuntimeQuery): ProviderLimitPolicy | null;
}

export type ProviderLimitPolicyRuntimeResolver =
  | ProviderLimitPolicyRuntimeResolverReady
  | ProviderLimitPolicyHold;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

const UNITS = new Set<ProviderLimitUnit>([
  'percent',
  'requests',
  'tokens',
  'credits',
  'usd',
]);
const AUTH_MODES = new Set(['subscription', 'api', 'hybrid', 'local']);
const TRANSPORTS = new Set(['cli', 'api', 'http', 'local-runtime']);
const EXECUTION_BACKENDS = new Set([
  'host-subprocess',
  'docker',
  'tmux',
  'api',
  'in-process',
]);
const SOURCE_KINDS = new Set([
  'provider-cli',
  'provider-api',
  'http-headers',
  'historical-transcript',
  'local-runtime',
  'operator',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  if (unknown) throw createExecutionAdmissionError(`Unknown provider_limits field "${unknown}"`);
  const missing = required.find(key => !(key in value));
  if (missing) throw createExecutionAdmissionError(`Missing provider_limits field "${missing}"`);
}

function assertCanonicalText(name: string, value: unknown): asserts value is string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value !== value.trim()
    || value !== value.normalize('NFC')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw createExecutionAdmissionError(`${name} must be a non-empty canonical string`);
  }
}

function assertRatio(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw createExecutionAdmissionError(`${name} must be a finite ratio between 0 and 1`);
  }
}

function normalizeValues(
  value: ProviderLimitPolicyValuesConfig,
  requireComplete: boolean,
): ProviderLimitPolicyValuesConfig {
  if (!isRecord(value)) throw createExecutionAdmissionError('provider_limits policy values must be an object');
  assertExactKeys(value, [], [
    'ratioEnforcement',
    'warnAtRatio',
    'blockAtRatio',
    'minimumRemaining',
  ]);
  if (requireComplete && (value.warnAtRatio === undefined || value.blockAtRatio === undefined)) {
    throw createExecutionAdmissionError('Parent provider_limits policy requires warnAtRatio and blockAtRatio');
  }
  if (value.warnAtRatio !== undefined) assertRatio('warnAtRatio', value.warnAtRatio);
  if (value.blockAtRatio !== undefined) assertRatio('blockAtRatio', value.blockAtRatio);
  if (value.ratioEnforcement !== undefined
    && value.ratioEnforcement !== 'enforce'
    && value.ratioEnforcement !== 'observe_only') {
    throw createExecutionAdmissionError(
      'provider_limits ratioEnforcement must be enforce or observe_only',
    );
  }
  const minimumRemaining: Partial<Record<ProviderLimitUnit, number>> = {};
  if (value.minimumRemaining !== undefined) {
    if (!isRecord(value.minimumRemaining)) {
      throw createExecutionAdmissionError('minimumRemaining must be an object');
    }
    for (const [unit, amount] of Object.entries(value.minimumRemaining)) {
      if (!UNITS.has(unit as ProviderLimitUnit)) {
        throw createExecutionAdmissionError(`Unsupported provider limit unit "${unit}"`);
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw createExecutionAdmissionError(`minimumRemaining.${unit} must be a non-negative finite number`);
      }
      minimumRemaining[unit as ProviderLimitUnit] = amount;
    }
  }
  if (
    !requireComplete
    && value.warnAtRatio === undefined
    && value.blockAtRatio === undefined
    && value.ratioEnforcement === undefined
    && Object.keys(minimumRemaining).length === 0
  ) {
    throw createExecutionAdmissionError('Project provider_limits policy must tighten at least one value');
  }
  if (
    value.warnAtRatio !== undefined
    && value.blockAtRatio !== undefined
    && value.warnAtRatio > value.blockAtRatio
  ) {
    throw createExecutionAdmissionError('warnAtRatio cannot exceed blockAtRatio');
  }
  return {
    ...((requireComplete || value.ratioEnforcement !== undefined)
      ? { ratioEnforcement: value.ratioEnforcement ?? 'enforce' }
      : {}),
    ...(value.warnAtRatio !== undefined ? { warnAtRatio: value.warnAtRatio } : {}),
    ...(value.blockAtRatio !== undefined ? { blockAtRatio: value.blockAtRatio } : {}),
    ...(Object.keys(minimumRemaining).length > 0
      ? { minimumRemaining: Object.fromEntries(
          Object.entries(minimumRemaining).sort(([left], [right]) => left.localeCompare(right)),
        ) }
      : {}),
  };
}

function normalizeSelector(
  selector: ProviderLimitPolicySelectorConfig,
): ProviderLimitPolicySelectorConfig {
  if (!isRecord(selector)) throw createExecutionAdmissionError('provider_limits selector must be an object');
  assertExactKeys(selector, [
    'tenantId',
    'provider',
    'accountRefHash',
    'quotaScopeRefHash',
    'authMode',
    'backend',
    'requiredWindowIds',
    'sourceScopes',
  ]);
  assertCanonicalText('provider_limits selector tenantId', selector.tenantId);
  assertCanonicalProviderId(selector.provider);
  if (!AUTH_MODES.has(selector.authMode)) {
    throw createExecutionAdmissionError('provider_limits selector authMode must be exact');
  }
  assertOpaqueSha256(
    'provider_limits selector accountRefHash',
    selector.accountRefHash,
    selector.authMode !== 'local',
  );
  assertOpaqueSha256(
    'provider_limits selector quotaScopeRefHash',
    selector.quotaScopeRefHash,
    true,
  );
  if (!isRecord(selector.backend)) throw createExecutionAdmissionError('provider_limits selector backend must be an object');
  assertExactKeys(selector.backend, ['transport', 'executionBackend', 'endpointRefHash']);
  if (!TRANSPORTS.has(selector.backend.transport)) {
    throw createExecutionAdmissionError('provider_limits selector transport is unsupported');
  }
  if (!EXECUTION_BACKENDS.has(selector.backend.executionBackend)) {
    throw createExecutionAdmissionError('provider_limits selector executionBackend must be exact');
  }
  assertOpaqueSha256(
    'provider_limits selector endpointRefHash',
    selector.backend.endpointRefHash,
    false,
  );
  if (
    !Array.isArray(selector.requiredWindowIds)
    || selector.requiredWindowIds.length === 0
  ) {
    throw createExecutionAdmissionError('provider_limits selector requires at least one window id');
  }
  const requiredWindowIds = selector.requiredWindowIds.map((windowId, index) => {
    assertCanonicalText(`provider_limits requiredWindowIds[${index}]`, windowId);
    return windowId;
  });
  if (new Set(requiredWindowIds).size !== requiredWindowIds.length) {
    throw createExecutionAdmissionError('provider_limits requiredWindowIds must be distinct');
  }
  if (!Array.isArray(selector.sourceScopes) || selector.sourceScopes.length === 0) {
    throw createExecutionAdmissionError('provider_limits selector requires at least one source scope');
  }
  const sourceScopes = selector.sourceScopes.map((scope, index) => {
    if (!isRecord(scope)) throw createExecutionAdmissionError(`provider_limits sourceScopes[${index}] must be an object`);
    assertExactKeys(scope, [
      'sourceKind',
      'authority',
      'transport',
      'executionBackend',
      'endpointRefHash',
    ]);
    if (!SOURCE_KINDS.has(scope.sourceKind)) {
      throw createExecutionAdmissionError(`provider_limits sourceScopes[${index}].sourceKind is unsupported`);
    }
    if (scope.authority !== 'authoritative' && scope.authority !== 'advisory') {
      throw createExecutionAdmissionError(`provider_limits sourceScopes[${index}].authority is invalid`);
    }
    if (!TRANSPORTS.has(scope.transport)) {
      throw createExecutionAdmissionError(`provider_limits sourceScopes[${index}].transport is unsupported`);
    }
    if (!EXECUTION_BACKENDS.has(scope.executionBackend)) {
      throw createExecutionAdmissionError(`provider_limits sourceScopes[${index}].executionBackend must be exact`);
    }
    assertOpaqueSha256(
      `provider_limits sourceScopes[${index}].endpointRefHash`,
      scope.endpointRefHash,
      false,
    );
    return { ...scope };
  }).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  const sourceScopeKeys = sourceScopes.map(scope => canonicalJson(scope));
  if (new Set(sourceScopeKeys).size !== sourceScopeKeys.length) {
    throw createExecutionAdmissionError('provider_limits sourceScopes must be distinct');
  }
  return {
    tenantId: selector.tenantId,
    provider: selector.provider,
    accountRefHash: selector.accountRefHash,
    quotaScopeRefHash: selector.quotaScopeRefHash,
    authMode: selector.authMode,
    backend: { ...selector.backend },
    requiredWindowIds: [...requiredWindowIds].sort(),
    sourceScopes,
  };
}

function normalizeEntry(
  entry: ProviderLimitPolicyEntryConfig,
  requireComplete: boolean,
): ProviderLimitPolicyEntryConfig {
  if (!isRecord(entry)) throw createExecutionAdmissionError('provider_limits policy entry must be an object');
  assertExactKeys(entry, ['selector', 'values']);
  return {
    selector: normalizeSelector(entry.selector),
    values: normalizeValues(entry.values, requireComplete),
  };
}

function normalizeConfig(
  value: ProviderLimitsConfig,
  requireComplete: boolean,
): ProviderLimitsConfig {
  if (!isRecord(value)) throw createExecutionAdmissionError('provider_limits must be an object');
  assertExactKeys(value, ['schemaVersion', 'authorityRef', 'policies']);
  if (value.schemaVersion !== PROVIDER_LIMIT_POLICY_SCHEMA_VERSION) {
    throw createExecutionAdmissionError(`provider_limits schemaVersion must be ${PROVIDER_LIMIT_POLICY_SCHEMA_VERSION}`);
  }
  assertOpaqueEvidenceRef('provider_limits authorityRef', value.authorityRef, true);
  if (!Array.isArray(value.policies) || value.policies.length === 0) {
    throw createExecutionAdmissionError('provider_limits policies must contain at least one entry');
  }
  const policies = value.policies.map(entry => normalizeEntry(entry, requireComplete));
  const selectorKeys = policies.map(entry => canonicalJson(entry.selector));
  if (new Set(selectorKeys).size !== selectorKeys.length) {
    throw createExecutionAdmissionError('provider_limits policies contain a duplicate selector');
  }
  policies.sort((left, right) =>
    canonicalJson(left.selector).localeCompare(canonicalJson(right.selector)));
  return {
    schemaVersion: PROVIDER_LIMIT_POLICY_SCHEMA_VERSION,
    authorityRef: value.authorityRef,
    policies,
  };
}

export function assertProviderLimitsConfig(value: ProviderLimitsConfig): void {
  normalizeConfig(value, false);
}

function selectorKey(selector: ProviderLimitPolicySelectorConfig): string {
  return canonicalJson(normalizeSelector(selector));
}

/**
 * Select one full provider-limit scope from the immutable authored envelope.
 *
 * This deliberately does not inspect either truth store. The caller supplies
 * the exact runtime/backend identity and receives either one full selector or
 * a typed HOLD. Policy declaration order is never a fallback authority.
 */
export function projectExactProviderLimitAuthoritySelector(
  authority: ProviderLimitPolicyAuthoritySnapshot | null | undefined,
  query: ProviderLimitAuthoritySelectorQuery,
): ProviderLimitAuthoritySelectorProjection {
  const ref = (kind: string, detail: unknown): string =>
    `xverify-provider-scope:${createHash('sha256')
      .update(`${kind}\0${canonicalJson(detail)}`)
      .digest('hex')}`;
  try {
    assertCanonicalText('provider scope tenantId', query.tenantId);
    assertCanonicalProviderId(query.provider);
    if (!AUTH_MODES.has(query.authMode)
      || !TRANSPORTS.has(query.transport)
      || !EXECUTION_BACKENDS.has(query.executionBackend)) {
      throw createExecutionAdmissionError('Provider scope query is not exact');
    }
    assertOpaqueSha256('provider scope endpointRefHash', query.endpointRefHash, false);
    if (!authority?.parent) {
      return {
        state: 'hold',
        reasonCode: 'xverify_provider_scope_unavailable',
        authorityEvidenceRef: ref('unavailable', query),
      };
    }
    const parent = normalizeConfig(authority.parent.config, true);
    const matches = parent.policies.filter(entry => {
      const selector = entry.selector;
      return selector.tenantId === query.tenantId
        && selector.provider === query.provider
        && selector.authMode === query.authMode
        && selector.backend.transport === query.transport
        && selector.backend.executionBackend === query.executionBackend
        && selector.backend.endpointRefHash === query.endpointRefHash;
    });
    if (matches.length === 0) {
      return {
        state: 'hold',
        reasonCode: 'xverify_provider_scope_unavailable',
        authorityEvidenceRef: ref('unavailable', query),
      };
    }
    if (matches.length !== 1) {
      return {
        state: 'hold',
        reasonCode: 'xverify_provider_scope_ambiguous',
        authorityEvidenceRef: ref('ambiguous', {
          query,
          selectors: matches.map(match => match.selector),
        }),
      };
    }
    const selector = matches[0]!.selector;
    const resolved = resolveProviderLimitPolicy({
      selector,
      parent: authority.parent,
      project: authority.project,
    });
    if (resolved.state === 'hold') {
      return {
        state: 'hold',
        reasonCode: 'xverify_provider_scope_invalid',
        authorityEvidenceRef: ref('invalid', resolved),
      };
    }
    return deepFreeze({
      state: 'ready' as const,
      selector,
      policy: resolved.policy,
      selectorDigest: resolved.selectorDigest,
      authorityEvidenceRef: ref('ready', {
        authorityRef: authority.authorityRef,
        selectorDigest: resolved.selectorDigest,
        policyRef: resolved.policy.policyRef,
      }),
    });
  } catch (error) {
    return {
      state: 'hold',
      reasonCode: 'xverify_provider_scope_invalid',
      authorityEvidenceRef: ref(
        'invalid',
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

function runtimeSelectorKey(
  selector: ProviderLimitPolicyRuntimeQuery,
): string {
  assertCanonicalText('provider_limits runtime tenantId', selector.tenantId);
  assertCanonicalProviderId(selector.provider);
  if (!AUTH_MODES.has(selector.authMode)) {
    throw createExecutionAdmissionError('provider_limits runtime authMode must be exact');
  }
  assertOpaqueSha256(
    'provider_limits runtime accountRefHash',
    selector.accountRefHash,
    selector.authMode !== 'local',
  );
  assertOpaqueSha256(
    'provider_limits runtime quotaScopeRefHash',
    selector.quotaScopeRefHash,
    true,
  );
  return canonicalJson({
    tenantId: selector.tenantId,
    provider: selector.provider,
    accountRefHash: selector.accountRefHash,
    quotaScopeRefHash: selector.quotaScopeRefHash,
    authMode: selector.authMode,
  });
}

function findPolicy(
  config: ProviderLimitsConfig,
  selector: ProviderLimitPolicySelectorConfig,
  requireComplete: boolean,
): ProviderLimitPolicyEntryConfig | null {
  const normalized = normalizeConfig(config, requireComplete);
  const key = selectorKey(selector);
  return normalized.policies.find(entry => canonicalJson(entry.selector) === key) ?? null;
}

function wideningDetail(
  parent: ProviderLimitPolicyValuesConfig,
  project: ProviderLimitPolicyValuesConfig,
): string | null {
  const parentRatioEnforcement = parent.ratioEnforcement ?? 'enforce';
  if (project.ratioEnforcement === 'observe_only' && parentRatioEnforcement === 'enforce') {
    return 'project ratioEnforcement observe_only widens parent enforce authority';
  }
  if (project.warnAtRatio !== undefined && project.warnAtRatio > parent.warnAtRatio!) {
    return `project warnAtRatio ${project.warnAtRatio} exceeds parent ${parent.warnAtRatio}`;
  }
  if (project.blockAtRatio !== undefined && project.blockAtRatio > parent.blockAtRatio!) {
    return `project blockAtRatio ${project.blockAtRatio} exceeds parent ${parent.blockAtRatio}`;
  }
  for (const [unit, parentFloor] of Object.entries(parent.minimumRemaining ?? {})) {
    const projectFloor = project.minimumRemaining?.[unit as ProviderLimitUnit];
    if (projectFloor !== undefined && projectFloor < parentFloor) {
      return `project minimumRemaining.${unit} ${projectFloor} is below parent ${parentFloor}`;
    }
  }
  for (const [unit, projectFloor] of Object.entries(project.minimumRemaining ?? {})) {
    if ((parent.minimumRemaining?.[unit as ProviderLimitUnit] ?? 0) === 0 && projectFloor <= 0) {
      return `project minimumRemaining.${unit} must add a positive floor`;
    }
  }
  const warnAtRatio = project.warnAtRatio ?? parent.warnAtRatio!;
  const blockAtRatio = project.blockAtRatio ?? parent.blockAtRatio!;
  if (warnAtRatio > blockAtRatio) {
    return `effective warnAtRatio ${warnAtRatio} exceeds blockAtRatio ${blockAtRatio}`;
  }
  return null;
}

export function assertProviderLimitPolicyLayerPrecedence(
  parent: ProviderLimitsConfig | null | undefined,
  project: ProviderLimitsConfig | null | undefined,
): void {
  if (!project) {
    if (parent) normalizeConfig(parent, true);
    return;
  }
  if (!parent) {
    throw createExecutionAdmissionError('Project provider_limits cannot substitute for missing parent authority');
  }
  const normalizedParent = normalizeConfig(parent, true);
  const normalizedProject = normalizeConfig(project, false);
  const parentBySelector = new Map(
    normalizedParent.policies.map(entry => [canonicalJson(entry.selector), entry]),
  );
  for (const projectEntry of normalizedProject.policies) {
    const parentEntry = parentBySelector.get(canonicalJson(projectEntry.selector));
    if (!parentEntry) {
      throw createExecutionAdmissionError('Project provider_limits selector has no matching parent authority');
    }
    const detail = wideningDetail(parentEntry.values, projectEntry.values);
    if (detail) throw createExecutionAdmissionError(`Project provider_limits widens parent authority: ${detail}`);
  }
}

/**
 * Preserve authored provider-limit layers before generic config merging.
 * The returned snapshot is normalized, digest-bound and deeply immutable so
 * no consumer can relabel a project tightening layer as parent authority.
 */
export function createProviderLimitPolicyAuthoritySnapshot(input: {
  parent: ProviderLimitsConfig | null | undefined;
  project: ProviderLimitsConfig | null | undefined;
  parentScope?: ProviderLimitPolicyParentScope;
}): ProviderLimitPolicyAuthoritySnapshot {
  assertProviderLimitPolicyLayerPrecedence(input.parent, input.project);
  const parent = input.parent
    ? {
        scope: input.parentScope ?? 'global',
        config: normalizeConfig(input.parent, true),
      } as const
    : null;
  const project = input.project
    ? {
        scope: 'project',
        config: normalizeConfig(input.project, false),
      } as const
    : null;
  const canonical = {
    schemaVersion: PROVIDER_LIMIT_POLICY_SCHEMA_VERSION,
    parent,
    project,
  };
  const authorityRef = `provider-limit-authored-layers:${
    createHash('sha256').update(canonicalJson(canonical)).digest('hex')
  }`;
  return deepFreeze({
    ...canonical,
    authorityRef,
  });
}

export function resolveProviderLimitPolicy(
  input: ResolveProviderLimitPolicyInput,
): ProviderLimitPolicyResolution {
  if (!input.parent) {
    return {
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      detail: 'Provider-limit parent authority is missing',
    };
  }
  if (input.parent.scope === 'project') {
    return {
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      detail: 'Provider-limit parent authority must be global or verified tenant scope',
    };
  }
  if (input.project?.scope !== undefined && input.project.scope !== 'project') {
    return {
      state: 'hold',
      reasonCode: 'project_policy_without_parent',
      detail: 'Provider-limit tightening layer must be project-scoped',
    };
  }
  if (input.project) {
    try {
      assertProviderLimitPolicyLayerPrecedence(
        input.parent.config,
        input.project.config,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        state: 'hold',
        reasonCode: detail.includes('widens')
          ? 'project_policy_widens_authority'
          : 'project_policy_without_parent',
        detail,
      };
    }
  }
  const parentEntry = findPolicy(input.parent.config, input.selector, true);
  if (!parentEntry) {
    return {
      state: 'hold',
      reasonCode: 'policy_selector_unavailable',
      detail: 'Provider-limit parent authority has no exact selector',
    };
  }
  const projectEntry = input.project
    ? findPolicy(input.project.config, input.selector, false)
    : null;
  if (projectEntry) {
    const detail = wideningDetail(parentEntry.values, projectEntry.values);
    if (detail) {
      return {
        state: 'hold',
        reasonCode: 'project_policy_widens_authority',
        detail,
      };
    }
  }
  const effectiveValues = {
    ratioEnforcement: projectEntry?.values.ratioEnforcement
      ?? parentEntry.values.ratioEnforcement
      ?? 'enforce',
    warnAtRatio: projectEntry?.values.warnAtRatio ?? parentEntry.values.warnAtRatio!,
    blockAtRatio: projectEntry?.values.blockAtRatio ?? parentEntry.values.blockAtRatio!,
    minimumRemaining: {
      ...(parentEntry.values.minimumRemaining ?? {}),
      ...(projectEntry?.values.minimumRemaining ?? {}),
    },
  };
  const normalizedSelector = normalizeSelector(input.selector);
  const selectorDigest = createHash('sha256')
    .update(canonicalJson(normalizedSelector))
    .digest('hex');
  const projectAuthorityRef = projectEntry && input.project
    ? input.project.config.authorityRef
    : null;
  const policyDigest = createHash('sha256').update(canonicalJson({
    schemaVersion: PROVIDER_LIMIT_POLICY_SCHEMA_VERSION,
    selector: normalizedSelector,
    parent: {
      scope: input.parent.scope,
      authorityRef: input.parent.config.authorityRef,
    },
    projectAuthorityRef,
    values: effectiveValues,
  })).digest('hex');
  return {
    state: 'ready',
    policy: {
      policyRef: `provider-limit-policy:${policyDigest}`,
      ratioEnforcement: effectiveValues.ratioEnforcement,
      warnAtRatio: effectiveValues.warnAtRatio,
      blockAtRatio: effectiveValues.blockAtRatio,
      minimumRemaining: effectiveValues.minimumRemaining,
    },
    selectorDigest,
    parentAuthorityRef: input.parent.config.authorityRef,
    projectAuthorityRef,
  };
}

/**
 * Resolves every full authored D1 selector before runtime and exposes only an
 * exact, ambiguity-intolerant account/quota lookup. This is intentionally not a
 * fuzzy fallback: when two full selectors collapse onto the same reduced store
 * query, the resolver returns null and admission remains HOLD.
 */
export function createProviderLimitPolicyRuntimeResolver(input: {
  readonly parent: ProviderLimitPolicyLayer | null;
  readonly project?: ProviderLimitPolicyLayer | null;
}): ProviderLimitPolicyRuntimeResolver {
  if (!input.parent) {
    return {
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      detail: 'Provider-limit parent authority is missing',
    };
  }
  if (input.parent.scope === 'project') {
    return {
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      detail: 'Provider-limit parent authority must be global or verified tenant scope',
    };
  }
  if (input.project?.scope !== undefined && input.project.scope !== 'project') {
    return {
      state: 'hold',
      reasonCode: 'project_policy_without_parent',
      detail: 'Provider-limit tightening layer must be project-scoped',
    };
  }
  try {
    assertProviderLimitPolicyLayerPrecedence(
      input.parent.config,
      input.project?.config,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      state: 'hold',
      reasonCode: detail.includes('widens')
        ? 'project_policy_widens_authority'
        : 'project_policy_without_parent',
      detail,
    };
  }

  const normalizedParent = normalizeConfig(input.parent.config, true);
  const byRuntimeScope = new Map<string, ProviderLimitPolicy | null>();
  const resolvedRefs: string[] = [];
  for (const entry of normalizedParent.policies) {
    const resolved = resolveProviderLimitPolicy({
      selector: entry.selector,
      parent: input.parent,
      project: input.project,
    });
    if (resolved.state === 'hold') return resolved;
    const key = runtimeSelectorKey(entry.selector);
    const existing = byRuntimeScope.get(key);
    if (existing !== undefined && existing?.policyRef !== resolved.policy.policyRef) {
      byRuntimeScope.set(key, null);
    } else {
      const minimumRemaining = Object.freeze({ ...resolved.policy.minimumRemaining });
      byRuntimeScope.set(key, Object.freeze({ ...resolved.policy, minimumRemaining }));
    }
    resolvedRefs.push(resolved.policy.policyRef);
  }

  const ambiguousKeys = [...byRuntimeScope.entries()]
    .filter(([, policy]) => policy === null)
    .map(([key]) => key)
    .sort();
  if (ambiguousKeys.length > 0) {
    return {
      state: 'hold',
      reasonCode: 'policy_selector_ambiguous',
      detail: 'Distinct full provider-limit selectors collapse onto one runtime account/quota scope',
    };
  }
  const authorityRef = `provider-limit-runtime-policy:${createHash('sha256')
    .update(canonicalJson({
      schemaVersion: PROVIDER_LIMIT_POLICY_SCHEMA_VERSION,
      parentScope: input.parent.scope,
      parentAuthorityRef: input.parent.config.authorityRef,
      projectAuthorityRef: input.project?.config.authorityRef ?? null,
      resolvedRefs: resolvedRefs.sort(),
      ambiguousKeys,
    }))
    .digest('hex')}`;

  return Object.freeze({
    state: 'ready' as const,
    authorityRef,
    resolve(query: ProviderLimitPolicyRuntimeQuery): ProviderLimitPolicy | null {
      try {
        return byRuntimeScope.get(runtimeSelectorKey(query)) ?? null;
      } catch {
        return null;
      }
    },
  });
}
