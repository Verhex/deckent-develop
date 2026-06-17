import { describe, it, expect } from 'vitest';
import { isFileInScope } from '../../src/monitor/auditor.js';
import type { TaskScope } from '../../src/core/types.js';

const scope: TaskScope = { directories: ['src/api/'], filesRead: [], filesWrite: ['README.md'] };

describe('isFileInScope (exported auditor scope primitive)', () => {
  it('returns true for a file inside a scoped directory', () => {
    expect(isFileInScope('src/api/handler.ts', scope)).toBe(true);
  });
  it('returns false for a file outside every scoped directory', () => {
    expect(isFileInScope('src/orchestra/other.ts', scope)).toBe(false);
  });
  it('returns true for an exact filesWrite match', () => {
    expect(isFileInScope('README.md', scope)).toBe(true);
  });
});
