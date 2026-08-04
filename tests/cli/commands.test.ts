import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, DashboardState, ResolvedConfig } from '../../src/core/types.js';

const spawnBackend = vi.hoisted(() => ({ spawn: vi.fn(), kill: vi.fn() }));

// ─── Common Mocks ───────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { W_OK: 2, R_OK: 4, F_OK: 0 },
  unlinkSync: vi.fn(),
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

// wizard.ts (the provider-selection wizard init runs after its prompts) uses the
// CALLBACK readline API (`node:readline`), NOT `node:readline/promises`. Without
// this mock the wizard opens a REAL interface on process.stdin whenever 2+
// providers are detected available (e.g. a live local Ollama server answering
// detectOllama()'s HTTP probe), and its question() promise never resolves —
// hanging every init test into the 10s timeout. Answering '' mirrors a user
// pressing Enter: each wizard step resolves to its default value.
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (answer: string) => void) => { cb(''); }),
    close: vi.fn(),
  })),
}));


// Authority-first status: a quiescent run authority short-circuits to "no active sprint",
// and live status is held unless the canonical persisted read model exists. These cases
// exercise rendering, so both are supplied here. (Same pattern as
// tests/cli/commands/status.test.ts — see the note there.)
vi.mock('../../src/core/run-status-read-model.js', () => ({
  readCanonicalRunStatusReadModel: vi.fn(() => ({
    schemaVersion: 1, revision: 1, runGeneration: 1, modelDigest: 'digest-test',
    holds: [], providerConcurrency: [], authority: {},
  })),
  runStatusReadModelMatchesAuthority: vi.fn(() => true),
  // cleanup retires the run identity through this seam — the hand-written mock
  // must keep pace with the module's real export list (publish added later).
  publishCanonicalRunStatusReadModel: vi.fn(),
}));

vi.mock('../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(() => ({
    schemaVersion: 1, lifecycle: 'ACTIVE', active: true, resumable: false,
    // sprintId null: these cases derive the id from the dashboard/task fixtures, so the
    // authority must not impose one — it only declares that a run is active.
    sprintId: null, phase: 'EXECUTE', status: 'RUNNING', reason: null,
    recoveryCommand: null, finalizeCommand: null, coordinator: 'alive', conflicts: [],
  })),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
  validatePartialConfig: vi.fn(),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
  deepMerge: vi.fn().mockImplementation((base: Record<string, unknown>, override: Record<string, unknown>) => {
    return { ...base, ...override };
  }),
  ConfigValidationError: class ConfigValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(errors.join(', '));
      this.name = 'ConfigValidationError';
      this.errors = errors;
    }
  },
}));

vi.mock('../../src/core/cost-config-loader.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/cost-config-loader.js')>()),
  initCostConfig: vi.fn(),
  loadCostConfig: vi.fn(() => ({
    _version: '1.0',
    providers: {
      anthropic: {
        enabled: true,
        billing_modes_supported: ['api'],
        default_billing_mode: 'api',
        models: {
          'claude-sonnet-5': {
            input_cost_per_token: 0.000003,
            output_cost_per_token: 0.000015,
            max_input_tokens: 1_000_000,
            enabled: true,
          },
        },
      },
    },
    cost_limits: { sprint_max_usd: 5, daily_max_usd: 50, monthly_max_usd: 500, auto_confirm_below_usd: 2 },
    update_config: { sources_priority: ['bundled'] },
  })),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
  readJsonSafe: vi.fn().mockReturnValue(null),
  // sprint-428 (born-674): task-builder fail-soft catch'leri çağırır
  debugLog: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  cleanup: vi.fn(),
  runDecay: vi.fn(),
  confirmDraftTasks: vi.fn(),
  cleanupDraftTasks: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

// `deckent plan` no longer plans through brain.planSprint — the production seam
// is the durable run-flow plan service (planRunFlow → decideRunFlowPlan).
// Hybrid mock: keep the real error classes, stub only the seam functions.
vi.mock('../../src/orchestra/run-flow-plan-service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/orchestra/run-flow-plan-service.js')>()),
  planRunFlow: vi.fn(),
  decideRunFlowPlan: vi.fn(),
}));

