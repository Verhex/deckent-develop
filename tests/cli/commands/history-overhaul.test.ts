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
  formatTable: vi.fn().mockImplementation((headers: string[], rows: string[][]) => {
    return [headers.join('|'), ...rows.map((r) => r.join('|'))].join('\n');
  }),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { print } from '../../../src/cli/helpers/output.js';
import {
  registerHistory,
  parseSprintLog,
} from '../../../src/cli/commands/history.js';

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerHistory(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // ignore exitOverride throws
  }
}

const SPRINT_CONTENT = (id: string) =>
  `# ${id}\n\n## Metrics\n| Metric | Value |\n|---|---|\n| Total Tasks | 5 |\n| Completed | 4 |\n| Tech Debt | 1 |\n| No-Go | 1 |\n| Coverage | 90.0% |\n| Duration | 60000ms |\n\n## Agents\nAgents: test-agent\nSkills: typescript-expert`;

describe('history --json flag', () => {
  beforeEach(() => vi.clearAllMocks());

  it('outputs JSON array when --json is passed', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_CONTENT('sprint-001'));
    await runCommand(['history', '--json']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonCall = printCalls.find((c) => {
      try { JSON.parse(String(c[0])); return true; } catch { return false; }
    });
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(String(jsonCall?.[0]));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].sprint).toBe('sprint-001');
  });

  it('JSON output includes all fields', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_CONTENT('sprint-001'));
    await runCommand(['history', '--json']);
    const call = vi.mocked(print).mock.calls[0];
    const parsed = JSON.parse(String(call?.[0]));
    const record = parsed[0];
    expect(record).toHaveProperty('sprint');
    expect(record).toHaveProperty('tasks');
    expect(record).toHaveProperty('completed');
    expect(record).toHaveProperty('noGoRate');
    expect(record).toHaveProperty('agents');
    expect(record).toHaveProperty('skills');
    expect(record).toHaveProperty('tokens');
    expect(record).toHaveProperty('calls');
  });
});

describe('history --last N flag', () => {
  beforeEach(() => vi.clearAllMocks());

  it('limits to last N sprints', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['sprint-001.md', 'sprint-002.md', 'sprint-003.md', 'sprint-004.md', 'sprint-005.md'] as any,
    );
    vi.mocked(readFileSync).mockImplementation((path: any) => SPRINT_CONTENT(String(path).replace(/.*\/(sprint-\d+).*/, '$1')));
    await runCommand(['history', '--last', '2']);
    const call = vi.mocked(print).mock.calls[0];
    const output = String(call?.[0]);
    expect(output).toContain('sprint-005');
    expect(output).toContain('sprint-004');
    expect(output).not.toContain('sprint-001');
  });

  it('shows all sprints when --last is not specified', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md', 'sprint-002.md', 'sprint-003.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_CONTENT('sprint-001'));
    await runCommand(['history']);
    const mdCalls = vi.mocked(readFileSync).mock.calls.filter((c) => String(c[0]).endsWith('.md'));
    expect(mdCalls).toHaveLength(3);
  });

  it('--last 1 shows only most recent sprint', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md', 'sprint-002.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_CONTENT('sprint-002'));
    await runCommand(['history', '--last', '1', '--json']);
    const call = vi.mocked(print).mock.calls[0];
    const parsed = JSON.parse(String(call?.[0]));
    expect(parsed).toHaveLength(1);
  });
});

describe('history numeric sort', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sorts sprint-1000 after sprint-999', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-1000.md', 'sprint-999.md', 'sprint-10.md'] as any);
    const calls: string[] = [];
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      calls.push(String(path));
      return SPRINT_CONTENT('sprint-x');
    });
    await runCommand(['history']);
    const mdCalls = calls.filter((c) => c.endsWith('.md'));
    expect(mdCalls[0]).toContain('sprint-10.md');
    expect(mdCalls[1]).toContain('sprint-999.md');
    expect(mdCalls[2]).toContain('sprint-1000.md');
  });
});

describe('history archive support', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads from archive dir when it exists', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const s = String(p);
      // sprints dir has no files, archive has one
      return s.includes('.brain') ? true : false;
    });
    vi.mocked(readdirSync).mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('archive')) return ['sprint-001.md'] as any;
      return [] as any;
    });
    vi.mocked(readFileSync).mockReturnValue(SPRINT_CONTENT('sprint-001'));
    await runCommand(['history', '--json']);
    const call = vi.mocked(print).mock.calls[0];
    const parsed = JSON.parse(String(call?.[0]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sprint).toBe('sprint-001');
  });

  it('deduplicates between sprints dir and archive dir', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_CONTENT('sprint-001'));
    await runCommand(['history', '--json']);
    const call = vi.mocked(print).mock.calls[0];
    const parsed = JSON.parse(String(call?.[0]));
    // Even though sprint-001.md appears in both dirs, only one entry returned
    expect(parsed).toHaveLength(1);
  });
});

describe('history usage integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows token and call counts from usage file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as any);
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      const s = String(path);
      if (s.endsWith('.json')) {
        return JSON.stringify([
          { tokenEstimate: 5000, taskId: 't1' },
          { tokenEstimate: 3000, taskId: 't2' },
        ]);
      }
      return SPRINT_CONTENT('sprint-001');
    });
    await runCommand(['history', '--json']);
    const call = vi.mocked(print).mock.calls[0];
    const parsed = JSON.parse(String(call?.[0]));
    expect(parsed[0].tokens).toBe('8000');
    expect(parsed[0].calls).toBe('2');
  });

  it('shows dash for tokens when no usage file exists', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => !String(p).endsWith('.json'));
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_CONTENT('sprint-001'));
    await runCommand(['history', '--json']);
    const call = vi.mocked(print).mock.calls[0];
    const parsed = JSON.parse(String(call?.[0]));
    expect(parsed[0].tokens).toBe('-');
    expect(parsed[0].calls).toBe('-');
  });
});

describe('parseSprintLog files changed', () => {
  it('parses Files Changed field from sprint log', () => {
    const content = '# sprint-010\n\n## Metrics\n| Metric | Value |\n|---|---|\n| Total Tasks | 3 |\n| Completed | 3 |\n| Tech Debt | 0 |\n| No-Go | 0 |\n| Coverage | 95% |\n| Duration | 10000ms |\n| Files Changed | 12 |';
    const record = parseSprintLog(content);
    expect(record.filesChanged).toBe('12');
  });

  it('returns dash for files changed when not present', () => {
    const content = '# sprint-010\n| Total Tasks | 3 |';
    const record = parseSprintLog(content);
    expect(record.filesChanged).toBe('-');
  });
});

describe('history command new options registered', () => {
  it('registers --json option', () => {
    const program = new Command();
    registerHistory(program);
    const cmd = program.commands.find((c) => c.name() === 'history');
    expect(cmd?.options.find((o) => o.long === '--json')).toBeDefined();
  });

  it('registers --last option', () => {
    const program = new Command();
    registerHistory(program);
    const cmd = program.commands.find((c) => c.name() === 'history');
    expect(cmd?.options.find((o) => o.long === '--last')).toBeDefined();
  });
});
