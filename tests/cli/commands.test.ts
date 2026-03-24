import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, DashboardState, ResolvedConfig } from '../../src/core/types.js';

// ─── Common Mocks ───────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
  validatePartialConfig: vi.fn(),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
  ConfigValidationError: class ConfigValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(errors.join(', '));
      this.name = 'ConfigValidationError';
      this.errors = errors;
    }
  },
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
  readJsonSafe: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  checkUsage: vi.fn(),
  adjustSprintSize: vi.fn(),
  planSprint: vi.fn(),
  cleanup: vi.fn(),
  runDecay: vi.fn(),
  confirmDraftTasks: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  attach: vi.fn(),
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  destroy: vi.fn(),
  setupWatchWindow: vi.fn(),
  TmuxError: class TmuxError extends Error {
    command?: string;
    constructor(msg: string, cmd?: string) {
      super(msg);
      this.name = 'TmuxError';
      this.command = cmd;
    }
  },
}));

vi.mock('../../src/agents/worker.js', () => ({
  readTask: vi.fn(),
}));

vi.mock('../../src/core/plugin.js', () => ({
  loadPlugin: vi.fn(),
  scanPlugins: vi.fn().mockReturnValue([]),
  createPlugin: vi.fn(),
  PluginError: class PluginError extends Error {
    constructor(msg: string) { super(msg); this.name = 'PluginError'; }
  },
}));

// ─── Static Imports (after mocks) ──────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { countBrainLines, ensureDeckentImport, readJsonSafe } from '../../src/core/utils.js';
import { loadConfig, validatePartialConfig, ConfigValidationError } from '../../src/core/config.js';
import { runSprint, readContext, checkUsage, adjustSprintSize, planSprint, cleanup, runDecay, BrainError, confirmDraftTasks } from '../../src/orchestra/brain.js';
import { isSessionActive, attach, ensureSession, spawnWorker, killWorker, destroy, setupWatchWindow, TmuxError } from '../../src/orchestra/tmux.js';
import { readTask } from '../../src/agents/worker.js';

// ─── Command Imports ────────────────────────────────────────────────

import { registerDoctor } from '../../src/cli/commands/doctor.js';
import { registerAttach } from '../../src/cli/commands/attach.js';
import { registerKill } from '../../src/cli/commands/kill.js';
import { registerUsage } from '../../src/cli/commands/usage.js';
import { registerRetro } from '../../src/cli/commands/retro.js';
import { registerStatus } from '../../src/cli/commands/status.js';
import { registerHistory, parseSprintLog, formatDurationMs } from '../../src/cli/commands/history.js';
import { registerConfig } from '../../src/cli/commands/config.js';
import { registerSpawn } from '../../src/cli/commands/spawn.js';
import { registerCleanup } from '../../src/cli/commands/cleanup.js';
import { registerStart } from '../../src/cli/commands/start.js';
import { registerPlan } from '../../src/cli/commands/plan.js';
import { registerPlugin } from '../../src/cli/commands/plugin.js';
import { registerUpgrade } from '../../src/cli/commands/upgrade.js';
import { registerOnboard } from '../../src/cli/commands/onboard.js';
import { registerInit } from '../../src/cli/commands/init.js';

// ─── Helpers ────────────────────────────────────────────────────────

let stdoutData: string[];
let stderrData: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function captureOutput(): void {
  stdoutData = [];
  stderrData = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutData.push(String(data));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
    stderrData.push(String(data));
    return true;
  });
}

function restoreOutput(): void {
  stdoutSpy?.mockRestore();
  stderrSpy?.mockRestore();
}

function stdout(): string {
  return stdoutData.join('');
}

function stderr(): string {
  return stderrData.join('');
}

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true, usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test-project',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...overrides,
  };
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 's-001', number: 1, status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE, tasks: [], workers: [],
    ...overrides,
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-001', title: 'Test task', description: 'desc',
    model: 'sonnet', effort: 'normal', priority: 'NORMAL',
    reason: 'test', scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

