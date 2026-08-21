import { describe, expect, it, vi } from 'vitest';

import type {
  BoundedReachabilityProbeRequest,
  ProviderNativeProbeObservation,
} from '../../src/core/provider-evidence-probe-contract.js';
import type { ReachabilityProbeRequest } from '../../src/core/provider-truth.js';
import {
  createClaudeHostSubscriptionEvidenceSourceRegistrations,
  createClaudeHostSubscriptionEvidenceSourceRegistry,
} from '../../src/providers/claude-provider-evidence-sources.js';

const HOST_SCOPE = {
  provider: 'claude',
  authMode: 'subscription' as const,
  transport: 'cli' as const,
  executionBackend: 'host-subprocess' as const,
};
const DOCKER_SCOPE = { ...HOST_SCOPE, executionBackend: 'docker' as const };
const MODEL = 'claude-sonnet-4-5';
const PROFILE_REF = 'execution-profile:claude-docker-0001';

function dockerProbeRequest(
  overrides: Partial<ReachabilityProbeRequest> = {},
): ReachabilityProbeRequest {
  const backend = overrides.backend ?? {
    transport: 'cli' as const,
    executionBackend: 'docker' as const,
    endpointRefHash: null,
    runtimeFingerprint: 'f'.repeat(64),
    executionProfileRef: PROFILE_REF,
  };
  return {
    idempotencyKey: 'claude-docker-registration-probe-0001',
    tenantId: 'tenant-test',
    projectId: 'project-test',
    provider: 'claude',
    model: MODEL,
    auth: { mode: 'subscription', accountRefHash: 'a'.repeat(64) },
    backend,
    probeKind: 'model-invocation',
    capability: 'inference',
    admission: {
      budget: {
        evidenceRef: `execution-budget:${'b'.repeat(64)}`,
        projection: {
          billingMode: 'subscription',
          maxInputTokens: 100,
          maxOutputTokens: 37,
          maxTokens: 137,
          timeoutMs: 4321,
        },
      },
    },
    executionProfile: {
      profileRef: backend.executionProfileRef,
      provider: 'claude',
      allowed: [{ authMode: 'subscription', transport: 'cli', executionBackend: 'docker' }],
    },
    ttlMs: 60_000,
    ...overrides,
  } as ReachabilityProbeRequest;
}

function transportOf(
  observation: ProviderNativeProbeObservation,
  calls: BoundedReachabilityProbeRequest[] = [],
) {
  return () => ({
    invoke: async (input: Readonly<BoundedReachabilityProbeRequest>) => {
      calls.push(input as BoundedReachabilityProbeRequest);
      return observation;
    },
  });
}

