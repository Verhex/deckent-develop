// ─── KPI Definitions Tests ────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  KPI_DEFINITION_SCHEMA,
  BUILTIN_KPIS,
  validateKpiDefinition,
  loadKpiDefinitions,
  type KpiDefinitionSpec,
} from '../../src/core/kpi/kpi-definitions.js';

// ─── Schema ───────────────────────────────────────────────────────────────────

describe('KPI_DEFINITION_SCHEMA', () => {
  it('parses a valid definition', () => {
    const raw = {
      id: 'custom_metric',
      title: { en: 'Custom Metric', tr: 'Özel Metrik' },
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      grain: 'sprint',
      tier: 'custom',
    };
    const result = KPI_DEFINITION_SCHEMA.parse(raw);
    expect(result.id).toBe('custom_metric');
    expect(result.scope).toBe('global');   // default
    expect(result.enabled).toBe(true);    // default
  });

  it('rejects a missing required field (formula)', () => {
    const raw = {
      id: 'x',
      title: { en: 'X', tr: 'X' },
      unit: 'count',
      format: 'number',
      direction: 'down',
      grain: 'sprint',
      tier: 'universal',
    };
    expect(() => KPI_DEFINITION_SCHEMA.parse(raw)).toThrow(ZodError);
  });

  it('rejects an invalid id (uppercase)', () => {
    const raw = {
      id: 'BadId',
      title: { en: 'Bad', tr: 'Kötü' },
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      grain: 'sprint',
      tier: 'universal',
    };
    expect(() => KPI_DEFINITION_SCHEMA.parse(raw)).toThrow(ZodError);
  });

  it('rejects extra unknown fields (strict mode)', () => {
    const raw = {
      id: 'ok_metric',
      title: { en: 'OK', tr: 'Tamam' },
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      grain: 'sprint',
      tier: 'universal',
      unknownField: 'should_fail',
    };
    expect(() => KPI_DEFINITION_SCHEMA.parse(raw)).toThrow(ZodError);
  });

  it('parses optional threshold correctly', () => {
    const raw = {
      id: 'with_threshold',
      title: { en: 'With Threshold', tr: 'Eşikli' },
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      threshold: { warn: 3.0, critical: 3.5 },
      grain: 'sprint',
      tier: 'universal',
    };
    const result = KPI_DEFINITION_SCHEMA.parse(raw);
    expect(result.threshold).toEqual({ warn: 3.0, critical: 3.5 });
  });
});

// ─── validateKpiDefinition ────────────────────────────────────────────────────

describe('validateKpiDefinition', () => {
  it('accepts a valid definition with catalog-only formula', () => {
    const def: KpiDefinitionSpec = {
      id: 'test_rate',
      title: { en: 'Test Rate', tr: 'Test Oranı' },
      formula: 'tasks_done / tasks_total',
      unit: 'ratio',
      format: 'percent',
      direction: 'up',
      grain: 'sprint',
      tier: 'custom',
      scope: 'global',
      enabled: true,
    };
    expect(() => validateKpiDefinition(def)).not.toThrow();
    const result = validateKpiDefinition(def);
    expect(result.id).toBe('test_rate');
  });

  it('rejects a definition with a catalog-external identifier in formula', () => {
    const def = {
      id: 'bad_formula',
      title: { en: 'Bad', tr: 'Kötü' },
      formula: 'fake_measure / sprint_count',
      unit: 'count',
      format: 'number',
      direction: 'down',
      grain: 'sprint',
      tier: 'custom',
    };
    expect(() => validateKpiDefinition(def)).toThrow(/fake_measure/);
  });

  it('rejects a definition with invalid schema (missing title.tr)', () => {
    const def = {
      id: 'bad_title',
      title: { en: 'Only English' },
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      grain: 'sprint',
      tier: 'universal',
    };
    expect(() => validateKpiDefinition(def)).toThrow(ZodError);
  });

  it('accepts div-by-zero formula (null result is valid catalog usage)', () => {
    // cost_usd / sprint_count — with all measures=1.0, result=1.0 (ok)
    // boundary_violations / tasks_total — also ok
    // In sample evaluation sprint_count=1.0 so no actual div-by-zero
    const def = {
      id: 'cost_test',
      title: { en: 'Cost Test', tr: 'Maliyet Test' },
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      grain: 'sprint',
      tier: 'custom',
    };
    expect(() => validateKpiDefinition(def)).not.toThrow();
  });

  it('accepts a formula with a complex arithmetic expression', () => {
    const def = {
      id: 'complex_kpi',
      title: { en: 'Complex', tr: 'Karmaşık' },
      formula: '(tokens_input + tokens_output) / tasks_total',
      unit: 'tokens',
      format: 'number',
      direction: 'down',
      grain: 'sprint',
      tier: 'custom',
    };
    expect(() => validateKpiDefinition(def)).not.toThrow();
  });
});

