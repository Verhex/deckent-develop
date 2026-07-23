import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  composeProviderAuthority,
  type ProviderAuthorityCompositionOptions,
} from '../../src/core/provider-authority-composition.js';
import type { ProviderEvidenceSources } from '../../src/core/provider-evidence-producer.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import type { ProviderLimitPolicy } from '../../src/core/provider-limit-truth.js';

const roots: string[] = [];
const receiptStores: InvocationReceiptStore[] = [];
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

function sources(): ProviderEvidenceSources {
  return {
    account: {
      authorityRef: 'account-authority:test-0001',
      resolve: async () => ({ state: 'ready', stableAccountIdentity: 'test-account' }),
    },
    limit: {
      authorityRef: 'limit-producer:test-0001',
      kind: 'provider-cli',
      authority: 'authoritative',
      observe: async () => {
        throw new Error('not invoked during composition');
      },
    },
    reachability: {
      authorityRef: 'truth-producer:test-0001',
      probe: async () => {
        throw new Error('not invoked during composition');
      },
    },
  };
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
  const receiptLedger = new InvocationReceiptStore(projectRoot, {
    idFactory: () => 'project-canonical-0001',
  });
  receiptStores.push(receiptLedger);
  return {
    mode: 'solo',
    projectId: 'project-canonical-0001',
    projectRoot,
    platform: 'linux',
    env: { HOME: projectRoot, DECKENT_HOME: globalRoot },
    policyResolver: () => POLICY,
    terminationEvidenceVerifier: () => true,
    evidenceSources: sources(),
    receiptLedger,
    ...overrides,
  };
}

afterEach(() => {
  for (const store of receiptStores.splice(0)) store.close();
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
    expect(composed.evidenceProducer.authorityRef).toMatch(/^provider-evidence:[a-f0-9]{64}$/u);
    expect(composed).toMatchObject({
      accountAuthorityRef: 'account-authority:test-0001',
      truthProducerAuthorityRef: 'truth-producer:test-0001',
      limitProducerAuthorityRef: 'limit-producer:test-0001',
    });
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
    ['evidenceSources', 'account_authority_unavailable'],
    ['receiptLedger', 'truth_producer_unavailable'],
  ] as const)('holds when %s is unavailable', (field, reasonCode) => {
    const composed = composeProviderAuthority(base({ [field]: undefined }));
    expect(composed).toMatchObject({ state: 'hold', reasonCode });
  });

  it('requires each concrete producer capability instead of accepting free-form readiness refs', () => {
    const basis = base();
    const accountMissing = {
      ...basis,
      evidenceSources: { ...basis.evidenceSources!, account: undefined },
    } as unknown as ProviderAuthorityCompositionOptions;
    expect(composeProviderAuthority(accountMissing)).toMatchObject({
      state: 'hold', reasonCode: 'account_authority_unavailable',
    });
    const truthMissing = {
      ...basis,
      evidenceSources: { ...basis.evidenceSources!, reachability: undefined },
    } as unknown as ProviderAuthorityCompositionOptions;
    expect(composeProviderAuthority(truthMissing)).toMatchObject({
      state: 'hold', reasonCode: 'truth_producer_unavailable',
    });
    const limitMissing = {
      ...basis,
      evidenceSources: { ...basis.evidenceSources!, limit: undefined },
    } as unknown as ProviderAuthorityCompositionOptions;
    expect(composeProviderAuthority(limitMissing)).toMatchObject({
      state: 'hold', reasonCode: 'limit_producer_unavailable',
    });
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
