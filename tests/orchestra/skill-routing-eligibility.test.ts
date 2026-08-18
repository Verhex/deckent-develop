// Typed skill routing eligibility — the adapter's anti-silent-skip contract
// (row 9034, sprint task 561-002).
//
// Before this, `routing-plan-adapter.ts` dropped every non-candidate skill with
// a bare `continue` and never consulted `enabled` at all, so "disabled",
// "retired", "quarantined", "no profile" and "broken profile" were one
// indistinguishable silence. This suite pins the five typed reasons, the
// fail-closed ordering, and the invariant that makes a silent skip impossible:
// every input row lands in exactly one of `skills` / `rejections`.
//
// Hermetic: pure functions over in-memory definitions — no tmpdir, no disk, no
// dependency on this checkout's .deckent/ or builtins/ contents. Profiles are
// NEVER hand-written here; every one comes from the real derivation authority
// (`deriveCanonicalSkillProfile`, src/core/skill-profile-derivation.ts), so this
// suite cannot drift away from what routing actually admits.

import { describe, it, expect } from 'vitest';
import {
  evaluateSkillRoutingEligibility,
  selectRoutableSkills,
} from '../../src/orchestra/routing-plan-adapter.js';
import type { SkillRoutingRejectionReason } from '../../src/orchestra/routing-plan-adapter.js';
import { deriveCanonicalSkillProfile } from '../../src/core/skill-profile-derivation.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { EffectiveSkill, SkillDispositionState } from '../../src/core/skill-pool.js';

/** A skill whose manifest metadata is rich enough for canonical derivation. */
function routableDefinition(id: string): SkillDefinition {
  return createSkillDefinition({
    id,
    name: id,
    description: `Implement and review ${id} components with the project conventions`,
    category: 'framework',
    triggers: ['build', 'component', 'review'],
    stackDetection: { files: ['package.json'], dependencies: ['react'], commands: ['vite'] },
    priority: 7,
  });
}

/** A skill the derivation authority cannot produce a profile for. */
function metadataLessDefinition(id: string): SkillDefinition {
  return createSkillDefinition({ id, name: id, description: '   ' });
}

/** A skill carrying an authored profile that fails canonical V3 validation. */
function brokenProfileDefinition(id: string): SkillDefinition {
  return createSkillDefinition({
    id,
    name: id,
    description: `Implement ${id} features`,
    triggers: ['build'],
    profile: { profileVersion: 'not-a-version', workTypes: 'nonsense' },
  });
}

/** Wrap a definition as one resolved catalog row (the S5 projection shape). */
function catalogEntry(
  definition: SkillDefinition,
  dispositionState: SkillDispositionState,
): EffectiveSkill {
  const masked = dispositionState === 'quarantined' || dispositionState === 'retired';
  return {
    id: definition.id,
    layer: 'project',
    provenance: { kind: 'project' },
    disposition: { state: dispositionState, reasonCode: null, since: null, supersededBy: null },
    masked,
    definition,
    sourcePath: `.deckent/skills/${definition.id}/manifest.json`,
    overrides: [],
    statsSource: 'defaults',
    routing: deriveCanonicalSkillProfile(definition),
  };
}

describe('evaluateSkillRoutingEligibility', () => {
  it('admits a skill the canonical derivation authority made routable', () => {
    const definition = routableDefinition('react-specialist');
    const routing = deriveCanonicalSkillProfile(definition);
    expect(routing.status).toBe('routable');

    const verdict = evaluateSkillRoutingEligibility({
      skillId: definition.id,
      dispositionState: 'active',
      masked: false,
      routing,
    });

    expect(verdict.admitted).toBe(true);
    if (!verdict.admitted) throw new Error('unreachable');
    // The admitted profile IS the derivation authority's output — not a copy.
    expect(verdict.profile).toBe(routing.status === 'routable' ? routing.profile : null);
  });

  it.each<[SkillDispositionState, SkillRoutingRejectionReason]>([
    ['disabled', 'disabled'],
    ['quarantined', 'quarantined'],
    ['retired', 'retired'],
  ])('rejects a %s skill with the typed reason %s', (state, reason) => {
    const definition = routableDefinition('docker-expert');
    const verdict = evaluateSkillRoutingEligibility({
      skillId: definition.id,
      dispositionState: state,
      masked: state !== 'disabled',
      routing: deriveCanonicalSkillProfile(definition),
    });

    expect(verdict.admitted).toBe(false);
    if (verdict.admitted) throw new Error('unreachable');
    expect(verdict.reason).toBe(reason);
    expect(verdict.detail).toContain(state);
  });

  it('reports profile-missing when no profile can be derived', () => {
    const definition = metadataLessDefinition('empty-skill');
    const routing = deriveCanonicalSkillProfile(definition);
    expect(routing.status).toBe('unroutable');

    const verdict = evaluateSkillRoutingEligibility({
      skillId: definition.id,
      dispositionState: 'active',
      masked: false,
      routing,
    });

    expect(verdict.admitted).toBe(false);
    if (verdict.admitted) throw new Error('unreachable');
    expect(verdict.reason).toBe('profile-missing');
    expect(verdict.detail).toContain('insufficient-source-metadata');
  });

  it('reports invalid-profile when an authored profile fails validation', () => {
    const definition = brokenProfileDefinition('bad-profile-skill');
    const verdict = evaluateSkillRoutingEligibility({
      skillId: definition.id,
      dispositionState: 'active',
      masked: false,
      routing: deriveCanonicalSkillProfile(definition),
    });

    expect(verdict.admitted).toBe(false);
    if (verdict.admitted) throw new Error('unreachable');
    expect(verdict.reason).toBe('invalid-profile');
    expect(verdict.detail).toContain('invalid-manifest-profile');
  });

  it('refuses a masked row fail-closed even when the disposition reads active', () => {
    const definition = routableDefinition('masked-skill');
    const verdict = evaluateSkillRoutingEligibility({
      skillId: definition.id,
      dispositionState: 'active',
      masked: true,
      routing: deriveCanonicalSkillProfile(definition),
    });

    expect(verdict.admitted).toBe(false);
    if (verdict.admitted) throw new Error('unreachable');
    expect(verdict.reason).toBe('quarantined');
  });

  it('reports the disposition before the profile problem', () => {
    // A retired skill with an unusable profile is retired — not "profile-missing".
    const verdict = evaluateSkillRoutingEligibility({
      skillId: 'retired-and-empty',
      dispositionState: 'retired',
      masked: true,
      routing: deriveCanonicalSkillProfile(metadataLessDefinition('retired-and-empty')),
    });

    expect(verdict.admitted).toBe(false);
    if (verdict.admitted) throw new Error('unreachable');
    expect(verdict.reason).toBe('retired');
  });
});