// ─── BUILTIN_KPIS ─────────────────────────────────────────────────────────────

describe('BUILTIN_KPIS', () => {
  it('contains exactly 8 KPIs', () => {
    expect(BUILTIN_KPIS).toHaveLength(8);
  });

  it('contains 5 universal and 3 dogfood KPIs', () => {
    const universal = BUILTIN_KPIS.filter(k => k.tier === 'universal');
    const dogfood = BUILTIN_KPIS.filter(k => k.tier === 'dogfood');
    expect(universal).toHaveLength(5);
    expect(dogfood).toHaveLength(3);
  });

  it('includes all expected universal KPI ids', () => {
    const ids = BUILTIN_KPIS.map(k => k.id);
    for (const id of ['cost_per_sprint', 'token_per_task', 'cache_hit_rate', 'cost_per_kloc', 'avg_retry']) {
      expect(ids).toContain(id);
    }
  });

  it('includes all expected dogfood KPI ids', () => {
    const ids = BUILTIN_KPIS.map(k => k.id);
    for (const id of ['no_go_rate', 'completion_rate', 'boundary_violation_rate']) {
      expect(ids).toContain(id);
    }
  });

  it('cost_per_sprint has correct threshold {warn:3.0, critical:3.5}', () => {
    const kpi = BUILTIN_KPIS.find(k => k.id === 'cost_per_sprint');
    expect(kpi).toBeDefined();
    expect(kpi!.threshold).toEqual({ warn: 3.0, critical: 3.5 });
  });

  it('no_go_rate has correct threshold {warn:0.15, critical:0.3}', () => {
    const kpi = BUILTIN_KPIS.find(k => k.id === 'no_go_rate');
    expect(kpi).toBeDefined();
    expect(kpi!.threshold).toEqual({ warn: 0.15, critical: 0.3 });
  });

  it('cache_hit_rate and completion_rate have direction "up"', () => {
    const hitRate = BUILTIN_KPIS.find(k => k.id === 'cache_hit_rate');
    const completionRate = BUILTIN_KPIS.find(k => k.id === 'completion_rate');
    expect(hitRate!.direction).toBe('up');
    expect(completionRate!.direction).toBe('up');
  });

  it('all other builtins have direction "down"', () => {
    const downKpis = BUILTIN_KPIS.filter(k => k.direction === 'down');
    expect(downKpis).toHaveLength(6);
  });

  it('all titles are i18n objects with en and tr fields', () => {
    for (const kpi of BUILTIN_KPIS) {
      expect(typeof kpi.title).toBe('object');
      expect(typeof kpi.title.en).toBe('string');
      expect(typeof kpi.title.tr).toBe('string');
      expect(kpi.title.en.length).toBeGreaterThan(0);
      expect(kpi.title.tr.length).toBeGreaterThan(0);
    }
  });

  it('all formulas reference only catalog measure IDs', () => {
    for (const kpi of BUILTIN_KPIS) {
      expect(() => validateKpiDefinition(kpi), `Formula "${kpi.formula}" for KPI "${kpi.id}" failed catalog validation`).not.toThrow();
    }
  });

  it('all builtins have grain "sprint"', () => {
    for (const kpi of BUILTIN_KPIS) {
      expect(kpi.grain).toBe('sprint');
    }
  });

  it('all builtins are enabled', () => {
    for (const kpi of BUILTIN_KPIS) {
      expect(kpi.enabled).toBe(true);
    }
  });
});

