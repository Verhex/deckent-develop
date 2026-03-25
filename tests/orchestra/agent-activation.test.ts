import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import { createDefaultStats } from '../../src/core/agent-types.js';
import { resolveAgentPrompt } from '../../src/orchestra/sprint-controller.js';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-activation-'));
}

function writeAgentJson(root: string, id: string, agent: Record<string, unknown>): void {
  const dir = path.join(root, '.deckent', 'agents', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(agent, null, 2), 'utf-8');
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-054',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Task;
}

function makeAgentDef(id: string, systemPrompt: string): Record<string, unknown> {
  return {
    id,
    name: id,
    description: `${id} agent`,
    systemPrompt,
    expertise: ['testing', 'quality'],
    allowedTools: ['Read'],
    deniedTools: [],
    preferredModel: 'sonnet',
    effortMultiplier: 1.0,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: false,
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Agent Activation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── A) systemPrompt in agent.json ─────────────────────────────────────

  describe('systemPrompt in agent.json', () => {
    it('all 8 builtin agents have non-empty systemPrompt', () => {
      const agentIds = [
        'security-auditor', 'test-writer', 'doc-writer', 'bug-fixer',
        'code-reviewer', 'refactorer', 'api-builder', 'performance-analyzer',
      ];
      const projectRoot = path.resolve(__dirname, '../..');
      for (const id of agentIds) {
        const filePath = path.join(projectRoot, '.deckent', 'agents', id, 'agent.json');
        const agent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        expect(agent.systemPrompt, `${id} should have systemPrompt`).toBeTruthy();
        expect(typeof agent.systemPrompt).toBe('string');
        // 100-200 words → roughly 400-1400 chars
        expect(agent.systemPrompt.length).toBeGreaterThan(100);
      }
    });

    it('systemPrompt passes AgentPoolManager validation', () => {
      const agentIds = [
        'security-auditor', 'test-writer', 'doc-writer', 'bug-fixer',
        'code-reviewer', 'refactorer', 'api-builder', 'performance-analyzer',
      ];
      const projectRoot = path.resolve(__dirname, '../..');
      for (const id of agentIds) {
        const filePath = path.join(projectRoot, '.deckent', 'agents', id, 'agent.json');
        const agent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const result = AgentPoolManager.validateAgentDefinition(agent);
        expect(result.valid, `${id}: ${result.errors.join(', ')}`).toBe(true);
      }
    });

    it('loadAgents returns agents with systemPrompt populated', () => {
      const projectRoot = path.resolve(__dirname, '../..');
      const pool = new AgentPoolManager(projectRoot);
      const agents = pool.listAgents();
      const withPrompt = agents.filter(a => a.systemPrompt && a.systemPrompt.length > 0);
      expect(withPrompt.length).toBeGreaterThanOrEqual(8);
    });
  });

  // ─── B) Worker agent context injection ─────────────────────────────────

  describe('resolveAgentPrompt with systemPrompt fallback', () => {
    it('returns systemPrompt from agent.json when no PROMPT.md exists', () => {
      const prompt = 'You are a specialized test agent for unit testing.';
      writeAgentJson(tmpDir, 'test-agent', makeAgentDef('test-agent', prompt));
      const task = makeTask({ assignedAgent: 'test-agent' });
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toContain(prompt);
    });

    it('includes expertise in the resolved prompt', () => {
      writeAgentJson(tmpDir, 'test-agent', makeAgentDef('test-agent', 'You are a test agent.'));
      const task = makeTask({ assignedAgent: 'test-agent' });
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toContain('Expertise:');
      expect(result).toContain('testing');
    });

    it('prefers PROMPT.md over systemPrompt in agent.json', () => {
      writeAgentJson(tmpDir, 'test-agent', makeAgentDef('test-agent', 'From agent.json'));
      const promptDir = path.join(tmpDir, '.deckent', 'agents', 'test-agent');
      fs.writeFileSync(path.join(promptDir, 'PROMPT.md'), 'From PROMPT.md', 'utf-8');
      const task = makeTask({ assignedAgent: 'test-agent' });
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toBe('From PROMPT.md');
    });

    it('returns undefined for generic agent', () => {
      const task = makeTask({ assignedAgent: 'generic' });
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toBeUndefined();
    });
  });

  // ─── C) Agent stats update ─────────────────────────────────────────────

  describe('updateAgentStats', () => {
    it('increments totalUses on DONE evaluation', () => {
      writeAgentJson(tmpDir, 'stat-agent', makeAgentDef('stat-agent', 'test'));
      const pool = new AgentPoolManager(tmpDir);
      pool.updateAgentStats('stat-agent', 'DONE', 85, 'sprint-054');
      const agent = pool.getAgent('stat-agent');
      expect(agent?.stats.totalUses).toBe(1);
      expect(agent?.stats.successRate).toBe(1);
      expect(agent?.stats.lastUsedInSprint).toBe('sprint-054');
    });

    it('calculates successRate correctly after NO_GO', () => {
      writeAgentJson(tmpDir, 'stat-agent', makeAgentDef('stat-agent', 'test'));
      const pool = new AgentPoolManager(tmpDir);
      pool.updateAgentStats('stat-agent', 'DONE', 80, 'sprint-054');
      pool.updateAgentStats('stat-agent', 'NO_GO', 0, 'sprint-054');
      const agent = pool.getAgent('stat-agent');
      expect(agent?.stats.totalUses).toBe(2);
      expect(agent?.stats.successRate).toBe(0.5);
    });

    it('updates avgCoverage correctly', () => {
      writeAgentJson(tmpDir, 'stat-agent', makeAgentDef('stat-agent', 'test'));
      const pool = new AgentPoolManager(tmpDir);
      pool.updateAgentStats('stat-agent', 'DONE', 80, 'sprint-054');
      pool.updateAgentStats('stat-agent', 'DONE', 60, 'sprint-054');
      const agent = pool.getAgent('stat-agent');
      expect(agent?.stats.avgCoverage).toBe(70);
    });

    it('counts GO_WITH_TECH_DEBT as success', () => {
      writeAgentJson(tmpDir, 'stat-agent', makeAgentDef('stat-agent', 'test'));
      const pool = new AgentPoolManager(tmpDir);
      pool.updateAgentStats('stat-agent', 'GO_WITH_TECH_DEBT', 50, 'sprint-054');
      const agent = pool.getAgent('stat-agent');
      expect(agent?.stats.successRate).toBe(1);
    });
  });
});
