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
  checkUsage: vi.fn(() => ({ fiveHourPercent: 10, weeklyPercent: 5 })),
  adjustSprintSize: vi.fn(() => ({ maxWorkers: 4 })),
  planSprint: vi.fn(() => ({
    id: 'sprint-001',
    number: 1,
    tasks: [{ id: '001-001', title: 'Test task' }],
  })),
}));

import { readFileSync, existsSync, readdirSync, writeFileSync, watch } from 'node:fs';
import { createHttpServer, parseBody, _resetActiveJob, type HttpApi } from '../../src/api/server.js';
import { watchDashboard } from '../../src/api/watcher.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';
import { killWorker } from '../../src/orchestra/tmux.js';
import { readWorkerLog } from '../../src/agents/worker.js';
import { readJsonSafe } from '../../src/core/utils.js';
import { runSprint } from '../../src/orchestra/brain.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRunDoctorChecks = vi.mocked(runDoctorChecks);
const mockKillWorker = vi.mocked(killWorker);
const mockReadWorkerLog = vi.mocked(readWorkerLog);
const mockRunSprint = vi.mocked(runSprint);
const mockReadJsonSafe = vi.mocked(readJsonSafe);

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
  usage: { fiveHourPercent: 10, weeklyPercent: 5, measuredAt: '2026-01-01T00:00:00Z' },
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

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
    mockReadJsonSafe.mockReturnValue(null);
  });

  afterEach(async () => {
    if (api) await api.close();
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
    it('returns 404 when dashboard file missing', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));
      const res = await request(api, '/api/status');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'No active sprint' });
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
      const configData = { mode: 'max_plan', max_workers: 4 };
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
      expect(JSON.parse(res.body)).toEqual({ error: 'Memory file not found' });
    });

    it('returns memory content when file exists', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('MEMORY.md')) return true;
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
        if (typeof p === 'string' && p.includes('DEBT.md')) return true;
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

  describe('POST /api/config', () => {
    it('merges and writes config', async () => {
      const existingConfig = { mode: 'max_plan', max_workers: 2 };
      mockReadJsonSafe.mockReturnValue(existingConfig);

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/config', 'POST', { max_workers: 4 });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.mode).toBe('max_plan');
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
    it('returns 404 when dashboard file is invalid JSON', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.dashboard')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue('not valid json{{{');

      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status');
      expect(res.status).toBe(404);
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

  // ─── Startup auth warning ────────────────────────────────────
  describe('startup auth warning', () => {
    let stderrSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('logs a warning to stderr when no token is configured', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      const warnCall = calls.find((s) => s.includes('[deckent:warn]'));
      expect(warnCall).toBeDefined();
      expect(warnCall).toContain('API server running without authentication');
    });

    it('does not log a warning when a token is configured', async () => {
      api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'secret-token' });
      await new Promise<void>((r) => api.server.once('listening', r));

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      const warnCall = calls.find((s) => s.includes('[deckent:warn]'));
      expect(warnCall).toBeUndefined();
    });

    it('warning is logged exactly once at server creation, not per request', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      // Make a couple of requests
      await request(api, '/api/status');
      await request(api, '/api/status');

      const warnCalls = stderrSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.includes('[deckent:warn]'));
      expect(warnCalls).toHaveLength(1);
    });

    it('warning message includes how to configure auth token', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      const warnCall = calls.find((s) => s.includes('[deckent:warn]'));
      expect(warnCall).toContain('DECKENT_API_TOKEN');
      expect(warnCall).toContain('config.api_token');
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

  beforeEach(() => {
    vi.clearAllMocks();
    _resetActiveJob();
    mockExistsSync.mockReturnValue(false);
    mockReadJsonSafe.mockReturnValue(null);
  });

  afterEach(async () => {
    if (api) await api.close();
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
    expect(res.status).toBe(401);
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

    // Provide a much shorter token — should return 401, not throw
    const res = await requestWithAuth(api, 'Bearer short');
    expect(res.status).toBe(401);
  });

  it('handles longer-than-expected token without crashing', async () => {
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'tok' });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, 'Bearer this-is-a-very-long-token-that-is-much-longer-than-tok');
    expect(res.status).toBe(401);
  });

  it('rejects wrong Bearer scheme (Basic instead of Bearer)', async () => {
    api = createHttpServer(PROJECT_ROOT, { port: 0, apiToken: 'secret' });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, 'Basic secret');
    expect(res.status).toBe(401);
  });

  it('allows all requests when no token configured (auth disabled)', async () => {
    // No apiToken → backward-compatible open access
    api = createHttpServer(PROJECT_ROOT, { port: 0 });
    await new Promise<void>((r) => api.server.once('listening', r));

    const res = await requestWithAuth(api, null);
    // Should reach the handler and get 202 (not 401)
    expect(res.status).toBe(202);
  });
});