describe('selectRoutableSkills', () => {
  it('applies the enabled filter the pool path never had, with a typed reason', () => {
    const disabled = createSkillDefinition({
      ...routableDefinition('disabled-skill'),
      enabled: false,
    });
    const selection = selectRoutableSkills({
      source: 'pool',
      definitions: [routableDefinition('ok-skill'), disabled],
    });

    expect(selection.skills.map((s) => s.skillId)).toEqual(['ok-skill']);
    expect(selection.rejections).toEqual([
      {
        skillId: 'disabled-skill',
        reason: 'disabled',
        detail: 'disposition=disabled',
        source: 'pool',
      },
    ]);
  });

  it('partitions an in-memory pool with no silent skip', () => {
    const definitions = [
      routableDefinition('ok-skill'),
      metadataLessDefinition('empty-skill'),
      brokenProfileDefinition('bad-profile-skill'),
      createSkillDefinition({ ...routableDefinition('disabled-skill'), enabled: false }),
    ];

    const selection = selectRoutableSkills({ source: 'pool', definitions });

    // The invariant: nothing disappears between input and output.
    expect(selection.skills.length + selection.rejections.length).toBe(definitions.length);
    expect(selection.skills.map((s) => s.skillId)).toEqual(['ok-skill']);
    expect(selection.rejections.map((r) => [r.skillId, r.reason])).toEqual([
      ['empty-skill', 'profile-missing'],
      ['bad-profile-skill', 'invalid-profile'],
      ['disabled-skill', 'disabled'],
    ]);
    expect(selection.rejections.every((r) => r.source === 'pool')).toBe(true);
    expect(selection.rejections.every((r) => r.detail.length > 0)).toBe(true);
  });

  it('partitions the canonical catalog projection with no silent skip', () => {
    const entries: EffectiveSkill[] = [
      catalogEntry(routableDefinition('ok-skill'), 'active'),
      catalogEntry(routableDefinition('quarantined-skill'), 'quarantined'),
      catalogEntry(routableDefinition('retired-skill'), 'retired'),
      catalogEntry(routableDefinition('disabled-skill'), 'disabled'),
      catalogEntry(metadataLessDefinition('empty-skill'), 'active'),
    ];

    const selection = selectRoutableSkills({ source: 'catalog', entries });

    expect(selection.skills.length + selection.rejections.length).toBe(entries.length);
    expect(selection.skills.map((s) => s.skillId)).toEqual(['ok-skill']);
    expect(selection.rejections.map((r) => [r.skillId, r.reason])).toEqual([
      ['quarantined-skill', 'quarantined'],
      ['retired-skill', 'retired'],
      ['disabled-skill', 'disabled'],
      ['empty-skill', 'profile-missing'],
    ]);
    expect(selection.rejections.every((r) => r.source === 'catalog')).toBe(true);
  });

  it('covers every typed rejection reason across the two sources', () => {
    const fromCatalog = selectRoutableSkills({
      source: 'catalog',
      entries: [
        catalogEntry(routableDefinition('quarantined-skill'), 'quarantined'),
        catalogEntry(routableDefinition('retired-skill'), 'retired'),
      ],
    });
    const fromPool = selectRoutableSkills({
      source: 'pool',
      definitions: [
        metadataLessDefinition('empty-skill'),
        brokenProfileDefinition('bad-profile-skill'),
        createSkillDefinition({ ...routableDefinition('disabled-skill'), enabled: false }),
      ],
    });

    const observed = new Set<SkillRoutingRejectionReason>(
      [...fromCatalog.rejections, ...fromPool.rejections].map((r) => r.reason),
    );
    expect([...observed].sort()).toEqual([
      'disabled',
      'invalid-profile',
      'profile-missing',
      'quarantined',
      'retired',
    ]);
  });
});