// Approved-plan projection publication (no-clobber preflight + publish) hits the
// real filesystem — stubbed at the module seam, error class kept real.
vi.mock('../../src/orchestra/task-artifact-projection.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/orchestra/task-artifact-projection.js')>()),
  inspectTaskArtifactsNoClobber: vi.fn(),
  publishTaskArtifactsNoClobber: vi.fn(),
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

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn(() => ({
      name: 'subprocess',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: spawnBackend.spawn,
      kill: spawnBackend.kill,
      list: vi.fn(() => []),
      isAvailable: vi.fn(async () => true),
    })),
  },
  createSandboxBackend: vi.fn(),
}));

vi.mock('../../src/core/file-lock.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/file-lock.js')>();
  return {
    ...actual,
    withExecutionLock: vi.fn(async (
      _projectRoot: string,
      _taskId: string,
      _actor: string,
      operation: () => unknown,
    ) => operation()),
  };
});

vi.mock('../../src/core/task-settlement-authority.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/task-settlement-authority.js')>();
  return {
    ...actual,
    openTaskSettlementProjection: vi.fn(() => ({
      projectTaskExecutionState: vi.fn(() => ({
        effectiveStatus: 'PENDING',
        reasonCode: 'raw-status',
      })),
      projectTaskExecutionStates: vi.fn(() => []),
      close: vi.fn(),
    })),
  };
});

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

// ── MemoryStore mock for DB-first doctor checks ─────────────────────
const mockCmdMemStore = {
  totalCount: vi.fn().mockReturnValue(0),
  getByType: vi.fn().mockReturnValue([]),
  close: vi.fn(),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockCmdMemStore),
}));

// ─── Static Imports (after mocks) ──────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { countBrainLines, ensureDeckentImport, readJsonSafe } from '../../src/core/utils.js';
import { loadConfig, validatePartialConfig, ConfigValidationError } from '../../src/core/config.js';
import { runSprint, readContext, planSprint, cleanup, runDecay, BrainError } from '../../src/orchestra/brain.js';
import { planRunFlow, decideRunFlowPlan, type PlanRunFlowResult } from '../../src/orchestra/run-flow-plan-service.js';
import { readCanonicalRunStatus, type CanonicalRunStatus } from '../../src/core/run-status-authority.js';
import { isSessionActive, attach, ensureSession, spawnWorker, killWorker, destroy, setupWatchWindow, TmuxError } from '../../src/orchestra/tmux.js';
import { readTask } from '../../src/agents/worker.js';

// ─── Command Imports ────────────────────────────────────────────────

