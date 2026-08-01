import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRunSprint = vi.fn();
const mockHasCheckpoint = vi.fn();
const mockReadCheckpoint = vi.fn();
const mockDetectStaleWorkers = vi.fn();
const mockLoadConfig = vi.fn();
const mockDeriveResumeDisposition = vi.fn();
const mockReadSprintState = vi.fn();
const mockClearSprintState = vi.fn();
const mockReadCanonicalRunStatus = vi.fn();
const mockTerminalizeCompletedCheckpointRun = vi.fn();

vi.mock('../../../src/orchestra/brain.js', () => ({
  runSprint: (...args: unknown[]) => mockRunSprint(...args),
}));

vi.mock('../../../src/orchestra/completed-checkpoint-terminalizer.js', () => ({
  terminalizeCompletedCheckpointRun: (...args: unknown[]) => mockTerminalizeCompletedCheckpointRun(...args),
}));

const mockResetInterrupted = vi.fn();
const mockBuildPreplanned = vi.fn();
vi.mock('../../../src/orchestra/sprint-checkpoint.js', () => ({
  hasCheckpoint: (...args: unknown[]) => mockHasCheckpoint(...args),
  readCheckpoint: (...args: unknown[]) => mockReadCheckpoint(...args),
  detectStaleWorkers: (...args: unknown[]) => mockDetectStaleWorkers(...args),
  deriveResumeDisposition: (...args: unknown[]) => mockDeriveResumeDisposition(...args),
  resetInterruptedWorkersToPending: (...args: unknown[]) => mockResetInterrupted(...args),
  buildPreplannedResumeSprint: (...args: unknown[]) => mockBuildPreplanned(...args),
  hasValidResult: () => false,
}));

vi.mock('../../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

vi.mock('../../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({ connector: 'test-connector' }),
}));

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockReaddirSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => '/fake/project',
}));

vi.mock('../../../src/orchestra/sprint-utils.js', () => ({
  readSprintState: (...args: unknown[]) => mockReadSprintState(...args),
  clearSprintState: (...args: unknown[]) => mockClearSprintState(...args),
}));

vi.mock('../../../src/core/run-status-authority.js', () => ({
  readCanonicalRunStatus: (...args: unknown[]) => mockReadCanonicalRunStatus(...args),
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
    DECKENT_DIR: '.deckent',
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
    TASKS_DIR: '.tasks',
    SPRINT_STATE_FILE: '.deckent/sprint-state.json',
  };
});

