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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-react-'));
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
    title: 'Add user profile component',
    description: 'Create a user profile page component with avatar and bio display using React and TypeScript',
    model: 'sonnet',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'User feature',
    scope: makeScope(
      ['src/components/', 'src/pages/'],
      ['src/components/UserProfile.tsx', 'src/pages/profile.tsx'],
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
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'react-app',
    projectRoot: tmpDir,
    version: '0.1.0',
    ...overrides,
  };
}

// ─── TypeScript+React Stack ─────────────────────────────────────────

function makeReactStack(): ProjectStack {
  return {
    language: 'typescript',
    framework: 'react',
    dependencies: ['typescript', 'react', 'react-dom', 'vitest', '@testing-library/react'],
    buildTool: 'vite',
    testFramework: 'vitest',
    detectedAt: new Date().toISOString(),
  };
}

// ─── Agents ─────────────────────────────────────────────────────────

function makeUIAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'ui-specialist',
    name: 'UI Specialist',
    description: 'Builds user interface components',
    expertise: ['react', 'component', 'ui', 'css'],
    triggerKeywords: ['component', 'ui', 'page', 'layout', 'react', 'jsx', 'hook'],
    triggerScopes: ['src/components/', 'src/pages/', 'src/ui/'],
    triggerFilePatterns: ['**/*.tsx', '**/*.jsx'],
    preferredModel: 'sonnet',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 14, successRate: 0.86, avgCoverage: 82, lastUsedInSprint: 'sprint-032' },
  });
}

function makeTestAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Writes comprehensive tests',
    expertise: ['testing', 'vitest', 'coverage'],
    triggerKeywords: ['test', 'spec', 'coverage', 'vitest', 'mock'],
    triggerScopes: ['tests/'],
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
    triggers: ['typescript', 'ts', 'type', 'interface', 'generic'],
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
    description: 'React patterns, hooks, and component design',
    triggers: ['react', 'component', 'jsx', 'hook', 'useState', 'useEffect'],
    stackDetection: { files: [], dependencies: ['react', 'react-dom'], commands: [] },
    composableWith: [],
    priority: 5,
    model: 'sonnet',
    enabled: true,
    stats: { totalUses: 16, successRate: 0.87, avgCoverage: 83, lastUsedInSprint: 'sprint-032' },
  });
}

function makeTestingSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'testing-expert',
    name: 'Testing Expert',
    category: 'tool',
    description: 'Testing best practices with vitest',
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
    description: 'Security best practices',
    triggers: ['security', 'jwt', 'auth', 'xss'],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 6,
    model: 'opus',
    enabled: true,
  });
}

function makePythonSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'python-expert',
    name: 'Python Expert',
    category: 'language',
    description: 'Python best practices',
    triggers: ['python', 'py', 'pip'],
    stackDetection: { files: ['setup.py', 'pyproject.toml'], dependencies: [], commands: ['python'] },
    composableWith: [],
    priority: 5,
    enabled: true,
  });
}

// ─── Context Factory ────────────────────────────────────────────────

function makeReactContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  const agentPool: AgentPool = new Map();
  agentPool.set('ui-specialist', makeUIAgent());
  agentPool.set('test-writer', makeTestAgent());

  const skillPool = new Map<string, SkillDefinition>();
  skillPool.set('typescript-expert', makeTypescriptSkill());
  skillPool.set('react-specialist', makeReactSkill());
  skillPool.set('testing-expert', makeTestingSkill());
  skillPool.set('security-specialist', makeSecuritySkill());
  skillPool.set('python-expert', makePythonSkill());

  return {
    projectStack: makeReactStack(),
    agentPool,
    skillPool,
    patterns: [],
    config: makeConfig(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('TypeScript + React Project Integration', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── Stack Verification ───────────────────────────────────────

  describe('Stack detection', () => {
    it('detects TypeScript language from stack', () => {
      const ctx = makeReactContext();
      expect(ctx.projectStack!.language).toBe('typescript');
    });

    it('detects React framework from stack', () => {
      const ctx = makeReactContext();
      expect(ctx.projectStack!.framework).toBe('react');
    });

    it('detects vitest as test framework', () => {
      const ctx = makeReactContext();
      expect(ctx.projectStack!.testFramework).toBe('vitest');
    });

    it('detects vite as build tool', () => {
      const ctx = makeReactContext();
      expect(ctx.projectStack!.buildTool).toBe('vite');
    });

    it('includes react and typescript in dependencies', () => {
      const ctx = makeReactContext();
      expect(ctx.projectStack!.dependencies).toContain('react');
      expect(ctx.projectStack!.dependencies).toContain('typescript');
    });
  });

  // ─── Skill Selection ──────────────────────────────────────────
});
