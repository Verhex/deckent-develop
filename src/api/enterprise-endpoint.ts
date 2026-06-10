// enterprise-endpoint.ts — HTTP routes for the dashboard EnterprisePage (Sprint 269 B-Enterprise).
// GET /api/enterprise/tenants → TenantInfo[]   (config `tenants` list ∪ .deckent/tenants/* dirs)
// GET /api/enterprise/rbac    → RbacRole[]     (core/rbac.ts PERMISSION_MATRIX — role matrix SSOT)
// GET /api/enterprise/audit   → AuditEntry[]   (core/audit-query.ts readAuditEvents/queryAudit SSOT)
// GET /api/enterprise/rate    → RateLimitInfo[] (live RateLimiter snapshot)
//
// Response shapes mirror src/dashboard/src/pages/EnterprisePage.tsx:10-37 exactly.
// Missing data returns an empty array with 200 (never 404/500) — the page
// renders its EmptyState. Register pattern follows nervous-endpoint.ts.

import type { ServerResponse } from 'node:http';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonSafe } from '../core/utils.js';
import { PROJECT_CONFIG_PATH } from '../core/constants.js';
import { PERMISSION_MATRIX, type Role } from '../core/rbac.js';
import { isValidTenantId } from '../core/tenant-context.js';
import { readAuditEvents, queryAudit } from '../core/audit-query.js';
import type { AuditEventPayload } from '../core/audit-writer.js';

// ─── Dashboard contract shapes (EnterprisePage.tsx) ─────────────────

interface TenantInfo {
  id: string;
  name: string;
  status: string;
  users: number;
  createdAt: string;
}

interface RbacRole {
  role: Role;
  permissions: string[];
}

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  resource: string;
  timestamp: string;
  result: 'success' | 'denied';
}

interface RateLimitInfo {
  endpoint: string;
  limit: number;
  remaining: number;
  resetAt: string;
}

/** Live rate-limiter state provider — server.ts passes its RateLimiter. */
export interface EnterpriseRouteDeps {
  rateLimiter?: {
    snapshot(): Array<{ key: string; count: number; resetAt: number; limit: number }>;
  };
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── Tenants ─────────────────────────────────────────────────────────

/** Read tenant list: config `tenants` entries first, then .deckent/tenants/* dirs. */
function listTenants(projectRoot: string): TenantInfo[] {
  const seen = new Set<string>();
  const tenants: TenantInfo[] = [];

  // Config-declared tenants (strings or { id, name?, status?, users? } objects).
  const rawCfg = readJsonSafe<Record<string, unknown>>(join(projectRoot, PROJECT_CONFIG_PATH));
  const cfgTenants = rawCfg?.['tenants'];
  if (Array.isArray(cfgTenants)) {
    for (const entry of cfgTenants) {
      if (typeof entry === 'string' && entry.length > 0) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        tenants.push({ id: entry, name: entry, status: 'active', users: 0, createdAt: '' });
      } else if (entry !== null && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const id = typeof obj['id'] === 'string' ? obj['id'] : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        tenants.push({
          id,
          name: typeof obj['name'] === 'string' ? obj['name'] : id,
          status: typeof obj['status'] === 'string' ? obj['status'] : 'active',
          users: typeof obj['users'] === 'number' ? obj['users'] : 0,
          createdAt: typeof obj['createdAt'] === 'string' ? obj['createdAt'] : '',
        });
      }
    }
  }

  // Filesystem tenants — .deckent/tenants/<id>/ isolation roots (tenant-context.ts).
  const tenantsDir = join(projectRoot, '.deckent', 'tenants');
  if (existsSync(tenantsDir)) {
    try {
      for (const name of readdirSync(tenantsDir)) {
        if (!isValidTenantId(name) || seen.has(name)) continue;
        const dirPath = join(tenantsDir, name);
        let createdAt = '';
        try {
          const st = statSync(dirPath);
          if (!st.isDirectory()) continue;
          createdAt = st.birthtime.toISOString();
        } catch { continue; }
        seen.add(name);
        tenants.push({ id: name, name, status: 'active', users: 0, createdAt });
      }
    } catch { /* unreadable dir → fall through with what we have */ }
  }

