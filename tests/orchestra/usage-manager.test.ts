import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// Mock system-profile
vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn(() => ({
    cpuCores: 8,
    totalMemMB: 16384,
    freeMemMB: 8192,
    recommendedMaxWorkers: 4,
  })),
}));

// Mock provider registry
const mockCheckUsage = vi.fn();
const mockProvider = {
  name: 'mock-provider',
  supportedModels: ['opus', 'sonnet', 'haiku'] as const,
  spawn: vi.fn(),
  kill: vi.fn(),
  listWorkers: vi.fn(() => []),
  checkUsage: mockCheckUsage,
  isAvailable: vi.fn(async () => true),
  buildCommand: vi.fn(() => 'mock-command'),
};

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn(() => mockProvider),
  },
}));

import { spawnSync } from 'node:child_process';
import { checkUsage, checkUsageWithProvider, getDefaultProvider, adjustSprintSize } from '../../src/orchestra/usage-manager.js';
import { providerRegistry } from '../../src/core/provider.js';
import type { ResolvedConfig, UsageMetrics } from '../../src/core/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<{
  max_workers: number | 'auto';
  haiku_allowed: boolean;
  usage_thresholds: { '5hr': number; weekly: number };
}>): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: overrides?.max_workers ?? 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: overrides?.haiku_allowed ?? false,
      usage_thresholds: overrides?.usage_thresholds ?? { '5hr': 0.8, weekly: 0.7 },
    },
    modes: {} as any,
    language: 'en',
    projectName: 'test-project',
    projectRoot: '/tmp/test',
    version: '1.0.0',
  };
}

