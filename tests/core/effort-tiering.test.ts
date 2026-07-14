// born-636-K2 effort tiering — re-aimed at the V3 work-type mapping (S3):
// the retired V2 resolveEffortTier(intent) semantics live on as
// effortForWorkType(workType) — documentation/config lanes run light, deep
// analysis runs high, construction lanes default to normal.

import { describe, it, expect } from 'vitest';
import { effortForWorkType, WORK_TYPE_EFFORT } from '../../src/core/routing/config.js';
import { WORK_TYPE_IDS } from '../../src/core/routing/vocabulary-builtin.js';

describe('effortForWorkType (V3 work-type → effort tier)', () => {
  it('covers every closed-core work-type exactly (no silent default holes)', () => {
    for (const wt of WORK_TYPE_IDS) {
      expect(WORK_TYPE_EFFORT[wt], `work-type '${wt}' missing from the effort table`).toBeDefined();
    }
    expect(Object.keys(WORK_TYPE_EFFORT).sort()).toEqual([...WORK_TYPE_IDS].sort());
  });

  it('faithful V2 semantics: document/configure low, analyze high, construction normal', () => {
    expect(effortForWorkType('document')).toBe('low');
    expect(effortForWorkType('configure')).toBe('low');
    expect(effortForWorkType('analyze')).toBe('high');
    expect(effortForWorkType('build')).toBe('normal');
    expect(effortForWorkType('fix')).toBe('normal');
    expect(effortForWorkType('refactor')).toBe('normal');
    expect(effortForWorkType('migrate')).toBe('normal');
    expect(effortForWorkType('review')).toBe('normal');
  });

  it('subtype rolls up to the parent tier; unknown input degrades to normal', () => {
    expect(effortForWorkType('document:api-reference')).toBe('low');
    expect(effortForWorkType('analyze:cost')).toBe('high');
    expect(effortForWorkType('no-such-type')).toBe('normal');
  });
});
