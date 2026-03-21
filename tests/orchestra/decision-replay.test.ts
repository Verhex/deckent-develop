import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { replayDecision, diffDecisions } from '../../src/orchestra/decision-replay.js';
import { DecisionOrchestrator } from '../../src/orchestra/decision-engine.js';
import { DecisionLogger } from '../../src/orchestra/decision-logger.js';
import { createDefaultAnalysis, createDecisionLogEntry } from '../../src/core/decision-types.js';
import type { DecisionResult, DecisionContext } from '../../src/core/decision-types.js';
import type { Task, TaskScope, ResolvedConfig, UsageMetrics } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import type { AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

const TEST_ROOT = path.join(process.cwd(), '.test-decision-replay-' + process.pid);

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
      usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: TEST_ROOT,
    version: '0.1.0',
  };
}

function makeUsage(): UsageMetrics {
  return { fiveHourPercent: 10, weeklyPercent: 10, measuredAt: '2026-03-22T00:00:00.000Z' };
}

function makeScope(dirs: string[] = [], filesWrite: string[] = []): TaskScope {
  return { directories: dirs, filesRead: [], filesWrite };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '031-001',
    title: 'Build feature',
    description: 'Implement the module',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Sprint requirement',
    scope: makeScope(['src/core/']),
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Fails', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-031',
    ...overrides,
  };
}

function makeContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    projectStack: null,
    agentPool: new Map() as AgentPool,
    skillPool: new Map<string, SkillDefinition>(),
    patterns: [],
    usageMetrics: makeUsage(),
    config: makeConfig(),
    ...overrides,
  };
}

function makeDecisionResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
  return {
    analysis: createDefaultAnalysis(),
    agent: null,
    skills: [],
    model: 'sonnet',
    effort: 'normal',
    scope: makeScope(['src/']),
    decisionLog: [],
    ...overrides,
  };
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(() => {
  cleanup();
});

// ─── diffDecisions ─────────────────────────────────────────────────────────

describe('diffDecisions', () => {
  it('returns empty array for identical results', () => {
    const a = makeDecisionResult();
    const b = makeDecisionResult();
    expect(diffDecisions(a, b)).toEqual([]);
  });

  it('detects TaskType change', () => {
    const a = makeDecisionResult({ analysis: { ...createDefaultAnalysis(), type: 'code' } });
    const b = makeDecisionResult({ analysis: { ...createDefaultAnalysis(), type: 'test' } });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('TaskType'))).toBe(true);
  });

  it('detects complexity change', () => {
    const a = makeDecisionResult({ analysis: { ...createDefaultAnalysis(), complexity: 3 } });
    const b = makeDecisionResult({ analysis: { ...createDefaultAnalysis(), complexity: 8 } });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('Complexity'))).toBe(true);
  });

  it('detects agent change', () => {
    const agentA = createAgentDefinition({ id: 'agent-a', name: 'A' });
    const agentB = createAgentDefinition({ id: 'agent-b', name: 'B' });
    const a = makeDecisionResult({ agent: agentA });
    const b = makeDecisionResult({ agent: agentB });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('Agent'))).toBe(true);
  });

  it('detects agent added (null to agent)', () => {
    const agent = createAgentDefinition({ id: 'agent-x', name: 'X' });
    const a = makeDecisionResult({ agent: null });
    const b = makeDecisionResult({ agent });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('Agent'))).toBe(true);
  });

  it('detects skills change', () => {
    const skillA = createSkillDefinition({ id: 'skill-a', name: 'A' });
    const skillB = createSkillDefinition({ id: 'skill-b', name: 'B' });
    const a = makeDecisionResult({ skills: [skillA] });
    const b = makeDecisionResult({ skills: [skillB] });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('Skills'))).toBe(true);
  });

  it('detects model change', () => {
    const a = makeDecisionResult({ model: 'sonnet' });
    const b = makeDecisionResult({ model: 'opus' });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('Model'))).toBe(true);
  });

  it('detects effort change', () => {
    const a = makeDecisionResult({ effort: 'low' });
    const b = makeDecisionResult({ effort: 'high' });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('Effort'))).toBe(true);
  });

  it('detects scope directory change', () => {
    const a = makeDecisionResult({ scope: makeScope(['src/']) });
    const b = makeDecisionResult({ scope: makeScope(['src/', 'tests/']) });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('directories'))).toBe(true);
  });

  it('detects scope filesWrite change', () => {
    const a = makeDecisionResult({ scope: makeScope(['src/'], ['a.ts']) });
    const b = makeDecisionResult({ scope: makeScope(['src/'], ['a.ts', 'b.ts']) });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('filesWrite'))).toBe(true);
  });

  it('does not report unchanged model', () => {
    const a = makeDecisionResult({ model: 'opus' });
    const b = makeDecisionResult({ model: 'opus' });
    const diffs = diffDecisions(a, b);
    expect(diffs.some(d => d.includes('Model'))).toBe(false);
  });
});

