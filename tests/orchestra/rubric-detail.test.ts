/**
 * tests/orchestra/rubric-detail.test.ts
 *
 * Positive-path tests for formatRubricScoresSection() function.
 * Tests the happy path scenarios: full rubric with multiple tasks,
 * N/A handling, and average calculation correctness.
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
    scope: { directories: [], filesRead: [], filesWrite: [] },
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
  describe('happy path: full rubric with 2 tasks', () => {
    it('should render markdown table with correct header and row structure', () => {
      // Arrange: Create 2 tasks with full rubric scores
      const tasks = [
        makeTask({ id: '001', title: 'Sprint Coordinator Resilience' }),
        makeTask({ id: '002', title: 'Auditor HB+Result Reconciliation' }),
      ];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '001',
          rubricScores: {
            correctness: 100,
            test_coverage: 90,
            scope_compliance: 100,
            documentation: 80,
          },
        }),
        makeResult({
          taskId: '002',
          rubricScores: {
            correctness: 95,
            test_coverage: 85,
            scope_compliance: 95,
            documentation: 90,
          },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: Check header and structure
      expect(lines).toHaveLength(6); // title + header + separator + 2 tasks + sprint avg
      expect(lines[0]).toBe('### Rubric Scores (sprint-135)');
      expect(lines[1]).toBe('| Task | Correctness | Coverage | Scope | Docs | Avg |');
      expect(lines[2]).toBe('|------|-------------|----------|-------|------|-----|');
      expect(lines[3]).toContain('001 — Sprint Coordinator R');
      expect(lines[3]).toContain('| 100 | 90 | 100 | 80 |');
      expect(lines[4]).toContain('002 — Auditor HB+Result R');
      expect(lines[4]).toContain('| 95 | 85 | 95 | 90 |');
      expect(lines[5]).toContain('**Sprint Avg**');
    });

    it('should calculate row averages correctly per task', () => {
      // Arrange: 2 tasks with specific scores for math verification
      const tasks = [
        makeTask({ id: '001', title: 'Task One' }),
        makeTask({ id: '002', title: 'Task Two' }),
      ];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '001',
          rubricScores: {
            correctness: 100,
            test_coverage: 100,
            scope_compliance: 100,
            documentation: 100,
          },
        }),
        makeResult({
          taskId: '002',
          rubricScores: {
            correctness: 0,
            test_coverage: 50,
            scope_compliance: 50,
            documentation: 50,
          },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: Row averages should be 100 and 38 (rounded from 37.5)
      // Task 1: (100+100+100+100)/4 = 100
      // Task 2: (0+50+50+50)/4 = 37.5 → 38 (rounded)
      expect(lines[3]).toContain('| 100 |'); // Task 1 avg
      expect(lines[4]).toContain('| 38 |'); // Task 2 avg (rounded)
    });

    it('should calculate sprint overall average correctly from task averages', () => {
      // Arrange: 4 tasks with specific averages for sprint avg verification
      const tasks = Array.from({ length: 4 }, (_, i) =>
        makeTask({ id: String(i + 1), title: `Task ${i + 1}` }),
      );
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '1',
          rubricScores: {
            correctness: 100,
            test_coverage: 100,
            scope_compliance: 100,
            documentation: 100,
          },
        }),
        makeResult({
          taskId: '2',
          rubricScores: {
            correctness: 0,
            test_coverage: 0,
            scope_compliance: 0,
            documentation: 0,
          },
        }),
        makeResult({
          taskId: '3',
          rubricScores: {
            correctness: 50,
            test_coverage: 50,
            scope_compliance: 50,
            documentation: 50,
          },
        }),
        makeResult({
          taskId: '4',
          rubricScores: {
            correctness: 50,
            test_coverage: 50,
            scope_compliance: 50,
            documentation: 50,
          },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: Sprint avg = (100+0+50+50)/4 = 50
      expect(lines[lines.length - 1]).toContain('**50**');
    });
  });

  describe('N/A handling: partial rubric scores', () => {
    it('should render N/A for missing score fields', () => {
      // Arrange: One task with only some rubric scores defined
      const tasks = [makeTask({ id: '001', title: 'Partial Task' })];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '001',
          rubricScores: {
            correctness: 85,
            test_coverage: undefined, // Missing
            scope_compliance: 90,
            documentation: undefined, // Missing
          },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: N/A should appear for missing fields
      expect(lines[3]).toContain('| 85 | N/A | 90 | N/A |');
    });

    it('should handle row average when some scores are missing', () => {
      // Arrange: Task with 2 defined scores out of 4
      const tasks = [makeTask({ id: '001', title: 'Two Score Task' })];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '001',
          rubricScores: {
            correctness: 100,
            test_coverage: undefined,
            scope_compliance: 100,
            documentation: undefined,
          },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: Avg should be (100+100)/2 = 100 (using only defined values)
      expect(lines[3]).toContain('| 100 |');
    });

    it('should handle all N/A scores correctly', () => {
      // Arrange: Task with all undefined scores
      const tasks = [makeTask({ id: '001', title: 'All NA Task' })];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '001',
          rubricScores: {
            correctness: undefined,
            test_coverage: undefined,
            scope_compliance: undefined,
            documentation: undefined,
          },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: All cells N/A, task row avg N/A, no sprint avg line
      expect(lines[3]).toContain('| N/A | N/A | N/A | N/A | N/A |');
      expect(lines.length).toBe(4); // title + header + separator + 1 task (no sprint avg)
    });
  });

  describe('edge cases', () => {
    it('should return empty array when results is undefined', () => {
      // Arrange: No results
      const sprint = makeSprint();

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, undefined);

      // Assert: Empty array
      expect(lines).toEqual([]);
    });

    it('should return empty array when results is empty', () => {
      // Arrange: Empty results array
      const sprint = makeSprint();

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, []);

      // Assert: Empty array
      expect(lines).toEqual([]);
    });

    it('should return empty array when no results have rubric scores', () => {
      // Arrange: Results without rubric scores
      const sprint = makeSprint();
      const results = [
        makeResult({ taskId: '001' }), // No rubricScores
        makeResult({ taskId: '002', rubricScores: {} }), // Empty rubricScores
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: Empty array
      expect(lines).toEqual([]);
    });

    it('should handle task title truncation to 30 chars', () => {
      // Arrange: Task with long title (>30 chars)
      const longTitle = 'This is a very long task title that exceeds thirty characters';
      const tasks = [makeTask({ id: '001', title: longTitle })];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '001',
          rubricScores: { correctness: 85, test_coverage: 90, scope_compliance: 80, documentation: 75 },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: Title should be truncated to 30 chars
      expect(lines[3]).toContain('001 — This is a very long task');
      expect(lines[3]).not.toContain('exceeds');
    });

    it('should handle result with no matching task in sprint', () => {
      // Arrange: Result references non-existent task
      const tasks = [makeTask({ id: '001', title: 'Existing Task' })];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '999', // Does not exist in sprint
          rubricScores: { correctness: 85, test_coverage: 90, scope_compliance: 80, documentation: 75 },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: Should use taskId only as label
      expect(lines[3]).toContain('| 999 |');
    });

    it('should correctly filter and include only results with rubric scores', () => {
      // Arrange: Mix of results with and without rubric scores
      const tasks = [
        makeTask({ id: '001', title: 'Task 1' }),
        makeTask({ id: '002', title: 'Task 2' }),
        makeTask({ id: '003', title: 'Task 3' }),
      ];
      const sprint = makeSprint({ tasks });
      const results = [
        makeResult({
          taskId: '001',
          rubricScores: { correctness: 100, test_coverage: 100, scope_compliance: 100, documentation: 100 },
        }),
        makeResult({ taskId: '002' }), // No rubric scores — should be excluded
        makeResult({
          taskId: '003',
          rubricScores: { correctness: 90, test_coverage: 85, scope_compliance: 95, documentation: 80 },
        }),
      ];

      // Act: Format the section
      const lines = formatRubricScoresSection(sprint, results);

      // Assert: Only 2 tasks with rubric scores should be included
      expect(lines).toHaveLength(6); // title + header + separator + 2 tasks + sprint avg
      expect(lines[3]).toContain('001');
      expect(lines[4]).toContain('003');
    });
  });
});
