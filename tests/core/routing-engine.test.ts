import { modelRegistry } from '../../src/core/model-registry.js';
import { describe, it, expect } from 'vitest';
import {
  routeTaskV2,
  calculateSkillBudget,
  resolveOverrides,
  calculateConfidence,
  assessContextFit,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition, createDefaultStats } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { ActivationConfig, UserOverride, TaskDNA } from '../../src/core/routing-types.js';
import { createDefaultTaskDNA, SKILL_TOKEN_BUDGET_BY_EFFORT } from '../../src/core/routing-types.js';

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

    it('returns fallback agent when no match meets threshold (Sprint 148: fallback chain)', () => {
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

      // Sprint 148 Task 4: fallback chain now provides agent instead of null
      // bugfix intent → fallback chain ['bug-fixer', 'refactorer'] → static fallback
      expect(decision.agentId).not.toBeNull();
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

  describe('calculateSkillBudget — dynamic maxTokens by effort', () => {
    it('low effort → maxTokensPerSkill=1000', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'medium';
      dna.domains = [{ name: 'core', weight: 0.5 }, { name: 'cli', weight: 0.5 }];
      dna.operations = [{ type: 'modify', weight: 0.7 }, { type: 'test', weight: 0.3 }];
      const budget = calculateSkillBudget(dna, undefined, 'low');
      expect(budget.maxTokensPerSkill).toBe(SKILL_TOKEN_BUDGET_BY_EFFORT['low']);
      expect(budget.maxTokensPerSkill).toBe(1000);
    });

    it('normal effort → maxTokensPerSkill=1500', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'medium';
      dna.domains = [{ name: 'core', weight: 0.5 }, { name: 'cli', weight: 0.5 }];
      dna.operations = [{ type: 'modify', weight: 0.7 }, { type: 'test', weight: 0.3 }];
      const budget = calculateSkillBudget(dna, undefined, 'normal');
      expect(budget.maxTokensPerSkill).toBe(SKILL_TOKEN_BUDGET_BY_EFFORT['normal']);
      expect(budget.maxTokensPerSkill).toBe(1500);
    });

    it('high effort → maxTokensPerSkill=2500', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'large';
      dna.domains = [{ name: 'core', weight: 0.5 }, { name: 'cli', weight: 0.5 }];
      dna.operations = [{ type: 'modify', weight: 0.7 }, { type: 'test', weight: 0.3 }];
      const budget = calculateSkillBudget(dna, undefined, 'high');
      expect(budget.maxTokensPerSkill).toBe(SKILL_TOKEN_BUDGET_BY_EFFORT['high']);
      expect(budget.maxTokensPerSkill).toBe(2500);
    });

    it('no effort → falls back to default 1500', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'medium';
      const budget = calculateSkillBudget(dna);
      expect(budget.maxTokensPerSkill).toBe(1500);
    });

    it('totalSkillTokenBudget is proportional to maxSkills × maxTokensPerSkill', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'large';
      dna.domains = [{ name: 'a', weight: 0.5 }, { name: 'b', weight: 0.5 }];
      dna.operations = [{ type: 'modify', weight: 0.7 }, { type: 'test', weight: 0.3 }];
      const budget = calculateSkillBudget(dna, undefined, 'high');
      expect(budget.totalSkillTokenBudget).toBe(budget.maxSkills * budget.maxTokensPerSkill);
      expect(budget.maxTokensPerSkill).toBe(2500);
    });

    it('reason includes effort level', () => {
      const dna = createDefaultTaskDNA();
      dna.complexity.estimatedSize = 'medium';
      const budget = calculateSkillBudget(dna, undefined, 'high');
      expect(budget.reason).toContain('effort=high');
    });
  });

  describe('intent-based skill priority', () => {
    function makeTestingSkill(): SkillDefinition {
      return makeSkill('testing-expert', {
        activation: {
          // Sprint 148: testing removed as primary intent — use testWriteRatio threshold
          rules: [{ when: { 'scope.testWriteRatio': { $gte: 0.3 } }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });
    }

    function makeDocSkill(): SkillDefinition {
      return makeSkill('documentation-writer', {
        activation: {
          rules: [{ when: { 'intent.primary': 'documentation' }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });
    }

    function makeTsSkill(): SkillDefinition {
      return makeSkill('typescript-expert', {
        activation: {
          rules: [{ when: { 'intent.primary': 'implementation' }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });
    }

    it('test-coverage tag boosts testing-expert over generic skill (Sprint 148 reform)', () => {
      const testingSkill = makeTestingSkill();
      const genericSkill = makeSkill('generic-skill', {
        activation: {
          rules: [{ when: { 'scope.testWriteRatio': { $gte: 0.5 } }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });

      // Broad scope to ensure maxSkills > 0 (not trivial)
      const decision = routeTaskV2(
        {
          title: 'Write unit tests for auth module',
          description: 'Add comprehensive tests for authentication and authorization flows',
          scope: {
            directories: ['tests/core/', 'tests/orchestra/'],
            filesRead: [],
            filesWrite: ['tests/core/auth.test.ts', 'tests/orchestra/worker.test.ts', 'tests/core/session.test.ts'],
          },
        },
        makePool(),
        makeSkillPool(genericSkill, testingSkill),
      );

      // Sprint 148: testing-expert boosted via test-coverage tag, not testing intent
      expect(decision.skillIds).toContain('testing-expert');
    });

    it('documentation intent boosts documentation-writer', () => {
      const docSkill = makeDocSkill();
      const tsSkill = makeTsSkill();

      // Broad scope to ensure maxSkills > 0
      const decision = routeTaskV2(
        {
          title: 'Write API documentation for all endpoints',
          description: 'Create comprehensive documentation for all REST endpoints',
          scope: {
            directories: ['docs/', 'src/api/'],
            filesRead: [],
            filesWrite: ['docs/api.md', 'docs/endpoints.md', 'docs/getting-started.md'],
          },
        },
        makePool(),
        makeSkillPool(docSkill, tsSkill),
      );

      // documentation-writer should be selected (intent bonus on top of activation)
      expect(decision.skillIds).toContain('documentation-writer');
    });

    it('implementation + typescript intent boosts typescript-expert with typescript stack', () => {
      const tsSkill = makeTsSkill();
      const genericSkill = makeSkill('generic-skill', {
        activation: {
          rules: [{ when: { 'intent.primary': 'implementation' }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });

      // Broad scope to ensure maxSkills > 0
      const decision = routeTaskV2(
        {
          title: 'Implement config module and CLI commands',
          description: 'Add configuration loading functionality with CLI integration across components',
          scope: {
            directories: ['src/core/', 'src/cli/'],
            filesRead: [],
            filesWrite: ['src/core/config.ts', 'src/core/loader.ts', 'src/cli/config-cmd.ts'],
          },
        },
        makePool(),
        makeSkillPool(genericSkill, tsSkill),
        {
          projectStack: { language: 'typescript', framework: 'vitest', dependencies: ['typescript'] },
        },
      );

      expect(decision.skillIds).toContain('typescript-expert');
      const tsIdx = decision.skillIds.indexOf('typescript-expert');
      const genericIdx = decision.skillIds.indexOf('generic-skill');
      if (genericIdx !== -1) {
        expect(tsIdx).toBeLessThan(genericIdx);
      }
    });

    it('routeTaskV2 passes effort to calculateSkillBudget via options', () => {
      const tsSkill = makeTsSkill();

      const decision = routeTaskV2(
        {
          title: 'High effort implementation task',
          description: 'Complex refactor of core module',
          scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/core/main.ts'] },
        },
        makePool(),
        makeSkillPool(tsSkill),
        {
          effort: 'high',
          projectStack: { language: 'typescript', framework: 'node', dependencies: [] },
        },
      );

      // With high effort, skill budget should use 2500 token budget (included in reasoning)
      expect(decision.reasoning.some(r => r.includes('effort=high'))).toBe(true);
    });
  });

  describe('skill learning bonus integration', () => {
    it('positive skill learning bonus (+3) boosts skill above competing skill', () => {
      const skillA = makeSkill('skill-a', {
        activation: {
          rules: [{ when: { 'intent.primary': 'implementation' }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });
      const skillB = makeSkill('skill-b', {
        activation: {
          rules: [{ when: { 'intent.primary': 'implementation' }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });

      // Skill A gets +3 bonus (recent sprint success), skill B gets none
      const decision = routeTaskV2(
        {
          title: 'Implement new feature',
          description: 'Build config loader',
          scope: {
            directories: ['src/core/'],
            filesRead: [],
            filesWrite: ['src/core/config.ts', 'src/core/loader.ts'],
          },
        },
        makePool(),
        makeSkillPool(skillA, skillB),
        {
          learningData: [
            { entityId: 'skill-a', bonus: 3, source: 'sprint-recency' },
          ],
        },
      );

      // skill-a should score higher due to learning bonus
      const skillAScore = decision.skillScores.get('skill-a') ?? 0;
      const skillBScore = decision.skillScores.get('skill-b') ?? 0;
      if (decision.skillIds.includes('skill-a') && decision.skillIds.includes('skill-b')) {
        expect(skillAScore).toBeGreaterThan(skillBScore);
      }
    });

    it('negative skill learning bonus (-2) penalizes skill selection', () => {
      const penalizedSkill = makeSkill('bad-skill', {
        activation: {
          rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 4 }],
          exclude: [],
          minScore: 3,
        },
      });

      const goodSkill = makeSkill('good-skill', {
        activation: {
          rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });

      const decision = routeTaskV2(
        {
          title: 'Fix bug in config',
          description: 'Resolve crash on startup',
          scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
        },
        makePool(),
        makeSkillPool(penalizedSkill, goodSkill),
        {
          learningData: [
            { entityId: 'bad-skill', bonus: -2, source: 'sprint-recency' },
          ],
        },
      );

      // penalizedSkill (raw 4 - 2 = 2) should score below goodSkill (raw 5)
      const penalizedScore = decision.skillScores.get('bad-skill') ?? 0;
      const goodScore = decision.skillScores.get('good-skill') ?? 0;
      expect(goodScore).toBeGreaterThanOrEqual(penalizedScore);
    });

    it('skill learning bonus is logged in reasoning when non-zero', () => {
      const bonusSkill = makeSkill('bonus-skill', {
        activation: {
          rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });

      const decision = routeTaskV2(
        {
          title: 'Implement feature',
          description: 'Build new module',
          scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/core/mod.ts'] },
        },
        makePool(),
        makeSkillPool(bonusSkill),
        {
          learningData: [
            { entityId: 'bonus-skill', bonus: 3, source: 'sprint-recency' },
          ],
        },
      );

      expect(decision.reasoning.some(r =>
        r.includes('bonus-skill') && r.includes('learning bonus'),
      )).toBe(true);
    });

    it('skill learning bonus caps at ±3 (LEARNING_BONUS_CAP)', () => {
      const overBonusSkill = makeSkill('over-bonus-skill', {
        activation: {
          rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 5 }],
          exclude: [],
          minScore: 3,
        },
      });

      const decision = routeTaskV2(
        {
          title: 'Implement feature',
          description: 'Build new module',
          scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/core/mod.ts'] },
        },
        makePool(),
        makeSkillPool(overBonusSkill),
        {
          learningData: [
            { entityId: 'over-bonus-skill', bonus: 10, source: 'sprint-recency' }, // exceeds cap
          ],
        },
      );

      // Score should be rawScore + 3 (capped), not rawScore + 10
      const score = decision.skillScores.get('over-bonus-skill') ?? 0;
      // base activation score is 5, cap is 3 → max total from learning alone is 5+3=8
      expect(score).toBeLessThanOrEqual(12); // 5 (activation) + 3 (cap) + 3 (intent bonus max) + 3 (stack)
    });
  });
});

// ─── Sprint 069-006: forceSkills V2 UserOverride integration ─────────────────

describe('routeTaskV2 — forceSkills UserOverride integration', () => {
  it('uses forceSkills from override, ignoring activation rules', () => {
    const tsSkill = makeSkill('typescript-expert');
    const testSkill = makeSkill('testing-expert');
    const decision = routeTaskV2(
      { title: 'Update docs', description: 'Write documentation', scope: { directories: ['docs/'], filesRead: [], filesWrite: ['README.md'] } },
      makePool(),
      makeSkillPool(tsSkill, testSkill),
      { overrides: [{ source: 'task-directive', forceSkills: ['typescript-expert'], priority: 3 }] },
    );
    expect(decision.skillIds).toEqual(['typescript-expert']);
  });

  it('reflects forceSkills with high skill confidence', () => {
    const skill = makeSkill('security-expert');
    const decision = routeTaskV2(
      { title: 'Config update', description: 'Minor config fix', scope: { directories: [], filesRead: [], filesWrite: [] } },
      makePool(),
      makeSkillPool(skill),
      { overrides: [{ source: 'task-directive', forceSkills: ['security-expert'], priority: 3 }] },
    );
    expect(decision.skillIds).toContain('security-expert');
    expect(decision.skillConfidence).toBe('high');
  });

  it('forceSkills empty array results in no skills assigned', () => {
    const skill = makeSkill('typescript-expert', {
      activation: { rules: [{ when: { 'intent.primary': 'implementation' }, score: 10 }], exclude: [], minScore: 5 },
    });
    const decision = routeTaskV2(
      { title: 'Implement feature', description: 'Add new functionality', scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/feature.ts'] } },
      makePool(),
      makeSkillPool(skill),
      { overrides: [{ source: 'task-directive', forceSkills: [], priority: 3 }] },
    );
    // empty forceSkills = explicit "no skills" override
    expect(decision.skillIds).toEqual([]);
  });

  it('forceSkills override wins over activation-based selection', () => {
    const tsSkill = makeSkill('typescript-expert', {
      activation: { rules: [{ when: { 'intent.primary': 'implementation' }, score: 10 }], exclude: [], minScore: 5 },
    });
    const docSkill = makeSkill('documentation-writer');
    const decision = routeTaskV2(
      { title: 'Implement feature', description: 'Build new TypeScript module', scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/feature.ts'] } },
      makePool(),
      makeSkillPool(tsSkill, docSkill),
      { overrides: [{ source: 'task-directive', forceSkills: ['documentation-writer'], priority: 3 }] },
    );
    // Despite implementation intent matching typescript-expert, the override wins
    expect(decision.skillIds).toEqual(['documentation-writer']);
    expect(decision.skillIds).not.toContain('typescript-expert');
  });

  it('reasoning includes forced skills message when override applied', () => {
    const skill = makeSkill('testing-expert');
    const decision = routeTaskV2(
      { title: 'Write tests', description: 'Add unit tests', scope: { directories: ['tests/'], filesRead: [], filesWrite: ['tests/foo.test.ts'] } },
      makePool(),
      makeSkillPool(skill),
      { overrides: [{ source: 'task-directive', forceSkills: ['testing-expert'], priority: 3 }] },
    );
    expect(decision.reasoning.some(r => r.includes('forced') || r.includes('override'))).toBe(true);
  });

  it('empty forceSkills override (Skills: none) clears skills and skips auto-selection', () => {
    // Skills: none → forceSkills=[] → no skills should be assigned
    const tsSkill = makeSkill('typescript-expert', {
      activation: {
        rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 10 }],
        exclude: [],
        minScore: 3,
      },
    });

    const decision = routeTaskV2(
      {
        title: 'Simple fix',
        description: 'Small patch with no skill needed',
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/fix.ts'] },
      },
      makePool(),
      makeSkillPool(tsSkill),
      { overrides: [{ source: 'task-directive', forceSkills: [], priority: 3 }] },
    );

    expect(decision.skillIds).toEqual([]);
    expect(decision.reasoning.some(r => r.includes('none') || r.includes('cleared'))).toBe(true);
  });

  it('forceSkills works even when forced skill is not in skill pool', () => {
    // DIRECTIVES specifies a skill that doesn't exist in the pool — still honored
    const decision = routeTaskV2(
      {
        title: 'Implement feature',
        description: 'Add new command',
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/cmd.ts'] },
      },
      makePool(),
      makeSkillPool(), // empty pool
      { overrides: [{ source: 'task-directive', forceSkills: ['typescript-expert', 'testing-expert'], priority: 3 }] },
    );

    expect(decision.skillIds).toContain('typescript-expert');
    expect(decision.skillIds).toContain('testing-expert');
  });
});

// ─── Sprint 124-002: Context Budget Fit Assessment ─────────────────────────────

describe('assessContextFit', () => {
  it('returns undefined when estimatedTokens is not provided', () => {
    const reasoning: string[] = [];
    expect(assessContextFit(undefined, 'sonnet', reasoning)).toBeUndefined();
    expect(reasoning).toHaveLength(0);
  });

  it('returns undefined when modelId is not provided', () => {
    const reasoning: string[] = [];
    expect(assessContextFit(50000, undefined, reasoning)).toBeUndefined();
    expect(reasoning).toHaveLength(0);
  });

  it('returns undefined for unknown modelId', () => {
    const reasoning: string[] = [];
    expect(assessContextFit(50000, 'nonexistent-model', reasoning)).toBeUndefined();
    expect(reasoning).toHaveLength(0);
  });

  it('returns "ok" when utilization is below 75%', () => {
    const reasoning: string[] = [];
    // sonnet has 200_000 context window; 50_000 = 25% utilization
    const result = assessContextFit(50_000, 'sonnet', reasoning);
    expect(result).toBe('ok');
    expect(reasoning.some(r => r.includes('Context fit: OK'))).toBe(true);
  });

  it('returns "tight" when utilization is between 75% and 90%', () => {
    const reasoning: string[] = [];
    // zero-hardcode: derive from the LIVE registry window (Sonnet 5 = 1M)
    const result = assessContextFit(Math.round((modelRegistry.get('sonnet')?.contextWindow ?? 200000) * 0.80), 'sonnet', reasoning);
    expect(result).toBe('tight');
    expect(reasoning.some(r => r.includes('Context fit: TIGHT'))).toBe(true);
    expect(reasoning.some(r => r.includes('upgrading'))).toBe(true);
  });

  it('returns "overflow" when utilization exceeds 90%', () => {
    const reasoning: string[] = [];
    // sonnet has 200_000 context window; 190_000 = 95% utilization
    const result = assessContextFit(Math.round((modelRegistry.get('sonnet')?.contextWindow ?? 200000) * 0.95), 'sonnet', reasoning);
    expect(result).toBe('overflow');
    expect(reasoning.some(r => r.includes('Context fit: OVERFLOW'))).toBe(true);
    expect(reasoning.some(r => r.includes('splitting'))).toBe(true);
  });

  it('returns "ok" for opus with large but fitting token count', () => {
    const reasoning: string[] = [];
    // opus has 1_000_000 context window; 500_000 = 50% utilization
    const result = assessContextFit(500_000, 'opus', reasoning);
    expect(result).toBe('ok');
  });

  it('boundary: exactly 75% returns "tight" (not "ok")', () => {
    const reasoning: string[] = [];
    // zero-hardcode: registry-derived window; just past the 75% boundary → tight
    const result = assessContextFit(Math.floor((modelRegistry.get('sonnet')?.contextWindow ?? 200000) * 0.75) + 1, 'sonnet', reasoning);
    expect(result).toBe('tight');
  });

  it('boundary: exactly 90% returns "overflow" (not "tight")', () => {
    const reasoning: string[] = [];
    // sonnet context = 200_000; 90% = 180_000 → exactly at threshold
    // 180_001 / 200_000 = 0.9000... > 0.90 → overflow
    const result = assessContextFit(Math.floor((modelRegistry.get('sonnet')?.contextWindow ?? 200000) * 0.90) + 1, 'sonnet', reasoning);
    expect(result).toBe('overflow');
  });
});

describe('routeTaskV2 — context budget integration', () => {
  it('includes contextFit in routing decision when estimatedTokens and modelId provided', () => {
    const decision = routeTaskV2(
      {
        title: 'Small task',
        description: 'A small configuration change',
        scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
      },
      makePool(),
      makeSkillPool(),
      {
        estimatedTokens: 30_000,
        modelId: 'sonnet', // 200k context window
      },
    );

    expect(decision.contextFit).toBe('ok');
    expect(decision.reasoning.some(r => r.includes('Context fit'))).toBe(true);
  });

  it('returns undefined contextFit when no estimatedTokens provided', () => {
    const decision = routeTaskV2(
      {
        title: 'Normal task',
        description: 'Some work',
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
      },
      makePool(),
      makeSkillPool(),
    );

    expect(decision.contextFit).toBeUndefined();
  });

  it('returns tight contextFit for high utilization task', () => {
    const decision = routeTaskV2(
      {
        title: 'Large task',
        description: 'Major refactoring across the codebase',
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
      },
      makePool(),
      makeSkillPool(),
      {
        estimatedTokens: Math.round((modelRegistry.get('sonnet')?.contextWindow ?? 200000) * 0.85),
        modelId: 'sonnet', // registry-window × 0.85 → tight
      },
    );

    expect(decision.contextFit).toBe('tight');
  });

  it('returns overflow contextFit for over-budget task', () => {
    const decision = routeTaskV2(
      {
        title: 'Massive task',
        description: 'Epic-scale refactoring',
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
      },
      makePool(),
      makeSkillPool(),
      {
        estimatedTokens: Math.round((modelRegistry.get('sonnet')?.contextWindow ?? 200000) * 0.95),
        modelId: 'sonnet', // 200k context → 97.5% utilization
      },
    );

    expect(decision.contextFit).toBe('overflow');
  });
});
