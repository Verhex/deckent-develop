import { describe, it, expect } from 'vitest';
import { Permission, can, isValidRole } from '../../src/core/rbac.js';

describe('can — admin has all permissions', () => {
  it('admin can READ', () => expect(can('admin', Permission.READ, 'tenant-1')).toBe(true));
  it('admin can WRITE', () => expect(can('admin', Permission.WRITE, 'tenant-1')).toBe(true));
  it('admin can EXECUTE', () => expect(can('admin', Permission.EXECUTE, 'tenant-1')).toBe(true));
  it('admin can ADMIN', () => expect(can('admin', Permission.ADMIN, 'tenant-1')).toBe(true));
  it('admin can AUDIT', () => expect(can('admin', Permission.AUDIT, 'tenant-1')).toBe(true));
});

describe('can — viewer is read-only', () => {
  it('viewer can READ', () => expect(can('viewer', Permission.READ, 'tenant-1')).toBe(true));
  it('viewer cannot WRITE', () => expect(can('viewer', Permission.WRITE, 'tenant-1')).toBe(false));
  it('viewer cannot EXECUTE', () => expect(can('viewer', Permission.EXECUTE, 'tenant-1')).toBe(false));
  it('viewer cannot ADMIN', () => expect(can('viewer', Permission.ADMIN, 'tenant-1')).toBe(false));
  it('viewer cannot AUDIT', () => expect(can('viewer', Permission.AUDIT, 'tenant-1')).toBe(false));
});

describe('can — operator has read/write/execute but not admin or audit', () => {
  it('operator can READ', () => expect(can('operator', Permission.READ, 'tenant-1')).toBe(true));
  it('operator can WRITE', () => expect(can('operator', Permission.WRITE, 'tenant-1')).toBe(true));
  it('operator can EXECUTE', () => expect(can('operator', Permission.EXECUTE, 'tenant-1')).toBe(true));
  it('operator cannot ADMIN', () => expect(can('operator', Permission.ADMIN, 'tenant-1')).toBe(false));
  it('operator cannot AUDIT', () => expect(can('operator', Permission.AUDIT, 'tenant-1')).toBe(false));
});

describe('can — tenant isolation', () => {
  it('rejects path-traversal tenantId', () => {
    expect(can('admin', Permission.READ, '../escape')).toBe(false);
  });
  it('rejects empty tenantId', () => {
    expect(can('admin', Permission.READ, '')).toBe(false);
  });
  it('rejects uppercase tenantId', () => {
    expect(can('admin', Permission.READ, 'UPPERCASE')).toBe(false);
  });
  it('accepts valid lowercase tenantId', () => {
    expect(can('admin', Permission.READ, 'my-tenant-01')).toBe(true);
  });
});

describe('can — unknown role is denied', () => {
  it('superadmin role is denied', () => {
    expect(can('superadmin', Permission.READ, 'tenant-1')).toBe(false);
  });
  it('root role is denied', () => {
    expect(can('root', Permission.ADMIN, 'tenant-1')).toBe(false);
  });
  it('empty string role is denied', () => {
    expect(can('', Permission.READ, 'tenant-1')).toBe(false);
  });
});

describe('isValidRole', () => {
  it('recognizes admin', () => expect(isValidRole('admin')).toBe(true));
  it('recognizes operator', () => expect(isValidRole('operator')).toBe(true));
  it('recognizes viewer', () => expect(isValidRole('viewer')).toBe(true));
  it('rejects unknown role', () => expect(isValidRole('superadmin')).toBe(false));
  it('rejects empty string', () => expect(isValidRole('')).toBe(false));
});
