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
