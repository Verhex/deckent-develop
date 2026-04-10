import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { Readable } from 'node:stream';

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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  createHttpServer, parseBody, generateApiToken, _resetActiveJob,
  type HttpApi,
} from '../../src/api/server.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

const PROJECT_ROOT = '/tmp/edge-test-project';

// ─── Helpers ────────────────────────────────────────────────────

function makeRequest(
  api: HttpApi,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('No address'));
    const { method = 'GET', body, headers = {} } = options;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    const reqHeaders: Record<string, string | number> = { ...headers };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      { hostname: '127.0.0.1', port: (addr as { port: number }).port, path, method, headers: reqHeaders },
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

async function startServer(opts?: { apiToken?: string; staticDir?: string }): Promise<HttpApi> {
  const api = createHttpServer(PROJECT_ROOT, { port: 0, ...opts });
  await new Promise<void>((r) => api.server.once('listening', r));
  return api;
}

// ─── generateApiToken edge cases ────────────────────────────────
describe('generateApiToken edge cases', () => {
  it('produces exactly 64 hex characters', () => {
    const token = generateApiToken();
    expect(token).toHaveLength(64);
  });

  it('only contains lowercase hex characters', () => {
    const token = generateApiToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates statistically unique tokens across many calls', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateApiToken()));
    // All 100 should be unique (probability of collision is astronomically low)
    expect(tokens.size).toBe(100);
  });

  it('token is suitable as Bearer value in Authorization header', () => {
    const token = generateApiToken();
    const header = `Bearer ${token}`;
    expect(header).toMatch(/^Bearer [0-9a-f]{64}$/);
  });

  it('consecutive calls return different values', () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a).not.toBe(b);
  });
});

// ─── checkAuth (via server behavior) ─────────────────────────────
describe('checkAuth edge cases', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('allows POST with no token configured (auth disabled)', async () => {
    api = await startServer();
    const res = await makeRequest(api, '/api/start', { method: 'POST', body: {} });
    expect(res.status).toBe(202);
  });

  it('returns 401 when Authorization header is absent and token is configured', async () => {
    api = await startServer({ apiToken: 'my-secret-token' });
    const res = await makeRequest(api, '/api/start', { method: 'POST', body: {} });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toContain('authentication required');
  });

  it('returns 403 when wrong token value is supplied', async () => {
    api = await startServer({ apiToken: 'correct-token' });
    const res = await makeRequest(api, '/api/start', {
      method: 'POST', body: {},
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 401 when auth scheme is Basic instead of Bearer', async () => {
    api = await startServer({ apiToken: 'secret' });
    const res = await makeRequest(api, '/api/config', {
      method: 'POST', body: { mode: 'test' },
      headers: { Authorization: 'Basic secret' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer header has no value', async () => {
    api = await startServer({ apiToken: 'secret' });
    const res = await makeRequest(api, '/api/set-directives', {
      method: 'POST', body: { content: 'test' },
      headers: { Authorization: 'Bearer' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header is empty string', async () => {
    api = await startServer({ apiToken: 'secret' });
    const res = await makeRequest(api, '/api/start', {
      method: 'POST', body: {},
      headers: { Authorization: '' },
    });
    expect(res.status).toBe(401);
  });

  it('allows POST with correct token', async () => {
    api = await startServer({ apiToken: 'correct-token' });
    const res = await makeRequest(api, '/api/start', {
      method: 'POST', body: {},
      headers: { Authorization: 'Bearer correct-token' },
    });
    expect(res.status).toBe(202);
  });

  it('GET routes require auth when token is set', async () => {
    api = await startServer({ apiToken: 'secret' });
    // Without token → 401
    const res = await makeRequest(api, '/api/history');
    expect(res.status).toBe(401);
    // With correct token → 200
    const res2 = await makeRequest(api, '/api/history', {
      headers: { Authorization: 'Bearer secret' },
    });
    expect(res2.status).toBe(200);
  });
});

// ─── CORS edge cases ─────────────────────────────────────────────
describe('CORS edge cases', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('GET responses include a localhost CORS header', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const res = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/history',
          method: 'GET',
          headers: { Origin: 'http://localhost:5173' },
        },
        (r) => { resolve(r.headers); r.destroy(); },
      );
      req.on('error', reject);
      req.end();
    });

    // sendJson hardcodes http://localhost:<DEFAULT_PORT> for GET responses
    expect(res['access-control-allow-origin']).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):/);
  });

  it('OPTIONS preflight reflects localhost origin in CORS header', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const res = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/history',
          method: 'OPTIONS',
          headers: { Origin: 'http://localhost:5173' },
        },
        (r) => { resolve({ status: r.statusCode!, headers: r.headers }); r.destroy(); },
      );
      req.on('error', reject);
      req.end();
    });

    expect(res.status).toBe(200);
    // OPTIONS preflight uses allowedOrigin which reflects localhost origins
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('non-localhost origin falls back to default localhost CORS header', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const res = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/history',
          method: 'GET',
          headers: { Origin: 'https://evil.example.com' },
        },
        (r) => { resolve(r.headers); r.destroy(); },
      );
      req.on('error', reject);
      req.end();
    });

    // Non-localhost origins get the default localhost CORS header (not reflected)
    expect(res['access-control-allow-origin']).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)/);
    expect(res['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });

  it('missing origin header uses default localhost CORS', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const res = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: addr.port, path: '/api/history', method: 'GET' },
        (r) => { resolve(r.headers); r.destroy(); },
      );
      req.on('error', reject);
      req.end();
    });

    expect(res['access-control-allow-origin']).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)/);
  });

  it('OPTIONS preflight with non-localhost origin uses default CORS', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const res = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/start',
          method: 'OPTIONS',
          headers: { Origin: 'https://attacker.com' },
        },
        (r) => {
          resolve({ status: r.statusCode!, headers: r.headers });
          r.destroy();
        },
      );
      req.on('error', reject);
      req.end();
    });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).not.toBe('https://attacker.com');
  });
});

