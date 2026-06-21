/**
 * tests/orchestra/sprint-metrics.test.ts — Sprint Metrics Unit Contract
 *
 * R5-NOGORATE: noGoRate birim tutarlılığı (%-vs-fraction)
 *
 * Bug: calculateMetrics() returned noGoRate as PERCENTAGE (0-100) but all
 * internal consumers (generateConfigSuggestions, buildBrainInsights) treat it
 * as FRACTION (0-1). This caused generateConfigSuggestions to fire for ANY
 * sprint with even 1 NO_GO task (e.g. 1/5 → noGoRate=20, 20>0.5=true).
 *
 * Fix: noGoRate is now stored as FRACTION (0-1). Display consumers multiply
 * by 100 at the call site (already done in buildBrainInsights/content-generators).
 *
 * pre-fix-red / post-fix-green evidence: run these tests against the unpatched
 * source to see them fail, then apply the fix and they pass.
 */

import { describe, it, expect } from 'vitest';
import { calculateMetrics, generateConfigSuggestions } from '../../src/orchestra/sprint-metrics.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, TaskResult, SprintMetrics } from '../../src/core/types.js';

// ─── Minimal Sprint Fixture ────────────────────────────────────────────────

function makeSprintFixture(taskIds: string[]): Sprint {
  return {
    id: 'sprint-test',
    number: 1,
    status: 'completed' as const,
    phase: 'CLEANUP' as const,
    workers: [],
    tasks: taskIds.map(id => ({
      id,
      title: `Task ${id}`,
      description: '',
      model: 'sonnet',
      effort: 'low' as const,
      scope: { directories: [], filesRead: [], filesWrite: [] },
      goNogo: { goCriteria: '', noGoCriteria: '' },
    })) as Sprint['tasks'],
  };
}

