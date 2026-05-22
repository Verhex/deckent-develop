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
  deepMerge: vi.fn((base: Record<string, unknown>, override: Record<string, unknown>) => ({ ...base, ...override })),
  validatePartialConfig: vi.fn(),
  createDefaultConfig: vi.fn(() => ({ mode: 'balanced', max_workers: 4, brain_model: 'opus' })),
  ConfigValidationError: class extends Error { name = 'ConfigValidationError'; errors: string[] = []; },
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
  cleanup: vi.fn(),
}));

import { readFileSync, existsSync, readdirSync, writeFileSync, watch } from 'node:fs';
import { createHttpServer, parseBody, _resetActiveJob, type HttpApi } from '../../src/api/server.js';
import { watchDashboard } from '../../src/api/watcher.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';
import { killWorker } from '../../src/orchestra/tmux.js';
import { readWorkerLog } from '../../src/agents/worker.js';
import { readJsonSafe } from '../../src/core/utils.js';
import { runSprint, cleanup } from '../../src/orchestra/brain.js';
import { validatePartialConfig, deepMerge } from '../../src/core/config.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRunDoctorChecks = vi.mocked(runDoctorChecks);
const mockKillWorker = vi.mocked(killWorker);
const mockReadWorkerLog = vi.mocked(readWorkerLog);
const mockRunSprint = vi.mocked(runSprint);
const mockCleanup = vi.mocked(cleanup);
const mockReadJsonSafe = vi.mocked(readJsonSafe);
const mockValidatePartialConfig = vi.mocked(validatePartialConfig);
const mockDeepMerge = vi.mocked(deepMerge);

// ─── Helpers ────────────────────────────────────────────────────
const PROJECT_ROOT = '/tmp/test-project';

