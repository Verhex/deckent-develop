import { describe, it, expect } from 'vitest';
import { DecisionOrchestrator } from '../../src/orchestra/decision-engine.js';
import type { Task, TaskScope, ResolvedConfig, PatternEntry } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import type { AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { DecisionContext } from '../../src/core/decision-types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...overrides,
  };
}

function makeScope(dirs: string[] = [], filesWrite: string[] = [], filesRead: string[] = []): TaskScope {
  return { directories: dirs, filesRead, filesWrite };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '031-001',
    title: 'Implement feature',
    description: 'Build the feature module',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Sprint requirement',
    scope: makeScope(['src/core/']),
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-031',
    ...overrides,
  };
}

function makeContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    projectStack: null,
    agentPool: new Map() as AgentPool,
    skillPool: new Map<string, SkillDefinition>(),
    patterns: [],
    config: makeConfig(),
    ...overrides,
  };
}

// ─── DecisionOrchestrator.decide — basic flow ──────────────────────────────

describe('DecisionOrchestrator.decide — basic flow', () => {
  it('returns a DecisionResult with all fields', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.analysis).toBeDefined();
    expect(result.agent).toBeDefined();
    expect(result.skills).toBeDefined();
    expect(result.model).toBeDefined();
    expect(result.effort).toBeDefined();
    expect(result.scope).toBeDefined();
    expect(result.decisionLog).toBeDefined();
  });

  it('produces 6 decision log entries', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.decisionLog).toHaveLength(6);
  });

  it('log entries have sequential step numbers 1-6', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    for (let i = 0; i < 6; i++) {
      expect(result.decisionLog[i].step).toBe(i + 1);
    }
  });

  it('step 1 is TaskAnalysis', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.decisionLog[0].name).toBe('TaskAnalysis');
  });

  it('step 2 is AgentSelection', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.decisionLog[1].name).toBe('AgentSelection');
  });

  it('step 3 is SkillSelection', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.decisionLog[2].name).toBe('SkillSelection');
  });

  it('step 4 is ModelResolution', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.decisionLog[3].name).toBe('ModelResolution');
  });

  it('step 5 is EffortResolution', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.decisionLog[4].name).toBe('EffortResolution');
  });

  it('step 6 is ScopeComputation', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.decisionLog[5].name).toBe('ScopeComputation');
  });
});

// ─── DecisionOrchestrator.decide — analysis ────────────────────────────────

describe('DecisionOrchestrator.decide — analysis', () => {
  it('detects test task type', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask({ title: 'Write unit tests', description: 'Add test coverage' }));
    expect(result.analysis.type).toBe('test');
  });

  it('detects security task type', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask({ title: 'Fix auth bypass', description: 'JWT validation' }));
    expect(result.analysis.type).toBe('security');
  });

  it('defaults to code type', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask({ title: 'Build dashboard', description: 'User interface' }));
    expect(result.analysis.type).toBe('code');
  });
});

// ─── DecisionOrchestrator.decide — agent selection ─────────────────────────

describe('DecisionOrchestrator.decide — agent selection', () => {
  it('returns null agent when pool is empty', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask());
    expect(result.agent).toBeNull();
  });

  it('selects matching agent from pool', () => {
    const pool: AgentPool = new Map();
    pool.set('test-writer', createAgentDefinition({
      id: 'test-writer',
      name: 'Test Writer',
      triggerKeywords: ['test', 'spec', 'coverage'],
      triggerScopes: ['tests/'],
    }));
    const ctx = makeContext({ agentPool: pool });
    const engine = new DecisionOrchestrator(ctx);
    const result = engine.decide(makeTask({
      title: 'Write test coverage',
      description: 'Add spec files',
      scope: makeScope(['tests/core/']),
    }));
    expect(result.agent).not.toBeNull();
    expect(result.agent?.id).toBe('test-writer');
  });
});

// ─── DecisionOrchestrator.decide — effort ──────────────────────────────────

describe('DecisionOrchestrator.decide — effort', () => {
  it('returns low effort for low complexity', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask({
      title: 'Tiny fix',
      description: 'Simple stub placeholder',
      scope: makeScope(['src/']),
    }));
    expect(result.effort).toBe('low');
  });

  it('respects forceEffort override', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask({ forceEffort: 'high' }));
    expect(result.effort).toBe('high');
  });
});

// ─── DecisionOrchestrator.decide — model ───────────────────────────────────

describe('DecisionOrchestrator.decide — model', () => {
  it('respects forceModel override', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask({ forceModel: 'opus' }));
    expect(result.model).toBe('opus');
  });

  it('selects sonnet by default for normal tasks', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const result = engine.decide(makeTask({ scope: makeScope(['src/', 'tests/']) }));
    expect(['sonnet', 'opus']).toContain(result.model);
  });
});

// ─── DecisionOrchestrator.decide — scope merge ─────────────────────────────

describe('DecisionOrchestrator.decide — scope merge', () => {
  it('preserves task directories when no agent', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const scope = makeScope(['src/core/', 'src/cli/']);
    const result = engine.decide(makeTask({ scope }));
    expect(result.scope.directories).toContain('src/core/');
    expect(result.scope.directories).toContain('src/cli/');
  });

  it('preserves task filesWrite (security boundary)', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const scope = makeScope(['src/'], ['src/a.ts', 'src/b.ts']);
    const result = engine.decide(makeTask({ scope }));
    expect(result.scope.filesWrite).toContain('src/a.ts');
    expect(result.scope.filesWrite).toContain('src/b.ts');
  });
});
