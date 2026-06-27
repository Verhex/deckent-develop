// ─── Sprint 333 Task 333-003 — KPI Faz-2 threshold-breach advisory ────────────
// Unit tests for `buildKpiBreachAdvisory` (src/core/kpi/breach-advisor.ts).
//
// PURE formatter → no DB / no I/O. Tests seed `KpiView[]` directly (real
// BUILTIN definitions + hand-built ResultRow) so they exercise the exact view
// shape the retro hook consumes, while asserting the advisor consumes `status`
// verbatim (never re-computes it) and stays i18n-clean (en + tr).

import { describe, it, expect } from 'vitest';

import { loadKpiDefinitions } from '../../../src/core/kpi/kpi-definitions.js';
import type { KpiDefinitionSpec } from '../../../src/core/kpi/kpi-definitions.js';
import type { KpiView } from '../../../src/core/kpi/kpi-service.js';
import type { KpiStatus } from '../../../src/core/kpi/types.js';
import { buildKpiBreachAdvisory } from '../../../src/core/kpi/breach-advisor.js';

const TENANT = 'default';
const SPRINT = 'sprint-333';

const DEFS = loadKpiDefinitions();
const def = (id: string): KpiDefinitionSpec => {
  const d = DEFS.find(x => x.id === id);
  if (!d) throw new Error(`test setup: unknown KPI id ${id}`);
  return d;
};

// cost_per_sprint: currency, direction down, has threshold.
const COST = def('cost_per_sprint');
// completion_rate: percent, direction up (used as the always-healthy KPI).
const COMPLETION = def('completion_rate');
// no_go_rate: percent, direction down, has threshold.
const NO_GO = def('no_go_rate');

/** Build a KpiView with a seeded result (or a null-result no-data view). */
function view(
  definition: KpiDefinitionSpec,
  seed: { value: number; target: number | null; status: KpiStatus } | null,
): KpiView {
  if (seed === null) return { definition, result: null };
  return {
    definition,
    result: {
      tenantId: TENANT,
      kpiId: definition.id,
      grain: 'sprint',
      periodKey: SPRINT,
      value: seed.value,
      target: seed.target,
      status: seed.status,
      computedAt: '2026-06-27T00:00:00.000Z',
    },
  };
}

// ─── goCriteria: one breached + one healthy → only the breach is named ─────────

describe('buildKpiBreachAdvisory — breach selection', () => {
  it('one critical + one healthy → names ONLY the breached KPI (value/target/status + en labels)', () => {
    const views = [
      view(COST, { value: 4.2, target: 3.5, status: 'critical' }),
      view(COMPLETION, { value: 1.0, target: null, status: 'healthy' }),
    ];
    const md = buildKpiBreachAdvisory(views, 'en');

    // Section heading present.
    expect(md).toContain('### KPI Breaches');

    // Breached KPI fully described: title, formatted value, formatted target, status.
    expect(md).toContain('Cost / Sprint'); // title.en
    expect(md).toContain('$4.20');         // value (currency)
    expect(md).toContain('$3.50');         // target (currency)
    expect(md).toContain('critical');      // status — consumed verbatim

    // English field labels.
    expect(md).toContain('Value:');
    expect(md).toContain('Target:');
    expect(md).toContain('Status:');

    // The HEALTHY KPI is NOT named, and "healthy" never appears.
    expect(md).not.toContain('Completion Rate');
    expect(md).not.toContain('healthy');

    // Exactly one breach bullet.
    const bullets = md.split('\n').filter(l => l.startsWith('- '));
    expect(bullets).toHaveLength(1);
  });

  it('warning status is surfaced too (not only critical); null target → —', () => {
    const md = buildKpiBreachAdvisory([view(NO_GO, { value: 0.2, target: null, status: 'warning' })], 'en');
    expect(md).toContain('No-Go Rate');
    expect(md).toContain('20.0%');  // 0.2 as percent
    expect(md).toContain('warning');
    expect(md).toContain('Target: —'); // null target renders em-dash
  });

  it('unknown status (no data / div-by-zero) is non-healthy → surfaced', () => {
    const md = buildKpiBreachAdvisory([view(COST, { value: 0, target: 3.5, status: 'unknown' })], 'en');
    expect(md).toContain('Cost / Sprint');
    expect(md).toContain('unknown');
  });

  it('multiple breaches → one bullet each, preserving deterministic definition order', () => {
    const views = [
      view(COST, { value: 4.2, target: 3.5, status: 'critical' }),
      view(COMPLETION, { value: 1.0, target: null, status: 'healthy' }), // skipped
      view(NO_GO, { value: 0.4, target: null, status: 'critical' }),
    ];
    const md = buildKpiBreachAdvisory(views, 'en');

    const bullets = md.split('\n').filter(l => l.startsWith('- '));
    expect(bullets).toHaveLength(2);
    // Input order preserved: cost before no_go.
    expect(md.indexOf('Cost / Sprint')).toBeLessThan(md.indexOf('No-Go Rate'));
  });
});

// ─── i18n (tr) ─────────────────────────────────────────────────────────────────

describe('buildKpiBreachAdvisory — i18n', () => {
  it('lang="tr" localizes field labels and the KPI title', () => {
    const md = buildKpiBreachAdvisory([view(COST, { value: 4.2, target: 3.5, status: 'critical' })], 'tr');
    expect(md).toContain('Sprint Başına Maliyet'); // title.tr
    expect(md).toContain('Değer:');
    expect(md).toContain('Hedef:');
    expect(md).toContain('Durum:');
    // No hardcoded English label leaked into the tr render.
    expect(md).not.toContain('Value:');
  });

  it('defaults to en when lang is omitted', () => {
    const md = buildKpiBreachAdvisory([view(COST, { value: 4.2, target: 3.5, status: 'critical' })]);
    expect(md).toContain('Value:');
  });
});

// ─── Empty / no-data → "" (honest no-op, no crash) ─────────────────────────────

describe('buildKpiBreachAdvisory — empty / no-op', () => {
  it('all-healthy views → "" (no section)', () => {
    const views = [
      view(COST, { value: 1.0, target: 3.5, status: 'healthy' }),
      view(COMPLETION, { value: 1.0, target: null, status: 'healthy' }),
    ];
    expect(buildKpiBreachAdvisory(views, 'en')).toBe('');
  });

  it('empty views array → ""', () => {
    expect(buildKpiBreachAdvisory([], 'en')).toBe('');
  });

  it('all null-result (no data) views → "" (no data is not a breach)', () => {
    const views = [view(COST, null), view(COMPLETION, null)];
    expect(buildKpiBreachAdvisory(views, 'en')).toBe('');
  });
});

// ─── Robustness (backs the non-blocking retro hook) ────────────────────────────

describe('buildKpiBreachAdvisory — robustness', () => {
  it('never throws on a non-finite value; renders — for it', () => {
    const views = [view(COST, { value: Number.NaN, target: 3.5, status: 'critical' })];
    expect(() => buildKpiBreachAdvisory(views, 'en')).not.toThrow();
    const md = buildKpiBreachAdvisory(views, 'en');
    expect(md).toContain('Value: —'); // NaN value → em-dash, still surfaced as a breach
    expect(md).toContain('critical');
  });
});
