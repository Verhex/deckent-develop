import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  runLimitsInit,
  type ProviderAuthorityLimitsInitOptions,
} from '../../src/cli/commands/provider-authority.js';
import { getLanguage, getMessage } from '../../src/cli/helpers/messages.js';
import { createLazyDockerReachabilityTransportResolver } from '../../src/cli/provider-authority-process-runtime.js';
import type {
  BoundedReachabilityProbeRequest,
  ProviderNativeProbeObservation,
} from '../../src/core/provider-evidence-probe-contract.js';
import type { ReachabilityProbeRequest } from '../../src/core/provider-truth.js';
import { createLocalProviderEvidenceSourceResolver } from '../../src/providers/provider-authority-runtime-bootstrap.js';

const PROFILE_REF = 'execution-profile:claude-docker-wire-0001';
const LANG = getLanguage(undefined);
const SOURCES_UNAVAILABLE = getMessage('provider_authority.limits.sources_unavailable', LANG);
const KEYRING_ABSENT = getMessage('provider_authority.keyring.absent', LANG);
const roots: string[] = [];
const priorExitCode = process.exitCode;

function root(label: string): string {
  const value = mkdtempSync(join(tmpdir(), `claude-docker-wire-${label}-`));
  roots.push(value);
  return value;
}

function config(): never {
  return {
    docker_image: 'deckent-worker@sha256:wire-fixture',
    docker_timeout: 77,
    worker_memory_limit: '2g',
    worker_memory_swap: '3g',
    worker_memory_limit_by_kind: { verification: '4g' },
  } as never;
}

function request(overrides: Partial<ReachabilityProbeRequest> = {}): ReachabilityProbeRequest {
  return {
    idempotencyKey: 'claude-docker-wire-0001',
    tenantId: 'main',
    projectId: 'project-wire',
    provider: 'claude',
    model: 'claude-fable-5',
    auth: { mode: 'subscription', accountRefHash: 'a'.repeat(64) },
    backend: {
      transport: 'cli', executionBackend: 'docker', endpointRefHash: null,
      runtimeFingerprint: 'f'.repeat(64), executionProfileRef: PROFILE_REF,
    },
    probeKind: 'model-invocation',
    capability: 'inference',
    admission: {
      budget: {
        evidenceRef: `execution-budget:${'b'.repeat(64)}`,
        projection: {
          billingMode: 'subscription', maxInputTokens: 100, maxOutputTokens: 37,
          maxTokens: 137, timeoutMs: 4_321,
        },
      },
    },
    executionProfile: {
      profileRef: PROFILE_REF,
      provider: 'claude',
      allowed: [{ authMode: 'subscription', transport: 'cli', executionBackend: 'docker' }],
    },
    ttlMs: 60_000,
    ...overrides,
  };
}

function initOptions(): ProviderAuthorityLimitsInitOptions {
  return {
    provider: 'claude', model: 'claude-fable-5', authMode: 'subscription',
    transport: 'cli', executionBackend: 'docker', executionProfileRef: PROFILE_REF,
    tenant: 'main', warnAtRatio: '0.7', blockAtRatio: '0.9',
  };
}

