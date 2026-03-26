import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatDashboard, formatHumanStatus } from '../../../src/cli/helpers/output.js';
import { SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DashboardState, Task } from '../../../src/core/types.js';
import { countBrainLines } from '../../../src/core/utils.js';

// Mock countBrainLines so tests don't touch the filesystem
vi.mock('../../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(300),
}));

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

// ─── B: Progress Inconsistency Warning ──────────────────────────────

describe('formatHumanStatus progress inconsistency warning (B)', () => {
  it('warns when task files show significantly more done than dashboard', () => {
    const tasks = [
      makeTask({ id: '001', status: 'DONE' as any }),
      makeTask({ id: '002', status: 'DONE' as any }),
      makeTask({ id: '003', status: 'DONE' as any }),
      makeTask({ id: '004', status: 'DONE' as any }),
    ];
    const dash = makeDashboard({
      progress: { done: 1, active: 0, blocked: 0, total: 4 },
    });
    const result = formatHumanStatus({ dashboard: dash, tasks });
    expect(result).toContain('Warning');
    expect(result).toContain('4');
    expect(result).toContain('stale');
  });

  it('does not warn when task done count matches dashboard (within threshold)', () => {
    const tasks = [
      makeTask({ id: '001', status: 'DONE' as any }),
      makeTask({ id: '002', status: 'EXECUTING' as any }),
    ];
    const dash = makeDashboard({
      progress: { done: 1, active: 1, blocked: 0, total: 2 },
    });
    const result = formatHumanStatus({ dashboard: dash, tasks });
    expect(result).not.toContain('progress may be stale');
  });

  it('does not warn when tasks array is empty', () => {
    const dash = makeDashboard({
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
    });
    const result = formatHumanStatus({ dashboard: dash, tasks: [] });
    expect(result).not.toContain('progress may be stale');
  });

  it('does not warn when off by exactly 1 (within tolerance)', () => {
    const tasks = [
      makeTask({ id: '001', status: 'DONE' as any }),
      makeTask({ id: '002', status: 'DONE' as any }),
    ];
    const dash = makeDashboard({
      progress: { done: 1, active: 0, blocked: 0, total: 2 },
    });
    // actualDone=2, p.done=1 — diff is 1, threshold is > p.done + 1 = > 2 → false
    const result = formatHumanStatus({ dashboard: dash, tasks });
    expect(result).not.toContain('progress may be stale');
  });
});

// ─── C: formatDashboard Real Budget ────────────────────────────────

describe('formatDashboard real budget check (C)', () => {
  beforeEach(() => {
    vi.mocked(countBrainLines).mockReturnValue(300);
  });

  it('shows real budget count when projectRoot is provided (under limit)', () => {
    const result = formatDashboard(makeDashboard(), '/test/root');
    expect(result).toContain('300/600');
    expect(result).toContain('OK');
  });

  it('falls back to "Budget: OK" when no projectRoot provided', () => {
    const result = formatDashboard(makeDashboard());
    expect(result).toContain('Budget: OK');
  });

  it('shows OVER when budget exceeds 600 lines', () => {
    vi.mocked(countBrainLines).mockReturnValue(700);
    const result = formatDashboard(makeDashboard(), '/test/root');
    expect(result).toContain('OVER');
    expect(result).toContain('700/600');
  });

  it('shows high usage warning label when between 80%-100%', () => {
    vi.mocked(countBrainLines).mockReturnValue(500); // 500/600 = 83%
    const result = formatDashboard(makeDashboard(), '/test/root');
    expect(result).toContain('500/600');
    // Should NOT show OK or OVER since it's in the warning zone
    expect(result).not.toContain('Budget: OK');
    expect(result).not.toContain('OVER');
  });
});

// ─── D: formatDashboard Alert Messages ─────────────────────────────

describe('formatDashboard alert messages (D)', () => {
  it('shows alert message text in raw dashboard output', () => {
    const state = makeDashboard({
      alerts: [{ level: 'WARNING' as any, message: 'stale heartbeat on w-001', timestamp: '' }],
    });
    const result = formatDashboard(state);
    expect(result).toContain('Alerts: 1');
    expect(result).toContain('stale heartbeat on w-001');
  });

  it('shows critical alerts with [!!] prefix', () => {
    const state = makeDashboard({
      alerts: [{ level: 'CRITICAL' as any, message: 'boundary violation detected', timestamp: '' }],
    });
    const result = formatDashboard(state);
    expect(result).toContain('[!!]');
    expect(result).toContain('boundary violation detected');
  });

  it('shows warning alerts with [!] prefix', () => {
    const state = makeDashboard({
      alerts: [{ level: 'WARNING' as any, message: 'stale lock found', timestamp: '' }],
    });
    const result = formatDashboard(state);
    expect(result).toContain('[!]');
  });

  it('truncates after 3 alerts and shows "... and N more"', () => {
    const alerts = Array.from({ length: 5 }, (_, i) => ({
      level: 'WARNING' as any,
      message: `alert-message-${i}`,
      timestamp: '',
    }));
    const state = makeDashboard({ alerts });
    const result = formatDashboard(state);
    expect(result).toContain('Alerts: 5');
    expect(result).toContain('alert-message-0');
    expect(result).toContain('alert-message-1');
    expect(result).toContain('alert-message-2');
    expect(result).not.toContain('alert-message-3');
    expect(result).toContain('... and 2 more');
  });

  it('shows no alert detail lines when alerts array is empty', () => {
    const state = makeDashboard({ alerts: [] });
    const result = formatDashboard(state);
    expect(result).toContain('Alerts: 0');
    expect(result).not.toContain('[!]');
    expect(result).not.toContain('[!!]');
  });
});
