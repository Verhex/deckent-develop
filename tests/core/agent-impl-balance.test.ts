import { describe, it, expect } from 'vitest';
import {
  applyBuiltinImplementationRules,
  BUILTIN_IMPLEMENTATION_INTENT_RULES,
} from '../../src/core/agent-pool.js';
import { routeTaskV2, DOMAIN_MATCH_BONUS } from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';

// Sprint 209 — Task 209-003
// Domain-aware implementation score balance verification.
// Confirms the combined 209-001 (intent classifier) + 209-002 (domain-match bonus)
// + existing impl@7 scores create balanced routing:
//   - Domain-specialized agents beat refactorer for their domain.
//   - Refactorer/architect remain the winners for generic implementation tasks.
//   - Sprint 205 fix (built-in beats temp-react) is preserved.

function makeAgent(id: string, overrides: Partial<AgentDefinition>): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...overrides };
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}

// Agents with activation rules matching their on-disk agent.json.
// applyBuiltinImplementationRules adds the impl candidacy rule at load time.

function makeRefactorer(): AgentDefinition {
  const agent = makeAgent('refactorer', {
    source: 'builtin',
    activation: {
      rules: [{ when: { 'intent.primary': 'refactor' }, score: 10 }],
      exclude: [],
      minScore: 5,
    },
  });
  applyBuiltinImplementationRules(agent);
  return agent;
}

function makeArchitect(): AgentDefinition {
  const agent = makeAgent('architect', {
    source: 'builtin',
    activation: {
      rules: [
        { when: { 'intent.primary': 'design' }, score: 8 },
        { when: { 'complexity.estimatedSize': { $in: ['large', 'epic'] } }, score: 10 },
      ],
      exclude: [],
      minScore: 5,
    },
  });
  applyBuiltinImplementationRules(agent);
  return agent;
}

const apiBuilder = makeAgent('api-builder', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { domains: { $contains: 'api' } }, score: 8 },
    ],
    exclude: [],
    minScore: 5,
  },
});

const securityAuditor = makeAgent('security-auditor', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'security' }, score: 10 },
    ],
    exclude: [],
    minScore: 5,
  },
});

const tempReact = makeAgent('temp-react-ts-specialist', {
  source: 'learned',
  activation: {
    rules: [
      { when: { 'intent.primary': 'implementation' }, score: 6 },
    ],
    exclude: [],
    minScore: 5,
  },
});

describe('agent impl balance — domain-aware routing (Sprint 209 / 209-003)', () => {
  it('applyBuiltinImplementationRules injects impl candidacy matching constant score', () => {
    const agent = makeAgent('refactorer', {
      source: 'builtin',
      activation: {
        rules: [{ when: { 'intent.primary': 'refactor' }, score: 10 }],
        exclude: [],
        minScore: 5,
      },
    });

    const applied = applyBuiltinImplementationRules(agent);
    expect(applied).toBe(true);

    const implRule = agent.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRule).toBeDefined();
    expect(implRule!.score).toBe(BUILTIN_IMPLEMENTATION_INTENT_RULES['refactorer']!.score);
    // Score beats temp-react-ts-specialist (impl@6) for generic tasks.
    expect(implRule!.score).toBeGreaterThan(6);
  });

  it('generic implementation task → refactorer wins, temp-react does not', () => {
    const refactorer = makeRefactorer();

    const decision = routeTaskV2(
      {
        title: 'Add config normalizer utility',
        description:
          'Implement a config normalization function in src/core/. ' +
          'Add types and unit tests for the normalizer.',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/config-normalizer.ts'],
        },
      },
      makePool(refactorer, tempReact),
      new Map(),
    );

    expect(decision.taskDNA.intent.primary).toBe('implementation');
    expect(decision.agentId).toBe('refactorer');
    expect(decision.agentId).not.toBe('temp-react-ts-specialist');
    // refactorer impl score (7 from constant) beats temp-react impl@6.
    expect(decision.agentScore).toBeGreaterThan(6);
  });

  it('api task (src/api/) → api-builder wins over refactorer via domain-match bonus', () => {
    const refactorer = makeRefactorer();

    const decision = routeTaskV2(
      {
        title: '209-007 — Dashboard API endpoint canlı veri parite',
        description:
          'Connect dashboard API endpoints to live data. ' +
          'Update sprint, worker, agent, memory, debt endpoints.',
        scope: {
          directories: ['src/api/'],
          filesRead: [],
          filesWrite: ['src/api/server.ts'],
        },
      },
      makePool(refactorer, apiBuilder),
      new Map(),
    );

    // api-builder: 8 (domain rule) + 3 (domain-match bonus) = 11
    // refactorer:  BUILTIN_IMPLEMENTATION_INTENT_RULES score (7) + 0 bonus
    expect(decision.agentId).toBe('api-builder');
    expect(decision.agentScore).toBeGreaterThanOrEqual(8 + DOMAIN_MATCH_BONUS);
    expect(decision.agentScore).toBeGreaterThan(
      BUILTIN_IMPLEMENTATION_INTENT_RULES['refactorer']!.score,
    );
  });

  it('security task → security-auditor wins over refactorer via intent + domain bonus', () => {
    const refactorer = makeRefactorer();

    const decision = routeTaskV2(
      {
        title: 'Tighten API auth boundary',
        description: 'Strengthen security checks for API authorization flow.',
        scope: {
          directories: ['src/auth/'],
          filesRead: [],
          filesWrite: ['src/auth/boundary.ts'],
        },
      },
      makePool(refactorer, securityAuditor),
      new Map(),
    );

    expect(decision.agentId).toBe('security-auditor');
    // security-auditor: 10 (security intent) + 3 (domain bonus via auth path) = 13
    expect(decision.agentScore).toBeGreaterThan(
      BUILTIN_IMPLEMENTATION_INTENT_RULES['refactorer']!.score,
    );
  });

  it('domain balance: api-builder wins api task even when full pool includes refactorer + temp-react', () => {
    const refactorer = makeRefactorer();
    const architect = makeArchitect();

    const decision = routeTaskV2(
      {
        title: 'Add REST endpoint for agent listing',
        description:
          'Expose a GET /api/agents endpoint that returns the registered agent pool. ' +
          'Update src/api/ and add tests.',
        scope: {
          directories: ['src/api/'],
          filesRead: [],
          filesWrite: ['src/api/agents-endpoint.ts'],
        },
      },
      makePool(refactorer, architect, apiBuilder, tempReact),
      new Map(),
    );

    expect(decision.agentId).toBe('api-builder');
    // With full competitive pool, domain-match bonus ensures api-builder wins.
    expect(decision.agentId).not.toBe('refactorer');
    expect(decision.agentId).not.toBe('temp-react-ts-specialist');
  });
});
