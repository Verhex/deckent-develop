import { describe, it, expect } from 'vitest';
import { selectSkills, resolveComposition } from '../../src/core/skill-selector.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition, ProjectStack } from '../../src/core/skill-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePool(...defs: Array<Partial<SkillDefinition> & { id: string; name: string }>): Map<string, SkillDefinition> {
  const pool = new Map<string, SkillDefinition>();
  for (const def of defs) {
    const skill = createSkillDefinition(def);
    pool.set(skill.id, skill);
  }
  return pool;
}

function makeStack(overrides?: Partial<ProjectStack>): ProjectStack {
  return {
    language: 'typescript',
    framework: 'express',
    dependencies: ['express', 'typescript', 'vitest'],
    buildTool: 'tsc',
    testFramework: 'vitest',
    detectedAt: '2026-03-22T00:00:00Z',
    ...overrides,
  };
}

// ─── selectSkills ──────────────────────────────────────────────────────────

describe('selectSkills', () => {
  it('returns empty result for empty pool', () => {
    const pool = new Map<string, SkillDefinition>();
    const result = selectSkills(
      { title: 'Test', description: 'desc' },
      makeStack(),
      pool,
    );
    expect(result.skills).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('matches skill by trigger keyword in task title', () => {
    const pool = makePool({
      id: 'test-skill',
      name: 'Test Skill',
      triggers: ['test', 'coverage'],
    });
    const result = selectSkills(
      { title: 'Add test coverage', description: 'unit tests' },
      null,
      pool,
    );
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].id).toBe('test-skill');
  });

  it('matches skill by trigger keyword in task description', () => {
    const pool = makePool({
      id: 'deploy-skill',
      name: 'Deploy Skill',
      triggers: ['deploy', 'ci'],
    });
    const result = selectSkills(
      { title: 'Setup pipeline', description: 'deploy to production' },
      null,
      pool,
    );
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].id).toBe('deploy-skill');
  });

  it('gives +3 score for language category matching projectStack.language', () => {
    const pool = makePool({
      id: 'ts-lang',
      name: 'TypeScript',
      category: 'language',
      triggers: ['typescript'],
    });
    const result = selectSkills(
      { title: 'Refactor code', description: 'improve types' },
      makeStack({ language: 'typescript' }),
      pool,
    );
    expect(result.scores.get('ts-lang')).toBeGreaterThanOrEqual(3);
    expect(result.skills).toHaveLength(1);
  });

  it('gives +3 score for framework category matching projectStack.framework', () => {
    const pool = makePool({
      id: 'express-fw',
      name: 'Express',
      category: 'framework',
      triggers: ['express'],
    });
    const result = selectSkills(
      { title: 'Add middleware', description: 'auth layer' },
      makeStack({ framework: 'express' }),
      pool,
    );
    expect(result.scores.get('express-fw')).toBeGreaterThanOrEqual(3);
    expect(result.skills).toHaveLength(1);
  });

  it('gives +2 per trigger keyword match', () => {
    const pool = makePool({
      id: 'multi-trigger',
      name: 'Multi',
      triggers: ['auth', 'login', 'oauth'],
    });
    const result = selectSkills(
      { title: 'Add auth and login', description: 'with oauth' },
      null,
      pool,
    );
    // 3 triggers matched * 2 = 6
    expect(result.scores.get('multi-trigger')).toBe(6);
  });

  it('gives +1 per agent expertise/trigger overlap', () => {
    const pool = makePool({
      id: 'security-skill',
      name: 'Security',
      triggers: ['security', 'auth'],
    });
    const result = selectSkills(
      { title: 'Fix security issues', description: 'auth checks' },
      null,
      pool,
      { id: 'agent-1', expertise: ['security'] },
    );
    const score = result.scores.get('security-skill')!;
    // 2 trigger matches (security + auth) * 2 = 4, plus 1 expertise overlap = 5
    expect(score).toBe(5);
  });

  it('gives +2 per stack dependency match', () => {
    const pool = makePool({
      id: 'express-skill',
      name: 'Express Skill',
      triggers: [],
      stackDetection: { files: [], dependencies: ['express'], commands: [] },
    });
    const result = selectSkills(
      { title: 'Add routes', description: 'REST endpoints' },
      makeStack({ dependencies: ['express', 'cors'] }),
      pool,
    );
    expect(result.scores.get('express-skill')).toBe(2);
  });

  it('gives +1 priority bonus for skills with priority > 0', () => {
    const pool = makePool({
      id: 'pri-skill',
      name: 'Priority Skill',
      triggers: ['test'],
      priority: 5,
    });
    const result = selectSkills(
      { title: 'Add test', description: 'unit tests' },
      null,
      pool,
    );
    // trigger match: 2 + priority bonus: 1 = 3
    expect(result.scores.get('pri-skill')).toBe(3);
  });

  it('filters out disabled skills', () => {
    const pool = makePool({
      id: 'disabled',
      name: 'Disabled',
      triggers: ['test'],
      enabled: false,
    });
    const result = selectSkills(
      { title: 'Add test', description: 'unit tests' },
      null,
      pool,
    );
    expect(result.skills).toHaveLength(0);
  });

  it('sorts by score descending', () => {
    const pool = makePool(
      { id: 'low', name: 'Low', triggers: ['test'] },
      { id: 'high', name: 'High', triggers: ['test', 'coverage', 'vitest'] },
    );
    const result = selectSkills(
      { title: 'Add test coverage with vitest', description: 'full coverage' },
      null,
      pool,
    );
    expect(result.skills[0].id).toBe('high');
  });

  it('breaks ties by priority descending', () => {
    const pool = makePool(
      { id: 'low-pri', name: 'Low', triggers: ['test'], priority: 1 },
      { id: 'high-pri', name: 'High', triggers: ['test'], priority: 10 },
    );
    const result = selectSkills(
      { title: 'Add test', description: 'unit tests' },
      null,
      pool,
    );
    // Both have same trigger score, high-pri should be first due to priority
    expect(result.skills[0].id).toBe('high-pri');
  });

  it('caps at maxSkills (default 3)', () => {
    const pool = makePool(
      { id: 'a', name: 'A', triggers: ['test'] },
      { id: 'b', name: 'B', triggers: ['test'] },
      { id: 'c', name: 'C', triggers: ['test'] },
      { id: 'd', name: 'D', triggers: ['test'] },
    );
    const result = selectSkills(
      { title: 'Add test', description: 'tests' },
      null,
      pool,
    );
    expect(result.skills.length).toBeLessThanOrEqual(3);
    expect(result.truncated).toBe(true);
  });

  it('respects custom maxSkills parameter', () => {
    const pool = makePool(
      { id: 'a', name: 'A', triggers: ['test'] },
      { id: 'b', name: 'B', triggers: ['test'] },
      { id: 'c', name: 'C', triggers: ['test'] },
    );
    const result = selectSkills(
      { title: 'Add test', description: 'tests' },
      null,
      pool,
      undefined,
      1,
    );
    expect(result.skills).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it('truncated is false when skills fit within cap', () => {
    const pool = makePool(
      { id: 'a', name: 'A', triggers: ['test'] },
    );
    const result = selectSkills(
      { title: 'Add test', description: 'tests' },
      null,
      pool,
    );
    expect(result.truncated).toBe(false);
  });

  it('handles null projectStack', () => {
    const pool = makePool({
      id: 'ts',
      name: 'TS',
      category: 'language',
      triggers: ['typescript'],
    });
    const result = selectSkills(
      { title: 'Add typescript types', description: 'strict' },
      null,
      pool,
    );
    // Only trigger match, no stack bonus
    expect(result.skills).toHaveLength(1);
    expect(result.scores.get('ts')).toBe(2);
  });

  it('returns scores for all skills including unselected', () => {
    const pool = makePool(
      { id: 'match', name: 'Match', triggers: ['test'] },
      { id: 'no-match', name: 'NoMatch', triggers: ['deploy'] },
    );
    const result = selectSkills(
      { title: 'Add test', description: 'tests' },
      null,
      pool,
    );
    expect(result.scores.has('match')).toBe(true);
    expect(result.scores.has('no-match')).toBe(true);
    expect(result.scores.get('no-match')).toBe(0);
  });

  it('matches triggers case-insensitively', () => {
    const pool = makePool({
      id: 'ci',
      name: 'CI',
      triggers: ['TypeScript'],
    });
    const result = selectSkills(
      { title: 'typescript refactor', description: '' },
      null,
      pool,
    );
    expect(result.skills).toHaveLength(1);
  });

  it('accepts task with scope parameter', () => {
    const pool = makePool({
      id: 'src-skill',
      name: 'Src Skill',
      triggers: ['api'],
    });
    const result = selectSkills(
      { title: 'Add api endpoints', description: 'REST', scope: { directories: ['src/api/'] } },
      null,
      pool,
    );
    expect(result.skills).toHaveLength(1);
  });
});

