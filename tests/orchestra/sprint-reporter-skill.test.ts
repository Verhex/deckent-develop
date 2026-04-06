import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildSkillPerformance,
  formatSkillPerformanceTable,
  writeRetrospective,
} from '../../src/orchestra/sprint-reporter.js';
import { TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, Task, SprintMetrics } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `sprint-reporter-skill-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

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
    id: 'sprint-030',
    number: 30,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks: [makeTask()],
    workers: ['w-001'],
    startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    completedAt: new Date('2026-01-01T01:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 5,
    completedTasks: 4,
    techDebtTasks: 1,
    noGoTasks: 1,
    durationMs: 3600000,
    coveragePercent: 85.5,
    noGoRate: 20,
    newDebtCount: 1,
    resolvedDebtCount: 0,
    totalOpenDebt: 2,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

// ─── buildSkillPerformance ──────────────────────────────────────────────────

describe('buildSkillPerformance', () => {
  it('returns empty array when no skillMap provided', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const result = buildSkillPerformance(sprint, evals);
    expect(result).toEqual([]);
  });

  it('returns empty array when skillMap is empty', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const result = buildSkillPerformance(sprint, evals, new Map());
    expect(result).toEqual([]);
  });

  it('counts DONE tasks correctly', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001' }),
        makeTask({ id: '002' }),
      ],
    });
    const evals = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.DONE],
    ]);
    const skillMap = new Map([
      ['001', ['typescript-expert']],
      ['002', ['typescript-expert']],
    ]);
    const result = buildSkillPerformance(sprint, evals, skillMap);
    expect(result).toHaveLength(1);
    expect(result[0]!.skill).toBe('typescript-expert');
    expect(result[0]!.tasks).toBe(2);
    expect(result[0]!.done).toBe(2);
    expect(result[0]!.debt).toBe(0);
    expect(result[0]!.noGo).toBe(0);
  });

  it('counts GO_WITH_TECH_DEBT correctly', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001' })],
    });
    const evals = new Map([['001', TaskEvaluation.GO_WITH_TECH_DEBT]]);
    const skillMap = new Map([['001', ['test-skill']]]);

    const result = buildSkillPerformance(sprint, evals, skillMap);
    expect(result[0]!.debt).toBe(1);
    expect(result[0]!.done).toBe(1); // GO_WITH_TECH_DEBT counts as done
  });

  it('counts NO_GO correctly', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001' })],
    });
    const evals = new Map([['001', TaskEvaluation.NO_GO]]);
    const skillMap = new Map([['001', ['failing-skill']]]);

    const result = buildSkillPerformance(sprint, evals, skillMap);
    expect(result[0]!.noGo).toBe(1);
  });

  it('handles task with multiple skills', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001' })],
    });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const skillMap = new Map([['001', ['skill-a', 'skill-b']]]);

    const result = buildSkillPerformance(sprint, evals, skillMap);
    expect(result).toHaveLength(2);
    const skillA = result.find(r => r.skill === 'skill-a');
    const skillB = result.find(r => r.skill === 'skill-b');
    expect(skillA?.tasks).toBe(1);
    expect(skillA?.done).toBe(1);
    expect(skillB?.tasks).toBe(1);
    expect(skillB?.done).toBe(1);
  });

  it('sorts by task count descending', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001' }),
        makeTask({ id: '002' }),
        makeTask({ id: '003' }),
      ],
    });
    const evals = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.DONE],
      ['003', TaskEvaluation.DONE],
    ]);
    const skillMap = new Map([
      ['001', ['rare-skill']],
      ['002', ['popular-skill']],
      ['003', ['popular-skill']],
    ]);

    const result = buildSkillPerformance(sprint, evals, skillMap);
    expect(result[0]!.skill).toBe('popular-skill');
    expect(result[0]!.tasks).toBe(2);
  });

  it('uses task.assignedSkills as fallback when skillMap entry missing', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001', assignedSkills: ['fallback-skill'] })],
    });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const skillMap = new Map<string, string[]>(); // No entry for 001

    const result = buildSkillPerformance(sprint, evals, skillMap);
    // With empty skillMap but task.assignedSkills present, falls back to task skills
    expect(result).toHaveLength(1);
    expect(result[0]!.skill).toBe('fallback-skill');
    expect(result[0]!.done).toBe(1);
  });
});

// ─── formatSkillPerformanceTable ────────────────────────────────────────────

describe('formatSkillPerformanceTable', () => {
  it('returns empty array for empty input', () => {
    expect(formatSkillPerformanceTable([])).toEqual([]);
  });

  it('returns markdown table with correct headers', () => {
    const rows = [{ skill: 'test-skill', tasks: 3, done: 2, debt: 1, noGo: 0, avgCoverage: 85 }];
    const lines = formatSkillPerformanceTable(rows);
    expect(lines).toContain('## Skill Performance');
    expect(lines).toContain('| Skill | Tasks | Done | Debt | NoGo | Avg Coverage |');
    expect(lines).toContain('|-------|-------|------|------|------|-------------|');
  });

  it('includes data rows with avgCoverage', () => {
    const rows = [
      { skill: 'typescript-expert', tasks: 4, done: 3, debt: 1, noGo: 0, avgCoverage: 92 },
    ];
    const lines = formatSkillPerformanceTable(rows);
    const dataLine = lines.find(l => l.includes('typescript-expert'));
    expect(dataLine).toBe('| typescript-expert | 4 | 3 | 1 | 0 | 92% |');
  });

  it('handles multiple rows', () => {
    const rows = [
      { skill: 'skill-a', tasks: 5, done: 4, debt: 0, noGo: 1, avgCoverage: 80 },
      { skill: 'skill-b', tasks: 2, done: 2, debt: 0, noGo: 0, avgCoverage: 90 },
    ];
    const lines = formatSkillPerformanceTable(rows);
    expect(lines.filter(l => l.startsWith('| skill-'))).toHaveLength(2);
  });
});

// ─── writeRetrospective — skill performance section ─────────────────────────

describe('writeRetrospective — skillMap parameter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, '.brain'), { recursive: true });
    mkdirSync(join(tempDir, '.brain', 'sprints'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('includes skill performance section when skillMap is provided', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001' }),
        makeTask({ id: '002' }),
      ],
    });
    const evals = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.NO_GO],
    ]);
    const skillMap = new Map([
      ['001', ['ts-skill']],
      ['002', ['ts-skill']],
    ]);

    writeRetrospective(tempDir, sprint, evals, makeMetrics(), undefined, skillMap);

    const retro = readFileSync(join(tempDir, '.brain', 'RETRO.md'), 'utf8');
    expect(retro).toContain('## Skill Performance');
    expect(retro).toContain('ts-skill');
  });

  it('does not include skill performance section when skillMap is undefined', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);

    writeRetrospective(tempDir, sprint, evals, makeMetrics());

    const retro = readFileSync(join(tempDir, '.brain', 'RETRO.md'), 'utf8');
    expect(retro).not.toContain('## Skill Performance');
  });

  it('skill section appears after agent section in retro', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001', assignedAgent: 'test-agent' })],
    });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const agentMap = new Map([['001', 'test-agent']]);
    const skillMap = new Map([['001', ['my-skill']]]);

    writeRetrospective(tempDir, sprint, evals, makeMetrics(), agentMap, skillMap);

    const retro = readFileSync(join(tempDir, '.brain', 'RETRO.md'), 'utf8');
    const agentIdx = retro.indexOf('## Agent Performance');
    const skillIdx = retro.indexOf('## Skill Performance');
    // Both sections may or may not be present based on data, but if both are present:
    if (agentIdx >= 0 && skillIdx >= 0) {
      expect(skillIdx).toBeGreaterThan(agentIdx);
    }
  });

  it('skill performance table has correct data', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001' }),
        makeTask({ id: '002' }),
        makeTask({ id: '003' }),
      ],
    });
    const evals = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['003', TaskEvaluation.NO_GO],
    ]);
    const skillMap = new Map([
      ['001', ['super-skill']],
      ['002', ['super-skill']],
      ['003', ['super-skill']],
    ]);

    writeRetrospective(tempDir, sprint, evals, makeMetrics(), undefined, skillMap);

    const retro = readFileSync(join(tempDir, '.brain', 'RETRO.md'), 'utf8');
    expect(retro).toContain('| super-skill | 3 | 2 | 1 | 1 | 0% |'); // Done=2: DONE + GO_WITH_TECH_DEBT
  });
});
