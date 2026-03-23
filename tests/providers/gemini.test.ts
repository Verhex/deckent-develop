import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { GeminiAdapter, createGeminiAdapter, GEMINI_AUTH_HEADER } from '../../src/providers/gemini.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import { ProviderError } from '../../src/core/provider.js';

// ─── Mock node:child_process ─────────────────────────────────────────

const mockChildProcess = {
  stdin: {
    write: vi.fn(),
    end: vi.fn(),
  },
  once: vi.fn(),
  kill: vi.fn(),
  pid: 54321,
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// ─── Mock node:fs ────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(3),
  closeSync: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';

const mockSpawn = spawn as unknown as MockInstance;
const mockWriteFileSync = writeFileSync as unknown as MockInstance;
const mockMkdirSync = mkdirSync as unknown as MockInstance;
const mockExistsSync = existsSync as unknown as MockInstance;
const mockOpenSync = openSync as unknown as MockInstance;
const mockCloseSync = closeSync as unknown as MockInstance;

// ─── Helpers ─────────────────────────────────────────────────────────

function setupMockChild(overrides?: Partial<typeof mockChildProcess>) {
  const child = { ...mockChildProcess, ...overrides };
  child.once = vi.fn().mockImplementation((event, cb) => {
    if (event === 'exit') {
      (child as any)._exitCb = cb;
    }
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
    mockOpenSync.mockReturnValue(3);
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

  it('getApiKey returns undefined when env var missing', () => {
    delete process.env.GOOGLE_API_KEY;
    expect(adapter.getApiKey()).toBeUndefined();
  });

  // ─── isAvailable() ─────────────────────────────────────────────────

  it('isAvailable returns true when GOOGLE_API_KEY is set', async () => {
    process.env.GOOGLE_API_KEY = 'some-key';
    const result = await adapter.isAvailable();
    expect(result).toBe(true);
  });

  it('isAvailable returns false when GOOGLE_API_KEY is not set', async () => {
    delete process.env.GOOGLE_API_KEY;
    const result = await adapter.isAvailable();
    expect(result).toBe(false);
  });

  // ─── Request Format Verification ───────────────────────────────────

  it('buildApiScript uses contents[].parts[].text format per API spec', () => {
    const script = adapter.buildApiScript(
      'https://example.com/api',
      'test-key',
      'Hello world',
    );
    expect(script).toContain("contents: [{ parts: [{ text: 'Hello world' }] }]");
    expect(script).toContain('generationConfig');
    expect(script).toContain('maxOutputTokens');
  });

  it('buildApiScript sends auth via x-goog-api-key header (not query param)', () => {
    const script = adapter.buildApiScript(
      'https://example.com/api',
      'secret-key-xyz',
      'Test',
    );
    expect(script).toContain("'x-goog-api-key': 'secret-key-xyz'");
    expect(script).not.toContain('?key=');
  });

  it('buildApiScript parses response candidates[0].content.parts[0].text', () => {
    const script = adapter.buildApiScript('https://example.com', 'k', 'test');
    expect(script).toContain('candidates?.[0]?.content?.parts?.[0]?.text');
  });

  it('request body uses contents array with parts (not messages)', () => {
    const script = adapter.buildApiScript('url', 'key', 'test');
    expect(script).toContain('contents:');
    expect(script).toContain('parts:');
    expect(script).not.toContain('messages:');
  });

  it('auth header is x-goog-api-key (not Authorization Bearer)', () => {
    const script = adapter.buildApiScript('url', 'my-key', 'test');
    expect(script).toContain('x-goog-api-key');
    expect(script).not.toContain('Authorization');
    expect(script).not.toContain('Bearer');
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

  it('spawn creates subprocess with node -e for API call', () => {
    const child = setupMockChild();
    adapter.spawn('task-001', 'gemini-2.5-pro', 'Hello Gemini');

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('node');
    expect(args[0]).toBe('-e');
    expect(args[1]).toContain('gemini-2.5-pro');
    expect(args[1]).toContain('generateContent');
  });

  it('spawn uses header auth, not query param', () => {
    setupMockChild();
    adapter.spawn('task-001a', 'gemini-2.5-pro', 'Hello');

    const script = mockSpawn.mock.calls[0][1][1];
    expect(script).toContain("'x-goog-api-key': 'test-api-key-123'");
    expect(script).not.toContain('?key=');
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

  it('spawn throws when API key is missing', () => {
    delete process.env.GOOGLE_API_KEY;
    expect(() =>
      adapter.spawn('task-005', 'gemini-2.5-pro', 'Test'),
    ).toThrow(ProviderError);
    expect(() =>
      adapter.spawn('task-005', 'gemini-2.5-pro', 'Test'),
    ).toThrow(/GOOGLE_API_KEY/);
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

  it('spawn escapes special characters in prompt', () => {
    setupMockChild();
    adapter.spawn('task-010', 'gemini-2.5-pro', "It's a\nnewline\\test");

    const script = mockSpawn.mock.calls[0][1][1];
    expect(script).toContain("\\'");
    expect(script).toContain('\\n');
    expect(script).toContain('\\\\');
  });

  it('spawn log file is created in tasks directory', () => {
    setupMockChild();
    adapter.spawn('task-logtest', 'gemini-2.5-pro', 'Test');
    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('task-logtest.log'),
      'a',
    );
  });

  it('spawn closes log file descriptor after spawn', () => {
    setupMockChild();
    adapter.spawn('task-fdtest', 'gemini-2.5-pro', 'Test');
    expect(mockCloseSync).toHaveBeenCalledWith(3);
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

  // ─── checkUsage() ──────────────────────────────────────────────────

  it('checkUsage returns neutral defaults (no quota API available)', async () => {
    const usage = await adapter.checkUsage();
    expect(usage.fiveHourPercent).toBe(0);
    expect(usage.weeklyPercent).toBe(0);
    expect(usage.measuredAt).toBeDefined();
  });

  it('checkUsage measuredAt is a valid ISO string', async () => {
    const usage = await adapter.checkUsage();
    expect(() => new Date(usage.measuredAt)).not.toThrow();
    expect(new Date(usage.measuredAt).toISOString()).toBe(usage.measuredAt);
  });

  // ─── buildCommand() ────────────────────────────────────────────────

  it('buildCommand returns curl with header auth (not query param)', () => {
    const cmd = adapter.buildCommand('gemini-2.5-pro', '/tmp/prompt.json');
    expect(cmd).toContain('curl');
    expect(cmd).toContain('x-goog-api-key: test-api-key-123');
    expect(cmd).toContain('gemini-2.5-pro:generateContent');
    expect(cmd).toContain('/tmp/prompt.json');
    expect(cmd).not.toContain('?key=');
  });

  it('buildCommand uses placeholder when API key is missing', () => {
    delete process.env.GOOGLE_API_KEY;
    const cmd = adapter.buildCommand('gemini-2.5-flash', '/tmp/p.json');
    expect(cmd).toContain('<GOOGLE_API_KEY>');
  });

  it('buildCommand includes actual API key when present', () => {
    process.env.GOOGLE_API_KEY = 'my-key';
    const cmd = adapter.buildCommand('gemini-2.5-pro', '/tmp/p.json');
    expect(cmd).toContain('my-key');
  });

  it('buildCommand URL uses generativelanguage.googleapis.com', () => {
    const cmd = adapter.buildCommand('gemini-2.5-pro', '/tmp/p.json');
    expect(cmd).toContain('generativelanguage.googleapis.com');
  });

  // ─── buildPlannerCommand() ─────────────────────────────────────────

  it('buildPlannerCommand returns node -e with API script', () => {
    const result = adapter.buildPlannerCommand('Plan this sprint', 'gemini-2.5-pro');
    expect(result.command).toBe('node');
    expect(result.args[0]).toBe('-e');
    expect(result.args[1]).toContain('generateContent');
    expect(result.args[1]).toContain('gemini-2.5-pro');
  });

  it('buildPlannerCommand includes API key in script', () => {
    process.env.GOOGLE_API_KEY = 'planner-key-123';
    const result = adapter.buildPlannerCommand('Plan', 'gemini-2.5-flash');
    expect(result.args[1]).toContain('planner-key-123');
  });

  it('buildPlannerCommand throws when API key missing', () => {
    delete process.env.GOOGLE_API_KEY;
    expect(() => adapter.buildPlannerCommand('Plan', 'gemini-2.5-pro'))
      .toThrow(ProviderError);
  });

  it('buildPlannerCommand uses correct endpoint URL', () => {
    const result = adapter.buildPlannerCommand('Plan', 'gemini-2.5-pro');
    expect(result.args[1]).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    );
  });

  // ─── validateApiKey() ──────────────────────────────────────────────

  it('validateApiKey returns invalid when key is not set', () => {
    delete process.env.GOOGLE_API_KEY;
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

  // ─── Edge Cases ────────────────────────────────────────────────────

  it('buildApiScript escapes backticks in prompt', () => {
    const script = adapter.buildApiScript('url', 'key', 'test `code` here');
    expect(script).toContain('`code`');
  });

  it('buildApiScript escapes carriage returns', () => {
    const script = adapter.buildApiScript('url', 'key', "line\rwith\rcr");
    expect(script).toContain('\\r');
    expect(script).not.toContain('\r');
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
