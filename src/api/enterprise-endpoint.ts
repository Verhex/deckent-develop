// enterprise-endpoint.ts — HTTP routes for the dashboard EnterprisePage (Sprint 269 B-Enterprise).
// GET /api/enterprise/tenants → TenantInfo[]   (config `tenants` list ∪ .deckent/tenants/* dirs)
// GET /api/enterprise/rbac    → RbacRole[]     (core/rbac.ts PERMISSION_MATRIX — role matrix SSOT)
// GET /api/enterprise/audit   → AuditEntry[]   (core/audit-query.ts readAuditEvents/queryAudit SSOT)
// GET /api/enterprise/rate    → RateLimitInfo[] (live RateLimiter snapshot)
//
// Response shapes mirror src/dashboard/src/pages/EnterprisePage.tsx:10-37 exactly.
// Missing data returns an empty array with 200 (never 404/500) — the page
// renders its EmptyState. Register pattern follows nervous-endpoint.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { readJsonSafe } from '../core/utils.js';
import { parseOidcClaims } from '../core/auth-oidc.js';
import { writeAuditEvent } from '../core/audit-writer.js';
import { PROJECT_CONFIG_PATH, RECENT_WORKS_DIR } from '../core/constants.js';
import { PERMISSION_MATRIX, isValidRole, type Role } from '../core/rbac.js';
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

/**
 * Resolve the audit actor from the request bearer token.
 * JWT bearer → claims.sub ?? claims.preferred_username.
 * Static/opaque token or no bearer → 'local' (fallback for backward compat).
 */
function resolveAuditActor(req?: IncomingMessage): string {
  if (!req) return 'local';
  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string') return 'local';
  const spaceIdx = authHeader.indexOf(' ');
  if (spaceIdx < 0 || authHeader.slice(0, spaceIdx) !== 'Bearer') return 'local';
  const token = authHeader.slice(spaceIdx + 1).trim();
  if (!token) return 'local';
  const claims = parseOidcClaims(token);
  if (claims === null) return 'local';
  if (typeof claims.sub === 'string' && claims.sub) return claims.sub;
  const pref = claims['preferred_username'];
  if (typeof pref === 'string' && pref) return pref;
  return 'local';
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

/** Latest sprint id with an event stream file (.deckent/recently-works/<sprintId>-events.jsonl). */
function latestEventSprintId(projectRoot: string): string | null {
  const deckentDir = join(projectRoot, RECENT_WORKS_DIR);
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
  req?: IncomingMessage,
): boolean {
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname;
  if (!path.startsWith('/api/enterprise/')) return false;
  if (method !== 'GET') return false;

  const actor = resolveAuditActor(req);
  const sprintId = latestEventSprintId(projectRoot);

  if (path === '/api/enterprise/tenants') {
    const data = listTenants(projectRoot);
    if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:tenants:read' });
    sendJson(res, data);
    return true;
  }

  if (path === '/api/enterprise/rbac') {
    const roles = listRbacRoles();
    if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:rbac:read' });
    sendJson(res, roles);
    return true;
  }

  if (path === '/api/enterprise/audit') {
    // Read before write so the access-record event does not appear in this response.
    const entries = listAuditEntries(projectRoot, parsed.searchParams);
    if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:audit:read' });
    sendJson(res, entries);
    return true;
  }

  if (path === '/api/enterprise/rate') {
    const rateData = listRateLimits(deps);
    if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:rate:read' });
    sendJson(res, rateData);
    return true;
  }

  return false;
}

// ─── Tenant mutations — POST / PUT / DELETE (282-010, DASH-UX-6) ───────
//
// Admin-only writes for the dashboard Tenants tab. Tenants are persisted in the
// declarative `tenants` array of .deckent/config.json (the same list listTenants
// reads first). Filesystem isolation roots (.deckent/tenants/<id>/) are NOT
// mutated here — they are read-only isolation boundaries (tenant-context.ts);
// a DELETE for an id that exists only as an FS dir returns 404.

interface TenantRecord {
  id: string;
  name: string;
  status: string;
  users: number;
  createdAt: string;
}

const TENANT_STATUSES = ['active', 'suspended', 'inactive'] as const;

// Zod input validation (mevcut Zod-pattern — server.ts StartSchema). `.strict()`
// rejects unknown fields so the write surface stays exactly { id,name,status,users }.
const TenantCreateSchema = z
  .object({
    id: z.string().min(1).max(63).refine(isValidTenantId, {
      message: 'id must match ^[a-z0-9][a-z0-9-]{0,62}$',
    }),
    name: z.string().min(1).max(120),
    status: z.enum(TENANT_STATUSES).optional(),
    users: z.number().int().nonnegative().optional(),
  })
  .strict();

const TenantUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    status: z.enum(TENANT_STATUSES).optional(),
    users: z.number().int().nonnegative().optional(),
  })
  .strict();

