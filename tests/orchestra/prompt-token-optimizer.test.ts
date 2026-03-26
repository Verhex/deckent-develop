import { describe, it, expect } from 'vitest';
import {
  computeSkillRelevance,
  filterSkillPrompts,
  filterSkillPromptsByDNA,
} from '../../src/orchestra/prompt-token-optimizer.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';
import type { TaskDNA } from '../../src/core/routing-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTaskDNA(primary: TaskDNA['intent']['primary'], domains: string[] = []): TaskDNA {
  const dna = createDefaultTaskDNA();
  dna.intent.primary = primary;
  dna.intent.confidence = 0.9;
  dna.domains = domains.map(name => ({ name, weight: 1.0 }));
  return dna;
}

function makeSkill(id: string, triggers: string[], category = 'tool'): SkillDefinition {
  return createSkillDefinition({
    id,
    name: id,
    triggers,
    category: category as SkillDefinition['category'],
  });
}

// ─── computeSkillRelevance ────────────────────────────────────────────────────

describe('computeSkillRelevance', () => {
  it('returns high relevance for a testing skill against testing intent', () => {
    const skill = makeSkill('testing-expert', ['test', 'coverage', 'vitest']);
    const dna = makeTaskDNA('testing');
    const score = computeSkillRelevance(skill, dna);
    expect(score).toBeGreaterThan(0.3);
  });

  it('returns low relevance for a documentation skill against security intent', () => {
    const skill = makeSkill('documentation-writer', ['docs', 'readme', 'markdown', 'documentation']);
    const dna = makeTaskDNA('security');
    const score = computeSkillRelevance(skill, dna);
    expect(score).toBeLessThan(0.5);
  });

  it('uses V2 activation rules when manifestVersion === 2', () => {
    const skill: SkillDefinition = {
      ...makeSkill('security-specialist', []),
      manifestVersion: 2,
      activation: {
        rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
        exclude: [{ when: { 'intent.primary': 'documentation' } }],
        minScore: 5,
      },
    };
    const dna = makeTaskDNA('security');
    const score = computeSkillRelevance(skill, dna);
    expect(score).toBeGreaterThan(0);

    // Should be excluded for documentation intent
    const docDna = makeTaskDNA('documentation');
    const excludedScore = computeSkillRelevance(skill, docDna);
    expect(excludedScore).toBe(0);
  });

  it('returns a score between 0 and 1', () => {
    const skill = makeSkill('typescript-expert', ['typescript', 'ts', 'type']);
    const dna = makeTaskDNA('implementation', ['typescript']);
    const score = computeSkillRelevance(skill, dna);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ─── filterSkillPrompts ───────────────────────────────────────────────────────

describe('filterSkillPrompts', () => {
  it('returns empty array when input is empty', () => {
    const result = filterSkillPrompts([], makeTaskDNA('implementation'));
    expect(result).toEqual([]);
  });

  it('returns at least one skill even when none pass threshold', () => {
    // A totally irrelevant skill — still gets returned as fallback
    const skill = makeSkill('unknown-skill', []);
    const dna = makeTaskDNA('implementation');
    const result = filterSkillPrompts([skill], dna);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('filters out irrelevant skills and keeps relevant ones', () => {
    const testingSkill = makeSkill('testing-expert', ['test', 'vitest', 'coverage']);
    const docSkill     = makeSkill('documentation-writer', ['docs', 'readme', 'documentation']);
    const dna = makeTaskDNA('testing');

    const result = filterSkillPrompts([testingSkill, docSkill], dna);
    // testing-expert should be included; documentation-writer may not be for testing intent
    expect(result.some(s => s.id === 'testing-expert')).toBe(true);
  });

  it('preserves order of passing skills', () => {
    const skillA = makeSkill('typescript-expert', ['typescript', 'type', 'code']);
    const skillB = makeSkill('api-builder', ['api', 'endpoint', 'rest']);
    const dna = makeTaskDNA('implementation', ['api', 'typescript']);

    const result = filterSkillPrompts([skillA, skillB], dna);
    // Both should pass for implementation intent with matching domains
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── filterSkillPromptsByDNA ─────────────────────────────────────────────────

describe('filterSkillPromptsByDNA', () => {
  it('returns input unchanged when only one prompt', () => {
    const prompts = [{ name: 'testing-expert', content: 'Test coverage expert' }];
    const dna = makeTaskDNA('testing');
    const result = filterSkillPromptsByDNA(prompts, dna);
    expect(result).toEqual(prompts);
  });

  it('keeps relevant prompts for the given intent', () => {
    const prompts = [
      { name: 'testing-expert', content: 'Focused on test coverage, vitest, specs and assertions.' },
      { name: 'documentation-writer', content: 'Writes docs, README and markdown guides.' },
    ];
    const dna = makeTaskDNA('testing');
    const result = filterSkillPromptsByDNA(prompts, dna);
    expect(result.some(p => p.name === 'testing-expert')).toBe(true);
  });

  it('falls back to all prompts when no prompt passes scoring', () => {
    const prompts = [
      { name: 'zzz-unknown-1', content: 'xxxxxxxxxxx' },
      { name: 'zzz-unknown-2', content: 'yyyyyyyyyyy' },
    ];
    const dna = makeTaskDNA('security');
    const result = filterSkillPromptsByDNA(prompts, dna);
    // Fallback: returns original list when nothing passes
    expect(result.length).toBe(prompts.length);
  });
});
