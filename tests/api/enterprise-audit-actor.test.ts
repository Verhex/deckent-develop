/**
 * Sprint 277 Task 277-002 — audit-actor JWT sub derivation.
 *
 * Verifies that registerEnterpriseRoutes derives the audit actor from the
 * bearer JWT (sub / preferred_username) rather than hardcoding 'local'.
 * Falls back to 'local' for static/opaque tokens and unauthenticated requests.
 *
 * Tests call the route handler directly (unit) with fake req/res, using
 * vi.mock to intercept writeAuditEvent calls and verify the captured actor.
 * A tmpdir with a mock events.jsonl file is created so latestEventSprintId
 * returns a valid sprint id (audit write is exercised, not skipped).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mock audit-writer BEFORE importing enterprise-endpoint ────────────────────
// vi.mock is hoisted by vitest so writeAuditEvent is replaced before any import.
vi.mock('../../src/core/audit-writer.js', () => ({
  writeAuditEvent: vi.fn().mockReturnValue(true),
  AUDIT_EVENT_CHANNEL: 'DECKENT→AUDIT:EVENT_WRITTEN',
  _resetChainHead: vi.fn(),
  validateAuditEvent: vi.fn().mockReturnValue(true),
  verifyAuditChain: vi.fn().mockReturnValue({ intact: true }),
}));

import { registerEnterpriseRoutes } from '../../src/api/enterprise-endpoint.js';
import { writeAuditEvent } from '../../src/core/audit-writer.js';

// ─── JWT builder (HS256, mirrors auth-me-endpoint.test.ts) ────────────────────

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function encodeSegment(obj: Record<string, unknown>): string {
  return b64url(JSON.stringify(obj));
}

function makeHs256(claims: Record<string, unknown>, secret = 'test-secret-277-actor'): string {
  const headerB64 = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payloadB64 = encodeSegment(claims);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

const nowSec = (): number => Math.floor(Date.now() / 1000);

// ─── Fake req/res helpers ─────────────────────────────────────────────────────

function fakeReq(authHeader?: string, url = '/api/enterprise/tenants'): http.IncomingMessage {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    url,
    method: 'GET',
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
    end: (body: string) => { writtenBody = body; },
  } as unknown as http.ServerResponse;
  return {
    res,
    status: () => writtenStatus,
    json: () => JSON.parse(writtenBody) as unknown,
  };
}

// ─── Project root with event stream file ─────────────────────────────────────

let projectRoot: string;

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-actor-test-'));
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  // Minimal events.jsonl so latestEventSprintId returns 'sprint-277'
  writeFileSync(
    join(root, '.deckent', 'recently-works', 'sprint-277-events.jsonl'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
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

afterEach(() => {
  vi.clearAllMocks();
  if (projectRoot) {
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerEnterpriseRoutes — audit actor derivation', () => {
  it('uses JWT sub as audit actor when OIDC bearer is present', () => {
    projectRoot = makeRoot();
    const jwt = makeHs256({ sub: 'user-alice', exp: nowSec() + 3600 });
    const { res } = fakeRes();

    const handled = registerEnterpriseRoutes(
      '/api/enterprise/tenants',
      'GET',
      res,
      projectRoot,
      {},
      fakeReq(`Bearer ${jwt}`),
    );

    expect(handled).toBe(true);
    const spy = writeAuditEvent as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledOnce();
    const [, , event] = spy.mock.calls[0] as [string, string, { actor: string }];
    expect(event.actor).toBe('user-alice');
  });

  it('uses preferred_username as actor when sub is absent', () => {
    projectRoot = makeRoot();
    const jwt = makeHs256({ preferred_username: 'bob', exp: nowSec() + 3600 });
    const { res } = fakeRes();

    registerEnterpriseRoutes(
      '/api/enterprise/tenants',
      'GET',
      res,
      projectRoot,
      {},
      fakeReq(`Bearer ${jwt}`),
    );

    const spy = writeAuditEvent as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledOnce();
    const [, , event] = spy.mock.calls[0] as [string, string, { actor: string }];
    expect(event.actor).toBe('bob');
  });

  it('falls back to "local" for a static/opaque bearer (non-JWT)', () => {
    projectRoot = makeRoot();
    const { res } = fakeRes();

    registerEnterpriseRoutes(
      '/api/enterprise/tenants',
      'GET',
      res,
      projectRoot,
      {},
      fakeReq('Bearer static-opaque-token-xyz'),
    );

    const spy = writeAuditEvent as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledOnce();
    const [, , event] = spy.mock.calls[0] as [string, string, { actor: string }];
    expect(event.actor).toBe('local');
  });

  it('falls back to "local" when no Authorization header is present', () => {
    projectRoot = makeRoot();
    const { res } = fakeRes();

    registerEnterpriseRoutes(
      '/api/enterprise/tenants',
      'GET',
      res,
      projectRoot,
      {},
      fakeReq(),
    );

    const spy = writeAuditEvent as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledOnce();
    const [, , event] = spy.mock.calls[0] as [string, string, { actor: string }];
    expect(event.actor).toBe('local');
  });

  it('falls back to "local" when req is undefined (backward compat)', () => {
    projectRoot = makeRoot();
    const { res } = fakeRes();

    registerEnterpriseRoutes('/api/enterprise/tenants', 'GET', res, projectRoot, {});

    const spy = writeAuditEvent as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledOnce();
    const [, , event] = spy.mock.calls[0] as [string, string, { actor: string }];
    expect(event.actor).toBe('local');
  });

  it('skips audit write when no sprint events file exists (no sprintId)', () => {
    // Root with no events.jsonl — latestEventSprintId returns null
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-actor-nosprint-'));
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    const { res } = fakeRes();

    const jwt = makeHs256({ sub: 'user-carol', exp: nowSec() + 3600 });
    registerEnterpriseRoutes(
      '/api/enterprise/tenants',
      'GET',
      res,
      projectRoot,
      {},
      fakeReq(`Bearer ${jwt}`),
    );

    const spy = writeAuditEvent as ReturnType<typeof vi.fn>;
    // No sprint → audit write is skipped
    expect(spy).not.toHaveBeenCalled();
  });

  it('records correct action for /api/enterprise/rbac route', () => {
    projectRoot = makeRoot();
    const jwt = makeHs256({ sub: 'user-dave', exp: nowSec() + 3600 });
    const { res } = fakeRes('/api/enterprise/rbac');

    registerEnterpriseRoutes(
      '/api/enterprise/rbac',
      'GET',
      res,
      projectRoot,
      {},
      fakeReq(`Bearer ${jwt}`, '/api/enterprise/rbac'),
    );

    const spy = writeAuditEvent as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledOnce();
    const [, , event] = spy.mock.calls[0] as [string, string, { actor: string; action: string }];
    expect(event.actor).toBe('user-dave');
    expect(event.action).toBe('enterprise:rbac:read');
  });
});