/** Extract the raw Bearer value from the Authorization header (null if absent/malformed). */
function extractBearer(req?: IncomingMessage): string | null {
  const header = req?.headers['authorization'];
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ', 2);
  if (scheme !== 'Bearer' || value === undefined || value === '') return null;
  return value;
}

/** Derive a Role from raw JWT claim values (mirrors auth-me-endpoint.ts). */
function roleFromClaims(claims: Record<string, unknown>): Role | null {
  const candidates = [claims['role'], claims['roles'], claims['https://deckent.io/role']];
  for (const c of candidates) {
    if (typeof c === 'string' && isValidRole(c)) return c;
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string' && isValidRole(item)) return item;
      }
    }
  }
  return null;
}

interface AdminDecision {
  authorized: boolean;
  actor: string;
}

/**
 * Authorize a tenant mutation — admin only (ADR-069/071 role-claim).
 * - Static / opaque bearer (non-JWT) → authorized as the local owner ('local'),
 *   matching the existing convention (auth-me mode:'static' = "local full access").
 * - OIDC JWT with role 'admin' → authorized (actor = sub / preferred_username).
 * - OIDC JWT without the admin role → denied; an access:denied audit event is
 *   written for the enterprise audit-trail (fail-secure).
 * - No bearer (should be unreachable — auth-gate blocks it) → denied.
 */
function authorizeTenantAdmin(
  req: IncomingMessage | undefined,
  projectRoot: string,
  sprintId: string | null,
  target: string,
): AdminDecision {
  const actor = resolveAuditActor(req);
  const bearer = extractBearer(req);
  if (!bearer) return { authorized: false, actor };

  const claims = parseOidcClaims(bearer);
  if (claims === null) {
    // Static / opaque token — owner's root token, full access (existing convention).
    return { authorized: true, actor };
  }

  const role = roleFromClaims(claims as Record<string, unknown>);
  if (role === 'admin') return { authorized: true, actor };

  if (sprintId) {
    writeAuditEvent(projectRoot, sprintId, {
      tenantId: 'local',
      actor,
      action: 'access:denied',
      target,
    });
  }
  return { authorized: false, actor };
}

function configPath(projectRoot: string): string {
  return join(projectRoot, PROJECT_CONFIG_PATH);
}

/** Read the raw project config object (empty object when absent/unreadable). */
function readRawConfig(projectRoot: string): Record<string, unknown> {
  return readJsonSafe<Record<string, unknown>>(configPath(projectRoot)) ?? {};
}

/** Persist the raw project config object (creates .deckent/ if needed). */
function writeRawConfig(projectRoot: string, cfg: Record<string, unknown>): void {
  const path = configPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

/** The config `tenants` array as a mutable list (preserves existing string/object entries). */
function tenantArray(cfg: Record<string, unknown>): unknown[] {
  const raw = cfg['tenants'];
  return Array.isArray(raw) ? [...raw] : [];
}

/** The id of a config tenant entry (string entry → itself; object entry → .id). */
function tenantEntryId(entry: unknown): string | null {
  if (typeof entry === 'string') return entry || null;
  if (entry !== null && typeof entry === 'object') {
    const id = (entry as Record<string, unknown>)['id'];
    return typeof id === 'string' && id ? id : null;
  }
  return null;
}

/** Normalize any config tenant entry into a full TenantRecord. */
function normalizeTenant(entry: unknown, id: string): TenantRecord {
  if (entry === null || typeof entry !== 'object') {
    return { id, name: id, status: 'active', users: 0, createdAt: '' };
  }
  const o = entry as Record<string, unknown>;
  return {
    id,
    name: typeof o['name'] === 'string' ? o['name'] : id,
    status: typeof o['status'] === 'string' ? o['status'] : 'active',
    users: typeof o['users'] === 'number' ? o['users'] : 0,
    createdAt: typeof o['createdAt'] === 'string' ? o['createdAt'] : '',
  };
}

function sendValidationError(res: ServerResponse, err: z.ZodError): void {
  sendJson(
    res,
    {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid tenant payload',
        details: err.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
      },
    },
    400,
  );
}

function sendApiError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, { error: { code, message } }, status);
}

