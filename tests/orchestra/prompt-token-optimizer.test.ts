import { describe, it, expect, vi, beforeEach } from 'vitest';

// 441: filterSkillPromptsByDNA now records the "all below relevance" drop on the
// existing debugLog channel. Partial-mock utils.js so we can assert that call
// while leaving every other util (readJsonSafe, formatDate, …) real.
vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('../../src/core/utils.js');
  return { ...actual, debugLog: vi.fn() };
});

import {
  computeSkillRelevance,
  filterSkillPrompts,
  filterSkillPromptsByDNA,
} from '../../src/orchestra/prompt-token-optimizer.js';
import { debugLog } from '../../src/core/utils.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';
import type { TaskDNA } from '../../src/core/routing-types.js';

beforeEach(() => {
  vi.clearAllMocks();
});

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
  it('returns high relevance for a testing skill against implementation intent with test domains', () => {
    const skill = makeSkill('testing-expert', ['test', 'coverage', 'vitest']);
    const dna = makeTaskDNA('implementation', ['test', 'coverage']);
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

  it('does NOT match a keyword inside a longer word — word-boundary aware (441)', () => {
    // Regression guard: pre-441 raw substring matching credited the trigger 'latest'
    // for both the 'test' affinity keyword and the 'test' domain, because
    // 'latest'.includes('test') === true. Word-boundary matching must score this zero —
    // 'test' is not a whole word inside 'latest'.
    const skill = makeSkill('release-notes', ['latest']);
    const dna = makeTaskDNA('implementation', ['test']);
    const score = computeSkillRelevance(skill, dna);
    expect(score).toBe(0);
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
    const dna = makeTaskDNA('implementation');

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
    const dna = makeTaskDNA('implementation');
    const result = filterSkillPromptsByDNA(prompts, dna);
    expect(result).toEqual(prompts);
  });

  it('keeps relevant prompts for the given intent', () => {
    const prompts = [
      { name: 'testing-expert', content: 'Focused on test coverage, vitest, specs and assertions.' },
      { name: 'documentation-writer', content: 'Writes docs, README and markdown guides.' },
    ];
    const dna = makeTaskDNA('implementation');
    const result = filterSkillPromptsByDNA(prompts, dna);
    expect(result.some(p => p.name === 'testing-expert')).toBe(true);
  });

  it('returns an EMPTY list (not the full set) when no prompt clears relevance, and logs it (441)', () => {
    // HISTORICAL RATIONALE (retired, not blind-deleted): pre-441 this returned the
    // original `prompts` list as a "safe fallback: no filter applied" — the fear being
    // a worker left with zero skill context. That fallback is retired: a skill-less
    // prompt is legitimate (buildSkillBlock renders nothing for []) and injecting
    // relevance-0 skill bodies wastes tokens. Nothing relevant → [] + a debug line on
    // the existing channel.
    const prompts = [
      { name: 'zzz-unknown-1', content: 'xxxxxxxxxxx' },
      { name: 'zzz-unknown-2', content: 'yyyyyyyyyyy' },
    ];
    const dna = makeTaskDNA('security');
    const result = filterSkillPromptsByDNA(prompts, dna);
    expect(result).toEqual([]);
    expect(debugLog).toHaveBeenCalledWith(
      'filterSkillPromptsByDNA',
      'skill-prompts filtered to zero (all below relevance)',
    );
  });

  it('drops a skill whose name only matched via the removed reverse direction (441)', () => {
    // Pre-441 the name check was bidirectional: `kw.includes(nameLower)` credited the
    // name 'script' because the keyword 'typescript' contains it. That reverse direction
    // is gone — a short name that is merely a substring of a keyword no longer scores,
    // while a name that contains the keyword at a word boundary still passes.
    const prompts = [
      { name: 'typescript-expert', content: 'zzz' }, // forward match: name contains 'typescript'
      { name: 'script', content: 'zzz' },            // pre-441 matched ONLY via the removed reverse direction
    ];
    const dna = makeTaskDNA('implementation');
    const result = filterSkillPromptsByDNA(prompts, dna);
    expect(result.map(p => p.name)).toEqual(['typescript-expert']);
  });

  it('drops a skill whose name only matched a DOMAIN via the removed reverse direction (441)', () => {
    // The symmetric domain check had the same reverse-direction bug: pre-441
    // `d.includes(nameLower)` credited the name 'data' for the domain 'database'
    // ('database'.includes('data') === true). That reverse direction is gone too — a
    // name that is merely a substring of a domain no longer scores, while a name that
    // contains the domain at a word boundary still passes.
    const prompts = [
      { name: 'database-migrator', content: 'zzz' }, // forward match: name contains 'database'
      { name: 'data', content: 'zzz' },              // pre-441 matched ONLY via the removed reverse direction
    ];
    const dna = makeTaskDNA('implementation', ['database']);
    const result = filterSkillPromptsByDNA(prompts, dna);
    expect(result.map(p => p.name)).toEqual(['database-migrator']);
  });
});
