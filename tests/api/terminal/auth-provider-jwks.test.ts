import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import {
  generateKeyPairSync,
  createHmac,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import {
  JwksAuthProvider,
  LocalTokenAuthProvider,
  type AuthProvider,
} from '../../../src/api/terminal/auth-provider.js';
import { attachTerminalGateway } from '../../../src/api/terminal/ws-gateway.js';
import { PtySessionManager } from '../../../src/api/terminal/session-manager.js';
import type {
  SessionBackend,
  BackendHandle,
  SpawnSpec,
} from '../../../src/api/terminal/session-backend.js';
import type { Jwk, JwksFetch } from '../../../src/core/auth-jwks.js';

// ─── Hermetic helpers — real RSA crypto, mock network, injected clocks ───────

const ISSUER = 'https://idp.example.com';
const AUDIENCE = 'deckent-terminal';
const JWKS_URL = 'https://idp.example.com/.well-known/jwks.json';
/** Fixed deterministic "now" (seconds since epoch) for clock-injected tests. */
const NOW = 1_750_000_000;

function b64url(value: object | string): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(raw).toString('base64url');
}

/** Mint a REAL RS256 JWT signed with `privateKey` (header carries `kid`). */
function mintRs256(
  claims: Record<string, unknown>,
  privateKey: KeyObject,
  header: Record<string, unknown> = {},
): string {
  const headerB64 = b64url({ alg: 'RS256', typ: 'JWT', kid: 'kid-a', ...header });
  const payloadB64 = b64url(claims);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}

/** Mint an HS256 JWT (algorithm-pinning rejection test). */
function mintHs256(claims: Record<string, unknown>, secret: string): string {
  const headerB64 = b64url({ alg: 'HS256', typ: 'JWT', kid: 'kid-a' });
  const payloadB64 = b64url(claims);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

/** Baseline valid claims relative to the injected clock. */
function validClaims(): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'user-1',
    iat: NOW - 60,
    exp: NOW + 3600,
  };
}

/** Mock fetch serving a fixed JWKS document — never touches the network. */
function mockJwksFetch(doc: unknown): { impl: JwksFetch; calls: () => number } {
  let n = 0;
  const impl: JwksFetch = (_url: string) => {
    n += 1;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(doc) });
  };
  return { impl, calls: () => n };
}

let privateKey: KeyObject;
let jwksDoc: { keys: Jwk[] };

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pair.privateKey;
  jwksDoc = {
    keys: [
      { ...(pair.publicKey.export({ format: 'jwk' }) as Jwk), kid: 'kid-a', alg: 'RS256' },
    ],
  };
});

function makeProvider(
  overrides: Partial<ConstructorParameters<typeof JwksAuthProvider>[0]> = {},
): JwksAuthProvider {
  return new JwksAuthProvider({
    issuer: ISSUER,
    audience: AUDIENCE,
    jwksUrl: JWKS_URL,
    fetchImpl: mockJwksFetch(jwksDoc).impl,
    clock: () => NOW,
    ...overrides,
  });
}

// ─── JwksAuthProvider ─────────────────────────────────────────────────────────

