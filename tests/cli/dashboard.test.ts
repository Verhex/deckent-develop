import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintPhase, SprintStatus, AgentStatus } from '../../src/core/types.js';
import type { DashboardState, AgentInfo, Alert } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../src/core/constants.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/core/constants.js')>(),
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  DASHBOARD_FILE: '.dashboard',
  // sprint-428 import-zinciri (task-builder→sprint-pid-manager) modül-yüklemede okur
  DECKENT_DIR: '.deckent',
  BRAIN_DIR: '.brain',
  TASKS_DIR: '.tasks',  // FAZ4B: spawn-backend-docker.ts import zinciri modül-yüklemede okur
  LOCKS_DIR: '.locks',
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/test-root'),
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn().mockReturnValue(null),
}));

// born-587 (DEAD-LISTENER-MIGRATION): registerDashboard() routes shutdown
// cleanup through this shared registry instead of a raw process.on(SIGINT/
// SIGTERM) — mock it so the "registers ..." test can capture and invoke the
// hook directly, without sending a real OS signal.
vi.mock('../../src/cli/helpers/shutdown-hooks.js', () => ({
  registerShutdownHook: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';
import { readJsonSafe } from '../../src/core/utils.js';
import { registerShutdownHook } from '../../src/cli/helpers/shutdown-hooks.js';
import { renderDashboard, readDashboardFile, registerDashboard } from '../../src/cli/commands/dashboard.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockRegisterShutdownHook = vi.mocked(registerShutdownHook);

// ─── Fixtures ───────────────────────────────────────────────────────

function makeDashboardState(overrides?: Partial<DashboardState>): DashboardState {
  return {
    sprint: {
      id: 'sprint-005',
      number: 5,
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
    },
    agents: [
      {
        id: 'w-1',
        role: 'worker',
        status: AgentStatus.CODING,
        model: 'sonnet',
        tmuxWindow: 'w-1',
        taskId: '005-001',
        spawnedAt: new Date(Date.now() - 120_000).toISOString(),
      },
      {
        id: 'w-2',
        role: 'worker',
        status: AgentStatus.DONE,
        model: 'sonnet',
        tmuxWindow: 'w-2',
        taskId: '005-002',
      },
    ] as AgentInfo[],
    progress: {
      done: 3,
      active: 1,
      blocked: 1,
      total: 5,
    },
    alerts: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('renderDashboard', () => {
  it('renders sprint info box with correct ID and number', () => {
    const state = makeDashboardState();
    const output = renderDashboard(state);
    // RUN-RENAME-D1 (403-001 / MASTER-PLAN 510): user-facing label is 'Run';
    // the sprint-005 ID itself is data and keeps its internal name.
    expect(output).toContain('Run: sprint-005 (#5)');
    expect(output).toContain('Phase: EXECUTE');
    expect(output).toContain('Status: ACTIVE');
  });

  it('renders worker table with agent info', () => {
    const state = makeDashboardState();
    const output = renderDashboard(state);
    expect(output).toContain('w-1');
    expect(output).toContain('005-001');
    expect(output).toContain('CODING');
    expect(output).toContain('w-2');
    expect(output).toContain('005-002');
    expect(output).toContain('DONE');
  });

  it('renders elapsed time for spawned agents', () => {
    const state = makeDashboardState({
      agents: [
        {
          id: 'w-1',
          role: 'worker',
          status: AgentStatus.CODING,
          model: 'sonnet',
          tmuxWindow: 'w-1',
          taskId: '005-001',
          spawnedAt: new Date(Date.now() - 65_000).toISOString(),
        },
      ] as AgentInfo[],
    });
    const output = renderDashboard(state);
    expect(output).toContain('1m');
  });

  it('renders --:-- for agents without spawnedAt', () => {
    const state = makeDashboardState({
      agents: [
        {
          id: 'w-1',
          role: 'worker',
          status: AgentStatus.IDLE,
          model: 'sonnet',
          tmuxWindow: 'w-1',
        },
      ] as AgentInfo[],
    });
    const output = renderDashboard(state);
    expect(output).toContain('--:--');
  });

  it('renders progress bar with correct counts', () => {
    const state = makeDashboardState();
    const output = renderDashboard(state);
    expect(output).toContain('3/5 done');
    expect(output).toContain('1 active');
    expect(output).toContain('pending');
  });

  it('renders progress bar visual with # for done, + for active, . for pending', () => {
    const state = makeDashboardState({
      progress: { done: 2, active: 1, blocked: 1, total: 4 },
    });
    const output = renderDashboard(state);
    expect(output).toMatch(/\[#+\++\.+\]/);
  });

  it('renders "No alerts." when alerts array is empty', () => {
    const state = makeDashboardState({ alerts: [] });
    const output = renderDashboard(state);
    expect(output).toContain('No alerts.');
  });

  it('renders alerts with level, message, and timestamp', () => {
    const alerts: Alert[] = [
      {
        level: 'WARNING' as never,
        message: 'Budget at 80%',
        timestamp: '2026-03-17T10:30:00.000Z',
      },
    ];
    const state = makeDashboardState({ alerts });
    const output = renderDashboard(state);
    expect(output).toContain('[WARNING]');
    expect(output).toContain('Budget at 80%');
  });

  it('uses box-drawing characters for borders', () => {
    const state = makeDashboardState();
    const output = renderDashboard(state);
    expect(output).toContain('╔');
    expect(output).toContain('╗');
    expect(output).toContain('╠');
    expect(output).toContain('╣');
    expect(output).toContain('╚');
    expect(output).toContain('╝');
    expect(output).toContain('║');
  });

  it('renders DECKENT DASHBOARD header', () => {
    const state = makeDashboardState();
    const output = renderDashboard(state);
    expect(output).toContain('DECKENT DASHBOARD');
  });

  it('handles zero total progress without division error', () => {
    const state = makeDashboardState({
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
    });
    const output = renderDashboard(state);
    expect(output).toContain('0/0 done');
  });

  it('renders - for agent with no taskId', () => {
    const state = makeDashboardState({
      agents: [
        {
          id: 'w-1',
          role: 'worker',
          status: AgentStatus.IDLE,
          model: 'sonnet',
          tmuxWindow: 'w-1',
        },
      ] as AgentInfo[],
    });
    const output = renderDashboard(state);
    // The task column should show '-'
    const lines = output.split('\n');
    const workerLine = lines.find((l) => l.includes('w-1'));
    expect(workerLine).toBeDefined();
    expect(workerLine).toContain('-');
  });

  it('shows hours in elapsed time when >= 1 hour', () => {
    const state = makeDashboardState({
      agents: [
        {
          id: 'w-1',
          role: 'worker',
          status: AgentStatus.CODING,
          model: 'sonnet',
          tmuxWindow: 'w-1',
          taskId: '005-001',
          spawnedAt: new Date(Date.now() - 3_700_000).toISOString(), // ~1h1m
        },
      ] as AgentInfo[],
    });
    const output = renderDashboard(state);
    expect(output).toContain('1h');
  });

  it('renders updatedAt as --:--:-- when missing', () => {
    const state = makeDashboardState({ updatedAt: '' });
    const output = renderDashboard(state);
    expect(output).toContain('--:--:--');
  });

  it('renders multiple alerts', () => {
    const alerts: Alert[] = [
      { level: 'INFO' as never, message: 'Sprint started', timestamp: '2026-03-17T10:00:00.000Z' },
      { level: 'CRITICAL' as never, message: 'Worker crashed', timestamp: '2026-03-17T10:05:00.000Z' },
    ];
    const state = makeDashboardState({ alerts });
    const output = renderDashboard(state);
    expect(output).toContain('[INFO]');
    expect(output).toContain('[CRITICAL]');
    expect(output).toContain('Sprint started');
    expect(output).toContain('Worker crashed');
  });
});

describe('readDashboardFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(readDashboardFile('/test/.dashboard')).toBeNull();
  });

  it('returns parsed DashboardState when file exists', () => {
    const state = makeDashboardState();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(state));
    const result = readDashboardFile('/test/.dashboard');
    expect(result).toEqual(state);
  });

  it('returns null when file contains invalid JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not json');
    expect(readDashboardFile('/test/.dashboard')).toBeNull();
  });

  it('returns null when readFileSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => { throw new Error('read error'); });
    expect(readDashboardFile('/test/.dashboard')).toBeNull();
  });
});

