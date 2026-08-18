import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks ──────────────────────────────────────────────────────────
const fixture = vi.hoisted(() => ({ base: '', root: '' }));

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
  resolveProjectRoot: vi.fn(() => fixture.root),
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

const {
  mockSubprocessSpawn,
  mockSubprocessKill,
  mockSubprocessList,
  mockBackendState,
} = vi.hoisted(() => ({
  mockSubprocessSpawn: vi.fn(),
  mockSubprocessKill: vi.fn(),
  mockSubprocessList: vi.fn().mockReturnValue([]),
  mockBackendState: {
    landingCapability: 'checkpoint-stop' as 'checkpoint-stop' | 'unsupported',
  },
}));

vi.mock('../../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn().mockReturnValue({
      name: 'subprocess',
      liveUsageBudgetSupport: 'measured-stream',
      get executionLandingCapability() { return mockBackendState.landingCapability; },
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
import { ensureSession, spawnWorker, killWorker } from '../../../src/orchestra/tmux.js';
import { SpawnBackendFactory } from '../../../src/orchestra/spawn-backend.js';

const TEST_ATTENDED_EXECUTION_OPTIONS = {
  executionBudget: { maxTurns: 1 },
  executionLandingPolicy: {
    reserve_ratio: 0.25,
    attended_unsupported: 'allow-hard-stop',
  },
  executionBudgetProfileRef: 'execution_budget.roles.worker.default',
  executionBudgetPolicyDigest: 'c'.repeat(64),
  executionAdmissionMode: 'attended',
  executionApprovalEvidenceRef: 'test-owner-approval://multi-provider-spawn',
} as const;

const originalDeckentHome = process.env.DECKENT_HOME;

beforeEach(() => {
  fixture.base = mkdtempSync(join(tmpdir(), 'multi-provider-spawn-kill-run-'));
  fixture.root = join(fixture.base, 'project');
  mkdirSync(join(fixture.root, '.tasks'), { recursive: true });
  process.env.DECKENT_HOME = join(fixture.base, 'host-state');
});

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  rmSync(fixture.base, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('spawn multi-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBackendState.landingCapability = 'checkpoint-stop';
    process.exitCode = undefined;
  });

  it('spawnWorkerMultiProvider fails closed for unmetered tmux claude execution', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    await expect(spawnWorkerMultiProvider(
      't1',
      'claude-sonnet-5',
      'prompt',
      fixture.root,
      { executionBudget: { maxTurns: 1 } },
    )).rejects.toThrow(/does not declare that capability/);
    expect(ensureSession).not.toHaveBeenCalled();
    expect(spawnWorker).not.toHaveBeenCalled();
  });

  it('rejects raw attended evidence without an exact dispatch binding before subprocess provider work', async () => {
    mockBackendState.landingCapability = 'unsupported';
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    await expect(spawnWorkerMultiProvider('t1', 'gpt-4.1', 'prompt', fixture.root, {
      ...TEST_ATTENDED_EXECUTION_OPTIONS,
    })).rejects.toThrow('exact final dispatch binding');
    expect(mockSubprocessSpawn).not.toHaveBeenCalled();
    expect(ensureSession).not.toHaveBeenCalled();
  });

  it('spawnWorkerMultiProvider uses subprocess for gemini models', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    const result = await spawnWorkerMultiProvider('t1', 'gemini-2.5-pro', 'prompt', fixture.root, {
      ...TEST_ATTENDED_EXECUTION_OPTIONS,
    });
    expect(result.backend).toBe('subprocess');
    expect(mockSubprocessSpawn).toHaveBeenCalled();
  });

  it('spawnWorkerMultiProvider passes autoApprove to a measured backend', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    await spawnWorkerMultiProvider('t1', 'claude-opus-4-8', 'prompt', fixture.root, {
      autoApprove: true,
      spawnBackend: 'subprocess',
      ...TEST_ATTENDED_EXECUTION_OPTIONS,
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
    await spawnWorkerMultiProvider('t1', 'o3', 'prompt', fixture.root, {
      autoApprove: true,
      ...TEST_ATTENDED_EXECUTION_OPTIONS,
    });
    expect(mockSubprocessSpawn).toHaveBeenCalledWith('t1', 'o3', 'prompt', expect.objectContaining({
      autoApprove: true,
    }));
  });

  it('reports the subprocess route after dispatching a codex task', async () => {
    const { spawnWorkerMultiProvider } = await import('../../../src/cli/commands/spawn.js');
    const result = await spawnWorkerMultiProvider('test-codex', 'gpt-4.1', 'prompt', fixture.root, {
      ...TEST_ATTENDED_EXECUTION_OPTIONS,
    });
    expect(result.backend).toBe('subprocess');
    expect(mockSubprocessSpawn).toHaveBeenCalledOnce();
  });
});

describe('kill multi-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('killSingle tries subprocess for codex task before tmux', async () => {
    const taskPath = join(fixture.root, '.tasks', 'task-codex-1.json');
    writeFileSync(
      taskPath,
      JSON.stringify({ id: 'codex-1', model: 'gpt-4.1', status: 'EXECUTING' }),
      'utf-8',
    );
    const { killSingle } = await import('../../../src/cli/commands/kill.js');

    expect(killSingle(fixture.root, 'codex-1', 'en')).toBe('killed');
    expect(SpawnBackendFactory.create).toHaveBeenCalledWith({
      backend: 'subprocess',
      projectDir: fixture.root,
    });
    expect(mockSubprocessKill).toHaveBeenCalledWith('codex-1');
    expect(killWorker).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(taskPath, 'utf-8')).status).toBe('PAUSED');
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
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    const extensions = ['.json', '.hb', '.result', '.plan', '.log'];
    for (const extension of extensions) {
      writeFileSync(
        join(fixture.root, '.tasks', `task-run-123${extension}`),
        'fixture',
        'utf-8',
      );
    }

    cleanupRunTask(fixture.root, 'run-123');

    for (const extension of extensions) {
      expect(existsSync(join(fixture.root, '.tasks', `task-run-123${extension}`))).toBe(false);
    }
  });
});
