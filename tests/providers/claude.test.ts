import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { ClaudeAdapter, createClaudeAdapter } from '../../src/providers/claude.js';
import type { ClaudeBackend } from '../../src/providers/claude.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import { ProviderError } from '../../src/core/provider.js';

// ─── Mock tmux module ────────────────────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  ensureSession: vi.fn(),
  isSessionActive: vi.fn().mockReturnValue(true),
  cleanupPromptFile: vi.fn(),
}));

// ─── Mock node:fs ────────────────────────────────────────────────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readdirSync: vi.fn().mockReturnValue([]),
    existsSync: vi.fn().mockReturnValue(false),
    openSync: vi.fn().mockReturnValue(42),
    closeSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

// ─── Mock child_process.spawnSync ────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn().mockReturnValue({
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    once: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  }),
}));

import * as tmux from '../../src/orchestra/tmux.js';
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

const mockSpawnSync = spawnSync as unknown as MockInstance;
const mockTmuxSpawnWorker = tmux.spawnWorker as MockInstance;
const mockTmuxKillWorker = tmux.killWorker as MockInstance;
const mockTmuxListWorkers = tmux.listWorkers as MockInstance;
const mockTmuxEnsureSession = tmux.ensureSession as MockInstance;
const mockTmuxIsSessionActive = tmux.isSessionActive as MockInstance;
const mockTmuxCleanupPromptFile = tmux.cleanupPromptFile as MockInstance;
const mockReaddirSync = readdirSync as unknown as MockInstance;
const mockExistsSync = existsSync as unknown as MockInstance;

// ─── Tests ───────────────────────────────────────────────────────────

