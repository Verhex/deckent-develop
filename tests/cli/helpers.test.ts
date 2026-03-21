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

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

import { createInterface } from 'node:readline/promises';
import { promptText, promptSelect, promptConfirm } from '../../src/cli/helpers/prompt.js';

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

  it('handles rows with fewer cells than headers (uses empty string)', () => {
    // triggers `r[i] ?? ''` and `c ?? ''` fallback branches
    const result = formatTable(['A', 'B', 'C'], [['1'] as string[]]);
    expect(result).toContain('A');
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
    usage: { fiveHourPercent: 5, weeklyPercent: 0, measuredAt: '2026-03-16T15:42:00Z' },
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

  it('displays percent values correctly without *100 multiplication (2C)', () => {
    const result = formatDashboard(makeDashboard({ usage: { fiveHourPercent: 50, weeklyPercent: 30, measuredAt: '2026-03-17T00:00:00Z' } }));
    expect(result).toContain('5hr 50%');
    expect(result).toContain('Weekly 30%');
    // Old bug: 50 * 100 = 5000% — should not happen
    expect(result).not.toContain('5000%');
    expect(result).not.toContain('3000%');
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
    expect(output).toContain('[PASS]');
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
    expect(output).toContain('[FAIL]');
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

// ─── Dashboard Edge Cases ────────────────────────────────────────────

describe('formatDashboard edge cases', () => {
  it('shows --:-- when updatedAt is undefined', () => {
    const state = makeDashboard({ updatedAt: undefined });
    const result = formatDashboard(state);
    expect(result).toContain('--:--');
  });

  it('uses phaseLabel when agent has no currentAction', () => {
    const state = makeDashboard({
      agents: [{
        id: 'w-001', role: 'worker', status: AgentStatus.CODING,
        model: 'sonnet', tmuxWindow: 'w-001', currentAction: undefined,
      } as AgentInfo],
    });
    const result = formatDashboard(state);
    expect(result).toContain('Next:');
  });

  it('shows DONE progress bar for DONE agent', () => {
    const state = makeDashboard({
      agents: [{
        id: 'w-001', role: 'worker', status: AgentStatus.DONE,
        model: 'sonnet', tmuxWindow: 'w-001', currentAction: 'finished',
      } as AgentInfo],
    });
    const result = formatDashboard(state);
    expect(result).toContain('DONE');
  });

  it('shows IDLE progress bar for IDLE agent', () => {
    const state = makeDashboard({
      agents: [{
        id: 'w-001', role: 'worker', status: AgentStatus.IDLE,
        model: 'sonnet', tmuxWindow: 'w-001', currentAction: 'waiting',
      } as AgentInfo],
    });
    const result = formatDashboard(state);
    expect(result).toContain('IDLE');
  });

  it('slices content when agent line exceeds column width', () => {
    // triggers padRight str.length >= len branch
    const state = makeDashboard({
      agents: [{
        id: 'very-long-agent-id-xyz', role: 'worker', status: AgentStatus.CODING,
        model: 'sonnet', tmuxWindow: 'w-001',
        currentAction: 'a'.repeat(60),
      } as AgentInfo],
    });
    const result = formatDashboard(state);
    expect(result).toContain('║');
  });

  it('falls back to unknown status tag', () => {
    // triggers statusTag map[status] ?? fallback branch
    const state = makeDashboard({
      agents: [{
        id: 'w-001', role: 'worker', status: 'UNKNOWN_STATUS' as AgentStatus,
        model: 'sonnet', tmuxWindow: 'w-001', currentAction: 'test',
      } as AgentInfo],
    });
    const result = formatDashboard(state);
    expect(result).toContain('UNKN');
  });
});

// ─── Prompt Helper Tests ─────────────────────────────────────────────

describe('promptText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns trimmed answer when provided', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue('  myAnswer  '),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptText('Enter name');
    expect(result).toBe('myAnswer');
  });

  it('returns default when answer is empty', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue(''),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptText('Enter name', 'defaultVal');
    expect(result).toBe('defaultVal');
  });

  it('returns empty string when empty and no default', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue(''),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptText('Enter name');
    expect(result).toBe('');
  });

  it('appends default suffix to question', async () => {
    const mockQuestion = vi.fn().mockResolvedValue('answer');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    await promptText('Enter name', 'myDefault');
    expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining('myDefault'));
  });
});

describe('promptSelect', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('returns selected value for valid input', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue('2'),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptSelect('Pick one', [
      { label: 'Option A', value: 'a' as const },
      { label: 'Option B', value: 'b' as const },
    ]);
    expect(result).toBe('b');
  });

  it('retries on invalid input then accepts valid', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('5')   // out of range
      .mockResolvedValueOnce('0')   // out of range (idx = -1)
      .mockResolvedValueOnce('1');  // valid
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptSelect('Pick one', [
      { label: 'Option A', value: 'a' as const },
    ]);
    expect(result).toBe('a');
    expect(mockQuestion).toHaveBeenCalledTimes(3);
  });

  it('prints options list', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue('1'),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    await promptSelect('Pick one', [{ label: 'Alpha', value: 'alpha' as const }]);
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Alpha');
  });
});

describe('promptConfirm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true for "y"', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue('y'),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptConfirm('Continue?');
    expect(result).toBe(true);
  });

  it('returns true for "yes" (case insensitive)', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue('YES'),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptConfirm('Continue?');
    expect(result).toBe(true);
  });

  it('returns false for "n"', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue('n'),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptConfirm('Continue?');
    expect(result).toBe(false);
  });

  it('returns default true for empty answer', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue(''),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptConfirm('Continue?', true);
    expect(result).toBe(true);
  });

  it('returns default false for empty answer', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue(''),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    const result = await promptConfirm('Continue?', false);
    expect(result).toBe(false);
  });

  it('shows Y/n hint when default is true', async () => {
    const mockQuestion = vi.fn().mockResolvedValue('y');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    await promptConfirm('Continue?', true);
    expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining('Y/n'));
  });

  it('shows y/N hint when default is false', async () => {
    const mockQuestion = vi.fn().mockResolvedValue('n');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    await promptConfirm('Continue?', false);
    expect(mockQuestion).toHaveBeenCalledWith(expect.stringContaining('y/N'));
  });
});
