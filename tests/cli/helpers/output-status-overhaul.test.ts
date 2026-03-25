import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isNoColor,
  stripAnsi,
  color,
  formatHumanStatus,
  formatStandaloneStatus,
  estimateRemaining,
  formatElapsed,
  formatAgentLabel,
  formatSkillsLabel,
  formatDoctorResult,
} from '../../../src/cli/helpers/output.js';
import { AgentStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DashboardState, Task } from '../../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sprint: { id: 'sprint-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [],
    progress: { done: 2, active: 1, blocked: 0, total: 5 },
    usage: { fiveHourPercent: 30, weeklyPercent: 45 } as DashboardState['usage'],
    alerts: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test Task',
    description: '',
    model: 'sonnet' as any,
    effort: 'normal' as any,
    priority: 'NORMAL' as any,
    reason: '',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE' as any,
    sprintId: 'sprint-001',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Task;
}

// ─── NO_COLOR Tests (C) ─────────────────────────────────────────────

describe('NO_COLOR support', () => {
  const originalEnv = process.env.NO_COLOR;
  const originalArgv = [...process.argv];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalEnv;
    }
    process.argv = originalArgv;
  });

  it('isNoColor returns false when NO_COLOR is not set', () => {
    delete process.env.NO_COLOR;
    expect(isNoColor()).toBe(false);
  });

  it('isNoColor returns true when NO_COLOR env is set', () => {
    process.env.NO_COLOR = '1';
    expect(isNoColor()).toBe(true);
  });

  it('isNoColor returns true when --no-color is in argv', () => {
    delete process.env.NO_COLOR;
    process.argv = ['node', 'test', '--no-color'];
    expect(isNoColor()).toBe(true);
  });

  it('stripAnsi removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green');
    expect(stripAnsi('no ansi')).toBe('no ansi');
  });

  it('color applies ANSI when NO_COLOR is not set', () => {
    delete process.env.NO_COLOR;
    const result = color('\x1b[31m', 'red text');
    expect(result).toContain('\x1b[31m');
    expect(result).toContain('red text');
  });

  it('color returns plain text when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    const result = color('\x1b[31m', 'red text');
    expect(result).toBe('red text');
    expect(result).not.toContain('\x1b[');
  });

  it('formatAgentLabel respects NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    expect(formatAgentLabel('test-agent')).toBe('test-agent');
    expect(formatAgentLabel()).toBe('generic');
  });

  it('formatSkillsLabel respects NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    expect(formatSkillsLabel(['a', 'b'])).toBe('a, b');
    expect(formatSkillsLabel()).toBe('none');
  });

  it('formatDoctorResult respects NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    const result = formatDoctorResult({
      ok: true,
      checks: [{ name: 'test', passed: true, message: 'ok', required: true }],
    });
    expect(result).not.toContain('\x1b[');
    expect(result).toContain('[PASS]');
  });
});

// ─── Standalone Status (A) ──────────────────────────────────────────

describe('formatStandaloneStatus', () => {
  it('renders standalone status from tasks', () => {
    const tasks = [
      makeTask({ id: '001', title: 'First', status: 'DONE' as any }),
      makeTask({ id: '002', title: 'Second', status: 'EXECUTING' as any }),
    ];
    const result = formatStandaloneStatus(tasks, 'sprint-001');
    expect(result).toContain('standalone');
    expect(result).toContain('sprint-001');
    expect(result).toContain('1/2 done');
    expect(result).toContain('First');
    expect(result).toContain('Second');
  });

  it('handles empty tasks', () => {
    const result = formatStandaloneStatus([], undefined);
    expect(result).toContain('unknown');
    expect(result).toContain('0/0 done');
  });
});

// ─── ETA with Weighted Average (I) ─────────────────────────────────

describe('estimateRemaining with weighted average', () => {
  it('uses linear estimate when no completion times', () => {
    const result = estimateRemaining(2, 10, 20_000);
    // 2 done in 20s => 10s/task => 8 remaining => ~80s => ~1 min
    expect(result).toContain('~');
    expect(result).toContain('min');
  });

  it('uses weighted average when completion times provided', () => {
    // 5 tasks done, times: [10s, 10s, 5s, 5s, 3s] (getting faster)
    const times = [10_000, 10_000, 5_000, 5_000, 3_000];
    const result = estimateRemaining(5, 10, 33_000, times);
    expect(result).toContain('~');
    // Weighted avg should be lower than simple average
  });

  it('ignores completion times with fewer than 2 entries', () => {
    const result1 = estimateRemaining(2, 10, 20_000, [10_000]);
    const result2 = estimateRemaining(2, 10, 20_000);
    // Both should use linear estimate
    expect(result1).toBe(result2);
  });

  it('returns null when all tasks done', () => {
    expect(estimateRemaining(5, 5, 10_000)).toBeNull();
  });

  it('returns null when no tasks done', () => {
    expect(estimateRemaining(0, 5, 0)).toBeNull();
  });
});

