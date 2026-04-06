/**
 * i18n Integration Tests — start, plan, status commands
 *
 * Verifies that:
 *  1. getMessage() returns correct en/tr strings for all new keys
 *  2. start command uses config.language (en vs tr)
 *  3. plan command uses config.language (en vs tr)
 *  4. getLangFromRoot reads language from config file
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { DashboardState } from '../../../src/core/types.js';

// ─── getMessage direct tests (no mocks needed) ───────────────────────

import { getMessage } from '../../../src/cli/helpers/messages.js';

describe('getMessage — start command keys', () => {
  it('returns English sandbox message for lang=en', () => {
    expect(getMessage('start.sandbox_not_implemented', 'en')).toBe(
      'Sandbox mode not yet implemented. Running normally.',
    );
  });

  it('returns Turkish sandbox message for lang=tr', () => {
    const msg = getMessage('start.sandbox_not_implemented', 'tr');
    expect(msg).toContain('Sandbox');
    expect(msg).not.toBe(getMessage('start.sandbox_not_implemented', 'en'));
  });

  it('returns English --force hint for lang=en', () => {
    expect(getMessage('start.use_force', 'en')).toBe(
      'Use --force to skip pre-flight checks.',
    );
  });

  it('returns Turkish --force hint for lang=tr', () => {
    const msg = getMessage('start.use_force', 'tr');
    expect(msg).toContain('--force');
    expect(msg).not.toBe(getMessage('start.use_force', 'en'));
  });

  it('returns English watch-ignored note for lang=en', () => {
    expect(getMessage('start.watch_ignored_dry_run', 'en')).toContain(
      '--watch ignored',
    );
  });

  it('returns Turkish watch-ignored note for lang=tr', () => {
    const msg = getMessage('start.watch_ignored_dry_run', 'tr');
    expect(msg).toContain('--watch');
    expect(msg).not.toBe(getMessage('start.watch_ignored_dry_run', 'en'));
  });

  it('interpolates {number}, {id}, {count} in start.sprint_planned', () => {
    const msg = getMessage('start.sprint_planned', 'en', {
      number: '5', id: 'sprint-005', count: '3',
    });
    expect(msg).toContain('sprint-005');
    expect(msg).toContain('3');
  });

  it('interpolates {count} and {model} in start.workers_info', () => {
    const msg = getMessage('start.workers_info', 'en', { count: '4', model: 'opus' });
    expect(msg).toContain('4');
    expect(msg).toContain('opus');
  });

  it('returns dry-run complete message for en', () => {
    expect(getMessage('start.dry_run_complete', 'en')).toContain('Dry-run complete');
  });

  it('returns Turkish dry-run complete message for tr', () => {
    const msg = getMessage('start.dry_run_complete', 'tr');
    expect(msg).toContain('Dry-run');
    expect(msg).not.toBe(getMessage('start.dry_run_complete', 'en'));
  });

  it('returns watch-created message for en', () => {
    expect(getMessage('start.watch_window_created', 'en')).toContain('Watch window created');
  });

  it('returns watch-no-tmux message for en', () => {
    expect(getMessage('start.watch_no_tmux', 'en')).toContain('--watch requires');
  });
});

describe('getMessage — plan command keys', () => {
  it('returns English plan.approved for lang=en', () => {
    expect(getMessage('plan.approved', 'en')).toBe('Plan approved.');
  });

  it('returns Turkish plan.approved for lang=tr', () => {
    const msg = getMessage('plan.approved', 'tr');
    expect(msg).not.toBe('Plan approved.');
  });

  it('returns English plan.rejected for lang=en', () => {
    expect(getMessage('plan.rejected', 'en')).toBe('Plan rejected.');
  });

  it('returns Turkish plan.rejected for lang=tr', () => {
    const msg = getMessage('plan.rejected', 'tr');
    expect(msg).not.toBe('Plan rejected.');
  });

  it('interpolates plan.sprint_planned with number, id, count', () => {
    const msg = getMessage('plan.sprint_planned', 'en', {
      number: '3', id: 'sprint-003', count: '7',
    });
    expect(msg).toContain('sprint-003');
    expect(msg).toContain('7 tasks');
  });

  it('returns Turkish sprint_planned message for tr', () => {
    const enMsg = getMessage('plan.sprint_planned', 'en', { number: '1', id: 'sprint-001', count: '5' });
    const trMsg = getMessage('plan.sprint_planned', 'tr', { number: '1', id: 'sprint-001', count: '5' });
    expect(trMsg).not.toBe(enMsg);
    expect(trMsg).toContain('sprint-001');
  });

  it('interpolates plan.note_sprint_size with size and reason', () => {
    const msg = getMessage('plan.note_sprint_size', 'en', { size: 'reduced', reason: 'High usage' });
    expect(msg).toContain('reduced');
    expect(msg).toContain('High usage');
  });

  it('returns Turkish note_sprint_size for tr', () => {
    const trMsg = getMessage('plan.note_sprint_size', 'tr', { size: 'reduced', reason: 'Yüksek kullanım' });
    expect(trMsg).toContain('reduced');
    expect(trMsg).toContain('Yüksek kullanım');
    expect(trMsg).not.toBe(getMessage('plan.note_sprint_size', 'en', { size: 'reduced', reason: 'Yüksek kullanım' }));
  });
});

describe('getMessage — status command keys', () => {
  it('returns English no_active_sprint for lang=en', () => {
    const msg = getMessage('status.no_active_sprint', 'en');
    expect(msg).toContain('No active sprint');
    expect(msg).toContain('deckent start');
  });

  it('returns Turkish no_active_sprint for lang=tr', () => {
    const msg = getMessage('status.no_active_sprint', 'tr');
    expect(msg).not.toBe(getMessage('status.no_active_sprint', 'en'));
    expect(msg).toContain('deckent start');
  });

  it('returns English dashboard_read_failed for lang=en', () => {
    expect(getMessage('status.dashboard_read_failed', 'en')).toBe('Failed to read dashboard file.');
  });

  it('returns Turkish dashboard_read_failed for lang=tr', () => {
    const msg = getMessage('status.dashboard_read_failed', 'tr');
    expect(msg).not.toBe('Failed to read dashboard file.');
  });
});

describe('getMessage — fallback behaviour', () => {
  it('returns key itself when key is not registered', () => {
    expect(getMessage('nonexistent.key', 'en')).toBe('nonexistent.key');
  });

  it('falls back to English when lang is unknown', () => {
    expect(getMessage('plan.approved', 'fr')).toBe('Plan approved.');
  });

  it('falls back to English when lang is empty string', () => {
    expect(getMessage('plan.approved', '')).toBe('Plan approved.');
  });

  it('leaves unreferenced placeholders intact', () => {
    const msg = getMessage('start.sprint_planned', 'en', { number: '1' });
    // {id} and {count} not provided — should be left as {id} and {count}
    expect(msg).toContain('{id}');
    expect(msg).toContain('{count}');
  });
});

// ─── getLangFromRoot tests ────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';
import { getLangFromRoot } from '../../../src/cli/commands/status.js';

describe('getLangFromRoot', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns "en" when config file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(getLangFromRoot('/some/root')).toBe('en');
  });

  it('returns "tr" when config has language="tr"', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ language: 'tr' }));
    expect(getLangFromRoot('/some/root')).toBe('tr');
  });

  it('returns "en" when config has language="en"', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ language: 'en' }));
    expect(getLangFromRoot('/some/root')).toBe('en');
  });

  it('returns "en" when config has unknown language', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ language: 'fr' }));
    expect(getLangFromRoot('/some/root')).toBe('en');
  });

  it('returns "en" when config has no language field', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mode: 'max_plan' }));
    expect(getLangFromRoot('/some/root')).toBe('en');
  });

  it('returns "en" when config file is invalid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json!!!');
    expect(getLangFromRoot('/some/root')).toBe('en');
  });
});

// ─── start command i18n integration ──────────────────────────────────

vi.mock('../../../src/core/config.js', () => ({ loadConfig: vi.fn() }));
vi.mock('../../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  confirmDraftTasks: vi.fn(),
  cleanupDraftTasks: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(message: string, phase?: string) { super(message); this.phase = phase; }
  },
}));
vi.mock('../../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  setupWatchWindow: vi.fn(),
}));
vi.mock('../../../src/core/constants.js', () => ({ TMUX_SESSION_NAME: 'deckent', DASHBOARD_FILE: '.dashboard', TASKS_DIR: '.tasks' }));
vi.mock('../../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
}));
vi.mock('../../../src/cli/commands/quick-start.js', () => ({
  prepareZeroConfig: vi.fn(),
  cleanupZeroConfig: vi.fn(),
}));
vi.mock('../../../src/cli/commands/doctor.js', () => ({ runDoctorChecks: vi.fn() }));
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
  formatTable: vi.fn().mockReturnValue('Task table'),
  formatDashboard: vi.fn().mockReturnValue('Dashboard Output'),
  formatHumanStatus: vi.fn().mockReturnValue('Human Status'),
  formatStandaloneStatus: vi.fn().mockReturnValue('Standalone Status'),
  isNoColor: vi.fn().mockReturnValue(false),
  stripAnsi: vi.fn().mockImplementation((s: string) => s),
}));
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));
vi.mock('../../../src/cli/helpers/prompt.js', () => ({
  promptConfirm: vi.fn().mockResolvedValue(false),
}));

import { loadConfig } from '../../../src/core/config.js';
import { runSprint, readContext, planSprint } from '../../../src/orchestra/brain.js';
import { runDoctorChecks } from '../../../src/cli/commands/doctor.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerStart } from '../../../src/cli/commands/start.js';
import { registerPlan } from '../../../src/cli/commands/plan.js';

function makeConfig(language = 'en') {
  return {
    activeModeConfig: { brain_model: 'opus', max_workers: 3 },
    brain_planning: 'auto',
    language,
  };
}

function makeSprint() {
  return {
    id: 'sprint-001',
    number: 1,
    tasks: [{ id: '001-001', title: 'Task One', model: 'sonnet', priority: 'NORMAL' }],
    reasoning: undefined,
    planningMode: undefined,
  };
}

async function runStartCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStart(program);
  try { await program.parseAsync(['node', 'test', ...args]); } catch { /* exitOverride */ }
}