// ─── POST body parsing edge cases ───────────────────────────────
describe('POST body parsing edge cases', () => {
  it('parses body sent in multiple chunks', async () => {
    const body = { foo: 'bar', count: 42 };
    const json = JSON.stringify(body);

    const req = new Readable({ read() {} }) as unknown as http.IncomingMessage;

    // Simulate multiple chunk delivery
    const result = parseBody(req);
    (req as NodeJS.EventEmitter).emit('data', Buffer.from(json.slice(0, 5)));
    (req as NodeJS.EventEmitter).emit('data', Buffer.from(json.slice(5)));
    (req as NodeJS.EventEmitter).emit('end');

    expect(await result).toEqual(body);
  });

  it('returns empty object when body is empty string', async () => {
    const req = new Readable({ read() {} }) as unknown as http.IncomingMessage;
    const result = parseBody(req);
    (req as NodeJS.EventEmitter).emit('end');
    expect(await result).toEqual({});
  });

  it('rejects with error on stream error', async () => {
    const req = new Readable({ read() {} }) as unknown as http.IncomingMessage;
    const result = parseBody(req);
    (req as NodeJS.EventEmitter).emit('error', new Error('stream broken'));
    await expect(result).rejects.toThrow('stream broken');
  });

  it('rejects on malformed JSON with trailing garbage', async () => {
    const req = new Readable({ read() {} }) as unknown as http.IncomingMessage;
    const result = parseBody(req);
    (req as NodeJS.EventEmitter).emit('data', Buffer.from('{"ok":true}garbage'));
    (req as NodeJS.EventEmitter).emit('end');
    await expect(result).rejects.toThrow('Invalid JSON body');
  });

  it('parses deeply nested JSON body', async () => {
    const body = { a: { b: { c: { d: [1, 2, 3] } } } };
    const req = new Readable({ read() {} }) as unknown as http.IncomingMessage;
    const result = parseBody(req);
    (req as NodeJS.EventEmitter).emit('data', Buffer.from(JSON.stringify(body)));
    (req as NodeJS.EventEmitter).emit('end');
    expect(await result).toEqual(body);
  });
});

// ─── SSE endpoint edge cases ─────────────────────────────────────
describe('SSE /api/events edge cases', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('responds with correct SSE headers', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const res = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.get(
        { hostname: '127.0.0.1', port: addr.port, path: '/api/events' },
        resolve,
      );
      req.on('error', () => {});
    });

    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
    res.destroy();
  });

  it('SSE response includes CORS header', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const res = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/events',
          headers: { Origin: 'http://localhost:3000' },
        },
        resolve,
      );
      req.on('error', () => {});
    });

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    res.destroy();
  });

  it('multiple SSE clients can connect simultaneously', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const clients = await Promise.all([
      new Promise<http.IncomingMessage>((resolve) => {
        const req = http.get({ hostname: '127.0.0.1', port: addr.port, path: '/api/events' }, resolve);
        req.on('error', () => {});
      }),
      new Promise<http.IncomingMessage>((resolve) => {
        const req = http.get({ hostname: '127.0.0.1', port: addr.port, path: '/api/events' }, resolve);
        req.on('error', () => {});
      }),
    ]);

    for (const client of clients) {
      expect(client.headers['content-type']).toBe('text/event-stream');
      client.destroy();
    }
  });

  it('SSE client disconnect removes client from set', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const client = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.get({ hostname: '127.0.0.1', port: addr.port, path: '/api/events' }, resolve);
      req.on('error', () => {});
    });

    client.destroy();
    // Small delay to allow close event to propagate
    await new Promise((r) => setTimeout(r, 50));
    // Server should still be reachable (no crash)
    const res = await makeRequest(api, '/api/history');
    expect(res.status).toBe(200);
  });
});

