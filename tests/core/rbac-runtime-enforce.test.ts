import { describe, it, expect } from 'vitest';
import { Permission, enforceRbac } from '../../src/core/rbac.js';

describe('enforceRbac — enabled=true, permission granted', () => {
  it('admin SPRINT_WRITE allowed when rbac enabled', () => {
    expect(enforceRbac('admin', Permission.SPRINT_WRITE, 'tenant-1', { enabled: true })).toBe(true);
  });
  it('operator EXECUTE allowed when rbac enabled', () => {
    expect(enforceRbac('operator', Permission.EXECUTE, 'tenant-1', { enabled: true })).toBe(true);
  });
});

describe('enforceRbac — enabled=true, permission denied', () => {
  it('viewer SPRINT_WRITE denied when rbac enabled', () => {
    expect(enforceRbac('viewer', Permission.SPRINT_WRITE, 'tenant-1', { enabled: true })).toBe(false);
  });
  it('viewer EXECUTE denied when rbac enabled', () => {
    expect(enforceRbac('viewer', Permission.EXECUTE, 'tenant-1', { enabled: true })).toBe(false);
  });
});

describe('enforceRbac — disabled NO_OP', () => {
  it('returns true when rbac disabled regardless of role', () => {
    expect(enforceRbac('viewer', Permission.SPRINT_WRITE, 'tenant-1', { enabled: false })).toBe(true);
  });
  it('returns true when rbac disabled with invalid role', () => {
    expect(enforceRbac('unknown-role', Permission.ADMIN, 'tenant-1', { enabled: false })).toBe(true);
  });
  it('returns true when rbacConfig not provided (NO_OP bypass)', () => {
    expect(enforceRbac('viewer', Permission.ADMIN, 'tenant-1')).toBe(true);
  });
});

describe('enforceRbac — tenant isolation', () => {
  it('enabled=true with invalid tenantId returns false', () => {
    expect(enforceRbac('admin', Permission.READ, '../escape', { enabled: true })).toBe(false);
  });
  it('enabled=false with invalid tenantId still NO_OP returns true', () => {
    expect(enforceRbac('admin', Permission.READ, '../escape', { enabled: false })).toBe(true);
  });
});
