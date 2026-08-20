import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveProviderAccountBackendScopeRefHash,
  type ProviderAccountIdentityRequest,
  type ProviderLimitEvidenceSource,
} from '../../src/core/provider-evidence-producer.js';
import { ProviderEvidenceSourceRegistry } from '../../src/core/provider-evidence-source-registry.js';
import type { ReachabilityProbeRequest } from '../../src/core/provider-truth.js';
import {
  CodexAccountIdentityAuthority,
  CodexDockerReachabilityEvidenceSource,
  CodexReachabilityUnavailableEvidenceSource,
  CodexUsageStateLimitEvidenceSource,
  createCodexHostSubscriptionEvidenceSourceRegistrations,
  createCodexHostSubscriptionEvidenceSourceRegistry,
} from '../../src/providers/codex-provider-evidence-sources.js';
import type {
  BoundedReachabilityProbeRequest,
  ProviderNativeProbeObservation,
} from '../../src/core/provider-evidence-probe-contract.js';
import { createLocalProviderEvidenceSourceRegistrations } from '../../src/providers/provider-authority-runtime-bootstrap.js';

const NOW = new Date('2026-08-12T09:00:00.000Z');
const PROFILE_REF = 'execution-profile:codex-subscription-0001';
const MODEL = 'gpt-5.6-sol';
const ACCOUNT_ID = 'acc-codex-provider-native-123';

const EXACT_SCOPE = {
  provider: 'codex',
  authMode: 'subscription' as const,
  transport: 'cli' as const,
  executionBackend: 'host-subprocess' as const,
};

const dirs: string[] = [];

function fixtureDir(): string {
  const value = mkdtempSync(join(tmpdir(), 'codex-evidence-source-'));
  dirs.push(value);
  return value;
}

afterEach(() => {
  for (const value of dirs.splice(0)) rmSync(value, { recursive: true, force: true });
});

/** A fixture codex state dir addressed through the CLI's own `CODEX_HOME` override. */
function stateDir(): { readonly path: string; readonly env: NodeJS.ProcessEnv } {
  const path = join(fixtureDir(), 'codex-state');
  mkdirSync(path, { recursive: true });
  return { path, env: { CODEX_HOME: path } };
}

function writeAuthState(path: string, value: string): void {
  writeFileSync(join(path, 'auth.json'), value, 'utf8');
}

function writeSessionLog(path: string, lines: readonly string[]): void {
  const day = join(path, 'sessions', '2026', '08', '12');
  mkdirSync(day, { recursive: true });
  writeFileSync(
    join(day, 'rollout-2026-08-12T09-00-00-abc.jsonl'),
    `${lines.join('\n')}\n`,
    'utf8',
  );
}

function usageEvent(primaryPercent: number, secondaryPercent: number | null): string {
  return JSON.stringify({
    timestamp: '2026-08-12T08:59:00.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      rate_limits: {
        primary: {
          used_percent: primaryPercent,
          window_minutes: 300,
          resets_in_seconds: 1200,
        },
        ...(secondaryPercent === null
          ? {}
          : {
            secondary: {
              used_percent: secondaryPercent,
              window_minutes: 10_080,
              resets_in_seconds: 400_000,
            },
          }),
      },
    },
  });
}

function accountRequest(
  overrides: Partial<ProviderAccountIdentityRequest> = {},
): ProviderAccountIdentityRequest {
  return {
    tenantId: 'tenant-test',
    provider: 'codex',
    authMode: 'subscription',
    backend: {
      transport: 'cli',
      executionBackend: 'host-subprocess',
      endpointRefHash: null,
      runtimeFingerprint: 'f'.repeat(64),
      executionProfileRef: PROFILE_REF,
    },
    executionProfile: {
      profileRef: PROFILE_REF,
      provider: 'codex',
      allowed: [{
        authMode: 'subscription',
        transport: 'cli',
        executionBackend: 'host-subprocess',
      }],
    },
    ...overrides,
  };
}

type LimitInput = Parameters<ProviderLimitEvidenceSource['observe']>[0];

function limitInput(overrides: Partial<LimitInput> = {}): LimitInput {
  return {
    tenantId: 'tenant-test',
    projectId: 'project-test',
    provider: 'codex',
    model: MODEL,
    authMode: 'subscription',
    accountRefHash: 'a'.repeat(64),
    accountEvidence: {
      identityEvidenceRef: 'codex-account-state:' + 'b'.repeat(64),
      credentialGenerationRef: 'codex-account-credential:' + 'c'.repeat(64),
      backendScopeRefHash: 'd'.repeat(64),
    },
    backend: {
      transport: 'cli',
      executionBackend: 'host-subprocess',
      endpointRefHash: null,
    },
    ...overrides,
  };
}

