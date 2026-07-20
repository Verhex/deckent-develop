import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRunSprint = vi.fn();
const mockHasCheckpoint = vi.fn();
const mockReadCheckpoint = vi.fn();
const mockDetectStaleWorkers = vi.fn();
const mockLoadConfig = vi.fn();

vi.mock('../../../src/orchestra/brain.js', () => ({
  runSprint: (...args: unknown[]) => mockRunSprint(...args),
}));

const mockResetInterrupted = vi.fn();
const mockBuildPreplanned = vi.fn();
vi.mock('../../../src/orchestra/sprint-checkpoint.js', () => ({
  hasCheckpoint: (...args: unknown[]) => mockHasCheckpoint(...args),
  readCheckpoint: (...args: unknown[]) => mockReadCheckpoint(...args),
  detectStaleWorkers: (...args: unknown[]) => mockDetectStaleWorkers(...args),
  // Parity helper: unfinished = pending ∪ active-without-valid-result. The mock
  // mirrors that shape (no .result on disk in these unit fixtures → all active
  // count as interrupted) so dry-run and real derive an identical set.
  deriveResumableTaskIds: (_root: unknown, cp: { pendingTasks?: string[]; activeWorkers?: { taskId: string }[] }) => [
    ...(cp?.pendingTasks ?? []),
    ...(cp?.activeWorkers ?? []).map(w => w.taskId),
  ],
  resetInterruptedWorkersToPending: (...args: unknown[]) => mockResetInterrupted(...args),
  buildPreplannedResumeSprint: (...args: unknown[]) => mockBuildPreplanned(...args),
  hasValidResult: () => false,
}));

vi.mock('../../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
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
    mockRunSprint.mockResolvedValue({ id: 'sprint-321', tasks: [], status: 'COMPLETE' });
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

  it('exits early when all tasks already completed without calling runSprint', async () => {
    mockReadCheckpoint.mockReturnValue({
      ...FAKE_CHECKPOINT,
      completedTasks: ['321-001', '321-002'],
      pendingTasks: [],
      activeWorkers: [],
    });

    await runCommand(['sprint-321']);

    expect(mockRunSprint).not.toHaveBeenCalled();
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
    await runCommand(['sprint-321']);
    expect(process.exitCode).toBe(1);
    expect(mockPrintError).toHaveBeenCalledWith(expect.stringContaining('PAUSED'));
  });
});
