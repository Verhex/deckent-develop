import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { DashboardState } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  watch: vi.fn().mockReturnValue({ close: vi.fn() }),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatDashboard: vi.fn().mockReturnValue('Dashboard Output'),
  formatHumanStatus: vi.fn().mockReturnValue('Human Status Output'),
  formatStandaloneStatus: vi.fn().mockReturnValue('Standalone Status Output'),
  formatTable: vi.fn().mockReturnValue('Table'),
  isNoColor: vi.fn().mockReturnValue(false),
  stripAnsi: vi.fn((s: string) => s),
  // W0-TRUTH (#491) orphan-gate: status.ts calls this before rendering the
  // human-friendly view. Default false (not orphaned) — the gate itself is
  // pinned separately below with an explicit orphaned=true override.
  isDashboardOrphaned: vi.fn(() => false),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn().mockReturnValue(null),
}));

// status.ts holds live status (RUN_STATUS_READ_MODEL_UNAVAILABLE) unless the canonical
// persisted read model exists AND matches the authority. These cases exercise the
// RENDERING surface, not the persistence guard, so the model is supplied here. Tests that
// want the HOLD path override `readCanonicalRunStatusReadModel` to return null — see the
// no-active-sprint cases.
// status.ts is authority-first: a quiescent (IDLE/COMPLETE/ABORTED) run authority short-
// circuits to "no active sprint" even when .tasks files exist. That is deliberate product
// behaviour, so the standalone/live rendering cases must declare an ACTIVE authority —
// otherwise they assert a contract the command no longer has. Default stays quiescent so
// the no-active-sprint cases keep testing what they always did.
const runAuthorityState = vi.hoisted(() => ({
  current: {
    schemaVersion: 1 as const,
    lifecycle: 'IDLE',
    active: false,
    resumable: false,
    sprintId: null,
    phase: null,
    status: null,
    reason: null,
    recoveryCommand: null,
    finalizeCommand: null,
    coordinator: 'absent',
    conflicts: [],
  } as Record<string, unknown>,
}));

function setActiveRunAuthority(sprintId = 'sprint-001'): void {
  runAuthorityState.current = {
    ...runAuthorityState.current,
    lifecycle: 'ACTIVE',
    active: true,
    sprintId,
    phase: 'EXECUTE',
    status: 'RUNNING',
    coordinator: 'alive',
  };
}

vi.mock('../../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(() => runAuthorityState.current),
}));

vi.mock('../../../src/core/run-status-read-model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/core/run-status-read-model.js')>()),
  readCanonicalRunStatusReadModel: vi.fn(() => ({
    schemaVersion: 1,
    revision: 1,
    runGeneration: 1,
    modelDigest: 'digest-test',
    holds: [],
    providerConcurrency: [],
    authority: {},
  })),
  runStatusReadModelMatchesAuthority: vi.fn(() => true),
}));

const deathSweep = vi.hoisted(() => vi.fn(() => ({ scanned: 0, closed: [], skipped: [] })));
vi.mock('../../../src/orchestra/run-flow-death-sweep.js', () => ({
  sweepDeadDetachedRuns: deathSweep,
}));

const shutdownHookState = vi.hoisted(() => ({
  hooks: [] as Array<() => Promise<void>>,
  register: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/shutdown-hooks.js', () => ({
  registerShutdownHook: (hook: () => Promise<void>) => {
    shutdownHookState.hooks.push(hook);
    shutdownHookState.register(hook);
    return shutdownHookState.unregister;
  },
}));

