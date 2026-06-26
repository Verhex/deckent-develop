// ═══ RBAC Role-Check ═════════════════════════════════════════════════════════
// F4 enterprise foundation — tenant-aware role/permission check (ROADMAP F4-001).
// Sprint 206 (206-008) skeleton. Sprint 208 (208-009): role hierarchy + extended PERMISSION_MATRIX.
// Sprint 209 (209-012): audit-trail on denial via writeAuditEvent.

import { isValidTenantId } from './tenant-context.js';
import { writeAuditEvent } from './audit-writer.js';

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

// ─── Audit Context ────────────────────────────────────────────────

/** Optional audit context passed to can() — enables denial audit-trail. */
export interface AuditContext {
  actor: string;
  projectRoot: string;
  sprintId: string;
  target?: string;
}

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
 *
 * When auditCtx is provided and the check is denied, an 'access:denied' audit event
 * is written via writeAuditEvent() for enterprise audit-trail (ADR-037).
 */
export function can(
  role: string,
  action: Permission,
  tenantId: string,
  auditCtx?: AuditContext,
): boolean {
  const allowed =
    isValidTenantId(tenantId) &&
    isValidRole(role) &&
    PERMISSION_MATRIX[role].has(action);

  if (!allowed && auditCtx !== undefined) {
    writeAuditEvent(auditCtx.projectRoot, auditCtx.sprintId, {
      tenantId: tenantId || 'unknown',
      actor: auditCtx.actor,
      action: 'access:denied',
      target: auditCtx.target ?? action,
    });
  }

  return allowed;
}

/**
 * Runtime enforcement gate — checks RBAC only when `rbacConfig.enabled` is true.
 * When RBAC is disabled (default), this is a NO_OP that always returns true (backward-compatible).
 * Intended for wiring into sprint/flow entry points without breaking non-enterprise setups.
 *
 * Usage: `if (!enforceRbac(role, action, tenantId, config.enterprise?.rbac)) throw ...`
 */
export function enforceRbac(
  role: string,
  action: Permission,
  tenantId: string,
  rbacConfig?: { enabled: boolean },
): boolean {
  // NO_OP bypass when rbac.enabled is false or config not provided
  if (!rbacConfig?.enabled) return true;
  return can(role, action, tenantId);
}

// ─── Resource:action permission check (connector-surface RBAC) ────
// Principals carry a permission set of `resource:action` tokens (e.g. 'order:read'),
// resolved from a role-map (see connectors/identity/role-map.ts). Supports wildcards:
//   '*'        → all permissions
//   '<res>:*'  → any action on a resource
//   '*:<act>'  → an action on any resource
// Empty set denies (fail-closed). Used by the connector-surface tool-gate (ADR-092).
export function principalCan(permissions: readonly string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  const idx = required.indexOf(':');
  if (idx < 0) return false;
  const res = required.slice(0, idx);
  const act = required.slice(idx + 1);
  return permissions.includes(`${res}:*`) || permissions.includes(`*:${act}`);
}
