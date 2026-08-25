import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Hoisted Spies (referenced inside vi.mock factories) ────────────

const hoisted = vi.hoisted(() => ({
  backendSpawn: vi.fn(),
  backendKill: vi.fn(),
  backendList: vi.fn().mockReturnValue([]),
}));

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  TmuxError: class TmuxError extends Error {
    command?: string;
    constructor(msg: string, cmd?: string) {
      super(msg);
      this.name = 'TmuxError';
      this.command = cmd;
    }
  },
}));

// Sprint 178 refactor: production code routes through SpawnBackendFactory
// (default spawn_backend='docker'); mock the factory so backend.spawn is
// the observable call instead of legacy tmux.spawnWorker.
vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn(() => ({
      name: 'docker',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: hoisted.backendSpawn,
      kill: hoisted.backendKill,
      list: hoisted.backendList,
      isAvailable: vi.fn().mockResolvedValue(true),
    })),
    createAsync: vi.fn(async () => ({
      name: 'docker',
      liveUsageBudgetSupport: 'measured-stream',
      spawn: hoisted.backendSpawn,
      kill: hoisted.backendKill,
      list: hoisted.backendList,
      isAvailable: vi.fn().mockResolvedValue(true),
    })),
    isTmuxAvailable: vi.fn(() => true),
  },
  resolveBackend: vi.fn((b: string) => (b === 'auto' ? 'docker' : b)),
  resetTmuxDeprecationWarning: vi.fn(),
  SpawnBackendError: class SpawnBackendError extends Error {
    backendName: string;
    constructor(msg: string, backendName: string) {
      super(msg);
      this.name = 'SpawnBackendError';
      this.backendName = backendName;
    }
  },
  TmuxBackend: class TmuxBackend {},
  SubprocessBackend: class SubprocessBackend {},
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: vi.fn(async (
    taskId: string,
    model: string,
    prompt: string,
    root: string,
    opts: Record<string, unknown>,
  ) => {
    hoisted.backendSpawn(taskId, model, prompt, { ...opts, projectDir: root });
    return { backend: 'docker', provider: opts.provider ?? 'claude' };
  }),
}));

vi.mock('../../src/core/execution-plan-digest.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/execution-plan-digest.js')>();
  return {
    ...actual,
    applyWorkerExecutionBudgetPolicy: vi.fn((tasks: Array<Record<string, any>>, _policy: unknown, provider?: string) => (
      tasks.map((task) => {
        task.budget = { maxTokens: 100_000 };
        return {
          state: 'allow',
          role: 'worker',
          resolvedProvider: provider ?? task.provider ?? 'claude',
          executionCostClass: 'remote',
          profileRef: 'test.worker.default',
        };
      })
    )),
  };
});

vi.mock('../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('You are a worker...'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

// ─── Static Imports ──────────────────────────────────────────────────

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { ensureSession, spawnWorker } from '../../src/orchestra/tmux.js';
import { buildWorkerPrompt } from '../../src/orchestra/brain.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { buildParametricModel, modelRegistry } from '../../src/core/model-registry.js';
import {
  createRunTaskId,
  buildRunTask,
  cleanupRunTask,
  waitForRunResult,
  registerRun,
} from '../../src/cli/commands/run.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('createRunTaskId', () => {
  it('returns a string starting with run-', () => {
    const id = createRunTaskId();
    expect(id).toMatch(/^run-\d+-\d+$/);
  });

  it('returns unique-format ids on each call', () => {
    const id1 = createRunTaskId();
    const id2 = createRunTaskId();
    expect(id1).toMatch(/^run-/);
    expect(id2).toMatch(/^run-/);
  });
});

describe('buildRunTask', () => {
  it('creates a task with correct structure', () => {
    const task = buildRunTask('run-123', 'Do something', 'sonnet', './src');
    expect(task.id).toBe('run-123');
    expect(task.model).toBe('sonnet');
    expect(task.scope.directories).toEqual(['./src']);
    expect(task.status).toBe('PENDING');
    expect(task.description).toBe('Do something');
  });

  it('truncates title to 80 characters', () => {
    const longDesc = 'a'.repeat(100);
    const task = buildRunTask('run-1', longDesc, 'opus', './');
    expect(task.title.length).toBeLessThanOrEqual(80);
  });

  it('uses the provided model', () => {
    const task = buildRunTask('run-1', 'test', 'haiku', './');
    expect(task.model).toBe('haiku');
  });

  it('sets createdAt as ISO string', () => {
    const task = buildRunTask('run-1', 'test', 'sonnet', './');
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
  });

  it('has correct goNogo defaults', () => {
    const task = buildRunTask('run-1', 'test', 'sonnet', './');
    expect(task.goNogo.goCriteria).toBe('Task completed successfully');
    expect(task.goNogo.noGoCriteria).toBe('Task failed or errored');
  });

  it('sets empty filesRead and filesWrite', () => {
    const task = buildRunTask('run-1', 'test', 'sonnet', './');
    expect(task.scope.filesRead).toEqual([]);
    expect(task.scope.filesWrite).toEqual([]);
  });
});

