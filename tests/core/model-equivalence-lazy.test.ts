/**
 * tests/core/model-equivalence-lazy.test.ts
 *
 * Verifies MODEL_TIERS lazy-init pattern (Sprint 204, Task 204-001).
 * Covers: lazy init, tier contents, cache idempotency, circular-import smoke.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/core/model-registry.js', () => ({
  modelRegistry: {
    getByTier: vi.fn().mockImplementation((tier: string) => {
      const map: Record<string, Array<{ id: string }>> = {
        premium: [{ id: 'claude-opus-4-8' }, { id: 'gpt-5.5' }],
        standard: [{ id: 'claude-sonnet-5' }, { id: 'gpt-4.1' }],
        economy: [{ id: 'claude-haiku-4-5-20251001' }, { id: 'gpt-5-mini' }],
        premium_plus: [{ id: 'o3' }],
      };
      return map[tier] ?? [];
    }),
    getAllProviders: vi.fn().mockReturnValue(['claude', 'codex', 'gemini']),
    getByProvider: vi.fn().mockReturnValue([]),
    has: vi.fn().mockReturnValue(true),
    getTier: vi.fn().mockReturnValue('standard'),
    get: vi.fn().mockReturnValue({ id: 'claude-opus-4-8', provider: 'claude' }),
    getAllModelIds: vi.fn().mockReturnValue([]),
    getAllModels: vi.fn().mockReturnValue([]),
    getByProviderAndTier: vi.fn(),
    resolveApiId: vi.fn(),
  },
}));

import { MODEL_TIERS, getModelsInTier } from '../../src/core/model-equivalence.js';
import { modelRegistry } from '../../src/core/model-registry.js';

const getByTierMock = vi.mocked(modelRegistry.getByTier);

describe('MODEL_TIERS lazy-init', () => {
  it('getByTier not called at import time (before any MODEL_TIERS access)', () => {
    // This is the first test — no MODEL_TIERS access has happened yet.
    // With lazy init, getByTier must not have been called at module load time.
    expect(getByTierMock).not.toHaveBeenCalled();
  });

  it('premium tier returns correct model IDs on first access', () => {
    const result = MODEL_TIERS['premium'];
    expect(result).toContain('claude-opus-4-8');
    expect(result).toContain('gpt-5.5');
  });

  it('all tiers populated with correct model IDs', () => {
    expect(MODEL_TIERS['standard']).toContain('claude-sonnet-5');
    expect(MODEL_TIERS['economy']).toContain('claude-haiku-4-5-20251001');
    expect(MODEL_TIERS['premium_plus']).toContain('o3');
  });

  it('cache idempotent: getByTier called at most 4 times across repeated accesses', () => {
    // Previous tests accessed all 4 tiers — init should be done.
    const callsAfterInit = getByTierMock.mock.calls.length;
    // Re-access all tiers — should trigger zero new calls (cached).
    void MODEL_TIERS['premium'];
    void MODEL_TIERS['standard'];
    void MODEL_TIERS['economy'];
    void MODEL_TIERS['premium_plus'];
    expect(getByTierMock.mock.calls.length).toBe(callsAfterInit);
    // Total calls across entire init must not exceed 4 (one per tier).
    expect(callsAfterInit).toBeLessThanOrEqual(4);
  });

  it('getModelsInTier delegates to MODEL_TIERS via Proxy correctly', () => {
    expect(getModelsInTier('premium')).toContain('claude-opus-4-8');
    expect(getModelsInTier('economy')).toContain('claude-haiku-4-5-20251001');
    expect(getModelsInTier('standard')).toContain('claude-sonnet-5');
  });
});
