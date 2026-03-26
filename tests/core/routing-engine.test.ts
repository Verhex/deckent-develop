import { describe, it, expect } from 'vitest';
import {
  routeTaskV2,
  calculateSkillBudget,
  resolveOverrides,
  calculateConfidence,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition, createDefaultStats } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { ActivationConfig, UserOverride, TaskDNA } from '../../src/core/routing-types.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeAgent(id: string, overrides?: Partial<AgentDefinition> & { activation?: ActivationConfig }): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...overrides } as AgentDefinition;
}

function makeSkill(id: string, overrides?: Partial<SkillDefinition> & { activation?: ActivationConfig }): SkillDefinition {
  const base = createSkillDefinition({ id, name: id });
  return { ...base, ...overrides } as SkillDefinition;
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map(a => [a.id, a]));
}

function makeSkillPool(...skills: SkillDefinition[]): Map<string, SkillDefinition> {
  return new Map(skills.map(s => [s.id, s]));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('routing-engine', () => {
  describe('routeTaskV2', () => {
    it('selects agent based on activation rules', () => {
      const securityAgent = makeAgent('security-auditor', {
        activation: {
          rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
          exclude: [],
          minScore: 5,
        },
      });
      const testAgent = makeAgent('test-writer', {
        activation: {
          rules: [{ when: { 'intent.primary': 'testing' }, score: 10 }],
          exclude: [],
          minScore: 5,
        },
      });

      const decision = routeTaskV2(
        {
          title: 'Security audit for auth',
          description: 'Check JWT vulnerabilities and XSS',
          scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/jwt.ts'] },
        },
        makePool(securityAgent, testAgent),
        makeSkillPool(),
      );

      expect(decision.agentId).toBe('security-auditor');
      expect(decision.agentScore).toBeGreaterThan(0);
    });

    it('returns null agent when no match meets threshold', () => {
      const designAgent = makeAgent('design-agent', {
        activation: {
          rules: [{ when: { 'intent.primary': 'design' }, score: 10 }],
          exclude: [],
          minScore: 5,
        },
      });

      const decision = routeTaskV2(
        {
          title: 'Fix bug in config',
          description: 'Config crash on missing field',
          scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
        },
        makePool(designAgent),
        makeSkillPool(),
      );

      expect(decision.agentId).toBeNull();
    });

    it('respects forceAgent override', () => {
      const decision = routeTaskV2(
        {
          title: 'Some task',
          description: 'Does not matter',
          scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
        },
        makePool(),
        makeSkillPool(),
        {
          overrides: [{ source: 'task-directive', forceAgent: 'my-agent', priority: 3 }],
        },
      );

      expect(decision.agentId).toBe('my-agent');
      expect(decision.overrideSource).toBe('task-directive');
    });

    it('respects forceSkills override', () => {
      const tsSkill = makeSkill('typescript-expert', {
        category: 'language',
        triggers: ['typescript'],
      });

      const decision = routeTaskV2(
        {
          title: 'Some task',
          description: 'Whatever',
          scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
        },
        makePool(),
        makeSkillPool(tsSkill),
        {
          overrides: [{ source: 'task-directive', forceSkills: ['typescript-expert'], priority: 3 }],
        },
      );

      expect(decision.skillIds).toContain('typescript-expert');
    });

    it('excludes skills via override', () => {
      const ciSkill = makeSkill('ci-testing', {
        category: 'workflow',
        triggers: ['test', 'ci'],
        activation: {
          rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });

      const decision = routeTaskV2(
        {
          title: 'Implement feature',
          description: 'Add new command',
          scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/cmd.ts'] },
        },
        makePool(),
        makeSkillPool(ciSkill),
        {
          overrides: [{ source: 'sprint-directive', excludeSkills: ['ci-testing'], priority: 2 }],
        },
      );

      expect(decision.skillIds).not.toContain('ci-testing');
    });

    it('excludes agents via activation exclude rules', () => {
      const ciAgent = makeAgent('ci-guardian', {
        activation: {
          rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 5 }],
          exclude: [{ when: { 'intent.primary': 'implementation' }, reason: 'Not for impl' }],
          minScore: 5,
        },
      });

      const decision = routeTaskV2(
        {
          title: 'Add new CLI command for dashboard',
          description: 'Create a new feature command to display project status',
          scope: { directories: ['src/cli/'], filesRead: [], filesWrite: ['src/cli/dashboard.ts'] },
        },
        makePool(ciAgent),
        makeSkillPool(),
      );

      // ci-guardian should be excluded because task is classified as implementation
      expect(decision.agentId).not.toBe('ci-guardian');
      expect(decision.reasoning.some(r => r.includes('excluded'))).toBe(true);
    });

    it('applies learning bonus', () => {
      const agentA = makeAgent('agent-a', {
        activation: {
          rules: [{ when: { 'intent.primary': 'bugfix' }, score: 5 }],
          exclude: [],
          minScore: 5,
        },
      });
      const agentB = makeAgent('agent-b', {
        activation: {
          rules: [{ when: { 'intent.primary': 'bugfix' }, score: 5 }],
          exclude: [],
          minScore: 5,
        },
      });

      const decision = routeTaskV2(
        {
          title: 'Fix crash in loader',
          description: 'Error when loading config. Bug regression.',
          scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/loader.ts'] },
        },
        makePool(agentA, agentB),
        makeSkillPool(),
        {
          learningData: [
            { entityId: 'agent-b', bonus: 3, source: 'sprint-060' },
          ],
        },
      );

      // agent-b should win due to +3 learning bonus
      expect(decision.agentId).toBe('agent-b');
    });

    it('generates TaskDNA in decision', () => {
      const decision = routeTaskV2(
        {
          title: 'Implement CLI command',
          description: 'Add new command to CLI',
          scope: { directories: ['src/cli/'], filesRead: [], filesWrite: ['src/cli/new-cmd.ts'] },
        },
        makePool(),
        makeSkillPool(),
      );

      expect(decision.taskDNA).toBeDefined();
      expect(decision.taskDNA.intent.primary).toBeDefined();
    });

    it('selects skills with stack detection bonus', () => {
      const tsSkill = makeSkill('typescript-expert', {
        category: 'language',
        triggers: ['typescript'],
        activation: {
          rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 3 }],
          exclude: [],
          minScore: 3,
        },
        stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: [] },
      });

      const decision = routeTaskV2(
        {
          title: 'Add feature to CLI and orchestra',
          description: 'Implement new module across multiple components',
          scope: {
            directories: ['src/cli/', 'src/orchestra/'],
            filesRead: [],
            filesWrite: ['src/cli/cmd.ts', 'src/orchestra/handler.ts', 'src/cli/helper.ts'],
          },
        },
        makePool(),
        makeSkillPool(tsSkill),
        {
          projectStack: { language: 'typescript', framework: 'none', dependencies: ['typescript'] },
        },
      );

      expect(decision.skillIds).toContain('typescript-expert');
    });
  });

  describe('calculateSkillBudget', () => {
    it('trivial task gets 0 skills', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'trivial';
      const budget = calculateSkillBudget(dna);
      expect(budget.maxSkills).toBe(0);
    });

    it('small task gets 1 skill', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'small';
      dna.domains = [{ name: 'core', weight: 1 }];
      dna.operations = [{ type: 'modify', weight: 1 }];
      const budget = calculateSkillBudget(dna);
      // small = 1, but single domain + single op = -1 → 0
      expect(budget.maxSkills).toBeLessThanOrEqual(1);
    });

    it('large task gets up to 3 skills', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'large';
      dna.complexity.moduleCount = 2;
      dna.domains = [{ name: 'core', weight: 0.5 }, { name: 'cli', weight: 0.5 }];
      dna.operations = [{ type: 'modify', weight: 0.7 }, { type: 'test', weight: 0.3 }];
      const budget = calculateSkillBudget(dna);
      expect(budget.maxSkills).toBeLessThanOrEqual(3);
      expect(budget.maxSkills).toBeGreaterThanOrEqual(2);
    });

    it('cross-cutting task gets +1 bonus', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'medium';
      dna.complexity.crossCutting = true;
      dna.complexity.moduleCount = 3;
      dna.domains = [{ name: 'a', weight: 0.3 }, { name: 'b', weight: 0.3 }, { name: 'c', weight: 0.3 }];
      dna.operations = [{ type: 'modify', weight: 0.5 }, { type: 'test', weight: 0.5 }];
      const budget = calculateSkillBudget(dna);
      expect(budget.maxSkills).toBe(3);
    });

    it('respects maxSkillsDefault config', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'epic';
      dna.domains = [{ name: 'a', weight: 0.5 }, { name: 'b', weight: 0.5 }];
      dna.operations = [{ type: 'modify', weight: 1 }];
      const budget = calculateSkillBudget(dna, { maxSkillsDefault: 2 });
      expect(budget.maxSkills).toBeLessThanOrEqual(2);
    });
  });

  describe('resolveOverrides', () => {
    it('highest priority forceAgent wins', () => {
      const overrides: UserOverride[] = [
        { source: 'project-config', forceAgent: 'project-agent', priority: 1 },
        { source: 'task-directive', forceAgent: 'task-agent', priority: 3 },
        { source: 'sprint-directive', forceAgent: 'sprint-agent', priority: 2 },
      ];

      const result = resolveOverrides(overrides);
      expect(result.forceAgent).toBe('task-agent');
    });

    it('exclusions are additive across all levels', () => {
      const overrides: UserOverride[] = [
        { source: 'project-config', excludeSkills: ['skill-a'], priority: 1 },
        { source: 'sprint-directive', excludeSkills: ['skill-b'], priority: 2 },
        { source: 'task-directive', excludeSkills: ['skill-c'], priority: 3 },
      ];

      const result = resolveOverrides(overrides);
      expect(result.excludeSkills).toContain('skill-a');
      expect(result.excludeSkills).toContain('skill-b');
      expect(result.excludeSkills).toContain('skill-c');
    });

    it('returns undefined for unset overrides', () => {
      const result = resolveOverrides([]);
      expect(result.forceAgent).toBeUndefined();
      expect(result.forceSkills).toBeUndefined();
      expect(result.excludeSkills).toEqual([]);
      expect(result.excludeAgents).toEqual([]);
    });

    it('deduplicates exclusions', () => {
      const overrides: UserOverride[] = [
        { source: 'project-config', excludeSkills: ['ci-testing'], priority: 1 },
        { source: 'sprint-directive', excludeSkills: ['ci-testing'], priority: 2 },
      ];

      const result = resolveOverrides(overrides);
      expect(result.excludeSkills.filter(s => s === 'ci-testing')).toHaveLength(1);
    });
  });

  describe('calculateConfidence', () => {
    it('returns high for single strong candidate', () => {
      expect(calculateConfidence(10, 0, 1)).toBe('high');
    });

    it('returns high for large gap', () => {
      expect(calculateConfidence(10, 3, 2)).toBe('high');
    });

    it('returns medium for moderate gap', () => {
      expect(calculateConfidence(10, 6, 2)).toBe('medium');
    });

    it('returns low for small gap', () => {
      expect(calculateConfidence(10, 9, 3)).toBe('low');
    });

    it('returns uncertain for zero score', () => {
      expect(calculateConfidence(0, 0, 0)).toBe('uncertain');
    });

    it('returns uncertain for no candidates', () => {
      expect(calculateConfidence(5, 0, 0)).toBe('uncertain');
    });
  });

  describe('integration — Task 063-003 scenario', () => {
    it('does NOT assign ci-testing to implementation task', () => {
      const ciTestingSkill = makeSkill('ci-testing', {
        category: 'workflow',
        triggers: ['test', 'ci', 'regression', 'coverage'],
        activation: {
          rules: [
            { when: { 'intent.primary': 'devops' }, score: 10 },
            { when: { 'intent.primary': 'testing', 'scope.testWriteRatio': { $gte: 0.5 } }, score: 8 },
          ],
          exclude: [
            { when: { 'intent.primary': 'implementation' }, reason: 'Not for implementation tasks' },
            { when: { 'intent.primary': 'refactor' }, reason: 'Not for refactoring' },
          ],
          minScore: 5,
        },
      });

      const tsSkill = makeSkill('typescript-expert', {
        category: 'language',
        triggers: ['typescript'],
        activation: {
          rules: [
            { when: { 'intent.primary': { $not: 'unknown' } }, score: 5 },
          ],
          exclude: [],
          minScore: 3,
        },
        stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: [] },
      });

      const decision = routeTaskV2(
        {
          title: 'start Kalan — Sandbox, Zero-Config, Fix Timeout, Queue, Usage, Watch, Phase',
          description: '7 kalan start önerisi. Test: 10+ test. --sandbox-mode, Zero-Config DIRECTIVES çakışma, Fix Phase Timeout configurable',
          scope: {
            directories: ['src/cli/commands/', 'src/orchestra/', 'tests/'],
            filesRead: [],
            filesWrite: ['src/cli/commands/start.ts', 'src/orchestra/sprint-controller.ts'],
          },
        },
        makePool(),
        makeSkillPool(ciTestingSkill, tsSkill),
        {
          projectStack: { language: 'typescript', framework: 'vitest', dependencies: ['typescript', 'vitest'] },
        },
      );

      // ci-testing should NOT be selected (excluded by intent.primary=implementation)
      expect(decision.skillIds).not.toContain('ci-testing');

      // typescript-expert SHOULD be selected
      expect(decision.skillIds).toContain('typescript-expert');

      // TaskDNA should classify as implementation, not testing
      expect(decision.taskDNA.intent.primary).toBe('implementation');
    });
  });
});
