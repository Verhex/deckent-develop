import { join } from 'node:path';

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
