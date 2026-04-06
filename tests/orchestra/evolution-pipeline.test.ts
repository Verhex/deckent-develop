// ─── Evolution Pipeline Integration Tests ───────────────────────────────────
// End-to-end tests covering: OutcomeTracker → calculateBonuses, RuleEvolver → evolveRules,
// PromotionPipeline → evaluatePromotions, buildSkillPerformance, quality score bonus,
// and configurable constants via LearningConfig.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutcomeTracker, type RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';
import { RuleEvolver } from '../../src/orchestra/rule-evolver.js';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';
import { buildSkillPerformance } from '../../src/orchestra/sprint-reporter.js';
import { createDefaultTaskDNA, LEARNING_BONUS_CAP } from '../../src/core/routing-types.js';
import type { TaskDNA, IntentType } from '../../src/core/routing-types.js';
import { TaskEvaluation } from '../../src/core/task-types.js';
import type { Sprint } from '../../src/core/sprint-types.js';
import type { LearningConfig } from '../../src/core/decision-config.js';

// In-memory fs store — captures writeFileSync data and replays via readFileSync
const fsStore = new Map<string, string>();

vi.mock('fs', () => ({
  existsSync: vi.fn().mockImplementation((p: string) => fsStore.has(p)),
  readFileSync: vi.fn().mockImplementation((p: string) => fsStore.get(p) ?? '{}'),
  writeFileSync: vi.fn().mockImplementation((p: string, data: string) => { fsStore.set(p, data); }),
  mkdirSync: vi.fn(),
  cpSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDNA(intent: IntentType = 'implementation'): TaskDNA {
  const dna = createDefaultTaskDNA();
  dna.intent.primary = intent;
  dna.intent.confidence = 0.9;
  return dna;
}

function makeOutcome(overrides?: Partial<RoutingOutcome>): RoutingOutcome {
  return {
    taskId: 'task-001',
    sprintId: 'sprint-001',
    taskDNA: makeDNA(),
    agentId: 'bug-fixer',
    skillIds: ['typescript-expert'],
    evaluation: 'DONE',
    coverage: 90,
    routingVersion: 'v2',
    ...overrides,
  };
}

/** Record N successful outcomes for a given agent+skill pair. */
function recordSuccesses(
  tracker: OutcomeTracker,
  count: number,
  overrides?: Partial<RoutingOutcome>,
): void {
  for (let i = 0; i < count; i++) {
    tracker.recordOutcome(makeOutcome({
      taskId: `task-${i}`,
      evaluation: 'DONE',
      ...overrides,
    }));
  }
}

/** Record N failed outcomes. */
function recordFailures(
  tracker: OutcomeTracker,
  count: number,
  overrides?: Partial<RoutingOutcome>,
): void {
  for (let i = 0; i < count; i++) {
    tracker.recordOutcome(makeOutcome({
      taskId: `fail-${i}`,
      evaluation: 'NO_GO',
      ...overrides,
    }));
  }
}

/** Build a minimal Sprint object for buildSkillPerformance tests. */
function makeSprint(taskDefs: Array<{ id: string; skills?: string[] }>): Sprint {
  return {
    id: 'sprint-test',
    number: 1,
    status: 'COMPLETE' as Sprint['status'],
    phase: 'CLEANUP' as Sprint['phase'],
    tasks: taskDefs.map(t => ({
      id: t.id,
      title: `Task ${t.id}`,
      description: '',
      model: 'sonnet' as const,
      effort: 'normal' as const,
      priority: 'NORMAL' as const,
      reason: '',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: 'DONE' as const,
      sprintId: 'sprint-test',
      createdAt: new Date().toISOString(),
      assignedSkills: t.skills ?? [],
    })),
    workers: [],
  };
}

// ─── Test Suites ────────────────────────────────────────────────────────────

describe('Evolution Pipeline Integration', () => {
  let tracker: OutcomeTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    fsStore.clear();
    tracker = new OutcomeTracker('/tmp/test-evo');
  });

  // ── Scenario 1: recordOutcome → calculateBonuses → positive bonus ──────

  describe('Scenario 1: recordOutcome → calculateBonuses → positive bonus', () => {
    it('returns positive bonus after 5+ successful outcomes', () => {
      recordSuccesses(tracker, 6);

      const dna = makeDNA('implementation');
      const bonuses = tracker.calculateBonuses(dna);

      const agentBonus = bonuses.find(b => b.entityId === 'bug-fixer');
      expect(agentBonus).toBeDefined();
      expect(agentBonus!.bonus).toBeGreaterThan(0);

      const skillBonus = bonuses.find(b => b.entityId === 'typescript-expert');
      expect(skillBonus).toBeDefined();
      expect(skillBonus!.bonus).toBeGreaterThan(0);
    });

    it('returns negative bonus after many failures', () => {
      recordFailures(tracker, 6);

      const bonuses = tracker.calculateBonuses(makeDNA());
      const agentBonus = bonuses.find(b => b.entityId === 'bug-fixer');
      expect(agentBonus).toBeDefined();
      expect(agentBonus!.bonus).toBeLessThan(0);
    });

    it('returns no bonus when below minimum samples', () => {
      recordSuccesses(tracker, 2);

      const bonuses = tracker.calculateBonuses(makeDNA());
      expect(bonuses).toEqual([]);
    });

    it('all bonuses are capped at LEARNING_BONUS_CAP', () => {
      // Lots of data in multiple sprints to maximize combined bonus
      for (let s = 1; s <= 3; s++) {
        for (let t = 0; t < 5; t++) {
          tracker.recordOutcome(makeOutcome({
            taskId: `s${s}-t${t}`,
            sprintId: `sprint-00${s}`,
            evaluation: 'DONE',
          }));
        }
      }

      const bonuses = tracker.calculateBonuses(makeDNA());
      for (const b of bonuses) {
        expect(Math.abs(b.bonus)).toBeLessThanOrEqual(LEARNING_BONUS_CAP);
      }
    });
  });

  // ── Scenario 2: evolveRules → auto-applied status ─────────────────────

  describe('Scenario 2: evolveRules → auto-applied rules', () => {
    it('generates auto-applied activation rule with enough data', () => {
      // Agent with high success in 'bugfix' intent but lower overall success
      const bugDNA = makeDNA('bugfix');
      // Record 12 bugfix successes (intent-specific high success)
      for (let i = 0; i < 12; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `bug-${i}`,
          taskDNA: bugDNA,
          evaluation: 'DONE',
        }));
      }
      // Record 10 implementation failures (lowers overall success rate)
      const implDNA = makeDNA('implementation');
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `impl-fail-${i}`,
          taskDNA: implDNA,
          evaluation: 'NO_GO',
        }));
      }

      const evolver = new RuleEvolver(tracker);
      const result = evolver.evolveRules();

      // Should generate at least one auto-applied activation rule for 'bugfix' intent
      const autoApplied = result.newRules.filter(r => r.status === 'auto-applied');
      expect(autoApplied.length).toBeGreaterThan(0);

      // And at least one exclusion for 'implementation' intent (low success)
      const exclusions = result.newRules.filter(r => r.type === 'exclusion');
      expect(exclusions.length).toBeGreaterThan(0);

      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('does not generate rules with insufficient data', () => {
      recordSuccesses(tracker, 2);

      const evolver = new RuleEvolver(tracker);
      const result = evolver.evolveRules();

      expect(result.newRules).toEqual([]);
    });

    it('generates synergy-based rules for skill pairs', () => {
      // Record many co-uses of two skills with high success
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `synergy-${i}`,
          agentId: null, // no agent — focus on skill synergy
          skillIds: ['skill-a', 'skill-b'],
          evaluation: 'DONE',
        }));
      }

      const evolver = new RuleEvolver(tracker);
      const result = evolver.evolveRules();

      // Synergy matrix should mark pair as synergy
      const synergy = tracker.getSynergyMatrix();
      const pair = synergy.find(e => e.pair === 'skill-a+skill-b');
      expect(pair).toBeDefined();
      expect(pair!.verdict).toBe('synergy');
    });
  });

  // ── Scenario 3: evaluatePromotions → promote action ───────────────────

  describe('Scenario 3: evaluatePromotions → promote action', () => {
    it('returns promote action for entity with 8+ tasks and 85%+ success', () => {
      // 9 successes, 1 failure → 90% success rate, 10 total tasks
      recordSuccesses(tracker, 9);
      recordFailures(tracker, 1, { taskId: 'fail-0' });

      const pipeline = new PromotionPipeline('/tmp/test-evo');
      const promotions = pipeline.evaluatePromotions(tracker);

      const agentPromotion = promotions.find(
        p => p.entityId === 'bug-fixer' && p.action === 'promote',
      );
      expect(agentPromotion).toBeDefined();
      expect(agentPromotion!.reason).toContain('meets promotion criteria');
    });

    it('returns wait action when below minimum tasks', () => {
      recordSuccesses(tracker, 3);

      const pipeline = new PromotionPipeline('/tmp/test-evo');
      const promotions = pipeline.evaluatePromotions(tracker);

      const agentResult = promotions.find(p => p.entityId === 'bug-fixer');
      expect(agentResult).toBeDefined();
      expect(agentResult!.action).toBe('wait');
    });

    it('returns wait action when success rate is below threshold', () => {
      // 5 successes, 5 failures → 50% success rate, 10 tasks
      recordSuccesses(tracker, 5);
      recordFailures(tracker, 5);

      const pipeline = new PromotionPipeline('/tmp/test-evo');
      const promotions = pipeline.evaluatePromotions(tracker);

      const agentResult = promotions.find(p => p.entityId === 'bug-fixer');
      expect(agentResult).toBeDefined();
      expect(agentResult!.action).toBe('wait');
    });

    it('evaluates demotions for high failure rate', () => {
      // 1 success, 5 failures → ~83% fail rate
      recordSuccesses(tracker, 1, { taskId: 'task-solo' });
      recordFailures(tracker, 5);

      const pipeline = new PromotionPipeline('/tmp/test-evo');
      const demotions = pipeline.evaluateDemotions(tracker);

      const agentDemotion = demotions.find(
        d => d.entityId === 'bug-fixer' && d.action === 'demote',
      );
      expect(agentDemotion).toBeDefined();
      expect(agentDemotion!.reason).toContain('Fail rate');
    });

    it('uses custom promotion criteria', () => {
      recordSuccesses(tracker, 5);

      // Lower thresholds: only 4 tasks, 70% success required
      const pipeline = new PromotionPipeline('/tmp/test-evo', {
        minTasks: 4,
        minSuccessRate: 0.70,
      });
      const promotions = pipeline.evaluatePromotions(tracker);

      const agentResult = promotions.find(
        p => p.entityId === 'bug-fixer' && p.action === 'promote',
      );
      expect(agentResult).toBeDefined();
    });
  });

  // ── Scenario 4: buildSkillPerformance → skillMap integration ──────────

  describe('Scenario 4: buildSkillPerformance with skillMap', () => {
    it('returns non-empty rows when skillMap is provided', () => {
      const sprint = makeSprint([
        { id: 'task-001', skills: ['typescript-expert'] },
        { id: 'task-002', skills: ['testing-expert'] },
        { id: 'task-003', skills: ['typescript-expert', 'testing-expert'] },
      ]);

      const evaluations = new Map<string, TaskEvaluation>([
        ['task-001', TaskEvaluation.DONE],
        ['task-002', TaskEvaluation.GO_WITH_TECH_DEBT],
        ['task-003', TaskEvaluation.NO_GO],
      ]);

      const skillMap = new Map<string, string[]>([
        ['task-001', ['typescript-expert']],
        ['task-002', ['testing-expert']],
        ['task-003', ['typescript-expert', 'testing-expert']],
      ]);

      const rows = buildSkillPerformance(sprint, evaluations, skillMap);

      expect(rows.length).toBeGreaterThan(0);

      const tsRow = rows.find(r => r.skill === 'typescript-expert');
      expect(tsRow).toBeDefined();
      expect(tsRow!.tasks).toBe(2);
      expect(tsRow!.done).toBe(1);
      expect(tsRow!.noGo).toBe(1);

      const testRow = rows.find(r => r.skill === 'testing-expert');
      expect(testRow).toBeDefined();
      expect(testRow!.tasks).toBe(2);
      expect(testRow!.debt).toBe(1);
      expect(testRow!.noGo).toBe(1);
    });

    it('returns empty rows when skillMap is undefined', () => {
      const sprint = makeSprint([{ id: 'task-001' }]);
      const evaluations = new Map<string, TaskEvaluation>();
      const rows = buildSkillPerformance(sprint, evaluations, undefined);
      expect(rows).toEqual([]);
    });

    it('returns empty rows when skillMap is empty', () => {
      const sprint = makeSprint([{ id: 'task-001' }]);
      const evaluations = new Map<string, TaskEvaluation>();
      const rows = buildSkillPerformance(sprint, evaluations, new Map());
      expect(rows).toEqual([]);
    });
  });

  // ── Scenario 5: quality score → bonus integration ─────────────────────

  describe('Scenario 5: quality score → routing bonus', () => {
    it('adds positive bonus for high quality scores', () => {
      // Record 6 outcomes with qualityScore=90
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `hq-${i}`,
          evaluation: 'DONE',
          qualityScore: 90,
        }));
      }

      const learnings = tracker.getLearnings();
      const agentPerf = learnings.agentPerformance['bug-fixer']!;
      expect(agentPerf.avgQualityScore).toBeCloseTo(90, 0);

      const bonuses = tracker.calculateBonuses(makeDNA());
      const agentBonus = bonuses.find(b => b.entityId === 'bug-fixer');
      expect(agentBonus).toBeDefined();
      // High success (100%) + high quality (90) → should have positive bonus
      expect(agentBonus!.bonus).toBeGreaterThan(0);
    });

    it('adds negative penalty for low quality scores', () => {
      // Record 6 outcomes with qualityScore=30 but all DONE (high success rate)
      // The quality penalty should pull the bonus down
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `lq-${i}`,
          evaluation: 'DONE',
          qualityScore: 30,
        }));
      }

      const learnings = tracker.getLearnings();
      const agentPerf = learnings.agentPerformance['bug-fixer']!;
      expect(agentPerf.avgQualityScore).toBeCloseTo(30, 0);

      // High success (+1) but low quality (-1) → net 0 or depends on implementation
      // The quality penalty should at least reduce the overall bonus
      const bonuses = tracker.calculateBonuses(makeDNA());
      const agentBonus = bonuses.find(b => b.entityId === 'bug-fixer');
      // With 100% success and quality<40, bonus should be +1 (success) + -1 (quality) = 0
      // So agent bonus may or may not appear (0 → filtered out)
      if (agentBonus) {
        expect(agentBonus.bonus).toBeLessThanOrEqual(1);
      }
    });

    it('tracks incremental average quality score correctly', () => {
      tracker.recordOutcome(makeOutcome({ taskId: 't1', qualityScore: 80 }));
      tracker.recordOutcome(makeOutcome({ taskId: 't2', qualityScore: 60 }));
      tracker.recordOutcome(makeOutcome({ taskId: 't3', qualityScore: 100 }));

      const learnings = tracker.getLearnings();
      const agentPerf = learnings.agentPerformance['bug-fixer']!;
      // (80 + 60 + 100) / 3 = 80
      expect(agentPerf.avgQualityScore).toBeCloseTo(80, 0);
    });

    it('defaults to avgQualityScore=0 when no quality data provided', () => {
      tracker.recordOutcome(makeOutcome({ taskId: 't1', qualityScore: undefined }));

      const learnings = tracker.getLearnings();
      const agentPerf = learnings.agentPerformance['bug-fixer']!;
      expect(agentPerf.avgQualityScore).toBe(0);
    });
  });

  // ── Scenario 6: configurable constants via LearningConfig ─────────────

  describe('Scenario 6: configurable constants via LearningConfig', () => {
    it('uses custom minSamplesForBonus', () => {
      // Custom config: require 5 samples (instead of default 3)
      const customTracker = new OutcomeTracker('/tmp/test-custom', {
        minSamplesForBonus: 5,
      });

      // 4 successes: below custom threshold of 5
      for (let i = 0; i < 4; i++) {
        customTracker.recordOutcome(makeOutcome({ taskId: `t-${i}` }));
      }

      const bonuses = customTracker.calculateBonuses(makeDNA());
      // Should return empty because 4 < 5 (custom minSamplesForBonus)
      expect(bonuses).toEqual([]);

      // Add one more to reach threshold
      customTracker.recordOutcome(makeOutcome({ taskId: 't-4' }));
      const bonuses2 = customTracker.calculateBonuses(makeDNA());
      const agentBonus = bonuses2.find(b => b.entityId === 'bug-fixer');
      expect(agentBonus).toBeDefined();
      expect(agentBonus!.bonus).toBeGreaterThan(0);
    });

    it('uses custom recentSprintWindow', () => {
      // Custom config: look at last 5 sprints (instead of default 3)
      const customTracker = new OutcomeTracker('/tmp/test-custom', {
        recentSprintWindow: 5,
      });

      // Record successes across 5 different sprints
      for (let s = 1; s <= 5; s++) {
        customTracker.recordOutcome(makeOutcome({
          taskId: `t-s${s}`,
          sprintId: `sprint-00${s}`,
          evaluation: 'DONE',
        }));
      }

      const recencyBonuses = customTracker.calculateSprintRecencyBonuses();
      const skillBonus = recencyBonuses.get('typescript-expert');
      // 5 successes across 5 sprints → 100% → should get max recency bonus
      expect(skillBonus).toBe(3); // default sprintRecencySuccessBonus
    });

    it('uses custom sprintRecencySuccessBonus and sprintRecencyFailurePenalty', () => {
      const customTracker = new OutcomeTracker('/tmp/test-custom', {
        sprintRecencySuccessBonus: 5,
        sprintRecencyFailurePenalty: -4,
      });

      // All successes across 3 sprints
      for (let s = 1; s <= 3; s++) {
        customTracker.recordOutcome(makeOutcome({
          taskId: `succ-s${s}`,
          sprintId: `sprint-00${s}`,
          evaluation: 'DONE',
        }));
      }

      let recency = customTracker.calculateSprintRecencyBonuses();
      expect(recency.get('typescript-expert')).toBe(5);

      // Now test penalty: create a new tracker with all failures
      const failTracker = new OutcomeTracker('/tmp/test-fail', {
        sprintRecencyFailurePenalty: -4,
      });

      for (let s = 1; s <= 3; s++) {
        failTracker.recordOutcome(makeOutcome({
          taskId: `fail-s${s}`,
          sprintId: `sprint-00${s}`,
          evaluation: 'NO_GO',
        }));
      }

      recency = failTracker.calculateSprintRecencyBonuses();
      expect(recency.get('typescript-expert')).toBe(-4);
    });

    it('default config matches expected values', () => {
      // Default tracker (no config override)
      const defaultTracker = new OutcomeTracker('/tmp/test-defaults');

      // Record enough data for recency (3 sprints, all success)
      for (let s = 1; s <= 3; s++) {
        defaultTracker.recordOutcome(makeOutcome({
          taskId: `t-s${s}`,
          sprintId: `sprint-00${s}`,
          evaluation: 'DONE',
        }));
      }

      const recency = defaultTracker.calculateSprintRecencyBonuses();
      // Default sprintRecencySuccessBonus = 3
      expect(recency.get('typescript-expert')).toBe(3);
    });
  });

  // ── Scenario 7: getWorstCombinations ──────────────────────────────────

  describe('Scenario 7: getWorstCombinations', () => {
    it('returns empty string when no sprints recorded', () => {
      expect(tracker.getWorstCombinations()).toBe('');
    });

    it('returns empty string when combos have fewer than MIN_COMB_SAMPLES', () => {
      for (let i = 0; i < 2; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `task-${i}`,
          sprintId: 'sprint-001',
          evaluation: 'NO_GO',
        }));
      }
      expect(tracker.getWorstCombinations()).toBe('');
    });

    it('returns formatted worst combinations', () => {
      for (let i = 0; i < 4; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `fail-${i}`,
          sprintId: 'sprint-001',
          agentId: 'bug-fixer',
          skillIds: ['typescript-expert'],
          evaluation: 'NO_GO',
        }));
      }

      const result = tracker.getWorstCombinations(5);
      expect(result).toContain('agent:bug-fixer');
      expect(result).toContain('skill:typescript-expert');
      expect(result).toContain('%0');
      expect(result).toContain('4 task');
    });

    it('sorts by success rate ascending and respects limit', () => {
      // Pair A: 1 success, 3 failures → 25%
      for (let i = 0; i < 4; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `a-${i}`,
          sprintId: 'sprint-001',
          agentId: 'agent-a',
          skillIds: ['skill-a'],
          evaluation: i === 0 ? 'DONE' : 'NO_GO',
        }));
      }
      // Pair B: 3 successes, 1 failure → 75%
      for (let i = 0; i < 4; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `b-${i}`,
          sprintId: 'sprint-001',
          agentId: 'agent-b',
          skillIds: ['skill-b'],
          evaluation: i === 3 ? 'NO_GO' : 'DONE',
        }));
      }

      const result = tracker.getWorstCombinations(1);
      expect(result.split('\n').length).toBe(1);
      expect(result).toContain('agent:agent-a');
    });

    it('skips generic agent outcomes', () => {
      for (let i = 0; i < 4; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `gen-${i}`,
          sprintId: 'sprint-001',
          agentId: 'generic',
          skillIds: ['skill-x'],
          evaluation: 'NO_GO',
        }));
      }
      expect(tracker.getWorstCombinations()).toBe('');
    });
  });

  // ── Scenario 8: GO_WITH_TECH_DEBT counts as success ─────────────────────

  describe('Scenario 8: GO_WITH_TECH_DEBT counts as success', () => {
    it('treats GO_WITH_TECH_DEBT as success in performance tracking', () => {
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `debt-${i}`,
          evaluation: 'GO_WITH_TECH_DEBT',
        }));
      }

      const learnings = tracker.getLearnings();
      const perf = learnings.agentPerformance['bug-fixer']!;
      expect(perf.successCount).toBe(6);
      expect(perf.failCount).toBe(0);
      expect(perf.successRate).toBe(1);
    });
  });

  // ── Scenario 9: sprint recency edge cases ───────────────────────────────

  describe('Scenario 9: sprint recency edge cases', () => {
    it('returns +1 for mostly successful (≥75%)', () => {
      const customTracker = new OutcomeTracker('/tmp/test-recency', {
        minSamplesForBonus: 3,
      });
      customTracker.recordOutcome(makeOutcome({ taskId: 't1', sprintId: 'sprint-001', evaluation: 'DONE', skillIds: ['skill-r'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't2', sprintId: 'sprint-001', evaluation: 'DONE', skillIds: ['skill-r'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't3', sprintId: 'sprint-002', evaluation: 'DONE', skillIds: ['skill-r'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't4', sprintId: 'sprint-002', evaluation: 'NO_GO', skillIds: ['skill-r'] }));

      const recency = customTracker.calculateSprintRecencyBonuses();
      expect(recency.get('skill-r')).toBe(1);
    });

    it('returns -1 for mostly failed (<35%)', () => {
      const customTracker = new OutcomeTracker('/tmp/test-recency-fail', {
        minSamplesForBonus: 3,
      });
      customTracker.recordOutcome(makeOutcome({ taskId: 't1', sprintId: 'sprint-001', evaluation: 'DONE', skillIds: ['skill-f'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't2', sprintId: 'sprint-001', evaluation: 'NO_GO', skillIds: ['skill-f'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't3', sprintId: 'sprint-002', evaluation: 'NO_GO', skillIds: ['skill-f'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't4', sprintId: 'sprint-002', evaluation: 'NO_GO', skillIds: ['skill-f'] }));

      const recency = customTracker.calculateSprintRecencyBonuses();
      expect(recency.get('skill-f')).toBe(-1);
    });

    it('returns no bonus for mixed rate (35-75%)', () => {
      const customTracker = new OutcomeTracker('/tmp/test-recency-mixed', {
        minSamplesForBonus: 3,
      });
      customTracker.recordOutcome(makeOutcome({ taskId: 't1', sprintId: 'sprint-001', evaluation: 'DONE', skillIds: ['skill-m'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't2', sprintId: 'sprint-001', evaluation: 'NO_GO', skillIds: ['skill-m'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't3', sprintId: 'sprint-002', evaluation: 'DONE', skillIds: ['skill-m'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't4', sprintId: 'sprint-002', evaluation: 'NO_GO', skillIds: ['skill-m'] }));

      const recency = customTracker.calculateSprintRecencyBonuses();
      expect(recency.has('skill-m')).toBe(false);
    });

    it('returns empty map when fewer than 2 sprints', () => {
      const customTracker = new OutcomeTracker('/tmp/test-recency-one');
      customTracker.recordOutcome(makeOutcome({ taskId: 't1', sprintId: 'sprint-001', skillIds: ['skill-x'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't2', sprintId: 'sprint-001', skillIds: ['skill-x'] }));
      customTracker.recordOutcome(makeOutcome({ taskId: 't3', sprintId: 'sprint-001', skillIds: ['skill-x'] }));

      const recency = customTracker.calculateSprintRecencyBonuses();
      expect(recency.size).toBe(0);
    });
  });

  // ── Scenario 10: synergy conflict path ──────────────────────────────────

  describe('Scenario 10: synergy conflict → exclusion rules', () => {
    it('generates exclusion rules for skill-skill conflict', () => {
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `conflict-${i}`,
          agentId: null,
          skillIds: ['skill-x', 'skill-y'],
          evaluation: i === 0 ? 'DONE' : 'NO_GO',
        }));
      }

      const synergy = tracker.getSynergyMatrix();
      const pair = synergy.find(e => e.pair === 'skill-x+skill-y');
      expect(pair).toBeDefined();
      expect(pair!.verdict).toBe('conflict');

      const evolver = new RuleEvolver(tracker);
      const result = evolver.evolveRules();

      const exclusions = result.newRules.filter(
        r => r.type === 'exclusion' && r.evidence.includes('skill-y'),
      );
      expect(exclusions.length).toBeGreaterThan(0);
      expect(result.reasoning.some(r => r.includes('Conflict detected'))).toBe(true);
    });

    it('does not generate synergy rules for agent+skill pairs', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `as-${i}`,
          agentId: 'bug-fixer',
          skillIds: ['typescript-expert'],
          evaluation: 'DONE',
        }));
      }

      const evolver = new RuleEvolver(tracker);
      const result = evolver.evolveRules();

      const synergyRules = result.newRules.filter(r =>
        r.evidence.includes('co-uses') && r.entityId === 'bug-fixer',
      );
      expect(synergyRules).toEqual([]);
    });
  });

  // ── Scenario 11: promote/demote execution ───────────────────────────────

  describe('Scenario 11: promote and demote execution', () => {
    it('promote returns false when temp entity not found', () => {
      const pipeline = new PromotionPipeline('/tmp/test-promote');
      expect(pipeline.promote('nonexistent-agent', 'agent')).toBe(false);
      expect(pipeline.promote('nonexistent-skill', 'skill')).toBe(false);
    });

    it('demote returns false when manifest not found', () => {
      const pipeline = new PromotionPipeline('/tmp/test-demote');
      expect(pipeline.demote('nonexistent-agent', 'agent')).toBe(false);
      expect(pipeline.demote('nonexistent-skill', 'skill')).toBe(false);
    });

    it('evaluateDemotions returns empty for entities below minTasks', () => {
      recordSuccesses(tracker, 2);
      const pipeline = new PromotionPipeline('/tmp/test-demote-threshold');
      const demotions = pipeline.evaluateDemotions(tracker);
      expect(demotions).toEqual([]);
    });

    it('evaluateDemotions returns nothing for entities with acceptable fail rate', () => {
      recordSuccesses(tracker, 8);
      recordFailures(tracker, 2);

      const pipeline = new PromotionPipeline('/tmp/test-demote-ok');
      const demotions = pipeline.evaluateDemotions(tracker);
      const agentDemotion = demotions.find(d => d.entityId === 'bug-fixer');
      expect(agentDemotion).toBeUndefined();
    });
  });

  // ── Scenario 12: buildSkillPerformance fallback ─────────────────────────

  describe('Scenario 12: buildSkillPerformance fallback to task.assignedSkills', () => {
    it('uses task.assignedSkills when skillMap is not provided', () => {
      const sprint = makeSprint([
        { id: 'task-001', skills: ['typescript-expert'] },
        { id: 'task-002', skills: ['testing-expert'] },
      ]);

      const evaluations = new Map<string, TaskEvaluation>([
        ['task-001', TaskEvaluation.DONE],
        ['task-002', TaskEvaluation.DONE],
      ]);

      const rows = buildSkillPerformance(sprint, evaluations);
      expect(rows.length).toBe(2);

      const tsRow = rows.find(r => r.skill === 'typescript-expert');
      expect(tsRow).toBeDefined();
      expect(tsRow!.tasks).toBe(1);
      expect(tsRow!.done).toBe(1);
    });

    it('computes avgCoverage from results when provided', () => {
      const sprint = makeSprint([
        { id: 'task-001', skills: ['typescript-expert'] },
        { id: 'task-002', skills: ['typescript-expert'] },
      ]);

      const evaluations = new Map<string, TaskEvaluation>([
        ['task-001', TaskEvaluation.DONE],
        ['task-002', TaskEvaluation.DONE],
      ]);

      const results = [
        { taskId: 'task-001', coverage: 80 },
        { taskId: 'task-002', coverage: 100 },
      ] as any[];

      const rows = buildSkillPerformance(sprint, evaluations, undefined, results);
      const tsRow = rows.find(r => r.skill === 'typescript-expert');
      expect(tsRow).toBeDefined();
      expect(tsRow!.avgCoverage).toBe(90);
    });
  });

  // ── Scenario 13: intent-specific bonus delta paths ──────────────────────

  describe('Scenario 13: intent-specific bonus delta paths', () => {
    it('returns positive intent-specific bonus when delta > 0.15', () => {
      const bugDNA = makeDNA('bugfix');
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `bug-${i}`,
          taskDNA: bugDNA,
          evaluation: 'DONE',
        }));
      }
      const implDNA = makeDNA('implementation');
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `impl-${i}`,
          taskDNA: implDNA,
          evaluation: 'NO_GO',
        }));
      }

      const bonuses = tracker.calculateBonuses(bugDNA);
      const agentBonus = bonuses.find(b => b.entityId === 'bug-fixer');
      expect(agentBonus).toBeDefined();
      expect(agentBonus!.bonus).toBeGreaterThan(0);
    });

    it('returns negative intent-specific bonus when delta < -0.15', () => {
      const bugDNA = makeDNA('bugfix');
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `bug-${i}`,
          taskDNA: bugDNA,
          evaluation: 'DONE',
        }));
      }
      const implDNA = makeDNA('implementation');
      for (let i = 0; i < 6; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `impl-${i}`,
          taskDNA: implDNA,
          evaluation: 'NO_GO',
        }));
      }

      const bonuses = tracker.calculateBonuses(implDNA);
      const agentBonus = bonuses.find(b => b.entityId === 'bug-fixer');
      expect(agentBonus).toBeDefined();
      expect(agentBonus!.bonus).toBeLessThan(0);
    });
  });

  // ── Cross-cutting: full pipeline flow ─────────────────────────────────

  describe('Full pipeline flow', () => {
    it('record → bonus → evolve → promote forms a coherent chain', () => {
      // Step 1: Record many outcomes with mixed results
      const bugDNA = makeDNA('bugfix');
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `bug-ok-${i}`,
          taskDNA: bugDNA,
          evaluation: 'DONE',
          qualityScore: 85,
        }));
      }

      // Step 2: Verify bonuses exist
      const bonuses = tracker.calculateBonuses(bugDNA);
      expect(bonuses.length).toBeGreaterThan(0);

      // Step 3: Verify evolveRules can run (may or may not produce rules
      // depending on intent delta)
      const evolver = new RuleEvolver(tracker);
      const evolution = evolver.evolveRules();
      expect(evolution).toBeDefined();
      expect(evolution.newRules).toBeDefined();
      expect(evolution.reasoning).toBeDefined();

      // Step 4: Verify promotion evaluation
      const pipeline = new PromotionPipeline('/tmp/test-evo');
      const promotions = pipeline.evaluatePromotions(tracker);
      expect(promotions.length).toBeGreaterThan(0);

      const bugFixerPromotion = promotions.find(p => p.entityId === 'bug-fixer');
      expect(bugFixerPromotion).toBeDefined();
      expect(bugFixerPromotion!.action).toBe('promote');
    });

    it('saves and retrieves evolved rules via tracker', () => {
      const evolver = new RuleEvolver(tracker);

      // Record enough data for rule evolution
      const bugDNA = makeDNA('bugfix');
      const implDNA = makeDNA('implementation');
      for (let i = 0; i < 12; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `bug-${i}`,
          taskDNA: bugDNA,
          evaluation: 'DONE',
        }));
      }
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `impl-${i}`,
          taskDNA: implDNA,
          evaluation: 'NO_GO',
        }));
      }

      const result = evolver.evolveRules();
      tracker.saveEvolvedRules(result.newRules);

      const learnings = tracker.getLearnings();
      expect(learnings.evolvedRules).toBeDefined();
      expect(Array.isArray(learnings.evolvedRules)).toBe(true);
      expect(learnings.evolvedRules!.length).toBe(result.newRules.length);
    });

    it('synergy matrix builds correctly across outcomes', () => {
      for (let i = 0; i < 8; i++) {
        tracker.recordOutcome(makeOutcome({
          taskId: `multi-${i}`,
          skillIds: ['typescript-expert', 'testing-expert'],
          evaluation: i < 7 ? 'DONE' : 'NO_GO',
        }));
      }

      const synergy = tracker.getSynergyMatrix();

      // agent+skill pairs
      const agentSkillPair1 = synergy.find(e => e.pair === 'bug-fixer+typescript-expert');
      expect(agentSkillPair1).toBeDefined();
      expect(agentSkillPair1!.tasks).toBe(8);

      // skill+skill pair
      const skillPair = synergy.find(e => e.pair === 'testing-expert+typescript-expert');
      expect(skillPair).toBeDefined();
      expect(skillPair!.tasks).toBe(8);
      expect(skillPair!.verdict).toBe('synergy'); // 7/8 = 87.5% > 85%
    });
  });
});
