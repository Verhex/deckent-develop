import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/host-detector.js', () => ({
  DEFAULT_WORKER_MEM_GB: 4,
  detectHostMemory: vi.fn(() => ({ totalGB: 12, source: 'test' })),
  suggestMaxWorkers: vi.fn(() => 2),
}));

import {
  _resetSpawnCoordinatorCache,
  getDetectedHostMemory,
  resolveAutoMaxWorkers,
  tierBasedMaxWorkers,
} from '../../src/orchestra/spawn-coordinator.js';
import { detectHostMemory } from '../../src/core/host-detector.js';

describe('spawn-coordinator', () => {
  beforeEach(() => {
    _resetSpawnCoordinatorCache();
    vi.clearAllMocks();
  });

  it('caches host detection and respects explicit worker configuration', () => {
    expect(getDetectedHostMemory()).toEqual({ totalGB: 12, source: 'test' });
    expect(getDetectedHostMemory()).toEqual({ totalGB: 12, source: 'test' });
    expect(detectHostMemory).toHaveBeenCalledTimes(1);
    expect(resolveAutoMaxWorkers(3)).toBe(3);
  });

  it('applies the conservative tier cap', () => {
    expect(tierBasedMaxWorkers(7)).toBe(1);
    expect(tierBasedMaxWorkers(12)).toBe(2);
    expect(tierBasedMaxWorkers(20)).toBe(3);
    expect(tierBasedMaxWorkers(64)).toBe(4);
    expect(tierBasedMaxWorkers(Number.NaN)).toBe(1);
  });
});
