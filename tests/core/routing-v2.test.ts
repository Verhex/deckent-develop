// ─── Routing V2 Tests — Sprint 324-007 ───────────────────────────────────────
// Covers: skill-first reorder, skill→agent affinity flag, agent-cache flag.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  routeTaskV2,
  agentSelectionCache,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';
import { SKILL_AGENT_AFFINITY_BONUS } from '../../src/core/activation-engine.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgent(id: string, activation?: ActivationConfig): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return activation ? { ...base, activation } as AgentDefinition : base;
}

function makeSkill(id: string, activation?: ActivationConfig): SkillDefinition {
  const base = createSkillDefinition({ id, name: id });
  return activation ? { ...base, activation } as SkillDefinition : base;
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map(a => [a.id, a]));
}

function makeSkillPool(...skills: SkillDefinition[]): Map<string, SkillDefinition> {
  return new Map(skills.map(s => [s.id, s]));
}

const baseTask = {
  title: 'Add login page',
  description: 'Create a React login page with Google OAuth',
  scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/Login.tsx'] },
};

// ─── Flag-off: byte-identical routing ────────────────────────────────────────

describe('routing-v2: flag-off (byte-identical)', () => {
  it('flags default-off → same agentId as pre-reorder routing', () => {
    const secAgent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });
    const refAgent = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 7 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Fix JWT token validation',
      description: 'Audit JWT verification logic for vulnerabilities',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/jwt.ts'] },
    };

    // Without flags
    const resultOff = routeTaskV2(task, makePool(secAgent, refAgent), makeSkillPool());
    // With flags explicitly false
    const resultExplicit = routeTaskV2(task, makePool(secAgent, refAgent), makeSkillPool(), {
      skillAgentAffinity: false,
      agentCache: false,
    });

    expect(resultOff.agentId).toBe(resultExplicit.agentId);
    expect(resultOff.skillIds).toEqual(resultExplicit.skillIds);
    expect(resultOff.agentScore).toBe(resultExplicit.agentScore);
  });

  it('skill-first order: skills selected without agent pre-selection (routing still correct)', () => {
    const frontendAgent = makeAgent('frontend-designer', {
      rules: [{ when: { 'intent.primary': 'design' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });
    const reactSkill = makeSkill('react-specialist', {
      rules: [{ when: { 'intent.primary': 'design' }, score: 8 }],
      exclude: [],
      minScore: 3,
    });

    const decision = routeTaskV2(
      {
        title: 'Build UI component',
        description: 'Create a responsive design component for the dashboard',
        scope: { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/Card.tsx'] },
      },
      makePool(frontendAgent),
      makeSkillPool(reactSkill),
    );

    // Skills selected (react-specialist activated by design intent)
    expect(decision.skillIds).toContain('react-specialist');
    // Agent selected correctly
    expect(decision.agentId).toBe('frontend-designer');
  });
});

// ─── Affinity-on: skill-matching agent gets bonus ────────────────────────────

describe('routing-v2: skillAgentAffinity flag', () => {
  it('affinity-on: frontend-designer gets bonus when react-specialist skill is assigned', () => {
    // Setup: src/core/ scope — NO domain/surface bonuses for frontend-designer
    // (dashboard/ui domains are not in scope, so no DOMAIN_MATCH_BONUS or USER_SURFACE_BONUS).
    //
    // Without affinity:
    //   refactorer = 6 (≥ agentMinScore=5) → only candidate → wins
    //   frontend-designer = 4 (< agentMinScore=5) → below threshold, not a candidate
    //
    // With affinity (react-specialist ∈ assignedSkills → SKILL_AGENT_AFFINITY_BONUS=+3):
    //   frontend-designer = 4 + 3 = 7 ≥ 5 → candidate, score 7 > refactorer 6 → wins
    const frontendAgent = makeAgent('frontend-designer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 4 }],
      exclude: [],
      minScore: 3,
    });
    const refactorer = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 6 }],
      exclude: [],
      minScore: 5,
    });
    // react-specialist activates for implementation → selected in skill-first step
    const reactSkill = makeSkill('react-specialist', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 5 }],
      exclude: [],
      minScore: 3,
    });

    // src/core/ scope: no domain/surface bonus for frontend-designer
    const task = {
      title: 'Implement new feature in core module',
      description: 'Add implementation to the routing module for feature X',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/new-feature.ts'] },
    };

    const resultOff = routeTaskV2(task, makePool(frontendAgent, refactorer), makeSkillPool(reactSkill), {
      skillAgentAffinity: false,
    });
    const resultOn = routeTaskV2(task, makePool(frontendAgent, refactorer), makeSkillPool(reactSkill), {
      skillAgentAffinity: true,
    });

    // With affinity off: refactorer=6≥5 is the only candidate (frontend=4<5 is below threshold)
    expect(resultOff.agentId).toBe('refactorer');

    // With affinity on: frontend-designer = 4+3=7 ≥ 5 → candidate, beats refactorer (6)
    expect(resultOn.agentId).toBe('frontend-designer');
    expect(resultOn.agentScore).toBeGreaterThanOrEqual(4 + SKILL_AGENT_AFFINITY_BONUS);

    // Affinity reasoning must be logged
    expect(resultOn.reasoning.some(r => r.includes('skill-affinity'))).toBe(true);
  });

  it('affinity-on: agent NOT in SKILL_AGENT_MAP gets no bonus', () => {
    const archAgent = makeAgent('architect', {
      rules: [{ when: { 'intent.primary': 'architecture' }, score: 8 }],
      exclude: [],
      minScore: 5,
    });
    // typescript-expert skill does NOT map to architect in SKILL_AGENT_MAP
    const tsSkill = makeSkill('typescript-expert', {
      rules: [{ when: { 'intent.primary': 'architecture' }, score: 4 }],
      exclude: [],
      minScore: 3,
    });

    const task = {
      title: 'Design new module architecture',
      description: 'Plan architecture for the new routing module',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/new-module.ts'] },
    };

    const resultOff = routeTaskV2(task, makePool(archAgent), makeSkillPool(tsSkill), {
      skillAgentAffinity: false,
    });
    const resultOn = routeTaskV2(task, makePool(archAgent), makeSkillPool(tsSkill), {
      skillAgentAffinity: true,
    });

    // architect score unchanged — typescript-expert doesn't map to architect
    expect(resultOff.agentId).toBe('architect');
    expect(resultOn.agentId).toBe('architect');
    expect(resultOff.agentScore).toBe(resultOn.agentScore);
  });

  it('affinity-on: excluded agent stays excluded (bonus never overrides exclusion)', () => {
    const frontendAgent = makeAgent('frontend-designer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 6 }],
      exclude: [{ when: { 'intent.primary': 'implementation' }, reason: 'excluded-for-test' }],
      minScore: 5,
    });
    const refactorer = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 7 }],
      exclude: [],
      minScore: 5,
    });
    const reactSkill = makeSkill('react-specialist', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 5 }],
      exclude: [],
      minScore: 3,
    });

    const task = {
      title: 'Implement login',
      description: 'Add login functionality',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/login.ts'] },
    };

    const result = routeTaskV2(task, makePool(frontendAgent, refactorer), makeSkillPool(reactSkill), {
      skillAgentAffinity: true,
    });

    // frontend-designer is excluded — affinity bonus must NOT resurrect it
    expect(result.agentId).toBe('refactorer');
  });
});

