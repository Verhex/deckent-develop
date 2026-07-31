/**
 * tests/cli/finalize-orphan-normal.test.ts
 *
 * Sprint 334 Task 334-003 — P0-C RECURRENCE: terminate the lingering owned
 * `deckent start` coordinator on a NORMAL (non-force) finalize, not only on
 * `--force`.
 *
 * Disk-verified root cause: `registerFinalize` only called
 * `terminateOwnedSprintProcess` inside the `incomplete.length > 0` (force)
 * branch. A NORMAL close ran `finalizeSprint` (which `clearPid`s the pid file)
 * but never SIGTERMed a still-alive owned coordinator — sprint-333 saw it
 * linger ~27 min post-finalize.
 *
 * The fix delegates to the EXISTING ownership-guarded
 * `terminateOwnedSprintProcess` (NOT re-implemented), BEFORE `finalizeSprint`
 * wipes the pid file, with a SELF-GUARD so finalize-in-the-coordinator never
 * suicides (recorded pid === process.pid).
 *
 * Hermetic: every test runs in its own tmpdir; the REAL sprint-pid-manager +
 * fs operate on that tmpdir; `process.kill` is spied so NO real process is ever
 * signalled; the heavy `finalizeSprint` pipeline is mocked to a no-op. No
 * spawnSync, no reads of gitignored local state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks (heavy / dangerous bits only — fs + sprint-pid-manager stay REAL) ──

const {
  mockContainCoordinator,
  mockReadRecoveryIdentity,
  mockRunSprintRecoveryOperation,
  mockKillSingle,
} = vi.hoisted(() => ({
  mockContainCoordinator: vi.fn(),
  mockReadRecoveryIdentity: vi.fn(),
  mockRunSprintRecoveryOperation: vi.fn(),
  mockKillSingle: vi.fn(),
}));
vi.mock('../../src/orchestra/sprint-recovery-operation.js', () => ({
  containSprintRecoveryCoordinator: mockContainCoordinator,
  readSprintRecoverySettlementIdentity: mockReadRecoveryIdentity,
  runSprintRecoveryOperation: mockRunSprintRecoveryOperation,
}));
vi.mock('../../src/cli/commands/kill.js', () => ({
  killSingle: mockKillSingle,
}));

// CLI root resolution → per-test tmpdir.
let currentRoot = '/tmp/unset';
vi.mock('../../src/cli/helpers/process.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveProjectRoot: vi.fn(() => currentRoot),
}));

// The heavy finalize pipeline (DB I/O, decay, doc writers) is out of scope —
// this task only changes the orphan-termination step, which runs BEFORE
// finalizeSprint. Mock it to a deterministic metrics object.
vi.mock('../../src/orchestra/brain.js', () => ({
  finalizeSprint: vi.fn().mockResolvedValue({
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
  }),
}));

// loadConfig must not consult ~/.deckent (hermeticity) — deterministic {}.
vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadConfig: vi.fn().mockResolvedValue({}),
}));

// Dynamic-imported in the action before finalizeSprint — keep it inert.
vi.mock('../../src/core/rule-generator.js', () => ({
  regenerateRules: vi.fn().mockResolvedValue(undefined),
}));

// Capture user-facing output so we can assert the orphan-termination advisory.
const printed: string[] = [];
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn((msg: string) => { printed.push(msg); }),
  printError: vi.fn(),
}));

import { Command } from 'commander';
import type { Task, TaskResult } from '../../src/core/types.js';
import { registerFinalize } from '../../src/cli/commands/finalize.js';

// ─── Fixture Helpers ─────────────────────────────────────────────────

const SPRINT_ID = 'sprint-900';

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'fixture task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: 'DONE',
    sprintId: SPRINT_ID,
    createdAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  } as unknown as Task;
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/x.ts'],
    linesAdded: 10,
    linesRemoved: 1,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    evaluationDecision: 'DONE',
    notes: 'ok',
    ...overrides,
  } as unknown as TaskResult;
}

/** Seed a COMPLETE sprint into .tasks/ so finalize reaches the normal path. */
function seedCompleteSprint(root: string, taskOverrides: Partial<Task> = {}): void {
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  const id = '900-001';
  writeFileSync(
    join(tasksDir, `task-${id}.json`),
    JSON.stringify(makeTask(id, taskOverrides), null, 2), 'utf-8',
  );
  writeFileSync(
    join(tasksDir, `task-${id}.result`),
    JSON.stringify(makeResult(id), null, 2), 'utf-8',
  );
}

