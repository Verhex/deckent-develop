import { describe, it, expect } from 'vitest';
import { validateConfig, mergeConfigs, createDefaultConfig } from '../../src/core/config.js';
import type { DeckentConfig, ResolvedConfig } from '../../src/core/types.js';

/**
 * Sprint 274 Task 274-001 — CacheWarmConfig contract.
 * Validates the opt-in cache_warm block: enabled flag, warm_delay_ms bounds,
 * defaults, and zero-behavior-change when the block is absent.
 */
describe('cache_warm config', () => {
  it('block absent → zero behavior change (no cache_warm on resolved)', () => {
    const resolved = mergeConfigs(null, null) as ResolvedConfig;
    expect(resolved.cache_warm).toBeUndefined();
  });

  it('valid block with enabled:true passes validation', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: true };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('valid block with all optional fields passes validation', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: true, warm_delay_ms: 45000 };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('warm_delay_ms below 5000 → validation error', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: true, warm_delay_ms: 4999 };
    expect(() => validateConfig(cfg)).toThrow(/cache_warm\.warm_delay_ms/);
  });

  it('warm_delay_ms above 180000 → validation error', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: true, warm_delay_ms: 180001 };
    expect(() => validateConfig(cfg)).toThrow(/cache_warm\.warm_delay_ms/);
  });

  it('warm_delay_ms at boundary min (5000) passes validation', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: true, warm_delay_ms: 5000 };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('warm_delay_ms at boundary max (180000) passes validation', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: true, warm_delay_ms: 180000 };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('enabled not boolean → validation error', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: 'yes' as unknown as boolean };
    expect(() => validateConfig(cfg)).toThrow(/cache_warm\.enabled/);
  });

  it('warm_delay_ms not a number → validation error', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: true, warm_delay_ms: '45000' as unknown as number };
    expect(() => validateConfig(cfg)).toThrow(/cache_warm\.warm_delay_ms/);
  });

  it('mergeConfigs passes cache_warm block through to ResolvedConfig', () => {
    const override: Partial<DeckentConfig> = {
      cache_warm: { enabled: true, warm_delay_ms: 60000 },
    };
    const resolved = mergeConfigs(null, override) as ResolvedConfig;
    expect(resolved.cache_warm).toBeDefined();
    expect(resolved.cache_warm!.enabled).toBe(true);
    expect(resolved.cache_warm!.warm_delay_ms).toBe(60000);
  });

  it('cache_warm enabled:false passes validation', () => {
    const cfg = createDefaultConfig();
    cfg.cache_warm = { enabled: false };
    expect(() => validateConfig(cfg)).not.toThrow();
  });
});
