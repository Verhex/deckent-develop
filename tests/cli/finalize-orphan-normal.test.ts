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
  mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks (heavy / dangerous bits only — fs + sprint-pid-manager stay REAL) ──

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
let killSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-334-003-'));
  currentRoot = root;
  printed.length = 0;
  process.exitCode = undefined;
  // Hijack process.kill so the test never signals a real process (e.g. the
  // genuinely-alive parent pid we use as the "external owned coordinator").
  killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
});

afterEach(() => {
  killSpy.mockRestore();
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
    const pidPath = seedPid(root, externalPid);

    await runFinalizeCli([]); // no --force → NORMAL path

    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledWith(externalPid, 'SIGTERM');
    expect(existsSync(pidPath)).toBe(false); // pid file cleared
    expect(printed.some(m => m.includes(`Terminated orphan sprint process (PID ${externalPid})`))).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });

  it('does NOT self-signal when finalize runs IN the coordinator (recorded pid === process.pid)', async () => {
    seedCompleteSprint(root);
    seedPid(root, process.pid); // in-process finalize

    await runFinalizeCli([]);

    expect(killSpy).not.toHaveBeenCalled();
    expect(printed.some(m => m.includes('Terminated orphan sprint process'))).toBe(false);
  });

  it('does NOT signal a recorded-but-dead pid', async () => {
    seedCompleteSprint(root);
    // A pid with no /proc entry / no live process → terminator returns not-alive.
    const deadPid = 2147483646;
    expect(deadPid).not.toBe(process.pid);
    seedPid(root, deadPid);

    await runFinalizeCli([]);

    expect(killSpy).not.toHaveBeenCalled();
    expect(printed.some(m => m.includes('Terminated orphan sprint process'))).toBe(false);
  });

  it('does nothing when no pid file is recorded', async () => {
    seedCompleteSprint(root);
    // no seedPid() → readPid returns null

    await runFinalizeCli([]);

    expect(killSpy).not.toHaveBeenCalled();
  });

  it('--force path is byte-for-byte: it still terminates the orphan exactly once (no double-fire from the new normal block)', async () => {
    // An in-progress task forces the `--force` branch (which already terminates).
    seedCompleteSprint(root, { status: 'EXECUTING' });
    const externalPid = process.ppid;
    const pidPath = seedPid(root, externalPid);

    await runFinalizeCli(['--force']);

    // Exactly one SIGTERM (from the --force branch); the new `!opts.force`
    // normal block is skipped → no double termination.
    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledWith(externalPid, 'SIGTERM');
    expect(existsSync(pidPath)).toBe(false);
    expect(printed.some(m => m.includes(`Terminated orphan sprint process (PID ${externalPid})`))).toBe(true);
  });
});
