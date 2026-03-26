import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const AGENTS_DIR = resolve(__dirname, '../../.deckent/agents');
const SKILLS_DIR = resolve(__dirname, '../../.deckent/skills');

const ALL_AGENTS = [
  'security-auditor',
  'test-writer',
  'bug-fixer',
  'doc-writer',
  'code-reviewer',
  'refactorer',
  'api-builder',
  'performance-analyzer',
  'ci-guardian',
];

const ALL_SKILLS = [
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
  'ci-testing',
];

interface ActivationRule {
  when: Record<string, unknown>;
  score: number;
}

interface ActivationConfig {
  rules: ActivationRule[];
  exclude: Array<{ when: Record<string, unknown> }>;
  minScore: number;
}

interface ManifestBase {
  manifestVersion?: number;
  activation?: ActivationConfig;
}

function readAgentJson(agentId: string): ManifestBase & Record<string, unknown> {
  const filePath = resolve(AGENTS_DIR, agentId, 'agent.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as ManifestBase & Record<string, unknown>;
}

function readSkillManifest(skillId: string): ManifestBase & Record<string, unknown> {
  const filePath = resolve(SKILLS_DIR, skillId, 'manifest.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as ManifestBase & Record<string, unknown>;
}

describe('Manifest V2 Validation', () => {
  describe('Agent manifests — manifestVersion: 2', () => {
    it('all 9 agent.json files exist', () => {
      for (const agentId of ALL_AGENTS) {
        const filePath = resolve(AGENTS_DIR, agentId, 'agent.json');
        expect(existsSync(filePath), `agent.json missing: ${agentId}`).toBe(true);
      }
    });

    it('all agents have manifestVersion: 2', () => {
      for (const agentId of ALL_AGENTS) {
        const manifest = readAgentJson(agentId);
        expect(manifest.manifestVersion, `${agentId} missing manifestVersion`).toBe(2);
      }
    });

    it('all agents have valid activation object', () => {
      for (const agentId of ALL_AGENTS) {
        const manifest = readAgentJson(agentId);
        expect(manifest.activation, `${agentId} missing activation`).toBeDefined();
        expect(Array.isArray(manifest.activation!.rules), `${agentId} activation.rules not array`).toBe(true);
        expect(manifest.activation!.rules.length, `${agentId} activation.rules empty`).toBeGreaterThan(0);
        expect(Array.isArray(manifest.activation!.exclude), `${agentId} activation.exclude not array`).toBe(true);
        expect(typeof manifest.activation!.minScore, `${agentId} activation.minScore missing`).toBe('number');
        expect(manifest.activation!.minScore, `${agentId} minScore should be 5`).toBe(5);
      }
    });

    it('each activation rule has when and score', () => {
      for (const agentId of ALL_AGENTS) {
        const manifest = readAgentJson(agentId);
        for (const rule of manifest.activation!.rules) {
          expect(rule.when, `${agentId} rule missing 'when'`).toBeDefined();
          expect(typeof rule.score, `${agentId} rule missing 'score'`).toBe('number');
          expect(rule.score, `${agentId} rule score must be >= 1`).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  describe('Skill manifests — manifestVersion: 2', () => {
    it('all 11 skill manifest.json files exist', () => {
      for (const skillId of ALL_SKILLS) {
        const filePath = resolve(SKILLS_DIR, skillId, 'manifest.json');
        expect(existsSync(filePath), `manifest.json missing: ${skillId}`).toBe(true);
      }
    });

    it('all skills have manifestVersion: 2', () => {
      for (const skillId of ALL_SKILLS) {
        const manifest = readSkillManifest(skillId);
        expect(manifest.manifestVersion, `${skillId} missing manifestVersion`).toBe(2);
      }
    });

    it('all skills have valid activation object', () => {
      for (const skillId of ALL_SKILLS) {
        const manifest = readSkillManifest(skillId);
        expect(manifest.activation, `${skillId} missing activation`).toBeDefined();
        expect(Array.isArray(manifest.activation!.rules), `${skillId} activation.rules not array`).toBe(true);
        expect(manifest.activation!.rules.length, `${skillId} activation.rules empty`).toBeGreaterThan(0);
        expect(Array.isArray(manifest.activation!.exclude), `${skillId} activation.exclude not array`).toBe(true);
        expect(typeof manifest.activation!.minScore, `${skillId} activation.minScore missing`).toBe('number');
      }
    });

    it('ci-testing skill has exclude for implementation intent', () => {
      const manifest = readSkillManifest('ci-testing');
      expect(manifest.activation).toBeDefined();
      expect(manifest.activation!.exclude.length).toBeGreaterThan(0);
      const hasImplementationExclude = manifest.activation!.exclude.some(
        (ex) => ex.when['intent.primary'] === 'implementation'
      );
      expect(hasImplementationExclude, 'ci-testing must exclude intent.primary=implementation').toBe(true);
    });
  });

  describe('Specific agent activation rules', () => {
    it('security-auditor activates on security intent', () => {
      const manifest = readAgentJson('security-auditor');
      const hasSecurityRule = manifest.activation!.rules.some(
        (r) => r.when['intent.primary'] === 'security' && r.score >= 10
      );
      expect(hasSecurityRule).toBe(true);
    });

    it('security-auditor excludes documentation intent', () => {
      const manifest = readAgentJson('security-auditor');
      const hasDocExclude = manifest.activation!.exclude.some(
        (ex) => ex.when['intent.primary'] === 'documentation'
      );
      expect(hasDocExclude).toBe(true);
    });

    it('ci-guardian activates on devops intent', () => {
      const manifest = readAgentJson('ci-guardian');
      const hasDevopsRule = manifest.activation!.rules.some(
        (r) => r.when['intent.primary'] === 'devops' && r.score >= 10
      );
      expect(hasDevopsRule).toBe(true);
    });

    it('ci-guardian excludes implementation intent', () => {
      const manifest = readAgentJson('ci-guardian');
      const hasImplementationExclude = manifest.activation!.exclude.some(
        (ex) => ex.when['intent.primary'] === 'implementation'
      );
      expect(hasImplementationExclude).toBe(true);
    });

    it('api-builder agent activates on domains containing api', () => {
      const manifest = readAgentJson('api-builder');
      const hasApiRule = manifest.activation!.rules.some(
        (r) => {
          const domains = r.when['domains'] as Record<string, unknown> | undefined;
          return domains?.['$contains'] === 'api';
        }
      );
      expect(hasApiRule).toBe(true);
    });

    it('doc-writer excludes implementation intent', () => {
      const manifest = readAgentJson('doc-writer');
      const hasImplExclude = manifest.activation!.exclude.some(
        (ex) => ex.when['intent.primary'] === 'implementation'
      );
      expect(hasImplExclude).toBe(true);
    });
  });

  describe('No regression — existing agent fields preserved', () => {
    it('security-auditor preserves triggerKeywords', () => {
      const manifest = readAgentJson('security-auditor');
      const keywords = manifest['triggerKeywords'] as string[];
      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords).toContain('security');
      expect(keywords).toContain('xss');
    });

    it('test-writer preserves preferredModel: sonnet', () => {
      const manifest = readAgentJson('test-writer');
      expect(manifest['preferredModel']).toBe('sonnet');
    });

    it('ci-testing preserves priority: 12', () => {
      const manifest = readSkillManifest('ci-testing');
      expect(manifest['priority']).toBe(12);
    });

    it('all agents still have enabled: true', () => {
      for (const agentId of ALL_AGENTS) {
        const manifest = readAgentJson(agentId);
        expect(manifest['enabled'], `${agentId} should be enabled`).toBe(true);
      }
    });

    it('all skills still have enabled: true', () => {
      for (const skillId of ALL_SKILLS) {
        const manifest = readSkillManifest(skillId);
        expect(manifest['enabled'], `${skillId} should be enabled`).toBe(true);
      }
    });
  });
});
