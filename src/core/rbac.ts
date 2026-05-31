// ═══ RBAC Role-Check Skeleton ════════════════════════════════════════════════
// F4 enterprise foundation — tenant-aware role/permission check (ROADMAP F4-001).
// Sprint 206 (206-008) — skeleton only: role matrix + can() check, no auth/session.

import { isValidTenantId } from './tenant-context.js';

// ─── Types ────────────────────────────────────────────────────────

export type Role = 'admin' | 'operator' | 'viewer';

export const Permission = {
  READ: 'read',
  WRITE: 'write',
  EXECUTE: 'execute',
  ADMIN: 'admin',
  AUDIT: 'audit',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

// ─── Role → Permission Matrix ─────────────────────────────────────

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set([
    Permission.READ,
    Permission.WRITE,
    Permission.EXECUTE,
    Permission.ADMIN,
    Permission.AUDIT,
  ]),
  operator: new Set([Permission.READ, Permission.WRITE, Permission.EXECUTE]),
  viewer: new Set([Permission.READ]),
};

const VALID_ROLES = new Set<string>(['admin', 'operator', 'viewer']);

// ─── Public API ───────────────────────────────────────────────────

/** Returns true if the string is a known Role. */
export function isValidRole(role: string): role is Role {
  return VALID_ROLES.has(role);
}

/**
 * Check whether a role may perform an action within a tenant.
 *
 * Returns false when:
 * - tenantId fails format validation (path-unsafe IDs)
 * - role is not a known Role
 * - role does not have the requested permission
 *
 * @param role     - Caller's role (runtime-validated)
 * @param action   - Requested permission
 * @param tenantId - Tenant scope for the check
 */
export function can(role: string, action: Permission, tenantId: string): boolean {
  if (!isValidTenantId(tenantId)) return false;
  if (!isValidRole(role)) return false;
  return ROLE_PERMISSIONS[role].has(action);
}