import { registerDoctor } from '../../src/cli/commands/doctor.js';
import { registerAttach } from '../../src/cli/commands/attach.js';
import { registerKill } from '../../src/cli/commands/kill.js';
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
      max_workers: 8, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5',
      haiku_allowed: true,
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test-project',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    spawn_backend: 'subprocess',
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
    model: 'claude-sonnet-5', provider: 'claude', effort: 'normal', priority: 'NORMAL',
    budget: { maxTurns: 1 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'tests.cli.commands',
      policyDigest: 'a'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
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
    // DB-first: existsSync must return true for the memory.db path so
    // getMemoryEntryCount opens the store, and totalCount returns 950.
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.includes('memory.db')) return true;
      // Return true for workspace/.deckent checks so doctor doesn't fail earlier
      if (s.includes('.deckent') || s.includes('.brain') || s.includes('DIRECTIVES')) return true;
      return false;
    });
    mockCmdMemStore.totalCount.mockReturnValue(950);
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('950/900');
    expect(stdout()).toContain('OVER BUDGET');
  });

  it('reports critical debt', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'v22.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
    vi.mocked(existsSync).mockReturnValue(true);
    // DB-first: countDebtItems uses MemoryStore.getByType('debt')
    mockCmdMemStore.getByType.mockReturnValue([
      { id: 'd-1', type: 'debt', title: 'fix', priority: 'CRITICAL', status: 'open' },
    ]);
    await runCommand(registerDoctor, ['doctor']);
    expect(stdout()).toContain('critical');
    // Reset
    mockCmdMemStore.getByType.mockReturnValue([]);
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
    spawnBackend.kill.mockImplementation(() => { throw new Error('no subprocess'); });
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

// ─── Retro Command ──────────────────────────────────────────────────

describe('retro command', () => {
  beforeEach(() => { vi.clearAllMocks(); captureOutput(); });
  afterEach(() => restoreOutput());

  it('prints retro content when a retro entry exists', async () => {
    // B8: retro is read from the memory.db `retro` entries.
    vi.mocked(existsSync).mockReturnValue(true);
    mockCmdMemStore.getByType.mockReturnValueOnce([
      { content: '# Sprint 1 Retro\nGood stuff', sprint_num: 1, sprint_id: 'sprint-001' },
    ]);
    await runCommand(registerRetro, ['retro']);
    // Rich summary format is now the default (use --raw for original content)
    expect(stdout()).toContain('Sprint Retrospective');
  });

  it('prints message when no retro file', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(registerRetro, ['retro']);
    expect(stdout()).toContain('No retrospective found');
  });

  it('handles an empty retro entry', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockCmdMemStore.getByType.mockReturnValueOnce([
      { content: '', sprint_num: 1, sprint_id: 'sprint-001' },
    ]);
    await runCommand(registerRetro, ['retro']);
    expect(stdout()).toContain('No retrospective found');
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

      alerts: [],
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    await runCommand(registerStatus, ['status']);
    expect(stdout()).toContain('Sprint 001');
  });

  it('prints message when no dashboard', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(registerStatus, ['status']);
    expect(stdout()).toContain('No active run (sprint)');
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

      alerts: [],
      updatedAt: new Date().toISOString(),
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

      alerts: [],
      updatedAt: new Date().toISOString(),
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

      alerts: [],
      updatedAt: new Date().toISOString(),
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

  it('shows sprint history table with 8 columns', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-001.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(
      '# sprint-001\n\n## Metrics\n| Metric | Value |\n|--------|-------|\n| Total Tasks | 3 |\n| Completed | 2 |\n| Tech Debt | 1 |\n| No-Go | 1 |\n| Coverage | 91.0% |\n| Duration | 5000ms |'
    );
    await runCommand(registerHistory, ['history']);
    const out = stdout();
    expect(out).toContain('Run');
    expect(out).toContain('Tasks');
    expect(out).toContain('Done');
    expect(out).toContain('No-Go%');
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
    expect(stdout()).toContain('No run history');
  });

  it('prints message when no sprint files', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    await runCommand(registerHistory, ['history']);
    expect(stdout()).toContain('No run history');
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
    await runCommand(registerSpawn, ['spawn', 'task-001']);
    expect(spawnBackend.spawn).toHaveBeenCalled();
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
    const task = makeTask({ model: 'claude-haiku-4-5-20251001' });
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readTask).mockReturnValue(task);
    await runCommand(registerSpawn, ['spawn', 'task-001']);
    expect(spawnBackend.spawn).toHaveBeenCalledWith(
      'task-001', 'claude-haiku-4-5-20251001', expect.any(String), expect.objectContaining({
        autoApprove: false,
        executionBudget: { maxTurns: 1 },
      }),
    );
  });

  it('uses the configured backend without opening a tmux session', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readTask).mockReturnValue(makeTask());
    await runCommand(registerSpawn, ['spawn', 'task-001']);
    expect(spawnBackend.spawn).toHaveBeenCalled();
    expect(ensureSession).not.toHaveBeenCalled();
  });

  it('spawn does not use haiku_allowed as autoApprove', async () => {
    // haiku_allowed belongs to model config — autoApprove is always false for spawn command
    vi.mocked(readTask).mockReturnValue(makeTask());
    await runCommand(registerSpawn, ['spawn', 'task-001']);
    const spawnOpts = spawnBackend.spawn.mock.calls[0]?.[3];
    expect(spawnOpts?.autoApprove).toBe(false);
  });
});

// ─── Cleanup Command ────────────────────────────────────────────────

