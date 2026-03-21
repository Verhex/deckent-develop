import { describe, it, expect } from 'vitest';
import { RecommendationEngine } from '../../../src/cli/helpers/recommendations.js';
import type { RecommendationInput } from '../../../src/cli/helpers/recommendations.js';
import type { SprintMetrics, TaskEvaluation } from '../../../src/core/types.js';

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 5,
    completedTasks: 4,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 60000,
    coveragePercent: 85,
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

function makeInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    metrics: makeMetrics(),
    evaluations: new Map<string, TaskEvaluation | string>([
      ['t1', 'DONE'],
      ['t2', 'DONE'],
    ]),
    agentPerformance: [],
    ...overrides,
  };
}

describe('RecommendationEngine', () => {
  const engine = new RecommendationEngine();

  // ─── NO_GO fix recommendations ────────────────────────────────────

  it('recommends fixing NO_GO tasks', () => {
    const evaluations = new Map<string, TaskEvaluation | string>([
      ['t1', 'DONE'],
      ['t2', 'NO_GO'],
    ]);
    const recs = engine.generate(makeInput({ evaluations }));
    const fixRec = recs.find((r) => r.type === 'fix');
    expect(fixRec).toBeDefined();
    expect(fixRec!.message).toContain('t2');
  });

  it('lists all NO_GO task ids in fix recommendation', () => {
    const evaluations = new Map<string, TaskEvaluation | string>([
      ['t1', 'NO_GO'],
      ['t2', 'NO_GO'],
      ['t3', 'DONE'],
    ]);
    const recs = engine.generate(makeInput({ evaluations }));
    const fixRec = recs.find((r) => r.type === 'fix');
    expect(fixRec!.message).toContain('t1');
    expect(fixRec!.message).toContain('t2');
    expect(fixRec!.message).toContain('2 NO_GO');
  });

  // ─── Tech debt warnings ──────────────────────────────────────────

  it('warns about tech debt tasks', () => {
    const metrics = makeMetrics({ techDebtTasks: 3 });
    const recs = engine.generate(makeInput({ metrics }));
    const debtRec = recs.find((r) => r.type === 'warning');
    expect(debtRec).toBeDefined();
    expect(debtRec!.message).toContain('3 task(s)');
  });

  it('does not warn when no tech debt', () => {
    const recs = engine.generate(makeInput());
    const debtRec = recs.find((r) => r.type === 'warning');
    expect(debtRec).toBeUndefined();
  });

  // ─── Agent suggestions ────────────────────────────────────────────

  it('suggests improvements for underperforming agents', () => {
    const agentPerformance = [
      { agentId: 'slow-agent', totalTasks: 5, doneTasks: 1, techDebtTasks: 1, noGoTasks: 3, successRate: 20 },
    ];
    const recs = engine.generate(makeInput({ agentPerformance }));
    const suggestion = recs.find((r) => r.type === 'suggestion');
    expect(suggestion).toBeDefined();
    expect(suggestion!.message).toContain('slow-agent');
  });

  it('does not suggest when all agents perform well', () => {
    const agentPerformance = [
      { agentId: 'good', totalTasks: 5, doneTasks: 5, techDebtTasks: 0, noGoTasks: 0, successRate: 100 },
    ];
    const recs = engine.generate(makeInput({ agentPerformance }));
    const suggestion = recs.find((r) => r.type === 'suggestion');
    expect(suggestion).toBeUndefined();
  });

  // ─── Coverage regression ──────────────────────────────────────────

  it('flags coverage regression', () => {
    const recs = engine.generate(makeInput({
      metrics: makeMetrics({ coveragePercent: 75 }),
      previousCoverage: 85,
    }));
    const regression = recs.find((r) => r.type === 'regression');
    expect(regression).toBeDefined();
    expect(regression!.message).toContain('10.0%');
  });

  it('does not flag when coverage improves', () => {
    const recs = engine.generate(makeInput({
      metrics: makeMetrics({ coveragePercent: 90 }),
      previousCoverage: 85,
    }));
    const regression = recs.find((r) => r.type === 'regression');
    expect(regression).toBeUndefined();
  });

  it('does not flag when no previous coverage', () => {
    const recs = engine.generate(makeInput());
    const regression = recs.find((r) => r.type === 'regression');
    expect(regression).toBeUndefined();
  });

  // ─── All done success ────────────────────────────────────────────

  it('congratulates when all tasks DONE', () => {
    const evaluations = new Map<string, TaskEvaluation | string>([
      ['t1', 'DONE'],
      ['t2', 'DONE'],
    ]);
    const recs = engine.generate(makeInput({ evaluations }));
    const success = recs.find((r) => r.type === 'success');
    expect(success).toBeDefined();
    expect(success!.message).toContain('successfully');
  });

  it('does not congratulate when there are failures', () => {
    const evaluations = new Map<string, TaskEvaluation | string>([
      ['t1', 'DONE'],
      ['t2', 'NO_GO'],
    ]);
    const recs = engine.generate(makeInput({ evaluations }));
    const success = recs.find((r) => r.type === 'success');
    expect(success).toBeUndefined();
  });

  // ─── Max recommendations ──────────────────────────────────────────

  it('limits to 5 recommendations', () => {
    const evaluations = new Map<string, TaskEvaluation | string>([
      ['t1', 'NO_GO'],
      ['t2', 'GO_WITH_TECH_DEBT'],
    ]);
    const agentPerformance = [
      { agentId: 'bad', totalTasks: 5, doneTasks: 1, techDebtTasks: 0, noGoTasks: 4, successRate: 20 },
    ];
    const recs = engine.generate(makeInput({
      evaluations,
      metrics: makeMetrics({ techDebtTasks: 2, coveragePercent: 70 }),
      previousCoverage: 90,
      agentPerformance,
    }));
    expect(recs.length).toBeLessThanOrEqual(5);
  });

  // ─── Priority ordering ───────────────────────────────────────────

  it('returns NO_GO fixes before tech debt warnings', () => {
    const evaluations = new Map<string, TaskEvaluation | string>([['t1', 'NO_GO']]);
    const metrics = makeMetrics({ techDebtTasks: 1 });
    const recs = engine.generate(makeInput({ evaluations, metrics }));
    const fixIdx = recs.findIndex((r) => r.type === 'fix');
    const warnIdx = recs.findIndex((r) => r.type === 'warning');
    if (fixIdx >= 0 && warnIdx >= 0) {
      expect(fixIdx).toBeLessThan(warnIdx);
    }
  });
});
