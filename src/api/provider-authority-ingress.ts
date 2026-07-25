import type { ResolvedConfig } from '../core/config-types.js';
import { resolveBrainModel } from '../core/config.js';
import { getEquivalentModel } from '../core/model-equivalence.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import { preflightProviderRoleExecutionIngress } from '../core/provider-execution-ingress-authority.js';
import { orderedRoleProviders } from '../core/provider.js';
import { registerOpenRouterModelFromCache } from '../core/openrouter-models.js';
import { getLanguage, getMessage } from '../cli/helpers/messages.js';
import { resolveExecutionModelIdentity } from '../orchestra/execution-request-builder.js';
import { writeEvent } from '../orchestra/event-stream.js';

export interface ApiBrainProviderAuthorityHoldBody {
  readonly error: string;
  readonly code: 'PROVIDER_EXECUTION_AUTHORITY_HOLD';
  readonly providerAuthorityHold: {
    readonly executionId: string;
    readonly role: 'brain';
    readonly purpose: 'sprint-planning';
    readonly reasonCode: string;
    readonly authorityEvidenceRefs: readonly string[];
    readonly durableEvidenceWritten: boolean;
  };
}

export type ApiBrainProviderAuthorityDecision =
  | { readonly decision: 'not-configured' }
  | {
      readonly decision: 'hold';
      readonly statusCode: 503;
      readonly body: ApiBrainProviderAuthorityHoldBody;
    };

/**
 * Common HTTP Brain front door. API bearer/OIDC identity authenticates the
 * caller but never authorizes provider execution; every HTTP orchestration
 * request remains unattended until a separately verified attendance contract
 * exists.
 */
export function preflightApiBrainProviderAuthority(
  projectRoot: string,
  config: ResolvedConfig,
  authority: ProviderAuthorityRuntimeServiceOpenResult | undefined,
  executionId: string,
): ApiBrainProviderAuthorityDecision {
  if (!authority) return { decision: 'not-configured' };

  const order = orderedRoleProviders('brain', config);
  const requestedModel = getEquivalentModel(resolveBrainModel(config), order.primary);
  if (order.primary === 'openrouter') {
    registerOpenRouterModelFromCache(projectRoot, requestedModel);
  }
  const identity = resolveExecutionModelIdentity(requestedModel, order.primary);
  const request = {
    role: 'brain' as const,
    purpose: 'sprint-planning' as const,
    runId: executionId,
    taskId: executionId,
    provider: identity.provider,
    model: identity.model,
    configuredBackend: 'unresolved-before-provider-bootstrap',
    fallbackProviders: order.fallbacks,
    unattended: true,
  };
  const decision = preflightProviderRoleExecutionIngress(authority, request);
  if (decision.decision !== 'hold') return decision;

  const durableEvidenceWritten = Boolean(writeEvent(
    projectRoot,
    executionId,
    'brain',
    'auditor',
    'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
    {
      ...request,
      reasonCode: decision.reasonCode,
      authorityEvidenceRefs: decision.authorityEvidenceRefs,
    },
  ));
  const error = getMessage(
    'run.provider_authority_hold',
    getLanguage(config.language),
    {
      reason: decision.reasonCode,
      evidence: decision.authorityEvidenceRefs.join(','),
    },
  );
  return {
    decision: 'hold',
    statusCode: 503,
    body: {
      error,
      code: 'PROVIDER_EXECUTION_AUTHORITY_HOLD',
      providerAuthorityHold: {
        executionId,
        role: 'brain',
        purpose: 'sprint-planning',
        reasonCode: decision.reasonCode,
        authorityEvidenceRefs: decision.authorityEvidenceRefs,
        durableEvidenceWritten,
      },
    },
  };
}