// ─── resolveComposition ───────────────────────────────────────────────────

describe('resolveComposition', () => {
  it('returns empty array for empty input', () => {
    const result = resolveComposition([]);
    expect(result.resolved).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('returns single skill unchanged', () => {
    const skill = createSkillDefinition({ id: 'solo', name: 'Solo' });
    const result = resolveComposition([skill]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].id).toBe('solo');
    expect(result.conflicts).toEqual([]);
  });

  it('allows all skills when composableWith is empty (no restrictions)', () => {
    const a = createSkillDefinition({ id: 'a', name: 'A', composableWith: [] });
    const b = createSkillDefinition({ id: 'b', name: 'B', composableWith: [] });
    const result = resolveComposition([a, b]);
    expect(result.resolved).toHaveLength(2);
    expect(result.conflicts).toEqual([]);
  });

  it('allows composable skills', () => {
    const a = createSkillDefinition({ id: 'a', name: 'A', composableWith: ['b'] });
    const b = createSkillDefinition({ id: 'b', name: 'B', composableWith: ['a'] });
    const result = resolveComposition([a, b]);
    expect(result.resolved).toHaveLength(2);
    expect(result.conflicts).toEqual([]);
  });

  it('detects conflict when skill B is not in skill A composableWith', () => {
    const a = createSkillDefinition({ id: 'a', name: 'A', composableWith: ['c'] });
    const b = createSkillDefinition({ id: 'b', name: 'B', composableWith: ['a'] });
    const result = resolveComposition([a, b]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].id).toBe('a');
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it('detects conflict when skill A is not in skill B composableWith', () => {
    const a = createSkillDefinition({ id: 'a', name: 'A', composableWith: [] });
    const b = createSkillDefinition({ id: 'b', name: 'B', composableWith: ['c'] });
    const result = resolveComposition([a, b]);
    // A has no restrictions, B restricts to 'c' only -> B cannot compose with A
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].id).toBe('a');
    expect(result.conflicts).toHaveLength(1);
  });

  it('resolves three-way composition correctly', () => {
    const a = createSkillDefinition({ id: 'a', name: 'A', composableWith: ['b', 'c'] });
    const b = createSkillDefinition({ id: 'b', name: 'B', composableWith: ['a', 'c'] });
    const c = createSkillDefinition({ id: 'c', name: 'C', composableWith: ['a', 'b'] });
    const result = resolveComposition([a, b, c]);
    expect(result.resolved).toHaveLength(3);
    expect(result.conflicts).toEqual([]);
  });

  it('removes conflicting third skill in three-way', () => {
    const a = createSkillDefinition({ id: 'a', name: 'A', composableWith: ['b'] });
    const b = createSkillDefinition({ id: 'b', name: 'B', composableWith: ['a'] });
    const c = createSkillDefinition({ id: 'c', name: 'C', composableWith: ['a'] });
    const result = resolveComposition([a, b, c]);
    // c cannot be with b (b's composableWith is ['a'] only)
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it('reports conflict details with skill names', () => {
    const a = createSkillDefinition({ id: 'react', name: 'React Skill', composableWith: [] });
    const b = createSkillDefinition({ id: 'vue', name: 'Vue Skill', composableWith: ['angular'] });
    const result = resolveComposition([a, b]);
    expect(result.conflicts[0]).toContain('Vue Skill');
    expect(result.conflicts[0]).toContain('React Skill');
  });

  it('unrestricted skill does not block restricted skill', () => {
    const a = createSkillDefinition({ id: 'a', name: 'A', composableWith: [] });
    const b = createSkillDefinition({ id: 'b', name: 'B', composableWith: ['a'] });
    const result = resolveComposition([a, b]);
    expect(result.resolved).toHaveLength(2);
    expect(result.conflicts).toEqual([]);
  });

  it('handles all skills having mutual composableWith', () => {
    const skills = ['x', 'y', 'z'].map((id) =>
      createSkillDefinition({ id, name: id.toUpperCase(), composableWith: ['x', 'y', 'z'] }),
    );
    const result = resolveComposition(skills);
    expect(result.resolved).toHaveLength(3);
    expect(result.conflicts).toEqual([]);
  });

  it('preserves order of input skills', () => {
    const a = createSkillDefinition({ id: 'first', name: 'First', composableWith: [] });
    const b = createSkillDefinition({ id: 'second', name: 'Second', composableWith: [] });
    const result = resolveComposition([a, b]);
    expect(result.resolved[0].id).toBe('first');
    expect(result.resolved[1].id).toBe('second');
  });
});
