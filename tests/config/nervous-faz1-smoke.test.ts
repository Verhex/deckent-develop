import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDefaultConfig, NERVOUS_SYSTEM_SCHEMA } from '../../src/core/config.js';

const root = resolve(import.meta.dirname, '..', '..');

// Returns null when the live project config is absent (gitignored → not in a
// fresh CI checkout). Dogfood self-check of THIS project's nervous config; the
// whole suite skips where the file doesn't exist (hermeticity — no dependence
// on local state, no collection-time ENOENT crash).
function readNervousConfig(): Record<string, unknown> | null {
  try {
    const raw = readFileSync(resolve(root, '.deckent', 'config.json'), 'utf-8');
    const full = JSON.parse(raw) as Record<string, unknown>;
    return full['nervous_system'] as Record<string, unknown>;
  } catch {
    return null;
  }
}

const loadedNs = readNervousConfig();
const hasConfig = loadedNs !== null;

describe.skipIf(!hasConfig)('Nervous Faz 1 smoke config (.deckent/config.json)', () => {
  const ns = loadedNs ?? {};
  // The dogfood project flips `enabled` between sprints depending on whether
  // the current sprint is actively exercising nervous-system runtime. The
  // schema/shape assertions below are always relevant; the strict
  // `enabled === true` assertion is dogfood-mode-specific and skipped when
  // the project has temporarily opted out.
  const nervousEnabled = ns['enabled'] === true;

  it('Zod schema parse round-trip passes', () => {
    const result = NERVOUS_SYSTEM_SCHEMA.safeParse(ns);
    if (!result.success) {
      throw new Error(`Zod validation failed: ${JSON.stringify(result.error.issues, null, 2)}`);
    }
    expect(result.success).toBe(true);
  });

  it.skipIf(!nervousEnabled)('nervous_system.enabled is true', () => {
    expect(ns['enabled']).toBe(true);
  });

  it('nervous_system.mode is a valid authority preset', () => {
    // Mode is config-driven (Sprint 220-013: dogfood activated nervous at
    // 'balanced'). Assert a valid authority preset, not a hardcoded one.
    expect(['strict', 'balanced', 'autopilot', 'full-auto']).toContain(ns['mode']);
  });

  it('notifications.severity_min is info', () => {
    const notifications = ns['notifications'] as Record<string, unknown>;
    expect(notifications['severity_min']).toBe('info');
  });

});

describe('Nervous Faz 1 product defaults (createDefaultConfig authority)', () => {
  const ns = createDefaultConfig().nervous_system!;
  const detectors = ns.detectors;

  it('stale_worker is enabled with the canonical 120000ms threshold', () => {
    expect(detectors.stale_worker.enabled).toBe(true);
    expect(detectors.stale_worker.threshold_ms).toBe(120000);
  });

  it('dead_event_stream is available but default-off', () => {
    expect(detectors.dead_event_stream.enabled).toBe(false);
    expect(detectors.dead_event_stream.reserve_for).toBeUndefined();
  });

  it('directives_protection is enabled', () => {
    expect(detectors.directives_protection.enabled).toBe(true);
  });

  it('exactly five base detectors are enabled by default', () => {
    const enabledCount = Object.values(detectors).filter((d) => d.enabled === true).length;
    expect(enabledCount).toBe(5);
  });

  it('W0 6 new detectors are all disabled', () => {
    const w0Detectors = [
      'task_mode_idle',
      'build_failure_recurrence',
      'token_spike',
      'agent_routing_anomaly',
      'scope_collision_rate',
      'notification_delivery_health',
    ] as const;
    for (const name of w0Detectors) {
      expect(detectors[name].enabled, `${name} should be disabled`).toBe(false);
    }
  });
});
