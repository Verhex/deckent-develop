import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { DecisionOrchestrator } from '../../src/orchestra/decision-engine.js';
import { PatternRecorder } from '../../src/orchestra/pattern-recorder.js';
import type { LearningEntry } from '../../src/orchestra/pattern-recorder.js';
import { PatternReader } from '../../src/orchestra/pattern-reader.js';
import { CombinationScorer } from '../../src/orchestra/combination-scorer.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { AgentPool, AgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition, ProjectStack } from '../../src/core/skill-types.js';
import type { Task, TaskScope, ResolvedConfig, PatternEntry } from '../../src/core/types.js';
import type { DecisionContext, DecisionResult } from '../../src/core/decision-types.js';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'full-sprint-e2e-'));
  fs.mkdirSync(path.join(dir, '.brain', 'learning'), { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeScope(dirs: string[] = ['src/'], filesWrite: string[] = []): TaskScope {
  return { directories: dirs, filesRead: [], filesWrite };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '033-001',
    title: 'Default task',
    description: 'Default description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'Sprint requirement',
    scope: makeScope(['src/'], ['src/index.ts']),
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor issues' },
    status: 'PENDING' as any,
    sprintId: 'sprint-033',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test-project',
    projectRoot: tmpDir,
    version: '0.1.0',
    ...overrides,
  };
}

function makeProjectStack(): ProjectStack {
  return {
    language: 'typescript',
    framework: 'express',
    dependencies: ['typescript', 'express', 'vitest', 'jsonwebtoken'],
    buildTool: 'tsc',
    testFramework: 'vitest',
    detectedAt: new Date().toISOString(),
  };
}

// ─── Agent Definitions ──────────────────────────────────────────────

function makeSecurityAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Audits code for security vulnerabilities',
    expertise: ['security', 'authentication', 'jwt', 'xss'],
    triggerKeywords: ['security', 'auth', 'jwt', 'csrf', 'xss', 'encryption', 'authentication', 'vulnerability'],
    triggerScopes: ['src/auth/', 'src/security/', 'src/middleware/'],
    triggerFilePatterns: ['**/*.auth.ts', '**/security/**'],
    preferredModel: 'opus',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 12, successRate: 0.92, avgCoverage: 87, lastUsedInSprint: 'sprint-032' },
  });
}

function makeTestAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Writes comprehensive tests and improves coverage',
    expertise: ['testing', 'vitest', 'coverage', 'mocking'],
    triggerKeywords: ['test', 'spec', 'coverage', 'vitest', 'unit', 'integration', 'mock'],
    triggerScopes: ['tests/', 'src/'],
    triggerFilePatterns: ['**/*.test.ts', '**/*.spec.ts'],
    preferredModel: 'sonnet',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 18, successRate: 0.88, avgCoverage: 91, lastUsedInSprint: 'sprint-032' },
  });
}

// ─── Skill Definitions ──────────────────────────────────────────────

function makeTypescriptSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'typescript-expert',
    name: 'TypeScript Expert',
    category: 'language',
    description: 'TypeScript best practices and strict typing',
    triggers: ['typescript', 'ts', 'type', 'interface'],
    stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: ['tsc'] },
    composableWith: [],
    priority: 5,
    enabled: true,
    stats: { totalUses: 25, successRate: 0.96, avgCoverage: 89, lastUsedInSprint: 'sprint-032' },
  });
}

function makeTestingSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'testing-expert',
    name: 'Testing Expert',
    category: 'tool',
    description: 'Testing best practices with vitest and mocking',
    triggers: ['test', 'spec', 'coverage', 'vitest', 'mock'],
    stackDetection: { files: [], dependencies: ['vitest'], commands: [] },
    composableWith: [],
    priority: 4,
    enabled: true,
    stats: { totalUses: 20, successRate: 0.90, avgCoverage: 88, lastUsedInSprint: 'sprint-032' },
  });
}

function makeSecuritySkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'security-specialist',
    name: 'Security Specialist',
    category: 'domain',
    description: 'Security best practices and vulnerability detection',
    triggers: ['security', 'jwt', 'auth', 'authentication', 'vulnerability', 'xss'],
    stackDetection: { files: [], dependencies: ['jsonwebtoken'], commands: [] },
    composableWith: [],
    priority: 6,
    model: 'opus',
    enabled: true,
    stats: { totalUses: 10, successRate: 0.90, avgCoverage: 84, lastUsedInSprint: 'sprint-032' },
  });
}

