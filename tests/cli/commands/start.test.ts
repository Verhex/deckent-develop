import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  readAuthMode: vi.fn().mockResolvedValue('subscription'),
}));

vi.mock('../../../src/core/cost-config-loader.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/core/cost-config-loader.js')>()),
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

vi.mock('../../../src/orchestra/brain.js', () => ({
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

vi.mock('../../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  setupWatchWindow: vi.fn(),
}));

vi.mock('../../../src/core/constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/constants.js')>();
  return { ...actual, TMUX_SESSION_NAME: 'deckent' };
});

vi.mock('../../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/provider.js')>();
  return {
    ...actual,
    bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
  };
});

vi.mock('../../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
  formatTable: vi.fn().mockReturnValue('Task table'),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/cli/commands/quick-start.js', () => ({
  prepareZeroConfig: vi.fn(),
  cleanupZeroConfig: vi.fn(),
}));

import { loadConfig } from '../../../src/core/config.js';
import { bootstrapProviders } from '../../../src/core/provider.js';
import {
  runSprint, readContext, planSprint, BrainError,
} from '../../../src/orchestra/brain.js';
import { isSessionActive, setupWatchWindow } from '../../../src/orchestra/tmux.js';
import { runDoctorChecks } from '../../../src/cli/commands/doctor.js';
import { print, printError, formatSprintSummary } from '../../../src/cli/helpers/output.js';
import { prepareZeroConfig, cleanupZeroConfig } from '../../../src/cli/commands/quick-start.js';
import {
  registerStart,
  readProviderCache,
  writeProviderCache,
  isProviderCacheFresh,
  applySandbox,
  restoreSandbox,
  watchSubprocessLogs,
} from '../../../src/cli/commands/start.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeConfig(overrides = {}) {
  return {
    activeModeConfig: { brain_model: 'claude-opus-4-8', max_workers: 3 },
    brain_planning: 'auto',
    language: 'en',
    ...overrides,
  };
}

