import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = join(__dirname, '..', '..', '.deckent', 'skills');

const SKILL_IDS = [
  'typescript-expert',
  'react-specialist',
  'python-expert',
  'api-builder',
  'database-migration',
  'testing-expert',
  'documentation-writer',
  'security-specialist',
  'performance-optimizer',
  'devops-engineer',
] as const;

const REQUIRED_MANIFEST_FIELDS = ['id', 'name', 'version', 'description', 'entrypoint', 'category', 'triggers', 'enabled'] as const;

const VALID_CATEGORIES = ['language', 'framework', 'domain', 'workflow', 'tool'] as const;

function readManifest(skillId: string): Record<string, unknown> {
  const manifestPath = join(SKILLS_DIR, skillId, 'manifest.json');
  const raw = readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw);
}

function readSkillMd(skillId: string): string {
  const skillPath = join(SKILLS_DIR, skillId, 'SKILL.md');
  return readFileSync(skillPath, 'utf-8');
}

// --- Global discovery tests ---

describe('builtin-skills -- discovery', () => {
  it('skills directory exists', () => {
    expect(existsSync(SKILLS_DIR)).toBe(true);
  });

  it('all 10 skill directories exist', () => {
    for (const id of SKILL_IDS) {
      expect(existsSync(join(SKILLS_DIR, id))).toBe(true);
    }
  });

  it('all skill ids are unique', () => {
    const manifests = SKILL_IDS.map(readManifest);
    const ids = manifests.map((m) => m.id);
    expect(new Set(ids).size).toBe(SKILL_IDS.length);
  });

  it('every skill has both manifest.json and SKILL.md', () => {
    for (const id of SKILL_IDS) {
      expect(existsSync(join(SKILLS_DIR, id, 'manifest.json'))).toBe(true);
      expect(existsSync(join(SKILLS_DIR, id, 'SKILL.md'))).toBe(true);
    }
  });
});

// --- Per-skill test suites (5 tests each = 50 tests) ---

describe('builtin-skills -- typescript-expert', () => {
  const id = 'typescript-expert';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "language"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('language');
  });

  it('triggers is a non-empty array containing "typescript"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('typescript');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection has correct structure', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(sd).toHaveProperty('files');
    expect(sd).toHaveProperty('dependencies');
    expect(Array.isArray(sd.files)).toBe(true);
    expect(Array.isArray(sd.dependencies)).toBe(true);
    expect(sd.dependencies).toContain('typescript');
  });

  it('composableWith is an array', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect((m.composableWith as string[]).length).toBeGreaterThan(0);
  });

  it('entrypoint points to SKILL.md', () => {
    const m = readManifest(id);
    expect(m.entrypoint).toBe('SKILL.md');
  });
});

describe('builtin-skills -- react-specialist', () => {
  const id = 'react-specialist';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "framework"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('framework');
  });

  it('triggers is a non-empty array containing "react"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('react');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection detects react dependency', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(Array.isArray(sd.dependencies)).toBe(true);
    expect(sd.dependencies).toContain('react');
    expect(sd.dependencies).toContain('react-dom');
  });

  it('composableWith includes typescript-expert', () => {
    const m = readManifest(id);
    expect(m.composableWith).toContain('typescript-expert');
    expect(m.composableWith).toContain('testing-expert');
  });
});

describe('builtin-skills -- python-expert', () => {
  const id = 'python-expert';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "language"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('language');
  });

  it('triggers is a non-empty array containing "python"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('python');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection includes python config files', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(Array.isArray(sd.files)).toBe(true);
    expect(sd.files).toContain('pyproject.toml');
    expect(sd.files).toContain('requirements.txt');
  });

  it('composableWith is an array with related skills', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect(m.composableWith).toContain('testing-expert');
  });
});

describe('builtin-skills -- api-builder', () => {
  const id = 'api-builder';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "domain"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('domain');
  });

  it('triggers is a non-empty array containing "api"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('api');
    expect(m.triggers).toContain('rest');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection detects web framework dependencies', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(Array.isArray(sd.dependencies)).toBe(true);
    expect(sd.dependencies).toContain('express');
    expect(sd.dependencies).toContain('fastify');
  });

  it('composableWith is an array', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect(m.composableWith).toContain('security-specialist');
  });
});

describe('builtin-skills -- database-migration', () => {
  const id = 'database-migration';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "domain"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('domain');
  });

  it('triggers is a non-empty array containing "database"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('database');
    expect(m.triggers).toContain('migration');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection detects ORM dependencies', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(Array.isArray(sd.dependencies)).toBe(true);
    expect(sd.dependencies).toContain('prisma');
    expect(sd.dependencies).toContain('drizzle');
  });

  it('composableWith is an array', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect(m.composableWith).toContain('performance-optimizer');
  });
});

describe('builtin-skills -- testing-expert', () => {
  const id = 'testing-expert';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "workflow"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('workflow');
  });

  it('triggers is a non-empty array containing "test"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('test');
    expect(m.triggers).toContain('coverage');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection detects test framework dependencies', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(Array.isArray(sd.dependencies)).toBe(true);
    expect(sd.dependencies).toContain('vitest');
    expect(sd.dependencies).toContain('jest');
  });

  it('composableWith is an array with language skills', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect(m.composableWith).toContain('typescript-expert');
    expect(m.composableWith).toContain('python-expert');
  });
});

