import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  print,
  printError,
  formatProgressBar,
  formatTable,
  formatDashboard,
  formatDoctorResult,
  formatSprintSummary,
} from '../../../src/cli/helpers/output.js';
import { AgentStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DashboardState, DoctorResult, Sprint, AgentRole } from '../../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sprint: {
      id: 'sprint-001',
      number: 1,
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
    },
    agents: [],
    progress: { done: 2, active: 1, blocked: 0, total: 5 },
    usage: { fiveHourPercent: 30, weeklyPercent: 45 } as DashboardState['usage'],
    alerts: [],
    updatedAt: '2026-03-20T10:00:00.000Z',
    ...overrides,
  };
}

function makeDoctorResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return {
    ok: true,
    checks: [
      { name: 'tmux', passed: true, message: 'tmux 3.3a found', required: true },
      { name: 'git', passed: true, message: 'git 2.39 found', required: true },
    ],
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [],
    workers: [],
    ...overrides,
  };
}

// ─── print ───────────────────────────────────────────────────────────

describe('print', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes message + newline to stdout', () => {
    print('hello world');
    expect(writeSpy).toHaveBeenCalledWith('hello world\n');
  });

  it('writes empty string with newline', () => {
    print('');
    expect(writeSpy).toHaveBeenCalledWith('\n');
  });

  it('writes special characters correctly', () => {
    print('line1\ttabbed');
    expect(writeSpy).toHaveBeenCalledWith('line1\ttabbed\n');
  });
});

// ─── printError ──────────────────────────────────────────────────────

describe('printError', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes Error instance message to stderr with prefix', () => {
    printError(new Error('something broke'));
    expect(writeSpy).toHaveBeenCalledWith('Error: something broke\n');
  });

  it('writes string error to stderr', () => {
    printError('plain string error');
    expect(writeSpy).toHaveBeenCalledWith('Error: plain string error\n');
  });

  it('writes non-Error object as string', () => {
    printError({ code: 404 });
    expect(writeSpy).toHaveBeenCalledWith('Error: [object Object]\n');
  });

  it('writes number error correctly', () => {
    printError(42);
    expect(writeSpy).toHaveBeenCalledWith('Error: 42\n');
  });
});

// ─── formatProgressBar ───────────────────────────────────────────────

describe('formatProgressBar', () => {
  it('returns all dots for 0%', () => {
    expect(formatProgressBar(0, 8)).toBe('........');
  });

  it('returns all hashes for 100%', () => {
    expect(formatProgressBar(100, 8)).toBe('########');
  });

  it('returns half filled for 50%', () => {
    expect(formatProgressBar(50, 8)).toBe('####....');
  });

  it('uses default width of 8', () => {
    const bar = formatProgressBar(0);
    expect(bar).toHaveLength(8);
  });

  it('respects custom width', () => {
    const bar = formatProgressBar(50, 20);
    expect(bar).toHaveLength(20);
    expect(bar).toBe('##########..........');
  });

  it('clamps values below 0 to 0', () => {
    expect(formatProgressBar(-10, 8)).toBe('........');
  });

  it('clamps values above 100 to 100', () => {
    expect(formatProgressBar(150, 8)).toBe('########');
  });

  it('handles width of 1', () => {
    expect(formatProgressBar(0, 1)).toBe('.');
    expect(formatProgressBar(100, 1)).toBe('#');
  });
});

// ─── formatTable ─────────────────────────────────────────────────────

describe('formatTable', () => {
  it('renders headers and a single row', () => {
    const result = formatTable(['Name', 'Status'], [['alice', 'active']]);
    expect(result).toContain('Name');
    expect(result).toContain('Status');
    expect(result).toContain('alice');
    expect(result).toContain('active');
  });

  it('includes separator line', () => {
    const result = formatTable(['A', 'B'], [['x', 'y']]);
    expect(result).toContain('-');
  });

  it('aligns columns by widest cell', () => {
    const result = formatTable(['ID', 'Description'], [
      ['1', 'Short'],
      ['2', 'A very long description'],
    ]);
    const lines = result.split('\n');
    // Each line should have same length (padded)
    expect(lines[0]!.length).toBe(lines[2]!.length);
  });

  it('handles empty rows', () => {
    const result = formatTable(['Col1', 'Col2'], []);
    expect(result).toContain('Col1');
    expect(result).toContain('Col2');
    expect(result.split('\n')).toHaveLength(2); // header + separator
  });

  it('handles single column', () => {
    const result = formatTable(['Item'], [['apple'], ['banana']]);
    expect(result).toContain('apple');
    expect(result).toContain('banana');
  });

  it('handles missing cells gracefully', () => {
    const result = formatTable(['A', 'B', 'C'], [['only-a']]);
    expect(result).toContain('only-a');
  });
});

// ─── formatDashboard ─────────────────────────────────────────────────

