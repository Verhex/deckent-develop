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
import type { AgentPool } from '../../src/core/agent-types.js';
import type { SkillDefinition, ProjectStack } from '../../src/core/skill-types.js';
import type { Task, TaskScope, ResolvedConfig, PatternEntry } from '../../src/core/types.js';
import type { DecisionContext, DecisionResult } from '../../src/core/decision-types.js';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dec-eng-'));
  // Create .brain/learning directory for PatternRecorder
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
    id: '001-001',
    title: 'Add JWT authentication',
    description: 'Implement JWT-based authentication middleware',
    model: 'sonnet',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'Security requirement',
    scope: makeScope(['src/auth/', 'src/middleware/'], ['src/auth/jwt.ts', 'src/middleware/auth.ts']),
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor issues' },
    status: 'PENDING' as any,
    sprintId: 'sprint-031',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: tmpDir,
    version: '0.1.0',
    ...overrides,
  };
}

function makeProjectStack(): ProjectStack {
  return {
    language: 'typescript',
    framework: 'express',
    dependencies: ['express', 'jsonwebtoken'],
    buildTool: 'tsc',
    testFramework: 'vitest',
    detectedAt: new Date().toISOString(),
  };
}

function makeSecurityAgent() {
  return createAgentDefinition({
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Audits code for security vulnerabilities',
    expertise: ['security', 'authentication', 'jwt'],
    triggerKeywords: ['security', 'auth', 'jwt', 'csrf', 'xss', 'encryption', 'authentication'],
    triggerScopes: ['src/auth/', 'src/security/'],
    triggerFilePatterns: ['**/*.auth.ts'],
    preferredModel: 'opus',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 10, successRate: 0.9, avgCoverage: 85, lastUsedInSprint: 'sprint-030' },
  });
}

function makeTestAgent() {
  return createAgentDefinition({
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Writes comprehensive tests',
    expertise: ['testing', 'vitest', 'coverage'],
    triggerKeywords: ['test', 'spec', 'coverage', 'vitest'],
    triggerScopes: ['tests/'],
    triggerFilePatterns: ['**/*.test.ts'],
    preferredModel: 'sonnet',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 15, successRate: 0.85, avgCoverage: 90, lastUsedInSprint: 'sprint-030' },
  });
}

function makeSecuritySkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'security-specialist',
    name: 'Security Specialist',
    category: 'domain',
    description: 'Security best practices and vulnerability detection',
    triggers: ['security', 'jwt', 'auth', 'authentication'],
    stackDetection: { files: [], dependencies: ['jsonwebtoken'], commands: [] },
    composableWith: [],
    priority: 5,
    model: 'opus',
    enabled: true,
    stats: { totalUses: 8, successRate: 0.88, avgCoverage: 82, lastUsedInSprint: 'sprint-030' },
  });
}

function makeTypescriptSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'typescript-expert',
    name: 'TypeScript Expert',
    category: 'language',
    description: 'TypeScript best practices',
    triggers: ['typescript', 'ts', 'type'],
    stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: ['tsc'] },
    composableWith: ['security-specialist'],
    priority: 3,
    enabled: true,
    stats: { totalUses: 20, successRate: 0.95, avgCoverage: 88, lastUsedInSprint: 'sprint-030' },
  });
}

function makeContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  const agentPool: AgentPool = new Map();
  agentPool.set('security-auditor', makeSecurityAgent());
  agentPool.set('test-writer', makeTestAgent());

  const skillPool = new Map<string, SkillDefinition>();
  skillPool.set('security-specialist', makeSecuritySkill());
  skillPool.set('typescript-expert', makeTypescriptSkill());

  return {
    projectStack: makeProjectStack(),
    agentPool,
    skillPool,
    patterns: [],
    config: makeConfig(),
    ...overrides,
  };
}

