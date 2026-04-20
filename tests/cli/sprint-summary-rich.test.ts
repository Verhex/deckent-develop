import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatRichSprintSummary,
  formatDuration,
  type RichSprintInput,
  type AgentPerfEntry,
  type TaskTableRow,
  type RichSummaryOpts,
} from '../../src/cli/helpers/sprint-summary-rich.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function makeSprint(overrides: Partial<RichSprintInput> = {}): RichSprintInput {
  return {
    id: 'sprint-144',
    number: 144,
    startedAt: '2026-04-17T08:00:00.000Z',
    completedAt: '2026-04-17T10:00:00.000Z',
    tasks: [
      { id: 't-001', title: 'Init split', status: 'DONE' },
      { id: 't-002', title: 'Doctor split', status: 'DONE' },
      { id: 't-003', title: 'Dead code', status: 'GO_WITH_TECH_DEBT' },
      { id: 't-004', title: 'ADR fix', status: 'NO_GO' },
    ],
    metrics: {
      totalTasks: 4,
      completedTasks: 2,
      techDebtTasks: 1,
      noGoTasks: 1,
      durationMs: 7_200_000,
      coveragePercent: 75.5,
    },
    ...overrides,
  };
}

function makeEvals(): Map<string, string> {
  return new Map([
    ['t-001', 'DONE'],
    ['t-002', 'DONE'],
    ['t-003', 'GO_WITH_TECH_DEBT'],
    ['t-004', 'NO_GO'],
  ]);
}

