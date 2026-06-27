/**
 * Tests for GET /api/kpi/trend (332-009 — KPI Faz-2 trend surface).
 *
 * Drives the REAL createHttpServer handler end-to-end through the OIDC bearer gate
 * (mirrors kpi-endpoint.test.ts), so the suite only passes when server.ts threads `req`
 * into registerKpiTrendEndpoint — the anti-IDOR regression lock. A unit test that called
 * the register fn directly would stay green even if server.ts dropped `req`, which is
 * exactly how the A1/A2 cross-tenant IDOR shipped live.
 *
 * Hermetic: tmpdir project root; HS256 OIDC gate with an in-test secret; the KPI
 * memory.db is seeded across MULTIPLE sprints via KpiStore + computeSprintKpis (the same
 * rollup path the sprint-finalizer hook uses) so the trend has real old→new points.
 * Torn down per-test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { MeasurementInput } from '../../src/core/kpi/kpi-store.js';
import { loadKpiDefinitions } from '../../src/core/kpi/kpi-definitions.js';
import { computeSprintKpis } from '../../src/core/kpi/rollup-engine.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../src/core/constants.js';

const OIDC_SECRET = 'kpi-trend-endpoint-test-hs256-secret-key';
const OIDC_ISSUER = 'https://test-issuer.local';
// Sprint ids are zero-padded same-width so lexicographic period_key order == numeric order.
const SPRINTS = ['sprint-310', 'sprint-320', 'sprint-330'] as const;

// ─── JWT minting (HS256 — passes the server gate AND deriveRequestPrincipal) ────

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function mintJwt(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: OIDC_ISSUER, iat: now, exp: now + 3600, ...claims }));
  const signingInput = `${header}.${payload}`;
  const sig = createHmac('sha256', OIDC_SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

// ─── KPI seeding (rollup path — mirrors kpi-endpoint.test.ts) ────────────────────

function meas(
  sprintId: string,
  measureId: string,
  value: number,
  kind: MeasurementInput['kind'],
  unit: string,
  tenantId: string,
): MeasurementInput {
  return { tenantId, measureId, value, kind, unit, sprintId };
}

/** Seed a full base-measure set + pre-compute rollups for (tenant, sprint). cost = costUsd / 1. */
function seedSprint(dbPath: string, sprintId: string, tenantId: string, costUsd: number): void {
  const store = new KpiStore(dbPath);
  store.recordMeasurements([
    meas(sprintId, 'sprint_count',        1,       'counter', 'count',  tenantId),
    meas(sprintId, 'cost_usd',            costUsd, 'gauge',   'USD',    tenantId),
    meas(sprintId, 'tasks_total',         4,       'counter', 'count',  tenantId),
    meas(sprintId, 'tasks_done',          4,       'counter', 'count',  tenantId),
    meas(sprintId, 'no_go',               0,       'counter', 'count',  tenantId),
    meas(sprintId, 'boundary_violations', 0,       'counter', 'count',  tenantId),
    meas(sprintId, 'retries',             2,       'counter', 'count',  tenantId),
    meas(sprintId, 'lines_added',         1000,    'counter', 'lines',  tenantId),
    meas(sprintId, 'tokens_input',        500,     'gauge',   'tokens', tenantId),
    meas(sprintId, 'tokens_output',       300,     'gauge',   'tokens', tenantId),
    meas(sprintId, 'cache_read',          200,     'gauge',   'tokens', tenantId),
  ]);
  computeSprintKpis(store, loadKpiDefinitions(), tenantId, sprintId);
  store.close();
}

/** Seed a 3-sprint cost trend (5 → 6 → 7) for one tenant. */
function seedTrend(dbPath: string, tenantId: string, costs: readonly number[]): void {
  SPRINTS.forEach((sprintId, i) => seedSprint(dbPath, sprintId, tenantId, costs[i]));
}

// ─── Server boot (OIDC-gated, random port) ─────────────────────────────────────

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-kpi-trend-'));
  mkdirSync(join(root, BRAIN_DIR), { recursive: true });
  return root;
}

