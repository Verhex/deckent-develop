import { describe, it, expect } from 'vitest';
import { executeAgentStep } from '../../../src/orchestra/decision-steps/agent-step.js';
import type { AgentPool } from '../../../src/core/agent-types.js';
import { createAgentDefinition } from '../../../src/core/agent-types.js';
import type { TaskAnalysis, TaskType } from '../../../src/core/decision-types.js';
import { createDefaultAnalysis } from '../../../src/core/decision-types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<TaskAnalysis> = {}): TaskAnalysis {
  return { ...createDefaultAnalysis(), ...overrides };
}

function makeTask(title: string, description: string, dirs: string[] = [], filesWrite: string[] = []) {
  return { title, description, scope: { directories: dirs, filesWrite } };
}

function makeSecurityAgent() {
  return createAgentDefinition({
    id: 'security-auditor',
    name: 'Security Auditor',
    triggerKeywords: ['security', 'auth', 'jwt', 'csrf', 'xss', 'encrypt', 'oauth', 'credential'],
    triggerScopes: ['src/security/'],
  });
}

function makeTestAgent() {
  return createAgentDefinition({
    id: 'test-writer',
    name: 'Test Writer',
    triggerKeywords: ['test', 'spec', 'coverage', 'vitest', 'jest', 'testing'],
    triggerScopes: ['tests/'],
  });
}

function makeDocAgent() {
  return createAgentDefinition({
    id: 'doc-writer',
    name: 'Doc Writer',
    triggerKeywords: ['doc', 'readme', 'changelog', 'guide', 'documentation'],
    triggerScopes: ['docs/'],
  });
}

function makeRefactorAgent() {
  return createAgentDefinition({
    id: 'refactor-specialist',
    name: 'Refactor Specialist',
    triggerKeywords: ['refactor', 'rename', 'extract', 'split', 'cleanup'],
    triggerScopes: ['src/'],
  });
}

// ─── executeAgentStep — empty pool ─────────────────────────────────────────

describe('executeAgentStep — empty pool', () => {
  it('returns null agent when pool is empty', () => {
    const pool: AgentPool = new Map();
    const result = executeAgentStep(
      makeAnalysis({ type: 'security' }),
      pool,
      makeTask('Fix auth', 'JWT validation', ['src/security/']),
    );
    expect(result.agent).toBeNull();
  });

  it('returns score 0 when pool is empty', () => {
    const pool: AgentPool = new Map();
    const result = executeAgentStep(
      makeAnalysis(),
      pool,
      makeTask('Task', 'Description'),
    );
    expect(result.score).toBe(0);
  });
});

// ─── executeAgentStep — security type boost ────────────────────────────────

describe('executeAgentStep — security type boost', () => {
  it('selects security agent for security type tasks', () => {
    const pool: AgentPool = new Map();
    pool.set('security-auditor', makeSecurityAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'security' }),
      pool,
      makeTask('Fix vulnerability', 'Patch the issue', ['src/security/']),
    );
    expect(result.agent?.id).toBe('security-auditor');
  });

  it('boosts security agent even without security keywords in task text', () => {
    const pool: AgentPool = new Map();
    pool.set('security-auditor', makeSecurityAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'security' }),
      pool,
      makeTask('Fix vulnerability', 'Patch issue', ['src/security/']),
    );
    expect(result.agent).not.toBeNull();
  });

  it('includes type-boost reason in output', () => {
    const pool: AgentPool = new Map();
    pool.set('security-auditor', makeSecurityAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'security' }),
      pool,
      makeTask('Fix issue', 'Patch', ['src/security/']),
    );
    if (result.agent) {
      expect(result.reason).toContain('security');
    }
  });
});

// ─── executeAgentStep — test type boost ────────────────────────────────────

describe('executeAgentStep — test type boost', () => {
  it('selects test agent for test type tasks', () => {
    const pool: AgentPool = new Map();
    pool.set('test-writer', makeTestAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'test' }),
      pool,
      makeTask('Write unit suite', 'Add more cases', ['tests/']),
    );
    expect(result.agent?.id).toBe('test-writer');
  });

  it('prefers test agent over generic for test tasks', () => {
    const pool: AgentPool = new Map();
    pool.set('test-writer', makeTestAgent());
    pool.set('generic', createAgentDefinition({
      id: 'generic',
      name: 'Generic',
      triggerKeywords: ['write', 'suite'],
      triggerScopes: ['tests/'],
    }));
    const result = executeAgentStep(
      makeAnalysis({ type: 'test' }),
      pool,
      makeTask('Write suite', 'Add cases', ['tests/']),
    );
    expect(result.agent?.id).toBe('test-writer');
  });
});

// ─── executeAgentStep — doc type boost ─────────────────────────────────────

