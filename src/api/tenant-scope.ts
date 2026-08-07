// ═══ API tenant scope (TENANT-001 T2) ══════════════════════════════════════
// One place where an API surface answers "which tenant is this caller acting
// within?". T1 wired the run-flow propose ingress; the same NULL-tenant default
// still sat in the missions and autonomous ingresses, so this module carries the
// decision to every one of them instead of each route re-deriving it.
//
// Why a sync flag reader lives here and not in core/principal.ts: that module is
// deliberately config-loader-free (the P1b contract — no hidden policy reads).
// These routes are synchronous, so they cannot await loadConfig; a fail-soft
// sync read of the project's own config file keeps the decision local, explicit
// and honest — an unreadable or absent config means the permissive default,
// never an accidental hard-deny.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCallerTenant, TenantScopeError } from '../core/principal.js';

/** Read `strict_tenant_isolation` from the project config. Fail-soft: false. */
export function readStrictTenantIsolation(projectRoot: string): boolean {
  const path = join(projectRoot, '.deckent', 'config.json');
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      readonly strict_tenant_isolation?: unknown;
    };
    return parsed.strict_tenant_isolation === true;
  } catch {
    // A malformed config must not silently harden or weaken the gate; the
    // permissive default is the documented v1 behaviour.
    return false;
  }
}

/**
 * Resolve the caller's tenant for an API route.
 * Returns the tenant, or `null` when strict mode refuses a tenant-less caller —
 * routes answer 403 on `null` rather than folding the caller into `local`.
 */
export function resolveApiCallerTenant(
  principal: { readonly id: string; readonly tenantId?: string },
  projectRoot: string,
): { readonly tenant: string } | { readonly tenant: null; readonly reason: string } {
  try {
    return { tenant: resolveCallerTenant(principal, readStrictTenantIsolation(projectRoot)) };
  } catch (error) {
    if (error instanceof TenantScopeError) return { tenant: null, reason: error.message };
    throw error;
  }
}
