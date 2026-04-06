import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase, TaskStatus } from '../../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({
    connector: {},
    registered: ['claude'],
    skipped: [],
    defaultProvider: 'claude',
    providerEnvOverrides: {},
  }),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(),
  planSprint: vi.fn(),
  confirmDraftTasks: vi.fn(),
  cleanupDraftTasks: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockImplementation((headers: string[], rows: string[][]) => {
    return [headers.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }),
}));

vi.mock('../../../src/cli/helpers/prompt.js', () => ({
  promptConfirm: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { loadConfig } from '../../../src/core/config.js';
import { bootstrapProviders } from '../../../src/core/provider.js';
import {
  readContext, planSprint, confirmDraftTasks, cleanupDraftTasks,
} from '../../../src/orchestra/brain.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { promptConfirm } from '../../../src/cli/helpers/prompt.js';
import { registerPlan } from '../../../src/cli/commands/plan.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true,
      brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Test Task', description: 'desc', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.DRAFT, sprintId: 'sprint-001', createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-001', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-001-001'],
    ...overrides,
  };
}

function setupMocks(): void {
  vi.mocked(loadConfig).mockResolvedValue(makeConfig());
  vi.mocked(readContext).mockReturnValue({
    directives: '', memory: '', retro: '', debt: [],
    patterns: '', decisions: '', existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
  });
  vi.mocked(planSprint).mockReturnValue(makeSprint());
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerPlan(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('plan command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers plan command with options', () => {
    const program = new Command();
    registerPlan(program);
    const cmd = program.commands.find(c => c.name() === 'plan');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some(o => o.long === '--no-confirm')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--structured')).toBe(true);
  });

  it('calls readContext and planSprint', async () => {
    setupMocks();
    await runCommand(['plan', '--no-confirm']);
    expect(readContext).toHaveBeenCalled();
    expect(planSprint).toHaveBeenCalled();
  });

  it('prints task table with ID, Title, Model, Priority', async () => {
    setupMocks();
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: '001-001', title: 'Do Something', model: 'opus', priority: 'HIGH' })],
    }));
    await runCommand(['plan', '--no-confirm']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('1 tasks'));
  });

  it('--structured passes mode=structured to planSprint', async () => {
    setupMocks();
    await runCommand(['plan', '--structured', '--no-confirm']);
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
  });

  it('--no-confirm sets asDraft=false and skips prompt', async () => {
    setupMocks();
    await runCommand(['plan', '--no-confirm']);
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ asDraft: false }),
    );
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(confirmDraftTasks).not.toHaveBeenCalled();
  });

  it('default (with confirm) shows approval prompt', async () => {
    setupMocks();
    vi.mocked(promptConfirm).mockResolvedValue(true);
    await runCommand(['plan']);
    expect(promptConfirm).toHaveBeenCalledWith('Approve this plan?');
    expect(confirmDraftTasks).toHaveBeenCalled();
  });

  it('rejected plan does not call confirmDraftTasks', async () => {
    setupMocks();
    vi.mocked(promptConfirm).mockResolvedValue(false);
    await runCommand(['plan']);
    expect(confirmDraftTasks).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Plan rejected.');
  });

  it('shows reasoning and planningMode when present', async () => {
    setupMocks();
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      reasoning: 'AI chose tasks',
      planningMode: 'ai',
    }));
    await runCommand(['plan', '--no-confirm']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('AI chose tasks'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Planning mode: ai'));
  });

  it('handles loadConfig error gracefully', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('config missing'));
    await runCommand(['plan']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('handles planSprint error gracefully', async () => {
    setupMocks();
    vi.mocked(planSprint).mockImplementation(() => { throw new Error('circular deps'); });
    await runCommand(['plan', '--no-confirm']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  // ─── B) --dry-run ────────────────────────────────────────────────

  it('--dry-run passes dryRun option to planSprint', async () => {
    setupMocks();
    await runCommand(['plan', '--dry-run', '--no-confirm']);
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ dryRun: true }),
    );
  });

  it('--dry-run prints dry-run message and skips confirmation', async () => {
    setupMocks();
    await runCommand(['plan', '--dry-run']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(confirmDraftTasks).not.toHaveBeenCalled();
  });

  // ─── C) cleanupDraftTasks idempotency ─────────────────────────────

  it('calls cleanupDraftTasks before planning', async () => {
    setupMocks();
    await runCommand(['plan', '--no-confirm']);
    expect(cleanupDraftTasks).toHaveBeenCalledWith('/mock/root');
    // cleanupDraftTasks should be called before planSprint
    const cleanupOrder = vi.mocked(cleanupDraftTasks).mock.invocationCallOrder[0];
    const planOrder = vi.mocked(planSprint).mock.invocationCallOrder[0];
    expect(cleanupOrder).toBeLessThan(planOrder!);
  });

  // ─── D) Registers --dry-run option ────────────────────────────────

  it('registers --dry-run option on the command', () => {
    const program = new Command();
    registerPlan(program);
    const cmd = program.commands.find(c => c.name() === 'plan');
    expect(cmd!.options.some(o => o.long === '--dry-run')).toBe(true);
  });

  // ─── E) Provider bootstrap ─────────────────────────────────────────

  it('calls bootstrapProviders before planning', async () => {
    setupMocks();
    await runCommand(['plan', '--no-confirm']);
    expect(bootstrapProviders).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'max_plan',
      language: 'en',
    }));
    // bootstrapProviders should be called before planSprint
    const bootstrapOrder = vi.mocked(bootstrapProviders).mock.invocationCallOrder[0];
    const planOrder = vi.mocked(planSprint).mock.invocationCallOrder[0];
    expect(bootstrapOrder).toBeLessThan(planOrder!);
  });

  it('falls back to structured mode when bootstrapProviders fails', async () => {
    setupMocks();
    vi.mocked(bootstrapProviders).mockRejectedValue(new Error('No API key'));
    await runCommand(['plan', '--no-confirm']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('[warn]'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('structured'));
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
  });

  it('does not override --structured flag when bootstrap fails', async () => {
    setupMocks();
    vi.mocked(bootstrapProviders).mockRejectedValue(new Error('No API key'));
    await runCommand(['plan', '--structured', '--no-confirm']);
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
    // Should NOT print fallback warning because --structured was already set
    const printCalls = vi.mocked(print).mock.calls.map(c => c[0]);
    const warnCalls = printCalls.filter(msg => typeof msg === 'string' && msg.includes('[warn]'));
    expect(warnCalls).toHaveLength(0);
  });

  it('--dry-run uses structured mode without calling bootstrapProviders', async () => {
    setupMocks();
    await runCommand(['plan', '--dry-run', '--no-confirm']);
    expect(bootstrapProviders).not.toHaveBeenCalled();
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured', dryRun: true }),
    );
  });

  it('--dry-run + --structured skips bootstrap and uses structured', async () => {
    setupMocks();
    await runCommand(['plan', '--dry-run', '--structured', '--no-confirm']);
    expect(bootstrapProviders).not.toHaveBeenCalled();
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured', dryRun: true }),
    );
  });

  it('successful bootstrap does not force structured mode', async () => {
    setupMocks();
    vi.mocked(bootstrapProviders).mockResolvedValue({
      connector: {} as any,
      registered: ['claude'],
      skipped: [],
      defaultProvider: 'claude',
      providerEnvOverrides: {},
    });
    await runCommand(['plan', '--no-confirm']);
    expect(planSprint).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: undefined }),
    );
  });
});
