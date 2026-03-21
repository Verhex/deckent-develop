import { describe, it, expect } from 'vitest';
import {
  createDefaultSkillStats,
  createSkillDefinition,
} from '../../src/core/skill-types.js';
import type {
  SkillStats,
  SkillDefinition,
  SkillCategory,
  StackDetectionRule,
  PromptInjectionConfig,
  ProjectStack,
  SkillSelectionResult,
} from '../../src/core/skill-types.js';

// ─── createDefaultSkillStats ────────────────────────────────────────────────

describe('createDefaultSkillStats', () => {
  it('returns a SkillStats with all fields zeroed', () => {
    const stats = createDefaultSkillStats();
    expect(stats.totalUses).toBe(0);
    expect(stats.successRate).toBe(0);
    expect(stats.avgCoverage).toBe(0);
    expect(stats.lastUsedInSprint).toBe('');
  });

  it('returns a new object on every call (no shared reference)', () => {
    const a = createDefaultSkillStats();
    const b = createDefaultSkillStats();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('stats fields are independently mutable', () => {
    const stats = createDefaultSkillStats();
    stats.totalUses = 10;
    stats.successRate = 0.85;
    stats.avgCoverage = 92;
    stats.lastUsedInSprint = 'sprint-010';
    expect(stats.totalUses).toBe(10);
    expect(stats.successRate).toBe(0.85);
    expect(stats.avgCoverage).toBe(92);
    expect(stats.lastUsedInSprint).toBe('sprint-010');
  });
});

// ─── createSkillDefinition ──────────────────────────────────────────────────

describe('createSkillDefinition', () => {
  it('creates a skill with only id and name, rest defaults', () => {
    const skill = createSkillDefinition({ id: 'ts-skill', name: 'TypeScript Skill' });
    expect(skill.id).toBe('ts-skill');
    expect(skill.name).toBe('TypeScript Skill');
    expect(skill.version).toBe('0.1.0');
    expect(skill.description).toBe('');
    expect(skill.entrypoint).toBe('SKILL.md');
    expect(skill.category).toBe('tool');
    expect(skill.triggers).toEqual([]);
    expect(skill.stackDetection).toEqual({ files: [], dependencies: [], commands: [] });
    expect(skill.composableWith).toEqual([]);
    expect(skill.priority).toBe(0);
    expect(skill.promptInjection).toEqual({ position: 'append', maxTokens: 1500 });
    expect(skill.model).toBeUndefined();
    expect(skill.enabled).toBe(true);
    expect(skill.stats).toEqual(createDefaultSkillStats());
  });

  it('allows overriding version', () => {
    const skill = createSkillDefinition({ id: 's1', name: 'S1', version: '2.0.0' });
    expect(skill.version).toBe('2.0.0');
  });

  it('allows overriding description', () => {
    const skill = createSkillDefinition({ id: 's2', name: 'S2', description: 'Custom desc' });
    expect(skill.description).toBe('Custom desc');
  });

  it('allows overriding entrypoint', () => {
    const skill = createSkillDefinition({ id: 's3', name: 'S3', entrypoint: 'custom.md' });
    expect(skill.entrypoint).toBe('custom.md');
  });

  it('allows overriding category to language', () => {
    const skill = createSkillDefinition({ id: 'lang', name: 'Lang', category: 'language' });
    expect(skill.category).toBe('language');
  });

  it('allows overriding category to framework', () => {
    const skill = createSkillDefinition({ id: 'fw', name: 'FW', category: 'framework' });
    expect(skill.category).toBe('framework');
  });

  it('allows overriding category to domain', () => {
    const skill = createSkillDefinition({ id: 'dom', name: 'Dom', category: 'domain' });
    expect(skill.category).toBe('domain');
  });

  it('allows overriding category to workflow', () => {
    const skill = createSkillDefinition({ id: 'wf', name: 'WF', category: 'workflow' });
    expect(skill.category).toBe('workflow');
  });

  it('allows overriding triggers', () => {
    const skill = createSkillDefinition({ id: 't1', name: 'T1', triggers: ['test', 'coverage'] });
    expect(skill.triggers).toEqual(['test', 'coverage']);
  });

  it('allows overriding stackDetection', () => {
    const rule: StackDetectionRule = {
      files: ['tsconfig.json'],
      dependencies: ['typescript'],
      commands: ['tsc'],
    };
    const skill = createSkillDefinition({ id: 'sd', name: 'SD', stackDetection: rule });
    expect(skill.stackDetection).toEqual(rule);
  });

  it('allows overriding composableWith', () => {
    const skill = createSkillDefinition({ id: 'cw', name: 'CW', composableWith: ['react-skill'] });
    expect(skill.composableWith).toEqual(['react-skill']);
  });

  it('allows overriding priority', () => {
    const skill = createSkillDefinition({ id: 'p1', name: 'P1', priority: 10 });
    expect(skill.priority).toBe(10);
  });

  it('allows overriding promptInjection', () => {
    const cfg: PromptInjectionConfig = { position: 'prepend', maxTokens: 500 };
    const skill = createSkillDefinition({ id: 'pi', name: 'PI', promptInjection: cfg });
    expect(skill.promptInjection).toEqual(cfg);
  });

  it('allows overriding model to opus', () => {
    const skill = createSkillDefinition({ id: 'm1', name: 'M1', model: 'opus' });
    expect(skill.model).toBe('opus');
  });

  it('allows overriding enabled to false', () => {
    const skill = createSkillDefinition({ id: 'e1', name: 'E1', enabled: false });
    expect(skill.enabled).toBe(false);
  });

  it('allows overriding stats', () => {
    const customStats: SkillStats = {
      totalUses: 20,
      successRate: 0.95,
      avgCoverage: 88,
      lastUsedInSprint: 'sprint-005',
    };
    const skill = createSkillDefinition({ id: 'st', name: 'ST', stats: customStats });
    expect(skill.stats).toEqual(customStats);
  });

  it('returns a new object each time (no shared reference)', () => {
    const a = createSkillDefinition({ id: 'x', name: 'X' });
    const b = createSkillDefinition({ id: 'x', name: 'X' });
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ─── SkillCategory type ─────────────────────────────────────────────────────

describe('SkillCategory type', () => {
  it('accepts all valid categories', () => {
    const categories: SkillCategory[] = ['language', 'framework', 'tool', 'domain', 'workflow'];
    expect(categories).toHaveLength(5);
    for (const cat of categories) {
      expect(typeof cat).toBe('string');
    }
  });
});

// ─── StackDetectionRule type ────────────────────────────────────────────────

describe('StackDetectionRule type', () => {
  it('holds files, dependencies, and commands arrays', () => {
    const rule: StackDetectionRule = {
      files: ['package.json', 'tsconfig.json'],
      dependencies: ['react', 'typescript'],
      commands: ['tsc', 'npm'],
    };
    expect(rule.files).toHaveLength(2);
    expect(rule.dependencies).toHaveLength(2);
    expect(rule.commands).toHaveLength(2);
  });

  it('accepts empty arrays', () => {
    const rule: StackDetectionRule = { files: [], dependencies: [], commands: [] };
    expect(rule.files).toEqual([]);
    expect(rule.dependencies).toEqual([]);
    expect(rule.commands).toEqual([]);
  });
});

// ─── PromptInjectionConfig type ─────────────────────────────────────────────

describe('PromptInjectionConfig type', () => {
  it('accepts prepend position', () => {
    const cfg: PromptInjectionConfig = { position: 'prepend', maxTokens: 1000 };
    expect(cfg.position).toBe('prepend');
    expect(cfg.maxTokens).toBe(1000);
  });

  it('accepts append position', () => {
    const cfg: PromptInjectionConfig = { position: 'append', maxTokens: 1500 };
    expect(cfg.position).toBe('append');
  });

  it('accepts section position', () => {
    const cfg: PromptInjectionConfig = { position: 'section', maxTokens: 2000 };
    expect(cfg.position).toBe('section');
  });
});

// ─── ProjectStack type ──────────────────────────────────────────────────────

describe('ProjectStack type', () => {
  it('holds all expected fields', () => {
    const stack: ProjectStack = {
      language: 'typescript',
      framework: 'express',
      dependencies: ['express', 'cors'],
      buildTool: 'tsc',
      testFramework: 'vitest',
      detectedAt: '2026-03-22T00:00:00Z',
    };
    expect(stack.language).toBe('typescript');
    expect(stack.framework).toBe('express');
    expect(stack.dependencies).toEqual(['express', 'cors']);
    expect(stack.buildTool).toBe('tsc');
    expect(stack.testFramework).toBe('vitest');
    expect(stack.detectedAt).toBe('2026-03-22T00:00:00Z');
  });

  it('accepts empty dependencies', () => {
    const stack: ProjectStack = {
      language: 'rust',
      framework: 'unknown',
      dependencies: [],
      buildTool: 'cargo',
      testFramework: 'unknown',
      detectedAt: '2026-03-22T00:00:00Z',
    };
    expect(stack.dependencies).toEqual([]);
  });
});

// ─── SkillSelectionResult type ──────────────────────────────────────────────

describe('SkillSelectionResult type', () => {
  it('holds skills, scores map, and truncated flag', () => {
    const skill = createSkillDefinition({ id: 'ts', name: 'TS' });
    const result: SkillSelectionResult = {
      skills: [skill],
      scores: new Map([['ts', 5]]),
      truncated: false,
    };
    expect(result.skills).toHaveLength(1);
    expect(result.scores.get('ts')).toBe(5);
    expect(result.truncated).toBe(false);
  });

  it('truncated is true when capped', () => {
    const result: SkillSelectionResult = {
      skills: [],
      scores: new Map(),
      truncated: true,
    };
    expect(result.truncated).toBe(true);
  });
});