function makeSprint(overrides = {}) {
  return {
    id: 'sprint-001',
    number: 1,
    tasks: [
      { id: '001-001', title: 'Task One', model: 'claude-sonnet-5', priority: 'NORMAL' },
    ],
    reasoning: 'Test reasoning',
    planningMode: 'structured',
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

async function runCommand(
  args: string[],
  runtime: Parameters<typeof registerStart>[1] = {},
): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStart(program, runtime);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('start command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    // Default mocks
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(runDoctorChecks).mockReturnValue(makeDoctorResult(true) as any);
    vi.mocked(readContext).mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as any);
    vi.mocked(planSprint).mockReturnValue(makeSprint() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint() as any);
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(setupWatchWindow).mockImplementation(() => {});
    vi.mocked(prepareZeroConfig).mockReturnValue({
      createdTemp: true,
      alreadyExisted: false,
      directivesPath: '/mock/root/DIRECTIVES.md',
    });
    vi.mocked(cleanupZeroConfig).mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  // ─── Command Registration ─────────────────────────────────────────

  describe('registerStart', () => {
    it('registers the start command', () => {
      const program = new Command();
      registerStart(program);
      const cmd = program.commands.find(c => c.name() === 'start');
      expect(cmd).toBeDefined();
    });

    it('registers --dry-run flag', () => {
      const program = new Command();
      registerStart(program);
      const cmd = program.commands.find(c => c.name() === 'start');
      const option = cmd?.options.find(o => o.long === '--dry-run');
      expect(option).toBeDefined();
    });

    it('registers --watch flag', () => {
      const program = new Command();
      registerStart(program);
      const cmd = program.commands.find(c => c.name() === 'start');
      const option = cmd?.options.find(o => o.long === '--watch');
      expect(option).toBeDefined();
    });

    it('registers --auto-approve flag', () => {
      const program = new Command();
      registerStart(program);
      const cmd = program.commands.find(c => c.name() === 'start');
      const option = cmd?.options.find(o => o.long === '--auto-approve');
      expect(option).toBeDefined();
    });

    it('registers --force flag', () => {
      const program = new Command();
      registerStart(program);
      const cmd = program.commands.find(c => c.name() === 'start');
      const option = cmd?.options.find(o => o.long === '--force');
      expect(option).toBeDefined();
    });

    it('registers --sandbox-mode flag', () => {
      const program = new Command();
      registerStart(program);
      const cmd = program.commands.find(c => c.name() === 'start');
      const option = cmd?.options.find(o => o.long === '--sandbox-mode');
      expect(option).toBeDefined();
    });
  });

  // ─── Pre-flight ───────────────────────────────────────────────────

  describe('pre-flight doctor checks', () => {
    it('holds configured provider authority before zero-config mutation or provider work', async () => {
      const authority = {
        state: 'hold',
        reasonCode: 'keyring_unavailable',
        authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
        retryable: false,
        close: vi.fn(),
      } as const;

      await runCommand(['start', 'new bounded task'], {
        providerAuthority: authority,
      });

      expect(loadConfig).toHaveBeenCalledOnce();
      expect(prepareZeroConfig).not.toHaveBeenCalled();
      expect(bootstrapProviders).not.toHaveBeenCalled();
      expect(runDoctorChecks).not.toHaveBeenCalled();
      expect(planSprint).not.toHaveBeenCalled();
      expect(runSprint).not.toHaveBeenCalled();
      expect(printError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('keyring_unavailable'),
      }));
      expect(process.exitCode).toBe(1);
    });

    it('runs doctor checks before starting sprint', async () => {
      await runCommand(['start']);
      expect(runDoctorChecks).toHaveBeenCalledWith('/mock/root', undefined, undefined);
    });

    it('aborts and sets exit code 1 when required doctor check fails', async () => {
      vi.mocked(runDoctorChecks).mockReturnValue(makeDoctorResult(false) as any);

      await runCommand(['start']);

      expect(printError).toHaveBeenCalled();
      expect(runSprint).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('skips doctor checks when --force is provided', async () => {
      await runCommand(['start', '--force']);

      expect(runDoctorChecks).not.toHaveBeenCalled();
      expect(runSprint).toHaveBeenCalled();
    });

    it('prints --force hint after pre-flight failure', async () => {
      vi.mocked(runDoctorChecks).mockReturnValue(makeDoctorResult(false) as any);

      await runCommand(['start']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('--force'));
    });
  });

  // ─── Dry-run Mode ────────────────────────────────────────────────

  describe('--dry-run mode', () => {
    it('calls planSprint in dry-run mode', async () => {
      await runCommand(['start', '--dry-run']);

      expect(planSprint).toHaveBeenCalled();
    });

    it('does not call runSprint in dry-run mode', async () => {
      await runCommand(['start', '--dry-run']);

      expect(runSprint).not.toHaveBeenCalled();
    });

    it('prints task list in dry-run mode', async () => {
      await runCommand(['start', '--dry-run']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('sprint-001'));
    });

    it('prints dry-run complete message', async () => {
      await runCommand(['start', '--dry-run']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('Dry-run complete'));
    });

    it('ignores --watch flag in dry-run mode and prints a note', async () => {
      await runCommand(['start', '--dry-run', '--watch']);

      expect(setupWatchWindow).not.toHaveBeenCalled();
      expect(print).toHaveBeenCalledWith(expect.stringContaining('--watch ignored'));
    });

    it('passes readContext to planSprint', async () => {
      await runCommand(['start', '--dry-run']);

      expect(readContext).toHaveBeenCalledWith('/mock/root');
    });

    it('prints sprint reasoning when present', async () => {
      await runCommand(['start', '--dry-run']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('Test reasoning'));
    });

    it('prints planning mode when present', async () => {
      await runCommand(['start', '--dry-run']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('structured'));
    });
  });

  // ─── Watch Mode ───────────────────────────────────────────────────

  describe('--watch mode', () => {
    it('calls setupWatchWindow when tmux session is active', async () => {
      vi.mocked(isSessionActive).mockReturnValue(true);

      await runCommand(['start', '--watch']);

      expect(setupWatchWindow).toHaveBeenCalledWith('deckent', '/mock/root');
    });

    it('prints watch window instructions when tmux session is active', async () => {
      vi.mocked(isSessionActive).mockReturnValue(true);

      await runCommand(['start', '--watch']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('Watch window created'));
    });

    it('skips watch setup when no active tmux session', async () => {
      vi.mocked(isSessionActive).mockReturnValue(false);

      await runCommand(['start', '--watch']);

      expect(setupWatchWindow).not.toHaveBeenCalled();
    });

    it('prints note when tmux session is not active (uses subprocess log watch)', async () => {
      vi.mocked(isSessionActive).mockReturnValue(false);

      await runCommand(['start', '--watch']);

      // When no tmux session, falls back to subprocess log watching
      expect(print).toHaveBeenCalledWith(expect.stringContaining('subprocess worker logs'));
    });
  });

  // ─── Auto-approve Mode ────────────────────────────────────────────

  describe('--auto-approve mode', () => {
    it('passes autoApprove: true to runSprint when --auto-approve is set', async () => {
      await runCommand(['start', '--auto-approve']);

      expect(runSprint).toHaveBeenCalledWith(
        '/mock/root',
        expect.anything(),
        expect.objectContaining({ autoApprove: true }),
      );
    });

    it('passes autoApprove: false to runSprint by default (K3 fail-closed — no flag, no auto-approve)', async () => {
      await runCommand(['start']);

      expect(runSprint).toHaveBeenCalledWith(
        '/mock/root',
        expect.anything(),
        expect.objectContaining({ autoApprove: false }),
      );
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────

  describe('error handling', () => {
    it('handles BrainError and includes phase in message', async () => {
      const BrainErrorClass = (await import('../../../src/orchestra/brain.js')).BrainError as any;
      const err = new BrainErrorClass('Sprint planning failed', 'PLAN');
      vi.mocked(runSprint).mockRejectedValue(err);

      await runCommand(['start']);

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('PLAN') }),
      );
      expect(process.exitCode).toBe(1);
    });

    it('handles generic error and sets exit code 1', async () => {
      vi.mocked(runSprint).mockRejectedValue(new Error('Unexpected failure'));

      await runCommand(['start']);

      expect(printError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('handles missing DIRECTIVES via BrainError', async () => {
      const BrainErrorClass = (await import('../../../src/orchestra/brain.js')).BrainError as any;
      vi.mocked(runSprint).mockRejectedValue(new BrainErrorClass('DIRECTIVES.md not found'));

      await runCommand(['start']);

      expect(printError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('handles sandbox-mode: prints sandbox message and continues sprint', async () => {
      await runCommand(['start', '--sandbox-mode']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('andbox'));
      // sandbox mode now runs the sprint (git stash + restore, not an early return)
      expect(runSprint).toHaveBeenCalled();
    });

    it('prints formatted sprint summary on successful run', async () => {
      await runCommand(['start']);

      expect(formatSprintSummary).toHaveBeenCalled();
      expect(print).toHaveBeenCalledWith('Sprint summary');
    });

    it('handles loadConfig failure gracefully', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      await runCommand(['start']);

      expect(printError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ─── Zero-Config Mode ─────────────────────────────────────────────

  describe('zero-config mode (positional description argument)', () => {
    it('calls prepareZeroConfig when description argument is provided', async () => {
      await runCommand(['start', 'Add login page with Google OAuth']);

      expect(prepareZeroConfig).toHaveBeenCalledWith('/mock/root', 'Add login page with Google OAuth');
    });

    it('does NOT call prepareZeroConfig when no description is provided', async () => {
      await runCommand(['start']);

      expect(prepareZeroConfig).not.toHaveBeenCalled();
    });

    it('calls cleanupZeroConfig after a successful sprint when description was provided', async () => {
      await runCommand(['start', 'Add login page with Google OAuth']);

      expect(cleanupZeroConfig).toHaveBeenCalled();
    });

    it('calls cleanupZeroConfig on sprint error when description was provided', async () => {
      vi.mocked(runSprint).mockRejectedValue(new Error('Sprint failed'));

      await runCommand(['start', 'Add login page with Google OAuth']);

      expect(cleanupZeroConfig).toHaveBeenCalled();
    });

    it('does NOT call cleanupZeroConfig when alreadyExisted is true', async () => {
      vi.mocked(prepareZeroConfig).mockReturnValue({
        createdTemp: false,
        alreadyExisted: true,
        directivesPath: '/mock/root/DIRECTIVES.md',
      });

      await runCommand(['start', 'Add login page']);

      expect(cleanupZeroConfig).not.toHaveBeenCalled();
    });

    it('prints warning when DIRECTIVES.md already exists', async () => {
      vi.mocked(prepareZeroConfig).mockReturnValue({
        createdTemp: false,
        alreadyExisted: true,
        directivesPath: '/mock/root/DIRECTIVES.md',
      });

      await runCommand(['start', 'Add login page']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    });

    it('prints zero-config created message when DIRECTIVES was created', async () => {
      vi.mocked(prepareZeroConfig).mockReturnValue({
        createdTemp: true,
        alreadyExisted: false,
        directivesPath: '/mock/root/DIRECTIVES.md',
      });

      await runCommand(['start', 'Add login page with Google OAuth']);

      expect(print).toHaveBeenCalledWith(
        expect.stringContaining('Add login page with Google OAuth'),
      );
    });

    it('still runs sprint when description provided and DIRECTIVES already existed', async () => {
      vi.mocked(prepareZeroConfig).mockReturnValue({
        createdTemp: false,
        alreadyExisted: true,
        directivesPath: '/mock/root/DIRECTIVES.md',
      });

      await runCommand(['start', 'Add login page']);

      expect(runSprint).toHaveBeenCalled();
    });

    it('runs sprint normally when no description provided (backward-compatible)', async () => {
      await runCommand(['start']);

      expect(runSprint).toHaveBeenCalled();
      expect(prepareZeroConfig).not.toHaveBeenCalled();
    });

    it('cleans up on pre-flight failure when description was provided', async () => {
      vi.mocked(runDoctorChecks).mockReturnValue(makeDoctorResult(false) as any);

      await runCommand(['start', 'Add login page']);

      expect(cleanupZeroConfig).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('cleans up on sandbox-mode when description was provided', async () => {
      await runCommand(['start', 'Add login page', '--sandbox-mode']);

      expect(cleanupZeroConfig).toHaveBeenCalled();
    });
  });
});

// ─── Provider Cache Tests ─────────────────────────────────────────

describe('Provider Cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readProviderCache returns null when no cache file exists', () => {
    const result = readProviderCache(tmpDir);
    expect(result).toBeNull();
  });

  it('writeProviderCache creates cache file with correct content', () => {
    const mockBootstrap = {
      registered: ['claude', 'codex'] as any[],
      skipped: [],
      defaultProvider: 'claude' as any,
      connector: {} as any,
    };
    writeProviderCache(tmpDir, mockBootstrap, 'claude||');
    const cacheFile = path.join(tmpDir, '.deckent', 'provider-cache.json');
    expect(fs.existsSync(cacheFile)).toBe(true);
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    expect(cache.registered).toEqual(['claude', 'codex']);
    expect(cache.defaultProvider).toBe('claude');
    expect(cache.configHash).toBe('claude||');
    expect(cache.cachedAt).toBeDefined();
  });

  it('readProviderCache returns parsed cache after write', () => {
    const mockBootstrap = {
      registered: ['claude'] as any[],
      skipped: [],
      defaultProvider: 'claude' as any,
      connector: {} as any,
    };
    writeProviderCache(tmpDir, mockBootstrap, 'claude||');
    const result = readProviderCache(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.registered).toEqual(['claude']);
    expect(result!.configHash).toBe('claude||');
  });

  it('isProviderCacheFresh returns false when configHash differs', () => {
    const cache = {
      registered: ['claude'],
      defaultProvider: 'claude',
      cachedAt: new Date().toISOString(),
      configHash: 'claude||',
    };
    expect(isProviderCacheFresh(cache, 'codex||')).toBe(false);
  });

  it('isProviderCacheFresh returns true for recent cache with matching hash', () => {
    const cache = {
      registered: ['claude'],
      defaultProvider: 'claude',
      cachedAt: new Date().toISOString(),
      configHash: 'claude||',
    };
    expect(isProviderCacheFresh(cache, 'claude||')).toBe(true);
  });

  it('isProviderCacheFresh returns false for expired cache', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const cache = {
      registered: ['claude'],
      defaultProvider: 'claude',
      cachedAt: twoHoursAgo,
      configHash: 'claude||',
    };
    expect(isProviderCacheFresh(cache, 'claude||')).toBe(false);
  });
});

// ─── Sandbox Mode Tests ───────────────────────────────────────────

describe('Sandbox Mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-sandbox-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applySandbox returns applied:false in non-git directory', () => {
    const result = applySandbox(tmpDir);
    // In a non-git directory, git stash should fail
    expect(result.applied).toBe(false);
    expect(result.stashRef).toBeNull();
  });

  it('restoreSandbox is a no-op when applied is false', () => {
    // Should not throw
    expect(() => restoreSandbox(tmpDir, { stashRef: null, applied: false })).not.toThrow();
  });
});

// ─── Watch Subprocess Logs Tests ─────────────────────────────────

describe('watchSubprocessLogs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-watch-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a cleanup function', () => {
    const cleanup = watchSubprocessLogs(tmpDir, 10000);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('cleanup function cancels the interval without throwing', () => {
    const cleanup = watchSubprocessLogs(tmpDir, 10000);
    expect(() => cleanup()).not.toThrow();
  });

  it('handles missing .tasks directory gracefully', () => {
    // tmpDir has no .tasks subdirectory — should not throw
    const cleanup = watchSubprocessLogs(tmpDir, 10000);
    cleanup();
  });
});
