/**
 * tests/cli/commands/status-mode.test.ts
 *
 * Tests for --mode flag integration in `npx deckent status` command.
 * Verifies that output-formatter is invoked when --mode is specified.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { DashboardState } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  watch: vi.fn().mockReturnValue({ close: vi.fn() }),
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
  // human-friendly / --mode view. Default false (not orphaned).
  isDashboardOrphaned: vi.fn(() => false),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));


// Authority-first status: a quiescent run authority short-circuits to "no active sprint",
// and live status is held unless the canonical persisted read model exists. These cases
// exercise rendering, so both are supplied here. (Same pattern as
// tests/cli/commands/status.test.ts — see the note there.)
// importOriginal spread: status.ts artık loadCanonicalRunTasks +
// resolveRunStatusReadiness gibi ek export'ları da çağırıyor — gerçekleri
// mocked-fs üzerinde davranışsal-nötr çalışır (ACTIVE+alive authority HOLD üretmez).
vi.mock('../../../src/core/run-status-read-model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/core/run-status-read-model.js')>()),
  readCanonicalRunStatusReadModel: vi.fn(() => ({
    schemaVersion: 1, revision: 1, runGeneration: 1, modelDigest: 'digest-test',
    holds: [], providerConcurrency: [], authority: {},
  })),
  runStatusReadModelMatchesAuthority: vi.fn(() => true),
}));

// The canonical sprint id resolves authority-first (authority.sprintId ?? dashboard), so the
// authority mock must carry the run's real id — the dashboard fixture is presentation bytes.
vi.mock('../../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: vi.fn(() => ({
    schemaVersion: 1, lifecycle: 'ACTIVE', active: true, resumable: false,
    sprintId: 'sprint-139', phase: 'EXECUTE', status: 'RUNNING', reason: null,
    recoveryCommand: null, finalizeCommand: null, coordinator: 'alive', conflicts: [],
  })),
}));

vi.mock('../../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../src/core/output-formatter.js', () => ({
  formatStatus: vi.fn().mockReturnValue('FORMATTED OUTPUT'),
  resolveOutputMode: vi.fn((mode: string) => mode ?? 'standart'),
}));

import { readFileSync, existsSync } from 'node:fs';
import { print, formatHumanStatus } from '../../../src/cli/helpers/output.js';
import { formatStatus, resolveOutputMode } from '../../../src/core/output-formatter.js';
import { registerStatus } from '../../../src/cli/commands/status.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDashboard(overrides?: Partial<DashboardState>): DashboardState {
  return {
    sprint: { id: 'sprint-139', number: 139, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [{ id: 'w-001' } as unknown as DashboardState['agents'][0]],
    progress: { done: 5, active: 2, blocked: 0, total: 10 },
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('status --mode flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers --mode option on status command', () => {
    const program = new Command();
    registerStatus(program);
    const cmd = program.commands.find(c => c.name() === 'status');
    expect(cmd?.options.some(o => o.long === '--mode')).toBe(true);
  });

  it('calls formatStatus when --mode explainatory is provided', async () => {
    await runCommand(['status', '--mode', 'explainatory']);

    expect(vi.mocked(resolveOutputMode)).toHaveBeenCalledWith('explainatory');
    expect(vi.mocked(formatStatus)).toHaveBeenCalled();
  });

  it('calls formatStatus when --mode verbose is provided', async () => {
    await runCommand(['status', '--mode', 'verbose']);

    expect(vi.mocked(formatStatus)).toHaveBeenCalled();
  });

  it('calls formatStatus when --mode standart is provided', async () => {
    await runCommand(['status', '--mode', 'standart']);

    expect(vi.mocked(formatStatus)).toHaveBeenCalled();
  });

  it('does NOT call formatStatus when --mode is not provided (default path)', async () => {
    await runCommand(['status']);

    // formatHumanStatus should be called instead
    expect(vi.mocked(formatStatus)).not.toHaveBeenCalled();
    expect(vi.mocked(formatHumanStatus)).toHaveBeenCalled();
  });

  it('outputs formatted result via print when --mode is set', async () => {
    vi.mocked(formatStatus).mockReturnValue('★ Insight block');

    await runCommand(['status', '--mode', 'explainatory']);

    expect(vi.mocked(print)).toHaveBeenCalledWith('★ Insight block');
  });

  it('passes sprint phase from dashboard to formatStatus', async () => {
    const dash = makeDashboard({ sprint: { id: 'sprint-139', number: 139, phase: SprintPhase.EVALUATE, status: SprintStatus.ACTIVE } });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(dash));

    await runCommand(['status', '--mode', 'verbose']);

    const callArgs = vi.mocked(formatStatus).mock.calls[0];
    expect(callArgs?.[0]).toMatchObject({ sprintId: 'sprint-139' });
  });
});

// ─── Tests: --mode + --verbose combination ────────────────────────────────────

describe('status --mode + --verbose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeDashboard()));
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('calls formatStatus and also prints agent assignments with --verbose', async () => {
    await runCommand(['status', '--mode', 'explainatory', '--verbose']);

    expect(vi.mocked(formatStatus)).toHaveBeenCalled();
    // print should be called at least twice (formatStatus output + agent assignments)
    expect(vi.mocked(print)).toHaveBeenCalled();
  });
});
