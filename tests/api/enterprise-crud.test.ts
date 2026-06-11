/**
 * Sprint 282 Task 282-010 — Enterprise tenant CRUD (DASH-UX-6).
 *
 * Exercises handleEnterpriseTenantWrite directly (fake req/res, hermetic
 * tmpdir) — the POST/PUT/DELETE admin-RBAC + Zod-validated + audit-logged
 * mutation handler that powers the dashboard Tenants tab.
 *
 * Coverage: create / update / delete happy paths, validation + conflict +
 * not-found edges, and the RBAC gate (static-owner allow, OIDC admin allow,
 * OIDC viewer 403 with denial audit, no-bearer 403).
 *
 * Fully hermetic: every fixture lives under os.tmpdir() and is torn down in
 * afterEach. parseOidcClaims only DECODES the JWT (no signature verify), so the
 * test JWTs carry a throwaway signature segment.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as http from 'node:http';

import { handleEnterpriseTenantWrite } from '../../src/api/enterprise-endpoint.js';

const SPRINT_ID = 'sprint-282';

// ─── JWT (decode-only — signature segment is a throwaway) ─────────────────────
function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}
function makeJwt(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  return `${header}.${payload}.signature`;
}

const STATIC = 'Bearer static-owner-token-xyz'; // non-JWT → local full access
const ADMIN = `Bearer ${makeJwt({ sub: 'admin-user', role: 'admin' })}`;
const VIEWER = `Bearer ${makeJwt({ sub: 'viewer-user', role: 'viewer' })}`;

// ─── Fake req/res ─────────────────────────────────────────────────────────────
function fakeReq(authHeader?: string): http.IncomingMessage {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    method: 'POST',
  } as unknown as http.IncomingMessage;
}

function fakeRes(): {
  res: http.ServerResponse;
  status: () => number;
  json: () => unknown;
} {
  let writtenStatus = 200;
  let writtenBody = '';
  const res = {
    writeHead: (status: number) => { writtenStatus = status; },
    end: (body?: string) => { writtenBody = body ?? ''; },
  } as unknown as http.ServerResponse;
  return {
    res,
    status: () => writtenStatus,
    json: () => (writtenBody ? (JSON.parse(writtenBody) as unknown) : undefined),
  };
}

// ─── Project root fixture ─────────────────────────────────────────────────────
let projectRoot: string | undefined;

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-ent-crud-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  // A minimal events stream so latestEventSprintId resolves → audit writes land.
  writeFileSync(
    join(root, '.deckent', `${SPRINT_ID}-events.jsonl`),
    JSON.stringify({
      timestamp: '2026-06-11T00:00:00.000Z',
      sequence: 1,
      protocol_version: '1.0',
      source: 'deckent',
      target: '*',
      channel: 'BRAIN→*:SPRINT_PHASE_CHANGE',
      payload: {},
    }) + '\n',
    'utf-8',
  );
  return root;
}

function seedTenants(root: string, tenants: unknown[]): void {
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ tenants }), 'utf-8');
}

function readConfig(root: string): { tenants?: Array<Record<string, unknown>> } | null {
  const p = join(root, '.deckent', 'config.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')) as { tenants?: Array<Record<string, unknown>> }) : null;
}

function readEvents(root: string): string {
  const p = join(root, '.deckent', `${SPRINT_ID}-events.jsonl`);
  return existsSync(p) ? readFileSync(p, 'utf-8') : '';
}

afterEach(() => {
  if (projectRoot) {
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    projectRoot = undefined;
  }
});

const TENANTS_URL = '/api/enterprise/tenants';

describe('handleEnterpriseTenantWrite — tenant CRUD (282-010)', () => {
  // ─── CREATE ─────────────────────────────────────────────────────────
  it('POST create → 201, persists tenant, writes create audit', async () => {
    projectRoot = makeRoot();
    const { res, status, json } = fakeRes();

    const handled = await handleEnterpriseTenantWrite(
      TENANTS_URL, 'POST', res, projectRoot, { id: 't-acme', name: 'Acme Corp' }, fakeReq(STATIC),
    );

    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const rec = json() as Record<string, unknown>;
    expect(rec).toMatchObject({ id: 't-acme', name: 'Acme Corp', status: 'active', users: 0 });
    expect(typeof rec['createdAt']).toBe('string');

    const cfg = readConfig(projectRoot);
    expect(cfg?.tenants).toHaveLength(1);
    expect(cfg?.tenants?.[0]).toMatchObject({ id: 't-acme', name: 'Acme Corp' });
    expect(readEvents(projectRoot)).toContain('enterprise:tenants:create');
  });

  it('POST with explicit status/users is honoured', async () => {
    projectRoot = makeRoot();
    const { res, status, json } = fakeRes();
    await handleEnterpriseTenantWrite(
      TENANTS_URL, 'POST', res, projectRoot,
      { id: 't-beta', name: 'Beta', status: 'suspended', users: 7 }, fakeReq(STATIC),
    );
    expect(status()).toBe(201);
    expect(json()).toMatchObject({ id: 't-beta', status: 'suspended', users: 7 });
  });

  it('POST duplicate id → 409, no second entry', async () => {
    projectRoot = makeRoot();
    seedTenants(projectRoot, [{ id: 't-dup', name: 'Dup' }]);
    const { res, status } = fakeRes();
    await handleEnterpriseTenantWrite(
      TENANTS_URL, 'POST', res, projectRoot, { id: 't-dup', name: 'Other' }, fakeReq(STATIC),
    );
    expect(status()).toBe(409);
    expect(readConfig(projectRoot)?.tenants).toHaveLength(1);
  });

  it('POST invalid payload → 400 (bad id, missing name, unknown field)', async () => {
    projectRoot = makeRoot();

    const badId = fakeRes();
    await handleEnterpriseTenantWrite(TENANTS_URL, 'POST', badId.res, projectRoot, { id: 'BAD ID', name: 'X' }, fakeReq(STATIC));
    expect(badId.status()).toBe(400);

    const noName = fakeRes();
    await handleEnterpriseTenantWrite(TENANTS_URL, 'POST', noName.res, projectRoot, { id: 't-ok' }, fakeReq(STATIC));
    expect(noName.status()).toBe(400);

    const unknownField = fakeRes();
    await handleEnterpriseTenantWrite(TENANTS_URL, 'POST', unknownField.res, projectRoot, { id: 't-ok', name: 'OK', evil: true }, fakeReq(STATIC));
    expect(unknownField.status()).toBe(400);

    expect(readConfig(projectRoot)).toBeNull(); // nothing persisted
  });

  // ─── UPDATE ─────────────────────────────────────────────────────────
  it('PUT update → 200, merges fields, keeps untouched ones', async () => {
    projectRoot = makeRoot();
    seedTenants(projectRoot, [{ id: 't-up', name: 'Old', status: 'active', users: 3, createdAt: '2026-01-01' }]);
    const { res, status, json } = fakeRes();

    await handleEnterpriseTenantWrite(
      `${TENANTS_URL}/t-up`, 'PUT', res, projectRoot, { name: 'New Name', status: 'suspended' }, fakeReq(STATIC),
    );

    expect(status()).toBe(200);
    expect(json()).toMatchObject({ id: 't-up', name: 'New Name', status: 'suspended', users: 3, createdAt: '2026-01-01' });
    expect(readConfig(projectRoot)?.tenants?.[0]).toMatchObject({ name: 'New Name', status: 'suspended' });
    expect(readEvents(projectRoot)).toContain('enterprise:tenants:update');
  });

  it('PUT non-existent tenant → 404', async () => {
    projectRoot = makeRoot();
    const { res, status } = fakeRes();
    await handleEnterpriseTenantWrite(`${TENANTS_URL}/ghost`, 'PUT', res, projectRoot, { name: 'X' }, fakeReq(STATIC));
    expect(status()).toBe(404);
  });

  // ─── DELETE ─────────────────────────────────────────────────────────
  it('DELETE → 200, removes only the target tenant', async () => {
    projectRoot = makeRoot();
    seedTenants(projectRoot, [{ id: 't-del', name: 'Del' }, { id: 't-keep', name: 'Keep' }]);
    const { res, status, json } = fakeRes();

    await handleEnterpriseTenantWrite(`${TENANTS_URL}/t-del`, 'DELETE', res, projectRoot, {}, fakeReq(STATIC));

    expect(status()).toBe(200);
    expect(json()).toEqual({ ok: true, id: 't-del' });
    expect((readConfig(projectRoot)?.tenants ?? []).map((x) => x['id'])).toEqual(['t-keep']);
    expect(readEvents(projectRoot)).toContain('enterprise:tenants:delete');
  });

  it('DELETE non-existent tenant → 404', async () => {
    projectRoot = makeRoot();
    const { res, status } = fakeRes();
    await handleEnterpriseTenantWrite(`${TENANTS_URL}/ghost`, 'DELETE', res, projectRoot, {}, fakeReq(STATIC));
    expect(status()).toBe(404);
  });

  // ─── RBAC ───────────────────────────────────────────────────────────
  it('RBAC: OIDC viewer → 403, no write, denial audited', async () => {
    projectRoot = makeRoot();
    const { res, status } = fakeRes();

    const handled = await handleEnterpriseTenantWrite(
      TENANTS_URL, 'POST', res, projectRoot, { id: 't-x', name: 'X' }, fakeReq(VIEWER),
    );

    expect(handled).toBe(true);
    expect(status()).toBe(403);
    expect(readConfig(projectRoot)).toBeNull(); // nothing written
    expect(readEvents(projectRoot)).toContain('access:denied');
  });

  it('RBAC: OIDC admin → 201 allowed', async () => {
    projectRoot = makeRoot();
    const { res, status } = fakeRes();
    await handleEnterpriseTenantWrite(TENANTS_URL, 'POST', res, projectRoot, { id: 't-adm', name: 'Adm' }, fakeReq(ADMIN));
    expect(status()).toBe(201);
    expect(readConfig(projectRoot)?.tenants).toHaveLength(1);
  });

  it('RBAC: no bearer → 403 (fail-secure)', async () => {
    projectRoot = makeRoot();
    const { res, status } = fakeRes();
    await handleEnterpriseTenantWrite(TENANTS_URL, 'POST', res, projectRoot, { id: 't-n', name: 'N' }, fakeReq());
    expect(status()).toBe(403);
    expect(readConfig(projectRoot)).toBeNull();
  });

  // ─── Routing edges ──────────────────────────────────────────────────
  it('falls through (returns false) for non-tenant routes and GET', async () => {
    projectRoot = makeRoot();

    const rbac = fakeRes();
    expect(await handleEnterpriseTenantWrite('/api/enterprise/rbac', 'POST', rbac.res, projectRoot, {}, fakeReq(STATIC))).toBe(false);

    const getVerb = fakeRes();
    expect(await handleEnterpriseTenantWrite(TENANTS_URL, 'GET', getVerb.res, projectRoot, {}, fakeReq(STATIC))).toBe(false);
  });
});
