// Tests for validatePersonaTaskMatch + inferTaskDomains (WP-1 Sprint 196)
import { describe, it, expect } from 'vitest';
import { validatePersonaTaskMatch, inferTaskDomains } from '../../src/orchestra/task-builder.js';
import { getAgentDomain, BUILTIN_AGENT_DOMAINS } from '../../src/core/agent-pool.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import type { Task } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgent(id: string, overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id,
    name: id,
    description: '',
    systemPrompt: '',
    expertise: [],
    allowedTools: [],
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
    ...overrides,
  };
}

function makeTask(filesWrite: string[], directories: string[] = []): Pick<Task, 'scope'> {
  return { scope: { filesWrite, directories, filesRead: [] } };
}

// ─── inferTaskDomains ─────────────────────────────────────────────────────────

describe('inferTaskDomains', () => {
  it('maps src/cli/ path to cli domain', () => {
    const domains = inferTaskDomains(['src/cli/commands.ts'], ['src/cli/']);
    expect(domains).toContain('cli');
  });

  it('maps src/core/ and src/orchestra/ paths to system domain', () => {
    const domains = inferTaskDomains(['src/core/types.ts', 'src/orchestra/planner.ts'], []);
    expect(domains).toContain('system');
    expect(domains.length).toBe(1);
  });

  it('maps tests/ paths to test domain', () => {
    const domains = inferTaskDomains(['tests/orchestra/task-builder.test.ts'], ['tests/orchestra/']);
    expect(domains).toContain('test');
  });

  it('maps docs/ and .md paths to doc domain', () => {
    const domains = inferTaskDomains(['docs/guide.md', 'README.md'], ['docs/']);
    expect(domains).toContain('doc');
  });

  it('returns multiple domains for multi-domain tasks', () => {
    const domains = inferTaskDomains(['src/cli/commands.ts', 'src/api/server.ts'], []);
    expect(domains).toContain('cli');
    expect(domains).toContain('react');
    expect(domains.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for unrecognized paths', () => {
    const domains = inferTaskDomains(['.env', 'unknown/thing.txt'], []);
    expect(domains).toEqual([]);
  });
});

// ─── validatePersonaTaskMatch ─────────────────────────────────────────────────

describe('validatePersonaTaskMatch', () => {
  // (a) CLI task + react specialist → mismatch HIGH, suggest architect
  it('(a) CLI task with react specialist → HIGH mismatch, suggests architect/frontend', () => {
    const reactAgent = makeAgent('temp-react-ts-specialist', { domain: 'react' });
    const task = makeTask(['src/cli/commands.ts'], ['src/cli/']);
    const result = validatePersonaTaskMatch(reactAgent, task);
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('HIGH');
    expect(result.mismatch).toBeDefined();
    expect(result.mismatch!.length).toBeGreaterThan(0);
    // suggested agent should be for cli/system domain
    expect(result.suggestedAgent).toBeTruthy();
  });

  // (b) System task + architect → match, no warning
  it('(b) System task with architect → valid match, no mismatch', () => {
    const architectAgent = makeAgent('architect');
    const task = makeTask(['src/orchestra/planner.ts', 'src/core/types.ts'], ['src/orchestra/']);
    const result = validatePersonaTaskMatch(architectAgent, task);
    expect(result.valid).toBe(true);
    expect(result.mismatch).toBeUndefined();
    expect(result.severity).toBeUndefined();
  });

  // (c) Test task + ci-guardian (test domain) → match
  it('(c) Test task with ci-guardian → valid match', () => {
    const ciAgent = makeAgent('ci-guardian');
    const task = makeTask(['tests/orchestra/planner.test.ts'], ['tests/orchestra/']);
    const result = validatePersonaTaskMatch(ciAgent, task);
    expect(result.valid).toBe(true);
    expect(result.mismatch).toBeUndefined();
  });

  // (d) Doc task + doc-writer → match
  it('(d) Doc task with doc-writer → valid match', () => {
    const docAgent = makeAgent('doc-writer');
    const task = makeTask(['docs/guide.md', 'README.md'], ['docs/']);
    const result = validatePersonaTaskMatch(docAgent, task);
    expect(result.valid).toBe(true);
    expect(result.mismatch).toBeUndefined();
  });

  // (e) Multi-domain task (src/cli + src/api) → ambiguous, no override
  it('(e) Multi-domain task → ambiguous, always valid regardless of agent', () => {
    const reactAgent = makeAgent('temp-react-ts-specialist', { domain: 'react' });
    const task = makeTask(['src/cli/cmd.ts', 'src/api/server.ts'], []);
    const result = validatePersonaTaskMatch(reactAgent, task);
    expect(result.valid).toBe(true);
    expect(result.severity).toBeUndefined();
  });

  // (f) Generic agent (no domain field) → no mismatch (legacy)
  it('(f) Generic agent (undefined domain) → always valid, legacy behavior', () => {
    const genericAgent = makeAgent('some-custom-agent', { domain: undefined });
    const task = makeTask(['src/cli/commands.ts'], ['src/cli/']);
    const result = validatePersonaTaskMatch(genericAgent, task);
    expect(result.valid).toBe(true);
    expect(result.mismatch).toBeUndefined();
  });

  // bonus: LOW severity case
  it('system agent on test task → LOW severity (plausible overlap)', () => {
    const architectAgent = makeAgent('architect');
    const task = makeTask(['tests/core/types.test.ts'], ['tests/core/']);
    const result = validatePersonaTaskMatch(architectAgent, task);
    // system + test = LOW mismatch (architect can reasonably work on test files)
    if (!result.valid) {
      expect(result.severity).toBe('LOW');
    }
  });
});

// ─── getAgentDomain + BUILTIN_AGENT_DOMAINS ──────────────────────────────────

describe('getAgentDomain', () => {
  it('returns domain from agent.domain field if set', () => {
    const agent = makeAgent('unknown-agent', { domain: 'cli' });
    expect(getAgentDomain(agent)).toBe('cli');
  });

  it('falls back to BUILTIN_AGENT_DOMAINS for known agents', () => {
    const agent = makeAgent('doc-writer');
    expect(getAgentDomain(agent)).toBe('doc');
  });

  it('returns generic for unknown agents without domain field', () => {
    const agent = makeAgent('totally-unknown-agent');
    expect(getAgentDomain(agent)).toBe('generic');
  });

  it('BUILTIN_AGENT_DOMAINS covers all 15 built-in agents', () => {
    const builtins = [
      'architect', 'architecture-planner', 'bug-fixer', 'code-reviewer',
      'refactorer', 'api-builder', 'frontend-designer', 'accessibility-auditor',
      'doc-writer', 'ci-guardian', 'security-auditor', 'performance-analyzer',
      'data-engineer', 'devops-engineer', 'migration-specialist',
    ];
    for (const id of builtins) {
      expect(BUILTIN_AGENT_DOMAINS[id]).toBeDefined();
    }
    expect(Object.keys(BUILTIN_AGENT_DOMAINS).length).toBe(15);
  });
});
