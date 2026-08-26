import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatRichSprintSummary,
  formatDuration,
  type RichSprintInput,
  type AgentPerfEntry,
} from '../../../src/cli/helpers/sprint-summary-rich.js';
import { formatRichSprintSummary as formatRichSprintSummary__tsm_012, formatDuration as formatDuration__tsm_012, type RichSprintInput as RichSprintInput__tsm_012, type AgentPerfEntry as AgentPerfEntry__tsm_012, type TaskTableRow, type RichSummaryOpts } from "../../../src/cli/helpers/sprint-summary-rich.js";

// ─── Helpers ────────────────────────────────────────────────────────

function makeSprint(overrides?: Partial<RichSprintInput>): RichSprintInput {
  return {
    id: 'sprint-042',
    number: 42,
    tasks: [
      { id: '042-001', title: 'Task A' },
      { id: '042-002', title: 'Task B' },
      { id: '042-003', title: 'Task C' },
    ],
    metrics: {
      totalTasks: 3,
      completedTasks: 2,
      techDebtTasks: 0,
      noGoTasks: 1,
      durationMs: 150_000,
      coveragePercent: 72.5,
    },
    startedAt: '2026-03-24T10:00:00Z',
    completedAt: '2026-03-24T10:02:30Z',
    ...overrides,
  };
}

function makeEvals(done: string[], debt: string[], nogo: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const id of done) m.set(id, 'DONE');
  for (const id of debt) m.set(id, 'GO_WITH_TECH_DEBT');
  for (const id of nogo) m.set(id, 'NO_GO');
  return m;
}