  return tenants;
}

// ─── RBAC ────────────────────────────────────────────────────────────

/** Role matrix from core/rbac.ts — effective (inherited) permissions per role. */
function listRbacRoles(): RbacRole[] {
  return (Object.keys(PERMISSION_MATRIX) as Role[]).map((role) => ({
    role,
    permissions: [...PERMISSION_MATRIX[role]],
  }));
}

// ─── Audit ───────────────────────────────────────────────────────────

/** Latest sprint id with an event stream file (.deckent/<sprintId>-events.jsonl). */
function latestEventSprintId(projectRoot: string): string | null {
  const deckentDir = join(projectRoot, '.deckent');
  if (!existsSync(deckentDir)) return null;
  try {
    const ids = readdirSync(deckentDir)
      .filter((f) => f.endsWith('-events.jsonl'))
      .map((f) => f.slice(0, -'-events.jsonl'.length))
      .sort();
    return ids.at(-1) ?? null;
  } catch {
    return null;
  }
}

function toAuditEntry(p: AuditEventPayload, index: number): AuditEntry {
  return {
    id: p.hmac ?? `${p.timestamp}-${index}`,
    action: p.action,
    actor: p.actor,
    resource: p.target ?? '',
    timestamp: p.timestamp,
    result: p.action === 'access:denied' ? 'denied' : 'success',
  };
}

/** Last N audit events, optional `?sprint=` + `?channel=` + `?limit=` filters. */
function listAuditEntries(projectRoot: string, params: URLSearchParams): AuditEntry[] {
  const sprintId = params.get('sprint') ?? latestEventSprintId(projectRoot);
  if (!sprintId) return [];

  const rawLimit = Number(params.get('limit') ?? '50');
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 50;

  const channel = params.get('channel');
  let payloads: AuditEventPayload[];
  if (channel) {
    // Channel-filtered view rides the queryAudit SSOT (exact channel match).
    payloads = queryAudit(projectRoot, sprintId, { channel })
      .matched.map((e) => e.payload as AuditEventPayload);
  } else {
    payloads = readAuditEvents(projectRoot, sprintId);
  }

  return payloads
    .map((p, i) => toAuditEntry(p, i))
    .slice(-limit);
}

// ─── Rate ────────────────────────────────────────────────────────────

function listRateLimits(deps: EnterpriseRouteDeps): RateLimitInfo[] {
  const snapshot = deps.rateLimiter?.snapshot() ?? [];
  return snapshot.map((entry) => ({
    endpoint: `/api/* [${entry.key}]`,
    limit: entry.limit,
    remaining: Math.max(0, entry.limit - entry.count),
    resetAt: new Date(entry.resetAt).toISOString(),
  }));
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Handle enterprise HTTP routes. Returns true when the route matched (and a
 * response was sent), false otherwise so the caller can fall through.
 * All routes are GET-only and auth-gated by the caller's bearer middleware.
 */
export function registerEnterpriseRoutes(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
  deps: EnterpriseRouteDeps = {},
): boolean {
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname;
  if (!path.startsWith('/api/enterprise/')) return false;
  if (method !== 'GET') return false;

  if (path === '/api/enterprise/tenants') {
    sendJson(res, listTenants(projectRoot));
    return true;
  }

  if (path === '/api/enterprise/rbac') {
    sendJson(res, listRbacRoles());
    return true;
  }

  if (path === '/api/enterprise/audit') {
    sendJson(res, listAuditEntries(projectRoot, parsed.searchParams));
    return true;
  }

  if (path === '/api/enterprise/rate') {
    sendJson(res, listRateLimits(deps));
    return true;
  }

  return false;
}
