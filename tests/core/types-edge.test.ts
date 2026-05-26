import { describe, it, expect } from 'vitest';
import {
  TaskStatus,
  TaskEvaluation,
  AgentStatus,
  AlertLevel,
  SprintPhase,
  SprintStatus,
  DebtPriority,
} from '../../src/core/types.js';
import type {
  ModelType,
  TaskEffort,
  TaskPriority,
  SelfAssessment,
  Task,
  TaskResult,
  TaskScope,
  GoNoGoCriteria,
  DashboardState,
  AgentInfo,
  Alert,
  DebtItem,
  SprintMetrics,
} from '../../src/core/types.js';
import type { PluginManifest } from '../../src/core/plugin.js';

// ─── TaskStatus ──────────────────────────────────────────────────────────────

describe('TaskStatus enum', () => {
  it('should contain all expected values', () => {
    expect(TaskStatus.DRAFT).toBe('DRAFT');
    expect(TaskStatus.PENDING).toBe('PENDING');
    expect(TaskStatus.CLAIMED).toBe('CLAIMED');
    expect(TaskStatus.EXECUTING).toBe('EXECUTING');
    expect(TaskStatus.TESTING).toBe('TESTING');
    expect(TaskStatus.DOCUMENTING).toBe('DOCUMENTING');
    expect(TaskStatus.DONE).toBe('DONE');
    expect(TaskStatus.NO_GO).toBe('NO_GO');
    expect(TaskStatus.PAUSED).toBe('PAUSED');
  });

  it('should have 10 members', () => {
    // Sprint 195 195-001: MANUAL_REVIEW_REQUIRED added for disk-verify gate.
    const values = Object.values(TaskStatus);
    expect(values).toHaveLength(10);
  });

  it('should accept valid status in a conditional check', () => {
    const status: TaskStatus = TaskStatus.EXECUTING;
    const isActive =
      status === TaskStatus.EXECUTING ||
      status === TaskStatus.TESTING ||
      status === TaskStatus.DOCUMENTING;
    expect(isActive).toBe(true);
  });

  it('should distinguish terminal states from in-progress states', () => {
    const terminalStates: TaskStatus[] = [TaskStatus.DONE, TaskStatus.NO_GO];
    const inProgressStates: TaskStatus[] = [
      TaskStatus.DRAFT,
      TaskStatus.PENDING,
      TaskStatus.CLAIMED,
      TaskStatus.EXECUTING,
      TaskStatus.TESTING,
      TaskStatus.DOCUMENTING,
      TaskStatus.PAUSED,
    ];
    for (const s of terminalStates) {
      expect(inProgressStates).not.toContain(s);
    }
    for (const s of inProgressStates) {
      expect(terminalStates).not.toContain(s);
    }
  });

  it('should use string values (not numeric)', () => {
    for (const value of Object.values(TaskStatus)) {
      expect(typeof value).toBe('string');
    }
  });
});

// ─── TaskEvaluation ──────────────────────────────────────────────────────────

describe('TaskEvaluation enum', () => {
  it('should contain DONE, GO_WITH_TECH_DEBT, NO_GO', () => {
    expect(TaskEvaluation.DONE).toBe('DONE');
    expect(TaskEvaluation.GO_WITH_TECH_DEBT).toBe('GO_WITH_TECH_DEBT');
    expect(TaskEvaluation.NO_GO).toBe('NO_GO');
  });

  it('should have exactly 4 members', () => {
    // Sprint 192 192-010: DEFERRED added for dispatcher saturation reporting.
    expect(Object.values(TaskEvaluation)).toHaveLength(4);
  });

  it('should be usable as switch cases', () => {
    const evaluate = (e: TaskEvaluation): string => {
      switch (e) {
        case TaskEvaluation.DONE:
          return 'success';
        case TaskEvaluation.GO_WITH_TECH_DEBT:
          return 'partial';
        case TaskEvaluation.NO_GO:
          return 'failure';
      }
    };
    expect(evaluate(TaskEvaluation.DONE)).toBe('success');
    expect(evaluate(TaskEvaluation.GO_WITH_TECH_DEBT)).toBe('partial');
    expect(evaluate(TaskEvaluation.NO_GO)).toBe('failure');
  });
});

// ─── ModelType ───────────────────────────────────────────────────────────────