import { readFileSync, existsSync, readdirSync, watch } from 'node:fs';
import { print, printError, formatDashboard, formatHumanStatus, formatStandaloneStatus, isDashboardOrphaned } from '../../../src/cli/helpers/output.js';
import {
  appendTaskSettlementsToFollowSnapshot,
  registerStatus,
  loadDepGraphForSprint,
} from '../../../src/cli/commands/status.js';
import { getCurrentSprintId } from '../../../src/monitor/sprint-state.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDashboard(overrides?: Partial<DashboardState>): DashboardState {
  return {
    sprint: { id: 'sprint-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [],
    progress: { done: 3, active: 2, blocked: 0, total: 5 },
    alerts: [],
    updatedAt: new Date().toISOString(),
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

function lastShutdownHook(): () => Promise<void> {
  const hook = shutdownHookState.hooks[shutdownHookState.hooks.length - 1];
  if (!hook) throw new Error('no shutdown hook registered');
  return hook;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('status command (isolated)', () => {
  beforeEach(() => {
    runAuthorityState.current = { ...runAuthorityState.current, lifecycle: 'IDLE', active: false, resumable: false, sprintId: null, phase: null, status: null, coordinator: 'absent' };
    vi.clearAllMocks();
    shutdownHookState.hooks.length = 0;
    process.exitCode = undefined;
  });

  it('sweeps detached run deaths exactly once before rendering status', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await runCommand(['status']);

    expect(deathSweep).toHaveBeenCalledOnce();
    expect(deathSweep).toHaveBeenCalledWith('/mock/root');
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers status command with --watch, --json, --raw, and --no-color options', () => {
    const program = new Command();
    registerStatus(program);
    const cmd = program.commands.find(c => c.name() === 'status');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some(o => o.long === '--watch')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--json')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--raw')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--no-color')).toBe(true);
  });

  it('shows no active sprint message when dashboard and tasks do not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['status']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No active run (sprint)'));
  });

  it('(A) shows standalone status from task files when no dashboard', async () => {
    setActiveRunAuthority();
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return false;
      if (String(p).includes('.tasks')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      id: '001', title: 'Test Task', status: 'EXECUTING', sprintId: 'sprint-001',
      dependencies: [], model: 'sonnet', effort: 'normal',
    }));
    await runCommand(['status']);
    expect(formatStandaloneStatus).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Standalone Status Output');
  });

  it('(A) standalone with --json outputs JSON', async () => {
    // the task fixture below belongs to sprint-002; authority is the sprint-id source
    setActiveRunAuthority('sprint-002');
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return false;
      if (String(p).includes('.tasks')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      id: '001', title: 'Test', status: 'DONE', sprintId: 'sprint-002',
      dependencies: [], model: 'sonnet', effort: 'normal',
    }));
    await runCommand(['status', '--json']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonCall = printCalls.find(c => c[0].includes('standalone'));
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0]);
    expect(parsed.standalone).toBe(true);
    expect(parsed.sprintId).toBe('sprint-002');
  });

  it('adds read-only raw/effective receipt evidence to standalone JSON and closes the projection', async () => {
    setActiveRunAuthority();
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return false;
      if (String(p).includes('.tasks')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      id: '001', title: 'Test', status: 'PENDING', sprintId: 'sprint-001',
      dependencies: [], model: 'claude-sonnet-5', effort: 'normal',
    }));
    const close = vi.fn();
    const projection = {
      rawStatus: 'PENDING',
      effectiveStatus: 'DONE' as const,
      evidenceRefs: ['task-result:sha256:evidence'],
      receiptRef: {
        schemaVersion: 1 as const,
        tenantId: 'local',
        projectId: 'project-test',
        invocationId: 'invocation-1',
      },
      reasonCode: 'projected' as const,
    };
    const program = new Command();
    program.exitOverride();
    registerStatus(program, {
      openTaskSettlementProjection: () => ({
        projectId: 'project-test',
        diagnostic: 'ready',
        projectTaskExecutionState: () => projection,
        projectTaskExecutionStates: inputs => inputs.map(() => projection),
        close,
      }),
    });

    await program.parseAsync(['node', 'test', 'status', '--json']);

    const jsonOutput = vi.mocked(print).mock.calls.find(c => c[0].includes('taskSettlements'));
    const parsed = JSON.parse(jsonOutput![0]);
    expect(parsed.taskSettlements).toEqual([
      expect.objectContaining({
        taskId: '001',
        rawStatus: 'PENDING',
        effectiveStatus: 'DONE',
        receiptRef: expect.objectContaining({ invocationId: 'invocation-1' }),
        evidenceRefs: ['task-result:sha256:evidence'],
      }),
    ]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('projects all status tasks through one bulk read instead of per-task queries', async () => {
    setActiveRunAuthority('sprint-bulk');
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (String(path).includes('.dashboard')) return false;
      if (String(path).includes('.tasks')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue([
      'task-run-2.json',
      'task-run-1.json',
    ] as any);
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      const taskId = String(path).includes('task-run-1.json') ? 'run-1' : 'run-2';
      return JSON.stringify({
        id: taskId,
        title: taskId,
        status: 'PENDING',
        sprintId: 'sprint-bulk',
        dependencies: [],
        model: 'gpt-5.6-sol',
        effort: 'normal',
      });
    });
    const projectTaskExecutionState = vi.fn();
    const projectTaskExecutionStates = vi.fn(inputs => inputs.map(input => ({
      rawStatus: input.rawStatus,
      effectiveStatus: input.rawStatus,
      evidenceRefs: [],
      reasonCode: 'no-terminal-receipt' as const,
    })));
    const program = new Command();
    program.exitOverride();
    registerStatus(program, {
      openTaskSettlementProjection: () => ({
        projectId: 'project-test',
        diagnostic: 'ready',
        projectTaskExecutionState,
        projectTaskExecutionStates,
        close: vi.fn(),
      }),
    });

    await program.parseAsync(['node', 'test', 'status', '--json']);

    expect(projectTaskExecutionState).not.toHaveBeenCalled();
    expect(projectTaskExecutionStates).toHaveBeenCalledOnce();
    expect(projectTaskExecutionStates).toHaveBeenCalledWith([
      { taskId: 'run-1', rawStatus: 'PENDING', tenantId: 'local' },
      { taskId: 'run-2', rawStatus: 'PENDING', tenantId: 'local' },
    ]);
  });

  it('surfaces open receipt reconciliation evidence in human status', async () => {
    setActiveRunAuthority();
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.dashboard')) return false;
      if (String(p).includes('.tasks')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      id: '001', title: 'Test', status: 'PENDING', sprintId: 'sprint-001',
      dependencies: [], model: 'claude-sonnet-5', effort: 'normal',
    }));
    const projection = {
      rawStatus: 'PENDING',
      effectiveStatus: 'PENDING' as const,
      evidenceRefs: ['invocation-receipt:invocation-1:open'],
      reasonCode: 'open-receipt' as const,
    };
    const program = new Command();
    program.exitOverride();
    registerStatus(program, {
      openTaskSettlementProjection: () => ({
        projectId: 'project-test',
        diagnostic: 'ready',
        projectTaskExecutionState: () => projection,
        projectTaskExecutionStates: inputs => inputs.map(() => projection),
        close: vi.fn(),
      }),
    });

    await program.parseAsync(['node', 'test', 'status']);

    expect(print).toHaveBeenCalledWith(expect.stringContaining('open-receipt'));
    expect(print).toHaveBeenCalledWith(
      expect.stringContaining('invocation-receipt:invocation-1:open'),
    );
  });

  it('adds the same immutable settlement projection to follow snapshots', () => {
    const close = vi.fn();
    const projection = {
      rawStatus: 'PENDING',
      effectiveStatus: 'NOT_DISPATCHED' as const,
      evidenceRefs: ['invocation-event:settled'],
      receiptRef: {
        schemaVersion: 1 as const,
        tenantId: 'local',
        projectId: 'project-test',
        invocationId: 'invocation-1',
      },
      reasonCode: 'projected' as const,
    };
    const rendered = appendTaskSettlementsToFollowSnapshot(
      'LIVE SNAPSHOT',
      '/mock/root',
      [{
        id: '001',
        title: 'Test',
        status: 'PENDING',
        model: 'claude-sonnet-5',
        effort: 'normal',
        dependencies: [],
        scope: { directories: [], filesRead: [], filesWrite: [] },
      } as never],
      {
        openTaskSettlementProjection: () => ({
          projectId: 'project-test',
          diagnostic: 'ready',
          projectTaskExecutionState: () => projection,
          projectTaskExecutionStates: inputs => inputs.map(() => projection),
          close,
        }),
      },
      'en',
    );

    expect(rendered).toContain('LIVE SNAPSHOT');
    expect(rendered).toContain('NOT_DISPATCHED');
    expect(rendered).toContain('invocation-event:settled');
    expect(close).toHaveBeenCalledOnce();
  });

  it('renders human-friendly output by default', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Human Status Output');
  });

  it('(W0) isDashboardOrphaned=true routes to the no-active-sprint message, not the live view', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    vi.mocked(isDashboardOrphaned).mockReturnValueOnce(true);
    await runCommand(['status']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No active run (sprint)'));
    expect(formatHumanStatus).not.toHaveBeenCalled();
  });

  it('--raw renders legacy formatted dashboard', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    await runCommand(['status', '--raw']);
    expect(formatDashboard).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith('Dashboard Output');
  });

  it('--json outputs raw JSON', async () => {
    setActiveRunAuthority();
    const state = makeDashboard();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status', '--json']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonOutput = printCalls.find(c => c[0].includes('sprint-001'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput![0]);
    expect(parsed.sprint.id).toBe('sprint-001');
    expect(parsed.progress.done).toBe(3);
  });

  it('(E) --json --verbose includes agent/skill info', async () => {
    setActiveRunAuthority();
    const state = makeDashboard();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status', '--json', '--verbose']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonOutput = printCalls.find(c => c[0].includes('_verbose'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput![0]);
    expect(parsed._verbose).toBeDefined();
    expect(parsed._verbose.agents).toBeDefined();
  });

  it('handles corrupt dashboard file with error', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json!!!');
    await runCommand(['status']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('(D) --watch uses fs.watch with fallback interval', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => {});
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(['status', '--watch']);
    // fs.watch should be called
    expect(watch).toHaveBeenCalled();
    // Fallback interval at 5000ms
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(shutdownHookState.register).toHaveBeenCalledTimes(1);
    expect(
      onSpy.mock.calls.filter(
        ([event]) =>
          event === 'SIGINT'
          || event === 'SIGTERM'
          || event === 'SIGBREAK',
      ),
    ).toEqual([]);

    const watcher = vi.mocked(watch).mock.results.at(-1)?.value;
    const hook = lastShutdownHook();
    await hook();
    await hook();

    expect(watcher?.close).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(shutdownHookState.unregister).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('--watch with --json outputs JSON on each render', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      _value: string | Uint8Array,
      ...args: unknown[]
    ) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === 'function',
      );
      callback?.();
      return true;
    }) as typeof process.stdout.write);
    await runCommand(['status', '--watch', '--json']);
    const hasJson = stdoutSpy.mock.calls.some(call => {
      try { JSON.parse(String(call[0]).trim()); return true; } catch { return false; }
    });
    expect(hasJson).toBe(true);
    await lastShutdownHook()();
    expect(stdoutSpy.mock.calls.at(-1)?.[0]).toBe('');
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('--mode json emits one machine document without human settlement suffixes', async () => {
    setActiveRunAuthority();
    vi.mocked(existsSync).mockImplementation((path: any) =>
      String(path).includes('.dashboard'));
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));

    await runCommand(['status', '--mode', 'json']);

    const calls = vi.mocked(print).mock.calls.map(call => call[0]);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!)).toMatchObject({
      sprint: { id: 'sprint-001' },
      taskSettlements: [],
    });
    expect(formatHumanStatus).not.toHaveBeenCalled();
  });

  it('--mode json --graph preserves the single-document machine contract', async () => {
    vi.mocked(getCurrentSprintId).mockReturnValue(null);

    await runCommand(['status', '--mode', 'json', '--graph']);

    const calls = vi.mocked(print).mock.calls.map(call => call[0]);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!)).toEqual({
      schemaVersion: 1,
      command: 'status.graph',
      active: false,
      sprintId: null,
      graph: null,
      reasonCode: 'no-active-run',
    });
  });

  it('--watch --mode json emits ANSI-free NDJSON records', async () => {
    setActiveRunAuthority();
    vi.mocked(existsSync).mockImplementation((path: any) =>
      String(path).includes('.dashboard'));
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      _value: string | Uint8Array,
      ...args: unknown[]
    ) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === 'function',
      );
      callback?.();
      return true;
    }) as typeof process.stdout.write);

    await runCommand(['status', '--watch', '--mode', 'json']);

    const records = stdoutSpy.mock.calls
      .map(call => String(call[0]))
      .filter(frame => frame.trim().startsWith('{'));
    expect(records).toHaveLength(1);
    expect(records[0]).not.toContain('\u001b');
    expect(JSON.parse(records[0]!.trim())).toMatchObject({
      sprint: { id: 'sprint-001' },
      taskSettlements: [],
    });
    await lastShutdownHook()();
    expect(stdoutSpy.mock.calls.at(-1)?.[0]).toBe('');
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('--watch bounds burst output to in-flight plus latest and drains before shutdown', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => {});
    const pendingWrites: Array<{
      value: string;
      callback: (error?: Error | null) => void;
    }> = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      value: string | Uint8Array,
      ...args: unknown[]
    ) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === 'function',
      );
      if (!callback) throw new Error('missing stdout callback');
      pendingWrites.push({ value: String(value), callback });
      return false;
    }) as typeof process.stdout.write);

    await runCommand(['status', '--watch']);
    expect(pendingWrites).toHaveLength(1);
    const watchCallback = vi.mocked(watch).mock.calls.at(-1)?.[2] as
      | (() => void)
      | undefined;
    expect(watchCallback).toBeDefined();

    vi.mocked(formatHumanStatus).mockReturnValueOnce('watch-a');
    watchCallback?.();
    vi.mocked(formatHumanStatus).mockReturnValueOnce('watch-b');
    watchCallback?.();
    expect(pendingWrites).toHaveLength(1);

    pendingWrites[0]!.callback();
    process.stdout.emit('drain');
    await vi.waitFor(() => {
      expect(pendingWrites).toHaveLength(2);
    });
    expect(pendingWrites[1]!.value).toBe('\x1Bcwatch-b\n');
    expect(pendingWrites.some(write => write.value.includes('watch-a'))).toBe(false);

    let hookResolved = false;
    const hookPromise = lastShutdownHook()().then(() => {
      hookResolved = true;
    });
    await Promise.resolve();
    expect(hookResolved).toBe(false);
    expect(pendingWrites).toHaveLength(2);

    pendingWrites[1]!.callback();
    process.stdout.emit('drain');
    await vi.waitFor(() => {
      expect(pendingWrites).toHaveLength(3);
    });
    expect(pendingWrites[2]!.value).toBe('\n');
    expect(hookResolved).toBe(false);

    pendingWrites[2]!.callback();
    process.stdout.emit('drain');
    await hookPromise;

    expect(hookResolved).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(shutdownHookState.unregister).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('--follow --json emits ANSI-free NDJSON instead of the human TUI', async () => {
    setActiveRunAuthority();
    vi.mocked(existsSync).mockImplementation((path: any) =>
      String(path).includes('.dashboard'));
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      _value: string | Uint8Array,
      ...args: unknown[]
    ) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === 'function',
      );
      callback?.();
      return true;
    }) as typeof process.stdout.write);

    await runCommand(['status', '--follow', '--json']);

    const writes = stdoutSpy.mock.calls
      .map(call => String(call[0]))
      .filter(value => value.trim().startsWith('{'));
    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toContain('\u001b');
    expect(JSON.parse(writes[0]!.trim())).toMatchObject({
      sprint: { id: 'sprint-001' },
      taskSettlements: [],
    });
    await lastShutdownHook()();
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('--watch uses human-friendly output by default', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(['status', '--watch']);
    expect(formatHumanStatus).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('--watch --raw uses legacy dashboard', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(42 as any);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(['status', '--watch', '--raw']);
    expect(formatDashboard).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('human-friendly output is called with dashboard data and projectRoot', async () => {
    const state = makeDashboard({
      agents: [
        { id: 'w-001', role: 'worker' as any, status: 'EXECUTING' as any, model: 'sonnet', tmuxWindow: 'w-001', taskId: '001', currentAction: 'coding', spawnedAt: '' },
      ],
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalledWith(expect.objectContaining({
      dashboard: expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ id: 'w-001' })]),
      }),
      projectRoot: '/mock/root',
    }));
  });

  it('human-friendly output includes tasks from loadTaskFiles', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalledWith(expect.objectContaining({
      tasks: expect.any(Array),
    }));
  });

  it('dashboard with alerts renders in human-friendly mode', async () => {
    const state = makeDashboard({
      alerts: [{ level: 'WARNING' as any, message: 'stale heartbeat', timestamp: '' }],
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalledWith(expect.objectContaining({
      dashboard: expect.objectContaining({
        alerts: expect.arrayContaining([expect.objectContaining({ message: 'stale heartbeat' })]),
      }),
    }));
  });

  it('(F) readSprintMeta tolerant regex matches various formats', async () => {
    // Test that various DIRECTIVES.md title formats are parsed
    vi.mocked(existsSync).mockReturnValue(true);
    // The DIRECTIVES.md uses ": Title" format instead of "(Title)"
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      const path = String(p);
      if (path.includes('DIRECTIVES.md')) {
        return '# DIRECTIVES: Sprint 056 — CLI Perfection Wave';
      }
      if (path.includes('.dashboard')) {
        return JSON.stringify(makeDashboard());
      }
      return JSON.stringify(makeDashboard());
    });
    await runCommand(['status']);
    expect(formatHumanStatus).toHaveBeenCalledWith(expect.objectContaining({
      sprintTitle: expect.stringContaining('CLI Perfection Wave'),
    }));
  });
});

