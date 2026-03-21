import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentConfig } from '../../src/cli/commands/agent.js';
import type { Task, TaskScope, GoNoGoCriteria, TaskStatus, ModelType, TaskEffort, TaskPriority } from '../../src/core/types.js';

// ─── Agent Selection Logic ──────────────────────────────────────────

/**
 * Simplified agent selection: match task title/description against agent triggers.
 * Returns the best matching agent name, or 'generic' if no match.
 */
function selectAgent(task: Pick<Task, 'title' | 'description'>, agents: AgentConfig[]): string {
  const text = `${task.title} ${task.description}`.toLowerCase();
  let bestAgent = 'generic';
  let bestScore = 0;

  for (const agent of agents) {
    if (!agent.enabled) continue;
    let score = 0;
    for (const trigger of agent.triggers) {
      if (text.includes(trigger.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent.name;
    }
  }

  return bestAgent;
}

/**
 * Load agent prompt from PROMPT.md content and inject task context.
 */
function buildAgentPrompt(promptTemplate: string, task: Pick<Task, 'title' | 'description'>): string {
  return `${promptTemplate}\n\n## Current Task\nTitle: ${task.title}\nDescription: ${task.description}`;
}

// ─── Mock Agent Configs ─────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentConfig>): AgentConfig {
  return {
    name: 'generic',
    type: 'built-in',
    enabled: true,
    model: 'sonnet',
    triggers: [],
    description: 'Generic agent',
    uses: 0,
    successRate: 0,
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:00:00.000Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<{ title: string; description: string }>): Pick<Task, 'title' | 'description'> {
  return {
    title: overrides.title ?? 'Default task',
    description: overrides.description ?? 'Default description',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Agent Selection Integration', () => {
  let securityAuditor: AgentConfig;
  let testWriter: AgentConfig;
  let docWriter: AgentConfig;
  let codeReviewer: AgentConfig;

  beforeEach(() => {
    securityAuditor = makeAgent({
      name: 'security-auditor',
      triggers: ['security', 'vulnerability', 'jwt', 'authentication', 'xss', 'csrf', 'injection'],
      description: 'Security-focused code auditing agent',
      model: 'opus',
    });

    testWriter = makeAgent({
      name: 'test-writer',
      triggers: ['test', 'unit test', 'integration test', 'coverage', 'spec'],
      description: 'Test creation and validation agent',
      model: 'sonnet',
    });

    docWriter = makeAgent({
      name: 'doc-writer',
      triggers: ['readme', 'documentation', 'docs', 'changelog', 'api docs'],
      description: 'Documentation authoring agent',
      model: 'haiku',
    });

    codeReviewer = makeAgent({
      name: 'code-reviewer',
      triggers: ['review', 'refactor', 'code quality', 'lint', 'clean up'],
      description: 'Code review and refactoring agent',
      model: 'sonnet',
    });
  });

  // ─── Basic Selection ────────────────────────────────────────────

  it('selects security-auditor for JWT vulnerability task', () => {
    const task = makeTask({
      title: 'Fix JWT authentication vulnerability',
      description: 'The JWT token validation has a critical security flaw',
    });
    const agents = [securityAuditor, testWriter, docWriter, codeReviewer];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('security-auditor');
  });

  it('selects test-writer for unit test task', () => {
    const task = makeTask({
      title: 'Write unit tests for auth module',
      description: 'Add comprehensive test coverage for the authentication module',
    });
    const agents = [securityAuditor, testWriter, docWriter, codeReviewer];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('test-writer');
  });

  it('selects doc-writer for README update task', () => {
    const task = makeTask({
      title: 'Update README',
      description: 'Update the README documentation with latest API changes',
    });
    const agents = [securityAuditor, testWriter, docWriter, codeReviewer];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('doc-writer');
  });

  it('returns generic when no triggers match', () => {
    const task = makeTask({
      title: 'Add login page with Google OAuth',
      description: 'Create a new login page component with Google OAuth flow',
    });
    const agents = [securityAuditor, testWriter, docWriter, codeReviewer];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('generic');
  });

  it('returns generic when agent pool is empty', () => {
    const task = makeTask({ title: 'Any task' });
    const selected = selectAgent(task, []);
    expect(selected).toBe('generic');
  });

  // ─── Trigger Matching ──────────────────────────────────────────

  it('matches case-insensitively', () => {
    const task = makeTask({
      title: 'SECURITY AUDIT of Payment System',
      description: 'Check for VULNERABILITIES in payment processing',
    });
    const agents = [securityAuditor, testWriter];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('security-auditor');
  });

  it('selects agent with highest trigger score', () => {
    const task = makeTask({
      title: 'Fix XSS vulnerability and CSRF injection',
      description: 'Multiple security issues found in the authentication layer',
    });
    const agents = [securityAuditor, testWriter, docWriter];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('security-auditor');
  });

  it('handles single-trigger match', () => {
    const task = makeTask({
      title: 'Refactor utils module',
      description: 'Clean up utility functions',
    });
    const agents = [securityAuditor, testWriter, docWriter, codeReviewer];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('code-reviewer');
  });

  // ─── Disabled Agents ──────────────────────────────────────────

  it('skips disabled agents', () => {
    const disabledSecurity = { ...securityAuditor, enabled: false };
    const task = makeTask({
      title: 'Fix security vulnerability',
      description: 'Critical security flaw',
    });
    const agents = [disabledSecurity, testWriter, docWriter];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('generic');
  });

  it('falls back to next best when preferred agent is disabled', () => {
    const disabledSecurity = { ...securityAuditor, enabled: false };
    const task = makeTask({
      title: 'Write security test for vulnerability',
      description: 'Test that covers the security vulnerability fix',
    });
    const agents = [disabledSecurity, testWriter, docWriter];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('test-writer');
  });

  // ─── Prompt Injection ─────────────────────────────────────────

  it('builds agent prompt with task context', () => {
    const template = '# Agent: security-auditor\n\n## Role\nSecurity specialist.';
    const task = makeTask({
      title: 'Fix JWT vulnerability',
      description: 'Token validation is broken',
    });
    const prompt = buildAgentPrompt(template, task);
    expect(prompt).toContain('# Agent: security-auditor');
    expect(prompt).toContain('## Current Task');
    expect(prompt).toContain('Fix JWT vulnerability');
    expect(prompt).toContain('Token validation is broken');
  });

  it('preserves original prompt template content', () => {
    const template = '# Agent: test-writer\n\n## Instructions\n- Write tests\n- Check coverage';
    const task = makeTask({ title: 'Write tests', description: 'Auth tests needed' });
    const prompt = buildAgentPrompt(template, task);
    expect(prompt).toContain('## Instructions');
    expect(prompt).toContain('- Write tests');
    expect(prompt).toContain('- Check coverage');
  });

  // ─── Multiple Tasks Selection ─────────────────────────────────

  it('selects correct agents for a batch of tasks', () => {
    const tasks = [
      makeTask({ title: 'Fix JWT authentication vulnerability', description: 'Security flaw in JWT' }),
      makeTask({ title: 'Write unit tests for auth module', description: 'Need test coverage' }),
      makeTask({ title: 'Update README', description: 'Documentation needs update' }),
      makeTask({ title: 'Optimize database queries', description: 'Performance improvement' }),
    ];
    const agents = [securityAuditor, testWriter, docWriter, codeReviewer];
    const selections = tasks.map(t => selectAgent(t, agents));

    expect(selections[0]).toBe('security-auditor');
    expect(selections[1]).toBe('test-writer');
    expect(selections[2]).toBe('doc-writer');
    expect(selections[3]).toBe('generic');
  });

  it('handles task with multiple matching agents - picks highest score', () => {
    const task = makeTask({
      title: 'Security test coverage audit',
      description: 'Write security tests to improve coverage and review code quality',
    });
    const agents = [securityAuditor, testWriter, codeReviewer];
    const selected = selectAgent(task, agents);
    // security has 'security', test has 'test' + 'coverage', code-reviewer has 'review'
    // test-writer has 2 matches: 'test', 'coverage'
    expect(selected).toBe('test-writer');
  });

  // ─── Edge Cases ───────────────────────────────────────────────

  it('handles agent with empty triggers array', () => {
    const noTriggers = makeAgent({ name: 'empty-triggers', triggers: [] });
    const task = makeTask({ title: 'Any task here' });
    const selected = selectAgent(task, [noTriggers]);
    expect(selected).toBe('generic');
  });

  it('handles task with empty title and description', () => {
    const task = makeTask({ title: '', description: '' });
    const agents = [securityAuditor, testWriter];
    const selected = selectAgent(task, agents);
    expect(selected).toBe('generic');
  });

  it('all disabled agents returns generic', () => {
    const agents = [
      { ...securityAuditor, enabled: false },
      { ...testWriter, enabled: false },
      { ...docWriter, enabled: false },
    ];
    const task = makeTask({ title: 'Fix security test documentation' });
    const selected = selectAgent(task, agents);
    expect(selected).toBe('generic');
  });
});
