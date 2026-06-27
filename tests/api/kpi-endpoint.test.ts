/**
 * Tests for GET /api/kpi (331-009 — KPI Faz-2 HTTP surface).
 *
 * Drives the REAL createHttpServer handler end-to-end through the OIDC bearer gate
 * (mirrors server-tenant-scope-wire.test.ts), so the suite only passes when server.ts
 * threads `req` into registerKpiEndpoint — the anti-IDOR regression lock. A unit test
 * that called the register fn directly would stay green even if server.ts dropped
 * `req`, which is exactly how the A1/A2 cross-tenant IDOR shipped live.
 *
 * Hermetic: tmpdir project root; HS256 OIDC gate with an in-test secret; the KPI
 * memory.db is seeded into the project root via KpiStore + computeSprintKpis (the same
 * rollup path the sprint-finalizer hook uses). Torn down per-test.
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

const OIDC_SECRET = 'kpi-endpoint-test-hs256-secret-key';
const OIDC_ISSUER = 'https://test-issuer.local';
const SPRINT = 'sprint-331';

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

// ─── KPI seeding (rollup path — mirrors tests/kpi/kpi-service.test.ts) ──────────

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

// ─── Server boot (OIDC-gated, random port) ─────────────────────────────────────

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-kpi-ep-'));
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

interface KpiBody {
  sprintId: string | null;
  kpis: Array<{
    id: string;
    title: { en: string; tr: string };
    value: number | null;
    target: number | null;
    status: string;
    direction: string;
    format: string;
    unit: string;
  }>;
}

async function getKpi(baseUrl: string, query: string, jwt: string): Promise<{ status: number; body: KpiBody }> {
  const res = await fetch(`${baseUrl}/api/kpi${query}`, { headers: { Authorization: `Bearer ${jwt}` } });
  const body = (await res.json()) as KpiBody;
  return { status: res.status, body };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/kpi (331-009)', () => {
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;

  afterEach(async () => {
    if (api) { try { await api.close(); } catch { /* ignore */ } api = undefined; }
    if (projectRoot) { try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ } projectRoot = undefined; }
  });

  it('seeded DB → 200 with a valid kpis[] carrying a numeric cost_per_sprint value', async () => {
    projectRoot = makeProjectRoot();
    seedSprint(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), SPRINT, 'acme', 7);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-acme', role: 'viewer', tenant: 'acme' });
    const { status, body } = await getKpi(booted.baseUrl, `?sprint=${SPRINT}`, jwt);

    expect(status).toBe(200);
    expect(body.sprintId).toBe(SPRINT);
    expect(Array.isArray(body.kpis)).toBe(true);
    expect(body.kpis.length).toBeGreaterThan(0);

    const cost = body.kpis.find((k) => k.id === 'cost_per_sprint');
    expect(cost).toBeDefined();
    expect(typeof cost!.value).toBe('number');
    expect(cost!.value).toBeCloseTo(7, 6);
    // i18n-first: title is the {en,tr} object — client picks the language.
    expect(cost!.title.en).toBeTruthy();
    expect(cost!.title.tr).toBeTruthy();
  });

  it('cross-tenant isolation: a different tenant does NOT see acme KPI values (anti-IDOR)', async () => {
    projectRoot = makeProjectRoot();
    seedSprint(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), SPRINT, 'acme', 7);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-globex', role: 'viewer', tenant: 'globex' });
    const { status, body } = await getKpi(booted.baseUrl, `?sprint=${SPRINT}`, jwt);

    expect(status).toBe(200);
    const cost = body.kpis.find((k) => k.id === 'cost_per_sprint');
    // globex has no data for this sprint → null value; acme's 7 must NOT leak.
    expect(cost?.value ?? null).toBeNull();
  });

  it('?tenantId= cannot widen scope for a non-admin caller (IDOR via query param)', async () => {
    projectRoot = makeProjectRoot();
    seedSprint(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), SPRINT, 'acme', 7);
    const booted = await boot(projectRoot); api = booted.api;

    // Attacker (globex) tries to read acme's KPIs via the query param.
    const jwt = mintJwt({ sub: 'u-globex', role: 'viewer', tenant: 'globex' });
    const { status, body } = await getKpi(booted.baseUrl, `?sprint=${SPRINT}&tenantId=acme`, jwt);

    expect(status).toBe(200);
    const cost = body.kpis.find((k) => k.id === 'cost_per_sprint');
    // Param is ignored for a non-admin → still scoped to globex (no data) → 7 not leaked.
    expect(cost?.value ?? null).toBeNull();
  });

  it('admin may scope to a specific tenant via ?tenantId= (cross-tenant admin view)', async () => {
    projectRoot = makeProjectRoot();
    seedSprint(join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE), SPRINT, 'acme', 7);
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-admin', role: 'admin' });
    const { status, body } = await getKpi(booted.baseUrl, `?sprint=${SPRINT}&tenantId=acme`, jwt);

    expect(status).toBe(200);
    const cost = body.kpis.find((k) => k.id === 'cost_per_sprint');
    // Proves filtering is principal-based (not a blanket block): an admin can view acme.
    expect(cost?.value).toBeCloseTo(7, 6);
  });

  it('empty DB (no memory.db) → 200 { kpis: [] }, never 500', async () => {
    projectRoot = makeProjectRoot(); // no seed → memory.db absent
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-admin', role: 'admin' });
    const { status, body } = await getKpi(booted.baseUrl, `?sprint=${SPRINT}`, jwt);

    expect(status).toBe(200);
    expect(body.kpis).toEqual([]);
  });
});
