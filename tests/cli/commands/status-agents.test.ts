import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { DashboardState, Task } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatDashboard: vi.fn().mockReturnValue('Dashboard Output'),
  formatTable: vi.fn().mockImplementation((headers: string[], rows: string[][]) => {
    return [headers.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n');
  }),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn().mockImplementation((key: string) => {
    if (key === 'status.no_active_sprint') return 'No active sprint.';
    if (key === 'status.dashboard_read_failed') return 'Dashboard read failed.';
    return key;
  }),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { print } from '../../../src/cli/helpers/output.js';
import {
  registerStatus,
  loadTaskFiles,
  formatAgentAssignments,
  formatSkillAssignments,
} from '../../../src/cli/commands/status.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDashboard(overrides?: Partial<DashboardState>): DashboardState {
  return {
    sprint: { id: 'sprint-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [],
    progress: { done: 3, active: 2, blocked: 0, total: 5 },
    usage: { fiveHourPercent: 25, weeklyPercent: 10, measuredAt: '2026-03-19T00:00:00Z' },
    alerts: [],
    updatedAt: '2026-03-19T00:00:00Z',
    ...overrides,
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE' as any,
    ...overrides,
  };
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStatus(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('status command agent/skill display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('registers --verbose option', () => {
    const program = new Command();
    registerStatus(program);
    const cmd = program.commands.find((c) => c.name() === 'status');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some((o) => o.long === '--verbose')).toBe(true);
  });

  it('shows agent and skill assignments when tasks exist', async () => {
    const task = makeTask({ assignedAgent: 'security', assignedSkills: ['vuln-scan'] });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return JSON.stringify(makeDashboard());
      if (String(p).includes('config.json')) return JSON.stringify({ language: 'en' });
      return JSON.stringify(task);
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    await runCommand(['status']);
    const printCalls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const hasAgents = printCalls.some((c) => c.includes('Agent Assignments'));
    const hasSkills = printCalls.some((c) => c.includes('Skill Assignments'));
    expect(hasAgents).toBe(true);
    expect(hasSkills).toBe(true);
  });

  it('does not show assignments when no tasks directory', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return true;
      if (String(p).includes('.tasks')) return false;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    vi.mocked(readdirSync).mockReturnValue([] as any);
    await runCommand(['status']);
    // Should still print dashboard
    expect(print).toHaveBeenCalledWith('Dashboard Output');
  });
});

describe('loadTaskFiles', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty array when tasks dir does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const tasks = loadTaskFiles('/mock/root');
    expect(tasks).toEqual([]);
  });

  it('loads task files', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeTask()));
    const tasks = loadTaskFiles('/mock/root');
    expect(tasks).toHaveLength(2);
  });

  it('skips malformed task files', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue('INVALID JSON');
    const tasks = loadTaskFiles('/mock/root');
    expect(tasks).toEqual([]);
  });

  it('filters only task-*.json files', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'review-sprint.json', 'notes.txt'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeTask()));
    const tasks = loadTaskFiles('/mock/root');
    expect(tasks).toHaveLength(1);
  });
});

describe('formatAgentAssignments', () => {
  it('shows agents grouped by name', () => {
    const tasks = [
      makeTask({ id: '001', assignedAgent: 'security' }),
      makeTask({ id: '002', assignedAgent: 'security' }),
      makeTask({ id: '003', assignedAgent: 'test-writer' }),
    ];
    const result = formatAgentAssignments(tasks, false);
    expect(result).toContain('Agent Assignments');
    expect(result).toContain('security: 2 task(s)');
    expect(result).toContain('test-writer: 1 task(s)');
  });

  it('shows generic for tasks without agent', () => {
    const tasks = [makeTask({ id: '001' })];
    const result = formatAgentAssignments(tasks, false);
    expect(result).toContain('generic: 1 task(s)');
  });

  it('shows no assignments message when empty', () => {
    const result = formatAgentAssignments([], false);
    expect(result).toContain('No agent assignments found');
  });

  it('verbose mode shows table with task ids', () => {
    const tasks = [makeTask({ id: '001', assignedAgent: 'dev' })];
    const result = formatAgentAssignments(tasks, true);
    expect(result).toContain('Agent');
    expect(result).toContain('Tasks');
  });
});

describe('formatSkillAssignments', () => {
  it('shows skills grouped by name', () => {
    const tasks = [
      makeTask({ id: '001', assignedSkills: ['react', 'testing'] }),
      makeTask({ id: '002', assignedSkills: ['react'] }),
    ];
    const result = formatSkillAssignments(tasks, false);
    expect(result).toContain('Skill Assignments');
    expect(result).toContain('react: 2 task(s)');
    expect(result).toContain('testing: 1 task(s)');
  });

  it('shows no skill assignments for tasks without skills', () => {
    const tasks = [makeTask({ id: '001' })];
    const result = formatSkillAssignments(tasks, false);
    expect(result).toContain('No skill assignments found');
  });

  it('verbose mode shows table', () => {
    const tasks = [makeTask({ id: '001', assignedSkills: ['ts'] })];
    const result = formatSkillAssignments(tasks, true);
    expect(result).toContain('Skill');
    expect(result).toContain('Tasks');
  });
});
