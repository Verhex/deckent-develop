import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { MeasurementInput } from '../../src/core/kpi/kpi-store.js';
import { BUILTIN_KPIS } from '../../src/core/kpi/kpi-definitions.js';
import type { KpiDefinitionSpec } from '../../src/core/kpi/kpi-definitions.js';
import { computeStatus, computeSprintKpis } from '../../src/core/kpi/rollup-engine.js';

const TENANT = 'default';
const SPRINT = 'sprint-330';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDef(overrides: Partial<KpiDefinitionSpec> = {}): KpiDefinitionSpec {
  return {
    id: 'test_kpi',
    title: { en: 'Test', tr: 'Test' },
    formula: 'sprint_count',
    unit: 'count',
    format: 'number',
    direction: 'down',
    grain: 'sprint',
    tier: 'universal',
    scope: 'global',
    enabled: true,
    ...overrides,
  };
}

function meas(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    tenantId: overrides.tenantId ?? TENANT,
    measureId: overrides.measureId ?? 'cost_usd',
    value: overrides.value ?? 1,
    kind: overrides.kind ?? 'counter',
    unit: overrides.unit ?? 'count',
    sprintId: overrides.sprintId ?? SPRINT,
    taskId: overrides.taskId,
    ts: overrides.ts,
    tags: overrides.tags,
  };
}

// ─── computeStatus — direction-aware classification ───────────────────────────

describe('computeStatus — null & no-threshold', () => {
  it('null value → unknown (na), in both directions', () => {
    expect(computeStatus(null, makeDef({ direction: 'down', threshold: { warn: 1, critical: 2 } }))).toBe('unknown');
    expect(computeStatus(null, makeDef({ direction: 'up', threshold: { warn: 2, critical: 1 } }))).toBe('unknown');
  });

  it('no threshold configured → healthy (ok), even for an extreme value', () => {
    expect(computeStatus(999, makeDef({ direction: 'down' }))).toBe('healthy');
    expect(computeStatus(-999, makeDef({ direction: 'up' }))).toBe('healthy');
    expect(computeStatus(null, makeDef({ direction: 'up' }))).toBe('unknown'); // null still wins
  });
});

describe("computeStatus — 'down' KPI (lower is better; higher = worse)", () => {
  // e.g. cost_per_sprint: warn 3.0, critical 3.5.
  const def = makeDef({ direction: 'down', threshold: { warn: 3.0, critical: 3.5 } });

  it('value ≥ critical → critical', () => {
    expect(computeStatus(7, def)).toBe('critical');
    expect(computeStatus(3.5, def)).toBe('critical'); // boundary inclusive
  });
  it('warn ≤ value < critical → warning', () => {
    expect(computeStatus(3.4, def)).toBe('warning');
    expect(computeStatus(3.0, def)).toBe('warning'); // boundary inclusive
  });
  it('value < warn → healthy', () => {
    expect(computeStatus(2.9, def)).toBe('healthy');
    expect(computeStatus(0, def)).toBe('healthy');
  });
});

describe("computeStatus — 'up' KPI (higher is better; lower = worse)", () => {
  // hypothetical completion-style KPI: warn 0.8, critical 0.5 (critical < warn).
  const def = makeDef({ direction: 'up', threshold: { warn: 0.8, critical: 0.5 } });

  it('value ≤ critical → critical', () => {
    expect(computeStatus(0.4, def)).toBe('critical');
    expect(computeStatus(0.5, def)).toBe('critical'); // boundary inclusive
  });
  it('critical < value ≤ warn → warning', () => {
    expect(computeStatus(0.6, def)).toBe('warning');
    expect(computeStatus(0.8, def)).toBe('warning'); // boundary inclusive
  });
  it('value > warn → healthy', () => {
    expect(computeStatus(0.9, def)).toBe('healthy');
    expect(computeStatus(1, def)).toBe('healthy');
  });
});

// ─── computeSprintKpis — end-to-end fold → evaluate → status → persist ─────────

