// ─── Rubric System Consolidation Tests ──────────────────────────────────────
// Sprint 146 Task 10: Verify rubric system consolidation —
// Worker self-report removed, Quality Assessor dimensions canonical.

import { describe, it, expect } from 'vitest';
import { buildTaskPrompt, type SprintContext } from '../../src/orchestra/prompt-god-template.js';
import { assessQuality, type QualityScore } from '../../src/orchestra/quality-assessor.js';
import { formatRubricScoresSection } from '../../src/orchestra/sprint-retro-writer.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { Sprint } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '146-010',
    title: 'Test Task',
    description: 'A test task for rubric consolidation.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/core/foo.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '146-010',
    workerId: 'w-146-010',
    filesChanged: ['src/core/foo.ts'],
    linesAdded: 100,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: 'Completed successfully with full test coverage.',
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-146',
    number: 146,
    directives: '',
    tasks,
    status: 'DONE',
    startedAt: new Date().toISOString(),
    metrics: {
      totalTasks: tasks.length,
      completedTasks: tasks.length,
      noGoTasks: 0,
      noGoRate: 0,
      coveragePercent: 85,
      durationMs: 60000,
      boundaryViolations: 0,
      totalOpenDebt: 0,
    },
  } as Sprint;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Rubric System Consolidation', () => {
  // Test 1: Worker prompt'ta rubricScores spec yok
  it('worker prompt should NOT contain rubricScores spec', () => {
    const task = makeTask();
    const ctx: SprintContext = {};
    const artifact = buildTaskPrompt(task, ctx);

    expect(artifact.prompt).not.toContain('rubricScores');
    expect(artifact.prompt).not.toContain('correctness');
    expect(artifact.prompt).not.toContain('test_coverage');
    expect(artifact.prompt).not.toContain('scope_compliance');
  });

  // Test 2: TaskResult rubricScores gelirse @deprecated warning (type-level check)
  it('TaskResult.rubricScores should be accepted but deprecated', () => {
    // This test validates backward compat — old results with rubricScores still parse
    const result = makeResult({
      rubricScores: {
        correctness: 90,
        test_coverage: 85,
        scope_compliance: 100,
        documentation: 70,
      },
    });
    expect(result.rubricScores).toBeDefined();
    expect(result.rubricScores!.correctness).toBe(90);
  });

  // Test 3: assessQuality() evaluates correctly (canonical scoring)
  it('assessQuality() should compute canonical quality dimensions', () => {
    const task = makeTask();
    const result = makeResult();
    const score = assessQuality(task, result, 'DONE');

    expect(score.dimensions.correctness).toBe(100);
    expect(score.dimensions.coverage).toBe(85);
    expect(score.dimensions.scopeAdherence).toBe(100);
    expect(score.dimensions.completeness).toBe(100);
    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  // Test 4: RETRO dimensions uses Quality Assessor
  it('formatRubricScoresSection should use Quality Assessor dimensions', () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);

    const lines = formatRubricScoresSection(sprint, [result]);
    expect(lines.length).toBeGreaterThan(0);

    const header = lines.join('\n');
    // Should use new canonical headers
    expect(header).toContain('Quality Dimensions');
    expect(header).toContain('Correctness');
    expect(header).toContain('Coverage');
    expect(header).toContain('Scope Adherence');
    expect(header).toContain('Completeness');
    expect(header).toContain('Overall');
    // Should NOT contain old header names
    expect(header).not.toContain('Docs');
    expect(header).not.toContain('Rubric Scores');
  });

  // Test 5: Field naming canonical
  it('Quality Assessor dimensions should use canonical field names', () => {
    const task = makeTask();
    const result = makeResult();
    const score = assessQuality(task, result, 'DONE');

    expect(score.dimensions).toHaveProperty('correctness');
    expect(score.dimensions).toHaveProperty('coverage');
    expect(score.dimensions).toHaveProperty('scopeAdherence');
    expect(score.dimensions).toHaveProperty('completeness');
    // Should NOT have old field names
    expect(score.dimensions).not.toHaveProperty('test_coverage');
    expect(score.dimensions).not.toHaveProperty('scope_compliance');
    expect(score.dimensions).not.toHaveProperty('documentation');
  });

  // Test 6: Backward compat — old result with rubricScores parses fine
  it('old results with rubricScores should still be parseable', () => {
    const oldResult: TaskResult = {
      taskId: '145-001',
      workerId: 'w-145-001',
      filesChanged: ['src/core/foo.ts'],
      linesAdded: 50,
      linesRemoved: 5,
      testsPassed: true,
      coverage: 75,
      selfAssessment: 'DONE',
      notes: 'Done.',
      rubricScores: {
        correctness: 88,
        test_coverage: 70,
        scope_compliance: 95,
        documentation: 60,
      },
    };

    // Old result still works — rubricScores field exists but is deprecated
    expect(oldResult.rubricScores).toBeDefined();
    expect(oldResult.rubricScores!.correctness).toBe(88);

    // Quality Assessor still computes its own scores regardless
    const task = makeTask({ id: '145-001' });
    const score = assessQuality(task, oldResult, 'DONE');
    expect(score.overall).toBeGreaterThan(0);
  });

  // Test 7: Quality Assessor result can feed into outcome-tracker pattern
  it('assessQuality result should contain skillRelevance for outcome-tracker', () => {
    const task = makeTask({ assignedSkills: ['typescript-expert'] });
    const result = makeResult();
    const score = assessQuality(task, result, 'DONE');

    expect(score.skillRelevance).toBeInstanceOf(Map);
    expect(score.skillRelevance.size).toBe(1);
    expect(score.skillRelevance.get('typescript-expert')).toBeGreaterThan(0);
  });

  // Test 8: rubricScores olmayan result → Quality Assessor yine hesaplar
  it('assessQuality should work without rubricScores on result', () => {
    const task = makeTask();
    const result = makeResult();
    // No rubricScores — assessQuality should still compute
    expect(result.rubricScores).toBeUndefined();

    const score = assessQuality(task, result, 'DONE');
    expect(score.overall).toBeGreaterThan(0);
    expect(score.dimensions.correctness).toBe(100);
  });

  // Test 9: RETRO table doğru başlıklar
  it('RETRO table should have correct canonical column headers', () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);

    const lines = formatRubricScoresSection(sprint, [result]);
    // Header row
    const headerRow = lines[1]; // second line is header
    expect(headerRow).toContain('Correctness');
    expect(headerRow).toContain('Coverage');
    expect(headerRow).toContain('Scope Adherence');
    expect(headerRow).toContain('Completeness');
    expect(headerRow).toContain('Overall');
  });

  // Test 10: Integration — multiple task evaluate → quality scores
  it('should compute quality scores for multiple tasks in sprint', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        id: `146-${String(i + 1).padStart(3, '0')}`,
        title: `Task ${i + 1}`,
        scope: {
          directories: ['src/core/'],
          filesRead: [],
          filesWrite: [`src/core/file${i}.ts`],
        },
      }),
    );

    const results = tasks.map((t, i) =>
      makeResult({
        taskId: t.id,
        workerId: `w-${t.id}`,
        filesChanged: [`src/core/file${i}.ts`],
        coverage: 70 + i * 5,
        selfAssessment: i === 4 ? 'GO_WITH_TECH_DEBT' : 'DONE',
      }),
    );

    // All results should produce quality scores
    const scores: QualityScore[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const evaluation = results[i]!.selfAssessment === 'GO_WITH_TECH_DEBT'
        ? 'GO_WITH_TECH_DEBT' : 'DONE';
      const score = assessQuality(tasks[i]!, results[i]!, evaluation);
      scores.push(score);
      expect(score.overall).toBeGreaterThan(0);
    }

    // RETRO table should include all tasks
    const sprint = makeSprint(tasks);
    const lines = formatRubricScoresSection(sprint, results);
    expect(lines.length).toBeGreaterThanOrEqual(tasks.length + 3); // header + separator + rows + avg

    // Sprint avg row should exist
    const lastLine = lines[lines.length - 1]!;
    expect(lastLine).toContain('Sprint Avg');
  });
});
