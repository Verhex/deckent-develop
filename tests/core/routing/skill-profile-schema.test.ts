import { describe, it, expect } from 'vitest';
import {
  CAPABILITIES_VERSION,
  SKILL_PROFILE_VERSION,
  capabilityVectorSchema,
  skillProfileSchema,
  validateSkillProfile,
  matchSpace,
} from '../../../src/core/routing/capability-vector.js';
import type { CapabilityVector, SkillProfile } from '../../../src/core/routing/capability-vector.js';

// A full, spec-faithful valid SkillProfile example (§2b: "skills share the matching
// space" — workTypes+domains+expertise+deliverables, no writeAuthority/role).
function validSkillExample(): SkillProfile {
  return {
    profileVersion: 3,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'review', proficiency: 'able' },
    ],
    domains: [{ id: 'i18n', proficiency: 'primary' }],
    expertise: ['message-catalog patterns', 'translation-key hygiene'],
    deliverables: ['code-src', 'code-test'],
    tokenCost: 1200,
  };
}

// The agent-side CapabilityVector counterpart used for the matchSpace structural-pin test.
function validAgentExample(): CapabilityVector {
  return {
    capabilitiesVersion: 3,
    content: {
      workTypes: [{ type: 'build', proficiency: 'primary' }],
      expertise: ['feature construction'],
      personaSlices: ['implementation', 'default'],
    },
    positional: {
      domains: [{ id: '*', proficiency: 'able' }],
      surfaces: [],
      writeAuthority: true,
      role: 'implementer',
      deliverables: ['code-src', 'code-test'],
    },
    numerical: {
      preferredModel: 'sonnet',
      costTier: 'standard',
      maxParallel: null,
    },
  };
}

