// tests/core/nervous-config-schema.test.ts
// Sprint 180 Task W0-1 — Nervous config schema sync (Step F)
// NERVOUS-TODO §11.2 Step F — 6 yeni detector + dead_event_stream reserve_for clear + Zod parse round-trip

import { describe, it, expect } from 'vitest';
import {
  createDefaultConfig,
  NERVOUS_DETECTOR_SCHEMA,
  NERVOUS_SYSTEM_SCHEMA,
} from '../../src/core/config.js';

describe('Sprint 180 W0 — Nervous config schema sync (Step F)', () => {
  // ─── Test 1: 6 yeni detector default mevcudiyeti ─────────────────────────
  it('DEFAULT_CONFIG.nervous_system.detectors 6 yeni alan içerir (enabled: false)', () => {
    const config = createDefaultConfig();
    const detectors = config.nervous_system!.detectors;

    const newDetectorKeys = [
      'task_mode_idle',
      'build_failure_recurrence',
      'token_spike',
      'agent_routing_anomaly',
      'scope_collision_rate',
      'notification_delivery_health',
    ] as const;

    for (const key of newDetectorKeys) {
      expect(detectors).toHaveProperty(key);
      const detector = detectors[key as keyof typeof detectors];
      expect(detector).toBeDefined();
      expect(detector.enabled).toBe(false);
    }
  });

  // ─── Test 2: dead_event_stream.reserve_for clear ────────────────────────
  it('dead_event_stream artık reserve_for taşımıyor (Sprint 165: kod hazır)', () => {
    const config = createDefaultConfig();
    const des = config.nervous_system!.detectors.dead_event_stream;
    expect(des).toBeDefined();
    expect(des.enabled).toBe(false);
    expect(des.reserve_for).toBeUndefined();
  });

  // ─── Test 3: Zod parse round-trip ───────────────────────────────────────
  it('NERVOUS_SYSTEM_SCHEMA default configi kabul eder ve invalid input reddeder', () => {
    const config = createDefaultConfig();
    const ns = config.nervous_system!;

    // Default config Zod parse'tan geçer
    const parsed = NERVOUS_SYSTEM_SCHEMA.parse(ns);
    expect(parsed).toEqual(ns);

    // Round-trip kararlı: parse(JSON.parse(JSON.stringify(ns))) === ns
    const roundTrip = NERVOUS_SYSTEM_SCHEMA.parse(JSON.parse(JSON.stringify(ns)));
    expect(roundTrip).toEqual(ns);

    // Invalid mode reddedilir
    const invalidMode = { ...ns, mode: 'turbo-auto' as 'strict' };
    expect(() => NERVOUS_SYSTEM_SCHEMA.parse(invalidMode)).toThrow();

    // Negative threshold reddedilir
    const invalidThreshold = {
      ...ns,
      detectors: {
        ...ns.detectors,
        stale_worker: { enabled: true, threshold_ms: -1 },
      },
    };
    expect(() => NERVOUS_SYSTEM_SCHEMA.parse(invalidThreshold)).toThrow();

    // NERVOUS_DETECTOR_SCHEMA standalone çalışır
    expect(() =>
      NERVOUS_DETECTOR_SCHEMA.parse({ enabled: false }),
    ).not.toThrow();
    expect(() =>
      NERVOUS_DETECTOR_SCHEMA.parse({ enabled: 'yes' }),
    ).toThrow();
  });
});
