// ─── Memory Search API Endpoint ──────────────────────────────────────────────
// GET /api/memory/search?q=<text> — FTS5 full-text search over memory.db
//
// Tenant scope (born-609): when `req` is threaded, the caller's tenant is derived
// from the verified request principal (deriveRequestPrincipal — the same resolution
// source ws-gateway/audit already use, never reinvented) and narrows the search via
// MemoryQueryParams.tenantId. No principal / no tenant claim → the legacy tenant-less
// path (unchanged, unfiltered — single-tenant/operator parity).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStore } from '../core/memory-store.js';
import { searchMemory } from '../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
import { deriveRequestPrincipal } from './auth-me-endpoint.js';

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

  const tenantId = req ? deriveRequestPrincipal(req).tenantId : undefined;

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
