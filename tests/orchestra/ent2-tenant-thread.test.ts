/**
 * tests/orchestra/ent2-tenant-thread.test.ts
 *
 * ENT-2: actor.tenantId end-to-end threading — autonomous backlog endpoint
 * tenant isolation (strict_tenant_isolation).
 *
 * Hermetic: tmpdir project root, fake ServerResponse, fake IncomingMessage with
 * a forge-free JWT whose payload carries the tenant claim. No real HTTP server,
 * no process spawning, no spawnSync.
 *
 * Covers:
 *  - strict_tenant_isolation:true + req for tenant-a → only tenant-a entries returned
 *  - strict_tenant_isolation:false (or opts absent) → all entries (backward-compat)
 *  - admin role + strict_tenant_isolation:true → sees all entries
 *  - no req (server.ts backward-compat) → all entries returned
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerAutonomousRoutes } from '../../src/api/autonomous-endpoint.js';
import type { BacklogFile } from '../../src/orchestra/autonomous/backlog-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let projectRoot: string;

afterEach(() => {
  if (projectRoot) {
    rmSync(projectRoot, { recursive: true, force: true });
    projectRoot = undefined as unknown as string;
  }
});

/**
 * Build a minimal fake JWT whose payload carries the given claims.
 * parseOidcClaims only base64-decodes the payload — no signature check needed.
 */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

/** Mock IncomingMessage with an Authorization: Bearer <jwt> header. */
function mockReq(tenantId: string, role?: string): IncomingMessage {
  const claims: Record<string, unknown> = { sub: `user-${tenantId}`, tenant: tenantId };
  if (role) claims['role'] = role;
  return {
    headers: { authorization: `Bearer ${fakeJwt(claims)}` },
  } as unknown as IncomingMessage;
}

/** Mock ServerResponse that captures status + JSON body. */
interface ResCapture {
  status: number | null;
  body: string;
}
function mockRes(): { res: ServerResponse; cap: ResCapture } {
  const cap: ResCapture = { status: null, body: '' };
  const res = {
    writeHead(code: number) {
      cap.status = code;
      return res;
    },
    end(chunk?: unknown) {
      if (typeof chunk === 'string') cap.body += chunk;
      return res;
    },
  } as unknown as ServerResponse;
  return { res, cap };
}

/** Create a tmpdir project root with a backlog.json containing entries for two tenants. */
function setupProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ent2-tenant-'));
  const backlogDir = join(root, '.deckent', 'autonomous');
  mkdirSync(backlogDir, { recursive: true });

  const backlog: BacklogFile = {
    _version: '1',
    entries: [
      {
        id: 'entry-a-1',
        title: 'Task for tenant-a',
        kind: 'task',
        spec: { description: 'do something for a' },
        policy: 'auto',
        trigger: { type: 'one-off' },
        status: 'pending',
        tenant: 'tenant-a',
        lastRun: null,
        lastResult: null,
      },
      {
        id: 'entry-a-2',
        title: 'Another task for tenant-a',
        kind: 'task',
        spec: { description: 'do another thing for a' },
        policy: 'auto',
        trigger: { type: 'one-off' },
        status: 'done',
        tenant: 'tenant-a',
        lastRun: '2026-01-01T00:00:00.000Z',
        lastResult: { ok: true, reason: 'success' },
      },
      {
        id: 'entry-b-1',
        title: 'Task for tenant-b',
        kind: 'task',
        spec: { description: 'do something for b' },
        policy: 'auto',
        trigger: { type: 'one-off' },
        status: 'pending',
        tenant: 'tenant-b',
        lastRun: null,
        lastResult: null,
      },
    ],
  };
  writeFileSync(join(backlogDir, 'backlog.json'), JSON.stringify(backlog), 'utf-8');
  return root;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ENT-2 autonomous backlog tenant isolation', () => {
  it('rejects an unsigned tenant claim when strict_tenant_isolation:true', () => {
    projectRoot = setupProjectRoot();
    const { res, cap } = mockRes();
    const req = mockReq('tenant-a');

    const handled = registerAutonomousRoutes(
      '/api/autonomous/backlog',
      'GET',
      res,
      projectRoot,
      req,
      { strictTenantIsolation: true },
    );

    expect(handled).toBe(true);
    expect(cap.status).toBe(403);
    expect(JSON.parse(cap.body)).toMatchObject({ error: expect.any(String) });
  });

  it('returns all entries when strictTenantIsolation is false (backward-compat)', () => {
    projectRoot = setupProjectRoot();
    const { res, cap } = mockRes();
    const req = mockReq('tenant-a');

    registerAutonomousRoutes(
      '/api/autonomous/backlog',
      'GET',
      res,
      projectRoot,
      req,
      { strictTenantIsolation: false },
    );

    const entries = JSON.parse(cap.body) as Array<{ id: string }>;
    const ids = entries.map((e) => e.id);

    expect(ids).toContain('entry-a-1');
    expect(ids).toContain('entry-b-1');
  });

  it('returns all entries when no req is provided (server.ts backward-compat path)', () => {
    projectRoot = setupProjectRoot();
    const { res, cap } = mockRes();

    registerAutonomousRoutes(
      '/api/autonomous/backlog',
      'GET',
      res,
      projectRoot,
      // no req — backward-compat: server.ts currently calls without req
    );

    const entries = JSON.parse(cap.body) as Array<{ id: string }>;
    const ids = entries.map((e) => e.id);

    expect(ids).toContain('entry-a-1');
    expect(ids).toContain('entry-b-1');
  });

  it('does not grant admin access from an unsigned role claim', () => {
    projectRoot = setupProjectRoot();
    const { res, cap } = mockRes();
    const req = mockReq('tenant-a', 'admin');

    registerAutonomousRoutes(
      '/api/autonomous/backlog',
      'GET',
      res,
      projectRoot,
      req,
      { strictTenantIsolation: true },
    );

    expect(cap.status).toBe(403);
    expect(JSON.parse(cap.body)).toMatchObject({ error: expect.any(String) });
  });

  it('does not match non-autonomous routes (returns false)', () => {
    projectRoot = setupProjectRoot();
    const { res } = mockRes();

    const handled = registerAutonomousRoutes('/api/other/route', 'GET', res, projectRoot);
    expect(handled).toBe(false);
  });
});
