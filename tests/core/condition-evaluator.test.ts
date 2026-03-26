import { describe, it, expect } from 'vitest';
import { evaluateCondition, resolvePath } from '../../src/core/condition-evaluator.js';

describe('condition-evaluator', () => {
  describe('resolvePath', () => {
    it('resolves simple path', () => {
      expect(resolvePath({ a: 1 }, 'a')).toBe(1);
    });

    it('resolves nested path', () => {
      expect(resolvePath({ intent: { primary: 'security' } }, 'intent.primary')).toBe('security');
    });

    it('resolves deeply nested path', () => {
      expect(resolvePath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
    });

    it('returns undefined for missing path', () => {
      expect(resolvePath({ a: 1 }, 'b')).toBeUndefined();
    });

    it('returns undefined for null object', () => {
      expect(resolvePath(null, 'a')).toBeUndefined();
    });

    it('returns undefined for empty path', () => {
      expect(resolvePath({ a: 1 }, '')).toBeUndefined();
    });

    it('handles arrays in path', () => {
      expect(resolvePath({ a: [1, 2, 3] }, 'a')).toEqual([1, 2, 3]);
    });
  });

  describe('evaluateCondition — exact match', () => {
    it('matches string value', () => {
      expect(evaluateCondition({ intent: { primary: 'security' } }, { 'intent.primary': 'security' })).toBe(true);
    });

    it('rejects non-matching string', () => {
      expect(evaluateCondition({ intent: { primary: 'security' } }, { 'intent.primary': 'testing' })).toBe(false);
    });

    it('matches number value', () => {
      expect(evaluateCondition({ count: 5 }, { count: 5 })).toBe(true);
    });

    it('matches boolean value', () => {
      expect(evaluateCondition({ enabled: true }, { enabled: true })).toBe(true);
    });

    it('matches nested path', () => {
      expect(evaluateCondition(
        { intent: { primary: 'implementation', confidence: 0.9 } },
        { 'intent.primary': 'implementation' },
      )).toBe(true);
    });
  });

  describe('evaluateCondition — operators', () => {
    it('$gt operator', () => {
      expect(evaluateCondition({ score: 10 }, { score: { $gt: 5 } })).toBe(true);
      expect(evaluateCondition({ score: 3 }, { score: { $gt: 5 } })).toBe(false);
      expect(evaluateCondition({ score: 5 }, { score: { $gt: 5 } })).toBe(false);
    });

    it('$gte operator', () => {
      expect(evaluateCondition({ score: 5 }, { score: { $gte: 5 } })).toBe(true);
      expect(evaluateCondition({ score: 4 }, { score: { $gte: 5 } })).toBe(false);
    });

    it('$lt operator', () => {
      expect(evaluateCondition({ score: 3 }, { score: { $lt: 5 } })).toBe(true);
      expect(evaluateCondition({ score: 5 }, { score: { $lt: 5 } })).toBe(false);
    });

    it('$lte operator', () => {
      expect(evaluateCondition({ score: 5 }, { score: { $lte: 5 } })).toBe(true);
      expect(evaluateCondition({ score: 6 }, { score: { $lte: 5 } })).toBe(false);
    });

    it('$contains on array of strings', () => {
      expect(evaluateCondition({ tags: ['a', 'b', 'c'] }, { tags: { $contains: 'b' } })).toBe(true);
      expect(evaluateCondition({ tags: ['a', 'b', 'c'] }, { tags: { $contains: 'd' } })).toBe(false);
    });

    it('$contains on string', () => {
      expect(evaluateCondition({ text: 'hello world' }, { text: { $contains: 'world' } })).toBe(true);
      expect(evaluateCondition({ text: 'hello world' }, { text: { $contains: 'xyz' } })).toBe(false);
    });

    it('$contains on array of objects with name field', () => {
      const data = { domains: [{ name: 'auth', weight: 0.5 }, { name: 'api', weight: 0.3 }] };
      expect(evaluateCondition(data, { domains: { $contains: 'auth' } })).toBe(true);
      expect(evaluateCondition(data, { domains: { $contains: 'db' } })).toBe(false);
    });

    it('$in operator', () => {
      expect(evaluateCondition({ status: 'active' }, { status: { $in: ['active', 'pending'] } })).toBe(true);
      expect(evaluateCondition({ status: 'deleted' }, { status: { $in: ['active', 'pending'] } })).toBe(false);
    });

    it('$not operator', () => {
      expect(evaluateCondition({ type: 'admin' }, { type: { $not: 'guest' } })).toBe(true);
      expect(evaluateCondition({ type: 'guest' }, { type: { $not: 'guest' } })).toBe(false);
    });

    it('$exists operator', () => {
      expect(evaluateCondition({ name: 'test' }, { name: { $exists: true } })).toBe(true);
      expect(evaluateCondition({}, { name: { $exists: true } })).toBe(false);
      expect(evaluateCondition({}, { name: { $exists: false } })).toBe(true);
    });

    it('multiple operators on same field', () => {
      expect(evaluateCondition({ score: 7 }, { score: { $gte: 5, $lt: 10 } })).toBe(true);
      expect(evaluateCondition({ score: 3 }, { score: { $gte: 5, $lt: 10 } })).toBe(false);
      expect(evaluateCondition({ score: 10 }, { score: { $gte: 5, $lt: 10 } })).toBe(false);
    });
  });

  describe('evaluateCondition — logical operators', () => {
    it('$and — all must match', () => {
      expect(evaluateCondition(
        { a: 1, b: 2 },
        { $and: [{ a: 1 }, { b: 2 }] },
      )).toBe(true);

      expect(evaluateCondition(
        { a: 1, b: 3 },
        { $and: [{ a: 1 }, { b: 2 }] },
      )).toBe(false);
    });

    it('$or — any must match', () => {
      expect(evaluateCondition(
        { type: 'admin' },
        { $or: [{ type: 'admin' }, { type: 'superadmin' }] },
      )).toBe(true);

      expect(evaluateCondition(
        { type: 'guest' },
        { $or: [{ type: 'admin' }, { type: 'superadmin' }] },
      )).toBe(false);
    });

    it('nested $and/$or', () => {
      expect(evaluateCondition(
        { a: 1, b: 2, c: 3 },
        { $and: [{ a: 1 }, { $or: [{ b: 99 }, { c: 3 }] }] },
      )).toBe(true);
    });
  });

  describe('evaluateCondition — multiple conditions (implicit AND)', () => {
    it('all conditions must match', () => {
      expect(evaluateCondition(
        { intent: { primary: 'security' }, complexity: { fileCount: 5 } },
        { 'intent.primary': 'security', 'complexity.fileCount': { $gte: 3 } },
      )).toBe(true);
    });

    it('fails if any condition mismatches', () => {
      expect(evaluateCondition(
        { intent: { primary: 'testing' }, complexity: { fileCount: 5 } },
        { 'intent.primary': 'security', 'complexity.fileCount': { $gte: 3 } },
      )).toBe(false);
    });
  });

  describe('evaluateCondition — edge cases', () => {
    it('empty condition always matches', () => {
      expect(evaluateCondition({ anything: 'here' }, {})).toBe(true);
    });

    it('handles non-numeric comparison gracefully', () => {
      expect(evaluateCondition({ name: 'test' }, { name: { $gt: 5 } })).toBe(false);
    });

    it('handles undefined actual value', () => {
      expect(evaluateCondition({}, { 'missing.path': 'value' })).toBe(false);
    });
  });
});
