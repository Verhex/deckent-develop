// Sprint 156 Task 012 — Fresh-Eyes Fix Worker Rotation
// Tests the rotation helpers and their integration with handleEvaluation NO_GO branch.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Mocks (mirror debt-manager.test.ts) ────────────────────────────

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
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

const mockDbEntries = new Map<string, unknown>();
const mockMemoryStore = {
  getById: vi.fn((id: string) => mockDbEntries.get(id) ?? null),
  getByType: vi.fn(() => []),
  insert: vi.fn(),
  upsert: vi.fn(),
  softDelete: vi.fn(),
  totalCount: vi.fn(() => 0),
  countByType: vi.fn(),
  decay: vi.fn(),
  close: vi.fn(),
  getRawDb: vi.fn(),
  getRelationsFrom: vi.fn().mockReturnValue([]),
  getRelationsTo: vi.fn().mockReturnValue([]),
  getTagsForEntry: vi.fn().mockReturnValue([]),
  getByTags: vi.fn().mockReturnValue([]),
  getHistory: vi.fn().mockReturnValue([]),
  restore: vi.fn(),
  getSchemaVersion: vi.fn().mockReturnValue(1),
};

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemoryStore),
}));

import { writeFileSync, existsSync } from 'node:fs';
import {
  handleEvaluation,
  rotateModelForFix,
  rotateAgentForFix,
  applyFreshEyesRotation,
  type FreshEyesRotationStrategy,
} from '../../src/orchestra/debt-manager.js';
import * as spawner from '../../src/orchestra/sprint-spawner.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Test task',
    description: 'desc',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-156',
    assignedWorker: 'w-task-001',
    assignedAgent: 'architect',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-001',
    workerId: 'w-task-001',
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'failed badly',
    ...overrides,
  };
}

function reset() {
  vi.clearAllMocks();
  mockDbEntries.clear();
  vi.mocked(existsSync).mockReturnValue(false);
}

// ─── rotateModelForFix (C-03: identity — model preserved, fresh-eyes via agent) ──

