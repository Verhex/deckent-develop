import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DashboardState } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    watch: vi.fn(),
  };
});

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/constants.js', () => ({
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  DASHBOARD_FILE: '.dashboard',
}));

import { renderDashboard, readDashboardFile, isNoColor } from '../../../src/cli/commands/dashboard.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeDashboardState(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sprint: { id: 'sprint-057', number: 57, phase: 'EXECUTE', status: 'IN_PROGRESS' as any },
    agents: [],
    progress: { done: 3, active: 2, blocked: 1, total: 6 },
    alerts: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('renderDashboard', () => {
  beforeEach(() => {
    // Reset stdout.columns to default
    Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true });
  });

  it('renders sprint info', () => {
    const state = makeDashboardState();
    const output = renderDashboard(state);
    expect(output).toContain('sprint-057');
    expect(output).toContain('EXECUTE');
  });

  it('renders progress bar', () => {
    const state = makeDashboardState();
    const output = renderDashboard(state);
    expect(output).toContain('3/6 done');
    expect(output).toContain('2 active');
  });

  it('renders "No alerts." when no alerts', () => {
    const state = makeDashboardState({ alerts: [] });
    const output = renderDashboard(state);
    expect(output).toContain('No alerts.');
  });

  it('renders alert messages', () => {
    const state = makeDashboardState({
      alerts: [{ level: 'WARNING' as any, message: 'Stale worker', timestamp: new Date().toISOString() }],
    });
    const output = renderDashboard(state);
    expect(output).toContain('Stale worker');
    expect(output).toContain('[WARNING]');
  });

  it('renders agent/skill columns (D)', () => {
    const state = makeDashboardState({
      agents: [
        {
          id: 'w-057-001',
          role: 'worker' as any,
          status: 'ACTIVE' as any,
          model: 'sonnet' as any,
          tmuxWindow: 'w-057-001',
          taskId: '057-001',
          assignedAgent: 'test-writer',
        },
      ],
    });
    const output = renderDashboard(state);
    expect(output).toContain('Agent');
    expect(output).toContain('test-writer');
  });

  it('adapts width to terminal columns (C)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    const state = makeDashboardState();
    const output = renderDashboard(state);
    // Width should be 120 not fixed 62
    const firstLine = output.split('\n')[0];
    expect(firstLine.length).toBeGreaterThanOrEqual(100);
  });

  it('uses ASCII when noColor=true (NO_COLOR support)', () => {
    const state = makeDashboardState();
    const output = renderDashboard(state, true);
    // Box-drawing chars replaced with ASCII
    expect(output).not.toContain('╔');
    expect(output).not.toContain('║');
    expect(output).toContain('+');
    expect(output).toContain('|');
  });

  it('respects NO_COLOR environment variable via isNoColor()', () => {
    const originalNoColor = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    expect(isNoColor()).toBe(true);
    if (originalNoColor === undefined) delete process.env['NO_COLOR'];
    else process.env['NO_COLOR'] = originalNoColor;
  });

  it('isNoColor returns false without NO_COLOR env', () => {
    const originalNoColor = process.env['NO_COLOR'];
    delete process.env['NO_COLOR'];
    expect(isNoColor()).toBe(false);
    if (originalNoColor !== undefined) process.env['NO_COLOR'] = originalNoColor;
  });

  it('isNoColor returns true when flag is explicitly true', () => {
    const originalNoColor = process.env['NO_COLOR'];
    delete process.env['NO_COLOR'];
    expect(isNoColor(true)).toBe(true);
    if (originalNoColor !== undefined) process.env['NO_COLOR'] = originalNoColor;
  });
});

describe('readDashboardFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when file does not exist', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);
    const result = readDashboardFile('/some/path/.dashboard');
    expect(result).toBeNull();
  });

  it('returns null when file has invalid JSON', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json');
    const result = readDashboardFile('/some/path/.dashboard');
    expect(result).toBeNull();
  });

  it('returns parsed state when file is valid', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);
    const state = makeDashboardState();
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    const result = readDashboardFile('/some/path/.dashboard');
    expect(result).toMatchObject({ sprint: { id: 'sprint-057' } });
  });
});
