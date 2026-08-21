import { describe, expect, it, vi } from 'vitest';

import type {
  BoundedReachabilityProbeRequest,
  ProviderNativeProbeObservation,
} from '../../src/core/provider-evidence-probe-contract.js';
import type { ReachabilityProbeRequest } from '../../src/core/provider-truth.js';
import { DockerBoundedReachabilityEvidenceSource } from '../../src/providers/docker-bounded-reachability-evidence.js';

const PROVIDER = 'provider-fixture';
const MODEL = 'model-fixture';
const PROFILE_REF = 'execution-profile:provider-fixture-0001';

function request(overrides: Partial<ReachabilityProbeRequest> = {}): ReachabilityProbeRequest {
  const backend = overrides.backend ?? {
    transport: 'cli' as const,
    executionBackend: 'docker' as const,
    endpointRefHash: null,
    runtimeFingerprint: 'f'.repeat(64),
    executionProfileRef: PROFILE_REF,
  };
  const auth = overrides.auth ?? {
    mode: 'subscription' as const,
    accountRefHash: 'a'.repeat(64),
  };
  return {
    idempotencyKey: 'docker-reachability-test-0001',
    tenantId: 'tenant-test',
    projectId: 'project-test',
    provider: PROVIDER,
    model: MODEL,
    auth,
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
      provider: PROVIDER,
      allowed: [{ authMode: 'subscription', transport: 'cli', executionBackend: 'docker' }],
    },
    ttlMs: 60_000,
    ...overrides,
  } as ReachabilityProbeRequest;
}

function resolver(
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

describe('DockerBoundedReachabilityEvidenceSource', () => {
  it('forwards the exact provider request and owner-projected bounds', async () => {
    const calls: BoundedReachabilityProbeRequest[] = [];
    const source = new DockerBoundedReachabilityEvidenceSource(PROVIDER, resolver({
      outcome: 'completed', providerRequestRef: 'opaque-native-request', outputBytes: 19, latencyMs: 12,
    }, calls));

    const observation = await source.probe(request());

    expect(observation).toMatchObject({
      outcome: 'succeeded', calledProvider: PROVIDER, calledModel: MODEL, latencyMs: 12,
    });
    expect(observation.providerRequestRefHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      provider: PROVIDER,
      model: MODEL,
      executionProfileRef: PROFILE_REF,
      timeoutMs: 4321,
      maxOutputTokens: 37,
    });
    expect(new TextDecoder().decode(calls[0]!.promptBytes)).toBe(
      'Reply with exactly DECKENT_REACHABILITY_OK. Do not use tools.',
    );
    expect(JSON.stringify(observation)).not.toContain('opaque-native-request');
  });

  it.each([
    ['wrong provider', request({ provider: 'other-provider' })],
    ['wrong backend', request({ backend: { ...request().backend, executionBackend: 'host-subprocess' } })],
    ['wrong transport', request({ backend: { ...request().backend, transport: 'http' } })],
    ['wrong auth mode', request({ auth: { mode: 'api-key', accountRefHash: 'a'.repeat(64) } })],
    ['missing account', request({ auth: { mode: 'subscription', accountRefHash: null } })],
    ['invalid profile ref', request({ backend: { ...request().backend, executionProfileRef: '' } })],
    ['profile ref mismatch', request({ executionProfile: { ...request().executionProfile, profileRef: 'execution-profile:other-0001' } })],
    ['profile provider mismatch', request({ executionProfile: { ...request().executionProfile, provider: 'other-provider' } })],
    ['profile admission mismatch', request({ executionProfile: { ...request().executionProfile, allowed: [] } })],
  ])('rejects %s without resolving transport', async (_label, input) => {
    const lazy = vi.fn(() => null);
    const observation = await new DockerBoundedReachabilityEvidenceSource(PROVIDER, lazy).probe(input);
    expect(observation).toMatchObject({ outcome: 'unsupported', calledProvider: null, calledModel: null });
    expect(lazy).not.toHaveBeenCalled();
  });

  it('returns not-run for a missing projection without resolving transport', async () => {
    const lazy = vi.fn(() => null);
    const input = request();
    const observation = await new DockerBoundedReachabilityEvidenceSource(PROVIDER, lazy).probe({
      ...input,
      admission: { budget: { evidenceRef: `execution-budget:${'b'.repeat(64)}` } },
    } as ReachabilityProbeRequest);
    expect(observation.outcome).toBe('not-run');
    expect(lazy).not.toHaveBeenCalled();
  });

  it('returns unsupported when the lazy resolver has no canonical transport', async () => {
    const observation = await new DockerBoundedReachabilityEvidenceSource(PROVIDER, () => null)
      .probe(request());
    expect(observation.outcome).toBe('unsupported');
  });

  it('maps timeout and rejection fail-closed without retaining provider details', async () => {
    const timedOut = new DockerBoundedReachabilityEvidenceSource(PROVIDER, resolver({
      outcome: 'timed-out', elapsedMs: 4322,
    }));
    expect(await timedOut.probe(request())).toMatchObject({
      outcome: 'timeout', calledProvider: null, calledModel: null, latencyMs: 4322,
    });

    const rejected = new DockerBoundedReachabilityEvidenceSource(PROVIDER, resolver({
      outcome: 'rejected', providerCode: 'raw-provider-code', retryable: false, latencyMs: 8,
    }));
    const observation = await rejected.probe(request());
    expect(observation).toMatchObject({
      outcome: 'invalid-response', calledProvider: null, calledModel: null, latencyMs: 8,
    });
    expect(JSON.stringify(observation)).not.toContain('raw-provider-code');
  });

  it.each([
    ['backend_unreachable', 'backend-unreachable'],
    ['backend_unsupported', 'unsupported'],
    ['credential_unavailable', 'auth-rejected'],
    ['unknown_native_error', 'transport-error'],
  ] as const)('maps transport error %s to %s', async (errorCode, outcome) => {
    const source = new DockerBoundedReachabilityEvidenceSource(PROVIDER, resolver({
      outcome: 'transport-error', errorCode, retryable: false, elapsedMs: 9,
    }));
    const observation = await source.probe(request());
    expect(observation).toMatchObject({
      outcome, calledProvider: null, calledModel: null, latencyMs: 9,
    });
    expect(JSON.stringify(observation)).not.toContain(errorCode);
  });

  it('produces deterministic opaque refs without retaining request secrets', async () => {
    const source = new DockerBoundedReachabilityEvidenceSource(PROVIDER, resolver({
      outcome: 'rejected', providerCode: 'secret-provider-response', retryable: false, latencyMs: 1,
    }));
    const first = await source.probe(request());
    const second = await source.probe(request());
    expect(first.evidenceRefs).toEqual(second.evidenceRefs);
    expect(first.evidenceRefs?.every(ref => /^docker-reachability-[a-z-]+:[a-f0-9]{64}$/u.test(ref)))
      .toBe(true);
    expect(JSON.stringify(first)).not.toContain('secret-provider-response');
    expect(JSON.stringify(first)).not.toContain('DECKENT_REACHABILITY_OK');
  });
});
