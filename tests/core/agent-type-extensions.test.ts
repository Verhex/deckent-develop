import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type {
  Task,
  TaskResult,
  Heartbeat,
  TaskScope,
  GoNoGoCriteria,
  AgentStatus,
} from '../../src/core/types.js';

// ─── Task.assignedAgent extension ────────────────────────────────────────────

describe('Task.assignedAgent field', () => {
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
    expect(task.assignedAgent).toBeUndefined();
  });

  it('accepts an agent ID string', () => {
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
      assignedAgent: 'security-expert',
    };
    expect(task.assignedAgent).toBe('security-expert');
  });

  it('accepts "generic" as a value', () => {
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
      assignedAgent: 'generic',
    };
    expect(task.assignedAgent).toBe('generic');
  });
});

// ─── TaskResult.agentId extension ────────────────────────────────────────────

describe('TaskResult.agentId field', () => {
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
    expect(result.agentId).toBeUndefined();
  });

  it('accepts an agent ID string', () => {
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
      agentId: 'test-specialist',
    };
    expect(result.agentId).toBe('test-specialist');
  });
});

// ─── Heartbeat.agentId extension ─────────────────────────────────────────────

describe('Heartbeat.agentId field', () => {
  it('is optional and defaults to undefined', () => {
    const hb: Heartbeat = {
      workerId: 'w-001',
      taskId: '001',
      status: 'EXECUTING' as any,
      currentAction: 'coding',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence: 1,
      progress: 50,
    };
    expect(hb.agentId).toBeUndefined();
  });

  it('accepts an agent ID string', () => {
    const hb: Heartbeat = {
      workerId: 'w-002',
      taskId: '002',
      status: 'TESTING' as any,
      currentAction: 'running tests',
      timestamp: new Date().toISOString(),
      filesChangedCount: 3,
      sequence: 5,
      progress: 80,
      agentId: 'security-agent',
    };
    expect(hb.agentId).toBe('security-agent');
  });
});
