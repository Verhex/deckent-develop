import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { writeSprintLog } from '../../src/orchestra/sprint-reporter.js';
import { TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, SprintMetrics, AgentDefinition } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `agent-stats-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test Task',
    description: 'A test task',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test reason',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-061',
    number: 61,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks: [makeTask()],
    workers: ['w-001'],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 10000,
    coveragePercent: 90,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

function makeAgentDefinition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    description: 'An agent for testing',
    systemPrompt: '',
    expertise: ['testing'],
    preferredModel: 'claude-sonnet-5',
    effortMultiplier: 1.0,
    persistent: true,
    enabled: true,
    source: 'builtin',
    triggerKeywords: ['test'],
    triggerScopes: ['tests/'],
    triggerFilePatterns: ['*.test.ts'],
    allowedTools: [],
    deniedTools: [],
    stats: {
      totalUses: 0,
      successRate: 0,
      avgCoverage: 0,
      lastUsedInSprint: '',
    },
    ...overrides,
  };
}

// ─── A) Guard Change: generic agents now get stats tracked ──────────

describe('Agent stats guard fix — generic agents tracked', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    const agentsDir = join(tmpDir, '.deckent', 'agents', 'generic');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'agent.json'),
      JSON.stringify(makeAgentDefinition({ id: 'generic', name: 'Generic Agent' })),
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updateAgentStats updates generic agent totalUses', () => {
    const pool = new AgentPoolManager(tmpDir);
    pool.updateAgentStats('generic', 'DONE', 95, 'sprint-061');

    const agent = pool.getAgent('generic');
    expect(agent).toBeDefined();
    expect(agent!.preferredModel).toBe('claude-sonnet-5');
    expect(agent!.stats!.totalUses).toBe(1);
  });

  it('updateAgentStats records lastUsedInSprint for generic', () => {
    const pool = new AgentPoolManager(tmpDir);
    pool.updateAgentStats('generic', 'DONE', 80, 'sprint-061');

    const agent = pool.getAgent('generic');
    expect(agent!.stats!.lastUsedInSprint).toBe('sprint-061');
  });

  it('updateAgentStats calculates successRate for generic agent', () => {
    const pool = new AgentPoolManager(tmpDir);
    pool.updateAgentStats('generic', 'DONE', 90, 'sprint-061');
    pool.updateAgentStats('generic', 'NO_GO', 0, 'sprint-061');

    const agent = pool.getAgent('generic');
    expect(agent!.stats!.totalUses).toBe(2);
    expect(agent!.stats!.successRate).toBeCloseTo(0.5, 5);
  });
});

// ─── B) Stats Write Verification ────────────────────────────────────

describe('Agent stats write verification', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    const agentsDir = join(tmpDir, '.deckent', 'agents', 'security-auditor');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'agent.json'),
      JSON.stringify(makeAgentDefinition({ id: 'security-auditor', name: 'Security Auditor' })),
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('agent.json is updated on disk after updateAgentStats', () => {
    const pool = new AgentPoolManager(tmpDir);
    pool.updateAgentStats('security-auditor', 'DONE', 95, 'sprint-061');

    const rawJson = JSON.parse(readFileSync(
      join(tmpDir, '.deckent', 'agents', 'security-auditor', 'agent.json'), 'utf-8',
    ));
    expect(rawJson.stats.totalUses).toBe(1);
    expect(rawJson.stats.successRate).toBe(1);
    expect(rawJson.stats.avgCoverage).toBe(95);
    expect(rawJson.stats.lastUsedInSprint).toBe('sprint-061');
  });

  it('stats accumulate over multiple updates', () => {
    const pool = new AgentPoolManager(tmpDir);
    pool.updateAgentStats('security-auditor', 'DONE', 90, 'sprint-060');
    pool.updateAgentStats('security-auditor', 'GO_WITH_TECH_DEBT', 80, 'sprint-061');

    const agent = pool.getAgent('security-auditor');
    expect(agent!.stats!.totalUses).toBe(2);
    expect(agent!.stats!.successRate).toBe(1); // both DONE and GO_WITH_TECH_DEBT count as success
    expect(agent!.stats!.avgCoverage).toBe(85); // (90+80)/2
    expect(agent!.stats!.lastUsedInSprint).toBe('sprint-061');
  });

  it('NO_GO decreases success rate', () => {
    const pool = new AgentPoolManager(tmpDir);
    pool.updateAgentStats('security-auditor', 'DONE', 90, 'sprint-060');
    pool.updateAgentStats('security-auditor', 'NO_GO', 0, 'sprint-061');

    const agent = pool.getAgent('security-auditor');
    expect(agent!.stats!.totalUses).toBe(2);
    expect(agent!.stats!.successRate).toBeCloseTo(0.5, 5);
  });

  it('does not throw for non-existent agent', () => {
    const pool = new AgentPoolManager(tmpDir);
    expect(() => pool.updateAgentStats('non-existent', 'DONE', 90, 'sprint-061')).not.toThrow();
  });
});

// ─── C) writeSprintLog agent table format ───────────────────────────

describe('writeSprintLog — agent column in task table', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sprint log tasks section uses table format with Agent column', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001', title: 'Fix bug', assignedAgent: 'bug-fixer' })],
    });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    writeSprintLog(tmpDir, sprint, makeMetrics(), evals);

    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-061.md'), 'utf-8');
    expect(content).toContain('| Task | Agent | Skills | Status |');
    expect(content).toContain('|------|-------|--------|--------|');
    expect(content).toContain('| 001: Fix bug | bug-fixer | - | DONE |');
  });

  it('defaults to generic when assignedAgent is undefined', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001', title: 'Task A', assignedAgent: undefined })],
    });
    writeSprintLog(tmpDir, sprint, makeMetrics());

    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-061.md'), 'utf-8');
    expect(content).toContain('| 001: Task A | generic | - | DONE |');
  });

  it('shows specific agent name in table', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001', title: 'Security scan', assignedAgent: 'security-auditor' }),
        makeTask({ id: '002', title: 'Write docs', assignedAgent: 'doc-writer' }),
      ],
    });
    const evals = new Map<string, TaskEvaluation>([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    writeSprintLog(tmpDir, sprint, makeMetrics(), evals);

    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-061.md'), 'utf-8');
    expect(content).toContain('| 001: Security scan | security-auditor |');
    expect(content).toContain('| 002: Write docs | doc-writer |');
  });
});

// ─── D) writeSprintLog skill column ─────────────────────────────────

describe('writeSprintLog — skills column in task table', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shows assigned skills in Skills column', () => {
    const sprint = makeSprint({
      tasks: [makeTask({
        id: '001',
        title: 'TS Task',
        assignedAgent: 'generic',
        assignedSkills: ['typescript-expert', 'testing-expert'],
      })],
    });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    writeSprintLog(tmpDir, sprint, makeMetrics(), evals);

    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-061.md'), 'utf-8');
    expect(content).toContain('| 001: TS Task | generic | typescript-expert, testing-expert | DONE |');
  });

  it('shows dash when no skills assigned', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001', title: 'No skills', assignedSkills: [] })],
    });
    writeSprintLog(tmpDir, sprint, makeMetrics());

    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-061.md'), 'utf-8');
    expect(content).toContain('| - |');
  });

  it('shows dash when assignedSkills is undefined', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001', title: 'Undef skills', assignedSkills: undefined })],
    });
    writeSprintLog(tmpDir, sprint, makeMetrics());

    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-061.md'), 'utf-8');
    expect(content).toContain('| 001: Undef skills | generic | - | DONE |');
  });

  it('shows single skill without comma', () => {
    const sprint = makeSprint({
      tasks: [makeTask({
        id: '001',
        title: 'Single skill',
        assignedSkills: ['documentation-writer'],
      })],
    });
    writeSprintLog(tmpDir, sprint, makeMetrics());

    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-061.md'), 'utf-8');
    expect(content).toContain('| 001: Single skill | generic | documentation-writer | DONE |');
  });
});
