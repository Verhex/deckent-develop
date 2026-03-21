import { describe, it, expect } from 'vitest';
import { RichSprintSummary } from '../../../src/cli/helpers/sprint-summary.js';
import type { SprintSummaryData } from '../../../src/cli/helpers/sprint-summary.js';
import { SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { Sprint, TaskResult, TaskEvaluation } from '../../../src/core/types.js';

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-010',
    number: 10,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [],
    workers: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-001',
    workerId: 'w1',
    filesChanged: ['src/main.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: 'All good',
    ...overrides,
  };
}

function makeData(overrides: Partial<SprintSummaryData> = {}): SprintSummaryData {
  return {
    sprint: makeSprint(),
    results: [makeResult()],
    evaluations: new Map<string, TaskEvaluation>([['task-001', 'DONE' as TaskEvaluation]]),
    ...overrides,
  };
}

describe('RichSprintSummary', () => {
  const summary = new RichSprintSummary();

  // ─── renderResultsSection ─────────────────────────────────────────

  describe('renderResultsSection', () => {
    it('includes sprint id and number', () => {
      const output = summary.renderResultsSection(makeData());
      expect(output).toContain('Sprint 10');
      expect(output).toContain('sprint-010');
    });

    it('lists task evaluations', () => {
      const evaluations = new Map<string, TaskEvaluation>([
        ['t1', 'DONE' as TaskEvaluation],
        ['t2', 'NO_GO' as TaskEvaluation],
      ]);
      const output = summary.renderResultsSection(makeData({ evaluations }));
      expect(output).toContain('t1: DONE');
      expect(output).toContain('t2: NO_GO');
    });

    it('shows summary counts', () => {
      const evaluations = new Map<string, TaskEvaluation>([
        ['t1', 'DONE' as TaskEvaluation],
        ['t2', 'GO_WITH_TECH_DEBT' as TaskEvaluation],
        ['t3', 'NO_GO' as TaskEvaluation],
      ]);
      const output = summary.renderResultsSection(makeData({ evaluations }));
      expect(output).toContain('1 DONE');
      expect(output).toContain('1 TECH_DEBT');
      expect(output).toContain('1 NO_GO');
    });

    it('shows all DONE when no failures', () => {
      const evaluations = new Map<string, TaskEvaluation>([
        ['t1', 'DONE' as TaskEvaluation],
        ['t2', 'DONE' as TaskEvaluation],
      ]);
      const output = summary.renderResultsSection(makeData({ evaluations }));
      expect(output).toContain('2 DONE, 0 TECH_DEBT, 0 NO_GO');
    });

    it('contains RESULTS header', () => {
      const output = summary.renderResultsSection(makeData());
      expect(output).toContain('=== RESULTS ===');
    });
  });

  // ─── renderChangesSection ─────────────────────────────────────────

  describe('renderChangesSection', () => {
    it('contains CHANGES header', () => {
      const output = summary.renderChangesSection([makeResult()]);
      expect(output).toContain('=== CHANGES ===');
    });

    it('lists file changes with +/- counts', () => {
      const output = summary.renderChangesSection([makeResult()]);
      expect(output).toContain('src/main.ts');
      expect(output).toContain('+50');
      expect(output).toContain('-10');
    });

    it('shows (new) marker for files with only additions', () => {
      const result = makeResult({ linesAdded: 100, linesRemoved: 0 });
      const output = summary.renderChangesSection([result]);
      expect(output).toContain('(new)');
    });

    it('does not show (new) marker when there are removals', () => {
      const result = makeResult({ linesAdded: 100, linesRemoved: 5 });
      const output = summary.renderChangesSection([result]);
      expect(output).not.toContain('(new)');
    });

    it('limits to 10 files', () => {
      const files = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`);
      const result = makeResult({ filesChanged: files });
      const output = summary.renderChangesSection([result]);
      expect(output).toContain('...and 5 more files');
    });

    it('shows "No file changes recorded" when empty', () => {
      const result = makeResult({ filesChanged: [] });
      const output = summary.renderChangesSection([result]);
      expect(output).toContain('No file changes recorded');
    });

    it('aggregates files from multiple results', () => {
      const r1 = makeResult({ taskId: 't1', filesChanged: ['src/a.ts'], linesAdded: 10, linesRemoved: 2 });
      const r2 = makeResult({ taskId: 't2', filesChanged: ['src/b.ts'], linesAdded: 20, linesRemoved: 5 });
      const output = summary.renderChangesSection([r1, r2]);
      expect(output).toContain('src/a.ts');
      expect(output).toContain('src/b.ts');
    });
  });

  // ─── renderTestsSection ───────────────────────────────────────────

  describe('renderTestsSection', () => {
    it('contains TESTS header', () => {
      const output = summary.renderTestsSection([makeResult()]);
      expect(output).toContain('=== TESTS ===');
    });

    it('shows passing test count', () => {
      const results = [
        makeResult({ testsPassed: true }),
        makeResult({ taskId: 't2', testsPassed: false }),
      ];
      const output = summary.renderTestsSection(results);
      expect(output).toContain('1/2');
    });

    it('shows average coverage', () => {
      const results = [
        makeResult({ coverage: 80 }),
        makeResult({ taskId: 't2', coverage: 90 }),
      ];
      const output = summary.renderTestsSection(results);
      expect(output).toContain('85.0%');
    });

    it('shows 0.0% when no coverage data', () => {
      const results = [makeResult({ coverage: 0 })];
      const output = summary.renderTestsSection(results);
      expect(output).toContain('0.0%');
    });
  });

  // ─── format (full) ────────────────────────────────────────────────

  describe('format', () => {
    it('contains all three sections', () => {
      const output = summary.format(makeData());
      expect(output).toContain('=== RESULTS ===');
      expect(output).toContain('=== CHANGES ===');
      expect(output).toContain('=== TESTS ===');
    });

    it('sections are separated by blank lines', () => {
      const output = summary.format(makeData());
      expect(output).toContain('\n\n');
    });
  });
});
