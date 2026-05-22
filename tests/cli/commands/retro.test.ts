import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('../../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

// B8: `deckent retro` reads the retrospective from memory.db (`retro` entries),
// not the legacy `.brain/RETRO.md` file. Mock MemoryStore so tests can feed
// retro content via `retroState.entries`.
const retroState = vi.hoisted(() => ({
  entries: [] as Array<{ content: string; sprint_num: number; sprint_id: string }>,
}));

vi.mock('../../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(() => ({
    getByType: (type: string) => (type === 'retro' ? retroState.entries : []),
    getById: (id: string) => retroState.entries.find(e => `retro-${e.sprint_id}` === id) ?? null,
    close: () => {},
  })),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { print } from '../../../src/cli/helpers/output.js';
import { getLangFromConfig } from '../../../src/cli/helpers/config-reader.js';
import {
  registerRetro,
  parseRetroToRichSummary,
  formatRichSummary,
  computeRetroDelta,
  parseAgentPerformanceFromRetro,
  parseSkillPerformanceFromRetro,
  formatAgentPerfTable,
  formatSkillPerfTable,
  formatTrend,
  loadSprintTrend,
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

// ─── Tests ───────────────────────────────────────────────────────────

describe('retro command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLangFromConfig).mockReturnValue('en');
    retroState.entries = [];
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers retro command', () => {
    const program = new Command();
    registerRetro(program);
    const cmd = program.commands.find(c => c.name() === 'retro');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('retrospective');
  });

  it('prints message when retrospective file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No retrospective found'));
  });

  it('prints retrospective content when a retro entry exists', async () => {
    const content = '## Sprint 001\n- Task completed\n- Results: DONE';
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content, sprint_num: 1, sprint_id: 'sprint-001' }];
    await runCommand(['retro']);
    // Now shows rich summary by default (use --raw for original content)
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Sprint Retrospective'));
  });

  it('prints raw content with --raw flag', async () => {
    const content = '## Sprint 001\n- Task completed\n- Results: DONE';
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content, sprint_num: 1, sprint_id: 'sprint-001' }];
    await runCommand(['retro', '--raw']);
    expect(print).toHaveBeenCalledWith(content);
  });

  it('prints no-retro message when the retro entry is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content: '', sprint_num: 1, sprint_id: 'sprint-001' }];
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No retrospective found'));
  });

  it('prints no-retro message when the retro entry is only whitespace', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content: '   \n  \n  ', sprint_num: 1, sprint_id: 'sprint-001' }];
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No retrospective found'));
  });

  it('resolves project root and constructs correct path', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['retro']);
    expect(existsSync).toHaveBeenCalledWith(expect.stringContaining('/mock/root'));
  });

  it('does not exit with error code on success', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('## Retro');
    await runCommand(['retro']);
    expect(process.exitCode).not.toBe(1);
  });

  // (A) Language support
  it('uses Turkish labels when language is tr', async () => {
    vi.mocked(getLangFromConfig).mockReturnValue('tr');
    const content = '# Sprint sprint-042\n| Tasks completed | 8/10 |\n';
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content, sprint_num: 42, sprint_id: 'sprint-042' }];
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Retrospektifi'));
  });

  // (B) --trend flag
  it('shows trend when --trend flag is passed', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md', 'sprint-002.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# sprint-001\n| Tasks completed | 5/10 |');
    await runCommand(['retro', '--trend']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Sprint Trend'));
  });

  // (B) --trend with noSprintsDir
  it('shows no trend message when no sprints dir', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['retro', '--trend']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('enough sprint'));
  });

  // (C) --perf flag shows agent performance
  it('shows agent performance with --perf flag', async () => {
    const content = `# Sprint sprint-056 Retrospective\n\n## Agent Performance\n| Agent | Tasks | Done | Debt | NoGo | Avg Coverage |\n|-------|-------|------|------|------|--------------|\n| worker-1 | 5 | 4 | 1 | 0 | 80% |\n`;
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content, sprint_num: 56, sprint_id: 'sprint-056' }];
    await runCommand(['retro', '--perf']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(s => typeof s === 'string' && s.includes('Agent Performance'))).toBe(true);
  });

  // (C) --perf with --json includes performance data
  it('includes agent/skill performance in JSON when --json --perf', async () => {
    const content = `# Sprint sprint-056\n## Agent Performance\n| Agent | Tasks | Done | Debt | NoGo | Avg Coverage |\n|-------|-------|------|------|------|--------------|\n| worker-1 | 5 | 4 | 1 | 0 | 80% |\n`;
    vi.mocked(existsSync).mockReturnValue(true);
    retroState.entries = [{ content, sprint_num: 56, sprint_id: 'sprint-056' }];
    await runCommand(['retro', '--json', '--perf']);
    const jsonCall = vi.mocked(print).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(jsonCall);
    expect(parsed.agentPerformance).toBeDefined();
    expect(Array.isArray(parsed.agentPerformance)).toBe(true);
  });
});

// ─── Unit Tests: parsers and formatters ──────────────────────────────

