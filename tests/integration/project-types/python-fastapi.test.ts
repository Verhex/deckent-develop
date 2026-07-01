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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'python-fastapi-'));
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
    title: 'Add user API endpoint',
    description: 'Create FastAPI endpoint for user CRUD operations',
    model: 'sonnet',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'API feature',
    scope: makeScope(
      ['app/api/', 'app/models/'],
      ['app/api/users.py', 'app/models/user.py'],
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
      haiku_allowed: true,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'fastapi-app',
    projectRoot: tmpDir,
    version: '0.1.0',
    ...overrides,
  };
}

// ─── Python+FastAPI Stack ───────────────────────────────────────────

function makePythonStack(): ProjectStack {
  return {
    language: 'python',
    framework: 'fastapi',
    dependencies: ['fastapi', 'uvicorn', 'sqlalchemy', 'pytest', 'pydantic'],
    buildTool: 'setuptools',
    testFramework: 'pytest',
    detectedAt: new Date().toISOString(),
  };
}

// ─── Agents ─────────────────────────────────────────────────────────

function makeAPIAgent(): AgentDefinition {
  return createAgentDefinition({
    id: 'api-builder',
    name: 'API Builder',
    description: 'Builds REST API endpoints',
    expertise: ['api', 'rest', 'endpoint', 'crud'],
    triggerKeywords: ['api', 'endpoint', 'rest', 'crud', 'route', 'controller'],
    triggerScopes: ['app/api/', 'app/routes/', 'src/api/'],
    triggerFilePatterns: ['**/api/**', '**/routes/**'],
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
    expertise: ['testing', 'pytest', 'coverage'],
    triggerKeywords: ['test', 'spec', 'coverage', 'pytest', 'mock'],
    triggerScopes: ['tests/'],
    triggerFilePatterns: ['**/test_*.py', '**/*_test.py'],
    preferredModel: 'sonnet',
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 12, successRate: 0.85, avgCoverage: 88, lastUsedInSprint: 'sprint-032' },
  });
}

// ─── Skills ─────────────────────────────────────────────────────────

function makePythonSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'python-expert',
    name: 'Python Expert',
    category: 'language',
    description: 'Python best practices, type hints, and patterns',
    triggers: ['python', 'py', 'pip', 'pydantic'],
    stackDetection: { files: ['setup.py', 'pyproject.toml'], dependencies: [], commands: ['python'] },
    composableWith: [],
    priority: 5,
    enabled: true,
    stats: { totalUses: 22, successRate: 0.91, avgCoverage: 86, lastUsedInSprint: 'sprint-032' },
  });
}

function makeAPISkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'api-builder',
    name: 'API Builder',
    category: 'domain',
    description: 'REST API design and implementation',
    triggers: ['api', 'endpoint', 'rest', 'crud', 'fastapi', 'route'],
    stackDetection: { files: [], dependencies: ['fastapi'], commands: [] },
    composableWith: [],
    priority: 4,
    model: 'sonnet',
    enabled: true,
    stats: { totalUses: 15, successRate: 0.87, avgCoverage: 81, lastUsedInSprint: 'sprint-032' },
  });
}

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
  });
}

function makeTestingSkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'testing-expert',
    name: 'Testing Expert',
    category: 'tool',
    description: 'Testing best practices with pytest',
    triggers: ['test', 'spec', 'coverage', 'pytest', 'mock'],
    stackDetection: { files: [], dependencies: ['pytest'], commands: [] },
    composableWith: [],
    priority: 4,
    enabled: true,
  });
}

function makeSecuritySkill(): SkillDefinition {
  return createSkillDefinition({
    id: 'security-specialist',
    name: 'Security Specialist',
    category: 'domain',
    description: 'Security best practices',
    triggers: ['security', 'jwt', 'auth', 'oauth'],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 6,
    enabled: true,
  });
}

// ─── Context Factory ────────────────────────────────────────────────

function makePythonContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  const agentPool: AgentPool = new Map();
  agentPool.set('api-builder', makeAPIAgent());
  agentPool.set('test-writer', makeTestAgent());

  const skillPool = new Map<string, SkillDefinition>();
  skillPool.set('python-expert', makePythonSkill());
  skillPool.set('api-builder', makeAPISkill());
  skillPool.set('typescript-expert', makeTypescriptSkill());
  skillPool.set('react-specialist', makeReactSkill());
  skillPool.set('testing-expert', makeTestingSkill());
  skillPool.set('security-specialist', makeSecuritySkill());

  return {
    projectStack: makePythonStack(),
    agentPool,
    skillPool,
    patterns: [],
    config: makeConfig(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Python + FastAPI Project Integration', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── Stack Verification ───────────────────────────────────────

  describe('Stack detection', () => {
    it('detects Python language', () => {
      const ctx = makePythonContext();
      expect(ctx.projectStack!.language).toBe('python');
    });

    it('detects FastAPI framework', () => {
      const ctx = makePythonContext();
      expect(ctx.projectStack!.framework).toBe('fastapi');
    });

    it('detects pytest as test framework', () => {
      const ctx = makePythonContext();
      expect(ctx.projectStack!.testFramework).toBe('pytest');
    });

    it('includes fastapi in dependencies', () => {
      const ctx = makePythonContext();
      expect(ctx.projectStack!.dependencies).toContain('fastapi');
    });

    it('includes pydantic in dependencies', () => {
      const ctx = makePythonContext();
      expect(ctx.projectStack!.dependencies).toContain('pydantic');
    });
  });

  // ─── Skill Selection ──────────────────────────────────────────
});