function makeUsage(five: number, weekly: number): UsageMetrics {
  return { fiveHourPercent: five, weeklyPercent: weekly, measuredAt: new Date().toISOString() };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('usage-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── checkUsage ──────────────────────────────────────────────────

  describe('checkUsage', () => {
    it('returns safe defaults when CLI fails (non-zero exit)', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'error',
        pid: 0,
        output: [],
        signal: null,
      });

      const result = checkUsage(makeConfig());
      expect(result.fiveHourPercent).toBe(50);
      expect(result.weeklyPercent).toBe(30);
      expect(result.measuredAt).toBeTruthy();
    });

    it('returns safe defaults when CLI produces no stdout', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      });

      const result = checkUsage(makeConfig());
      expect(result.fiveHourPercent).toBe(50);
      expect(result.weeklyPercent).toBe(30);
    });

    it('parses 5hr and weekly percentages from CLI output', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '5-hour: 65.3%\nweekly: 42.1%',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      });

      const result = checkUsage(makeConfig());
      expect(result.fiveHourPercent).toBeCloseTo(65.3);
      expect(result.weeklyPercent).toBeCloseTo(42.1);
    });

    it('returns safe defaults when spawnSync throws', () => {
      vi.mocked(spawnSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = checkUsage(makeConfig());
      expect(result.fiveHourPercent).toBe(50);
      expect(result.weeklyPercent).toBe(30);
    });

    it('handles alternative output format (percentage before label)', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '72.5% of 5-hr limit\n55.0% of weekly limit',
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      });

      const result = checkUsage(makeConfig());
      expect(result.fiveHourPercent).toBeCloseTo(72.5);
    });
  });

  // ─── checkUsageWithProvider ──────────────────────────────────────

  describe('checkUsageWithProvider', () => {
    it('delegates to the provider adapter checkUsage()', async () => {
      const expected: UsageMetrics = { fiveHourPercent: 75, weeklyPercent: 60, measuredAt: new Date().toISOString() };
      mockCheckUsage.mockResolvedValue(expected);

      const result = await checkUsageWithProvider(mockProvider);
      expect(result).toEqual(expected);
      expect(mockCheckUsage).toHaveBeenCalledOnce();
    });

    it('propagates provider errors', async () => {
      mockCheckUsage.mockRejectedValue(new Error('Provider unavailable'));

      await expect(checkUsageWithProvider(mockProvider)).rejects.toThrow('Provider unavailable');
    });
  });

  // ─── getDefaultProvider ──────────────────────────────────────────

  describe('getDefaultProvider', () => {
    it('returns the default provider from registry', () => {
      const provider = getDefaultProvider();
      expect(provider).toBe(mockProvider);
    });

    it('returns null when no providers are registered', () => {
      vi.mocked(providerRegistry.getDefault).mockImplementation(() => {
        throw new Error('No providers registered');
      });

      const provider = getDefaultProvider();
      expect(provider).toBeNull();
    });
  });

  // ─── adjustSprintSize ───────────────────────────────────────────

  describe('adjustSprintSize', () => {
    it('returns full size when no thresholds exceeded', () => {
      const config = makeConfig({ max_workers: 4 });
      const usage = makeUsage(50, 40); // 50% < 80%, 40% < 70%

      const result = adjustSprintSize(config, usage);
      expect(result.size).toBe('full');
      expect(result.maxWorkers).toBe(4);
      expect(result.modelConstraint).toBeNull();
      expect(result.reason).toBe('No usage constraints');
    });

    it('returns reduced when only 5hr threshold exceeded', () => {
      const config = makeConfig({ max_workers: 4, usage_thresholds: { '5hr': 0.8, weekly: 0.7 } });
      const usage = makeUsage(85, 40); // 85% >= 80%, 40% < 70%

      const result = adjustSprintSize(config, usage);
      expect(result.size).toBe('reduced');
      expect(result.maxWorkers).toBe(2); // floor(4/2)
      expect(result.modelConstraint).toBe('sonnet');
      expect(result.reason).toContain('5hr');
    });

    it('returns reduced when only weekly threshold exceeded', () => {
      const config = makeConfig({ max_workers: 6, usage_thresholds: { '5hr': 0.8, weekly: 0.7 } });
      const usage = makeUsage(50, 75); // 50% < 80%, 75% >= 70%

      const result = adjustSprintSize(config, usage);
      expect(result.size).toBe('reduced');
      expect(result.maxWorkers).toBe(3); // floor(6/2)
      expect(result.modelConstraint).toBe('sonnet');
      expect(result.reason).toContain('Weekly');
    });

    it('returns minimal when both thresholds exceeded (haiku not allowed)', () => {
      const config = makeConfig({
        max_workers: 4,
        haiku_allowed: false,
        usage_thresholds: { '5hr': 0.8, weekly: 0.7 },
      });
      const usage = makeUsage(90, 80); // both exceeded

      const result = adjustSprintSize(config, usage);
      expect(result.size).toBe('minimal');
      expect(result.maxWorkers).toBe(1);
      expect(result.modelConstraint).toBe('sonnet');
      expect(result.reason).toBe('Both usage thresholds exceeded');
    });

    it('returns minimal with haiku constraint when haiku is allowed', () => {
      const config = makeConfig({
        max_workers: 4,
        haiku_allowed: true,
        usage_thresholds: { '5hr': 0.8, weekly: 0.7 },
      });
      const usage = makeUsage(90, 80);

      const result = adjustSprintSize(config, usage);
      expect(result.size).toBe('minimal');
      expect(result.maxWorkers).toBe(1);
      expect(result.modelConstraint).toBe('haiku');
    });

    it('handles auto max_workers by using system profile', () => {
      const config = makeConfig({ max_workers: 'auto' });
      const usage = makeUsage(50, 40);

      const result = adjustSprintSize(config, usage);
      // system profile mock returns recommendedMaxWorkers = 4
      expect(result.size).toBe('full');
      expect(result.maxWorkers).toBe(4);
    });

    it('uses provided systemProfile instead of auto-detecting', () => {
      const config = makeConfig({ max_workers: 'auto' });
      const usage = makeUsage(50, 40);
      const profile = { cpuCores: 16, totalMemMB: 32768, freeMemMB: 16384, recommendedMaxWorkers: 8 };

      const result = adjustSprintSize(config, usage, profile);
      expect(result.maxWorkers).toBe(8);
    });

    it('ensures maxWorkers is at least 1 when reduced', () => {
      const config = makeConfig({ max_workers: 1, usage_thresholds: { '5hr': 0.5, weekly: 0.9 } });
      const usage = makeUsage(55, 40); // only 5hr exceeded

      const result = adjustSprintSize(config, usage);
      expect(result.size).toBe('reduced');
      expect(result.maxWorkers).toBe(1); // max(1, floor(1/2)) = max(1, 0) = 1
    });
  });
});