async function runCommand(registerFn: (p: Command) => void, args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerFn(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch (err) {
    // Commander throws on exitOverride — ignore
    if (err instanceof Error && err.message.includes('commander.')) {
      // expected
    }
  }
}

// ─── Doctor Command ─────────────────────────────────────────────────

describe('doctor command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
    // Default mocks for project-level checks
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Content\nSome data');
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(countBrainLines).mockReturnValue(100);
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('reports all passing checks', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      const outputs: Record<string, string> = {
        node: 'v22.0.0', git: 'git version 2.44.0', tmux: 'tmux 3.4', claude: '1.0.0',
      };
      return { status: 0, stdout: outputs[cmd as string] ?? '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
    });
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('Deckent Health Check');
    expect(stdout()).toContain('OK Node.js');
  });

  it('reports failing required check', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'tmux') return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
      return { status: 0, stdout: 'v22.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
    });
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('FAIL tmux');
    expect(process.exitCode).toBe(1);
  });

  it('detects old Node version', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'node') return { status: 0, stdout: 'v16.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
      return { status: 0, stdout: 'ok', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
    });
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('v16.0.0');
    expect(process.exitCode).toBe(1);
  });

  it('handles missing Node', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('not found');
  });

  it('handles git version output format', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'git') return { status: 0, stdout: 'git version 2.44.0.windows.1', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
      return { status: 0, stdout: 'v22.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
    });
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('v2.44.0');
  });

  it('sets ok=false when required check fails', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    await runCommand(registerDoctor, ['doctor']);
    expect(process.exitCode).toBe(1);
  });

  it('reports workspace missing', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'v22.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('.deckent/ missing');
  });

  it('reports brain budget over limit', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'v22.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    vi.mocked(countBrainLines).mockReturnValue(650);
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('650/600');
    expect(stdout()).toContain('OVER BUDGET');
  });

  it('reports critical debt', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'v22.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('DEBT')) {
        return '| ID | Desc |\n|---|---|\n| d-1 | fix | task-1 | s-1 | CRITICAL | 3 | false | - | 2026 |';
      }
      return '# Content\nSome data';
    });
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('critical');
  });

  it('reports stale locks', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'v22.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    vi.mocked(readdirSync).mockReturnValue(['test.lock'] as unknown as ReturnType<typeof readdirSync>);
    const staleTime = new Date(Date.now() - 400_000).toISOString();
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.includes('.lock')) {
        return JSON.stringify({ acquiredAt: staleTime }) as unknown as ReturnType<typeof readFileSync>;
      }
      return '# Content\nSome data' as unknown as ReturnType<typeof readFileSync>;
    });
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('stale lock');
  });
});

// ─── Attach Command ─────────────────────────────────────────────────

describe('attach command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('attaches when session is active', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => {});
    await runCommand(registerAttach, ['attach']);
    expect(attach).toHaveBeenCalled();
  });

  it('prints error when no session', async () => {
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(registerAttach, ['attach']);
    expect(stderr()).toContain('No active session');
    expect(process.exitCode).toBe(1);
  });

  it('handles TmuxError', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => { throw new TmuxError('fail'); });
    await runCommand(registerAttach, ['attach']);
    expect(stderr()).toContain('fail');
    expect(process.exitCode).toBe(1);
  });
});

// ─── Kill Command ───────────────────────────────────────────────────

describe('kill command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('kills a worker', async () => {
    vi.mocked(killWorker).mockImplementation(() => {});
    await runCommand(registerKill, ['kill', 'task-001']);
    expect(stdout()).toContain('task-001 killed');
  });

  it('handles not found worker', async () => {
    vi.mocked(killWorker).mockImplementation(() => { throw new TmuxError('no window'); });
    await runCommand(registerKill, ['kill', 'task-999']);
    expect(stderr()).toContain('Worker not found');
    expect(process.exitCode).toBe(1);
  });

  it('does not show Worker not found for non-TmuxError', async () => {
    vi.mocked(killWorker).mockImplementation(() => { throw new TypeError('bad'); });
    await runCommand(registerKill, ['kill', 'task-001']);
    expect(stderr()).not.toContain('Worker not found');
  });
});

// ─── Usage Command ──────────────────────────────────────────────────

describe('usage command', () => {
  beforeEach(() => { vi.clearAllMocks(); captureOutput(); });
  afterEach(() => restoreOutput());

  it('prints usage output', async () => {
    await runCommand(registerUsage, ['usage']);
    expect(stdout().length).toBeGreaterThan(0);
  });

  it('mentions usage or sprint in output', async () => {
    await runCommand(registerUsage, ['usage']);
    const out = stdout().toLowerCase();
    expect(out.includes('usage') || out.includes('sprint') || out.includes('no usage')).toBe(true);
  });
});

// ─── Retro Command ──────────────────────────────────────────────────

describe('retro command', () => {
  beforeEach(() => { vi.clearAllMocks(); captureOutput(); });
  afterEach(() => restoreOutput());

  it('prints retro content when file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Sprint 1 Retro\nGood stuff');
    await runCommand(registerRetro, ['retro']);
    // Rich summary format is now the default (use --raw for original content)
    expect(stdout()).toContain('Sprint Retrospective');
  });

  it('prints message when no retro file', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(registerRetro, ['retro']);
    expect(stdout()).toContain('No retrospective found');
  });

  it('handles empty retro file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');
    await runCommand(registerRetro, ['retro']);
    expect(stdout()).toContain('empty');
  });
});

