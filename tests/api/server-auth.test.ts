import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

// ─── Mocks ──────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn(() => ({ ok: true, checks: [] })),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  killWorker: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  DEFAULT_APPROVE_TIMEOUT_ATTENDED_MS: 300_000,
  DEFAULT_APPROVE_TIMEOUT_UNATTENDED_MS: 30_000,
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(async () => ({
    activeModeConfig: { brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: false, max_workers: 4 },
  })),
  deepMerge: vi.fn((base: Record<string, unknown>, override: Record<string, unknown>) => ({ ...base, ...override })),
  validatePartialConfig: vi.fn(),
  ConfigValidationError: class extends Error { name = 'ConfigValidationError'; errors: string[] = []; },
  createDefaultConfig: vi.fn(() => ({})),
}));

vi.mock('../../src/agents/worker.js', () => ({
  readWorkerLog: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(() => null),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(async () => ({ id: 'sprint-001', status: 'COMPLETE' })),
  readContext: vi.fn(() => ({ debt: [], patterns: [], memory: '' })),
  planSprint: vi.fn(() => ({ id: 'sprint-001', number: 1, tasks: [] })),
  cleanup: vi.fn(),
}));

vi.mock('../../src/api/sprint-job-runner.js', () => ({
  startSprintDetached: vi.fn(() => ({ jobId: `job-${Date.now()}` })),
}));

import { createHttpServer, _resetActiveJob, type HttpApi } from '../../src/api/server.js';
import { resolveAuthToken, verifyBearerToken, bearerAuthMiddleware } from '../../src/api/auth.js';

const PROJECT_ROOT = '/tmp/test-project';
const TEST_TOKEN = 'test-secret-token-abc123';

