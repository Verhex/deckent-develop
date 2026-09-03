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
import {
  DockerSpawnBackend,
  type DockerSpawnBackendConstructionOptions,
} from '../orchestra/spawn-backend-docker.js';
import type { BoundedReachabilityProbeTransport } from '../core/provider-evidence-probe-contract.js';
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

const PROVIDER_AUTHORITY_COMMANDS = new Set(['run', 'spawn', 'start', 'do', 'xverify']);

/**
 * Canonical Brain front-door for CLI planning surfaces. It checks authority
 * COMPOSITION health only: a broken composition (keyring, custody, policy
 * layer) is a typed HOLD, an absent authority is `not-configured`, and a
 * healthy one is `ready`. `ready` is not an execution permit — the real
 * provider admission runs with exact candidate evidence at the stage where the
 * concrete candidate/backend is resolved. Backend identity stays deliberately
 * unresolved here; the resolved Brain identity only binds the ingress
 * evidence ref.
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
 * Lazy canonical Docker probe transport shared by every provider Docker
 * reachability slot. Nothing is constructed until a probe actually dispatches; the backend
 * is memoized so repeated probes share one canonical builder. Every credential,
 * image-identity, containment and network decision stays inside
 * {@link DockerSpawnBackend.invokeBoundedReachabilityProbe} — this resolver
 * exposes no argv, image or mount surface to callers.
 */
export type DockerReachabilityProbeBackendFactory = (
  projectRoot: string,
  options: DockerSpawnBackendConstructionOptions,
) => Pick<DockerSpawnBackend, 'invokeBoundedReachabilityProbe'>;

export function createLazyDockerReachabilityTransportResolver(
  projectRoot: string,
  config: ResolvedConfig,
  createBackend: DockerReachabilityProbeBackendFactory =
    (root, options) => new DockerSpawnBackend(root, options),
): () => BoundedReachabilityProbeTransport | null {
  let backend: ReturnType<DockerReachabilityProbeBackendFactory> | null = null;
  return () => {
    backend ??= createBackend(projectRoot, {
      image: config.docker_image,
      timeoutSeconds: config.docker_timeout,
      memoryLimit: config.worker_memory_limit,
      memorySwap: config.worker_memory_swap,
      kindMemoryLimits: config.worker_memory_limit_by_kind,
    });
    const bound = backend;
    return {
      invoke: request => bound.invokeBoundedReachabilityProbe(request),
    };
  };
}

/**
 * Own the single provider-authority lifecycle for one CLI process invocation.
 * Non-provider commands do not load config or open custody. `run|spawn|start|do|xverify`
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
    {
      dockerReachabilityTransport:
        createLazyDockerReachabilityTransportResolver(options.projectRoot, config),
    },
  );
  try {
    return await action(authority);
  } finally {
    authority?.close();
  }
}
