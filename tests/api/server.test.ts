import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

// ─── Mocks ──────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

import { readFileSync, existsSync, readdirSync, watch } from 'node:fs';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import { watchDashboard } from '../../src/api/watcher.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);

// ─── Helpers ────────────────────────────────────────────────────────
const PROJECT_ROOT = '/tmp/test-project';

function request(api: HttpApi, path: string, method = 'GET'): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('No address'));
    const req = http.request({ hostname: '127.0.0.1', port: addr.port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
    });
    req.on('error', reject);
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

// ─── Tests ──────────────────────────────────────────────────────────
describe('createHttpServer', () => {
  let api: HttpApi;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: dashboard file does not exist (no watcher setup)
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('starts and listens on given port', async () => {
    api = createHttpServer(PROJECT_ROOT, 0); // port 0 = random
    await new Promise<void>((r) => api.server.once('listening', r));
    const addr = api.server.address();
    expect(addr).not.toBeNull();
    expect(typeof addr).toBe('object');
  });

  describe('GET /api/status', () => {
    it('returns 404 when dashboard file missing', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));
      // existsSync for dashPath returns false (already default)
      const res = await request(api, '/api/status');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'No active sprint' });
    });

    it('returns dashboard JSON when file exists', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.dashboard')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(dashboardJson);

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

  describe('error handling', () => {
    it('returns 405 for non-GET methods', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/api/status', 'POST');
      expect(res.status).toBe(405);
      expect(JSON.parse(res.body)).toEqual({ error: 'Method not allowed' });
    });

    it('returns 404 for unknown routes', async () => {
      api = createHttpServer(PROJECT_ROOT, 0);
      await new Promise<void>((r) => api.server.once('listening', r));

      const res = await request(api, '/unknown');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
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
});

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

    // Trigger file change
    fileCallback!();
    expect(onChange).not.toHaveBeenCalled();

    // Advance past debounce
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

    // Rapid changes
    fileCallback!();
    vi.advanceTimersByTime(200);
    fileCallback!();
    vi.advanceTimersByTime(200);
    fileCallback!();

    // Only 500ms after the LAST change
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(1);

    w.close();
  });
});
