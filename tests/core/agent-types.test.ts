import { describe, it, expect } from 'vitest';
import {
  createDefaultStats,
  createAgentDefinition,
} from '../../src/core/agent-types.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import type {
  AgentStats,
  AgentDefinition,
  AgentPool,
  AgentSelectionResult,
  MultiAgentPipelineStep,
} from '../../src/core/agent-types.js';

// ─── createDefaultStats ──────────────────────────────────────────────────────

describe('createDefaultStats', () => {
  it('returns an AgentStats with all fields zeroed', () => {
    const stats = createDefaultStats();
    expect(stats.totalUses).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.avgCoverage).toBe(0);
    expect(stats.lastUsedInSprint).toBe('');
  });

  it('returns a new object on every call (no shared reference)', () => {
    const a = createDefaultStats();
    const b = createDefaultStats();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('stats fields are independently mutable', () => {
    const stats = createDefaultStats();
    stats.totalUses = 5;
    stats.successRate = 0.8;
    stats.avgCoverage = 92;
    stats.lastUsedInSprint = 'sprint-010';
    expect(stats.totalUses).toBe(5);
    expect(stats.successRate).toBe(0.8);
    expect(stats.avgCoverage).toBe(92);
    expect(stats.lastUsedInSprint).toBe('sprint-010');
  });
});

// ─── createAgentDefinition ───────────────────────────────────────────────────

describe('createAgentDefinition', () => {
  it('creates an agent with only id and name, rest defaults', () => {
    const agent = createAgentDefinition({ id: 'test-agent', name: 'Test Agent' });
    expect(agent.id).toBe('test-agent');
    expect(agent.name).toBe('Test Agent');
    expect(agent.description).toBe('');
    expect(agent.systemPrompt).toBe('');
    expect(agent.expertise).toEqual([]);
    expect(agent.allowedTools).toEqual([]);
    expect(agent.deniedTools).toEqual([]);
    expect(modelRegistry.get(agent.preferredModel)?.tier).toBe('standard');
    expect(agent.effortMultiplier).toBe(1.0);
    expect(agent.triggerKeywords).toEqual([]);
    expect(agent.triggerScopes).toEqual([]);
    expect(agent.triggerFilePatterns).toEqual([]);
    expect(agent.persistent).toBe(false);
    expect(agent.enabled).toBe(true);
    expect(agent.source).toBe('user');
    expect(agent.stats).toEqual(createDefaultStats());
  });

  it('allows overriding description', () => {
    const agent = createAgentDefinition({
      id: 'a1',
      name: 'A1',
      description: 'Custom desc',
    });
    expect(agent.description).toBe('Custom desc');
  });

  it('allows overriding preferredModel to a canonical premium model', () => {
    const model = modelRegistry.getByTier('premium')[0]!.id;
    const agent = createAgentDefinition({
      id: 'heavy',
      name: 'Heavy',
      preferredModel: model,
    });
    expect(agent.preferredModel).toBe(model);
  });

  it('allows overriding preferredModel to a canonical economy model', () => {
    const model = modelRegistry.getByTier('economy')[0]!.id;
    const agent = createAgentDefinition({
      id: 'light',
      name: 'Light',
      preferredModel: model,
    });
    expect(agent.preferredModel).toBe(model);
  });

  it('allows overriding effortMultiplier', () => {
    const agent = createAgentDefinition({
      id: 'e1',
      name: 'E1',
      effortMultiplier: 2.5,
    });
    expect(agent.effortMultiplier).toBe(2.5);
  });

  it('allows overriding source to builtin', () => {
    const agent = createAgentDefinition({
      id: 'b1',
      name: 'B1',
      source: 'builtin',
    });
    expect(agent.source).toBe('builtin');
  });

  it('allows overriding source to learned', () => {
    const agent = createAgentDefinition({
      id: 'l1',
      name: 'L1',
      source: 'learned',
    });
    expect(agent.source).toBe('learned');
  });

  it('allows overriding triggerKeywords', () => {
    const agent = createAgentDefinition({
      id: 'k1',
      name: 'K1',
      triggerKeywords: ['test', 'coverage'],
    });
    expect(agent.triggerKeywords).toEqual(['test', 'coverage']);
  });

  it('allows overriding triggerScopes and triggerFilePatterns', () => {
    const agent = createAgentDefinition({
      id: 's1',
      name: 'S1',
      triggerScopes: ['src/core/'],
      triggerFilePatterns: ['*.test.ts'],
    });
    expect(agent.triggerScopes).toEqual(['src/core/']);
    expect(agent.triggerFilePatterns).toEqual(['*.test.ts']);
  });

  it('allows overriding persistent and enabled', () => {
    const agent = createAgentDefinition({
      id: 'p1',
      name: 'P1',
      persistent: true,
      enabled: false,
    });
    expect(agent.persistent).toBe(true);
    expect(agent.enabled).toBe(false);
  });

  it('allows overriding stats', () => {
    const customStats: AgentStats = {
      totalUses: 10,
      successRate: 0.9,
      avgCoverage: 88,
      lastUsedInSprint: 'sprint-005',
    };
    const agent = createAgentDefinition({
      id: 'stats1',
      name: 'Stats1',
      stats: customStats,
    });
    expect(agent.stats).toEqual(customStats);
  });

  it('allows overriding expertise, allowedTools, deniedTools', () => {
    const agent = createAgentDefinition({
      id: 'tools1',
      name: 'Tools1',
      expertise: ['typescript', 'testing'],
      allowedTools: ['vitest', 'tsc'],
      deniedTools: ['rm'],
    });
    expect(agent.expertise).toEqual(['typescript', 'testing']);
    expect(agent.allowedTools).toEqual(['vitest', 'tsc']);
    expect(agent.deniedTools).toEqual(['rm']);
  });

  it('returns a new object each time (no shared reference)', () => {
    const a = createAgentDefinition({ id: 'x', name: 'X' });
    const b = createAgentDefinition({ id: 'x', name: 'X' });
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ─── AgentPool type ──────────────────────────────────────────────────────────

describe('AgentPool type', () => {
  it('is a Map<string, AgentDefinition>', () => {
    const pool: AgentPool = new Map();
    const agent = createAgentDefinition({ id: 'a1', name: 'A1' });
    pool.set(agent.id, agent);
    expect(pool.size).toBe(1);
    expect(pool.get('a1')).toEqual(agent);
  });

  it('supports iteration', () => {
    const pool: AgentPool = new Map();
    pool.set('a', createAgentDefinition({ id: 'a', name: 'A' }));
    pool.set('b', createAgentDefinition({ id: 'b', name: 'B' }));
    const ids: string[] = [];
    for (const [id] of pool) {
      ids.push(id);
    }
    expect(ids).toEqual(['a', 'b']);
  });
});

// ─── AgentSelectionResult type ───────────────────────────────────────────────

describe('AgentSelectionResult type', () => {
  it('accepts agent as null with score 0', () => {
    const result: AgentSelectionResult = {
      agent: null,
      score: 0,
      reason: 'No matching agent found',
    };
    expect(result.agent).toBeNull();
    expect(result.score).toBe(0);
    expect(result.reason).toBe('No matching agent found');
  });

  it('accepts agent with a positive score', () => {
    const agent = createAgentDefinition({ id: 'test', name: 'Test' });
    const result: AgentSelectionResult = {
      agent,
      score: 7,
      reason: 'Matched on keywords: test, coverage',
    };
    expect(result.agent).toEqual(agent);
    expect(result.score).toBe(7);
  });
});

// ─── MultiAgentPipelineStep type ─────────────────────────────────────────────

describe('MultiAgentPipelineStep type', () => {
  it('holds agentId and phase', () => {
    const step: MultiAgentPipelineStep = {
      agentId: 'reviewer',
      phase: 'code-review',
    };
    expect(step.agentId).toBe('reviewer');
    expect(step.phase).toBe('code-review');
  });

  it('can form a pipeline array', () => {
    const pipeline: MultiAgentPipelineStep[] = [
      { agentId: 'planner', phase: 'plan' },
      { agentId: 'coder', phase: 'implement' },
      { agentId: 'tester', phase: 'test' },
    ];
    expect(pipeline).toHaveLength(3);
    expect(pipeline[0].agentId).toBe('planner');
    expect(pipeline[2].phase).toBe('test');
  });
});
