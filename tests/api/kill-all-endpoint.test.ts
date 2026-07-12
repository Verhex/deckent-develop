import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

// ─── Mocks ──────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
  writeFileSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  killWorker: vi.fn(),
  killAllWorkers: vi.fn(() => 0),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(async () => ({
    activeModeConfig: { brain_model: 'opus', default_model: 'sonnet', haiku_allowed: false, max_workers: 4 },
  })),
  deepMerge: vi.fn((base: Record<string, unknown>, override: Record<string, unknown>) => ({ ...base, ...override })),
  validatePartialConfig: vi.fn(),
  createDefaultConfig: vi.fn(() => ({ mode: 'balanced', max_workers: 4, brain_model: 'opus' })),
  ConfigValidationError: class extends Error { name = 'ConfigValidationError'; errors: string[] = []; },
  resolveChatProvider: vi.fn(() => null),
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
  startSprintDetached: vi.fn(() => ({ jobId: 'job-test' })),
}));

import { createHttpServer, type HttpApi, _resetActiveJob } from '../../src/api/server.js';
import { killWorker, killAllWorkers } from '../../src/orchestra/tmux.js';

const mockKillAllWorkers = vi.mocked(killAllWorkers);
const mockKillWorker = vi.mocked(killWorker);

const PROJECT_ROOT = '/tmp/test-kill-all-project';

function request(
  api: HttpApi,
  path: string,
  method = 'POST',
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('No address'));
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body: data }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('POST /api/kill/all', () => {
  let api: HttpApi;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockKillAllWorkers.mockReturnValue(0);
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(async () => {
    if (api) await api.close();
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    stderrSpy?.mockRestore();
  });

  it('kills all workers and returns count when workers exist', async () => {
    mockKillAllWorkers.mockReturnValue(3);
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/kill/all');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.killed).toBe(3);
    expect(mockKillAllWorkers).toHaveBeenCalledOnce();
  });

  it('returns killed=0 when no active workers', async () => {
    mockKillAllWorkers.mockReturnValue(0);
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/kill/all');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.killed).toBe(0);
  });

  it('returns 500 when killAllWorkers throws', async () => {
    mockKillAllWorkers.mockImplementation(() => { throw new Error('tmux unavailable'); });
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/kill/all');
    expect(res.status).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('tmux unavailable');
  });

  it('returns 401 when auth is required and no token provided', async () => {
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'secret-token' });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/kill/all');
    expect(res.status).toBe(401);
  });

  it('POST /api/kill/:workerId still works (regression)', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await request(api, '/api/kill/279-001');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockKillWorker).toHaveBeenCalledWith('279-001');
    expect(mockKillAllWorkers).not.toHaveBeenCalled();
  });
});