// ─── Error response edge cases ───────────────────────────────────
describe('Error response edge cases', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('returns 400 with correct JSON error body for invalid JSON POST', async () => {
    api = await startServer();
    const addr = api.server.address() as { port: number };

    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/set-directives',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': 10 },
        },
        (r) => {
          let data = '';
          r.on('data', (c) => { data += c; });
          r.on('end', () => resolve({ status: r.statusCode!, body: data }));
        },
      );
      req.on('error', reject);
      req.write('{bad json}');
      req.end();
    });

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid JSON body' });
  });

  it('returns 400 for /api/start with non-boolean autoApprove', async () => {
    api = await startServer();
    const res = await makeRequest(api, '/api/start', {
      method: 'POST',
      body: { autoApprove: 'yes' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 with correct error message format', async () => {
    api = await startServer({ apiToken: 'token' });
    const res = await makeRequest(api, '/api/start', { method: 'POST', body: {} });
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('error');
    expect(body.error).toBe('authentication required');
  });

  it('returns 404 for completely unknown route', async () => {
    api = await startServer();
    const res = await makeRequest(api, '/totally/unknown/path');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
  });

  it('returns idle state for /api/status when dashboard does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    api = await startServer();
    const res = await makeRequest(api, '/api/status');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.idle).toBe(true);
    expect(body.sprint.phase).toBe('IDLE');
  });

  it('returns idle state for /api/status when dashboard contains invalid JSON', async () => {
    mockExistsSync.mockImplementation((p) =>
      typeof p === 'string' && p.endsWith('.dashboard'),
    );
    mockReadFileSync.mockReturnValue('not-json!!!');
    api = await startServer();
    const res = await makeRequest(api, '/api/status');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.idle).toBe(true);
    expect(body.sprint.phase).toBe('IDLE');
  });

  it('returns 405 for unsupported HTTP methods', async () => {
    api = await startServer();
    const res = await makeRequest(api, '/api/status', { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(JSON.parse(res.body)).toEqual({ error: 'Method not allowed' });
  });

  it('returns 500 when plan throws an error', async () => {
    const { planSprint } = await import('../../src/orchestra/brain.js');
    vi.mocked(planSprint).mockImplementation(() => { throw new Error('AI planner failed'); });

    api = await startServer();
    const res = await makeRequest(api, '/api/plan', { method: 'POST', body: {} });
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'AI planner failed' });
  });

  it('returns 500 when killWorker throws', async () => {
    const { killWorker } = await import('../../src/orchestra/tmux.js');
    vi.mocked(killWorker).mockImplementation(() => { throw new Error('tmux session not found'); });

    api = await startServer();
    const res = await makeRequest(api, '/api/kill/valid-id', { method: 'POST', body: {} });
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'tmux session not found' });
  });

  it('returns 400 for /api/kill with empty workerId', async () => {
    api = await startServer();
    // URL ends with /api/kill/ — empty workerId segment
    const res = await makeRequest(api, '/api/kill/', { method: 'POST', body: {} });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Missing workerId' });
  });

  it('returns 400 for /api/kill with path-traversal workerId', async () => {
    api = await startServer();
    const res = await makeRequest(api, '/api/kill/../../../etc/passwd', { method: 'POST', body: {} });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid workerId' });
  });

  it('returns 500 when set-directives writeFileSync throws', async () => {
    mockWriteFileSync.mockImplementation(() => { throw new Error('EACCES: permission denied'); });

    api = await startServer();
    const res = await makeRequest(api, '/api/set-directives', {
      method: 'POST',
      body: { content: '## Task\nDo something' },
    });
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body).error).toContain('EACCES');
  });

  it('returns error JSON with "error" field on all error responses', async () => {
    api = await startServer();
    const routes = [
      { path: '/totally/unknown', method: 'GET' },
      { path: '/api/status', method: 'DELETE' },
    ];

    for (const { path, method } of routes) {
      const res = await makeRequest(api, path, { method });
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    }
  });
});

// ─── createHttpServer options overloads ──────────────────────────
describe('createHttpServer overloads', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('accepts port number as second argument', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const addr = api.server.address();
    expect(addr).toBeTruthy();
    expect(typeof addr).toBe('object');
  });

  it('accepts options object as second argument', async () => {
    api = createHttpServer(PROJECT_ROOT, { port: 0 });
    await new Promise<void>((r) => api.server.once('listening', r));
    const addr = api.server.address();
    expect(addr).toBeTruthy();
  });

  it('close() resolves and stops accepting connections', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const addr = api.server.address() as { port: number };

    await api.close();

    // Server should no longer be listening
    const connected = await new Promise<boolean>((resolve) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: addr.port, path: '/api/history' },
        () => resolve(true),
      );
      req.on('error', () => resolve(false));
      req.end();
    });

    expect(connected).toBe(false);
  });
});
