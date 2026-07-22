import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { Task } from '../../../src/core/types.js';
import { TaskStatus } from '../../../src/core/types.js';

const { mockBackendSpawn } = vi.hoisted(() => ({
  mockBackendSpawn: vi.fn(),
}));

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/agents/worker.js', () => ({
  readTask: vi.fn(),
}));

vi.mock('../../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

vi.mock('../../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('You are a Worker agent. Rich prompt content here.'),
}));

vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockReturnValue(undefined),
  resolveSkillPrompts: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn().mockReturnValue({
      name: 'measured-test',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: mockBackendSpawn,
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    }),
  },
}));

// sprint-utils: isAdapterProvider returns false for all models used in this test suite
// (sonnet/opus/haiku/gpt-4.1/gemini) — adapter path is not exercised here.
vi.mock('../../../src/orchestra/sprint-utils.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    isAdapterProvider: vi.fn(() => false),
    getProviderAdapterForTask: vi.fn(() => null),
  };
});

import { readTask } from '../../../src/agents/worker.js';
import { ensureSession, spawnWorker } from '../../../src/orchestra/tmux.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { loadConfig } from '../../../src/core/config.js';
import { SpawnBackendFactory } from '../../../src/orchestra/spawn-backend.js';
import { buildAllowedToolsFromScope, spawnWorkerMultiProvider, registerSpawn } from '../../../src/cli/commands/spawn.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001',
    title: 'Test Task',
    description: 'Test description',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-001',
    createdAt: new Date().toISOString(),
    budget: { maxTurns: 2 },
    ...overrides,
  };
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerSpawn(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('spawn command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en', spawn_backend: 'subprocess' } as any);
    vi.mocked(SpawnBackendFactory.create).mockReturnValue({
      name: 'measured-test',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: mockBackendSpawn,
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers spawn command with taskId argument', () => {
    const program = new Command();
    registerSpawn(program);
    const cmd = program.commands.find(c => c.name() === 'spawn');
    expect(cmd).toBeDefined();
  });

  it('calls readTask with project root and taskId', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({ id: '001-001', model: 'claude-opus-4-8' }));
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    expect(readTask).toHaveBeenCalledWith('/mock/root', '001-001');
  });

  it('uses the configured measured backend without opening a tmux session', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    expect(mockBackendSpawn).toHaveBeenCalled();
    expect(ensureSession).not.toHaveBeenCalled();
  });

  it('calls the measured backend with taskId, model, prompt, and root', async () => {
    const task = makeTask({ id: '001-002', model: 'claude-haiku-4-5-20251001' });
    vi.mocked(readTask).mockReturnValue(task);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-002']);

    expect(mockBackendSpawn).toHaveBeenCalledWith(
      '001-002',
      'claude-haiku-4-5-20251001',
      expect.stringContaining('Worker agent'),
      expect.objectContaining({ autoApprove: false })
    );
  });

  it('prints success message with task ID and model', async () => {
    const task = makeTask({ id: '005-003', model: 'claude-opus-4-8' });
    vi.mocked(readTask).mockReturnValue(task);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '005-003']);

    expect(print).toHaveBeenCalledWith(expect.stringContaining('005-003'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('claude-opus-4-8'));
  });

  it('handles readTask error and sets exit code', async () => {
    vi.mocked(readTask).mockImplementation(() => {
      throw new Error('Task not found');
    });

    await runCommand(['spawn', '999-999']);

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('does not consult tmux when the configured measured backend is available', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {
      throw new Error('tmux session failed');
    });

    await runCommand(['spawn', '001-001']);

    expect(mockBackendSpawn).toHaveBeenCalled();
    expect(ensureSession).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });

  it('handles configured backend spawn errors and sets exit code', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask());
    mockBackendSpawn.mockImplementationOnce(() => {
      throw new Error('Failed to spawn worker');
    });

    await runCommand(['spawn', '001-001']);

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('passes different canonical model IDs correctly to the measured backend', async () => {
    const models: Array<'claude-haiku-4-5-20251001' | 'claude-sonnet-5' | 'claude-opus-4-8'> = ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-4-8'];

    for (const model of models) {
      vi.clearAllMocks();
      vi.mocked(loadConfig).mockResolvedValue({ language: 'en', spawn_backend: 'subprocess' } as any);
      const task = makeTask({ model });
      vi.mocked(readTask).mockReturnValue(task);
      vi.mocked(ensureSession).mockImplementation(() => {});
      vi.mocked(spawnWorker).mockImplementation(() => {});

      await runCommand(['spawn', '001-001']);

      expect(mockBackendSpawn).toHaveBeenCalledWith(
      expect.any(String),
      model,
      expect.any(String),
      expect.any(Object)
      );
    }
  });

  it('uses English message when language is en', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en', spawn_backend: 'subprocess' } as any);
    const task = makeTask({ id: '001-001', model: 'claude-sonnet-5' });
    vi.mocked(readTask).mockReturnValue(task);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    expect(print).toHaveBeenCalledWith(
      'Worker spawned for task 001-001 (model: claude-sonnet-5).'
    );
  });

  it('uses Turkish message when language is tr', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'tr', spawn_backend: 'subprocess' } as any);
    const task = makeTask({ id: '001-001', model: 'claude-sonnet-5' });
    vi.mocked(readTask).mockReturnValue(task);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    expect(print).toHaveBeenCalledWith(
      '001-001 görevi için worker başlatıldı (model: claude-sonnet-5).'
    );
  });

  it('fails closed in English when config loading removes the measured backend contract', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('config error'));
    const task = makeTask({ id: '002-001', model: 'claude-haiku-4-5-20251001' });
    vi.mocked(readTask).mockReturnValue(task);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '002-001']);

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('calls loadConfig with project root', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    expect(loadConfig).toHaveBeenCalledWith('/mock/root');
  });
});

