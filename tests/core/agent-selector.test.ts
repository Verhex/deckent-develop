import { describe, it, expect } from 'vitest';
import { extractKeywords, selectAgent, suggestNewAgent } from '../../src/core/agent-selector.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { AgentPool } from '../../src/core/agent-types.js';

// ─── extractKeywords ─────────────────────────────────────────────────────────

describe('extractKeywords', () => {
  it('splits on spaces and lowercases', () => {
    const result = extractKeywords('Add Login Page');
    expect(result).toContain('add');
    expect(result).toContain('login');
    expect(result).toContain('page');
  });

  it('splits on punctuation', () => {
    const result = extractKeywords('test-driven.development:for_typescript');
    expect(result).toContain('test');
    expect(result).toContain('driven');
    expect(result).toContain('development');
    expect(result).toContain('typescript');
  });

  it('filters stopwords', () => {
    const result = extractKeywords('the quick brown fox is a test');
    expect(result).not.toContain('the');
    expect(result).not.toContain('is');
    expect(result).not.toContain('a');
    expect(result).toContain('quick');
    expect(result).toContain('brown');
    expect(result).toContain('fox');
    expect(result).toContain('test');
  });

  it('filters tokens shorter than 2 characters', () => {
    const result = extractKeywords('a b cd ef');
    expect(result).not.toContain('a');
    expect(result).not.toContain('b');
    expect(result).toContain('cd');
    expect(result).toContain('ef');
  });

  it('deduplicates keywords', () => {
    const result = extractKeywords('test test test coverage coverage');
    expect(result.filter((k) => k === 'test')).toHaveLength(1);
    expect(result.filter((k) => k === 'coverage')).toHaveLength(1);
  });

  it('returns empty array for empty string', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('returns empty array for non-string input', () => {
    expect(extractKeywords(null as any)).toEqual([]);
    expect(extractKeywords(undefined as any)).toEqual([]);
  });

  it('handles special characters in input', () => {
    const result = extractKeywords('fix @bug #123 $money %percent');
    expect(result).toContain('fix');
    expect(result).toContain('bug');
    expect(result).toContain('123');
    expect(result).toContain('money');
    expect(result).toContain('percent');
  });

  it('preserves order (first occurrence)', () => {
    const result = extractKeywords('coverage test coverage deploy');
    expect(result[0]).toBe('coverage');
    expect(result[1]).toBe('test');
    expect(result[2]).toBe('deploy');
  });
});

// ─── selectAgent ─────────────────────────────────────────────────────────────

describe('selectAgent', () => {
  function makePool(...agents: Parameters<typeof createAgentDefinition>[0][]): AgentPool {
    const pool: AgentPool = new Map();
    for (const def of agents) {
      const agent = createAgentDefinition(def);
      pool.set(agent.id, agent);
    }
    return pool;
  }

  const task = {
    title: 'Add unit tests for authentication module',
    description: 'Write comprehensive tests for auth service using vitest',
    scope: {
      directories: ['src/auth/'],
      filesWrite: ['src/auth/auth.test.ts'],
    },
  };

  it('returns null agent when pool is empty', () => {
    const pool: AgentPool = new Map();
    const result = selectAgent(task, pool);
    expect(result.agent).toBeNull();
    expect(result.score).toBe(0);
  });

  it('returns null agent when no agent scores above threshold', () => {
    const pool = makePool({
      id: 'unrelated',
      name: 'Unrelated',
      triggerKeywords: ['deployment', 'docker'],
      triggerScopes: ['infra/'],
    });
    const result = selectAgent(task, pool);
    expect(result.agent).toBeNull();
    expect(result.score).toBe(0);
  });

  it('selects agent matching triggerKeywords (+2 per match)', () => {
    const pool = makePool({
      id: 'tester',
      name: 'Tester',
      triggerKeywords: ['tests', 'unit'],
      triggerScopes: [],
    });
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('tester');
    expect(result.score).toBe(4); // 2 keywords * 2 = 4
  });

  it('selects agent matching triggerScopes (+3 per match)', () => {
    const pool = makePool({
      id: 'auth-expert',
      name: 'Auth Expert',
      triggerKeywords: [],
      triggerScopes: ['src/auth/'],
    });
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('auth-expert');
    expect(result.score).toBe(3); // 1 scope match * 3 = 3
  });

  it('selects agent matching triggerFilePatterns (+1 per match)', () => {
    const pool = makePool({
      id: 'test-writer',
      name: 'Test Writer',
      triggerKeywords: ['tests'],
      triggerFilePatterns: ['**/*.test.ts'],
      triggerScopes: [],
    });
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('test-writer');
    // 1 keyword (tests) * 2 = 2, + 1 file pattern = 1 => 3
    expect(result.score).toBe(3);
  });

  it('combines scores from all match types', () => {
    const pool = makePool({
      id: 'full-match',
      name: 'Full Match',
      triggerKeywords: ['tests', 'authentication'],
      triggerScopes: ['src/auth/'],
      triggerFilePatterns: ['**/*.test.ts'],
    });
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    // keywords: tests + authentication = 4, scope: 3, file: 1 = 8
    expect(result.score).toBe(8);
  });

  it('skips disabled agents', () => {
    const pool = makePool({
      id: 'disabled-agent',
      name: 'Disabled',
      enabled: false,
      triggerKeywords: ['tests', 'authentication'],
      triggerScopes: ['src/auth/'],
    });
    const result = selectAgent(task, pool);
    expect(result.agent).toBeNull();
  });

  it('picks highest scoring agent when multiple match', () => {
    const pool = makePool(
      {
        id: 'low-scorer',
        name: 'Low Scorer',
        triggerKeywords: ['tests'],
        triggerScopes: [],
        triggerFilePatterns: ['*.test.ts'],
      },
      {
        id: 'high-scorer',
        name: 'High Scorer',
        triggerKeywords: ['tests', 'authentication'],
        triggerScopes: ['src/auth/'],
      },
    );
    const result = selectAgent(task, pool);
    expect(result.agent!.id).toBe('high-scorer');
  });

  it('tie-breaks by successRate (higher wins)', () => {
    const pool = makePool(
      {
        id: 'agent-a',
        name: 'Agent A',
        triggerKeywords: ['tests', 'authentication'],
        triggerScopes: [],
        triggerFilePatterns: [],
        stats: { totalUses: 10, successRate: 0.5, avgCoverage: 80, lastUsedInSprint: 's1' },
      },
      {
        id: 'agent-b',
        name: 'Agent B',
        triggerKeywords: ['tests', 'authentication'],
        triggerScopes: [],
        triggerFilePatterns: [],
        stats: { totalUses: 10, successRate: 0.9, avgCoverage: 90, lastUsedInSprint: 's2' },
      },
    );
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('agent-b');
  });

  it('returns reason string describing the match', () => {
    const pool = makePool({
      id: 'matcher',
      name: 'Matcher',
      triggerKeywords: ['tests'],
      triggerScopes: ['src/auth/'],
    });
    const result = selectAgent(task, pool);
    expect(result.reason).toContain('Matched');
    expect(result.reason).toContain('keyword');
  });

  it('does not select agent scoring below threshold (score < 3)', () => {
    const pool = makePool({
      id: 'weak',
      name: 'Weak',
      triggerKeywords: ['authentication'],
      triggerScopes: [],
    });
    const result = selectAgent(task, pool);
    // 'authentication' matches = 2, which is below threshold of 3
    expect(result.agent).toBeNull();
    expect(result.score).toBe(0);
  });

  it('matches scope when task dir starts with agent scope', () => {
    const pool = makePool({
      id: 'broad',
      name: 'Broad',
      triggerScopes: ['src/'],
      triggerKeywords: [],
    });
    const broadTask = {
      title: 'Refactor code',
      description: 'Refactor',
      scope: { directories: ['src/core/'], filesWrite: [] },
    };
    const result = selectAgent(broadTask, pool);
    expect(result.agent).not.toBeNull();
    expect(result.score).toBe(3);
  });

  it('matches scope when agent scope starts with task dir', () => {
    const pool = makePool({
      id: 'narrow',
      name: 'Narrow',
      triggerScopes: ['src/core/utils/'],
      triggerKeywords: [],
    });
    const narrowTask = {
      title: 'Refactor utilities',
      description: 'Refactor',
      scope: { directories: ['src/core/'], filesWrite: [] },
    };
    const result = selectAgent(narrowTask, pool);
    expect(result.agent).not.toBeNull();
    expect(result.score).toBe(3);
  });
});

// ─── suggestNewAgent ─────────────────────────────────────────────────────────

describe('suggestNewAgent', () => {
  it('returns null when fewer than 3 tasks', () => {
    const pool: AgentPool = new Map();
    const result = suggestNewAgent(
      [
        { title: 'Fix bug', description: 'Fix it' },
        { title: 'Fix other', description: 'Fix other' },
      ],
      pool,
    );
    expect(result).toBeNull();
  });

  it('returns null when no shared keywords across 3+ tasks', () => {
    const pool: AgentPool = new Map();
    const result = suggestNewAgent(
      [
        { title: 'Alpha functionality', description: 'Build alpha' },
        { title: 'Beta integration', description: 'Build beta' },
        { title: 'Gamma deployment', description: 'Deploy gamma' },
      ],
      pool,
    );
    expect(result).toBeNull();
  });

  it('suggests agent when 3+ tasks share uncovered keywords', () => {
    const pool: AgentPool = new Map();
    const result = suggestNewAgent(
      [
        { title: 'Add database migration for users', description: 'Migration for users table' },
        { title: 'Add database migration for posts', description: 'Migration for posts table' },
        { title: 'Add database migration for comments', description: 'Migration for comments table' },
      ],
      pool,
    );
    expect(result).not.toBeNull();
    expect(result!.keywords).toContain('database');
    expect(result!.keywords).toContain('migration');
    expect(result!.model).toBe('sonnet');
  });

  it('does not suggest if existing agent covers the keywords', () => {
    const pool: AgentPool = new Map();
    const dbAgent = createAgentDefinition({
      id: 'db-agent',
      name: 'DB Agent',
      triggerKeywords: ['database', 'migration', 'add', 'users', 'posts', 'comments', 'table'],
    });
    pool.set(dbAgent.id, dbAgent);

    const result = suggestNewAgent(
      [
        { title: 'database migration users table', description: 'Migration table' },
        { title: 'database migration posts table', description: 'Migration table' },
        { title: 'database migration comments table', description: 'Migration table' },
      ],
      pool,
    );
    expect(result).toBeNull();
  });

  it('generates a name from the top keyword', () => {
    const pool: AgentPool = new Map();
    const result = suggestNewAgent(
      [
        { title: 'Write integration test for API', description: 'Test endpoints' },
        { title: 'Write integration test for auth', description: 'Test auth flow' },
        { title: 'Write integration test for payments', description: 'Test payment flow' },
      ],
      pool,
    );
    expect(result).not.toBeNull();
    expect(result!.name).toContain('-specialist');
  });

  it('limits keywords to top 5', () => {
    const pool: AgentPool = new Map();
    // Create tasks with many shared keywords
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      title: `Build feature alpha beta gamma delta epsilon zeta ${i}`,
      description: `Implement alpha beta gamma delta epsilon zeta feature${i}`,
    }));
    const result = suggestNewAgent(tasks, pool);
    if (result) {
      expect(result.keywords.length).toBeLessThanOrEqual(5);
    }
  });

  it('returns model as sonnet by default', () => {
    const pool: AgentPool = new Map();
    const result = suggestNewAgent(
      [
        { title: 'Refactor auth service logic', description: 'Clean auth code' },
        { title: 'Refactor auth middleware logic', description: 'Clean auth middleware' },
        { title: 'Refactor auth controller logic', description: 'Clean auth controller' },
      ],
      pool,
    );
    if (result) {
      expect(result.model).toBe('sonnet');
    }
  });
});
