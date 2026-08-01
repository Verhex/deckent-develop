import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import { buildFinalizerTerminalTruth } from '../../src/orchestra/sprint-finalizer.js';

function task(id: string, fixForTaskId?: string): Task {
  return {
    id,
    title: id,
    description: '',
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'terminal truth test',
    provider: 'codex',
    authMode: 'subscription',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'logical truth', noGoCriteria: 'mixed denominator', techDebtAcceptable: 'none' },
    status: 'DONE',
    sprintId: 'sprint-487',
    assignedWorker: `w-${id}`,
    createdAt: '2026-07-31T00:00:00.000Z',
    ...(fixForTaskId ? { fixForTaskId } : {}),
  } as Task;
}

function result(
  taskId: string,
  attemptId: string,
  coverage: number,
  inputTokens: number,
  verified: boolean,
): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [`src/orchestra/${taskId}.ts`],
    linesAdded: 10,
    linesRemoved: 1,
    ...(verified
      ? {
          workAttribution: {
            state: 'VERIFIED' as const,
            attemptId,
            baselineRef: `baseline:${attemptId}`,
            scopeDigest: attemptId.padEnd(64, '0').slice(0, 64),
          },
        }
      : {}),
    testsPassed: true,
    coverage,
    selfAssessment: 'DONE',
    notes: '',
    tokenUsage: {
      inputTokens,
      outputTokens: 2,
      cacheReadTokens: 3,
      provider: 'codex',
      model: 'gpt-5.6-sol',
    },
  };
}

describe('finalizeSprint terminal truth wiring', () => {
  it('folds original and FIX attempts into one finite logical denominator while retaining attempt evidence and lineage usage', () => {
    const tasks = [task('487-001'), task('487-001-fix', '487-001')];
    const evaluations = new Map<string, TaskEvaluation>([
      ['487-001', TaskEvaluation.NO_GO],
      ['487-001-fix', TaskEvaluation.DONE],
    ]);
    const truth = buildFinalizerTerminalTruth({
      tasks,
      evaluations,
      results: [
        result('487-001', 'attempt-original', 20, 10, false),
        result('487-001-fix', 'attempt-fix', 80, 30, true),
      ],
      defaultAuthMode: 'subscription',
    });

    expect(truth.logicalMetrics).toMatchObject({
      totalTasks: 1,
      completedTasks: 1,
      techDebtTasks: 0,
      noGoTasks: 0,
      unevaluatedTasks: 0,
      coveragePercent: 80,
    });
    expect(truth.attempts).toHaveLength(2);
    expect(truth.attempts.map(attempt => attempt.attribution.state)).toEqual([
      'UNAVAILABLE',
      'VERIFIED',
    ]);
    expect(truth.lineageUsage).toHaveLength(1);
    expect(truth.usageTotals).toMatchObject({ inputTokens: 40, outputTokens: 4, cacheRead: 6 });
    expect(Object.values(truth.logicalMetrics).every(Number.isFinite)).toBe(true);

    // 488-002: the canonical root task id must be exposed on its own, and the exact
    // per-attempt identities must be retained — never merged into a single
    // NUL-joined string (the pre-fix composite taskId+NUL+attemptId regression).
    expect(truth.logicalProgress.lineages).toHaveLength(1);
    const [lineage] = truth.logicalProgress.lineages;
    expect(lineage.logicalTaskId).toBe('487-001');
    expect(lineage.attemptIds).toEqual(['487-001', '487-001-fix']);
    const nulChar = String.fromCharCode(0);
    expect(lineage.attemptIds.every(id => !id.includes(nulChar))).toBe(true);
    expect(lineage.logicalTaskId.includes(nulChar)).toBe(false);
  });

  it('returns finite zero metrics for an empty sprint truth', () => {
    const truth = buildFinalizerTerminalTruth({
      tasks: [],
      evaluations: new Map(),
      results: [],
    });

    expect(truth.logicalMetrics.totalTasks).toBe(0);
    expect(truth.logicalMetrics.coveragePercent).toBe(0);
    expect(Object.values(truth.logicalMetrics).every(Number.isFinite)).toBe(true);
  });

  it('wires the producer once into the existing finalizer and feeds KPI, rich output, and job consumers from that truth', () => {
    const source = readFileSync(
      new URL('../../src/orchestra/sprint-finalizer.ts', import.meta.url),
      'utf-8',
    );
    const finalizeSource = source.slice(source.indexOf('export async function finalizeSprint('));

    expect(finalizeSource.match(/buildFinalizerTerminalTruth\(\{/gu)).toHaveLength(1);
    expect(finalizeSource).toContain('terminalTruth.usageTotals,\n  );');
    expect(finalizeSource).toContain('const usageTotals = terminalTruth.usageTotals;');
    expect(finalizeSource).toContain('projectSprintWorkAttribution(logicalResults)');
    expect(finalizeSource).toContain('buildAgentPerformance(attemptedSprint, logicalEvaluations, logicalResults)');
    expect(finalizeSource).toContain('terminalTruth,\n    );');
  });
});