// ─── Status Command ─────────────────────────────────────────────────

describe('status command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('shows dashboard when file exists', async () => {
    const state: DashboardState = {
      sprint: { id: 's-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' },
      alerts: [],
      updatedAt: '2026-03-16T00:00:00Z',
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(registerStatus, ['status']);
    expect(stdout()).toContain('Sprint 001');
  });

  it('prints message when no dashboard', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(registerStatus, ['status']);
    expect(stdout()).toContain('No active sprint');
  });

  it('handles corrupt dashboard file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not json');
    await runCommand(registerStatus, ['status']);
    expect(stderr()).toContain('Failed to read dashboard');
    expect(process.exitCode).toBe(1);
  });

  it('renders human-friendly status by default', async () => {
    const state: DashboardState = {
      sprint: { id: 's-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' },
      alerts: [],
      updatedAt: '2026-03-16T00:00:00Z',
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(registerStatus, ['status']);
    expect(stdout()).toContain('Progress:');
  });

  it('--json outputs parseable JSON', async () => {
    const state: DashboardState = {
      sprint: { id: 's-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' },
      alerts: [],
      updatedAt: '2026-03-16T00:00:00Z',
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(registerStatus, ['status', '--json']);
    const parsed = JSON.parse(stdout());
    expect(parsed.sprint.id).toBe('s-001');
  });

  it('--watch sets up interval', async () => {
    const state: DashboardState = {
      sprint: { id: 's-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' },
      alerts: [],
      updatedAt: '2026-03-16T00:00:00Z',
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    await runCommand(registerStatus, ['status', '--watch']);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    setIntervalSpy.mockRestore();
    onSpy.mockRestore();
  });
});

// ─── History Command ────────────────────────────────────────────────

describe('history command', () => {
  beforeEach(() => { vi.clearAllMocks(); captureOutput(); });
  afterEach(() => restoreOutput());

  it('shows sprint history table with 6 columns', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(
      '# sprint-001\n\n## Metrics\n| Metric | Value |\n|--------|-------|\n| Total Tasks | 3 |\n| Completed | 2 |\n| Tech Debt | 1 |\n| No-Go | 1 |\n| Coverage | 91.0% |\n| Duration | 5000ms |'
    );
    await runCommand(registerHistory, ['history']);
    const out = stdout();
    expect(out).toContain('Sprint');
    expect(out).toContain('Tasks');
    expect(out).toContain('Completed');
    expect(out).toContain('No-Go Rate');
    expect(out).toContain('Coverage');
    expect(out).toContain('Duration');
    expect(out).toContain('sprint-001');
    expect(out).toContain('3');
    expect(out).toContain('2');
    expect(out).toContain('33%');
    expect(out).toContain('91.0%');
    expect(out).toContain('5s');
  });

  it('prints message when no history dir', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(registerHistory, ['history']);
    expect(stdout()).toContain('No sprint history');
  });

  it('prints message when no sprint files', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    await runCommand(registerHistory, ['history']);
    expect(stdout()).toContain('No sprint history');
  });

  it('shows "-" for missing tasks/coverage/duration fields', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Sprint 1\nNo structured fields here');
    await runCommand(registerHistory, ['history']);
    expect(stdout()).toContain('-');
  });

  it('shows "Unknown" for sprint without title', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('no title line\n| Total Tasks | 3 |\n| No-Go | 0 |');
    await runCommand(registerHistory, ['history']);
    expect(stdout()).toContain('Unknown');
  });

  it('formats duration from ms to human-readable', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(
      '# sprint-001\n| Metric | Value |\n|--------|-------|\n| Total Tasks | 2 |\n| Completed | 2 |\n| No-Go | 0 |\n| Coverage | 95.0% |\n| Duration | 366131ms |'
    );
    await runCommand(registerHistory, ['history']);
    expect(stdout()).toContain('6m 6s');
  });

  it('calculates no-go rate as percentage', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(
      '# sprint-001\n| Metric | Value |\n|--------|-------|\n| Total Tasks | 4 |\n| Completed | 2 |\n| No-Go | 2 |\n| Coverage | 80.0% |\n| Duration | 30000ms |'
    );
    await runCommand(registerHistory, ['history']);
    expect(stdout()).toContain('50%');
  });

  it('shows 0% no-go rate when no failures', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(
      '# sprint-001\n| Metric | Value |\n|--------|-------|\n| Total Tasks | 3 |\n| Completed | 3 |\n| No-Go | 0 |\n| Coverage | 95.0% |\n| Duration | 10000ms |'
    );
    await runCommand(registerHistory, ['history']);
    expect(stdout()).toContain('0%');
  });

  it('falls back to non-table format for legacy logs', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('# Sprint 1\nTasks: 5\nCoverage: 88%\nDuration: 45s');
    await runCommand(registerHistory, ['history']);
    const out = stdout();
    expect(out).toContain('Sprint 1');
    expect(out).toContain('5');
    expect(out).toContain('88%');
    expect(out).toContain('45s');
  });
});

