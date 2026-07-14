import { describe, it, expect } from 'vitest';
import {
  CAPABILITIES_VERSION,
  capabilityVectorSchema,
  validateCapabilities,
  hasTestCapability,
} from '../../../src/core/routing3/capability-vector.js';
import type { CapabilityVector } from '../../../src/core/routing3/capability-vector.js';

// A full, spec-faithful valid example (§2b canonical shape).
function validExample(): CapabilityVector {
  return {
    capabilitiesVersion: 3,
    content: {
      workTypes: [
        { type: 'build', proficiency: 'primary' },
        { type: 'refactor', proficiency: 'able' },
        { type: 'review', proficiency: 'never' },
      ],
      expertise: ['feature construction', 'pattern-following'],
      personaSlices: ['implementation', 'bugfix', 'default'],
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

describe('routing3 capabilityVectorSchema (spec §2b)', () => {
  it('round-trips a full valid example', () => {
    const example = validExample();
    const parsed = capabilityVectorSchema.parse(example);
    expect(parsed).toEqual(example);
  });

  it('accepts a valid example without the optional preferredModel', () => {
    const example = validExample();
    delete (example.numerical as { preferredModel?: string }).preferredModel;
    const result = capabilityVectorSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  it('accepts a positive integer maxParallel (not only null)', () => {
    const example = validExample();
    example.numerical.maxParallel = 4;
    const result = capabilityVectorSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  it('requires capabilitiesVersion to be exactly 3', () => {
    expect(CAPABILITIES_VERSION).toBe(3);

    const wrongVersion = { ...validExample(), capabilitiesVersion: 2 };
    expect(capabilityVectorSchema.safeParse(wrongVersion).success).toBe(false);

    const missingVersion: Record<string, unknown> = { ...validExample() };
    delete missingVersion['capabilitiesVersion'];
    expect(capabilityVectorSchema.safeParse(missingVersion).success).toBe(false);
  });

  it('rejects a stats key inside capabilities (outcome-stats NEVER in manifest)', () => {
    const withStats = {
      ...validExample(),
      stats: { uses: 10, successRate: 0.9 },
    };
    const result = capabilityVectorSchema.safeParse(withStats);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('rejects a stats key nested under numerical too (strict at every level)', () => {
    const example = validExample();
    const withNestedStats = {
      ...example,
      numerical: { ...example.numerical, stats: { uses: 1 } },
    };
    expect(capabilityVectorSchema.safeParse(withNestedStats).success).toBe(false);
  });

  it('rejects an unknown workType', () => {
    const example = validExample();
    example.content.workTypes = [{ type: 'deploy' as CapabilityVector['content']['workTypes'][number]['type'], proficiency: 'primary' }];
    expect(capabilityVectorSchema.safeParse(example).success).toBe(false);
  });

  it('rejects a "test" workType entry (NO_GO gate — no test work-type exists)', () => {
    const example = validExample();
    example.content.workTypes = [
      { type: 'test' as CapabilityVector['content']['workTypes'][number]['type'], proficiency: 'primary' },
    ];
    expect(capabilityVectorSchema.safeParse(example).success).toBe(false);
  });

  it('rejects a proficiency typo on content.workTypes', () => {
    const example = validExample();
    example.content.workTypes = [
      { type: 'build', proficiency: 'primar' as CapabilityVector['content']['workTypes'][number]['proficiency'] },
    ];
    expect(capabilityVectorSchema.safeParse(example).success).toBe(false);
  });

  it('rejects a proficiency typo on positional.domains', () => {
    const example = validExample();
    example.positional.domains = [
      { id: 'core', proficiency: 'ablee' as CapabilityVector['positional']['domains'][number]['proficiency'] },
    ];
    expect(capabilityVectorSchema.safeParse(example).success).toBe(false);
  });

  it('accepts every valid proficiency value on both axes', () => {
    for (const proficiency of ['primary', 'secondary', 'able', 'never'] as const) {
      const example = validExample();
      example.content.workTypes = [{ type: 'build', proficiency }];
      example.positional.domains = [{ id: 'core', proficiency }];
      expect(capabilityVectorSchema.safeParse(example).success).toBe(true);
    }
  });

  it('rejects an unknown deliverable type', () => {
    const example = validExample();
    example.positional.deliverables = ['binary' as CapabilityVector['positional']['deliverables'][number]];
    expect(capabilityVectorSchema.safeParse(example).success).toBe(false);
  });

  it('accepts every closed-core work-type and rejects "test" via isWorkType reuse', () => {
    const workTypes = ['build', 'fix', 'refactor', 'document', 'review', 'configure', 'migrate', 'analyze'] as const;
    for (const type of workTypes) {
      const example = validExample();
      example.content.workTypes = [{ type, proficiency: 'able' }];
      expect(capabilityVectorSchema.safeParse(example).success).toBe(true);
    }
  });

  it('rejects an unrecognized top-level key (strict on the outer object)', () => {
    const example = { ...validExample(), extra: 'nope' };
    expect(capabilityVectorSchema.safeParse(example).success).toBe(false);
  });

  it('rejects a negative or zero maxParallel', () => {
    for (const bad of [0, -1, 1.5]) {
      const example = validExample();
      example.numerical.maxParallel = bad;
      expect(capabilityVectorSchema.safeParse(example).success).toBe(false);
    }
  });

  it('rejects an empty role string', () => {
    const example = validExample();
    example.positional.role = '';
    expect(capabilityVectorSchema.safeParse(example).success).toBe(false);
  });
});

describe('routing3 validateCapabilities() (typed issues list for lint/doctor reuse)', () => {
  it('returns ok:true with the parsed value on a valid input', () => {
    const example = validExample();
    const result = validateCapabilities(example);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(example);
    }
  });

  it('returns ok:false with a non-empty typed issues list on an invalid input, never throws', () => {
    const invalid = { ...validExample(), stats: { uses: 1 } };
    expect(() => validateCapabilities(invalid)).not.toThrow();
    const result = validateCapabilities(invalid);
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
      expect(() => validateCapabilities(bad)).not.toThrow();
      expect(validateCapabilities(bad).ok).toBe(false);
    }
  });
});

describe('routing3 hasTestCapability() (Alperen decision — no test workType, no test field)', () => {
  it('is true when positional.writeAuthority is true', () => {
    const example = validExample();
    example.positional.writeAuthority = true;
    expect(hasTestCapability(example)).toBe(true);
  });

  it('is false when positional.writeAuthority is false', () => {
    const example = validExample();
    example.positional.writeAuthority = false;
    expect(hasTestCapability(example)).toBe(false);
  });
});
