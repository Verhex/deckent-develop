import { describe, it, expect } from 'vitest';
import {
  BUILTIN_WORK_TYPES,
  DELIVERABLE_TYPES,
  WORK_TYPE_IDS,
  isWorkType,
  isDeliverableType,
  getWorkTypeDef,
  parseSubtype,
} from '../../../src/core/routing3/vocabulary-builtin.js';
import {
  InvalidWorkTypeError,
  InvalidSubtypeError,
} from '../../../src/core/routing3/types.js';
import { DeckentError } from '../../../src/core/errors.js';
import type { WorkType, DeliverableType } from '../../../src/core/routing3/types.js';

// The exact closed sets the spec §1a/§1c commit to. Kept local so a drift in
// the vocabulary is caught here rather than tautologically re-derived.
const EXPECTED_WORK_TYPES: readonly WorkType[] = [
  'build',
  'fix',
  'refactor',
  'document',
  'review',
  'configure',
  'migrate',
  'analyze',
];
const EXPECTED_DELIVERABLES: readonly DeliverableType[] = [
  'code-src',
  'code-test',
  'doc',
  'config',
  'workflow',
  'manifest',
  'script',
  'migration',
  'asset',
];

describe('routing3 builtin work-types (spec §1a)', () => {
  it('defines exactly the 8 closed-core work-types in spec order', () => {
    expect(WORK_TYPE_IDS).toEqual(EXPECTED_WORK_TYPES);
    expect(BUILTIN_WORK_TYPES).toHaveLength(8);
  });

  it('every work-type carries a non-empty contract, dodSignature and examples', () => {
    for (const def of BUILTIN_WORK_TYPES) {
      expect(EXPECTED_WORK_TYPES).toContain(def.type);
      expect(def.contract.trim().length).toBeGreaterThan(0);
      expect(def.dodSignature.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(def.examples)).toBe(true);
      expect(def.examples.length).toBeGreaterThan(0);
      for (const ex of def.examples) {
        expect(typeof ex).toBe('string');
        expect(ex.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('has unique work-type ids (no duplicate entries)', () => {
    const ids = BUILTIN_WORK_TYPES.map((w) => w.type);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never exposes a "test" work-type (Alperen decision — identifier check, not prose)', () => {
    // Guard the IDENTIFIERS only. The build/fix DoD signatures legitimately
    // contain the word "tests"; a substring scan would be a false positive.
    expect(WORK_TYPE_IDS).not.toContain('test' as WorkType);
    expect(isWorkType('test')).toBe(false);
    expect(getWorkTypeDef('test')).toBeUndefined();
  });

  it('getWorkTypeDef resolves a known type and rejects an unknown one', () => {
    expect(getWorkTypeDef('review')?.type).toBe('review');
    expect(getWorkTypeDef('nope')).toBeUndefined();
  });
});

describe('routing3 deliverable types (spec §1c)', () => {
  it('defines exactly the 9 closed deliverable types', () => {
    expect(DELIVERABLE_TYPES).toEqual(EXPECTED_DELIVERABLES);
    expect(DELIVERABLE_TYPES).toHaveLength(9);
    expect(new Set(DELIVERABLE_TYPES).size).toBe(9);
  });

  it('isDeliverableType accepts members and rejects non-members', () => {
    for (const d of EXPECTED_DELIVERABLES) {
      expect(isDeliverableType(d)).toBe(true);
    }
    expect(isDeliverableType('code')).toBe(false);
    expect(isDeliverableType('test')).toBe(false);
    expect(isDeliverableType('')).toBe(false);
  });
});

describe('routing3 isWorkType guard', () => {
  it('accepts every closed-core work-type', () => {
    for (const t of EXPECTED_WORK_TYPES) {
      expect(isWorkType(t)).toBe(true);
    }
  });

  it('rejects unknown / empty tokens', () => {
    expect(isWorkType('nonexistent')).toBe(false);
    expect(isWorkType('')).toBe(false);
    expect(isWorkType('BUILD')).toBe(false); // case-sensitive
  });
});

describe('routing3 parseSubtype grammar (spec §1a)', () => {
  it('parses parent:subtype into rollup parent + free-text subtype', () => {
    expect(parseSubtype('review:compliance')).toEqual({
      parent: 'review',
      subtype: 'compliance',
    });
    expect(parseSubtype('configure:iac')).toEqual({
      parent: 'configure',
      subtype: 'iac',
    });
    expect(parseSubtype('analyze:cost')).toEqual({
      parent: 'analyze',
      subtype: 'cost',
    });
  });

  it('treats a bare parent as the rollup form (subtype null)', () => {
    expect(parseSubtype('review')).toEqual({ parent: 'review', subtype: null });
    for (const t of EXPECTED_WORK_TYPES) {
      expect(parseSubtype(t)).toEqual({ parent: t, subtype: null });
    }
  });

  it('trims surrounding whitespace on both segments', () => {
    expect(parseSubtype('  review : compliance  ')).toEqual({
      parent: 'review',
      subtype: 'compliance',
    });
  });

  it('keeps additional colons inside the free-text subtype (splits on first)', () => {
    expect(parseSubtype('configure:iac:aws')).toEqual({
      parent: 'configure',
      subtype: 'iac:aws',
    });
  });

  it('throws InvalidWorkTypeError when the parent is unknown', () => {
    expect(() => parseSubtype('nonexistent')).toThrow(InvalidWorkTypeError);
    expect(() => parseSubtype('nonexistent:foo')).toThrow(InvalidWorkTypeError);
  });

  it('throws InvalidWorkTypeError for a "test" parent (no test work-type)', () => {
    expect(() => parseSubtype('test')).toThrow(InvalidWorkTypeError);
    expect(() => parseSubtype('test:unit')).toThrow(InvalidWorkTypeError);
  });

  it('throws InvalidWorkTypeError on empty input', () => {
    expect(() => parseSubtype('')).toThrow(InvalidWorkTypeError);
    expect(() => parseSubtype('   ')).toThrow(InvalidWorkTypeError);
  });

  it('throws InvalidSubtypeError when a colon is present but the subtype is empty', () => {
    expect(() => parseSubtype('review:')).toThrow(InvalidSubtypeError);
    expect(() => parseSubtype('review:   ')).toThrow(InvalidSubtypeError);
  });

  it('throws InvalidWorkTypeError when the parent segment is empty (":subtype")', () => {
    expect(() => parseSubtype(':compliance')).toThrow(InvalidWorkTypeError);
  });
});

describe('routing3 typed errors belong to the DeckentError family', () => {
  it('InvalidWorkTypeError extends DeckentError and carries the offending value', () => {
    try {
      parseSubtype('bogus');
      throw new Error('expected parseSubtype to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidWorkTypeError);
      expect(err).toBeInstanceOf(DeckentError);
      expect((err as InvalidWorkTypeError).code).toBe('ROUTING3_INVALID_WORK_TYPE');
      expect((err as InvalidWorkTypeError).value).toBe('bogus');
      expect((err as InvalidWorkTypeError).name).toBe('InvalidWorkTypeError');
    }
  });

  it('InvalidSubtypeError extends DeckentError and carries the offending value', () => {
    try {
      parseSubtype('review:');
      throw new Error('expected parseSubtype to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSubtypeError);
      expect(err).toBeInstanceOf(DeckentError);
      expect((err as InvalidSubtypeError).code).toBe('ROUTING3_INVALID_SUBTYPE');
      expect((err as InvalidSubtypeError).value).toBe('review:');
      expect((err as InvalidSubtypeError).name).toBe('InvalidSubtypeError');
    }
  });
});