function makeOpts(overrides: Partial<RichSummaryOpts> = {}): RichSummaryOpts {
  return {
    agentPerf: [
      { agentId: 'refactorer', totalTasks: 3, doneTasks: 2, successRate: 67 },
      { agentId: 'architect', totalTasks: 1, doneTasks: 0, successRate: 0 },
    ],
    taskRows: [
      { id: 't-001', title: 'Init split', status: 'DONE', agent: 'refactorer' },
      { id: 't-002', title: 'Doctor split', status: 'DONE', agent: 'refactorer' },
      { id: 't-003', title: 'Dead code', status: 'GO_WITH_TECH_DEBT', agent: 'refactorer' },
      { id: 't-004', title: 'ADR fix', status: 'NO_GO', agent: 'architect' },
    ],
    learnings: ['Refactorer handled 3 tasks', 'NO_GO on ADR fix'],
    ...overrides,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('formatRichSprintSummary — ADR-020 rich summary', () => {
  let savedNoColor: string | undefined;

  beforeEach(() => {
    savedNoColor = process.env['NO_COLOR'];
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    if (savedNoColor !== undefined) {
      process.env['NO_COLOR'] = savedNoColor;
    } else {
      delete process.env['NO_COLOR'];
    }
  });

  // ── Header section ───────────────────────────────────────────────────

  it('renders header with sprint number and duration', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals()));
    expect(output).toContain('Sprint #144');
    expect(output).toContain('2h 0m');
  });

  it('renders header with date from startedAt', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals()));
    expect(output).toContain('Sprint #144');
  });

  it('renders header using durationMs when no timestamps provided', () => {
    const sprint = makeSprint({
      startedAt: undefined,
      completedAt: undefined,
      metrics: { durationMs: 3600_000 },
    });
    const output = stripAnsi(formatRichSprintSummary(sprint, makeEvals()));
    expect(output).toContain('1h 0m');
  });

  // ── Results section ─────────────────────────────────────────────────

  it('renders results with done/debt/no-go counts', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals()));
    expect(output).toContain('2 done');
    expect(output).toContain('1 debt');
    expect(output).toContain('1 no-go');
  });

  it('renders task table with task IDs and titles', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals(), makeOpts()));
    expect(output).toContain('t-001');
    expect(output).toContain('Init split');
    expect(output).toContain('t-004');
    expect(output).toContain('ADR fix');
  });

  it('shows TECH_DEBT status label instead of GO_WITH_TECH_DEBT', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals(), makeOpts()));
    expect(output).toContain('TECH_DEBT');
  });

  // ── Agent Performance section ────────────────────────────────────────

  it('renders agent performance with success rates', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals(), makeOpts()));
    expect(output).toContain('Agent Performance');
    expect(output).toContain('refactorer');
    expect(output).toContain('67%');
    expect(output).toContain('architect');
    expect(output).toContain('0%');
  });

  it('shows placeholder when no agent data provided', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals(), { agentPerf: [] }));
    expect(output).toContain('No agent data available');
  });

  // ── Next Steps section ──────────────────────────────────────────────

  it('auto-generates NO_GO fix next step', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals()));
    expect(output).toContain('Fix 1 NO_GO task(s)');
    expect(output).toContain('t-004');
  });

  it('auto-generates tech debt next step', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals()));
    expect(output).toContain('Resolve 1 tech debt item(s)');
  });

  it('auto-generates coverage next step when below 80%', () => {
    const sprint = makeSprint({ metrics: { coveragePercent: 60, totalTasks: 4 } });
    const output = stripAnsi(formatRichSprintSummary(sprint, makeEvals()));
    expect(output).toContain('Improve test coverage from 60.0% to 80%+');
  });

  it('shows "ready for next sprint" when all tasks done', () => {
    const evals = new Map([
      ['a', 'DONE'],
      ['b', 'DONE'],
    ]);
    const sprint = makeSprint({ metrics: { coveragePercent: 90, totalTasks: 2 } });
    const output = stripAnsi(formatRichSprintSummary(sprint, evals));
    expect(output).toContain('All tasks complete');
    expect(output).toContain('ready for next sprint');
  });

  // ── Learnings section ───────────────────────────────────────────────

  it('renders learnings when provided', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals(), makeOpts()));
    expect(output).toContain('Learnings');
    expect(output).toContain('Refactorer handled 3 tasks');
  });

  it('shows placeholder when no learnings', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals(), { learnings: [] }));
    expect(output).toContain('No learnings recorded');
  });

  // ── NO_COLOR support ──────────────────────────────────────────────────

  it('strips ANSI codes when NO_COLOR is set', () => {
    process.env['NO_COLOR'] = '1';
    const output = formatRichSprintSummary(makeSprint(), makeEvals());
    expect(output).not.toMatch(/\x1b\[[0-9;]*m/);
    expect(output).toContain('Sprint #144');
  });

  it('includes ANSI codes when NO_COLOR is not set', () => {
    delete process.env['NO_COLOR'];
    const output = formatRichSprintSummary(makeSprint(), makeEvals());
    expect(output).toMatch(/\x1b\[[0-9;]*m/);
  });

  // ── All sections present ─────────────────────────────────────────────

  it('produces output containing all section headers', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals(), makeOpts()));
    expect(output).toContain('Sprint #144');
    expect(output).toContain('Results');
    expect(output).toContain('Evaluation Summary');
    expect(output).toContain('Task Breakdown');
    expect(output).toContain('Agent Performance');
    expect(output).toContain('Learnings');
    expect(output).toContain('Next Steps');
  });

  // ── formatDuration helper ────────────────────────────────────────────

  it('formatDuration handles hours and minutes', () => {
    expect(formatDuration(3_600_000)).toBe('1h 0m');
    expect(formatDuration(7_200_000)).toBe('2h 0m');
    expect(formatDuration(5_400_000)).toBe('1h 30m');
  });

  it('formatDuration handles minutes and seconds', () => {
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(60_000)).toBe('1m 0s');
  });

  it('formatDuration handles seconds only', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(0)).toBe('0s');
  });

  // ── Empty tasks fallback ─────────────────────────────────────────────

  it('renders gracefully with empty evaluations', () => {
    const sprint = makeSprint({ tasks: [] });
    const evals = new Map<string, string>();
    const output = stripAnsi(formatRichSprintSummary(sprint, evals));
    expect(output).toContain('0 done');
    expect(output).toContain('0 debt');
    expect(output).toContain('0 no-go');
  });

  // ── Sprint without number ────────────────────────────────────────────

  it('handles sprint without number field', () => {
    const sprint = makeSprint({ number: undefined });
    const output = stripAnsi(formatRichSprintSummary(sprint, makeEvals()));
    expect(output).toContain('sprint-144');
  });

  // ── Quiet mode ────────────────────────────────────────────────────────

  it('quiet mode returns only results line', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals(), { outputMode: 'quiet' }));
    expect(output).toContain('2 done');
    expect(output).not.toContain('Sprint #144');
  });

  // ── Evaluation Summary section ──────────────────────────────────────

  it('renders evaluation summary counts', () => {
    const output = stripAnsi(formatRichSprintSummary(makeSprint(), makeEvals()));
    expect(output).toContain('Evaluation Summary');
    expect(output).toContain('GO (DONE):');
    expect(output).toContain('NO_GO:');
  });
});
