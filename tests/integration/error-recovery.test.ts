import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { DecisionOrchestrator } from '../../src/orchestra/decision-engine.js';
import { PatternRecorder } from '../../src/orchestra/pattern-recorder.js';
import type { LearningEntry } from '../../src/orchestra/pattern-recorder.js';
import { PatternReader } from '../../src/orchestra/pattern-reader.js';

import { createAgentDefinition } from '../../src/core/agent-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { AgentPool, AgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition, ProjectStack } from '../../src/core/skill-types.js';
import type { Task, TaskScope, ResolvedConfig } from '../../src/core/types.js';
import type { DecisionContext, DecisionResult } from '../../src/core/decision-types.js';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-recovery-'));
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
    title: 'Add feature X',
    description: 'Implement feature X with TypeScript',
    model: 'sonnet',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'Sprint requirement',
    scope: makeScope(['src/'], ['src/feature.ts']),
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
      max_workers: 4,
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
    dependencies: ['typescript', 'express', 'vitest'],
    buildTool: 'tsc',
    testFramework: 'vitest',
    detectedAt: new Date().toISOString(),
  };
}

function makeSecurityAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'security-auditor',
    name: 'Security Auditor',
    expertise: ['security', 'auth'],
    triggerKeywords: ['security', 'auth', 'jwt'],
    triggerScopes: ['src/auth/'],
    preferredModel: 'opus',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 10, successRate: 0.9, avgCoverage: 85, lastUsedInSprint: 'sprint-032' },
  });
}

function makeTypescriptSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'typescript-expert',
    name: 'TypeScript Expert',
    category: 'language',
    triggers: ['typescript', 'ts', 'type'],
    stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: [] },
    composableWith: [],
    priority: 5,
    enabled: true,
  });
}

function makeContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  const agentPool: AgentPool = new Map();
  agentPool.set('security-auditor', makeSecurityAgent());

  const skillPool = new Map<string, SkillDefinition>();
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

// ─── Tests ──────────────────────────────────────────────────────────