describe('formatDashboard', () => {
  it('renders sprint number', () => {
    const state = makeDashboard({ sprint: { id: 'sprint-007', number: 7, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE } });
    const result = formatDashboard(state);
    expect(result).toContain('Sprint 7');
  });

  it('renders progress info', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('2/5 done');
    expect(result).toContain('1 active');
  });

  it('renders usage percentages', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('30%');
    expect(result).toContain('45%');
  });

  it('renders alert count', () => {
    const state = makeDashboard({ alerts: [
      { level: 'WARNING' as never, message: 'test alert', timestamp: new Date().toISOString() }
    ]});
    const result = formatDashboard(state);
    expect(result).toContain('Alerts: 1');
  });

  it('includes unicode box-drawing characters', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('╔');
    expect(result).toContain('╗');
    expect(result).toContain('╚');
    expect(result).toContain('╝');
  });

  it('renders agent info when agents present', () => {
    const state = makeDashboard({
      agents: [{
        id: 'worker-1',
        role: 'worker' as AgentRole,
        status: AgentStatus.CODING,
        model: 'sonnet',
        tmuxWindow: 'w1',
        currentAction: 'writing code',
      }],
    });
    const result = formatDashboard(state);
    expect(result).toContain('WORKER-1');
    expect(result).toContain('CODE');
  });

  it('shows DONE agent with full progress bar', () => {
    const state = makeDashboard({
      agents: [{
        id: 'w2',
        role: 'worker' as AgentRole,
        status: AgentStatus.DONE,
        model: 'sonnet',
        tmuxWindow: 'w2',
      }],
    });
    const result = formatDashboard(state);
    expect(result).toContain('########');
  });

  it('shows IDLE agent with empty progress bar', () => {
    const state = makeDashboard({
      agents: [{
        id: 'w3',
        role: 'worker' as AgentRole,
        status: AgentStatus.IDLE,
        model: 'sonnet',
        tmuxWindow: 'w3',
      }],
    });
    const result = formatDashboard(state);
    expect(result).toContain('........');
  });

  it('uses --:-- when updatedAt is missing', () => {
    const state = makeDashboard({ updatedAt: '' });
    const result = formatDashboard(state);
    expect(result).toContain('--:--');
  });
});

// ─── formatDoctorResult ──────────────────────────────────────────────

describe('formatDoctorResult', () => {
  it('shows checkmark for passed checks', () => {
    const result = formatDoctorResult(makeDoctorResult());
    expect(result).toContain('[PASS]');
  });

  it('shows cross for failed checks', () => {
    const result = formatDoctorResult(makeDoctorResult({
      ok: false,
      checks: [
        { name: 'tmux', passed: false, message: 'not found', required: true },
      ],
    }));
    expect(result).toContain('[FAIL]');
  });

  it('shows pass count in summary', () => {
    const result = formatDoctorResult(makeDoctorResult());
    expect(result).toContain('2/2 checks passed');
  });

  it('shows failure count when checks fail', () => {
    const result = formatDoctorResult(makeDoctorResult({
      ok: false,
      checks: [
        { name: 'tmux', passed: true, message: 'ok', required: true },
        { name: 'claude', passed: false, message: 'not found', required: true },
      ],
    }));
    expect(result).toContain('1 failed');
    expect(result).toContain('1/2 checks passed');
  });

  it('includes check name and message', () => {
    const result = formatDoctorResult(makeDoctorResult());
    expect(result).toContain('tmux');
    expect(result).toContain('tmux 3.3a found');
  });

  it('handles empty checks array', () => {
    const result = formatDoctorResult({ ok: true, checks: [] });
    expect(result).toContain('0/0 checks passed');
  });
});

// ─── formatSprintSummary ─────────────────────────────────────────────

describe('formatSprintSummary', () => {
  it('includes sprint number and id', () => {
    const result = formatSprintSummary(makeSprint());
    expect(result).toContain('Sprint 1');
    expect(result).toContain('sprint-001');
  });

  it('includes sprint status', () => {
    const result = formatSprintSummary(makeSprint());
    expect(result).toContain('COMPLETE');
  });

  it('shows task count', () => {
    const sprint = makeSprint({ tasks: [{} as never, {} as never, {} as never] });
    const result = formatSprintSummary(sprint);
    expect(result).toContain('3 total');
  });

  it('shows metrics when present', () => {
    const sprint = makeSprint({
      metrics: {
        totalTasks: 5,
        completedTasks: 4,
        techDebtTasks: 1,
        noGoTasks: 0,
        durationMs: 120000,
        coveragePercent: 87.5,
        noGoRate: 0,
        newDebtCount: 1,
        resolvedDebtCount: 0,
        totalOpenDebt: 2,
        boundaryViolations: 0,
        crossAssignments: 0,
        contextLinesUsed: 100,
      },
    });
    const result = formatSprintSummary(sprint);
    expect(result).toContain('4/5');
    expect(result).toContain('87.5%');
    expect(result).toContain('120s');
    expect(result).toContain('Tech Debt: 1');
    expect(result).toContain('NO-GO: 0');
  });

  it('omits metrics section when metrics is undefined', () => {
    const sprint = makeSprint({ metrics: undefined });
    const result = formatSprintSummary(sprint);
    expect(result).not.toContain('Completed:');
    expect(result).not.toContain('Coverage:');
  });

  it('rounds duration to seconds', () => {
    const sprint = makeSprint({
      metrics: {
        totalTasks: 1,
        completedTasks: 1,
        techDebtTasks: 0,
        noGoTasks: 0,
        durationMs: 65500,
        coveragePercent: 90,
        noGoRate: 0,
        newDebtCount: 0,
        resolvedDebtCount: 0,
        totalOpenDebt: 0,
        boundaryViolations: 0,
        crossAssignments: 0,
        contextLinesUsed: 0,
      },
    });
    const result = formatSprintSummary(sprint);
    expect(result).toContain('66s');
  });
});