/** Parse `/api/enterprise/tenants/:id` → decoded id, or null for the collection path. */
function tenantIdFromPath(path: string): string | null {
  const prefix = '/api/enterprise/tenants/';
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes('/')) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/**
 * Handle tenant write routes: POST (create), PUT (update), DELETE.
 * Returns true when the route matched (and a response was sent), false to fall
 * through. Admin-RBAC gated; every mutation is audit-logged. The caller must
 * have already parsed the JSON `body` (POST/PUT) and passed the request for
 * auth-context derivation.
 */
export async function handleEnterpriseTenantWrite(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
  body: unknown,
  req?: IncomingMessage,
): Promise<boolean> {
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname;
  if (path !== '/api/enterprise/tenants' && !path.startsWith('/api/enterprise/tenants/')) return false;
  if (method !== 'POST' && method !== 'PUT' && method !== 'DELETE') return false;

  const sprintId = latestEventSprintId(projectRoot);
  const decision = authorizeTenantAdmin(req, projectRoot, sprintId, `tenant:${method.toLowerCase()}`);
  if (!decision.authorized) {
    sendApiError(res, 403, 'FORBIDDEN', 'admin role required for tenant management');
    return true;
  }
  const actor = decision.actor;

  // ── CREATE ──────────────────────────────────────────────────────────
  if (method === 'POST') {
    if (path !== '/api/enterprise/tenants') {
      sendApiError(res, 404, 'NOT_FOUND', 'unknown tenant route');
      return true;
    }
    const result = TenantCreateSchema.safeParse(body);
    if (!result.success) {
      sendValidationError(res, result.error);
      return true;
    }
    const input = result.data;
    const cfg = readRawConfig(projectRoot);
    const tenants = tenantArray(cfg);
    if (tenants.some((e) => tenantEntryId(e) === input.id)) {
      sendApiError(res, 409, 'CONFLICT', `tenant '${input.id}' already exists`);
      return true;
    }
    const record: TenantRecord = {
      id: input.id,
      name: input.name,
      status: input.status ?? 'active',
      users: input.users ?? 0,
      createdAt: new Date().toISOString(),
    };
    tenants.push(record);
    cfg['tenants'] = tenants;
    writeRawConfig(projectRoot, cfg);
    if (sprintId) {
      writeAuditEvent(projectRoot, sprintId, {
        tenantId: input.id,
        actor,
        action: 'enterprise:tenants:create',
        target: input.id,
      });
    }
    sendJson(res, record, 201);
    return true;
  }

  // ── UPDATE / DELETE need an :id ──────────────────────────────────────
  const id = tenantIdFromPath(path);
  if (!id) {
    sendApiError(res, 400, 'BAD_REQUEST', 'tenant id required in path');
    return true;
  }
  if (!isValidTenantId(id)) {
    sendApiError(res, 400, 'BAD_REQUEST', 'invalid tenant id');
    return true;
  }

  const cfg = readRawConfig(projectRoot);
  const tenants = tenantArray(cfg);
  const idx = tenants.findIndex((e) => tenantEntryId(e) === id);

  // ── UPDATE ──────────────────────────────────────────────────────────
  if (method === 'PUT') {
    const result = TenantUpdateSchema.safeParse(body);
    if (!result.success) {
      sendValidationError(res, result.error);
      return true;
    }
    if (idx < 0) {
      sendApiError(res, 404, 'NOT_FOUND', `tenant '${id}' not found`);
      return true;
    }
    const current = normalizeTenant(tenants[idx], id);
    const patch = result.data;
    const updated: TenantRecord = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.users !== undefined ? { users: patch.users } : {}),
      id,
    };
    tenants[idx] = updated;
    cfg['tenants'] = tenants;
    writeRawConfig(projectRoot, cfg);
    if (sprintId) {
      writeAuditEvent(projectRoot, sprintId, {
        tenantId: id,
        actor,
        action: 'enterprise:tenants:update',
        target: id,
      });
    }
    sendJson(res, updated, 200);
    return true;
  }

  // ── DELETE ──────────────────────────────────────────────────────────
  if (idx < 0) {
    sendApiError(res, 404, 'NOT_FOUND', `tenant '${id}' not found`);
    return true;
  }
  tenants.splice(idx, 1);
  cfg['tenants'] = tenants;
  writeRawConfig(projectRoot, cfg);
  if (sprintId) {
    writeAuditEvent(projectRoot, sprintId, {
      tenantId: id,
      actor,
      action: 'enterprise:tenants:delete',
      target: id,
    });
  }
  sendJson(res, { ok: true, id }, 200);
  return true;
}