function probeRequest(): Readonly<ReachabilityProbeRequest> {
  return {
    idempotencyKey: 'idem-codex-reachability-0001',
    tenantId: 'tenant-test',
    projectId: 'project-test',
    provider: 'codex',
    model: MODEL,
    auth: { mode: 'subscription', accountRefHash: 'a'.repeat(64) },
    backend: {
      transport: 'cli',
      executionBackend: 'host-subprocess',
      endpointRefHash: null,
      runtimeFingerprint: 'f'.repeat(64),
      executionProfileRef: PROFILE_REF,
    },
    probeKind: 'model-invocation',
    capability: 'inference',
    admission: null,
    executionProfile: {
      profileRef: PROFILE_REF,
      provider: 'codex',
      allowed: [{
        authMode: 'subscription',
        transport: 'cli',
        executionBackend: 'host-subprocess',
      }],
    },
    ttlMs: 60_000,
  } as unknown as Readonly<ReachabilityProbeRequest>;
}

describe('CodexAccountIdentityAuthority', () => {
  it('projects the durable account subject with stable opaque hashes', async () => {
    const fx = stateDir();
    writeAuthState(fx.path, JSON.stringify({
      OPENAI_API_KEY: null,
      tokens: { id_token: 'id', access_token: 'access', account_id: ACCOUNT_ID },
      last_refresh: '2026-08-12T08:00:00.000Z',
    }));
    const authority = new CodexAccountIdentityAuthority({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    });
    const request = accountRequest();

    const first = await authority.resolve(request);
    const second = await authority.resolve(request);

    expect(first).toEqual({
      state: 'ready',
      provider: 'codex',
      authMode: 'subscription',
      identityKind: 'provider-account',
      assurance: 'provider-verified',
      issuer: 'codex-cli-state-file',
      stableSubject: ACCOUNT_ID,
      backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(request),
      credentialGenerationRef: expect.stringMatching(/^codex-account-credential:[a-f0-9]{64}$/u),
      evidenceRef: expect.stringMatching(/^codex-account-state:[a-f0-9]{64}$/u),
      fetchedAt: NOW.toISOString(),
      expiresAt: '2026-08-12T09:01:00.000Z',
    });
    expect(second).toEqual(first);
    expect(authority.authorityRef).toMatch(/^codex-account-authority:[a-f0-9]{64}$/u);
  });

  it('rotates the credential generation reference when the stored state changes', async () => {
    const fx = stateDir();
    const authority = new CodexAccountIdentityAuthority({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    });
    writeAuthState(fx.path, JSON.stringify({
      tokens: { access_token: 'first', account_id: ACCOUNT_ID },
    }));
    const before = await authority.resolve(accountRequest());
    writeAuthState(fx.path, JSON.stringify({
      tokens: { access_token: 'second', account_id: ACCOUNT_ID },
    }));
    const after = await authority.resolve(accountRequest());

    expect(before).toMatchObject({ state: 'ready', stableSubject: ACCOUNT_ID });
    expect(after).toMatchObject({ state: 'ready', stableSubject: ACCOUNT_ID });
    expect(before.state === 'ready' && after.state === 'ready'
      && before.credentialGenerationRef !== after.credentialGenerationRef).toBe(true);
  });

  it('resolves the state dir from the platform home when no override is present', async () => {
    const home = fixtureDir();
    mkdirSync(join(home, '.codex'), { recursive: true });
    writeAuthState(join(home, '.codex'), JSON.stringify({
      tokens: { account_id: ACCOUNT_ID },
    }));

    const identity = await new CodexAccountIdentityAuthority({
      env: { HOME: home },
      platform: 'linux',
      now: () => NOW,
    }).resolve(accountRequest());

    expect(identity).toMatchObject({ state: 'ready', stableSubject: ACCOUNT_ID });
  });

  it('treats a stored API key as credential-only, never as account authority', async () => {
    const fx = stateDir();
    writeAuthState(fx.path, JSON.stringify({ OPENAI_API_KEY: 'sk-fixture-value', tokens: null }));

    const identity = await new CodexAccountIdentityAuthority({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    }).resolve(accountRequest());

    expect(identity).toEqual({
      state: 'credential-only',
      credentialGenerationRef: expect.stringMatching(/^codex-account-credential:[a-f0-9]{64}$/u),
      evidenceRef: expect.stringMatching(/^codex-account-state:[a-f0-9]{64}$/u),
      fetchedAt: NOW.toISOString(),
      expiresAt: '2026-08-12T09:01:00.000Z',
    });
  });

  it.each([
    ['absent state file', (path: string): void => void path],
    ['corrupt state file', (path: string): void => writeAuthState(path, '{ not json')],
    ['state without a credential', (path: string): void => writeAuthState(path, '{"tokens":{}}')],
    ['state that is not an object', (path: string): void => writeAuthState(path, '["array"]')],
  ])('holds with typed evidence on %s', async (_label, prepare) => {
    const fx = stateDir();
    prepare(fx.path);

    const identity = await new CodexAccountIdentityAuthority({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    }).resolve(accountRequest());

    expect(identity).toEqual({
      state: 'hold',
      evidenceRef: expect.stringMatching(/^codex-account-state:[a-f0-9]{64}$/u),
    });
  });

  it('holds without reading any state when the home cannot be resolved', async () => {
    const identity = await new CodexAccountIdentityAuthority({
      env: {},
      platform: 'linux',
      now: () => NOW,
    }).resolve(accountRequest());

    expect(identity).toEqual({
      state: 'hold',
      evidenceRef: expect.stringMatching(/^codex-account-state:[a-f0-9]{64}$/u),
    });
  });

  it('holds on a win32 host whose codex state dir does not exist', async () => {
    const identity = await new CodexAccountIdentityAuthority({
      env: { USERPROFILE: 'C:\\Users\\deckent-fixture' },
      platform: 'win32',
      now: () => NOW,
    }).resolve(accountRequest());

    expect(identity).toEqual({
      state: 'hold',
      evidenceRef: expect.stringMatching(/^codex-account-state:[a-f0-9]{64}$/u),
    });
  });

  it.each([
    [{ provider: 'claude' }, 'a foreign provider'],
    [{ authMode: 'api' as const }, 'API auth'],
    [{ authMode: 'hybrid' as const }, 'hybrid auth'],
  ])('holds on scope mismatch: %s', async (overrides) => {
    const fx = stateDir();
    writeAuthState(fx.path, JSON.stringify({ tokens: { account_id: ACCOUNT_ID } }));

    const identity = await new CodexAccountIdentityAuthority({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    }).resolve(accountRequest(overrides));

    expect(identity).toEqual({
      state: 'hold',
      evidenceRef: expect.stringMatching(/^codex-account-scope:[a-f0-9]{64}$/u),
    });
  });
});

