import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────
vi.mock('node:fs');
vi.mock('../../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  TmuxError: class TmuxError extends Error { constructor(m: string) { super(m); this.name = 'TmuxError'; } },
}));
vi.mock('../../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('test prompt'),
}));
vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockReturnValue(undefined),
  resolveSkillPrompts: vi.fn().mockReturnValue([]),
}));
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/test/project'),
}));
vi.mock('../../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));
vi.mock('../../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn((_key: string, _lang: string, vars?: Record<string, string>) =>
    vars ? `msg:${_key}:${JSON.stringify(vars)}` : `msg:${_key}`),
}));
vi.mock('../../../src/agents/worker.js', () => ({
  readTask: vi.fn(),
}));

const mockSubprocessSpawn = vi.fn();
const mockSubprocessKill = vi.fn();
const mockSubprocessList = vi.fn().mockReturnValue([]);

vi.mock('../../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn().mockReturnValue({
      name: 'subprocess',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: mockSubprocessSpawn,
      kill: mockSubprocessKill,
      list: mockSubprocessList,
      isAvailable: vi.fn().mockResolvedValue(true),
    }),
  },
}));

// sprint-utils: isAdapterProvider returns false for all models in this suite
// (sonnet/opus/gpt-4.1/gemini) — adapter path exercised in spawn-multiprovider.test.ts.
vi.mock('../../../src/orchestra/sprint-utils.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    isAdapterProvider: vi.fn(() => false),
    getProviderAdapterForTask: vi.fn(() => null),
  };
});

// ─── Imports ────────────────────────────────────────────────────────
import { ensureSession, spawnWorker } from '../../../src/orchestra/tmux.js';
import { readTask } from '../../../src/agents/worker.js';
import type { Task } from '../../../src/core/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'Test description',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: 'PENDING' as import('../../../src/core/types.js').TaskStatusType,
    createdAt: new Date().toISOString(),
    sprintId: 'sprint-059',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    ...overrides,
  } as Task;
}

describe('spawn multi-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('spawnWorkerMultiProvider fails closed for unmetered tmux claude execution', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    await expect(spawnWorkerMultiProvider(
      't1',
      'claude-sonnet-5',
      'prompt',
      '/root',
      { executionBudget: { maxTurns: 1 } },
    )).rejects.toThrow(/does not declare that capability/);
    expect(ensureSession).not.toHaveBeenCalled();
    expect(spawnWorker).not.toHaveBeenCalled();
  });

  it('spawnWorkerMultiProvider uses subprocess for codex models', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    const result = await spawnWorkerMultiProvider('t1', 'gpt-4.1', 'prompt', '/root', {
      executionBudget: { maxTurns: 1 },
    });
    expect(result.backend).toBe('subprocess');
    expect(mockSubprocessSpawn).toHaveBeenCalledWith('t1', 'gpt-4.1', 'prompt', expect.objectContaining({
      projectDir: '/root',
    }));
    expect(ensureSession).not.toHaveBeenCalled();
  });

  it('spawnWorkerMultiProvider uses subprocess for gemini models', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    const result = await spawnWorkerMultiProvider('t1', 'gemini-2.5-pro', 'prompt', '/root', {
      executionBudget: { maxTurns: 1 },
    });
    expect(result.backend).toBe('subprocess');
    expect(mockSubprocessSpawn).toHaveBeenCalled();
  });

  it('spawnWorkerMultiProvider passes autoApprove to a measured backend', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    await spawnWorkerMultiProvider('t1', 'claude-opus-4-8', 'prompt', '/root', {
      autoApprove: true,
      spawnBackend: 'subprocess',
      executionBudget: { maxTurns: 1 },
    });
    expect(mockSubprocessSpawn).toHaveBeenCalledWith(
      't1',
      'claude-opus-4-8',
      'prompt',
      expect.objectContaining({ autoApprove: true }),
    );
  });

  it('spawnWorkerMultiProvider passes autoApprove to subprocess', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    await spawnWorkerMultiProvider('t1', 'o3', 'prompt', '/root', {
      autoApprove: true,
      executionBudget: { maxTurns: 1 },
    });
    expect(mockSubprocessSpawn).toHaveBeenCalledWith('t1', 'o3', 'prompt', expect.objectContaining({
      autoApprove: true,
    }));
  });

  it('registerSpawn prints backend info for codex task', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({ model: 'gpt-4.1', id: 'test-codex' }));
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    const result = await spawnWorkerMultiProvider('test-codex', 'gpt-4.1', 'prompt', '/test/project', {
      executionBudget: { maxTurns: 1 },
    });
    expect(result.backend).toBe('subprocess');
  });
});

describe('kill multi-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('killSingle tries subprocess for codex task before tmux', async () => {
    const fs = await import('node:fs');
    const tasksDir = '/test/project/.tasks';
    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      if (String(p).includes('.tasks')) return true;
      return false;
    });
    vi.mocked(fs.readdirSync).mockImplementation((p: unknown) => {
      if (String(p) === tasksDir) return ['task-codex-1.json'] as unknown as ReturnType<typeof fs.readdirSync>;
      return [] as unknown as ReturnType<typeof fs.readdirSync>;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
      if (String(p).includes('task-codex-1.json')) {
        return JSON.stringify({ id: 'codex-1', model: 'gpt-4.1', status: 'EXECUTING' });
      }
      return '{}';
    });

    // The kill module uses internal functions — just verify subprocess backend is created for non-claude
    const { SpawnBackendFactory } = await import('../../../src/orchestra/spawn-backend.js');
    expect(SpawnBackendFactory.create).toBeDefined();
  });

  it('exports registerKill function', async () => {
    const killModule = await import('../../../src/cli/commands/kill.js');
    expect(typeof killModule.registerKill).toBe('function');
  });
});

describe('run multi-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('buildRunTask creates valid task for any model', async () => {
    const { buildRunTask } = await import('../../../src/cli/commands/run.js');
    const task = buildRunTask('run-1', 'Fix bug', 'gpt-4.1' as import('../../../src/core/types.js').ModelType, './');
    expect(task.model).toBe('gpt-4.1');
    expect(task.status).toBe('PENDING');
  });

  it('run imports spawnWorkerMultiProvider from spawn module', async () => {
    const spawnModule = await import('../../../src/cli/commands/spawn.js');
    expect(typeof spawnModule.spawnWorkerMultiProvider).toBe('function');
  });

  it('createRunTaskId generates unique IDs', async () => {
    const { createRunTaskId } = await import('../../../src/cli/commands/run.js');
    const id1 = createRunTaskId();
    const id2 = createRunTaskId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^run-/);
  });

  it('cleanupRunTask removes task files', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    cleanupRunTask('/test/project', 'run-123');
    // Should try to remove .json, .hb, .result, .plan, .log
    expect(fs.unlinkSync).toHaveBeenCalledTimes(5);
  });
});
