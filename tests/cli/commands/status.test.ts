import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { DashboardState } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatDashboard: vi.fn().mockReturnValue('Dashboard Output'),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, existsSync } from 'node:fs';
import { print, printError, formatDashboard } from '../../../src/cli/helpers/output.js';
import { registerStatus } from '../../../src/cli/commands/status.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDashboard(overrides?: Partial<DashboardState>): DashboardState {
  return {
    sprint: { id: 'sprint-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [],
    progress: { done: 3, active: 2, blocked: 0, total: 5 },
    usage: { fiveHourPercent: 25, weeklyPercent: 10, measuredAt: '2026-03-19T00:00:00Z' },
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

  it('registers status command with --watch and --json options', () => {
    const program = new Command();
    registerStatus(program);
    const cmd = program.commands.find(c => c.name() === 'status');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some(o => o.long === '--watch')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--json')).toBe(true);
  });

  it('shows no active sprint message when dashboard does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['status']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No active sprint'));
  });

  it('renders formatted dashboard when file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    await runCommand(['status']);
    expect(formatDashboard).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Dashboard Output');
  });

  it('--json outputs raw JSON', async () => {
    const state = makeDashboard();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status', '--json']);
    // Should print JSON, not call formatDashboard
    const printCalls = vi.mocked(print).mock.calls;
    const jsonOutput = printCalls.find(c => c[0].includes('sprint-001'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput![0]);
    expect(parsed.sprint.id).toBe('sprint-001');
    expect(parsed.progress.done).toBe(3);
  });

  it('handles corrupt dashboard file with error', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json!!!');
    await runCommand(['status']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('--watch sets up setInterval with 2000ms', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(['status', '--watch']);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
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
    // Initial render should have printed JSON (not formatDashboard)
    const printCalls = vi.mocked(print).mock.calls;
    const hasJson = printCalls.some(c => {
      try { JSON.parse(c[0]); return true; } catch { return false; }
    });
    expect(hasJson).toBe(true);
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('dashboard with agents renders correctly', async () => {
    const state = makeDashboard({
      agents: [
        { id: 'w-001', role: 'worker' as any, status: 'EXECUTING' as any, model: 'sonnet', tmuxWindow: 'w-001', taskId: '001', currentAction: 'coding', spawnedAt: '' },
      ],
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status']);
    expect(formatDashboard).toHaveBeenCalledWith(expect.objectContaining({
      agents: expect.arrayContaining([expect.objectContaining({ id: 'w-001' })]),
    }));
  });

  it('dashboard with alerts renders correctly', async () => {
    const state = makeDashboard({
      alerts: [{ level: 'WARNING' as any, message: 'stale heartbeat', timestamp: '' }],
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status']);
    expect(formatDashboard).toHaveBeenCalledWith(expect.objectContaining({
      alerts: expect.arrayContaining([expect.objectContaining({ message: 'stale heartbeat' })]),
    }));
  });
});
