import { describe, expect, it } from 'vitest';

import type { CapabilityVector, SkillProfile } from '../../../src/core/routing/capability-vector.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';
import type { RequirementVector } from '../../../src/core/routing/requirement-vector.js';
import {
  routeTaskV3,
  SkillSelectionHoldError,
  type RouteCatalog,
  type SkillCandidate,
} from '../../../src/core/routing/route-task-v3.js';
import type { AgentCandidate } from '../../../src/core/routing/stage-eliminate.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;

function agent(): AgentCandidate {
  const capabilities: CapabilityVector = {
    capabilitiesVersion: 3,
    content: {
      workTypes: [{ type: 'build', proficiency: 'primary' }],
      expertise: [],
      personaSlices: ['implementation'],
    },
    positional: {
      domains: [{ id: '*', proficiency: 'able' }],
      surfaces: [], writeAuthority: true, role: 'implementer', deliverables: ['code-src'],
    },
    numerical: { costTier: 'standard', maxParallel: null },
  };
  return { agentId: 'builder', capabilities, source: 'builtin' };
}

function skill(skillId: string, domain: string, admitted = true, tokenCost = 500): SkillCandidate {
  const profile: SkillProfile = {
    profileVersion: 3,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: domain, proficiency: 'primary' }],
    expertise: [], deliverables: ['code-src'], tokenCost,
  };
  return {
    skillId,
    profile,
    profileDigest: DIGEST_A,
    packageDigest: DIGEST_B,
    applicabilityDigest: DIGEST_C,
    provenance: 'builtin',
    tokenCost,
    applicability: admitted
      ? { admitted: true, matchedEvidence: [`task:language:${domain}`], profileDigest: DIGEST_C }
      : {
          admitted: false,
          reason: 'required-evidence-missing',
          detail: `task:language:${domain}`,
          matchedEvidence: [], missingEvidence: [`task:language:${domain}`],
          profileDigest: DIGEST_C,
        },
  };
}

function requirement(domains: string[]): RequirementVector {
  return {
    content: {
      workType: 'build', subtype: null, summary: null, semanticTags: null,
      provenance: 'structural', calibratedConfidence: 0.9,
    },
    positional: {
      domains: domains.map(id => ({ id, weight: 1 / domains.length, evidence: `scope:${id}` })),
      deliverables: [{ type: 'code-src', ratio: 1 }], surfaces: [], needsWrite: true, language: 'en',
    },
    numerical: {
      estimatedSize: 'small', fileCount: domains.length, moduleCount: 1,
      effortClass: 'normal', riskClass: 'low',
    },
  };
}

function catalog(skills: SkillCandidate[]): RouteCatalog {
  return {
    agents: [agent()], skills,
    vocabulary: {
      domains: BUILTIN_DOMAINS,
      knownDomainIds: new Set(BUILTIN_DOMAINS.map(domain => domain.id)),
    },
  };
}

const task = {
  title: 'Cross-cutting implementation', description: 'Structural input only.',
  scope: { filesRead: [], filesWrite: ['src/core/a.ts'], directories: [] },
};

