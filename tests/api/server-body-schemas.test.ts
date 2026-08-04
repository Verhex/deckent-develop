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

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn(() => ({ ok: true, checks: [] })),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  killWorker: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(async () => ({
    activeModeConfig: { brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: false, max_workers: 4 },
  })),
}));

vi.mock('../../src/agents/worker.js', () => ({
  readWorkerLog: vi.fn(() => null),
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(() => null),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(async () => ({ id: 'sprint-001', status: 'COMPLETE' })),
  readContext: vi.fn(() => ({ debt: [], patterns: [], memory: '' })),
  planSprint: vi.fn(async () => ({ id: 'sprint-001', number: 1, tasks: [] })),
}));

vi.mock('../../src/api/sprint-job-runner.js', () => ({
  startSprintDetached: vi.fn(() => ({ jobId: `job-${Date.now()}` })),
}));

// FAZ4B: POST /api/plan canonical run-flow plan authority'sine (planRunFlow)
// delege eder; şema-validasyon testleri için seam burada mock'lanır.
vi.mock('../../src/orchestra/run-flow-plan-service.js', () => ({
  planRunFlow: vi.fn(async (input: { proposal: { flowId: string } }) => ({
    flowId: input.proposal.flowId,
    revision: 1,
    planDigest: 'f'.repeat(64),
    approval: null,
    sprint: { id: 'sprint-001', number: 1, tasks: [] },
    preview: { flowId: input.proposal.flowId, revision: 1, planDigest: 'f'.repeat(64), taskSummaries: [] },
  })),
  decideRunFlowPlan: vi.fn(),
  RunFlowPlanServiceError: class RunFlowPlanServiceError extends Error {},
}));

import {
  parseBody,
  createHttpServer,
  _resetActiveJob,
  type HttpApi,
} from '../../src/api/server.js';

// ─── Helpers ────────────────────────────────────────────────────
const PROJECT_ROOT = '/tmp/test-schemas';

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
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('No address'));
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: (addr as { port: number }).port,
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

// ─── HTTP integration tests for body validation ────────────────
describe('POST /api/start — body validation', () => {
  let api: HttpApi;

  beforeEach(() => {
    _resetActiveJob();
  });

  afterEach(async () => {
    if (api) await api.close();
  });

  it('returns 400 for invalid body (autoApprove as string)', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/api/start', 'POST', { autoApprove: 'yes' });
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(body.error).toContain('autoApprove');
  });

  it('valid empty body passes the schema and reaches the retired-route contract (410)', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/api/start', 'POST', {});
    // FAZ4B: /api/start emekli — şema-geçerli gövde 400 DEĞİL,
    // 410 LEGACY_START_RETIRED (canonical akış: plan → decision → start) alır.
    expect(res.status).toBe(410);
    expect(JSON.parse(res.body).code).toBe('LEGACY_START_RETIRED');
  });
});

describe('POST /api/plan — body validation', () => {
  let api: HttpApi;

  afterEach(async () => {
    if (api) await api.close();
  });

  it('returns 400 for invalid mode value', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/api/plan', 'POST', { mode: 'turbo' });
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('returns 200 for valid mode:ai', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/api/plan', 'POST', { mode: 'ai' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/set-directives — body validation', () => {
  let api: HttpApi;

  afterEach(async () => {
    if (api) await api.close();
  });

  it('returns 400 for missing content field', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/api/set-directives', 'POST', {});
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('returns 400 for empty content', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/api/set-directives', 'POST', { content: '' });
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });
});

describe('POST /api/config — body validation', () => {
  let api: HttpApi;

  afterEach(async () => {
    if (api) await api.close();
  });

  it('returns 400 for array body', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));

    // Send raw array as JSON
    const addr = api.server.address() as { port: number };
    const payload = JSON.stringify(['a', 'b']);
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/config',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        },
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
    expect(JSON.parse(res.body).error).toBeDefined();
  });
});

describe('POST /api/kill/:workerId — body validation', () => {
  let api: HttpApi;

  afterEach(async () => {
    if (api) await api.close();
  });

  it('returns 200 for valid workerId with empty body', async () => {
    const { killWorker } = await import('../../src/orchestra/tmux.js');
    vi.mocked(killWorker).mockImplementation(() => {});
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/api/kill/worker-001', 'POST', {});
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('returns 400 for invalid workerId format', async () => {
    api = createHttpServer(PROJECT_ROOT, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const res = await request(api, '/api/kill/worker%20id', 'POST', {});
    expect(res.status).toBe(400);
  });
});