// ─── --graph flag tests (Task 139-031) ───────────────────────────────────────

const sampleMmd = `graph TD
  t_139_001["139-001 (W0)"]
  t_139_002["139-002 (W1)"]
  t_139_001 --> t_139_002`;

describe('status --graph flag (Task 139-031)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    // Default for graph tests: active sprint
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers --graph option on status command', () => {
    const program = new Command();
    registerStatus(program);
    const cmd = program.commands.find(c => c.name() === 'status');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some(o => o.long === '--graph')).toBe(true);
  });

  it('prints Mermaid diagram when --graph is provided and depgraph exists', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      return String(p).endsWith('.mmd');
    });
    vi.mocked(readFileSync).mockReturnValue(sampleMmd);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');

    await runCommand(['status', '--graph']);
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('graph TD'),
    );
  });

  it('prints "no dependency graph" message when depgraph does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');

    await runCommand(['status', '--graph']);
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('No dependency graph found'),
    );
  });

  it('prints "no active run" when getCurrentSprintId returns null', async () => {
    vi.mocked(getCurrentSprintId).mockReturnValue(null);
    vi.mocked(existsSync).mockReturnValue(false);

    await runCommand(['status', '--graph']);
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('No active run'),
    );
  });

  it('Mermaid output includes sprint-specific header', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      return String(p).endsWith('.mmd');
    });
    vi.mocked(readFileSync).mockReturnValue(sampleMmd);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');

    await runCommand(['status', '--graph']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    const hasSprintRef = calls.some(c => String(c).includes('sprint-139'));
    expect(hasSprintRef).toBe(true);
  });

  it('Mermaid output includes task nodes with wave notation', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      return String(p).endsWith('.mmd');
    });
    vi.mocked(readFileSync).mockReturnValue(sampleMmd);

    await runCommand(['status', '--graph']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    const hasMmd = calls.some(c => String(c).includes('(W0)') || String(c).includes('(W1)'));
    expect(hasMmd).toBe(true);
  });
});

// ─── loadDepGraphForSprint unit tests ────────────────────────────────────────

describe('loadDepGraphForSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when mmd file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = loadDepGraphForSprint('/root', 'sprint-139');
    expect(result).toBeNull();
  });

  it('returns file content when mmd file exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(sampleMmd);
    const result = loadDepGraphForSprint('/root', 'sprint-139');
    expect(result).toBe(sampleMmd);
  });

  it('returns null when readFileSync throws', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('EACCES: permission denied'); });
    const result = loadDepGraphForSprint('/root', 'sprint-139');
    expect(result).toBeNull();
  });

  it('constructs correct mmd path using sprint-NNN-depgraph.mmd pattern', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('graph TD');
    loadDepGraphForSprint('/my/project', 'sprint-042');
    expect(vi.mocked(readFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('sprint-042-depgraph.mmd'),
      'utf-8',
    );
  });

  it('checks path inside .deckent directory', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('graph TD');
    loadDepGraphForSprint('/project', 'sprint-001');
    expect(vi.mocked(existsSync)).toHaveBeenCalledWith(
      expect.stringContaining('.deckent'),
    );
  });
});