function request(
  api: HttpApi,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
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
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : undefined,
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

const dashboardJson = JSON.stringify({
  sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE', status: 'ACTIVE' },
  agents: [],
  progress: { done: 2, active: 1, blocked: 0, total: 4 },
  alerts: [],
  updatedAt: '2026-01-01T00:00:00Z',
});

const sprintMd = `# sprint-001

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 3 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 85% |
| Duration | 60000ms |

## Tasks
- 001-001: Setup project (DONE)
- 001-002: Add tests (DONE)
`;

// ─── Tests ──────────────────────────────────────────────────────
describe('createHttpServer', () => {
  let api: HttpApi;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
    mockReadJsonSafe.mockReturnValue(null);
    // Auth bypass for non-auth-focused tests
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(async () => {
    if (api) await api.close();
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    stderrSpy?.mockRestore();
  });

  it('starts and listens on given port', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const addr = api.server.address();
    expect(addr).not.toBeNull();
    expect(typeof addr).toBe('object');
  });

  // ─── Existing GET endpoints ─────────────────────────────────

  describe('GET /api/status', () => {
    it('returns idle state when dashboard file missing', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));
      const res = await request(api, '/api/status');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.idle).toBe(true);
      expect(body.sprint.phase).toBe('IDLE');
      expect(body.sprint.status).toBe('IDLE');
      expect(body.agents).toEqual([]);
      expect(body.progress.total).toBe(0);
    });

    it('returns dashboard JSON when file exists', async () => {
      mockReadJsonSafe.mockReturnValue(JSON.parse(dashboardJson));

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      const body = JSON.parse(res.body);
      expect(body.sprint.id).toBe('sprint-001');
    });
  });

  describe('GET /api/sprint', () => {
    it('returns 404 when no sprints dir', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/sprint');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'No sprint logs found' });
    });

    it('returns 404 when sprints dir empty', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('sprints')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/sprint');
      expect(res.status).toBe(404);
    });

    it('returns latest sprint log', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('sprints')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue(['sprint-001.md', 'sprint-002.md'] as unknown as ReturnType<typeof readdirSync>);
      mockReadFileSync.mockReturnValue(sprintMd);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/sprint');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('sprint-001');
      expect(body.metrics.tasks).toBe('4');
      expect(body.tasks).toHaveLength(2);
      expect(body.tasks[0]).toContain('Setup project');
    });
  });

  describe('GET /api/history', () => {
    it('returns empty array when no sprints', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/history');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual([]);
    });

    it('returns all sprint logs', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('sprints')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
      mockReadFileSync.mockReturnValue(sprintMd);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/history');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe('sprint-001');
    });
  });

  describe('GET /api/events (SSE)', () => {
    it('returns SSE headers', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const addr = api.server.address() as { port: number };
      const res = await new Promise<http.IncomingMessage>((resolve) => {
        const req = http.get({ hostname: '127.0.0.1', port: addr.port, path: '/api/events' }, resolve);
        req.on('error', () => {});
      });

      expect(res.headers['content-type']).toBe('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache');
      res.destroy();
    });
  });

  // ─── New GET endpoints ──────────────────────────────────────

  describe('GET /api/config', () => {
    it('returns 404 when config missing', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Config not found' });
    });

    it('returns config JSON when file exists', async () => {
      const configData = { mode: 'performance', max_workers: 4 };
      mockReadJsonSafe.mockReturnValue(configData);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual(configData);
    });
  });

  describe('GET /api/doctor', () => {
    it('returns doctor checks', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/doctor');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.checks).toHaveLength(1);
      expect(body.checks[0].name).toBe('Node');
      expect(mockRunDoctorChecks).toHaveBeenCalledWith(PROJECT_ROOT);
    });
  });

  describe('GET /api/memory', () => {
    it('returns 404 when memory file missing', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/memory');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Memory export not found' });
    });

    it('returns memory content when the export exists', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('memory.md')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue('# Memory\n- Item 1');

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/memory');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.content).toBe('# Memory\n- Item 1');
    });
  });

  describe('GET /api/debt', () => {
    it('returns 404 when debt file missing', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/debt');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Debt file not found' });
    });

    it('returns debt content when file exists', async () => {
      mockExistsSync.mockImplementation((p) => {
        // Task #4d: /api/debt now serves the generated exports/debt.md view.
        if (typeof p === 'string' && p.includes('debt.md')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue('# Tech Debt\n| ID | Desc |');

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/debt');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.content).toBe('# Tech Debt\n| ID | Desc |');
    });
  });

  describe('GET /api/tasks', () => {
    it('returns empty array when .tasks/ does not exist', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/tasks');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual([]);
    });

    it('returns task list when task files exist', async () => {
      const taskData = { id: '001-001', title: 'Test task', status: 'PENDING' };
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('.tasks')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue(['task-001-001.json'] as unknown as ReturnType<typeof readdirSync>);
      mockReadFileSync.mockReturnValue(JSON.stringify(taskData));

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/tasks');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // ─── CORS Preflight ─────────────────────────────────────────

  describe('OPTIONS (CORS preflight)', () => {
    it('returns 200 with CORS headers', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'OPTIONS');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)/);
      expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
      expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
    });
  });

  // ─── POST endpoints ────────────────────────────────────────

  describe('POST /api/chat', () => {
    it('returns 200 with a reply for a help message (no longer a 404 stub)', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/chat', 'POST', { message: 'help' });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as { reply: string };
      expect(typeof body.reply).toBe('string');
      expect(body.reply.toLowerCase()).toContain('status');
    });

    it('returns 400 when message is missing', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/chat', 'POST', {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/start', () => {
    it('returns 202 and starts sprint', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/start', 'POST', { autoApprove: true });
      expect(res.status).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('started');
      expect(body.jobId).toMatch(/^job-/);
    });

    it('returns 409 when sprint already running', async () => {
      // Make runSprint hang so the job stays in 'running' state
      mockRunSprint.mockImplementation(() => new Promise(() => {}) as never);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res1 = await request(api, '/api/start', 'POST', {});
      expect(res1.status).toBe(202);

      const res2 = await request(api, '/api/start', 'POST', {});
      expect(res2.status).toBe(409);
      expect(JSON.parse(res2.body)).toEqual({ error: 'Sprint already running' });
    });
  });

  describe('POST /api/plan', () => {
    it('returns plan JSON', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/plan', 'POST', { directive: 'build dashboard' });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('sprint-001');
      expect(body.tasks).toHaveLength(1);
    });

    it('passes mode param to planSprint', async () => {
      const { planSprint: mockPlanSprint } = await import('../../src/orchestra/brain.js');
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      await request(api, '/api/plan', 'POST', { mode: 'structured' });
      expect(vi.mocked(mockPlanSprint)).toHaveBeenCalledWith(
        expect.any(String), expect.anything(), expect.anything(), expect.anything(),
        expect.objectContaining({ mode: 'structured' }),
      );
    });

    it('response includes reasoning when present', async () => {
      const { planSprint: mockPlanSprint } = await import('../../src/orchestra/brain.js');
      vi.mocked(mockPlanSprint).mockReturnValue({
        id: 'sprint-001', number: 1, tasks: [{ id: '001-001', title: 'T' }],
        reasoning: 'AI reasoning', planningMode: 'ai',
      } as never);
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/plan', 'POST', {});
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.reasoning).toBe('AI reasoning');
      expect(body.planningMode).toBe('ai');
    });
  });

  describe('POST /api/kill/:workerId', () => {
    it('kills worker and returns success', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/kill/001-001', 'POST', {});
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ success: true });
      expect(mockKillWorker).toHaveBeenCalledWith('001-001');
    });

    it('returns 500 when kill fails', async () => {
      mockKillWorker.mockImplementation(() => { throw new Error('tmux error'); });
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/kill/bad-id', 'POST', {});
      expect(res.status).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ error: 'tmux error' });
    });
  });

  describe('POST /api/set-directives', () => {
    it('writes directives and returns task count', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const content = '# Sprint\n## Task 1\nDo thing\n## Task 2\nDo other thing';
      const res = await request(api, '/api/set-directives', 'POST', { content });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.taskCount).toBe(2);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('returns 400 when content is missing', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/set-directives', 'POST', {});
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Missing content field' });
    });
  });

  describe('POST /api/cleanup', () => {
    it('returns success with file counts when no active tasks', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && (p.includes('.tasks') || p.includes('.locks'))) return true;
        return false;
      });
      mockReaddirSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('.tasks')) {
          return ['task-001-001.json', 'task-001-001.hb', 'task-001-001.result'] as unknown as ReturnType<typeof readdirSync>;
        }
        if (typeof p === 'string' && p.includes('.locks')) {
          return ['some.lock'] as unknown as ReturnType<typeof readdirSync>;
        }
        return [] as unknown as ReturnType<typeof readdirSync>;
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({ id: '001-001', status: 'DONE', sprintId: 'sprint-001' }));
      mockCleanup.mockImplementation(() => undefined);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/cleanup', 'POST', {});
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(typeof body.removedTasks).toBe('number');
      expect(typeof body.removedLocks).toBe('number');
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('returns 409 when sprint is active (EXECUTING task exists)', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('.tasks')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue(['task-001-001.json'] as unknown as ReturnType<typeof readdirSync>);
      mockReadJsonSafe.mockReturnValue({ id: '001-001', status: 'EXECUTING', sprintId: 'sprint-001' });

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/cleanup', 'POST', {});
      expect(res.status).toBe(409);
      expect(JSON.parse(res.body)).toEqual({ error: 'Cannot cleanup while sprint is active' });
      expect(mockCleanup).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/config', () => {
    it('merges and writes config', async () => {
      const existingConfig = { mode: 'performance', max_workers: 2 };
      mockReadJsonSafe.mockReturnValue(existingConfig);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config', 'POST', { max_workers: 4 });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.mode).toBe('performance');
      expect(body.max_workers).toBe(4);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('creates config from scratch when none exists', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config', 'POST', { mode: 'balanced' });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.mode).toBe('balanced');
    });
  });

  // ─── Config Round-Trip — POST → GET ─────────────────────────

  describe('Config round-trip — POST → GET', () => {
    it('mode field: POST economic → GET returns economic', async () => {
      // config write→read round-trip
      mockReadJsonSafe.mockReturnValue({ mode: 'balanced', max_workers: 4 });

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const postRes = await request(api, '/api/config', 'POST', { mode: 'economic' });
      expect(postRes.status).toBe(200);
      expect(JSON.parse(postRes.body).mode).toBe('economic');

      // Simulate disk read-back: capture what writeFileSync received
      const writtenJson = mockWriteFileSync.mock.calls[0]?.[1] as string;
      mockReadJsonSafe.mockReturnValue(JSON.parse(writtenJson));

      const getRes = await request(api, '/api/config');
      expect(getRes.status).toBe(200);
      expect(JSON.parse(getRes.body).mode).toBe('economic');
    });

    it('language field: POST tr → GET returns tr', async () => {
      // POST /api/config → GET /api/config config write/read round-trip
      mockReadJsonSafe.mockReturnValue({ mode: 'balanced' });

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const postRes = await request(api, '/api/config', 'POST', { language: 'tr' });
      expect(postRes.status).toBe(200);
      expect(JSON.parse(postRes.body).language).toBe('tr');

      const writtenJson = mockWriteFileSync.mock.calls[0]?.[1] as string;
      mockReadJsonSafe.mockReturnValue(JSON.parse(writtenJson));

      const getRes = await request(api, '/api/config');
      expect(getRes.status).toBe(200);
      expect(JSON.parse(getRes.body).language).toBe('tr');
    });

    it('nested key: POST { git: { auto_commit: true } } → GET returns git.auto_commit true', async () => {
      mockReadJsonSafe.mockReturnValue({ mode: 'balanced' });

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const postRes = await request(api, '/api/config', 'POST', { git: { auto_commit: true } });
      expect(postRes.status).toBe(200);
      const postBody = JSON.parse(postRes.body);
      expect(postBody.git).toBeDefined();
      expect(postBody.git.auto_commit).toBe(true);

      const writtenJson = mockWriteFileSync.mock.calls[0]?.[1] as string;
      mockReadJsonSafe.mockReturnValue(JSON.parse(writtenJson));

      const getRes = await request(api, '/api/config');
      expect(getRes.status).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.git.auto_commit).toBe(true);
    });

    it('memory_budget 900: writeFileSync called with memory_budget: 900', async () => {
      mockReadJsonSafe.mockReturnValue({ mode: 'balanced' });

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const postRes = await request(api, '/api/config', 'POST', { memory_budget: 900 });
      expect(postRes.status).toBe(200);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenJson = mockWriteFileSync.mock.calls[0]?.[1] as string;
      const writtenConfig = JSON.parse(writtenJson);
      expect(writtenConfig.memory_budget).toBe(900);
    });

    it('invalid config → returns 422 with VALIDATION_ERROR code', async () => {
      // Make validatePartialConfig throw a ConfigValidationError
      mockValidatePartialConfig.mockImplementationOnce(() => {
        const err = Object.assign(new Error('Validation failed'), {
          name: 'ConfigValidationError',
          errors: ['max_workers must be a positive number'],
        });
        throw err;
      });

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config', 'POST', { max_workers: -1 });
      expect(res.status).toBe(422);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Config validation failed');
      expect(Array.isArray(body.error.details)).toBe(true);
    });

    it('deepMerge preserves existing fields — only sent keys change', async () => {
      const existingConfig = { mode: 'balanced', max_workers: 4, brain_model: 'opus', language: 'en' };
      mockReadJsonSafe.mockReturnValue(existingConfig);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      // Only send mode — shallow mock spreads base + override
      const postRes = await request(api, '/api/config', 'POST', { mode: 'economic' });
      expect(postRes.status).toBe(200);
      const postBody = JSON.parse(postRes.body);
      expect(postBody.mode).toBe('economic');
      expect(postBody.max_workers).toBe(4);       // preserved
      expect(postBody.brain_model).toBe('opus');  // preserved
      expect(postBody.language).toBe('en');       // preserved
    });

    it('round-trip with 5 fields: POST → GET values match', async () => {
      // POST /api/config → GET /api/config config write/read round-trip for 5 fields
      const initial = { mode: 'balanced', max_workers: 2, brain_model: 'haiku', language: 'en', memory_budget: 600 };
      mockReadJsonSafe.mockReturnValue(initial);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const update = { mode: 'performance', max_workers: 8, brain_model: 'opus', language: 'tr', memory_budget: 900 };
      const postRes = await request(api, '/api/config', 'POST', update);
      expect(postRes.status).toBe(200);
      const postBody = JSON.parse(postRes.body);

      // All 5 updated fields present in POST response
      expect(postBody.mode).toBe('performance');
      expect(postBody.max_workers).toBe(8);
      expect(postBody.brain_model).toBe('opus');
      expect(postBody.language).toBe('tr');
      expect(postBody.memory_budget).toBe(900);

      // Simulate disk read-back
      const writtenJson = mockWriteFileSync.mock.calls[0]?.[1] as string;
      mockReadJsonSafe.mockReturnValue(JSON.parse(writtenJson));

      const getRes = await request(api, '/api/config');
      expect(getRes.status).toBe(200);
      const getBody = JSON.parse(getRes.body);

      // GET values must match POST response (round-trip)
      expect(getBody.mode).toBe('performance');
      expect(getBody.max_workers).toBe(8);
      expect(getBody.brain_model).toBe('opus');
      expect(getBody.language).toBe('tr');
      expect(getBody.memory_budget).toBe(900);
    });

    it('nested key round-trip: skill_routing sub-keys merged correctly', async () => {
      // Override deepMerge mock for this test with a real recursive implementation
      mockDeepMerge.mockImplementationOnce((base, override) => {
        function realDeepMerge(
          b: Record<string, unknown>,
          o: Record<string, unknown>,
        ): Record<string, unknown> {
          const result = { ...b };
          for (const key of Object.keys(o)) {
            const bv = b[key];
            const ov = o[key];
            if (
              bv !== null && typeof bv === 'object' && !Array.isArray(bv) &&
              ov !== null && typeof ov === 'object' && !Array.isArray(ov)
            ) {
              result[key] = realDeepMerge(bv as Record<string, unknown>, ov as Record<string, unknown>);
            } else {
              result[key] = ov;
            }
          }
          return result;
        }
        return realDeepMerge(
          base as Record<string, unknown>,
          override as Record<string, unknown>,
        ) as typeof base;
      });

      const initial = { mode: 'balanced', skill_routing: { testing: true, security: false, documentation: true } };
      mockReadJsonSafe.mockReturnValue(initial);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      // Only update security sub-key — testing and documentation should be preserved
      const postRes = await request(api, '/api/config', 'POST', { skill_routing: { security: true } });
      expect(postRes.status).toBe(200);
      const postBody = JSON.parse(postRes.body);
      expect(postBody.skill_routing.testing).toBe(true);       // preserved
      expect(postBody.skill_routing.security).toBe(true);      // updated
      expect(postBody.skill_routing.documentation).toBe(true); // preserved

      // Simulate disk read-back
      const writtenJson = mockWriteFileSync.mock.calls[0]?.[1] as string;
      mockReadJsonSafe.mockReturnValue(JSON.parse(writtenJson));

      // GET returns the same merged state
      const getRes = await request(api, '/api/config');
      expect(getRes.status).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.skill_routing.testing).toBe(true);
      expect(getBody.skill_routing.security).toBe(true);
      expect(getBody.skill_routing.documentation).toBe(true);
    });

    it('nested key round-trip: modes.performance.max_workers preserved', async () => {
      // Override deepMerge mock with real recursive implementation
      mockDeepMerge.mockImplementationOnce((base, override) => {
        function realDeepMerge(
          b: Record<string, unknown>,
          o: Record<string, unknown>,
        ): Record<string, unknown> {
          const result = { ...b };
          for (const key of Object.keys(o)) {
            const bv = b[key];
            const ov = o[key];
            if (
              bv !== null && typeof bv === 'object' && !Array.isArray(bv) &&
              ov !== null && typeof ov === 'object' && !Array.isArray(ov)
            ) {
              result[key] = realDeepMerge(bv as Record<string, unknown>, ov as Record<string, unknown>);
            } else {
              result[key] = ov;
            }
          }
          return result;
        }
        return realDeepMerge(
          base as Record<string, unknown>,
          override as Record<string, unknown>,
        ) as typeof base;
      });

      const initial = {
        mode: 'balanced',
        modes: { performance: { max_workers: 4, brain_model: 'opus' }, balanced: { max_workers: 2 } },
      };
      mockReadJsonSafe.mockReturnValue(initial);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      // Only update max_workers inside performance mode
      const postRes = await request(api, '/api/config', 'POST', {
        modes: { performance: { max_workers: 8 } },
      });
      expect(postRes.status).toBe(200);
      const postBody = JSON.parse(postRes.body);
      expect(postBody.modes.performance.max_workers).toBe(8);             // updated
      expect(postBody.modes.performance.brain_model).toBe('opus');        // preserved
      expect(postBody.modes.balanced.max_workers).toBe(2);               // sibling preserved

      // Simulate disk read-back
      const writtenJson = mockWriteFileSync.mock.calls[0]?.[1] as string;
      mockReadJsonSafe.mockReturnValue(JSON.parse(writtenJson));

      const getRes = await request(api, '/api/config');
      expect(getRes.status).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.modes.performance.max_workers).toBe(8);
      expect(getBody.modes.performance.brain_model).toBe('opus');
      expect(getBody.modes.balanced.max_workers).toBe(2);
    });
  });

  // ─── GET /api/job/:jobId ────────────────────────────────────

  describe('GET /api/job/:jobId', () => {
    it('returns 404 when no active job', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/job/nonexistent');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Job not found' });
    });

    it('returns job status after start', async () => {
      // Make runSprint hang so the job stays in 'running' state
      mockRunSprint.mockImplementation(() => new Promise(() => {}) as never);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const startRes = await request(api, '/api/start', 'POST', {});
      const { jobId } = JSON.parse(startRes.body) as { jobId: string };

      const res = await request(api, `/api/job/${jobId}`);
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(jobId);
      expect(body.status).toBe('running');
    });

    it('returns completed job after sprint finishes', async () => {
      mockRunSprint.mockResolvedValue({ id: 'sprint-001', status: 'COMPLETE' } as never);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const startRes = await request(api, '/api/start', 'POST', {});
      const { jobId } = JSON.parse(startRes.body) as { jobId: string };

      // Wait for the background promise to resolve
      await new Promise((r) => setTimeout(r, 50));

      const res = await request(api, `/api/job/${jobId}`);
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('completed');
      expect(body.result).toEqual({ id: 'sprint-001', status: 'COMPLETE' });
    });

    it('returns failed job when sprint errors', async () => {
      mockRunSprint.mockRejectedValue(new Error('Spawn failed'));

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const startRes = await request(api, '/api/start', 'POST', {});
      const { jobId } = JSON.parse(startRes.body) as { jobId: string };

      await new Promise((r) => setTimeout(r, 50));

      const res = await request(api, `/api/job/${jobId}`);
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('failed');
      expect(body.error).toBe('Spawn failed');
    });
  });

  // ─── GET /api/worker/:taskId/log ────────────────────────────

  describe('GET /api/worker/:taskId/log', () => {
    it('returns task and log when both exist', async () => {
      const taskData = { id: '001-001', title: 'Setup project', status: 'EXECUTING', model: 'sonnet' };
      mockReadJsonSafe.mockReturnValue(taskData);
      mockReadWorkerLog.mockReturnValue('Building project...\nTests passed.');

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/worker/001-001/log');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.taskId).toBe('001-001');
      expect(body.log).toBe('Building project...\nTests passed.');
      expect(body.task.title).toBe('Setup project');
      expect(body.task.status).toBe('EXECUTING');
    });

    it('returns null log when no log file exists', async () => {
      const taskData = { id: '001-002', title: 'Add tests', status: 'PENDING' };
      mockReadJsonSafe.mockReturnValue(taskData);
      mockReadWorkerLog.mockReturnValue(null);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/worker/001-002/log');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.taskId).toBe('001-002');
      expect(body.log).toBeNull();
      expect(body.task.title).toBe('Add tests');
    });

    it('returns 404 for nonexistent task', async () => {
      mockReadJsonSafe.mockReturnValue(null);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/worker/999-999/log');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Task not found' });
    });
  });

  // ─── Error handling ─────────────────────────────────────────

  describe('error handling', () => {
    it('returns 405 for unsupported methods', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'PUT');
      expect(res.status).toBe(405);
      expect(JSON.parse(res.body)).toEqual({ error: 'Method not allowed' });
    });

    it('returns 404 for unknown GET routes', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/unknown');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
    });

    it('returns 404 for unknown POST routes', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/unknown', 'POST', {});
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
    });

    it('returns 400 for invalid JSON POST body', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const addr = api.server.address() as { port: number };
      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: addr.port, path: '/api/config', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': 12 } },
          (r) => {
            let data = '';
            r.on('data', (c) => { data += c; });
            r.on('end', () => resolve({ status: r.statusCode!, body: data }));
          },
        );
        req.on('error', reject);
        req.write('not valid!!!');
        req.end();
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid JSON body' });
    });
  });

  describe('dashboard JSON parse error', () => {
    it('returns idle state when dashboard file is invalid JSON', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.dashboard')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue('not valid json{{{');

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.idle).toBe(true);
    });
  });

  describe('static file serving', () => {
    const STATIC_DIR = '/tmp/test-static';

    it('serves static files with correct MIME type', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('style.css')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(Buffer.from('body { color: red; }'));

      api = createHttpServer(PROJECT_ROOT, 0, STATIC_DIR);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/style.css');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/css');
      expect(res.body).toBe('body { color: red; }');
    });

    it('serves index.html for root path', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('index.html')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(Buffer.from('<html></html>'));

      api = createHttpServer(PROJECT_ROOT, 0, STATIC_DIR);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/html');
    });

    it('falls back to index.html for SPA routes', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('index.html')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(Buffer.from('<html>SPA</html>'));

      api = createHttpServer(PROJECT_ROOT, 0, STATIC_DIR);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/settings');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/html');
      expect(res.body).toBe('<html>SPA</html>');
    });

    it('returns 404 when no static dir and unknown route', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/nonexistent');
      expect(res.status).toBe(404);
    });

    it('API routes take priority over static files', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('sprints')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

      api = createHttpServer(PROJECT_ROOT, 0, STATIC_DIR);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/history');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual([]);
    });

    it('returns 404 when static dir set but no index.html fallback', async () => {
      mockExistsSync.mockReturnValue(false);

      api = createHttpServer(PROJECT_ROOT, 0, STATIC_DIR);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns 403 for path traversal attempts', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('secret'));

      api = createHttpServer(PROJECT_ROOT, 0, STATIC_DIR);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/../../etc/passwd');
      expect(res.status).toBe(403);
      expect(JSON.parse(res.body)).toEqual({ error: 'Forbidden' });
    });
  });

  // ─── Zod Validation ─────────────────────────────────────────

  describe('POST validation', () => {
    it('returns 400 for /api/start with invalid body', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/start', 'POST', { autoApprove: 'not-a-boolean' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for /api/plan with invalid body', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/plan', 'POST', { directive: 123 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for /api/set-directives with empty content', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/set-directives', 'POST', { content: '' });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Missing content field' });
    });

    it('returns 400 for /api/kill with invalid workerId chars', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/kill/../../../etc', 'POST', {});
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid workerId' });
    });

    it('returns 400 for /api/config with non-object body', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const addr = api.server.address() as { port: number };
      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const payload = '"just-a-string"';
        const req = http.request(
          { hostname: '127.0.0.1', port: addr.port, path: '/api/config', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
          (r) => {
            let data = '';
            r.on('data', (c) => { data += c; });
            r.on('end', () => resolve({ status: r.statusCode!, body: data }));
          },
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Response Format Validation ─────────────────────────────

  describe('GET /api/status — field structure validation', () => {
    it('response includes sprint, agents, progress, alerts top-level fields', async () => {
      mockReadJsonSafe.mockReturnValue(JSON.parse(dashboardJson));

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('sprint');
      expect(body).toHaveProperty('agents');
      expect(body).toHaveProperty('progress');
      expect(body).toHaveProperty('alerts');
    });

    it('progress sub-field has done, active, blocked, total fields', async () => {
      mockReadJsonSafe.mockReturnValue(JSON.parse(dashboardJson));

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      const body = JSON.parse(res.body);
      expect(body.progress).toHaveProperty('done');
      expect(body.progress).toHaveProperty('active');
      expect(body.progress).toHaveProperty('blocked');
      expect(body.progress).toHaveProperty('total');
    });

    it('sprint sub-field has id and phase fields', async () => {
      mockReadJsonSafe.mockReturnValue(JSON.parse(dashboardJson));

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      const body = JSON.parse(res.body);
      expect(body.sprint).toHaveProperty('id');
      expect(body.sprint).toHaveProperty('phase');
    });
  });

  describe('GET /api/config — response field validation', () => {
    it('returns flat config object without extra wrapping', async () => {
      const configData = { mode: 'balanced', max_workers: 4, brain_model: 'opus' };
      mockReadJsonSafe.mockReturnValue(configData);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      const body = JSON.parse(res.body);
      // Config should be a flat object (not wrapped in { data: ... } or { config: ... })
      expect(body).not.toHaveProperty('data');
      expect(body).not.toHaveProperty('config');
      expect(body.mode).toBe('balanced');
      expect(body.max_workers).toBe(4);
    });
  });

  describe('GET /api/config/defaults — response field validation', () => {
    it('returns defaults config object', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config/defaults');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      const body = JSON.parse(res.body);
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
    });
  });

  describe('GET /api/history — response field validation', () => {
    it('each sprint entry has id field', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('sprints')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue(['sprint-001.md', 'sprint-002.md'] as unknown as ReturnType<typeof readdirSync>);
      mockReadFileSync.mockReturnValue(sprintMd);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/history');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as Array<Record<string, unknown>>;
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      for (const entry of body) {
        expect(entry).toHaveProperty('id');
      }
    });
  });

  describe('GET /api/memory — response field validation', () => {
    it('content field is a string, not an object', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('memory.md')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue('## Sprint Learnings\n- item one\n- item two');

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/memory');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.content).toBe('string');
      expect(body.content).toContain('Sprint Learnings');
    });
  });

  describe('GET /api/doctor — response field validation', () => {
    it('response has boolean ok field and checks array', async () => {
      mockRunDoctorChecks.mockReturnValue({
        ok: true,
        checks: [
          { name: 'Node', passed: true, message: 'v18.0.0', required: true },
          { name: 'Config', passed: true, message: 'valid', required: false },
        ],
      });

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/doctor');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.ok).toBe('boolean');
      expect(Array.isArray(body.checks)).toBe(true);
    });

    it('each check item has name, passed, message fields', async () => {
      mockRunDoctorChecks.mockReturnValue({
        ok: false,
        checks: [
          { name: 'Node', passed: true, message: 'v18.0.0', required: true },
          { name: 'Config', passed: false, message: 'config.json missing', required: false },
        ],
      });

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/doctor');
      const body = JSON.parse(res.body);
      for (const check of body.checks as Array<Record<string, unknown>>) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('passed');
        expect(check).toHaveProperty('message');
      }
    });
  });

  // ─── Startup auth info ────────────────────────────────────
  describe('startup auth info', () => {
    let stderrSpy2: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      delete process.env['DECKENT_API_AUTH_DISABLED'];
      stderrSpy2 = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy2.mockRestore();
    });

    it('logs an info message to stderr when no token is configured', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const calls = stderrSpy2.mock.calls.map((c) => String(c[0]));
      const infoCall = calls.find((s) => s.includes('[deckent:info]'));
      expect(infoCall).toBeDefined();
      expect(infoCall).toContain('No API token configured');
    });

    it('does not log the info message when a token is configured', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'secret-token' });
      await new Promise<void>((r) => api.server.once('listening', r));

      const calls = stderrSpy2.mock.calls.map((c) => String(c[0]));
      const infoCall = calls.find((s) => s.includes('No API token configured'));
      expect(infoCall).toBeUndefined();
    });

    it('info message is logged exactly once at server creation, not per request', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const infoCalls = stderrSpy2.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.includes('[deckent:info]') && s.includes('No API token'));
      expect(infoCalls).toHaveLength(1);
    });

    it('info message includes how to configure auth token', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const calls = stderrSpy2.mock.calls.map((c) => String(c[0]));
      const infoCall = calls.find((s) => s.includes('No API token configured'));
      expect(infoCall).toContain('DECKENT_API_TOKEN');
      expect(infoCall).toContain('config.api_auth_token');
    });
  });
});

