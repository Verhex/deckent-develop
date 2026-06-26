import { describe, it, expect } from 'vitest';
import { BASE_MEASURES, getMeasure } from '../../src/core/kpi/measure-catalog.js';

// ─── Catalog Completeness ────────────────────────────────────────────────────

describe('BASE_MEASURES', () => {
  const EXPECTED_IDS = [
    'sprint_count',
    'tasks_total',
    'tasks_done',
    'no_go',
    'boundary_violations',
    'retries',
    'lines_added',
    'cost_usd',
    'tokens_input',
    'tokens_output',
    'cache_read',
  ] as const;

  it('contains exactly 11 Faz-1 measures', () => {
    expect(Object.keys(BASE_MEASURES)).toHaveLength(11);
  });

  it('every measure id matches its catalog key', () => {
    for (const [key, measure] of Object.entries(BASE_MEASURES)) {
      expect(measure.id).toBe(key);
    }
  });

  it('all expected measure ids are present', () => {
    for (const id of EXPECTED_IDS) {
      expect(BASE_MEASURES).toHaveProperty(id);
    }
  });

  it('cost_usd has kind=gauge and unit=USD', () => {
    const m = BASE_MEASURES['cost_usd'];
    expect(m).toBeDefined();
    expect(m.kind).toBe('gauge');
    expect(m.unit).toBe('USD');
  });

  it('all counter measures have valid aggMethod', () => {
    const validMethods = new Set(['sum', 'avg', 'last', 'max', 'min']);
    for (const measure of Object.values(BASE_MEASURES)) {
      expect(validMethods.has(measure.aggMethod)).toBe(true);
    }
  });

  it('all measures have non-empty description', () => {
    for (const measure of Object.values(BASE_MEASURES)) {
      expect(measure.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── getMeasure ──────────────────────────────────────────────────────────────

describe('getMeasure', () => {
  it('returns undefined for unknown id', () => {
    expect(getMeasure('unknown_measure')).toBeUndefined();
    expect(getMeasure('')).toBeUndefined();
    expect(getMeasure('tool_calls')).toBeUndefined(); // Faz-2, out of scope
  });

  it('returns the correct measure for known id', () => {
    const m = getMeasure('cost_usd');
    expect(m).toBeDefined();
    expect(m?.id).toBe('cost_usd');
    expect(m?.kind).toBe('gauge');
    expect(m?.unit).toBe('USD');
  });

  it('returns sprint_count with counter kind and sum aggMethod', () => {
    const m = getMeasure('sprint_count');
    expect(m?.kind).toBe('counter');
    expect(m?.aggMethod).toBe('sum');
  });

  it('returns same reference as BASE_MEASURES', () => {
    const m = getMeasure('tasks_done');
    expect(m).toBe(BASE_MEASURES['tasks_done']);
  });
});