// ─── loadKpiDefinitions ────────────────────────────────────────────────────────

describe('loadKpiDefinitions', () => {
  it('returns 8 KPIs with no custom defs', () => {
    const defs = loadKpiDefinitions();
    expect(defs).toHaveLength(8);
  });

  it('returns 8 KPIs with an empty custom defs array', () => {
    const defs = loadKpiDefinitions([]);
    expect(defs).toHaveLength(8);
  });

  it('adds a new custom KPI (total becomes 9)', () => {
    const custom = {
      id: 'my_custom_kpi',
      title: { en: 'My Custom KPI', tr: 'Özel KPI\'m' },
      formula: 'cost_usd / tasks_done',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      grain: 'sprint',
      tier: 'custom',
    };
    const defs = loadKpiDefinitions([custom]);
    expect(defs).toHaveLength(9);
    expect(defs.map(d => d.id)).toContain('my_custom_kpi');
  });

  it('custom def overrides builtin with same id', () => {
    const override = {
      id: 'cost_per_sprint',
      title: { en: 'Custom Cost / Sprint', tr: 'Özel Sprint Başına Maliyet' },
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      threshold: { warn: 5.0, critical: 10.0 },
      grain: 'sprint',
      tier: 'custom',
    };
    const defs = loadKpiDefinitions([override]);
    expect(defs).toHaveLength(8); // still 8 (override, not add)
    const overridden = defs.find(d => d.id === 'cost_per_sprint');
    expect(overridden!.threshold).toEqual({ warn: 5.0, critical: 10.0 });
    expect(overridden!.title.en).toBe('Custom Cost / Sprint');
  });

  it('throws for an invalid custom definition (schema error)', () => {
    const invalid = {
      id: 'bad',
      title: { en: 'Bad' }, // missing tr
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency',
      direction: 'down',
      grain: 'sprint',
      tier: 'custom',
    };
    expect(() => loadKpiDefinitions([invalid])).toThrow();
  });

  it('throws for a custom definition with a catalog-external formula identifier', () => {
    const invalid = {
      id: 'bad_formula',
      title: { en: 'Bad Formula', tr: 'Kötü Formül' },
      formula: 'external_measure / sprint_count',
      unit: 'count',
      format: 'number',
      direction: 'down',
      grain: 'sprint',
      tier: 'custom',
    };
    expect(() => loadKpiDefinitions([invalid])).toThrow(/external_measure/);
  });

  it('applies multiple custom defs in order', () => {
    const custom1 = {
      id: 'alpha',
      title: { en: 'Alpha', tr: 'Alfa' },
      formula: 'cost_usd / sprint_count',
      unit: 'USD',
      format: 'currency' as const,
      direction: 'down' as const,
      grain: 'sprint' as const,
      tier: 'custom' as const,
    };
    const custom2 = {
      id: 'beta',
      title: { en: 'Beta', tr: 'Beta' },
      formula: 'retries / tasks_total',
      unit: 'ratio',
      format: 'number' as const,
      direction: 'down' as const,
      grain: 'sprint' as const,
      tier: 'custom' as const,
    };
    const defs = loadKpiDefinitions([custom1, custom2]);
    expect(defs).toHaveLength(10);
    expect(defs.map(d => d.id)).toContain('alpha');
    expect(defs.map(d => d.id)).toContain('beta');
  });
});
