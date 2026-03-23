import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';

// ─── Mock node:child_process ─────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

// ─── Mock node:fs ────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  openSync: vi.fn().mockReturnValue(42),
  closeSync: vi.fn(),
}));

import { CodexAdapter, createCodexAdapter } from '../../src/providers/codex.js';
import { ProviderError } from '../../src/core/provider.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const mockSpawn = spawn as unknown as MockInstance;
const mockSpawnSync = spawnSync as unknown as MockInstance;

const mockExistsSync = existsSync as unknown as MockInstance;
const mockMkdirSync = mkdirSync as unknown as MockInstance;
const mockWriteFileSync = writeFileSync as unknown as MockInstance;

function createMockChildProcess() {
  return {
    stdin: { write: vi.fn().mockReturnValue(true), end: vi.fn() },
    once: vi.fn().mockReturnThis(),
    kill: vi.fn(),
    pid: 12345,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('CodexAdapter', () => {
  const projectDir = '/tmp/test-codex-project';
  let adapter: CodexAdapter;
  let mockChildProcess: ReturnType<typeof createMockChildProcess>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['OPENAI_API_KEY'] = 'sk-test-key-123';
    mockChildProcess = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChildProcess);
    adapter = new CodexAdapter(projectDir);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─── Identity ──────────────────────────────────────────────────────

  describe('identity', () => {
    it('should have name "codex"', () => {
      expect(adapter.name).toBe('codex');
    });

    it('should support gpt-4.1, o3, o4-mini models', () => {
      expect(adapter.supportedModels).toContain('gpt-4.1');
      expect(adapter.supportedModels).toContain('o3');
      expect(adapter.supportedModels).toContain('o4-mini');
    });

    it('should support exactly 6 models', () => {
      expect(adapter.supportedModels).toHaveLength(6);
    });

    it('should support gpt-5, gpt-5-mini, gpt-4.1-mini models', () => {
      expect(adapter.supportedModels).toContain('gpt-5');
      expect(adapter.supportedModels).toContain('gpt-5-mini');
      expect(adapter.supportedModels).toContain('gpt-4.1-mini');
    });

    it('should implement ProviderAdapter interface', () => {
      expect(typeof adapter.name).toBe('string');
      expect(Array.isArray(adapter.supportedModels)).toBe(true);
      expect(typeof adapter.spawn).toBe('function');
      expect(typeof adapter.kill).toBe('function');
      expect(typeof adapter.listWorkers).toBe('function');
      expect(typeof adapter.checkUsage).toBe('function');
      expect(typeof adapter.isAvailable).toBe('function');
      expect(typeof adapter.buildCommand).toBe('function');
    });
  });

  // ─── spawn() ───────────────────────────────────────────────────────

  describe('spawn()', () => {
    it('should spawn codex process with exec subcommand and correct model', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'test prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['exec', '--model', 'gpt-4.1', '--quiet']),
        expect.any(Object),
      );
    });

    it('should have exec as the first arg', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'test prompt');
      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args[0]).toBe('exec');
    });

    it('should pass o3 model correctly', () => {
      adapter.spawn('task-002', 'o3', 'test prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--model', 'o3']),
        expect.any(Object),
      );
    });

    it('should pass o4-mini model correctly', () => {
      adapter.spawn('task-003', 'o4-mini', 'test prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--model', 'o4-mini']),
        expect.any(Object),
      );
    });

    it('should reject unsupported model', () => {
      expect(() => adapter.spawn('task-001', 'opus', 'prompt')).toThrow(ProviderError);
      expect(() => adapter.spawn('task-001', 'opus', 'prompt')).toThrow(/Unsupported model/);
    });

    it('should reject sonnet model', () => {
      expect(() => adapter.spawn('task-001', 'sonnet', 'prompt')).toThrow(ProviderError);
    });

    it('should reject haiku model', () => {
      expect(() => adapter.spawn('task-001', 'haiku', 'prompt')).toThrow(ProviderError);
    });

    it('should throw when spawning duplicate taskId', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(() => adapter.spawn('task-001', 'gpt-4.1', 'prompt')).toThrow(
        /already running/,
      );
    });

    it('should write prompt to stdin', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'hello codex');
      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('hello codex', 'utf-8');
      expect(mockChildProcess.stdin.end).toHaveBeenCalled();
    });

    it('should use opts.projectDir if provided', () => {
      const opts: ProviderSpawnOptions = { projectDir: '/custom/dir' };
      adapter.spawn('task-001', 'gpt-4.1', 'prompt', opts);
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.any(Array),
        expect.objectContaining({ cwd: '/custom/dir' }),
      );
    });

    it('should use constructor projectDir when opts.projectDir is absent', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.any(Array),
        expect.objectContaining({ cwd: projectDir }),
      );
    });

    it('should create tasks directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.tasks'),
        { recursive: true },
      );
    });

    it('should write heartbeat file on spawn', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('task-task-001.hb'),
        expect.stringContaining('codex-task-001'),
        'utf-8',
      );
    });

    it('should include --approval-mode full-auto when autoApprove is true', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt', { autoApprove: true });
      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--approval-mode', 'full-auto']),
        expect.any(Object),
      );
    });

    it('should not include --allowed-tools (not an official Codex CLI flag)', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt', { allowedTools: 'Read,Write' });
      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).not.toContain('--allowed-tools');
    });

    it('should register exit handler on child process', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      expect(mockChildProcess.once).toHaveBeenCalledWith('exit', expect.any(Function));
    });
  });

  // ─── kill() ────────────────────────────────────────────────────────

  describe('kill()', () => {
    it('should kill a running worker', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      adapter.kill('task-001');
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should remove worker from tracking after kill', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      adapter.kill('task-001');
      expect(adapter.listWorkers()).toEqual([]);
    });

    it('should throw when killing non-existent worker', () => {
      expect(() => adapter.kill('nonexistent')).toThrow(ProviderError);
      expect(() => adapter.kill('nonexistent')).toThrow(/No running worker/);
    });
  });

  // ─── listWorkers() ─────────────────────────────────────────────────

  describe('listWorkers()', () => {
    it('should return empty array initially', () => {
      expect(adapter.listWorkers()).toEqual([]);
    });

    it('should return spawned worker taskIds', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      mockSpawn.mockReturnValueOnce(createMockChildProcess());
      adapter.spawn('task-002', 'o3', 'prompt');
      expect(adapter.listWorkers()).toEqual(['task-001', 'task-002']);
    });

    it('should not include killed workers', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      adapter.kill('task-001');
      expect(adapter.listWorkers()).toEqual([]);
    });
  });

  // ─── checkUsage() ──────────────────────────────────────────────────

  describe('checkUsage()', () => {
    it('should return a Promise', () => {
      const result = adapter.checkUsage();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return UsageMetrics shape', async () => {
      const metrics = await adapter.checkUsage();
      expect(typeof metrics.fiveHourPercent).toBe('number');
      expect(typeof metrics.weeklyPercent).toBe('number');
      expect(typeof metrics.measuredAt).toBe('string');
    });

    it('should return zero defaults when API key is present', async () => {
      const metrics = await adapter.checkUsage();
      expect(metrics.fiveHourPercent).toBe(0);
      expect(metrics.weeklyPercent).toBe(0);
    });

    it('should return safe defaults when OPENAI_API_KEY is missing', async () => {
      delete process.env['OPENAI_API_KEY'];
      const metrics = await adapter.checkUsage();
      expect(metrics.fiveHourPercent).toBe(50);
      expect(metrics.weeklyPercent).toBe(30);
    });

    it('should include measuredAt as ISO 8601 string', async () => {
      const metrics = await adapter.checkUsage();
      expect(metrics.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ─── isAvailable() ─────────────────────────────────────────────────

  describe('isAvailable()', () => {
    it('should return true when codex --version succeeds and API key set', async () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'codex 1.0.0', stderr: '' });
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('should return false when OPENAI_API_KEY is missing', async () => {
      delete process.env['OPENAI_API_KEY'];
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('should return false when codex --version fails', async () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'not found' });
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('should return false when spawnSync throws', async () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('should call codex --version', async () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'codex 1.0.0', stderr: '' });
      await adapter.isAvailable();
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'codex',
        ['--version'],
        expect.objectContaining({ encoding: 'utf-8' }),
      );
    });
  });

  // ─── buildCommand() ────────────────────────────────────────────────

  describe('buildCommand()', () => {
    it('should build command with exec subcommand and --quiet flag', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/tmp/prompt.txt');
      expect(cmd).toBe('codex exec --model gpt-4.1 --quiet < /tmp/prompt.txt');
    });

    it('should include correct model in command', () => {
      expect(adapter.buildCommand('gpt-4.1', '/p')).toContain('--model gpt-4.1');
      expect(adapter.buildCommand('o3', '/p')).toContain('--model o3');
      expect(adapter.buildCommand('o4-mini', '/p')).toContain('--model o4-mini');
    });

    it('should not include --allowed-tools (not an official Codex CLI flag)', () => {
      const cmd = adapter.buildCommand('o3', '/tmp/p.txt', { allowedTools: 'Read,Write' });
      expect(cmd).not.toContain('--allowed-tools');
    });

    it('should include --approval-mode full-auto when autoApprove is true', () => {
      const cmd = adapter.buildCommand('o3', '/tmp/p.txt', { autoApprove: true });
      expect(cmd).toContain('--approval-mode full-auto');
      expect(cmd).not.toContain('--full-auto');
    });

    it('should not include --approval-mode when autoApprove is false', () => {
      const cmd = adapter.buildCommand('o3', '/tmp/p.txt', { autoApprove: false });
      expect(cmd).not.toContain('--approval-mode');
    });

    it('should use stdin redirection from promptPath', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/path/to/prompt.txt');
      expect(cmd).toContain('< /path/to/prompt.txt');
    });

    it('should start with codex exec', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/tmp/p.txt');
      expect(cmd.startsWith('codex exec ')).toBe(true);
    });

    it('should combine autoApprove with model (allowedTools ignored)', () => {
      const cmd = adapter.buildCommand('gpt-4.1', '/tmp/p.txt', {
        allowedTools: 'Read',
        autoApprove: true,
      });
      expect(cmd).not.toContain('--allowed-tools');
      expect(cmd).toContain('--approval-mode full-auto');
    });
  });

  // ─── Accessors ─────────────────────────────────────────────────────

  describe('accessors', () => {
    it('getProjectDir should return constructor projectDir', () => {
      expect(adapter.getProjectDir()).toBe(projectDir);
    });

    it('getLogPath should return correct log path', () => {
      expect(adapter.getLogPath('task-001')).toContain('task-task-001.log');
      expect(adapter.getLogPath('task-001')).toContain('.tasks');
    });

    it('getWorkerEntry should return undefined for unknown task', () => {
      expect(adapter.getWorkerEntry('unknown')).toBeUndefined();
    });

    it('getWorkerEntry should return entry for spawned worker', () => {
      adapter.spawn('task-001', 'gpt-4.1', 'prompt');
      const entry = adapter.getWorkerEntry('task-001');
      expect(entry).toBeDefined();
      expect(entry?.taskId).toBe('task-001');
    });
  });
});

// ─── createCodexAdapter factory ──────────────────────────────────────

describe('createCodexAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['OPENAI_API_KEY'] = 'sk-test-key-123';
  });

  it('should create a CodexAdapter instance', () => {
    const adapter = createCodexAdapter('/some/dir');
    expect(adapter).toBeInstanceOf(CodexAdapter);
  });

  it('should create adapter with given project directory', () => {
    const adapter = createCodexAdapter('/my/project');
    expect(adapter.getProjectDir()).toBe('/my/project');
  });

  it('should pass options to constructor', () => {
    const adapter = createCodexAdapter('/dir', { defaultTimeoutMs: 5000 });
    expect(adapter).toBeInstanceOf(CodexAdapter);
  });
});