describe('rotateModelForFix', () => {
  // C-03 fix: a failed task's retry is HARDER, not easier — downgrading the
  // model (opus→sonnet→haiku) was reverse logic. Fresh-eyes now comes purely
  // from agent rotation (rotateAgentForFix). Model is preserved (identity).
  it('opus is preserved (no downgrade)', () => {
    expect(rotateModelForFix('opus')).toBe('opus');
  });

  it('sonnet is preserved', () => {
    expect(rotateModelForFix('sonnet')).toBe('sonnet');
  });

  it('haiku is preserved', () => {
    expect(rotateModelForFix('haiku')).toBe('haiku');
  });

  it('gpt-5 is preserved', () => {
    expect(rotateModelForFix('gpt-5')).toBe('gpt-5');
  });

  it('gpt-4.1 is preserved', () => {
    expect(rotateModelForFix('gpt-4.1')).toBe('gpt-4.1');
  });

  it('o3 is preserved', () => {
    expect(rotateModelForFix('o3')).toBe('o3');
  });

  it('gemini-2.5-pro is preserved', () => {
    expect(rotateModelForFix('gemini-2.5-pro')).toBe('gemini-2.5-pro');
  });

  it('gemini-3.1-pro-preview is preserved', () => {
    expect(rotateModelForFix('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview');
  });

  it('returns same model for unknown models too', () => {
    expect(rotateModelForFix('unknown-future-model' as never)).toBe('unknown-future-model');
  });
});

// ─── rotateAgentForFix ──────────────────────────────────────────────

describe('rotateAgentForFix', () => {
  it('architect → code-reviewer', () => {
    expect(rotateAgentForFix('architect')).toBe('code-reviewer');
  });

  it('bug-fixer → code-reviewer', () => {
    expect(rotateAgentForFix('bug-fixer')).toBe('code-reviewer');
  });

  it('code-reviewer → bug-fixer (reverse rotation)', () => {
    expect(rotateAgentForFix('code-reviewer')).toBe('bug-fixer');
  });

  it('security-auditor → code-reviewer', () => {
    expect(rotateAgentForFix('security-auditor')).toBe('code-reviewer');
  });

  it('test-writer → bug-fixer', () => {
    expect(rotateAgentForFix('test-writer')).toBe('bug-fixer');
  });

  it('undefined → code-reviewer (default)', () => {
    expect(rotateAgentForFix(undefined)).toBe('code-reviewer');
  });

  it('null → code-reviewer (default)', () => {
    expect(rotateAgentForFix(null)).toBe('code-reviewer');
  });

  it('generic → code-reviewer (default)', () => {
    expect(rotateAgentForFix('generic')).toBe('code-reviewer');
  });

  it('unknown agent → code-reviewer (default)', () => {
    expect(rotateAgentForFix('some-future-agent')).toBe('code-reviewer');
  });
});

// ─── applyFreshEyesRotation ─────────────────────────────────────────

describe('applyFreshEyesRotation', () => {
  it('returns enabled strategy for opus+architect', () => {
    const task = makeTask({ model: 'opus', assignedAgent: 'architect' });
    const strategy = applyFreshEyesRotation(task);
    expect(strategy.enabled).toBe(true);
    expect(strategy.originalModel).toBe('opus');
    expect(strategy.rotatedModel).toBe('opus'); // C-03: model preserved
    expect(strategy.originalAgent).toBe('architect');
    expect(strategy.rotatedAgent).toBe('code-reviewer');
  });

  it('adds companion skill for architect rotation', () => {
    const task = makeTask({ model: 'opus', assignedAgent: 'architect' });
    const strategy = applyFreshEyesRotation(task);
    expect(strategy.addedSkills).toContain('code-simplifier');
  });

  it('rationale string contains original and rotated identifiers', () => {
    const task = makeTask({ model: 'opus', assignedAgent: 'architect' });
    const strategy = applyFreshEyesRotation(task);
    expect(strategy.rationale).toContain('opus→opus'); // C-03: model preserved
    expect(strategy.rationale).toContain('architect');
    expect(strategy.rationale).toContain('code-reviewer');
  });

  it('handles task without assignedAgent (treats as generic)', () => {
    const task = makeTask({ model: 'sonnet', assignedAgent: undefined });
    const strategy = applyFreshEyesRotation(task);
    expect(strategy.originalAgent).toBe('generic');
    expect(strategy.rotatedAgent).toBe('code-reviewer');
    expect(strategy.rotatedModel).toBe('sonnet'); // C-03: model preserved
  });

  it('preserves model (haiku stays haiku)', () => {
    const task = makeTask({ model: 'haiku', assignedAgent: 'bug-fixer' });
    const strategy = applyFreshEyesRotation(task);
    expect(strategy.originalModel).toBe('haiku');
    expect(strategy.rotatedModel).toBe('haiku');
  });

  it('does not mutate the input task', () => {
    const task = makeTask({ model: 'opus', assignedAgent: 'architect' });
    const before = { ...task };
    applyFreshEyesRotation(task);
    expect(task.model).toBe(before.model);
    expect(task.assignedAgent).toBe(before.assignedAgent);
  });
});

// ─── handleEvaluation NO_GO integration ─────────────────────────────

describe('handleEvaluation NO_GO with fresh-eyes rotation', () => {
  beforeEach(() => {
    reset();
  });

  it('writes fix task JSON with rotated model and agent', () => {
    // orig task: opus + architect
    const task = makeTask({ model: 'opus', assignedAgent: 'architect' });
    const result = makeTaskResult({ selfAssessment: 'NO_GO', notes: 'arch problem' });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    expect(writeFileSync).toHaveBeenCalled();
    const callArgs = vi.mocked(writeFileSync).mock.calls[0]!;
    const writtenPath = callArgs[0] as string;
    expect(writtenPath).toContain('task-task-001-fix.json');

    const writtenContent = JSON.parse(callArgs[1] as string) as Record<string, unknown>;
    // C-03: model preserved (opus), fresh-eyes via agent rotation
    expect(writtenContent['model']).toBe('opus');
    expect(writtenContent['assignedAgent']).toBe('code-reviewer');
  });

  it('fix task carries rotationStrategy field', () => {
    const task = makeTask({ model: 'opus', assignedAgent: 'architect' });
    const result = makeTaskResult({ selfAssessment: 'NO_GO', notes: 'failed' });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const callArgs = vi.mocked(writeFileSync).mock.calls[0]!;
    const writtenContent = JSON.parse(callArgs[1] as string) as Record<string, unknown>;
    const strategy = writtenContent['rotationStrategy'] as FreshEyesRotationStrategy;

    expect(strategy).toBeDefined();
    expect(strategy.enabled).toBe(true);
    expect(strategy.originalModel).toBe('opus');
    expect(strategy.rotatedModel).toBe('opus'); // C-03: model preserved
    expect(strategy.originalAgent).toBe('architect');
    expect(strategy.rotatedAgent).toBe('code-reviewer');
    expect(strategy.addedSkills).toContain('code-simplifier');
  });

  it('fix task sets forceModel and forceAgent for routing override', () => {
    const task = makeTask({ model: 'opus', assignedAgent: 'architect' });
    const result = makeTaskResult({ selfAssessment: 'NO_GO' });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const callArgs = vi.mocked(writeFileSync).mock.calls[0]!;
    const writtenContent = JSON.parse(callArgs[1] as string) as Record<string, unknown>;
    expect(writtenContent['forceModel']).toBe('opus'); // C-03: model preserved
    expect(writtenContent['forceAgent']).toBe('code-reviewer');
  });

  it('fix task preserves isPriorityFix, CRITICAL priority, and PENDING status', () => {
    const task = makeTask({ model: 'opus', assignedAgent: 'architect' });
    const result = makeTaskResult({ selfAssessment: 'NO_GO' });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const callArgs = vi.mocked(writeFileSync).mock.calls[0]!;
    const writtenContent = JSON.parse(callArgs[1] as string) as Record<string, unknown>;
    expect(writtenContent['isPriorityFix']).toBe(true);
    expect(writtenContent['priority']).toBe('CRITICAL');
    expect(writtenContent['status']).toBe(TaskStatus.PENDING);
    expect(writtenContent['fixForTaskId']).toBe('task-001');
  });

  it('fix task merges existing assignedSkills with rotation companion skills', () => {
    const task = makeTask({
      model: 'opus',
      assignedAgent: 'architect',
      assignedSkills: ['typescript-expert'],
    });
    const result = makeTaskResult({ selfAssessment: 'NO_GO' });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const callArgs = vi.mocked(writeFileSync).mock.calls[0]!;
    const writtenContent = JSON.parse(callArgs[1] as string) as Record<string, unknown>;
    const skills = writtenContent['assignedSkills'] as string[];
    expect(skills).toContain('typescript-expert');
    expect(skills).toContain('code-simplifier');
  });

  it('fix task on sonnet+bug-fixer preserves sonnet AND keeps bug-fixer (Sprint 210-007 selectFixAgent)', () => {
    // Sprint 210 Task 7 ([[feedback_fix_prompt_quality]]): a bug-fixer original
    // is already a debug specialist — selectFixAgent keeps it rather than
    // rotating to code-reviewer (which would lose the debug-first lens). Model
    // is still preserved (C-03). Fresh-eyes rotation applies to non-bug agents
    // (architect/refactorer/security → code-reviewer), which the unit tests
    // for rotateAgentForFix above still cover.
    const task = makeTask({ model: 'sonnet', assignedAgent: 'bug-fixer' });
    const result = makeTaskResult({ selfAssessment: 'NO_GO' });

    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);

    const callArgs = vi.mocked(writeFileSync).mock.calls[0]!;
    const writtenContent = JSON.parse(callArgs[1] as string) as Record<string, unknown>;
    expect(writtenContent['model']).toBe('sonnet'); // C-03: model preserved
    expect(writtenContent['assignedAgent']).toBe('bug-fixer'); // 210-007: bug-fixer kept
  });
});

