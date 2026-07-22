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
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(async () => ({
    activeModeConfig: { brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: false, max_workers: 4 },
  })),
  createDefaultConfig: vi.fn(() => ({
    mode: 'performance',
    brain_provider: 'claude',
    worker_provider: 'claude',
    cost_optimization: false,
    claude_backend: 'tmux',
    output_splash: true,
    output_mode: 'normal',
    output_theme: 'default',
    search_enabled: true,
    search_provider: 'context7',
    search_cache_ttl: 3600,
    notify_on_complete: false,
    notify_channel: null,
    notify_url: null,
    telemetry_enabled: false,
    telemetry_anonymous: true,
    detected_env: null,
    multi_ide_mode: false,
    auth_mode: 'subscription',
    memory_budget: 600,
    decay_after_sprints: 5,
    patterns_enabled: true,
    project_identity_enabled: true,
    scan_interval: 30,
    heartbeat_timeout: 120,
    boundary_enforcement: true,
    fix_phase_enabled: true,
    max_fix_retries: 2,
    rollback_policy: 'never',
    auto_clean_locks: false,
    modes: {
      performance: { max_workers: 8, brain_model: 'claude-opus-4-8', default_model: 'opus', haiku_allowed: true, brain_planning: 'auto' },
      balanced: { max_workers: 5, brain_model: 'sonnet', default_model: 'opus', haiku_allowed: true, brain_planning: 'auto' },
      economic: { max_workers: 3, brain_model: 'sonnet', default_model: 'claude-sonnet-5', haiku_allowed: false, brain_planning: 'auto' },
      api: { max_workers: 10, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: true, budget_per_sprint: 5.0, requires: 'ANTHROPIC_API_KEY', brain_planning: 'auto' },
    },
  })),
  deepMerge: vi.fn((base: Record<string, unknown>, override: Record<string, unknown>) => ({ ...base, ...override })),
  validatePartialConfig: vi.fn(),
  ConfigValidationError: class ConfigValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(`Config validation failed:\n  - ${errors.join('\n  - ')}`);
      this.name = 'ConfigValidationError';
      this.errors = errors;
    }
  },
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

import { writeFileSync } from 'node:fs';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import { readJsonSafe } from '../../src/core/utils.js';
import { createDefaultConfig, validatePartialConfig, ConfigValidationError } from '../../src/core/config.js';

const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadJsonSafe = vi.mocked(readJsonSafe);
const mockValidatePartialConfig = vi.mocked(validatePartialConfig);
const mockCreateDefaultConfig = vi.mocked(createDefaultConfig);

const PROJECT_ROOT = '/tmp/test-config-editor';

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

