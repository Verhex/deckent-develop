import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../src/core/routing-engine.js', () => ({
  routeTaskV2: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

import { MidSprintAdapter, type RerouteResult } from '../../src/orchestra/mid-sprint-adapter.js';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';
import type { RoutingDecision } from '../../src/core/routing-types.js';

const mockRouteTaskV2 = vi.mocked(routeTaskV2);

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'test desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'EXECUTING' as const,
    sprintId: 'sprint-001',
    createdAt: '2026-01-01T00:00:00Z',
    assignedAgent: 'test-writer',
    assignedSkills: ['typescript-expert'],
    provider: 'claude',
    ...overrides,
  } as Task;
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'failed',
    ...overrides,
  } as TaskResult;
}

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    agentId: 'bug-fixer',
    agentScore: 8,
    agentConfidence: 'high',
    skillIds: ['testing-expert'],
    skillScores: new Map([['testing-expert', 7]]),
    skillConfidence: 'medium',
    overrideSource: 'none',
    taskDNA: {
      intent: { primary: 'testing', secondary: [], confidence: 0.9 },
      domains: [{ name: 'testing', weight: 1 }],
      operations: [{ type: 'test', weight: 1 }],
      complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
      scope: { writeRatio: { 'tests/': 1 }, primaryWriteTarget: 'tests/', testWriteRatio: 1 },
    },
    reasoning: ['test'],
    ...overrides,
  };
}

function makeMockTracker() {
  return {
    calculateBonuses: vi.fn().mockReturnValue([]),
    recordOutcome: vi.fn(),
    getLearnings: vi.fn().mockReturnValue({
      version: 1,
      updatedAt: '',
      totalOutcomes: 0,
      agentPerformance: {},
      skillPerformance: {},
      synergyMatrix: [],
      recentSprints: [],
    }),
    save: vi.fn(),
  } as any;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('MidSprintAdapter', () => {
  let adapter: MidSprintAdapter;
  let mockTracker: ReturnType<typeof makeMockTracker>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockTracker = makeMockTracker();
    adapter = new MidSprintAdapter(
      {} as any, // agentPool
      new Map(),  // skillPool
      mockTracker,
      { language: 'typescript', framework: 'node', dependencies: [] },
    );
  });

  describe('shouldReroute', () => {
    it('should not reroute successful tasks (DONE)', () => {
      const task = makeTask();
      const result = makeResult({ selfAssessment: 'DONE' as any });

      const reroute = adapter.shouldReroute(task, result);

      expect(reroute.should).toBe(false);
      expect(reroute.reason).toContain('did not fail');
    });

    it('should not reroute GO_WITH_TECH_DEBT when reroute_on_tech_debt is disabled', () => {
      const task = makeTask();
      const result = makeResult({ selfAssessment: 'GO_WITH_TECH_DEBT' as any });

      const reroute = adapter.shouldReroute(task, result);

      expect(reroute.should).toBe(false);
      expect(reroute.reason).toContain('reroute_on_tech_debt is disabled');
    });

    it('should reroute NO_GO tasks when alternative routing is found', () => {
      const task = makeTask();
      const result = makeResult({ selfAssessment: 'NO_GO' });
      const newDecision = makeDecision({ agentId: 'bug-fixer', skillIds: ['security-specialist'] });

      mockRouteTaskV2.mockReturnValue(newDecision);

      const reroute = adapter.shouldReroute(task, result);

      expect(reroute.should).toBe(true);
      expect(reroute.reason).toContain('Rerouting');
      expect(reroute.newDecision).toBeDefined();
      expect(reroute.newDecision!.agentId).toBe('bug-fixer');
    });

    it('should respect max reroute attempts', () => {
      const task = makeTask({ id: 'limited-task' });
      const result = makeResult({ taskId: 'limited-task', selfAssessment: 'NO_GO' });
      const newDecision = makeDecision({ agentId: 'refactorer', skillIds: ['code-simplifier'] });

      // Create adapter with max 2 reroutes
      const limitedAdapter = new MidSprintAdapter(
        {} as any,
        new Map(),
        mockTracker,
        null,
        { max_reroutes: 2, reroute_on_tech_debt: false },
      );

      mockRouteTaskV2.mockReturnValue(newDecision);

      // First 2 should succeed
      limitedAdapter.shouldReroute(task, result);
      limitedAdapter.shouldReroute(task, result);

      // Third should be denied
      const third = limitedAdapter.shouldReroute(task, result);
      expect(third.should).toBe(false);
      expect(third.reason).toContain('Max reroutes');
    });

    it('should not reroute when alternative is same as original', () => {
      const task = makeTask({ assignedAgent: 'test-writer', assignedSkills: ['typescript-expert'] });
      const result = makeResult({ selfAssessment: 'NO_GO' });
      const sameDecision = makeDecision({ agentId: 'test-writer', skillIds: ['typescript-expert'] });

      mockRouteTaskV2.mockReturnValue(sameDecision);

      const reroute = adapter.shouldReroute(task, result);
      expect(reroute.should).toBe(false);
      expect(reroute.reason).toContain('same as original');
    });
  });

  describe('applyReroute', () => {
    it('should mutate task with new routing decision', () => {
      const task = makeTask();
      const decision = makeDecision({ agentId: 'security-auditor', skillIds: ['security-specialist'] });

      adapter.applyReroute(task, decision);

      expect(task.assignedAgent).toBe('security-auditor');
      expect(task.assignedSkills).toEqual(['security-specialist']);
      expect(task.routingMeta?.routingVersion).toBe('v2');
    });
  });
});
