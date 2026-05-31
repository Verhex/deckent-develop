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
// Sprint 208 Task 1: apiId-aware matching root-bug fix.
// Bundled entries use alias IDs (e.g. 'opus'); remote entries use full API IDs
// (e.g. 'claude-opus-4-8'). Match must succeed when bundled.apiId equals
// either remote.apiId OR remote.id, and the bundled alias must be preserved.

describe('mergeApiIdOverrides — apiId-aware matching', () => {
  it('matches via remote.apiId === bundled.apiId and updates apiId + cost + contextWindow', () => {
    // Bundled has the SAME apiId as remote's apiId (steady state after Sprint 207
    // hardcoded bump). Remote brings fresher cost/contextWindow data.
    const existing = [
      makeModel('opus', 'claude-opus-4-8', {
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
    expect(result[0]!.id).toBe('opus'); // alias preserved
    expect(result[0]!.apiId).toBe('claude-opus-4-8');
    expect(result[0]!.contextWindow).toBe(1_000_000); // refreshed from remote
    expect(result[0]!.costPerMillion).toEqual({ input: 15, output: 75 });
  });

  it('preserves bundled alias id when match succeeds (apiId path)', () => {
    // Critical invariant: even when remote brings a completely different apiId,
    // the short alias 'opus' must NOT be replaced by the long form.
    const existing = [makeModel('opus', 'claude-opus-4-8')];
    const remote = [
      // Models.dev pattern: id IS the apiId; here we simulate an upstream rename
      makeModel('claude-opus-4-8', 'claude-opus-4-9'),
    ];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('opus'); // alias kept
    expect(result[0]!.apiId).toBe('claude-opus-4-9'); // updated to live value
  });

  it('appends unmatched remote entry as a new registry entry', () => {
    // Upstream-only model (no bundled counterpart) must reach the registry,
    // otherwise users can never use newly-released models without a re-release.
    const existing = [makeModel('opus', 'claude-opus-4-8')];
    const remote = [
      makeModel('claude-haiku-5-0', 'claude-haiku-5-0', {
        tier: 'economy',
        costPerMillion: { input: 0.5, output: 2 },
      }),
    ];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(2);
    const opus = result.find(m => m.id === 'opus');
    const haiku5 = result.find(m => m.id === 'claude-haiku-5-0');
    expect(opus).toBeDefined();
    expect(opus!.apiId).toBe('claude-opus-4-8'); // bundled unaffected
    expect(haiku5).toBeDefined();
    expect(haiku5!.tier).toBe('economy');
  });

  it('is idempotent — second pass produces equal result', () => {
    const existing = [makeModel('opus', 'claude-opus-4-8')];
    const remote = [
      makeModel('claude-opus-4-8', 'claude-opus-4-8', {
        contextWindow: 1_000_000,
      }),
    ];

    const first = mergeApiIdOverrides(existing, remote);
    const second = mergeApiIdOverrides(first, remote);

    expect(first).toEqual(second);
    expect(second[0]!.id).toBe('opus');
    expect(second[0]!.apiId).toBe('claude-opus-4-8');
    expect(second[0]!.contextWindow).toBe(1_000_000);
  });

  it('each remote entry is consumed at most once (no double-update across bundled entries)', () => {
    // Two bundled entries with the same apiId should not both consume the same
    // remote entry — the second bundled entry stays as-is.
    const existing = [
      makeModel('opus', 'claude-opus-4-8'),
      makeModel('opus-mirror', 'claude-opus-4-8'),
    ];
    const remote = [
      makeModel('claude-opus-4-8', 'claude-opus-4-9', { contextWindow: 1_000_000 }),
    ];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(2);
    const opus = result.find(m => m.id === 'opus');
    const mirror = result.find(m => m.id === 'opus-mirror');
    expect(opus!.apiId).toBe('claude-opus-4-9'); // first bundled consumed the match
    expect(mirror!.apiId).toBe('claude-opus-4-8'); // second bundled unchanged
  });
});
