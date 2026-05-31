import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Tenant isolation context for F3 process mode. */
export interface TenantContext {
  tenantId: string;
  isolationRoot: string;
  createdAt: string;
}

const TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Validate that a tenant ID is a safe path segment.
 * Returns false for IDs that would escape the isolation root.
 */
export function isValidTenantId(id: string): boolean {
  return TENANT_ID_RE.test(id);
}

/**
 * Returns the isolation directory for a given tenant ID under the project root.
 * Path: <projectRoot>/.deckent/tenants/<tenantId>/
 */
export function tenantIsolationPath(projectRoot: string, tenantId: string): string {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenantId "${tenantId}": must match ${TENANT_ID_RE.source}`);
  }
  return join(projectRoot, '.deckent', 'tenants', tenantId);
}

/**
 * Resolve the active TenantContext.
 * Priority: DECKENT_TENANT_ID env var → config value → 'local' default.
 */
export function resolveTenant(
  projectRoot: string,
  opts?: { tenantId?: string },
): TenantContext {
  const tenantId =
    opts?.tenantId ??
    process.env['DECKENT_TENANT_ID'] ??
    'local';

  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenantId "${tenantId}": must match ${TENANT_ID_RE.source}`);
  }

  return {
    tenantId,
    isolationRoot: tenantIsolationPath(projectRoot, tenantId),
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Runtime context — async-scoped tenant identity
// ---------------------------------------------------------------------------

const _tenantStore = new AsyncLocalStorage<TenantContext>();

/**
 * Run `fn` in a tenant-scoped async context.
 * Any call to currentTenant() or tenantPath() inside fn (and its callees)
 * will return context for `tenantId`.
 */
export function withTenant<T>(
  tenantId: string,
  projectRoot: string,
  fn: () => T,
): T {
  const ctx = resolveTenant(projectRoot, { tenantId });
  return _tenantStore.run(ctx, fn);
}

/**
 * Returns the TenantContext active in the current async scope.
 * Falls back to the 'local' tenant resolved against the process cwd
 * when called outside a withTenant() scope.
 */
export function currentTenant(projectRoot = process.cwd()): TenantContext {
  return _tenantStore.getStore() ?? resolveTenant(projectRoot);
}

/**
 * Resolve a relative path under the current tenant's isolation root.
 * Example: tenantPath('flows/my-flow.json') →
 *   <isolationRoot>/flows/my-flow.json
 */
export function tenantPath(relativePath: string, projectRoot?: string): string {
  const ctx = currentTenant(projectRoot);
  return join(ctx.isolationRoot, relativePath);
}
