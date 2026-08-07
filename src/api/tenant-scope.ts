// ═══ API tenant scope (TENANT-001 T2) ══════════════════════════════════════
// One place where an API surface answers "which tenant is this caller acting
// within?". T1 wired the run-flow propose ingress; the same NULL-tenant default
// still sat in the missions and autonomous ingresses, so this module carries the
// decision to every one of them instead of each route re-deriving it.
//
// Why a sync flag reader lives here and not in core/principal.ts: that module is
// deliberately config-loader-free (the P1b contract — no hidden policy reads).
// These routes are synchronous, so they cannot await loadConfig; a fail-soft
// sync read keeps the decision local, explicit and honest — an unreadable or
// absent config means the permissive default, never an accidental hard-deny.
//
// T4a correction. The first version of this reader looked only at the project
// config file, while loadConfig merges defaults → GLOBAL → project. An operator
// who enabled strict isolation in the global (fleet/host) config therefore got
// an API layer that reported the control as on and gated nothing — the same
// "reported-but-not-enforcing control" class already closed twice
// (enforce_principal_assurance carry, strict_tenant_isolation read only by the
// compliance report). The reader now walks the SAME layer chain, and the global
// path is resolved through core/config's cross-platform helper rather than a
// hand-built home-directory guess, so Windows/WSL hosts resolve it too.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveGlobalConfigReadPath } from '../core/global-scope-resolver.js';
import { resolveCallerTenant, TenantScopeError } from '../core/principal.js';

/** Fail-soft sync read of one config file's `strict_tenant_isolation` value. */
function readFlagFrom(path: string): boolean | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      readonly strict_tenant_isolation?: unknown;
    };
    return typeof parsed.strict_tenant_isolation === 'boolean'
      ? parsed.strict_tenant_isolation
      : undefined;
  } catch {
    // A malformed config must not silently harden OR weaken the gate: it is
    // treated as "this layer says nothing", so the next layer (or the
    // permissive v1 default) decides.
    return undefined;
  }
}

/**
 * Effective `strict_tenant_isolation`, resolved over loadConfig's layer chain:
 * defaults (false) → global → project, with the nearer layer winning.
 */
export function readStrictTenantIsolation(projectRoot: string): boolean {
  const project = readFlagFrom(join(projectRoot, '.deckent', 'config.json'));
  if (project !== undefined) return project;
  const global = readFlagFrom(resolveGlobalConfigReadPath());
  if (global !== undefined) return global;
  return false;
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
