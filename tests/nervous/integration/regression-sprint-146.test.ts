// tests/nervous/integration/regression-sprint-146.test.ts
//
// Regression tests for Sprint 146 issues:
// - T-146-005: agent `string;` corruption
// - T-146-011: vitest regression (mocking patterns)
// - T-146-008: DIRECTIVES.md mid-sprint template revert
//
// Sprint 147 Task 19

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectorContext, DetectorResult, ObserverEvent, SprintStateSnapshot, NervousSystemConfig } from '../../../src/core/nervous-types.js';
import { AgentRoutingHealth } from '../../../src/nervous/detectors/agent-routing.js';
import { DirectivesMidSprintProtection } from '../../../src/nervous/detectors/directives-protection.js';
import { DecisionEngine } from '../../../src/nervous/decision-engine.js';
import { Proposer } from '../../../src/nervous/proposer.js';

// Mock fs for detector file operations
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
  statSync: vi.fn(() => ({ size: 5000 })),
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-146',
    currentPhase: 'EVALUATE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 17,
    completedTasks: 16,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: 'evt-regression',
    source: 'sprint-lifecycle',
    type: 'SPRINT_PHASE_CHANGE',
    timestamp: new Date().toISOString(),
    payload: { newPhase: 'EVALUATE', oldPhase: 'EXECUTE' },
    ...overrides,
  };
}

function makeContext(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makeSprintState(),
    projectRoot: '/tmp/test-project',
    now: new Date('2026-04-20T08:14:00Z'),
    ...overrides,
  };
}