async function runPlanCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerPlan(program);
  try { await program.parseAsync(['node', 'test', ...args]); } catch { /* exitOverride */ }
}

describe('start command — i18n integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue(makeConfig('en') as any);
    vi.mocked(runDoctorChecks).mockReturnValue({ checks: [] } as any);
    vi.mocked(readContext).mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as any);
    vi.mocked(planSprint).mockReturnValue(makeSprint() as any);
    vi.mocked(runSprint).mockResolvedValue(makeSprint() as any);
  });
  afterEach(() => { process.exitCode = undefined; });

  it('uses English sandbox message when lang=en', async () => {
    await runStartCommand(['start', '--sandbox-mode']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(m => typeof m === 'string' && m.includes('Sandbox mode'))).toBe(true);
  });

  it('uses Turkish sandbox message when lang=tr', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig('tr') as any);
    await runStartCommand(['start', '--sandbox-mode']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(m => typeof m === 'string' && m.includes('Sandbox mode'))).toBe(true);
  });

  it('uses English --force hint when lang=en', async () => {
    vi.mocked(runDoctorChecks).mockReturnValue({
      checks: [{ name: 'tmux', required: true, passed: false, message: 'not found' }],
    } as any);
    await runStartCommand(['start']);
    expect(print).toHaveBeenCalledWith('Use --force to skip pre-flight checks.');
  });

  it('uses Turkish --force hint when lang=tr', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig('tr') as any);
    vi.mocked(runDoctorChecks).mockReturnValue({
      checks: [{ name: 'tmux', required: true, passed: false, message: 'not found' }],
    } as any);
    await runStartCommand(['start']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(m => m.includes('--force') && m !== 'Use --force to skip pre-flight checks.')).toBe(true);
  });

  it('dry-run prints dry-run-complete in English for lang=en', async () => {
    await runStartCommand(['start', '--dry-run']);
    expect(print).toHaveBeenCalledWith('Dry-run complete. No workers spawned.');
  });

  it('dry-run prints dry-run-complete in Turkish for lang=tr', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig('tr') as any);
    await runStartCommand(['start', '--dry-run']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(m => m.includes('Dry-run') && m !== 'Dry-run complete. No workers spawned.')).toBe(true);
  });
});

