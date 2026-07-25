import { describe, expect, it, vi } from 'vitest';

import { ClaudeSubscriptionLimitEvidenceSource } from '../../src/providers/claude-subscription-limit-evidence.js';
import {
  createProviderLimitResult,
  deriveProviderQuotaScopeRefHash,
  type ProviderLimitPolicy,
} from '../../src/core/provider-limit-truth.js';
import type { ProviderLimitEvidenceSource } from '../../src/core/provider-evidence-producer.js';

const NOW = new Date('2026-07-24T08:00:00.000Z');
const ACCOUNT_REF = 'a'.repeat(64);
const ENDPOINT_REF = 'b'.repeat(64);
const BACKEND_SCOPE_REF = 'c'.repeat(64);

type SourceInput = Parameters<ProviderLimitEvidenceSource['observe']>[0];

function input(overrides: Partial<SourceInput> = {}): SourceInput {
  return {
    tenantId: 'tenant-test',
    projectId: 'project-test',
    provider: 'claude',
    model: 'claude-fable-5',
    authMode: 'subscription',
    accountRefHash: ACCOUNT_REF,
    accountEvidence: {
      identityEvidenceRef: 'account-evidence:claude-0001',
      credentialGenerationRef: 'credential-generation:claude-0001',
      backendScopeRefHash: BACKEND_SCOPE_REF,
    },
    backend: {
      transport: 'cli',
      executionBackend: 'host-subprocess',
      endpointRefHash: ENDPOINT_REF,
    },
    ...overrides,
  };
}

const POLICY: ProviderLimitPolicy = {
  policyRef: 'provider-policy:claude-test',
  warnAtRatio: 0.8,
  blockAtRatio: 0.95,
  minimumRemaining: {},
};

describe('ClaudeSubscriptionLimitEvidenceSource', () => {
  it('projects exact percentages but remains advisory unknown/HOLD', async () => {
    const raw = [
      'Current session: 81% used · resets Jul 24, 8:30pm (Europe/Istanbul)',
      'Current week (all models): 31% used · resets Jul 27, 12:00am (Europe/Istanbul)',
      'Current week (Fable): 26% used · resets Jul 27, 12:00am (Europe/Istanbul)',
    ].join('\n');
    const probe = vi.fn(async () => ({
      unavailable: false as const,
      sessionPct: 81,
      sessionResetAt: { text: 'Jul 24, 8:30pm', timezone: 'Europe/Istanbul' },
      weekAllPct: 31,
      weekAllResetAt: { text: 'Jul 27, 12:00am', timezone: 'Europe/Istanbul' },
      weekFablePct: 26,
      raw,
    }));
    const source = new ClaudeSubscriptionLimitEvidenceSource({
      probe,
      now: () => NOW,
      ttlMs: 30_000,
    });
    const scope = input();

    const observation = await source.observe(scope);

    expect(probe).toHaveBeenCalledOnce();
    expect(source).toMatchObject({
      kind: 'provider-cli',
      authority: 'advisory',
    });
    expect(observation).toMatchObject({
      state: 'known',
      requiredWindowIds: ['claude.session', 'claude.week-all', 'claude.week-fable'],
      windows: [
        {
          windowId: 'claude.session',
          consumed: 81,
          remaining: 19,
          limit: 100,
          reset: { state: 'unknown', at: null },
        },
        {
          windowId: 'claude.week-all',
          consumed: 31,
          remaining: 69,
          limit: 100,
          reset: { state: 'unknown', at: null },
        },
        {
          windowId: 'claude.week-fable',
          kind: 'custom',
          model: null,
          consumed: 26,
          remaining: 74,
          limit: 100,
          reset: { state: 'unknown', at: null },
        },
      ],
      source: {
        fetchedAt: NOW.toISOString(),
        expiresAt: '2026-07-24T08:00:30.000Z',
      },
    });
    for (const window of observation.windows) {
      expect(window.reset.displayRefHash).toMatch(/^[a-f0-9]{64}$/u);
    }
    const serialized = JSON.stringify(observation);
    expect(serialized).not.toContain(raw);
    expect(serialized).not.toContain('Jul 24');
    expect(serialized).not.toContain('Europe/Istanbul');

    const quotaScopeRefHash = deriveProviderQuotaScopeRefHash({
      ...scope,
      backend: scope.backend,
    });
    const materialized = createProviderLimitResult({
      idempotencyKey: 'claude-limit-observation-0001',
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      provider: scope.provider,
      accountRefHash: scope.accountRefHash,
      quotaScopeRefHash,
      authMode: scope.authMode,
      backend: scope.backend,
      state: observation.state,
      requiredWindowIds: observation.requiredWindowIds,
      windows: observation.windows,
      source: {
        ...observation.source,
        kind: source.kind,
        authority: source.authority,
      },
      evidenceRefs: observation.evidenceRefs,
    }, POLICY, { idFactory: () => 'limit-claude-advisory-0001' });
    expect(materialized).toMatchObject({
      state: 'unknown',
      decision: 'hold',
      pressure: 'unknown',
      reasonCode: 'source_unknown',
    });
  });

  it('keeps the model-specific window required when the display row is absent', async () => {
    const source = new ClaudeSubscriptionLimitEvidenceSource({
      probe: async () => ({
        unavailable: false,
        sessionPct: 12,
        sessionResetAt: null,
        weekAllPct: 5,
        weekAllResetAt: null,
        raw: 'bounded fixture',
      }),
      now: () => NOW,
    });

    const observation = await source.observe(input());

    expect(observation.requiredWindowIds).toContain('claude.week-fable');
    expect(observation.windows.map(window => window.windowId))
      .not.toContain('claude.week-fable');
  });

  it('returns unavailable and never calls the probe for a near-match scope', async () => {
    const probe = vi.fn();
    const source = new ClaudeSubscriptionLimitEvidenceSource({
      probe,
      now: () => NOW,
    });
    const cases: SourceInput[] = [
      input({ provider: 'codex' }),
      input({ authMode: 'api' }),
      input({ accountRefHash: null }),
      input({ accountEvidence: null }),
      input({ backend: { ...input().backend, transport: 'http' } }),
      input({ model: 'fable' }),
    ];

    for (const scope of cases) {
      await expect(source.observe(scope)).resolves.toMatchObject({
        state: 'unavailable',
        windows: [],
      });
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it('hashes unavailable raw output without persisting it', async () => {
    const raw = 'private changed provider output';
    const source = new ClaudeSubscriptionLimitEvidenceSource({
      probe: async () => ({
        unavailable: true,
        reason: 'format changed',
        raw,
      }),
      now: () => NOW,
    });

    const observation = await source.observe(input());

    expect(observation).toMatchObject({
      state: 'unavailable',
      windows: [],
      source: {
        evidenceRef: expect.stringMatching(/^claude-limit-unavailable:[a-f0-9]{64}$/u),
      },
    });
    expect(JSON.stringify(observation)).not.toContain(raw);
  });
});
