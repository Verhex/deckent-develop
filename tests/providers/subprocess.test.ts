import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { SubprocessSpawnBackend, createSubprocessBackend, CLAUDE_SUBPROCESS_CONFIG } from '../../src/providers/subprocess.js';
import type { SubprocessProviderConfig } from '../../src/providers/subprocess.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';
import { modelRegistry } from '../../src/core/model-registry.js';

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

    it('should support fable, opus, sonnet, haiku models', () => {
      expect(backend.supportedModels).toContain('fable');
      expect(backend.supportedModels).toContain('opus');
      expect(backend.supportedModels).toContain('sonnet');
      expect(backend.supportedModels).toContain('haiku');
    });

    it('should support exactly 4 models', () => {
      expect(backend.supportedModels).toHaveLength(4);
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
      expect(args).toContain('claude-opus-4-8');
    });

    it('should include --model flag in args', () => {
      setupMockChild();
      backend.spawn('task-001', 'sonnet', 'test prompt');
      const [, args] = mockSpawn.mock.calls[0];
      const modelIdx = args.indexOf('--model');
      expect(modelIdx).toBeGreaterThan(-1);
      expect(args[modelIdx + 1]).toBe(modelRegistry.resolveApiId('sonnet'));
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

    it('should defer log fd close to child exit handler (not immediate)', () => {
      setupMockChild();
      backend.spawn('task-001', 'opus', 'test');
      // BUG-26 fix: closeSync deferred to child exit — not called immediately after spawn
      expect(mockCloseSync).not.toHaveBeenCalled();
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
      expect(cmd).toBe('claude -p - --model claude-opus-4-8 < /tmp/prompt.txt');
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

    // ─── F1-RE: native reasoning-effort flag ───────────────────────
    it('appends --effort for a valid reasoning-effort', () => {
      const cmd = backend.buildCommand('opus', '/p.txt', { reasoningEffort: 'high' });
      expect(cmd).toContain('--effort high');
    });

    it('drops an invalid reasoning-effort', () => {
      const cmd = backend.buildCommand('opus', '/p.txt', { reasoningEffort: 'minimal' });
      expect(cmd).not.toContain('--effort');
    });
  });

  // ─── F1-RE: buildArgs reasoning-effort (argv path) ─────────────────
  describe('CLAUDE_SUBPROCESS_CONFIG.buildArgs reasoning-effort', () => {
    it('adds --effort argv pair for a valid level', () => {
      const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('opus', { reasoningEffort: 'max' });
      const i = args.indexOf('--effort');
      expect(i).toBeGreaterThan(-1);
      expect(args[i + 1]).toBe('max');
    });

    it('omits --effort when no reasoning-effort given', () => {
      const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('opus');
      expect(args).not.toContain('--effort');
    });

    it('drops an invalid (codex-only) level', () => {
      const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('opus', { reasoningEffort: 'minimal' });
      expect(args).not.toContain('--effort');
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

  it('should accept providerConfig option', () => {
    const config: SubprocessProviderConfig = {
      cliCommand: 'my-cli',
      name: 'my-subprocess',
      supportedModels: ['opus', 'sonnet'],
      buildArgs: (model) => ['--model', model],
      buildCommandString: (model, path) => `my-cli --model ${model} < ${path}`,
    };
    const backend = createSubprocessBackend('/dir', { providerConfig: config });
    expect(backend.name).toBe('my-subprocess');
  });
});

// ─── Provider Decoupling Tests ──────────────────────────────────────

describe('SubprocessSpawnBackend — Provider Decoupling', () => {
  const projectDir = '/tmp/test-project';

  // A custom (non-Claude) provider config for testing
  const customConfig: SubprocessProviderConfig = {
    cliCommand: 'my-ai-cli',
    name: 'custom-subprocess',
    supportedModels: ['opus', 'sonnet'] as readonly ModelType[],
    buildArgs(model: ModelType, opts?: ProviderSpawnOptions): string[] {
      const args = ['run', '--model', model];
      if (opts?.allowedTools) {
        args.push('--tools', opts.allowedTools);
      }
      if (opts?.autoApprove) {
        args.push('--yes');
      }
      return args;
    },
    buildCommandString(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>): string {
      let cmd = `my-ai-cli run --model ${model}`;
      if (opts?.allowedTools) {
        cmd += ` --tools '${opts.allowedTools}'`;
      }
      if (opts?.autoApprove) {
        cmd += ' --yes';
      }
      cmd += ` < ${promptPath}`;
      return cmd;
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockOpenSync.mockReturnValue(3);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ─── Backward Compatibility ───────────────────────────────────────

  it('should default to CLAUDE_SUBPROCESS_CONFIG when no providerConfig given', () => {
    const backend = new SubprocessSpawnBackend(projectDir);
    expect(backend.getProviderConfig()).toBe(CLAUDE_SUBPROCESS_CONFIG);
  });

  it('should spawn with "claude" command by default (backward compat)', () => {
    setupMockChild();
    const backend = new SubprocessSpawnBackend(projectDir);
    backend.spawn('task-001', 'opus', 'test prompt');
    const [cmd] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('claude');
  });

  it('should have name "claude-subprocess" by default', () => {
    const backend = new SubprocessSpawnBackend(projectDir);
    expect(backend.name).toBe('claude-subprocess');
  });

  it('should support claude models by default', () => {
    const backend = new SubprocessSpawnBackend(projectDir);
    expect(backend.supportedModels).toContain('opus');
    expect(backend.supportedModels).toContain('sonnet');
    expect(backend.supportedModels).toContain('haiku');
  });

  // ─── Custom Provider Config ───────────────────────────────────────

  it('should use custom cliCommand when providerConfig provided', () => {
    setupMockChild();
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    backend.spawn('task-001', 'opus', 'test prompt');
    const [cmd] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('my-ai-cli');
  });

  it('should use custom name from providerConfig', () => {
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    expect(backend.name).toBe('custom-subprocess');
  });

  it('should use custom supportedModels from providerConfig', () => {
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    expect(backend.supportedModels).toEqual(['opus', 'sonnet']);
    expect(backend.supportedModels).not.toContain('haiku');
  });

  it('should use adapter.buildArgs when adapter provided', () => {
    setupMockChild();
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    backend.spawn('task-001', 'opus', 'test prompt');
    const [, args] = mockSpawn.mock.calls[0];
    // customConfig buildArgs produces ['run', '--model', model]
    expect(args).toEqual(['run', '--model', 'opus']);
  });

  it('should pass allowedTools through custom buildArgs', () => {
    setupMockChild();
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    backend.spawn('task-001', 'opus', 'test prompt', { allowedTools: 'Read,Write' });
    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain('--tools');
    expect(args).toContain('Read,Write');
  });

  it('should pass autoApprove through custom buildArgs', () => {
    setupMockChild();
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    backend.spawn('task-001', 'opus', 'test', { autoApprove: true });
    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain('--yes');
    // Should NOT contain claude-specific flag
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  it('should use custom buildCommandString for buildCommand()', () => {
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    const cmd = backend.buildCommand('opus', '/tmp/prompt.txt');
    expect(cmd).toBe('my-ai-cli run --model opus < /tmp/prompt.txt');
    expect(cmd).not.toContain('claude');
  });

  it('should use custom cliCommand in isAvailable()', async () => {
    const child = {
      once: vi.fn().mockImplementation((event, cb) => {
        if (event === 'exit') cb(0);
        return child;
      }),
    };
    mockSpawn.mockReturnValue(child);
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    await backend.isAvailable();
    const [cmd] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('my-ai-cli');
  });

  // ─── Different adapters produce different commands ─────────────────

  it('should produce different commands for different provider configs', () => {
    const claudeBackend = new SubprocessSpawnBackend(projectDir);
    const customBackend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });

    const claudeCmd = claudeBackend.buildCommand('opus', '/tmp/p.txt');
    const customCmd = customBackend.buildCommand('opus', '/tmp/p.txt');

    expect(claudeCmd).not.toEqual(customCmd);
    expect(claudeCmd).toContain('claude');
    expect(customCmd).toContain('my-ai-cli');
  });

  it('should produce different spawn commands for different configs', () => {
    const child1 = setupMockChild();
    const claudeBackend = new SubprocessSpawnBackend(projectDir);
    claudeBackend.spawn('task-c', 'opus', 'test');
    const [claudeCliCmd, claudeArgs] = mockSpawn.mock.calls[0];

    const child2 = setupMockChild();
    const customBackend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    customBackend.spawn('task-x', 'opus', 'test');
    const [customCliCmd, customArgs] = mockSpawn.mock.calls[1];

    expect(claudeCliCmd).toBe('claude');
    expect(customCliCmd).toBe('my-ai-cli');
    expect(claudeArgs).not.toEqual(customArgs);
  });

  // ─── CLAUDE_SUBPROCESS_CONFIG exported correctly ───────────────────

  it('should export CLAUDE_SUBPROCESS_CONFIG with correct cliCommand', () => {
    expect(CLAUDE_SUBPROCESS_CONFIG.cliCommand).toBe('claude');
  });

  it('should export CLAUDE_SUBPROCESS_CONFIG with correct name', () => {
    expect(CLAUDE_SUBPROCESS_CONFIG.name).toBe('claude-subprocess');
  });

  it('should export CLAUDE_SUBPROCESS_CONFIG with buildArgs producing correct args', () => {
    const args = CLAUDE_SUBPROCESS_CONFIG.buildArgs('sonnet');
    expect(args).toEqual(['-p', '-', '--model', modelRegistry.resolveApiId('sonnet')]);
  });

  it('should export CLAUDE_SUBPROCESS_CONFIG with buildCommandString producing correct command', () => {
    const cmd = CLAUDE_SUBPROCESS_CONFIG.buildCommandString('opus', '/tmp/p.txt');
    expect(cmd).toBe('claude -p - --model claude-opus-4-8 < /tmp/p.txt');
  });

  // F3.1: --exclude-dynamic-system-prompt-sections is opt-in on both builders.
  it('buildArgs appends --exclude-dynamic-system-prompt-sections when opted in, omits otherwise', () => {
    expect(CLAUDE_SUBPROCESS_CONFIG.buildArgs('opus', { excludeDynamicPromptSections: true }))
      .toContain('--exclude-dynamic-system-prompt-sections');
    expect(CLAUDE_SUBPROCESS_CONFIG.buildArgs('opus', {}))
      .not.toContain('--exclude-dynamic-system-prompt-sections');
  });

  it('buildCommandString appends the exclude-dynamic flag before the stdin redirect when opted in', () => {
    const cmd = CLAUDE_SUBPROCESS_CONFIG.buildCommandString('opus', '/tmp/p.txt', { excludeDynamicPromptSections: true });
    expect(cmd).toBe('claude -p - --model claude-opus-4-8 --exclude-dynamic-system-prompt-sections < /tmp/p.txt');
  });

  it('should store providerConfig accessible via getProviderConfig()', () => {
    const backend = new SubprocessSpawnBackend(projectDir, { providerConfig: customConfig });
    expect(backend.getProviderConfig()).toBe(customConfig);
  });
});