describe('CodexUsageStateLimitEvidenceSource', () => {
  it('projects the newest persisted rate-limit snapshot into both display windows', async () => {
    const fx = stateDir();
    writeSessionLog(fx.path, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'session-1' } }),
      usageEvent(11, 22),
      usageEvent(41.5, 63),
    ]);
    const source = new CodexUsageStateLimitEvidenceSource({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    });

    const first = await source.observe(limitInput());
    const second = await source.observe(limitInput());

    expect(source.kind).toBe('provider-cli');
    expect(source.authority).toBe('advisory');
    expect(first).toEqual({
      state: 'known',
      requiredWindowIds: ['codex.primary', 'codex.secondary'],
      windows: [
        {
          windowId: 'codex.primary',
          kind: 'session',
          model: null,
          unit: 'percent',
          consumed: 41.5,
          remaining: 58.5,
          limit: 100,
          reset: {
            state: 'unknown',
            at: null,
            displayRefHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          },
        },
        {
          windowId: 'codex.secondary',
          kind: 'week-all',
          model: null,
          unit: 'percent',
          consumed: 63,
          remaining: 37,
          limit: 100,
          reset: {
            state: 'unknown',
            at: null,
            displayRefHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          },
        },
      ],
      source: {
        operatorApprovalRef: null,
        evidenceRef: expect.stringMatching(/^codex-limit-snapshot:[a-f0-9]{64}$/u),
        fetchedAt: NOW.toISOString(),
        expiresAt: '2026-08-12T09:01:00.000Z',
        incorporatedReservationEventRefs: [],
      },
      evidenceRefs: [
        limitInput().accountEvidence!.identityEvidenceRef,
        limitInput().accountEvidence!.credentialGenerationRef,
        expect.stringMatching(/^codex-limit-model-scope:[a-f0-9]{64}$/u),
      ],
    });
    expect(second).toEqual(first);
  });

  it('keeps both windows required when the snapshot carries only the primary window', async () => {
    const fx = stateDir();
    writeSessionLog(fx.path, [usageEvent(7, null)]);

    const observation = await new CodexUsageStateLimitEvidenceSource({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    }).observe(limitInput());

    expect(observation.state).toBe('known');
    // Measured live 2026-08-12 (pro plan): the codex CLI truthfully reports
    // `secondary: null` — provider shape, not incomplete evidence. Requiring a
    // window the provider does not declare held every probe forever (bulgu #9).
    expect(observation.requiredWindowIds).toEqual(['codex.primary']);
    expect(observation.windows.map(window => window.windowId)).toEqual(['codex.primary']);
  });

  it.each([
    ['no sessions tree', (): void => undefined],
    ['a log without a rate-limit snapshot', (path: string): void => writeSessionLog(path, [
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {} } }),
    ])],
    ['a corrupt log', (path: string): void => writeSessionLog(path, ['{ not json', 'also not json'])],
    ['an out-of-range percentage', (path: string): void => writeSessionLog(path, [
      JSON.stringify({ payload: { rate_limits: { primary: { used_percent: 140 } } } }),
    ])],
  ])('reports typed unavailable for %s', async (_label, prepare) => {
    const fx = stateDir();
    prepare(fx.path);

    const observation = await new CodexUsageStateLimitEvidenceSource({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    }).observe(limitInput());

    expect(observation).toEqual({
      state: 'unavailable',
      requiredWindowIds: [],
      windows: [],
      source: {
        operatorApprovalRef: null,
        evidenceRef: expect.stringMatching(/^codex-limit-unavailable:[a-f0-9]{64}$/u),
        fetchedAt: NOW.toISOString(),
        expiresAt: '2026-08-12T09:01:00.000Z',
        incorporatedReservationEventRefs: [],
      },
      evidenceRefs: [
        limitInput().accountEvidence!.identityEvidenceRef,
        limitInput().accountEvidence!.credentialGenerationRef,
      ],
    });
  });

  it.each([
    [{ accountEvidence: null }, 'no account evidence'],
    [{ provider: 'claude' }, 'a foreign provider'],
    [{ authMode: 'api' as const }, 'API auth'],
    [{ accountRefHash: null }, 'no account reference'],
  ])('reports scope-typed unavailable without account evidence refs: %s', async (overrides) => {
    const fx = stateDir();
    writeSessionLog(fx.path, [usageEvent(5, 6)]);

    const observation = await new CodexUsageStateLimitEvidenceSource({
      env: fx.env,
      platform: 'linux',
      now: () => NOW,
    }).observe(limitInput(overrides));

    expect(observation.state).toBe('unavailable');
    expect(observation.source.evidenceRef).toMatch(/^codex-limit-unavailable:[a-f0-9]{64}$/u);
    expect(observation.evidenceRefs).toBeUndefined();
  });
});

