import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const {
  mockReadIdentity,
  mockRunRecoveryOperation,
  mockRestoreFromSnapshot,
  mockPrint,
  mockPrintError,
  MockSprintRecoveryOperationError,
} = vi.hoisted(() => ({
  mockReadIdentity: vi.fn(),
  mockRunRecoveryOperation: vi.fn(),
  mockRestoreFromSnapshot: vi.fn(),
  mockPrint: vi.fn(),
  mockPrintError: vi.fn(),
  MockSprintRecoveryOperationError: class MockSprintRecoveryOperationError extends Error {
    constructor(
      public readonly code: string,
      public readonly details: Readonly<Record<string, string>>,
    ) {
      super(code);
    }
  },
}));

vi.mock('../../../src/orchestra/sprint-recovery-operation.js', () => ({
  readSprintRecoverySettlementIdentity: mockReadIdentity,
  runSprintRecoveryOperation: mockRunRecoveryOperation,
  SprintRecoveryOperationError: MockSprintRecoveryOperationError,
}));
vi.mock('../../../src/orchestra/task-restoration.js', () => ({
  restoreFromSnapshot: mockRestoreFromSnapshot,
}));
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => '/fake/project',
}));
vi.mock('../../../src/cli/helpers/i18n.js', () => ({
  detectLang: () => 'en',
}));
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: mockPrint,
  printError: mockPrintError,
}));

import { registerRecover, runRecovery } from '../../../src/cli/commands/recover.js';

const identity = {
  executionId: 'sprint-150',
  generation: 4,
  taskId: 'sprint-150',
  attemptId: 'sprint-150:recovery:4',
  fenceToken: 'exact-fence',
};

const report = {
  identity,
  disposition: 'GO' as const,
  audit: { overallGate: 'PASS' as const },
  orphanIpcDirs: [],
  staleLocksCleaned: 0,
  staleSpawnLocksCleaned: 0,
  taskFilesArchived: 2,
  taskFilesPreserved: 1,
  artifactPolicy: {
    checkpoint: { disposition: 'PRESERVED' as const, digest: 'checkpoint-digest' },
  },
};

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerRecover(program);
  await program.parseAsync(['node', 'test', 'recover', ...args]);
}

describe('deckent recover CLI application adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    mockReadIdentity.mockReturnValue(identity);
    mockRunRecoveryOperation.mockResolvedValue(report);
    mockRestoreFromSnapshot.mockReturnValue({
      success: true,
      restoredFiles: ['task-150-001.json'],
    });
  });

  it('binds a forced mutation to the exact recovery identity', async () => {
    await runCommand(['sprint-150', '--force']);

    expect(mockRunRecoveryOperation).toHaveBeenCalledWith(
      '/fake/project',
      'sprint-150',
      {
        dryRun: undefined,
        skipAudit: undefined,
        approval: {
          approvalRef: 'cli:force',
          idempotencyKey: 'cli:sprint-150:4:exact-fence',
          identity,
        },
      },
    );
    expect(mockPrint).toHaveBeenCalledWith(
      expect.stringContaining('Task files:      2 archived, 1 preserved'),
    );
    expect(mockPrintError).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(1);
  });

  it('keeps dry-run read-only and does not manufacture approval', async () => {
    await runCommand(['sprint-150', '--dry-run']);

    expect(mockRunRecoveryOperation).toHaveBeenCalledWith(
      '/fake/project',
      'sprint-150',
      { dryRun: true, skipAudit: undefined },
    );
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('dry-run'));
  });

  it('projects stable JSON fields from the shared operation', async () => {
    await runCommand(['sprint-150', '--force', '--json']);

    const jsonLine = mockPrint.mock.calls
      .map(([value]) => String(value))
      .find(value => value.startsWith('{'));
    expect(JSON.parse(jsonLine!)).toMatchObject({
      sprintId: 'sprint-150',
      dryRun: false,
      identity: { generation: 4, fenceToken: 'exact-fence' },
      auditGate: 'PASS',
      taskFilesArchived: 2,
      taskFilesPreserved: 1,
    });
  });

  it('maps a typed HOLD without printing terminal success', async () => {
    mockRunRecoveryOperation.mockRejectedValueOnce(
      new MockSprintRecoveryOperationError('SETTLEMENT_FAILED', {
        sprintId: 'sprint-150',
        disposition: 'HOLD',
        reason: 'still-alive',
      }),
    );

    await runCommand(['sprint-150', '--force']);

    expect(process.exitCode).toBe(1);
    expect(mockPrintError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('still-alive') }),
    );
    expect(mockPrint).not.toHaveBeenCalledWith(expect.stringContaining('Recovery complete'));
  });

  it('forwards skip-audit to the one shared application operation', async () => {
    await runCommand(['sprint-150', '--force', '--skip-audit']);

    expect(mockRunRecoveryOperation).toHaveBeenCalledWith(
      '/fake/project',
      'sprint-150',
      expect.objectContaining({ skipAudit: true }),
    );
  });

  it('keeps restore as an explicit mutually exclusive rollback surface', async () => {
    await runCommand(['sprint-150', '--force', '--restore-tasks']);

    expect(mockRestoreFromSnapshot).toHaveBeenCalledWith('/fake/project', 'sprint-150');
    expect(mockRunRecoveryOperation).not.toHaveBeenCalled();
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('Restored'));
  });

  it('does not hide non-recovery programming errors', async () => {
    mockRunRecoveryOperation.mockRejectedValueOnce(new TypeError('adapter bug'));

    await expect(runRecovery(
      '/fake/project',
      'sprint-150',
      { force: true },
      'en',
    )).rejects.toThrow('adapter bug');
  });
});
