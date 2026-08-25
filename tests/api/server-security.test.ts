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
  deepMerge: vi.fn((base: Record<string, unknown>, override: Record<string, unknown>) => {
    // Simple deep merge for testing
    const result = { ...base };
    for (const key of Object.keys(override)) {
      const bv = result[key];
      const ov = override[key];
      if (bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object' && !Array.isArray(ov)) {
        result[key] = { ...(bv as Record<string, unknown>), ...(ov as Record<string, unknown>) };
      } else {
        result[key] = ov;
      }
    }
    return result;
  }),
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
}));

vi.mock('../../src/api/sprint-job-runner.js', () => ({
  startSprintDetached: vi.fn(() => ({ jobId: `job-${Date.now()}` })),
}));

import { writeFileSync } from 'node:fs';
import { createHttpServer, parseBody, _resetActiveJob, SlidingWindowRateLimiter, type HttpApi } from '../../src/api/server.js';
import { readJsonSafe } from '../../src/core/utils.js';
import { deepMerge } from '../../src/core/config.js';
import { startSprintDetached } from '../../src/api/sprint-job-runner.js';

const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadJsonSafe = vi.mocked(readJsonSafe);
const mockDeepMerge = vi.mocked(deepMerge);

const PROJECT_ROOT = '/tmp/test-project';

// Global auth bypass for non-auth-focused tests
let _stderrSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env['DECKENT_API_AUTH_DISABLED'] = '1';
  _stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});
afterEach(() => {
  delete process.env['DECKENT_API_AUTH_DISABLED'];
  _stderrSpy?.mockRestore();
});

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

function sendRawBody(
  api: HttpApi,
  path: string,
  rawBody: Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('No address'));
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': rawBody.length },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body: data }));
      },
    );
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

