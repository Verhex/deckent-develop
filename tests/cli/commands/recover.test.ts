import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRunSelfAuditGate = vi.fn();
const mockCleanOrphanIpcDirs = vi.fn();
const mockClearStaleLocks = vi.fn();
const mockPostFinalizeCleanup = vi.fn();
const mockPreviewFinalizeCleanup = vi.fn();
const mockCreatePreArchiveSnapshot = vi.fn();
const mockVerifySnapshot = vi.fn();
const mockRestoreFromSnapshot = vi.fn();
const mockCleanupCheckpointFiles = vi.fn();
const mockClearPid = vi.fn();
const mockReadSprintState = vi.fn();
const mockClearSprintState = vi.fn();
// Ordered log of side-effecting calls — proves snapshot-before-archive.
const callLog: string[] = [];

vi.mock('../../../src/orchestra/sprint-finalizer.js', () => ({
  runSelfAuditGate: (...args: unknown[]) => { callLog.push('audit'); return mockRunSelfAuditGate(...args); },
}));

vi.mock('../../../src/core/orphan-cleaner.js', () => ({
  cleanOrphanIpcDirs: (...args: unknown[]) => mockCleanOrphanIpcDirs(...args),
  postFinalizeCleanup: (...args: unknown[]) => { callLog.push('archive'); return mockPostFinalizeCleanup(...args); },
  previewFinalizeCleanup: (...args: unknown[]) => mockPreviewFinalizeCleanup(...args),
}));

vi.mock('../../../src/orchestra/task-restoration.js', () => ({
  createPreArchiveSnapshot: (...args: unknown[]) => { callLog.push('snapshot'); return mockCreatePreArchiveSnapshot(...args); },
  verifySnapshot: (...args: unknown[]) => mockVerifySnapshot(...args),
  restoreFromSnapshot: (...args: unknown[]) => mockRestoreFromSnapshot(...args),
}));

vi.mock('../../../src/orchestra/sprint-checkpoint.js', () => ({
  cleanupCheckpointFiles: (...args: unknown[]) => mockCleanupCheckpointFiles(...args),
}));

vi.mock('../../../src/orchestra/sprint-pid-manager.js', () => ({
  clearPid: (...args: unknown[]) => mockClearPid(...args),
}));

vi.mock('../../../src/orchestra/sprint-utils.js', () => ({
  readSprintState: (...args: unknown[]) => mockReadSprintState(...args),
  clearSprintState: (...args: unknown[]) => mockClearSprintState(...args),
}));

