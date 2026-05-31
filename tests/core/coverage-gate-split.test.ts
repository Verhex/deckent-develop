// Sprint 179 W2-4 — Coverage hard-floor / aspirational split
// Sub-project #2 plan Task 4: split single `coverage_threshold` into:
//   - coverage_hard_floor: immutable EVALUATE gate floor (default 50)
//   - coverage_aspirational: auto-learn target (default 90)
//   legacy `coverage_threshold` value is honored as the initial aspirational
//   so user-tuned thresholds keep working without migration.

import { describe, it, expect } from 'vitest';

import { createDefaultConfig, mergeConfigs } from '../../src/core/config.js';
import { computeAdjustedAspirational } from '../../src/orchestra/sprint-finalizer.js';

describe('Coverage gate hard-floor / aspirational split (W2-4)', () => {
  it('(a) defaults: coverage_hard_floor=50 + coverage_aspirational=90', () => {
    const cfg = createDefaultConfig();
    expect(cfg.coverage_hard_floor).toBe(50);
    expect(cfg.coverage_aspirational).toBe(90);

    const resolved = mergeConfigs(null, null);
    expect(resolved.coverage_hard_floor).toBe(50);
    expect(resolved.coverage_aspirational).toBe(90);
  });

  it('(b) adjustment mutates aspirational only — hard_floor untouched', () => {
    // avg coverage 65 (< 70) → aspirational lowered to 65; floor stays 50
    const result = computeAdjustedAspirational({
      currentAspirational: 90,
      hardFloor: 50,
      avgCoverage: 65,
    });
    expect(result.newAspirational).toBe(65);
    expect(result.changed).toBe(true);
    // Floor is never returned/changed by this helper — caller keeps it constant.
  });

  it('(c) immutable floor: aspirational clamped at hard_floor, never below', () => {
    // avg coverage 30 → would lower below floor; must clamp at floor (50)
    const result = computeAdjustedAspirational({
      currentAspirational: 90,
      hardFloor: 50,
      avgCoverage: 30,
    });
    expect(result.newAspirational).toBe(50);
    expect(result.changed).toBe(true);
  });

  it('(d) legacy coverage_threshold maps to coverage_aspirational', () => {
    // User config sets the deprecated `coverage_threshold` only.
    // mergeConfigs honors it as the aspirational target; hard_floor stays default.
    const resolved = mergeConfigs(null, { coverage_threshold: 75 });
    expect(resolved.coverage_aspirational).toBe(75);
    expect(resolved.coverage_hard_floor).toBe(50);

    // Explicit aspirational overrides legacy mapping when both supplied.
    const both = mergeConfigs(null, {
      coverage_threshold: 75,
      coverage_aspirational: 80,
    });
    expect(both.coverage_aspirational).toBe(80);
    expect(both.coverage_hard_floor).toBe(50);
  });
});
