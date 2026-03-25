/**
 * Tests for marketplace improvements (task-057-012):
 * M) Registry cache (TTL: 5 min)
 * N) Strict semver validation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateSemver,
  getCached,
  setCache,
  clearRegistryCache,
} from '../../../src/cli/commands/skill-marketplace.js';

describe('marketplace improvements', () => {
  beforeEach(() => {
    clearRegistryCache();
  });

  // ─── N) strict semver validation ────────────────────────────────────────

  describe('N: strict semver validation', () => {
    it('accepts 1.0.0', () => { expect(validateSemver('1.0.0')).toBe(true); });
    it('accepts 0.0.1', () => { expect(validateSemver('0.0.1')).toBe(true); });
    it('accepts 10.20.30', () => { expect(validateSemver('10.20.30')).toBe(true); });
    it('accepts 1.0.0-alpha.1 (pre-release)', () => { expect(validateSemver('1.0.0-alpha.1')).toBe(true); });
    it('accepts 1.0.0-beta+build (pre-release + build)', () => { expect(validateSemver('1.0.0-beta+build')).toBe(true); });
    it('accepts 2.0.0+build.123 (build metadata)', () => { expect(validateSemver('2.0.0+build.123')).toBe(true); });

    it('rejects partial version 1.0', () => { expect(validateSemver('1.0')).toBe(false); });
    it('rejects single number 1', () => { expect(validateSemver('1')).toBe(false); });
    it('rejects v-prefixed v1.0.0', () => { expect(validateSemver('v1.0.0')).toBe(false); });
    it('rejects "latest"', () => { expect(validateSemver('latest')).toBe(false); });
    it('rejects empty string', () => { expect(validateSemver('')).toBe(false); });
    it('rejects "1.0.0.0" (four parts)', () => { expect(validateSemver('1.0.0.0')).toBe(false); });
  });

  // ─── M) registry cache ──────────────────────────────────────────────────

  describe('M: registry cache', () => {
    it('getCached returns null for unknown key', () => {
      expect(getCached('unknown-key')).toBeNull();
    });

    it('setCache + getCached returns stored value', () => {
      const data = { skills: [], total: 0, page: 1, pages: 0 };
      setCache('my-key', data);
      const result = getCached<typeof data>('my-key');
      expect(result).not.toBeNull();
      expect(result!.total).toBe(0);
    });

    it('clearRegistryCache removes all entries', () => {
      setCache('key1', 'val1');
      setCache('key2', 'val2');
      clearRegistryCache();
      expect(getCached('key1')).toBeNull();
      expect(getCached('key2')).toBeNull();
    });

    it('different cache keys are independent', () => {
      setCache('key-a', { value: 'a' });
      setCache('key-b', { value: 'b' });
      const a = getCached<{ value: string }>('key-a');
      const b = getCached<{ value: string }>('key-b');
      expect(a?.value).toBe('a');
      expect(b?.value).toBe('b');
    });

    it('setCache overwrites existing entry for same key', () => {
      setCache('overwrite-key', { val: 1 });
      setCache('overwrite-key', { val: 2 });
      const result = getCached<{ val: number }>('overwrite-key');
      expect(result?.val).toBe(2);
    });

    it('cache stores complex objects', () => {
      const data = {
        skills: [{ name: 'test', version: '1.0.0', description: 'd', author: 'a', category: 'tool', downloads: 10, rating: 5, tags: [] }],
        total: 1,
        page: 1,
        pages: 1,
      };
      setCache('complex-key', data);
      const cached = getCached<typeof data>('complex-key');
      expect(cached?.skills[0]?.name).toBe('test');
    });
  });
});
