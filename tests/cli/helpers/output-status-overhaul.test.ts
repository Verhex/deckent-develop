import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isNoColor,
  stripAnsi,
  color,
  formatStandaloneStatus,
  estimateRemaining,
  formatAgentLabel,
  formatSkillsLabel,
  formatDoctorResult,
} from '../../../src/cli/helpers/output.js';
import { AlertLevel, SprintPhase, SprintStatus, TaskStatus } from '../../../src/core/types.js';
import type { DashboardState, Task, ModelType, TaskEffort, TaskPriority } from '../../../src/core/types.js';

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
    model: 'sonnet' as ModelType,
    effort: 'normal' as TaskEffort,
    priority: 'NORMAL' as TaskPriority,
    reason: '',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
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
      makeTask({ id: '001', title: 'First', status: TaskStatus.DONE }),
      makeTask({ id: '002', title: 'Second', status: TaskStatus.EXECUTING }),
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

// ─── Alert Detail, Budget Check, Stale Warning, Verbose Mode ──────
// Covered by output.test.ts (formatHumanStatus — alert detail / budget check / stale dashboard warning)