describe('JwksAuthProvider', () => {
  afterEach(() => {
    delete process.env['DECKENT_API_AUTH_DISABLED'];
  });

  it('verifyAsync accepts a valid RS256 token resolved via JWKS (mock fetch, one call)', async () => {
    const { impl, calls } = mockJwksFetch(jwksDoc);
    const p = makeProvider({ fetchImpl: impl });
    await expect(p.verifyAsync(mintRs256(validClaims(), privateKey))).resolves.toBe(true);
    expect(calls()).toBe(1); // resolved from the mock — no real network involved
  });

  it('verifyAsync rejects a token from the wrong issuer', async () => {
    const p = makeProvider();
    const token = mintRs256({ ...validClaims(), iss: 'https://evil.example.com' }, privateKey);
    await expect(p.verifyAsync(token)).resolves.toBe(false);
  });

  it('verifyAsync rejects a token with the wrong audience', async () => {
    const p = makeProvider();
    const token = mintRs256({ ...validClaims(), aud: 'some-other-service' }, privateKey);
    await expect(p.verifyAsync(token)).resolves.toBe(false);
  });

  it('verifyAsync rejects an unknown kid (fail-closed, rotation re-fetch exhausted)', async () => {
    const p = makeProvider();
    const token = mintRs256(validClaims(), privateKey, { kid: 'kid-unknown' });
    await expect(p.verifyAsync(token)).resolves.toBe(false);
  });

  it('verifyAsync rejects HS256 tokens outright (RS256 algorithm pinning)', async () => {
    const p = makeProvider();
    await expect(p.verifyAsync(mintHs256(validClaims(), 'shared-secret'))).resolves.toBe(false);
  });

  it('verifyAsync rejects alg:none tokens (classic bypass attempt)', async () => {
    const p = makeProvider();
    const unsigned = `${b64url({ alg: 'none', typ: 'JWT', kid: 'kid-a' })}.${b64url(validClaims())}.`;
    await expect(p.verifyAsync(unsigned)).resolves.toBe(false);
  });

  it('verifyAsync rejects an expired token (injected clock)', async () => {
    const p = makeProvider();
    const token = mintRs256({ ...validClaims(), exp: NOW - 10 }, privateKey);
    await expect(p.verifyAsync(token)).resolves.toBe(false);
  });

  it('verifyAsync rejects undefined and empty credentials', async () => {
    const p = makeProvider();
    await expect(p.verifyAsync(undefined)).resolves.toBe(false);
    await expect(p.verifyAsync('')).resolves.toBe(false);
  });

  it('sync verify ALWAYS returns false — even for a token verifyAsync accepts', async () => {
    const p = makeProvider();
    const token = mintRs256(validClaims(), privateKey);
    await expect(p.verifyAsync(token)).resolves.toBe(true); // sanity: token IS valid
    expect(p.verify(token)).toBe(false); // sync path cannot resolve JWKS — fail closed
    expect(p.verify(undefined)).toBe(false);
  });

  it('DELIBERATELY ignores DECKENT_API_AUTH_DISABLED — terminal is never bypassed', async () => {
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    const p = makeProvider();
    await expect(p.verifyAsync('not-a-jwt')).resolves.toBe(false);
    await expect(p.verifyAsync(undefined)).resolves.toBe(false);
    expect(p.verify('not-a-jwt')).toBe(false);
  });

  it('constructor rejects empty issuer/jwksUrl without echoing key material', () => {
    expect(() => makeProvider({ issuer: '' })).toThrowError(/issuer/);
    expect(() => makeProvider({ jwksUrl: '' })).toThrowError(/jwksUrl/);
  });

  it('verifyAsync fails closed (false, no throw) when the JWKS fetch errors', async () => {
    const failingFetch: JwksFetch = () => Promise.reject(new Error('network down'));
    const p = makeProvider({ fetchImpl: failingFetch });
    await expect(p.verifyAsync(mintRs256(validClaims(), privateKey))).resolves.toBe(false);
  });
});

// ─── ws-gateway verifyAsync integration ───────────────────────────────────────

class FakeBackend implements SessionBackend {
  public spawned: SpawnSpec[] = [];
  spawn(spec: SpawnSpec, _onData: (d: string) => void, _onExit: (code: number) => void): BackendHandle {
    this.spawned.push(spec);
    return { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  }
}

interface GatewaySetup {
  server: Server;
  mgr: PtySessionManager;
  audit: { record: ReturnType<typeof vi.fn> };
  port: number;
}

async function setupGateway(auth: AuthProvider): Promise<GatewaySetup> {
  const mgr = new PtySessionManager(new FakeBackend(), { scrollbackBytes: 65536, idleTimeoutMs: 0 });
  const audit = { record: vi.fn() };
  const server = createServer();
  attachTerminalGateway(server, { manager: mgr, auth, audit });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return { server, mgr, audit, port };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((res) => server.close(() => res()));
}

const openSockets: WebSocket[] = [];

function connect(port: number, token: string): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, [`deckent.${token}`]);
  openSockets.push(ws);
  return ws;
}

