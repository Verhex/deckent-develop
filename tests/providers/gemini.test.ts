import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { GeminiAdapter, createGeminiAdapter, GEMINI_AUTH_HEADER, parseGeminiOutput, buildGeminiSpawnEnv, LOGIN_FAST_FAIL, QUOTA_FAST_FAIL } from '../../src/providers/gemini.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import { ProviderError } from '../../src/core/provider.js';
import { resolveCrossProviderCredentialKeys } from '../../src/providers/cross-provider-keys.js';

// ─── Mock node:child_process ─────────────────────────────────────────

const mockChildProcess = {
  stdin: {
    write: vi.fn(),
    end: vi.fn(),
  },
  stdout: {
    on: vi.fn(),
  },
  stderr: {
    on: vi.fn(),
  },
  once: vi.fn(),
  kill: vi.fn(),
  pid: 54321,
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '0.1.0\n' }),
}));

// ─── Mock node:fs ────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';

const mockSpawn = spawn as unknown as MockInstance;
const mockSpawnSync = spawnSync as unknown as MockInstance;
const mockWriteFileSync = writeFileSync as unknown as MockInstance;
const mockAppendFileSync = appendFileSync as unknown as MockInstance;
const mockMkdirSync = mkdirSync as unknown as MockInstance;
const mockExistsSync = existsSync as unknown as MockInstance;

// ─── Helpers ─────────────────────────────────────────────────────────

function setupMockChild(overrides?: Partial<typeof mockChildProcess>) {
  const child = {
    ...mockChildProcess,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    ...overrides,
  };
  child.once = vi.fn().mockImplementation((event: string, cb: () => void) => {
    if (event === 'exit') {
      (child as any)._exitCb = cb;
    }
    return child;
  });
  mockSpawn.mockReturnValue(child);
  return child;
}

/**
 * Build a mock child that triggers fast-fail data on stdout or stderr.
 * The on('data', cb) call immediately invokes cb with the given chunks.
 */