describe('ClaudeAdapter', () => {
  const projectDir = '/tmp/test-project';
  let adapter: ClaudeAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ClaudeAdapter(projectDir);
  });

  // ─── Identity ────────────────────────────────────────────────────

  describe('identity', () => {
    it('should have name "claude-tmux"', () => {
      expect(adapter.name).toBe('claude-tmux');
    });

    it('should support opus, sonnet, haiku models', () => {
      expect(adapter.supportedModels).toContain('opus');
      expect(adapter.supportedModels).toContain('sonnet');
      expect(adapter.supportedModels).toContain('haiku');
    });

    it('should support exactly 3 models', () => {
      expect(adapter.supportedModels).toHaveLength(3);
    });

    it('should implement ProviderAdapter interface (name, supportedModels, spawn, kill, listWorkers, checkUsage, isAvailable, buildCommand)', () => {
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

  // ─── spawn() ─────────────────────────────────────────────────────

  describe('spawn()', () => {
    it('should call ensureSession before spawning', () => {
      adapter.spawn('task-001', 'opus', 'test prompt');
      expect(mockTmuxEnsureSession).toHaveBeenCalledOnce();
    });

    it('should call tmux.spawnWorker with correct arguments', () => {
      adapter.spawn('task-001', 'opus', 'test prompt');
      expect(mockTmuxSpawnWorker).toHaveBeenCalledWith(
        'task-001',
        'opus',
        'test prompt',
        projectDir,
        { allowedTools: undefined, autoApprove: undefined },
      );
    });

    it('should pass allowedTools from opts', () => {
      const opts: ProviderSpawnOptions = { allowedTools: 'Read,Write' };
      adapter.spawn('task-001', 'sonnet', 'test', opts);
      expect(mockTmuxSpawnWorker).toHaveBeenCalledWith(
        'task-001',
        'sonnet',
        'test',
        projectDir,
        { allowedTools: 'Read,Write', autoApprove: undefined },
      );
    });

    it('should pass autoApprove from opts', () => {
      const opts: ProviderSpawnOptions = { autoApprove: true };
      adapter.spawn('task-002', 'haiku', 'prompt', opts);
      expect(mockTmuxSpawnWorker).toHaveBeenCalledWith(
        'task-002',
        'haiku',
        'prompt',
        projectDir,
        { allowedTools: undefined, autoApprove: true },
      );
    });

    it('should use opts.projectDir if provided', () => {
      const opts: ProviderSpawnOptions = { projectDir: '/custom/dir' };
      adapter.spawn('task-001', 'opus', 'prompt', opts);
      expect(mockTmuxSpawnWorker).toHaveBeenCalledWith(
        'task-001',
        'opus',
        'prompt',
        '/custom/dir',
        expect.any(Object),
      );
    });

    it('should fall back to constructor projectDir when opts.projectDir is absent', () => {
      adapter.spawn('task-003', 'sonnet', 'prompt');
      expect(mockTmuxSpawnWorker).toHaveBeenCalledWith(
        'task-003',
        'sonnet',
        'prompt',
        projectDir,
        expect.any(Object),
      );
    });
  });

  // ─── kill() ──────────────────────────────────────────────────────

  describe('kill()', () => {
    it('should call tmux.killWorker with the task ID', () => {
      adapter.kill('task-001');
      expect(mockTmuxKillWorker).toHaveBeenCalledWith('task-001');
    });

    it('should forward any errors thrown by killWorker', () => {
      mockTmuxKillWorker.mockImplementation(() => {
        throw new Error('tmux kill failed');
      });
      expect(() => adapter.kill('task-001')).toThrow('tmux kill failed');
    });

    it('should scan for orphaned prompt files after killing worker', () => {
      mockTmuxKillWorker.mockReset();
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);
      adapter.kill('task-001');
      expect(mockExistsSync).toHaveBeenCalled();
    });

    it('should not scan for prompt files when tasks dir does not exist', () => {
      mockTmuxKillWorker.mockReset();
      mockExistsSync.mockReturnValue(false);
      adapter.kill('task-001');
      expect(mockReaddirSync).not.toHaveBeenCalled();
    });
  });

  // ─── Tmpfile cleanup ─────────────────────────────────────────────

  describe('tmpfile cleanup', () => {
    beforeEach(() => {
      // Reset killWorker to default (non-throwing) implementation for cleanup tests
      mockTmuxKillWorker.mockReset();
    });

    it('should call cleanupPromptFile for each .prompt-*.txt file found', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['.prompt-abc123.txt', '.prompt-def456.txt']);
      adapter.kill('task-001');
      expect(mockTmuxCleanupPromptFile).toHaveBeenCalledTimes(2);
    });

    it('should only clean up files matching .prompt-*.txt pattern', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([
        '.prompt-abc123.txt',
        'task-001.json',
        'task-001.hb',
        '.prompt-xyz789.txt',
        'task-001.result',
      ]);
      adapter.kill('task-001');
      expect(mockTmuxCleanupPromptFile).toHaveBeenCalledTimes(2);
    });

    it('should pass full path to cleanupPromptFile', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['.prompt-abc123.txt']);
      adapter.kill('task-001');
      expect(mockTmuxCleanupPromptFile).toHaveBeenCalledWith(
        expect.stringContaining('.prompt-abc123.txt'),
      );
    });

    it('should include tasks dir in the cleanup path', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['.prompt-abc123.txt']);
      adapter.kill('task-001');
      expect(mockTmuxCleanupPromptFile).toHaveBeenCalledWith(
        expect.stringContaining('.tasks'),
      );
    });

    it('should not call cleanupPromptFile when no prompt files found', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['task-001.json', 'task-001.hb']);
      adapter.kill('task-001');
      expect(mockTmuxCleanupPromptFile).not.toHaveBeenCalled();
    });

    it('should handle readdirSync throwing gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      // Should not throw
      expect(() => adapter.kill('task-001')).not.toThrow();
    });

    it('should still call killWorker even when cleanup scan fails', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => {
        throw new Error('EACCES');
      });
      adapter.kill('task-001');
      expect(mockTmuxKillWorker).toHaveBeenCalledWith('task-001');
    });

    it('should use projectDir from constructor when building cleanup path', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['.prompt-abc123.txt']);
      adapter.kill('task-001');
      expect(mockExistsSync).toHaveBeenCalledWith(
        expect.stringContaining(projectDir),
      );
    });
  });

  // ─── listWorkers() ───────────────────────────────────────────────

  describe('listWorkers()', () => {
    it('should return worker list from tmux.listWorkers', () => {
      mockTmuxListWorkers.mockReturnValue(['task-001', 'task-002']);
      expect(adapter.listWorkers()).toEqual(['task-001', 'task-002']);
    });

    it('should return empty array when no workers active', () => {
      mockTmuxListWorkers.mockReturnValue([]);
      expect(adapter.listWorkers()).toEqual([]);
    });
  });

  // ─── checkUsage() ────────────────────────────────────────────────

  describe('checkUsage()', () => {
    it('should return a Promise', () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' });
      const result = adapter.checkUsage();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return UsageMetrics shape with fiveHourPercent and weeklyPercent', async () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' });
      const metrics = await adapter.checkUsage();
      expect(typeof metrics.fiveHourPercent).toBe('number');
      expect(typeof metrics.weeklyPercent).toBe('number');
      expect(typeof metrics.measuredAt).toBe('string');
    });

    it('should return safe defaults when claude command fails', async () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'error' });
      const metrics = await adapter.checkUsage();
      expect(metrics.fiveHourPercent).toBe(50);
      expect(metrics.weeklyPercent).toBe(30);
    });

    it('should parse 5-hour percentage from output', async () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: '5hr: 75% used\nweekly: 40% used',
        stderr: '',
      });
      const metrics = await adapter.checkUsage();
      expect(metrics.fiveHourPercent).toBe(75);
    });

    it('should parse weekly percentage from output', async () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: '5hr: 75% used\nweekly: 40% used',
        stderr: '',
      });
      const metrics = await adapter.checkUsage();
      expect(metrics.weeklyPercent).toBe(40);
    });

    it('should return safe defaults when output is empty string', async () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
      const metrics = await adapter.checkUsage();
      expect(metrics.fiveHourPercent).toBe(50);
      expect(metrics.weeklyPercent).toBe(30);
    });

    it('should return safe defaults when spawnSync throws', async () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      const metrics = await adapter.checkUsage();
      expect(metrics.fiveHourPercent).toBe(50);
      expect(metrics.weeklyPercent).toBe(30);
    });

    it('should include measuredAt as ISO 8601 string', async () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' });
      const metrics = await adapter.checkUsage();
      expect(metrics.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ─── isAvailable() ───────────────────────────────────────────────

  describe('isAvailable()', () => {
    it('should return true when claude --version succeeds', async () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'claude 1.0.0', stderr: '' });
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('should return false when claude --version fails', async () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'not found' });
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('should return false when spawnSync throws', async () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('should call claude --version', async () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'claude 1.0.0', stderr: '' });
      await adapter.isAvailable();
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'claude',
        ['--version'],
        expect.objectContaining({ encoding: 'utf-8' }),
      );
    });
  });

  // ─── buildCommand() ──────────────────────────────────────────────

  describe('buildCommand()', () => {
    it('should build basic command without opts', () => {
      const cmd = adapter.buildCommand('opus', '/tmp/prompt.txt');
      expect(cmd).toBe('claude -p - --model opus < /tmp/prompt.txt');
    });

    it('should include --allowedTools when provided', () => {
      const cmd = adapter.buildCommand('sonnet', '/tmp/p.txt', { allowedTools: 'Read,Write' });
      expect(cmd).toContain("--allowedTools 'Read,Write'");
    });

    it('should include --dangerously-skip-permissions when autoApprove is true', () => {
      const cmd = adapter.buildCommand('haiku', '/tmp/p.txt', { autoApprove: true });
      expect(cmd).toContain('--dangerously-skip-permissions');
    });

    it('should not include --dangerously-skip-permissions when autoApprove is false', () => {
      const cmd = adapter.buildCommand('haiku', '/tmp/p.txt', { autoApprove: false });
      expect(cmd).not.toContain('--dangerously-skip-permissions');
    });

    it('should use stdin redirection from promptPath', () => {
      const cmd = adapter.buildCommand('opus', '/path/to/prompt.txt');
      expect(cmd).toContain('< /path/to/prompt.txt');
    });

    it('should use correct model in command', () => {
      expect(adapter.buildCommand('opus', '/p')).toContain('--model opus');
      expect(adapter.buildCommand('sonnet', '/p')).toContain('--model sonnet');
      expect(adapter.buildCommand('haiku', '/p')).toContain('--model haiku');
    });

    it('should combine allowedTools and autoApprove', () => {
      const cmd = adapter.buildCommand('opus', '/tmp/p.txt', {
        allowedTools: 'Read',
        autoApprove: true,
      });
      expect(cmd).toContain("--allowedTools 'Read'");
      expect(cmd).toContain('--dangerously-skip-permissions');
    });
  });

  // ─── isSessionActive() ───────────────────────────────────────────

  describe('isSessionActive()', () => {
    it('should return true when tmux session is active', () => {
      mockTmuxIsSessionActive.mockReturnValue(true);
      expect(adapter.isSessionActive()).toBe(true);
    });

    it('should return false when tmux session is inactive', () => {
      mockTmuxIsSessionActive.mockReturnValue(false);
      expect(adapter.isSessionActive()).toBe(false);
    });
  });
});