// ─── parseBody unit tests ────────────────────────────────────────
describe('parseBody', () => {
  it('parses valid JSON body', async () => {
    const { Readable } = await import('node:stream');
    const req = new Readable({
      read() {
        this.push(JSON.stringify({ foo: 'bar' }));
        this.push(null);
      },
    }) as unknown as http.IncomingMessage;

    const result = await parseBody(req);
    expect(result).toEqual({ foo: 'bar' });
  });

  it('returns empty object for empty body', async () => {
    const { Readable } = await import('node:stream');
    const req = new Readable({
      read() { this.push(null); },
    }) as unknown as http.IncomingMessage;

    const result = await parseBody(req);
    expect(result).toEqual({});
  });

  it('rejects on invalid JSON', async () => {
    const { Readable } = await import('node:stream');
    const req = new Readable({
      read() {
        this.push('not json{{{');
        this.push(null);
      },
    }) as unknown as http.IncomingMessage;

    await expect(parseBody(req)).rejects.toThrow('Invalid JSON body');
  });
});

// ─── watchDashboard tests ────────────────────────────────────────
describe('watchDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onChange after debounce on file change', () => {
    const mockWatcher = { close: vi.fn() };
    let fileCallback: (() => void) | undefined;
    vi.mocked(watch).mockImplementation((_path: unknown, cb: unknown) => {
      fileCallback = cb as () => void;
      return mockWatcher as unknown as ReturnType<typeof watch>;
    });

    const onChange = vi.fn();
    const w = watchDashboard('/tmp/test/.dashboard', onChange);

    expect(fileCallback).toBeDefined();

    fileCallback!();
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(1);

    w.close();
    expect(mockWatcher.close).toHaveBeenCalled();
  });

  it('debounces rapid changes', () => {
    const mockWatcher = { close: vi.fn() };
    let fileCallback: (() => void) | undefined;
    vi.mocked(watch).mockImplementation((_path: unknown, cb: unknown) => {
      fileCallback = cb as () => void;
      return mockWatcher as unknown as ReturnType<typeof watch>;
    });

    const onChange = vi.fn();
    const w = watchDashboard('/tmp/test/.dashboard', onChange);

    fileCallback!();
    vi.advanceTimersByTime(200);
    fileCallback!();
    vi.advanceTimersByTime(200);
    fileCallback!();

    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(1);

    w.close();
  });
});

