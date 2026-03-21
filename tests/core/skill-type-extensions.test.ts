import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type {
  Task,
  TaskResult,
  TaskScope,
  GoNoGoCriteria,
} from '../../src/core/types.js';

// ─── Task.assignedSkills extension ──────────────────────────────────────────

describe('Task.assignedSkills field', () => {
  const scope: TaskScope = { directories: ['src/'], filesRead: [], filesWrite: [] };
  const goNogo: GoNoGoCriteria = {
    goCriteria: 'tests pass',
    noGoCriteria: 'tests fail',
    techDebtAcceptable: 'minor',
  };

  it('is optional and defaults to undefined', () => {
    const task: Task = {
      id: '001',
      title: 'Test',
      description: 'desc',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope,
      dependencies: [],
      goNogo,
      status: TaskStatus.PENDING,
    };
    expect(task.assignedSkills).toBeUndefined();
  });

  it('accepts an array of skill ID strings', () => {
    const task: Task = {
      id: '002',
      title: 'Test',
      description: 'desc',
      model: 'opus',
      effort: 'high',
      priority: 'CRITICAL',
      reason: 'important',
      scope,
      dependencies: [],
      goNogo,
      status: TaskStatus.EXECUTING,
      assignedSkills: ['typescript-skill', 'vitest-skill'],
    };
    expect(task.assignedSkills).toEqual(['typescript-skill', 'vitest-skill']);
  });

  it('accepts an empty array', () => {
    const task: Task = {
      id: '003',
      title: 'Test',
      description: 'desc',
      model: 'haiku',
      effort: 'low',
      priority: 'LOW',
      reason: 'test',
      scope,
      dependencies: [],
      goNogo,
      status: TaskStatus.DRAFT,
      assignedSkills: [],
    };
    expect(task.assignedSkills).toEqual([]);
  });
});

// ─── TaskResult.skillIds extension ──────────────────────────────────────────

describe('TaskResult.skillIds field', () => {
  it('is optional and defaults to undefined', () => {
    const result: TaskResult = {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'ok',
    };
    expect(result.skillIds).toBeUndefined();
  });

  it('accepts an array of skill ID strings', () => {
    const result: TaskResult = {
      taskId: '002',
      workerId: 'w-002',
      filesChanged: ['src/foo.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'ok',
      skillIds: ['express-skill', 'auth-skill'],
    };
    expect(result.skillIds).toEqual(['express-skill', 'auth-skill']);
  });

  it('accepts an empty array', () => {
    const result: TaskResult = {
      taskId: '003',
      workerId: 'w-003',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'failed',
      skillIds: [],
    };
    expect(result.skillIds).toEqual([]);
  });
});