// ─── History Helpers (unit) ─────────────────────────────────────────

describe('formatDurationMs', () => {
  it('converts ms under 60s', () => {
    expect(formatDurationMs('5000ms')).toBe('5s');
  });

  it('converts ms over 60s', () => {
    expect(formatDurationMs('366131ms')).toBe('6m 6s');
  });

  it('returns 0s for 0ms', () => {
    expect(formatDurationMs('0ms')).toBe('0s');
  });

  it('passes through non-ms values', () => {
    expect(formatDurationMs('120s')).toBe('120s');
    expect(formatDurationMs('-')).toBe('-');
  });
});

describe('parseSprintLog', () => {
  it('parses full table format', () => {
    const content = '# sprint-005\n\n## Metrics\n| Metric | Value |\n|--------|-------|\n| Total Tasks | 4 |\n| Completed | 3 |\n| Tech Debt | 1 |\n| No-Go | 1 |\n| Coverage | 92.5% |\n| Duration | 120000ms |';
    const r = parseSprintLog(content);
    expect(r.sprint).toBe('sprint-005');
    expect(r.tasks).toBe('4');
    expect(r.completed).toBe('3');
    expect(r.noGoRate).toBe('25%');
    expect(r.coverage).toBe('92.5%');
    expect(r.duration).toBe('2m 0s');
  });

  it('returns dashes for missing fields', () => {
    const r = parseSprintLog('# Sprint 1\nNothing here');
    expect(r.tasks).toBe('-');
    expect(r.completed).toBe('-');
    expect(r.noGoRate).toBe('-');
    expect(r.coverage).toBe('-');
    expect(r.duration).toBe('-');
  });

  it('handles zero total tasks', () => {
    const content = '# sprint-001\n| Metric | Value |\n|--------|-------|\n| Total Tasks | 0 |\n| Completed | 0 |\n| No-Go | 0 |\n| Coverage | 0.0% |\n| Duration | 84ms |';
    const r = parseSprintLog(content);
    expect(r.tasks).toBe('0');
    expect(r.noGoRate).toBe('0%');
    expect(r.duration).toBe('0s');
  });
});

// ─── Config Command ─────────────────────────────────────────────────

describe('config command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('shows current config', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    await runCommand(registerConfig, ['config']);
    expect(stdout()).toContain('max_plan');
    expect(stdout()).toContain('test-project');
  });

  it('sets a config value', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"mode":"max_plan"}');
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    await runCommand(registerConfig, ['config', 'set', 'language', 'tr']);
    expect(writeFileSync).toHaveBeenCalled();
    expect(stdout()).toContain('Set language');
  });

  it('handles missing config file on set', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    await runCommand(registerConfig, ['config', 'set', 'mode', '"pro_plan"']);
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('handles validation error on set', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(validatePartialConfig).mockImplementation(() => {
      throw new ConfigValidationError(['bad mode']);
    });
    await runCommand(registerConfig, ['config', 'set', 'mode', 'invalid']);
    expect(stderr()).toContain('Invalid config');
    expect(process.exitCode).toBe(1);
  });

  it('handles loadConfig error', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('no config'));
    await runCommand(registerConfig, ['config']);
    expect(stderr()).toContain('no config');
    expect(process.exitCode).toBe(1);
  });
});

// ─── Spawn Command ──────────────────────────────────────────────────

describe('spawn command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('spawns a worker for a task', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
    await runCommand(registerSpawn, ['spawn', 'task-001']);
    expect(spawnWorker).toHaveBeenCalled();
    expect(stdout()).toContain('Worker spawned');
  });

  it('handles task not found', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readTask).mockImplementation(() => { throw new Error('Task not found'); });
    await runCommand(registerSpawn, ['spawn', 'task-999']);
    expect(stderr()).toContain('Task not found');
    expect(process.exitCode).toBe(1);
  });

  it('passes correct model to spawnWorker', async () => {
    const task = makeTask({ model: 'haiku' });
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readTask).mockReturnValue(task);
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
    await runCommand(registerSpawn, ['spawn', 'task-001']);
    expect(spawnWorker).toHaveBeenCalledWith(
      'task-001', 'haiku', expect.any(String), expect.any(String), expect.any(Object),
    );
  });

  it('ensures session before spawning', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
    await runCommand(registerSpawn, ['spawn', 'task-001']);
    expect(ensureSession).toHaveBeenCalled();
  });

  it('spawn does not use haiku_allowed as autoApprove', async () => {
    // haiku_allowed belongs to model config — autoApprove is always false for spawn command
    vi.mocked(readTask).mockReturnValue(makeTask());
    vi.mocked(ensureSession).mockImplementation(() => {});
    vi.mocked(spawnWorker).mockImplementation(() => {});
    await runCommand(registerSpawn, ['spawn', 'task-001']);
    const spawnOpts = vi.mocked(spawnWorker).mock.calls[0]?.[4];
    expect(spawnOpts?.autoApprove).toBe(false);
  });
});