import { Command } from 'commander';
import { registerResume } from '../../../src/cli/commands/resume.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_CHECKPOINT = {
  sprintId: 'sprint-321',
  checkpointNumber: 3,
  timestamp: '2026-06-24T00:00:00.000Z',
  completedTasks: ['321-001', '321-002'],
  pendingTasks: ['321-003'],
  activeWorkers: [{ workerId: 'w-321-004', taskId: '321-004', status: 'EXECUTING', spawnedAt: '2026-06-24T00:00:00.000Z' }],
  brainPhase: 'EXECUTE',
  eventStreamOffset: 42,
};

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerResume(program);
  await program.parseAsync(['node', 'test', 'resume', ...args]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent resume CLI — preplanned exactly-once handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    mockHasCheckpoint.mockReturnValue(true);
    mockReadCheckpoint.mockReturnValue(FAKE_CHECKPOINT);
    mockDetectStaleWorkers.mockReturnValue([]);
    mockLoadConfig.mockResolvedValue({ deckent_style: 'sprint' });
    mockDeriveResumeDisposition.mockReturnValue({
      resumableIds: ['321-003', '321-004'],
      parkedSettlements: [],
    });
    mockRunSprint.mockResolvedValue({ id: 'sprint-321', tasks: [], status: 'COMPLETE' });
    mockTerminalizeCompletedCheckpointRun.mockResolvedValue({
      id: 'sprint-321', tasks: [], status: 'COMPLETE', phase: 'COMPLETE',
    });
    mockReadSprintState.mockReturnValue(null);
    mockReadCanonicalRunStatus.mockReturnValue({
      lifecycle: 'COMPLETE',
      sprintId: 'sprint-321',
      status: 'COMPLETE',
      reason: null,
      resumable: false,
      recoveryCommand: null,
      finalizeCommand: null,
    });
    mockExistsSync.mockReturnValue(false);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
    mockResetInterrupted.mockImplementation((_root: unknown, cp: unknown) => ({
      resetIds: ['321-003', '321-004'], checkpoint: cp, committed: true,
    }));
    mockBuildPreplanned.mockReturnValue({
      id: 'sprint-321', number: 321, status: 'PLANNING', phase: 'PLAN', tasks: [], workers: [],
    });
  });

  it('does not write sprint-state.json and invokes the normal path with a preplanned sprint', async () => {
    await runCommand(['sprint-321']);

    const stateWriteCall = mockWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('sprint-state.json'),
    );
    expect(stateWriteCall).toBeUndefined();
    expect(mockRunSprint).toHaveBeenCalledWith(
      '/fake/project',
      { deckent_style: 'sprint' },
      expect.objectContaining({ preplannedSprint: expect.objectContaining({ id: 'sprint-321' }) }),
    );
  });

  it('builds the preplanned sprint from the full checkpoint and exact resumable ids', async () => {
    await runCommand(['sprint-321']);
    expect(mockBuildPreplanned).toHaveBeenCalledWith(
      '/fake/project', FAKE_CHECKPOINT, ['321-003', '321-004'],
    );
  });

  it('commits the same ids reported by dry-run before building or spawning', async () => {
    await runCommand(['sprint-321']);
    expect(mockResetInterrupted).toHaveBeenCalledWith(
      '/fake/project', FAKE_CHECKPOINT, ['321-003', '321-004'],
    );
  });

  it('HOLDs before build/spawn when the checkpoint commit fails', async () => {
    mockResetInterrupted.mockReturnValue({
      resetIds: [], checkpoint: FAKE_CHECKPOINT, committed: false, error: 'rename failed',
    });
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    await expect(runCommand(['sprint-321'])).rejects.toThrow('process.exit called');
    expect(mockBuildPreplanned).not.toHaveBeenCalled();
    expect(mockRunSprint).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('exits early on dry-run without writing sprint-state.json or calling runSprint', async () => {
    await runCommand(['sprint-321', '--dry-run']);

    const stateWriteCall = mockWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('sprint-state.json'),
    );
    expect(stateWriteCall).toBeUndefined();
    expect(mockRunSprint).not.toHaveBeenCalled();
  });

  it('keeps dry-run read-only when host settlement is pending', async () => {
      mockDeriveResumeDisposition.mockReturnValue({
        resumableIds: [],
        parkedSettlements: [
          { taskId: '321-004', state: 'pending-settlement' },
        ],
      });

      await runCommand(['sprint-321', '--dry-run']);

      expect(process.exitCode).toBe(1);
      expect(mockPrintError).toHaveBeenCalledWith(
        expect.stringContaining('321-004 (pending-settlement)'),
      );
      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(mockResetInterrupted).not.toHaveBeenCalled();
      expect(mockBuildPreplanned).not.toHaveBeenCalled();
      expect(mockRunSprint).not.toHaveBeenCalled();
  });

  it('runs settlement-first recovery without reset or preplanned spawn', async () => {
    mockDeriveResumeDisposition.mockReturnValue({
      resumableIds: [],
      parkedSettlements: [
        { taskId: '321-004', state: 'pending-settlement' },
      ],
    });
    mockReadSprintState.mockReturnValue({ sprintId: 'sprint-321' });

    await runCommand(['sprint-321']);

    expect(mockLoadConfig).toHaveBeenCalledWith('/fake/project');
    expect(mockResetInterrupted).not.toHaveBeenCalled();
    expect(mockBuildPreplanned).not.toHaveBeenCalled();
    expect(mockClearSprintState).not.toHaveBeenCalled();
    expect(mockRunSprint).toHaveBeenCalledWith(
      '/fake/project',
      { deckent_style: 'sprint' },
      expect.objectContaining({
        autoApprove: false,
        acknowledgeScopePaths: false,
        connector: 'test-connector',
      }),
    );
  });

  it('HOLDs an invalid settlement without invoking recovery', async () => {
    mockDeriveResumeDisposition.mockReturnValue({
      resumableIds: [],
      parkedSettlements: [
        { taskId: '321-004', state: 'invalid-settlement' },
      ],
    });

    await runCommand(['sprint-321']);

    expect(process.exitCode).toBe(1);
    expect(mockLoadConfig).not.toHaveBeenCalled();
    expect(mockRunSprint).not.toHaveBeenCalled();
  });

  it('exits early when all tasks already completed without calling runSprint', async () => {
    mockReadCheckpoint.mockReturnValue({
      ...FAKE_CHECKPOINT,
      completedTasks: ['321-001', '321-002'],
      pendingTasks: [],
      activeWorkers: [],
    });
    mockDeriveResumeDisposition.mockReturnValue({
      resumableIds: [],
      parkedSettlements: [],
    });

    await runCommand(['sprint-321']);

    expect(mockRunSprint).not.toHaveBeenCalled();
    expect(mockTerminalizeCompletedCheckpointRun).not.toHaveBeenCalled();
  });

  it('terminalizes a legacy completed test checkpoint without redispatching work', async () => {
    const completed = {
      ...FAKE_CHECKPOINT,
      completedTasks: ['321-001', '321-002'],
      pendingTasks: [],
      activeWorkers: [],
    };
    mockReadCheckpoint.mockReturnValue(completed);
    mockDeriveResumeDisposition.mockReturnValue({ resumableIds: [], parkedSettlements: [] });

    await runCommand(['sprint-321', '--test-mode']);

    expect(mockRunSprint).not.toHaveBeenCalled();
    expect(mockTerminalizeCompletedCheckpointRun).toHaveBeenCalledWith(
      '/fake/project',
      completed,
      { deckent_style: 'sprint' },
      'test',
    );
  });

  it('exits with error when no checkpoint found', async () => {
    mockHasCheckpoint.mockReturnValue(false);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error('process.exit called');
    });

    await expect(runCommand(['sprint-321'])).rejects.toThrow();
    expect(mockRunSprint).not.toHaveBeenCalled();

    mockExit.mockRestore();
  });

  it('does not claim completion when controller returns PAUSED', async () => {
    mockRunSprint.mockResolvedValue({ id: 'sprint-321', tasks: [], status: 'PAUSED' });
    mockReadCanonicalRunStatus.mockReturnValue({
      lifecycle: 'PAUSED',
      sprintId: 'sprint-321',
      status: 'PAUSED',
      reason: 'operator-decision-required',
      resumable: true,
      recoveryCommand: 'deckent recover sprint-321 --resume',
      finalizeCommand: 'deckent finalize --sprint sprint-321 --force',
    });
    await runCommand(['sprint-321']);
    expect(process.exitCode).toBe(2);
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('resumed-paused'));
    expect(mockPrintError).not.toHaveBeenCalledWith(expect.stringContaining('did not complete'));
  });
});
