import { describe, it, expect } from 'vitest';
import { Permission, PERMISSION_MATRIX, ROLE_LEVEL, can, isValidRole } from '../../src/core/rbac.js';

describe('ROLE_LEVEL — hierarchy ordering', () => {
  it('admin has higher level than operator', () => {
    expect(ROLE_LEVEL.admin).toBeGreaterThan(ROLE_LEVEL.operator);
  });
  it('operator has higher level than viewer', () => {
    expect(ROLE_LEVEL.operator).toBeGreaterThan(ROLE_LEVEL.viewer);
  });
  it('viewer has the minimum level', () => {
    expect(ROLE_LEVEL.viewer).toBe(1);
  });
});

describe('role hierarchy — admin inherits operator permissions', () => {
  it('admin inherits flow:manage from operator', () => {
    expect(can('admin', Permission.FLOW_MANAGE, 'tenant-1')).toBe(true);
  });
  it('admin inherits sprint:write from operator', () => {
    expect(can('admin', Permission.SPRINT_WRITE, 'tenant-1')).toBe(true);
  });
  it('admin inherits audit:read from operator', () => {
    expect(can('admin', Permission.AUDIT_READ, 'tenant-1')).toBe(true);
  });
  it('admin inherits sprint:read from viewer (transitive)', () => {
    expect(can('admin', Permission.SPRINT_READ, 'tenant-1')).toBe(true);
  });
  it('operator inherits sprint:read from viewer', () => {
    expect(can('operator', Permission.SPRINT_READ, 'tenant-1')).toBe(true);
  });
  it('operator can flow:manage (own permission)', () => {
    expect(can('operator', Permission.FLOW_MANAGE, 'tenant-1')).toBe(true);
  });
});

describe('viewer minimal permissions', () => {
  it('viewer can sprint:read', () => {
    expect(can('viewer', Permission.SPRINT_READ, 'tenant-1')).toBe(true);
  });
  it('viewer cannot sprint:write', () => {
    expect(can('viewer', Permission.SPRINT_WRITE, 'tenant-1')).toBe(false);
  });
  it('viewer cannot flow:manage', () => {
    expect(can('viewer', Permission.FLOW_MANAGE, 'tenant-1')).toBe(false);
  });
  it('viewer cannot audit:read', () => {
    expect(can('viewer', Permission.AUDIT_READ, 'tenant-1')).toBe(false);
  });
  it('viewer cannot tenant:admin', () => {
    expect(can('viewer', Permission.TENANT_ADMIN, 'tenant-1')).toBe(false);
  });
});

describe('unknown role is denied', () => {
  it('superadmin role denied for sprint:read', () => {
    expect(can('superadmin', Permission.SPRINT_READ, 'tenant-1')).toBe(false);
  });
  it('empty string role denied', () => {
    expect(can('', Permission.READ, 'tenant-1')).toBe(false);
  });
  it('root role denied', () => {
    expect(can('root', Permission.FLOW_MANAGE, 'tenant-1')).toBe(false);
  });
  it('isValidRole rejects unknown', () => {
    expect(isValidRole('god')).toBe(false);
  });
});

describe('PERMISSION_MATRIX completeness', () => {
  it('admin matrix includes all permissions', () => {
    const adminPerms = PERMISSION_MATRIX.admin;
    expect(adminPerms.has(Permission.READ)).toBe(true);
    expect(adminPerms.has(Permission.WRITE)).toBe(true);
    expect(adminPerms.has(Permission.EXECUTE)).toBe(true);
    expect(adminPerms.has(Permission.ADMIN)).toBe(true);
    expect(adminPerms.has(Permission.AUDIT)).toBe(true);
    expect(adminPerms.has(Permission.SPRINT_READ)).toBe(true);
    expect(adminPerms.has(Permission.SPRINT_WRITE)).toBe(true);
    expect(adminPerms.has(Permission.AUDIT_READ)).toBe(true);
    expect(adminPerms.has(Permission.FLOW_MANAGE)).toBe(true);
    expect(adminPerms.has(Permission.TENANT_ADMIN)).toBe(true);
  });
  it('operator matrix excludes admin-only permissions', () => {
    const operatorPerms = PERMISSION_MATRIX.operator;
    expect(operatorPerms.has(Permission.ADMIN)).toBe(false);
    expect(operatorPerms.has(Permission.AUDIT)).toBe(false);
    expect(operatorPerms.has(Permission.TENANT_ADMIN)).toBe(false);
  });
  it('viewer matrix contains only viewer-level permissions', () => {
    const viewerPerms = PERMISSION_MATRIX.viewer;
    expect(viewerPerms.has(Permission.READ)).toBe(true);
    expect(viewerPerms.has(Permission.SPRINT_READ)).toBe(true);
    expect(viewerPerms.size).toBe(2);
  });
  it('admin matrix is superset of operator matrix', () => {
    for (const p of PERMISSION_MATRIX.operator) {
      expect(PERMISSION_MATRIX.admin.has(p)).toBe(true);
    }
  });
  it('operator matrix is superset of viewer matrix', () => {
    for (const p of PERMISSION_MATRIX.viewer) {
      expect(PERMISSION_MATRIX.operator.has(p)).toBe(true);
    }
  });
  it('tenant:admin is exclusive to admin role', () => {
    expect(can('admin', Permission.TENANT_ADMIN, 'tenant-1')).toBe(true);
    expect(can('operator', Permission.TENANT_ADMIN, 'tenant-1')).toBe(false);
    expect(can('viewer', Permission.TENANT_ADMIN, 'tenant-1')).toBe(false);
  });
});
