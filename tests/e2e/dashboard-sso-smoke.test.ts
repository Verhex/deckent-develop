// ─── dashboard SSO smoke — api_oidc (HS256) JWT bearer hermetic e2e ──────────
// Sprint 277 Task 277-010. Verifies GET /api/auth/me through the full
// auth-middleware stack with api_oidc enabled (HS256, test secret, tmpdir config).
//
// Four guarantees:
//   T1: valid HS256 JWT Bearer → 200 + mode:oidc + claim extraction
//   T2: JWT signed with wrong secret → 403 (invalid signature)
//   T3: no Authorization header → 401 (auth required)
//   T4: static-token Bearer → 200 + mode:static (localhost fallback unbroken)
//
// Hermetic: tmpdir only, no gitignored state, no spawnSync, no real IdP.
// Server uses createHttpServer (real production code path, in-process).
// OIDC config is injected via .deckent/config.json in the tmpdir project root —
// the server reads it synchronously at construction time (readFileSync).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';

// ─── HS256 JWT builder (mirrors tests/api/auth-oidc.test.ts) ─────────────────

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function encodeSegment(obj: Record<string, unknown>): string {
  return b64url(JSON.stringify(obj));
}

function makeHs256Jwt(claims: Record<string, unknown>, secret: string): string {
  const headerB64 = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payloadB64 = encodeSegment(claims);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HS_SECRET = 'test-hs256-secret-sso-smoke-277';
const STATIC_TOKEN = 'static-fallback-token-sso-smoke-277';
const ISSUER = 'https://idp.smoke.test';

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ─── Server helpers ───────────────────────────────────────────────────────────

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-sso-smoke-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  // Write api_oidc config — createHttpServer reads this synchronously via readFileSync
  writeFileSync(
    join(root, '.deckent', 'config.json'),
    JSON.stringify({
      api_oidc: {
        enabled: true,
        issuer: ISSUER,
        algorithm: 'HS256',
        key: HS_SECRET,
      },
    }),
    'utf-8',
  );
  return root;
}

async function bootServer(): Promise<{ api: HttpApi; baseUrl: string; root: string }> {
  const root = makeProjectRoot();
  const api = createHttpServer(root, {
    port: 0,
    host: '127.0.0.1',
    // Explicit static token so T4 (static fallback) is deterministic.
    // The OIDC config is read from .deckent/config.json in root.
    apiToken: STATIC_TOKEN,
  });
  await new Promise<void>((resolve) => api.server.once('listening', resolve));
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}`, root };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function getAuthMe(
  baseUrl: string,
  authHeader?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (authHeader) headers['Authorization'] = authHeader;
  const resp = await fetch(`${baseUrl}/api/auth/me`, { headers });
  const body = (await resp.json()) as Record<string, unknown>;
  return { status: resp.status, body };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('dashboard SSO smoke — api_oidc HS256 + static-token fallback', () => {
  let api: HttpApi;
  let baseUrl: string;
  let root: string;

  beforeAll(async () => {
    const ctx = await bootServer();
    api = ctx.api;
    baseUrl = ctx.baseUrl;
    root = ctx.root;
  }, 30_000);

  afterAll(async () => {
    await api?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  // T1: Valid JWT → 200 + oidc claims
  it(
    'T1: valid HS256 JWT → 200 + mode:oidc + sub/email/name claims',
    async () => {
      const jwt = makeHs256Jwt(
        {
          iss: ISSUER,
          sub: 'user-sso-001',
          email: 'sso@example.com',
          name: 'SSO User',
          exp: nowSec() + 3600,
        },
        HS_SECRET,
      );
      const { status, body } = await getAuthMe(baseUrl, `Bearer ${jwt}`);

      expect(status).toBe(200);
      expect(body['authenticated']).toBe(true);
      expect(body['mode']).toBe('oidc');
      expect(body['sub']).toBe('user-sso-001');
      expect(body['email']).toBe('sso@example.com');
      expect(body['name']).toBe('SSO User');
      // Security: bearer token must not appear in response body
      expect(JSON.stringify(body)).not.toContain(HS_SECRET);
    },
    15_000,
  );

  // T2: JWT signed with wrong secret → 403
  it(
    'T2: JWT signed with wrong secret → 403 forbidden',
    async () => {
      const badJwt = makeHs256Jwt(
        { iss: ISSUER, sub: 'attacker', exp: nowSec() + 3600 },
        'wrong-secret-attacker',
      );
      const { status } = await getAuthMe(baseUrl, `Bearer ${badJwt}`);
      expect(status).toBe(403);
    },
    15_000,
  );

  // T3: No Authorization header → 401
  it(
    'T3: no Authorization header → 401 authentication required',
    async () => {
      const { status, body } = await getAuthMe(baseUrl);
      expect(status).toBe(401);
      expect(typeof body['error']).toBe('string');
    },
    15_000,
  );

  // T4: Static token fallback → 200 mode:static
  it(
    'T4: static-token Bearer → 200 mode:static (localhost fallback unbroken)',
    async () => {
      const { status, body } = await getAuthMe(baseUrl, `Bearer ${STATIC_TOKEN}`);
      expect(status).toBe(200);
      expect(body['authenticated']).toBe(true);
      expect(body['mode']).toBe('static');
    },
    15_000,
  );
});
