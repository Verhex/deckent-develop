import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

// B8: `deckent retro` reads the retrospective from memory.db `retro` entries.
const retroState = vi.hoisted(() => ({
  entries: [] as Array<{ content: string; sprint_num: number; sprint_id: string }>,
}));
vi.mock('../../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(() => ({
    getByType: (t: string) => (t === 'retro' ? retroState.entries : []),
    getById: (id: string) => retroState.entries.find(e => `retro-${e.sprint_id}` === id) ?? null,
    close: () => {},
  })),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { print } from '../../../src/cli/helpers/output.js';
import {
  registerRetro,
  parseRetroToRichSummary,
  formatRichSummary,
  computeRetroDelta,
} from '../../../src/cli/commands/retro.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerRetro(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

const TABLE_CONTENT = `# Sprint sprint-025
## Metrics
| Metric | Value |
|---|---|
| Total Tasks | 10 |
| Completed | 8 |
| No-Go | 1 |
| Tech Debt | 1 |
| Coverage | 92% |
| Duration | 5000ms |
`;

const EMPTY_RETRO = '';

// ─── Tests ───────────────────────────────────────────────────────────

describe('retro command rich output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retroState.entries = [];
    process.exitCode = undefined;
  });

  it('registers --raw and --compare options', () => {
    const program = new Command();
    registerRetro(program);
    const cmd = program.commands.find((c) => c.name() === 'retro');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some((o) => o.long === '--raw')).toBe(true);
    expect(cmd!.options.some((o) => o.long === '--compare')).toBe(true);
  });

  it('shows rich summary by default', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content: TABLE_CONTENT, sprint_num: 25, sprint_id: 'sprint-025' }];
    await runCommand(['retro']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Sprint Retrospective');
    expect(output).toContain('8/10 completed');
  });

  it('--raw flag shows raw content', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content: TABLE_CONTENT, sprint_num: 25, sprint_id: 'sprint-025' }];
    await runCommand(['retro', '--raw']);
    expect(print).toHaveBeenCalledWith(TABLE_CONTENT);
  });

  it('shows no retrospective message when no retro entry exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No retrospective found'));
  });

  it('shows no-retro message when the retro entry is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content: EMPTY_RETRO, sprint_num: 25, sprint_id: 'sprint-025' }];
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No retrospective found'));
  });

  it('--compare shows delta when a previous sprint retro exists', async () => {
    const prevContent = `# Sprint sprint-024
## Metrics
| Metric | Value |
|---|---|
| Total Tasks | 8 |
| Completed | 5 |
| No-Go | 2 |
| Tech Debt | 1 |
| Coverage | 85% |
| Duration | 4000ms |
`;
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [
      { content: prevContent, sprint_num: 24, sprint_id: 'sprint-024' },
      { content: TABLE_CONTENT, sprint_num: 25, sprint_id: 'sprint-025' },
    ];
    await runCommand(['retro', '--compare']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Delta from Previous Sprint');
  });

  it('--compare shows message when no previous sprint', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content: TABLE_CONTENT, sprint_num: 25, sprint_id: 'sprint-025' }];
    await runCommand(['retro', '--compare']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('No previous run found');
  });
});

describe('parseRetroToRichSummary', () => {
  it('parses table format correctly', () => {
    const summary = parseRetroToRichSummary(TABLE_CONTENT);
    expect(summary.sprintId).toBe('sprint-025');
    expect(summary.totalTasks).toBe(10);
    expect(summary.completed).toBe(8);
    expect(summary.noGo).toBe(1);
    expect(summary.techDebt).toBe(1);
    expect(summary.coverage).toBe('92%');
    expect(summary.duration).toBe('5000ms');
  });

  it('returns defaults for missing fields', () => {
    const summary = parseRetroToRichSummary('# Sprint unknown\nSome text');
    expect(summary.totalTasks).toBe(0);
    expect(summary.completed).toBe(0);
    expect(summary.noGo).toBe(0);
    expect(summary.coverage).toBe('-');
  });

  it('stores raw content', () => {
    const summary = parseRetroToRichSummary(TABLE_CONTENT);
    expect(summary.raw).toBe(TABLE_CONTENT);
  });
});

describe('formatRichSummary', () => {
  it('includes sprint id', () => {
    const summary = parseRetroToRichSummary(TABLE_CONTENT);
    const formatted = formatRichSummary(summary);
    expect(formatted).toContain('sprint-025');
  });

  it('calculates success rate', () => {
    const summary = parseRetroToRichSummary(TABLE_CONTENT);
    const formatted = formatRichSummary(summary);
    expect(formatted).toContain('80%'); // 8/10 = 80%
  });

  it('shows 0% success for zero tasks', () => {
    const summary = parseRetroToRichSummary('# Sprint x');
    const formatted = formatRichSummary(summary);
    expect(formatted).toContain('0% success');
  });
});

describe('computeRetroDelta', () => {
  it('computes positive delta', () => {
    const current = parseRetroToRichSummary(TABLE_CONTENT); // 8/10 = 80%
    const prev = parseRetroToRichSummary(`# Sprint prev
| Metric | Value |
|---|---|
| Total Tasks | 10 |
| Completed | 5 |
| No-Go | 3 |
| Tech Debt | 2 |
| Coverage | 80% |
| Duration | 3000ms |
`); // 5/10 = 50%
    const delta = computeRetroDelta(current, prev);
    expect(delta).toContain('+30%'); // 80% - 50%
    expect(delta).toContain('No-Go');
    expect(delta).toContain('Tech Debt');
  });

  it('computes negative delta', () => {
    const current = parseRetroToRichSummary(`# Sprint x
| Metric | Value |
|---|---|
| Total Tasks | 10 |
| Completed | 3 |
| No-Go | 5 |
| Tech Debt | 2 |
`);
    const prev = parseRetroToRichSummary(TABLE_CONTENT);
    const delta = computeRetroDelta(current, prev);
    expect(delta).toContain('-50%'); // 30% - 80%
  });
});