describe('CodexReachabilityUnavailableEvidenceSource', () => {
  it('reports typed unsupported instead of claiming an unproven live probe', async () => {
    const source = new CodexReachabilityUnavailableEvidenceSource();

    const observation = await source.probe(probeRequest());

    expect(source.authorityRef).toMatch(/^codex-reachability-authority:[a-f0-9]{64}$/u);
    expect(observation).toEqual({
      outcome: 'unsupported',
      calledProvider: null,
      calledModel: null,
      providerRequestRefHash: null,
      latencyMs: null,
      evidenceRefs: [expect.stringMatching(/^codex-reachability-scope:[a-f0-9]{64}$/u)],
    });
  });
});

describe('CodexDockerReachabilityEvidenceSource', () => {
  function dockerProbeRequest(
    overrides: Record<string, unknown> = {},
  ): Readonly<ReachabilityProbeRequest> {
    const base = probeRequest() as unknown as Record<string, unknown>;
    return {
      ...base,
      backend: {
        ...(base.backend as Record<string, unknown>),
        executionBackend: 'docker',
      },
      admission: {
        budget: {
          evidenceRef: `execution-budget:${'b'.repeat(64)}`,
          projection: {
            billingMode: 'subscription',
            maxInputTokens: 32_768,
            maxOutputTokens: 512,
            maxTokens: 33_280,
            timeoutMs: 60_000,
          },
        },
      },
      ...overrides,
    } as unknown as Readonly<ReachabilityProbeRequest>;
  }

  function transportOf(
    observation: ProviderNativeProbeObservation,
    calls: BoundedReachabilityProbeRequest[] = [],
  ) {
    return () => ({
      invoke: async (request: Readonly<BoundedReachabilityProbeRequest>) => {
        calls.push(request as BoundedReachabilityProbeRequest);
        return observation;
      },
    });
  }

  it('maps a completed canonical probe to succeeded with the structurally pinned identity', async () => {
    const calls: BoundedReachabilityProbeRequest[] = [];
    const source = new CodexDockerReachabilityEvidenceSource(transportOf({
      outcome: 'completed',
      providerRequestRef: null,
      outputBytes: 24,
      latencyMs: 1234,
    }, calls));

    const observation = await source.probe(dockerProbeRequest());

    expect(observation).toMatchObject({
      outcome: 'succeeded',
      calledProvider: 'codex',
      calledModel: MODEL,
      providerRequestRefHash: null,
      latencyMs: 1234,
    });
    // The bounded request carries ONLY owner-budgeted ceilings — no literals.
    expect(calls[0]).toMatchObject({
      provider: 'codex',
      model: MODEL,
      timeoutMs: 60_000,
      maxOutputTokens: 512,
    });
    expect(calls[0]?.promptBytes.byteLength).toBeGreaterThan(0);
  });

  it('stays typed-unsupported outside the exact docker/cli/subscription scope', async () => {
    const source = new CodexDockerReachabilityEvidenceSource(transportOf({
      outcome: 'completed', providerRequestRef: null, outputBytes: 1, latencyMs: 1,
    }));
    const observation = await source.probe(probeRequest());
    expect(observation.outcome).toBe('unsupported');
    expect(observation.calledProvider).toBeNull();
  });

  it('returns typed not-run when the billing-mode budget projection is absent', async () => {
    const source = new CodexDockerReachabilityEvidenceSource(transportOf({
      outcome: 'completed', providerRequestRef: null, outputBytes: 1, latencyMs: 1,
    }));
    const observation = await source.probe(dockerProbeRequest({
      admission: { budget: { evidenceRef: `execution-budget:${'b'.repeat(64)}` } },
    }));
    expect(observation.outcome).toBe('not-run');
  });

  it('returns typed unsupported when no canonical docker transport is bound', async () => {
    const source = new CodexDockerReachabilityEvidenceSource(() => null);
    const observation = await source.probe(dockerProbeRequest());
    expect(observation.outcome).toBe('unsupported');
  });

  it.each([
    ['backend_unreachable', 'backend-unreachable'],
    ['backend_unsupported', 'unsupported'],
    ['credential_unavailable', 'auth-rejected'],
    ['some_other_code', 'transport-error'],
  ] as const)('maps transport-error %s to %s', async (errorCode, expected) => {
    const source = new CodexDockerReachabilityEvidenceSource(transportOf({
      outcome: 'transport-error', errorCode, retryable: false, elapsedMs: 9,
    }));
    const observation = await source.probe(dockerProbeRequest());
    expect(observation.outcome).toBe(expected);
    expect(observation.calledProvider).toBeNull();
  });

  it('maps a timed-out probe to timeout and a rejection to invalid-response', async () => {
    const timedOut = new CodexDockerReachabilityEvidenceSource(transportOf({
      outcome: 'timed-out', elapsedMs: 60_001,
    }));
    expect((await timedOut.probe(dockerProbeRequest())).outcome).toBe('timeout');
    const rejected = new CodexDockerReachabilityEvidenceSource(transportOf({
      outcome: 'rejected', providerCode: null, retryable: false, latencyMs: 5,
    }));
    expect((await rejected.probe(dockerProbeRequest())).outcome).toBe('invalid-response');
  });

  it('registration binds the live source to the docker slot ONLY, host stays the honest stub', async () => {
    const registrations = createCodexHostSubscriptionEvidenceSourceRegistrations({
      platform: 'linux',
      env: {},
      dockerReachabilityTransport: transportOf({
        outcome: 'completed', providerRequestRef: null, outputBytes: 1, latencyMs: 7,
      }),
    });
    const docker = registrations.find(r => r.executionBackend === 'docker');
    const host = registrations.find(r => r.executionBackend === 'host-subprocess');
    expect(docker && host).toBeTruthy();
    const dockerObservation = await docker!.sources.reachability.probe(dockerProbeRequest());
    expect(dockerObservation.outcome).toBe('succeeded');
    const hostObservation = await host!.sources.reachability.probe(probeRequest());
    expect(hostObservation.outcome).toBe('unsupported');
  });
});