// ─── createClaudeAdapter factory ─────────────────────────────────────

describe('createClaudeAdapter', () => {
  it('should create a ClaudeAdapter instance', () => {
    const adapter = createClaudeAdapter('/some/dir');
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
  });

  it('should create adapter with given project directory', () => {
    const adapter = createClaudeAdapter('/my/project');
    // Spawn without opts should use the given project dir
    const mockTmuxSpawnWorkerFn = tmux.spawnWorker as MockInstance;
    const mockEnsureSession = tmux.ensureSession as MockInstance;
    vi.clearAllMocks();
    adapter.spawn('t-001', 'opus', 'hello');
    expect(mockTmuxSpawnWorkerFn).toHaveBeenCalledWith(
      't-001',
      'opus',
      'hello',
      '/my/project',
      expect.any(Object),
    );
  });

  it('should accept claude_backend option', () => {
    const adapter = createClaudeAdapter('/some/dir', { claude_backend: 'subprocess' });
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
    expect(adapter.getBackend()).toBe('subprocess');
  });
});

// ─── claude_backend config ──────────────────────────────────────────

describe('ClaudeAdapter — claude_backend', () => {
  const projectDir = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure existsSync returns true for subprocess spawn (tasks dir check)
    mockExistsSync.mockReturnValue(true);
  });

  // ─── Default is tmux ──────────────────────────────────────────────

  it('should default to tmux backend when no option provided', () => {
    const adapter = new ClaudeAdapter(projectDir);
    expect(adapter.getBackend()).toBe('tmux');
  });

  it('should default to tmux backend when claude_backend is undefined', () => {
    const adapter = new ClaudeAdapter(projectDir, {});
    expect(adapter.getBackend()).toBe('tmux');
  });

  // ─── tmux mode unchanged ──────────────────────────────────────────

  it('should use tmux spawn when backend is tmux', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'tmux' });
    adapter.spawn('task-001', 'opus', 'test prompt');
    expect(mockTmuxEnsureSession).toHaveBeenCalledOnce();
    expect(mockTmuxSpawnWorker).toHaveBeenCalledOnce();
  });

  it('should use tmux kill when backend is tmux', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'tmux' });
    adapter.kill('task-001');
    expect(mockTmuxKillWorker).toHaveBeenCalledWith('task-001');
  });

  it('should delegate listWorkers to tmux when backend is tmux', () => {
    mockTmuxListWorkers.mockReturnValue(['task-001']);
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'tmux' });
    expect(adapter.listWorkers()).toEqual(['task-001']);
  });

  it('should build tmux-style command when backend is tmux', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'tmux' });
    const cmd = adapter.buildCommand('opus', '/tmp/prompt.txt');
    expect(cmd).toBe('claude -p - --model opus < /tmp/prompt.txt');
  });

  // ─── subprocess mode ──────────────────────────────────────────────

  it('should set backend to subprocess when configured', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'subprocess' });
    expect(adapter.getBackend()).toBe('subprocess');
  });

  it('should NOT call tmux.ensureSession when backend is subprocess', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'subprocess' });
    adapter.spawn('task-001', 'opus', 'test prompt');
    expect(mockTmuxEnsureSession).not.toHaveBeenCalled();
    expect(mockTmuxSpawnWorker).not.toHaveBeenCalled();
  });

  it('should NOT call tmux.killWorker when backend is subprocess', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'subprocess' });
    // Spawn first so there's a worker to kill
    adapter.spawn('task-001', 'opus', 'test prompt');
    adapter.kill('task-001');
    expect(mockTmuxKillWorker).not.toHaveBeenCalled();
  });

  it('should build subprocess-style command with --dangerously-skip-permissions', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'subprocess' });
    const cmd = adapter.buildCommand('opus', '/tmp/prompt.txt');
    expect(cmd).toContain('--dangerously-skip-permissions');
    expect(cmd).toContain('--model opus');
    expect(cmd).toContain('claude -p "/tmp/prompt.txt"');
    expect(cmd).not.toContain('< /tmp/prompt.txt');
  });

  it('should include --allowedTools in subprocess command when provided', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'subprocess' });
    const cmd = adapter.buildCommand('sonnet', '/tmp/p.txt', { allowedTools: 'Read,Write' });
    expect(cmd).toContain("--allowedTools 'Read,Write'");
    expect(cmd).toContain('--dangerously-skip-permissions');
  });

  it('should return true for isSessionActive when backend is subprocess', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'subprocess' });
    expect(adapter.isSessionActive()).toBe(true);
  });

  // ─── MCP mode ────────────────────────────────────────────────────

  it('should allow constructing ClaudeAdapter with mcp backend without throwing', () => {
    expect(() => new ClaudeAdapter(projectDir, { claude_backend: 'mcp' })).not.toThrow();
  });

  it('should set backend to mcp when configured', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'mcp' });
    expect(adapter.getBackend()).toBe('mcp');
  });

  it('should throw ProviderError on spawn() when backend is mcp', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'mcp' });
    expect(() => adapter.spawn('task-001', 'opus', 'test prompt')).toThrow(ProviderError);
  });

  it('should throw with Sprint 048 context in error message for mcp spawn', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'mcp' });
    expect(() => adapter.spawn('task-001', 'opus', 'test prompt'))
      .toThrow('Sprint 048');
  });

  it('should include alternatives in mcp spawn error message', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'mcp' });
    expect(() => adapter.spawn('task-001', 'opus', 'test prompt'))
      .toThrow(/tmux|subprocess/);
  });

  it('should include roadmap reference in mcp spawn error message', () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'mcp' });
    expect(() => adapter.spawn('task-001', 'opus', 'test prompt'))
      .toThrow(/DECKENT-MASTER-BLUEPRINT\.md/);
  });

  it('should return false from isAvailable() when backend is mcp', async () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'mcp' });
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('should not call spawnSync for isAvailable() when backend is mcp', async () => {
    const adapter = new ClaudeAdapter(projectDir, { claude_backend: 'mcp' });
    await adapter.isAvailable();
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('should create ClaudeAdapter with mcp backend via createClaudeAdapter', () => {
    const adapter = createClaudeAdapter(projectDir, { claude_backend: 'mcp' });
    expect(adapter).toBeInstanceOf(ClaudeAdapter);
    expect(adapter.getBackend()).toBe('mcp');
  });
});
