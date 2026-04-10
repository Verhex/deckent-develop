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

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(async () => ({ id: 'sprint-001', status: 'COMPLETE' })),
  readContext: vi.fn(() => ({ debt: [], patterns: [], memory: '' })),
  planSprint: vi.fn(() => ({
    id: 'sprint-001',
    number: 1,
    tasks: [{ id: '001-001', title: 'Test task' }],
  })),
}));

import { existsSync, writeFileSync } from 'node:fs';
import { createHttpServer, generateApiToken, _resetActiveJob, type HttpApi } from '../../src/api/server.js';

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// ─── Helpers ────────────────────────────────────────────────────
const PROJECT_ROOT = '/tmp/test-auth';

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
    const reqHeaders: Record<string, string> = {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
      ...headers,
    };
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

describe('generateApiToken', () => {
  it('returns a 64-char hex string', () => {
    const token = generateApiToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates unique tokens on each call', () => {
    const t1 = generateApiToken();
    const t2 = generateApiToken();
    expect(t1).not.toBe(t2);
  });
});

describe('API auth with token', () => {
  let api: HttpApi;
  const TOKEN = 'test-token-abc123';

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('POST /api/start with valid bearer token returns 202', async () => {
    api = createHttpServer(PROJECT_ROOT, 0, undefined, TOKEN);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/start', 'POST', { autoApprove: true }, {
      'Authorization': `Bearer ${TOKEN}`,
    });
    expect(res.status).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('started');
  });

  it('POST /api/start without token returns 401 when auth is configured', async () => {
    api = createHttpServer(PROJECT_ROOT, 0, undefined, TOKEN);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/start', 'POST', { autoApprove: true });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toContain('authentication required');
  });

  it('POST /api/set-directives without token returns 401', async () => {
    api = createHttpServer(PROJECT_ROOT, 0, undefined, TOKEN);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/set-directives', 'POST', { content: '# Test' });
    expect(res.status).toBe(401);
  });

  it('POST /api/set-directives with valid token succeeds', async () => {
    api = createHttpServer(PROJECT_ROOT, 0, undefined, TOKEN);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/set-directives', 'POST', { content: '# Sprint\n## Task 1\nDo thing' }, {
      'Authorization': `Bearer ${TOKEN}`,
    });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('POST with wrong token returns 403', async () => {
    api = createHttpServer(PROJECT_ROOT, 0, undefined, TOKEN);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/start', 'POST', {}, {
      'Authorization': 'Bearer wrong-token',
    });
    expect(res.status).toBe(403);
  });

  it('GET endpoints require auth when token is configured (health endpoint excepted)', async () => {
    api = createHttpServer(PROJECT_ROOT, 0, undefined, TOKEN);
    await new Promise<void>((r) => api.server.once('listening', r));

    // GET /api/doctor without token should be rejected (auth enforced per DIRECTIVES Sprint 133 Task 3)
    const res = await request(api, '/api/doctor');
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toContain('authentication required');

    // But with valid token it should work
    const okRes = await request(api, '/api/doctor', 'GET', undefined, {
      'Authorization': `Bearer ${TOKEN}`,
    });
    expect(okRes.status).toBe(200);
  });

  it('POST endpoints work without auth when no token is configured', async () => {
    // No token — auth disabled (backward-compatible)
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/start', 'POST', { autoApprove: true });
    expect(res.status).toBe(202);
  });
});

describe('CORS headers', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('CORS origin restricts to localhost', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/status', 'OPTIONS');
    expect(res.status).toBe(200);
    const origin = res.headers['access-control-allow-origin'] as string;
    expect(origin).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)/);
  });

  it('CORS allows Authorization header', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/status', 'OPTIONS');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });

  it('response includes CORS origin header on GET', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/doctor');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});