describe('createCodexHostSubscriptionEvidenceSourceRegistry', () => {
  it('constructs one lazy exact-scope registration without invoking a producer', () => {
    const registrations = createCodexHostSubscriptionEvidenceSourceRegistrations({
      platform: 'linux',
      env: {},
    });

    expect(registrations).toHaveLength(2);
    expect(registrations[0]).toMatchObject(EXACT_SCOPE);
    expect(typeof registrations[0]?.sources.account.resolve).toBe('function');
    expect(typeof registrations[0]?.sources.limit.observe).toBe('function');
    expect(typeof registrations[0]?.sources.reachability.probe).toBe('function');
  });

  it('registers one deterministic concrete source bundle for the exact proven scope', () => {
    const first = createCodexHostSubscriptionEvidenceSourceRegistry({
      platform: 'linux',
      env: { CODEX_HOME: '/fixture-a' },
    });
    const second = createCodexHostSubscriptionEvidenceSourceRegistry({
      platform: 'linux',
      env: { CODEX_HOME: '/fixture-b' },
    });

    const selected = first.resolve(EXACT_SCOPE);
    expect(selected).toMatchObject({
      ...EXACT_SCOPE,
      authorityEvidenceRef: expect.stringMatching(/^provider-source-selection:[a-f0-9]{64}$/u),
      sources: {
        account: {
          authorityRef: expect.stringMatching(/^codex-account-authority:[a-f0-9]{64}$/u),
        },
        limit: {
          authorityRef: expect.stringMatching(/^codex-limit-authority:[a-f0-9]{64}$/u),
          kind: 'provider-cli',
          authority: 'advisory',
        },
        reachability: {
          authorityRef: expect.stringMatching(/^codex-reachability-authority:[a-f0-9]{64}$/u),
        },
      },
    });
    expect(first.authorityRef).toBe(second.authorityRef);
    expect(selected?.authorityEvidenceRef)
      .toBe(second.resolve(EXACT_SCOPE)?.authorityEvidenceRef);
  });

  it.each([
    [{ ...EXACT_SCOPE, provider: 'claude' }, 'foreign provider'],
    [{ ...EXACT_SCOPE, authMode: 'api' as const }, 'API auth'],
    [{ ...EXACT_SCOPE, authMode: 'hybrid' as const }, 'hybrid auth'],
    [{ ...EXACT_SCOPE, executionBackend: 'tmux' as const }, 'tmux backend'],
  ])('does not project host state truth onto %s', (scope) => {
    const registry = createCodexHostSubscriptionEvidenceSourceRegistry({
      platform: 'linux',
      env: {},
    });

    expect(registry.resolve(scope)).toBeNull();
  });
});

