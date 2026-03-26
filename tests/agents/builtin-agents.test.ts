import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const AGENTS_DIR = resolve(__dirname, '../../.deckent/agents');

const BUILTIN_AGENTS = [
  'security-auditor',
  'test-writer',
  'doc-writer',
  'code-reviewer',
  'refactorer',
  'bug-fixer',
  'api-builder',
  'performance-analyzer',
];

const VALID_MODELS = ['opus', 'sonnet', 'haiku'];

interface AgentStats {
  totalUses: number;
  successRate: number;
  avgCoverage: number;
  lastUsedInSprint: string;
}

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  expertise: string[];
  allowedTools: string[];
  deniedTools: string[];
  preferredModel: string;
  effortMultiplier: number;
  triggerKeywords: string[];
  triggerScopes?: string[];
  triggerFilePatterns?: string[];
  persistent?: boolean;
  enabled: boolean;
  source: string;
  stats: AgentStats;
}

function readAgentJson(agentId: string): AgentConfig {
  const filePath = resolve(AGENTS_DIR, agentId, 'agent.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as AgentConfig;
}

function readPromptMd(agentId: string): string {
  const filePath = resolve(AGENTS_DIR, agentId, 'PROMPT.md');
  return readFileSync(filePath, 'utf-8');
}

describe('Built-in Agents', () => {
  describe('all agents directory structure', () => {
    it('should have all 8 built-in agent directories', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const dirPath = resolve(AGENTS_DIR, agentId);
        expect(existsSync(dirPath), `Directory missing: ${dirPath}`).toBe(true);
      }
    });

    it('should have agent.json in every agent directory', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const filePath = resolve(AGENTS_DIR, agentId, 'agent.json');
        expect(existsSync(filePath), `agent.json missing for ${agentId}`).toBe(true);
      }
    });

    it('should have PROMPT.md in every agent directory', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const filePath = resolve(AGENTS_DIR, agentId, 'PROMPT.md');
        expect(existsSync(filePath), `PROMPT.md missing for ${agentId}`).toBe(true);
      }
    });
  });

  describe('security-auditor', () => {
    const agentId = 'security-auditor';

    it('should have valid JSON in agent.json', () => {
      const config = readAgentJson(agentId);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have correct id and name', () => {
      const config = readAgentJson(agentId);
      expect(config.id).toBe('security-auditor');
      expect(config.name).toBe('Security Auditor');
    });

    it('should have non-empty triggerKeywords', () => {
      const config = readAgentJson(agentId);
      expect(Array.isArray(config.triggerKeywords)).toBe(true);
      expect(config.triggerKeywords.length).toBeGreaterThan(0);
      expect(config.triggerKeywords).toContain('security');
      expect(config.triggerKeywords).toContain('xss');
      expect(config.triggerKeywords).toContain('injection');
    });

    it('should have valid preferredModel', () => {
      const config = readAgentJson(agentId);
      expect(VALID_MODELS).toContain(config.preferredModel);
      expect(config.preferredModel).toBe('opus');
    });

    it('should have effortMultiplier in valid range', () => {
      const config = readAgentJson(agentId);
      expect(config.effortMultiplier).toBeGreaterThanOrEqual(0.1);
      expect(config.effortMultiplier).toBeLessThanOrEqual(3.0);
      expect(config.effortMultiplier).toBe(1.2);
    });

    it('should have PROMPT.md with substantial content', () => {
      const content = readPromptMd(agentId);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('OWASP');
      expect(content).toContain('Threat Modeling');
    });
  });

  describe('test-writer', () => {
    const agentId = 'test-writer';

    it('should have valid JSON in agent.json', () => {
      const config = readAgentJson(agentId);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have correct id and name', () => {
      const config = readAgentJson(agentId);
      expect(config.id).toBe('test-writer');
      expect(config.name).toBe('Test Writer');
    });

    it('should have non-empty triggerKeywords', () => {
      const config = readAgentJson(agentId);
      expect(Array.isArray(config.triggerKeywords)).toBe(true);
      expect(config.triggerKeywords.length).toBeGreaterThan(0);
      expect(config.triggerKeywords).toContain('test');
      expect(config.triggerKeywords).toContain('coverage');
      expect(config.triggerKeywords).toContain('vitest');
    });

    it('should have valid preferredModel', () => {
      const config = readAgentJson(agentId);
      expect(VALID_MODELS).toContain(config.preferredModel);
      expect(config.preferredModel).toBe('sonnet');
    });

    it('should have effortMultiplier in valid range', () => {
      const config = readAgentJson(agentId);
      expect(config.effortMultiplier).toBeGreaterThanOrEqual(0.1);
      expect(config.effortMultiplier).toBeLessThanOrEqual(3.0);
    });

    it('should have PROMPT.md with substantial content', () => {
      const content = readPromptMd(agentId);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('Arrange-Act-Assert');
      expect(content).toContain('vitest');
    });
  });

  describe('doc-writer', () => {
    const agentId = 'doc-writer';

    it('should have valid JSON in agent.json', () => {
      const config = readAgentJson(agentId);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have correct id and name', () => {
      const config = readAgentJson(agentId);
      expect(config.id).toBe('doc-writer');
      expect(config.name).toBe('Doc Writer');
    });

    it('should have non-empty triggerKeywords', () => {
      const config = readAgentJson(agentId);
      expect(Array.isArray(config.triggerKeywords)).toBe(true);
      expect(config.triggerKeywords.length).toBeGreaterThan(0);
      expect(config.triggerKeywords).toContain('docs');
      expect(config.triggerKeywords).toContain('readme');
      expect(config.triggerKeywords).toContain('changelog');
    });

    it('should have valid preferredModel and restricted tools', () => {
      const config = readAgentJson(agentId);
      expect(VALID_MODELS).toContain(config.preferredModel);
      expect(config.preferredModel).toBe('sonnet');
      expect(config.allowedTools).toContain('Read');
      expect(config.allowedTools).toContain('Write');
      expect(config.deniedTools).toContain('Bash');
    });

    it('should have effortMultiplier in valid range', () => {
      const config = readAgentJson(agentId);
      expect(config.effortMultiplier).toBeGreaterThanOrEqual(0.1);
      expect(config.effortMultiplier).toBeLessThanOrEqual(3.0);
      expect(config.effortMultiplier).toBe(0.8);
    });

    it('should have PROMPT.md with substantial content', () => {
      const content = readPromptMd(agentId);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('Changelog');
      expect(content).toContain('JSDoc');
    });
  });

  describe('code-reviewer', () => {
    const agentId = 'code-reviewer';

    it('should have valid JSON in agent.json', () => {
      const config = readAgentJson(agentId);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have correct id and name', () => {
      const config = readAgentJson(agentId);
      expect(config.id).toBe('code-reviewer');
      expect(config.name).toBe('Code Reviewer');
    });

    it('should have non-empty triggerKeywords', () => {
      const config = readAgentJson(agentId);
      expect(Array.isArray(config.triggerKeywords)).toBe(true);
      expect(config.triggerKeywords.length).toBeGreaterThan(0);
      expect(config.triggerKeywords).toContain('review');
      expect(config.triggerKeywords).toContain('code-review');
    });

    it('should have valid preferredModel and read-only tools', () => {
      const config = readAgentJson(agentId);
      expect(VALID_MODELS).toContain(config.preferredModel);
      expect(config.preferredModel).toBe('opus');
      expect(config.allowedTools).toContain('Read');
      expect(config.allowedTools).toContain('Grep');
      expect(config.deniedTools).toContain('Write');
    });

    it('should have effortMultiplier in valid range', () => {
      const config = readAgentJson(agentId);
      expect(config.effortMultiplier).toBeGreaterThanOrEqual(0.1);
      expect(config.effortMultiplier).toBeLessThanOrEqual(3.0);
    });

    it('should have PROMPT.md with substantial content', () => {
      const content = readPromptMd(agentId);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('CRITICAL');
      expect(content).toContain('Review Checklist');
    });
  });

  describe('refactorer', () => {
    const agentId = 'refactorer';

    it('should have valid JSON in agent.json', () => {
      const config = readAgentJson(agentId);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have correct id and name', () => {
      const config = readAgentJson(agentId);
      expect(config.id).toBe('refactorer');
      expect(config.name).toBe('Refactorer');
    });

    it('should have non-empty triggerKeywords', () => {
      const config = readAgentJson(agentId);
      expect(Array.isArray(config.triggerKeywords)).toBe(true);
      expect(config.triggerKeywords.length).toBeGreaterThan(0);
      expect(config.triggerKeywords).toContain('refactor');
      expect(config.triggerKeywords).toContain('extract');
      expect(config.triggerKeywords).toContain('modularize');
    });

    it('should have valid preferredModel', () => {
      const config = readAgentJson(agentId);
      expect(VALID_MODELS).toContain(config.preferredModel);
      expect(config.preferredModel).toBe('sonnet');
    });

    it('should have effortMultiplier in valid range', () => {
      const config = readAgentJson(agentId);
      expect(config.effortMultiplier).toBeGreaterThanOrEqual(0.1);
      expect(config.effortMultiplier).toBeLessThanOrEqual(3.0);
    });

    it('should have PROMPT.md with substantial content', () => {
      const content = readPromptMd(agentId);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('Extract');
      expect(content).toContain('Preserve Behavior');
    });
  });

  describe('bug-fixer', () => {
    const agentId = 'bug-fixer';

    it('should have valid JSON in agent.json', () => {
      const config = readAgentJson(agentId);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have correct id and name', () => {
      const config = readAgentJson(agentId);
      expect(config.id).toBe('bug-fixer');
      expect(config.name).toBe('Bug Fixer');
    });

    it('should have non-empty triggerKeywords', () => {
      const config = readAgentJson(agentId);
      expect(Array.isArray(config.triggerKeywords)).toBe(true);
      expect(config.triggerKeywords.length).toBeGreaterThan(0);
      expect(config.triggerKeywords).toContain('fix');
      expect(config.triggerKeywords).toContain('bug');
      expect(config.triggerKeywords).toContain('regression');
    });

    it('should have valid preferredModel and high effort', () => {
      const config = readAgentJson(agentId);
      expect(VALID_MODELS).toContain(config.preferredModel);
      expect(config.preferredModel).toBe('opus');
      expect(config.effortMultiplier).toBe(1.5);
    });

    it('should have effortMultiplier in valid range', () => {
      const config = readAgentJson(agentId);
      expect(config.effortMultiplier).toBeGreaterThanOrEqual(0.1);
      expect(config.effortMultiplier).toBeLessThanOrEqual(3.0);
    });

    it('should have PROMPT.md with substantial content', () => {
      const content = readPromptMd(agentId);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('Root Cause');
      expect(content).toContain('Regression Test');
    });
  });

  describe('api-builder', () => {
    const agentId = 'api-builder';

    it('should have valid JSON in agent.json', () => {
      const config = readAgentJson(agentId);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have correct id and name', () => {
      const config = readAgentJson(agentId);
      expect(config.id).toBe('api-builder');
      expect(config.name).toBe('API Builder');
    });

    it('should have non-empty triggerKeywords', () => {
      const config = readAgentJson(agentId);
      expect(Array.isArray(config.triggerKeywords)).toBe(true);
      expect(config.triggerKeywords.length).toBeGreaterThan(0);
      expect(config.triggerKeywords).toContain('api');
      expect(config.triggerKeywords).toContain('endpoint');
      expect(config.triggerKeywords).toContain('rest');
    });

    it('should have valid preferredModel', () => {
      const config = readAgentJson(agentId);
      expect(VALID_MODELS).toContain(config.preferredModel);
      expect(config.preferredModel).toBe('sonnet');
    });

    it('should have effortMultiplier in valid range', () => {
      const config = readAgentJson(agentId);
      expect(config.effortMultiplier).toBeGreaterThanOrEqual(0.1);
      expect(config.effortMultiplier).toBeLessThanOrEqual(3.0);
    });

    it('should have PROMPT.md with substantial content', () => {
      const content = readPromptMd(agentId);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('REST');
      expect(content).toContain('HTTP Status');
    });
  });

  describe('performance-analyzer', () => {
    const agentId = 'performance-analyzer';

    it('should have valid JSON in agent.json', () => {
      const config = readAgentJson(agentId);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have correct id and name', () => {
      const config = readAgentJson(agentId);
      expect(config.id).toBe('performance-analyzer');
      expect(config.name).toBe('Performance Analyzer');
    });

    it('should have non-empty triggerKeywords', () => {
      const config = readAgentJson(agentId);
      expect(Array.isArray(config.triggerKeywords)).toBe(true);
      expect(config.triggerKeywords.length).toBeGreaterThan(0);
      expect(config.triggerKeywords).toContain('performance');
      expect(config.triggerKeywords).toContain('optimize');
      expect(config.triggerKeywords).toContain('bottleneck');
    });

    it('should have valid preferredModel', () => {
      const config = readAgentJson(agentId);
      expect(VALID_MODELS).toContain(config.preferredModel);
      expect(config.preferredModel).toBe('opus');
    });

    it('should have effortMultiplier in valid range', () => {
      const config = readAgentJson(agentId);
      expect(config.effortMultiplier).toBeGreaterThanOrEqual(0.1);
      expect(config.effortMultiplier).toBeLessThanOrEqual(3.0);
      expect(config.effortMultiplier).toBe(1.3);
    });

    it('should have PROMPT.md with substantial content', () => {
      const content = readPromptMd(agentId);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('Big-O');
      expect(content).toContain('Memory Leak');
    });
  });

  describe('cross-agent validation', () => {
    it('should have unique ids across all agents', () => {
      const ids = BUILTIN_AGENTS.map((id) => readAgentJson(id).id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(BUILTIN_AGENTS.length);
    });

    it('should have unique names across all agents', () => {
      const names = BUILTIN_AGENTS.map((id) => readAgentJson(id).name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(BUILTIN_AGENTS.length);
    });

    it('should all have source set to builtin', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const config = readAgentJson(agentId);
        expect(config.source).toBe('builtin');
      }
    });

    it('should all have enabled set to true', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const config = readAgentJson(agentId);
        expect(config.enabled).toBe(true);
      }
    });

    it('should all have valid stats object with expected shape', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const config = readAgentJson(agentId);
        expect(config.stats).toBeDefined();
        expect(typeof config.stats.totalUses).toBe('number');
        expect(typeof config.stats.successRate).toBe('number');
        expect(typeof config.stats.avgCoverage).toBe('number');
        expect(typeof config.stats.lastUsedInSprint).toBe('string');
      }
    });

    it('should all have non-empty description', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const config = readAgentJson(agentId);
        expect(config.description.length).toBeGreaterThan(10);
      }
    });

    it('should all have non-empty expertise array', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const config = readAgentJson(agentId);
        expect(Array.isArray(config.expertise)).toBe(true);
        expect(config.expertise.length).toBeGreaterThan(0);
      }
    });

    it('should all have allowedTools as array', () => {
      for (const agentId of BUILTIN_AGENTS) {
        const config = readAgentJson(agentId);
        expect(Array.isArray(config.allowedTools)).toBe(true);
        expect(config.allowedTools.length).toBeGreaterThan(0);
      }
    });
  });
});
