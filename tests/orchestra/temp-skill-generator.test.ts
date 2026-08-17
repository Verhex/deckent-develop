import { describe, it, expect } from 'vitest';
import {
  generateProjectContextSegment,
  generateProjectConventionsSkill,
  generateDataDrivenSkills,
  getGeneratedContent,
  generateTempAgents,
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

  // ─── generateTempAgents ──────────────────────────────────────────────────────

  describe('generateTempAgents', () => {
    const baseStack = {
      language: 'TypeScript',
      framework: 'React',
      buildTool: 'vite',
      testFramework: 'vitest',
      dependencies: ['react', 'typescript', '@vitejs/plugin-react'],
      detectedAt: '2026-01-01T00:00:00.000Z',
    };

    it('generates react-ts-specialist for TypeScript+React stack', () => {
      const agents = generateTempAgents(baseStack);
      const ids = agents.map((a) => a.id);
      expect(ids).toContain('temp-react-ts-specialist');
    });

    it('generated agent has source=learned and enabled=true', () => {
      const agents = generateTempAgents(baseStack);
      const agent = agents.find((a) => a.id === 'temp-react-ts-specialist');
      expect(agent).toBeDefined();
      expect(agent!.source).toBe('learned');
      expect(agent!.enabled).toBe(true);
    });

    it('generated agent has v2 activation rules', () => {
      const agents = generateTempAgents(baseStack);
      const agent = agents.find((a) => a.id === 'temp-react-ts-specialist');
      expect(agent!.manifestVersion).toBe(2);
      expect(agent!.activation).toBeDefined();
      expect(agent!.activation!.rules.length).toBeGreaterThan(0);
    });

    it('does not generate react-ts-specialist for Python stack', () => {
      const pythonStack = {
        ...baseStack,
        language: 'Python',
        framework: 'fastapi',
        dependencies: ['fastapi', 'pydantic'],
      };
      const agents = generateTempAgents(pythonStack);
      const ids = agents.map((a) => a.id);
      expect(ids).not.toContain('temp-react-ts-specialist');
    });

    it('generates python-api-specialist for Python+FastAPI stack', () => {
      const pythonApiStack = {
        ...baseStack,
        language: 'Python',
        framework: 'fastapi',
        dependencies: ['fastapi', 'pydantic', 'uvicorn'],
      };
      const agents = generateTempAgents(pythonApiStack);
      const ids = agents.map((a) => a.id);
      expect(ids).toContain('temp-python-api-specialist');
    });

    it('generates go-specialist for Go stack', () => {
      const goStack = {
        ...baseStack,
        language: 'Go',
        framework: 'none',
        dependencies: ['gin', 'gorm'],
      };
      const agents = generateTempAgents(goStack);
      const ids = agents.map((a) => a.id);
      expect(ids).toContain('temp-go-specialist');
    });

    it('generates prime agents for C++, Java, C#, Kotlin, and Swift stacks', () => {
      const cases = [
        {
          language: 'cpp',
          framework: 'none',
          dependencies: ['cmake', 'googletest'],
          expectedId: 'temp-cpp-specialist',
        },
        {
          language: 'java',
          framework: 'none',
          dependencies: ['maven', 'junit-jupiter'],
          expectedId: 'temp-java-specialist',
        },
        {
          language: 'csharp',
          framework: 'none',
          dependencies: ['dotnet', 'xunit'],
          expectedId: 'temp-csharp-specialist',
        },
        {
          language: 'kotlin',
          framework: 'none',
          dependencies: ['gradle', 'kotlinx-coroutines-core'],
          expectedId: 'temp-kotlin-specialist',
        },
        {
          language: 'swift',
          framework: 'none',
          dependencies: ['swift-package-manager', 'xctest'],
          expectedId: 'temp-swift-specialist',
        },
      ];

      for (const testCase of cases) {
        const agents = generateTempAgents({
          ...baseStack,
          language: testCase.language,
          framework: testCase.framework,
          dependencies: testCase.dependencies,
        });
        const ids = agents.map((a) => a.id);
        expect(ids).toContain(testCase.expectedId);
      }
    });

    it('returns empty array for unknown/unsupported stack', () => {
      const unknownStack = {
        ...baseStack,
        language: 'COBOL',
        framework: 'none',
        dependencies: [],
      };
      const agents = generateTempAgents(unknownStack);
      expect(agents).toHaveLength(0);
    });

    it('all generated agent IDs start with temp-', () => {
      const agents = generateTempAgents(baseStack);
      expect(agents.length).toBeGreaterThan(0);
      for (const agent of agents) {
        expect(agent.id).toMatch(/^temp-/);
      }
    });
  });
});

describe('generateProjectContextSegment (deterministic project-context data)', () => {
  it('returns the conventions content as plain prompt data, not a skill', () => {
    const segment = generateProjectContextSegment({
      language: 'TypeScript',
      framework: 'none',
      buildTool: 'tsc',
      testFramework: 'vitest',
      dependencies: ['zod'],
    });
    expect(segment).toContain('# Project Conventions (Auto-Generated)');
    expect(segment).toContain('- Language: TypeScript');
    expect(segment).toContain('## Testing');
    // Data, not a SkillDefinition — no id/activation surface.
    expect(typeof segment).toBe('string');
  });
});
