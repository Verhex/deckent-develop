/**
 * Sprint 177 Task 177-003 — deckent kill cascade.
 *
 * Verifies that `deckent kill --all` performs the full cascade:
 *   1. SIGTERM worker windows / containers (existing behavior)
 *   2. SIGTERM controller PID files in .deckent/pids/
 *   3. 5s grace period
 *   4. SIGKILL stragglers
 *   5. Remove per-sprint metadata (sprint-state.json + {id}-checkpoint.json + {id}-gate.json)
 *   6. tmux socket cleanup
 *   7. Emit BRAIN→*:SPRINT_KILLED structured event
 *
 * Sprint 176 evidence: controller PID stayed alive 43 minutes after kill,
 * leaving stale metadata + tmux socket. These tests lock in the regression fix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Module mocks ─────────────────────────────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  killWorker: vi.fn(),
  cleanupTmuxSocket: vi.fn(),
  TmuxError: class TmuxError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TmuxError';
    }
  },
}));

vi.mock('../../src/orchestra/sprint-pid-manager.js', () => ({
  listPidFiles: vi.fn(),
  readPid: vi.fn(),
  isProcessAlive: vi.fn(),
  clearPid: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  cleanupSprintMetadata: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  CHANNELS: { SPRINT_KILLED: 'BRAIN→*:SPRINT_KILLED' },
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

// fs mock — kill cascade reads .tasks/ for active workers
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readdirSync: vi.fn().mockReturnValue([]),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

import { killWorker, cleanupTmuxSocket } from '../../src/orchestra/tmux.js';
import {
  listPidFiles, readPid, isProcessAlive, clearPid,
} from '../../src/orchestra/sprint-pid-manager.js';
import { cleanupSprintMetadata } from '../../src/orchestra/sprint-controller.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';
import { registerKill } from '../../src/cli/commands/kill.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

async function runKillAll(extra: string[] = []): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerKill(program);
  try {
    await program.parseAsync(['node', 'test', 'kill', '--all', ...extra]);
  } catch {
    // commander exitOverride may throw
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('kill --all cascade (Sprint 177 Task 177-003)', () => {
  let originalKill: typeof process.kill;
  let killMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.exitCode = undefined;

    // Hijack process.kill so the test doesn't try to signal real PIDs.
    originalKill = process.kill;
    killMock = vi.fn();
    process.kill = killMock as unknown as typeof process.kill;
  });

  afterEach(() => {
    process.kill = originalKill;
    process.exitCode = undefined;
    vi.useRealTimers();
  });

  it('full cascade: SIGTERM workers → SIGTERM controller → 5s grace → SIGKILL stragglers → metadata cleanup → tmux socket → SPRINT_KILLED event', async () => {
    // Arrange: 1 active worker + 1 live controller PID file
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation((p: any) => {
      const path = String(p);
      if (path.endsWith('.tasks')) {
        return ['task-177-001.json'] as any;
      }
      return [] as any;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      const path = String(p);
      if (path.endsWith('task-177-001.json')) {
        return JSON.stringify({ id: '177-001', status: 'EXECUTING', model: 'sonnet', provider: 'claude' });
      }
      return '{}';
    });

    vi.mocked(listPidFiles).mockReturnValue(['sprint-177']);
    vi.mocked(readPid).mockReturnValue(99999);
    // Controller is alive at SIGTERM time AND still alive after grace → must be SIGKILL'd
    vi.mocked(isProcessAlive).mockReturnValue(true);

    // Act
    const runPromise = runKillAll();
    // Advance past the 5-second grace window
    await vi.advanceTimersByTimeAsync(5_100);
    await runPromise;

    // Assert: worker SIGTERM via backend
    expect(killWorker).toHaveBeenCalledWith('177-001');

    // Controller SIGTERM
    expect(killMock).toHaveBeenCalledWith(99999, 'SIGTERM');
    // Controller SIGKILL (because still alive after grace)
    expect(killMock).toHaveBeenCalledWith(99999, 'SIGKILL');

    // Metadata cleanup
    expect(cleanupSprintMetadata).toHaveBeenCalledWith('/mock/root', 'sprint-177');

    // tmux socket cleanup
    expect(cleanupTmuxSocket).toHaveBeenCalled();

    // SPRINT_KILLED event
    expect(writeEvent).toHaveBeenCalledWith(
      '/mock/root',
      'sprint-177',
      'brain',
      '*',
      'BRAIN→*:SPRINT_KILLED',
      expect.objectContaining({
        workersKilled: 1,
        controllerPids: [99999],
      }),
    );
  });

  it('controller-only: with no active workers, still SIGTERMs and (if needed) SIGKILLs controller PID', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any); // no task JSONs

    vi.mocked(listPidFiles).mockReturnValue(['sprint-177']);
    vi.mocked(readPid).mockReturnValue(88888);
    // Controller is alive at SIGTERM time but dies cleanly during grace.
    let callCount = 0;
    vi.mocked(isProcessAlive).mockImplementation(() => {
      callCount += 1;
      // First call (pre-SIGTERM): alive; subsequent calls (post-grace): dead.
      return callCount === 1;
    });

    const runPromise = runKillAll();
    await vi.advanceTimersByTimeAsync(5_100);
    await runPromise;

    // No workers killed
    expect(killWorker).not.toHaveBeenCalled();
    // Controller still SIGTERM'd
    expect(killMock).toHaveBeenCalledWith(88888, 'SIGTERM');
    // No SIGKILL because graceful shutdown succeeded
    expect(killMock).not.toHaveBeenCalledWith(88888, 'SIGKILL');
    // Metadata still cleaned
    expect(cleanupSprintMetadata).toHaveBeenCalledWith('/mock/root', 'sprint-177');
    expect(cleanupTmuxSocket).toHaveBeenCalled();
  });

  it('tmux-socket cleanup runs even when there is no active sprint state', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);

    vi.mocked(listPidFiles).mockReturnValue([]); // no PID files
    vi.mocked(readPid).mockReturnValue(null);

    const runPromise = runKillAll();
    await vi.advanceTimersByTimeAsync(100);
    await runPromise;

    // No workers, no controller — but tmux socket cleanup MUST still run
    // to clear residual sockets from prior aborted sessions.
    expect(killWorker).not.toHaveBeenCalled();
    expect(killMock).not.toHaveBeenCalled();
    expect(cleanupTmuxSocket).toHaveBeenCalledTimes(1);
    // No PID files → no per-sprint cleanup
    expect(cleanupSprintMetadata).not.toHaveBeenCalled();
    expect(clearPid).not.toHaveBeenCalled();
  });
});
