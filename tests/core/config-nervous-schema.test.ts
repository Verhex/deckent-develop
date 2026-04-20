// tests/core/config-nervous-schema.test.ts
// Sprint 147 Task 17 — nervous_system config schema extension tests
// Validates 3-layer merge, defaults, validation, and detector count

import { describe, it, expect } from 'vitest';
import {
  createDefaultConfig,
  validateConfig,
  ConfigValidationError,
  deepMerge,
} from '../../src/core/config.js';
import type { DeckentConfig } from '../../src/core/types.js';

describe('nervous_system config schema', () => {
  // ─── Test 1: Default config has enabled=false ────────────────────────────
  it('default config has nervous_system.enabled=false', () => {
    const config = createDefaultConfig();
    expect(config.nervous_system).toBeDefined();
    expect(config.nervous_system!.enabled).toBe(false);
  });

  // ─── Test 2: 3-layer merge — project config mode override applied ─────────
  it('project config mode override is applied via 3-layer merge', () => {
    const defaultConfig = createDefaultConfig();
    const projectConfig: Partial<DeckentConfig> = {
      nervous_system: {
        ...defaultConfig.nervous_system!,
        mode: 'autopilot',
      },
    };
    const merged = deepMerge(defaultConfig, projectConfig);
    expect(merged.nervous_system!.mode).toBe('autopilot');
    // other defaults preserved
    expect(merged.nervous_system!.enabled).toBe(false);
    expect(merged.nervous_system!.history_retention_days).toBe(30);
  });

  // ─── Test 3: Global overrides defaults, project overrides global ──────────
  it('global config overrides defaults, project overrides global', () => {
    const defaults = createDefaultConfig();

    // Simulate global config override
    const globalConfig: Partial<DeckentConfig> = {
      nervous_system: {
        ...defaults.nervous_system!,
        mode: 'strict',
        history_retention_days: 60,
      },
    };
    const afterGlobal = deepMerge(defaults, globalConfig);
    expect(afterGlobal.nervous_system!.mode).toBe('strict');
    expect(afterGlobal.nervous_system!.history_retention_days).toBe(60);

    // Simulate project config further override
    const projectConfig: Partial<DeckentConfig> = {
      nervous_system: {
        ...afterGlobal.nervous_system!,
        mode: 'balanced',
      },
    };
    const afterProject = deepMerge(afterGlobal, projectConfig);
    expect(afterProject.nervous_system!.mode).toBe('balanced');
    // global's history_retention_days should still be present
    expect(afterProject.nervous_system!.history_retention_days).toBe(60);
  });

  // ─── Test 4: Invalid mode → validation error ──────────────────────────────
  it('throws ConfigValidationError for invalid nervous_system.mode', () => {
    const config = createDefaultConfig();
    // Force invalid mode — use type cast to simulate bad config
    config.nervous_system = {
      ...config.nervous_system!,
      mode: 'turbo-auto' as 'strict',
    };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors.some(msg => msg.includes('nervous_system.mode'))).toBe(true);
      expect(err.errors.some(msg => msg.includes('turbo-auto'))).toBe(true);
    }
  });

  // ─── Test 5: Invalid threshold_ms (negative) → validation error ──────────
  it('throws ConfigValidationError for negative stale_worker.threshold_ms', () => {
    const config = createDefaultConfig();
    config.nervous_system = {
      ...config.nervous_system!,
      detectors: {
        ...config.nervous_system!.detectors,
        stale_worker: { enabled: true, threshold_ms: -1 },
      },
    };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors.some(msg => msg.includes('threshold_ms'))).toBe(true);
    }
  });

  // ─── Test 6: detectors has exactly 10 entries ─────────────────────────────
  it('nervous_system.detectors has exactly 10 entries (5 active + 5 reserve)', () => {
    const config = createDefaultConfig();
    const detectors = config.nervous_system!.detectors;
    const detectorKeys = Object.keys(detectors);
    expect(detectorKeys.length).toBe(10);

    // 5 active detectors
    const activeDetectors = detectorKeys.filter(
      k => detectors[k as keyof typeof detectors].enabled,
    );
    expect(activeDetectors.length).toBe(5);
    expect(activeDetectors).toContain('stale_worker');
    expect(activeDetectors).toContain('scope_collision');
    expect(activeDetectors).toContain('debt_trend');
    expect(activeDetectors).toContain('agent_routing');
    expect(activeDetectors).toContain('directives_protection');

    // 5 reserved detectors (enabled: false)
    const reservedDetectors = detectorKeys.filter(
      k => !detectors[k as keyof typeof detectors].enabled,
    );
    expect(reservedDetectors.length).toBe(5);
    expect(reservedDetectors).toContain('dead_event_stream');
    expect(reservedDetectors).toContain('cost_threshold');
    expect(reservedDetectors).toContain('prompt_quality');
    expect(reservedDetectors).toContain('worker_output_variance');
    expect(reservedDetectors).toContain('self_modifying_warner');

    // All reserved detectors have reserve_for='sprint-148'
    for (const key of reservedDetectors) {
      expect(detectors[key as keyof typeof detectors].reserve_for).toBe('sprint-148');
    }
  });
});