// ─── RBAC role mutations — POST / PUT / DELETE (DASH-UX-6) ──────────────────
//
// Admin-only writes for RBAC custom roles. Persisted in config.json under the
// `rbac_roles` key as Array<{ role, permissions }>. The GET /api/enterprise/rbac
// read endpoint is NOT changed (it still reads from PERMISSION_MATRIX).

const RbacRoleCreateSchema = z
  .object({
    role: z.string().min(1).max(64),
    permissions: z.array(z.string()),
  })
  .strict();

const RbacRoleUpdateSchema = z
  .object({
    permissions: z.array(z.string()).optional(),
  })
  .strict();

function rbacRoleArray(cfg: Record<string, unknown>): Array<{ role: string; permissions: string[] }> {
  const raw = cfg['rbac_roles'];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is { role: string; permissions: string[] } =>
      e !== null &&
      typeof e === 'object' &&
      typeof (e as Record<string, unknown>)['role'] === 'string' &&
      Array.isArray((e as Record<string, unknown>)['permissions']),
  );
}

function rbacRoleIdFromPath(path: string): string | null {
  const prefix = '/api/enterprise/rbac/';
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes('/')) return null;
  try { return decodeURIComponent(rest); } catch { return rest; }
}

export async function handleEnterpriseRbacWrite(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
  body: unknown,
  req?: IncomingMessage,
): Promise<boolean> {
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname;
  if (path !== '/api/enterprise/rbac' && !path.startsWith('/api/enterprise/rbac/')) return false;
  if (method !== 'POST' && method !== 'PUT' && method !== 'DELETE') return false;

  const sprintId = latestEventSprintId(projectRoot);
  const decision = authorizeTenantAdmin(req, projectRoot, sprintId, `rbac:${method.toLowerCase()}`);
  if (!decision.authorized) {
    sendApiError(res, 403, 'FORBIDDEN', 'admin role required for RBAC role management');
    return true;
  }
  const actor = decision.actor;

  if (method === 'POST') {
    if (path !== '/api/enterprise/rbac') {
      sendApiError(res, 404, 'NOT_FOUND', 'unknown rbac route');
      return true;
    }
    const result = RbacRoleCreateSchema.safeParse(body);
    if (!result.success) {
      sendJson(res, { error: { code: 'VALIDATION_ERROR', message: 'Invalid RBAC role payload', details: result.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })) } }, 400);
      return true;
    }
    const input = result.data;
    const cfg = readRawConfig(projectRoot);
    const roles = rbacRoleArray(cfg);
    if (roles.some((r) => r.role === input.role)) {
      sendApiError(res, 409, 'CONFLICT', `role '${input.role}' already exists`);
      return true;
    }
    const record = { role: input.role, permissions: input.permissions };
    cfg['rbac_roles'] = [...roles, record];
    writeRawConfig(projectRoot, cfg);
    if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:rbac:create', target: input.role });
    sendJson(res, record, 201);
    return true;
  }

  const role = rbacRoleIdFromPath(path);
  if (!role) {
    sendApiError(res, 400, 'BAD_REQUEST', 'role name required in path');
    return true;
  }

  const cfg = readRawConfig(projectRoot);
  const roles = rbacRoleArray(cfg);
  const idx = roles.findIndex((r) => r.role === role);

  if (method === 'PUT') {
    const result = RbacRoleUpdateSchema.safeParse(body);
    if (!result.success) {
      sendJson(res, { error: { code: 'VALIDATION_ERROR', message: 'Invalid RBAC role payload', details: result.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })) } }, 400);
      return true;
    }
    if (idx < 0) {
      sendApiError(res, 404, 'NOT_FOUND', `role '${role}' not found`);
      return true;
    }
    const current = roles[idx]!;
    const patch = result.data;
    const updated = { role, permissions: patch.permissions ?? current.permissions };
    roles[idx] = updated;
    cfg['rbac_roles'] = roles;
    writeRawConfig(projectRoot, cfg);
    if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:rbac:update', target: role });
    sendJson(res, updated, 200);
    return true;
  }

  if (idx < 0) {
    sendApiError(res, 404, 'NOT_FOUND', `role '${role}' not found`);
    return true;
  }
  roles.splice(idx, 1);
  cfg['rbac_roles'] = roles;
  writeRawConfig(projectRoot, cfg);
  if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:rbac:delete', target: role });
  sendJson(res, { ok: true, role }, 200);
  return true;
}

// ─── Rate-limit rule mutations — POST / PUT / DELETE (DASH-UX-6) ────────────
//
// Admin-only writes for rate-limit rules. Persisted in config.json under the
// `rate_rules` key as Array<{ id, endpoint, limit }>. The GET /api/enterprise/rate
// read endpoint is NOT changed (it still reads from the live RateLimiter snapshot).