describe('builtin-skills -- documentation-writer', () => {
  const id = 'documentation-writer';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "workflow"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('workflow');
  });

  it('triggers is a non-empty array containing "docs"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('docs');
    expect(m.triggers).toContain('readme');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection references docs files', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(sd).toHaveProperty('files');
    expect(Array.isArray(sd.files)).toBe(true);
    expect(sd.files).toContain('README.md');
  });

  it('composableWith is an array', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect(m.composableWith).toContain('api-builder');
  });
});

describe('builtin-skills -- security-specialist', () => {
  const id = 'security-specialist';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "domain"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('domain');
  });

  it('triggers is a non-empty array containing "security"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('security');
    expect(m.triggers).toContain('owasp');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection has correct structure with empty arrays', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(sd).toHaveProperty('files');
    expect(sd).toHaveProperty('dependencies');
    expect(sd).toHaveProperty('commands');
    expect(Array.isArray(sd.files)).toBe(true);
    expect(Array.isArray(sd.dependencies)).toBe(true);
  });

  it('composableWith is an array', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect(m.composableWith).toContain('devops-engineer');
  });
});

describe('builtin-skills -- performance-optimizer', () => {
  const id = 'performance-optimizer';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "domain"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('domain');
  });

  it('triggers is a non-empty array containing "performance"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('performance');
    expect(m.triggers).toContain('cache');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection has correct structure', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(sd).toHaveProperty('files');
    expect(sd).toHaveProperty('dependencies');
    expect(sd).toHaveProperty('commands');
    expect(Array.isArray(sd.files)).toBe(true);
    expect(Array.isArray(sd.dependencies)).toBe(true);
    expect(Array.isArray(sd.commands)).toBe(true);
  });

  it('composableWith is an array with database-migration', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect(m.composableWith).toContain('database-migration');
  });
});

describe('builtin-skills -- devops-engineer', () => {
  const id = 'devops-engineer';

  it('manifest.json is valid JSON with correct id', () => {
    const m = readManifest(id);
    expect(m.id).toBe(id);
  });

  it('has all required manifest fields', () => {
    const m = readManifest(id);
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      expect(m).toHaveProperty(field);
    }
  });

  it('category is "tool"', () => {
    const m = readManifest(id);
    expect(m.category).toBe('tool');
  });

  it('triggers is a non-empty array containing "docker"', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.triggers)).toBe(true);
    expect((m.triggers as string[]).length).toBeGreaterThan(0);
    expect(m.triggers).toContain('docker');
    expect(m.triggers).toContain('ci');
  });

  it('SKILL.md exists and has >100 characters', () => {
    const content = readSkillMd(id);
    expect(content.length).toBeGreaterThan(100);
  });

  it('stackDetection detects Dockerfile and CI config', () => {
    const m = readManifest(id);
    const sd = m.stackDetection as Record<string, unknown>;
    expect(Array.isArray(sd.files)).toBe(true);
    expect(sd.files).toContain('Dockerfile');
    expect(sd.files).toContain('docker-compose.yml');
  });

  it('composableWith is an array with security-specialist', () => {
    const m = readManifest(id);
    expect(Array.isArray(m.composableWith)).toBe(true);
    expect(m.composableWith).toContain('security-specialist');
  });
});

// --- Cross-cutting validation tests ---

describe('builtin-skills -- cross-cutting validation', () => {
  it('all manifests have valid category from allowed set', () => {
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      expect(VALID_CATEGORIES).toContain(m.category);
    }
  });

  it('all manifests have version in semver format', () => {
    const semverRe = /^\d+\.\d+\.\d+$/;
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      expect(typeof m.version).toBe('string');
      expect(semverRe.test(m.version as string)).toBe(true);
    }
  });

  it('all manifests have enabled set to true', () => {
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      expect(m.enabled).toBe(true);
    }
  });

  it('all manifests have stats with numeric fields', () => {
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      const stats = m.stats as Record<string, unknown>;
      expect(typeof stats.totalUses).toBe('number');
      expect(typeof stats.successRate).toBe('number');
      expect(typeof stats.avgCoverage).toBe('number');
    }
  });

  it('all SKILL.md files contain a markdown heading', () => {
    for (const id of SKILL_IDS) {
      const content = readSkillMd(id);
      expect(content).toMatch(/^# /m);
    }
  });

  it('no manifest has an empty name', () => {
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      expect(typeof m.name).toBe('string');
      expect((m.name as string).trim().length).toBeGreaterThan(0);
    }
  });

  it('no manifest has an empty description', () => {
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      expect(typeof m.description).toBe('string');
      expect((m.description as string).trim().length).toBeGreaterThan(0);
    }
  });

  it('composableWith references only valid skill ids', () => {
    const allIds = new Set(SKILL_IDS);
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      if (Array.isArray(m.composableWith)) {
        for (const ref of m.composableWith as string[]) {
          expect(allIds.has(ref as typeof SKILL_IDS[number])).toBe(true);
        }
      }
    }
  });

  it('no skill is composable with itself', () => {
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      if (Array.isArray(m.composableWith)) {
        expect(m.composableWith).not.toContain(id);
      }
    }
  });

  it('all manifests have promptInjection with position and maxTokens', () => {
    for (const id of SKILL_IDS) {
      const m = readManifest(id);
      const pi = m.promptInjection as Record<string, unknown>;
      expect(pi).toHaveProperty('position');
      expect(pi).toHaveProperty('maxTokens');
      expect(typeof pi.maxTokens).toBe('number');
    }
  });
});
