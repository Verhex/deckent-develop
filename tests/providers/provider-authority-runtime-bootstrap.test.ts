import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ProviderLimitsConfig, ResolvedConfig } from '../../src/core/config-types.js';
import { createProviderLimitPolicyAuthoritySnapshot } from '../../src/core/provider-limit-policy.js';
import {
  hasAuthoredProviderLimitAuthority,
  openLocalProviderAuthorityRuntime,
  openLocalProviderAuthorityRuntimeIfConfigured,
} from '../../src/providers/provider-authority-runtime-bootstrap.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'provider-authority-bootstrap-'));
  roots.push(value);
  return value;
}

function parentPolicy(): ProviderLimitsConfig {
  return {
    schemaVersion: 1,
    authorityRef: 'provider-limit-authority:global-bootstrap-0001',
    policies: [{
      selector: {
        tenantId: 'local',
        provider: 'claude',
        accountRefHash: 'a'.repeat(64),
        quotaScopeRefHash: 'b'.repeat(64),
        authMode: 'subscription',
        backend: {
          transport: 'cli',
          executionBackend: 'host-subprocess',
          endpointRefHash: 'c'.repeat(64),
        },
        requiredWindowIds: ['session'],
        sourceScopes: [{
          sourceKind: 'provider-cli',
          authority: 'authoritative',
          transport: 'cli',
          executionBackend: 'host-subprocess',
          endpointRefHash: 'c'.repeat(64),
        }],
      },
      values: {
        warnAtRatio: 0.7,
        blockAtRatio: 0.9,
        minimumRemaining: { tokens: 100 },
      },
    }],
  };
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('openLocalProviderAuthorityRuntime', () => {
  it('keeps rollout disabled without an authored parent or project layer', () => {
    expect(hasAuthoredProviderLimitAuthority({})).toBe(false);
    expect(openLocalProviderAuthorityRuntimeIfConfigured(root(), {})).toBeUndefined();
  });

  it('holds a missing authored parent before key/source/provider work', () => {
    const projectRoot = root();
    const result = openLocalProviderAuthorityRuntime(
      projectRoot,
      {},
      {
        nodePlatform: 'linux',
        env: {
          DECKENT_HOME: join(projectRoot, 'global'),
          HOME: join(projectRoot, 'home'),
        },
      },
    );

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'policy_authority_unavailable',
      authorityEvidenceRef: expect.stringMatching(/^provider-authority:[a-f0-9]{64}$/u),
    });
    result.close();
  });

  it('consumes the separate global envelope and then holds missing open-only custody', () => {
    const projectRoot = root();
    const config = {
      provider_limit_authority: createProviderLimitPolicyAuthoritySnapshot({
        parent: parentPolicy(),
        project: null,
      }),
    } satisfies Pick<ResolvedConfig, 'provider_limit_authority'>;
    const result = openLocalProviderAuthorityRuntime(
      projectRoot,
      config,
      {
        nodePlatform: 'linux',
        env: {
          DECKENT_HOME: join(projectRoot, 'global'),
          HOME: join(projectRoot, 'home'),
        },
      },
    );

    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRef: expect.stringMatching(/^provider-authority:[a-f0-9]{64}$/u),
    });
    result.close();
  });

  it('enables once an authored layer exists and never falls back after open HOLD', () => {
    const projectRoot = root();
    const config = {
      provider_limit_authority: createProviderLimitPolicyAuthoritySnapshot({
        parent: parentPolicy(),
        project: null,
      }),
    } satisfies Pick<ResolvedConfig, 'provider_limit_authority'>;

    expect(hasAuthoredProviderLimitAuthority(config)).toBe(true);
    const result = openLocalProviderAuthorityRuntimeIfConfigured(
      projectRoot,
      config,
      {
        nodePlatform: 'linux',
        env: {
          DECKENT_HOME: join(projectRoot, 'global'),
          HOME: join(projectRoot, 'home'),
        },
      },
    );
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
    });
    result?.close();
  });
});