describe('API — Config Editor endpoints', () => {
  let api: HttpApi;

  beforeEach(async () => {
    vi.clearAllMocks();
    api = createHttpServer(PROJECT_ROOT, { port: 0 });
    await new Promise<void>((r) => api.server.once('listening', r));
  });

  afterEach(async () => {
    await api.close();
  });

  it('GET /api/config/defaults returns default config', async () => {
    const res = await request(api, '/api/config/defaults');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.mode).toBe('performance');
    expect(data.brain_provider).toBe('claude');
    expect(data.output_mode).toBe('normal');
    expect(data.telemetry_enabled).toBe(false);
    expect(mockCreateDefaultConfig).toHaveBeenCalled();
  });

  it('GET /api/config returns current project config', async () => {
    const configData = { mode: 'economic', brain_provider: 'codex' };
    mockReadJsonSafe.mockReturnValueOnce(configData);
    const res = await request(api, '/api/config');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.mode).toBe('economic');
    expect(data.brain_provider).toBe('codex');
  });

  it('GET /api/config returns 404 when config missing', async () => {
    mockReadJsonSafe.mockReturnValue(null);
    const res = await request(api, '/api/config');
    expect(res.status).toBe(404);
  });

  it('POST /api/config saves valid config and returns merged result', async () => {
    const existing = { mode: 'performance', brain_provider: 'claude' };
    mockReadJsonSafe.mockReturnValueOnce(existing);
    mockValidatePartialConfig.mockImplementation(() => { /* pass */ });

    const update = { output_mode: 'verbose', search_cache_ttl: 7200 };
    const res = await request(api, '/api/config', 'POST', update);
    expect(res.status).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.mode).toBe('performance');
    expect(data.output_mode).toBe('verbose');
    expect(data.search_cache_ttl).toBe(7200);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('POST /api/config returns 422 on validation error', async () => {
    const existing = { mode: 'performance' };
    mockReadJsonSafe.mockReturnValueOnce(existing);
    mockValidatePartialConfig.mockImplementation(() => {
      throw new ConfigValidationError(['Invalid brain_provider "invalid"']);
    });

    const update = { brain_provider: 'invalid' };
    const res = await request(api, '/api/config', 'POST', update);
    expect(res.status).toBe(422);

    const data = JSON.parse(res.body);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.details).toContain('Invalid brain_provider "invalid"');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('POST /api/config returns 400 for non-object body', async () => {
    const res = await request(api, '/api/config', 'POST', 'not-an-object');
    expect(res.status).toBe(400);
  });

  it('POST /api/config merges with existing config preserving untouched fields', async () => {
    const existing = {
      mode: 'performance',
      brain_provider: 'claude',
      output_splash: true,
      telemetry_enabled: false,
    };
    mockReadJsonSafe.mockReturnValueOnce(existing);
    mockValidatePartialConfig.mockImplementation(() => { /* pass */ });

    const update = { telemetry_enabled: true };
    const res = await request(api, '/api/config', 'POST', update);
    expect(res.status).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.mode).toBe('performance');
    expect(data.brain_provider).toBe('claude');
    expect(data.output_splash).toBe(true);
    expect(data.telemetry_enabled).toBe(true);
  });

  it('GET /api/config/defaults includes all expected categories', async () => {
    const res = await request(api, '/api/config/defaults');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    // Provider
    expect(data).toHaveProperty('brain_provider');
    expect(data).toHaveProperty('worker_provider');
    expect(data).toHaveProperty('cost_optimization');
    expect(data).toHaveProperty('claude_backend');
    // Output
    expect(data).toHaveProperty('output_splash');
    expect(data).toHaveProperty('output_mode');
    expect(data).toHaveProperty('output_theme');
    // Search
    expect(data).toHaveProperty('search_enabled');
    expect(data).toHaveProperty('search_provider');
    expect(data).toHaveProperty('search_cache_ttl');
    // Notifications
    expect(data).toHaveProperty('notify_on_complete');
    expect(data).toHaveProperty('notify_channel');
    // Telemetry
    expect(data).toHaveProperty('telemetry_enabled');
    expect(data).toHaveProperty('telemetry_anonymous');
    // Environment
    expect(data).toHaveProperty('detected_env');
    expect(data).toHaveProperty('multi_ide_mode');
    // Auth
    expect(data).toHaveProperty('auth_mode');
  });

  it('GET /api/config/defaults includes memory_budget field', async () => {
    const res = await request(api, '/api/config/defaults');
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('memory_budget');
    expect(data.memory_budget).toBe(600);
  });

  it('GET /api/config/defaults includes scan_interval field', async () => {
    const res = await request(api, '/api/config/defaults');
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('scan_interval');
    expect(data.scan_interval).toBe(30);
  });

  it('GET /api/config/defaults includes rollback_policy field', async () => {
    const res = await request(api, '/api/config/defaults');
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('rollback_policy');
    expect(data.rollback_policy).toBe('never');
  });

  it('GET /api/config/defaults includes fix_phase_enabled field', async () => {
    const res = await request(api, '/api/config/defaults');
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('fix_phase_enabled');
    expect(data.fix_phase_enabled).toBe(true);
  });

  it('GET /api/config/defaults includes expanded memory and auditor fields', async () => {
    const res = await request(api, '/api/config/defaults');
    const data = JSON.parse(res.body);
    expect(data.decay_after_sprints).toBe(5);
    expect(data.patterns_enabled).toBe(true);
    expect(data.project_identity_enabled).toBe(true);
    expect(data.heartbeat_timeout).toBe(120);
    expect(data.boundary_enforcement).toBe(true);
  });

  it('GET /api/config/defaults includes advanced fields', async () => {
    const res = await request(api, '/api/config/defaults');
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('auto_clean_locks');
    expect(data.auto_clean_locks).toBe(false);
    expect(data.max_fix_retries).toBe(2);
  });
});
