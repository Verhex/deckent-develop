// PCOMP-W5C (sprint-352-008, re-run of never-dispatched 351-018) — kind-affinity
// signal, config-gated via RoutingOptions.kindAffinity (default-off). Mirrors the
// getRoleMismatchPenalty pattern (PCOMP-W5): additive, non-exclusionary, agent-ID-
// scoped so it never hard-excludes a candidate — only tips ties.
//
// 'refactor'-kind tasks are refactorer's named specialty → +KIND_AFFINITY_BONUS.
// 'code-development' is the generic catch-all kind that must not let refactorer's
// baseline impl@7 activation score (agent-pool.ts) auto-win ties against a
// domain-specialized candidate → KIND_AFFINITY_CODE_DEV_PENALTY.

import { describe, it, expect } from 'vitest';
import {
  routeTaskV2,
  getKindAffinityBonus,
  KIND_AFFINITY_BONUS,
  KIND_AFFINITY_CODE_DEV_PENALTY,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgent(id: string, activation?: ActivationConfig): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return activation ? { ...base, activation } as AgentDefinition : base;
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map(a => [a.id, a]));
}

function makeSkillPool(): Map<string, SkillDefinition> {
  return new Map();
}

// ─── Unit: getKindAffinityBonus ─────────────────────────────────────────────

describe('PCOMP-W5C: getKindAffinityBonus', () => {
  it('bonuses refactorer on a refactor-kind task', () => {
    expect(getKindAffinityBonus('refactorer', 'refactor')).toBe(KIND_AFFINITY_BONUS);
    expect(getKindAffinityBonus('refactorer', 'refactor')).toBe(3);
  });
  it('penalizes refactorer on a code-development-kind task', () => {
    expect(getKindAffinityBonus('refactorer', 'code-development')).toBe(KIND_AFFINITY_CODE_DEV_PENALTY);
    expect(getKindAffinityBonus('refactorer', 'code-development')).toBe(-2);
  });
  it('has no opinion on refactorer for every other kind', () => {
    expect(getKindAffinityBonus('refactorer', 'documentation')).toBe(0);
    expect(getKindAffinityBonus('refactorer', 'audit')).toBe(0);
    expect(getKindAffinityBonus('refactorer', 'security')).toBe(0);
    expect(getKindAffinityBonus('refactorer', 'test')).toBe(0);
    expect(getKindAffinityBonus('refactorer', 'generic')).toBe(0);
  });
  it('has no opinion without a task kind', () => {
    expect(getKindAffinityBonus('refactorer', undefined)).toBe(0);
  });
  it('never applies to any agent other than refactorer', () => {
    expect(getKindAffinityBonus('architect', 'refactor')).toBe(0);
    expect(getKindAffinityBonus('architect', 'code-development')).toBe(0);
    expect(getKindAffinityBonus('api-builder', 'refactor')).toBe(0);
    expect(getKindAffinityBonus('security-auditor', 'code-development')).toBe(0);
  });
});

// ─── Flag-off: byte-identical routing ────────────────────────────────────────

describe('routing-v2: kindAffinity flag-off (byte-identical)', () => {
  it('omitted option === explicit false, even on a refactor-kind task', () => {
    const refAgent = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'refactor' }, score: 7 }],
      exclude: [],
      minScore: 5,
    });
    const archAgent = makeAgent('architect', {
      rules: [{ when: { 'intent.primary': 'refactor' }, score: 7 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Refactor the routing module',
      description: 'Restructure routing-engine.ts for clarity',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/routing-engine.ts'] },
      type: 'refactor' as const,
    };

    const resultDefault = routeTaskV2(task, makePool(refAgent, archAgent), makeSkillPool());
    const resultExplicitOff = routeTaskV2(task, makePool(refAgent, archAgent), makeSkillPool(), {
      kindAffinity: false,
    });

    expect(resultDefault.agentId).toBe(resultExplicitOff.agentId);
    expect(resultDefault.agentScore).toBe(resultExplicitOff.agentScore);
    expect(resultDefault.reasoning).toEqual(resultExplicitOff.reasoning);
  });

  it('omitted option === explicit false on a code-development-kind task', () => {
    const refAgent = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 7 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Implement a new feature',
      description: 'Add a new feature to the core module',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/new-feature.ts'] },
      type: 'code-development' as const,
    };

    const resultDefault = routeTaskV2(task, makePool(refAgent), makeSkillPool());
    const resultExplicitOff = routeTaskV2(task, makePool(refAgent), makeSkillPool(), {
      kindAffinity: false,
    });

    expect(resultDefault.agentId).toBe('refactorer');
    expect(resultDefault.agentScore).toBe(resultExplicitOff.agentScore);
    expect(resultDefault.reasoning.some(r => r.includes('kind-affinity'))).toBe(false);
  });
});

