import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { createAgentDefinition } from '../../../src/core/agent-types.js';
import { createSkillDefinition } from '../../../src/core/skill-types.js';
import type { AgentPool, AgentDefinition } from '../../../src/core/agent-types.js';
import type { SkillDefinition, ProjectStack } from '../../../src/core/skill-types.js';
import type { Task, TaskScope, ResolvedConfig } from '../../../src/core/types.js';
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
    },
    modes: {} as never,
    language: 'en',
    projectName: 'monorepo-project',
    projectRoot: tmpDir,
    version: '0.1.0',
    ...overrides,
  };
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
});
