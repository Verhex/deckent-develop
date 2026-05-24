/**
 * Sprint 192 Task 192-011 — W-INTEGRITY I-5
 *
 * Sprint-level adaptive timeout helpers + config schema knobs.
 *
 * Surface under test:
 *   • src/core/config.ts  — DEFAULT_TIMEOUT_CONFIG.adaptive_multiplier (1.5)
 *                            DEFAULT_TIMEOUT_CONFIG.runtime_extension_max (5)
 *                            validateConfig() schema rejection paths
 *   • src/orchestra/sprint-controller.ts
 *                          — getAdaptiveMultiplier(config?)
 *                            getRuntimeExtensionMax(config?)
 *                            applyAdaptiveTimeout(baseSeconds, config?)
 *
 * Wire intent: these helpers are the single read-point that downstream
 * timeout-estimator / sprint-phases consumers will call to honour the user
 * rule "zaman sınırlarını daha geniş tutalım" without each call-site needing
 * to re-implement defaulting. Tests pin the contract so a future refactor
 * cannot silently regress the loosening multiplier or the heartbeat-aware
 * extension cap.
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_ADAPTIVE_MULTIPLIER,
  DEFAULT_RUNTIME_EXTENSION_MAX,
  createDefaultConfig,
  validateConfig,
  ConfigValidationError,
} from '../../src/core/config.js';
import {
  getAdaptiveMultiplier,
  getRuntimeExtensionMax,
  applyAdaptiveTimeout,
} from '../../src/orchestra/sprint-controller.js';
import type { ResolvedConfig } from '../../src/core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig['timeout']> = {}): ResolvedConfig {
  return {
    timeout: {
      ...structuredClone(DEFAULT_TIMEOUT_CONFIG),
      ...overrides,
    },
  } as unknown as ResolvedConfig;
}

// ─── Default constants ───────────────────────────────────────────────

describe('DEFAULT_TIMEOUT_CONFIG — adaptive knobs (Sprint 192 192-011)', () => {
  it('exports adaptive_multiplier === 1.5', () => {
    expect(DEFAULT_ADAPTIVE_MULTIPLIER).toBe(1.5);
    expect(DEFAULT_TIMEOUT_CONFIG.adaptive_multiplier).toBe(1.5);
  });

  it('exports runtime_extension_max === 5 (raised from legacy hard-coded 3)', () => {
    expect(DEFAULT_RUNTIME_EXTENSION_MAX).toBe(5);
    expect(DEFAULT_TIMEOUT_CONFIG.runtime_extension_max).toBe(5);
  });

  it('createDefaultConfig() surfaces both knobs via timeout', () => {
    const cfg = createDefaultConfig();
    // Cast: AdaptiveTimeoutFields are bolted on at runtime, not in the
    // static TimeoutConfig interface.
    const t = cfg.timeout as unknown as Record<string, unknown>;
    expect(t.adaptive_multiplier).toBe(1.5);
    expect(t.runtime_extension_max).toBe(5);
  });
});

// ─── getAdaptiveMultiplier ───────────────────────────────────────────

describe('getAdaptiveMultiplier', () => {
  it('returns the configured multiplier when set to a valid value', () => {
    const cfg = makeConfig({ adaptive_multiplier: 2.0 } as never);
    expect(getAdaptiveMultiplier(cfg)).toBe(2.0);
  });

  it('falls back to DEFAULT_ADAPTIVE_MULTIPLIER when config is undefined', () => {
    expect(getAdaptiveMultiplier(undefined)).toBe(DEFAULT_ADAPTIVE_MULTIPLIER);
  });

  it('falls back when value is invalid (< 1.0)', () => {
    const cfg = makeConfig({ adaptive_multiplier: 0.5 } as never);
    expect(getAdaptiveMultiplier(cfg)).toBe(DEFAULT_ADAPTIVE_MULTIPLIER);
  });

  it('falls back when value is not finite (NaN / Infinity)', () => {
    const nanCfg = makeConfig({ adaptive_multiplier: Number.NaN } as never);
    expect(getAdaptiveMultiplier(nanCfg)).toBe(DEFAULT_ADAPTIVE_MULTIPLIER);
    const infCfg = makeConfig({ adaptive_multiplier: Number.POSITIVE_INFINITY } as never);
    expect(getAdaptiveMultiplier(infCfg)).toBe(DEFAULT_ADAPTIVE_MULTIPLIER);
  });

  it('accepts the lower bound 1.0 exactly', () => {
    const cfg = makeConfig({ adaptive_multiplier: 1.0 } as never);
    expect(getAdaptiveMultiplier(cfg)).toBe(1.0);
  });
});

// ─── getRuntimeExtensionMax ──────────────────────────────────────────

describe('getRuntimeExtensionMax', () => {
  it('returns the configured cap when set to a valid integer', () => {
    const cfg = makeConfig({ runtime_extension_max: 8 } as never);
    expect(getRuntimeExtensionMax(cfg)).toBe(8);
  });

  it('falls back to DEFAULT_RUNTIME_EXTENSION_MAX when config is undefined', () => {
    expect(getRuntimeExtensionMax(undefined)).toBe(DEFAULT_RUNTIME_EXTENSION_MAX);
  });

  it('falls back when value is non-integer', () => {
    const cfg = makeConfig({ runtime_extension_max: 2.5 } as never);
    expect(getRuntimeExtensionMax(cfg)).toBe(DEFAULT_RUNTIME_EXTENSION_MAX);
  });

  it('falls back when value is < 1', () => {
    const cfg = makeConfig({ runtime_extension_max: 0 } as never);
    expect(getRuntimeExtensionMax(cfg)).toBe(DEFAULT_RUNTIME_EXTENSION_MAX);
  });

  it('accepts the lower bound 1 exactly', () => {
    const cfg = makeConfig({ runtime_extension_max: 1 } as never);
    expect(getRuntimeExtensionMax(cfg)).toBe(1);
  });
});

// ─── applyAdaptiveTimeout ────────────────────────────────────────────

describe('applyAdaptiveTimeout', () => {
  it('multiplies a positive base by the configured multiplier and rounds', () => {
    const cfg = makeConfig({ adaptive_multiplier: 2.0 } as never);
    expect(applyAdaptiveTimeout(1200, cfg)).toBe(2400);
  });

  it('multiplies by the default 1.5 when config is undefined', () => {
    // 1200 × 1.5 = 1800
    expect(applyAdaptiveTimeout(1200, undefined)).toBe(1800);
  });

  it('returns 0 unchanged (sentinel "disabled")', () => {
    expect(applyAdaptiveTimeout(0, undefined)).toBe(0);
  });

  it('returns a negative base unchanged (sentinel passthrough)', () => {
    expect(applyAdaptiveTimeout(-1, undefined)).toBe(-1);
  });

  it('rounds the product (not truncate)', () => {
    // 100 × 1.5 = 150 → exact
    expect(applyAdaptiveTimeout(100, undefined)).toBe(150);
    // 101 × 1.5 = 151.5 → 152 (round-half-to-even on .5 is 152 here)
    expect(applyAdaptiveTimeout(101, undefined)).toBe(152);
  });
});

// ─── validateConfig schema gates ─────────────────────────────────────

describe('validateConfig — adaptive timeout schema', () => {
  it('accepts the default adaptive knobs without error', () => {
    const cfg = createDefaultConfig();
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('rejects adaptive_multiplier < 1.0', () => {
    const cfg = createDefaultConfig();
    cfg.timeout = { adaptive_multiplier: 0.5 } as never;
    expect(() => validateConfig(cfg)).toThrow(ConfigValidationError);
    try {
      validateConfig(cfg);
    } catch (e) {
      expect((e as ConfigValidationError).message).toContain(
        "Invalid value '0.5' for field 'timeout.adaptive_multiplier'",
      );
    }
  });

  it('rejects non-finite adaptive_multiplier', () => {
    const cfg = createDefaultConfig();
    cfg.timeout = { adaptive_multiplier: Number.POSITIVE_INFINITY } as never;
    expect(() => validateConfig(cfg)).toThrow(ConfigValidationError);
  });

  it('rejects runtime_extension_max < 1', () => {
    const cfg = createDefaultConfig();
    cfg.timeout = { runtime_extension_max: 0 } as never;
    expect(() => validateConfig(cfg)).toThrow(ConfigValidationError);
    try {
      validateConfig(cfg);
    } catch (e) {
      expect((e as ConfigValidationError).message).toContain(
        "Invalid value '0' for field 'timeout.runtime_extension_max'",
      );
    }
  });

  it('rejects non-integer runtime_extension_max', () => {
    const cfg = createDefaultConfig();
    cfg.timeout = { runtime_extension_max: 2.5 } as never;
    expect(() => validateConfig(cfg)).toThrow(ConfigValidationError);
  });
});
