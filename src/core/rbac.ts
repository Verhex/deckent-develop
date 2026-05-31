// ═══ RBAC Role-Check ═════════════════════════════════════════════════════════
// F4 enterprise foundation — tenant-aware role/permission check (ROADMAP F4-001).
// Sprint 206 (206-008) skeleton. Sprint 208 (208-009): role hierarchy + extended PERMISSION_MATRIX.

import { isValidTenantId } from './tenant-context.js';

// ─── Types ────────────────────────────────────────────────────────

export type Role = 'admin' | 'operator' | 'viewer';

export const Permission = {
  READ: 'read',
  WRITE: 'write',
  EXECUTE: 'execute',
  ADMIN: 'admin',
  AUDIT: 'audit',
  SPRINT_READ: 'sprint:read',
  SPRINT_WRITE: 'sprint:write',
  AUDIT_READ: 'audit:read',
  FLOW_MANAGE: 'flow:manage',
  TENANT_ADMIN: 'tenant:admin',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

// ─── Role Hierarchy Level ─────────────────────────────────────────
// Hierarchy: admin (3) > operator (2) > viewer (1).
// Higher-level roles inherit all permissions from lower-level roles.

export const ROLE_LEVEL: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

// Own (non-inherited) permissions per role, in level order.
const OWN_PERMISSIONS: Record<Role, ReadonlyArray<Permission>> = {
  viewer: [Permission.READ, Permission.SPRINT_READ],
  operator: [Permission.WRITE, Permission.EXECUTE, Permission.SPRINT_WRITE, Permission.AUDIT_READ, Permission.FLOW_MANAGE],
  admin: [Permission.ADMIN, Permission.AUDIT, Permission.TENANT_ADMIN],
};

// ─── PERMISSION_MATRIX — effective permissions (with inheritance) ─
// Precomputed: each role's own permissions + all permissions from roles below it.
// viewer ⊆ operator ⊆ admin

export const PERMISSION_MATRIX: Record<Role, ReadonlySet<Permission>> = (() => {
  const ordered: Role[] = ['viewer', 'operator', 'admin'];
  const result = {} as Record<Role, ReadonlySet<Permission>>;
  const accumulated = new Set<Permission>();
  for (const role of ordered) {
    for (const p of OWN_PERMISSIONS[role]) accumulated.add(p);
    result[role] = new Set(accumulated);
  }
  return result;
})();

const VALID_ROLES = new Set<string>(['admin', 'operator', 'viewer']);

// ─── Public API ───────────────────────────────────────────────────

/** Returns true if the string is a known Role. */
export function isValidRole(role: string): role is Role {
  return VALID_ROLES.has(role);
}

/**
 * Check whether a role may perform an action within a tenant.
 * Hierarchy: admin > operator > viewer — higher roles inherit all lower-role permissions.
 *
 * Returns false when:
 * - tenantId fails format validation (path-unsafe IDs)
 * - role is not a known Role
 * - role does not have the requested permission (including inherited)
 */
export function can(role: string, action: Permission, tenantId: string): boolean {
  if (!isValidTenantId(tenantId)) return false;
  if (!isValidRole(role)) return false;
  return PERMISSION_MATRIX[role].has(action);
}
