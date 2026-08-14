import { createHash } from 'node:crypto';

import type { ProviderAuthorityRuntimeServiceOpenResult } from './provider-authority-composition.js';
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
      /**
       * The authority composition itself is healthy (custody opened, keyring
       * usable, policy layer readable). This is NOT an execution permit: the
       * real provider admission — candidate evidence, route lock, reservation
       * binding — happens at the stage where the exact candidate/backend is
       * resolved (worker spawn, mission dispatch, cross-verify composition).
       * The front door only refuses when the composition itself is broken.
       */
      readonly decision: 'ready';
      readonly authorityEvidenceRefs: readonly string[];
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
 * The front door checks authority COMPOSITION health only (custody, keyring,
 * policy layer). It never runs the role admission itself: the real provider
 * admission consumes exact candidate evidence at the stage where the concrete
 * candidate/backend is resolved, and an empty-candidate admission here could
 * only ever HOLD (the pre-fix behaviour that locked every configured host out
 * of run/start/do/xverify). Fail-closed is preserved: a broken composition is
 * still a typed HOLD, and `ready` grants no execution permit.
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
 * It shares the exact same composition-health semantics as the Worker wrapper;
 * no role gains an execution permit here — `ready` only states the authority
 * composition can serve the later, candidate-bound admission stages.
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

  return {
    decision: 'ready',
    authorityEvidenceRefs: Object.freeze([
      authority.authorityEvidenceRef,
      ingressRef,
    ]),
  };
}