async function boot(projectRoot: string): Promise<{ api: HttpApi; baseUrl: string }> {
  const api = createHttpServer(projectRoot, {
    port: 0,
    host: '127.0.0.1',
    oidc: { issuer: OIDC_ISSUER, algorithm: 'HS256', key: OIDC_SECRET },
  });
  await new Promise<void>((resolve) => api.server.once('listening', () => resolve()));
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}` };
}

interface TrendBody {
  kpiId: string;
  series: Array<{ periodKey: string; value: number; status: string }>;
}

async function getTrend(baseUrl: string, query: string, jwt: string): Promise<{ status: number; body: TrendBody }> {
  const res = await fetch(`${baseUrl}/api/kpi/trend${query}`, { headers: { Authorization: `Bearer ${jwt}` } });
  const body = (await res.json()) as TrendBody;
  return { status: res.status, body };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/kpi/trend (332-009)', () => {
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;

  afterEach(async () => {
    if (api) { try { await api.close(); } catch { /* ignore */ } api = undefined; }
    if (projectRoot) { try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ } projectRoot = undefined; }
  });

  it('seeded multi-sprint DB → 200 with a numeric series ordered old→new', async () => {
    projectRoot = makeProjectRoot();
    seedTrend(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), 'acme', [5, 6, 7]);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-acme', role: 'viewer', tenant: 'acme' });
    const { status, body } = await getTrend(booted.baseUrl, '?kpiId=cost_per_sprint', jwt);

    expect(status).toBe(200);
    expect(body.kpiId).toBe('cost_per_sprint');
    expect(Array.isArray(body.series)).toBe(true);
    expect(body.series.length).toBe(3);
    // Each point carries the projected shape.
    for (const p of body.series) {
      expect(typeof p.periodKey).toBe('string');
      expect(typeof p.value).toBe('number');
      expect(typeof p.status).toBe('string');
    }
    // Ordered old→new: period keys ascending, values 5 → 6 → 7.
    expect(body.series.map((p) => p.periodKey)).toEqual([...SPRINTS]);
    expect(body.series.map((p) => p.value)).toEqual([5, 6, 7]);
  });

  it('?n= caps the window to the most-recent points (still old→new)', async () => {
    projectRoot = makeProjectRoot();
    seedTrend(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), 'acme', [5, 6, 7]);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-acme', role: 'viewer', tenant: 'acme' });
    const { status, body } = await getTrend(booted.baseUrl, '?kpiId=cost_per_sprint&n=2', jwt);

    expect(status).toBe(200);
    // Last 2 sprints only, still ascending.
    expect(body.series.map((p) => p.periodKey)).toEqual(['sprint-320', 'sprint-330']);
    expect(body.series.map((p) => p.value)).toEqual([6, 7]);
  });

  it('cross-tenant isolation: a different tenant sees no acme points (anti-IDOR)', async () => {
    projectRoot = makeProjectRoot();
    seedTrend(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), 'acme', [5, 6, 7]);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-globex', role: 'viewer', tenant: 'globex' });
    const { status, body } = await getTrend(booted.baseUrl, '?kpiId=cost_per_sprint', jwt);

    expect(status).toBe(200);
    // globex has no data → empty series; acme's points must NOT leak.
    expect(body.series).toEqual([]);
  });

  it('?tenantId= cannot widen scope for a non-admin caller (IDOR via query param)', async () => {
    projectRoot = makeProjectRoot();
    seedTrend(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), 'acme', [5, 6, 7]);
    const booted = await boot(projectRoot); api = booted.api;

    // Attacker (globex) tries to read acme's trend via the query param.
    const jwt = mintJwt({ sub: 'u-globex', role: 'viewer', tenant: 'globex' });
    const { status, body } = await getTrend(booted.baseUrl, '?kpiId=cost_per_sprint&tenantId=acme', jwt);

    expect(status).toBe(200);
    // Param is ignored for a non-admin → still scoped to globex (no data) → acme not leaked.
    expect(body.series).toEqual([]);
  });

  it('admin may scope to a specific tenant via ?tenantId= (cross-tenant admin view)', async () => {
    projectRoot = makeProjectRoot();
    seedTrend(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), 'acme', [5, 6, 7]);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-admin', role: 'admin' });
    const { status, body } = await getTrend(booted.baseUrl, '?kpiId=cost_per_sprint&tenantId=acme', jwt);

    expect(status).toBe(200);
    // Proves filtering is principal-based (not a blanket block): an admin can view acme.
    expect(body.series.map((p) => p.value)).toEqual([5, 6, 7]);
  });

  it('unknown kpiId → 200 { series: [] }, never 500', async () => {
    projectRoot = makeProjectRoot();
    seedTrend(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), 'acme', [5, 6, 7]);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-acme', role: 'viewer', tenant: 'acme' });
    const { status, body } = await getTrend(booted.baseUrl, '?kpiId=does_not_exist', jwt);

    expect(status).toBe(200);
    expect(body.kpiId).toBe('does_not_exist');
    expect(body.series).toEqual([]);
  });

  it('empty/absent kpiId → 200 { series: [] }, never 500', async () => {
    projectRoot = makeProjectRoot();
    seedTrend(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), 'acme', [5, 6, 7]);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-acme', role: 'viewer', tenant: 'acme' });
    const { status, body } = await getTrend(booted.baseUrl, '', jwt);

    expect(status).toBe(200);
    expect(body.kpiId).toBe('');
    expect(body.series).toEqual([]);
  });

  it('empty DB (no memory.db) → 200 { series: [] }, never 500', async () => {
    projectRoot = makeProjectRoot(); // no seed → memory.db absent
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-admin', role: 'admin' });
    const { status, body } = await getTrend(booted.baseUrl, '?kpiId=cost_per_sprint', jwt);

    expect(status).toBe(200);
    expect(body.series).toEqual([]);
  });
});
