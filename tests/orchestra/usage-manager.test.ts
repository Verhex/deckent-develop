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

const mockRegisteredProviders = new Map<string, typeof mockProvider>();

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn(() => mockProvider),
    hasProvider: vi.fn((name: string) => mockRegisteredProviders.has(name)),
    getProvider: vi.fn((name: string) => mockRegisteredProviders.get(name)),
  },
}));

import { spawnSync } from 'node:child_process';
import {
  checkUsage,
  checkUsageWithProvider,
  getDefaultProvider,
  adjustSprintSize,
  checkAllProviderUsage,
  selectOptimalProvider,
  suggestFallbackProvider,
  adjustSprintSizeMultiProvider,
  getConfiguredProviders,
} from '../../src/orchestra/usage-manager.js';
import type { ProviderUsageMetrics } from '../../src/orchestra/usage-manager.js';
import { providerRegistry } from '../../src/core/provider.js';
import type { ResolvedConfig, UsageMetrics, DeckentConfig, ProviderName } from '../../src/core/types.js';
import type { ModelTier } from '../../src/core/model-equivalence.js';

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

  // ─── Provider Usage Balancer ─────────────────────────────────────

  describe('getConfiguredProviders', () => {
    it('returns [claude] when no providers configured', () => {
      const cfg: DeckentConfig = { mode: 'max_plan', modes: {} as any };
      expect(getConfiguredProviders(cfg)).toEqual(['claude']);
    });

    it('returns unique list of configured providers', () => {
      const cfg: DeckentConfig = {
        mode: 'max_plan',
        modes: {} as any,
        brain_provider: 'claude',
        worker_provider: 'codex',
        fallback_provider: 'gemini',
      };
      const result = getConfiguredProviders(cfg);
      expect(result).toHaveLength(3);
      expect(result).toContain('claude');
      expect(result).toContain('codex');
      expect(result).toContain('gemini');
    });

    it('deduplicates when brain and worker use same provider', () => {
      const cfg: DeckentConfig = {
        mode: 'max_plan',
        modes: {} as any,
        brain_provider: 'claude',
        worker_provider: 'claude',
      };
      expect(getConfiguredProviders(cfg)).toEqual(['claude']);
    });
  });

  describe('checkAllProviderUsage', () => {
    function makeMockAdapter(name: string, fiveHr: number, weekly: number) {
      return {
        name,
        supportedModels: ['opus', 'sonnet', 'haiku'] as const,
        spawn: vi.fn(),
        kill: vi.fn(),
        listWorkers: vi.fn(() => []),
        checkUsage: vi.fn(async () => ({
          fiveHourPercent: fiveHr,
          weeklyPercent: weekly,
          measuredAt: new Date().toISOString(),
        })),
        isAvailable: vi.fn(async () => true),
        buildCommand: vi.fn(() => 'cmd'),
      };
    }

    beforeEach(() => {
      mockRegisteredProviders.clear();
    });

    it('returns map for configured providers', async () => {
      const claudeAdapter = makeMockAdapter('claude', 40, 30);
      const codexAdapter = makeMockAdapter('codex', 60, 50);
      mockRegisteredProviders.set('claude', claudeAdapter as any);
      mockRegisteredProviders.set('codex', codexAdapter as any);

      const cfg: DeckentConfig = {
        mode: 'max_plan',
        modes: {} as any,
        brain_provider: 'claude',
        worker_provider: 'codex',
      };

      const result = await checkAllProviderUsage('/tmp/test', cfg);
      expect(result.size).toBe(2);
      expect(result.has('claude')).toBe(true);
      expect(result.has('codex')).toBe(true);
      expect(result.get('claude')!.percent).toBe(40); // max(40, 30)
      expect(result.get('codex')!.percent).toBe(60); // max(60, 50)
    });

    it('returns safe default (50%) when provider not registered', async () => {
      mockRegisteredProviders.clear();

      const cfg: DeckentConfig = {
        mode: 'max_plan',
        modes: {} as any,
        brain_provider: 'gemini',
      };

      const result = await checkAllProviderUsage('/tmp/test', cfg);
      expect(result.get('gemini')!.percent).toBe(50);
    });

    it('returns safe default when provider checkUsage throws', async () => {
      const badAdapter = makeMockAdapter('claude', 0, 0);
      badAdapter.checkUsage.mockRejectedValue(new Error('API down'));
      mockRegisteredProviders.set('claude', badAdapter as any);

      const cfg: DeckentConfig = { mode: 'max_plan', modes: {} as any, brain_provider: 'claude' };
      const result = await checkAllProviderUsage('/tmp/test', cfg);
      expect(result.get('claude')!.percent).toBe(50);
    });

    it('uses higher of fiveHour/weekly as overall percent', async () => {
      const adapter = makeMockAdapter('claude', 30, 70);
      mockRegisteredProviders.set('claude', adapter as any);

      const cfg: DeckentConfig = { mode: 'max_plan', modes: {} as any, brain_provider: 'claude' };
      const result = await checkAllProviderUsage('/tmp/test', cfg);
      expect(result.get('claude')!.percent).toBe(70); // max(30, 70)
    });

    it('defaults to claude when no providers configured', async () => {
      const cfg: DeckentConfig = { mode: 'max_plan', modes: {} as any };
      const result = await checkAllProviderUsage('/tmp/test', cfg);
      expect(result.has('claude')).toBe(true);
    });
  });

  describe('selectOptimalProvider', () => {
    function makeUsageMap(entries: [ProviderName, number][]): Map<ProviderName, ProviderUsageMetrics> {
      const map = new Map<ProviderName, ProviderUsageMetrics>();
      for (const [provider, percent] of entries) {
        map.set(provider, { percent, provider });
      }
      return map;
    }

    it('picks provider with lowest usage', () => {
      const usage = makeUsageMap([['claude', 80], ['codex', 30], ['gemini', 60]]);
      expect(selectOptimalProvider('premium', usage)).toBe('codex');
    });

    it('picks claude when it has lowest usage for standard tier', () => {
      const usage = makeUsageMap([['claude', 20], ['codex', 50]]);
      expect(selectOptimalProvider('standard', usage)).toBe('claude');
    });

    it('excludes gemini from economy tier', () => {
      const usage = makeUsageMap([['claude', 90], ['codex', 85], ['gemini', 10]]);
      // gemini has no economy model, should pick codex (85 < 90)
      expect(selectOptimalProvider('economy', usage)).toBe('codex');
    });

    it('defaults to claude when no providers in usage map', () => {
      const usage = new Map<ProviderName, ProviderUsageMetrics>();
      expect(selectOptimalProvider('premium', usage)).toBe('claude');
    });

    it('picks only eligible provider even if higher usage', () => {
      const usage = makeUsageMap([['claude', 95]]);
      expect(selectOptimalProvider('premium', usage)).toBe('claude');
    });
  });

  describe('suggestFallbackProvider', () => {
    function makeUsageMap(entries: [ProviderName, number][]): Map<ProviderName, ProviderUsageMetrics> {
      const map = new Map<ProviderName, ProviderUsageMetrics>();
      for (const [provider, percent] of entries) {
        map.set(provider, { percent, provider });
      }
      return map;
    }

    it('returns null when primary is below threshold', () => {
      const usage = makeUsageMap([['claude', 70], ['codex', 30]]);
      expect(suggestFallbackProvider('claude', usage, 'codex')).toBeNull();
    });

    it('suggests configured fallback when primary is high', () => {
      const usage = makeUsageMap([['claude', 85], ['codex', 30]]);
      expect(suggestFallbackProvider('claude', usage, 'codex')).toBe('codex');
    });

    it('returns null when primary is exactly at threshold', () => {
      const usage = makeUsageMap([['claude', 80], ['codex', 30]]);
      expect(suggestFallbackProvider('claude', usage, 'codex')).toBeNull();
    });

    it('picks lowest usage alternative when no explicit fallback', () => {
      const usage = makeUsageMap([['claude', 90], ['codex', 60], ['gemini', 40]]);
      expect(suggestFallbackProvider('claude', usage)).toBe('gemini');
    });

    it('returns null when fallback also has higher usage than primary', () => {
      const usage = makeUsageMap([['claude', 85], ['codex', 90]]);
      expect(suggestFallbackProvider('claude', usage, 'codex')).toBeNull();
    });

    it('returns null when primary not in usage map', () => {
      const usage = new Map<ProviderName, ProviderUsageMetrics>();
      expect(suggestFallbackProvider('claude', usage, 'codex')).toBeNull();
    });
  });

  describe('adjustSprintSizeMultiProvider', () => {
    function makeUsageMap(entries: [ProviderName, number][]): Map<ProviderName, ProviderUsageMetrics> {
      const map = new Map<ProviderName, ProviderUsageMetrics>();
      for (const [provider, percent] of entries) {
        map.set(provider, { percent, provider });
      }
      return map;
    }

    it('returns minimal when all providers above threshold', () => {
      const config = makeConfig({ max_workers: 4 });
      const usage = makeUsageMap([['claude', 90], ['codex', 85]]);

      const result = adjustSprintSizeMultiProvider(config, usage);
      expect(result.size).toBe('minimal');
      expect(result.maxWorkers).toBe(1);
      expect(result.reason).toBe('All providers above usage threshold');
    });

    it('returns full when at least one provider has low usage', () => {
      const config = makeConfig({ max_workers: 4, usage_thresholds: { '5hr': 0.8, weekly: 0.7 } });
      const usage = makeUsageMap([['claude', 90], ['codex', 30]]);

      const result = adjustSprintSizeMultiProvider(config, usage);
      // Lowest is 30%, both thresholds compare against 30% — not exceeded
      expect(result.size).toBe('full');
      expect(result.maxWorkers).toBe(4);
    });

    it('delegates to adjustSprintSize for single provider (backward compat)', () => {
      const config = makeConfig({ max_workers: 4, usage_thresholds: { '5hr': 0.8, weekly: 0.7 } });
      const usage = makeUsageMap([['claude', 50]]);

      const result = adjustSprintSizeMultiProvider(config, usage);
      expect(result.size).toBe('full');
      expect(result.maxWorkers).toBe(4);
    });

    it('returns safe default for empty usage map', () => {
      const config = makeConfig({ max_workers: 4 });
      const usage = new Map<ProviderName, ProviderUsageMetrics>();

      const result = adjustSprintSizeMultiProvider(config, usage);
      // Safe default 50% used for both — should not exceed 80%/70%
      expect(result.size).toBe('full');
    });

    it('returns minimal with haiku when all high and haiku allowed', () => {
      const config = makeConfig({ max_workers: 4, haiku_allowed: true });
      const usage = makeUsageMap([['claude', 85], ['codex', 90]]);

      const result = adjustSprintSizeMultiProvider(config, usage);
      expect(result.size).toBe('minimal');
      expect(result.modelConstraint).toBe('haiku');
    });

    it('returns reduced when best provider is moderately used', () => {
      const config = makeConfig({ max_workers: 4, usage_thresholds: { '5hr': 0.7, weekly: 0.9 } });
      const usage = makeUsageMap([['claude', 95], ['codex', 75]]);

      const result = adjustSprintSizeMultiProvider(config, usage);
      // Best provider at 75%, 5hr threshold 70% exceeded but weekly 90% not — reduced
      expect(result.size).toBe('reduced');
    });
  });
});
