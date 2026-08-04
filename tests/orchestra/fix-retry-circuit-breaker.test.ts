import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

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
  MemoryStore: vi.fn(),
}));

import { writeFileSync } from 'node:fs';
import { updateTaskStatus } from '../../src/agents/worker.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '487-018-root',
    title: 'Fingerprint circuit breaker target',
    description: 'Repair the target.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'directive',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/target.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'targeted test passes',
      noGoCriteria: 'targeted test fails',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.NO_GO,
    sprintId: 'sprint-487',
    assignedWorker: 'w-487-018-root',
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  };
}

function makeNoGoResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '487-018-root',
    workerId: 'w-487-018-root',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'Repair requires tests/core/outside-authority.test.ts.',
    ...overrides,
  };
}

function writtenFix(callIndex = 0): Task & {
  repairAuthority: {
    state: 'accepted' | 'hold';
    holdReason?: string;
    authorityFingerprint: string;
    addedWritePaths: string[];
  };
} {
  const call = vi.mocked(writeFileSync).mock.calls[callIndex];
  if (!call) throw new Error(`Expected FIX write at call ${callIndex}`);
  return JSON.parse(String(call[1]));
}

describe('FIX retry fingerprint circuit breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '' });
  });

  it('parks an unchanged impossible fingerprint before another provider-dispatchable task exists', () => {
    // AUTHORITY-CONTRACT: worker prose never authors repair authority, so an
    // "impossible" FIX contract can only arise from structurally invalid
    // authority input (e.g. a non-exact reviewed directory). The invalid
    // directory is inherited verbatim by every FIX generation, keeping the
    // authority fingerprint byte-stable across rounds — exactly the unchanged
    // impossible fingerprint the circuit breaker must park.
    const root = makeTask({
      scope: {
        directories: ['src/orchestra/', '/outside-repo-absolute/'],
        filesRead: [],
        filesWrite: ['src/orchestra/target.ts'],
      },
    });
    const result = makeNoGoResult();
    handleEvaluation('/root', root, TaskEvaluation.NO_GO, result);
    const firstFix = writtenFix();
    expect(firstFix.status).toBe(TaskStatus.PAUSED);
    expect(firstFix.repairAuthority).toMatchObject({
      state: 'hold',
      holdReason: 'unresolved_requirements',
    });

    readFileSyncMock.mockImplementation((path: string) => {
      if (String(path).endsWith(`task-${firstFix.id}.json`)) {
        return JSON.stringify(firstFix);
      }
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });

    handleEvaluation(
      '/root',
      { ...firstFix, status: TaskStatus.NO_GO },
      TaskEvaluation.NO_GO,
      makeNoGoResult({ taskId: firstFix.id, workerId: `w-${firstFix.id}` }),
    );

    const rejectedRetry = writtenFix(1);
    expect(rejectedRetry.status).toBe(TaskStatus.PAUSED);
    expect(rejectedRetry.repairAuthority).toMatchObject({
      state: 'hold',
      holdReason: 'repeated_impossible_fingerprint',
      authorityFingerprint: firstFix.repairAuthority.authorityFingerprint,
    });
  });

  it('permits one bounded retry only after an exact authority delta from the prior impossible fingerprint', () => {
    const prior = makeTask({
      id: '487-018-root-fix',
      isPriorityFix: true,
      fixForTaskId: '487-018-root',
      scope: {
        directories: ['src/orchestra/', 'tests/core/'],
        filesRead: [],
        filesWrite: ['src/orchestra/target.ts'],
      },
    });
    readFileSyncMock.mockImplementation((path: string) => {
      if (String(path).endsWith(`task-${prior.id}.json`)) {
        return JSON.stringify({
          ...prior,
          repairAuthority: {
            state: 'hold',
            authorityFingerprint: 'prior-impossible-fingerprint',
            filesRead: [],
            filesWrite: ['src/orchestra/target.ts'],
          },
        });
      }
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: 'tests/core/outside-authority.test.ts\n',
    });

    handleEvaluation(
      '/root',
      prior,
      TaskEvaluation.NO_GO,
      makeNoGoResult({ taskId: prior.id, workerId: `w-${prior.id}` }),
      { allowPriorityFixCreation: true },
    );

    // The retry's authority input is now structurally valid, so its
    // fingerprint differs from the prior impossible one — a real delta,
    // and the bounded retry is admitted (PENDING, accepted).
    // AUTHORITY-CONTRACT: worker prose still grants nothing — the retry
    // carries EXACTLY the inherited write authority, no notes-derived paths.
    const admittedRetry = writtenFix();
    expect(admittedRetry.status).toBe(TaskStatus.PENDING);
    expect(admittedRetry.repairAuthority.state).toBe('accepted');
    expect(admittedRetry.repairAuthority.addedWritePaths).toEqual([]);
    expect(admittedRetry.scope.filesWrite).toEqual(['src/orchestra/target.ts']);
  });

  it('parks an exhausted failed attempt without creating an infinite FIX chain or completion', () => {
    const exhausted = makeTask({
      id: '487-018-root-fix-fix',
      isPriorityFix: true,
      fixForTaskId: '487-018-root-fix',
    });

    handleEvaluation(
      '/root',
      exhausted,
      TaskEvaluation.NO_GO,
      makeNoGoResult({ taskId: exhausted.id, workerId: `w-${exhausted.id}` }),
      { allowPriorityFixCreation: false },
    );

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(updateTaskStatus).toHaveBeenNthCalledWith(
      1, '/root', exhausted.id, TaskStatus.NO_GO,
    );
    expect(updateTaskStatus).toHaveBeenNthCalledWith(
      2, '/root', exhausted.id, TaskStatus.PAUSED,
    );
    expect(updateTaskStatus).not.toHaveBeenCalledWith(
      '/root', exhausted.id, TaskStatus.DONE,
    );
  });
});
