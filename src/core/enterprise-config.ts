// ═══ Enterprise Config Schema ═════════════════════════════════════════════════
// F4 enterprise foundation — tenant, rbac, flow configuration (ROADMAP F4-001).
// Sprint 208 (208-012) — standalone module, does NOT touch config.ts.
// All fields opt-in with safe defaults (enabled: false).

import type { Role } from './rbac.js';
import { isValidRole } from './rbac.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenancyConfig {
  enabled: boolean;
}

export interface RbacConfig {
  enabled: boolean;
  defaultRole: Role;
}

export interface FlowConfig {
  maxConcurrent: number;
}

export interface EnterpriseConfig {
  tenancy: TenancyConfig;
  rbac: RbacConfig;
  flow: FlowConfig;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const ENTERPRISE_CONFIG_DEFAULTS: EnterpriseConfig = {
  tenancy: { enabled: false },
  rbac: { enabled: false, defaultRole: 'viewer' },
  flow: { maxConcurrent: 1 },
};

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateTenancy(raw: unknown): TenancyConfig {
  if (raw === undefined || raw === null) return { ...ENTERPRISE_CONFIG_DEFAULTS.tenancy };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('enterprise.tenancy must be an object');
  }
  const t = raw as Record<string, unknown>;
  const enabled = t['enabled'] !== undefined ? t['enabled'] : ENTERPRISE_CONFIG_DEFAULTS.tenancy.enabled;
  if (typeof enabled !== 'boolean') {
    throw new Error(`Invalid value '${enabled}' for field 'tenancy.enabled'. Must be boolean.`);
  }
  return { enabled };
}

function validateRbac(raw: unknown): RbacConfig {
  if (raw === undefined || raw === null) return { ...ENTERPRISE_CONFIG_DEFAULTS.rbac };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('enterprise.rbac must be an object');
  }
  const r = raw as Record<string, unknown>;
  const enabled = r['enabled'] !== undefined ? r['enabled'] : ENTERPRISE_CONFIG_DEFAULTS.rbac.enabled;
  if (typeof enabled !== 'boolean') {
    throw new Error(`Invalid value '${enabled}' for field 'rbac.enabled'. Must be boolean.`);
  }
  const defaultRole = r['defaultRole'] !== undefined ? r['defaultRole'] : ENTERPRISE_CONFIG_DEFAULTS.rbac.defaultRole;
  if (typeof defaultRole !== 'string' || !isValidRole(defaultRole)) {
    throw new Error(`Invalid value '${defaultRole}' for field 'rbac.defaultRole'. Must be one of: admin, operator, viewer.`);
  }
  return { enabled, defaultRole };
}

function validateFlow(raw: unknown): FlowConfig {
  if (raw === undefined || raw === null) return { ...ENTERPRISE_CONFIG_DEFAULTS.flow };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('enterprise.flow must be an object');
  }
  const f = raw as Record<string, unknown>;
  const maxConcurrent = f['maxConcurrent'] !== undefined ? f['maxConcurrent'] : ENTERPRISE_CONFIG_DEFAULTS.flow.maxConcurrent;
  if (typeof maxConcurrent !== 'number' || !Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error(`Invalid value '${maxConcurrent}' for field 'flow.maxConcurrent'. Must be an integer >= 1.`);
  }
  return { maxConcurrent };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse and validate an enterprise config object from raw user input.
 * Returns a fully-populated EnterpriseConfig with safe defaults for missing fields.
 * Throws on invalid field values.
 */
export function parseEnterpriseConfig(raw: unknown): EnterpriseConfig {
  if (raw === undefined || raw === null) return { ...ENTERPRISE_CONFIG_DEFAULTS, rbac: { ...ENTERPRISE_CONFIG_DEFAULTS.rbac }, flow: { ...ENTERPRISE_CONFIG_DEFAULTS.flow }, tenancy: { ...ENTERPRISE_CONFIG_DEFAULTS.tenancy } };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Enterprise config must be an object');
  }
  const obj = raw as Record<string, unknown>;
  return {
    tenancy: validateTenancy(obj['tenancy']),
    rbac: validateRbac(obj['rbac']),
    flow: validateFlow(obj['flow']),
  };
}

/**
 * Deep-merge two EnterpriseConfig objects.
 * Fields present in `override` replace those in `base`; absent fields keep the base value.
 */
export function mergeEnterpriseConfig(
  base: EnterpriseConfig,
  override: Partial<EnterpriseConfig>,
): EnterpriseConfig {
  return {
    tenancy: { ...base.tenancy, ...(override.tenancy ?? {}) },
    rbac: { ...base.rbac, ...(override.rbac ?? {}) },
    flow: { ...base.flow, ...(override.flow ?? {}) },
  };
}
