import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── spawn mocks ─────────────────────────────────────────────────────

vi.mock('../../../src/agents/worker.js', () => ({
  readTask: vi.fn(),
}));

vi.mock('../../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  isSessionActive: vi.fn().mockReturnValue(false),
  createWatchLayout: vi.fn(),
  attachToWorkerPane: vi.fn(),
  killWorker: vi.fn(),
  TmuxError: class TmuxError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TmuxError';
    }
  },
  attach: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatDashboard: vi.fn().mockReturnValue('FORMATTED_DASHBOARD'),
}));

let mockRoot: string;
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => mockRoot,
}));

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

vi.mock('../../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn((key: string, _lang: string, params?: Record<string, string>) => {
    if (key === 'spawn.worker_spawned') return `Worker spawned for ${params?.taskId}`;
    if (key === 'kill.worker_killed') return `Worker killed: ${params?.taskId}`;
    if (key === 'kill.task_not_found') return `Warning: task ${params?.taskId} not found`;
    if (key === 'kill.task_status_updated') return `Task ${params?.taskId} status updated`;
    if (key === 'kill.locks_released') return `Released ${params?.count} locks`;
    if (key === 'kill.worker_not_found') return `Worker not found: ${params?.taskId}`;
    if (key === 'kill.no_active_workers') return 'No active workers';
    if (key === 'kill.all_killed') return `Killed ${params?.count} workers`;
    if (key === 'kill.prompts_cleaned') return `Cleaned ${params?.count} prompts`;
    if (key === 'attach.no_active_session') return 'No active session';
    return `msg:${key}`;
  }),
}));

vi.mock('../../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('long prompt content '.repeat(10)),
}));

vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockReturnValue(undefined),
  resolveSkillPrompts: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn().mockReturnValue({
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    }),
  },
}));

vi.mock('../../../src/core/task-types.js', () => ({
  TaskStatus: {
    PENDING: 'PENDING',
    EXECUTING: 'EXECUTING',
    DONE: 'DONE',
    NO_GO: 'NO_GO',
    CLAIMED: 'CLAIMED',
    DRAFT: 'DRAFT',
  },
  getProviderForModel: vi.fn().mockReturnValue('claude'),
}));

vi.mock('../../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../../src/core/constants.js', () => ({
  DASHBOARD_FILE: '.dashboard',
  TASKS_DIR: '.tasks',
  LOCKS_DIR: '.locks',
}));

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    spawn: vi.fn().mockReturnValue({
      on: vi.fn(),
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    }),
    spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
  };
});

import { readTask } from '../../../src/agents/worker.js';
import { ensureSession, spawnWorker } from '../../../src/orchestra/tmux.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { getProviderForModel } from '../../../src/core/task-types.js';
import { buildAllowedToolsFromScope, spawnWorkerMultiProvider, registerSpawn } from '../../../src/cli/commands/spawn.js';
import { killSubprocessByPid } from '../../../src/cli/commands/kill.js';
import { readFormattedDashboard, readHeartbeatPanel, watchWithoutTmux } from '../../../src/cli/commands/watch.js';
import { resetTerminal } from '../../../src/cli/commands/attach.js';
import type { Task } from '../../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '063-010',
    title: 'Test Task',
    description: 'Test description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/cli/'], filesRead: [], filesWrite: ['src/cli/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: 'PENDING' as Task['status'],
    sprintId: 'sprint-063',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── A) spawn Scope/AllowedTools ─────────────────────────────────────

describe('A) buildAllowedToolsFromScope', () => {
  it('generates allowedTools from task scope directories and filesWrite', () => {
    const task = makeTask({
      scope: { directories: ['src/cli/'], filesRead: [], filesWrite: ['src/cli/foo.ts'] },
    });
    const tools = buildAllowedToolsFromScope(task);
    expect(tools).toBeDefined();
    expect(tools).toContain('Read');
    expect(tools).toContain('Write');
    expect(tools).toContain('Edit');
    expect(tools).toContain('Bash');
  });

  it('returns undefined when scope has no directories or filesWrite', () => {
    const task = makeTask({
      scope: { directories: [], filesRead: ['some/file.ts'], filesWrite: [] },
    });
    const tools = buildAllowedToolsFromScope(task);
    expect(tools).toBeUndefined();
  });
});

// ─── C) spawn Multi-Provider ─────────────────────────────────────────

