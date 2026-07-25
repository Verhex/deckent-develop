import { createHash } from 'node:crypto';

import { createExecutionAdmissionError } from './errors.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from './provider-authority-composition.js';
import { defaultRoleInvocationPolicy } from './role-invocation-resolver.js';
import type { InvocationPurpose, InvocationRole } from './invocation-receipt.js';

export interface ProviderExecutionIngressRequest {
  readonly runId: string;
  readonly taskId: string;
  readonly provider: string;
  readonly model: string;
  readonly configuredBackend: string;
  readonly fallbackProviders: readonly string[];
  readonly unattended: boolean;
}

export interface ProviderRoleExecutionIngressRequest extends ProviderExecutionIngressRequest {
  readonly role: InvocationRole;
  readonly purpose: InvocationPurpose;
}

export type ProviderExecutionIngressDecision =
  | {
      /**
       * No owner-authored provider-limit authority layer exists. This is the
       * rollout boundary: wiring is present without silently flipping existing
       * execution defaults.
       */
      readonly decision: 'not-configured';
    }
  | {
      readonly decision: 'hold';
      readonly reasonCode: string;
      readonly authorityEvidenceRefs: readonly string[];
    };

export class ProviderExecutionIngressHoldError extends Error {
  readonly code = 'PROVIDER_EXECUTION_AUTHORITY_HOLD';

  constructor(
    readonly reasonCode: string,
    readonly authorityEvidenceRefs: readonly string[],
    readonly request: Readonly<ProviderRoleExecutionIngressRequest>,
    readonly durableEvidenceWritten: boolean = false,
  ) {
    super(`PROVIDER_EXECUTION_AUTHORITY_HOLD:${reasonCode}`);
    this.name = 'ProviderExecutionIngressHoldError';
  }
}

/**
 * Cross-realm/worktree-safe classifier for the typed provider authority HOLD.
 * `instanceof` alone is not stable when ESM test graphs or linked worktrees
 * load more than one copy of this module.
 */
export function isProviderExecutionIngressHoldError(
  value: unknown,
): value is ProviderExecutionIngressHoldError {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record['code'] === 'PROVIDER_EXECUTION_AUTHORITY_HOLD'
    && typeof record['reasonCode'] === 'string'
    && Array.isArray(record['authorityEvidenceRefs'])
    && record['request'] !== null
    && typeof record['request'] === 'object';
}

function ingressEvidenceRef(
  authorityEvidenceRef: string,
  request: ProviderRoleExecutionIngressRequest,
): string {
  return `provider-execution-ingress:${createHash('sha256')
    .update(JSON.stringify({
      authorityEvidenceRef,
      role: request.role,
      purpose: request.purpose,
      runId: request.runId,
      taskId: request.taskId,
      provider: request.provider,
      model: request.model,
      configuredBackend: request.configuredBackend,
      fallbackProviders: request.fallbackProviders,
      unattended: request.unattended,
    }))
    .digest('hex')}`;
}

/**
 * Common pre-mutation provider-authority boundary for one-shot worker surfaces.
 *
 * A configured authority is always consumed through the shared role admission
 * runtime. The current production composition deliberately has no
 * caller-authored exact candidate/query adapter for these surfaces, so an empty
 * candidate map produces the honest HOLD. Adding an ALLOW path belongs to the
 * separately reviewed candidate + route-lock + reservation binding.
 */
export function preflightProviderExecutionIngress(
  authority: ProviderAuthorityRuntimeServiceOpenResult | undefined,
  request: ProviderExecutionIngressRequest,
): ProviderExecutionIngressDecision {
  return preflightProviderRoleExecutionIngress(authority, {
    ...request,
    role: 'worker',
    purpose: 'worker-execution',
  });
}

/**
 * Role-aware front-door variant used by Brain/Worker/Auditor process roots.
 * It shares the exact same no-candidate HOLD semantics as the Worker wrapper;
 * callers cannot gain an ALLOW path by choosing a role.
 */
export function preflightProviderRoleExecutionIngress(
  authority: ProviderAuthorityRuntimeServiceOpenResult | undefined,
  request: ProviderRoleExecutionIngressRequest,
): ProviderExecutionIngressDecision {
  if (!authority) return { decision: 'not-configured' };

  const ingressRef = ingressEvidenceRef(authority.authorityEvidenceRef, request);
  if (authority.state === 'hold') {
    return {
      decision: 'hold',
      reasonCode: authority.reasonCode,
      authorityEvidenceRefs: Object.freeze([
        authority.authorityEvidenceRef,
        ingressRef,
      ]),
    };
  }

  const result = authority.service.roleAdmissionRuntime.admit({
    invocation: {
      role: request.role,
      purpose: request.purpose,
      primaryProvider: request.provider,
      model: request.model,
      fallbackProviders: request.fallbackProviders,
      policy: defaultRoleInvocationPolicy(request.role, request.unattended),
    },
    candidates: {},
    buildReservation: () => {
      throw createExecutionAdmissionError(
        'UNREACHABLE_ONE_SHOT_RESERVATION_WITHOUT_EXACT_CANDIDATE',
      );
    },
  });

  if (result.decision !== 'hold') {
    return {
      decision: 'hold',
      reasonCode: 'dispatch_binding_unavailable',
      authorityEvidenceRefs: Object.freeze([
        authority.authorityEvidenceRef,
        ingressRef,
      ]),
    };
  }

  return {
    decision: 'hold',
    reasonCode: 'candidate_authority_unavailable',
    authorityEvidenceRefs: Object.freeze([
      authority.authorityEvidenceRef,
      result.authorityEvidenceRef,
      ingressRef,
    ]),
  };
}