// ─── Cleanup Command ────────────────────────────────────────────────

describe('cleanup command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('cleans up with tasks', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeTask()) as unknown as ReturnType<typeof readFileSync>);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(destroy).mockImplementation(() => {});
    await runCommand(registerCleanup, ['cleanup']);
    expect(cleanup).toHaveBeenCalled();
    expect(stdout()).toContain('Cleanup complete');
    expect(stdout()).toContain('1 tasks');
  });

  it('handles empty tasks dir', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(destroy).mockImplementation(() => {});
    await runCommand(registerCleanup, ['cleanup']);
    expect(stdout()).toContain('0 tasks');
  });

  it('handles missing tasks dir', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(destroy).mockImplementation(() => {});
    await runCommand(registerCleanup, ['cleanup']);
    expect(stdout()).toContain('0 tasks');
  });

  it('skips malformed task JSON files', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-bad.json'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue('not-valid-json{{');
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(destroy).mockImplementation(() => {});
    await runCommand(registerCleanup, ['cleanup']);
    expect(stdout()).toContain('0 tasks');
  });

  it('handles destroy() throwing silently', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(destroy).mockImplementation(() => { throw new Error('no session'); });
    await runCommand(registerCleanup, ['cleanup']);
    expect(stdout()).toContain('Cleanup complete');
    expect(process.exitCode).toBeUndefined();
  });

  it('handles cleanup() throwing', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(cleanup).mockImplementation(() => { throw new Error('cleanup failed'); });
    await runCommand(registerCleanup, ['cleanup']);
    expect(stderr()).toContain('cleanup failed');
    expect(process.exitCode).toBe(1);
  });

  it('--decay flag runs runDecay with force', async () => {
    vi.mocked(runDecay).mockReturnValue({
      linesBefore: 350, linesAfter: 200,
      archivedSprints: ['sprint-001.md'], removedDebtCount: 2, removedPatternCount: 1,
    });
    await runCommand(registerCleanup, ['cleanup', '--decay']);
    expect(runDecay).toHaveBeenCalledWith(expect.any(String), 'sprint-cleanup', { force: true });
    expect(stdout()).toContain('350');
    expect(stdout()).toContain('200');
    expect(stdout()).toContain('sprint-001.md');
    expect(stdout()).toContain('2 debt');
  });

  it('--decay with no archived sprints', async () => {
    vi.mocked(runDecay).mockReturnValue({
      linesBefore: 100, linesAfter: 100,
      archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0,
    });
    await runCommand(registerCleanup, ['cleanup', '--decay']);
    expect(stdout()).toContain('100');
    expect(stdout()).not.toContain('Archived');
    expect(stdout()).not.toContain('Removed');
  });
});

// ─── Start Command ──────────────────────────────────────────────────