// ─── Flag-on: fixture-pool behavior ──────────────────────────────────────────

describe('routing-v2: kindAffinity flag-on', () => {
  it('refactor-kind: bonus flips the winner from architect to refactorer', () => {
    // architect(8) > refactorer(7) pre-bonus. Flag-off: architect wins outright.
    // Flag-on: refactorer's named-specialty bonus (7+3=10) overtakes architect.
    const refAgent = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'refactor' }, score: 7 }],
      exclude: [],
      minScore: 5,
    });
    const archAgent = makeAgent('architect', {
      rules: [{ when: { 'intent.primary': 'refactor' }, score: 8 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Refactor the routing module',
      description: 'Restructure routing-engine.ts for clarity',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/routing-engine.ts'] },
      type: 'refactor' as const,
    };

    const resultOff = routeTaskV2(task, makePool(refAgent, archAgent), makeSkillPool(), {
      kindAffinity: false,
    });
    const resultOn = routeTaskV2(task, makePool(refAgent, archAgent), makeSkillPool(), {
      kindAffinity: true,
    });

    expect(resultOff.agentId).toBe('architect');
    expect(resultOn.agentId).toBe('refactorer');
    expect(resultOn.agentScore).toBe(7 + KIND_AFFINITY_BONUS);
    expect(resultOn.reasoning.some(r => r.includes("Agent 'refactorer' kind-affinity bonus: +3"))).toBe(true);
  });

  it('code-development-kind: penalty flips the winner away from refactorer', () => {
    // refactorer=7 (generic impl@7) vs api-builder=6 (below refactorer without the
    // signal). Flag-off: refactorer wins (7 > 6). Flag-on: refactorer's −2
    // catch-all penalty drops it to 5, api-builder (6) wins instead.
    const refAgent = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 7 }],
      exclude: [],
      minScore: 5,
    });
    const apiAgent = makeAgent('api-builder', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 6 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Implement a new API endpoint',
      description: 'Add a new endpoint to the API layer',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/new-endpoint.ts'] },
      type: 'code-development' as const,
    };

    const resultOff = routeTaskV2(task, makePool(refAgent, apiAgent), makeSkillPool(), {
      kindAffinity: false,
    });
    const resultOn = routeTaskV2(task, makePool(refAgent, apiAgent), makeSkillPool(), {
      kindAffinity: true,
    });

    expect(resultOff.agentId).toBe('refactorer');
    expect(resultOn.agentId).toBe('api-builder');
    expect(resultOn.reasoning.some(r => r.includes("Agent 'refactorer' kind-affinity bonus: -2"))).toBe(true);
  });

  it('flag-on: an unrelated task kind leaves refactorer unaffected', () => {
    // task.type='audit' (neither 'refactor' nor 'code-development') while the
    // title/description still classify as 'implementation' intent, so the
    // agent's activation rule matches identically in both runs — isolating
    // the kind-affinity signal itself (which only cares about task.type).
    const refAgent = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 7 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Implement retry logic for the payment queue',
      description: 'Add exponential backoff retry to the payment queue consumer',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/payment-queue.ts'] },
      type: 'audit' as const,
    };

    const resultOff = routeTaskV2(task, makePool(refAgent), makeSkillPool(), { kindAffinity: false });
    const resultOn = routeTaskV2(task, makePool(refAgent), makeSkillPool(), { kindAffinity: true });

    expect(resultOn.agentScore).toBe(resultOff.agentScore);
    expect(resultOn.reasoning.some(r => r.includes('kind-affinity'))).toBe(false);
  });
});
