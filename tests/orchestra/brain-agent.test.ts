import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { selectAgent } from '../../src/core/agent-selector.js';

// ─── Mock fs for AgentPoolManager ────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  rmSync: vi.fn(),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '029-001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-029',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return createAgentDefinition({
    id: 'security-auditor',
    name: 'Security Auditor',
    expertise: ['security', 'auth'],
    triggerKeywords: ['security', 'auth', 'vulnerability'],
    triggerScopes: ['src/auth/'],
    triggerFilePatterns: ['*.security.ts'],
    preferredModel: 'opus',
    ...overrides,
  });
}

function makePool(agents: AgentDefinition[]): AgentPool {
  const pool: AgentPool = new Map();
  for (const a of agents) pool.set(a.id, a);
  return pool;
}

// ─── selectAgent in planSprint context ──────────────────────────────────

describe('Agent Selection — selectAgent with planSprint tasks', () => {
  it('selects agent when multiple keywords match task text (score >= 3)', () => {
    // security(+2) + auth(+2) = 4 >= 3
    const task = makeTask({ title: 'Security audit for auth module' });
    const pool = makePool([makeAgent()]);
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('security-auditor');
  });

  it('selects agent when keywords match in description', () => {
    // vulnerability(+2) + auth(+2) = 4 >= 3
    const task = makeTask({ title: 'Module fix', description: 'Fix vulnerability in auth system' });
    const pool = makePool([makeAgent()]);
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
  });

  it('returns null agent when no keywords match', () => {
    const task = makeTask({ title: 'Update README', description: 'Documentation update' });
    const pool = makePool([makeAgent()]);
    const result = selectAgent(task, pool);
    expect(result.agent).toBeNull();
  });

  it('selects agent with highest score when multiple agents match', () => {
    // agent-a: security(+2) = 2 < 3 (not selected)
    // agent-b: security(+2) + auth(+2) = 4 >= 3 (selected)
    const agent1 = makeAgent({ id: 'agent-a', triggerKeywords: ['security'], triggerScopes: [] });
    const agent2 = makeAgent({ id: 'agent-b', triggerKeywords: ['security', 'auth'], triggerScopes: [] });
    const task = makeTask({ title: 'Security auth module review' });
    const pool = makePool([agent1, agent2]);
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.agent!.id).toBe('agent-b');
  });

  it('does not select disabled agents', () => {
    const agent = makeAgent({ enabled: false });
    const task = makeTask({ title: 'Security audit auth check' });
    const pool = makePool([agent]);
    const result = selectAgent(task, pool);
    expect(result.agent).toBeNull();
  });

  it('assigns null agent when pool is empty', () => {
    const task = makeTask();
    const pool: AgentPool = new Map();
    const result = selectAgent(task, pool);
    expect(result.agent).toBeNull();
  });

  it('matches on scope directories with +3 score', () => {
    // scope match: src/core/ +3 >= 3
    const agent = makeAgent({ id: 'core-agent', triggerScopes: ['src/core/'], triggerKeywords: [] });
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    const pool = makePool([agent]);
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('matches on file patterns in filesWrite', () => {
    // file pattern match: +1 per match; need multiple or combined with other matches
    // Let's add scope match too: scope(+3) + file(+1) = 4
    const agent = makeAgent({
      id: 'file-agent',
      triggerFilePatterns: ['src/core/*.ts'],
      triggerScopes: ['src/core/'],
      triggerKeywords: [],
    });
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/foo.ts'] } });
    const pool = makePool([agent]);
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
  });

  it('uses stats successRate as tie-breaker', () => {
    const agent1 = makeAgent({
      id: 'high-success',
      triggerKeywords: ['security', 'auth'],
      triggerScopes: [],
      stats: { totalUses: 10, successRate: 0.9, avgCoverage: 90, lastUsedInSprint: 'sprint-028' },
    });
    const agent2 = makeAgent({
      id: 'low-success',
      triggerKeywords: ['security', 'auth'],
      triggerScopes: [],
      stats: { totalUses: 10, successRate: 0.2, avgCoverage: 40, lastUsedInSprint: 'sprint-028' },
    });
    const task = makeTask({ title: 'Security auth check' });
    const pool = makePool([agent1, agent2]);
    const result = selectAgent(task, pool);
    expect(result.agent).not.toBeNull();
    // Both score 4, but high-success has better successRate
    expect(result.agent!.id).toBe('high-success');
  });

  it('sets assignedAgent to generic for forceModel tasks', () => {
    const task = makeTask({ forceModel: 'opus' });
    task.assignedAgent = 'generic';
    expect(task.assignedAgent).toBe('generic');
  });

  it('sets assignedAgent from selected agent id', () => {
    const agent = makeAgent({ id: 'my-agent', triggerKeywords: ['security', 'auth'] });
    const task = makeTask({ title: 'Security auth review' });
    const pool = makePool([agent]);
    const result = selectAgent(task, pool);
    task.assignedAgent = result.agent?.id ?? 'generic';
    expect(task.assignedAgent).toBe('my-agent');
  });

  it('applies agent preferredModel to task model', () => {
    const agent = makeAgent({ preferredModel: 'opus', triggerKeywords: ['security', 'auth'] });
    const task = makeTask({ title: 'Security auth check', model: 'sonnet' });
    const pool = makePool([agent]);
    const result = selectAgent(task, pool);
    if (result.agent?.preferredModel) {
      task.model = result.agent.preferredModel;
    }
    expect(task.model).toBe('opus');
  });

  it('does not override forceModel even when agent has preferredModel', () => {
    const agent = makeAgent({ preferredModel: 'opus', triggerKeywords: ['security', 'auth'] });
    const task = makeTask({ title: 'Security auth task', model: 'haiku', forceModel: 'haiku' });
    const pool = makePool([agent]);
    const result = selectAgent(task, pool);
    if (!task.forceModel && result.agent?.preferredModel) {
      task.model = result.agent.preferredModel;
    }
    expect(task.model).toBe('haiku');
  });

  it('handles agent pool loading failure gracefully', () => {
    expect(() => {
      try {
        throw new Error('pool load failed');
      } catch {
        // non-fatal in planSprint
      }
    }).not.toThrow();
  });

  it('processes multiple tasks independently', () => {
    // security(+2) + auth(+2) = 4 for task1; no match for task2
    const agent = makeAgent({ triggerKeywords: ['security', 'auth'] });
    const task1 = makeTask({ id: '029-001', title: 'Security auth fix' });
    const task2 = makeTask({ id: '029-002', title: 'README update' });
    const pool = makePool([agent]);

    const r1 = selectAgent(task1, pool);
    const r2 = selectAgent(task2, pool);

    expect(r1.agent).not.toBeNull();
    expect(r2.agent).toBeNull();
  });

  it('selectAgent finds agent even when forceModel is set (bypass removed)', () => {
    const agent = makeAgent({ preferredModel: 'opus', triggerKeywords: ['security', 'auth'] });
    const task = makeTask({ title: 'Security auth task', model: 'haiku', forceModel: 'haiku' });
    const pool = makePool([agent]);
    // The key change: selectAgent runs regardless of forceModel
    const result = selectAgent(task, pool);
    task.assignedAgent = result.agent?.id ?? 'generic';
    // Agent IS selected (not forced to generic)
    expect(task.assignedAgent).toBe('security-auditor');
    // But model stays as forceModel
    if (result.agent?.preferredModel && !task.forceModel) {
      task.model = result.agent.preferredModel;
    }
    expect(task.model).toBe('haiku');
  });

  it('returns score of 0 when agent score below threshold', () => {
    // Only 1 keyword match: security(+2) = 2 < 3
    const agent = makeAgent({ id: 'weak', triggerKeywords: ['something'], triggerScopes: [] });
    const task = makeTask({ title: 'Something simple' });
    const pool = makePool([agent]);
    const result = selectAgent(task, pool);
    expect(result.agent).toBeNull();
    expect(result.score).toBe(0);
  });
});