describe('C) spawnWorkerMultiProvider returns provider info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
  });

  it('returns provider name alongside backend for claude', () => {
    vi.mocked(getProviderForModel).mockReturnValue('claude');
    const result = spawnWorkerMultiProvider('001', 'sonnet', 'prompt', '/root', {});
    expect(result.backend).toBe('tmux');
    expect(result.provider).toBe('claude');
  });

  it('returns provider name alongside backend for codex', () => {
    vi.mocked(getProviderForModel).mockReturnValue('codex');
    const result = spawnWorkerMultiProvider('001', 'gpt-4.1', 'prompt', '/root', {});
    expect(result.backend).toBe('subprocess');
    expect(result.provider).toBe('codex');
  });

  it('passes allowedTools to spawn backend', () => {
    vi.mocked(getProviderForModel).mockReturnValue('claude');
    spawnWorkerMultiProvider('001', 'sonnet', 'prompt', '/root', {
      allowedTools: 'Read,Write,Edit',
    });
    expect(spawnWorker).toHaveBeenCalledWith(
      '001', 'sonnet', 'prompt', '/root',
      expect.objectContaining({ allowedTools: 'Read,Write,Edit' }),
    );
  });
});

// ─── B) kill Subprocess Worker (PID-based) ───────────────────────────

describe('B) killSubprocessByPid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoot = join(tmpdir(), `kill-pid-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(mockRoot, '.tasks'), { recursive: true });
  });
  afterEach(() => {
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* */ }
  });

  it('kills process by PID from heartbeat file', () => {
    const hbPath = join(mockRoot, '.tasks', 'task-001.hb');
    writeFileSync(hbPath, JSON.stringify({ pid: 99999, taskId: '001', status: 'EXECUTING' }));
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = killSubprocessByPid(mockRoot, '001');
    expect(result).toBe(true);
    expect(killSpy).toHaveBeenCalledWith(99999, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('returns false when no PID found', () => {
    const result = killSubprocessByPid(mockRoot, 'nonexistent');
    expect(result).toBe(false);
  });

  it('returns false when process already dead (ESRCH)', () => {
    const hbPath = join(mockRoot, '.tasks', 'task-002.hb');
    writeFileSync(hbPath, JSON.stringify({ pid: 88888, taskId: '002' }));
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('ESRCH') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });
    const result = killSubprocessByPid(mockRoot, '002');
    expect(result).toBe(false);
    killSpy.mockRestore();
  });

  it('reads PID from log file header', () => {
    const logPath = join(mockRoot, '.tasks', 'task-003.log');
    writeFileSync(logPath, 'PID: 77777\nsome log content...\n');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = killSubprocessByPid(mockRoot, '003');
    expect(result).toBe(true);
    expect(killSpy).toHaveBeenCalledWith(77777, 'SIGTERM');
    killSpy.mockRestore();
  });
});

// ─── D) Watch Dashboard Formatted ───────────────────────────────────

describe('D) readFormattedDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoot = join(tmpdir(), `watch-dash-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(mockRoot, { recursive: true });
  });
  afterEach(() => {
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* */ }
  });

  it('returns formatted dashboard when valid JSON exists', () => {
    const state = {
      sprint: { number: 63, phase: 'EXECUTE' },
      agents: [],
      progress: { done: 2, total: 5, active: 3, blocked: 0 },
      usage: { fiveHourPercent: 30, weeklyPercent: 10 },
      alerts: [],
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(join(mockRoot, '.dashboard'), JSON.stringify(state));
    const result = readFormattedDashboard(mockRoot);
    expect(result).toBe('FORMATTED_DASHBOARD');
  });

  it('returns null when no dashboard file', () => {
    const result = readFormattedDashboard(mockRoot);
    expect(result).toBeNull();
  });
});

// ─── E) Heartbeat Panel ─────────────────────────────────────────────

describe('E) readHeartbeatPanel', () => {
  beforeEach(() => {
    mockRoot = join(tmpdir(), `hb-panel-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(mockRoot, '.tasks'), { recursive: true });
  });
  afterEach(() => {
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* */ }
  });

  it('shows formatted heartbeat content for active workers', () => {
    writeFileSync(
      join(mockRoot, '.tasks', 'task-063-001.hb'),
      JSON.stringify({
        taskId: '063-001',
        status: 'CODING',
        currentAction: 'Writing tests',
        timestamp: '2026-03-26T10:00:00.000Z',
        filesChangedCount: 3,
      }),
    );
    const lines = readHeartbeatPanel(mockRoot);
    expect(lines[0]).toContain('Active Workers');
    expect(lines[1]).toContain('063-001');
    expect(lines[1]).toContain('CODING');
    expect(lines[1]).toContain('Writing tests');
    expect(lines[1]).toContain('3 files');
  });

  it('shows "No active heartbeats" when no .hb files', () => {
    const lines = readHeartbeatPanel(mockRoot);
    expect(lines.some(l => l.includes('No active heartbeats'))).toBe(true);
  });
});

// ─── F) tmux fallback (watchWithoutTmux) ────────────────────────────

describe('F) watchWithoutTmux', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoot = join(tmpdir(), `watch-fallback-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(mockRoot, '.tasks'), { recursive: true });
  });
  afterEach(() => {
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* */ }
  });

  it('prints dashboard and heartbeat info without tmux', () => {
    // No dashboard, no logs — just prints fallback messages
    watchWithoutTmux(mockRoot);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('tmux not available'));
  });
});