describe('ModelType', () => {
  it('should allow opus, sonnet, haiku literal values', () => {
    const models: ModelType[] = ['opus', 'sonnet', 'haiku'];
    expect(models).toHaveLength(3);
    expect(models).toContain('opus');
    expect(models).toContain('sonnet');
    expect(models).toContain('haiku');
  });

  it('should correctly assign each model value', () => {
    const opus: ModelType = 'opus';
    const sonnet: ModelType = 'sonnet';
    const haiku: ModelType = 'haiku';
    expect(opus).toBe('opus');
    expect(sonnet).toBe('sonnet');
    expect(haiku).toBe('haiku');
  });

  it('should be usable in task model assignment', () => {
    const scope: TaskScope = { directories: ['src/'], filesRead: [], filesWrite: [] };
    const goNogo: GoNoGoCriteria = {
      goCriteria: 'tests pass',
      noGoCriteria: 'tests fail',
      techDebtAcceptable: 'minor issues',
    };
    const task: Task = {
      id: 'T001',
      title: 'Test task',
      description: 'desc',
      model: 'opus',
      effort: 'high',
      priority: 'CRITICAL',
      reason: 'important',
      scope,
      dependencies: [],
      goNogo,
      status: TaskStatus.PENDING,
    };
    expect(task.model).toBe('opus');
  });

  it('should narrow correctly in a conditional', () => {
    const model: ModelType = 'sonnet';
    const isHeavy = model === 'opus';
    expect(isHeavy).toBe(false);
  });
});

// ─── Task interface ───────────────────────────────────────────────────────────

describe('Task interface', () => {
  const scope: TaskScope = {
    directories: ['src/core/'],
    filesRead: ['src/core/types.ts'],
    filesWrite: ['src/core/types.ts'],
  };
  const goNogo: GoNoGoCriteria = {
    goCriteria: 'All tests pass',
    noGoCriteria: 'Any test fails',
    techDebtAcceptable: 'Minor style issues',
  };

  it('should build a minimal valid Task with only required fields', () => {
    const task: Task = {
      id: '001-001',
      title: 'Minimal task',
      description: 'A minimal task',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'just testing',
      scope,
      dependencies: [],
      goNogo,
      status: TaskStatus.DRAFT,
    };
    expect(task.id).toBe('001-001');
    expect(task.sprintId).toBeUndefined();
    expect(task.assignedWorker).toBeUndefined();
    expect(task.isPriorityFix).toBeUndefined();
  });

  it('should allow all optional fields to be set', () => {
    const task: Task = {
      id: '001-002',
      title: 'Full task',
      description: 'Full task with all fields',
      model: 'opus',
      effort: 'high',
      priority: 'CRITICAL',
      reason: 'critical path',
      scope,
      dependencies: ['001-001'],
      goNogo,
      status: TaskStatus.EXECUTING,
      sprintId: 'sprint-001',
      assignedWorker: 'worker-1',
      isPriorityFix: true,
      fixForTaskId: '001-000',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
    };
    expect(task.sprintId).toBe('sprint-001');
    expect(task.assignedWorker).toBe('worker-1');
    expect(task.isPriorityFix).toBe(true);
    expect(task.fixForTaskId).toBe('001-000');
  });

  it('should accept all TaskEffort values', () => {
    const efforts: TaskEffort[] = ['low', 'normal', 'high'];
    for (const effort of efforts) {
      const task: Task = {
        id: 'x',
        title: 'x',
        description: 'x',
        model: 'haiku',
        effort,
        priority: 'LOW',
        reason: 'x',
        scope,
        dependencies: [],
        goNogo,
        status: TaskStatus.PENDING,
      };
      expect(task.effort).toBe(effort);
    }
  });

  it('should accept all TaskPriority values', () => {
    const priorities: TaskPriority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
    for (const priority of priorities) {
      const task: Task = {
        id: 'x',
        title: 'x',
        description: 'x',
        model: 'sonnet',
        effort: 'low',
        priority,
        reason: 'x',
        scope,
        dependencies: [],
        goNogo,
        status: TaskStatus.DRAFT,
      };
      expect(task.priority).toBe(priority);
    }
  });

  it('should allow empty scope arrays', () => {
    const emptyScope: TaskScope = { directories: [], filesRead: [], filesWrite: [] };
    const task: Task = {
      id: 'empty-scope',
      title: 'Empty scope task',
      description: 'no scope',
      model: 'haiku',
      effort: 'low',
      priority: 'LOW',
      reason: 'test',
      scope: emptyScope,
      dependencies: [],
      goNogo,
      status: TaskStatus.DRAFT,
    };
    expect(task.scope.directories).toHaveLength(0);
    expect(task.scope.filesRead).toHaveLength(0);
    expect(task.scope.filesWrite).toHaveLength(0);
  });
});

// ─── TaskResult interface ────────────────────────────────────────────────────