describe('start command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
    // Doctor pre-flight: make all tool checks pass
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      const outputs: Record<string, string> = {
        node: 'v22.0.0', git: 'git version 2.44.0', tmux: 'tmux 3.4', claude: '1.0.0',
      };
      return { status: 0, stdout: outputs[cmd as string] ?? '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Content');
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(countBrainLines).mockReturnValue(100);
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('runs sprint and shows summary', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    await runCommand(registerStart, ['start']);
    expect(runSprint).toHaveBeenCalled();
    expect(stdout()).toContain('Sprint 001');
  });

  it('handles --auto-approve', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    await runCommand(registerStart, ['start', '--auto-approve']);
    const optsArg = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(optsArg?.autoApprove).toBe(true);
  });

  it('handles --sandbox-mode stub', async () => {
    await runCommand(registerStart, ['start', '--sandbox-mode']);
    expect(stdout()).toContain('Sandbox mode not yet implemented');
  });

  it('passes sandboxMode=undefined to runSprint when not set', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    await runCommand(registerStart, ['start']);
    const optsArg = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(optsArg?.autoApprove).toBe(false);
    expect(optsArg?.sandboxMode).toBeFalsy();
  });

  it('does not call runSprint when --sandbox-mode given', async () => {
    await runCommand(registerStart, ['start', '--sandbox-mode']);
    expect(runSprint).not.toHaveBeenCalled();
  });

  it('handles BrainError', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockRejectedValue(new BrainError('fail', 'PLAN'));
    await runCommand(registerStart, ['start']);
    expect(stderr()).toContain('Sprint failed');
    expect(stderr()).toContain('PLAN');
    expect(process.exitCode).toBe(1);
  });

  it('handles generic error', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockRejectedValue(new Error('unknown'));
    await runCommand(registerStart, ['start']);
    expect(stderr()).toContain('unknown');
    expect(process.exitCode).toBe(1);
  });

  it('pre-flight failure prevents runSprint', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    await runCommand(registerStart, ['start']);
    expect(runSprint).not.toHaveBeenCalled();
    expect(stderr()).toContain('Pre-flight failed');
    expect(process.exitCode).toBe(1);
  });

  it('--force skips pre-flight', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    await runCommand(registerStart, ['start', '--force']);
    expect(runSprint).toHaveBeenCalled();
  });

  it('--dry-run plans but does not spawn', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    });
    vi.mocked(checkUsage).mockReturnValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' });
    vi.mocked(adjustSprintSize).mockReturnValue({
      size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK',
    });
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: 'task-001', title: 'Test task' })],
    }));
    await runCommand(registerStart, ['start', '--dry-run']);
    expect(runSprint).not.toHaveBeenCalled();
    expect(stdout()).toContain('Dry-run complete');
    expect(stdout()).toContain('task-001');
  });

  it('--watch creates watch window before sprint when tmux session active', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    vi.mocked(isSessionActive).mockReturnValue(true);
    await runCommand(registerStart, ['start', '--watch', '--force']);
    expect(setupWatchWindow).toHaveBeenCalledWith('deckent', expect.any(String));
    expect(stdout()).toContain('Watch window created');
    expect(runSprint).toHaveBeenCalled();
  });

  it('--watch + --dry-run skips watch setup', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    });
    vi.mocked(checkUsage).mockReturnValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' });
    vi.mocked(adjustSprintSize).mockReturnValue({
      size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK',
    });
    vi.mocked(planSprint).mockReturnValue(makeSprint({ tasks: [] }));
    await runCommand(registerStart, ['start', '--dry-run', '--watch', '--force']);
    expect(setupWatchWindow).not.toHaveBeenCalled();
    expect(stdout()).toContain('--watch ignored in dry-run mode');
    expect(stdout()).toContain('Dry-run complete');
  });

  it('--watch without active tmux session skips watch setup', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(registerStart, ['start', '--watch', '--force']);
    expect(setupWatchWindow).not.toHaveBeenCalled();
    expect(stdout()).toContain('--watch requires an active tmux session');
    expect(runSprint).toHaveBeenCalled();
  });
});

// ─── Plan Command ───────────────────────────────────────────────────

describe('plan command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('plans and shows task table', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    });
    vi.mocked(checkUsage).mockReturnValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' });
    vi.mocked(adjustSprintSize).mockReturnValue({
      size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK',
    });
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask({ id: 'task-001', title: 'CLI Module', model: 'sonnet', priority: 'HIGH' })],
    }));
    await runCommand(registerPlan, ['plan']);
    expect(stdout()).toContain('task-001');
    expect(stdout()).toContain('CLI Module');
  });

  it('shows reduced sprint note', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    });
    vi.mocked(checkUsage).mockReturnValue({ fiveHourPercent: 0.9, weeklyPercent: 0, measuredAt: '' });
    vi.mocked(adjustSprintSize).mockReturnValue({
      size: 'reduced', maxWorkers: 3, modelConstraint: null, reason: 'High usage',
    });
    vi.mocked(planSprint).mockReturnValue(makeSprint({ tasks: [] }));
    await runCommand(registerPlan, ['plan']);
    expect(stdout()).toContain('reduced');
    expect(stdout()).toContain('High usage');
  });

  it('handles planning error', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('config fail'));
    await runCommand(registerPlan, ['plan']);
    expect(stderr()).toContain('config fail');
    expect(process.exitCode).toBe(1);
  });

  it('shows multiple tasks', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    });
    vi.mocked(checkUsage).mockReturnValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' });
    vi.mocked(adjustSprintSize).mockReturnValue({
      size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK',
    });
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [
        makeTask({ id: 'task-001', title: 'A' }),
        makeTask({ id: 'task-002', title: 'B' }),
      ],
    }));
    await runCommand(registerPlan, ['plan']);
    expect(stdout()).toContain('task-001');
    expect(stdout()).toContain('task-002');
    expect(stdout()).toContain('2 tasks');
  });

  it('--structured passes mode=structured to planSprint', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    });
    vi.mocked(checkUsage).mockReturnValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' });
    vi.mocked(adjustSprintSize).mockReturnValue({
      size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK',
    });
    vi.mocked(planSprint).mockReturnValue(makeSprint({ tasks: [makeTask()] }));
    await runCommand(registerPlan, ['plan', '--structured']);
    expect(vi.mocked(planSprint)).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ mode: 'structured' }),
    );
  });

  it('--no-confirm skips approval flow', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    });
    vi.mocked(checkUsage).mockReturnValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' });
    vi.mocked(adjustSprintSize).mockReturnValue({
      size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK',
    });
    vi.mocked(planSprint).mockReturnValue(makeSprint({ tasks: [makeTask()] }));
    await runCommand(registerPlan, ['plan', '--no-confirm']);
    expect(vi.mocked(planSprint)).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ asDraft: false }),
    );
    // No approval prompt, no confirmDraftTasks call
    expect(vi.mocked(confirmDraftTasks)).not.toHaveBeenCalled();
  });

  it('shows reasoning when present', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    });
    vi.mocked(checkUsage).mockReturnValue({ fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' });
    vi.mocked(adjustSprintSize).mockReturnValue({
      size: 'full', maxWorkers: 8, modelConstraint: null, reason: 'OK',
    });
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      tasks: [makeTask()],
      reasoning: 'AI planned this',
      planningMode: 'ai',
    }));
    await runCommand(registerPlan, ['plan', '--no-confirm']);
    expect(stdout()).toContain('AI planned this');
    expect(stdout()).toContain('Planning mode: ai');
  });
});

