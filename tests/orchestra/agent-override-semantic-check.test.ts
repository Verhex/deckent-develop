// Sprint 182 W3-PQ-6 — F8 Agent Override Semantic Warning
//
// Verifies that `forceAgent` overrides trigger semantic activation checks
// against the task's TaskDNA. Low-relevance forced agents must emit an
// advisory warning (severity=warn) while the override remains honored —
// PLAN never blocks on F8 warnings.

import { describe, it, expect } from 'vitest';
import {
  routeTaskV2,
  evaluateForceAgentSemantic,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type {
  ActivationConfig,
  UserOverride,
  RoutingEngineConfig,
} from '../../src/core/routing-types.js';
import {
  createDefaultRoutingEngineConfig,
  createDefaultTaskDNA,
} from '../../src/core/routing-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAgent(
  id: string,
  activation?: ActivationConfig,
  extras?: Partial<AgentDefinition>,
): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return { ...base, ...extras, activation } as AgentDefinition;
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map(a => [a.id, a]));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('F8 — Agent Override Semantic Warning', () => {
  // ─── Case 1: low semantic score → warning emitted ──────────────────────────
  it('emits overrideWarnings when forceAgent has low activation score for task intent', () => {
    // doc-writer agent — only activates for documentation tasks.
    const docAgent = makeAgent('doc-writer', {
      rules: [{ when: { 'intent.primary': 'documentation' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    // Task is clearly a security task; doc-writer is a poor semantic fit.
    const decision = routeTaskV2(
      {
        title: 'Security audit for auth jwt vulnerability',
        description: 'Fix JWT vulnerability and add CSRF protection',
        scope: {
          directories: ['src/auth/'],
          filesRead: [],
          filesWrite: ['src/auth/jwt.ts'],
        },
      },
      makePool(docAgent),
      new Map(),
      {
        overrides: [
          { source: 'task-directive', forceAgent: 'doc-writer', priority: 3 },
        ],
      },
    );

    // Override must be honored.
    expect(decision.agentId).toBe('doc-writer');
    expect(decision.overrideSource).toBe('task-directive');

    // Warning must be present and explicit.
    expect(decision.overrideWarnings).toBeDefined();
    expect(decision.overrideWarnings).toBeInstanceOf(Array);
    expect(decision.overrideWarnings!.length).toBeGreaterThan(0);
    expect(decision.overrideWarnings![0]).toMatch(/doc-writer/);
    expect(decision.overrideWarnings![0]).toMatch(/low semantic relevance|excluded/i);

    // Reasoning trail should also contain the warning for debugging.
    expect(decision.reasoning.some(r => r.includes('Override warning'))).toBe(true);
  });

  // ─── Case 2: high score → no warning ───────────────────────────────────────
  it('does NOT emit overrideWarnings when forceAgent has high activation score', () => {
    const securityAgent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    const decision = routeTaskV2(
      {
        title: 'Security audit for auth jwt vulnerability',
        description: 'Fix JWT vulnerability and add CSRF protection',
        scope: {
          directories: ['src/auth/'],
          filesRead: [],
          filesWrite: ['src/auth/jwt.ts'],
        },
      },
      makePool(securityAgent),
      new Map(),
      {
        overrides: [
          { source: 'task-directive', forceAgent: 'security-auditor', priority: 3 },
        ],
      },
    );

    expect(decision.agentId).toBe('security-auditor');
    // No warning expected — the forced agent is a strong semantic match.
    expect(decision.overrideWarnings).toBeUndefined();
    expect(
      decision.reasoning.some(r => r.startsWith('Override warning:')),
    ).toBe(false);
  });

  // ─── Case 3: override is always honored regardless of score ───────────────
  it('honors forceAgent override even when activation score is below threshold', () => {
    // Use an extremely strict agent that never matches anything.
    const strictAgent = makeAgent('strict-agent', {
      rules: [{ when: { 'intent.primary': 'design' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    const decision = routeTaskV2(
      {
        title: 'Refactor configuration module',
        description: 'Clean up types and simplify config loader',
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: ['src/core/config.ts'],
        },
      },
      makePool(strictAgent),
      new Map(),
      {
        overrides: [
          { source: 'task-directive', forceAgent: 'strict-agent', priority: 3 },
        ],
      },
    );

    // Even though activation score is 0, override wins.
    expect(decision.agentId).toBe('strict-agent');
    expect(decision.agentScore).toBe(100);
    expect(decision.agentConfidence).toBe('high');
    expect(decision.overrideSource).toBe('task-directive');

    // Warning expected (override honored, but warned).
    expect(decision.overrideWarnings).toBeDefined();
    expect(decision.overrideWarnings!.length).toBeGreaterThan(0);
  });

  // ─── Case 4: routingMeta field plumbed through to task ────────────────────
  it('routingMeta carries overrideWarnings when present and omits the field otherwise', () => {
    // (a) With warning — wire via the same shape sprint-planner uses.
    const decision = routeTaskV2(
      {
        title: 'Performance optimization for renderer',
        description: 'Optimize rendering speed and cache lookups',
        scope: {
          directories: ['src/render/'],
          filesRead: [],
          filesWrite: ['src/render/loop.ts'],
        },
      },
      makePool(
        makeAgent('doc-writer', {
          rules: [{ when: { 'intent.primary': 'documentation' }, score: 10 }],
          exclude: [],
          minScore: 5,
        }),
      ),
      new Map(),
      {
        overrides: [
          { source: 'task-directive', forceAgent: 'doc-writer', priority: 3 },
        ],
      },
    );

    expect(decision.overrideWarnings).toBeDefined();
    expect(decision.overrideWarnings!.length).toBeGreaterThan(0);

    // Build the same routingMeta object that sprint-planner.ts constructs.
    const routingMeta = {
      taskDNA: decision.taskDNA,
      confidence: decision.agentConfidence,
      routingVersion: 'v2' as const,
      ...(decision.overrideWarnings && decision.overrideWarnings.length > 0
        ? { overrideWarnings: decision.overrideWarnings }
        : {}),
    };

    expect(routingMeta.overrideWarnings).toBeDefined();
    expect(routingMeta.overrideWarnings).toEqual(decision.overrideWarnings);

    // (b) Without warning — field must be absent (not an empty array).
    const goodDecision = routeTaskV2(
      {
        title: 'Performance optimization for renderer',
        description: 'Optimize rendering speed and cache lookups',
        scope: {
          directories: ['src/render/'],
          filesRead: [],
          filesWrite: ['src/render/loop.ts'],
        },
      },
      makePool(
        makeAgent('performance-analyzer', {
          rules: [{ when: { 'intent.primary': 'performance' }, score: 10 }],
          exclude: [],
          minScore: 5,
        }),
      ),
      new Map(),
      {
        overrides: [
          {
            source: 'task-directive',
            forceAgent: 'performance-analyzer',
            priority: 3,
          },
        ],
      },
    );

    expect(goodDecision.overrideWarnings).toBeUndefined();
    const goodRoutingMeta = {
      taskDNA: goodDecision.taskDNA,
      confidence: goodDecision.agentConfidence,
      routingVersion: 'v2' as const,
      ...(goodDecision.overrideWarnings && goodDecision.overrideWarnings.length > 0
        ? { overrideWarnings: goodDecision.overrideWarnings }
        : {}),
    };
    expect('overrideWarnings' in goodRoutingMeta).toBe(false);
  });
});

// ─── Unit tests for the helper itself ──────────────────────────────────────
describe('evaluateForceAgentSemantic', () => {
  function makeCfg(over?: Partial<RoutingEngineConfig>): RoutingEngineConfig {
    return { ...createDefaultRoutingEngineConfig(), ...over };
  }

  it('returns warning when agent is not registered', () => {
    const taskDNA = createDefaultTaskDNA();
    const warning = evaluateForceAgentSemantic(
      'ghost-agent',
      taskDNA,
      new Map(),
      makeCfg(),
    );
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/not registered/);
  });

  it('returns warning when agent is disabled', () => {
    const taskDNA = createDefaultTaskDNA();
    const disabled = makeAgent(
      'disabled-agent',
      {
        rules: [{ when: { 'intent.primary': 'unknown' }, score: 10 }],
        exclude: [],
        minScore: 5,
      },
      { enabled: false },
    );
    const warning = evaluateForceAgentSemantic(
      'disabled-agent',
      taskDNA,
      makePool(disabled),
      makeCfg(),
    );
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/disabled/);
  });

  it('returns warning when agent is excluded by its own activation rules', () => {
    const taskDNA = { ...createDefaultTaskDNA(), intent: { primary: 'implementation' as const, secondary: [], confidence: 0.9 } };
    const excludedAgent = makeAgent('ci-guardian', {
      rules: [{ when: { 'intent.primary': { $not: 'unknown' } }, score: 5 }],
      exclude: [{ when: { 'intent.primary': 'implementation' }, reason: 'Not for impl' }],
      minScore: 5,
    });
    const warning = evaluateForceAgentSemantic(
      'ci-guardian',
      taskDNA,
      makePool(excludedAgent),
      makeCfg(),
    );
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/excluded by its own activation rules/);
  });

  it('returns null when activation score >= threshold', () => {
    const taskDNA = { ...createDefaultTaskDNA(), intent: { primary: 'security' as const, secondary: [], confidence: 0.9 } };
    const goodAgent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });
    const warning = evaluateForceAgentSemantic(
      'security-auditor',
      taskDNA,
      makePool(goodAgent),
      makeCfg(),
    );
    expect(warning).toBeNull();
  });

  it('respects custom forceAgentWarnRatio configuration', () => {
    const taskDNA = { ...createDefaultTaskDNA(), intent: { primary: 'security' as const, secondary: [], confidence: 0.9 } };
    // Agent scores 2 against this intent (rule matches with score=2)
    const weakMatchAgent = makeAgent('weak-match', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 2 }],
      exclude: [],
      minScore: 5,
    });

    // With default ratio 0.3 → threshold = 5 * 0.3 = 1.5 → score 2 >= 1.5 → no warning
    expect(
      evaluateForceAgentSemantic(
        'weak-match',
        taskDNA,
        makePool(weakMatchAgent),
        makeCfg({ forceAgentWarnRatio: 0.3 }),
      ),
    ).toBeNull();

    // With stricter ratio 0.5 → threshold = 5 * 0.5 = 2.5 → score 2 < 2.5 → warning
    const stricter = evaluateForceAgentSemantic(
      'weak-match',
      taskDNA,
      makePool(weakMatchAgent),
      makeCfg({ forceAgentWarnRatio: 0.5 }),
    );
    expect(stricter).not.toBeNull();
    expect(stricter).toMatch(/low semantic relevance/);
  });
});
