import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeNewSkill, persistSkillActivation } from '../../src/orchestra/ecosystem-intelligence.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let testDir: string;

function makeSkillDir(id: string, manifest: Record<string, unknown>, skillMd?: string): string {
  const dir = join(testDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (skillMd) {
    writeFileSync(join(dir, 'SKILL.md'), skillMd);
  }
  return dir;
}

beforeEach(() => {
  testDir = join(tmpdir(), `deckent-eco-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

// ─── analyzeNewSkill ──────────────────────────────────────────────────────────

describe('analyzeNewSkill', () => {
  it('generates activation rules from trigger keywords', () => {
    const dir = makeSkillDir('testing-expert', {
      id: 'testing-expert',
      name: 'Testing Expert',
      triggers: ['test', 'coverage', 'spec', 'vitest'],
      category: 'tool',
    });

    const config = analyzeNewSkill(dir);
    expect(config.rules.length).toBeGreaterThan(0);
    expect(config.minScore).toBeGreaterThan(0);
    // Primary intent should be 'testing'
    const testingRule = config.rules.find(r => r.when['intent.primary'] === 'testing');
    expect(testingRule).toBeDefined();
  });

  it('generates exclusion rules for documentation skill', () => {
    const dir = makeSkillDir('documentation-writer', {
      id: 'documentation-writer',
      name: 'Documentation Writer',
      triggers: ['docs', 'documentation', 'readme', 'guide', 'markdown'],
      category: 'domain',
    }, '# Documentation Writer\n\nWrites docs and README files.');

    const config = analyzeNewSkill(dir);
    expect(config.rules.length).toBeGreaterThan(0);
    // documentation primary intent should exclude implementation
    const primaryRule = config.rules[0];
    if (primaryRule?.when['intent.primary'] === 'documentation') {
      expect(config.exclude.some(e => e.when['intent.primary'] === 'implementation')).toBe(true);
    }
  });

  it('returns a default rule when skill has no recognizable keywords', () => {
    const dir = makeSkillDir('mystery-skill', {
      id: 'mystery-skill',
      name: 'Mystery Skill',
      triggers: [],
      category: 'tool',
    });

    const config = analyzeNewSkill(dir);
    // Should always return at least one rule
    expect(config.rules.length).toBeGreaterThanOrEqual(1);
    expect(config.minScore).toBeGreaterThan(0);
  });

  it('returns a valid ActivationConfig structure', () => {
    const dir = makeSkillDir('security-specialist', {
      id: 'security-specialist',
      name: 'Security Specialist',
      triggers: ['security', 'auth', 'vulnerability', 'audit'],
      category: 'domain',
    });

    const config = analyzeNewSkill(dir);
    expect(Array.isArray(config.rules)).toBe(true);
    expect(Array.isArray(config.exclude)).toBe(true);
    expect(typeof config.minScore).toBe('number');
    for (const rule of config.rules) {
      expect(typeof rule.score).toBe('number');
      expect(typeof rule.when).toBe('object');
    }
  });

  it('handles missing manifest gracefully', () => {
    mkdirSync(join(testDir, 'empty-skill'), { recursive: true });
    const config = analyzeNewSkill(join(testDir, 'empty-skill'));
    // Should not throw, returns at least a default rule
    expect(config.rules.length).toBeGreaterThanOrEqual(1);
  });

  it('uses SKILL.md content for keyword extraction', () => {
    const dir = makeSkillDir('devops-skill', {
      id: 'devops-skill',
      name: 'DevOps Skill',
      triggers: [],
      category: 'workflow',
    }, '# DevOps Skill\n\nManages CI/CD pipelines, deployments, GitHub Actions workflows and docker containers.');

    const config = analyzeNewSkill(dir);
    expect(config.rules.length).toBeGreaterThan(0);
    // DevOps-related content should produce devops intent
    const devopsRule = config.rules.find(r => r.when['intent.primary'] === 'devops');
    expect(devopsRule).toBeDefined();
  });
});

// ─── persistSkillActivation ───────────────────────────────────────────────────

describe('persistSkillActivation', () => {
  it('writes manifestVersion and activation to manifest.json', () => {
    const dir = makeSkillDir('ts-expert', {
      id: 'ts-expert',
      name: 'TS Expert',
      version: '1.0.0',
      triggers: ['typescript'],
    });

    const activation = {
      rules: [{ when: { 'intent.primary': 'implementation' }, score: 8 }],
      exclude: [],
      minScore: 5,
    };

    persistSkillActivation(dir, activation);

    const updated = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as Record<string, unknown>;
    expect(updated['manifestVersion']).toBe(2);
    expect(updated['activation']).toEqual(activation);
  });

  it('does not overwrite an existing V2 manifest', () => {
    const originalActivation = {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    };
    const dir = makeSkillDir('existing-v2', {
      id: 'existing-v2',
      name: 'Existing V2',
      manifestVersion: 2,
      activation: originalActivation,
    });

    const newActivation = {
      rules: [{ when: { 'intent.primary': 'documentation' }, score: 3 }],
      exclude: [],
      minScore: 5,
    };

    persistSkillActivation(dir, newActivation);

    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as Record<string, unknown>;
    // Should not have been overwritten
    expect(manifest['activation']).toEqual(originalActivation);
  });

  it('silently skips when manifest file is missing', () => {
    mkdirSync(join(testDir, 'no-manifest'), { recursive: true });
    // Should not throw
    expect(() => persistSkillActivation(join(testDir, 'no-manifest'), {
      rules: [], exclude: [], minScore: 5,
    })).not.toThrow();
  });
});