describe('parseRetroToRichSummary', () => {
  it('parses tasks completed format', () => {
    const content = '# Sprint sprint-042 Retrospective\n| Tasks completed | 8/10 |';
    const s = parseRetroToRichSummary(content);
    expect(s.completed).toBe(8);
    expect(s.totalTasks).toBe(10);
  });

  it('parses NO_GO rate format', () => {
    const content = '| NO_GO rate | 20% (2/10) |';
    const s = parseRetroToRichSummary(content);
    expect(s.noGo).toBe(2);
  });

  it('falls back to legacy Total Tasks format', () => {
    const content = '| Total Tasks | 5 |\n| Completed | 3 |';
    const s = parseRetroToRichSummary(content);
    expect(s.totalTasks).toBe(5);
    expect(s.completed).toBe(3);
  });
});

describe('formatRichSummary', () => {
  it('shows English labels by default', () => {
    const summary = { sprintId: '042', totalTasks: 10, completed: 8, noGo: 1, techDebt: 1, coverage: '80%', duration: '5m', raw: '' };
    const out = formatRichSummary(summary);
    expect(out).toContain('Sprint Retrospective');
    expect(out).toContain('Tasks');
  });

  it('shows Turkish labels when lang=tr', () => {
    const summary = { sprintId: '042', totalTasks: 10, completed: 8, noGo: 1, techDebt: 1, coverage: '80%', duration: '5m', raw: '' };
    const out = formatRichSummary(summary, 'tr');
    expect(out).toContain('Retrospektifi');
    expect(out).toContain('tamamlandı');
  });
});

describe('computeRetroDelta', () => {
  it('shows Turkish labels when lang=tr', () => {
    const s1 = { sprintId: '042', totalTasks: 10, completed: 8, noGo: 1, techDebt: 1, coverage: '80%', duration: '5m', raw: '' };
    const s2 = { sprintId: '041', totalTasks: 10, completed: 6, noGo: 2, techDebt: 2, coverage: '70%', duration: '6m', raw: '' };
    const out = computeRetroDelta(s1, s2, 'tr');
    expect(out).toContain('Fark');
    expect(out).toContain('+20%');
  });
});

describe('parseAgentPerformanceFromRetro', () => {
  it('parses agent performance table', () => {
    const content = `## Agent Performance\n| Agent | Tasks | Done | Debt | NoGo | Avg Coverage |\n|-------|-------|------|------|------|--------------|\n| worker-1 | 5 | 4 | 1 | 0 | 80% |\n`;
    const rows = parseAgentPerformanceFromRetro(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.agent).toBe('worker-1');
    expect(rows[0]?.tasks).toBe('5');
  });

  it('returns empty array when no agent performance section', () => {
    const content = '# Sprint\n## Metrics\n| Tasks | 5 |';
    expect(parseAgentPerformanceFromRetro(content)).toHaveLength(0);
  });
});

describe('parseSkillPerformanceFromRetro', () => {
  it('parses skill performance table', () => {
    const content = `## Skill Performance\n| Skill | Tasks | Done | Debt | NoGo |\n|-------|-------|------|------|------|\n| testing-expert | 3 | 2 | 1 | 0 |\n`;
    const rows = parseSkillPerformanceFromRetro(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.skill).toBe('testing-expert');
  });
});

describe('formatAgentPerfTable', () => {
  it('returns empty string for empty rows', () => {
    expect(formatAgentPerfTable([])).toBe('');
  });

  it('shows Turkish title when lang=tr', () => {
    const rows = [{ agent: 'w1', tasks: '5', done: '4', debt: '1', noGo: '0', avgCoverage: '80%' }];
    const out = formatAgentPerfTable(rows, 'tr');
    expect(out).toContain('Ajan Performansı');
  });
});

describe('formatSkillPerfTable', () => {
  it('returns empty string for empty rows', () => {
    expect(formatSkillPerfTable([])).toBe('');
  });

  it('includes skill name in output', () => {
    const rows = [{ skill: 'testing-expert', tasks: '3', done: '2', debt: '1', noGo: '0' }];
    const out = formatSkillPerfTable(rows);
    expect(out).toContain('testing-expert');
  });
});

describe('formatTrend', () => {
  it('shows no trend message for empty entries', () => {
    const out = formatTrend([]);
    expect(out).toContain('enough sprint');
  });

  it('shows sprint trend entries', () => {
    const entries = [
      { sprintId: 'sprint-041', successRate: 80, noGo: 1, techDebt: 2, coverage: '75%' },
      { sprintId: 'sprint-042', successRate: 90, noGo: 0, techDebt: 1, coverage: '80%' },
    ];
    const out = formatTrend(entries);
    expect(out).toContain('Sprint Trend');
    expect(out).toContain('sprint-041');
    expect(out).toContain('90%');
  });

  it('shows Turkish title when lang=tr', () => {
    const entries = [{ sprintId: 'sprint-042', successRate: 90, noGo: 0, techDebt: 1, coverage: '80%' }];
    const out = formatTrend(entries, 'tr');
    expect(out).toContain('Sprint Trendi');
  });
});
