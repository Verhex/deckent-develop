import { describe, it, expect } from 'vitest';
import {
  generateProjectConventionsSkill,
  generateDataDrivenSkills,
  getGeneratedContent,
} from '../../src/orchestra/temp-skill-generator.js';

describe('temp-skill-generator', () => {
  describe('generateProjectConventionsSkill', () => {
    it('generates skill with correct id', () => {
      const skill = generateProjectConventionsSkill({
        language: 'TypeScript',
        framework: 'none',
        testFramework: 'vitest',
        buildTool: 'tsc',
        dependencies: ['typescript', 'vitest', 'zod'],
      });

      expect(skill.id).toBe('project-conventions');
      expect(skill.name).toBe('Project Conventions');
      expect(skill.manifestVersion).toBe(2);
      expect(skill.activation).toBeDefined();
    });

    it('includes stack info in content', () => {
      const skill = generateProjectConventionsSkill({
        language: 'TypeScript',
        framework: 'React',
        testFramework: 'vitest',
        buildTool: 'vite',
        dependencies: ['react', 'typescript'],
      });

      const content = getGeneratedContent(skill);
      expect(content).toContain('TypeScript');
      expect(content).toContain('React');
      expect(content).toContain('vite');
      expect(content).toContain('vitest');
    });

    it('includes dependencies', () => {
      const skill = generateProjectConventionsSkill({
        language: 'TypeScript',
        framework: 'none',
        testFramework: 'vitest',
        buildTool: 'tsc',
        dependencies: ['zod', 'commander', 'chalk'],
      });

      const content = getGeneratedContent(skill);
      expect(content).toContain('zod');
      expect(content).toContain('commander');
    });

    it('includes multi-language info', () => {
      const skill = generateProjectConventionsSkill({
        language: 'TypeScript',
        framework: 'none',
        testFramework: 'vitest',
        buildTool: 'tsc',
        dependencies: [],
        detectedLanguages: ['TypeScript', 'Python', 'Go'],
      });

      const content = getGeneratedContent(skill);
      expect(content).toContain('multiple languages');
      expect(content).toContain('Python');
    });

    it('includes sub-projects', () => {
      const skill = generateProjectConventionsSkill({
        language: 'TypeScript',
        framework: 'none',
        testFramework: 'vitest',
        buildTool: 'tsc',
        dependencies: [],
        subProjects: ['src/dashboard', 'packages/api'],
      });

      const content = getGeneratedContent(skill);
      expect(content).toContain('src/dashboard');
    });

    it('has correct activation rules', () => {
      const skill = generateProjectConventionsSkill({
        language: 'TypeScript',
        framework: 'none',
        testFramework: 'vitest',
        buildTool: 'tsc',
        dependencies: [],
      });

      expect(skill.activation!.rules.length).toBeGreaterThan(0);
      expect(skill.activation!.minScore).toBe(3);
    });
  });

  describe('generateDataDrivenSkills', () => {
    it('generates skill for domain with enough data', () => {
      const skills = generateDataDrivenSkills(
        [{ domain: 'auth', taskCount: 10, successRate: 0.9, commonFiles: ['src/auth/login.ts'], commonDeps: ['jsonwebtoken'] }],
        new Set(),
      );

      expect(skills).toHaveLength(1);
      expect(skills[0]!.id).toBe('auth-domain-learned');
      expect(skills[0]!.manifestVersion).toBe(2);
    });

    it('skips domain with insufficient data', () => {
      const skills = generateDataDrivenSkills(
        [{ domain: 'auth', taskCount: 3, successRate: 0.9, commonFiles: [], commonDeps: [] }],
        new Set(),
      );
      expect(skills).toHaveLength(0);
    });

    it('skips domain with low success rate', () => {
      const skills = generateDataDrivenSkills(
        [{ domain: 'auth', taskCount: 10, successRate: 0.5, commonFiles: [], commonDeps: [] }],
        new Set(),
      );
      expect(skills).toHaveLength(0);
    });

    it('skips already-existing skill', () => {
      const skills = generateDataDrivenSkills(
        [{ domain: 'auth', taskCount: 10, successRate: 0.9, commonFiles: [], commonDeps: [] }],
        new Set(['auth-domain-learned']),
      );
      expect(skills).toHaveLength(0);
    });

    it('includes common files and deps in content', () => {
      const skills = generateDataDrivenSkills(
        [{
          domain: 'orchestra',
          taskCount: 15,
          successRate: 0.87,
          commonFiles: ['src/orchestra/sprint-controller.ts', 'src/orchestra/planner.ts'],
          commonDeps: ['commander'],
        }],
        new Set(),
      );

      const content = getGeneratedContent(skills[0]!);
      expect(content).toContain('sprint-controller.ts');
      expect(content).toContain('commander');
      expect(content).toContain('87%');
    });
  });
});