describe('cleanup command', () => {
  // Honest-gate authority: the file-wide default mock declares an ACTIVE run
  // with a live coordinator, which cleanup now (correctly) refuses with
  // "Cleanup held for … coordinator-active". These cases exercise the actual
  // cleanup mechanics, so they need a quiescent (IDLE) authority instead.
  const idleAuthority: CanonicalRunStatus = {
    schemaVersion: 1, lifecycle: 'IDLE', active: false, resumable: false,
    sprintId: null, phase: null, status: null, reason: null,
    recoveryCommand: null, finalizeCommand: null, coordinator: 'absent', conflicts: [],
  };
  const activeAuthority: CanonicalRunStatus = {
    schemaVersion: 1, lifecycle: 'ACTIVE', active: true, resumable: false,
    sprintId: null, phase: 'EXECUTE', status: 'RUNNING', reason: null,
    recoveryCommand: null, finalizeCommand: null, coordinator: 'alive', conflicts: [],
  };
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
    vi.mocked(readCanonicalRunStatus).mockReturnValue(idleAuthority);
  });
  afterEach(() => {
    // vi.clearAllMocks() does NOT reset implementations — restore the file-wide
    // ACTIVE default so later describes see the same authority they always did.
    vi.mocked(readCanonicalRunStatus).mockReturnValue(activeAuthority);
    restoreOutput();
    process.exitCode = undefined;
  });

  it('cleans up with tasks', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as unknown as ReturnType<typeof readdirSync>);
    // Task-artifact identity contract: the live file is `task-<id>.json`, so the
    // record inside `task-001.json` must carry id '001' or the classifier
    // (correctly) rejects it as task-id-mismatch and cleanup counts 0 tasks.
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeTask({ id: '001' })) as unknown as ReturnType<typeof readFileSync>);
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
    expect(runDecay).toHaveBeenCalledWith(expect.any(String), 'sprint-cleanup', { force: true, memoryBudget: 900, decaySprints: 8 });
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
    vi.mocked(readContext).mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as any);
    vi.mocked(planSprint).mockReturnValue(makeSprint());
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

  it('handles --sandbox-mode: runs sprint with sandbox context', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    await runCommand(registerStart, ['start', '--sandbox-mode']);
    // Sandbox mode now runs the sprint with git stash/restore mechanism
    expect(runSprint).toHaveBeenCalled();
    const optsArg = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(optsArg?.sandboxMode).toBe(true);
  });

  it('passes sandboxMode=undefined to runSprint when not set', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    await runCommand(registerStart, ['start']);
    const optsArg = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(optsArg?.autoApprove).toBe(false); // K3-approved: opt-in only via --auto-approve
    expect(optsArg?.sandboxMode).toBeFalsy();
  });

  it('sandbox-mode passes sandboxMode:true to runSprint', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    await runCommand(registerStart, ['start', '--sandbox-mode']);
    const optsArg = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(optsArg?.sandboxMode).toBe(true);
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
    vi.mocked(planSprint).mockReturnValue(makeSprint({ tasks: [] }));
    await runCommand(registerStart, ['start', '--dry-run', '--watch', '--force']);
    expect(setupWatchWindow).not.toHaveBeenCalled();
    expect(stdout()).toContain('--watch ignored in dry-run mode');
    expect(stdout()).toContain('Dry-run complete');
  });

  it('--watch without active tmux session falls back to subprocess watching', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(runSprint).mockResolvedValue(makeSprint());
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(registerStart, ['start', '--watch', '--force']);
    expect(setupWatchWindow).not.toHaveBeenCalled();
    expect(stdout()).toContain('No tmux session');
    expect(runSprint).toHaveBeenCalled();
  });
});

// ─── Plan Command ───────────────────────────────────────────────────