// ─── Alert Detail (H) ──────────────────────────────────────────────

describe('formatHumanStatus alert detail', () => {
  it('shows alert messages in output', () => {
    const dash = makeDashboard({
      alerts: [
        { level: 'WARNING' as any, message: 'stale heartbeat on w-001', timestamp: '' },
        { level: 'CRITICAL' as any, message: 'boundary violation detected', timestamp: '' },
      ],
    });
    const result = formatHumanStatus({ dashboard: dash, tasks: [] });
    expect(result).toContain('Alerts (2)');
    expect(result).toContain('stale heartbeat on w-001');
    expect(result).toContain('boundary violation detected');
    expect(result).toContain('[!]');
    expect(result).toContain('[!!]');
  });

  it('truncates alerts after 10', () => {
    const alerts = Array.from({ length: 15 }, (_, i) => ({
      level: 'WARNING' as any,
      message: `alert-${i}`,
      timestamp: '',
    }));
    const dash = makeDashboard({ alerts });
    const result = formatHumanStatus({ dashboard: dash, tasks: [] });
    expect(result).toContain('Alerts (15)');
    expect(result).toContain('alert-0');
    expect(result).toContain('alert-9');
    expect(result).not.toContain('alert-10');
    expect(result).toContain('... and 5 more');
  });
});

// ─── Budget Check (G) ──────────────────────────────────────────────

describe('formatHumanStatus budget check', () => {
  it('shows budget OK when under limit', () => {
    vi.mock('../../../src/core/utils.js', () => ({
      countBrainLines: vi.fn().mockReturnValue(100),
    }));
    const result = formatHumanStatus({
      dashboard: makeDashboard(),
      tasks: [],
      projectRoot: '/test',
    });
    expect(result).toContain('Budget:');
    expect(result).toContain('100/600');
    expect(result).toContain('OK');
  });
});

// ─── Stale Warning (J) ─────────────────────────────────────────────

describe('formatHumanStatus stale warning', () => {
  it('shows stale warning when dashboard is old', () => {
    const oldTime = new Date(Date.now() - 120_000).toISOString(); // 2 min ago
    const dash = makeDashboard({ updatedAt: oldTime });
    const result = formatHumanStatus({
      dashboard: dash,
      tasks: [],
      nowMs: Date.now(),
    });
    expect(result).toContain('Warning: Dashboard data is');
    expect(result).toContain('may be stale');
  });

  it('does not show stale warning when dashboard is fresh', () => {
    const recentTime = new Date().toISOString();
    const dash = makeDashboard({ updatedAt: recentTime });
    const result = formatHumanStatus({
      dashboard: dash,
      tasks: [],
      nowMs: Date.now(),
    });
    expect(result).not.toContain('may be stale');
  });
});

// ─── Verbose Mode ──────────────────────────────────────────────────

describe('formatHumanStatus verbose', () => {
  it('shows agent/skill assignments in verbose mode', () => {
    const tasks = [
      makeTask({ id: '001', title: 'T1', assignedAgent: 'test-agent', assignedSkills: ['skill-a'] }),
      makeTask({ id: '002', title: 'T2' }),
    ];
    const result = formatHumanStatus({
      dashboard: makeDashboard(),
      tasks,
      verbose: true,
    });
    expect(result).toContain('Agent/Skill Assignments');
    expect(result).toContain('agent=test-agent');
    expect(result).toContain('skills=skill-a');
    expect(result).toContain('agent=generic');
  });

  it('does not show agent/skill in non-verbose mode', () => {
    const tasks = [makeTask({ assignedAgent: 'test-agent' })];
    const result = formatHumanStatus({
      dashboard: makeDashboard(),
      tasks,
    });
    expect(result).not.toContain('Agent/Skill Assignments');
  });
});
