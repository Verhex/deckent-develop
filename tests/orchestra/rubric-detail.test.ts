/**
 * tests/orchestra/rubric-detail.test.ts
 *
 * Tests for formatRubricScoresSection() — Quality Dimensions table.
 * Updated Sprint 148: aligned to assessQuality() dimensions.
 */

import { describe, it, expect } from 'vitest';
import { formatRubricScoresSection } from '../../src/orchestra/sprint-retro-writer.js';
import { SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test reason',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-135',
    number: 135,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks: [makeTask()],
    workers: ['w-001'],
    startedAt: new Date('2026-04-12T00:00:00.000Z').toISOString(),
    completedAt: new Date('2026-04-12T01:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001',
    workerId: 'w-001',
    filesChanged: ['src/foo.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'Done',
    ...overrides,
  };
}

// ═══ Tests ═════════════════════════════════════════════════════════════

describe('formatRubricScoresSection', () => {
  describe('happy path: full quality dimensions with 2 tasks', () => {
    it('should render markdown table with correct header and row structure', () => {
      const tasks = [
        makeTask({ id: '001', title: 'Sprint Coordinator Resilience' }),
        makeTask({ id: '002', title: 'Auditor HB+Result Reconciliation' }),
      ];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({ taskId: '001', selfAssessment: 'DONE', testsPassed: true, coverage: 90, filesChanged: ['src/foo.ts'] }),
        makeResult({ taskId: '002', selfAssessment: 'DONE', testsPassed: true, coverage: 85, filesChanged: ['src/bar.ts'] }),
      ];

      const lines = formatRubricScoresSection(sprint, results);

      expect(lines.length).toBeGreaterThanOrEqual(5);
      expect(lines[0]).toContain('Quality Dimensions');
      expect(lines[0]).toContain('sprint-135');
      expect(lines[1]).toContain('Correctness');
      expect(lines[1]).toContain('Coverage');
      expect(lines[1]).toContain('Scope Adherence');
      expect(lines[1]).toContain('Completeness');
      expect(lines[1]).toContain('Overall');
      expect(lines[2]).toContain('---');
      expect(lines[3]).toContain('001');
      expect(lines[4]).toContain('002');
    });

    it('should calculate sprint overall average correctly', () => {
      const tasks = [
        makeTask({ id: '001', title: 'Task One' }),
        makeTask({ id: '002', title: 'Task Two' }),
      ];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({ taskId: '001', selfAssessment: 'DONE', testsPassed: true, coverage: 100, filesChanged: ['src/a.ts'] }),
        makeResult({ taskId: '002', selfAssessment: 'DONE', testsPassed: true, coverage: 80, filesChanged: ['src/b.ts'] }),
      ];

      const lines = formatRubricScoresSection(sprint, results);
      const lastLine = lines[lines.length - 1]!;
      expect(lastLine).toContain('**Sprint Avg**');
    });
  });

  describe('edge cases', () => {
    it('should return empty array when results is undefined', () => {
      const sprint = makeSprint();
      const lines = formatRubricScoresSection(sprint, undefined);
      expect(lines).toEqual([]);
    });

    it('should return empty array when results is empty', () => {
      const sprint = makeSprint();
      const lines = formatRubricScoresSection(sprint, []);
      expect(lines).toEqual([]);
    });

    it('should return empty array when no results have matching tasks', () => {
      const sprint = makeSprint({ tasks: [makeTask({ id: 'xxx' })] });
      const results = [makeResult({ taskId: '999' })];
      const lines = formatRubricScoresSection(sprint, results);
      expect(lines).toEqual([]);
    });

    it('should handle result with no matching task in sprint', () => {
      const tasks = [makeTask({ id: '001', title: 'Existing Task' })];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({ taskId: '999', selfAssessment: 'DONE', testsPassed: true, coverage: 85, filesChanged: ['src/x.ts'] }),
      ];

      const lines = formatRubricScoresSection(sprint, results);
      // Result with no matching task is skipped
      expect(lines).toEqual([]);
    });

    it('should correctly filter and include only results with matching tasks', () => {
      const tasks = [
        makeTask({ id: '001', title: 'Task 1' }),
        makeTask({ id: '003', title: 'Task 3' }),
      ];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({ taskId: '001', selfAssessment: 'DONE', testsPassed: true, coverage: 95, filesChanged: ['src/a.ts'] }),
        makeResult({ taskId: '002', selfAssessment: 'DONE', testsPassed: true, coverage: 90, filesChanged: ['src/b.ts'] }), // No matching task
        makeResult({ taskId: '003', selfAssessment: 'GO_WITH_TECH_DEBT', testsPassed: true, coverage: 80, filesChanged: ['src/c.ts'] }),
      ];

      const lines = formatRubricScoresSection(sprint, results);
      // title + header + separator + 2 tasks + sprint avg = 6
      expect(lines.length).toBeGreaterThanOrEqual(5);
      expect(lines[3]).toContain('001');
      expect(lines[4]).toContain('003');
    });
  });

  describe('NO_GO and TECH_DEBT scoring', () => {
    it('should score NO_GO tasks with 0 correctness', () => {
      const tasks = [makeTask({ id: '001', title: 'Failed Task' })];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({ taskId: '001', selfAssessment: 'NO_GO', evaluationDecision: 'NO_GO', testsPassed: false, coverage: 0, filesChanged: ['src/a.ts'] }),
      ];

      const lines = formatRubricScoresSection(sprint, results);
      expect(lines.length).toBeGreaterThanOrEqual(4);
      expect(lines[3]).toContain('001');
      // NO_GO should have low scores
      expect(lines[3]).toContain('| 0 |');
    });

    it('should score GO_WITH_TECH_DEBT with partial correctness', () => {
      const tasks = [makeTask({ id: '001', title: 'Debt Task' })];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({ taskId: '001', selfAssessment: 'GO_WITH_TECH_DEBT', evaluationDecision: 'GO_WITH_TECH_DEBT', testsPassed: true, coverage: 80, filesChanged: ['src/a.ts'] }),
      ];

      const lines = formatRubricScoresSection(sprint, results);
      expect(lines.length).toBeGreaterThanOrEqual(4);
      expect(lines[3]).toContain('001');
      // GO_WITH_TECH_DEBT = 70 correctness
      expect(lines[3]).toContain('| 70 |');
    });
  });
});
