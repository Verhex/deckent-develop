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

vi.mock('../../../src/orchestra/sprint-checkpoint.js', () => ({
  hasCheckpoint: (...args: unknown[]) => mockHasCheckpoint(...args),
  readCheckpoint: (...args: unknown[]) => mockReadCheckpoint(...args),
  detectStaleWorkers: (...args: unknown[]) => mockDetectStaleWorkers(...args),
}));

vi.mock('../../../src/core/config.js', () => ({
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

describe('deckent resume CLI — completed-task list passed to runSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    mockHasCheckpoint.mockReturnValue(true);
    mockReadCheckpoint.mockReturnValue(FAKE_CHECKPOINT);
    mockDetectStaleWorkers.mockReturnValue([]);
    mockLoadConfig.mockResolvedValue({ deckent_style: 'sprint' });
    mockRunSprint.mockResolvedValue({ id: 'sprint-321', tasks: [], status: 'COMPLETED' });
    mockExistsSync.mockReturnValue(false);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
  });

  it('writes sprint-state.json with checkpoint sprintId before calling runSprint', async () => {
    await runCommand(['sprint-321']);

    // Find the writeFileSync call for sprint-state.json
    const stateWriteCall = mockWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('sprint-state.json'),
    );
    expect(stateWriteCall, 'sprint-state.json must be written before runSprint').toBeDefined();

    const written = JSON.parse(stateWriteCall![1] as string);
    expect(written.sprintId).toBe('sprint-321');
  });

  it('includes all completedTask IDs in the sprint-state.json taskIds', async () => {
    await runCommand(['sprint-321']);

    const stateWriteCall = mockWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('sprint-state.json'),
    );
    const written = JSON.parse(stateWriteCall![1] as string);

    // All completed task IDs must be in taskIds
    expect(written.taskIds).toContain('321-001');
    expect(written.taskIds).toContain('321-002');
  });

  it('includes all pendingTask IDs in the sprint-state.json taskIds', async () => {
    await runCommand(['sprint-321']);

    const stateWriteCall = mockWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('sprint-state.json'),
    );
    const written = JSON.parse(stateWriteCall![1] as string);

    expect(written.taskIds).toContain('321-003');
  });

  it('includes all activeWorker taskIds in the sprint-state.json taskIds', async () => {
    await runCommand(['sprint-321']);

    const stateWriteCall = mockWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('sprint-state.json'),
    );
    const written = JSON.parse(stateWriteCall![1] as string);

    expect(written.taskIds).toContain('321-004');
  });

  it('sprint-state.json is written before runSprint is called', async () => {
    const callOrder: string[] = [];
    mockWriteFileSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.includes('sprint-state.json')) {
        callOrder.push('writeFileSync:sprint-state');
      }
    });
    mockRunSprint.mockImplementation(async () => {
      callOrder.push('runSprint');
      return { id: 'sprint-321', tasks: [], status: 'COMPLETED' };
    });

    await runCommand(['sprint-321']);

    const stateWriteIdx = callOrder.indexOf('writeFileSync:sprint-state');
    const runSprintIdx = callOrder.indexOf('runSprint');
    expect(stateWriteIdx).toBeGreaterThanOrEqual(0);
    expect(runSprintIdx).toBeGreaterThanOrEqual(0);
    expect(stateWriteIdx).toBeLessThan(runSprintIdx);
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

  it('sprint-state.json taskIds contains union of all three task buckets with no duplicates avoided', async () => {
    const checkpointWithOverlap = {
      ...FAKE_CHECKPOINT,
      completedTasks: ['321-001', '321-002'],
      pendingTasks: ['321-003'],
      activeWorkers: [
        { workerId: 'w-321-004', taskId: '321-004', status: 'EXECUTING', spawnedAt: '2026-06-24T00:00:00.000Z' },
      ],
    };
    mockReadCheckpoint.mockReturnValue(checkpointWithOverlap);

    await runCommand(['sprint-321']);

    const stateWriteCall = mockWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('sprint-state.json'),
    );
    const written = JSON.parse(stateWriteCall![1] as string);

    // All four task IDs must be present
    expect(written.taskIds).toHaveLength(4);
    expect(written.taskIds).toContain('321-001');
    expect(written.taskIds).toContain('321-002');
    expect(written.taskIds).toContain('321-003');
    expect(written.taskIds).toContain('321-004');
  });
});
