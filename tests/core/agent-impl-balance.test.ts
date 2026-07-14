import { describe, it, expect } from 'vitest';
import {
  applyBuiltinImplementationRules,
  BUILTIN_IMPLEMENTATION_INTENT_RULES,
} from '../../src/core/agent-pool.js';
import { routeTaskV2, DOMAIN_MATCH_BONUS } from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';

// Sprint 209 — Task 209-003 (domain-aware implementation score balance),
// re-aimed for the implementer era (Sprint 444 F3): the implementation floor
// now lives on the `implementer` builtin's own manifest (implementation@7);
// refactorer is refactor-only and receives NO injected candidacy. The balance
// guarantees survive with the new owner:
//   - Domain-specialized agents beat the impl floor for their domain.
//   - Implementer is the winner for generic implementation tasks.
//   - Sprint 205 fix (built-in beats temp-react) is preserved.

function makeAgent(id: string, overrides: Partial<AgentDefinition>): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...overrides };
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}

// Agents with activation rules matching their on-disk agent.json.
// applyBuiltinImplementationRules mirrors load-time behavior (no-op for
// refactorer in the implementer era; architect still gains impl@6).

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

// Mirrors src/core/builtins/agents/implementer/agent.json — the floor lives
// on the manifest itself, no load-time injection involved.
function makeImplementer(): AgentDefinition {
  return makeAgent('implementer', {
    source: 'builtin',
    activation: {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 7 }],
      exclude: [],
      minScore: 5,
    },
  });
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

// The floor score implementer's manifest carries (see makeImplementer) — the
// same 7 that used to be injected into refactorer pre-444.
const IMPL_FLOOR_SCORE = 7;

describe('agent impl balance — domain-aware routing (implementer era)', () => {
  it('refactorer gets no injected candidacy; architect injection matches the constant', () => {
    const refactorer = makeRefactorer();
    const refactorerImplRule = refactorer.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(refactorerImplRule).toBeUndefined();

    const architect = makeArchitect();
    const architectImplRule = architect.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(architectImplRule).toBeDefined();
    expect(architectImplRule!.score).toBe(BUILTIN_IMPLEMENTATION_INTENT_RULES['architect']!.score);

    // The manifest-carried floor still beats temp-react-ts-specialist (impl@6).
    expect(IMPL_FLOOR_SCORE).toBeGreaterThan(6);
  });

  it('generic implementation task → implementer wins, refactorer and temp-react do not', () => {
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
      makePool(makeImplementer(), makeRefactorer(), tempReact),
      new Map(),
    );

    expect(decision.taskDNA.intent.primary).toBe('implementation');
    expect(decision.agentId).toBe('implementer');
    expect(decision.agentId).not.toBe('refactorer');
    expect(decision.agentId).not.toBe('temp-react-ts-specialist');
    // implementer impl score (7 from its manifest) beats temp-react impl@6.
    expect(decision.agentScore).toBeGreaterThan(6);
  });

  it('api task (src/api/) → api-builder wins over implementer via domain-match bonus', () => {
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
      makePool(makeImplementer(), apiBuilder),
      new Map(),
    );

    // api-builder:  8 (domain rule) + 3 (domain-match bonus) = 11
    // implementer:  7 (manifest floor) + 0 bonus
    expect(decision.agentId).toBe('api-builder');
    expect(decision.agentScore).toBeGreaterThanOrEqual(8 + DOMAIN_MATCH_BONUS);
    expect(decision.agentScore).toBeGreaterThan(IMPL_FLOOR_SCORE);
  });

  it('security task → security-auditor wins over implementer via intent + domain bonus', () => {
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
      makePool(makeImplementer(), securityAuditor),
      new Map(),
    );

    expect(decision.agentId).toBe('security-auditor');
    // security-auditor: 10 (security intent) + 3 (domain bonus via auth path) = 13
    expect(decision.agentScore).toBeGreaterThan(IMPL_FLOOR_SCORE);
  });

  it('domain balance: api-builder wins api task even when full pool includes implementer + refactorer + temp-react', () => {
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
      makePool(makeImplementer(), makeRefactorer(), makeArchitect(), apiBuilder, tempReact),
      new Map(),
    );

    expect(decision.agentId).toBe('api-builder');
    // With full competitive pool, domain-match bonus ensures api-builder wins.
    expect(decision.agentId).not.toBe('implementer');
    expect(decision.agentId).not.toBe('refactorer');
    expect(decision.agentId).not.toBe('temp-react-ts-specialist');
  });
});
