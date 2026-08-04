// Sprint 210 Task 6 — FIX prompt enrichment
// Verifies that handleEvaluation() injects the ORIGINAL task description,
// NO_GO reason, and concrete fix guidance into the fix-task.description so
// the fix worker receives non-empty, actionable context.
//
// Memory ref: feedback_fix_prompt_quality — the prior empty "=== Task ==="
// block caused the fix worker to receive only "exited without result" and
// guess at the task.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => { throw new Error('ENOENT: no such file'); }),
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

const ORIGINAL_DESC = 'Implement the routing-imbalance CI guard: reads scripts/routing-distribution.mjs output and exits 1 when any agent >80% share.';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '210-006-orig',
    title: 'Implement routing imbalance guard',
    description: ORIGINAL_DESC,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'directive',
    scope: { directories: ['src/scripts/'], filesRead: [], filesWrite: ['src/scripts/guard.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.NO_GO,
    sprintId: 'sprint-210',
    assignedWorker: 'w-210-006-orig',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeNoGoResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '210-006-orig',
    workerId: 'w-210-006-orig',
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

describe('FIX prompt enrichment — handleEvaluation NO_GO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '' });
  });

  it('description-inject: fix-task.description contains the ORIGINAL task description', () => {
    const task = makeTask();
    const result = makeNoGoResult();
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.id).toBe('210-006-orig-fix');
    expect(payload.description).toContain('## Original Task');
    expect(payload.description).toContain(ORIGINAL_DESC);
  });

  it('nogo-reason-inject: fix-task.description carries an explicit "## NO_GO Reason" with failure signals', () => {
    const task = makeTask();
    const result = makeNoGoResult({
      testsPassed: false,
      filesChanged: [],
      linesAdded: 0,
      rubricScores: { correctness: 0, test_coverage: 0, scope_compliance: 0 },
    });
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.description).toContain('## NO_GO Reason');
    expect(payload.description).toContain('Task 210-006-orig evaluated as NO_GO');
    expect(payload.description).toContain('tests failed');
    expect(payload.description).toContain('no files changed');
    expect(payload.description).toContain('## Fix Guidance');
  });

  it('empty-description-fallback: when original description is empty the fix-task uses an explicit fallback marker (no crash)', () => {
    const task = makeTask({ description: '' });
    const result = makeNoGoResult();
    expect(() =>
      handleEvaluation('/root', task, TaskEvaluation.NO_GO, result),
    ).not.toThrow();

    const { payload } = readWrittenFixTask();
    expect(payload.description).toContain('## Original Task');
    expect(payload.description).toContain('(original task description unavailable)');
    // Fallback shape stays deterministic — the rest of the structure must remain present.
    expect(payload.description).toContain('## NO_GO Reason');
    expect(payload.description).toContain('## Fix Guidance');
  });

  it('idempotent: two handleEvaluation calls with identical input write byte-identical fix-task descriptions', () => {
    const task = makeTask();
    const result = makeNoGoResult({
      rubricScores: { correctness: 40, test_coverage: 50, scope_compliance: 60 },
      notes: 'first attempt notes',
    });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const first = readWrittenFixTask(0);
    const second = readWrittenFixTask(1);
    expect(second.path).toBe(first.path);
    // createdAt rotates with Date.now() — strip it before diff-checking.
    const stripVolatile = (p: any) => ({ ...p, createdAt: 'STABLE' });
    expect(stripVolatile(second.payload)).toEqual(stripVolatile(first.payload));
    // Spot-check the enrichment payload itself is deterministic.
    expect(second.payload.description).toBe(first.payload.description);
  });

  // AUTHORITY-CONTRACT (post-210 tightening): worker-authored prose is
  // evidence for DIAGNOSIS, never scope authority. Until a host-authored typed
  // scope-amendment receipt exists, buildFixRepairAuthority derives NO
  // failure-evidence paths from result.notes: the FIX inherits the approved
  // scope EXACTLY (notes cannot grant a path) and cannot create a birth-time
  // PAUSED trap (notes cannot park a repair either).
  it('worker prose never widens the FIX write scope — inherited authority is carried exactly', () => {
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: 'tests/cli/recover.test.ts\ntests/mcp/recover.test.ts\n',
    });
    const task = makeTask({
      scope: {
        directories: ['src/', 'tests/cli/', 'tests/mcp/'],
        filesRead: [],
        filesWrite: ['src/recover.ts'],
      },
    });
    const result = makeNoGoResult({
      notes:
        'Targeted failures require tests/cli/recover.test.ts and tests/mcp/recover.test.ts updates.',
    });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    // Notes named two extra test files — none may be granted from prose.
    expect(payload.scope.filesWrite).toEqual(['src/recover.ts']);
    expect(payload.repairAuthority).toMatchObject({
      state: 'accepted',
      addedWritePaths: [],
      evidenceWritePaths: [],
      inheritedFilesWrite: ['src/recover.ts'],
      filesWrite: ['src/recover.ts'],
    });
  });

  it('out-of-scope prose cannot park the FIX — no birth-time PAUSED trap, authority stays accepted', () => {
    const task = makeTask({
      scope: {
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['src/recover.ts'],
      },
    });
    const result = makeNoGoResult({
      notes: 'Repair requires tests/cli/recover.test.ts, which is outside the reviewed boundary.',
    });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    // Prose naming an out-of-boundary path is NOT a typed scope amendment:
    // the fix dispatches PENDING under the inherited authority, unparked.
    expect(payload.status).toBe(TaskStatus.PENDING);
    expect(payload.repairAuthority).toMatchObject({
      state: 'accepted',
      evidenceWritePaths: [],
      filesWrite: ['src/recover.ts'],
    });
  });
});
