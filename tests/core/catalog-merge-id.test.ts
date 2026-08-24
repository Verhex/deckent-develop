import { describe, it, expect } from 'vitest';
import { mergeApiIdOverrides } from '../../src/core/model-catalog.js';
import type { ModelDefinition } from '../../src/core/model-registry.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeModel(
  id: string,
  apiId: string,
  overrides: Partial<ModelDefinition> = {},
): ModelDefinition {
  return {
    id,
    apiId,
    provider: 'claude',
    tier: 'premium',
    contextWindow: 200_000,
    costPerMillion: { input: 15, output: 75 },
    capabilities: {
      streaming: true,
      toolUse: true,
      vision: true,
      codeExecution: true,
      reasoning: false,
    },
    status: 'ga',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────
// Canonical identity contract: bundled and remote entries use the provider API
// id unchanged (`id === apiId`). The apiId is the sole merge key.

describe('mergeApiIdOverrides — apiId-aware matching', () => {
  it('matches via remote.apiId === bundled.apiId and updates apiId + cost + contextWindow', () => {
    // Bundled has the SAME apiId as remote's apiId (steady state after Sprint 207
    // hardcoded bump). Remote brings fresher cost/contextWindow data.
    const existing = [
      makeModel('claude-opus-4-8', 'claude-opus-4-8', {
        contextWindow: 200_000,
        costPerMillion: { input: 20, output: 100 },
      }),
    ];
    const remote = [
      makeModel('claude-opus-4-8', 'claude-opus-4-8', {
        contextWindow: 1_000_000,
        costPerMillion: { input: 15, output: 75 },
      }),
    ];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('claude-opus-4-8');
    expect(result[0]!.apiId).toBe('claude-opus-4-8');
    expect(result[0]!.contextWindow).toBe(1_000_000); // refreshed from remote
    expect(result[0]!.costPerMillion).toEqual({ input: 15, output: 75 });
  });

  it('preserves the exact canonical id when a matching remote row refreshes it', () => {
    const existing = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];
    const remote = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('claude-opus-4-8');
    expect(result[0]!.apiId).toBe('claude-opus-4-8');
  });

  it('appends unmatched remote entry as a new registry entry', () => {
    // Upstream-only model (no bundled counterpart) must reach the registry,
    // otherwise users can never use newly-released models without a re-release.
    const existing = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];
    const remote = [
      makeModel('claude-haiku-5-0', 'claude-haiku-5-0', {
        tier: 'economy',
        costPerMillion: { input: 0.5, output: 2 },
      }),
    ];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(2);
    const opus = result.find(m => m.id === 'claude-opus-4-8');
    const haiku5 = result.find(m => m.id === 'claude-haiku-5-0');
    expect(opus).toBeDefined();
    expect(opus!.apiId).toBe('claude-opus-4-8'); // bundled unaffected
    expect(haiku5).toBeDefined();
    expect(haiku5!.tier).toBe('economy');
  });

  it('keeps equal apiIds from different providers as distinct logical models', () => {
    const existing = [makeModel('shared-id', 'shared-id', { provider: 'claude' })];
    const remote = [makeModel('shared-id', 'shared-id', { provider: 'codex' })];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result.map(model => model.provider)).toEqual(['claude', 'codex']);
  });

  it('is idempotent — second pass produces equal result', () => {
    const existing = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];
    const remote = [
      makeModel('claude-opus-4-8', 'claude-opus-4-8', {
        contextWindow: 1_000_000,
      }),
    ];

    const first = mergeApiIdOverrides(existing, remote);
    const second = mergeApiIdOverrides(first, remote);

    expect(first).toEqual(second);
    expect(second[0]!.id).toBe('claude-opus-4-8');
    expect(second[0]!.apiId).toBe('claude-opus-4-8');
    expect(second[0]!.contextWindow).toBe(1_000_000);
  });

  it('each remote entry is consumed at most once (no double-update across bundled entries)', () => {
    // Distinct exact API identities cannot collapse into an alias/mirror row.
    const existing = [
      makeModel('claude-opus-4-8', 'claude-opus-4-8'),
      makeModel('claude-opus-4-9', 'claude-opus-4-9'),
    ];
    const remote = [
      makeModel('claude-opus-4-8', 'claude-opus-4-8', { contextWindow: 1_000_000 }),
    ];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(2);
    const current = result.find(m => m.id === 'claude-opus-4-8');
    const next = result.find(m => m.id === 'claude-opus-4-9');
    expect(current!.contextWindow).toBe(1_000_000);
    expect(next!.apiId).toBe('claude-opus-4-9');
  });
});