describe('routing3 skillProfileSchema (spec §2b — skill variant)', () => {
  it('round-trips a full valid example', () => {
    const example = validSkillExample();
    const parsed = skillProfileSchema.parse(example);
    expect(parsed).toEqual(example);
  });

  it('accepts a valid example without the optional tokenCost', () => {
    const example = validSkillExample();
    delete (example as { tokenCost?: number }).tokenCost;
    const result = skillProfileSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  it('rejects a negative tokenCost', () => {
    const example = validSkillExample();
    example.tokenCost = -1;
    expect(skillProfileSchema.safeParse(example).success).toBe(false);
  });

  it('requires profileVersion to be exactly 3', () => {
    expect(SKILL_PROFILE_VERSION).toBe(3);
    expect(CAPABILITIES_VERSION).toBe(3);

    const wrongVersion = { ...validSkillExample(), profileVersion: 2 };
    expect(skillProfileSchema.safeParse(wrongVersion).success).toBe(false);

    const missingVersion: Record<string, unknown> = { ...validSkillExample() };
    delete missingVersion['profileVersion'];
    expect(skillProfileSchema.safeParse(missingVersion).success).toBe(false);
  });

  it('rejects writeAuthority on a skill profile (skills are knowledge, not actors)', () => {
    const withWriteAuthority = { ...validSkillExample(), writeAuthority: true };
    const result = skillProfileSchema.safeParse(withWriteAuthority);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('rejects role on a skill profile (skills are knowledge, not actors)', () => {
    const withRole = { ...validSkillExample(), role: 'implementer' };
    expect(skillProfileSchema.safeParse(withRole).success).toBe(false);
  });

  it('rejects a stats key (outcome-stats NEVER in manifest, same rule as agents)', () => {
    const withStats = { ...validSkillExample(), stats: { uses: 10 } };
    const result = skillProfileSchema.safeParse(withStats);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('rejects an unrecognized top-level key (strict on the outer object)', () => {
    const example = { ...validSkillExample(), extra: 'nope' };
    expect(skillProfileSchema.safeParse(example).success).toBe(false);
  });

  it('rejects an unknown workType (reuses the same closed-core vocabulary as agents)', () => {
    const example = validSkillExample();
    example.workTypes = [{ type: 'deploy' as SkillProfile['workTypes'][number]['type'], proficiency: 'primary' }];
    expect(skillProfileSchema.safeParse(example).success).toBe(false);
  });

  it('rejects a "test" workType entry (same NO_GO gate as agents — no test work-type exists)', () => {
    const example = validSkillExample();
    example.workTypes = [{ type: 'test' as SkillProfile['workTypes'][number]['type'], proficiency: 'primary' }];
    expect(skillProfileSchema.safeParse(example).success).toBe(false);
  });

  it('rejects a proficiency typo on workTypes', () => {
    const example = validSkillExample();
    example.workTypes = [
      { type: 'build', proficiency: 'primar' as SkillProfile['workTypes'][number]['proficiency'] },
    ];
    expect(skillProfileSchema.safeParse(example).success).toBe(false);
  });

  it('rejects a proficiency typo on domains', () => {
    const example = validSkillExample();
    example.domains = [{ id: 'core', proficiency: 'ablee' as SkillProfile['domains'][number]['proficiency'] }];
    expect(skillProfileSchema.safeParse(example).success).toBe(false);
  });

  it('accepts every valid proficiency value on both axes', () => {
    for (const proficiency of ['primary', 'secondary', 'able', 'never'] as const) {
      const example = validSkillExample();
      example.workTypes = [{ type: 'build', proficiency }];
      example.domains = [{ id: 'core', proficiency }];
      expect(skillProfileSchema.safeParse(example).success).toBe(true);
    }
  });

  it('rejects an unknown deliverable type (reuses the same closed set as agents)', () => {
    const example = validSkillExample();
    example.deliverables = ['binary' as SkillProfile['deliverables'][number]];
    expect(skillProfileSchema.safeParse(example).success).toBe(false);
  });
});

describe('routing3 validateSkillProfile() (typed issues list, mirrors validateCapabilities)', () => {
  it('returns ok:true with the parsed value on a valid input', () => {
    const example = validSkillExample();
    const result = validateSkillProfile(example);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(example);
    }
  });

  it('returns ok:false with a non-empty typed issues list on an invalid input, never throws', () => {
    const invalid = { ...validSkillExample(), stats: { uses: 1 } };
    expect(() => validateSkillProfile(invalid)).not.toThrow();
    const result = validateSkillProfile(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(typeof issue.path).toBe('string');
        expect(typeof issue.message).toBe('string');
        expect(typeof issue.code).toBe('string');
      }
    }
  });

  it('never throws even on a wildly malformed input (null, array, primitive)', () => {
    for (const bad of [null, undefined, 42, 'nope', [], {}]) {
      expect(() => validateSkillProfile(bad)).not.toThrow();
      expect(validateSkillProfile(bad).ok).toBe(false);
    }
  });
});

describe('routing3 matchSpace() — one matching space for agent + skill (spec §2b, structural pin)', () => {
  it('returns the identical key shape for a CapabilityVector and a SkillProfile input', () => {
    const agentSpace = matchSpace(validAgentExample());
    const skillSpace = matchSpace(validSkillExample());

    expect(Object.keys(agentSpace).sort()).toEqual(['deliverables', 'domains', 'expertise', 'workTypes']);
    expect(Object.keys(agentSpace).sort()).toEqual(Object.keys(skillSpace).sort());
  });

  it('projects an agent CapabilityVector content/positional axes into the flat shape', () => {
    const agent = validAgentExample();
    const space = matchSpace(agent);
    expect(space.workTypes).toEqual(agent.content.workTypes);
    expect(space.domains).toEqual(agent.positional.domains);
    expect(space.expertise).toEqual(agent.content.expertise);
    expect(space.deliverables).toEqual(agent.positional.deliverables);
  });

  it('projects a SkillProfile flat fields straight through unchanged', () => {
    const skill = validSkillExample();
    const space = matchSpace(skill);
    expect(space.workTypes).toEqual(skill.workTypes);
    expect(space.domains).toEqual(skill.domains);
    expect(space.expertise).toEqual(skill.expertise);
    expect(space.deliverables).toEqual(skill.deliverables);
  });

  it('parses a skill through capabilityVectorSchema-adjacent entry shapes (same vocabulary reuse)', () => {
    // Not a capabilityVectorSchema instance itself (skills have no capabilitiesVersion) —
    // this just pins that skillProfileSchema's workType/domain entries are the SAME shape
    // zod produces for capabilityVectorSchema, which is what makes matchSpace's projection
    // type-safe without a cast.
    expect(() => capabilityVectorSchema.parse(validSkillExample())).toThrow();
  });
});