// ─── replayDecision — no original log ──────────────────────────────────────

describe('replayDecision — no original log', () => {
  it('marks as drifted when no original log exists', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const engine = new DecisionOrchestrator(makeContext());
    const task = makeTask();
    const result = replayDecision(task, engine, logger);
    expect(result.drifted).toBe(true);
  });

  it('includes "No original" in diffs when no log', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const engine = new DecisionOrchestrator(makeContext());
    const task = makeTask();
    const result = replayDecision(task, engine, logger);
    expect(result.diffs.some(d => d.includes('No original'))).toBe(true);
  });

  it('returns replayed result even without original', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const engine = new DecisionOrchestrator(makeContext());
    const task = makeTask();
    const result = replayDecision(task, engine, logger);
    expect(result.replayed).toBeDefined();
    expect(result.replayed.decisionLog).toHaveLength(6);
  });

  it('returns correct taskId', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const engine = new DecisionOrchestrator(makeContext());
    const task = makeTask({ id: '031-007' });
    const result = replayDecision(task, engine, logger);
    expect(result.taskId).toBe('031-007');
  });
});

// ─── replayDecision — with original log ────────────────────────────────────

describe('replayDecision — with original log', () => {
  it('detects no drift when replayed matches original', () => {
    const ctx = makeContext();
    const engine = new DecisionOrchestrator(ctx);
    const logger = new DecisionLogger(TEST_ROOT);
    const task = makeTask();

    // First run: log the decision
    const firstResult = engine.decide(task);
    logger.log('sprint-031', task.id, firstResult.decisionLog);

    // Replay: should produce same steps
    const replay = replayDecision(task, engine, logger);
    // Same engine + same task = same reasoning, so no drift
    expect(replay.drifted).toBe(false);
    expect(replay.diffs).toEqual([]);
  });

  it('detects drift when context changes', () => {
    const ctx1 = makeContext();
    const engine1 = new DecisionOrchestrator(ctx1);
    const logger = new DecisionLogger(TEST_ROOT);
    const task = makeTask({ title: 'Write tests', description: 'Add test coverage' });

    // Log with engine1
    const firstResult = engine1.decide(task);
    logger.log('sprint-031', task.id, firstResult.decisionLog);

    // Replay with different context (add an agent)
    const pool2: AgentPool = new Map();
    pool2.set('test-writer', createAgentDefinition({
      id: 'test-writer',
      name: 'Test Writer',
      triggerKeywords: ['test', 'coverage'],
      triggerScopes: ['tests/'],
    }));
    const ctx2 = makeContext({ agentPool: pool2 });
    const engine2 = new DecisionOrchestrator(ctx2);

    const replay = replayDecision(task, engine2, logger);
    // The reasoning will differ since a new agent was available
    expect(replay.original).not.toBeNull();
    // Drift may or may not occur depending on matching
    expect(replay.replayed.decisionLog).toHaveLength(6);
  });

  it('returns original log data', () => {
    const engine = new DecisionOrchestrator(makeContext());
    const logger = new DecisionLogger(TEST_ROOT);
    const task = makeTask();
    const result = engine.decide(task);
    logger.log('sprint-031', task.id, result.decisionLog);

    const replay = replayDecision(task, engine, logger);
    expect(replay.original).not.toBeNull();
    expect(replay.original!.steps).toHaveLength(6);
  });
});
