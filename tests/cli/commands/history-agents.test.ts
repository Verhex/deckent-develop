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
    return [headers.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n');
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
  parseAgentSkillInfo,
  formatDurationMs,
} from '../../../src/cli/commands/history.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerHistory(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

const SPRINT_WITH_AGENTS = `# sprint-025
## Metrics
| Metric | Value |
|---|---|
| Total Tasks | 5 |
| Completed | 4 |
| No-Go | 1 |
| Coverage | 90% |
| Duration | 3000ms |

Agents: security, test-writer
Skills: typescript, react
`;

// ─── Tests ───────────────────────────────────────────────────────────

describe('history command agent/skill display', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('registers --agent and --skill options', () => {
    const program = new Command();
    registerHistory(program);
    const cmd = program.commands.find((c) => c.name() === 'history');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some((o) => o.long === '--agent')).toBe(true);
    expect(cmd!.options.some((o) => o.long === '--skill')).toBe(true);
  });

  it('includes Agents and Skills columns in table', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-025.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_WITH_AGENTS);
    await runCommand(['history']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Agents');
    expect(output).toContain('Skills');
  });

  it('--agent filter returns matching sprints', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-025.md', 'sprint-026.md'] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('sprint-025')) return SPRINT_WITH_AGENTS;
      return '# sprint-026\n| Total Tasks | 3 |';
    });
    await runCommand(['history', '--agent', 'security']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('security');
    expect(output).not.toContain('sprint-026');
  });

  it('--skill filter returns matching sprints', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-025.md', 'sprint-026.md'] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('sprint-025')) return SPRINT_WITH_AGENTS;
      return '# sprint-026\n| Total Tasks | 3 |';
    });
    await runCommand(['history', '--skill', 'react']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('react');
  });

  it('shows no matching history for unmatched agent', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-025.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_WITH_AGENTS);
    await runCommand(['history', '--agent', 'nonexistent']);
    expect(print).toHaveBeenCalledWith('No matching run history found.');
  });

  it('shows no matching history for unmatched skill', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-025.md'] as any);
    vi.mocked(readFileSync).mockReturnValue(SPRINT_WITH_AGENTS);
    await runCommand(['history', '--skill', 'python']);
    expect(print).toHaveBeenCalledWith('No matching run history found.');
  });

  it('uses agent/skill info from sprint log content when filtering', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-025.md'] as any);
    // Sprint log contains agent/skill info in Agents:/Skills: fields
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).endsWith('.md'))
        return '# sprint-025\n| Total Tasks | 3 |\nAgents: ml-expert\nSkills: tensorflow';
      return '{}'; // usage file fallback
    });
    await runCommand(['history', '--agent', 'ml-expert']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('ml-expert');
    expect(output).toContain('tensorflow');
  });
});

describe('parseAgentSkillInfo', () => {
  it('parses agents from content', () => {
    const { agents } = parseAgentSkillInfo('Agents: security, test-writer');
    expect(agents).toEqual(['security', 'test-writer']);
  });

  it('parses skills from content', () => {
    const { skills } = parseAgentSkillInfo('Skills: typescript, react');
    expect(skills).toEqual(['typescript', 'react']);
  });

  it('returns empty when no agents or skills', () => {
    const { agents, skills } = parseAgentSkillInfo('No info here');
    expect(agents).toEqual([]);
    expect(skills).toEqual([]);
  });

  it('handles single agent', () => {
    const { agents } = parseAgentSkillInfo('Agent: security');
    expect(agents).toEqual(['security']);
  });

  it('handles single skill', () => {
    const { skills } = parseAgentSkillInfo('Skill: testing');
    expect(skills).toEqual(['testing']);
  });
});

describe('parseSprintLog agent/skill fields', () => {
  it('includes agents and skills in record', () => {
    const record = parseSprintLog(SPRINT_WITH_AGENTS);
    expect(record.agents).toContain('security');
    expect(record.skills).toContain('typescript');
  });

  it('returns dash for missing agents and skills', () => {
    const record = parseSprintLog('# Sprint X\n| Total Tasks | 2 |');
    expect(record.agents).toBe('-');
    expect(record.skills).toBe('-');
  });
});

describe('formatDurationMs (preserved)', () => {
  it('formats ms to seconds', () => {
    expect(formatDurationMs('5000ms')).toBe('5s');
  });

  it('formats ms to minutes and seconds', () => {
    expect(formatDurationMs('125000ms')).toBe('2m 5s');
  });
});
