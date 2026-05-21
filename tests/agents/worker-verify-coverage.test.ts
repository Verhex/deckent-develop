// Sprint 180 W4-1 — Worker .result coverage zorunluluk
// TDD red→green: vitest --coverage --reporter=json-summary parse + escape hatch
// proof that Sprint 179's 9-task TECH_DEBT pattern no longer reproduces.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseCoverageSummary,
  validateCoverageNumber,
} from '../../src/agents/worker-verify.js';
import { assessQuality, isCoverageEscapeHatchTask } from '../../src/orchestra/quality-assessor.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

vi.mock('../../src/core/stack-detector.js', () => ({
  detectFullStack: vi.fn(() => ({
    language: 'typescript',
    buildTool: 'tsc',
    commands: { build: 'npx tsc', test: 'npx vitest run' },
  })),
  STACK_COMMANDS: {
    typescript: { build: 'npx tsc', test: 'npx vitest run' },
  },
}));

vi.mock('../../src/agents/worker.js', () => ({
  createHeartbeat: vi.fn(),
  writeHeartbeat: vi.fn(),
}));

function makeDocTask(overrides?: Partial<Task>): Task {
  return {
    id: 'cov-doc', title: 'doc only', description: '', model: 'haiku',
    effort: 'low', priority: 'NORMAL', reason: '', status: 'DONE',
    sprintId: 'sprint-180',
    scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/foo.md'] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    assignedAgent: 'doc-writer',
    assignedSkills: ['documentation-writer'],
    ...overrides,
  } as Task;
}

function makeCodeTask(overrides?: Partial<Task>): Task {
  return {
    id: 'cov-code', title: 'code', description: '', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: '', status: 'DONE',
    sprintId: 'sprint-180',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/a.ts'] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    assignedAgent: 'bug-fixer',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  } as Task;
}

function makeResult(overrides?: Partial<TaskResult>): TaskResult {
  return {
    taskId: 'cov-code', workerId: 'w', filesChanged: ['src/core/a.ts'],
    linesAdded: 30, linesRemoved: 5, testsPassed: true, coverage: 85,
    selfAssessment: 'DONE', notes: '',
    ...overrides,
  } as TaskResult;
}

describe('worker-verify coverage parse (Sprint 180 W4-1)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-cov-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('Test #1 — parses real coverage-summary.json (total.lines.pct → number)', () => {
    // Arrange: write a realistic vitest coverage-summary.json fixture.
    mkdirSync(join(tmpRoot, 'coverage'), { recursive: true });
    const summary = {
      total: {
        lines: { total: 200, covered: 168, skipped: 0, pct: 84.0 },
        statements: { total: 210, covered: 180, skipped: 0, pct: 85.7 },
        functions: { total: 40, covered: 32, skipped: 0, pct: 80.0 },
        branches: { total: 50, covered: 38, skipped: 0, pct: 76.0 },
      },
    };
    writeFileSync(
      join(tmpRoot, 'coverage', 'coverage-summary.json'),
      JSON.stringify(summary),
      'utf-8',
    );

    // Act
    const coverage = parseCoverageSummary(tmpRoot);

    // Assert
    expect(coverage).toBe(84.0);
    expect(validateCoverageNumber(coverage)).toBe(true);
  });

  it('Test #2 — rejects (returns null) when coverage-summary.json is missing or malformed', () => {
    // Case A: no coverage directory at all → null
    expect(parseCoverageSummary(tmpRoot)).toBeNull();

    // Case B: malformed JSON → null (no throw)
    mkdirSync(join(tmpRoot, 'coverage'), { recursive: true });
    writeFileSync(join(tmpRoot, 'coverage', 'coverage-summary.json'), '{not json', 'utf-8');
    expect(parseCoverageSummary(tmpRoot)).toBeNull();

    // Case C: valid JSON but missing total.lines.pct → null
    writeFileSync(
      join(tmpRoot, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { lines: {} } }),
      'utf-8',
    );
    expect(parseCoverageSummary(tmpRoot)).toBeNull();

    // validateCoverageNumber gate: null/0 must read as "unmeasured"
    expect(validateCoverageNumber(null)).toBe(false);
    expect(validateCoverageNumber(0)).toBe(false);
    expect(validateCoverageNumber(undefined)).toBe(false);
    expect(validateCoverageNumber(0.1)).toBe(true);
  });
});

describe('quality-assessor coverage escape hatch (Sprint 180 W4-1)', () => {
  it('Test #3 — doc/audit task with coverage=null gets unmeasured partial credit + 90 ceiling', () => {
    // Doc-only scope with no real coverage measurement.
    const task = makeDocTask();
    expect(isCoverageEscapeHatchTask(task)).toBe(true);

    const result = makeResult({
      taskId: 'cov-doc',
      filesChanged: ['docs/foo.md'],
      coverage: 0, // worker recorded "unmeasured" as 0 — pre-Sprint-180 bug shape
      selfAssessment: 'DONE',
    });

    const score = assessQuality(task, result, 'DONE');

    // Coverage dimension is partial-credit (70), NOT 0.
    expect(score.dimensions.coverage).toBe(70);
    // Overall is clamped to the 90 ceiling — no false-confidence even when
    // all other dimensions are 100/100.
    expect(score.overall).toBeLessThanOrEqual(90);
    // Critically, overall MUST clear the Sprint 179 ~75 TECH_DEBT threshold.
    expect(score.overall).toBeGreaterThan(75);
  });

  it('Test #4 — Sprint 179 9-task TECH_DEBT pattern does NOT reproduce + code tasks still penalised', () => {
    // Quality Scorer integration: reproduce the exact Sprint 179 shape
    // (doc task, coverage=0, DONE evaluation) and verify it now scores
    // ABOVE the demotion threshold instead of landing at ~75.
    const docTask = makeDocTask();
    const docResult = makeResult({
      taskId: 'cov-doc',
      filesChanged: ['docs/foo.md'],
      coverage: 0,
      selfAssessment: 'DONE',
    });
    const docScore = assessQuality(docTask, docResult, 'DONE');
    // Sprint 179 reproduce-guard: overall must NOT collapse to the
    // ~75 TECH_DEBT zone — that was the regression we are fixing.
    expect(docScore.overall).toBeGreaterThanOrEqual(85);
    expect(docScore.overall).toBeLessThanOrEqual(90);

    // Inverse guarantee: a real code task with coverage=0 must STILL be
    // penalised — the escape hatch is not a blanket waiver.
    const codeTask = makeCodeTask();
    expect(isCoverageEscapeHatchTask(codeTask)).toBe(false);
    const codeResult = makeResult({ coverage: 0 });
    const codeScore = assessQuality(codeTask, codeResult, 'DONE');
    expect(codeScore.dimensions.coverage).toBe(0);
    expect(codeScore.overall).toBeLessThan(80);

    // And: real coverage on a code task still scales normally.
    const measuredResult = makeResult({ coverage: 92 });
    const measuredScore = assessQuality(codeTask, measuredResult, 'DONE');
    expect(measuredScore.dimensions.coverage).toBe(92);
    expect(measuredScore.overall).toBeGreaterThan(90);
  });
});
