import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase, TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, SprintMetrics } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  resolveEffectiveWorkers: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

// ─── Static Imports ──────────────────────────────────────────────────

import { existsSync } from 'node:fs';
import { loadConfig } from '../../src/core/config.js';
import { runSprint, BrainError } from '../../src/orchestra/brain.js';
import { print, printError, formatSprintSummary } from '../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { registerTestRun } from '../../src/cli/commands/test-run.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-test',
    number: 99,
    phase: SprintPhase.COMPLETE,
    status: SprintStatus.COMPLETE,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    tasks: [],
    workers: [],
    ...overrides,
  } as Sprint;
}

function makeConfig() {
  return {
    projectRoot: '/project',
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
      planning: 'structured',
    },
    language: 'en',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('registerTestRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('registers a "test" command on the program', () => {
    const program = new Command();
    program.exitOverride();
    registerTestRun(program);
    const cmd = program.commands.find(c => c.name() === 'test');
    expect(cmd).toBeDefined();
  });

  it('test command has --keep option', () => {
    const program = new Command();
    registerTestRun(program);
    const cmd = program.commands.find(c => c.name() === 'test');
    const keepOpt = cmd?.options.find(o => o.long === '--keep');
    expect(keepOpt).toBeDefined();
  });

  it('test command has --timeout option', () => {
    const program = new Command();
    registerTestRun(program);
    const cmd = program.commands.find(c => c.name() === 'test');
    const timeoutOpt = cmd?.options.find(o => o.long === '--timeout');
    expect(timeoutOpt).toBeDefined();
  });

  it('sets exit code 1 if DIRECTIVES.md is missing', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(false);

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    try {
      await program.parseAsync(['node', 'deckent', 'test']);
    } catch { /* commander may throw on exitOverride */ }

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('calls runSprint with testMode=true', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint({
      tasks: [],
      metrics: { totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0 } as SprintMetrics,
    }));

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test']);

    expect(runSprint).toHaveBeenCalledWith('/project', expect.any(Object), {
      testMode: true,
      skipCleanup: false,
      timeoutMs: 300000,
    });
  });

  it('passes skipCleanup=true when --keep is set', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint({
      tasks: [],
      metrics: { totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0 } as SprintMetrics,
    }));

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test', '--keep']);

    expect(runSprint).toHaveBeenCalledWith('/project', expect.any(Object), {
      testMode: true,
      skipCleanup: true,
      timeoutMs: 300000,
    });
    expect(print).toHaveBeenCalledWith('--keep flag active: task files preserved.');
  });

  it('passes custom timeout when --timeout is set', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint({
      tasks: [],
      metrics: { totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0 } as SprintMetrics,
    }));

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test', '--timeout', '60000']);

    expect(runSprint).toHaveBeenCalledWith('/project', expect.any(Object), {
      testMode: true,
      skipCleanup: false,
      timeoutMs: 60000,
    });
  });

  it('sets exit code 1 for invalid timeout', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    try {
      await program.parseAsync(['node', 'deckent', 'test', '--timeout', 'abc']);
    } catch { /* commander may throw */ }

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(runSprint).not.toHaveBeenCalled();
  });

  it('exit code 0 when all tasks are DONE', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint({
      tasks: [
        { id: '001', title: 'T1', status: TaskStatus.DONE } as any,
        { id: '002', title: 'T2', status: TaskStatus.DONE } as any,
      ],
      metrics: { totalTasks: 2, completedTasks: 2, techDebtTasks: 0, noGoTasks: 0 } as SprintMetrics,
    }));

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test']);

    expect(process.exitCode).toBeUndefined();
  });

  it('exit code 1 when any task has NO_GO status', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint({
      tasks: [
        { id: '001', title: 'T1', status: TaskStatus.DONE } as any,
        { id: '002', title: 'T2', status: 'NO_GO' as any } as any,
      ],
      metrics: { totalTasks: 2, completedTasks: 1, techDebtTasks: 0, noGoTasks: 1 } as SprintMetrics,
    }));

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test']);

    expect(process.exitCode).toBe(1);
  });

  it('exit code 1 when metrics report noGoTasks > 0', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint({
      tasks: [
        { id: '001', title: 'T1', status: TaskStatus.DONE } as any,
      ],
      metrics: { totalTasks: 1, completedTasks: 0, techDebtTasks: 0, noGoTasks: 1 } as SprintMetrics,
    }));

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test']);

    expect(process.exitCode).toBe(1);
  });

  it('handles BrainError with phase info', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);

    const brainError = new BrainError('Plan failed', 'PLAN');
    vi.mocked(runSprint).mockRejectedValue(brainError);

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test']);

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('handles generic error gracefully', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockRejectedValue(new Error('Unknown error'));

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test']);

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('prints sprint summary on success', async () => {
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint({
      tasks: [],
      metrics: { totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0 } as SprintMetrics,
    }));

    const program = new Command();
    program.exitOverride();
    registerTestRun(program);

    await program.parseAsync(['node', 'deckent', 'test']);

    expect(formatSprintSummary).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Sprint summary');
  });
});
