import { describe, it, expect } from 'vitest';

// ─── Barrel re-export backward compatibility ────────────────────────────────
// All imports from './types.js' must continue to work after the split.

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
  TaskScope,
  GoNoGoCriteria,
  Task,
  TaskResult,
  TaskPlan,
  PlannerTask,
  PlannerResult,
  AgentRole,
  Heartbeat,
  AgentInfo,
  Alert,
  BoundaryViolationType,
  BoundaryViolation,
  DashboardState,
  LockInfo,
  SkillMeta,
  PlanModeConfig,
  BrainPlanningMode,
  PlanMode,
  SkillConfig,
  DeckentConfig,
  ResolvedConfig,
  AutoDocsConfig,
  StartOptions,
  DoctorResult,
  SubscriptionDetected,
  DetectionMethod,
  SubscriptionProfile,
  SetupRecommendation,
  UsageMetrics,
  UsageThresholds,
  SystemProfile,
  SprintUsageReport,
  Sprint,
  SprintMetrics,
  SprintResult,
  DebtItem,
  MemoryEntry,
  PatternEntry,
  DecayResult,
  BrainContext,
  ProjectState,
  SprintSizeRecommendation,
  DetectedFramework,
  DetectedLanguage,
  DetectedTestFramework,
  DetectedBuildTool,
  DetectedCI,
  ProjectSize,
  MethodologyRecommendation,
  ProjectAnalysis,
} from '../../src/core/types.js';

// ─── Direct domain file imports (verify split files are independently usable)

import {
  TaskStatus as DirectTaskStatus,
  TaskEvaluation as DirectTaskEvaluation,
} from '../../src/core/task-types.js';

import type {
  Task as DirectTask,
  TaskResult as DirectTaskResult,
} from '../../src/core/task-types.js';

import {
  SprintPhase as DirectSprintPhase,
  DebtPriority as DirectDebtPriority,
} from '../../src/core/sprint-types.js';

import type {
  Sprint as DirectSprint,
  DebtItem as DirectDebtItem,
  PatternEntry as DirectPatternEntry,
} from '../../src/core/sprint-types.js';

import {
  AgentStatus as DirectAgentStatus,
  AlertLevel as DirectAlertLevel,
} from '../../src/core/monitoring-types.js';

import type {
  AgentInfo as DirectAgentInfo,
  DashboardState as DirectDashboardState,
} from '../../src/core/monitoring-types.js';

import type {
  DeckentConfig as DirectDeckentConfig,
  ResolvedConfig as DirectResolvedConfig,
  ProjectAnalysis as DirectProjectAnalysis,
} from '../../src/core/config-types.js';


// ─── Test 1: Barrel re-exports all enums correctly ──────────────────────────

describe('types.ts barrel re-export — enums', () => {
  it('re-exports TaskStatus with all 9 members', () => {
    expect(Object.values(TaskStatus)).toHaveLength(9);
    expect(TaskStatus.DRAFT).toBe('DRAFT');
    expect(TaskStatus.DONE).toBe('DONE');
  });

  it('re-exports TaskEvaluation with all 3 members', () => {
    expect(Object.values(TaskEvaluation)).toHaveLength(3);
    expect(TaskEvaluation.GO_WITH_TECH_DEBT).toBe('GO_WITH_TECH_DEBT');
  });

  it('re-exports AgentStatus with 11 members', () => {
    expect(Object.values(AgentStatus)).toHaveLength(11);
    expect(AgentStatus.DOCUMENTING).toBe('DOCUMENTING');
  });

  it('re-exports AlertLevel with 3 members', () => {
    expect(Object.values(AlertLevel)).toHaveLength(3);
    expect(AlertLevel.CRITICAL).toBe('CRITICAL');
  });

  it('re-exports SprintPhase with 10 members', () => {
    expect(Object.values(SprintPhase)).toHaveLength(10);
    expect(SprintPhase.RETRO).toBe('RETRO');
  });

  it('re-exports SprintStatus with 7 members', () => {
    expect(Object.values(SprintStatus)).toHaveLength(7);
    expect(SprintStatus.COMPLETE).toBe('COMPLETE');
  });

  it('re-exports DebtPriority with 3 members', () => {
    expect(Object.values(DebtPriority)).toHaveLength(3);
    expect(DebtPriority.HIGH).toBe('HIGH');
  });
});