describe('cleanupRunTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all task file extensions', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    cleanupRunTask('/project', 'run-123');
    expect(unlinkSync).toHaveBeenCalledTimes(5);
  });

  it('skips deletion if file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    cleanupRunTask('/project', 'run-123');
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('does not throw if unlinkSync fails', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(unlinkSync).mockImplementation(() => { throw new Error('EPERM'); });
    expect(() => cleanupRunTask('/project', 'run-123')).not.toThrow();
  });
});

describe('waitForRunResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns result immediately if file exists', async () => {
    const fakeResult = { taskId: 'run-1', selfAssessment: 'DONE', testsPassed: true };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(fakeResult));

    const result = await waitForRunResult('/project', 'run-1', 5000);
    // born-484: the disk-read boundary normalizer fills the contractual
    // `notes: string` field ('' when the worker omitted it).
    expect(result).toEqual({
      ...fakeResult,
      notes: '',
      testCommands: [],
      testVerification: {
        applicability: 'REQUIRED',
        outcome: 'PASSED',
        commands: [],
      },
    });
  });

  it('returns null if timeout expires without result', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await waitForRunResult('/project', 'run-1', 10);
    expect(result).toBeNull();
  });

  it('returns null if result file has invalid JSON', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not-json');
    const result = await waitForRunResult('/project', 'run-1', 5000);
    expect(result).toBeNull();
  });
});

describe('registerRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a "run" command on the program', () => {
    const program = new Command();
    program.exitOverride();
    registerRun(program);
    const cmd = program.commands.find(c => c.name() === 'run');
    expect(cmd).toBeDefined();
  });

  it('run command has --model option', () => {
    const program = new Command();
    registerRun(program);
    const cmd = program.commands.find(c => c.name() === 'run');
    const modelOpt = cmd?.options.find(o => o.long === '--model');
    expect(modelOpt).toBeDefined();
  });

  it('run command has --scope option', () => {
    const program = new Command();
    registerRun(program);
    const cmd = program.commands.find(c => c.name() === 'run');
    const scopeOpt = cmd?.options.find(o => o.long === '--scope');
    expect(scopeOpt).toBeDefined();
  });

  it('sets exit code 1 for invalid model', async () => {
    const origExitCode = process.exitCode;
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(false);

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    try {
      await program.parseAsync(['node', 'deckent', 'run', 'do something', '--model', 'invalid']);
    } catch {
      // commander may throw on exitOverride
    }

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });

  it('spawns worker and reports DONE result', async () => {
    const origExitCode = process.exitCode;
    hoisted.backendSpawn.mockClear();
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(writeFileSync).mockReturnValue(undefined);
    vi.mocked(ensureSession).mockReturnValue(undefined);
    vi.mocked(spawnWorker).mockReturnValue(undefined);
    vi.mocked(unlinkSync).mockReturnValue(undefined);

    // Return result file on first existsSync call
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(() => JSON.stringify({
      taskId: String(hoisted.backendSpawn.mock.calls.at(-1)?.[0]),
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: ['src/foo.ts'],
      notes: 'done',
    }));

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    // 453-001: 'sonnet' is a legacy alias the canonical resolver now rejects —
    // an exact provider model ID is required. The resolved ID flows byte-for-byte
    // to spawn (identity preservation).
    await program.parseAsync(['node', 'deckent', 'run', 'test task', '--model', 'claude-sonnet-5']);

    // Sprint 178 refactor: backend.spawn(taskId, model, prompt, opts) — 4 args,
    // projectDir lives inside the opts object instead of as a positional arg.
    expect(hoisted.backendSpawn).toHaveBeenCalledWith(
      expect.stringMatching(/^run-/),
      'claude-sonnet-5',
      expect.any(String),
      expect.objectContaining({ projectDir: '/project' }),
    );
    expect(process.exitCode).toBe(0);
    process.exitCode = origExitCode as number;
  });

  it('sets exit code 1 for NO_GO result', async () => {
    const origExitCode = process.exitCode;
    hoisted.backendSpawn.mockClear();
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(writeFileSync).mockReturnValue(undefined);
    vi.mocked(ensureSession).mockReturnValue(undefined);
    vi.mocked(spawnWorker).mockReturnValue(undefined);
    vi.mocked(unlinkSync).mockReturnValue(undefined);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(() => JSON.stringify({
      taskId: String(hoisted.backendSpawn.mock.calls.at(-1)?.[0]),
      selfAssessment: 'NO_GO',
      testsPassed: false,
      filesChanged: [],
      notes: 'failed',
    }));

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    await program.parseAsync(['node', 'deckent', 'run', 'test task']);

    // backend.spawn was invoked via SpawnBackendFactory (docker default).
    expect(hoisted.backendSpawn).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });
});

