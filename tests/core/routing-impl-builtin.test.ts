import { describe, it, expect } from 'vitest';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import {
  applyBuiltinImplementationRules,
  BUILTIN_IMPLEMENTATION_INTENT_RULES,
} from '../../src/core/agent-pool.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';

// Sprint 205 (205-001) — Live verification of Sprint 204 (204-003) routing fix.
// Goal: implementation-intent tasks must route to a built-in agent
// (refactorer/architect), not the scope-blind temp-react-ts-specialist@6.

function makeAgent(id: string, overrides: Partial<AgentDefinition>): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...overrides };
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map((a) => [a.id, a]));
}

// Mirror the on-disk activation rules so the test is hermetic — it validates
// routing math without depending on .deckent/agents/* disk state.
const refactorer = makeAgent('refactorer', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'refactor' }, score: 10 },
      { when: { 'intent.primary': 'implementation' }, score: 7 },
    ],
    exclude: [],
    minScore: 5,
  },
});

const architect = makeAgent('architect', {
  source: 'builtin',
  activation: {
    rules: [
      { when: { 'intent.primary': 'design' }, score: 8 },
      { when: { 'complexity.estimatedSize': { $in: ['large', 'epic'] } }, score: 10 },
      { when: { 'intent.primary': 'implementation' }, score: 6 },
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

describe('routing — implementation → built-in (Sprint 205 / 205-001)', () => {
  it('implementation task selects built-in refactorer (7) over temp-react (6)', () => {
    const decision = routeTaskV2(
      {
        title: 'Implement config validator module',
        description:
          'Create a new validator function in src/core to check config values. ' +
          'Add a small module with explicit error types.',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/config-validator.ts'],
        },
      },
      makePool(refactorer, architect, tempReact),
      new Map(),
    );

    expect(decision.taskDNA.intent.primary).toBe('implementation');
    expect(decision.agentId).toBe('refactorer');
    expect(decision.agentScore).toBeGreaterThanOrEqual(7);
    expect(decision.agentId).not.toBe('temp-react-ts-specialist');
  });

  it('temp-react-ts-specialist does NOT win a generic implementation task', () => {
    const decision = routeTaskV2(
      {
        title: 'Build adaptive timeout engine',
        description:
          'Add an adaptive timeout estimator function. Module addition under src/core. ' +
          'Implement timeout logic and the related types.',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/timeout-adaptive.ts'],
        },
      },
      makePool(refactorer, tempReact),
      new Map(),
    );

    expect(decision.taskDNA.intent.primary).toBe('implementation');
    expect(decision.agentId).not.toBe('temp-react-ts-specialist');
    expect(decision.agentId).toBe('refactorer');
  });

  it('design intent still routes to architect (built-in design rule preserved)', () => {
    const decision = routeTaskV2(
      {
        title: 'Define dashboard panel layout',
        description:
          'Define the UI layout and component style for dashboard panels. ' +
          'Adjust theme and responsive breakpoints.',
        scope: {
          directories: ['src/dashboard/'],
          filesRead: [],
          filesWrite: ['src/dashboard/layout.ts'],
        },
      },
      makePool(refactorer, architect),
      new Map(),
    );

    expect(decision.taskDNA.intent.primary).toBe('design');
    expect(decision.agentId).toBe('architect');
  });

  it('forceAgent override beats normal scoring (impl task → forced temp-react)', () => {
    const decision = routeTaskV2(
      {
        title: 'Implement new feature',
        description: 'Implement a new function in src/core',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/feature.ts'],
        },
      },
      makePool(refactorer, architect, tempReact),
      new Map(),
      {
        overrides: [
          { source: 'task-directive', forceAgent: 'temp-react-ts-specialist', priority: 3 },
        ],
      },
    );

    expect(decision.agentId).toBe('temp-react-ts-specialist');
    expect(decision.overrideSource).toBe('task-directive');
  });

  it('applyBuiltinImplementationRules injects an impl rule and is idempotent', () => {
    // Simulate a fresh built-in agent that lacks the implementation candidacy rule
    // — this is the on-disk state immediately before the Sprint 204 (204-003) fix.
    const fresh = makeAgent('refactorer', {
      source: 'builtin',
      activation: {
        rules: [{ when: { 'intent.primary': 'refactor' }, score: 10 }],
        exclude: [],
        minScore: 5,
      },
    });

    const firstApply = applyBuiltinImplementationRules(fresh);
    expect(firstApply).toBe(true);

    const implRules = fresh.activation?.rules.filter(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRules?.length).toBe(1);
    expect(implRules?.[0]?.score).toBe(BUILTIN_IMPLEMENTATION_INTENT_RULES.refactorer!.score);
    expect(implRules?.[0]?.score).toBe(7);

    // Second call — already present, no duplicate, no mutation.
    const secondApply = applyBuiltinImplementationRules(fresh);
    expect(secondApply).toBe(false);
    const implRulesAfter = fresh.activation?.rules.filter(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRulesAfter?.length).toBe(1);
  });
});