function captureStdout(): { text: () => string } {
  let value = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
    value += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  });
  return { text: () => value };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = priorExitCode;
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('Claude Docker provider-limit production wire', () => {
  it('carries effective config through the lazy factory and exact registry slot to one bounded call', async () => {
    const nativeCalls: BoundedReachabilityProbeRequest[] = [];
    const invokeBoundedReachabilityProbe = vi.fn(
      async (input: Readonly<BoundedReachabilityProbeRequest>) => {
        nativeCalls.push(input as BoundedReachabilityProbeRequest);
        return {
          outcome: 'completed' as const,
          providerRequestRef: 'opaque-request-ref',
          outputBytes: 1,
          latencyMs: 8,
        };
      },
    );
    const createBackend = vi.fn(() => ({ invokeBoundedReachabilityProbe }));
    const projectRoot = root('success');
    const dockerReachabilityTransport = createLazyDockerReachabilityTransportResolver(
      projectRoot,
      config(),
      createBackend,
    );
    const sources = createLocalProviderEvidenceSourceResolver(projectRoot, {
      nodePlatform: 'linux',
      env: {},
      dockerReachabilityTransport,
    });
    const selected = sources.resolve({
      provider: 'claude', authMode: 'subscription', transport: 'cli', executionBackend: 'docker',
    });

    expect(createBackend).not.toHaveBeenCalled();
    const observation = await selected!.sources.reachability.probe(request());

    expect(observation).toMatchObject({
      outcome: 'succeeded', calledProvider: 'claude', calledModel: 'claude-fable-5', latencyMs: 8,
    });
    expect(createBackend).toHaveBeenCalledOnce();
    expect(createBackend).toHaveBeenCalledWith(projectRoot, {
      image: 'deckent-worker@sha256:wire-fixture',
      timeoutSeconds: 77,
      memoryLimit: '2g',
      memorySwap: '3g',
      kindMemoryLimits: { verification: '4g' },
    });
    expect(nativeCalls).toHaveLength(1);
    expect(nativeCalls[0]).toMatchObject({
      provider: 'claude', model: 'claude-fable-5', executionProfileRef: PROFILE_REF,
      timeoutMs: 4_321, maxOutputTokens: 37,
    });
  });

  it.each([
    [{ outcome: 'transport-error', errorCode: 'credential_unavailable', retryable: false, elapsedMs: 3 }, 'auth-rejected'],
    [{ outcome: 'transport-error', errorCode: 'backend_unreachable', retryable: true, elapsedMs: 4 }, 'backend-unreachable'],
    [{ outcome: 'transport-error', errorCode: 'backend_unsupported', retryable: false, elapsedMs: 5 }, 'unsupported'],
  ] as const)('keeps native negative outcome %s non-live', async (native, expected) => {
    const sources = createLocalProviderEvidenceSourceResolver(root('native-hold'), {
      dockerReachabilityTransport: () => ({ invoke: async () => native }),
    });
    const selected = sources.resolve({
      provider: 'claude', authMode: 'subscription', transport: 'cli', executionBackend: 'docker',
    });
    expect(await selected!.sources.reachability.probe(request()))
      .toMatchObject({ outcome: expected, calledProvider: null, calledModel: null });
  });

  it('does not dispatch for null transport, missing budget, or wrong execution profile', async () => {
    const invoke = vi.fn(async (): Promise<ProviderNativeProbeObservation> => ({
      outcome: 'completed', providerRequestRef: null, outputBytes: 1, latencyMs: 1,
    }));
    const nullSources = createLocalProviderEvidenceSourceResolver(root('null'), {
      dockerReachabilityTransport: () => null,
    });
    const selectedNull = nullSources.resolve({
      provider: 'claude', authMode: 'subscription', transport: 'cli', executionBackend: 'docker',
    });
    expect((await selectedNull!.sources.reachability.probe(request())).outcome).toBe('unsupported');

    const sources = createLocalProviderEvidenceSourceResolver(root('pre-dispatch'), {
      dockerReachabilityTransport: () => ({ invoke }),
    });
    const selected = sources.resolve({
      provider: 'claude', authMode: 'subscription', transport: 'cli', executionBackend: 'docker',
    });
    const noBudget = request();
    expect((await selected!.sources.reachability.probe({
      ...noBudget,
      admission: { budget: { evidenceRef: `execution-budget:${'b'.repeat(64)}` } },
    } as ReachabilityProbeRequest)).outcome).toBe('not-run');
    expect((await selected!.sources.reachability.probe(request({
      executionProfile: { ...request().executionProfile, profileRef: 'execution-profile:wrong-0001' },
    }))).outcome).toBe('unsupported');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('lets limits init pass the default Claude Docker source gate without eager Docker work', async () => {
    const projectRoot = root('authoring');
    const effectiveConfig = config();
    const dockerReachabilityTransport = vi.fn(() => null);
    const factory = vi.fn(() => dockerReachabilityTransport);
    const out = captureStdout();

    await runLimitsInit(initOptions(), {
      resolveProjectRootFn: () => projectRoot,
      dataDirOverride: root('data'),
      projectIdFn: () => 'project-authoring',
      loadConfigFn: async () => effectiveConfig,
      dockerReachabilityTransportResolverFactory: factory,
    });

    expect(out.text()).toBe(`${KEYRING_ABSENT}\n`);
    expect(out.text()).not.toContain(SOURCES_UNAVAILABLE);
    expect(factory).toHaveBeenCalledWith(projectRoot, effectiveConfig);
    expect(dockerReachabilityTransport).not.toHaveBeenCalled();
  });
});