// ─── Stub Commands ──────────────────────────────────────────────────

describe('stub commands', () => {
  beforeEach(() => { vi.clearAllMocks(); captureOutput(); });
  afterEach(() => restoreOutput());

  it('plugin list shows no plugins message', async () => {
    await runCommand(registerPlugin, ['plugin', 'list']);
    expect(stdout()).toContain('No plugins');
  });

  it('upgrade shows current version', async () => {
    await runCommand(registerUpgrade, ['upgrade']);
    expect(stdout()).toContain('Current version');
  });

  it('onboard shows welcome message', async () => {
    await runCommand(registerOnboard, ['onboard']);
    expect(stdout()).toContain('Welcome');
  });
});

// ─── Init Command ───────────────────────────────────────────────────

describe('init command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('creates directory structure and config', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')  // plan: max_plan
      .mockResolvedValueOnce('1')  // language: en
      .mockResolvedValueOnce('test-project');  // project name
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
    expect(stdout()).toContain('Setting up your AI development team');
  });

  it('creates config with selected mode', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('3')  // plan: pro_plan
      .mockResolvedValueOnce('2')  // language: tr
      .mockResolvedValueOnce('my-app');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const configCalls = vi.mocked(writeFileSync).mock.calls.filter(
      (c) => String(c[0]).includes('config.json'),
    );
    expect(configCalls.length).toBeGreaterThan(0);
    const configContent = JSON.parse(String(configCalls[0]?.[1]));
    expect(configContent.mode).toBe('pro_plan');
    expect(configContent.language).toBe('tr');
  });

  it('appends to existing .gitignore without duplicates', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);

    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p).includes('.gitignore')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('.gitignore')) return 'node_modules/\n.deckent/\n';
      return '';
    });

    await runCommand(registerInit, ['init']);

    const gitignoreCalls = vi.mocked(writeFileSync).mock.calls.filter(
      (c) => String(c[0]).includes('.gitignore'),
    );
    if (gitignoreCalls.length > 0) {
      const content = String(gitignoreCalls[0]?.[1]);
      const matches = content.match(/\.deckent\//g);
      expect(matches?.length).toBe(1);
    }
  });

  it('creates DIRECTIVES.md', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const directivesCalls = vi.mocked(writeFileSync).mock.calls.filter(
      (c) => String(c[0]).includes('DIRECTIVES'),
    );
    expect(directivesCalls.length).toBeGreaterThan(0);
  });

  it('creates brain directory files', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const brainCalls = vi.mocked(writeFileSync).mock.calls.filter(
      (c) => String(c[0]).includes('.brain'),
    );
    expect(brainCalls.length).toBeGreaterThanOrEqual(5);
  });

  it('creates claude rules', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const rulesCalls = vi.mocked(writeFileSync).mock.calls.filter(
      (c) => String(c[0]).includes('rules'),
    );
    expect(rulesCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('handles prompt error', async () => {
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockRejectedValue(new Error('readline closed')),
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);

    await runCommand(registerInit, ['init']);
    expect(stderr()).toContain('readline closed');
    expect(process.exitCode).toBe(1);
  });

  it('shows next steps message', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);
    expect(stdout()).toContain('deckent set-directives');
    expect(stdout()).toContain('deckent start');
  });

  it('creates plugins directory', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const mkdirCalls = vi.mocked(mkdirSync).mock.calls.map(c => String(c[0]));
    expect(mkdirCalls.some(c => c.includes('plugins'))).toBe(true);
  });

  it('creates i18n directory', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const mkdirCalls = vi.mocked(mkdirSync).mock.calls.map(c => String(c[0]));
    expect(mkdirCalls.some(c => c.includes('i18n'))).toBe(true);
  });

  it('creates TOOLS.md in workspace', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const writeCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('TOOLS.md'),
    );
    expect(writeCalls.length).toBeGreaterThan(0);
  });

  it('creates BOOT.md in workspace', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const writeCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('BOOT.md'),
    );
    expect(writeCalls.length).toBeGreaterThan(0);
  });

  it('creates en.json in i18n', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const writeCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('en.json'),
    );
    expect(writeCalls.length).toBeGreaterThan(0);
    const content = JSON.parse(String(writeCalls[0]?.[1]));
    expect(content).toHaveProperty('sprint_started');
  });

  it('creates tr.json in i18n', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const writeCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('tr.json'),
    );
    expect(writeCalls.length).toBeGreaterThan(0);
    const content = JSON.parse(String(writeCalls[0]?.[1]));
    expect(content).toHaveProperty('sprint_started');
    expect(content.sprint_started).toContain('baslatildi');
  });

  it('creates DECKENT.md with full template', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('my-project');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const deckentCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).endsWith('DECKENT.md'),
    );
    expect(deckentCalls.length).toBeGreaterThan(0);
    const content = String(deckentCalls[0]?.[1]);
    expect(content).toContain('my-project');
    expect(content).toContain('@.deckent/workspace/IDENTITY.md');
    expect(content).toContain('@DIRECTIVES.md');
    expect(content).toContain('@.brain/MEMORY.md');
    expect(content).toContain('@.claude/rules/brain.md');
    expect(content).toContain('@.deckent/workspace/BOOT.md');
  });

  it('calls ensureDeckentImport for CLAUDE.md (not destructive write)', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('CLAUDE.md'));
  });

  it('calls ensureDeckentImport for AGENTS.md', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
  });

  it('does not overwrite CLAUDE.md with writeFileSync', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    // CLAUDE.md should NOT be written by writeFileSync directly
    // (it should be handled by ensureDeckentImport instead)
    const claudeDirectWrites = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).endsWith('CLAUDE.md'),
    );
    expect(claudeDirectWrites.length).toBe(0);
  });

  it('merges config when existing config.json present', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p).includes('config.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.includes('config.json')) {
        return JSON.stringify({ mode: 'pro_plan', customField: 'keep-me' }) as unknown as ReturnType<typeof readFileSync>;
      }
      return '' as unknown as ReturnType<typeof readFileSync>;
    });

    await runCommand(registerInit, ['init']);

    const configCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('config.json'),
    );
    expect(configCalls.length).toBeGreaterThan(0);
    const config = JSON.parse(String(configCalls[0]?.[1]));
    expect(config.customField).toBe('keep-me');
    expect(config.mode).toBe('max_plan'); // updated
  });

  it('does not add .deckent/ to .gitignore', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p).includes('.gitignore')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).includes('.gitignore')) return 'node_modules/\n';
      return '';
    });

    await runCommand(registerInit, ['init']);

    const gitignoreCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('.gitignore'),
    );
    if (gitignoreCalls.length > 0) {
      const content = String(gitignoreCalls[0]?.[1]);
      expect(content).not.toContain('.deckent/');
    }
  });

  it('brain.md template has frontmatter and 13 rules', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const brainCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('brain.md'),
    );
    expect(brainCalls.length).toBeGreaterThan(0);
    const content = String(brainCalls[0]?.[1]);
    expect(content).toContain('paths:');
    expect(content).toContain('.tasks/*');
    expect(content).toContain('Sprint is NEVER left incomplete');
  });

  it('auditor.md template has frontmatter and rules', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const auditorCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('auditor.md'),
    );
    expect(auditorCalls.length).toBeGreaterThan(0);
    const content = String(auditorCalls[0]?.[1]);
    expect(content).toContain('paths:');
    expect(content).toContain('.dashboard');
    expect(content).toContain('NEVER write source code');
  });

  it('worker-default.md template has heartbeat and result rules', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('proj');
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');

    await runCommand(registerInit, ['init']);

    const workerCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => String(c[0]).includes('worker-default.md'),
    );
    expect(workerCalls.length).toBeGreaterThan(0);
    const content = String(workerCalls[0]?.[1]);
    expect(content).toContain('paths:');
    expect(content).toContain('heartbeat');
    expect(content).toContain('result file');
  });
});
