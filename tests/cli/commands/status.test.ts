import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { DashboardState } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  watch: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatDashboard: vi.fn().mockReturnValue('Dashboard Output'),
  formatHumanStatus: vi.fn().mockReturnValue('Human Status Output'),
  formatStandaloneStatus: vi.fn().mockReturnValue('Standalone Status Output'),
  formatTable: vi.fn().mockReturnValue('Table'),
  isNoColor: vi.fn().mockReturnValue(false),
  stripAnsi: vi.fn((s: string) => s),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, existsSync, readdirSync, watch } from 'node:fs';
import { print, printError, formatDashboard, formatHumanStatus, formatStandaloneStatus } from '../../../src/cli/helpers/output.js';
import { registerStatus } from '../../../src/cli/commands/status.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDashboard(overrides?: Partial<DashboardState>): DashboardState {
  return {
    sprint: { id: 'sprint-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [],
    progress: { done: 3, active: 2, blocked: 0, total: 5 },
    alerts: [],
    updatedAt: '2026-03-19T00:00:00Z',
    ...overrides,
  };
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStatus(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('status command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers status command with --watch, --json, --raw, and --no-color options', () => {
    const program = new Command();
    registerStatus(program);
    const cmd = program.commands.find(c => c.name() === 'status');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some(o => o.long === '--watch')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--json')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--raw')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--no-color')).toBe(true);
  });

  it('shows no active sprint message when dashboard and tasks do not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['status']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No active sprint'));
  });

  it('(A) shows standalone status from task files when no dashboard', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return false;
      if (String(p).includes('.tasks')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      id: '001', title: 'Test Task', status: 'EXECUTING', sprintId: 'sprint-001',
      dependencies: [], model: 'sonnet', effort: 'normal',
    }));
    await runCommand(['status']);
    expect(formatStandaloneStatus).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Standalone Status Output');
  });

  it('(A) standalone with --json outputs JSON', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return false;
      if (String(p).includes('.tasks')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      id: '001', title: 'Test', status: 'DONE', sprintId: 'sprint-002',
      dependencies: [], model: 'sonnet', effort: 'normal',
    }));
    await runCommand(['status', '--json']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonCall = printCalls.find(c => c[0].includes('standalone'));
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0]);
    expect(parsed.standalone).toBe(true);
    expect(parsed.sprintId).toBe('sprint-002');
  });

  it('renders human-friendly output by default', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Human Status Output');
  });

  it('--raw renders legacy formatted dashboard', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    await runCommand(['status', '--raw']);
    expect(formatDashboard).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Dashboard Output');
  });

  it('--json outputs raw JSON', async () => {
    const state = makeDashboard();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status', '--json']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonOutput = printCalls.find(c => c[0].includes('sprint-001'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput![0]);
    expect(parsed.sprint.id).toBe('sprint-001');
    expect(parsed.progress.done).toBe(3);
  });

  it('(E) --json --verbose includes agent/skill info', async () => {
    const state = makeDashboard();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status', '--json', '--verbose']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonOutput = printCalls.find(c => c[0].includes('_verbose'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput![0]);
    expect(parsed._verbose).toBeDefined();
    expect(parsed._verbose.agents).toBeDefined();
  });

  it('handles corrupt dashboard file with error', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json!!!');
    await runCommand(['status']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('(D) --watch uses fs.watch with fallback interval', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(['status', '--watch']);
    // fs.watch should be called
    expect(watch).toHaveBeenCalled();
    // Fallback interval at 5000ms
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    // Should register SIGINT and SIGTERM handlers
    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('--watch with --json outputs JSON on each render', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(['status', '--watch', '--json']);
    const printCalls = vi.mocked(print).mock.calls;
    const hasJson = printCalls.some(c => {
      try { JSON.parse(c[0]); return true; } catch { return false; }
    });
    expect(hasJson).toBe(true);
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('--watch uses human-friendly output by default', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(['status', '--watch']);
    expect(formatHumanStatus).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('--watch --raw uses legacy dashboard', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(['status', '--watch', '--raw']);
    expect(formatDashboard).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('human-friendly output is called with dashboard data and projectRoot', async () => {
    const state = makeDashboard({
      agents: [
        { id: 'w-001', role: 'worker' as any, status: 'EXECUTING' as any, model: 'sonnet', tmuxWindow: 'w-001', taskId: '001', currentAction: 'coding', spawnedAt: '' },
      ],
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalledWith(expect.objectContaining({
      dashboard: expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ id: 'w-001' })]),
      }),
      projectRoot: '/mock/root',
    }));
  });

  it('human-friendly output includes tasks from loadTaskFiles', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalledWith(expect.objectContaining({
      tasks: expect.any(Array),
    }));
  });

  it('dashboard with alerts renders in human-friendly mode', async () => {
    const state = makeDashboard({
      alerts: [{ level: 'WARNING' as any, message: 'stale heartbeat', timestamp: '' }],
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalledWith(expect.objectContaining({
      dashboard: expect.objectContaining({
        alerts: expect.arrayContaining([expect.objectContaining({ message: 'stale heartbeat' })]),
      }),
    }));
  });

  it('(F) readSprintMeta tolerant regex matches various formats', async () => {
    // Test that various DIRECTIVES.md title formats are parsed
    vi.mocked(existsSync).mockReturnValue(true);
    // The DIRECTIVES.md uses ": Title" format instead of "(Title)"
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      const path = String(p);
      if (path.includes('DIRECTIVES.md')) {
        return '# DIRECTIVES: Sprint 056 — CLI Perfection Wave';
      }
      if (path.includes('.dashboard')) {
        return JSON.stringify(makeDashboard());
      }
      return JSON.stringify(makeDashboard());
    });
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalledWith(expect.objectContaining({
      sprintTitle: expect.stringContaining('CLI Perfection Wave'),
    }));
  });
});
