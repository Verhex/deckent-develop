import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillRegistry } from '../../src/core/skill-registry.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `skill-registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeSkill(overrides: Partial<SkillDefinition> & { id: string; name: string }): SkillDefinition {
  return createSkillDefinition(overrides);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SkillRegistry', () => {
  let tempDir: string;
  let registry: SkillRegistry;

  beforeEach(() => {
    tempDir = makeTempDir();
    registry = new SkillRegistry(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── register ─────────────────────────────────────────────────────────────

  it('registers a new skill', () => {
    const skill = makeSkill({ id: 'ts-expert', name: 'TypeScript Expert' });
    registry.register(skill);
    const all = registry.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('ts-expert');
  });

  it('replaces existing skill with same id', () => {
    const skill1 = makeSkill({ id: 'ts-expert', name: 'Version 1', description: 'old' });
    registry.register(skill1);

    const skill2 = makeSkill({ id: 'ts-expert', name: 'Version 2', description: 'new' });
    registry.register(skill2);

    const all = registry.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Version 2');
    expect(all[0]!.description).toBe('new');
  });

  it('registers multiple different skills', () => {
    registry.register(makeSkill({ id: 'skill-a', name: 'Skill A' }));
    registry.register(makeSkill({ id: 'skill-b', name: 'Skill B' }));
    registry.register(makeSkill({ id: 'skill-c', name: 'Skill C' }));
    expect(registry.getAll()).toHaveLength(3);
  });

  it('persists to disk as skill-registry.json', () => {
    registry.register(makeSkill({ id: 'persist-test', name: 'Persist' }));
    const filePath = join(tempDir, 'skill-registry.json');
    expect(existsSync(filePath)).toBe(true);
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(data.skills).toHaveLength(1);
    expect(data.updatedAt).toBeDefined();
  });

  // ─── search ───────────────────────────────────────────────────────────────

  it('finds skill by id', () => {
    registry.register(makeSkill({ id: 'typescript-expert', name: 'TypeScript Expert', description: 'TS guru' }));
    registry.register(makeSkill({ id: 'react-specialist', name: 'React Specialist', description: 'React pro' }));

    const results = registry.search('typescript');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('typescript-expert');
  });

  it('finds skill by description', () => {
    registry.register(makeSkill({ id: 'sec-skill', name: 'Security', description: 'OWASP compliance checker' }));
    const results = registry.search('owasp');
    expect(results).toHaveLength(1);
  });

  it('finds skill by trigger', () => {
    registry.register(makeSkill({ id: 'test-skill', name: 'Testing', triggers: ['vitest', 'coverage'] }));
    const results = registry.search('vitest');
    expect(results).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    registry.register(makeSkill({ id: 'skill-1', name: 'Skill One' }));
    const results = registry.search('nonexistent-query');
    expect(results).toEqual([]);
  });

  it('returns empty for empty query', () => {
    registry.register(makeSkill({ id: 'skill-1', name: 'Skill One' }));
    expect(registry.search('')).toEqual([]);
    expect(registry.search('  ')).toEqual([]);
  });

  it('multi-word search requires all terms', () => {
    registry.register(makeSkill({ id: 'ts-expert', name: 'TypeScript Expert', description: 'Full expert' }));
    registry.register(makeSkill({ id: 'ts-basic', name: 'TypeScript Basic', description: 'Beginner' }));

    const results = registry.search('typescript expert');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('ts-expert');
  });

  // ─── getPopular ───────────────────────────────────────────────────────────

  it('returns skills sorted by totalUses', () => {
    registry.register(makeSkill({
      id: 'popular',
      name: 'Popular',
      stats: { totalUses: 100, successRate: 0.9, avgCoverage: 80, lastUsedInSprint: 'sprint-010' },
    }));
    registry.register(makeSkill({
      id: 'unpopular',
      name: 'Unpopular',
      stats: { totalUses: 5, successRate: 0.5, avgCoverage: 50, lastUsedInSprint: 'sprint-002' },
    }));
    registry.register(makeSkill({
      id: 'medium',
      name: 'Medium',
      stats: { totalUses: 50, successRate: 0.8, avgCoverage: 70, lastUsedInSprint: 'sprint-005' },
    }));

    const popular = registry.getPopular(2);
    expect(popular).toHaveLength(2);
    expect(popular[0]!.id).toBe('popular');
    expect(popular[1]!.id).toBe('medium');
  });

  it('getPopular respects limit', () => {
    for (let i = 0; i < 5; i++) {
      registry.register(makeSkill({ id: `skill-${i}`, name: `Skill ${i}` }));
    }
    expect(registry.getPopular(3)).toHaveLength(3);
  });

  it('getPopular handles limit of 0', () => {
    registry.register(makeSkill({ id: 'skill-1', name: 'Skill 1' }));
    expect(registry.getPopular(0)).toHaveLength(0);
  });

  it('getPopular handles negative limit', () => {
    registry.register(makeSkill({ id: 'skill-1', name: 'Skill 1' }));
    expect(registry.getPopular(-1)).toHaveLength(0);
  });

  // ─── getAll ───────────────────────────────────────────────────────────────

  it('getAll returns all skills', () => {
    registry.register(makeSkill({ id: 'a', name: 'A' }));
    registry.register(makeSkill({ id: 'b', name: 'B' }));
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getAll returns empty array when no skills', () => {
    expect(registry.getAll()).toEqual([]);
  });

  it('getAll returns copies (not references)', () => {
    registry.register(makeSkill({ id: 'orig', name: 'Original' }));
    const all = registry.getAll();
    all.pop();
    expect(registry.getAll()).toHaveLength(1);
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('removes existing skill and returns true', () => {
    registry.register(makeSkill({ id: 'to-remove', name: 'Remove Me' }));
    expect(registry.remove('to-remove')).toBe(true);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('returns false for non-existent skill', () => {
    expect(registry.remove('nonexistent')).toBe(false);
  });

  it('only removes the specified skill', () => {
    registry.register(makeSkill({ id: 'keep', name: 'Keep' }));
    registry.register(makeSkill({ id: 'remove', name: 'Remove' }));
    registry.remove('remove');
    const all = registry.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('keep');
  });

  // ─── count ────────────────────────────────────────────────────────────────

  it('count returns correct number', () => {
    expect(registry.count()).toBe(0);
    registry.register(makeSkill({ id: 'a', name: 'A' }));
    expect(registry.count()).toBe(1);
    registry.register(makeSkill({ id: 'b', name: 'B' }));
    expect(registry.count()).toBe(2);
  });

  // ─── Persistence ──────────────────────────────────────────────────────────

  it('data survives across registry instances', () => {
    registry.register(makeSkill({ id: 'durable', name: 'Durable Skill' }));

    const registry2 = new SkillRegistry(tempDir);
    expect(registry2.getAll()).toHaveLength(1);
    expect(registry2.getAll()[0]!.id).toBe('durable');
  });

  it('handles empty/corrupt registry file gracefully', () => {
    const filePath = join(tempDir, 'skill-registry.json');
    mkdirSync(tempDir, { recursive: true });
    const fs = require('node:fs');
    fs.writeFileSync(filePath, '{corrupt', 'utf8');

    const reg = new SkillRegistry(tempDir);
    expect(reg.getAll()).toEqual([]);
  });

  // ─── Search by category ───────────────────────────────────────────────────

  it('finds skills by category', () => {
    registry.register(makeSkill({ id: 'lang-skill', name: 'Lang', category: 'language' }));
    registry.register(makeSkill({ id: 'fw-skill', name: 'Framework', category: 'framework' }));

    expect(registry.search('language')).toHaveLength(1);
    expect(registry.search('framework')).toHaveLength(1);
  });
});