// ─── G) Terminal Reset ──────────────────────────────────────────────

describe('G) resetTerminal', () => {
  it('writes ANSI reset sequences to stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    resetTerminal();
    // Should write at least the reset sequence \x1b[0m
    const calls = writeSpy.mock.calls.map(c => c[0] as string);
    expect(calls.some(c => c.includes('\x1b[0m'))).toBe(true);
    // Should write cursor show sequence
    expect(calls.some(c => c.includes('\x1b[?25h'))).toBe(true);
    writeSpy.mockRestore();
  });
});

// ─── spawn registerSpawn shows provider and scope ───────────────────

describe('spawn command shows provider and allowedTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    mockRoot = '/mock/root';
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
    vi.mocked(getProviderForModel).mockReturnValue('claude');
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('displays backend and provider after spawn', async () => {
    const program = new Command();
    program.exitOverride();
    registerSpawn(program);
    try {
      await program.parseAsync(['node', 'test', 'spawn', '063-010']);
    } catch { /* */ }
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Provider: claude'));
  });
});

// ─── A) Scope boundary: allowedTools includes all base tools ─────────

describe('A) buildAllowedToolsFromScope edge cases', () => {
  it('includes Glob and Grep tools for scope with only directories', () => {
    const task = makeTask({
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    });
    const tools = buildAllowedToolsFromScope(task);
    expect(tools).toBeDefined();
    expect(tools).toContain('Glob');
    expect(tools).toContain('Grep');
  });

  it('includes tools when only filesWrite is set', () => {
    const task = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: ['src/foo.ts'] },
    });
    const tools = buildAllowedToolsFromScope(task);
    expect(tools).toBeDefined();
    expect(tools!.split(',')).toHaveLength(6);
  });
});

// ─── C) Multi-provider: gemini routes to subprocess ──────────────────

describe('C) spawnWorkerMultiProvider gemini routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes gemini models to subprocess backend', () => {
    vi.mocked(getProviderForModel).mockReturnValue('gemini');
    const result = spawnWorkerMultiProvider('002', 'gemini-2.5-pro', 'prompt', '/root', {});
    expect(result.backend).toBe('subprocess');
    expect(result.provider).toBe('gemini');
  });
});

// ─── D) Dashboard fallback to raw content on invalid JSON ────────────

describe('D) readFormattedDashboard edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoot = join(tmpdir(), `watch-dash-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(mockRoot, { recursive: true });
  });
  afterEach(() => {
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* */ }
  });

  it('returns raw content when JSON parse fails', () => {
    writeFileSync(join(mockRoot, '.dashboard'), 'not valid json');
    const result = readFormattedDashboard(mockRoot);
    expect(result).toBe('not valid json');
  });
});

// ─── E) Heartbeat panel with unreadable file ─────────────────────────

describe('E) readHeartbeatPanel with unreadable heartbeat', () => {
  beforeEach(() => {
    mockRoot = join(tmpdir(), `hb-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(mockRoot, '.tasks'), { recursive: true });
  });
  afterEach(() => {
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* */ }
  });

  it('marks unreadable heartbeat files gracefully', () => {
    writeFileSync(join(mockRoot, '.tasks', 'task-bad.hb'), '{invalid json');
    const lines = readHeartbeatPanel(mockRoot);
    expect(lines.some(l => l.includes('unreadable'))).toBe(true);
  });

  it('shows no tasks dir message when directory missing', () => {
    const emptyRoot = join(tmpdir(), `hb-nodir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(emptyRoot, { recursive: true });
    const lines = readHeartbeatPanel(emptyRoot);
    expect(lines.some(l => l.includes('No .tasks/'))).toBe(true);
    try { rmSync(emptyRoot, { recursive: true, force: true }); } catch { /* */ }
  });
});

// ─── B) killSubprocessByPid with non-ESRCH error ─────────────────────

describe('B) killSubprocessByPid error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoot = join(tmpdir(), `kill-err-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(mockRoot, '.tasks'), { recursive: true });
  });
  afterEach(() => {
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* */ }
  });

  it('returns false on EPERM error (not ESRCH)', () => {
    const hbPath = join(mockRoot, '.tasks', 'task-004.hb');
    writeFileSync(hbPath, JSON.stringify({ pid: 66666, taskId: '004' }));
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('EPERM') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });
    const result = killSubprocessByPid(mockRoot, '004');
    expect(result).toBe(false);
    killSpy.mockRestore();
  });
});
