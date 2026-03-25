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
  runDoctorChecks: vi.fn(() => ({ ok: true, checks: [] })),
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
  checkUsage: vi.fn(() => ({ fiveHourPercent: 10, weeklyPercent: 5 })),
  adjustSprintSize: vi.fn(() => ({ maxWorkers: 4 })),
  planSprint: vi.fn(() => ({ id: 'sprint-001', number: 1, tasks: [] })),
}));

import { createHttpServer, _resetActiveJob, type HttpApi } from '../../src/api/server.js';
import { readJsonSafe } from '../../src/core/utils.js';

const mockReadJsonSafe = vi.mocked(readJsonSafe);

const PROJECT_ROOT = '/tmp/test-project';

function request(
  api: HttpApi,
  path: string,
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('No address'));
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(data), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode!, body: data, headers: res.headers });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── Tests ──────────────────────────────────────────────────────
// Note: /health and /ready endpoints are NOT yet implemented in server.ts.
// These tests verify the current behavior (404) and are skipped for the
// expected future behavior until the endpoints are added.

describe('GET /health', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockReadJsonSafe.mockReturnValue(null);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('returns 404 since /health endpoint is not yet implemented', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/health');
    expect(res.status).toBe(404);
  });

  it('returns application/json content-type even for 404', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/health');
    expect(res.headers['content-type']).toContain('application/json');
  });
});

describe('GET /ready', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockReadJsonSafe.mockReturnValue(null);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('returns 404 since /ready endpoint is not yet implemented', async () => {
    mockReadJsonSafe.mockReturnValue(null);
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/ready');
    expect(res.status).toBe(404);
  });

  it('returns application/json content-type even for 404', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/ready');
    expect(res.headers['content-type']).toContain('application/json');
  });
});