// ─── Agent cache: hit / miss ──────────────────────────────────────────────────

describe('routing-v2: agentCache flag', () => {
  beforeEach(() => {
    agentSelectionCache.clear();
  });

  it('cache miss: cold call returns correct result', () => {
    const secAgent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Fix XSS vulnerability',
      description: 'Sanitize user input to prevent XSS attacks',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/sanitize.ts'] },
    };

    const result = routeTaskV2(task, makePool(secAgent), makeSkillPool(), {
      agentCache: true,
    });

    expect(result.agentId).toBe('security-auditor');
    expect(result.reasoning.some(r => r.includes('[agent-cache hit]'))).toBe(false);
  });

  it('cache hit: second call returns cached result', () => {
    const secAgent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Fix XSS vulnerability',
      description: 'Sanitize user input to prevent XSS attacks',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/sanitize.ts'] },
    };

    // First call populates cache
    const first = routeTaskV2(task, makePool(secAgent), makeSkillPool(), { agentCache: true });
    expect(first.agentId).toBe('security-auditor');

    // Second call should hit cache
    const second = routeTaskV2(task, makePool(secAgent), makeSkillPool(), { agentCache: true });
    expect(second.agentId).toBe('security-auditor');
    expect(second.reasoning.some(r => r.includes('[agent-cache hit]'))).toBe(true);
  });

  it('cache key includes skills: different skills = different cache entries', () => {
    const agent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });
    const skillA = makeSkill('security-specialist', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 6 }],
      exclude: [],
      minScore: 3,
    });
    const skillB = makeSkill('typescript-expert', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 4 }],
      exclude: [],
      minScore: 3,
    });

    const task = {
      title: 'Security audit',
      description: 'Audit authentication security',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/index.ts'] },
    };

    // Call with skillA forced (different skills → different cache entry)
    const r1 = routeTaskV2(task, makePool(agent), makeSkillPool(skillA), {
      agentCache: true,
      overrides: [{ source: 'task-directive', forceSkills: ['security-specialist'], priority: 3 }],
    });
    // Call with skillB forced
    const r2 = routeTaskV2(task, makePool(agent), makeSkillPool(skillA, skillB), {
      agentCache: true,
      overrides: [{ source: 'task-directive', forceSkills: ['typescript-expert'], priority: 3 }],
    });

    // Both calls found the agent correctly
    expect(r1.agentId).toBe('security-auditor');
    expect(r2.agentId).toBe('security-auditor');

    // Neither should be a cache hit (different skill sets = different keys)
    expect(r1.reasoning.some(r => r.includes('[agent-cache hit]'))).toBe(false);
    expect(r2.reasoning.some(r => r.includes('[agent-cache hit]'))).toBe(false);
  });

  it('cache disabled: no cache hit even on repeated calls', () => {
    const agent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Fix CSRF vulnerability',
      description: 'Add CSRF token validation',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/csrf.ts'] },
    };

    routeTaskV2(task, makePool(agent), makeSkillPool(), { agentCache: false });
    const second = routeTaskV2(task, makePool(agent), makeSkillPool(), { agentCache: false });

    // Cache disabled — no cache hit line in reasoning
    expect(second.reasoning.some(r => r.includes('[agent-cache hit]'))).toBe(false);
    // Cache singleton is also empty (nothing was stored)
    expect(agentSelectionCache.size).toBe(0);
  });

  it('agentSelectionCache.clear() invalidates all entries', () => {
    const agent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    const task = {
      title: 'Security fix',
      description: 'Fix authentication vulnerability',
      scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/fix.ts'] },
    };

    // Populate cache
    routeTaskV2(task, makePool(agent), makeSkillPool(), { agentCache: true });
    expect(agentSelectionCache.size).toBe(1);

    // Clear (simulates pool/config change)
    agentSelectionCache.clear();
    expect(agentSelectionCache.size).toBe(0);

    // Next call is a cold miss
    const result = routeTaskV2(task, makePool(agent), makeSkillPool(), { agentCache: true });
    expect(result.reasoning.some(r => r.includes('[agent-cache hit]'))).toBe(false);
    expect(result.agentId).toBe('security-auditor');
  });
});
