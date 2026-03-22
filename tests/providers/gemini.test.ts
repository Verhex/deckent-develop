import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { GeminiAdapter, createGeminiAdapter } from '../../src/providers/gemini.js';
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

  it('supports gemini models', () => {
    expect(adapter.supportedModels).toContain('gemini-2.5-pro');
    expect(adapter.supportedModels).toContain('gemini-2.5-flash');
    expect(adapter.supportedModels).toHaveLength(2);
  });

  it('does not include non-gemini models', () => {
    expect(adapter.supportedModels).not.toContain('opus');
    expect(adapter.supportedModels).not.toContain('sonnet');
    expect(adapter.supportedModels).not.toContain('gpt-4.1');
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

  // ─── spawn() ───────────────────────────────────────────────────────

  it('spawn creates subprocess with node -e for API call', () => {
    const child = setupMockChild();
    adapter.spawn('task-001', 'gemini-2.5-pro', 'Hello Gemini');

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('node');
    expect(args[0]).toBe('-e');
    // Script should contain the API URL with model name
    expect(args[1]).toContain('gemini-2.5-pro');
    expect(args[1]).toContain('generateContent');
    expect(args[1]).toContain('test-api-key-123');
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
    // Trigger exit callback
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

  it('checkUsage returns neutral defaults', async () => {
    const usage = await adapter.checkUsage();
    expect(usage.fiveHourPercent).toBe(0);
    expect(usage.weeklyPercent).toBe(0);
    expect(usage.measuredAt).toBeDefined();
  });

  // ─── buildCommand() ────────────────────────────────────────────────

  it('buildCommand returns curl command with API URL', () => {
    const cmd = adapter.buildCommand('gemini-2.5-pro', '/tmp/prompt.json');
    expect(cmd).toContain('curl');
    expect(cmd).toContain('gemini-2.5-pro');
    expect(cmd).toContain('generateContent');
    expect(cmd).toContain('/tmp/prompt.json');
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
