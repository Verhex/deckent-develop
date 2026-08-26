// The authoring flow's live-source wire: the runtime bootstrap EXPOSES a
// resolver view over its registered sources and `provider-authority limits init`
// CONSUMES it when nothing is injected. Before this wire existed, production
// registered the command with no resolver at all, so `runLimitsInit` refused on
// every host — the first draft was impossible.
//
// Hermetic by construction: tmpdirs only, no global HOME touched, no provider
// process started. The codex scope is used deliberately — its evidence sources
// read the CLI's durable on-disk state, while the claude account authority
// starts the provider CLI and could never be hermetic here.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  runLimitsInit,
  type ProviderAuthorityLimitsDeps,
  type ProviderAuthorityLimitsInitOptions,
} from '../../src/cli/commands/provider-authority.js';
import { getLanguage, getMessage } from '../../src/cli/helpers/messages.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import type {
  ProviderEvidenceSourceResolver,
  ProviderEvidenceSourceScope,
} from '../../src/core/provider-evidence-producer.js';
import { ProviderEvidenceSourceRegistry } from '../../src/core/provider-evidence-source-registry.js';
import {
  createLocalProviderEvidenceSourceRegistrations,
  createLocalProviderEvidenceSourceResolver,
} from '../../src/providers/provider-authority-runtime-bootstrap.js';
import { createLazyDockerReachabilityTransportResolver } from "../../src/cli/provider-authority-process-runtime.js";
import type { BoundedReachabilityProbeRequest, ProviderNativeProbeObservation } from "../../src/core/provider-evidence-probe-contract.js";
import type { ReachabilityProbeRequest } from "../../src/core/provider-truth.js";

const LANG = getLanguage(undefined);
const SOURCES_UNAVAILABLE = getMessage('provider_authority.limits.sources_unavailable', LANG);
const KEYRING_ABSENT = getMessage('provider_authority.keyring.absent', LANG);

/** The one scope the local bootstrap actually registers for codex. */
const CODEX_SCOPE: ProviderEvidenceSourceScope = {
  provider: 'codex',
  authMode: 'subscription',
  transport: 'cli',
  executionBackend: 'host-subprocess',
};

const dirs: string[] = [];
const priorCodexHome = process.env['CODEX_HOME'];
const priorExitCode = process.exitCode;

function dir(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), `provider-limits-wire-${prefix}-`));
  dirs.push(value);
  return value;
}

function baseOptions(
  overrides: Partial<ProviderAuthorityLimitsInitOptions> = {},
): ProviderAuthorityLimitsInitOptions {
  return {
    provider: CODEX_SCOPE.provider,
    model: 'gpt-5-codex',
    authMode: CODEX_SCOPE.authMode,
    transport: CODEX_SCOPE.transport,
    executionBackend: CODEX_SCOPE.executionBackend,
    executionProfileRef: 'execution_profile.codex.subscription-cli',
    tenant: 'local',
    warnAtRatio: '0.7',
    blockAtRatio: '0.9',
    ...overrides,
  };
}

function effectiveConfig(): never {
  return {
    docker_image: 'deckent-worker@sha256:fixture',
    docker_timeout: 90,
    worker_memory_limit: '2g',
    worker_memory_swap: '3g',
    worker_memory_limit_by_kind: {},
  } as never;
}

