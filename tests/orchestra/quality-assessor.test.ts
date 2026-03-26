import { describe, it, expect } from 'vitest';
import { assessQuality, assessSkillRelevance } from '../../src/orchestra/quality-assessor.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001', title: 'Test task', description: 'desc', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: '', status: 'DONE',
    sprintId: 'sprint-001',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/a.ts'] },
    dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    assignedAgent: 'test-agent', assignedSkills: ['typescript-expert'],
    ...overrides,
  } as Task;
}

function makeResult(overrides?: Partial<TaskResult>): TaskResult {
  return {
    taskId: '001', filesChanged: ['src/core/a.ts'], linesAdded: 50, linesRemoved: 10,
    testsPassed: true, coverage: 85, selfAssessment: 'DONE', notes: '',
    ...overrides,
  } as TaskResult;
}

describe('quality-assessor', () => {
  describe('assessQuality', () => {
    it('scores DONE task highly', () => {
      const score = assessQuality(makeTask(), makeResult(), 'DONE');
      expect(score.overall).toBeGreaterThanOrEqual(70);
      expect(score.dimensions.correctness).toBe(100);
      expect(score.dimensions.completeness).toBe(100);
    });

    it('scores GO_WITH_TECH_DEBT moderately', () => {
      const score = assessQuality(makeTask(), makeResult(), 'GO_WITH_TECH_DEBT');
      expect(score.overall).toBeGreaterThan(40);
      expect(score.dimensions.correctness).toBe(70);
      expect(score.dimensions.completeness).toBe(75);
    });

    it('scores NO_GO low', () => {
      const score = assessQuality(
        makeTask(),
        makeResult({ testsPassed: false, selfAssessment: 'NO_GO', coverage: 0 }),
        'NO_GO',
      );
      expect(score.overall).toBeLessThan(30);
      expect(score.dimensions.correctness).toBe(0);
      expect(score.dimensions.completeness).toBe(0);
    });

    it('scores high coverage', () => {
      const score = assessQuality(makeTask(), makeResult({ coverage: 95 }), 'DONE');
      expect(score.dimensions.coverage).toBe(95);
    });

    it('detects scope violations', () => {
      const score = assessQuality(
        makeTask(),
        makeResult({ filesChanged: ['src/core/a.ts', 'src/outside/b.ts'] }),
        'DONE',
      );
      expect(score.dimensions.scopeAdherence).toBeLessThan(100);
    });

    it('allows .tasks/ files in scope', () => {
      const score = assessQuality(
        makeTask(),
        makeResult({ filesChanged: ['src/core/a.ts', '.tasks/task-001.result'] }),
        'DONE',
      );
      expect(score.dimensions.scopeAdherence).toBe(100);
    });
  });

  describe('assessSkillRelevance', () => {
    it('returns high relevance for successful task', () => {
      const relevance = assessSkillRelevance(makeTask(), makeResult());
      expect(relevance.get('typescript-expert')).toBeGreaterThan(0.5);
    });

    it('returns low relevance for NO_GO task', () => {
      const relevance = assessSkillRelevance(
        makeTask(),
        makeResult({ selfAssessment: 'NO_GO' }),
      );
      expect(relevance.get('typescript-expert')).toBeLessThan(0.5);
    });

    it('returns empty for no assigned skills', () => {
      const relevance = assessSkillRelevance(
        makeTask({ assignedSkills: [] }),
        makeResult(),
      );
      expect(relevance.size).toBe(0);
    });

    it('boosts typescript skill for .ts files', () => {
      const relevance = assessSkillRelevance(makeTask(), makeResult());
      const score = relevance.get('typescript-expert') ?? 0;
      expect(score).toBeGreaterThan(0.8); // base 0.8 + ts boost
    });

    it('boosts testing skill for test files', () => {
      const relevance = assessSkillRelevance(
        makeTask({ assignedSkills: ['testing-expert'] }),
        makeResult({ filesChanged: ['tests/core/a.test.ts'] }),
      );
      expect(relevance.get('testing-expert')).toBeGreaterThan(0.8);
    });
  });
});
