/**
 * tests/cli/finalize-termination-truth.test.ts
 *
 * 556-003: `killSingle` now reports a TYPED outcome ('killed' | 'not-found' |
 * 'failed') instead of a boolean. 'not-found' means the worker is ALREADY
 * dead (backend reports no such window/process) — that is the sweep's goal
 * state, not a failure, so `forceKillLiveWorkers` must let a force-finalize
 * proceed instead of HOLDing terminal settlement over a worker that is
 * already gone. A genuine kill error ('failed' — permission, backend error)
 * must still fail the sweep exactly as before.
 *
 * Hermetic: every test runs against a fresh tmpdir; only `tmux.js` (the
 * lowest-level kill primitive), `output.js` (capture), `process.js`/
 * `config.js` (root/config resolution) and the heavy settlement modules
 * (`brain.js`, `sprint-finalizer.js`, `sprint-recovery-operation.js`) are
 * mocked. `killSingle` and `forceKillLiveWorkers` run for REAL.
 */

import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks ──────────────────────────────────────────────────────────

const mockKillWorker = vi.fn();
vi.mock('../../src/orchestra/tmux.js', () => ({
  killWorker: (taskId: string) => mockKillWorker(taskId),
  TmuxError: class TmuxError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TmuxError';
    }
  },
}));

const printed: string[] = [];
const printedErrors: string[] = [];
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn((msg: string) => { printed.push(msg); }),
  printError: vi.fn((err: Error) => { printedErrors.push(err.message); }),
}));

let currentRoot = '/tmp/unset';
vi.mock('../../src/cli/helpers/process.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveProjectRoot: vi.fn(() => currentRoot),
}));

vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadConfig: vi.fn().mockResolvedValue({}),
}));

const mockForceAbortSprint = vi.fn();
vi.mock('../../src/orchestra/sprint-finalizer.js', () => ({
  forceAbortSprint: (...args: unknown[]) => mockForceAbortSprint(...args),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  finalizeSprint: vi.fn().mockResolvedValue({
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
  }),
}));

const {
  mockContainCoordinator,
  mockReadRecoveryIdentity,
  mockRunSprintRecoveryOperation,
} = vi.hoisted(() => ({
  mockContainCoordinator: vi.fn(),
  mockReadRecoveryIdentity: vi.fn(),
  mockRunSprintRecoveryOperation: vi.fn(),
}));
vi.mock('../../src/orchestra/sprint-recovery-operation.js', () => ({
  containSprintRecoveryCoordinator: mockContainCoordinator,
  readSprintRecoverySettlementIdentity: mockReadRecoveryIdentity,
  runSprintRecoveryOperation: mockRunSprintRecoveryOperation,
}));

import type { Task } from '../../src/core/types.js';
import { TmuxError } from '../../src/orchestra/tmux.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { killSingle, type KillSingleResult } from '../../src/cli/commands/kill.js';
import { forceKillLiveWorkers, registerFinalize } from '../../src/cli/commands/finalize.js';

// ─── Fixture helpers ────────────────────────────────────────────────

const SPRINT_ID = 'sprint-556';

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
    status: 'EXECUTING',
    sprintId: SPRINT_ID,
    createdAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  } as unknown as Task;
}

function seedIncompleteTask(root: string, id: string): void {
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, `task-${id}.json`),
    JSON.stringify(makeTask(id), null, 2),
    'utf-8',
  );
}

async function runFinalizeCli(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerFinalize(program);
  try {
    await program.parseAsync(['node', 'test', 'finalize', ...args]);
  } catch { /* exitOverride may throw */ }
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-556-003-'));
  currentRoot = root;
  printed.length = 0;
  printedErrors.length = 0;
  process.exitCode = undefined;
  mockKillWorker.mockReset();
  mockForceAbortSprint.mockReset();
  mockForceAbortSprint.mockReturnValue({
    terminalTruth: { logicalMetrics: { totalTasks: 1, completedTasks: 0 } },
  });
  mockContainCoordinator.mockReset();
  mockContainCoordinator.mockResolvedValue({ action: 'already-stopped', pid: null, escalation: 'none' });
  mockReadRecoveryIdentity.mockReset();
  mockReadRecoveryIdentity.mockReturnValue({
    executionId: SPRINT_ID, generation: 0, taskId: SPRINT_ID,
    attemptId: `${SPRINT_ID}:recovery:0`, fenceToken: 'test-fence',
  });
  mockRunSprintRecoveryOperation.mockReset();
  mockRunSprintRecoveryOperation.mockResolvedValue({});
});

afterEach(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* non-fatal */ }
  vi.clearAllMocks();
});

// ─── killSingle: typed result (item 1) ─────────────────────────────

