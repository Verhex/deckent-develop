// src/connectors/identity/role-map.ts
import type { Role } from '../../core/rbac.js';

export interface RoleMapEntry { role: Role; permissions?: string[] }
export type RoleMap = Record<string, RoleMapEntry>;

/**
 * Built-in permission baselines per role (used when role-map provides no explicit set).
 * admin → all; operator → read+write on any resource; viewer → read on any resource.
 * Config role-map narrows these to specific resources (e.g. operator → only order:*).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ['*'],
  operator: ['*:read', '*:write'],
  viewer: ['*:read'],
};

/**
 * Resolve a principal's `resource:action` permission set.
 * Precedence: roleMap[groupKey].permissions → roleMap[role].permissions → built-in default.
 * groupKey carries an external directory group (e.g. an Entra group) when present.
 */
export function resolvePermissions(role: Role, roleMap?: RoleMap, groupKey?: string): string[] {
  if (groupKey && roleMap?.[groupKey]?.permissions) return roleMap[groupKey]!.permissions!;
  if (roleMap?.[role]?.permissions) return roleMap[role]!.permissions!;
  return DEFAULT_ROLE_PERMISSIONS[role];
}
