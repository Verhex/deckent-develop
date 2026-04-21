import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRunSelfAuditGate = vi.fn();
const mockCleanOrphanIpcDirs = vi.fn();
const mockClearStaleLocks = vi.fn();
const mockPostFinalizeCleanup = vi.fn();

vi.mock('../../../src/orchestra/sprint-finalizer.js', () => ({
  runSelfAuditGate: (...args: unknown[]) => mockRunSelfAuditGate(...args),
}));

vi.mock('../../../src/core/orphan-cleaner.js', () => ({
  cleanOrphanIpcDirs: (...args: unknown[]) => mockCleanOrphanIpcDirs(...args),
  postFinalizeCleanup: (...args: unknown[]) => mockPostFinalizeCleanup(...args),
}));

vi.mock('../../../src/core/file-lock.js', () => ({
  clearStaleLocks: (...args: unknown[]) => mockClearStaleLocks(...args),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ mtimeMs: 0 }),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => '/fake/project',
}));

const mockPrint = vi.fn();
const mockPrintError = vi.fn();
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (...args: unknown[]) => mockPrint(...args),
  printError: (...args: unknown[]) => mockPrintError(...args),
}));

vi.mock('../../../src/core/constants.js', async () => {
  const actual = await vi.importActual('../../../src/core/constants.js') as Record<string, unknown>;
  return {
    ...actual,
    TASKS_DIR: '.tasks',
    LOCKS_DIR: '.locks',
  };
});

import { Command } from 'commander';
import { registerRecover } from '../../../src/cli/commands/recover.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerRecover(program);
  await program.parseAsync(['node', 'test', 'recover', ...args]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent recover CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    mockRunSelfAuditGate.mockResolvedValue({
      overallGate: 'PASS',
      tsc: { status: 'PASS', errors: [] },
      vitest: { status: 'PASS', delta: { files: 0, pass: 0, fail: 0, skipped: 0 } },
      honesty: { violations: 0, flaggedTasks: [] },
      observability: { metricsJsonlExists: true, lineCount: 10 },
    });
    mockCleanOrphanIpcDirs.mockReturnValue(['sprint-149-ipc']);
    mockClearStaleLocks.mockReturnValue(2);
    mockPostFinalizeCleanup.mockReturnValue({
      archivedFiles: ['task-150-001.json', 'task-150-001.result'],
      preservedFiles: ['task-150-002.json'],
      staleLocksCleaned: 0,
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('should run recovery with --force (skip confirmation)', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockRunSelfAuditGate).toHaveBeenCalledWith('sprint-150', '/fake/project');
    expect(mockCleanOrphanIpcDirs).toHaveBeenCalled();
    expect(mockClearStaleLocks).toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).toHaveBeenCalledWith('/fake/project', 'sprint-150');
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('Recovery complete'));
  });

  it('should show recovery summary after --force', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('1 removed'));
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('2 cleared'));
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('2 archived'));
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('1 preserved'));
  });

  it('should run dry-run mode without modifying anything', async () => {
    await runCommand(['sprint-150', '--dry-run']);

    expect(mockCleanOrphanIpcDirs).not.toHaveBeenCalled();
    expect(mockClearStaleLocks).not.toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).not.toHaveBeenCalled();
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('dry-run'));
  });

  it('should skip audit when --skip-audit is passed', async () => {
    await runCommand(['sprint-150', '--force', '--skip-audit']);

    expect(mockRunSelfAuditGate).not.toHaveBeenCalled();
    expect(mockCleanOrphanIpcDirs).toHaveBeenCalled();
  });

  it('should handle audit failure gracefully during recovery', async () => {
    mockRunSelfAuditGate.mockRejectedValue(new Error('tsc timeout'));

    await runCommand(['sprint-150', '--force']);

    // Recovery should still proceed even if audit fails
    expect(mockCleanOrphanIpcDirs).toHaveBeenCalled();
    expect(mockClearStaleLocks).toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).toHaveBeenCalled();
  });

  it('should handle IPC cleanup failure gracefully', async () => {
    mockCleanOrphanIpcDirs.mockImplementation(() => { throw new Error('permission denied'); });

    await runCommand(['sprint-150', '--force']);

    // Should continue to next steps
    expect(mockClearStaleLocks).toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).toHaveBeenCalled();
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('Recovery complete'));
  });

  it('should show audit gate result when audit runs', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('PASS'));
  });
});
