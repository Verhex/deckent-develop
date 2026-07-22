// ─── TIMEOUT-TIER Tests (born-667a, Task 427-023) ───────────────────
// Regression coverage for the model-tier-aware timeout multiplier.
// TT550/TT556: effort_base is model-blind — an opus worker on a
// high-effort forensic task shared the exact same timeout budget as a
// sonnet worker on the same effort and was killed mid-work. This file
// locks (a) bit-exact backward compatibility when no multiplier is
// configured, and (b) the opus timeout growing/shrinking correctly once
// a `timeout.model_multiplier` table is configured.

import { describe, it, expect } from 'vitest';
import {
  brainEstimateTimeout,
  resolveModelMultiplier,
} from '../../src/orchestra/timeout-estimator.js';
import type { SprintHistory } from '../../src/orchestra/timeout-estimator.js';
import type { Task } from '../../src/core/task-types.js';
import type { ResolvedConfig, TimeoutConfig } from '../../src/core/config-types.js';
import {
  DEFAULT_TIMEOUT_CONFIG,
  createDefaultConfig,
  validateConfig,
  ConfigValidationError,
} from '../../src/core/config.js';

// ─── Helpers (mirrors tests/orchestra/timeout-estimator.test.ts) ────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test Task',
    description: '',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'pass',
      noGoCriteria: 'fail',
      techDebtAcceptable: 'partial',
    },
    status: 'PENDING',
    ...overrides,
  } as Task;
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
    },
    modes: {},
    language: 'typescript',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.4.0',
    coverage_threshold: 90,
    max_reroutes: 3,
    reroute_on_tech_debt: false,
    sprint_timeout_minutes: 0,
    adaptive_thresholds: false,
    agent_min_score: 5,
    adaptive_config: { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    timeout: structuredClone(DEFAULT_TIMEOUT_CONFIG),
    spawn_backend: 'docker',
    ...overrides,
  } as ResolvedConfig;
}

function emptyHistory(): SprintHistory {
  return { avgTaskDurationMs: 0, sprintCount: 0 };
}