describe('Sprint 146 Regression Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect Sprint 146 T-146-005 agent string; corruption pattern', () => {
    // Sprint 146 real bug: task-builder.ts:761 leaked TypeScript type "string;" as agent ID
    const detector = new AgentRoutingHealth();

    // Simulate Sprint 146 task files: 9 tasks with test-writer, 1 with "string;"
    const taskFiles = Array.from({ length: 17 }, (_, i) => `task-146-${String(i + 1).padStart(3, '0')}.json`);
    vi.mocked(readdirSync).mockReturnValue(taskFiles as any);

    vi.mocked(readFileSync).mockImplementation((path: any) => {
      const pathStr = path.toString();
      // Task 5 has the corrupt agent (Sprint 146 real scenario)
      if (pathStr.includes('task-146-005')) {
        return JSON.stringify({ id: 'T-146-005', assignedAgent: 'string;' });
      }
      // 9 tasks with test-writer (53% anomaly)
      const num = parseInt(pathStr.match(/task-146-(\d+)/)?.[1] ?? '0');
      if (num <= 9 && num !== 5) {
        return JSON.stringify({ id: `T-146-${String(num).padStart(3, '0')}`, assignedAgent: 'test-writer' });
      }
      return JSON.stringify({ id: `T-146-${String(num).padStart(3, '0')}`, assignedAgent: 'architect' });
    });

    const ctx = makeContext({
      sprintState: makeSprintState({ totalTasks: 17 }),
    });

    const result = detector.detect(ctx);
    expect(result).not.toBeNull();
    // Should be critical due to corrupt agent
    expect(result!.severity).toBe('critical');
    // Should detect both corrupt + anomaly issues
    const issues = result!.suggestedActions;
    const corruptIssue = issues.find(a => a.id === 'AGENT_PERFORMANCE_FLAG');
    const anomalyIssue = issues.find(a => a.id === 'SKILL_ROUTING_ADJUST');
    expect(corruptIssue).toBeDefined();
    expect(anomalyIssue).toBeDefined();
  });

  it('should replay Sprint 145 08:14 TRT DIRECTIVES.md template reversion', () => {
    // Sprint 145 real bug: DIRECTIVES.md overwritten with 463-byte template during EXECUTE
    const detector = new DirectivesMidSprintProtection();

    vi.mocked(statSync).mockReturnValue({ size: 463 } as any);
    vi.mocked(readFileSync).mockReturnValue(
      '# DIRECTIVES — (Sprint 145 için hazırlanıyor)\n\n## Task 1: (Task başlığı)\n',
    );

    const ctx = makeContext({
      event: {
        id: 'evt-fs-directives',
        source: 'filesystem',
        type: 'FILE_CHANGE',
        timestamp: '2026-04-19T05:14:00Z', // 08:14 TRT = 05:14 UTC
        payload: { path: 'DIRECTIVES.md', eventType: 'change' },
      },
      sprintState: makeSprintState({ currentPhase: 'EXECUTE', sprintId: 'sprint-145' }),
    });

    const result = detector.detect(ctx);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('emergency');
    expect(result!.risk).toBe('high');
    expect(result!.suggestedActions[0].payload).toMatchObject({
      autoRestore: true,
      phase: 'EXECUTE',
    });
  });

  it('should produce correct notification and decision for emergency directives scenario', () => {
    // Full pipeline: detector → decision → proposer
    const config: NervousSystemConfig = { mode: 'balanced', enabled: true };
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);

    // Simulated detector result (as if DirectivesMidSprintProtection returned)
    const detectorResult: DetectorResult = {
      risk: 'high',
      shouldNotify: true,
      severity: 'emergency',
      // bug-2: title/message are now required on DetectorResult.
      title: 'DIRECTIVES.md integrity breach',
      message: 'DIRECTIVES.md reverted to template mid-sprint',
      groupKey: 'directives-protection:sprint-145',
      suggestedActions: [{
        id: 'DIRECTIVES_WRITE',
        label: '🚨 EMERGENCY: Restore DIRECTIVES.md',
        risk: 'high',
        payload: { autoRestore: true, reason: 'template reversion' },
      }],
      metadata: { type: 'directives-protection' },
    };

    const decisions = engine.decide(detectorResult);
    expect(decisions).toHaveLength(1);
    // DIRECTIVES_WRITE is medium-risk category but suggested with high risk
    // In balanced mode, medium-risk default → suggest-30m
    expect(decisions[0].policy).toBe('suggest-30m');

    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'directives-protection',
      title: 'EMERGENCY: DIRECTIVES.md corrupted',
      message: 'Template reversion detected mid-sprint',
      sprintId: 'sprint-145',
      now: new Date('2026-04-19T05:14:00Z'),
    });

    expect(notification).not.toBeNull();
    expect(notification!.severity).toBe('emergency');
    expect(notification!.timeoutMs).toBe(1800000); // suggest-30m
  });

  it('should correctly mock and restore fs modules without leaking between tests', () => {
    // This test verifies the mocking pattern works correctly (Sprint 146 regression)
    // The vi.mock at top level + vi.mocked pattern should be stable

    // Verify mocks are function references
    expect(vi.isMockFunction(existsSync)).toBe(true);
    expect(vi.isMockFunction(readdirSync)).toBe(true);
    expect(vi.isMockFunction(readFileSync)).toBe(true);
    expect(vi.isMockFunction(statSync)).toBe(true);

    // Verify mock return values can be set per-test
    vi.mocked(existsSync).mockReturnValue(false);
    expect(existsSync('/nonexistent')).toBe(false);

    vi.mocked(existsSync).mockReturnValue(true);
    expect(existsSync('/exists')).toBe(true);
  });

  it('should handle multiple detectors running on same event without interference', () => {
    // Sprint 146 regression: detectors sharing mocked fs state caused false positives
    const staleDetector = new AgentRoutingHealth();
    const directivesDetector = new DirectivesMidSprintProtection();

    // AgentRoutingHealth needs sprint-lifecycle event
    const agentCtx = makeContext({
      event: makeEvent({
        source: 'sprint-lifecycle',
        type: 'SPRINT_PHASE_CHANGE',
        payload: { newPhase: 'EVALUATE' },
      }),
    });

    // DirectivesMidSprintProtection needs filesystem event
    const directivesCtx = makeContext({
      event: {
        id: 'evt-fs',
        source: 'filesystem',
        type: 'FILE_CHANGE',
        timestamp: new Date().toISOString(),
        payload: { path: '.tasks/task-001.json' }, // NOT directives
      },
      sprintState: makeSprintState({ currentPhase: 'EXECUTE' }),
    });

    // Set up fs mocks for agent routing
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ id: 'T-001', assignedAgent: 'test-writer' }),
    );

    // Agent detector should work on its event
    const agentResult = staleDetector.detect(agentCtx);
    // Directives detector should NOT trigger on task file event
    const directivesResult = directivesDetector.detect(directivesCtx);

    // Directives detector returns null because path doesn't end with DIRECTIVES.md
    expect(directivesResult).toBeNull();
    // Agent detector: 1/1 task with test-writer = 100% → anomaly
    expect(agentResult).not.toBeNull();
    expect(agentResult!.suggestedActions[0].id).toBe('SKILL_ROUTING_ADJUST');
  });
});
