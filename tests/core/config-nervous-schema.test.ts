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

  // ─── Test 6: detectors has exactly 16 entries (5 active + 11 reserve) ────
  // Sprint 180 W0 — NERVOUS-TODO §11.2 Step F: 6 new detectors added.
  // dead_event_stream'in reserve_for'u kaldırıldı (Sprint 165 kod hazır).
  it('nervous_system.detectors has exactly 16 entries (5 active + 11 reserve)', () => {
    const config = createDefaultConfig();
    const detectors = config.nervous_system!.detectors;
    const detectorKeys = Object.keys(detectors);
    expect(detectorKeys.length).toBe(16);

    // 5 active detectors (unchanged from Sprint 147 baseline)
    const activeDetectors = detectorKeys.filter(
      k => detectors[k as keyof typeof detectors].enabled,
    );
    expect(activeDetectors.length).toBe(5);
    expect(activeDetectors).toContain('stale_worker');
    expect(activeDetectors).toContain('scope_collision');
    expect(activeDetectors).toContain('debt_trend');
    expect(activeDetectors).toContain('agent_routing');
    expect(activeDetectors).toContain('directives_protection');

    // 11 reserved detectors (enabled: false) — 5 original (incl. dead_event_stream
    // without reserve_for) + 6 new in Sprint 180 W0
    const reservedDetectors = detectorKeys.filter(
      k => !detectors[k as keyof typeof detectors].enabled,
    );
    expect(reservedDetectors.length).toBe(11);
    expect(reservedDetectors).toContain('dead_event_stream');
    expect(reservedDetectors).toContain('cost_threshold');
    expect(reservedDetectors).toContain('prompt_quality');
    expect(reservedDetectors).toContain('worker_output_variance');
    expect(reservedDetectors).toContain('self_modifying_warner');
    // Sprint 180 W0 new detectors
    expect(reservedDetectors).toContain('task_mode_idle');
    expect(reservedDetectors).toContain('build_failure_recurrence');
    expect(reservedDetectors).toContain('token_spike');
    expect(reservedDetectors).toContain('agent_routing_anomaly');
    expect(reservedDetectors).toContain('scope_collision_rate');
    expect(reservedDetectors).toContain('notification_delivery_health');

    // dead_event_stream — Sprint 165 kod hazır → reserve_for clear (Sprint 180 W0)
    expect(detectors.dead_event_stream.reserve_for).toBeUndefined();

    // 4 still-reserved Sprint-148 detectors keep reserve_for='sprint-148'
    const sprint148Reserved = ['cost_threshold', 'prompt_quality', 'worker_output_variance', 'self_modifying_warner'] as const;
    for (const key of sprint148Reserved) {
      expect(detectors[key].reserve_for).toBe('sprint-148');
    }

    // 6 Sprint 180 W0 new detectors carry no reserve_for (Faz 2/3 activation TBD)
    const sprint180New = ['task_mode_idle', 'build_failure_recurrence', 'token_spike', 'agent_routing_anomaly', 'scope_collision_rate', 'notification_delivery_health'] as const;
    for (const key of sprint180New) {
      expect(detectors[key].reserve_for).toBeUndefined();
    }
  });
});