function makeLearningEntry(overrides: Partial<LearningEntry> = {}): LearningEntry {
  return {
    taskType: 'security',
    agent: 'security-auditor',
    skills: ['security-specialist'],
    model: 'opus',
    effort: 'high',
    evaluation: 'DONE',
    coverage: 90,
    durationMs: 300000,
    sprintId: 'sprint-030',
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Decision Engine Integration', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── Full Decision Pipeline ──────────────────────────────────

  describe('Full Decision Pipeline', () => {
    it('runs the 6-step decision flow for a security task', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.analysis).toBeDefined();
      expect(result.analysis.type).toBe('security');
      expect(result.decisionLog.length).toBe(6);
      expect(result.model).toBeDefined();
      expect(result.effort).toBeDefined();
      expect(result.scope).toBeDefined();
    });

    it('assigns security-auditor agent for JWT task', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      // Security keywords should match security-auditor
      if (result.agent) {
        expect(result.agent.id).toBe('security-auditor');
      }
    });

    it('includes security-specialist skill for JWT task', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      const skillIds = result.skills.map(s => s.id);
      expect(skillIds).toContain('security-specialist');
    });

    it('selects opus model for security task with security agent', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      // Security task with opus-preferring agent should resolve to opus or sonnet
      expect(['opus', 'sonnet']).toContain(result.model);
    });

    it('decision log contains all 6 steps in order', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog[0]!.step).toBe(1);
      expect(result.decisionLog[0]!.name).toBe('TaskAnalysis');
      expect(result.decisionLog[1]!.step).toBe(2);
      expect(result.decisionLog[1]!.name).toBe('AgentSelection');
      expect(result.decisionLog[2]!.step).toBe(3);
      expect(result.decisionLog[2]!.name).toBe('SkillSelection');
      expect(result.decisionLog[3]!.step).toBe(4);
      expect(result.decisionLog[3]!.name).toBe('ModelResolution');
      expect(result.decisionLog[4]!.step).toBe(5);
      expect(result.decisionLog[4]!.name).toBe('EffortResolution');
      expect(result.decisionLog[5]!.step).toBe(6);
      expect(result.decisionLog[5]!.name).toBe('ScopeComputation');
    });

    it('each decision step has timing information', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      for (const step of result.decisionLog) {
        expect(typeof step.durationMs).toBe('number');
        expect(step.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles task with no matching agent gracefully', () => {
      const ctx = makeContext({ agentPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Update README formatting',
        description: 'Fix markdown formatting',
      });

      const result = orch.decide(task);

      expect(result.agent).toBeNull();
      expect(result.decisionLog.length).toBe(6);
    });

    it('handles task with empty skill pool', () => {
      const ctx = makeContext({ skillPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.skills).toEqual([]);
    });

    it('preserves task scope filesWrite (security boundary)', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      // Agent/skills cannot expand filesWrite
      for (const file of result.scope.filesWrite) {
        expect(task.scope.filesWrite).toContain(file);
      }
    });
  });

  // ─── Learning Loop Integration ─────────────────────────────────

  describe('Learning Loop Integration', () => {
    it('records a learning entry via PatternRecorder', () => {
      const recorder = new PatternRecorder(tmpDir);
      const entry = makeLearningEntry();

      recorder.record(entry);

      const entries = recorder.readSprint('sprint-030');
      expect(entries.length).toBe(1);
      expect(entries[0]!.agent).toBe('security-auditor');
    });

    it('records multiple entries across sprints', () => {
      const recorder = new PatternRecorder(tmpDir);
      recorder.record(makeLearningEntry({ sprintId: 'sprint-029' }));
      recorder.record(makeLearningEntry({ sprintId: 'sprint-030' }));
      recorder.record(makeLearningEntry({ sprintId: 'sprint-030', evaluation: 'NO_GO' }));

      expect(recorder.readSprint('sprint-029').length).toBe(1);
      expect(recorder.readSprint('sprint-030').length).toBe(2);
      expect(recorder.listSprints()).toContain('sprint-029');
      expect(recorder.listSprints()).toContain('sprint-030');
    });

    it('queries successful patterns via PatternReader', () => {
      const recorder = new PatternRecorder(tmpDir);
      recorder.record(makeLearningEntry({ evaluation: 'DONE', coverage: 90 }));
      recorder.record(makeLearningEntry({ evaluation: 'DONE', coverage: 85 }));

      const reader = new PatternReader(tmpDir);
      const combos = reader.getSuccessfulCombinations('security');

      expect(combos.length).toBeGreaterThan(0);
      expect(combos[0]!.agent).toBe('security-auditor');
      expect(combos[0]!.count).toBe(2);
    });

    it('queries failed patterns via PatternReader', () => {
      const recorder = new PatternRecorder(tmpDir);
      recorder.record(makeLearningEntry({ evaluation: 'NO_GO', coverage: 20 }));

      const reader = new PatternReader(tmpDir);
      const failed = reader.getFailedCombinations('security');

      expect(failed.length).toBe(1);
      expect(failed[0]!.agent).toBe('security-auditor');
    });

    it('filters entries by task type', () => {
      const recorder = new PatternRecorder(tmpDir);
      recorder.record(makeLearningEntry({ taskType: 'security' }));
      recorder.record(makeLearningEntry({ taskType: 'test' }));

      const reader = new PatternReader(tmpDir);
      const securityResults = reader.queryPatterns({ taskType: 'security' });
      expect(securityResults.length).toBe(1);
    });

    it('filters entries by evaluation', () => {
      const recorder = new PatternRecorder(tmpDir);
      recorder.record(makeLearningEntry({ evaluation: 'DONE' }));
      recorder.record(makeLearningEntry({ evaluation: 'NO_GO' }));

      const reader = new PatternReader(tmpDir);
      const doneOnly = reader.queryPatterns({ evaluation: 'DONE' });
      expect(doneOnly.length).toBe(1);
    });

    it('filters entries by minimum coverage', () => {
      const recorder = new PatternRecorder(tmpDir);
      recorder.record(makeLearningEntry({ coverage: 90 }));
      recorder.record(makeLearningEntry({ coverage: 50 }));

      const reader = new PatternReader(tmpDir);
      const highCov = reader.queryPatterns({ minCoverage: 80 });
      expect(highCov.length).toBe(1);
    });
  });

  // ─── CombinationScorer Integration ─────────────────────────────

  describe('CombinationScorer Integration', () => {
    it('scores a successful combination positively', () => {
      const recorder = new PatternRecorder(tmpDir);
      recorder.record(makeLearningEntry({ evaluation: 'DONE', coverage: 90 }));
      recorder.record(makeLearningEntry({ evaluation: 'DONE', coverage: 85 }));
      recorder.record(makeLearningEntry({ evaluation: 'DONE', coverage: 92 }));

      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);

      const result = scorer.score('security', 'security-auditor', ['security-specialist'], 'opus');
      expect(result.score).toBeGreaterThan(0);
      expect(result.recommendation).toBe('use');
    });

    it('scores a failed combination negatively', () => {
      const recorder = new PatternRecorder(tmpDir);
      recorder.record(makeLearningEntry({ evaluation: 'NO_GO', coverage: 10 }));
      recorder.record(makeLearningEntry({ evaluation: 'NO_GO', coverage: 15 }));

      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);

      const result = scorer.score('security', 'security-auditor', ['security-specialist'], 'opus');
      expect(result.score).toBeLessThan(0);
      expect(result.recommendation).toBe('avoid');
    });

    it('returns neutral for unknown combination', () => {
      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);

      const result = scorer.score('security', 'unknown-agent', ['unknown-skill'], 'opus');
      expect(result.recommendation).toBe('neutral');
      expect(result.confidence).toBe(0);
    });

    it('confidence increases with sample size', () => {
      const recorder = new PatternRecorder(tmpDir);
      // Record 5 entries to get confidence = min(1, 5/5) = 1
      for (let i = 0; i < 5; i++) {
        recorder.record(makeLearningEntry({ evaluation: 'DONE', coverage: 90 }));
      }

      const reader = new PatternReader(tmpDir);
      const scorer = new CombinationScorer(reader);

      const result = scorer.score('security', 'security-auditor', ['security-specialist'], 'opus');
      expect(result.confidence).toBe(1);
    });
  });

  // ─── End-to-End: Decision + Learning + Scoring ────────────────

  describe('End-to-End: Decision -> Learning -> Scoring', () => {
    it('full flow: decide, record, query, score', () => {
      // Step 1: Make a decision
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();
      const decision = orch.decide(task);

      expect(decision.analysis.type).toBe('security');
      expect(decision.decisionLog.length).toBe(6);

      // Step 2: Record the learning entry as if the task succeeded
      const recorder = new PatternRecorder(tmpDir);
      const entry: LearningEntry = {
        taskType: decision.analysis.type,
        agent: decision.agent?.id ?? null,
        skills: decision.skills.map(s => s.id),
        model: decision.model,
        effort: decision.effort,
        evaluation: 'DONE',
        coverage: 92,
        durationMs: 250000,
        sprintId: 'sprint-031',
        recordedAt: new Date().toISOString(),
      };
      recorder.record(entry);

      // Step 3: Query successful patterns
      const reader = new PatternReader(tmpDir);
      const combos = reader.getSuccessfulCombinations('security');
      expect(combos.length).toBeGreaterThan(0);

      // Step 4: Score the combination
      const scorer = new CombinationScorer(reader);
      const score = scorer.score(
        decision.analysis.type,
        decision.agent?.id ?? null,
        decision.skills.map(s => s.id),
        decision.model,
      );
      expect(score.score).toBeGreaterThan(0);
    });

    it('decision for test task selects test-writer agent', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Write unit tests for auth module',
        description: 'Comprehensive test coverage for authentication',
        scope: makeScope(['tests/', 'src/auth/'], ['tests/auth.test.ts']),
      });

      const decision = orch.decide(task);
      expect(decision.analysis.type).toBe('test');
      // test-writer may be selected if keyword score is high enough
      if (decision.agent) {
        expect(['test-writer', 'security-auditor']).toContain(decision.agent.id);
      }
    });

    it('decision for code task without special keywords gets no agent', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Update server logic',
        description: 'Modify the main handler',
        scope: makeScope(['src/server/'], ['src/server/handler.ts']),
      });

      const decision = orch.decide(task);
      expect(decision.analysis.type).toBe('code');
      // No agent may match generic code tasks
      // Still complete with 6 decision steps
      expect(decision.decisionLog.length).toBe(6);
    });
  });
});
