/**
 * born-583 (389-007) — GOV-MINORS.
 *
 * enterprise-endpoint governance minor-cluster:
 *   (a) RBAC permission-grant shape validation ("plugin-sig" analog — no
 *       literal plugin/signature code exists in this file's scope; malformed
 *       permission entries were previously trusted/persisted unvalidated).
 *   (b) opaque-bearer owner-trust now requires a crypto.timingSafeEqual match
 *       against config.api_auth_token when one is configured, instead of
 *       unconditionally trusting any non-JWT bearer.
 *   (c) no request-origin (loopback or otherwise) can substitute for that
 *       real token match — proven with a fake req whose socket.remoteAddress
 *       is a loopback address.
 *
 * Exercises the exported write handlers directly (fake req/res, hermetic
 * tmpdir) — same pattern as tests/api/enterprise-crud.test.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as http from 'node:http';

import { handleEnterpriseTenantWrite, handleEnterpriseRbacWrite } from '../../src/api/enterprise-endpoint.js';

const SPRINT_ID = 'sprint-gov-minors';

// ─── Fake req/res (mirrors enterprise-crud.test.ts) ───────────────────────────

function fakeReq(authHeader?: string, remoteAddress?: string): http.IncomingMessage {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    method: 'POST',
    socket: remoteAddress ? { remoteAddress } : undefined,
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
  const root = mkdtempSync(join(tmpdir(), 'deckent-gov-minors-'));
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  writeFileSync(
    join(root, '.deckent', 'recently-works', `${SPRINT_ID}-events.jsonl`),
    JSON.stringify({
      timestamp: '2026-07-08T00:00:00.000Z',
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

function seedApiAuthToken(root: string, token: string): void {
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ api_auth_token: token }), 'utf-8');
}

function readConfig(root: string): Record<string, unknown> | null {
  const p = join(root, '.deckent', 'config.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>) : null;
}

function readEvents(root: string): string {
  const p = join(root, '.deckent', 'recently-works', `${SPRINT_ID}-events.jsonl`);
  return existsSync(p) ? readFileSync(p, 'utf-8') : '';
}

afterEach(() => {
  if (projectRoot) {
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    projectRoot = undefined;
  }
});

const TENANTS_URL = '/api/enterprise/tenants';
const RBAC_URL = '/api/enterprise/rbac';

describe('born-583 GOV-MINORS — opaque-bearer + loopback + permission-grant validation', () => {
  // ══════════════════════════════════════════════════════════════════════════
  // (b) opaque-bearer must timingSafeEqual-match the configured static token
  // ══════════════════════════════════════════════════════════════════════════

  describe('opaque-bearer owner trust', () => {
    it('wrong opaque bearer denied (403) when a static token IS configured', async () => {
      projectRoot = makeRoot();
      seedApiAuthToken(projectRoot, 'the-real-secret-token');
      const { res, status } = fakeRes();

      const handled = await handleEnterpriseTenantWrite(
        TENANTS_URL, 'POST', res, projectRoot, { id: 't-x', name: 'X' }, fakeReq('Bearer totally-different-guess'),
      );

      expect(handled).toBe(true);
      expect(status()).toBe(403);
      expect(readConfig(projectRoot)?.['tenants']).toBeUndefined();
      expect(readEvents(projectRoot)).toContain('access:denied');
    });

    it('correct opaque bearer matching the configured token is authorized (201)', async () => {
      projectRoot = makeRoot();
      seedApiAuthToken(projectRoot, 'the-real-secret-token');
      const { res, status } = fakeRes();

      const handled = await handleEnterpriseTenantWrite(
        TENANTS_URL, 'POST', res, projectRoot, { id: 't-ok', name: 'OK' }, fakeReq('Bearer the-real-secret-token'),
      );

      expect(handled).toBe(true);
      expect(status()).toBe(201);
    });

    it('no static token configured → existing "opaque bearer = local owner" convention is preserved', async () => {
      projectRoot = makeRoot();
      // No api_auth_token in config — matches every pre-existing enterprise-crud.test.ts fixture.
      const { res, status } = fakeRes();

      const handled = await handleEnterpriseTenantWrite(
        TENANTS_URL, 'POST', res, projectRoot, { id: 't-legacy', name: 'Legacy' }, fakeReq('Bearer any-opaque-string-at-all'),
      );

      expect(handled).toBe(true);
      expect(status()).toBe(201);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // (c) loopback origin never substitutes for the real token
  // ══════════════════════════════════════════════════════════════════════════

  describe('loopback cannot bypass the token check', () => {
    it('127.0.0.1 origin with a wrong opaque bearer is still denied (403)', async () => {
      projectRoot = makeRoot();
      seedApiAuthToken(projectRoot, 'the-real-secret-token');
      const { res, status } = fakeRes();

      const handled = await handleEnterpriseTenantWrite(
        TENANTS_URL, 'POST', res, projectRoot, { id: 't-lo1', name: 'Lo1' },
        fakeReq('Bearer wrong-guess-from-localhost', '127.0.0.1'),
      );

      expect(handled).toBe(true);
      expect(status()).toBe(403);
      expect(readConfig(projectRoot)?.['tenants']).toBeUndefined();
    });

    it('::1 (IPv6 loopback) origin with a wrong opaque bearer is still denied (403)', async () => {
      projectRoot = makeRoot();
      seedApiAuthToken(projectRoot, 'the-real-secret-token');
      const { res, status } = fakeRes();

      const handled = await handleEnterpriseTenantWrite(
        TENANTS_URL, 'POST', res, projectRoot, { id: 't-lo2', name: 'Lo2' },
        fakeReq('Bearer wrong-guess-from-localhost', '::1'),
      );

      expect(handled).toBe(true);
      expect(status()).toBe(403);
    });

    it('loopback origin WITH the correct token still succeeds (no unintended lockout)', async () => {
      projectRoot = makeRoot();
      seedApiAuthToken(projectRoot, 'the-real-secret-token');
      const { res, status } = fakeRes();

      const handled = await handleEnterpriseTenantWrite(
        TENANTS_URL, 'POST', res, projectRoot, { id: 't-lo3', name: 'Lo3' },
        fakeReq('Bearer the-real-secret-token', '127.0.0.1'),
      );

      expect(handled).toBe(true);
      expect(status()).toBe(201);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // (a) RBAC permission-grant shape validation
  // ══════════════════════════════════════════════════════════════════════════

  describe('RBAC permission-grant validation', () => {
    it('POST with an empty-string permission → 400, nothing persisted', async () => {
      projectRoot = makeRoot();
      const { res, status, json } = fakeRes();

      const handled = await handleEnterpriseRbacWrite(
        RBAC_URL, 'POST', res, projectRoot, { role: 'broken', permissions: [''] }, fakeReq('Bearer local-owner'),
      );

      expect(handled).toBe(true);
      expect(status()).toBe(400);
      const body = json() as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(readConfig(projectRoot)?.['rbac_roles']).toBeUndefined();
    });

    it('POST with a whitespace-only permission → 400', async () => {
      projectRoot = makeRoot();
      const { res, status } = fakeRes();

      await handleEnterpriseRbacWrite(
        RBAC_URL, 'POST', res, projectRoot, { role: 'broken2', permissions: ['   '] }, fakeReq('Bearer local-owner'),
      );

      expect(status()).toBe(400);
    });

    it('POST with an uppercase / malformed permission token → 400', async () => {
      projectRoot = makeRoot();
      const { res, status } = fakeRes();

      await handleEnterpriseRbacWrite(
        RBAC_URL, 'POST', res, projectRoot, { role: 'broken3', permissions: ['Invoices:READ'] }, fakeReq('Bearer local-owner'),
      );

      expect(status()).toBe(400);
    });

    it('PUT with a malformed permission → 400, existing role untouched', async () => {
      projectRoot = makeRoot();
      writeFileSync(
        join(projectRoot, '.deckent', 'config.json'),
        JSON.stringify({ rbac_roles: [{ role: 'stable-role', permissions: ['reports:read'] }] }),
        'utf-8',
      );
      const { res, status } = fakeRes();

      await handleEnterpriseRbacWrite(
        `${RBAC_URL}/stable-role`, 'PUT', res, projectRoot, { permissions: ['bad perm'] }, fakeReq('Bearer local-owner'),
      );

      expect(status()).toBe(400);
      const roles = readConfig(projectRoot)?.['rbac_roles'] as Array<Record<string, unknown>>;
      expect(roles).toEqual([{ role: 'stable-role', permissions: ['reports:read'] }]);
    });

    it('well-formed permission grants (bare word, resource:action, wildcard) are accepted — 201', async () => {
      projectRoot = makeRoot();
      const { res, status, json } = fakeRes();

      const handled = await handleEnterpriseRbacWrite(
        RBAC_URL, 'POST', res, projectRoot,
        { role: 'billing-admin', permissions: ['invoices:read', 'invoices:write', 'audit', '*:read', 'x:read'] },
        fakeReq('Bearer local-owner'),
      );

      expect(handled).toBe(true);
      expect(status()).toBe(201);
      expect(json()).toMatchObject({ role: 'billing-admin', permissions: ['invoices:read', 'invoices:write', 'audit', '*:read', 'x:read'] });
    });
  });
});