describe('executeAgentStep — doc type boost', () => {
  it('selects doc agent for doc type tasks', () => {
    const pool: AgentPool = new Map();
    pool.set('doc-writer', makeDocAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'doc' }),
      pool,
      makeTask('Write setup instructions', 'Create tutorial', ['docs/']),
    );
    expect(result.agent?.id).toBe('doc-writer');
  });
});

// ─── executeAgentStep — code type (no boost) ──────────────────────────────

describe('executeAgentStep — code type (no boost)', () => {
  it('runs plain selection for code type', () => {
    const pool: AgentPool = new Map();
    pool.set('test-writer', makeTestAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'code' }),
      pool,
      makeTask('Build dashboard', 'User interface', ['src/ui/']),
    );
    // Test writer should not match a generic UI task
    expect(result.agent).toBeNull();
  });

  it('returns no boost reason for code type', () => {
    const pool: AgentPool = new Map();
    const result = executeAgentStep(
      makeAnalysis({ type: 'code' }),
      pool,
      makeTask('Build feature', 'Implement logic'),
    );
    expect(result.reason).not.toContain('Type-boosted');
  });
});

// ─── executeAgentStep — refactor type boost ────────────────────────────────

describe('executeAgentStep — refactor type boost', () => {
  it('selects refactor agent for refactor type', () => {
    const pool: AgentPool = new Map();
    pool.set('refactor-specialist', makeRefactorAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'refactor' }),
      pool,
      makeTask('Reorganize modules', 'Better structure', ['src/']),
    );
    expect(result.agent?.id).toBe('refactor-specialist');
  });
});

// ─── executeAgentStep — disabled agents ────────────────────────────────────

describe('executeAgentStep — disabled agents', () => {
  it('skips disabled agents', () => {
    const pool: AgentPool = new Map();
    pool.set('security-auditor', createAgentDefinition({
      ...makeSecurityAgent(),
      enabled: false,
    }));
    const result = executeAgentStep(
      makeAnalysis({ type: 'security' }),
      pool,
      makeTask('Fix auth', 'JWT issue', ['src/security/']),
    );
    expect(result.agent).toBeNull();
  });
});

// ─── executeAgentStep — fallback to plain ──────────────────────────────────

describe('executeAgentStep — fallback to plain', () => {
  it('falls back to plain result when boost does not improve', () => {
    const pool: AgentPool = new Map();
    pool.set('test-writer', makeTestAgent());
    // Task with test keywords in text already, so plain and boosted both match
    const result = executeAgentStep(
      makeAnalysis({ type: 'test' }),
      pool,
      makeTask('Write test coverage', 'Add spec for parser', ['tests/']),
    );
    expect(result.agent?.id).toBe('test-writer');
  });
});

// ─── executeAgentStep — devops type boost ──────────────────────────────────

describe('executeAgentStep — devops type boost', () => {
  it('selects devops agent for devops type', () => {
    const pool: AgentPool = new Map();
    pool.set('devops-agent', createAgentDefinition({
      id: 'devops-agent',
      name: 'DevOps Agent',
      triggerKeywords: ['docker', 'ci', 'deploy', 'pipeline', 'workflow', 'release'],
      triggerScopes: ['infra/'],
    }));
    const result = executeAgentStep(
      makeAnalysis({ type: 'devops' }),
      pool,
      makeTask('Setup build', 'Automate process', ['infra/']),
    );
    expect(result.agent?.id).toBe('devops-agent');
  });
});

// ─── executeAgentStep — config type boost ──────────────────────────────────

describe('executeAgentStep — config type boost', () => {
  it('selects config agent for config type', () => {
    const pool: AgentPool = new Map();
    pool.set('config-agent', createAgentDefinition({
      id: 'config-agent',
      name: 'Config Agent',
      triggerKeywords: ['config', 'settings', 'env', 'environment'],
      triggerScopes: ['config/'],
    }));
    const result = executeAgentStep(
      makeAnalysis({ type: 'config' }),
      pool,
      makeTask('Update defaults', 'Change option', ['config/']),
    );
    expect(result.agent?.id).toBe('config-agent');
  });
});

// ─── executeAgentStep — multiple agents ────────────────────────────────────

describe('executeAgentStep — multiple agents in pool', () => {
  it('selects best matching agent from multiple', () => {
    const pool: AgentPool = new Map();
    pool.set('test-writer', makeTestAgent());
    pool.set('security-auditor', makeSecurityAgent());
    pool.set('doc-writer', makeDocAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'security' }),
      pool,
      makeTask('Fix vulnerability', 'Patch issue', ['src/security/']),
    );
    expect(result.agent?.id).toBe('security-auditor');
  });

  it('returns score > 0 for matched agent', () => {
    const pool: AgentPool = new Map();
    pool.set('test-writer', makeTestAgent());
    const result = executeAgentStep(
      makeAnalysis({ type: 'test' }),
      pool,
      makeTask('Add spec', 'Coverage for module', ['tests/']),
    );
    expect(result.score).toBeGreaterThan(0);
  });
});