describe('createLocalProviderEvidenceSourceRegistrations', () => {
  it('is the single bootstrap producer registering both provider source sets', () => {
    const registrations = createLocalProviderEvidenceSourceRegistrations(
      '/project',
      { nodePlatform: 'linux', env: { HOME: '/home/fixture' } },
    );
    const registry = new ProviderEvidenceSourceRegistry(registrations);

    // 7091 FAZ-1 (ddc523bf0): the cursor adapter registers its account +
    // reachability sources through the same single bootstrap producer.
    expect(registrations.map(registration => registration.provider).sort())
      .toEqual(['claude', 'codex', 'codex', 'cursor', 'cursor']);
    expect(registry.resolve(EXACT_SCOPE)).toMatchObject({
      provider: 'codex',
      sources: {
        account: {
          authorityRef: expect.stringMatching(/^codex-account-authority:[a-f0-9]{64}$/u),
        },
        limit: { authorityRef: expect.stringMatching(/^codex-limit-authority:[a-f0-9]{64}$/u) },
      },
    });
    expect(registry.resolve({ ...EXACT_SCOPE, provider: 'claude' })).toMatchObject({
      provider: 'claude',
      sources: {
        account: {
          authorityRef: expect.stringMatching(/^claude-account-authority:[a-f0-9]{64}$/u),
        },
      },
    });
  });
});
