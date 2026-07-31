// Sprint 210 Task 7 — FIX agent selection based on task type
// Verifies that handleEvaluation() + selectFixAgent() pick the most appropriate
// agent for a fix task rather than always defaulting to bug-fixer.
//
// Memory ref: feedback_fix_prompt_quality — FIX always assigned bug-fixer even
// for test-isolation failures where ci-guardian / ci-testing discipline is needed.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

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
import { handleEvaluation, selectFixAgent } from '../../src/orchestra/debt-manager.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '210-007-orig',
    title: 'Base task',
    description: 'Do something important',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'directive',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.NO_GO,
    sprintId: 'sprint-210',
    assignedWorker: 'w-210-007-orig',
    assignedAgent: 'refactorer',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeNoGoResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '210-007-orig',
    workerId: 'w-210-007-orig',
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'tests failed',
    ...overrides,
  };
}

function readWrittenFixTask(): { path: string; payload: Record<string, unknown> } {
  const calls = vi.mocked(writeFileSync).mock.calls;
  if (calls.length === 0) throw new Error('writeFileSync was not called');
  const [path, content] = calls[0]!;
  return { path: String(path), payload: JSON.parse(String(content)) as Record<string, unknown> };
}

// ─── selectFixAgent unit tests ───────────────────────────────────────

describe('selectFixAgent — unit', () => {
  it('test task (ci-guardian agent) → preserves ci-guardian, not bug-fixer', () => {
    const task = makeTask({ assignedAgent: 'ci-guardian', title: 'fix flaky tests' });
    const fixAgent = selectFixAgent(task, false);
    expect(fixAgent).toBe('ci-guardian');
    expect(fixAgent).not.toBe('bug-fixer');
  });

  it('doc task (doc-writer agent) → returns doc-writer', () => {
    const task = makeTask({ assignedAgent: 'doc-writer', title: 'update ADR-073' });
    const fixAgent = selectFixAgent(task, false);
    expect(fixAgent).toBe('doc-writer');
  });

  it('bug task (bug-fixer agent) → returns bug-fixer', () => {
    const task = makeTask({ assignedAgent: 'bug-fixer', title: 'fix crash on startup' });
    const fixAgent = selectFixAgent(task, false);
    expect(fixAgent).toBe('bug-fixer');
  });

  it('test task via ci-testing skill → preserves original agent', () => {
    const task = makeTask({ assignedAgent: 'refactorer', assignedSkills: ['ci-testing', 'typescript-expert'] });
    const fixAgent = selectFixAgent(task, false);
    expect(fixAgent).toBe('refactorer');
  });

  it('exit-no-result → original agent re-run (no rotation)', () => {
    const task = makeTask({ assignedAgent: 'frontend-designer' });
    const fixAgent = selectFixAgent(task, true);
    expect(fixAgent).toBe('frontend-designer');
  });

  it('generic task → refuses a read-only fresh-eyes persona and routes to an implementer', () => {
    const task = makeTask({ assignedAgent: 'architect', title: 'redesign module boundaries' });
    const fixAgent = selectFixAgent(task, false);
    expect(fixAgent).toBe('bug-fixer');
  });
});

// ─── handleEvaluation integration tests ─────────────────────────────

describe('FIX agent selection — handleEvaluation integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('test task → fix task assignedAgent and forceAgent are ci-guardian, not bug-fixer', () => {
    const task = makeTask({ assignedAgent: 'ci-guardian', title: 'fix test isolation for vitest suite' });
    const result = makeNoGoResult();
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.assignedAgent).toBe('ci-guardian');
    expect(payload.forceAgent).toBe('ci-guardian');
    expect(payload.assignedAgent).not.toBe('bug-fixer');
  });

  it('doc task → fix task agent is doc-writer', () => {
    const task = makeTask({ assignedAgent: 'doc-writer', title: 'write ADR for new feature' });
    const result = makeNoGoResult();
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.assignedAgent).toBe('doc-writer');
    expect(payload.forceAgent).toBe('doc-writer');
  });

  it('bug task → fix task agent is bug-fixer', () => {
    const task = makeTask({ assignedAgent: 'bug-fixer', title: 'fix regression in config parser' });
    const result = makeNoGoResult();
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.assignedAgent).toBe('bug-fixer');
    expect(payload.forceAgent).toBe('bug-fixer');
  });

  it('exit-no-result → fix task reuses original agent for re-run', () => {
    const task = makeTask({ assignedAgent: 'api-builder', title: 'build REST endpoint' });
    const result = makeNoGoResult({
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      notes: 'exited without result',
    });
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const { payload } = readWrittenFixTask();
    expect(payload.assignedAgent).toBe('api-builder');
    expect(payload.forceAgent).toBe('api-builder');
  });
});