// ─── Bearer token timing-safe auth tests ────────────────────────
describe('Bearer token timing-safe auth (checkAuth)', () => {
  let api: HttpApi;

  // Helper: send POST with custom Authorization header
  function requestWithAuth(
    a: HttpApi,
    authHeader: string | null,
  ): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
      const addr = a.server.address();
      if (!addr || typeof addr === 'string') return reject(new Error('No address'));
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/json',
        'Content-Length': 2,
      };
      if (authHeader !== null) headers['Authorization'] = authHeader;
      const req = http.request(
        { hostname: '127.0.0.1', port: (addr as { port: number }).port, path: '/api/start', method: 'POST', headers },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
        },
      );
      req.on('error', reject);
      req.write('{}');
      req.end();
    });
  }

  let stderrSpyAuth: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
    mockReadJsonSafe.mockReturnValue(null);
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    stderrSpyAuth = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(async () => {
    if (api) await api.close();
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    stderrSpyAuth?.mockRestore();
  });

  it('accepts valid token (exact match)', async () => {
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'correct-token-abc' });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, 'Bearer correct-token-abc');
    // 202 = accepted, sprint started
    expect(res.status).toBe(202);
  });

  it('rejects wrong token', async () => {
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'correct-token-abc' });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, 'Bearer wrong-token-xyz');
    expect(res.status).toBe(403);
  });

  it('rejects missing Authorization header', async () => {
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'secret' });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, null);
    expect(res.status).toBe(401);
  });

  it('handles shorter token without crashing (no timingSafeEqual length error)', async () => {
    // timingSafeEqual requires equal-length buffers; SHA-256 hashing normalises length
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'a-very-long-token-that-exceeds-short-one' });
    await new Promise<void>((r) => api.server.once('listening', r));

    // Provide a much shorter token — should return 403, not throw
    const res = await requestWithAuth(api, 'Bearer short');
    expect(res.status).toBe(403);
  });

  it('handles longer-than-expected token without crashing', async () => {
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'tok' });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, 'Bearer this-is-a-very-long-token-that-is-much-longer-than-tok');
    expect(res.status).toBe(403);
  });

  it('rejects wrong Bearer scheme (Basic instead of Bearer)', async () => {
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'secret' });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, 'Basic secret');
    expect(res.status).toBe(401);
  });

  it('returns 401 when no token configured (secure by default)', async () => {
    // No apiToken → secure by default, 401 for all API requests
    api = createHttpServer(PROJECT_ROOT, { port: 0 });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, null);
    expect(res.status).toBe(401);
  });
});
