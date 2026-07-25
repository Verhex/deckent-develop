import { describe, expect, it } from 'vitest';

import {
  ProviderEvidenceSourceRegistry,
  type ProviderEvidenceSourceRegistration,
} from '../../src/core/provider-evidence-source-registry.js';
import type { ProviderEvidenceSources } from '../../src/core/provider-evidence-producer.js';

function sources(name: string): ProviderEvidenceSources {
  return {
    account: {
      authorityRef: `account-authority:${name}-0001`,
      resolve: async () => ({ state: 'hold', evidenceRef: `account-evidence:${name}-0001` }),
    },
    limit: {
      authorityRef: `limit-authority:${name}-0001`,
      kind: 'provider-api',
      authority: 'authoritative',
      observe: async () => {
        throw new Error('not called by registry tests');
      },
    },
    reachability: {
      authorityRef: `reachability-authority:${name}-0001`,
      probe: async () => {
        throw new Error('not called by registry tests');
      },
    },
  };
}

const CLAUDE: ProviderEvidenceSourceRegistration = {
  provider: 'claude',
  authMode: 'subscription',
  transport: 'cli',
  executionBackend: 'docker',
  sources: sources('claude'),
};
const CODEX: ProviderEvidenceSourceRegistration = {
  provider: 'codex',
  authMode: 'api',
  transport: 'http',
  executionBackend: 'host-subprocess',
  sources: sources('codex'),
};
const OPENROUTER: ProviderEvidenceSourceRegistration = {
  provider: 'openrouter',
  authMode: 'api',
  transport: 'api',
  executionBackend: 'api',
  sources: sources('openrouter'),
};

describe('ProviderEvidenceSourceRegistry', () => {
  it('is registration-order independent and resolves one exact scope', () => {
    const forward = new ProviderEvidenceSourceRegistry([CLAUDE, CODEX]);
    const reverse = new ProviderEvidenceSourceRegistry([CODEX, CLAUDE]);

    expect(forward.authorityRef).toBe(reverse.authorityRef);
    const selected = forward.resolve({
      provider: 'claude',
      authMode: 'subscription',
      transport: 'cli',
      executionBackend: 'docker',
    });
    expect(selected).toMatchObject({
      provider: 'claude',
      authMode: 'subscription',
      transport: 'cli',
      executionBackend: 'docker',
      sources: {
        account: { authorityRef: 'account-authority:claude-0001' },
        limit: { authorityRef: 'limit-authority:claude-0001' },
        reachability: { authorityRef: 'reachability-authority:claude-0001' },
      },
    });
    expect(selected?.authorityEvidenceRef).toMatch(/^provider-source-selection:[a-f0-9]{64}$/u);
  });

  it.each([
    [{ provider: 'gemini', authMode: 'subscription', transport: 'cli', executionBackend: 'docker' }],
    [{ provider: 'claude', authMode: 'api', transport: 'cli', executionBackend: 'docker' }],
    [{ provider: 'claude', authMode: 'subscription', transport: 'http', executionBackend: 'docker' }],
    [{
      provider: 'claude',
      authMode: 'subscription',
      transport: 'cli',
      executionBackend: 'host-subprocess',
    }],
  ] as const)('does not fall back for a near-match scope %#', (scope) => {
    expect(new ProviderEvidenceSourceRegistry([CLAUDE, CODEX]).resolve(scope)).toBeNull();
  });

  it('rejects duplicate exact scope instead of overwriting by registration order', () => {
    expect(() => new ProviderEvidenceSourceRegistry([
      CLAUDE,
      { ...CLAUDE, sources: sources('replacement') },
    ])).toThrow(/Duplicate provider evidence source scope/u);
  });

  it('resolves api/api exactly and never falls back to a local HTTP near-match', () => {
    const registry = new ProviderEvidenceSourceRegistry([OPENROUTER]);

    expect(registry.resolve(OPENROUTER)).toMatchObject({
      provider: 'openrouter',
      authMode: 'api',
      transport: 'api',
      executionBackend: 'api',
    });
    expect(registry.resolve({
      provider: 'openrouter',
      authMode: 'api',
      transport: 'http',
      executionBackend: 'in-process',
    })).toBeNull();
  });

  it('snapshots nested source authorities against post-construction mutation', () => {
    const mutable = sources('mutable');
    const registry = new ProviderEvidenceSourceRegistry([{
      ...CLAUDE,
      sources: mutable,
    }]);
    const selectedBefore = registry.resolve(CLAUDE);
    Object.assign(mutable.account, {
      authorityRef: 'account-authority:mutated-0001',
      resolve: async () => {
        throw new Error('mutated source must not enter the immutable registry');
      },
    });

    const selectedAfter = registry.resolve(CLAUDE);
    expect(selectedAfter).toBe(selectedBefore);
    expect(selectedAfter?.sources.account.authorityRef).toBe('account-authority:mutable-0001');
  });

  it.each([
    [{ ...CLAUDE, authMode: 'unknown' }],
    [{ ...CLAUDE, executionBackend: 'unknown' }],
  ] as const)('rejects non-executable authority registration %#', (registration) => {
    expect(() => new ProviderEvidenceSourceRegistry([registration]))
      .toThrow(/require an executable auth and backend scope/u);
  });

  it('returns no source for an unknown query scope', () => {
    expect(new ProviderEvidenceSourceRegistry([CLAUDE]).resolve({
      provider: 'claude',
      authMode: 'unknown',
      transport: 'cli',
      executionBackend: 'docker',
    })).toBeNull();
  });
});
