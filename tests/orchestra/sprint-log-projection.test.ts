import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sprintLogUpdater, upsertSprintLog } from '../../src/orchestra/doc-updaters/sprint-log.js';
import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { DocUpdateContext } from '../../src/orchestra/doc-updaters/types.js';
import type { Sprint, SprintMetrics } from '../../src/core/types.js';

// Row 3298 (EK-3): normal finalize invokes the sprint-log updater while the
// sprint status is still RETROSPECTIVE, then terminal authority changes to
// COMPLETE without reconciling the written section; forceAbortSprint publishes
// a fenced ABORTED receipt but never invoked the updater at all. This test
// drives the real doc-updater against a tmpdir log fixture (no fs mocking) to
// prove the fix: exactly one idempotently upserted section per sprint with
// the true terminal status, unrelated sections byte-preserved, atomic write.

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-489', number: 489, status: SprintStatus.RETROSPECTIVE, phase: SprintPhase.RETRO,
    tasks: [
      { id: '489-001', title: 'Task A', description: 'd', model: 'sonnet', effort: 'normal',
        priority: 'NORMAL', reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [], goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
        status: TaskStatus.DONE, sprintId: 'sprint-489' },
    ],
    workers: ['w-1'],
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 30000, coveragePercent: 91.2, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
    ...overrides,
  };
}

function makeCtx(projectRoot: string, sprint: Sprint, metrics: SprintMetrics): DocUpdateContext {
  return {
    projectRoot,
    sprintResult: {
      sprint, metrics,
      evaluations: new Map([['489-001', TaskEvaluation.DONE]]),
    },
    config: {
      mode: 'max_plan' as const, activeModeConfig: {} as any, modes: {} as any,
      language: 'en', projectName: 'test', projectRoot, version: '0.0.0',
      auto_docs: { tier1: true, tier2: false, tier3: false },
    },
    isInternalProject: false,
  };
}

function sprintLogPath(projectRoot: string): string {
  return join(projectRoot, 'docs', 'SPRINT-LOG.md');
}

function readLog(projectRoot: string): string {
  return readFileSync(sprintLogPath(projectRoot), 'utf-8');
}

function tmpFilesInDocsDir(projectRoot: string): string[] {
  return readdirSync(join(projectRoot, 'docs')).filter(f => f.endsWith('.tmp'));
}

describe('sprint log projection (row 3298 — terminal COMPLETE/ABORTED truth)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'sprint-log-projection-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('complete-after-retro: registry pass no-ops while status is RETROSPECTIVE, then terminal upsert writes COMPLETE', () => {
    const sprint = makeSprint({ status: SprintStatus.RETROSPECTIVE, phase: SprintPhase.RETRO });
    const metrics = makeMetrics();
    const ctx = makeCtx(projectRoot, sprint, metrics);

    // Tier-1 registry pass (as run while sprint.status is still RETROSPECTIVE).
    const registryResult = sprintLogUpdater.run(ctx);
    expect(registryResult.updated).toBe(false);
    expect(registryResult.reason).toBe('terminal-status-required');

    // Terminal authority publisher then calls upsertSprintLog explicitly with
    // the genuine terminal status (mirrors publishFinalSprintAuthority).
    sprint.status = SprintStatus.COMPLETE;
    sprint.phase = SprintPhase.COMPLETE;
    const result = upsertSprintLog(
      { projectRoot, sprintResult: { sprint, evaluations: ctx.sprintResult.evaluations, metrics } },
      'COMPLETE',
    );
    expect(result.updated).toBe(true);

    const written = readLog(projectRoot);
    expect(written.match(/^## Sprint 489 — sprint-489$/gm)).toHaveLength(1);
    expect(written).toContain('**Status:** COMPLETE');
    expect(written).not.toContain('**Status:** RETROSPECTIVE');
  });

  it('force-abort: upsertSprintLog(ABORTED) writes the ABORTED section for a sprint that never went through retro', () => {
    const sprint = makeSprint({ id: 'sprint-489', number: 489, status: SprintStatus.ABORTED });
    const metrics = makeMetrics();

    const result = upsertSprintLog(
      { projectRoot, sprintResult: { sprint, evaluations: new Map([['489-001', TaskEvaluation.NO_GO]]), metrics } },
      'ABORTED',
    );
    expect(result.updated).toBe(true);

    const written = readLog(projectRoot);
    expect(written.match(/^## Sprint 489 — sprint-489$/gm)).toHaveLength(1);
    expect(written).toContain('**Status:** ABORTED');
    expect(written).not.toContain('**Status:** COMPLETE');
  });

  it('idempotent on double invocation: exactly one section survives, no duplication', () => {
    const sprint = makeSprint({ status: SprintStatus.COMPLETE });
    const metrics = makeMetrics();
    const input = { projectRoot, sprintResult: { sprint, evaluations: new Map([['489-001', TaskEvaluation.DONE]]), metrics } };

    upsertSprintLog(input, 'COMPLETE');
    upsertSprintLog(input, 'COMPLETE');

    const written = readLog(projectRoot);
    expect(written.match(/^## Sprint 489 — sprint-489$/gm)).toHaveLength(1);
    expect(written.match(/\*\*Status:\*\* COMPLETE/g)).toHaveLength(1);
  });

  it('preserves unrelated sections byte-for-byte across repeated upserts and never becomes settlement authority derivation input', () => {
    const foreignSprint = makeSprint({
      id: 'sprint-002', number: 2, status: SprintStatus.COMPLETE,
      tasks: [], workers: [],
    });
    const foreignMetrics = makeMetrics({ totalTasks: 0, completedTasks: 0 });
    upsertSprintLog(
      { projectRoot, sprintResult: { sprint: foreignSprint, evaluations: new Map(), metrics: foreignMetrics } },
      'COMPLETE',
    );
    const afterForeign = readLog(projectRoot);
    expect(afterForeign).toContain('## Sprint 2 — sprint-002');

    const sprint = makeSprint({ status: SprintStatus.ABORTED });
    const metrics = makeMetrics();
    const input = { projectRoot, sprintResult: { sprint, evaluations: new Map([['489-001', TaskEvaluation.NO_GO]]), metrics } };
    upsertSprintLog(input, 'ABORTED');
    upsertSprintLog(input, 'ABORTED');

    const written = readLog(projectRoot);
    expect(written).toContain('## Sprint 2 — sprint-002');
    // Foreign section content is untouched by the target sprint's writes.
    const foreignSectionStart = written.indexOf('## Sprint 2 — sprint-002');
    const foreignSectionInOriginal = afterForeign.slice(afterForeign.indexOf('## Sprint 2 — sprint-002'));
    expect(written.slice(foreignSectionStart, foreignSectionStart + foreignSectionInOriginal.length))
      .toBe(foreignSectionInOriginal);
    expect(written.match(/^## Sprint 489 — sprint-489$/gm)).toHaveLength(1);
    expect(written).toContain('**Status:** ABORTED');
  });

  it('atomic write: no partial-write temp file is left behind in docs/', () => {
    const sprint = makeSprint({ status: SprintStatus.COMPLETE });
    const metrics = makeMetrics();
    upsertSprintLog(
      { projectRoot, sprintResult: { sprint, evaluations: new Map([['489-001', TaskEvaluation.DONE]]), metrics } },
      'COMPLETE',
    );
    expect(tmpFilesInDocsDir(projectRoot)).toEqual([]);
  });
});