function request(
  api: HttpApi,
  path: string,
  method = 'GET',
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('No address'));
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string | number> = {};
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    if (headers) Object.assign(reqHeaders, headers);
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path, method, headers: reqHeaders },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body: data, headers: res.headers }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Tests ──────────────────────────────────────────────────────
describe('Bearer Token Authentication', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    delete process.env['DECKENT_API_TOKEN'];
  });

  afterEach(async () => {
    if (api) await api.close();
    delete process.env['DECKENT_API_TOKEN'];
  });

  // ─── Unit: resolveAuthToken ──────────────────────────────────
  describe('resolveAuthToken()', () => {
    it('returns config token when provided', () => {
      expect(resolveAuthToken('my-config-token')).toBe('my-config-token');
    });

    it('falls back to DECKENT_API_TOKEN env var', () => {
      process.env['DECKENT_API_TOKEN'] = 'env-token-xyz';
      expect(resolveAuthToken(null)).toBe('env-token-xyz');
    });

    it('returns null when neither config nor env set', () => {
      expect(resolveAuthToken(null)).toBeNull();
      expect(resolveAuthToken(undefined)).toBeNull();
    });

    it('config token takes precedence over env var', () => {
      process.env['DECKENT_API_TOKEN'] = 'env-token';
      expect(resolveAuthToken('config-token')).toBe('config-token');
    });
  });

  // ─── Unit: verifyBearerToken ─────────────────────────────────
  describe('verifyBearerToken()', () => {
    function fakeReq(authHeader?: string): http.IncomingMessage {
      return { headers: authHeader ? { authorization: authHeader } : {} } as http.IncomingMessage;
    }

    it('returns missing when no Authorization header', () => {
      expect(verifyBearerToken(fakeReq(), 'token')).toBe('missing');
    });

    it('returns missing when scheme is not Bearer', () => {
      expect(verifyBearerToken(fakeReq('Basic abc123'), 'token')).toBe('missing');
    });

    it('returns ok when token matches', () => {
      expect(verifyBearerToken(fakeReq('Bearer correct'), 'correct')).toBe('ok');
    });

    it('returns invalid when token does not match', () => {
      expect(verifyBearerToken(fakeReq('Bearer wrong'), 'correct')).toBe('invalid');
    });
  });

  // ─── Unit: bearerAuthMiddleware ──────────────────────────────
  describe('bearerAuthMiddleware()', () => {
    it('returns 401 when no token configured (secure by default)', () => {
      delete process.env['DECKENT_API_AUTH_DISABLED'];
      const check = bearerAuthMiddleware({ configToken: null });
      const req = { headers: {}, url: '/api/status' } as http.IncomingMessage;
      let writtenStatus = 0;
      let writtenBody = '';
      const res = {
        writeHead: (status: number) => { writtenStatus = status; },
        end: (body: string) => { writtenBody = body; },
      } as unknown as http.ServerResponse;
      expect(check(req, res)).toBe(false);
      expect(writtenStatus).toBe(401);
      expect(writtenBody).toContain('authentication required');
    });

    it('passes through when DECKENT_API_AUTH_DISABLED=1', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      process.env['DECKENT_API_AUTH_DISABLED'] = '1';
      const check = bearerAuthMiddleware({ configToken: null });
      const req = { headers: {}, url: '/api/status' } as http.IncomingMessage;
      const res = {} as unknown as http.ServerResponse;
      expect(check(req, res)).toBe(true);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING'));
      stderrSpy.mockRestore();
      delete process.env['DECKENT_API_AUTH_DISABLED'];
    });

    it('passes through for exempt paths', () => {
      delete process.env['DECKENT_API_AUTH_DISABLED'];
      const check = bearerAuthMiddleware({ configToken: 'secret', exemptPaths: ['/health'] });
      const req = { headers: {}, url: '/health' } as http.IncomingMessage;
      const res = {} as http.ServerResponse;
      expect(check(req, res)).toBe(true);
    });
  });

  // ─── Integration: No token → 401 ────────────────────────────
  describe('GET endpoints with auth token configured', () => {
    it('returns 401 when no token provided', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: TEST_TOKEN, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.status).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('authentication required');
      stderrSpy.mockRestore();
    });

    // ─── Integration: Wrong token → 403 ──────────────────────
    it('returns 403 when wrong token provided', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: TEST_TOKEN, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'GET', undefined, {
        'Authorization': 'Bearer wrong-token',
      });
      expect(res.status).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('forbidden');
      stderrSpy.mockRestore();
    });

    // ─── Integration: Correct token → 200 ────────────────────
    it('returns 200 when correct token provided', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: TEST_TOKEN, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'GET', undefined, {
        'Authorization': `Bearer ${TEST_TOKEN}`,
      });
      expect(res.status).toBe(200);
      stderrSpy.mockRestore();
    });

    // ─── Integration: Health endpoint bypass ─────────────────
    it('health endpoint bypasses auth', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: TEST_TOKEN, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      // /health (no auth header) should still return 200
      const res = await request(api, '/health');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();

      // /api/health should also bypass
      const res2 = await request(api, '/api/health');
      expect(res2.status).toBe(200);
      stderrSpy.mockRestore();
    });

    // ─── Integration: Env var fallback ───────────────────────
    it('uses DECKENT_API_TOKEN env var when no explicit token', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      process.env['DECKENT_API_TOKEN'] = 'env-secret-token';
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      // No auth → 401 (env token is active)
      const res401 = await request(api, '/api/status');
      expect(res401.status).toBe(401);

      // Wrong auth → 403
      const res403 = await request(api, '/api/status', 'GET', undefined, {
        'Authorization': 'Bearer wrong',
      });
      expect(res403.status).toBe(403);

      // Correct env token → 200
      const res200 = await request(api, '/api/status', 'GET', undefined, {
        'Authorization': 'Bearer env-secret-token',
      });
      expect(res200.status).toBe(200);
      stderrSpy.mockRestore();
    });

    // ─── Integration: POST also requires auth ────────────────
    it('POST endpoints also require auth when token configured', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: TEST_TOKEN, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      // POST without token → 401
      const res = await request(api, '/api/start', 'POST', {});
      expect(res.status).toBe(401);

      // POST with correct token → auth kapısı geçilir; FAZ4B'de /api/start
      // emekli olduğundan route 410 LEGACY_START_RETIRED döner (401 DEĞİL).
      const res2 = await request(api, '/api/start', 'POST', {}, {
        'Authorization': `Bearer ${TEST_TOKEN}`,
      });
      expect(res2.status).toBe(410);
      expect(JSON.parse(res2.body).code).toBe('LEGACY_START_RETIRED');
      stderrSpy.mockRestore();
    });

    // ─── Integration: No token configured → 401 (secure default) ────
    it('returns 401 when no token configured (secure by default)', async () => {
      delete process.env['DECKENT_API_AUTH_DISABLED'];
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.status).toBe(401);
      stderrSpy.mockRestore();
    });

    // ─── Integration: DECKENT_API_AUTH_DISABLED=1 bypass ────
    it('bypasses auth when DECKENT_API_AUTH_DISABLED=1', async () => {
      process.env['DECKENT_API_AUTH_DISABLED'] = '1';
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.status).toBe(200);
      // Verify warning was emitted
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: API authentication is DISABLED'),
      );
      stderrSpy.mockRestore();
      delete process.env['DECKENT_API_AUTH_DISABLED'];
    });

    // ─── Integration: CORS reject for non-localhost origin ────
    it('rejects CORS preflight from non-localhost origin', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      process.env['DECKENT_API_AUTH_DISABLED'] = '1';
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'OPTIONS', undefined, {
        'Origin': 'https://evil.example.com',
      });
      expect(res.status).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('CORS origin not allowed');
      stderrSpy.mockRestore();
      delete process.env['DECKENT_API_AUTH_DISABLED'];
    });

    // ─── Integration: Security headers present ────
    it('includes security headers in API responses', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: TEST_TOKEN, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'GET', undefined, {
        'Authorization': `Bearer ${TEST_TOKEN}`,
      });
      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['strict-transport-security']).toContain('max-age=');
      stderrSpy.mockRestore();
    });
  });
});