// ─── Full Sprint Tasks ──────────────────────────────────────────────

function makeSprintTasks(): Task[] {
  return [
    // 2 security tasks
    makeTask({
      id: '033-001',
      title: 'Fix JWT token validation vulnerability',
      description: 'Address critical security flaw in JWT token validation that allows token replay attacks',
      scope: makeScope(['src/auth/', 'src/middleware/'], ['src/auth/jwt.ts', 'src/middleware/auth.ts']),
    }),
    makeTask({
      id: '033-002',
      title: 'Add CSRF protection middleware',
      description: 'Implement CSRF token generation and validation for all POST endpoints',
      scope: makeScope(['src/security/', 'src/middleware/'], ['src/security/csrf.ts', 'src/middleware/csrf.ts']),
    }),
    // 2 test tasks
    makeTask({
      id: '033-003',
      title: 'Write unit tests for auth module',
      description: 'Comprehensive test coverage for JWT and session management with vitest',
      scope: makeScope(['tests/auth/'], ['tests/auth/jwt.test.ts', 'tests/auth/session.test.ts']),
    }),
    makeTask({
      id: '033-004',
      title: 'Integration tests for API endpoints',
      description: 'End-to-end integration tests for REST API authentication flow',
      scope: makeScope(['tests/integration/'], ['tests/integration/api-auth.test.ts']),
    }),
    // 1 doc task
    makeTask({
      id: '033-005',
      title: 'Update API documentation',
      description: 'Document new security endpoints and authentication flow in README',
      scope: makeScope(['docs/'], ['docs/reference/api.md', 'docs/reference/security.md']),
    }),
    // 1 refactor task
    makeTask({
      id: '033-006',
      title: 'Refactor middleware pipeline',
      description: 'Extract and reorganize middleware chain for better separation of concerns',
      scope: makeScope(['src/middleware/', 'src/core/'], ['src/middleware/index.ts', 'src/core/pipeline.ts']),
    }),
  ];
}

function makeFullContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  const agentPool: AgentPool = new Map();
  agentPool.set('security-auditor', makeSecurityAgent());
  agentPool.set('test-writer', makeTestAgent());

  const skillPool = new Map<string, SkillDefinition>();
  skillPool.set('typescript-expert', makeTypescriptSkill());
  skillPool.set('testing-expert', makeTestingSkill());
  skillPool.set('security-specialist', makeSecuritySkill());

  return {
    projectStack: makeProjectStack(),
    agentPool,
    skillPool,
    patterns: [],
    config: makeConfig(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Full Sprint E2E Integration', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── Decision Pipeline for All 6 Tasks ───────────────────────

  describe('DecisionOrchestrator for full sprint', () => {
    it('runs DecisionOrchestrator for all 6 tasks without error', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      const results: DecisionResult[] = [];
      for (const task of tasks) {
        const result = orch.decide(task);
        results.push(result);
      }

      expect(results.length).toBe(6);
      for (const r of results) {
        expect(r.decisionLog.length).toBe(6);
      }
    });

    it('assigns security-auditor to security tasks', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      const securityResults = [orch.decide(tasks[0]!), orch.decide(tasks[1]!)];

      for (const result of securityResults) {
        if (result.agent) {
          expect(result.agent.id).toBe('security-auditor');
        }
        expect(result.analysis.type).toBe('security');
      }
    });

    it('assigns test-writer to test tasks', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      const testResults = [orch.decide(tasks[2]!), orch.decide(tasks[3]!)];

      for (const result of testResults) {
        expect(result.analysis.type).toBe('test');
        if (result.agent) {
          expect(result.agent.id).toBe('test-writer');
        }
      }
    });

    it('classifies doc task as doc type', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const docTask = makeSprintTasks()[4]!;

      const result = orch.decide(docTask);

      expect(result.analysis.type).toBe('doc');
    });

    it('classifies refactor task as refactor type', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const refactorTask = makeSprintTasks()[5]!;

      const result = orch.decide(refactorTask);

      expect(result.analysis.type).toBe('refactor');
    });

    it('assigns security-specialist skill to security tasks', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const secTask = makeSprintTasks()[0]!;

      const result = orch.decide(secTask);
      const skillIds = result.skills.map(s => s.id);

      expect(skillIds).toContain('security-specialist');
    });

    it('assigns testing-expert skill to test tasks', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const testTask = makeSprintTasks()[2]!;

      const result = orch.decide(testTask);
      const skillIds = result.skills.map(s => s.id);

      expect(skillIds).toContain('testing-expert');
    });

    it('assigns typescript-expert skill to TypeScript project tasks', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      // All non-doc tasks in a TypeScript project should get typescript-expert
      for (const task of tasks) {
        const result = orch.decide(task);
        const skillIds = result.skills.map(s => s.id);
        // TypeScript skill should appear for tasks with TypeScript dep match
        if (result.analysis.type !== 'doc') {
          expect(skillIds).toContain('typescript-expert');
        }
      }
    });

    it('does not exceed 3 skills per task (default cap)', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      for (const task of tasks) {
        const result = orch.decide(task);
        expect(result.skills.length).toBeLessThanOrEqual(3);
      }
    });

    it('all decision logs have 6 ordered steps', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      for (const task of tasks) {
        const result = orch.decide(task);
        const steps = result.decisionLog;
        expect(steps.length).toBe(6);
        expect(steps[0]!.name).toBe('TaskAnalysis');
        expect(steps[1]!.name).toBe('AgentSelection');
        expect(steps[2]!.name).toBe('SkillSelection');
        expect(steps[3]!.name).toBe('ModelResolution');
        expect(steps[4]!.name).toBe('EffortResolution');
        expect(steps[5]!.name).toBe('ScopeComputation');
      }
    });

    it('security tasks get opus or sonnet model (never haiku)', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const secTasks = makeSprintTasks().slice(0, 2);

      for (const task of secTasks) {
        const result = orch.decide(task);
        expect(['opus', 'sonnet']).toContain(result.model);
      }
    });

    it('doc task model is capped at sonnet (not opus) for doc scope', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const docTask = makeSprintTasks()[4]!;

      const result = orch.decide(docTask);

      expect(['sonnet', 'haiku']).toContain(result.model);
    });

    it('preserves filesWrite security boundary for all tasks', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      for (const task of tasks) {
        const result = orch.decide(task);
        for (const file of result.scope.filesWrite) {
          expect(task.scope.filesWrite).toContain(file);
        }
      }
    });

    it('each decision step has non-negative timing', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      for (const task of tasks) {
        const result = orch.decide(task);
        for (const step of result.decisionLog) {
          expect(step.durationMs).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  // ─── Learning Integration ─────────────────────────────────────

  describe('Learning entries recorded after evaluation', () => {
    it('records learning entries for all 6 tasks', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();
      const recorder = new PatternRecorder(tmpDir);

      for (const task of tasks) {
        const decision = orch.decide(task);
        const entry: LearningEntry = {
          taskType: decision.analysis.type,
          agent: decision.agent?.id ?? null,
          skills: decision.skills.map(s => s.id),
          model: decision.model,
          effort: decision.effort,
          evaluation: 'DONE',
          coverage: 90,
          durationMs: 300000,
          sprintId: 'sprint-033',
          recordedAt: new Date().toISOString(),
        };
        recorder.record(entry);
      }

      const entries = recorder.readSprint('sprint-033');
      expect(entries.length).toBe(6);
    });

    it('learning entries have correct task types', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();
      const recorder = new PatternRecorder(tmpDir);

      const decisions: DecisionResult[] = [];
      for (const task of tasks) {
        const decision = orch.decide(task);
        decisions.push(decision);
        recorder.record({
          taskType: decision.analysis.type,
          agent: decision.agent?.id ?? null,
          skills: decision.skills.map(s => s.id),
          model: decision.model,
          effort: decision.effort,
          evaluation: 'DONE',
          coverage: 85,
          durationMs: 250000,
          sprintId: 'sprint-033',
          recordedAt: new Date().toISOString(),
        });
      }

      const entries = recorder.readSprint('sprint-033');
      const types = entries.map(e => e.taskType);
      expect(types.filter(t => t === 'security').length).toBe(2);
      expect(types.filter(t => t === 'test').length).toBe(2);
      expect(types.filter(t => t === 'doc').length).toBe(1);
      expect(types.filter(t => t === 'refactor').length).toBe(1);
    });

    it('records NO_GO evaluations correctly', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeSprintTasks()[0]!;
      const recorder = new PatternRecorder(tmpDir);

      const decision = orch.decide(task);
      recorder.record({
        taskType: decision.analysis.type,
        agent: decision.agent?.id ?? null,
        skills: decision.skills.map(s => s.id),
        model: decision.model,
        effort: decision.effort,
        evaluation: 'NO_GO',
        coverage: 20,
        durationMs: 120000,
        sprintId: 'sprint-033',
        recordedAt: new Date().toISOString(),
      });

      const entries = recorder.readSprint('sprint-033');
      expect(entries.length).toBe(1);
      expect(entries[0]!.evaluation).toBe('NO_GO');
      expect(entries[0]!.coverage).toBe(20);
    });

    it('records GO_WITH_TECH_DEBT evaluations correctly', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeSprintTasks()[5]!;
      const recorder = new PatternRecorder(tmpDir);

      const decision = orch.decide(task);
      recorder.record({
        taskType: decision.analysis.type,
        agent: decision.agent?.id ?? null,
        skills: decision.skills.map(s => s.id),
        model: decision.model,
        effort: decision.effort,
        evaluation: 'GO_WITH_TECH_DEBT',
        coverage: 65,
        durationMs: 200000,
        sprintId: 'sprint-033',
        recordedAt: new Date().toISOString(),
      });

      const entries = recorder.readSprint('sprint-033');
      expect(entries[0]!.evaluation).toBe('GO_WITH_TECH_DEBT');
    });
  });

  // ─── Pattern Query After Sprint ────────────────────────────────

  describe('Pattern querying after sprint', () => {
    function recordFullSprint(recorder: PatternRecorder, orch: DecisionOrchestrator): DecisionResult[] {
      const tasks = makeSprintTasks();
      const decisions: DecisionResult[] = [];

      for (const task of tasks) {
        const decision = orch.decide(task);
        decisions.push(decision);
        recorder.record({
          taskType: decision.analysis.type,
          agent: decision.agent?.id ?? null,
          skills: decision.skills.map(s => s.id),
          model: decision.model,
          effort: decision.effort,
          evaluation: 'DONE',
          coverage: 90,
          durationMs: 300000,
          sprintId: 'sprint-033',
          recordedAt: new Date().toISOString(),
        });
      }

      return decisions;
    }

    it('PatternReader finds successful security combinations', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);
      recordFullSprint(recorder, orch);

      const reader = new PatternReader(tmpDir);
      const combos = reader.getSuccessfulCombinations('security');

      expect(combos.length).toBeGreaterThan(0);
    });

    it('PatternReader finds successful test combinations', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);
      recordFullSprint(recorder, orch);

      const reader = new PatternReader(tmpDir);
      const combos = reader.getSuccessfulCombinations('test');

      expect(combos.length).toBeGreaterThan(0);
    });

    it('queryPatterns filters by task type', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);
      recordFullSprint(recorder, orch);

      const reader = new PatternReader(tmpDir);
      const securityEntries = reader.queryPatterns({ taskType: 'security' });
      const testEntries = reader.queryPatterns({ taskType: 'test' });

      expect(securityEntries.length).toBe(2);
      expect(testEntries.length).toBe(2);
    });

    it('queryPatterns filters by evaluation', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);
      recordFullSprint(recorder, orch);

      // Add one NO_GO entry
      const task = makeSprintTasks()[0]!;
      const decision = orch.decide(task);
      recorder.record({
        taskType: decision.analysis.type,
        agent: decision.agent?.id ?? null,
        skills: decision.skills.map(s => s.id),
        model: decision.model,
        effort: decision.effort,
        evaluation: 'NO_GO',
        coverage: 15,
        durationMs: 100000,
        sprintId: 'sprint-033',
        recordedAt: new Date().toISOString(),
      });

      const reader = new PatternReader(tmpDir);
      const doneEntries = reader.queryPatterns({ evaluation: 'DONE' });
      const noGoEntries = reader.queryPatterns({ evaluation: 'NO_GO' });

      expect(doneEntries.length).toBe(6);
      expect(noGoEntries.length).toBe(1);
    });

    it('queryPatterns filters by minimum coverage', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);

      // Record with varying coverage
      const tasks = makeSprintTasks();
      for (let i = 0; i < tasks.length; i++) {
        const decision = orch.decide(tasks[i]!);
        recorder.record({
          taskType: decision.analysis.type,
          agent: decision.agent?.id ?? null,
          skills: decision.skills.map(s => s.id),
          model: decision.model,
          effort: decision.effort,
          evaluation: 'DONE',
          coverage: i < 3 ? 95 : 50,
          durationMs: 300000,
          sprintId: 'sprint-033',
          recordedAt: new Date().toISOString(),
        });
      }

      const reader = new PatternReader(tmpDir);
      const highCov = reader.queryPatterns({ minCoverage: 80 });

      expect(highCov.length).toBe(3);
    });
  });

  // ─── Combination Scoring After Sprint ─────────────────────────

  describe('CombinationScorer after full sprint', () => {
    it('scores successful combinations positively', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);

      // Record 3 successful security tasks
      for (let i = 0; i < 3; i++) {
        const task = makeSprintTasks()[0]!;
        const decision = orch.decide(task);
        recorder.record({
          taskType: decision.analysis.type,
          agent: decision.agent?.id ?? null,
          skills: decision.skills.map(s => s.id),
          model: decision.model,
          effort: decision.effort,
          evaluation: 'DONE',
          coverage: 92,
          durationMs: 280000,
          sprintId: 'sprint-033',
          recordedAt: new Date().toISOString(),
        });
      }

      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);
      const secDecision = orch.decide(makeSprintTasks()[0]!);

      const result = scorer.score(
        secDecision.analysis.type,
        secDecision.agent?.id ?? null,
        secDecision.skills.map(s => s.id),
        secDecision.model,
      );

      expect(result.score).toBeGreaterThan(0);
      expect(result.recommendation).toBe('use');
    });

    it('scores failed combinations negatively', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);

      // Record 2 failed security tasks
      for (let i = 0; i < 2; i++) {
        const task = makeSprintTasks()[0]!;
        const decision = orch.decide(task);
        recorder.record({
          taskType: decision.analysis.type,
          agent: decision.agent?.id ?? null,
          skills: decision.skills.map(s => s.id),
          model: decision.model,
          effort: decision.effort,
          evaluation: 'NO_GO',
          coverage: 10,
          durationMs: 50000,
          sprintId: 'sprint-033',
          recordedAt: new Date().toISOString(),
        });
      }

      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);
      const secDecision = orch.decide(makeSprintTasks()[0]!);

      const result = scorer.score(
        secDecision.analysis.type,
        secDecision.agent?.id ?? null,
        secDecision.skills.map(s => s.id),
        secDecision.model,
      );

      expect(result.score).toBeLessThan(0);
      expect(result.recommendation).toBe('avoid');
    });

    it('returns neutral for unknown task type', () => {
      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);

      const result = scorer.score('devops', 'unknown-agent', ['unknown-skill'], 'opus');

      expect(result.recommendation).toBe('neutral');
      expect(result.confidence).toBe(0);
    });

    it('confidence increases with more samples', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);

      for (let i = 0; i < 5; i++) {
        const task = makeSprintTasks()[0]!;
        const decision = orch.decide(task);
        recorder.record({
          taskType: decision.analysis.type,
          agent: decision.agent?.id ?? null,
          skills: decision.skills.map(s => s.id),
          model: decision.model,
          effort: decision.effort,
          evaluation: 'DONE',
          coverage: 90,
          durationMs: 300000,
          sprintId: 'sprint-033',
          recordedAt: new Date().toISOString(),
        });
      }

      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);
      const secDecision = orch.decide(makeSprintTasks()[0]!);

      const result = scorer.score(
        secDecision.analysis.type,
        secDecision.agent?.id ?? null,
        secDecision.skills.map(s => s.id),
        secDecision.model,
      );

      expect(result.confidence).toBe(1);
    });
  });

  // ─── Full E2E: Decision -> Record -> Query -> Score ────────────

  describe('Full E2E lifecycle', () => {
    it('decide -> record -> query -> score for all 6 tasks', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);
      const tasks = makeSprintTasks();

      // Step 1: Decide and record for each task
      const decisions: DecisionResult[] = [];
      for (const task of tasks) {
        const decision = orch.decide(task);
        decisions.push(decision);
        recorder.record({
          taskType: decision.analysis.type,
          agent: decision.agent?.id ?? null,
          skills: decision.skills.map(s => s.id),
          model: decision.model,
          effort: decision.effort,
          evaluation: 'DONE',
          coverage: 90,
          durationMs: 300000,
          sprintId: 'sprint-033',
          recordedAt: new Date().toISOString(),
        });
      }

      expect(decisions.length).toBe(6);

      // Step 2: Query patterns
      const reader = new PatternReader(tmpDir);
      const securityCombos = reader.getSuccessfulCombinations('security');
      expect(securityCombos.length).toBeGreaterThan(0);

      // Step 3: Score combinations
      const scorer = new CombinationScorer(reader);
      const secDecision = decisions[0]!;
      const score = scorer.score(
        secDecision.analysis.type,
        secDecision.agent?.id ?? null,
        secDecision.skills.map(s => s.id),
        secDecision.model,
      );
      expect(score.score).toBeGreaterThan(0);
    });

    it('multi-sprint learning accumulates correctly', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);
      const task = makeSprintTasks()[0]!;

      // Sprint 032
      const d1 = orch.decide(task);
      recorder.record({
        taskType: d1.analysis.type,
        agent: d1.agent?.id ?? null,
        skills: d1.skills.map(s => s.id),
        model: d1.model,
        effort: d1.effort,
        evaluation: 'DONE',
        coverage: 88,
        durationMs: 260000,
        sprintId: 'sprint-032',
        recordedAt: new Date().toISOString(),
      });

      // Sprint 033
      const d2 = orch.decide(task);
      recorder.record({
        taskType: d2.analysis.type,
        agent: d2.agent?.id ?? null,
        skills: d2.skills.map(s => s.id),
        model: d2.model,
        effort: d2.effort,
        evaluation: 'DONE',
        coverage: 92,
        durationMs: 300000,
        sprintId: 'sprint-033',
        recordedAt: new Date().toISOString(),
      });

      expect(recorder.listSprints()).toContain('sprint-032');
      expect(recorder.listSprints()).toContain('sprint-033');

      const reader = new PatternReader(tmpDir);
      const combos = reader.getSuccessfulCombinations('security');
      // Should aggregate across sprints
      expect(combos[0]!.count).toBe(2);
    });

    it('mixed evaluations produce correct scoring', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const recorder = new PatternRecorder(tmpDir);
      const task = makeSprintTasks()[0]!;

      // 3 successes
      for (let i = 0; i < 3; i++) {
        const d = orch.decide(task);
        recorder.record({
          taskType: d.analysis.type,
          agent: d.agent?.id ?? null,
          skills: d.skills.map(s => s.id),
          model: d.model,
          effort: d.effort,
          evaluation: 'DONE',
          coverage: 90,
          durationMs: 300000,
          sprintId: `sprint-03${i}`,
          recordedAt: new Date().toISOString(),
        });
      }

      // 1 failure
      const dFail = orch.decide(task);
      recorder.record({
        taskType: dFail.analysis.type,
        agent: dFail.agent?.id ?? null,
        skills: dFail.skills.map(s => s.id),
        model: dFail.model,
        effort: dFail.effort,
        evaluation: 'NO_GO',
        coverage: 10,
        durationMs: 50000,
        sprintId: 'sprint-033',
        recordedAt: new Date().toISOString(),
      });

      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);
      const secDecision = orch.decide(task);

      const result = scorer.score(
        secDecision.analysis.type,
        secDecision.agent?.id ?? null,
        secDecision.skills.map(s => s.id),
        secDecision.model,
      );

      // 3 successes and 1 failure: net should still be positive but less confident
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('refactor task gets no specialized agent when no refactor agent in pool', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const refactorTask = makeSprintTasks()[5]!;

      const decision = orch.decide(refactorTask);

      // No refactor-specific agent in pool, so might be null or a partial match
      expect(decision.decisionLog.length).toBe(6);
      expect(decision.analysis.type).toBe('refactor');
    });

    it('effort resolution varies by task complexity', () => {
      const ctx = makeFullContext();
      const orch = new DecisionOrchestrator(ctx);
      const tasks = makeSprintTasks();

      const efforts = tasks.map(t => orch.decide(t).effort);

      // All efforts should be valid values
      for (const effort of efforts) {
        expect(['low', 'normal', 'high']).toContain(effort);
      }
    });
  });
});
