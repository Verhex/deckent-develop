import { describe, it, expect } from 'vitest';
import { validateConfig, mergeConfigs, createDefaultConfig } from '../../src/core/config.js';
import type { DeckentConfig, ResolvedConfig } from '../../src/core/types.js';

/**
 * Sprint 271 Task 271-002 — ResourceMonitorConfig contract.
 * Validates the opt-in resource_monitor block: enabled flag, interval_ms min,
 * log_path, and zero-behavior-change when the block is absent.
 */
describe('resource_monitor config', () => {
  it('block absent → zero behavior change (no resource_monitor on resolved)', () => {
    const resolved = mergeConfigs(null, null) as ResolvedConfig;
    expect(resolved.resource_monitor).toBeUndefined();
  });

  it('valid block with enabled:true passes validation', () => {
    const cfg = createDefaultConfig();
    cfg.resource_monitor = { enabled: true };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('valid block with all optional fields passes validation', () => {
    const cfg = createDefaultConfig();
    cfg.resource_monitor = {
      enabled: true,
      interval_ms: 3000,
      log_path: '.deckent/resource-log.jsonl',
    };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('interval_ms below 1000 → validation error', () => {
    const cfg = createDefaultConfig();
    cfg.resource_monitor = { enabled: true, interval_ms: 500 };
    expect(() => validateConfig(cfg)).toThrow(/resource_monitor\.interval_ms/);
  });

  it('enabled not boolean → validation error', () => {
    const cfg = createDefaultConfig();
    // Type cast to simulate invalid runtime input
    cfg.resource_monitor = { enabled: 'yes' as unknown as boolean };
    expect(() => validateConfig(cfg)).toThrow(/resource_monitor\.enabled/);
  });

  it('interval_ms not a number → validation error', () => {
    const cfg = createDefaultConfig();
    cfg.resource_monitor = { enabled: false, interval_ms: '5000' as unknown as number };
    expect(() => validateConfig(cfg)).toThrow(/resource_monitor\.interval_ms/);
  });

  it('mergeConfigs passes resource_monitor block through to ResolvedConfig', () => {
    const override: Partial<DeckentConfig> = {
      resource_monitor: { enabled: true, interval_ms: 2000, log_path: '.deckent/rm.jsonl' },
    };
    const resolved = mergeConfigs(null, override) as ResolvedConfig;
    expect(resolved.resource_monitor).toBeDefined();
    expect(resolved.resource_monitor!.enabled).toBe(true);
    expect(resolved.resource_monitor!.interval_ms).toBe(2000);
    expect(resolved.resource_monitor!.log_path).toBe('.deckent/rm.jsonl');
  });

  it('resource_monitor enabled:false passes validation', () => {
    const cfg = createDefaultConfig();
    cfg.resource_monitor = { enabled: false };
    expect(() => validateConfig(cfg)).not.toThrow();
  });
});