describe('TIMEOUT-TIER — model-tier multiplier (born-667a, Task 427-023)', () => {
  describe('backward compatibility — çarpansız config', () => {
    it('DEFAULT_TIMEOUT_CONFIG carries no model_multiplier (undefined by default)', () => {
      expect(DEFAULT_TIMEOUT_CONFIG.model_multiplier).toBeUndefined();
    });

    it('modelMultiplier is 1.0 for opus/sonnet/haiku tasks when config carries no model_multiplier', () => {
      const config = makeConfig();
      for (const model of ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']) {
        const task = makeTask({ model, effort: 'high' });
        const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());
        expect(breakdown.modelMultiplier).toBe(1.0);
      }
    });

    it("today's dogfood value is unchanged: high-effort opus task on docker = 2400s", () => {
      const task = makeTask({ model: 'claude-opus-4-8', effort: 'high' });
      const config = makeConfig();
      const { timeoutSeconds, breakdown } = brainEstimateTimeout(task, config, emptyHistory());

      expect(breakdown.estimated).toBe(2400);
      expect(timeoutSeconds).toBe(2400);
      expect(breakdown.clampReason).toBe('within_bounds');
    });
  });

  describe('resolveModelMultiplier (pure helper)', () => {
    it('returns 1.0 when table is undefined', () => {
      expect(resolveModelMultiplier('claude-opus-4-8', undefined)).toBe(1.0);
    });

    it('returns 1.0 for an unrecognized/custom model string and never throws', () => {
      expect(() =>
        resolveModelMultiplier('totally-unknown-model-xyz', { premium: 2.0 }),
      ).not.toThrow();
      expect(resolveModelMultiplier('totally-unknown-model-xyz', { premium: 2.0 })).toBe(1.0);
    });

    it('resolves opus → premium, sonnet → standard, haiku → economy', () => {
      const table = { premium: 2.0, standard: 1.0, economy: 0.5 };
      expect(resolveModelMultiplier('claude-opus-4-8', table)).toBe(2.0);
      expect(resolveModelMultiplier('claude-sonnet-5', table)).toBe(1.0);
      expect(resolveModelMultiplier('claude-haiku-4-5-20251001', table)).toBe(0.5);
    });

    it('falls back to 1.0 for a tier missing from a partial table', () => {
      expect(resolveModelMultiplier('claude-opus-4-8', { economy: 0.5 })).toBe(1.0);
    });

    it('ignores a non-positive or non-finite entry and falls back to 1.0', () => {
      expect(resolveModelMultiplier('claude-opus-4-8', { premium: 0 })).toBe(1.0);
      expect(resolveModelMultiplier('claude-opus-4-8', { premium: -1 })).toBe(1.0);
      expect(resolveModelMultiplier('claude-opus-4-8', { premium: NaN })).toBe(1.0);
    });
  });

  describe('brainEstimateTimeout — opus timeout grows with configured multiplier', () => {
    it('TT550/TT556 regression: opus high-effort task duration doubles with model_multiplier.premium=2.0', () => {
      const timeoutCfg: TimeoutConfig = {
        ...DEFAULT_TIMEOUT_CONFIG,
        model_multiplier: { premium: 2.0, standard: 1.0, economy: 0.5 },
      };
      const baseline = makeConfig();
      const withMultiplier = makeConfig({ timeout: timeoutCfg });
      const task = makeTask({ model: 'claude-opus-4-8', effort: 'high' });

      const { timeoutSeconds: baseSeconds, breakdown: baseBreak } = brainEstimateTimeout(
        task,
        baseline,
        emptyHistory(),
      );
      const { timeoutSeconds: scaledSeconds, breakdown: scaledBreak } = brainEstimateTimeout(
        task,
        withMultiplier,
        emptyHistory(),
      );

      expect(baseBreak.modelMultiplier).toBe(1.0);
      expect(scaledBreak.modelMultiplier).toBe(2.0);
      expect(scaledBreak.estimated).toBe(baseBreak.estimated * 2);
      // 2400 → 4800, both comfortably within docker bounds [1200, 7200] — no clamp interference.
      expect(scaledSeconds).toBe(baseSeconds * 2);
      expect(scaledBreak.clampReason).toBe('within_bounds');
    });

    it('sonnet (standard tier) timeout is unchanged when only premium/economy are configured', () => {
      const timeoutCfg: TimeoutConfig = {
        ...DEFAULT_TIMEOUT_CONFIG,
        model_multiplier: { premium: 2.0, economy: 0.5 },
      };
      const config = makeConfig({ timeout: timeoutCfg });
      const task = makeTask({ model: 'claude-sonnet-5', effort: 'normal' });
      const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

      expect(breakdown.modelMultiplier).toBe(1.0);
      expect(breakdown.estimated).toBe(1200); // normal effort base, unchanged
    });

    it('haiku (economy tier) timeout shrinks under a configured sub-1.0 multiplier', () => {
      const timeoutCfg: TimeoutConfig = {
        ...DEFAULT_TIMEOUT_CONFIG,
        model_multiplier: { economy: 0.5 },
      };
      const config = makeConfig({ timeout: timeoutCfg });
      const task = makeTask({ model: 'claude-haiku-4-5-20251001', effort: 'normal' });
      const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

      expect(breakdown.modelMultiplier).toBe(0.5);
      expect(breakdown.estimated).toBe(600); // 1200 * 0.5
    });
  });

  describe('config validation (born-667a)', () => {
    it('accepts a well-formed model_multiplier table', () => {
      const config = createDefaultConfig();
      config.timeout = { model_multiplier: { premium: 2.0, standard: 1.0, economy: 0.5 } };
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('rejects an unknown tier key', () => {
      const config = createDefaultConfig();
      config.timeout = { model_multiplier: { opus: 2.0 } as Partial<Record<string, number>> as never };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
      try {
        validateConfig(config);
      } catch (e) {
        expect((e as ConfigValidationError).message).toContain("Invalid tier 'opus'");
      }
    });

    it('rejects a non-positive multiplier value', () => {
      const config = createDefaultConfig();
      config.timeout = { model_multiplier: { premium: 0 } };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
      try {
        validateConfig(config);
      } catch (e) {
        expect((e as ConfigValidationError).message).toContain(
          "timeout.model_multiplier.premium",
        );
      }
    });

    it('rejects a non-numeric multiplier value', () => {
      const config = createDefaultConfig();
      config.timeout = {
        model_multiplier: { premium: 'fast' as unknown as number },
      };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });
  });
});
