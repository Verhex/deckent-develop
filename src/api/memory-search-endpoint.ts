// ─── Memory Search API Endpoint ──────────────────────────────────────────────
// GET /api/memory/search?q=<text> — FTS5 full-text search over memory.db
//
// Tenant scope. The caller's tenant is derived from the verified request
// principal (deriveRequestPrincipal — the same source ws-gateway/audit use) and
// narrows the FTS5 search via MemoryQueryParams.tenantId.
//
// TENANT-001 T4b (measured 2026-08-08): this was the WIDEST tenant leak in the
// product. Two layers were broken: (1) server.ts called this without `req`, so
// the principal was never derived and even a tenant-claimed caller saw ALL
// tenants; (2) a tenant-less caller omitted the predicate entirely and read
// across every tenant's memory. The fix is the same pattern the other T-series
// ingresses use — resolveApiCallerTenant: under strict isolation a tenant-less
// caller is refused (403), a tenant-claimed caller is scoped to its own tenant;
// with strict off the v1 tenant-less path stays byte-identical (operator parity).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStore } from '../core/memory-store.js';
import { searchMemory } from '../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
import { deriveRequestPrincipal } from './auth-me-endpoint.js';
import { resolveApiCallerTenant } from './tenant-scope.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

/**
 * Handle GET /api/memory/search?q=<query> — FTS5 memory search.
 * Returns true if the route was handled, false to let the caller try next route.
 *
 * `req` MUST be threaded from server.ts for tenant scope to derive from the verified
 * bearer (anti-IDOR, mirrors kpi-endpoint.ts / missions-route.ts). Omitted (the
 * default) → no tenant narrowing, the pre-609 tenant-less behavior.
 */
export function registerMemorySearch(
  url: string,
  res: ServerResponse,
  projectRoot: string,
  req?: IncomingMessage,
): boolean {
  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/memory/search') return false;

  const q = parsed.searchParams.get('q') ?? '';
  if (!q.trim()) {
    sendJson(res, []);
    return true;
  }

  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) {
    sendJson(res, []);
    return true;
  }

  // T4b: resolve the caller's effective tenant through the shared decision.
  // A null tenant means strict mode refused a tenant-less caller — answer 403
  // rather than folding into an all-tenant read.
  const principal = req ? deriveRequestPrincipal(req) : { id: 'local' };
  const scope = resolveApiCallerTenant(principal, projectRoot);
  if (scope.tenant === null) {
    sendJson(res, { error: scope.reason }, 403);
    return true;
  }
  // With strict OFF, a tenant-less caller resolves to 'local' and the pre-T4b
  // tenant-less read is preserved. A caller carrying a real tenant claim is
  // always scoped to it, in both modes.
  const tenantId = principal.tenantId;

  const store = new MemoryStore(dbPath);
  try {
    const results = searchMemory(store, {
      text: q,
      limit: 20,
      ...(tenantId !== undefined ? { tenantId } : {}),
    });
    sendJson(res, results);
  } finally {
    store.close();
  }
  return true;
}