describe('registerDashboard', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let processOnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
  });

  afterEach(() => {
    vi.useRealTimers();
    stdoutSpy.mockRestore();
    processOnSpy.mockRestore();
  });

  it('registers the dashboard command on the program', () => {
    const program = new Command();
    program.exitOverride();
    registerDashboard(program);
    const cmd = program.commands.find((c) => c.name() === 'dashboard');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Show terminal dashboard with auto-refresh (see also: deckent status --watch)');
  });

  it('prints no-sprint message when dashboard file not found', async () => {
    const program = new Command();
    program.exitOverride();
    registerDashboard(program);
    mockExistsSync.mockReturnValue(false);

    await program.parseAsync(['dashboard'], { from: 'user' });

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('No active run. Run deckent start first.');
  });

  it('renders dashboard when file exists', async () => {
    const program = new Command();
    program.exitOverride();
    registerDashboard(program);
    const state = makeDashboardState();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(state));

    await program.parseAsync(['dashboard'], { from: 'user' });

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('DECKENT DASHBOARD');
    expect(output).toContain('sprint-005');
  });

  it('registers a shutdown hook (not raw SIGINT/SIGTERM handlers) that idempotently clears the fallback refresh timer', async () => {
    let callCount = 0;
    mockExistsSync.mockImplementation(() => {
      callCount++;
      return false;
    });

    const program = new Command();
    program.exitOverride();
    registerDashboard(program);

    await program.parseAsync(['dashboard'], { from: 'user' });

    // born-587 (DEAD-LISTENER-MIGRATION): entry.ts's bootstrap-time onSignal
    // always wins SIGINT/SIGTERM registration order, so a command-level
    // process.on() listener here would be dead code. registerDashboard()
    // routes cleanup through the shared shutdown-hooks registry instead — no
    // raw listener is ever added.
    const signals = processOnSpy.mock.calls.map((c) => c[0]);
    expect(signals).not.toContain('SIGINT');
    expect(signals).not.toContain('SIGTERM');
    expect(mockRegisterShutdownHook).toHaveBeenCalledTimes(1);

    const hook = mockRegisterShutdownHook.mock.calls[0][0] as () => Promise<void>;
    await hook();
    await hook(); // idempotent re-entry (a second signal mid-cleanup) must not throw

    const afterHookCalls = callCount;
    vi.advanceTimersByTime(10_000);
    // Real cleanup, not just a spy assertion: the fallback setInterval is
    // actually cleared, so advancing time triggers no further renders.
    expect(callCount).toBe(afterHookCalls);
  });

  it('accepts custom interval option', async () => {
    const program = new Command();
    program.exitOverride();
    registerDashboard(program);
    mockExistsSync.mockReturnValue(false);

    await program.parseAsync(['dashboard', '--interval', '5000'], { from: 'user' });

    // Verify it ran initial render
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('No active run');
  });

  it('auto-refreshes on interval', async () => {
    const program = new Command();
    program.exitOverride();
    registerDashboard(program);

    let callCount = 0;
    mockExistsSync.mockImplementation(() => {
      callCount++;
      return false;
    });

    await program.parseAsync(['dashboard'], { from: 'user' });

    const initialCalls = callCount;
    vi.advanceTimersByTime(2000);
    expect(callCount).toBeGreaterThan(initialCalls);
  });

  it('clears screen before each render', async () => {
    const program = new Command();
    program.exitOverride();
    registerDashboard(program);
    mockExistsSync.mockReturnValue(false);

    await program.parseAsync(['dashboard'], { from: 'user' });

    expect(stdoutSpy).toHaveBeenCalledWith('\x1Bc');
  });
});