// ─── Tests ──────────────────────────────────────────────────────
describe('Server Security Hardening', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockReadJsonSafe.mockReturnValue(null);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  // ─── A) Rate Limiting ───────────────────────────────────────
  describe('SlidingWindowRateLimiter', () => {
    it('allows requests within limit', () => {
      const limiter = new SlidingWindowRateLimiter(3, 60_000);
      expect(limiter.check('1.2.3.4')).toBe(true);
      expect(limiter.check('1.2.3.4')).toBe(true);
      expect(limiter.check('1.2.3.4')).toBe(true);
    });

    it('blocks requests exceeding limit', () => {
      const limiter = new SlidingWindowRateLimiter(2, 60_000);
      expect(limiter.check('1.2.3.4')).toBe(true);
      expect(limiter.check('1.2.3.4')).toBe(true);
      expect(limiter.check('1.2.3.4')).toBe(false);
    });

    it('tracks IPs independently', () => {
      const limiter = new SlidingWindowRateLimiter(1, 60_000);
      expect(limiter.check('1.1.1.1')).toBe(true);
      expect(limiter.check('2.2.2.2')).toBe(true);
      expect(limiter.check('1.1.1.1')).toBe(false);
      expect(limiter.check('2.2.2.2')).toBe(false);
    });

    it('resets after window expires', () => {
      const limiter = new SlidingWindowRateLimiter(1, 1); // 1ms window
      expect(limiter.check('1.1.1.1')).toBe(true);
      // After 1ms the window resets
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(limiter.check('1.1.1.1')).toBe(true);
          resolve();
        }, 10);
      });
    });
  });

  describe('rate limiting integration', () => {
    it('returns 429 when rate limit exceeded', async () => {
      // strict limiter over loopback (production default exempts loopback — Sprint 269)
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 2, rateLimitExemptLoopback: false });
      await new Promise<void>((r) => api.server.once('listening', r));

      await request(api, '/api/status');
      await request(api, '/api/status');
      const res = await request(api, '/api/status');
      expect(res.status).toBe(429);
      expect(JSON.parse(res.body).error).toBe('Too Many Requests');
    });

    it('disables rate limiting when rateLimit=0', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      // Should not 429 even after many requests
      for (let i = 0; i < 5; i++) {
        const res = await request(api, '/api/status');
        expect(res.status).not.toBe(429);
      }
    });
  });

  // ─── B) Body Size Limit ─────────────────────────────────────
  describe('body size limit', () => {
    it('returns 413 for oversized body', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      // Create a body > 1MB
      const largeBody = Buffer.alloc(1024 * 1024 + 100, 'x');
      const res = await sendRawBody(api, '/api/config', largeBody);
      expect(res.status).toBe(413);
    });

    it('accepts normal-sized body', async () => {
      mockReadJsonSafe.mockReturnValue({ mode: 'balanced' });
      mockDeepMerge.mockReturnValue({ mode: 'balanced', max_workers: 2 });
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config', 'POST', { max_workers: 2 });
      expect(res.status).toBe(200);
    });
  });

  // ─── C) DeepMerge ──────────────────────────────────────────
  describe('POST /api/config deep merge', () => {
    it('uses deepMerge instead of shallow merge', async () => {
      const existingConfig = { mode: 'performance', nested: { a: 1, b: 2 } };
      mockReadJsonSafe.mockReturnValue(existingConfig);
      mockDeepMerge.mockReturnValue({ mode: 'performance', nested: { a: 1, b: 2, c: 3 } });

      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config', 'POST', { nested: { c: 3 } });
      expect(res.status).toBe(200);
      expect(mockDeepMerge).toHaveBeenCalledWith(existingConfig, { nested: { c: 3 } });
    });
  });

  // ─── D) Auth Token Auto-Generate ───────────────────────────
  describe('auto-generate token', () => {
    it('auto-generates token when autoGenerateToken=true', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, autoGenerateToken: true, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      // Should have printed token to stderr
      const tokenMsg = stderrSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('Auto-generated API token'),
      );
      expect(tokenMsg).toBeDefined();
      stderrSpy.mockRestore();
    });

    it('POST requires auth when autoGenerateToken is set', async () => {
      delete process.env['DECKENT_API_AUTH_DISABLED'];
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, { port: 0, autoGenerateToken: true, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      // POST without token → 401
      const res = await request(api, '/api/start', 'POST', {});
      expect(res.status).toBe(401);
      stderrSpy.mockRestore();
    });
  });

  // ─── E) API Versioning ────────────────────────────────────
  describe('API versioning (/api/v1/ prefix)', () => {
    it('/api/v1/status routes to /api/status', async () => {
      mockReadJsonSafe.mockReturnValue({ sprint: { id: 'sprint-001' } });
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/v1/status');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sprint.id).toBe('sprint-001');
    });

    it('/api/v1/history routes correctly', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/v1/history');
      expect(res.status).toBe(200);
    });
  });

  // ─── F) CORS Dynamic ──────────────────────────────────────
  describe('dynamic CORS', () => {
    it('reflects localhost origin', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'OPTIONS', undefined, {
        'Origin': 'http://localhost:5173',
      });
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('rejects non-localhost origin with 403', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'OPTIONS', undefined, {
        'Origin': 'http://evil.com',
      });
      expect(res.status).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('CORS origin not allowed');
    });
  });

  // ─── G) SSE Reconnection ──────────────────────────────────
  describe('SSE retry field', () => {
    it('sends retry field on SSE connect', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const addr = api.server.address() as { port: number };
      const data = await new Promise<string>((resolve) => {
        const req = http.get({ hostname: '127.0.0.1', port: addr.port, path: '/api/events' }, (res) => {
          let buf = '';
          res.on('data', (chunk) => {
            buf += chunk;
            // Got the retry field, done
            if (buf.includes('retry:')) {
              res.destroy();
              resolve(buf);
            }
          });
        });
        req.on('error', () => {});
      });

      expect(data).toContain('retry: 3000');
    });
  });

  // ─── H) Legacy start job tracking (retired — FAZ4B) ───────
  // /api/start kalıcı 410 LEGACY_START_RETIRED: job takibi run-flow
  // start (detached admission) yüzeyine taşındı. Güvenlik pini: emekli
  // ingress hiçbir detached süreç başlatmaz, hiçbir job kaydı sızdırmaz.
  describe('multi-sprint job tracking', () => {
    it('legacy start never spawns or tracks jobs — 410 on every call, job lookups 404', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, rateLimit: 0 });
      await new Promise<void>((r) => api.server.once('listening', r));

      const res1 = await request(api, '/api/start', 'POST', {});
      expect(res1.status).toBe(410);
      expect(JSON.parse(res1.body).code).toBe('LEGACY_START_RETIRED');
      expect(JSON.parse(res1.body).jobId).toBeUndefined();

      const res2 = await request(api, '/api/start', 'POST', {});
      expect(res2.status).toBe(410);

      expect(vi.mocked(startSprintDetached)).not.toHaveBeenCalled();

      const lookup = await request(api, '/api/job/job-anything');
      expect(lookup.status).toBe(404);
      expect(JSON.parse(lookup.body)).toEqual({ error: 'Job not found' });
    });
  });
});