// ─── Test 2: Barrel re-exports all type aliases ─────────────────────────────

describe('types.ts barrel re-export — type aliases', () => {
  it('ModelType accepts opus/sonnet/haiku', () => {
    const m: ModelType = 'opus';
    expect(m).toBe('opus');
  });

  it('SelfAssessment matches TaskEvaluation string values', () => {
    const sa: SelfAssessment = 'GO_WITH_TECH_DEBT';
    expect(sa).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('PlanMode accepts valid plan names', () => {
    const pm: PlanMode = 'max_plan';
    expect(pm).toBe('max_plan');
  });

  it('BrainPlanningMode accepts ai/structured/auto', () => {
    const bpm: BrainPlanningMode = 'auto';
    expect(bpm).toBe('auto');
  });
});


// ─── Test 3: Barrel re-exports all interfaces ──────────────────────────────

describe('types.ts barrel re-export — interfaces', () => {
  it('Task interface can be constructed with required fields', () => {
    const task: Task = {
      id: 'split-001',
      title: 'Split test',
      description: 'Test the split',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'verify split',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
      status: TaskStatus.PENDING,
    };
    expect(task.id).toBe('split-001');
  });

  it('DashboardState can be constructed', () => {
    const ds: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
      alerts: [],
      updatedAt: new Date().toISOString(),
    };
    expect(ds.sprint.phase).toBe(SprintPhase.EXECUTE);
  });

  it('SprintResult can be constructed', () => {
    const sr: SprintResult = {
      sprint: {
        id: 'sprint-001',
        number: 1,
        status: SprintStatus.COMPLETE,
        phase: SprintPhase.COMPLETE,
        tasks: [],
        workers: [],
      },
      evaluations: new Map(),
      metrics: {
        totalTasks: 0,
        completedTasks: 0,
        techDebtTasks: 0,
        noGoTasks: 0,
        durationMs: 0,
        coveragePercent: 0,
        noGoRate: 0,
        newDebtCount: 0,
        resolvedDebtCount: 0,
        totalOpenDebt: 0,
        boundaryViolations: 0,
        crossAssignments: 0,
        contextLinesUsed: 0,
      },
    };
    expect(sr.sprint.status).toBe(SprintStatus.COMPLETE);
  });
});


// ─── Test 4: Direct domain file imports match barrel ────────────────────────

describe('Direct domain imports match barrel re-exports', () => {
  it('TaskStatus from task-types.ts === TaskStatus from types.ts', () => {
    expect(DirectTaskStatus.DONE).toBe(TaskStatus.DONE);
    expect(DirectTaskStatus.PENDING).toBe(TaskStatus.PENDING);
    expect(Object.values(DirectTaskStatus)).toEqual(Object.values(TaskStatus));
  });

  it('TaskEvaluation from task-types.ts === TaskEvaluation from types.ts', () => {
    expect(DirectTaskEvaluation.NO_GO).toBe(TaskEvaluation.NO_GO);
  });

  it('SprintPhase from sprint-types.ts === SprintPhase from types.ts', () => {
    expect(DirectSprintPhase.EXECUTE).toBe(SprintPhase.EXECUTE);
    expect(Object.values(DirectSprintPhase)).toEqual(Object.values(SprintPhase));
  });

  it('DebtPriority from sprint-types.ts === DebtPriority from types.ts', () => {
    expect(DirectDebtPriority.CRITICAL).toBe(DebtPriority.CRITICAL);
  });

  it('AgentStatus from monitoring-types.ts === AgentStatus from types.ts', () => {
    expect(DirectAgentStatus.EXECUTING).toBe(AgentStatus.EXECUTING);
    expect(Object.values(DirectAgentStatus)).toEqual(Object.values(AgentStatus));
  });

  it('AlertLevel from monitoring-types.ts === AlertLevel from types.ts', () => {
    expect(DirectAlertLevel.WARNING).toBe(AlertLevel.WARNING);
  });
});


// ─── Test 5: No circular dependency — each domain file is self-contained ────

describe('Domain file independence', () => {
  it('task-types.ts exports Task without depending on sprint or monitoring', () => {
    const task: DirectTask = {
      id: 'ind-001',
      title: 'Independent',
      description: 'No cross-domain dep',
      model: 'haiku',
      effort: 'low',
      priority: 'LOW',
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'ok', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
      status: DirectTaskStatus.DRAFT,
    };
    expect(task.status).toBe('DRAFT');
  });

  it('sprint-types.ts exports DebtItem independently', () => {
    const debt: DirectDebtItem = {
      id: 'debt-ind-001',
      description: 'Test debt',
      originTaskId: '001',
      originSprintId: 'sprint-001',
      priority: DirectDebtPriority.NORMAL,
      sprintsOpen: 0,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    expect(debt.resolved).toBe(false);
  });

  it('monitoring-types.ts exports AgentInfo independently', () => {
    const agent: DirectAgentInfo = {
      id: 'w-001',
      role: 'worker',
      status: DirectAgentStatus.IDLE,
      model: 'sonnet',
      tmuxWindow: 'test:w1',
    };
    expect(agent.role).toBe('worker');
  });
});


// ─── Test 6: Config domain types ────────────────────────────────────────────

describe('Config domain types via barrel', () => {
  it('AutoDocsConfig has tier1/tier2/tier3', () => {
    const adc: AutoDocsConfig = { tier1: true, tier2: false, tier3: false };
    expect(adc.tier1).toBe(true);
  });

  it('SetupRecommendation has all fields', () => {
    const sr: SetupRecommendation = {
      mode: 'pro_plan',
      maxWorkers: 3,
      brainModel: 'sonnet',
      defaultModel: 'haiku',
      planning: 'structured',
      reasons: ['budget limited'],
    };
    expect(sr.mode).toBe('pro_plan');
    expect(sr.reasons).toHaveLength(1);
  });

  it('ProjectAnalysis can be constructed', () => {
    const pa: DirectProjectAnalysis = {
      framework: 'next',
      language: 'typescript',
      testFramework: 'vitest',
      buildTool: 'tsc',
      ci: 'github-actions',
      fileCount: 100,
      authorCount: 2,
      size: 'medium',
      methodology: 'sprint',
    };
    expect(pa.framework).toBe('next');
    expect(pa.size).toBe('medium');
  });
});


// ─── Test 7: Sprint domain types ────────────────────────────────────────────

describe('Sprint domain types via barrel', () => {
  it('PatternEntry can be constructed', () => {
    const pe: PatternEntry = {
      pattern: 'silent catch',
      occurrences: 3,
      firstDetectedInSprint: 'sprint-010',
      lastDetectedInSprint: 'sprint-012',
      resolved: false,
    };
    expect(pe.occurrences).toBe(3);
  });

  it('DecayResult can be constructed', () => {
    const dr: DecayResult = {
      linesBefore: 300,
      linesAfter: 200,
      archivedSprints: ['sprint-001'],
      removedDebtCount: 2,
      removedPatternCount: 1,
    };
    expect(dr.linesAfter).toBeLessThan(dr.linesBefore);
  });

  it('BrainContext can be constructed', () => {
    const bc: BrainContext = {
      directives: 'test directives',
      memory: 'test memory',
      retro: 'test retro',
      debt: [],
      patterns: '[]',
      decisions: '',
      existingTasks: [],
      projectState: { gitStatus: 'clean', fileTree: [] },
    };
    expect(bc.directives).toBe('test directives');
    expect(bc.existingTasks).toHaveLength(0);
  });

  it('SprintSizeRecommendation can be constructed', () => {
    const ssr: SprintSizeRecommendation = {
      size: 'reduced',
      maxWorkers: 2,
      modelConstraint: 'sonnet',
      reason: 'budget limited',
    };
    expect(ssr.size).toBe('reduced');
  });
});


// ─── Test 8: Monitoring domain types ────────────────────────────────────────

describe('Monitoring domain types via barrel', () => {
  it('Heartbeat can be constructed', () => {
    const hb: Heartbeat = {
      workerId: 'w-001',
      taskId: '001-001',
      status: AgentStatus.CODING,
      currentAction: 'writing code',
      timestamp: new Date().toISOString(),
      filesChangedCount: 3,
      sequence: 5,
      progress: 0.6,
    };
    expect(hb.status).toBe(AgentStatus.CODING);
    expect(hb.progress).toBe(0.6);
  });

  it('BoundaryViolation can be constructed', () => {
    const bv: BoundaryViolation = {
      type: 'file_outside_scope',
      agentId: 'w-002',
      detail: 'wrote to src/other.ts outside scope',
      timestamp: new Date().toISOString(),
    };
    expect(bv.type).toBe('file_outside_scope');
  });

  it('LockInfo can be constructed', () => {
    const lock: LockInfo = {
      filePath: 'src/core/types.ts',
      ownerWorkerId: 'w-001',
      acquiredAt: new Date().toISOString(),
      taskId: '001-001',
    };
    expect(lock.filePath).toBe('src/core/types.ts');
  });

  it('SkillMeta can be constructed', () => {
    const sm: SkillMeta = {
      name: 'test-skill',
      description: 'A test skill',
      version: '1.0.0',
      author: 'test',
      triggers: ['test'],
      model: 'haiku',
    };
    expect(sm.name).toBe('test-skill');
  });
});


// ─── Test 9: Subscription and Doctor types ──────────────────────────────────

describe('Subscription and Doctor types via barrel', () => {
  it('SubscriptionProfile can be constructed', () => {
    const sp: SubscriptionProfile = {
      detected: 'max',
      opusAvailable: true,
      testedAt: new Date().toISOString(),
      method: 'opus_probe',
    };
    expect(sp.detected).toBe('max');
    expect(sp.opusAvailable).toBe(true);
  });

  it('DoctorResult can be constructed', () => {
    const dr: DoctorResult = {
      ok: true,
      checks: [
        { name: 'tsc', passed: true, message: 'OK', required: true },
        { name: 'vitest', passed: false, message: 'missing', required: false },
      ],
    };
    expect(dr.ok).toBe(true);
    expect(dr.checks).toHaveLength(2);
  });

  it('StartOptions can be empty or fully specified', () => {
    const empty: StartOptions = {};
    const full: StartOptions = { autoApprove: true, sandboxMode: true };
    expect(empty.autoApprove).toBeUndefined();
    expect(full.autoApprove).toBe(true);
  });
});


// ─── Test 10: All exports are present (comprehensive check) ─────────────────

describe('Comprehensive export presence check', () => {
  it('all enum values are runtime-accessible from types.ts barrel', () => {
    // Runtime check — enums are values, not just types
    expect(TaskStatus).toBeDefined();
    expect(TaskEvaluation).toBeDefined();
    expect(AgentStatus).toBeDefined();
    expect(AlertLevel).toBeDefined();
    expect(SprintPhase).toBeDefined();
    expect(SprintStatus).toBeDefined();
    expect(DebtPriority).toBeDefined();
  });

  it('type-only exports compile correctly (TypeScript-level check)', () => {
    // These are compile-time checks — if this file compiles, the types exist.
    // We create instances to verify the type shapes.
    const usage: UsageMetrics = { fiveHourPercent: 50, weeklyPercent: 25, measuredAt: '' };
    const thresholds: UsageThresholds = { '5hr': 80, weekly: 70 };
    const profile: SystemProfile = { cpuCores: 4, totalMemMB: 8192, freeMemMB: 4096, recommendedMaxWorkers: 3 };

    expect(usage.fiveHourPercent).toBe(50);
    expect(thresholds['5hr']).toBe(80);
    expect(profile.cpuCores).toBe(4);
  });

  it('project analysis type aliases are available', () => {
    const fw: DetectedFramework = 'react';
    const lang: DetectedLanguage = 'typescript';
    const tf: DetectedTestFramework = 'vitest';
    const bt: DetectedBuildTool = 'tsc';
    const ci: DetectedCI = 'github-actions';
    const ps: ProjectSize = 'large';
    const mr: MethodologyRecommendation = 'hybrid';

    expect(fw).toBe('react');
    expect(lang).toBe('typescript');
    expect(tf).toBe('vitest');
    expect(bt).toBe('tsc');
    expect(ci).toBe('github-actions');
    expect(ps).toBe('large');
    expect(mr).toBe('hybrid');
  });
});
