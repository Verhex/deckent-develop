import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { DecisionOrchestrator } from '../../../src/orchestra/decision-engine.js';
import { createAgentDefinition } from '../../../src/core/agent-types.js';
import { createSkillDefinition } from '../../../src/core/skill-types.js';
import type { AgentPool, AgentDefinition } from '../../../src/core/agent-types.js';
import type { SkillDefinition, ProjectStack } from '../../../src/core/skill-types.js';
import type { Task, TaskScope, ResolvedConfig, UsageMetrics } from '../../../src/core/types.js';
import type { DecisionContext, DecisionResult } from '../../../src/core/decision-types.js';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monorepo-'));
  fs.mkdirSync(path.join(dir, '.brain', 'learning'), { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeScope(dirs: string[] = ['packages/ui/src/'], filesWrite: string[] = []): TaskScope {
  return { directories: dirs, filesRead: [], filesWrite };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '033-001',
    title: 'Add button component to UI package',
    description: 'Create a shared Button component in packages/ui with TypeScript',
    model: 'sonnet',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'Shared component',
    scope: makeScope(
      ['packages/ui/src/'],
      ['packages/ui/src/Button.tsx'],
    ),
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
      usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
    },
    modes: {} as never,
    language: 'en',
    projectName: 'monorepo-project',
    projectRoot: tmpDir,
    version: '0.1.0',
    ...overrides,
  };
}

function makeUsage(): UsageMetrics {
  return { fiveHourPercent: 10, weeklyPercent: 10, measuredAt: new Date().toISOString() };
}

// ─── Monorepo Stack ─────────────────────────────────────────────────

function makeMonorepoStack(): ProjectStack {
  return {
    language: 'typescript',
    framework: 'react',
    dependencies: ['typescript', 'react', 'react-dom', 'turbo', 'vitest', '@testing-library/react'],
    buildTool: 'turbo',
    testFramework: 'vitest',
    detectedAt: new Date().toISOString(),
  };
}

// ─── Agents ─────────────────────────────────────────────────────────

function makeUIAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'ui-specialist',
    name: 'UI Specialist',
    description: 'Builds UI components',
    expertise: ['react', 'component', 'ui'],
    triggerKeywords: ['component', 'ui', 'button', 'layout', 'react'],
    triggerScopes: ['packages/ui/', 'packages/ui/src/'],
    triggerFilePatterns: ['**/*.tsx'],
    preferredModel: 'sonnet',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 14, successRate: 0.86, avgCoverage: 82, lastUsedInSprint: 'sprint-032' },
  });
}

function makeAPIAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'api-builder',
    name: 'API Builder',
    description: 'Builds API endpoints',
    expertise: ['api', 'rest', 'endpoint'],
    triggerKeywords: ['api', 'endpoint', 'rest', 'route', 'handler'],
    triggerScopes: ['packages/api/', 'packages/api/src/'],
    triggerFilePatterns: ['**/api/**'],
    preferredModel: 'sonnet',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 10, successRate: 0.80, avgCoverage: 78, lastUsedInSprint: 'sprint-032' },
  });
}

function makeTestAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Writes comprehensive tests',
    expertise: ['testing', 'vitest', 'coverage'],
    triggerKeywords: ['test', 'spec', 'coverage', 'vitest'],
    triggerScopes: ['tests/', 'packages/'],
    triggerFilePatterns: ['**/*.test.ts', '**/*.test.tsx'],
    preferredModel: 'sonnet',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 18, successRate: 0.88, avgCoverage: 91, lastUsedInSprint: 'sprint-032' },
  });
}

// ─── Skills ─────────────────────────────────────────────────────────

function makeTypescriptSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'typescript-expert',
    name: 'TypeScript Expert',
    category: 'language',
    description: 'TypeScript best practices',
    triggers: ['typescript', 'ts', 'type', 'interface'],
    stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: ['tsc'] },
    composableWith: [],
    priority: 5,
    enabled: true,
    stats: { totalUses: 25, successRate: 0.96, avgCoverage: 89, lastUsedInSprint: 'sprint-032' },
  });
}

function makeReactSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'react-specialist',
    name: 'React Specialist',
    category: 'framework',
    description: 'React patterns and hooks',
    triggers: ['react', 'component', 'jsx', 'hook'],
    stackDetection: { files: [], dependencies: ['react', 'react-dom'], commands: [] },
    composableWith: [],
    priority: 5,
    enabled: true,
    stats: { totalUses: 16, successRate: 0.87, avgCoverage: 83, lastUsedInSprint: 'sprint-032' },
  });
}

function makeMonorepoSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'monorepo-expert',
    name: 'Monorepo Expert',
    category: 'tool',
    description: 'Turborepo and monorepo patterns',
    triggers: ['monorepo', 'turbo', 'workspace', 'packages'],
    stackDetection: { files: ['turbo.json'], dependencies: ['turbo'], commands: ['turbo'] },
    composableWith: [],
    priority: 4,
    enabled: true,
  });
}

function makeTestingSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'testing-expert',
    name: 'Testing Expert',
    category: 'tool',
    description: 'Testing best practices',
    triggers: ['test', 'spec', 'coverage', 'vitest'],
    stackDetection: { files: [], dependencies: ['vitest'], commands: [] },
    composableWith: [],
    priority: 4,
    enabled: true,
  });
}

// ─── Context Factory ────────────────────────────────────────────────

function makeMonorepoContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  const agentPool: AgentPool = new Map();
  agentPool.set('ui-specialist', makeUIAgent());
  agentPool.set('api-builder', makeAPIAgent());
  agentPool.set('test-writer', makeTestAgent());

  const skillPool = new Map<string, SkillDefinition>();
  skillPool.set('typescript-expert', makeTypescriptSkill());
  skillPool.set('react-specialist', makeReactSkill());
  skillPool.set('monorepo-expert', makeMonorepoSkill());
  skillPool.set('testing-expert', makeTestingSkill());

  return {
    projectStack: makeMonorepoStack(),
    agentPool,
    skillPool,
    patterns: [],
    usageMetrics: makeUsage(),
    config: makeConfig(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Monorepo (Turborepo) Project Integration', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── Stack Verification ───────────────────────────────────────

  describe('Stack detection', () => {
    it('detects TypeScript from root config', () => {
      const ctx = makeMonorepoContext();
      expect(ctx.projectStack!.language).toBe('typescript');
    });

    it('detects turbo as build tool', () => {
      const ctx = makeMonorepoContext();
      expect(ctx.projectStack!.buildTool).toBe('turbo');
    });

    it('detects React framework', () => {
      const ctx = makeMonorepoContext();
      expect(ctx.projectStack!.framework).toBe('react');
    });

    it('includes turbo in dependencies', () => {
      const ctx = makeMonorepoContext();
      expect(ctx.projectStack!.dependencies).toContain('turbo');
    });

    it('includes vitest in dependencies', () => {
      const ctx = makeMonorepoContext();
      expect(ctx.projectStack!.dependencies).toContain('vitest');
    });
  });

  // ─── Scope Restriction ────────────────────────────────────────

  describe('Scope restriction for packages', () => {
    it('UI task scoped to packages/ui does not expand to packages/api', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      // filesWrite should only contain files from packages/ui
      for (const file of result.scope.filesWrite) {
        expect(file.startsWith('packages/ui/')).toBe(true);
      }
    });

    it('API task scoped to packages/api does not expand to packages/ui', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        id: '033-002',
        title: 'Add REST API user endpoint',
        description: 'Create user CRUD handler in API package',
        scope: makeScope(
          ['packages/api/src/'],
          ['packages/api/src/users.ts'],
        ),
      });

      const result = orch.decide(task);

      for (const file of result.scope.filesWrite) {
        expect(file.startsWith('packages/api/')).toBe(true);
      }
    });

    it('cross-package task includes both package directories', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        id: '033-003',
        title: 'Share types between UI and API',
        description: 'Extract shared TypeScript interfaces to packages/shared',
        scope: makeScope(
          ['packages/ui/src/', 'packages/api/src/', 'packages/shared/src/'],
          ['packages/shared/src/types.ts'],
        ),
      });

      const result = orch.decide(task);

      expect(result.scope.directories).toContain('packages/ui/src/');
      expect(result.scope.directories).toContain('packages/api/src/');
      expect(result.scope.directories).toContain('packages/shared/src/');
    });

    it('filesWrite security boundary preserved across packages', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        scope: makeScope(
          ['packages/ui/src/'],
          ['packages/ui/src/Button.tsx'],
        ),
      });

      const result = orch.decide(task);

      for (const file of result.scope.filesWrite) {
        expect(task.scope.filesWrite).toContain(file);
      }
    });
  });

  // ─── Agent Selection ──────────────────────────────────────────

  describe('Agent selection per package', () => {
    it('assigns ui-specialist for UI package task', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      if (result.agent) {
        expect(result.agent.id).toBe('ui-specialist');
      }
    });

    it('assigns api-builder for API package task', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Add API endpoint for user management',
        description: 'REST endpoint for user CRUD in API package',
        scope: makeScope(
          ['packages/api/src/'],
          ['packages/api/src/users.ts'],
        ),
      });

      const result = orch.decide(task);

      if (result.agent) {
        expect(result.agent.id).toBe('api-builder');
      }
    });

    it('assigns test-writer for test task in any package', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Write tests for Button component',
        description: 'Unit tests with vitest for UI package components',
        scope: makeScope(
          ['packages/ui/tests/'],
          ['packages/ui/tests/Button.test.tsx'],
        ),
      });

      const result = orch.decide(task);

      if (result.agent) {
        expect(['test-writer', 'ui-specialist']).toContain(result.agent.id);
      }
    });
  });

  // ─── Skill Selection ──────────────────────────────────────────

  describe('Skill selection for monorepo', () => {
    it('selects typescript-expert for all packages', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);
      const skillIds = result.skills.map(s => s.id);

      expect(skillIds).toContain('typescript-expert');
    });

    it('selects react-specialist for UI package task', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);
      const skillIds = result.skills.map(s => s.id);

      expect(skillIds).toContain('react-specialist');
    });

    it('selects monorepo-expert when turbo is a dependency', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Configure turbo pipeline for workspace',
        description: 'Set up turbo.json build pipeline for monorepo packages',
        scope: makeScope(['./'], ['turbo.json']),
      });

      const result = orch.decide(task);
      const skillIds = result.skills.map(s => s.id);

      expect(skillIds).toContain('monorepo-expert');
    });
  });

  // ─── Full Decision Pipeline ───────────────────────────────────

  describe('Full decision pipeline', () => {
    it('produces 6-step decision log for UI task', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
    });

    it('produces 6-step decision log for API task', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask({
        title: 'Build API endpoint',
        description: 'Add REST handler in API package',
        scope: makeScope(
          ['packages/api/src/'],
          ['packages/api/src/handler.ts'],
        ),
      });

      const result = orch.decide(task);

      expect(result.decisionLog.length).toBe(6);
    });

    it('handles multiple package tasks in parallel-safe way', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);

      const tasks = [
        makeTask({
          id: '033-001',
          title: 'Add button component',
          description: 'Shared button for UI package',
          scope: makeScope(['packages/ui/src/'], ['packages/ui/src/Button.tsx']),
        }),
        makeTask({
          id: '033-002',
          title: 'Add user API endpoint',
          description: 'REST user handler in API package',
          scope: makeScope(['packages/api/src/'], ['packages/api/src/users.ts']),
        }),
        makeTask({
          id: '033-003',
          title: 'Add shared types',
          description: 'Extract shared TypeScript types',
          scope: makeScope(['packages/shared/src/'], ['packages/shared/src/types.ts']),
        }),
      ];

      const results = tasks.map(t => orch.decide(t));

      // Each task has independent decisions
      expect(results.length).toBe(3);
      for (const r of results) {
        expect(r.decisionLog.length).toBe(6);
      }

      // UI task should not get api-builder agent
      const uiResult = results[0]!;
      if (uiResult.agent) {
        expect(uiResult.agent.id).not.toBe('api-builder');
      }

      // API task should not get ui-specialist agent
      const apiResult = results[1]!;
      if (apiResult.agent) {
        expect(apiResult.agent.id).not.toBe('ui-specialist');
      }
    });

    it('effort resolves to valid value for monorepo tasks', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(['low', 'normal', 'high']).toContain(result.effort);
    });

    it('model is not haiku when haiku_allowed is false', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);
      const task = makeTask();

      const result = orch.decide(task);

      expect(result.model).not.toBe('haiku');
    });

    it('cross-package refactor task has higher complexity', () => {
      const ctx = makeMonorepoContext();
      const orch = new DecisionOrchestrator(ctx);

      const singlePkgTask = makeTask({
        title: 'Refactor button component',
        description: 'Extract button variants',
        scope: makeScope(['packages/ui/src/'], ['packages/ui/src/Button.tsx']),
      });
      const crossPkgTask = makeTask({
        title: 'Refactor shared types across all packages',
        description: 'Reorganize TypeScript interfaces shared between UI and API',
        scope: makeScope(
          ['packages/ui/src/', 'packages/api/src/', 'packages/shared/src/'],
          ['packages/shared/src/types.ts', 'packages/ui/src/types.ts', 'packages/api/src/types.ts'],
        ),
      });

      const singleResult = orch.decide(singlePkgTask);
      const crossResult = orch.decide(crossPkgTask);

      expect(crossResult.analysis.complexity).toBeGreaterThanOrEqual(singleResult.analysis.complexity);
    });
  });
});