const RateLimitCreateSchema = z
  .object({
    id: z.string().min(1).max(128),
    endpoint: z.string().min(1),
    limit: z.number().int().positive(),
  })
  .strict();

const RateLimitUpdateSchema = z
  .object({
    endpoint: z.string().min(1).optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();

function rateLimitRuleArray(cfg: Record<string, unknown>): Array<{ id: string; endpoint: string; limit: number }> {
  const raw = cfg['rate_rules'];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is { id: string; endpoint: string; limit: number } =>
      e !== null &&
      typeof e === 'object' &&
      typeof (e as Record<string, unknown>)['id'] === 'string' &&
      typeof (e as Record<string, unknown>)['endpoint'] === 'string' &&
      typeof (e as Record<string, unknown>)['limit'] === 'number',
  );
}

function rateLimitIdFromPath(path: string): string | null {
  const prefix = '/api/enterprise/rate/';
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes('/')) return null;
  try { return decodeURIComponent(rest); } catch { return rest; }
}

export async function handleEnterpriseRateWrite(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
  body: unknown,
  req?: IncomingMessage,
): Promise<boolean> {
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname;
  if (path !== '/api/enterprise/rate' && !path.startsWith('/api/enterprise/rate/')) return false;
  if (method !== 'POST' && method !== 'PUT' && method !== 'DELETE') return false;

  const sprintId = latestEventSprintId(projectRoot);
  const decision = authorizeTenantAdmin(req, projectRoot, sprintId, `rate:${method.toLowerCase()}`);
  if (!decision.authorized) {
    sendApiError(res, 403, 'FORBIDDEN', 'admin role required for rate-limit rule management');
    return true;
  }
  const actor = decision.actor;

  if (method === 'POST') {
    if (path !== '/api/enterprise/rate') {
      sendApiError(res, 404, 'NOT_FOUND', 'unknown rate route');
      return true;
    }
    const result = RateLimitCreateSchema.safeParse(body);
    if (!result.success) {
      sendJson(res, { error: { code: 'VALIDATION_ERROR', message: 'Invalid rate-limit rule payload', details: result.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })) } }, 400);
      return true;
    }
    const input = result.data;
    const cfg = readRawConfig(projectRoot);
    const rules = rateLimitRuleArray(cfg);
    if (rules.some((r) => r.id === input.id)) {
      sendApiError(res, 409, 'CONFLICT', `rate-limit rule '${input.id}' already exists`);
      return true;
    }
    const record = { id: input.id, endpoint: input.endpoint, limit: input.limit };
    cfg['rate_rules'] = [...rules, record];
    writeRawConfig(projectRoot, cfg);
    if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:rate:create', target: input.id });
    sendJson(res, record, 201);
    return true;
  }

  const id = rateLimitIdFromPath(path);
  if (!id) {
    sendApiError(res, 400, 'BAD_REQUEST', 'rule id required in path');
    return true;
  }

  const cfg = readRawConfig(projectRoot);
  const rules = rateLimitRuleArray(cfg);
  const idx = rules.findIndex((r) => r.id === id);

  if (method === 'PUT') {
    const result = RateLimitUpdateSchema.safeParse(body);
    if (!result.success) {
      sendJson(res, { error: { code: 'VALIDATION_ERROR', message: 'Invalid rate-limit rule payload', details: result.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })) } }, 400);
      return true;
    }
    if (idx < 0) {
      sendApiError(res, 404, 'NOT_FOUND', `rate-limit rule '${id}' not found`);
      return true;
    }
    const current = rules[idx]!;
    const patch = result.data;
    const updated = {
      id,
      endpoint: patch.endpoint ?? current.endpoint,
      limit: patch.limit ?? current.limit,
    };
    rules[idx] = updated;
    cfg['rate_rules'] = rules;
    writeRawConfig(projectRoot, cfg);
    if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:rate:update', target: id });
    sendJson(res, updated, 200);
    return true;
  }

  if (idx < 0) {
    sendApiError(res, 404, 'NOT_FOUND', `rate-limit rule '${id}' not found`);
    return true;
  }
  rules.splice(idx, 1);
  cfg['rate_rules'] = rules;
  writeRawConfig(projectRoot, cfg);
  if (sprintId) writeAuditEvent(projectRoot, sprintId, { tenantId: 'local', actor, action: 'enterprise:rate:delete', target: id });
  sendJson(res, { ok: true, id }, 200);
  return true;
}