describe('plan command — i18n integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue(makeConfig('en') as any);
    vi.mocked(readContext).mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as any);
    vi.mocked(planSprint).mockReturnValue(makeSprint() as any);
  });
  afterEach(() => { process.exitCode = undefined; });

  it('prints "Plan rejected." in English when lang=en', async () => {
    await runPlanCommand(['plan']);
    expect(print).toHaveBeenCalledWith('Plan rejected.');
  });

  it('prints Turkish rejection message when lang=tr', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig('tr') as any);
    await runPlanCommand(['plan']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(m => m.includes('reddedildi'))).toBe(true);
  });

  it('prints "Plan approved." in English when lang=en and confirmed', async () => {
    const { promptConfirm } = await import('../../../src/cli/helpers/prompt.js');
    vi.mocked(promptConfirm).mockResolvedValue(true);
    await runPlanCommand(['plan']);
    expect(print).toHaveBeenCalledWith('Plan approved.');
  });
});

// ─── status command i18n integration ─────────────────────────────────

describe('status command — i18n integration', () => {
  function makeDashboard(overrides?: Partial<DashboardState>): DashboardState {
    return {
      sprint: { id: 'sprint-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
      agents: [],
      progress: { done: 1, active: 1, blocked: 0, total: 2 },
      alerts: [],
      updatedAt: '2026-03-20T00:00:00Z',
      ...overrides,
    };
  }

  async function runStatusCommand(args: string[]): Promise<void> {
    const { registerStatus } = await import('../../../src/cli/commands/status.js');
    const program = new Command();
    program.exitOverride();
    registerStatus(program);
    try { await program.parseAsync(['node', 'test', ...args]); } catch { /* exitOverride */ }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => { process.exitCode = undefined; });

  it('shows "No active sprint" English message when dashboard missing and config has lang=en', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runStatusCommand(['status']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No active sprint'));
  });

  it('shows Turkish "no active sprint" when config has lang=tr', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const path = String(p);
      if (path.includes('config.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      const path = String(p);
      if (path.includes('config.json')) return JSON.stringify({ language: 'tr' });
      return JSON.stringify(makeDashboard());
    });
    await runStatusCommand(['status']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(m => m.includes('Aktif sprint yok'))).toBe(true);
  });

  it('shows "Failed to read dashboard file." in English when parse fails and lang=en', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('bad json!!!');
    await runStatusCommand(['status']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Failed to read dashboard file.' }),
    );
  });
});