// ─── Canonical model boundary — full-action matrix (453-001) ──────────────────
// Drives the real `deckent run` action through commander. Success paths need a
// result file (existsSync→true) so waitForRunResult returns immediately; failure
// paths resolve the model FIRST and must never write a Task JSON or spawn. Unique
// unseen IDs per test avoid within-file registry bleed (registerParametric mutates
// the shared singleton).
describe('registerRun — canonical model boundary (453-001)', () => {
  function doneResult(): string {
    return JSON.stringify({
      taskId: String(hoisted.backendSpawn.mock.calls.at(-1)?.[0]),
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      notes: 'ok',
    });
  }

  /** Parsed contents of every `.json` file written this test (Task JSON writes). */
  function jsonWrites(): Record<string, unknown>[] {
    return vi.mocked(writeFileSync).mock.calls
      .filter(c => typeof c[0] === 'string' && /\.tasks\/task-run-.*\.json$/.test(c[0] as string))
      .map(c => JSON.parse(c[1] as string) as Record<string, unknown>);
  }

  async function runWith(args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerRun(program);
    await program.parseAsync(['node', 'deckent', 'run', 'do work', ...args]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.backendSpawn.mockClear();
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(writeFileSync).mockReturnValue(undefined);
    vi.mocked(unlinkSync).mockReturnValue(undefined);
  });

  it('accepts a known exact ID (gpt-5.6-sol) and spawns with it unchanged', async () => {
    const orig = process.exitCode;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(doneResult);

    await runWith(['--model', 'gpt-5.6-sol']);

    expect(hoisted.backendSpawn).toHaveBeenCalledWith(
      expect.stringMatching(/^run-/),
      'gpt-5.6-sol',
      expect.any(String),
      expect.objectContaining({ projectDir: '/project' }),
    );
    expect(process.exitCode).toBe(0);
    process.exitCode = orig as number;
  });

  it('accepts a pricing-verified versioned ID with --provider codex; Task JSON + spawn preserve it', async () => {
    const orig = process.exitCode;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(doneResult);
    modelRegistry.register(buildParametricModel('gpt-5.6-neo-453d', {
      provider: 'codex',
      costPerMillion: { input: 2, output: 10 },
      pricingEvidenceRef: 'catalog:test:gpt-5.6-neo-453d',
      status: 'ga',
    }));

    await runWith(['--model', 'gpt-5.6-neo-453d', '--provider', 'codex']);

    const written = jsonWrites();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ model: 'gpt-5.6-neo-453d', provider: 'codex' });
    // Same exact ID reaches the spawn wire (identity preservation).
    expect(hoisted.backendSpawn).toHaveBeenCalledWith(
      expect.stringMatching(/^run-/),
      'gpt-5.6-neo-453d',
      expect.any(String),
      expect.objectContaining({ projectDir: '/project' }),
    );
    process.exitCode = orig as number;
  });

  it('omitted --model resolves from the canonical config default (never a literal alias)', async () => {
    const orig = process.exitCode;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(doneResult);

    await runWith([]);

    expect(hoisted.backendSpawn).toHaveBeenCalledWith(
      expect.stringMatching(/^run-/),
      'claude-opus-5',
      expect.any(String),
      expect.objectContaining({ projectDir: '/project' }),
    );
    process.exitCode = orig as number;
  });

  it.each([
    ['legacy alias (gpt-5)', ['--model', 'gpt-5']],
    ['unknown without provider', ['--model', 'gpt-5.6-ghost-453e']],
    ['provider/model mismatch', ['--model', 'claude-opus-4-8', '--provider', 'codex']],
  ])('fails loudly before disk/spawn: %s', async (_label, args) => {
    const orig = process.exitCode;
    vi.mocked(existsSync).mockReturnValue(false);

    await runWith(args);

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    // No Task JSON written, no worker spawned — the alias/mismatch never reached disk.
    expect(jsonWrites()).toHaveLength(0);
    expect(hoisted.backendSpawn).not.toHaveBeenCalled();
    process.exitCode = orig as number;
  });
});
