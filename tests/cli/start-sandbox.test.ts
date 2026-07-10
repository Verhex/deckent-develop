import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(message: string, phase?: string) {
      super(message);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn().mockReturnValue(false),
  setupWatchWindow: vi.fn(),
}));

vi.mock('../../src/core/constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/constants.js')>();
  return { ...actual, TMUX_SESSION_NAME: 'deckent' };
});

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
  formatTable: vi.fn().mockReturnValue('Task table'),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn().mockImplementation((key: string) => `[msg:${key}]`),
}));

vi.mock('../../src/cli/commands/quick-start.js', () => ({
  prepareZeroConfig: vi.fn(),
  cleanupZeroConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  createSandboxBackend: vi.fn(() => ({
    name: 'claude-sandbox',
    spawn: vi.fn(),
    kill: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
  })),
}));

import { loadConfig } from '../../src/core/config.js';
import { runSprint } from '../../src/orchestra/brain.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';
import { print } from '../../src/cli/helpers/output.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { prepareZeroConfig, cleanupZeroConfig } from '../../src/cli/commands/quick-start.js';
import { createSandboxBackend } from '../../src/orchestra/spawn-backend.js';
import { registerStart } from '../../src/cli/commands/start.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeConfig(overrides = {}) {
  return {
    activeModeConfig: { brain_model: 'opus', max_workers: 3, haiku_allowed: true },
    brain_planning: 'auto',
    language: 'en',
    ...overrides,
  };
}

function makeSprint(overrides = {}) {
  return {
    id: 'sprint-001',
    number: 1,
    tasks: [],
    workers: [],
    status: 'COMPLETE',
    phase: 'COMPLETE',
    metrics: { totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0, durationMs: 0, coveragePercent: 0, noGoRate: 0, newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0 },
    ...overrides,
  };
}

function makeDoctorResult(allPass = true) {
  return {
    checks: [
      { name: 'tmux', required: true, passed: allPass, message: allPass ? 'ok' : 'tmux not found' },
      { name: 'claude', required: true, passed: allPass, message: allPass ? 'ok' : 'claude not found' },
    ],
  };
}

async function runCommand(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerStart(program);
  try {
    await program.parseAsync(['node', 'test', 'start', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('start --sandbox-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint() as any);
    vi.mocked(runDoctorChecks).mockReturnValue(makeDoctorResult(true) as any);
    vi.mocked(prepareZeroConfig).mockReturnValue({
      createdTemp: true,
      alreadyExisted: false,
      directivesPath: '/mock/root/DIRECTIVES.md',
    } as any);
    vi.mocked(cleanupZeroConfig).mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('accepts --sandbox-mode flag without error', async () => {
    await runCommand('--sandbox-mode');
    expect(loadConfig).toHaveBeenCalled();
  });

  it('sandbox mode prints sandbox context message', async () => {
    await runCommand('--sandbox-mode');
    // Sandbox mode now prints a stash-related message and continues the sprint
    expect(print).toHaveBeenCalledWith(expect.stringMatching(/[Ss]andbox|stash/));
  });

  it('sandbox mode DOES call runSprint (git stash + restore mechanism)', async () => {
    await runCommand('--sandbox-mode');
    expect(runSprint).toHaveBeenCalled();
  });

  it('sandbox mode passes sandboxMode:true to runSprint', async () => {
    await runCommand('--sandbox-mode');
    expect(runSprint).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ sandboxMode: true }),
    );
  });

  it('without --sandbox-mode, sprint runs normally with autoApprove false by default (K3 fail-closed)', async () => {
    await runCommand('--force');
    expect(runSprint).toHaveBeenCalledWith('/mock/root', expect.anything(), expect.objectContaining({
      autoApprove: false,
    }));
  });

  it('sandbox mode with description cleans up zero-config', async () => {
    await runCommand('some description', '--sandbox-mode');
    expect(cleanupZeroConfig).toHaveBeenCalled();
  });

  it('normal start without sandbox passes sandboxMode undefined', async () => {
    await runCommand('--force');
    expect(runSprint).toHaveBeenCalledWith(
      '/mock/root',
      expect.anything(),
      expect.objectContaining({ sandboxMode: undefined }),
    );
  });

  it('sandbox + auto-approve: both flags work together', async () => {
    await runCommand('--sandbox-mode', '--auto-approve');
    expect(runSprint).toHaveBeenCalled();
    const optsArg = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(optsArg?.sandboxMode).toBe(true);
    expect(optsArg?.autoApprove).toBe(true);
  });

  it('sandbox + dry-run: planSprint used (dry-run takes priority over sandbox)', async () => {
    await runCommand('--sandbox-mode', '--dry-run');
    // dry-run mode shows the plan without calling runSprint, regardless of sandbox
    expect(runSprint).not.toHaveBeenCalled();
  });

  it('sandbox mode loads config to get language', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig({ language: 'tr' }) as any);
    await runCommand('--sandbox-mode');
    // Config is still loaded in sandbox mode
    expect(loadConfig).toHaveBeenCalled();
  });

  it('multiple flags can coexist: --sandbox-mode --force --watch', async () => {
    await runCommand('--sandbox-mode', '--force', '--watch');
    // With --force, doctor checks skipped; sandbox mode runs sprint
    expect(runSprint).toHaveBeenCalled();
  });

  it('without --sandbox-mode and --force, sprint completes', async () => {
    await runCommand('--force');
    expect(runSprint).toHaveBeenCalled();
  });
});

// ─── --sandbox (spawn backend selection) ─────────────────────────────

describe('start --sandbox (spawn backend selection)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint() as any);
    vi.mocked(runDoctorChecks).mockReturnValue(makeDoctorResult(true) as any);
    vi.mocked(prepareZeroConfig).mockReturnValue({
      createdTemp: true,
      alreadyExisted: false,
      directivesPath: '/mock/root/DIRECTIVES.md',
    } as any);
    vi.mocked(cleanupZeroConfig).mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('--sandbox flag selects SandboxSpawnBackend (name=claude-sandbox)', async () => {
    await runCommand('--sandbox', '--force');
    expect(runSprint).toHaveBeenCalledOnce();
    const opts = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(opts?.spawnBackend?.name).toBe('claude-sandbox');
  });

  it('--sandbox calls createSandboxBackend with project root', async () => {
    await runCommand('--sandbox', '--force');
    expect(createSandboxBackend).toHaveBeenCalledWith('/mock/root');
  });

  it('without --sandbox, spawnBackend is undefined (byte-identical behavior)', async () => {
    await runCommand('--force');
    expect(runSprint).toHaveBeenCalledOnce();
    const opts = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(opts?.spawnBackend).toBeUndefined();
  });

  it('--sandbox + --sandbox-mode: both flags coexist', async () => {
    await runCommand('--sandbox', '--sandbox-mode', '--force');
    expect(runSprint).toHaveBeenCalledOnce();
    const opts = vi.mocked(runSprint).mock.calls[0]?.[2];
    expect(opts?.spawnBackend?.name).toBe('claude-sandbox');
    expect(opts?.sandboxMode).toBe(true);
  });

  it('--sandbox does not call runSprint in dry-run mode', async () => {
    await runCommand('--sandbox', '--dry-run');
    expect(runSprint).not.toHaveBeenCalled();
  });
});
