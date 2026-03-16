import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  print,
  printError,
  formatProgressBar,
  formatTable,
  formatDashboard,
  formatDoctorResult,
  formatSprintSummary,
} from '../../src/cli/helpers/output.js';
import { EXIT_CODES, handleCliError, resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { AgentStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { DashboardState, DoctorResult, Sprint, AgentInfo } from '../../src/core/types.js';

// ─── Output Tests ───────────────────────────────────────────────────

describe('print', () => {
  it('writes to stdout with newline', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    print('hello');
    expect(spy).toHaveBeenCalledWith('hello\n');
    spy.mockRestore();
  });
});

describe('printError', () => {
  it('writes Error message to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    printError(new Error('boom'));
    expect(spy).toHaveBeenCalledWith('Error: boom\n');
    spy.mockRestore();
  });

  it('converts non-Error to string', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    printError('string error');
    expect(spy).toHaveBeenCalledWith('Error: string error\n');
    spy.mockRestore();
  });
});

// ─── Progress Bar Tests ─────────────────────────────────────────────

describe('formatProgressBar', () => {
  it('returns all dots at 0%', () => {
    expect(formatProgressBar(0)).toBe('........');
  });

  it('returns all hashes at 100%', () => {
    expect(formatProgressBar(100)).toBe('########');
  });

  it('returns half-filled at 50%', () => {
    expect(formatProgressBar(50)).toBe('####....');
  });

  it('clamps negative values', () => {
    expect(formatProgressBar(-10)).toBe('........');
  });

  it('clamps values over 100', () => {
    expect(formatProgressBar(200)).toBe('########');
  });

  it('respects custom width', () => {
    expect(formatProgressBar(50, 4)).toBe('##..');
  });
});

// ─── Table Tests ────────────────────────────────────────────────────

describe('formatTable', () => {
  it('formats headers and rows with padding', () => {
    const result = formatTable(['A', 'B'], [['1', '22'], ['333', '4']]);
    const lines = result.split('\n');
    expect(lines.length).toBe(4); // header + sep + 2 rows
    expect(lines[1]).toContain('-');
  });

  it('handles empty rows', () => {
    const result = formatTable(['X'], []);
    const lines = result.split('\n');
    expect(lines.length).toBe(2); // header + sep
  });
});

// ─── Dashboard Tests ────────────────────────────────────────────────

function makeDashboard(overrides?: Partial<DashboardState>): DashboardState {
  return {
    sprint: { id: 's-001', number: 3, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [
      {
        id: 'brain', role: 'brain', status: AgentStatus.IDLE,
        model: 'opus', tmuxWindow: 'brain', currentAction: 'Next: evaluation',
      } as AgentInfo,
      {
        id: 'w-001', role: 'worker', status: AgentStatus.CODING,
        model: 'sonnet', tmuxWindow: 'w-001', currentAction: 'src/core/engine.ts',
      } as AgentInfo,
    ],
    progress: { done: 1, active: 2, blocked: 0, total: 3 },
    usage: { fiveHourPercent: 0.05, weeklyPercent: 0, measuredAt: '2026-03-16T15:42:00Z' },
    alerts: [],
    updatedAt: '2026-03-16T15:42:00Z',
    ...overrides,
  };
}

describe('formatDashboard', () => {
  it('contains box-drawing characters', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('\u2554');
    expect(result).toContain('\u2557');
    expect(result).toContain('\u255A');
    expect(result).toContain('\u255D');
  });

  it('shows sprint number in title', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('Sprint 3');
  });

  it('shows agent lines', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('BRAIN');
    expect(result).toContain('W-001');
  });

  it('shows progress line', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('1/3 done');
    expect(result).toContain('2 active');
  });

  it('handles empty agent list', () => {
    const result = formatDashboard(makeDashboard({ agents: [] }));
    expect(result).toContain('Sprint 3');
    // No agent lines, but structure is intact
    expect(result).toContain('Progress:');
  });

  it('shows usage metrics', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('5hr 5%');
    expect(result).toContain('Weekly 0%');
  });

  it('shows alert count', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('Alerts: 0');
  });
});

// ─── Doctor Result Tests ────────────────────────────────────────────

describe('formatDoctorResult', () => {
  it('shows check marks for passing checks', () => {
    const result: DoctorResult = {
      ok: true,
      checks: [
        { name: 'Node.js', passed: true, message: 'v22.0.0 (>=18 required)', required: true },
      ],
    };
    const output = formatDoctorResult(result);
    expect(output).toContain('\u2713');
    expect(output).toContain('Node.js');
    expect(output).toContain('1/1 checks passed');
  });

  it('shows X marks for failing checks', () => {
    const result: DoctorResult = {
      ok: false,
      checks: [
        { name: 'tmux', passed: false, message: 'not found', required: true },
      ],
    };
    const output = formatDoctorResult(result);
    expect(output).toContain('\u2717');
    expect(output).toContain('1 failed');
  });

  it('shows correct summary with mixed results', () => {
    const result: DoctorResult = {
      ok: false,
      checks: [
        { name: 'Node.js', passed: true, message: 'v22', required: true },
        { name: 'git', passed: true, message: 'v2.44', required: true },
        { name: 'tmux', passed: false, message: 'not found', required: true },
        { name: 'Claude CLI', passed: true, message: 'v1.0', required: true },
      ],
    };
    const output = formatDoctorResult(result);
    expect(output).toContain('3/4 checks passed (1 failed)');
  });
});

// ─── Sprint Summary Tests ───────────────────────────────────────────

describe('formatSprintSummary', () => {
  it('shows basic sprint info', () => {
    const sprint: Sprint = {
      id: 's-001', number: 1, status: SprintStatus.COMPLETE,
      phase: SprintPhase.COMPLETE, tasks: [], workers: [],
    };
    const output = formatSprintSummary(sprint);
    expect(output).toContain('Sprint 1');
    expect(output).toContain('s-001');
    expect(output).toContain('COMPLETE');
  });

  it('shows metrics when available', () => {
    const sprint: Sprint = {
      id: 's-002', number: 2, status: SprintStatus.COMPLETE,
      phase: SprintPhase.COMPLETE, tasks: [], workers: [],
      metrics: {
        totalTasks: 5, completedTasks: 4, techDebtTasks: 1, noGoTasks: 0,
        durationMs: 60000, coveragePercent: 91.5, noGoRate: 0,
        newDebtCount: 1, resolvedDebtCount: 0, totalOpenDebt: 1,
        boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
      },
    };
    const output = formatSprintSummary(sprint);
    expect(output).toContain('4/5');
    expect(output).toContain('91.5%');
    expect(output).toContain('60s');
  });
});

// ─── Process Helper Tests ───────────────────────────────────────────

describe('EXIT_CODES', () => {
  it('has correct values', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
    expect(EXIT_CODES.ERROR).toBe(1);
    expect(EXIT_CODES.USAGE_ERROR).toBe(2);
  });
});

describe('handleCliError', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('prints error and sets exit code', () => {
    handleCliError(new Error('test'));
    expect(stderrSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('resolveProjectRoot', () => {
  it('returns current working directory', () => {
    expect(resolveProjectRoot()).toBe(process.cwd());
  });
});