describe('plan command', () => {
  // `deckent plan` plans through the durable run-flow seam (planRunFlow →
  // approval CAS via decideRunFlowPlan), not brain.planSprint. Build a
  // PlanRunFlowResult around the sprint fixture; topology/scope gates pass.
  function mockPlanFlow(sprint: Sprint): void {
    vi.mocked(planRunFlow).mockResolvedValue({
      flowId: 'flow-test', revision: 1, planDigest: 'digest-plan-test',
      sprint,
      preview: {
        topology: undefined,
        scopeGateResult: 'pass', scopeGateOverridden: false,
      },
      context: {}, sourceAuthority: {}, lineage: {},
      approval: 'awaiting', reusedDurablePlan: false,
    } as unknown as PlanRunFlowResult);
  }

  // Drives the REAL promptConfirm ('Approve this plan?') through the mocked
  // readline seam — answering 'y' approves the DRAFT plan deterministically.
  let approvalQuestion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
    approvalQuestion = vi.fn().mockResolvedValue('y');
    vi.mocked(createInterface).mockReturnValue({
      question: approvalQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
    vi.mocked(loadConfig).mockResolvedValue(makeConfig());
    vi.mocked(readContext).mockReturnValue({
      directives: '', memory: '', retro: '', debt: [],
      patterns: '', decisions: '', existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    } as unknown as ReturnType<typeof readContext>);
  });
  afterEach(() => {
    restoreOutput();
    process.exitCode = undefined;
  });

  it('plans and shows task table', async () => {
    mockPlanFlow(makeSprint({
      tasks: [makeTask({ id: 'task-001', title: 'CLI Module', model: 'claude-sonnet-5', priority: 'HIGH' })],
    }));
    await runCommand(registerPlan, ['plan']);
    expect(stdout()).toContain('task-001');
    expect(stdout()).toContain('CLI Module');
  });

  it('handles planning error', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('config fail'));
    await runCommand(registerPlan, ['plan']);
    expect(stderr()).toContain('config fail');
    expect(process.exitCode).toBe(1);
  });

  it('shows multiple tasks', async () => {
    mockPlanFlow(makeSprint({
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

  it('--structured passes mode=structured to planRunFlow', async () => {
    mockPlanFlow(makeSprint({ tasks: [makeTask()] }));
    await runCommand(registerPlan, ['plan', '--structured']);
    expect(vi.mocked(planRunFlow)).toHaveBeenCalledWith(
      expect.objectContaining({
        previewOptions: expect.objectContaining({ mode: 'structured' }),
      }),
    );
  });

  it('--no-confirm skips approval flow', async () => {
    mockPlanFlow(makeSprint({ tasks: [makeTask()] }));
    await runCommand(registerPlan, ['plan', '--no-confirm']);
    expect(vi.mocked(planRunFlow)).toHaveBeenCalled();
    // No interactive approval prompt — the plan is auto-approved through the
    // run-flow approval CAS directly.
    expect(approvalQuestion).not.toHaveBeenCalled();
    expect(vi.mocked(decideRunFlowPlan)).toHaveBeenCalledWith(
      expect.any(String), 'flow-test',
      expect.objectContaining({ decision: 'approve' }),
    );
  });

  it('shows reasoning when present', async () => {
    mockPlanFlow(makeSprint({
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
  const originalStdinIsTTY = process.stdin.isTTY;
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    process.exitCode = undefined;
    // 413-001 non-TTY gate: init now honestly FAILs early when stdin is not a
    // TTY and --yes is absent. These tests simulate the INTERACTIVE flow via a
    // mocked node:readline, so declare a TTY to keep exercising that path.
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    // Hermeticity: detectOllama() (src/core/provider.ts) probes the LOCAL
    // Ollama server (http://localhost:11434/api/tags) with a real fetch.
    // On machines where Ollama runs this made a second provider "available",
    // routing init into the interactive provider wizard (see the node:readline
    // mock at the top of this file). Reject the probe so provider detection
    // never leaves the test process.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    // Determinism: vi.clearAllMocks() keeps implementations, so spawnSync
    // would otherwise carry whatever earlier describe blocks installed
    // (e.g. `claude --version` → '1.0.0' from the start-command suite).
    // Pin it to "no CLI binaries found" so the provider auto-config path is
    // taken regardless of test-execution order or filtering.
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>);
  });
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinIsTTY, configurable: true });
    vi.unstubAllGlobals();
    restoreOutput();
    process.exitCode = undefined;
  });

  it('creates directory structure and config', async () => {
    const mockQuestion = vi.fn()
      .mockResolvedValueOnce('1')  // language: en
      .mockResolvedValueOnce('1')  // plan: performance
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
      .mockResolvedValueOnce('2')  // language: tr
      .mockResolvedValueOnce('3')  // plan: economic
      .mockResolvedValueOnce('my-app');  // project name
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
    expect(configContent.mode).toBe('economic');
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

    const brainDirCalls = vi.mocked(mkdirSync).mock.calls.filter(
      (c) => String(c[0]).includes('.brain'),
    );
    // B6/B7/B8: Memory V2 is fully DB-first — init provisions the .brain/
    // directory tree (incl. exports/) + memory.db; no legacy root .md stubs
    // (MEMORY/RETRO/PATTERNS/DEBT/PROJECT-IDENTITY) are written.
    expect(brainDirCalls.length).toBeGreaterThan(0);
  });

  it('does not create PROJECT-IDENTITY.md (B6 — DB-first identity, Memory V2)', async () => {
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

    // Legacy .brain/PROJECT-IDENTITY.md is superseded by the DB `identity`
    // entry + .deckent/workspace/IDENTITY.md managed-doc. init must not stub it.
    const identityCalls = vi.mocked(writeFileSync).mock.calls.filter(
      (c) => String(c[0]).includes('PROJECT-IDENTITY'),
    );
    expect(identityCalls).toHaveLength(0);
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
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).includes('rule-templates') || String(p).includes('.template.md'),
    );
    vi.mocked(readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('brain.template.md')) return '# Brain Rules\n- Sprint is NEVER left incomplete\n' as unknown as ReturnType<typeof readFileSync>;
      if (s.includes('auditor.template.md')) return '# Auditor Rules\n- NEVER write source code\n' as unknown as ReturnType<typeof readFileSync>;
      if (s.includes('worker-default.template.md')) return '# Worker Rules\n- Update heartbeat\n- Write result file\n' as unknown as ReturnType<typeof readFileSync>;
      return '' as unknown as ReturnType<typeof readFileSync>;
    });

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

  it('shows honest outcome instead of unconditional next steps (412-001 INIT-01)', async () => {
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
    // Pre-412-001 this fixture (no usable provider evidence) printed the
    // unconditional "You're ready" next-steps block. The honest-outcome
    // contract only prints next steps for READY; here we must see the
    // outcome block instead, and never the ready phrase.
    expect(stdout()).toContain('Setup outcome:');
    expect(stdout()).not.toContain('deckent set-directives');
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
    // Memory V2 (Sprint 141+): MEMORY.md is an auto-generated export.
    // DECKENT.md now references the summary export directly instead of the
    // legacy .brain/MEMORY.md file.
    expect(content).toContain('@.brain/exports/summary.md');
    // Host-adapter neutrality: DECKENT.md no longer freezes provider-specific
    // rule paths — Brain/Auditor/Worker rules load from the selected host
    // adapter's generated rule projection instead.
    expect(content).toContain('## Agent Instructions');
    expect(content).toContain("host adapter's generated");
    expect(content).not.toContain('@.claude/rules/brain.md');
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
    expect(config.mode).toBe('performance'); // updated from max_plan
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
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).includes('rule-templates') || String(p).includes('.template.md'),
    );
    vi.mocked(readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('brain.template.md')) return '# Brain Rules\n- Sprint is NEVER left incomplete\n' as unknown as ReturnType<typeof readFileSync>;
      if (s.includes('auditor.template.md')) return '# Auditor Rules\n- NEVER write source code\n' as unknown as ReturnType<typeof readFileSync>;
      if (s.includes('worker-default.template.md')) return '# Worker Rules\n- Update heartbeat\n- Write result file\n' as unknown as ReturnType<typeof readFileSync>;
      return '' as unknown as ReturnType<typeof readFileSync>;
    });

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
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).includes('rule-templates') || String(p).includes('.template.md'),
    );
    vi.mocked(readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('brain.template.md')) return '# Brain Rules\n- Sprint is NEVER left incomplete\n' as unknown as ReturnType<typeof readFileSync>;
      if (s.includes('auditor.template.md')) return '# Auditor Rules\n- NEVER write source code\n' as unknown as ReturnType<typeof readFileSync>;
      if (s.includes('worker-default.template.md')) return '# Worker Rules\n- Update heartbeat\n- Write result file\n' as unknown as ReturnType<typeof readFileSync>;
      return '' as unknown as ReturnType<typeof readFileSync>;
    });

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
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).includes('rule-templates') || String(p).includes('.template.md'),
    );
    vi.mocked(readFileSync).mockImplementation((p) => {
      const s = String(p);
      if (s.includes('brain.template.md')) return '# Brain Rules\n- Sprint is NEVER left incomplete\n' as unknown as ReturnType<typeof readFileSync>;
      if (s.includes('auditor.template.md')) return '# Auditor Rules\n- NEVER write source code\n' as unknown as ReturnType<typeof readFileSync>;
      if (s.includes('worker-default.template.md')) return '# Worker Rules\n- Update heartbeat\n- Write result file\n' as unknown as ReturnType<typeof readFileSync>;
      return '' as unknown as ReturnType<typeof readFileSync>;
    });

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
