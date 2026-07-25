import type { ResolvedConfig } from '../core/config-types.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import {
  preflightProviderRoleExecutionIngress,
  type ProviderExecutionIngressDecision,
} from '../core/provider-execution-ingress-authority.js';
import { resolveBrainModel } from '../core/config.js';
import { getEquivalentModel } from '../core/model-equivalence.js';
import { orderedRoleProviders } from '../core/provider.js';
import { registerOpenRouterModelFromCache } from '../core/openrouter-models.js';
import { resolveExecutionModelIdentity } from '../orchestra/execution-request-builder.js';
import { openLocalProviderAuthorityRuntimeIfConfigured } from '../providers/provider-authority-runtime-bootstrap.js';

export interface CliProviderAuthorityProcessRuntimeOptions {
  readonly argv: readonly string[];
  readonly projectRoot: string;
  readonly loadConfig: (projectRoot: string) => Promise<ResolvedConfig>;
  readonly open?: typeof openLocalProviderAuthorityRuntimeIfConfigured;
}

function topLevelCommand(argv: readonly string[]): string | undefined {
  return argv.slice(2).find(argument => !argument.startsWith('-'));
}

const PROVIDER_AUTHORITY_COMMANDS = new Set(['run', 'start', 'do', 'xverify']);

/**
 * Canonical Brain front-door admission for CLI planning surfaces. Backend
 * identity is deliberately unresolved until provider bootstrap; this gate can
 * only HOLD in the current no-candidate composition and makes no backend-ready
 * claim.
 */
export function preflightCliBrainProviderAuthority(
  authority: ProviderAuthorityRuntimeServiceOpenResult | undefined,
  config: ResolvedConfig,
  projectRoot: string,
  executionId: string,
): ProviderExecutionIngressDecision {
  if (!authority) return { decision: 'not-configured' };

  const order = orderedRoleProviders('brain', config);
  const requestedModel = getEquivalentModel(resolveBrainModel(config), order.primary);
  if (order.primary === 'openrouter') {
    registerOpenRouterModelFromCache(projectRoot, requestedModel);
  }
  const identity = resolveExecutionModelIdentity(requestedModel, order.primary);
  return preflightProviderRoleExecutionIngress(authority, {
    role: 'brain',
    purpose: 'sprint-planning',
    runId: executionId,
    taskId: executionId,
    provider: identity.provider,
    model: identity.model,
    configuredBackend: 'unresolved-before-provider-bootstrap',
    fallbackProviders: order.fallbacks,
    unattended: true,
  });
}

/**
 * Own the single provider-authority lifecycle for one CLI process invocation.
 * Non-provider commands do not load config or open custody. `run|start|do|xverify`
 * receive the exact open result and the root closes it after command
 * settlement, including failures.
 */
export async function withCliProviderAuthority<T>(
  options: CliProviderAuthorityProcessRuntimeOptions,
  action: (
    authority: ProviderAuthorityRuntimeServiceOpenResult | undefined,
  ) => Promise<T>,
): Promise<T> {
  if (!PROVIDER_AUTHORITY_COMMANDS.has(topLevelCommand(options.argv) ?? '')) {
    return action(undefined);
  }

  const config = await options.loadConfig(options.projectRoot);
  const authority = (options.open ?? openLocalProviderAuthorityRuntimeIfConfigured)(
    options.projectRoot,
    config,
  );
  try {
    return await action(authority);
  } finally {
    authority?.close();
  }
}
