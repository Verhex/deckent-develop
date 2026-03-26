import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutcomeTracker, type RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';
import type { TaskDNA } from '../../src/core/routing-types.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

// Mock fs to avoid real file I/O
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

function makeOutcome(overrides?: Partial<RoutingOutcome>): RoutingOutcome {
  const dna = createDefaultTaskDNA();
  dna.intent.primary = 'implementation';
  return {
    taskId: 'test-001',
    sprintId: 'sprint-001',
    taskDNA: dna,
    agentId: 'test-agent',
    skillIds: ['typescript-expert'],
    evaluation: 'DONE',
    coverage: 90,
    routingVersion: 'v2',
    ...overrides,
  };
}

describe('OutcomeTracker', () => {
  let tracker: OutcomeTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new OutcomeTracker('/tmp/test-project');
  });

  describe('recordOutcome', () => {
    it('records a successful outcome', () => {
      tracker.recordOutcome(makeOutcome());
      const learnings = tracker.getLearnings();
      expect(learnings.totalOutcomes).toBe(1);
      expect(learnings.agentPerformance['test-agent']).toBeDefined();
      expect(learnings.agentPerformance['test-agent']!.successRate).toBe(1);
    });

    it('records a failed outcome', () => {
      tracker.recordOutcome(makeOutcome({ evaluation: 'NO_GO' }));
      const learnings = tracker.getLearnings();
      expect(learnings.agentPerformance['test-agent']!.successRate).toBe(0);
      expect(learnings.agentPerformance['test-agent']!.failCount).toBe(1);
    });

    it('tracks skill performance', () => {
      tracker.recordOutcome(makeOutcome());
      const learnings = tracker.getLearnings();
      expect(learnings.skillPerformance['typescript-expert']).toBeDefined();
      expect(learnings.skillPerformance['typescript-expert']!.totalTasks).toBe(1);
    });

    it('tracks synergy between agent and skill', () => {
      tracker.recordOutcome(makeOutcome());
      const synergy = tracker.getSynergyMatrix();
      expect(synergy.some(e => e.pair === 'test-agent+typescript-expert')).toBe(true);
    });

    it('tracks synergy between skill pairs', () => {
      tracker.recordOutcome(makeOutcome({ skillIds: ['skill-a', 'skill-b'] }));
      const synergy = tracker.getSynergyMatrix();
      expect(synergy.some(e => e.pair === 'skill-a+skill-b')).toBe(true);
    });

    it('does not track generic agent', () => {
      tracker.recordOutcome(makeOutcome({ agentId: 'generic' }));
      const learnings = tracker.getLearnings();
      expect(learnings.agentPerformance['generic']).toBeUndefined();
    });

    it('accumulates multiple outcomes', () => {
      tracker.recordOutcome(makeOutcome({ taskId: '001', evaluation: 'DONE' }));
      tracker.recordOutcome(makeOutcome({ taskId: '002', evaluation: 'DONE' }));
      tracker.recordOutcome(makeOutcome({ taskId: '003', evaluation: 'NO_GO' }));

      const learnings = tracker.getLearnings();
      expect(learnings.totalOutcomes).toBe(3);
      expect(learnings.agentPerformance['test-agent']!.totalTasks).toBe(3);
      expect(learnings.agentPerformance['test-agent']!.successRate).toBeCloseTo(0.67, 1);
    });

    it('tracks intent-specific performance', () => {
      const secDNA = createDefaultTaskDNA();
      secDNA.intent.primary = 'security';

      tracker.recordOutcome(makeOutcome({ taskId: '001', evaluation: 'DONE' }));
      tracker.recordOutcome(makeOutcome({ taskId: '002', taskDNA: secDNA, evaluation: 'NO_GO' }));

      const perf = tracker.getLearnings().agentPerformance['test-agent']!;
      expect(perf.byIntent['implementation']?.successRate).toBe(1);
      expect(perf.byIntent['security']?.successRate).toBe(0);
    });
  });

  describe('calculateBonuses', () => {
    it('returns empty for insufficient data', () => {
      tracker.recordOutcome(makeOutcome());
      const bonuses = tracker.calculateBonuses(createDefaultTaskDNA());
      // Only 1 outcome — below minimum samples (3)
      expect(bonuses).toEqual([]);
    });

    it('returns positive bonus for high overall success', () => {
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({ taskId: `task-${i}`, evaluation: 'DONE' }));
      }

      const dna = createDefaultTaskDNA();
      dna.intent.primary = 'implementation';
      const bonuses = tracker.calculateBonuses(dna);
      const agentBonus = bonuses.find(b => b.entityId === 'test-agent');
      expect(agentBonus).toBeDefined();
      expect(agentBonus!.bonus).toBeGreaterThan(0);
    });

    it('returns negative bonus for low success', () => {
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({ taskId: `task-${i}`, evaluation: 'NO_GO' }));
      }

      const dna = createDefaultTaskDNA();
      dna.intent.primary = 'implementation';
      const bonuses = tracker.calculateBonuses(dna);
      const agentBonus = bonuses.find(b => b.entityId === 'test-agent');
      expect(agentBonus).toBeDefined();
      expect(agentBonus!.bonus).toBeLessThan(0);
    });
  });

  describe('getSynergyMatrix', () => {
    it('marks synergy for high success pairs', () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome(makeOutcome({ taskId: `task-${i}`, evaluation: 'DONE' }));
      }

      const synergy = tracker.getSynergyMatrix();
      const entry = synergy.find(e => e.pair === 'test-agent+typescript-expert');
      expect(entry).toBeDefined();
      expect(entry!.verdict).toBe('synergy');
    });

    it('marks conflict for low success pairs', () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome(makeOutcome({ taskId: `task-${i}`, evaluation: 'NO_GO' }));
      }

      const synergy = tracker.getSynergyMatrix();
      const entry = synergy.find(e => e.pair === 'test-agent+typescript-expert');
      expect(entry).toBeDefined();
      expect(entry!.verdict).toBe('conflict');
    });
  });
});