describe('TaskResult interface', () => {
  it('should accept DONE selfAssessment', () => {
    const result: TaskResult = {
      taskId: '001-001',
      workerId: 'w-001',
      filesChanged: ['src/foo.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'all good',
    };
    expect(result.selfAssessment).toBe('DONE');
  });

  it('should accept GO_WITH_TECH_DEBT selfAssessment', () => {
    const result: TaskResult = {
      taskId: '001-002',
      workerId: 'w-002',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 75,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'coverage below threshold',
    };
    expect(result.selfAssessment).toBe('GO_WITH_TECH_DEBT');
  });

  it('should accept NO_GO selfAssessment', () => {
    const result: TaskResult = {
      taskId: '001-003',
      workerId: 'w-003',
      filesChanged: ['src/broken.ts'],
      linesAdded: 5,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'tests failed',
    };
    expect(result.selfAssessment).toBe('NO_GO');
  });

  it('should allow optional fields to be omitted', () => {
    const result: TaskResult = {
      taskId: '001-004',
      workerId: 'w-004',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: '',
    };
    expect(result.completedAt).toBeUndefined();
    expect(result.durationMs).toBeUndefined();
  });

  it('should allow optional completedAt and durationMs', () => {
    const result: TaskResult = {
      taskId: '001-005',
      workerId: 'w-005',
      filesChanged: ['src/bar.ts'],
      linesAdded: 20,
      linesRemoved: 5,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'with timing',
      completedAt: '2026-01-01T12:00:00.000Z',
      durationMs: 60000,
    };
    expect(result.completedAt).toBe('2026-01-01T12:00:00.000Z');
    expect(result.durationMs).toBe(60000);
  });
});

// ─── SelfAssessment type ──────────────────────────────────────────────────────

describe('SelfAssessment type', () => {
  it('should include all three values', () => {
    const values: SelfAssessment[] = ['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO'];
    expect(values).toHaveLength(3);
  });

  it('should align with TaskEvaluation string values', () => {
    const selfDone: SelfAssessment = 'DONE';
    const evalDone = TaskEvaluation.DONE;
    expect(selfDone).toBe(evalDone);

    const selfNoGo: SelfAssessment = 'NO_GO';
    const evalNoGo = TaskEvaluation.NO_GO;
    expect(selfNoGo).toBe(evalNoGo);
  });
});

// ─── DashboardState interface ────────────────────────────────────────────────

describe('DashboardState interface', () => {
  it('should validate a minimal DashboardState', () => {
    const dashboard: DashboardState = {
      sprint: {
        id: 'sprint-001',
        number: 1,
        phase: SprintPhase.EXECUTE,
        status: SprintStatus.ACTIVE,
      },
      agents: [],
      progress: { done: 3, active: 2, blocked: 0, total: 5 },
      alerts: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(dashboard.sprint.id).toBe('sprint-001');
    expect(dashboard.agents).toHaveLength(0);
    expect(dashboard.progress.total).toBe(5);
  });

  it('should allow optional auditorLastScan and violations', () => {
    const dashboard: DashboardState = {
      sprint: {
        id: 'sprint-002',
        number: 2,
        phase: SprintPhase.PLAN,
        status: SprintStatus.PLANNING,
      },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
      alerts: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
      auditorLastScan: '2026-01-01T00:00:30.000Z',
      violations: 2,
    };
    expect(dashboard.auditorLastScan).toBeDefined();
    expect(dashboard.violations).toBe(2);
  });

  it('should support nested agents with AgentInfo', () => {
    const agentInfo: AgentInfo = {
      id: 'w-001',
      role: 'worker',
      status: AgentStatus.EXECUTING,
      model: 'sonnet',
      tmuxWindow: 'deckent:worker-1',
      taskId: '001-001',
      currentAction: 'coding',
    };
    const dashboard: DashboardState = {
      sprint: {
        id: 'sprint-003',
        number: 3,
        phase: SprintPhase.EXECUTE,
        status: SprintStatus.ACTIVE,
      },
      agents: [agentInfo],
      progress: { done: 0, active: 1, blocked: 0, total: 1 },
      alerts: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(dashboard.agents[0].id).toBe('w-001');
    expect(dashboard.agents[0].role).toBe('worker');
  });

  it('should support alerts with different levels', () => {
    const criticalAlert: Alert = {
      level: AlertLevel.CRITICAL,
      message: 'Usage threshold exceeded',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    const infoAlert: Alert = {
      level: AlertLevel.INFO,
      message: 'Sprint started',
      timestamp: '2026-01-01T00:00:00.000Z',
      acknowledged: true,
    };
    const dashboard: DashboardState = {
      sprint: {
        id: 'sprint-004',
        number: 4,
        phase: SprintPhase.SPAWN,
        status: SprintStatus.ACTIVE,
      },
      agents: [],
      progress: { done: 0, active: 0, blocked: 1, total: 1 },
      alerts: [criticalAlert, infoAlert],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(dashboard.alerts).toHaveLength(2);
    expect(dashboard.alerts[0].level).toBe(AlertLevel.CRITICAL);
    expect(dashboard.alerts[1].acknowledged).toBe(true);
  });
});

// ─── PluginManifest interface ────────────────────────────────────────────────

describe('PluginManifest interface', () => {
  it('should require all four fields: name, version, description, entrypoint', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'A test plugin',
      entrypoint: 'SKILL.md',
    };
    expect(manifest.name).toBe('test-plugin');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.description).toBe('A test plugin');
    expect(manifest.entrypoint).toBe('SKILL.md');
  });

  it('should hold string values for all fields', () => {
    const manifest: PluginManifest = {
      name: 'code-reviewer',
      version: '0.1.0',
      description: 'Code review plugin',
      entrypoint: 'SKILL.md',
    };
    expect(typeof manifest.name).toBe('string');
    expect(typeof manifest.version).toBe('string');
    expect(typeof manifest.description).toBe('string');
    expect(typeof manifest.entrypoint).toBe('string');
  });

  it('should be usable as a value in a Plugin wrapper', () => {
    const manifest: PluginManifest = {
      name: 'doc-writer',
      version: '2.0.0',
      description: 'Documentation writer',
      entrypoint: 'SKILL.md',
    };
    const plugin = { manifest, dir: '/some/dir' };
    expect(plugin.manifest.name).toBe('doc-writer');
    expect(plugin.dir).toBe('/some/dir');
  });
});

// ─── Additional enum coverage ────────────────────────────────────────────────

describe('AgentStatus enum', () => {
  it('should contain all expected values', () => {
    const expected = ['IDLE', 'PLANNING', 'EXECUTING', 'EVALUATING', 'SCANNING', 'CODING', 'TESTING', 'DOCUMENTING', 'DONE', 'ERROR', 'PAUSED'];
    for (const val of expected) {
      expect(Object.values(AgentStatus)).toContain(val);
    }
  });
});

describe('AlertLevel enum', () => {
  it('should have INFO, WARNING, CRITICAL', () => {
    expect(AlertLevel.INFO).toBe('INFO');
    expect(AlertLevel.WARNING).toBe('WARNING');
    expect(AlertLevel.CRITICAL).toBe('CRITICAL');
  });
});

describe('DebtPriority enum', () => {
  it('should have NORMAL, HIGH, CRITICAL', () => {
    expect(DebtPriority.NORMAL).toBe('NORMAL');
    expect(DebtPriority.HIGH).toBe('HIGH');
    expect(DebtPriority.CRITICAL).toBe('CRITICAL');
  });
});

describe('SprintPhase enum', () => {
  it('should contain all lifecycle phases', () => {
    const expected = ['DIRECTIVE', 'PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'DECAY', 'TRANSITION', 'COMPLETE'];
    for (const val of expected) {
      expect(Object.values(SprintPhase)).toContain(val);
    }
  });
});

describe('SprintStatus enum', () => {
  it('should contain all sprint statuses', () => {
    const expected = ['PLANNING', 'ACTIVE', 'EVALUATING', 'FIXING', 'RETROSPECTIVE', 'COMPLETE', 'PAUSED'];
    for (const val of expected) {
      expect(Object.values(SprintStatus)).toContain(val);
    }
  });
});

// ─── DebtItem interface ───────────────────────────────────────────────────────

describe('DebtItem interface', () => {
  it('should build a valid DebtItem', () => {
    const debt: DebtItem = {
      id: 'debt-001',
      description: 'Missing test coverage',
      originTaskId: '001-001',
      originSprintId: 'sprint-001',
      priority: DebtPriority.NORMAL,
      sprintsOpen: 1,
      resolved: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(debt.id).toBe('debt-001');
    expect(debt.resolved).toBe(false);
    expect(debt.resolvedInSprintId).toBeUndefined();
  });

  it('should allow optional resolvedInSprintId', () => {
    const debt: DebtItem = {
      id: 'debt-002',
      description: 'Resolved debt',
      originTaskId: '001-002',
      originSprintId: 'sprint-001',
      priority: DebtPriority.HIGH,
      sprintsOpen: 3,
      resolved: true,
      resolvedInSprintId: 'sprint-004',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(debt.resolved).toBe(true);
    expect(debt.resolvedInSprintId).toBe('sprint-004');
  });
});

// ─── SprintMetrics interface ──────────────────────────────────────────────────

describe('SprintMetrics interface', () => {
  it('should hold all numeric fields', () => {
    const metrics: SprintMetrics = {
      totalTasks: 10,
      completedTasks: 8,
      techDebtTasks: 1,
      noGoTasks: 1,
      durationMs: 3600000,
      coveragePercent: 92,
      noGoRate: 0.1,
      newDebtCount: 1,
      resolvedDebtCount: 0,
      totalOpenDebt: 3,
      boundaryViolations: 0,
      crossAssignments: 0,
      contextLinesUsed: 1500,
    };
    expect(metrics.totalTasks).toBe(10);
    expect(metrics.noGoRate).toBeCloseTo(0.1);
    expect(metrics.coveragePercent).toBe(92);
  });
});