describe('skill selection control-plane P0', () => {
  it('keeps a 1,000-skill catalog deterministic under input reordering and concurrent callers', async () => {
    const domains = BUILTIN_DOMAINS.slice(0, 8).map(domain => domain.id);
    const skills = Array.from({ length: 1_000 }, (_, index) =>
      skill(`scale-skill-${String(index).padStart(4, '0')}`, domains[index % domains.length]!, true, 100));
    const options = {
      config: DEFAULT_ROUTING_V3_CONFIG,
      requirement: requirement(domains),
      skillContext: { evidenceDigest: DIGEST_A, catalogDigest: DIGEST_B },
    } as const;

    const forward = await routeTaskV3(task, catalog(skills), options);
    const reverse = await routeTaskV3(task, catalog([...skills].reverse()), options);
    const concurrent = await Promise.all(
      Array.from({ length: 32 }, () => routeTaskV3(task, catalog(skills), options)),
    );

    expect(forward.skillSelection.candidates).toHaveLength(1_000);
    expect(forward.skillIds.length).toBeGreaterThan(3);
    expect(forward.skillIds.length).toBeLessThanOrEqual(
      DEFAULT_ROUTING_V3_CONFIG.skillComposition.hardMaxSkills,
    );
    expect(reverse.skillIds).toEqual(forward.skillIds);
    expect(reverse.skillSelection).toEqual(forward.skillSelection);
    expect(concurrent.every(decision =>
      JSON.stringify(decision.skillSelection) === JSON.stringify(forward.skillSelection)))
      .toBe(true);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.skillSelection.candidates)).toBe(true);
  });

  it('selects a variable 0..N composition by marginal coverage, not a fixed top-three slice', async () => {
    const domains = ['core-runtime', 'i18n', 'security', 'docs'];
    const decision = await routeTaskV3(
      task,
      catalog(domains.map((domain, index) => skill(`skill-${index + 1}`, domain))),
      {
        config: DEFAULT_ROUTING_V3_CONFIG,
        requirement: requirement(domains),
        skillContext: { evidenceDigest: DIGEST_A, catalogDigest: DIGEST_B },
      },
    );

    expect(decision.skillIds).toHaveLength(4);
    expect(decision.skillSelection.selectedSkillIds).toEqual(decision.skillIds);
    expect(decision.skillSelection.composition).toMatchObject({
      totalTokenCost: 2000,
      hardMaxSkills: DEFAULT_ROUTING_V3_CONFIG.skillComposition.hardMaxSkills,
    });
    expect(decision.skillSelection.candidates.filter(candidate => candidate.selected)).toHaveLength(4);
  });

  it('records every inapplicable candidate as a typed rejection and returns honest-empty', async () => {
    const decision = await routeTaskV3(task, catalog([skill('python-expert', 'core-runtime', false)]), {
      config: DEFAULT_ROUTING_V3_CONFIG,
      requirement: requirement(['core-runtime']),
      skillContext: { evidenceDigest: DIGEST_A, catalogDigest: DIGEST_B },
    });

    expect(decision.skillIds).toEqual([]);
    expect(decision.skillSelection.candidates).toEqual([
      expect.objectContaining({
        skillId: 'python-expert', selected: false,
        rejectionReason: 'required-evidence-missing',
      }),
    ]);
  });

  it('never lets forceSkills bypass hard applicability', async () => {
    await expect(routeTaskV3(task, catalog([skill('python-expert', 'core-runtime', false)]), {
      config: DEFAULT_ROUTING_V3_CONFIG,
      requirement: requirement(['core-runtime']),
      skillContext: {
        evidenceDigest: DIGEST_A, catalogDigest: DIGEST_B,
        forceSkillIds: ['python-expert'],
      },
    })).rejects.toBeInstanceOf(SkillSelectionHoldError);
  });

  it('stops composition at the prompt-token budget with a typed candidate reason', async () => {
    const domains = ['core-runtime', 'i18n'];
    const decision = await routeTaskV3(task, catalog([
      skill('large-core', 'core-runtime', true, 5_000),
      skill('large-i18n', 'i18n', true, 5_000),
    ]), {
      config: {
        ...DEFAULT_ROUTING_V3_CONFIG,
        skillComposition: {
          ...DEFAULT_ROUTING_V3_CONFIG.skillComposition,
          promptTokenBudget: 6_000,
        },
      },
      requirement: requirement(domains),
      skillContext: { evidenceDigest: DIGEST_A, catalogDigest: DIGEST_B },
    });

    expect(decision.skillIds).toHaveLength(1);
    expect(decision.skillSelection.candidates).toContainEqual(
      expect.objectContaining({ selected: false, rejectionReason: 'prompt-token-budget' }),
    );
  });
});
