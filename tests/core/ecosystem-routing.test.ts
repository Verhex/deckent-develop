// ─── Ecosystem Intelligence → Routing Engine Wire Tests ─────────────────────
// Verifies that ecosystem-intelligence analysis is consumed by routing-engine
// for skill→agent affinity scoring (ADR-075 affinity pattern).

import { describe, it, expect } from 'vitest';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import { analyzeSkillInMemory } from '../../src/orchestra/ecosystem-intelligence.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgent(
  id: string,
  activation?: ActivationConfig,
): AgentDefinition {
  const base = createAgentDefinition({ id, name: id });
  return activation ? { ...base, activation } : base;
}

function makeSkill(
  id: string,
  overrides?: Partial<SkillDefinition>,
): SkillDefinition {
  return createSkillDefinition({ id, name: id, ...overrides });
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map(a => [a.id, a]));
}

function makeSkillPool(...skills: SkillDefinition[]): Map<string, SkillDefinition> {
  return new Map(skills.map(s => [s.id, s]));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ecosystem-intelligence → routing-engine wire', () => {
  it('ecosystem signal influences skill affinity: security keywords → security skill selected for security task', () => {
    // Skill with security keywords but NO pre-persisted V2 activation.
    // routing-engine should use ecosystem analysis to derive intent-based rules.
    const securitySkill = makeSkill('security-specialist', {
      description: 'security audit vulnerability auth crypto',
      triggers: ['security', 'auth', 'vulnerability', 'crypto', 'permission'],
      category: 'domain',
    });

    const securityAgent = makeAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    // Use 3 files across 2 directories → medium task → maxSkills=2, no reduction (cross-cutting)
    const decision = routeTaskV2(
      {
        title: 'Security audit JWT auth module',
        description: 'Check for JWT vulnerabilities, XSS, and auth bypass issues',
        scope: {
          directories: ['src/auth/', 'src/api/'],
          filesRead: [],
          filesWrite: ['src/auth/jwt.ts', 'src/auth/session.ts', 'src/api/middleware.ts'],
        },
      },
      makePool(securityAgent),
      makeSkillPool(securitySkill),
    );

    // ecosystem analysis derives security intent → security-specialist selected
    expect(decision.skillIds).toContain('security-specialist');
    // routing reasoning should mention ecosystem-derived rule or the skill selection
    const skillSelected = decision.reasoning.some(r => r.includes('security-specialist') && r.includes('selected'));
    expect(skillSelected).toBe(true);
  });

  it('no-signal skill → ecosystem produces fallback (score<5) → V1 migration path → no crash', () => {
    // A skill with no keywords — ecosystem fallback score=3 < 5 → V1 migration
    const emptySkill = makeSkill('empty-skill', {
      description: '',
      triggers: [],
      category: 'tool',
    });

    expect(() =>
      routeTaskV2(
        {
          title: 'Add a new feature',
          description: 'Generic implementation task',
          scope: {
            directories: ['src/'],
            filesRead: [],
            filesWrite: ['src/feature.ts'],
          },
        },
        makePool(),
        makeSkillPool(emptySkill),
      ),
    ).not.toThrow();
  });

  it('explicit V2 activation takes priority over ecosystem analysis (regression guard)', () => {
    // Skill has BOTH V2 activation AND security keywords.
    // The V2 activation (implementation intent) should WIN over ecosystem inference.
    const skillWithV2 = makeSkill('hybrid-skill', {
      description: 'security auth vulnerability audit',
      triggers: ['security', 'auth'],
      category: 'domain',
      activation: {
        rules: [{ when: { 'intent.primary': 'implementation' }, score: 8 }],
        exclude: [],
        minScore: 5,
      },
    });

    const implementationAgent = makeAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 8 }],
      exclude: [],
      minScore: 5,
    });

    // 3 files across 2 modules → medium, maxSkills=2
    const decision = routeTaskV2(
      {
        title: 'Implement new feature module with API endpoints',
        description: 'Add REST API endpoints for user profile management',
        scope: {
          directories: ['src/api/', 'src/core/'],
          filesRead: [],
          filesWrite: ['src/api/profile.ts', 'src/api/routes.ts', 'src/core/types.ts'],
        },
      },
      makePool(implementationAgent),
      makeSkillPool(skillWithV2),
    );

    // V2 activation for implementation — skill should appear for an impl task
    expect(decision.skillIds).toContain('hybrid-skill');
  });

  it('analyzeSkillInMemory: security keywords → primary intent is security with high score', () => {
    const result = analyzeSkillInMemory({
      id: 'security-specialist',
      name: 'Security Specialist',
      description: 'security vulnerability audit',
      category: 'domain',
      triggers: ['security', 'auth', 'vulnerability', 'crypto'],
    });

    const primaryRule = result.rules[0];
    expect(result.rules.length).toBeGreaterThan(0);
    expect(primaryRule).toBeDefined();
    // Primary rule should be for security intent
    expect(primaryRule!.when['intent.primary']).toBe('security');
    // Multiple keyword matches → score ≥ 8
    expect(primaryRule!.score).toBeGreaterThanOrEqual(8);
  });

  it('analyzeSkillInMemory: empty data produces fallback rule (score=3) without throwing', () => {
    const result = analyzeSkillInMemory({});
    expect(result.rules.length).toBeGreaterThan(0);
    // Fallback: single rule with score 3 (below the routing minScore threshold of 5)
    expect(result.rules[0]!.score).toBe(3);
    expect(result.minScore).toBe(5);
  });
});