// ─── Scope Enforcement: buildAllowedToolsFromScope ────────────────────────────

describe('buildAllowedToolsFromScope', () => {
  it('returns standard tool set when task has scope directories', () => {
    const task = makeTask({
      scope: { directories: ['src/cli/'], filesRead: [], filesWrite: [] },
    });
    const tools = buildAllowedToolsFromScope(task);
    expect(tools).toBeDefined();
    expect(tools).toContain('Read');
    expect(tools).toContain('Write');
    expect(tools).toContain('Edit');
    expect(tools).toContain('Bash');
    expect(tools).toContain('Glob');
    expect(tools).toContain('Grep');
  });

  it('returns standard tool set when task has filesWrite', () => {
    const task = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: ['src/cli/spawn.ts'] },
    });
    const tools = buildAllowedToolsFromScope(task);
    expect(tools).toBeDefined();
    expect(tools!.split(',')).toHaveLength(6);
  });

  it('returns undefined when scope has no directories or filesWrite', () => {
    const task = makeTask({
      scope: { directories: [], filesRead: ['some/file.ts'], filesWrite: [] },
    });
    const tools = buildAllowedToolsFromScope(task);
    expect(tools).toBeUndefined();
  });

  it('returns tools when both directories and filesWrite are present', () => {
    const task = makeTask({
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts', 'tests/foo.test.ts'] },
    });
    const tools = buildAllowedToolsFromScope(task);
    expect(tools).toBeDefined();
    expect(typeof tools).toBe('string');
  });
});

// ─── Multi-Provider: spawnWorkerMultiProvider ─────────────────────────────────

