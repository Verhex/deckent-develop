// ═══ skill-unlock battery (sprint-561 / 561-004, ADR-D-007 hand-completion) ═══
//
// End-to-end proof that the skill-unlock chain is WIRED, not fixture-local:
// the REAL derivation authority (deriveCanonicalSkillProfile) feeds the REAL
// eligibility adapter (evaluateSkillRoutingEligibility / selectRoutableSkills)
// whose output flows through the REAL directive authority
// (applySkillDirectiveAuthority) into the REAL delivery-evidence builder
// (buildSkillDeliveryEvidence). No stage is reimplemented locally — every
// import below is the production module the sprint spawner itself uses.
//
// Hermetic: synthetic SkillDefinitions only (no repo-disk read), so a fresh
// checkout passes regardless of the installed .deckent/skills state. The
// real-disk 30/30 persisted-profile count is landing evidence (result notes),
// not a test-time dependency.
import { describe, it, expect } from 'vitest';
import { createSkillDefinition, type SkillDefinition } from '../../src/core/skill-types.js';
import { deriveCanonicalSkillProfile } from '../../src/core/skill-profile-derivation.js';
import {
  evaluateSkillRoutingEligibility,
  selectRoutableSkills,
  type SkillRoutingRejectionReason,
} from '../../src/orchestra/routing-plan-adapter.js';
import { applySkillDirectiveAuthority, buildSkillDeliveryEvidence } from '../../src/orchestra/task-builder.js';
import type { Task } from '../../src/core/task-types.js';

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

function metadataLessDefinition(id: string): SkillDefinition {
  return createSkillDefinition({ id, name: id, description: '   ' });
}

function batteryTask(partial: Partial<Task>): Task {
  return {
    id: '999-001',
    title: 'battery',
    description: 'battery',
    model: 'm',
    priority: 'NORMAL',
    reason: 'battery',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'PENDING',
    sprintId: 'sprint-battery',
    ...partial,
  } as Task;
}

describe('skill-unlock battery — the full chain on real production modules', () => {
  it('(a) derivation → eligibility → directive authority yields a NON-EMPTY assignedSkills set', () => {
    const pool = [
      routableDefinition('api-builder'),
      routableDefinition('ci-testing'),
      metadataLessDefinition('ghost-skill'),
    ];
    const selection = selectRoutableSkills({ source: 'pool', definitions: pool });
    expect(selection.skills.map((s) => s.skillId).sort()).toEqual(['api-builder', 'ci-testing']);

    const task = batteryTask({ assignedSkills: selection.skills.map((s) => s.skillId) });
    applySkillDirectiveAuthority(task);
    expect(task.assignedSkills).toEqual(['api-builder', 'ci-testing']);
    expect(task.assignedSkills!.length).toBeGreaterThan(0); // the unlock itself
  });

  it('(b) a non-derivable / disabled / retired skill is rejected with its typed reason — never silently dropped', () => {
    const cases: Array<{ definition: SkillDefinition; disposition: 'active' | 'disabled' | 'retired'; reason: SkillRoutingRejectionReason }> = [
      { definition: metadataLessDefinition('no-metadata'), disposition: 'active', reason: 'profile-missing' },
      { definition: routableDefinition('off-skill'), disposition: 'disabled', reason: 'disabled' },
      { definition: routableDefinition('old-skill'), disposition: 'retired', reason: 'retired' },
    ];
    for (const { definition, disposition, reason } of cases) {
      const verdict = evaluateSkillRoutingEligibility({
        skillId: definition.id,
        dispositionState: disposition,
        masked: disposition !== 'disabled' && disposition !== 'active',
        routing: deriveCanonicalSkillProfile(definition),
      });
      expect(verdict.admitted).toBe(false);
      if (verdict.admitted) throw new Error('unreachable');
      expect(verdict.reason).toBe(reason);
    }
  });

  it('(c) force survives an empty routing result and exclude prunes — consistently through the single authority', () => {
    // Empty routing + force → force lives (the 9034 overwrite bug class).
    const forcedOnly = batteryTask({ assignedSkills: [], forceSkills: ['testing-expert'] });
    applySkillDirectiveAuthority(forcedOnly);
    expect(forcedOnly.assignedSkills).toEqual(['testing-expert']);

    // Routing + exclude → pruned; force beats exclude on the same id.
    const mixed = batteryTask({
      assignedSkills: ['api-builder', 'ci-testing'],
      forceSkills: ['ci-testing'],
      excludeSkills: ['api-builder', 'ci-testing'],
    });
    applySkillDirectiveAuthority(mixed);
    expect(mixed.assignedSkills).toEqual(['ci-testing']);

    // Idempotent — the second application changes nothing.
    const before = [...(mixed.assignedSkills ?? [])];
    applySkillDirectiveAuthority(mixed);
    expect(mixed.assignedSkills).toEqual(before);
  });

  it('(d) delivery evidence records exactly the ids that reached the prompt, and names undelivered forced ids', () => {
    const task = batteryTask({
      assignedSkills: ['api-builder', 'ci-testing'],
      forceSkills: ['ci-testing', 'unresolvable-skill'],
    });
    const evidence = buildSkillDeliveryEvidence(task, ['api-builder', 'ci-testing']);
    expect(evidence.deliveredSkillIds.sort()).toEqual(['api-builder', 'ci-testing']);
    expect(evidence.undeliveredForcedSkillIds).toEqual(['unresolvable-skill']);
    expect(evidence.source).toBe('worker-prompt');

    // No credit without delivery: an empty delivery set carries no delivered ids.
    const empty = buildSkillDeliveryEvidence(task, []);
    expect(empty.deliveredSkillIds).toEqual([]);
    expect(empty.undeliveredForcedSkillIds.sort()).toEqual(['ci-testing', 'unresolvable-skill']);
  });

  it('(e) coverage census — counts derived from the scan, never hardcoded', () => {
    const pool = [
      routableDefinition('a'), routableDefinition('b'), routableDefinition('c'),
      metadataLessDefinition('x'), metadataLessDefinition('y'),
    ];
    const selection = selectRoutableSkills({ source: 'pool', definitions: pool });
    const routable = selection.skills.length;
    const rejected = selection.rejections.length;
    expect(routable + rejected).toBe(pool.length);
    expect(routable).toBe(pool.filter((d) => deriveCanonicalSkillProfile(d).status === 'routable').length);
    for (const rejection of selection.rejections) {
      expect(rejection.reason).toBeTruthy(); // every drop is typed
    }
  });
});
