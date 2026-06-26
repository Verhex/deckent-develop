// tests/core/principal-can.test.ts
import { describe, it, expect } from 'vitest';
import { principalCan } from '../../src/core/rbac.js';

describe('principalCan', () => {
  it('grants everything with "*"', () => {
    expect(principalCan(['*'], 'order:write')).toBe(true);
  });
  it('grants exact match', () => {
    expect(principalCan(['order:read'], 'order:read')).toBe(true);
  });
  it('grants resource wildcard "<res>:*"', () => {
    expect(principalCan(['order:*'], 'order:write')).toBe(true);
  });
  it('grants action wildcard "*:<act>"', () => {
    expect(principalCan(['*:read'], 'invoice:read')).toBe(true);
  });
  it('denies when not granted', () => {
    expect(principalCan(['order:read'], 'order:write')).toBe(false);
  });
  it('denies on empty permission set (fail-closed)', () => {
    expect(principalCan([], 'order:read')).toBe(false);
  });
});