/** Write a recorded coordinator pid file (no startToken → ownership 'unknown'
 *  when the pid is alive — preserves liveness-only behavior). */
function seedPid(root: string, pid: number, sprintId = SPRINT_ID): string {
  const dir = join(root, '.deckent', 'pids');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${sprintId}.pid`);
  writeFileSync(p, JSON.stringify({
    pid, sprintId, startedAt: '2026-06-10T00:00:00.000Z',
  }, null, 2), 'utf-8');
  return p;
}

async function runFinalizeCli(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerFinalize(program);
  try {
    await program.parseAsync(['node', 'test', 'finalize', ...args]);
  } catch { /* exitOverride may throw */ }
}

// ─── Suite ───────────────────────────────────────────────────────────

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-334-003-'));
  currentRoot = root;
  printed.length = 0;
  process.exitCode = undefined;
  mockContainCoordinator.mockReset();
  mockContainCoordinator.mockResolvedValue({
    action: 'already-stopped',
    pid: null,
    escalation: 'none',
  });
  mockReadRecoveryIdentity.mockReset();
  mockReadRecoveryIdentity.mockReturnValue({
    executionId: SPRINT_ID,
    generation: 0,
    taskId: SPRINT_ID,
    attemptId: `${SPRINT_ID}:recovery:0`,
    fenceToken: 'test-fence',
  });
  mockRunSprintRecoveryOperation.mockReset();
  mockRunSprintRecoveryOperation.mockResolvedValue({
    identity: mockReadRecoveryIdentity(),
    audit: { overallGate: 'SKIPPED' },
    orphanIpcDirs: [],
    staleLocksCleaned: 0,
    staleSpawnLocksCleaned: 0,
    taskFilesArchived: 0,
    taskFilesPreserved: 0,
  });
  mockKillSingle.mockReset();
  mockKillSingle.mockReturnValue(true);
});

afterEach(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* non-fatal */ }
  vi.clearAllMocks();
});

describe('finalize (normal path) — orphan coordinator termination (334-003)', () => {
  it('NORMAL finalize SIGTERMs an owned-and-alive external pid, clears the pid file, and prints the advisory', async () => {
    seedCompleteSprint(root);
    // process.ppid is a genuinely-alive process that is NOT this process → the
    // ownership-guarded terminator classifies it 'unknown'+alive → SIGTERM.
    const externalPid = process.ppid;
    expect(externalPid).not.toBe(process.pid);
    seedPid(root, externalPid);
    mockContainCoordinator.mockResolvedValue({
      action: 'terminated',
      pid: externalPid,
      escalation: 'sigterm',
    });

    await runFinalizeCli([]); // no --force → NORMAL path

    expect(mockContainCoordinator).toHaveBeenCalledTimes(1);
    expect(mockContainCoordinator).toHaveBeenCalledWith(
      root,
      SPRINT_ID,
      expect.objectContaining({
        allowSelf: true,
        expectedIdentity: expect.objectContaining({ fenceToken: 'test-fence' }),
        terminationPolicy: expect.objectContaining({
          coordinator_termination_grace_ms: 5_000,
        }),
      }),
    );
    expect(printed.some(m => m.includes(`Coordinator PID ${externalPid}`))).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });

  it('does NOT self-signal when finalize runs IN the coordinator (recorded pid === process.pid)', async () => {
    seedCompleteSprint(root);
    seedPid(root, process.pid); // in-process finalize
    mockContainCoordinator.mockResolvedValue({
      action: 'self',
      pid: process.pid,
      escalation: 'none',
    });

    await runFinalizeCli([]);

    expect(mockContainCoordinator).toHaveBeenCalledTimes(1);
    expect(printed.some(m => m.includes('Coordinator PID'))).toBe(false);
  });

  it('does NOT signal a recorded-but-dead pid', async () => {
    seedCompleteSprint(root);
    // A pid with no /proc entry / no live process → terminator returns not-alive.
    const deadPid = 2147483646;
    expect(deadPid).not.toBe(process.pid);
    seedPid(root, deadPid);
    mockContainCoordinator.mockResolvedValue({
      action: 'already-stopped',
      pid: deadPid,
      escalation: 'none',
    });

    await runFinalizeCli([]);

    expect(mockContainCoordinator).toHaveBeenCalledTimes(1);
    expect(printed.some(m => m.includes('Coordinator PID'))).toBe(false);
  });

  it('does nothing when no pid file is recorded', async () => {
    seedCompleteSprint(root);
    // no seedPid() → readPid returns null

    await runFinalizeCli([]);

    expect(mockContainCoordinator).toHaveBeenCalledTimes(1);
  });

  it('--force path is byte-for-byte: it still terminates the orphan exactly once (no double-fire from the new normal block)', async () => {
    // An in-progress task forces the `--force` branch (which already terminates).
    seedCompleteSprint(root, { status: 'EXECUTING' });
    const externalPid = process.ppid;
    seedPid(root, externalPid);

    await runFinalizeCli(['--force']);

    expect(mockContainCoordinator).not.toHaveBeenCalled();
    expect(mockRunSprintRecoveryOperation).toHaveBeenCalledTimes(1);
    expect(mockRunSprintRecoveryOperation).toHaveBeenCalledWith(
      root,
      SPRINT_ID,
      expect.objectContaining({
        skipAudit: true,
        intent: 'FINALIZE_CONTAINMENT',
        terminationPolicy: expect.objectContaining({
          coordinator_termination_grace_ms: 5_000,
        }),
        approval: expect.objectContaining({
          approvalRef: 'cli:force-finalize',
          identity: expect.objectContaining({ fenceToken: 'test-fence' }),
        }),
      }),
    );
  });

  it('HOLDs finalize and preserves PID authority when termination is unverified', async () => {
    seedCompleteSprint(root, { status: 'EXECUTING' });
    const externalPid = process.ppid;
    seedPid(root, externalPid);
    mockRunSprintRecoveryOperation.mockRejectedValueOnce(new Error('typed coordinator HOLD'));

    await runFinalizeCli(['--force']);

    expect(process.exitCode).toBe(1);
    expect(mockRunSprintRecoveryOperation).toHaveBeenCalledTimes(1);
  });

  it('HOLDs before terminal settlement when an in-progress worker cannot be contained', async () => {
    seedCompleteSprint(root, { status: 'EXECUTING' });
    mockKillSingle.mockReturnValue(false);

    await runFinalizeCli(['--force']);

    expect(process.exitCode).toBe(1);
    expect(mockRunSprintRecoveryOperation).not.toHaveBeenCalled();
    expect(printed.some(message => message.includes('Complete'))).toBe(false);
  });

  it('--force settles a pre-dispatch PENDING sprint through the shared recovery operation', async () => {
    seedCompleteSprint(root, { status: 'PENDING' });

    await runFinalizeCli(['--force']);

    expect(mockContainCoordinator).not.toHaveBeenCalled();
    expect(mockRunSprintRecoveryOperation).toHaveBeenCalledTimes(1);
    expect(process.exitCode).not.toBe(1);
  });

  it('does not print terminal success when shared force settlement fails', async () => {
    seedCompleteSprint(root, { status: 'PENDING' });
    mockRunSprintRecoveryOperation.mockRejectedValueOnce(new Error('typed settlement HOLD'));

    await runFinalizeCli(['--force']);

    expect(mockRunSprintRecoveryOperation).toHaveBeenCalledTimes(1);
    expect(printed.some(m => m.includes('Complete'))).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});