/** Resolves with the close code on deny, or -2 on successful open. */
function openOrClose(ws: WebSocket): Promise<number> {
  return new Promise((res) => {
    ws.on('open', () => {
      // Deny closes arrive AFTER open (handleUpgrade completes the handshake
      // before auth runs) — wait briefly for a close before declaring accept.
      const t = setTimeout(() => res(-2), 300);
      ws.on('close', (code) => {
        clearTimeout(t);
        res(code);
      });
    });
    ws.on('error', () => res(-1));
  });
}

const ctx: { server?: Server } = {};

afterEach(async () => {
  // Accepted connections keep server.close() pending — terminate clients first.
  for (const ws of openSockets.splice(0)) {
    ws.terminate();
  }
  if (ctx.server) {
    await closeServer(ctx.server);
    ctx.server = undefined;
  }
});

describe('ws-gateway verifyAsync seam', () => {
  it('awaits verifyAsync when defined — async accept wins over an always-false sync verify', async () => {
    // verify=false + delayed verifyAsync=true: an accepted connection proves the
    // gateway both PREFERRED verifyAsync and genuinely AWAITED its resolution.
    const verifyAsync = vi.fn(async (presented: string | undefined): Promise<boolean> => {
      await new Promise((r) => setTimeout(r, 25));
      return presented === 'jwt-good';
    });
    const auth: AuthProvider = { verify: () => false, verifyAsync };
    const s = await setupGateway(auth);
    ctx.server = s.server;

    const result = await openOrClose(connect(s.port, 'jwt-good'));
    expect(result).toBe(-2); // stayed open — accepted
    expect(verifyAsync).toHaveBeenCalledWith('jwt-good');
    const actions = s.audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('auth.ok');
    expect(actions).not.toContain('auth.deny');
  });

  it('denies with 4401 when verifyAsync resolves false — no session, no auth.ok', async () => {
    const auth: AuthProvider = {
      verify: () => true, // must NOT be consulted when verifyAsync exists
      verifyAsync: async () => false,
    };
    const s = await setupGateway(auth);
    ctx.server = s.server;

    const code = await openOrClose(connect(s.port, 'jwt-bad'));
    expect(code).toBe(4401);
    expect(s.mgr.list().length).toBe(0);
    const actions = s.audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('auth.deny');
    expect(actions).not.toContain('auth.ok');
  });

  it('falls back to sync verify when verifyAsync is absent — LocalTokenAuthProvider regression', async () => {
    const s = await setupGateway(new LocalTokenAuthProvider('good'));
    ctx.server = s.server;

    expect(await openOrClose(connect(s.port, 'good'))).toBe(-2); // accepted
    const denied = await openOrClose(connect(s.port, 'bad'));
    expect(denied).toBe(4401);
  });

  it('treats a REJECTING verifyAsync as deny (fail closed, no crash)', async () => {
    const auth: AuthProvider = {
      verify: () => true,
      verifyAsync: () => Promise.reject(new Error('resolver exploded')),
    };
    const s = await setupGateway(auth);
    ctx.server = s.server;

    const code = await openOrClose(connect(s.port, 'whatever'));
    expect(code).toBe(4401);
    const actions = s.audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('auth.deny');
  });

  it('denies a JwksAuthProvider-backed gateway upgrade presenting the local token, accepts a real JWT', async () => {
    const p = makeProvider();
    const s = await setupGateway(p);
    ctx.server = s.server;

    // A local-style opaque token is NOT a verifiable JWT → deny.
    expect(await openOrClose(connect(s.port, 'some-local-uuid-token'))).toBe(4401);
    // A genuine IdP-signed RS256 JWT → accept (end-to-end through the gateway).
    expect(await openOrClose(connect(s.port, mintRs256(validClaims(), privateKey)))).toBe(-2);
  });
});
