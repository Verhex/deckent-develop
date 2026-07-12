import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { Task } from '../../../src/core/types.js';
import { TaskStatus } from '../../../src/core/types.js';

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
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

const mockBuildWorkerPrompt = vi.fn().mockReturnValue(
  'You are a Worker agent.\n\n## Task\nTitle: Test Task\nDescription: Test description\n\n## Scope Rules\nYou may ONLY modify files in these directories:\n  - src/\n\nDO NOT touch files outside your scope.'
);
vi.mock('../../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: (...args: unknown[]) => mockBuildWorkerPrompt(...args),
}));

const mockResolveAgentPrompt = vi.fn().mockReturnValue(undefined);
const mockResolveSkillPrompts = vi.fn().mockReturnValue([]);
vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: (...args: unknown[]) => mockResolveAgentPrompt(...args),
  resolveSkillPrompts: (...args: unknown[]) => mockResolveSkillPrompts(...args),
}));

import { readTask } from '../../../src/agents/worker.js';
import { ensureSession, spawnWorker } from '../../../src/orchestra/tmux.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { loadConfig } from '../../../src/core/config.js';
import { registerSpawn } from '../../../src/cli/commands/spawn.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001',
    title: 'Test Task',
    description: 'Test description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-001',
    createdAt: new Date().toISOString(),
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

describe('spawn command enhanced (rich prompt, status checks, flags)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en' } as any);
    mockBuildWorkerPrompt.mockReturnValue(
      'You are a Worker agent.\n\n## Task\nTitle: Test Task\nDescription: Test description\n\n## Scope Rules\nYou may ONLY modify files in these directories:\n  - src/\n\nDO NOT touch files outside your scope.'
    );
    mockResolveAgentPrompt.mockReturnValue(undefined);
    mockResolveSkillPrompts.mockReturnValue([]);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('uses buildWorkerPrompt for rich prompt (not simple one-liner)', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    expect(mockBuildWorkerPrompt).toHaveBeenCalled();
    const prompt = vi.mocked(spawnWorker).mock.calls[0]?.[2] as string;
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('injects agent context when agent is assigned', async () => {
    const task = makeTask({ assignedAgent: 'typescript-expert' });
    vi.mocked(readTask).mockReturnValue(task);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
    mockResolveAgentPrompt.mockReturnValue('You are a TypeScript expert.');

    await runCommand(['spawn', '001-001']);

    expect(mockResolveAgentPrompt).toHaveBeenCalledWith('/mock/root', task);
    expect(mockBuildWorkerPrompt).toHaveBeenCalledWith(
      task,
      'You are a TypeScript expert.',
      expect.any(Array),
      '/mock/root',
    );
  });

  it('injects skill context when skills are assigned', async () => {
    const task = makeTask({ assignedSkills: ['testing', 'refactoring'] });
    vi.mocked(readTask).mockReturnValue(task);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
    mockResolveSkillPrompts.mockReturnValue([
      { name: 'testing', content: 'Testing skill content' },
      { name: 'refactoring', content: 'Refactoring skill content' },
    ]);

    await runCommand(['spawn', '001-001']);

    expect(mockResolveSkillPrompts).toHaveBeenCalledWith('/mock/root', task);
    expect(mockBuildWorkerPrompt).toHaveBeenCalledWith(
      task,
      undefined,
      [
        { name: 'testing', content: 'Testing skill content' },
        { name: 'refactoring', content: 'Refactoring skill content' },
      ],
      '/mock/root',
    );
  });

  it('blocks spawn when task status is DONE without --force', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({ status: TaskStatus.DONE }));

    await runCommand(['spawn', '001-001']);

    expect(printError).toHaveBeenCalledWith(expect.stringContaining('already DONE'));
    expect(printError).toHaveBeenCalledWith(expect.stringContaining('--force'));
    expect(spawnWorker).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('allows spawn when task is DONE with --force', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({ status: TaskStatus.DONE }));
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001', '--force']);

    expect(spawnWorker).toHaveBeenCalled();
  });

  it('blocks spawn when task status is EXECUTING', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({ status: TaskStatus.EXECUTING }));

    await runCommand(['spawn', '001-001']);

    expect(printError).toHaveBeenCalledWith(expect.stringContaining('already running'));
    expect(printError).toHaveBeenCalledWith(expect.stringContaining('kill'));
    expect(spawnWorker).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('blocks spawn when task status is NO_GO without --force', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({ status: TaskStatus.NO_GO }));

    await runCommand(['spawn', '001-001']);

    expect(printError).toHaveBeenCalledWith(expect.stringContaining('already NO_GO'));
    expect(spawnWorker).not.toHaveBeenCalled();
  });

  it('passes autoApprove true when --auto-approve flag is set', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001', '--auto-approve']);

    expect(spawnWorker).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ autoApprove: true }),
    );
  });

  it('shows error when task file is not found', async () => {
    vi.mocked(readTask).mockImplementation(() => {
      throw new Error('Task file not found: .tasks/task-999-999.json');
    });

    await runCommand(['spawn', '999-999']);

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('shows scope directories after spawn', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({
      scope: { directories: ['src/cli/', 'src/core/'], filesRead: [], filesWrite: ['src/cli/foo.ts'] },
    }));
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    expect(print).toHaveBeenCalledWith(expect.stringContaining('src/cli/'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('src/core/'));
  });

  it('shows write files after spawn', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask({
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts', 'src/bar.ts'] },
    }));
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    expect(print).toHaveBeenCalledWith(expect.stringContaining('src/foo.ts'));
  });

  it('prompt is at least 100 characters (rich prompt test)', async () => {
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});

    await runCommand(['spawn', '001-001']);

    const prompt = vi.mocked(spawnWorker).mock.calls[0]?.[2] as string;
    expect(prompt.length).toBeGreaterThanOrEqual(100);
  });
});
