import { describe, it, expect } from 'vitest';
import {
  formatRichSprintSummary,
  type RichSprintInput,
  type TaskTableRow,
} from '../../src/cli/helpers/sprint-summary-rich.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Helpers ────────────────────────────────────────────────────────

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[\d+m/g, '');
}

function makeSprint(overrides?: Partial<RichSprintInput>): RichSprintInput {
  return {
    id: 'sprint-054',
    number: 54,
    tasks: [
      { id: '054-001', title: 'Task A' },
      { id: '054-002', title: 'Task B' },
    ],
    metrics: { totalTasks: 2, completedTasks: 1, noGoTasks: 1, coveragePercent: 75 },
    startedAt: '2026-03-25T09:00:00Z',
    completedAt: '2026-03-25T09:30:00Z',
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

// ─── Task Table Tests ────────────────────────────────────────────────

describe('Task Breakdown table', () => {
  it('renders task table header with column names', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['054-001'], [], ['054-002']);
    const taskRows: TaskTableRow[] = [
      { id: '054-001', title: 'Task A', status: 'DONE', agent: 'worker-1', durationMs: 60000 },
      { id: '054-002', title: 'Task B', status: 'NO_GO', agent: 'worker-2', durationMs: 30000 },
    ];
    const output = formatRichSprintSummary(sprint, evals, { taskRows });
    const plain = stripAnsi(output);

    expect(plain).toContain('Task Breakdown');
    expect(plain).toContain('ID');
    expect(plain).toContain('Title');
    expect(plain).toContain('Status');
    expect(plain).toContain('Agent');
    expect(plain).toContain('Duration');
  });

  it('renders task rows with correct data', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['054-001'], [], ['054-002']);
    const taskRows: TaskTableRow[] = [
      { id: '054-001', title: 'Task A', status: 'DONE', agent: 'worker-1', durationMs: 60000 },
      { id: '054-002', title: 'Task B', status: 'NO_GO', agent: 'worker-2', durationMs: 30000 },
    ];
    const output = formatRichSprintSummary(sprint, evals, { taskRows });
    const plain = stripAnsi(output);

    expect(plain).toContain('054-001');
    expect(plain).toContain('054-002');
    expect(plain).toContain('worker-1');
    expect(plain).toContain('worker-2');
    expect(plain).toContain('1m 0s');
  });

  it('falls back to evaluations map when taskRows not provided', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['054-001'], ['054-002'], []);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('Task Breakdown');
    expect(plain).toContain('054-001');
    expect(plain).toContain('054-002');
  });
});

// ─── Eval Counts Tests ───────────────────────────────────────────────

describe('Evaluation Summary counts', () => {
  it('shows GO (DONE), GO_WITH_TECH_DEBT, and NO_GO on separate lines', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a', 'b'], ['c'], ['d', 'e']);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).toContain('Evaluation Summary');
    expect(plain).toContain('GO (DONE):');
    expect(plain).toContain('GO_WITH_TECH_DEBT:');
    expect(plain).toContain('NO_GO:');
  });

  it('displays correct counts in evaluation summary', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a', 'b', 'c'], ['d', 'e'], ['f']);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    const lines = plain.split('\n');
    const doneLine = lines.find((l) => l.includes('GO (DONE):'));
    const debtLine = lines.find((l) => l.includes('GO_WITH_TECH_DEBT:'));
    const nogoLine = lines.find((l) => l.includes('NO_GO:'));

    expect(doneLine).toContain('3');
    expect(debtLine).toContain('2');
    expect(nogoLine).toContain('1');
  });
});

// ─── Config Migration Tests ──────────────────────────────────────────

describe('Config migration notice', () => {
  it('shows config migration section when configMigrated is true', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals, { configMigrated: true });
    const plain = stripAnsi(output);

    expect(plain).toContain('Config Migration');
    expect(plain).toContain('migrated to current version');
  });

  it('does NOT show config migration section when configMigrated is false', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals, { configMigrated: false });
    const plain = stripAnsi(output);

    expect(plain).not.toContain('Config Migration');
  });

  it('does NOT show config migration section when not provided', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).not.toContain('Config Migration');
  });
});

// ─── Brain Insights Tests ────────────────────────────────────────────

describe('Brain Insights section', () => {
  it('renders brain insights when provided', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const brainInsights = '- NO_GO rate was 0% this sprint\n- Coverage improved to 80%';
    const output = formatRichSprintSummary(sprint, evals, { brainInsights });
    const plain = stripAnsi(output);

    expect(plain).toContain('Brain Insights');
    expect(plain).toContain('NO_GO rate was 0% this sprint');
    expect(plain).toContain('Coverage improved to 80%');
  });

  it('does NOT render brain insights when not provided', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals);
    const plain = stripAnsi(output);

    expect(plain).not.toContain('Brain Insights');
  });

  it('does NOT render brain insights when empty string', () => {
    const sprint = makeSprint();
    const evals = makeEvals(['a'], [], []);
    const output = formatRichSprintSummary(sprint, evals, { brainInsights: '' });
    const plain = stripAnsi(output);

    expect(plain).not.toContain('Brain Insights');
  });
});

// ─── README Command Count Tests ──────────────────────────────────────

describe('README CLI command table', () => {
  const readmePath = resolve(process.cwd(), 'README.md');
  let readmeContent: string;

  try {
    readmeContent = readFileSync(readmePath, 'utf-8');
  } catch {
    readmeContent = '';
  }

  it('README contains at least 33 deckent commands in the command table', () => {
    // Count lines matching | `deckent ... pattern in the All Commands table
    const matches = readmeContent.match(/^\| `deckent /gm);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(33);
  });

  it('README contains explain command', () => {
    expect(readmeContent).toContain('deckent explain');
  });

  it('README contains quick-start command', () => {
    expect(readmeContent).toContain('deckent quick-start');
  });

  it('README contains skill command', () => {
    expect(readmeContent).toContain('deckent skill');
  });

  it('README contains skill-marketplace command', () => {
    expect(readmeContent).toContain('deckent skill-marketplace');
  });

  it('README contains agent command', () => {
    expect(readmeContent).toContain('deckent agent');
  });

  it('README contains review command', () => {
    expect(readmeContent).toContain('deckent review');
  });

  it('README contains config migrate command', () => {
    expect(readmeContent).toContain('deckent config migrate');
  });
});
