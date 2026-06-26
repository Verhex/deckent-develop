// tests/connectors/identity/role-map.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePermissions, DEFAULT_ROLE_PERMISSIONS } from '../../../src/connectors/identity/role-map.js';

describe('resolvePermissions', () => {
  it('falls back to built-in defaults when no role-map', () => {
    expect(resolvePermissions('admin')).toEqual(['*']);
    expect(resolvePermissions('operator')).toEqual(['*:read', '*:write']);
    expect(resolvePermissions('viewer')).toEqual(['*:read']);
  });
  it('uses role-map entry by role key', () => {
    const rm = { operator: { role: 'operator' as const, permissions: ['order:read', 'order:write'] } };
    expect(resolvePermissions('operator', rm)).toEqual(['order:read', 'order:write']);
  });
  it('prefers explicit groupKey entry over role entry', () => {
    const rm = {
      operator: { role: 'operator' as const, permissions: ['*:read'] },
      'Sales-Ops': { role: 'operator' as const, permissions: ['order:read', 'order:write'] },
    };
    expect(resolvePermissions('operator', rm, 'Sales-Ops')).toEqual(['order:read', 'order:write']);
  });
  it('DEFAULT_ROLE_PERMISSIONS covers all three roles', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(['admin', 'operator', 'viewer']);
  });
});