function setupMockChildWithOutput(stdoutChunks: string[], stderrChunks: string[] = []) {
  const child = {
    ...mockChildProcess,
    stdout: {
      on: vi.fn().mockImplementation((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') {
          for (const chunk of stdoutChunks) cb(Buffer.from(chunk));
        }
      }),
    },
    stderr: {
      on: vi.fn().mockImplementation((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') {
          for (const chunk of stderrChunks) cb(Buffer.from(chunk));
        }
      }),
    },
    kill: vi.fn(),
  };
  child.once = vi.fn().mockImplementation((event: string, cb: () => void) => {
    if (event === 'exit') (child as any)._exitCb = cb;
    return child;
  });
  mockSpawn.mockReturnValue(child);
  return child;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('GeminiAdapter', () => {
  const projectDir = '/tmp/test-gemini-project';
  let adapter: GeminiAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GOOGLE_API_KEY: 'test-api-key-123' };
    adapter = new GeminiAdapter(projectDir);
    mockExistsSync.mockReturnValue(true);
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '0.1.0\n' });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─── Constructor & Identity ────────────────────────────────────────

  it('has correct provider name', () => {
    expect(adapter.name).toBe('gemini');
  });

  it('supports gemini models from current catalog', () => {
    expect(adapter.supportedModels).toContain('gemini-2.5-pro');
    expect(adapter.supportedModels).toContain('gemini-2.5-flash');
    // Model count may grow as Task 4 updates the catalog
    expect(adapter.supportedModels.length).toBeGreaterThanOrEqual(2);
  });

  it('does not include non-gemini models', () => {
    expect(adapter.supportedModels).not.toContain('opus');
    expect(adapter.supportedModels).not.toContain('sonnet');
    expect(adapter.supportedModels).not.toContain('gpt-4.1');
  });

  // ─── API Endpoint Verification ─────────────────────────────────────

  it('uses correct generativelanguage.googleapis.com base URL', () => {
    const endpoint = adapter.getEndpoint('gemini-2.5-pro');
    expect(endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    );
  });

  it('streaming endpoint uses streamGenerateContent with alt=sse', () => {
    const endpoint = adapter.getStreamingEndpoint('gemini-2.5-flash');
    expect(endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
    );
  });

  it('uses v1beta API version', () => {
    const endpoint = adapter.getEndpoint('gemini-2.5-pro');
    expect(endpoint).toContain('/v1beta/');
  });

  // ─── Auth Method Verification ──────────────────────────────────────

  it('auth header constant is x-goog-api-key per official docs', () => {
    expect(GEMINI_AUTH_HEADER).toBe('x-goog-api-key');
  });

  it('getApiKey reads from GOOGLE_API_KEY env var', () => {
    process.env.GOOGLE_API_KEY = 'my-key-abc';
    expect(adapter.getApiKey()).toBe('my-key-abc');
  });

  it('getApiKey prefers DECKENT_GOOGLE_API_KEY over GOOGLE_API_KEY', () => {
    process.env.GOOGLE_API_KEY = 'regular-key';
    process.env.DECKENT_GOOGLE_API_KEY = 'deckent-key';
    expect(adapter.getApiKey()).toBe('deckent-key');
  });

  it('getApiKey accepts the Gemini CLI native GEMINI_API_KEY', () => {
    delete process.env.DECKENT_GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini-native-key';
    expect(adapter.getApiKey()).toBe('gemini-native-key');
  });

  it('getApiKey returns undefined when both env vars missing', () => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.DECKENT_GOOGLE_API_KEY;
    expect(adapter.getApiKey()).toBeUndefined();
  });

  it('getApiKey falls back to GOOGLE_API_KEY when DECKENT_GOOGLE_API_KEY is not set', () => {
    delete process.env.DECKENT_GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = 'fallback-key';
    expect(adapter.getApiKey()).toBe('fallback-key');
  });

  // ─── isAvailable() ─────────────────────────────────────────────────

  it('isAvailable returns true when gemini CLI installed and API key is set', async () => {
    process.env.GOOGLE_API_KEY = 'some-key';
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '0.1.0\n' });
    const result = await adapter.isAvailable();
    expect(result).toBe(true);
  });

  it('isAvailable returns false when GOOGLE_API_KEY is not set', async () => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.DECKENT_GOOGLE_API_KEY;
    const result = await adapter.isAvailable();
    expect(result).toBe(false);
  });

  it('isAvailable returns false when gemini CLI is not installed', async () => {
    process.env.GOOGLE_API_KEY = 'some-key';
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '' });
    const result = await adapter.isAvailable();
    expect(result).toBe(false);
  });

  it('isAvailable returns false when gemini CLI throws', async () => {
    process.env.GOOGLE_API_KEY = 'some-key';
    mockSpawnSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const result = await adapter.isAvailable();
    expect(result).toBe(false);
  });

  // ─── isCliInstalled() ─────────────────────────────────────────────

  it('isCliInstalled returns true when gemini --version exits 0', () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '0.1.0\n' });
    expect(adapter.isCliInstalled()).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledWith('gemini', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
  });

  it('isCliInstalled returns false when gemini --version fails', () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '' });
    expect(adapter.isCliInstalled()).toBe(false);
  });

  it('isCliInstalled returns false when gemini binary not found', () => {
    mockSpawnSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(adapter.isCliInstalled()).toBe(false);
  });

  // ─── buildArgs() ──────────────────────────────────────────────────

  it('buildArgs returns correct Gemini CLI arguments', () => {
    const args = adapter.buildArgs('gemini-2.5-pro', 'Hello Gemini');
    expect(args).toEqual(['-p', 'Hello Gemini', '--output-format', 'json', '-m', 'gemini-2.5-pro', '--approval-mode', 'yolo', '--skip-trust']);
  });

  it('buildArgs includes -p flag for headless mode', () => {
    const args = adapter.buildArgs('gemini-2.5-flash', 'test');
    expect(args[0]).toBe('-p');
    expect(args[1]).toBe('test');
  });

  it('buildArgs includes --output-format json', () => {
    const args = adapter.buildArgs('gemini-2.5-pro', 'prompt');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
  });

  it('buildArgs includes -m flag for model selection', () => {
    const args = adapter.buildArgs('gemini-2.5-pro', 'prompt');
    expect(args).toContain('-m');
    expect(args).toContain('gemini-2.5-pro');
  });

  it('buildArgs includes --approval-mode yolo + --skip-trust for headless worker mode', () => {
    // Sprint 248 (Provider Parity): a worker must auto-approve edit/write tools
    // (`yolo`, not read-only `plan`) and trust the workspace headlessly.
    const args = adapter.buildArgs('gemini-2.5-pro', 'prompt');
    expect(args).toContain('--approval-mode');
    expect(args).toContain('yolo');
    expect(args).toContain('--skip-trust');
    expect(args).not.toContain('plan');
  });

  // ─── Streaming Support ─────────────────────────────────────────────

  it('buildStreamingApiScript uses streamGenerateContent endpoint', () => {
    const script = adapter.buildStreamingApiScript('gemini-2.5-pro', 'key', 'Hello');
    expect(script).toContain('streamGenerateContent?alt=sse');
  });

  it('buildStreamingApiScript uses x-goog-api-key header', () => {
    const script = adapter.buildStreamingApiScript('gemini-2.5-flash', 'my-key', 'Test');
    expect(script).toContain("'x-goog-api-key': 'my-key'");
  });

  it('buildStreamingApiScript reads SSE data: lines', () => {
    const script = adapter.buildStreamingApiScript('gemini-2.5-pro', 'k', 'test');
    expect(script).toContain("line.startsWith('data: ')");
    expect(script).toContain('line.slice(6)');
  });

  it('buildStreamingApiScript uses ReadableStream reader', () => {
    const script = adapter.buildStreamingApiScript('gemini-2.5-pro', 'k', 'test');
    expect(script).toContain('r.body.getReader()');
    expect(script).toContain('TextDecoder');
  });

  it('buildStreamCommand uses --no-buffer for streaming curl', () => {
    const cmd = adapter.buildStreamCommand('gemini-2.5-pro', '/tmp/p.json');
    expect(cmd).toContain('--no-buffer');
    expect(cmd).toContain('streamGenerateContent?alt=sse');
    expect(cmd).toContain('x-goog-api-key');
  });

  it('streaming endpoint appends alt=sse query param', () => {
    const streamScript = adapter.buildStreamingApiScript('gemini-2.5-pro', 'k', 'test');
    expect(streamScript).toContain('alt=sse');
  });

  // ─── spawn() ───────────────────────────────────────────────────────

  it('spawn creates subprocess with gemini CLI', () => {
    const child = setupMockChild();
    adapter.spawn('task-001', 'gemini-2.5-pro', 'Hello Gemini');

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('gemini');
    expect(args).toContain('-p');
    expect(args).toContain('Hello Gemini');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
    expect(args).toContain('-m');
    expect(args).toContain('gemini-2.5-pro');
  });

  it('spawn passes the key as GEMINI_API_KEY (Developer-API), not GOOGLE_API_KEY (F3-GEMKEY)', () => {
    setupMockChild();
    adapter.spawn('task-001a', 'gemini-2.5-pro', 'Hello');

    const spawnCall = mockSpawn.mock.calls[0];
    const spawnOpts = spawnCall[2];
    expect(spawnOpts.env.GEMINI_API_KEY).toBe('test-api-key-123');
    expect(spawnOpts.env.GOOGLE_API_KEY).toBeUndefined();
  });

  it('spawn writes heartbeat file', () => {
    setupMockChild();
    adapter.spawn('task-002', 'gemini-2.5-flash', 'Test prompt');

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [hbPath, content] = mockWriteFileSync.mock.calls[0];
    expect(hbPath).toContain('task-002.hb');
    const hb = JSON.parse(content);
    expect(hb.workerId).toBe('gemini-task-002');
    expect(hb.status).toBe('EXECUTING');
  });

  it('spawn tracks worker entry', () => {
    setupMockChild();
    adapter.spawn('task-003', 'gemini-2.5-pro', 'Test');

    expect(adapter.listWorkers()).toContain('task-003');
    const entry = adapter.getWorkerEntry('task-003');
    expect(entry).toBeDefined();
    expect(entry?.model).toBe('gemini-2.5-pro');
  });

  it('spawn throws for unsupported model', () => {
    expect(() =>
      adapter.spawn('task-004', 'opus' as any, 'Test'),
    ).toThrow(ProviderError);
    expect(() =>
      adapter.spawn('task-004', 'opus' as any, 'Test'),
    ).toThrow(/Unsupported model/);
  });

  it('spawn succeeds without API key via OAuth session (does not throw)', () => {
    // Sprint 248 (Provider Parity): a missing key is no longer fatal — the CLI
    // falls back to its OAuth/subscription session. Previously this threw.
    delete process.env.GOOGLE_API_KEY;
    delete process.env.DECKENT_GOOGLE_API_KEY;
    setupMockChild();
    expect(() =>
      adapter.spawn('task-005', 'gemini-2.5-pro', 'Test'),
    ).not.toThrow();
    expect(mockSpawn).toHaveBeenCalledWith('gemini', expect.any(Array), expect.any(Object));
  });

  it('spawn throws for duplicate taskId', () => {
    setupMockChild();
    adapter.spawn('task-006', 'gemini-2.5-pro', 'Test');

    expect(() =>
      adapter.spawn('task-006', 'gemini-2.5-pro', 'Test again'),
    ).toThrow(ProviderError);
    expect(() =>
      adapter.spawn('task-006', 'gemini-2.5-pro', 'Test again'),
    ).toThrow(/already running/);
  });

  it('spawn uses custom projectDir from opts', () => {
    setupMockChild();
    const opts: ProviderSpawnOptions = { projectDir: '/custom/dir' };
    adapter.spawn('task-007', 'gemini-2.5-flash', 'Test', opts);

    const spawnCall = mockSpawn.mock.calls[0];
    const spawnOpts = spawnCall[2];
    expect(spawnOpts.cwd).toBe('/custom/dir');
  });

  it('spawn creates tasks directory if missing', () => {
    mockExistsSync.mockReturnValue(false);
    setupMockChild();
    adapter.spawn('task-008', 'gemini-2.5-pro', 'Test');

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.tasks'),
      { recursive: true },
    );
  });

  it('spawn removes worker on child exit', () => {
    const child = setupMockChild();
    adapter.spawn('task-009', 'gemini-2.5-pro', 'Test');

    expect(adapter.listWorkers()).toContain('task-009');
    const exitCb = (child as any)._exitCb;
    expect(exitCb).toBeDefined();
    exitCb(0);
    expect(adapter.listWorkers()).not.toContain('task-009');
  });

  it('spawn registers stdout and stderr data listeners for fast-fail monitoring', () => {
    const child = setupMockChild();
    adapter.spawn('task-logtest', 'gemini-2.5-pro', 'Test');
    expect(child.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(child.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('spawn appends stdout data to log file via appendFileSync', () => {
    const child = setupMockChildWithOutput(['some output text']);
    adapter.spawn('task-fdtest', 'gemini-2.5-pro', 'Test');
    expect(mockAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('task-fdtest.log'),
      'some output text',
      'utf-8',
    );
  });

  // ─── kill() ────────────────────────────────────────────────────────

  it('kill terminates running worker with SIGTERM', () => {
    const child = setupMockChild();
    adapter.spawn('task-011', 'gemini-2.5-pro', 'Test');
    adapter.kill('task-011');

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(adapter.listWorkers()).not.toContain('task-011');
  });

  it('kill throws for unknown taskId', () => {
    expect(() => adapter.kill('nonexistent')).toThrow(ProviderError);
    expect(() => adapter.kill('nonexistent')).toThrow(/No running worker/);
  });

  // ─── listWorkers() ─────────────────────────────────────────────────

  it('listWorkers returns empty array initially', () => {
    expect(adapter.listWorkers()).toEqual([]);
  });

  it('listWorkers tracks multiple workers', () => {
    setupMockChild();
    adapter.spawn('task-a', 'gemini-2.5-pro', 'Test A');
    adapter.spawn('task-b', 'gemini-2.5-flash', 'Test B');

    const workers = adapter.listWorkers();
    expect(workers).toContain('task-a');
    expect(workers).toContain('task-b');
    expect(workers).toHaveLength(2);
  });

  // ─── buildCommand() ────────────────────────────────────────────────

  it('buildCommand (worker, autoApprove) uses yolo + skip-trust', () => {
    const cmd = adapter.buildCommand('gemini-2.5-pro', '/tmp/prompt.json', { autoApprove: true });
    expect(cmd).toContain('gemini');
    expect(cmd).toContain('-p');
    expect(cmd).toContain('--output-format json');
    expect(cmd).toContain('-m gemini-2.5-pro');
    // Sprint 252: worker buildCommand uses yolo + skip-trust (was read-only plan).
    expect(cmd).toContain('--approval-mode yolo');
    expect(cmd).toContain('--skip-trust');
    expect(cmd).not.toContain('--approval-mode plan');
    expect(cmd).toContain('/tmp/prompt.json');
  });

  it('buildCommand WITHOUT autoApprove does NOT emit yolo/skip-trust (security: no unconditional bypass)', () => {
    const cmd = adapter.buildCommand('gemini-2.5-pro', '/tmp/prompt.json');
    expect(cmd).toContain('--approval-mode default');
    expect(cmd).not.toContain('yolo');
    expect(cmd).not.toContain('--skip-trust');
  });

  it('buildCommand uses cat to read prompt file', () => {
    const cmd = adapter.buildCommand('gemini-2.5-flash', '/tmp/p.json');
    expect(cmd).toContain('$(cat /tmp/p.json)');
  });

  it('buildCommand includes model parameter', () => {
    const cmd = adapter.buildCommand('gemini-2.5-pro', '/tmp/p.json');
    expect(cmd).toContain('-m gemini-2.5-pro');
  });

  // ─── buildPlannerCommand() ─────────────────────────────────────────

  it('buildPlannerCommand returns gemini CLI command + args', () => {
    const result = adapter.buildPlannerCommand('Plan this sprint', 'gemini-2.5-pro');
    expect(result.command).toBe('gemini');
    expect(result.args).toContain('-p');
    expect(result.args).toContain('Plan this sprint');
    expect(result.args).toContain('--output-format');
    expect(result.args).toContain('json');
    expect(result.args).toContain('-m');
    expect(result.args).toContain('gemini-2.5-pro');
    expect(result.args).toContain('--approval-mode');
    // Sprint 248 (Provider Parity): shared buildArgs now uses yolo + skip-trust.
    expect(result.args).toContain('yolo');
    expect(result.args).toContain('--skip-trust');
  });

  it('buildPlannerCommand uses correct model in args', () => {
    const result = adapter.buildPlannerCommand('Plan', 'gemini-2.5-flash');
    expect(result.args).toContain('gemini-2.5-flash');
  });

  it('buildPlannerCommand does not throw when API key is missing', () => {
    // Unlike the old node -e approach, the CLI reads its own env
    delete process.env.GOOGLE_API_KEY;
    delete process.env.DECKENT_GOOGLE_API_KEY;
    expect(() => adapter.buildPlannerCommand('Plan', 'gemini-2.5-pro')).not.toThrow();
  });

  // ─── validateApiKey() ──────────────────────────────────────────────

  it('validateApiKey returns invalid when key is not set', () => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.DECKENT_GOOGLE_API_KEY;
    const result = adapter.validateApiKey();
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not set');
  });

  it('validateApiKey returns invalid for too-short key', () => {
    process.env.GOOGLE_API_KEY = 'abc';
    const result = adapter.validateApiKey();
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('too short');
  });

  it('validateApiKey accepts AIza-prefixed keys', () => {
    process.env.GOOGLE_API_KEY = 'AIzaSyD1234567890abcdefghijklmnopqrstuv';
    const result = adapter.validateApiKey();
    expect(result.valid).toBe(true);
  });

  it('validateApiKey rejects short non-AIza keys', () => {
    process.env.GOOGLE_API_KEY = 'short-non-aiza-key';
    const result = adapter.validateApiKey();
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('format');
  });

  it('validateApiKey accepts long non-AIza keys (service account etc)', () => {
    process.env.GOOGLE_API_KEY = 'a'.repeat(40);
    const result = adapter.validateApiKey();
    expect(result.valid).toBe(true);
  });

  // ─── Accessors ─────────────────────────────────────────────────────

  it('getLogPath returns correct path', () => {
    const logPath = adapter.getLogPath('task-050');
    expect(logPath).toBe('/tmp/test-gemini-project/.tasks/task-task-050.log');
  });

  it('getProjectDir returns constructor projectDir', () => {
    expect(adapter.getProjectDir()).toBe(projectDir);
  });

  // ─── Timeout ───────────────────────────────────────────────────────

  it('timeout kills worker after configured ms', () => {
    vi.useFakeTimers();
    const timeoutAdapter = new GeminiAdapter(projectDir, { defaultTimeoutMs: 5000 });
    const child = setupMockChild();
    timeoutAdapter.spawn('task-timeout', 'gemini-2.5-pro', 'Test');

    expect(timeoutAdapter.listWorkers()).toContain('task-timeout');
    vi.advanceTimersByTime(5000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');

    vi.useRealTimers();
  });

  it('no timeout when defaultTimeoutMs is 0', () => {
    vi.useFakeTimers();
    const noTimeoutAdapter = new GeminiAdapter(projectDir, { defaultTimeoutMs: 0 });
    const child = setupMockChild();
    noTimeoutAdapter.spawn('task-no-timeout', 'gemini-2.5-pro', 'Test');

    vi.advanceTimersByTime(60000);
    expect(child.kill).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('timeout clears on child exit', () => {
    vi.useFakeTimers();
    const timeoutAdapter = new GeminiAdapter(projectDir, { defaultTimeoutMs: 10000 });
    const child = setupMockChild();
    timeoutAdapter.spawn('task-exit-early', 'gemini-2.5-pro', 'Test');

    const exitCb = (child as any)._exitCb;
    exitCb(0);

    vi.advanceTimersByTime(15000);
    expect(child.kill).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  // ─── Fast-Fail Guard ───────────────────────────────────────────────

  it('LOGIN_FAST_FAIL pattern matches gemini login prompt', () => {
    expect(LOGIN_FAST_FAIL.test('Please run gemini login to authenticate')).toBe(true);
    expect(LOGIN_FAST_FAIL.test('gemini login required')).toBe(true);
    expect(LOGIN_FAST_FAIL.test('Authentication required')).toBe(true);
    expect(LOGIN_FAST_FAIL.test('Login required')).toBe(true);
    expect(LOGIN_FAST_FAIL.test('Please authenticate')).toBe(true);
    expect(LOGIN_FAST_FAIL.test('Normal output line')).toBe(false);
  });

  it('QUOTA_FAST_FAIL pattern matches 429 and RESOURCE_EXHAUSTED', () => {
    expect(QUOTA_FAST_FAIL.test('Error 429 Too Many Requests')).toBe(true);
    expect(QUOTA_FAST_FAIL.test('RESOURCE_EXHAUSTED: quota exceeded')).toBe(true);
    expect(QUOTA_FAST_FAIL.test('No capacity available right now')).toBe(true);
    expect(QUOTA_FAST_FAIL.test('Normal response text')).toBe(false);
  });

  it('fast-fail kills child immediately on login prompt in stdout', () => {
    const child = setupMockChildWithOutput(['Please run gemini login to authenticate']);
    adapter.spawn('task-ff-login', 'gemini-2.5-pro', 'Test');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(adapter.listWorkers()).not.toContain('task-ff-login');
  });

  it('fast-fail kills child immediately on login prompt in stderr', () => {
    const child = setupMockChildWithOutput([], ['Authentication required, run gemini login']);
    adapter.spawn('task-ff-login-err', 'gemini-2.5-pro', 'Test');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(adapter.listWorkers()).not.toContain('task-ff-login-err');
  });

  it('fast-fail kills child after 2 quota/429 hits', () => {
    const child = setupMockChildWithOutput([], [
      'Error: RESOURCE_EXHAUSTED — quota exceeded',
      'Error: RESOURCE_EXHAUSTED — quota exceeded',
    ]);
    adapter.spawn('task-ff-quota', 'gemini-2.5-pro', 'Test');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(adapter.listWorkers()).not.toContain('task-ff-quota');
  });

  it('fast-fail does NOT kill child on a single quota/429 hit', () => {
    const child = setupMockChildWithOutput([], ['Error 429 rate limit — retrying']);
    adapter.spawn('task-ff-single429', 'gemini-2.5-pro', 'Test');
    expect(child.kill).not.toHaveBeenCalled();
    expect(adapter.listWorkers()).toContain('task-ff-single429');
  });

  it('fast-fail does not trigger on healthy output', () => {
    const child = setupMockChildWithOutput(
      ['Successfully generated response: Here is your code...'],
      ['Warning: model is experimental'],
    );
    adapter.spawn('task-ff-healthy', 'gemini-2.5-pro', 'Test');
    expect(child.kill).not.toHaveBeenCalled();
    expect(adapter.listWorkers()).toContain('task-ff-healthy');
  });

  // ─── Edge Cases ────────────────────────────────────────────────────

  it('buildApiScript escapes backticks in prompt (REST fallback)', () => {
    const script = adapter.buildApiScript('url', 'key', 'test `code` here');
    expect(script).toContain('`code`');
  });

  it('buildApiScript escapes carriage returns (REST fallback)', () => {
    const script = adapter.buildApiScript('url', 'key', "line\rwith\rcr");
    expect(script).toContain('\\r');
    expect(script).not.toContain('\r');
  });

  // ─── parseGeminiOutput() ──────────────────────────────────────────

  it('parseGeminiOutput parses JSON with response field', () => {
    const output = JSON.stringify({ response: 'Hello world' });
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('Hello world');
  });

  it('parseGeminiOutput parses JSON with candidates structure', () => {
    const output = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Generated text' }] } }],
    });
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('Generated text');
  });

  it('parseGeminiOutput extracts usage metadata', () => {
    const output = JSON.stringify({
      response: 'Hello',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    });
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('Hello');
    expect(result.stats).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('parseGeminiOutput handles plain text (non-JSON) output', () => {
    const result = parseGeminiOutput('Just plain text response');
    expect(result.response).toBe('Just plain text response');
    expect(result.stats).toBeUndefined();
  });

  it('parseGeminiOutput handles empty string', () => {
    const result = parseGeminiOutput('');
    expect(result.response).toBe('');
  });

  it('parseGeminiOutput handles whitespace-only string', () => {
    const result = parseGeminiOutput('   \n  ');
    expect(result.response).toBe('');
  });

  it('parseGeminiOutput handles JSON string value', () => {
    const output = JSON.stringify('simple string');
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('simple string');
  });

  it('parseGeminiOutput without usageMetadata returns undefined stats', () => {
    const output = JSON.stringify({ response: 'no stats' });
    const result = parseGeminiOutput(output);
    expect(result.stats).toBeUndefined();
  });

  // ─── parseGeminiOutput() stream-json (NDJSON) ─────────────────────

  it('parseGeminiOutput parses stream-json (NDJSON) with multiple chunks', () => {
    const chunk1 = JSON.stringify({ response: 'Hello ' });
    const chunk2 = JSON.stringify({ response: 'world' });
    const output = `${chunk1}\n${chunk2}`;
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('Hello world');
  });

  it('parseGeminiOutput parses stream-json with candidates structure', () => {
    const chunk1 = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Part 1 ' }] } }] });
    const chunk2 = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Part 2' }] } }] });
    const output = `${chunk1}\n${chunk2}`;
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('Part 1 Part 2');
  });

  it('parseGeminiOutput extracts usage from last stream-json chunk', () => {
    const chunk1 = JSON.stringify({ response: 'Hello ' });
    const chunk2 = JSON.stringify({
      response: 'world',
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 100 },
    });
    const output = `${chunk1}\n${chunk2}`;
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('Hello world');
    expect(result.stats).toEqual({ inputTokens: 50, outputTokens: 100 });
  });

  it('parseGeminiOutput falls back to plain text when NDJSON lines are not valid JSON', () => {
    const output = 'line one\nline two plain text';
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('line one\nline two plain text');
    expect(result.stats).toBeUndefined();
  });

  it('parseGeminiOutput stream-json without usage returns undefined stats', () => {
    const chunk1 = JSON.stringify({ response: 'a' });
    const chunk2 = JSON.stringify({ response: 'b' });
    const output = `${chunk1}\n${chunk2}`;
    const result = parseGeminiOutput(output);
    expect(result.response).toBe('ab');
    expect(result.stats).toBeUndefined();
  });

  // ─── gemini-3.1-pro-preview model support ─────────────────────────

  it('supports gemini-3.1-pro-preview model from registry', () => {
    expect(adapter.supportedModels).toContain('gemini-3.1-pro-preview');
  });

  it('supports all 4 gemini models from registry', () => {
    expect(adapter.supportedModels).toContain('gemini-3.1-pro-preview');
    expect(adapter.supportedModels).toContain('gemini-2.5-pro');
    expect(adapter.supportedModels).toContain('gemini-2.5-flash');
    expect(adapter.supportedModels).toContain('gemini-2.0-flash');
    expect(adapter.supportedModels.length).toBe(4);
  });

  // ─── getCliVersion() ──────────────────────────────────────────────

  it('getCliVersion returns version string when CLI is installed', () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '1.2.3\n' });
    expect(adapter.getCliVersion()).toBe('1.2.3');
  });

  it('getCliVersion returns undefined when CLI is not installed', () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '' });
    expect(adapter.getCliVersion()).toBeUndefined();
  });

  it('getCliVersion returns undefined when CLI throws', () => {
    mockSpawnSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(adapter.getCliVersion()).toBeUndefined();
  });

  it('getCliVersion returns undefined when stdout is empty', () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '' });
    expect(adapter.getCliVersion()).toBeUndefined();
  });

  // ─── detect() — 3-state availability (Sprint 190 Task 190-002) ────

  describe('detect()', () => {
    beforeEach(() => {
      // Default: which/where lookup succeeds when version probe succeeds
      mockSpawnSync.mockImplementation((cmd: string) => {
        if (cmd === 'which' || cmd === 'where') {
          return { status: 0, stdout: '/usr/local/bin/gemini\n', stderr: '' };
        }
        if (cmd === 'gemini') {
          return { status: 0, stdout: '0.1.2\n', stderr: '' };
        }
        return { status: 1, stdout: '', stderr: '' };
      });
    });

    it('returns ready=true when binary AND auth both present', async () => {
      process.env.GOOGLE_API_KEY = 'AIzaSyTestKey123';
      const result = await adapter.detect();
      expect(result.binary).toBe(true);
      expect(result.auth).toBe(true);
      expect(result.ready).toBe(true);
      expect(result.version).toBeDefined();
    });

    it("returns ready='partial' when binary present but GOOGLE_API_KEY missing", async () => {
      delete process.env.GOOGLE_API_KEY;
      delete process.env.DECKENT_GOOGLE_API_KEY;
      const result = await adapter.detect();
      expect(result.binary).toBe(true);
      expect(result.auth).toBe(false);
      expect(result.ready).toBe('partial');
    });

    it('returns ready=false when binary not found', async () => {
      process.env.GOOGLE_API_KEY = 'AIzaSyTestKey123';
      mockSpawnSync.mockImplementation(() => { throw new Error('ENOENT'); });
      const result = await adapter.detect();
      expect(result.binary).toBe(false);
      expect(result.ready).toBe(false);
    });

    it('exposes parsed semver version string', async () => {
      process.env.GOOGLE_API_KEY = 'AIzaSyTestKey123';
      mockSpawnSync.mockImplementation((cmd: string) => {
        if (cmd === 'which' || cmd === 'where') {
          return { status: 0, stdout: '/usr/local/bin/gemini\n', stderr: '' };
        }
        if (cmd === 'gemini') {
          return { status: 0, stdout: 'gemini-cli 0.3.7 (build abc)\n', stderr: '' };
        }
        return { status: 1, stdout: '', stderr: '' };
      });
      const result = await adapter.detect();
      expect(result.version).toBe('0.3.7');
    });

    it('honors DECKENT_GOOGLE_API_KEY for partial→ready transition', async () => {
      delete process.env.GOOGLE_API_KEY;
      process.env.DECKENT_GOOGLE_API_KEY = 'AIzaDeckentKey';
      const result = await adapter.detect();
      expect(result.auth).toBe(true);
      expect(result.ready).toBe(true);
    });
  });

  // ─── buildGeminiSpawnEnv (Sprint 248 Provider Parity) ──────────────

  it('buildGeminiSpawnEnv strips GEMINI_CLI_IDE_* vars (no IDE-session binding)', () => {
    process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '9999';
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = '/ide/workspace';
    process.env['GEMINI_CLI_IDE_AUTH_TOKEN'] = 'ide-token';
    try {
      const env = buildGeminiSpawnEnv();
      expect(env['GEMINI_CLI_IDE_SERVER_PORT']).toBeUndefined();
      expect(env['GEMINI_CLI_IDE_WORKSPACE_PATH']).toBeUndefined();
      expect(env['GEMINI_CLI_IDE_AUTH_TOKEN']).toBeUndefined();
    } finally {
      delete process.env['GEMINI_CLI_IDE_SERVER_PORT'];
      delete process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
      delete process.env['GEMINI_CLI_IDE_AUTH_TOKEN'];
    }
  });

  it('buildGeminiSpawnEnv injects the key as GEMINI_API_KEY (Developer-API), not GOOGLE_API_KEY (F3-GEMKEY)', () => {
    // Live-verified vs gemini-cli 0.49.0: GOOGLE_API_KEY routes the CLI to Vertex AI
    // and rejects a Developer-API key; the key must arrive as GEMINI_API_KEY.
    delete process.env['GOOGLE_API_KEY'];
    const withKey = buildGeminiSpawnEnv('AIza-the-key');
    expect(withKey['GEMINI_API_KEY']).toBe('AIza-the-key');
    expect(withKey['GOOGLE_API_KEY']).toBeUndefined();
    const withoutKey = buildGeminiSpawnEnv();
    expect(withoutKey['GEMINI_API_KEY']).toBeUndefined();
  });

  it('buildGeminiSpawnEnv strips an inherited GOOGLE_API_KEY so the CLI stays on the Developer endpoint (F3-GEMKEY)', () => {
    process.env['GOOGLE_API_KEY'] = 'inherited-vertex-style-key';
    try {
      const env = buildGeminiSpawnEnv('AIza-the-key');
      expect(env['GOOGLE_API_KEY']).toBeUndefined();
      expect(env['GEMINI_API_KEY']).toBe('AIza-the-key');
    } finally {
      delete process.env['GOOGLE_API_KEY'];
    }
  });

  it('buildGeminiSpawnEnv keeps only Gemini-owned auth and scrubs config-driven foreign credentials', () => {
    const hostEnv: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      LANG: 'en_US.UTF-8',
      ANTHROPIC_API_KEY: 'foreign-anthropic',
      OPENAI_API_KEY: 'foreign-openai',
      GOOGLE_API_KEY: 'foreign-google',
      GEMINI_API_KEY: 'stale-gemini',
      OPENROUTER_API_KEY: 'foreign-openrouter',
      MY_LLM_KEY: 'foreign-custom',
      DECKENT_MY_LLM_KEY: 'foreign-custom-alias',
    };
    const credentialEnvKeys = [
      ...resolveCrossProviderCredentialKeys(),
      'MY_LLM_KEY',
      'DECKENT_MY_LLM_KEY',
    ];

    const env = buildGeminiSpawnEnv('owned-gemini', {
      hostEnv,
      credentialEnvKeys,
    });

    expect(env).toMatchObject({
      PATH: '/usr/bin',
      LANG: 'en_US.UTF-8',
      GEMINI_API_KEY: 'owned-gemini',
      GEMINI_NONINTERACTIVE: '1',
    });
    for (const key of credentialEnvKeys.filter((key) => key !== 'GEMINI_API_KEY')) {
      expect(env[key], `Gemini child must not see provider credential ${key}`).toBeUndefined();
    }
    expect(hostEnv['ANTHROPIC_API_KEY']).toBe('foreign-anthropic');
    expect(hostEnv['GEMINI_API_KEY']).toBe('stale-gemini');
  });

  it('buildGeminiSpawnEnv keeps OAuth/session mode free of inherited provider credentials', () => {
    const credentialEnvKeys = resolveCrossProviderCredentialKeys();
    const hostEnv = Object.fromEntries(
      credentialEnvKeys.map((key) => [key, `foreign-${key}`]),
    );
    const env = buildGeminiSpawnEnv(undefined, {
      hostEnv,
      credentialEnvKeys,
    });

    for (const key of credentialEnvKeys) {
      expect(env[key], `session child must not inherit provider credential ${key}`).toBeUndefined();
    }
    expect(env['GEMINI_NONINTERACTIVE']).toBe('1');
  });

  it('buildGeminiSpawnEnv sets GEMINI_NONINTERACTIVE=1 to prevent interactive login hang', () => {
    // Non-interactive guard: when gemini CLI hits auth failure it must not drop
    // into an interactive `gemini login` flow — it must exit non-zero (fail-fast).
    const env = buildGeminiSpawnEnv();
    expect(env['GEMINI_NONINTERACTIVE']).toBe('1');
    // Also true when API key is provided
    const envWithKey = buildGeminiSpawnEnv('AIza-key');
    expect(envWithKey['GEMINI_NONINTERACTIVE']).toBe('1');
  });

  // ─── Factory ───────────────────────────────────────────────────────

  it('createGeminiAdapter returns GeminiAdapter instance', () => {
    const a = createGeminiAdapter('/some/dir');
    expect(a).toBeInstanceOf(GeminiAdapter);
    expect(a.name).toBe('gemini');
    expect(a.getProjectDir()).toBe('/some/dir');
  });

  it('createGeminiAdapter passes timeout option', () => {
    const a = createGeminiAdapter('/some/dir', { defaultTimeoutMs: 10000 });
    expect(a).toBeInstanceOf(GeminiAdapter);
  });
});