describe('killSingle typed result (556-003)', () => {
  it('returns "killed" (not boolean true) when the backend kill succeeds', () => {
    seedIncompleteTask(root, 'kk-1');
    mockKillWorker.mockImplementation(() => {});
    const result: KillSingleResult = killSingle(root, 'kk-1', 'en');
    expect(result).toBe('killed');
  });

  it('returns "not-found" (not boolean false) when the backend reports no such worker, and still prints the not-found message', () => {
    seedIncompleteTask(root, 'kk-2');
    mockKillWorker.mockImplementation(() => { throw new TmuxError('no such pane'); });
    const result: KillSingleResult = killSingle(root, 'kk-2', 'en');
    expect(result).toBe('not-found');
    expect(printedErrors).toContain(getMessage('kill.worker_not_found', 'en', { taskId: 'kk-2' }));
  });

  it('still throws (does not swallow into "failed") on a genuine backend error', () => {
    seedIncompleteTask(root, 'kk-3');
    mockKillWorker.mockImplementation(() => { throw new Error('permission denied'); });
    expect(() => killSingle(root, 'kk-3', 'en')).toThrow('permission denied');
  });
});

// ─── forceKillLiveWorkers: bucketing (items 1+2) ───────────────────

describe('forceKillLiveWorkers typed bucketing (556-003)', () => {
  function asTasks(ids: string[]): readonly Task[] {
    return ids.map(id => ({ id }) as unknown as Task);
  }

  it('not-found settles as terminated (goal state reached), not failed', () => {
    const sweep = forceKillLiveWorkers(asTasks(['a']), () => 'not-found');
    expect(sweep.killed).toEqual([]);
    expect(sweep.alreadyDead).toEqual(['a']);
    expect(sweep.failed).toEqual([]);
  });

  it('a real kill failure still fails the sweep', () => {
    const sweep = forceKillLiveWorkers(asTasks(['b']), () => 'failed');
    expect(sweep.failed).toEqual(['b']);
    expect(sweep.killed).toEqual([]);
    expect(sweep.alreadyDead).toEqual([]);
  });

  it('an unexpected throw from the kill callback is treated as failed', () => {
    const sweep = forceKillLiveWorkers(asTasks(['c']), () => { throw new Error('boom'); });
    expect(sweep.failed).toEqual(['c']);
  });

  it('mixed case: killed, not-found and failed are bucketed independently', () => {
    const outcomes: Record<string, KillSingleResult> = {
      'm-killed': 'killed',
      'm-dead': 'not-found',
      'm-failed': 'failed',
    };
    const sweep = forceKillLiveWorkers(
      asTasks(['m-killed', 'm-dead', 'm-failed']),
      (id) => outcomes[id],
    );
    expect(sweep.killed).toEqual(['m-killed']);
    expect(sweep.alreadyDead).toEqual(['m-dead']);
    expect(sweep.failed).toEqual(['m-failed']);
  });

  it('restores a not-found callback\'s exitCode side effect but preserves it for a real failure', () => {
    const kill = (id: string): KillSingleResult => {
      process.exitCode = 1; // mirrors killSingle's own standalone-CLI side effect
      return id === 'nf' ? 'not-found' : 'failed';
    };
    const sweep = forceKillLiveWorkers(asTasks(['nf', 'real-fail']), kill);
    expect(sweep.alreadyDead).toEqual(['nf']);
    expect(sweep.failed).toEqual(['real-fail']);
    // Not restored to undefined: the real failure's signal must survive.
    expect(process.exitCode).toBe(1);
  });
});

// ─── finalize --force: end-to-end proceed vs HOLD (items 2+3) ─────

describe('finalize --force dead-worker sweep (556-003)', () => {
  it('proceeds (never HOLDs) when the only incomplete worker is already dead, and prints the truthful already-terminated line', async () => {
    seedIncompleteTask(root, '556-a');
    mockKillWorker.mockImplementation(() => { throw new TmuxError('no such pane'); });

    await runFinalizeCli(['--force']);

    expect(mockForceAbortSprint).toHaveBeenCalledTimes(1);
    expect(printedErrors).not.toContain(
      getMessage('finalize.workers_termination_failed', 'en', { count: '1', ids: '556-a' }),
    );
    expect(printed).toContain(
      getMessage('finalize.workers_already_terminated', 'en', { count: '1', ids: '556-a' }),
    );
    // Never a fake "terminated N workers" line for a worker that was already dead.
    expect(printed).not.toContain(
      getMessage('finalize.workers_terminated', 'en', { count: '1', ids: '556-a' }),
    );
    expect(process.exitCode).not.toBe(1);
  });

  it('still HOLDs terminal settlement when a live worker cannot really be killed', async () => {
    seedIncompleteTask(root, '556-b');
    mockKillWorker.mockImplementation(() => { throw new Error('permission denied'); });

    await runFinalizeCli(['--force']);

    expect(mockForceAbortSprint).not.toHaveBeenCalled();
    expect(mockRunSprintRecoveryOperation).not.toHaveBeenCalled();
    expect(printedErrors).toContain(
      getMessage('finalize.workers_termination_failed', 'en', { count: '1', ids: '556-b' }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('i18n: already-terminated message resolves to distinct en/tr text (no hardcoded strings, no missing translation)', () => {
    const en = getMessage('finalize.workers_already_terminated', 'en', { count: '2', ids: 'x, y' });
    const tr = getMessage('finalize.workers_already_terminated', 'tr', { count: '2', ids: 'x, y' });
    expect(en).toContain('x, y');
    expect(tr).toContain('x, y');
    expect(en).not.toBe(tr);
  });
});
