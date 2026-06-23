import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatRichSprintSummary,
  formatDuration,
  type RichSprintInput,
  type AgentPerfEntry,
} from '../../../src/cli/helpers/sprint-summary-rich.js';

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