vi.mock('../../../src/core/file-lock.js', () => ({
  clearStaleLocks: (...args: unknown[]) => mockClearStaleLocks(...args),
  clearStaleSpawnLocks: vi.fn().mockReturnValue(0),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
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
    callLog.length = 0;

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
    mockPreviewFinalizeCleanup.mockReturnValue({
      archivedFiles: ['task-150-001.json', 'task-150-001.result'],
      preservedFiles: ['task-150-002.json'],
    });
    mockCreatePreArchiveSnapshot.mockReturnValue({
      snapshotPath: '/fake/project/.deckent/recently-works/sprint-150-pre-archive.tar.gz',
      hashPath: '/fake/project/.deckent/recently-works/sprint-150-pre-archive.sha256',
      hash: 'deadbeef',
      fileCount: 3,
    });
    mockVerifySnapshot.mockReturnValue(true);
    mockReadSprintState.mockReturnValue(null);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('should run recovery with --force (skip confirmation)', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockRunSelfAuditGate).toHaveBeenCalledWith('sprint-150', '/fake/project');
    expect(mockCleanOrphanIpcDirs).not.toHaveBeenCalled();
    expect(mockClearStaleLocks).not.toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).toHaveBeenCalledWith('/fake/project', 'sprint-150', { cleanStaleLocks: false });
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('Recovery complete'));
  });

  it('should show recovery summary after --force', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('0 removed'));
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('0 cleared'));
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

  it('dry-run invokes NO audit/subprocess child and mutates no metadata', async () => {
    await runCommand(['sprint-150', '--dry-run']);

    // No audit (tsc/vitest), no snapshot (tar) — zero subprocess.
    expect(mockRunSelfAuditGate).not.toHaveBeenCalled();
    expect(mockCreatePreArchiveSnapshot).not.toHaveBeenCalled();
    // No metadata mutation.
    expect(mockCleanupCheckpointFiles).not.toHaveBeenCalled();
    expect(mockClearPid).not.toHaveBeenCalled();
    expect(mockClearSprintState).not.toHaveBeenCalled();
    // Reports the sprint-scoped preview set instead.
    expect(mockPreviewFinalizeCleanup).toHaveBeenCalledWith('/fake/project', 'sprint-150');
  });

  it('real recover snapshots BEFORE it archives (rollback point is durable first)', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockCreatePreArchiveSnapshot).toHaveBeenCalledWith('/fake/project', 'sprint-150');
    expect(mockPostFinalizeCleanup).toHaveBeenCalled();
    const snapshotIdx = callLog.indexOf('snapshot');
    const archiveIdx = callLog.indexOf('archive');
    expect(snapshotIdx).toBeGreaterThanOrEqual(0);
    expect(archiveIdx).toBeGreaterThanOrEqual(0);
    expect(snapshotIdx).toBeLessThan(archiveIdx);
  });

  it('real recover clears ONLY the target sprint checkpoint + PID metadata', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockCleanupCheckpointFiles).toHaveBeenCalledWith('/fake/project', 'sprint-150');
    expect(mockClearPid).toHaveBeenCalledWith('/fake/project', 'sprint-150');
    // sprint-state not this sprint's (mock returns null) → never cleared.
    expect(mockClearSprintState).not.toHaveBeenCalled();
  });

  it('retains all target metadata and reports failure when archive evidence is incomplete', async () => {
    mockPostFinalizeCleanup.mockReturnValue({
      archivedFiles: ['task-150-001.json'],
      preservedFiles: ['task-150-002.json'],
      staleLocksCleaned: 0,
    });

    await runCommand(['sprint-150', '--force']);

    expect(process.exitCode).toBe(1);
    expect(mockCleanupCheckpointFiles).not.toHaveBeenCalled();
    expect(mockClearPid).not.toHaveBeenCalled();
    expect(mockClearSprintState).not.toHaveBeenCalled();
    expect(mockPrintError).toHaveBeenCalled();
  });

  it('fails closed before archive when the snapshot did not materialize', async () => {
    mockCreatePreArchiveSnapshot.mockReturnValue(null);

    await runCommand(['sprint-150', '--force']);

    expect(mockPostFinalizeCleanup).not.toHaveBeenCalled();
    expect(mockCleanupCheckpointFiles).not.toHaveBeenCalled();
    expect(mockClearPid).not.toHaveBeenCalled();
    expect(mockClearSprintState).not.toHaveBeenCalled();
  });

  it('clears sprint-state only when it still names the target sprint', async () => {
    mockReadSprintState.mockReturnValue({ sprintId: 'sprint-150', phase: 'EXECUTE', status: 'ACTIVE' });

    await runCommand(['sprint-150', '--force']);

    expect(mockClearSprintState).toHaveBeenCalledTimes(1);
  });

  it('does NOT clear sprint-state belonging to a different sprint', async () => {
    mockReadSprintState.mockReturnValue({ sprintId: 'sprint-999', phase: 'EXECUTE', status: 'ACTIVE' });

    await runCommand(['sprint-150', '--force']);

    expect(mockClearSprintState).not.toHaveBeenCalled();
  });

  it('should skip audit when --skip-audit is passed', async () => {
    await runCommand(['sprint-150', '--force', '--skip-audit']);

    expect(mockRunSelfAuditGate).not.toHaveBeenCalled();
    expect(mockCleanOrphanIpcDirs).not.toHaveBeenCalled();
  });

  it('should handle audit failure gracefully during recovery', async () => {
    mockRunSelfAuditGate.mockRejectedValue(new Error('tsc timeout'));

    await runCommand(['sprint-150', '--force']);

    // Recovery should still proceed even if audit fails
    expect(mockPostFinalizeCleanup).toHaveBeenCalled();
  });

  it('does not touch repo-global IPC or locks during targeted recovery', async () => {

    await runCommand(['sprint-150', '--force']);

    expect(mockCleanOrphanIpcDirs).not.toHaveBeenCalled();
    expect(mockClearStaleLocks).not.toHaveBeenCalled();
    expect(mockPostFinalizeCleanup).toHaveBeenCalled();
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('Recovery complete'));
  });

  it('should show audit gate result when audit runs', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('PASS'));
  });
});