// ─── sprint-spawner re-export surface ───────────────────────────────

describe('sprint-spawner fresh-eyes re-exports', () => {
  it('re-exports rotateModelForFix from debt-manager', () => {
    expect(typeof spawner.rotateModelForFix).toBe('function');
    expect(spawner.rotateModelForFix('opus')).toBe('opus'); // C-03: model preserved
  });

  it('re-exports rotateAgentForFix from debt-manager', () => {
    expect(typeof spawner.rotateAgentForFix).toBe('function');
    expect(spawner.rotateAgentForFix('architect')).toBe('code-reviewer');
  });

  it('re-exports applyFreshEyesRotation from debt-manager', () => {
    expect(typeof spawner.applyFreshEyesRotation).toBe('function');
  });

  it('exports emitRotationMetricIfApplicable', () => {
    expect(typeof spawner.emitRotationMetricIfApplicable).toBe('function');
  });

  it('emitRotationMetricIfApplicable is a no-op for non-fix tasks', () => {
    const task = makeTask({ isPriorityFix: false });
    // No file read attempt for non-fix tasks
    expect(() => {
      spawner.emitRotationMetricIfApplicable('/root', 'sprint-156', task);
    }).not.toThrow();
  });

  it('emitRotationMetricIfApplicable swallows I/O errors for fix tasks', () => {
    const task = makeTask({ id: 'task-001-fix', isPriorityFix: true });
    // readFileSync mocked to throw ENOENT — emit must not throw
    expect(() => {
      spawner.emitRotationMetricIfApplicable('/root', 'sprint-156', task);
    }).not.toThrow();
  });
});
