import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

// ─── Mocks ──────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn(() => ({
    ok: true,
    checks: [{ name: 'Node', passed: true, message: 'v18.0.0', required: true }],
  })),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  killWorker: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({
    activeModeConfig: { brain_model: 'opus', default_model: 'sonnet', haiku_allowed: false, max_workers: 4 },
  })),
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
  planSprint: vi.fn(() => ({
    id: 'sprint-001',
    number: 1,
    tasks: [{ id: '001-001', title: 'Test task' }],
  })),
}));

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createHttpServer, _resetActiveJob, type HttpApi } from '../../src/api/server.js';
import { readJsonSafe } from '../../src/core/utils.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadJsonSafe = vi.mocked(readJsonSafe);

// ─── Helpers ────────────────────────────────────────────────────
const PROJECT_ROOT = '/tmp/test-project';

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
    const requestHeaders: Record<string, string> = headers ?? {};
    if (payload) {
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Content-Length'] = String(Buffer.byteLength(payload));
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: requestHeaders,
      },
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

describe('Security Headers', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
    mockReadJsonSafe.mockReturnValue(null);
    // Enable auth bypass so we can test headers without token setup
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
  });

  afterEach(async () => {
    if (api) await api.close();
    delete process.env['DECKENT_API_AUTH_DISABLED'];
  });

  describe('API response headers', () => {
    it('API responses include Content-Type: application/json', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.headers['content-type']).toContain('application/json');
      stderrSpy.mockRestore();
    });

    it('API responses include Access-Control-Allow-Origin', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
      stderrSpy.mockRestore();
    });

    it('CORS preflight (OPTIONS) returns 200 with CORS headers for localhost', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'OPTIONS', undefined, {
        'Origin': 'http://localhost:3100',
      });
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-methods']).toBeDefined();
      expect(res.headers['access-control-allow-headers']).toBeDefined();
      stderrSpy.mockRestore();
    });

    it('CORS preflight rejects non-localhost origins', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'OPTIONS', undefined, {
        'Origin': 'https://attacker.com',
      });
      expect(res.status).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('CORS origin not allowed');
      stderrSpy.mockRestore();
    });

    it('unknown API routes return 404 with JSON error', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      stderrSpy.mockRestore();
    });

    it('unsupported methods return 405', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'DELETE');
      expect(res.status).toBe(405);
      stderrSpy.mockRestore();
    });

    it('security headers (X-Content-Type-Options, X-Frame-Options, CSP, HSTS) are present', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['strict-transport-security']).toContain('max-age=');
      stderrSpy.mockRestore();
    });
  });
});