function makeMetricsFixture(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 5,
    completedTasks: 5,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 60_000,
    coveragePercent: 80,
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

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('noGoRate unit contract (R5-NOGORATE)', () => {
  describe('calculateMetrics — noGoRate stored as fraction 0-1', () => {
    it('returns noGoRate=0.2 for 1 NO_GO out of 5 tasks (not 20)', () => {
      const sprint = makeSprintFixture(['t1', 't2', 't3', 't4', 't5']);
      const evaluations = new Map([
        ['t1', TaskEvaluation.DONE],
        ['t2', TaskEvaluation.NO_GO],  // 1 NO_GO
        ['t3', TaskEvaluation.DONE],
        ['t4', TaskEvaluation.DONE],
        ['t5', TaskEvaluation.DONE],
      ]);
      const results: TaskResult[] = [];

      const metrics = calculateMetrics(sprint, evaluations, results);

      // Pre-fix: noGoRate = (1/5)*100 = 20 → toBeCloseTo(0.2) FAILS (20 ≠ 0.2)
      // Post-fix: noGoRate = 1/5 = 0.2 → toBeCloseTo(0.2) PASSES
      expect(metrics.noGoRate).toBeCloseTo(0.2);
    });

    it('returns noGoRate=0 when all tasks are DONE', () => {
      const sprint = makeSprintFixture(['t1', 't2']);
      const evaluations = new Map([
        ['t1', TaskEvaluation.DONE],
        ['t2', TaskEvaluation.DONE],
      ]);
      const metrics = calculateMetrics(sprint, evaluations, []);
      expect(metrics.noGoRate).toBe(0);
    });

    it('returns noGoRate=1.0 when all tasks are NO_GO', () => {
      const sprint = makeSprintFixture(['t1', 't2']);
      const evaluations = new Map([
        ['t1', TaskEvaluation.NO_GO],
        ['t2', TaskEvaluation.NO_GO],
      ]);
      const metrics = calculateMetrics(sprint, evaluations, []);
      // Pre-fix: (2/2)*100 = 100 → toBe(1.0) FAILS
      // Post-fix: 2/2 = 1.0 → toBe(1.0) PASSES
      expect(metrics.noGoRate).toBe(1.0);
    });

    it('returns noGoRate=0.6 for 3 NO_GO out of 5 tasks', () => {
      const sprint = makeSprintFixture(['t1', 't2', 't3', 't4', 't5']);
      const evaluations = new Map([
        ['t1', TaskEvaluation.NO_GO],
        ['t2', TaskEvaluation.NO_GO],
        ['t3', TaskEvaluation.NO_GO],
        ['t4', TaskEvaluation.DONE],
        ['t5', TaskEvaluation.DONE],
      ]);
      const metrics = calculateMetrics(sprint, evaluations, []);
      // Pre-fix: (3/5)*100 = 60 → toBeCloseTo(0.6) FAILS
      // Post-fix: 3/5 = 0.6 → toBeCloseTo(0.6) PASSES
      expect(metrics.noGoRate).toBeCloseTo(0.6);
    });
  });

  describe('generateConfigSuggestions — threshold in same unit as noGoRate', () => {
    it('does NOT suggest AI planning for 20% NO_GO rate (0.2 fraction)', () => {
      // 0.2 < 0.5 threshold → no suggestion (correct)
      const suggestions = generateConfigSuggestions({
        metrics: makeMetricsFixture({ noGoRate: 0.2 }),
      });
      const brainSuggestion = suggestions.find(s => s.field === 'brain_planning');
      expect(brainSuggestion).toBeUndefined();
    });

    it('DOES suggest AI planning for 60% NO_GO rate (0.6 fraction)', () => {
      // 0.6 > 0.5 threshold → suggestion fires (correct)
      const suggestions = generateConfigSuggestions({
        metrics: makeMetricsFixture({ noGoRate: 0.6 }),
      });
      const brainSuggestion = suggestions.find(s => s.field === 'brain_planning');
      expect(brainSuggestion).toBeDefined();
      // reason should display percentage, not raw fraction
      expect(brainSuggestion?.reason).toContain('60%');
    });

    it('does NOT suggest AI planning for 0% NO_GO rate (0 fraction)', () => {
      const suggestions = generateConfigSuggestions({
        metrics: makeMetricsFixture({ noGoRate: 0 }),
      });
      const brainSuggestion = suggestions.find(s => s.field === 'brain_planning');
      expect(brainSuggestion).toBeUndefined();
    });
  });

  describe('end-to-end: calculateMetrics → generateConfigSuggestions unit consistency', () => {
    it('20% NO_GO sprint does NOT trigger AI planning suggestion (pre-fix-red)', () => {
      // 1 out of 5 tasks NO_GO = 20%
      const sprint = makeSprintFixture(['t1', 't2', 't3', 't4', 't5']);
      const evaluations = new Map([
        ['t1', TaskEvaluation.DONE],
        ['t2', TaskEvaluation.NO_GO],
        ['t3', TaskEvaluation.DONE],
        ['t4', TaskEvaluation.DONE],
        ['t5', TaskEvaluation.DONE],
      ]);

      const metrics = calculateMetrics(sprint, evaluations, []);
      const suggestions = generateConfigSuggestions({ metrics });

      // Pre-fix: noGoRate=20, threshold 20>0.5=true → suggestion fires → FAILS (should be undefined)
      // Post-fix: noGoRate=0.2, threshold 0.2>0.5=false → no suggestion → PASSES
      const brainSuggestion = suggestions.find(s => s.field === 'brain_planning');
      expect(brainSuggestion).toBeUndefined();
      expect(metrics.noGoRate).toBeCloseTo(0.2);
    });

    it('60% NO_GO sprint triggers AI planning suggestion with percentage display', () => {
      // 3 out of 5 tasks NO_GO = 60%
      const sprint = makeSprintFixture(['t1', 't2', 't3', 't4', 't5']);
      const evaluations = new Map([
        ['t1', TaskEvaluation.NO_GO],
        ['t2', TaskEvaluation.NO_GO],
        ['t3', TaskEvaluation.NO_GO],
        ['t4', TaskEvaluation.DONE],
        ['t5', TaskEvaluation.DONE],
      ]);

      const metrics = calculateMetrics(sprint, evaluations, []);
      const suggestions = generateConfigSuggestions({ metrics });

      // noGoRate should be fraction
      expect(metrics.noGoRate).toBeCloseTo(0.6);
      // suggestion should fire
      const brainSuggestion = suggestions.find(s => s.field === 'brain_planning');
      expect(brainSuggestion).toBeDefined();
      // reason should display "60%" (fraction * 100 formatted)
      expect(brainSuggestion?.reason).toContain('60%');
    });
  });
});

// ─── boundaryViolations from real filesChanged × scope (R5) ──────────────────
describe('calculateMetrics — boundaryViolations counted from results, not hardcoded 0', () => {
  function sprintWithScopedTask(taskId: string, filesWrite: string[]): Sprint {
    return {
      id: 'sprint-bv',
      number: 1,
      status: 'completed' as const,
      phase: 'CLEANUP' as const,
      workers: [],
      tasks: [{
        id: taskId,
        title: `Task ${taskId}`,
        description: '',
        model: 'sonnet',
        effort: 'low' as const,
        scope: { directories: [], filesRead: [], filesWrite },
        goNogo: { goCriteria: '', noGoCriteria: '' },
      }] as Sprint['tasks'],
    };
  }
  function makeResult(taskId: string, filesChanged: string[]): TaskResult {
    return {
      taskId, workerId: 'w1', filesChanged,
      linesAdded: 10, linesRemoved: 0, testsPassed: true, coverage: 80,
      selfAssessment: 'DONE' as TaskResult['selfAssessment'], notes: '',
    };
  }

  it('counts a task that wrote a file outside its filesWrite scope (was hardcoded 0)', () => {
    const sprint = sprintWithScopedTask('t1', ['src/allowed.ts']);
    const evaluations = new Map([['t1', TaskEvaluation.DONE]]);
    const metrics = calculateMetrics(sprint, evaluations, [makeResult('t1', ['src/OUTSIDE.ts'])]);
    // Pre-fix: boundaryViolations hardcoded 0 → toBe(1) FAILS
    expect(metrics.boundaryViolations).toBe(1);
  });

  it('does not count a task that stayed within its filesWrite scope', () => {
    const sprint = sprintWithScopedTask('t1', ['src/allowed.ts']);
    const evaluations = new Map([['t1', TaskEvaluation.DONE]]);
    const metrics = calculateMetrics(sprint, evaluations, [makeResult('t1', ['src/allowed.ts'])]);
    expect(metrics.boundaryViolations).toBe(0);
  });
});
