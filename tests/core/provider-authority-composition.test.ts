import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  composeProviderAuthority,
  type ProviderAuthorityCompositionOptions,
} from '../../src/core/provider-authority-composition.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import type { ProviderLimitPolicy } from '../../src/core/provider-limit-truth.js';

const roots: string[] = [];
const POLICY: ProviderLimitPolicy = {
  policyRef: 'provider-policy:test-0001',
  warnAtRatio: 0.8,
  blockAtRatio: 0.95,
  minimumRemaining: {},
};

function root(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

function base(overrides: Partial<ProviderAuthorityCompositionOptions> = {}): ProviderAuthorityCompositionOptions {
  const projectRoot = root('deckent-provider-composition-project-');
  const globalRoot = root('deckent-provider-composition-global-');
  ProviderAuthorityKeyring.create({
    dataDir: globalRoot,
    keyringIdFactory: () => 'par-composition-0001',
    keyIdFactory: () => 'pak-composition-0001',
    randomBytesFactory: size => Buffer.alloc(size, 0x51),
  });
  return {
    mode: 'solo',
    projectId: 'project-canonical-0001',
    projectRoot,
    platform: 'linux',
    env: { HOME: projectRoot, DECKENT_HOME: globalRoot },
    policyResolver: () => POLICY,
    terminationEvidenceVerifier: () => true,
    accountAuthorityRef: 'account-authority:test-0001',
    truthProducerAuthorityRef: 'truth-producer:test-0001',
    limitProducerAuthorityRef: 'limit-producer:test-0001',
    ...overrides,
  };
}

afterEach(() => {
  for (const item of roots.splice(0)) rmSync(item, { recursive: true, force: true });
});

describe('composeProviderAuthority', () => {
  it('defaults only solo tenancy to local and composes one host authority', () => {
    const options = base();
    const composed = composeProviderAuthority(options);
    expect(composed).toMatchObject({
      state: 'ready',
      tenantId: 'local',
      projectId: 'project-canonical-0001',
    });
    if (composed.state !== 'ready') throw new Error('expected ready composition');
    expect(composed.truthStore.projectId).toBe(options.projectId);
    const account = composed.pseudonymizeAccount({
      provider: 'claude',
      authMode: 'subscription',
      stableAccountIdentity: 'raw-account@example.invalid',
    });
    expect(account).toMatch(/^[a-f0-9]{64}$/u);
    composed.close();
    composed.close();
    expect(readFileSync(join(
      options.env!.DECKENT_HOME!,
      'provider-truth.db',
    )).toString('utf8')).not.toContain('raw-account@example.invalid');
  });

  it('holds enterprise mode without a verified tenant before opening storage', () => {
    const composed = composeProviderAuthority(base({ mode: 'enterprise', tenantId: undefined }));
    expect(composed).toMatchObject({
      state: 'hold',
      reasonCode: 'tenant_authority_unavailable',
      retryable: false,
    });
  });

  it.each([
    ['policyResolver', 'policy_authority_unavailable'],
    ['terminationEvidenceVerifier', 'termination_authority_unavailable'],
    ['accountAuthorityRef', 'account_authority_unavailable'],
    ['truthProducerAuthorityRef', 'truth_producer_unavailable'],
    ['limitProducerAuthorityRef', 'limit_producer_unavailable'],
  ] as const)('holds when %s is unavailable', (field, reasonCode) => {
    const composed = composeProviderAuthority(base({ [field]: undefined }));
    expect(composed).toMatchObject({ state: 'hold', reasonCode });
  });

  it('holds on missing or project-scoped custody without constructing a runtime', () => {
    const basis = base();
    const missing = {
      ...basis,
      env: { ...basis.env, DECKENT_HOME: root('deckent-provider-missing-') },
    };
    expect(composeProviderAuthority(missing)).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_unavailable',
    });

    const projectRoot = root('deckent-provider-project-custody-');
    ProviderAuthorityKeyring.create({ dataDir: projectRoot });
    expect(composeProviderAuthority({
      ...base(),
      projectRoot,
      env: { HOME: projectRoot, DECKENT_HOME: projectRoot },
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'keyring_storage_unsafe',
    });
  });
});
