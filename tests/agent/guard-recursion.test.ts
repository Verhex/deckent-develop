// tests/agent/guard-recursion.test.ts
import { describe, it, expect } from 'vitest';
import { recursionExceeded, DEFAULT_MAX_ITERATIONS } from '../../src/agent/guards/recursion.js';

describe('recursionExceeded', () => {
  it('is false at and below the cap, true above it', () => {
    expect(recursionExceeded(1, 3)).toBe(false);
    expect(recursionExceeded(3, 3)).toBe(false);
    expect(recursionExceeded(4, 3)).toBe(true);
  });
  it('defaults to DEFAULT_MAX_ITERATIONS when no max is given', () => {
    expect(recursionExceeded(DEFAULT_MAX_ITERATIONS)).toBe(false);
    expect(recursionExceeded(DEFAULT_MAX_ITERATIONS + 1)).toBe(true);
  });
});