function captureStdout(): { text: () => string } {
  let text = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
    text += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  });
  return { text: () => text };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = priorExitCode;
  if (priorCodexHome === undefined) delete process.env['CODEX_HOME'];
  else process.env['CODEX_HOME'] = priorCodexHome;
  for (const value of dirs.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('createLocalProviderEvidenceSourceResolver', () => {
  it('is a resolver view over the SAME registrations, not a second registry', () => {
    const projectRoot = dir('root');
    const options = { env: { ...process.env, CODEX_HOME: dir('codex') } };
    const resolver = createLocalProviderEvidenceSourceResolver(projectRoot, options);
    const overRegistrations = new ProviderEvidenceSourceRegistry(
      createLocalProviderEvidenceSourceRegistrations(projectRoot, options),
    );

    // Identical authority ref => identical registered scope + source set. A
    // parallel list would digest differently.
    expect(resolver.authorityRef).toBe(overRegistrations.authorityRef);
    expect(resolver.resolve(CODEX_SCOPE)).not.toBeNull();
  });

  it('answers null for a canonical provider this host registered no source for', () => {
    const resolver = createLocalProviderEvidenceSourceResolver(dir('root'));
    expect(resolver.resolve({ ...CODEX_SCOPE, provider: 'gemini' })).toBeNull();
  });
});

describe('runLimitsInit source wire', () => {
  it('reaches the proposal stage from the bootstrap-registered source, with nothing injected', async () => {
    process.env['CODEX_HOME'] = dir('codex');
    const dataDir = dir('data');
    const projectRoot = dir('root');
    const deps: ProviderAuthorityLimitsDeps = {
      dataDirOverride: dataDir,
      resolveProjectRootFn: () => projectRoot,
      projectIdFn: () => 'local-project',
      loadConfigFn: async () => effectiveConfig(),
      // Defence in depth: this flow must hold long before either is reached.
      configPathOverride: join(dir('config'), 'config.json'),
      confirmFn: async () => false,
    };
    // The sources gate is what this test exercises; the keyring behind it must
    // be present, and it lives in the tmp data dir, never the host's own.
    ProviderAuthorityKeyring.create({ dataDir, projectRoot, platform: process.platform });

    const out = captureStdout();
    await runLimitsInit(baseOptions(), deps);
    const text = out.text();

    // The gate opened: no "no source registered on this host" refusal, and the
    // authoring module did not report an unresolvable source bundle either.
    expect(text).not.toContain(SOURCES_UNAVAILABLE);
    expect(text).not.toContain('source_bundle_unavailable');
    // It got as far as live account/limit truth, which a fixture codex home
    // cannot satisfy — a typed proposal-stage hold.
    expect(text).toMatch(
      /account_identity_unavailable|limit_source_failure|limit_windows_unavailable|policy_invalid/,
    );
  });

  it('keeps the typed hold byte-identical when no registered source resolves', async () => {
    process.env['CODEX_HOME'] = dir('codex');
    const projectRoot = dir('root');
    const out = captureStdout();

    await runLimitsInit(baseOptions({ provider: 'gemini' }), {
      dataDirOverride: dir('data'),
      resolveProjectRootFn: () => projectRoot,
      projectIdFn: () => 'local-project',
      loadConfigFn: async () => effectiveConfig(),
    });

    expect(out.text()).toBe(`${SOURCES_UNAVAILABLE}\n`);
    expect(process.exitCode).toBe(1);
  });

  it('still lets an injected resolver win over the host bootstrap', async () => {
    process.env['CODEX_HOME'] = dir('codex');
    const hostSources = createLocalProviderEvidenceSourceResolver(dir('root'))
      .resolve(CODEX_SCOPE);
    expect(hostSources).not.toBeNull();
    const injected: ProviderEvidenceSourceResolver = {
      authorityRef: 'provider-source-registry:injected-seam',
      // The bootstrap answers null for gemini; this seam answers, so reaching the
      // next stage proves the injection — not the host registry — was consulted.
      resolve: scope => scope.provider !== 'gemini'
        ? null
        : { ...scope, authorityEvidenceRef: 'provider-source-selection:injected', sources: hostSources!.sources },
    };

    const projectRoot = dir('root');
    const loadConfigFn = vi.fn(async () => {
      throw new Error('injected resolver must bypass config');
    });
    const dockerReachabilityTransportResolverFactory = vi.fn(() => {
      throw new Error('injected resolver must bypass Docker composition');
    });
    const out = captureStdout();
    await runLimitsInit(baseOptions({ provider: 'gemini' }), {
      sourceResolver: injected,
      loadConfigFn,
      dockerReachabilityTransportResolverFactory,
      dataDirOverride: dir('data'),
      resolveProjectRootFn: () => projectRoot,
      projectIdFn: () => 'local-project',
    });

    // Past the source gate, held by the next authority in line: no keyring.
    expect(out.text()).toBe(`${KEYRING_ABSENT}\n`);
    expect(process.exitCode).toBe(1);
    expect(loadConfigFn).not.toHaveBeenCalled();
    expect(dockerReachabilityTransportResolverFactory).not.toHaveBeenCalled();
  });

  it('wires the default Claude Docker source through effective config without eager dispatch', async () => {
    const projectRoot = dir('root');
    const config = effectiveConfig();
    const dockerReachabilityTransport = vi.fn(() => null);
    const loadConfigFn = vi.fn(async () => config);
    const dockerReachabilityTransportResolverFactory = vi.fn(
      () => dockerReachabilityTransport,
    );
    const out = captureStdout();

    await runLimitsInit(baseOptions({
      provider: 'claude',
      model: 'claude-fable-5',
      executionBackend: 'docker',
      executionProfileRef: 'execution-profile:claude-docker-0001',
      tenant: 'main',
    }), {
      dataDirOverride: dir('data'),
      resolveProjectRootFn: () => projectRoot,
      projectIdFn: () => 'project-default-docker',
      loadConfigFn,
      dockerReachabilityTransportResolverFactory,
    });

    expect(out.text()).toBe(`${KEYRING_ABSENT}\n`);
    expect(out.text()).not.toContain(SOURCES_UNAVAILABLE);
    expect(loadConfigFn).toHaveBeenCalledWith(projectRoot);
    expect(dockerReachabilityTransportResolverFactory).toHaveBeenCalledWith(projectRoot, config);
    expect(dockerReachabilityTransport).not.toHaveBeenCalled();
  });

  it('turns default config/factory failure into the typed source refusal', async () => {
    const out = captureStdout();
    await runLimitsInit(baseOptions(), {
      dataDirOverride: dir('data'),
      resolveProjectRootFn: () => dir('root'),
      loadConfigFn: async () => { throw new Error('config unavailable'); },
    });

    expect(out.text()).toBe(`${SOURCES_UNAVAILABLE}\n`);
    expect(process.exitCode).toBe(1);
  });
});

// WIRE-012: physically merged from tests/cli/provider-limits-claude-docker-wire.test.ts.
{
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
                    maxTokens: 137, timeoutMs: 4321,
                },
            },
        },
        executionProfile: {
            profileRef: PROFILE_REF,
            provider: 'claude',
            allowed: [{ authMode: 'subscription', transport: 'cli', executionBackend: 'docker' }],
        },
        ttlMs: 60000,
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

function captureStdout(): {
    text: () => string;
} {
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
    for (const value of roots.splice(0))
        rmSync(value, { recursive: true, force: true });
});

describe('Claude Docker provider-limit production wire', () => {
    it('carries effective config through the lazy factory and exact registry slot to one bounded call', async () => {
        const nativeCalls: BoundedReachabilityProbeRequest[] = [];
        const invokeBoundedReachabilityProbe = vi.fn(async (input: Readonly<BoundedReachabilityProbeRequest>) => {
            nativeCalls.push(input as BoundedReachabilityProbeRequest);
            return {
                outcome: 'completed' as const,
                providerRequestRef: 'opaque-request-ref',
                outputBytes: 1,
                latencyMs: 8,
            };
        });
        const createBackend = vi.fn(() => ({ invokeBoundedReachabilityProbe }));
        const projectRoot = root('success');
        const dockerReachabilityTransport = createLazyDockerReachabilityTransportResolver(projectRoot, config(), createBackend);
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
            timeoutMs: 4321, maxOutputTokens: 37,
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
}
