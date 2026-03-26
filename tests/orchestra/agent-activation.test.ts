import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import { createDefaultStats } from '../../src/core/agent-types.js';
import { resolveAgentPrompt } from '../../src/orchestra/sprint-controller.js';
import { createTask } from '../../src/orchestra/task-builder.js';
import { selectAgent } from '../../src/core/agent-selector.js';
import type { Task, CreateTaskParams } from '../../src/core/types.js';
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

    it('combines systemPrompt + expertise + PROMPT.md when all exist', () => {
      writeAgentJson(tmpDir, 'test-agent', makeAgentDef('test-agent', 'From agent.json'));
      const promptDir = path.join(tmpDir, '.deckent', 'agents', 'test-agent');
      fs.writeFileSync(path.join(promptDir, 'PROMPT.md'), 'From PROMPT.md', 'utf-8');
      const task = makeTask({ assignedAgent: 'test-agent' });
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toContain('From agent.json');
      expect(result).toContain('Expertise:');
      expect(result).toContain('From PROMPT.md');
    });

    it('returns undefined for generic agent', () => {
      const task = makeTask({ assignedAgent: 'generic' });
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toBeUndefined();
    });
  });

  // ─── B2) forceModel does NOT bypass agent selection ─────────────────────

  describe('forceModel agent bypass removed', () => {
    it('resolveAgentPrompt works when task has forceModel and assignedAgent', () => {
      writeAgentJson(tmpDir, 'test-agent', makeAgentDef('test-agent', 'Specialized prompt'));
      const task = makeTask({ assignedAgent: 'test-agent', forceModel: 'opus' } as Partial<Task>);
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toContain('Specialized prompt');
    });

    it('resolveAgentPrompt returns undefined only for generic, not for forceModel tasks', () => {
      writeAgentJson(tmpDir, 'bug-fixer', makeAgentDef('bug-fixer', 'Fix bugs'));
      const task = makeTask({ assignedAgent: 'bug-fixer', forceModel: 'sonnet' } as Partial<Task>);
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toBeDefined();
      expect(result).toContain('Fix bugs');
    });

    it('agent prompt includes expertise even with forceModel', () => {
      writeAgentJson(tmpDir, 'test-agent', makeAgentDef('test-agent', 'Agent prompt'));
      const task = makeTask({ assignedAgent: 'test-agent', forceModel: 'haiku' } as Partial<Task>);
      const result = resolveAgentPrompt(tmpDir, task);
      expect(result).toContain('Expertise:');
      expect(result).toContain('testing');
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

  // ─── D) Agent Assignment Persistence (Sprint 061) ───────────────────────

  describe('createTask — assignedAgent/assignedSkills defaults', () => {
    function makeCreateParams(overrides: Partial<CreateTaskParams> = {}): CreateTaskParams {
      return {
        title: 'Test Task',
        description: 'A test task description',
        model: 'sonnet',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'Testing purposes',
        scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/foo.ts'] },
        dependencies: [],
        goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
        sprintId: 'sprint-061',
        ...overrides,
      };
    }

    it('createTask initializes assignedAgent to generic', () => {
      const task = createTask(makeCreateParams(), 1);
      expect(task.assignedAgent).toBe('generic');
    });

    it('createTask initializes assignedSkills to empty array', () => {
      const task = createTask(makeCreateParams(), 1);
      expect(task.assignedSkills).toEqual([]);
    });

    it('assignedAgent persists in JSON serialization', () => {
      const task = createTask(makeCreateParams(), 1);
      const json = JSON.parse(JSON.stringify(task));
      expect(json.assignedAgent).toBe('generic');
      expect(json.assignedSkills).toEqual([]);
    });

    it('assignedAgent can be mutated and re-serialized', () => {
      const task = createTask(makeCreateParams(), 1);
      task.assignedAgent = 'security-auditor';
      task.assignedSkills = ['typescript-expert'];
      const json = JSON.parse(JSON.stringify(task));
      expect(json.assignedAgent).toBe('security-auditor');
      expect(json.assignedSkills).toEqual(['typescript-expert']);
    });
  });

  // ─── E) End-to-End: selectAgent → createTask → JSON persistence ────────

  describe('Agent Assignment End-to-End Persistence', () => {
    function makeSecurityAgent(): Record<string, unknown> {
      return {
        id: 'security-auditor',
        name: 'Security Auditor',
        description: 'Security vulnerability detection agent',
        systemPrompt: 'You are a security specialist focused on vulnerability detection.',
        expertise: ['security', 'vulnerability', 'audit'],
        allowedTools: ['Read', 'Grep'],
        deniedTools: [],
        preferredModel: 'opus',
        effortMultiplier: 1.5,
        triggerKeywords: ['security', 'vulnerability', 'audit', 'auth', 'xss', 'injection'],
        triggerScopes: ['src/auth/', 'src/api/', 'src/middleware/'],
        triggerFilePatterns: ['**/auth*.ts', '**/security*.ts'],
        persistent: true,
        enabled: true,
        source: 'builtin',
        stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
      };
    }

    it('selectAgent matches security task to security-auditor', () => {
      writeAgentJson(tmpDir, 'security-auditor', makeSecurityAgent());
      const pool = new AgentPoolManager(tmpDir);
      const agents = pool.loadAgents();

      const task = {
        title: 'Fix security vulnerability in auth module',
        description: 'Patch XSS injection vulnerability in the authentication flow',
        scope: { directories: ['src/auth/'], filesWrite: ['src/auth/handler.ts'] },
      };

      const result = selectAgent(task, agents);
      expect(result.agent).not.toBeNull();
      expect(result.agent!.id).toBe('security-auditor');
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it('createTask + selectAgent → task JSON has correct assignedAgent', () => {
      writeAgentJson(tmpDir, 'security-auditor', makeSecurityAgent());
      const pool = new AgentPoolManager(tmpDir);
      const agents = pool.loadAgents();

      const task = createTask({
        title: 'Fix security vulnerability in auth module',
        description: 'Patch XSS injection vulnerability in the authentication flow',
        model: 'sonnet',
        effort: 'high',
        priority: 'CRITICAL',
        reason: 'Security fix',
        scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/handler.ts'] },
        dependencies: [],
        goNogo: { goCriteria: 'No XSS', noGoCriteria: 'XSS present', techDebtAcceptable: 'none' },
        sprintId: 'sprint-061',
      }, 1);

      // Default is generic
      expect(task.assignedAgent).toBe('generic');

      // After selectAgent, assign result to task
      const result = selectAgent(task, agents);
      task.assignedAgent = result.agent?.id ?? 'generic';
      expect(task.assignedAgent).toBe('security-auditor');

      // Verify persistence through JSON round-trip
      const serialized = JSON.stringify(task, null, 2);
      const deserialized = JSON.parse(serialized);
      expect(deserialized.assignedAgent).toBe('security-auditor');
    });

    it('createTask + selectAgent → write to disk → read back', () => {
      writeAgentJson(tmpDir, 'security-auditor', makeSecurityAgent());
      const pool = new AgentPoolManager(tmpDir);
      const agents = pool.loadAgents();

      const task = createTask({
        title: 'Audit security headers',
        description: 'Check and fix security headers for XSS and CSRF protection',
        model: 'opus',
        effort: 'high',
        priority: 'CRITICAL',
        reason: 'Security audit',
        scope: { directories: ['src/auth/'], filesRead: [], filesWrite: ['src/auth/headers.ts'] },
        dependencies: [],
        goNogo: { goCriteria: 'Headers secure', noGoCriteria: 'Vulnerable', techDebtAcceptable: 'minor' },
        sprintId: 'sprint-061',
      }, 2);

      // Select and assign agent
      const result = selectAgent(task, agents);
      task.assignedAgent = result.agent?.id ?? 'generic';
      task.assignedSkills = ['typescript-expert', 'security-specialist'];

      // Write to disk
      const tasksDir = path.join(tmpDir, '.tasks');
      fs.mkdirSync(tasksDir, { recursive: true });
      const taskFile = path.join(tasksDir, `task-${task.id}.json`);
      fs.writeFileSync(taskFile, JSON.stringify(task, null, 2), 'utf-8');

      // Read back and verify
      const readBack = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));
      expect(readBack.assignedAgent).toBe('security-auditor');
      expect(readBack.assignedSkills).toEqual(['typescript-expert', 'security-specialist']);
    });

    it('non-matching task remains generic after selectAgent', () => {
      writeAgentJson(tmpDir, 'security-auditor', makeSecurityAgent());
      const pool = new AgentPoolManager(tmpDir);
      const agents = pool.loadAgents();

      const task = createTask({
        title: 'Add logging to config loader',
        description: 'Simple logging enhancement for configuration module',
        model: 'sonnet',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'Debugging',
        scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
        dependencies: [],
        goNogo: { goCriteria: 'Logs work', noGoCriteria: 'Logs fail', techDebtAcceptable: 'minor' },
        sprintId: 'sprint-061',
      }, 3);

      const result = selectAgent(task, agents);
      task.assignedAgent = result.agent?.id ?? 'generic';
      expect(task.assignedAgent).toBe('generic');

      // Verify generic persists through serialization
      const json = JSON.parse(JSON.stringify(task));
      expect(json.assignedAgent).toBe('generic');
    });
  });
});
