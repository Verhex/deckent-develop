import { describe, expect, it } from 'vitest';

import {
  createClaudeHostSubscriptionEvidenceSourceRegistrations,
  createClaudeHostSubscriptionEvidenceSourceRegistry,
} from '../../src/providers/claude-provider-evidence-sources.js';

const EXACT_SCOPE = {
  provider: 'claude',
  authMode: 'subscription' as const,
  transport: 'cli' as const,
  executionBackend: 'host-subprocess' as const,
};

describe('createClaudeHostSubscriptionEvidenceSourceRegistry', () => {
  it('constructs one lazy exact-scope registration without invoking a producer', () => {
    const registrations = createClaudeHostSubscriptionEvidenceSourceRegistrations({
      projectRoot: '/project',
      platform: 'linux',
      env: { PATH: '/bin' },
    });

    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject(EXACT_SCOPE);
    expect(typeof registrations[0]?.sources.account.resolve).toBe('function');
    expect(typeof registrations[0]?.sources.limit.observe).toBe('function');
    expect(typeof registrations[0]?.sources.reachability.probe).toBe('function');
  });

  it('registers one deterministic concrete source bundle for the exact proven scope', () => {
    const first = createClaudeHostSubscriptionEvidenceSourceRegistry({
      projectRoot: '/project',
      platform: 'linux',
      env: { PATH: '/bin' },
    });
    const second = createClaudeHostSubscriptionEvidenceSourceRegistry({
      projectRoot: '/project',
      platform: 'linux',
      env: { PATH: '/different-bin' },
    });

    const selected = first.resolve(EXACT_SCOPE);
    expect(selected).toMatchObject({
      ...EXACT_SCOPE,
      authorityEvidenceRef: expect.stringMatching(/^provider-source-selection:[a-f0-9]{64}$/u),
      sources: {
        account: {
          authorityRef: expect.stringMatching(/^claude-account-authority:[a-f0-9]{64}$/u),
        },
        limit: {
          authorityRef: expect.stringMatching(/^claude-limit-authority:[a-f0-9]{64}$/u),
          kind: 'provider-cli',
          authority: 'advisory',
        },
        reachability: {
          authorityRef: expect.stringMatching(/^claude-reachability-authority:[a-f0-9]{64}$/u),
        },
      },
    });
    expect(first.authorityRef).toBe(second.authorityRef);
    expect(selected?.authorityEvidenceRef)
      .toBe(second.resolve(EXACT_SCOPE)?.authorityEvidenceRef);
    expect(typeof selected?.sources.account.resolve).toBe('function');
    expect(typeof selected?.sources.limit.observe).toBe('function');
    expect(typeof selected?.sources.reachability.probe).toBe('function');
  });

  it.each([
    [{ ...EXACT_SCOPE, provider: 'codex' }, 'foreign provider'],
    [{ ...EXACT_SCOPE, authMode: 'api' as const }, 'API auth'],
    [{ ...EXACT_SCOPE, authMode: 'hybrid' as const }, 'hybrid auth'],
    [{ ...EXACT_SCOPE, executionBackend: 'docker' as const }, 'Docker backend'],
    [{ ...EXACT_SCOPE, executionBackend: 'tmux' as const }, 'tmux backend'],
  ])('does not project host account truth onto %s', (scope) => {
    const registry = createClaudeHostSubscriptionEvidenceSourceRegistry({
      projectRoot: '/project',
      env: {},
    });

    expect(registry.resolve(scope)).toBeNull();
  });
});
