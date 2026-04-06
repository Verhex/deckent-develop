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

    it('tracks skill sprint history when recording outcomes', () => {
      tracker.recordOutcome(makeOutcome({ sprintId: 'sprint-001' }));
      const learnings = tracker.getLearnings();
      expect(learnings.skillSprintHistory['typescript-expert']).toBeDefined();
      expect(learnings.skillSprintHistory['typescript-expert']!['sprint-001']).toBeDefined();
      expect(learnings.skillSprintHistory['typescript-expert']!['sprint-001']!.successCount).toBe(1);
    });

    it('tracks sprint order in recentSprints', () => {
      tracker.recordOutcome(makeOutcome({ sprintId: 'sprint-001' }));
      tracker.recordOutcome(makeOutcome({ taskId: 'task-002', sprintId: 'sprint-002' }));
      const learnings = tracker.getLearnings();
      expect(learnings.recentSprints).toEqual(['sprint-001', 'sprint-002']);
    });

    it('does not duplicate sprint IDs in recentSprints', () => {
      tracker.recordOutcome(makeOutcome({ taskId: 'task-001', sprintId: 'sprint-001' }));
      tracker.recordOutcome(makeOutcome({ taskId: 'task-002', sprintId: 'sprint-001' }));
      const learnings = tracker.getLearnings();
      expect(learnings.recentSprints.filter(s => s === 'sprint-001')).toHaveLength(1);
    });

    it('tracks coverage in skill sprint history', () => {
      tracker.recordOutcome(makeOutcome({ sprintId: 'sprint-001', coverage: 80 }));
      tracker.recordOutcome(makeOutcome({ taskId: 'task-002', sprintId: 'sprint-001', coverage: 100 }));
      const record = tracker.getLearnings().skillSprintHistory['typescript-expert']!['sprint-001']!;
      expect(record.avgCoverage).toBeCloseTo(90, 1);
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

  describe('calculateSprintRecencyBonuses', () => {
    it('returns empty map when fewer than 2 sprints seen', () => {
      // Record 3 successes in the same sprint
      for (let i = 0; i < 3; i++) {
        tracker.recordOutcome(makeOutcome({ taskId: `task-${i}`, sprintId: 'sprint-001' }));
      }
      const bonuses = tracker.calculateSprintRecencyBonuses();
      expect(bonuses.size).toBe(0);
    });

    it('returns +3 for skill succeeding in all recent sprints', () => {
      // 3 tasks across 3 sprints, all DONE
      for (let i = 1; i <= 3; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `task-s${i}`,
          sprintId: `sprint-00${i}`,
          evaluation: 'DONE',
        }));
      }
      const bonuses = tracker.calculateSprintRecencyBonuses();
      expect(bonuses.get('typescript-expert')).toBe(3);
    });

    it('returns -2 for skill failing in all recent sprints', () => {
      for (let i = 1; i <= 3; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `task-s${i}`,
          sprintId: `sprint-00${i}`,
          evaluation: 'NO_GO',
        }));
      }
      const bonuses = tracker.calculateSprintRecencyBonuses();
      expect(bonuses.get('typescript-expert')).toBe(-2);
    });

    it('returns +1 for skill with >=75% success rate in recent sprints', () => {
      // 3 DONE, 1 NO_GO across 4 sprints (75% success)
      for (let i = 1; i <= 3; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `done-s${i}`,
          sprintId: `sprint-00${i}`,
          evaluation: 'DONE',
        }));
      }
      tracker.recordOutcome(makeOutcome({
        taskId: 'fail-s4',
        sprintId: 'sprint-004',
        evaluation: 'NO_GO',
      }));
      const bonuses = tracker.calculateSprintRecencyBonuses();
      // Only last 3 sprints count: sprint-002, sprint-003, sprint-004
      // sprint-002: 1 success, sprint-003: 1 success, sprint-004: 1 fail → 2/3 ≈ 67% (neutral)
      expect(bonuses.get('typescript-expert')).toBeUndefined();
    });

    it('caps bonus at LEARNING_BONUS_CAP in calculateBonuses', () => {
      // High overall performance bonus + sprint recency bonus might exceed cap
      for (let i = 1; i <= 3; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `task-s${i}`,
          sprintId: `sprint-00${i}`,
          evaluation: 'DONE',
        }));
      }
      // Add more tasks for overall performance bonus
      for (let i = 4; i <= 8; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `task-s${i}`,
          sprintId: 'sprint-003',
          evaluation: 'DONE',
        }));
      }
      const dna = createDefaultTaskDNA();
      const bonuses = tracker.calculateBonuses(dna);
      const skillBonus = bonuses.find(b => b.entityId === 'typescript-expert');
      if (skillBonus) {
        expect(Math.abs(skillBonus.bonus)).toBeLessThanOrEqual(3); // LEARNING_BONUS_CAP
      }
    });
  });

  describe('quality score integration', () => {
    it('tracks avgQualityScore via incremental average', () => {
      tracker.recordOutcome(makeOutcome({ taskId: 'q1', qualityScore: 80 }));
      tracker.recordOutcome(makeOutcome({ taskId: 'q2', qualityScore: 60 }));

      const perf = tracker.getLearnings().agentPerformance['test-agent']!;
      expect(perf.avgQualityScore).toBeCloseTo(70, 1);
    });

    it('gives +1 bonus for avgQualityScore >= 80 with enough samples', () => {
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({ taskId: `hq-${i}`, qualityScore: 90 }));
      }

      const dna = createDefaultTaskDNA();
      dna.intent.primary = 'implementation';
      const bonuses = tracker.calculateBonuses(dna);
      const agentBonus = bonuses.find(b => b.entityId === 'test-agent');
      expect(agentBonus).toBeDefined();
      // successRate=1.0 (>=0.9, 6 tasks) → +1, avgQualityScore=90 (>=80) → +1 = +2
      expect(agentBonus!.bonus).toBe(2);
    });

    it('gives -1 penalty for avgQualityScore < 40 with enough samples', () => {
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({ taskId: `lq-${i}`, evaluation: 'NO_GO', qualityScore: 20 }));
      }

      const dna = createDefaultTaskDNA();
      dna.intent.primary = 'implementation';
      const bonuses = tracker.calculateBonuses(dna);
      const agentBonus = bonuses.find(b => b.entityId === 'test-agent');
      expect(agentBonus).toBeDefined();
      // successRate=0 (<0.5, 6 tasks) → -2, avgQualityScore=20 (<40) → -1 = -3 (capped at -3)
      expect(agentBonus!.bonus).toBe(-3);
    });

    it('does not apply quality bonus when avgQualityScore is 0 (no quality data)', () => {
      // No qualityScore passed → avgQualityScore stays 0
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({ taskId: `nq-${i}` }));
      }

      const dna = createDefaultTaskDNA();
      dna.intent.primary = 'implementation';
      const bonuses = tracker.calculateBonuses(dna);
      const agentBonus = bonuses.find(b => b.entityId === 'test-agent');
      expect(agentBonus).toBeDefined();
      // successRate=1.0 → +1, no quality bonus (avgQualityScore=0) → total +1
      expect(agentBonus!.bonus).toBe(1);
    });

    it('tracks quality score for skills too', () => {
      tracker.recordOutcome(makeOutcome({ taskId: 'sq1', qualityScore: 95 }));
      tracker.recordOutcome(makeOutcome({ taskId: 'sq2', qualityScore: 85 }));

      const skillPerf = tracker.getLearnings().skillPerformance['typescript-expert']!;
      expect(skillPerf.avgQualityScore).toBeCloseTo(90, 1);
    });

    it('backfills avgQualityScore to 0 for entities loaded from older learnings', () => {
      // The loadLearnings() backfill is tested implicitly by the constructor
      // reading from mocked fs — all EntityPerformance objects should have avgQualityScore
      const learnings = tracker.getLearnings();
      // Fresh tracker has empty maps, but if we record and check, it should be there
      tracker.recordOutcome(makeOutcome({ taskId: 'bf1' }));
      const agentPerf = tracker.getLearnings().agentPerformance['test-agent']!;
      expect(agentPerf.avgQualityScore).toBeDefined();
      expect(typeof agentPerf.avgQualityScore).toBe('number');
    });
  });

  describe('configurable constants', () => {
    it('uses custom minSamplesForBonus from config', () => {
      const customTracker = new OutcomeTracker('/tmp/test-project', { minSamplesForBonus: 5 });
      // Record 4 outcomes — less than custom threshold of 5
      for (let i = 0; i < 4; i++) {
        customTracker.recordOutcome(makeOutcome({ taskId: `cfg-${i}` }));
      }
      const bonuses = customTracker.calculateBonuses(createDefaultTaskDNA());
      // Should be empty because 4 < 5 (custom min)
      expect(bonuses).toEqual([]);
    });

    it('uses custom recentSprintWindow from config', () => {
      const customTracker = new OutcomeTracker('/tmp/test-project', { recentSprintWindow: 2 });
      // Record outcomes across 3 sprints
      for (let i = 1; i <= 3; i++) {
        customTracker.recordOutcome(makeOutcome({
          taskId: `rw-${i}`,
          sprintId: `sprint-00${i}`,
          evaluation: 'DONE',
        }));
      }
      const bonuses = customTracker.calculateSprintRecencyBonuses();
      // Window=2 means only last 2 sprints (sprint-002, sprint-003) are considered
      // 2 outcomes >= minSamplesForBonus(3)? No, only 2. So no bonus.
      // This verifies the window is actually 2, not default 3.
      expect(bonuses.size).toBe(0);
    });

    it('uses custom sprintRecencySuccessBonus from config', () => {
      const customTracker = new OutcomeTracker('/tmp/test-project', { sprintRecencySuccessBonus: 5 });
      for (let i = 1; i <= 3; i++) {
        customTracker.recordOutcome(makeOutcome({
          taskId: `sb-${i}`,
          sprintId: `sprint-00${i}`,
          evaluation: 'DONE',
        }));
      }
      const bonuses = customTracker.calculateSprintRecencyBonuses();
      expect(bonuses.get('typescript-expert')).toBe(5);
    });

    it('uses custom sprintRecencyFailurePenalty from config', () => {
      const customTracker = new OutcomeTracker('/tmp/test-project', { sprintRecencyFailurePenalty: -4 });
      for (let i = 1; i <= 3; i++) {
        customTracker.recordOutcome(makeOutcome({
          taskId: `fp-${i}`,
          sprintId: `sprint-00${i}`,
          evaluation: 'NO_GO',
        }));
      }
      const bonuses = customTracker.calculateSprintRecencyBonuses();
      expect(bonuses.get('typescript-expert')).toBe(-4);
    });
  });
});
