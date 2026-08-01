// Task 486-014: Debt manager FIX authority wiring.
// Verifies handleEvaluation() wires the typed resolveFixRepairAuthority resolver
// (fix-repair-authority.ts, dependency 486-006) into FIX-task creation: reviewed
// filesRead/filesWrite deltas, an authority fingerprint, unresolved findings, and
// the prior repair lineage ("original acceptance") are all persisted on the fix
// task payload — without recursive prompt nesting.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

const spawnSyncMock = vi.hoisted(() => vi.fn());
const readFileSyncMock = vi.hoisted(() => vi.fn(() => {
  throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
}));

vi.mock('node:fs', () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: spawnSyncMock,
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    getById: vi.fn(() => null),
    insert: vi.fn(),
    upsert: vi.fn(),
    close: vi.fn(),
  })),
}));

import { writeFileSync } from 'node:fs';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '486-014-orig',
    title: 'Repair authority wiring target',
    description: 'Implement the repair authority target.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'directive',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/target.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.NO_GO,
    sprintId: 'sprint-486',
    assignedWorker: 'w-486-014-orig',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeNoGoResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '486-014-orig',
    workerId: 'w-486-014-orig',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'exited without result',
    ...overrides,
  };
}

function readWrittenFixTask(callIdx = 0): { path: string; payload: any } {
  const calls = vi.mocked(writeFileSync).mock.calls;
  if (calls.length <= callIdx) throw new Error('writeFileSync was not called');
  const [path, content] = calls[callIdx]!;
  return { path: String(path), payload: JSON.parse(String(content)) };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('FIX authority wiring — handleEvaluation NO_GO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '' });
  });

  it('accepted: persists inherited scope plus an authority fingerprint', () => {
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: 'src/orchestra/target.ts\nsrc/orchestra/helper.ts\n',
    });
    const task = makeTask({
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/target.ts'] },
    });
    const result = makeNoGoResult({
      notes: 'Repair also requires src/orchestra/helper.ts to compile.',
    });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.repairAuthority.state).toBe('accepted');
    expect(payload.repairAuthority.filesWrite).toEqual(['src/orchestra/target.ts']);
    expect(payload.repairAuthority.addedWritePaths).toEqual([]);
    expect(payload.repairAuthority.filesRead).toEqual([]);
    expect(payload.repairAuthority.authorityFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(payload.repairAuthority.unresolvedFindings).toEqual([]);
    expect(payload.scope.filesWrite).toEqual(payload.repairAuthority.filesWrite);
    expect(payload.status).toBe(TaskStatus.PENDING);
  });

  it('accepted: the fingerprint is deterministic across two identical calls (idempotent)', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: 'src/orchestra/target.ts\n' });
    const task = makeTask();
    const result = makeNoGoResult({ notes: 'no evidence paths here' });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const first = readWrittenFixTask(0);
    const second = readWrittenFixTask(1);
    expect(second.payload.repairAuthority.authorityFingerprint)
      .toBe(first.payload.repairAuthority.authorityFingerprint);
  });

  it('worker prose cannot grant scope or create a birth-time PAUSED fix', () => {
    const task = makeTask({
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/target.ts'] },
    });
    const result = makeNoGoResult({
      notes: 'Repair requires tests/core/authority.test.ts, which is outside the reviewed boundary.',
    });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.status).toBe(TaskStatus.PENDING);
    expect(payload.repairAuthority.state).toBe('accepted');
    expect(payload.repairAuthority.unresolvedFindings).toEqual([]);
    expect(payload.repairAuthority.evidenceWritePaths).toEqual([]);
    expect(payload.repairAuthority.filesWrite).toEqual(['src/orchestra/target.ts']);
  });

  it('late paths in full notes remain diagnostic-only', () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: 'src/orchestra/target.ts\nsrc/orchestra/late-evidence.ts\n' });
    const padding = 'x'.repeat(600);
    const task = makeTask({
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/target.ts'] },
    });
    const result = makeNoGoResult({
      notes: `${padding} the real fix also requires src/orchestra/late-evidence.ts`,
    });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.repairAuthority.addedWritePaths).toEqual([]);
    expect(payload.repairAuthority.state).toBe('accepted');
  });

  it('carries prior accepted repair lineage without recursively trusting prose', () => {
    const outOfBoundaryNotes = 'Repair requires tests/core/authority.test.ts.';
    const origTask = makeTask({
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/target.ts'] },
    });
    const origResult = makeNoGoResult({ notes: outOfBoundaryNotes });

    // Round 1: the original task fails. Capture the real fingerprint it
    // persisted; nothing here is hand-derived, it comes straight from the writer.
    handleEvaluation('/root', origTask, TaskEvaluation.NO_GO, origResult);
    const firstFix = readWrittenFixTask(0);
    expect(firstFix.payload.repairAuthority.state).toBe('accepted');
    const priorFingerprint = firstFix.payload.repairAuthority.authorityFingerprint;
    expect(typeof priorFingerprint).toBe('string');

    // Round 2: the FIX task itself is now the failing task (fix-of-a-fix) with
    // the identical unresolved evidence. handleEvaluation must read the FIX's
    // own already-persisted task JSON (one bounded disk read — no recursive
    // re-prompting) to recognize the repeated impossible fingerprint.
    readFileSyncMock.mockImplementation((path: string) => {
      if (String(path).endsWith(`task-${firstFix.payload.id}.json`)) {
        return JSON.stringify(firstFix.payload);
      }
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });
    const fixTaskAsFailing: Task = { ...firstFix.payload, status: TaskStatus.NO_GO };
    const fixResult = makeNoGoResult({ taskId: fixTaskAsFailing.id, notes: outOfBoundaryNotes });

    handleEvaluation('/root', fixTaskAsFailing, TaskEvaluation.NO_GO, fixResult);

    const secondFix = readWrittenFixTask(1);
    expect(secondFix.payload.id).toBe(`${firstFix.payload.id}-fix`);
    expect(secondFix.payload.repairAuthority.originalAcceptance).toMatchObject({
      taskId: firstFix.payload.id,
      state: 'accepted',
      authorityFingerprint: priorFingerprint,
    });
    expect(secondFix.payload.repairAuthority.authorityFingerprint).toBe(priorFingerprint);
    expect(secondFix.payload.repairAuthority.state).toBe('accepted');
  });

  it('no evidence paths in notes: repairAuthority stays accepted with an empty added delta', () => {
    const task = makeTask();
    const result = makeNoGoResult({ notes: 'exited without result' });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.repairAuthority.state).toBe('accepted');
    expect(payload.repairAuthority.addedWritePaths).toEqual([]);
    expect(payload.repairAuthority.addedReadPaths).toEqual([]);
    expect(payload.status).toBe(TaskStatus.PENDING);
  });
});