/** Strip ANSI escape codes for assertion comparisons. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[\d+m/g, '');
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('formatRichSprintSummary', () => {
  const savedNoColor = process.env['NO_COLOR'];

  beforeEach(() => {
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    if (savedNoColor !== undefined) {
      process.env['NO_COLOR'] = savedNoColor;
    } else {
      delete process.env['NO_COLOR'];
    }
  });

  it('full output contains all 7 section headers', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['042-001'], ['042-002'], ['042-003']);
    const output = formatRichSprintSummary(sprint, evals, {
      gitDiff: ' src/a.ts | 10 +++++-----\n 1 file changed',
      agentPerf: [{ agentId: 'worker-1', totalTasks: 3, doneTasks: 2, successRate: 66.7 }],
      learnings: ['Learned something important'],
    });
    const plain = stripAnsi(output);

    expect(plain).toContain('Sprint #42 Complete');
    expect(plain).toContain('Results');
    expect(plain).toContain('Changes');
    expect(plain).toContain('Tests');
    expect(plain).toContain('Agent Performance');
    expect(plain).toContain('Learnings');
    expect(plain).toContain('Next Steps');
  });

  it('NO_COLOR produces clean text without ANSI codes', () => {
    process.env['NO_COLOR'] = '1';
    const sprint = makeSprint();
    const evals = makeEvals(['042-001'], [], []);
    const output = formatRichSprintSummary(sprint, evals);

    // Should not contain any ANSI escape sequences
    expect(output).not.toMatch(/\x1b\[/);
    expect(output).toContain('Sprint #42 Complete');
    expect(output).toContain('1 done');
  });

  // ─── R4-ISNOCOLOR faithful regression ─────────────────────────────
  // After collapsing onto the canonical superset isNoColor (output.ts),
  // this module now honors `--no-color` in argv too. The former env-only
  // copy IGNORED argv, so it would still emit ANSI here → pre-fix RED,
  // post-fix GREEN (verified via `git stash`).
  it('--no-color in argv produces clean text (superset SSOT — was RED pre-fix)', () => {
    const savedArgv = [...process.argv];
    delete process.env['NO_COLOR']; // env unset — only the argv trigger is active
    process.argv = ['node', 'deckent', '--no-color'];
    try {
      const sprint = makeSprint();
      const evals = makeEvals(['042-001'], [], []);
      const output = formatRichSprintSummary(sprint, evals);

      expect(output).not.toMatch(/\x1b\[/); // env-only impl FAILED this assertion
      expect(output).toContain('Sprint #42 Complete');
      expect(output).toContain('1 done');
    } finally {
      process.argv = savedArgv;
    }
  });

  it('quiet mode shows only results line', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['042-001'], ['042-002'], ['042-003']);
    const output = formatRichSprintSummary(sprint, evals, { outputMode: 'quiet' });
    const plain = stripAnsi(output);

    expect(plain).toContain('1 done');
    expect(plain).toContain('1 debt');
    expect(plain).toContain('1 no-go');
    // Should NOT contain other sections
    expect(plain).not.toContain('Sprint #42 Complete');
    expect(plain).not.toContain('Changes');
    expect(plain).not.toContain('Next Steps');
  });

  it('results counts are correct for done/debt/nogo', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a', 'b', 'c'], ['d'], ['e', 'f']);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('3 done');
    expect(plain).toContain('1 debt');
    expect(plain).toContain('2 no-go');
  });

  it('git diff truncation at 5 files', () => {
    const diffLines = Array.from({ length: 8 }, (_, i) =>
      ` src/file${i}.ts | ${i + 1} ${'+'  .repeat(i + 1)}`
    ).join('\n');
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals, { gitDiff: diffLines });
    const plain = stripAnsi(output);

    expect(plain).toContain('... 3 more files');
    // Should show exactly 5 file lines
    const fileMatches = plain.match(/src\/file\d\.ts/g);
    expect(fileMatches).toHaveLength(5);
  });

  it('empty sprint handles gracefully', () => {
    const sprint: RichSprintInput = { id: 'sprint-000', tasks: [] };
    const evals = new Map<string, string>();
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('0 done');
    expect(plain).toContain('0 debt');
    expect(plain).toContain('0 no-go');
    expect(plain).toContain('No file changes recorded');
    expect(plain).toContain('All tasks complete');
  });

  it('next steps include NO_GO fix suggestion when applicable', () => {
    const sprint = makeSprint();
    const evals = makeEvals([], [], ['042-003']);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('Fix 1 NO_GO task(s)');
    expect(plain).toContain('042-003');
  });

  it('duration formatted correctly from timestamps', () => {
    const sprint = makeSprint({
      startedAt: '2026-03-24T10:00:00Z',
      completedAt: '2026-03-24T11:05:00Z',
    });
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('1h 5m');
  });

  it('verbose mode includes task detail section', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['042-001'], ['042-002'], ['042-003']);
    const output = formatRichSprintSummary(sprint, evals, { outputMode: 'verbose' });
    const plain = stripAnsi(output);

    expect(plain).toContain('Task Detail');
    expect(plain).toContain('042-001: DONE');
    expect(plain).toContain('042-002: GO_WITH_TECH_DEBT');
    expect(plain).toContain('042-003: NO_GO');
  });

  it('agent performance table shows correct data', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const agents: AgentPerfEntry[] = [
      { agentId: 'worker-1', totalTasks: 5, doneTasks: 4, successRate: 80 },
      { agentId: 'worker-2', totalTasks: 3, doneTasks: 1, successRate: 33.3 },
    ];
    const output = formatRichSprintSummary(sprint, evals, { agentPerf: agents });
    const plain = stripAnsi(output);

    expect(plain).toContain('worker-1');
    expect(plain).toContain('worker-2');
    expect(plain).toContain('80%');
    expect(plain).toContain('33%');
  });

  it('learnings section renders up to 3 items with icons', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const learnings = [
      'Successfully migrated API',
      'No-go on provider X',
      'Tests improved coverage',
      'Fourth item should not appear',
    ];
    const output = formatRichSprintSummary(sprint, evals, { learnings });
    const plain = stripAnsi(output);

    expect(plain).toContain('Successfully migrated API');
    expect(plain).toContain('No-go on provider X');
    expect(plain).toContain('Tests improved coverage');
    expect(plain).not.toContain('Fourth item should not appear');
  });

  it('next steps suggest tech debt resolution', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], ['b', 'c'], []);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('Resolve 2 tech debt item(s)');
  });

  it('next steps suggest coverage improvement when below 80%', () => {
    const sprint = makeSprint({
      metrics: { totalTasks: 1, completedTasks: 1, coveragePercent: 55.3 },
    });
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('Improve test coverage from 55.3% to 80%+');
  });

  it('uses sprint id when number is not provided', () => {
    const sprint = makeSprint({ number: undefined });
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('Sprint #sprint-042 Complete');
  });

  it('no git diff shows placeholder', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('No file changes recorded');
  });
});

describe('formatDuration', () => {
  it('formats seconds correctly', () => {
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(150_000)).toBe('2m 30s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3_900_000)).toBe('1h 5m');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('handles negative values', () => {
    expect(formatDuration(-1000)).toBe('0s');
  });
});

// TSM-012: physically merged from tests/cli/sprint-summary-rich.test.ts.
{
// ─── Helpers ────────────────────────────────────────────────────────────────
function stripAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function makeSprint(overrides: Partial<RichSprintInput__tsm_012> = {}): RichSprintInput__tsm_012 {
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
            durationMs: 7200000,
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
        }
        else {
            delete process.env['NO_COLOR'];
        }
    });
    // ── Header section ───────────────────────────────────────────────────
    it('renders header with sprint number and duration', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals()));
        expect(output).toContain('Sprint #144');
        expect(output).toContain('2h 0m');
    });
    it('renders header with date from startedAt', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals()));
        expect(output).toContain('Sprint #144');
    });
    it('renders header using durationMs when no timestamps provided', () => {
        const sprint = makeSprint({
            startedAt: undefined,
            completedAt: undefined,
            metrics: { durationMs: 3600000 },
        });
        const output = stripAnsi(formatRichSprintSummary__tsm_012(sprint, makeEvals()));
        expect(output).toContain('1h 0m');
    });
    // ── Results section ─────────────────────────────────────────────────
    it('renders results with done/debt/no-go counts', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals()));
        expect(output).toContain('2 done');
        expect(output).toContain('1 debt');
        expect(output).toContain('1 no-go');
    });
    it('renders task table with task IDs and titles', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals(), makeOpts()));
        expect(output).toContain('t-001');
        expect(output).toContain('Init split');
        expect(output).toContain('t-004');
        expect(output).toContain('ADR fix');
    });
    it('shows TECH_DEBT status label instead of GO_WITH_TECH_DEBT', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals(), makeOpts()));
        expect(output).toContain('TECH_DEBT');
    });
    // ── Agent Performance section ────────────────────────────────────────
    it('renders agent performance with success rates', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals(), makeOpts()));
        expect(output).toContain('Agent Performance');
        expect(output).toContain('refactorer');
        expect(output).toContain('67%');
        expect(output).toContain('architect');
        expect(output).toContain('0%');
    });
    it('shows placeholder when no agent data provided', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals(), { agentPerf: [] }));
        expect(output).toContain('No agent data available');
    });
    // ── Next Steps section ──────────────────────────────────────────────
    it('auto-generates NO_GO fix next step', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals()));
        expect(output).toContain('Fix 1 NO_GO task(s)');
        expect(output).toContain('t-004');
    });
    it('auto-generates tech debt next step', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals()));
        expect(output).toContain('Resolve 1 tech debt item(s)');
    });
    it('auto-generates coverage next step when below 80%', () => {
        const sprint = makeSprint({ metrics: { coveragePercent: 60, totalTasks: 4 } });
        const output = stripAnsi(formatRichSprintSummary__tsm_012(sprint, makeEvals()));
        expect(output).toContain('Improve test coverage from 60.0% to 80%+');
    });
    it('shows "ready for next sprint" when all tasks done', () => {
        const evals = new Map([
            ['a', 'DONE'],
            ['b', 'DONE'],
        ]);
        const sprint = makeSprint({ metrics: { coveragePercent: 90, totalTasks: 2 } });
        const output = stripAnsi(formatRichSprintSummary__tsm_012(sprint, evals));
        expect(output).toContain('All tasks complete');
        expect(output).toContain('ready for next sprint');
    });
    // ── Learnings section ───────────────────────────────────────────────
    it('renders learnings when provided', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals(), makeOpts()));
        expect(output).toContain('Learnings');
        expect(output).toContain('Refactorer handled 3 tasks');
    });
    it('shows placeholder when no learnings', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals(), { learnings: [] }));
        expect(output).toContain('No learnings recorded');
    });
    // ── NO_COLOR support ──────────────────────────────────────────────────
    it('strips ANSI codes when NO_COLOR is set', () => {
        process.env['NO_COLOR'] = '1';
        const output = formatRichSprintSummary__tsm_012(makeSprint(), makeEvals());
        expect(output).not.toMatch(/\x1b\[[0-9;]*m/);
        expect(output).toContain('Sprint #144');
    });
    it('includes ANSI codes when NO_COLOR is not set', () => {
        delete process.env['NO_COLOR'];
        const output = formatRichSprintSummary__tsm_012(makeSprint(), makeEvals());
        expect(output).toMatch(/\x1b\[[0-9;]*m/);
    });
    // ── All sections present ─────────────────────────────────────────────
    it('produces output containing all section headers', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals(), makeOpts()));
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
        expect(formatDuration__tsm_012(3600000)).toBe('1h 0m');
        expect(formatDuration__tsm_012(7200000)).toBe('2h 0m');
        expect(formatDuration__tsm_012(5400000)).toBe('1h 30m');
    });
    it('formatDuration handles minutes and seconds', () => {
        expect(formatDuration__tsm_012(90000)).toBe('1m 30s');
        expect(formatDuration__tsm_012(60000)).toBe('1m 0s');
    });
    it('formatDuration handles seconds only', () => {
        expect(formatDuration__tsm_012(45000)).toBe('45s');
        expect(formatDuration__tsm_012(0)).toBe('0s');
    });
    // ── Empty tasks fallback ─────────────────────────────────────────────
    it('renders gracefully with empty evaluations', () => {
        const sprint = makeSprint({ tasks: [] });
        const evals = new Map<string, string>();
        const output = stripAnsi(formatRichSprintSummary__tsm_012(sprint, evals));
        expect(output).toContain('0 done');
        expect(output).toContain('0 debt');
        expect(output).toContain('0 no-go');
    });
    // ── Sprint without number ────────────────────────────────────────────
    it('handles sprint without number field', () => {
        const sprint = makeSprint({ number: undefined });
        const output = stripAnsi(formatRichSprintSummary__tsm_012(sprint, makeEvals()));
        expect(output).toContain('sprint-144');
    });
    // ── Quiet mode ────────────────────────────────────────────────────────
    it('quiet mode returns only results line', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals(), { outputMode: 'quiet' }));
        expect(output).toContain('2 done');
        expect(output).not.toContain('Sprint #144');
    });
    // ── Evaluation Summary section ──────────────────────────────────────
    it('renders evaluation summary counts', () => {
        const output = stripAnsi(formatRichSprintSummary__tsm_012(makeSprint(), makeEvals()));
        expect(output).toContain('Evaluation Summary');
        expect(output).toContain('GO (DONE):');
        expect(output).toContain('NO_GO:');
    });
});
}