describe('spawnWorkerMultiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
  });

  it('blocks a budgetless remote worker before creating a backend or session', async () => {
    await expect(spawnWorkerMultiProvider(
      'budgetless-remote',
      'gpt-4.1',
      'prompt',
      '/root',
      {},
    )).rejects.toThrow('Remote execution budget is required');
    expect(SpawnBackendFactory.create).not.toHaveBeenCalled();
    expect(ensureSession).not.toHaveBeenCalled();
    expect(spawnWorker).not.toHaveBeenCalled();
  });

  it('blocks a budgeted remote worker when its backend cannot meter live usage', async () => {
    const backend = { spawn: vi.fn(), kill: vi.fn(), list: vi.fn(), name: 'subprocess' };
    vi.mocked(SpawnBackendFactory.create).mockReturnValue(backend as never);
    await expect(spawnWorkerMultiProvider(
      'unmetered-remote',
      'gpt-4.1',
      'prompt',
      '/root',
      { executionBudget: { maxTurns: 2 } },
    )).rejects.toThrow('does not declare that capability');
    expect(backend.spawn).not.toHaveBeenCalled();
  });

  it('blocks the implicit Claude tmux fallback because it cannot meter live usage', async () => {
    await expect(spawnWorkerMultiProvider(
      '001',
      'claude-sonnet-5',
      'prompt',
      '/root',
      { executionBudget: { maxTurns: 2 } },
    )).rejects.toThrow('does not declare that capability');
    expect(ensureSession).not.toHaveBeenCalled();
  });

  it('returns a measured configured backend and codex provider for OpenAI models', async () => {
    const mockBackend = { spawn: vi.fn(), kill: vi.fn(), list: vi.fn() };
    Object.assign(mockBackend, { name: 'measured-test', liveUsageBudgetSupport: 'measured-stream' });
    vi.mocked(SpawnBackendFactory.create).mockReturnValue(mockBackend as any);
    const result = await spawnWorkerMultiProvider('002', 'gpt-4.1', 'prompt', '/root', {
      spawnBackend: 'subprocess',
      executionBudget: { maxTurns: 2 },
    });
    expect(result.backend).toBe('measured-test');
    expect(result.provider).toBe('codex');
    expect(mockBackend.spawn).toHaveBeenCalled();
  });

  it('returns a measured configured backend and gemini provider for Gemini models', async () => {
    const mockBackend = { spawn: vi.fn(), kill: vi.fn(), list: vi.fn() };
    Object.assign(mockBackend, { name: 'measured-test', liveUsageBudgetSupport: 'measured-stream' });
    vi.mocked(SpawnBackendFactory.create).mockReturnValue(mockBackend as any);
    const result = await spawnWorkerMultiProvider('003', 'gemini-2.5-pro', 'prompt', '/root', {
      spawnBackend: 'subprocess',
      executionBudget: { maxTurns: 2 },
    });
    expect(result.backend).toBe('measured-test');
    expect(result.provider).toBe('gemini');
  });

  it('passes allowedTools to a measured configured backend for Claude models', async () => {
    const mockBackend = {
      name: 'measured-test',
      liveUsageBudgetSupport: 'measured-stream' as const,
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn(),
    };
    vi.mocked(SpawnBackendFactory.create).mockReturnValue(mockBackend as any);
    await spawnWorkerMultiProvider('004', 'claude-opus-4-8', 'prompt', '/root', {
      allowedTools: 'Read,Write,Edit,Bash,Glob,Grep',
      spawnBackend: 'subprocess',
      executionBudget: { maxTurns: 2 },
    });
    expect(mockBackend.spawn).toHaveBeenCalledWith(
      '004', 'claude-opus-4-8', 'prompt',
      expect.objectContaining({ allowedTools: 'Read,Write,Edit,Bash,Glob,Grep' }),
    );
  });

  it('passes allowedTools to subprocess backend for non-Claude models', async () => {
    const mockBackend = {
      name: 'measured-test',
      liveUsageBudgetSupport: 'measured-stream' as const,
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn(),
    };
    vi.mocked(SpawnBackendFactory.create).mockReturnValue(mockBackend as any);
    await spawnWorkerMultiProvider('005', 'gpt-4.1-mini', 'prompt', '/root', {
      allowedTools: 'Read,Bash',
      spawnBackend: 'subprocess',
      executionBudget: { maxTurns: 2 },
    });
    expect(mockBackend.spawn).toHaveBeenCalledWith(
      '005', 'gpt-4.1-mini', 'prompt',
      expect.objectContaining({ allowedTools: 'Read,Bash' }),
    );
  });
});

// ─── registerSpawn: provider display ─────────────────────────────────────────

describe('spawn command provider display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en', spawn_backend: 'subprocess' } as any);
    vi.mocked(SpawnBackendFactory.create).mockReturnValue({
      name: 'measured-test',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: mockBackendSpawn,
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    } as never);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints provider name after spawning worker', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({ model: 'claude-sonnet-5' }));
    await runCommand(['spawn', '001-001']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Provider: claude'));
  });

  it('injects allowedTools into spawn when task has scope', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({
      scope: { directories: ['src/cli/'], filesRead: [], filesWrite: ['src/cli/spawn.ts'] },
    }));
    await runCommand(['spawn', '001-001']);
    expect(mockBackendSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ allowedTools: 'Read,Write,Edit,Bash,Glob,Grep' }),
    );
  });
});
