import { describe, expect, it, vi, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerRecover } from '../../src/cli/commands/recover.js';
import { runSprintRecoveryOperation } from '../../src/orchestra/sprint-recovery-operation.js';
import { print } from '../../src/cli/helpers/output.js';

vi.mock('../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: () => '/test-root' }));
vi.mock('../../src/cli/helpers/i18n.js', () => ({ detectLang: () => 'en' }));
vi.mock('../../src/cli/helpers/output.js', () => ({ print: vi.fn(), printError: vi.fn() }));
vi.mock('node:readline/promises', () => ({
  createInterface: () => ({ question: vi.fn().mockResolvedValue('y'), close: vi.fn() }),
}));
vi.mock('../../src/orchestra/sprint-recovery-operation.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/orchestra/sprint-recovery-operation.js')>(),
  readSprintRecoverySettlementIdentity: () => ({ executionId: 'sprint-482', generation: 0,
    taskId: 'sprint-482', attemptId: 'sprint-482:recovery:0', fenceToken: 'fence' }),
  runSprintRecoveryOperation: vi.fn(),
}));

import { getMessage } from '../../src/cli/helpers/messages.js';

describe('recover started-failed command', () => {
  afterEach(() => { vi.clearAllMocks(); process.exitCode = undefined; });
  async function invoke(args: string[]) {
    const program = new Command();
    registerRecover(program);
    await program.parseAsync(['recover', 'sprint-482', ...args], { from: 'user' });
  }
  const dispatchRequestId = `dreq-${'a'.repeat(64)}`;
  it.each(['--resume', '--restore-tasks'])('rejects conflicting flag %s before operation', async flag => {
    await invoke(['--retain-started-failed', dispatchRequestId, '--dry-run', flag]);
    expect(runSprintRecoveryOperation).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it('rejects malformed dispatch identity', async () => {
    await invoke(['--retain-started-failed', '../private', '--dry-run']);
    expect(runSprintRecoveryOperation).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it('forwards exact identity and projects the optional dry-run report in JSON', async () => {
    vi.mocked(runSprintRecoveryOperation).mockResolvedValueOnce({ identity: {}, audit: { overallGate: 'SKIPPED' },
      orphanIpcDirs: [], staleLocksCleaned: 0, staleSpawnLocksCleaned: 0, taskFilesArchived: 0,
      taskFilesPreserved: 0, startedFailedAttempt: { state: 'eligible', dispatchRequestId },
    } as Awaited<ReturnType<typeof runSprintRecoveryOperation>>);
    await invoke(['--retain-started-failed', dispatchRequestId, '--dry-run', '--json']);
    expect(runSprintRecoveryOperation).toHaveBeenCalledWith('/test-root', 'sprint-482',
      expect.objectContaining({ dryRun: true, startedFailedDispatchRequestId: dispatchRequestId }));
    expect(vi.mocked(runSprintRecoveryOperation).mock.calls[0]![2].approval).toBeUndefined();
    const output = JSON.parse(String(vi.mocked(print).mock.calls.at(-1)![0]));
    expect(output.startedFailedAttempt).toEqual({ state: 'eligible', dispatchRequestId });
    expect(output.taskFilesArchived).toBe(0);
  });
  it('forwards committed-unsettled retention as a distinct dry-run branch', async () => {
    vi.mocked(runSprintRecoveryOperation).mockResolvedValueOnce({ identity: {}, audit: { overallGate: 'SKIPPED' },
      orphanIpcDirs: [], staleLocksCleaned: 0, staleSpawnLocksCleaned: 0, taskFilesArchived: 0,
      taskFilesPreserved: 0, committedUnsettledAttempt: { state: 'eligible', dispatchRequestId,
        phase: 'COMMITTED_JOURNAL_RELEASE_PENDING', acceptedResult: 'ABSENT', settlement: 'UNRESOLVED' },
    } as Awaited<ReturnType<typeof runSprintRecoveryOperation>>);
    await invoke(['--retain-committed-unsettled', dispatchRequestId, '--dry-run', '--json']);
    expect(runSprintRecoveryOperation).toHaveBeenCalledWith('/test-root', 'sprint-482',
      expect.objectContaining({ dryRun: true, committedUnsettledDispatchRequestId: dispatchRequestId }));
    const output = JSON.parse(String(vi.mocked(print).mock.calls.at(-1)![0]));
    expect(output.committedUnsettledAttempt.phase).toBe('COMMITTED_JOURNAL_RELEASE_PENDING');
    expect(output.committedUnsettledAttempt.acceptedResult).toBe('ABSENT');
  });
  it('rejects combining the two retention modes', async () => {
    await invoke(['--retain-started-failed', dispatchRequestId, '--retain-committed-unsettled', dispatchRequestId, '--dry-run']);
    expect(runSprintRecoveryOperation).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it.each([
    ['started-failed', '--retain-started-failed', 'Retain exact stopped dispatch'],
    ['committed-unsettled', '--retain-committed-unsettled',
      'Retain committed-journal, release-pending dispatch'],
  ])('does not claim cleanup while confirming %s retention', async (_mode, option, expected) => {
    vi.mocked(runSprintRecoveryOperation).mockResolvedValueOnce({
      identity: {}, audit: { overallGate: 'SKIPPED' }, orphanIpcDirs: [],
      staleLocksCleaned: 0, staleSpawnLocksCleaned: 0, taskFilesArchived: 0,
      taskFilesPreserved: 0,
      ...(option === '--retain-started-failed'
        ? { startedFailedAttempt: {
            state: 'retained', dispatchRequestId, evidenceDigest: `sha256:${'b'.repeat(64)}`,
          } }
        : { committedUnsettledAttempt: {
            state: 'retained', dispatchRequestId, evidenceDigest: `sha256:${'b'.repeat(64)}`,
          } }),
    } as Awaited<ReturnType<typeof runSprintRecoveryOperation>>);

    await invoke([option, dispatchRequestId]);

    const output = vi.mocked(print).mock.calls.flatMap(call => call).join('\n');
    expect(output).toContain(expected);
    expect(output).not.toContain('Recovery will clean up run');
  });
});

describe('recover exact-custody messages', () => {
  it('keeps preview and settlement copy localized and count-driven', () => {
    expect(getMessage('recover.preview_exact_custody', 'tr', {
      count: '0',
      held: '1',
      unresolved: '1',
    })).toContain('1 HOLD admission graph');
    expect(getMessage('recover.result_exact_custody', 'en', {
      admitted: '1',
      retired: '2',
      quarantined: '1',
    })).toContain('1 historical no-effect admissions quarantined');
  });
});