describe('computeSprintKpis', () => {
  let store: KpiStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rollup-engine-test-'));
    store = new KpiStore(join(tmpDir, 'memory.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Seed the goCriteria scenario: cost 7 over 1 sprint, cache 0.75, tasks_total 0. */
  function seedGoCriteriaSprint(): void {
    store.recordMeasurements([
      // cost_usd folded by aggMethod=sum (3 + 4 = 7) — proves we use aggMethod, not 'last'.
      meas({ measureId: 'cost_usd', value: 3, kind: 'gauge', unit: 'USD', ts: '2026-06-26T10:00:01.000Z' }),
      meas({ measureId: 'cost_usd', value: 4, kind: 'gauge', unit: 'USD', ts: '2026-06-26T10:00:02.000Z' }),
      meas({ measureId: 'sprint_count', value: 1 }),
      meas({ measureId: 'cache_read', value: 3, unit: 'tokens' }),
      meas({ measureId: 'tokens_input', value: 1, unit: 'tokens' }),
      meas({ measureId: 'tokens_output', value: 5, unit: 'tokens' }),
      // tasks_total = 0 → token_per_task divides by zero → null → na (no crash).
      meas({ measureId: 'tasks_total', value: 0 }),
    ]);
  }

  it('computes cost_per_sprint = 7 with status critical (≥3.5, direction down)', () => {
    seedGoCriteriaSprint();
    const results = computeSprintKpis(store, BUILTIN_KPIS, TENANT, SPRINT);

    const cost = results.find((r) => r.kpiId === 'cost_per_sprint');
    expect(cost).toBeDefined();
    expect(cost!.value).toBeCloseTo(7, 10); // 7 (sum) / 1, NOT 4 (last)
    expect(cost!.status).toBe('critical');
  });

  it('computes cache_hit_rate ≈ 0.75 with status healthy (no threshold)', () => {
    seedGoCriteriaSprint();
    const results = computeSprintKpis(store, BUILTIN_KPIS, TENANT, SPRINT);

    const cache = results.find((r) => r.kpiId === 'cache_hit_rate');
    expect(cache).toBeDefined();
    expect(cache!.value).toBeCloseTo(0.75, 10); // 3 / (3 + 1)
    expect(cache!.status).toBe('healthy');
  });

  it('token_per_task → status unknown (na) on division-by-zero, never crashes', () => {
    seedGoCriteriaSprint();
    let results: ReturnType<typeof computeSprintKpis> | undefined;
    expect(() => {
      results = computeSprintKpis(store, BUILTIN_KPIS, TENANT, SPRINT);
    }).not.toThrow();

    const tpt = results!.find((r) => r.kpiId === 'token_per_task');
    expect(tpt).toBeDefined();
    expect(tpt!.status).toBe('unknown');
    expect(tpt!.value).toBe(0); // na encoded as 0 (value column is NOT NULL)
  });

  it('persists results idempotently — re-running yields identical, non-duplicated rows', () => {
    seedGoCriteriaSprint();
    const first = computeSprintKpis(store, BUILTIN_KPIS, TENANT, SPRINT);
    const second = computeSprintKpis(store, BUILTIN_KPIS, TENANT, SPRINT);

    expect(second).toEqual(first); // pure of stored state → identical
    const persisted = store.getResults(TENANT, 'sprint', SPRINT);
    expect(persisted).toHaveLength(BUILTIN_KPIS.length); // upsert, not insert → no dupes

    const costRow = persisted.find((r) => r.kpiId === 'cost_per_sprint');
    expect(costRow!.value).toBeCloseTo(7, 10);
    expect(costRow!.status).toBe('critical');
  });

  it('does NOT crash on a KPI referencing a not-yet-emitted (Phase-2) measure → na', () => {
    store.recordMeasurements([meas({ measureId: 'sprint_count', value: 1 })]);
    // A custom def over a measure that has no measurement this sprint.
    const phase2Def = makeDef({ id: 'tool_calls_proxy', formula: 'tool_calls / sprint_count' });

    let results: ReturnType<typeof computeSprintKpis> | undefined;
    expect(() => {
      results = computeSprintKpis(store, [phase2Def], TENANT, SPRINT);
    }).not.toThrow();

    expect(results).toHaveLength(1);
    expect(results![0].status).toBe('unknown'); // FormulaError → na, no throw
  });

  it('skips disabled and non-sprint-grain definitions', () => {
    store.recordMeasurements([meas({ measureId: 'sprint_count', value: 1 })]);
    const defs: KpiDefinitionSpec[] = [
      makeDef({ id: 'enabled_sprint', formula: 'sprint_count', grain: 'sprint', enabled: true }),
      makeDef({ id: 'disabled_sprint', formula: 'sprint_count', grain: 'sprint', enabled: false }),
      makeDef({ id: 'enabled_daily', formula: 'sprint_count', grain: 'day', enabled: true }),
    ];
    const results = computeSprintKpis(store, defs, TENANT, SPRINT);

    expect(results.map((r) => r.kpiId)).toEqual(['enabled_sprint']);
  });

  it('does not compute formulas outside the SSOT evaluator (value matches evaluateFormula)', () => {
    // sprint_count = 1; a simple linear formula must equal the evaluator's result.
    store.recordMeasurements([meas({ measureId: 'sprint_count', value: 4 })]);
    const def = makeDef({ id: 'doubled', formula: 'sprint_count * 2', direction: 'down' });
    const [result] = computeSprintKpis(store, [def], TENANT, SPRINT);
    expect(result.value).toBe(8);
  });
});
