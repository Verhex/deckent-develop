import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';

const ROOT = '/test/project';

function makeSkill(overrides: Partial<SkillDefinition> & { id: string; name: string }): SkillDefinition {
  return createSkillDefinition(overrides);
}

function mockDirEntry(name: string, isDir = true) {
  return { name, isDirectory: () => isDir } as unknown as fs.Dirent;
}

describe('SkillPoolManager', () => {
  let manager: SkillPoolManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SkillPoolManager(ROOT);
  });

  // ─── loadSkills ─────────────────────────────────────────────────────────────

  describe('loadSkills', () => {
    it('returns empty pool when skills directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const pool = manager.loadSkills();
      expect(pool.size).toBe(0);
    });

    it('loads skills from .deckent/skills/', () => {
      const skill = makeSkill({ id: 'ts-skill', name: 'TypeScript Skill' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('ts-skill')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

      const pool = manager.loadSkills();
      expect(pool.has('ts-skill')).toBe(true);
    });

    it('skips non-directory entries', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('README.md', false)] as any);
      const pool = manager.loadSkills();
      expect(pool.size).toBe(0);
    });

    it('skips directories without manifest.json', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s.endsWith('manifest.json')) return false;
        return true;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('empty-skill')] as any);
      const pool = manager.loadSkills();
      expect(pool.size).toBe(0);
    });

    it('skips directories with invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('bad-skill')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue('NOT JSON');

      const pool = manager.loadSkills();
      expect(pool.size).toBe(0);
    });

    it('skips skills failing validation', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('invalid')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ id: '', name: '' }));

      const pool = manager.loadSkills();
      expect(pool.size).toBe(0);
    });

    it('loads multiple skills', () => {
      const skillA = makeSkill({ id: 'skill-a', name: 'Skill A' });
      const skillB = makeSkill({ id: 'skill-b', name: 'Skill B' });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        mockDirEntry('skill-a'),
        mockDirEntry('skill-b'),
      ] as any);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (s.includes('skill-a')) return JSON.stringify(skillA);
        return JSON.stringify(skillB);
      });

      const pool = manager.loadSkills();
      expect(pool.size).toBe(2);
      expect(pool.has('skill-a')).toBe(true);
      expect(pool.has('skill-b')).toBe(true);
    });

    it('returns empty pool when readdirSync throws', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('EPERM'); });
      const pool = manager.loadSkills();
      expect(pool.size).toBe(0);
    });
  });

  // ─── getSkill ───────────────────────────────────────────────────────────────

  describe('getSkill', () => {
    it('returns skill by id', () => {
      const skill = makeSkill({ id: 'my-skill', name: 'My Skill' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('my-skill')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

      const result = manager.getSkill('my-skill');
      expect(result).toBeDefined();
      expect(result!.id).toBe('my-skill');
    });

    it('returns undefined for non-existent skill', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = manager.getSkill('nope');
      expect(result).toBeUndefined();
    });
  });

  // ─── listSkills ─────────────────────────────────────────────────────────────

  describe('listSkills', () => {
    it('returns an array of all skills', () => {
      const skill = makeSkill({ id: 'list-skill', name: 'List Skill' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('list-skill')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

      const list = manager.listSkills();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('list-skill');
    });
  });

  // ─── listByCategory ─────────────────────────────────────────────────────────

  describe('listByCategory', () => {
    it('filters skills by category', () => {
      const langSkill = makeSkill({ id: 'lang', name: 'Lang', category: 'language' });
      const toolSkill = makeSkill({ id: 'tool', name: 'Tool', category: 'tool' });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        mockDirEntry('lang'),
        mockDirEntry('tool'),
      ] as any);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (s.includes('/lang/')) return JSON.stringify(langSkill);
        return JSON.stringify(toolSkill);
      });

      const langResults = manager.listByCategory('language');
      expect(langResults).toHaveLength(1);
      expect(langResults[0].id).toBe('lang');
    });

    it('returns empty array when no skills match category', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const results = manager.listByCategory('domain');
      expect(results).toEqual([]);
    });
  });

  // ─── listEnabled ────────────────────────────────────────────────────────────

  describe('listEnabled', () => {
    it('returns only enabled skills', () => {
      const enabled = makeSkill({ id: 'on', name: 'On', enabled: true });
      const disabled = makeSkill({ id: 'off', name: 'Off', enabled: false });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        mockDirEntry('on'),
        mockDirEntry('off'),
      ] as any);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (s.includes('/on/')) return JSON.stringify(enabled);
        return JSON.stringify(disabled);
      });

      const result = manager.listEnabled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('on');
    });
  });

  // ─── enableSkill / disableSkill ─────────────────────────────────────────────

  describe('enableSkill', () => {
    it('returns false for non-existent skill', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(manager.enableSkill('nope')).toBe(false);
    });

    it('enables a disabled skill and saves', () => {
      const skill = makeSkill({ id: 'toggle', name: 'Toggle', enabled: false });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('toggle')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

      const result = manager.enableSkill('toggle');
      expect(result).toBe(true);
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.enabled).toBe(true);
    });
  });

  describe('disableSkill', () => {
    it('returns false for non-existent skill', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(manager.disableSkill('nope')).toBe(false);
    });

    it('disables an enabled skill and saves', () => {
      const skill = makeSkill({ id: 'toggle2', name: 'Toggle2', enabled: true });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('toggle2')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

      const result = manager.disableSkill('toggle2');
      expect(result).toBe(true);
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.enabled).toBe(false);
    });
  });

  // ─── saveSkill ──────────────────────────────────────────────────────────────

  describe('saveSkill', () => {
    it('writes skill to .deckent/skills/{id}/manifest.json', () => {
      const skill = makeSkill({ id: 'save-me', name: 'Save Me' });
      manager.saveSkill(skill);

      expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(
        expect.stringContaining('save-me'),
        { recursive: true },
      );
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('manifest.json'),
        expect.any(String),
        'utf8',
      );
    });

    it('writes valid JSON content', () => {
      const skill = makeSkill({ id: 'json-check', name: 'JSON Check', category: 'language' });
      manager.saveSkill(skill);

      const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.id).toBe('json-check');
      expect(parsed.category).toBe('language');
    });
  });

  // ─── removeSkill ────────────────────────────────────────────────────────────

  describe('removeSkill', () => {
    it('returns false when skill directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(manager.removeSkill('nope')).toBe(false);
    });

    it('removes skill directory and returns true', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const result = manager.removeSkill('remove-me');
      expect(result).toBe(true);
      expect(vi.mocked(fs.rmSync)).toHaveBeenCalledWith(
        expect.stringContaining('remove-me'),
        { recursive: true, force: true },
      );
    });
  });

  // ─── updateSkillStats ───────────────────────────────────────────────────────

  describe('updateSkillStats', () => {
    it('does nothing when skill not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      manager.updateSkillStats('missing', 'DONE', 90, 'sprint-001');
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
    });

    it('increments totalUses on DONE evaluation', () => {
      const skill = makeSkill({ id: 'stat-test', name: 'Stat Test' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('stat-test')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

      manager.updateSkillStats('stat-test', 'DONE', 85, 'sprint-010');

      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.stats.totalUses).toBe(1);
      expect(written.stats.successRate).toBe(1);
      expect(written.stats.avgCoverage).toBe(85);
      expect(written.stats.lastUsedInSprint).toBe('sprint-010');
    });

    it('counts GO_WITH_TECH_DEBT as success', () => {
      const skill = makeSkill({ id: 'debt-test', name: 'Debt Test' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('debt-test')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

      manager.updateSkillStats('debt-test', 'GO_WITH_TECH_DEBT', 70, 'sprint-011');

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.stats.successRate).toBe(1);
    });

    it('counts NO_GO as failure', () => {
      const skill = makeSkill({ id: 'nogo-test', name: 'NoGo Test' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('nogo-test')] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skill));

      manager.updateSkillStats('nogo-test', 'NO_GO', 30, 'sprint-012');

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.stats.successRate).toBe(0);
    });
  });

  // ─── validateSkillDefinition ────────────────────────────────────────────────

  describe('validateSkillDefinition', () => {
    it('returns valid for a well-formed skill', () => {
      const skill = makeSkill({ id: 'valid', name: 'Valid' });
      const result = SkillPoolManager.validateSkillDefinition(skill);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects null', () => {
      const result = SkillPoolManager.validateSkillDefinition(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Skill definition must be a non-null object');
    });

    it('rejects arrays', () => {
      const result = SkillPoolManager.validateSkillDefinition([]);
      expect(result.valid).toBe(false);
    });

    it('rejects missing id', () => {
      const result = SkillPoolManager.validateSkillDefinition({ name: 'X' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"id"'));
    });

    it('rejects empty id', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: '', name: 'X' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"id"'));
    });

    it('rejects missing name', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"name"'));
    });

    it('rejects invalid category', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X', category: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"category"'));
    });

    it('rejects invalid model', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X', model: 'gpt4' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"model"'));
    });

    it('rejects non-number priority', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X', priority: 'high' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"priority"'));
    });

    it('rejects non-boolean enabled', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X', enabled: 'yes' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"enabled"'));
    });

    it('rejects non-array triggers', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X', triggers: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"triggers"'));
    });

    it('rejects non-string items in triggers', () => {
      const result = SkillPoolManager.validateSkillDefinition({ id: 'x', name: 'X', triggers: [123] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"triggers"'));
    });

    it('rejects invalid promptInjection position', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X', promptInjection: { position: 'middle', maxTokens: 100 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('promptInjection.position'));
    });

    it('rejects non-number promptInjection maxTokens', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X', promptInjection: { position: 'append', maxTokens: 'lots' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('promptInjection.maxTokens'));
    });

    it('rejects invalid stats', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X', stats: { totalUses: 'many' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('stats.totalUses'));
    });

    it('rejects array as stackDetection', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X', stackDetection: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('"stackDetection"'));
    });

    it('rejects non-array stackDetection.files', () => {
      const result = SkillPoolManager.validateSkillDefinition({
        id: 'x', name: 'X', stackDetection: { files: 'nope', dependencies: [], commands: [] },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('stackDetection.files'));
    });
  });
});
