import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  formatTable: vi.fn().mockImplementation((headers: string[], rows: string[][]) => {
    return [headers.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
  }),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { print } from '../../../src/cli/helpers/output.js';
import { registerHistory, formatDurationMs, parseSprintLog } from '../../../src/cli/commands/history.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerHistory(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('history command (isolated)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('registers history command', () => {
    const program = new Command();
    registerHistory(program);
    const cmd = program.commands.find(c => c.name() === 'history');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('run history');
  });

  it('shows message when sprints dir does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['history']);
    expect(print).toHaveBeenCalledWith('No run history found.');
  });

  it('shows message when sprints dir is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as any);
    await runCommand(['history']);
    expect(print).toHaveBeenCalledWith('No run history found.');
  });

  it('filters only sprint-*.md files', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md', 'sprint-002.md', 'notes.txt', '.gitkeep'] as any);
    vi.mocked(readFileSync).mockReturnValue('# sprint-001\n| Metric | Value |\n|---|---|\n| Total Tasks | 3 |\n| Completed | 3 |\n| No-Go | 0 |\n| Coverage | 90% |\n| Duration | 1000ms |');
    await runCommand(['history']);
    // readFileSync called for sprint-*.md files + usage files (try/catch handles parse error)
    const mdCalls = vi.mocked(readFileSync).mock.calls.filter((c) => String(c[0]).endsWith('.md'));
    expect(mdCalls).toHaveLength(2);
  });

  it('sorts sprint files numerically', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-003.md', 'sprint-001.md', 'sprint-002.md'] as any);
    const calls: string[] = [];
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      calls.push(String(path));
      return '# sprint\n| Metric | Value |\n|---|---|\n| Total Tasks | 1 |\n| Completed | 1 |\n| No-Go | 0 |\n| Coverage | 90% |\n| Duration | 1000ms |';
    });
    await runCommand(['history']);
    // Only md reads should be sorted numerically
    const mdCalls = calls.filter((c) => c.endsWith('.md'));
    expect(mdCalls[0]).toContain('sprint-001.md');
    expect(mdCalls[1]).toContain('sprint-002.md');
    expect(mdCalls[2]).toContain('sprint-003.md');
  });
});

describe('formatDurationMs', () => {
  it('formats ms to seconds', () => {
    expect(formatDurationMs('5000ms')).toBe('5s');
  });

  it('formats ms to minutes and seconds', () => {
    expect(formatDurationMs('125000ms')).toBe('2m 5s');
  });

  it('returns raw value for non-ms format', () => {
    expect(formatDurationMs('5s')).toBe('5s');
    expect(formatDurationMs('-')).toBe('-');
  });

  it('handles zero milliseconds', () => {
    expect(formatDurationMs('0ms')).toBe('0s');
  });

  it('formats large values', () => {
    expect(formatDurationMs('3600000ms')).toBe('60m 0s');
  });
});

describe('parseSprintLog', () => {
  it('parses standard table format', () => {
    const content = '# sprint-005\n\n## Metrics\n| Metric | Value |\n|---|---|\n| Total Tasks | 8 |\n| Completed | 7 |\n| Tech Debt | 1 |\n| No-Go | 1 |\n| Coverage | 92.5% |\n| Duration | 30000ms |';
    const record = parseSprintLog(content);
    expect(record.sprint).toBe('sprint-005');
    expect(record.tasks).toBe('8');
    expect(record.completed).toBe('7');
    expect(record.noGoRate).toBe('13%');
    expect(record.coverage).toBe('92.5%');
    expect(record.duration).toBe('30s');
  });

  it('returns Unknown for missing title', () => {
    const record = parseSprintLog('no title\n| Total Tasks | 2 |');
    expect(record.sprint).toBe('Unknown');
  });

  it('returns dash for missing fields', () => {
    const record = parseSprintLog('# Sprint X');
    expect(record.tasks).toBe('-');
    expect(record.completed).toBe('-');
    expect(record.coverage).toBe('-');
    expect(record.duration).toBe('-');
    expect(record.noGoRate).toBe('-');
  });

  it('calculates 0% no-go rate when total=0', () => {
    const content = '# sprint\n| Total Tasks | 0 |\n| No-Go | 0 |';
    const record = parseSprintLog(content);
    expect(record.noGoRate).toBe('0%');
  });

  it('falls back to non-table format', () => {
    const content = '# Legacy Sprint\nTasks: 5\nCoverage: 88%\nDuration: 45s';
    const record = parseSprintLog(content);
    expect(record.tasks).toBe('5');
    expect(record.coverage).toBe('88%');
    expect(record.duration).toBe('45s');
  });
});
