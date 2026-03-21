import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { SubprocessSpawnBackend, createSubprocessBackend } from '../../src/providers/subprocess.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';

// ─── Mock node:child_process ─────────────────────────────────────────

const mockChildProcess = {
  stdin: {
    write: vi.fn(),
    end: vi.fn(),
  },
  once: vi.fn(),
  kill: vi.fn(),
  pid: 12345,
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
      // Store the exit callback so tests can trigger it
      (child as any)._exitCb = cb;
    }
    return child;
  });
  mockSpawn.mockReturnValue(child);
  return child;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('SubprocessSpawnBackend', () => {
  const projectDir = '/tmp/test-project';
  let backend: SubprocessSpawnBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockOpenSync.mockReturnValue(3);
    backend = new SubprocessSpawnBackend(projectDir);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ─── Identity ────────────────────────────────────────────────────

  describe('identity', () => {
    it('should have name "claude-subprocess"', () => {
      expect(backend.name).toBe('claude-subprocess');
    });

    it('should support opus, sonnet, haiku models', () => {
      expect(backend.supportedModels).toContain('opus');
      expect(backend.supportedModels).toContain('sonnet');
      expect(backend.supportedModels).toContain('haiku');
    });

    it('should support exactly 3 models', () => {
      expect(backend.supportedModels).toHaveLength(3);
    });

    it('should expose getProjectDir()', () => {
      expect(backend.getProjectDir()).toBe(projectDir);
    });
  });

  // ─── spawn() ─────────────────────────────────────────────────────

  describe('spawn()', () => {
    it('should call node:child_process spawn', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test prompt');
      expect(mockSpawn).toHaveBeenCalledOnce();
    });

    it('should spawn with "claude" command', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test prompt');
      const [cmd] = mockSpawn.mock.calls[0];
      expect(cmd).toBe('claude');
    });

    it('should include model in spawn args', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test prompt');
      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('opus');
    });

    it('should include --model flag in args', () => {
      setupMockChild();
      backend.spawn('task-001', 'sonnet', 'test prompt');
      const [, args] = mockSpawn.mock.calls[0];
      const modelIdx = args.indexOf('--model');
      expect(modelIdx).toBeGreaterThan(-1);
      expect(args[modelIdx + 1]).toBe('sonnet');
    });

    it('should write prompt via stdin', () => {
      const child = setupMockChild();
      backend.spawn('task-001', 'opus', 'my prompt');
      expect(child.stdin.write).toHaveBeenCalledWith('my prompt', 'utf-8');
    });

    it('should close stdin after writing prompt', () => {
      const child = setupMockChild();
      backend.spawn('task-001', 'opus', 'my prompt');
      expect(child.stdin.end).toHaveBeenCalled();
    });

    it('should write heartbeat on spawn', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should create task log file in .tasks/ directory', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      const logPathArg = mockOpenSync.mock.calls[0][0];
      expect(logPathArg).toContain('.tasks');
      expect(logPathArg).toContain('task-001.log');
    });

    it('should throw if task is already running', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'first');
      setupMockChild();
      expect(() => backend.spawn('task-001', 'opus', 'second')).toThrow(
        /already running/,
      );
    });

    it('should use opts.projectDir if provided', () => {
      setupMockChild();
      const opts: ProviderSpawnOptions = { projectDir: '/custom/dir' };
      backend.spawn('task-001', 'opus', 'test', opts);
      const [, , spawnOpts] = mockSpawn.mock.calls[0];
      expect(spawnOpts.cwd).toBe('/custom/dir');
    });

    it('should fall back to constructor projectDir when no opts.projectDir', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      const [, , spawnOpts] = mockSpawn.mock.calls[0];
      expect(spawnOpts.cwd).toBe(projectDir);
    });

    it('should include allowedTools in spawn args when provided', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test', { allowedTools: 'Read,Write' });
      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--allowedTools');
      expect(args).toContain('Read,Write');
    });

    it('should include --dangerously-skip-permissions when autoApprove is true', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test', { autoApprove: true });
      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--dangerously-skip-permissions');
    });

    it('should redirect stdout/stderr to log file fd', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      const [, , spawnOpts] = mockSpawn.mock.calls[0];
      const [stdin, stdout, stderr] = spawnOpts.stdio;
      expect(stdin).toBe('pipe');
      expect(stdout).toBe(3); // log fd
      expect(stderr).toBe(3); // log fd
    });

    it('should close log fd after spawn', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      expect(mockCloseSync).toHaveBeenCalledWith(3);
    });

    it('should create tasks dir if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it('should register worker in internal map after spawn', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      expect(backend.listWorkers()).toContain('task-001');
    });
  });

  // ─── kill() ──────────────────────────────────────────────────────

  describe('kill()', () => {
    it('should kill the process with SIGTERM', () => {
      const child = setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      backend.kill('task-001');
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should remove worker from internal map after kill', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      backend.kill('task-001');
      expect(backend.listWorkers()).not.toContain('task-001');
    });

    it('should throw ProviderError when task is not running', () => {
      expect(() => backend.kill('nonexistent-task')).toThrow(/No running worker/);
    });
  });

  // ─── listWorkers() ───────────────────────────────────────────────

  describe('listWorkers()', () => {
    it('should return empty array when no workers are running', () => {
      expect(backend.listWorkers()).toEqual([]);
    });

    it('should return task IDs of running workers', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test1');
      setupMockChild();
      backend.spawn('task-002', 'sonnet', 'test2');
      const workers = backend.listWorkers();
      expect(workers).toContain('task-001');
      expect(workers).toContain('task-002');
    });

    it('should not include killed workers', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      backend.kill('task-001');
      expect(backend.listWorkers()).not.toContain('task-001');
    });
  });

  // ─── checkUsage() ────────────────────────────────────────────────

  describe('checkUsage()', () => {
    it('should return a Promise', () => {
      const result = backend.checkUsage();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return UsageMetrics with numeric percentages', async () => {
      const metrics = await backend.checkUsage();
      expect(typeof metrics.fiveHourPercent).toBe('number');
      expect(typeof metrics.weeklyPercent).toBe('number');
    });

    it('should return zero percentages (defers to UsageTracker)', async () => {
      const metrics = await backend.checkUsage();
      expect(metrics.fiveHourPercent).toBe(0);
      expect(metrics.weeklyPercent).toBe(0);
    });

    it('should include measuredAt as ISO 8601 string', async () => {
      const metrics = await backend.checkUsage();
      expect(metrics.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ─── isAvailable() ───────────────────────────────────────────────

  describe('isAvailable()', () => {
    it('should return a Promise', () => {
      // Mock spawn for isAvailable to avoid hanging
      const child = {
        once: vi.fn().mockImplementation((event, cb) => {
          if (event === 'exit') cb(0);
          return child;
        }),
      };
      mockSpawn.mockReturnValue(child);
      const result = backend.isAvailable();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return true when claude exits with code 0', async () => {
      const child = {
        once: vi.fn().mockImplementation((event, cb) => {
          if (event === 'exit') cb(0);
          return child;
        }),
      };
      mockSpawn.mockReturnValue(child);
      const available = await backend.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when claude exits with non-zero code', async () => {
      const child = {
        once: vi.fn().mockImplementation((event, cb) => {
          if (event === 'exit') cb(1);
          return child;
        }),
      };
      mockSpawn.mockReturnValue(child);
      const available = await backend.isAvailable();
      expect(available).toBe(false);
    });

    it('should return false when spawn emits error', async () => {
      const child = {
        once: vi.fn().mockImplementation((event, cb) => {
          if (event === 'error') cb(new Error('ENOENT'));
          return child;
        }),
      };
      mockSpawn.mockReturnValue(child);
      const available = await backend.isAvailable();
      expect(available).toBe(false);
    });
  });

  // ─── buildCommand() ──────────────────────────────────────────────

  describe('buildCommand()', () => {
    it('should build basic command', () => {
      const cmd = backend.buildCommand('opus', '/tmp/prompt.txt');
      expect(cmd).toBe('claude -p - --model opus < /tmp/prompt.txt');
    });

    it('should include --allowedTools when provided', () => {
      const cmd = backend.buildCommand('sonnet', '/p.txt', { allowedTools: 'Read,Write' });
      expect(cmd).toContain("--allowedTools 'Read,Write'");
    });

    it('should include --dangerously-skip-permissions when autoApprove is true', () => {
      const cmd = backend.buildCommand('haiku', '/p.txt', { autoApprove: true });
      expect(cmd).toContain('--dangerously-skip-permissions');
    });

    it('should not include --dangerously-skip-permissions when autoApprove is false', () => {
      const cmd = backend.buildCommand('haiku', '/p.txt', { autoApprove: false });
      expect(cmd).not.toContain('--dangerously-skip-permissions');
    });

    it('should use stdin redirection from promptPath', () => {
      const cmd = backend.buildCommand('opus', '/path/prompt.txt');
      expect(cmd).toContain('< /path/prompt.txt');
    });
  });

  // ─── Heartbeat ───────────────────────────────────────────────────

  describe('heartbeat', () => {
    it('should write heartbeat file on spawn', () => {
      setupMockChild();
      vi.clearAllMocks(); // clear earlier calls
      mockOpenSync.mockReturnValue(3);
      mockExistsSync.mockReturnValue(true);
      const b2 = new SubprocessSpawnBackend(projectDir);
      setupMockChild();
      b2.spawn('task-hb', 'opus', 'test');
      // writeFileSync should have been called for heartbeat
      expect(mockWriteFileSync).toHaveBeenCalled();
      const [hbPath, content] = mockWriteFileSync.mock.calls[0];
      expect(hbPath).toContain('task-hb.hb');
      const parsed = JSON.parse(content as string);
      expect(parsed.taskId).toBe('task-hb');
      expect(parsed.status).toBe('EXECUTING');
    });

    it('should include timestamp in heartbeat', () => {
      setupMockChild();
      backend.spawn('task-ts', 'opus', 'test');
      const [, content] = mockWriteFileSync.mock.calls[0];
      const parsed = JSON.parse(content as string);
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ─── getLogPath() ────────────────────────────────────────────────

  describe('getLogPath()', () => {
    it('should return log path for task', () => {
      const logPath = backend.getLogPath('task-001');
      expect(logPath).toContain('.tasks');
      expect(logPath).toContain('task-001.log');
    });

    it('should use project dir in path', () => {
      const logPath = backend.getLogPath('task-001');
      expect(logPath).toContain(projectDir);
    });
  });

  // ─── Timeout ─────────────────────────────────────────────────────

  describe('timeout', () => {
    it('should accept defaultTimeoutMs in constructor', () => {
      const b = new SubprocessSpawnBackend(projectDir, { defaultTimeoutMs: 5000 });
      expect(b).toBeInstanceOf(SubprocessSpawnBackend);
    });

    it('should auto-kill with SIGKILL after timeout', async () => {
      vi.useFakeTimers();
      const child = setupMockChild();
      const b = new SubprocessSpawnBackend(projectDir, { defaultTimeoutMs: 1000 });
      b.spawn('task-timeout', 'opus', 'test');
      vi.advanceTimersByTime(1100);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      vi.useRealTimers();
    });
  });
});

// ─── createSubprocessBackend factory ────────────────────────────────

describe('createSubprocessBackend', () => {
  it('should create a SubprocessSpawnBackend instance', () => {
    const backend = createSubprocessBackend('/some/dir');
    expect(backend).toBeInstanceOf(SubprocessSpawnBackend);
  });

  it('should create backend with given project directory', () => {
    const backend = createSubprocessBackend('/my/project');
    expect(backend.getProjectDir()).toBe('/my/project');
  });

  it('should accept timeout option', () => {
    const backend = createSubprocessBackend('/dir', { defaultTimeoutMs: 3000 });
    expect(backend).toBeInstanceOf(SubprocessSpawnBackend);
  });
});