describe('createClaudeHostSubscriptionEvidenceSourceRegistry', () => {
  it('constructs two lazy exact-backend registrations sharing account and limit authority', () => {
    const resolver = vi.fn(() => null);
    const registrations = createClaudeHostSubscriptionEvidenceSourceRegistrations({
      projectRoot: '/project',
      platform: 'linux',
      env: { PATH: '/bin' },
      dockerReachabilityTransport: resolver,
    });

    expect(registrations).toHaveLength(2);
    expect(registrations.map(({ executionBackend }) => executionBackend))
      .toEqual(['host-subprocess', 'docker']);
    expect(registrations[0]).toMatchObject(HOST_SCOPE);
    expect(registrations[1]).toMatchObject(DOCKER_SCOPE);
    expect(registrations[0]?.sources.account).toBe(registrations[1]?.sources.account);
    expect(registrations[0]?.sources.limit).toBe(registrations[1]?.sources.limit);
    expect(registrations[0]?.sources.reachability).not.toBe(registrations[1]?.sources.reachability);
    expect(registrations[0]?.sources.reachability.authorityRef)
      .toMatch(/^claude-reachability-authority:[a-f0-9]{64}$/u);
    expect(registrations[1]?.sources.reachability.authorityRef)
      .toMatch(/^docker-reachability-authority:[a-f0-9]{64}$/u);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('resolves only the two exact Claude subscription CLI backend scopes', () => {
    const registry = createClaudeHostSubscriptionEvidenceSourceRegistry({
      projectRoot: '/project',
      env: {},
    });

    expect(registry.resolve(HOST_SCOPE)).toMatchObject(HOST_SCOPE);
    expect(registry.resolve(DOCKER_SCOPE)).toMatchObject(DOCKER_SCOPE);
    for (const scope of [
      { ...HOST_SCOPE, provider: 'codex' },
      { ...HOST_SCOPE, authMode: 'api' as const },
      { ...HOST_SCOPE, authMode: 'hybrid' as const },
      { ...HOST_SCOPE, transport: 'api' as const, executionBackend: 'api' as const },
      { ...HOST_SCOPE, executionBackend: 'tmux' as const },
    ]) expect(registry.resolve(scope)).toBeNull();
  });

  it('keeps registry and selection digests deterministic across environment paths', () => {
    const first = createClaudeHostSubscriptionEvidenceSourceRegistry({
      projectRoot: '/project',
      platform: 'linux',
      env: { PATH: '/bin' },
    });
    const second = createClaudeHostSubscriptionEvidenceSourceRegistry({
      projectRoot: '/project',
      platform: 'linux',
      env: { PATH: '/different-bin', HOME: '/different-home' },
    });

    expect(first.authorityRef).toBe(second.authorityRef);
    expect(first.resolve(HOST_SCOPE)?.authorityEvidenceRef)
      .toBe(second.resolve(HOST_SCOPE)?.authorityEvidenceRef);
    expect(first.resolve(DOCKER_SCOPE)?.authorityEvidenceRef)
      .toBe(second.resolve(DOCKER_SCOPE)?.authorityEvidenceRef);
    expect(first.resolve(HOST_SCOPE)?.sources.account.authorityRef)
      .toBe(first.resolve(DOCKER_SCOPE)?.sources.account.authorityRef);
    expect(first.resolve(HOST_SCOPE)?.sources.limit).toMatchObject({
      authorityRef: first.resolve(DOCKER_SCOPE)?.sources.limit.authorityRef,
      kind: 'provider-cli',
      authority: 'advisory',
    });
  });

  it('uses the injected canonical transport for a live Docker observation only', async () => {
    const calls: BoundedReachabilityProbeRequest[] = [];
    const registry = createClaudeHostSubscriptionEvidenceSourceRegistry({
      projectRoot: '/project',
      env: {},
      dockerReachabilityTransport: transportOf({
        outcome: 'completed',
        providerRequestRef: 'opaque-native-request',
        outputBytes: 19,
        latencyMs: 12,
      }, calls),
    });
    const request = dockerProbeRequest();

    const docker = await registry.resolve(DOCKER_SCOPE)!.sources.reachability.probe(request);
    const host = await registry.resolve(HOST_SCOPE)!.sources.reachability.probe(request);

    expect(docker).toMatchObject({
      outcome: 'succeeded', calledProvider: 'claude', calledModel: MODEL, latencyMs: 12,
    });
    expect(host).toMatchObject({ outcome: 'unsupported', calledProvider: null, calledModel: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      provider: 'claude', model: MODEL, executionProfileRef: PROFILE_REF,
      timeoutMs: 4321, maxOutputTokens: 37,
    });
  });

  it('keeps the Docker registration on null or absent transport without host fallback', async () => {
    for (const options of [
      { projectRoot: '/project', env: {} },
      { projectRoot: '/project', env: {}, dockerReachabilityTransport: () => null },
    ]) {
      const registry = createClaudeHostSubscriptionEvidenceSourceRegistry(options);
      const docker = registry.resolve(DOCKER_SCOPE);
      expect(docker).not.toBeNull();
      expect(await docker!.sources.reachability.probe(dockerProbeRequest())).toMatchObject({
        outcome: 'unsupported', calledProvider: null, calledModel: null,
      });
      expect(docker!.sources.reachability.authorityRef)
        .toMatch(/^docker-reachability-authority:[a-f0-9]{64}$/u);
    }
  });
});