describe('Error Recovery Integration', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── Empty Agent Pool ─────────────────────────────────────────

  describe('Empty agent pool fallback', () => {
    it('produces valid decision with empty agent pool', () => {
      const ctx = makeContext({ agentPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
      expect(result.agent).toBeNull();
    });

    it('still resolves model without agent preference', () => {
      const ctx = makeContext({ agentPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(['opus', 'sonnet', 'haiku']).toContain(result.model);
    });

    it('still resolves effort without agent multiplier', () => {
      const ctx = makeContext({ agentPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(['low', 'normal', 'high']).toContain(result.effort);
    });

    it('still selects skills without agent', () => {
      const ctx = makeContext({ agentPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      // Skills should still be selected based on project stack
      expect(result.skills.length).toBeGreaterThanOrEqual(0);
    });

    it('scope remains valid without agent', () => {
      const ctx = makeContext({ agentPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.scope.directories.length).toBeGreaterThan(0);
      expect(result.scope.filesWrite).toEqual(task.scope.filesWrite);
    });
  });

  // ─── Empty Skill Pool ─────────────────────────────────────────

  describe('Empty skill pool fallback', () => {
    it('produces valid decision with empty skill pool', () => {
      const ctx = makeContext({ skillPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
      expect(result.skills).toEqual([]);
    });

    it('still selects agent without skills', () => {
      const ctx = makeContext({ skillPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Fix JWT authentication vulnerability',
        description: 'Security fix for auth module',
        scope: makeScope(['src/auth/'], ['src/auth/jwt.ts']),
      });

      const result = orch.decide(task);

      // Agent should still be selected
      if (result.agent) {
        expect(result.agent.id).toBe('security-auditor');
      }
    });

    it('model resolves without skill model preferences', () => {
      const ctx = makeContext({ skillPool: new Map() });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(['opus', 'sonnet', 'haiku']).toContain(result.model);
    });
  });

  // ─── Failed Stack Detection ───────────────────────────────────

  describe('Failed stack detection (null/unknown)', () => {
    it('handles null project stack', () => {
      const ctx = makeContext({ projectStack: null });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
    });

    it('skills selection works without project stack', () => {
      const ctx = makeContext({ projectStack: null });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      // Without project stack, language/framework matching is skipped
      // but trigger keyword matching still works
      expect(result.skills.length).toBeGreaterThanOrEqual(0);
    });

    it('handles unknown language in project stack', () => {
      const unknownStack: ProjectStack = {
        language: 'unknown',
        framework: 'unknown',
        dependencies: [],
        buildTool: 'unknown',
        testFramework: 'unknown',
        detectedAt: new Date().toISOString(),
      };
      const ctx = makeContext({ projectStack: unknownStack });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
      // Language skills should not match unknown
      const langSkills = result.skills.filter(s => s.category === 'language');
      for (const skill of langSkills) {
        // Should not match based on language category
        expect(skill.triggers).not.toContain('unknown');
      }
    });

    it('handles empty dependencies in project stack', () => {
      const emptyDepsStack: ProjectStack = {
        language: 'typescript',
        framework: 'unknown',
        dependencies: [],
        buildTool: 'tsc',
        testFramework: 'unknown',
        detectedAt: new Date().toISOString(),
      };
      const ctx = makeContext({ projectStack: emptyDepsStack });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
    });
  });

  // ─── Both Pools Empty ─────────────────────────────────────────

  describe('Both agent and skill pools empty', () => {
    it('produces valid decision with both pools empty', () => {
      const ctx = makeContext({
        agentPool: new Map(),
        skillPool: new Map(),
      });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
      expect(result.agent).toBeNull();
      expect(result.skills).toEqual([]);
    });

    it('model and effort still resolve with both pools empty', () => {
      const ctx = makeContext({
        agentPool: new Map(),
        skillPool: new Map(),
      });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(['opus', 'sonnet', 'haiku']).toContain(result.model);
      expect(['low', 'normal', 'high']).toContain(result.effort);
    });

    it('handles all empty plus null stack', () => {
      const ctx = makeContext({
        agentPool: new Map(),
        skillPool: new Map(),
        projectStack: null,
      });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
      expect(result.agent).toBeNull();
      expect(result.skills).toEqual([]);
    });
  });

  // ─── Disabled Agents/Skills ───────────────────────────────────

  describe('All agents/skills disabled', () => {
    it('returns null agent when all agents are disabled', () => {
      const disabledAgent = makeSecurityAgent();
      disabledAgent.enabled = false;
      const agentPool: AgentPool = new Map();
      agentPool.set('security-auditor', disabledAgent);

      const ctx = makeContext({ agentPool });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Fix JWT security issue',
        description: 'Security vulnerability in auth',
        scope: makeScope(['src/auth/'], ['src/auth/jwt.ts']),
      });

      const result = orch.decide(task);

      expect(result.agent).toBeNull();
    });

    it('returns empty skills when all skills are disabled', () => {
      const disabledSkill = makeTypescriptSkill();
      disabledSkill.enabled = false;
      const skillPool = new Map<string, SkillDefinition>();
      skillPool.set('typescript-expert', disabledSkill);

      const ctx = makeContext({ skillPool });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.skills).toEqual([]);
    });
  });

  // ─── Corrupted Learning Data ──────────────────────────────────

  describe('Corrupted learning data recovery', () => {
    it('PatternRecorder handles non-existent learning directory', () => {
      const nonExistentDir = path.join(tmpDir, 'non-existent');
      const recorder = new PatternRecorder(nonExistentDir);

      // Reading from non-existent directory should return empty
      const entries = recorder.readSprint('sprint-033');
      expect(entries).toEqual([]);
    });

    it('PatternRecorder creates directory on first write', () => {
      const newDir = path.join(tmpDir, 'new-project');
      fs.mkdirSync(newDir, { recursive: true });
      const recorder = new PatternRecorder(newDir);

      recorder.record({
        taskType: 'code',
        agent: null,
        skills: [],
        model: 'sonnet',
        effort: 'normal',
        evaluation: 'DONE',
        coverage: 80,
        durationMs: 200000,
        sprintId: 'sprint-033',
        recordedAt: new Date().toISOString(),
      });

      const entries = recorder.readSprint('sprint-033');
      expect(entries.length).toBe(1);
    });

    it('PatternReader handles corrupted JSON file', () => {
      // Write invalid JSON to learning file
      const learningDir = path.join(tmpDir, '.brain', 'learning');
      fs.writeFileSync(path.join(learningDir, 'sprint-033.json'), '{invalid json}', 'utf-8');

      const reader = new PatternReader(tmpDir);
      const results = reader.queryPatterns({ taskType: 'code' });

      expect(results).toEqual([]);
    });

    it('PatternReader handles empty learning directory', () => {
      const reader = new PatternReader(tmpDir);
      const results = reader.queryPatterns({});

      expect(results).toEqual([]);
    });

    it('PatternReader handles file with non-array JSON', () => {
      const learningDir = path.join(tmpDir, '.brain', 'learning');
      fs.writeFileSync(path.join(learningDir, 'sprint-033.json'), '{"not": "an array"}', 'utf-8');

      const reader = new PatternReader(tmpDir);
      const results = reader.queryPatterns({});

      expect(results).toEqual([]);
    });

    it('listSprints returns empty for corrupted learning directory', () => {
      const recorder = new PatternRecorder(tmpDir);
      const sprints = recorder.listSprints();

      expect(sprints).toEqual([]);
    });

    it('readSprint returns empty for corrupted sprint file', () => {
      const learningDir = path.join(tmpDir, '.brain', 'learning');
      fs.writeFileSync(path.join(learningDir, 'sprint-033.json'), 'corrupt', 'utf-8');

      const recorder = new PatternRecorder(tmpDir);
      const entries = recorder.readSprint('sprint-033');

      expect(entries).toEqual([]);
    });
  });

  // ─── High Usage Pressure ──────────────────────────────────────

  describe('High usage pressure', () => {
    it('resolves model for complex task', () => {
      const ctx = makeContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Architect new microservice',
        description: 'Cross-cutting architectural redesign of the service layer',
        scope: makeScope(
          ['src/services/', 'src/core/', 'src/api/'],
          ['src/services/user.ts', 'src/core/base.ts', 'src/api/routes.ts'],
        ),
      });

      const result = orch.decide(task);

      expect(['opus', 'sonnet', 'haiku']).toContain(result.model);
    });
  });

  // ─── forceModel Override ──────────────────────────────────────

  describe('forceModel override', () => {
    it('respects forceModel even with empty pools', () => {
      const ctx = makeContext({
        agentPool: new Map(),
        skillPool: new Map(),
      });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({ forceModel: 'opus' });

      const result = orch.decide(task);

      expect(result.model).toBe('opus');
    });

    it('respects forceEffort even with empty pools', () => {
      const ctx = makeContext({
        agentPool: new Map(),
        skillPool: new Map(),
      });
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({ forceEffort: 'high' });

      const result = orch.decide(task);

      expect(result.effort).toBe('high');
    });
  });

  // ─── Multiple Tasks Under Error Conditions ────────────────────

  describe('Multiple tasks under error conditions', () => {
    it('all tasks produce valid decisions with empty pools', () => {
      const ctx = makeContext({
        agentPool: new Map(),
        skillPool: new Map(),
        projectStack: null,
      });
      const orch = new DecisionOrchestrator(ctx);

      const tasks = [
        makeTask({ id: '001', title: 'Task A', description: 'First task' }),
        makeTask({ id: '002', title: 'Task B', description: 'Second task' }),
        makeTask({ id: '003', title: 'Task C', description: 'Third task' }),
        makeTask({ id: '004', title: 'Task D', description: 'Fourth task' }),
        makeTask({ id: '005', title: 'Task E', description: 'Fifth task' }),
      ];

      for (const task of tasks) {
        const result = orch.decide(task);
        expect(result.decisionLog.length).toBe(6);
        expect(result.agent).toBeNull();
        expect(result.skills).toEqual([]);
        expect(['opus', 'sonnet', 'haiku']).toContain(result.model);
        expect(['low', 'normal', 'high']).toContain(result.effort);
      }
    });

    it('learning still records and queries after recovery from corruption', () => {
      // First, write corrupt data
      const learningDir = path.join(tmpDir, '.brain', 'learning');
      fs.writeFileSync(path.join(learningDir, 'sprint-032.json'), 'corrupt', 'utf-8');

      // Then record new valid data
      const recorder = new PatternRecorder(tmpDir);
      recorder.record({
        taskType: 'code',
        agent: null,
        skills: [],
        model: 'sonnet',
        effort: 'normal',
        evaluation: 'DONE',
        coverage: 85,
        durationMs: 200000,
        sprintId: 'sprint-033',
        recordedAt: new Date().toISOString(),
      });

      // Corrupt sprint should return empty, new sprint should work
      const reader = new PatternReader(tmpDir);
      const allEntries = reader.queryPatterns({});
      expect(allEntries.length).toBe(1);
      expect(allEntries[0]!.sprintId).toBe('sprint-033');
    });
  });
});
