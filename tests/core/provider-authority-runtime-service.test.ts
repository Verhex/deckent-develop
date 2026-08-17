import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ProviderAuthorityRuntimeService,
  ProviderAuthorityRuntimeServiceError,
  type ProviderAuthorityRuntimeServiceOptions,
} from '../../src/core/provider-authority-composition.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import type { ProviderEvidenceSourceRegistration } from '../../src/core/provider-evidence-source-registry.js';
import type { ProviderLimitsConfig } from '../../src/core/config-types.js';

const ACCOUNT_HASH = 'a'.repeat(64);
const QUOTA_HASH = 'b'.repeat(64);
const ENDPOINT_HASH = 'c'.repeat(64);
const roots: string[] = [];
const openServices: ProviderAuthorityRuntimeService[] = [];

function root(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

function registration(
  calls: { count: number },
  executionBackend: 'docker' | 'host-subprocess' = 'docker',
): ProviderEvidenceSourceRegistration {
  return {
    provider: 'provider-alpha',
    authMode: 'api',
    transport: 'http',
    executionBackend,
    sources: {
      account: {
        authorityRef: `account-authority:${executionBackend}-0001`,
        resolve: async () => {
          calls.count += 1;
          throw new Error('provider account source must not run during composition');
        },
      },
      limit: {
        authorityRef: `limit-authority:${executionBackend}-0001`,
        kind: 'provider-api',
        authority: 'authoritative',
        observe: async () => {
          calls.count += 1;
          throw new Error('provider limit source must not run during composition');
        },
      },
      reachability: {
        authorityRef: `reachability-authority:${executionBackend}-0001`,
        probe: async () => {
          calls.count += 1;
          throw new Error('provider reachability source must not run during composition');
        },
      },
    },
  };
}

function policyConfig(
  blockAtRatio = 0.9,
  executionBackend: 'docker' | 'host-subprocess' = 'docker',
): ProviderLimitsConfig {
  return {
    schemaVersion: 1,
    authorityRef: 'provider-limit-authority:runtime-test',
    policies: [{
      selector: {
        tenantId: 'main',
        provider: 'provider-alpha',
        accountRefHash: ACCOUNT_HASH,
        quotaScopeRefHash: QUOTA_HASH,
        authMode: 'api',
        backend: {
          transport: 'http',
          executionBackend,
          endpointRefHash: ENDPOINT_HASH,
        },
        requiredWindowIds: ['account-window'],
        sourceScopes: [{
          sourceKind: 'provider-api',
          authority: 'authoritative',
          transport: 'http',
          executionBackend,
          endpointRefHash: ENDPOINT_HASH,
        }],
      },
      values: {
        warnAtRatio: 0.7,
        blockAtRatio,
        minimumRemaining: { tokens: 100 },
      },
    }],
  };
}

function options(input: {
  calls?: { count: number };
  createKeyring?: boolean;
  platform?: 'linux' | 'wsl' | 'darwin' | 'win32';
  projectRoot?: string;
  globalRoot?: string;
  overrides?: Partial<ProviderAuthorityRuntimeServiceOptions>;
} = {}): ProviderAuthorityRuntimeServiceOptions & {
  projectRoot: string;
  env: { HOME: string; DECKENT_HOME: string };
} {
  const calls = input.calls ?? { count: 0 };
  const projectRoot = input.projectRoot ?? root('deckent-authority-runtime-project-');
  const globalRoot = input.globalRoot ?? root('deckent-authority-runtime-global-');
  if (input.createKeyring !== false) {
    ProviderAuthorityKeyring.create({
      dataDir: globalRoot,
      keyringIdFactory: () => 'par-runtime-service-0001',
      keyIdFactory: () => 'pak-runtime-service-0001',
      randomBytesFactory: size => Buffer.alloc(size, 0x61),
    });
  }
  return {
    mode: 'solo',
    projectRoot,
    platform: input.platform ?? 'linux',
    env: { HOME: projectRoot, DECKENT_HOME: globalRoot },
    parentPolicy: { scope: 'global', config: policyConfig() },
    sourceRegistrations: [
      registration(calls),
      registration(calls, 'host-subprocess'),
    ],
    receiptStoreOptions: {
      idFactory: () => 'project-runtime-canonical-0001',
    },
    ...input.overrides,
  };
}

function openReady(
  input: ReturnType<typeof options>,
): ProviderAuthorityRuntimeService {
  const result = ProviderAuthorityRuntimeService.open(input);
  expect(result.state).toBe('ready');
  if (result.state !== 'ready') throw new Error(`expected ready runtime: ${result.reasonCode}`);
  openServices.push(result.service);
  return result.service;
}

afterEach(() => {
  for (const service of openServices.splice(0)) {
    try { service.close(); } catch { /* test cleanup after asserted failure */ }
  }
  for (const item of roots.splice(0)) rmSync(item, { recursive: true, force: true });
});

describe('ProviderAuthorityRuntimeService', () => {
  it('opens one provider-free lifecycle root and preflights exact unattended scope', () => {
    const calls = { count: 0 };
    const input = options({ calls });
    const service = openReady(input);

    expect(service).toMatchObject({
      tenantId: 'main',
      projectId: 'project-runtime-canonical-0001',
      authorityEvidenceRef: expect.stringMatching(/^provider-authority:[a-f0-9]{64}$/u),
      policyAuthorityRef: expect.stringMatching(
        /^provider-limit-runtime-policy:[a-f0-9]{64}$/u,
      ),
    });
    expect(service.preflightUnattendedScope({
      provider: 'provider-alpha',
      authMode: 'api',
      transport: 'http',
      executionBackend: 'docker',
    })).toMatchObject({
      decision: 'ready',
      terminationEvidenceContract: 'task-result-settlement-v1',
    });
    expect(calls.count).toBe(0);
    expect(existsSync(join(input.env.DECKENT_HOME, 'provider-truth.db'))).toBe(true);
    expect(existsSync(join(input.env.DECKENT_HOME, 'provider-limits.db'))).toBe(true);
    expect(existsSync(join(input.env.DECKENT_HOME, 'execution-terminations.db'))).toBe(true);
    expect(existsSync(join(input.projectRoot, '.deckent', 'runtime', 'invocations.db')))
      .toBe(true);
  });

  it('holds exact missing source and unsupported termination adapters without source calls', () => {
    const calls = { count: 0 };
    const service = openReady(options({ calls }));
    expect(service.preflightUnattendedScope({
      provider: 'provider-missing',
      authMode: 'api',
      transport: 'http',
      executionBackend: 'docker',
    })).toMatchObject({
      decision: 'hold',
      reasonCode: 'source_bundle_unavailable',
    });
    expect(service.preflightUnattendedScope({
      provider: 'provider-alpha',
      authMode: 'api',
      transport: 'http',
      executionBackend: 'host-subprocess',
    })).toMatchObject({
      decision: 'hold',
      reasonCode: 'termination_adapter_unsupported',
    });
    expect(calls.count).toBe(0);
  });

  it.each([
    ['enterprise tenant', (base: ReturnType<typeof options>) => ({
      ...base,
      mode: 'enterprise' as const,
      tenantId: undefined,
    }), 'tenant_authority_unavailable'],
    ['parent policy', (base: ReturnType<typeof options>) => ({
      ...base,
      parentPolicy: null,
    }), 'policy_authority_unavailable'],
    ['source registry', (base: ReturnType<typeof options>) => ({
      ...base,
      sourceRegistrations: [],
    }), 'source_resolver_unavailable'],
  ] as const)('holds before provider work when %s is unavailable', (_, mutate, reasonCode) => {
    const calls = { count: 0 };
    const result = ProviderAuthorityRuntimeService.open(mutate(options({ calls })));
    expect(result).toMatchObject({ state: 'hold', reasonCode });
    expect(calls.count).toBe(0);
  });

  it('holds widening project policy instead of consuming merged config', () => {
    const calls = { count: 0 };
    const project = policyConfig(0.95);
    project.authorityRef = 'provider-limit-project:runtime-test';
    project.policies[0]!.values = { blockAtRatio: 0.95 };
    const result = ProviderAuthorityRuntimeService.open(options({
      calls,
      overrides: {
        projectPolicy: { scope: 'project', config: project },
      },
    }));
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'policy_authority_invalid',
    });
    expect(calls.count).toBe(0);
  });

  it('holds missing custody and native Windows without provisioning a key', () => {
    const missing = options({ createKeyring: false });
    const missingResult = ProviderAuthorityRuntimeService.open(missing);
    expect(missingResult).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
    });
    expect(existsSync(join(
      missing.env.DECKENT_HOME,
      'keys',
      'provider-authority',
    ))).toBe(false);

    const win = options({ platform: 'win32' });
    expect(ProviderAuthorityRuntimeService.open(win)).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_storage_unsafe',
    });
  });

  it.each(['linux', 'wsl', 'darwin'] as const)(
    'uses the existing %s global-scope adapter without provider work',
    platform => {
      const calls = { count: 0 };
      const service = openReady(options({ calls, platform }));
      expect(service.preflightUnattendedScope({
        provider: 'provider-alpha',
        authMode: 'api',
        transport: 'http',
        executionBackend: 'docker',
      }).decision).toBe('ready');
      expect(calls.count).toBe(0);
    },
  );

  it('closes once, fails closed after close, and preserves project identity on restart', () => {
    const calls = { count: 0 };
    const firstOptions = options({ calls });
    const first = openReady(firstOptions);
    const projectId = first.projectId;
    const authorityRef = first.authorityEvidenceRef;
    first.close();
    first.close();

    expect(first.preflightUnattendedScope({
      provider: 'provider-alpha',
      authMode: 'api',
      transport: 'http',
      executionBackend: 'docker',
    })).toMatchObject({ decision: 'hold', reasonCode: 'runtime_closed' });
    expect(() => first.evidenceProducer).toThrowError(
      expect.objectContaining<Partial<ProviderAuthorityRuntimeServiceError>>({
        code: 'RUNTIME_CLOSED',
      }),
    );

    const restarted = openReady(options({
      calls,
      projectRoot: firstOptions.projectRoot,
      globalRoot: firstOptions.env.DECKENT_HOME,
      createKeyring: false,
    }));
    expect(restarted.projectId).toBe(projectId);
    expect(restarted.authorityEvidenceRef).toBe(authorityRef);
    expect(calls.count).toBe(0);
  });
});
